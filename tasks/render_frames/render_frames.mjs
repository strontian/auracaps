import { createCanvas, registerFont } from 'canvas'
import { renderNeonEffect } from '../../public/effects.mjs'
import { readFileSync, mkdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import path from 'path'

// --- Config ---
const srtPath   = 'work/test_validity/IMG_4785.srt'
const wordsPath = 'work/test_validity/IMG_4785_words.json'
const outDir    = 'work/render_frames/frames'
const width     = 720
const height    = 1280
const fps       = 30
const fontSize  = 65
const textHeightPercent = 5

registerFont('public/fonts/Beon-Regular.ttf', { family: 'Beon' })

// Parse SRT
function parseSRT(filepath) {
  const blocks = readFileSync(filepath, 'utf8').trim().split(/\n\s*\n/)
  return blocks.map(block => {
    const lines = block.split('\n')
    if (lines.length < 3) return null
    const m = lines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/)
    if (!m) return null
    return {
      startTime: +m[1]*3600 + +m[2]*60 + +m[3] + +m[4]/1000,
      endTime:   +m[5]*3600 + +m[6]*60 + +m[7] + +m[8]/1000,
      text: lines.slice(2).join(' ')
    }
  }).filter(Boolean)
}

const subtitles = parseSRT(srtPath)
const words     = JSON.parse(readFileSync(wordsPath, 'utf8'))

mkdirSync(outDir, { recursive: true })

const canvas = createCanvas(width, height)
const ctx    = canvas.getContext('2d')

// Render one frame per subtitle block — pick the midpoint of each block
const jobs = []
for (const sub of subtitles) {
  const timestamp = (sub.startTime + sub.endTime) / 2
  const label     = sub.text.slice(0, 30).replace(/[^a-z0-9 ]/gi, '').trim().replace(/\s+/g, '_')
  const filename  = `${sub.startTime.toFixed(2)}_${label}.png`

  ctx.clearRect(0, 0, width, height)
  renderNeonEffect(ctx, {
    text: sub.text,
    allWords: words,
    subtitle: sub,
    timestamp,
    fontSize,
    textHeightPercent,
    tubeColor: '#00f7ff',
    haloColor: '#0051ff'
  })

  jobs.push(writeFile(path.join(outDir, filename), canvas.toBuffer('image/png')))
  console.log(`Queued: ${filename}`)
}

await Promise.all(jobs)
console.log(`\nDone — ${jobs.length} frames written to ${outDir}/`)
