import fs from 'fs';
import { createCanvas, loadImage, registerFont } from 'canvas';
import { spawn } from 'child_process';
import { 
  renderHolographicEffect, 
  renderLEDEffect, 
  detectLEDDots,
  renderRainbowEffect // <--- Added import
} from '../public/effects.mjs';

// Register the fonts
// Ensure you have the Doto font file in your fonts folder
registerFont('public/fonts/Modak-Regular.ttf', { family: 'Modak' });
registerFont('public/fonts/Doto-Medium.ttf', { family: 'Doto' }); 
registerFont('public/fonts/Tinos-Regular.ttf', { family: 'Tinos' }); 


// Parse SRT file
function parseSRT(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
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

// Format elapsed time in human-readable format
function formatElapsedTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

export async function generateStyledCaptions({
  videoPath,
  srtPath,
  holoImagePath, // Only required if captionStyle is 'holographic'
  outputPath = 'output.mp4',
  captionStyle = 'holographic', // Options: 'holographic' | 'led' | 'rainbow'
  fontSize,
  textHeightPercent = 50,
  width,
  height,
  fps = 30,
  duration
}) {
  const startTime = Date.now();
  console.log(`Starting video processing with style: ${captionStyle}...\n`);
  
  const totalFrames = duration * fps;
  const subtitles = parseSRT(srtPath);
  
  // Load texture only if needed for holographic style
  let holoImage = null;
  if (captionStyle === 'holographic' && holoImagePath) {
    holoImage = await loadImage(holoImagePath);
  }

  // Initialize Canvas
  // We create a reusable scratchpad canvas.
  // It is used by LED detection AND Rainbow rendering to avoid creating new canvases in the loop.
  const auxCanvas = createCanvas(width, height);
  const auxCtx = auxCanvas.getContext('2d', { alpha: false }); 

  // Start ffmpeg process
  console.log('Starting FFmpeg process...');
  const ffmpegArgs = [
    '-y',
    '-i', videoPath,
    '-f', 'rawvideo',
    // node-canvas 'raw' is usually BGRA on Intel/Apple Silicon (little-endian)
    // If colors look inverted (Blue text is Red), change this to 'rgba'
    '-pix_fmt', 'bgra', 
    '-s', `${width}x${height}`,
    '-r', fps.toString(),
    '-i', '-', // Read from stdin
    
    // OVERLAY FIX: 
    // We force the overlay to handle the format automatically to prevent 
    // premature color conversion.
    '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto',
    
    '-c:v', 'libx264',
    
    // --- COLOR CORRECTION FLAGS ---
    // This tells players: "This is standard HD video (BT.709)"
    '-color_primaries', 'bt709',
    '-color_trc', 'bt709',
    '-colorspace', 'bt709',
    
    // Ensure the output pixel format is standard for web/players
    '-pix_fmt', 'yuv420p', 
    
    outputPath
  ];

  const ffmpeg = spawn('ffmpeg', ffmpegArgs);

  // Handle ffmpeg errors
  ffmpeg.stderr.on('data', (data) => {
    // process.stderr.write(data); // Uncomment for debugging
  });

  ffmpeg.on('error', (error) => {
    console.error('FFmpeg error:', error);
  });

  const frameStartTime = Date.now();
  console.log(`Rendering and streaming ${totalFrames} frames...`);

  let totalCanvasTime = 0;
  let totalRenderTime = 0;
  let totalBufferTime = 0;
  let totalWriteTime = 0;

  // --- STYLE STATES ---
  let lastText = null;
  let currentDots = []; // For LED
  const rainbowState = {}; // For Rainbow (particles)

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  for (let frame = 0; frame < totalFrames; frame++) {

    ctx.clearRect(0, 0, width, height);
    const frameIterStart = Date.now();
    const canvasStart = Date.now();
    
    const timestamp = frame / fps;
    totalCanvasTime += Date.now() - canvasStart;

    // Get current subtitle text
    const text = getSubtitleAtTime(subtitles, timestamp);

    const renderStart = Date.now();
    
    if (text) {
      if (captionStyle === 'led') {
        // --- LED STYLE LOGIC ---
        
        // 1. Detection: Only run heavy pixel scanning when text changes
        if (text !== lastText) {
          currentDots = detectLEDDots({
            text,
            fontSize,
            textHeightPercent,
            squareSize: 8,
            auxCtx: auxCtx // Pass the reusable scratchpad context
          });
          lastText = text;
        }

        // 2. Rendering
        if (currentDots.length > 0) {
          renderLEDEffect(ctx, {
            dots: currentDots,
            fontSize,
            squareSize: 8
          });
        }

      } else if (captionStyle === 'rainbow') {
        // --- RAINBOW STYLE LOGIC ---
        
        // Reset other caches to be safe
        lastText = null;
        currentDots = [];

        renderRainbowEffect(ctx, {
          text: text,
          fontSize: fontSize,
          textHeightPercent: textHeightPercent,
          state: rainbowState,
          auxCanvas: auxCanvas // <--- Passing the reusable canvas here
        });

      } else {
        // --- HOLOGRAPHIC STYLE LOGIC ---
        
        if (!holoImage) {
          throw new Error("holoImagePath is required for holographic style");
        }

        lastText = null; 
        currentDots = [];

        renderHolographicEffect(ctx, {
          text: text,
          styleImage: holoImage,
          timestamp: timestamp,
          fontSize: fontSize,
          textHeightPercent: textHeightPercent
        });
      }
    } else {
      // No text - reset text caches
      lastText = null;
      currentDots = [];
      // Note: We do NOT reset rainbowState, so particles keep floating nicely
    }
    
    totalRenderTime += Date.now() - renderStart;

    // Get raw RGBA buffer and write to ffmpeg stdin
    const bufferStart = Date.now();
    const buffer = canvas.toBuffer('raw');
    totalBufferTime += Date.now() - bufferStart;
    
    // Write to ffmpeg (with backpressure handling)
    const writeStart = Date.now();
    const canContinue = ffmpeg.stdin.write(buffer);
    if (!canContinue) {
      await new Promise(resolve => ffmpeg.stdin.once('drain', resolve));
    }
    totalWriteTime += Date.now() - writeStart;

    if (frame % 30 === 0 && frame > 0) {
      const elapsed = Date.now() - frameStartTime;
      const framesPerSecond = frame / (elapsed / 1000);
      const estimatedRemaining = ((totalFrames - frame) / framesPerSecond) * 1000;
      
      console.log(`Progress: ${frame}/${totalFrames} frames (${(frame/totalFrames*100).toFixed(1)}%) - ${framesPerSecond.toFixed(1)} fps - ETA: ${formatElapsedTime(estimatedRemaining)}`);
    }
  }

  // Close stdin to signal we're done
  ffmpeg.stdin.end();

  const frameEndTime = Date.now();
  const frameRenderTime = frameEndTime - frameStartTime;
  console.log(`\nFrame rendering completed in ${formatElapsedTime(frameRenderTime)}`);

  // Wait for ffmpeg to finish
  console.log('Waiting for FFmpeg to finish encoding...');
  await new Promise((resolve, reject) => {
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });

  const totalTime = Date.now() - startTime;
  console.log(`\n${'='.repeat(50)}`);
  console.log(`TOTAL PROCESSING TIME: ${formatElapsedTime(totalTime)}`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Output saved to: ${outputPath}`);
}