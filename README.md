
https://github.com/user-attachments/assets/f7657527-82c9-4a2d-a323-df2257615367

# Auracaps

Auracaps is a video captioning web app that burns styled, animated captions into your videos. Upload a video, choose an effect, and get back a new video with captions rendered directly into the frames.

## Caption styles

- **Holographic** — texture-mapped foil effect that shifts across the text surface as the video plays
- **LED** — dot-matrix display, rasterizing each character into a grid of lit squares
- **Rainbow** — particle system that flows through the text outlines
- **Neon** — word-level timing from the transcript drives per-word glow pulses as each word is spoken

## How the rendering works

Each caption style is rendered frame-by-frame using the Node.js `canvas` package. The rendered frames are written as raw BGRA pixel data directly into an `ffmpeg` subprocess's stdin — no temp image files, fully streamed. The original video audio is passed through unchanged.

```
for each frame:
  draw caption overlay to canvas
  write canvas.toBuffer('raw') → ffmpeg stdin
ffmpeg encodes + muxes with original audio
```

HDR video is supported. When the input is detected as HDR (BT.2020 / HLG/PQ), a `zscale → tonemap → zscale` filter chain converts it to BT.709 before compositing.

Transcription is done via Deepgram, which returns word-level timestamps used by the neon style for word-sync animations.

## Stack

- **Backend:** Node.js, Express, fluent-ffmpeg (raw stdin pipe), canvas, ffprobe
- **Transcription:** Deepgram
- **Storage:** Cloudflare R2
- **Auth:** Google OAuth
- **Payments:** Stripe
- **Database:** PostgreSQL

## Running locally

```bash
npm install
cp .env.example .env  # add your keys
npm run dev
```

Requires `ffmpeg` installed on the system. The `ffmpeg-static` and `ffprobe-static` packages provide binaries if needed.

## Experiments

The `public/experiments/` folder contains standalone canvas and WebGL visual prototypes — neon, gold, glitch, fire, 3D text, and more — developed while working out the rendering techniques used in the caption styles.
