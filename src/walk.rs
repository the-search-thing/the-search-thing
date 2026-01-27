use crate::read_file::get_file_contents;
use pyo3::prelude::*;
use walkdir::WalkDir;
#[pyfunction]
pub fn walk_and_get_content(dir: String) -> PyResult<()> {
    for entry in WalkDir::new(dir) {
        let entry =
            entry.map_err(|e| PyErr::new::<pyo3::exceptions::PyIOError, _>(format!("{}", e)))?;
        if entry.file_type().is_file() {
            let path_str = entry.path().to_string_lossy().to_string();
            get_file_contents(path_str);
        }
    }
    Ok(())
}
