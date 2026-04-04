<script lang="ts">
  import type { GazeEvent, HelperData } from "./types";

  interface Props {
    helperData: HelperData | null;
    threshold: number;
    events: GazeEvent[];
    currentTime: number;
    duration: number;
    detectedFps: number;
    fragmentStartTime: number | null;
    fragmentEndTime: number | null;
    recordingStartTime: number | null;
    onSeek: (time: number) => void;
  }

  let {
    helperData,
    threshold,
    events,
    currentTime,
    duration,
    detectedFps,
    fragmentStartTime,
    fragmentEndTime,
    recordingStartTime,
    onSeek,
  }: Props = $props();

  const CANVAS_HEIGHT = 64;
  const EVENT_HEIGHT = 8;
  const EVENT_MARGIN = 4;

  let containerEl = $state<HTMLDivElement | null>(null);
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let canvasWidth = $state(0);

  let rangeStart = $derived(fragmentStartTime ?? 0);
  let rangeEnd = $derived(fragmentEndTime ?? duration);
  let rangeDuration = $derived(rangeEnd - rangeStart);

  function timeToX(t: number): number {
    if (rangeDuration <= 0) return 0;
    return ((t - rangeStart) / rangeDuration) * canvasWidth;
  }

  function xToTime(x: number): number {
    if (canvasWidth <= 0) return rangeStart;
    return rangeStart + (x / canvasWidth) * rangeDuration;
  }

  // ResizeObserver
  let resizeObserver: ResizeObserver | null = null;

  $effect(() => {
    if (containerEl) {
      resizeObserver = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width ?? 0;
        if (w > 0) canvasWidth = w;
      });
      resizeObserver.observe(containerEl);
      return () => resizeObserver?.disconnect();
    }
  });

  // Choose tick interval based on pixels-per-second
  function getTickInterval(pxPerSec: number): { major: number; minor: number } {
    if (pxPerSec > 200) return { major: 1, minor: 0.1 };
    if (pxPerSec > 30) return { major: 5, minor: 1 };
    if (pxPerSec > 10) return { major: 10, minor: 1 };
    if (pxPerSec > 3) return { major: 30, minor: 1 };
    return { major: 60, minor: 5 };
  }

  function formatTickLabel(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0) {
      return s === 0 ? `${m}m` : `${m}:${s.toFixed(0).padStart(2, "0")}`;
    }
    return Number.isInteger(s) ? `${s}s` : `${s.toFixed(1)}s`;
  }

  // Draw
  $effect(() => {
    const canvas = canvasEl;
    if (!canvas || canvasWidth <= 0 || rangeDuration <= 0) return;

    // Read all reactive deps
    const _helperData = helperData;
    const _threshold = threshold;
    const _events = events;
    const _currentTime = currentTime;
    const _fps = detectedFps;
    const _rangeStart = rangeStart;
    const _rangeEnd = rangeEnd;
    const _rangeDuration = rangeDuration;
    const _recordingStart = recordingStartTime;

    const dpr = window.devicePixelRatio || 1;
    const w = canvasWidth;
    const h = CANVAS_HEIGHT;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d")!;

    const midY = h / 2;
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);

    // Layer 1: Heatmap — drawn at raw pixel coords via putImageData (ignores transform)
    if (_helperData && _helperData.frameCount > 0) {
      const imageData = ctx.createImageData(pw, ph);
      const data = imageData.data;

      for (let px = 0; px < pw; px++) {
        const time = _rangeStart + (px / pw) * _rangeDuration;
        const frame = Math.round(time * _fps);

        if (frame < 0 || frame >= _helperData.frameCount || !_helperData.valid[frame]) continue;

        const absAngle = Math.abs(_helperData.angleDiffs[frame]);
        if (absAngle > _threshold) continue;

        const t = _threshold > 0 ? absAngle / _threshold : 0;

        // Green #22c55e (34,197,94) → Yellow #eab308 (234,179,8)
        const r = Math.round(34 + t * (234 - 34));
        const g = Math.round(197 + t * (179 - 197));
        const b = Math.round(94 + t * (8 - 94));
        const alpha = Math.round(160 * (1 - t * 0.6));

        for (let y = 0; y < ph; y++) {
          const idx = (y * pw + px) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = alpha;
        }
      }

      ctx.putImageData(imageData, 0, 0);
    }

    // Set scale for all subsequent drawing (ruler, events, playhead)
    ctx.scale(dpr, dpr);

    // Layer 2: Event bars — centered on ruler line
    const eventY = midY - EVENT_HEIGHT / 2;
    ctx.fillStyle = "rgba(245, 158, 11, 0.45)";
    for (const event of _events) {
      const x1 = timeToX(event.startTime);
      const x2 = timeToX(event.endTime);
      const barWidth = Math.max(x2 - x1, 2);
      ctx.fillRect(x1, eventY, barWidth, EVENT_HEIGHT);
    }

    // Active recording bar
    if (_recordingStart !== null) {
      const x1 = timeToX(_recordingStart);
      const x2 = timeToX(_currentTime);
      const barWidth = Math.max(x2 - x1, 2);
      ctx.fillStyle = "rgba(245, 158, 11, 0.7)";
      ctx.fillRect(x1, eventY, barWidth, EVENT_HEIGHT);
    }

    // Layer 3: Ruler — horizontal line with tick marks
    const pxPerSec = w / _rangeDuration;
    const { major, minor } = getTickInterval(pxPerSec);

    // Horizontal center line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();

    // Tick marks
    const firstMinor = Math.ceil(_rangeStart / minor) * minor;
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    for (let t = firstMinor; t <= _rangeEnd; t += minor) {
      const x = timeToX(t);
      if (x < 0 || x > w) continue;

      const isMajor = Math.abs(t % major) < minor * 0.01 || Math.abs(t % major - major) < minor * 0.01;
      const tickHeight = isMajor ? 6 : 3;

      ctx.strokeStyle = isMajor ? "rgba(255, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, midY - tickHeight);
      ctx.lineTo(x, midY + tickHeight);
      ctx.stroke();

      if (isMajor) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.fillText(formatTickLabel(t), x, midY + tickHeight + 2);
      }
    }

    // Layer 4: Playhead
    const playX = timeToX(_currentTime);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, h);
    ctx.stroke();
  });

  let isDragging = false;

  function seekFromMouse(e: MouseEvent) {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = xToTime(x);
    onSeek(Math.max(rangeStart, Math.min(rangeEnd, time)));
  }

  function onMouseDown(e: MouseEvent) {
    if (recordingStartTime !== null) return;
    isDragging = true;
    seekFromMouse(e);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function onMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    seekFromMouse(e);
  }

  function onMouseUp() {
    isDragging = false;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  }
</script>

<div class="timeline-container" bind:this={containerEl}>
  <canvas
    bind:this={canvasEl}
    onmousedown={onMouseDown}
  ></canvas>
</div>

<style>
  .timeline-container {
    flex-shrink: 0;
    height: 64px;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border);
    cursor: pointer;
  }

  canvas {
    display: block;
  }
</style>
