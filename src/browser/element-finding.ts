/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Element finding
 *
 * Resolving a selector or a description to an element, and to a fillable element.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import type { Locator } from "playwright";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Tier 5: Assertions (v5.0.0)
// =========================================================================

export async function findElement(this: CBrowser, selector: string, options: { skipCache?: boolean } = {}): Promise<Locator | null> {
  const page = await this.getPage();

  // Strategy 0: Check self-healing cache first (unless skipped)
  if (!options.skipCache) {
    const cached = this.getCachedSelector(selector);
    if (cached) {
      try {
        const cachedElement = await this.findElement(cached.workingSelector, { skipCache: true });
        if (cachedElement && await cachedElement.count() > 0) {
          this.updateCacheStats(selector, true);
          if (this.config.verbose) {
            console.log(`🔧 Self-healed: "${selector}" → "${cached.workingSelector}"`);
          }
          return cachedElement;
        } else {
          // Cached selector no longer works
          this.updateCacheStats(selector, false);
        }
      } catch {
        this.updateCacheStats(selector, false);
      }
    }
  }

  // Strategy 1: Direct CSS selector
  if (selector.startsWith("css:")) {
    return page.locator(selector.slice(4)).first();
  }

  // Strategy 2: ARIA selector
  if (selector.startsWith("aria:")) {
    const [role, name] = selector.slice(5).split("/");
    return page.getByRole(role as any, { name }).first();
  }

  // Strategy 3: Text content - prefer exact matches over fuzzy, non-sticky over sticky
  // First, try exact text match
  const byTextExact = page.getByText(selector, { exact: true });
  const exactCount = await byTextExact.count();
  if (exactCount > 0) {
    // If multiple exact matches, prefer non-sticky elements
    if (exactCount > 1) {
      const bestMatch = await this.findBestClickCandidate(byTextExact, selector);
      if (bestMatch) return bestMatch;
    }
    return byTextExact.first();
  }

  // Then try partial/fuzzy text match (but with sticky deprioritization)
  const byTextFuzzy = page.getByText(selector, { exact: false });
  const fuzzyCount = await byTextFuzzy.count();
  if (fuzzyCount > 0) {
    // If multiple fuzzy matches, prefer non-sticky elements and shorter/exact matches
    if (fuzzyCount > 1) {
      const bestMatch = await this.findBestClickCandidate(byTextFuzzy, selector);
      if (bestMatch) return bestMatch;
    }
    return byTextFuzzy.first();
  }

  // Strategy 4: Placeholder
  const byPlaceholder = page.getByPlaceholder(selector).first();
  if (await byPlaceholder.count() > 0) {
    return byPlaceholder;
  }

  // Strategy 5: Label
  const byLabel = page.getByLabel(selector).first();
  if (await byLabel.count() > 0) {
    return byLabel;
  }

  // Strategy 6: Role with name
  const byRole = page.getByRole("button", { name: selector }).first();
  if (await byRole.count() > 0) {
    return byRole;
  }

  // Strategy 7: Try as CSS
  try {
    const byCss = page.locator(selector).first();
    if (await byCss.count() > 0) {
      return byCss;
    }
  } catch {
    // Invalid CSS selector, continue
  }

  // Strategy 8: Input by name attribute
  try {
    const byName = page.locator(`input[name="${selector}"]`).first();
    if (await byName.count() > 0) return byName;
  } catch {}

  // Strategy 9: Input by type attribute (e.g., "email", "password")
  try {
    const byType = page.locator(`input[type="${selector}"]`).first();
    if (await byType.count() > 0) return byType;
  } catch {}

  // Strategy 10: Element by id
  try {
    const byId = page.locator(`#${selector}`).first();
    if (await byId.count() > 0) return byId;
  } catch {}

  // Strategy 11: Textarea by name
  try {
    const byTextarea = page.locator(`textarea[name="${selector}"]`).first();
    if (await byTextarea.count() > 0) return byTextarea;
  } catch {}

  // Strategy 12: Role link with name
  try {
    const byLink = page.getByRole("link", { name: selector }).first();
    if (await byLink.count() > 0) return byLink;
  } catch {}

  // Strategy 13: Fuzzy attribute match via JS
  try {
    const fuzzyHandle = await page.evaluateHandle((search) => {
      const inputs = Array.from(document.querySelectorAll("input, textarea, select, button, a, [role='button'], [role='link']"));
      const searchLower = search.toLowerCase();
      for (const el of inputs) {
        const name = el.getAttribute("name")?.toLowerCase() || "";
        const id = el.getAttribute("id")?.toLowerCase() || "";
        const placeholder = el.getAttribute("placeholder")?.toLowerCase() || "";
        const type = el.getAttribute("type")?.toLowerCase() || "";
        const ariaLabel = el.getAttribute("aria-label")?.toLowerCase() || "";
        const text = (el as HTMLElement).innerText?.toLowerCase() || "";
        if (name.includes(searchLower) || id.includes(searchLower) ||
            placeholder.includes(searchLower) || type === searchLower ||
            ariaLabel.includes(searchLower) || text.includes(searchLower)) {
          return el;
        }
      }
      return null;
    }, selector);

    const element = fuzzyHandle.asElement();
    if (element) {
      // Convert ElementHandle back to Locator isn't directly possible,
      // but we can get a selector from it
      const generatedSelector = await page.evaluate((el) => {
        // Escaped, and ARIA-first — see the note on analyzePage's getSelector.
        const q = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const ariaLabel = el.getAttribute("aria-label");
        if (ariaLabel) return `[aria-label="${q(ariaLabel)}"]`;
        const testId = el.getAttribute("data-testid");
        if (testId) return `[data-testid="${q(testId)}"]`;
        if (el.id) return `#${CSS.escape(el.id)}`;
        const name = el.getAttribute("name");
        if (name) return `[name="${q(name)}"]`;
        return null;
      }, element);

      if (generatedSelector) {
        return page.locator(generatedSelector).first();
      }
    }
  } catch {}

  // Strategy 14: Search within iframes (v14.3.0)
  // For embedded apps like TodoMVC, search inside iframes
  try {
    const frames = page.frames();
    for (const frame of frames) {
      if (frame === page.mainFrame()) continue; // Skip main frame, already searched

      // Try common selectors in iframe
      try {
        // Text match in iframe
        const byText = frame.getByText(selector, { exact: false });
        if (await byText.count() > 0) {
          // Store which iframe has the element for later operations
          (this as any)._activeFrame = frame;
          return byText.first();
        }

        // Placeholder match in iframe
        const byPlaceholder = frame.getByPlaceholder(selector, { exact: false });
        if (await byPlaceholder.count() > 0) {
          (this as any)._activeFrame = frame;
          return byPlaceholder.first();
        }

        // Role match in iframe
        const roles = ["button", "link", "textbox", "checkbox", "radio", "combobox"] as const;
        for (const role of roles) {
          const byRole = frame.getByRole(role, { name: selector });
          if (await byRole.count() > 0) {
            (this as any)._activeFrame = frame;
            return byRole.first();
          }
        }
      } catch {
        // Frame may be cross-origin, skip it
        continue;
      }
    }
  } catch {}

  return null;
}

export async function findFillableElement(this: CBrowser, selector: string): Promise<Locator | null> {
  const page = await this.getPage();

  // Strategy 1: Direct CSS selector (passthrough)
  if (selector.startsWith("css:")) {
    return page.locator(selector.slice(4)).first();
  }

  // Strategy 2: ARIA selector (passthrough)
  if (selector.startsWith("aria:")) {
    const [role, name] = selector.slice(5).split("/");
    return page.getByRole(role as any, { name }).first();
  }

  // Strategy 3: Input by name attribute (PRIORITY for fill)
  try {
    const byName = page.locator(`input[name="${selector}"], textarea[name="${selector}"], select[name="${selector}"]`).first();
    if (await byName.count() > 0) return byName;
  } catch {}

  // Strategy 4: Input by id (PRIORITY for fill)
  try {
    const byId = page.locator(`input#${selector}, textarea#${selector}, select#${selector}`).first();
    if (await byId.count() > 0) return byId;
  } catch {}

  // Strategy 5: Input by type attribute (e.g., "email", "password")
  try {
    const byType = page.locator(`input[type="${selector}"]`).first();
    if (await byType.count() > 0) return byType;
  } catch {}

  // Strategy 6: Placeholder (common for inputs)
  const byPlaceholder = page.getByPlaceholder(selector).first();
  if (await byPlaceholder.count() > 0) {
    return byPlaceholder;
  }

  // Strategy 7: Label - this returns the associated INPUT, not the label itself
  // getByLabel is specifically designed for form fields
  const byLabel = page.getByLabel(selector).first();
  if (await byLabel.count() > 0) {
    // Verify it's actually a fillable element, not a div with aria-label
    const tagName = await byLabel.evaluate((el) => el.tagName.toLowerCase());
    if (['input', 'textarea', 'select'].includes(tagName)) {
      return byLabel;
    }
  }

  // Strategy 8: ARIA label on fillable elements
  try {
    const byAriaLabel = page.locator(`input[aria-label*="${selector}" i], textarea[aria-label*="${selector}" i], select[aria-label*="${selector}" i]`).first();
    if (await byAriaLabel.count() > 0) return byAriaLabel;
  } catch {}

  // Strategy 9: Fuzzy match on fillable elements only
  try {
    const fuzzyHandle = await page.evaluateHandle((search) => {
      const fillables = Array.from(document.querySelectorAll("input, textarea, select"));
      const searchLower = search.toLowerCase();
      for (const el of fillables) {
        const name = el.getAttribute("name")?.toLowerCase() || "";
        const id = el.getAttribute("id")?.toLowerCase() || "";
        const placeholder = el.getAttribute("placeholder")?.toLowerCase() || "";
        const type = el.getAttribute("type")?.toLowerCase() || "";
        const ariaLabel = el.getAttribute("aria-label")?.toLowerCase() || "";
        // Check associated label
        const labelledBy = el.getAttribute("aria-labelledby");
        const labelText = labelledBy
          ? document.getElementById(labelledBy)?.textContent?.toLowerCase() || ""
          : "";
        // Check for<label for="id"> pattern
        const labelFor = el.id
          ? document.querySelector(`label[for="${el.id}"]`)?.textContent?.toLowerCase() || ""
          : "";

        if (name.includes(searchLower) || id.includes(searchLower) ||
            placeholder.includes(searchLower) || type === searchLower ||
            ariaLabel.includes(searchLower) || labelText.includes(searchLower) ||
            labelFor.includes(searchLower)) {
          return el;
        }
      }
      return null;
    }, selector);

    const element = fuzzyHandle.asElement();
    if (element) {
      const generatedSelector = await page.evaluate((el) => {
        // Escaped, and ARIA-first — see the note on analyzePage's getSelector.
        const q = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const ariaLabel = el.getAttribute("aria-label");
        if (ariaLabel) return `[aria-label="${q(ariaLabel)}"]`;
        const testId = el.getAttribute("data-testid");
        if (testId) return `[data-testid="${q(testId)}"]`;
        if (el.id) return `#${CSS.escape(el.id)}`;
        const name = el.getAttribute("name");
        if (name) return `[name="${q(name)}"]`;
        return null;
      }, element);

      if (generatedSelector) {
        return page.locator(generatedSelector).first();
      }
    }
  } catch {}

  // Strategy 10: Search within iframes
  try {
    const frames = page.frames();
    for (const frame of frames) {
      if (frame === page.mainFrame()) continue;

      try {
        // Placeholder in iframe
        const byPlaceholderFrame = frame.getByPlaceholder(selector, { exact: false });
        if (await byPlaceholderFrame.count() > 0) {
          (this as any)._activeFrame = frame;
          return byPlaceholderFrame.first();
        }

        // Label in iframe (for form fields)
        const byLabelFrame = frame.getByLabel(selector, { exact: false });
        if (await byLabelFrame.count() > 0) {
          const tagName = await byLabelFrame.first().evaluate((el) => el.tagName.toLowerCase());
          if (['input', 'textarea', 'select'].includes(tagName)) {
            (this as any)._activeFrame = frame;
            return byLabelFrame.first();
          }
        }
      } catch {
        continue;
      }
    }
  } catch {}

  // Fallback: Use standard findElement (may match non-fillable elements)
  // This maintains backward compatibility for edge cases
  return this.findElement(selector);
}
