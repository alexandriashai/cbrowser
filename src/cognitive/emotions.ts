/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Emotional State Engine for Cognitive Browser Automation
 *
 * Implements emotional state modeling based on:
 * - Scherer's Component Process Model of Emotion (2001)
 * - Russell's Circumplex Model of Affect (1980)
 * - Ortony, Clore & Collins (OCC) Model (1988)
 *
 * Emotions affect:
 * - Abandonment thresholds
 * - Exploration behavior
 * - Decision-making speed
 * - Error recovery
 */

import type {
  EmotionalState,
  EmotionalEvent,
  EmotionalTrigger,
  EmotionalConfig,
  EmotionType,
  CognitiveTraits,
} from "../types.js";
import { param } from "../visual/model-provenance.js";

// ============================================================================
// Constants
// ============================================================================
//
// Every number this engine computes with is registered, with where it comes
// from, in src/visual/provenance/emotion.ts and read here through param().
// None is fitted or published: each entry says what data would set it.

/** Default sensitivity to emotional events (the trigger table is written at sensitivity 1) */
const DEFAULT_SENSITIVITY = 1.0;

/** A trait a persona does not set (src/visual/provenance/journey.ts). */
const traitDefault = () => param("journey.defaultTrait");

/** Emotion valence (-1 to +1); neutral is 0 by definition. */
function emotionValence(emotion: EmotionType): number {
  return emotion === "neutral" ? 0 : param(`emotion.valence.${emotion}`);
}

/** Emotion arousal (0 to 1). */
function emotionArousal(emotion: EmotionType): number {
  return param(`emotion.arousal.${emotion}`);
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create an initial emotional state based on persona traits.
 *
 * - Low patience → higher baseline anxiety
 * - High curiosity → higher baseline excitement
 * - Low resilience → higher sensitivity to frustration
 */
export function createInitialEmotionalState(
  traits?: Partial<CognitiveTraits>
): EmotionalState {
  const patience = traits?.patience ?? traitDefault();
  const curiosity = traits?.curiosity ?? traitDefault();
  const selfEfficacy = traits?.selfEfficacy ?? traitDefault();

  // Baseline emotions influenced by traits
  const baseAnxiety = Math.max(0, param("emotion.baseline.anxiety") + (1 - patience) * param("emotion.baseline.anxietyPerImpatience") + (1 - selfEfficacy) * param("emotion.baseline.anxietyPerLowEfficacy"));
  const baseExcitement = Math.max(0, curiosity * param("emotion.baseline.excitementPerCuriosity"));
  const baseBoredom = Math.max(0, (1 - curiosity) * param("emotion.baseline.boredomPerIncuriosity"));

  const state: EmotionalState = {
    anxiety: Math.min(1, baseAnxiety),
    frustration: 0,
    boredom: Math.min(1, baseBoredom),
    confusion: 0,
    satisfaction: param("emotion.baseline.satisfaction"), // Slight initial optimism
    excitement: Math.min(1, baseExcitement),
    relief: 0,
    dominant: "neutral",
    valence: 0,
    arousal: param("emotion.arousal.neutral"),
  };

  // Calculate derived values
  updateDerivedValues(state);

  return state;
}

/**
 * Create emotional configuration based on persona traits.
 */
export function createEmotionalConfig(
  traits?: Partial<CognitiveTraits>
): EmotionalConfig {
  const resilience = traits?.resilience ?? traitDefault();
  const patience = traits?.patience ?? traitDefault();

  return {
    baseline: createInitialEmotionalState(traits),
    // High resilience = faster emotional recovery
    decayRate: param("emotion.decayRate") * (param("emotion.config.decayBase") + resilience * param("emotion.config.decayPerResilience")),
    // Low patience = higher emotional sensitivity
    sensitivity: DEFAULT_SENSITIVITY * (param("emotion.config.sensitivityBase") - patience * param("emotion.config.sensitivityPerPatience")),
    changeThreshold: param("emotion.changeThreshold"),
  };
}

// ============================================================================
// Emotion Updates
// ============================================================================

/**
 * Apply an emotional trigger event to the current state.
 * Returns the new state and the event record.
 */
export function applyEmotionalTrigger(
  state: EmotionalState,
  trigger: EmotionalTrigger,
  config: EmotionalConfig,
  stepNumber: number,
  context?: { severity?: number; description?: string }
): { state: EmotionalState; event: EmotionalEvent } {
  const severity = context?.severity ?? 1.0;
  const sensitivity = config.sensitivity * severity;

  // Calculate emotion changes based on trigger
  const changes = calculateTriggerEffects(trigger, sensitivity);

  // Apply changes to state
  const newState = { ...state };
  for (const [emotion, delta] of Object.entries(changes)) {
    const key = emotion as keyof EmotionalState;
    if (typeof newState[key] === "number") {
      newState[key as keyof Omit<EmotionalState, "dominant" | "valence" | "arousal">] = Math.max(
        0,
        Math.min(1, (newState[key] as number) + delta)
      );
    }
  }

  // Update derived values
  updateDerivedValues(newState);

  // Create event record
  const event: EmotionalEvent = {
    timestamp: Date.now(),
    trigger,
    changes,
    description: context?.description ?? getDefaultTriggerDescription(trigger),
    stepNumber,
  };

  return { state: newState, event };
}

/**
 * Decay emotions toward baseline over time.
 * Should be called each step.
 */
export function decayEmotions(
  state: EmotionalState,
  config: EmotionalConfig
): EmotionalState {
  const baseline = config.baseline;
  const decayRate = config.decayRate;

  const newState = { ...state };

  // Decay each emotion toward its baseline
  const emotions: (keyof EmotionalState)[] = [
    "anxiety",
    "frustration",
    "boredom",
    "confusion",
    "satisfaction",
    "excitement",
    "relief",
  ];

  for (const emotion of emotions) {
    const current = newState[emotion] as number;
    const base = (baseline[emotion] as number | undefined) ?? 0;
    const diff = base - current;

    // Move toward baseline by decay rate
    newState[emotion as keyof Omit<EmotionalState, "dominant" | "valence" | "arousal">] =
      current + diff * decayRate;
  }

  updateDerivedValues(newState);

  return newState;
}

// ============================================================================
// Trigger Effect Calculations
// ============================================================================

/**
 * The emotions each trigger moves, in the order they are applied. The size of
 * each move is the registered effect `emotion.effect.<trigger>.<emotion>`,
 * per unit of sensitivity.
 */
const TRIGGER_EMOTIONS: Record<EmotionalTrigger, NumericEmotionType[]> = {
  success: ["satisfaction", "excitement", "frustration", "anxiety", "confusion"],
  failure: ["frustration", "anxiety", "satisfaction", "excitement"],
  error: ["anxiety", "frustration", "confusion", "satisfaction"],
  progress: ["satisfaction", "excitement", "boredom", "frustration"],
  setback: ["frustration", "anxiety", "satisfaction", "excitement"],
  waiting: ["boredom", "frustration", "excitement"],
  discovery: ["excitement", "satisfaction", "boredom"],
  completion: ["satisfaction", "relief", "excitement", "frustration", "anxiety"],
  confusion_onset: ["confusion", "anxiety", "frustration", "satisfaction"],
  clarity: ["confusion", "relief", "satisfaction", "anxiety"],
  time_pressure: ["anxiety", "frustration", "boredom"],
  recovery: ["relief", "satisfaction", "frustration", "anxiety"],
};

/**
 * Calculate emotion changes for a given trigger.
 */
function calculateTriggerEffects(
  trigger: EmotionalTrigger,
  sensitivity: number
): Partial<Record<EmotionType, number>> {
  const s = sensitivity;
  const changes: Partial<Record<EmotionType, number>> = {};
  for (const emotion of TRIGGER_EMOTIONS[trigger] ?? []) {
    changes[emotion] = param(`emotion.effect.${trigger}.${emotion}`) * s;
  }
  return changes;
}

/**
 * Get default description for a trigger.
 */
function getDefaultTriggerDescription(trigger: EmotionalTrigger): string {
  const descriptions: Record<EmotionalTrigger, string> = {
    success: "Action completed successfully",
    failure: "Action failed to complete",
    error: "System error occurred",
    progress: "Made progress toward goal",
    setback: "Lost progress or took wrong path",
    waiting: "Waited for page or element",
    discovery: "Discovered something interesting",
    completion: "Completed a sub-goal",
    confusion_onset: "Became confused by UI",
    clarity: "UI became clearer",
    time_pressure: "Running low on patience",
    recovery: "Recovered from error or setback",
  };
  return descriptions[trigger];
}

// ============================================================================
// Derived Value Calculations
// ============================================================================

/** Emotions that have numeric values on EmotionalState (excludes 'neutral') */
type NumericEmotionType = Exclude<EmotionType, "neutral">;

/**
 * Update derived values (dominant, valence, arousal) based on emotion intensities.
 */
function updateDerivedValues(state: EmotionalState): void {
  const emotions: NumericEmotionType[] = [
    "anxiety",
    "frustration",
    "boredom",
    "confusion",
    "satisfaction",
    "excitement",
    "relief",
  ];

  // Find dominant emotion
  let maxIntensity = 0;
  let dominant: EmotionType = "neutral";

  for (const emotion of emotions) {
    const intensity = state[emotion];
    if (intensity > maxIntensity) {
      maxIntensity = intensity;
      dominant = emotion;
    }
  }

  // If no emotion is significant, default to neutral
  if (maxIntensity < param("emotion.dominantFloor")) {
    dominant = "neutral";
  }

  state.dominant = dominant;

  // Calculate weighted valence and arousal
  let totalWeight = 0;
  let weightedValence = 0;
  let weightedArousal = 0;

  const blendFloor = param("emotion.blendFloor");
  for (const emotion of emotions) {
    const intensity = state[emotion];
    if (intensity > blendFloor) {
      totalWeight += intensity;
      weightedValence += intensity * emotionValence(emotion);
      weightedArousal += intensity * emotionArousal(emotion);
    }
  }

  if (totalWeight > 0) {
    state.valence = weightedValence / totalWeight;
    state.arousal = weightedArousal / totalWeight;
  } else {
    state.valence = 0;
    state.arousal = param("emotion.arousal.neutral");
  }
}

// ============================================================================
// Behavioral Effects
// ============================================================================

/**
 * Calculate abandonment risk modifier based on emotional state.
 *
 * Returns a multiplier:
 * - < 1.0 = less likely to abandon (positive emotions)
 * - > 1.0 = more likely to abandon (negative emotions)
 */
export function calculateAbandonmentModifier(state: EmotionalState): number {
  // Negative emotions increase abandonment risk
  const negativeLoad =
    state.anxiety * param("emotion.abandonModifier.anxiety") +
    state.frustration * param("emotion.abandonModifier.frustration") +
    state.boredom * param("emotion.abandonModifier.boredom") +
    state.confusion * param("emotion.abandonModifier.confusion");

  // Positive emotions decrease abandonment risk
  const positiveLoad =
    state.satisfaction * param("emotion.abandonModifier.satisfaction") +
    state.excitement * param("emotion.abandonModifier.excitement") +
    state.relief * param("emotion.abandonModifier.relief");

  // Base modifier is 1.0 (no change)
  // Negative emotions increase it, positive emotions decrease it
  const modifier = 1.0 + negativeLoad - positiveLoad * param("emotion.abandonModifier.positiveShare");

  // Clamp to reasonable range
  return Math.max(param("emotion.abandonModifier.min"), Math.min(param("emotion.abandonModifier.max"), modifier));
}

/**
 * Calculate exploration tendency based on emotional state.
 *
 * Returns 0-1:
 * - Low = stays on current path
 * - High = willing to explore
 */
export function calculateExplorationTendency(state: EmotionalState): number {
  // Excitement and satisfaction encourage exploration
  const positive = state.excitement * param("emotion.exploration.excitement") + state.satisfaction * param("emotion.exploration.satisfaction") + state.relief * param("emotion.exploration.relief");

  // Anxiety and frustration discourage exploration
  const negative = state.anxiety * param("emotion.exploration.anxiety") + state.frustration * param("emotion.exploration.frustration") + state.confusion * param("emotion.exploration.confusion");

  // Boredom can go either way - might explore out of boredom or give up
  const boredomEffect = state.boredom > param("emotion.exploration.boredomOnset") ? state.boredom * param("emotion.exploration.boredom") : 0;

  const tendency = param("emotion.exploration.base") + positive - negative + boredomEffect;

  return Math.max(0, Math.min(1, tendency));
}

/**
 * Calculate decision speed modifier based on emotional state.
 *
 * Returns a multiplier for decision time:
 * - < 1.0 = faster decisions (excitement, impatience from frustration)
 * - > 1.0 = slower decisions (anxiety, confusion)
 */
export function calculateDecisionSpeedModifier(state: EmotionalState): number {
  // Anxiety and confusion slow decisions
  const slowingFactors = state.anxiety * param("emotion.decisionSpeed.anxiety") + state.confusion * param("emotion.decisionSpeed.confusion");

  // High frustration can lead to impulsive fast decisions
  const impulsiveOnset = param("emotion.decisionSpeed.impulsiveOnset");
  const impulsiveFactor = state.frustration > impulsiveOnset ? (state.frustration - impulsiveOnset) * param("emotion.decisionSpeed.impulsiveGain") : 0;

  // Excitement slightly speeds up decisions
  const speedingFactor = state.excitement * param("emotion.decisionSpeed.excitement") + impulsiveFactor;

  // No clamp: with every intensity in 0-1 this lies in [0.6, 1.7] (the
  // [0.5, 2] clamp it had until 21.0 could never bind).
  return 1.0 + slowingFactors - speedingFactor;
}

/**
 * Get a human-readable description of the current emotional state.
 */
export function describeEmotionalState(state: EmotionalState): string {
  const dominant = state.dominant;
  const intensity = state[dominant as keyof EmotionalState] as number;

  if (dominant === "neutral" || intensity < param("emotion.dominantFloor")) {
    return "Feeling neutral and calm";
  }

  const intensityWord =
    intensity > param("emotion.describe.very") ? "very" : intensity > param("emotion.describe.somewhat") ? "somewhat" : "slightly";

  const emotionDescriptions: Record<EmotionType, string> = {
    anxiety: "anxious about completing this task",
    frustration: "frustrated with the experience",
    boredom: "bored and losing interest",
    confusion: "confused about what to do",
    satisfaction: "satisfied with progress",
    excitement: "excited and engaged",
    relief: "relieved after overcoming obstacles",
    neutral: "neutral and calm",
  };

  let description = `Feeling ${intensityWord} ${emotionDescriptions[dominant]}`;

  // Add secondary emotion if significant
  const emotions: NumericEmotionType[] = [
    "anxiety",
    "frustration",
    "boredom",
    "confusion",
    "satisfaction",
    "excitement",
    "relief",
  ];

  for (const emotion of emotions) {
    if (emotion !== dominant) {
      const secondaryIntensity = state[emotion];
      if (secondaryIntensity > param("emotion.describe.secondary")) {
        description += `, with some ${emotion}`;
        break;
      }
    }
  }

  return description;
}

/**
 * Determine if the emotional state should trigger abandonment consideration.
 */
export function shouldConsiderAbandonment(state: EmotionalState): {
  shouldConsider: boolean;
  reason?: string;
} {
  // High frustration is a strong abandonment signal
  if (state.frustration > param("emotion.considerAbandon.frustration")) {
    return { shouldConsider: true, reason: "Extreme frustration" };
  }

  // High anxiety + low satisfaction
  if (state.anxiety > param("emotion.considerAbandon.anxiety") && state.satisfaction < param("emotion.considerAbandon.satisfaction")) {
    return { shouldConsider: true, reason: "High anxiety with no satisfaction" };
  }

  // Boredom + frustration combo
  if (state.boredom > param("emotion.considerAbandon.boredom") && state.frustration > param("emotion.considerAbandon.boredFrustration")) {
    return { shouldConsider: true, reason: "Bored and frustrated" };
  }

  // Confusion without relief
  if (state.confusion > param("emotion.considerAbandon.confusion") && state.relief < param("emotion.considerAbandon.relief")) {
    return { shouldConsider: true, reason: "Persistently confused" };
  }

  // Very negative valence
  if (state.valence < param("emotion.considerAbandon.valence") && state.arousal > param("emotion.considerAbandon.arousal")) {
    return { shouldConsider: true, reason: "Strong negative emotional state" };
  }

  return { shouldConsider: false };
}

// ============================================================================
// Single Source of Truth — derived simplified-state view
// ============================================================================
//
// The simulator and its consumers (worker, dashboard, MCP tools) read three
// "simple" fields off the journey state: patienceRemaining, confusionLevel,
// and frustrationLevel. Historically those were maintained INDEPENDENTLY of
// the Scherer EmotionalState, producing two emotional truths that drifted
// every step. These helpers make the simple fields *derived views* of the
// canonical EmotionalState, so there's only one source of truth.
//
// Persona traits modulate update rates here, not just thresholds:
//   - patience trait → drainMultiplier applied to negative-emotion contribution
//   - comprehension → confusion decay rate
//   - resilience    → frustration decay rate
//   - curiosity     → boredom decay rate
//
// Net effect: an impatient user (patience=0.2) burns through patience meaningfully
// faster than a patient user (0.9) given the same emotional trajectory, instead
// of burning the same and only differing in the cutoff threshold.

/**
 * Compute the simulator's gating-layer view of patience/confusion/frustration
 * from the canonical EmotionalState. Persona traits modulate the patience
 * derivation so the same emotional trajectory drains different personas at
 * different rates.
 *
 * Confusion and frustration are direct mappings (the EmotionalState fields
 * are the ground truth). Patience is computed: high frustration / boredom /
 * anxiety drain it; satisfaction and excitement buffer it; the persona's
 * `patience` trait scales the drain.
 */
export function deriveSimplifiedState(
  emotional: EmotionalState,
  traits?: Partial<CognitiveTraits>,
): { patienceRemaining: number; confusionLevel: number; frustrationLevel: number } {
  const confusionLevel = emotional.confusion;
  const frustrationLevel = emotional.frustration;

  // Negative-emotion drain: take the dominant negative emotion (frustration
  // weighs full, boredom weighs less because it's lower-arousal, anxiety lies
  // between).
  const negativeFactor = Math.max(
    emotional.frustration,
    emotional.boredom * param("emotion.patience.boredomWeight"),
    emotional.anxiety * param("emotion.patience.anxietyWeight"),
  );

  // Persona patience trait scales the burn rate.
  // patience=1.0 → drainMultiplier ≈ 0.77 (slow burn)
  // patience=0.5 → drainMultiplier ≈ 1.54 (1x baseline)
  // patience=0.2 → drainMultiplier ≈ 3.85 (impatient burns through fast)
  // Floor at 0.2 prevents division-by-zero for malformed traits.
  const patienceTrait = Math.max(param("emotion.patience.traitFloor"), traits?.patience ?? traitDefault());
  const drainMultiplier = 1 / (patienceTrait * param("emotion.patience.drainScale"));

  // Positive emotions buffer the drain — a satisfied / excited persona is
  // more willing to keep trying through friction.
  const positiveBuffer = (emotional.satisfaction + emotional.excitement * param("emotion.patience.excitementWeight")) * param("emotion.patience.bufferGain");

  const patienceRemaining = Math.max(
    0,
    Math.min(1, 1 - negativeFactor * drainMultiplier + positiveBuffer),
  );

  return { patienceRemaining, confusionLevel, frustrationLevel };
}

/**
 * Decay emotions toward their baseline, with persona-trait-modulated rates.
 * Replaces the legacy uniform `decayEmotions` for the journey simulator —
 * trait-aware decay means a persona with high comprehension forgets confusion
 * faster than one with low comprehension, instead of both decaying at the
 * same uniform rate.
 *
 * Decay multipliers per emotion:
 *   confusion   ← comprehension trait (forgets confusion when they "get it")
 *   frustration ← resilience trait (recovers from setbacks faster)
 *   boredom     ← curiosity trait (curious users tolerate slow flows)
 *   anxiety     ← uniform (no single trait clearly maps; intentional)
 *   satisfaction, excitement, relief ← decay slowly (positive states are sticky)
 */
export function decayEmotionsWithTraits(
  state: EmotionalState,
  config: EmotionalConfig,
  traits?: Partial<CognitiveTraits>,
): EmotionalState {
  const newState = { ...state };
  const baseDecay = config.decayRate;

  // Trait values default to 0.5 (moderate) when absent
  const comprehension = traits?.comprehension ?? traitDefault();
  const resilience = traits?.resilience ?? traitDefault();
  const curiosity = traits?.curiosity ?? traitDefault();

  // Decay rate multipliers — 0.5x at trait=0, 2.0x at trait=1
  const traitBase = param("emotion.decay.traitBase");
  const traitGain = param("emotion.decay.traitGain");
  const decayMultipliers: Record<EmotionType, number> = {
    confusion: traitBase + comprehension * traitGain,
    frustration: traitBase + resilience * traitGain,
    boredom: traitBase + curiosity * traitGain,
    anxiety: 1.0,
    satisfaction: param("emotion.decay.satisfaction"),
    excitement: param("emotion.decay.excitement"),
    relief: 1.0,
    neutral: 0,
  };

  const emotions: (keyof Omit<EmotionalState, "dominant" | "valence" | "arousal">)[] = [
    "anxiety",
    "frustration",
    "boredom",
    "confusion",
    "satisfaction",
    "excitement",
    "relief",
  ];

  for (const emotion of emotions) {
    const baseline = (config.baseline[emotion] as number | undefined) ?? 0;
    const current = newState[emotion];
    const rate = baseDecay * decayMultipliers[emotion];
    // Move toward baseline by `rate` fraction of the gap each step.
    newState[emotion] = current + (baseline - current) * rate;
  }

  // Re-derive dominant + valence + arousal from new emotion intensities.
  // Use the existing helper if it's exported, otherwise inline the math.
  // Find max-intensity emotion as dominant.
  const intensities: { type: EmotionType; value: number }[] = emotions.map((e) => ({
    type: e as EmotionType,
    value: newState[e],
  }));
  intensities.sort((a, b) => b.value - a.value);
  newState.dominant = intensities[0].value > param("emotion.decay.dominantFloor") ? intensities[0].type : "neutral";

  // Weighted valence/arousal from the same constants the trigger system uses.
  let totalIntensity = 0;
  let weightedValence = 0;
  let weightedArousal = 0;
  for (const { type, value } of intensities) {
    if (value <= 0) continue;
    totalIntensity += value;
    weightedValence += value * emotionValence(type);
    weightedArousal += value * emotionArousal(type);
  }
  if (totalIntensity > 0) {
    newState.valence = weightedValence / totalIntensity;
    newState.arousal = weightedArousal / totalIntensity;
  } else {
    newState.valence = 0;
    newState.arousal = param("emotion.arousal.neutral");
  }

  return newState;
}
