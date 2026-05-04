use helix_rs::{HelixDB, HelixDBClient};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::cmp::Ordering;
use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

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

const SEARCH_RESULT_PREVIEW_CHARS: usize = 320;

fn truncate_preview(content: Option<&str>, max_chars: usize) -> Option<String> {
    let content = content?.trim();
    if content.is_empty() {
        return None;
    }

    let mut chars = content.chars();
    let preview: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_some() {
        Some(format!("{}…", preview))
    } else {
        Some(preview)
    }
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

fn walk_objects<'a>(root: &'a Value, mut on_object: impl FnMut(&'a Map<String, Value>)) {
    let mut stack: Vec<&'a Value> = vec![root];

    while let Some(value) = stack.pop() {
        match value {
            Value::Object(map) => {
                on_object(map);
                stack.extend(map.values());
            }
            Value::Array(items) => {
                stack.extend(items.iter());
            }
            _ => {}
        }
    }
}

fn normalize_file_results(response: &Value) -> Vec<SearchItem> {
    let mut items: Vec<SearchItem> = Vec::new();

    walk_objects(response, |map| {
        let path = value_as_string(map.get("path"));
        if path.is_none() {
            return;
        }

        let file_id =
            value_as_string(map.get("file_id")).or_else(|| value_as_string(map.get("id")));
        let content = value_as_string(map.get("content"));

        if file_id.is_none() && content.is_none() {
            return;
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
    });

    items
}

fn normalize_video_results(response: &Value) -> Vec<SearchItem> {
    let mut dedup: HashSet<(String, String, String, String)> = HashSet::new();
    let mut items: Vec<SearchItem> = Vec::new();

    walk_objects(response, |map| {
        let chunk_id = value_as_string(map.get("chunk_id"));
        let video_id = value_as_string(map.get("video_id"));
        let file_id =
            value_as_string(map.get("file_id")).or_else(|| value_as_string(map.get("id")));
        let path = value_as_string(map.get("path"));
        let content = value_as_string(map.get("content"));
        let content_hash = value_as_string(map.get("content_hash"));

        if chunk_id.is_none()
            && video_id.is_none()
            && file_id.is_none()
            && path.is_none()
            && content.is_none()
        {
            return;
        }

        let Some(path_value) = path else {
            return;
        };

        let key = (
            video_id.clone().unwrap_or_default(),
            chunk_id.clone().unwrap_or_default(),
            file_id.clone().unwrap_or_default(),
            path_value.clone(),
        );
        if dedup.contains(&key) {
            return;
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
    });

    items
}

fn normalize_image_results(response: &Value) -> Vec<SearchItem> {
    let mut dedup: HashSet<(String, String)> = HashSet::new();
    let mut items: Vec<SearchItem> = Vec::new();

    walk_objects(response, |map| {
        let image_id =
            value_as_string(map.get("image_id")).or_else(|| value_as_string(map.get("id")));
        let path = value_as_string(map.get("path"));
        let content = value_as_string(map.get("content"));

        if image_id.is_none() && content.is_none() {
            return;
        }

        let Some(path_value) = path else {
            return;
        };

        let key = (image_id.clone().unwrap_or_default(), path_value.clone());
        if dedup.contains(&key) {
            return;
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
    });

    items
}

fn infer_thumbnails_dir() -> PathBuf {
    if let Ok(custom_dir) = env::var("THUMBNAILS_DIR") {
        return PathBuf::from(custom_dir);
    }

    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("videos")
        .join("output_indexer")
        .join("thumbnail_cache")
}

fn infer_extracted_thumbnails_dir() -> PathBuf {
    if let Ok(custom_dir) = env::var("EXTRACTED_THUMBNAILS_DIR") {
        return PathBuf::from(custom_dir);
    }

    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("videos")
        .join("output_indexer")
        .join("thumbnails")
}

fn find_extracted_thumbnail(video_path: &str) -> Option<PathBuf> {
    let stem = Path::new(video_path)
        .file_stem()?
        .to_string_lossy()
        .to_string();
    if stem.is_empty() {
        return None;
    }

    let extracted_dir = infer_extracted_thumbnails_dir();

    for name in ["middle.jpg", "start.jpg", "end.jpg"] {
        let direct = extracted_dir.join(&stem).join(name);
        if direct.exists() {
            return Some(direct);
        }
    }

    let prefix = format!("{}_chunk_", stem);
    let mut candidates = fs::read_dir(&extracted_dir)
        .ok()?
        .flatten()
        .filter_map(|entry| {
            let file_type = entry.file_type().ok()?;
            if !file_type.is_dir() {
                return None;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(&prefix) {
                Some((name, entry.path()))
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    candidates.sort_by(|a, b| a.0.cmp(&b.0));

    for (_, dir) in candidates {
        for name in ["middle.jpg", "start.jpg", "end.jpg"] {
            let candidate = dir.join(name);
            if candidate.exists() {
                return Some(candidate);
            }
        }
    }

    None
}

fn resolve_thumbnail_path(content_hash: &str, video_path: &str) -> Option<String> {
    if content_hash.is_empty() {
        return None;
    }

    let cache_dir = infer_thumbnails_dir();
    let cached = cache_dir.join(format!("{}.jpg", content_hash));
    if cached.exists() {
        return Some(cached.to_string_lossy().replace('\\', "/"));
    }

    let source = find_extracted_thumbnail(video_path)?;
    fs::create_dir_all(&cache_dir).ok()?;
    fs::copy(source, &cached).ok()?;

    Some(cached.to_string_lossy().replace('\\', "/"))
}

fn percent_encode(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for &byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~' | b'/' | b':') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{:02X}", byte));
        }
    }
    encoded
}

fn is_empty_vector_index_error(message: &str) -> bool {
    let lowered = message.to_ascii_lowercase();
    lowered.contains("no entry point found for hnsw index")
        || lowered.contains("empty input provided to reranker")
        || (lowered.contains("graph_error") && lowered.contains("vector error"))
        || (lowered.contains("graph_error") && lowered.contains("reranker error"))
}

fn is_transient_embedding_error(message: &str) -> bool {
    let lowered = message.to_ascii_lowercase();
    lowered.contains("embeddingerror")
        || lowered.contains("embedding error")
        || lowered.contains("error while embedding text")
        || lowered.contains("failed to send request to openai")
        || lowered.contains("error sending request for url")
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
            } else if is_transient_embedding_error(&message) {
                eprintln!(
                    "[sidecar:search] {} search embedding backend failed; treating as no results: {}",
                    label, message
                );
                Ok(Value::Array(Vec::new()))
            } else {
                Err(format!("{} search failed: {}", label, message))
            }
        }
    }
}

fn normalize_timed_vector_query_result(
    label: &str,
    result: Result<Result<Value, helix_rs::HelixError>, tokio::time::error::Elapsed>,
) -> Result<Value, String> {
    match result {
        Ok(inner) => normalize_vector_query_result(label, inner),
        Err(_) => {
            eprintln!(
                "[sidecar:search] {} search timed out; treating as no results",
                label
            );
            Ok(Value::Array(Vec::new()))
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

    let backend_timeout_ms = env::var("SIDECAR_SEARCH_BACKEND_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(12_000);
    let backend_timeout = Duration::from_millis(backend_timeout_ms);

    let file_future = tokio::time::timeout(
        backend_timeout,
        client.query::<_, Value>("SearchFileEmbeddings", &payload),
    );
    let video_future = tokio::time::timeout(
        backend_timeout,
        client.query::<_, Value>("SearchTranscriptAndFrameEmbeddings", &payload),
    );
    let image_future = tokio::time::timeout(
        backend_timeout,
        client.query::<_, Value>("SearchImageEmbeddings", &payload),
    );

    let (file_raw, video_raw, image_raw) = tokio::join!(file_future, video_future, image_future);

    let file_value = normalize_timed_vector_query_result("file", file_raw)?;
    let video_value = normalize_timed_vector_query_result("video", video_raw)?;
    let image_value = normalize_timed_vector_query_result("image", image_raw)?;

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
            item.file_id
                .clone()
                .or(item.chunk_id.clone())
                .unwrap_or_default(),
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

    let mut results: Vec<Value> = Vec::new();
    for item in deduped {
        let preview_content =
            truncate_preview(item.content.as_deref(), SEARCH_RESULT_PREVIEW_CHARS);

        let mut result = json!({
            "label": item.label,
            "content": preview_content,
            "path": item.path,
        });

        if result.get("label").and_then(Value::as_str) == Some("video") {
            if let Some(content_hash) = item.content_hash {
                if let Some(thumbnail_path) = resolve_thumbnail_path(&content_hash, &item.path) {
                    result["thumbnail_url"] = Value::String(format!(
                        "localimg://preview?path={}",
                        percent_encode(&thumbnail_path)
                    ));
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

    let started = Instant::now();

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
        Ok(result) => {
            let count = result
                .get("results")
                .and_then(Value::as_array)
                .map(|items| items.len())
                .unwrap_or(0);
            eprintln!(
                "[sidecar:search] completed in {}ms with {} results",
                started.elapsed().as_millis(),
                count
            );
            ok_response(request.id.clone(), result)
        }
        Err(message) => {
            eprintln!(
                "[sidecar:search] failed in {}ms: {}",
                started.elapsed().as_millis(),
                message
            );
            err_response(
                request.id.clone(),
                -32603,
                "Search query failed",
                Some(json!({ "reason": message })),
            )
        }
    }
}
