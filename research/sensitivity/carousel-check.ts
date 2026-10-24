/**
 * Does adding one carousel LOWER a persona's cost? A check on this tree's chain
 * and 514-page reference (raw format 2), asked because on the 20.x/21.0-pre tree
 * (src 48c8304) one carousel lowered the typical user's totalCTC by 0.041 on
 * average over 34 static first screens.
 *
 * The reference stores raw measurements, so the variant changes the raw field
 * itself: `carousel: true` on a page with no running animation, no autoplay and
 * no carousel, which deriveMetrics turns into animationLevel =
 * carouselCount / animation.saturation = 0.3 (the old "+3 units"). Everything
 * else is re-derived by deriveMetrics and scored by computeSequentialCTC with the
 * tools' default options, ranked against this tree's reference curve.
 *
 * Personas: the typical user (every authored trait at 0.5, siteFamiliarity 0,
 * and the reading, pointing and attention capacities bridgeCapacityTraits gives
 * a persona that states nothing), and first-timer, cognitive-adhd and
 * elderly-user as referencePopulation() builds them.
 *
 * Attribution: per layer (transportCost), per dimension (traitCosts), the
 * interaction terms, and the demand the variant changes, so the term that
 * produces the change can be named from the code.
 *
 * Usage (as the tree's owner, worktree root): bun research/sensitivity/carousel-check.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { referenceRaw, referenceGraded, referencePopulation, CTC_REFERENCE } from "../../src/visual/ctc-reference.js";
import { computeDemandDistribution, computeSequentialCTC, LAYER_DEFINITIONS } from "../../src/visual/cognitive-transport-chain.js";
import { buildOTCognitiveProfile, COGNITIVE_TRAITS, deriveMetrics } from "../../src/visual/cognitive-transport.js";
import { bridgeCapacityTraits } from "../../src/visual/cognitive-models.js";

const CAPS = ["readingCapacity", "motorCapacity", "sustainedAttention"];
const stated: Record<string, number> = {};
bridgeCapacityTraits("typical-user", stated);
const typical: Record<string, number> = { siteFamiliarity: 0 };
for (const t of COGNITIVE_TRAITS) if (t !== "siteFamiliarity" && !CAPS.includes(t)) typical[t] = 0.5;
for (const c of CAPS) {
  if (typeof stated[c] !== "number") throw new Error(`the bridge gave no ${c} to a persona that states nothing`);
  typical[c] = stated[c];
}
const pop = new Map(referencePopulation().map((p) => [p.name, p.traits]));
const personas = [
  { name: "typical-user", traits: typical },
  ...["first-timer", "cognitive-adhd", "elderly-user"].map((n) => ({ name: n, traits: pop.get(n)! })),
].map((p) => ({ ...p, profile: buildOTCognitiveProfile(p.name, p.traits) }));

const urls = referenceGraded().map((r) => r.url);
const layerNames = LAYER_DEFINITIONS.map((l) => l.name);
const stats = (v: number[]) => ({ mean: v.reduce((a, b) => a + b, 0) / v.length, min: Math.min(...v), max: Math.max(...v),
  shareNegative: v.filter((x) => x < -1e-12).length / v.length, sharePositive: v.filter((x) => x > 1e-12).length / v.length });

const out: Record<string, unknown> = { reference: CTC_REFERENCE.id, typicalCapacities: Object.fromEntries(CAPS.map((c) => [c, typical[c]])) };
for (const scope of ["viewport", "full_page"] as const) {
  const raws = referenceRaw(scope);
  if (raws.length !== urls.length) throw new Error(`${scope}: ${raws.length} raws for ${urls.length} graded pages`);
  const staticIdx = raws.map((r, i) => (r.runningAnimations + r.autoplayElements === 0 && !r.carousel ? i : -1)).filter((i) => i >= 0);
  const perScope: Record<string, unknown> = { staticPages: staticIdx.length, pages: raws.length };
  const demandDelta: Record<string, number[]> = {};
  for (const p of personas) {
    const dRaw: number[] = [], dTot: number[] = [];
    const dLayer: Record<string, number[]> = Object.fromEntries(layerNames.map((l) => [l, []]));
    const dTrait: Record<string, number[]> = {};
    const dInter: number[] = [];
    for (const i of staticIdx) {
      const m0 = deriveMetrics(raws[i]);
      const m1 = deriveMetrics({ ...raws[i], carousel: true });
      if (m0.animationLevel !== 0 || Math.abs(m1.animationLevel - 0.3) > 1e-12) throw new Error(`${urls[i]}: animationLevel ${m0.animationLevel} -> ${m1.animationLevel}`);
      const d0 = computeDemandDistribution(m0), d1 = computeDemandDistribution(m1);
      if (p.name === "typical-user") for (const k of Object.keys(d1.demands)) (demandDelta[k] ??= []).push(d1.demands[k] - d0.demands[k]);
      const r0 = computeSequentialCTC(p.profile, d0, { asymmetric: true, interactions: true });
      const r1 = computeSequentialCTC(p.profile, d1, { asymmetric: true, interactions: true });
      dRaw.push(r1.rawCTC - r0.rawCTC); dTot.push(r1.totalCTC - r0.totalCTC);
      for (const l of layerNames) dLayer[l].push((r1.layers.find((x) => x.name === l)?.transportCost ?? 0) - (r0.layers.find((x) => x.name === l)?.transportCost ?? 0));
      for (const k of Object.keys(r1.traitCosts)) (dTrait[k] ??= []).push(r1.traitCosts[k] - (r0.traitCosts[k] ?? 0));
      const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
      dInter.push(sum(r1.interactions) - sum(r0.interactions));
    }
    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    perScope[p.name] = {
      capacity: { changeBlindness: p.traits.changeBlindness, emotionalContagion: p.traits.emotionalContagion, sustainedAttention: p.traits.sustainedAttention },
      rawCTC: stats(dRaw), totalCTC: stats(dTot),
      layerMeanDelta: Object.fromEntries(layerNames.map((l) => [l, mean(dLayer[l])])),
      traitMeanDelta: Object.fromEntries(Object.entries(dTrait).map(([k, v]) => [k, mean(v)]).filter(([, v]) => Math.abs(v as number) > 1e-9)),
      interactionMeanDelta: mean(dInter),
    };
  }
  perScope.typicalDemandMeanDelta = Object.fromEntries(Object.entries(demandDelta).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]).filter(([, v]) => Math.abs(v as number) > 1e-9));
  out[scope] = perScope;
}
writeFileSync(join(import.meta.dir, "carousel-check.json"), JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify(out, null, 1));
