/**
 * The CIF grade bands are read through one exported function.
 *
 * The dashboard graded a site's average CIF with its own 90/80/70/60 bands while
 * the engine grades at 95/85/70/50/30 (cif.grade.*), so the same composite read
 * B on one screen and A on the next. computeGrade is exported so the dashboard
 * grades with the engine's function instead of a copy of its numbers.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { computeCIFScore, computeGrade, type CIFInput } from "../src/cif-score.js";
import { param } from "../src/visual/model-provenance.js";

describe("computeGrade", () => {
  test("is the grade computeCIFScore gives its own composite", () => {
    const dir = join(import.meta.dir, "golden", "fixtures");
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      const r = computeCIFScore(JSON.parse(readFileSync(join(dir, f), "utf8")) as CIFInput);
      expect({ f, grade: computeGrade(r.composite) }).toEqual({ f, grade: r.grade });
    }
  });

  test("each band starts at its registered threshold", () => {
    const bands: Array<[string, string]> = [["cif.grade.aPlus", "A+"], ["cif.grade.a", "A"], ["cif.grade.b", "B"], ["cif.grade.c", "C"], ["cif.grade.d", "D"]];
    for (const [id, grade] of bands) expect(computeGrade(param(id))).toBe(grade);
    expect(computeGrade(param("cif.grade.d") - 1)).toBe("F");
  });
});
