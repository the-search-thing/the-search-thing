use crate::sidecar::rpc::indexing::adapters::groq::TranscriptionClient;
use crate::sidecar::rpc::indexing::adapters::store::ImageIndexStore;
use async_trait::async_trait;
use serde_json::Value;
use std::fs;
use std::path::Path;
use uuid::Uuid;

#[derive(Clone, Debug)]
pub struct ImageIndexResult {
    pub path: String,
    #[allow(dead_code)]
    pub image_id: Option<String>,
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

#[cfg(test)]
pub(crate) mod helpers {
    use serde_json::{json, Map, Value};

    pub(crate) fn strip_code_fences(content: &str) -> String {
        let text = content.trim();
        if !text.starts_with("```") {
            return text.to_string();
        }

        let mut lines: Vec<&str> = text.lines().collect();
        if !lines.is_empty() && lines[0].starts_with("```") {
            lines.remove(0);
        }
        if !lines.is_empty() && lines[lines.len() - 1].trim().starts_with("```") {
            lines.pop();
        }

        lines.join("\n").trim().to_string()
    }

    pub(crate) fn string_list_field(map: &Map<String, Value>, key: &str) -> Vec<String> {
        map.get(key)
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToString::to_string)
                    .collect::<Vec<String>>()
            })
            .unwrap_or_default()
    }

    pub(crate) fn string_field(map: &Map<String, Value>, key: &str) -> String {
        map.get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .unwrap_or_default()
    }

    pub(crate) fn normalized_summary_from_map(
        map: &Map<String, Value>,
        fallback_text: &str,
    ) -> Value {
        let mut summary = string_field(map, "summary");
        if summary.starts_with("```") {
            summary = normalize_summary_content(&summary)
                .get("summary")
                .and_then(Value::as_str)
                .unwrap_or(&summary)
                .to_string();
        }

        if summary.is_empty() {
            summary = fallback_text.to_string();
        }

        json!({
            "summary": summary,
            "objects": string_list_field(map, "objects"),
            "actions": string_list_field(map, "actions"),
            "setting": string_field(map, "setting"),
            "ocr": string_field(map, "ocr"),
            "quality": string_field(map, "quality"),
        })
    }

    pub(crate) fn normalize_summary_content(content: &str) -> Value {
        let text = strip_code_fences(content);

        match serde_json::from_str::<Value>(&text) {
            Ok(Value::Object(map)) => normalized_summary_from_map(&map, &text),
            _ => json!({
                "summary": text,
                "objects": [],
                "actions": [],
                "setting": "",
                "ocr": "",
                "quality": "",
            }),
        }
    }
}

pub fn build_embedding_text(summary: &Value) -> String {
    let mut parts = Vec::new();

    let add_part = |parts: &mut Vec<String>, label: &str, value: String| {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            parts.push(format!("{}: {}", label, trimmed));
        }
    };

    if let Some(text) = summary.get("summary").and_then(Value::as_str) {
        add_part(&mut parts, "summary", text.to_string());
    }

    if let Some(items) = summary.get("objects").and_then(Value::as_array) {
        let joined = items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .collect::<Vec<&str>>()
            .join(", ");
        add_part(&mut parts, "objects", joined);
    }

    if let Some(items) = summary.get("actions").and_then(Value::as_array) {
        let joined = items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .collect::<Vec<&str>>()
            .join(", ");
        add_part(&mut parts, "actions", joined);
    }

    if let Some(text) = summary.get("setting").and_then(Value::as_str) {
        add_part(&mut parts, "setting", text.to_string());
    }

    if let Some(text) = summary.get("ocr").and_then(Value::as_str) {
        add_part(&mut parts, "ocr", text.to_string());
    }

    if let Some(text) = summary.get("quality").and_then(Value::as_str) {
        add_part(&mut parts, "quality", text.to_string());
    }

    parts.join(" | ")
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
                image_id: None,
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
                    image_id: None,
                    indexed: false,
                    error: Some(error.to_string()),
                });
                continue;
            }
        };

        let content_hash = {
            use sha2::{Digest, Sha256};

            let mut hasher = Sha256::new();
            hasher.update(&image_bytes);
            format!("{:x}", hasher.finalize())
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
                "[sidecar:index:image] duplicate hash for {} (existing image_id={})",
                normalized_path, record.image_id
            );
            results.push(ImageIndexResult {
                path: normalized_path,
                image_id: Some(record.image_id),
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
                    image_id: None,
                    indexed: false,
                    error: Some(error),
                });
                continue;
            }
        };

        let embedding_text = build_embedding_text(&summary_payload);
        let summary_json = summary_payload.to_string();

        if let Err(error) = store
            .create_image(&image_id, &content_hash, &summary_json, &normalized_path)
            .await
        {
            eprintln!(
                "[sidecar:index:image] failed to create image node for {} (image_id={}): {}",
                normalized_path, image_id, error
            );
            results.push(ImageIndexResult {
                path: normalized_path,
                image_id: Some(image_id),
                indexed: false,
                error: Some(error),
            });
            continue;
        }

        if let Err(error) = store
            .create_image_embeddings(&image_id, &embedding_text, &normalized_path)
            .await
        {
            eprintln!(
                "[sidecar:index:image] failed to create image embeddings for {} (image_id={}): {}",
                normalized_path, image_id, error
            );
            results.push(ImageIndexResult {
                path: normalized_path,
                image_id: Some(image_id),
                indexed: false,
                error: Some(error),
            });
            continue;
        }

        eprintln!(
            "[sidecar:index:image] indexed {} successfully (image_id={})",
            normalized_path, image_id
        );
        results.push(ImageIndexResult {
            path: normalized_path,
            image_id: Some(image_id),
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

#[cfg(test)]
mod property_tests;
