import { describe, it, expect } from "vitest";
import { parseM3u8 } from "../src/downloader";

describe("parseM3u8", () => {
  const BASE_URL = "https://m.akamaicdnvd.work";

  it("parses a standard m3u8 manifest", () => {
    const manifest = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-TARGETDURATION:20",
      "#EXT-X-MEDIA-SEQUENCE:0",
      "#EXTINF:20.145122,",
      "/1096.png?hash=abc123",
      "#EXTINF:19.894878,",
      "/1096.png?hash=def456",
      "#EXTINF:19.978289,",
      "/1096.png?hash=ghi789",
    ].join("\n");

    const segments = parseM3u8(manifest, BASE_URL);

    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({
      url: "https://m.akamaicdnvd.work/1096.png?hash=abc123",
      duration: 20.145122,
    });
    expect(segments[1]).toEqual({
      url: "https://m.akamaicdnvd.work/1096.png?hash=def456",
      duration: 19.894878,
    });
    expect(segments[2]).toEqual({
      url: "https://m.akamaicdnvd.work/1096.png?hash=ghi789",
      duration: 19.978289,
    });
  });

  it("handles absolute URLs in manifest", () => {
    const manifest = [
      "#EXTM3U",
      "#EXTINF:10.0,",
      "https://other-cdn.com/seg.ts",
    ].join("\n");

    const segments = parseM3u8(manifest, BASE_URL);

    expect(segments).toHaveLength(1);
    expect(segments[0]!.url).toBe("https://other-cdn.com/seg.ts");
  });

  it("returns empty array for manifest with no segments", () => {
    const manifest = "#EXTM3U\n#EXT-X-VERSION:3\n";
    const segments = parseM3u8(manifest, BASE_URL);
    expect(segments).toHaveLength(0);
  });

  it("ignores blank lines and comments", () => {
    const manifest = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "",
      "  ",
      "#EXT-X-TARGETDURATION:20",
      "#EXTINF:20.0,",
      "/seg.png?hash=x",
    ].join("\n");

    const segments = parseM3u8(manifest, BASE_URL);
    expect(segments).toHaveLength(1);
  });
});
