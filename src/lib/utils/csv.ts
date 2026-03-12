import type { AnnotationRow } from "../types";

const HEADER = "frame,timestamp,infant_x,infant_y,infant_yaw,mother_x,mother_y,mother_yaw";

function formatNum(v: number | null): string {
  if (v === null) return "";
  return v.toFixed(4);
}

export function toCSV(rows: AnnotationRow[]): string {
  const lines = [HEADER];
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

export function fromCSV(text: string): AnnotationRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase().replace(/\s/g, "");
  if (!header.includes("frame")) {
    throw new Error("Invalid CSV: missing 'frame' column in header");
  }

  const rows: AnnotationRow[] = [];
  for (let i = 1; i < lines.length; i++) {
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

  return rows;
}
