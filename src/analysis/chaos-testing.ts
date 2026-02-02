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
 */
export async function applyChaos(browser: CBrowser, config: ChaosConfig): Promise<void> {
  const context = await (browser as any).context;
  const page = await (browser as any).getPage();

  // Network conditions
  if (config.offline) {
    await context.setOffline(true);
  }

  // Route interception for latency/failures
  if (config.networkLatency || config.blockUrls || config.failApis) {
    await page.route("**/*", async (route: any) => {
      const url = route.request().url();

      // Block URLs
      if (config.blockUrls?.some(pattern => url.includes(pattern))) {
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
}

/**
 * Run chaos test - apply conditions and verify app resilience.
 */
export async function runChaosTest(
  browser: CBrowser,
  url: string,
  chaos: ChaosConfig,
  actions: string[] = []
): Promise<{
  passed: boolean;
  errors: string[];
  duration: number;
  screenshot: string;
}> {
  const startTime = Date.now();
  const errors: string[] = [];

  try {
    await applyChaos(browser, chaos);
    await browser.navigate(url);

    // Execute actions
    for (const action of actions) {
      const result = await executeNaturalLanguage(browser, action);
      if (!result.success) {
        errors.push(`Action failed: ${action} - ${result.error}`);
      }
    }

    const screenshot = await browser.screenshot();

    return {
      passed: errors.length === 0,
      errors,
      duration: Date.now() - startTime,
      screenshot,
    };
  } catch (e: any) {
    return {
      passed: false,
      errors: [...errors, e.message],
      duration: Date.now() - startTime,
      screenshot: "",
    };
  }
}
