/**
 * A persona's Schwartz scores, resolved the one way the transport chain takes
 * them, for every tool that offers useValues on a cognitive transport score.
 *
 * cognitive_effort carried this inline (bb54106). visual_cognitive_story
 * offered useValues too and never passed values to the chain, so its effort
 * summary ignored the flag while its description promised otherwise. Both now
 * resolve here, and both report what was found the same way.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { resolveValuesForPersona } from "../../values/persona-values.js";
import type { SchwartzValues } from "../../values/schwartz-values.js";

const SCHWARTZ_KEYS: Array<keyof SchwartzValues> = [
  "selfDirection", "stimulation", "hedonism", "achievement", "power",
  "security", "conformity", "tradition", "benevolence", "universalism",
];

/**
 * The ten Schwartz scores of a persona's values record, the shape the chain's
 * value modulation reads. A record carries higher-order values, SDT needs and
 * a Maslow level beside them; only the ten are passed on. Undefined when none
 * is a number, so "values applied" is never reported for an empty record.
 */
export function schwartzScores(values: object): Record<string, number> | undefined {
  const v = values as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const k of SCHWARTZ_KEYS) {
    if (typeof v[k] === "number" && Number.isFinite(v[k])) out[k] = v[k] as number;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * The persona's Schwartz scores for the chain, or undefined when none exist:
 * from the persona registry, the persona's own schwartzValues, its Big Five,
 * or, failing those, an account persona in the CMS (registered into the
 * caller's account store, as before). Never throws: a values lookup that fails
 * scores the page without values, and valueModulationReport says so.
 */
export async function resolveChainValues(personaName: string): Promise<Record<string, number> | undefined> {
  try {
    // regPV2 writes the caller's account store, not the process-wide registry. (tenant, 2026-10-10)
    const { registerAccountPersonaValues: regPV2, createPersonaValues: createPV2 } = await import("../../values/index.js");
    let pValues = resolveValuesForPersona(personaName);

    // Custom persona CMS fallback
    if (!pValues) {
      try {
        const { getSessionApiKey } = await import("./cognitive-tools.js"); const _sessionApiKey = getSessionApiKey();
        if (_sessionApiKey) {
          const cmsUrl = process.env.CMS_URL || "http://localhost:3200";
          const res = await fetch(`${cmsUrl}/api/personas`, { headers: { "Authorization": `Bearer ${_sessionApiKey}` } });
          if (res.ok) {
            const data = await res.json() as { personas: Array<{ name: string; slug: string; schwartz_values?: string }> };
            const match = data.personas.find((p: any) => p.slug === personaName || p.name.toLowerCase() === personaName.toLowerCase());
            if (match?.schwartz_values) {
              const sv = typeof match.schwartz_values === "string" ? JSON.parse(match.schwartz_values) : match.schwartz_values;
              const pv = createPV2(
                { selfDirection: sv.selfDirection ?? 0.5, stimulation: sv.stimulation ?? 0.5, hedonism: sv.hedonism ?? 0.5, achievement: sv.achievement ?? 0.5, power: sv.power ?? 0.5, security: sv.security ?? 0.5, conformity: sv.conformity ?? 0.5, tradition: sv.tradition ?? 0.5, benevolence: sv.benevolence ?? 0.5, universalism: sv.universalism ?? 0.5 },
                { autonomyNeed: sv.autonomyNeed ?? 0.5, competenceNeed: sv.competenceNeed ?? 0.5, relatednessNeed: sv.relatednessNeed ?? 0.5 },
                "esteem"
              );
              regPV2([{ personaName, values: pv, rationale: "Custom persona from CMS" }]);
              pValues = pv;
            }
          }
        }
      } catch { /* CMS fallback failed */ }
    }
    return pValues ? schwartzScores(pValues) : undefined;
  } catch {
    return undefined; // values not available: proceed without
  }
}

/** The `valueModulation` field: applied with the scores used, or why not. */
export function valueModulationReport(scores: Record<string, number> | undefined) {
  return scores
    ? { applied: true as const, scores }
    : { applied: false as const, reason: "No Schwartz values were found for this persona (registry, its own schwartzValues, its Big Five, or an account persona in the CMS), so it was scored without them." };
}
