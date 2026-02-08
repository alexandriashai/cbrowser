/**
 * CBrowser - Cognitive Browser Automation
 *
 * Copyright (c) 2026 WF Media (Alexandria Eden)
 * Email: alexandria.shai.eden@gmail.com
 *
 * This source code is licensed under the Business Source License 1.1
 * found in the LICENSE file in the root directory of this source tree.
 *
 * Non-production use is permitted. Production use requires a commercial license.
 * See LICENSE for full terms.
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
