<script lang="ts">
  import type { VideoRole, GazePhase } from "./types";
  import { VIDEO_ROLE_LABELS } from "./types";

  interface Props {
    videoPaths: Record<string, string | null>;
    hasAllVideos: boolean;
    hasFragments: boolean;
    fragmentLength: number;
    eventCount: number;
    hasHelperData: boolean;
    threshold: number;
    phase: GazePhase;
    onPhaseChange: (phase: GazePhase) => void;
    onLoadVideo: (role: VideoRole) => void;
    onLoadCSV: () => void;
    onLoadHelperCSV: () => void;
    onExportCSV: () => void;
    onFragment: () => void;
    onClearFragments: () => void;
  }

  let {
    videoPaths,
    hasAllVideos,
    hasFragments,
    fragmentLength = $bindable(),
    eventCount,
    hasHelperData,
    threshold = $bindable(),
    phase,
    onPhaseChange,
    onLoadVideo,
    onLoadCSV,
    onLoadHelperCSV,
    onExportCSV,
    onFragment,
    onClearFragments,
  }: Props = $props();
</script>

<div class="toolbar">
  <div class="toolbar-group">
    {#each ["mother", "ceiling", "infant"] as role}
      <button onclick={() => onLoadVideo(role as VideoRole)}>
        {VIDEO_ROLE_LABELS[role as VideoRole]}
        {#if videoPaths[role]}
          <span class="loaded-indicator"></span>
        {/if}
      </button>
    {/each}
    <button onclick={onLoadCSV}>Load Events</button>
    <button onclick={onLoadHelperCSV}>
      Load Helper
      {#if hasHelperData}
        <span class="loaded-indicator"></span>
      {/if}
    </button>
  </div>

  <div class="toolbar-group">
    <span class="phase-label">Phase:</span>
    <label class="radio" class:active={phase === "synchronization"}>
      <input
        type="radio"
        name="gaze-phase"
        value="synchronization"
        checked={phase === "synchronization"}
        onchange={() => onPhaseChange("synchronization")}
      />
      Synchronization
    </label>
    <label class="radio" class:active={phase === "annotation"}>
      <input
        type="radio"
        name="gaze-phase"
        value="annotation"
        checked={phase === "annotation"}
        onchange={() => onPhaseChange("annotation")}
      />
      Annotation
    </label>
  </div>

  <div class="toolbar-group">
    {#if !hasFragments}
      <label class="size-control">
        <span class="size-label">Len</span>
        <input
          type="range"
          class="size-slider"
          min="5"
          max="60"
          step="5"
          bind:value={fragmentLength}
        />
        <span class="size-value">{fragmentLength}s</span>
      </label>
      <button onclick={onFragment} disabled={!hasAllVideos}>Fragment</button>
    {:else}
      <button onclick={onClearFragments}>Clear Fragments</button>
    {/if}
  </div>

  {#if hasHelperData}
    <div class="toolbar-group">
      <label class="size-control">
        <span class="size-label">Thr</span>
        <input
          type="range"
          class="size-slider"
          min="0"
          max="90"
          step="1"
          bind:value={threshold}
        />
        <span class="size-value">{threshold}°</span>
      </label>
    </div>
  {/if}

  <div class="toolbar-group">
    <button onclick={onExportCSV}>Export CSV</button>
  </div>

  {#if videoPaths.ceiling}
    <div class="toolbar-group filename">
      <span class="file-label" title={videoPaths.ceiling}>{videoPaths.ceiling}</span>
    </div>
  {/if}

  <div class="toolbar-group status">
    <span class="event-count">{eventCount} events</span>
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 16px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .phase-label {
    color: var(--text-muted);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .radio {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    border: 1px solid transparent;
    transition: all 0.15s;
  }

  .radio:hover {
    background: var(--bg-surface);
  }

  .radio.active {
    background: var(--bg-surface);
    border-color: var(--border);
  }

  .radio input {
    display: none;
  }

  .loaded-indicator {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #22c55e;
    margin-left: 4px;
  }

  .size-control {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .size-label {
    color: var(--text-muted);
    font-size: 11px;
    min-width: 10px;
  }

  .size-slider {
    width: 80px;
    accent-color: var(--accent-active);
  }

  .size-value {
    color: var(--accent-active);
    font-size: 11px;
    min-width: 18px;
    text-align: right;
  }

  .filename {
    color: var(--text-muted);
    font-size: 12px;
  }

  .file-label {
    max-width: 500px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: left;
  }

  .status {
    margin-left: auto;
  }

  .event-count {
    font-size: 12px;
    color: var(--text-muted);
  }
</style>
