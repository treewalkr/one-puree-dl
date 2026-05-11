# HLS Stream Internals

## Manifest Structure
The m3u8 manifest is a **simple (non-master) playlist** with these characteristics:

```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:20
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:20.145122,
/1096.png?hash=X8U6oaH1EXRefyy...
#EXTINF:19.894878,
/1096.png?hash=X8U6oaH1EXRefyy...
...
```

- **EXT-X-VERSION**: 3 (supports floating-point EXTINF durations)
- **TARGETDURATION**: 20 seconds
- **MEDIA-SEQUENCE**: 0 (starts from beginning)
- **No EXT-X-KEY tag** — encryption/decryption is handled at the CDN/segment level, not standard HLS encryption
- **No EXT-X-ENDLIST** — verify if present (would indicate VOD vs live)
- **Segment durations**: ~19.8–20.1 seconds each

## Segment Format
- Segments use `.png` extension in URL but are **not PNG images**
- Content-Type: `binary/octet-stream`
- CDN returns AES-256 server-side encrypted data
- Each segment is ~4.6 MB
- ffmpeg **cannot** download directly — it rejects `.png` extension segments even with `-allowed_segment_extensions "png"`
- **Each segment has a 32-byte garbage prefix**: `"This bin is no longer available."` — must be stripped before processing
- **PTS discontinuities**: each segment has independent PTS that don't align monotonically across segments. Raw binary concatenation produces wrong duration (~2x). Must use ffmpeg `concat` demuxer to handle PTS discontinuities correctly.

## Episode Duration Calculation
- ~72 segments x ~20 seconds = ~1440 seconds = ~24 minutes
- Consistent with standard anime episode length

## Playback Considerations
- **Direct playback**: Feed the m3u8 URL to mpv or vlc with Referer header
- **Download**: Must be done via native segment downloading (Bun's `fetch`), then remux with ffmpeg
- **ffmpeg limitation**: ffmpeg fails with "detected format mpegts extension none mismatches allowed extensions" because segments use `.png` extension but contain mpegts data
- **Referer requirement**: Must include `Referer: https://opuree.com/` header for segment requests
