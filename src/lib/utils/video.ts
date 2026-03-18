import { open } from "@tauri-apps/plugin-dialog";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";

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
  if (!file) return null;

  const ext = getExtension(file);
  if (NATIVE_EXTENSIONS.has(ext)) {
    return { src: convertFileSrc(file), path: file };
  }

  setConverting(true);
  showToast("Converting video to a compatible format...");
  try {
    const converted = await invoke<string>("convert_video", { path: file });
    return { src: convertFileSrc(converted), path: file };
  } catch (e: any) {
    showToast(`${e}`);
    return null;
  } finally {
    setConverting(false);
  }
}
