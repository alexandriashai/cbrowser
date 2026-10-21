/**
 * Heatmap Overlay Generator
 *
 * Generates heatmap PNG overlays from saliency/attention data.
 * Returns base64-encoded images for inline display in MCP responses.
 *
 * @since v18.39.0
 */

import sharp, { type OverlayOptions } from "sharp";
import { readFileSync } from "fs";

// Heatmap color palette — blue (low) → green → yellow → red (high)
const HEATMAP_COLORS: [number, number, number][] = [
  [0, 0, 128],     // 0.0 — dark blue
  [0, 0, 255],     // 0.1 — blue
  [0, 128, 255],   // 0.2 — light blue
  [0, 255, 255],   // 0.3 — cyan
  [0, 255, 128],   // 0.4 — green-cyan
  [0, 255, 0],     // 0.5 — green
  [128, 255, 0],   // 0.6 — yellow-green
  [255, 255, 0],   // 0.7 — yellow
  [255, 128, 0],   // 0.8 — orange
  [255, 0, 0],     // 0.9 — red
  [128, 0, 0],     // 1.0 — dark red
];

function getHeatColor(value: number): [number, number, number, number] {
  const v = Math.max(0, Math.min(1, value));
  const idx = v * (HEATMAP_COLORS.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, HEATMAP_COLORS.length - 1);
  const t = idx - lo;

  const r = Math.round(HEATMAP_COLORS[lo][0] * (1 - t) + HEATMAP_COLORS[hi][0] * t);
  const g = Math.round(HEATMAP_COLORS[lo][1] * (1 - t) + HEATMAP_COLORS[hi][1] * t);
  const b = Math.round(HEATMAP_COLORS[lo][2] * (1 - t) + HEATMAP_COLORS[hi][2] * t);
  // Alpha: transparent for low values, opaque for high
  const a = Math.round(v * 180 + 20); // 20-200 range

  return [r, g, b, a];
}

/**
 * Generate a heatmap overlay from a grid of values.
 *
 * @param cells - 1D array of values (0-1), row-major order
 * @param gridRows - number of rows in the grid
 * @param gridCols - number of columns in the grid
 * @param targetWidth - output image width
 * @param targetHeight - output image height
 * @returns Raw RGBA buffer at target dimensions
 */
function generateHeatmapBuffer(
  cells: Float64Array | number[],
  gridRows: number,
  gridCols: number,
  targetWidth: number,
  targetHeight: number,
): Buffer {
  // Normalize cells to 0-1
  let maxVal = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] > maxVal) maxVal = cells[i];
  }
  if (maxVal === 0) maxVal = 1;

  const buf = Buffer.alloc(targetWidth * targetHeight * 4);
  const cellW = targetWidth / gridCols;
  const cellH = targetHeight / gridRows;

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const gridRow = Math.min(Math.floor(y / cellH), gridRows - 1);
      const gridCol = Math.min(Math.floor(x / cellW), gridCols - 1);
      const cellIdx = gridRow * gridCols + gridCol;
      const value = cells[cellIdx] / maxVal;

      const [r, g, b, a] = getHeatColor(value);
      const px = (y * targetWidth + x) * 4;
      buf[px] = r;
      buf[px + 1] = g;
      buf[px + 2] = b;
      buf[px + 3] = a;
    }
  }

  return buf;
}

/**
 * Generate a heatmap overlay on top of a screenshot.
 *
 * @param screenshotPath - Path to the base screenshot
 * @param cells - Saliency/attention values (0-1), row-major
 * @param gridRows - Grid rows
 * @param gridCols - Grid columns
 * @param label - Label text for the heatmap (e.g., "ADHD Attention")
 * @returns Base64-encoded PNG
 */
export async function generateHeatmapOverlay(
  screenshotPath: string,
  cells: Float64Array | number[],
  gridRows: number,
  gridCols: number,
  label?: string,
): Promise<string> {
  // Get screenshot dimensions
  const metadata = await sharp(screenshotPath).metadata();
  const width = metadata.width || 1920;
  const height = metadata.height || 1080;

  // Generate heatmap RGBA buffer
  const heatBuf = generateHeatmapBuffer(cells, gridRows, gridCols, width, height);

  // Convert heatmap buffer to PNG with Gaussian blur for smooth appearance
  // Blur radius scales with cell size — larger cells get more blur to eliminate blockiness
  const cellW = width / gridCols;
  const blurSigma = Math.max(1, Math.round(cellW * 0.6));
  const heatmapPng = await sharp(heatBuf, {
    raw: { width, height, channels: 4 },
  }).blur(blurSigma).png().toBuffer();

  // Build composite layers
  const layers: OverlayOptions[] = [
    { input: heatmapPng, blend: "over" as const },
  ];

  // Add label if provided
  if (label) {
    const escapedLabel = label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const labelWidth = escapedLabel.length * 11 + 24;
    const labelSvg = Buffer.from(
      `<svg width="${labelWidth}" height="36">
        <rect x="0" y="0" width="${labelWidth}" height="36" rx="6" fill="rgba(0,0,0,0.75)"/>
        <text x="12" y="24" font-family="sans-serif" font-size="16" fill="white" font-weight="bold">${escapedLabel}</text>
      </svg>`
    );
    layers.push({ input: labelSvg, top: 10, left: 10, blend: "over" as const });
  }

  // Grayscale + darken base so heatmap colors pop
  const outputBuffer = await sharp(screenshotPath)
    .grayscale()
    .modulate({ brightness: 0.7 })
    .composite(layers)
    .png()
    .toBuffer();

  return outputBuffer.toString("base64");
}

/**
 * Generate a simple heatmap image (no screenshot overlay).
 *
 * @param cells - Values (0-1), row-major
 * @param gridRows - Grid rows
 * @param gridCols - Grid columns
 * @param width - Output width
 * @param height - Output height
 * @returns Base64-encoded PNG
 */
export async function generateHeatmapImage(
  cells: Float64Array | number[],
  gridRows: number,
  gridCols: number,
  width: number = 960,
  height: number = 540,
): Promise<string> {
  const heatBuf = generateHeatmapBuffer(cells, gridRows, gridCols, width, height);
  const outputBuffer = await sharp(heatBuf, {
    raw: { width, height, channels: 4 },
  }).png().toBuffer();
  return outputBuffer.toString("base64");
}
