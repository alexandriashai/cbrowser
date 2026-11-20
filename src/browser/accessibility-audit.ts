/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Accessibility audit
 *
 * auditAccessibility.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import type { CBrowser } from "../browser.js";

// =========================================================================
// Tier 2: Accessibility Audit (v2.5.0)
// =========================================================================

export async function auditAccessibility(this: CBrowser): Promise<{
  url: string;
  violations: Array<{ id: string; impact: string; description: string; helpUrl: string }>;
  passes: number;
  score: number;
}> {
  const page = await this.getPage();

  const results = await page.evaluate(() => {
    const violations: Array<{ id: string; impact: string; description: string; helpUrl: string }> = [];

    // Check images without alt
    document.querySelectorAll("img").forEach(img => {
      // `img.alt` is "" for BOTH a missing attribute and alt="", so this
      // reported a valid decorative declaration as a serious violation.
      // getAttribute distinguishes them: null means absent.
      if (img.getAttribute("alt") === null && !img.getAttribute("aria-label")) {
        violations.push({
          id: "img-alt",
          impact: "serious",
          description: "Image has no alt attribute",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.4/image-alt",
        });
      }
    });

    // Check buttons without text
    document.querySelectorAll("button").forEach(btn => {
      if (!btn.textContent?.trim() && !btn.getAttribute("aria-label")) {
        violations.push({
          id: "button-name",
          impact: "critical",
          description: "Button has no accessible name",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.4/button-name",
        });
      }
    });

    // Check inputs without labels
    document.querySelectorAll("input:not([type='hidden'])").forEach(input => {
      const id = input.id;
      const hasLabel = id && document.querySelector(`label[for="${id}"]`);
      if (!hasLabel && !input.getAttribute("aria-label")) {
        violations.push({
          id: "label",
          impact: "serious",
          description: "Form input missing label",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.4/label",
        });
      }
    });

    // Check lang attribute
    if (!document.documentElement.lang) {
      violations.push({
        id: "html-has-lang",
        impact: "serious",
        description: "Page missing lang attribute",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.4/html-has-lang",
      });
    }

    const passes = document.querySelectorAll("img[alt], button:not(:empty), label").length;
    return { violations, passes };
  });

  const score = results.passes > 0
    ? Math.round((results.passes / (results.passes + results.violations.length)) * 100)
    : 100;

  return {
    url: page.url(),
    violations: results.violations,
    passes: results.passes,
    score,
  };
}
