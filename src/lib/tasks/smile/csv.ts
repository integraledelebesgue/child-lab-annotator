import type { SmileEvent, ExpressionType, Intensity } from "./types";
import { parseMetadataComments, columnMap } from "../../utils/csv";

const HEADER = "type,intensity,start_time,end_time,duration,start_frame,end_frame,filename";

export interface SmileCSVMetadata {
  playbackSpeed: number;
  fragmentLength: number;
  appVersion: string;
}

export function toCSV(events: SmileEvent[], metadata: SmileCSVMetadata, filename: string): string {
  const lines = [
    `# app_version=${metadata.appVersion},playback_speed=${metadata.playbackSpeed},fragment_length=${metadata.fragmentLength}`,
    HEADER,
  ];
  for (const event of events) {
    const duration = event.endTime - event.startTime;
    lines.push(
      [
        event.type,
        event.intensity,
        event.startTime.toFixed(4),
        event.endTime.toFixed(4),
        duration.toFixed(4),
        event.startFrame,
        event.endFrame,
        filename,
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

export interface SmileCSVResult {
  events: SmileEvent[];
  metadata: SmileCSVMetadata | null;
}

export function fromCSV(text: string): SmileCSVResult {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return { events: [], metadata: null };

  const { metadata: raw, dataStart } = parseMetadataComments(lines);

  let csvMetadata: SmileCSVMetadata | null = null;
  if (Object.keys(raw).length > 0) {
    csvMetadata = {
      playbackSpeed: raw.playback_speed ?? 0.5,
      fragmentLength: raw.fragment_length ?? 30,
    };
  }

  const headerLine = lines[dataStart] ?? "";
  const col = columnMap(headerLine);
  if (col.type === undefined) {
    throw new Error("Invalid CSV: missing 'type' column in header");
  }

  const events: SmileEvent[] = [];
  let nextId = 0;
  for (let i = dataStart + 1; i < lines.length; i++) {
    const parts = lines[i].split(",");

    const type = (parts[col.type] ?? "").trim() as ExpressionType;
    if (!["full", "eye", "mouth"].includes(type)) continue;

    const intensity = parseInt((parts[col.intensity] ?? "").trim(), 10) as Intensity;
    if (![1, 2, 3].includes(intensity)) continue;

    events.push({
      id: nextId++,
      type,
      intensity,
      startTime: parseFloat(parts[col.start_time] ?? "") || 0,
      endTime: parseFloat(parts[col.end_time] ?? "") || 0,
      startFrame: parseInt(parts[col.start_frame] ?? "", 10) || 0,
      endFrame: parseInt(parts[col.end_frame] ?? "", 10) || 0,
    });
  }

  return { events, metadata: csvMetadata };
}
