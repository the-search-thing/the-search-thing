use helix_db::dsl::prelude::*;

// Migrated from db/queries.hx (HQL) to Helix v2 Rust DSL.
// NOTE: HQL UpsertN/UpsertV/UpsertE are unsupported in v2 DSL.
// Upsert behavior must be implemented in application code by read-then-create/update branching.

#[register]
pub fn GetAssetByHash(content_hash: String) -> ReadBatch {
    read_batch()
        .var_as(
            "asset",
            g().n_with_label("Asset")
                .where_(Predicate::eq_param("content_hash", "content_hash"))
                .limit(1),
        )
        .returning(["asset"])
}

#[register]
pub fn CreateAsset(kind: String, path: String, content_hash: String) -> WriteBatch {
    write_batch()
        .var_as(
            "asset",
            g().add_n(
                "Asset",
                vec![
                    ("kind", kind.into()),
                    ("path", path.into()),
                    ("content_hash", content_hash.into()),
                ],
            ),
        )
        .returning(["asset"])
}

#[register]
pub fn GetAssetEmbeddingsByHash(content_hash: String) -> ReadBatch {
    read_batch()
        .var_as(
            "asset",
            g().n_with_label("Asset")
                .where_(Predicate::eq_param("content_hash", "content_hash"))
                .limit(1),
        )
        .var_as("embeddings", g().n(NodeRef::var("asset")).out(Some("HasAssetEmbedding")))
        .returning(["embeddings"])
}

#[register]
pub fn GetAssetEmbeddingByHashAndUnit(
    content_hash: String,
    unit_kind: String,
    unit_key: String,
) -> ReadBatch {
    read_batch()
        .var_as(
            "asset",
            g().n_with_label("Asset")
                .where_(Predicate::eq_param("content_hash", "content_hash"))
                .limit(1),
        )
        .var_as(
            "embedding",
            g().n(NodeRef::var("asset"))
                .out(Some("HasAssetEmbedding"))
                .where_(Predicate::and(vec![
                    Predicate::eq_param("unit_kind", "unit_kind"),
                    Predicate::eq_param("unit_key", "unit_key"),
                ]))
                .limit(1),
        )
        .returning(["embedding"])
}

#[register]
pub fn CreateAssetEmbeddingByHash(
    content_hash: String,
    unit_kind: String,
    unit_key: String,
    content: String,
    vector: Vec<f64>,
    created_at: String,
) -> WriteBatch {
    write_batch()
        .var_as(
            "asset",
            g().n_with_label("Asset")
                .where_(Predicate::eq_param("content_hash", "content_hash"))
                .limit(1),
        )
        .var_as(
            "embedding",
            g().add_n(
                "AssetEmbedding",
                vec![
                    ("unit_kind", unit_kind.into()),
                    ("unit_key", unit_key.into()),
                    ("content", content.into()),
                    ("embedding", vector.into()),
                ],
            ),
        )
        .step(
            g().n(NodeRef::var("asset")).add_e(
                "HasAssetEmbedding",
                NodeRef::var("embedding"),
                vec![("created_at", created_at.into())],
            ),
        )
        .returning(["embedding"])
}

#[register]
pub fn SearchAssetEmbeddings(vector: Vec<f64>) -> ReadBatch {
    read_batch()
        .var_as(
            "embeddings",
            g().vector_search_nodes_with(
                "AssetEmbedding",
                "embedding",
                PropertyInput::param("vector"),
                Expr::lit(50_i64),
                None::<PropertyInput>,
            ),
        )
        .var_as("assets", g().n(NodeRef::var("embeddings")).in_(Some("HasAssetEmbedding")))
        .returning(["assets"])
}

#[register]
pub fn ClearSearchIndex() -> WriteBatch {
    write_batch()
        .step(g().n_with_label("Asset").out(Some("HasAssetEmbedding")).drop())
        .step(g().n_with_label("Asset").drop())
        .returning([])
}

