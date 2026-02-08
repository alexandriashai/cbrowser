/**
 * CBrowser - Cognitive Browser Automation
 * 
 * Copyright (c) 2026 WF Media (Alexandria Eden)
 * Email: alexandria.shai.eden@gmail.com
 * 
 * This source code is licensed under the Business Source License 1.1
 * found in the LICENSE file in the root directory of this source tree.
 * 
 * Non-production use is permitted. Production use requires a commercial license.
 * See LICENSE for full terms.
 */


/**
 * Multi-Persona Comparison Testing
 *
 * Tier 6: Run the same user journey with multiple personas in parallel
 * to compare how different user types experience your application.
 *
 * Now uses cognitive journeys (Claude API) for realistic persona simulation
 * instead of random clicking.
 */

import { getPersona, BUILTIN_PERSONAS } from "../personas.js";
import {
  runCognitiveJourney,
  isApiKeyConfigured,
} from "../cognitive/index.js";
import type {
  PersonaJourneyResult,
  PersonaComparisonResult,
  CognitiveJourneyResult,
} from "../types.js";

export interface ComparePersonasOptions {
  /** Starting URL for the journey */
  startUrl: string;
  /** Goal to accomplish */
  goal: string;
  /** Personas to compare (names) */
  personas: string[];
  /** Maximum steps per journey */
  maxSteps?: number;
  /** Maximum time per journey in seconds */
  maxTime?: number;
  /** Maximum concurrent browsers */
  maxConcurrency?: number;
  /** Headless mode */
  headless?: boolean;
  /** Enable vision mode (send screenshots to Claude) */
  vision?: boolean;
}

/**
 * Convert CognitiveJourneyResult to PersonaJourneyResult for comparison.
 */
function mapCognitiveResult(
  journey: CognitiveJourneyResult,
  persona: ReturnType<typeof getPersona>
): PersonaJourneyResult {
  const personaData = persona || BUILTIN_PERSONAS["first-timer"];

  // Calculate average reaction time from persona config
  const timing = personaData.humanBehavior?.timing;
  const avgReactionTime = timing
    ? (timing.reactionTime.min + timing.reactionTime.max) / 2
    : 500;

  // Calculate error rate from persona config
  const errors = personaData.humanBehavior?.errors;
  const errorRate = errors ? (errors.misClickRate + errors.typoRate) / 2 : 0.05;

  return {
    persona: journey.persona,
    description: personaData.description,
    techLevel: personaData.demographics?.tech_level || "intermediate",
    device: personaData.demographics?.device || "desktop",
    success: journey.goalAchieved,
    totalTime: journey.totalTime * 1000, // Convert seconds to ms
    stepCount: journey.stepCount,
    frictionCount: journey.frictionPoints.length,
    frictionPoints: journey.frictionPoints.map(
      (fp) => `${fp.type}: ${fp.monologue.substring(0, 100)}`
    ),
    avgReactionTime,
    errorRate,
    screenshots: {
      start: journey.frictionPoints[0]?.screenshot || "",
      end:
        journey.frictionPoints[journey.frictionPoints.length - 1]?.screenshot ||
        "",
    },
    cognitive: {
      patienceRemaining: journey.finalState.patienceRemaining,
      frustrationLevel: journey.finalState.frustrationLevel,
      confusionLevel: journey.finalState.confusionLevel,
      abandonmentReason: journey.abandonmentReason,
      backtrackCount: journey.summary.backtrackCount,
      monologue: journey.fullMonologue,
    },
  };
}

/**
 * Run the same journey with multiple personas and compare results.
 * Uses cognitive journeys (Claude API) for realistic persona simulation.
 *
 * @throws Error if Anthropic API key is not configured
 */
export async function comparePersonas(
  options: ComparePersonasOptions
): Promise<PersonaComparisonResult> {
  const {
    startUrl,
    goal,
    personas,
    maxSteps = 20,
    maxTime = 120,
    maxConcurrency = 2, // Lower default for API rate limits
    headless = true,
    vision = false,
  } = options;

  // Check API key
  if (!isApiKeyConfigured()) {
    throw new Error(
      "Anthropic API key required for persona comparison. Run: npx cbrowser config set-api-key YOUR_KEY"
    );
  }

  const startTime = Date.now();
  const results: PersonaJourneyResult[] = [];

  console.log(`\n  Comparing ${personas.length} personas with cognitive journeys...`);
  console.log(`   URL: ${startUrl}`);
  console.log(`   Goal: ${goal}`);
  console.log(`   Mode: AI-driven cognitive simulation`);
  console.log(`   Concurrency: ${maxConcurrency}\n`);

  // Process personas in batches (lower concurrency for API limits)
  for (let i = 0; i < personas.length; i += maxConcurrency) {
    const batch = personas.slice(i, i + maxConcurrency);

    console.log(
      `  Batch ${Math.floor(i / maxConcurrency) + 1}: ${batch.join(", ")}`
    );

    const batchPromises = batch.map(async (personaName) => {
      try {
        const persona = getPersona(personaName);

        // Run cognitive journey (uses Claude API for decision making)
        const journey = await runCognitiveJourney({
          persona: personaName,
          startUrl,
          goal,
          maxSteps,
          maxTime,
          headless,
          vision,
          verbose: false,
        });

        const result = mapCognitiveResult(journey, persona);

        const status = journey.goalAchieved
          ? "SUCCESS"
          : `ABANDONED (${journey.abandonmentReason})`;
        const patience = `${Math.round(journey.finalState.patienceRemaining * 100)}%`;
        const frustration = `${Math.round(journey.finalState.frustrationLevel * 100)}%`;

        console.log(
          `    ${personaName}: ${status} | patience: ${patience}, frustration: ${frustration}, friction: ${journey.frictionPoints.length}`
        );

        return result;
      } catch (e: any) {
        console.log(`    ${personaName}: ERROR - ${e.message}`);

        const persona = getPersona(personaName) || BUILTIN_PERSONAS["first-timer"];

        return {
          persona: personaName,
          description: persona.description || "Unknown",
          techLevel: persona.demographics?.tech_level || "unknown",
          device: persona.demographics?.device || "unknown",
          success: false,
          totalTime: 0,
          stepCount: 0,
          frictionCount: 1,
          frictionPoints: [`Error: ${e.message}`],
          avgReactionTime: 0,
          errorRate: 0,
          screenshots: { start: "", end: "" },
          cognitive: {
            patienceRemaining: 0,
            frustrationLevel: 1,
            confusionLevel: 1,
            abandonmentReason: "timeout" as const,
            backtrackCount: 0,
            monologue: [`Error during journey: ${e.message}`],
          },
        } as PersonaJourneyResult;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  // Generate summary
  const successfulResults = results.filter((r) => r.success);
  const failedResults = results.filter((r) => !r.success);

  const sortedByTime = [...successfulResults].sort(
    (a, b) => a.totalTime - b.totalTime
  );
  const sortedByFriction = [...results].sort(
    (a, b) => b.frictionCount - a.frictionCount
  );

  // Collect all friction points
  const allFrictionPoints = results.flatMap((r) => r.frictionPoints);
  const frictionCounts = allFrictionPoints.reduce(
    (acc, fp) => {
      acc[fp] = (acc[fp] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const commonFriction = Object.entries(frictionCounts)
    .filter(([_, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([fp]) => fp);

  // Generate recommendations (now with cognitive insights)
  const recommendations: string[] = [];

  // Abandonment analysis
  const abandonedByPatience = failedResults.filter(
    (r) => r.cognitive?.abandonmentReason === "patience"
  );
  const abandonedByFrustration = failedResults.filter(
    (r) => r.cognitive?.abandonmentReason === "frustration"
  );
  const abandonedByConfusion = failedResults.filter(
    (r) => r.cognitive?.abandonmentReason === "confusion"
  );

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

  // Friction analysis
  if (sortedByFriction[0]?.frictionCount > 0) {
    const worstPersona = sortedByFriction[0];
    const avgFrustration = worstPersona.cognitive?.frustrationLevel || 0;
    recommendations.push(
      `"${worstPersona.persona}" experienced the most friction (${worstPersona.frictionCount} points, ${Math.round(avgFrustration * 100)}% frustration)`
    );
  }

  // Tech level analysis
  const beginnerPersonas = results.filter((r) => r.techLevel === "beginner");
  const expertPersonas = results.filter((r) => r.techLevel === "expert");

  if (beginnerPersonas.length > 0 && expertPersonas.length > 0) {
    const avgBeginnerTime =
      beginnerPersonas.reduce((sum, r) => sum + r.totalTime, 0) /
      beginnerPersonas.length;
    const avgExpertTime =
      expertPersonas.reduce((sum, r) => sum + r.totalTime, 0) /
      expertPersonas.length;

    if (avgBeginnerTime > avgExpertTime * 2) {
      recommendations.push(
        `Beginners take ${(avgBeginnerTime / avgExpertTime).toFixed(1)}x longer than experts - add more guidance`
      );
    }
  }

  // Mobile vs Desktop
  const mobilePersonas = results.filter((r) => r.device === "mobile");
  const desktopPersonas = results.filter((r) => r.device === "desktop");

  if (mobilePersonas.length > 0 && desktopPersonas.length > 0) {
    const mobileFriction =
      mobilePersonas.reduce((sum, r) => sum + r.frictionCount, 0) /
      mobilePersonas.length;
    const desktopFriction =
      desktopPersonas.reduce((sum, r) => sum + r.frictionCount, 0) /
      desktopPersonas.length;

    if (mobileFriction > desktopFriction * 1.5) {
      recommendations.push(
        `Mobile users experience ${(mobileFriction / desktopFriction).toFixed(1)}x more friction - review mobile UX`
      );
    }
  }

  // Common friction points
  if (commonFriction.length > 0) {
    recommendations.push(
      `Common friction across personas: ${commonFriction.slice(0, 2).join("; ")}`
    );
  }

  // Backtrack analysis
  const highBacktrackers = results.filter(
    (r) => (r.cognitive?.backtrackCount || 0) > 3
  );
  if (highBacktrackers.length > 0) {
    recommendations.push(
      `${highBacktrackers.length} persona(s) backtracked frequently - navigation may be confusing`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "All personas completed the journey without significant cognitive barriers"
    );
  }

  const avgTime =
    successfulResults.length > 0
      ? successfulResults.reduce((sum, r) => sum + r.totalTime, 0) /
        successfulResults.length
      : 0;

  const comparison: PersonaComparisonResult = {
    url: startUrl,
    goal,
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    personas: results,
    summary: {
      totalPersonas: personas.length,
      successCount: successfulResults.length,
      failureCount: failedResults.length,
      fastestPersona: sortedByTime[0]?.persona || "N/A",
      slowestPersona:
        sortedByTime[sortedByTime.length - 1]?.persona || "N/A",
      mostFriction: sortedByFriction[0]?.persona || "N/A",
      leastFriction:
        sortedByFriction[sortedByFriction.length - 1]?.persona || "N/A",
      avgCompletionTime: Math.round(avgTime),
      commonFrictionPoints: commonFriction,
    },
    recommendations,
  };

  return comparison;
}

/**
 * Generate a formatted comparison report with cognitive insights.
 */
export function formatComparisonReport(
  comparison: PersonaComparisonResult
): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(
    "================================================================================"
  );
  lines.push(
    "              COGNITIVE PERSONA COMPARISON REPORT                              "
  );
  lines.push(
    "================================================================================"
  );
  lines.push("");
  lines.push(`URL: ${comparison.url}`);
  lines.push(`Goal: ${comparison.goal}`);
  lines.push(`Total Duration: ${(comparison.duration / 1000).toFixed(1)}s`);
  lines.push(`Timestamp: ${comparison.timestamp}`);
  lines.push("");

  // Results table with cognitive state
  lines.push(
    "+-------------------+--------+--------+-------+----------+----------+----------+"
  );
  lines.push(
    "| Persona           | Result | Time   | Steps | Patience | Frustrat | Friction |"
  );
  lines.push(
    "+-------------------+--------+--------+-------+----------+----------+----------+"
  );

  for (const result of comparison.personas) {
    const name = result.persona.padEnd(17).slice(0, 17);
    const success = result.success ? "PASS" : "FAIL";
    const time = `${(result.totalTime / 1000).toFixed(0)}s`.padEnd(6);
    const steps = `${result.stepCount}`.padEnd(5);
    const patience = result.cognitive
      ? `${Math.round(result.cognitive.patienceRemaining * 100)}%`.padEnd(8)
      : "N/A".padEnd(8);
    const frustration = result.cognitive
      ? `${Math.round(result.cognitive.frustrationLevel * 100)}%`.padEnd(8)
      : "N/A".padEnd(8);
    const friction = `${result.frictionCount}`.padEnd(8);

    lines.push(
      `| ${name} | ${success.padEnd(6)} | ${time} | ${steps} | ${patience} | ${frustration} | ${friction} |`
    );
  }

  lines.push(
    "+-------------------+--------+--------+-------+----------+----------+----------+"
  );
  lines.push("");

  // Abandonment breakdown
  const abandonedPersonas = comparison.personas.filter((r) => !r.success);
  if (abandonedPersonas.length > 0) {
    lines.push("ABANDONMENT ANALYSIS");
    lines.push("-".repeat(60));
    for (const p of abandonedPersonas) {
      const reason = p.cognitive?.abandonmentReason || "unknown";
      lines.push(`  ${p.persona}: ${reason.toUpperCase()}`);
      if (p.cognitive?.monologue && p.cognitive.monologue.length > 0) {
        const lastThought =
          p.cognitive.monologue[p.cognitive.monologue.length - 1];
        lines.push(`    Last thought: "${lastThought.substring(0, 80)}..."`);
      }
    }
    lines.push("");
  }

  // Summary
  lines.push("SUMMARY");
  lines.push("-".repeat(60));
  lines.push(`  Total Personas: ${comparison.summary.totalPersonas}`);
  lines.push(
    `  Success Rate: ${comparison.summary.successCount}/${comparison.summary.totalPersonas} (${Math.round((comparison.summary.successCount / comparison.summary.totalPersonas) * 100)}%)`
  );
  lines.push(
    `  Avg Completion Time: ${(comparison.summary.avgCompletionTime / 1000).toFixed(1)}s`
  );
  lines.push(`  Fastest: ${comparison.summary.fastestPersona}`);
  lines.push(`  Slowest: ${comparison.summary.slowestPersona}`);
  lines.push(`  Most Friction: ${comparison.summary.mostFriction}`);
  lines.push(`  Least Friction: ${comparison.summary.leastFriction}`);
  lines.push("");

  // Recommendations
  lines.push("RECOMMENDATIONS");
  lines.push("-".repeat(60));
  for (const rec of comparison.recommendations) {
    lines.push(`  ${rec}`);
  }
  lines.push("");

  return lines.join("\n");
}
