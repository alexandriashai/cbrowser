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
 * are drawn with sharp. Projection seeding: tests/visual-scoring-determinism.test.ts.
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
const CALLS = 8;
const PERSONA = "low-vision-magnified";
const ATTENTION = { entropy: 0.8, concentration: 0.9, transportCost: 1.5 };

/** A landing-page-like picture whose button sits at `buttonX` in `accent`. */
const page = (buttonX: number, accent: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450">
<rect width="800" height="450" fill="#f7f7f9"/><rect width="800" height="60" fill="#1e3a8a"/>
<text x="24" y="140" font-family="sans-serif" font-size="36" fill="#222222">Ship faster with Acme</text>
<rect x="${buttonX}" y="200" width="160" height="48" rx="6" fill="${accent}"/>
<rect x="24" y="290" width="236" height="130" fill="#ffffff" stroke="#dddddd"/>
<rect x="540" y="290" width="236" height="130" fill="#ffffff" stroke="#dddddd"/></svg>`;
const ACCENTS = ["#dc2626", "#16a34a", "#2563eb", "#9333ea", "#ea580c", "#0891b2", "#4b5563", "#db2777"];

const screenshots: string[] = [];
let truncated: string;
beforeAll(async () => {
  for (let i = 0; i < CALLS; i++) {
    const p = join(fixtures, `page-${i}.png`);
    await sharp(Buffer.from(page(24 + i * 80, ACCENTS[i]))).png().toFile(p);
    screenshots.push(p);
  }
  // A PNG cut in half: its header reads (metadata succeeds), its pixels do not,
  // so the call fails after it has started writing temp images.
  const whole = await sharp(Buffer.from(page(24, ACCENTS[0]))).png({ compressionLevel: 0 }).toBuffer();
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

/** JSON of a result with its wall-clock timing removed. */
const stable = (r: unknown) => JSON.stringify(r, (k, v) => (k === "computeTimeMs" ? undefined : v));
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const log = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = log; }
};

describe("concurrent perceptual calls", () => {
  test(`${CALLS} calls in parallel, in the same millisecond, each match their sequential result and leave no temp file`, async () => {
    const alone: string[] = [];
    for (const s of screenshots) alone.push(stable(await quiet(() => analyzePerceptualTransport(s, PERSONA, ATTENTION))));
    // Eight screenshots the measure tells apart, so a swapped image shows.
    expect(new Set(alone).size).toBe(CALLS);
    expect(readdirSync(tempRoot)).toEqual([]);

    const realNow = Date.now;
    Date.now = () => 1_700_000_000_000; // a temp name built from the clock collides every time
    try {
      for (let round = 0; round < 3; round++) {
        const together = await quiet(() =>
          Promise.all(screenshots.map((s) => analyzePerceptualTransport(s, PERSONA, ATTENTION))),
        );
        expect({ round, results: together.map(stable) }).toEqual({ round, results: alone });
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
