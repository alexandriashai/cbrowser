/**
 * The CIF score's registry and its code cannot drift from each other.
 *
 * Every golden fixture is scored under provenance recording. Every id the
 * score reads must be registered (param() throws otherwise, so the run itself
 * proves that), and every CIF_PROVENANCE id must have been read, so an entry
 * cannot describe a number the code no longer uses. The statuses are pinned:
 * exactly the three WCAG numbers are published, exactly four entries are
 * definitions, and every other entry is a hypothesis that names what would
 * test it. The golden pins (tests/golden/) prove the move changed no score.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CIF_PROVENANCE } from "../src/visual/provenance/cif.js";
import { MODEL_PROVENANCE, param, startProvenanceRecording, stopProvenanceRecording } from "../src/visual/model-provenance.js";
import { computeCIFScore, type CIFInput } from "../src/cif-score.js";

const STATUSES = ["fitted", "published", "definition", "hypothesis"];
const fixturesDir = join(import.meta.dir, "golden", "fixtures");
const fixtures = readdirSync(fixturesDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(join(fixturesDir, f), "utf8")) as CIFInput);

startProvenanceRecording();
for (const input of fixtures) computeCIFScore(input);
computeCIFScore({ url: "https://example.test/" }); // every no-data default
const read = stopProvenanceRecording();
const registered = new Set(CIF_PROVENANCE.map((e) => e.id));

describe("CIF provenance registry", () => {
  test("the registry is pinned, unique and cif-prefixed", () => {
    // Pinned exactly: a constant added to or removed from cif-score.ts must
    // change this number on purpose.
    expect(CIF_PROVENANCE.length).toBe(93);
    expect(registered.size).toBe(CIF_PROVENANCE.length);
    for (const e of CIF_PROVENANCE) expect(e.id.startsWith("cif.")).toBe(true);
  });

  test("every entry has one of the four statuses, a finite value and a real source", () => {
    for (const e of CIF_PROVENANCE) {
      expect(STATUSES).toContain(e.status);
      expect(Number.isFinite(e.value)).toBe(true);
      expect(e.source.trim().length).toBeGreaterThan(40);
    }
  });

  test("exactly the WCAG numbers are published, each citing its success criterion", () => {
    const published = CIF_PROVENANCE.filter((e) => e.status === "published");
    expect(published.map((e) => `${e.id}=${e.value}`).sort()).toEqual([
      "cif.wcag.contrastLargeText=3",
      "cif.wcag.contrastNormalText=4.5",
      "cif.wcag.targetSizeEnhancedPx=44",
    ]);
    const cites: Record<string, RegExp> = {
      "cif.wcag.targetSizeEnhancedPx": /WCAG 2\.2 Success Criterion 2\.5\.5 Target Size \(Enhanced\), Level AAA: .*44 by 44 CSS pixels/,
      "cif.wcag.contrastNormalText": /WCAG 2\.2 Success Criterion 1\.4\.3 Contrast \(Minimum\), Level AA: .*4\.5:1/,
      "cif.wcag.contrastLargeText": /WCAG 2\.2 Success Criterion 1\.4\.3 Contrast \(Minimum\), Level AA: .*3:1 for large-scale text/,
    };
    for (const e of published) expect(e.source).toMatch(cites[e.id]);
  });

  test("nothing is fitted, four entries are definitions, and every hypothesis names what would test it", () => {
    const counts = { fitted: 0, published: 0, definition: 0, hypothesis: 0 };
    for (const e of CIF_PROVENANCE) {
      counts[e.status]++;
      if (e.status === "hypothesis") expect(e.source).toMatch(/would (fit|set|test|place)/);
    }
    expect(counts).toEqual({ fitted: 0, published: 3, definition: 4, hypothesis: 86 });
    expect(CIF_PROVENANCE.filter((e) => e.status === "definition").map((e) => e.id).sort()).toEqual([
      "cif.display.costDecimals",
      "cif.emptyAverage",
      "cif.scale.max",
      "cif.topIssues.count",
    ]);
  });

  test("the five category weights and each category's component weights sum to 1", () => {
    const sum = (prefix: string) =>
      CIF_PROVENANCE.filter((e) => e.id.startsWith(prefix)).reduce((s, e) => s + e.value, 0);
    expect(sum("cif.weight.")).toBeCloseTo(1, 12);
    for (const cat of ["motor", "visual", "cognitive", "sensory", "navigation"]) {
      expect(sum(`cif.${cat}.weight.`)).toBeCloseTo(1, 12);
    }
  });

  test("every id the score reads is registered, and only cif ids are read", () => {
    const unregistered = [...read].filter((id) => !registered.has(id));
    expect(unregistered).toEqual([]);
    expect([...read].every((id) => id.startsWith("cif."))).toBe(true);
  });

  test("every registered id is read at least once (no dead entries)", () => {
    const dead = [...registered].filter((id) => !read.has(id));
    expect(dead).toEqual([]);
  });

  test("the registry the score reads is the merged one, and an unknown id is refused", () => {
    for (const e of CIF_PROVENANCE) expect(MODEL_PROVENANCE[e.id]).toBe(e);
    expect(() => param("cif.doesNotExist")).toThrow(/unregistered/);
  });
});
