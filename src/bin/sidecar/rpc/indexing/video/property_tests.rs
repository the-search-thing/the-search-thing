use super::*;
use async_trait::async_trait;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;

use crate::sidecar::rpc::indexing::adapters::store::ExistingVideoRecord;

#[derive(Clone)]
struct Scenario {
    artifacts: Vec<ChunkArtifact>,
    transcripts: HashMap<String, Value>,
    frame_summaries: HashMap<String, Vec<Value>>,
}

#[derive(Clone)]
struct MockDeps {
    scenario: Scenario,
}

#[async_trait]
impl VideoIndexerDeps for MockDeps {
    async fn chunk_video_if_needed(
        &self,
        _video_path: &str,
        _chunks_dir: &str,
        _chunk_duration_secs: f64,
    ) -> Result<Vec<String>, String> {
        Ok(self
            .scenario
            .artifacts
            .iter()
            .map(|a| a.chunk_path.clone())
            .collect())
    }

    async fn build_chunk_artifacts(
        &self,
        _chunk_paths: Vec<String>,
        _audio_dir: String,
        _thumbnails_dir: String,
    ) -> Result<Vec<ChunkArtifact>, String> {
        Ok(self.scenario.artifacts.clone())
    }

    async fn generate_transcripts(&self, _artifacts: &[ChunkArtifact]) -> HashMap<String, Value> {
        self.scenario.transcripts.clone()
    }

    async fn generate_frame_summaries(
        &self,
        _artifacts: &[ChunkArtifact],
    ) -> HashMap<String, Vec<Value>> {
        self.scenario.frame_summaries.clone()
    }
}

#[derive(Clone, Debug)]
enum StoreCall {
    CreateVideo,
    CreateChunk {
        chunk_id: String,
        start_time: i64,
        end_time: i64,
    },
    CreateVideoChunkRelationship { chunk_id: String },
    CreateTranscriptNode { chunk_id: String },
    CreateTranscriptEmbeddings { chunk_id: String },
    CreateFrameSummaryNode { chunk_id: String },
    CreateFrameSummaryEmbeddings { chunk_id: String },
    UpdateVideoChunkCount,
}

#[derive(Default)]
struct MockStore {
    calls: Mutex<Vec<StoreCall>>,
    fail_at_call: Mutex<Option<usize>>,
}

impl MockStore {
    fn with_failure(fail_at_call: usize) -> Self {
        Self {
            calls: Mutex::new(Vec::new()),
            fail_at_call: Mutex::new(Some(fail_at_call)),
        }
    }

    fn push_or_fail(&self, call: StoreCall) -> Result<(), String> {
        let mut calls = self.calls.lock().expect("calls mutex poisoned");
        calls.push(call);
        let idx = calls.len();
        let fail_at = *self
            .fail_at_call
            .lock()
            .expect("fail_at_call mutex poisoned");
        if fail_at == Some(idx) {
            return Err(format!("injected failure at store call {}", idx));
        }
        Ok(())
    }

    fn snapshot(&self) -> Vec<StoreCall> {
        self.calls.lock().expect("calls mutex poisoned").clone()
    }
}

#[async_trait]
impl VideoIndexStore for MockStore {
    async fn get_video_by_hash(&self, _content_hash: &str) -> Result<Option<ExistingVideoRecord>, String> {
        Ok(None)
    }

    async fn create_video(
        &self,
        _video_id: &str,
        _content_hash: &str,
        _no_of_chunks: usize,
        _path: &str,
    ) -> Result<(), String> {
        self.push_or_fail(StoreCall::CreateVideo)
    }

    async fn create_chunk(&self, chunk: &ChunkCreateInput) -> Result<(), String> {
        self.push_or_fail(StoreCall::CreateChunk {
            chunk_id: chunk.chunk_id.clone(),
            start_time: chunk.start_time,
            end_time: chunk.end_time,
        })
    }

    async fn create_video_chunk_relationship(
        &self,
        _video_id: &str,
        chunk_id: &str,
    ) -> Result<(), String> {
        self.push_or_fail(StoreCall::CreateVideoChunkRelationship {
            chunk_id: chunk_id.to_string(),
        })
    }

    async fn create_transcript_node(&self, chunk_id: &str, _content: &str) -> Result<(), String> {
        self.push_or_fail(StoreCall::CreateTranscriptNode {
            chunk_id: chunk_id.to_string(),
        })
    }

    async fn create_transcript_embeddings(
        &self,
        chunk_id: &str,
        _content: &str,
    ) -> Result<(), String> {
        self.push_or_fail(StoreCall::CreateTranscriptEmbeddings {
            chunk_id: chunk_id.to_string(),
        })
    }

    async fn create_frame_summary_node(&self, chunk_id: &str, _content: &str) -> Result<(), String> {
        self.push_or_fail(StoreCall::CreateFrameSummaryNode {
            chunk_id: chunk_id.to_string(),
        })
    }

    async fn create_frame_summary_embeddings(
        &self,
        chunk_id: &str,
        _content: &str,
    ) -> Result<(), String> {
        self.push_or_fail(StoreCall::CreateFrameSummaryEmbeddings {
            chunk_id: chunk_id.to_string(),
        })
    }

    async fn update_video_chunk_count(
        &self,
        _video_id: &str,
        _no_of_chunks: usize,
    ) -> Result<(), String> {
        self.push_or_fail(StoreCall::UpdateVideoChunkCount)
    }
}

fn random_scenario(rng: &mut StdRng) -> Scenario {
    let chunk_count = rng.random_range(1..=8);
    let mut artifacts = Vec::with_capacity(chunk_count);
    let mut transcripts = HashMap::new();
    let mut frame_summaries = HashMap::new();

    for idx in 0..chunk_count {
        let stem = format!("video_chunk_{:03}", idx);
        let chunk_path = format!("/tmp/chunks/{}.mp4", stem);
        let has_audio = rng.random_bool(0.8);
        let audio_path = has_audio.then(|| format!("/tmp/audio/{}.mp3", stem));

        let thumb_count = rng.random_range(1..=3);
        let thumbnail_paths = (0..thumb_count)
            .map(|thumb_idx| format!("/tmp/thumbs/{}/{}.jpg", stem, thumb_idx))
            .collect::<Vec<_>>();

        if has_audio && rng.random_bool(0.85) {
            let duration = rng.random_range(2.0_f64..60.0_f64);
            let payload = if rng.random_bool(0.5) {
                json!({
                    "duration": duration,
                    "segments": [
                        { "text": "hello" },
                        { "text": "from property tests" }
                    ]
                })
            } else {
                json!({ "duration": duration, "text": "single field transcript" })
            };
            transcripts.insert(stem.clone(), payload);

            if rng.random_bool(0.6) {
                let entry_count = rng.random_range(1..=3);
                let entries = (0..entry_count)
                    .map(|entry_idx| {
                        json!({
                            "image": format!("{}_{}", stem, entry_idx),
                            "summary": { "summary": "frame summary" }
                        })
                    })
                    .collect::<Vec<_>>();
                frame_summaries.insert(stem.clone(), entries);
            }
        }

        artifacts.push(ChunkArtifact {
            chunk_path,
            audio_path,
            thumbnail_paths,
        });
    }

    Scenario {
        artifacts,
        transcripts,
        frame_summaries,
    }
}

fn expected_created_chunks(scenario: &Scenario) -> usize {
    scenario
        .artifacts
        .iter()
        .filter(|artifact| {
            artifact.audio_path.as_ref().is_some_and(|audio_path| {
                let stem = Path::new(audio_path)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or_default();
                scenario.transcripts.contains_key(stem)
            })
        })
        .count()
}

#[tokio::test]
async fn video_indexer_randomized_pipeline_properties() {
    for seed in 0_u64..100 {
        let mut rng = StdRng::seed_from_u64(seed);
        let scenario = random_scenario(&mut rng);
        let expected_chunks = expected_created_chunks(&scenario);
        let expected_frame_summary_chunks = scenario
            .artifacts
            .iter()
            .filter_map(|artifact| {
                let audio_path = artifact.audio_path.as_ref()?;
                let stem = Path::new(audio_path)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or_default()
                    .to_string();
                if scenario.transcripts.contains_key(&stem)
                    && scenario.frame_summaries.contains_key(&stem)
                {
                    Some(())
                } else {
                    None
                }
            })
            .count();

        let deps = MockDeps {
            scenario: scenario.clone(),
        };
        let store = MockStore::default();

        let result = index_video_with_deps(
            "video-1",
            "hash-1",
            "/tmp/input.mp4",
            "/tmp/out",
            30.0,
            &deps,
            &store,
        )
        .await
        .expect("indexing should succeed");

        let calls = store.snapshot();
        assert_eq!(
            calls
                .iter()
                .filter(|c| matches!(c, StoreCall::CreateVideo))
                .count(),
            if expected_chunks > 0 { 1 } else { 0 },
            "seed {}: create_video should run only when chunks exist",
            seed
        );

        if expected_chunks > 0 {
            assert!(
                calls.iter().any(|c| matches!(c, StoreCall::UpdateVideoChunkCount)),
                "seed {}: update_video_chunk_count should run when chunks exist",
                seed
            );
        }

        let chunks = calls
            .iter()
            .filter_map(|call| match call {
                StoreCall::CreateChunk {
                    chunk_id,
                    start_time,
                    end_time,
                } => Some((chunk_id.clone(), *start_time, *end_time)),
                _ => None,
            })
            .collect::<Vec<_>>();

        assert_eq!(chunks.len(), expected_chunks, "seed {}: chunk count mismatch", seed);
        assert_eq!(result.chunks_created, expected_chunks);
        assert_eq!(result.indexed, expected_chunks > 0);

        let mut unique_chunk_ids = HashSet::new();
        let mut previous_start = -1_i64;
        for (chunk_id, start_time, end_time) in &chunks {
            assert!(unique_chunk_ids.insert(chunk_id.clone()));
            assert!(*end_time >= *start_time);
            assert!(*start_time >= previous_start);
            previous_start = *start_time;
        }

        let relationship_ids = calls
            .iter()
            .filter_map(|call| match call {
                StoreCall::CreateVideoChunkRelationship { chunk_id } => Some(chunk_id.clone()),
                _ => None,
            })
            .collect::<HashSet<_>>();

        let transcript_node_ids = calls
            .iter()
            .filter_map(|call| match call {
                StoreCall::CreateTranscriptNode { chunk_id } => Some(chunk_id.clone()),
                _ => None,
            })
            .collect::<HashSet<_>>();

        let transcript_embedding_ids = calls
            .iter()
            .filter_map(|call| match call {
                StoreCall::CreateTranscriptEmbeddings { chunk_id } => Some(chunk_id.clone()),
                _ => None,
            })
            .collect::<HashSet<_>>();

        assert_eq!(relationship_ids.len(), expected_chunks);
        assert_eq!(transcript_node_ids.len(), expected_chunks);
        assert_eq!(transcript_embedding_ids.len(), expected_chunks);

        for chunk_id in unique_chunk_ids {
            assert!(relationship_ids.contains(&chunk_id));
            assert!(transcript_node_ids.contains(&chunk_id));
            assert!(transcript_embedding_ids.contains(&chunk_id));
        }

        let frame_node_count = calls
            .iter()
            .filter(|c| matches!(c, StoreCall::CreateFrameSummaryNode { .. }))
            .count();
        let frame_embedding_count = calls
            .iter()
            .filter(|c| matches!(c, StoreCall::CreateFrameSummaryEmbeddings { .. }))
            .count();
        let frame_node_ids = calls
            .iter()
            .filter_map(|call| match call {
                StoreCall::CreateFrameSummaryNode { chunk_id } => Some(chunk_id.clone()),
                _ => None,
            })
            .collect::<HashSet<_>>();
        let frame_embedding_ids = calls
            .iter()
            .filter_map(|call| match call {
                StoreCall::CreateFrameSummaryEmbeddings { chunk_id } => Some(chunk_id.clone()),
                _ => None,
            })
            .collect::<HashSet<_>>();

        assert_eq!(frame_node_count, expected_frame_summary_chunks);
        assert_eq!(frame_embedding_count, expected_frame_summary_chunks);
        assert_eq!(frame_node_ids.len(), expected_frame_summary_chunks);
        assert_eq!(frame_embedding_ids.len(), expected_frame_summary_chunks);
    }
}

#[tokio::test]
async fn video_indexer_randomized_store_failure_propagates() {
    for seed in 0_u64..50 {
        let mut rng = StdRng::seed_from_u64(seed + 10_000);
        let scenario = random_scenario(&mut rng);
        let expected_chunks = expected_created_chunks(&scenario);
        let expected_frame_summary_chunks = scenario
            .artifacts
            .iter()
            .filter_map(|artifact| {
                let audio_path = artifact.audio_path.as_ref()?;
                let stem = Path::new(audio_path)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or_default()
                    .to_string();
                if scenario.transcripts.contains_key(&stem)
                    && scenario.frame_summaries.contains_key(&stem)
                {
                    Some(())
                } else {
                    None
                }
            })
            .count();

        // When expected_chunks == 0, no store calls are made (create_video is deferred),
        // so there is no failure point to inject — skip these seeds.
        if expected_chunks == 0 {
            continue;
        }

        // Max calls: create_video(1) + update_video_chunk_count(1) +
        //   per-chunk: create_chunk + relationship + transcript_node + transcript_embeddings (4)
        //   per frame-summary-chunk: frame_summary_node + frame_summary_embeddings (2)
        let guaranteed_max_call =
            (2 + (expected_chunks * 4) + (expected_frame_summary_chunks * 2)).max(1);
        let fail_at = rng.random_range(1..=guaranteed_max_call);

        let deps = MockDeps { scenario };
        let store = MockStore::with_failure(fail_at);

        let result = index_video_with_deps(
            "video-failing",
            "hash-failing",
            "/tmp/input.mp4",
            "/tmp/out",
            30.0,
            &deps,
            &store,
        )
        .await;

        assert!(result.is_err(), "seed {}: failure should propagate", seed);
        assert!(
            store.snapshot().len() <= fail_at,
            "seed {}: store should stop at failure point",
            seed
        );
    }
}

#[test]
fn extract_transcript_text_random_payloads_never_panics() {
    let mut rng = StdRng::seed_from_u64(42);

    for _ in 0..500 {
        let payload = match rng.random_range(0..5) {
            0 => json!({
                "segments": [
                    { "text": "hello" },
                    { "text": "world" }
                ]
            }),
            1 => json!({ "text": "fallback text" }),
            2 => json!({ "segments": [{ "text": "   " }, { "x": 1 }] }),
            3 => json!({ "segments": "not-an-array", "text": 123 }),
            _ => json!({ "nested": { "value": true } }),
        };

        let text = extract_transcript_text(&payload);
        assert_eq!(text, text.trim());
    }
}
