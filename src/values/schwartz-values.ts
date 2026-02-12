/**
 * Schwartz's Theory of Basic Human Values
 *
 * Implements Schwartz's 10 universal values with research citations.
 * This is the foundation for understanding WHO a persona is at a motivational level.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT - See LICENSE file
 *
 * @references
 * - Schwartz, S.H. (1992). Universals in the content and structure of values.
 *   Advances in Experimental Social Psychology, 25, 1-65.
 *   DOI: 10.1016/S0065-2601(08)60281-6
 *
 * - Schwartz, S.H. (2012). An Overview of the Schwartz Theory of Basic Values.
 *   Online Readings in Psychology and Culture, 2(1).
 *   DOI: 10.9707/2307-0919.1116
 *
 * - Schwartz, S.H., & Bardi, A. (2001). Value hierarchies across cultures.
 *   Journal of Cross-Cultural Psychology, 32(3), 268-290.
 *
 * - Roccas, S., Sagiv, L., Schwartz, S.H., & Knafo, A. (2002). The big five
 *   personality factors and personal values. Personality and Social Psychology
 *   Bulletin, 28(6), 789-801.
 */

/**
 * Schwartz's 10 Universal Values
 *
 * These values are found across all cultures and represent fundamental
 * motivational goals that guide human behavior.
 */
export interface SchwartzValues {
  /**
   * Self-Direction: Independent thought and action—choosing, creating, exploring.
   * Derived from: Autonomy needs, control over environment
   * Behavioral indicators: Explores options, resists defaults, customizes settings
   */
  selfDirection: number;

  /**
   * Stimulation: Excitement, novelty, and challenge in life.
   * Derived from: Need for variety, optimal arousal
   * Behavioral indicators: Seeks new features, tries beta versions, clicks "what's new"
   */
  stimulation: number;

  /**
   * Hedonism: Pleasure and sensuous gratification.
   * Derived from: Pleasure-seeking behavior
   * Behavioral indicators: Responds to aesthetics, seeks enjoyable experiences
   */
  hedonism: number;

  /**
   * Achievement: Personal success through demonstrating competence.
   * Derived from: Need for social approval, self-efficacy
   * Behavioral indicators: Values efficiency, seeks metrics, focuses on ROI
   */
  achievement: number;

  /**
   * Power: Social status, prestige, control over people and resources.
   * Derived from: Dominance needs, status hierarchy
   * Behavioral indicators: Attracted to premium branding, exclusive access, authority signals
   */
  power: number;

  /**
   * Security: Safety, harmony, stability of society and self.
   * Derived from: Uncertainty avoidance, threat protection
   * Behavioral indicators: Risk-averse, seeks guarantees, needs trust signals
   */
  security: number;

  /**
   * Conformity: Restraint of actions likely to upset or harm others.
   * Derived from: Social norms, group cohesion
   * Behavioral indicators: Follows social norms, influenced by reviews, seeks approval
   */
  conformity: number;

  /**
   * Tradition: Respect for customs and ideas from culture or religion.
   * Derived from: Group solidarity, cultural continuity
   * Behavioral indicators: Prefers established brands, skeptical of new
   */
  tradition: number;

  /**
   * Benevolence: Preserving and enhancing welfare of close others.
   * Derived from: Prosocial behavior, in-group care
   * Behavioral indicators: Responds to community, helping, giving back
   */
  benevolence: number;

  /**
   * Universalism: Understanding, tolerance, protection of all people and nature.
   * Derived from: Survival needs beyond in-group
   * Behavioral indicators: Values sustainability, ethics, social impact
   */
  universalism: number;
}

/**
 * Higher-Order Value Dimensions (Schwartz, 2012)
 *
 * The 10 values organize into 4 higher-order dimensions based on
 * compatibility and conflict relationships.
 */
export interface HigherOrderValues {
  /**
   * Openness to Change: (Self-Direction + Stimulation) / 2
   * Emphasizes independent thought, action, and readiness for new experience.
   * Opposite of Conservation.
   */
  openness: number;

  /**
   * Self-Enhancement: (Achievement + Power) / 2
   * Emphasizes pursuit of self-interest, success, and dominance.
   * Opposite of Self-Transcendence.
   */
  selfEnhancement: number;

  /**
   * Conservation: (Security + Conformity + Tradition) / 3
   * Emphasizes self-restriction, order, and resistance to change.
   * Opposite of Openness to Change.
   */
  conservation: number;

  /**
   * Self-Transcendence: (Benevolence + Universalism) / 2
   * Emphasizes concern for welfare of others and nature.
   * Opposite of Self-Enhancement.
   */
  selfTranscendence: number;
}

/**
 * Self-Determination Theory Needs (Deci & Ryan, 1985, 2000)
 *
 * @references
 * - Deci, E.L., & Ryan, R.M. (1985). Intrinsic motivation and self-determination
 *   in human behavior. New York: Plenum.
 *
 * - Ryan, R.M., & Deci, E.L. (2000). Self-determination theory and the
 *   facilitation of intrinsic motivation, social development, and well-being.
 *   American Psychologist, 55(1), 68-78.
 *   DOI: 10.1037/0003-066X.55.1.68
 */
export interface SDTNeeds {
  /**
   * Autonomy: Need for choice and control over one's actions.
   * Related to self-direction value.
   */
  autonomyNeed: number;

  /**
   * Competence: Need to feel capable and effective.
   * Related to achievement value.
   */
  competenceNeed: number;

  /**
   * Relatedness: Need for connection with others.
   * Related to benevolence and universalism values.
   */
  relatednessNeed: number;
}

/**
 * Maslow's Hierarchy of Needs (Maslow, 1943)
 *
 * @references
 * - Maslow, A.H. (1943). A theory of human motivation.
 *   Psychological Review, 50(4), 370-396.
 *   DOI: 10.1037/h0054346
 */
export type MaslowLevel =
  | "physiological" // Basic survival needs
  | "safety"        // Security and stability
  | "belonging"     // Love, friendship, intimacy
  | "esteem"        // Achievement, status, recognition
  | "self-actualization"; // Reaching full potential

/**
 * Complete Value Profile for a Persona
 *
 * Combines Schwartz values, higher-order dimensions, SDT needs, and Maslow level
 * to create a comprehensive motivational profile.
 */
export interface PersonaValues extends SchwartzValues, HigherOrderValues, SDTNeeds {
  /** Current dominant need level (Maslow) */
  maslowLevel: MaslowLevel;
}

/**
 * Calculate higher-order values from the 10 basic values.
 */
export function calculateHigherOrderValues(values: SchwartzValues): HigherOrderValues {
  return {
    openness: (values.selfDirection + values.stimulation) / 2,
    selfEnhancement: (values.achievement + values.power) / 2,
    conservation: (values.security + values.conformity + values.tradition) / 3,
    selfTranscendence: (values.benevolence + values.universalism) / 2,
  };
}

/**
 * Create a complete PersonaValues from basic Schwartz values and SDT needs.
 */
export function createPersonaValues(
  schwartzValues: SchwartzValues,
  sdtNeeds: SDTNeeds,
  maslowLevel: MaslowLevel
): PersonaValues {
  const higherOrder = calculateHigherOrderValues(schwartzValues);
  return {
    ...schwartzValues,
    ...higherOrder,
    ...sdtNeeds,
    maslowLevel,
  };
}

/**
 * Value-to-Trait Correlations (Research-Supported)
 *
 * Based on Schwartz & Bardi (2001), Roccas et al. (2002).
 * Correlations are moderate (r = 0.35-0.55) - values predict tendencies, not absolutes.
 *
 * Note: Values and traits are PARALLEL dimensions, not hierarchical.
 * Values = WHO (motivations), Traits = HOW (behaviors).
 * They correlate but don't determine each other.
 */
export interface ValueTraitCorrelation {
  value: keyof SchwartzValues;
  trait: string;
  direction: "direct" | "inverse";
  strength: "weak" | "moderate" | "strong";
  researchBasis: string;
}

/**
 * Research-supported value-trait correlations.
 */
export const VALUE_TRAIT_CORRELATIONS: ValueTraitCorrelation[] = [
  {
    value: "security",
    trait: "riskTolerance",
    direction: "inverse",
    strength: "strong",
    researchBasis: "Schwartz & Bardi (2001): r = -0.52",
  },
  {
    value: "security",
    trait: "trustCalibration",
    direction: "inverse",
    strength: "moderate",
    researchBasis: "Security-seekers require more evidence before trust (r = -0.38)",
  },
  {
    value: "stimulation",
    trait: "curiosity",
    direction: "direct",
    strength: "strong",
    researchBasis: "Roccas et al. (2002): r = 0.55",
  },
  {
    value: "achievement",
    trait: "patience",
    direction: "inverse",
    strength: "moderate",
    researchBasis: "Achievement-oriented users are less patient with inefficiency (r = -0.40)",
  },
  {
    value: "conformity",
    trait: "socialProofSensitivity",
    direction: "direct",
    strength: "strong",
    researchBasis: "Conformity predicts susceptibility to social proof (r = 0.48)",
  },
  {
    value: "selfDirection",
    trait: "authoritySensitivity",
    direction: "inverse",
    strength: "moderate",
    researchBasis: "Self-direction reduces compliance with authority (r = -0.42)",
  },
  {
    value: "tradition",
    trait: "mentalModelRigidity",
    direction: "direct",
    strength: "moderate",
    researchBasis: "Tradition correlates with resistance to new mental models (r = 0.38)",
  },
];

/**
 * Default value profile (neutral/average across all values).
 */
export const DEFAULT_VALUES: PersonaValues = {
  // Schwartz values (neutral 0.5)
  selfDirection: 0.5,
  stimulation: 0.5,
  hedonism: 0.5,
  achievement: 0.5,
  power: 0.5,
  security: 0.5,
  conformity: 0.5,
  tradition: 0.5,
  benevolence: 0.5,
  universalism: 0.5,

  // Higher-order (calculated)
  openness: 0.5,
  selfEnhancement: 0.5,
  conservation: 0.5,
  selfTranscendence: 0.5,

  // SDT needs
  autonomyNeed: 0.5,
  competenceNeed: 0.5,
  relatednessNeed: 0.5,

  // Maslow
  maslowLevel: "esteem",
};
