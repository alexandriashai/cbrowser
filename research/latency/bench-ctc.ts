/**
 * Latency of the 8-layer cognitive transport chain on plain data (no browser).
 *
 * Each operation mirrors what a shipped tool does, so the times describe the
 * product rather than a bare inner loop:
 *
 *   single CTC     one persona on one page, the cognitive_effort sequence
 *                  (src/mcp-tools/base/persona-comparison-tools.ts:862-1080):
 *                  copy the persona's traits, familiarity gate with no site model
 *                  (0.0), bridgeCapacityTraits on the COPY, buildOTCognitiveProfile,
 *                  computeSequentialCTC({ asymmetric: true, interactions: true }).
 *                  Demand is built once, outside the timer, as the tool does per page.
 *   persona sweep  the same, for every persona in a roster. No exported function
 *                  sweeps the roster; this is the loop a caller would write.
 *                  Two rosters: 21 (BUILTIN + ACCESSIBILITY) and 25 (all humans).
 *   distance matrix  cognitiveDistanceMatrix over the roster's profiles, built the
 *                  way the tool paths build them (getCognitiveProfile, no bridge).
 *   adversarial    there is NO DRO bound in the code. generateAdversarialPersonas is
 *                  the nearest thing (a greedy L1-budget heuristic, no certificate);
 *                  it is timed here under that name, never as a DRO bound.
 *
 * Page extraction (extractPageMetrics on a live page) is not timed: it needs a
 * browser and dominates any real call.
 *
 * Usage: bun research/latency/bench-ctc.ts [--out DIR]
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { loadavg, cpus } from "node:os";
import { computeSequentialCTC, computeDemandFromRawMetrics } from "../../src/visual/cognitive-transport-chain.js";
import { buildOTCognitiveProfile, cognitiveDistanceMatrix, generateAdversarialPersonas } from "../../src/visual/cognitive-transport.js";
import { bridgeCapacityTraits } from "../../src/visual/cognitive-models.js";
import { BUILTIN_PERSONAS, ACCESSIBILITY_PERSONAS, EMOTIONAL_PERSONAS, getCognitiveProfile } from "../../src/personas.js";

type AnyPersona = { name?: string; cognitiveTraits?: Record<string, number>; accessibilityTraits?: Record<string, number> };

const ROSTER_21 = { ...BUILTIN_PERSONAS, ...ACCESSIBILITY_PERSONAS } as Record<string, AnyPersona>;
const ROSTER_25 = { ...ROSTER_21, ...EMOTIONAL_PERSONAS } as Record<string, AnyPersona>;

// A mid-complexity page: density 0.5, complexity 0.5, 40 controls, text 0.5,
// animation 0.2, 12 choices, 3 breadcrumb levels.
const DEMAND = computeDemandFromRawMetrics(0.5, 0.5, 40, 0.5, 0.2, 12, 3);

function toolProfile(name: string, p: AnyPersona) {
  const traits = { ...(p.cognitiveTraits ?? {}) } as Record<string, number>;
  traits.siteFamiliarity = 0.0; // no site model: the gate's else branch
  try { bridgeCapacityTraits(name, traits, p.accessibilityTraits); } catch { /* the tool tolerates this too */ }
  return buildOTCognitiveProfile(name, traits);
}

function singleCTC(name: string, p: AnyPersona) {
  return computeSequentialCTC(toolProfile(name, p), DEMAND, { asymmetric: true, interactions: true });
}

function sweep(roster: Record<string, AnyPersona>) {
  let s = 0;
  for (const [n, p] of Object.entries(roster)) s += singleCTC(n, p).totalCTC;
  return s;
}

function distanceProfiles(roster: Record<string, AnyPersona>) {
  return Object.entries(roster).map(([n, p]) =>
    buildOTCognitiveProfile(n, getCognitiveProfile(p as never).traits as unknown as Record<string, number>));
}

/** Time `fn` as `samples` batches of `batch` calls; report per-call statistics in microseconds. */
function bench(label: string, fn: () => unknown, samples: number, batch: number, warmup: number) {
  for (let i = 0; i < warmup; i++) fn();
  const per: number[] = [];
  let sink = 0;
  for (let s = 0; s < samples; s++) {
    const t = performance.now();
    for (let i = 0; i < batch; i++) { const r = fn(); if (typeof r === "number") sink += r; }
    per.push(((performance.now() - t) * 1000) / batch);
  }
  per.sort((a, b) => a - b);
  const q = (p: number) => per[Math.min(per.length - 1, Math.floor(p * per.length))];
  const mean = per.reduce((a, b) => a + b, 0) / per.length;
  void sink;
  return { label, samples, batch, median_us: +q(0.5).toFixed(2), p95_us: +q(0.95).toFixed(2), mean_us: +mean.toFixed(2), min_us: +per[0].toFixed(2) };
}

async function main() {
  const args = process.argv.slice(2);
  const outDir = args.includes("--out") ? args[args.indexOf("--out") + 1] : join(import.meta.dir, "results-2026-10-21");
  const repo = join(import.meta.dir, "..", "..");
  const commit = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const srcDirty = execFileSync("git", ["-C", repo, "status", "--porcelain", "--", "src"], { encoding: "utf8" }).trim();

  // Sanity: the chain has 8 layers and every roster persona yields a finite CTC.
  const probe = singleCTC("first-timer", ROSTER_21["first-timer"]);
  if (probe.layers.length !== 8) throw new Error(`expected 8 layers, got ${probe.layers.length}`);
  for (const [n, p] of Object.entries(ROSTER_25)) {
    const c = singleCTC(n, p).totalCTC;
    if (!Number.isFinite(c)) throw new Error(`non-finite CTC for ${n}`);
  }
  // The bridge must not leak into the shared registry objects (it mutates its argument).
  const before = JSON.stringify(ROSTER_25["elderly-user"].cognitiveTraits);
  singleCTC("elderly-user", ROSTER_25["elderly-user"]);
  if (JSON.stringify(ROSTER_25["elderly-user"].cognitiveTraits) !== before) throw new Error("bridge mutated the registry persona");

  const profiles21 = distanceProfiles(ROSTER_21);
  const profiles25 = distanceProfiles(ROSTER_25);
  const costFn = (traits: Record<string, number>) =>
    computeSequentialCTC(buildOTCognitiveProfile("adv", traits), DEMAND, { asymmetric: true, interactions: true }).totalCTC;

  const load0 = loadavg();
  const results = [
    bench("single CTC (1 persona, 1 page, tool sequence)", () => singleCTC("first-timer", ROSTER_21["first-timer"]).totalCTC, 200, 200, 2000),
    bench("single CTC, chain only (computeSequentialCTC on a prebuilt profile)", (() => {
      const prof = toolProfile("first-timer", ROSTER_21["first-timer"]);
      return () => computeSequentialCTC(prof, DEMAND, { asymmetric: true, interactions: true }).totalCTC;
    })(), 200, 200, 2000),
    bench("persona sweep, 21 personas (BUILTIN + ACCESSIBILITY)", () => sweep(ROSTER_21), 200, 10, 50),
    bench("persona sweep, 25 personas (all human)", () => sweep(ROSTER_25), 200, 10, 50),
    bench("pairwise distance matrix, 21 x 21 (cognitiveDistanceMatrix)", () => cognitiveDistanceMatrix(profiles21).matrix.length, 200, 5, 20),
    bench("pairwise distance matrix, 25 x 25 (cognitiveDistanceMatrix)", () => cognitiveDistanceMatrix(profiles25).matrix.length, 200, 5, 20),
    bench("adversarial personas, 21 known, eps 0.1 (NOT a DRO bound; no bound exists)", () => generateAdversarialPersonas(profiles21, costFn, 0.1).length, 50, 1, 3),
  ];
  const load1 = loadavg();

  const meta = {
    ran: new Date().toISOString(), commit, src_dirty: !!srcDirty,
    package_version: JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).version,
    runtime: `bun ${Bun.version}`, cpu: cpus()[0]?.model, cores: cpus().length,
    loadavg_before: load0.map((x) => +x.toFixed(2)), loadavg_after: load1.map((x) => +x.toFixed(2)),
    demand: "computeDemandFromRawMetrics(0.5, 0.5, 40, 0.5, 0.2, 12, 3)",
    note: "Plain-data timings; extractPageMetrics on a live page is excluded. Times are per call, in microseconds, single-threaded.",
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "latency.json"), JSON.stringify({ ...meta, results }, null, 2));
  console.log(JSON.stringify(meta, null, 2));
  console.log(`\n${"operation".padEnd(78)}${"median".padStart(12)}${"p95".padStart(12)}`);
  for (const r of results) console.log(`${r.label.padEnd(78)}${(r.median_us.toFixed(1) + " us").padStart(12)}${(r.p95_us.toFixed(1) + " us").padStart(12)}`);
  console.log(`wrote ${outDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
