/**
 * attentionQuality.interpretation can never contradict valuePropSalience (B18).
 *
 * Reported against 19.2.3 on cbrowser.ai (persona alexa-eden, goal "claim the
 * bonus credits", freezeAnimations, n=7):
 *
 *   valuePropSalience: 1
 *   headingShare: 0
 *   interpretation: "CTAs capture attention but the value prop does not --
 *                    headings drew 0% of top attention."
 *
 * Both numbers were right. valuePropSalience is heading + CTA attention, so it
 * is 1 whenever every sampled hotspot lands on a CTA; headingShare is the
 * heading-only part. The sentence judged "the value prop" from headingShare
 * while the field NAMED valuePropSalience said the opposite, in one payload.
 *
 * The fix keeps the heading-based judgement (it is the one that can detect
 * "sees the CTA, misses the heading") and makes the prose say "headings", never
 * "value prop". These tests pin the reported case and the invariant over every
 * branch of the interpretation.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { computeAttentionQuality } from "../src/visual/attention-quality.js";

type El = Parameters<typeof computeAttentionQuality>[1][number];
type Kind = "cta" | "heading" | "nav" | "decorative" | "content";

/**
 * One element per entry, laid out on a grid, with one hotspot at its centre
 * carrying the given saliency. Elements are 100x40 and 200px apart, so the
 * 20px attribution pad can never put a hotspot on a neighbour.
 */
function page(spec: Array<{ kind: Kind; saliency: number }>) {
  const elements: El[] = [];
  const hotspots: Array<{ x: number; y: number; saliency: number; row: number; col: number }> = [];
  spec.forEach((s, i) => {
    const x = 50 + (i % 5) * 200;
    const y = 50 + Math.floor(i / 5) * 200;
    elements.push({
      selector: `#e${i}`, text: `${s.kind} ${i}`, type: s.kind === "heading" ? "h2" : "a",
      x, y, width: 100, height: 40,
      isCTA: s.kind === "cta", isHeading: s.kind === "heading",
      isNav: s.kind === "nav", isDecorative: s.kind === "decorative",
    });
    hotspots.push({ x: x + 50, y: y + 20, saliency: s.saliency, row: 0, col: i });
  });
  // computeAttentionQuality expects rank order.
  hotspots.sort((a, b) => b.saliency - a.saliency);
  return computeAttentionQuality(hotspots, elements, 4);
}

/** "value prop" as prose, not as the field name `valuePropSalience`. */
const mentionsValueProp = (s: string) => /value[ -]prop/i.test(s.replace(/valuePropSalience/g, ""));

describe("B18: the reported case", () => {
  test("valuePropSalience 1 with headingShare 0 never says the value prop failed", () => {
    // Seven CTAs, no heading attention: the n=7 shape from the report.
    const q = page(Array.from({ length: 7 }, (_, i) => ({ kind: "cta" as const, saliency: 0.9 - i * 0.05 })));
    // Preconditions, so the test means the reported state and not a neighbour.
    expect(q.valuePropSalience).toBe(1);
    expect(q.headingShare).toBe(0);
    expect(q.ctaCaptureRate).toBe(1);

    expect(q.interpretation).not.toMatch(/value prop[^.]*\b(does not|doesn't|not captur|fail)/i);
    expect(mentionsValueProp(q.interpretation)).toBe(false);
    // It still says what it measured: no heading drew attention.
    expect(q.interpretation).toMatch(/headings do not/i);
    expect(q.interpretation).toContain("0%");
    // And where it quotes valuePropSalience, it quotes the published value.
    expect(q.interpretation).toContain(`valuePropSalience (${q.valuePropSalience})`);
    // v4 O2: headingShare is exactly 0, so the CTA attention is all of it.
    expect(q.interpretation).toContain("so here it is all CTA attention");
    expect(q.interpretation).not.toContain("almost all");
  });

  test("v4 O2: a small but nonzero heading share still says almost all", () => {
    // 0.9 CTA saliency against 0.01 heading: headingShare ~0.011, inside the
    // <= 0.02 branch and not zero.
    const q = page([{ kind: "cta", saliency: 0.9 }, { kind: "heading", saliency: 0.01 }]);
    expect(q.headingShare).toBeGreaterThan(0);
    expect(q.headingShare).toBeLessThanOrEqual(0.02);
    expect(q.interpretation).toMatch(/^CTAs capture attention but headings do not/);
    expect(q.interpretation).toContain("so here it is almost all CTA attention");
  });
});

describe("B18: no branch of the interpretation borrows the value-prop name", () => {
  const cases: Record<string, Array<{ kind: Kind; saliency: number }>> = {
    // ctaCaptureRate > 0.3 and headingShare > 0.15
    strong: [
      { kind: "cta", saliency: 0.9 }, { kind: "cta", saliency: 0.8 },
      { kind: "heading", saliency: 0.7 }, { kind: "content", saliency: 0.2 },
    ],
    // ctaCaptureRate > 0.3 and headingShare <= 0.02
    ctaNoHeading: [
      { kind: "cta", saliency: 0.9 }, { kind: "content", saliency: 0.5 }, { kind: "nav", saliency: 0.3 },
    ],
    // ctaCaptureRate > 0.1 and valuePropSalience > 0.3, heading in between
    moderate: [
      { kind: "cta", saliency: 0.3 }, { kind: "heading", saliency: 0.1 },
      { kind: "content", saliency: 0.5 }, { kind: "nav", saliency: 0.2 },
    ],
    // distractorRatio > 0.5
    poor: [
      { kind: "nav", saliency: 0.9 }, { kind: "decorative", saliency: 0.8 },
      { kind: "heading", saliency: 0.3 }, { kind: "cta", saliency: 0.1 },
    ],
    // ctaCaptureRate < 0.05
    invisible: [
      { kind: "heading", saliency: 0.9 }, { kind: "content", saliency: 0.8 }, { kind: "nav", saliency: 0.2 },
    ],
  };

  for (const [name, spec] of Object.entries(cases)) {
    test(`${name}: interpretation names headings/CTAs, never "value prop"`, () => {
      const q = page(spec);
      expect(mentionsValueProp(q.interpretation)).toBe(false);
    });
  }

  test("the poor branch quotes valuePropSalience exactly as published", () => {
    const q = page(cases.poor);
    expect(q.distractorRatio).toBeGreaterThan(0.5);
    expect(q.interpretation).toMatch(/^Poor attention quality/);
    expect(q.interpretation).toContain(`valuePropSalience ${q.valuePropSalience} `);
  });

  test("sweep: 500 random bucket mixes, no interpretation mentions the value prop", () => {
    // Seeded LCG so a failure reproduces.
    let seed = 1009;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const kinds: Kind[] = ["cta", "heading", "nav", "decorative", "content"];
    const offenders: string[] = [];
    for (let n = 0; n < 500; n++) {
      const len = 1 + Math.floor(rnd() * 12);
      const spec = Array.from({ length: len }, () => ({
        kind: kinds[Math.floor(rnd() * kinds.length)],
        saliency: 0.01 + rnd(),
      }));
      const q = page(spec);
      if (mentionsValueProp(q.interpretation)) offenders.push(q.interpretation);
    }
    expect(offenders).toEqual([]);
  });
});

describe("B18 round 2: no verdict contradicts valuePropSalience, in either direction", () => {
  // The verifier's sweep found the Moderate and Mixed branches still saying
  // attention was split / unfocused when CTAs + headings held nearly all of it.
  const SPLIT = /split with other content|without strong focus on conversion elements/i;
  const STRONG = /concentrates on conversion elements|Strong attention capture/i;
  const kinds: Kind[] = ["cta", "heading", "nav", "decorative", "content"];
  const steps = [0, 1, 2, 3, 4];
  test("sweep of bucket mixes: high valuePropSalience never reads as split, low never reads as strong", () => {
    let checked = 0;
    for (const a of steps) for (const b of steps) for (const c of steps) for (const d of steps) for (const e of steps) {
      const counts = [a, b, c, d, e];
      if (counts.reduce((x, y) => x + y, 0) === 0) continue;
      const spec = counts.flatMap((n, k) => Array.from({ length: n }, () => ({ kind: kinds[k], saliency: 0.9 })));
      const q = page(spec);
      const vps = q.valuePropSalience;
      if (vps >= 0.7) expect(q.interpretation, `vps ${vps} mix ${counts}`).not.toMatch(SPLIT);
      if (vps <= 0.3) expect(q.interpretation, `vps ${vps} mix ${counts}`).not.toMatch(STRONG);
      checked++;
    }
    expect(checked).toBeGreaterThan(3000);
  });

  test("the verifier's counterexamples: CTAs 0.9 + headings 0.1, and CTAs 0.2 + headings 0.8", () => {
    const one = page([...Array(9).fill({ kind: "cta", saliency: 0.9 }), { kind: "heading", saliency: 0.9 }]);
    const two = page([...Array(2).fill({ kind: "cta", saliency: 0.9 }), ...Array(8).fill({ kind: "heading", saliency: 0.9 })]);
    for (const q of [one, two]) {
      expect(q.valuePropSalience).toBe(1);
      expect(q.interpretation).not.toMatch(SPLIT);
    }
  });
});
