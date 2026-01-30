use pyo3::{PyErr, PyResult};
use std::fs;
use std::path::Path;

// validate file exists
pub fn validate_file_exists(video_path: &str) -> PyResult<()> {
    if !Path::new(video_path).exists() {
        return Err(PyErr::new::<pyo3::exceptions::PyFileNotFoundError, _>(
            format!("Video file not found: {}", video_path),
        ));
    }
    Ok(())
}

// normalize path
pub fn normalize_path(video_path: &str, output_path: &str) -> (String, String) {
    let video_path = video_path.replace("\\", "/");
    let output_path = output_path.replace("\\", "/");
    (video_path, output_path)
}

// validate times
pub fn validate_times(start_time: f64, end_time: f64) -> PyResult<()> {
    if start_time < 0.0 {
        return Err(PyErr::new::<pyo3::exceptions::PyValueError, _>(format!(
            "start_time ({}) cannot be negative",
            start_time
        )));
    }
    if end_time < 0.0 {
        return Err(PyErr::new::<pyo3::exceptions::PyValueError, _>(format!(
            "end_time ({}) cannot be negative",
            end_time
        )));
    }
    if start_time >= end_time {
        return Err(PyErr::new::<pyo3::exceptions::PyValueError, _>(format!(
            "start_time ({}) should be smaller than end_time ({})",
            start_time, end_time
        )));
    }
    Ok(())
}

// // helper function to check file exists
// pub fn file_exists(path: &str) -> bool {
//     Path::new(path).exists()
// }

// Helper function to ensure output directory exists
pub fn ensure_output_dir(output_path: &str) -> PyResult<()> {
    if let Some(parent) = Path::new(output_path).parent() {
        fs::create_dir_all(parent).map_err(|e| {
            PyErr::new::<pyo3::exceptions::PyIOError, _>(format!(
                "Failed to create output directory: {}",
                e
            ))
        })?;
    }
    Ok(())
}

// Helper to determine audio codec & bitrate
pub fn get_audio_encoding_params(output_path: &str) -> (&'static str, &'static str) {
    if let Some(ext) = output_path.rsplit('.').next() {
        match ext.to_lowercase().as_str() {
            "wav" => ("pcm_s16le", "44100"), // WAV uses PCM, sample rate instead of bitrate
            "mp3" => ("libmp3lame", "192k"),
            "m4a" | "aac" => ("aac", "192k"),
            "ogg" => ("libvorbis", "192k"),
            "flac" => ("flac", "0"), // FLAC is lossless, no bitrate needed
            "opus" => ("libopus", "128k"),
            _ => ("aac", "192k"), // Default to AAC for maximum compatibility
        }
    } else {
        ("aac", "192k")
    }
}
