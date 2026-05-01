import { parseIframeData, decodeStreamUrl } from "./parser";
import type { StreamInfo } from "./types";

const BASE_URL = "https://opuree.com";

export async function extractStreamUrl(episodeId: number): Promise<StreamInfo> {
  const url = `${BASE_URL}/episode/${episodeId}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch episode page: HTTP ${res.status}`);
  }

  const html = await res.text();
  const base64Data = parseIframeData(html);
  const hlsUrl = decodeStreamUrl(base64Data);

  return {
    episodeId,
    title: `Episode ${episodeId}`,
    hlsUrl,
    referer: `${BASE_URL}/`,
  };
}
