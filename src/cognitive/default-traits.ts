/**
 * The full trait set a journey starts from when a caller overrides some of a
 * persona's traits: every trait at the registered default
 * (journey.defaultTrait), changeBlindness at its own
 * (journey.defaultTrait.changeBlindness). runCognitiveJourney and
 * cognitive_journey_init both merge persona and caller traits over it; until
 * 21.0 each carried its own copy of the table.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { CognitiveTraits } from "../types.js";
import { param } from "../visual/model-provenance.js";

export function defaultJourneyTraits(): CognitiveTraits {
  const v = param("journey.defaultTrait");
  return {
    // Required traits (7)
    patience: v,
    riskTolerance: v,
    comprehension: v,
    persistence: v,
    curiosity: v,
    workingMemory: v,
    readingTendency: v,
    // Optional traits - Tier 1: Core
    resilience: v,
    selfEfficacy: v,
    satisficing: v,
    trustCalibration: v,
    interruptRecovery: v,
    // Optional traits - Tier 2+
    informationForaging: v,
    changeBlindness: param("journey.defaultTrait.changeBlindness"),
    anchoringBias: v,
    timeHorizon: v,
    attributionStyle: v,
    metacognitivePlanning: v,
    proceduralFluency: v,
    transferLearning: v,
    authoritySensitivity: v,
    emotionalContagion: v,
    fearOfMissingOut: v,
    socialProofSensitivity: v,
    mentalModelFlexibility: v,
    siteFamiliarity: v,
  };
}
