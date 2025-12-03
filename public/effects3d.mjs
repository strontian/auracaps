import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';

let threeRenderer = null;
let threeScene = null;
let threeCamera = null;
let galaxyTexture = null;
let threeFont = null;
let textMeshes = [];
let currentText3D = '';

// Create galaxy texture
function createGalaxyTexture() {
  const textureCanvas = document.createElement('canvas');
  const textureCtx = textureCanvas.getContext('2d');
  textureCanvas.width = 512;
  textureCanvas.height = 512;

  // Galaxy gradient
  const gradient = textureCtx.createRadialGradient(256, 256, 0, 256, 256, 400);
  gradient.addColorStop(0, '#4a148c');
  gradient.addColorStop(0.5, '#1a237e');
  gradient.addColorStop(1, '#000000');
  textureCtx.fillStyle = gradient;
  textureCtx.fillRect(0, 0, textureCanvas.width, textureCanvas.height);

  // Stars
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * textureCanvas.width;
    const y = Math.random() * textureCanvas.height;
    const size = Math.random() * 2;
    textureCtx.fillStyle = `rgba(255, 255, 255, ${Math.random()})`;
    textureCtx.beginPath();
    textureCtx.arc(x, y, size, 0, Math.PI * 2);
    textureCtx.fill();
  }

  // Nebula clouds
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * textureCanvas.width;
    const y = Math.random() * textureCanvas.height;
    const nebula = textureCtx.createRadialGradient(x, y, 0, x, y, 100);
    const colors = ['rgba(138, 43, 226, 0.3)', 'rgba(75, 0, 130, 0.3)', 'rgba(255, 20, 147, 0.3)'];
    nebula.addColorStop(0, colors[i % colors.length]);
    nebula.addColorStop(1, 'rgba(0, 0, 0, 0)');
    textureCtx.fillStyle = nebula;
    textureCtx.fillRect(0, 0, textureCanvas.width, textureCanvas.height);
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.05, 0.05);

  return texture;
}

// Initialize Three.js scene
export function initThreeJS(container, videoWidth, videoHeight) {
  // Scene
  threeScene = new THREE.Scene();
  
  // Camera - orthographic for better text layout control
  const aspect = videoWidth / videoHeight;
  const frustumSize = 100;
  threeCamera = new THREE.OrthographicCamera(
    frustumSize * aspect / -2,
    frustumSize * aspect / 2,
    frustumSize / 2,
    frustumSize / -2,
    0.1,
    1000
  );
  threeCamera.position.z = 50;

  // Create galaxy texture
  galaxyTexture = createGalaxyTexture();

  // Add lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  threeScene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(10, 10, 10);
  threeScene.add(directionalLight);

  const pointLight = new THREE.PointLight(0xff00ff, 1, 100);
  pointLight.position.set(-20, 10, 20);
  threeScene.add(pointLight);

  const pointLight2 = new THREE.PointLight(0x00ffff, 1, 100);
  pointLight2.position.set(20, -10, 20);
  threeScene.add(pointLight2);

  // Renderer
  threeRenderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: true
  });
  threeRenderer.setSize(videoWidth, videoHeight);
  threeRenderer.setClearColor(0x000000, 0); // Transparent background
  container.appendChild(threeRenderer.domElement);

  // Load font
  const loader = new FontLoader();
  return new Promise((resolve) => {
    loader.load('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/helvetiker_bold.typeface.json', function(font) {
      threeFont = font;
      console.log('Three.js font loaded');
      resolve();
    });
  });
}

// Measure text width in Three.js units
function measureTextWidth(word, size) {
  const geometry = new TextGeometry(word, {
    font: threeFont,
    size: size,
    depth: size / 5,
    curveSegments: 8,
    bevelEnabled: true,
    bevelThickness: size / 15,
    bevelSize: size / 20,
    bevelOffset: 0,
    bevelSegments: 3
  });
  geometry.computeBoundingBox();
  const width = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
  geometry.dispose();
  return width;
}

// Word wrap text to fit within maxWidth (in Three.js units)
function wrapText3D(text, size, maxWidth) {
  const words = text.trim().split(/\s+/);
  const lines = [];
  let currentLine = [];
  let currentWidth = 0;
  const spaceWidth = size * 0.5;
  
  for (const word of words) {
    const wordWidth = measureTextWidth(word, size);
    const testWidth = currentWidth + (currentLine.length > 0 ? spaceWidth : 0) + wordWidth;
    
    if (testWidth > maxWidth && currentLine.length > 0) {
      // Start new line
      lines.push(currentLine);
      currentLine = [word];
      currentWidth = wordWidth;
    } else {
      currentLine.push(word);
      currentWidth = testWidth;
    }
  }
  
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }
  
  return lines;
}

// Create or update 3D text
export function update3DText(text, fontSize, textHeightPercent, videoWidth, videoHeight) {
  if (!threeFont || !text || text === currentText3D) return;
  
  // Remove old text meshes
  textMeshes.forEach(mesh => {
    threeScene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
  textMeshes = [];

  // Calculate size - much smaller scale factor
  const aspect = videoWidth / videoHeight;
  const frustumSize = 100;
  const frustumWidth = frustumSize * aspect;
  
  // Use similar sizing logic to 2D effects
  const scale = Math.min(videoWidth, videoHeight) / 1000; // Reduced from /500
  const size = (fontSize / 20) * scale; // Reduced from /10
  
  // Calculate max width (80% of frustum width, leaving padding)
  const maxWidth = frustumWidth * 0.8;
  
  // Word wrap the text
  const lines = wrapText3D(text, size, maxWidth);
  
  const textMaterial = new THREE.MeshStandardMaterial({
    map: galaxyTexture,
    roughness: 0.3,
    metalness: 0.2
  });

  // Calculate line height
  const lineHeight = size * 1.5;
  const totalHeight = lines.length * lineHeight;
  
  // Position based on textHeightPercent (inverted: 100 = top, 0 = bottom)
  const yRange = frustumSize * 0.8;
  const baseY = ((100 - textHeightPercent) / 100 - 0.5) * yRange;
  
  // Start Y position (top of text block)
  const startY = baseY + totalHeight / 2;

  // Create meshes for each line
  lines.forEach((lineWords, lineIndex) => {
    const lineY = startY - (lineIndex * lineHeight);
    
    // Create geometries for all words in this line
    const wordGeometries = lineWords.map(word => {
      return new TextGeometry(word, {
        font: threeFont,
        size: size,
        depth: size / 5,
        curveSegments: 8,
        bevelEnabled: true,
        bevelThickness: size / 15,
        bevelSize: size / 20,
        bevelOffset: 0,
        bevelSegments: 3
      });
    });
    
    // Measure word widths
    const spacing = size * 0.5;
    const wordWidths = wordGeometries.map(geom => {
      geom.computeBoundingBox();
      return geom.boundingBox.max.x - geom.boundingBox.min.x;
    });
    
    // Calculate total line width
    const lineWidth = wordWidths.reduce((sum, w) => sum + w, 0) + spacing * (lineWords.length - 1);
    
    // Center the line
    let currentX = -lineWidth / 2;
    
    wordGeometries.forEach((geometry, wordIndex) => {
      const wordMesh = new THREE.Mesh(geometry, textMaterial.clone());
      
      // Center the geometry
      geometry.center();
      
      // Position this word
      wordMesh.position.x = currentX + wordWidths[wordIndex] / 2;
      wordMesh.position.y = lineY;
      wordMesh.position.z = 0;
      
      threeScene.add(wordMesh);
      textMeshes.push(wordMesh);
      
      // Move to next word position
      currentX += wordWidths[wordIndex] + spacing;
    });
  });

  currentText3D = text;
}

// Clear 3D text
export function clear3DText() {
  textMeshes.forEach(mesh => {
    threeScene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
  textMeshes = [];
  currentText3D = '';
}

// Render Three.js scene
export function render3DScene() {
  if (!threeRenderer || !threeScene || !threeCamera) return;
  threeRenderer.render(threeScene, threeCamera);
}

// Check if Three.js is initialized
export function isThreeInitialized() {
  return threeRenderer !== null && threeFont !== null;
}

// Cleanup
export function disposeThreeJS() {
  if (threeRenderer) {
    threeRenderer.dispose();
    threeRenderer = null;
  }
  textMeshes.forEach(mesh => {
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
  });
  textMeshes = [];
  threeScene = null;
  threeCamera = null;
  galaxyTexture = null;
  threeFont = null;
  currentText3D = '';
}