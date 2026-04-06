export function formatNum(v: number | null): string {
  if (v === null) return "";
  return v.toFixed(4);
}

/** Build a column-name → index map from a CSV header line. */
export function columnMap(headerLine: string): Record<string, number> {
  const map: Record<string, number> = {};
  const cols = headerLine.toLowerCase().replace(/\s/g, "").split(",");
  for (let i = 0; i < cols.length; i++) {
    map[cols[i]] = i;
  }
  return map;
}

export function parseMetadataComments(lines: string[]): { metadata: Record<string, number>; dataStart: number } {
  const metadata: Record<string, number> = {};
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
      if (!isNaN(num)) {
        metadata[key] = num;
      }
    }
  }

  return { metadata, dataStart };
}
