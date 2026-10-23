/**
 * The DRO interaction scan (tests/fixtures/dro-adversary.ts, INTERACTION_PAGES)
 * run again on the Stage B chain, for research/stage-b-deltas.md section 5.
 *
 * Page families:
 *   old-grid    the original scan's 508 pages: every non-empty subset of the
 *               pre-Stage-B generator's seven inputs at max, mid, 0.1x or
 *               0.03x, its counts turned into law times by fromCounts;
 *   old-sparse  its 2000 random sparse pages, built the same way;
 *   law-grid    every non-empty subset of today's nine inputs (the four law
 *               times up to the design's maxima) at the same four levels: 2044;
 *   law-sparse  2000 sparsePage draws over the nine inputs;
 *   real        the 513 reference pages' own demand vectors, both scopes.
 * For each page and option set: the steepest rawCTC slope along every capacity
 * coordinate (steepestAlong, from a seed fixed by the page's index, so a
 * shard's results do not depend on the sharding), against the per-coordinate
 * bound of the shipped file and of every mutant whose edit changes a slope
 * bound (tests/fixtures/dro-mutants.ts).
 *
 *   SHARD=0 SHARDS=8 bun research/stage-b-dro-scan.ts > scan-0.jsonl   one line per page
 *   bun research/stage-b-dro-scan.ts --report scan-*.jsonl
 *   bun research/stage-b-dro-scan.ts --margins                         INTERACTION_PAGES on seeds 1-14
 *   BEFORE=<worktree> bun research/stage-b-dro-scan.ts --demands       old-grid demand vectors: BEFORE's chain on the counts vs this one on fromCounts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeDemandDistribution, computeDemandFromRawMetrics, type DemandDistribution } from "../src/visual/cognitive-transport-chain.js";
import { deriveMetrics } from "../src/visual/cognitive-transport.js";
import { referenceRaw } from "../src/visual/ctc-reference.js";
import { rawCTCOfCapacity } from "../src/visual/dro-bound.js";
import {
  activeDims, DIMS, fromCounts, INPUT_MAX, INPUTS, INTERACTION_COUNTS, INTERACTION_PAGES, OPTION_SETS, sparsePage, steepestAlong, uniformStream,
  type Args, type BoundModule, type Vec,
} from "../tests/fixtures/dro-adversary.js";
import { loadBoundModules, MUTANTS } from "../tests/fixtures/dro-mutants.js";

/** The mutants whose edit changes ctcLipschitzBound's per-coordinate bound (M12, M13 and P1-P6 change the population bound or the preconditions). */
const SLOPE_MUTANTS = MUTANTS.filter((m) => /^M/.test(m.id) && m.id !== "M12" && m.id !== "M13").map((m) => m.id);
const BOUNDS = ["control", ...SLOPE_MUTANTS];
const LEVELS = [1, 0.5, 0.1, 0.03];
/** The absolute tolerance tests/fixtures/dro-adversary.ts checkCoordinates allows a slope over its bound. */
const TOL = 1e-9;

/** The pre-Stage-B generator: informationDensity, visualComplexity, interactiveElementCount, textDensity, animationLevel, choiceCount, navigationDepth. */
const OLD_MAX = [1, 1, 1000, 1, 1, 500, 30];
const OLD_INTEGER = new Set([2, 5, 6]);
type OldArgs = [number, number, number, number, number, number, number];

function subsets(n: number): number[][] {
  const out: number[][] = [];
  for (let mask = 1; mask < 1 << n; mask++) out.push([...Array(n).keys()].filter((i) => mask & (1 << i)));
  return out;
}

function oldGrid(): Array<{ id: string; counts: OldArgs }> {
  const out: Array<{ id: string; counts: OldArgs }> = [];
  for (const level of LEVELS)
    for (const s of subsets(OLD_MAX.length)) {
      const counts = OLD_MAX.map((v, i) => (s.includes(i) ? (OLD_INTEGER.has(i) ? Math.round(level * v) : level * v) : 0)) as OldArgs;
      out.push({ id: `old-grid/${level}/${s.join("+")}`, counts });
    }
  return out;
}

/** The original scan's random family: each input absent half the time, else at a level skewed low. */
function oldSparse(u: () => number): OldArgs {
  return OLD_MAX.map((v, i) => {
    if (u() < 0.5) return 0;
    const r = u() ** 2;
    return OLD_INTEGER.has(i) ? Math.round(v * r * r) : v * r;
  }) as OldArgs;
}

const NAV = INPUTS.indexOf("navigationDepth");
const page = (args: Args) => computeDemandFromRawMetrics(...args);

interface ScanPage { family: string; id: string; demand: DemandDistribution }

function scanPages(): ScanPage[] {
  const pages: ScanPage[] = [];
  for (const { id, counts } of oldGrid()) pages.push({ family: "old-grid", id, demand: page(fromCounts(...counts)) });
  const uo = uniformStream(7);
  for (let i = 0; i < 2000; i++) pages.push({ family: "old-sparse", id: `old-sparse/${i}`, demand: page(fromCounts(...oldSparse(uo))) });
  for (const level of LEVELS)
    for (const s of subsets(INPUT_MAX.length)) {
      const args = INPUT_MAX.map((v, i) => (s.includes(i) ? (i === NAV ? Math.round(level * v) : level * v) : 0)) as Args;
      pages.push({ family: "law-grid", id: `law-grid/${level}/${s.map((i) => INPUTS[i]).join("+")}`, demand: page(args) });
    }
  const ul = uniformStream(11);
  for (let i = 0; i < 2000; i++) pages.push({ family: "law-sparse", id: `law-sparse/${i}`, demand: sparsePage(ul) });
  for (const scope of ["viewport", "full_page"] as const)
    referenceRaw(scope).forEach((r, i) => pages.push({ family: "real", id: `real/${scope}/${i}`, demand: computeDemandDistribution(deriveMetrics(r)) }));
  return pages;
}

interface PageResult { family: string; id: string; ratio: Record<string, number>; where: Record<string, string>; at: Record<string, [number, number, number]>; exceeded: Record<string, number> }

/** Steepest slope per coordinate and option set on one page, as a ratio to each bound's per-coordinate constant. */
function scan(p: { family: string; id: string; demand: DemandDistribution }, seed: number, mods: Map<string, BoundModule>, ids = BOUNDS): PageResult {
  const u = uniformStream(seed);
  const res: PageResult = { family: p.family, id: p.id, ratio: {}, where: {}, at: {}, exceeded: {} };
  for (const b of ids) { res.ratio[b] = 0; res.exceeded[b] = 0; res.where[b] = ""; res.at[b] = [0, 0, 0]; }
  for (const { id: optsId, opts } of OPTION_SETS) {
    const f = (x: Vec) => rawCTCOfCapacity(x, p.demand, opts);
    const climb = activeDims(f, u);
    const bounds = ids.map((b) => [b, mods.get(b)!.ctcLipschitzBound(p.demand, opts)] as const);
    for (const dim of DIMS) {
      const st = steepestAlong(f, dim, u, climb);
      for (const [b, bound] of bounds) {
        const per = bound.perDimension[dim];
        if (!(st.slope <= per + TOL)) res.exceeded[b]++;
        // A slope within the tolerance is a flat coordinate's rounding (a few ulps of CTC over h), not a measurement.
        if (st.slope <= TOL) continue;
        const r = per > 0 ? st.slope / per : Number.MAX_VALUE;
        if (r > res.ratio[b]) { res.ratio[b] = r; res.where[b] = `${dim}/${optsId}`; res.at[b] = [st.slope, per, st.h]; }
      }
    }
  }
  return res;
}

async function withModules<T>(fn: (mods: Map<string, BoundModule>) => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "dro-scan-"));
  try { return await fn(await loadBoundModules(dir)); } finally { rmSync(dir, { recursive: true, force: true }); }
}

const arg = process.argv[2];
if (arg === "--report") {
  const rows: PageResult[] = process.argv.slice(3).flatMap((f) => readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as PageResult));
  const families = ["old-grid", "old-sparse", "law-grid", "law-sparse", "real"];
  const counts = families.map((fam) => rows.filter((r) => r.family === fam).length);
  console.log(`${rows.length} pages: ${families.map((f, i) => `${f} ${counts[i]}`).join(", ")}. Cell: largest observed/bound over the family's pages (slopes above the 1e-9 tolerance only); pages where some coordinate exceeds the bound by more than it.\n`);
  console.log(`| bound | must kill | ${families.join(" | ")} | all |`);
  console.log(`|---|---|${families.map(() => "---|").join("")}---|`);
  for (const b of BOUNDS) {
    const must = b === "control" ? "survive" : MUTANTS.find((m) => m.id === b)!.mustKill ? "yes" : "info";
    const cell = (rs: PageResult[]) => {
      if (rs.length === 0) return "-";
      const top = rs.reduce((a, r) => (r.ratio[b] > a.ratio[b] ? r : a), rs[0]);
      return `${top.ratio[b] >= Number.MAX_VALUE ? "inf" : top.ratio[b].toFixed(4)}; ${rs.filter((r) => r.exceeded[b] > 0).length}`;
    };
    console.log(`| ${b} | ${must} | ${families.map((fam) => cell(rows.filter((r) => r.family === fam))).join(" | ")} | ${cell(rows)} |`);
  }
  const top = (b: string) => rows.reduce((a, r) => (r.ratio[b] > a.ratio[b] ? r : a), rows[0]);
  console.log("");
  for (const b of ["control", "M2", "M2b", "M10", "M11", "M14"]) { const t = top(b); console.log(`- ${b}: largest ${t.ratio[b].toFixed(4)} on ${t.id} (${t.where[b]})`); }
} else if (arg === "--margins") {
  const seeds = Array.from({ length: Number(process.argv[3] ?? 14) }, (_, i) => i + 1);
  const ids = ["control", "M2", "M2b", "M10"];
  await withModules((mods) => {
    console.log(`INTERACTION_PAGES on seeds ${seeds[0]}-${seeds.at(-1)}: the smallest, over seeds, of the largest observed/bound; seeds on which the bound is exceeded.\n`);
    console.log(`| page | ${ids.join(" | ")} |`);
    console.log(`|---|${ids.map(() => "---|").join("")}`);
    for (const [id, args] of INTERACTION_PAGES) {
      const rs = seeds.map((s) => scan({ family: "interaction", id, demand: page(args) }, s, mods, ids));
      console.log(`| ${id} | ${ids.map((b) => `${Math.min(...rs.map((r) => r.ratio[b])).toFixed(4)} (max ${Math.max(...rs.map((r) => r.ratio[b])).toFixed(4)}); ${rs.filter((r) => r.exceeded[b] > 0).length}/${seeds.length}`).join(" | ")} |`);
    }
  });
} else if (arg === "--demands") {
  const before = await import(`${process.env.BEFORE}/src/visual/cognitive-transport-chain.ts`);
  const pages = [...oldGrid().map((p) => ({ ...p, interaction: false })), ...INTERACTION_COUNTS.map(([id, counts]) => ({ id, counts, interaction: true }))];
  const maxDiff: Record<string, number> = Object.fromEntries(DIMS.map((d) => [d, 0]));
  let moved = 0;
  const movedInteraction: string[] = [];
  for (const p of pages) {
    const a = before.computeDemandFromRawMetrics(...p.counts) as DemandDistribution;
    const b = page(fromCounts(...p.counts));
    let any = false;
    for (const d of DIMS) {
      const diff = Math.abs((a.demands[d] ?? 0) - (b.demands[d] ?? 0));
      if (diff > 1e-12) any = true;
      maxDiff[d] = Math.max(maxDiff[d], diff);
    }
    if (any) { moved++; if (p.interaction) movedInteraction.push(p.id); }
  }
  console.log(`${moved} of ${pages.length} pages (old-grid + INTERACTION_PAGES) change some demand coordinate by more than 1e-12. Interaction pages moved: ${movedInteraction.join(", ") || "none"}.\n`);
  console.log("| dimension | max abs change |\n|---|---|");
  for (const d of DIMS) if (maxDiff[d] > 1e-12) console.log(`| ${d} | ${maxDiff[d].toFixed(6)} |`);
} else {
  const shard = Number(process.env.SHARD ?? 0), shards = Number(process.env.SHARDS ?? 1);
  await withModules((mods) => {
    const only = process.env.ONLY;
    scanPages().forEach((p, i) => {
      if (only ? p.id !== only : i % shards !== shard) return;
      console.log(JSON.stringify(scan(p, 1000 + i, mods)));
    });
  });
}
