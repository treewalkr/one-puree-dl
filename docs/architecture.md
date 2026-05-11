# Opuree.com Video Architecture (Reverse-Engineered)

## Site Stack
- **Framework**: Next.js (App Router) with server-side rendering
- **CDN**: Cloudflare (fronting all endpoints)
- **Video CDN**: `m.akamaicdnvd.work` (Akamai-based, serves HLS segments)
- **Video Player**: FluidPlayer 3.49.0 (embedded in `/frame` route)
- **Ad System**: VAST 2.0 XML pre-roll ads

## URL Patterns

| Resource | URL Pattern |
|---|---|
| Episode page | `https://opuree.com/episode/{episodeNumber}` |
| Player frame | `https://opuree.com/frame?data={base64EncodedUrl}&hls=true` |
| HLS manifest | `https://m.akamaicdnvd.work/{episodeId}.m3u8?hash={hash}` |
| HLS segment | `https://m.akamaicdnvd.work/{episodeId}.png?hash={segmentHash}` |
| VAST ad XML | `https://opuree.com/ads/vast/vast{1-4}.xml` |

## Video Extraction Flow

### Step 1: Fetch Episode Page
```
GET https://opuree.com/episode/{episodeNumber}
```
- Returns Next.js SSR HTML
- Contains an `<iframe>` element with `src="/frame?data={base64}&hls=true"`

### Step 2: Extract iframe `data` Parameter
The `data` query parameter is a **base64-encoded URL** pointing to the HLS manifest on the CDN.

Example decoded value:
```
https://m.akamaicdnvd.work/1096.m3u8?hash=X8U6oaH1EXRefyyIJ...&hls=true
```

### Step 3: Fetch HLS Manifest Directly
```
GET https://m.akamaicdnvd.work/{episodeId}.m3u8?hash={hash}
```
- Returns a standard HLS `.m3u8` playlist
- Single quality level (not a master playlist with variants)
- ~72 segments for a ~24 min episode, each ~20 seconds
- Segment filenames use `.png` extension but content is `binary/octet-stream` (encrypted video data)
- Total manifest size: ~72 segments x ~4.6MB each = ~330MB per episode

### CDN Segment Details
- Segments are stored on Akamai CDN with AES-256 server-side encryption
- Segments require a valid `hash` parameter (per-segment, unique)
- **Referer header is required**: segments return 403 without valid Referer, 200 with `Referer: https://opuree.com/`
- Content-Type: `binary/octet-stream`
- Segment file naming: `{episodeId}.png?hash={uniqueSegmentHash}`

## Ad System Analysis

### VAST Pre-Roll Ads
The FluidPlayer is configured with **4 pre-roll VAST ads** from:
- `/ads/vast/vast1.xml` through `/ads/vast/vast4.xml`

Each VAST XML contains:
- A linear video ad (mp4 format)
- `skipoffset="00:00:02"` (skippable after 2 seconds)
- Click-through links to gambling sites via `ibit.ly` shortlinks
- Ad video files served from `/ads/vast/{name}.mp4`

### Ad Skip Strategy
Since we extract the HLS URL directly and **bypass the FluidPlayer entirely**, all VAST pre-roll ads are automatically skipped. The ads are only loaded by FluidPlayer's VAST module in the `/frame` page — they are not embedded in the HLS stream itself.

## Episode ID Patterns
- CDN uses zero-padded IDs: episode 1 → `001.m3u8`, episode 1096 → `1096.m3u8`
- Episode numbers map 1:1 to the URL path: `/episode/1096` → `1096.m3u8`
- Episode range: at least 1 to 1155+ (as of analysis date)

## Key Technical Findings

1. **No API authentication needed** — episode pages are publicly accessible SSR HTML
2. **HLS manifest hashes are per-episode**, embedded in the iframe's base64 data parameter
3. **Segment hashes are per-segment**, unique to each chunk in the m3u8
4. **Referer check** on CDN segments — must pass `Referer` header from opuree.com domain
5. **The base64 data parameter is the only thing needed** — once decoded, it gives the direct HLS URL
6. **No JavaScript execution needed** — all data is in the initial HTML response (SSR, not client-rendered)
7. **Segments use `.png` extension** but are binary encrypted video data — HLS.js handles decryption client-side
8. **Single quality** — no adaptive bitrate switching, only one quality level available
