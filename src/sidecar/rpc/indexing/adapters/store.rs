use async_trait::async_trait;

#[derive(Debug, Clone)]
pub struct ExistingFileRecord {
    pub asset_id: String,
}

#[derive(Debug, Clone)]
pub struct ExistingImageRecord {
    pub asset_id: String,
}

#[derive(Debug, Clone)]
pub struct ExistingVideoRecord {
    pub asset_id: String,
}

#[async_trait]
pub trait TextIndexStore: Send + Sync {
    async fn get_file_by_hash(
        &self,
        content_hash: &str,
    ) -> Result<Option<ExistingFileRecord>, String>;

    async fn create_file_asset(
        &self,
        content_hash: &str,
        kind: &str,
        path: &str,
    ) -> Result<(), String>;

    async fn create_file_asset_embeddings(
        &self,
        content_hash: &str,
        unit_kind: &str,
        unit_key: &str,
        content: &str,
    ) -> Result<(), String>;
}

#[async_trait]
pub trait ImageIndexStore: Send + Sync {
    async fn get_image_by_hash(
        &self,
        content_hash: &str,
    ) -> Result<Option<ExistingImageRecord>, String>;

    async fn create_image_asset(
        &self,
        content_hash: &str,
        kind: &str,
        path: &str,
    ) -> Result<(), String>;

    async fn create_image_asset_embeddings(
        &self,
        content_hash: &str,
        unit_kind: &str,
        unit_key: &str,
        content: &str,
    ) -> Result<(), String>;
}

#[async_trait]
pub trait VideoIndexStore: Send + Sync {
    async fn get_video_by_hash(
        &self,
        content_hash: &str,
    ) -> Result<Option<ExistingVideoRecord>, String>;
    async fn video_asset_has_embeddings(&self, content_hash: &str) -> Result<bool, String>;

    async fn create_video_asset(
        &self,
        content_hash: &str,
        kind: &str,
        path: &str,
    ) -> Result<(), String>;

    async fn create_video_asset_embeddings(
        &self,
        content_hash: &str,
        unit_kind: &str,
        unit_key: &str,
        content: &str,
    ) -> Result<(), String>;
}
