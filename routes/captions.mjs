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

import { createCanvas, loadImage, registerFont } from 'canvas';
import { execSync } from 'child_process';

// Register the font
registerFont('public/Modak-Regular.ttf', { family: 'Modak' });

// Parse SRT file
async function parseSRT(filepath) {
  const content = await fs.readFile(filepath, 'utf8');
  const blocks = content.trim().split(/\n\s*\n/);
  const subtitles = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 3) continue;

    // Parse timestamp line (format: 00:00:01,000 --> 00:00:03,500)
    const timeLine = lines[1];
    const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
    
    if (timeMatch) {
      const startTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
      const endTime = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
      // Join remaining lines as text
      const text = lines.slice(2).join('\n');
      subtitles.push({ startTime, endTime, text });
    }
  }
  
  return subtitles;
}

// Get active subtitle for a given timestamp
function getSubtitleAtTime(subtitles, timestamp) {
  for (const sub of subtitles) {
    if (timestamp >= sub.startTime && timestamp < sub.endTime) {
      return sub.text;
    }
  }
  return null;
}

// Word wrap text to fit within maxWidth
function wrapText(ctx, text, maxWidth, fontSize) {
  // Set font for accurate measurement
  ctx.font = `${fontSize}px Modak`;
  
  // First split on existing \n (preserve intentional breaks)
  const paragraphs = text.split('\n');
  const allLines = [];
  
  for (const paragraph of paragraphs) {
    // Skip empty paragraphs
    if (!paragraph.trim()) continue;
    
    const words = paragraph.split(' ');
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine) {
        // Line is too long, push current line and start new
        allLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      allLines.push(currentLine);
    }
  }
  
  return allLines;
}

// Render holographic text effect
function renderHolographicText(ctx, canvas, text, holoImage, timestamp, fontSize, textHeightPercent) {
  // Animation: 10s cycle
  const animDuration = 10;
  const progress = (timestamp % (animDuration * 2)) / animDuration;
  const yDir = progress <= 1 ? progress : 2 - progress;
  const bgSize = canvas.height * 5;
  const bgY = yDir * (bgSize - canvas.height);

  // Word wrapping
  const padding = 50;
  const maxWidth = canvas.width - (padding * 2) - 40;
  const lines = wrapText(ctx, text, maxWidth, fontSize);
  const lineHeight = fontSize * 1.2;
  const totalTextHeight = lines.length * lineHeight;

  // Calculate Y position (INVERTED: 100% = top, 0% = bottom)
  const textVerticalRange = canvas.height - totalTextHeight - fontSize * 0.8;
  const invertedPercent = 100 - textHeightPercent;
  const startY = (textVerticalRange * invertedPercent / 100) + fontSize * 1.6;

  ctx.save();
  ctx.font = `${fontSize}px Modak`;

  // Create temp canvas for text mask
  const tempCanvas = createCanvas(canvas.width, canvas.height);
  const tempCtx = tempCanvas.getContext('2d');

  // Draw ALL text to temp canvas
  tempCtx.font = `${fontSize}px Modak`;
  tempCtx.fillStyle = '#ffffff';
  lines.forEach((line, i) => {
    const lineWidth = tempCtx.measureText(line).width;
    const lineX = (canvas.width - lineWidth) / 2;
    const lineY = startY + i * lineHeight;
    tempCtx.fillText(line, lineX, lineY);
  });

  // Draw holo image to main canvas
  ctx.drawImage(holoImage, 0, -bgY, canvas.width, bgSize);

  // Apply the combined text mask in ONE operation
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(tempCanvas, 0, 0);
  
  ctx.restore();
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
    await generateHolographicCaptionsForVideo(accountId, videoName, fontSize, textPosition)
    res.status(200).json({})
  } catch (error) {
    console.error('Caption generation error:', error)
    res.status(500).json({ error: 'Failed to generate captions' })
  }
})

// New wrapper function that handles file management
async function generateHolographicCaptionsForVideo(accountId, displayName, fontSize, textHeightPercent) {
  const workdir = "work"
  const acctDir = `${workdir}/${accountId}/`
  await fs.mkdir(workdir, { recursive: true })
  await fs.mkdir(acctDir, { recursive: true })
  
  const fileNames = fromDisplayName(accountId, displayName)
  
  // Generate random names for temp files
  const localInputFile = acctDir + generateRandomName() + fileNames.extension
  const srtFile = acctDir + generateRandomName() + ".srt"
  const localFinishedPath = acctDir + generateRandomName() + fileNames.extension
  const holoImagePath = 'public/holo.jpg' // You may need to adjust this path
  const framesDir = acctDir + 'frames'
  
  // Download original video and SRT from database
  await downloadFile('tv-captions', fileNames.original, localInputFile)
  
  // Get SRT from database
  const query = 'select srt from transcripts where account_id=$1 and file_name=$2'
  const captions = await pool.query(query, [accountId, displayName])
  await fs.writeFile(srtFile, captions.rows[0].srt)
  
  // Get video metadata (duration) - you may need to get this from your database or probe the video
  // For now, using a default or you can add ffprobe to get actual duration
  const duration = 57 // TODO: Get actual duration
  
  // Generate holographic captions
  await generateHolographicCaptions({
    videoPath: localInputFile,
    srtPath: srtFile,
    holoImagePath: holoImagePath,
    outputPath: localFinishedPath,
    fontSize: fontSize || 80,
    textHeightPercent: textHeightPercent || 50,
    framesDir: framesDir,
    duration: duration
  })
  
  // Upload finished video
  await uploadFile('tv-captions', fileNames.captions, localFinishedPath)
  
  // Cleanup
  await deleteFile(localInputFile)
  await deleteFile(srtFile)
  await deleteFile(localFinishedPath)
  // Clean up frames directory
  await fs.rm(framesDir, { recursive: true, force: true })
}

// Modified generateHolographicCaptions to use ffmpeg-static and custom frames directory
export async function generateHolographicCaptions({
  videoPath,
  srtPath,
  holoImagePath,
  outputPath = 'output.mp4',
  fontSize = 80,
  textHeightPercent = 50,
  width = 720,
  height = 1280,
  fps = 30,
  duration = 57,
  framesDir = 'frames'
}) {
  const totalFrames = duration * fps;

  // Create temp dir for frames
  await fs.mkdir(framesDir, { recursive: true });

  const holoImage = await loadImage(holoImagePath);
  const subtitles = await parseSRT(srtPath);

  for (let frame = 0; frame < totalFrames; frame++) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const timestamp = frame / fps;

    // Get current subtitle text
    const text = getSubtitleAtTime(subtitles, timestamp);

    // Skip frame if no subtitle
    if (!text) {
      // Create transparent frame
      const buffer = canvas.toBuffer('image/png');
      await fs.writeFile(`${framesDir}/frame_${frame.toString().padStart(5, '0')}.png`, buffer);
      continue;
    }

    // Draw holographic text effect
    renderHolographicText(ctx, canvas, text, holoImage, timestamp, fontSize, textHeightPercent);

    const buffer = canvas.toBuffer('image/png');
    await fs.writeFile(`${framesDir}/frame_${frame.toString().padStart(5, '0')}.png`, buffer);

    if (frame % 30 === 0) {
      console.log(`Rendered frame ${frame}/${totalFrames}`);
    }
  }

  // Run FFmpeg to overlay using ffmpeg-static and execFile
  console.log('Rendering video with FFmpeg...');
  
  return new Promise((resolve, reject) => {
    const ffmpegArgs = [
      '-y',
      '-i', videoPath,
      '-framerate', fps.toString(),
      '-i', `${framesDir}/frame_%05d.png`,
      '-filter_complex', '[0:v][1:v]overlay=0:0',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      outputPath
    ];
    
    execFile(ffmpegPath, ffmpegArgs, (error, stdout, stderr) => {
      if (error) {
        console.error('FFmpeg error:', stderr);
        reject(error);
      } else {
        console.log(`Done! Created ${outputPath}`);
        resolve();
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
