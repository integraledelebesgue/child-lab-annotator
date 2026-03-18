<script lang="ts">
  import { untrack } from "svelte";
  import type { Target, Phase, AnnotationRow, ShapeSizes } from "./types";
  import { TARGET_COLORS, INACTIVE_COLOR } from "./types";
  import { angleDeg, dist } from "../../utils/geometry";

  interface Props {
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    videoWidth: number;
    videoHeight: number;
    target: Target;
    phase: Phase;
    currentFrame: number;
    currentTime: number;
    annotations: AnnotationRow[];
    shapeSizes: ShapeSizes;
    detectedFps: number;
    onRecord: (frame: number, time: number, target: Target, phase: Phase, data: { x: number; y: number } | { yaw: number }) => void;
  }

  let {
    width,
    height,
    offsetX,
    offsetY,
    videoWidth,
    videoHeight,
    target,
    phase,
    currentFrame,
    currentTime,
    annotations: annotationRows,
    shapeSizes,
    detectedFps,
    onRecord,
  }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);

  let isDragging = $state(false);
  let dragX = $state(0.5);
  let dragY = $state(0.5);
  let dragYaw = $state(0);
  let lastRecordedFrame = -1;

  function toPixel(nx: number, ny: number): { x: number; y: number } {
    return { x: nx * width, y: ny * height };
  }

  function toNorm(px: number, py: number): { x: number; y: number } {
    return { x: px / width, y: py / height };
  }

  function handlePoint(cx: number, cy: number, r: number, yaw: number): { x: number; y: number } {
    const rad = (yaw * Math.PI) / 180;
    return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
  }

  function getPositionAt(rows: AnnotationRow[], t: Target, frame: number): { x: number; y: number } | null {
    for (let f = frame; f >= 0; f--) {
      const row = rows[f];
      if (!row) continue;
      const x = t === "infant" ? row.infantX : row.motherX;
      const y = t === "infant" ? row.infantY : row.motherY;
      if (x !== null && y !== null) return { x, y };
    }
    return null;
  }

  function getYawAt(rows: AnnotationRow[], t: Target, frame: number): number | null {
    for (let f = frame; f >= 0; f--) {
      const row = rows[f];
      if (!row) continue;
      const yaw = t === "infant" ? row.infantYaw : row.motherYaw;
      if (yaw !== null) return yaw;
    }
    return null;
  }

  function recordCurrentState(frame: number, time: number) {
    if (phase === "position") {
      onRecord(frame, time, target, phase, { x: dragX, y: dragY });
    } else {
      onRecord(frame, time, target, phase, { yaw: dragYaw });
    }
    lastRecordedFrame = frame;
  }

  // Sync drag state from annotation store on each frame change
  $effect(() => {
    const frame = currentFrame;
    const time = currentTime;
    const rows = untrack(() => annotationRows);

    if (!isDragging) {
      if (phase === "position") {
        const pos = getPositionAt(rows, target, frame);
        if (pos) {
          dragX = pos.x;
          dragY = pos.y;
        }
      } else {
        const pos = getPositionAt(rows, target, frame);
        if (pos) {
          dragX = pos.x;
          dragY = pos.y;
        }
        const yaw = getYawAt(rows, target, frame);
        if (yaw !== null) {
          dragYaw = yaw;
        }
      }
    } else if (phase === "orientation") {
      const pos = getPositionAt(rows, target, frame);
      if (pos) {
        dragX = pos.x;
        dragY = pos.y;
      }
    }

    if (frame !== lastRecordedFrame) {
      untrack(() => recordCurrentState(frame, time));
    }
  });

  // Redraw canvas
  $effect(() => {
    if (!canvasEl) return;
    const _width = width;
    const _height = height;
    const _currentFrame = currentFrame;
    const _dragX = dragX;
    const _dragY = dragY;
    const _dragYaw = dragYaw;
    const _target = target;
    const _phase = phase;
    const _rows = annotationRows;
    const _shapeSizes = shapeSizes;

    const ctx = canvasEl.getContext("2d")!;
    ctx.clearRect(0, 0, _width, _height);

    const otherTarget: Target = _target === "infant" ? "mother" : "infant";

    drawTarget(ctx, otherTarget, false, _currentFrame, _rows, _target, _phase, _dragX, _dragY, _dragYaw);

    if (_phase === "orientation") {
      drawPositionTrace(ctx, _rows, _target, _currentFrame, detectedFps, TARGET_COLORS[_target]);
    }

    drawTarget(ctx, _target, true, _currentFrame, _rows, _target, _phase, _dragX, _dragY, _dragYaw);
  });

  function drawTarget(
    ctx: CanvasRenderingContext2D,
    t: Target,
    active: boolean,
    frame: number,
    rows: AnnotationRow[],
    activeTarget: Target,
    activePhase: Phase,
    dx: number,
    dy: number,
    dYaw: number,
  ) {
    const pos = t === activeTarget ? { x: dx, y: dy } : getPositionAt(rows, t, frame);
    if (!pos) return;

    const pixel = toPixel(pos.x, pos.y);
    const sizes = shapeSizes[t];
    const color = active ? TARGET_COLORS[t] : INACTIVE_COLOR;
    const isOrientationPhase = active && activePhase === "orientation";

    if (isOrientationPhase) {
      const a = sizes.ellipseA;
      const b = sizes.ellipseB;
      const yaw = active ? dYaw : (getYawAt(rows, t, frame) ?? 0);
      const rotRad = ((yaw + 90) * Math.PI) / 180;

      ctx.beginPath();
      ctx.ellipse(pixel.x, pixel.y, a, b, rotRad, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = color + "20";
      ctx.fill();

      const handle = handlePoint(pixel.x, pixel.y, a, yaw);

      ctx.beginPath();
      ctx.moveTo(pixel.x, pixel.y);
      ctx.lineTo(handle.x, handle.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(handle.x, handle.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(pixel.x, pixel.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      const r = sizes.circleRadius;

      ctx.beginPath();
      ctx.arc(pixel.x, pixel.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = color + "20";
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(pixel.x - 5, pixel.y);
      ctx.lineTo(pixel.x + 5, pixel.y);
      ctx.moveTo(pixel.x, pixel.y - 5);
      ctx.lineTo(pixel.x, pixel.y + 5);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();

      if (!active) {
        const yaw = getYawAt(rows, t, frame);
        if (yaw !== null) {
          const handle = handlePoint(pixel.x, pixel.y, r, yaw);
          ctx.beginPath();
          ctx.moveTo(pixel.x, pixel.y);
          ctx.lineTo(handle.x, handle.y);
          ctx.strokeStyle = color + "80";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }

  function drawPositionTrace(
    ctx: CanvasRenderingContext2D,
    rows: AnnotationRow[],
    t: Target,
    frame: number,
    fps: number,
    color: string,
  ) {
    const lookahead = Math.round(fps);
    const points: { x: number; y: number }[] = [];

    for (let f = frame + 1; f <= frame + lookahead && f < rows.length; f++) {
      const row = rows[f];
      if (!row) continue;
      const x = t === "infant" ? row.infantX : row.motherX;
      const y = t === "infant" ? row.infantY : row.motherY;
      if (x !== null && y !== null) {
        points.push(toPixel(x, y));
      }
    }

    if (points.length === 0) return;

    for (let i = 0; i < points.length - 1; i++) {
      const progress = i / points.length;
      const alpha = 0.5 - progress * 0.4;
      ctx.beginPath();
      ctx.moveTo(points[i].x, points[i].y);
      ctx.lineTo(points[i + 1].x, points[i + 1].y);
      ctx.strokeStyle = color + Math.round(alpha * 255).toString(16).padStart(2, "0");
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    for (let i = 0; i < points.length; i++) {
      const progress = i / points.length;
      const alpha = 0.5 - progress * 0.4;
      ctx.beginPath();
      ctx.arc(points[i].x, points[i].y, 3, 0, Math.PI * 2);
      ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, "0");
      ctx.fill();
    }
  }

  function getCanvasCoords(e: MouseEvent): { x: number; y: number } {
    const rect = canvasEl!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    const coords = getCanvasCoords(e);
    const pixel = toPixel(dragX, dragY);
    const sizes = shapeSizes[target];

    if (phase === "position") {
      const r = sizes.circleRadius;
      if (dist(coords.x, coords.y, pixel.x, pixel.y) <= r + 10) {
        isDragging = true;
      }
    } else {
      const a = sizes.ellipseA;
      const handle = handlePoint(pixel.x, pixel.y, a, dragYaw);
      if (dist(coords.x, coords.y, handle.x, handle.y) <= 12) {
        isDragging = true;
      }
    }
  }

  function onMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    const coords = getCanvasCoords(e);

    if (phase === "position") {
      const norm = toNorm(coords.x, coords.y);
      dragX = Math.max(0, Math.min(1, norm.x));
      dragY = Math.max(0, Math.min(1, norm.y));
    } else {
      const pixel = toPixel(dragX, dragY);
      dragYaw = angleDeg(pixel.x, pixel.y, coords.x, coords.y);
    }

    recordCurrentState(currentFrame, currentTime);
  }

  function onMouseUp() {
    isDragging = false;
  }
</script>

<canvas
  bind:this={canvasEl}
  {width}
  {height}
  style="position: absolute; top: {offsetY}px; left: {offsetX}px; cursor: {isDragging ? 'grabbing' : 'grab'};"
  onmousedown={onMouseDown}
  onmousemove={onMouseMove}
  onmouseup={onMouseUp}
  onmouseleave={onMouseUp}
></canvas>
