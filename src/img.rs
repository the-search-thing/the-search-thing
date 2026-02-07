use crate::helpers::{
    ensure_output_dir, get_audio_encoding_params, normalize_path, validate_file_exists,
    validate_times,
};
use pyo3::prelude::*;
use pyo3::{PyErr, PyResult};
use std::io::Cursor;
use image::{ImageDecoder, ImageFormat};
use std::path::Path;


#[pyfunction]
pub fn get_bytes(image_path: String) -> PyResult<Vec<u8>> {
    let mut bytes: Vec<u8> = Vec::new();
    let img = image::ImageReader::open(image_path)?.decode();
    img.write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)?;
    Ok(bytes)
}