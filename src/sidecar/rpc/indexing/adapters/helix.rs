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
        if let Some(ids) = value.get("ids").and_then(Value::as_array) {
            for id in ids {
                if let Some(num) = id.as_i64() {
                    return Some(num.to_string());
                }
                if let Some(text) = id.as_str() {
                    return Some(text.to_string());
                }
            }
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

    fn asset_lookup_steps(param_name: &str) -> Vec<Value> {
        vec![
            json!({"NWhere": {"Eq": ["$label", {"String": "Asset"}]}}),
            json!({"Where": {"Compare": {
                "left": {"Property": "content_hash"},
                "op": "Eq",
                "right": {"Param": param_name}
            }}}),
            json!({"Limit": 1}),
        ]
    }

    async fn query_dynamic(
        &self,
        request_type: &str,
        queries: Vec<Value>,
        returns: Vec<&str>,
        parameters: Value,
        parameter_types: Value,
    ) -> Result<Value, String> {
        let payload = json!({
            "request_type": request_type,
            "query": {
                "queries": queries,
                "returns": returns,
            },
            "parameters": parameters,
            "parameter_types": parameter_types,
        });

        let client = self.client();
        client
            .query("v1/query", &payload)
            .await
            .map_err(|e| e.to_string())
    }

    async fn read_query_result(
        &self,
        name: &str,
        steps: Vec<Value>,
        parameters: Value,
        parameter_types: Value,
    ) -> Result<Value, String> {
        let response = self
            .query_dynamic(
                "read",
                vec![json!({"Query": {
                    "name": name,
                    "steps": steps,
                    "condition": Value::Null
                }})],
                vec![name],
                parameters,
                parameter_types,
            )
            .await?;

        Ok(response.get(name).cloned().unwrap_or(Value::Null))
    }

    async fn get_asset_id_by_hash(&self, content_hash: &str) -> Result<Option<String>, String> {
        let result = self
            .read_query_result(
                "asset",
                Self::asset_lookup_steps("content_hash"),
                json!({"content_hash": content_hash}),
                json!({"content_hash": "String"}),
            )
            .await?;

        Ok(Self::extract_asset_id(&result))
    }

    async fn get_asset_embeddings_by_hash(&self, content_hash: &str) -> Result<Value, String> {
        let response = self
            .query_dynamic(
                "read",
                vec![
                    json!({"Query": {
                        "name": "asset",
                        "steps": Self::asset_lookup_steps("content_hash"),
                        "condition": Value::Null
                    }}),
                    json!({"Query": {
                        "name": "embeddings",
                        "steps": [
                            {"N": {"Var": "asset"}},
                            {"Out": "HasAssetEmbedding"},
                            {"ValueMap": Value::Null}
                        ],
                        "condition": Value::Null
                    }}),
                ],
                vec!["embeddings"],
                json!({"content_hash": content_hash}),
                json!({"content_hash": "String"}),
            )
            .await?;

        Ok(response.get("embeddings").cloned().unwrap_or(Value::Null))
    }

    async fn ensure_indexes(&self) -> Result<(), String> {
        let _ = self
            .query_dynamic(
                "write",
                vec![
                    json!({"Query": {
                        "name": "idx_asset_hash",
                        "steps": [
                            {"CreateIndex": {
                                "spec": {"NodeEquality": {"label": "Asset", "property": "content_hash", "unique": false}},
                                "if_not_exists": true
                            }}
                        ],
                        "condition": Value::Null
                    }}),
                    json!({"Query": {
                        "name": "idx_asset_embedding",
                        "steps": [
                            {"CreateIndex": {
                                "spec": {"NodeVector": {"label": "AssetEmbedding", "property": "embedding", "tenant_property": Value::Null}},
                                "if_not_exists": true
                            }}
                        ],
                        "condition": Value::Null
                    }}),
                ],
                vec![],
                json!({}),
                json!({}),
            )
            .await?;

        Ok(())
    }

    async fn ensure_asset_exists(
        &self,
        content_hash: &str,
        kind: &str,
        path: &str,
    ) -> Result<(), String> {
        self.ensure_indexes().await?;
        if self.get_asset_id_by_hash(content_hash).await?.is_some() {
            return Ok(());
        }

        let _ = self
            .query_dynamic(
                "write",
                vec![json!({"Query": {
                    "name": "asset",
                    "steps": [
                        {"AddN": {
                            "label": "Asset",
                            "properties": [
                                ["kind", {"Expr": {"Param": "kind"}}],
                                ["path", {"Expr": {"Param": "path"}}],
                                ["content_hash", {"Expr": {"Param": "content_hash"}}]
                            ]
                        }}
                    ],
                    "condition": Value::Null
                }})],
                vec!["asset"],
                json!({
                    "content_hash": content_hash,
                    "kind": kind,
                    "path": path,
                }),
                json!({
                    "content_hash": "String",
                    "kind": "String",
                    "path": "String",
                }),
            )
            .await?;

        Ok(())
    }

    async fn embedding_exists_for_asset_unit(
        &self,
        content_hash: &str,
        unit_kind: &str,
        unit_key: &str,
    ) -> Result<bool, String> {
        let response = self
            .query_dynamic(
                "read",
                vec![
                    json!({"Query": {
                        "name": "asset",
                        "steps": Self::asset_lookup_steps("content_hash"),
                        "condition": Value::Null
                    }}),
                    json!({"Query": {
                        "name": "embedding",
                        "steps": [
                            {"N": {"Var": "asset"}},
                            {"Out": "HasAssetEmbedding"},
                            {"Where": {"Compare": {
                                "left": {"Property": "unit_kind"},
                                "op": "Eq",
                                "right": {"Param": "unit_kind"}
                            }}},
                            {"Where": {"Compare": {
                                "left": {"Property": "unit_key"},
                                "op": "Eq",
                                "right": {"Param": "unit_key"}
                            }}},
                            {"Limit": 1}
                        ],
                        "condition": Value::Null
                    }}),
                ],
                vec!["embedding"],
                json!({
                    "content_hash": content_hash,
                    "unit_kind": unit_kind,
                    "unit_key": unit_key,
                }),
                json!({
                    "content_hash": "String",
                    "unit_kind": "String",
                    "unit_key": "String",
                }),
            )
            .await?;

        Ok(Self::extract_asset_id(
            &response.get("embedding").cloned().unwrap_or(Value::Null),
        )
        .is_some())
    }

    async fn ensure_asset_embedding_exists(
        &self,
        content_hash: &str,
        unit_kind: &str,
        unit_key: &str,
        content: &str,
        vector: Vec<f64>,
    ) -> Result<(), String> {
        self.ensure_indexes().await?;
        if self.get_asset_id_by_hash(content_hash).await?.is_none() {
            return Err(format!("asset not found for content_hash={}", content_hash));
        }

        if self
            .embedding_exists_for_asset_unit(content_hash, unit_kind, unit_key)
            .await?
        {
            return Ok(());
        }

        let _ = self
            .query_dynamic(
                "write",
                vec![
                    json!({"Query": {
                        "name": "asset",
                        "steps": Self::asset_lookup_steps("content_hash"),
                        "condition": Value::Null
                    }}),
                    json!({"Query": {
                        "name": "embedding",
                        "steps": [
                            {"AddN": {
                                "label": "AssetEmbedding",
                                "properties": [
                                    ["unit_kind", {"Expr": {"Param": "unit_kind"}}],
                                    ["unit_key", {"Expr": {"Param": "unit_key"}}],
                                    ["content", {"Expr": {"Param": "content"}}],
                                    ["embedding", {"Expr": {"Param": "vector"}}]
                                ]
                            }}
                        ],
                        "condition": Value::Null
                    }}),
                    json!({"Query": {
                        "name": "link",
                        "steps": [
                            {"N": {"Var": "asset"}},
                            {"AddE": {
                                "label": "HasAssetEmbedding",
                                "to": {"Var": "embedding"},
                                "properties": [
                                    ["created_at", {"Expr": {"Param": "created_at"}}]
                                ]
                            }}
                        ],
                        "condition": {"VarNotEmpty": "asset"}
                    }}),
                ],
                vec!["embedding"],
                json!({
                    "content_hash": content_hash,
                    "unit_kind": unit_kind,
                    "unit_key": unit_key,
                    "content": content,
                    "vector": vector,
                    "created_at": Self::current_timestamp_rfc3339(),
                }),
                json!({
                    "content_hash": "String",
                    "unit_kind": "String",
                    "unit_key": "String",
                    "content": "String",
                    "vector": {"Array": "F64"},
                    "created_at": "String",
                }),
            )
            .await?;

        Ok(())
    }

    pub async fn clear_search_index(&self) -> Result<Value, String> {
        self.query_dynamic(
            "write",
            vec![
                json!({"Query": {
                    "name": "drop_edges",
                    "steps": [
                        {"NWhere": {"Eq": ["$label", {"String": "Asset"}] }},
                        {"Out": "HasAssetEmbedding"},
                        "Drop"
                    ],
                    "condition": Value::Null
                }}),
                json!({"Query": {
                    "name": "drop_assets",
                    "steps": [
                        {"NWhere": {"Eq": ["$label", {"String": "Asset"}] }},
                        "Drop"
                    ],
                    "condition": Value::Null
                }}),
            ],
            vec![],
            json!({}),
            json!({}),
        )
        .await
    }
}

#[async_trait]
impl TextIndexStore for HelixTextStore {
    async fn get_file_by_hash(
        &self,
        content_hash: &str,
    ) -> Result<Option<ExistingFileRecord>, String> {
        Ok(self
            .get_asset_id_by_hash(content_hash)
            .await?
            .map(|asset_id| ExistingFileRecord { asset_id }))
    }

    async fn create_file_asset(
        &self,
        content_hash: &str,
        kind: &str,
        path: &str,
    ) -> Result<(), String> {
        self.ensure_asset_exists(content_hash, kind, path).await
    }

    async fn create_file_asset_embeddings(
        &self,
        content_hash: &str,
        unit_kind: &str,
        unit_key: &str,
        content: &str,
    ) -> Result<(), String> {
        let vector = self.build_document_vector(content).await?;
        self.ensure_asset_embedding_exists(content_hash, unit_kind, unit_key, content, vector)
            .await
    }
}

#[async_trait]
impl ImageIndexStore for HelixTextStore {
    async fn get_image_by_hash(
        &self,
        content_hash: &str,
    ) -> Result<Option<ExistingImageRecord>, String> {
        Ok(self
            .get_asset_id_by_hash(content_hash)
            .await?
            .map(|asset_id| ExistingImageRecord { asset_id }))
    }

    async fn create_image_asset(
        &self,
        content_hash: &str,
        kind: &str,
        path: &str,
    ) -> Result<(), String> {
        self.ensure_asset_exists(content_hash, kind, path).await
    }

    async fn create_image_asset_embeddings(
        &self,
        content_hash: &str,
        unit_kind: &str,
        unit_key: &str,
        content: &str,
    ) -> Result<(), String> {
        let vector = self.build_document_vector(content).await?;
        self.ensure_asset_embedding_exists(content_hash, unit_kind, unit_key, content, vector)
            .await
    }
}

#[async_trait]
impl VideoIndexStore for HelixTextStore {
    async fn get_video_by_hash(
        &self,
        content_hash: &str,
    ) -> Result<Option<ExistingVideoRecord>, String> {
        Ok(self
            .get_asset_id_by_hash(content_hash)
            .await?
            .map(|asset_id| ExistingVideoRecord { asset_id }))
    }

    async fn video_asset_has_embeddings(&self, content_hash: &str) -> Result<bool, String> {
        let result = self.get_asset_embeddings_by_hash(content_hash).await?;
        Ok(Self::has_video_completion_marker(&result))
    }

    async fn create_video_asset(
        &self,
        content_hash: &str,
        kind: &str,
        path: &str,
    ) -> Result<(), String> {
        self.ensure_asset_exists(content_hash, kind, path).await
    }

    async fn create_video_asset_embeddings(
        &self,
        content_hash: &str,
        unit_kind: &str,
        unit_key: &str,
        content: &str,
    ) -> Result<(), String> {
        let vector = self.build_document_vector(content).await?;
        self.ensure_asset_embedding_exists(content_hash, unit_kind, unit_key, content, vector)
            .await
    }
}
