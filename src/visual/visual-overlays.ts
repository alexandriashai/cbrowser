/**
 * Visual Overlays — generate diagnostic overlay images for MCP tool responses.
 *
 * Each overlay takes a screenshot + analysis data and produces a
 * base64 PNG with colored annotations overlaid on the page.
 *
 * @since v18.39.0
 */

import sharp, { type OverlayOptions } from "sharp";

// ── Color helpers ──

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r},${g},${b},${(a / 255).toFixed(2)})`;
}

function scoreToColor(score: number): string {
  // 0 = red (bad), 0.5 = yellow, 1 = green (good)
  const s = Math.max(0, Math.min(1, score));
  if (s < 0.5) {
    const t = s * 2;
    return rgba(255, Math.round(255 * t), 0, 160);
  } else {
    const t = (s - 0.5) * 2;
    return rgba(Math.round(255 * (1 - t)), 255, 0, 160);
  }
}

function diffToColor(value: number): string {
  // -1 = blue (persona A stronger), 0 = transparent, +1 = red (persona B stronger)
  const v = Math.max(-1, Math.min(1, value));
  const a = Math.round(Math.abs(v) * 180);
  if (v < 0) return rgba(0, 100, 255, a);
  if (v > 0) return rgba(255, 50, 0, a);
  return rgba(0, 0, 0, 0);
}

// ── SVG overlay builder ──

interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  label?: string;
  borderColor?: string;
}

function buildSvgOverlay(
  width: number,
  height: number,
  rects: OverlayRect[],
  title?: string,
): string {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;

  for (const rect of rects) {
    svg += `<rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" fill="${rect.color}" rx="4"`;
    if (rect.borderColor) svg += ` stroke="${rect.borderColor}" stroke-width="2"`;
    svg += `/>`;

    if (rect.label) {
      const fontSize = Math.min(14, Math.max(9, rect.height * 0.4));
      svg += `<text x="${rect.x + 4}" y="${rect.y + fontSize + 2}" font-family="sans-serif" font-size="${fontSize}" fill="white" font-weight="bold" opacity="0.9">${rect.label.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`;
    }
  }

  if (title) {
    const titleW = title.length * 10 + 24;
    svg += `<rect x="10" y="10" width="${titleW}" height="32" rx="6" fill="rgba(0,0,0,0.8)"/>`;
    svg += `<text x="22" y="32" font-family="sans-serif" font-size="16" fill="white" font-weight="bold">${title}</text>`;
  }

  svg += `</svg>`;
  return svg;
}

async function compositeOverlay(screenshotPath: string, svgContent: string): Promise<string> {
  const outputBuffer = await sharp(screenshotPath)
    .grayscale()
    .modulate({ brightness: 0.75 })
    .composite([{ input: Buffer.from(svgContent), blend: "over" }])
    .png()
    .toBuffer();
  return outputBuffer.toString("base64");
}

// ── 1. Motor Accessibility Overlay ──

export interface MotorElement {
  selector: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hitProbability: number;
  isBarrier: boolean;
}

/**
 * Overlay showing hit probability per interactive element.
 * Green = easy to click, Yellow = moderate, Red = motor barrier.
 */
export async function generateMotorOverlay(
  screenshotPath: string,
  elements: MotorElement[],
  personaName: string,
  cssViewportWidth?: number,
): Promise<string> {
  const metadata = await sharp(screenshotPath).metadata();
  const width = metadata.width || 1920;
  const height = metadata.height || 1080;

  // Scale factor: CSS pixels → image pixels
  // getBoundingClientRect returns CSS px, but screenshot is device px
  const scale = cssViewportWidth ? width / cssViewportWidth : 1;

  const rects: OverlayRect[] = elements.map(el => ({
    x: Math.round(el.x * scale),
    y: Math.round(el.y * scale),
    width: Math.round(el.width * scale),
    height: Math.round(el.height * scale),
    color: scoreToColor(el.hitProbability),
    borderColor: el.isBarrier ? "rgba(255,0,0,0.8)" : undefined,
    label: `${Math.round(el.hitProbability * 100)}%`,
  }));

  const svg = buildSvgOverlay(width, height, rects, `${personaName} Motor Accessibility`);
  return compositeOverlay(screenshotPath, svg);
}

// ── 2. Attention Quality Overlay ──

export interface AttentionTarget {
  type: "cta" | "heading" | "navigation" | "content" | "decorative" | "unknown";
  x: number;
  y: number;
  width: number;
  height: number;
  saliency: number;
  label: string;
}

/**
 * Overlay showing what type of element each saliency hotspot lands on.
 * Green = CTA/heading (good), Yellow = content, Red = decorative/distractor.
 */
export async function generateAttentionQualityOverlay(
  screenshotPath: string,
  targets: AttentionTarget[],
  personaName: string,
  cssViewportWidth?: number,
): Promise<string> {
  const metadata = await sharp(screenshotPath).metadata();
  const width = metadata.width || 1920;
  const height = metadata.height || 1080;
  const scale = cssViewportWidth ? width / cssViewportWidth : 1;

  const typeColors: Record<string, string> = {
    cta: rgba(0, 220, 0, 200),
    heading: rgba(0, 150, 255, 180),
    navigation: rgba(255, 200, 0, 160),
    content: rgba(200, 200, 200, 80),
    decorative: rgba(255, 50, 0, 180),
    unknown: rgba(128, 128, 128, 120),
  };

  const rects: OverlayRect[] = targets.map(t => ({
    x: Math.round(t.x * scale),
    y: Math.round(t.y * scale),
    width: Math.round(t.width * scale),
    height: Math.round(t.height * scale),
    color: typeColors[t.type] || typeColors.unknown,
    borderColor: t.type === "cta" ? "rgba(0,255,0,1)" : t.type === "decorative" ? "rgba(255,0,0,1)" : t.type === "heading" ? "rgba(0,150,255,0.9)" : "rgba(200,200,200,0.5)",
    label: `${t.type}: ${t.label.slice(0, 25)}`,
  }));

  const svg = buildSvgOverlay(width, height, rects, `${personaName} Attention Quality`);
  return compositeOverlay(screenshotPath, svg);
}

// ── 3. Readability Overlay ──

export interface ReadabilityBlock {
  x: number;
  y: number;
  width: number;
  height: number;
  difficulty: number; // 0-1
  wpm: number;
  text: string;
}

/**
 * Overlay showing reading difficulty per text block.
 * Green = easy to read, Yellow = moderate, Red = very difficult for this persona.
 */
export async function generateReadabilityOverlay(
  screenshotPath: string,
  blocks: ReadabilityBlock[],
  personaName: string,
): Promise<string> {
  const metadata = await sharp(screenshotPath).metadata();
  const width = metadata.width || 1920;
  const height = metadata.height || 1080;

  const rects: OverlayRect[] = blocks.map(b => ({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    color: scoreToColor(1 - b.difficulty), // invert: high difficulty = red
    label: `${b.wpm} WPM`,
  }));

  const svg = buildSvgOverlay(width, height, rects, `${personaName} Readability`);
  return compositeOverlay(screenshotPath, svg);
}

// ── 4. Persona Comparison (Difference Map) ──

/**
 * Generate a difference heatmap between two persona saliency maps.
 * Blue = persona A looks here more, Red = persona B looks here more.
 */
export async function generateComparisonHeatmap(
  screenshotPath: string,
  cellsA: Float64Array | number[],
  cellsB: Float64Array | number[],
  gridRows: number,
  gridCols: number,
  personaA: string,
  personaB: string,
): Promise<string> {
  const metadata = await sharp(screenshotPath).metadata();
  const width = metadata.width || 1920;
  const height = metadata.height || 1080;

  // Normalize both
  let maxA = 0, maxB = 0;
  for (let i = 0; i < cellsA.length; i++) {
    if (cellsA[i] > maxA) maxA = cellsA[i];
    if (cellsB[i] > maxB) maxB = cellsB[i];
  }
  maxA = maxA || 1;
  maxB = maxB || 1;

  // Build difference buffer
  const buf = Buffer.alloc(width * height * 4);
  const cellW = width / gridCols;
  const cellH = height / gridRows;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gr = Math.min(Math.floor(y / cellH), gridRows - 1);
      const gc = Math.min(Math.floor(x / cellW), gridCols - 1);
      const idx = gr * gridCols + gc;

      const normA = cellsA[idx] / maxA;
      const normB = cellsB[idx] / maxB;
      const diff = normB - normA; // positive = B stronger, negative = A stronger

      const intensity = Math.abs(diff);
      const alpha = Math.round(intensity * 200);

      const px = (y * width + x) * 4;
      if (diff > 0.02) {
        // Red: persona B looks here more
        buf[px] = 255; buf[px + 1] = 50; buf[px + 2] = 0; buf[px + 3] = alpha;
      } else if (diff < -0.02) {
        // Blue: persona A looks here more
        buf[px] = 0; buf[px + 1] = 100; buf[px + 2] = 255; buf[px + 3] = alpha;
      } else {
        buf[px + 3] = 0; // transparent — similar attention
      }
    }
  }

  // Blur for smoothness
  const blurSigma = Math.max(1, Math.round(cellW * 0.6));
  const diffPng = await sharp(buf, { raw: { width, height, channels: 4 } })
    .blur(blurSigma)
    .png()
    .toBuffer();

  // Label
  const labelW = (personaA.length + personaB.length) * 8 + 80;
  const labelSvg = Buffer.from(
    `<svg width="${labelW}" height="36">
      <rect x="0" y="0" width="${labelW}" height="36" rx="6" fill="rgba(0,0,0,0.8)"/>
      <circle cx="14" cy="18" r="6" fill="rgb(0,100,255)"/>
      <text x="24" y="24" font-family="sans-serif" font-size="12" fill="white">${personaA}</text>
      <circle cx="${personaA.length * 8 + 44}" cy="18" r="6" fill="rgb(255,50,0)"/>
      <text x="${personaA.length * 8 + 54}" y="24" font-family="sans-serif" font-size="12" fill="white">${personaB}</text>
    </svg>`
  );

  const output = await sharp(screenshotPath)
    .composite([
      { input: diffPng, blend: "over" },
      { input: labelSvg, top: 10, left: 10, blend: "over" },
    ])
    .png()
    .toBuffer();

  return output.toString("base64");
}

// ── 5. Combined Story Overlay — all layers on one image ──

/**
 * Generate a single composite overlay with attention heatmap + motor annotations + quality labels.
 */
export async function generateCombinedStoryOverlay(
  screenshotPath: string,
  heatmapCells: Float64Array | number[] | null,
  heatmapRows: number,
  heatmapCols: number,
  motorElements: MotorElement[],
  qualityTargets: AttentionTarget[],
  personaName: string,
  cssViewportWidth?: number,
): Promise<string> {
  const metadata = await sharp(screenshotPath).metadata();
  const width = metadata.width || 1920;
  const height = metadata.height || 1080;
  const scale = cssViewportWidth ? width / cssViewportWidth : 1;

  const layers: OverlayOptions[] = [];

  // Layer 1: Attention heatmap (semi-transparent underneath)
  if (heatmapCells && heatmapCells.length > 0) {
    // Import heatmap buffer generator
    const { default: sharpMod } = await import("sharp");

    // Build heatmap RGBA buffer
    let maxVal = 0;
    for (let i = 0; i < heatmapCells.length; i++) {
      if (heatmapCells[i] > maxVal) maxVal = heatmapCells[i];
    }
    maxVal = maxVal || 1;

    const buf = Buffer.alloc(width * height * 4);
    const cellW = width / heatmapCols;
    const cellH = height / heatmapRows;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const gr = Math.min(Math.floor(y / cellH), heatmapRows - 1);
        const gc = Math.min(Math.floor(x / cellW), heatmapCols - 1);
        const idx = gr * heatmapCols + gc;
        const value = heatmapCells[idx] / maxVal;

        // Reduced opacity for combined view (don't overwhelm other layers)
        const alpha = Math.round(value * 120); // max 120/255 opacity
        const r = Math.round(value * 255);
        const g = Math.round((1 - Math.abs(value - 0.5) * 2) * 200);
        const b = Math.round((1 - value) * 255);

        const px = (y * width + x) * 4;
        buf[px] = r; buf[px + 1] = g; buf[px + 2] = b; buf[px + 3] = alpha;
      }
    }

    const blurSigma = Math.max(1, Math.round(cellW * 0.6));
    const heatPng = await sharp(buf, { raw: { width, height, channels: 4 } })
      .blur(blurSigma).png().toBuffer();
    layers.push({ input: heatPng, blend: "over" as const });
  }

  // Layer 2: Motor + Quality annotations as SVG
  const rects: OverlayRect[] = [];

  // Motor barriers (red borders on hard-to-click elements)
  for (const el of motorElements) {
    if (el.isBarrier) {
      rects.push({
        x: Math.round(el.x * scale), y: Math.round(el.y * scale),
        width: Math.round(el.width * scale), height: Math.round(el.height * scale),
        color: "rgba(255,0,0,0.15)",
        borderColor: "rgba(255,50,0,0.9)",
        label: `${Math.round(el.hitProbability * 100)}% hit`,
      });
    }
  }

  // Quality targets (CTA = green border, decorative = red border)
  for (const t of qualityTargets) {
    if (t.type === "cta") {
      rects.push({
        x: Math.round(t.x * scale), y: Math.round(t.y * scale),
        width: Math.round(t.width * scale), height: Math.round(t.height * scale),
        color: "rgba(0,200,0,0.12)",
        borderColor: "rgba(0,220,0,0.9)",
        label: `CTA: ${t.label.slice(0, 20)}`,
      });
    } else if (t.type === "decorative") {
      rects.push({
        x: Math.round(t.x * scale), y: Math.round(t.y * scale),
        width: Math.round(t.width * scale), height: Math.round(t.height * scale),
        color: "rgba(255,0,0,0.08)",
        borderColor: "rgba(255,100,0,0.7)",
        label: "distractor",
      });
    } else if (t.type === "heading") {
      rects.push({
        x: Math.round(t.x * scale), y: Math.round(t.y * scale),
        width: Math.round(t.width * scale), height: Math.round(t.height * scale),
        color: "rgba(0,100,255,0.08)",
        borderColor: "rgba(0,120,255,0.7)",
      });
    }
  }

  if (rects.length > 0) {
    const svg = buildSvgOverlay(width, height, rects, `${personaName} — Combined Analysis`);
    layers.push({ input: Buffer.from(svg), blend: "over" as const });
  }

  // Legend
  const legendSvg = Buffer.from(
    `<svg width="280" height="100">
      <rect x="0" y="0" width="280" height="100" rx="8" fill="rgba(0,0,0,0.8)"/>
      <circle cx="16" cy="20" r="6" fill="rgb(255,50,0)"/>
      <text x="28" y="24" font-family="sans-serif" font-size="11" fill="white">High attention</text>
      <circle cx="16" cy="40" r="6" fill="rgb(0,100,255)"/>
      <text x="28" y="44" font-family="sans-serif" font-size="11" fill="white">Low attention</text>
      <rect x="10" y="54" width="12" height="12" rx="2" stroke="rgb(0,220,0)" stroke-width="2" fill="none"/>
      <text x="28" y="64" font-family="sans-serif" font-size="11" fill="white">CTA (conversion target)</text>
      <rect x="10" y="74" width="12" height="12" rx="2" stroke="rgb(255,50,0)" stroke-width="2" fill="none"/>
      <text x="28" y="84" font-family="sans-serif" font-size="11" fill="white">Motor barrier / distractor</text>
    </svg>`
  );
  layers.push({ input: legendSvg, top: height - 110, left: 10, blend: "over" as const });

  // Desaturate base image so overlays pop (grayscale + slight darken)
  const output = await sharp(screenshotPath)
    .grayscale()
    .modulate({ brightness: 0.7 })
    .composite(layers)
    .png()
    .toBuffer();
  return output.toString("base64");
}

// ── 6. Cognitive Load Regional Heatmap ──

export interface CognitiveRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  load: number; // 0-1
  dimension: string; // "attention", "decision", "readability", etc.
}

/**
 * Overlay showing cognitive load per page region.
 * Green = low load, Red = high load for this persona.
 */
export async function generateCognitiveLoadOverlay(
  screenshotPath: string,
  regions: CognitiveRegion[],
  personaName: string,
): Promise<string> {
  const metadata = await sharp(screenshotPath).metadata();
  const width = metadata.width || 1920;
  const height = metadata.height || 1080;

  const rects: OverlayRect[] = regions.map(r => ({
    x: r.x,
    y: r.y,
    width: r.width,
    height: r.height,
    color: scoreToColor(1 - r.load),
    label: `${r.dimension}: ${Math.round(r.load * 100)}%`,
  }));

  const svg = buildSvgOverlay(width, height, rects, `${personaName} Cognitive Load`);
  return compositeOverlay(screenshotPath, svg);
}
