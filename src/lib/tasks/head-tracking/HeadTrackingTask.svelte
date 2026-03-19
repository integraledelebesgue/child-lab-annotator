<script lang="ts">
  import VideoPlayer from "../../components/VideoPlayer.svelte";
  import Controls from "../../components/Controls.svelte";
  import FragmentList from "../../components/FragmentList.svelte";
  import HeadTrackingToolbar from "./HeadTrackingToolbar.svelte";
  import CanvasOverlay from "./CanvasOverlay.svelte";
  import type { Target, Phase, ShapeSizes, HeadTrackingFragment } from "./types";
  import { DEFAULT_SHAPE_SIZES } from "./types";
  import { createAnnotationStore, createCompletedPhasesStore } from "./stores";
  import { toCSV, fromCSV, type CSVMetadata } from "./csv";
  import { pickAndLoadVideo } from "../../utils/video";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import { untrack } from "svelte";

  interface Props {
    active: boolean;
  }

  let { active }: Props = $props();

  const annotations = createAnnotationStore();
  const completedPhases = createCompletedPhasesStore();

  // Reactive store values
  let annotationsValue = $state<import("./types").AnnotationRow[]>([]);
  let completedPhasesValue = $state<Set<import("./types").PhaseKey>>(new Set());

  annotations.subscribe((v) => (annotationsValue = v));
  completedPhases.subscribe((v) => (completedPhasesValue = v));

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
  let detectedFps = $state(30);
  let toast = $state<string | null>(null);
  let toastTimeout: ReturnType<typeof setTimeout> | null = null;
  let isConverting = $state(false);
  let shapeSizes: ShapeSizes = $state(structuredClone(DEFAULT_SHAPE_SIZES));

  // Fragment state
  let fragments = $state<HeadTrackingFragment[]>([]);
  let activeFragmentId = $state<number | null>(null);
  let fragmentLength = $state(30);

  // Settings persistence
  let settingsPath: string | null = null;
  let settingsLoaded = false;

  interface Settings {
    playbackSpeed: number;
    shapeSizes: ShapeSizes;
    fragmentLength: number;
  }

  async function loadSettings() {
    try {
      settingsPath = await invoke<string>("get_settings_path");
      const text = await invoke<string>("read_text_file", { path: settingsPath });
      const raw = JSON.parse(text);
      // Support namespaced format
      const s: Settings = raw["head-tracking"] ?? raw;
      if (typeof s.playbackSpeed === "number") playbackSpeed = s.playbackSpeed;
      if (s.shapeSizes) shapeSizes = s.shapeSizes;
      if (typeof s.fragmentLength === "number") fragmentLength = s.fragmentLength;
    } catch {
      // No settings file yet
    } finally {
      settingsLoaded = true;
    }
  }

  async function saveSettings() {
    if (!settingsPath) return;
    const s: Settings = { playbackSpeed, shapeSizes, fragmentLength };
    try {
      // Read existing settings to preserve other tasks' settings
      let all: Record<string, any> = {};
      try {
        const text = await invoke<string>("read_text_file", { path: settingsPath });
        const raw = JSON.parse(text);
        // Migrate old flat format
        if (raw && !raw["head-tracking"] && !raw["smile"]) {
          all = {};
        } else {
          all = raw;
        }
      } catch {
        // No file yet
      }
      all["head-tracking"] = s;
      await invoke("write_text_file", { path: settingsPath, contents: JSON.stringify(all) });
    } catch {
      // Silently ignore
    }
  }

  loadSettings();

  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    playbackSpeed;
    shapeSizes;
    fragmentLength;

    if (!settingsLoaded) return;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => untrack(() => saveSettings()), 500);
  });

  let activeFragment = $derived(
    activeFragmentId !== null
      ? fragments.find((f) => f.id === activeFragmentId) ?? null
      : null
  );
  let hasFragments = $derived(fragments.length > 0);

  function showToast(msg: string) {
    toast = msg;
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => (toast = null), 3000);
  }

  async function loadVideo() {
    const result = await pickAndLoadVideo(showToast, (v) => (isConverting = v));
    if (!result) return;
    videoPath = result.path;
    videoSrc = result.src;

    fragments = [];
    activeFragmentId = null;
    annotations.clear();
    completedPhases.reset();
  }

  async function loadCSV() {
    const file = await open({
      multiple: false,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!file) return;
    try {
      const text = await invoke<string>("read_text_file", { path: file });
      const result = fromCSV(text);
      if (result.rows.length === 0) {
        showToast("CSV file is empty or invalid");
        return;
      }
      annotations.set(result.rows);
      completedPhases.setFromData(result.rows);
      if (result.metadata) {
        playbackSpeed = result.metadata.playbackSpeed;
        shapeSizes = result.metadata.shapeSizes;
        fragmentLength = result.metadata.fragmentLength;
      }
      showToast(`Loaded ${result.rows.length} rows from CSV`);
    } catch (e: any) {
      showToast(`Error loading CSV: ${e}`);
    }
  }

  async function exportCSV() {
    const rows = annotationsValue;
    if (rows.length === 0) {
      showToast("No annotations to export");
      return;
    }

    let defaultPath: string;
    if (activeFragment) {
      defaultPath = getFragmentAutoSavePath(activeFragment) ?? "head_tracking.csv";
    } else {
      defaultPath = videoPath ? videoPath.replace(/\.[^.]+$/, "_head_tracking.csv") : "head_tracking.csv";
    }

    const file = await save({
      filters: [{ name: "CSV", extensions: ["csv"] }],
      defaultPath,
    });
    if (!file) return;
    try {
      const csvRows = filterAnnotationRows(rows);
      await invoke("write_text_file", { path: file, contents: toCSV(csvRows, csvMetadata) });
      showToast("CSV exported successfully");
    } catch (e: any) {
      showToast(`Export failed: ${e}`);
    }
  }

  function getAutoSavePath(): string | null {
    if (videoPath) {
      return videoPath.replace(/\.[^.]+$/, "_head_tracking.csv");
    }
    return null;
  }

  function getFragmentAutoSavePath(frag: HeadTrackingFragment): string | null {
    if (!videoPath) return null;
    const startSec = Math.floor(frag.startTime);
    const endSec = Math.floor(frag.endTime);
    return videoPath.replace(
      /\.[^.]+$/,
      `_head_tracking_${startSec}s-${endSec}s.csv`
    );
  }

  function filterAnnotationRows(rows: import("./types").AnnotationRow[]) {
    return rows.filter(
      (row) =>
        row.infantX !== null ||
        row.infantY !== null ||
        row.infantYaw !== null ||
        row.motherX !== null ||
        row.motherY !== null ||
        row.motherYaw !== null
    );
  }

  async function autoSave() {
    const rows = annotationsValue;
    if (rows.length === 0) return;
    const path = getAutoSavePath();
    if (!path) {
      showToast("No video loaded — cannot auto-save");
      return;
    }
    try {
      const csvRows = filterAnnotationRows(rows);
      await invoke("write_text_file", { path, contents: toCSV(csvRows, csvMetadata) });
      showToast(`Auto-saved to ${path.split(/[/\\]/).pop()}`);
    } catch (e: any) {
      showToast(`Auto-save failed: ${e}`);
    }
  }

  async function autoSaveFragment(id: number) {
    const frag = fragments.find((f) => f.id === id);
    if (!frag || frag.annotations.length === 0) return;
    const path = getFragmentAutoSavePath(frag);
    if (!path) {
      showToast("No video loaded — cannot auto-save");
      return;
    }
    try {
      const csvRows = filterAnnotationRows(frag.annotations);
      await invoke("write_text_file", { path, contents: toCSV(csvRows, csvMetadata) });
      showToast(`Auto-saved to ${path.split(/[/\\]/).pop()}`);
    } catch (e: any) {
      showToast(`Auto-save failed: ${e}`);
    }
  }

  function onPhaseComplete() {
    completedPhases.markComplete(target, phase);

    if (activeFragmentId !== null) {
      const frag = fragments.find((f) => f.id === activeFragmentId);
      if (frag) {
        frag.annotations = [...annotationsValue];
        frag.completedPhases = new Set(completedPhasesValue);
        fragments = [...fragments];
      }
      autoSaveFragment(activeFragmentId);
    } else {
      autoSave();
    }
  }

  async function fragmentVideo() {
    if (!videoSrc || duration <= 0) {
      showToast("Load a video first");
      return;
    }

    const len = fragmentLength;
    const newFragments: HeadTrackingFragment[] = [];
    let id = 0;
    for (let t = 0; t < duration; t += len) {
      const startTime = t;
      const endTime = Math.min(t + len, duration);
      newFragments.push({
        id: id++,
        startTime,
        endTime,
        thumbnail: null,
        annotations: [],
        completedPhases: new Set(),
      });
    }
    fragments = newFragments;

    for (const frag of fragments) {
      const thumb = await videoPlayer?.captureThumbnail(frag.startTime);
      if (thumb) {
        frag.thumbnail = thumb;
        fragments = [...fragments];
      }
    }

    selectFragment(0);
  }

  function selectFragment(id: number) {
    if (activeFragmentId !== null) {
      const current = fragments.find((f) => f.id === activeFragmentId);
      if (current) {
        current.annotations = [...annotationsValue];
        current.completedPhases = new Set(completedPhasesValue);
      }
    }

    activeFragmentId = id;
    const frag = fragments.find((f) => f.id === id);
    if (frag) {
      annotations.set([...frag.annotations]);
      completedPhases.set(new Set(frag.completedPhases));
      videoPlayer?.seek(frag.startTime);
      isPlaying = false;
    }
  }

  function clearFragments() {
    if (activeFragmentId !== null) {
      const current = fragments.find((f) => f.id === activeFragmentId);
      if (current) {
        current.annotations = [...annotationsValue];
        current.completedPhases = new Set(completedPhasesValue);
      }
    }
    fragments = [];
    activeFragmentId = null;
    annotations.clear();
    completedPhases.reset();
  }

  // Reset video when target or phase changes
  $effect(() => {
    void target;
    void phase;
    untrack(() => {
      const seekTo = activeFragment?.startTime ?? 0;
      videoPlayer?.resetPlayback(seekTo);
    });
  });

  let csvMetadata: CSVMetadata = $derived({
    playbackSpeed,
    shapeSizes,
    fragmentLength,
  });



  function onRecord(frame: number, time: number, t: Target, p: Phase, data: { x: number; y: number } | { yaw: number }) {
    if ("yaw" in data) {
      annotations.recordOrientation(frame, time, t, data.yaw);
    } else {
      annotations.recordPosition(frame, time, t, data.x, data.y);
    }
  }
</script>

<div class="task">
  <HeadTrackingToolbar
    {target}
    {phase}
    completed={completedPhasesValue}
    {videoPath}
    bind:shapeSizes
    hasVideo={videoSrc !== null}
    {hasFragments}
    bind:fragmentLength
    onTargetChange={(t) => (target = t)}
    onPhaseChange={(p) => (phase = p)}
    onLoadVideo={loadVideo}
    onLoadCSV={loadCSV}
    onExportCSV={exportCSV}
    onFragment={fragmentVideo}
    onClearFragments={clearFragments}
  />

  <div class="main-content">
    {#if hasFragments}
      <FragmentList
        {fragments}
        {activeFragmentId}
        onSelectFragment={selectFragment}
        getProgress={(f) => `${(f as HeadTrackingFragment).completedPhases.size}/4 phases`}
      />
    {/if}

    <div class="video-area">
      <VideoPlayer
        bind:this={videoPlayer}
        src={videoSrc}
        {playbackSpeed}
        bind:isPlaying
        bind:currentTime
        bind:duration
        bind:currentFrame
        bind:detectedFps
        fragmentStartTime={activeFragment?.startTime ?? null}
        fragmentEndTime={activeFragment?.endTime ?? null}
        {onPhaseComplete}
        onVideoError={showToast}
        onFrame={(frame, time) => annotations.ensureFrame(frame, time)}
      >
        {#snippet overlay({ displayWidth, displayHeight, offsetX, offsetY, videoWidth, videoHeight })}
          <CanvasOverlay
            width={displayWidth}
            height={displayHeight}
            {offsetX}
            {offsetY}
            {videoWidth}
            {videoHeight}
            {target}
            {phase}
            {currentFrame}
            {currentTime}
            annotations={annotationsValue}
            {shapeSizes}
            {detectedFps}
            {onRecord}
          />
        {/snippet}
      </VideoPlayer>
      {#if isConverting}
        <div class="converting-overlay">
          <div class="spinner"></div>
          <p>Converting video...</p>
        </div>
      {/if}
    </div>
  </div>

  <Controls
    {active}
    bind:isPlaying
    bind:playbackSpeed
    {currentTime}
    {duration}
    fragmentStartTime={activeFragment?.startTime ?? null}
    fragmentEndTime={activeFragment?.endTime ?? null}
    onSeek={(t) => videoPlayer?.seek(t)}
    onTogglePlay={() => videoPlayer?.togglePlay()}
  />

  {#if toast}
    <div class="toast">{toast}</div>
  {/if}
</div>

<style>
  .task {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .main-content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: row;
  }

  .video-area {
    flex: 1;
    min-height: 0;
    min-width: 0;
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
