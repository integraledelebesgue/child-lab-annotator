import type { GazeEvent, HelperData } from "./types";
import { parseMetadataComments } from "../../utils/csv";

const HEADER = "start_time,end_time,duration,start_frame,end_frame";

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

  const headerLine = lines[dataStart]?.toLowerCase().replace(/\s/g, "") ?? "";
  if (!headerLine.includes("start_time")) {
    throw new Error("Invalid CSV: missing 'start_time' column in header");
  }

  const events: GazeEvent[] = [];
  let nextId = 0;
  for (let i = dataStart + 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 5) continue;

    events.push({
      id: nextId++,
      startTime: parseFloat(parts[0]) || 0,
      endTime: parseFloat(parts[1]) || 0,
      startFrame: parseInt(parts[3], 10) || 0,
      endFrame: parseInt(parts[4], 10) || 0,
    });
  }

  return { events, metadata: csvMetadata };
}

export function parseHelperCSV(text: string): HelperData {
  const lines = text.trim().split("\n");

  // Find header and determine column index for average_angle_diff
  let header = "";
  let dataStartIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    header = trimmed;
    dataStartIdx = i + 1;
    break;
  }

  const columns = header.toLowerCase().replace(/\s/g, "").split(",");
  const angleCol = columns.indexOf("average_angle_diff");
  if (angleCol === -1) {
    throw new Error("Helper CSV missing 'average_angle_diff' column");
  }
  const frameCol = columns.indexOf("frame");

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
    const frame = parseInt(parts[frameCol >= 0 ? frameCol : 0], 10);
    if (frame > maxFrame) maxFrame = frame;
  }

  const frameCount = maxFrame + 1;
  const angleDiffs = new Float32Array(frameCount);
  const valid = new Uint8Array(frameCount);

  // Second pass: populate
  for (const line of dataLines) {
    const parts = line.split(",");
    if (parts.length <= angleCol) continue;
    const frame = parseInt(parts[frameCol >= 0 ? frameCol : 0], 10);
    const angleDiff = parseFloat(parts[angleCol]);
    if (isNaN(frame) || isNaN(angleDiff)) continue;
    if (frame >= 0 && frame < frameCount) {
      angleDiffs[frame] = angleDiff;
      valid[frame] = 1;
    }
  }

  return { angleDiffs, valid, frameCount };
}
