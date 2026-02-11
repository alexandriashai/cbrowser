/**
 * CBrowser - Cognitive Browser Automation
 *
 * Copyright (c) 2026 WF Media (Alexandria Eden)
 * Email: alexandria.shai.eden@gmail.com
 * Website: https://cbrowser.ai/
 *
 * This source code is licensed under the Business Source License 1.1
 * found in the LICENSE file in the root directory of this source tree.
 *
 * Non-production use is permitted. Production use requires a commercial license.
 * See LICENSE for full terms.
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

// ============================================================================
// Constants
// ============================================================================

/** Default decay rate per step (emotions decay toward baseline) */
const DEFAULT_DECAY_RATE = 0.15;

/** Default sensitivity to emotional events */
const DEFAULT_SENSITIVITY = 1.0;

/** Minimum change to register as an event */
const DEFAULT_CHANGE_THRESHOLD = 0.05;

/** Emotion valence values (-1 to +1) */
const EMOTION_VALENCE: Record<EmotionType, number> = {
  anxiety: -0.7,
  frustration: -0.8,
  boredom: -0.4,
  confusion: -0.5,
  satisfaction: 0.7,
  excitement: 0.8,
  relief: 0.5,
  neutral: 0,
};

/** Emotion arousal values (0 to 1) */
const EMOTION_AROUSAL: Record<EmotionType, number> = {
  anxiety: 0.8,
  frustration: 0.7,
  boredom: 0.2,
  confusion: 0.5,
  satisfaction: 0.5,
  excitement: 0.9,
  relief: 0.3,
  neutral: 0.3,
};

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
  const patience = traits?.patience ?? 0.5;
  const curiosity = traits?.curiosity ?? 0.5;
  const resilience = traits?.resilience ?? 0.5;
  const selfEfficacy = traits?.selfEfficacy ?? 0.5;

  // Baseline emotions influenced by traits
  const baseAnxiety = Math.max(0, 0.1 + (1 - patience) * 0.2 + (1 - selfEfficacy) * 0.15);
  const baseExcitement = Math.max(0, curiosity * 0.2);
  const baseBoredom = Math.max(0, (1 - curiosity) * 0.1);

  const state: EmotionalState = {
    anxiety: Math.min(1, baseAnxiety),
    frustration: 0,
    boredom: Math.min(1, baseBoredom),
    confusion: 0,
    satisfaction: 0.1, // Slight initial optimism
    excitement: Math.min(1, baseExcitement),
    relief: 0,
    dominant: "neutral",
    valence: 0,
    arousal: 0.3,
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
  const resilience = traits?.resilience ?? 0.5;
  const patience = traits?.patience ?? 0.5;

  return {
    baseline: createInitialEmotionalState(traits),
    // High resilience = faster emotional recovery
    decayRate: DEFAULT_DECAY_RATE * (0.5 + resilience * 0.5),
    // Low patience = higher emotional sensitivity
    sensitivity: DEFAULT_SENSITIVITY * (1.5 - patience * 0.5),
    changeThreshold: DEFAULT_CHANGE_THRESHOLD,
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
 * Calculate emotion changes for a given trigger.
 */
function calculateTriggerEffects(
  trigger: EmotionalTrigger,
  sensitivity: number
): Partial<Record<EmotionType, number>> {
  const s = sensitivity;

  switch (trigger) {
    case "success":
      return {
        satisfaction: 0.2 * s,
        excitement: 0.1 * s,
        frustration: -0.15 * s,
        anxiety: -0.1 * s,
        confusion: -0.1 * s,
      };

    case "failure":
      return {
        frustration: 0.25 * s,
        anxiety: 0.15 * s,
        satisfaction: -0.1 * s,
        excitement: -0.05 * s,
      };

    case "error":
      return {
        anxiety: 0.3 * s,
        frustration: 0.2 * s,
        confusion: 0.15 * s,
        satisfaction: -0.15 * s,
      };

    case "progress":
      return {
        satisfaction: 0.15 * s,
        excitement: 0.1 * s,
        boredom: -0.1 * s,
        frustration: -0.05 * s,
      };

    case "setback":
      return {
        frustration: 0.2 * s,
        anxiety: 0.1 * s,
        satisfaction: -0.15 * s,
        excitement: -0.1 * s,
      };

    case "waiting":
      return {
        boredom: 0.15 * s,
        frustration: 0.05 * s,
        excitement: -0.05 * s,
      };

    case "discovery":
      return {
        excitement: 0.25 * s,
        satisfaction: 0.1 * s,
        boredom: -0.2 * s,
      };

    case "completion":
      return {
        satisfaction: 0.3 * s,
        relief: 0.2 * s,
        excitement: 0.05 * s,
        frustration: -0.2 * s,
        anxiety: -0.15 * s,
      };

    case "confusion_onset":
      return {
        confusion: 0.25 * s,
        anxiety: 0.1 * s,
        frustration: 0.1 * s,
        satisfaction: -0.1 * s,
      };

    case "clarity":
      return {
        confusion: -0.2 * s,
        relief: 0.15 * s,
        satisfaction: 0.1 * s,
        anxiety: -0.1 * s,
      };

    case "time_pressure":
      return {
        anxiety: 0.25 * s,
        frustration: 0.1 * s,
        boredom: -0.1 * s,
      };

    case "recovery":
      return {
        relief: 0.25 * s,
        satisfaction: 0.1 * s,
        frustration: -0.15 * s,
        anxiety: -0.2 * s,
      };

    default:
      return {};
  }
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
  if (maxIntensity < 0.15) {
    dominant = "neutral";
  }

  state.dominant = dominant;

  // Calculate weighted valence and arousal
  let totalWeight = 0;
  let weightedValence = 0;
  let weightedArousal = 0;

  for (const emotion of emotions) {
    const intensity = state[emotion];
    if (intensity > 0.05) {
      totalWeight += intensity;
      weightedValence += intensity * EMOTION_VALENCE[emotion];
      weightedArousal += intensity * EMOTION_AROUSAL[emotion];
    }
  }

  if (totalWeight > 0) {
    state.valence = weightedValence / totalWeight;
    state.arousal = weightedArousal / totalWeight;
  } else {
    state.valence = 0;
    state.arousal = 0.3;
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
    state.anxiety * 0.3 +
    state.frustration * 0.35 +
    state.boredom * 0.25 +
    state.confusion * 0.2;

  // Positive emotions decrease abandonment risk
  const positiveLoad =
    state.satisfaction * 0.3 +
    state.excitement * 0.25 +
    state.relief * 0.15;

  // Base modifier is 1.0 (no change)
  // Negative emotions increase it, positive emotions decrease it
  const modifier = 1.0 + negativeLoad - positiveLoad * 0.7;

  // Clamp to reasonable range
  return Math.max(0.5, Math.min(2.0, modifier));
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
  const positive = state.excitement * 0.4 + state.satisfaction * 0.3 + state.relief * 0.1;

  // Anxiety and frustration discourage exploration
  const negative = state.anxiety * 0.4 + state.frustration * 0.3 + state.confusion * 0.2;

  // Boredom can go either way - might explore out of boredom or give up
  const boredomEffect = state.boredom > 0.5 ? state.boredom * 0.2 : 0;

  const tendency = 0.5 + positive - negative + boredomEffect;

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
  const slowingFactors = state.anxiety * 0.3 + state.confusion * 0.4;

  // High frustration can lead to impulsive fast decisions
  const impulsiveFactor = state.frustration > 0.6 ? (state.frustration - 0.6) * 0.5 : 0;

  // Excitement slightly speeds up decisions
  const speedingFactor = state.excitement * 0.2 + impulsiveFactor;

  const modifier = 1.0 + slowingFactors - speedingFactor;

  return Math.max(0.5, Math.min(2.0, modifier));
}

/**
 * Get a human-readable description of the current emotional state.
 */
export function describeEmotionalState(state: EmotionalState): string {
  const dominant = state.dominant;
  const intensity = state[dominant as keyof EmotionalState] as number;

  if (dominant === "neutral" || intensity < 0.15) {
    return "Feeling neutral and calm";
  }

  const intensityWord =
    intensity > 0.7 ? "very" : intensity > 0.4 ? "somewhat" : "slightly";

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
      if (secondaryIntensity > 0.3) {
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
  if (state.frustration > 0.8) {
    return { shouldConsider: true, reason: "Extreme frustration" };
  }

  // High anxiety + low satisfaction
  if (state.anxiety > 0.7 && state.satisfaction < 0.2) {
    return { shouldConsider: true, reason: "High anxiety with no satisfaction" };
  }

  // Boredom + frustration combo
  if (state.boredom > 0.6 && state.frustration > 0.5) {
    return { shouldConsider: true, reason: "Bored and frustrated" };
  }

  // Confusion without relief
  if (state.confusion > 0.7 && state.relief < 0.2) {
    return { shouldConsider: true, reason: "Persistently confused" };
  }

  // Very negative valence
  if (state.valence < -0.6 && state.arousal > 0.6) {
    return { shouldConsider: true, reason: "Strong negative emotional state" };
  }

  return { shouldConsider: false };
}
