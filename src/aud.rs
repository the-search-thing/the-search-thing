use crate::helpers::{
    ensure_output_dir, get_audio_encoding_params, normalize_path, validate_file_exists,
    validate_times,
};
use pyo3::prelude::*;
use pyo3::{PyErr, PyResult};
use rayon::prelude::*;
use std::cmp::Ordering;
use std::fs;
use std::path::Path;
use std::process::Command;

use aubio_rs::{OnsetMode, Tempo};
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::default::{get_codecs, get_probe};

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

#[pyfunction]
pub fn detect_tempo(audio_path: String) -> PyResult<String> {
    validate_file_exists(&audio_path)?;
    let normalized_path = audio_path.replace("\\", "/");

    let file = fs::File::open(&normalized_path).map_err(|e| {
        PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(format!(
            "Failed to open audio file: {}",
            e
        ))
    })?;

    let mss = MediaSourceStream::new(Box::new(file), Default::default());
    let hint = Hint::new();
    let probed = get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| {
            PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(format!(
                "Failed to probe audio format: {}",
                e
            ))
        })?;

    let mut format = probed.format;
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.sample_rate.is_some())
        .ok_or_else(|| {
            PyErr::new::<pyo3::exceptions::PyRuntimeError, _>("No decodable audio track found")
        })?;

    let track_id = track.id;
    let sample_rate = track.codec_params.sample_rate.ok_or_else(|| {
        PyErr::new::<pyo3::exceptions::PyRuntimeError, _>("Missing sample rate in audio track")
    })?;

    let mut decoder = get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| {
            PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(format!(
                "Failed to create audio decoder: {}",
                e
            ))
        })?;

    let mut mono_samples: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(err))
                if err.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(SymphoniaError::ResetRequired) => {
                return Err(PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(
                    "Decoder reset required",
                ));
            }
            Err(e) => {
                return Err(PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(format!(
                    "Failed to read audio packet: {}",
                    e
                )))
            }
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(e) => {
                return Err(PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(format!(
                    "Failed to decode audio packet: {}",
                    e
                )))
            }
        };

        let spec = *decoded.spec();
        let mut sample_buffer = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
        sample_buffer.copy_interleaved_ref(decoded);

        let channels = spec.channels.count();
        let samples = sample_buffer.samples();
        if channels == 0 {
            continue;
        }

        for frame in samples.chunks(channels) {
            let sum: f32 = frame.iter().copied().sum();
            mono_samples.push(sum / channels as f32);
        }
    }

    let win_size = 1024;
    let hop_size = 512;
    let mut tempo = Tempo::new(OnsetMode::Hfc, win_size, hop_size, sample_rate).map_err(|e| {
        PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(format!(
            "Failed to initialize tempo detector: {}",
            e
        ))
    })?;

    let mut bpm_values: Vec<f32> = Vec::new();
    let mut idx = 0;

    while idx < mono_samples.len() {
        let end = (idx + hop_size).min(mono_samples.len());
        let mut frame = vec![0.0f32; hop_size];
        frame[..end - idx].copy_from_slice(&mono_samples[idx..end]);

        tempo.do_result(&frame).map_err(|e| {
            PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(format!(
                "Tempo detection failed: {}",
                e
            ))
        })?;

        let bpm = tempo.get_bpm();
        let confidence = tempo.get_confidence();

        if bpm.is_finite() && confidence.is_finite() && bpm > 0.0 && confidence > 0.2 {
            bpm_values.push(bpm);
        }

        idx += hop_size;
    }

    if bpm_values.is_empty() {
        return Err(PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(
            "error no beats are detected",
        ));
    }

    bpm_values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(Ordering::Equal));
    let mid = bpm_values.len() / 2;
    let bpm = if bpm_values.len() % 2 == 0 {
        (bpm_values[mid - 1] + bpm_values[mid]) / 2.0
    } else {
        bpm_values[mid]
    };

    Ok(format!("{:.1}", bpm))
}
