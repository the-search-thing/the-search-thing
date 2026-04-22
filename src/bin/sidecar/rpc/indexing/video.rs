use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::Command;
use tokio::task::JoinSet;
use uuid::Uuid;

use crate::sidecar::rpc::indexing::adapters::groq::TranscriptionClient;
use crate::sidecar::rpc::indexing::adapters::store::{ChunkCreateInput, VideoIndexStore};

#[derive(Clone, Debug)]
pub struct VideoIndexResult {
    pub video_path: String,
    pub indexed: bool,
    pub chunks_created: usize,
    pub error: Option<String>,
}

#[derive(Clone, Debug)]
struct ChunkArtifact {
    chunk_path: String,
    audio_path: Option<String>,
    thumbnail_paths: Vec<String>,
}

#[async_trait]
trait VideoIndexerDeps: Send + Sync {
    async fn chunk_video_if_needed(
        &self,
        video_path: &str,
        chunks_dir: &str,
        chunk_duration_secs: f64,
    ) -> Result<Vec<String>, String>;

    async fn build_chunk_artifacts(
        &self,
        chunk_paths: Vec<String>,
        audio_dir: String,
        thumbnails_dir: String,
    ) -> Result<Vec<ChunkArtifact>, String>;

    async fn generate_transcripts(&self, artifacts: &[ChunkArtifact]) -> HashMap<String, Value>;

    async fn generate_frame_summaries(
        &self,
        artifacts: &[ChunkArtifact],
    ) -> HashMap<String, Vec<Value>>;
}

#[derive(Clone)]
struct SidecarVideoIndexerDeps<C>
where
    C: TranscriptionClient + Clone,
{
    groq: C,
}

#[async_trait]
impl<C> VideoIndexerDeps for SidecarVideoIndexerDeps<C>
where
    C: TranscriptionClient + Clone + 'static,
{
    async fn chunk_video_if_needed(
        &self,
        video_path: &str,
        chunks_dir: &str,
        chunk_duration_secs: f64,
    ) -> Result<Vec<String>, String> {
        tokio::task::spawn_blocking({
            let vp = video_path.to_string();
            let cd = chunks_dir.to_string();
            move || chunk_video_if_needed(&vp, &cd, chunk_duration_secs)
        })
        .await
        .map_err(|e| e.to_string())?
    }

    async fn build_chunk_artifacts(
        &self,
        chunk_paths: Vec<String>,
        audio_dir: String,
        thumbnails_dir: String,
    ) -> Result<Vec<ChunkArtifact>, String> {
        build_chunk_artifacts(chunk_paths, audio_dir, thumbnails_dir).await
    }

    async fn generate_transcripts(&self, artifacts: &[ChunkArtifact]) -> HashMap<String, Value> {
        generate_transcripts(&self.groq, artifacts).await
    }

    async fn generate_frame_summaries(
        &self,
        artifacts: &[ChunkArtifact],
    ) -> HashMap<String, Vec<Value>> {
        generate_frame_summaries(&self.groq, artifacts).await
    }
}

fn normalize_path(path: &str) -> String {
    path.replace('\\', "/")
}

fn check_video_duration(video_path: &str) -> Result<f64, String> {
    let output = Command::new("ffprobe")
        .arg("-v")
        .arg("error")
        .arg("-i")
        .arg(video_path)
        .arg("-show_entries")
        .arg("format=duration")
        .arg("-of")
        .arg("csv=p=0")
        .output()
        .map_err(|e| format!("ffprobe failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed: {}", stderr));
    }

    let duration_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    duration_str
        .parse::<f64>()
        .map_err(|e| format!("invalid duration '{}': {}", duration_str, e))
}

fn has_audio_stream(video_path: &str) -> bool {
    let output = Command::new("ffprobe")
        .arg("-v")
        .arg("error")
        .arg("-select_streams")
        .arg("a")
        .arg("-show_entries")
        .arg("stream=codec_type")
        .arg("-of")
        .arg("csv=p=0")
        .arg(video_path)
        .output();

    match output {
        Ok(o) => !String::from_utf8_lossy(&o.stdout).trim().is_empty(),
        Err(_) => false,
    }
}

fn chunk_video_if_needed(
    video_path: &str,
    chunks_dir: &str,
    chunk_duration_secs: f64,
) -> Result<Vec<String>, String> {
    let normalized_video_path = normalize_path(video_path);
    let duration = check_video_duration(&normalized_video_path)?;
    let base_name = Path::new(&normalized_video_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("video");

    if duration <= chunk_duration_secs {
        return Ok(vec![normalized_video_path]);
    }

    fs::create_dir_all(chunks_dir).map_err(|e| e.to_string())?;
    let output_template = format!("{}/{}_chunk_%03d.mp4", chunks_dir, base_name);

    let output = Command::new("ffmpeg")
        .arg("-y")
        .arg("-i")
        .arg(&normalized_video_path)
        .arg("-c:v")
        .arg("libx264")
        .arg("-crf")
        .arg("18")
        .arg("-preset")
        .arg("fast")
        .arg("-c:a")
        .arg("aac")
        .arg("-map")
        .arg("0:v")
        .arg("-map")
        .arg("0:a?")
        .arg("-f")
        .arg("segment")
        .arg("-segment_time")
        .arg(chunk_duration_secs.to_string())
        .arg("-reset_timestamps")
        .arg("1")
        .arg(&output_template)
        .output()
        .map_err(|e| format!("ffmpeg chunking failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg chunking failed: {}", stderr));
    }

    let chunk_prefix = format!("{}/{}_chunk_", chunks_dir, base_name);
    let mut chunk_paths = Vec::new();
    let entries = fs::read_dir(chunks_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        if let Some(path_str) = entry.path().to_str() {
            let normalized = normalize_path(path_str);
            if normalized.starts_with(&chunk_prefix) && normalized.ends_with(".mp4") {
                chunk_paths.push(normalized);
            }
        }
    }
    chunk_paths.sort();
    Ok(chunk_paths)
}

fn extract_audio(chunk_path: &str, audio_dir: &str) -> Result<Option<String>, String> {
    let normalized_chunk_path = normalize_path(chunk_path);
    if !has_audio_stream(&normalized_chunk_path) {
        return Ok(None);
    }

    fs::create_dir_all(audio_dir).map_err(|e| e.to_string())?;
    let chunk_name = Path::new(&normalized_chunk_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| format!("Could not derive chunk name from {}", normalized_chunk_path))?;

    let output_path = format!("{}/{}.mp3", normalize_path(audio_dir), chunk_name);
    let output = Command::new("ffmpeg")
        .arg("-y")
        .arg("-i")
        .arg(&normalized_chunk_path)
        .arg("-vn")
        .arg("-acodec")
        .arg("libmp3lame")
        .arg("-b:a")
        .arg("192k")
        .arg(&output_path)
        .output()
        .map_err(|e| format!("ffmpeg audio extraction failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg audio extraction failed: {}", stderr));
    }

    Ok(Some(output_path))
}

fn extract_thumbnails(chunk_path: &str, chunk_thumbs_dir: &str) -> Result<Vec<String>, String> {
    let normalized_chunk_path = normalize_path(chunk_path);
    let normalized_thumbs_dir = normalize_path(chunk_thumbs_dir);
    fs::create_dir_all(&normalized_thumbs_dir).map_err(|e| e.to_string())?;

    let duration = check_video_duration(&normalized_chunk_path).unwrap_or(3.0);
    let (start_ts, middle_ts, end_ts) = if duration.is_finite() && duration > 0.0 {
        let epsilon = 0.1_f64;
        let end_offset = 0.2_f64;
        let start = if duration > epsilon { epsilon } else { 0.0 };
        let middle = (duration / 2.0).max(0.0);
        let end = if duration > end_offset {
            (duration - end_offset).max(0.0)
        } else {
            (duration * 0.8).max(0.0)
        };
        (start, middle, end)
    } else {
        (0.0, 1.0, 2.0)
    };

    let outputs = vec![
        (start_ts, format!("{}/start.jpg", normalized_thumbs_dir)),
        (middle_ts, format!("{}/middle.jpg", normalized_thumbs_dir)),
        (end_ts, format!("{}/end.jpg", normalized_thumbs_dir)),
    ];

    for (ts, out_path) in &outputs {
        let output = Command::new("ffmpeg")
            .arg("-y")
            .arg("-ss")
            .arg(ts.to_string())
            .arg("-i")
            .arg(&normalized_chunk_path)
            .arg("-frames:v")
            .arg("1")
            .arg("-q:v")
            .arg("2")
            .arg(out_path)
            .output()
            .map_err(|e| format!("ffmpeg thumbnail extraction failed: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("ffmpeg thumbnail extraction failed: {}", stderr));
        }
    }

    Ok(outputs.into_iter().map(|(_, p)| p).collect())
}

async fn build_chunk_artifacts(
    chunk_paths: Vec<String>,
    audio_dir: String,
    thumbnails_dir: String,
) -> Result<Vec<ChunkArtifact>, String> {
    let mut set = JoinSet::new();

    for chunk_path in chunk_paths {
        let audio_dir_clone = audio_dir.clone();
        let thumbnails_dir_clone = thumbnails_dir.clone();
        set.spawn_blocking(move || {
            let chunk_name = Path::new(&chunk_path)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("chunk")
                .to_string();
            let chunk_thumb_dir = format!("{}/{}", normalize_path(&thumbnails_dir_clone), chunk_name);
            let audio = extract_audio(&chunk_path, &audio_dir_clone)?;
            let thumbs = extract_thumbnails(&chunk_path, &chunk_thumb_dir)?;

            Ok::<ChunkArtifact, String>(ChunkArtifact {
                chunk_path,
                audio_path: audio,
                thumbnail_paths: thumbs,
            })
        });
    }

    let mut artifacts = Vec::new();
    while let Some(joined) = set.join_next().await {
        let artifact = joined
            .map_err(|e| format!("chunk task join failed: {}", e))?
            .map_err(|e| format!("chunk processing failed: {}", e))?;
        artifacts.push(artifact);
    }

    artifacts.sort_by(|a, b| a.chunk_path.cmp(&b.chunk_path));
    Ok(artifacts)
}

async fn generate_transcripts<C>(groq: &C, artifacts: &[ChunkArtifact]) -> HashMap<String, Value>
where
    C: TranscriptionClient + Clone + 'static,
{
    let mut audio_items: Vec<(String, Vec<u8>)> = Vec::new();
    for artifact in artifacts {
        if let Some(audio_path) = &artifact.audio_path {
            if let Ok(bytes) = fs::read(audio_path) {
                let key = Path::new(audio_path)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or_default()
                    .to_string();
                if !key.is_empty() {
                    audio_items.push((key, bytes));
                }
            }
        }
    }

    let mut map = HashMap::new();
    for batch in audio_items.chunks(4) {
        let mut set = JoinSet::new();
        for (key, bytes) in batch {
            let client = groq.clone();
            let key_clone = key.clone();
            let bytes_clone = bytes.clone();
            set.spawn(async move {
                let result = client.transcribe_audio_bytes(&key_clone, bytes_clone).await;
                (key_clone, result)
            });
        }

        while let Some(joined) = set.join_next().await {
            if let Ok((key, Ok(payload))) = joined {
                map.insert(key, payload);
            }
        }
    }
    map
}

async fn generate_frame_summaries<C>(
    groq: &C,
    artifacts: &[ChunkArtifact],
) -> HashMap<String, Vec<Value>>
where
    C: TranscriptionClient + Clone + 'static,
{
    let mut grouped: HashMap<String, Vec<Value>> = HashMap::new();

    let mut flat_items: Vec<(String, usize, Vec<u8>)> = Vec::new();
    for artifact in artifacts {
        let chunk_stem = Path::new(&artifact.chunk_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_string();
        for (idx, path) in artifact.thumbnail_paths.iter().enumerate() {
            if let Ok(bytes) = fs::read(path) {
                flat_items.push((chunk_stem.clone(), idx, bytes));
            }
        }
    }

    for batch in flat_items.chunks(4) {
        let mut set = JoinSet::new();
        for (chunk_stem, idx, bytes) in batch {
            let client = groq.clone();
            let chunk_stem_clone = chunk_stem.clone();
            let bytes_clone = bytes.clone();
            let image_id = format!("{}_{}", chunk_stem_clone, idx);

            set.spawn(async move {
                let result = client.summarize_image_bytes(&image_id, bytes_clone).await;
                (chunk_stem_clone, result)
            });
        }

        while let Some(joined) = set.join_next().await {
            if let Ok((chunk_stem, Ok(entry))) = joined {
                grouped.entry(chunk_stem).or_default().push(entry);
            }
        }
    }

    grouped
}

fn extract_transcript_text(transcript_payload: &Value) -> String {
    if let Some(segments) = transcript_payload.get("segments").and_then(Value::as_array) {
        let mut parts = Vec::new();
        for segment in segments {
            if let Some(text) = segment.get("text").and_then(Value::as_str) {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    parts.push(trimmed.to_string());
                }
            }
        }
        if !parts.is_empty() {
            return parts.join(" ");
        }
    }

    transcript_payload
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

async fn index_video_with_deps<D>(
    video_id: &str,
    content_hash: &str,
    video_path: &str,
    output_dir: &str,
    chunk_duration_secs: f64,
    deps: &D,
    store: &dyn VideoIndexStore,
) -> Result<VideoIndexResult, String>
where
    D: VideoIndexerDeps,
{
    let normalized_out_dir = normalize_path(output_dir);
    let chunks_dir = format!("{}/chunks", normalized_out_dir);
    let audio_dir = format!("{}/audio", normalized_out_dir);
    let thumbnails_dir = format!("{}/thumbnails", normalized_out_dir);

    fs::create_dir_all(&chunks_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&audio_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&thumbnails_dir).map_err(|e| e.to_string())?;

    let chunk_paths = deps
        .chunk_video_if_needed(video_path, &chunks_dir, chunk_duration_secs)
        .await?;

    let artifacts = deps
        .build_chunk_artifacts(chunk_paths, audio_dir.clone(), thumbnails_dir.clone())
        .await?;
    let transcripts = deps.generate_transcripts(&artifacts).await;
    let frame_summaries = deps.generate_frame_summaries(&artifacts).await;

    let mut cumulative_time = 0.0_f64;
    let mut chunks_created = 0_usize;
    let mut video_registered = false;

    for artifact in &artifacts {
        let Some(audio_path) = &artifact.audio_path else {
            continue;
        };

        let audio_stem = Path::new(audio_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default();

        let Some(transcript_payload) = transcripts.get(audio_stem) else {
            continue;
        };

        if !video_registered {
            store
                .create_video(video_id, content_hash, 0, video_path)
                .await?;
            video_registered = true;
        }

        let duration = transcript_payload
            .get("duration")
            .and_then(Value::as_f64)
            .unwrap_or(chunk_duration_secs);
        let transcript_text = extract_transcript_text(transcript_payload);

        let start_time = cumulative_time;
        let end_time = cumulative_time + duration;
        cumulative_time = end_time;

        let chunk_id = Uuid::new_v4().to_string();
        let chunk_input = ChunkCreateInput {
            video_id: video_id.to_string(),
            chunk_id: chunk_id.clone(),
            start_time: start_time.floor() as i64,
            end_time: end_time.floor() as i64,
            transcript: transcript_text.clone(),
        };

        store.create_chunk(&chunk_input).await?;
        store
            .create_video_chunk_relationship(video_id, &chunk_id)
            .await?;
        store
            .create_transcript_node(&chunk_id, &transcript_text)
            .await?;
        store
            .create_transcript_embeddings(&chunk_id, &transcript_payload.to_string())
            .await?;

        let chunk_stem = Path::new(&artifact.chunk_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_string();
        if let Some(entries) = frame_summaries.get(&chunk_stem) {
            let raw = Value::Array(entries.clone()).to_string();
            store.create_frame_summary_node(&chunk_id, &raw).await?;
            store.create_frame_summary_embeddings(&chunk_id, &raw).await?;
        }

        chunks_created += 1;
    }

    if video_registered {
        store
            .update_video_chunk_count(video_id, chunks_created)
            .await?;
    }

    Ok(VideoIndexResult {
        video_path: normalize_path(video_path),
        indexed: chunks_created > 0,
        chunks_created,
        error: None,
    })
}

pub async fn index_video_with_sidecar<C>(
    video_id: &str,
    content_hash: &str,
    video_path: &str,
    output_dir: &str,
    chunk_duration_secs: f64,
    groq: &C,
    store: &dyn VideoIndexStore,
) -> Result<VideoIndexResult, String>
where
    C: TranscriptionClient + Clone + 'static,
{
    let deps = SidecarVideoIndexerDeps { groq: groq.clone() };
    index_video_with_deps(
        video_id,
        content_hash,
        video_path,
        output_dir,
        chunk_duration_secs,
        &deps,
        store,
    )
    .await
}

#[cfg(test)]
mod property_tests;
