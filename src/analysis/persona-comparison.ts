/**
 * Multi-Persona Comparison Testing
 *
 * Tier 6: Run the same user journey with multiple personas in parallel
 * to compare how different user types experience your application.
 */

import { CBrowser } from "../browser.js";
import { getPersona, BUILTIN_PERSONAS } from "../personas.js";
import type { PersonaJourneyResult, PersonaComparisonResult } from "../types.js";

export interface ComparePersonasOptions {
  /** Starting URL for the journey */
  startUrl: string;
  /** Goal to accomplish */
  goal: string;
  /** Personas to compare (names) */
  personas: string[];
  /** Maximum steps per journey */
  maxSteps?: number;
  /** Maximum concurrent browsers */
  maxConcurrency?: number;
  /** Headless mode */
  headless?: boolean;
}

/**
 * Run the same journey with multiple personas and compare results.
 * This runs personas in parallel (up to maxConcurrency) for efficiency.
 */
export async function comparePersonas(
  options: ComparePersonasOptions
): Promise<PersonaComparisonResult> {
  const {
    startUrl,
    goal,
    personas,
    maxSteps = 20,
    maxConcurrency = 3,
    headless = true,
  } = options;

  const startTime = Date.now();
  const results: PersonaJourneyResult[] = [];

  console.log(`\n  Comparing ${personas.length} personas...`);
  console.log(`   URL: ${startUrl}`);
  console.log(`   Goal: ${goal}`);
  console.log(`   Concurrency: ${maxConcurrency}\n`);

  // Process personas in batches
  for (let i = 0; i < personas.length; i += maxConcurrency) {
    const batch = personas.slice(i, i + maxConcurrency);

    console.log(`  Batch ${Math.floor(i / maxConcurrency) + 1}: ${batch.join(", ")}`);

    const batchPromises = batch.map(async (personaName) => {
      const browser = new CBrowser({ headless });

      try {
        const persona = getPersona(personaName) || BUILTIN_PERSONAS["first-timer"];
        const journeyStart = Date.now();

        // Run the journey
        const journey = await browser.journey({
          persona: personaName,
          startUrl,
          goal,
          maxSteps,
        });

        // Calculate average reaction time from persona config
        const timing = persona.humanBehavior?.timing;
        const avgReactionTime = timing
          ? (timing.reactionTime.min + timing.reactionTime.max) / 2
          : 500;

        // Calculate error rate from persona config
        const errors = persona.humanBehavior?.errors;
        const errorRate = errors
          ? (errors.misClickRate + errors.typoRate) / 2
          : 0.05;

        const result: PersonaJourneyResult = {
          persona: personaName,
          description: persona.description,
          techLevel: persona.demographics.tech_level || "intermediate",
          device: persona.demographics.device || "desktop",
          success: journey.success,
          totalTime: journey.totalTime,
          stepCount: journey.steps.length,
          frictionCount: journey.frictionPoints.length,
          frictionPoints: journey.frictionPoints,
          avgReactionTime,
          errorRate,
          screenshots: {
            start: journey.steps[0]?.screenshot || "",
            end: journey.steps[journey.steps.length - 1]?.screenshot || "",
          },
        };

        console.log(`    ${personaName}: ${journey.success ? "SUCCESS" : "FAILED"} (${journey.totalTime}ms, ${journey.frictionPoints.length} friction)`);

        return result;
      } catch (e: any) {
        console.log(`    ${personaName}: ERROR - ${e.message}`);

        return {
          persona: personaName,
          description: "Unknown",
          techLevel: "unknown",
          device: "unknown",
          success: false,
          totalTime: 0,
          stepCount: 0,
          frictionCount: 1,
          frictionPoints: [`Error: ${e.message}`],
          avgReactionTime: 0,
          errorRate: 0,
          screenshots: { start: "", end: "" },
        } as PersonaJourneyResult;
      } finally {
        await browser.close();
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  // Generate summary
  const successfulResults = results.filter((r) => r.success);
  const failedResults = results.filter((r) => !r.success);

  const sortedByTime = [...successfulResults].sort((a, b) => a.totalTime - b.totalTime);
  const sortedByFriction = [...results].sort((a, b) => b.frictionCount - a.frictionCount);

  // Collect all friction points
  const allFrictionPoints = results.flatMap((r) => r.frictionPoints);
  const frictionCounts = allFrictionPoints.reduce((acc, fp) => {
    acc[fp] = (acc[fp] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const commonFriction = Object.entries(frictionCounts)
    .filter(([_, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([fp]) => fp);

  // Generate recommendations
  const recommendations: string[] = [];

  if (failedResults.length > 0) {
    recommendations.push(
      `${failedResults.length} persona(s) failed to complete the journey: ${failedResults.map((r) => r.persona).join(", ")}`
    );
  }

  if (sortedByFriction[0]?.frictionCount > 0) {
    recommendations.push(
      `"${sortedByFriction[0].persona}" experienced the most friction (${sortedByFriction[0].frictionCount} points) - review for accessibility improvements`
    );
  }

  const beginnerPersonas = results.filter((r) => r.techLevel === "beginner");
  const expertPersonas = results.filter((r) => r.techLevel === "expert");

  if (beginnerPersonas.length > 0 && expertPersonas.length > 0) {
    const avgBeginnerTime = beginnerPersonas.reduce((sum, r) => sum + r.totalTime, 0) / beginnerPersonas.length;
    const avgExpertTime = expertPersonas.reduce((sum, r) => sum + r.totalTime, 0) / expertPersonas.length;

    if (avgBeginnerTime > avgExpertTime * 3) {
      recommendations.push(
        `Beginners take ${(avgBeginnerTime / avgExpertTime).toFixed(1)}x longer than experts - consider adding more guidance`
      );
    }
  }

  const mobilePersonas = results.filter((r) => r.device === "mobile");
  const desktopPersonas = results.filter((r) => r.device === "desktop");

  if (mobilePersonas.length > 0 && desktopPersonas.length > 0) {
    const mobileFriction = mobilePersonas.reduce((sum, r) => sum + r.frictionCount, 0) / mobilePersonas.length;
    const desktopFriction = desktopPersonas.reduce((sum, r) => sum + r.frictionCount, 0) / desktopPersonas.length;

    if (mobileFriction > desktopFriction * 2) {
      recommendations.push(
        `Mobile users experience ${(mobileFriction / desktopFriction).toFixed(1)}x more friction - review mobile UX`
      );
    }
  }

  if (commonFriction.length > 0) {
    recommendations.push(
      `Common friction points across personas: ${commonFriction.slice(0, 3).join("; ")}`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push("All personas completed the journey without significant issues");
  }

  const avgTime = successfulResults.length > 0
    ? successfulResults.reduce((sum, r) => sum + r.totalTime, 0) / successfulResults.length
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
      slowestPersona: sortedByTime[sortedByTime.length - 1]?.persona || "N/A",
      mostFriction: sortedByFriction[0]?.persona || "N/A",
      leastFriction: sortedByFriction[sortedByFriction.length - 1]?.persona || "N/A",
      avgCompletionTime: Math.round(avgTime),
      commonFrictionPoints: commonFriction,
    },
    recommendations,
  };

  return comparison;
}

/**
 * Generate a formatted comparison report.
 */
export function formatComparisonReport(comparison: PersonaComparisonResult): string {
  const lines: string[] = [];

  lines.push("");
  lines.push("================================================================================");
  lines.push("                    MULTI-PERSONA COMPARISON REPORT                           ");
  lines.push("================================================================================");
  lines.push("");
  lines.push(`URL: ${comparison.url}`);
  lines.push(`Goal: ${comparison.goal}`);
  lines.push(`Total Duration: ${(comparison.duration / 1000).toFixed(1)}s`);
  lines.push(`Timestamp: ${comparison.timestamp}`);
  lines.push("");

  // Results table
  lines.push("+---------------------+----------+----------+----------+----------+-----------------------------+");
  lines.push("| Persona             | Success  | Time     | Steps    | Friction | Key Issues                  |");
  lines.push("+---------------------+----------+----------+----------+----------+-----------------------------+");

  for (const result of comparison.personas) {
    const name = result.persona.padEnd(19).slice(0, 19);
    const success = result.success ? "Y".padEnd(8) : "N".padEnd(8);
    const time = `${(result.totalTime / 1000).toFixed(1)}s`.padEnd(8);
    const steps = `${result.stepCount}`.padEnd(8);
    const friction = `${result.frictionCount}`.padEnd(8);
    const issues = (result.frictionPoints[0] || "-").slice(0, 27).padEnd(27);

    lines.push(`| ${name} | ${success} | ${time} | ${steps} | ${friction} | ${issues} |`);
  }

  lines.push("+---------------------+----------+----------+----------+----------+-----------------------------+");
  lines.push("");

  // Summary
  lines.push("SUMMARY");
  lines.push("-".repeat(60));
  lines.push(`  Total Personas: ${comparison.summary.totalPersonas}`);
  lines.push(`  Success Rate: ${comparison.summary.successCount}/${comparison.summary.totalPersonas} (${Math.round((comparison.summary.successCount / comparison.summary.totalPersonas) * 100)}%)`);
  lines.push(`  Avg Completion Time: ${(comparison.summary.avgCompletionTime / 1000).toFixed(1)}s`);
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
