import { generateStyledCaptions } from '../services/local_caption.mjs'
import { execFile } from 'child_process'
import ffprobePath from 'ffprobe-static'

// --- Config ---
const videoPath   = 'work/short.mov'
const srtPath     = 'work/101967346386369497929/50393d5bcab29c5cd663d72587c941d6.srt'
const outputPath  = 'work/test_output.mp4'
const captionStyle = 'rainbow'  // holographic | led | rainbow | neon
const fontSize = 80
const textHeightPercent = 50

function probeVideo(p) {
  return new Promise((resolve, reject) => {
    execFile(ffprobePath.path, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,duration:stream_tags=rotate',
      '-of', 'json',
      p
    ], (err, stdout) => {
      if (err) return reject(err)
      const s = JSON.parse(stdout).streams[0]
      const rotation = s.tags?.rotate ? parseInt(s.tags.rotate) : 0
      let { width, height } = s
      if (rotation === 90 || rotation === 270) [width, height] = [height, width]
      resolve({ width, height, duration: parseFloat(s.duration), rotation })
    })
  })
}

console.log(`Video:  ${videoPath}`)
console.log(`SRT:    ${srtPath}`)
console.log(`Style:  ${captionStyle}`)
console.log(`Output: ${outputPath}\n`)

const info = await probeVideo(videoPath)
console.log('Video info:', info, '\n')

await generateStyledCaptions({
  videoPath,
  srtPath,
  holoImagePath: 'public/images/holo.jpg',
  outputPath,
  captionStyle,
  fontSize,
  textHeightPercent,
  ...info
})
