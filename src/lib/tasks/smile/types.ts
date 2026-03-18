import type { Fragment } from "../../types";

export type ExpressionType = "full" | "eye" | "mouth";
export type Intensity = 1 | 2 | 3;

export interface SmileEvent {
  id: number;
  type: ExpressionType;
  intensity: Intensity;
  startTime: number;
  endTime: number;
  startFrame: number;
  endFrame: number;
}

export interface SmileFragment extends Fragment {
  events: SmileEvent[];
}

export const EXPRESSION_LABELS: Record<ExpressionType, string> = {
  full: "Full smile",
  eye: "Eye smile",
  mouth: "Mouth smile",
};

export const EXPRESSION_DESCRIPTIONS: Record<ExpressionType, string> = {
  full: "eyes + mouth",
  eye: "eyes only",
  mouth: "mouth only",
};

export const INTENSITY_LABELS: Record<Intensity, string> = {
  1: "Weak",
  2: "Moderate",
  3: "Strong",
};

export const EXPRESSION_COLORS: Record<ExpressionType, string> = {
  full: "#3b82f6",
  eye: "#22c55e",
  mouth: "#ef4444",
};

export const KEY_TO_EXPRESSION: Record<string, ExpressionType> = {
  q: "full",
  w: "eye",
  e: "mouth",
};

export const EXPRESSION_KEYS: Record<ExpressionType, string> = {
  full: "Q",
  eye: "W",
  mouth: "E",
};
