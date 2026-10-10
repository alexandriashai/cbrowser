/**
 * ai_benchmark compares sites by stable check ids, not by description text.
 *
 * Measured 2026-10-10 on the live 19.3.6 server, cbrowser.ai vs ucdenver.edu
 * (report v8 B28):
 *
 *   commonIssues: "sticky element may intercept clicks (z-index: 50, 1280x57px, ...)",
 *                 "Element lacks stable selectors (score: 0/10)",
 *                 "Element lacks stable selectors (score: 2/10)"
 *     -- all three are cbrowser.ai's own top three. With two sites the
 *        threshold ceil(n/2) is 1, so every issue of every site was "common";
 *        and the last two are one check, split by the per-element score in the
 *        description.
 *   ucdenver.edu topIssues: "Hidden select with custom UI - agents may not
 *     find options" x3 -- slice(0, 3) of raw issues, no grouping.
 *   ucdenver.edu: "Dynamic selectors break automation" -> "cbrowser.ai (85)
 *     does not have this issue", while cbrowser.ai had a sticky-element issue
 *     on that same stability axis. And the stability axis does not score
 *     selectors at all; findability does.
 *
 * Correction to the report: ucdenver's FULL audit does fail sticky-element-check
 * and findability-score-check, so those two really are common to both sites.
 * The fix lists them, once each, because it reads every check, not the top three.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
// A namespace import, so a missing export fails each test that needs it rather
// than the whole file at load time.
import * as benchmark from "../src/analysis/competitive-benchmark.js";
import type { AgentReadyIssue, AIBenchmarkCheck, AIBenchmarkSiteResult } from "../src/types.js";

const { generateAIComparison, pickBetterReference, topIssueGroups } = benchmark;

const issue = (
  detectionMethod: string,
  description: string,
  category: AgentReadyIssue["category"] = "stability",
  severity: AgentReadyIssue["severity"] = "medium",
): AgentReadyIssue => ({
  category, severity, element: "x", description, detectionMethod, recommendation: "fix it",
});

/**
 * A completed site result in the shape runAIReadinessBenchmark returns. Built
 * here by hand, not with the module's own helpers, so a fixture cannot inherit
 * a bug from the code under test. Top issues are the first three checks.
 */
const site = (
  siteName: string,
  score: number,
  issues: AgentReadyIssue[],
  breakdown: Partial<{ findability: number; stability: number; agentPerceivability: number; semantics: number }> = {},
): AIBenchmarkSiteResult => {
  const byCheck = new Map<string, AIBenchmarkCheck>();
  for (const i of issues) {
    const c = byCheck.get(i.detectionMethod)
      ?? { id: i.detectionMethod, category: String(i.category), descriptions: [] };
    c.descriptions.push(i.description);
    byCheck.set(i.detectionMethod, c);
  }
  const checks = [...byCheck.values()];
  const top = checks.slice(0, 3);
  return {
    url: `https://${siteName}/`,
    siteName,
    grade: "B",
    score,
    scoreBreakdown: {
      overall: score, findability: 90, stability: 90, agentPerceivability: 90, semantics: 90, ...breakdown,
    },
    topIssues: top.map((c) => c.descriptions[0]),
    topIssueCategories: top.map((c) => c.category),
    topIssueChecks: top.map((c) => c.id),
    checks,
    strengths: [],
    weaknesses: top.map((c) => c.descriptions[0]),
    weaknessKeys: top.map((c) => ({ check: c.id })),
    duration: 1,
    auditStatus: "complete",
  };
};

const HIDDEN_SELECT = "Hidden select with custom UI - agents may not find options";
const sticky = (z: number, w: number) =>
  issue("sticky-element-check", `sticky element may intercept clicks (z-index: ${z}, ${w}x57px, spans the viewport width)`);
const selectors = (n: number) =>
  issue("findability-score-check", `Element lacks stable selectors (score: ${n}/10)`, "findability");

describe("commonIssues counts distinct sites per check", () => {
  test("two sites with no check in common have no common issues", () => {
    // Site A: three different checks. Site B: one check, three times. On the
    // base, ceil(2/2) = 1 made all of A's top three common, and B's repeat
    // counted 3 toward its own description.
    const a = site("a.example", 85, [
      issue("x-check", "x issue"), issue("y-check", "y issue"), issue("z-check", "z issue"),
    ]);
    const b = site("b.example", 70, [
      issue("hidden-select-check", HIDDEN_SELECT),
      issue("hidden-select-check", HIDDEN_SELECT),
      issue("hidden-select-check", HIDDEN_SELECT),
    ]);
    expect(generateAIComparison([a, b]).commonIssues).toEqual([]);
  });

  test("a shared check is listed once, even when its descriptions differ", () => {
    const cbrowser = site("cbrowser.ai", 85, [sticky(50, 1280), selectors(0), selectors(2)]);
    const ucdenver = site("ucdenver.edu", 69, [
      issue("hidden-select-check", HIDDEN_SELECT), sticky(10, 1440), selectors(4),
    ]);
    const common = generateAIComparison([cbrowser, ucdenver]).commonIssues;
    // Both checks really are on both sites, and each appears exactly once.
    expect(common.length).toBe(2);
    expect(common.filter((c) => c.includes("intercept clicks")).length).toBe(1);
    expect(common.filter((c) => c.includes("stable selectors")).length).toBe(1);
    expect(common.some((c) => c.includes("Hidden select"))).toBe(false);
    // Each line says how many sites share it and summarizes every match.
    expect(common).toContain("2 of 2 sites: 3 elements lack stable selectors (scores: 0-4/10)");
    expect(common).toContain("2 of 2 sites: 2 sticky elements may intercept clicks (z-index: 10-50)");
  });

  test("a check outside a site's top three still counts", () => {
    // ucdenver's sticky and selector hits sit behind higher-severity checks.
    const a = site("a.example", 85, [sticky(50, 1280)]);
    const b = site("b.example", 70, [
      issue("one-check", "one", "semantics", "critical"),
      issue("two-check", "two", "semantics", "critical"),
      issue("three-check", "three", "semantics", "critical"),
      sticky(20, 1200),
    ]);
    expect(b.topIssueChecks).not.toContain("sticky-element-check");
    expect(generateAIComparison([a, b]).commonIssues.length).toBe(1);
  });

  test("the threshold is at least two sites and at least half of them", () => {
    const shared = () => [sticky(50, 1280)];
    const four = [
      site("s1", 80, shared()), site("s2", 80, shared()), site("s3", 80, []), site("s4", 80, []),
    ];
    expect(generateAIComparison(four).commonIssues.length).toBe(1);
    const five = [...four, site("s5", 80, [])];
    expect(generateAIComparison(five).commonIssues).toEqual([]);
  });

  test("a failed audit is not counted as a site that lacks the check", () => {
    const failed: AIBenchmarkSiteResult = {
      url: "https://down.example/", siteName: "down.example", grade: null, score: null,
      scoreBreakdown: null, topIssues: [], strengths: [], weaknesses: ["Audit failed: timeout"],
      duration: 1, auditStatus: "failed",
    };
    const common = generateAIComparison([
      site("a", 80, [sticky(50, 1280)]), site("b", 80, [sticky(50, 1280)]), failed,
    ]).commonIssues;
    expect(common.length).toBe(1);
    expect(common[0].startsWith("2 of 2 sites: ")).toBe(true);
  });

  test("most widely shared first", () => {
    const sites = [
      site("s1", 80, [issue("rare-check", "rare"), sticky(50, 1280)]),
      site("s2", 80, [issue("rare-check", "rare"), sticky(50, 1280)]),
      site("s3", 80, [sticky(50, 1280)]),
      site("s4", 80, []),
    ];
    const common = generateAIComparison(sites).commonIssues;
    expect(common[0].startsWith("3 of 4 sites: ")).toBe(true);
    expect(common[1].startsWith("2 of 4 sites: ")).toBe(true);
  });
});

describe("topIssues is one entry per check", () => {
  test("the same check three times is one grouped entry", () => {
    const top = topIssueGroups([
      issue("hidden-select-check", HIDDEN_SELECT, "stability", "high"),
      issue("hidden-select-check", HIDDEN_SELECT, "stability", "high"),
      issue("hidden-select-check", HIDDEN_SELECT, "stability", "high"),
    ]);
    expect(top.length).toBe(1);
    expect(top[0].check).toBe("hidden-select-check");
    expect(top[0].summary).toBe(`3 ${HIDDEN_SELECT}`);
  });

  test("three slots hold three checks, worst severity first", () => {
    const top = topIssueGroups([
      issue("low-check", "low one", "semantics", "low"),
      issue("low-check", "low two", "semantics", "low"),
      issue("medium-check", "medium", "stability", "medium"),
      issue("other-low-check", "other low", "semantics", "low"),
      issue("critical-check", "critical", "findability", "critical"),
    ]);
    expect(top.map((g) => g.check)).toEqual(["critical-check", "medium-check", "low-check"]);
    expect(top.map((g) => g.category)).toEqual(["findability", "stability", "semantics"]);
  });

  test("siteChecks keeps every check, beyond the top three, once each", () => {
    const checks = benchmark.siteChecks([
      issue("a-check", "a1"), issue("b-check", "b1"), issue("a-check", "a2"),
      issue("c-check", "c1"), issue("d-check", "d1", "semantics"),
    ]);
    expect(checks.map((c) => c.id)).toEqual(["a-check", "b-check", "c-check", "d-check"]);
    expect(checks[0].descriptions).toEqual(["a1", "a2"]);
    expect(checks[3].category).toBe("semantics");
  });

  test("a group's line is true of every issue in it", () => {
    const [g] = topIssueGroups([selectors(0), selectors(2), selectors(2)]);
    expect(g.summary).toBe("3 elements lack stable selectors (scores: 0-2/10)");
  });
});

describe("a reference is matched on the check or the axis", () => {
  test("a candidate with the same sticky check is not a reference", () => {
    const subject = site("ucdenver.edu", 69, [sticky(10, 1440)]);
    const candidate = site("cbrowser.ai", 85, [sticky(50, 1280)]);
    expect(pickBetterReference([candidate], subject, { check: "sticky-element-check" })).toBeUndefined();
  });

  test("for an axis weakness, any issue on that axis disqualifies", () => {
    // The live case: ucdenver's stability weakness, cbrowser.ai's sticky issue.
    const subject = site("ucdenver.edu", 69, [], { stability: 52 });
    const candidate = site("cbrowser.ai", 85, [sticky(50, 1280)], { stability: 92 });
    expect(pickBetterReference([candidate], subject, { axis: "stability" })).toBeUndefined();
  });

  test("for an axis weakness, an axis score under 60 disqualifies", () => {
    const subject = site("weak", 60, [], { semantics: 40 });
    const candidate = site("also-weak", 85, [], { semantics: 55 });
    expect(pickBetterReference([candidate], subject, { axis: "semantics" })).toBeUndefined();
  });

  test("the deprecated accessibility category counts as agentPerceivability", () => {
    const subject = site("weak", 60, [], { agentPerceivability: 40 });
    const candidate = site("old", 85, [issue("img-alt-check", "Image missing alt", "accessibility" as never)]);
    expect(pickBetterReference([candidate], subject, { axis: "agentPerceivability" })).toBeUndefined();
  });

  test("a clean candidate is still offered for either key", () => {
    const subject = site("ucdenver.edu", 69, [sticky(10, 1440)], { stability: 52 });
    const clean = site("clean.example", 90, [selectors(3)]);
    expect(pickBetterReference([clean], subject, { check: "sticky-element-check" })?.siteName).toBe("clean.example");
    expect(pickBetterReference([clean], subject, { axis: "stability" })?.siteName).toBe("clean.example");
  });
});

describe("stability is described as what that axis scores", () => {
  test("no stability phrase claims selectors", () => {
    // findability is best on a, stability best on b: b's superlative is the
    // stability one, and it must not talk about selectors.
    const a = site("a.example", 90, [], { findability: 95, stability: 70 });
    const b = site("b.example", 80, [], { findability: 60, stability: 99 });
    const advantages = generateAIComparison([a, b]).siteAdvantages["b.example"];
    expect(advantages).toContain("Most stable interactions");
    expect(advantages.join(" ").toLowerCase()).not.toContain("selector");
  });

  test("the old selector wording is gone from the source", () => {
    const src = require("node:fs").readFileSync(
      new URL("../src/analysis/competitive-benchmark.ts", import.meta.url), "utf8") as string;
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code).not.toContain("Stable selectors that won't break");
    expect(code).not.toContain("Dynamic selectors break automation");
    expect(code).not.toContain("Most stable selectors");
  });
});
