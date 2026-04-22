use super::*;
use async_trait::async_trait;
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::sidecar::rpc::indexing::adapters::store::{ExistingImageRecord, ImageIndexStore};

#[derive(Clone)]
struct ScenarioItem {
    path: String,
    content_hash: String,
    summary: Value,
}

#[derive(Clone)]
struct Scenario {
    items: Vec<ScenarioItem>,
    unique_hashes: usize,
}

#[derive(Clone)]
struct MockDeps {
    summaries_by_hash: HashMap<String, Value>,
}

#[async_trait]
impl ImageIndexerDeps for MockDeps {
    async fn summarize_image(
        &self,
        _image_id: &str,
        _mime_hint: &str,
        image_bytes: Vec<u8>,
    ) -> Result<Value, String> {
        let mut hasher = Sha256::new();
        hasher.update(&image_bytes);
        let content_hash = format!("{:x}", hasher.finalize());

        self.summaries_by_hash
            .get(&content_hash)
            .cloned()
            .ok_or_else(|| format!("missing summary for hash {}", content_hash))
    }
}

#[derive(Clone, Debug)]
enum StoreCall {
    CreateImage {
        image_id: String,
        content_hash: String,
        path: String,
    },
    CreateImageEmbeddings {
        image_id: String,
        path: String,
    },
}

#[derive(Default)]
struct MockStore {
    calls: Mutex<Vec<StoreCall>>,
    known_hashes: Mutex<HashMap<String, String>>,
    fail_at_call: Mutex<Option<usize>>,
}

impl MockStore {
    fn with_failure(fail_at_call: usize) -> Self {
        Self {
            calls: Mutex::new(Vec::new()),
            known_hashes: Mutex::new(HashMap::new()),
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
impl ImageIndexStore for MockStore {
    async fn get_image_by_hash(
        &self,
        content_hash: &str,
    ) -> Result<Option<ExistingImageRecord>, String> {
        Ok(self
            .known_hashes
            .lock()
            .expect("known hashes mutex poisoned")
            .get(content_hash)
            .cloned()
            .map(|image_id| ExistingImageRecord { image_id }))
    }

    async fn create_image(
        &self,
        image_id: &str,
        content_hash: &str,
        _content: &str,
        path: &str,
    ) -> Result<(), String> {
        self.push_or_fail(StoreCall::CreateImage {
            image_id: image_id.to_string(),
            content_hash: content_hash.to_string(),
            path: path.to_string(),
        })?;
        self.known_hashes
            .lock()
            .expect("known hashes mutex poisoned")
            .insert(content_hash.to_string(), image_id.to_string());
        Ok(())
    }

    async fn create_image_embeddings(
        &self,
        image_id: &str,
        _content: &str,
        path: &str,
    ) -> Result<(), String> {
        self.push_or_fail(StoreCall::CreateImageEmbeddings {
            image_id: image_id.to_string(),
            path: path.to_string(),
        })
    }
}

fn make_temp_dir(name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("time")
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("image-indexer-{}-{}", name, nanos));
    fs::create_dir_all(&dir).expect("create temp dir");
    dir
}

fn random_summary(rng: &mut StdRng, idx: usize) -> Value {
    let object_count = rng.random_range(0..=3);
    let action_count = rng.random_range(0..=2);

    json!({
        "summary": format!("image summary {}", idx),
        "objects": (0..object_count)
            .map(|obj_idx| format!("object_{}_{}", idx, obj_idx))
            .collect::<Vec<String>>(),
        "actions": (0..action_count)
            .map(|action_idx| format!("action_{}_{}", idx, action_idx))
            .collect::<Vec<String>>(),
        "setting": if rng.random_bool(0.7) { format!("setting_{}", idx) } else { String::new() },
        "ocr": if rng.random_bool(0.5) { format!("ocr text {}", idx) } else { String::new() },
        "quality": if rng.random_bool(0.8) { "good" } else { "low" },
    })
}

fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn random_scenario(rng: &mut StdRng) -> Scenario {
    let temp_dir = make_temp_dir("scenario");
    let item_count = rng.random_range(1..=8);
    let extensions = ["jpg", "jpeg", "png", "webp"];

    let mut prior_bytes: Vec<Vec<u8>> = Vec::new();
    let mut items = Vec::with_capacity(item_count);
    let mut unique_hashes = HashSet::new();

    for idx in 0..item_count {
        let bytes = if !prior_bytes.is_empty() && rng.random_bool(0.35) {
            prior_bytes[rng.random_range(0..prior_bytes.len())].clone()
        } else {
            let len = rng.random_range(8..=64);
            let data = (0..len)
                .map(|_| rng.random_range(0..=255) as u8)
                .collect::<Vec<u8>>();
            prior_bytes.push(data.clone());
            data
        };

        let ext = extensions[rng.random_range(0..extensions.len())];
        let path = temp_dir.join(format!("image_{:03}.{}", idx, ext));
        fs::write(&path, &bytes).expect("write image fixture");

        let content_hash = hash_bytes(&bytes);
        unique_hashes.insert(content_hash.clone());

        items.push(ScenarioItem {
            path: path.to_string_lossy().replace('\\', "/"),
            content_hash,
            summary: random_summary(rng, idx),
        });
    }

    Scenario {
        items,
        unique_hashes: unique_hashes.len(),
    }
}

#[tokio::test]
async fn image_indexer_randomized_pipeline_properties() {
    for seed in 0_u64..100 {
        let mut rng = StdRng::seed_from_u64(seed);
        let scenario = random_scenario(&mut rng);

        let deps = MockDeps {
            summaries_by_hash: scenario
                .items
                .iter()
                .map(|item| (item.content_hash.clone(), item.summary.clone()))
                .collect(),
        };
        let store = MockStore::default();

        let results = index_images_with_deps(
            scenario
                .items
                .iter()
                .map(|item| item.path.clone())
                .collect::<Vec<String>>(),
            &deps,
            &store,
        )
        .await;

        assert_eq!(results.len(), scenario.items.len(), "seed {}: result count mismatch", seed);

        let indexed_count = results.iter().filter(|result| result.indexed).count();
        let duplicate_count = results
            .iter()
            .filter(|result| result.error.as_deref() == Some("Duplicate content hash"))
            .count();

        assert_eq!(
            indexed_count,
            scenario.unique_hashes,
            "seed {}: indexed unique hash count mismatch",
            seed
        );
        assert_eq!(
            duplicate_count,
            scenario.items.len() - scenario.unique_hashes,
            "seed {}: duplicate count mismatch",
            seed
        );

        let calls = store.snapshot();
        let create_image_calls = calls
            .iter()
            .filter_map(|call| match call {
                StoreCall::CreateImage {
                    image_id,
                    content_hash,
                    path,
                } => Some((image_id.clone(), content_hash.clone(), path.clone())),
                _ => None,
            })
            .collect::<Vec<_>>();
        let create_embedding_calls = calls
            .iter()
            .filter_map(|call| match call {
                StoreCall::CreateImageEmbeddings { image_id, path } => {
                    Some((image_id.clone(), path.clone()))
                }
                _ => None,
            })
            .collect::<Vec<_>>();

        assert_eq!(create_image_calls.len(), scenario.unique_hashes);
        assert_eq!(create_embedding_calls.len(), scenario.unique_hashes);

        let create_image_ids = create_image_calls
            .iter()
            .map(|(image_id, _, _)| image_id.clone())
            .collect::<HashSet<_>>();
        let create_embedding_ids = create_embedding_calls
            .iter()
            .map(|(image_id, _)| image_id.clone())
            .collect::<HashSet<_>>();

        assert_eq!(create_image_ids.len(), scenario.unique_hashes);
        assert_eq!(create_embedding_ids.len(), scenario.unique_hashes);
        assert_eq!(create_image_ids, create_embedding_ids);

        for result in results.iter().filter(|result| result.indexed) {
            let image_id = result.image_id.clone().expect("indexed result image id");
            assert!(create_image_ids.contains(&image_id));
            assert_eq!(result.error, None);
        }
    }
}

#[tokio::test]
async fn image_indexer_randomized_store_failures_are_reported() {
    for seed in 0_u64..50 {
        let mut rng = StdRng::seed_from_u64(seed + 10_000);
        let scenario = random_scenario(&mut rng);
        let max_store_calls = (scenario.unique_hashes * 2).max(1);
        let fail_at = rng.random_range(1..=max_store_calls);

        let deps = MockDeps {
            summaries_by_hash: scenario
                .items
                .iter()
                .map(|item| (item.content_hash.clone(), item.summary.clone()))
                .collect(),
        };
        let store = MockStore::with_failure(fail_at);

        let results = index_images_with_deps(
            scenario
                .items
                .iter()
                .map(|item| item.path.clone())
                .collect::<Vec<String>>(),
            &deps,
            &store,
        )
        .await;

        assert!(
            results.iter().any(|result| result.error.is_some()),
            "seed {}: expected at least one reported error",
            seed
        );
        assert!(
            store.snapshot().len() >= fail_at,
            "seed {}: failing store call should be recorded",
            seed
        );
    }
}

#[test]
fn normalize_summary_content_random_payloads_never_panics() {
    let mut rng = StdRng::seed_from_u64(42);

    for idx in 0..500 {
        let payload = match rng.random_range(0..5) {
            0 => format!(
                "{{\"summary\":\"summary {}\",\"objects\":[\"cat\"],\"actions\":[\"sitting\"],\"setting\":\"room\",\"ocr\":\"text\",\"quality\":\"good\"}}",
                idx
            ),
            1 => format!(
                "```json\n{{\"summary\":\"fenced {}\",\"objects\":[],\"actions\":[],\"setting\":\"\",\"ocr\":\"\",\"quality\":\"low\"}}\n```",
                idx
            ),
            2 => format!("plain text summary {}", idx),
            3 => format!(
                "{{\"summary\":\"```json\\n{{\\\"summary\\\":\\\"nested {}\\\"}}\\n```\"}}",
                idx
            ),
            _ => "{\"summary\":123,\"objects\":\"bad-shape\"}".to_string(),
        };

        let normalized = normalize_summary_content(&payload);
        let summary = normalized
            .get("summary")
            .and_then(Value::as_str)
            .expect("summary string");
        assert_eq!(summary, summary.trim());

        let embedding = build_embedding_text(&normalized);
        assert_eq!(embedding, embedding.trim());
    }
}
