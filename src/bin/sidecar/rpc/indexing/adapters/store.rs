use async_trait::async_trait;

#[derive(Debug, Clone)]
pub struct ExistingFileRecord {
    pub file_id: String,
}

#[derive(Debug, Clone)]
pub struct ExistingVideoRecord {
    pub video_id: String,
}

#[derive(Debug, Clone)]
pub struct ExistingImageRecord {
    pub image_id: String,
}

#[derive(Debug, Clone)]
pub struct ChunkCreateInput {
    pub video_id: String,
    pub chunk_id: String,
    pub start_time: i64,
    pub end_time: i64,
    pub transcript: String,
}

#[async_trait]
pub trait TextIndexStore: Send + Sync {
    async fn get_file_by_hash(
        &self,
        content_hash: &str,
    ) -> Result<Option<ExistingFileRecord>, String>;

    async fn create_file(
        &self,
        file_id: &str,
        content_hash: &str,
        content: &str,
        path: &str,
    ) -> Result<(), String>;

    async fn create_file_embeddings(
        &self,
        file_id: &str,
        content: &str,
        path: &str,
    ) -> Result<(), String>;
}

#[async_trait]
pub trait ImageIndexStore: Send + Sync {
    async fn get_image_by_hash(
        &self,
        content_hash: &str,
    ) -> Result<Option<ExistingImageRecord>, String>;

    async fn create_image(
        &self,
        image_id: &str,
        content_hash: &str,
        content: &str,
        path: &str,
    ) -> Result<(), String>;

    async fn create_image_embeddings(
        &self,
        image_id: &str,
        content: &str,
        path: &str,
    ) -> Result<(), String>;
}

#[async_trait]
pub trait VideoIndexStore: Send + Sync {
    async fn get_video_by_hash(
        &self,
        content_hash: &str,
    ) -> Result<Option<ExistingVideoRecord>, String>;

    async fn create_video(
        &self,
        video_id: &str,
        content_hash: &str,
        no_of_chunks: usize,
        path: &str,
    ) -> Result<(), String>;

    async fn create_chunk(&self, chunk: &ChunkCreateInput) -> Result<(), String>;

    async fn create_video_chunk_relationship(
        &self,
        video_id: &str,
        chunk_id: &str,
    ) -> Result<(), String>;

    async fn create_transcript_node(&self, chunk_id: &str, content: &str) -> Result<(), String>;

    async fn create_transcript_embeddings(
        &self,
        chunk_id: &str,
        content: &str,
    ) -> Result<(), String>;

    async fn create_frame_summary_node(
        &self,
        chunk_id: &str,
        content: &str,
    ) -> Result<(), String>;

    async fn create_frame_summary_embeddings(
        &self,
        chunk_id: &str,
        content: &str,
    ) -> Result<(), String>;

    async fn update_video_chunk_count(
        &self,
        video_id: &str,
        no_of_chunks: usize,
    ) -> Result<(), String>;
}
