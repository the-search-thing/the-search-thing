use crate::helpers::{
    ensure_output_dir, get_audio_encoding_params, normalize_path, validate_file_exists,
    validate_times,
};
use pyo3::prelude::*;
use pyo3::{PyErr, PyResult};
use rayon::prelude::*;
use std::fs;
use std::path::Path;
use std::process::Command;

// extract audio
#[allow(dead_code)]
fn extract_audio_with_rust(video_path: String, output_path: String) -> PyResult<String> {
    // Validate file exists
    validate_file_exists(&video_path)?;
    // Normalize paths
    let (video_path, mut output_path) = normalize_path(&video_path, &output_path);
    ensure_output_dir(&output_path)?;

    if Path::new(&output_path).exists() {
        if let Err(_) = fs::remove_file(&output_path) {
            // If removal fails, try with _1 suffix
            if let Some((base, ext)) = output_path.rsplit_once('.') {
                output_path = format!("{}_1.{}", base, ext);
            } else {
                output_path = format!("{}_1", output_path);
            }
        }
    }

    let (codec, bitrate_or_samplerate) = get_audio_encoding_params(&output_path);

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y")
        .arg("-i")
        .arg(&video_path)
        .arg("-vn")
        .arg("-acodec")
        .arg(codec);

    if codec == "pcm_s16le" {
        // WAV/PCM prefer explicit sample rate instead of bitrate
        cmd.arg("-ar").arg(bitrate_or_samplerate);
    } else if codec != "flac" {
        // Skip bitrate for FLAC to keep it lossless
        cmd.arg("-b:a").arg(bitrate_or_samplerate);
    }

    cmd.arg(&output_path);

    let output = cmd.output().map_err(|e| {
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

    Ok(output_path)
}

// trim audio
#[pyfunction]
#[allow(dead_code)]
pub fn trim_audio_with_rust(
    audio_path: String,
    start_time: f64,
    end_time: f64,
    output_path: String,
) -> PyResult<String> {
    // Validate file exists
    validate_file_exists(&audio_path)?;
    // Normalize paths
    let (audio_path, output_path) = normalize_path(&audio_path, &output_path);
    ensure_output_dir(&output_path)?;
    // validate times
    validate_times(start_time, end_time)?;

    if Path::new(&output_path).exists() {
        if let Err(_) = fs::remove_file(&output_path) {
            // If removal fails, try with _1 suffix
            if let Some((base, ext)) = output_path.rsplit_once('.') {
                let new_path = format!("{}_1.{}", base, ext);
                return trim_audio_with_rust(audio_path, start_time, end_time, new_path);
            }
        }
    }

    let duration = end_time - start_time;
    let (codec, bitrate_or_samplerate) = get_audio_encoding_params(&output_path);

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y") // overwrite output file
        .arg("-ss")
        .arg(&start_time.to_string())
        .arg("-i")
        .arg(&audio_path)
        .arg("-t")
        .arg(&duration.to_string())
        .arg("-vn")
        .arg("-c:a")
        .arg(codec);

    // Add bitrate/samplerate based on codec
    if codec == "pcm_s16le" {
        // For WAV/PCM, use sample rate instead of bitrate
        cmd.arg("-ar").arg(bitrate_or_samplerate);
    } else if codec != "flac" {
        // FLAC is lossless, no bitrate needed
        cmd.arg("-b:a").arg(bitrate_or_samplerate);
    }

    cmd.arg(&output_path);

    let output = cmd.output().map_err(|e| {
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
    Ok(output_path)
}

// extract multiple audios
#[pyfunction]
#[allow(dead_code)]
pub fn extract_multiple_audios_with_rust(
    py: Python<'_>,
    video_paths: Vec<String>,
    output_dir: String,
) -> PyResult<Vec<String>> {
    // Normalize output directory and ensure it exists
    let normalized_out_dir = output_dir.replace("\\", "/");
    ensure_output_dir(&normalized_out_dir)?;

    // Validate all files exist first (before parallel processing)
    for vp in &video_paths {
        validate_file_exists(vp)?;
    }

    // release the GIL for parallel processing
    py.detach(|| {
        let results: Result<Vec<String>, PyErr> = video_paths
            .par_iter()
            .map(|vp| {
                let normalized_vp = vp.replace("\\", "/");

                // Extract filename from video path
                let video_filename = Path::new(&normalized_vp)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .ok_or_else(|| {
                        PyErr::new::<pyo3::exceptions::PyValueError, _>(format!(
                            "Could not extract filename from path: {}",
                            normalized_vp
                        ))
                    })?;

                let mut output_path = format!("{}/{}.mp3", normalized_out_dir, video_filename);

                // Handle existing file
                if Path::new(&output_path).exists() {
                    if fs::remove_file(&output_path).is_err() {
                        output_path = format!("{}/{}_1.mp3", normalized_out_dir, video_filename);
                    }
                }

                let (codec, bitrate_or_samplerate) = get_audio_encoding_params(&output_path);

                let mut cmd = Command::new("ffmpeg");
                cmd.arg("-y")
                    .arg("-i")
                    .arg(&normalized_vp)
                    .arg("-vn")
                    .arg("-acodec")
                    .arg(&codec);

                if codec == "pcm_s16le" {
                    cmd.arg("-ar").arg(&bitrate_or_samplerate);
                } else if codec != "flac" {
                    cmd.arg("-b:a").arg(&bitrate_or_samplerate);
                }

                cmd.arg(&output_path);

                let output = cmd.output().map_err(|e| {
                    PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(format!(
                        "Failed to execute ffmpeg: {}",
                        e
                    ))
                })?;

                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    return Err(PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(format!(
                        "FFmpeg failed for {}: {}",
                        normalized_vp, stderr
                    )));
                }

                Ok(output_path)
            })
            .collect();

        results
    })
}
