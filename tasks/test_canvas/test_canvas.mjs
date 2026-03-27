import { createCanvas } from 'canvas'
import { renderNeonEffect } from '../../public/effects.mjs'

const width  = 1080
const height = 1920
const fps    = 30
const duration = 10
const totalFrames = duration * fps
const fontSize = 80
const textHeightPercent = 50

// Simulate the subtitles from the test SRT
const subtitles = [
  { startTime: 0.24,  endTime: 4.4,  text: 'Hi. So I recently got back into playing' },
  { startTime: 4.4,   endTime: 8.0,  text: 'Magic the Gathering. Haven\'t played since high school,' },
  { startTime: 8.0,   endTime: 10.0, text: 'and I met some new friends here.' },
]

function getSubtitleAtTime(timestamp) {
  return subtitles.find(s => timestamp >= s.startTime && timestamp < s.endTime) ?? null
}

const canvas = createCanvas(width, height)
const ctx = canvas.getContext('2d')

const start = Date.now()
let frameTimes = []
let bufferTimes = []

for (let frame = 0; frame < totalFrames; frame++) {
  ctx.clearRect(0, 0, width, height)
  const timestamp = frame / fps
  const subtitle = getSubtitleAtTime(timestamp)

  const frameStart = Date.now()

  if (subtitle) {
    renderNeonEffect(ctx, {
      text: subtitle.text,
      subtitle,
      timestamp,
      fontSize,
      textHeightPercent,
      tubeColor: '#00f7ff',
      haloColor: '#0051ff'
    })
  }

  frameTimes.push(Date.now() - frameStart)

  const bufferStart = Date.now()
  canvas.toBuffer('raw')
  bufferTimes.push(Date.now() - bufferStart)
}

const totalMs = Date.now() - start
const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length
const max = Math.max(...frameTimes)
const min = Math.min(...frameTimes)
const textFrames = frameTimes.filter((_, i) => getSubtitleAtTime(i / fps) !== null)
const avgText = textFrames.reduce((a, b) => a + b, 0) / textFrames.length

console.log(`Frames:        ${totalFrames}`)
console.log(`Total time:    ${(totalMs / 1000).toFixed(2)}s`)
console.log(`Avg fps:       ${(totalFrames / (totalMs / 1000)).toFixed(1)}`)
console.log(`Avg ms/frame:  ${avg.toFixed(1)}ms`)
console.log(`Avg ms/frame (text only): ${avgText.toFixed(1)}ms`)
console.log(`Min ms/frame:  ${min}ms`)
console.log(`Max ms/frame:  ${max}ms`)

const avgBuf = bufferTimes.reduce((a, b) => a + b, 0) / bufferTimes.length
const maxBuf = Math.max(...bufferTimes)
console.log(`\ntoBuffer('raw'):`)
console.log(`Avg ms/frame:  ${avgBuf.toFixed(1)}ms`)
console.log(`Max ms/frame:  ${maxBuf}ms`)
console.log(`Total time:    ${(bufferTimes.reduce((a,b) => a+b, 0) / 1000).toFixed(2)}s`)
