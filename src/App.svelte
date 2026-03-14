<script lang="ts">
  import "./app.css";
  import Toolbar from "./lib/components/Toolbar.svelte";
  import VideoPlayer from "./lib/components/VideoPlayer.svelte";
  import Controls from "./lib/components/Controls.svelte";
  import FragmentList from "./lib/components/FragmentList.svelte";
  import type { Target, Phase, ShapeSizes, Fragment } from "./lib/types";
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
  let detectedFps = $state(30);
  let toast = $state<string | null>(null);
  let toastTimeout: ReturnType<typeof setTimeout> | null = null;
  let isConverting = $state(false);
  let shapeSizes: ShapeSizes = $state(structuredClone(DEFAULT_SHAPE_SIZES));

  // Fragment state
  let fragments = $state<Fragment[]>([]);
  let activeFragmentId = $state<number | null>(null);
  let fragmentLength = $state(30);

  let activeFragment = $derived(
    activeFragmentId !== null
      ? fragments.find((f) => f.id === activeFragmentId) ?? null
      : null
  );
  let hasFragments = $derived(fragments.length > 0);

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

    // Clear fragments and annotations for new video
    fragments = [];
    activeFragmentId = null;
    annotations.clear();
    completedPhases.reset();

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

    let defaultPath: string;
    if (activeFragment) {
      defaultPath = getFragmentAutoSavePath(activeFragment) ?? "annotations.csv";
    } else {
      defaultPath = videoPath ? videoPath.replace(/\.[^.]+$/, "_annotations.csv") : "annotations.csv";
    }

    const file = await save({
      filters: [{ name: "CSV", extensions: ["csv"] }],
      defaultPath,
    });
    if (!file) return;
    try {
      const csvRows = filterAnnotationRows(rows);
      await invoke("write_text_file", { path: file, contents: toCSV(csvRows) });
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

  function getFragmentAutoSavePath(frag: Fragment): string | null {
    if (!videoPath) return null;
    const startSec = Math.floor(frag.startTime);
    const endSec = Math.floor(frag.endTime);
    return videoPath.replace(
      /\.[^.]+$/,
      `_${startSec}s-${endSec}s_annotations.csv`
    );
  }

  /** Filter out rows that are entirely null (sparse array padding). */
  function filterAnnotationRows(rows: typeof $annotations) {
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
    const rows = $annotations;
    if (rows.length === 0) return;
    const path = getAutoSavePath();
    if (!path) {
      showToast("No video loaded — cannot auto-save");
      return;
    }
    try {
      const csvRows = filterAnnotationRows(rows);
      await invoke("write_text_file", { path, contents: toCSV(csvRows) });
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
      await invoke("write_text_file", { path, contents: toCSV(csvRows) });
      showToast(`Auto-saved to ${path.split(/[/\\]/).pop()}`);
    } catch (e: any) {
      showToast(`Auto-save failed: ${e}`);
    }
  }

  function onPhaseComplete() {
    completedPhases.markComplete(target, phase);

    if (activeFragmentId !== null) {
      // Save data back into the fragment object
      const frag = fragments.find((f) => f.id === activeFragmentId);
      if (frag) {
        frag.annotations = [...$annotations];
        frag.completedPhases = new Set($completedPhases);
        fragments = [...fragments]; // trigger reactivity
      }
      autoSaveFragment(activeFragmentId);
    } else {
      autoSave();
    }
  }

  // Fragment management
  async function fragmentVideo() {
    if (!videoSrc || duration <= 0) {
      showToast("Load a video first");
      return;
    }

    const len = fragmentLength;
    const newFragments: Fragment[] = [];
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

    // Generate thumbnails asynchronously
    for (const frag of fragments) {
      const thumb = await videoPlayer?.captureThumbnail(frag.startTime);
      if (thumb) {
        frag.thumbnail = thumb;
        fragments = [...fragments]; // trigger reactivity for each thumbnail
      }
    }

    // Auto-select first fragment
    selectFragment(0);
  }

  function selectFragment(id: number) {
    // Save current fragment's data back
    if (activeFragmentId !== null) {
      const current = fragments.find((f) => f.id === activeFragmentId);
      if (current) {
        current.annotations = [...$annotations];
        current.completedPhases = new Set($completedPhases);
      }
    }

    activeFragmentId = id;
    const frag = fragments.find((f) => f.id === id);
    if (frag) {
      annotations.set([...frag.annotations]);
      completedPhases.set(new Set(frag.completedPhases));
      // Seek video to fragment start
      videoPlayer?.seek(frag.startTime);
      isPlaying = false;
    }
  }

  function clearFragments() {
    // Save current fragment data first
    if (activeFragmentId !== null) {
      const current = fragments.find((f) => f.id === activeFragmentId);
      if (current) {
        current.annotations = [...$annotations];
        current.completedPhases = new Set($completedPhases);
      }
    }
    fragments = [];
    activeFragmentId = null;
    annotations.clear();
    completedPhases.reset();
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
      />
    {/if}

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
        bind:detectedFps
        annotations={annotations_val}
        {shapeSizes}
        fragmentStartTime={activeFragment?.startTime ?? null}
        fragmentEndTime={activeFragment?.endTime ?? null}
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
  </div>

  <Controls
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
  .app {
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
