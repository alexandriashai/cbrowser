/**
 * CBrowser MCP Tools - Persona Comparison Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import { writeArtifact } from "../../artifact-store.js";
import { buildContentWithPreviews } from "../inline-image.js";
import { makeTempDir, type CallTempDir } from "../../temp-files.js";
import { scopeProse } from "../../visual/scope-prose.js";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import { refuseHostedUrl } from "../hosted-inputs.js";
import { comparePersonas } from "../../analysis/index.js";
import { isApiKeyConfigured } from "../../cognitive/index.js";
import {
  getAnyPersona,
  resolvePersonaOrThrow,
  getCognitiveProfile,
  createCognitivePersona,
  isAgentPersonaObject,
  BUILTIN_PERSONAS,
  ACCESSIBILITY_PERSONAS,
  EMOTIONAL_PERSONAS,
} from "../../personas.js";
import type { Persona, AccessibilityPersona, CognitiveState } from "../../types.js";
import {
  buildOTCognitiveProfile as buildOTProfile,
  cognitiveDistance,
  cognitiveBarycenter,
  cognitiveGeodesic,
  cognitiveDistanceMatrix,
  selectMaxCoveragePersonas,
  generateAdversarialPersonas,
  estimateCognitiveLoad,
  COGNITIVE_TRAITS,
  OVERALL_LEVEL_KEY,
  type OTCognitiveProfile,
} from "../../visual/cognitive-transport.js";
import { bridgeCapacityTraits, personaRateContext } from "../../visual/cognitive-models.js";
import { lawTimesReport } from "../../visual/law-times-report.js";
import { activeProvenance, collectPersonaReads, isolatedProvenanceAsync, personaRateProvenance, ATTENTION_PROVENANCE_TEXT, type ProvenanceSummary } from "../../visual/model-provenance.js";
import type { PageMetrics } from "../../visual/cognitive-transport-chain.js";
import { ctcBandsDescription, ctcRank } from "../../visual/ctc-bands.js";
import { resolveSiteFamiliarity } from "./site-familiarity.js";
import { resolveChainValues, valueModulationReport } from "./chain-values.js";
import { recordedAnswer } from "./answer-provenance.js";

/**
 * Most base64 characters cognitive_effort spends on its inline motor-overlay
 * preview. The overlay is supporting evidence here, not the finding, and the
 * chain widget fetches every overlay full-size on demand, so the result keeps
 * the small inline footprint this tool already chose (2026-08-02) and fits the
 * picture into it instead of dropping it.
 */
const MOTOR_PREVIEW_MAX_CHARS = 40_000;

/**
 * Reference distribution of cognitive distances across the built-in persona set.
 *
 * cognitive_distance returns three numbers — w1, w2 and sliced — that look like
 * peers but are not on one scale: w1 is the exact generalized Wasserstein-1
 * distance over every COGNITIVE_TRAITS entry (trait ground metric for moving
 * mass, distance.slackCost for creating or destroying it, so it sees overall
 * level as well as shape; see cognitiveDistance), w2 is an L2 norm and sliced
 * a mean random projection, both on the simplex and so shape-only. The roster
 * is 25 human personas (BUILTIN + ACCESSIBILITY + EMOTIONAL), i.e. 300 pairs;
 * the "210 pairs" this comment used to cite was the 21-persona roster before
 * the emotional personas joined. Means measured 2026-07-29 on the old
 * weighted-L1 w1 were 0.296 / 0.128 / 0.016; on the 300 pairs the simplex W1
 * shipped 2026-10-21 averaged 0.085 and the generalized W1 averages 0.047
 * (w2 0.109, sliced 0.013), so compare the percentiles, never the raw numbers
 * across metrics. A reader comparing them directly draws a false conclusion.
 *
 * The verdict was worse. Its bands (0.01 / 0.03 / 0.06) were calibrated for a
 * scale w1 does not occupy: the old w1 spanned 0.055 to 0.684, so 209 of the
 * then 210 pairs returned "Substantially different cognitive profiles" — the
 * same sentence for nearly every possible question, which is no answer at all.
 *
 * The fix for both is one idea: express each metric as its percentile within this
 * population. Percentiles ARE comparable across metrics, and they are grounded in
 * the real spread rather than a guessed threshold.
 *
 * Only the built-in personas are used, deliberately. Including user-created ones
 * would make the same two personas score differently depending on what else the
 * caller happened to have saved. Computed once, on first use. (2026-07-29)
 */
interface DistanceReference {
  w1: number[];
  w2: number[];
  sliced: number[];
  pairCount: number;
}

let distanceReference: DistanceReference | null = null;

function getDistanceReference(): DistanceReference {
  if (distanceReference) return distanceReference;

  const builtins: Record<string, unknown> = {
    ...BUILTIN_PERSONAS,
    ...ACCESSIBILITY_PERSONAS,
    ...EMOTIONAL_PERSONAS,
  };
  const profiles = Object.entries(builtins).map(([name, p]) => {
    const profile = getCognitiveProfile(p as Persona | AccessibilityPersona);
    return buildOTProfile(name, (profile.traits as unknown as Record<string, number>) || {});
  });

  const w1: number[] = [], w2: number[] = [], sliced: number[] = [];
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const d = cognitiveDistance(profiles[i], profiles[j]);
      w1.push(d.w1); w2.push(d.w2); sliced.push(d.sliced);
    }
  }
  const asc = (v: number[]) => v.sort((a, b) => a - b);
  distanceReference = { w1: asc(w1), w2: asc(w2), sliced: asc(sliced), pairCount: w1.length };
  return distanceReference;
}

/** Fraction of reference pairs this value meets or exceeds, as a 0-100 percentile. */
function percentileOf(value: number, sortedReference: number[]): number {
  if (sortedReference.length === 0) return 0;
  let below = 0;
  while (below < sortedReference.length && sortedReference[below] < value) below++;
  return Math.round((below / sortedReference.length) * 1000) / 10;
}

/** Describes a metric relative to the population rather than an absolute threshold. */
function describeMetric(value: number, sortedReference: number[]) {
  return {
    value: Math.round(value * 10000) / 10000,
    percentile: percentileOf(value, sortedReference),
    populationRange: {
      min: Math.round(sortedReference[0] * 10000) / 10000,
      median: Math.round(sortedReference[Math.floor(sortedReference.length / 2)] * 10000) / 10000,
      max: Math.round(sortedReference[sortedReference.length - 1] * 10000) / 10000,
    },
  };
}

/**
 * Register persona comparison tools (3 tools: compare_personas, compare_personas_init, compare_personas_complete)
 */
/** An end of a ranking, but only when there IS a ranking (>= 2 entries). */
function contrastiveEnd(ranked: Array<{ persona: string }>, end: 0 | -1): string {
  if (ranked.length < 2) return "N/A";
  return (end === 0 ? ranked[0] : ranked[ranked.length - 1]).persona;
}

export function registerPersonaComparisonTools(
  server: McpServer,
  { getBrowser, getBrowserByToken }: ToolRegistrationContext
): void {
  server.registerTool("compare_personas", {
    title: "Compare Personas on Site",
    description: "Compare how different user personas experience a journey. In Claude Code sessions (no API key), use compare_personas_init and compare_personas_complete instead for the bridge workflow.",
    inputSchema: {
      url: z.string().url().describe("Starting URL"),
      goal: z.string().describe("Goal to accomplish"),
      personas: z.array(z.string()).describe("Persona names to compare"),
    },
    annotations: {
      title: "Compare Personas on Site",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ url, goal, personas }) => {
      // Hosted: http(s) only (sec-paths, 2026-10-10; see hosted-inputs.ts).
      const hostedRefusal = refuseHostedUrl("compare_personas", { url });
      if (hostedRefusal) return hostedRefusal;
      const hasApiKey = isApiKeyConfigured();

      if (!hasApiKey) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                mode: "bridge",
                message: "Running in Claude Code session - use the bridge workflow for API-free persona comparison",
                instructions: `
COMPARE PERSONAS BRIDGE WORKFLOW (No API Key Required):

1. Call compare_personas_init with your URL, goal, and personas list
2. For each persona returned, run a cognitive_journey_init and drive the journey using browser tools
3. After all journeys complete, call compare_personas_complete with the results

Example:
1. compare_personas_init({ url: "${url}", goal: "${goal}", personas: ${JSON.stringify(personas)} })
2. For each persona: cognitive_journey_init → navigate/click/fill → track state
3. compare_personas_complete({ journeyResults: [...], url: "${url}", goal: "${goal}" })
`,
                url,
                goal,
                personas,
              }, null, 2),
            },
          ],
        };
      }

      const result = await comparePersonas({
        startUrl: url,
        goal,
        personas,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              url: result.url,
              goal: result.goal,
              personasCompared: result.personas.length,
              summary: result.summary,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool("compare_personas_init", {
    title: "Initialize Persona Comparison",
    description: "Initialize persona comparison for Claude Code bridge workflow. Returns persona profiles and instructions for running journeys without API key.",
    inputSchema: {
      url: z.string().url().describe("Starting URL for all journeys"),
      goal: z.string().describe("Goal to accomplish"),
      personas: z.array(z.string()).describe("Persona names to compare (e.g., ['first-timer', 'power-user', 'elderly-user'])"),
    },
    annotations: {
      title: "Initialize Persona Comparison",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ url, goal, personas }) => {
      // v17.0.0: Filter out agent personas - persona comparison doesn't support them
      const filteredPersonas = personas.filter(name => {
        const persona = getAnyPersona(name);
        if (persona && isAgentPersonaObject(persona)) {
          console.warn(`[CBrowser] Skipping agent persona "${name}" - not supported for persona comparison`);
          return false;
        }
        return true;
      });

      const personaProfiles = filteredPersonas.map((personaName) => {
        const existingPersona = getAnyPersona(personaName);
        let personaObj: Persona | AccessibilityPersona;

        if (!existingPersona) {
          // Unknown name: refuse. A fabricated persona here produces a complete
          // per-persona assessment nobody can distinguish from a real one.
          resolvePersonaOrThrow(personaName);
          personaObj = createCognitivePersona(personaName, personaName, {});
        } else {
          // Safe cast - we filtered out agent personas above
          personaObj = existingPersona as Persona | AccessibilityPersona;
        }

        const profile = getCognitiveProfile(personaObj);

        return {
          name: personaName,
          description: personaObj.description,
          demographics: personaObj.demographics,
          cognitiveTraits: profile.traits,
          attentionPattern: profile.attentionPattern,
          decisionStyle: profile.decisionStyle,
        };
      });

      // v18.27.0: Compute cognitive distance matrix via optimal transport
      const otProfiles = personaProfiles.map(p =>
        buildOTProfile(p.name, p.cognitiveTraits as unknown as Record<string, number> || {})
      );
      const { matrix: distMatrix } = cognitiveDistanceMatrix(otProfiles);
      const bary = cognitiveBarycenter(otProfiles);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mode: "compare_personas_bridge",
              url,
              goal,
              personaCount: personas.length,
              // v18.27.0: Wasserstein cognitive distance analysis
              cognitiveAnalysis: {
                distanceMatrix: distMatrix.map((row, i) => ({
                  persona: filteredPersonas[i],
                  distances: Object.fromEntries(filteredPersonas.map((name, j) => [name, Math.round(row[j] * 10000) / 10000])),
                })),
                consensusMind: {
                  meanDistance: Math.round(bary.meanDistance * 10000) / 10000,
                  outlierPersona: bary.outlierPersona,
                  outlierReason: "Farthest from consensus cognitive profile (worst-served by generic design)",
                },
              },
              personas: personaProfiles,
              instructions: `
PERSONA COMPARISON BRIDGE WORKFLOW:

You have ${personas.length} personas to compare. For each persona:

1. Call cognitive_journey_init with the persona name, goal, and URL
2. Drive the journey using browser tools (navigate, click, fill, screenshot)
3. Track cognitive state using cognitive_journey_update_state
4. Continue until goal achieved or persona abandons
5. Record the final result

After ALL personas complete their journeys, call compare_personas_complete with:
{
  url: "${url}",
  goal: "${goal}",
  journeyResults: [
    {
      persona: "persona-name",
      goalAchieved: true/false,
      totalTime: seconds,
      stepCount: number,
      finalState: { patienceRemaining, frustrationLevel, confusionLevel },
      abandonmentReason: null or "patience" | "frustration" | "confusion" | "timeout" | "loop",
      frictionPoints: ["description of friction point", ...]
    },
    // ... one for each persona
  ]
}

PERSONA ORDER:
${personaProfiles.map((p, i) => `${i + 1}. ${p.name} - ${p.description}`).join("\n")}

Begin with the first persona: ${personas[0]}
`,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool("compare_personas_complete", {
    title: "Complete Persona Comparison",
    description: "Complete persona comparison by aggregating journey results. Call this after running all persona journeys via the bridge workflow.",
    inputSchema: {
      url: z.string().url().describe("The URL that was tested"),
      goal: z.string().describe("The goal that was attempted"),
      journeyResults: z.array(z.object({
        persona: z.string().describe("Persona name"),
        goalAchieved: z.boolean().describe("Whether the goal was achieved"),
        totalTime: z.number().describe("Total time in seconds"),
        stepCount: z.number().describe("Number of steps taken"),
        finalState: z.object({
          patienceRemaining: z.number(),
          frustrationLevel: z.number(),
          confusionLevel: z.number(),
        }).describe("Final cognitive state"),
        abandonmentReason: z.enum(["patience", "frustration", "confusion", "timeout", "loop"]).nullable().describe("Why journey ended if not goal achieved"),
        frictionPoints: z.array(z.string()).describe("List of friction point descriptions"),
      })).describe("Results from each persona journey"),
    },
    annotations: {
      title: "Complete Persona Comparison",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ url, goal, journeyResults }) => {
      const startTime = Date.now();

      const successfulResults = journeyResults.filter((r) => r.goalAchieved);
      const failedResults = journeyResults.filter((r) => !r.goalAchieved);

      const sortedByTime = [...successfulResults].sort((a, b) => a.totalTime - b.totalTime);
      // Successes only — ranking failed journeys by the friction they accrued
      // before dying produced a leastFriction persona out of nothing.
      const sortedByFriction = [...successfulResults].sort((a, b) => b.frictionPoints.length - a.frictionPoints.length);

      const allFrictionPoints = journeyResults.flatMap((r) => r.frictionPoints);
      const frictionCounts = allFrictionPoints.reduce((acc, fp) => {
        acc[fp] = (acc[fp] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const commonFriction = Object.entries(frictionCounts)
        .filter(([_, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([fp]) => fp);

      const recommendations: string[] = [];

      const abandonedByPatience = failedResults.filter((r) => r.abandonmentReason === "patience");
      const abandonedByFrustration = failedResults.filter((r) => r.abandonmentReason === "frustration");
      const abandonedByConfusion = failedResults.filter((r) => r.abandonmentReason === "confusion");

      if (abandonedByPatience.length > 0) {
        recommendations.push(
          `${abandonedByPatience.length} persona(s) abandoned due to PATIENCE exhaustion: ${abandonedByPatience.map((r) => r.persona).join(", ")} - consider shorter flows`
        );
      }

      if (abandonedByFrustration.length > 0) {
        recommendations.push(
          `${abandonedByFrustration.length} persona(s) abandoned due to FRUSTRATION: ${abandonedByFrustration.map((r) => r.persona).join(", ")} - review error messages and feedback`
        );
      }

      if (abandonedByConfusion.length > 0) {
        recommendations.push(
          `${abandonedByConfusion.length} persona(s) abandoned due to CONFUSION: ${abandonedByConfusion.map((r) => r.persona).join(", ")} - improve UI clarity and labeling`
        );
      }

      if (sortedByFriction[0]?.frictionPoints.length > 0) {
        const worstPersona = sortedByFriction[0];
        const avgFrustration = worstPersona.finalState.frustrationLevel;
        recommendations.push(
          `"${worstPersona.persona}" experienced the most friction (${worstPersona.frictionPoints.length} points, ${Math.round(avgFrustration * 100)}% frustration)`
        );
      }

      if (commonFriction.length > 0) {
        recommendations.push(
          `Common friction across personas: ${commonFriction.slice(0, 2).join("; ")}`
        );
      }

      if (recommendations.length === 0) {
        recommendations.push(
          "All personas completed the journey without significant cognitive barriers"
        );
      }

      const avgTime = successfulResults.length > 0
        ? successfulResults.reduce((sum, r) => sum + r.totalTime, 0) / successfulResults.length
        : 0;

      const comparison = {
        url,
        goal,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        personas: journeyResults.map((r) => ({
          persona: r.persona,
          success: r.goalAchieved,
          totalTime: r.totalTime * 1000,
          stepCount: r.stepCount,
          frictionCount: r.frictionPoints.length,
          frictionPoints: r.frictionPoints,
          cognitive: {
            patienceRemaining: r.finalState.patienceRemaining,
            frustrationLevel: r.finalState.frustrationLevel,
            confusionLevel: r.finalState.confusionLevel,
            abandonmentReason: r.abandonmentReason,
          },
        })),
        summary: {
          totalPersonas: journeyResults.length,
          successCount: successfulResults.length,
          failureCount: failedResults.length,
          // Contrastive fields need two points to compare. With one successful
          // journey these all named the same persona, which reads as a finding
          // and is not one. Mirrors analysis/persona-comparison.ts. (2026-07-29)
          fastestPersona: contrastiveEnd(sortedByTime, 0),
          slowestPersona: contrastiveEnd(sortedByTime, -1),
          mostFriction: contrastiveEnd(sortedByFriction, 0),
          leastFriction: contrastiveEnd(sortedByFriction, -1),
          avgCompletionTime: Math.round(avgTime * 1000),
          commonFrictionPoints: commonFriction,
        },
        recommendations,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(comparison, null, 2),
          },
        ],
      };
    }
  );

  // ── Cognitive Transport Tools (v18.27.0) ──

  server.registerTool("cognitive_distance", {
    title: "Cognitive Distance Between Personas",
    description: "Compute the cognitive distance between two personas as a generalized (unbalanced) Wasserstein-1 distance over their trait vectors: it counts both the shape of the profile and its overall level, so a persona with every trait at 0.2 is far from one with every trait at 0.8. Moving trait mass between traits costs a hand-set ground metric (0.2 same domain, 0.5 related, 0.8 unrelated); creating or destroying it costs 0.4 per unit, also hand-set. Both are hypotheses, untested against human data. Returns w1 with per-trait contributions (plus overallLevel, the share due to a difference in level), the shape-only Bures-Wasserstein W2 and sliced distances, and each metric's percentile among built-in persona pairs.",
    inputSchema: {
      personaA: z.string().describe("First persona name"),
      personaB: z.string().describe("Second persona name"),
    },
    annotations: {
      title: "Cognitive Distance Between Personas",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ personaA, personaB }) => {
      const pA = getAnyPersona(personaA);
      const pB = getAnyPersona(personaB);
      if (!pA || !pB) {
        return { isError: true, content: [{ type: "text" as const, text: `Persona not found: ${!pA ? personaA : personaB}. Run list_cognitive_personas for the roster. Nothing was measured.` }] };
      }
      const profileA = getCognitiveProfile(pA as Persona | AccessibilityPersona);
      const profileB = getCognitiveProfile(pB as Persona | AccessibilityPersona);
      const otA = buildOTProfile(personaA, profileA.traits as unknown as Record<string, number> || {});
      const otB = buildOTProfile(personaB, profileB.traits as unknown as Record<string, number> || {});
      const dist = cognitiveDistance(otA, otB);

      // Top 5 trait contributions. The generalized W1's level term is reported
      // on its own: it is not a trait, and listing it among traits read as one.
      const overallLevelContribution = dist.traitContributions[OVERALL_LEVEL_KEY] ?? 0;
      const topTraits = Object.entries(dist.traitContributions)
        .filter(([trait]) => trait !== OVERALL_LEVEL_KEY)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([trait, contrib]) => ({ trait, contribution: Math.round(contrib * 10000) / 10000 }));

      const ref = getDistanceReference();
      const w1Pct = percentileOf(dist.w1, ref.w1);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            personaA, personaB,

            // Raw values kept for callers who track them over time. Do NOT compare
            // these three to each other — see `scaleNote`.
            w1Distance: Math.round(dist.w1 * 10000) / 10000,
            w2Distance: Math.round(dist.w2 * 10000) / 10000,
            slicedWasserstein: Math.round(dist.sliced * 10000) / 10000,
            // The part of w1 forced by the difference in mean trait level; the
            // rest is shape. topDifferentiatingTraits lists traits only.
            overallLevelContribution: Math.round(overallLevelContribution * 10000) / 10000,

            // The comparable view: where this pair sits within all built-in
            // persona pairs, per metric. 0 = closest pair seen, 100 = farthest.
            metrics: {
              w1: describeMetric(dist.w1, ref.w1),
              w2: describeMetric(dist.w2, ref.w2),
              sliced: describeMetric(dist.sliced, ref.sliced),
            },
            referencePopulation: {
              pairs: ref.pairCount,
              basis: "all pairs of built-in personas",
            },
            scaleNote:
              // The count is read from the list: "26" went stale when the three bridge
              // traits arrived (v10 B42).
              `w1 (exact generalized Wasserstein-1 distance over ${COGNITIVE_TRAITS.length} traits), ` +
              "w2 (L2 norm) and sliced (mean absolute projection over uniform directions, computed exactly) are different quantities on different " +
              "scales. Compare the percentiles, not the raw values. w1 sees both the shape of a profile " +
              "and its overall level: each trait t carries mass t/" + COGNITIVE_TRAITS.length + ", moving mass " +
              "between traits costs the trait ground metric (0.2 / 0.5 / 0.8) and creating or destroying it " +
              "costs 0.4 per unit (a hand-set hypothesis), so w1 ranges from 0 to 0.4 and all traits 0.2 " +
              "versus all traits 0.8 is 0.24. overallLevelContribution, reported apart from the traits, is " +
              "half the cost the difference in mean trait level forces, 0.5 x 0.4 x |mean A - " +
              "mean B| (the other half is charged to the traits where mass is created or destroyed). w2 and " +
              "sliced are computed on profiles normalised to the simplex, so they measure shape only: " +
              "proportional trait vectors are at distance 0 on both.",

            // Verdict is a percentile band, not an absolute threshold. The former
            // absolute bands put 209 of the then 210 built-in pairs in one bucket.
            interpretation: w1Pct < 10 ? "Nearly identical cognitive profiles (closer than 90% of persona pairs)"
              : w1Pct < 30 ? "Similar cognitive profiles with minor differences"
              : w1Pct < 70 ? "Moderately different cognitive profiles"
              : w1Pct < 90 ? "Substantially different cognitive profiles"
              : "Extremely different cognitive profiles (farther apart than 90% of persona pairs)",
            interpretationBasis: `w1 is at the ${w1Pct}th percentile of ${ref.pairCount} built-in persona pairs`,

            topDifferentiatingTraits: topTraits,
          }, null, 2),
        }],
      };
    }
  );

  server.registerTool("cognitive_coverage", {
    title: "Maximum Coverage Persona Selection",
    description: "Select the N most cognitively different personas from a list for maximum test coverage. Uses greedy farthest-point sampling under the generalized Wasserstein-1 distance of cognitive_distance, which counts differences in overall trait level as well as in profile shape.",
    inputSchema: {
      personas: z.array(z.string()).describe("List of persona names to select from"),
      count: z.number().describe("Number of personas to select"),
    },
    annotations: {
      title: "Maximum Coverage Persona Selection",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ personas, count }) => {
      // Unknown names were skipped silently, so the "maximal set" was chosen
      // from a smaller list than the caller named. (2026-10-09)
      const unknown = personas.filter((n) => !getAnyPersona(n));
      if (unknown.length > 0) {
        return { isError: true, content: [{ type: "text" as const, text: `Unknown persona(s): ${unknown.join(", ")}. Run list_cognitive_personas for the roster. Nothing was measured.` }] };
      }
      const profiles: OTCognitiveProfile[] = [];
      for (const name of personas) {
        const p = getAnyPersona(name);
        if (!p) continue;
        const profile = getCognitiveProfile(p as Persona | AccessibilityPersona);
        profiles.push(buildOTProfile(name, profile.traits as unknown as Record<string, number> || {}));
      }
      const selected = selectMaxCoveragePersonas(profiles, count);
      const { matrix } = cognitiveDistanceMatrix(selected);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            selectedPersonas: selected.map(p => p.name),
            coverage: "Maximum cognitive diversity — these personas are the most different from each other",
            distanceMatrix: matrix.map((row, i) => ({
              persona: selected[i].name,
              distances: Object.fromEntries(selected.map((s, j) => [s.name, Math.round(row[j] * 10000) / 10000])),
            })),
          }, null, 2),
        }],
      };
    }
  );

  server.registerTool("cognitive_interpolate", {
    title: "Persona Geodesic Interpolation",
    description: "Generate an interpolated persona between two known personas using Wasserstein geodesic. Preserves trait coupling structure — the midpoint between ADHD and power-user has intermediate trait correlations, not just averaged values.",
    inputSchema: {
      personaA: z.string().describe("Starting persona"),
      personaB: z.string().describe("Ending persona"),
      position: z.number().min(0).max(1).optional().default(0.5).describe("Position on geodesic (0=A, 0.5=midpoint, 1=B)"),
    },
    annotations: {
      title: "Persona Geodesic Interpolation",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ personaA, personaB, position }) => {
      const pA = getAnyPersona(personaA);
      const pB = getAnyPersona(personaB);
      if (!pA || !pB) {
        return { isError: true, content: [{ type: "text" as const, text: `Persona not found: ${!pA ? personaA : personaB}. Run list_cognitive_personas for the roster. Nothing was measured.` }] };
      }
      const profileA = getCognitiveProfile(pA as Persona | AccessibilityPersona);
      const profileB = getCognitiveProfile(pB as Persona | AccessibilityPersona);
      const otA = buildOTProfile(personaA, profileA.traits as unknown as Record<string, number> || {});
      const otB = buildOTProfile(personaB, profileB.traits as unknown as Record<string, number> || {});

      const geodesic = cognitiveGeodesic(otA, otB, 10);
      const closestIdx = geodesic.reduce((best, p, i) =>
        Math.abs(p.t - position) < Math.abs(geodesic[best].t - position) ? i : best, 0);
      const point = geodesic[closestIdx];

      // Identify which traits changed most from A
      // `fromA` computed A - value, while its name reads as the change FROM A.
      // With value 0.97 and fromA -0.77 a reader back-solves A = 1.74, which is
      // impossible on a 0-1 scale — so the field looked like corrupt data rather
      // than an inverted sign. It is now value - A: positive means the
      // interpolated persona scores HIGHER than A on that trait. (2026-07-29)
      const traitDiffs = Object.entries(point.traits)
        .map(([trait, val]) => ({
          trait,
          value: Math.round(val * 100) / 100,
          fromA: Math.round((val - (otA.traits[trait] ?? 0.5)) * 100) / 100,
        }))
        .sort((a, b) => Math.abs(b.fromA) - Math.abs(a.fromA))
        .slice(0, 8);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            interpolatedPersona: {
              name: `${personaA}-${personaB}-${Math.round(position * 100)}pct`,
              position: point.t,
              traits: point.traits,
            },
            description: `Persona at ${Math.round(point.t * 100)}% along the Wasserstein geodesic from ${personaA} to ${personaB}`,
            topChangedTraits: traitDiffs,
          }, null, 2),
        }],
      };
    }
  );

  server.registerTool("cognitive_load_estimate", {
    title: "Cognitive Load Estimate",
    description: "Estimate cognitive load for a specific persona on page metrics. Returns per-dimension breakdown (information, visual, attention, decision, motor, text, memory, patience) and identifies the bottleneck dimension. Attention, motor and text use the persona's modelled capacities (sustained attention, Fitts pointing, reading). Visual is persona-invariant: no trait has a researched mapping onto visual-complexity tolerance, so it measures the page only and is listed under personaInvariant.",
    inputSchema: {
      persona: z.string().describe("Persona name"),
      informationDensity: z.number().min(0).max(1).describe("Content density (0=sparse, 1=dense)"),
      visualComplexity: z.number().min(0).max(1).describe("Visual complexity (0=simple, 1=complex)"),
      interactiveElements: z.number().describe("Number of interactive elements"),
      textDensity: z.number().min(0).max(1).describe("Text heaviness (0=minimal, 1=wall of text)"),
      animationLevel: z.number().min(0).max(1).describe("Animation/motion amount"),
      choiceCount: z.number().describe("Number of decision points/options"),
      navigationDepth: z.number().describe("Clicks needed to reach content"),
    },
    annotations: {
      title: "Cognitive Load Estimate",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ persona, informationDensity, visualComplexity, interactiveElements, textDensity, animationLevel, choiceCount, navigationDepth }) => {
      const p = getAnyPersona(persona);
      if (!p) return { isError: true, content: [{ type: "text" as const, text: `Persona not found: ${persona}. Run list_cognitive_personas for the roster. Nothing was measured.` }] };
      const profile = getCognitiveProfile(p as Persona | AccessibilityPersona);
      // A copy, because the bridge writes into what it is given.
      const traits = { ...((profile.traits as unknown as Record<string, number>) || {}) };
      // The estimator's attention, motor and text dimensions read the three
      // bridged capacities. Unbridged, they sat at the 0.5 fallback and every
      // persona scored identically on all three (B29, 2026-10-10). Same helper
      // as cognitive_effort, site_cognitive_assessment and the story tool.
      bridgeCapacityTraits(persona, traits,
        (p as unknown as { accessibilityTraits?: Record<string, number> }).accessibilityTraits, personaRateContext(p));
      const otProfile = buildOTProfile(persona, traits);

      const load = estimateCognitiveLoad(otProfile, {
        informationDensity, visualComplexity, interactiveElementCount: interactiveElements,
        textDensity, animationLevel, choiceCount, navigationDepth,
      });

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            persona,
            totalLoad: Math.round(load.totalLoad * 100) / 100,
            overloaded: load.overloaded,
            bottleneck: load.bottleneck,
            breakdown: Object.fromEntries(
              Object.entries(load.breakdown).map(([k, v]) => [k, Math.round(v * 100) / 100])
            ),
            personaInvariant: load.personaInvariant,
            personaInvariantNote: "visual depends on the page only: no trait has a researched mapping onto visual-complexity tolerance, so it is the same for every persona.",
            recommendation: load.overloaded
              ? `${persona} is cognitively overloaded. Primary bottleneck: ${load.bottleneck}. Reduce ${load.bottleneck} complexity to improve experience.`
              : `${persona} can handle this page. Closest to overload on: ${load.bottleneck}.`,
          }, null, 2),
        }],
      };
    }
  );

  // ── Cognitive Effort (Full COT) ──

  server.registerTool("cognitive_effort", {
    _meta: { ui: { resourceUri: "ui://cbrowser/effort" } },
    title: "Cognitive Effort Analysis",
    description: "Compute total cognitive effort for a persona to use a page. MEASURES THE VIEWPORT BY DEFAULT (above the fold); pass scope='full_page' to measure the whole page. Uses the 8-layer Sequential Transport Chain: visual complexity (a count of visual elements and motion, not the attention model) → cognitive load → decision → motor (target acquisition) → motor procedure (executing a sequence) → frustration → readability (decoding) → reading attention (holding the line, re-reading). Site familiarity is per run: pass siteFamiliarity (0 first visit, 1 daily user) or every persona is scored as a first visit. No persona carries a familiarity of its own, and site knowledge from crawling is reported but does not change the score. The headline number, cognitiveTransportCost.total, is a percentile: the page's raw cost ranked among the real pages of the shipped reference set, for the built-in personas, at the same scope (0.8 = costlier than 80% of them). The verdict states that rank and its band; the cost is untested against human data, so it says nothing about how a person feels, and abandonmentRisk is a separate quantity.",
    inputSchema: {
      url: z.string().url().describe("URL to analyze"),
      // Per RUN, not per persona. A persona is familiar with one site and new
      // to another, so this only has an answer once a URL is named. The
      // persona's stored value, where one exists, is the fallback. (2026-08-01)
      siteFamiliarity: z.number().min(0).max(1).optional()
        .describe("How familiar this persona is with THIS url: 0 first visit, 1 daily user. Omitted, the run scores a first visit (0). Familiarity is a persona-site pair, not a disposition: no persona carries one, and site knowledge does not supply one."),
      persona: z.string().describe("Persona name (e.g. first-timer, power-user, cognitive-adhd). To simulate someone who already knows this site, pass siteFamiliarity; the persona name does not imply it."),
      _browserToken: z.string().optional().describe("Browser session token"),
      userLocation: z.string().optional().describe("User's approximate location (e.g., 'Denver, Colorado, US')"),
      userTimezone: z.string().optional().describe("User's timezone (e.g., 'America/Denver')"),
      userLanguage: z.string().optional().describe("User's expected language (e.g., 'en-US')"),
      proxy: z.string().optional().describe("Proxy server URL for geo-accurate testing"),
      useValues: z.boolean().optional().default(false).describe("Apply the persona's Schwartz values (opt-in). When true, the values modulate the page's demand inside the chain, through its ten registered coefficients (chain.valueModulation.*, hand-set hypotheses, counted in modelProvenance): stimulation and security on changeBlindness; achievement on satisficing and riskTolerance; conformity on socialProofSensitivity and anchoringBias; selfDirection on socialProofSensitivity; power on fearOfMissingOut; stimulation on patience; benevolence on emotionalContagion. Each adds coefficient x score x max(chain.valueModulation.demandFloor, demand) to that trait's demand, clamped to [0, 1]; hedonism, tradition and universalism change nothing. Applies to the aggregate score and, at scope 'sequential', to every screen. Scores come from the persona registry, the persona's own schwartzValues, its Big Five, or an account persona in the CMS; `valueModulation` in the response says whether any were found. Default: false (trait-only mode)."),
      waitAfterLoad: z.number().optional().describe("Extra ms to wait after page loads (e.g., 3000 for sites with client-side translation)"),
      waitForSelector: z.string().optional().describe("CSS selector to wait for after load (e.g., '[data-translated]')"),
      scope: z.enum(["viewport", "full_page", "sequential"]).optional().default("viewport").describe("What to measure: 'viewport' (first impression, above-the-fold — default), 'full_page' (scroll the whole page, count every element), or 'sequential' (score each screen on its own content, carrying capacity forward, and report where people stop). Viewport and full_page match empathy_audit's parameter. 'sequential' answers a different question from either: not 'what would the whole page cost' but 'how far do they get'. NOTE: every published CTC number predates this parameter and is a viewport measurement."),
    },
    annotations: {
      title: "Cognitive Effort Analysis",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, recordedAnswer(async ({ url, persona: personaName, siteFamiliarity, _browserToken, userLocation, userTimezone, userLanguage, proxy, useValues, waitAfterLoad, waitForSelector, scope }) => {
    // recordedAnswer: one provenance recording per call, across every await,
    // reported as modelProvenance at the end (answer-provenance.ts).
    // Hosted: http(s) only (sec-paths, 2026-10-10; see hosted-inputs.ts).
    const hostedRefusal = refuseHostedUrl("cognitive_effort", { url });
    if (hostedRefusal) return hostedRefusal;
    try {
      // Get browser
      let b: Awaited<ReturnType<typeof getBrowser>>;
      let token: string | undefined;
      if (getBrowserByToken) {
        const result = await getBrowserByToken(_browserToken);
        b = result.browser;
        token = result.token;
      } else {
        b = await getBrowser();
      }

      // Navigate
      await b.navigate(url, {
        ...(waitAfterLoad ? { waitAfterLoad } : {}),
        ...(waitForSelector ? { waitForSelector } : {}),
      });
      const page = await b.getPage();

      // If non-English language requested, seed localStorage for i18n frameworks
      // and reload if the page hasn't translated yet
      const requestedLang = (userLanguage || "en-US").split("-")[0];
      if (requestedLang !== "en") {
        const currentLang = await page.evaluate(() => document.documentElement.lang || "").catch(() => "");
        if (currentLang.split("-")[0].toLowerCase() !== requestedLang.toLowerCase()) {
          await page.evaluate((lang: string) => {
            try { localStorage.setItem("cbrowser-lang", lang); localStorage.setItem("lang", lang); } catch {}
          }, requestedLang);
          await page.reload({ waitUntil: "domcontentloaded" });
          if (waitAfterLoad) await page.waitForTimeout(waitAfterLoad);
          if (waitForSelector) await page.waitForSelector(waitForSelector, { timeout: 10000 }).catch(() => {});
        }
      }

      // Detect language mismatch
      const expectedLang = (userLanguage || "en-US").split("-")[0];
      const pageLang = await page.evaluate(() => document.documentElement.lang || "").catch(() => "");
      const pageLangShort = pageLang.split("-")[0].toLowerCase();
      let languageWarning: string | undefined;
      if (pageLangShort && pageLangShort !== expectedLang.toLowerCase() && pageLangShort !== "") {
        languageWarning = `Page language "${pageLang}" does not match expected "${userLanguage || 'en-US'}". Site may be geo-detecting server IP, not user locale.`;
      }

      // Check if page is blocked/error
      const pageTitle = await page.title().catch(() => '');
      const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '').catch(() => '');
      const httpStatus = await page.evaluate(() => {
        const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        return perf?.responseStatus || 200;
      }).catch(() => 200);

      const BLOCK_SIGNATURES = [
        'access denied', '403 forbidden', 'just a moment', 'press & hold',
        'verify you are human', 'captcha', 'blocked', 'robot check',
        'cloudflare', 'please wait', 'checking your browser',
      ];
      const lowerTitle = pageTitle.toLowerCase();
      const lowerBody = bodyText.toLowerCase();
      const isBlocked = httpStatus >= 400 ||
        BLOCK_SIGNATURES.some(sig => lowerTitle.includes(sig) || lowerBody.includes(sig));

      if (isBlocked) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: "page_blocked",
              url,
              persona: personaName,
              httpStatus,
              detectedSignature: BLOCK_SIGNATURES.find(sig => lowerTitle.includes(sig) || lowerBody.includes(sig)) || `HTTP ${httpStatus}`,
              pageTitle,
              message: "The page returned an error or bot challenge. Cognitive effort cannot be measured on blocked pages.",
              suggestion: "Try with stealth mode enabled, or verify the URL loads in a regular browser.",
              ...(token ? { _browserToken: token } : {}),
            }, null, 2),
          }],
        };
      }

      // Get persona
      // Refuses an unknown name rather than inventing one. An agent persona is
      // still synthesised -- it exists, it just has no cognitive profile of its
      // own -- but a name that resolves to nothing stops the run.
      const existingPersona = getAnyPersona(personaName);
      if (!existingPersona) resolvePersonaOrThrow(personaName);
      const personaObj: Persona = isAgentPersonaObject(existingPersona)
        ? createCognitivePersona(personaName, personaName, {})
        : existingPersona as Persona;

      // siteFamiliarity: the caller's value for this run, else 0.0 (first
      // visit). Site knowledge is looked up only to report it; it does not
      // change the number (site-familiarity.ts has the 20.x history).
      const traits = { ...(personaObj.cognitiveTraits || {}) as Record<string, number> };

      let hasSiteKnowledge = false;
      try {
        const pageUrl = await page.url();
        const domain = new URL(pageUrl).hostname;
        const { SiteModelManager } = await import("../../site-model/manager.js");
        const mgr = SiteModelManager.getInstance();
        const stats = await mgr.getModelStats(domain);
        hasSiteKnowledge = !!(stats && stats.navigationNodes > 0);
      } catch {}

      const familiarity = resolveSiteFamiliarity(siteFamiliarity, hasSiteKnowledge);
      traits.siteFamiliarity = familiarity.value;

      // Bridge the formal models into the trait vector BEFORE the chain runs.
      //
      // getReadingProfile and getPointingProfile already model this persona's
      // decoding ability and Fitts pointing -- visual span, phonological
      // decoding, throughput, endpoint dispersion -- and until now the chain
      // never saw any of it. Its readability layer read `readingTendency`
      // (a disposition: how much text someone reads) and its motor layer read
      // patience and proceduralFluency, so a dyslexic persona scored LOWER
      // readability cost than an ADHD persona on a text-dense page while the
      // same response reported them at 157 WPM against 204.
      //
      // Injected here rather than stored on the persona: these are derived from
      // the persona's profile, so storing them would create a second copy that
      // can drift from the model that produces it. (2026-08-02)
      let pointingProfileForResponse: { sigmaX: number; sigmaY: number; rho: number; throughput: number } | undefined;
      // The ids the bridge read for THIS persona, reported as personaRateProvenance:
      // collected from the call, so no cache state can change them.
      let personaRateIds: ReadonlySet<string> = new Set<string>();
      try {
        const { bridgeCapacityTraits } = await import("../../visual/cognitive-models.js");
        // accessibilityTraits passed so an author's STATED reading capacity is
        // honoured; without it the name lookup wins and the fields are inert.
        const accTraits = (personaObj as unknown as { accessibilityTraits?: Record<string, number> }).accessibilityTraits;
        // One helper, shared with site_cognitive_assessment. This block used to be
        // inline here and NOWHERE ELSE, which is why the two tools disagreed by
        // 2.6x on the motor layer: the other path scored against the missing-trait
        // fallback of 0.5 and called it a pointing ability.
        ({ result: pointingProfileForResponse, ids: personaRateIds } = collectPersonaReads(() =>
          bridgeCapacityTraits(personaName, traits, accTraits, personaRateContext(personaObj))));
      } catch (e) {
        // Left absent rather than defaulted: a missing capacity is visible as a
        // gap, a defaulted one silently reads as average.
        console.debug(`[cognitive_effort] capacity bridge unavailable: ${(e as Error).message}`);
      }

      // Build OT profile
      const otProfile = buildOTProfile(
        personaName,
        traits
      );

      // Extract page metrics
      const { extractPageMetrics } = await import("../../visual/cognitive-transport.js");
      const measureScope = scope ?? "viewport";
      // Every scope-dependent SENTENCE comes from here, so the strings a test can
      // check are the strings a caller receives. They were three separate inline
      // ternaries testing `=== "full_page"`, which is how `sequential` came to
      // describe itself as viewport-only while reporting whole-document numbers.
      const prose = scopeProse(measureScope);

      // ONE geometry measurement for the whole call, taken here because the
      // aggregate extraction below runs FIRST and the sequential pass after it.
      //
      // `pageScreens` (the caption) and `screenCount` (how many screens the
      // sequential curve is scored over) were two independent derivations of one
      // quantity, from two separate height reads at two different moments. That is
      // the same class as a capacity bridge wired into one of two tools: one model,
      // two consumers, separately wired -- and it is a defect whether or not the
      // height is stable.
      //
      // Sharing the FUNCTION would not have been enough. Two calls at two moments
      // agree on arithmetic and still read a page that moved in between: the caption
      // could say 6.7 while the curve was scored over 6 screens, and nothing in the
      // payload would show the disagreement, because a 6-screen curve is internally
      // consistent and unmarked.
      const { measurePageGeometry } = await import("../../visual/cognitive-transport.js");
      const sharedGeometry = await measurePageGeometry(page);

      // Sequential scores each screen on its own content; the aggregate path
      // below still runs so every existing field keeps its meaning, measured at
      // full_page since that is the comparable whole-document number.
      const pageMetrics = await extractPageMetrics(
        page,
        measureScope === "sequential" ? "full_page" : measureScope,
        sharedGeometry,
      );

      // Compute full COT
      const { computeDemandDistribution, computeSequentialCTC, computeSequentialScrollCTC } = await import("../../visual/cognitive-transport-chain.js");

      // Motivational values (opt-in, default off). Resolved here and handed to
      // the chain, which applies them through its own registered modulation
      // (VALUE_DEMAND_MODULATION, chain.valueModulation.*) and clamps the result
      // to [0, 1].
      //
      // Through 21.0 this tool had a second path of its own: a
      // conservation/openness formula with unregistered 0.3 and 0.5 constants
      // that scaled five decision demands and emotionalContagion in place,
      // unclamped (up to 1.3), while the chain's modulation was reached from no
      // tool at all. Two hand-set models of one effect, and the one that ran was
      // the one the provenance block could not see. (2026-10-22)
      // One resolver, shared with visual_cognitive_story (chain-values.ts).
      const schwartzValues = useValues ? await resolveChainValues(personaName) : undefined;
      const chainOptions = { asymmetric: true, interactions: true, ...(schwartzValues ? { schwartzValues } : {}) };

      // SEQUENTIAL PASS, measuring half. The per-screen metrics are read here and
      // the curve is scored in the block below with everything else, so its
      // constants are counted too. A failure here degrades to the normal answer
      // rather than losing the whole call.
      let perScreen: PageMetrics[] | undefined;
      let sequentialError: string | undefined;
      if (measureScope === "sequential") {
        try {
          const { extractPerScreenMetrics } = await import("../../visual/cognitive-transport.js");
          // The SAME measurement the caption came from, so the curve length and the
          // caption cannot disagree.
          perScreen = await extractPerScreenMetrics(page, 20, sharedGeometry);
        } catch (e) {
          sequentialError = (e as Error).message;
        }
      }

      // The demand curves, the chain, the value modulation when useValues
      // applied it, and the sequential curve when scope asks for it. These used
      // to run under their own synchronous withProvenance, the only part of the
      // answer the recorder could see while it was module state; the whole
      // handler is one recording now (recordedAnswer), so this is just the
      // computation, and the block reported below counts it with everything
      // else the answer read. (2026-10-22)
      const scored = (() => {
        let seq: ReturnType<typeof computeSequentialScrollCTC> | undefined;
        let seqError = sequentialError;
        if (perScreen) {
          try {
            seq = computeSequentialScrollCTC(otProfile, perScreen.map((m) => computeDemandDistribution(m)), chainOptions);
          } catch (e) {
            seqError = (e as Error).message;
          }
        }
        const demand = computeDemandDistribution(pageMetrics);
        return { aggregate: computeSequentialCTC(otProfile, demand, chainOptions), seq, seqError };
      })();
      const result = scored.aggregate;

      let sequentialResult: Record<string, unknown> | undefined;
      if (scored.seq) {
        const seq = scored.seq;
        sequentialResult = {
          screensMeasured: seq.screens.length,
          // The INPUTS the screen count came from, published so a differing curve is
          // diagnosable instead of guessable. An external client measured 5.8 screens
          // on a session's first navigation and 6.7 on every later one; with only
          // `screensMeasured: 7` in the payload a 6-screen curve is internally
          // consistent and unmarked, which is the shape of every defect this tool has
          // had. An invisible variance is indistinguishable from no variance.
          geometry: {
            documentHeight: sharedGeometry.documentHeight,
            viewportHeight: sharedGeometry.viewportHeight,
            pageScreens: sharedGeometry.pageScreens,
            screenCount: sharedGeometry.screenCount,
            note: "One measurement, shared by the curve length and by the pageScreens caption, so the two cannot disagree. Page height can change between navigations; if two runs of the same URL differ, compare documentHeight before anything else.",
          },
          totalAbandonment: `${Math.round(seq.totalAbandonment * 100)}%`,
          expectedDepthScreens: seq.expectedDepthScreens,
          dropOff: seq.dropOff
            ? { screen: seq.dropOff.screen, layer: seq.dropOff.layer, shareOfSessions: `${Math.round(seq.dropOff.share * 100)}%` }
            : null,
          // The reach-weighted MEAN of the screens' percentiles: where the typical
          // screen this persona actually sees ranks. Replaces reachWeightedCTC,
          // the reach-weighted SUM, which grew with every screen reached and so
          // ranked a long page costlier for being long; a sum of percentiles is
          // not a percentile of anything. The chain still returns the sum.
          reachWeightedMeanScreenCTC: (() => {
            const reach = seq.screens.reduce((a, x) => a + x.reachProbability, 0);
            return reach > 0 ? Math.round((seq.screens.reduce((a, x) => a + x.reachProbability * x.screenCTC, 0) / reach) * 1000) / 1000 : null;
          })(),
          curve: seq.screens.map((x) => ({
            screen: x.screen,
            reach: `${Math.round(x.reachProbability * 100)}%`,
            stopHere: `${Math.round(x.stopHazard * 100)}%`,
            cumulativeAbandonment: `${Math.round(x.cumulativeAbandonment * 100)}%`,
            screenCTC: x.screenCTC,
            bottleneck: x.bottleneckLayer,
          })),
          note: "Each screen is measured on ITS OWN content, and capacity carries forward -- screen 7 is scored against what screens 1-6 left, not against a fresh persona. Count-based demands (interactive elements, choices) charge only elements not seen on an earlier screen, so a sticky nav is one decision rather than one per screen; text and visual density are NOT deduplicated, because re-encountering text is re-reading it.",
          screenCTCNote: "screenCTC is a percentile, like the aggregate total: the screen's raw cost ranked among the first screens of the real reference pages, scored for the built-in personas arriving fresh. A later screen is scored against the capacity earlier screens left, so its rank reflects that depletion as well as its own content. reachWeightedMeanScreenCTC averages the screens' percentiles, each weighted by the chance of reaching it: the rank of the typical screen this persona sees. It replaces reachWeightedCTC, an unnormalised sum that grew with the number of screens reached.",
          differsFrom: "The aggregate `abandonmentRisk` above asks what the whole document would cost if it were all processed. This asks how far they get. They are different questions and will not agree.",
          uncalibrated: "The per-screen hazard uses the same ABANDONMENT_HILL_EXPONENT as the aggregate, which nothing empirical set. At 2 the curve is superlinear, so this model inherits a thumb on the scale.",
          readThisFirst: "TRUST THE SHAPE, NOT THE TOTAL. `totalAbandonment` compounds a per-screen hazard across every screen, so on a long page it saturates toward 100% almost regardless of the page -- measured, elderly-user reached 100% on a 7-screen university homepage. That is the uncalibrated exponent compounding, not a finding about that page. `expectedDepthScreens` and `dropOff` are the numbers to act on: they say how far people get and what stops them, and both depend on the RANKING of per-screen hazards rather than their absolute level, which is the part the exponent least disturbs. `dropOff` is persona-dependent by design and that is not noise: an impatient reader drops on screen one, a patient one survives to whichever screen is genuinely hardest, and the two answers are both correct for their reader.",
        };
      } else if (scored.seqError !== undefined) {
        sequentialResult = { error: `sequential pass failed: ${scored.seqError}`, note: "The aggregate figures below are unaffected." };
      }

      // Also compute motor and readability from formal models
      let motorResult = null;
      let readabilityResult = null;
      // Hoisted out of the try below: the readability OVERLAY is drawn later,
      // outside that block, and needs the on-page rectangles the analysis
      // itself does not carry.
      let textBlockGeom: Array<{ x: number; y: number; width: number; height: number; text: string }> = [];
      // Hoisted for the same reason as textBlockGeom: the motor OVERLAY is drawn
      // outside the block that scores these, and it must use the scored list
      // rather than a second query with a different filter.
      let motorGeom: Array<{ selector: string; x: number; y: number; width: number; height: number }> = [];
      try {
        const { motorAccessibility, readability, getPointingProfile, getReadingProfile } = await import("../../visual/cognitive-models.js");

        // Get interactive elements for motor analysis — viewport-visible only
        const elements = await page.evaluate(() => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const interactive = document.querySelectorAll('a, button, input, select, textarea, [role="button"]');
          // Only elements a POINTING DEVICE could actually hit.
          //
          // The old filter asked for non-zero size and in-viewport, which a
          // visually-hidden skip link passes: the standard implementation is a
          // 1px box with clip: rect(0,0,0,0), so it has non-zero geometry and
          // sits at the top of the page. It was then fed to Fitts, which
          // correctly reported a multi-second movement time at 1% accuracy for
          // a 1px target -- and the tool docked the site's motor accessibility
          // score for implementing WCAG 2.4.1 Bypass Blocks.
          //
          // An accessibility product penalising a site for correct accessibility
          // is the most expensive false positive available here, so the check is
          // now what actually decides a mouse click: elementFromPoint at the
          // element's centre. If the click would land on something else, it is
          // not a pointing target. Cheap style and area checks run first because
          // elementFromPoint forces layout.
          //
          // Skip links ARE interactive for keyboard users. If the motor model is
          // ever extended to keyboard traversal they belong there, with their
          // FOCUSED geometry rather than their hidden geometry. (2026-08-02)
          const MIN_TARGET_PX = 4;
          return Array.from(interactive).filter((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.width < MIN_TARGET_PX || rect.height < MIN_TARGET_PX) return false;
            if (rect.bottom <= 0 || rect.top >= vh || rect.right <= 0 || rect.left >= vw) return false;
            const cs = window.getComputedStyle(el);
            if (cs.visibility === "hidden" || cs.display === "none") return false;
            if (parseFloat(cs.opacity || "1") < 0.05) return false;
            if (cs.pointerEvents === "none") return false;
            // clip / clip-path collapsing the box to nothing is the classic
            // visually-hidden idiom and leaves the bounding rect intact.
            const clip = cs.clip || "";
            if (/rect\(\s*0(px)?[,\s]+0(px)?[,\s]+0(px)?[,\s]+0(px)?\s*\)/.test(clip)) return false;
            if ((cs.clipPath || "").replace(/\s/g, "") === "inset(50%)") return false;
            // The decisive test: would a click at the centre reach this element?
            const x = Math.min(vw - 1, Math.max(0, rect.left + rect.width / 2));
            const y = Math.min(vh - 1, Math.max(0, rect.top + rect.height / 2));
            const hit = document.elementFromPoint(x, y);
            return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
          }).slice(0, 30).map((el) => {
            const rect = el.getBoundingClientRect();
            const cx = vw / 2;
            const cy = vh / 2;
            return {
              // Identifying, not just the tag name.
              //
              // This reported barriers as bare "a", so every anchor on the page
              // looked identical and a finding like "an <a> with 1% hit
              // probability" named nothing anyone could go and fix. It also made
              // two runs look like they were measuring the same element when
              // they had surfaced different links -- which is how a slower
              // movement time appeared alongside a HIGHER throughput and read as
              // a model inversion. (2026-08-02)
              selector: (() => {
                const tag = el.tagName.toLowerCase();
                if (el.id) return `${tag}#${el.id}`;
                // className via the guarded read: on an SVG element it is an
                // SVGAnimatedString, not a string, and calling .trim() on it
                // throws. There is a class-sweep test for exactly this and it
                // caught this line.
                const rawCls = (el as unknown as { className?: unknown }).className;
                const clsStr = typeof rawCls === "string"
                  ? rawCls
                  : String((rawCls as { baseVal?: string } | undefined)?.baseVal ?? "");
                const cls = clsStr.trim() ? `.${clsStr.trim().split(/\s+/)[0]}` : "";
                const label = (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30);
                const sibs = el.parentElement ? Array.from(el.parentElement.children).filter((c) => c.tagName === el.tagName) : [];
                const nth = sibs.length > 1 ? `:nth-of-type(${sibs.indexOf(el) + 1})` : "";
                return `${tag}${cls}${nth}${label ? ` "${label}"` : ""}`;
              })(),
              width: rect.width,
              height: rect.height,
              // Carried so the overlay can be drawn from THIS list rather than
              // re-querying: see the note at the overlay site.
              x: rect.x,
              y: rect.y,
              distance: Math.sqrt((rect.x + rect.width/2 - cx) ** 2 + (rect.y + rect.height/2 - cy) ** 2),
            };
          });
        });

        motorGeom = elements.map((e) => ({ selector: e.selector, x: e.x, y: e.y, width: e.width, height: e.height }));
        motorResult = motorAccessibility(elements, otProfile);

        // Get text blocks for readability analysis — viewport-visible only
        const textBlocks = await page.evaluate(() => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const blocks: Array<{ text: string; fontSize: number; lineHeight: number; fontFamily: string; isSerif: boolean; contrastRatio: number; x: number; y: number; width: number; height: number }> = [];
          const textEls = Array.from(document.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, td, th, span, div'));
          for (const el of textEls) {
            const rect = (el as HTMLElement).getBoundingClientRect();
            if (rect.bottom <= 0 || rect.top >= vh || rect.right <= 0 || rect.left >= vw) continue;
            if (rect.width === 0 || rect.height === 0) continue;
            const text = (el as HTMLElement).innerText?.trim();
            if (!text || text.length < 20) continue;
            const style = window.getComputedStyle(el);
            const fontSize = parseFloat(style.fontSize) || 16;
            const lineHeight = parseFloat(style.lineHeight) / fontSize || 1.5;
            const fontFamily = style.fontFamily || 'sans-serif';
            const isSerif = /serif/i.test(fontFamily) && !/sans-serif/i.test(fontFamily);
            // Geometry travels with the block. Without it the readability
            // overlay cannot be drawn at all -- the analysis knew which text was
            // hard and not where any of it was.
            blocks.push({ text: text.slice(0, 500), fontSize, lineHeight, fontFamily, isSerif, contrastRatio: 7,
              x: rect.x, y: rect.y, width: rect.width, height: rect.height });
            if (blocks.length >= 20) break;
          }
          return blocks;
        });

        textBlockGeom = textBlocks.map((b) => ({ x: b.x, y: b.y, width: b.width, height: b.height, text: b.text }));
        if (textBlocks.length > 0) {
          // otProfile carries name + traits but not accessibilityTraits, so the
          // stated reading capacity is attached here or the fields stay inert.
          readabilityResult = readability(textBlocks, {
            ...otProfile,
            accessibilityTraits: (personaObj as unknown as { accessibilityTraits?: Record<string, number> }).accessibilityTraits,
          });
        }
      } catch {}

      // Format response
      // What was actually measured, taken from the page after navigation rather
      // than from the argument. The response used to echo the requested URL
      // while describing a different site: `url: "https://www.ucdenver.edu"` on
      // an analysis of cudenver.edu, which ucdenver.edu 301s to. `navigate`
      // already warns on this mismatch; nothing else did.
      const landedUrl = (() => { try { return page.url(); } catch { return url; } })();
      const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
      const redirected = !!landedUrl && hostOf(landedUrl) !== "" && hostOf(landedUrl) !== hostOf(url);

      // Where the cost ranks among the real reference pages (ctc-bands.ts): the
      // band, the rank sentence and the verdict all read this one value.
      const rank = ctcRank(result);

      const response: Record<string, unknown> = {
        url,
        ...(redirected ? {
          resolvedUrl: landedUrl,
          redirectNote: `Requested ${hostOf(url)} and landed on ${hostOf(landedUrl)}. Every number below describes ${hostOf(landedUrl)}.`,
        } : { resolvedUrl: landedUrl }),
        persona: personaName,
        // Status counts of every registry constant the score read, and the ids
        // of the hand-set ones. A placeholder here so the field keeps its place
        // in the JSON; filled as the last step before serialising, so the block
        // covers the whole score: page measurement, demand, chain, values,
        // sequential curve and verdict. The saliency overlay, drawn as context,
        // carries its own block on its layerOverlays entry.
        modelProvenance: undefined,
        // The scored persona's motor and reading rates, counted apart from the
        // score's constants (they describe the persona).
        personaRateProvenance: personaRateProvenance(personaRateIds),
        // Stage B: the four law times the motor, decision, procedure and reading
        // demands come from, beside the demand each makes against the budget.
        lawTimes: lawTimesReport(pageMetrics),
        // Only when useValues asked for it, so a persona with no values is
        // visibly scored without them rather than silently.
        ...(useValues ? { valueModulation: valueModulationReport(schwartzValues) } : {}),
        cognitiveTransportCost: {
          // A percentile (21.x): raw ranked among the real reference pages for
          // the built-in personas at the same scope. 0.8 is costlier than 80%.
          total: Math.round(result.totalCTC * 1000) / 1000,
          // The 95% interval of that percentile across bootstrap resamples of
          // the reference pages: how firmly the reference fixes the rank.
          totalCTCInterval: result.totalCTCInterval.map((x) => Math.round(x * 1000) / 1000),
          band: rank.band,
          referenceScope: result.referenceScope,
          rank: rank.sentence,
          additive: Math.round(result.additiveCTC * 1000) / 1000,
          // The un-normalized cost. `total` is its percentile among real pages,
          // so the two are not interchangeable and any ratio must use `raw`.
          raw: Math.round(result.rawCTC * 1000) / 1000,
          // raw / additive — both in layer-cost units, so this is the genuine
          // contribution of interactions and sequential depletion.
          chainCoefficient: Math.round((result.rawCTC / Math.max(0.001, result.additiveCTC)) * 1000) / 1000,
          /**
           * @deprecated Use chainCoefficient. NOTE ITS VALUE CHANGED: this used
           * to divide `total` (then a logistic, 0-1) by `additive` (a raw sum) and
           * reported ~0.3-0.5, which read as the chain dampening by 60%. That
           * was a unit error, not a measurement — it was reporting the sigmoid.
           * Preserving the old number bit-for-bit would preserve a meaningless
           * one, so this now carries the corrected value.
           */
          sequentialAmplification: Math.round((result.rawCTC / Math.max(0.001, result.additiveCTC)) * 1000) / 1000,
          chainNote: "chainCoefficient = raw / additive, both in layer-cost units. Above 1 means interactions and sequential depletion added cost. Re-measured 1.002-1.036 at EIGHT layers, after `motor` was split into target acquisition and sequence execution (2026-08-03). It was 1.003-1.054 at seven and 1.002-1.019 at six. The range narrowed rather than widening this time: splitting one layer into two halves each layer's per-step cost, so the same total is reached through smaller increments and less of it compounds. Real, and small. Do NOT compute total/additive — total is the percentile of raw among the real reference pages, not a cost, and the ratio compares different units.",
          interpretationBasis: "total",
          interpretationBands: `total is a percentile of the real reference pages, banded ${ctcBandsDescription()}. The cut points are registered definitions (ctcBands.*), chosen as conventions and not fitted. A band is a rank among real pages: the CTC is untested against human data, so it says nothing about how a person experiences the page, and it is not an abandonment prediction (that is abandonmentRisk, a separate quantity). totalCTCInterval is the 95% interval of the percentile across bootstrap resamples of the reference pages: how firmly the reference pages fix the rank, not whether the cost is right.`,
        },
        layers: result.layers.map(l => ({
          name: l.name,
          cost: Math.round(l.transportCost * 1000) / 1000,
          capacityConsumed: Math.round(l.capacityConsumed * 1000) / 1000,
          // Emitted only where it says something the cost cannot: at zero cost
          // the layer has stopped discriminating and headroom is the remaining
          // signal. Above zero the cost carries it, and a second number would
          // just be noise. (BUG-18)
          //
          // The `headroom > 0` half of that test was wrong, and wrong in the
          // direction that hides the worse state. A floored layer with LOTS of
          // headroom was never challenged; a floored layer with NONE has nothing
          // left to spend, and those are opposite readings that both print
          // `cost: 0`. The condition suppressed the second one entirely, so the
          // caller saw a bare zero and no way to tell which it was -- while the
          // reading-model note in this same payload told them to "read headroom
          // on the readability layer instead", naming a field that was not
          // emitted. (BUG-28)
          ...(l.transportCost < 0.001
            ? {
                headroom: l.headroom,
                costIsAtFloor: true,
                floorMeaning: l.headroom > 0.02
                  ? "unchallenged: this layer had capacity to spare, and the page did not demand it"
                  : "exhausted: capacity here is spent, so the zero is the absence of anything left to spend, not the absence of difficulty",
              }
            : {}),
        })),
        bottleneck: result.bottleneckLayer,
        deficitVsSurplus: {
          deficit: Math.round(result.deficitCost * 1000) / 1000,
          surplus: Math.round(result.surplusCost * 1000) / 1000,
        },
        abandonmentRisk: Math.round(result.abandonmentRisk * 100) + "%",
        // Says out loud that these two are different constructs.
        //
        // A run can rank in the lower half on CTC and read 53% on abandonment
        // and both be correct, which looks like a contradiction and is not one:
        // abandonmentRisk is a Hill hazard of the deficit (unmet demand; surplus
        // no longer relieves it, 21.0) against the blended patience and
        // resilience this persona has LEFT after the page (21.0), and never touches
        // totalCTC. CTC asks how expensive the page is; abandonment asks
        // whether THIS persona's tolerance runs out first. A page can be cheap
        // in absolute terms and still exceed someone with little patience.
        // WHAT THIS NUMBER IS CONDITIONAL ON. It was reported as though it were
        // "the fraction of visitors who leave", and it is not that at either
        // scope -- it is two different conditional quantities depending on
        // which scope produced it, and the output did not distinguish them.
        // THREE scopes, three conditionals. This was a BINARY test against
        // "full_page", so `sequential` -- which extracts at full_page -- fell
        // through to the viewport string and told the caller these numbers
        // described the first screenful while they described the whole document.
        // Same shape as the scope-echo defect one layer out: the enum value
        // reached the computation and never reached the reporting.
        abandonmentBasis: prose.abandonmentBasis,
        abandonmentNotModelled: "Neither figure is 'what fraction of visitors leave'. A page is consumed as a SEQUENCE of screens, each with its own chance of stopping, and this model evaluates one aggregate. Two consequences it cannot express: demand below the fold is not weighted by the probability of ever reaching it, and capacity depletes with scroll depth as well as across layers. A persona also has no variance here -- every trait is a scalar, so this is one hypothetical person's trajectory, not a population, and no fraction-of-visitors reading is available from it at all.",
        interactions: Object.fromEntries(
          Object.entries(result.interactions)
            .filter(([, v]) => v > 0.001)
            .map(([k, v]) => [k, Math.round(v * 1000) / 1000])
        ),
        ...(motorResult ? {
          // WHY the two motor layers can disagree, shown rather than left to be
        // discovered. `motor` is target acquisition and `motorProcedure` is
        // sequence execution, and a persona can be poor at one and competent at
        // the other -- which is exactly what makes them separable and exactly
        // what read as a contradiction while they shared a scalar.
        //
        // Pointing is decomposed further because `motorCapacity` and
        // `hitProbability` are two different reductions of the same profile:
        // capacity weights Fitts throughput at 0.75, hit probability uses
        // endpoint dispersion alone. They therefore rank personas differently,
        // and a reader comparing them needs to see that rather than infer it.
        motorDecomposition: (() => {
          try {
            const pp = pointingProfileForResponse;
            if (!pp) return undefined;
            const L = result.layers as Array<{ name: string; transportCost: number }>;
            const acquire = L.find((l) => l.name === "motor")?.transportCost ?? 0;
            const sequence = L.find((l) => l.name === "motorProcedure")?.transportCost ?? 0;
            return {
              targetAcquisition: Math.round(acquire * 1000) / 1000,
              sequenceExecution: Math.round(sequence * 1000) / 1000,
              pointingInputs: {
                fittsThroughput: Math.round(pp.throughput * 100) / 100,
                endpointDispersionPx: Math.round(((pp.sigmaX + pp.sigmaY) / 2) * 10) / 10,
                note: "throughput drives movementTimeMs; dispersion drives hitProbability. motorCapacity is throughput / (throughput + 4.9 bits/s, the reference mouse throughput) and does not read dispersion, so the `motor` layer and `hitProbability` legitimately rank personas differently.",
              },
              note: "These two are additive and unweighted against each other. There is no empirical basis for a relative weighting between acquiring a target and executing a sequence, so none is applied - see MOTOR_LAYER_WEIGHTS, both 1.0 and marked uncalibrated.",
            };
          } catch { return undefined; }
        })(),
        motorAccessibility: {
            score: Math.round(motorResult.score * 100) + "%",
            barriers: motorResult.barrierCount,
            elements: motorResult.elements.filter((e: { isBarrier: boolean }) => e.isBarrier).slice(0, 5).map((e: { selector: string; hitProbability: number; movementTime: number }) => ({
              element: e.selector,
              hitProbability: Math.round(e.hitProbability * 100) + "%",
              movementTimeMs: Math.round(e.movementTime),
            })),
          },
        } : {}),
        ...(readabilityResult ? {
          readability: {
            // Renamed from `score`. This is a QUALITY percentage where high is
            // good; the chain's `readability` layer is a COST where high is bad.
            // Both were called readability, so a run could report readability
            // 91% and readability as the bottleneck in the same payload and
            // look self-contradictory when it was reporting two different
            // measurements under one word. (2026-08-02)
            legibilityQuality: Math.round(readabilityResult.score * 100) + "%",
            /** @deprecated ambiguous against the layer cost — use legibilityQuality */
            score: Math.round(readabilityResult.score * 100) + "%",
            // The note here previously said this was "a quality score for the
            // text itself", contrasted against the persona-relative layer cost.
            // That was wrong, and I wrote it. It comes from readability(), which
            // resolves a per-persona reading profile (visual span, phonological
            // decoding, crowding sensitivity) -- so it is persona-RELATIVE by
            // construction and reads 91% for one persona and 73% for another on
            // identical text. A field promising objectivity is the one most
            // likely to be quoted as an objective page score. (2026-08-02)
            note: "legibilityQuality is how legible this text is FOR THIS PERSONA (higher is better) — it is computed from their reading profile, so it varies across personas on identical text and is NOT an objective property of the page. The `readability` entry in `layers` is the DECODING transport cost for the same persona (higher is worse), and the two move together: for a given persona, lower legibility means higher readability cost until the cost reaches its floor of 0, which it does whenever decoding capacity exceeds what the page demands — at that point read `headroom` on the readability layer instead, because the cost cannot tell a comfortable reader from a very comfortable one. Across personas the ordering holds for any material difference in legibility, but not to the last decimal — layers spend from a budget the earlier ones depleted, so two readers with near-identical legibility can differ slightly if one arrived more depleted. The ATTENTIONAL cost of reading (holding the line, re-reading, being pulled away) is a separate layer, `readingAttention`, and is deliberately not part of this number.",
            legibilityQualityIsPersonaRelative: true,
            averageWPM: Math.round(
              readabilityResult.blocks.reduce((s: number, b: { wordsPerMinute: number }) => s + b.wordsPerMinute, 0) / readabilityResult.blocks.length
            ),
            hardestBlock: readabilityResult.blocks.length > 0
              ? (readabilityResult.blocks as Array<{ difficulty: number; penalties: string[] }>).reduce((worst, b) => b.difficulty > worst.difficulty ? b : worst).penalties
              : [],
            // Every component of that block, including the zeroes.
            //
            // `hardestBlock` is a prose list and each entry is gated behind its
            // own threshold, so a component evaluating to 0 is simply absent --
            // and absent is indistinguishable from not modelled. That is how
            // `crowdingSensitivity` came to look like a trait that does
            // nothing: it is weighted 0.15 into readingCapacity AND priced per
            // block, but Pelli's crowding effect only begins below 16px and
            // every page tested sets body text at 16px or more. At 13px it
            // discriminates cleanly -- adhd +6ms, dyslexic +17ms, low-vision
            // +21ms, tracking sensitivities of 0.20 / 0.55 / 0.70. (BUG-12)
            ...(readabilityResult.blocks.length > 0 ? {
              hardestBlockPenaltyMs: (readabilityResult.blocks as Array<{ difficulty: number; penaltyBreakdown: Record<string, number> }>)
                .reduce((worst, b) => b.difficulty > worst.difficulty ? b : worst).penaltyBreakdown,
              penaltyNote: "hardestBlockPenaltyMs carries every component, including those that came to 0. A 0 means the component was evaluated and does not apply to this text -- crowding, for one, only begins below 16px (Pelli et al. 2004) -- not that it is unmodelled. Since Stage B crowdingSensitivity does not enter readingCapacity: that is a rate ratio, from the persona's registered reading rate or, for a custom persona that states a reading profile, the fixation model's text-independent terms (base, phonological, visual span). Crowding is priced only here, in this audit's per-block time below 16px.",
            } : {}),
          },
        } : {}),
        // The verdict names its own scope. Reading "should handle this page
        // comfortably" off a measurement of the top 800px of a 6436px page is
        // the same class of output defect as the skip-link false positive:
        // internally consistent and indefensible to a customer.
        //
        // `subject` is what was actually measured, so the sentence stays true
        // at either scope instead of the scope being a footnote elsewhere.
        interpretation: (() => {
          // `sequential` extracts at full_page, so it describes the whole page.
          // Testing `=== "full_page"` sent it down the viewport branch and made
          // this sentence claim the opposite of what was measured.
          const wholeDocument = prose.wholeDocument;
          const subject = prose.subject;
          const where = wholeDocument ? "" : " (viewport only";
          const seqTail = measureScope === "sequential"
            ? ` Scored as a sequence: see \`sequential.expectedDepthScreens\` for how far ${personaName} is likely to get, and \`sequential.dropOff\` for where they stop.`
            : "";
          const screens = pageMetrics.pageScreens > 1.2
            ? `${wholeDocument ? " Measured across" : `${where}; the page is`} ${pageMetrics.pageScreens} screens${wholeDocument ? "." : ", so most of it was not measured — pass scope='full_page' for the whole thing.)"}${seqTail}`
            : where ? `${where}.)` : seqTail;
          // The rank, not a comfort claim. Through 21.0 this said "should handle
          // comfortably", "will struggle significantly" and "is likely to
          // abandon" off fixed points on a logistic nobody fitted; the CTC is
          // untested against human data, so a sentence on it can say where the
          // page ranks among real pages and nothing about how a person feels.
          // Abandonment stays in abandonmentRisk, its own quantity.
          const verdict = `For ${personaName}, ${subject} is ${rank.statement}. ${rank.bandSentence} Bottleneck: ${result.bottleneckLayer}.`;
          return verdict + screens;
        })(),
        // ONE AUTHORITATIVE FIELD PER READING DIMENSION, stated rather than
        // left to be inferred from which layer moved. Reading ability was
        // encoded in two places -- five explicit fields in accessibility_traits
        // AND `comprehension` plus `readingTendency` in the main vector -- with
        // nothing saying which the model reads. That is the two-registry
        // divergence shape, caught before the fields drifted. (BUG-13 / D-11)
        readingModel: {
          decoding: {
            authoritative: "accessibility_traits.{orthographicFluency, phonologicalDecoding, visualSpan, vocabularyBreadth, crowdingSensitivity}",
            reaches: "readability layer, via the derived readingCapacity dimension",
          },
          attention: {
            authoritative: "accessibility_traits.attentionSpan, falling back to traits.interruptRecovery",
            reaches: "readingAttention layer, via the derived sustainedAttention dimension",
          },
          engagement: {
            authoritative: "traits.readingTendency",
            reaches: "modulates readingAttention DEMAND only — a disposition, not an ability, and it does not touch decoding",
          },
          notConsumedForReading: {
            "traits.comprehension": "grasp of UI conventions, not reading. Consumed by cognitiveLoad only. A persona's 0.5 here says nothing about how well they read.",
          },
        },
        ...(sequentialResult ? { sequential: sequentialResult } : {}),
        scope: measureScope,
        pageScreens: pageMetrics.pageScreens,
        scopeNote: prose.scopeNote,
        // Reports what was USED, not what was passed.
        //
        // This previously said "supplied for this run" whenever the caller sent
        // a number, without any check that the number reached the model. It
        // did not: siteFamiliarity had no demand term and no home layer, so
        // three runs at unset / 1 / 0 came back byte-identical under a response
        // asserting the parameter had been applied. An attestation nobody
        // verifies is worse than no attestation, because it makes an
        // output-level audit report the knob as working. (2026-08-02)
        siteFamiliarity: familiarity.value,
        siteFamiliaritySource: familiarity.source,
        // Reported, not applied: crawling a site says nothing about whether
        // THIS persona has used it.
        siteKnowledgeAvailable: familiarity.siteKnowledgeAvailable,
        siteFamiliarityEffect: `Consumed by the cognitiveLoad layer against a demand set by navigation depth. A page reachable in one click demands no site knowledge, so this changes nothing there.`,
        ...(languageWarning ? { languageWarning } : {}),
        ...(userLocation ? { userContext: { location: userLocation, timezone: userTimezone, language: userLanguage } } : {}),
        ...(token ? { _browserToken: token } : {}),
      };

      // Generate motor accessibility overlay
      let motorPng: Buffer | undefined;
      let motorFullResolution = "";
      // Each screenshot below goes in this call's own temp dir, removed in a
      // finally (src/temp-files.ts): clock-named files in the shared temp dir
      // were read by concurrent calls, and this one was never deleted at all.
      let motorTemp: CallTempDir | undefined;
      try {
        if (motorResult && motorResult.elements.length > 0) {
          const { writeFileSync, mkdirSync, existsSync } = await import("fs");

          motorTemp = await makeTempDir("cog-effort");
          const ssPath = motorTemp.file("page.png");
          await page.screenshot({ path: ssPath, fullPage: false });

          // Get element bounding boxes for motor overlay
          const motorElements = await page.evaluate(() => {
            return [];
          });

          const { generateMotorOverlay } = await import("../../visual/visual-overlays.js");
          // Drawn from the SAME list that was scored.
          //
          // This used to run a second querySelectorAll with a different filter
          // and zip it to motorResult.elements BY INDEX, so the two lists only
          // lined up while both filters happened to admit the same elements in
          // the same order. Tightening the scoring filter to exclude
          // non-hit-testable targets would have guaranteed a mismatch, and the
          // overlay would have drawn each element's hit probability on some
          // other element's box. (2026-08-02)
          const motorOverlayElements = motorGeom.map((el, i: number) => ({
            selector: el.selector,
            x: el.x, y: el.y, width: el.width, height: el.height,
            hitProbability: motorResult.elements[i]?.hitProbability ?? 0.9,
            isBarrier: motorResult.elements[i]?.isBarrier ?? false,
          }));

          const motorBase64 = await generateMotorOverlay(ssPath, motorOverlayElements, personaName);

          const heatmapId = `motor-${personaName}-${Date.now()}`;
          motorPng = Buffer.from(motorBase64, "base64");
          const written = writeArtifact(motorPng, `${heatmapId}.png`);
          if (written) response.motorOverlayUrl = written.url;
          motorFullResolution = written
            ? "the PNG at motorOverlayUrl, or artifact_fetch with the motor entry's file in layerOverlays"
            : "not available (the artifact store was unavailable, so the full-resolution PNG was not saved)";
          response.motorOverlayNote = "Green = easy to click. Yellow = moderate difficulty. Red = motor barrier for this persona.";

          // A tool result is not an image transport, so the full PNG is never
          // carried: on a real page it was 309,296 of a 312,580-byte result --
          // 99% image around 2,828 bytes of data -- and past the host's cap the
          // widget does not degrade, it fails to load. The chain widget fetches
          // every overlay on demand through artifact_fetch.
          //
          // It used to ride along only when the PNG happened to be under 40k of
          // base64, which a real page never is, so the model never saw it. Now
          // a JPEG preview is fitted into that same 40k (see the end of this
          // handler), so the overlay is always visible without a round trip
          // and the result stays small. (2026-10-09)
          // The layer overlays below take their own screenshot.
        }
      } catch (e) {
        console.debug(`[cognitive_effort] Motor overlay failed: ${(e as Error).message}`);
      } finally {
        await motorTemp?.remove();
      }

      // The layer overlays' screenshot, in its own temp dir like the motor one.
      let layersTemp: CallTempDir | undefined;

      // Per-layer visual evidence, so a bar in the chain can be opened into the
      // thing it measured.
      //
      // Only layers with a real generator get one. The other two are listed with
      // the reason rather than omitted: a chain of six where four are clickable
      // and two silently are not reads as a broken widget, while "no overlay for
      // this layer, and here is why" is information. Nothing is fabricated to
      // fill the gap. (2026-08-02)
      const layerOverlays: Array<{ layer: string; file?: string; legend?: string; available: boolean; reason?: string; provenance?: ProvenanceSummary }> = [];
      try {
        layersTemp = await makeTempDir("cog-effort-layers");
        const ssPath = layersTemp.file("page.png");
        await page.screenshot({ path: ssPath, fullPage: false });

        // visualComplexity -- keyless. Lab-space centre-surround over the
        // screenshot, so this needs no API key and no model call. It is shown as
        // visual context for the layer, NOT as its input: the layer's cost comes
        // from the visual-complexity count and the animation level, and this map
        // never reaches the chain. The legend says so, because the layer was
        // called "saliency" until 21.0 and this heatmap read as its evidence.
        try {
          const { computeLabSaliency } = await import("../../visual/attention-transport.js");
          const { generateHeatmapOverlay } = await import("../../visual/heatmap-overlay.js");
          // Recorded apart from the score. The map reads the attention model's
          // constants (published colour science, fitted gaze calibration), and
          // counted in modelProvenance they made the score look partly fitted
          // while the map is context, not an input. Its own block rides on
          // this overlay entry.
          const { result: b64, provenance: mapProvenance } = await isolatedProvenanceAsync(async () => {
            const sal = await computeLabSaliency(ssPath);
            return generateHeatmapOverlay(ssPath, sal.cells, sal.rows, sal.cols, `${personaName} — saliency`);
          }, ATTENTION_PROVENANCE_TEXT);
          const w = writeArtifact(Buffer.from(b64, "base64"), `saliency-${personaName}-${Date.now()}.png`);
          if (w) layerOverlays.push({ layer: "visualComplexity", file: w.url.split("/").pop(), available: true,
            legend: "Lab-space saliency of the screenshot, shown as context. Hotter = more visually salient. The layer's cost is not computed from this map: it comes from the page's visual-complexity count and animation level.",
            provenance: mapProvenance });
        } catch (e) {
          layerOverlays.push({ layer: "visualComplexity", available: false, reason: `saliency map failed: ${(e as Error).message}` });
        }

        // motor -- already drawn above; surfaced here so the chain has one list.
        if (response.motorOverlayUrl) {
          layerOverlays.push({ layer: "motor", file: String(response.motorOverlayUrl).split("/").pop(), available: true,
            legend: String(response.motorOverlayNote || "") });
        } else {
          layerOverlays.push({ layer: "motor", available: false, reason: "no interactive elements were found to score" });
        }

        // readability
        if (readabilityResult && readabilityResult.blocks.length > 0) {
          try {
            const { generateReadabilityOverlay } = await import("../../visual/visual-overlays.js");
            const rb = readabilityResult.blocks.map((b: { difficulty: number; wordsPerMinute: number }, i: number) => ({
              x: textBlockGeom[i]?.x ?? 0, y: textBlockGeom[i]?.y ?? 0,
              width: textBlockGeom[i]?.width ?? 0, height: textBlockGeom[i]?.height ?? 0,
              difficulty: b.difficulty ?? 0, wpm: b.wordsPerMinute ?? 0,
              text: textBlockGeom[i]?.text ?? "",
            })).filter((b: { width: number; height: number }) => b.width > 0 && b.height > 0);
            if (rb.length) {
              const b64 = await generateReadabilityOverlay(ssPath, rb, personaName);
              const w = writeArtifact(Buffer.from(b64, "base64"), `readability-${personaName}-${Date.now()}.png`);
              if (w) layerOverlays.push({ layer: "readability", file: w.url.split("/").pop(), available: true,
                legend: "Hotter = slower for this persona to read." });
            } else {
              layerOverlays.push({ layer: "readability", available: false, reason: "text blocks carried no on-page geometry" });
            }
          } catch (e) {
            layerOverlays.push({ layer: "readability", available: false, reason: `readability overlay failed: ${(e as Error).message}` });
          }
        } else {
          layerOverlays.push({ layer: "readability", available: false, reason: "no readable text blocks in the viewport" });
        }

        // The remaining two have no generator, and no data here to build one
        // from. Said plainly rather than left as a dead bar.
        // camelCase, matching LAYER_DEFINITIONS. Emitted as "cognitive-load" at
        // first, which matched nothing: the bar got neither a button nor a
        // no-overlay tag and silently looked different from its five siblings.
        layerOverlays.push({ layer: "cognitiveLoad", available: false,
          reason: "no per-region load data is produced by this tool, so there is nothing to draw" });
        layerOverlays.push({ layer: "decision", available: false,
          reason: "decision cost is computed over the page as a whole, not per region" });
        layerOverlays.push({ layer: "frustration", available: false,
          reason: "frustration is a running state across the chain, not a place on the page" });
        layerOverlays.push({ layer: "motorProcedure", available: false,
          reason: "sequence execution is a property of a flow across pages, not a place on this one \u2014 the motor overlay above shows where TARGET ACQUISITION is hard" });
        layerOverlays.push({ layer: "readingAttention", available: false,
          reason: "attentional reading cost is a property of the reader against the whole page, not of any one region \u2014 the readability overlay above shows where DECODING is slow" });

      } catch (e) {
        console.debug(`[cognitive_effort] Layer overlays failed: ${(e as Error).message}`);
      } finally {
        await layersTemp?.remove();
      }
      if (layerOverlays.length) {
        response.layerOverlays = layerOverlays;
        response.layerOverlayNote = "Each entry maps to a bar in the transport chain. Layers without an overlay say why.";
      }

      // Last, so it covers everything above. Serialising the previews reads no
      // registered constant.
      response.modelProvenance = activeProvenance();

      const content = motorPng
        ? await buildContentWithPreviews(
            response,
            [{ name: "motor", png: motorPng, fullResolution: motorFullResolution }],
            (p) => ({ motorOverlayPreview: p.motor }),
            { maxCharsPerImage: MOTOR_PREVIEW_MAX_CHARS },
          )
        : [{ type: "text" as const, text: JSON.stringify(response, null, 2) }];

      // Auto-save handled by tier-gate wrapper

      return { content };
    } catch (err) {
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
            url,
            persona: personaName,
            // The shared unknown-persona fields (same as attention_* and
            // empathy_audit), so one `code` check covers every tool. (2026-10-09)
            ...((err as { code?: string })?.code === "unknown_persona" ? {
              code: "unknown_persona",
              suggestions: (err as { suggestions?: string[] }).suggestions ?? [],
            } : {}),
          }, null, 2),
        }],
      };
    }
  }));
}
