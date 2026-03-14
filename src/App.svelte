<script lang="ts">
  import "./app.css";
  import Toolbar from "./lib/components/Toolbar.svelte";
  import VideoPlayer from "./lib/components/VideoPlayer.svelte";
  import Controls from "./lib/components/Controls.svelte";
  import type { Target, Phase, ShapeSizes } from "./lib/types";
  import { DEFAULT_SHAPE_SIZES } from "./lib/types";
  import { annotations, completedPhases } from "./lib/stores/annotations";
  import { toCSV, fromCSV } from "./lib/utils/csv";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { invoke, convertFileSrc } from "@tauri-apps/api/core";

  let target: Target = $state("infant");
  let phase: Phase = $state("position");
  let playbackSpeed = $state(0.5);
  let isPlaying = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);
  let videoSrc = $state<string | null>(null);
  let videoPath = $state<string | null>(null);
  let videoPlayer = $state<ReturnType<typeof VideoPlayer> | null>(null);
  let currentFrame = $state(0);
  let toast = $state<string | null>(null);
  let toastTimeout: ReturnType<typeof setTimeout> | null = null;
  let isConverting = $state(false);
  let shapeSizes: ShapeSizes = $state(structuredClone(DEFAULT_SHAPE_SIZES));

  const NATIVE_EXTENSIONS = new Set(["mp4", "m4v", "mov", "webm", "ogg", "ogv"]);

  function showToast(msg: string) {
    toast = msg;
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => (toast = null), 3000);
  }

  function getExtension(path: string): string {
    return path.split(".").pop()?.toLowerCase() ?? "";
  }

  async function loadVideo() {
    const file = await open({
      multiple: false,
      filters: [
        { name: "Video", extensions: ["mp4", "m4v", "mov", "webm", "ogg", "ogv", "avi", "mkv", "wmv", "flv", "mpg", "mpeg", "ts", "3gp"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (!file) return;
    videoPath = file;

    const ext = getExtension(file);
    if (NATIVE_EXTENSIONS.has(ext)) {
      videoSrc = convertFileSrc(file);
    } else {
      isConverting = true;
      showToast("Converting video to a compatible format...");
      try {
        const converted = await invoke<string>("convert_video", { path: file });
        videoSrc = convertFileSrc(converted);
      } catch (e: any) {
        showToast(`${e}`);
        videoSrc = null;
      } finally {
        isConverting = false;
      }
    }
  }

  async function loadCSV() {
    const file = await open({
      multiple: false,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!file) return;
    try {
      const text = await invoke<string>("read_text_file", { path: file });
      const rows = fromCSV(text);
      if (rows.length === 0) {
        showToast("CSV file is empty or invalid");
        return;
      }
      annotations.set(rows);
      completedPhases.setFromData(rows);
      showToast(`Loaded ${rows.length} rows from CSV`);
    } catch (e: any) {
      showToast(`Error loading CSV: ${e}`);
    }
  }

  async function exportCSV() {
    const rows = $annotations;
    if (rows.length === 0) {
      showToast("No annotations to export");
      return;
    }
    const file = await save({
      filters: [{ name: "CSV", extensions: ["csv"] }],
      defaultPath: videoPath ? videoPath.replace(/\.[^.]+$/, "_annotations.csv") : "annotations.csv",
    });
    if (!file) return;
    try {
      await invoke("write_text_file", { path: file, contents: toCSV(rows) });
      showToast("CSV exported successfully");
    } catch (e: any) {
      showToast(`Export failed: ${e}`);
    }
  }

  function getAutoSavePath(): string | null {
    if (videoPath) {
      return videoPath.replace(/\.[^.]+$/, "_annotations.csv");
    }
    return null;
  }

  async function autoSave() {
    const rows = $annotations;
    if (rows.length === 0) return;
    const path = getAutoSavePath();
    if (!path) {
      showToast("No video loaded — cannot auto-save");
      return;
    }
    try {
      await invoke("write_text_file", { path, contents: toCSV(rows) });
      showToast(`Auto-saved to ${path.split(/[/\\]/).pop()}`);
    } catch (e: any) {
      showToast(`Auto-save failed: ${e}`);
    }
  }

  function onPhaseComplete() {
    completedPhases.markComplete(target, phase);
    autoSave();
  }

  let annotations_val = $derived($annotations);
  let completedPhases_val = $derived($completedPhases);
</script>

<div class="app">
  <Toolbar
    {target}
    {phase}
    completed={completedPhases_val}
    bind:shapeSizes
    onTargetChange={(t) => (target = t)}
    onPhaseChange={(p) => (phase = p)}
    onLoadVideo={loadVideo}
    onLoadCSV={loadCSV}
    onExportCSV={exportCSV}
  />

  <div class="video-area">
    <VideoPlayer
      bind:this={videoPlayer}
      src={videoSrc}
      {target}
      {phase}
      {playbackSpeed}
      bind:isPlaying
      bind:currentTime
      bind:duration
      bind:currentFrame
      annotations={annotations_val}
      {shapeSizes}
      {onPhaseComplete}
      onVideoError={showToast}
    />
    {#if isConverting}
      <div class="converting-overlay">
        <div class="spinner"></div>
        <p>Converting video...</p>
      </div>
    {/if}
  </div>

  <Controls
    bind:isPlaying
    bind:playbackSpeed
    {currentTime}
    {duration}
    onSeek={(t) => videoPlayer?.seek(t)}
    onTogglePlay={() => videoPlayer?.togglePlay()}
  />

  {#if toast}
    <div class="toast">{toast}</div>
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .video-area {
    flex: 1;
    min-height: 0;
    position: relative;
    background: #000;
  }

  .converting-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
    color: var(--text);
    gap: 16px;
    z-index: 10;
  }

  .spinner {
    width: 36px;
    height: 36px;
    border: 3px solid var(--border);
    border-top-color: var(--accent-active);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .toast {
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.85);
    color: #fff;
    padding: 10px 24px;
    border-radius: 8px;
    font-size: 13px;
    z-index: 100;
    pointer-events: none;
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
</style>
