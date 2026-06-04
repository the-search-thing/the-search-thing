use async_trait::async_trait;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Read;

#[async_trait]
pub trait PathHasher: Send + Sync {
    async fn compute_file_hash(&self, path: &str) -> Result<String, String>;
}

#[derive(Debug, Default)]
pub struct Sha256PathHasher;

#[async_trait]
impl PathHasher for Sha256PathHasher {
    async fn compute_file_hash(&self, path: &str) -> Result<String, String> {
        let path = path.to_string();
        tokio::task::spawn_blocking(move || {
            let mut file = File::open(&path).map_err(|e| e.to_string())?;
            let mut hasher = Sha256::new();
            let mut buffer = vec![0_u8; 1024 * 1024];

            loop {
                let bytes_read = file.read(&mut buffer).map_err(|e| e.to_string())?;
                if bytes_read == 0 {
                    break;
                }
                hasher.update(&buffer[..bytes_read]);
            }

            Ok(format!("{:x}", hasher.finalize()))
        })
        .await
        .map_err(|e| e.to_string())?
    }
}
