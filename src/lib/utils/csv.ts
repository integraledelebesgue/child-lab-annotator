import type { AnnotationRow, ShapeSizes } from "../types";
import { DEFAULT_SHAPE_SIZES } from "../types";

const HEADER = "frame,timestamp,infant_x,infant_y,infant_yaw,mother_x,mother_y,mother_yaw";

function formatNum(v: number | null): string {
  if (v === null) return "";
  return v.toFixed(4);
}

export interface CSVMetadata {
  playbackSpeed: number;
  shapeSizes: ShapeSizes;
  fragmentLength: number;
}

export function toCSV(rows: AnnotationRow[], metadata: CSVMetadata): string {
  const lines = [
    `# playback_speed=${metadata.playbackSpeed},fragment_length=${metadata.fragmentLength}`,
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

  let metadata: CSVMetadata | null = null;
  let playbackSpeed: number | null = null;
  let fragmentLength: number | null = null;
  const shapeSizes: ShapeSizes = structuredClone(DEFAULT_SHAPE_SIZES);
  let hasMetadata = false;

  // Parse metadata comments
  let dataStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("#")) {
      dataStart = i;
      break;
    }
    const content = line.slice(1).trim();
    const pairs = content.split(",");
    for (const pair of pairs) {
      const [key, val] = pair.split("=").map((s) => s.trim());
      const num = parseFloat(val);
      if (isNaN(num)) continue;
      hasMetadata = true;
      switch (key) {
        case "playback_speed": playbackSpeed = num; break;
        case "fragment_length": fragmentLength = num; break;
        case "infant_circle_r": shapeSizes.infant.circleRadius = num; break;
        case "infant_ellipse_a": shapeSizes.infant.ellipseA = num; break;
        case "infant_ellipse_b": shapeSizes.infant.ellipseB = num; break;
        case "mother_circle_r": shapeSizes.mother.circleRadius = num; break;
        case "mother_ellipse_a": shapeSizes.mother.ellipseA = num; break;
        case "mother_ellipse_b": shapeSizes.mother.ellipseB = num; break;
      }
    }
  }

  if (hasMetadata) {
    metadata = {
      playbackSpeed: playbackSpeed ?? 0.5,
      shapeSizes,
      fragmentLength: fragmentLength ?? 30,
    };
  }

  const headerLine = lines[dataStart]?.toLowerCase().replace(/\s/g, "") ?? "";
  if (!headerLine.includes("frame")) {
    throw new Error("Invalid CSV: missing 'frame' column in header");
  }

  const rows: AnnotationRow[] = [];
  for (let i = dataStart + 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 8) continue;

    const parseOpt = (s: string): number | null => {
      const trimmed = s.trim();
      if (trimmed === "") return null;
      const n = parseFloat(trimmed);
      return isNaN(n) ? null : n;
    };

    rows.push({
      frame: parseInt(parts[0], 10),
      timestamp: parseFloat(parts[1]) || 0,
      infantX: parseOpt(parts[2]),
      infantY: parseOpt(parts[3]),
      infantYaw: parseOpt(parts[4]),
      motherX: parseOpt(parts[5]),
      motherY: parseOpt(parts[6]),
      motherYaw: parseOpt(parts[7]),
    });
  }

  return { rows, metadata };
}
