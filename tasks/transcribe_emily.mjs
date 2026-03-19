import { transcribeLocalFile } from '../services/deepgram.mjs'
import { srt } from '@deepgram/captions'
import { writeFileSync } from 'fs'

const r = await transcribeLocalFile('public/emily.mov')
const s = srt(r)
writeFileSync('work/emily.srt', s)
console.log(s)
