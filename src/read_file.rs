// use std::env;
use std::fs;

use pyo3::prelude::*;
#[pyfunction]
pub fn get_file_contents(file_path: String) {
    // let args: Vec<String> = env::args().collect();
    // let query = &args[1];
    let file_path = file_path;

    println!("in file {file_path}");
    let contents = fs::read_to_string(file_path).expect("should have been able to read the file");
    println!("with text:\n{contents}")
}
