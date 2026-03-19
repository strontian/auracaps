---
name: text-effect-prototype
description: Use this skill when the user asks to create a new text effect, prototype a text effect, or experiment with text visuals. Guides creation of standalone HTML prototype pages in the experiments directory.
---

# Text Effect Prototype Skill

Prototypes live in `public/experiments/` as self-contained HTML files. Each experiment is a single page with no external dependencies beyond CDN-hosted libraries.

## Patterns from existing experiments

Study the existing experiments before building — they establish the conventions:

- `neon.html` — Canvas 2D with word-by-word animation, SRT timing, custom glow/shadow rendering
- `gold.html` — Three.js with 3D TextGeometry, PBR materials (metalness/roughness), dynamic lights
- `bevel.html` — PixiJS + pixi-filters for GPU-accelerated 2D filter effects
- `space.html` — Three.js with environment maps and lighting controls
- `blend.html`, `grad.html` — CSS/canvas gradient and blending experiments

## Structure every prototype should follow

1. **Single HTML file** — all CSS, JS, and markup inline. No build step, no imports from local files.
2. **Live controls panel** — sliders, color pickers, checkboxes for every tunable parameter. Position it top-right or top-left, dark semi-transparent background. Show live value readouts next to sliders.
3. **Sensible defaults** — the effect should look good on load without touching any controls.
4. **Sample text** — use placeholder text like "Hello World" or "AURACAPS" unless the user specifies otherwise.
5. **Dark background** — `#000`, `#0a0a0a`, or `#1a1a1a` as default.

## Rendering approaches (pick the right tool)

- **Canvas 2D** — best for 2D animated effects, per-word timing, glow/shadow, pixel manipulation
- **Three.js** — best for 3D text (TextGeometry), reflections, metallic/glass materials, lighting rigs. Load via importmap from `https://cdn.jsdelivr.net/npm/three@0.170.0/`
- **PixiJS** — best for GPU-accelerated 2D filters (bevel, bloom, displacement). Load v6 from cdnjs + pixi-filters v4 from jsdelivr
- **CSS only** — gradients, blend modes, clip-path, text-stroke when no animation is needed

## Controls panel conventions

```html
<div id="controls" style="position:absolute; top:20px; right:20px; width:260px;
     background:rgba(0,0,0,0.8); padding:20px; border-radius:8px; z-index:100;
     border:1px solid #333;">
  <!-- group each parameter -->
  <div style="margin-bottom:12px;">
    <label style="display:flex; justify-content:space-between; font-size:12px; color:#aaa; text-transform:uppercase; letter-spacing:1px;">
      <span>Parameter Name</span>
      <span id="val-param">default</span>
    </label>
    <input type="range" id="param" min="0" max="1" step="0.01" value="0.5" style="width:100%">
  </div>
</div>
```

## Font loading

- Google Fonts: add `<link href="https://fonts.googleapis.com/css2?family=FontName&display=swap">` and wait for `document.fonts.load(...)` before rendering
- Three.js fonts: load from `https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/`

## Naming

Save as `public/experiments/<descriptive-name>.html` using kebab-case.

## After creating the file

Always add the new experiment to `public/experiments/index.html`. Find the `demos` array in the script and insert a new entry in alphabetical order by name:

```js
{ name: 'my effect', file: 'my-effect.html' },
```

The `name` field is the display label in the sidebar (lowercase, human-readable). The `file` field is the filename.
