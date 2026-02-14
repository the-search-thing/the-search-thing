// use crate::helpers::validate_file_exists;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use image::ImageReader;
use pyo3::prelude::*;
use pyo3::{PyErr, PyResult};

#[pyfunction]
pub fn get_base64_bytes(image_path: String) -> PyResult<String> {
    //  validate_file_exists(&image_path);
    let img = ImageReader::open(&image_path)
        .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e.to_string()))?
        .decode()
        .map_err(|e| PyErr::new::<pyo3::exceptions::PyRuntimeError, _>(e.to_string()))?;
    let encoded = STANDARD.encode(img.into_bytes());
    Ok(encoded)
}
