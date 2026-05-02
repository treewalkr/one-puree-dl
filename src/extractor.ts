import { parseIframeData, decodeStreamUrl, parseEpisodeTitle } from "./parser";
import type { StreamInfo } from "./types";

const BASE_URL = "https://opuree.com";

export async function extractStreamUrl(episodeId: number): Promise<StreamInfo> {
  const url = `${BASE_URL}/episode/${episodeId}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to fetch episode page: HTTP ${res.status}`);
  }

  const html = await res.text();
  const title = parseEpisodeTitle(html);

  if (title.includes("404") && title.includes("not found")) {
    throw new Error(`Episode ${episodeId} not found`);
  }

  const base64Data = parseIframeData(html);
  const hlsUrl = decodeStreamUrl(base64Data);

  return {
    episodeId,
    title,
    hlsUrl,
    referer: `${BASE_URL}/`,
  };
}

export function parseEpisodeIdFromUrl(url: string): number {
  const match = url.match(/\/episode\/(\d+)/);
  if (!match) {
    throw new Error(`Cannot extract episode ID from URL: ${url}`);
  }
  return parseInt(match[1]!, 10);
}

export async function extractStreamUrlFromPage(url: string): Promise<StreamInfo> {
  const episodeId = parseEpisodeIdFromUrl(url);
  return extractStreamUrl(episodeId);
}
