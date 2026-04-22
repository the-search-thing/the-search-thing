use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::sidecar::rpc::fs::walk_and_get_files_content;
use crate::sidecar::rpc::indexing::adapters::hash::PathHasher;
use crate::sidecar::rpc::indexing::adapters::store::TextIndexStore;

static FILE_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone)]
pub struct TextIndexResult {
    pub path: String,
    pub file_id: Option<String>,
    pub indexed: bool,
    pub error: Option<String>,
}

fn next_file_id() -> String {
    let seq = FILE_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("file-{:x}-{:x}", nanos, seq)
}

fn normalize_paths(file_paths: Vec<String>) -> Vec<String> {
    file_paths
        .into_iter()
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect()
}

pub async fn file_indexer(
    file_paths: Vec<String>,
    hasher: &dyn PathHasher,
    store: &dyn TextIndexStore,
) -> Vec<TextIndexResult> {
    let paths = normalize_paths(file_paths);
    if paths.is_empty() {
        return Vec::new();
    }

    let mut results: Vec<TextIndexResult> = Vec::new();

    for path in &paths {
        let files_content = match walk_and_get_files_content(path.clone()) {
            Ok(content) => content,
            Err(error) => {
                results.push(TextIndexResult {
                    path: path.clone(),
                    file_id: None,
                    indexed: false,
                    error: Some(error),
                });
                continue;
            }
        };

        for (file_path, content) in files_content {
            let content_hash = match hasher.compute_file_hash(&file_path).await {
                Ok(hash) => hash,
                Err(error) => {
                    results.push(TextIndexResult {
                        path: file_path,
                        file_id: None,
                        indexed: false,
                        error: Some(error),
                    });
                    continue;
                }
            };

            let existing = match store.get_file_by_hash(&content_hash).await {
                Ok(existing) => existing,
                Err(error) => {
                    results.push(TextIndexResult {
                        path: file_path,
                        file_id: None,
                        indexed: false,
                        error: Some(format!("store lookup failed: {}", error)),
                    });
                    continue;
                }
            };

            if let Some(record) = existing {
                results.push(TextIndexResult {
                    path: file_path,
                    file_id: Some(record.file_id),
                    indexed: false,
                    error: Some("Duplicate content hash".to_string()),
                });
                continue;
            }

            let file_id = next_file_id();

            if let Err(error) = store
                .create_file(&file_id, &content_hash, &content, &file_path)
                .await
            {
                results.push(TextIndexResult {
                    path: file_path,
                    file_id: Some(file_id),
                    indexed: false,
                    error: Some(error),
                });
                continue;
            }

            if let Err(error) = store
                .create_file_embeddings(&file_id, &content, &file_path)
                .await
            {
                results.push(TextIndexResult {
                    path: file_path,
                    file_id: Some(file_id),
                    indexed: false,
                    error: Some(error),
                });
                continue;
            }

            results.push(TextIndexResult {
                path: file_path,
                file_id: Some(file_id),
                indexed: true,
                error: None,
            });
        }
    }

    results
}
