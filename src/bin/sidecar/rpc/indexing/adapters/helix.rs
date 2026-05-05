use async_trait::async_trait;
use helix_rs::{HelixDB, HelixDBClient};
use serde_json::{json, Value};
use std::env;

use crate::sidecar::rpc::indexing::adapters::store::{
    ChunkCreateInput, ExistingFileRecord, ExistingImageRecord, ExistingVideoRecord,
    ImageIndexStore, TextIndexStore, VideoIndexStore,
};

#[derive(Debug, Clone)]
pub struct HelixTextStore {
    endpoint: String,
    port: u16,
    api_key: Option<String>,
}

impl HelixTextStore {
    pub fn from_env() -> Result<Self, String> {
        let endpoint =
            env::var("HELIX_ENDPOINT").unwrap_or_else(|_| "http://localhost".to_string());
        let port = env::var("HELIX_PORT")
            .unwrap_or_else(|_| "7003".to_string())
            .parse::<u16>()
            .map_err(|e| format!("invalid HELIX_PORT: {}", e))?;
        let api_key = env::var("HELIX_API_KEY")
            .ok()
            .filter(|v| !v.trim().is_empty());

        Ok(Self {
            endpoint,
            port,
            api_key,
        })
    }

    fn client(&self) -> HelixDB {
        HelixDB::new(
            Some(self.endpoint.as_str()),
            Some(self.port),
            self.api_key.as_deref(),
        )
    }

    fn extract_existing_file_id(value: &Value) -> Option<String> {
        if let Some(file_id) = value.get("file_id").and_then(Value::as_str) {
            return Some(file_id.to_string());
        }

        if let Some(file_node) = value.get("file") {
            if let Some(file_id) = file_node.get("file_id").and_then(Value::as_str) {
                return Some(file_id.to_string());
            }
            if let Some(file_array) = file_node.as_array() {
                if let Some(first) = file_array.first() {
                    if let Some(file_id) = first.get("file_id").and_then(Value::as_str) {
                        return Some(file_id.to_string());
                    }
                }
            }
        }

        if let Some(array) = value.as_array() {
            if let Some(first) = array.first() {
                if let Some(file_id) = first.get("file_id").and_then(Value::as_str) {
                    return Some(file_id.to_string());
                }
            }
        }

        None
    }

    fn extract_existing_video_id(value: &Value) -> Option<String> {
        if let Some(video_id) = value.get("video_id").and_then(Value::as_str) {
            return Some(video_id.to_string());
        }

        if let Some(video_node) = value.get("video") {
            if let Some(video_id) = video_node.get("video_id").and_then(Value::as_str) {
                return Some(video_id.to_string());
            }
            if let Some(video_array) = video_node.as_array() {
                if let Some(first) = video_array.first() {
                    if let Some(video_id) = first.get("video_id").and_then(Value::as_str) {
                        return Some(video_id.to_string());
                    }
                }
            }
        }

        if let Some(array) = value.as_array() {
            if let Some(first) = array.first() {
                if let Some(video_id) = first.get("video_id").and_then(Value::as_str) {
                    return Some(video_id.to_string());
                }
            }
        }

        None
    }

    fn extract_existing_image_id(value: &Value) -> Option<String> {
        if let Some(image_id) = value.get("image_id").and_then(Value::as_str) {
            return Some(image_id.to_string());
        }

        if let Some(image_node) = value.get("image") {
            if let Some(image_id) = image_node.get("image_id").and_then(Value::as_str) {
                return Some(image_id.to_string());
            }
            if let Some(image_array) = image_node.as_array() {
                if let Some(first) = image_array.first() {
                    if let Some(image_id) = first.get("image_id").and_then(Value::as_str) {
                        return Some(image_id.to_string());
                    }
                }
            }
        }

        if let Some(array) = value.as_array() {
            if let Some(first) = array.first() {
                if let Some(image_id) = first.get("image_id").and_then(Value::as_str) {
                    return Some(image_id.to_string());
                }
            }
        }

        None
    }

    fn is_not_found_error(message: &str) -> bool {
        let lowered = message.to_ascii_lowercase();
        lowered.contains("graph error: no value found")
            || lowered.contains("\"error\":\"graph error: no value found\"")
    }
}

#[async_trait]
impl TextIndexStore for HelixTextStore {
    async fn get_file_by_hash(
        &self,
        content_hash: &str,
    ) -> Result<Option<ExistingFileRecord>, String> {
        let payload = json!({ "content_hash": content_hash });
        let client = self.client();
        let result: Value = client
            .query("GetFileByHash", &payload)
            .await
            .map_err(|e| e.to_string())
            .or_else(|error| {
                if Self::is_not_found_error(&error) {
                    Ok(Value::Null)
                } else {
                    Err(error)
                }
            })?;

        Ok(Self::extract_existing_file_id(&result).map(|file_id| ExistingFileRecord { file_id }))
    }

    async fn create_file(
        &self,
        file_id: &str,
        content_hash: &str,
        content: &str,
        path: &str,
    ) -> Result<(), String> {
        let payload = json!({
            "file_id": file_id,
            "content_hash": content_hash,
            "content": content,
            "path": path,
        });
        let client = self.client();
        let _: Value = client
            .query("CreateFile", &payload)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn create_file_embeddings(
        &self,
        file_id: &str,
        content: &str,
        path: &str,
    ) -> Result<(), String> {
        let payload = json!({
            "file_id": file_id,
            "content": content,
            "path": path,
        });
        let client = self.client();
        let _: Value = client
            .query("CreateFileEmbeddings", &payload)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[async_trait]
impl ImageIndexStore for HelixTextStore {
    async fn get_image_by_hash(
        &self,
        content_hash: &str,
    ) -> Result<Option<ExistingImageRecord>, String> {
        let payload = json!({ "content_hash": content_hash });
        let client = self.client();
        let result: Value = client
            .query("GetImageByHash", &payload)
            .await
            .map_err(|e| e.to_string())
            .or_else(|error| {
                if Self::is_not_found_error(&error) {
                    Ok(Value::Null)
                } else {
                    Err(error)
                }
            })?;

        Ok(Self::extract_existing_image_id(&result)
            .map(|image_id| ExistingImageRecord { image_id }))
    }

    async fn create_image(
        &self,
        image_id: &str,
        content_hash: &str,
        content: &str,
        path: &str,
    ) -> Result<(), String> {
        let payload = json!({
            "image_id": image_id,
            "content_hash": content_hash,
            "content": content,
            "path": path,
        });
        let client = self.client();
        let _: Value = client
            .query("CreateImage", &payload)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn create_image_embeddings(
        &self,
        image_id: &str,
        content: &str,
        path: &str,
    ) -> Result<(), String> {
        let payload = json!({
            "image_id": image_id,
            "content": content,
            "path": path,
        });
        let client = self.client();
        let _: Value = client
            .query("CreateImageEmbeddings", &payload)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[async_trait]
impl VideoIndexStore for HelixTextStore {
    async fn get_video_by_hash(
        &self,
        content_hash: &str,
    ) -> Result<Option<ExistingVideoRecord>, String> {
        let payload = json!({ "content_hash": content_hash });
        let client = self.client();
        let result: Value = client
            .query("GetVideoByHash", &payload)
            .await
            .map_err(|e| e.to_string())
            .or_else(|error| {
                if Self::is_not_found_error(&error) {
                    Ok(Value::Null)
                } else {
                    Err(error)
                }
            })?;

        Ok(Self::extract_existing_video_id(&result)
            .map(|video_id| ExistingVideoRecord { video_id }))
    }

    async fn create_video(
        &self,
        video_id: &str,
        content_hash: &str,
        no_of_chunks: usize,
        path: &str,
    ) -> Result<(), String> {
        let payload = json!({
            "video_id": video_id,
            "content_hash": content_hash,
            "no_of_chunks": no_of_chunks,
            "path": path,
        });
        let client = self.client();
        let _: Value = client
            .query("CreateVideo", &payload)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn create_chunk(&self, chunk: &ChunkCreateInput) -> Result<(), String> {
        let payload = json!({
            "video_id": chunk.video_id,
            "chunk_id": chunk.chunk_id,
            "start_time": chunk.start_time,
            "end_time": chunk.end_time,
            "transcript": chunk.transcript,
        });
        let client = self.client();
        let _: Value = client
            .query("CreateChunk", &payload)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn create_video_chunk_relationship(
        &self,
        video_id: &str,
        chunk_id: &str,
    ) -> Result<(), String> {
        let payload = json!({
            "video_id": video_id,
            "chunk_id": chunk_id,
        });
        let client = self.client();
        let _: Value = client
            .query("CreateVideoToChunkRelationship", &payload)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn create_transcript_node(&self, chunk_id: &str, content: &str) -> Result<(), String> {
        let payload = json!({
            "chunk_id": chunk_id,
            "content": content,
        });
        let client = self.client();
        let _: Value = client
            .query("CreateTranscript", &payload)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn create_transcript_embeddings(
        &self,
        chunk_id: &str,
        content: &str,
    ) -> Result<(), String> {
        let payload = json!({
            "chunk_id": chunk_id,
            "content": content,
        });
        let client = self.client();
        let _: Value = client
            .query("CreateTranscriptEmbeddings", &payload)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn create_frame_summary_node(&self, chunk_id: &str, content: &str) -> Result<(), String> {
        let payload = json!({
            "chunk_id": chunk_id,
            "content": content,
        });
        let client = self.client();
        let _: Value = client
            .query("CreateFrameSummary", &payload)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn create_frame_summary_embeddings(
        &self,
        chunk_id: &str,
        content: &str,
    ) -> Result<(), String> {
        let payload = json!({
            "chunk_id": chunk_id,
            "content": content,
        });
        let client = self.client();
        let _: Value = client
            .query("CreateFrameSummaryEmbeddings", &payload)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn update_video_chunk_count(
        &self,
        video_id: &str,
        no_of_chunks: usize,
    ) -> Result<(), String> {
        let payload = json!({
            "video_id": video_id,
            "no_of_chunks": no_of_chunks,
        });
        let client = self.client();
        match client
            .query::<_, Value>("UpdateVideoChunkCount", &payload)
            .await
        {
            Ok(_) => Ok(()),
            Err(error) => {
                let message = error.to_string();
                let lowered = message.to_ascii_lowercase();
                if lowered.contains("updatevideochunkcount")
                    && (lowered.contains("not_found")
                        || lowered.contains("not found")
                        || lowered.contains("couldn't find"))
                {
                    eprintln!(
                        "[sidecar:index:video] warning: UpdateVideoChunkCount query missing; skipping chunk-count update for video_id={} chunks={}",
                        video_id, no_of_chunks
                    );
                    Ok(())
                } else {
                    Err(message)
                }
            }
        }
    }
}
