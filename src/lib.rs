use pyo3::prelude::*;

mod read_file;
mod walk;

#[pymodule]
fn the_search_thing(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(walk::walk_and_get_content, m)?)?;
    Ok(())
}
