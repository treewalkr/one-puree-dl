import { parseM3u8 } from "./downloader";
import type { StreamInfo } from "./types";

export interface ManifestInfo {
  segmentCount: number;
  totalDuration: number;
  targetDuration: number;
}

export async function fetchManifest(
  streamInfo: StreamInfo,
): Promise<ManifestInfo> {
  const headers: Record<string, string> = {
    Referer: streamInfo.referer,
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  };

  const res = await fetch(streamInfo.hlsUrl, { headers });
  if (!res.ok) {
    throw new Error(`Failed to fetch m3u8: HTTP ${res.status}`);
  }

  const manifest = await res.text();
  const baseUrl = streamInfo.hlsUrl.substring(0, streamInfo.hlsUrl.lastIndexOf("/") + 1);
  const segments = parseM3u8(manifest, baseUrl);

  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);
  const targetDuration = parseTargetDuration(manifest);

  return {
    segmentCount: segments.length,
    totalDuration,
    targetDuration,
  };
}

function parseTargetDuration(manifest: string): number {
  const match = manifest.match(/#EXT-X-TARGETDURATION:(\d+)/);
  return match ? parseInt(match[1]!, 10) : 0;
}
