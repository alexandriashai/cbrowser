/**
 * Concurrent perceptual calls each read only their own temp images, and leave
 * none behind.
 *
 * analyzePerceptualTransport wrote the filtered and downscaled screenshots to
 * the shared temp dir under names built from Date.now() (the filtered one
 * also from the persona name), so two calls in the same millisecond (the
 * hosted servers run requests concurrently) wrote, read and deleted each
 * other's files. Each call now writes into a directory of its own (mkdtemp)
 * and removes it however the call ends.
 *
 * The temp root is a fresh TMPDIR for this file, so "nothing left behind" is
 * checked on a directory nothing else writes to. No browser: the screenshots
 * are drawn with sharp. The sliced Wasserstein distance is estimated from
 * random, unseeded projections on this line, so a crossed read is caught by
 * which distance BAND a call lands in (solid vs dense images are far apart and
 * never overlap) rather than by an exact score, which is not reproducible here.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sharp = (await import("sharp")).default;
const { analyzePerceptualTransport } = await import("../src/visual/perceptual-transport.js");

const fixtures = mkdtempSync(join(tmpdir(), "cb-perceptual-fixtures-"));
const tempRoot = mkdtempSync(join(tmpdir(), "cb-perceptual-tmp-"));
const savedTmpdir = process.env.TMPDIR;
const PERSONA = "low-vision-magnified";
const ATTENTION = { entropy: 0.8, concentration: 0.9, transportCost: 1.5 };

// Two images this persona's filter transports very differently. The sliced
// Wasserstein distance is estimated from random projections (unseeded on this
// line, so it is NOT deterministic), but the two bands are far apart and never
// overlap: a solid page sits around 0.16-0.21 and a dense page around
// 0.05-0.07 (measured 2026-10-23), with nothing between 0.08 and 0.15. So the
// transport distance tells which image a call read, whatever the projections,
// which is what a crossed temp file would corrupt.
const SOLID = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#f0f0f5"/></svg>`;
const DENSE = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="800" height="450" fill="#000"/>${
  Array.from({ length: 200 }, (_, i) => `<rect x="${(i * 53) % 770}" y="${(i * 31) % 430}" width="40" height="30" fill="rgb(${(i * 37) % 256},${(i * 91) % 256},${(i * 53) % 256})"/>`).join("")
}</svg>`;
const SOLID_MIN = 0.1; // solid distances stay above this
const DENSE_MAX = 0.1; // dense distances stay below this
const CALLS = 8; // 4 solid, 4 dense, interleaved

const screenshots: string[] = [];
const wantSolid: boolean[] = [];
let truncated: string;
beforeAll(async () => {
  for (let i = 0; i < CALLS; i++) {
    const solid = i % 2 === 0;
    const p = join(fixtures, `page-${i}.png`);
    await sharp(Buffer.from(solid ? SOLID : DENSE)).png().toFile(p);
    screenshots.push(p);
    wantSolid.push(solid);
  }
  // A PNG cut in half: its header reads (metadata succeeds), its pixels do not,
  // so the call fails after it has started writing temp images.
  const whole = await sharp(Buffer.from(DENSE)).png({ compressionLevel: 0 }).toBuffer();
  truncated = join(fixtures, "truncated.png");
  writeFileSync(truncated, whole.subarray(0, Math.floor(whole.length / 2)));
  process.env.TMPDIR = tempRoot;
  expect(tmpdir()).toBe(tempRoot);
});
afterAll(() => {
  if (savedTmpdir === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = savedTmpdir;
  for (const d of [fixtures, tempRoot]) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const log = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = log; }
};
/** Which image band a transport distance falls in: "solid", "dense", or "between" (a crossed/garbled read). */
const band = (d: number) => (d >= SOLID_MIN ? "solid" : d <= DENSE_MAX ? "dense" : "between");

describe("concurrent perceptual calls", () => {
  test(`${CALLS} calls in parallel, in the same millisecond, each read their own image and leave no temp file`, async () => {
    const realNow = Date.now;
    Date.now = () => 1_700_000_000_000; // a temp name built from the clock collides every time
    try {
      for (let round = 0; round < 3; round++) {
        const results = await quiet(() =>
          Promise.all(screenshots.map((s) => analyzePerceptualTransport(s, PERSONA, ATTENTION))),
        );
        // Each call's distance lands in the band of the image IT was given; a
        // crossed temp file would put a solid call in the dense band or leave a
        // garbled read between the two.
        const got = results.map((r) => band(r.transportDistance));
        expect({ round, got }).toEqual({ round, got: wantSolid.map((s) => (s ? "solid" : "dense")) });
        expect({ round, left: readdirSync(tempRoot) }).toEqual({ round, left: [] });
      }
    } finally {
      Date.now = realNow;
    }
  }, 120_000);

  test("a call that fails part-way rejects and still leaves no temp file", async () => {
    await expect(quiet(() => analyzePerceptualTransport(truncated, PERSONA, ATTENTION))).rejects.toThrow();
    expect(readdirSync(tempRoot)).toEqual([]);
  }, 60_000);

  test("the persona name is not part of any path: a name with a slash works", async () => {
    const r = await quiet(() => analyzePerceptualTransport(screenshots[0], "reader/magnifier user", ATTENTION));
    expect(r.persona).toBe("reader/magnifier user");
    expect(readdirSync(tempRoot)).toEqual([]);
  }, 60_000);
});
