/**
 * A site's strengths must not contradict its own top issues unreconciled.
 *
 * Reproduced on cbrowser.ai/pricing, one payload:
 *
 *   strengths:  "Stable selectors that won't break"
 *   topIssues:  "Element lacks stable selectors (score: 0/10)"
 *   weaknesses: "Agents struggle to find elements"
 *
 * Both are arithmetically correct — the first is an AXIS score at 92, the second
 * an ELEMENT scoring 0 — and they are not publishable together with nothing
 * saying how they fit.
 *
 * Qualified rather than suppressed. Stability 92 is real and useful; deleting the
 * strength would lose it to hide an inconsistency that is itself information.
 * The exception count is exactly what the old output withheld.
 *
 * The stability phrases were renamed 2026-10-10 (report v8 B28): that axis does
 * not score selectors. The cases below use the current wording.
 *
 * `siteAdvantages` had the sibling problem: superlatives ("Most stable
 * selectors", best-in-cohort) and plain strengths ("Stable selectors that won't
 * break", axis >= 80) are one claim at two scopes, and the list shipped both.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import {
  reconcileStrengths,
  dedupeAdvantagesByAxis,
} from "../src/analysis/competitive-benchmark.js";

/** The stability strength as the benchmark phrases it (renamed 2026-10-10, B28). */
const STABLE = "Few hidden controls, click-blocking overlays or loading hazards";

/** /pricing's real breakdown. */
const PRICING = {
  findability: 55, stability: 92, agentPerceivability: 100,
  accessibility: 100, semantics: 100,
};

describe("a contradicted strength is qualified, not silently kept", () => {
  test("the reported case — stability strength beside a stability issue", () => {
    const out = reconcileStrengths(
      [STABLE], ["stability"], PRICING);
    expect(out[0]).not.toBe(STABLE);
    expect(out[0]).toContain("with 1 element(s) excepted");
  });

  test("the axis score survives the qualification — it is real information", () => {
    const out = reconcileStrengths(
      [STABLE], ["stability"], PRICING);
    expect(out[0]).toContain("stability 92");
  });

  test("the exception COUNT is reported, not just its existence", () => {
    const out = reconcileStrengths(
      [STABLE], ["stability", "stability", "findability"], PRICING);
    expect(out[0]).toContain("with 2 element(s) excepted");
  });

  test("an uncontradicted strength is left exactly alone", () => {
    const out = reconcileStrengths(
      ["Clear semantic HTML structure"], ["stability"], PRICING);
    expect(out).toEqual(["Clear semantic HTML structure"]);
  });

  test("the deprecated `accessibility` category still matches the renamed axis", () => {
    // Issues emitted before the rename, or by a caller constructing one, carry
    // the old category. Failing to match it would silently un-reconcile them.
    const out = reconcileStrengths(
      ["Good ARIA labels for identification"], ["accessibility"], PRICING);
    expect(out[0]).toContain("excepted");
  });

  test("an unmapped strength passes through rather than throwing", () => {
    const out = reconcileStrengths(["Something new nobody mapped"], ["stability"], PRICING);
    expect(out).toEqual(["Something new nobody mapped"]);
  });
});

describe("siteAdvantages does not say the same thing twice", () => {
  test("the reported case — superlative wins, plain strength drops", () => {
    const out = dedupeAdvantagesByAxis([
      "Most stable interactions",
      STABLE,
    ]);
    expect(out).toEqual(["Most stable interactions"]);
  });

  test("all three real duplicate pairs collapse", () => {
    const out = dedupeAdvantagesByAxis([
      "Most stable interactions", "Best ARIA/accessibility labels", "Best semantic structure",
      STABLE, "Good ARIA labels for identification",
      "Clear semantic HTML structure",
    ]);
    expect(out.length).toBe(3);
    expect(out).toContain("Most stable interactions");
    expect(out).not.toContain(STABLE);
  });

  test("a plain strength with NO superlative is kept", () => {
    // /docs/home is best at nothing and must not lose its real strengths.
    const out = dedupeAdvantagesByAxis([
      "Good ARIA labels for identification",
      "Clear semantic HTML structure",
    ]);
    expect(out.length).toBe(2);
  });

  test("a QUALIFIED strength is still recognised as the same axis", () => {
    // The stem must be matched, or reconcileStrengths would defeat the dedupe.
    const out = dedupeAdvantagesByAxis([
      "Most stable interactions",
      `${STABLE} overall (stability 92), with 2 element(s) excepted`,
    ]);
    expect(out).toEqual(["Most stable interactions"]);
  });

  test("'Best overall AI readiness' is not an axis and always survives", () => {
    const out = dedupeAdvantagesByAxis([
      "Best overall AI readiness", STABLE,
    ]);
    expect(out).toContain("Best overall AI readiness");
    expect(out).toContain(STABLE);
  });

  test("exact repeats are removed too", () => {
    expect(dedupeAdvantagesByAxis(["Best semantic structure", "Best semantic structure"]))
      .toEqual(["Best semantic structure"]);
  });

  test("an empty list is not an error", () => {
    expect(dedupeAdvantagesByAxis([])).toEqual([]);
  });
});

describe("the deprecated comparison key is gone from every layer", () => {
  const read = async (rel: string) =>
    (await Bun.file(new URL(rel, import.meta.url)).text())
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  test("the MCP response layer forwards only the new name", async () => {
    // This layer assembles its response field by field, so a rename reaches it
    // only when someone remembers the list — that is how bestAgentPerceivability
    // shipped absent for a whole deploy. Both directions are pinned now.
    const code = await read("../src/mcp-tools/base/analysis-tools.ts");
    expect(code).toContain("bestAgentPerceivability: result.comparison.bestAgentPerceivability");
    expect(code).not.toContain("bestAccessibility");
  });

  test("the analysis result emits only the new name", async () => {
    const code = await read("../src/analysis/competitive-benchmark.ts");
    expect(code).toContain("bestAgentPerceivability: byAgentPerceivability[0]?.siteName");
    expect(code).not.toContain("bestAccessibility");
  });

  test("nothing in src reads scoreBreakdown.accessibility any more", async () => {
    for (const f of ["../src/analysis/competitive-benchmark.ts", "../src/cli.ts"]) {
      const code = await read(f);
      expect(code).not.toContain("scoreBreakdown.accessibility");
      expect(code).not.toContain("scoreBreakdown?.accessibility");
    }
  });
});
