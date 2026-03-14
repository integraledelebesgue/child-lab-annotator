<script lang="ts">
  import CanvasOverlay from "./CanvasOverlay.svelte";
  import type { Target, Phase, AnnotationRow, ShapeSizes } from "../types";
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
    detectedFps: number;
    annotations: AnnotationRow[];
    shapeSizes: ShapeSizes;
    fragmentStartTime: number | null;
    fragmentEndTime: number | null;
    onPhaseComplete: () => void;
    onVideoError: (msg: string) => void;
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
    detectedFps = $bindable(),
    annotations: annotationRows,
    shapeSizes,
    fragmentStartTime,
    fragmentEndTime,
    onPhaseComplete,
    onVideoError,
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
  let fpsProbeCount = 0;
  let lastMediaTime = -1;
  let fragmentEndTriggered = false;

  $effect(() => {
    if (videoEl) {
      videoEl.playbackRate = playbackSpeed;
    }
  });

  // Reset video to beginning (or fragment start) when target or phase changes
  $effect(() => {
    // Subscribe to target and phase
    void target;
    void phase;
    if (!videoEl) return;
    videoEl.pause();
    const seekTo = fragmentStartTime ?? 0;
    videoEl.currentTime = seekTo;
    currentTime = seekTo;
    currentFrame = Math.round(seekTo * detectedFps);
    isPlaying = false;
    lastMediaTime = -1;
    fragmentEndTriggered = false;
  });

  // Reset fragmentEndTriggered when fragment changes
  $effect(() => {
    void fragmentStartTime;
    void fragmentEndTime;
    fragmentEndTriggered = false;
  });

  function onLoadedMetadata() {
    if (!videoEl) return;
    currentTime = 0;
    currentFrame = 0;
    isPlaying = false;
    detectedFps = 30;
    fpsProbeCount = 0;
    lastMediaTime = -1;
    fragmentEndTriggered = false;
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

    // Fragment boundary enforcement
    if (fragmentEndTime !== null && currentTime >= fragmentEndTime && !fragmentEndTriggered) {
      fragmentEndTriggered = true;
      videoEl.pause();
      isPlaying = false;
      onPhaseComplete();
    }
  }

  function onError() {
    if (!videoEl) return;
    const err = videoEl.error;
    const msg = err
      ? `Video error: ${err.message || "format not supported by this platform"}`
      : "Failed to load video — format may not be supported";
    onVideoError(msg);
  }

  function onPlay() {
    isPlaying = true;
    fragmentEndTriggered = false;
    startFrameCallback();
  }

  function onPause() {
    isPlaying = false;
  }

  function onEnded() {
    isPlaying = false;
    if (!fragmentEndTriggered) {
      onPhaseComplete();
    }
  }

  function startFrameCallback() {
    if (!videoEl) return;
    if ("requestVideoFrameCallback" in videoEl) {
      const cb = (now: number, metadata: { mediaTime: number }) => {
        if (!videoEl) return;

        // Fragment boundary check (frame-level precision)
        if (fragmentEndTime !== null && metadata.mediaTime >= fragmentEndTime) {
          if (!fragmentEndTriggered) {
            fragmentEndTriggered = true;
            videoEl.pause();
            isPlaying = false;
            onPhaseComplete();
          }
          return;
        }

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
      // If at fragment end, seek back to start before playing
      if (fragmentEndTime !== null && currentTime >= fragmentEndTime) {
        const seekTo = fragmentStartTime ?? 0;
        videoEl.currentTime = seekTo;
        currentTime = seekTo;
        currentFrame = Math.round(seekTo * detectedFps);
        fragmentEndTriggered = false;
      }
      videoEl.play();
    } else {
      videoEl.pause();
    }
  }

  export function seek(time: number) {
    if (!videoEl) return;
    videoEl.currentTime = time;
    currentTime = time;
    fragmentEndTriggered = false;
  }

  export async function captureThumbnail(time: number): Promise<string> {
    if (!videoEl) return "";
    return new Promise((resolve) => {
      const onSeeked = () => {
        videoEl!.removeEventListener("seeked", onSeeked);
        const canvas = document.createElement("canvas");
        const thumbWidth = 240;
        const thumbHeight = Math.round(
          thumbWidth * (videoEl!.videoHeight / videoEl!.videoWidth)
        );
        canvas.width = thumbWidth;
        canvas.height = thumbHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(videoEl!, 0, 0, thumbWidth, thumbHeight);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      };
      videoEl!.addEventListener("seeked", onSeeked);
      videoEl!.currentTime = time;
    });
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
      onerror={onError}
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
        {shapeSizes}
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
