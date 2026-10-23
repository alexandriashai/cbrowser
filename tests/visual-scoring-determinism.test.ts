/**
 * The visual and perceptual Wasserstein scores are deterministic: the same
 * inputs give byte-identical results, call after call.
 *
 * slicedWassersteinDistance drew its projection directions from unseeded
 * Math.random(), so computeWassersteinDistance returned a different distance
 * on every call for the same two images. That distance is the visual
 * regression verdict (performWassersteinAnalysis, smart-baseline comparison)
 * and, through analyzePerceptualTransport, part of empathy_audit's perceptual
 * score: low-vision-magnified scored 74-78 on one screenshot with identical
 * inputs (2026-10-22). The directions now come from a seeded 32-bit generator
 * with a registered seed (visualDistance.projectionSeed).
 *
 * The temp files of concurrent perceptual calls: tests/perceptual-temp-files.test.ts.
 *
 * No browser: the images are drawn with sharp.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ownDataDir = process.env.CBROWSER_DATA_DIR ? null : mkdtempSync(join(tmpdir(), "cb-determinism-data-"));
if (ownDataDir) process.env.CBROWSER_DATA_DIR = ownDataDir;
const sharp = (await import("sharp")).default;
const { computeWassersteinDistance } = await import("../src/visual/distance-metrics.js");
const { analyzeVisualDifferences } = await import("../src/visual/regression.js");
const { analyzePerceptualTransport } = await import("../src/visual/perceptual-transport.js");

const dir = mkdtempSync(join(tmpdir(), "cb-determinism-"));
const RUNS = 20;

/** A landing-page-like picture: header, headline, a button at `buttonX`, three cards. */
const page = (buttonX: number, accent = "#dc2626") => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450">
<rect width="800" height="450" fill="#f7f7f9"/><rect width="800" height="60" fill="#1e3a8a"/>
<text x="24" y="40" font-family="sans-serif" font-size="24" fill="#ffffff">Acme Widgets</text>
<text x="24" y="140" font-family="sans-serif" font-size="36" fill="#222222">Ship faster with Acme</text>
<text x="24" y="175" font-family="sans-serif" font-size="16" fill="#444444">Widgets that help teams build reliable interfaces.</text>
<rect x="${buttonX}" y="200" width="160" height="48" rx="6" fill="${accent}"/>
<rect x="24" y="290" width="236" height="130" fill="#ffffff" stroke="#dddddd"/>
<rect x="282" y="290" width="236" height="130" fill="#ffffff" stroke="#dddddd"/>
<rect x="540" y="290" width="236" height="130" fill="#ffffff" stroke="#dddddd"/>
<text x="40" y="330" font-family="sans-serif" font-size="20" fill="#111111">Fast</text>
<text x="298" y="330" font-family="sans-serif" font-size="20" fill="#111111">Accessible</text>
<text x="556" y="330" font-family="sans-serif" font-size="20" fill="#111111">Typed</text></svg>`;

let base: string, moved: string;
beforeAll(async () => {
  const draw = async (svg: string, name: string) => {
    const p = join(dir, name);
    await sharp(Buffer.from(svg)).png().toFile(p);
    return p;
  };
  base = await draw(page(24), "base.png");
  moved = await draw(page(560), "moved.png");
});
afterAll(() => {
  for (const d of [dir, ownDataDir]) {
    if (d) try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

/** JSON of a result with its wall-clock timings removed. */
const stable = (r: unknown) => JSON.stringify(r, (k, v) => (k === "computeTimeMs" || k === "duration" ? undefined : v));
const ATTENTION = { entropy: 0.8, concentration: 0.9, transportCost: 1.5 };

describe("same inputs, same result", () => {
  test(`computeWassersteinDistance: ${RUNS} calls are byte-identical`, async () => {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(stable(await computeWassersteinDistance(base, moved)));
    expect(new Set(runs).size).toBe(1);
    expect(JSON.parse(runs[0]).distance).toBeGreaterThan(0);
  }, 60_000);

  test(`a visual-regression comparison (analyzeVisualDifferences): ${RUNS} calls are byte-identical`, async () => {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const a = await analyzeVisualDifferences(base, moved, {} as never);
      // rawAnalysis prints the compute time; everything else must match exactly.
      // The Wasserstein path, not the byte-diff fallback it drops to on an error,
      // which would pass this test without measuring anything.
      expect(a.wassersteinDistance).toBeGreaterThan(0);
      runs.push(stable({ ...a, rawAnalysis: String(a.rawAnalysis ?? "").replace(/\d+ms/, "ms") }));
    }
    expect(new Set(runs).size).toBe(1);
  }, 60_000);

  test(`analyzePerceptualTransport through a blurring profile: ${RUNS} calls are byte-identical`, async () => {
    for (const persona of ["low-vision-magnified", "elderly-low-vision"]) {
      const runs = [];
      for (let i = 0; i < RUNS; i++) runs.push(stable(await analyzePerceptualTransport(base, persona, ATTENTION)));
      expect({ persona, distinct: new Set(runs).size }).toEqual({ persona, distinct: 1 });
    }
  }, 120_000);
});
