/**
 * The sliced Wasserstein image distance reads its seed and projection counts
 * from the registry, and the seeded directions are distributed as the
 * Math.random() ones were: uniform on the sphere.
 *
 * See provenance/visual-distance.ts and tests/visual-scoring-determinism.test.ts.
 * No browser.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VISUAL_DISTANCE_PROVENANCE } from "../src/visual/provenance/visual-distance.js";
import { MODEL_PROVENANCE, startProvenanceRecording, stopProvenanceRecording } from "../src/visual/model-provenance.js";
import { computeWassersteinDistance, projectionDirections } from "../src/visual/distance-metrics.js";
import { analyzePerceptualTransport } from "../src/visual/perceptual-transport.js";

const sharp = (await import("sharp")).default;
const dir = mkdtempSync(join(tmpdir(), "cb-visual-distance-prov-"));
let a: string, b: string;
beforeAll(async () => {
  const svg = (x: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">
<rect width="320" height="200" fill="#f7f7f9"/><rect x="${x}" y="80" width="80" height="40" fill="#dc2626"/></svg>`;
  a = join(dir, "a.png");
  b = join(dir, "b.png");
  await sharp(Buffer.from(svg(20))).png().toFile(a);
  await sharp(Buffer.from(svg(200))).png().toFile(b);
});
afterAll(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("visualDistance provenance", () => {
  const registered = new Set(VISUAL_DISTANCE_PROVENANCE.map((e) => e.id));

  test("pinned, unique, prefixed, all definitions", () => {
    expect(VISUAL_DISTANCE_PROVENANCE.map((e) => [e.id, e.value, e.status])).toEqual([
      ["visualDistance.projectionSeed", 2654435769, "definition"],
      ["visualDistance.numProjections", 64, "definition"],
      ["visualDistance.perceptualNumProjections", 32, "definition"],
    ]);
    for (const e of VISUAL_DISTANCE_PROVENANCE) {
      expect(MODEL_PROVENANCE[e.id]).toBe(e);
      expect(e.source.trim().length).toBeGreaterThan(40);
    }
  });

  test("every registered id is read, and only registered ids are", async () => {
    startProvenanceRecording();
    const r = await computeWassersteinDistance(a, b);
    await analyzePerceptualTransport(a, "low-vision-magnified", { entropy: 0.8, concentration: 0.9, transportCost: 1.5 });
    const read = stopProvenanceRecording();
    const reads = [...read].filter((id) => id.startsWith("visualDistance."));
    expect(reads.filter((id) => !registered.has(id))).toEqual([]);
    expect([...registered].filter((id) => !read.has(id))).toEqual([]);
    expect(r.details.numProjections).toBe(64);
  });

  test("an explicit seed or count is honoured; the default is the registered seed", async () => {
    const byDefault = await computeWassersteinDistance(a, b, { compareMode: "spatial" });
    const registeredSeed = await computeWassersteinDistance(a, b, { compareMode: "spatial", projectionSeed: 2654435769 });
    const otherSeed = await computeWassersteinDistance(a, b, { compareMode: "spatial", projectionSeed: 1 });
    expect(registeredSeed.distance).toBe(byDefault.distance);
    expect(otherSeed.distance).not.toBe(byDefault.distance);
    expect((await computeWassersteinDistance(a, b, { numProjections: 8 })).details.numProjections).toBe(8);
  });
});

describe("the seeded directions are uniform on the sphere, as the Math.random() ones were", () => {
  for (const dim of [3, 5]) {
    test(`${dim} dimensions: unit length, centred, isotropic, uncorrelated (20,000 directions)`, () => {
      const dirs = projectionDirections(20_000, dim, 2654435769);
      const mean = new Float64Array(dim);
      const second = Array.from({ length: dim }, () => new Float64Array(dim));
      for (const v of dirs) {
        let norm = 0;
        for (let i = 0; i < dim; i++) {
          norm += v[i] * v[i];
          mean[i] += v[i] / dirs.length;
          for (let j = 0; j < dim; j++) second[i][j] += (v[i] * v[j]) / dirs.length;
        }
        expect(Math.abs(Math.sqrt(norm) - 1)).toBeLessThan(1e-12);
      }
      // Uniform on the unit sphere: E[v] = 0, E[v v^T] = I / dim. Sampling error
      // at n = 20,000 is about 0.007 for the mean and 0.002 for the moments.
      for (let i = 0; i < dim; i++) {
        expect(Math.abs(mean[i])).toBeLessThan(0.025);
        expect(Math.abs(second[i][i] - 1 / dim)).toBeLessThan(0.01);
        for (let j = 0; j < dim; j++) if (j !== i) expect(Math.abs(second[i][j])).toBeLessThan(0.01);
      }
    });
  }

  test("same seed, same directions; another seed, other directions", () => {
    const flat = (seed: number) => projectionDirections(64, 5, seed).flatMap((v) => [...v]);
    expect(flat(2654435769)).toEqual(flat(2654435769));
    expect(flat(1)).not.toEqual(flat(2654435769));
  });

  // The bits of the directions the tools use, pinned. Node (the servers) and Bun
  // (these tests) produced these same hashes, and the same distances from them,
  // on 2026-10-23 (Node 22.19.0, Bun 1.3.8); Box-Muller directions from the same
  // seed did not match between the two. A change here moves every visual
  // regression distance and perceptual score, so it must be deliberate.
  test("the registered directions are pinned bit for bit", () => {
    const hash = (count: number, dim: number) => {
      const h = createHash("sha256");
      for (const v of projectionDirections(count, dim, 2654435769)) h.update(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
      return h.digest("hex");
    };
    expect(hash(64, 5)).toBe("7c77fecfc3c0e7942c3f205105c9c87761785b132679340a4c081bd9dc93ef04");
    expect(hash(32, 5)).toBe("cee6a4df3a7a61b18555e394373c4c42a01b1d80bb3405557b51d2bd2ff01aeb");
  });

  test("dimensions outside 1-8 are refused rather than sampled for ever", () => {
    expect(() => projectionDirections(1, 0, 1)).toThrow(RangeError);
    expect(() => projectionDirections(1, 9, 1)).toThrow(RangeError);
    expect(() => projectionDirections(1, 2.5, 1)).toThrow(RangeError);
  });
});
