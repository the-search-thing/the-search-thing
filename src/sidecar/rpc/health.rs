use serde_json::json;

use crate::sidecar::protocol::{ok_response, JsonRpcResponse};

pub fn handle(id: serde_json::Value) -> JsonRpcResponse {
    ok_response(
        id,
        json!({
            "ok": true,
            "service": "the-search-thing-sidecar",
            "version": env!("CARGO_PKG_VERSION"),
            "index_mode": "rust-text",
            "search_mode": "rust-helix",
        }),
    )
}
