use pyo3::prelude::*;

mod add;
mod walk;

#[pymodule]
fn the_search_thing(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(add::add_numbers, m)?)?;
    m.add_function(wrap_pyfunction!(walk::walk, m)?)?;
    Ok(())
}
