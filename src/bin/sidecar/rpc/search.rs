use helix_rs::{HelixDB, HelixDBClient};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::env;
use std::path::PathBuf;

use crate::sidecar::backend_proxy::{backend_base_url, proxy_search_query};
use crate::sidecar::protocol::{
    err_response, ok_response, parse_params, JsonRpcRequest, JsonRpcResponse,
};

#[derive(Debug, Deserialize)]
struct SearchQueryParams {
    q: String,
}

#[derive(Debug, Clone)]
struct SearchItem {
    label: String,
    path: String,
    content: Option<String>,
    file_id: Option<String>,
    video_id: Option<String>,
    chunk_id: Option<String>,
    image_id: Option<String>,
    content_hash: Option<String>,
}

fn search_mode() -> String {
    let mode = env::var("SIDECAR_SEARCH_MODE").unwrap_or_else(|_| "python-proxy".to_string());
    eprintln!("[DEBUG] search_mode: {}", mode);
    mode
}

fn value_as_string(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_str).map(ToString::to_string)
}

fn normalize_file_results(list: &[Value]) -> Vec<SearchItem> {
    let mut items: Vec<SearchItem> = Vec::new();
    for obj in list {
        let Some(map) = obj.as_object() else {
            continue;
        };

        let path = value_as_string(map.get("path"));
        if path.is_none() {
            continue;
        }

        let file_id = value_as_string(map.get("file_id")).or_else(|| value_as_string(map.get("id")));
        let content = value_as_string(map.get("content"));

        if file_id.is_none() && content.is_none() {
            continue;
        }

        items.push(SearchItem {
            label: "file".to_string(),
            path: path.unwrap_or_default(),
            content,
            file_id,
            video_id: None,
            chunk_id: None,
            image_id: None,
            content_hash: None,
        });
    }

    items
}

fn normalize_video_results(list: &[Value]) -> Vec<SearchItem> {
    let mut dedup: HashSet<(String, String, String, String)> = HashSet::new();
    let mut items: Vec<SearchItem> = Vec::new();

    for obj in list {
        let Some(map) = obj.as_object() else {
            continue;
        };

        let chunk_id = value_as_string(map.get("chunk_id"));
        let video_id = value_as_string(map.get("video_id"));
        let file_id = value_as_string(map.get("file_id")).or_else(|| value_as_string(map.get("id")));
        let path = value_as_string(map.get("path"));
        let content = value_as_string(map.get("content"));
        let content_hash = value_as_string(map.get("content_hash"));

        if chunk_id.is_none() && video_id.is_none() && file_id.is_none() && path.is_none() && content.is_none() {
            continue;
        }

        let Some(path_value) = path else {
            continue;
        };

        let key = (
            video_id.clone().unwrap_or_default(),
            chunk_id.clone().unwrap_or_default(),
            file_id.clone().unwrap_or_default(),
            path_value.clone(),
        );
        if dedup.contains(&key) {
            continue;
        }
        dedup.insert(key);

        items.push(SearchItem {
            label: "video".to_string(),
            path: path_value,
            content,
            file_id,
            video_id,
            chunk_id,
            image_id: None,
            content_hash,
        });
    }

    items
}

fn normalize_image_results(list: &[Value]) -> Vec<SearchItem> {
    let mut dedup: HashSet<(String, String)> = HashSet::new();
    let mut items: Vec<SearchItem> = Vec::new();

    for obj in list {
        let Some(map) = obj.as_object() else {
            continue;
        };

        let image_id = value_as_string(map.get("image_id")).or_else(|| value_as_string(map.get("id")));
        let path = value_as_string(map.get("path"));
        let content = value_as_string(map.get("content"));

        if image_id.is_none() && content.is_none() {
            continue;
        }

        let Some(path_value) = path else {
            continue;
        };

        let key = (image_id.clone().unwrap_or_default(), path_value.clone());
        if dedup.contains(&key) {
            continue;
        }
        dedup.insert(key);

        items.push(SearchItem {
            label: "image".to_string(),
            path: path_value,
            content,
            file_id: None,
            video_id: None,
            chunk_id: None,
            image_id,
            content_hash: None,
        });
    }

    items
}

fn infer_thumbnails_dir() -> PathBuf {
    if let Ok(custom_dir) = env::var("THUMBNAILS_DIR") {
        return PathBuf::from(custom_dir);
    }

    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("videos")
        .join("thumbnails")
}

fn has_thumbnail(content_hash: &str) -> bool {
    if content_hash.is_empty() {
        return false;
    }
    let file_path = infer_thumbnails_dir().join(format!("{}.jpg", content_hash));
    file_path.exists()
}

async fn rust_helix_search_query(query: &str) -> Result<Value, String> {
    let endpoint = env::var("HELIX_ENDPOINT").unwrap_or_else(|_| "http://localhost".to_string());
    let port = env::var("HELIX_PORT")
        .unwrap_or_else(|_| "7003".to_string())
        .parse::<u16>()
        .map_err(|e| format!("invalid HELIX_PORT: {}", e))?;
    let api_key = env::var("HELIX_API_KEY").ok();

    eprintln!("[DEBUG] rust_helix_search: connecting to {}:{}", endpoint, port);
    
    let client = HelixDB::new(Some(endpoint.as_str()), Some(port), api_key.as_deref());
    let payload = json!({ "search_text": query });

    let file_future = client.query::<_, Value>("SearchFileEmbeddings", &payload);
    let video_future = client.query::<_, Value>("SearchTranscriptAndFrameEmbeddings", &payload);
    let image_future = client.query::<_, Value>("SearchImageEmbeddings", &payload);

    let (file_raw, video_raw, image_raw) = tokio::join!(file_future, video_future, image_future);

    let file_value = match file_raw {
        Ok(v) => v,
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("Empty input provided to reranker") {
                eprintln!("[DEBUG] file search empty reranker input; treating as empty");
                json!({"chunks": []})
            } else {
                eprintln!("[DEBUG] file search error: {}", e);
                return Err(format!("file search failed: {}", e));
            }
        }
    };
    let video_value = match video_raw {
        Ok(v) => v,
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("Empty input provided to reranker") {
                eprintln!("[DEBUG] video search empty reranker input; treating as empty");
                json!({"transcript_videos": [], "frame_videos": []})
            } else {
                eprintln!("[DEBUG] video search error: {}", e);
                return Err(format!("video search failed: {}", e));
            }
        }
    };
    let image_value = match image_raw {
        Ok(v) => v,
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("Empty input provided to reranker") {
                eprintln!("[DEBUG] image search empty reranker input; treating as empty");
                json!({"images": []})
            } else {
                eprintln!("[DEBUG] image search error: {}", e);
                return Err(format!("image search failed: {}", e));
            }
        }
    };

    let file_list = file_value
        .get("chunks")
        .or_else(|| file_value.get("files"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let transcript_video_list = video_value
        .get("transcript_videos")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let frame_video_list = video_value
        .get("frame_videos")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let image_list = image_value
        .get("images")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    eprintln!(
        "[DEBUG] search results: file_items={}, transcript_video_items={}, frame_video_items={}, image_items={}",
        file_list.len(),
        transcript_video_list.len(),
        frame_video_list.len(),
        image_list.len()
    );

    let file_items = normalize_file_results(&file_list);
    let mut video_items = normalize_video_results(&transcript_video_list);
    video_items.extend(normalize_video_results(&frame_video_list));
    let image_items = normalize_image_results(&image_list);

    let mut combined = Vec::new();
    combined.extend(file_items);
    combined.extend(video_items);
    combined.extend(image_items);

    let mut deduped: Vec<SearchItem> = Vec::new();
    let mut seen: HashSet<(String, String, String, String, String, String)> = HashSet::new();
    for item in combined {
        let key = (
            item.label.clone(),
            item.file_id.clone().or(item.chunk_id.clone()).unwrap_or_default(),
            item.video_id.clone().unwrap_or_default(),
            item.image_id.clone().unwrap_or_default(),
            item.path.clone(),
            item.content.clone().unwrap_or_default(),
        );
        if seen.contains(&key) {
            continue;
        }
        seen.insert(key);
        deduped.push(item);
    }

    let backend_origin = backend_base_url();

    let mut results: Vec<Value> = Vec::new();
    for item in deduped {
        let mut result = json!({
            "label": item.label,
            "content": item.content,
            "path": item.path,
        });

        if result.get("label").and_then(Value::as_str) == Some("video") {
            if let Some(content_hash) = item.content_hash {
                if has_thumbnail(&content_hash) {
                    result["thumbnail_url"] =
                        Value::String(format!("{}/api/thumbnails/{}", backend_origin, content_hash));
                }
            }
        }

        results.push(result);
    }

    Ok(json!({
        "query": query,
        "results": results,
    }))
}

pub fn handle_query(request: &JsonRpcRequest) -> JsonRpcResponse {
    let parsed: SearchQueryParams = match parse_params(request) {
        Ok(parsed) => parsed,
        Err(error_response) => return error_response,
    };

    if search_mode() == "python-proxy" {
        return match proxy_search_query(&parsed.q) {
            Ok(result) => ok_response(request.id.clone(), result),
            Err((code, message)) => err_response(
                request.id.clone(),
                code,
                "Search query failed",
                Some(json!({ "reason": message })),
            ),
        };
    }

    let runtime = match tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
    {
        Ok(rt) => rt,
        Err(error) => {
            return err_response(
                request.id.clone(),
                -32603,
                "Search query failed",
                Some(json!({ "reason": format!("failed to init runtime: {}", error) })),
            )
        }
    };

    match runtime.block_on(rust_helix_search_query(&parsed.q)) {
        Ok(result) => ok_response(request.id.clone(), result),
        Err(message) => err_response(
            request.id.clone(),
            -32603,
            "Search query failed",
            Some(json!({ "reason": message })),
        ),
    }
}
