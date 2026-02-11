/**
 * CBrowser MCP Tools - Persona Comparison Tools
 *
 * @copyright 2026 WF Media (Alexandria Eden) alexandria.shai.eden@gmail.com
 * @license BSL-1.1 (Business Source License 1.1)
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import { comparePersonas } from "../../analysis/index.js";
import { isApiKeyConfigured } from "../../cognitive/index.js";
import {
  getAnyPersona,
  getCognitiveProfile,
  createCognitivePersona,
} from "../../personas.js";
import type { Persona, AccessibilityPersona, CognitiveState } from "../../types.js";

/**
 * Register persona comparison tools (3 tools: compare_personas, compare_personas_init, compare_personas_complete)
 */
export function registerPersonaComparisonTools(
  server: McpServer,
  _context: ToolRegistrationContext
): void {
  server.tool(
    "compare_personas",
    "Compare how different user personas experience a journey. In Claude Code sessions (no API key), use compare_personas_init and compare_personas_complete instead for the bridge workflow.",
    {
      url: z.string().url().describe("Starting URL"),
      goal: z.string().describe("Goal to accomplish"),
      personas: z.array(z.string()).describe("Persona names to compare"),
    },
    async ({ url, goal, personas }) => {
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

  server.tool(
    "compare_personas_init",
    "Initialize persona comparison for Claude Code bridge workflow. Returns persona profiles and instructions for running journeys without API key.",
    {
      url: z.string().url().describe("Starting URL for all journeys"),
      goal: z.string().describe("Goal to accomplish"),
      personas: z.array(z.string()).describe("Persona names to compare (e.g., ['first-timer', 'power-user', 'elderly-user'])"),
    },
    async ({ url, goal, personas }) => {
      const personaProfiles = personas.map((personaName) => {
        const existingPersona = getAnyPersona(personaName);
        let personaObj: Persona | AccessibilityPersona;

        if (!existingPersona) {
          personaObj = createCognitivePersona(personaName, personaName, {});
        } else {
          personaObj = existingPersona;
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

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              mode: "compare_personas_bridge",
              url,
              goal,
              personaCount: personas.length,
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

  server.tool(
    "compare_personas_complete",
    "Complete persona comparison by aggregating journey results. Call this after running all persona journeys via the bridge workflow.",
    {
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
    async ({ url, goal, journeyResults }) => {
      const startTime = Date.now();

      const successfulResults = journeyResults.filter((r) => r.goalAchieved);
      const failedResults = journeyResults.filter((r) => !r.goalAchieved);

      const sortedByTime = [...successfulResults].sort((a, b) => a.totalTime - b.totalTime);
      const sortedByFriction = [...journeyResults].sort((a, b) => b.frictionPoints.length - a.frictionPoints.length);

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
          fastestPersona: sortedByTime[0]?.persona || "N/A",
          slowestPersona: sortedByTime[sortedByTime.length - 1]?.persona || "N/A",
          mostFriction: sortedByFriction[0]?.persona || "N/A",
          leastFriction: sortedByFriction[sortedByFriction.length - 1]?.persona || "N/A",
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
}
