/**
 * Calculation 3: the persona distance distribution, and how much it depends on
 * the hand-set ground costs.
 *
 * Profiles are built exactly as cognitive_distance builds its percentile
 * reference (getDistanceReference in src/mcp-tools/base/persona-comparison-tools.ts):
 * getCognitiveProfile(persona).traits -> buildOTCognitiveProfile -> cognitiveDistance(...).w1,
 * over BUILTIN + ACCESSIBILITY + EMOTIONAL personas (25 humans, 300 pairs).
 *
 * Robustness: the five registered constants the distance reads
 * (distance.groundSameDomain 0.2, groundRelatedDomain 0.5, groundUnrelatedDomain 0.8,
 * groundUnknownTrait 0.8, slackCost 0.4) are perturbed through withParamOverrides,
 * the registry's own override hook, so src/ is untouched:
 *   - one at a time, x0.75 and x1.25;
 *   - 200 joint draws, each constant uniform within +-25% of its value, kept only
 *     when same < related < unrelated AND 2 x slack >= the largest ground cost.
 *     The second condition is not optional: below it the generalized W1 is not a
 *     metric and cognitiveDistance refuses to compute (generalizedCostMatrix).
 *     Two schemes: "tied" draws groundUnknownTrait equal to groundUnrelatedDomain
 *     (its provenance says it is set equal to it), "independent" draws it on its
 *     own. The one-at-a-time pass shows it moves no built-in distance (no
 *     built-in persona carries the three capacity traits it governs through
 *     getCognitiveProfile), so in the independent scheme it only adds rejections.
 * For each perturbation: Kendall tau-b between the baseline and perturbed
 * rankings of the 300 pairs, and which personas' nearest neighbour changed.
 *
 * RNG: mulberry32 (32-bit integer math via Math.imul), seed 0x9e3779b9.
 *
 * Usage (as wyld-web, worktree root): bun research/paper-calcs/persona-distance.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUILTIN_PERSONAS, ACCESSIBILITY_PERSONAS, EMOTIONAL_PERSONAS, getCognitiveProfile } from "../../src/personas.js";
import { buildOTCognitiveProfile, cognitiveDistance, OVERALL_LEVEL_KEY, type OTCognitiveProfile } from "../../src/visual/cognitive-transport.js";
import { param, withParamOverrides } from "../../src/visual/model-provenance.js";

const OUT = import.meta.dir;
const IDS = {
  same: "distance.groundSameDomain",
  related: "distance.groundRelatedDomain",
  unrelated: "distance.groundUnrelatedDomain",
  unknown: "distance.groundUnknownTrait",
  slack: "distance.slackCost",
} as const;
type Key = keyof typeof IDS;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Kendall tau-b, O(n^2); n = 300 is 44,850 comparisons. */
function kendallTauB(x: number[], y: number[]): number {
  let c = 0, d = 0, tx = 0, ty = 0;
  for (let i = 0; i < x.length; i++)
    for (let j = i + 1; j < x.length; j++) {
      const sx = Math.sign(x[i] - x[j]), sy = Math.sign(y[i] - y[j]);
      if (sx === 0 && sy === 0) continue;
      if (sx === 0) { tx++; continue; }
      if (sy === 0) { ty++; continue; }
      if (sx === sy) c++; else d++;
    }
  return (c - d) / Math.sqrt((c + d + tx) * (c + d + ty));
}

function quantile(sorted: number[], q: number): number {
  // Hyndman-Fan type 7 (numpy default).
  const h = (sorted.length - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

const roster = { ...BUILTIN_PERSONAS, ...ACCESSIBILITY_PERSONAS, ...EMOTIONAL_PERSONAS } as Record<string, unknown>;
const names = Object.keys(roster);
const profiles: OTCognitiveProfile[] = names.map((n) =>
  buildOTCognitiveProfile(n, (getCognitiveProfile(roster[n] as never).traits as unknown as Record<string, number>) || {}));
const pairs: Array<[number, number]> = [];
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) pairs.push([i, j]);

function allDistances(): { w1: number[]; level: number[] } {
  const w1: number[] = [], level: number[] = [];
  for (const [i, j] of pairs) {
    const d = cognitiveDistance(profiles[i], profiles[j]);
    w1.push(d.w1);
    level.push(d.traitContributions[OVERALL_LEVEL_KEY] ?? 0);
  }
  return { w1, level };
}

/** Nearest neighbour per persona: name, distance, and the margin to the runner-up. */
function nearest(w1: number[]): Array<{ persona: string; nn: string; d: number; second: string; d2: number }> {
  const n = names.length;
  const m: number[][] = Array.from({ length: n }, () => new Array(n).fill(Infinity));
  pairs.forEach(([i, j], k) => { m[i][j] = m[j][i] = w1[k]; });
  return names.map((name, i) => {
    const order = m[i].map((d, j) => ({ d, j })).filter((o) => o.j !== i).sort((a, b) => a.d - b.d || a.j - b.j);
    return { persona: name, nn: names[order[0].j], d: order[0].d, second: names[order[1].j], d2: order[1].d };
  });
}

function main() {
  if (names.length !== 25) throw new Error(`expected 25 human personas, got ${names.length}`);
  const base = Object.fromEntries((Object.keys(IDS) as Key[]).map((k) => [k, param(IDS[k])])) as Record<Key, number>;
  const { w1, level } = allDistances();
  const sorted = w1.slice().sort((a, b) => a - b);
  const mean = w1.reduce((s, x) => s + x, 0) / w1.length;
  const sd = Math.sqrt(w1.reduce((s, x) => s + (x - mean) ** 2, 0) / (w1.length - 1));
  const qs = [0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 1];
  const quantiles = Object.fromEntries(qs.map((q) => [`q${Math.round(q * 100)}`, quantile(sorted, q)]));

  // Histogram: 15 equal-width bins over [min, max].
  const bins = 15, lo = sorted[0], hi = sorted[sorted.length - 1], width = (hi - lo) / bins;
  const hist = Array.from({ length: bins }, (_, b) => ({ lo: lo + b * width, hi: lo + (b + 1) * width, count: 0 }));
  for (const x of w1) hist[Math.min(bins - 1, Math.floor((x - lo) / width))].count++;

  const ranked = pairs.map(([i, j], k) => ({ a: names[i], b: names[j], w1: w1[k], overallLevel: level[k] })).sort((p, q) => p.w1 - q.w1);
  writeFileSync(join(OUT, "distance-pairs.csv"),
    "persona_a,persona_b,w1,overall_level_contribution,level_share\n" +
    ranked.map((r) => `${r.a},${r.b},${r.w1.toFixed(6)},${r.overallLevel.toFixed(6)},${(r.overallLevel / r.w1).toFixed(4)}`).join("\n") + "\n");

  const nnBase = nearest(w1);

  // ── Robustness ──
  type Pert = { label: string; values: Record<Key, number>; refused?: string };
  const perts: Pert[] = [];
  for (const k of Object.keys(IDS) as Key[])
    for (const f of [0.75, 1.25]) perts.push({ label: `${k} x${f}`, values: { ...base, [k]: base[k] * f } });
  // The one-at-a-time draws the metric guard refuses get a repaired twin: slack
  // raised to half the largest ground cost, the rule provenance/distance.ts states
  // for choosing slack in the first place.
  const metricOk = (v: Record<Key, number>) => 2 * v.slack >= Math.max(v.same, v.related, v.unrelated, v.unknown) - 1e-12;
  const ordered = (v: Record<Key, number>) => v.same < v.related && v.related < v.unrelated;
  for (const p of perts.slice()) {
    if (!metricOk(p.values) && p.label.indexOf("slack") !== 0) {
      const v = { ...p.values, slack: Math.max(p.values.same, p.values.related, p.values.unrelated, p.values.unknown) / 2 };
      perts.push({ label: `${p.label} (+slack ${v.slack.toFixed(2)})`, values: v });
    }
  }

  const drawJoint = (tied: boolean, seed: number) => {
    const rnd = mulberry32(seed);
    let draws = 0, rejectedOrder = 0, rejectedMetric = 0;
    const out: Pert[] = [];
    while (out.length < 200) {
      draws++;
      const v = Object.fromEntries((Object.keys(IDS) as Key[]).map((k) => [k, base[k] * (0.75 + 0.5 * rnd())])) as Record<Key, number>;
      if (tied) v.unknown = v.unrelated;
      if (!ordered(v)) { rejectedOrder++; continue; }
      if (!metricOk(v)) { rejectedMetric++; continue; }
      out.push({ label: `joint-${tied ? "tied" : "independent"} ${out.length + 1}`, values: v });
    }
    return { out, draws, rejectedOrder, rejectedMetric };
  };

  const evalPert = (p: Pert) => {
    if (!metricOk(p.values)) return { ...p, refused: "2 x slack below the largest ground cost: not a metric, cognitiveDistance refuses" };
    if (!ordered(p.values)) return { ...p, refused: "breaks same < related < unrelated" };
    const ov = Object.fromEntries((Object.keys(IDS) as Key[]).map((k) => [IDS[k], p.values[k]]));
    const pw = withParamOverrides(ov, () => allDistances().w1);
    const nn = nearest(pw);
    const changed = nn.filter((r, i) => r.nn !== nnBase[i].nn).map((r) => r.persona);
    return { ...p, tau: kendallTauB(w1, pw), nnChanged: changed };
  };

  const oneAtATime = perts.map(evalPert);
  const schemes = ([[true, 0x9e3779b9], [false, 0x85ebca6b]] as const).map(([tied, seed]) => {
    const d = drawJoint(tied, seed);
    const res = d.out.map(evalPert);
    const taus = res.map((r) => (r as { tau: number }).tau).sort((a, b) => a - b);
    const nnChangeRate = Object.fromEntries(names.map((n) => [n, res.filter((r) => (r as { nnChanged: string[] }).nnChanged.includes(n)).length / res.length]));
    const anyChange = res.filter((r) => (r as { nnChanged: string[] }).nnChanged.length > 0).length / res.length;
    const meanChanged = res.reduce((s, r) => s + (r as { nnChanged: string[] }).nnChanged.length, 0) / res.length;
    const slackDrawn = d.out.map((p) => p.values.slack).sort((a, b) => a - b);
    return {
      scheme: tied ? "tied" : "independent", seed: `0x${seed.toString(16)}`, res,
      stats: {
        accepted: d.out.length, draws: d.draws, rejected_order: d.rejectedOrder, rejected_metric: d.rejectedMetric,
        tau_median: quantile(taus, 0.5), tau_p5: quantile(taus, 0.05), tau_min: taus[0], tau_max: taus[taus.length - 1],
        draws_with_any_nn_change: anyChange, mean_personas_with_nn_change: meanChanged,
        accepted_slack_median: quantile(slackDrawn, 0.5),
        nn_change_rate: nnChangeRate,
      },
    };
  });
  const jointRes = schemes.flatMap((s) => s.res);

  writeFileSync(join(OUT, "distance-robustness.csv"),
    "perturbation,same,related,unrelated,unknown,slack,kendall_tau_b,nn_changed_count,nn_changed,refused\n" +
    [...oneAtATime, ...jointRes].map((r) => {
      const v = r.values;
      const res = r as { tau?: number; nnChanged?: string[]; refused?: string };
      return [`"${r.label}"`, v.same, v.related, v.unrelated, v.unknown, v.slack].map((x) => (typeof x === "number" ? x.toFixed(4) : x)).join(",") +
        `,${res.tau === undefined ? "" : res.tau.toFixed(5)},${res.nnChanged?.length ?? ""},"${(res.nnChanged ?? []).join(" ")}","${res.refused ?? ""}"`;
    }).join("\n") + "\n");

  const summary = {
    ran: new Date().toISOString(),
    personas: names.length, pairs: pairs.length,
    profile_construction: "getCognitiveProfile(p).traits -> buildOTCognitiveProfile -> cognitiveDistance().w1 (as cognitive_distance's reference)",
    baseline_constants: base,
    w1: { mean, sd, ...quantiles },
    level_share_median: quantile(ranked.map((r) => r.overallLevel / r.w1).sort((a, b) => a - b), 0.5),
    histogram: hist,
    closest10: ranked.slice(0, 10),
    farthest10: ranked.slice(-10).reverse(),
    nearest_neighbour: nnBase.map((r) => ({ ...r, margin: r.d2 - r.d })),
    robustness: {
      one_at_a_time: oneAtATime.map((r) => {
        const res = r as { tau?: number; nnChanged?: string[]; refused?: string };
        return { label: r.label, values: r.values, tau: res.tau, nn_changed: res.nnChanged, refused: res.refused };
      }),
      joint: Object.fromEntries(schemes.map((s) => [s.scheme, { seed: s.seed, ...s.stats }])),
      rng: "mulberry32, each constant uniform on [0.75, 1.25] x baseline; tied seed 0x9e3779b9, independent seed 0x85ebca6b",
    },
  };
  writeFileSync(join(OUT, "distance-summary.json"), JSON.stringify(summary, null, 2));

  console.log(`w1 over ${pairs.length} pairs: mean ${mean.toFixed(4)} sd ${sd.toFixed(4)}; ` + qs.map((q) => `q${Math.round(q * 100)} ${quantile(sorted, q).toFixed(4)}`).join(" "));
  console.log("closest:", ranked.slice(0, 10).map((r) => `${r.a}~${r.b} ${r.w1.toFixed(4)}`).join("; "));
  console.log("farthest:", ranked.slice(-10).reverse().map((r) => `${r.a}~${r.b} ${r.w1.toFixed(4)}`).join("; "));
  for (const r of nnBase) console.log(`  NN ${r.persona.padEnd(28)} ${r.nn.padEnd(28)} ${r.d.toFixed(4)} (next ${r.second} +${(r.d2 - r.d).toFixed(4)})`);
  for (const r of oneAtATime) {
    const res = r as { tau?: number; nnChanged?: string[]; refused?: string };
    console.log(`  ${r.label.padEnd(36)} ${res.refused ? `REFUSED: ${res.refused}` : `tau ${res.tau!.toFixed(4)}  NN changed ${res.nnChanged!.length}: ${res.nnChanged!.join(", ")}`}`);
  }
  for (const { scheme, stats: j } of schemes) {
    console.log(`joint-${scheme}: ${j.accepted} accepted of ${j.draws} (order ${j.rejected_order}, metric ${j.rejected_metric} rejected; accepted slack median ${j.accepted_slack_median.toFixed(3)}); tau median ${j.tau_median.toFixed(4)} p5 ${j.tau_p5.toFixed(4)} min ${j.tau_min.toFixed(4)}; any NN change in ${(j.draws_with_any_nn_change * 100).toFixed(1)}% of draws, mean ${j.mean_personas_with_nn_change.toFixed(2)} personas per draw`);
    console.log("  NN change rate:", Object.entries(j.nn_change_rate).filter(([, r]) => r > 0).map(([n, r]) => `${n} ${(r * 100).toFixed(1)}%`).join(", "));
  }
}

main();
