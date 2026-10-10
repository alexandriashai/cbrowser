/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
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
import { describeNavigationError } from "../navigation-errors.js";

/** Playwright appends a multi-line "Call log:"; a result keeps only the first line. */
const firstLine = (m: unknown): string => String(m ?? "").split("\n")[0].trim();

/**
 * blockUrls as one matcher, compiled before any route handler runs (v8 B27,
 * 2026-10-10). The glob used to be compiled inside the route handler, so a
 * pattern such as "*.(" threw SyntaxError there on every request. Playwright
 * rethrows a route handler's rejection from an event listener, where nothing
 * catches it: measured, it escaped chaos_test's caller entirely, and under Node
 * (both hosted servers) an unhandled rejection ends the process. Matching is
 * unchanged for every pattern that compiles; one that does not is in `invalid`.
 */
function compileBlockUrls(patterns: string[] | undefined): { matches: (url: string) => boolean; invalid: string[] } {
  const tests: Array<(url: string) => boolean> = [];
  const invalid: string[] = [];
  for (const pattern of patterns ?? []) {
    // Convert glob pattern to regex: *.css -> \.css$
    if (pattern.startsWith('*.')) {
      const ext = pattern.slice(1); // .css
      try {
        const regex = new RegExp(ext.replace('.', '\\.') + '$', 'i');
        tests.push((url) => regex.test(url));
      } catch {
        invalid.push(pattern);
      }
    } else {
      tests.push((url) => url.includes(pattern));
    }
  }
  return { matches: (url) => tests.some((t) => t(url)), invalid };
}

/**
 * A route handler that cannot reject (v8 B27, 2026-10-10), for the reason in
 * compileBlockUrls. On an error the request goes on unchanged and `onError`
 * gets the message.
 */
function safeRoute(handler: (route: any) => Promise<void>, onError: (message: string) => void): (route: any) => Promise<void> {
  return async (route: any) => {
    try {
      await handler(route);
    } catch (err: any) {
      onError(firstLine(err?.message ?? err));
      await route.continue().catch(() => { /* already handled, or the page is gone */ });
    }
  };
}

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

  // Refused before anything changes, so there is nothing to clean up.
  const blocked = compileBlockUrls(config.blockUrls);
  if (blocked.invalid.length > 0) {
    throw new Error(`Invalid blockUrls pattern(s): ${blocked.invalid.map((p) => JSON.stringify(p)).join(", ")}`);
  }

  // Track what we modified for cleanup
  const wasOffline = config.offline;
  const hadRoutes = config.networkLatency || config.blockUrls || config.failApis;

  // Network conditions
  if (config.offline) {
    await context.setOffline(true);
  }

  // Route interception for latency/failures
  if (hadRoutes) {
    await page.route("**/*", safeRoute(async (route: any) => {
      const url = route.request().url();

      // Block URLs - support both literal patterns and glob patterns (*.css, *.js)
      if (blocked.matches(url)) {
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
    }, (message) => console.warn(`[chaos] route handler failed, request continued: ${message}`)));
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
    /** The console error messages themselves (first 25), so the count is actionable. */
    consoleErrorMessages?: string[];
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
  /** The console error TEXT, so the count above is something a caller can act on. */
  const consoleErrorMessages: string[] = [];
  let pageCompleted = false;
  let pageInteractive = false;
  let loadTimeMs = 0;

  try {
    const page = await (browser as any).getPage();

    // Track console errors during chaos.
    //
    // This only incremented a counter, so a run reported `consoleErrors: 3`
    // beside `errors: []` — it knew three things went wrong and could not say
    // what any of them were, which makes the count unactionable. The text was
    // in hand the whole time. (2026-07-29)
    const consoleHandler = (msg: any) => {
      if (msg.type() !== "error") return;
      consoleErrors++;
      const text = String(msg.text?.() ?? "").trim();
      // Cap the list so a page erroring in a loop cannot flood the response;
      // the counter above stays exact regardless.
      if (text && consoleErrorMessages.length < 25) consoleErrorMessages.push(text.slice(0, 300));
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

    // v14.2.4: Clear browser cache before offline test to prevent false positives
    // Cached resources would load even in offline mode, contaminating results
    if (chaos.offline) {
      try {
        const context = await (browser as any).context;
        if (context && typeof context.clearCookies === "function") {
          await context.clearCookies();
        }
        // Clear service workers that might serve cached content
        await page.evaluate(() => {
          if ("caches" in window) {
            caches.keys().then(names => names.forEach(name => caches.delete(name)));
          }
        });
      } catch {
        // Ignore cache clearing errors
      }
    }

    // Apply chaos with enhanced tracking
    const context = await (browser as any).context;
    const hadRoutes = chaos.networkLatency || chaos.blockUrls || chaos.failApis;

    // v16.11.0: Wrap offline mode in try-catch to prevent server crashes
    if (chaos.offline) {
      try {
        await context.setOffline(true);
      } catch (offlineError: any) {
        errors.push(`Failed to enable offline mode: ${offlineError.message}`);
        // Continue test without offline - better than crashing
      }
    }

    if (hadRoutes) {
      const blocked = compileBlockUrls(chaos.blockUrls);
      for (const pattern of blocked.invalid) {
        errors.push(`blockUrls pattern ${JSON.stringify(pattern)} is not a valid pattern; nothing was blocked for it`);
      }
      await page.route("**/*", safeRoute(async (route: any) => {
        const reqUrl = route.request().url();
        const resourceType = route.request().resourceType();

        // Block URLs - support both literal patterns and glob patterns (*.css, *.js)
        if (blocked.matches(reqUrl)) {
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
      }, (message) => {
        const error = `Chaos route handler failed, request continued: ${message}`;
        if (!errors.includes(error)) errors.push(error);
      }));
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
      // Said as an outcome, not as Playwright's raw message and call log.
      // Offline failing to load is the expected answer for most pages, and the
      // question the test asks. (v8 B37)
      if (e.message?.includes("Timeout")) {
        errors.push(`Page load timeout after ${loadTimeMs}ms`);
      } else if (chaos.offline && /ERR_INTERNET_DISCONNECTED/.test(e.message ?? "")) {
        errors.push("Page failed to load offline: nothing served it from the cache or a service worker (net::ERR_INTERNET_DISCONNECTED).");
      } else {
        errors.push(`Navigation failed: ${describeNavigationError(e.message ?? "", url) ?? firstLine(e.message)}`);
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
        // Only for a page that loaded: a 2 ms failure against a 50 ms baseline
        // printed -96%, a load-time IMPROVEMENT, for a page that never loaded.
        loadTimeImpactPercent: baselineLoadTimeMs && pageCompleted
          ? Math.round((loadTimeMs / baselineLoadTimeMs - 1) * 100)
          : undefined,
        blockedResources: blockedResources.slice(0, 10), // Limit to 10
        failedResources: failedResources.slice(0, 10),
        delayedResources: delayedResources.slice(0, 10),
        pageCompleted,
        pageInteractive,
        consoleErrors,
        consoleErrorMessages,
        degradationSummary,
      },
    };
  } catch (e: any) {
    return {
      passed: false,
      errors: [...errors, firstLine(e.message)],
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
        consoleErrorMessages,
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
