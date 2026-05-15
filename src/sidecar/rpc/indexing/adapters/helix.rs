use async_trait::async_trait;
use chrono::{SecondsFormat, Utc};
use helix_rs::{HelixDB, HelixDBClient};
use serde_json::{json, Value};
use std::env;
use std::sync::Mutex;

use crate::sidecar::rpc::indexing::adapters::store::{
    ExistingFileRecord, ExistingImageRecord, ExistingVideoRecord, ImageIndexStore, TextIndexStore,
    VideoIndexStore,
};
use crate::sidecar::rpc::indexing::adapters::voyage::{EmbeddingClient, VoyageClient};

#[derive(Debug)]
pub struct HelixTextStore {
    endpoint: String,
    port: u16,
    api_key: Option<String>,
    voyage: Mutex<Option<VoyageClient>>,
}

impl HelixTextStore {
    pub fn from_env() -> Result<Self, String> {
        let endpoint =
            env::var("HELIX_ENDPOINT").unwrap_or_else(|_| "http://localhost".to_string());
        let port = env::var("HELIX_PORT")
            .unwrap_or_else(|_| "6969".to_string())
            .parse::<u16>()
            .map_err(|e| format!("invalid HELIX_PORT: {}", e))?;
        let api_key = env::var("HELIX_API_KEY")
            .ok()
            .filter(|v| !v.trim().is_empty());
        Ok(Self {
            endpoint,
            port,
            api_key,
            voyage: Mutex::new(None),
        })
    }

    fn client(&self) -> HelixDB {
        HelixDB::new(
            Some(self.endpoint.as_str()),
            Some(self.port),
            self.api_key.as_deref(),
        )
    }

    fn extract_asset_id(value: &Value) -> Option<String> {
        if let Some(id) = value.get("asset_id").and_then(Value::as_str) {
            return Some(id.to_string());
        }
        if let Some(id) = value.get("id").and_then(Value::as_str) {
            return Some(id.to_string());
        }

        if let Some(array) = value.as_array() {
            for item in array {
                if let Some(id) = Self::extract_asset_id(item) {
                    return Some(id);
                }
            }
        }

        if let Some(obj) = value.as_object() {
            for nested in obj.values() {
                if let Some(id) = Self::extract_asset_id(nested) {
                    return Some(id);
                }
            }
        }

        None
    }

    fn current_timestamp_rfc3339() -> String {
        Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
    }

    fn is_not_found_error(message: &str) -> bool {
        let lowered = message.to_ascii_lowercase();
        lowered.contains("graph error: no value found")
            || lowered.contains("\"error\":\"graph error: no value found\"")
    }

    fn has_video_completion_marker(value: &Value) -> bool {
        if value.is_null() {
            return false;
        }

        if let Some(array) = value.as_array() {
            return array.iter().any(Self::has_video_completion_marker);
        }

        if let Some(obj) = value.as_object() {
            if let (Some(unit_kind), Some(unit_key)) = (
                obj.get("unit_kind").and_then(Value::as_str),
                obj.get("unit_key").and_then(Value::as_str),
            ) {
                return unit_kind == "video_index_state" && unit_key == "complete";
            }

            return obj.values().any(Self::has_video_completion_marker);
        }

        false
    }

    async fn build_document_vector(&self, content: &str) -> Result<Vec<f64>, String> {
        let voyage = {
            let mut slot = self
                .voyage
                .lock()
                .map_err(|e| format!("voyage client lock poisoned: {}", e))?;
            match slot.as_mut() {
                Some(client) => client.clone(),
                None => {
                    let client = VoyageClient::from_env()?;
                    *slot = Some(client.clone());
                    client
                }
            }
        };
        let vector = voyage.embed_document(content).await?;
        Ok(vector.into_iter().map(f64::from).collect())
    }

    pub async fn clear_search_index(&self) -> Result<Value, String> {
        let client = self.client();
        client
            .query("ClearSearchIndex", &json!({}))
            .await
            .map_err(|e| e.to_string())
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
            .query("GetAssetByHash", &payload)
            .await
            .map_err(|e| e.to_string())
            .or_else(|error| {
                if Self::is_not_found_error(&error) {
                    Ok(Value::Null)
                } else {
                    Err(error)
                }
            })?;

        Ok(Self::extract_asset_id(&result).map(|asset_id| ExistingFileRecord { asset_id }))
    }

    async fn create_file_asset(
        &self,
        content_hash: &str,
        kind: &str,
        path: &str,
    ) -> Result<(), String> {
        let payload = json!({
            "content_hash": content_hash,
            "kind": kind,
            "path": path,
        });
        let client = self.client();
        let _: Value = client
            .query("CreateAsset", &payload)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn create_file_asset_embeddings(
        &self,
        content_hash: &str,
        unit_kind: &str,
        unit_key: &str,
        content: &str,
    ) -> Result<(), String> {
        let vector = self.build_document_vector(content).await?;
        let payload = json!({
            "content_hash": content_hash,
            "unit_kind": unit_kind,
            "unit_key": unit_key,
            "content": content,
            "vector": vector,
            "created_at": Self::current_timestamp_rfc3339(),
        });
        let client = self.client();
        let _: Value = client
            .query("CreateAssetEmbeddingByHash", &payload)
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
            .query("GetAssetByHash", &payload)
            .await
            .map_err(|e| e.to_string())
            .or_else(|error| {
                if Self::is_not_found_error(&error) {
                    Ok(Value::Null)
                } else {
                    Err(error)
                }
            })?;

        Ok(Self::extract_asset_id(&result).map(|asset_id| ExistingImageRecord { asset_id }))
    }

    async fn create_image_asset(
        &self,
        content_hash: &str,
        kind: &str,
        path: &str,
    ) -> Result<(), String> {
        let payload = json!({
            "content_hash": content_hash,
            "kind": kind,
            "path": path,
        });
        let client = self.client();
        let _: Value = client
            .query("CreateAsset", &payload)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn create_image_asset_embeddings(
        &self,
        content_hash: &str,
        unit_kind: &str,
        unit_key: &str,
        content: &str,
    ) -> Result<(), String> {
        let vector = self.build_document_vector(content).await?;
        let payload = json!({
            "content_hash": content_hash,
            "unit_kind": unit_kind,
            "unit_key": unit_key,
            "content": content,
            "vector": vector,
            "created_at": Self::current_timestamp_rfc3339(),
        });
        let client = self.client();
        let _: Value = client
            .query("CreateAssetEmbeddingByHash", &payload)
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
            .query("GetAssetByHash", &payload)
            .await
            .map_err(|e| e.to_string())
            .or_else(|error| {
                if Self::is_not_found_error(&error) {
                    Ok(Value::Null)
                } else {
                    Err(error)
                }
            })?;

        Ok(Self::extract_asset_id(&result).map(|asset_id| ExistingVideoRecord { asset_id }))
    }

    async fn video_asset_has_embeddings(&self, content_hash: &str) -> Result<bool, String> {
        let payload = json!({ "content_hash": content_hash });
        let client = self.client();
        let result: Value = client
            .query("GetAssetEmbeddingsByHash", &payload)
            .await
            .map_err(|e| e.to_string())
            .or_else(|error| {
                if Self::is_not_found_error(&error) {
                    Ok(Value::Null)
                } else {
                    Err(error)
                }
            })?;

        Ok(Self::has_video_completion_marker(&result))
    }

    async fn create_video_asset(
        &self,
        content_hash: &str,
        kind: &str,
        path: &str,
    ) -> Result<(), String> {
        let payload = json!({
            "content_hash": content_hash,
            "kind": kind,
            "path": path,
        });
        let client = self.client();
        let _: Value = client
            .query("CreateAsset", &payload)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn create_video_asset_embeddings(
        &self,
        content_hash: &str,
        unit_kind: &str,
        unit_key: &str,
        content: &str,
    ) -> Result<(), String> {
        let vector = self.build_document_vector(content).await?;
        let payload = json!({
            "content_hash": content_hash,
            "unit_kind": unit_kind,
            "unit_key": unit_key,
            "content": content,
            "vector": vector,
            "created_at": Self::current_timestamp_rfc3339(),
        });
        let client = self.client();
        let _: Value = client
            .query("CreateAssetEmbeddingByHash", &payload)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}
