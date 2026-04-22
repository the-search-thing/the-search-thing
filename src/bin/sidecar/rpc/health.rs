use serde_json::json;
use std::env;

use crate::sidecar::backend_proxy::backend_base_url;
use crate::sidecar::protocol::{ok_response, JsonRpcResponse};

pub fn handle(id: serde_json::Value) -> JsonRpcResponse {
    let index_mode = env::var("SIDECAR_INDEX_MODE").unwrap_or_else(|_| "python-proxy".to_string());
    let search_mode =
        env::var("SIDECAR_SEARCH_MODE").unwrap_or_else(|_| "python-proxy".to_string());
    ok_response(
        id,
        json!({
            "ok": true,
            "service": "the-search-thing-sidecar",
            "version": env!("CARGO_PKG_VERSION"),
            "backend_url": backend_base_url(),
            "index_mode": index_mode,
            "search_mode": search_mode,
        }),
    )
}
