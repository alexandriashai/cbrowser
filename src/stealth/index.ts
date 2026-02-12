/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexa Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Constitutional Stealth Framework
 *
 * Public framework for ethical stealth mode.
 * Full implementation available in cbrowser-enterprise.
 */

export {
  DEFAULT_STEALTH_CONFIG,
  MINIMUM_RATE_LIMITS,
  STEALTH_TERMS_OF_SERVICE,
  matchesDomainPattern,
  isProhibitedDomain,
  validateAcknowledgment,
  mergeStealthConfig,
  BaseConstitutionalEnforcer,
  NoOpConstitutionalEnforcer,
} from "./framework.js";

export type {
  StealthConfig,
  StealthAuthorization,
  StealthAcknowledgment,
  StealthRateLimits,
  StealthAuditEntry,
  StealthCheckResult,
  IConstitutionalEnforcer,
} from "./framework.js";

// Enterprise loader (v15.0.0)
export {
  getEnforcer,
  getEnforcerSync,
  isEnterpriseAvailable,
  getEnterpriseVersion,
  printEnterpriseStatus,
} from "./loader.js";
