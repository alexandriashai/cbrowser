/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Smart retry and the self-healing selector cache
 *
 * smartClick, alternative selectors, and the selector cache's domain.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import type { ClickResult, SmartRetryResult, RetryAttempt } from "../types.js";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Tier 5: Smart Retry (v5.0.0)
// =========================================================================

export async function smartClick(
  this: CBrowser,
  selector: string,
  options: { force?: boolean; maxRetries?: number; retryDelay?: number; dismissOverlays?: boolean; minConfidence?: number } = {}
): Promise<SmartRetryResult> {
  const maxRetries = options.maxRetries ?? 3;
  const retryDelay = options.retryDelay ?? 1000;
  const minConfidence = options.minConfidence ?? 0.8; // v11.11.0: Raised from 0.6 to 0.8 (stress test fix)
  const attempts: RetryAttempt[] = [];

  // Dismiss overlays first if requested
  if (options.dismissOverlays) {
    await this.dismissOverlay({ type: "auto", timeout: 3000 });
  }

  // First attempt with original selector
  let result = await this.click(selector, { force: options.force });
  attempts.push({
    attempt: 1,
    selector,
    success: result.success,
    error: result.success ? undefined : result.message,
    screenshot: result.screenshot,
  });

  if (result.success) {
    return {
      success: true,
      attempts,
      finalSelector: selector,
      message: result.message,
      screenshot: result.screenshot,
    };
  }

  // A red-zone refusal is a request for --force, not a selector that needs healing. Retrying
  // with a shorter alternative ("Delete" for "Delete account") used to route around the gate.
  const refusedRed = (r: ClickResult) => !r.success && r.zone === "red" && !options.force;
  if (refusedRed(result)) {
    return { success: false, attempts, message: result.message, screenshot: result.screenshot, zone: "red" };
  }

  // Try to find alternative selectors
  const alternatives = await this.findAlternativeSelectors(selector);

  for (let i = 0; i < Math.min(maxRetries - 1, alternatives.length); i++) {
    await new Promise(resolve => setTimeout(resolve, retryDelay));

    const alt = alternatives[i];
    result = await this.click(alt.selector, { force: options.force });

    attempts.push({
      attempt: i + 2,
      selector: alt.selector,
      success: result.success,
      error: result.success ? undefined : result.message,
      alternativeUsed: alt.reason,
      screenshot: result.screenshot,
    });

    if (refusedRed(result)) {
      return { success: false, attempts, message: result.message, screenshot: result.screenshot, zone: "red" };
    }

    if (result.success) {
      // v11.8.0: Gate success on confidence threshold
      const meetsConfidence = alt.confidence >= minConfidence;

      if (meetsConfidence) {
        // Cache the working alternative for future use
        this.cacheAlternativeSelector(selector, alt.selector);
      }

      return {
        success: meetsConfidence, // v11.8.0: Only success if confidence meets threshold
        attempts,
        finalSelector: alt.selector,
        message: meetsConfidence
          ? `Clicked using alternative: ${alt.reason}`
          : `Clicked element with low confidence (${(alt.confidence * 100).toFixed(0)}%) - may not be the intended target`,
        screenshot: result.screenshot,
        confidence: alt.confidence,
        healed: true,
        healReason: alt.reason,
      };
    }
  }

  // All attempts failed - provide AI suggestion
  const failure = await this.analyzeFailure(selector, attempts);

  return {
    success: false,
    attempts,
    message: `Failed after ${attempts.length} attempts`,
    screenshot: result.screenshot,
    aiSuggestion: failure.suggestion,
    availableElements: failure.available,
  };
}

// =========================================================================
// Tier 5: Self-Healing Selector Cache (v5.0.0)
// =========================================================================

export function getCurrentDomain(this: CBrowser): string {
  try {
    if (this.page) {
      const url = this.page.url();
      return new URL(url).hostname;
    }
  } catch {
    // Ignore
  }
  return "unknown";
}
