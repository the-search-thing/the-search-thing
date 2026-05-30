## Helix HQL -> Rust DSL Migration

Source files migrated:
- `db/schema.hx`
- `db/queries.hx`

Target files:
- `db/schema_v2.rs`
- `db/queries_v2.rs`

### Unsupported HQL Features Found

These were present in `db/queries.hx` and are not available in the v2 DSL:
- `UpsertN`
- `UpsertV`
- `UpsertE`

### Required Application-Side Behavior

To keep prior behavior, app code must do read-then-branch:

1. `CreateAsset` flow:
- call `GetAssetByHash`
- if found, reuse the existing asset
- if missing, call `CreateAsset`

2. `CreateAssetEmbeddingByHash` flow:
- call `GetAssetEmbeddingByHashAndUnit`
- if found, reuse existing embedding
- if missing, call `CreateAssetEmbeddingByHash`

### Notes

- `V::AssetEmbedding` is represented as node label `AssetEmbedding` with vector property `embedding`.
- Vector search is translated using `vector_search_nodes_with(...)` so query vector is parameterized.
- `created_at` is kept as an explicit parameter for parity with existing runtime payloads.

