use pyo3::prelude::*;
mod aud;
mod filetype_check;
mod helpers;
mod index;
mod read_file;
mod vid;
mod walk;
#[pymodule]
fn the_search_thing(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_function(wrap_pyfunction!(index::rust_indexer, m)?)?;
    m.add_function(wrap_pyfunction!(walk::walk_and_get_files, m)?)?;
    m.add_function(wrap_pyfunction!(
        filetype_check::get_file_type_with_extension,
        m
    )?)?;
    m.add_function(wrap_pyfunction!(read_file::get_file_contents, m)?)?;
    m.add_function(wrap_pyfunction!(walk::walk_and_get_files_content, m)?)?;
    m.add_function(wrap_pyfunction!(walk::walk_and_get_text_file_batch, m)?)?;
    m.add_function(wrap_pyfunction!(aud::detect_tempo, m)?)?;
    Ok(())
}
