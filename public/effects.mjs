// effects.js - Shared rendering functions for caption effects
// Works in both browser and Node.js (with node-canvas)

/**
 * Word wrap text to fit within maxWidth
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @param {string} fontFamily
 * @param {number} fontSize
 * @returns {string[]} Array of lines
 */
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

/**
 * Calculate text positioning parameters
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @param {number} lineCount
 * @param {number} fontSize
 * @param {number} textHeightPercent - 0 = bottom, 100 = top
 * @returns {{ startY: number, lineHeight: number, padding: number, maxWidth: number }}
 */
export function calculateTextPosition(canvasWidth, canvasHeight, lineCount, fontSize, textHeightPercent) {
  const padding = 50;
  const maxWidth = canvasWidth - (padding * 2) - 40;
  const lineHeight = fontSize * 1.2;
  const totalTextHeight = lineCount * lineHeight;
  
  // Inverted: 100% = top, 0% = bottom
  const textVerticalRange = canvasHeight - totalTextHeight - fontSize * 0.8;
  const invertedPercent = 100 - textHeightPercent;
  const startY = (textVerticalRange * invertedPercent / 100) + fontSize * 1.6;
  
  return { startY, lineHeight, padding, maxWidth };
}

/**
 * Render holographic/rainbow text effect (Optimized 'source-in' method)
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts
 * @param {string} opts.text
 * @param {HTMLImageElement|Image} opts.styleImage - The holographic or rainbow texture
 * @param {number} opts.timestamp - Current time in seconds
 * @param {number} opts.fontSize
 * @param {number} opts.textHeightPercent
 */
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
  
  // 1. Calculate Layout
  const { startY, lineHeight, maxWidth } = calculateTextPosition(
    canvasWidth, canvasHeight, 0, fontSize, textHeightPercent
  );
  
  // Note: wrapText relies on ctx.font being set
  ctx.font = `${fontSize}px ${fontFamily}`;
  const lines = wrapText(ctx, text, maxWidth, fontFamily, fontSize);
  
  // Recalculate startY based on actual line count
  const position = calculateTextPosition(
    canvasWidth, canvasHeight, lines.length, fontSize, textHeightPercent
  );

  ctx.save();

  // 2. Draw the Text Base (This defines the shape)
  // We draw solid opaque text first.
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic'; // vital for consistent positioning

  lines.forEach((line, i) => {
    const lineWidth = ctx.measureText(line).width;
    const lineX = (canvasWidth - lineWidth) / 2;
    const lineY = position.startY + i * position.lineHeight;
    ctx.fillText(line, lineX, lineY);
  });

  // 3. Apply the Texture ('source-in')
  // This tells canvas: "Keep the existing pixels (the text), but replace their color 
  // with the pixels from the image I'm about to draw."
  ctx.globalCompositeOperation = 'source-in';

  // --- Image Animation Math ---
  const animDuration = 100;
  const progress = (timestamp % (animDuration * 2)) / animDuration;
  const yDir = progress <= 1 ? progress : 2 - progress;
  const bgSize = canvasHeight * 5;
  const bgY = yDir * (bgSize - canvasHeight);

  // --- Optimized Image Drawing (Source Clipping) ---
  const imgAspect = styleImage.width / styleImage.height;
  const canvasAspect = canvasWidth / canvasHeight;
  const animScrollHeight = canvasHeight * 5;
  
  let drawWidth, drawHeight, drawX, drawY;
  
  if (imgAspect > canvasAspect) {
    drawHeight = animScrollHeight;
    drawWidth = drawHeight * imgAspect;
    drawX = (canvasWidth - drawWidth) / 2;
    drawY = -bgY;
  } else {
    drawWidth = canvasWidth;
    drawHeight = drawWidth / imgAspect;
    drawX = 0;
    drawY = -bgY;
  }

  // Calculate the visible slice of the source image
  const scaleX = drawWidth / styleImage.width;
  const scaleY = drawHeight / styleImage.height;

  const sx = (0 - drawX) / scaleX;
  const sy = (0 - drawY) / scaleY;
  const sw = canvasWidth / scaleX;
  const sh = canvasHeight / scaleY;

  // Draw the clipped texture. Because of 'source-in', this only appears ON the text.
  ctx.drawImage(
    styleImage, 
    sx, sy, sw, sh, 
    0, 0, canvasWidth, canvasHeight
  );

  // 4. Draw the Border ('source-over')
  // We switch back to normal drawing to add the black stroke on top.
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

/**
 * Detect LED dot positions from text
 * Uses an injected scratchpad context (auxCtx) to avoid memory thrashing.
 * * @param {object} opts
 * @param {string} opts.text
 * @param {number} opts.fontSize
 * @param {number} opts.textHeightPercent
 * @param {number} opts.squareSize - Grid size for dot detection (default 8)
 * @param {CanvasRenderingContext2D} opts.auxCtx - REUSABLE Scratchpad Context
 * @returns {Array} Array of dot objects with position and animation state
 */
export function detectLEDDots(opts) {
  
  const {
    text,
    fontSize,
    textHeightPercent,
    squareSize = 8,
    auxCtx // Received instead of factory
  } = opts;
  
  const canvasWidth = auxCtx.canvas.width
  const canvasHeight = auxCtx.canvas.height

  const fontFamily = 'Tinos';

  // 1. CLEAR the scratchpad (Reuse > Create)
  auxCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  
  // 2. Calculate position
  const { maxWidth } = calculateTextPosition(
    canvasWidth, canvasHeight, 0, fontSize, textHeightPercent
  );
  
  // Word wrapping is timed inside wrapText
  const lines = wrapText(auxCtx, text, maxWidth, fontFamily, fontSize);
  const position = calculateTextPosition(
    canvasWidth, canvasHeight, lines.length, fontSize, textHeightPercent
  );
  
  // 3. Render text to scratchpad
  auxCtx.font = `${fontSize}px ${fontFamily}`;
  auxCtx.fillStyle = '#FFFFFF';
  auxCtx.textBaseline = 'alphabetic';
  
  lines.forEach((line, i) => {
    const lineWidth = auxCtx.measureText(line).width;
    const lineX = (canvasWidth - lineWidth) / 2;
    const lineY = position.startY + i * position.lineHeight;
    auxCtx.fillText(line, lineX, lineY);
  });
  
  // 4. Scan the scratchpad
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
          colorIndex: Math.random() * 8, // colors.length
          colorSpeed: 0.05 + Math.random() * 0.1,
          brightness: Math.random()
        });
      }
    }
  }
  return detectedDots;
}

// LED color palette
const LED_COLORS = [
  '#FF0000',  // Red
  '#FF8800',  // Orange
  '#FFFF00',  // Yellow
  '#88FF00',  // Yellow-green
  '#00FF00',  // Green
  '#00FFFF',  // Cyan
  '#0088FF',  // Blue
  '#8800FF'   // Violet
];

/**
 * Render LED dots effect
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts
 * @param {Array} opts.dots - Dot array from detectLEDDots (will be mutated for animation)
 * @param {number} opts.fontSize - For calculating background padding
 * @param {number} opts.squareSize - Dot size reference (default 8)
 */
export function renderLEDEffect(ctx, opts) {
  
  const {
    dots,
    fontSize,
    squareSize = 8
  } = opts;
  
  if (!dots || dots.length === 0) {
    return;
  }
  
  // Calculate background box dimensions
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  dots.forEach(dot => {
    minX = Math.min(minX, dot.x);
    maxX = Math.max(maxX, dot.x);
    minY = Math.min(minY, dot.y);
    maxY = Math.max(maxY, dot.y);
  });
  
  // Draw rounded rectangle background
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
  
  // Animate and draw dots
  dots.forEach(dot => {
    // Update color index
    dot.colorIndex += dot.colorSpeed;
    if (dot.colorIndex >= LED_COLORS.length) {
      dot.colorIndex = 0;
    }
    
    // Pulse brightness
    dot.brightness += 0.05;
    const brightness = (Math.sin(dot.brightness) + 1) / 2 * 0.5 + 0.5;
    
    const color = LED_COLORS[Math.floor(dot.colorIndex)];
    
    ctx.fillStyle = color;
    ctx.globalAlpha = brightness;
    
    // Draw dot
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, squareSize * 0.3, 0, Math.PI * 2);
    ctx.fill();
    
    // Add glow
    ctx.globalAlpha = brightness * 0.3;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, squareSize * 0.5, 0, Math.PI * 2);
    ctx.fill();
  });
  
  ctx.globalAlpha = 1.0;
}