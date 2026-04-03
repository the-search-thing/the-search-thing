use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use async_trait::async_trait;
use reqwest::multipart::{Form, Part};
use reqwest::Client;
use serde_json::{json, Value};
use std::env;

#[derive(Clone)]
pub struct GroqClient {
    http: Client,
    api_key: String,
}

#[async_trait]
pub trait TranscriptionClient: Send + Sync {
    async fn transcribe_audio_bytes(
        &self,
        chunk_key: &str,
        audio_bytes: Vec<u8>,
    ) -> Result<Value, String>;

    async fn summarize_image_bytes(
        &self,
        image_id: &str,
        image_bytes: Vec<u8>,
    ) -> Result<Value, String>;
}

impl GroqClient {
    pub fn from_env() -> Result<Self, String> {
        let api_key = env::var("GROQ_API_KEY")
            .map_err(|_| "GROQ_API_KEY not set — video indexing will be skipped".to_string())?;
        
        if api_key.trim().is_empty() {
            return Err("GROQ_API_KEY is empty — video indexing will be skipped".to_string());
        }
        
        Ok(Self {
            http: Client::new(),
            api_key,
        })
    }

    pub fn is_available() -> bool {
        env::var("GROQ_API_KEY")
            .map(|k| !k.trim().is_empty())
            .unwrap_or(false)
    }

    pub async fn transcribe_audio_bytes(
        &self,
        chunk_key: &str,
        audio_bytes: Vec<u8>,
    ) -> Result<Value, String> {
        let file_name = format!("{}.mp3", chunk_key);
        let part = Part::bytes(audio_bytes)
            .file_name(file_name)
            .mime_str("audio/mpeg")
            .map_err(|e| e.to_string())?;

        let form = Form::new()
            .part("file", part)
            .text("model", "whisper-large-v3-turbo")
            .text("temperature", "0")
            .text("response_format", "verbose_json")
            .text("timestamp_granularities[]", "word");

        let response = self
            .http
            .post("https://api.groq.com/openai/v1/audio/transcriptions")
            .bearer_auth(&self.api_key)
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Groq transcription request failed: {}", e))?;

        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| format!("Groq transcription read failed: {}", e))?;

        if !status.is_success() {
            return Err(format!("Groq transcription failed ({}): {}", status, body));
        }

        serde_json::from_str(&body).map_err(|e| format!("Invalid transcription JSON: {}", e))
    }

    pub async fn summarize_image_bytes(
        &self,
        image_id: &str,
        image_bytes: Vec<u8>,
    ) -> Result<Value, String> {
        let data_uri = format!("data:image/jpeg;base64,{}", STANDARD.encode(image_bytes));
        let prompt = "You are an expert vision assistant. Provide a concise JSON summary for the provided video frame. Respond with JSON only (no code fences). Use the schema: {\"summary\": \"<1-2 sentences>\", \"objects\": [\"...\"], \"actions\": [\"...\"], \"setting\": \"<location or scene>\", \"quality\": \"<good|low>\"}";

        let payload = json!({
            "model": "meta-llama/llama-4-maverick-17b-128e-instruct",
            "messages": [{
                "role": "user",
                "content": [
                    { "type": "text", "text": prompt },
                    { "type": "image_url", "image_url": { "url": data_uri } }
                ]
            }],
            "max_tokens": 500,
            "temperature": 0.2
        });

        let response = self
            .http
            .post("https://api.groq.com/openai/v1/chat/completions")
            .bearer_auth(&self.api_key)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Groq vision request failed: {}", e))?;

        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| format!("Groq vision read failed: {}", e))?;

        if !status.is_success() {
            return Err(format!("Groq vision failed ({}): {}", status, body));
        }

        let parsed: Value =
            serde_json::from_str(&body).map_err(|e| format!("Invalid vision JSON: {}", e))?;

        let content = parsed
            .get("choices")
            .and_then(Value::as_array)
            .and_then(|choices| choices.first())
            .and_then(|first| first.get("message"))
            .and_then(|message| message.get("content"));

        let summary = match content {
            Some(Value::String(text)) => normalize_summary_content(text),
            Some(Value::Array(parts)) => {
                let joined = parts
                    .iter()
                    .map(|part| {
                        part.get("text")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string()
                    })
                    .collect::<Vec<String>>()
                    .join(" ");
                normalize_summary_content(&joined)
            }
            Some(other) => json!({ "summary": other.to_string() }),
            None => json!({ "summary": "" }),
        };

        Ok(json!({
            "image": image_id,
            "summary": summary
        }))
    }
}

#[async_trait]
impl TranscriptionClient for GroqClient {
    async fn transcribe_audio_bytes(
        &self,
        chunk_key: &str,
        audio_bytes: Vec<u8>,
    ) -> Result<Value, String> {
        Self::transcribe_audio_bytes(self, chunk_key, audio_bytes).await
    }

    async fn summarize_image_bytes(
        &self,
        image_id: &str,
        image_bytes: Vec<u8>,
    ) -> Result<Value, String> {
        Self::summarize_image_bytes(self, image_id, image_bytes).await
    }
}

fn normalize_summary_content(content: &str) -> Value {
    let mut text = content.trim().to_string();

    if text.starts_with("```") {
        let mut lines: Vec<&str> = text.lines().collect();
        if !lines.is_empty() && lines[0].starts_with("```") {
            lines.remove(0);
        }
        if !lines.is_empty() && lines[lines.len() - 1].trim_start().starts_with("```") {
            lines.pop();
        }
        text = lines.join("\n").trim().to_string();
    }

    match serde_json::from_str::<Value>(&text) {
        Ok(Value::Object(obj)) => Value::Object(obj),
        _ => json!({ "summary": text }),
    }
}
