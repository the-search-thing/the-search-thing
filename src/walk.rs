use pyo3::prelude::*;
use walkdir::WalkDir;

#[pyfunction]
pub fn walk(dir: String) -> PyResult<()> {
    for entry in WalkDir::new(dir) {
        let entry =
            entry.map_err(|e| PyErr::new::<pyo3::exceptions::PyIOError, _>(format!("{}", e)))?;
        println!("{}", entry.path().display());
    }
    Ok(())
}
