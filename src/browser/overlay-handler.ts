/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */


/**
 * Overlay Handler - Detects and dismisses overlays (cookie consent, age verification, newsletters)
 *
 * Extracted from CBrowser class for better modularity.
 */

import type { Page } from "playwright";
import type {
  OverlayType,
  OverlayPattern,
  DismissOverlayOptions,
  DetectedOverlay,
  DismissOverlayResult,
} from "../types.js";

export interface OverlayHandlerConfig {
  verbose?: boolean;
}

/** Common overlay patterns for detection */
export const OVERLAY_PATTERNS: OverlayPattern[] = [
  {
    type: "cookie",
    selectors: [
      '[class*="cookie"]', '[id*="cookie"]', '[class*="consent"]', '[id*="consent"]',
      '[class*="gdpr"]', '[id*="gdpr"]', '[class*="cc-"]', '[id*="cc-"]',
      '[class*="CookieBanner"]', '[class*="cookie-banner"]', '[class*="cookie_banner"]',
      '[aria-label*="cookie" i]', '[aria-label*="consent" i]',
    ],
    closeButtons: [
      'button:has-text("Accept")', 'button:has-text("Accept All")', 'button:has-text("Accept all")',
      'button:has-text("I agree")', 'button:has-text("Agree")', 'button:has-text("Got it")',
      'button:has-text("OK")', 'button:has-text("Allow")', 'button:has-text("Allow All")',
      'button:has-text("Close")', '[class*="accept"]', '[class*="agree"]',
      '[id*="accept"]', '[data-action="accept"]',
    ],
  },
  {
    type: "age-verify",
    selectors: [
      '[class*="age-verif"]', '[id*="age-verif"]', '[class*="age_verif"]',
      '[class*="age-gate"]', '[id*="age-gate"]', '[class*="agegate"]',
      '[class*="age-check"]', '[id*="age-check"]',
      '[role="dialog"]', '[aria-modal="true"]',
    ],
    closeButtons: [
      'button:has-text("I am 18")', 'button:has-text("I am 21")',
      'button:has-text("I\'m 18")', 'button:has-text("I\'m 21")',
      'button:has-text("I am over")', 'button:has-text("I\'m over")',
      'button:has-text("Yes")', 'button:has-text("Enter")',
      'button:has-text("Confirm")', 'button:has-text("Verify")',
      'button:has-text("Enter Site")', 'button:has-text("Continue")',
    ],
  },
  {
    type: "newsletter",
    selectors: [
      '[class*="newsletter"]', '[id*="newsletter"]',
      '[class*="popup"]', '[id*="popup"]',
      '[class*="subscribe"]', '[id*="subscribe"]',
      '[class*="signup-modal"]', '[class*="email-capture"]',
    ],
    closeButtons: [
      'button:has-text("Close")', 'button:has-text("No thanks")',
      'button:has-text("Not now")', 'button:has-text("Maybe later")',
      '[class*="close"]', '[aria-label="Close"]', '[aria-label="close"]',
      'button[class*="dismiss"]',
    ],
  },
];

/** Text content keywords for overlay type classification */
const OVERLAY_TEXT_PATTERNS: Record<string, string[]> = {
  "age-verify": ["age verif", "18+", "21+", "over 18", "over 21", "years or older", "age gate", "age check", "must be 18", "must be 21", "legal age", "adult content"],
  "cookie": ["cookie", "consent", "gdpr", "privacy policy", "we use cookies", "this site uses cookies", "accept cookies"],
  "newsletter": ["newsletter", "subscribe", "sign up for", "email updates", "stay updated", "join our mailing"],
};

/**
 * Manages overlay detection and dismissal.
 */
export class OverlayHandler {
  private config: OverlayHandlerConfig;

  constructor(config: OverlayHandlerConfig = {}) {
    this.config = config;
  }

  /**
   * Classify an overlay by its text content.
   */
  classifyOverlayType(text: string): OverlayType {
    const lowerText = text.toLowerCase();
    for (const [type, keywords] of Object.entries(OVERLAY_TEXT_PATTERNS)) {
      if (keywords.some(kw => lowerText.includes(kw))) {
        return type as OverlayType;
      }
    }
    return "unknown";
  }

  /**
   * Detect overlays on the page by analyzing position, z-index, pattern matching, and text content.
   * Returns overlays sorted by z-index (highest first) so the topmost blocking overlay is dismissed first.
   */
  async detectOverlays(page: Page, options: DismissOverlayOptions): Promise<DetectedOverlay[]> {
    const detected: DetectedOverlay[] = [];

    try {
      // Unified detection: find all high-z-index fixed/absolute elements AND known pattern selectors
      const rawOverlays = await page.evaluate(() => {
        const results: Array<{
          selector: string;
          text: string;
          zIndex: number;
          position: string;
          role: string | null;
          ariaModal: string | null;
          width: number;
          height: number;
        }> = [];
        const seen = new Set<Element>();
        const allElements = Array.from(document.querySelectorAll("*"));

        for (let i = 0; i < allElements.length; i++) {
          const el = allElements[i] as HTMLElement;
          if (seen.has(el)) continue;

          const cs = window.getComputedStyle(el);
          const pos = cs.position;
          const zIndex = parseInt(cs.zIndex) || 0;
          const rect = el.getBoundingClientRect();
          const isDialog = el.getAttribute("role") === "dialog" || el.getAttribute("aria-modal") === "true";

          // Match: high z-index overlay OR dialog role
          if (((pos === "fixed" || pos === "absolute") && zIndex > 100 && rect.width > 200 && rect.height > 80) || isDialog) {
            if (rect.width < 50 || rect.height < 30) continue;
            if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;

            const text = (el.textContent || "").substring(0, 300).trim();
            let selector = el.tagName.toLowerCase();
            if (el.id) selector = `#${el.id}`;
            else if (el.className && typeof el.className === "string") {
              const cls = el.className.split(/\s+/).filter((c: string) => c.length > 0 && c.length < 40)[0];
              if (cls) selector = `.${cls}`;
            }

            seen.add(el);
            results.push({
              selector,
              text,
              zIndex: zIndex || (isDialog ? 99999 : 0),
              position: pos,
              role: el.getAttribute("role"),
              ariaModal: el.getAttribute("aria-modal"),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            });
          }
        }

        return results;
      });

      // Classify and filter overlays
      for (const raw of rawOverlays) {
        const type = this.classifyOverlayType(raw.text);

        // Filter by requested type
        if (options.type && options.type !== "auto" && type !== options.type && type !== "unknown") continue;

        detected.push({
          type,
          selector: raw.selector,
          text: raw.text.substring(0, 200),
          zIndex: raw.zIndex,
          position: raw.position,
        });
      }
    } catch {
      // Ignore detection errors
    }

    // Sort by z-index descending — dismiss topmost overlay first
    detected.sort((a, b) => b.zIndex - a.zIndex);

    // Deduplicate: keep only one per type (highest z-index)
    const seen = new Set<string>();
    const deduped: DetectedOverlay[] = [];
    for (const d of detected) {
      if (d.type !== "unknown" && seen.has(d.type)) continue;
      seen.add(d.type);
      deduped.push(d);
    }

    return deduped;
  }

  /**
   * Try clicking a button, with force fallback if another element intercepts.
   */
  private async tryClickOverlayButton(btn: ReturnType<Page["locator"]>, timeout: number): Promise<boolean> {
    try {
      await btn.click({ timeout: Math.min(timeout, 3000) });
      return true;
    } catch {
      // If normal click fails (e.g., another overlay intercepts), try force click
      try {
        await btn.click({ force: true, timeout: Math.min(timeout, 2000) });
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Attempt to dismiss a single detected overlay.
   */
  async tryDismissOverlay(
    page: Page,
    overlay: DetectedOverlay,
    timeout: number
  ): Promise<DismissOverlayResult["details"][0]> {
    // Collect all close button selectors to try: matched pattern first, then all patterns, then generic
    const closeButtonSets: Array<{ source: string; selectors: string[] }> = [];

    // First: close buttons from the matched overlay type pattern
    const matchedPattern = OVERLAY_PATTERNS.find(p => p.type === overlay.type);
    if (matchedPattern) {
      closeButtonSets.push({ source: "matched-pattern", selectors: matchedPattern.closeButtons });
    }

    // Second: close buttons from all other patterns (in case classification was imperfect)
    for (const pattern of OVERLAY_PATTERNS) {
      if (pattern.type !== overlay.type) {
        closeButtonSets.push({ source: `${pattern.type}-pattern`, selectors: pattern.closeButtons });
      }
    }

    // Third: generic close buttons
    closeButtonSets.push({
      source: "generic",
      selectors: [
        'button[aria-label="Close"]', 'button[aria-label="close"]',
        'button[aria-label="Dismiss"]', '[role="button"][aria-label="Close"]',
        'button[class*="close"]', '[class*="close-btn"]', '[class*="closeBtn"]',
        'button:has-text("×")', 'button:has-text("✕")', 'button:has-text("X")',
        'button:has-text("Close")', 'button:has-text("Dismiss")',
        'button:has-text("No thanks")', 'button:has-text("Not now")',
      ],
    });

    // Try all close button sets
    for (const set of closeButtonSets) {
      for (const btnSelector of set.selectors) {
        try {
          const btn = page.locator(btnSelector).first();
          if (await btn.isVisible({ timeout: 800 })) {
            const clicked = await this.tryClickOverlayButton(btn, timeout);
            if (clicked) {
              await page.waitForTimeout(500);
              return {
                type: overlay.type,
                selector: overlay.selector,
                dismissed: true,
                closeMethod: `${set.source}: ${btnSelector}`,
              };
            }
          }
        } catch {
          // Continue trying other selectors
        }
      }
    }

    // Last resort: Try pressing Escape
    try {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);

      // Check if overlay is still visible
      const stillVisible = await page.$(overlay.selector);
      if (!stillVisible || !(await stillVisible.isVisible())) {
        return {
          type: overlay.type,
          selector: overlay.selector,
          dismissed: true,
          closeMethod: "escape-key",
        };
      }
    } catch {
      // Ignore escape key errors
    }

    return {
      type: overlay.type,
      selector: overlay.selector,
      dismissed: false,
      error: "Could not find a way to dismiss this overlay",
    };
  }

  /**
   * Detect and dismiss overlays (cookie consent, age verification, newsletter popups).
   * Returns result with details about what was found and dismissed.
   */
  async dismissOverlays(
    page: Page,
    options: DismissOverlayOptions = { type: "auto" },
    screenshotFn?: () => Promise<string>
  ): Promise<DismissOverlayResult> {
    const timeout = options.timeout ?? 5000;
    const details: DismissOverlayResult["details"] = [];
    const maxPasses = 5; // Prevent infinite loops
    // v16.7.2: Track selectors we've already attempted to prevent duplicate attempts
    const attemptedSelectors = new Set<string>();

    try {
      // Multi-pass dismissal: some sites reveal new overlays after dismissing the first
      for (let pass = 0; pass < maxPasses; pass++) {
        const detected = await this.detectOverlays(page, options);

        // Custom selector fallback on first pass if nothing detected
        if (pass === 0 && detected.length === 0 && options.customSelector) {
          try {
            const customEl = page.locator(options.customSelector).first();
            if (await customEl.isVisible({ timeout: 2000 })) {
              await customEl.click();
              await page.waitForTimeout(500);
              attemptedSelectors.add(options.customSelector);
              details.push({
                type: "custom",
                selector: options.customSelector,
                dismissed: true,
                closeMethod: "custom-selector-click",
              });
              continue; // Re-detect after custom dismiss
            }
          } catch {
            // Continue with normal detection
          }
        }

        if (detected.length === 0) break; // No more overlays

        // v16.7.2: Filter out already-attempted overlays to prevent duplicate attempts
        const newOverlays = detected.filter(o => !attemptedSelectors.has(o.selector));
        if (newOverlays.length === 0) break; // All remaining overlays already attempted

        // Attempt to dismiss each newly detected overlay
        let dismissedThisPass = false;
        for (const overlay of newOverlays) {
          attemptedSelectors.add(overlay.selector);
          const result = await this.tryDismissOverlay(page, overlay, timeout);
          details.push(result);
          if (result.dismissed) {
            dismissedThisPass = true;
          }
        }

        if (!dismissedThisPass) break; // Can't dismiss anything, stop

        // Wait for any new overlays to appear
        await page.waitForTimeout(800);
      }

      const overlaysDismissed = details.filter(d => d.dismissed).length;
      const overlaysFound = details.length;

      return {
        dismissed: overlaysDismissed > 0,
        overlaysFound,
        overlaysDismissed,
        details,
        screenshot: screenshotFn ? await screenshotFn() : "",
        suggestion: overlaysDismissed === 0 && overlaysFound > 0
          ? "Overlays detected but could not be dismissed automatically. Try providing a custom selector."
          : undefined,
      };
    } catch (error) {
      return {
        dismissed: false,
        overlaysFound: 0,
        overlaysDismissed: 0,
        details,
        screenshot: screenshotFn ? await screenshotFn() : "",
        suggestion: `Error during overlay detection: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
