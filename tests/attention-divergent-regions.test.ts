/**
 * attention_compare locates divergence as regions, each with its share.
 *
 * Reported: every divergentRegions entry read divergence 0.0001 or 0.0002, and
 * the five regions were five adjacent cells of one hotspot.
 *
 *   - the per-cell value was |pA - pB| on maps normalized over ~16,000 cells at
 *     the tool's grid, so every value was ~1/16,000 and rounded to 4 decimals it
 *     quantized to 0.0001-0.0002. The comment beside it called it a "share of
 *     attentionDivergence"; it was never divided by attentionDivergence.
 *   - regions were the top single cells, unclustered. Foveal smoothing makes
 *     neighbours near-identical, so the top cells were one hotspot.
 *
 * rankDivergentRegions groups same-sign cells into 8-connected regions and
 * reports each region's share of the total.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import fc from "fast-check";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import * as at from "../src/visual/attention-transport.js";

type Region = {
  row: number; col: number; x: number; y: number;
  bbox: { x: number; y: number; width: number; height: number };
  cellCount: number; direction: "personaA" | "personaB";
  attentionA: number; attentionB: number;
  saliencyA: number; saliencyB: number; divergence: number;
};
type Rank = (a: ArrayLike<number>, b: ArrayLike<number>, rows: number, cols: number, cellSize: number) =>
  { divergence: number; regions: Region[] };
// Through the namespace so a missing export fails each assertion, not the import.
const rank: Rank = (...args) => (at as unknown as { rankDivergentRegions: Rank }).rankDivergentRegions(...args);

const ROWS = 20, COLS = 20;

/** A 20x20 map at `base`, with each rect [r0, c0, r1, c1] (inclusive) set to `value`. */
function map(base: number, rects: Array<[number, number, number, number]>, value = 1): Float64Array {
  const m = new Float64Array(ROWS * COLS).fill(base);
  for (const [r0, c0, r1, c1] of rects) {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) m[r * COLS + c] = value;
  }
  return m;
}

/** Two regions of the same direction whose peak cells touch (or coincide) were split from one area. */
function sameDirectionPeaksTouch(regions: Array<Partial<Region> & { row: number; col: number }>): boolean {
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const a = regions[i], b = regions[j];
      if (a.direction !== b.direction) continue;
      if (Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= 1) return true;
    }
  }
  return false;
}

describe("rankDivergentRegions on a two-blob map", () => {
  // A attends to a big 5x5 blob and a small 2x2 blob; B is uniform.
  const a = map(0.01, [[2, 2, 6, 6], [14, 14, 15, 15]]);
  const b = map(0.05, []);

  test("exactly two regions, one per blob", () => {
    const { regions } = rank(a, b, ROWS, COLS, 8);
    expect(regions.length).toBe(2);
    expect(regions.map((r) => r.cellCount)).toEqual([25, 4]);
    expect(regions.every((r) => r.direction === "personaA")).toBe(true);
  });

  test("the larger blob ranks first with the larger share", () => {
    const { regions } = rank(a, b, ROWS, COLS, 8);
    expect(regions[0].divergence).toBeGreaterThan(regions[1].divergence);
    expect(regions[0].bbox).toEqual({ x: 16, y: 16, width: 40, height: 40 });
    expect(regions[1].bbox).toEqual({ x: 112, y: 112, width: 16, height: 16 });
  });

  test("divergence is a share of the total, not a per-cell sliver", () => {
    // 25 of the 29 blob cells carry half the L1 distance between them: ~0.431.
    const { divergence, regions } = rank(a, b, ROWS, COLS, 8);
    expect(regions[0].divergence).toBeCloseTo(0.431, 2);
    expect(regions[1].divergence).toBeCloseTo(0.069, 2);
    expect(divergence).toBeGreaterThan(1.6);
  });

  test("no two returned regions are adjacent", () => {
    const { regions } = rank(a, b, ROWS, COLS, 8);
    expect(sameDirectionPeaksTouch(regions)).toBe(false);
    const [r0, r1] = regions.map((r) => r.bbox);
    const gapX = Math.max(r0.x, r1.x) - Math.min(r0.x + r0.width, r1.x + r1.width);
    const gapY = Math.max(r0.y, r1.y) - Math.min(r0.y + r0.height, r1.y + r1.height);
    expect(Math.max(gapX, gapY)).toBeGreaterThan(0);
  });

  test("attentionA/B are each persona's share of its own attention in the region", () => {
    // A: 25 of 29 bright cells plus a dim background (total 32.71); B: 25/400.
    const { regions } = rank(a, b, ROWS, COLS, 8);
    expect(regions[0].attentionA).toBeCloseTo(25 / 32.71, 2);
    expect(regions[0].attentionB).toBeCloseTo(25 / 400, 2);
  });

  test("the peak keeps the old row/col/x/y shape", () => {
    const { regions } = rank(a, b, ROWS, COLS, 8);
    expect(regions[0].x).toBe(regions[0].col * 8);
    expect(regions[0].y).toBe(regions[0].row * 8);
    expect(regions[0].saliencyA).toBe(1);
    expect(regions[0].saliencyB).toBe(0.05);
  });
});

describe("at the tool's grid size", () => {
  test("10,000 cells: the regions are the blobs, not the whole background", () => {
    // At this grid no single cell reaches 1% of the total, so a fixed
    // "1% of divergence" floor keeps nothing, falls back to every non-zero
    // cell, and returns the background as one 9,884-cell region holding half
    // the divergence. The floor has to scale with the number of cells.
    const R = 100, C = 100;
    const a = new Float64Array(R * C).fill(0.01);
    const set = (r0: number, c0: number, size: number) => {
      for (let r = r0; r < r0 + size; r++) for (let c = c0; c < c0 + size; c++) a[r * C + c] = 1;
    };
    set(10, 10, 10);
    set(70, 70, 4);
    const b = new Float64Array(R * C).fill(0.05);
    const { regions } = rank(a, b, R, C, 8);
    expect(regions.map((g) => g.cellCount)).toEqual([100, 16]);
    expect(regions[0].bbox).toEqual({ x: 80, y: 80, width: 80, height: 80 });
  });
});

describe("connectivity and direction", () => {
  test("diagonally touching blobs are one region (8-neighbour)", () => {
    const a = map(0.01, [[2, 2, 4, 4], [5, 5, 7, 7]]);
    expect(rank(a, map(0.05, []), ROWS, COLS, 8).regions.length).toBe(1);
  });

  test("a one-cell gap keeps them apart", () => {
    const a = map(0.01, [[2, 2, 4, 4], [6, 6, 8, 8]]);
    expect(rank(a, map(0.05, []), ROWS, COLS, 8).regions.length).toBe(2);
  });

  test("where A looks more and where B looks more are separate regions, labelled", () => {
    const a = map(0.01, [[2, 2, 5, 5]]);
    const b = map(0.01, [[2, 12, 5, 15]]);
    const { regions } = rank(a, b, ROWS, COLS, 8);
    expect(regions.map((r) => r.direction).sort()).toEqual(["personaA", "personaB"]);
    expect(regions.find((r) => r.direction === "personaA")!.bbox.x).toBe(16);
    expect(regions.find((r) => r.direction === "personaB")!.bbox.x).toBe(96);
  });

  test("identical maps: zero divergence, no regions", () => {
    const a = map(0.01, [[2, 2, 5, 5]]);
    const r = rank(a, Float64Array.from(a), ROWS, COLS, 8);
    expect(r.divergence).toBe(0);
    expect(r.regions).toEqual([]);
  });
});

describe("PROPERTY: shares are a partition of the divergence, ranked", () => {
  test("shares in [0,1], summing to at most 1, in descending order; same-direction peaks never touch", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 9 }),
        fc.integer({ min: 2, max: 9 }),
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 81, maxLength: 81 }),
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 81, maxLength: 81 }),
        (rows, cols, rawA, rawB) => {
          const n = rows * cols;
          const { divergence, regions } = rank(rawA.slice(0, n), rawB.slice(0, n), rows, cols, 4);
          if (divergence > 1e-9) expect(regions.length).toBeGreaterThan(0);
          let sum = 0;
          for (let i = 0; i < regions.length; i++) {
            expect(regions[i].divergence).toBeGreaterThanOrEqual(0);
            expect(regions[i].divergence).toBeLessThanOrEqual(1);
            if (i > 0) expect(regions[i].divergence).toBeLessThanOrEqual(regions[i - 1].divergence);
            sum += regions[i].divergence;
          }
          expect(sum).toBeLessThanOrEqual(1 + 0.0005 * regions.length);
          expect(sameDirectionPeaksTouch(regions)).toBe(false);
          for (const g of regions) {
            // Direction agrees with the shares it is computed from.
            if (Math.abs(g.attentionA - g.attentionB) > 0.002) {
              expect(g.direction).toBe(g.attentionA > g.attentionB ? "personaA" : "personaB");
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("compareAttention returns those regions", () => {
  const dir = join(tmpdir(), `cbrowser-attn-regions-${process.pid}`);
  const img = join(dir, "two-blocks.png");

  beforeAll(async () => {
    mkdirSync(dir, { recursive: true });
    const sharp = (await import("sharp")).default;
    const width = 800, height = 600;
    const px = Buffer.alloc(width * height * 3, 255);
    const block = (x0: number, y0: number, w: number, h: number, rgb: [number, number, number]) => {
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
        const i = (y * width + x) * 3;
        px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2];
      }
    };
    block(80, 80, 240, 160, [20, 20, 160]);
    block(560, 400, 120, 80, [200, 30, 30]);
    await sharp(px, { raw: { width, height, channels: 3 } }).png().toFile(img);
  });

  // A test that leaves a scratch dir behind on every run is the P-14 class.
  afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

  test("regions at the tool's grid are not neighbouring cells of one hotspot, and carry shares", async () => {
    const r = await at.compareAttention(img, "motor-impairment-tremor", "cognitive-adhd", 4);
    expect(r.attentionDivergence).toBeGreaterThan(0);
    const regions = r.divergentRegions as unknown as Region[];
    expect(regions.length).toBeGreaterThan(0);
    expect(sameDirectionPeaksTouch(regions)).toBe(false);
    for (const g of regions) {
      expect(g.cellCount).toBeGreaterThan(0);
      expect(["personaA", "personaB"]).toContain(g.direction);
      if (Math.abs(g.attentionA - g.attentionB) > 0.002) {
        expect(g.direction).toBe(g.attentionA > g.attentionB ? "personaA" : "personaB");
      }
    }
    const shareSum = regions.reduce((s, g) => s + g.divergence, 0);
    expect(shareSum).toBeLessThanOrEqual(1.001);
  }, 60_000);
});
