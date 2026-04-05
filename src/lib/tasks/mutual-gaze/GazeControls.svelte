<script lang="ts">
  import type { GazePhase } from "./types";

  interface Props {
    isPlaying: boolean;
    playbackSpeed: number;
    currentTime: number;
    duration: number;
    fragmentEndTime: number | null;
    isRecording: boolean;
    canStartRecording: boolean;
    phase: GazePhase;
    onTogglePlay: () => void;
    onMarkStart: () => void;
    onMarkEnd: () => void;
  }

  let {
    isPlaying,
    playbackSpeed = $bindable(),
    currentTime,
    duration,
    fragmentEndTime,
    isRecording,
    canStartRecording,
    phase,
    onTogglePlay,
    onMarkStart,
    onMarkEnd,
  }: Props = $props();

  let displayDuration = $derived(fragmentEndTime ?? duration);

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
  }
</script>

<div class="controls">
  <div class="controls-row">
    <button class="control-btn" onclick={onTogglePlay} title="Space">
      {isPlaying ? "⏸ PAUSE" : "▶ PLAY"}
    </button>

    {#if phase === "annotation"}
      <button
        class="control-btn mark-btn"
        class:active={canStartRecording}
        onclick={onMarkStart}
        disabled={!canStartRecording}
      >
        Mark Start
      </button>

      <button
        class="control-btn mark-btn end"
        class:active={isRecording}
        onclick={onMarkEnd}
        disabled={!isRecording}
      >
        Mark End
      </button>
    {/if}

    <span class="time">{formatTime(currentTime)} / {formatTime(displayDuration)}</span>
  </div>

  <div class="controls-row secondary">
    <span class="speed-label">Speed:</span>
    <span class="speed-value">{playbackSpeed.toFixed(2)}x</span>
    <input
      type="range"
      class="speed-slider"
      min="0.05"
      max="2.00"
      step="0.05"
      bind:value={playbackSpeed}
    />
    {#if isRecording}
      <span class="recording-indicator">Recording...</span>
    {/if}
  </div>
</div>

<style>
  .controls {
    padding: 8px 16px 12px;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border);
  }

  .controls-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .controls-row.secondary {
    margin-top: 6px;
    gap: 6px;
  }

  .control-btn {
    padding: 6px 14px;
    font-size: 13px;
    flex-shrink: 0;
    white-space: nowrap;
    min-width: 90px;
    height: 32px;
    text-align: center;
  }

  .mark-btn {
    min-width: 100px;
  }

  .mark-btn.active {
    border-color: var(--accent-active);
    color: var(--accent-active);
  }

  .mark-btn.end.active {
    border-color: #ef4444;
    color: #ef4444;
  }

  .mark-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .time {
    font-size: 12px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    min-width: 160px;
    text-align: right;
    white-space: nowrap;
  }

  .speed-label {
    font-size: 12px;
    color: var(--text-muted);
  }

  .speed-value {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    min-width: 42px;
    color: var(--accent-active);
  }

  .speed-slider {
    width: 180px;
  }

  .recording-indicator {
    font-size: 12px;
    color: #ef4444;
    margin-left: 12px;
    animation: blink 1s infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
</style>
