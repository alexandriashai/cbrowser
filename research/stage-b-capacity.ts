/**
 * Persona capacities on the Stage B time scale, beside today's bridged values:
 * c = r_p / (r_p + r_ref), the persona's rate against the reference persona's
 * rate (research/stage-b-design.md, "Unit coherence"). Pointing rate is the
 * pointing profile's Fitts throughput; reading rate is the inverse of the
 * reading profile's per-word time from its text-independent terms (base,
 * phonological, visual span), each from src/visual/cognitive-models.ts as it
 * stands. Prototype for the design note, not product code.
 *
 *   bun research/stage-b-capacity.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { BUILTIN_PERSONAS, ACCESSIBILITY_PERSONAS, EMOTIONAL_PERSONAS } from "../src/personas.js";
import {
  bridgeCapacityTraits, getPointingProfile, getReadingProfile, KNOWN_POINTING_PROFILES, KNOWN_READING_PROFILES,
} from "../src/visual/cognitive-models.js";

type P = { cognitiveTraits?: Record<string, number>; accessibilityTraits?: Record<string, number> };
const roster = { ...BUILTIN_PERSONAS, ...ACCESSIBILITY_PERSONAS, ...EMOTIONAL_PERSONAS } as Record<string, P>;

// The per-word time terms of computeReadingDifficulty that do not depend on the text.
const wordMs = (p: { phonological: number; visualSpan: number }) => 250 + (1 - p.phonological) * 100 + Math.max(0, 7 / p.visualSpan - 1) * 80;
const tpRef = KNOWN_POINTING_PROFILES.neurotypical.throughput;
const msRef = wordMs(KNOWN_READING_PROFILES.neurotypical);

console.log(["persona", "TP", "motor old", "motor new", "ms/word", "reading old", "reading new"].join("\t"));
for (const [name, p] of Object.entries(roster)) {
  const traits = { ...(p.cognitiveTraits ?? {}) } as Record<string, number>;
  bridgeCapacityTraits(name, traits, p.accessibilityTraits);
  const tp = getPointingProfile({ name, traits }).throughput;
  const ms = wordMs(getReadingProfile({ name, traits, accessibilityTraits: p.accessibilityTraits }));
  console.log([name, tp.toFixed(2), traits.motorCapacity.toFixed(3), (tp / (tp + tpRef)).toFixed(3),
    ms.toFixed(0), traits.readingCapacity.toFixed(3), (msRef / (msRef + ms)).toFixed(3)].join("\t"));
}
