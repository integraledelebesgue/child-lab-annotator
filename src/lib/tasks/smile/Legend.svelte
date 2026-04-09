<script lang="ts">
  import type { Intensity } from "./types";
  import { EXPRESSION_COLORS, INTENSITY_LABELS } from "./types";

  interface Props {
    currentIntensity: Intensity;
    isRecording: boolean;
    recordingType: string | null;
  }

  let { currentIntensity, isRecording, recordingType }: Props = $props();
</script>

<div class="legend">
  <div class="legend-section">
    <span class="legend-title">Expressions — Hold Key</span>
    <div class="legend-items">
      <span class="legend-item">
        <kbd class:recording={isRecording && recordingType === "full"}>Q</kbd>
        <span class="legend-dot" style="background: {EXPRESSION_COLORS.full}"></span>
        Full smile (eyes + mouth)
      </span>
      <span class="legend-item">
        <kbd class:recording={isRecording && recordingType === "eye"}>W</kbd>
        <span class="legend-dot" style="background: {EXPRESSION_COLORS.eye}"></span>
        Eye smile (eyes only)
      </span>
      <span class="legend-item">
        <kbd class:recording={isRecording && recordingType === "mouth"}>E</kbd>
        <span class="legend-dot" style="background: {EXPRESSION_COLORS.mouth}"></span>
        Mouth smile (mouth only)
      </span>
    </div>
  </div>

  <div class="legend-section">
    <span class="legend-title">Intensity — During Recording</span>
    <div class="legend-items">
      {#each [1, 2, 3] as level}
        <span class="legend-item">
          <kbd class:active={currentIntensity === level}>{level}</kbd>
          {INTENSITY_LABELS[level as Intensity]}
        </span>
      {/each}
    </div>
  </div>

  <div class="legend-section">
    <span class="legend-title">Other</span>
    <div class="legend-items">
      <span class="legend-item"><kbd>Space</kbd> Play / Pause</span>
      <span class="legend-item"><kbd>Del</kbd> Remove last event</span>
    </div>
  </div>


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

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
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

  kbd.active {
    color: var(--accent-active);
    border-color: var(--accent-active);
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
