/**
 * CBrowser MCP Tools - Cognitive Simulation Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import {
  getPersona,
  getAnyPersona,
  listPersonas,
  getCognitiveProfile,
  createCognitivePersona,
} from "../../personas.js";
import { listAccessibilityPersonas, getAccessibilityPersona } from "../../personas.js";
import { getPersonaValues, rankInfluencePatternsForProfile } from "../../values/index.js";
import type {
  CognitiveState,
  AbandonmentThresholds,
  CognitiveTraits,
  Persona,
  AccessibilityPersona,
} from "../../types.js";

/**
 * Register cognitive simulation tools (3 tools: cognitive_journey_init, cognitive_journey_update_state, list_cognitive_personas)
 */
export function registerCognitiveTools(
  server: McpServer,
  { getBrowser }: ToolRegistrationContext
): void {
  server.tool(
    "cognitive_journey_init",
    "Initialize a cognitive user journey simulation. Returns the persona's cognitive profile, initial state, and abandonment thresholds. The actual simulation is driven by the LLM using browser tools (navigate, click, fill, screenshot) while tracking cognitive state.",
    {
      persona: z.string().describe("Persona name (e.g., 'first-timer', 'elderly-user', 'power-user') or custom description"),
      goal: z.string().describe("What the simulated user is trying to accomplish"),
      startUrl: z.string().url().describe("Starting URL for the journey"),
      customTraits: z.object({
        patience: z.number().min(0).max(1).optional(),
        riskTolerance: z.number().min(0).max(1).optional(),
        comprehension: z.number().min(0).max(1).optional(),
        persistence: z.number().min(0).max(1).optional(),
        curiosity: z.number().min(0).max(1).optional(),
        workingMemory: z.number().min(0).max(1).optional(),
        readingTendency: z.number().min(0).max(1).optional(),
        resilience: z.number().min(0).max(1).optional(),
        selfEfficacy: z.number().min(0).max(1).optional(),
        satisficing: z.number().min(0).max(1).optional(),
        trustCalibration: z.number().min(0).max(1).optional(),
        interruptRecovery: z.number().min(0).max(1).optional(),
        informationForaging: z.number().min(0).max(1).optional(),
        changeBlindness: z.number().min(0).max(1).optional(),
        anchoringBias: z.number().min(0).max(1).optional(),
        timeHorizon: z.number().min(0).max(1).optional(),
        attributionStyle: z.number().min(0).max(1).optional(),
        metacognitivePlanning: z.number().min(0).max(1).optional(),
        proceduralFluency: z.number().min(0).max(1).optional(),
        transferLearning: z.number().min(0).max(1).optional(),
        authoritySensitivity: z.number().min(0).max(1).optional(),
        emotionalContagion: z.number().min(0).max(1).optional(),
        fearOfMissingOut: z.number().min(0).max(1).optional(),
        socialProofSensitivity: z.number().min(0).max(1).optional(),
        mentalModelRigidity: z.number().min(0).max(1).optional(),
      }).optional().describe("Override specific cognitive traits (25 available)"),
    },
    async ({ persona: personaName, goal, startUrl, customTraits }) => {
      const existingPersona = getAnyPersona(personaName);
      let personaObj: Persona | AccessibilityPersona;

      if (!existingPersona) {
        personaObj = createCognitivePersona(personaName, personaName, customTraits || {});
      } else if (customTraits) {
        const defaultTraits: CognitiveTraits = {
          patience: 0.5,
          riskTolerance: 0.5,
          comprehension: 0.5,
          persistence: 0.5,
          curiosity: 0.5,
          workingMemory: 0.5,
          readingTendency: 0.5,
          resilience: 0.5,
          selfEfficacy: 0.5,
          satisficing: 0.5,
          trustCalibration: 0.5,
          interruptRecovery: 0.5,
          informationForaging: 0.5,
          changeBlindness: 0.3,
          anchoringBias: 0.5,
          timeHorizon: 0.5,
          attributionStyle: 0.5,
          metacognitivePlanning: 0.5,
          proceduralFluency: 0.5,
          transferLearning: 0.5,
          authoritySensitivity: 0.5,
          emotionalContagion: 0.5,
          fearOfMissingOut: 0.5,
          socialProofSensitivity: 0.5,
          mentalModelRigidity: 0.5,
        };
        personaObj = {
          ...existingPersona,
          cognitiveTraits: {
            ...defaultTraits,
            ...(existingPersona.cognitiveTraits || {}),
            ...customTraits,
          },
        };
      } else {
        personaObj = existingPersona;
      }

      const profile = getCognitiveProfile(personaObj);

      const initialState: CognitiveState = {
        patienceRemaining: 1.0,
        confusionLevel: 0.0,
        frustrationLevel: 0.0,
        goalProgress: 0.0,
        confidenceLevel: 0.5,
        currentMood: "neutral",
        memory: {
          pagesVisited: [startUrl],
          actionsAttempted: [],
          errorsEncountered: [],
          backtrackCount: 0,
        },
        timeElapsed: 0,
        stepCount: 0,
      };

      const traits = profile.traits;
      const thresholds: AbandonmentThresholds = {
        patienceMin: 0.1,
        confusionMax: traits.comprehension < 0.4 ? 0.6 : 0.8,
        frustrationMax: traits.patience < 0.3 ? 0.7 : 0.85,
        maxStepsWithoutProgress: traits.persistence > 0.7 ? 15 : 10,
        loopDetectionThreshold: 3,
        timeLimit: traits.patience > 0.7 ? 180 : (traits.patience < 0.3 ? 60 : 120),
      };

      const b = await getBrowser();
      await b.navigate(startUrl);

      const personaValues = getPersonaValues(personaObj.name);
      const influencePatterns = personaValues
        ? rankInfluencePatternsForProfile(personaValues).slice(0, 5)
        : undefined;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              persona: {
                name: personaObj.name,
                description: personaObj.description,
                demographics: personaObj.demographics,
                values: personaValues ? {
                  schwartz: {
                    selfDirection: personaValues.selfDirection,
                    stimulation: personaValues.stimulation,
                    hedonism: personaValues.hedonism,
                    achievement: personaValues.achievement,
                    power: personaValues.power,
                    security: personaValues.security,
                    conformity: personaValues.conformity,
                    tradition: personaValues.tradition,
                    benevolence: personaValues.benevolence,
                    universalism: personaValues.universalism,
                  },
                  higherOrder: {
                    openness: personaValues.openness,
                    selfEnhancement: personaValues.selfEnhancement,
                    conservation: personaValues.conservation,
                    selfTranscendence: personaValues.selfTranscendence,
                  },
                  sdt: {
                    autonomyNeed: personaValues.autonomyNeed,
                    competenceNeed: personaValues.competenceNeed,
                    relatednessNeed: personaValues.relatednessNeed,
                  },
                  maslowLevel: personaValues.maslowLevel,
                } : undefined,
                influenceSusceptibility: influencePatterns?.map(ip => ({
                  pattern: ip.pattern.name,
                  susceptibility: ip.susceptibility,
                })),
              },
              cognitiveProfile: profile,
              initialState,
              abandonmentThresholds: thresholds,
              goal,
              startUrl,
              instructions: `
COGNITIVE JOURNEY SIMULATION INSTRUCTIONS:

You are now simulating a "${personaObj.name}" user with these cognitive traits:
- Patience: ${profile.traits.patience.toFixed(2)} ${profile.traits.patience < 0.3 ? "(impatient - will give up quickly)" : profile.traits.patience > 0.7 ? "(patient - will persist)" : "(moderate)"}
- Risk Tolerance: ${profile.traits.riskTolerance.toFixed(2)} ${profile.traits.riskTolerance < 0.3 ? "(cautious - hesitates)" : profile.traits.riskTolerance > 0.7 ? "(bold - clicks freely)" : "(moderate)"}
- Comprehension: ${profile.traits.comprehension.toFixed(2)} ${profile.traits.comprehension < 0.3 ? "(struggles with UI)" : profile.traits.comprehension > 0.7 ? "(expert at UI patterns)" : "(moderate)"}
- Reading Tendency: ${profile.traits.readingTendency.toFixed(2)} ${profile.traits.readingTendency < 0.3 ? "(scans only)" : profile.traits.readingTendency > 0.7 ? "(reads everything)" : "(selective reader)"}

Attention Pattern: ${profile.attentionPattern}
Decision Style: ${profile.decisionStyle}

GOAL: "${goal}"

SIMULATION LOOP:
1. PERCEIVE - Use screenshot/snapshot to see the page. Filter by attention pattern.
2. COMPREHEND - Interpret elements as this persona would (lower comprehension = more confusion)
3. DECIDE - Choose action based on traits. Generate inner monologue.
4. EXECUTE - Use click/fill/navigate tools.
5. EVALUATE - Update cognitive state after each action:
   - patienceRemaining -= 0.02 + (frustrationLevel × 0.05)
   - confusionLevel changes based on UI clarity
   - frustrationLevel increases on failures
6. CHECK ABANDONMENT - If thresholds exceeded, end journey with appropriate message.
7. LOOP - Return to PERCEIVE until goal achieved or abandoned.

ABANDONMENT TRIGGERS:
- Patience < ${thresholds.patienceMin}: "This is taking too long. I give up."
- Confusion > ${thresholds.confusionMax} for 30s: "I have no idea what to do."
- Frustration > ${thresholds.frustrationMax}: "This is so frustrating!"
- No progress after ${thresholds.maxStepsWithoutProgress} steps: "I'm not getting anywhere."
- Same page ${thresholds.loopDetectionThreshold}x: "I keep ending up here."
- Time > ${thresholds.timeLimit}s: "I've spent too long on this."

Begin the simulation now. Narrate your thoughts as this persona.
`,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "cognitive_journey_update_state",
    "Update the cognitive state during a journey simulation. Call this after each action to track mental state.",
    {
      currentState: z.object({
        patienceRemaining: z.number(),
        confusionLevel: z.number(),
        frustrationLevel: z.number(),
        goalProgress: z.number(),
        confidenceLevel: z.number(),
        currentMood: z.enum(["neutral", "hopeful", "confused", "frustrated", "defeated", "relieved"]),
        stepCount: z.number(),
        timeElapsed: z.number(),
      }).describe("Current cognitive state"),
      actionResult: z.object({
        success: z.boolean(),
        wasConfusing: z.boolean().optional(),
        progressMade: z.boolean().optional(),
        wentBack: z.boolean().optional(),
      }).describe("Result of the last action"),
      personaTraits: z.object({
        patience: z.number(),
        riskTolerance: z.number(),
        comprehension: z.number(),
        persistence: z.number(),
      }).describe("Persona traits affecting state changes"),
    },
    async ({ currentState, actionResult, personaTraits }) => {
      let newPatienceRemaining = currentState.patienceRemaining - 0.02;
      let newConfusionLevel = currentState.confusionLevel;
      let newFrustrationLevel = currentState.frustrationLevel;
      let newConfidenceLevel = currentState.confidenceLevel;
      let newMood = currentState.currentMood;

      newPatienceRemaining -= currentState.frustrationLevel * 0.05;

      if (actionResult.success) {
        newConfusionLevel = Math.max(0, newConfusionLevel - 0.1);
        newFrustrationLevel = Math.max(0, newFrustrationLevel - 0.05);

        if (actionResult.progressMade) {
          newConfidenceLevel = Math.min(1, newConfidenceLevel + 0.1);
          if (newMood === "confused" || newMood === "frustrated") {
            newMood = "hopeful";
          }
        }
      } else {
        newFrustrationLevel = Math.min(1, newFrustrationLevel + 0.2);

        if (newFrustrationLevel > 0.7) {
          newMood = "frustrated";
        }
        if (newFrustrationLevel > 0.8 && personaTraits.persistence < 0.5) {
          newMood = "defeated";
        }
      }

      if (actionResult.wasConfusing) {
        newConfusionLevel = Math.min(1, newConfusionLevel + (1 - personaTraits.comprehension) * 0.15);

        if (newConfusionLevel > 0.5 && newMood !== "frustrated") {
          newMood = "confused";
        }
      }

      if (actionResult.wentBack) {
        newConfidenceLevel = Math.max(0, newConfidenceLevel - 0.15);
      }

      const newState: Partial<CognitiveState> = {
        patienceRemaining: Math.max(0, newPatienceRemaining),
        confusionLevel: newConfusionLevel,
        frustrationLevel: newFrustrationLevel,
        confidenceLevel: newConfidenceLevel,
        currentMood: newMood as CognitiveState["currentMood"],
        stepCount: currentState.stepCount + 1,
        timeElapsed: currentState.timeElapsed + 2,
      };

      let shouldAbandon = false;
      let abandonmentReason: string | undefined;
      let abandonmentMessage: string | undefined;

      if (newState.patienceRemaining! < 0.1) {
        shouldAbandon = true;
        abandonmentReason = "patience";
        abandonmentMessage = "This is taking too long. I give up.";
      } else if (newState.frustrationLevel! > 0.85) {
        shouldAbandon = true;
        abandonmentReason = "frustration";
        abandonmentMessage = "This is so frustrating! I'm done.";
      } else if (newState.confusionLevel! > 0.8 && currentState.confusionLevel > 0.8) {
        shouldAbandon = true;
        abandonmentReason = "confusion";
        abandonmentMessage = "I have no idea what I'm supposed to do here.";
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              newState,
              shouldAbandon,
              abandonmentReason,
              abandonmentMessage,
              stateChange: {
                patienceDelta: newState.patienceRemaining! - currentState.patienceRemaining,
                confusionDelta: newState.confusionLevel! - currentState.confusionLevel,
                frustrationDelta: newState.frustrationLevel! - currentState.frustrationLevel,
              },
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "list_cognitive_personas",
    "List all available personas with their cognitive traits (includes accessibility and emotional personas)",
    {},
    async () => {
      const builtinNames = listPersonas();
      const accessibilityNames = listAccessibilityPersonas();

      const builtinPersonas = builtinNames.map(name => {
        const p = getPersona(name);
        if (!p) return null;
        const profile = getCognitiveProfile(p);
        const values = getPersonaValues(p.name);
        return {
          name: p.name,
          description: p.description,
          category: "builtin",
          demographics: p.demographics,
          cognitiveTraits: profile.traits,
          attentionPattern: profile.attentionPattern,
          decisionStyle: profile.decisionStyle,
          values: values ? {
            schwartz: {
              selfDirection: values.selfDirection,
              stimulation: values.stimulation,
              hedonism: values.hedonism,
              achievement: values.achievement,
              power: values.power,
              security: values.security,
              conformity: values.conformity,
              tradition: values.tradition,
              benevolence: values.benevolence,
              universalism: values.universalism,
            },
            higherOrder: {
              openness: values.openness,
              selfEnhancement: values.selfEnhancement,
              conservation: values.conservation,
              selfTranscendence: values.selfTranscendence,
            },
            sdt: {
              autonomyNeed: values.autonomyNeed,
              competenceNeed: values.competenceNeed,
              relatednessNeed: values.relatednessNeed,
            },
            maslowLevel: values.maslowLevel,
          } : undefined,
        };
      }).filter(Boolean);

      const accessibilityPersonas = accessibilityNames.map(name => {
        const p = getAccessibilityPersona(name);
        if (!p) return null;
        const traits = p.accessibilityTraits;
        let disabilityType = "General accessibility";
        const barrierTypes: string[] = [];

        if (traits?.tremor) {
          disabilityType = "Motor impairment (tremor)";
          barrierTypes.push("motor_precision", "touch_target");
        }
        if (traits?.visionLevel !== undefined && traits.visionLevel < 0.5) {
          disabilityType = "Low vision";
          barrierTypes.push("visual_clarity", "contrast");
        }
        if (traits?.colorBlindness) {
          disabilityType = `Color blindness (${traits.colorBlindness})`;
          barrierTypes.push("sensory");
        }
        if (traits?.processingSpeed !== undefined && traits.processingSpeed < 0.6) {
          disabilityType = "Cognitive (Processing)";
          barrierTypes.push("cognitive_load", "temporal");
        }
        if (traits?.attentionSpan !== undefined && traits.attentionSpan < 0.5) {
          if (!disabilityType.includes("Cognitive")) {
            disabilityType = "Cognitive (ADHD/Attention)";
          }
          barrierTypes.push("cognitive_load");
        }
        if (disabilityType === "General accessibility") {
          if (p.name.includes("deaf") || p.name.includes("hearing")) disabilityType = "Hearing impairment";
          else if (p.name.includes("motor")) disabilityType = "Motor impairment";
          else if (p.name.includes("vision") || p.name.includes("blind")) disabilityType = "Vision impairment";
          else if (p.name.includes("cognitive") || p.name.includes("adhd")) disabilityType = "Cognitive";
        }

        const values = getPersonaValues(p.name);
        return {
          name: p.name,
          description: p.description,
          category: "accessibility",
          disabilityType,
          demographics: p.demographics,
          cognitiveTraits: p.cognitiveTraits || {},
          barrierTypes: [...new Set(barrierTypes)],
          values: values ? {
            schwartz: {
              selfDirection: values.selfDirection,
              stimulation: values.stimulation,
              hedonism: values.hedonism,
              achievement: values.achievement,
              power: values.power,
              security: values.security,
              conformity: values.conformity,
              tradition: values.tradition,
              benevolence: values.benevolence,
              universalism: values.universalism,
            },
            higherOrder: {
              openness: values.openness,
              selfEnhancement: values.selfEnhancement,
              conservation: values.conservation,
              selfTranscendence: values.selfTranscendence,
            },
            sdt: {
              autonomyNeed: values.autonomyNeed,
              competenceNeed: values.competenceNeed,
              relatednessNeed: values.relatednessNeed,
            },
            maslowLevel: values.maslowLevel,
          } : undefined,
        };
      }).filter(Boolean);

      const allPersonas = [...builtinPersonas, ...accessibilityPersonas];

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              personas: allPersonas,
              count: allPersonas.length,
              categories: {
                builtin: builtinPersonas.length,
                accessibility: accessibilityPersonas.length,
              },
            }, null, 2),
          },
        ],
      };
    }
  );
}
