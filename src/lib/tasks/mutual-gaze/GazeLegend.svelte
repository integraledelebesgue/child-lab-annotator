<script lang="ts">
  import type { GazePhase, GazeEventType } from "./types";
  import { GAZE_EVENT_LABELS, GAZE_EVENT_COLORS, GAZE_EVENT_KEYS } from "./types";

  interface Props {
    phase: GazePhase;
    isRecording: boolean;
    recordingType: GazeEventType | null;
  }

  let { phase, isRecording, recordingType }: Props = $props();

  const eventTypes: GazeEventType[] = ["uncertain_mutual_gaze", "mutual_gaze"];
</script>

<div class="legend">
  <div class="legend-section">
    <span class="legend-title">Playback</span>
    <div class="legend-items">
      <span class="legend-item"><kbd>Space</kbd> Play / Pause</span>
    </div>
  </div>

  {#if phase === "annotation"}
    {#each eventTypes as type}
      <div class="legend-section">
        <span class="legend-title">{GAZE_EVENT_LABELS[type]}</span>
        <div class="legend-items">
          <span class="legend-item">
            <span class="color-dot" style="background: {GAZE_EVENT_COLORS[type]}"></span>
            <kbd class:recording={isRecording && recordingType === type}>{GAZE_EVENT_KEYS[type]}</kbd>
            Hold to record
          </span>
        </div>
      </div>
    {/each}
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

  .color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  kbd.recording {
    color: #ef4444;
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.15);
    animation: pulse 1s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
