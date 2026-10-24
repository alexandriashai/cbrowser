/**
 * Raw-measurement perturbation for constructed page variants (Study 3 redesign D3).
 *
 * The reference set stores what extractPageMetrics returned: the 0-1 page metrics,
 * not the raw counts behind them. A variant "with one factor changed" has to change
 * a RAW quantity (characters of text, running animations, links) and let the
 * registered normalisers turn it back into metrics, or it is not the page the
 * chain would have measured. This module inverts those normalisers, perturbs one
 * raw quantity, and re-derives every metric with the same formulas and the same
 * registered constants (read through param(), no literals) that
 * extractPageMetrics uses (src/visual/cognitive-transport.ts; constants in
 * src/visual/provenance/page-metrics.ts):
 *
 *   T  = de-duplicated visible characters  -> informationDensity = T / (T + infoMid)
 *   A  = measured area / 1,000 px^2        -> textDensity = c / (c + tdMid), c = T / A
 *   W  = colours*3 + images*2 + elements*0.5 -> visualComplexity = W / (W + visMid)
 *   n  = running animations + carousel*3   -> animationLevel = min(1, n / animSat)
 *   L  = mean word length (Latin-equivalent chars) -> avgWordLength = clamp((L - off) / span)
 *   s  = words per sentence                -> avgSentenceLength = min(1, s / sentSat)
 *   interactive, choice and navigation counts, and the three word fractions, are
 *   stored raw.
 *
 * A saturated metric (animationLevel or avgSentenceLength at 1, avgWordLength at 0
 * or 1) has no unique inverse; the raw value is set at the boundary and flagged,
 * and a perturbation that would need the exact value refuses that page.
 *
 * Target size and contrast are NOT among the measured metrics: the chain does not
 * read them (target size goes to the pointing model beside it). A target-size or
 * contrast variant therefore leaves every metric, and every CTC, unchanged; the
 * identity variants are kept so that this is shown rather than assumed.
 *
 * Self-test (run this file): on every graded reference page at both scopes,
 * metrics -> raw -> metrics reproduces every stored metric, and at viewport scope
 * the area recovered from (informationDensity, textDensity) equals the measured
 * viewport, which checks the T and A formulas against what the browser computed.
 *
 * Usage (as the tree's owner, worktree root): bun research/paper-calcs/r3/raw-perturb.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { param } from "../../../src/visual/model-provenance.js";
import { referenceOutcomes, referencePages, CTC_REFERENCE } from "../../../src/visual/ctc-reference.js";
import type { PageMetrics } from "../../../src/visual/cognitive-transport-chain.js";

type Metrics = PageMetrics & { pageScreens?: number; choiceCountRaw?: number; choiceCountCapped?: boolean };

export interface RawPage {
  textChars: number;
  area1000: number | null;
  visualWeight: number;
  animUnits: number;
  animSaturated: boolean;
  interactive: number;
  choices: number;
  navigationDepth: number;
  wordLength: number;
  wordLengthClamped: boolean;
  wordsPerSentence: number;
  sentenceSaturated: boolean;
  lexicalDiversity: number;
  longWordRatio: number;
  technicalDensity: number;
  passthrough: Pick<Metrics, "scriptFamily" | "scope" | "pageScreens">;
}

const K = () => ({
  infoMid: param("pageMetrics.informationDensity.midpoint"),
  tdMid: param("pageMetrics.textDensity.midpoint"),
  visMid: param("pageMetrics.visual.midpoint"),
  carousel: param("pageMetrics.animation.carouselCount"),
  animSat: param("pageMetrics.animation.saturation"),
  wlOff: param("pageMetrics.wordLength.offset"),
  wlSpan: param("pageMetrics.wordLength.span"),
  sentSat: param("pageMetrics.sentenceLength.saturation"),
  choiceCap: param("pageMetrics.choiceCap"),
});

const inv = (x: number, mid: number) => (x <= 0 ? 0 : (mid * x) / (1 - x));
const fwd = (v: number, mid: number) => (v <= 0 ? 0 : v / (v + mid));

export function rawFromMetrics(m: Metrics): RawPage {
  const k = K();
  const T = inv(m.informationDensity, k.infoMid);
  const c = inv(m.textDensity, k.tdMid);
  const wl = m.avgWordLength ?? 0;
  const sl = m.avgSentenceLength ?? 0;
  return {
    textChars: T,
    area1000: T > 0 && c > 0 ? T / c : null,
    visualWeight: inv(m.visualComplexity, k.visMid),
    animUnits: m.animationLevel * k.animSat,
    animSaturated: m.animationLevel >= 1,
    interactive: m.interactiveElementCount,
    choices: m.choiceCountRaw ?? m.choiceCount,
    navigationDepth: m.navigationDepth,
    wordLength: k.wlOff + wl * k.wlSpan,
    wordLengthClamped: wl <= 0 || wl >= 1,
    wordsPerSentence: sl * k.sentSat,
    sentenceSaturated: sl >= 1,
    lexicalDiversity: m.lexicalDiversity ?? 0,
    longWordRatio: m.longWordRatio ?? 0,
    technicalDensity: m.technicalDensity ?? 0,
    passthrough: { scriptFamily: m.scriptFamily, scope: m.scope, pageScreens: m.pageScreens },
  };
}

export function metricsFromRaw(r: RawPage): Metrics {
  const k = K();
  const choices = Math.max(0, Math.round(r.choices));
  const c = r.area1000 ? r.textChars / Math.max(1, r.area1000) : 0;
  return {
    informationDensity: fwd(r.textChars, k.infoMid),
    visualComplexity: fwd(r.visualWeight, k.visMid),
    interactiveElementCount: Math.max(0, Math.round(r.interactive)),
    textDensity: fwd(c, k.tdMid),
    animationLevel: Math.min(1, Math.max(0, r.animUnits) / k.animSat),
    choiceCount: Math.min(choices, k.choiceCap),
    choiceCountRaw: choices,
    choiceCountCapped: choices > k.choiceCap,
    navigationDepth: r.navigationDepth,
    avgWordLength: Math.min(1, Math.max(0, (r.wordLength - k.wlOff) / k.wlSpan)),
    avgSentenceLength: Math.min(1, r.wordsPerSentence / k.sentSat),
    lexicalDiversity: r.lexicalDiversity,
    longWordRatio: r.longWordRatio,
    technicalDensity: r.technicalDensity,
    ...r.passthrough,
  };
}

export interface Variant { factor: string; label: string; raw: RawPage }

/**
 * One-factor variants of a page, each a change to one raw quantity. Magnitudes are
 * stated in the label; a variant that would need an unknowable raw value, or that
 * would change nothing, is not produced (except the two identity variants, which
 * are produced on purpose).
 */
export function variants(r: RawPage): Variant[] {
  const k = K();
  const out: Variant[] = [];
  const add = (factor: string, label: string, patch: Partial<RawPage>) => out.push({ factor, label, raw: { ...r, ...patch } });
  // Motion. Off removes every running animation and the carousel; on adds a carousel's worth, or twice that.
  if (r.animUnits > 0) add("motion", "motion off (all running animation removed)", { animUnits: 0, animSaturated: false });
  if (r.animUnits === 0) {
    add("motion", `motion on (+${k.carousel} units, one carousel)`, { animUnits: k.carousel });
    add("motion", `motion on (+${2 * k.carousel} units)`, { animUnits: 2 * k.carousel });
  }
  // Text quantity: visible characters halved or doubled; text style kept.
  if (r.textChars > 0 && r.area1000) {
    add("text_density", "text halved", { textChars: r.textChars * 0.5 });
    add("text_density", "text doubled", { textChars: r.textChars * 2 });
  }
  // Text difficulty: a plain-language rewrite and a jargon rewrite of the same text.
  if (!r.wordLengthClamped && !r.sentenceSaturated) {
    const plain = { wordLength: Math.min(r.wordLength, 4.5), wordsPerSentence: Math.min(r.wordsPerSentence, 12),
                    longWordRatio: Math.min(r.longWordRatio, 0.15), technicalDensity: Math.min(r.technicalDensity, 0.02) };
    if (plain.wordLength < r.wordLength || plain.wordsPerSentence < r.wordsPerSentence || plain.longWordRatio < r.longWordRatio)
      add("text_difficulty", "plain language (word length <= 4.5, sentence <= 12 words, long words <= 15%, technical <= 2%)", plain);
    const jargon = { wordLength: Math.max(r.wordLength, 6.5), wordsPerSentence: Math.max(r.wordsPerSentence, 25),
                     longWordRatio: Math.max(r.longWordRatio, 0.4), technicalDensity: Math.max(r.technicalDensity, 0.12) };
    if (jargon.wordLength > r.wordLength || jargon.wordsPerSentence > r.wordsPerSentence || jargon.longWordRatio > r.longWordRatio)
      add("text_difficulty", "jargon (word length >= 6.5, sentence >= 25 words, long words >= 40%, technical >= 12%)", jargon);
  }
  // Links: half or double the choices; removed or added links are interactive elements too.
  if (r.choices >= 2) {
    const half = Math.round(r.choices / 2);
    add("links", "links halved", { choices: r.choices - half, interactive: Math.max(0, r.interactive - half) });
    add("links", "links doubled", { choices: r.choices * 2, interactive: r.interactive + r.choices });
  }
  // Visual complexity: the colour-image-element weight halved or doubled.
  if (r.visualWeight > 0) {
    add("visual", "visual complexity weight halved", { visualWeight: r.visualWeight * 0.5 });
    add("visual", "visual complexity weight doubled", { visualWeight: r.visualWeight * 2 });
  }
  // Not measured: the chain cannot see these.
  add("target_size", "targets enlarged (not a measured metric: identity)", {});
  add("contrast", "contrast raised (not a measured metric: identity)", {});
  return out;
}

export function selfTest(): { pages: number; checks: number; maxRelErr: number; viewportAreaMaxRelErr: number; viewportAreaPages: number } {
  const graded = referenceOutcomes().filter((o) => o.outcome === "graded").map((o) => o.url);
  let checks = 0, maxRelErr = 0, areaErr = 0, areaPages = 0;
  const vpArea = 1920 * 1080 * param("pageMetrics.textDensity.areaUnit");
  for (const scope of ["viewport", "full_page"] as const) {
    referencePages(scope).forEach((m, i) => {
      const back = metricsFromRaw(rawFromMetrics(m as Metrics)) as Record<string, unknown>;
      for (const [key, v] of Object.entries(m as Record<string, unknown>)) {
        if (typeof v !== "number") { if (back[key] !== v) throw new Error(`${graded[i]} ${scope} ${key}: ${String(back[key])} != ${String(v)}`); continue; }
        const b = back[key] as number;
        const err = Math.abs(b - v) / Math.max(1e-12, Math.abs(v));
        if (!(err < 1e-9 || Math.abs(b - v) < 1e-12)) throw new Error(`${graded[i]} ${scope} ${key}: round trip ${b} != stored ${v}`);
        maxRelErr = Math.max(maxRelErr, Math.abs(v) > 1e-12 ? err : 0);
        checks++;
      }
      if (scope === "viewport") {
        const raw = rawFromMetrics(m as Metrics);
        if (raw.area1000) { areaPages++; areaErr = Math.max(areaErr, Math.abs(raw.area1000 - vpArea) / vpArea); }
      }
    });
  }
  if (areaErr > 1e-6) throw new Error(`viewport area recovered from informationDensity and textDensity differs from 1920 x 1080 by ${areaErr}`);
  return { pages: graded.length, checks, maxRelErr, viewportAreaMaxRelErr: areaErr, viewportAreaPages: areaPages };
}

if (import.meta.main) {
  const r = selfTest();
  console.log(`reference ${CTC_REFERENCE.id}: round trip on ${r.pages} pages x 2 scopes, ${r.checks} metric values, max relative error ${r.maxRelErr.toExponential(2)}; ` +
    `viewport area recovered on ${r.viewportAreaPages} pages, max relative error ${r.viewportAreaMaxRelErr.toExponential(2)}`);
}
