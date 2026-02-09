/**
 * Values System - Public API
 *
 * Exports the research-backed values framework based on Schwartz's
 * Theory of Basic Human Values, Self-Determination Theory, and Maslow's
 * Hierarchy of Needs.
 *
 * @copyright 2026 WF Media (Alexandria Eden) alexandria.shai.eden@gmail.com
 * @license BSL-1.1 (Business Source License 1.1) - See LICENSE file
 */

// Core Schwartz values and types
export {
  type SchwartzValues,
  type HigherOrderValues,
  type SDTNeeds,
  type MaslowLevel,
  type PersonaValues,
  type ValueTraitCorrelation,
  calculateHigherOrderValues,
  createPersonaValues,
  VALUE_TRAIT_CORRELATIONS,
  DEFAULT_VALUES,
} from "./schwartz-values.js";

// Value-behavior mappings and influence patterns
export {
  type ValueBehaviors,
  type InfluencePattern,
  type ValueProfilePattern,
  VALUE_BEHAVIORS,
  INFLUENCE_PATTERNS,
  VALUE_PROFILE_PATTERNS,
  calculatePatternSusceptibility,
  rankInfluencePatternsForProfile,
} from "./value-mappings.js";

// Persona value profiles
export {
  type PersonaValueProfile,
  PERSONA_VALUE_PROFILES,
  getPersonaValues,
  hasPersonaValues,
  resolvePersonaName,
  registerPersonaValues,
} from "./persona-values.js";
