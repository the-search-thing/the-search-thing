use helix_rs::{HelixDB, HelixDBClient};
use serde::Deserialize;
use serde_json::{json, Value};
use std::cmp::Ordering;
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
    score: f64,
    source: String,
}

fn search_mode() -> String {
    env::var("SIDECAR_SEARCH_MODE").unwrap_or_else(|_| "python-proxy".to_string())
}

fn extract_keywords(query: &str) -> Vec<String> {
    query
        .split(|c: char| !c.is_alphanumeric() && c != '_')
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect()
}

fn has_keyword_match(item: &SearchItem, keywords: &[String]) -> bool {
    if keywords.is_empty() {
        return false;
    }

    let content_lower = item
        .content
        .as_ref()
        .map(|c| c.to_lowercase())
        .unwrap_or_default();
    let path_lower = item.path.to_lowercase();

    keywords
        .iter()
        .any(|kw| content_lower.contains(kw) || path_lower.contains(kw))
}

fn value_as_string(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_str).map(ToString::to_string)
}

fn gather_objects(value: &Value, out: &mut Vec<Value>) {
    match value {
        Value::Object(map) => {
            out.push(value.clone());
            for nested in map.values() {
                gather_objects(nested, out);
            }
        }
        Value::Array(items) => {
            for item in items {
                gather_objects(item, out);
            }
        }
        _ => {}
    }
}

fn normalize_file_results(response: &Value) -> Vec<SearchItem> {
    let mut objects: Vec<Value> = Vec::new();
    gather_objects(response, &mut objects);

    let mut items: Vec<SearchItem> = Vec::new();
    for obj in objects {
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
            score: 0.0,
            source: "file".to_string(),
        });
    }

    items
}

fn normalize_video_results(response: &Value) -> Vec<SearchItem> {
    let mut objects: Vec<Value> = Vec::new();
    gather_objects(response, &mut objects);

    let mut dedup: HashSet<(String, String, String, String)> = HashSet::new();
    let mut items: Vec<SearchItem> = Vec::new();

    for obj in objects {
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
            score: 0.0,
            source: "video".to_string(),
        });
    }

    items
}

fn normalize_image_results(response: &Value) -> Vec<SearchItem> {
    let mut objects: Vec<Value> = Vec::new();
    gather_objects(response, &mut objects);

    let mut dedup: HashSet<(String, String)> = HashSet::new();
    let mut items: Vec<SearchItem> = Vec::new();

    for obj in objects {
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
            score: 0.0,
            source: "image".to_string(),
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

fn is_empty_vector_index_error(message: &str) -> bool {
    let lowered = message.to_ascii_lowercase();
    lowered.contains("no entry point found for hnsw index")
        || lowered.contains("empty input provided to reranker")
        || (lowered.contains("graph_error") && lowered.contains("vector error"))
        || (lowered.contains("graph_error") && lowered.contains("reranker error"))
}

fn normalize_vector_query_result(
    label: &str,
    result: Result<Value, helix_rs::HelixError>,
) -> Result<Value, String> {
    match result {
        Ok(value) => Ok(value),
        Err(error) => {
            let message = error.to_string();
            if is_empty_vector_index_error(&message) {
                eprintln!(
                    "[sidecar:search] {} search returned empty-index/reranker response; treating as no results: {}",
                    label, message
                );
                Ok(Value::Array(Vec::new()))
            } else {
                Err(format!("{} search failed: {}", label, message))
            }
        }
    }
}

async fn rust_helix_search_query(query: &str) -> Result<Value, String> {
    let endpoint = env::var("HELIX_ENDPOINT").unwrap_or_else(|_| "http://localhost".to_string());
    let port = env::var("HELIX_PORT")
        .unwrap_or_else(|_| "7003".to_string())
        .parse::<u16>()
        .map_err(|e| format!("invalid HELIX_PORT: {}", e))?;
    let api_key = env::var("HELIX_API_KEY").ok();

    let client = HelixDB::new(Some(endpoint.as_str()), Some(port), api_key.as_deref());
    let payload = json!({ "search_text": query });

    let file_future = client.query::<_, Value>("SearchFileEmbeddings", &payload);
    let video_future = client.query::<_, Value>("SearchTranscriptAndFrameEmbeddings", &payload);
    let image_future = client.query::<_, Value>("SearchImageEmbeddings", &payload);

    let (file_raw, video_raw, image_raw) = tokio::join!(file_future, video_future, image_future);

    let file_value = normalize_vector_query_result("file", file_raw)?;
    let video_value = normalize_vector_query_result("video", video_raw)?;
    let image_value = normalize_vector_query_result("image", image_raw)?;

    let mut file_items = normalize_file_results(&file_value);
    let mut video_items = normalize_video_results(&video_value);
    let mut image_items = normalize_image_results(&image_value);

    let keywords = extract_keywords(query);

    for (rank, item) in file_items.iter_mut().enumerate() {
        let mut score = 1.0 / (rank as f64 + 1.0 + 60.0);
        if has_keyword_match(item, &keywords) {
            score *= 1.2;
        }
        item.score = score;
    }
    for (rank, item) in video_items.iter_mut().enumerate() {
        let mut score = 1.0 / (rank as f64 + 1.0 + 60.0);
        if has_keyword_match(item, &keywords) {
            score *= 1.2;
        }
        item.score = score;
    }
    for (rank, item) in image_items.iter_mut().enumerate() {
        let mut score = 1.0 / (rank as f64 + 1.0 + 60.0);
        if has_keyword_match(item, &keywords) {
            score *= 1.2;
        }
        item.score = score;
    }

    let mut combined = Vec::new();
    combined.extend(file_items);
    combined.extend(video_items);
    combined.extend(image_items);

    combined.sort_by(|a, b| {
        let score_cmp = b.score.partial_cmp(&a.score).unwrap_or(Ordering::Equal);
        if score_cmp != Ordering::Equal {
            return score_cmp;
        }
        let a_video = if a.source == "video" { 1 } else { 0 };
        let b_video = if b.source == "video" { 1 } else { 0 };
        b_video.cmp(&a_video)
    });

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
