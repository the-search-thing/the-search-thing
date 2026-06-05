use async_trait::async_trait;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use reqwest::multipart::{Form, Part};
use reqwest::Client;
use serde_json::{json, Map, Value};
use std::env;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::Instant;

// Groq's free tier caps the meta-llama vision model at 30 requests/min.
// Throttle vision calls to stay just under that. Whisper has no such limit
// and is intentionally left ungated.
const DEFAULT_VISION_MIN_INTERVAL_MS: u64 = 2_400; // 25 req/min

#[derive(Clone)]
pub struct GroqClient {
    http: Client,
    api_key: String,
    vision_min_interval: Duration,
    // Shared across clones: serializes vision calls to respect the RPM cap.
    vision_last_call: Arc<Mutex<Option<Instant>>>,
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

    async fn summarize_index_image_bytes(
        &self,
        image_id: &str,
        mime_hint: &str,
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
        let vision_min_interval_ms = env::var("GROQ_VISION_MIN_INTERVAL_MS")
            .ok()
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(DEFAULT_VISION_MIN_INTERVAL_MS);
        Ok(Self {
            http: Client::new(),
            api_key,
            vision_min_interval: Duration::from_millis(vision_min_interval_ms),
            vision_last_call: Arc::new(Mutex::new(None)),
        })
    }

    /// Block until enough time has passed since the previous vision call to keep
    /// the request rate under Groq's per-minute cap. Holds the lock across the
    /// sleep so concurrent callers queue up one interval apart.
    async fn throttle_vision(&self) {
        let mut last = self.vision_last_call.lock().await;
        if let Some(prev) = *last {
            let elapsed = prev.elapsed();
            if elapsed < self.vision_min_interval {
                tokio::time::sleep(self.vision_min_interval - elapsed).await;
            }
        }
        *last = Some(Instant::now());
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
            "model": "meta-llama/llama-4-scout-17b-16e-instruct",
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

        self.throttle_vision().await;
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

    pub async fn summarize_index_image_bytes(
        &self,
        _image_id: &str,
        mime_hint: &str,
        image_bytes: Vec<u8>,
    ) -> Result<Value, String> {
        let data_uri = format!(
            "data:image/{};base64,{}",
            mime_hint,
            STANDARD.encode(image_bytes)
        );
        let prompt = "You are an expert vision assistant. Provide a concise JSON summary for the provided image. Respond with JSON only (no code fences). Use the schema: {\"summary\": \"<1-2 sentences>\", \"objects\": [\"...\"], \"actions\": [\"...\"], \"setting\": \"<location or scene>\", \"ocr\": \"<visible text or empty>\", \"quality\": \"<good|low>\"}";

        let payload = json!({
            "model": "meta-llama/llama-4-scout-17b-16e-instruct",
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

        self.throttle_vision().await;
        let response = self
            .http
            .post("https://api.groq.com/openai/v1/chat/completions")
            .bearer_auth(&self.api_key)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Groq image vision request failed: {}", e))?;

        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| format!("Groq image vision read failed: {}", e))?;

        if !status.is_success() {
            return Err(format!("Groq image vision failed ({}): {}", status, body));
        }

        let parsed: Value =
            serde_json::from_str(&body).map_err(|e| format!("Invalid image vision JSON: {}", e))?;

        let content = parsed
            .get("choices")
            .and_then(Value::as_array)
            .and_then(|choices| choices.first())
            .and_then(|first| first.get("message"))
            .and_then(|message| message.get("content"));

        let summary = match content {
            Some(Value::String(text)) => normalize_index_summary_content(text),
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
                normalize_index_summary_content(&joined)
            }
            Some(other) => json!({
                "summary": other.to_string(),
                "objects": [],
                "actions": [],
                "setting": "",
                "ocr": "",
                "quality": "",
            }),
            None => json!({
                "summary": "",
                "objects": [],
                "actions": [],
                "setting": "",
                "ocr": "",
                "quality": "",
            }),
        };

        Ok(summary)
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

    async fn summarize_index_image_bytes(
        &self,
        image_id: &str,
        mime_hint: &str,
        image_bytes: Vec<u8>,
    ) -> Result<Value, String> {
        Self::summarize_index_image_bytes(self, image_id, mime_hint, image_bytes).await
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

fn strip_code_fences(content: &str) -> String {
    let text = content.trim();
    if !text.starts_with("```") {
        return text.to_string();
    }

    let mut lines: Vec<&str> = text.lines().collect();
    if !lines.is_empty() && lines[0].starts_with("```") {
        lines.remove(0);
    }
    if !lines.is_empty() && lines[lines.len() - 1].trim_start().starts_with("```") {
        lines.pop();
    }

    lines.join("\n").trim().to_string()
}

fn string_field(map: &Map<String, Value>, key: &str) -> String {
    map.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .unwrap_or_default()
}

fn string_list_field(map: &Map<String, Value>, key: &str) -> Vec<String> {
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

fn normalize_index_summary_content(content: &str) -> Value {
    let text = strip_code_fences(content);

    match serde_json::from_str::<Value>(&text) {
        Ok(Value::Object(map)) => {
            let mut summary = string_field(&map, "summary");
            if summary.starts_with("```") {
                summary = normalize_index_summary_content(&summary)
                    .get("summary")
                    .and_then(Value::as_str)
                    .unwrap_or(&summary)
                    .to_string();
            }
            if summary.is_empty() {
                summary = text.clone();
            }

            json!({
                "summary": summary,
                "objects": string_list_field(&map, "objects"),
                "actions": string_list_field(&map, "actions"),
                "setting": string_field(&map, "setting"),
                "ocr": string_field(&map, "ocr"),
                "quality": string_field(&map, "quality"),
            })
        }
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
