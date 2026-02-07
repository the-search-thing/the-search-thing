use crate::helpers::{
    ensure_output_dir, get_audio_encoding_params, normalize_path, validate_file_exists,
    validate_times,
};
use pyo3::prelude::*;
use pyo3::{PyErr, PyResult};
use std::fs;
use std::path::Path;


#[pyfunction]
pub fn search_images(imagePath: String) -> PyResult<String> {
    validate_file_exists(&imagePath)?;
    Ok(imagePath)
}