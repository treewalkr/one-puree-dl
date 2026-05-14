import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURES = join(__dirname, "fixtures");

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

describe("extractStreamUrl", () => {
  it("fetches page via curl and extracts stream info", async () => {
    const { execSync } = await import("node:child_process");
    const html = readFileSync(join(FIXTURES, "episode-1096.html"), "utf-8");
    vi.mocked(execSync).mockReturnValue(html);

    const { extractStreamUrl } = await import("../src/extractor");
    const info = await extractStreamUrl(1096);

    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining("curl -s --fail"),
      expect.objectContaining({ encoding: "utf-8" }),
    );
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining("opuree.com/episode/1096"),
      expect.anything(),
    );
    expect(info.episodeId).toBe(1096);
    expect(info.hlsUrl).toMatch(/^https:\/\/m\.akamaicdnvd\.work\/1096\.m3u8\?hash=/);
    expect(info.referer).toBe("https://opuree.com/");
    expect(info.title).toContain("1096");
  });

  it("throws when curl fails", async () => {
    const { execSync } = await import("node:child_process");
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("curl: (6) Could not resolve host");
    });

    const { extractStreamUrl } = await import("../src/extractor");
    await expect(extractStreamUrl(99999)).rejects.toThrow("Failed to fetch episode page");
  });

  it("throws when page has no video iframe", async () => {
    const { execSync } = await import("node:child_process");
    const html = readFileSync(join(FIXTURES, "episode-404.html"), "utf-8");
    vi.mocked(execSync).mockReturnValue(html);

    const { extractStreamUrl } = await import("../src/extractor");
    await expect(extractStreamUrl(99999)).rejects.toThrow("No video iframe found");
  });
});
