/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Overlays and click interception
 *
 * Elements that intercept a click (sticky headers, overlays) and dismissing overlays.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import type { Locator } from "playwright";
import type { SelectorAlternative, DismissOverlayOptions, DismissOverlayResult } from "../types.js";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Interaction
// =========================================================================

export async function checkForInterception(this: CBrowser, element: Locator): Promise<{ intercepted: boolean; interceptorSelector: string | null; interceptorInfo?: string }> {
  const page = await this.getPage();

  try {
    const box = await element.boundingBox();
    if (!box) {
      return { intercepted: false, interceptorSelector: null };
    }

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    // Get info about element at the click point using coordinates only
    const result = await page.evaluate(([x, y]) => {
      const topElement = document.elementFromPoint(x, y);
      if (!topElement) return { intercepted: false, interceptorInfo: null, interceptorSelector: null };

      // Build a selector for the top element
      let selector = topElement.tagName.toLowerCase();
      if (topElement.id) {
        selector = `#${topElement.id}`;
      } else if (topElement.className && typeof topElement.className === 'string') {
        selector += `.${String((topElement.className as unknown as { baseVal?: string })?.baseVal ?? topElement.className ?? "").split(' ')[0]}`;
      }

      // Check if it's a sticky/fixed element (those are the problematic ones)
      const style = getComputedStyle(topElement);
      const isSticky = style.position === 'fixed' || style.position === 'sticky';

      if (!isSticky) {
        // Not a sticky element, let normal click handle it
        return { intercepted: false, interceptorInfo: null, interceptorSelector: null };
      }

      // It's a sticky element - gather info
      const info = {
        tag: topElement.tagName.toLowerCase(),
        id: topElement.id,
        classes: topElement.className,
        position: style.position,
        zIndex: style.zIndex,
        text: topElement.textContent?.slice(0, 50) || '',
      };

      return {
        intercepted: true,
        interceptorSelector: selector,
        interceptorInfo: `${info.tag}${info.id ? '#' + info.id : ''}${info.classes && typeof info.classes === 'string' ? '.' + info.classes.split(' ')[0] : ''} (position: ${info.position}, z-index: ${info.zIndex})`
      };
    }, [centerX, centerY]);

    return {
      intercepted: result.intercepted,
      interceptorSelector: result.interceptorSelector,
      interceptorInfo: result.interceptorInfo || undefined
    };
  } catch {
    // If check fails, assume not intercepted and let normal click try
    return { intercepted: false, interceptorSelector: null };
  }
}

export async function findStickyElements(this: CBrowser): Promise<Array<{ selector: string; position: string; rect: DOMRect }>> {
  const page = await this.getPage();

  return page.evaluate(() => {
    const results: Array<{ selector: string; position: string; rect: DOMRect }> = [];
    const allElements = Array.from(document.querySelectorAll('*'));

    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      const style = getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'sticky') {
        const rect = el.getBoundingClientRect();
        // Only include elements that are visible and have size
        if (rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none') {
          let selector = el.tagName.toLowerCase();
          if (el.id) selector += `#${el.id}`;
          else if (el.className && typeof el.className === 'string') selector += `.${String((el.className as unknown as { baseVal?: string })?.baseVal ?? el.className ?? "").split(' ')[0]}`;

          results.push({
            selector,
            position: style.position,
            rect: rect.toJSON() as DOMRect,
          });
        }
      }
    }

    return results;
  });
}

export async function handleStickyInterception(
  this: CBrowser,
  element: Locator,
  interceptorSelector: string,
  options: { verbose?: boolean; position?: { x: number; y: number } } = {}
): Promise<{ success: boolean; strategy?: string; error?: string }> {
  // A container's click goes to the point the red-zone gate judged, whichever strategy clicks it.
  const at = options.position ? { position: options.position } : undefined;
  const page = await this.getPage();

  // Strategy 1: Scroll element to viewport center (away from sticky headers/footers)
  try {
    if (options.verbose) console.log('  Trying strategy: scroll to safe zone');

    await element.evaluate((el: Element) => {
      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const targetY = rect.top + window.scrollY - (viewportHeight / 2) + (rect.height / 2);
      window.scrollTo({ top: targetY, behavior: 'instant' });
    });

    await page.waitForTimeout(100);

    // Check if still intercepted
    const recheck = await this.checkForInterception(element);
    if (!recheck.intercepted) {
      await element.click(at);
      return { success: true, strategy: 'scroll-to-safe-zone' };
    }
  } catch {
    // Continue to next strategy
  }

  // Strategy 2: Temporarily hide the interceptor
  try {
    if (options.verbose) console.log('  Trying strategy: hide interceptor');

    const interceptor = page.locator(interceptorSelector).first();

    // Store original display value and hide
    const originalDisplay = await interceptor.evaluate((el: Element) => {
      const style = (el as HTMLElement).style;
      const original = style.display;
      style.setProperty('display', 'none', 'important');
      return original;
    });

    await page.waitForTimeout(50);

    // Click the element
    await element.click(at);

    // Restore the interceptor
    await interceptor.evaluate((el: Element, original: string) => {
      (el as HTMLElement).style.display = original;
    }, originalDisplay);

    return { success: true, strategy: 'hide-interceptor' };
  } catch (e) {
    // Try to restore even on failure
    const interceptor = page.locator(interceptorSelector).first();
    await interceptor.evaluate((el: Element) => {
      (el as HTMLElement).style.removeProperty('display');
    }).catch(() => {});
  }

  // Strategy 3: Force JavaScript click (bypasses coordinate-based clicking)
  try {
    if (options.verbose) console.log('  Trying strategy: force JS click');

    await element.evaluate((el: Element) => {
      (el as HTMLElement).click();
    });

    return { success: true, strategy: 'force-js-click' };
  } catch (e) {
    return {
      success: false,
      error: `All strategies failed: ${e instanceof Error ? e.message : String(e)}`
    };
  }
}

// =========================================================================
// Overlay Detection & Dismissal (v7.4.14)
// =========================================================================

export async function dismissOverlay(this: CBrowser, options: DismissOverlayOptions = { type: "auto" }): Promise<DismissOverlayResult> {
  const page = await this.getPage();
  const result = await this.overlayHandler.dismissOverlays(
    page,
    options,
    () => this.screenshot()
  );

  // Log dismissed overlays to audit trail
  for (const detail of result.details) {
    if (detail.dismissed) {
      this.audit("dismiss-overlay", detail.selector, "yellow", "success");
    }
  }

  return result;
}

export async function findAlternativeSelectors(this: CBrowser, originalSelector: string): Promise<SelectorAlternative[]> {
  const page = await this.getPage();
  const alternatives: SelectorAlternative[] = [];

  // v10.10.0: Tokenize selector for better word-level matching
  const selectorLower = originalSelector.toLowerCase();
  const selectorWords = selectorLower
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !["the", "a", "an", "to", "for", "of", "in", "on"].includes(w));

  try {
    // Try to find elements with similar text
    const elements = await page.$$('button, a, [role="button"], input[type="submit"]');

    for (const el of elements.slice(0, 20)) {
      const text = await el.textContent().catch(() => "");
      const ariaLabel = await el.getAttribute("aria-label").catch(() => "");
      const title = await el.getAttribute("title").catch(() => "");
      const id = await el.getAttribute("id").catch(() => "");
      const href = await el.getAttribute("href").catch(() => "");

      const textLower = (text || "").toLowerCase().trim();
      const ariaLower = (ariaLabel || "").toLowerCase();

      // v10.10.0: Bidirectional word-level matching for text
      if (textLower) {
        const textWords = textLower.replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
        const matchingWords = selectorWords.filter(sw => textWords.some(tw => tw.includes(sw) || sw.includes(tw)));
        const matchRatio = selectorWords.length > 0 ? matchingWords.length / selectorWords.length : 0;

        // Also check if text IS a word in the selector (e.g., "submit" in "submit a story")
        const exactWordMatch = selectorWords.includes(textLower);

        if (matchRatio >= 0.5 || exactWordMatch || selectorLower.includes(textLower)) {
          // v10.10.0: Use plain text (not text="...") since findElement uses getByText
          const textTrimmed = text?.trim() || "";
          alternatives.push({
            selector: textTrimmed,
            confidence: exactWordMatch ? 0.9 : matchRatio >= 0.7 ? 0.85 : 0.75,
            reason: `Text match: "${textTrimmed}"`,
          });
        }
      }

      // Check aria-label with word matching
      if (ariaLower) {
        const ariaWords = ariaLower.replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
        const matchingWords = selectorWords.filter(sw => ariaWords.some(aw => aw.includes(sw) || sw.includes(aw)));
        const matchRatio = selectorWords.length > 0 ? matchingWords.length / selectorWords.length : 0;

        if (matchRatio >= 0.5 || selectorLower.includes(ariaLower)) {
          // CSS selector works with findElement's Strategy 7
          alternatives.push({
            selector: `css:[aria-label="${ariaLabel}"]`,
            confidence: 0.9,
            reason: `Aria-label: "${ariaLabel}"`,
          });
        }
      }

      // Check title attribute
      if (title && selectorLower.includes(title.toLowerCase())) {
        alternatives.push({
          selector: `css:[title="${title}"]`,
          confidence: 0.85,
          reason: `Title: "${title}"`,
        });
      }

      // Check id
      if (id && selectorLower.includes(id.toLowerCase())) {
        alternatives.push({
          selector: `css:#${id}`,
          confidence: 0.95,
          reason: `ID match: #${id}`,
        });
      }

      // v10.10.0: Check href for link selectors
      // v11.11.0: Require at least 2 matching words to avoid false positives (stress test fix)
      if (href && selectorWords.length >= 2) {
        const hrefLower = href.toLowerCase();
        const matchingHrefWords = selectorWords.filter(w => hrefLower.includes(w));
        // Only match if at least 50% of selector words are in href
        if (matchingHrefWords.length >= Math.max(2, selectorWords.length * 0.5)) {
          alternatives.push({
            selector: `css:a[href*="${href.slice(0, 50)}"]`,
            confidence: 0.7,
            reason: `Href match: ${href.slice(0, 30)}...`,
          });
        }
      }
    }

    // Sort by confidence
    alternatives.sort((a, b) => b.confidence - a.confidence);

  } catch {
    // Ignore errors in alternative finding
  }

  return alternatives.slice(0, 5);
}
