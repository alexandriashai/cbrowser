/**
 * ISC-57.1: how many motor barriers the hit-probability audit (motorAccessibility,
 * src/visual/cognitive-models.ts) adds or removes per persona between 20.2.2 and
 * the 21.0 integration branch, on real pages (research/stage-b-motor-barriers.md).
 *
 * The audit is a pure function of the page's targets and a persona profile, so
 * each page's input is captured once and both versions score the same input:
 * page drift cannot pose as a model change.
 *
 *   capture   loads a stratified sample of the graded reference pages (direct
 *             route only, so no page needs the residential proxy) in this
 *             tree's browser at the reference viewport, and runs cognitive_effort's
 *             own target capture on each: the function is read out of
 *             src/mcp-tools/base/persona-comparison-tools.ts, its types stripped,
 *             and evaluated in the page, so the capture is the tool's, not a copy.
 *               OUT=captures.json [PER_TYPE=12] bun research/stage-b-motor-barriers.ts capture
 *   score     scores every captured page for every built-in persona with TREE's
 *             own code, along cognitive_effort's path: the persona record,
 *             bridgeCapacityTraits, buildOTCognitiveProfile, motorAccessibility.
 *               TREE=<worktree> IN=captures.json OUT=scores.json bun research/stage-b-motor-barriers.ts score
 *   compare   the per-persona and per-page tables.
 *               IN=captures.json BEFORE=a.json AFTER=b.json bun research/stage-b-motor-barriers.ts compare
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface Target { selector: string; width: number; height: number; x: number; y: number; distance: number }
interface Capture {
  url: string; finalUrl?: string; site: string; frame: string; pageType: string;
  status: "captured" | "failed"; detail?: string; title?: string; viewport?: { w: number; h: number };
  targets: Target[];
}
interface PersonaScore {
  throughput: number; threshold: number; sigmaX: number; sigmaY: number; rho: number;
  /** Per captured page: hit probability and barrier flag per target. */
  pages: Array<{ hit: number[]; barrier: boolean[]; barrierCount: number }>;
}
type Scores = { tree: string; personas: Record<string, PersonaScore> };

const mode = process.argv[2];
const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`${k} is required`); return v; };

/** A seeded uniform stream (mulberry32), so the sample is reproducible. */
function stream(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** cognitive_effort's target capture, read out of the tool's source: the arrow function it evaluates in the page. */
function toolCaptureSource(root: string): string {
  const src = readFileSync(join(root, "src/mcp-tools/base/persona-comparison-tools.ts"), "utf8");
  const marker = src.indexOf("Get interactive elements for motor analysis");
  if (marker < 0) throw new Error("cognitive_effort's motor capture comment not found");
  const call = src.indexOf("await page.evaluate(", marker);
  const start = src.indexOf("() => {", call);
  let depth = 0;
  for (let i = start + "() => ".length; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) {
      // TypeScript in the tool; the page runs JavaScript. Bun strips the types
      // (bound to a name, so dead-code elimination keeps it).
      return new Bun.Transpiler({ loader: "ts", deadCodeElimination: false }).transformSync(`var __capture = ${src.slice(start, i + 1)};`);
    }
  }
  throw new Error("unbalanced capture function");
}

async function capture(): Promise<void> {
  const root = join(import.meta.dir, "..");
  const { CTC_REFERENCE_PAGES, CTC_REFERENCE_META } = await import("../src/data/ctc-reference-v2-2026-10-24.js");
  const perType = Number(process.env.PER_TYPE ?? 12);
  const graded = CTC_REFERENCE_PAGES.filter((p) => p.outcome === "graded");
  const direct = graded.filter((p) => p.route !== "proxy");
  const u = stream(20261024);
  const byType = new Map<string, typeof direct>();
  for (const p of direct) byType.set(p.pageType, [...(byType.get(p.pageType) ?? []), p]);
  const sample: typeof direct = [];
  for (const [, ps] of [...byType].sort(([a], [b]) => a.localeCompare(b))) {
    const shuffled = ps.map((p) => [u(), p] as const).sort((a, b) => a[0] - b[0]).map(([, p]) => p);
    sample.push(...shuffled.slice(0, perType));
  }
  console.error(`graded ${graded.length}, direct ${direct.length}; sample ${sample.length}: ${[...byType].map(([t, ps]) => `${t} ${Math.min(perType, ps.length)}/${ps.length}`).join(", ")}`);
  const fn = toolCaptureSource(root);
  const { CBrowser } = await import("../src/browser.js");
  const out: Capture[] = [];
  for (const p of sample) {
    const dataDir = mkdtempSync(join(tmpdir(), "motor-capture-"));
    process.env.CBROWSER_DATA_DIR = dataDir;
    const b = new CBrowser({ headless: true, viewportWidth: CTC_REFERENCE_META.viewport.width, viewportHeight: CTC_REFERENCE_META.viewport.height, dataDir });
    const row: Capture = { url: p.url, site: p.site, frame: p.frame, pageType: p.pageType, status: "failed", targets: [] };
    try {
      await Promise.race([
        (async () => {
          await b.navigate(p.finalUrl ?? p.url);
          const page = await b.getPage();
          row.finalUrl = page.url();
          const info = await page.evaluate(() => ({ title: document.title || "", w: window.innerWidth, h: window.innerHeight }));
          row.title = info.title.slice(0, 120);
          row.viewport = { w: info.w, h: info.h };
          row.targets = await page.evaluate(`(() => { ${fn}; return __capture(); })()`) as Target[];
          row.status = "captured";
        })(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("page ceiling 90 s")), 90_000)),
      ]);
    } catch (e) {
      row.detail = String((e as Error).message).split("\n")[0].slice(0, 160);
    } finally {
      await Promise.race([b.close().catch(() => {}), new Promise((r) => setTimeout(r, 15_000))]);
      rmSync(dataDir, { recursive: true, force: true });
    }
    out.push(row);
    console.error(`${out.length}/${sample.length} ${row.status} ${p.pageType} ${p.site}: ${row.targets.length} targets${row.detail ? ` (${row.detail})` : ""}`);
  }
  writeFileSync(need("OUT"), JSON.stringify({ capturedWith: "cognitive_effort's motor capture", viewport: CTC_REFERENCE_META.viewport, pages: out }, null, 1));
}

async function score(): Promise<void> {
  const tree = need("TREE");
  const dataDir = mkdtempSync(join(tmpdir(), "motor-score-"));
  process.env.CBROWSER_DATA_DIR = dataDir;
  try {
    const personas = await import(`${tree}/src/personas.ts`);
    const cm = await import(`${tree}/src/visual/cognitive-models.ts`);
    const { buildOTCognitiveProfile } = await import(`${tree}/src/visual/cognitive-transport.ts`);
    const { pages } = JSON.parse(readFileSync(need("IN"), "utf8")) as { pages: Capture[] };
    const names = [...Object.keys(personas.BUILTIN_PERSONAS), ...Object.keys(personas.ACCESSIBILITY_PERSONAS), ...Object.keys(personas.EMOTIONAL_PERSONAS)];
    const out: Scores = { tree, personas: {} };
    for (const name of names) {
      // cognitive_effort's path (persona-comparison-tools.ts): the record, a
      // copy of its traits, the capacity bridge, the OT profile the audit reads.
      const personaObj = personas.getAnyPersona(name);
      const traits = { ...(personaObj.cognitiveTraits || {}) } as Record<string, number>;
      const acc = personaObj.accessibilityTraits;
      if (typeof cm.personaRateContext === "function") cm.bridgeCapacityTraits(name, traits, acc, cm.personaRateContext(personaObj));
      else cm.bridgeCapacityTraits(name, traits, acc);
      const ot = buildOTCognitiveProfile(name, traits);
      const prof = cm.getPointingProfile(ot);
      const row: PersonaScore = { throughput: prof.throughput, threshold: prof.throughput >= 4.0 ? 0.85 : 0.70, sigmaX: prof.sigmaX, sigmaY: prof.sigmaY, rho: prof.rho, pages: [] };
      for (const p of pages) {
        const r = cm.motorAccessibility(p.targets, ot);
        row.pages.push({ hit: r.elements.map((e: { hitProbability: number }) => e.hitProbability), barrier: r.elements.map((e: { isBarrier: boolean }) => e.isBarrier), barrierCount: r.barrierCount });
      }
      out.personas[name] = row;
    }
    writeFileSync(need("OUT"), JSON.stringify(out));
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

/**
 * The CIF path, for the same pages: the CMS audit worker feeds empathy_audit's
 * barriers to CIF, with touchTargets parsed from the touch_target descriptions
 * (cbrowser-web cms/audit-worker-service.ts). runEmpathyAudit does live DOM
 * checks, so its input cannot be captured, and two loads of a live page differ
 * (measured: one page gave 0 and then 11 motor barriers on two loads under the
 * same version). So each page is loaded ONCE and every tree in TREES audits that
 * loaded page in turn, with goto made a no-op (the audit navigates the page it is
 * given; here it is already there). TREES lists the first tree again at the end,
 * as a control for anything the audits themselves change on the page. Options
 * are the worker's but no goal, so no journey and no model call (barrier
 * detection does not read the goal). Stores, per run, the motor barriers
 * (touch_target, motor_precision), the CIF input the worker would build, and
 * CIF's motor score from that tree's computeCIFScore.
 *   TREES=<a>,<b>,<a> IN=captures.json OUT=empathy.json [PAGES=10] [START=n] bun research/stage-b-motor-barriers.ts empathy
 */
async function empathy(): Promise<void> {
  const trees = need("TREES").split(",");
  const CEILING_S = Number(process.env.CEILING_S ?? 75);
  delete process.env.ANTHROPIC_API_KEY;
  const { pages } = JSON.parse(readFileSync(need("IN"), "utf8")) as { pages: Capture[] };
  const audits = await Promise.all(trees.map(async (t) => ({
    tree: t,
    run: (await import(`${t}/src/analysis/accessibility-empathy.ts`)).runEmpathyAudit,
    cif: (await import(`${t}/src/cif-score.ts`)).computeCIFScore,
  })));
  const { CBrowser } = await import("../src/browser.js");
  const { CTC_REFERENCE_META } = await import("../src/data/ctc-reference-v2-2026-10-24.js");
  const ok = pages.filter((p) => p.status === "captured" && p.targets.length > 0);
  // Spread over page types: round-robin through the types in capture order.
  const types = [...new Set(ok.map((p) => p.pageType))];
  const want = Number(process.env.PAGES ?? 10);
  const order: Capture[] = [];
  for (let k = 0; order.length < want && k < ok.length; k++)
    for (const t of types) { const p = ok.filter((q) => q.pageType === t)[k]; if (p && order.length < want) order.push(p); }
  // START: resume a run part-way through the same order (outputs append to OUT).
  const start = Number(process.env.START ?? 0);
  const pick = order.slice(start);
  const prior = start > 0 ? (JSON.parse(readFileSync(need("OUT"), "utf8")) as { pages: unknown[] }).pages.slice(0, start) : [];
  type WorkerBarrier = { type: string; severity: string; element: string; description: string; wcagCriteria?: string[] };
  type Run = { tree: string; motor: Array<{ type: string; element: string; description: string; severity: string; weightKey?: string }>;
    cifInput: { barriers: WorkerBarrier[]; touchTargets: Array<{ width: number; height: number; exempt: boolean }> } | null; cifMotor: number | null; error?: string };
  const out = prior as Array<{ url: string; site: string; pageType: string; runs: Run[]; error?: string }>;
  for (const p of pick) {
    const dataDir = mkdtempSync(join(tmpdir(), "motor-empathy-"));
    process.env.CBROWSER_DATA_DIR = dataDir;
    const b = new CBrowser({ headless: true, viewportWidth: CTC_REFERENCE_META.viewport.width, viewportHeight: CTC_REFERENCE_META.viewport.height, dataDir });
    const row: { url: string; site: string; pageType: string; runs: Run[]; error?: string } = { url: p.finalUrl ?? p.url, site: p.site, pageType: p.pageType, runs: [] };
    try {
      await b.navigate(p.finalUrl ?? p.url);
      const page = await b.getPage();
      // Already on the page: the audit's own goto would reload it.
      (page as unknown as { goto: () => Promise<null> }).goto = async () => null;
      for (const a of audits) {
        const run: Run = { tree: a.tree, motor: [], cifInput: null, cifMotor: null };
        try {
          const r = await Promise.race([
            a.run(row.url, { disabilities: ["first-timer"], wcagLevel: "AA", maxSteps: 3, maxTime: 20, headless: true, scope: "viewport", page }),
            new Promise((_, reject) => setTimeout(() => reject(new Error(`audit ceiling ${CEILING_S} s`)), CEILING_S * 1000)),
          ]) as { allBarriers?: Array<Record<string, unknown>>; topBarriers?: Array<Record<string, unknown>> };
          const all = (r.allBarriers || r.topBarriers || []) as Array<{ type: string; element: string; description: string; severity: string; wcagCriteria?: string[]; weightKey?: string }>;
          const touchTargets = all.filter((x) => x.type === "touch_target").map((x) => {
            const m = x.description?.match(/\((\d+)x(\d+)px\)/);
            return { width: m ? parseInt(m[1]) : 30, height: m ? parseInt(m[2]) : 30, exempt: false };
          });
          // The fields the worker passes (it drops weightKey; kept with the motor barriers for the report).
          run.cifInput = { barriers: all.map((x) => ({ type: x.type, severity: x.severity, element: x.element, description: x.description, wcagCriteria: x.wcagCriteria })), touchTargets };
          run.cifMotor = a.cif(run.cifInput).motor.score;
          run.motor = all.filter((x) => x.type === "touch_target" || x.type === "motor_precision").map((x) => ({ type: x.type, element: x.element, description: x.description, severity: x.severity, weightKey: x.weightKey }));
        } catch (e) {
          run.error = String((e as Error).message).split("\n")[0].slice(0, 160);
        }
        row.runs.push(run);
      }
    } catch (e) {
      row.error = String((e as Error).message).split("\n")[0].slice(0, 160);
    } finally {
      await Promise.race([b.close().catch(() => {}), new Promise((r) => setTimeout(r, 15_000))]);
      rmSync(dataDir, { recursive: true, force: true });
    }
    out.push(row);
    // Written after every page, so a run cut short keeps what it measured.
    writeFileSync(need("OUT"), JSON.stringify({ trees, pages: out }, null, 1));
    console.error(`${out.length}/${order.length} ${p.site}: ${row.error ?? row.runs.map((r) => r.error ? `error (${r.error})` : `${r.motor.length} motor, CIF motor ${r.cifMotor}`).join(" | ")}`);
  }
}

/**
 * CIF's motor score from TREE's computeCIFScore on the inputs an empathy run
 * stored (EMP), so two versions can score the identical input.
 *   TREE=<worktree> EMP=empathy.json [RUN=i] bun research/stage-b-motor-barriers.ts cif   (RUN: which run's input)
 */
async function cif(): Promise<void> {
  const { computeCIFScore } = await import(`${need("TREE")}/src/cif-score.ts`);
  const run = Number(process.env.RUN ?? 0);
  const { pages } = JSON.parse(readFileSync(need("EMP"), "utf8")) as { pages: Array<{ url: string; runs?: Array<{ cifInput: unknown }> }> };
  console.log(JSON.stringify(pages.map((p) => {
    const input = p.runs?.[run]?.cifInput;
    if (!input) return { url: p.url, motor: null };
    const m = computeCIFScore(input).motor;
    return { url: p.url, motor: m.score, components: Object.fromEntries(Object.entries(m).filter(([, v]) => v && typeof v === "object" && "score" in (v as object)).map(([k, v]) => [k, (v as { score: number }).score])) };
  })));
}

function compare(): void {
  const { pages } = JSON.parse(readFileSync(need("IN"), "utf8")) as { pages: Capture[] };
  const a = JSON.parse(readFileSync(need("BEFORE"), "utf8")) as Scores;
  const b = JSON.parse(readFileSync(need("AFTER"), "utf8")) as Scores;
  const ok = pages.map((p, i) => [p, i] as const).filter(([p]) => p.status === "captured" && p.targets.length > 0);
  console.log(`${ok.length} of ${pages.length} sampled pages captured with at least one target; ${ok.reduce((n, [p]) => n + p.targets.length, 0)} targets.\n`);
  console.log("| persona | TP before -> after | threshold before -> after | barriers before | after | added | removed |");
  console.log("|---|---|---|---|---|---|---|");
  type Change = { persona: string; page: number; added: number; removed: number; reason: string };
  const changes: Change[] = [];
  const pagesChanged = new Set<number>();
  const tot = { before: 0, after: 0, added: 0, removed: 0 };
  for (const name of Object.keys(b.personas)) {
    const pa = a.personas[name], pb = b.personas[name];
    if (!pa) continue;
    let before = 0, after = 0, added = 0, removed = 0;
    for (const [, i] of ok) {
      const x = pa.pages[i], y = pb.pages[i];
      let ad = 0, rm = 0, byThreshold = 0, byHit = 0;
      for (let k = 0; k < y.barrier.length; k++) {
        if (x.barrier[k] === y.barrier[k]) continue;
        if (y.barrier[k]) ad++; else rm++;
        const hitMoved = Math.abs(x.hit[k] - y.hit[k]) > 1e-9;
        const thrMoved = pa.threshold !== pb.threshold;
        // Which line moved the element across: the threshold alone (the
        // persona's TP crossed 4.0), the hit probability alone, or both.
        if (thrMoved && (x.hit[k] < pb.threshold) !== (x.hit[k] < pa.threshold)) byThreshold++;
        if (hitMoved && (x.hit[k] < pb.threshold) !== (y.hit[k] < pb.threshold)) byHit++;
      }
      before += x.barrierCount; after += y.barrierCount; added += ad; removed += rm;
      if (ad + rm > 0) {
        pagesChanged.add(i);
        const reason = byThreshold > 0 && byHit > 0 ? "both" : byThreshold > 0 ? "TP line (threshold 0.70 -> 0.85)" : "hit probability";
        changes.push({ persona: name, page: i, added: ad, removed: rm, reason });
      }
    }
    tot.before += before; tot.after += after; tot.added += added; tot.removed += removed;
    console.log(`| ${name} | ${pa.throughput.toFixed(2)} -> ${pb.throughput.toFixed(2)} | ${pa.threshold} -> ${pb.threshold} | ${before} | ${after} | ${added} | ${removed} |`);
  }
  console.log(`| all | | | ${tot.before} | ${tot.after} | ${tot.added} | ${tot.removed} |\n`);
  // A page counts once if any persona's barrier count on it changes.
  const countChanged = new Set(ok.filter(([, i]) => Object.keys(b.personas).some((n) => a.personas[n] && a.personas[n].pages[i].barrierCount !== b.personas[n].pages[i].barrierCount)).map(([, i]) => i));
  console.log(`Pages whose motor barrier count changes for at least one persona: ${countChanged.size} of ${ok.length} (${(100 * countChanged.size / ok.length).toFixed(1)}%); with any element flipping: ${pagesChanged.size}.\n`);
  console.log("The 5 pages with the largest change (the persona it is largest for, barriers before -> after of that page's targets, added / removed, reason, and how many personas change there):\n");
  const byPage = new Map<number, Change[]>();
  for (const c of changes) byPage.set(c.page, [...(byPage.get(c.page) ?? []), c]);
  const size = (c: Change) => c.added + c.removed;
  const top = [...byPage.values()].map((cs) => [...cs].sort((p, q) => size(q) - size(p) || p.persona.localeCompare(q.persona))).sort((p, q) => size(q[0]) - size(p[0])).slice(0, 5);
  for (const cs of top) {
    const c = cs[0], p = pages[c.page];
    const reasons = [...new Set(cs.map((x) => x.reason))].join(", ");
    console.log(`- ${p.site} ${p.pageType} (${p.finalUrl ?? p.url}), ${p.targets.length} targets: ${c.persona} ${a.personas[c.persona].pages[c.page].barrierCount} -> ${b.personas[c.persona].pages[c.page].barrierCount}, +${c.added} / -${c.removed}; ${cs.length} personas change here; reason: ${reasons}`);
  }
}

// The browser leaves handles open after close; the output is written, so exit.
if (mode === "capture") { await capture(); process.exit(0); }
else if (mode === "score") await score();
else if (mode === "empathy") { await empathy(); process.exit(0); }
else if (mode === "cif") await cif();
else if (mode === "compare") compare();
else throw new Error("mode: capture | score | empathy | cif | compare");
