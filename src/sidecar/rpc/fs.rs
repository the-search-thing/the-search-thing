use serde::Deserialize;
use serde::Serialize;
use serde_json::json;
use std::collections::HashMap;
use std::collections::HashSet;
use std::fs;
use walkdir::WalkDir;

use crate::sidecar::protocol::{
    err_response, ok_response, parse_params, JsonRpcRequest, JsonRpcResponse,
};

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WalkTextBatchParams {
    pub dir: String,
    pub text_exts: Vec<String>,
    #[serde(default)]
    pub ignore_exts: Vec<String>,
    #[serde(default)]
    pub ignore_files: Vec<String>,
    pub cursor: usize,
    pub batch_size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WalkTextBatchResult {
    pub batch: Vec<(String, String)>,
    pub cursor: usize,
    pub done: bool,
    pub scanned_count: usize,
    pub skipped_count: usize,
}

fn normalize_extensions(values: Vec<String>) -> HashSet<String> {
    values
        .into_iter()
        .map(|ext| {
            let mut normalized = ext.trim().to_lowercase();
            if !normalized.is_empty() && !normalized.starts_with('.') {
                normalized = format!(".{}", normalized);
            }
            normalized
        })
        .filter(|ext| !ext.is_empty())
        .collect()
}

fn normalize_file_names(values: Vec<String>) -> HashSet<String> {
    values
        .into_iter()
        .map(|name| name.trim().to_lowercase())
        .filter(|name| !name.is_empty())
        .collect()
}

pub fn walk_text_batch(params: WalkTextBatchParams) -> Result<WalkTextBatchResult, String> {
    let text_exts = normalize_extensions(params.text_exts);
    let ignore_exts = normalize_extensions(params.ignore_exts);
    let ignore_files = normalize_file_names(params.ignore_files);

    let mut all_entries: Vec<(String, String)> = Vec::new();
    let mut scanned_count = 0usize;
    let mut skipped_count = 0usize;

    for entry in WalkDir::new(&params.dir).into_iter().flatten() {
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
            if ignore_files.contains(&name.to_lowercase()) {
                skipped_count += 1;
                continue;
            }
        }

        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| format!(".{}", s.to_lowercase()));

        if let Some(ref extension) = ext {
            if ignore_exts.contains(extension) {
                skipped_count += 1;
                continue;
            }
        }

        match ext {
            Some(ref extension) if text_exts.contains(extension) => {
                if let Ok(content) = fs::read_to_string(path) {
                    all_entries.push((path.to_string_lossy().to_string(), content));
                    scanned_count += 1;
                }
            }
            _ => {
                skipped_count += 1;
            }
        }
    }

    let start = params.cursor.min(all_entries.len());
    let end = (start + params.batch_size).min(all_entries.len());
    let batch = all_entries[start..end].to_vec();
    let done = end >= all_entries.len();

    Ok(WalkTextBatchResult {
        batch,
        cursor: end,
        done,
        scanned_count,
        skipped_count,
    })
}

pub fn handle_walk_text_batch(request: &JsonRpcRequest) -> JsonRpcResponse {
    let parsed: WalkTextBatchParams = match parse_params(request) {
        Ok(parsed) => parsed,
        Err(error_response) => return error_response,
    };

    match walk_text_batch(parsed) {
        Ok(result) => match serde_json::to_value(result) {
            Ok(value) => ok_response(request.id.clone(), value),
            Err(error) => err_response(
                request.id.clone(),
                -32603,
                "Internal error",
                Some(json!({ "reason": error.to_string() })),
            ),
        },
        Err(error) => err_response(
            request.id.clone(),
            -32603,
            "Internal error",
            Some(json!({ "reason": error })),
        ),
    }
}

pub fn get_file_contents(file_path: String) -> Result<String, String> {
    let contents = fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
    Ok(contents)
}

pub fn walk_and_get_files_content(dir: String) -> Result<HashMap<String, String>, String> {
    let mut files_content: HashMap<String, String> = HashMap::new();
    for entry in WalkDir::new(&dir) {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path().to_string_lossy().to_string();

        if entry.path().is_file() {
            match get_file_contents(path.clone()) {
                Ok(content) => {
                    files_content.insert(path, content);
                }
                Err(_) => continue,
            }
        }
    }
    Ok(files_content)
}
