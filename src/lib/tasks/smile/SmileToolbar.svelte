<script lang="ts">
  import { getFileName } from "../../utils/video";

  interface Props {
    videoPath: string | null;
    hasVideo: boolean;
    hasFragments: boolean;
    fragmentLength: number;
    eventCount: number;
    onLoadVideo: () => void;
    onLoadCSV: () => void;
    onExportCSV: () => void;
    onFragment: () => void;
    onClearFragments: () => void;
  }

  let {
    videoPath,
    hasVideo,
    hasFragments,
    fragmentLength = $bindable(),
    eventCount,
    onLoadVideo,
    onLoadCSV,
    onExportCSV,
    onFragment,
    onClearFragments,
  }: Props = $props();
</script>

<div class="toolbar">
  <div class="toolbar-group">
    <button onclick={onLoadVideo}>Load Video</button>
    <button onclick={onLoadCSV}>Load CSV</button>
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
      <button onclick={onFragment} disabled={!hasVideo}>Fragment</button>
    {:else}
      <button onclick={onClearFragments}>Clear Fragments</button>
    {/if}
  </div>

  <div class="toolbar-group">
    <button onclick={onExportCSV}>Export CSV</button>
  </div>

  {#if videoPath}
    <div class="toolbar-group filename">
      <span class="file-label">{getFileName(videoPath)}</span>
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
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status {
    margin-left: auto;
  }

  .event-count {
    font-size: 12px;
    color: var(--text-muted);
  }
</style>
