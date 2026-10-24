/**
 * A CIF certification is issued only when all 25 components were measured.
 *
 * An unmeasured component scores cif.noData.score, so a page whose inputs were
 * mostly missing could still reach a band: the empty fixture (0 of 25 measured)
 * graded C and certified bronze. A certification is a claim about the whole page,
 * and nothing was measured to back it. So gold, silver and bronze (and platinum)
 * now need every component measured; otherwise the certification is "none" and
 * the result says how many components were not measured. The grade is unchanged.
 * (Alexa, 2026-10-24.)
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { computeCIFScore, type CIFInput } from "../src/cif-score.js";

/** Every field any component reads (the same input as cif-missing-input.test.ts). */
const FULL: CIFInput = {
  url: "https://example.test/full",
  barriers: [],
  // empathy_audit has no skip-link detector; a fully measured page needs one that ran.
  skipLinksChecked: true,
  touchTargets: [{ width: 48, height: 48 }, { width: 30, height: 30 }],
  contrastIssues: [{ ratio: 3.2, isLargeText: false }],
  agentReadyScore: 80,
  semanticScore: 82,
  ariaScore: 78,
  landmarkScore: 76,
  headingScore: 84,
  formLabelScore: 88,
  totalCTC: 0.45,
  layers: [{ name: "decision", cost: 0.1 }, { name: "motor", cost: 0.05 }],
  elementCount: 300,
  interactiveCount: 25,
  navItemCount: 9,
  animationCount: 2,
  hasReducedMotionSupport: false,
  ctaCaptureRate: 0.3,
  fleschScore: 60,
  informationDensity: 0.5,
};

const fixturesDir = join(import.meta.dir, "golden", "fixtures");
const fixture = (name: string) => JSON.parse(readFileSync(join(fixturesDir, `${name}.json`), "utf8")) as CIFInput;

describe("CIF certification needs every component measured", () => {
  test("with all 25 measured, the certification is the band the lowest category reaches", () => {
    const r = computeCIFScore(FULL);
    expect(r.notMeasured).toEqual([]);
    expect(r.notMeasuredCount).toBe(0);
    // Categories 79/90/77/74/90: the lowest, 74, clears silver (70) and not gold (85).
    expect(r.certification).toBe("silver");
    expect(r.certificationNote).toBeNull();
  });

  test("one component not measured withholds the certification, keeps the grade, and says why", () => {
    const { fleschScore: _flesch, ...input } = FULL;
    const r = computeCIFScore(input);
    expect(r.notMeasured).toEqual(["cognitive.readability"]);
    expect(r.notMeasuredCount).toBe(1);
    expect(r.certification).toBe("none");
    expect(r.grade).toBe("B");
    expect(r.certificationNote).toBe("Not certified: 1 of 25 components not measured.");
  });

  test("a page with nothing measured keeps its grade and is not certified", () => {
    // Pinned before this rule as C and bronze.
    const r = computeCIFScore(fixture("minimal-empty"));
    expect(r.grade).toBe("C");
    expect(r.certification).toBe("none");
    expect(r.notMeasuredCount).toBe(25);
    expect(r.certificationNote).toBe("Not certified: 25 of 25 components not measured.");
  });

  test("across the golden fixtures, the certification is none exactly when a component went unmeasured", () => {
    const inputs = [FULL, ...readdirSync(fixturesDir).filter((f) => f.endsWith(".json")).map((f) => fixture(f.replace(/\.json$/, "")))];
    for (const input of inputs) {
      const r = computeCIFScore(input);
      expect(r.notMeasuredCount).toBe(r.notMeasured.length);
      if (r.notMeasuredCount > 0) {
        expect({ url: r.url, certification: r.certification }).toEqual({ url: r.url, certification: "none" });
        expect(r.certificationNote).toBe(`Not certified: ${r.notMeasuredCount} of 25 components not measured.`);
      } else {
        expect(r.certificationNote).toBeNull();
      }
    }
  });
});
