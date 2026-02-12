/**
 * Value → Behavior → Influence Pattern Mappings
 *
 * Maps Schwartz values to behavioral tendencies and effective influence patterns.
 * Used to predict which persuasion techniques will be effective for a given persona.
 *
 * @copyright 2026 Alexa Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT - See LICENSE file
 *
 * @references
 * - Cialdini, R.B. (2001). Influence: Science and practice (4th ed.).
 *   Boston: Allyn & Bacon.
 *
 * - Goldstein, N.J., Cialdini, R.B., & Griskevicius, V. (2008). A room with a
 *   viewpoint: Using social norms to motivate environmental conservation.
 *   Journal of Consumer Research, 35(3), 472-482.
 *
 * - Tversky, A., & Kahneman, D. (1974). Judgment under uncertainty: Heuristics
 *   and biases. Science, 185(4157), 1124-1131.
 *
 * - Baumeister, R.F., Bratslavsky, E., Muraven, M., & Tice, D.M. (1998).
 *   Ego depletion: Is the active self a limited resource?
 *   Journal of Personality and Social Psychology, 74(5), 1252-1265.
 */

import type { PersonaValues, SchwartzValues } from "./schwartz-values.js";

/**
 * Behavioral indicators for a value profile.
 * Describes observable behaviors that indicate high scores on specific values.
 */
export interface ValueBehaviors {
  /** Behaviors exhibited when this value is high */
  highBehaviors: string[];
  /** Behaviors exhibited when this value is low */
  lowBehaviors: string[];
  /** UX elements this value profile responds to positively */
  positiveResponses: string[];
  /** UX elements this value profile responds to negatively */
  negativeResponses: string[];
}

/**
 * Behavioral mappings for each Schwartz value.
 */
export const VALUE_BEHAVIORS: Record<keyof SchwartzValues, ValueBehaviors> = {
  selfDirection: {
    highBehaviors: [
      "Explores all options before deciding",
      "Resists default selections",
      "Customizes settings extensively",
      "Questions recommended paths",
      "Seeks control over experience",
    ],
    lowBehaviors: [
      "Accepts defaults readily",
      "Follows recommended paths",
      "Minimal customization",
      "Prefers guided experiences",
    ],
    positiveResponses: [
      "Customization options",
      "Advanced settings",
      "Multiple pathways",
      "DIY options",
    ],
    negativeResponses: [
      "Forced paths",
      "No customization",
      "One-size-fits-all",
      "Prescriptive guidance",
    ],
  },

  stimulation: {
    highBehaviors: [
      "Clicks 'What's new' immediately",
      "Tries beta features",
      "Explores unfamiliar sections",
      "Gets bored with routine",
      "Seeks novel experiences",
    ],
    lowBehaviors: [
      "Sticks to known paths",
      "Avoids beta/experimental",
      "Prefers familiar interfaces",
      "Values consistency over novelty",
    ],
    positiveResponses: [
      "New feature badges",
      "Beta access",
      "Exclusive early access",
      "Gamification elements",
    ],
    negativeResponses: [
      "Stale content",
      "No updates visible",
      "Boring/static design",
      "Routine messaging",
    ],
  },

  hedonism: {
    highBehaviors: [
      "Responds strongly to visual appeal",
      "Prefers delightful micro-interactions",
      "Values aesthetic over function",
      "Seeks enjoyable experiences",
    ],
    lowBehaviors: [
      "Ignores visual polish",
      "Function over form",
      "Minimal aesthetic concern",
      "Task-focused only",
    ],
    positiveResponses: [
      "Beautiful design",
      "Smooth animations",
      "Delightful interactions",
      "Pleasure-focused copy",
    ],
    negativeResponses: [
      "Utilitarian design",
      "Clunky interactions",
      "No visual appeal",
      "Cold/clinical aesthetic",
    ],
  },

  achievement: {
    highBehaviors: [
      "Seeks efficiency metrics",
      "Wants ROI proof",
      "Focuses on outcomes",
      "Compares performance",
      "Values competence signals",
    ],
    lowBehaviors: [
      "Less concerned with metrics",
      "Doesn't need ROI proof",
      "Process over outcomes",
      "Avoids comparisons",
    ],
    positiveResponses: [
      "ROI calculators",
      "Success metrics",
      "Performance comparisons",
      "Achievement badges",
      "Efficiency claims",
    ],
    negativeResponses: [
      "No proof of value",
      "Vague benefits",
      "No metrics",
      "Unclear outcomes",
    ],
  },

  power: {
    highBehaviors: [
      "Attracted to premium tiers",
      "Seeks exclusive access",
      "Values status signals",
      "Wants differentiation",
      "Responds to authority positioning",
    ],
    lowBehaviors: [
      "Ignores premium positioning",
      "Doesn't need exclusivity",
      "Status-neutral",
      "Prefers equality",
    ],
    positiveResponses: [
      "Premium branding",
      "Exclusive access",
      "'VIP' or 'Elite' tiers",
      "Status differentiation",
      "Authority endorsements",
    ],
    negativeResponses: [
      "Budget positioning",
      "One-tier-for-all",
      "Egalitarian messaging",
      "No status differentiation",
    ],
  },

  security: {
    highBehaviors: [
      "Reads all fine print",
      "Seeks guarantees",
      "Researches extensively",
      "Avoids perceived risks",
      "Needs trust signals",
    ],
    lowBehaviors: [
      "Skips fine print",
      "Comfortable with uncertainty",
      "Quick decisions",
      "Risk-tolerant",
    ],
    positiveResponses: [
      "Money-back guarantees",
      "Security badges",
      "Trust seals",
      "Detailed policies",
      "Longevity claims",
      "Insurance options",
    ],
    negativeResponses: [
      "No guarantees visible",
      "Missing trust signals",
      "Unclear policies",
      "New/unproven",
      "Risk messaging",
    ],
  },

  conformity: {
    highBehaviors: [
      "Reads reviews extensively",
      "Follows recommendations",
      "Seeks social validation",
      "Influenced by majority behavior",
      "Avoids being different",
    ],
    lowBehaviors: [
      "Ignores reviews",
      "Independent decisions",
      "Doesn't need validation",
      "Comfortable being different",
    ],
    positiveResponses: [
      "Customer reviews",
      "Testimonials",
      "Social proof numbers",
      "'Most popular' badges",
      "User counts",
    ],
    negativeResponses: [
      "No social proof",
      "No reviews",
      "Unique/different positioning",
      "Minority messaging",
    ],
  },

  tradition: {
    highBehaviors: [
      "Prefers established brands",
      "Skeptical of new",
      "Values heritage",
      "Follows customs",
      "Resistant to change",
    ],
    lowBehaviors: [
      "Open to new brands",
      "Embraces change",
      "Questions traditions",
      "Progressive outlook",
    ],
    positiveResponses: [
      "Heritage messaging",
      "'Since [year]' claims",
      "Traditional values",
      "Established brand signals",
      "Conservative design",
    ],
    negativeResponses: [
      "New/startup positioning",
      "Disruptive messaging",
      "Change-focused copy",
      "Modern/trendy design",
    ],
  },

  benevolence: {
    highBehaviors: [
      "Responds to helping messaging",
      "Values community",
      "Influenced by impact on others",
      "Seeks to contribute",
      "Empathetic responses",
    ],
    lowBehaviors: [
      "Self-focused",
      "Less community-oriented",
      "Individual outcomes priority",
      "Less empathetic",
    ],
    positiveResponses: [
      "Community features",
      "Helping others messaging",
      "Team/family benefits",
      "Charitable giving",
      "Impact stories",
    ],
    negativeResponses: [
      "Self-only benefits",
      "No community aspect",
      "Purely individual focus",
      "No giving back",
    ],
  },

  universalism: {
    highBehaviors: [
      "Checks for ethical practices",
      "Values sustainability",
      "Concerned with social impact",
      "Broad concern for welfare",
      "Environmental awareness",
    ],
    lowBehaviors: [
      "Ignores ethical concerns",
      "Sustainability not priority",
      "Limited social concern",
      "Individual focus",
    ],
    positiveResponses: [
      "B-Corp certification",
      "Sustainability claims",
      "Social impact",
      "Ethical sourcing",
      "Environmental badges",
      "Diversity messaging",
    ],
    negativeResponses: [
      "No ethical signals",
      "No sustainability",
      "Pure profit focus",
      "No social awareness",
    ],
  },
};

/**
 * Influence patterns and their research basis.
 * Maps persuasion techniques to the values they leverage.
 */
export interface InfluencePattern {
  name: string;
  description: string;
  researchBasis: string;
  targetValues: (keyof SchwartzValues)[];
  mechanism: string;
  examples: string[];
  /** Empirical effectiveness data when available */
  effectivenessData?: {
    metric: string;
    value: number;
    source: string;
  };
}

/**
 * Research-backed influence patterns.
 */
export const INFLUENCE_PATTERNS: InfluencePattern[] = [
  {
    name: "scarcity",
    description: "Limited availability or time creates urgency",
    researchBasis: "Cialdini (2001): Scarcity increases perceived value",
    targetValues: ["stimulation", "achievement", "power"],
    mechanism: "FOMO activation, loss aversion trigger",
    examples: ["Only 3 left in stock", "Offer ends in 2 hours", "Limited edition"],
    effectivenessData: {
      metric: "Conversion lift",
      value: 0.178,
      source: "CXL Institute (stock scarcity)",
    },
  },
  {
    name: "social_proof",
    description: "Evidence of others' behavior guides decisions",
    researchBasis: "Goldstein et al. (2008): Social norms drive behavior",
    targetValues: ["conformity", "security"],
    mechanism: "Uncertainty reduction through social validation",
    examples: ["Trusted by 1M users", "4.8 stars from 10K reviews", "Most popular choice"],
    effectivenessData: {
      metric: "Purchase likelihood increase",
      value: 0.77,
      source: "Spiegel Research Center (1+ reviews)",
    },
  },
  {
    name: "authority",
    description: "Expert endorsement increases credibility",
    researchBasis: "Milgram (1963): Authority figures drive compliance",
    targetValues: ["security", "conformity", "tradition"],
    mechanism: "Trust transfer from authority to product",
    examples: ["Recommended by doctors", "Used by Fortune 500", "Expert endorsed"],
  },
  {
    name: "reciprocity",
    description: "Giving something creates obligation to return",
    researchBasis: "Cialdini (2001): Reciprocity norm is universal",
    targetValues: ["benevolence", "conformity"],
    mechanism: "Obligation creation through value provision",
    examples: ["Free ebook download", "No-obligation trial", "Free assessment"],
  },
  {
    name: "commitment",
    description: "Small commitments lead to larger ones",
    researchBasis: "Cialdini (2001): Consistency principle",
    targetValues: ["achievement", "selfDirection"],
    mechanism: "Self-consistency motivation after initial commitment",
    examples: ["Save progress", "Quiz completion", "Profile building"],
  },
  {
    name: "liking",
    description: "Attractiveness and similarity increase persuasion",
    researchBasis: "Cialdini (2001): We comply with those we like",
    targetValues: ["hedonism", "benevolence"],
    mechanism: "Positive affect transfer to product",
    examples: ["Friendly tone", "Similar user stories", "Attractive design"],
  },
  {
    name: "unity",
    description: "Shared identity creates belonging",
    researchBasis: "Cialdini (2016): The 7th principle of persuasion",
    targetValues: ["benevolence", "tradition", "conformity"],
    mechanism: "In-group identification and loyalty",
    examples: ["Join our community", "Fellow founders", "Part of the family"],
  },
  {
    name: "anchoring",
    description: "First number sets reference point for comparison",
    researchBasis: "Tversky & Kahneman (1974): Anchoring heuristic",
    targetValues: ["achievement", "security"],
    mechanism: "Reference point manipulation for value perception",
    examples: ["Was $99, now $49", "Compare at $199", "Save 50%"],
    effectivenessData: {
      metric: "Sales increase (charm pricing)",
      value: 0.24,
      source: "Academic meta-analysis",
    },
  },
  {
    name: "decoy_effect",
    description: "Inferior option makes target look better",
    researchBasis: "Heath & Chatterjee (1995): Asymmetric dominance",
    targetValues: ["achievement", "selfDirection"],
    mechanism: "Comparative evaluation bias toward target",
    examples: ["Basic/Pro/Enterprise tiers", "Odd pricing structures"],
    effectivenessData: {
      metric: "Target option boost",
      value: 0.113,
      source: "Heath & Chatterjee meta-analysis",
    },
  },
  {
    name: "loss_aversion",
    description: "Framing as loss is more motivating than gain",
    researchBasis: "Kahneman & Tversky (1979): Losses felt 2-2.5x more than gains",
    targetValues: ["security", "achievement"],
    mechanism: "Fear of loss activation",
    examples: ["Don't miss out", "Stop losing leads", "Avoid costly mistakes"],
  },
  {
    name: "default_bias",
    description: "Pre-selected options are more likely to be chosen",
    researchBasis: "Thaler & Sunstein (2008): Nudge theory",
    targetValues: ["conformity", "security"],
    mechanism: "Status quo bias, effort minimization",
    examples: ["Pre-checked boxes", "Recommended tier highlighted", "Auto-enrolled"],
    effectivenessData: {
      metric: "Opt-out vs opt-in participation",
      value: 0.75,
      source: "Organ donation studies (90% vs 15%)",
    },
  },
];

/**
 * Value profile patterns for common buyer types.
 * Used to identify which influence patterns will be most effective.
 */
export interface ValueProfilePattern {
  name: string;
  description: string;
  valueSignature: Partial<SchwartzValues>;
  effectivePatterns: string[];
  ineffectivePatterns: string[];
}

/**
 * Common value profile patterns and their persuasion susceptibilities.
 */
export const VALUE_PROFILE_PATTERNS: ValueProfilePattern[] = [
  {
    name: "security_focused",
    description: "High security + conformity, low stimulation",
    valueSignature: {
      security: 0.8,
      conformity: 0.7,
      stimulation: 0.2,
    },
    effectivePatterns: ["social_proof", "authority", "default_bias"],
    ineffectivePatterns: ["scarcity", "reciprocity"],
  },
  {
    name: "achievement_driven",
    description: "High achievement + power, moderate security",
    valueSignature: {
      achievement: 0.8,
      power: 0.7,
      security: 0.5,
    },
    effectivePatterns: ["anchoring", "decoy_effect", "commitment"],
    ineffectivePatterns: ["unity", "reciprocity"],
  },
  {
    name: "novelty_seeker",
    description: "High stimulation + selfDirection, low tradition",
    valueSignature: {
      stimulation: 0.8,
      selfDirection: 0.8,
      tradition: 0.2,
    },
    effectivePatterns: ["scarcity", "commitment"],
    ineffectivePatterns: ["authority", "social_proof", "default_bias"],
  },
  {
    name: "community_oriented",
    description: "High benevolence + universalism, moderate conformity",
    valueSignature: {
      benevolence: 0.8,
      universalism: 0.7,
      conformity: 0.5,
    },
    effectivePatterns: ["unity", "reciprocity", "liking"],
    ineffectivePatterns: ["power", "scarcity"],
  },
  {
    name: "tradition_keeper",
    description: "High tradition + conformity + security",
    valueSignature: {
      tradition: 0.8,
      conformity: 0.8,
      security: 0.7,
    },
    effectivePatterns: ["authority", "social_proof", "default_bias"],
    ineffectivePatterns: ["scarcity", "commitment"],
  },
];

/**
 * Calculate susceptibility score for an influence pattern given a value profile.
 * @param values The persona's value profile
 * @param pattern The influence pattern to evaluate
 * @returns Susceptibility score 0-1 (higher = more susceptible)
 */
export function calculatePatternSusceptibility(
  values: Partial<SchwartzValues>,
  pattern: InfluencePattern
): number {
  const targetValues = pattern.targetValues;
  if (targetValues.length === 0) return 0.5;

  let sum = 0;
  let count = 0;

  for (const value of targetValues) {
    if (values[value] !== undefined) {
      sum += values[value]!;
      count++;
    }
  }

  return count > 0 ? sum / count : 0.5;
}

/**
 * Rank influence patterns by effectiveness for a given value profile.
 * @param values The persona's value profile
 * @returns Influence patterns sorted by susceptibility (most effective first)
 */
export function rankInfluencePatternsForProfile(
  values: Partial<SchwartzValues>
): Array<{ pattern: InfluencePattern; susceptibility: number }> {
  return INFLUENCE_PATTERNS
    .map((pattern) => ({
      pattern,
      susceptibility: calculatePatternSusceptibility(values, pattern),
    }))
    .sort((a, b) => b.susceptibility - a.susceptibility);
}
