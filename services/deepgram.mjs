import { createClient } from "@deepgram/sdk"
import { readFileSync } from "fs"

let dgk = '405cbac2fcab74f2ad7e2647d987e2a0f17890a7'

export async function transcribe(url) {
  const response = await fetch('https://api.deepgram.com/v1/listen?punctuate=true&model=nova-2', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${dgk}`,
      'accept': 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      url: url,
    })
  })
  return await response.json()
}

export async function transcribeLocalFile(filePath) {
  const deepgram = createClient(dgk)
  
  const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
    readFileSync(filePath),
    {
      model: "nova-2",
      punctuate: true,
      smart_format: true,
    }
  )
  
  if (error) throw error
  return result
}
