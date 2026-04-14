import { invoke } from "@tauri-apps/api/core";

export interface DebugLogStatus {
  enabled: boolean;
  path: string | null;
}

let cachedStatus: DebugLogStatus | null = null;
let statusPromise: Promise<DebugLogStatus> | null = null;

export async function getDebugLogStatus(): Promise<DebugLogStatus> {
  if (cachedStatus) return cachedStatus;
  if (statusPromise) return statusPromise;

  statusPromise = loadDebugLogStatus();
  cachedStatus = await statusPromise;
  statusPromise = null;
  return cachedStatus;
}

async function loadDebugLogStatus(): Promise<DebugLogStatus> {
  try {
    return await invoke<DebugLogStatus>("get_debug_log_status");
  } catch {
    return { enabled: false, path: null };
  }
}

export async function enableDebugLog(): Promise<DebugLogStatus> {
  cachedStatus = await invoke<DebugLogStatus>("enable_debug_log");
  statusPromise = null;
  return cachedStatus;
}

export function logDebugEvent(
  source: string,
  message: string,
  details?: Record<string, unknown>,
) {
  if (cachedStatus && !cachedStatus.enabled) return;

  if (!cachedStatus) {
    getDebugLogStatus().then((status) => {
      if (status.enabled) writeDebugLog(source, message, details);
    });
    return;
  }

  writeDebugLog(source, message, details);
}

function writeDebugLog(
  source: string,
  message: string,
  details?: Record<string, unknown>,
) {
  invoke("write_debug_log", {
    source,
    message,
    details: details ?? null,
  }).catch(() => {
    // Logging must never affect annotation flow.
  });
}
