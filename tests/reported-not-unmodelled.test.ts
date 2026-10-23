/**
 * Two fields that looked like they did nothing, and did not.
 *
 * BUG-12 · `crowdingSensitivity` was reported as "either unused or
 * used-and-unreported". It is used, twice: weighted 0.15 into readingCapacity,
 * and priced per text block. It was invisible because Pelli's critical-spacing
 * effect only begins below 16px and every page tested set body text at 16px or
 * larger, so the penalty evaluated to exactly 0 and the prose list -- which
 * gates every component behind its own threshold -- simply omitted it.
 *
 * Absent and unmodelled looked identical. That is the defect, not the zero.
 *
 * BUG-08 · `decisionStyle` was emitted behind a TRUTHINESS guard, so the one
 * case it needed to describe -- null, because the top two styles were within
 * threshold -- was the case where the key vanished. The payload shipped
 * `decisionStyleSource: "suppressed"` describing a field it had omitted.
 *
 * @since 2026-08-03
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dir, "..", "src");
const block = (fontSize: number, contrastRatio = 7) => ([{
  text: "The interdisciplinary undergraduate admissions process requires comprehensive documentation.",
  fontSize, lineHeight: 1.5, fontFamily: "sans-serif", isSerif: false, contrastRatio,
}] as never);

async function readFor(name: string, fontSize: number) {
  const { readability } = await import("../src/visual/cognitive-models.js");
  const { getAnyPersona } = await import("../src/personas.js");
  const p = getAnyPersona(name)!;
  const acc = (p as never as { accessibilityTraits?: Record<string, number> }).accessibilityTraits;
  const r = readability(block(fontSize), { name, accessibilityTraits: acc } as never);
  return r.blocks[0] as unknown as {
    penalties: string[];
    fixationDuration: number;
    penaltyBreakdown: Record<string, number>;
    wordsPerMinute: number;
  };
}

describe("crowdingSensitivity is modelled, and now visibly so (BUG-12)", () => {
  test("it prices small text, and scales with the persona's sensitivity", async () => {
    // 0.20 / 0.55 / 0.70 sensitivities must produce an increasing penalty on
    // the same 13px text, or the trait really is inert.
    const adhd = (await readFor("cognitive-adhd", 13)).penaltyBreakdown.crowdingMs;
    const dys = (await readFor("dyslexic-user", 13)).penaltyBreakdown.crowdingMs;
    const lv = (await readFor("low-vision-magnified", 13)).penaltyBreakdown.crowdingMs;
    expect(adhd).toBeGreaterThan(0);
    expect(dys).toBeGreaterThan(adhd);
    expect(lv).toBeGreaterThan(dys);
  });

  test("it is zero above 16px, which is the finding, not the bug", async () => {
    // Pelli et al. 2004: crowding begins below the critical spacing. A page at
    // 16px legitimately costs nobody anything here.
    for (const n of ["cognitive-adhd", "dyslexic-user", "low-vision-magnified"]) {
      expect((await readFor(n, 16)).penaltyBreakdown.crowdingMs).toBe(0);
    }
  });

  test("the zero is REPORTED rather than omitted", async () => {
    // The whole fix. A key present with value 0 says "evaluated, does not
    // apply"; a missing key says nothing at all, and that ambiguity is what
    // made a working trait look inert.
    const b = await readFor("cognitive-adhd", 16);
    expect(b.penaltyBreakdown).toHaveProperty("crowdingMs");
    expect(b.penaltyBreakdown.crowdingMs).toBe(0);
    // And it is genuinely absent from the prose list at that size, which is why
    // the prose list alone was not enough.
    expect(b.penalties.join(" ")).not.toContain("crowding");
  });

  test("every component ships, not just the one that was complained about", async () => {
    const b = await readFor("dyslexic-user", 16);
    for (const k of ["baseFixationMs", "orthographicMs", "phonologicalMs", "visualSpanMs",
      "vocabularyMs", "crowdingMs", "serifFontMs", "lowContrastMs"]) {
      expect({ k, present: k in b.penaltyBreakdown }).toEqual({ k, present: true });
    }
    // At least one of them is zero here, or this test is not exercising the
    // case it exists for.
    expect(Object.values(b.penaltyBreakdown).some((v) => v === 0)).toBe(true);
  });

  test("the components sum to the fixation duration they explain", async () => {
    const b = await readFor("dyslexic-user", 13);
    const sum = Object.values(b.penaltyBreakdown).reduce((a, v) => a + v, 0);
    // Within rounding of the duration the components explain. The reported wpm
    // is 238 (the reference reader) x the neurotypical neutral time over it, not
    // 60000 / duration, since Stage B.
    expect(Math.abs(sum - b.fixationDuration)).toBeLessThan(4);
    expect(Math.abs(b.wordsPerMinute - 238 * 270 / b.fixationDuration)).toBeLessThan(1);
  });

  test("the tool emits it with a note saying what a zero means", () => {
    const tool = readFileSync(join(SRC, "mcp-tools", "base", "persona-comparison-tools.ts"), "utf8");
    expect(tool).toContain("hardestBlockPenaltyMs");
    expect(tool).toContain("evaluated and does not apply");
    // And says where crowding does and does not reach, so "does it do anything"
    // has a full answer: not readingCapacity since Stage B, only this audit.
    expect(tool).not.toContain("0.15 weight into readingCapacity");
    expect(tool).toContain("crowdingSensitivity does not enter readingCapacity");
  });
});

describe("a suppressed decisionStyle says so (BUG-08)", () => {
  test("the profile returns null plus the flag and the threshold", async () => {
    const { createCognitivePersona, getCognitiveProfile } = await import("../src/personas.js");
    const p = createCognitivePersona("tie-probe-3", "probe", {
      patience: 0.5, satisficing: 0.5, riskTolerance: 0.5,
      metacognitivePlanning: 0.5, informationForaging: 0.5, comprehension: 0.5,
    } as never);
    delete (p as never as { behaviors: Record<string, unknown> }).behaviors.decisionStyle;
    const prof = getCognitiveProfile(p) as never as Record<string, unknown>;
    expect(prof.decisionStyle).toBeNull();
    expect(prof.decisionStyleSuppressed).toBe(true);
    expect(prof.decisionStyleThreshold).toBe(0.05);
  });

  test("the payload guard is not truthiness, which dropped exactly the null case", () => {
    const src = readFileSync(join(SRC, "mcp-tools", "base", "values-tools.ts"), "utf8");
    // `profile?.decisionStyle ? {...} : {}` omitted the key precisely when the
    // value was null -- the one case the field needed to communicate.
    expect(src).not.toMatch(/\.\.\.\(profile\?\.decisionStyle \? \{ decisionStyle/);
    expect(src).toContain('"decisionStyle" in profile');
    expect(src).toContain("decisionStyle: profile.decisionStyle ?? null");
  });

  test("suppression ships the flag, the threshold and the reason", () => {
    const src = readFileSync(join(SRC, "mcp-tools", "base", "values-tools.ts"), "utf8");
    const seg = src.slice(src.indexOf("decisionStyleSuppressed ?"), src.indexOf("decisionStyleSuppressed ?") + 700);
    expect(seg).toContain("decisionStyleThreshold: profile.decisionStyleThreshold");
    expect(seg).toContain("decisionStyleNote");
  });

  test("a source of 'suppressed' can no longer describe an absent field", () => {
    // The contradiction that made this reportable: the payload asserted a
    // provenance for a key it had not included.
    const src = readFileSync(join(SRC, "mcp-tools", "base", "values-tools.ts"), "utf8");
    const emitsSource = src.includes("decisionStyleSource: profile.decisionStyleSource");
    const emitsValue = src.includes('"decisionStyle" in profile');
    expect({ emitsSource, emitsValue }).toEqual({ emitsSource: true, emitsValue: true });
  });
});
