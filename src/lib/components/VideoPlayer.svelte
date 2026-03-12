<script lang="ts">
  import CanvasOverlay from "./CanvasOverlay.svelte";
  import type { Target, Phase, AnnotationRow } from "../types";
  import { annotations } from "../stores/annotations";

  interface Props {
    src: string | null;
    target: Target;
    phase: Phase;
    playbackSpeed: number;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    currentFrame: number;
    annotations: AnnotationRow[];
    onPhaseComplete: () => void;
  }

  let {
    src,
    target,
    phase,
    playbackSpeed,
    isPlaying = $bindable(),
    currentTime = $bindable(),
    duration = $bindable(),
    currentFrame = $bindable(),
    annotations: annotationRows,
    onPhaseComplete,
  }: Props = $props();

  let videoEl = $state<HTMLVideoElement | null>(null);
  let containerEl = $state<HTMLDivElement | null>(null);
  let videoWidth = $state(0);
  let videoHeight = $state(0);
  let displayWidth = $state(0);
  let displayHeight = $state(0);
  let offsetX = $state(0);
  let offsetY = $state(0);
  let frameCallbackId = $state<number | null>(null);
  let detectedFps = $state(30);
  let fpsProbeCount = 0;
  let lastMediaTime = -1;

  $effect(() => {
    if (videoEl) {
      videoEl.playbackRate = playbackSpeed;
    }
  });

  // Reset video to beginning when target or phase changes
  $effect(() => {
    // Subscribe to target and phase
    void target;
    void phase;
    if (!videoEl) return;
    videoEl.pause();
    videoEl.currentTime = 0;
    currentTime = 0;
    currentFrame = 0;
    isPlaying = false;
    lastMediaTime = -1;
  });

  function onLoadedMetadata() {
    if (!videoEl) return;
    duration = videoEl.duration;
    videoWidth = videoEl.videoWidth;
    videoHeight = videoEl.videoHeight;
    computeDisplaySize();
  }

  function computeDisplaySize() {
    if (!containerEl || !videoWidth || !videoHeight) return;
    const cw = containerEl.clientWidth;
    const ch = containerEl.clientHeight;
    const videoAspect = videoWidth / videoHeight;
    const containerAspect = cw / ch;

    if (videoAspect > containerAspect) {
      displayWidth = cw;
      displayHeight = cw / videoAspect;
    } else {
      displayHeight = ch;
      displayWidth = ch * videoAspect;
    }
    offsetX = (cw - displayWidth) / 2;
    offsetY = (ch - displayHeight) / 2;
  }

  function onTimeUpdate() {
    if (!videoEl) return;
    currentTime = videoEl.currentTime;
  }

  function onPlay() {
    isPlaying = true;
    startFrameCallback();
  }

  function onPause() {
    isPlaying = false;
  }

  function onEnded() {
    isPlaying = false;
    onPhaseComplete();
  }

  function startFrameCallback() {
    if (!videoEl) return;
    if ("requestVideoFrameCallback" in videoEl) {
      const cb = (now: number, metadata: { mediaTime: number }) => {
        if (!videoEl) return;

        // Detect FPS from first few frame intervals
        if (lastMediaTime >= 0 && fpsProbeCount < 10) {
          const dt = metadata.mediaTime - lastMediaTime;
          if (dt > 0.001 && dt < 0.2) {
            const sampleFps = 1 / dt;
            detectedFps = Math.round(sampleFps);
            fpsProbeCount++;
          }
        }
        lastMediaTime = metadata.mediaTime;

        const frame = Math.round(metadata.mediaTime * detectedFps);
        currentFrame = frame;
        currentTime = metadata.mediaTime;
        annotations.ensureFrame(frame, metadata.mediaTime);
        if (!videoEl.paused && !videoEl.ended) {
          frameCallbackId = (videoEl as any).requestVideoFrameCallback(cb);
        }
      };
      frameCallbackId = (videoEl as any).requestVideoFrameCallback(cb);
    }
  }

  export function togglePlay() {
    if (!videoEl) return;
    if (videoEl.paused) {
      videoEl.play();
    } else {
      videoEl.pause();
    }
  }

  export function seek(time: number) {
    if (!videoEl) return;
    videoEl.currentTime = time;
    currentTime = time;
  }

  let resizeObserver: ResizeObserver | null = null;

  $effect(() => {
    if (containerEl) {
      resizeObserver = new ResizeObserver(() => computeDisplaySize());
      resizeObserver.observe(containerEl);
      return () => resizeObserver?.disconnect();
    }
  });
</script>

<div class="video-container" bind:this={containerEl}>
  {#if src}
    <video
      bind:this={videoEl}
      src={src}
      onloadedmetadata={onLoadedMetadata}
      ontimeupdate={onTimeUpdate}
      onplay={onPlay}
      onpause={onPause}
      onended={onEnded}
      preload="auto"
      style="width: {displayWidth}px; height: {displayHeight}px; margin-left: {offsetX}px; margin-top: {offsetY}px;"
    ></video>

    {#if displayWidth > 0 && displayHeight > 0}
      <CanvasOverlay
        width={displayWidth}
        height={displayHeight}
        {offsetX}
        {offsetY}
        {videoWidth}
        {videoHeight}
        {target}
        {phase}
        {currentFrame}
        {currentTime}
        annotations={annotationRows}
      />
    {/if}
  {:else}
    <div class="placeholder">
      <p>Load a video to begin annotation</p>
    </div>
  {/if}
</div>

<style>
  .video-container {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
    background: #000;
  }

  video {
    position: absolute;
    top: 0;
    left: 0;
    object-fit: contain;
  }

  .placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 16px;
  }
</style>
