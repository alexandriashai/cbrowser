/**
 * remediation_patches' quickWins must count the cheap fixes it recommends.
 *
 * Measured 2026-10-10 on cbrowser.ai (report item B38): 13 patches, 12 of
 * them trivial, byImpact { medium: 13 }, quickWins 0. summarizePatches
 * required impact "high", but deriveImpact rates a trivial fix for a
 * low-severity finding "medium" -- which is how every findability data-testid
 * patch comes out.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { describe, test, expect } from "bun:test";
import { generatePatch, summarizePatches, type RemediationPatch } from "../src/remediation/patch-generator.js";
import type { AgentReadyIssue } from "../src/types.js";

const patch = (effort: RemediationPatch["effort"], impact: RemediationPatch["impact"]): RemediationPatch => ({
  issueId: "x", category: "findability", description: "d", before: "", after: "", explanation: "",
  effort, impact,
});

describe("quickWins", () => {
  test("the cbrowser.ai shape: 12 trivial/medium + 1 medium/medium is 12 quick wins", () => {
    const patches = [...Array.from({ length: 12 }, () => patch("trivial", "medium")), patch("medium", "medium")];
    expect(summarizePatches(patches).quickWins).toBe(12);
  });

  test("cheap and worth it counts; not worth it, or not cheap, does not", () => {
    expect(summarizePatches([patch("easy", "high")]).quickWins).toBe(1);
    expect(summarizePatches([patch("easy", "medium")]).quickWins).toBe(1);
    expect(summarizePatches([patch("trivial", "low")]).quickWins).toBe(0);
    expect(summarizePatches([patch("medium", "high")]).quickWins).toBe(0);
    expect(summarizePatches([patch("hard", "high")]).quickWins).toBe(0);
  });

  test("a low-severity findability finding, through the shipped patch path, is a quick win", () => {
    const issue = {
      category: "findability",
      severity: "low",
      element: "a",
      description: "Element lacks stable selectors (score: 0/10)",
      detectionMethod: "findability-score-check",
      recommendation: "Add data-testid for stable automation selectors",
      codeExample: '<a data-testid="pricing" href="/pricing">',
    } as AgentReadyIssue;
    const p = generatePatch(issue);
    expect([p.effort, p.impact]).toEqual(["trivial", "medium"]);
    expect(summarizePatches([p]).quickWins).toBe(1);
  });
});
