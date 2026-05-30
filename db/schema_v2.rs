use helix_db::dsl::prelude::*;

// Migrated from db/schema.hx (HQL) to Helix v2 Rust DSL.
// This file defines setup-time index creation only; schema labels/properties are implicit in v2.

#[register]
pub fn EnsureAssetIndexes() -> WriteBatch {
    write_batch()
        .step(g().create_index_if_not_exists(IndexSpec::node_equality(
            "Asset",
            "content_hash",
        )))
        .step(g().create_vector_index_nodes("AssetEmbedding", "embedding", None))
        .returning([])
}

