import type { Fragment } from "../../types";

export type GazeEventType = "mutual_gaze" | "uncertain_mutual_gaze";

export interface GazeEvent {
  id: number;
  type: GazeEventType;
  startTime: number;
  endTime: number;
  startFrame: number;
  endFrame: number;
}

export const GAZE_EVENT_LABELS: Record<GazeEventType, string> = {
  mutual_gaze: "Mutual Gaze",
  uncertain_mutual_gaze: "Uncertain Mutual Gaze",
};

export const GAZE_EVENT_COLORS: Record<GazeEventType, string> = {
  mutual_gaze: "#f59e0b",
  uncertain_mutual_gaze: "#8b5cf6",
};

export const KEY_TO_GAZE_EVENT: Record<string, GazeEventType> = {
  e: "mutual_gaze",
  w: "uncertain_mutual_gaze",
};

export const GAZE_EVENT_KEYS: Record<GazeEventType, string> = {
  mutual_gaze: "E",
  uncertain_mutual_gaze: "W",
};

export interface GazeFragment extends Fragment {
  events: GazeEvent[];
}

export interface HelperData {
  angleDiffs: Float32Array;
  valid: Uint8Array;
  frameCount: number;
}

export type GazePhase = "synchronization" | "annotation";

export type VideoRole = "mother" | "ceiling" | "infant";

export const VIDEO_ROLES: VideoRole[] = ["mother", "ceiling", "infant"];

export const VIDEO_ROLE_LABELS: Record<VideoRole, string> = {
  mother: "Mother",
  ceiling: "Ceiling",
  infant: "Infant",
};
