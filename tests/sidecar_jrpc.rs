use serde_json::{json, Value};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

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
