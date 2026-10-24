/**
 * Stage B wiring: the motor, decision, procedure and reading demands are law
 * times (lawSecondsOf, from a raw page measurement) against one time budget
 * (computeDemandDistribution).
 *
 * - No fallback: a PageMetrics without a law time is refused, naming the field.
 * - Direction, on raw measurements: smaller, more distant targets ask more
 *   pointing; more letters more reading; larger groups more choosing; a
 *   checkbox group of n more than one choice among n; entry fields more
 *   procedure. And each raises the demand the chain reads.
 * - The per-screen path charges only what a screen introduces.
 * - Every law constant the score reads moves a score in the golden matrix
 *   (through the reference curve, which derives real pages through the laws).
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { deriveMetrics, extractPerScreenMetrics, lawSecondsOf, type RawPageMeasurement, type RawPageMeasurementV1 } from "../src/visual/cognitive-transport.js";
import { computeDemandDistribution } from "../src/visual/cognitive-transport-chain.js";
import { LAW_PROVENANCE } from "../src/visual/provenance/laws.js";
import { MODEL_PROVENANCE, param, withParamOverrides } from "../src/visual/model-provenance.js";
import { RAW_LATIN } from "./fixtures/raw-page-measurements.js";
import { referenceRaw } from "../src/visual/ctc-reference.js";
import { lawTimesReport } from "../src/visual/law-times-report.js";
import { lettersReadingSeconds } from "../src/visual/demand-laws.js";
import { buildGoldenMatrix } from "./fixtures/ctc-golden-matrix.js";

/** The golden matrix with the per-dimension state arrays dropped: scores only (as ctc-no-dead-constants.test.ts). */
const scores = (build: () => unknown = buildGoldenMatrix) => JSON.stringify(build(), (k, v) => (k === "remainingCapacity" || k === "traitCosts" ? undefined : v));
function deadConstants(ids: Array<{ id: string; value: number }>): string[] {
  const base = scores();
  const moves = (id: string, v: number) => scores(() => withParamOverrides({ [id]: v }, buildGoldenMatrix)) !== base;
  return ids.filter(({ id, value }) => !moves(id, value * 1.1) && !moves(id, value * 0.9)).map((e) => e.id);
}

const variant = (edit: (r: RawPageMeasurement) => void): RawPageMeasurement => {
  const r = structuredClone(RAW_LATIN);
  edit(r);
  return r;
};
const demandOf = (r: RawPageMeasurement) => computeDemandDistribution(deriveMetrics(r)).demands;

describe("no demand falls back to a hand-set curve", () => {
  const base = deriveMetrics(RAW_LATIN);
  for (const k of ["pointingSeconds", "choosingSeconds", "readingSeconds", "procedureSeconds"] as const) {
    test(`a PageMetrics without ${k}, or with a negative or NaN one, is refused, naming the field`, () => {
      const { [k]: _drop, ...without } = base;
      expect(() => computeDemandDistribution(without as never)).toThrow(new RegExp(`pageMetrics\\.${k}`));
      expect(() => computeDemandDistribution({ ...base, [k]: -1 })).toThrow(new RegExp(k));
      expect(() => computeDemandDistribution({ ...base, [k]: Number.NaN })).toThrow(new RegExp(k));
    });
  }

  test("the counts no longer drive any demand: interactiveElementCount and choiceCount are reported only", () => {
    const a = computeDemandDistribution(base).demands;
    const b = computeDemandDistribution({ ...base, interactiveElementCount: 0, choiceCount: 0 }).demands;
    expect(b).toEqual(a);
  });
});

describe("the law times, on raw measurements, and the demands they make", () => {
  const tau = param("law.timeBudget");

  test("each demand is d = T / (T + tau) of its law time", () => {
    const m = deriveMetrics(RAW_LATIN);
    const d = computeDemandDistribution(m).demands;
    const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-12);
    close(d.motorCapacity, m.pointingSeconds / (m.pointingSeconds + tau));
    close(d.satisficing, m.choosingSeconds / (m.choosingSeconds + tau));
    close(d.proceduralFluency, m.procedureSeconds / (m.procedureSeconds + tau));
    close(d.readingCapacity, m.readingSeconds / (m.readingSeconds + tau));
    close(d.riskTolerance, d.satisficing * MODEL_PROVENANCE["chain.demand.decision.riskTolerance"].value);
  });

  test("smaller, more distant targets ask more pointing, at the same count", () => {
    const at = (w: number, h: number, far: boolean) => variant((r) => {
      for (let i = 0; i < r.boxes.length; i += 5) {
        r.boxes[i + 1] = far ? 0 : r.viewportWidth / 2 - w / 2;
        r.boxes[i + 2] = far ? r.documentHeight - h : r.viewportHeight / 2 - h / 2;
        r.boxes[i + 3] = w;
        r.boxes[i + 4] = h;
      }
    });
    const near = at(200, 60, false), far = at(6, 6, true);
    expect(lawSecondsOf(far).pointingSeconds).toBeGreaterThan(lawSecondsOf(near).pointingSeconds);
    expect(demandOf(far).motorCapacity).toBeGreaterThan(demandOf(near).motorCapacity);
  });

  test("more letters ask more reading, at the same word count", () => {
    const longer = variant((r) => { r.text.wordLengths = r.text.wordLengths.map(([len, c]) => [len + 3, c]); });
    expect(lawSecondsOf(longer).readingSeconds).toBeGreaterThan(lawSecondsOf(RAW_LATIN).readingSeconds);
    expect(demandOf(longer).readingCapacity).toBeGreaterThan(demandOf(RAW_LATIN).readingCapacity);
    // and the reading demand is the base of the attentional one.
    expect(demandOf(longer).sustainedAttention).toBeGreaterThan(demandOf(RAW_LATIN).sustainedAttention);
  });

  test("more and larger choice groups ask more choosing; a checkbox group of n more than one choice among n", () => {
    const withGroups = (groups: Array<[string, number]>) => variant((r) => {
      r.kinds = [...r.kinds, "radio", "checkbox", "select"];
      r.choiceGroups = groups.flatMap(([k, n]) => [r.kinds.indexOf(k), n]);
      r.choiceGroupCount = groups.length;
      r.groupedLinks = r.links;
    });
    const small = withGroups([["select", 3]]), large = withGroups([["select", 12]]), more = withGroups([["select", 3], ["select", 3]]);
    expect(lawSecondsOf(large).choosingSeconds).toBeGreaterThan(lawSecondsOf(small).choosingSeconds);
    expect(lawSecondsOf(more).choosingSeconds).toBeGreaterThan(lawSecondsOf(small).choosingSeconds);
    const radio = withGroups([["radio", 6]]), checkbox = withGroups([["checkbox", 6]]);
    expect(lawSecondsOf(checkbox).choosingSeconds).toBeGreaterThan(lawSecondsOf(radio).choosingSeconds);
    expect(demandOf(large).satisficing).toBeGreaterThan(demandOf(small).satisficing);
  });

  test("links in no group form one more choice set: from groupedLinks in format 2, from the nav sizes in format 1", () => {
    const some = variant((r) => { r.groupedLinks = 50; });
    expect(lawSecondsOf(some).lawDiagnostics).toMatchObject({ ungroupedLinks: RAW_LATIN.links - 50, ungroupedLinksFrom: "groupedLinks" });
    const { prose: _p, proseNested: _pn, navGroupCount: _g, navLinks: _l, groupedLinks: _gl, choiceNested: _cn, ...v1 } = RAW_LATIN;
    expect(lawSecondsOf({ ...v1, format: 1 } satisfies RawPageMeasurementV1).lawDiagnostics).toMatchObject({ ungroupedLinks: RAW_LATIN.links - 12, ungroupedLinksFrom: "navGroupSizes" });
  });

  test("a format-2 record without groupedLinks is refused, not counted by the format-1 rule", () => {
    // Records measured before the nav totals existed (the 97c4888 reference) took
    // the nav sizes as an interim rule; the reference no longer holds any, and
    // decodeReferenceRaw already refuses them.
    const early = variant((r) => { delete (r as Partial<RawPageMeasurement>).groupedLinks; });
    expect(() => lawSecondsOf(early)).toThrow(/raw format 2 record without groupedLinks/);
    expect(() => deriveMetrics(early)).toThrow(/raw format 2 record without groupedLinks/);
  });

  test("entry fields and toggle groups ask procedure; links and buttons do not", () => {
    expect(lawSecondsOf(RAW_LATIN).procedureSeconds).toBe(0);
    const form = variant((r) => {
      r.kinds = [...r.kinds, "input:email", "textarea", "select", "input:submit", "radio"];
      r.boxes = [r.kinds.indexOf("input:email"), 100, 100, 200, 30, r.kinds.indexOf("textarea"), 100, 150, 200, 80,
        r.kinds.indexOf("select"), 100, 250, 200, 30, r.kinds.indexOf("input:submit"), 100, 300, 80, 30];
      r.interactiveElements = 4;
      r.choiceGroups = [r.kinds.indexOf("radio"), 3];
      r.choiceGroupCount = 1;
    });
    const s = lawSecondsOf(form);
    expect(s.lawDiagnostics.entrySteps).toBe(4);
    expect(s.procedureSeconds).toBeCloseTo(4 * param("law.klm.mentalPreparation"), 12);
    expect(demandOf(form).proceduralFluency).toBeGreaterThan(0);
  });

  test("a capped box or group list is scaled to its uncapped count", () => {
    const half = variant((r) => { r.interactiveElements = 4; r.boxes = r.boxes.slice(0, 10); });
    const full = variant((r) => { r.interactiveElements = 2; r.boxes = r.boxes.slice(0, 10); });
    expect(lawSecondsOf(half).pointingSeconds).toBeCloseTo(2 * lawSecondsOf(full).pointingSeconds, 9);
  });

  test("zero work gives zero time and zero demand", () => {
    const empty = variant((r) => {
      r.boxes = []; r.interactiveElements = 0; r.choiceGroups = []; r.choiceGroupCount = 0; r.links = 0; r.groupedLinks = 0; r.groupedLinksWithText = 0;
      r.text = { ...r.text, wordLengths: [], abjadWordLengths: [], cjkChars: 0 };
    });
    const s = lawSecondsOf(empty);
    expect([s.pointingSeconds, s.choosingSeconds, s.readingSeconds, s.procedureSeconds]).toEqual([0, 0, 0, 0]);
    const d = demandOf(empty);
    expect([d.motorCapacity, d.satisficing, d.readingCapacity, d.proceduralFluency]).toEqual([0, 0, 0, 0]);
  });
});

describe("the per-screen path charges only what a screen introduces", () => {
  test("pointing, choosing and procedure scale by the screen's new share; reading only in its labels' first read", async () => {
    const raw = variant((r) => { r.scope = "viewport"; });
    const fresh = { newInteractive: 30, newChoices: 27 };
    const stub = {
      evaluate: async (fn: unknown, arg?: unknown) => {
        if (Array.isArray(arg)) return structuredClone(raw);
        if (String(fn).includes("newInteractive")) return fresh;
        return { viewportHeight: raw.viewportHeight, documentHeight: raw.viewportHeight };
      },
      waitForTimeout: async () => {},
    };
    const [screen] = await extractPerScreenMetrics(stub, 1, { viewportHeight: raw.viewportHeight, documentHeight: raw.viewportHeight, pageScreens: 1, screenCount: 1 } as never);
    const whole = deriveMetrics(raw);
    expect(screen.pointingSeconds).toBeCloseTo(whole.pointingSeconds * (30 / whole.interactiveElementCount), 9);
    expect(screen.procedureSeconds).toBeCloseTo(whole.procedureSeconds * (30 / whole.interactiveElementCount), 9);
    expect(screen.choosingSeconds).toBeCloseTo(whole.choosingSeconds * (27 / whole.choiceCountRaw), 9);
    // Prose is read per screen; the labels' first read is once per visit, so it
    // takes the new-choices share, as choosing does.
    const share = 27 / whole.choiceCountRaw;
    expect(whole.lawDiagnostics.labelSeconds).toBeGreaterThan(0);
    expect(screen.lawDiagnostics.labelSeconds).toBeCloseTo(whole.lawDiagnostics.labelSeconds * share, 9);
    expect(screen.readingSeconds).toBeCloseTo(whole.readingSeconds - whole.lawDiagnostics.labelSeconds * (1 - share), 9);
  });
});

describe("every law constant the score reads moves a score in the golden matrix", () => {
  // Left out, with the reason: the measured population rates (law.rate.*) set
  // the persona and custom-persona rate entries when those are registered, so
  // changing one at run time moves nothing; tests/persona-capacity-rates.test.ts
  // holds each entry to the rates it is computed from. The Hick-Hyman pair is the
  // menu model's expert limit, PageMetrics.choosingSecondsExpert: since Stage C
  // the decision demand weights it by the run's siteFamiliarity e, and the
  // golden matrix, like every first visit and the reference curve, runs at
  // e = 0, where it moves nothing (tests/stage-c-load.test.ts covers e > 0).
  const SCORED = LAW_PROVENANCE.filter((e) => !e.id.startsWith("law.rate.") && !e.id.startsWith("law.hick."));

  test("each, scaled by 1.1 or 0.9, moves a score", () => {
    expect(SCORED.length).toBe(13);
    expect(deadConstants(SCORED)).toEqual([]);
  }, 240_000);

  test("the two left out move no score, which is why they are left out (absence test)", () => {
    expect(deadConstants(LAW_PROVENANCE.filter((e) => e.id.startsWith("law.hick.")))).toEqual(["law.hick.intercept", "law.hick.slope"]);
  }, 120_000);

  test("withParamOverrides on law.timeBudget alone moves totalCTC on a golden page", () => {
    const base = buildGoldenMatrix().runs["first-timer"]["mid"]["asym+inter"].totalCTC;
    const moved = withParamOverrides({ "law.timeBudget": 30 }, () => buildGoldenMatrix().runs["first-timer"]["mid"]["asym+inter"].totalCTC);
    expect(moved).not.toBe(base);
  }, 120_000);
});

describe("the law times as a tool reports them (lawTimesReport)", () => {
  test("each time beside its demand against the budget, the expert limit beside choosing", () => {
    const m = deriveMetrics(RAW_LATIN);
    const r = lawTimesReport(m);
    expect(r.budgetSeconds).toBe(param("law.timeBudget"));
    for (const [k, s] of [["pointing", m.pointingSeconds], ["choosing", m.choosingSeconds], ["reading", m.readingSeconds], ["procedure", m.procedureSeconds]] as const) {
      expect(r[k].seconds).toBe(Math.round(s * 10) / 10);
      expect(r[k].demand).toBe(Math.round((s / (s + r.budgetSeconds)) * 1000) / 1000);
    }
    expect(r.choosing.expertSeconds).toBe(Math.round(m.choosingSecondsExpert * 10) / 10);
    expect(r.choosing.familiarSeconds).toBeUndefined();
    expect(r.note).toContain("hypothesis");
  });

  test("a familiar run reports the time the abilities are asked at its siteFamiliarity e beside the first-visit time (Stage C)", () => {
    const m = deriveMetrics(RAW_LATIN);
    const r = lawTimesReport(m, 0.5);
    const at = 0.5 * m.choosingSeconds + 0.5 * m.choosingSecondsExpert;
    expect(r.choosing.seconds).toBe(Math.round(m.choosingSeconds * 10) / 10);
    expect(r.choosing.familiarSeconds).toBe(Math.round(at * 10) / 10);
    expect(r.choosing.familiarDemand).toBe(Math.round((at / (at + r.budgetSeconds)) * 1000) / 1000);
    expect(r.choosing.siteFamiliarity).toBe(0.5);
  });
});

describe("the reading law reads the outermost prose, each character once", () => {
  // ref-v2 (format 2): text and prose are built from the same outermost prose
  // elements (measurePageRaw joins them into one visible text), while textChars
  // still sums nested elements. The reading law takes letters from
  // text.wordLengths, so it reads exactly what prose totals: checked on every
  // real reference page. Nav list items are prose too; the law reads the prose
  // outside every group and charges each grouped link one first read instead
  // (ISC-76, the menu-label tests below).
  test("on every alphabetic reference page, the letter histogram's words are prose.words", () => {
    for (const scope of ["viewport", "full_page"] as const) {
      const pages = referenceRaw(scope).filter((r) => r.text.script === "alphabetic");
      expect(pages.length).toBeGreaterThan(400);
      const off = pages.filter((r) => r.text.wordLengths.reduce((a, [, c]) => a + c, 0) !== r.prose.words);
      expect(off.length).toBe(0);
    }
  });

  test("every reference page carries groupedLinks, so no page uses the format-1 nav-size rule", () => {
    for (const scope of ["viewport", "full_page"] as const) {
      expect(referenceRaw(scope).filter((r) => lawSecondsOf(r).lawDiagnostics.ungroupedLinksFrom !== "groupedLinks").length).toBe(0);
    }
  });
});

describe("menu labels: one first read each, in place of their prose (ISC-76)", () => {
  const LABEL = MODEL_PROVENANCE["law.reading.labelFirstRead"].value;
  const PER_LETTER = lettersReadingSeconds(1);
  const PAGE_LETTERS = RAW_LATIN.text.wordLengths.reduce((n, [len, c]) => n + len * c, 0);
  type Label = { letters: number; abjadWords: number; cjkChars: number };
  /** A page whose prose holds `inGroup` already in groups, over `links` grouped links (`withText` of them with visible text), with abjad and CJK prose besides its letters. */
  const pageWith = (inGroup: Label, links: number, abjad: number, cjk: number, withText = links) => variant((r) => {
    r.text.abjadWordLengths = abjad > 0 ? [[4, abjad]] : [];
    r.text.cjkChars = cjk;
    r.proseInNav = { chars: 0, words: 0, ...inGroup };
    r.groupedLinks = links;
    r.groupedLinksWithText = withText;
    r.links = Math.max(r.links, links);
  });
  /** The same page with one more link moved from outside every group into a group, its label's prose with it (the prose stays on the page). */
  const movedIn = (r: RawPageMeasurement, label: Label) => {
    const m = structuredClone(r);
    m.proseInNav = { ...m.proseInNav, letters: m.proseInNav.letters + label.letters, abjadWords: m.proseInNav.abjadWords + label.abjadWords, cjkChars: m.proseInNav.cjkChars + label.cjkChars };
    m.groupedLinks += 1;
    if (label.letters + label.abjadWords + label.cjkChars > 0) m.groupedLinksWithText += 1;
    m.links = Math.max(m.links, m.groupedLinks);
    return m;
  };
  const reading = (r: RawPageMeasurement) => lawSecondsOf(r).readingSeconds;

  test("the prose outside every group at the prose rate, plus the first-read time per grouped link with visible text", () => {
    const r = pageWith({ letters: 40, abjadWords: 0, cjkChars: 0 }, 8, 0, 0);
    expect(reading(r)).toBeCloseTo(lettersReadingSeconds(PAGE_LETTERS - 40) + 8 * LABEL, 12);
    expect(lawSecondsOf(r).lawDiagnostics).toMatchObject({ labels: 8 });
    expect(LAW_PROVENANCE.find((e) => e.id === "law.reading.labelFirstRead")).toMatchObject({ value: 0.13, status: "hypothesis" });
  });

  test("moving a label of at least 3 letters, or any abjad word or CJK character, into a group never raises reading", () => {
    // The change is labelFirstRead minus the label's own prose time; it is <= 0
    // exactly when that prose time is at least 0.13 s: 3 letters (0.16 s at
    // 238 x 4.6 letters per minute), one abjad word (0.33 s) or one CJK
    // character (0.15 s).
    const label = fc.oneof(
      fc.integer({ min: 3, max: 40 }).map((n) => ({ letters: n, abjadWords: 0, cjkChars: 0 })),
      fc.integer({ min: 1, max: 6 }).map((n) => ({ letters: 0, abjadWords: n, cjkChars: 0 })),
      fc.integer({ min: 1, max: 12 }).map((n) => ({ letters: 0, abjadWords: 0, cjkChars: n })),
    );
    fc.assert(fc.property(label, fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: 500 }), fc.integer({ min: 6, max: 80 }), fc.integer({ min: 12, max: 120 }), (l, permille, links, abjad, cjk) => {
      const room = { letters: PAGE_LETTERS - l.letters, abjadWords: abjad - l.abjadWords, cjkChars: cjk - l.cjkChars };
      const inGroup = { letters: Math.floor((room.letters * permille) / 1000), abjadWords: Math.floor((room.abjadWords * permille) / 1000), cjkChars: Math.floor((room.cjkChars * permille) / 1000) };
      const before = pageWith(inGroup, links, abjad, cjk);
      const after = movedIn(before, l);
      expect(reading(after)).toBeLessThanOrEqual(reading(before) + 1e-12);
      expect(reading(after) - reading(before)).toBeCloseTo(LABEL - (reading(pageWith({ letters: 0, abjadWords: 0, cjkChars: 0 }, 0, abjad, cjk)) - reading(pageWith(l, 0, abjad, cjk))), 9);
    }), { seed: 76, numRuns: 400 });
  });

  test("the property does not hold for 1 or 2 letters: such a label costs more as a label than as prose", () => {
    // 0.13 s against 0.055 s per letter (238 x 4.6 letters per minute).
    const page = pageWith({ letters: 0, abjadWords: 0, cjkChars: 0 }, 4, 0, 0);
    for (const letters of [1, 2]) {
      const rise = reading(movedIn(page, { letters, abjadWords: 0, cjkChars: 0 })) - reading(page);
      expect(rise).toBeCloseTo(LABEL - letters * PER_LETTER, 12);
      expect(rise).toBeGreaterThan(0);
    }
    expect(LABEL - 3 * PER_LETTER).toBeLessThan(0);
  });

  test("an icon-only link has nothing to read: it costs no first read, grouped or not", () => {
    // 10 grouped links, 4 with visible text: only the 4 are read.
    const r = pageWith({ letters: 40, abjadWords: 0, cjkChars: 0 }, 10, 0, 0, 4);
    expect(lawSecondsOf(r).lawDiagnostics).toMatchObject({ labels: 4 });
    expect(lawSecondsOf(r).lawDiagnostics.labelSeconds).toBeCloseTo(4 * LABEL, 12);
    expect(reading(r)).toBeCloseTo(lettersReadingSeconds(PAGE_LETTERS - 40) + 4 * LABEL, 12);
    // Moving an icon-only link into a group moves no prose and adds no label.
    expect(reading(movedIn(r, { letters: 0, abjadWords: 0, cjkChars: 0 }))).toBe(reading(r));
  });

  test("format 1 has no in-group prose: it reads all of its prose and charges no label", () => {
    const { prose: _p, proseNested: _pn, proseInNav: _in, navGroupCount: _g, navLinks: _l, groupedLinks: _gl, choiceNested: _cn, ...v1 } = RAW_LATIN;
    const d = lawSecondsOf({ ...v1, format: 1 } satisfies RawPageMeasurementV1);
    expect(d.readingSeconds).toBeCloseTo(lettersReadingSeconds(PAGE_LETTERS), 12);
    expect(d.lawDiagnostics).toMatchObject({ labels: 0, labelSeconds: 0 });
  });

  test("a format-2 record without proseInNav or groupedLinksWithText is refused, naming the field", () => {
    const early = variant((r) => { delete (r as Partial<RawPageMeasurement>).proseInNav; });
    expect(() => lawSecondsOf(early)).toThrow(/raw format 2 record without proseInNav/);
    const noText = variant((r) => { delete (r as Partial<RawPageMeasurement>).groupedLinksWithText; });
    expect(() => lawSecondsOf(noText)).toThrow(/raw format 2 record without groupedLinksWithText/);
  });
});
