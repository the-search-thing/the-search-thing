// currently this is a flawed method, some files have a false-positive during detection due to the magic bytes being used for detection, either we create a manual db/dataset ourselves, rely on file extensions completely, or manually fix all incorrect magic bytes detected.
use file_type::FileType;
use pyo3::prelude::*;

#[pyfunction]
pub fn get_file_type_with_extension(file_path: String) -> PyResult<String> {
    let file_extension = file_path
        .split('.')
        .last()
        .unwrap_or(file_path.as_str())
        .to_string();
    let file_types = FileType::from_extension(file_extension);
    let file_type = file_types.first().expect("file format");
    let media_type = file_type
        .media_types()
        .first()
        .map(|s| s.to_string())
        .unwrap_or_else(|| file_type.name().to_string());
    Ok(media_type)
}
