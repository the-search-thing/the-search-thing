// use std::env;
use std::fs;

use pyo3::prelude::*;
#[pyfunction]
pub fn get_file_contents(file_path: String) {
    let file_path = file_path;

    println!("File Path: {file_path}");
    let contents = fs::read_to_string(file_path).expect("shoulda been able to read the file");
    println!("with text:\n{contents}")
}
