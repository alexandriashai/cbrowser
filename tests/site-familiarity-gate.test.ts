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
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveSiteFamiliarity } from "../src/mcp-tools/base/site-familiarity.js";
import { computeDemandFromRawMetrics, computeSequentialCTC } from "../src/visual/cognitive-transport-chain.js";
import { ROSTER, toolProfile } from "./fixtures/ctc-golden-matrix.js";
import { demandFromLegacy } from "./fixtures/law-seconds.js";

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

  test("the old back door was real: an unset familiarity scores differently from 0.0 on a deep page", () => {
    // Why the value must always be SET: leaving it undefined reads 0.5.
    const [name, p] = ["power-user", ROSTER["power-user"]];
    const prof = toolProfile(name, p);
    const deep = demandFromLegacy(0.6, 0.6, 30, 0.6, 0.3, 10, 12);
    const unset = { ...prof, traits: { ...prof.traits } };
    delete (unset.traits as Record<string, number>).siteFamiliarity;
    expect(computeSequentialCTC(unset, deep).totalCTC).not.toBe(computeSequentialCTC(prof, deep).totalCTC);
  });
});

describe("both tools use the resolver and nothing else", () => {
  for (const [label, block] of [
    ["cognitive_effort", toolBlock(EFFORT, "cognitive_effort")],
    ["site_cognitive_assessment", toolBlock(AUDIT, "site_cognitive_assessment")],
  ] as const) {
    test(`${label}: sets siteFamiliarity from resolveSiteFamiliarity, with no site-knowledge branch`, () => {
      expect(block).toContain("resolveSiteFamiliarity(");
      expect(block).toMatch(/traits\.siteFamiliarity = \w+\.value/);
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
