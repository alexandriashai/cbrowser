/**
 * siteFamiliarity in cognitive_effort and site_cognitive_assessment is the
 * caller's value for the run, or 0.0 (a first visit). Nothing else.
 *
 * Through 20.x both tools ran a "binary gate on site knowledge": with site
 * knowledge, a persona whose stored familiarity was above 0.5 was raised to
 * 1.0; without it, everyone was forced to 0.0. No persona stores a
 * familiarity (personas.ts strips it), so the raise never fired -- but the
 * site-knowledge branch also left the trait UNSET, and the chain then read it
 * as chain.missingTraitCapacity, 0.5. So crawling a site moved every persona
 * from 0.0 to 0.5 by the back door, while the tool text told callers that
 * power-user and confident-user were "high-familiarity personas" that site
 * knowledge would upgrade.
 *
 * Since 21.0 (Stage C) the value reaches the chain as the demand's e on the
 * choosing time (Cockburn, Gutwin & Greenberg 2007), passed to
 * computeDemandDistribution, never written into a persona's traits.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveSiteFamiliarity } from "../src/mcp-tools/base/site-familiarity.js";
import { computeDemandFromRawMetrics, computeSequentialCTC } from "../src/visual/cognitive-transport-chain.js";
import { ROSTER, toolProfile } from "./fixtures/ctc-golden-matrix.js";
import { demandFromLegacy, legacySeconds } from "./fixtures/law-seconds.js";

const ROOT = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const EFFORT = read("src/mcp-tools/base/persona-comparison-tools.ts");
const AUDIT = read("src/mcp-tools/base/audit-tools.ts");

/** The body of one registerTool call, from its name to the next registerTool. */
function toolBlock(src: string, name: string): string {
  const at = src.indexOf(`registerTool("${name}"`);
  expect(at).toBeGreaterThan(-1);
  const next = src.indexOf("registerTool(", at + 1);
  return src.slice(at, next === -1 ? undefined : next);
}

describe("the value a run scores against", () => {
  test("is the caller's value when given, else 0.0, and site knowledge cannot change it", () => {
    for (const hasSiteKnowledge of [false, true]) {
      expect(resolveSiteFamiliarity(undefined, hasSiteKnowledge).value).toBe(0);
      for (const v of [0, 0.3, 0.5, 0.51, 1]) expect(resolveSiteFamiliarity(v, hasSiteKnowledge).value).toBe(v);
    }
  });

  test("site knowledge is still reported", () => {
    expect(resolveSiteFamiliarity(undefined, true).siteKnowledgeAvailable).toBe(true);
    expect(resolveSiteFamiliarity(undefined, false).siteKnowledgeAvailable).toBe(false);
    expect(resolveSiteFamiliarity(0.8, true).source).toMatch(/supplied/);
    expect(resolveSiteFamiliarity(undefined, true).source).toMatch(/first visit/);
  });

  test("the old back door is closed: a persona's trait, set, unset or 1, changes nothing; only the run's value does", () => {
    // Through 20.x leaving the trait undefined read 0.5. The chain no longer
    // reads a siteFamiliarity trait at all, so there is no back door to leave
    // open: the run's value reaches it through the demand only.
    const [name, p] = ["power-user", ROSTER["power-user"]];
    const prof = toolProfile(name, p);
    const deep = demandFromLegacy(0.6, 0.6, 30, 0.6, 0.3, 10, 12);
    const unset = { ...prof, traits: { ...prof.traits } };
    delete (unset.traits as Record<string, number>).siteFamiliarity;
    const daily = { ...prof, traits: { ...prof.traits, siteFamiliarity: 1 } };
    const base = computeSequentialCTC(prof, deep).rawCTC;
    expect(computeSequentialCTC(unset, deep).rawCTC).toBe(base);
    expect(computeSequentialCTC(daily, deep).rawCTC).toBe(base);
    const s = legacySeconds({ informationDensity: 0.6, interactiveElementCount: 30, textDensity: 0.6, choiceCount: 10 });
    const familiar = computeDemandFromRawMetrics(0.6, 0.6, 0.6, 0.3, 12, s.pointingSeconds, s.choosingSeconds, s.readingSeconds, s.procedureSeconds, s.choosingSecondsExpert, { siteFamiliarity: 1 });
    // power-user's abilities exceed this page's choosing demand at any e, so the
    // run's familiarity is shown on a persona whose abilities fall short of it.
    const novice = toolProfile("first-timer", ROSTER["first-timer"]);
    expect(computeSequentialCTC(novice, familiar).rawCTC).toBeLessThan(computeSequentialCTC(novice, deep).rawCTC);
  });
});

describe("both tools use the resolver and nothing else", () => {
  for (const [label, block] of [
    ["cognitive_effort", toolBlock(EFFORT, "cognitive_effort")],
    ["site_cognitive_assessment", toolBlock(AUDIT, "site_cognitive_assessment")],
  ] as const) {
    test(`${label}: sets siteFamiliarity from resolveSiteFamiliarity, with no site-knowledge branch`, () => {
      expect(block).toContain("resolveSiteFamiliarity(");
      // The run's value goes to the demand, not into the persona's traits.
      expect(block).toMatch(/computeDemandDistribution\(pageMetrics, (\{ siteFamiliarity: familiarity\.value \}|demandOptions)\)/);
      expect(block).not.toMatch(/traits\.siteFamiliarity =/);
      expect(block).not.toMatch(/traits\.siteFamiliarity = 1(\.0)?;/);
      expect(block).not.toMatch(/(reqFam|requestedFamiliarity) > 0\.5/);
      expect(block).not.toMatch(/familiarityWarning/);
    });

    test(`${label}: its text no longer claims high-familiarity personas or a site-knowledge upgrade`, () => {
      expect(block).not.toMatch(/high-familiarity/i);
      expect(block).not.toMatch(/power-user, confident-user/);
      expect(block).not.toMatch(/downgrade/i);
    });
  }

  test("the server instructions and site_model_status say the same", () => {
    const instructions = read("src/mcp-server-remote.ts");
    const status = toolBlock(read("src/mcp-tools/base/site-knowledge-tools.ts"), "site_model_status");
    for (const text of [instructions, status]) {
      expect(text).not.toMatch(/high-familiarity personas/i);
      expect(text).not.toMatch(/automatically downgraded/i);
    }
  });
});
