use async_trait::async_trait;
use reqwest::Client;
use serde_json::{json, Value};
use std::env;
use std::fmt;

#[derive(Clone)]
pub struct VoyageClient {
    http: Client,
    api_key: String,
    base_url: String,
    embedding_model: String,
    retrieval_model: String,
}

impl fmt::Debug for VoyageClient {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("VoyageClient")
            .field("http", &self.http)
            .field("api_key", &"[REDACTED]")
            .field("base_url", &self.base_url)
            .field("embedding_model", &self.embedding_model)
            .field("retrieval_model", &self.retrieval_model)
            .finish()
    }
}

#[async_trait]
pub trait EmbeddingClient: Send + Sync {
    async fn embed_document(&self, text: &str) -> Result<Vec<f32>, String>;
    async fn embed_query(&self, text: &str) -> Result<Vec<f32>, String>;
}

impl VoyageClient {
    pub fn from_env() -> Result<Self, String> {
        let api_key = env::var("VOYAGE_API_KEY")
            .map_err(|_| "VOYAGE_API_KEY not set".to_string())?
            .trim()
            .to_string();
        if api_key.is_empty() {
            return Err("VOYAGE_API_KEY is empty".to_string());
        }

        let base_url = env::var("VOYAGE_API_BASE_URL")
            .unwrap_or_else(|_| "https://api.voyageai.com/v1".to_string());

        // Keep separate model knobs so indexing and retrieval can diverge.
        let embedding_model =
            env::var("VOYAGE_EMBED_MODEL").unwrap_or_else(|_| "voyage-3-large".to_string());
        let retrieval_model =
            env::var("VOYAGE_RETRIEVAL_MODEL").unwrap_or_else(|_| "voyage-3-large".to_string());

        Ok(Self {
            http: Client::new(),
            api_key,
            base_url,
            embedding_model,
            retrieval_model,
        })
    }

    pub fn embedding_model(&self) -> &str {
        &self.embedding_model
    }

    pub fn retrieval_model(&self) -> &str {
        &self.retrieval_model
    }

    async fn embed_with_model(
        &self,
        text: &str,
        model: &str,
        input_type: &'static str,
    ) -> Result<Vec<f32>, String> {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return Err("cannot embed empty text".to_string());
        }

        let url = format!("{}/embeddings", self.base_url.trim_end_matches('/'));
        let payload = json!({
            "input": [trimmed],
            "model": model,
            "input_type": input_type,
        });

        let response = self
            .http
            .post(url)
            .bearer_auth(&self.api_key)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Voyage request failed: {}", e))?;

        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| format!("Voyage response read failed: {}", e))?;

        if !status.is_success() {
            return Err(format!("Voyage embeddings failed ({}): {}", status, body));
        }

        let parsed: Value =
            serde_json::from_str(&body).map_err(|e| format!("Invalid Voyage JSON: {}", e))?;

        Self::extract_embedding(&parsed).ok_or_else(|| {
            format!(
                "Voyage response missing embedding vector for model '{}': {}",
                model, body
            )
        })
    }

    fn extract_embedding(value: &Value) -> Option<Vec<f32>> {
        let array = value.get("data")?.as_array()?;
        let first = array.first()?;
        let embedding = first.get("embedding")?.as_array()?;

        let mut out = Vec::with_capacity(embedding.len());
        for item in embedding {
            if let Some(v) = item.as_f64() {
                out.push(v as f32);
            } else {
                return None;
            }
        }
        Some(out)
    }
}

#[async_trait]
impl EmbeddingClient for VoyageClient {
    async fn embed_document(&self, text: &str) -> Result<Vec<f32>, String> {
        self.embed_with_model(text, &self.embedding_model, "document")
            .await
    }

    async fn embed_query(&self, text: &str) -> Result<Vec<f32>, String> {
        self.embed_with_model(text, &self.retrieval_model, "query")
            .await
    }
}
