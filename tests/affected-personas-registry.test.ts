/**
 * Every persona a barrier names in `affectedPersonas` must exist.
 *
 * Measured 2026-10-06 on a live tremor audit of cbrowser.ai: the payload's
 * affectedPersonas carried "motor-impairment-limited-mobility", and a scan of
 * every literal in the detectors found a second phantom,
 * "cognitive-memory-impairment". Neither is in the registry (10 builtin + 11
 * accessibility + 4 emotional + 4 agent). A customer who copies a name out of
 * a barrier and runs an audit with it gets UnknownPersonaError, so the report
 * was pointing at people the product cannot simulate.
 *
 * The assertion is quantified over every `affectedPersonas: [ ...literals ]`
 * in src/, not over the two names found, so a third phantom fails here too.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  BUILTIN_PERSONAS,
  ACCESSIBILITY_PERSONAS,
  EMOTIONAL_PERSONAS,
} from "../src/personas.js";
import { AGENT_PERSONAS } from "../src/agent-personas.js";

const SRC = join(import.meta.dir, "..", "src");

/** The shipped registry, exactly — no disk customs, no loose matching. */
const REGISTRY = new Set<string>([
  ...Object.keys(BUILTIN_PERSONAS),
  ...Object.keys(ACCESSIBILITY_PERSONAS),
  ...Object.keys(EMOTIONAL_PERSONAS),
  ...Object.keys(AGENT_PERSONAS),
]);

/**
 * Phantoms that live inside detectMotorBarriers, which the BUG-03 fix owns on
 * a parallel branch and this change may not edit (2026-10-07).
 *
 * Each entry is exempt ONLY inside the named function, so the name cannot
 * spread to a new detector under cover of this list. The last test fails once
 * the name is gone from that function, so the entry cannot outlive the fix --
 * but that only fires if someone removes the name, and BUG-03's branch keeps it
 * too (reviewer, 2026-10-07). The merge must therefore replace it at both
 * sites with ["motor-impairment-tremor", "elderly-low-vision"] (the two
 * registry personas with motor decline) and empty this list in the same step.
 */
// 2026-10-07 batch 2: BUG-03 replaced the phantom at both detectMotorBarriers sites
// with ["motor-impairment-tremor", "elderly-low-vision"], so the exemption is empty.
const PENDING_OUTSIDE_THIS_CHANGE: Array<{ name: string; fn: string }> = [];

const isPending = (s: { name: string; fn: string | null }) =>
  PENDING_OUTSIDE_THIS_CHANGE.some((p) => p.name === s.name && p.fn === s.fn);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

type Site = { file: string; line: number; name: string; fn: string | null };

/**
 * Every string literal inside an `affectedPersonas: [ ... ]` array in src/,
 * with the top-level function that encloses it.
 */
function literalSites(): Site[] {
  const sites: Site[] = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    const fns = [...text.matchAll(/^(?:export )?(?:async )?function ([A-Za-z0-9_]+)/gm)]
      .map((f) => ({ at: f.index!, name: f[1] }));
    const re = /affectedPersonas:\s*\[([^\]]*)\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const line = text.slice(0, m.index).split("\n").length;
      const fn = fns.filter((f) => f.at < m!.index).pop()?.name ?? null;
      for (const lit of m[1].matchAll(/["'`]([^"'`]+)["'`]/g)) {
        sites.push({ file: relative(SRC, file), line, name: lit[1], fn });
      }
    }
  }
  return sites;
}

describe("affectedPersonas names resolve", () => {
  test("the sweep actually finds the detector literals", () => {
    // Guard against a regex that silently matches nothing and passes vacuously.
    const sites = literalSites();
    expect(sites.length).toBeGreaterThan(20);
    expect(sites.some((s) => s.file.endsWith("accessibility-empathy.ts"))).toBe(true);
  });

  test("every literal is a registry persona", () => {
    const phantoms = literalSites()
      .filter((s) => !REGISTRY.has(s.name) && !isPending(s))
      .map((s) => `${s.file}:${s.line} (${s.fn}) ${s.name}`);
    expect(phantoms).toEqual([]);
  });

  test("cognitive-memory-impairment is gone (the detectCognitiveBarriers phantom)", () => {
    const hits = literalSites().filter((s) => s.name === "cognitive-memory-impairment");
    expect(hits).toEqual([]);
  });

  test("the pending list is still needed — delete an entry once its phantom is fixed", () => {
    const sites = literalSites();
    for (const pending of PENDING_OUTSIDE_THIS_CHANGE) {
      expect(REGISTRY.has(pending.name), `${pending.name} is now a real persona`).toBe(false);
      expect(
        sites.some((s) => s.name === pending.name && s.fn === pending.fn),
        `${pending.name} no longer appears in ${pending.fn}; remove it from PENDING_OUTSIDE_THIS_CHANGE`,
      ).toBe(true);
    }
  });

  test("the function scoping works: a pending name outside its function is a phantom", () => {
    // Without this the scoping could silently return null for every site and
    // the exemption would never match -- or match everything.
    const sites = literalSites();
    const motor = sites.filter((s) => s.fn === "detectMotorBarriers");
    expect(motor.length).toBeGreaterThan(0);
    expect(isPending({ name: "motor-impairment-limited-mobility", fn: "detectCognitiveBarriers" })).toBe(false);
  });
});
