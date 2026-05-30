// MIGRATED: Helix v2 Rust DSL equivalent lives in db/schema_v2.rs (source retained for compatibility).
N::Asset {
    INDEX content_hash: String,
    kind: String,
    path: String,
}

V::AssetEmbedding{
    unit_key: String,
    unit_kind: String,
    content: String,
}

E::HasAssetEmbedding {
    From: Asset,
    To: AssetEmbedding,
    Properties: {
        created_at: Date DEFAULT NOW,
    }
}
