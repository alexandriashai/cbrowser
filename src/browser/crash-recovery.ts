/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Crash recovery
 *
 * Health checks, recovery after a browser crash, forceClose and withCrashRecovery.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import type { BrowserHealthResult, BrowserRecoveryResult } from "../types.js";
import { CBrowserErrorCode } from "../types.js";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Browser Crash Recovery (v11.8.0)
// =========================================================================

/** Maximum attempts for crash recovery */
const MAX_RECOVERY_ATTEMPTS = 3;
/** Default timeout for health check in ms */
const HEALTH_CHECK_TIMEOUT = 5000;
/** Base retry delay in ms (exponential backoff) */
const BASE_RETRY_DELAY = 1000;

// =========================================================================
// Browser Crash Recovery (v11.8.0)
// =========================================================================

export async function isBrowserHealthy(this: CBrowser): Promise<BrowserHealthResult> {
  const startTime = Date.now();

  // No page or context means browser needs launch, not recovery
  if (!this.page || !this.context) {
    return {
      healthy: false,
      error: CBrowserErrorCode.BROWSER_DISCONNECTED,
      message: "Browser not launched",
      checkDurationMs: Date.now() - startTime,
    };
  }

  try {
    // Check if page is closed
    if (this.page.isClosed()) {
      return {
        healthy: false,
        error: CBrowserErrorCode.BROWSER_CRASHED,
        message: "Page is closed unexpectedly",
        checkDurationMs: Date.now() - startTime,
      };
    }

    // Try a simple evaluate to verify browser is responsive
    const healthCheck = await Promise.race([
      this.page.evaluate(() => ({
        url: window.location.href,
        readyState: document.readyState,
        timestamp: Date.now(),
      })),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("Health check timeout")), HEALTH_CHECK_TIMEOUT)
      ),
    ]);

    if (!healthCheck) {
      return {
        healthy: false,
        error: CBrowserErrorCode.BROWSER_UNRESPONSIVE,
        message: "Browser failed to respond within timeout",
        checkDurationMs: Date.now() - startTime,
      };
    }

    return {
      healthy: true,
      message: `Browser healthy, page at ${(healthCheck as { url: string }).url}`,
      checkDurationMs: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Detect specific crash patterns
    if (errorMessage.includes("Target closed") || errorMessage.includes("Browser closed")) {
      return {
        healthy: false,
        error: CBrowserErrorCode.BROWSER_CRASHED,
        message: `Browser process crashed: ${errorMessage}`,
        checkDurationMs: Date.now() - startTime,
      };
    }

    if (errorMessage.includes("disconnected") || errorMessage.includes("Connection refused")) {
      return {
        healthy: false,
        error: CBrowserErrorCode.BROWSER_DISCONNECTED,
        message: `Browser disconnected: ${errorMessage}`,
        checkDurationMs: Date.now() - startTime,
      };
    }

    if (errorMessage.includes("timeout") || errorMessage.includes("Timeout")) {
      return {
        healthy: false,
        error: CBrowserErrorCode.BROWSER_UNRESPONSIVE,
        message: `Browser unresponsive: ${errorMessage}`,
        checkDurationMs: Date.now() - startTime,
      };
    }

    return {
      healthy: false,
      error: CBrowserErrorCode.BROWSER_CRASHED,
      message: `Browser health check failed: ${errorMessage}`,
      checkDurationMs: Date.now() - startTime,
    };
  }
}

export async function recoverBrowser(this: CBrowser, options?: {
  maxAttempts?: number;
  restoreUrl?: string;
}): Promise<BrowserRecoveryResult> {
  const startTime = Date.now();
  const maxAttempts = options?.maxAttempts ?? MAX_RECOVERY_ATTEMPTS;

  // First check if recovery is actually needed
  const healthResult = await this.isBrowserHealthy();
  if (healthResult.healthy) {
    return {
      success: true,
      recoveryNeeded: false,
      message: "Browser is already healthy, no recovery needed",
      attempts: 0,
      recoveryDurationMs: Date.now() - startTime,
    };
  }

  if (this.config.verbose) {
    console.error(`🔄 Browser crash detected: ${healthResult.message}`);
    console.error(`🔄 Attempting recovery (max ${maxAttempts} attempts)...`);
  }

  // Get the last known URL before crash for restoration
  const savedSession = this.loadSessionState();
  const restoreUrl = options?.restoreUrl ?? savedSession?.url;

  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (this.config.verbose) {
        console.error(`🔄 Recovery attempt ${attempt}/${maxAttempts}...`);
      }

      // Force close any zombie processes
      await this.forceClose();

      // Wait with exponential backoff before retry
      const delay = BASE_RETRY_DELAY * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));

      // Relaunch browser
      await this.launch();

      // Restore previous URL if available
      if (restoreUrl && restoreUrl !== "about:blank" && this.page) {
        try {
          // Through the gate reading: on the hosted server the gate's
          // refusal is a restore that failed, not a recovered page.
          const page = this.page;
          await this.gotoThroughGate(page, restoreUrl, () => page.goto(restoreUrl, {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          }));
        } catch (e) {
          // URL restoration is best-effort, don't fail recovery
          if (this.config.verbose) {
            console.error(`⚠️ Could not restore URL: ${restoreUrl}`);
          }
        }
      }

      // Verify recovery was successful
      const postRecoveryHealth = await this.isBrowserHealthy();
      if (postRecoveryHealth.healthy) {
        if (this.config.verbose) {
          console.error(`✅ Browser recovered successfully on attempt ${attempt}`);
        }
        return {
          success: true,
          recoveryNeeded: true,
          message: `Browser recovered after ${attempt} attempt(s)`,
          attempts: attempt,
          recoveryDurationMs: Date.now() - startTime,
        };
      }

      lastError = postRecoveryHealth.message;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (this.config.verbose) {
        console.error(`❌ Recovery attempt ${attempt} failed: ${lastError}`);
      }
    }
  }

  // All attempts failed
  return {
    success: false,
    recoveryNeeded: true,
    error: CBrowserErrorCode.BROWSER_RECOVERY_FAILED,
    message: `Failed to recover browser after ${maxAttempts} attempts: ${lastError}`,
    attempts: maxAttempts,
    recoveryDurationMs: Date.now() - startTime,
    retryAfterMs: BASE_RETRY_DELAY * Math.pow(2, maxAttempts),
  };
}

export async function forceClose(this: CBrowser): Promise<void> {
  // A browser that is still starting is closed once it has started (startSettled).
  await this.startSettled();

  // Remove listeners to prevent memory leaks
  if (this.page) {
    try {
      this.page.removeAllListeners();
    } catch {
      // Ignore - page may be destroyed
    }
  }

  // Force close context with a timeout that doesn't leak its own timer.
  // Plain Promise.race(close, setTimeout(r, 2000)) leaks the setTimeout if
  // close() wins — the timer keeps the event loop alive for 2s and accumulates
  // on every forceClose call.
  // Resolves TRUE when the TIMEOUT won, so the caller can tell "closed" from
  // "gave up waiting". The old signature returned void, which is why forceClose
  // did not actually force anything: on timeout the race resolved, the handles
  // were dropped, and nothing was ever signalled. A page with a hanging
  // beforeunload handler or a JS busy-loop therefore left an orphaned chromium
  // with no reference to it, and in the long-lived daemon those accumulate
  // until memory is exhausted. (2026-07-26)
  const raceWithTimeout = async <T>(p: Promise<T>, ms: number): Promise<boolean> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        p.then(() => false),
        new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(true), ms); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  if (this.context) {
    try { await raceWithTimeout(this.context.close(), 2000); } catch { /* may already be closed */ }
    this.context = null;
    this.page = null;
  }

  // Force close browser
  if (this.browser) {
    let timedOut = false;
    try { timedOut = await raceWithTimeout(this.browser.close(), 2000); } catch { /* may already be closed */ }
    this.browser = null;

    if (timedOut) {
      // We cannot signal it, and saying so beats pretending to.
      //
      // Playwright's Browser does NOT expose the child process — verified
      // 2026-07-26: `typeof browser.process === "function"` is false on a
      // chromium.launch() handle; only launchServer()'s BrowserServer has
      // process(). The hosted server no longer relies on it: it finds each
      // session's processes by user-data-dir (browser-process-tree.ts) and
      // kills a tree this method leaves behind on its next sweep (2026-11-12).
      //
      // Elsewhere (CLI, daemon, library) the honest behaviour is still to
      // make the orphan LOUD so it can be reaped externally, instead of
      // dropping the handle in silence.
      console.warn("[CBrowser] forceClose: browser.close() timed out after 2000ms — the chromium process may be orphaned. Playwright exposes no process handle to signal it; reap externally if these accumulate.");
    }
  }

  // The forwarder or egress gate goes with the browser it was started for.
  // It used to stay until the next launch closed it, so a recovery that
  // never relaunched kept its two listeners, and a browser whose close
  // timed out above kept a working way out. Without the gate that browser
  // reaches nothing: every engine fails closed on a proxy that is gone.
  await this.closeProxyForwarder();
}

export async function withCrashRecovery<T>(
  this: CBrowser,
  operation: () => Promise<T>,
  operationName: string = "operation"
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if this looks like a browser crash
    const crashIndicators = [
      "Target closed",
      "Browser closed",
      "disconnected",
      "Connection refused",
      "Protocol error",
      "browser has been closed",
      "Execution context was destroyed",
    ];

    const isCrash = crashIndicators.some((indicator) =>
      errorMessage.toLowerCase().includes(indicator.toLowerCase())
    );

    if (!isCrash) {
      // Not a crash, re-throw original error
      throw error;
    }

    if (this.config.verbose) {
      console.error(`🔄 Browser crash detected during ${operationName}, attempting recovery...`);
    }

    // Attempt recovery
    const recovery = await this.recoverBrowser();

    if (!recovery.success) {
      // Recovery failed, throw structured error
      throw new Error(
        JSON.stringify({
          error: "browser_crash",
          errorCode: CBrowserErrorCode.BROWSER_RECOVERY_FAILED,
          message: recovery.message,
          recovering: false,
          retryAfterMs: recovery.retryAfterMs ?? 5000,
          operation: operationName,
        })
      );
    }

    // Recovery succeeded, retry the operation once
    if (this.config.verbose) {
      console.error(`🔄 Retrying ${operationName} after recovery...`);
    }

    try {
      return await operation();
    } catch (retryError) {
      // Second failure after recovery
      throw new Error(
        JSON.stringify({
          error: "browser_crash",
          errorCode: CBrowserErrorCode.BROWSER_CRASHED,
          message: `Operation failed after recovery: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
          recovering: false,
          retryAfterMs: 5000,
          operation: operationName,
        })
      );
    }
  }
}
