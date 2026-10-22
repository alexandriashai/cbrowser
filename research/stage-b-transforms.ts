/**
 * The candidate seconds -> [0, 1] transforms of the Stage B design note, on the
 * sampled pages: median [p10, p90] demand per channel and scope, so the note
 * can show what each transform does to layer balance and discrimination.
 *
 *   bun research/stage-b-transforms.ts [raw.jsonl]
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RawPageMeasurement } from "../src/visual/cognitive-transport.js";
import { lawTimes } from "./stage-b-explore.js";

const TAU = 12.4;
const transforms: Record<string, (T: number, ch: string, scope: string) => number> = {
  "hyperbolic tau=12.4": (T) => T / (T + TAU),
  "hill a=0.5 tau=12.4": (T) => Math.sqrt(T) / (Math.sqrt(T) + Math.sqrt(TAU)),
  "log2-linear S=10 tau=12.4": (T) => (T <= 0 ? 0 : Math.max(0, Math.min(1, 0.5 + Math.log2(T / TAU) / 10))),
};

const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};

const file = process.argv[2] ?? join(import.meta.dir, "stage-b-sample", "raw.jsonl");
const rows: Array<{ scope: string; T: Record<string, number> }> = [];
for (const line of readFileSync(file, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  if (r.outcome !== "measured") continue;
  for (const scope of ["viewport", "full_page"]) {
    const raw = r.raw[scope] as RawPageMeasurement;
    if (!raw || raw.interactiveElements === 0) continue;
    const L = lawTimes(raw);
    rows.push({ scope, T: { motor: L.motorMB, motorOne: L.motorMeanMT, hick: L.hick, search: L.search, read: L.read, procedure: L.procedure } });
  }
}
// Per-channel, per-scope medians: the alternative with one tau per channel taken from the sample.
const medians: Record<string, number> = {};
for (const scope of ["viewport", "full_page"])
  for (const ch of Object.keys(rows[0].T)) medians[`${scope}|${ch}`] = q(rows.filter((r) => r.scope === scope).map((r) => r.T[ch]), 0.5);
transforms["hyperbolic, tau = channel median"] = (T, ch, scope) => { const m = medians[`${scope}|${ch}`]; return m > 0 ? T / (T + m) : 0; };

const f = (v: number) => v.toFixed(2);
for (const [name, g] of Object.entries(transforms)) {
  console.log(`\n${name}`);
  for (const scope of ["viewport", "full_page"]) {
    const rs = rows.filter((r) => r.scope === scope);
    const cells = Object.keys(rs[0].T).map((ch) => {
      const ds = rs.map((r) => g(r.T[ch], ch, scope));
      return `${ch} ${f(q(ds, 0.5))} [${f(q(ds, 0.1))},${f(q(ds, 0.9))}]`;
    });
    console.log(`  ${scope.padEnd(9)} ${cells.join("  ")}`);
  }
}
console.log("\nchannel medians (s):", Object.entries(medians).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(", "));
