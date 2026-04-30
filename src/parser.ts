import * as cheerio from "cheerio";

export function parseIframeData(html: string): string {
  const $ = cheerio.load(html);
  const iframe = $('iframe[src^="/frame?data="]');
  const src = iframe.attr("src");
  if (!src) {
    throw new Error("No video iframe found in episode page");
  }

  const url = new URL(src, "https://opuree.com");
  const data = url.searchParams.get("data");
  if (!data) {
    throw new Error("No data parameter found in iframe src");
  }

  return data;
}

export function decodeStreamUrl(base64Data: string): string {
  const decoded = atob(base64Data);
  if (!decoded.startsWith("https://")) {
    throw new Error(`Decoded data is not a valid URL: ${decoded.slice(0, 50)}...`);
  }
  return decoded;
}
