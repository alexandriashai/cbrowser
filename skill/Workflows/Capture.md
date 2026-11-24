# Capture Workflow

**Purpose:** Record a page over time to a GIF/WebP/WebM plus an AI-readable frame manifest, scoped to a viewport, a fixed region, or a tracked element.

Re-run the probes below against your own build rather than trusting the prose.

---

## Step 0: Pick the target before the format

"GIF or MP4?" is the least important question. Decide the **target** first: it determines whether the artifact answers your question at all.

| You want to know | Target |
|------------------|--------|
| How the whole page behaves at a given size | viewport |
| What happens in one area (a header, a cart panel, a chart) | region |
| What happens to one thing while it moves | element |

---

## Step 1: Viewport capture

Whole viewport, auto-stopping after a duration:

```bash
cbrowser capture start "https://example.com" --duration 3s --fps 10 --format gif --out ./cap
```

Typical output:

```
Capture stopped
  Stop trigger: duration
  Frames: 32 (10.5 fps actual vs 10 requested)
  Duration: 3062ms
  Frame gaps: 1 (largest 2013ms - the page was not repainting)
  Manifest: ./cap/manifest.json
  GIF: ./cap/capture-<ts>.gif
```

At a specific size or device:

```bash
cbrowser capture start "$URL" --duration 3s --viewport 390x844 --out ./cap-mobile
cbrowser capture start "$URL" --duration 3s --device iphone-15 --out ./cap-iphone
```

`--device` resolves through cbrowser's device-preset table. Names are slugs, not marketing names: `iphone-15`, `iphone-15-pro-max`, `pixel-8`, `pixel-8-pro`, `samsung-galaxy-s24`, `ipad-pro-12`, `ipad-air`, `desktop-1080p`, `desktop-1440p`, `mobile`, `tablet`, `desktop`, and many more. An unknown name exits 1 and points you to `cbrowser device list`, which prints them all.

---

## Step 2: Region capture

A fixed rect in CSS pixels, `x,y,width,height`:

```bash
cbrowser capture start "$URL" --duration 2s --region 100,200,640,480 --format gif --out ./cap-region
```

Confirm you got the rect you asked for. The manifest is the authoritative answer, not the console line:

```bash
python3 -c "import json;m=json.load(open('./cap-region/manifest.json'));print(m['target'], m['output_dims'], m.get('region_clamped'))"
# {'kind': 'region', 'rect': {...}} {'width': 640, 'height': 480} False
```

Edge behaviour:
- A rect overflowing the viewport is **clamped**, not rejected, and the manifest sets **region_clamped** to true.
- Zero or negative dimensions **exit 1** with a message naming the value: `Invalid --region "10,10,0,50" - width and height must be positive (got 0x50)`.

---

## Step 3: Element capture (tracking crop)

The crop window follows the element frame by frame:

```bash
cbrowser capture start "$URL" --duration 2s --element "#cart-badge" --element-padding 10 --out ./cap-elem
```

Prove tracking actually happened. Identical crops across frames mean it did not:

```bash
python3 -c "
import json; m=json.load(open('./cap-elem/manifest.json'))
xs={f['crop']['x'] for f in m['frames']}; ys={f['crop']['y'] for f in m['frames']}
print('distinct x:',len(xs),'distinct y:',len(ys),'->','MOVES' if len(xs)>1 or len(ys)>1 else 'STATIC')
print('output_dims:',m['output_dims'])"
```

Output dimensions stay **locked** for the whole capture while the source crop moves and resizes, because animated GIF and WebP require a constant frame size. Frames where the element detached or left the viewport are marked with tracking "stale" rather than dropped.

Selectors resolve through cbrowser's standard multi-strategy resolver, so text, ARIA role, label, placeholder and raw CSS all work (see `AIVision.md`). A selector matching nothing exits 1.

---

## Step 4: Read the manifest

```bash
python3 -c "
import json; m=json.load(open('./cap/manifest.json'))
print('method',m['capture_method'],'| engine',m['engine'],'| fps',round(m['actual_fps'],1))
print('change_points',m['change_points'])
print('key_frames',m.get('key_frames'),'| saturated',m.get('change_points_saturated'))
print('frame_gaps',m['frame_gaps'])
for i in m['change_points'][:5]:
    f=m['frames'][i]; print(i,'t=',f['t_ms'],'ssim',round(f['ssim_prev'],3),f['path'])"
```

**change_points** are the frame indices where the page changed, scored by SSIM against the previous frame. **Look at those frames, not all of them**: that is the efficiency gain over scrubbing a video. On a page that never stops changing (a clock, a ticker) change_points covers almost every frame and **change_points_saturated** is true; read **key_frames** instead, the sparse list of notable changes. Console messages and network requests are attached to the frame whose time window contains them, so "what fired when the badge changed" becomes a lookup rather than a guess.

---

## Step 5: Formats

```bash
cbrowser capture start "$URL" --duration 2s --format gif,webp,webm --out ./cap-all
```

| Format | Status |
|--------|--------|
| `gif` | Works. Per-frame delay derived from the real time between frames, not a fixed cadence |
| `webp` | Works. Animated, same frame count as the GIF |
| `webm` | Works via Playwright's bundled ffmpeg |
| `mp4` | Needs a full ffmpeg: the bundled build has no mp4 muxer or H.264 encoder. Set `CBROWSER_FFMPEG_PATH`, or use `webm` |

The mp4 failure message names the missing muxer, the acceptable encoders, and both remedies. Encoding failure never loses the frames or the manifest.

---

## Step 6: Record an existing run instead of a URL

Usually you want a *flow*, not a URL:

```bash
# record a natural-language test suite
cbrowser test-suite tests.txt --capture --capture-out ./run-cap
cbrowser test-suite --inline "go to $URL ; click Sign in" --capture

# record a cognitive journey (needs an Anthropic API key; costs tokens per step)
cbrowser cognitive-journey --persona first-timer --start "$URL" --goal "sign up" \
  --capture --capture-fps 10 --capture-format gif
```

Capture begins with the run and ends before the browser closes, with no `capture start`/`capture stop` needed. The manifest and artifact paths are printed when the run finishes.

Over MCP: `capture_start`, `capture_status`, `capture_stop`.

## Step 7: Drive a live capture across commands

A capture normally lives and dies inside one CLI process. Start the daemon and it survives:

```bash
cbrowser daemon start                    # keeps the browser alive between commands
cbrowser capture start "$URL" --fps 10   # open-ended
cbrowser click "Sign in"                 # drives the same page, lands in the recording
cbrowser capture status                  # -> capture in progress (in the daemon)
cbrowser capture stop                    # writes manifest + artifacts
cbrowser daemon stop
```

Without the daemon, `capture status` from another shell reports only the most recent *finished* capture, and `capture stop` cannot attach to a capture it did not start.

## Gotchas

- **A static page produces almost no frames, and that is correct.** Chromium's screencast is event-driven: it emits on compositor commit, not on a clock. Idle spans appear as frame gaps in the manifest, and the manifest clock stays wall-time, so frame timestamps match real elapsed time and playback stays true-speed.
- **`capture` is not `record`.** `cbrowser record start`, `stop` and `save` are refused, because each CLI command is its own process and nothing was ever recorded; `record list` and `record generate` remain for older recordings. To record a flow, write it as a test and run it with `test-suite --inline "..." --capture`.
- **Trust the manifest over the console line.** "Capture stopped" prints on success paths that may not be the capture you intended. Check **target** and **output_dims** before believing a targeted capture worked.
- **Long quiet tails are handled, but they are why frame delays are capped.** Sharp rejects any per-frame delay above 65535ms. A capture left running while the page goes quiet would otherwise produce one enormous final delay and lose the whole GIF; the encoder splits long holds across repeated frames instead, preserving real-time playback.
- **Frames stream to disk during capture.** Long captures do not accumulate in memory; encoders read back from disk.
