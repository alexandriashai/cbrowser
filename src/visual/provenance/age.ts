/**
 * Provenance for what a persona's stated age changes (src/persona-age.ts and
 * the description generator in src/personas.ts). See ../model-provenance.ts
 * for the statuses.
 *
 * Age is not a trait. It is a stated fact that sets defaults for the
 * capacities with a published age direction, and an author's stated trait
 * always overrides them. Older age reaches pointing and reading through the
 * elderly profile entries (provenance/profiles.ts, persona-rates.ts) and
 * working memory through the entry below. Until 21.0.1 the generator also
 * capped 13 other traits for anyone it guessed was 65+ (patience, risk
 * tolerance, comprehension, reading tendency, resilience, information
 * foraging, change blindness, anchoring, attribution style, procedural
 * fluency, transfer learning, authority sensitivity, mental-model
 * flexibility); none had a source, and they are gone.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { ProvenanceEntry } from "../model-provenance.js";

export const AGE_PROVENANCE: ProvenanceEntry[] = [
  {
    id: "age.olderAdult.threshold",
    value: 65,
    status: "definition",
    source: "The age at or above which a persona counts as an older adult, the conventional 65 used by the cited aging studies and by the built-in elderly personas' 65+ age range. An encoding choice, not an empirical claim.",
  },
  {
    id: "age.olderAdult.workingMemory",
    value: 0.35,
    status: "hypothesis",
    source: "The highest working memory a generated older-adult persona takes when its description states nothing higher, on the 0-1 trait scale. Direction: Park, Lautenschlager, Hedden, Davidson, Smith & Smith (2002), Models of visuospatial and verbal memory across the adult life span, Psychology and Aging 17(2), 299-320 (PubMed 12061414; 345 adults): \"Beginning in the 20s, a continuous, regular decline occurs for processing-intensive tasks (e.g., speed of processing, working memory, and long-term memory), whereas verbal knowledge increases across the life span.\" The value 0.35 is hand-set, kept from the generator. The percentile of adults 65+ on general-adult working-memory norms (e.g. WAIS-IV Digit Span) would set it.",
  },
];

/**
 * An age entry's value. The description generator (src/personas.ts) cannot go
 * through param(): model-provenance.ts imports the persona tables from
 * personas.ts, so a param() import there is a load-order cycle. The value
 * still lives only here, so the registry and the code cannot disagree, but a test
 * that perturbs registry values does not reach it.
 */
export function ageValue(id: "age.olderAdult.threshold" | "age.olderAdult.workingMemory"): number {
  const e = AGE_PROVENANCE.find((x) => x.id === id);
  if (!e) throw new Error(`age provenance: ${id} is not registered`);
  return e.value;
}
