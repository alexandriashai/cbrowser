/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Navigation
 *
 * navigate, waiting for the page to settle, and Cloudflare challenges.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import type { Page, Response } from "playwright";
import type { NavigateOptions, NavigationResult } from "../types.js";
import { assertHostedNavigable } from "../mcp-tools/hosted-inputs.js";
import { navigationError } from "../navigation-errors.js";
import { gotoThroughGate } from "./helpers.js";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Navigation
// =========================================================================

export async function navigate(this: CBrowser, url: string, options: NavigateOptions = {}): Promise<NavigationResult> {
  // Hosted server only: refuse non-web schemes before a page exists. Tool URL
  // parameters are checked where they arrive, but URLs also reach this method
  // from free text (nl_test_inline "go to ..." steps), and the root-run
  // browser opened file: URLs from there (sec-paths, 2026-10-10).
  assertHostedNavigable(url);
  // Skip session restore since we're explicitly navigating to a new URL
  const prevSkip = this.skipSessionRestore;
  this.skipSessionRestore = true;
  const page = await this.getPage();
  this.skipSessionRestore = prevSkip;
  const startTime = Date.now();

  const warnings: string[] = [];

  // This navigation's console errors and warnings are the tab's capture
  // buffer sliced from here (v8 B27, 2026-10-10). The page.on("console") that
  // used to be added here was never removed, so every navigate left one more
  // listener on the tab (measured 6 -> 9 over three calls). Uncaught
  // exceptions stay out of `errors`, as before. The attach is a no-op for any
  // tab this CBrowser opened; it covers a page swapped in from elsewhere.
  this.attachConsoleCapture(page);
  const consoleStart = this.consoleSeq;
  const loggedHere = (): { errors: string[]; warnings: string[] } => {
    const logged = { errors: [] as string[], warnings: [] as string[] };
    for (const m of this.consoleMessagesSince(page, consoleStart)) {
      if (m.source !== "console") continue;
      if (m.type === "error") logged.errors.push(m.text);
      else if (m.type === "warning") logged.warnings.push(m.text);
    }
    return logged;
  };

  // v11.3.0: Configurable wait strategy
  const waitStrategy = options.waitStrategy || "auto";
  const waitTimeout = options.waitTimeout ?? 10000;
  const waitForStability = options.waitForStability ?? (waitStrategy === "auto" || waitStrategy === "domcontentloaded");

  // Every goto below goes through the egress gate's reading (gotoThroughGate):
  // on the hosted server a page the gate did not carry is a plain error
  // here, whichever engine reported it and however, and a plain-http answer
  // the gate wrote itself is a failed navigation, not a page. Not hosted
  // this is page.goto and nothing else. That error passes through the two
  // text checks below untouched because its sentence holds none of the
  // words they look for (a net:: code, "Timeout"), which
  // tests/browser-route.test.ts holds it to.
  const gate = this.gate;
  const goto = (waitUntil: "commit" | "load" | "domcontentloaded" | "networkidle", timeout: number): Promise<Response | null> =>
    gotoThroughGate(gate, page, url, () => page.goto(url, { waitUntil, timeout }));

  // Helper to detect proxy tunnel errors and provide actionable messages
  const wrapProxyError = (e: unknown): never => {
    const errMsg = (e as Error).message || "";
    if (errMsg.includes("ERR_TUNNEL_CONNECTION_FAILED") || errMsg.includes("ERR_PROXY_CONNECTION_FAILED")) {
      const proxyServer = this.config.proxy?.server || "configured proxy";
      throw new Error(
        `Proxy tunnel rejected by ${url}. The target site is blocking proxy/VPN connections ` +
        `(proxy: ${proxyServer}). This is the site's anti-bot defense, not a CBrowser issue.\n\n` +
        `Recommendations:\n` +
        `1. Re-run without the proxy to test from your direct IP\n` +
        `2. Try a different geo region — the site may block specific IP ranges\n` +
        `3. Some sites (Stripe, GitHub, banking) aggressively block residential proxies`
      );
    }
    if (errMsg.includes("ERR_NETWORK_CHANGED") && this.config.proxy) {
      throw new Error(
        `Network changed during proxy connection to ${url}. The residential proxy IP may have rotated mid-request ` +
        `or the site detected and dropped the proxy tunnel.\n\n` +
        `Recommendations:\n` +
        `1. Retry — residential proxy IPs rotate and the next one may work\n` +
        `2. Re-run without the proxy to test from your direct IP\n` +
        `3. Use a sticky session proxy for sites that are sensitive to IP changes`
      );
    }
    // Everything else: a plain-language message for the known net:: codes
    // (unresolvable host, refused, timed out, certificate...), without the
    // Playwright Call log; anything unrecognised is rethrown unchanged.
    throw navigationError(e, url);
  };

  try {
  if (waitStrategy === "commit") {
    // Fastest: don't wait at all after navigation commits
    await goto("commit", this.config.timeout || 30000);
  } else if (waitStrategy === "load") {
    // Standard: wait for load event
    await goto("load", this.config.timeout || 30000);
  } else if (waitStrategy === "domcontentloaded") {
    // Fast: wait only for DOM
    await goto("domcontentloaded", this.config.timeout || 30000);
    if (waitForStability) {
      await this.waitForStability(page, 2000);
    }
  } else if (waitStrategy === "networkidle") {
    // Strict: wait for network idle, may fail on SPAs
    await goto("networkidle", this.config.timeout || 30000);
  } else {
    // "auto" (default): Progressive loading strategy
    // Many SPAs (GitHub, NYT, BBC, etc.) never reach networkidle
    const networkIdleTimeout = Math.min(waitTimeout, this.config.timeout || 30000);

    try {
      // Try networkidle first with short timeout
      await goto("networkidle", networkIdleTimeout);
    } catch (e) {
      const error = e as Error;
      if (error.message?.includes("Timeout") || error.message?.includes("timeout")) {
        // Fallback: Use domcontentloaded + manual stability check
        if (this.config.verbose) {
          console.error(`⚠️ networkidle timeout after ${waitTimeout}ms, falling back to domcontentloaded...`);
        }

        // Fallback to domcontentloaded (rethrows on failure)
        await goto("domcontentloaded", this.config.timeout || 30000);

        // Wait for page to stabilize (no major DOM changes for 500ms)
        if (waitForStability) {
          await this.waitForStability(page, 2000);
        }
      } else {
        // Non-timeout error — proxy detection handled by outer catch
        wrapProxyError(e);
      }
    }
  }
  } catch (navError) {
    // Wrap any proxy-related navigation error with actionable message
    wrapProxyError(navError);
  }

  // Post-navigation waits for dynamic content (translation, deferred rendering)
  let waitSelectorTimedOut = false;
  if (options.waitForSelector) {
    try {
      await page.waitForSelector(options.waitForSelector, {
        timeout: options.waitTimeout ?? 10000,
      });
    } catch {
      waitSelectorTimedOut = true;
      warnings.push(`waitForSelector "${options.waitForSelector}" timed out after ${options.waitTimeout ?? 10000}ms — the expected element never appeared. The page may not have completed the operation you were waiting for (e.g., translation, dynamic render).`);
    }
  }
  if (options.waitAfterLoad && options.waitAfterLoad > 0) {
    await page.waitForTimeout(options.waitAfterLoad);
  }

  const loadTime = Date.now() - startTime;

  // v11.9.0: Post-navigation verification to detect context desync (issue #84)
  const actualUrl = page.url();
  const actualTitle = await page.title();

  // Extract domains for comparison
  const getHostname = (urlStr: string): string => {
    try {
      return new URL(urlStr).hostname.toLowerCase();
    } catch {
      return urlStr.toLowerCase();
    }
  };

  const expectedHost = getHostname(url);
  const actualHost = getHostname(actualUrl);

  // Check for domain mismatch (indicates desync)
  const hostMismatch = expectedHost !== actualHost &&
    !actualHost.endsWith(`.${expectedHost}`) && // Allow subdomains
    !expectedHost.endsWith(`.${actualHost}`);   // Allow parent domains

  if (hostMismatch) {
    // Page context is desynced - return error with details
    const screenshot = await this.screenshot();
    if (this.config.verbose) {
      console.error(`⚠️ Page context desync detected: expected ${expectedHost}, got ${actualHost}`);
    }
    const logged = loggedHere();
    return {
      url: actualUrl,
      title: actualTitle,
      screenshot,
      errors: [...logged.errors, `Page context desync: navigated to ${url} but landed on ${actualUrl}`],
      warnings: [...logged.warnings, ...warnings, `Expected domain: ${expectedHost}, Actual domain: ${actualHost}`],
      loadTime,
      success: false,
      desyncDetected: true,
      expectedUrl: url,
    } as NavigationResult;
  }

  const screenshot = await this.screenshot();
  const logged = loggedHere();

  return {
    url: actualUrl,
    title: actualTitle,
    screenshot,
    errors: logged.errors,
    warnings: [...logged.warnings, ...warnings],
    loadTime,
    success: true,
    ...(waitSelectorTimedOut ? { waitSelectorTimedOut: true } : {}),
  };
}

export async function waitForStability(this: CBrowser, page: Page, maxWaitMs: number = 2000): Promise<void> {
  const checkInterval = 200;
  const minStableChecks = 2; // Require 2 consecutive stable checks
  let stableChecks = 0;
  let elapsed = 0;

  while (elapsed < maxWaitMs && stableChecks < minStableChecks) {
    const mutationCount = await page.evaluate(() => {
      return new Promise<number>((resolve) => {
        let mutations = 0;
        const observer = new MutationObserver((records) => {
          mutations += records.length;
        });
        observer.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
        });
        setTimeout(() => {
          observer.disconnect();
          resolve(mutations);
        }, 150);
      });
    });

    if (mutationCount < 3) {
      stableChecks++;
    } else {
      stableChecks = 0;
    }

    await page.waitForTimeout(checkInterval);
    elapsed += checkInterval + 150;
  }
}

export async function detectCloudflareChallenge(this: CBrowser): Promise<{
  detected: boolean;
  type: "turnstile" | "managed" | "interstitial" | "js-challenge" | null;
  evidence: string[];
}> {
  const page = await this.getPage();
  const evidence: string[] = [];
  let type: "turnstile" | "managed" | "interstitial" | "js-challenge" | null = null;

  try {
    const content = await page.content();
    const pageUrl = page.url();

    // Cloudflare Turnstile (CAPTCHA alternative)
    if (content.includes("challenges.cloudflare.com") || content.includes("turnstile")) {
      evidence.push("Cloudflare Turnstile widget detected");
      type = "turnstile";
    }

    // Cloudflare Managed Challenge (browser verification)
    if (content.includes("cf-browser-verification") || content.includes("cf_chl_opt")) {
      evidence.push("Cloudflare browser verification page");
      type = "managed";
    }

    // Cloudflare Interstitial (5-second wait)
    if (content.includes("Just a moment") && content.includes("cf-spinner")) {
      evidence.push("Cloudflare interstitial page");
      type = "interstitial";
    }

    // Cloudflare JS Challenge
    if (content.includes("jschl-answer") || content.includes("cf_chl_jschl")) {
      evidence.push("Cloudflare JavaScript challenge");
      type = "js-challenge";
    }

    // Check for Cloudflare ray ID in headers/page
    if (content.includes("cf-ray") || content.includes("__cf_bm")) {
      evidence.push("Cloudflare Ray ID or bot management cookie present");
    }

    // Check URL for challenge path
    if (pageUrl.includes("/cdn-cgi/challenge-platform/")) {
      evidence.push("URL contains Cloudflare challenge platform path");
      if (!type) type = "managed";
    }

  } catch (e) {
    evidence.push(`Detection error: ${(e as Error).message}`);
  }

  return {
    detected: type !== null,
    type,
    evidence,
  };
}

export async function waitForCloudflareResolution(this: CBrowser, timeout: number = 30000, checkInterval: number = 1000): Promise<{
  resolved: boolean;
  originalUrl: string;
  finalUrl: string;
  waitTime: number;
  message: string;
}> {
  const page = await this.getPage();
  const startTime = Date.now();
  const originalUrl = page.url();
  let elapsed = 0;

  // First, confirm we're on a Cloudflare challenge
  const initialCheck = await this.detectCloudflareChallenge();
  if (!initialCheck.detected) {
    return {
      resolved: true,
      originalUrl,
      finalUrl: originalUrl,
      waitTime: 0,
      message: "No Cloudflare challenge detected",
    };
  }

  if (this.config.verbose) {
    console.error(`⏳ Cloudflare ${initialCheck.type} challenge detected, waiting for resolution...`);
  }

  // Wait for the challenge to resolve (URL changes or content changes)
  while (elapsed < timeout) {
    await page.waitForTimeout(checkInterval);
    elapsed = Date.now() - startTime;

    const currentCheck = await this.detectCloudflareChallenge();
    const currentUrl = page.url();

    // Challenge resolved if:
    // 1. No longer on a challenge page
    // 2. URL has changed (redirected to actual content)
    if (!currentCheck.detected || currentUrl !== originalUrl) {
      // Wait a bit more for page to stabilize
      await this.waitForStability(page, 2000);

      const finalUrl = page.url();
      const waitTime = Date.now() - startTime;

      if (this.config.verbose) {
        console.error(`✅ Cloudflare challenge resolved in ${waitTime}ms`);
      }

      return {
        resolved: true,
        originalUrl,
        finalUrl,
        waitTime,
        message: `Cloudflare challenge resolved after ${waitTime}ms`,
      };
    }

    if (this.config.verbose && elapsed % 5000 === 0) {
      console.error(`⏳ Still waiting for Cloudflare... (${Math.round(elapsed / 1000)}s)`);
    }
  }

  // Timeout
  return {
    resolved: false,
    originalUrl,
    finalUrl: page.url(),
    waitTime: elapsed,
    message: `Timeout waiting for Cloudflare challenge (${timeout}ms)`,
  };
}
