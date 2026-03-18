<script lang="ts">
  import VideoPlayer from "../../components/VideoPlayer.svelte";
  import FragmentList from "../../components/FragmentList.svelte";
  import SmileToolbar from "./SmileToolbar.svelte";
  import SmileControls from "./SmileControls.svelte";
  import EventList from "./EventList.svelte";
  import Legend from "./Legend.svelte";
  import type { SmileEvent, SmileFragment, ExpressionType, Intensity } from "./types";
  import { KEY_TO_EXPRESSION } from "./types";
  import { toCSV, fromCSV, type SmileCSVMetadata } from "./csv";
  import { pickAndLoadVideo, getFileName } from "../../utils/video";
  import { open, save } from "@tauri-apps/plugin-dialog";
  import { invoke } from "@tauri-apps/api/core";
  import { untrack } from "svelte";

  interface Props {
    active: boolean;
  }

  let { active }: Props = $props();

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

  // Fragment state
  let fragments = $state<SmileFragment[]>([]);
  let activeFragmentId = $state<number | null>(null);
  let fragmentLength = $state(30);

  // Event state
  let events = $state<SmileEvent[]>([]);
  let nextEventId = 0;
  let currentIntensity: Intensity = $state(2);

  // Recording state
  let activeRecording = $state<{
    key: string;
    type: ExpressionType;
    startTime: number;
    startFrame: number;
    wasPlaying: boolean;
  } | null>(null);

  let isRecording = $derived(activeRecording !== null);

  // Settings persistence
  let settingsPath: string | null = null;
  let settingsLoaded = false;

  interface Settings {
    playbackSpeed: number;
    fragmentLength: number;
  }

  async function loadSettings() {
    try {
      settingsPath = await invoke<string>("get_settings_path");
      const text = await invoke<string>("read_text_file", { path: settingsPath });
      const raw = JSON.parse(text);
      const s: Settings = raw["smile"] ?? {};
      if (typeof s.playbackSpeed === "number") playbackSpeed = s.playbackSpeed;
      if (typeof s.fragmentLength === "number") fragmentLength = s.fragmentLength;
    } catch {
      // No settings file yet
    } finally {
      settingsLoaded = true;
    }
  }

  async function saveSettings() {
    if (!settingsPath) return;
    const s: Settings = { playbackSpeed, fragmentLength };
    try {
      let all: Record<string, any> = {};
      try {
        const text = await invoke<string>("read_text_file", { path: settingsPath });
        const raw = JSON.parse(text);
        if (raw && typeof raw === "object") all = raw;
      } catch {
        // No file yet
      }
      all["smile"] = s;
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
    events = [];
    nextEventId = 0;
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
      }
      showToast(`Loaded ${result.events.length} events from CSV`);
    } catch (e: any) {
      showToast(`Error loading CSV: ${e}`);
    }
  }

  let csvMetadata: SmileCSVMetadata = $derived({
    playbackSpeed,
    fragmentLength,
  });

  let filename = $derived(videoPath ? getFileName(videoPath) : "");

  async function exportCSV() {
    if (events.length === 0) {
      showToast("No events to export");
      return;
    }

    let defaultPath: string;
    if (activeFragment) {
      defaultPath = getFragmentAutoSavePath(activeFragment) ?? "smile.csv";
    } else {
      defaultPath = videoPath ? videoPath.replace(/\.[^.]+$/, "_smile.csv") : "smile.csv";
    }

    const file = await save({
      filters: [{ name: "CSV", extensions: ["csv"] }],
      defaultPath,
    });
    if (!file) return;
    try {
      await invoke("write_text_file", { path: file, contents: toCSV(events, csvMetadata, filename) });
      showToast("CSV exported successfully");
    } catch (e: any) {
      showToast(`Export failed: ${e}`);
    }
  }

  function getAutoSavePath(): string | null {
    if (videoPath) {
      return videoPath.replace(/\.[^.]+$/, "_smile.csv");
    }
    return null;
  }

  function getFragmentAutoSavePath(frag: SmileFragment): string | null {
    if (!videoPath) return null;
    const startSec = Math.floor(frag.startTime);
    const endSec = Math.floor(frag.endTime);
    return videoPath.replace(
      /\.[^.]+$/,
      `_smile_${startSec}s-${endSec}s.csv`
    );
  }

  async function autoSave() {
    if (events.length === 0) return;
    const path = getAutoSavePath();
    if (!path) return;
    try {
      await invoke("write_text_file", { path, contents: toCSV(events, csvMetadata, filename) });
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
      await invoke("write_text_file", { path, contents: toCSV(frag.events, csvMetadata, filename) });
      showToast(`Auto-saved to ${path.split(/[/\\]/).pop()}`);
    } catch (e: any) {
      showToast(`Auto-save failed: ${e}`);
    }
  }

  function onPhaseComplete() {
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

  // Fragment management
  async function fragmentVideo() {
    if (!videoSrc || duration <= 0) {
      showToast("Load a video first");
      return;
    }

    const len = fragmentLength;
    const newFragments: SmileFragment[] = [];
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
        current.events = [...events];
      }
    }

    activeFragmentId = id;
    const frag = fragments.find((f) => f.id === id);
    if (frag) {
      events = [...frag.events];
      nextEventId = events.length > 0 ? Math.max(...events.map((e) => e.id)) + 1 : 0;
      videoPlayer?.seek(frag.startTime);
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

  function removeEvent(id: number) {
    events = events.filter((e) => e.id !== id);
  }

  function clearEvents() {
    events = [];
    nextEventId = 0;
  }

  // Keyboard recording
  function onKeydown(e: KeyboardEvent) {
    if (!active) return;
    if (e.target !== document.body) return;
    if (e.repeat) return;

    const key = e.key.toLowerCase();

    // Intensity change during recording
    if (activeRecording && ["1", "2", "3"].includes(key)) {
      currentIntensity = parseInt(key) as Intensity;
      return;
    }

    // Start recording
    if (KEY_TO_EXPRESSION[key] && !activeRecording) {
      e.preventDefault();
      const wasPlaying = isPlaying;
      activeRecording = {
        key,
        type: KEY_TO_EXPRESSION[key],
        startTime: currentTime,
        startFrame: currentFrame,
        wasPlaying,
      };
      // Auto-play if video was stopped
      if (!wasPlaying) {
        videoPlayer?.togglePlay();
      }
      return;
    }

    // Space for play/pause (only when not recording)
    if (e.code === "Space" && !activeRecording) {
      e.preventDefault();
      videoPlayer?.togglePlay();
      return;
    }

    // Delete last event
    if ((e.key === "Delete" || e.key === "Backspace") && !activeRecording) {
      if (events.length > 0) {
        events = events.slice(0, -1);
      }
      return;
    }
  }

  function onKeyup(e: KeyboardEvent) {
    if (!active) return;
    if (!activeRecording) return;
    const key = e.key.toLowerCase();

    if (key === activeRecording.key) {
      // Finalize event
      const newEvent: SmileEvent = {
        id: nextEventId++,
        type: activeRecording.type,
        intensity: currentIntensity,
        startTime: activeRecording.startTime,
        endTime: currentTime,
        startFrame: activeRecording.startFrame,
        endFrame: currentFrame,
      };
      const wasPlaying = activeRecording.wasPlaying;
      events = [...events, newEvent];
      activeRecording = null;

      // Only pause if video wasn't playing before recording started
      if (!wasPlaying) {
        videoPlayer?.togglePlay();
      }
    }
  }
</script>

<svelte:window onkeydown={onKeydown} onkeyup={onKeyup} />

<div class="task">
  <SmileToolbar
    {videoPath}
    hasVideo={videoSrc !== null}
    {hasFragments}
    bind:fragmentLength
    eventCount={events.length}
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
        getProgress={(f) => `${(f as SmileFragment).events.length} events`}
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
      />
      {#if isConverting}
        <div class="converting-overlay">
          <div class="spinner"></div>
          <p>Converting video...</p>
        </div>
      {/if}
    </div>

    <EventList
      {events}
      onRemove={removeEvent}
      onClear={clearEvents}
      onExportCSV={exportCSV}
    />
  </div>

  <SmileControls
    {isPlaying}
    bind:playbackSpeed
    {currentTime}
    {duration}
    fragmentStartTime={activeFragment?.startTime ?? null}
    fragmentEndTime={activeFragment?.endTime ?? null}
    onSeek={(t) => videoPlayer?.seek(t)}
    onTogglePlay={() => videoPlayer?.togglePlay()}
  />

  <Legend
    {currentIntensity}
    {isRecording}
    recordingType={activeRecording?.type ?? null}
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
