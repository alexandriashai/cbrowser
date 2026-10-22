/**
 * Dump the current trait values of the population-named built-in personas, so
 * the norm-implied values in README.md sit next to what src/personas.ts says on
 * this tree rather than a copy typed by hand.
 *
 *   bun research/persona-norms/dump-personas.ts        # JSON on stdout
 */
import { ACCESSIBILITY_PERSONAS, BUILTIN_PERSONAS } from "../../src/personas.js";
import { COGNITIVE_TRAITS } from "../../src/visual/cognitive-transport.js";
import { bridgeCapacityTraits } from "../../src/visual/cognitive-models.js";

const NAMED = [
  "cognitive-adhd", "dyslexic-user", "elderly-user", "elderly-low-vision",
  "motor-impairment-tremor", "low-vision-magnified", "deaf-user",
  "color-blind-deuteranopia", "autism-spectrum", "intellectual-disability",
  "aphasia-receptive", "dyscalculia",
];

const out: Record<string, unknown> = {};
for (const name of NAMED) {
  const p: any = (ACCESSIBILITY_PERSONAS as any)[name] ?? (BUILTIN_PERSONAS as any)[name];
  if (!p) { out[name] = null; continue; }
  const traits: Record<string, number> = { ...(p.cognitiveTraits ?? p.cognitive ?? {}) };
  bridgeCapacityTraits(name, traits, p.accessibilityTraits);
  out[name] = {
    source: (ACCESSIBILITY_PERSONAS as any)[name] ? "ACCESSIBILITY_PERSONAS" : "BUILTIN_PERSONAS",
    ageRange: p.demographics?.age_range,
    traits,
    accessibilityTraits: p.accessibilityTraits ?? null,
  };
}
out._traitOrder = [...COGNITIVE_TRAITS];
console.log(JSON.stringify(out, null, 2));
