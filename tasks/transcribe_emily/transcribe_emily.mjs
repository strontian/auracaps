import { transcribeLocalFile } from '../../services/deepgram.mjs'
import { srt } from '@deepgram/captions'
import { writeFileSync } from 'fs'

const r = await transcribeLocalFile('work/resources/emily.mov')
const s = srt(r)
writeFileSync('work/transcribe_emily/emily.srt', s)
console.log(s)
