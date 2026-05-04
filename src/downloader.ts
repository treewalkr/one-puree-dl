interface Segment {
  url: string;
  duration: number;
}

export function parseM3u8(manifest: string, baseUrl: string): Segment[] {
  const lines = manifest.split("\n");
  const segments: Segment[] = [];
  let duration = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#EXTINF:")) {
      duration = parseFloat(trimmed.replace("#EXTINF:", "").replace(",", ""));
    } else if (trimmed && !trimmed.startsWith("#")) {
      const url = trimmed.startsWith("http") ? trimmed : `${baseUrl}${trimmed}`;
      segments.push({ url, duration });
    }
  }

  return segments;
}
