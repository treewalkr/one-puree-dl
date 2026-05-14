import { execSync } from "node:child_process";
import { parseIframeData, decodeStreamUrl, parseEpisodeTitle } from "./parser";
import type { StreamInfo } from "./types";

const BASE_URL = "https://opuree.com";

// Bun's TLS fingerprint causes the CDN to generate an invalid stream hash.
// Use curl to fetch the page HTML instead.
function fetchPageHtml(url: string): string {
  return execSync(`curl -s --fail "${url}"`, { encoding: "utf-8" });
}

export async function extractStreamUrl(episodeId: number): Promise<StreamInfo> {
  const url = `${BASE_URL}/episode/${episodeId}`;
  let html: string;
  try {
    html = fetchPageHtml(url);
  } catch {
    throw new Error(`Failed to fetch episode page: ${url}`);
  }
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
