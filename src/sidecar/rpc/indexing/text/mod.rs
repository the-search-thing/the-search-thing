use crate::sidecar::rpc::fs::walk_and_get_files_content;
use crate::sidecar::rpc::indexing::adapters::hash::PathHasher;
use crate::sidecar::rpc::indexing::adapters::store::TextIndexStore;
use std::path::Path;

#[derive(Debug, Clone)]
pub struct TextIndexResult {
    pub indexed: bool,
    pub kind: String,
    pub content_hash: Option<String>,
    pub path: String,
    pub error: Option<String>,
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
                    indexed: false,
                    kind: "file".to_string(),
                    content_hash: None,
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
                        indexed: false,
                        kind: "file".to_string(),
                        content_hash: None,
                        error: Some(error),
                    });
                    continue;
                }
            };

            let existing = match store.get_file_by_hash(&content_hash).await {
                Ok(existing) => existing,
                Err(error) => {
                    results.push(TextIndexResult {
                        indexed: false,
                        kind: "file".to_string(),
                        path: file_path,
                        content_hash: Some(content_hash.clone()),
                        error: Some(format!("store lookup failed: {}", error)),
                    });
                    continue;
                }
            };

            if let Some(_record) = existing {
                results.push(TextIndexResult {
                    indexed: false,
                    kind: "file".to_string(),
                    path: file_path,
                    content_hash: Some(content_hash),
                    error: Some("Duplicate content hash".to_string()),
                });
                continue;
            }

            let kind = "file";
            if let Err(error) = store
                .create_file_asset(&content_hash, kind, &file_path)
                .await
            {
                results.push(TextIndexResult {
                    path: file_path,
                    indexed: false,
                    kind: kind.to_string(),
                    content_hash: Some(content_hash.clone()),
                    error: Some(error),
                });
                continue;
            }

            if let Err(error) = store
                .create_file_asset_embeddings(&content_hash, "file_body", "file_body", &content)
                .await
            {
                results.push(TextIndexResult {
                    path: file_path,
                    indexed: false,
                    kind: kind.to_string(),
                    content_hash: Some(content_hash.clone()),
                    error: Some(error),
                });
                continue;
            }

            let filename_text = Path::new(&file_path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or_default()
                .replace(['#', '_', '-', '.'], " ");
            if !filename_text.trim().is_empty() {
                if let Err(error) = store
                    .create_file_asset_embeddings(
                        &content_hash,
                        "file_path",
                        "file_path",
                        &filename_text,
                    )
                    .await
                {
                    eprintln!(
                        "[sidecar:index:text] warning: failed to create path embedding for {}: {}",
                        file_path, error
                    );
                }
            }

            results.push(TextIndexResult {
                path: file_path,
                indexed: true,
                kind: kind.to_string(),
                content_hash: Some(content_hash),
                error: None,
            });
        }
    }

    results
}
