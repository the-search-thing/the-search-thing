use serde_json::{json, Value};
use std::env;

pub fn backend_base_url() -> String {
    env::var("SIDECAR_PYTHON_BACKEND_URL").unwrap_or_else(|_| "http://127.0.0.1:8000".to_string())
}

fn map_http_error_to_rpc(error: ureq::Error) -> (i32, String) {
    match error {
        ureq::Error::Status(404, _) => (-32004, "Job not found".to_string()),
        ureq::Error::Status(code, response) => {
            let body = response
                .into_string()
                .unwrap_or_else(|_| "unable to read error body".to_string());
            (
                -32000,
                format!("Backend returned HTTP {}: {}", code, body.trim()),
            )
        }
        ureq::Error::Transport(transport) => (
            -32001,
            format!(
                "Backend transport error: {} (is FastAPI running on {}?)",
                transport,
                backend_base_url()
            ),
        ),
    }
}

pub fn proxy_index_start(dir: &str) -> Result<Value, (i32, String)> {
    let url = format!("{}/api/index", backend_base_url());
    let response = ureq::get(&url)
        .query("dir", dir)
        .call()
        .map_err(map_http_error_to_rpc)?;

    let body = response
        .into_string()
        .map_err(|e| (-32603, format!("Failed reading backend response: {}", e)))?;
    let parsed: Value = serde_json::from_str(&body)
        .map_err(|e| (-32603, format!("Invalid backend JSON: {}", e)))?;

    let success = parsed
        .get("success")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let job_id = parsed
        .get("job_id")
        .and_then(Value::as_str)
        .unwrap_or_default();

    if !success || job_id.is_empty() {
        return Err((
            -32603,
            format!(
                "Backend returned unexpected index start payload: {}",
                parsed
            ),
        ));
    }

    Ok(json!({
        "success": success,
        "job_id": job_id,
    }))
}

pub fn proxy_index_status(job_id: &str) -> Result<Value, (i32, String)> {
    let url = format!("{}/api/index/status", backend_base_url());
    let response = ureq::get(&url)
        .query("job_id", job_id)
        .call()
        .map_err(map_http_error_to_rpc)?;

    let body = response
        .into_string()
        .map_err(|e| (-32603, format!("Failed reading backend response: {}", e)))?;
    serde_json::from_str::<Value>(&body)
        .map_err(|e| (-32603, format!("Invalid backend JSON: {}", e)))
}

pub fn proxy_search_query(query: &str) -> Result<Value, (i32, String)> {
    let url = format!("{}/api/search", backend_base_url());
    let response = ureq::get(&url)
        .query("q", query)
        .call()
        .map_err(map_http_error_to_rpc)?;

    let body = response
        .into_string()
        .map_err(|e| (-32603, format!("Failed reading backend response: {}", e)))?;
    let parsed: Value = serde_json::from_str(&body)
        .map_err(|e| (-32603, format!("Invalid backend JSON: {}", e)))?;

    if !parsed.is_object() {
        return Err((
            -32603,
            format!("Backend returned unexpected search payload: {}", parsed),
        ));
    }

    Ok(parsed)
}
