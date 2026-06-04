use crate::sidecar::rpc::indexing::adapters::groq::TranscriptionClient;
use crate::sidecar::rpc::indexing::adapters::hash::PathHasher;
use crate::sidecar::rpc::indexing::adapters::store::ImageIndexStore;
use crate::sidecar::rpc::indexing::embedding::build_embedding_text;
use async_trait::async_trait;
use serde_json::Value;
use std::fs;
use std::path::Path;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct ImageIndexResult {
    pub content_hash: Option<String>,
    pub kind: String,
    pub path: String,
    pub indexed: bool,
    pub error: Option<String>,
}

#[async_trait]
trait ImageIndexerDeps: Send + Sync {
    async fn summarize_image(
        &self,
        image_id: &str,
        mime_hint: &str,
        image_bytes: Vec<u8>,
    ) -> Result<Value, String>;
}

#[derive(Clone)]
struct SidecarImageIndexerDeps<C>
where
    C: TranscriptionClient + Clone,
{
    groq: C,
}

#[async_trait]
impl<C> ImageIndexerDeps for SidecarImageIndexerDeps<C>
where
    C: TranscriptionClient + Clone + 'static,
{
    async fn summarize_image(
        &self,
        image_id: &str,
        mime_hint: &str,
        image_bytes: Vec<u8>,
    ) -> Result<Value, String> {
        self.groq
            .summarize_index_image_bytes(image_id, mime_hint, image_bytes)
            .await
    }
}

pub fn normalize_path(path: &str) -> String {
    path.replace('\\', "/")
}

pub fn mime_hint_from_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg") | Some("jpeg") => "jpeg",
        Some("png") => "png",
        Some("webp") => "webp",
        Some("gif") => "gif",
        Some("bmp") => "bmp",
        Some("tiff") | Some("tif") => "tiff",
        _ => "jpeg",
    }
}

fn normalize_paths(file_paths: Vec<String>) -> Vec<String> {
    file_paths
        .into_iter()
        .map(|path| path.trim().to_string())
        .filter(|path| !path.is_empty())
        .collect()
}

async fn index_images_with_deps<D>(
    file_paths: Vec<String>,
    deps: &D,
    store: &dyn ImageIndexStore,
) -> Vec<ImageIndexResult>
where
    D: ImageIndexerDeps,
{
    let paths = normalize_paths(file_paths);
    if paths.is_empty() {
        return Vec::new();
    }

    let mut results = Vec::new();

    let hasher = crate::sidecar::rpc::indexing::adapters::hash::Sha256PathHasher;

    for path in paths {
        let normalized_path = normalize_path(&path);
        let path_obj = Path::new(&normalized_path);
        eprintln!("[sidecar:index:image] processing {}", normalized_path);

        if !path_obj.exists() {
            eprintln!(
                "[sidecar:index:image] missing file, skipping {}",
                normalized_path
            );
            results.push(ImageIndexResult {
                path: normalized_path,
                content_hash: None,
                kind: "image".to_string(),
                indexed: false,
                error: Some("Path not found".to_string()),
            });
            continue;
        }

        let image_bytes = match fs::read(path_obj) {
            Ok(bytes) => bytes,
            Err(error) => {
                results.push(ImageIndexResult {
                    path: normalized_path,
                    content_hash: None,
                    kind: "image".to_string(),
                    indexed: false,
                    error: Some(error.to_string()),
                });
                continue;
            }
        };

        let content_hash = match hasher.compute_file_hash(&normalized_path).await {
            Ok(hash) => hash,
            Err(error) => {
                results.push(ImageIndexResult {
                    path: normalized_path,
                    content_hash: None,
                    kind: "image".to_string(),
                    indexed: false,
                    error: Some(error),
                });
                continue;
            }
        };

        let existing = match store.get_image_by_hash(&content_hash).await {
            Ok(existing) => existing,
            Err(error) => {
                eprintln!(
                    "[sidecar:index:image] hash lookup failed for {}: {}",
                    normalized_path, error
                );
                None
            }
        };

        if let Some(record) = existing {
            eprintln!(
                "[sidecar:index:image] duplicate hash for {} (existing asset_id={})",
                normalized_path, record.asset_id
            );
            results.push(ImageIndexResult {
                path: normalized_path,
                content_hash: Some(content_hash.clone()),
                kind: "image".to_string(),
                indexed: false,
                error: Some("Duplicate content hash".to_string()),
            });
            continue;
        }

        let image_id = Uuid::new_v4().to_string();
        let mime_hint = mime_hint_from_path(path_obj);
        let summary_payload = match deps
            .summarize_image(&image_id, mime_hint, image_bytes)
            .await
        {
            Ok(payload) => payload,
            Err(error) => {
                eprintln!(
                    "[sidecar:index:image] summarization failed for {}: {}",
                    normalized_path, error
                );
                results.push(ImageIndexResult {
                    path: normalized_path,
                    content_hash: Some(content_hash.clone()),
                    kind: "image".to_string(),
                    indexed: false,
                    error: Some(error),
                });
                continue;
            }
        };

        let embedding_text = build_embedding_text(&summary_payload);

        if let Err(error) = store
            .create_image_asset(&content_hash, "image", &normalized_path)
            .await
        {
            eprintln!(
                "[sidecar:index:image] failed to create image node for {} (image_id={}): {}",
                normalized_path, image_id, error
            );
            results.push(ImageIndexResult {
                path: normalized_path,
                content_hash: Some(content_hash.clone()),
                kind: "image".to_string(),
                indexed: false,
                error: Some(error),
            });
            continue;
        }

        if let Err(error) = store
            .create_image_asset_embeddings(
                &content_hash,
                "image_caption",
                "image_caption",
                &embedding_text,
            )
            .await
        {
            eprintln!(
                "[sidecar:index:image] failed to create image embeddings for {} (image_id={}): {}",
                normalized_path, image_id, error
            );
            results.push(ImageIndexResult {
                path: normalized_path,
                content_hash: Some(content_hash.clone()),
                kind: "image".to_string(),
                indexed: false,
                error: Some(error),
            });
            continue;
        }

        let filename_text = Path::new(&normalized_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .replace(['#', '_', '-', '.'], " ");
        if !filename_text.trim().is_empty() {
            if let Err(error) = store
                .create_image_asset_embeddings(
                    &content_hash,
                    "file_path",
                    "file_path",
                    &filename_text,
                )
                .await
            {
                eprintln!(
                    "[sidecar:index:image] warning: failed to create path embedding for {}: {}",
                    normalized_path, error
                );
            }
        }

        eprintln!(
            "[sidecar:index:image] indexed {} successfully (image_id={})",
            normalized_path, image_id
        );
        results.push(ImageIndexResult {
            path: normalized_path,
            content_hash: Some(content_hash),
            kind: "image".to_string(),
            indexed: true,
            error: None,
        });
    }

    results
}

pub async fn image_indexer_with_sidecar<C>(
    file_paths: Vec<String>,
    groq: &C,
    store: &dyn ImageIndexStore,
) -> Vec<ImageIndexResult>
where
    C: TranscriptionClient + Clone + 'static,
{
    let deps = SidecarImageIndexerDeps { groq: groq.clone() };
    index_images_with_deps(file_paths, &deps, store).await
}
