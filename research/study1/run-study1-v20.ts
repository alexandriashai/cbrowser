/**
 * Study 1 on cbrowser 20.0.x: seven personas through the SHIPPED attention model,
 * five metrics, every page paired against center bias.
 *
 * What it scores: `analyzeAttention(image, persona, 16, undefined, elements)`,
 * the production path (Lab saliency + semantic map at GAZE_CALIBRATION's blend,
 * persona filter + Schwartz values as the product resolves them by default,
 * foveal smoothing, spatial prior). Elements come from the model-free OCR
 * extractor (ocr-extract.ts), the same as the 2026-08-04 semantic run. Nothing
 * here reimplements the model; that is how the April numbers went wrong.
 *
 * Ground truth (UEyes web category, 495 stimuli, 554 Gazepoint logs):
 *   AUC-Judd, NSS  discrete fixation points (toGrid below, as run-semantic.ts)
 *   CC, KLD, SIM   a continuous density: fixationsToGrid (src/visual/fixation-corpus.ts),
 *                  Gaussian blobs at sigma 1 cell (about one degree, per its doc)
 *   CC_counts      CC against the raw per-cell fixation counts, the convention of
 *                  the 2026-08-04 runs, kept so the numbers can be compared
 *
 * KLD and SIM follow Bylinskii et al. 2019 ("What do different evaluation metrics
 * tell us about saliency models?"): both maps scaled to unit mass; KLD(gt || pred)
 * with eps 2.2204e-16, lower is better; SIM is the sum of per-cell minimums,
 * 1 for identical maps, 0 for disjoint ones. They are research-side here because
 * src/visual/saliency-metrics.ts has no KLD or SIM; analytic self-checks run first
 * and abort the run if either is off.
 *
 * Caveat that governs every persona row: UEyes is 62 people free-viewing, with no
 * group labels. A persona's score is its distance from that pooled average, not
 * its accuracy for the population it models.
 *
 * Usage:
 *   bun research/study1/run-study1-v20.ts [--limit N] [--out DIR] [--no-values]
 *
 * --no-values runs every persona arm with traits but without Schwartz values: it
 * passes all ten values at attention.value.neutral, the point where every value
 * modulation is zero (provenance/attention.ts), so the product's own default
 * lookup never fires. Research-only; src/ is not touched.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { readdirSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { analyzeAttention, computeLabSaliency, GAZE_CALIBRATION } from "../../src/visual/attention-transport.js";
import { getPerceptualProfile } from "../../src/visual/perceptual-transport.js";
import { computeAUCJudd, computeNSS, computeCC, type SaliencyGrid, type Fixation } from "../../src/visual/saliency-metrics.js";
import { loadUEyesCorpus, parseGazepointLog, fixationsToGrid, toGridFixations, type RawFixation } from "../../src/visual/fixation-corpus.js";
import { extractElements } from "./ocr-extract.js";
import { param } from "../../src/visual/model-provenance.js";

const ROOT = join(import.meta.dir, "UEyes_dataset");
const CELL = 16;
const EPS = 2.2204e-16;

/** Paper label -> roster persona. "neurotypical" has no product persona; first-timer is the reference the 2026-08 runs used. */
const PERSONAS: Array<[label: string, persona: string]> = [
  ["neurotypical (first-timer)", "first-timer"],
  ["ADHD", "cognitive-adhd"],
  ["elderly", "elderly-user"],
  ["dyslexic", "dyslexic-user"],
  ["low-vision", "low-vision-magnified"],
  ["color-blind", "color-blind-deuteranopia"],
  ["power-user", "power-user"],
];

function centerBias(rows: number, cols: number): SaliencyGrid {
  const v = new Float64Array(rows * cols);
  const cy = (rows - 1) / 2, cx = (cols - 1) / 2, sy = rows / 4, sx = cols / 4;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const dy = (r - cy) / sy, dx = (c - cx) / sx;
      v[r * cols + c] = Math.exp(-0.5 * (dy * dy + dx * dx));
    }
  return { values: v, width: cols, height: rows };
}

function uniform(rows: number, cols: number): SaliencyGrid {
  return { values: new Float64Array(rows * cols).fill(1), width: cols, height: rows };
}

function toGrid(fx: RawFixation[], rows: number, cols: number): Fixation[] {
  const out: Fixation[] = [];
  for (const f of fx) {
    const c = Math.floor(f.xNorm * cols), r = Math.floor(f.yNorm * rows);
    if (r >= 0 && r < rows && c >= 0 && c < cols) out.push({ x: c, y: r });
  }
  return out;
}

function unitMass(v: Float64Array): Float64Array | null {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += Math.max(0, v[i]);
  if (!(s > 0)) return null;
  const o = new Float64Array(v.length);
  for (let i = 0; i < v.length; i++) o[i] = Math.max(0, v[i]) / s;
  return o;
}

/** KLD(gt || pred), Bylinskii et al. 2019. Lower is better; 0 when identical. */
export function kld(pred: Float64Array, gt: Float64Array): number {
  const p = unitMass(pred), q = unitMass(gt);
  if (!p || !q) return NaN;
  let k = 0;
  for (let i = 0; i < q.length; i++) k += q[i] * Math.log(EPS + q[i] / (p[i] + EPS));
  return k;
}

/** SIM (histogram intersection), Bylinskii et al. 2019. 1 when identical, 0 when disjoint. */
export function sim(pred: Float64Array, gt: Float64Array): number {
  const p = unitMass(pred), q = unitMass(gt);
  if (!p || !q) return NaN;
  let s = 0;
  for (let i = 0; i < q.length; i++) s += Math.min(p[i], q[i]);
  return s;
}

function selfCheck(): void {
  const a = new Float64Array([0, 1, 2, 3, 0, 0]);
  const b = new Float64Array([4, 0, 0, 0, 0, 5]);
  const near = (x: number, y: number) => Math.abs(x - y) < 1e-9;
  const fails: string[] = [];
  if (!near(kld(a, a), 0)) fails.push(`KLD(a,a)=${kld(a, a)} want 0`);
  if (!near(sim(a, a), 1)) fails.push(`SIM(a,a)=${sim(a, a)} want 1`);
  if (!near(sim(a, b), 0)) fails.push(`SIM(disjoint)=${sim(a, b)} want 0`);
  if (!(kld(b, a) > 10)) fails.push(`KLD(disjoint)=${kld(b, a)} want large`);
  // Scale invariance: both metrics compare distributions, not gains.
  const a3 = a.map((x) => x * 3);
  if (!near(sim(a3, a), 1) || !near(kld(a3, a), 0)) fails.push("not scale invariant");
  const u = new Float64Array(6).fill(1);
  // a is [0,1,2,3,0,0]/6; uniform is 1/6 each; the minimums are [0,1,1,1,0,0]/6.
  if (!near(sim(u, a), 0.5)) fails.push(`SIM(uniform,a)=${sim(u, a)} want 0.5`);
  if (fails.length) throw new Error(`metric self-check failed: ${fails.join("; ")}`);
}

const METRICS = ["auc", "nss", "cc", "cc_counts", "kld", "sim"] as const;
type Metric = (typeof METRICS)[number];
const higherIsBetter: Record<Metric, boolean> = { auc: true, nss: true, cc: true, cc_counts: true, kld: false, sim: true };

function score(cells: Float64Array, pts: Fixation[], density: Float64Array, counts: Float64Array, rows: number, cols: number): Record<Metric, number> {
  const g: SaliencyGrid = { values: cells, width: cols, height: rows };
  return {
    auc: computeAUCJudd(g, pts).auc,
    nss: computeNSS(g, pts).nss,
    cc: computeCC(g, { values: density, width: cols, height: rows }),
    cc_counts: computeCC(g, { values: counts, width: cols, height: rows }),
    kld: kld(cells, density),
    sim: sim(cells, density),
  };
}

const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const sd = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};

async function main() {
  const args = process.argv.slice(2);
  const arg = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
  const limit = arg("--limit") ? Number(arg("--limit")) : Infinity;
  const outDir = arg("--out") ?? join(import.meta.dir, "results/2026-10-21_v20-personas");
  const noValues = args.includes("--no-values");
  const neutral = param("attention.value.neutral");
  const neutralValues: Record<string, number> | undefined = noValues
    ? Object.fromEntries(["selfDirection", "stimulation", "hedonism", "achievement", "power",
        "security", "conformity", "tradition", "benevolence", "universalism"].map((k) => [k, neutral]))
    : undefined;

  selfCheck();

  // Refuse a persona name that does not resolve to its own built-in profile:
  // analyzeAttention accepts any string and falls back silently.
  for (const [, p] of PERSONAS) {
    const prof = getPerceptualProfile(p);
    if (prof.persona !== p) throw new Error(`persona "${p}" resolved to profile "${prof.persona}"`);
  }
  const resolution: Record<string, { values: boolean; traits: boolean }> = {};
  {
    const { resolveValuesForPersona } = await import("../../src/values/index.js");
    const { getAnyPersona } = await import("../../src/personas.js");
    for (const [, p] of PERSONAS) {
      let values = false, traits = false;
      try { values = !!resolveValuesForPersona(p); } catch {}
      try { traits = !!getAnyPersona(p); } catch {}
      resolution[p] = { values, traits };
    }
  }

  const repo = join(import.meta.dir, "..", "..");
  const commit = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const srcDirty = execFileSync("git", ["-C", repo, "status", "--porcelain", "--", "src"], { encoding: "utf8" }).trim();

  const corpus = loadUEyesCorpus(ROOT);
  if (!corpus) throw new Error(`UEyes corpus not loadable at ${ROOT}`);
  const webNames = new Set<string>();
  for (const line of readFileSync(join(ROOT, "image_types.csv"), "utf8").split("\n").slice(1)) {
    const [name, cat] = line.split(";");
    if (cat?.trim() === "web") webNames.add(name.trim().replace(/\.[^.]+$/, "").toLowerCase());
  }
  const byImage = new Map<string, RawFixation[]>();
  let logs = 0;
  for (const f of readdirSync(join(ROOT, "eyetracker_logs"))) {
    if (!f.endsWith(".csv") || f.startsWith("._")) continue;
    logs++;
    for (const fx of parseGazepointLog(join(ROOT, "eyetracker_logs", f))) {
      const k = String(fx.stimulusId ?? "").toLowerCase();
      if (!k) continue;
      if (!byImage.has(k)) byImage.set(k, []);
      byImage.get(k)!.push(fx);
    }
  }
  console.log(`commit ${commit}${srcDirty ? " (src DIRTY)" : ""}; web stimuli ${webNames.size}; logs ${logs}`);

  type Row = { image: string; arm: string } & Record<Metric, number>;
  const rows: Row[] = [];
  const models = new Set<string>();
  let n = 0, skippedNoFix = 0, skippedGrid = 0, skippedErr = 0;
  const t0 = performance.now();

  for (const st of corpus.stimuli) {
    if (n >= limit) break;
    const key = basename(st.imagePath).replace(/\.[^.]+$/, "").toLowerCase();
    if (!webNames.has(key)) continue;
    const fx = byImage.get(key);
    if (!fx?.length) { skippedNoFix++; continue; }
    try {
      const sal = await computeLabSaliency(st.imagePath, CELL);
      const R = sal.rows, C = sal.cols;
      const pts = toGrid(fx, R, C);
      if (!pts.length) { skippedNoFix++; continue; }
      const counts = new Float64Array(R * C);
      for (const p of pts) counts[p.y * C + p.x] += 1;
      const density = fixationsToGrid(toGridFixations(fx, C, R), C, R, 1.0).values;
      const ex = await extractElements(st.imagePath);

      const maps: Array<[string, Float64Array]> = [];
      let bad = false;
      for (const [label, p] of PERSONAS) {
        const a = await analyzeAttention(st.imagePath, p, CELL, neutralValues, ex.elements);
        if (a.saliencyMap.rows !== R || a.saliencyMap.cols !== C) { bad = true; break; }
        models.add(a.saliencyMap.attentionModel);
        maps.push([label, a.saliencyMap.cells]);
      }
      if (bad) { skippedGrid++; continue; }
      maps.push(["CenterBias", centerBias(R, C).values], ["Uniform", uniform(R, C).values]);
      for (const [arm, cells] of maps) rows.push({ image: key, arm, ...score(cells, pts, density, counts, R, C) });

      n++;
      if (n % 25 === 0) console.log(`  ${n} scored (${((performance.now() - t0) / 1000).toFixed(0)}s)`);
    } catch (e) {
      skippedErr++;
      console.warn(`  skip ${key}: ${(e as Error).message.slice(0, 120)}`);
    }
  }

  const arms = [...PERSONAS.map(([l]) => l), "CenterBias", "Uniform"];
  const byArm = new Map<string, Row[]>();
  for (const r of rows) (byArm.get(r.arm) ?? byArm.set(r.arm, []).get(r.arm)!).push(r);
  const cbByImage = new Map(rows.filter((r) => r.arm === "CenterBias").map((r) => [r.image, r]));

  const summary = arms.map((arm) => {
    const rs = byArm.get(arm) ?? [];
    const out: Record<string, unknown> = { arm, n: rs.length };
    for (const m of METRICS) {
      const v = rs.map((r) => r[m]).filter((x) => Number.isFinite(x));
      out[m] = { mean: +mean(v).toFixed(4), sd: +sd(v).toFixed(4) };
    }
    if (arm !== "CenterBias") {
      const wins: Record<string, unknown> = {};
      for (const m of METRICS) {
        let w = 0, p = 0, d = 0;
        for (const r of rs) {
          const c = cbByImage.get(r.image);
          if (!c || !Number.isFinite(r[m]) || !Number.isFinite(c[m])) continue;
          p++; d += r[m] - c[m];
          if (higherIsBetter[m] ? r[m] > c[m] : r[m] < c[m]) w++;
        }
        wins[m] = { wins: w, pages: p, rate: +(p ? w / p : 0).toFixed(4), mean_delta: +(p ? d / p : 0).toFixed(4) };
      }
      out.vs_center_bias = wins;
    }
    return out;
  });

  const personaAuc = PERSONAS.map(([l]) => (summary.find((s) => s.arm === l)!.auc as { mean: number }).mean);
  mkdirSync(outDir, { recursive: true });
  const meta = {
    ran: new Date().toISOString(),
    commit, src_dirty: !!srcDirty,
    package_version: JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).version,
    scope: "UEyes web category", images: n, participant_logs: logs,
    skipped: { no_fixations: skippedNoFix, grid_mismatch: skippedGrid, error: skippedErr },
    model: "analyzeAttention (shipped path)", attention_models_seen: [...models],
    values_mode: noValues ? `off: all ten Schwartz values passed at attention.value.neutral (${neutral})` : "on: the product's default per-persona lookup",
    gaze_calibration: GAZE_CALIBRATION, cell_size: CELL,
    elements_from: "research/study1/ocr-extract.ts (tesseract 5.3.4 + sharp; no model)",
    personas: Object.fromEntries(PERSONAS.map(([l, p]) => [l, { persona: p, ...resolution[p] }])),
    ground_truth: {
      auc_nss: "discrete fixation points per 16px-cell grid (all 554 logs pooled)",
      cc_kld_sim: "fixationsToGrid density, sigma 1 cell",
      cc_counts: "raw per-cell fixation counts (2026-08-04 convention)",
    },
    metric_refs: "KLD and SIM per Bylinskii et al. 2019; eps 2.2204e-16; KLD lower is better",
    persona_auc_spread: +(Math.max(...personaAuc) - Math.min(...personaAuc)).toFixed(4),
    wall_seconds: +((performance.now() - t0) / 1000).toFixed(1),
    caveat: "UEyes ground truth pools 62 free-viewing participants with no group labels. Persona scores measure distance from that average viewer, not accuracy for the modelled population.",
  };
  writeFileSync(join(outDir, "summary.json"), JSON.stringify({ ...meta, summary }, null, 2));
  writeFileSync(join(outDir, "per_image.csv"),
    `image,arm,${METRICS.join(",")}\n` + rows.map((r) => [r.image, `"${r.arm}"`, ...METRICS.map((m) => r[m].toFixed(6))].join(",")).join("\n"));

  console.log(`\n${"arm".padEnd(28)}${METRICS.map((m) => m.toUpperCase().padStart(16)).join("")}`);
  for (const s of summary) {
    const cells = METRICS.map((m) => { const v = s[m] as { mean: number; sd: number }; return `${v.mean.toFixed(4)}±${v.sd.toFixed(3)}`.padStart(16); });
    console.log(`${String(s.arm).padEnd(28)}${cells.join("")}`);
  }
  console.log("\nper-page wins vs CenterBias (AUC / NSS / CC / KLD / SIM):");
  for (const s of summary) {
    if (!s.vs_center_bias) continue;
    const w = s.vs_center_bias as Record<string, { wins: number; pages: number; rate: number }>;
    console.log(`  ${String(s.arm).padEnd(28)}${["auc", "nss", "cc", "kld", "sim"].map((m) => `${w[m].wins}/${w[m].pages} (${(w[m].rate * 100).toFixed(1)}%)`.padStart(18)).join("")}`);
  }
  console.log(`\npersona AUC spread ${meta.persona_auc_spread}; models seen ${[...models].join(",")}; commit ${commit}; ${n} images; ${meta.wall_seconds}s; wrote ${outDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
