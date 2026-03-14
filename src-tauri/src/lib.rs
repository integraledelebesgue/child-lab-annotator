use std::fs;
use std::path::PathBuf;

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(PathBuf::from(&path), contents).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(PathBuf::from(&path)).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![write_text_file, read_text_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
