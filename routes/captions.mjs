import express from 'express'
import { writeCaptions } from '../services/pg.mjs'
import { transcribe } from '../services/deepgram.mjs'
import { getUploadUrl } from '../services/r2_new.mjs'
import { srt } from "@deepgram/captions";
import { promises as fs } from 'fs'
import { uploadFile, downloadFile, getViewUrl, checkFileExists } from '..//services/r2_new.mjs'
import { execFile } from 'child_process'
import ffprobePath from 'ffprobe-static'
import { generateHolographicCaptions } from '../../node-ffmpeg-demo/caption_ffmpeg.mjs'; // Adjust path to where you save the 2nd file

import crypto from 'crypto'

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

const router = express.Router()

// Update the router endpoint
router.post('/captions/create', async (req, res) => {
  console.log(req.body)
  const accountId = req.session.accountId
  const { videoName, fontSize, textPosition } = req.body
  
  if(!accountId || !videoName) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  
  try {
    res.status(200).json({})
    await generateHolographicCaptionsForVideo(accountId, videoName, fontSize, textPosition)
  } catch (error) {
    console.error('Caption generation error:', error)
    res.status(500).json({ error: 'Failed to generate captions' })
  }
})

async function generateHolographicCaptionsForVideo(accountId, displayName, fontSize, textHeightPercent) {
  const workdir = "work";
  const acctDir = `${workdir}/${accountId}/`;
  
  // Create working directories
  await fs.mkdir(workdir, { recursive: true });
  await fs.mkdir(acctDir, { recursive: true });
  
  const fileNames = fromDisplayName(accountId, displayName);
  
  // Generate random names for temp files
  // Note: we use fileNames.extension for input to keep original format, but .mp4 for output as ffmpeg encodes to mp4
  const localInputFile = acctDir + generateRandomName() + fileNames.extension;
  const srtFile = acctDir + generateRandomName() + ".srt";
  const localFinishedPath = acctDir + generateRandomName() + ".mp4"; 
  const holoImagePath = 'public/images/holo.jpg';

  try {
    // 1. Download original video
    await downloadFile('tv-captions', fileNames.original, localInputFile);
    
    // 2. Probe video for metadata (Critical for the generator)
    // Ensure your probeVideo function returns { width, height, duration, fps }
    const videoInfo = await probeVideo(localInputFile);

    // 3. Get SRT from database
    const query = 'select srt from transcripts where account_id=$1 and file_name=$2';
    const captions = await pool.query(query, [accountId, displayName]);
    
    if (!captions.rows.length) {
        throw new Error("No captions found for this file.");
    }
    await fs.writeFile(srtFile, captions.rows[0].srt);
    
    // 4. Generate holographic captions
    // We pass the metadata we probed so the canvas matches the video exactly
    await generateHolographicCaptions({
      videoPath: localInputFile,
      srtPath: srtFile,
      holoImagePath: holoImagePath,
      outputPath: localFinishedPath,
      fontSize: fontSize || 80,
      textHeightPercent: textHeightPercent || 50,
      width: videoInfo.width,
      height: videoInfo.height,
      duration: videoInfo.duration,
      fps: videoInfo.fps || 30 // Default to 30 if probe doesn't catch it
    });
    
    // 5. Upload finished video
    await uploadFile('tv-captions', fileNames.captions, localFinishedPath);
    
  } catch (err) {
    console.error("Error generating holographic captions:", err);
    throw err; // Re-throw to handle it upstream
  } finally {
    // 6. Cleanup (Runs even if error occurs)
    // We use Promise.allSettled to ensure one failure doesn't stop other deletions
    await Promise.allSettled([
        deleteFile(localInputFile),
        deleteFile(srtFile),
        deleteFile(localFinishedPath)
    ]);
  }
}

// Probe video to get dimensions and duration
async function probeVideo(videoPath) {
  return new Promise((resolve, reject) => {
    execFile(ffprobePath.path, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,duration',
      '-of', 'json',
      videoPath
    ], (error, stdout, stderr) => {
      if (error) {
        console.error('FFprobe error:', stderr);
        reject(error);
      } else {
        const data = JSON.parse(stdout);
        const stream = data.streams[0];
        resolve({
          width: stream.width,
          height: stream.height,
          duration: parseFloat(stream.duration)
        });
      }
    });
  });
}

// Helper function for generating random names (if not already present)
function generateRandomName() {
  return crypto.randomBytes(16).toString('hex');
}

// Helper function for deleting files (if not already present)
async function deleteFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.error(`Error deleting file ${filePath}:`, error);
  }
}

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
    //let accountId = '101967346386369497929' 
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
