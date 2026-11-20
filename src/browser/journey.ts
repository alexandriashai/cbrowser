/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Journeys
 *
 * The heuristic journey.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import { getPersonaOrRefuse } from "../personas.js";
import type { JourneyResult, JourneyOptions } from "../types.js";
import { runCognitiveJourney, isApiKeyConfigured } from "../cognitive/index.js";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Journeys
// =========================================================================

export async function journey(this: CBrowser, options: JourneyOptions): Promise<JourneyResult> {
  const { persona: personaName, startUrl, goal, maxSteps = 20, maxTime = 120 } = options;

  if (!isApiKeyConfigured()) {
    throw new Error("A journey needs an Anthropic API key (cbrowser config set-api-key <key>). The keyless heuristic explorer was removed in 20.0.0 because its results were not accurate.");
  }
  // Refuse an unknown persona before spending tokens.
  this.currentPersona = getPersonaOrRefuse(personaName);

  const cognitiveResult = await runCognitiveJourney({
    persona: personaName,
    startUrl,
    goal,
    maxSteps,
    maxTime,
    headless: this.config.headless,
    vision: false,
    verbose: false,
  });

  return {
    persona: personaName,
    goal,
    steps: cognitiveResult.frictionPoints.map((fp) => ({
      action: fp.type,
      target: fp.element || 'page',
      result: fp.monologue.substring(0, 100),
      screenshot: fp.screenshot,
      timestamp: new Date().toISOString(),
    })),
    success: cognitiveResult.goalAchieved,
    frictionPoints: cognitiveResult.frictionPoints.map(fp =>
      `${fp.type}: ${fp.monologue.substring(0, 80)}`
    ),
    totalTime: cognitiveResult.totalTime * 1000, // Convert to ms
    consoleLogs: [],
    cognitive: {
      patienceRemaining: cognitiveResult.finalState.patienceRemaining,
      frustrationLevel: cognitiveResult.finalState.frustrationLevel,
      confusionLevel: cognitiveResult.finalState.confusionLevel,
      abandonmentReason: cognitiveResult.abandonmentReason,
      backtrackCount: cognitiveResult.summary.backtrackCount,
      monologue: cognitiveResult.fullMonologue,
    },
  };
}
