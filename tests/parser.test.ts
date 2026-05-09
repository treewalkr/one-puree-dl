import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseIframeData, decodeStreamUrl, parseEpisodeTitle } from "../src/parser";

const FIXTURES = join(__dirname, "fixtures");

describe("parseIframeData", () => {
  it("extracts base64 data from episode page iframe", () => {
    const html = readFileSync(join(FIXTURES, "episode-1096.html"), "utf-8");
    const data = parseIframeData(html);
    expect(data).toBeTruthy();
    // Base64 strings don't contain &, =, or whitespace (except trailing =)
    expect(data).not.toContain("&");
    const decoded = atob(data);
    expect(decoded).toContain("akamaicdnvd.work");
    expect(decoded).toContain(".m3u8");
  });

  it("throws when no iframe exists", () => {
    expect(() => parseIframeData("<html><body></body></html>")).toThrow(
      "No video iframe found",
    );
  });

  it("throws when iframe has no data param", () => {
    const html = '<html><body><iframe src="/frame"></iframe></body></html>';
    expect(() => parseIframeData(html)).toThrow("No video iframe found");
  });
});

describe("decodeStreamUrl", () => {
  it("decodes a valid base64 CDN URL", () => {
    const html = readFileSync(join(FIXTURES, "episode-1096.html"), "utf-8");
    const data = parseIframeData(html);
    const url = decodeStreamUrl(data);
    expect(url).toMatch(/^https:\/\/m\.akamaicdnvd\.work\/1096\.m3u8\?hash=/);
  });

  it("throws when decoded data is not a URL", () => {
    const badBase64 = btoa("not-a-url");
    expect(() => decodeStreamUrl(badBase64)).toThrow("not a valid URL");
  });
});

describe("parseEpisodeTitle", () => {
  it("extracts title from episode page", () => {
    const html = readFileSync(join(FIXTURES, "episode-1096.html"), "utf-8");
    const title = parseEpisodeTitle(html);
    expect(title).toContain("1096");
    expect(title).toContain("One Piece");
  });

  it("detects 404 title", () => {
    const html = readFileSync(join(FIXTURES, "episode-404.html"), "utf-8");
    const title = parseEpisodeTitle(html);
    expect(title).toContain("404");
    expect(title).toContain("not be found");
  });
});
