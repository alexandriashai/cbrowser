/**
 * Load an account's custom personas from the CMS into the runtime registry.
 *
 * Custom personas created through the account live in the CMS `custom_personas`
 * table. The attention and journey code resolves personas through
 * `getAnyPersona`, which reads a GLOBAL directory on disk — so a persona created
 * through the MCP tool landed in the database and was invisible to every layer
 * that would use it. Observed: `alexa-eden` present in the table, absent from
 * disk, and silently replaced by a generic profile at analysis time.
 *
 * WHY THIS IS NOT A DISK SYNC. The obvious fix — write every DB persona into the
 * persona directory — is wrong on a hosted server. That directory is global and
 * the table is per-account, so syncing would let one customer address another
 * customer's personas by name. These are loaded into an in-memory registry keyed
 * by account and read only through that account's request scope
 * (registerAccountPersonas), and never written to disk.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import type { Persona } from "../types.js";
import { registerAccountPersonas } from "../personas.js";
import { scopedAccountId } from "../persona-scope.js";

/** Shape the CMS returns for a custom persona. */
interface CmsPersona {
  name: string;
  description?: string;
  traits?: Record<string, number> | string;
  schwartz_values?: Record<string, number> | string | null;
  accessibility_traits?: Record<string, number> | string | null;
  age_range?: string | null;
}

function parseMaybeJson<T>(v: unknown): T | undefined {
  if (v == null) return undefined;
  if (typeof v === "object") return v as T;
  try { return JSON.parse(String(v)) as T; } catch { return undefined; }
}

/**
 * Timing envelope for a persona the CMS does not store one for.
 *
 * humanBehavior is not a CMS column, and a persona missing it reaches
 * getCognitiveProfile half-formed — the same floor the JSON loader applies.
 */
const DEFAULT_HUMAN_BEHAVIOR = {
  timing: {
    reactionTime: { min: 500, max: 1500 },
    clickDelay: { min: 300, max: 800 },
    typeSpeed: { min: 120, max: 260 },
  },
} as const;

/** Convert a CMS row into the Persona shape the registry expects. */
export function cmsPersonaToPersona(row: CmsPersona): Persona {
  const traits = parseMaybeJson<Record<string, number>>(row.traits) ?? {};
  const values = parseMaybeJson<Record<string, number>>(row.schwartz_values);
  const access = parseMaybeJson<Record<string, number>>(row.accessibility_traits);

  return {
    name: row.name,
    description: row.description ?? "",
    demographics: {
      age_range: row.age_range ?? "any",
      tech_level: "intermediate",
      device: "desktop",
    },
    behaviors: {},
    humanBehavior: DEFAULT_HUMAN_BEHAVIOR,
    cognitiveTraits: traits,
    ...(values ? { schwartzValues: values } : {}),
    ...(access ? { accessibilityTraits: access } : {}),
    context: {},
  } as unknown as Persona;
}

/**
 * Fetch and register the authenticated account's custom personas.
 *
 * Fire-and-forget in spirit: a failure means the caller falls back to disk and
 * built-ins, which is the behaviour that existed before this module. Returns the
 * names registered so a caller can report what became addressable.
 */
export async function loadAccountPersonas(apiKey: string | undefined): Promise<string[]> {
  if (!apiKey) return [];
  // No account scope, nowhere safe to put them: the registry is read through
  // the request's scope, and an unscoped write would have to be process-wide,
  // which is the cross-tenant read this module promised not to create and did
  // (RUNTIME_PERSONAS, 2026-08-01 to 2026-10-09).
  const accountId = scopedAccountId();
  if (accountId === undefined) return [];
  const cmsUrl = process.env.CMS_URL || "http://localhost:3200";
  try {
    const res = await fetch(`${cmsUrl}/api/personas`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json() as { personas?: CmsPersona[] } | CmsPersona[];
    const rows = Array.isArray(data) ? data : (data.personas ?? []);
    if (rows.length === 0) return [];

    const personas = rows
      .filter((r) => r && typeof r.name === "string" && r.name.length > 0)
      .map(cmsPersonaToPersona);
    registerAccountPersonas(accountId, personas);
    return personas.map((p) => p.name);
  } catch {
    return [];
  }
}
