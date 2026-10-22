/**
 * The foveal smoothing keeps its fitted width in pixels at every grid size.
 *
 * GAZE_CALIBRATION.sigmaCells (2.5) was fitted by research/study1 at cellSize
 * 16 (run-optimize.ts, CELL = 16), and the blur ran in CELLS. attention_analysis
 * defaults to cellSize 4, where 2.5 cells is a quarter of the width that was
 * fitted: the shipped heatmap was smoothed at 1/4 of its calibration, and every
 * other caller (journey_heatmap_gif at 8, the story at 4, empathy_audit at 16)
 * at its own fraction of it.
 *
 * The input is one 16px square, which is one cell at 16, 2x2 at 8 and 4x4 at 4,
 * so the same physical stimulus at three resolutions. Its smoothed spread,
 * measured in pixels, must not depend on the resolution.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as attention from "../src/visual/attention-transport.js";

const { analyzeAttention, analyzeAttentionFromDOM, GAZE_CALIBRATION } = attention;

const W = 512, H = 384;
/** One 16px square in the middle of the frame. Aligned to every grid tested. */
const DOT = { type: "cta", x: 256, y: 192, width: 16, height: 16, text: "go" };
const SIZES = [4, 8, 16] as const;

/** Standard deviation of the map along each axis, in pixels, from cell centres. */
function spreadPx(cells: Float64Array, rows: number, cols: number, cellPx: number): { x: number; y: number } {
  let t = 0, mx = 0, my = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = cells[r * cols + c];
    t += v; mx += (c + 0.5) * cellPx * v; my += (r + 0.5) * cellPx * v;
  }
  mx /= t; my /= t;
  let vx = 0, vy = 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = cells[r * cols + c];
    vx += ((c + 0.5) * cellPx - mx) ** 2 * v;
    vy += ((r + 0.5) * cellPx - my) ** 2 * v;
  }
  return { x: Math.sqrt(vx / t), y: Math.sqrt(vy / t) };
}

let dir: string;
let uniformPng: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "cb-gaze-scale-"));
  uniformPng = join(dir, "uniform.png");
  // computeLabSaliency halves the image, so a 1024x768 capture is analysed at
  // 512x384 and the DOT's coordinates are in that half-resolution space. A flat
  // image has no colour contrast, which leaves the semantic DOT as the only
  // stimulus in the blend.
  const sharp = (await import("sharp")).default;
  await sharp({ create: { width: W * 2, height: H * 2, channels: 3, background: { r: 128, g: 128, b: 128 } } })
    .png().toFile(uniformPng);
});

afterAll(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

describe("gaze smoothing is constant in pixels, not in cells", () => {
  test("analyzeAttentionFromDOM: same physical spread at cellSize 4, 8 and 16", async () => {
    const spreads = [];
    for (const cs of SIZES) {
      const a = await analyzeAttentionFromDOM(W, H, [DOT] as never, "first-timer", cs);
      spreads.push(spreadPx(a.saliencyMap.cells, a.saliencyMap.rows, a.saliencyMap.cols, cs));
    }
    const ref = spreads[2];
    for (const s of spreads.slice(0, 2)) {
      expect(Math.abs(s.x - ref.x) / ref.x).toBeLessThan(0.05);
      expect(Math.abs(s.y - ref.y) / ref.y).toBeLessThan(0.05);
    }
  });

  test("analyzeAttention: same physical spread at cellSize 4, 8 and 16", async () => {
    const spreads = [];
    for (const cs of SIZES) {
      const a = await analyzeAttention(uniformPng, "first-timer", cs, undefined, [DOT] as never);
      // The map's own cellSize is reported in capture pixels (2x the grid's).
      spreads.push(spreadPx(a.saliencyMap.cells, a.saliencyMap.rows, a.saliencyMap.cols, a.saliencyMap.cellSize));
    }
    const ref = spreads[2];
    for (const s of spreads.slice(0, 2)) {
      expect(Math.abs(s.x - ref.x) / ref.x).toBeLessThan(0.05);
      expect(Math.abs(s.y - ref.y) / ref.y).toBeLessThan(0.05);
    }
  }, 60_000);

  test("the fitted grid is the reference: sigma at cellSize 16 is exactly the fitted 2.5 cells", () => {
    // The Study 1 numbers (v20, 2026-10-21) were measured at 16; anything but an
    // exact 2.5 there would move them. Smoothing is deterministic in sigma, so
    // an identical sigma is an identical map.
    const { gazeSigmaCells, GAZE_CALIBRATION_CELL_SIZE } = attention as unknown as {
      gazeSigmaCells: (cellSize: number) => number; GAZE_CALIBRATION_CELL_SIZE: number;
    };
    expect(GAZE_CALIBRATION_CELL_SIZE).toBe(16);
    expect(Object.is(gazeSigmaCells(16), GAZE_CALIBRATION.sigmaCells)).toBe(true);
    expect(gazeSigmaCells(4)).toBe(10);
    expect(gazeSigmaCells(8)).toBe(5);
  });
});
