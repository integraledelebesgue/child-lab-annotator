<script lang="ts">
  import VideoPlayer from "../../components/VideoPlayer.svelte";
  import FragmentList from "../../components/FragmentList.svelte";
  import GazeToolbar from "./GazeToolbar.svelte";
  import GazeControls from "./GazeControls.svelte";
  import GazeTimeline from "./GazeTimeline.svelte";
  import type { GazeEvent, GazeFragment, VideoRole, GazePhase, HelperData } from "./types";
  import { VIDEO_ROLES, VIDEO_ROLE_LABELS } from "./types";
  import { toCSV, fromCSV, parseHelperCSV, type GazeCSVMetadata } from "./csv";
  import { pickAndLoadVideo } from "../../utils/video";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import { getVersion } from "@tauri-apps/api/app";
  import { untrack } from "svelte";

  interface Props {
    active: boolean;
  }

  let { active }: Props = $props();

  let playbackSpeed = $state(0.5);
  let isPlaying = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);
  let currentFrame = $state(0);
  let detectedFps = $state(30);
  let toast = $state<string | null>(null);
  let toastTimeout: ReturnType<typeof setTimeout> | null = null;
  let isConverting = $state(false);

  // Video sources per role
  let videoSrcs = $state<Record<VideoRole, string | null>>({
    mother: null,
    ceiling: null,
    infant: null,
  });
  let videoPaths = $state<Record<VideoRole, string | null>>({
    mother: null,
    ceiling: null,
    infant: null,
  });

  // VideoPlayer refs — ceiling is the primary (controls playback)
  let ceilingPlayer = $state<ReturnType<typeof VideoPlayer> | null>(null);
  let motherPlayer = $state<ReturnType<typeof VideoPlayer> | null>(null);
  let infantPlayer = $state<ReturnType<typeof VideoPlayer> | null>(null);

  // Dummy bindable state for secondary players (they sync from ceiling)
  let motherTime = $state(0);
  let motherDuration = $state(0);
  let motherFrame = $state(0);
  let motherFps = $state(30);
  let motherPlaying = $state(false);
  let infantTime = $state(0);
  let infantDuration = $state(0);
  let infantFrame = $state(0);
  let infantFps = $state(30);
  let infantPlaying = $state(false);

  // Phase & offsets
  let phase: GazePhase = $state("synchronization");
  let motherOffset = $state(0);
  let ceilingOffset = $state(0);
  let infantOffset = $state(0);

  let effectiveMotherOffset = $derived(motherOffset - ceilingOffset);
  let effectiveInfantOffset = $derived(infantOffset - ceilingOffset);

  // Helper data
  let helperData = $state<HelperData | null>(null);
  let threshold = $state(30);
  let hasHelperData = $derived(helperData !== null);

  // Fragment state
  let fragments = $state<GazeFragment[]>([]);
  let activeFragmentId = $state<number | null>(null);
  let fragmentLength = $state(30);

  // Event state
  let events = $state<GazeEvent[]>([]);
  let nextEventId = 0;

  // Recording state
  let activeRecording = $state<{
    startTime: number;
    startFrame: number;
  } | null>(null);

  let isRecording = $derived(activeRecording !== null);
  let isOnEvent = $derived(
    events.some((e) => currentTime >= e.startTime && currentTime <= e.endTime)
  );

  let hasAllVideos = $derived(
    videoSrcs.mother !== null &&
    videoSrcs.ceiling !== null &&
    videoSrcs.infant !== null
  );

  // Settings persistence
  let settingsPath: string | null = null;
  let settingsLoaded = false;

  interface Settings {
    playbackSpeed: number;
    fragmentLength: number;
    threshold: number;
    motherOffset: number;
    ceilingOffset: number;
    infantOffset: number;
  }

  async function loadSettings() {
    try {
      settingsPath = await invoke<string>("get_settings_path");
      const text = await invoke<string>("read_text_file", { path: settingsPath });
      const raw = JSON.parse(text);
      const s: Settings = raw["mutual-gaze"] ?? {};
      if (typeof s.playbackSpeed === "number") playbackSpeed = s.playbackSpeed;
      if (typeof s.fragmentLength === "number") fragmentLength = s.fragmentLength;
      if (typeof s.threshold === "number") threshold = s.threshold;
      if (typeof s.motherOffset === "number") motherOffset = s.motherOffset;
      if (typeof s.ceilingOffset === "number") ceilingOffset = s.ceilingOffset;
      if (typeof s.infantOffset === "number") infantOffset = s.infantOffset;
    } catch {
      // No settings file yet
    } finally {
      settingsLoaded = true;
    }
  }

  async function saveSettings() {
    if (!settingsPath) return;
    const s: Settings = { playbackSpeed, fragmentLength, threshold, motherOffset, ceilingOffset, infantOffset };
    try {
      let all: Record<string, any> = {};
      try {
        const text = await invoke<string>("read_text_file", { path: settingsPath });
        const raw = JSON.parse(text);
        if (raw && typeof raw === "object") all = raw;
      } catch {
        // No file yet
      }
      all["mutual-gaze"] = s;
      await invoke("write_text_file", { path: settingsPath, contents: JSON.stringify(all) });
    } catch {
      // Silently ignore
    }
  }

  loadSettings();

  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    playbackSpeed;
    fragmentLength;
    threshold;
    motherOffset;
    ceilingOffset;
    infantOffset;

    if (!settingsLoaded) return;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => untrack(() => saveSettings()), 500);
  });

  $effect(() => {
    void phase;
    untrack(() => {
      const seekTo = activeFragment?.startTime ?? 0;
      seekAll(seekTo);
      isPlaying = false;
    });
  });

  // Seek videos in real-time when offsets change during sync phase
  $effect(() => {
    motherOffset;
    ceilingOffset;
    infantOffset;
    untrack(() => {
      if (phase !== "synchronization") return;
      const base = activeFragment?.startTime ?? 0;
      ceilingPlayer?.seek(base + ceilingOffset);
      motherPlayer?.seek(base + motherOffset);
      infantPlayer?.seek(base + infantOffset);
    });
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

  async function loadVideo(role: VideoRole) {
    const result = await pickAndLoadVideo(showToast, (v) => (isConverting = v));
    if (!result) return;
    videoPaths[role] = result.path;
    videoSrcs[role] = result.src;

    // If ceiling video changed, reset everything
    if (role === "ceiling") {
      fragments = [];
      activeFragmentId = null;
      events = [];
      nextEventId = 0;
      helperData = null;
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
      const result = fromCSV(text);
      if (result.events.length === 0) {
        showToast("CSV file is empty or invalid");
        return;
      }
      events = result.events;
      nextEventId = Math.max(...events.map((e) => e.id)) + 1;
      if (result.metadata) {
        playbackSpeed = result.metadata.playbackSpeed;
        fragmentLength = result.metadata.fragmentLength;
        threshold = result.metadata.threshold;
        motherOffset = result.metadata.motherOffset;
        ceilingOffset = result.metadata.ceilingOffset;
        infantOffset = result.metadata.infantOffset;
      }
      showToast(`Loaded ${result.events.length} events from CSV`);
    } catch (e: any) {
      showToast(`Error loading CSV: ${e}`);
    }
  }

  async function loadHelperCSV() {
    const file = await open({
      multiple: false,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!file) return;
    try {
      const text = await invoke<string>("read_text_file", { path: file });
      const data = parseHelperCSV(text);
      if (data.frameCount === 0) {
        showToast("Helper CSV is empty or invalid");
        return;
      }
      helperData = data;
      showToast(`Loaded helper data for ${data.frameCount} frames`);
    } catch (e: any) {
      showToast(`Error loading helper CSV: ${e}`);
    }
  }

  let appVersion = $state("unknown");
  getVersion().then((v) => (appVersion = v)).catch(() => {});

  let csvMetadata: GazeCSVMetadata = $derived({
    playbackSpeed,
    fragmentLength,
    threshold,
    motherOffset,
    ceilingOffset,
    infantOffset,
    appVersion,
  });

  async function exportCSV() {
    if (events.length === 0) {
      showToast("No events to export");
      return;
    }

    let defaultPath: string;
    if (activeFragment) {
      defaultPath = getFragmentAutoSavePath(activeFragment) ?? "mutual_gaze.csv";
    } else {
      defaultPath = videoPaths.ceiling
        ? videoPaths.ceiling.replace(/\.[^.]+$/, "_mutual_gaze.csv")
        : "mutual_gaze.csv";
    }

    const file = await save({
      filters: [{ name: "CSV", extensions: ["csv"] }],
      defaultPath,
    });
    if (!file) return;
    try {
      await invoke("write_text_file", { path: file, contents: toCSV(events, csvMetadata) });
      showToast("CSV exported successfully");
    } catch (e: any) {
      showToast(`Export failed: ${e}`);
    }
  }

  function getAutoSavePath(): string | null {
    if (videoPaths.ceiling) {
      return videoPaths.ceiling.replace(/\.[^.]+$/, "_mutual_gaze.csv");
    }
    return null;
  }

  function getFragmentAutoSavePath(frag: GazeFragment): string | null {
    if (!videoPaths.ceiling) return null;
    const startSec = Math.floor(frag.startTime);
    const endSec = Math.floor(frag.endTime);
    return videoPaths.ceiling.replace(
      /\.[^.]+$/,
      `_mutual_gaze_${startSec}s-${endSec}s.csv`
    );
  }

  async function autoSave() {
    if (events.length === 0) return;
    const path = getAutoSavePath();
    if (!path) return;
    try {
      await invoke("write_text_file", { path, contents: toCSV(events, csvMetadata) });
      showToast(`Auto-saved to ${path.split(/[/\\]/).pop()}`);
    } catch (e: any) {
      showToast(`Auto-save failed: ${e}`);
    }
  }

  async function autoSaveFragment(id: number) {
    const frag = fragments.find((f) => f.id === id);
    if (!frag || frag.events.length === 0) return;
    const path = getFragmentAutoSavePath(frag);
    if (!path) return;
    try {
      await invoke("write_text_file", { path, contents: toCSV(frag.events, csvMetadata) });
      showToast(`Auto-saved to ${path.split(/[/\\]/).pop()}`);
    } catch (e: any) {
      showToast(`Auto-save failed: ${e}`);
    }
  }

  function onPhaseComplete() {
    pauseAll();
    if (activeFragmentId !== null) {
      const frag = fragments.find((f) => f.id === activeFragmentId);
      if (frag) {
        frag.events = [...events];
        fragments = [...fragments];
      }
      autoSaveFragment(activeFragmentId);
    } else {
      autoSave();
    }
  }

  function syncSecondaryPlayers() {
    motherPlayer?.seek(currentTime + effectiveMotherOffset);
    infantPlayer?.seek(currentTime + effectiveInfantOffset);
  }

  function playAll() {
    motherPlayer?.togglePlayIfPaused();
    infantPlayer?.togglePlayIfPaused();
  }

  function pauseAll() {
    motherPlayer?.pauseIfPlaying();
    infantPlayer?.pauseIfPlaying();
  }

  // Fragment management
  async function fragmentVideo() {
    if (!videoSrcs.ceiling || duration <= 0) {
      showToast("Load the ceiling video first");
      return;
    }

    const len = fragmentLength;
    const newFragments: GazeFragment[] = [];
    let id = 0;
    for (let t = 0; t < duration; t += len) {
      const startTime = t;
      const endTime = Math.min(t + len, duration);
      newFragments.push({
        id: id++,
        startTime,
        endTime,
        thumbnail: null,
        events: [],
      });
    }
    fragments = newFragments;

    for (const frag of fragments) {
      const thumb = await ceilingPlayer?.captureThumbnail(frag.startTime);
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
        current.events = [...events];
      }
    }

    activeFragmentId = id;
    const frag = fragments.find((f) => f.id === id);
    if (frag) {
      events = [...frag.events];
      nextEventId = events.length > 0 ? Math.max(...events.map((e) => e.id)) + 1 : 0;
      seekAll(frag.startTime);
      isPlaying = false;
    }
  }

  function clearFragments() {
    if (activeFragmentId !== null) {
      const current = fragments.find((f) => f.id === activeFragmentId);
      if (current) {
        current.events = [...events];
      }
    }
    fragments = [];
    activeFragmentId = null;
    events = [];
    nextEventId = 0;
  }

  function seekAll(time: number) {
    ceilingPlayer?.seek(time);
    motherPlayer?.seek(time + effectiveMotherOffset);
    infantPlayer?.seek(time + effectiveInfantOffset);
  }

  function togglePlayAll() {
    if (isPlaying) {
      ceilingPlayer?.togglePlay();
      pauseAll();
    } else {
      syncSecondaryPlayers();
      ceilingPlayer?.togglePlay();
      playAll();
    }
  }

  function changePhase(p: GazePhase) {
    phase = p;
  }

  function markStart() {
    if (isRecording) return;
    activeRecording = {
      startTime: currentTime,
      startFrame: currentFrame,
    };
  }

  function markEnd() {
    if (!activeRecording) return;
    const newEvent: GazeEvent = {
      id: nextEventId++,
      startTime: activeRecording.startTime,
      endTime: currentTime,
      startFrame: activeRecording.startFrame,
      endFrame: currentFrame,
    };
    events = [...events, newEvent];
    activeRecording = null;
  }

  function onKeydown(e: KeyboardEvent) {
    if (!active) return;
    if (e.repeat) return;
    if (e.target !== document.body) return;

    if (e.code === "Space") {
      e.preventDefault();
      togglePlayAll();
      return;
    }

    if ((e.key === "Delete" || e.key === "Backspace") && !isRecording) {
      if (events.length > 0) {
        events = events.slice(0, -1);
      }
      return;
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="task">
  <GazeToolbar
    {videoPaths}
    {hasAllVideos}
    {hasFragments}
    bind:fragmentLength
    eventCount={events.length}
    {hasHelperData}
    bind:threshold
    {phase}
    onPhaseChange={changePhase}
    onLoadVideo={loadVideo}
    onLoadCSV={loadCSV}
    onLoadHelperCSV={loadHelperCSV}
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
        getProgress={(f) => `${(f as GazeFragment).events.length} events`}
      />
    {/if}

    <div class="video-area">
      <div class="video-grid">
        {#each VIDEO_ROLES as role}
          <div class="video-cell">
            <div class="video-label">{VIDEO_ROLE_LABELS[role]}</div>
            <div class="video-player-container">
              {#if role === "ceiling"}
                <VideoPlayer
                  bind:this={ceilingPlayer}
                  src={videoSrcs.ceiling}
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
                />
              {:else if role === "mother"}
                <VideoPlayer
                  bind:this={motherPlayer}
                  src={videoSrcs.mother}
                  {playbackSpeed}
                  bind:isPlaying={motherPlaying}
                  bind:currentTime={motherTime}
                  bind:duration={motherDuration}
                  bind:currentFrame={motherFrame}
                  bind:detectedFps={motherFps}
                  fragmentStartTime={activeFragment?.startTime ?? null}
                  fragmentEndTime={activeFragment?.endTime ?? null}
                  onPhaseComplete={() => {}}
                  onVideoError={showToast}
                />
              {:else}
                <VideoPlayer
                  bind:this={infantPlayer}
                  src={videoSrcs.infant}
                  {playbackSpeed}
                  bind:isPlaying={infantPlaying}
                  bind:currentTime={infantTime}
                  bind:duration={infantDuration}
                  bind:currentFrame={infantFrame}
                  bind:detectedFps={infantFps}
                  fragmentStartTime={activeFragment?.startTime ?? null}
                  fragmentEndTime={activeFragment?.endTime ?? null}
                  onPhaseComplete={() => {}}
                  onVideoError={showToast}
                />
              {/if}
            </div>
            {#if phase === "synchronization" && role === "mother"}
              <div class="offset-bar">
                <span class="offset-label">Offset:</span>
                <input type="range" class="offset-slider" min="0" max="2" step={1 / detectedFps} bind:value={motherOffset} />
                <span class="offset-value">{motherOffset.toFixed(3)}s</span>
              </div>
            {/if}
            {#if phase === "synchronization" && role === "ceiling"}
              <div class="offset-bar">
                <span class="offset-label">Offset:</span>
                <input type="range" class="offset-slider" min="0" max="2" step={1 / detectedFps} bind:value={ceilingOffset} />
                <span class="offset-value">{ceilingOffset.toFixed(3)}s</span>
              </div>
            {/if}
            {#if phase === "synchronization" && role === "infant"}
              <div class="offset-bar">
                <span class="offset-label">Offset:</span>
                <input type="range" class="offset-slider" min="0" max="2" step={1 / detectedFps} bind:value={infantOffset} />
                <span class="offset-value">{infantOffset.toFixed(3)}s</span>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      {#if isConverting}
        <div class="converting-overlay">
          <div class="spinner"></div>
          <p>Converting video...</p>
        </div>
      {/if}
    </div>
  </div>

  <GazeControls
    {isPlaying}
    bind:playbackSpeed
    {currentTime}
    {duration}
    fragmentEndTime={activeFragment?.endTime ?? null}
    {isRecording}
    canStartRecording={!isRecording && !isOnEvent}
    {phase}
    onTogglePlay={togglePlayAll}
    onMarkStart={markStart}
    onMarkEnd={markEnd}
  />

  <GazeTimeline
    {helperData}
    {threshold}
    {events}
    {currentTime}
    {duration}
    {detectedFps}
    fragmentStartTime={activeFragment?.startTime ?? null}
    fragmentEndTime={activeFragment?.endTime ?? null}
    recordingStartTime={activeRecording?.startTime ?? null}
    onSeek={seekAll}
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

  .video-grid {
    display: flex;
    flex-direction: row;
    height: 100%;
    gap: 2px;
  }

  .video-cell {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .video-label {
    text-align: center;
    padding: 4px 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .video-player-container {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  .offset-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border);
  }

  .offset-label {
    font-size: 11px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .offset-slider {
    flex: 1;
    min-width: 0;
    accent-color: var(--accent-active);
  }

  .offset-value {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--accent-active);
    min-width: 52px;
    text-align: right;
    flex-shrink: 0;
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
    bottom: 120px;
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
