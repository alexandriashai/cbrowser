/**
 * The persona, trait and version claims in skill/SKILL.md and manifest.json are
 * the code's. tests/doc-tool-counts.test.ts pins tool counts only, so an outside
 * review (2026-11-21) still found SKILL.md saying "(v18.69.3)", "25 cognitive
 * traits", "6 built-in personas" and listing `explore` as keyless, which 20.0
 * removed. Pure: no browser.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUILTIN_PERSONAS, ACCESSIBILITY_PERSONAS, EMOTIONAL_PERSONAS, AGENT_PERSONAS } from "../src/personas.js";
import { TRAIT_DEFINITIONS } from "../src/trait-reference.js";

const ROOT = join(import.meta.dir, "..");
const SKILL = readFileSync(join(ROOT, "skill/SKILL.md"), "utf8");
const MANIFEST = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")) as { description: string };
const description = /^description: (.*)$/m.exec(SKILL)![1];

const n = (o: object) => Object.keys(o).length;
const builtIn = n(BUILTIN_PERSONAS) + n(ACCESSIBILITY_PERSONAS);
const human = builtIn + n(EMOTIONAL_PERSONAS);
const agent = n(AGENT_PERSONAS);
const traits = n(TRAIT_DEFINITIONS);

describe("skill/SKILL.md states the code's counts", () => {
  test("the description's persona and trait counts", () => {
    expect(description).toContain(`${human + agent} personas (${human} human, ${agent} agent)`);
    expect(description).toContain(`${traits} cognitive traits`);
  });

  test("the description carries no version, so it cannot go stale", () => {
    expect(description).not.toMatch(/\bv\d+\.\d+/);
  });

  test("every 'N built-in personas' is the built-in count", () => {
    const stated = [...SKILL.matchAll(/(\d+) built-in personas/g)].map((m) => Number(m[1]));
    expect(stated.length).toBeGreaterThan(0);
    for (const k of stated) expect(k).toBe(builtIn);
  });

  test("no keyed command sits in the keyless column", () => {
    const rows = SKILL.slice(SKILL.indexOf("| Free (keyless) |"), SKILL.indexOf("\n\n", SKILL.indexOf("| Free (keyless) |")))
      .split("\n").slice(2);
    expect(rows.length).toBeGreaterThan(2);
    for (const row of rows) {
      const free = row.split("|")[1];
      for (const keyed of ["explore", "journey", "compare-personas", "visual-cognitive-story"]) {
        expect(free, row).not.toContain(`\`${keyed}\``);
      }
    }
  });
});

describe("manifest.json states the code's trait count", () => {
  test("N traits", () => {
    expect(MANIFEST.description).toContain(`${traits} traits`);
  });
});
