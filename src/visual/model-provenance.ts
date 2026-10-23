/**
 * Where every number in the cognitive transport model comes from.
 *
 * A constant the model reads is either:
 *   fitted      estimated from named data, with the held-out score in `source`
 *   published   taken from a cited law or measurement in the literature
 *   definition  a choice of units, scale or encoding that carries no empirical claim
 *   hypothesis  set by hand; nothing in data or literature backs the value yet
 *
 * The paper and the tools report these labels instead of presenting hand-set
 * numbers as findings. Everything the chain, the persona distance and the DRO
 * bound read goes through `param()`, so the registry cannot drift from the code:
 * tests record which ids a run reads and fail on an id that is read but not
 * registered, or registered but never read.
 *
 * Entries live beside the code that reads them (provenance/*.ts) and are merged
 * here, so a new constant is registered in the same file it is introduced in.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type ProvenanceStatus ="fitted" | "published" | "definition" | "hypothesis";

export interface ProvenanceEntry {
  /** Stable id, `<area>.<name>`, e.g. "chain.weightDeficit". */
  id: string;
  value: number;
  status: ProvenanceStatus;
  /** Data and score for fitted, citation for published, reason for definition, what would test it for hypothesis. */
  source: string;
}

import { CHAIN_PROVENANCE } from "./provenance/chain.js";
import { DISTANCE_PROVENANCE } from "./provenance/distance.js";
import { DRO_PROVENANCE } from "./provenance/dro.js";
import { PERSONA_PROVENANCE } from "./provenance/personas.js";
import { CIF_PROVENANCE } from "./provenance/cif.js";
import { CTC_REFERENCE_PROVENANCE } from "./provenance/ctc-reference.js";
import { ATTENTION_PROVENANCE } from "./provenance/attention.js";
import { PERCEPTUAL_PROVENANCE } from "./provenance/perceptual.js";
import { PAGE_METRICS_PROVENANCE } from "./provenance/page-metrics.js";
import { VISUAL_DISTANCE_PROVENANCE } from "./provenance/visual-distance.js";
import { LAW_PROVENANCE } from "./provenance/laws.js";
import { PROFILE_PROVENANCE } from "./provenance/profiles.js";
import { PERSONA_RATE_PROVENANCE, CUSTOM_RATE_PROVENANCE } from "./provenance/persona-rates.js";

function index(...groups: ProvenanceEntry[][]): Record<string, ProvenanceEntry> {
  const out: Record<string, ProvenanceEntry> = {};
  for (const g of groups)
    for (const e of g) {
      if (out[e.id]) throw new Error(`duplicate provenance id ${e.id}`);
      out[e.id] = e;
    }
  return out;
}

export const MODEL_PROVENANCE: Readonly<Record<string, ProvenanceEntry>> = Object.freeze(
  index(CHAIN_PROVENANCE, DISTANCE_PROVENANCE, DRO_PROVENANCE, PERSONA_PROVENANCE, CIF_PROVENANCE, CTC_REFERENCE_PROVENANCE, ATTENTION_PROVENANCE, PERCEPTUAL_PROVENANCE, PAGE_METRICS_PROVENANCE, VISUAL_DISTANCE_PROVENANCE, LAW_PROVENANCE, PROFILE_PROVENANCE, PERSONA_RATE_PROVENANCE, CUSTOM_RATE_PROVENANCE),
);

/**
 * WHERE A READ IS RECORDED. Every recording (withProvenance, readsOf,
 * withProvenanceAsync) is a set bound to the async context it runs in, so a
 * read lands in the recording of the code that made it, across awaits, and
 * never in a concurrent request's. Through 21.0 this was one module-level
 * set: correct only while every recorded computation was synchronous, which
 * is why a tool could record its chain run and not the page measurement or
 * verdict around it (both happen across awaits). startProvenanceRecording is
 * the one recording outside any context: a whole-process session for tests,
 * seen by any read that no scoped recording claims.
 */
const scoped = new AsyncLocalStorage<Set<string>>();
let session: Set<string> | null = null;
let overrides: Readonly<Record<string, number>> | null = null;

/** The recording a read made here lands in: the innermost scoped one, else the session, else none. */
function current(): Set<string> | null {
  return scoped.getStore() ?? session;
}

/** Read a registered constant. Throws on an unregistered id, so a typo cannot fall back silently. */
export function param(id: string): number {
  const e = MODEL_PROVENANCE[id];
  if (!e) throw new Error(`unregistered model constant "${id}"`);
  current()?.add(id);
  if (overrides && id in overrides) return overrides[id];
  return e.value;
}

/**
 * TEST ONLY: run `fn` with some registered constants replaced, then restore
 * them. It exists so tests/ctc-no-dead-constants.test.ts can perturb every
 * constant and check that the output moves; no shipped code may call it (a
 * test asserts that). Calls nest, the innermost value winning, and an
 * unregistered id throws exactly as param() does.
 */
export function withParamOverrides<T>(values: Record<string, number>, fn: () => T): T {
  for (const id of Object.keys(values)) {
    if (!MODEL_PROVENANCE[id]) throw new Error(`unregistered model constant "${id}"`);
  }
  const outer = overrides;
  overrides = { ...(outer ?? {}), ...values };
  try {
    return fn();
  } finally {
    overrides = outer;
  }
}

/**
 * The override set in force, or null outside withParamOverrides. A new object
 * on every override call, so a cache of anything derived from registered
 * constants (the CTC reference curve) can key on it by identity and is never
 * served across a change of constants. Read-only: never mutate it.
 */
export function activeOverrides(): Readonly<Record<string, number>> | null {
  return overrides;
}

/** Start recording which ids `param()` reads. Returns the live set. Test and reporting use only. */
export function startProvenanceRecording(): Set<string> {
  session = new Set();
  return session;
}

export function stopProvenanceRecording(): Set<string> {
  const r = session ?? new Set<string>();
  session = null;
  return r;
}

export interface ProvenanceSummary {
  counts: Record<ProvenanceStatus, number>;
  /** Ids of the hand-set constants the computation depended on. */
  hypotheses: string[];
  /** What the counts cover, so "0 fitted" is not read as "nothing in cbrowser is fitted". */
  scope: string;
  note: string;
}

/** What a block says it covers. Tools report the score's block with the defaults below. */
export interface ProvenanceText {
  scope?: string;
  note?: string;
}

/**
 * The score block's scope: what a tool's `modelProvenance` counts. The
 * attention maps a tool draws as context are recorded apart
 * (isolatedProvenanceAsync) and carry ATTENTION_PROVENANCE_TEXT instead.
 */
const SCORE_SCOPE =
  "Every registered constant the score in this answer read: the page-metric extraction that measured the page (pageMetrics.*), " +
  "the published laws that turn the page into seconds of pointing, choosing, reading and procedure for the reference user " +
  "(law.*: Fitts, novice visual search, Brysbaert's reading rate, the keystroke-level model) and the one time budget each is a " +
  "demand against (law.timeBudget, a hypothesis), the demand curves that turn the other page metrics into per-trait demand, " +
  "the cognitive transport chain (with its Schwartz value modulation " +
  "when values were applied), the reference set totalCTC is ranked against and the verdict bands cut on it (definitions), and the two " +
  "persona-distance constants the persona profile reads. It does not count the attention model: an attention map in this answer " +
  "(cognitive_effort's saliency overlay, visual_cognitive_story's attention analysis) is context for the page, not an input to the " +
  "score, and carries its own block for the attention model's constants: published colour science, the gaze constants fitted on " +
  "UEyes eye-tracking (held-out AUC 0.7367, GAZE_CALIBRATION) where a map applies them, and hand-set weights and filters.";

const SCORE_NOTE =
  "Constants labelled hypothesis are set by hand and untested against human data. This reports where each number comes from; " +
  "it is not a validation of the score. See MODEL_PROVENANCE for each source.";

/** The text of an attention map's own block. */
export const ATTENTION_PROVENANCE_TEXT: Readonly<Required<ProvenanceText>> = Object.freeze({
  scope:
    "Every registered constant the attention model read to draw this map. The model's constants are the colour-science conversion " +
    "(published: sRGB, CIE XYZ and L*a*b*), the gaze blend, smoothing width and spatial prior fitted on UEyes eye-tracking (held-out " +
    "AUC 0.7367, GAZE_CALIBRATION), and hand-set channel weights, element weights and persona filters (hypotheses); the counts say " +
    "which of them this map read. The map is context for the page, not an input to the cognitive transport score, whose constants " +
    "are counted in modelProvenance.",
  note:
    "Constants labelled fitted were estimated from free-viewing eye-tracking pooled over many people, so they say nothing about a " +
    "particular persona; those labelled hypothesis are set by hand. This reports where each number in the map comes from; it is " +
    "not a validation of the map. See MODEL_PROVENANCE for each source.",
});

/** Summarise a set of ids (what one computation read) for a tool response. */
/** The two reference rates a capacity is a ratio against; they cancel in c = r_p / (r_p + r_ref). */
const REFERENCE_RATE_IDS = new Set(["law.rate.pointing.reference", "law.reading.wpm"]);

export const PERSONA_RATE_PROVENANCE_TEXT: Readonly<Required<ProvenanceText>> = Object.freeze({
  scope:
    "The rates the scored persona's motor and reading capacities were computed from, counted apart from modelProvenance because " +
    "they describe the persona, not the score's constants. A built-in persona's are registered with it (personaRate.*); a custom " +
    "persona's are the rule it fell under (customRate.*), or, where it stated a reading profile, the fixation-model constants that " +
    "turn that profile into a rate (profile.*). Each capacity is c = r_p / (r_p + r_ref) against the reference rates " +
    "law.rate.pointing.reference and law.reading.wpm (published), which cancel in the ratio and are not counted here. The other " +
    "personas' rates are part of the reference population totalCTC is ranked against (a definition) and are not listed.",
  note:
    "A rate labelled published was measured on the persona's population against same-study controls; hypothesis rates include " +
    "\"no measured difference\", the reference rate given where no source measures one. See MODEL_PROVENANCE for each source.",
});

export interface PersonaRateProvenance extends ProvenanceSummary {
  /** Every rate id counted, sorted, so the published ones can be named as well as counted. */
  rates: string[];
}

/** The persona-rate section of an answer, from the ids collectPersonaReads returned for the scored persona's bridge. */
export function personaRateProvenance(ids: Iterable<string>): PersonaRateProvenance {
  const rates = [...new Set(ids)].filter((id) => MODEL_PROVENANCE[id] && !REFERENCE_RATE_IDS.has(id)).sort();
  return { ...provenanceSummary(rates, PERSONA_RATE_PROVENANCE_TEXT), rates };
}

export function provenanceSummary(ids: Iterable<string>, text: ProvenanceText = {}): ProvenanceSummary {
  const counts: Record<ProvenanceStatus, number> = { fitted: 0, published: 0, definition: 0, hypothesis: 0 };
  const hypotheses: string[] = [];
  for (const id of ids) {
    const e = MODEL_PROVENANCE[id];
    if (!e) continue;
    counts[e.status]++;
    if (e.status === "hypothesis") hypotheses.push(id);
  }
  hypotheses.sort();
  return {
    counts,
    hypotheses,
    scope: text.scope ?? SCORE_SCOPE,
    note: text.note ?? SCORE_NOTE,
  };
}

/**
 * Run `fn` and return the ids it read. Nests like withProvenance: the reads
 * also land in any enclosing recording. Used to remember what a cached value
 * was derived from, so a cache hit can record the same dependencies a miss
 * would have.
 */
export function readsOf<T>(fn: () => T): { result: T; ids: ReadonlySet<string> } {
  const outer = current();
  const mine = new Set<string>();
  try {
    return { result: scoped.run(mine, fn), ids: mine };
  } finally {
    if (outer) for (const id of mine) outer.add(id);
  }
}

/**
 * The persona models' own recording channel. Reads made by the persona models
 * in cognitive-models.ts (capacity rates, pointing and reading profiles, the
 * fixation model the readability audit shares) describe the persona or an
 * audit, not the score, so they never land in a score's recording: a score
 * block counts demand, chain, reference and distance. Without this, a block
 * would also count whichever personas the CTC reference curve happened to bridge
 * on a cache miss, and the motor and readability audits a tool runs beside its
 * score. A process-wide session (startProvenanceRecording) still sees them, as
 * with isolatedProvenanceAsync, since coverage tests count every read the
 * process makes. Overrides apply as usual.
 */
const personaCollector = new AsyncLocalStorage<Set<string>>();

/** Run `fn` as persona-model work: its reads go to the active collectPersonaReads set (if any) and the session, never to a score recording. */
export function personaScope<T>(fn: () => T): T {
  const mine = personaCollector.getStore() ?? new Set<string>();
  try {
    return scoped.run(mine, fn);
  } finally {
    if (session) for (const id of mine) session.add(id);
  }
}

/**
 * Run `fn` as persona-model work and return the ids it read. A tool wraps the
 * scored persona's bridge in this to report the rates that persona was scored
 * with in a section of their own: computed from the persona, so no cache state
 * can change it.
 */
export function collectPersonaReads<T>(fn: () => T): { result: T; ids: ReadonlySet<string> } {
  const mine = new Set<string>();
  const result = personaCollector.run(mine, () => personaScope(fn));
  return { result, ids: mine };
}

/**
 * Run `fn` and return its result with the provenance of every constant it read.
 *
 * Synchronous: it records what `fn` reads before returning, so an async `fn`
 * is recorded only up to its first await. Use withProvenanceAsync for that.
 */
export function withProvenance<T>(fn: () => T): { result: T; provenance: ProvenanceSummary } {
  const outer = current();
  const mine = new Set<string>();
  try {
    const result = scoped.run(mine, fn);
    return { result, provenance: provenanceSummary(mine) };
  } finally {
    if (outer) for (const id of mine) outer.add(id);
  }
}

/**
 * withProvenance for an async function: every param() read inside `fn`,
 * before and after each await, is recorded, and nothing read by code running
 * concurrently in another context is. Nests like withProvenance in both
 * directions: its reads land in any enclosing recording when it settles, and
 * withProvenance, readsOf or another withProvenanceAsync inside it land in it.
 *
 * Covers what `fn` awaits. Work it starts and does not await (a fire-and-forget
 * promise) can still read into this recording after the summary is taken, and
 * is then counted nowhere; a tool answer awaits everything it reports.
 */
export async function withProvenanceAsync<T>(fn: () => Promise<T>): Promise<{ result: T; provenance: ProvenanceSummary }> {
  const outer = current();
  const mine = new Set<string>();
  try {
    const result = await scoped.run(mine, fn);
    return { result, provenance: provenanceSummary(mine) };
  } finally {
    if (outer) for (const id of mine) outer.add(id);
  }
}

/**
 * withProvenanceAsync whose reads do NOT land in an enclosing recording: a
 * block of its own. For work a tool does beside its score, such as the
 * attention map cognitive_effort draws as context, whose constants (fitted
 * gaze calibration, published colour science) would otherwise be counted as
 * the score's and make it look partly fitted. Recordings nested inside it land
 * in it as usual. A process-wide session (startProvenanceRecording) still sees
 * its reads, since coverage tests count every read the process makes.
 */
export async function isolatedProvenanceAsync<T>(
  fn: () => Promise<T>,
  text: ProvenanceText = {},
): Promise<{ result: T; provenance: ProvenanceSummary }> {
  const mine = new Set<string>();
  try {
    const result = await scoped.run(mine, fn);
    return { result, provenance: provenanceSummary(mine, text) };
  } finally {
    if (session) for (const id of mine) session.add(id);
  }
}

/**
 * The provenance of the recording this code runs inside, as read so far, or
 * null outside any. A tool handler running under withProvenanceAsync calls it
 * as the last step before serialising its answer, so the block it reports is
 * everything that answer read. Nested recordings that have finished are
 * already merged into it; ones still running are not.
 */
export function activeProvenance(): ProvenanceSummary | null {
  const r = current();
  return r ? provenanceSummary(r) : null;
}
