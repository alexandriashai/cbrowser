/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexa Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Constitutional Stealth Framework (v15.0.0)
 *
 * This module provides the public framework for ethical stealth mode.
 * The actual stealth implementation is provided by cbrowser-enterprise.
 *
 * Key principles:
 * 1. Domain allowlist only - users must declare authorized domains
 * 2. Action blacklist - certain actions are never allowed with stealth
 * 3. Behavioral detection - patterns suggesting abuse are blocked
 * 4. Immutable audit trail - all stealth actions are logged
 * 5. Rate limiting - cannot be disabled
 */

import type {
  StealthConfig,
  StealthAuthorization,
  StealthAcknowledgment,
  StealthRateLimits,
  StealthAuditEntry,
  StealthCheckResult,
  IConstitutionalEnforcer,
  ActionZone,
  STEALTH_PROHIBITED_ACTIONS,
  STEALTH_PROHIBITED_DOMAINS,
} from "../types.js";

/**
 * Default stealth configuration
 */
export const DEFAULT_STEALTH_CONFIG: StealthConfig = {
  enabled: false,
  authorization: {
    authorizedDomains: [],
    blockedDomains: [],
    requireExplicitAuth: true,
  },
  rateLimits: {
    requestsPerMinute: 30,
    formsPerMinute: 5,
    authAttemptsPerMinute: 3,
  },
};

/**
 * Default rate limits (cannot be lowered by user config)
 */
export const MINIMUM_RATE_LIMITS: StealthRateLimits = {
  requestsPerMinute: 10,
  formsPerMinute: 2,
  authAttemptsPerMinute: 2,
};

/**
 * Terms of Service for stealth mode
 * Must be accepted before first use
 */
export const STEALTH_TERMS_OF_SERVICE = `
CBrowser Constitutional Stealth Mode - Terms of Service

By enabling stealth mode, you acknowledge and agree that:

1. AUTHORIZATION: You have explicit written authorization to perform
   automated testing on all domains you configure.

2. OWNERSHIP: You own the domains or have a signed agreement with the owner.

3. NO MALICIOUS USE: You will not use stealth mode for:
   - Unauthorized access to any system
   - Bypassing security controls without authorization
   - Scraping data in violation of Terms of Service
   - Account creation automation without permission
   - Any illegal activity

4. LIABILITY: You accept full legal responsibility for all actions
   taken using stealth mode.

5. AUDIT COMPLIANCE: You consent to audit logs being retained for 90 days.

6. RATE LIMITS: You acknowledge that rate limits cannot be disabled
   and are enforced to prevent abuse.

Type 'I AGREE' to continue.
`;

/**
 * Check if a URL matches an authorized domain pattern
 */
export function matchesDomainPattern(url: string, pattern: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const patternLower = pattern.toLowerCase();

    // Exact match
    if (hostname === patternLower) {
      return true;
    }

    // Wildcard match (*.example.com)
    if (patternLower.startsWith("*.")) {
      const suffix = patternLower.slice(2);
      return hostname.endsWith(suffix) || hostname === suffix.slice(1);
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Check if URL matches any prohibited domain pattern
 */
export function isProhibitedDomain(url: string): boolean {
  const prohibitedPatterns = [
    "*.gov",
    "*.mil",
    "*.edu",
  ];

  return prohibitedPatterns.some(pattern => matchesDomainPattern(url, pattern));
}

/**
 * Validate stealth acknowledgment
 */
export function validateAcknowledgment(ack: StealthAcknowledgment): boolean {
  if (!ack.ownershipConfirmed) return false;
  if (!ack.authorizedTestingOnly) return false;
  if (!ack.acceptsResponsibility) return false;
  if (!ack.signedBy || ack.signedBy.trim() === "") return false;
  if (!ack.signedAt) return false;

  // Check that signature is not too old (90 days)
  const signedDate = new Date(ack.signedAt);
  const now = new Date();
  const daysDiff = (now.getTime() - signedDate.getTime()) / (1000 * 60 * 60 * 24);

  return daysDiff <= 90;
}

/**
 * Merge user config with defaults, enforcing minimum rate limits
 */
export function mergeStealthConfig(userConfig: Partial<StealthConfig>): StealthConfig {
  const merged = { ...DEFAULT_STEALTH_CONFIG, ...userConfig };

  // Enforce minimum rate limits
  if (merged.rateLimits) {
    merged.rateLimits = {
      requestsPerMinute: Math.max(
        merged.rateLimits.requestsPerMinute,
        MINIMUM_RATE_LIMITS.requestsPerMinute
      ),
      formsPerMinute: Math.max(
        merged.rateLimits.formsPerMinute,
        MINIMUM_RATE_LIMITS.formsPerMinute
      ),
      authAttemptsPerMinute: Math.max(
        merged.rateLimits.authAttemptsPerMinute,
        MINIMUM_RATE_LIMITS.authAttemptsPerMinute
      ),
    };
  }

  return merged;
}

/**
 * Base constitutional enforcer with framework logic
 * Extended by cbrowser-enterprise for full implementation
 */
export abstract class BaseConstitutionalEnforcer implements IConstitutionalEnforcer {
  protected config: StealthConfig;
  protected auditLog: StealthAuditEntry[] = [];
  protected requestCounts: Map<string, { count: number; resetAt: Date }> = new Map();

  constructor(config: Partial<StealthConfig> = {}) {
    this.config = mergeStealthConfig(config);
  }

  /**
   * Check if domain is authorized
   */
  isDomainAuthorized(url: string): boolean {
    // Check prohibited domains first
    if (isProhibitedDomain(url)) {
      return false;
    }

    // Check blocked domains
    for (const blocked of this.config.authorization.blockedDomains) {
      if (matchesDomainPattern(url, blocked)) {
        return false;
      }
    }

    // Check authorized domains
    for (const authorized of this.config.authorization.authorizedDomains) {
      if (matchesDomainPattern(url, authorized)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if action is allowed with stealth
   */
  async canExecuteWithStealth(action: string, url: string): Promise<StealthCheckResult> {
    // 1. Check if stealth is enabled
    if (!this.config.enabled) {
      return {
        allowed: false,
        zone: "red" as ActionZone,
        reason: "Stealth mode is not enabled",
        suggestion: "Enable stealth mode in config or with --stealth flag",
      };
    }

    // 2. Check domain authorization
    if (!this.isDomainAuthorized(url)) {
      return {
        allowed: false,
        zone: "black" as ActionZone,
        reason: `Domain not in authorized list: ${new URL(url).hostname}`,
        suggestion: "Add domain to authorizedDomains in stealth config",
      };
    }

    // 3. Check prohibited actions
    const prohibitedActions = [
      "bypass_captcha",
      "inject_cookies",
      "spoof_identity",
      "mass_account_creation",
      "credential_stuffing",
      "rate_limit_bypass",
    ];

    if (prohibitedActions.includes(action)) {
      return {
        allowed: false,
        zone: "black" as ActionZone,
        reason: `Action '${action}' is prohibited with stealth mode`,
      };
    }

    // 4. Check rate limits
    const rateLimitStatus = this.getRateLimitStatus();
    if (rateLimitStatus.remaining <= 0) {
      return {
        allowed: false,
        zone: "red" as ActionZone,
        reason: "Rate limit exceeded",
        suggestion: `Wait until ${rateLimitStatus.resetsAt.toISOString()}`,
      };
    }

    // 5. Check acknowledgment if required
    if (this.config.authorization.requireExplicitAuth && !this.config.acknowledgment) {
      return {
        allowed: false,
        zone: "red" as ActionZone,
        reason: "Stealth mode requires signed acknowledgment",
        requiresConfirmation: true,
      };
    }

    if (this.config.acknowledgment && !validateAcknowledgment(this.config.acknowledgment)) {
      return {
        allowed: false,
        zone: "red" as ActionZone,
        reason: "Acknowledgment is invalid or expired (>90 days)",
        requiresConfirmation: true,
      };
    }

    return {
      allowed: true,
      zone: "green" as ActionZone,
    };
  }

  /**
   * Log audit entry (immutable)
   */
  async logAudit(entry: Omit<StealthAuditEntry, "timestamp">): Promise<void> {
    const fullEntry: StealthAuditEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    this.auditLog.push(fullEntry);

    // Subclass should persist to disk/database
    await this.persistAuditEntry(fullEntry);
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus(): { remaining: number; resetsAt: Date } {
    const now = new Date();
    const key = "requests";
    const current = this.requestCounts.get(key);

    if (!current || current.resetAt < now) {
      const resetsAt = new Date(now.getTime() + 60000); // 1 minute
      return {
        remaining: this.config.rateLimits.requestsPerMinute,
        resetsAt,
      };
    }

    return {
      remaining: this.config.rateLimits.requestsPerMinute - current.count,
      resetsAt: current.resetAt,
    };
  }

  /**
   * Validate acknowledgment
   */
  validateAcknowledgment(ack: StealthAcknowledgment): boolean {
    return validateAcknowledgment(ack);
  }

  /**
   * Abstract method for persisting audit entries
   * Implemented by cbrowser-enterprise
   */
  protected abstract persistAuditEntry(entry: StealthAuditEntry): Promise<void>;

  /**
   * Abstract method for applying stealth measures
   * Implemented by cbrowser-enterprise
   */
  abstract applyStealthMeasures(page: unknown): Promise<void>;
}

/**
 * No-op enforcer for public repo (stealth not available)
 * Stealth implementation requires cbrowser-enterprise
 */
export class NoOpConstitutionalEnforcer extends BaseConstitutionalEnforcer {
  protected async persistAuditEntry(_entry: StealthAuditEntry): Promise<void> {
    // No-op in public version
    console.log("[Stealth] Audit entry logged (not persisted - requires cbrowser-enterprise)");
  }

  async applyStealthMeasures(_page: unknown): Promise<void> {
    console.warn(
      "[Stealth] Stealth measures not available in public cbrowser.\n" +
      "For full stealth capabilities, upgrade to cbrowser-enterprise.\n" +
      "Contact: alexandria.shai.eden@gmail.com"
    );
  }
}

/**
 * Export framework components
 */
export {
  type StealthConfig,
  type StealthAuthorization,
  type StealthAcknowledgment,
  type StealthRateLimits,
  type StealthAuditEntry,
  type StealthCheckResult,
  type IConstitutionalEnforcer,
};
