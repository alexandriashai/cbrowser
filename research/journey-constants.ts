/**
 * Write research/journey-constants.md: the inventory of every number the
 * cognitive journey computes with, from the registry itself.
 *
 *   bun research/journey-constants.ts
 *
 * For each registered journey constant: its value, status and source, where
 * the code reads it, and what changes when it moves. The last is measured,
 * not asserted: every id is scaled by 1.1 (and 0.9) and every journey-golden
 * scenario and sweep that reads it is re-run (tests/fixtures/journey-perturb.ts);
 * the changed outputs are sorted into state (a state, result or returned
 * number), timing (only waits, elapsed time and timestamps) and text (only
 * prompts, served instructions and log lines).
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-journey-inventory-data-"));
process.env.CBROWSER_ARTIFACT_DIR = mkdtempSync(join(tmpdir(), "cb-journey-inventory-art-"));
delete process.env.ANTHROPIC_API_KEY;

const ROOT = join(import.meta.dir, "..");
const { JOURNEY_GROUPS } = await import("../src/visual/provenance/journey-group.js");
const { MODEL_PROVENANCE, withParamOverridesAsync } = await import("../src/visual/model-provenance.js");
const { journeyUnits, baseline } = await import("../tests/fixtures/journey-perturb.js");

// ── Where each id is read ────────────────────────────────────────────────────

const sources: Array<{ file: string; lines: string[] }> = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "provenance") walk(p); }
    else if (p.endsWith(".ts")) sources.push({ file: relative(ROOT, p), lines: readFileSync(p, "utf8").split("\n") });
  }
};
walk(join(ROOT, "src"));

/** The textual forms an id is read under: param("id"), and the short helpers. */
function needles(id: string): string[] {
  const out = [`"${id}"`];
  const [group, ...rest] = id.split(".");
  const tail = rest.join(".");
  if (group === "humanInput") out.push(`P("${tail}")`);
  if (id.startsWith("journeyMcp.update.")) out.push(`U("${id.slice("journeyMcp.update.".length)}")`);
  if (id.startsWith("emotion.effect.")) out.push("`emotion.effect.${trigger}.${emotion}`");
  if (id.startsWith("emotion.valence.")) out.push("`emotion.valence.${emotion}`");
  if (id.startsWith("emotion.arousal.") && id !== "emotion.arousal.neutral") out.push("`emotion.arousal.${emotion}`");
  if (id.startsWith("journey.klm.")) out.push(`param("${id}")`);
  return out;
}

function readAt(id: string): string[] {
  const at: string[] = [];
  const ns = needles(id);
  for (const s of sources) {
    s.lines.forEach((line, i) => {
      if (ns.some((n) => line.includes(n))) at.push(`${s.file}:${i + 1}`);
    });
  }
  return [...new Set(at)];
}

// ── What moves when each id moves ───────────────────────────────────────────

const TIMING = /timestamp|timeElapsed|gazeMouseLag|\.delays\.|elapsedMs|totalTime|timeInSystem|\.gazeLag\./;

function changedPaths(a: unknown, b: unknown, p = "", out: Array<{ p: string; kind: "number" | "string" | "other" }> = []) {
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    if (!Object.is(a, b)) out.push({ p, kind: typeof a === "number" && typeof b === "number" ? "number" : typeof a === "string" || typeof b === "string" ? "string" : "other" });
    return out;
  }
  for (const k of new Set([...Object.keys(a as object), ...Object.keys(b as object)])) {
    changedPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${p}.${k}`, out);
  }
  return out;
}

const units = journeyUnits();
const base = await baseline(units);
const parsedBase = new Map([...base.output].map(([k, v]) => [k, JSON.parse(v)]));

async function effect(id: string): Promise<string> {
  const value = MODEL_PROVENANCE[id].value;
  const readers = units.filter((u) => base.reads.get(u.name)?.has(id));
  if (readers.length === 0) return "not reached by any test (see notes)";
  const kinds = new Set<string>();
  const where = new Set<string>();
  for (const factor of [1.1, 0.9]) {
    for (const u of readers) {
      const out = JSON.parse(JSON.stringify(await withParamOverridesAsync({ [id]: value * factor }, u.run)));
      for (const c of changedPaths(parsedBase.get(u.name), out)) {
        kinds.add(c.kind === "number" ? (TIMING.test(c.p) ? "timing" : "state") : "text");
        where.add(u.name.replace(/^(scenario|sweep):/, ""));
      }
    }
    if (kinds.size) break;
  }
  if (!kinds.size) return "nothing within 10% (exempt, see notes)";
  const order = ["state", "timing", "text"].filter((k) => kinds.has(k));
  const w = [...where];
  return `${order.join(" + ")} (${w.length} unit${w.length === 1 ? "" : "s"}: ${w.slice(0, 3).join(", ")}${w.length > 3 ? ", ..." : ""})`;
}

// ── The document ────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const rows: string[] = [];
const totals: Record<string, Record<string, number>> = {};
for (const [group, entries] of Object.entries(JOURNEY_GROUPS)) {
  totals[group] = { fitted: 0, published: 0, definition: 0, hypothesis: 0 };
  rows.push(`\n### ${group}.* (${entries.length})\n`);
  rows.push("| id | value | status | read at | moves when changed 10% | source |");
  rows.push("|---|---|---|---|---|---|");
  for (const e of entries) {
    totals[group][e.status]++;
    const at = readAt(e.id);
    rows.push(`| \`${e.id}\` | ${e.value} | ${e.status} | ${at.slice(0, 4).join(", ")}${at.length > 4 ? ` (+${at.length - 4})` : ""} | ${await effect(e.id)} | ${esc(e.source)} |`);
  }
}

const statusTable = [
  "| group | entries | fitted | published | definition | hypothesis |",
  "|---|---|---|---|---|---|",
  ...Object.entries(totals).map(([g, c]) => `| ${g} | ${Object.values(c).reduce((a, b) => a + b, 0)} | ${c.fitted} | ${c.published} | ${c.definition} | ${c.hypothesis} |`),
];
const sum = Object.values(totals).reduce((acc, c) => { for (const k of Object.keys(c)) acc[k] = (acc[k] ?? 0) + c[k]; return acc; }, {} as Record<string, number>);
statusTable.push(`| **all** | ${Object.values(sum).reduce((a, b) => a + b, 0)} | ${sum.fitted} | ${sum.published} | ${sum.definition} | ${sum.hypothesis} |`);

const notes = readFileSync(join(import.meta.dir, "journey-constants.notes.md"), "utf8");
const md = `# The cognitive journey's constants (cbrowser 21.0)

Generated by \`bun research/journey-constants.ts\` from the registry
(src/visual/provenance/journey*.ts, emotion.ts, temporal.ts, human-input.ts)
and a perturbation of the journey golden. Do not edit by hand; the notes
section comes from research/journey-constants.notes.md.

## Counts by status

${statusTable.join("\n")}

Before 21.0 the same files held 659 numeric literals that the journey
no-literals test (tests/journey-no-literals.test.ts) rejects; now they hold
none. 444 constants were registered; then 16 that could change nothing, a
number only the served text carried, and the five hand-set gaze-lag
constants were removed and the published gaze-lag average added, leaving
the 423 below. "text" in the last column includes the calls the journey
makes of the browser (the timeouts it passes are logged by the fake one).

${notes}

## Every constant

"read at" is where the code reads the id (param(), or the file's short helper
for it). "moves when changed 10%" is measured: state means some state,
result or returned number moved; timing, only waits, elapsed time and
timestamps; text, only prompts, the served instructions or log lines; with
the scenarios and sweeps it moved, from tests/fixtures/journey-scenarios.ts
and journey-sweeps.ts.
${rows.join("\n")}
`;
writeFileSync(join(import.meta.dir, "journey-constants.md"), md);
console.log(`wrote research/journey-constants.md: ${Object.values(JOURNEY_GROUPS).flat().length} constants`);
process.exit(0);
