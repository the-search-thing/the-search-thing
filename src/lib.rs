use pyo3::prelude::*;

mod read_file;

#[pymodule]
fn the_search_thing(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(read_file::get_file_contents, m)?)?;
    Ok(())
}
