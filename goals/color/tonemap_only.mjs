// tonemap_only.mjs
// Converts HDR → SDR with no caption overlay, for isolation testing.
// Usage: node goals/color/tonemap_only.mjs

import { spawn } from 'child_process'
import ffmpegPath from 'ffmpeg-static'

const INPUT  = 'tasks/resources/IMG_4785.mov'
const OUTPUT = 'goals/color/tonemap_only.mp4'

const filter = [
  'zscale=t=linear:npl=203:tin=arib-std-b67:pin=bt2020:min=bt2020nc',
  'format=gbrpf32le',
  'zscale=p=bt709',
  'tonemap=tonemap=hable:desat=0',
  'zscale=t=bt709:m=bt709:r=tv',
  'format=yuv420p'
].join(',')

const args = [
  '-y',
  '-i', INPUT,
  '-vf', filter,
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  '-crf', '18',
  '-preset', 'slow',
  '-c:a', 'copy',
  OUTPUT
]

console.log(`Input:  ${INPUT}`)
console.log(`Output: ${OUTPUT}\n`)

const ff = spawn(ffmpegPath, args)
ff.stderr.on('data', d => process.stderr.write(d))
ff.on('close', code => {
  if (code === 0) console.log(`\nDone → ${OUTPUT}`)
  else console.error(`\nFFmpeg exited with code ${code}`)
})
