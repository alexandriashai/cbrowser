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
import { getAnyPersona } from "../personas.js";
import { deriveValuesFromBigFive } from "./big-five-values.js";
import { scopedAccountId } from "../persona-scope.js";
import { currentRequestIdentity } from "../request-context.js";

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
        stimulation: 0.8,  // high — bored fast, wants novelty
        hedonism: 0.5,
        achievement: 0.5,  // reduced from 0.8 — impatience ≠ ambition, just wants speed
        power: 0.4,
        security: 0.3,
        conformity: 0.3,
        tradition: 0.2,
        benevolence: 0.3,
        universalism: 0.3,
      },
      {
        autonomyNeed: 0.7,
        competenceNeed: 0.5,  // reduced — not trying to master, just wants it done
        relatednessNeed: 0.3,
      },
      "esteem"
    ),
    rationale: "Impatient users want speed and novelty, not mastery — high stimulation, moderate achievement",
  },
  {
    // v18.54.0: Screen reader users — previously missing from values system
    personaName: "screen-reader-user",
    values: createPersonaValues(
      {
        selfDirection: 0.7,  // high — AT users develop strong independent navigation skills
        stimulation: 0.3,    // low — prefer predictable, consistent interfaces
        hedonism: 0.4,
        achievement: 0.6,    // moderate-high — determined to complete tasks despite barriers
        power: 0.4,
        security: 0.8,       // high — need reliable, predictable structure (ARIA, landmarks)
        conformity: 0.6,     // moderate — follow standard patterns (skip links, headings)
        tradition: 0.5,
        benevolence: 0.6,
        universalism: 0.7,   // high — value inclusive design, empathize with accessibility needs
      },
      {
        autonomyNeed: 0.8,       // high — independence is core to AT use
        competenceNeed: 0.7,     // high — want to prove they can navigate independently
        relatednessNeed: 0.5,
      },
      "esteem"
    ),
    rationale: "Screen reader users value independence (high autonomy/self-direction), need predictable structure (high security), and care about inclusive design (high universalism)",
  },
  {
    // v18.54.0: Dyslexic users — previously missing from values system
    personaName: "dyslexic-user",
    values: createPersonaValues(
      {
        selfDirection: 0.5,
        stimulation: 0.4,    // prefer calm, clear interfaces over novelty
        hedonism: 0.5,
        achievement: 0.6,    // motivated to succeed despite reading challenges
        power: 0.3,
        security: 0.7,       // need consistent, familiar layouts
        conformity: 0.6,     // follow established patterns (reduces reading demand)
        tradition: 0.5,
        benevolence: 0.6,
        universalism: 0.7,   // value inclusive design
      },
      {
        autonomyNeed: 0.5,
        competenceNeed: 0.7,     // want to feel capable despite processing challenges
        relatednessNeed: 0.5,
      },
      "belonging"
    ),
    rationale: "Dyslexic users need predictable structure (security/conformity), are motivated by achievement despite challenges, and value inclusive design",
  },
  {
    personaName: "deaf-user",
    values: createPersonaValues(
      { selfDirection: 0.6, stimulation: 0.4, hedonism: 0.5, achievement: 0.6, power: 0.4,
        security: 0.7, conformity: 0.5, tradition: 0.5, benevolence: 0.6, universalism: 0.7 },
      { autonomyNeed: 0.7, competenceNeed: 0.6, relatednessNeed: 0.6 },
      "belonging"
    ),
    rationale: "Deaf users value visual communication (self-direction), predictable structure (security), and inclusive design (universalism). High relatedness — community-oriented.",
  },
  {
    personaName: "elderly-low-vision",
    values: createPersonaValues(
      { selfDirection: 0.3, stimulation: 0.2, hedonism: 0.4, achievement: 0.3, power: 0.2,
        security: 0.9, conformity: 0.8, tradition: 0.9, benevolence: 0.8, universalism: 0.7 },
      { autonomyNeed: 0.4, competenceNeed: 0.4, relatednessNeed: 0.7 },
      "safety"
    ),
    rationale: "Combined age + vision impairment. Highest security/tradition/conformity — needs maximum predictability and structure.",
  },
  {
    personaName: "autism-spectrum",
    values: createPersonaValues(
      { selfDirection: 0.5, stimulation: 0.2, hedonism: 0.3, achievement: 0.6, power: 0.3,
        security: 0.9, conformity: 0.7, tradition: 0.6, benevolence: 0.5, universalism: 0.5 },
      { autonomyNeed: 0.6, competenceNeed: 0.8, relatednessNeed: 0.4 },
      "safety"
    ),
    rationale: "Autistic users need predictability (very high security), literal/consistent interfaces (conformity), and value competence highly. Low stimulation — overwhelmed by novelty.",
  },
  {
    personaName: "intellectual-disability",
    values: createPersonaValues(
      { selfDirection: 0.3, stimulation: 0.3, hedonism: 0.5, achievement: 0.4, power: 0.2,
        security: 0.8, conformity: 0.7, tradition: 0.6, benevolence: 0.7, universalism: 0.6 },
      { autonomyNeed: 0.4, competenceNeed: 0.5, relatednessNeed: 0.7 },
      "safety"
    ),
    rationale: "Needs simple, predictable interfaces (security/conformity). High relatedness — benefits from support. Low self-direction — prefers guided paths.",
  },
  {
    personaName: "aphasia-receptive",
    values: createPersonaValues(
      { selfDirection: 0.4, stimulation: 0.2, hedonism: 0.4, achievement: 0.5, power: 0.3,
        security: 0.8, conformity: 0.6, tradition: 0.5, benevolence: 0.6, universalism: 0.7 },
      { autonomyNeed: 0.5, competenceNeed: 0.6, relatednessNeed: 0.6 },
      "safety"
    ),
    rationale: "Language comprehension impairment. High security — needs icons/visual cues over text. Values inclusive design (universalism).",
  },
  {
    personaName: "dyscalculia",
    values: createPersonaValues(
      { selfDirection: 0.5, stimulation: 0.4, hedonism: 0.5, achievement: 0.5, power: 0.3,
        security: 0.7, conformity: 0.6, tradition: 0.5, benevolence: 0.6, universalism: 0.6 },
      { autonomyNeed: 0.5, competenceNeed: 0.6, relatednessNeed: 0.5 },
      "belonging"
    ),
    rationale: "Numerical processing difficulty. High security — anxious around pricing, quantities. Moderate conformity — follows patterns to avoid math.",
  },
  {
    personaName: "emotional-user",
    values: createPersonaValues(
      { selfDirection: 0.4, stimulation: 0.5, hedonism: 0.6, achievement: 0.4, power: 0.3,
        security: 0.6, conformity: 0.5, tradition: 0.5, benevolence: 0.8, universalism: 0.7 },
      { autonomyNeed: 0.4, competenceNeed: 0.4, relatednessNeed: 0.8 },
      "belonging"
    ),
    rationale: "Emotionally reactive. High benevolence/relatedness — responsive to empathetic messaging. High hedonism — seeks pleasant experiences.",
  },
  {
    personaName: "stoic-user",
    values: createPersonaValues(
      { selfDirection: 0.7, stimulation: 0.3, hedonism: 0.3, achievement: 0.7, power: 0.5,
        security: 0.5, conformity: 0.4, tradition: 0.6, benevolence: 0.5, universalism: 0.5 },
      { autonomyNeed: 0.7, competenceNeed: 0.7, relatednessNeed: 0.3 },
      "esteem"
    ),
    rationale: "Emotionally stable, task-focused. High self-direction/achievement — goal-oriented. Low relatedness — not influenced by social proof.",
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
  return findPersonaValueProfile(personaName)?.values;
}

/**
 * Value profiles from an account's CMS custom personas, per account.
 *
 * Four tools (cognitive_journey_init, attention_analysis, cognitive_effort and
 * the comparison path) fetch the caller's custom persona from the CMS and used
 * to write its values into PERSONA_VALUE_PROFILES. That array is one per
 * process and getPersonaValues reads it by name alone, so on the hosted server
 * one account's custom-persona values resolved for every account using that
 * name and were listed to other accounts in persona_values_lookup's
 * availablePersonas. Same shape as
 * ACCOUNT_PERSONAS in personas.ts: stored per account, read only through the
 * request's own scope. Built-in profiles stay in the global registry.
 * (tenant, 2026-10-10)
 */
const ACCOUNT_VALUE_PROFILES = new Map<number, PersonaValueProfile[]>();

/**
 * The profile a name resolves to for this caller: its own account's CMS entry
 * first, then the global registry. Unscoped callers read the registry only.
 */
export function findPersonaValueProfile(personaName: string): PersonaValueProfile | undefined {
  const canonicalName = resolvePersonaName(personaName);
  const matches = (p: PersonaValueProfile) => p.personaName.toLowerCase() === canonicalName;
  const accountId = scopedAccountId();
  const own = accountId === undefined ? undefined : ACCOUNT_VALUE_PROFILES.get(accountId)?.find(matches);
  return own ?? PERSONA_VALUE_PROFILES.find(matches);
}

/**
 * Register value profiles that came from the CALLER's CMS custom personas.
 *
 * Inside an account scope they go to that account's store. A hosted request
 * with no account registers nothing, because no store is only the caller's;
 * the tool still uses the values it just fetched. Outside any request (CLI,
 * stdio, local) this is registerPersonaValues, as before.
 * registerPersonaValues itself stays global: the Enterprise build registers
 * its process-wide Marketing Suite profiles through it. (tenant, 2026-10-10)
 */
export function registerAccountPersonaValues(profiles: PersonaValueProfile[]): void {
  const accountId = scopedAccountId();
  if (accountId === undefined) {
    if (currentRequestIdentity() === undefined) registerPersonaValues(profiles);
    return;
  }
  const own = ACCOUNT_VALUE_PROFILES.get(accountId) ?? [];
  for (const profile of profiles) {
    const i = own.findIndex((p) => p.personaName.toLowerCase() === profile.personaName.toLowerCase());
    if (i >= 0) own[i] = profile;
    else own.push(profile);
  }
  ACCOUNT_VALUE_PROFILES.set(accountId, own);
}

/**
 * Check if a persona has a value profile defined.
 * v16.14.3: Now supports aliases
 * @param personaName Name of the persona (full or short)
 * @returns true if values are defined
 */
export function hasPersonaValues(personaName: string): boolean {
  return findPersonaValueProfile(personaName) !== undefined;
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


/**
 * Values for any persona, from whichever source has them.
 *
 * getPersonaValues consults the hand-authored registry ONLY, and six call
 * sites used it directly — including the values-to-LLM path and the
 * useValues:true saliency path. A custom persona therefore reached those with
 * no values at all: not defaults, nothing, because the registry has never
 * heard of it. The lookup tools had this same bug and were fixed twice; the
 * consumers behind them were still on the narrow function.
 *
 * Order: registry, then the persona's own schwartzValues block, then a Big
 * Five derivation. Explicit numbers beat derived ones, and a derivation
 * through the Big Five beats one through cognitive traits because that is the
 * layer the published correlations relate to values. (2026-08-01)
 */
export function resolveValuesForPersona(personaName: string): PersonaValues | undefined {
  const registry = getPersonaValues(personaName);
  if (registry) return registry;

  const persona = getAnyPersona(personaName) as unknown as Record<string, unknown> | undefined;
  if (!persona) return undefined;

  const own = persona.schwartzValues as PersonaValues | undefined;
  if (own) return own;

  const bigFive = persona.bigFive as Record<string, number> | undefined;
  if (bigFive && Object.keys(bigFive).length) {
    return deriveValuesFromBigFive(bigFive).values as unknown as PersonaValues;
  }
  return undefined;
}
