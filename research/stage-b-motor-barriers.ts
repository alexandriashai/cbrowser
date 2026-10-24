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
 * checks, so its input cannot be captured: each page is audited by TREE on its
 * own load, with the worker's options but no goal (so no journey and no model
 * call; barrier detection does not read the goal). Reports the motor barriers
 * (touch_target, motor_precision) and CIF's motor score from TREE's
 * computeCIFScore on those barriers alone.
 *   TREE=<worktree> IN=captures.json OUT=empathy.json [PAGES=10] bun research/stage-b-motor-barriers.ts empathy
 */
async function empathy(): Promise<void> {
  const tree = need("TREE");
  delete process.env.ANTHROPIC_API_KEY;
  const { pages } = JSON.parse(readFileSync(need("IN"), "utf8")) as { pages: Capture[] };
  const { runEmpathyAudit } = await import(`${tree}/src/analysis/accessibility-empathy.ts`);
  const { computeCIFScore } = await import(`${tree}/src/cif-score.ts`);
  const ok = pages.filter((p) => p.status === "captured" && p.targets.length > 0);
  // Spread over page types: round-robin through the types in capture order.
  const types = [...new Set(ok.map((p) => p.pageType))];
  const pick: Capture[] = [];
  for (let k = 0; pick.length < Number(process.env.PAGES ?? 10) && k < ok.length; k++)
    for (const t of types) { const p = ok.filter((q) => q.pageType === t)[k]; if (p && pick.length < Number(process.env.PAGES ?? 10)) pick.push(p); }
  const out: Array<{ url: string; motor: Array<{ type: string; element: string; description: string; severity: string }>; cifMotor: number | null; error?: string }> = [];
  for (const p of pick) {
    const dataDir = mkdtempSync(join(tmpdir(), "motor-empathy-"));
    process.env.CBROWSER_DATA_DIR = dataDir;
    try {
      const r = await Promise.race([
        runEmpathyAudit(p.finalUrl ?? p.url, { disabilities: ["first-timer"], wcagLevel: "AA", maxSteps: 3, maxTime: 20, headless: true, scope: "viewport" }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("audit ceiling 120 s")), 120_000)),
      ]) as { allBarriers?: Array<Record<string, unknown>>; topBarriers?: Array<Record<string, unknown>> };
      const all = (r.allBarriers || r.topBarriers || []) as Array<{ type: string; element: string; description: string; severity: string; wcagCriteria?: string[] }>;
      const touchTargets = all.filter((b) => b.type === "touch_target").map((b) => {
        const m = b.description?.match(/\((\d+)x(\d+)px\)/);
        return { width: m ? parseInt(m[1]) : 30, height: m ? parseInt(m[2]) : 30, exempt: false };
      });
      const cif = computeCIFScore({ barriers: all.map((b) => ({ type: b.type, severity: b.severity, element: b.element, description: b.description, wcagCriteria: b.wcagCriteria })), touchTargets });
      out.push({ url: p.url, motor: all.filter((b) => b.type === "touch_target" || b.type === "motor_precision").map((b) => ({ type: b.type, element: b.element, description: b.description, severity: b.severity })), cifMotor: cif.motor.score });
    } catch (e) {
      out.push({ url: p.url, motor: [], cifMotor: null, error: String((e as Error).message).split("\n")[0].slice(0, 160) });
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
    console.error(`${out.length}/${pick.length} ${p.site}: ${out.at(-1)!.motor.length} motor barriers, CIF motor ${out.at(-1)!.cifMotor}${out.at(-1)!.error ? ` (${out.at(-1)!.error})` : ""}`);
  }
  writeFileSync(need("OUT"), JSON.stringify({ tree, pages: out }, null, 1));
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
  console.log("Largest per-page changes (persona, page, barriers before -> after, added / removed, reason):\n");
  const top = changes.sort((p, q) => (q.added + q.removed) - (p.added + p.removed) || p.persona.localeCompare(q.persona)).slice(0, 5);
  for (const c of top) {
    const p = pages[c.page];
    console.log(`- ${c.persona} on ${p.site} ${p.pageType} (${p.finalUrl ?? p.url}): ${a.personas[c.persona].pages[c.page].barrierCount} -> ${b.personas[c.persona].pages[c.page].barrierCount}, +${c.added} / -${c.removed}, ${c.reason}`);
  }
}

// The browser leaves handles open after close; the output is written, so exit.
if (mode === "capture") { await capture(); process.exit(0); }
else if (mode === "score") await score();
else if (mode === "empathy") { await empathy(); process.exit(0); }
else if (mode === "compare") compare();
else throw new Error("mode: capture | score | empathy | compare");
