QUERY CreateAsset(kind: String, path: String, content_hash: String) =>
    existing <- N<Asset>::WHERE(_::{content_hash}::EQ(content_hash))
    asset <- existing::UpsertN({
        kind: kind,
        content_hash: content_hash,
        path: path
    })
    RETURN asset

QUERY GetAssetByHash(content_hash: String) =>
    asset <- N<Asset>({content_hash: content_hash})
    RETURN asset

QUERY GetAssetEmbeddingsByHash(content_hash: String) =>
    asset <- N<Asset>({content_hash: content_hash})
    embeddings <- asset::Out<HasAssetEmbedding>
    RETURN embeddings

QUERY CreateAssetEmbeddingByHash(content_hash: String, unit_kind: String, unit_key: String, content: String,vector: [F64], created_at: Date) =>
    asset <- N<Asset>({content_hash: content_hash})
    existing_embedding <- asset::Out<HasAssetEmbedding>
        ::WHERE(_::{unit_kind}::EQ(unit_kind))
        ::WHERE(_::{unit_key}::EQ(unit_key))
    embedding <- existing_embedding::UpsertV(vector, { // this embed needs to leave, pass vectors directly as content
        unit_kind: unit_kind,
        unit_key: unit_key,
        content: content
    })
    existing_edge <- E<HasAssetEmbedding>
    has_embedding <- existing_edge::UpsertE({created_at: created_at})::From(asset)::To(embedding)
    RETURN embedding

QUERY SearchAssetEmbeddings(vector: [F64]) =>
    embeddings <- SearchV<AssetEmbedding>(vector, 50) // this embed needs to leave, pass vectors directly as query
    assets <- embeddings::In<HasAssetEmbedding>
    RETURN assets

QUERY ClearSearchIndex() =>
    DROP N<Asset>::Out<HasAssetEmbedding>
    DROP N<Asset>
    RETURN "cleared"
