/**
 * cognitive_load_estimate on the reference pages, per persona, as the tool
 * builds its input (getCognitiveProfile, bridgeCapacityTraits,
 * buildOTCognitiveProfile; the page metrics derived from each reference
 * page), for the tree TREE (default: this tree). Writes JSON: for each scope
 * and persona the totalLoad on every page, in reference order.
 *
 *   TREE=/path/to/worktree bun research/stage-c-load-estimate.ts > out.json
 *   BEFORE=a.json AFTER=b.json bun research/stage-c-load-estimate.ts --report
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readFileSync } from "node:fs";

if (process.argv.includes("--report")) {
  const b = JSON.parse(readFileSync(process.env.BEFORE!, "utf8"));
  const a = JSON.parse(readFileSync(process.env.AFTER!, "utf8"));
  const q = (xs: number[], p: number) => { const s = [...xs].sort((x, y) => x - y); const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
  const f = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(3)}`;
  console.log(`Reference: ${a.reference}; pages ${a.viewport.pages} per scope.\n`);
  console.log("| persona | viewport median change | viewport max abs change | full_page median change | full_page max abs change | bottleneck 'information' before (viewport pages) |\n|---|---|---|---|---|---|");
  for (const n of Object.keys(a.viewport.load)) {
    const cells = ["viewport", "full_page"].flatMap((s) => {
      const d = a[s].load[n].map((v: number, i: number) => v - b[s].load[n][i]);
      return [f(q(d, 0.5)), Math.max(...d.map(Math.abs)).toFixed(3)];
    });
    const wasInfo = b.viewport.bottleneck[n].filter((x: string) => x === "information").length;
    console.log(`| ${n} | ${cells.join(" | ")} | ${wasInfo} |`);
  }
  process.exit(0);
}

const TREE = process.env.TREE ?? `${import.meta.dir}/..`;
const { referenceRaw, CTC_REFERENCE } = await import(`${TREE}/src/visual/ctc-reference.ts`);
const { deriveMetrics, buildOTCognitiveProfile, estimateCognitiveLoad } = await import(`${TREE}/src/visual/cognitive-transport.ts`);
const { bridgeCapacityTraits, personaRateContext } = await import(`${TREE}/src/visual/cognitive-models.ts`);
const { getCognitiveProfile, BUILTIN_PERSONAS, ACCESSIBILITY_PERSONAS, EMOTIONAL_PERSONAS } = await import(`${TREE}/src/personas.ts`);

const roster = { ...BUILTIN_PERSONAS, ...ACCESSIBILITY_PERSONAS, ...EMOTIONAL_PERSONAS } as Record<string, { accessibilityTraits?: Record<string, number> }>;
const profiles = Object.entries(roster).map(([name, p]) => {
  const traits = { ...((getCognitiveProfile(p as never).traits as unknown as Record<string, number>) || {}) };
  bridgeCapacityTraits(name, traits, p.accessibilityTraits, personaRateContext(p));
  return [name, buildOTCognitiveProfile(name, traits)] as const;
});
const out: Record<string, unknown> = { reference: CTC_REFERENCE.id, tree: TREE };
for (const scope of ["viewport", "full_page"] as const) {
  const pages = referenceRaw(scope).map((r: unknown) => deriveMetrics(r));
  const load: Record<string, number[]> = {};
  const bottleneck: Record<string, string[]> = {};
  for (const [name, prof] of profiles) {
    const rs = pages.map((m: Record<string, number>) => estimateCognitiveLoad(prof, m));
    load[name] = rs.map((r: { totalLoad: number }) => r.totalLoad);
    bottleneck[name] = rs.map((r: { bottleneck: string }) => r.bottleneck);
  }
  out[scope] = { pages: pages.length, load, bottleneck };
}
console.log(JSON.stringify(out));
