<script lang="ts">
  import type { GazePhase } from "./types";

  interface Props {
    phase: GazePhase;
    isRecording: boolean;
  }

  let { phase, isRecording }: Props = $props();
</script>

<div class="legend">
  <div class="legend-section">
    <span class="legend-title">Playback</span>
    <div class="legend-items">
      <span class="legend-item"><kbd>Space</kbd> Play / Pause</span>
    </div>
  </div>

  {#if phase === "annotation"}
    <div class="legend-section">
      <span class="legend-title">Mutual Gaze Event</span>
      <div class="legend-items">
        <span class="legend-item">
          <kbd class:recording={isRecording}>E</kbd>
          Hold to record
        </span>
      </div>
    </div>
  {/if}

  {#if isRecording}
    <div class="recording-indicator">
      <span class="rec-dot"></span>
      Recording...
    </div>
  {/if}
</div>

<style>
  .legend {
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 8px 16px;
    background: var(--bg);
    border-top: 1px solid var(--border);
    flex-wrap: wrap;
  }

  .legend-section {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .legend-title {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .legend-items {
    display: flex;
    gap: 12px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--text);
  }

  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 20px;
    padding: 0 5px;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 11px;
    font-family: inherit;
    color: var(--text-muted);
  }

  kbd.recording {
    color: #ef4444;
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.15);
    animation: pulse 1s infinite;
  }

  .recording-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    font-size: 12px;
    color: #ef4444;
    font-weight: 500;
  }

  .rec-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ef4444;
    animation: pulse 1s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
