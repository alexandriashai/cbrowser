/**
 * Surplus billing: what a stimulus does to the cost of each surplus-billed
 * trait, on the tree TREE (default: this tree) and its 514-page reference.
 * Measurement only. research/surplus-billing-design.md reads the output.
 *
 * Three stimuli, each added to a page that already has the rest:
 *   motion   `carousel: true` on a static page (no running animation, no
 *            autoplay, no carousel), as research/sensitivity/carousel-check.ts
 *            does: deriveMetrics turns it into animationLevel 0.3.
 *   choice   the page's choosing time (novice and expert) x 1.5, every page.
 *   reading  the page's reading time x 1.5, every page.
 *
 * For each stimulus and each surplus-billed trait some layer reads: the share
 * of (persona, page) pairs on which the stimulus LOWERS that trait's cost
 * (traitCosts, before the content gate), split by whether the trait was in
 * surplus before. For motion also: the carousel check's four personas (mean
 * and share of pages cheaper, totalCTC and the frustration layer), and the
 * property "adding motion never lowers the frustration layer's cost" over
 * every persona and static page, with the count of violations and the layer
 * that moved first.
 *
 * Personas: the typical user (as carousel-check.ts builds it) and the 25
 * referencePopulation() personas.
 *
 *   TREE=/path/to/tree bun research/surplus-billing/predict.ts > out.json
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

const TREE = process.env.TREE ?? `${import.meta.dir}/../..`;
const { referenceRaw, referenceGraded, referencePopulation, CTC_REFERENCE } = await import(`${TREE}/src/visual/ctc-reference.ts`);
const { computeDemandDistribution, computeSequentialCTC } = await import(`${TREE}/src/visual/cognitive-transport-chain.ts`);
const { buildOTCognitiveProfile, COGNITIVE_TRAITS, deriveMetrics } = await import(`${TREE}/src/visual/cognitive-transport.ts`);
const { bridgeCapacityTraits } = await import(`${TREE}/src/visual/cognitive-models.ts`);

/** Surplus-billed at 0686210 and read by a layer (the other six are in no layer). */
const BILLED_IN_LAYER = ["changeBlindness", "satisficing", "anchoringBias", "riskTolerance", "fearOfMissingOut", "socialProofSensitivity", "patience", "emotionalContagion"];
const OPTS = { asymmetric: true, interactions: true };

const CAPS = ["readingCapacity", "motorCapacity", "sustainedAttention"];
const stated: Record<string, number> = {};
bridgeCapacityTraits("typical-user", stated);
const typical: Record<string, number> = { siteFamiliarity: 0 };
for (const t of COGNITIVE_TRAITS as string[]) if (t !== "siteFamiliarity" && !CAPS.includes(t)) typical[t] = 0.5;
for (const c of CAPS) typical[c] = stated[c];
const personas = [{ name: "typical-user", traits: typical }, ...referencePopulation()]
  .map((p: { name: string; traits: Record<string, number> }) => ({ ...p, profile: buildOTCognitiveProfile(p.name, p.traits) }));
const FOUR = ["typical-user", "first-timer", "cognitive-adhd", "elderly-user"];

type Metrics = Record<string, number> & { choosingSeconds: number; choosingSecondsExpert: number; readingSeconds: number };
const STIMULI: Record<string, { pages: "static" | "all"; apply: (raw: Record<string, unknown>) => Metrics }> = {
  motion: { pages: "static", apply: (raw) => deriveMetrics({ ...raw, carousel: true }) },
  choice: { pages: "all", apply: (raw) => { const m = deriveMetrics(raw) as Metrics; return { ...m, choosingSeconds: m.choosingSeconds * 1.5, choosingSecondsExpert: m.choosingSecondsExpert * 1.5 }; } },
  reading: { pages: "all", apply: (raw) => { const m = deriveMetrics(raw) as Metrics; return { ...m, readingSeconds: m.readingSeconds * 1.5 }; } },
};

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const EPS = 1e-12;
const layerCost = (r: { layers: Array<{ name: string; transportCost: number }> }, n: string) => r.layers.find((l) => l.name === n)?.transportCost ?? 0;

const out: Record<string, unknown> = { tree: TREE, reference: CTC_REFERENCE.id, pages: referenceGraded().length, personas: personas.length };
for (const scope of ["viewport", "full_page"] as const) {
  const raws = referenceRaw(scope) as Array<Record<string, unknown> & { runningAnimations: number; autoplayElements: number; carousel: boolean }>;
  const staticIdx = raws.map((r, i) => (r.runningAnimations + r.autoplayElements === 0 && !r.carousel ? i : -1)).filter((i) => i >= 0);
  const allIdx = raws.map((_, i) => i);
  const perScope: Record<string, unknown> = { staticPages: staticIdx.length };
  for (const [sName, s] of Object.entries(STIMULI)) {
    const idx = s.pages === "static" ? staticIdx : allIdx;
    const lowered: Record<string, { pairs: number; lowered: number; loweredFromSurplus: number; surplusPairs: number; demandZeroBefore: number }> = {};
    for (const t of BILLED_IN_LAYER) lowered[t] = { pairs: 0, lowered: 0, loweredFromSurplus: 0, surplusPairs: 0, demandZeroBefore: 0 };
    const four: Record<string, { dTotal: number[]; dFrustration: number[] }> = {};
    let frustrationPairs = 0, frustrationLowered = 0, totalLowered = 0;
    const firstMover: Record<string, number> = {};
    const loweredBy: Record<string, number> = {};
    for (const i of idx) {
      const m0 = deriveMetrics(raws[i]);
      const m1 = s.apply(raws[i]);
      const d0 = computeDemandDistribution(m0), d1 = computeDemandDistribution(m1);
      for (const p of personas) {
        const r0 = computeSequentialCTC(p.profile, d0, OPTS), r1 = computeSequentialCTC(p.profile, d1, OPTS);
        for (const t of BILLED_IN_LAYER) {
          const L = lowered[t];
          L.pairs++;
          const cap = Math.max(0, Math.min(1, p.traits[t] ?? 0.5));
          const inSurplus = (d0.demands[t] ?? 0) < cap;
          if (inSurplus) L.surplusPairs++;
          if ((d0.demands[t] ?? 0) === 0) L.demandZeroBefore++;
          if (r1.traitCosts[t] < r0.traitCosts[t] - EPS) { L.lowered++; if (inSurplus) L.loweredFromSurplus++; }
        }
        if (sName === "motion") {
          const f0 = layerCost(r0, "frustration"), f1 = layerCost(r1, "frustration");
          frustrationPairs++;
          if (f1 < f0 - EPS) {
            frustrationLowered++;
            // Which trait's (pre-gate) cost fell most: the term the violation goes through.
            let worst = "", by = 0;
            for (const t of ["patience", "emotionalContagion"]) { const dt = r1.traitCosts[t] - r0.traitCosts[t]; if (dt < by) { by = dt; worst = t; } }
            loweredBy[worst || "gate"] = (loweredBy[worst || "gate"] ?? 0) + 1;
            // The first layer, in chain order, whose cost changed (the route into frustration).
            const first = r0.layers.find((l: { name: string; transportCost: number }) => Math.abs(layerCost(r1, l.name) - l.transportCost) > EPS)?.name ?? "none";
            firstMover[first] = (firstMover[first] ?? 0) + 1;
          }
          if (r1.totalCTC < r0.totalCTC - EPS) totalLowered++;
          if (FOUR.includes(p.name)) {
            (four[p.name] ??= { dTotal: [], dFrustration: [] }).dTotal.push(r1.totalCTC - r0.totalCTC);
            four[p.name].dFrustration.push(f1 - f0);
          }
        }
      }
    }
    const res: Record<string, unknown> = {
      pages: idx.length,
      traits: Object.fromEntries(Object.entries(lowered).map(([t, L]) => [t, {
        loweredShare: L.lowered / L.pairs, loweredFromSurplusShare: L.lowered ? L.loweredFromSurplus / L.lowered : 0,
        surplusShare: L.surplusPairs / L.pairs, demandZeroBeforeShare: L.demandZeroBefore / L.pairs,
      }])),
    };
    if (sName === "motion") {
      res.carouselCheck = Object.fromEntries(FOUR.map((n) => [n, {
        meanTotal: mean(four[n].dTotal), cheaperShare: four[n].dTotal.filter((x) => x < -EPS).length / four[n].dTotal.length,
        meanFrustration: mean(four[n].dFrustration), frustrationCheaperShare: four[n].dFrustration.filter((x) => x < -EPS).length / four[n].dFrustration.length,
      }]));
      res.property = { pairs: frustrationPairs, frustrationLowered, totalCTCLowered: totalLowered, loweredThrough: loweredBy, firstLayerThatMoved: firstMover };
    }
    perScope[sName] = res;
  }
  out[scope] = perScope;
}
console.log(JSON.stringify(out, null, 1));
