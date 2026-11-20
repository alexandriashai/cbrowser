/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Interaction
 *
 * click, hover, hoverClick and fill.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import type { Locator } from "playwright";
import type { ClickResult } from "../types.js";
import { namedClickables, summarizePlaywrightError } from "./helpers.js";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Interaction
// =========================================================================

export async function click(this: CBrowser, selector: string, options: { force?: boolean; verbose?: boolean; debugDir?: string } = {}): Promise<ClickResult> {
  const page = await this.getPage();

  // Classify action zone from the selector string (unchanged: a string that names a dangerous action
  // is refused before anything is resolved, exactly as before).
  let zone = this.classifyAction("click", selector);
  if (zone === "red" && !options.force) {
    return {
      success: false,
      screenshot: await this.screenshot(),
      message: `Red zone action requires --force: click "${selector}"`,
      zone,
    };
  }

  try {
    // Try multiple selector strategies
    const element = await this.findElement(selector);

    // Classify the ELEMENT, not only the string. A selector says how an element is addressed
    // (#delete-account, [data-testid=...], button:nth-of-type(3)); the element says what it is
    // ("Delete account"). The zone must be the same whichever way the element is addressed.
    let target: ClickResult["target"];
    if (element) {
      const gate = await this.gateElement("click", selector, element, zone, options.force);
      if (gate.refusal) return gate.refusal;
      zone = gate.zone;
      target = gate.target;
    }

    if (!element) {
      const result: ClickResult = {
        success: false,
        screenshot: await this.screenshot(),
        message: `Element not found: ${selector}`,
      };

      if (options.verbose) {
        const available = namedClickables(await this.getAvailableClickables(page)); // same named list for the suggestion and availableElements (v5 B25)
        result.availableElements = available;
        result.aiSuggestion = this.generateClickSuggestion(selector, available);
        result.debugScreenshot = await this.captureDebugScreenshot(page, {
          availableSelectors: available.map(e => e.selector),
          attemptedSelector: selector,
          debugDir: options.debugDir,
        });
      }

      return result;
    }

    // v17.5.0: When clicking URL-text links, ensure we click the anchor, not inner text
    // Sites often render link URLs as visible text inside <a> tags. When findElement matches
    // that URL text, it may return an inner element (span, text node) rather than the anchor.
    // Clicking the inner element doesn't always trigger navigation. Fix: find and click the anchor.
    let clickTarget = element;
    const looksLikeUrl = selector.startsWith('http://') || selector.startsWith('https://') || selector.includes('://');

    if (looksLikeUrl) {
      const ancestorAnchorInfo = await element.evaluate((el: Element) => {
        // If we're already an anchor, no change needed
        if (el.tagName === 'A') {
          return { isAnchor: true, href: (el as HTMLAnchorElement).href };
        }

        // Walk up to find parent anchor
        let current = el.parentElement;
        while (current) {
          if (current.tagName === 'A') {
            // Generate a selector for this anchor
            const anchor = current as HTMLAnchorElement;
            let anchorSelector = '';

            if (anchor.id) {
              anchorSelector = `#${anchor.id}`;
            } else if (anchor.href) {
              // Use href attribute selector - escape special chars
              const escapedHref = anchor.href.replace(/"/g, '\\"');
              anchorSelector = `a[href="${escapedHref}"]`;
            }

            return {
              isAnchor: false,
              hasAncestorAnchor: true,
              ancestorSelector: anchorSelector,
              href: anchor.href
            };
          }
          current = current.parentElement;
        }

        return { isAnchor: false, hasAncestorAnchor: false };
      });

      if (ancestorAnchorInfo.hasAncestorAnchor && ancestorAnchorInfo.ancestorSelector) {
        // Found a parent anchor - click that instead
        const ancestorAnchor = page.locator(ancestorAnchorInfo.ancestorSelector).first();
        if (await ancestorAnchor.count() > 0) {
          clickTarget = ancestorAnchor;
          if (options.verbose) {
            console.log(`URL-text click: found parent anchor, clicking ${ancestorAnchorInfo.ancestorSelector}`);
          }
        }
      }
    }

    // v17.4.2: Handle target="_blank" links - navigate in same tab instead of opening new tab
    // This matches user intent: "click this link" means "go there", not "open new tab"
    const targetBlankRemoved = await clickTarget.evaluate((el: Element) => {
      if (el.tagName === 'A' && (el as HTMLAnchorElement).target === '_blank') {
        (el as HTMLAnchorElement).removeAttribute('target');
        return true;
      }
      return false;
    });

    if (targetBlankRemoved && options.verbose) {
      console.log('Removed target="_blank" to navigate in same tab');
    }

    // Re-judge what is about to be clicked, immediately before dispatch. The first gate ran when the
    // selector resolved; since then clickTarget may have moved to an ancestor anchor and a re-rendering
    // page may have swapped the node a locator resolves to. One round trip remains between this check
    // and Playwright's own resolution at click time.
    // For a container the judged point is pinned: the click goes exactly where the gate looked.
    let clickPosition: { x: number; y: number } | undefined;
    {
      const gate = await this.gateElement("click", selector, clickTarget, zone, options.force);
      if (gate.refusal) return gate.refusal;
      zone = gate.zone;
      target = gate.target ?? target;
      clickPosition = gate.position;
    }

    // Check for sticky element interception before clicking
    const interception = await this.checkForInterception(clickTarget);

    if (interception.intercepted && interception.interceptorSelector) {
      if (options.verbose) {
        console.log(`Sticky element detected: ${interception.interceptorInfo}`);
      }

      // Try to handle the interception
      const handled = await this.handleStickyInterception(
        clickTarget,
        interception.interceptorSelector,
        { verbose: options.verbose, position: clickPosition }
      );

      if (!handled.success) {
        return {
          success: false,
          screenshot: await this.screenshot(),
          message: `Click intercepted by sticky element (${interception.interceptorInfo}). ${handled.error || 'All mitigation strategies failed.'}`,
        };
      }

      if (options.verbose) {
        console.log(`Successfully clicked using strategy: ${handled.strategy}`);
      }
    } else {
      // No interception, normal click
      await clickTarget.click(clickPosition ? { position: clickPosition } : undefined);
    }

    // Wait for any navigation or network activity
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

    this.audit("click", selector, zone, "success");

    return {
      success: true,
      screenshot: await this.screenshot(),
      message: `Clicked: ${selector}`,
      zone,
      target,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // v17.4.0: Enter key fallback for hidden submit buttons
    // When a submit button is not visible (common in toggle-to-expand UIs),
    // pressing Enter on the last filled input is the universal form submission fallback
    const isVisibilityError = errorMessage.includes('not visible') ||
                              errorMessage.includes('is not visible') ||
                              errorMessage.includes('hidden');
    const isLikelySubmit = selector.toLowerCase().includes('submit') ||
                           selector.toLowerCase().includes('search') ||
                           selector.toLowerCase().includes('go') ||
                           selector.toLowerCase().includes('send');

    if (isVisibilityError && isLikelySubmit && this.lastFilledInputSelector) {
      if (options.verbose) {
        console.log(`Submit button "${selector}" not visible, trying Enter key on last filled input "${this.lastFilledInputSelector}"`);
      }

      try {
        // Find the last filled input and press Enter on it
        const lastInput = await this.findElement(this.lastFilledInputSelector);
        if (lastInput) {
          // Enter submits the input's form: gate on the form's action and default button, so a hidden
          // "Pay now" cannot be reached by pressing Enter in the card-number field.
          const gate = await this.gateElement("click", `${selector} (Enter-fallback)`, lastInput, zone, options.force, { implicitSubmit: true });
          if (gate.refusal) return gate.refusal;
          zone = gate.zone;
          await lastInput.focus();
          await page.keyboard.press('Enter');

          // Wait for navigation or network activity
          await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

          this.audit("click", `${selector} (Enter-fallback)`, zone, "success");

          return {
            success: true,
            screenshot: await this.screenshot(),
            message: `Submitted via Enter key (button "${selector}" was not visible)`,
            zone,
          };
        }
      } catch (enterError) {
        if (options.verbose) {
          console.log(`Enter key fallback failed: ${enterError instanceof Error ? enterError.message : String(enterError)}`);
        }
        // Fall through to normal error handling
      }
    }

    this.audit("click", selector, zone, "failure");

    const result: ClickResult = {
      success: false,
      screenshot: await this.screenshot(),
      // Was the raw Playwright error, whose Call log ran to ~4k tokens of
      // near-identical retry lines and crowded out everything else in the
      // response. verbose still gets the whole thing. (2026-07-29)
      message: `Failed to click: ${options.verbose ? errorMessage : summarizePlaywrightError(errorMessage)}`,
    };

    if (options.verbose) {
      const available = namedClickables(await this.getAvailableClickables(page)); // same named list for the suggestion and availableElements (v5 B25)
      result.availableElements = available;
      result.aiSuggestion = this.generateClickSuggestion(selector, available);
      result.debugScreenshot = await this.captureDebugScreenshot(page, {
        availableSelectors: available.map(e => e.selector),
        attemptedSelector: selector,
        debugDir: options.debugDir,
      });
    }

    return result;
  }
}

export async function hover(this: CBrowser, selector: string): Promise<ClickResult> {
  const page = await this.getPage();

  try {
    const element = await this.findElement(selector);

    if (!element) {
      return {
        success: false,
        screenshot: await this.screenshot(),
        message: `Element not found for hover: ${selector}`,
      };
    }

    await element.hover();
    // Wait a bit for any hover-triggered animations/menus
    await page.waitForTimeout(300);

    this.audit("hover", selector, "green", "success");

    return {
      success: true,
      screenshot: await this.screenshot(),
      message: `Hovered: ${selector}`,
    };
  } catch (error) {
    this.audit("hover", selector, "green", "failure");

    return {
      success: false,
      screenshot: await this.screenshot(),
      message: `Failed to hover: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// =========================================================================
// Custom Dropdown Handling (v8.8.0)
// =========================================================================

export async function findBestClickCandidate(this: CBrowser, locator: Locator, searchText: string): Promise<Locator | null> {
  const count = await locator.count();

  if (count === 0) return null;
  if (count === 1) return locator.first();

  // Score each candidate
  const candidates: Array<{ index: number; score: number }> = [];
  const searchLower = searchText.toLowerCase();

  for (let i = 0; i < count; i++) {
    const el = locator.nth(i);
    let score = 0;

    try {
      const info = await el.evaluate((element: Element, search: string) => {
        const text = element.textContent?.trim() || '';

        // Check if element is in a sticky/fixed container
        let inStickyContainer = false;
        let parent: Element | null = element;
        while (parent) {
          const parentStyle = getComputedStyle(parent);
          if (parentStyle.position === 'fixed' || parentStyle.position === 'sticky') {
            inStickyContainer = true;
            break;
          }
          parent = parent.parentElement;
        }

        // Check for exact text match vs partial
        const textLower = text.toLowerCase();
        const isExactMatch = textLower === search.toLowerCase();
        const isPartialMatch = textLower.includes(search.toLowerCase());

        // Get element role/type info
        const tagName = element.tagName.toLowerCase();
        const role = element.getAttribute('role');
        const isInteractive = ['button', 'a', 'input', 'select'].includes(tagName) ||
                             ['button', 'link', 'option'].includes(role || '');

        return {
          text,
          textLength: text.length,
          inStickyContainer,
          isExactMatch,
          isPartialMatch,
          isInteractive,
        };
      }, searchLower);

      // Scoring:
      // +100: exact text match
      // +50: not in sticky container
      // +20: is interactive element
      // -1 per extra character (prefer shorter matches)

      if (info.isExactMatch) score += 100;
      if (!info.inStickyContainer) score += 50;
      if (info.isInteractive) score += 20;
      score -= Math.abs(info.textLength - searchText.length);

      candidates.push({ index: i, score });
    } catch {
      // If evaluation fails, give low score
      candidates.push({ index: i, score: -1000 });
    }
  }

  // Sort by score descending and return the best match
  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length > 0 && candidates[0].score > -1000) {
    return locator.nth(candidates[0].index);
  }

  return locator.first();
}

export async function hoverClick(
  this: CBrowser,
  selector: string,
  options: { force?: boolean; hoverParent?: string } = {}
): Promise<ClickResult> {
  const page = await this.getPage();

  // Same gate as click(): the string first, then the element it resolves to. hoverClick is also the
  // daemon's click path (daemon.ts), so without this every daemon-mode click skipped the red zone.
  const stringZone = this.classifyAction("click", selector);
  if (stringZone === "red" && !options.force) {
    this.audit("hoverClick", selector, "red", "blocked");
    return {
      success: false,
      screenshot: await this.screenshot(),
      message: `Red zone action requires --force: hoverClick "${selector}"`,
      zone: stringZone,
    };
  }

  try {
    // STEP 1: Detect the likely parent menu from selector text
    // e.g., "International Admissions" → parent is likely "Admissions"
    const selectorWords = selector.split(/\s+/);
    const possibleParents = [
      // Last word is often the parent menu name
      selectorWords[selectorWords.length - 1],
      // Common menu words
      ...selectorWords.filter(w =>
        ['Admissions', 'Academics', 'About', 'Resources', 'Campus', 'Student', 'Apply'].includes(w)
      ),
    ];

    // STEP 2: Find and hover the parent menu trigger
    let parentHovered = false;

    if (options.hoverParent) {
      await this.hover(options.hoverParent);
      await page.waitForTimeout(400);
      parentHovered = true;
    } else {
      for (const parentName of possibleParents) {
        if (!parentName || parentName.length < 3) continue;

        // Find the parent menu trigger
        const parentSelectors = [
          `nav a:text-is("${parentName}")`,
          `header a:text-is("${parentName}")`,
          `[role="menubar"] a:text-is("${parentName}")`,
          `nav button:text-is("${parentName}")`,
          `.nav-link:text-is("${parentName}")`,
        ];

        for (const ps of parentSelectors) {
          try {
            const parentEl = await page.$(ps);
            if (parentEl) {
              await parentEl.hover();
              await page.waitForTimeout(500); // Wait for dropdown animation
              parentHovered = true;
              break;
            }
          } catch {
            // Continue
          }
        }
        if (parentHovered) break;
      }
    }

    // STEP 3: While parent is hovered, find the target element
    const element = await this.findElement(selector);

    if (!element) {
      // If not found, try generic nav hovering
      if (!parentHovered) {
        const navItems = await page.$$('nav > ul > li > a, [role="menubar"] > li > a');
        for (const item of navItems.slice(0, 8)) {
          try {
            await item.hover();
            await page.waitForTimeout(400);
            const found = await this.findElement(selector);
            if (found) {
              const gate = await this.gateElement("hoverClick", selector, found, stringZone, options.force);
              if (gate.refusal) return gate.refusal;
              await found.click(gate.position ? { position: gate.position } : undefined);
              await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
              this.audit("hoverClick", selector, gate.zone, "success");
              return {
                success: true,
                screenshot: await this.screenshot(),
                message: `Hover-clicked (nav scan): ${selector}`,
                zone: gate.zone,
                target: gate.target,
              };
            }
          } catch {
            // Continue
          }
        }
      }

      return {
        success: false,
        screenshot: await this.screenshot(),
        message: `Element not found after hover attempts: ${selector}`,
      };
    }

    // STEP 4: Click the element (parent should still be hovered)
    const gate = await this.gateElement("hoverClick", selector, element, stringZone, options.force);
    if (gate.refusal) return gate.refusal;
    await element.click(gate.position ? { position: gate.position } : undefined);
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

    this.audit("hoverClick", selector, gate.zone, "success");

    return {
      success: true,
      screenshot: await this.screenshot(),
      message: `Hover-clicked: ${selector}`,
      zone: gate.zone,
      target: gate.target,
    };
  } catch (error) {
    this.audit("hoverClick", selector, "yellow", "failure");

    return {
      success: false,
      screenshot: await this.screenshot(),
      message: `Failed to hover-click: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function fill(this: CBrowser, selector: string, value: string, options: { verbose?: boolean; debugDir?: string } = {}): Promise<ClickResult> {
  const page = await this.getPage();

  try {
    // v16.11.0: Use findFillableElement to prioritize input/textarea/select over text matches
    const element = await this.findFillableElement(selector);

    if (!element) {
      const available = await this.getAvailableInputs(page);
      const aiSuggestion = this.generateFillSuggestion(selector, available);
      const result: ClickResult = {
        success: false,
        screenshot: await this.screenshot(),
        message: `Element not found: ${selector}`,
        availableInputs: available,
        aiSuggestion,
      };

      if (options.verbose) {
        result.debugScreenshot = await this.captureDebugScreenshot(page, {
          availableSelectors: available.map(e => e.selector),
          attemptedSelector: selector,
          debugDir: options.debugDir,
        });
      }

      return result;
    }

    // Check if the element is hidden (custom dropdown/input pattern)
    const isHidden = await this.isElementHidden(element);

    if (isHidden) {
      if (options.verbose) console.log(`  Element "${selector}" is hidden, checking for custom UI component`);

      // Get the tag name to determine handling strategy
      const tagName = await element.evaluate((el: Element) => el.tagName.toLowerCase());

      if (tagName === 'select') {
        // Hidden select with custom dropdown UI
        const customResult = await this.handleCustomDropdown(element, value, options);

        if (customResult.success) {
          this.audit("fill", `${selector} (custom-dropdown:${customResult.strategy})`, "yellow", "success");
          this.lastFilledInputSelector = selector;
          return {
            success: true,
            screenshot: await this.screenshot(),
            message: `Filled custom dropdown: ${selector} (strategy: ${customResult.strategy})`,
          };
        } else {
          // Fall through to try standard fill anyway
          if (options.verbose) console.log(`  Custom dropdown handling failed: ${customResult.error}`);
        }
      } else if (tagName === 'input') {
        // Hidden input - might be part of autocomplete, datepicker, etc.
        const customResult = await this.handleCustomInput(element, value, options);

        if (customResult.success) {
          this.audit("fill", `${selector} (custom-input:${customResult.strategy})`, "yellow", "success");
          this.lastFilledInputSelector = selector;
          return {
            success: true,
            screenshot: await this.screenshot(),
            message: `Filled custom input: ${selector} (strategy: ${customResult.strategy})`,
          };
        }
      }
    }

    // Check if this is a select element - requires selectOption instead of fill
    const tagName = await element.evaluate((el: Element) => el.tagName.toLowerCase());

    if (tagName === 'select') {
      // For select elements, use selectOption
      // Try to match by label text first, then by value
      try {
        await element.selectOption({ label: value });
      } catch {
        // If label match fails, try value match
        try {
          await element.selectOption({ value: value });
        } catch {
          // Try partial/case-insensitive label match
          const options = await element.evaluate((el: Element) => {
            const select = el as HTMLSelectElement;
            return Array.from(select.options).map(o => ({
              value: o.value,
              text: o.text,
            }));
          });

          const match = options.find(o =>
            o.text.toLowerCase().includes(value.toLowerCase()) ||
            o.value.toLowerCase().includes(value.toLowerCase())
          );

          if (match) {
            await element.selectOption({ value: match.value });
          } else {
            throw new Error(`No option matching "${value}" in select. Available: ${options.map(o => o.text).join(', ')}`);
          }
        }
      }

      this.audit("fill", `${selector} (select)`, "yellow", "success");
      this.lastFilledInputSelector = selector;

      return {
        success: true,
        screenshot: await this.screenshot(),
        message: `Selected: ${value} in ${selector}`,
      };
    }

    // Standard fill - works for visible inputs and textareas
    await element.fill(value);

    this.audit("fill", selector, "yellow", "success");

    // Track last filled input for Enter key fallback when submit buttons are hidden
    this.lastFilledInputSelector = selector;

    return {
      success: true,
      screenshot: await this.screenshot(),
      message: `Filled: ${selector}`,
    };
  } catch (error) {
    this.audit("fill", selector, "yellow", "failure");

    const result: ClickResult = {
      success: false,
      screenshot: await this.screenshot(),
      message: `Failed to fill: ${error instanceof Error ? error.message : String(error)}`,
    };

    const available = await this.getAvailableInputs(page);
    result.availableInputs = available;
    result.aiSuggestion = this.generateFillSuggestion(selector, available);
    if (options.verbose) {
      result.debugScreenshot = await this.captureDebugScreenshot(page, {
        availableSelectors: available.map(e => e.selector),
        attemptedSelector: selector,
        debugDir: options.debugDir,
      });
    }

    return result;
  }
}
