/**
 * The DOM-only attention path smooths at the same physical width as the
 * screenshot path (ISC-47).
 *
 * analyzeAttention halves the capture before celling, so a cell of `cellSize`
 * spans 2 x cellSize capture px and the fitted sigma (2.5 cells at 16) is 80
 * capture px. analyzeAttentionFromDOM cells the viewport at full resolution, so
 * the same sigma in cells was 40 px: half the fitted width, at every cellSize.
 *
 * The cleanest statement of the fix: on a flat capture (no colour contrast, so
 * the Lab channel contributes nothing) the two paths over the SAME 16-px cells
 * (screenshot path at cellSize 8, DOM path at cellSize 16) must produce the
 * same map. Before the fix the DOM map was visibly sharper. The second test
 * states it as spread in pixels, at three grid sizes.
 *
 * Viewport px are taken as capture px, which holds at device pixel ratio 1,
 * the tools' capture default.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeAttention, analyzeAttentionFromDOM } from "../src/visual/attention-transport.js";

const W = 1024, H = 768;
/** A 32-px target in the middle of the page, in capture (= viewport) px. Aligned to every grid tested. */
const DOT = { type: "cta", x: 512, y: 384, width: 32, height: 32, text: "go" };

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
let flatPng: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "cb-dom-gaze-width-"));
  flatPng = join(dir, "flat.png");
  const sharp = (await import("sharp")).default;
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 128, g: 128, b: 128 } } }).png().toFile(flatPng);
});

afterAll(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

describe("the DOM path smooths at the fitted physical width", () => {
  test("over the same 16-px cells, the DOM path's map equals the screenshot path's", async () => {
    const shot = await analyzeAttention(flatPng, "first-timer", 8, undefined, [DOT] as never);
    const dom = await analyzeAttentionFromDOM(W, H, [DOT] as never, "first-timer", 16);
    // Same grid, cell for cell.
    expect(shot.saliencyMap.cellSize).toBe(16);
    expect([dom.saliencyMap.rows, dom.saliencyMap.cols]).toEqual([shot.saliencyMap.rows, shot.saliencyMap.cols]);
    let maxDiff = 0;
    for (let i = 0; i < dom.saliencyMap.cells.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(dom.saliencyMap.cells[i] - shot.saliencyMap.cells[i]));
    }
    expect(maxDiff).toBeLessThan(1e-9);
  }, 60_000);

  test("same spread in pixels as the screenshot path at cellSize 4, 8 and 16", async () => {
    for (const cs of [4, 8, 16]) {
      const shot = await analyzeAttention(flatPng, "first-timer", cs, undefined, [DOT] as never);
      const dom = await analyzeAttentionFromDOM(W, H, [DOT] as never, "first-timer", cs);
      const s = spreadPx(shot.saliencyMap.cells, shot.saliencyMap.rows, shot.saliencyMap.cols, shot.saliencyMap.cellSize);
      const d = spreadPx(dom.saliencyMap.cells, dom.saliencyMap.rows, dom.saliencyMap.cols, cs);
      expect(Math.abs(d.x - s.x) / s.x).toBeLessThan(0.05);
      expect(Math.abs(d.y - s.y) / s.y).toBeLessThan(0.05);
    }
  }, 120_000);
});
