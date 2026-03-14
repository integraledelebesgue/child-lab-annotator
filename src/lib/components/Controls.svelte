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

  let { isPlaying = $bindable(), playbackSpeed = $bindable(), currentTime, duration, fragmentStartTime, fragmentEndTime, onSeek, onTogglePlay }: Props = $props();

  let seekMin = $derived(fragmentStartTime ?? 0);
  let seekMax = $derived(fragmentEndTime ?? (duration || 1));
  let displayDuration = $derived(fragmentEndTime ?? duration);

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.code === "Space" && e.target === document.body) {
      e.preventDefault();
      onTogglePlay();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="controls">
  <div class="controls-row">
    <button class="play-btn" onclick={onTogglePlay}>
      {isPlaying ? "⏸" : "▶"}
    </button>

    <input
      type="range"
      class="seek-bar"
      min={seekMin}
      max={seekMax}
      step="0.01"
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
      min="0.10"
      max="2.00"
      step="0.01"
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
    gap: 8px;
  }

  .play-btn {
    width: 36px;
    height: 36px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
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
    min-width: 100px;
    text-align: right;
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
