use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: Value,
    pub method: String,
    #[serde(default)]
    pub params: Option<Value>,
}

#[derive(Debug, Serialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

#[derive(Debug, Serialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: &'static str,
    pub id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
}

pub fn ok_response(id: Value, result: Value) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0",
        id,
        result: Some(result),
        error: None,
    }
}

pub fn err_response(id: Value, code: i32, message: &str, data: Option<Value>) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0",
        id,
        result: None,
        error: Some(JsonRpcError {
            code,
            message: message.to_string(),
            data,
        }),
    }
}

#[allow(clippy::result_large_err)]
pub fn parse_params<T: for<'de> Deserialize<'de>>(
    request: &JsonRpcRequest,
) -> Result<T, JsonRpcResponse> {
    let params = request.params.clone().ok_or_else(|| {
        err_response(
            request.id.clone(),
            -32602,
            "Invalid params",
            Some(json!({ "reason": "params are required" })),
        )
    })?;

    serde_json::from_value(params).map_err(|error| {
        err_response(
            request.id.clone(),
            -32602,
            "Invalid params",
            Some(json!({ "reason": error.to_string() })),
        )
    })
}
