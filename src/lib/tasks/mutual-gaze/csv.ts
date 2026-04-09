import type { GazeEvent, GazeEventType, HelperData } from "./types";
import { parseMetadataComments, columnMap } from "../../utils/csv";

const HEADER = "type,start_time,end_time,duration,start_frame,end_frame";

export interface GazeCSVMetadata {
  playbackSpeed: number;
  fragmentLength: number;
  threshold: number;
  motherOffset: number;
  ceilingOffset: number;
  infantOffset: number;
  appVersion: string;
}

export function toCSV(events: GazeEvent[], metadata: GazeCSVMetadata): string {
  const lines = [
    `# app_version=${metadata.appVersion},playback_speed=${metadata.playbackSpeed},fragment_length=${metadata.fragmentLength},threshold=${metadata.threshold},mother_offset=${metadata.motherOffset},ceiling_offset=${metadata.ceilingOffset},infant_offset=${metadata.infantOffset}`,
    HEADER,
  ];
  for (const event of events) {
    const duration = event.endTime - event.startTime;
    lines.push(
      [
        event.type,
        event.startTime.toFixed(4),
        event.endTime.toFixed(4),
        duration.toFixed(4),
        event.startFrame,
        event.endFrame,
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

export interface GazeCSVResult {
  events: GazeEvent[];
  metadata: GazeCSVMetadata | null;
}

export function fromCSV(text: string): GazeCSVResult {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return { events: [], metadata: null };

  const { metadata: raw, dataStart } = parseMetadataComments(lines);

  let csvMetadata: GazeCSVMetadata | null = null;
  if (Object.keys(raw).length > 0) {
    csvMetadata = {
      playbackSpeed: raw.playback_speed ?? 0.5,
      fragmentLength: raw.fragment_length ?? 30,
      threshold: raw.threshold ?? 30,
      motherOffset: raw.mother_offset ?? 0,
      ceilingOffset: raw.ceiling_offset ?? 0,
      infantOffset: raw.infant_offset ?? 0,
      appVersion: String(raw.app_version ?? "unknown"),
    };
  }

  const headerLine = lines[dataStart] ?? "";
  const col = columnMap(headerLine);
  if (col.start_time === undefined) {
    throw new Error("Invalid CSV: missing 'start_time' column in header");
  }

  const VALID_TYPES = new Set<GazeEventType>(["mutual_gaze", "uncertain_mutual_gaze"]);
  const hasTypeCol = col.type !== undefined;

  const events: GazeEvent[] = [];
  let nextId = 0;
  for (let i = dataStart + 1; i < lines.length; i++) {
    const parts = lines[i].split(",");

    let type: GazeEventType = "mutual_gaze";
    if (hasTypeCol) {
      const raw = (parts[col.type] ?? "").trim();
      if (VALID_TYPES.has(raw as GazeEventType)) type = raw as GazeEventType;
    }

    events.push({
      id: nextId++,
      type,
      startTime: parseFloat(parts[col.start_time] ?? "") || 0,
      endTime: parseFloat(parts[col.end_time] ?? "") || 0,
      startFrame: parseInt(parts[col.start_frame] ?? "", 10) || 0,
      endFrame: parseInt(parts[col.end_frame] ?? "", 10) || 0,
    });
  }

  return { events, metadata: csvMetadata };
}

/** Smallest signed difference between two angles in degrees. */
function angleDiff(a: number, b: number): number {
  let d = ((a - b) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

const DEG = 180 / Math.PI;

/** Compute average angle diff from head-tracking coordinates. */
function computeAverageAngleDiff(
  infantX: number, infantY: number, infantYaw: number,
  motherX: number, motherY: number, motherYaw: number,
  videoWidth: number, videoHeight: number,
): number {
  const ixp = infantX * videoWidth;
  const iyp = infantY * videoHeight;
  const mxp = motherX * videoWidth;
  const myp = motherY * videoHeight;

  const bearingI2M = Math.atan2(myp - iyp, mxp - ixp) * DEG;
  const bearingM2I = Math.atan2(iyp - myp, ixp - mxp) * DEG;

  const infantDiff = angleDiff(infantYaw - 90, bearingI2M);
  const motherDiff = angleDiff(motherYaw - 90, bearingM2I);

  return (infantDiff + motherDiff) / 2;
}

const HEAD_TRACKING_COLS = ["infant_x", "infant_y", "infant_yaw", "mother_x", "mother_y", "mother_yaw"] as const;

export function parseHelperCSV(text: string, videoWidth = 1, videoHeight = 1): HelperData {
  const lines = text.trim().split("\n");

  // Find header and determine column indices
  let headerLine = "";
  let dataStartIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    headerLine = trimmed;
    dataStartIdx = i + 1;
    break;
  }

  const col = columnMap(headerLine);
  const frameCol = col.frame ?? 0;

  const hasAngleCol = col.average_angle_diff !== undefined;
  const hasHeadTrackingCols = HEAD_TRACKING_COLS.every((c) => col[c] !== undefined);

  if (!hasAngleCol && !hasHeadTrackingCols) {
    throw new Error(
      "Helper CSV must contain either 'average_angle_diff' or head-tracking columns " +
      "(infant_x, infant_y, infant_yaw, mother_x, mother_y, mother_yaw)"
    );
  }

  // Collect data lines
  const dataLines: string[] = [];
  for (let i = dataStartIdx; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed && !trimmed.startsWith("#")) dataLines.push(trimmed);
  }

  if (dataLines.length === 0) {
    return { angleDiffs: new Float32Array(0), valid: new Uint8Array(0), frameCount: 0 };
  }

  // First pass: find max frame
  let maxFrame = 0;
  for (const line of dataLines) {
    const parts = line.split(",");
    const frame = parseInt(parts[frameCol], 10);
    if (frame > maxFrame) maxFrame = frame;
  }

  const frameCount = maxFrame + 1;
  const angleDiffs = new Float32Array(frameCount);
  const valid = new Uint8Array(frameCount);

  // Second pass: populate
  if (hasAngleCol) {
    const angleCol = col.average_angle_diff!;
    for (const line of dataLines) {
      const parts = line.split(",");
      const frame = parseInt(parts[frameCol], 10);
      const diff = parseFloat(parts[angleCol]);
      if (isNaN(frame) || isNaN(diff)) continue;
      if (frame >= 0 && frame < frameCount) {
        angleDiffs[frame] = diff;
        valid[frame] = 1;
      }
    }
  } else {
    const ixCol = col.infant_x!;
    const iyCol = col.infant_y!;
    const iyawCol = col.infant_yaw!;
    const mxCol = col.mother_x!;
    const myCol = col.mother_y!;
    const myawCol = col.mother_yaw!;

    for (const line of dataLines) {
      const parts = line.split(",");
      const frame = parseInt(parts[frameCol], 10);
      if (isNaN(frame) || frame < 0 || frame >= frameCount) continue;

      const ix = parseFloat(parts[ixCol]);
      const iy = parseFloat(parts[iyCol]);
      const iyaw = parseFloat(parts[iyawCol]);
      const mx = parseFloat(parts[mxCol]);
      const my = parseFloat(parts[myCol]);
      const myaw = parseFloat(parts[myawCol]);

      if (isNaN(ix) || isNaN(iy) || isNaN(iyaw) || isNaN(mx) || isNaN(my) || isNaN(myaw)) continue;

      angleDiffs[frame] = computeAverageAngleDiff(ix, iy, iyaw, mx, my, myaw, videoWidth, videoHeight);
      valid[frame] = 1;
    }
  }

  return { angleDiffs, valid, frameCount };
}
