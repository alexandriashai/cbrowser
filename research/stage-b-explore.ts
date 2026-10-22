/**
 * Stage B design exploration: the law times (Fitts, Hick-Hyman, reading rate,
 * KLM) of each sampled page, computed from its RawPageMeasurement alone, and
 * the demands they give under one shared time constant, beside today's demands.
 * Prototype arithmetic for research/stage-b-design.md, not product code: the
 * parameters are written inline here with their sources, and Phase 2 moves
 * them into the registry.
 *
 *   bun research/stage-b-explore.ts [raw.jsonl] [--tau 12.4] [--json]
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveMetrics, type RawPageMeasurement } from "../src/visual/cognitive-transport.js";
import { computeDemandDistribution } from "../src/visual/cognitive-transport-chain.js";

// ── Parameters, each from a source read for the design note ──
// Fitts, Shannon form, SMALLER-OF width: MacKenzie & Buxton (1992) CHI, Fig. 6, mouse, 12 participants.
const FITTS_MB = { a: 0.230, b: 0.166 };
// Fitts, menu items 130x22 px: Cockburn, Gutwin & Greenberg (2007) CHI, calibration, mouse, 8 participants.
const FITTS_CGG = { a: 0.37, b: 0.13 };
// Hick-Hyman, expert (static familiar menus), H = log2(n): Cockburn et al. (2007), 0.08 s/bit + 0.24 s.
const HICK = { a: 0.24, b: 0.08 };
// Visual search, novice (random menus), linear in n: Cockburn et al. (2007), 0.08 s/item + 0.30 s.
const SEARCH = { a: 0.30, b: 0.08 };
// Silent reading: Brysbaert (2019) JML 109:104047. English non-fiction 238 wpm at 4.6 letters/word,
// wpm = 238 x 4.6 / mean word length, i.e. a constant 1094.8 letters/min. Table 5: Arabic 181 wpm,
// Chinese 260 wpm counted at 1.5 characters per word (390 characters/min).
const LETTERS_PER_MIN = 238 * 4.6;
const ABJAD_WPM = 181;
const CJK_CHARS_PER_MIN = 260 * 1.5;
// KLM mental preparation M: Card, Moran & Newell (1980) CACM 23(7), Fig. 1 / sec. 4.2.1.
const KLM_M = 1.35;

const SINGLE_CHOICE = new Set(["nav", "select", "radio", "menu", "menubar", "listbox", "tablist", "radiogroup"]);
const ENTRY = /^(input:(text|email|password|search|tel|url|number|date|datetime-local|month|week|time|color|file|range)|textarea|select)(\[|$)/;

export interface LawTimes {
  targets: number; targetsStored: number;
  meanID: number; motorMB: number; motorCGG: number; motorMeanMT: number; motorP90MT: number;
  groups: number; ungroupedLinks: number; hick: number; search: number;
  words: number; letters: number; meanWordLength: number; read: number; nestedWords: number;
  steps: number; procedure: number;
}

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};

export function lawTimes(raw: RawPageMeasurement): LawTimes {
  const vw = raw.viewportWidth, vh = raw.viewportHeight;
  // ── Motor: every target once, from the centre of the screen it sits on ──
  const ids: number[] = [];
  const steps: string[] = [];
  for (let i = 0; i + 4 < raw.boxes.length; i += 5) {
    const [k, x, y, w, h] = raw.boxes.slice(i, i + 5);
    const cx = x + w / 2, cy = y + h / 2;
    const screenTop = raw.scope === "full_page" ? Math.floor(cy / vh) * vh : raw.scrollY;
    const D = Math.hypot(cx - vw / 2, cy - (screenTop + vh / 2));
    const W = Math.max(1, Math.min(w, h));
    ids.push(Math.log2(D / W + 1));
    if (ENTRY.test(raw.kinds[k])) steps.push(raw.kinds[k]);
  }
  const stored = ids.length;
  const scaleUp = stored > 0 ? raw.interactiveElements / stored : 0;
  const sumID = ids.reduce((s, v) => s + v, 0);
  const mt = (p: { a: number; b: number }) => (stored * p.a + p.b * sumID) * scaleUp;
  const mts = ids.map((id) => FITTS_MB.a + FITTS_MB.b * id);

  // ── Decision: every choice group once ──
  let hick = 0, search = 0, navLinks = 0, groupsStored = 0, toggleGroups = 0;
  for (let i = 0; i + 1 < raw.choiceGroups.length; i += 2) {
    const kind = raw.kinds[raw.choiceGroups[i]];
    const n = raw.choiceGroups[i + 1];
    groupsStored++;
    if (kind === "nav") navLinks += n;
    if (kind === "checkbox") {
      hick += n * (HICK.a + HICK.b * 1);
      search += n * (SEARCH.a + SEARCH.b * 1);
      toggleGroups++;
    } else {
      if (kind === "radio") toggleGroups++;
      hick += HICK.a + HICK.b * Math.log2(n);
      search += SEARCH.a + SEARCH.b * n;
    }
  }
  if (groupsStored > 0 && raw.choiceGroupCount > groupsStored) {
    hick *= raw.choiceGroupCount / groupsStored;
    search *= raw.choiceGroupCount / groupsStored;
  }
  const ungrouped = Math.max(0, raw.links - navLinks);
  if (ungrouped > 0) {
    hick += HICK.a + HICK.b * Math.log2(ungrouped);
    search += SEARCH.a + SEARCH.b * ungrouped;
  }

  // ── Reading: all prose in scope once ──
  const t = raw.text;
  let words = 0, letters = 0, minutes = 0;
  for (const [len, c] of t.wordLengths) { words += c; letters += len * c; }
  minutes += letters / LETTERS_PER_MIN;
  if (t.script === "abjad") {
    let aw = 0;
    for (const [, c] of t.abjadWordLengths) aw += c;
    words += aw;
    minutes += aw / ABJAD_WPM;
  }
  if (t.script === "cjk") minutes += t.cjkChars / CJK_CHARS_PER_MIN;
  let blockWords = 0;
  for (let i = 0; i + 7 < raw.textBlocks.length; i += 8) blockWords += raw.textBlocks[i + 1];

  // ── Procedure: KLM M per entry field and per radio/checkbox group ──
  const stepCount = steps.length * scaleUp + toggleGroups;

  return {
    targets: raw.interactiveElements, targetsStored: stored,
    meanID: stored ? sumID / stored : 0, motorMB: mt(FITTS_MB), motorCGG: mt(FITTS_CGG),
    motorMeanMT: stored ? mts.reduce((s, v) => s + v, 0) / stored : 0, motorP90MT: quantile(mts, 0.9),
    groups: raw.choiceGroupCount, ungroupedLinks: ungrouped, hick, search,
    words, letters, meanWordLength: words ? letters / words : 0, read: minutes * 60, nestedWords: blockWords,
    steps: stepCount, procedure: stepCount * KLM_M,
  };
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--") && !/^[\d.]+$/.test(a)) ?? join(import.meta.dir, "stage-b-sample", "raw.jsonl");
  const tau = args.includes("--tau") ? Number(args[args.indexOf("--tau") + 1]) : 12.4;
  const d = (T: number) => T / (T + tau);
  const rows: Array<Record<string, unknown>> = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    if (r.outcome !== "measured") continue;
    for (const scope of ["viewport", "full_page"] as const) {
      const raw = r.raw[scope] as RawPageMeasurement;
      if (!raw || raw.interactiveElements === 0) continue;
      const L = lawTimes(raw);
      const old = computeDemandDistribution(deriveMetrics(raw)).demands;
      rows.push({ url: r.url, type: r.type, scope, script: raw.text.script, ...L,
        dMotor: d(L.motorMB), dDecision: d(L.hick), dRead: d(L.read), dProc: d(L.procedure),
        oldMotor: old.motorCapacity, oldSatisficing: old.satisficing, oldRead: old.readingCapacity, oldProc: old.proceduralFluency });
    }
  }
  if (args.includes("--json")) { console.log(JSON.stringify(rows, null, 1)); return; }
  const f = (v: unknown, p = 1) => (typeof v === "number" ? v.toFixed(p) : String(v));
  console.log(`tau = ${tau} s`);
  console.log(["page", "scope", "n", "meanID", "Tmot", "Tdec", "Tsrch", "Tread", "Tproc", "dMot/old", "dDec/old", "dRead/old", "dProc/old"].join("\t"));
  for (const r of rows) {
    console.log([String(r.url).replace(/^https:\/\/(www\.)?/, "").slice(0, 34), String(r.scope).slice(0, 4), r.targets, f(r.meanID, 2),
      f(r.motorMB), f(r.hick), f(r.search), f(r.read), f(r.procedure),
      `${f(r.dMotor, 2)}/${f(r.oldMotor, 2)}`, `${f(r.dDecision, 2)}/${f(r.oldSatisficing, 2)}`, `${f(r.dRead, 2)}/${f(r.oldRead, 2)}`, `${f(r.dProc, 2)}/${f(r.oldProc, 2)}`].join("\t"));
  }
  for (const scope of ["viewport", "full_page"]) {
    const rs = rows.filter((r) => r.scope === scope);
    const col = (k: string) => rs.map((r) => r[k] as number);
    console.log(`\n${scope} (${rs.length} pages): median [p10, p90]`);
    for (const k of ["motorMB", "motorCGG", "motorMeanMT", "meanID", "hick", "search", "read", "procedure", "dMotor", "dDecision", "dRead", "dProc", "oldMotor", "oldSatisficing", "oldRead", "oldProc"]) {
      const xs = col(k);
      console.log(`  ${k.padEnd(14)} ${f(quantile(xs, 0.5), 2)} [${f(quantile(xs, 0.1), 2)}, ${f(quantile(xs, 0.9), 2)}]`);
    }
  }
}

if (import.meta.main) main();
