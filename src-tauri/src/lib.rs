use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::fs::File;
use std::hash::{Hash, Hasher};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use ffmpeg_sidecar::command::{ffmpeg_is_installed, FfmpegCommand};
use ffmpeg_sidecar::download::{
    download_ffmpeg_package, ffmpeg_download_url, unpack_ffmpeg, UNPACK_DIRNAME,
};
use ffmpeg_sidecar::event::{FfmpegEvent, LogLevel};
use ffmpeg_sidecar::paths::ffmpeg_path;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const APP_DIR_NAME: &str = "child-lab-annotator";
const DEBUG_LOG_ENV: &str = "CHILD_LAB_ANNOTATOR_DEBUG_LOG";
const DEBUG_LOG_ARGS: [&str; 2] = ["--debug-log", "--diagnostic-log"];

#[derive(Serialize)]
struct DebugLogStatus {
    enabled: bool,
    path: Option<String>,
}

struct DebugLogger {
    path: Option<PathBuf>,
    file: Option<BufWriter<File>>,
}

struct DebugLogState {
    logger: Mutex<DebugLogger>,
}

fn unix_time_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn debug_log_requested() -> bool {
    let env_enabled = std::env::var(DEBUG_LOG_ENV)
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(false);

    env_enabled || std::env::args().any(|arg| DEBUG_LOG_ARGS.contains(&arg.as_str()))
}

fn logs_dir() -> Result<PathBuf, String> {
    app_data_subdir("logs")
}

impl DebugLogger {
    fn new(enabled: bool) -> Self {
        let mut logger = Self {
            path: None,
            file: None,
        };
        if enabled {
            let _ = logger.enable();
        }
        logger
    }

    fn status(&self) -> DebugLogStatus {
        DebugLogStatus {
            enabled: self.file.is_some(),
            path: self
                .path
                .as_ref()
                .map(|path| path.to_string_lossy().into_owned()),
        }
    }

    fn enable(&mut self) -> Result<DebugLogStatus, String> {
        if self.file.is_some() {
            return Ok(self.status());
        }

        let dir = logs_dir()?;
        let path = dir.join(format!(
            "child-lab-annotator-{}-{}.ndjson",
            unix_time_ms(),
            std::process::id()
        ));
        let file = File::create(&path)
            .map_err(|e| format!("Failed to create debug log {}: {}", path.display(), e))?;
        self.path = Some(path);
        self.file = Some(BufWriter::new(file));
        self.log(
            "backend",
            "debug-log-enabled",
            Some(json!({
                "version": env!("CARGO_PKG_VERSION"),
                "pid": std::process::id(),
                "env_flag": DEBUG_LOG_ENV,
                "args": DEBUG_LOG_ARGS,
            })),
        )?;
        Ok(self.status())
    }

    fn log(&mut self, source: &str, message: &str, details: Option<Value>) -> Result<(), String> {
        let Some(file) = self.file.as_mut() else {
            return Ok(());
        };
        let record = json!({
            "time_unix_ms": unix_time_ms(),
            "source": source,
            "message": message,
            "details": details.unwrap_or(Value::Null),
        });
        writeln!(file, "{record}").map_err(|e| format!("Failed to write debug log: {}", e))?;
        file.flush()
            .map_err(|e| format!("Failed to flush debug log: {}", e))
    }
}

impl DebugLogState {
    fn new(enabled: bool) -> Self {
        Self {
            logger: Mutex::new(DebugLogger::new(enabled)),
        }
    }

    fn status(&self) -> DebugLogStatus {
        self.logger
            .lock()
            .map(|logger| logger.status())
            .unwrap_or(DebugLogStatus {
                enabled: false,
                path: None,
            })
    }

    fn enable(&self) -> Result<DebugLogStatus, String> {
        self.logger
            .lock()
            .map_err(|e| format!("Failed to lock debug logger: {}", e))?
            .enable()
    }

    fn log(&self, source: &str, message: &str, details: Option<Value>) -> Result<(), String> {
        self.logger
            .lock()
            .map_err(|e| format!("Failed to lock debug logger: {}", e))?
            .log(source, message, details)
    }
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(PathBuf::from(&path), contents)
        .map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(PathBuf::from(&path)).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
fn get_debug_log_status(state: tauri::State<'_, DebugLogState>) -> DebugLogStatus {
    state.status()
}

#[tauri::command]
fn enable_debug_log(state: tauri::State<'_, DebugLogState>) -> Result<DebugLogStatus, String> {
    state.enable()
}

#[tauri::command]
fn write_debug_log(
    state: tauri::State<'_, DebugLogState>,
    source: String,
    message: String,
    details: Option<Value>,
) -> Result<(), String> {
    state.log(&source, &message, details)
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
fn convert_video(path: String, state: tauri::State<'_, DebugLogState>) -> Result<String, String> {
    let _ = state.log(
        "backend",
        "convert-video-start",
        Some(json!({ "path": path.as_str() })),
    );

    let input = PathBuf::from(&path);
    if !input.exists() {
        let _ = state.log(
            "backend",
            "convert-video-missing-input",
            Some(json!({ "path": path.as_str() })),
        );
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
                let _ = state.log(
                    "backend",
                    "convert-video-cache-hit",
                    Some(json!({
                        "input": path.as_str(),
                        "output": output.to_string_lossy(),
                    })),
                );
                return Ok(output.to_string_lossy().into_owned());
            }
        }
    }

    let ffmpeg_bin = ensure_ffmpeg().map_err(|e| {
        let _ = state.log(
            "backend",
            "convert-video-ffmpeg-unavailable",
            Some(json!({
                "input": path.as_str(),
                "error": e.as_str(),
            })),
        );
        e
    })?;

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
        .map_err(|e| {
            let message = format!("Failed to start FFmpeg: {}", e);
            let _ = state.log(
                "backend",
                "convert-video-spawn-failed",
                Some(json!({
                    "input": path.as_str(),
                    "error": message.as_str(),
                })),
            );
            message
        })?;

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
        let _ = state.log(
            "backend",
            "convert-video-success",
            Some(json!({
                "input": path.as_str(),
                "output": output.to_string_lossy(),
            })),
        );
        Ok(output.to_string_lossy().into_owned())
    } else {
        let _ = fs::remove_file(&partial_output);
        let _ = state.log(
            "backend",
            "convert-video-failed",
            Some(json!({
                "input": path.as_str(),
                "ffmpeg_error": if last_error.is_empty() {
                    "unknown error".to_string()
                } else {
                    last_error.clone()
                },
            })),
        );
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
    let debug_log_state = DebugLogState::new(debug_log_requested());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(debug_log_state)
        .setup(|app| {
            let log_state = app.state::<DebugLogState>();
            let _ = log_state.log(
                "backend",
                "app-started",
                Some(json!({
                    "version": env!("CARGO_PKG_VERSION"),
                    "pid": std::process::id(),
                    "debug_log_requested": debug_log_requested(),
                })),
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            write_text_file,
            read_text_file,
            get_debug_log_status,
            enable_debug_log,
            write_debug_log,
            convert_video,
            get_settings_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
