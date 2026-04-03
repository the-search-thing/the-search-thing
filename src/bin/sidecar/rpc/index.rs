use serde::Deserialize;
use serde::Serialize;
use serde_json::json;
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

use crate::sidecar::backend_proxy::{proxy_index_start, proxy_index_status};
use crate::sidecar::protocol::{
    err_response, ok_response, parse_params, JsonRpcRequest, JsonRpcResponse,
};
use crate::sidecar::rpc::indexing::adapters::groq::GroqClient;
use crate::sidecar::rpc::indexing::adapters::hash::{PathHasher, Sha256PathHasher};
use crate::sidecar::rpc::indexing::adapters::helix::HelixTextStore;
use crate::sidecar::rpc::indexing::adapters::store::VideoIndexStore;
use crate::sidecar::rpc::indexing::text_indexer::file_indexer;
use crate::sidecar::rpc::indexing::video::index_video_with_sidecar;

#[derive(Debug, Deserialize)]
struct IndexStartParams {
    dir: String,
    #[serde(default)]
    batch_size: usize,
}

#[derive(Debug, Deserialize)]
struct IndexStatusParams {
    job_id: String,
}

#[derive(Debug, Clone, Serialize)]
struct IndexJobStatus {
    job_id: String,
    dir: String,
    status: String,
    phase: String,
    batch_size: usize,
    text_found: usize,
    text_indexed: usize,
    text_errors: usize,
    text_skipped: usize,
    video_found: usize,
    video_indexed: usize,
    video_errors: usize,
    video_skipped: usize,
    image_found: usize,
    image_indexed: usize,
    image_errors: usize,
    image_skipped: usize,
    message: String,
    error: String,
    started_at: String,
    updated_at: String,
    finished_at: Option<String>,
}

static JOB_COUNTER: AtomicU64 = AtomicU64::new(1);
static JOB_STORE: OnceLock<Mutex<HashMap<String, IndexJobStatus>>> = OnceLock::new();

fn now_string() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()
}

fn index_mode() -> String {
    env::var("SIDECAR_INDEX_MODE").unwrap_or_else(|_| "python-proxy".to_string())
}

fn normalize_extension(ext: &str) -> String {
    let ext = ext.trim().to_lowercase();
    if ext.is_empty() {
        return ext;
    }
    if ext.starts_with('.') {
        ext
    } else {
        format!(".{}", ext)
    }
}

fn load_video_extensions() -> Vec<String> {
    let path = Path::new("config/file_types.json");
    let Ok(raw) = fs::read_to_string(path) else {
        return vec![".mp4".to_string(), ".mov".to_string()];
    };
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return vec![".mp4".to_string(), ".mov".to_string()];
    };

    parsed
        .get("video")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .map(normalize_extension)
                .filter(|v| !v.is_empty())
                .collect::<Vec<String>>()
        })
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| vec![".mp4".to_string(), ".mov".to_string()])
}

fn load_ignore_config() -> (Vec<String>, Vec<String>) {
    let path = Path::new("config/ignore.json");
    let Ok(raw) = fs::read_to_string(path) else {
        return (Vec::new(), Vec::new());
    };
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return (Vec::new(), Vec::new());
    };

    let ignore_exts = parsed
        .get("ignore_extensions")
        .or_else(|| parsed.get("ignore"))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .map(normalize_extension)
                .filter(|v| !v.is_empty())
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();

    let ignore_files = parsed
        .get("ignore_files")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .map(|s| s.trim().to_lowercase())
                .filter(|s| !s.is_empty())
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();

    (ignore_exts, ignore_files)
}

fn collect_video_files_with_ignore(
    root: &str,
    video_exts: &[String],
    ignore_exts: &[String],
    ignore_files: &[String],
) -> Vec<String> {
    let ext_set: std::collections::HashSet<String> = video_exts.iter().cloned().collect();
    let ignore_ext_set: std::collections::HashSet<String> = ignore_exts.iter().cloned().collect();
    let ignore_file_set: std::collections::HashSet<String> = ignore_files.iter().cloned().collect();

    if Path::new(root).is_file() {
        let base_name = Path::new(root)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_lowercase();
        if ignore_file_set.contains(&base_name) {
            return Vec::new();
        }
        let ext = Path::new(root)
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| format!(".{}", s.to_lowercase()))
            .unwrap_or_default();
        if ignore_ext_set.contains(&ext) {
            return Vec::new();
        }
        if ext_set.contains(&ext) {
            return vec![root.replace('\\', "/")];
        }
        return Vec::new();
    }

    let mut matches = Vec::new();
    for entry in WalkDir::new(root).into_iter().flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let base_name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_lowercase();
        if ignore_file_set.contains(&base_name) {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| format!(".{}", s.to_lowercase()))
            .unwrap_or_default();
        if ignore_ext_set.contains(&ext) {
            continue;
        }
        if ext_set.contains(&ext) {
            matches.push(path.to_string_lossy().replace('\\', "/"));
        }
    }
    matches
}

fn store() -> &'static Mutex<HashMap<String, IndexJobStatus>> {
    JOB_STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn make_job_id() -> String {
    let seq = JOB_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("rust-text-{}-{}", now_string(), seq)
}

fn put_job(status: IndexJobStatus) -> Result<(), String> {
    let mut jobs = store().lock().map_err(|e| e.to_string())?;
    jobs.insert(status.job_id.clone(), status);
    Ok(())
}

fn update_job<F>(job_id: &str, updater: F) -> Result<(), String>
where
    F: FnOnce(&mut IndexJobStatus),
{
    let mut jobs = store().lock().map_err(|e| e.to_string())?;
    let job = jobs
        .get_mut(job_id)
        .ok_or_else(|| format!("job not found: {}", job_id))?;
    updater(job);
    job.updated_at = now_string();
    Ok(())
}

fn get_job(job_id: &str) -> Result<Option<IndexJobStatus>, String> {
    let jobs = store().lock().map_err(|e| e.to_string())?;
    Ok(jobs.get(job_id).cloned())
}

fn spawn_rust_index_job(job_id: String, dir: String) {
    thread::spawn(move || {
        let runtime = match tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
        {
            Ok(rt) => rt,
            Err(error) => {
                let _ = update_job(&job_id, |job| {
                    job.status = "failed".to_string();
                    job.phase = "done".to_string();
                    job.error = format!("failed to init runtime: {}", error);
                    job.message = "Indexing failed".to_string();
                    job.finished_at = Some(now_string());
                });
                return;
            }
        };

        let hasher = Sha256PathHasher;
        let store = match HelixTextStore::from_env() {
            Ok(store) => store,
            Err(error) => {
                let _ = update_job(&job_id, |job| {
                    job.status = "failed".to_string();
                    job.phase = "done".to_string();
                    job.error = error;
                    job.message = "Indexing failed".to_string();
                    job.finished_at = Some(now_string());
                });
                return;
            }
        };
        let groq = match GroqClient::from_env() {
            Ok(client) => client,
            Err(error) => {
                let _ = update_job(&job_id, |job| {
                    job.status = "failed".to_string();
                    job.phase = "done".to_string();
                    job.error = error;
                    job.message = "Indexing failed".to_string();
                    job.finished_at = Some(now_string());
                });
                return;
            }
        };

        let _ = update_job(&job_id, |job| {
            job.phase = "index_text".to_string();
            job.message = "Indexing text files (Rust orchestrator)".to_string();
        });

        let results = runtime.block_on(file_indexer(vec![dir.clone()], &hasher, &store));

        let text_found = results.len();
        let text_indexed = results.iter().filter(|r| r.indexed).count();
        let text_skipped = results
            .iter()
            .filter(|r| r.error.as_deref() == Some("Duplicate content hash"))
            .count();
        let text_errors = results
            .iter()
            .filter(|r| !r.indexed && r.error.as_deref() != Some("Duplicate content hash"))
            .count();

        let failed_example = results
            .iter()
            .find(|r| !r.indexed && r.error.as_deref() != Some("Duplicate content hash"))
            .and_then(|r| r.error.clone())
            .unwrap_or_default();

        let video_exts = load_video_extensions();
        let (ignore_exts, ignore_files) = load_ignore_config();
        let video_files =
            collect_video_files_with_ignore(&dir, &video_exts, &ignore_exts, &ignore_files);
        let video_found = video_files.len();
        let mut video_indexed = 0usize;
        let mut video_errors = 0usize;
        let mut video_skipped = 0usize;

        let output_dir = env::current_dir()
            .map(|d| d.join("videos").join("output_indexer"))
            .unwrap_or_else(|_| Path::new("videos/output_indexer").to_path_buf());
        let output_dir_str = output_dir.to_string_lossy().replace('\\', "/");

        let _ = update_job(&job_id, |job| {
            job.video_found = video_found;
            job.phase = "index_video".to_string();
            job.message = "Indexing video files (Rust sidecar)".to_string();
        });

        for video_path in video_files {
            let content_hash = match runtime.block_on(hasher.compute_file_hash(&video_path)) {
                Ok(hash) => hash,
                Err(_) => {
                    video_errors += 1;
                    continue;
                }
            };

            let existing = runtime.block_on(store.get_video_by_hash(&content_hash));
            match existing {
                Ok(Some(_)) => {
                    video_skipped += 1;
                    let _ = update_job(&job_id, |job| {
                        job.video_indexed = video_indexed;
                        job.video_errors = video_errors;
                        job.video_skipped = video_skipped;
                    });
                    continue;
                }
                Ok(None) => {}
                Err(_) => {}
            }

            let video_id = uuid::Uuid::new_v4().to_string();
            let result = runtime.block_on(index_video_with_sidecar(
                &video_id,
                &content_hash,
                &video_path,
                &output_dir_str,
                30.0,
                &groq,
                &store,
            ));

            match result {
                Ok(r) if r.indexed => {
                    video_indexed += 1;
                }
                Ok(_) => {
                    video_errors += 1;
                }
                Err(_) => {
                    video_errors += 1;
                }
            }

            let _ = update_job(&job_id, |job| {
                job.video_indexed = video_indexed;
                job.video_errors = video_errors;
                job.video_skipped = video_skipped;
            });
        }

        let _ = update_job(&job_id, |job| {
            job.text_found = text_found;
            job.text_indexed = text_indexed;
            job.text_skipped = text_skipped;
            job.text_errors = text_errors;
            job.video_found = video_found;
            job.video_indexed = video_indexed;
            job.video_errors = video_errors;
            job.video_skipped = video_skipped;
            job.phase = "done".to_string();
            job.finished_at = Some(now_string());

            if text_errors > 0 || video_errors > 0 {
                job.status = "failed".to_string();
                job.message = "Indexing failed".to_string();
                job.error = if !failed_example.is_empty() {
                    failed_example
                } else {
                    "Video indexing encountered one or more errors".to_string()
                };
            } else {
                job.status = "completed".to_string();
                job.message = "Text and video indexing complete".to_string();
                job.error.clear();
            }
        });
    });
}

pub fn handle_start(request: &JsonRpcRequest) -> JsonRpcResponse {
    let parsed: IndexStartParams = match parse_params(request) {
        Ok(parsed) => parsed,
        Err(error_response) => return error_response,
    };

    if index_mode() != "rust-text" && index_mode() != "rust-full" {
        return match proxy_index_start(&parsed.dir) {
            Ok(result) => ok_response(request.id.clone(), result),
            Err((code, message)) => err_response(
                request.id.clone(),
                code,
                "Index start failed",
                Some(json!({ "reason": message })),
            ),
        };
    }

    let job_id = make_job_id();
    let now = now_string();
    let status = IndexJobStatus {
        job_id: job_id.clone(),
        dir: parsed.dir.clone(),
        status: "running".to_string(),
        phase: "scan_text".to_string(),
        batch_size: parsed.batch_size,
        text_found: 0,
        text_indexed: 0,
        text_errors: 0,
        text_skipped: 0,
        video_found: 0,
        video_indexed: 0,
        video_errors: 0,
        video_skipped: 0,
        image_found: 0,
        image_indexed: 0,
        image_errors: 0,
        image_skipped: 0,
        message: "Starting Rust indexer".to_string(),
        error: String::new(),
        started_at: now.clone(),
        updated_at: now,
        finished_at: None,
    };

    if let Err(error) = put_job(status) {
        return err_response(
            request.id.clone(),
            -32603,
            "Index start failed",
            Some(json!({ "reason": error })),
        );
    }

    spawn_rust_index_job(job_id.clone(), parsed.dir);
    ok_response(
        request.id.clone(),
        json!({ "success": true, "job_id": job_id }),
    )
}

pub fn handle_status(request: &JsonRpcRequest) -> JsonRpcResponse {
    let parsed: IndexStatusParams = match parse_params(request) {
        Ok(parsed) => parsed,
        Err(error_response) => return error_response,
    };

    match get_job(&parsed.job_id) {
        Ok(Some(status)) => return ok_response(request.id.clone(), json!(status)),
        Ok(None) => {}
        Err(error) => {
            return err_response(
                request.id.clone(),
                -32603,
                "Index status failed",
                Some(json!({ "reason": error })),
            )
        }
    }

    match proxy_index_status(&parsed.job_id) {
        Ok(result) => ok_response(request.id.clone(), result),
        Err((code, message)) => err_response(
            request.id.clone(),
            code,
            "Index status failed",
            Some(json!({ "reason": message })),
        ),
    }
}
