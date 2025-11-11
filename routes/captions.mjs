import express from 'express'
import { writeCaptions } from '../services/pg.mjs'
import { transcribe } from '../services/deepgram.mjs'
import { getUploadUrl } from '../services/r2_new.mjs'
import { srt } from "@deepgram/captions";
import { promises as fs } from 'fs'
import { uploadFile, downloadFile, getViewUrl, checkFileExists } from '..//services/r2_new.mjs'
import { execFile } from 'child_process'


import ffmpegPath from 'ffmpeg-static'
import crypto from 'crypto'

const deleteFile = (filePath) => {
  fs.unlink(filePath, (err) => {
    if (err) {
      console.log(err) 
    }else {
      console.log(`Temporary file deleted: ${filePath}`)
    }
  })
}

export function fromDisplayName(accountId, fileName) {

  const lastDotIndex = fileName.lastIndexOf('.')
  const name = fileName.slice(0, lastDotIndex)
  const extension = fileName.slice(lastDotIndex)

  return {
    clean: accountId + "-" + name + "_clean" + extension,
    captions: accountId + "-" + name + "_captions.mp4",
    original: accountId + "-" + name + extension,
    captionsDownload: name + "_captions." + extension,
    display: fileName,
    accountId: accountId,
    extension: extension,
    noext: name
  }

}

//const softSubsArgs = '-i ${input} -i ${captions} -c copy -c:s mov_text ${output}'

const generateRandomName = () => crypto.randomBytes(3).toString('hex');


//bug, file mimetype is missing from python thing
export async function captionVideo(accountId, displayName, assString) {
  //download file from R2...
  let workdir = "work"
  let acctDir = `${workdir}/${accountId}/`
  await fs.mkdir("work", { recursive: true })
  await fs.mkdir(`work/${accountId}`, { recursive: true })

  const fileNames = fromDisplayName(accountId, displayName)
  //const fileType = await getMimeType('tv-videos', fileNames.original)
  const captionsFile = acctDir + generateRandomName() + ".ass"
  const localInputFile = acctDir +  generateRandomName() + fileNames.extension
  await fs.writeFile(captionsFile, assString)
  await downloadFile('tv-captions', fileNames.original, localInputFile)
  const localFinishedPath = acctDir + generateRandomName() + fileNames.extension
  const hardSubsArgs = `-i ${localInputFile} -vf subtitles='${captionsFile}' ${localFinishedPath}`

  execFile(ffmpegPath, hardSubsArgs.split(" "), (error, stdout, stderr) => {
    if (error) {
      throw error
    }
    console.log("FFMPEG DONE")
    console.log("STDOUT----------")
    console.log(stdout)
    console.log("STDERR----------")
    console.log(stderr)
    deleteFile(captionsFile)
    deleteFile(localInputFile)
    uploadFile('tv-captions', fileNames.captions, localFinishedPath).then(_ => {
      //delete local file
      deleteFile(localFinishedPath)
    })
  })

}

const router = express.Router()

router.post('/captions/create', async (req, res) => {
  console.log(req.body)
  //let displayName = req.body.fileName // display name is name used by client
  //let accountId = req.session.accountId
  //startCaptionTask(accountId, displayName)
  //requestCaptions(req.session.accountId, req.body.name, req.body.ass)
  await captionVideo(req.session.accountId, req.body.name, req.body.ass)
  res.status(200).json({})
})

import { pool } from '../services/pg.mjs'

router.get('/captions/dl_token', async (req, res) => {
  const accountId = req.session.accountId
  const videoName = req.query.name;
  let names = fromDisplayName(accountId, videoName)
  let videoToken = await getViewUrl('tv-captions', names.captions, names.captionsDownload)
  res.json(videoToken)
})

//CAPTIONS.HTML

router.get('/captions/video_token', async (req, res) => {
  const accountId = req.session.accountId
  const videoName = req.query.name;
  
  let videoToken = await getViewUrl('tv-captions', accountId + '-' + videoName)
  res.json(videoToken)
})

router.get('/captions/transcript/', async (req, res) => {
    console.log(req.session)

  const fileName = req.query.name;
  const accountId = req.session.accountId;

  if(!accountId || !fileName) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const query = 'select srt from transcripts where account_id=$1 and file_name=$2'
  let captions = await pool.query(query, [accountId, fileName])
  
  res.json(captions.rows[0].srt)
})

//CAPTIONS_UPLOAD.HTML
router.post('/transcribe_audio', async (req, res) => {
  const { fileName, duration } = req.body
  let accountId = req.session.accountId
  if(!accountId || !fileName) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  let audioViewToken = await getViewUrl('tv-captions', accountId + '-' + fileName)
  let dgResponse = await transcribe(audioViewToken)
  const dgsrt = srt(dgResponse)
  let words = dgResponse.results.channels[0].alternatives[0].words
  writeCaptions(JSON.stringify(words), accountId, fileName, dgsrt)
  return res.status(200).json({srt:dgsrt})
})

router.post('/audio_upload_token', (req, res) => {
  let fileName = req.body.fileName
  let fileType = req.body.fileType
  let accountId = req.session.accountId
  
  getUploadUrl('tv-captions', accountId + '-' + fileName, fileType).then(t => {
    res.status(200).json({
      token: t
    })
  }).catch(error => {
    console.error('Upload token error:', error)
    res.status(500).json({ error: 'Failed to generate upload token' })
  })
})

router.post('/video_upload_token', (req, res) => {
  let fileName = req.body.fileName
  let fileType = req.body.fileType
  let accountId = req.session.accountId
  
  if(!accountId || !fileName) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  
  getUploadUrl('tv-captions', accountId + '-' + fileName, fileType).then(t => {
    res.status(200).json({
      token: t
    })
  }).catch(error => {
    console.error('Upload token error:', error)
    res.status(500).json({ error: 'Failed to generate upload token' })
  })
})

router.get('/captions/check/:fileName', async (req, res) => {
  try {
    let fileName = req.params.fileName
    let accountId = req.session.accountId
    if(!accountId || !fileName) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    let names = fromDisplayName(accountId, fileName)
    let file = await checkFileExists('tv-captions', names.captions)
    
    let response = {
      fileFound: file
    }
    
    res.status(200).send(response)
  } catch (error) {
    console.error('Check file error:', error)
    res.status(500).json({ error: 'Failed to check file' })
  }
})

export default router
