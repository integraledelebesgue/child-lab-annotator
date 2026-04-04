import type { Fragment } from "../../types";

export interface GazeEvent {
  id: number;
  startTime: number;
  endTime: number;
  startFrame: number;
  endFrame: number;
}

export interface GazeFragment extends Fragment {
  events: GazeEvent[];
}

export interface HelperData {
  angleDiffs: Float32Array;
  valid: Uint8Array;
  frameCount: number;
}

export type VideoRole = "mother" | "ceiling" | "infant";

export const VIDEO_ROLES: VideoRole[] = ["mother", "ceiling", "infant"];

export const VIDEO_ROLE_LABELS: Record<VideoRole, string> = {
  mother: "Mother",
  ceiling: "Ceiling",
  infant: "Infant",
};
