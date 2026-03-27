// render_gold.mjs
// Renders the gold 3D caption effect onto emily.mov using Puppeteer + FFmpeg.
// Puppeteer runs gold-render.html headlessly, captures each frame as a PNG
// with alpha, and pipes it to FFmpeg for compositing onto the original video.
//
// Usage: node tasks/render_gold.mjs

import puppeteer from 'puppeteer';
import { spawn, execFile } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const PORT = 7891;

const VIDEO_IN  = path.join(ROOT, 'work/resources/emily.mov');
const VIDEO_OUT = path.join(ROOT, 'work/render_gold/emily_gold.mp4');

// --- Probe video ---
function probeVideo(p) {
  return new Promise((resolve, reject) => {
    execFile(ffprobeStatic.path, [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate,duration:stream_tags=rotate',
      '-of', 'json', p,
    ], (err, stdout) => {
      if (err) return reject(err);
      const s = JSON.parse(stdout).streams[0];
      const rotation = s.tags?.rotate ? parseInt(s.tags.rotate) : 0;
      let { width, height } = s;
      if (rotation === 90 || rotation === 270) [width, height] = [height, width];
      const [num, den] = s.r_frame_rate.split('/').map(Number);
      const fps = Math.round(num / den);
      resolve({ width, height, fps, duration: parseFloat(s.duration), rotation });
    });
  });
}

// --- Minimal static file server ---
function startServer() {
  const mime = {
    '.html': 'text/html', '.js': 'application/javascript',
    '.mjs': 'application/javascript', '.css': 'text/css',
    '.hdr': 'application/octet-stream', '.json': 'application/json',
    '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf',
  };
  const server = http.createServer((req, res) => {
    const urlPath = req.url.split('?')[0];
    const filePath = path.join(ROOT, urlPath);
    const ext = path.extname(filePath);
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(PORT, () => resolve(server)));
}

async function main() {
  const { width, height, fps, duration, rotation } = await probeVideo(VIDEO_IN);
  const totalFrames = Math.floor(duration * fps);
  console.log(`Video: ${width}x${height} @ ${fps}fps, ${duration.toFixed(1)}s, ${totalFrames} frames`);
  console.log(`Output: ${VIDEO_OUT}\n`);

  const server = await startServer();
  console.log(`Static server on :${PORT}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });

  const url = `http://localhost:${PORT}/public/experiments/gold-render.html?width=${width}&height=${height}`;
  console.log(`Loading: ${url}`);
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

  console.log('Waiting for Three.js (font + HDR)...');
  await page.waitForFunction(() => window.isReady === true, { timeout: 30000 });
  console.log('Renderer ready\n');

  // --- FFmpeg ---
  // Input 0: original video | Input 1: PNG frames via stdin (image2pipe)
  // Rotation is already baked into the swap of width/height above;
  // we still need the transpose filter if the source has a rotation tag.
  let rotationFilter = '';
  if (rotation === 90)  rotationFilter = ',transpose=2';
  if (rotation === -90) rotationFilter = ',transpose=1';
  if (rotation === 180) rotationFilter = ',transpose=1,transpose=1';

  const filterComplex =
    `[0:v][1:v]overlay=0:0:format=auto,format=yuv420p${rotationFilter}`;

  const ffmpeg = spawn(ffmpegPath, [
    '-y',
    '-i', VIDEO_IN,
    '-f', 'image2pipe', '-vcodec', 'png', '-r', String(fps), '-i', 'pipe:0',
    '-filter_complex', filterComplex,
    '-c:v', 'libx264', '-crf', '18', '-preset', 'slow',
    '-c:a', 'copy',
    VIDEO_OUT,
  ]);

  ffmpeg.stderr.on('data', d => process.stderr.write(d));
  ffmpeg.on('error', err => console.error('FFmpeg error:', err));

  const ffmpegDone = new Promise(resolve => ffmpeg.on('close', resolve));

  // --- Frame loop ---
  const startTime = Date.now();
  let lastProgressTime = startTime;

  for (let frame = 0; frame < totalFrames; frame++) {
    const t = frame / fps;

    await page.evaluate(t => window.setRenderTime(t), t);

    const dataURL = await page.evaluate(() =>
      document.getElementById('three-canvas').toDataURL('image/png')
    );

    const base64 = dataURL.slice('data:image/png;base64,'.length);
    const pngBuf = Buffer.from(base64, 'base64');

    // Backpressure: wait if FFmpeg's stdin buffer is full
    const ok = ffmpeg.stdin.write(pngBuf);
    if (!ok) await new Promise(r => ffmpeg.stdin.once('drain', r));

    // Progress every second
    const now = Date.now();
    if (now - lastProgressTime >= 1000) {
      lastProgressTime = now;
      const elapsed = (now - startTime) / 1000;
      const framesPerSec = frame / elapsed;
      const remaining = framesPerSec > 0 ? (totalFrames - frame) / framesPerSec : 0;
      process.stdout.write(
        `\rFrame ${frame}/${totalFrames} (${t.toFixed(1)}s) — ` +
        `${framesPerSec.toFixed(1)} fps — ~${Math.round(remaining)}s left   `
      );
    }
  }

  console.log('\n\nFinalizing...');
  ffmpeg.stdin.end();
  await ffmpegDone;

  await browser.close();
  server.close();

  const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Done in ${totalSec}s → ${VIDEO_OUT}`);
}

main().catch(err => { console.error(err); process.exit(1); });
