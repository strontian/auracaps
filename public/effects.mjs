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

export function calculateTextPosition(canvasHeight, lineCount, fontSize, textHeightPercent) {
  const lineHeight = fontSize * 1.2;
  const totalTextHeight = lineCount * lineHeight;
  const textVerticalRange = canvasHeight - totalTextHeight - fontSize * 0.8;
  const invertedPercent = 100 - textHeightPercent;
  const startY = (textVerticalRange * invertedPercent / 100) + fontSize * 1.6;
  
  return { startY, lineHeight };
}

/**
 * Draws the text in white to act as a stencil/mask.
 * Returns the layout data (lines, position) so the caller can draw strokes later if needed.
 */
export function stampText(ctx, text, fontSize, fontFamily, textHeightPercent) {
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;
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
  ctx.restore();

  // Return layout data for subsequent stroking/outlining
  return { lines, position };
}

export function renderRainbowEffect(ctx, opts) {
  const {
    text,
    fontSize,
    textHeightPercent,
    state = {},
    auxCanvas
  } = opts;

  if (!auxCanvas) {
    throw new Error("renderRainbowEffect requires an 'auxCanvas' argument.");
  }

  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;
  const fontFamily = 'Modak';

  // Get the context of the passed scratchpad canvas
  const offCtx = auxCanvas.getContext('2d');

  // --- Initialize Particle State (No Text Memoization) ---
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

  // --- STEP 1: Draw Particles to the passed AUX Canvas ---
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

  // --- STEP 2: Stamp the Text (Create Stencil) ---
  // We capture the layout data returned by stampText to use for the stroke later
  const layout = stampText(ctx, text, fontSize, fontFamily, textHeightPercent);

  // --- STEP 3: Composite Particles into Text ---
  ctx.save();
  ctx.globalCompositeOperation = 'source-in';
  ctx.drawImage(auxCanvas, 0, 0);
  ctx.restore();

  // --- STEP 4: Draw Outline (using cached layout) ---
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 2;
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  layout.lines.forEach((line, i) => {
    const lineWidth = ctx.measureText(line).width;
    const lineX = (canvasWidth - lineWidth) / 2;
    const lineY = layout.position.startY + i * layout.position.lineHeight;
    ctx.strokeText(line, lineX, lineY);
  });

  ctx.restore();
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
  const fontFamily = 'DynaPuff';
  
  // --- STEP 1: Stamp the Text (Create Stencil) ---
  const layout = stampText(ctx, text, fontSize, fontFamily, textHeightPercent);

  // --- STEP 2: Calculate Background Scroll ---
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

  // --- STEP 3: Composite Image into Text ---
  ctx.save();
  ctx.globalCompositeOperation = 'source-in';
  
  ctx.drawImage(
    styleImage, 
    sx, sy, sw, sh, 
    0, 0, canvasWidth, canvasHeight
  );
  ctx.restore();

  // --- STEP 4: Draw Outline (using cached layout) ---
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 2;
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  layout.lines.forEach((line, i) => {
    const lineWidth = ctx.measureText(line).width;
    const lineX = (canvasWidth - lineWidth) / 2;
    const lineY = layout.position.startY + i * layout.position.lineHeight;
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

  // --- STEP 1: Prepare Aux Canvas ---
  auxCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  
  // --- STEP 2: Stamp Text for Detection ---
  // We don't need the return value here, just the pixel data
  stampText(auxCtx, text, fontSize, fontFamily, textHeightPercent);
  
  // --- STEP 3: Analyze Pixels ---
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
export function renderNeonEffect(ctx, opts) {
  const {
    text,
    allWords = null,
    words = null,
    subtitle = null,
    timestamp = null,
    fontSize,
    textHeightPercent,
    tubeColor = '#00f7ff',
    haloColor = '#0051ff'
  } = opts;

  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;
  const fontFamily = 'Beon';

  // --- HELPER: Convert Hex to RGB numbers (e.g., "0, 247, 255") ---
  const hexToRgb = (hex) => {
    const cleanHex = hex.replace('#', '');
    const bigint = parseInt(cleanHex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r}, ${g}, ${b}`;
  };

  const tubeRgb = hexToRgb(tubeColor);
  const haloRgb = hexToRgb(haloColor);

  // --- 1. PRE-PROCESS WORDS/TIMING (Same as before) ---
  let processedWords = words; 

  if (allWords && subtitle && timestamp !== null) {
    const blockWords = allWords.filter(w =>
      w.start >= subtitle.startTime - 0.05 &&
      w.start < subtitle.endTime + 0.05
    );

    processedWords = blockWords.map(w => {
      const attackDuration = 0.15;
      const decayDuration = 0.3;
      let alpha = 0.05; // Base level

      if (timestamp >= w.start && timestamp <= w.end) {
        const timeSinceStart = timestamp - w.start;
        if (timeSinceStart < attackDuration) {
          const progress = timeSinceStart / attackDuration;
          alpha = 0.05 + ((1.0 - 0.05) * progress);
        } else {
          alpha = 1.0;
        }
      } else if (timestamp > w.end && timestamp < (w.end + decayDuration)) {
        const timeSinceEnd = timestamp - w.end;
        const progress = timeSinceEnd / decayDuration;
        alpha = 1.0 - ((1.0 - 0.05) * progress);
      }

      return {
        text: w.punctuated_word || w.word,
        alpha: Math.max(0.05, Math.min(1.0, alpha))
      };
    });
  }

  // --- 2. LAYOUT CALCULATION ---
  const padding = 50;
  const maxWidth = canvasWidth - (padding * 2);

  ctx.font = `${fontSize}px ${fontFamily}`;
  const lines = wrapText(ctx, text, maxWidth, fontFamily, fontSize);
  
  const position = calculateTextPosition(
    canvasHeight, lines.length, fontSize, textHeightPercent
  );

  // --- 3. RENDER LOOP ---
  ctx.save();
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textBaseline = 'alphabetic'; 

  let wordIndex = 0;

  lines.forEach((line, lineIdx) => {
    const lineWidth = ctx.measureText(line).width; 
    let currentX = (canvasWidth - lineWidth) / 2;
    const currentY = position.startY + (lineIdx * position.lineHeight);

    const lineWords = line.split(' ');

    lineWords.forEach((wText) => {
      // Get word data
      const wordData = processedWords ? (processedWords[wordIndex] || { text: wText, alpha: 0 }) : { text: wText, alpha: 0 };
      const alpha = wordData.alpha;

      // --- DRAW STEP 1: The "Off" State (Wire) ---
      // Drawn fully opaque, but dark grey.
      ctx.fillStyle = 'rgba(0,0,0,0)'; 
      ctx.strokeStyle = '#222'; 
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeText(wText, currentX, currentY);

      // --- DRAW STEP 2: The "On" State (Glow) ---
      // We perform a check for very low alpha purely for performance optimization,
      // but the visual fade is handled by the rgba string below.
      if (alpha > 0.01) {
        ctx.save();
        
        // Use 'lighter' to make overlapping layers glow brighter
        ctx.globalCompositeOperation = 'lighter';

        // NOTE: We do NOT set ctx.globalAlpha. 
        // We inject 'alpha' directly into the colors to fix Safari shadow bugs.

        // A. Outer Halo (Fill + Wide Shadow)
        ctx.shadowColor = `rgba(${haloRgb}, ${alpha})`; 
        ctx.shadowBlur = 30;
        ctx.fillStyle = `rgba(${haloRgb}, ${alpha})`;
        ctx.fillText(wText, currentX, currentY);

        // B. Core Glow (Stroke + Tight Shadow)
        ctx.shadowColor = `rgba(${tubeRgb}, ${alpha})`; 
        ctx.shadowBlur = 10;
        ctx.strokeStyle = `rgba(${tubeRgb}, ${alpha})`; 
        ctx.lineWidth = 4;
        ctx.strokeText(wText, currentX, currentY);

        // C. White Filament (Hot Center)
        // Only draw this when the light is getting bright (alpha > 0.5)
        // to simulate the bulb heating up to white-hot.
        if (alpha > 0.5) {
          ctx.shadowBlur = 5;
          // We scale the white alpha so it fades in smoothly starting at 0.5
          // (Math to map 0.5->1.0 input to 0.0->1.0 output)
          const whiteAlpha = (alpha - 0.5) * 2; 
          
          ctx.strokeStyle = `rgba(255, 255, 255, ${whiteAlpha})`; 
          ctx.lineWidth = 2;
          ctx.strokeText(wText, currentX, currentY);

          // Extra hot white core for 100% brightness
          if (alpha > 0.9) {
             ctx.strokeStyle = `rgba(255, 255, 255, ${whiteAlpha})`; 
             ctx.lineWidth = 1;
             ctx.strokeText(wText, currentX, currentY);
          }
        }

        ctx.restore();
      }

      currentX += ctx.measureText(wText).width + ctx.measureText(' ').width;
      wordIndex++;
    });
  });

  ctx.restore();
}