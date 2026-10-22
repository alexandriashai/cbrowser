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

export type ProvenanceStatus = "fitted" | "published" | "definition" | "hypothesis";

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
  index(CHAIN_PROVENANCE, DISTANCE_PROVENANCE, DRO_PROVENANCE, PERSONA_PROVENANCE, CIF_PROVENANCE),
);

let recording: Set<string> | null = null;
let overrides: Readonly<Record<string, number>> | null = null;

/** Read a registered constant. Throws on an unregistered id, so a typo cannot fall back silently. */
export function param(id: string): number {
  const e = MODEL_PROVENANCE[id];
  if (!e) throw new Error(`unregistered model constant "${id}"`);
  if (recording) recording.add(id);
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

/** Start recording which ids `param()` reads. Returns the live set. Test and reporting use only. */
export function startProvenanceRecording(): Set<string> {
  recording = new Set();
  return recording;
}

export function stopProvenanceRecording(): Set<string> {
  const r = recording ?? new Set<string>();
  recording = null;
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

/** Summarise a set of ids (what one computation read) for a tool response. */
export function provenanceSummary(ids: Iterable<string>): ProvenanceSummary {
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
    scope: "Constants of the cognitive transport chain and the persona distance. The attention model (Layer 1) is calibrated separately against UEyes eye-tracking (held-out AUC 0.7367, GAZE_CALIBRATION) and is not counted here.",
    note: "Constants labelled hypothesis are set by hand and untested against human data. This reports where each number comes from; it is not a validation of the score. See MODEL_PROVENANCE for each source.",
  };
}

/** Run `fn` and return its result with the provenance of every constant it read. */
export function withProvenance<T>(fn: () => T): { result: T; provenance: ProvenanceSummary } {
  const outer = recording;
  const mine = new Set<string>();
  recording = mine;
  try {
    const result = fn();
    return { result, provenance: provenanceSummary(mine) };
  } finally {
    if (outer) for (const id of mine) outer.add(id);
    recording = outer;
  }
}
