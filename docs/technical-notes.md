# Technical Notes for Implementation

## Dependencies

### Runtime
| Package | Purpose |
|---|---|
| `cheerio` | HTML parsing to extract iframe data attribute |
| `commander` | CLI argument parsing |

### System
| Tool | Purpose |
|---|---|
| `bun` | Runtime and package manager |
| `ffmpeg` | Final remux to mp4 only (segments are downloaded natively via Bun's `fetch`) |

## HTTP Request Patterns

### Episode Page Fetch
```
GET /episode/{id}
Host: opuree.com
User-Agent: {standard browser UA}
```
No special headers needed — returns full SSR HTML.

### Frame Page Fetch (optional, for validation)
```
GET /frame?data={base64}&hls=true
Host: opuree.com
```
Returns the FluidPlayer HTML. Useful for debugging but not needed for extraction.

### HLS Manifest Fetch
```
GET /{id}.m3u8?hash={hash}&hls=true
Host: m.akamaicdnvd.work
Referer: https://opuree.com/
```

### HLS Segment Fetch
```
GET /{id}.png?hash={segmentHash}
Host: m.akamaicdnvd.work
Referer: https://opuree.com/
```
Returns `binary/octet-stream`, ~4.6MB per segment.

## Extraction Algorithm

```
1. Fetch https://opuree.com/episode/{episodeId}
2. Parse HTML with cheerio
3. Find iframe with src matching /frame?data=...
4. Extract the `data` query parameter value
5. Base64 decode → get CDN HLS manifest URL
6. (Optional) Fetch m3u8 manifest for metadata
7. Return the direct HLS URL for playback/download
```

## Error Handling Considerations

1. **Episode not found**: Server returns HTTP 500 for unknown episodes. Also detect via `<title>` containing "404" and "not found"
2. **Hash expiry**: CDN hashes are **single-use or short-lived**. Each episode page request generates a new hash. The m3u8 must be fetched immediately after extraction — any delay risks a 400. Extraction and download must run in the same process without pauses between them.
3. **Rate limiting**: Cloudflare may rate-limit aggressive requests — add delays between episode fetches
4. **Referer validation**: CDN checks Referer header — always include it

## Download Pipeline

ffmpeg **cannot** directly consume these m3u8 URLs because:
1. Segments use `.png` extension but contain mpegts data
2. ffmpeg's `-allowed_segment_extensions` flag does not bypass the format detection mismatch

### Why native downloading is needed
The library downloads segments directly via HTTP with proper `Referer` headers, strips the 32-byte garbage prefix from each segment, writes them to individual temp files, then uses ffmpeg's **concat demuxer** to remux into `.mp4`. The concat demuxer is required (not raw binary concatenation) because each segment has independent PTS timestamps that overlap when naively concatenated, causing wrong duration (~2x).

### ffmpeg concat remux (used after segment download)
```bash
# Concat list format (one line per segment, absolute paths required)
cat > concat.txt << EOF
file '/absolute/path/00000.ts'
file '/absolute/path/00001.ts'
...
EOF

ffmpeg -y -f concat -safe 0 -i concat.txt -c copy -bsf:a aac_adtstoasc output.mp4
```

Key: paths in the concat list **must be absolute** — ffmpeg resolves them relative to the concat file's directory, not the process working directory.
