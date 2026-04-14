import { open } from "@tauri-apps/plugin-dialog";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { logDebugEvent } from "./debugLog";

const NATIVE_EXTENSIONS = new Set(["mp4", "m4v", "mov", "webm", "ogg", "ogv"]);

function getExtension(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

export function getFileName(path: string): string {
  return path.split(/[/\\]/).pop() ?? "";
}

export async function pickAndLoadVideo(
  showToast: (msg: string) => void,
  setConverting: (v: boolean) => void,
): Promise<{ src: string; path: string } | null> {
  logDebugEvent("video-picker", "open-dialog");

  const file = await open({
    multiple: false,
    filters: [
      {
        name: "Video",
        extensions: [
          "mp4", "m4v", "mov", "webm", "ogg", "ogv",
          "avi", "mkv", "wmv", "flv", "mpg", "mpeg", "ts", "3gp",
        ],
      },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (!file) {
    logDebugEvent("video-picker", "dialog-cancelled");
    return null;
  }

  const ext = getExtension(file);
  if (NATIVE_EXTENSIONS.has(ext)) {
    logDebugEvent("video-picker", "native-video-selected", {
      path: file,
      extension: ext,
    });
    return { src: convertFileSrc(file), path: file };
  }

  setConverting(true);
  showToast("Converting video to a compatible format...");
  logDebugEvent("video-picker", "conversion-started", {
    path: file,
    extension: ext,
  });
  try {
    const converted = await invoke<string>("convert_video", { path: file });
    logDebugEvent("video-picker", "conversion-finished", {
      inputPath: file,
      convertedPath: converted,
    });
    return { src: convertFileSrc(converted), path: file };
  } catch (e: any) {
    logDebugEvent("video-picker", "conversion-failed", {
      path: file,
      error: `${e}`,
    });
    showToast(`${e}`);
    return null;
  } finally {
    setConverting(false);
  }
}
