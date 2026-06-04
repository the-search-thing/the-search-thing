use serde_json::json;
use serde_json::Value;
use std::io;
use std::io::BufRead;
use std::io::Write;

use sidecar::protocol::err_response;
use sidecar::protocol::JsonRpcError;
use sidecar::protocol::JsonRpcRequest;
use sidecar::protocol::JsonRpcResponse;
use the_search_thing::sidecar;

fn handle_request(request: JsonRpcRequest) -> JsonRpcResponse {
    if request.jsonrpc != "2.0" {
        return err_response(request.id, -32600, "Invalid Request", None);
    }

    match request.method.as_str() {
        "health.ping" => sidecar::rpc::health::handle(request.id),
        "fs.walkTextBatch" | "fs.walk_text_batch" => {
            sidecar::rpc::fs::handle_walk_text_batch(&request)
        }
        "index.start" => sidecar::rpc::index::handle_start(&request),
        "index.status" => sidecar::rpc::index::handle_status(&request),
        "index.clear" => sidecar::rpc::index::handle_clear(&request),
        "search.query" => sidecar::rpc::search::handle_query(&request),
        _ => err_response(
            request.id,
            -32601,
            "Method not found",
            Some(json!({ "method": request.method })),
        ),
    }
}

fn write_response(stdout: &mut io::StdoutLock<'_>, response: JsonRpcResponse) -> io::Result<()> {
    let serialized = serde_json::to_string(&response).map_err(io::Error::other)?;
    stdout.write_all(serialized.as_bytes())?;
    stdout.write_all(b"\n")?;
    stdout.flush()
}

fn load_repo_env_files() {
    // Like Next/Vite: `.env.local` wins over `.env`. `dotenv` only sets vars that are not
    // already present, so load local-first then `.env` fills defaults without overwriting locals.
    let _ = dotenv::from_filename(".env.local");
    let _ = dotenv::dotenv();
}

fn main() {
    load_repo_env_files();

    if std::env::var("THE_SEARCH_THING_IPC_MODE")
        .map(|v| v == "native")
        .unwrap_or(false)
    {
        if let Err(e) = sidecar::native_ipc::run_stdio_loop() {
            eprintln!("[sidecar:native] fatal: {e}");
            std::process::exit(1);
        }
        return;
    }

    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();

    for line_result in stdin.lock().lines() {
        let line = match line_result {
            Ok(line) => line,
            Err(_) => break,
        };

        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let response = match serde_json::from_str::<JsonRpcRequest>(trimmed) {
            Ok(request) => handle_request(request),
            Err(error) => JsonRpcResponse {
                jsonrpc: "2.0",
                id: Value::Null,
                result: None,
                error: Some(JsonRpcError {
                    code: -32700,
                    message: "Parse error".to_string(),
                    data: Some(json!({ "reason": error.to_string() })),
                }),
            },
        };

        if write_response(&mut stdout, response).is_err() {
            break;
        }
    }
}
