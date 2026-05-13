# Debugging & Investigation Guide

This document captures the investigative process and know-how gained during development. Useful for reimplementation or debugging similar sites.

## General Debugging Methodology

When dealing with video extraction from a website, follow this investigation order:

1. **Start with the page source** — `curl` the page, search for `<iframe>`, `<video>`, `<source>`, `<script>` tags
2. **Trace the video URL chain** — follow every redirect/embed until you reach the actual media URL
3. **Test incrementally** — validate each step works in isolation with `curl -v` before writing code
4. **Inspect raw bytes** — `xxd` and `file` are your best friends when file extensions don't match content

---

## Issue 1: ffmpeg Returns 400 Bad Request on m3u8

### Symptoms
```
ffmpeg -headers "Referer: https://opuree.com/" -i "{m3u8Url}" -c copy output.mp4
[https @ ...] No trailing CRLF found in HTTP header. Adding it.
[https @ ...] HTTP error 400 Bad Request
```

### Investigation
1. First tested the m3u8 URL directly with `curl` — returned 200. So the URL was valid.
2. The error message `"No trailing CRLF found in HTTP header"` was the clue — ffmpeg's `-headers` flag expects `\r\n` terminated lines.
3. Tried adding CRLF (`\r\n`) to the headers string — still 400.
4. Tried using `-user_agent` flag separately from `-headers` — got a different error (see Issue 2).

### Root Cause
This was a red herring. The 400 was actually caused by the HLS hash expiring between extraction and ffmpeg execution. The CDN hashes are **single-use or short-lived** — each request to the episode page generates a new hash. There's a race condition between extracting the URL and consuming it.

### Fix
Ensure extraction and download happen in the same process without delays. The hash must be used immediately after decoding from the episode page.

---

## Issue 2: ffmpeg Rejects .png Segment Extensions

### Symptoms
```
[in#0 @ ...] URL https://m.akamaicdnvd.work/1096.png?hash=... is not in allowed_segment_extensions,
consider updating hls.c and submitting a patch to ffmpeg-devel, if this should be added
[in#0 @ ...] Error opening input: Invalid data found when processing input
```

### Investigation
1. The m3u8 manifest lists segments with `.png` extension: `/1096.png?hash=...`
2. ffmpeg has an `-allowed_segment_extensions` flag — tried passing `"png"`
3. That bypassed the extension check but hit a second error:
   ```
   detected format mpegts extension none mismatches allowed extensions in url ...
   Error when loading first segment
   ```
4. This is ffmpeg's **format-level validation** — it detects mpegts content but the extension doesn't match any known mpegts extension. This check happens *after* the segment-level extension check and cannot be bypassed.

### Root Cause
CDN segments use `.png` extension as a disguise. The actual content is MPEGTS video data. ffmpeg has two layers of extension validation (segment-level and format-level) and neither can be fully bypassed for `.png`.

### Fix
Download segments natively via HTTP (Bun's `fetch` with `Referer` header), bypassing ffmpeg entirely for the download phase. ffmpeg is used only for the final remux step.

---

## Issue 3: 32-Byte Garbage Prefix on Every Segment

### Symptoms
Downloaded and concatenated `.mp4` file had wrong duration (~59 minutes instead of ~24 minutes).

### Investigation
1. First clue: `ffprobe` on a single downloaded segment showed `Invalid data found when processing input` when the segment was saved with `.ts` extension directly.
2. Ran `xxd` on a raw segment file:
   ```
   00000000: 5468 6973 2062 696e 2069 7320 6e6f 206c  This bin is no l
   00000010: 6f6e 6765 7220 6176 6169 6c61 626c 652e  onger available.
   00000020: 4740 1110 0042 f025 0001 c100 00ff 01ff  G@...B.%........
   ```
3. The first 32 bytes are the ASCII text `"This bin is no longer available."` — a CDN watermark/error message prepended to every segment.
4. At offset `0x20` (32), the MPEGTS sync byte `0x47` appears — this is where the actual video data starts.
5. Verified this prefix is exactly 32 bytes on all segments (checked 3 different segments).

### Root Cause
The CDN prepends a 32-byte text message to each MPEGTS segment. This is likely an anti-scraping measure or a stale-cache indicator. The browser's HLS.js player handles this automatically (it parses MPEGTS by sync byte, ignoring leading garbage), but when downloading raw bytes you must strip it.

### Fix
```ts
const SEGMENT_PREFIX_LENGTH = 32;
// ...
const buf = Buffer.from(await res.arrayBuffer());
const cleanBuf = buf.subarray(SEGMENT_PREFIX_LENGTH);
```

Strip the first 32 bytes from every segment's ArrayBuffer before writing to disk.

### How to discover this for other sites
```
xxd segment.raw | head -5        # Look for 0x47 (MPEGTS sync byte)
file segment.raw                 # May show "data" instead of expected format
```
If `file` shows `data` instead of `MPEG transport stream`, there's likely a prefix. Find the offset where `0x47` first appears — that's where the real data starts.

---

## Issue 4: PTS Discontinuities Cause Wrong Duration (2x)

### Symptoms
After stripping the garbage prefix and concatenating segments, the resulting mp4 showed ~59 minutes duration instead of ~24 minutes — approximately 2x the expected value.

### Investigation
1. Checked individual segment PTS with ffprobe:
   ```
   ffprobe -show_entries packet=pts_time -of csv=p=0 seg0.ts | head -3
   # → 1.525122, 1.566833, 1.608544
   ```
   Single segment: PTS starts at ~1.5s, ends at ~21.5s. Duration ~20s — correct.

2. Checked concatenated file PTS:
   ```
   ffprobe -show_entries packet=pts_time -of csv=p=0 concatenated.ts | sort -n | head -5
   # → 1.525122, 1.525122, 1.546456, ...
   ```
   **Duplicate PTS values** — the second segment also starts at ~1.5s instead of continuing from ~21.5s.

3. Each segment has **independent, non-monotonically-increasing PTS**. When you raw-concatenate the MPEGTS data, ffmpeg sees overlapping timestamp ranges and calculates duration as the max PTS minus the min PTS across the entire file — which includes the overlapping ranges, roughly doubling the apparent duration.

4. Tested ffmpeg's concat demuxer:
   ```
   # Write a concat list file
   echo "file 'seg0.ts'\nfile 'seg1.ts'\nfile 'seg2.ts'" > concat.txt
   ffmpeg -f concat -safe 0 -i concat.txt -c copy output.mp4
   ```
   Result: correct 60s duration for 3 segments.

### Root Cause
MPEGTS segments from this CDN each have their own independent PTS timeline — they don't continue monotonically from the previous segment. Raw binary concatenation (`cat seg0.ts seg1.ts > all.ts` or `Buffer.concat()`) preserves the overlapping PTS, causing ffmpeg to miscalculate duration.

### Fix
Use ffmpeg's **concat demuxer** (`-f concat`) instead of binary concatenation:
1. Write each segment to a separate file
2. Create a concat list text file (`file 'path/to/seg.ts'` per line)
3. Run `ffmpeg -f concat -safe 0 -i concat.txt -c copy -bsf:a aac_adtstoasc output.mp4`

The concat demuxer properly handles PTS discontinuities between segments.

### Why not other approaches
| Approach | Result |
|---|---|
| `Buffer.concat()` then remux | Wrong duration (~2x) |
| `-fflags +genpts` | No improvement |
| `-reset_timestamps 1` | No improvement |
| ffmpeg concat demuxer | Correct duration |

---

## Issue 5: 404 Detection False Positive

### Symptoms
Extraction failed with "Episode not found" for valid episode 1096.

### Investigation
The 404 check used `html.includes("404: This page could not be found")` — but the episode page HTML contains SVG path data with coordinate strings like `404-1.513 20.932-2.183`, triggering a false match.

### Root Cause
Next.js SSR pages contain inline SVGs whose path data includes numeric sequences that happen to contain "404". Searching the entire HTML body for "404" is unreliable.

### Fix
Check the `<title>` tag specifically instead of the full HTML:
```ts
const title = parseEpisodeTitle(html);  // cheerio: $('title').text()
if (title.includes("404") && title.includes("not found")) {
  throw new Error(`Episode ${episodeId} not found`);
}
```

### Note on actual 404 behavior
The server returns **HTTP 500** (not 404) for non-existent episodes. The `<title>` check is a secondary safeguard — the primary check should be `if (!res.ok)`.

---

## Issue 6: ffmpeg concat demuxer "No such file or directory" with Relative Paths

### Symptoms
```
ffmpeg remux failed (code 254): ... Error opening input: No such file or directory
Error opening input file downloads/.opuree-dl-xxx/concat.txt.
```

### Investigation
1. The error showed a relative path `downloads/.opuree-dl-xxx/concat.txt` — ffmpeg couldn't find the concat list file itself.
2. The temp directory was created using `join(outputPath, "..", ".opuree-dl-xxx")`. When `outputPath` is `./downloads/op1093.mp4`, this produces a relative path.
3. Even if the concat list path reaches ffmpeg correctly, there's a second problem: **ffmpeg resolves paths inside the concat list relative to the concat file's directory**. So a line like `file 'downloads/.opuree-dl-xxx/00000.ts'` inside `downloads/.opuree-dl-xxx/concat.txt` gets resolved to `downloads/.opuree-dl-xxx/downloads/.opuree-dl-xxx/00000.ts` — a doubled path.

### Root Cause
Two problems with relative paths:
1. `path.join()` preserves relative prefixes (`./`, `../`), producing relative paths that may not resolve correctly depending on the process working directory
2. ffmpeg's concat demuxer resolves file paths in the concat list **relative to the concat file's directory**, not the process working directory. Using `join(tmpDir, filename)` in the concat list creates paths relative to CWD, but ffmpeg interprets them relative to the concat file — doubling the directory structure.

### Fix
Use `path.resolve()` to make the temp directory path absolute:
```ts
import { resolve, join } from "node:path";
const tmpDir = resolve(join(outputPath, ".."), `.opuree-dl-${Date.now()}`);
// → /Users/ralim1/.../downloads/.opuree-dl-xxx (absolute)
```

This ensures both the concat file path passed to ffmpeg and the paths inside it resolve correctly.

### General rule
When generating ffmpeg concat lists, always use **absolute paths** for both the concat file itself and the entries inside it. ffmpeg resolves concat list entries relative to the concat file's location, which is counterintuitive when using relative paths.

---

## Quick Reference: Debugging Tools

| Tool | Use Case |
|---|---|
| `curl -v` | Inspect HTTP headers, response codes, redirects |
| `xxd file \| head -10` | Check raw bytes — find magic numbers, hidden prefixes |
| `file segment.raw` | Identify actual file format vs claimed extension |
| `ffprobe -show_entries packet=pts_time` | Inspect PTS timestamps for discontinuities |
| `ffprobe -show_entries format=duration` | Verify calculated duration |
| `curl -o /dev/null -w "%{http_code}"` | Quick HTTP status check without saving output |
| Base64 decode on CLI | `echo "base64string" \| base64 -d` to inspect iframe data params |

## CDN Anti-Scraping Techniques Encountered

This site uses several techniques to prevent automated downloading:

1. **Disguised segment extensions** (`.png` instead of `.ts`) — breaks ffmpeg's HLS parser
2. **Garbage data prefix** on segments — corrupts raw concatenation
3. **Independent PTS per segment** — breaks duration calculation when concatenated naively
4. **Single-use URL hashes** — prevents URL sharing and delays
5. **Referer header validation** — blocks direct CDN access without proper origin
6. **Obfuscated player JS** — the FluidPlayer setup uses variable obfuscation (`_0x59aa44`)
