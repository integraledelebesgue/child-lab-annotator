<script lang="ts">
  import { onDestroy } from "svelte";
  import type { Snippet } from "svelte";
  import { logDebugEvent } from "../utils/debugLog";

  interface OverlayParams {
    displayWidth: number;
    displayHeight: number;
    offsetX: number;
    offsetY: number;
    videoWidth: number;
    videoHeight: number;
  }

  interface Props {
    src: string | null;
    playbackSpeed: number;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    currentFrame: number;
    detectedFps: number;
    videoWidth?: number;
    videoHeight?: number;
    fragmentStartTime: number | null;
    fragmentEndTime: number | null;
    onPhaseComplete: () => void;
    onVideoError: (msg: string) => void;
    onFrame?: (frame: number, mediaTime: number) => void;
    overlay?: Snippet<[OverlayParams]>;
    muted?: boolean;
    preload?: "none" | "metadata" | "auto";
    debugName?: string;
  }

  let {
    src,
    playbackSpeed,
    isPlaying = $bindable(),
    currentTime = $bindable(),
    duration = $bindable(),
    currentFrame = $bindable(),
    detectedFps = $bindable(),
    videoWidth = $bindable(0),
    videoHeight = $bindable(0),
    fragmentStartTime,
    fragmentEndTime,
    onPhaseComplete,
    onVideoError,
    onFrame,
    overlay,
    muted = false,
    preload = "auto",
    debugName = "video",
  }: Props = $props();

  let videoEl = $state<HTMLVideoElement | null>(null);
  let containerEl = $state<HTMLDivElement | null>(null);
  let displayWidth = $state(0);
  let displayHeight = $state(0);
  let offsetX = $state(0);
  let offsetY = $state(0);
  let frameCallbackId = $state<number | null>(null);
  let fpsProbeCount = 0;
  let lastMediaTime = -1;
  let fragmentEndTriggered = false;
  let videoStyle = $derived(
    displayWidth > 0 && displayHeight > 0
      ? `width: ${displayWidth}px; height: ${displayHeight}px; margin-left: ${offsetX}px; margin-top: ${offsetY}px;`
      : "width: 100%; height: 100%; margin-left: 0; margin-top: 0;"
  );

  $effect(() => {
    if (videoEl) {
      videoEl.playbackRate = playbackSpeed;
    }
  });

  // Reset fragmentEndTriggered when fragment changes
  $effect(() => {
    void fragmentStartTime;
    void fragmentEndTime;
    fragmentEndTriggered = false;
  });

  $effect(() => {
    logDebugEvent(debugName, "src-updated", {
      hasSrc: src !== null,
      src,
      preload,
    });
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
    logDebugEvent(debugName, "loaded-metadata", {
      src,
      duration,
      videoWidth,
      videoHeight,
      preload,
      muted,
    });
    computeDisplaySize();

    requestAnimationFrame(() => computeDisplaySize());

    if (videoEl.currentTime === 0 && Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
      try {
        videoEl.currentTime = Math.min(0.001, videoEl.duration);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logDebugEvent(debugName, "first-frame-seek-failed", { src, error: msg });
      }
    }
  }

  function onLoadedData() {
    if (!videoEl) return;
    logDebugEvent(debugName, "loaded-data", {
      src,
      currentTime: videoEl.currentTime,
      networkState: videoEl.networkState,
      readyState: videoEl.readyState,
      displayWidth,
      displayHeight,
      containerWidth: containerEl?.clientWidth ?? null,
      containerHeight: containerEl?.clientHeight ?? null,
    });
    computeDisplaySize();
  }

  function computeDisplaySize() {
    if (!containerEl || !videoWidth || !videoHeight) return;
    const cw = containerEl.clientWidth;
    const ch = containerEl.clientHeight;
    if (cw <= 0 || ch <= 0) {
      logDebugEvent(debugName, "display-size-unavailable", {
        src,
        containerWidth: cw,
        containerHeight: ch,
        videoWidth,
        videoHeight,
      });
      return;
    }
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
    logDebugEvent(debugName, "display-size-computed", {
      src,
      containerWidth: cw,
      containerHeight: ch,
      displayWidth,
      displayHeight,
      offsetX,
      offsetY,
    });
  }

  function onTimeUpdate() {
    if (!videoEl) return;
    currentTime = videoEl.currentTime;

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
      ? `Video error ${err.code}: ${err.message || "format not supported by this platform"}`
      : "Failed to load video — format may not be supported";
    logDebugEvent(debugName, "video-error", {
      src,
      code: err?.code ?? null,
      message: err?.message ?? null,
      networkState: videoEl.networkState,
      readyState: videoEl.readyState,
    });
    onVideoError(msg);
  }

  function reportPlayError(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logDebugEvent(debugName, "play-failed", { src, error: msg });
    onVideoError(`Video play failed: ${msg}`);
  }

  function clampSeekTime(time: number, el = videoEl): number {
    if (!Number.isFinite(time)) return 0;
    let seekTo = Math.max(0, time);
    if (el && Number.isFinite(el.duration) && el.duration > 0) {
      seekTo = Math.min(seekTo, el.duration);
    }
    return seekTo;
  }

  function seekVideo(time: number): boolean {
    if (!videoEl) return false;
    const seekTo = clampSeekTime(time);
    try {
      videoEl.currentTime = seekTo;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logDebugEvent(debugName, "seek-failed", {
        src,
        requestedTime: time,
        seekTo,
        error: msg,
      });
      onVideoError(`Video seek failed: ${msg}`);
      return false;
    }
    currentTime = seekTo;
    currentFrame = Math.round(seekTo * detectedFps);
    fragmentEndTriggered = false;
    return true;
  }

  function playVideo() {
    if (!videoEl) return;
    const playPromise = videoEl.play();
    playPromise?.catch(reportPlayError);
  }

  function cancelFrameCallback() {
    if (
      frameCallbackId !== null &&
      videoEl &&
      "cancelVideoFrameCallback" in videoEl
    ) {
      (videoEl as any).cancelVideoFrameCallback(frameCallbackId);
    }
    frameCallbackId = null;
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

        if (fragmentEndTime !== null && metadata.mediaTime >= fragmentEndTime) {
          if (!fragmentEndTriggered) {
            fragmentEndTriggered = true;
            videoEl.pause();
            isPlaying = false;
            onPhaseComplete();
          }
          return;
        }

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
        onFrame?.(frame, metadata.mediaTime);
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
      if ((fragmentEndTime !== null && currentTime >= fragmentEndTime) || videoEl.ended) {
        const seekTo = fragmentStartTime ?? 0;
        seekVideo(seekTo);
      }
      playVideo();
    } else {
      videoEl.pause();
    }
  }

  export function seek(time: number) {
    seekVideo(time);
  }

  export async function captureThumbnail(time: number): Promise<string> {
    const el = videoEl;
    if (!el) return "";
    return new Promise((resolve) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;

      const finish = (thumbnail: string) => {
        if (settled) return;
        settled = true;
        el.removeEventListener("seeked", onSeeked);
        el.removeEventListener("error", onThumbnailError);
        if (timeout) clearTimeout(timeout);
        resolve(thumbnail);
      };

      const onThumbnailError = () => {
        logDebugEvent(debugName, "thumbnail-error", { src, time });
        finish("");
      };

      const onSeeked = () => {
        try {
          const canvas = document.createElement("canvas");
          const thumbWidth = 240;
          const thumbHeight = Math.round(
            thumbWidth * (el.videoHeight / el.videoWidth)
          );
          canvas.width = thumbWidth;
          canvas.height = thumbHeight;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(el, 0, 0, thumbWidth, thumbHeight);
          finish(canvas.toDataURL("image/jpeg", 0.6));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          logDebugEvent(debugName, "thumbnail-capture-failed", {
            src,
            time,
            error: msg,
          });
          onVideoError(`Thumbnail capture failed: ${msg}`);
          finish("");
        }
      };

      el.addEventListener("seeked", onSeeked);
      el.addEventListener("error", onThumbnailError);
      timeout = setTimeout(() => {
        logDebugEvent(debugName, "thumbnail-timeout", { src, time });
        finish("");
      }, 3000);

      try {
        el.currentTime = clampSeekTime(time, el);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logDebugEvent(debugName, "thumbnail-seek-failed", {
          src,
          time,
          error: msg,
        });
        onVideoError(`Thumbnail seek failed: ${msg}`);
        finish("");
      }
    });
  }

  export function togglePlayIfPaused() {
    if (!videoEl || !videoEl.paused) return;
    playVideo();
  }

  export function pauseIfPlaying() {
    if (!videoEl || videoEl.paused) return;
    videoEl.pause();
  }

  export function resetPlayback(seekTo: number) {
    if (!videoEl) return;
    videoEl.pause();
    seekVideo(seekTo);
    isPlaying = false;
    lastMediaTime = -1;
  }

  let resizeObserver: ResizeObserver | null = null;

  $effect(() => {
    if (containerEl) {
      resizeObserver = new ResizeObserver(() => computeDisplaySize());
      resizeObserver.observe(containerEl);
      return () => resizeObserver?.disconnect();
    }
  });

  onDestroy(() => {
    logDebugEvent(debugName, "destroyed", { src });
    cancelFrameCallback();
    if (!videoEl) return;
    videoEl.pause();
    videoEl.removeAttribute("src");
    videoEl.load();
  });
</script>

<div class="video-container" bind:this={containerEl}>
  {#if src}
    <video
      bind:this={videoEl}
      src={src}
      {muted}
      onloadedmetadata={onLoadedMetadata}
      onloadeddata={onLoadedData}
      ontimeupdate={onTimeUpdate}
      onplay={onPlay}
      onpause={onPause}
      onended={onEnded}
      onerror={onError}
      {preload}
      style={videoStyle}
    ></video>

    {#if displayWidth > 0 && displayHeight > 0 && overlay}
      {@render overlay({ displayWidth, displayHeight, offsetX, offsetY, videoWidth, videoHeight })}
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
