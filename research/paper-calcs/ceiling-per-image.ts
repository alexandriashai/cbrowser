/**
 * The inter-observer ceiling, per image, so it can carry a confidence interval.
 *
 * research/study1/run-ceiling.ts writes only page means. This script recomputes
 * its number per image and adds the variants a CI and a fair comparison need.
 *
 * A FINDING THAT CHANGES WHAT THE OLD NUMBER MEANS. run-ceiling.ts takes the
 * participant id from the log filename with /hk0*(\d+)/i, but UEyes names its
 * logs `NN_khMMM_fixations.csv` ("kh", not "hk"). The regex never matches, so
 * every one of the 554 log files was its own "participant" and the split was
 * 277/277 log files, not 31/31 people. Each of the 62 people wrote about nine
 * logs (one per block). This script counts how often one person's fixations on
 * one image sit in more than one log; if that is zero, the legacy split was
 * still person-disjoint per image (a different random-ish split of people on
 * every image) and its number stands, only its description was wrong.
 *
 * Arms written (one row per image per arm, the per_image.csv layout of
 * run-study1-v20.ts, so research/paper-calcs/study1_intervals.py reads it):
 *
 *   legacy32_logsplit   run-ceiling.ts exactly: 24x32 grid, half-A density at
 *                       sigma 1.5 cells, split by log file. Reproduces 0.8112.
 *   legacy32_personsplit  the same grid and kernel, split by person (31/31).
 *   CenterBias32_halfB  run-ceiling.ts's control: CenterBias on half B's points.
 *   model_s1            the model's own grid (16px cells after
 *                       attention.lab.downscale, the R x C every Study 1 arm is
 *                       scored on), person split; half-A density at sigma 1 cell
 *                       (the Study 1 ground-truth convention) scored against
 *                       half B with every Study 1 metric: AUC/NSS on half B's
 *                       discrete cells, CC/KLD/SIM on half B's sigma-1 density,
 *                       cc_counts on half B's raw counts.
 *   model_s32eq         as model_s1 with the half-A kernel at run-ceiling.ts's
 *                       physical width (1.5 x C/32 cells).
 *   CenterBias_halfB    CenterBias on the model grid against half B.
 *
 * Split-to-split variability: --splits K random 31/31 person partitions
 * (mulberry32, seeded), each giving a page-mean ceiling; written to
 * ceiling-splits.csv.
 *
 * Usage (as wyld-web, from the worktree root, corpus symlinked at
 * research/study1/UEyes_dataset):
 *   bun research/paper-calcs/ceiling-per-image.ts [--splits 100] [--limit N]
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { readdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { computeAUCJudd, computeNSS, computeCC, type SaliencyGrid, type Fixation } from "../../src/visual/saliency-metrics.js";
import { parseGazepointLog, fixationsToGrid, toGridFixations, type RawFixation } from "../../src/visual/fixation-corpus.js";
import { param } from "../../src/visual/model-provenance.js";

const ROOT = join(import.meta.dir, "..", "study1", "UEyes_dataset");
const OUT = import.meta.dir;
const CELL = 16;
const L_ROWS = 24, L_COLS = 32, L_SIGMA = 1.5;
const EPS = 2.2204e-16;

// kld and sim are run-study1-v20.ts's, copied: importing that file runs its study.
function unitMass(v: Float64Array): Float64Array | null {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += Math.max(0, v[i]);
  if (!(s > 0)) return null;
  const o = new Float64Array(v.length);
  for (let i = 0; i < v.length; i++) o[i] = Math.max(0, v[i]) / s;
  return o;
}
function kld(pred: Float64Array, gt: Float64Array): number {
  const p = unitMass(pred), q = unitMass(gt);
  if (!p || !q) return NaN;
  let k = 0;
  for (let i = 0; i < q.length; i++) k += q[i] * Math.log(EPS + q[i] / (p[i] + EPS));
  return k;
}
function sim(pred: Float64Array, gt: Float64Array): number {
  const p = unitMass(pred), q = unitMass(gt);
  if (!p || !q) return NaN;
  let s = 0;
  for (let i = 0; i < q.length; i++) s += Math.min(p[i], q[i]);
  return s;
}

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

function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function discrete(fx: RawFixation[], rows: number, cols: number): Fixation[] {
  const out: Fixation[] = [];
  for (const f of fx) {
    const c = Math.floor(f.xNorm * cols), r = Math.floor(f.yNorm * rows);
    if (r >= 0 && r < rows && c >= 0 && c < cols) out.push({ x: c, y: r });
  }
  return out;
}

/** run-ceiling.ts's densityMap, verbatim in effect: kernel centred on the cell index. */
function legacyDensity(pts: Fixation[], rows: number, cols: number, sigma: number): Float64Array {
  const m = new Float64Array(rows * cols);
  const rad = Math.ceil(sigma * 3), inv = 1 / (2 * sigma * sigma);
  for (const p of pts)
    for (let dr = -rad; dr <= rad; dr++) {
      const r = p.y + dr;
      if (r < 0 || r >= rows) continue;
      for (let dc = -rad; dc <= rad; dc++) {
        const c = p.x + dc;
        if (c < 0 || c >= cols) continue;
        m[r * cols + c] += Math.exp(-(dr * dr + dc * dc) * inv);
      }
    }
  return m;
}

function centerBias(rows: number, cols: number): Float64Array {
  const v = new Float64Array(rows * cols);
  const cy = (rows - 1) / 2, cx = (cols - 1) / 2, sy = rows / 4, sx = cols / 4;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const dy = (r - cy) / sy, dx = (c - cx) / sx;
      v[r * cols + c] = Math.exp(-0.5 * (dy * dy + dx * dx));
    }
  return v;
}

const g = (v: Float64Array, rows: number, cols: number): SaliencyGrid => ({ values: v, width: cols, height: rows });

type Scores = { auc: number; nss: number; cc: number; cc_counts: number; kld: number; sim: number };

/** Every Study 1 metric for a predictor map against one half's fixations on the model grid. */
function scoreModelGrid(pred: Float64Array, B: RawFixation[], rows: number, cols: number): Scores {
  const ptsB = discrete(B, rows, cols);
  const counts = new Float64Array(rows * cols);
  for (const p of ptsB) counts[p.y * cols + p.x] += 1;
  const dens = fixationsToGrid(toGridFixations(B, cols, rows), cols, rows, 1.0).values;
  return {
    auc: computeAUCJudd(g(pred, rows, cols), ptsB).auc,
    nss: computeNSS(g(pred, rows, cols), ptsB).nss,
    cc: computeCC(g(pred, rows, cols), g(dens, rows, cols)),
    cc_counts: computeCC(g(pred, rows, cols), g(counts, rows, cols)),
    kld: kld(pred, dens),
    sim: sim(pred, dens),
  };
}

function scoreLegacy(A: RawFixation[], B: RawFixation[]): { auc: number; nss: number } | null {
  const ptsA = discrete(A, L_ROWS, L_COLS), ptsB = discrete(B, L_ROWS, L_COLS);
  if (ptsA.length < 10 || ptsB.length < 10) return null; // run-ceiling.ts's thin-side rule
  const mapA = legacyDensity(ptsA, L_ROWS, L_COLS, L_SIGMA);
  return { auc: computeAUCJudd(g(mapA, L_ROWS, L_COLS), ptsB).auc, nss: computeNSS(g(mapA, L_ROWS, L_COLS), ptsB).nss };
}

const personOf = (logId: string) => {
  const m = logId.match(/kh0*(\d+)/i);
  if (!m) throw new Error(`no participant id in log "${logId}"`);
  return `kh${m[1].padStart(3, "0")}`;
};

async function main() {
  const args = process.argv.slice(2);
  const splits = args.includes("--splits") ? Number(args[args.indexOf("--splits") + 1]) : 100;
  const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
  const downscale = param("attention.lab.downscale");

  const webNames = new Map<string, string>(); // key -> image file name
  for (const line of readFileSync(join(ROOT, "image_types.csv"), "utf8").split("\n").slice(1)) {
    const [name, cat] = line.split(";");
    if (cat?.trim() === "web") webNames.set(name.trim().replace(/\.[^.]+$/, "").toLowerCase(), name.trim());
  }

  // image -> log id -> fixations
  const byImage = new Map<string, Map<string, RawFixation[]>>();
  const logs: string[] = [];
  for (const f of readdirSync(join(ROOT, "eyetracker_logs"))) {
    if (!f.endsWith(".csv") || f.startsWith("._")) continue;
    const logId = f.replace(/_fixations\.csv$/i, "");
    logs.push(logId);
    for (const fx of parseGazepointLog(join(ROOT, "eyetracker_logs", f))) {
      const k = String(fx.stimulusId ?? "").toLowerCase();
      if (!k || !webNames.has(k)) continue;
      if (!byImage.has(k)) byImage.set(k, new Map());
      const m = byImage.get(k)!;
      if (!m.has(logId)) m.set(logId, []);
      m.get(logId)!.push(fx);
    }
  }
  const logIds = [...new Set(logs)].sort(); // run-ceiling.ts sorts the (unmatched) ids, i.e. the log names
  const legacyA = new Set(logIds.filter((_, i) => i % 2 === 0));
  const persons = [...new Set(logIds.map(personOf))].sort();
  const personA = new Set(persons.filter((_, i) => i % 2 === 0));

  // Does one person ever look at one image in two logs?
  let multiLogPersonImage = 0, personImagePairs = 0;
  for (const perLog of byImage.values()) {
    const seen = new Map<string, number>();
    for (const logId of perLog.keys()) seen.set(personOf(logId), (seen.get(personOf(logId)) ?? 0) + 1);
    for (const n of seen.values()) { personImagePairs++; if (n > 1) multiLogPersonImage++; }
  }
  console.log(`logs ${logIds.length}, persons ${persons.length} (half A ${personA.size}), web images with fixations ${byImage.size}`);
  console.log(`person x image pairs ${personImagePairs}; in more than one log: ${multiLogPersonImage}`);

  const keys = [...byImage.keys()].sort().slice(0, limit === Infinity ? undefined : limit);
  const rows: string[] = [];
  const METRICS = ["auc", "nss", "cc", "cc_counts", "kld", "sim"] as const;
  const emit = (image: string, arm: string, s: Partial<Scores>) =>
    rows.push([image, `"${arm}"`, ...METRICS.map((m) => (s[m] === undefined || !Number.isFinite(s[m]!) ? "nan" : s[m]!.toFixed(6)))].join(","));

  // Per-image prep: grid size and per-person fixations.
  type Prep = { key: string; R: number; C: number; perPerson: Map<string, RawFixation[]>; perLog: Map<string, RawFixation[]> };
  const preps: Prep[] = [];
  for (const key of keys) {
    const perLog = byImage.get(key)!;
    const meta = await sharp(join(ROOT, "images", webNames.get(key)!)).metadata();
    const R = Math.ceil(Math.round((meta.height ?? 0) * downscale) / CELL);
    const C = Math.ceil(Math.round((meta.width ?? 0) * downscale) / CELL);
    const perPerson = new Map<string, RawFixation[]>();
    for (const [logId, fx] of perLog) {
      const p = personOf(logId);
      if (!perPerson.has(p)) perPerson.set(p, []);
      perPerson.get(p)!.push(...fx);
    }
    preps.push({ key, R, C, perPerson, perLog });
  }

  let skippedThin = 0;
  const halves = (pr: Prep, inA: (p: string) => boolean) => {
    const A: RawFixation[] = [], B: RawFixation[] = [];
    for (const [p, fx] of pr.perPerson) (inA(p) ? A : B).push(...fx);
    return { A, B };
  };

  for (const pr of preps) {
    // Legacy: split by log file, exactly as run-ceiling.ts.
    const LA: RawFixation[] = [], LB: RawFixation[] = [];
    for (const [logId, fx] of pr.perLog) (legacyA.has(logId) ? LA : LB).push(...fx);
    const leg = scoreLegacy(LA, LB);
    if (!leg) { skippedThin++; continue; }
    emit(pr.key, "legacy32_logsplit", leg);

    const { A, B } = halves(pr, (p) => personA.has(p));
    const lp = scoreLegacy(A, B);
    if (lp) emit(pr.key, "legacy32_personsplit", lp);
    const ptsB32 = discrete(B, L_ROWS, L_COLS);
    const cb32 = centerBias(L_ROWS, L_COLS);
    emit(pr.key, "CenterBias32_halfB", { auc: computeAUCJudd(g(cb32, L_ROWS, L_COLS), ptsB32).auc, nss: computeNSS(g(cb32, L_ROWS, L_COLS), ptsB32).nss });

    const { R, C } = pr;
    const s1 = fixationsToGrid(toGridFixations(A, C, R), C, R, 1.0).values;
    emit(pr.key, "model_s1", scoreModelGrid(s1, B, R, C));
    const sEq = fixationsToGrid(toGridFixations(A, C, R), C, R, (L_SIGMA * C) / L_COLS).values;
    emit(pr.key, "model_s32eq", scoreModelGrid(sEq, B, R, C));
    emit(pr.key, "CenterBias_halfB", scoreModelGrid(centerBias(R, C), B, R, C));
  }

  writeFileSync(join(OUT, "ceiling-per-image.csv"), `image,arm,${METRICS.join(",")}\n${rows.join("\n")}\n`);

  // Split-to-split variability over random person partitions.
  const rnd = mulberry32(0x0c311);
  const splitRows: string[] = [];
  const t0 = performance.now();
  for (let s = 0; s < splits; s++) {
    const order = shuffle(persons, rnd);
    const A = new Set(order.slice(0, Math.floor(persons.length / 2)));
    const acc: Record<string, number[]> = { l_auc: [], l_nss: [], m_auc: [], m_nss: [], m_cc: [], m_kld: [], m_sim: [] };
    for (const pr of preps) {
      const { A: fa, B: fb } = halves(pr, (p) => A.has(p));
      const l = scoreLegacy(fa, fb);
      if (!l) continue;
      acc.l_auc.push(l.auc); acc.l_nss.push(l.nss);
      const m = scoreModelGrid(fixationsToGrid(toGridFixations(fa, pr.C, pr.R), pr.C, pr.R, 1.0).values, fb, pr.R, pr.C);
      acc.m_auc.push(m.auc); acc.m_nss.push(m.nss); acc.m_cc.push(m.cc); acc.m_kld.push(m.kld); acc.m_sim.push(m.sim);
    }
    const avg = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length;
    splitRows.push([s, acc.l_auc.length, ...Object.values(acc).map((v) => avg(v).toFixed(6))].join(","));
    if ((s + 1) % 10 === 0) console.log(`  split ${s + 1}/${splits} (${((performance.now() - t0) / 1000).toFixed(0)}s)`);
  }
  writeFileSync(join(OUT, "ceiling-splits.csv"), `split,images,legacy32_auc,legacy32_nss,model_s1_auc,model_s1_nss,model_s1_cc,model_s1_kld,model_s1_sim\n${splitRows.join("\n")}\n`);

  writeFileSync(join(OUT, "ceiling-meta.json"), JSON.stringify({
    ran: new Date().toISOString(), images: preps.length - skippedThin, skipped_thin: skippedThin,
    logs: logIds.length, persons: persons.length, person_half_a: personA.size,
    person_image_pairs: personImagePairs, person_image_pairs_in_more_than_one_log: multiLogPersonImage,
    legacy_grid: `${L_ROWS}x${L_COLS}`, legacy_sigma_cells: L_SIGMA,
    model_grid: `ceil(height*${downscale}/${CELL}) x ceil(width*${downscale}/${CELL})`,
    random_splits: splits, split_seed: "mulberry32(0x0c311)",
  }, null, 2));
  console.log(`wrote ceiling-per-image.csv (${rows.length} rows), ceiling-splits.csv (${splits}), ceiling-meta.json; ${skippedThin} images skipped thin`);
}

main().catch((e) => { console.error(e); process.exit(1); });
