<script lang="ts">
  interface Props {
    isPlaying: boolean;
    playbackSpeed: number;
    currentTime: number;
    duration: number;
    fragmentStartTime: number | null;
    fragmentEndTime: number | null;
    onSeek: (time: number) => void;
    onTogglePlay: () => void;
  }

  let {
    isPlaying,
    playbackSpeed = $bindable(),
    currentTime,
    duration,
    fragmentStartTime,
    fragmentEndTime,
    onSeek,
    onTogglePlay,
  }: Props = $props();

  let seekMin = $derived(fragmentStartTime ?? 0);
  let seekMax = $derived(fragmentEndTime ?? (duration || 1));
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

    <input
      type="range"
      class="seek-bar"
      min={seekMin}
      max={seekMax}
      step="0.001"
      value={currentTime}
      oninput={(e) => onSeek(parseFloat(e.currentTarget.value))}
    />

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

  .seek-bar {
    flex: 1;
    height: 6px;
    cursor: pointer;
  }

  .time {
    font-size: 12px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    min-width: 160px;
    text-align: right;
    white-space: nowrap;
  }

  .frame-display {
    font-size: 11px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    min-width: 50px;
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
</style>
