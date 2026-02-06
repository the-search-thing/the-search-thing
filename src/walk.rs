use crate::read_file::get_file_contents;
use pyo3::prelude::*;
use std::collections::HashMap;
use std::collections::HashSet;
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

#[pyfunction]
pub fn walk_and_get_text_file_batch(
    dir: String,
    text_exts: Vec<String>,
    ignore_exts: Vec<String>,
    ignore_files: Vec<String>,
    cursor: usize,
    batch_size: usize,
) -> PyResult<(Vec<(String, String)>, usize, bool, usize, usize)> {
    let mut text_ext_set = HashSet::new();
    for ext in text_exts {
        let mut normalized = ext.to_lowercase();
        if !normalized.starts_with('.') {
            normalized = format!(".{}", normalized);
        }
        text_ext_set.insert(normalized);
    }

    let mut ignore_ext_set = HashSet::new();
    for ext in ignore_exts {
        let mut normalized = ext.to_lowercase();
        if !normalized.starts_with('.') {
            normalized = format!(".{}", normalized);
        }
        ignore_ext_set.insert(normalized);
    }

    let mut ignore_file_set = HashSet::new();
    for name in ignore_files {
        let normalized = name.to_lowercase();
        if !normalized.is_empty() {
            ignore_file_set.insert(normalized);
        }
    }

    let mut batch: Vec<(String, String)> = Vec::new();
    let mut scanned_files = 0usize;
    let mut skipped_non_text = 0usize;
    let mut next_cursor = cursor;

    for (idx, entry) in WalkDir::new(dir).into_iter().enumerate() {
        let entry =
            entry.map_err(|e| PyErr::new::<pyo3::exceptions::PyIOError, _>(format!("{}", e)))?;
        if idx < cursor {
            continue;
        }

        next_cursor = idx + 1;
        let path = entry.path().to_string_lossy().to_string();

        if entry.path().is_file() {
            scanned_files += 1;
            let file_name = entry
                .path()
                .file_name()
                .and_then(|s| s.to_str())
                .map(|s| s.to_lowercase());

            if let Some(ref name) = file_name {
                if ignore_file_set.contains(name) {
                    skipped_non_text += 1;
                    continue;
                }
            }
            let ext = entry
                .path()
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| format!(".{}", s.to_lowercase()));

            if let Some(ref e) = ext {
                if ignore_ext_set.contains(e) {
                    skipped_non_text += 1;
                    continue;
                }
            }

            match ext {
                Some(ref e) if text_ext_set.contains(e) => {
                    if let Ok(content) = get_file_contents(path.clone()) {
                        batch.push((path, content));
                    }
                }
                _ => {
                    skipped_non_text += 1;
                }
            }
        }

        if batch.len() >= batch_size {
            return Ok((batch, next_cursor, false, scanned_files, skipped_non_text));
        }
    }

    Ok((batch, next_cursor, true, scanned_files, skipped_non_text))
}
