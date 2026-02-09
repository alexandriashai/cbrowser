/**
 * Value Profiles for Built-in Personas
 *
 * Assigns Schwartz value profiles to each persona, enabling
 * prediction of behavioral tendencies and influence susceptibility.
 *
 * @copyright 2026 WF Media (Alexandria Eden) alexandria.shai.eden@gmail.com
 * @license BSL-1.1 (Business Source License 1.1) - See LICENSE file
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
  // ============================================================================
  {
    personaName: "motor-tremor",
    values: createPersonaValues(
      {
        selfDirection: 0.5,
        stimulation: 0.3,
        hedonism: 0.4,
        achievement: 0.5,
        power: 0.3,
        security: 0.7,
        conformity: 0.5,
        tradition: 0.5,
        benevolence: 0.6,
        universalism: 0.6,
      },
      {
        autonomyNeed: 0.7,
        competenceNeed: 0.6,
        relatednessNeed: 0.5,
      },
      "safety"
    ),
    rationale: "Motor impairment increases need for security and patience",
  },
  {
    personaName: "low-vision",
    values: createPersonaValues(
      {
        selfDirection: 0.5,
        stimulation: 0.3,
        hedonism: 0.4,
        achievement: 0.5,
        power: 0.3,
        security: 0.7,
        conformity: 0.5,
        tradition: 0.5,
        benevolence: 0.6,
        universalism: 0.6,
      },
      {
        autonomyNeed: 0.7,
        competenceNeed: 0.5,
        relatednessNeed: 0.6,
      },
      "safety"
    ),
    rationale: "Vision impairment increases reliance on familiar patterns",
  },
  {
    personaName: "adhd",
    values: createPersonaValues(
      {
        selfDirection: 0.6,
        stimulation: 0.9,
        hedonism: 0.6,
        achievement: 0.5,
        power: 0.4,
        security: 0.3,
        conformity: 0.3,
        tradition: 0.2,
        benevolence: 0.5,
        universalism: 0.5,
      },
      {
        autonomyNeed: 0.6,
        competenceNeed: 0.5,
        relatednessNeed: 0.5,
      },
      "esteem"
    ),
    rationale: "ADHD profile shows high stimulation-seeking, low patience for routine",
  },
  {
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
    rationale: "Color blindness doesn't affect motivational values (neutral profile)",
  },

  // ============================================================================
  // Emotional Personas (Public)
  // ============================================================================
  {
    personaName: "anxious-user",
    values: createPersonaValues(
      {
        selfDirection: 0.3,
        stimulation: 0.2,
        hedonism: 0.4,
        achievement: 0.4,
        power: 0.2,
        security: 0.95,
        conformity: 0.8,
        tradition: 0.7,
        benevolence: 0.6,
        universalism: 0.5,
      },
      {
        autonomyNeed: 0.3,
        competenceNeed: 0.6,
        relatednessNeed: 0.7,
      },
      "safety"
    ),
    rationale: "Anxiety drives extreme security-seeking and conformity",
  },
  {
    personaName: "confident-user",
    values: createPersonaValues(
      {
        selfDirection: 0.8,
        stimulation: 0.6,
        hedonism: 0.5,
        achievement: 0.8,
        power: 0.6,
        security: 0.3,
        conformity: 0.3,
        tradition: 0.3,
        benevolence: 0.5,
        universalism: 0.5,
      },
      {
        autonomyNeed: 0.8,
        competenceNeed: 0.8,
        relatednessNeed: 0.4,
      },
      "esteem"
    ),
    rationale: "Confidence enables self-direction and risk-taking",
  },
];

/**
 * Lookup value profile by persona name.
 * @param personaName Name of the persona
 * @returns PersonaValues or undefined if not found
 */
export function getPersonaValues(personaName: string): PersonaValues | undefined {
  const profile = PERSONA_VALUE_PROFILES.find(
    (p) => p.personaName.toLowerCase() === personaName.toLowerCase()
  );
  return profile?.values;
}

/**
 * Check if a persona has a value profile defined.
 * @param personaName Name of the persona
 * @returns true if values are defined
 */
export function hasPersonaValues(personaName: string): boolean {
  return PERSONA_VALUE_PROFILES.some(
    (p) => p.personaName.toLowerCase() === personaName.toLowerCase()
  );
}
