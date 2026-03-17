use std::fs;
use std::path::PathBuf;

use ffmpeg_sidecar::command::FfmpegCommand;
use ffmpeg_sidecar::download::auto_download;
use ffmpeg_sidecar::event::{FfmpegEvent, LogLevel};

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(PathBuf::from(&path), contents).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(PathBuf::from(&path)).map_err(|e| format!("Failed to read {}: {}", path, e))
}

fn ensure_ffmpeg() -> Result<(), String> {
    auto_download().map_err(|e| format!("Failed to download FFmpeg: {}", e))
}

#[tauri::command]
fn convert_video(path: String) -> Result<String, String> {
    let input = PathBuf::from(&path);
    if !input.exists() {
        return Err(format!("File not found: {}", path));
    }

    let stem = input.file_stem().unwrap_or_default().to_string_lossy();
    let temp_dir = std::env::temp_dir().join("child-lab-annotator");
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp dir: {}", e))?;

    let output = temp_dir.join(format!("{}.mp4", stem));

    // Skip conversion if already converted
    if output.exists() {
        let input_modified = fs::metadata(&input).and_then(|m| m.modified()).ok();
        let output_modified = fs::metadata(&output).and_then(|m| m.modified()).ok();
        if let (Some(i), Some(o)) = (input_modified, output_modified) {
            if o > i {
                return Ok(output.to_string_lossy().into_owned());
            }
        }
    }

    // Auto-download FFmpeg if not installed
    ensure_ffmpeg()?;

    let output_str = output.to_str().unwrap();
    let mut child = FfmpegCommand::new()
        .overwrite()
        .input(&path)
        .codec_video("libx264")
        .preset("fast")
        .crf(18)
        .codec_audio("aac")
        .args(["-movflags", "+faststart"])
        .output(output_str)
        .spawn()
        .map_err(|e| format!("Failed to start FFmpeg: {}", e))?;

    let mut last_error = String::new();
    for event in child.iter().map_err(|e| format!("FFmpeg error: {}", e))? {
        if let FfmpegEvent::Log(LogLevel::Error, msg) = event {
            last_error = msg;
        }
    }

    if output.exists() && fs::metadata(&output).map(|m| m.len() > 0).unwrap_or(false) {
        Ok(output.to_string_lossy().into_owned())
    } else {
        Err(format!(
            "FFmpeg conversion failed: {}",
            if last_error.is_empty() { "unknown error".to_string() } else { last_error }
        ))
    }
}

#[tauri::command]
fn get_settings_path() -> Result<String, String> {
    let dir = dirs::config_dir()
        .ok_or_else(|| "Could not determine config directory".to_string())?
        .join("child-lab-annotator");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config dir: {}", e))?;
    Ok(dir.join("settings.json").to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![write_text_file, read_text_file, convert_video, get_settings_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
