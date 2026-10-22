/**
 * The attention model's registry and its code cannot drift from each other.
 *
 * A run that reaches every branch (every attention mode, slow processing,
 * Schwartz values, cognitive traits, the fallback modifier table for each of
 * its personas, goal keywords and judged relevance, the default blend, the
 * comparison) is recorded. Every id it reads must be registered (param()
 * throws otherwise, so the run itself proves that), and every attention id
 * must have been read, so an entry cannot describe a number the code no longer
 * uses. The statuses are pinned: the three GAZE_CALIBRATION values, the
 * spatial prior table and the legacy blend default are the only fitted
 * entries, the CIE-Lab constants the only published ones.
 *
 * Byte-identity of the move itself was proven outside the suite: 440
 * fingerprints of computeLabSaliency, analyzeAttention (cellSize 16 and 4, 18
 * personas), analyzeAttentionFromDOM, compareAttention, the fallback tables,
 * the filters and the gaze calibration on six UEyes stimuli, identical before
 * and after; and research/study1/run-study1-v20.ts --limit 20 reproducing the
 * 2026-10-21 per_image.csv rows byte for byte.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ATTENTION_PROVENANCE, ATTENTION_STATIC_MODIFIER_TYPES, tableChecksum } from "../src/visual/provenance/attention.js";
import {
  MODEL_PROVENANCE, startProvenanceRecording, stopProvenanceRecording, withParamOverrides,
} from "../src/visual/model-provenance.js";
import * as A from "../src/visual/attention-transport.js";
import type { PerceptualFilter } from "../src/visual/perceptual-transport.js";

const STATUSES = ["fitted", "published", "definition", "hypothesis"];
const registered = new Set(ATTENTION_PROVENANCE.map((e) => e.id));

let dir: string;
let png: string;
let read: Set<string>;

const ELEMENTS = [
  { type: "cta", x: 20, y: 20, width: 80, height: 24, text: "Start your free trial" },
  { type: "heading", x: 120, y: 10, width: 200, height: 30, text: "New secure reviews, trusted by 10k+ users" },
  { type: "content", x: 20, y: 80, width: 300, height: 60, text: "Join our community: 30% faster, limited offer" },
  { type: "image", x: 200, y: 120, width: 100, height: 60 },
  { type: "mystery", x: 10, y: 160, width: 40, height: 20, text: "?" },
];
const VALUES = { selfDirection: 0.9, stimulation: 0.8, achievement: 0.2, power: 0.7, security: 0.95, conformity: 0.1, tradition: 0.85, benevolence: 0.8, universalism: 0.7 };
const MODES: PerceptualFilter["attentionMode"][] = ["uniform", "center-heavy", "motion-attracted", "text-focused", "large-elements"];

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "cb-attn-prov-"));
  png = join(dir, "page.png");
  const sharp = (await import("sharp")).default;
  await sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 240, g: 240, b: 235 } } })
    .composite([{ input: { create: { width: 60, height: 40, channels: 3, background: { r: 0, g: 150, b: 140 } } }, left: 40, top: 30 }])
    .png().toFile(png);

  startProvenanceRecording();
  await A.analyzeAttention(png, "first-timer", 16, VALUES, ELEMENTS as never, "start trial", undefined, { 1: 0.5 });
  await A.analyzeAttention(png, "cognitive-adhd", 4);
  await A.analyzeAttentionFromDOM(320, 240, ELEMENTS as never, "power-user");
  await A.compareAttention(png, "first-timer", "low-vision-magnified", 8, ELEMENTS as never);
  // The fallback modifier table, persona by persona (no cognitive traits).
  for (const persona of Object.keys(ATTENTION_STATIC_MODIFIER_TYPES)) {
    A.buildSemanticMap(ELEMENTS as never, 15, 20, 16, 320, 240, persona);
  }
  // Every attention mode, slow processing, values that hit each modulation.
  const map = new Float64Array(300).map((_, i) => (i % 17) / 16);
  for (const attentionMode of MODES) {
    const filter = { contrastThreshold: 0, blurRadius: 0, colorAttenuation: [1, 1, 1] as [number, number, number], attentionMode, motorCostMultiplier: 1, processingSpeed: 0.5, noiseTolerance: 1 };
    A.applyPersonaFilter(map, 15, 20, filter, VALUES);
  }
  A.blendSaliencyMaps(map, map);
  read = stopProvenanceRecording();
}, 60_000);

afterAll(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } });

describe("attention provenance registry", () => {
  test("the registry is pinned, unique and attention-prefixed", () => {
    // Pinned exactly: a constant added to or removed from the model must change
    // these numbers on purpose. 198 at registration (2026-10-22).
    expect(ATTENTION_PROVENANCE.length).toBe(198);
    expect(registered.size).toBe(ATTENTION_PROVENANCE.length);
    for (const e of ATTENTION_PROVENANCE) expect(e.id.startsWith("attention.")).toBe(true);
    const counts = { fitted: 0, published: 0, definition: 0, hypothesis: 0 };
    for (const e of ATTENTION_PROVENANCE) counts[e.status]++;
    expect(counts).toEqual({ fitted: 5, published: 23, definition: 24, hypothesis: 146 });
  });

  test("every entry has a status, a finite value and a real source; hypotheses name what would test them", () => {
    for (const e of ATTENTION_PROVENANCE) {
      expect(STATUSES).toContain(e.status);
      expect(Number.isFinite(e.value)).toBe(true);
      expect(e.source.trim().length).toBeGreaterThan(40);
      if (e.status === "hypothesis") expect(e.source).toMatch(/would (fit|set|test|place|replace)/);
    }
  });

  test("exactly the UEyes fits are fitted, each naming the data and its score", () => {
    const fitted = ATTENTION_PROVENANCE.filter((e) => e.status === "fitted");
    expect(fitted.map((e) => `${e.id}=${e.value}`).sort()).toEqual([
      "attention.blend.legacyVisualWeight=0.05",
      "attention.gaze.sigmaCells=2.5",
      "attention.gaze.spatialPrior=1",
      "attention.gaze.visualWeight=0.2",
      `attention.spatialPrior.checksum=${MODEL_PROVENANCE["attention.spatialPrior.checksum"].value}`,
    ]);
    for (const e of fitted) {
      expect(e.source).toContain("UEyes");
      expect(e.source).toMatch(/495/);
      expect(e.source).toMatch(/run-(optimize|blend-sweep)\.ts/);
    }
    for (const id of ["attention.gaze.visualWeight", "attention.gaze.sigmaCells", "attention.gaze.spatialPrior"]) {
      expect(MODEL_PROVENANCE[id].source).toContain("held-out AUC-Judd 0.7367");
      expect(MODEL_PROVENANCE[id].source).toContain("in-sample 0.7372");
    }
  });

  test("exactly the colour-science constants are published, each citing its standard", () => {
    const published = ATTENTION_PROVENANCE.filter((e) => e.status === "published");
    expect(published.length).toBe(23);
    for (const e of published) {
      expect(e.id).toMatch(/^attention\.(srgb|xyz|white|lab)\./);
      expect(e.source).toMatch(/IEC 61966-2-1|Lindbloom|ASTM E308|CIE 15:2004/);
    }
  });

  test("the element-type weights say they no longer contribute", () => {
    for (const e of ATTENTION_PROVENANCE.filter((x) => x.id.startsWith("attention.type.") && x.id !== "attention.type.fallback")) {
      expect(e.status).toBe("hypothesis");
      expect(e.source).toContain("165 of 495");
    }
  });

  test("every id the run reads is registered, and every registered id is read (no dead entries)", () => {
    const attentionReads = [...read].filter((id) => id.startsWith("attention."));
    expect(attentionReads.filter((id) => !registered.has(id))).toEqual([]);
    expect([...registered].filter((id) => !read.has(id))).toEqual([]);
  });

  test("the registry entries are the ones merged into MODEL_PROVENANCE", () => {
    for (const e of ATTENTION_PROVENANCE) expect(MODEL_PROVENANCE[e.id]).toBe(e);
  });
});

describe("the spatial prior table is tied to its registration", () => {
  test("the checksum changes when any one cell changes", () => {
    const table = Array.from({ length: 192 }, (_, i) => (i % 16) / 16);
    const base = tableChecksum(table);
    for (const i of [0, 77, 191]) {
      const edited = table.slice();
      edited[i] += 1e-4;
      expect(tableChecksum(edited)).not.toBe(base);
    }
    // Order matters too: a transposed table is a different prior.
    expect(tableChecksum([...table].reverse())).not.toBe(base);
  });

  test("a registration that no longer matches the table stops the model (absence test)", () => {
    const map = new Float64Array(12 * 16).fill(0.5);
    expect(() => A.applyGazeCalibration(map, 12, 16)).not.toThrow();
    const wrong = MODEL_PROVENANCE["attention.spatialPrior.checksum"].value + 1;
    withParamOverrides({ "attention.spatialPrior.checksum": wrong }, () => {
      expect(() => A.applyGazeCalibration(map, 12, 16)).toThrow(/does not match its registration/);
      // With the prior switched off the table is not used, so nothing to check.
      expect(() => A.applyGazeCalibration(map, 12, 16, 2.5, 0)).not.toThrow();
    });
    withParamOverrides({ "attention.spatialPrior.rows": 11 }, () => {
      expect(() => A.applyGazeCalibration(map, 12, 16)).toThrow(/does not match its registration/);
    });
  });
});

describe("the exported calibration reads the registry", () => {
  test("GAZE_CALIBRATION is a live view, and the shipped path follows an override", async () => {
    expect({ ...A.GAZE_CALIBRATION }).toEqual({ visualWeight: 0.2, sigmaCells: 2.5, spatialPrior: 1 });
    withParamOverrides({ "attention.gaze.sigmaCells": 3, "attention.gaze.visualWeight": 0.4 }, () => {
      expect(A.GAZE_CALIBRATION.sigmaCells).toBe(3);
      expect(A.GAZE_CALIBRATION.visualWeight).toBe(0.4);
      expect(A.gazeSigmaCells(16)).toBe(3);
    });
    expect(A.GAZE_CALIBRATION.sigmaCells).toBe(2.5);
  });
});
