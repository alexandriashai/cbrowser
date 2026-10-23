/**
 * Where a persona's trait values come from, in the compact form the persona
 * views render.
 *
 * Every built-in persona trait value is registered in MODEL_PROVENANCE as
 * `persona.<name>.<trait>`, status hypothesis: set by hand on a scale no
 * instrument defines (provenance/personas.ts). A custom persona's values were
 * set by whoever made it and are not registered at all. The persona views drew
 * both kinds as bare numbers on the same meters, which reads as measurement.
 *
 * Compact on purpose. persona_manager ships every persona's traits in one
 * result under the host's ~150k cap, and the registry's source text runs to
 * about 600 characters a value, so it stays in MODEL_PROVENANCE. What travels
 * is the status, the citation personas.ts places beside a value (evidence for
 * the direction of the persona's difference, never for the number), and which
 * shown values the persona does not set at all.
 *
 * The status is read from the registry per value, not assumed: a value the
 * registry records as something other than a hypothesis is named in
 * `statuses`, and the block's own status is then that status or "mixed".
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { MODEL_PROVENANCE, type ProvenanceEntry, type ProvenanceStatus } from "../visual/model-provenance.js";
import { PERSONA_TABLES } from "../visual/provenance/personas.js";

export const CUSTOM_LABEL = "custom (user-set)";

export interface TraitCitation {
  /** The source as personas.ts names it. */
  cite: string;
  /** What it is cited for, in personas.ts's own terms. */
  for: string;
}

export interface TraitProvenance {
  /**
   * The registry status every value this persona sets shares; "mixed" when
   * they differ (see `statuses`); custom: set by whoever made the persona.
   */
  status: ProvenanceStatus | "mixed" | "custom";
  label: string;
  note: string;
  /** Per trait, the citation beside the value. Built-in personas only. */
  cited?: Record<string, TraitCitation>;
  /** Shown traits the persona does not set: the value on screen is the model's default. */
  unset?: string[];
  /** Per trait, a registry status other than hypothesis. Absent while every value is a hypothesis. */
  statuses?: Record<string, ProvenanceStatus>;
}

/**
 * The sentence sourceFor() in provenance/personas.ts writes for a value with a
 * citation beside it. tests/trait-provenance.test.ts checks every registered
 * value against the registry's own list of cited values, so a change to that
 * sentence fails there rather than silently dropping every citation.
 */
const CITED = /Cited beside the value in personas\.ts: (.+?), for (.+?)\. That is a finding about direction/;

/** The citation a registry source names for one value, or undefined. */
export function citationOf(source: string): TraitCitation | undefined {
  const m = CITED.exec(source);
  return m ? { cite: m[1], for: m[2] } : undefined;
}

/**
 * True when `record` is the object the package ships under `name`.
 *
 * By identity, not by name: a custom persona saved under a built-in's name
 * shadows it wherever names resolve, and the registry describes the shipped
 * values, not the user's.
 */
export function isShippedPersona(name: string, record: unknown): boolean {
  if (!record) return false;
  return Object.values(PERSONA_TABLES).some((t) => (t as Record<string, unknown>)[name] === record);
}

function numericKeys(o: unknown): string[] {
  if (!o || typeof o !== "object") return [];
  return Object.keys(o).filter((k) => typeof (o as Record<string, unknown>)[k] === "number");
}

/** What a status means, in the words the block's note uses. */
const STATUS_GLOSS: Record<ProvenanceStatus, string> = {
  hypothesis: "set by hand and registered as a hypothesis",
  fitted: "fitted to named data",
  published: "taken from a cited published measurement",
  definition: "a definition of units or scale",
};

/**
 * The provenance block for one trait group of one persona.
 *
 * `shown` is what the view will draw, which may be more than the persona sets:
 * getCognitiveProfile fills the traits a persona leaves out with defaults.
 */
export function traitProvenance(
  name: string,
  record: unknown,
  shown: Record<string, unknown> | undefined,
  group: "cognitiveTraits" | "accessibilityTraits",
  /** The registry to read statuses from; tests pass a modified copy. */
  registry: Readonly<Record<string, ProvenanceEntry>> = MODEL_PROVENANCE,
): TraitProvenance {
  const rec = (record ?? {}) as Record<string, unknown>;
  const own = (group === "accessibilityTraits" ? rec.accessibilityTraits ?? rec.accessibility_traits : rec.cognitiveTraits) as
    Record<string, unknown> | undefined;
  const set = new Set(numericKeys(own));
  const unset = numericKeys(shown).filter((t) => !set.has(t)).sort();
  const unsetNote = unset.length
    ? ` ${unset.length} shown value${unset.length === 1 ? " is" : "s are"} the model's default, because this persona does not set ${unset.length === 1 ? "it" : "them"}.`
    : "";

  if (!isShippedPersona(name, record)) {
    return {
      status: "custom",
      label: CUSTOM_LABEL,
      note: `Set by whoever created this persona. Custom values are not registered in the model's provenance registry; cbrowser did not fit or measure them.${unsetNote}`,
      ...(unset.length ? { unset } : {}),
    };
  }

  const cited: Record<string, TraitCitation> = {};
  const statuses: Record<string, ProvenanceStatus> = {};
  const seen = new Set<ProvenanceStatus>();
  for (const t of set) {
    const e = registry[`persona.${name}.${t}`];
    if (!e) continue;
    seen.add(e.status);
    if (e.status !== "hypothesis") statuses[t] = e.status;
    const c = citationOf(e.source);
    if (c) cited[t] = c;
  }
  const status: TraitProvenance["status"] = seen.size === 1 ? [...seen][0] : seen.size === 0 ? "hypothesis" : "mixed";
  const others = Object.keys(statuses).length;
  const body = status === "mixed"
    ? `Built into the package. ${set.size - others} of ${set.size} values are ${STATUS_GLOSS.hypothesis}; the rest are named in statuses, each with its registry status.`
    : `Built into the package. Each value is ${STATUS_GLOSS[status as ProvenanceStatus]} (persona.${name}.<trait> in MODEL_PROVENANCE)${status === "hypothesis" ? ", with the measure that would test it" : ""}.`;
  return {
    status,
    label: status,
    note: `${body} A citation beside a value supports the direction of this persona's difference from typical users, not the number.${unsetNote}`,
    ...(Object.keys(cited).length ? { cited } : {}),
    ...(unset.length ? { unset } : {}),
    ...(others ? { statuses } : {}),
  };
}

export interface BuiltinTraitValue {
  persona: string;
  value: number;
  status: ProvenanceStatus;
  /** The citation beside the value and what it is cited for, as one line a table cell can hold. */
  citation?: string;
}

/**
 * Every built-in persona's value for one cognitive trait, lowest first, each
 * with its registry status and the citation beside it. The trait view shows
 * where the shipped personas sit on the scale it explains, and that each of
 * those places was set by hand, not measured.
 */
export function builtinTraitValues(
  trait: string,
  registry: Readonly<Record<string, ProvenanceEntry>> = MODEL_PROVENANCE,
): BuiltinTraitValue[] {
  const out: BuiltinTraitValue[] = [];
  for (const table of Object.values(PERSONA_TABLES)) {
    for (const [persona, def] of Object.entries(table as Record<string, { cognitiveTraits?: Record<string, unknown> }>)) {
      const v = def.cognitiveTraits?.[trait];
      if (typeof v !== "number") continue;
      const e = registry[`persona.${persona}.${trait}`];
      if (!e) continue;
      const c = citationOf(e.source);
      out.push({ persona, value: v, status: e.status, ...(c ? { citation: `${c.cite}, cited for ${c.for}` } : {}) });
    }
  }
  return out.sort((a, b) => a.value - b.value || a.persona.localeCompare(b.persona));
}

/**
 * What a trait's `researchBasis` covers, and what it does not, for the trait
 * view. The sentence about the built-in values is computed from their
 * statuses, so it cannot say "all hypotheses" once one is not.
 */
export function traitScaleNote(values: BuiltinTraitValue[]): string {
  const hyp = values.filter((v) => v.status === "hypothesis").length;
  const cited = values.filter((v) => v.citation).length;
  const where = values.length === 0
    ? "No built-in persona sets this trait."
    : hyp === values.length
      ? `All ${values.length} built-in personas' values on it are set by hand and registered as hypotheses${cited ? `; ${cited} cite a finding for the direction of the persona's difference, not for the number` : ""}.`
      : `${hyp} of the ${values.length} built-in personas' values on it are set by hand and registered as hypotheses; builtinValues gives each one's status.`;
  return "The scale source (researchBasis) names the work this trait's scale is drawn from: it says what the scale means. The level labels and behaviours were written by hand for cbrowser, and no instrument places a person on this 0-1 scale. " + where;
}
