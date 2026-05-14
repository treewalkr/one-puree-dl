# one-puree-dl

A TypeScript library for extracting direct HLS video stream URLs from [opuree.com](https://opuree.com) episode pages. Automatically bypasses all pre-roll VAST ads by extracting the raw stream URL without loading the ad-enabled player.

## How It Works

The site embeds video via FluidPlayer in an iframe. The iframe's `data` query parameter contains a base64-encoded CDN URL pointing to an HLS `.m3u8` manifest. This library:

1. Fetches the episode page HTML (SSR, no JS execution needed)
2. Parses out the iframe's base64-encoded data parameter
3. Decodes it to reveal the direct HLS manifest URL on `m.akamaicdnvd.work`
4. Returns the URL ready for playback or download

**Ads are never loaded** — VAST pre-roll ads are a FluidPlayer concern, not part of the HLS stream itself.

## Install & Run

```bash
bun install
bun run cli 1096              # Print stream URL
bun run cli 1096 --json       # JSON output
bun run cli 1096 --download   # Download to episode-1096.mp4
bun run cli 1096 -d -o ~/Videos/op.mp4  # Download with custom path
bun run cli 1096-1100 --download        # Batch download range
```

## Library Usage

```ts
import { extractStreamUrl } from "./src/index";

const stream = await extractStreamUrl(1096);
console.log(stream.hlsUrl);
// → https://m.akamaicdnvd.work/1096.m3u8?hash=...
```

## Downloading

ffmpeg **cannot** consume these m3u8 URLs directly — HLS segments use `.png` extensions (disguised mpegts data) which ffmpeg rejects at format detection. The download pipeline:

1. Fetches m3u8 manifest and parses segment URLs
2. Downloads segments in parallel (5 concurrent) via Bun's `fetch` with `Referer` headers
3. Strips 32-byte garbage prefix from each segment
4. Writes segments to individual temp files with **absolute paths**
5. Uses ffmpeg's concat demuxer (`-f concat`) to remux into mp4 (handles PTS discontinuities between segments)
6. Cleans up temp files

## Tech Stack

| Tool | Purpose |
|---|---|
| **Bun** | Runtime, package manager |
| **TypeScript** | Language |
| **cheerio** | HTML parsing |
| **commander** | CLI argument parsing |
| **ffmpeg** (system) | Final remux to mp4 only |

## Project Structure

```
src/
├── cli.ts            # CLI entry point (commander)
├── downloader.ts     # Native segment downloader + ffmpeg remux
├── extractor.ts      # Main API: extractStreamUrl()
├── index.ts          # Library barrel export
├── parser.ts         # HTML parsing + base64 decode (pure functions)
└── types.ts          # StreamInfo interface
```

## Documentation

See `/docs/` for reverse-engineering findings:
- [architecture.md](docs/architecture.md) — Full site architecture and extraction flow
- [hls-internals.md](docs/hls-internals.md) — HLS manifest and segment format details
- [ad-system.md](docs/ad-system.md) — VAST ad system analysis and skip strategy
- [technical-notes.md](docs/technical-notes.md) — HTTP patterns, download pipeline, error handling
- [debugging-guide.md](docs/debugging-guide.md) — Investigation process for all issues encountered, debugging methodology
