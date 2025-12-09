import express from 'express'
import { pool } from '../services/pg.mjs'
import { transcribe } from '../services/deepgram.mjs'
import { getUploadUrl } from '../services/r2_new.mjs'
import { srt } from "@deepgram/captions";
import { promises as fs } from 'fs'
import { uploadFile, downloadFile, getViewUrl } from '..//services/r2_new.mjs'
import { execFile } from 'child_process'
import ffprobePath from 'ffprobe-static'
import { generateStyledCaptions } from '../services/local_caption.mjs'; 

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

// Create a video entry and return the ID
router.post('/videos/create', async (req, res) => {
  const accountId = req.session.accountId
  const { fileName } = req.body

  if(!accountId || !fileName) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const videoResult = await pool.query(
      `INSERT INTO videos (account_id, filename, is_original)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [accountId, fileName, true]
    )
    const videoId = videoResult.rows[0].id

    // Generate and store the R2 key
    const extension = fileName.substring(fileName.lastIndexOf('.'))
    const r2Key = `${accountId}-${videoId}${extension}`

    await pool.query(
      `UPDATE videos SET r2_key = $1 WHERE id = $2`,
      [r2Key, videoId]
    )

    res.status(200).json({ videoId })
  } catch (error) {
    console.error('Error creating video entry:', error)
    res.status(500).json({ error: 'Failed to create video entry' })
  }
})

// Update the router endpoint
router.post('/captions/create', async (req, res) => {
  console.log(req.body)
  const accountId = req.session.accountId
  const { videoId, fontSize, textPosition, style } = req.body

  if(!accountId || !videoId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    res.status(200).json({})
    const captionedVideoId = await generateHolographicCaptionsForVideo(accountId, videoId, fontSize, textPosition, style)
  } catch (error) {
    console.error('Caption generation error:', error)
    res.status(500).json({ error: 'Failed to generate captions' })
  }
})

async function generateHolographicCaptionsForVideo(accountId, sourceVideoId, fontSize, textHeightPercent, style) {
  const workdir = "work";
  const acctDir = `${workdir}/${accountId}/`;

  // Create working directories
  await fs.mkdir(workdir, { recursive: true });
  await fs.mkdir(acctDir, { recursive: true });

  // Get source video info
  const videoQuery = await pool.query(
    'SELECT filename, r2_key FROM videos WHERE id = $1 AND account_id = $2',
    [sourceVideoId, accountId]
  )

  if (!videoQuery.rows.length) {
    throw new Error('Source video not found')
  }

  const sourceFilename = videoQuery.rows[0].filename
  const sourceR2Key = videoQuery.rows[0].r2_key
  const extension = sourceFilename.substring(sourceFilename.lastIndexOf('.'))

  // Generate random names for temp files
  const localInputFile = acctDir + generateRandomName() + extension;
  const srtFile = acctDir + generateRandomName() + ".srt";
  const localFinishedPath = acctDir + generateRandomName() + ".mp4";
  const holoImagePath = 'public/images/holo.jpg';

  try {
    // 1. Download original video
    await downloadFile('tv-captions', sourceR2Key, localInputFile);

    // 2. Probe video for metadata (Critical for the generator)
    const videoInfo = await probeVideo(localInputFile);

    // 3. Get SRT from database
    const query = `SELECT srt FROM transcripts WHERE account_id=$1 AND video_id=$2`;
    const captions = await pool.query(query, [accountId, sourceVideoId]);

    if (!captions.rows.length) {
        throw new Error("No captions found for this file.");
    }
    await fs.writeFile(srtFile, captions.rows[0].srt);

    // 4. Generate holographic captions
    await generateStyledCaptions({
      videoPath: localInputFile,
      srtPath: srtFile,
      holoImagePath: holoImagePath,
      outputPath: localFinishedPath,
      fontSize: fontSize || 80,
      textHeightPercent: textHeightPercent || 50,
      width: videoInfo.width,
      height: videoInfo.height,
      captionStyle: style,
      duration: videoInfo.duration,
      fps: videoInfo.fps || 30
    });

    // 5. Create new video entry for captioned video
    const captionedFilename = sourceFilename.replace(/(\.[^.]+)$/, '_captions.mp4')
    const captionedVideoResult = await pool.query(
      `INSERT INTO videos (account_id, filename, is_original)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [accountId, captionedFilename, false]
    )
    const destVideoId = captionedVideoResult.rows[0].id
    const destR2Key = `${accountId}-${destVideoId}.mp4`

    // Store the R2 key
    await pool.query(
      `UPDATE videos SET r2_key = $1 WHERE id = $2`,
      [destR2Key, destVideoId]
    )

    // 6. Upload finished video
    await uploadFile('tv-captions', destR2Key, localFinishedPath);

    // 7. Create caption task entry
    const captionConfig = {
      fontSize: fontSize || 80,
      textHeightPercent: textHeightPercent || 50,
      style: style
    }

    await pool.query(
      `INSERT INTO caption_tasks (account_id, source_id, dest_id, caption_config)
       VALUES ($1, $2, $3, $4)`,
      [accountId, sourceVideoId, destVideoId, JSON.stringify(captionConfig)]
    )

    return destVideoId;

  } catch (err) {
    console.error("Error generating holographic captions:", err);
    throw err;
  } finally {
    // Cleanup
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

router.get('/captions/dl_token', async (req, res) => {
  const accountId = req.session.accountId
  const videoId = req.query.id

  if (!accountId || !videoId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    // Get the r2_key and filename from database
    const videoResult = await pool.query(
      'SELECT r2_key, filename FROM videos WHERE id = $1 AND account_id = $2',
      [videoId, accountId]
    )

    if (!videoResult.rows.length) {
      return res.status(404).json({ error: 'Video not found' })
    }

    const r2Key = videoResult.rows[0].r2_key
    const downloadFilename = videoResult.rows[0].filename

    let videoToken = await getViewUrl('tv-captions', r2Key, downloadFilename)
    res.json(videoToken)
  } catch (error) {
    console.error('Error getting download token:', error)
    res.status(500).json({ error: 'Failed to get download token' })
  }
})

//CAPTIONS.HTML

router.get('/captions/video_token', async (req, res) => {
  const accountId = req.session.accountId
  const videoId = req.query.id

  if (!accountId || !videoId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    // Get r2_key from database
    const videoResult = await pool.query(
      'SELECT r2_key FROM videos WHERE id = $1 AND account_id = $2',
      [videoId, accountId]
    )

    if (!videoResult.rows.length) {
      return res.status(404).json({ error: 'Video not found' })
    }

    const r2Key = videoResult.rows[0].r2_key

    let videoToken = await getViewUrl('tv-captions', r2Key)
    res.json(videoToken)
  } catch (error) {
    console.error('Error getting video token:', error)
    res.status(500).json({ error: 'Failed to get video token' })
  }
})

router.get('/captions/transcript/', async (req, res) => {
  console.log(req.session)

  const videoId = req.query.id
  const accountId = req.session.accountId

  if(!accountId || !videoId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const query = `SELECT srt, words FROM transcripts WHERE account_id=$1 AND video_id=$2`
    let captions = await pool.query(query, [accountId, videoId])

    if (!captions.rows.length) {
      return res.status(404).json({ error: 'Transcript not found' })
    }

    res.json({
      srt: captions.rows[0].srt,
      words: captions.rows[0].words ? JSON.parse(captions.rows[0].words) : null
    })
  } catch (error) {
    console.error('Error getting transcript:', error)
    res.status(500).json({ error: 'Failed to get transcript' })
  }
})

router.post('/transcribe_audio', async (req, res) => {
  const { videoId, duration } = req.body
  let accountId = req.session.accountId
  if(!accountId || !videoId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Get the r2_key from database
  const videoResult = await pool.query(
    'SELECT r2_key FROM videos WHERE id = $1 AND account_id = $2',
    [videoId, accountId]
  )

  if (!videoResult.rows.length) {
    return res.status(404).json({ error: 'Video not found' })
  }

  const r2Key = videoResult.rows[0].r2_key

  let audioViewToken = await getViewUrl('tv-captions', r2Key)
  let dgResponse = await transcribe(audioViewToken)
  const dgsrt = srt(dgResponse)
  let words = dgResponse.results.channels[0].alternatives[0].words
  // Write transcript directly
  await pool.query(
    `INSERT INTO transcripts (timestamp, account_id, video_id, srt, words)
     VALUES ($1, $2, $3, $4, $5)`,
    [new Date(), accountId, videoId, dgsrt, JSON.stringify(words)]
  )

  return res.status(200).json({srt: dgsrt})
})

router.post('/audio_upload_token', async (req, res) => {
  let videoId = req.body.videoId
  let fileType = req.body.fileType
  let accountId = req.session.accountId

  if(!accountId || !videoId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    // Use video ID for R2 key with .m4a extension for audio
    const r2Key = `${accountId}-${videoId}.m4a`
    const token = await getUploadUrl('tv-captions', r2Key, fileType)
    res.status(200).json({ token })
  } catch (error) {
    console.error('Upload token error:', error)
    res.status(500).json({ error: 'Failed to generate upload token' })
  }
})

router.post('/video_upload_token', async (req, res) => {
  let videoId = req.body.videoId
  let fileType = req.body.fileType
  let accountId = req.session.accountId

  if(!accountId || !videoId) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    // Get the r2_key from database
    const videoResult = await pool.query(
      'SELECT r2_key FROM videos WHERE id = $1 AND account_id = $2',
      [videoId, accountId]
    )

    if (!videoResult.rows.length) {
      return res.status(404).json({ error: 'Video not found' })
    }

    const r2Key = videoResult.rows[0].r2_key

    const token = await getUploadUrl('tv-captions', r2Key, fileType)
    res.status(200).json({ token })
  } catch (error) {
    console.error('Upload token error:', error)
    res.status(500).json({ error: 'Failed to generate upload token' })
  }
})

router.get('/captions/check/:videoId', async (req, res) => {
  try {
    let videoId = req.params.videoId
    let accountId = req.session.accountId
    if(!accountId || !videoId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // Check if a captioned version exists for this video
    // Look for a video entry where source_id matches this videoId
    const captionedVideoQuery = await pool.query(
      `SELECT dest_id FROM caption_tasks WHERE account_id=$1 AND source_id=$2 ORDER BY created_at DESC LIMIT 1`,
      [accountId, videoId]
    )

    const fileFound = captionedVideoQuery.rows.length > 0
    const captionedVideoId = fileFound ? captionedVideoQuery.rows[0].dest_id : null

    res.status(200).send({ fileFound, captionedVideoId })
  } catch (error) {
    console.error('Check file error:', error)
    res.status(500).json({ error: 'Failed to check file' })
  }
})

export default router
