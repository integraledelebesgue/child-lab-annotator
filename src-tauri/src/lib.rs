use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use ffmpeg_sidecar::command::{ffmpeg_is_installed, FfmpegCommand};
use ffmpeg_sidecar::download::{
    download_ffmpeg_package, ffmpeg_download_url, unpack_ffmpeg, UNPACK_DIRNAME,
};
use ffmpeg_sidecar::event::{FfmpegEvent, LogLevel};
use ffmpeg_sidecar::paths::ffmpeg_path;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const APP_DIR_NAME: &str = "child-lab-annotator";

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(PathBuf::from(&path), contents)
        .map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(PathBuf::from(&path)).map_err(|e| format!("Failed to read {}: {}", path, e))
}

fn app_data_dir() -> Result<PathBuf, String> {
    let dir = dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .unwrap_or_else(std::env::temp_dir)
        .join(APP_DIR_NAME);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data dir: {}", e))?;
    Ok(dir)
}

fn app_data_subdir(name: &str) -> Result<PathBuf, String> {
    let dir = app_data_dir()?.join(name);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create {} dir: {}", name, e))?;
    Ok(dir)
}

fn executable_path(dir: &Path, name: &str) -> PathBuf {
    let mut path = dir.join(name);
    if cfg!(target_os = "windows") {
        path.set_extension("exe");
    }
    path
}

fn command_succeeds(path: &Path) -> bool {
    let mut command = Command::new(path);
    command.arg("-version");
    command.stdout(Stdio::null());
    command.stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);

    command.status().map(|s| s.success()).unwrap_or(false)
}

fn ensure_ffmpeg() -> Result<PathBuf, String> {
    if ffmpeg_is_installed() {
        return Ok(ffmpeg_path());
    }

    let ffmpeg_dir = app_data_subdir("ffmpeg")?;
    let local_ffmpeg = executable_path(&ffmpeg_dir, "ffmpeg");

    if command_succeeds(&local_ffmpeg) {
        return Ok(local_ffmpeg);
    }

    for binary in ["ffmpeg", "ffprobe", "ffplay"] {
        let path = executable_path(&ffmpeg_dir, binary);
        if path.exists() {
            let _ = fs::remove_file(path);
        }
    }
    let unpack_dir = ffmpeg_dir.join(UNPACK_DIRNAME);
    if unpack_dir.exists() {
        let _ = fs::remove_dir_all(unpack_dir);
    }

    let download_url = ffmpeg_download_url()
        .map_err(|e| format!("Failed to determine FFmpeg download URL: {}", e))?;
    let archive_path = download_ffmpeg_package(download_url, &ffmpeg_dir)
        .map_err(|e| format!("Failed to download FFmpeg: {}", e))?;
    unpack_ffmpeg(&archive_path, &ffmpeg_dir)
        .map_err(|e| format!("Failed to unpack FFmpeg: {}", e))?;

    if command_succeeds(&local_ffmpeg) {
        Ok(local_ffmpeg)
    } else {
        Err(
            "FFmpeg failed to install; please install FFmpeg manually or bundle it with the app."
                .to_string(),
        )
    }
}

#[tauri::command]
fn convert_video(path: String) -> Result<String, String> {
    let input = PathBuf::from(&path);
    if !input.exists() {
        return Err(format!("File not found: {}", path));
    }

    let stem = input.file_stem().unwrap_or_default().to_string_lossy();
    let mut hasher = DefaultHasher::new();
    input
        .canonicalize()
        .unwrap_or_else(|_| input.clone())
        .hash(&mut hasher);
    let path_hash = format!("{:016x}", hasher.finish());

    let output_dir = app_data_subdir("converted-videos")?;
    let output = output_dir.join(format!("{}_{}.mp4", stem, path_hash));
    let partial_output = output.with_extension("partial.mp4");

    // Skip conversion if already converted
    if output.exists() {
        let output_metadata = fs::metadata(&output).ok();
        let input_modified = fs::metadata(&input).and_then(|m| m.modified()).ok();
        let output_modified = output_metadata.as_ref().and_then(|m| m.modified().ok());
        let output_has_data = output_metadata.map(|m| m.len() > 0).unwrap_or(false);
        if let (Some(i), Some(o)) = (input_modified, output_modified) {
            if output_has_data && o >= i {
                return Ok(output.to_string_lossy().into_owned());
            }
        }
    }

    let ffmpeg_bin = ensure_ffmpeg()?;

    let _ = fs::remove_file(&partial_output);
    let partial_output_str = partial_output
        .to_str()
        .ok_or_else(|| "Converted video path contains invalid Unicode".to_string())?;
    let mut child = FfmpegCommand::new_with_path(ffmpeg_bin)
        .overwrite()
        .input(&path)
        .args(["-map", "0:v:0", "-map", "0:a?", "-sn", "-dn"])
        .codec_video("libx264")
        .preset("fast")
        .crf(18)
        .args(["-pix_fmt", "yuv420p"])
        .codec_audio("aac")
        .args(["-movflags", "+faststart"])
        .output(partial_output_str)
        .spawn()
        .map_err(|e| format!("Failed to start FFmpeg: {}", e))?;

    let mut last_error = String::new();
    for event in child.iter().map_err(|e| format!("FFmpeg error: {}", e))? {
        if let FfmpegEvent::Log(LogLevel::Error, msg) = event {
            last_error = msg;
        }
    }

    if partial_output.exists()
        && fs::metadata(&partial_output)
            .map(|m| m.len() > 0)
            .unwrap_or(false)
    {
        if output.exists() {
            fs::remove_file(&output)
                .map_err(|e| format!("Failed to replace converted video: {}", e))?;
        }
        fs::rename(&partial_output, &output)
            .map_err(|e| format!("Failed to finalize converted video: {}", e))?;
        Ok(output.to_string_lossy().into_owned())
    } else {
        let _ = fs::remove_file(&partial_output);
        Err(format!(
            "FFmpeg conversion failed: {}",
            if last_error.is_empty() {
                "unknown error".to_string()
            } else {
                last_error
            }
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
        .invoke_handler(tauri::generate_handler![
            write_text_file,
            read_text_file,
            convert_video,
            get_settings_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
