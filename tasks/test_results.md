# Caption Generation Test Results

## Setup
- Video: `work/short.mov` — 1080x1920, 10s, 30fps (300 frames)
- SRT: `work/101967346386369497929/50393d5bcab29c5cd663d72587c941d6.srt`
- Style: `neon`
- Font size: 80, text height: 50%

---

## Run 1
- Date: 2026-03-12
- Frame rendering: 2m 18s
- FFmpeg encoding: ~25s
- Total: 2m 43s
- Notes: fps started ~20, dropped to ~2-4 mid-video

## Run 2
- Date: 2026-03-12
- Frame rendering: 1m 33s
- FFmpeg encoding: ~18s
- Total: 1m 51s
- Notes: fps started ~19, dropped to ~3-4 mid-video; faster overall, likely warm cache

---

## Summary
| Run | Frame Render | FFmpeg | Total |
|-----|-------------|--------|-------|
| 1   | 2m 18s      | ~25s   | 2m 43s |
| 2   | 1m 33s      | ~18s   | 1m 51s |

Run 2 was ~30% faster — likely OS/Node cache warming. Both show the same fps drop pattern (fast start ~20fps, then settling to ~3-4fps once neon rendering kicks in fully).
