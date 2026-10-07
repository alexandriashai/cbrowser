/**
 * Updating and deleting personas.
 *
 * WHY THESE EXIST
 *
 * There were fourteen persona tools and every one of them either read a persona
 * or created a new one. Nothing could correct a persona and nothing could remove
 * one. A declaration found to be wrong — `sofia-mobile-navigator` carried
 * attentionPattern "thorough" while its own description said "short attention,
 * skims" — could only be fixed by hand-editing JSON in two stores, which is not
 * a thing a user of the MCP server can do at all.
 *
 * A create-only API does not mean personas never change. It means they change
 * outside the system, unrecorded, in whichever store the person editing happened
 * to know about.
 *
 * TWO STORES, ONE WRITE
 *
 * Personas live in the file store the package reads AND in the CMS
 * `custom_personas` table. Writing one and not the other is the single most
 * repeated defect in this subsystem: it produced a roster serving pre-tanh
 * values against a lookup serving post-tanh ones, and personas that appeared in
 * the roster and 404'd on lookup. Both tools here write both, and say which
 * writes landed rather than reporting success on a partial one.
 *
 * MERGE, NEVER REBUILD
 *
 * An update patches the fields it was given and leaves everything else. The
 * mirror learned this the hard way: rebuilding a persona file from known fields
 * dropped `humanBehavior`, and with it the attention pattern that decides how
 * the persona reads a page — a behaviour change disguised as a data refresh.
 *
 * @since 2026-08-01
 */
import { z } from "zod";
import type { McpServer } from "./types.js";
import { widgetUri } from "./widget-kit.js";
import { diffPersona, describeDrift, summariseTraits } from "../values/persona-diff.js";
import { TRAIT_INFERENCE_CRITERIA, ALL_TRAITS } from "../values/persona-completeness.js";
import { BIG_FIVE_INFERENCE_ANCHORS } from "../values/big-five-inference.js";

const CMS_URL = () => process.env.CMS_URL || "http://localhost:3200";

function slugFor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Push a change to the CMS. Reports the outcome rather than swallowing it. */
async function writeCms(
  method: "PUT" | "DELETE",
  slug: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; detail: string }> {
  const { getSessionApiKey } = await import("./base/cognitive-tools.js");
  const apiKey = getSessionApiKey();
  if (!apiKey) return { ok: false, detail: "no API key in session — the CMS copy was NOT updated" };
  try {
    const res = await fetch(`${CMS_URL()}/api/personas/${slug}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.ok) return { ok: true, detail: `CMS ${method.toLowerCase()} ok` };
    return { ok: false, detail: `CMS returned ${res.status}: ${(await res.text().catch(() => "")).slice(0, 120)}` };
  } catch (e) {
    return { ok: false, detail: `CMS unreachable: ${(e as Error).message}` };
  }
}

export function registerPersonaLifecycleTools(server: McpServer): void {
  server.registerTool("persona_manager", {
    title: "Manage Personas",
    description:
      "ONE interactive surface for persona CRUD: browse every persona, edit its cognitive traits with sliders, save, and delete — all in the returned view. "
      + "Call this instead of chaining list_cognitive_personas, persona_lookup, persona_update and persona_delete by hand. "
      + "Reads ship with the result; edits are written back through persona_update and persona_delete.",
    inputSchema: {
      filter: z.enum(["all", "custom", "builtin"]).optional().default("custom")
        .describe("Which personas to load. Defaults to custom, the ones that can be edited."),
    },
    annotations: { title: "Manage Personas", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: widgetUri("persona-manager") } },
  }, async ({ filter }) => {
    const { listPersonas, getAnyPersona, isBuiltinPersona, loadCustomPersonas } = await import("../personas.js");
    const { resolvePersonaValues } = await import("./base/values-tools.js");

    const names = new Set<string>();
    try { (listPersonas() as Array<{ name?: string } | string>).forEach((p) => {
      const n = typeof p === "string" ? p : p?.name; if (n) names.add(n);
    }); } catch { /* builtin roster unavailable; customs below still load */ }
    const fileNames = new Set<string>();
    try { Object.keys(loadCustomPersonas()).forEach((n) => { names.add(n); fileNames.add(n); }); } catch { /* no custom store */ }

    // BOTH stores, not just the file one.
    //
    // This read only loadCustomPersonas, so every persona that exists in the
    // CMS and not on disk was silently absent from a tool whose whole job is
    // showing you what exists -- on this install that was 5 of 11, and the
    // roster looked like a reconciled 7 rather than a divergence. A manager
    // that under-reports is worse than no manager: it answers the question
    // "what personas do I have" wrongly and confidently.
    const cmsNames = new Set<string>();
    try {
      const { fetchCustomPersonasFromCMS, getSessionApiKey } = await import("./base/cognitive-tools.js");
      const rows = await fetchCustomPersonasFromCMS(getSessionApiKey());
      (rows ?? []).forEach((r: { name?: string }) => {
        if (r?.name) { names.add(r.name); cmsNames.add(r.name); }
      });
    } catch { /* CMS unreachable or unauthenticated; the divergence note says so */ }

    const want = filter ?? "custom";
    const personas = [...names]
      .filter((n) => want === "all" || (want === "builtin" ? isBuiltinPersona(n) : !isBuiltinPersona(n)))
      .map((name) => {
        const p = getAnyPersona(name) as unknown as Record<string, unknown> | undefined;
        if (!p) return null;
        let valuesRoute: string | undefined;
        try { valuesRoute = resolvePersonaValues(name).source; } catch { /* leave unlabelled */ }
        return {
          name,
          description: (p.description as string) ?? "",
          // The whole trait map travels with the result so switching personas
          // in the view is instant. Only writes go back to the server.
          traits: (p.cognitiveTraits ?? {}) as Record<string, number>,
          builtin: isBuiltinPersona(name),
          ...(valuesRoute ? { valuesRoute } : {}),
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(a!.name).localeCompare(String(b!.name)));

    const editable = personas.filter((p) => !p!.builtin).length;
    const fileOnly = [...fileNames].filter((n) => !cmsNames.has(n));
    const cmsOnly = [...cmsNames].filter((n) => !fileNames.has(n));
    return { content: [{ type: "text" as const, text: JSON.stringify({
      personas,
      summary: `${personas.length} persona(s), ${editable} editable`
        + (fileOnly.length || cmsOnly.length ? ` — ${fileOnly.length + cmsOnly.length} in only one store` : ""),
      // Divergence is a first-class field, not something a reader infers from a
      // count that looks plausible.
      ...(fileOnly.length || cmsOnly.length ? {
        storeDivergence: {
          fileStoreOnly: fileOnly, cmsOnly,
          note: "These personas exist in one store and not the other. A tool reading the store that lacks one will report it missing; a tool reading the other will resolve it. Writes that touch only one store are how this happens — persona_create_submit_traits reports a partial write as a failure for exactly this reason.",
        },
      } : {}),
      ...(cmsNames.size === 0 ? {
        cmsUnavailable: "No personas were read from the CMS — it is unreachable, or this session's credential is not one the CMS accepts (an OAuth connector token is not a cbk_ account key). The roster below is the file store only.",
      } : {}),
      editable,
      // Creation is not in this view on purpose: it needs the description read
      // and the completeness contract, which is a conversation rather than a
      // form. Named here so the path is obvious rather than missing.
      // Everything the create/update forms need, shipped with the roster so no
      // mode change costs a round trip.
      traitCriteria: TRAIT_INFERENCE_CRITERIA,
      allTraits: ALL_TRAITS,
      bigFiveFactors: Object.entries(BIG_FIVE_INFERENCE_ANCHORS).map(([factor, a]) => ({
        factor, low: a.low, high: a.high, doNotConfuse: a.doNotConfuse,
      })),
      modes: {
        description: {
          label: "From a description",
          completesInWidget: false,
          // Stated rather than hidden behind a spinner that never resolves:
          // inferring traits from prose needs a model, and there is none in
          // the sandbox. The form composes the request instead.
          note: "Needs a model to read the text and infer traits, which the widget cannot do. Submitting hands the description to the conversation, and the assistant completes it through persona_create_from_description.",
        },
        survey: {
          label: "From a survey",
          completesInWidget: true,
          note: "Set the traits you know; the rest take research-backed defaults. Writes immediately.",
        },
        bigfive: {
          label: "From Big Five",
          completesInWidget: true,
          note: "Five personality factors. Reaches all thirteen motivational values through published correlations, where the trait route reaches nine.",
        },
      },
      createHint: "Three ways in: a description (the assistant infers traits), a survey (set traits directly), or a Big Five profile (five factors, all thirteen values). Built-in personas are read-only — they ship with the package and are shared by every install.",
    }, null, 2) }] };
  });

  server.registerTool("persona_update", {
    title: "Update Persona",
    description:
      "Patch an existing custom persona: traits, description, accessibility traits, Big Five, attention pattern, demographics. "
      + "Only the fields you pass are changed; everything else is preserved. Writes BOTH the file store and the CMS. "
      + "Built-in personas cannot be modified.",
    inputSchema: {
      persona_name: z.string().describe("Name of the persona to update"),
      traits: z.record(z.string(), z.number()).optional().describe("Partial trait map — merged over existing traits, not replacing them"),
      description: z.string().optional(),
      attentionPattern: z.enum(["targeted", "f-pattern", "z-pattern", "exploratory", "sequential", "thorough", "skim"]).optional()
        .describe("Declared attention pattern. This DRIVES runtime behaviour and overrides what the traits imply, so set it deliberately — persona_lookup reports when it disagrees with the trait vector."),
      accessibilityTraits: z.record(z.string(), z.unknown()).optional(),
      bigFive: z.object({
        openness: z.number().min(0).max(1), conscientiousness: z.number().min(0).max(1),
        extraversion: z.number().min(0).max(1), agreeableness: z.number().min(0).max(1),
        neuroticism: z.number().min(0).max(1),
      }).optional().describe("Supplying this moves the persona to the big_five values route, reaching all 13 motivational axes instead of 9. If you are INFERRING these from the persona's description rather than supplying measured scores, pass bigFiveEvidence too — it is checked against the description."),
      bigFiveEvidence: z.array(z.object({
        factor: z.string(), score: z.number().min(0).max(1),
        quote: z.string().describe("The words in the persona's description justifying this score"),
      })).optional().describe("Quotes justifying an INFERRED profile, verified against the stored description. Omit only when the scores were measured or supplied by a person rather than read out of the text."),
      ageRange: z.string().optional(),
      techLevel: z.enum(["beginner", "intermediate", "expert"]).optional(),
    },
    annotations: { title: "Update Persona", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: { ui: { resourceUri: widgetUri("persona-updated") } },
  }, async ({ persona_name, traits, description, attentionPattern, accessibilityTraits, bigFive, bigFiveEvidence, ageRange, techLevel }) => {
    // Destructured in the parameter list, not the body: a repo test statically
    // reads the handler signature to prove every declared argument is actually
    // bound, and a body-level destructure is invisible to it. The convention is
    // load-bearing rather than stylistic.
    const { getAnyPersona, isBuiltinPersona, saveCustomPersona, registerPersonas } = await import("../personas.js");

    if (isBuiltinPersona(persona_name)) {
      return {isError: true,  content: [{ type: "text" as const, text: JSON.stringify({
        error: "builtin_persona",
        message: `"${persona_name}" is built into the package. Built-ins are shared by every install and are not editable; create a custom persona instead.`,
        written: false,
      }, null, 2) }] };
    }

    const existing = getAnyPersona(persona_name) as unknown as Record<string, unknown> | undefined;
    if (!existing) {
      return {isError: true,  content: [{ type: "text" as const, text: JSON.stringify({
        error: "not_found",
        message: `No persona named "${persona_name}". list_cognitive_personas returns the roster.`,
        written: false,
      }, null, 2) }] };
    }

    // Snapshot BEFORE the merge. A diff needs both sides, and the object is
    // mutated in place from here on.
    const before = JSON.parse(JSON.stringify(existing)) as Record<string, unknown>;

    // Merge. The fields not named here are carried through untouched, which is
    // the whole contract of an update as opposed to a re-create.
    const updated: Record<string, unknown> = { ...existing };
    const changed: string[] = [];
    if (traits) {
      updated.cognitiveTraits = { ...(existing.cognitiveTraits as object ?? {}), ...traits };
      changed.push(`traits(${Object.keys(traits).join(",")})`);
    }
    if (description !== undefined) { updated.description = description; changed.push("description"); }
    if (accessibilityTraits) {
      updated.accessibilityTraits = { ...(existing.accessibilityTraits as object ?? {}), ...accessibilityTraits };
      changed.push("accessibilityTraits");
    }
    if (attentionPattern) {
      const hb = { ...(existing.humanBehavior as Record<string, unknown> ?? {}) };
      hb.attention = { ...((hb.attention as object) ?? {}), pattern: attentionPattern };
      updated.humanBehavior = hb;
      changed.push("attentionPattern");
    }
    if (ageRange || techLevel) {
      updated.demographics = {
        ...(existing.demographics as object ?? {}),
        ...(ageRange ? { age_range: ageRange } : {}),
        ...(techLevel ? { tech_level: techLevel } : {}),
      };
      changed.push(ageRange && techLevel ? "demographics" : ageRange ? "ageRange" : "techLevel");
    }
    let valuesRoute: string | undefined;
    if (bigFive) {
      // The same gate as the creation path.
      //
      // persona_update took a Big Five profile with no evidence field at all,
      // so the quote check on persona_create_submit_traits could be walked
      // around entirely: infer a profile nobody can check, launder it through
      // update, and it stores as `big_five` -- the route that outranks the one
      // the evidence gate protects. An unchecked path defeats a checked one.
      //
      // Evidence is required only when the caller SAYS it is inferred, by
      // passing bigFiveEvidence. Scores a person measured are legitimately
      // unquotable, and demanding a quote for them would push honest callers
      // into inventing one. (2026-08-01)
      if (bigFiveEvidence?.length) {
        const { validateInferredBigFive } = await import("../values/big-five-inference.js");
        const verdict = validateInferredBigFive(
          bigFive as Record<string, number>,
          bigFiveEvidence,
          (existing.description as string | undefined),
        );
        if (!verdict.ok) {
          return {isError: true,  content: [{ type: "text" as const, text: JSON.stringify({
            error: "unverified_big_five", message: verdict.reason, written: false,
          }, null, 2) }] };
        }
      }
      const { deriveValuesFromBigFive } = await import("../values/big-five-values.js");
      const d = deriveValuesFromBigFive(bigFive);
      updated.bigFive = bigFive;
      updated.schwartzValues = d.values;
      // The route records HOW, so an inferred profile does not store as a
      // supplied one just because it came through update.
      updated.valuesDerivation = {
        method: bigFiveEvidence?.length ? "bigfive_inferred" : "big_five",
        squash: "tanh", precision: 3,
        ...(bigFiveEvidence?.length ? { inferredFrom: "description", evidence: bigFiveEvidence } : {}),
        recordedAt: new Date().toISOString().slice(0, 10),
      };
      valuesRoute = bigFiveEvidence?.length ? "bigfive_inferred" : "big_five";
      changed.push("bigFive+values");
    }

    if (!changed.length) {
      return {isError: true,  content: [{ type: "text" as const, text: JSON.stringify({
        error: "nothing_to_update",
        message: "No updatable field was supplied. Pass at least one of: traits, description, attentionPattern, accessibilityTraits, bigFive, ageRange, techLevel.",
        written: false,
      }, null, 2) }] };
    }

    const filePath = saveCustomPersona(updated as never);
    registerPersonas([updated as never]);
    const cms = await writeCms("PUT", slugFor(persona_name), {
      ...(traits ? { traits: updated.cognitiveTraits } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(accessibilityTraits ? { accessibility_traits: updated.accessibilityTraits } : {}),
      ...(bigFive ? { schwartz_values: updated.schwartzValues, big_five: bigFive,
                      values_derivation: updated.valuesDerivation } : {}),
    });

    // What actually moved, and whether the prose still describes it.
    const changes = diffPersona(before, updated);
    const afterTraits = updated.cognitiveTraits as Record<string, number> | undefined;
    const drift = describeDrift(updated.description as string | undefined, afterTraits);

    return { content: [{ type: "text" as const, text: JSON.stringify({
      persona: persona_name,
      changed,
      // Rendered by the persona-updated widget as a before/after table.
      changes: changes.map((c) => ({
        field: c.field,
        before: typeof c.before === "object" ? JSON.stringify(c.before)?.slice(0, 60) : c.before,
        after: typeof c.after === "object" ? JSON.stringify(c.after)?.slice(0, 60) : c.after,
        ...(c.delta !== undefined ? { delta: c.delta } : {}),
      })),
      traits: afterTraits,
      traitSummary: summariseTraits(afterTraits),
      // The description is NOT rewritten. Someone wrote it and it carries
      // intent the numbers cannot; regenerating prose from a vector is the
      // same overreach as overwriting stated values with a derivation. The
      // contradictions are named and the decision left where it belongs.
      ...(drift.length ? {
        descriptionDrift: drift.map((d) => ({ trait: d.trait, phrase: d.phrase, nowIs: d.nowIs })),
        descriptionDriftNote: `The description still makes ${drift.length} claim(s) the updated traits contradict: `
          + drift.map((d) => d.note).join("; ")
          + `. The description was not rewritten — pass \`description\` to update it, or leave it if the prose is right and the traits are wrong.`,
      } : {}),
      stores: { fileStore: "written", cms: cms.ok ? "written" : "NOT written" },
      ...(valuesRoute ? { valuesRoute } : {}),
      fileStore: { written: true, path: filePath },
      cms,
      // Both stores are named explicitly. A persona updated in one and not the
      // other is the recurring failure in this subsystem, and it is invisible
      // unless the response says which writes actually landed.
      note: cms.ok
        ? "Both stores updated."
        : "File store updated; the CMS copy was NOT. They now disagree — re-run with a session API key.",
    }, null, 2) }] };
  });

  server.registerTool("persona_delete", {
    title: "Delete Persona",
    description:
      "Delete a custom persona from both the file store and the CMS. Requires confirm:true. Built-in personas cannot be deleted.",
    inputSchema: {
      persona_name: z.string().describe("Name of the persona to delete"),
      confirm: z.boolean().describe("Must be true. Deletion removes the persona from both stores and cannot be undone from here."),
    },
    annotations: { title: "Delete Persona", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ persona_name, confirm }) => {
    const { getAnyPersona, isBuiltinPersona, deleteCustomPersona } = await import("../personas.js");

    if (isBuiltinPersona(persona_name)) {
      return {isError: true,  content: [{ type: "text" as const, text: JSON.stringify({
        error: "builtin_persona",
        message: `"${persona_name}" is built into the package and is shared by every install. Built-ins are not deletable.`,
        deleted: false,
      }, null, 2) }] };
    }
    // An explicit confirm, because this is the only tool in the persona surface
    // that destroys something and the caller is usually a model.
    if (!confirm) {
      const p = getAnyPersona(persona_name) as unknown as Record<string, unknown> | undefined;
      return { content: [{ type: "text" as const, text: JSON.stringify({
        error: "confirmation_required",
        message: `Deleting "${persona_name}" removes it from the file store and the CMS. Re-send with confirm:true.`,
        wouldDelete: p ? { name: persona_name, description: p.description } : "(no such persona)",
        deleted: false,
      }, null, 2) }] };
    }
    if (!getAnyPersona(persona_name)) {
      return {isError: true,  content: [{ type: "text" as const, text: JSON.stringify({
        error: "not_found", message: `No persona named "${persona_name}".`, deleted: false,
      }, null, 2) }] };
    }

    const fileDeleted = deleteCustomPersona(persona_name);
    const cms = await writeCms("DELETE", slugFor(persona_name));
    return { content: [{ type: "text" as const, text: JSON.stringify({
      persona: persona_name,
      fileStore: { deleted: fileDeleted },
      cms,
      note: fileDeleted && cms.ok
        ? "Removed from both stores."
        : "Partially removed — the stores now disagree. A persona left in one store still resolves through the tools that read it.",
    }, null, 2) }] };
  });
}
