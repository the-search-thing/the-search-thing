use crate::helpers::{ensure_output_dir, normalize_path, validate_file_exists, validate_times};
use pyo3::prelude::*;
use std::fs;
use std::path::Path;
use std::process::Command;

// trim video
#[pyfunction]
pub fn trim_video_with_rust(
    video_path: String,
    start_time: f64,
    end_time: f64,
    output_path: String,
) -> PyResult<String> {
    // Validate file exists
    validate_file_exists(&video_path)?;

    // Normalize paths
    let (video_path, output_path) = normalize_path(&video_path, &output_path);
    ensure_output_dir(&output_path)?;

    // Handle existing output file
    if Path::new(&output_path).exists() {
        if let Err(_) = fs::remove_file(&output_path) {
            // If removal fails, try with _1 suffix
            if let Some((base, ext)) = output_path.rsplit_once('.') {
                let new_path = format!("{}_1.{}", base, ext);
                return trim_video_with_rust(video_path, start_time, end_time, new_path);
            }
        }
    }

    // Validate times
    validate_times(start_time, end_time)?;

    // Use FFmpeg to trim video
    let duration = end_time - start_time;
    let output = Command::new("ffmpeg")
        .arg("-y")
        .arg("-ss")
        .arg(&start_time.to_string())
        .arg("-i")
        .arg(&video_path)
        .arg("-t")
        .arg(&duration.to_string())
        .arg("-c:v")
        .arg("libx264")
        .arg("-preset")
        .arg("medium")
        .arg("-c:a")
        .arg("aac")
        .arg("-movflags")
        .arg("+faststart")
        .arg(&output_path)
        .output()
        .map_err(|e| {
            PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(format!(
                "Failed to execute ffmpeg: {}",
                e
            ))
        })?;

    if !output.status.success() {
        // Retry without movflags
        let output = Command::new("ffmpeg")
            .arg("-y")
            .arg("-ss")
            .arg(&start_time.to_string())
            .arg("-i")
            .arg(&video_path)
            .arg("-t")
            .arg(&duration.to_string())
            .arg("-c:v")
            .arg("libx264")
            .arg("-preset")
            .arg("medium")
            .arg("-c:a")
            .arg("aac")
            .arg(&output_path)
            .output()
            .map_err(|e| {
                PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(format!(
                    "Failed to execute ffmpeg: {}",
                    e
                ))
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(format!(
                "FFmpeg failed: {}",
                stderr
            )));
        }
    }

    Ok(output_path)
}

// concatenate videos
#[pyfunction]
#[allow(dead_code)]
pub fn concatenate_video_files_rust(
    video_paths: Vec<String>,
    output_path: String,
) -> PyResult<String> {
    // validate files exist
    for path in &video_paths {
        validate_file_exists(path)?;
    }
    ensure_output_dir(&output_path)?;

    let concat_file = format!("{}.concat", output_path);
    let mut concat_content = String::new();
    for path in &video_paths {
        // Normalize paths for FFmpeg (use forward slashes)
        let normalized_path = path.replace("\\", "/");
        concat_content.push_str(&format!("file '{}'\n", normalized_path));
    }

    fs::write(&concat_file, concat_content).map_err(|e| {
        PyErr::new::<pyo3::exceptions::PyIOError, _>(format!("Failed to write concat file: {}", e))
    })?;

    // Use FFmpeg to concatenate
    let output = Command::new("ffmpeg")
        .arg("-y")
        .arg("-f")
        .arg("concat")
        .arg("-safe")
        .arg("0")
        .arg("-i")
        .arg(&concat_file)
        .arg("-c")
        .arg("copy")
        .arg(&output_path)
        .output()
        .map_err(|e| {
            PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(format!(
                "Failed to execute ffmpeg: {}",
                e
            ))
        })?;

    // Clean up concat file
    let _ = fs::remove_file(&concat_file);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(format!(
            "FFmpeg failed: {}",
            stderr
        )));
    }

    Ok(output_path)
}

// concatenate_video_segments
#[pyfunction]
#[allow(dead_code)]
pub fn concatenate_scenes_with_rust(
    video_path: String,
    selected_scenes: Vec<(f64, f64)>,
    output_path: String,
) -> PyResult<String> {
    validate_file_exists(&video_path)?;

    ensure_output_dir(&output_path)?;

    let mut concat_content = String::new();
    let video_path_normalized = video_path.replace("\\", "/");

    for (start, end) in &selected_scenes {
        concat_content.push_str(&format!("file '{}'\n", video_path_normalized));
        concat_content.push_str(&format!("inpoint {}\n", start));
        concat_content.push_str(&format!("outpoint {}\n", end));
    }

    let concat_file = format!("{}.concat", output_path);
    fs::write(&concat_file, concat_content).map_err(|e| {
        PyErr::new::<pyo3::exceptions::PyIOError, _>(format!("Failed to write concat file: {}", e))
    })?;

    let output = Command::new("ffmpeg")
        .arg("-y")
        .arg("-f")
        .arg("concat")
        .arg("-safe")
        .arg("0")
        .arg("-i")
        .arg(&concat_file)
        .arg("-c")
        .arg("copy")
        .arg(&output_path)
        .output()
        .map_err(|e| {
            PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(format!(
                "Failed to execute ffmpeg: {}",
                e
            ))
        })?;

    let _ = fs::remove_file(&concat_file);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(format!(
            "FFmpeg failed: {}",
            stderr
        )));
    }

    Ok(output_path)
}

// #[pyfunction]
// pub fn remove_silences_with_rust(
//     video_path: String,
//     output_path: String,
//     min_silence_length: f64,
//     silence_threshold: f64,
// ) -> PyResult<String> {
//     step 1: extract audio
//     step 2: identify silent segment
//     step 3: trim silent segments
// }
