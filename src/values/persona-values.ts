/**
 * Value Profiles for Built-in Personas
 *
 * Assigns Schwartz value profiles to each persona, enabling
 * prediction of behavioral tendencies and influence susceptibility.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT - See LICENSE file
 */

import type { PersonaValues, MaslowLevel } from "./schwartz-values.js";
import { createPersonaValues } from "./schwartz-values.js";

/**
 * Value profile with persona name for lookup.
 */
export interface PersonaValueProfile {
  personaName: string;
  values: PersonaValues;
  rationale: string;
  /**
   * Research citations justifying value assignments.
   * Format: "Author (Year): Key finding. DOI or publication info."
   */
  researchBasis?: string[];
}

/**
 * Value profiles for all built-in personas.
 * These extend the existing cognitive trait profiles with motivational depth.
 */
export const PERSONA_VALUE_PROFILES: PersonaValueProfile[] = [
  // ============================================================================
  // UX Personas (Public)
  // ============================================================================
  {
    personaName: "power-user",
    values: createPersonaValues(
      {
        selfDirection: 0.9,
        stimulation: 0.7,
        hedonism: 0.4,
        achievement: 0.8,
        power: 0.5,
        security: 0.3,
        conformity: 0.2,
        tradition: 0.2,
        benevolence: 0.4,
        universalism: 0.4,
      },
      {
        autonomyNeed: 0.9,
        competenceNeed: 0.8,
        relatednessNeed: 0.4,
      },
      "esteem"
    ),
    rationale: "Expert users value autonomy and achievement, comfortable with risk",
  },
  {
    personaName: "first-timer",
    values: createPersonaValues(
      {
        selfDirection: 0.3,
        stimulation: 0.4,
        hedonism: 0.5,
        achievement: 0.5,
        power: 0.3,
        security: 0.8,
        conformity: 0.7,
        tradition: 0.5,
        benevolence: 0.5,
        universalism: 0.5,
      },
      {
        autonomyNeed: 0.4,
        competenceNeed: 0.7,
        relatednessNeed: 0.6,
      },
      "safety"
    ),
    rationale: "New users need guidance and reassurance, value security",
  },
  {
    personaName: "elderly-user",
    values: createPersonaValues(
      {
        selfDirection: 0.4,
        stimulation: 0.2,
        hedonism: 0.4,
        achievement: 0.4,
        power: 0.3,
        security: 0.9,
        conformity: 0.7,
        tradition: 0.8,
        benevolence: 0.7,
        universalism: 0.6,
      },
      {
        autonomyNeed: 0.5,
        competenceNeed: 0.6,
        relatednessNeed: 0.7,
      },
      "safety"
    ),
    rationale: "Older users value tradition, security, and familiar patterns",
  },
  {
    personaName: "mobile-user",
    values: createPersonaValues(
      {
        selfDirection: 0.5,
        stimulation: 0.6,
        hedonism: 0.6,
        achievement: 0.6,
        power: 0.4,
        security: 0.4,
        conformity: 0.5,
        tradition: 0.3,
        benevolence: 0.5,
        universalism: 0.5,
      },
      {
        autonomyNeed: 0.6,
        competenceNeed: 0.5,
        relatednessNeed: 0.6,
      },
      "esteem"
    ),
    rationale: "Mobile users balance efficiency with on-the-go constraints",
  },
  {
    personaName: "distracted-user",
    values: createPersonaValues(
      {
        selfDirection: 0.5,
        stimulation: 0.7,
        hedonism: 0.5,
        achievement: 0.5,
        power: 0.4,
        security: 0.4,
        conformity: 0.5,
        tradition: 0.4,
        benevolence: 0.5,
        universalism: 0.5,
      },
      {
        autonomyNeed: 0.5,
        competenceNeed: 0.5,
        relatednessNeed: 0.5,
      },
      "esteem"
    ),
    rationale: "Distracted users are stimulation-seeking but time-constrained",
  },
  {
    personaName: "impatient-user",
    values: createPersonaValues(
      {
        selfDirection: 0.6,
        stimulation: 0.7,
        hedonism: 0.4,
        achievement: 0.8,
        power: 0.5,
        security: 0.3,
        conformity: 0.3,
        tradition: 0.2,
        benevolence: 0.4,
        universalism: 0.4,
      },
      {
        autonomyNeed: 0.7,
        competenceNeed: 0.7,
        relatednessNeed: 0.3,
      },
      "esteem"
    ),
    rationale: "Impatient users prioritize achievement and efficiency over process",
  },
  {
    personaName: "careful-reader",
    values: createPersonaValues(
      {
        selfDirection: 0.5,
        stimulation: 0.3,
        hedonism: 0.4,
        achievement: 0.5,
        power: 0.3,
        security: 0.8,
        conformity: 0.6,
        tradition: 0.6,
        benevolence: 0.5,
        universalism: 0.5,
      },
      {
        autonomyNeed: 0.5,
        competenceNeed: 0.7,
        relatednessNeed: 0.5,
      },
      "safety"
    ),
    rationale: "Careful readers value security and take time to understand",
  },
  {
    personaName: "explorer",
    values: createPersonaValues(
      {
        selfDirection: 0.9,
        stimulation: 0.9,
        hedonism: 0.6,
        achievement: 0.5,
        power: 0.4,
        security: 0.2,
        conformity: 0.2,
        tradition: 0.2,
        benevolence: 0.5,
        universalism: 0.6,
      },
      {
        autonomyNeed: 0.9,
        competenceNeed: 0.6,
        relatednessNeed: 0.4,
      },
      "self-actualization"
    ),
    rationale: "Explorers are driven by curiosity and openness to new experiences",
  },
  {
    personaName: "task-focused",
    values: createPersonaValues(
      {
        selfDirection: 0.5,
        stimulation: 0.3,
        hedonism: 0.3,
        achievement: 0.9,
        power: 0.4,
        security: 0.5,
        conformity: 0.5,
        tradition: 0.5,
        benevolence: 0.4,
        universalism: 0.4,
      },
      {
        autonomyNeed: 0.5,
        competenceNeed: 0.9,
        relatednessNeed: 0.3,
      },
      "esteem"
    ),
    rationale: "Task-focused users prioritize achievement and competence above all",
  },

  // ============================================================================
  // Accessibility Personas (Public)
  // Research-grounded value assignments based on disability type:
  // - Cognition-affecting (ADHD): Specific values per neuroscience research
  // - Physical (motor, vision): Security/autonomy shifts for predictability needs
  // - Sensory-only (color-blind): Neutral values (doesn't change motivation)
  // ============================================================================
  {
    // PHYSICAL DISABILITY: Motor impairment → elevated security + autonomy
    personaName: "motor-tremor",
    values: createPersonaValues(
      {
        selfDirection: 0.5,
        stimulation: 0.3,  // Lower: prefers predictable interfaces
        hedonism: 0.4,
        achievement: 0.5,
        power: 0.3,
        security: 0.75,    // Higher: needs stable, forgiving UI
        conformity: 0.5,
        tradition: 0.5,
        benevolence: 0.6,
        universalism: 0.6,
      },
      {
        autonomyNeed: 0.75,  // Higher: need for control over interaction pace
        competenceNeed: 0.6,
        relatednessNeed: 0.5,
      },
      "safety"
    ),
    rationale: "Motor impairment increases need for predictable, forgiving interfaces and control over interaction pace",
    researchBasis: [
      "Trewin, S. (2000). Configuration agents, control and privacy. ACM ASSETS. DOI: 10.1145/354324.354328",
      "Wobbrock, J.O., et al. (2011). Ability-Based Design. CACM 54(6). DOI: 10.1145/1924421.1924442",
      "Keates, S., et al. (2002). Countering design exclusion through inclusive design. CHI Extended Abstracts. DOI: 10.1145/506443.506458",
    ],
  },
  {
    // PHYSICAL DISABILITY: Vision impairment → elevated security + relatedness
    personaName: "low-vision",
    values: createPersonaValues(
      {
        selfDirection: 0.5,
        stimulation: 0.3,  // Lower: novel UIs increase cognitive load
        hedonism: 0.4,
        achievement: 0.5,
        power: 0.3,
        security: 0.75,    // Higher: needs consistent, predictable layouts
        conformity: 0.5,
        tradition: 0.5,
        benevolence: 0.6,
        universalism: 0.6,
      },
      {
        autonomyNeed: 0.7,   // High: need for screen reader/magnification control
        competenceNeed: 0.5,
        relatednessNeed: 0.65, // Slightly higher: community support important
      },
      "safety"
    ),
    rationale: "Vision impairment increases reliance on consistent patterns and assistive technology control",
    researchBasis: [
      "Bigham, J.P., et al. (2017). WebInSight: Making web images accessible. ASSETS. DOI: 10.1145/3132525.3132540",
      "Petrie, H., et al. (2004). Remote usability evaluations with disabled people. CHI. DOI: 10.1145/985692.985776",
      "Theofanos, M.F., & Redish, J. (2003). Guidelines for accessible and usable web sites. Interactions 10(6). DOI: 10.1145/947226.947227",
    ],
  },
  {
    // COGNITIVE DISABILITY: ADHD → specific values based on neuroscience
    // Dopamine dysregulation affects reward-seeking and delay aversion
    personaName: "adhd",
    values: createPersonaValues(
      {
        selfDirection: 0.65, // Moderate-high: resist constraints, prefer flexibility
        stimulation: 0.9,    // Very high: novelty-seeking, dopamine-driven
        hedonism: 0.65,      // Moderate-high: immediate gratification preference
        achievement: 0.5,
        power: 0.4,
        security: 0.25,      // Low: routine feels aversive
        conformity: 0.25,    // Low: difficulty following prescribed processes
        tradition: 0.2,      // Low: prefers innovation over established ways
        benevolence: 0.5,
        universalism: 0.5,
      },
      {
        autonomyNeed: 0.7,   // High: need for self-paced, flexible interaction
        competenceNeed: 0.5,
        relatednessNeed: 0.5,
      },
      "esteem"
    ),
    rationale: "ADHD involves dopamine dysregulation causing high stimulation-seeking, delay aversion, and difficulty with routine tasks",
    researchBasis: [
      "Barkley, R.A. (2015). Attention-Deficit Hyperactivity Disorder: A Handbook for Diagnosis and Treatment. Guilford Press. ISBN: 978-1462517725",
      "Sonuga-Barke, E.J. (2005). Causal models of ADHD: From common simple deficits to multiple developmental pathways. Biological Psychiatry 57(11). DOI: 10.1016/j.biopsych.2004.09.008",
      "Volkow, N.D., et al. (2011). Motivation deficit in ADHD is associated with dysfunction of the dopamine reward pathway. Molecular Psychiatry 16. DOI: 10.1038/mp.2010.97",
      "Tripp, G., & Wickens, J.R. (2008). Dopamine transfer deficit: A neurobiological theory of altered reinforcement mechanisms in ADHD. Journal of Child Psychology and Psychiatry 49(7). DOI: 10.1111/j.1469-7610.2007.01851.x",
    ],
  },
  {
    // SENSORY-ONLY: Color blindness → neutral values
    // Color perception does not affect motivational psychology
    personaName: "color-blind",
    values: createPersonaValues(
      {
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
      },
      {
        autonomyNeed: 0.5,
        competenceNeed: 0.5,
        relatednessNeed: 0.5,
      },
      "esteem"
    ),
    rationale: "Color vision deficiency is a sensory difference that does not affect motivational values or personality - only color perception",
    researchBasis: [
      "Sharpe, L.T., et al. (1999). Red, green, and red-green hybrid pigments in the human retina. Vision Research 39(25). DOI: 10.1016/S0042-6989(99)00118-2",
      "Note: Color blindness research focuses on perception, not motivation. Values remain neutral because color perception does not influence Schwartz's basic human values or SDT psychological needs.",
    ],
  },

  // ============================================================================
  // Emotional Personas (Public)
  // Based on trait anxiety/confidence research and their effects on values
  // ============================================================================
  {
    personaName: "anxious-user",
    values: createPersonaValues(
      {
        selfDirection: 0.3,   // Low: anxiety reduces exploratory behavior
        stimulation: 0.2,     // Very low: novelty triggers threat response
        hedonism: 0.4,
        achievement: 0.4,
        power: 0.2,           // Low: avoids situations requiring assertiveness
        security: 0.95,       // Very high: core anxiety response
        conformity: 0.8,      // High: safety in following established norms
        tradition: 0.7,       // High: familiar = safe
        benevolence: 0.6,
        universalism: 0.5,
      },
      {
        autonomyNeed: 0.3,    // Low: prefers guidance over independence
        competenceNeed: 0.6,
        relatednessNeed: 0.7, // High: seeks reassurance from others
      },
      "safety"
    ),
    rationale: "Trait anxiety drives extreme security-seeking, avoidance of novelty, and preference for established patterns",
    researchBasis: [
      "Carver, C.S., & White, T.L. (1994). Behavioral inhibition, behavioral activation, and affective responses. Journal of Personality and Social Psychology 67(2). DOI: 10.1037/0022-3514.67.2.319",
      "Gray, J.A., & McNaughton, N. (2000). The Neuropsychology of Anxiety. Oxford University Press. ISBN: 978-0198522713",
      "Schwartz, S.H., et al. (2012). Refining the theory of basic individual values. Journal of Personality and Social Psychology 103(4). DOI: 10.1037/a0029393",
    ],
  },
  {
    personaName: "confident-user",
    values: createPersonaValues(
      {
        selfDirection: 0.8,   // High: self-efficacy enables autonomous action
        stimulation: 0.6,     // Moderate-high: open to new experiences
        hedonism: 0.5,
        achievement: 0.8,     // High: believes in ability to succeed
        power: 0.6,           // Moderate-high: comfortable with influence
        security: 0.3,        // Low: doesn't need extensive reassurance
        conformity: 0.3,      // Low: willing to deviate from norms
        tradition: 0.3,       // Low: open to change
        benevolence: 0.5,
        universalism: 0.5,
      },
      {
        autonomyNeed: 0.8,    // High: prefers independent action
        competenceNeed: 0.8,  // High: expects to master challenges
        relatednessNeed: 0.4, // Lower: less dependent on validation
      },
      "esteem"
    ),
    rationale: "High self-efficacy enables autonomous exploration, risk-taking, and deviation from established patterns",
    researchBasis: [
      "Bandura, A. (1997). Self-efficacy: The exercise of control. W.H. Freeman. ISBN: 978-0716728504",
      "Judge, T.A., et al. (2007). Self-efficacy and work-related performance. Psychological Bulletin 133(1). DOI: 10.1037/0033-2909.133.1.107",
      "Luthans, F., et al. (2007). Psychological capital: Developing the human competitive edge. Oxford University Press. DOI: 10.1093/acprof:oso/9780195187526.001.0001",
    ],
  },
];

// ============================================================================
// Persona Name Aliases (v16.14.3)
// Maps full accessibility persona names to short value profile names
// Fixes: list_cognitive_personas returns "cognitive-adhd" but values use "adhd"
// ============================================================================

const PERSONA_NAME_ALIASES: Record<string, string> = {
  // Accessibility personas: full name → short name
  "motor-impairment-tremor": "motor-tremor",
  "low-vision-magnified": "low-vision",
  "low-vision-moderate": "low-vision",
  "cognitive-adhd": "adhd",
  "color-blind-deuteranopia": "color-blind",
  "color-blind-protanopia": "color-blind",
  "color-blind-tritanopia": "color-blind",
  // Also support short → full (bidirectional)
  "motor-tremor": "motor-tremor",
  "low-vision": "low-vision",
  "adhd": "adhd",
  "color-blind": "color-blind",
};

/**
 * Resolve persona name to canonical value profile name.
 * Accepts both full names (cognitive-adhd) and short names (adhd).
 * @param personaName Input persona name
 * @returns Canonical value profile name
 */
export function resolvePersonaName(personaName: string): string {
  const lower = personaName.toLowerCase();
  return PERSONA_NAME_ALIASES[lower] || lower;
}

/**
 * Lookup value profile by persona name.
 * v16.14.3: Now supports aliases - accepts both "cognitive-adhd" and "adhd"
 * @param personaName Name of the persona (full or short)
 * @returns PersonaValues or undefined if not found
 */
export function getPersonaValues(personaName: string): PersonaValues | undefined {
  const canonicalName = resolvePersonaName(personaName);
  const profile = PERSONA_VALUE_PROFILES.find(
    (p) => p.personaName.toLowerCase() === canonicalName
  );
  return profile?.values;
}

/**
 * Check if a persona has a value profile defined.
 * v16.14.3: Now supports aliases
 * @param personaName Name of the persona (full or short)
 * @returns true if values are defined
 */
export function hasPersonaValues(personaName: string): boolean {
  const canonicalName = resolvePersonaName(personaName);
  return PERSONA_VALUE_PROFILES.some(
    (p) => p.personaName.toLowerCase() === canonicalName
  );
}

/**
 * Register additional persona value profiles at runtime.
 * Used by Enterprise edition to add Marketing Suite personas.
 * @param profiles Array of PersonaValueProfile to register
 * @since 16.17.0
 */
export function registerPersonaValues(profiles: PersonaValueProfile[]): void {
  for (const profile of profiles) {
    // Check if already exists
    const existingIndex = PERSONA_VALUE_PROFILES.findIndex(
      (p) => p.personaName.toLowerCase() === profile.personaName.toLowerCase()
    );
    if (existingIndex >= 0) {
      // Update existing
      PERSONA_VALUE_PROFILES[existingIndex] = profile;
    } else {
      // Add new
      PERSONA_VALUE_PROFILES.push(profile);
    }
  }
}
