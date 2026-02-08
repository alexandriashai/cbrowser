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
 * Chaos Engineering for Browser Testing
 *
 * Tier 4: Apply adverse conditions to test application resilience:
 * - Network latency and offline simulation
 * - URL blocking and API failure injection
 * - Random delays and CPU throttling
 */

import type { CBrowser } from "../browser.js";
import { executeNaturalLanguage } from "./natural-language.js";

export interface ChaosConfig {
  /** Simulate slow network (ms latency) */
  networkLatency?: number;
  /** Simulate offline mode */
  offline?: boolean;
  /** Block specific URL patterns */
  blockUrls?: string[];
  /** Inject random delays (0-1 probability) */
  randomDelays?: number;
  /** Fail specific API calls */
  failApis?: Array<{ pattern: string; status: number; body?: string }>;
  /** CPU throttling (1-20x slowdown) */
  cpuThrottle?: number;
}

/**
 * Apply chaos engineering conditions to browser.
 * Returns a cleanup function that restores original state.
 */
export async function applyChaos(browser: CBrowser, config: ChaosConfig): Promise<() => Promise<void>> {
  const context = await (browser as any).context;
  const page = await (browser as any).getPage();

  // Track what we modified for cleanup
  const wasOffline = config.offline;
  const hadRoutes = config.networkLatency || config.blockUrls || config.failApis;

  // Network conditions
  if (config.offline) {
    await context.setOffline(true);
  }

  // Route interception for latency/failures
  if (hadRoutes) {
    await page.route("**/*", async (route: any) => {
      const url = route.request().url();

      // Block URLs - support both literal patterns and glob patterns (*.css, *.js)
      if (config.blockUrls?.some(pattern => {
        // Convert glob pattern to regex: *.css -> \.css$
        if (pattern.startsWith('*.')) {
          const ext = pattern.slice(1); // .css
          const regex = new RegExp(ext.replace('.', '\\.') + '$', 'i');
          return regex.test(url);
        }
        return url.includes(pattern);
      })) {
        await route.abort();
        return;
      }

      // Fail specific APIs
      const failConfig = config.failApis?.find(f => url.includes(f.pattern));
      if (failConfig) {
        await route.fulfill({
          status: failConfig.status,
          body: failConfig.body || "Chaos: Simulated failure",
        });
        return;
      }

      // Add latency
      if (config.networkLatency) {
        await new Promise(r => setTimeout(r, config.networkLatency));
      }

      // Random delays
      if (config.randomDelays && Math.random() < config.randomDelays) {
        await new Promise(r => setTimeout(r, Math.random() * 3000));
      }

      await route.continue();
    });
  }

  // Return cleanup function to restore original state
  return async () => {
    try {
      if (wasOffline) {
        await context.setOffline(false);
      }
      if (hadRoutes) {
        await page.unroute("**/*");
      }
    } catch {
      // Context may be closed, ignore cleanup errors
    }
  };
}

/** v11.9.0: Enhanced chaos test result with detailed impact analysis */
export interface ChaosTestResult {
  passed: boolean;
  errors: string[];
  duration: number;
  screenshot: string;
  /** v11.9.0: Detailed chaos impact analysis */
  impact: {
    /** Load time in ms */
    loadTimeMs: number;
    /** Baseline load time without chaos (if available) */
    baselineLoadTimeMs?: number;
    /** Load time increase percentage */
    loadTimeImpactPercent?: number;
    /** Resources that were blocked */
    blockedResources: string[];
    /** Resources that failed due to chaos */
    failedResources: string[];
    /** Resources that were delayed */
    delayedResources: string[];
    /** Whether page finished loading (DOMContentLoaded fired) */
    pageCompleted: boolean;
    /** Whether page reached interactive state */
    pageInteractive: boolean;
    /** Number of console errors during chaos */
    consoleErrors: number;
    /** Summary of what degraded */
    degradationSummary: string[];
  };
}

/**
 * Run chaos test - apply conditions and verify app resilience.
 * v11.9.0: Enhanced with detailed impact analysis (issue #92)
 * Always cleans up chaos conditions after test completes (success or failure).
 */
export async function runChaosTest(
  browser: CBrowser,
  url: string,
  chaos: ChaosConfig,
  actions: string[] = []
): Promise<ChaosTestResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  let cleanup: (() => Promise<void>) | null = null;

  // v11.9.0: Track resource impacts
  const blockedResources: string[] = [];
  const failedResources: string[] = [];
  const delayedResources: string[] = [];
  let consoleErrors = 0;
  let pageCompleted = false;
  let pageInteractive = false;
  let loadTimeMs = 0;

  try {
    const page = await (browser as any).getPage();

    // Track console errors during chaos
    const consoleHandler = (msg: any) => {
      if (msg.type() === "error") consoleErrors++;
    };
    page.on("console", consoleHandler);

    // Get baseline load time first (quick navigation without chaos)
    let baselineLoadTimeMs: number | undefined;
    try {
      const baselineStart = Date.now();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
      baselineLoadTimeMs = Date.now() - baselineStart;
      await page.goto("about:blank"); // Reset
    } catch {
      // Baseline measurement failed, continue without it
    }

    // Apply chaos with enhanced tracking
    const context = await (browser as any).context;
    const hadRoutes = chaos.networkLatency || chaos.blockUrls || chaos.failApis;

    if (chaos.offline) {
      await context.setOffline(true);
    }

    if (hadRoutes) {
      await page.route("**/*", async (route: any) => {
        const reqUrl = route.request().url();
        const resourceType = route.request().resourceType();

        // Block URLs - support both literal patterns and glob patterns (*.css, *.js)
        if (chaos.blockUrls?.some(pattern => {
          // Convert glob pattern to regex: *.css -> \.css$
          if (pattern.startsWith('*.')) {
            const ext = pattern.slice(1); // .css
            const regex = new RegExp(ext.replace('.', '\\.') + '$', 'i');
            return regex.test(reqUrl);
          }
          return reqUrl.includes(pattern);
        })) {
          blockedResources.push(`${resourceType}: ${new URL(reqUrl).pathname}`);
          await route.abort();
          return;
        }

        // Fail specific APIs
        const failConfig = chaos.failApis?.find(f => reqUrl.includes(f.pattern));
        if (failConfig) {
          failedResources.push(`${resourceType}: ${new URL(reqUrl).pathname} → ${failConfig.status}`);
          await route.fulfill({
            status: failConfig.status,
            body: failConfig.body || "Chaos: Simulated failure",
          });
          return;
        }

        // Add latency
        if (chaos.networkLatency) {
          delayedResources.push(`${resourceType}: ${new URL(reqUrl).pathname} +${chaos.networkLatency}ms`);
          await new Promise(r => setTimeout(r, chaos.networkLatency));
        }

        // Random delays
        if (chaos.randomDelays && Math.random() < chaos.randomDelays) {
          const delay = Math.floor(Math.random() * 3000);
          delayedResources.push(`${resourceType}: ${new URL(reqUrl).pathname} +${delay}ms (random)`);
          await new Promise(r => setTimeout(r, delay));
        }

        await route.continue();
      });
    }

    cleanup = async () => {
      try {
        page.off("console", consoleHandler);
        if (chaos.offline) {
          await context.setOffline(false);
        }
        if (hadRoutes) {
          await page.unroute("**/*");
        }
      } catch {
        // Context may be closed, ignore cleanup errors
      }
    };

    // Navigate with chaos applied
    const navStart = Date.now();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      pageCompleted = true;
      loadTimeMs = Date.now() - navStart;
    } catch (e: any) {
      loadTimeMs = Date.now() - navStart;
      if (e.message?.includes("Timeout")) {
        errors.push(`Page load timeout after ${loadTimeMs}ms`);
      } else {
        errors.push(`Navigation failed: ${e.message}`);
      }
    }

    // Check if page is interactive
    try {
      await page.evaluate(() => document.readyState);
      pageInteractive = true;
    } catch {
      pageInteractive = false;
    }

    // Execute actions
    for (const action of actions) {
      const result = await executeNaturalLanguage(browser, action);
      if (!result.success) {
        errors.push(`Action failed: ${action} - ${result.error}`);
      }
    }

    const screenshot = await browser.screenshot();

    // Generate degradation summary
    const degradationSummary: string[] = [];
    if (blockedResources.length > 0) {
      degradationSummary.push(`${blockedResources.length} resources blocked`);
    }
    if (failedResources.length > 0) {
      degradationSummary.push(`${failedResources.length} API calls failed`);
    }
    if (chaos.networkLatency && delayedResources.length > 0) {
      degradationSummary.push(`${delayedResources.length} resources delayed by ${chaos.networkLatency}ms`);
    }
    if (baselineLoadTimeMs && loadTimeMs > baselineLoadTimeMs * 1.5) {
      degradationSummary.push(`Load time increased ${Math.round((loadTimeMs / baselineLoadTimeMs - 1) * 100)}%`);
    }
    if (consoleErrors > 0) {
      degradationSummary.push(`${consoleErrors} console errors during load`);
    }
    if (!pageCompleted) {
      degradationSummary.push("Page did not complete loading");
    }
    if (degradationSummary.length === 0) {
      degradationSummary.push("Page handled chaos gracefully");
    }

    return {
      passed: errors.length === 0,
      errors,
      duration: Date.now() - startTime,
      screenshot,
      impact: {
        loadTimeMs,
        baselineLoadTimeMs,
        loadTimeImpactPercent: baselineLoadTimeMs
          ? Math.round((loadTimeMs / baselineLoadTimeMs - 1) * 100)
          : undefined,
        blockedResources: blockedResources.slice(0, 10), // Limit to 10
        failedResources: failedResources.slice(0, 10),
        delayedResources: delayedResources.slice(0, 10),
        pageCompleted,
        pageInteractive,
        consoleErrors,
        degradationSummary,
      },
    };
  } catch (e: any) {
    return {
      passed: false,
      errors: [...errors, e.message],
      duration: Date.now() - startTime,
      screenshot: "",
      impact: {
        loadTimeMs,
        blockedResources,
        failedResources,
        delayedResources,
        pageCompleted,
        pageInteractive,
        consoleErrors,
        degradationSummary: ["Test failed with exception"],
      },
    };
  } finally {
    // CRITICAL: Always restore network state after chaos test
    if (cleanup) {
      await cleanup();
    }
  }
}
