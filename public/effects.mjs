// effects.js - Shared rendering functions for caption effects

export function wrapText(ctx, text, maxWidth, fontFamily, fontSize) {
  ctx.font = `${fontSize}px ${fontFamily}`;
  
  const paragraphs = text.split('\n');
  const allLines = [];
  
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) continue;
    
    const words = paragraph.split(' ');
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine) {
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

// effects.mjs

export function renderRainbowEffect(ctx, opts) {
  const {
    text,
    fontSize,
    textHeightPercent,
    state = {},
    auxCanvas // <--- Now required
  } = opts;

  if (!auxCanvas) {
    throw new Error("renderRainbowEffect requires an 'auxCanvas' argument.");
  }

  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;
  const fontFamily = 'Modak';
  const padding = 50;
  const maxWidth = canvasWidth - (padding * 2) - 40;

  // Get the context of the passed scratchpad canvas
  const offCtx = auxCanvas.getContext('2d');

  // --- OPTIMIZATION 1: Initialize State (Particles only) ---
  if (!state.particles) {
    state.particles = [];
    state.colorOffset = 0;
    
    state.createParticle = (startRandomY = true) => ({
      x: Math.random() * canvasWidth,
      y: startRandomY ? Math.random() * canvasHeight : -50,
      speedVar: 0.8 + Math.random() * 0.4,
      sizeVar: 0.8 + Math.random() * 0.4,
      lightness: 40 + Math.random() * 20
    });

    const RAINBOW_CONFIG = {
      speed: 2,
      count: 30000, 
      zoom: 3,
      size: 20,
      colors: [0, 30, 60, 120, 180, 240, 270, 300]
    };
    state.config = RAINBOW_CONFIG;

    for (let i = 0; i < RAINBOW_CONFIG.count; i++) {
      state.particles.push(state.createParticle(true));
    }
  }

  const RAINBOW_CONFIG = state.config;

  // --- OPTIMIZATION 2: Memoize Text Layout ---
  // Only recalculate wrapping if text or font size changes
  if (state.lastText !== text || state.lastFontSize !== fontSize || state.lastWidth !== canvasWidth) {
    ctx.font = `${fontSize}px ${fontFamily}`;
    state.cachedLines = wrapText(ctx, text, maxWidth, fontFamily, fontSize);
    state.lastText = text;
    state.lastFontSize = fontSize;
    state.lastWidth = canvasWidth;
  }

  const lines = state.cachedLines;
  const position = calculateTextPosition(
    canvasHeight, lines.length, fontSize, textHeightPercent
  );

  // --- STEP 1: Draw Particles to the passed AUX Canvas ---
  
  // Important: Clear the aux canvas first!
  offCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  
  state.colorOffset += RAINBOW_CONFIG.speed * 0.002;

  state.particles.forEach(p => {
    p.y += RAINBOW_CONFIG.speed * p.speedVar;
    if (p.y > canvasHeight) {
      p.x = Math.random() * canvasWidth;
      p.y = -50;
      p.speedVar = 0.8 + Math.random() * 0.4;
      p.sizeVar = 0.8 + Math.random() * 0.4;
      p.lightness = 40 + Math.random() * 20;
    }

    const diagonalVal = (p.x + p.y) / (canvasWidth + canvasHeight);
    let huePos = (diagonalVal * RAINBOW_CONFIG.zoom - state.colorOffset) % 1;
    if (huePos < 0) huePos += 1;

    const colorIndex = huePos * (RAINBOW_CONFIG.colors.length - 1);
    const lowerIndex = Math.floor(colorIndex);
    const upperIndex = Math.ceil(colorIndex);
    const blend = colorIndex - lowerIndex;
    const hue = RAINBOW_CONFIG.colors[lowerIndex] * (1 - blend) + 
                RAINBOW_CONFIG.colors[upperIndex] * blend;

    const size = RAINBOW_CONFIG.size * p.sizeVar;

    offCtx.fillStyle = `hsl(${hue}, 80%, ${p.lightness}%)`;
    offCtx.fillRect(p.x, p.y, size, size);
  });

  // --- STEP 2: Draw Text on Main Canvas ---
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'left'; 
  ctx.textBaseline = 'alphabetic';

  lines.forEach((line, i) => {
    const lineWidth = ctx.measureText(line).width;
    const lineX = (canvasWidth - lineWidth) / 2;
    const lineY = position.startY + i * position.lineHeight;
    ctx.fillText(line, lineX, lineY);
  });

  // --- STEP 3: Composite ONCE ---
  // Draw the populated auxCanvas onto the text
  ctx.globalCompositeOperation = 'source-in';
  ctx.drawImage(auxCanvas, 0, 0);

  // --- STEP 4: Outline ---
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 2;

  lines.forEach((line, i) => {
    const lineWidth = ctx.measureText(line).width;
    const lineX = (canvasWidth - lineWidth) / 2;
    const lineY = position.startY + i * position.lineHeight;
    ctx.strokeText(line, lineX, lineY);
  });

  ctx.restore();
}

export function calculateTextPosition(canvasHeight, lineCount, fontSize, textHeightPercent) {
  const lineHeight = fontSize * 1.2;
  const totalTextHeight = lineCount * lineHeight;
  const textVerticalRange = canvasHeight - totalTextHeight - fontSize * 0.8;
  const invertedPercent = 100 - textHeightPercent;
  const startY = (textVerticalRange * invertedPercent / 100) + fontSize * 1.6;
  
  return { startY, lineHeight };
}

export function renderHolographicEffect(ctx, opts) {
  const {
    text,
    styleImage,
    timestamp,
    fontSize,
    textHeightPercent
  } = opts;
  
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;
  const fontFamily = 'Modak';
  const padding = 50;
  const maxWidth = canvasWidth - (padding * 2) - 40;
  
  ctx.font = `${fontSize}px ${fontFamily}`;
  const lines = wrapText(ctx, text, maxWidth, fontFamily, fontSize);
  
  const position = calculateTextPosition(
    canvasHeight, lines.length, fontSize, textHeightPercent
  );

  ctx.save();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  lines.forEach((line, i) => {
    const lineWidth = ctx.measureText(line).width;
    const lineX = (canvasWidth - lineWidth) / 2;
    const lineY = position.startY + i * position.lineHeight;
    ctx.fillText(line, lineX, lineY);
  });

  ctx.globalCompositeOperation = 'source-in';

  const animDuration = 100;
  const progress = (timestamp % (animDuration * 2)) / animDuration;
  const yDir = progress <= 1 ? progress : 2 - progress;
  const bgSize = canvasHeight * 5;
  const bgY = yDir * (bgSize - canvasHeight);

  const imgAspect = styleImage.width / styleImage.height;
  const animScrollHeight = canvasHeight * 5;
  
  let drawWidth, drawHeight, drawX, drawY;
  
  drawHeight = animScrollHeight;
  drawWidth = drawHeight * imgAspect;
  drawX = (canvasWidth - drawWidth) / 2;
  drawY = -bgY;

  const scaleX = drawWidth / styleImage.width;
  const scaleY = drawHeight / styleImage.height;

  const sx = (0 - drawX) / scaleX;
  const sy = (0 - drawY) / scaleY;
  const sw = canvasWidth / scaleX;
  const sh = canvasHeight / scaleY;

  ctx.drawImage(
    styleImage, 
    sx, sy, sw, sh, 
    0, 0, canvasWidth, canvasHeight
  );

  ctx.globalCompositeOperation = 'source-over';
  
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 2;

  lines.forEach((line, i) => {
    const lineWidth = ctx.measureText(line).width;
    const lineX = (canvasWidth - lineWidth) / 2;
    const lineY = position.startY + i * position.lineHeight;
    ctx.strokeText(line, lineX, lineY);
  });

  ctx.restore();
}

export function detectLEDDots(opts) {
  const {
    text,
    fontSize,
    textHeightPercent,
    squareSize = 8,
    auxCtx
  } = opts;
  
  const canvasWidth = auxCtx.canvas.width;
  const canvasHeight = auxCtx.canvas.height;
  const fontFamily = 'Tinos';
  const padding = 50;
  const maxWidth = canvasWidth - (padding * 2) - 40;

  auxCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  
  const lines = wrapText(auxCtx, text, maxWidth, fontFamily, fontSize);
  const position = calculateTextPosition(
    canvasHeight, lines.length, fontSize, textHeightPercent
  );
  
  auxCtx.font = `${fontSize}px ${fontFamily}`;
  auxCtx.fillStyle = '#FFFFFF';
  auxCtx.textBaseline = 'alphabetic';
  
  lines.forEach((line, i) => {
    const lineWidth = auxCtx.measureText(line).width;
    const lineX = (canvasWidth - lineWidth) / 2;
    const lineY = position.startY + i * position.lineHeight;
    auxCtx.fillText(line, lineX, lineY);
  });
  
  const imageData = auxCtx.getImageData(0, 0, canvasWidth, canvasHeight);
  const data = imageData.data;
  const visited = new Set();
  const detectedDots = [];
  
  for (let py = 0; py < canvasHeight; py += squareSize) {
    for (let px = 0; px < canvasWidth; px += squareSize) {
      const key = `${px},${py}`;
      if (visited.has(key)) continue;
      
      let hasWhite = false;
      let sumX = 0, sumY = 0, count = 0;
      
      for (let dy = 0; dy < squareSize && !hasWhite; dy++) {
        for (let dx = 0; dx < squareSize; dx++) {
          const checkX = px + dx;
          const checkY = py + dy;
          if (checkX >= canvasWidth || checkY >= canvasHeight) continue;
          
          const index = (checkY * canvasWidth + checkX) * 4;
          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];
          const a = data[index + 3];
          
          if (r > 200 && g > 200 && b > 200 && a > 200) {
            hasWhite = true;
            sumX += checkX;
            sumY += checkY;
            count++;
          }
        }
      }
      
      if (hasWhite && count > 0) {
        visited.add(key);
        detectedDots.push({
          x: sumX / count,
          y: sumY / count,
          colorIndex: Math.random() * 8,
          colorSpeed: 0.05 + Math.random() * 0.1,
          brightness: Math.random()
        });
      }
    }
  }
  return detectedDots;
}

const LED_COLORS = [
  '#FF0000',
  '#FF8800',
  '#FFFF00',
  '#88FF00',
  '#00FF00',
  '#00FFFF',
  '#0088FF',
  '#8800FF'
];

export function renderLEDEffect(ctx, opts) {
  const {
    dots,
    fontSize,
    squareSize = 8
  } = opts;
  
  if (!dots || dots.length === 0) {
    return;
  }
  
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  dots.forEach(dot => {
    minX = Math.min(minX, dot.x);
    maxX = Math.max(maxX, dot.x);
    minY = Math.min(minY, dot.y);
    maxY = Math.max(maxY, dot.y);
  });
  
  const boxPadding = fontSize * 0.5;
  const boxX = minX - boxPadding;
  const boxY = minY - boxPadding;
  const boxWidth = (maxX - minX) + (boxPadding * 2);
  const boxHeight = (maxY - minY) + (boxPadding * 2);
  const borderRadius = fontSize * 0.3;
  
  ctx.fillStyle = 'rgba(0, 0, 0, 1)';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, borderRadius);
  ctx.fill();
  
  dots.forEach(dot => {
    dot.colorIndex += dot.colorSpeed;
    if (dot.colorIndex >= LED_COLORS.length) {
      dot.colorIndex = 0;
    }
    
    dot.brightness += 0.05;
    const brightness = (Math.sin(dot.brightness) + 1) / 2 * 0.5 + 0.5;
    
    const color = LED_COLORS[Math.floor(dot.colorIndex)];
    
    ctx.fillStyle = color;
    ctx.globalAlpha = brightness;
    
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, squareSize * 0.3, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.globalAlpha = brightness * 0.3;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, squareSize * 0.5, 0, Math.PI * 2);
    ctx.fill();
  });
  
  ctx.globalAlpha = 1.0;
}