import type { AnnotationRow, ShapeSizes } from "./types";
import { DEFAULT_SHAPE_SIZES } from "./types";
import { formatNum, parseMetadataComments, columnMap } from "../../utils/csv";

const HEADER = "frame,timestamp,infant_x,infant_y,infant_yaw,mother_x,mother_y,mother_yaw";

export interface CSVMetadata {
  playbackSpeed: number;
  shapeSizes: ShapeSizes;
  fragmentLength: number;
  appVersion: string;
}

export function toCSV(rows: AnnotationRow[], metadata: CSVMetadata): string {
  const lines = [
    `# app_version=${metadata.appVersion},playback_speed=${metadata.playbackSpeed},fragment_length=${metadata.fragmentLength}`,
    `# infant_circle_r=${metadata.shapeSizes.infant.circleRadius},infant_ellipse_a=${metadata.shapeSizes.infant.ellipseA},infant_ellipse_b=${metadata.shapeSizes.infant.ellipseB}`,
    `# mother_circle_r=${metadata.shapeSizes.mother.circleRadius},mother_ellipse_a=${metadata.shapeSizes.mother.ellipseA},mother_ellipse_b=${metadata.shapeSizes.mother.ellipseB}`,
    HEADER,
  ];
  for (const row of rows) {
    lines.push(
      [
        row.frame,
        row.timestamp.toFixed(4),
        formatNum(row.infantX),
        formatNum(row.infantY),
        formatNum(row.infantYaw),
        formatNum(row.motherX),
        formatNum(row.motherY),
        formatNum(row.motherYaw),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

export interface CSVResult {
  rows: AnnotationRow[];
  metadata: CSVMetadata | null;
}

export function fromCSV(text: string): CSVResult {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return { rows: [], metadata: null };

  const { metadata: raw, dataStart } = parseMetadataComments(lines);

  let csvMetadata: CSVMetadata | null = null;
  if (Object.keys(raw).length > 0) {
    const shapeSizes: ShapeSizes = structuredClone(DEFAULT_SHAPE_SIZES);
    if (raw.infant_circle_r !== undefined) shapeSizes.infant.circleRadius = raw.infant_circle_r;
    if (raw.infant_ellipse_a !== undefined) shapeSizes.infant.ellipseA = raw.infant_ellipse_a;
    if (raw.infant_ellipse_b !== undefined) shapeSizes.infant.ellipseB = raw.infant_ellipse_b;
    if (raw.mother_circle_r !== undefined) shapeSizes.mother.circleRadius = raw.mother_circle_r;
    if (raw.mother_ellipse_a !== undefined) shapeSizes.mother.ellipseA = raw.mother_ellipse_a;
    if (raw.mother_ellipse_b !== undefined) shapeSizes.mother.ellipseB = raw.mother_ellipse_b;

    csvMetadata = {
      playbackSpeed: raw.playback_speed ?? 0.5,
      shapeSizes,
      fragmentLength: raw.fragment_length ?? 30,
    };
  }

  const headerLine = lines[dataStart] ?? "";
  const col = columnMap(headerLine);
  if (col.frame === undefined) {
    throw new Error("Invalid CSV: missing 'frame' column in header");
  }

  const rows: AnnotationRow[] = [];
  for (let i = dataStart + 1; i < lines.length; i++) {
    const parts = lines[i].split(",");

    const parseOpt = (idx: number | undefined): number | null => {
      if (idx === undefined) return null;
      const trimmed = (parts[idx] ?? "").trim();
      if (trimmed === "") return null;
      const n = parseFloat(trimmed);
      return isNaN(n) ? null : n;
    };

    const frame = parseInt(parts[col.frame] ?? "", 10);
    if (isNaN(frame)) continue;

    rows.push({
      frame,
      timestamp: parseFloat(parts[col.timestamp] ?? "") || 0,
      infantX: parseOpt(col.infant_x),
      infantY: parseOpt(col.infant_y),
      infantYaw: parseOpt(col.infant_yaw),
      motherX: parseOpt(col.mother_x),
      motherY: parseOpt(col.mother_y),
      motherYaw: parseOpt(col.mother_yaw),
    });
  }

  return { rows, metadata: csvMetadata };
}
