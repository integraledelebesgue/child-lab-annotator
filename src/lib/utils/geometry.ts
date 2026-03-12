/** Compute angle in degrees from center to point. 0 = up, positive = clockwise. */
export function angleDeg(cx: number, cy: number, px: number, py: number): number {
  const dx = px - cx;
  const dy = py - cy;
  // atan2 gives angle from positive X axis, we want angle from negative Y axis (up)
  const rad = Math.atan2(dx, -dy);
  let deg = (rad * 180) / Math.PI;
  if (deg < -180) deg += 360;
  if (deg > 180) deg -= 360;
  return deg;
}

/** Get point on ellipse perimeter at given angle (degrees, 0=up, clockwise). */
export function ellipsePoint(
  cx: number,
  cy: number,
  a: number,
  b: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + a * Math.cos(rad),
    y: cy + b * Math.sin(rad),
  };
}

/** Get point on circle perimeter at given angle (degrees, 0=up, clockwise). */
export function circlePoint(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
): { x: number; y: number } {
  return ellipsePoint(cx, cy, r, r, angleDeg);
}

/** Distance between two points. */
export function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/** Check if point is inside an ellipse. */
export function isInsideEllipse(
  px: number,
  py: number,
  cx: number,
  cy: number,
  a: number,
  b: number,
): boolean {
  return ((px - cx) / a) ** 2 + ((py - cy) / b) ** 2 <= 1;
}
