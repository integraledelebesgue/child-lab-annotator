export type Target = "infant" | "mother";
export type Phase = "position" | "orientation";
export type PhaseKey =
  | "infant-position"
  | "infant-orientation"
  | "mother-position"
  | "mother-orientation";

export interface AnnotationRow {
  frame: number;
  timestamp: number;
  infantX: number | null;
  infantY: number | null;
  infantYaw: number | null;
  motherX: number | null;
  motherY: number | null;
  motherYaw: number | null;
}

export interface ShapeSizes {
  infant: { circleRadius: number; ellipseA: number; ellipseB: number };
  mother: { circleRadius: number; ellipseA: number; ellipseB: number };
}

export const DEFAULT_SHAPE_SIZES: ShapeSizes = {
  infant: { circleRadius: 25, ellipseA: 29, ellipseB: 22 },
  mother: { circleRadius: 35, ellipseA: 40, ellipseB: 31 },
};

export const TARGET_COLORS: Record<Target, string> = {
  infant: "#3b82f6",
  mother: "#22c55e",
};

export const INACTIVE_COLOR = "#9ca3af";
