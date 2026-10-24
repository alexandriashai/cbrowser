/**
 * The published laws Stage B grounds demand in (src/visual/demand-laws.ts),
 * their registry (provenance/laws.ts) and the profile registry beside it
 * (provenance/profiles.ts).
 *
 * Registry: every law id is read by the law functions and every one moves an
 * output when perturbed, so no entry describes a number the code does not
 * use; published entries name a dated source and quote it. No-literal scan:
 * demand-laws.ts carries no numeric literal but 0, 1, 2 and the named
 * seconds-per-minute unit. Laws: worked values from the papers' own numbers,
 * then properties (fast-check): monotone in distance and inverse width, zero
 * work gives zero time, d in [0, 1) for T >= 0, c in (0, 1), and d > c exactly
 * when the persona's own time exceeds the budget. Profiles: every profile id is
 * read by cognitive-models.ts at use and moves its output, and the fixation
 * terms reproduce computeReadingDifficulty.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import fc from "fast-check";
import { LAW_PROVENANCE } from "../src/visual/provenance/laws.js";
import { PROFILE_PROVENANCE } from "../src/visual/provenance/profiles.js";
import { MODEL_PROVENANCE, param, startProvenanceRecording, stopProvenanceRecording, withParamOverrides } from "../src/visual/model-provenance.js";
import {
  fittsIndexOfDifficulty, fittsMovementTime, smallerOfWidth, pointingSeconds, distanceToScreenCentre,
  noviceSearchSeconds, hickHymanSeconds, choosingSeconds, wordsReadingSeconds, lettersReadingSeconds, readingSeconds, labelReadingSeconds,
  klmSeconds, timeDemand, rateCapacity, pointingCapacity, readingCapacity, measuredRate, type MeasuredPopulation,
} from "../src/visual/demand-laws.js";
import { KNOWN_POINTING_PROFILES, KNOWN_READING_PROFILES, computeReadingDifficulty, getPointingProfile, type ReadingProfile } from "../src/visual/cognitive-models.js";

const SRC = join(import.meta.dir, "..", "src", "visual", "demand-laws.ts");
const close = (a: number, b: number, eps = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(eps);
const POPULATIONS: MeasuredPopulation[] = ["motionImpaired", "dyslexiaAdults", "lowVisionCentralLoss", "lowVisionIntactFields", "aphasiaReadingImpaired"];

/** Every law function on inputs where every registered constant matters (a sub-pixel width reaches the floor). */
function exercise(): number[] {
  const targets = [{ distance: 400, width: 120, height: 32 }, { distance: 900, width: 16, height: 16 }, { distance: 50, width: 0.4, height: 20 }];
  return [
    fittsIndexOfDifficulty(300, 24), fittsMovementTime(300, 24), fittsMovementTime(10, 0),
    pointingSeconds(targets), pointingSeconds(targets, 7),
    distanceToScreenCentre({ x: 10, y: 2500, width: 40, height: 20 }, { viewportWidth: 1920, viewportHeight: 1080, scrollY: 0 }, "full_page"),
    noviceSearchSeconds(9), hickHymanSeconds(9),
    choosingSeconds([{ size: 6 }, { size: 4, each: true }]), choosingSeconds([{ size: 6 }, { size: 4, each: true }], "expert", 5),
    lettersReadingSeconds(5000), readingSeconds({ letters: 3000, abjadWords: 400, cjkChars: 900 }), labelReadingSeconds(12),
    klmSeconds(4), timeDemand(30), pointingCapacity(3.1), readingCapacity(150),
    ...POPULATIONS.flatMap((p) => { const m = measuredRate(p); return [m.rate, m.control, m.ratio]; }),
  ];
}

/** Ids whose value scaled by 1.1 (or 0.9) moves no output of `build`. */
function deadIds(ids: Array<{ id: string; value: number }>, build: () => number[] = exercise): string[] {
  const base = JSON.stringify(build());
  const moves = (id: string, v: number) => JSON.stringify(withParamOverrides({ [id]: v }, build)) !== base;
  return ids.filter(({ id, value }) => !moves(id, value * 1.1) && !moves(id, value * 0.9)).map((e) => e.id);
}

describe("law registry (provenance/laws.ts)", () => {
  const ids = new Set(LAW_PROVENANCE.map((e) => e.id));

  test("pinned, unique, law-prefixed, merged into MODEL_PROVENANCE", () => {
    // 21 at registration (Stage B phase 2a): 13 law constants, the time budget,
    // and 7 measured rates. 23 with Stage C's aphasia and control reading times
    // (Webster, Morris, Howard & Garraffa 2018); 24 with the menu label's first
    // read (ISC-76).
    expect(LAW_PROVENANCE.length).toBe(24);
    expect(ids.size).toBe(24);
    for (const e of LAW_PROVENANCE) {
      expect(e.id.startsWith("law.")).toBe(true);
      expect(Number.isFinite(e.value)).toBe(true);
      expect(MODEL_PROVENANCE[e.id]).toBe(e);
    }
  });

  test("the values are the sources' numbers, in seconds where a time", () => {
    const v = Object.fromEntries(LAW_PROVENANCE.map((e) => [e.id.slice(4), e.value]));
    expect(v).toEqual({
      "fitts.intercept": 0.23, "fitts.slope": 0.166, "fitts.minWidth": 1,
      "search.intercept": 0.3, "search.slope": 0.08, "hick.intercept": 0.24, "hick.slope": 0.08,
      "reading.wpm": 238, "reading.lettersPerWord": 4.6, "reading.abjadWpm": 181, "reading.cjkWpm": 260, "reading.cjkCharsPerWord": 1.5,
      "reading.labelFirstRead": 0.13,
      "klm.mentalPreparation": 1.35, timeBudget: 12.4,
      "rate.pointing.reference": 4.9, "rate.pointing.motionImpaired": 1.77, "rate.pointing.motionImpairedControls": 4.88,
      "rate.reading.dyslexiaAdults": 184.63, "rate.reading.dyslexiaControls": 243.64,
      "rate.reading.lowVisionCentralLoss": 25, "rate.reading.lowVisionIntactFields": 130,
      "rate.reading.aphasiaReadingImpairedSeconds": 71, "rate.reading.aphasiaControlsSeconds": 30,
    });
  });

  test("published entries name a dated source and quote it; the rest say why they are not published", () => {
    expect(LAW_PROVENANCE.filter((e) => e.status !== "published").map((e) => `${e.id}:${e.status}`))
      .toEqual(["law.fitts.minWidth:definition", "law.reading.labelFirstRead:hypothesis", "law.timeBudget:hypothesis"]);
    for (const e of LAW_PROVENANCE) {
      expect(e.source.trim().length).toBeGreaterThan(80);
      if (e.status === "published") {
        expect({ id: e.id, dated: /\(\d{4}\)/.test(e.source) }).toEqual({ id: e.id, dated: true });
        expect({ id: e.id, quoted: /"[^"]{8,}"/.test(e.source) }).toEqual({ id: e.id, quoted: true });
      }
      if (e.status === "hypothesis") expect(e.source).toMatch(/would (fit|set|test|place|replace)/);
    }
  });

  test("every law id is read by the law functions, and only registered ids are", () => {
    startProvenanceRecording();
    exercise();
    const read = stopProvenanceRecording();
    expect([...ids].filter((id) => !read.has(id))).toEqual([]);
    expect([...read].filter((id) => !(id in MODEL_PROVENANCE))).toEqual([]);
    expect([...read].filter((id) => !id.startsWith("law."))).toEqual([]);
  });

  test("every law id, scaled by 1.1 or 0.9, moves an output (no dead entries)", () => {
    expect(deadIds(LAW_PROVENANCE)).toEqual([]);
  });

  test("the dead-entry check goes red on a constant read but overruled (absence test)", () => {
    const slope = LAW_PROVENANCE.find((e) => e.id === "law.fitts.slope")!;
    const live = LAW_PROVENANCE.find((e) => e.id === "law.klm.mentalPreparation")!;
    const pinned = () => withParamOverrides({ [slope.id]: slope.value }, exercise);
    expect(deadIds([slope, live], pinned)).toEqual(["law.fitts.slope"]);
  });
});

/** Numeric literals in demand-laws.ts other than 0, 1, 2 and the seconds-per-minute unit. */
export function lawLiterals(source: string): Array<{ value: number; line: number }> {
  const sf = ts.createSourceFile("demand-laws.ts", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: Array<{ value: number; line: number }> = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "SECONDS_PER_MINUTE") return;
    if (ts.isNumericLiteral(node) && ![0, 1, 2].includes(Number(node.text))) {
      found.push({ value: Number(node.text), line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe("demand-laws.ts carries no inline constants", () => {
  const source = readFileSync(SRC, "utf8");

  test("only 0, 1, 2 and the named unit appear as numeric literals", () => {
    expect(lawLiterals(source)).toEqual([]);
    expect(source).toContain("const SECONDS_PER_MINUTE = 60;");
  });

  test("the scan goes red on a constant put back inline (absence test)", () => {
    const marker = 'param("law.search.slope") * items';
    expect(source).toContain(marker);
    expect(lawLiterals(source.replace(marker, "0.08 * items")).map((o) => o.value)).toEqual([0.08]);
  });
});

describe("the laws, on the sources' own numbers", () => {
  test("Fitts: ID = log2(D/W + 1), MT = 0.230 + 0.166 ID, width floored at 1 px, SMALLER-OF", () => {
    close(fittsIndexOfDifficulty(24, 24), 1);
    close(fittsMovementTime(24, 24), 0.396);
    close(fittsMovementTime(0, 40), 0.23);
    close(fittsIndexOfDifficulty(10, 0), Math.log2(11));
    close(fittsIndexOfDifficulty(10, 0.4), Math.log2(11));
    expect(smallerOfWidth(130, 22)).toBe(22);
  });

  test("pointing sums every target once and scales a capped list to its count", () => {
    expect(pointingSeconds([])).toBe(0);
    const two = [{ distance: 300, width: 40, height: 20 }, { distance: 700, width: 12, height: 30 }];
    const sum = fittsMovementTime(300, 20) + fittsMovementTime(700, 12);
    close(pointingSeconds(two), sum);
    close(pointingSeconds(two, 6), sum * 3);
    expect(() => pointingSeconds(two, 1)).toThrow(/below/);
    expect(() => pointingSeconds([], 3)).toThrow(/no items/);
  });

  test("the pointer starts at the centre of the screen the target is seen on", () => {
    const view = { viewportWidth: 1000, viewportHeight: 800, scrollY: 1600 };
    close(distanceToScreenCentre({ x: 480, y: 1980, width: 40, height: 40 }, view, "viewport"), 0);
    // full_page: centre y 2000 lies in the band 1600-2400, whose centre is 2000.
    close(distanceToScreenCentre({ x: 480, y: 1980, width: 40, height: 40 }, { ...view, scrollY: 0 }, "full_page"), 0);
    close(distanceToScreenCentre({ x: 0, y: 0, width: 0, height: 0 }, { ...view, scrollY: 0 }, "full_page"), Math.hypot(500, 400));
  });

  test("Cockburn et al.: novice 0.30 + 0.08 n, expert 0.24 + 0.08 log2 n, an empty group is no choice", () => {
    close(noviceSearchSeconds(10), 1.1);
    close(hickHymanSeconds(8), 0.48);
    close(hickHymanSeconds(1), 0.24);
    expect(noviceSearchSeconds(0)).toBe(0);
    expect(hickHymanSeconds(0)).toBe(0);
    expect(() => noviceSearchSeconds(0.5)).toThrow(/at least 1/);
  });

  test("a checkbox group of n is n yes/no decisions and costs more than one choice among n", () => {
    close(choosingSeconds([{ size: 3, each: true }]), 3 * 0.38);
    close(choosingSeconds([{ size: 3 }]), 0.54);
    close(choosingSeconds([{ size: 3, each: true }], "expert"), 3 * 0.32);
    expect(choosingSeconds([])).toBe(0);
    close(choosingSeconds([{ size: 3 }, { size: 5 }], "novice", 4), (0.54 + 0.7) * 2);
  });

  test("Brysbaert: 238 x 4.6 letters a minute; Arabic 181 wpm; Chinese 260 wpm x 1.5 characters", () => {
    close(lettersReadingSeconds(238 * 4.6), 60);
    close(wordsReadingSeconds(238, 238), 60);
    close(readingSeconds({ letters: 0, abjadWords: 181 }), 60);
    close(readingSeconds({ letters: 0, cjkChars: 390 }), 60);
    expect(readingSeconds({ letters: 0 })).toBe(0);
  });

  test("KLM: 1.35 s of mental preparation per entry step", () => {
    close(klmSeconds(3), 4.05);
    expect(klmSeconds(0)).toBe(0);
  });

  test("the budget sits at 0.5 demand and the reference rates at 0.5 capacity", () => {
    close(timeDemand(12.4), 0.5);
    expect(timeDemand(0)).toBe(0);
    close(rateCapacity(3, 3), 0.5);
    close(pointingCapacity(4.9), 0.5);
    close(readingCapacity(238), 0.5);
  });

  test("measured population rates come with their control and say whether it is the same study", () => {
    const mi = measuredRate("motionImpaired");
    expect(mi).toEqual({ channel: "pointing", rate: 1.77, control: 4.88, sameStudyControl: true, timed: false, ratio: 1.77 / 4.88 });
    // Stage C: a time on the same paragraph, so the share is control over population.
    expect(measuredRate("aphasiaReadingImpaired")).toEqual({ channel: "reading", rate: 71, control: 30, sameStudyControl: true, timed: true, ratio: 30 / 71 });
    close(measuredRate("dyslexiaAdults").ratio, 184.63 / 243.64);
    expect(measuredRate("lowVisionCentralLoss")).toMatchObject({ control: 238, sameStudyControl: false });
    expect(measuredRate("lowVisionIntactFields").ratio).toBeCloseTo(130 / 238, 12);
    expect(() => measuredRate("olderAdults" as MeasuredPopulation)).toThrow(/no measured rate/);
  });

  test("invalid input throws instead of becoming a time", () => {
    expect(() => fittsMovementTime(-1, 10)).toThrow(RangeError);
    expect(() => fittsMovementTime(Number.NaN, 10)).toThrow(RangeError);
    expect(() => lettersReadingSeconds(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => timeDemand(-0.1)).toThrow(RangeError);
    expect(() => rateCapacity(1, 0)).toThrow(RangeError);
    expect(() => klmSeconds(Number.NaN)).toThrow(RangeError);
    expect(() => choosingSeconds([{ size: -2 }])).toThrow(RangeError);
  });
});

describe("the laws, as properties", () => {
  const len = fc.double({ min: 0, max: 1e5, noNaN: true });
  const wid = fc.double({ min: 0, max: 5e3, noNaN: true });
  const count = fc.integer({ min: 0, max: 5000 });
  const rate = fc.double({ min: 1e-3, max: 1e4, noNaN: true });
  const secs = fc.double({ min: 0, max: 1e6, noNaN: true });

  test("movement time rises with distance and falls with width; ID is never negative", () => {
    fc.assert(fc.property(len, len, wid, (a, b, w) => {
      const [d1, d2] = a <= b ? [a, b] : [b, a];
      return fittsMovementTime(d1, w) <= fittsMovementTime(d2, w) && fittsIndexOfDifficulty(d1, w) >= 0;
    }));
    fc.assert(fc.property(len, wid, wid, (d, a, b) => {
      const [w1, w2] = a <= b ? [a, b] : [b, a];
      return fittsMovementTime(d, w2) <= fittsMovementTime(d, w1);
    }));
  });

  test("a target added never lowers pointing time; no targets is no time", () => {
    const target = fc.record({ distance: len, width: wid, height: wid });
    fc.assert(fc.property(fc.array(target, { maxLength: 20 }), target, (ts, t) => pointingSeconds([...ts, t]) >= pointingSeconds(ts)));
    expect(pointingSeconds([], 0)).toBe(0);
  });

  test("reading time is additive and rises with every count; nothing to read is no time", () => {
    fc.assert(fc.property(count, count, count, count, (l, a, c, extra) => {
      const t = readingSeconds({ letters: l, abjadWords: a, cjkChars: c });
      const sum = lettersReadingSeconds(l) + readingSeconds({ letters: 0, abjadWords: a }) + readingSeconds({ letters: 0, cjkChars: c });
      return Math.abs(t - sum) < 1e-9 * Math.max(1, t)
        && readingSeconds({ letters: l + extra, abjadWords: a, cjkChars: c }) >= t
        && readingSeconds({ letters: l, abjadWords: a + extra, cjkChars: c }) >= t
        && readingSeconds({ letters: l, abjadWords: a, cjkChars: c + extra }) >= t;
    }));
    fc.assert(fc.property(rate, (wpm) => wordsReadingSeconds(0, wpm) === 0));
  });

  test("search and Hick-Hyman rise with group size, and the novice never beats the expert", () => {
    const n = fc.integer({ min: 1, max: 2000 });
    fc.assert(fc.property(n, n, (a, b) => {
      const [m, k] = a <= b ? [a, b] : [b, a];
      return noviceSearchSeconds(m) <= noviceSearchSeconds(k) && hickHymanSeconds(m) <= hickHymanSeconds(k)
        && noviceSearchSeconds(m) > hickHymanSeconds(m);
    }));
    fc.assert(fc.property(n, (k) => choosingSeconds([{ size: k, each: true }]) >= choosingSeconds([{ size: k }])
      && choosingSeconds([{ size: k, each: true }], "expert") >= choosingSeconds([{ size: k }], "expert")));
  });

  test("KLM time is linear in steps", () => {
    fc.assert(fc.property(count, count, (a, b) => Math.abs(klmSeconds(a + b) - klmSeconds(a) - klmSeconds(b)) < 1e-9 * Math.max(1, klmSeconds(a + b))));
  });

  test("d = T / (T + tau) is in [0, 1) and rises with T; c = r_p / (r_p + r_ref) is in (0, 1) and rises with r_p", () => {
    fc.assert(fc.property(secs, secs, (a, b) => {
      const [t1, t2] = a <= b ? [a, b] : [b, a];
      const d1 = timeDemand(t1);
      return d1 >= 0 && d1 < 1 && d1 <= timeDemand(t2);
    }));
    fc.assert(fc.property(rate, rate, rate, (a, b, ref) => {
      const [r1, r2] = a <= b ? [a, b] : [b, a];
      const c = rateCapacity(r1, ref);
      return c > 0 && c < 1 && c <= rateCapacity(r2, ref);
    }));
  });

  test("demand exceeds capacity exactly when the persona's own time, T x r_ref / r_p, exceeds the budget", () => {
    const tau = param("law.timeBudget");
    fc.assert(fc.property(secs, rate, rate, (t, rp, rref) => {
      const own = (t * rref) / rp;
      fc.pre(Math.abs(own - tau) > 1e-6 * tau);
      return (timeDemand(t) > rateCapacity(rp, rref)) === (own > tau);
    }));
  });
});

describe("profile registry (provenance/profiles.ts)", () => {
  const v = (id: string) => PROFILE_PROVENANCE.find((e) => e.id === `profile.${id}`)!.value;
  const profileIds = PROFILE_PROVENANCE.map((e) => e.id);

  test("pinned, unique, profile-prefixed, all hypotheses saying what would set them", () => {
    // 18 at registration (2a); 16 once the neurotypical and tremor throughputs
    // came from the measured rates in provenance/laws.ts; 15 once the ADHD
    // profile took the reference rate; 25 with the endpoint dispersion (four
    // sigmas, four rhos, the two motorPrecision weights) the hit-probability
    // audit reads.
    expect(PROFILE_PROVENANCE.length).toBe(25);
    expect(new Set(profileIds).size).toBe(25);
    for (const e of PROFILE_PROVENANCE) {
      expect(e.id.startsWith("profile.")).toBe(true);
      expect(MODEL_PROVENANCE[e.id]).toBe(e);
      expect(e.status).toBe("hypothesis");
      expect(e.source).toMatch(/would (fit|set|test|place|replace)/);
    }
  });

  test("the entries for populations with no measured rate say so", () => {
    for (const id of ["pointing.elderly.throughput", "reading.adhd.phonological", "reading.elderly.phonological"]) {
      expect({ id, says: /No (measured|silent-reading)[^.]*(was found|norm)/.test(PROFILE_PROVENANCE.find((e) => e.id === `profile.${id}`)!.source) })
        .toEqual({ id, says: true });
    }
  });

  test("the throughputs: neurotypical and ADHD at the reference, tremor at the motion-impaired ratio rescaled to it", () => {
    expect(KNOWN_POINTING_PROFILES.neurotypical.throughput).toBe(param("law.rate.pointing.reference"));
    expect(KNOWN_POINTING_PROFILES.adhd.throughput).toBe(param("law.rate.pointing.reference"));
    close(KNOWN_POINTING_PROFILES.tremor.throughput, 4.9 * 1.77 / 4.88);
    close(KNOWN_POINTING_PROFILES.tremor.throughput / KNOWN_POINTING_PROFILES.neurotypical.throughput, measuredRate("motionImpaired").ratio);
  });

  // What reads each profile id: a profile value, or a fixation time.
  const NEUTRAL = { text: "a cat sat on the mat", fontSize: 16, lineHeight: 1.5, fontFamily: "sans-serif", isSerif: false, contrastRatio: 21 };
  const PROBE: ReadingProfile = { orthographic: 1, phonological: 0, visualSpan: 1, vocabulary: 1, crowding: 0 };
  const profileOutputs = () => [
    ...Object.values(KNOWN_POINTING_PROFILES).flatMap((p) => [p.throughput, p.sigmaX, p.sigmaY, p.rho]),
    // A persona with no named profile: its dispersion interpolates on the motorPrecision weights.
    ...Object.values(getPointingProfile({ name: "custom-anyone", traits: { proceduralFluency: 0.3, patience: 0.7 } })),
    ...Object.values(KNOWN_READING_PROFILES).flatMap((p) => [p.phonological, p.visualSpan]),
    computeReadingDifficulty(NEUTRAL.text, PROBE, NEUTRAL).difficulty,
    computeReadingDifficulty(NEUTRAL.text, PROBE, NEUTRAL).fixationDuration,
  ];

  test("every profile id is read by cognitive-models.ts at use, and moves its output", () => {
    startProvenanceRecording();
    profileOutputs();
    const read = stopProvenanceRecording();
    expect(profileIds.filter((id) => !read.has(id))).toEqual([]);
    const base = JSON.stringify(profileOutputs());
    // A zero (rho 0) is nudged, not scaled.
    const dead = PROFILE_PROVENANCE.filter((e) => JSON.stringify(withParamOverrides({ [e.id]: e.value === 0 ? 0.1 : e.value * 1.1 }, profileOutputs)) === base);
    expect(dead.map((e) => e.id)).toEqual([]);
  });

  const fixation = (c: { base: number; phon: number; span: number; normal: number }, p: ReadingProfile) =>
    Math.round(c.base + (1 - p.phonological) * c.phon + (c.normal / p.visualSpan - 1) * c.span);
  const registered = () => ({ base: v("fixation.baseMs"), phon: v("fixation.phonologicalMs"), span: v("fixation.spanMs"), normal: v("fixation.normalSpan") });
  const probes: ReadingProfile[] = [
    ...Object.values(KNOWN_READING_PROFILES).map((p) => ({ ...p })),
    PROBE,
    { orthographic: 1, phonological: 1, visualSpan: 14, vocabulary: 1, crowding: 0 },
  ];

  test("the fixation terms reproduce computeReadingDifficulty on neutral text, including a span above normal (no clamp)", () => {
    for (const p of probes) {
      expect({ p, ms: computeReadingDifficulty(NEUTRAL.text, p, NEUTRAL).fixationDuration }).toEqual({ p, ms: fixation(registered(), p) });
    }
    expect(computeReadingDifficulty(NEUTRAL.text, probes[probes.length - 1], NEUTRAL).fixationDuration).toBeLessThan(v("fixation.baseMs"));
  });

  test("the reproduction goes red on a value one unit off (absence test)", () => {
    for (const key of ["base", "phon", "span", "normal"] as const) {
      const off = { ...registered(), [key]: registered()[key] + 1 };
      const agree = probes.every((p) => computeReadingDifficulty(NEUTRAL.text, p, NEUTRAL).fixationDuration === fixation(off, p));
      expect({ key, agree }).toEqual({ key, agree: false });
    }
  });
});
