/**
 * CBrowser - Cognitive Browser Automation
 *
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 * 
 *
 * 
 * 
 */

/**
 * Enterprise Loader (v15.0.0)
 *
 * Dynamically loads cbrowser-enterprise if installed.
 * Falls back to NoOpConstitutionalEnforcer for public-only users.
 */

import type { IConstitutionalEnforcer, StealthConfig } from "../types.js";
import { NoOpConstitutionalEnforcer } from "./framework.js";

/** Enterprise module shape */
interface EnterpriseModule {
  EnterpriseConstitutionalEnforcer: new (config?: Partial<StealthConfig>) => IConstitutionalEnforcer;
  version: string;
}

/** Cache the loaded module */
let enterpriseModule: EnterpriseModule | null = null;
let loadAttempted = false;

/**
 * Check if enterprise module is available
 */
export async function isEnterpriseAvailable(): Promise<boolean> {
  if (loadAttempted) {
    return enterpriseModule !== null;
  }

  try {
    await loadEnterpriseModule();
    return enterpriseModule !== null;
  } catch {
    return false;
  }
}

/**
 * Get enterprise version if available
 */
export function getEnterpriseVersion(): string | null {
  return enterpriseModule?.version ?? null;
}

/**
 * Attempt to load enterprise module
 */
async function loadEnterpriseModule(): Promise<EnterpriseModule | null> {
  if (loadAttempted) {
    return enterpriseModule;
  }

  loadAttempted = true;

  try {
    // Dynamic import of enterprise package
    // This will fail gracefully if not installed
    // Use string variable to prevent TypeScript from resolving at compile time
    const enterprisePackage = "cbrowser-enterprise";
    const module = await import(/* webpackIgnore: true */ enterprisePackage);

    // Validate module shape
    if (
      module.EnterpriseConstitutionalEnforcer &&
      typeof module.EnterpriseConstitutionalEnforcer === "function"
    ) {
      enterpriseModule = module as EnterpriseModule;
      console.log(`[CBrowser] Enterprise module loaded (v${module.version || "unknown"})`);
      return enterpriseModule;
    } else {
      console.warn("[CBrowser] Enterprise module found but invalid shape");
      return null;
    }
  } catch (error) {
    // Not installed - this is expected for public-only users
    if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
      // Silent - enterprise not installed
      return null;
    }

    // Unexpected error
    console.warn("[CBrowser] Failed to load enterprise module:", error);
    return null;
  }
}

/**
 * Get the appropriate constitutional enforcer
 *
 * Returns EnterpriseConstitutionalEnforcer if cbrowser-enterprise is installed,
 * otherwise returns NoOpConstitutionalEnforcer.
 *
 * @param config - Optional stealth configuration
 * @returns Constitutional enforcer instance
 *
 * @example
 * ```typescript
 * // Auto-detect enterprise
 * const enforcer = await getEnforcer();
 *
 * // With custom config
 * const enforcer = await getEnforcer({
 *   enabled: true,
 *   authorization: {
 *     authorizedDomains: ["*.mycompany.com"],
 *   },
 * });
 * ```
 */
export async function getEnforcer(
  config?: Partial<StealthConfig>
): Promise<IConstitutionalEnforcer> {
  const enterprise = await loadEnterpriseModule();

  if (enterprise) {
    return new enterprise.EnterpriseConstitutionalEnforcer(config);
  }

  // Fall back to NoOp
  return new NoOpConstitutionalEnforcer(config);
}

/**
 * Create enforcer synchronously (uses cached module)
 *
 * Must call isEnterpriseAvailable() first to load module.
 * If called before loading, returns NoOp enforcer.
 */
export function getEnforcerSync(
  config?: Partial<StealthConfig>
): IConstitutionalEnforcer {
  if (enterpriseModule) {
    return new enterpriseModule.EnterpriseConstitutionalEnforcer(config);
  }

  return new NoOpConstitutionalEnforcer(config);
}

/**
 * Print enterprise status for diagnostics
 */
export async function printEnterpriseStatus(): Promise<void> {
  const available = await isEnterpriseAvailable();

  if (available) {
    console.log("╔══════════════════════════════════════════════════════════╗");
    console.log("║  CBrowser Enterprise: ACTIVE                             ║");
    console.log(`║  Version: ${(getEnterpriseVersion() || "unknown").padEnd(47)}║`);
    console.log("║  Stealth capabilities: ENABLED                           ║");
    console.log("╚══════════════════════════════════════════════════════════╝");
  } else {
    console.log("╔══════════════════════════════════════════════════════════╗");
    console.log("║  CBrowser Enterprise: NOT INSTALLED                      ║");
    console.log("║  Stealth capabilities: DISABLED (NoOp mode)              ║");
    console.log("║                                                          ║");
    console.log("║  To enable enterprise features:                          ║");
    console.log("║  npm install cbrowser-enterprise --registry <private>    ║");
    console.log("║                                                          ║");
    console.log("║  Contact: alexandria.shai.eden@gmail.com                 ║");
    console.log("╚══════════════════════════════════════════════════════════╝");
  }
}
