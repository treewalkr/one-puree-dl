import { writeFile, unlink, mkdir, rmdir } from "node:fs/promises";
import { join, resolve } from "node:path";

interface Segment {
  url: string;
  duration: number;
}

// Each CDN segment has a 32-byte garbage prefix: "This bin is no longer available."
const SEGMENT_PREFIX_LENGTH = 32;

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

export async function downloadSegments(
  m3u8Url: string,
  referer: string,
  outputPath: string,
  concurrency = 5,
): Promise<void> {
  const headers: Record<string, string> = {
    Referer: referer,
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  };

  const manifestRes = await fetch(m3u8Url, { headers });
  if (!manifestRes.ok) {
    throw new Error(`Failed to fetch m3u8: HTTP ${manifestRes.status}`);
  }
  const manifest = await manifestRes.text();
  const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf("/") + 1);
  const segments = parseM3u8(manifest, baseUrl);

  if (segments.length === 0) {
    throw new Error("No segments found in m3u8 manifest");
  }

  console.log(`Downloading ${segments.length} segments...`);

  const tmpDir = resolve(join(outputPath, ".."), `.opuree-dl-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });

  try {
    // Download segments with concurrency limit, write to individual files
    let completed = 0;
    const queue = [...segments.keys()];

    async function worker() {
      while (queue.length > 0) {
        const idx = queue.shift();
        if (idx === undefined) break;
        const seg = segments[idx]!;

        const res = await fetch(seg.url, { headers });
        if (!res.ok) {
          throw new Error(`Segment ${idx} failed: HTTP ${res.status}`);
        }

        const buf = Buffer.from(await res.arrayBuffer());
        // Strip the 32-byte garbage prefix before the MPEGTS sync byte (0x47)
        const segPath = join(tmpDir, `${String(idx).padStart(5, "0")}.ts`);
        await writeFile(segPath, buf.subarray(SEGMENT_PREFIX_LENGTH));

        completed++;
        if (completed % 10 === 0 || completed === segments.length) {
          process.stdout.write(`\r  Progress: ${completed}/${segments.length} segments`);
        }
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, segments.length) }, () => worker());
    await Promise.all(workers);
    console.log("");

    // Create ffmpeg concat list
    const concatList = segments
      .map((_, i) => `file '${join(tmpDir, `${String(i).padStart(5, "0")}.ts`)}'`)
      .join("\n");
    const concatPath = join(tmpDir, "concat.txt");
    await writeFile(concatPath, concatList);

    // Remux to mp4 using ffmpeg concat demuxer (handles PTS discontinuities between segments)
    console.log("Remuxing to mp4...");
    const proc = Bun.spawn([
      "ffmpeg",
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatPath,
      "-c", "copy",
      "-bsf:a", "aac_adtstoasc",
      outputPath,
    ], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await proc.stderr.text();
      throw new Error(`ffmpeg remux failed (code ${exitCode}): ${stderr.slice(-200)}`);
    }

    console.log(`Downloaded: ${outputPath}`);
  } finally {
    // Cleanup temp dir
    for (let i = 0; i < segments.length; i++) {
      await unlink(join(tmpDir, `${String(i).padStart(5, "0")}.ts`)).catch(() => {});
    }
    await unlink(join(tmpDir, "concat.txt")).catch(() => {});
    await rmdir(tmpDir).catch(() => {});
  }
}
