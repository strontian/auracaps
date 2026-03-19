import { transcribeLocalFile } from '../services/deepgram.mjs'
import { srt } from '@deepgram/captions'
import { generateStyledCaptions } from '../services/local_caption.mjs'
import { execFile } from 'child_process'
import { writeFileSync, existsSync, readFileSync } from 'fs'
import ffprobePath from 'ffprobe-static'

// --- Config ---
const videoPath  = 'work/IMG_4785.mov'
const srtPath    = 'work/IMG_4785.srt'
const wordsPath  = 'work/IMG_4785_words.json'
const outputPath = 'work/IMG_4785_neon.mp4'
const fontSize = 65
const textHeightPercent = 5

function probeVideo(p) {
  return new Promise((resolve, reject) => {
    execFile(ffprobePath.path, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,duration,color_transfer:stream_tags=rotate',
      '-of', 'json',
      p
    ], (err, stdout) => {
      if (err) return reject(err)
      const s = JSON.parse(stdout).streams[0]
      const rotation = s.tags?.rotate ? parseInt(s.tags.rotate) : 0
      let { width, height } = s
      if (rotation === 90 || rotation === 270) [width, height] = [height, width]
      const isHDR = ['arib-std-b67', 'smpte2084'].includes(s.color_transfer)
      resolve({ width, height, duration: parseFloat(s.duration), rotation, isHDR })
    })
  })
}

console.log(`Video:  ${videoPath}`)
console.log(`Output: ${outputPath}\n`)

let words
if (existsSync(srtPath) && existsSync(wordsPath)) {
  console.log(`SRT already exists, skipping transcription.\n`)
  words = JSON.parse(readFileSync(wordsPath, 'utf8'))
} else {
  console.log('Transcribing with Deepgram...')
  const dgResponse = await transcribeLocalFile(videoPath)
  words = dgResponse.results.channels[0].alternatives[0].words
  writeFileSync(srtPath, srt(dgResponse))
  writeFileSync(wordsPath, JSON.stringify(words))
  console.log(`SRT written to ${srtPath}\n`)
}

const info = await probeVideo(videoPath)
console.log('Video info:', info, '\n')

await generateStyledCaptions({
  videoPath,
  srtPath,
  outputPath,
  captionStyle: 'neon',
  fontSize,
  textHeightPercent,
  words,
  ...info
})
