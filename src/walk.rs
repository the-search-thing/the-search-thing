use crate::read_file::get_file_contents;
use pyo3::prelude::*;
use std::collections::HashMap;
use walkdir::WalkDir;

#[pyfunction]
pub fn walk_and_get_files(dir: String) -> PyResult<Vec<String>> {
    let mut paths = Vec::new();
    for entry in WalkDir::new(dir) {
        let entry =
            entry.map_err(|e| PyErr::new::<pyo3::exceptions::PyIOError, _>(format!("{}", e)))?;
        paths.push(entry.path().to_string_lossy().to_string());
    }
    Ok(paths)
}
#[pyfunction]
pub fn walk_and_get_files_content(dir: String) -> PyResult<HashMap<String, String>> {
    let mut files_content = HashMap::new();
    for entry in WalkDir::new(dir) {
        let entry =
            entry.map_err(|e| PyErr::new::<pyo3::exceptions::PyIOError, _>(format!("{}", e)))?;
        let path = entry.path().to_string_lossy().to_string();

        if entry.path().is_file() {
            match get_file_contents(path.clone()) {
                Ok(content) => {
                    files_content.insert(path, content);
                }
                Err(_) => continue,
            }
        }
    }
    Ok(files_content)
}
