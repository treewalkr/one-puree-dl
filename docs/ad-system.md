# Ad System Technical Details

## Ad Delivery Architecture
```
Episode Page (/episode/1096)
  └── iframe (/frame?data={base64HlsUrl})
        └── FluidPlayer 3.49.0
              ├── Loads HLS stream (main video)
              └── Loads VAST pre-roll ads (4 ads)
                    ├── /ads/vast/vast1.xml
                    ├── /ads/vast/vast2.xml
                    ├── /ads/vast/vast3.xml
                    └── /ads/vast/vast4.xml
```

## VAST XML Format (vast1.xml example)
```xml
<VAST version="2.0">
  <Ad>
    <InLine>
      <Creatives>
        <Creative>
          <Linear skipoffset="00:00:02">
            <VideoClicks>
              <ClickThrough>https://ibit.ly/sexygame66</ClickThrough>
            </VideoClicks>
            <MediaFiles>
              <MediaFile type="video/mp4">
                <![CDATA[ /ads/vast/sexygame66.mp4 ]]>
              </MediaFile>
            </MediaFiles>
          </Linear>
        </Creative>
      </Creatives>
    </InLine>
  </Ad>
</VAST>
```

## Ad Characteristics
- **Format**: VAST 2.0 Linear pre-roll
- **Count**: 4 pre-roll ads per episode
- **Skip offset**: 2 seconds each
- **Video format**: MP4
- **Click-through**: Gambling site shortlinks (ibit.ly)
- **Total max ad time**: ~8 seconds if manually skipped, potentially minutes if not

## Auto-Skip Strategy
The library completely bypasses ads by:
1. **Not loading the FluidPlayer** — we extract the HLS URL directly from the HTML
2. **Not fetching VAST XMLs** — no VAST requests are made
3. **Direct stream access** — the m3u8 manifest contains only the main video segments

This is the cleanest approach — ads are a player-level concern, not embedded in the stream.
