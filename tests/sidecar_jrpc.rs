use serde_json::{json, Value};
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

struct MockBackend {
    base_url: String,
    join_handle: Option<thread::JoinHandle<()>>,
}

impl MockBackend {
    fn start(expected_requests: usize) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock backend");
        let address = listener.local_addr().expect("mock backend addr");
        let base_url = format!("http://127.0.0.1:{}", address.port());

        let join_handle = thread::spawn(move || {
            for _ in 0..expected_requests {
                let (mut stream, _) = listener.accept().expect("accept request");

                let mut request_buf = Vec::new();
                let mut chunk = [0_u8; 1024];
                loop {
                    let bytes = stream.read(&mut chunk).expect("read request");
                    if bytes == 0 {
                        break;
                    }
                    request_buf.extend_from_slice(&chunk[..bytes]);
                    if request_buf.windows(4).any(|w| w == b"\r\n\r\n") {
                        break;
                    }
                }

                let request_text = String::from_utf8_lossy(&request_buf);
                let request_line = request_text.lines().next().unwrap_or_default().to_string();

                let (status, body) = if request_line.starts_with("GET /api/index?") {
                    (
                        200,
                        r#"{"success":true,"job_id":"job-test-123"}"#.to_string(),
                    )
                } else if request_line.starts_with("GET /api/index/status?") {
                    (
                        200,
                        r#"{"job_id":"job-test-123","dir":"C:/repo","status":"completed","phase":"done","batch_size":200,"text_found":2,"text_indexed":2,"text_errors":0,"text_skipped":0,"video_found":0,"video_indexed":0,"video_errors":0,"video_skipped":0,"image_found":0,"image_indexed":0,"image_errors":0,"image_skipped":0,"message":"done","error":"","started_at":"1","updated_at":"2","finished_at":"3"}"#.to_string(),
                    )
                } else if request_line.starts_with("GET /api/search?") {
                    (
                        200,
                        r#"{"results":[{"label":"file","content":"hello","path":"C:/repo/a.txt"}]}"#.to_string(),
                    )
                } else {
                    (404, r#"{"detail":"not found"}"#.to_string())
                };

                let response = format!(
                    "HTTP/1.1 {} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    status,
                    body.len(),
                    body
                );

                stream
                    .write_all(response.as_bytes())
                    .expect("write response");
                stream.flush().expect("flush response");
            }
        });

        Self {
            base_url,
            join_handle: Some(join_handle),
        }
    }
}

impl Drop for MockBackend {
    fn drop(&mut self) {
        if let Some(handle) = self.join_handle.take() {
            let _ = handle.join();
        }
    }
}

fn sidecar_bin() -> &'static str {
    env!("CARGO_BIN_EXE_the-search-thing-sidecar")
}

fn run_sidecar_requests(requests: &[Value], envs: &[(&str, &str)]) -> Vec<Value> {
    let mut cmd = Command::new(sidecar_bin());
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());

    for (key, value) in envs {
        cmd.env(key, value);
    }

    let mut child = cmd.spawn().expect("spawn sidecar");

    {
        let mut stdin = child.stdin.take().expect("sidecar stdin");
        for req in requests {
            let line = serde_json::to_string(req).expect("serialize request");
            stdin.write_all(line.as_bytes()).expect("write request");
            stdin.write_all(b"\n").expect("write newline");
        }
    }

    let output = child.wait_with_output().expect("wait sidecar");
    assert!(output.status.success(), "sidecar exited non-zero");

    let reader = BufReader::new(output.stdout.as_slice());
    reader
        .lines()
        .map(|line| line.expect("stdout line"))
        .filter(|line| !line.trim().is_empty())
        .map(|line| serde_json::from_str::<Value>(&line).expect("parse response json"))
        .collect()
}

fn make_temp_dir(name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time")
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("sidecar-jrpc-{}-{}", name, nanos));
    fs::create_dir_all(&dir).expect("create temp dir");
    dir
}

#[test]
fn jrpc_health_ping_returns_ok() {
    let req = json!({"jsonrpc":"2.0","id":1,"method":"health.ping"});
    let responses = run_sidecar_requests(&[req], &[]);

    let result = responses[0].get("result").expect("result object");
    assert_eq!(result.get("ok"), Some(&Value::Bool(true)));
    assert_eq!(
        result.get("service"),
        Some(&Value::String("the-search-thing-sidecar".to_string()))
    );
}

#[test]
fn jrpc_fs_walk_text_batch_returns_expected_batch() {
    let dir = make_temp_dir("walk");
    fs::write(dir.join("one.txt"), "alpha").expect("write text file");
    fs::write(dir.join("two.md"), "beta").expect("write md file");
    fs::write(dir.join("ignore.bin"), [0_u8, 1, 2, 3]).expect("write binary file");

    let req = json!({
      "jsonrpc":"2.0",
      "id":2,
      "method":"fs.walkTextBatch",
      "params":{
        "dir":dir.to_string_lossy().to_string(),
        "textExts":[".txt", ".md"],
        "ignoreExts":[".bin"],
        "ignoreFiles":[],
        "cursor":0,
        "batchSize":10
      }
    });

    let responses = run_sidecar_requests(&[req], &[]);
    let result = responses[0].get("result").expect("result object");

    let batch = result
        .get("batch")
        .and_then(Value::as_array)
        .expect("batch array");
    assert!(batch.len() >= 2);
    assert_eq!(result.get("done"), Some(&Value::Bool(true)));
}

#[test]
fn jrpc_index_start_and_status_use_python_proxy_contract() {
    let backend = MockBackend::start(2);

    let index_start_req = json!({
      "jsonrpc":"2.0",
      "id":3,
      "method":"index.start",
      "params":{"dir":"C:/repo"}
    });
    let index_status_req = json!({
      "jsonrpc":"2.0",
      "id":4,
      "method":"index.status",
      "params":{"job_id":"job-test-123"}
    });

    let responses = run_sidecar_requests(
        &[index_start_req, index_status_req],
        &[
            ("SIDECAR_PYTHON_BACKEND_URL", backend.base_url.as_str()),
            ("SIDECAR_INDEX_MODE", "python-proxy"),
        ],
    );

    let start_result = responses[0].get("result").expect("index start result");
    assert_eq!(start_result.get("success"), Some(&Value::Bool(true)));
    assert_eq!(
        start_result.get("job_id"),
        Some(&Value::String("job-test-123".to_string()))
    );

    let status_result = responses[1].get("result").expect("index status result");
    assert_eq!(
        status_result.get("job_id"),
        Some(&Value::String("job-test-123".to_string()))
    );
    assert_eq!(
        status_result.get("status"),
        Some(&Value::String("completed".to_string()))
    );
}

#[test]
fn jrpc_search_query_python_proxy_returns_results() {
    let backend = MockBackend::start(1);
    let req = json!({
      "jsonrpc":"2.0",
      "id":5,
      "method":"search.query",
      "params":{"q":"hello"}
    });

    let responses = run_sidecar_requests(
        &[req],
        &[
            ("SIDECAR_PYTHON_BACKEND_URL", backend.base_url.as_str()),
            ("SIDECAR_SEARCH_MODE", "python-proxy"),
        ],
    );

    let result = responses[0].get("result").expect("search result");
    let results = result
        .get("results")
        .and_then(Value::as_array)
        .expect("results array");
    assert_eq!(results.len(), 1);
    assert_eq!(
        results[0].get("label"),
        Some(&Value::String("file".to_string()))
    );
}
