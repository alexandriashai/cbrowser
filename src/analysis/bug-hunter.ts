/**
 * Autonomous Bug Hunter
 *
 * Tier 4: Automatically explores pages and finds common bugs including:
 * - Broken links and images
 * - Console errors
 * - Accessibility violations
 * - Slow resources
 * - Form errors
 */

import type { CBrowser } from "../browser.js";

export interface BugReport {
  type: "broken-link" | "console-error" | "a11y-violation" | "slow-resource" | "missing-image" | "form-error";
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  url: string;
  selector?: string;
  screenshot?: string;
  recommendation?: string;
}

/**
 * Autonomously explore a page and find bugs.
 */
export async function huntBugs(
  browser: CBrowser,
  url: string,
  options: { maxDepth?: number; maxPages?: number; timeout?: number } = {}
): Promise<{
  bugs: BugReport[];
  pagesVisited: number;
  duration: number;
}> {
  const startTime = Date.now();
  const bugs: BugReport[] = [];
  const visited = new Set<string>();
  const _maxPages = options.maxPages || 10;
  const _timeout = options.timeout || 60000;

  const page = await (browser as any).getPage();
  const consoleErrors: string[] = [];

  // Capture console errors
  page.on("console", (msg: any) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  // Start with initial URL
  await browser.navigate(url);
  visited.add(url);

  // Check for issues on current page
  const pageIssues = await page.evaluate(() => {
    const issues: Array<{ type: string; description: string; selector?: string; recommendation?: string }> = [];

    // Check for broken images
    document.querySelectorAll("img").forEach((img, i) => {
      if (!img.complete || img.naturalWidth === 0) {
        const hasAlt = !!img.getAttribute("alt");
        issues.push({
          type: "missing-image",
          description: `Broken image: ${img.src || img.alt || "unknown"}`,
          selector: `img:nth-of-type(${i + 1})`,
          recommendation: hasAlt
            ? "Fix the image source URL or remove the broken image element"
            : "Fix the image source URL and add an alt attribute for accessibility",
        });
      }
      // Check images without alt text
      if (!img.getAttribute("alt") && img.complete && img.naturalWidth > 0) {
        issues.push({
          type: "a11y-violation",
          description: `Image missing alt attribute: ${img.src?.slice(-50) || "unknown"}`,
          selector: `img:nth-of-type(${i + 1})`,
          recommendation: "Add alt=\"descriptive text\" for screen readers, or alt=\"\" if decorative",
        });
      }
    });

    // Check for empty links
    document.querySelectorAll("a").forEach((a, i) => {
      if (!a.href || a.href === "#" || a.href === "javascript:void(0)") {
        issues.push({
          type: "broken-link",
          description: `Empty/invalid link: ${a.textContent?.slice(0, 50) || "no text"}`,
          selector: `a:nth-of-type(${i + 1})`,
          recommendation: "Add a valid href or use a <button> for interactive actions",
        });
      }
      // Check links without accessible text
      if (!a.textContent?.trim() && !a.getAttribute("aria-label") && !a.querySelector("img[alt]")) {
        issues.push({
          type: "a11y-violation",
          description: "Link with no accessible text",
          selector: `a:nth-of-type(${i + 1})`,
          recommendation: "Add aria-label, visible text content, or an img with alt text inside the link",
        });
      }
    });

    // Check for empty buttons
    document.querySelectorAll("button").forEach((btn, i) => {
      const hasText = !!btn.textContent?.trim();
      const hasAriaLabel = !!btn.getAttribute("aria-label");
      const hasAriaLabelledby = !!btn.getAttribute("aria-labelledby");
      const hasTitle = !!btn.getAttribute("title");
      if (!hasText && !hasAriaLabel && !hasAriaLabelledby && !hasTitle) {
        issues.push({
          type: "a11y-violation",
          description: "Button with no accessible text",
          selector: `button:nth-of-type(${i + 1})`,
          recommendation: "Add aria-label=\"action description\" or visible text content to the button",
        });
      }
    });

    // Check for missing form labels
    document.querySelectorAll("input:not([type='hidden'])").forEach((input, i) => {
      const id = input.id;
      const hasLabel = id && document.querySelector(`label[for="${id}"]`);
      const hasAriaLabel = !!input.getAttribute("aria-label");
      const hasAriaLabelledby = !!input.getAttribute("aria-labelledby");
      const hasPlaceholder = !!input.getAttribute("placeholder");
      if (!hasLabel && !hasAriaLabel && !hasAriaLabelledby && !hasPlaceholder) {
        issues.push({
          type: "form-error",
          description: `Input without label (type=${input.getAttribute("type") || "text"})`,
          selector: `input:nth-of-type(${i + 1})`,
          recommendation: "Add a <label for=\"id\"> element, or aria-label attribute for accessibility",
        });
      } else if (!hasLabel && !hasAriaLabel && !hasAriaLabelledby && hasPlaceholder) {
        issues.push({
          type: "a11y-violation",
          description: `Input relies only on placeholder for label (type=${input.getAttribute("type") || "text"})`,
          selector: `input:nth-of-type(${i + 1})`,
          recommendation: "Placeholder is not a substitute for a label. Add <label> or aria-label",
        });
      }
    });

    // Check for elements with click handlers but no keyboard access
    document.querySelectorAll("[onclick]:not(a):not(button):not(input):not(select):not(textarea)").forEach((el, i) => {
      const tag = el.tagName.toLowerCase();
      const hasRole = !!el.getAttribute("role");
      const hasTabindex = el.getAttribute("tabindex") !== null;
      if (!hasRole || !hasTabindex) {
        issues.push({
          type: "a11y-violation",
          description: `Non-interactive <${tag}> with onclick handler lacks keyboard access`,
          selector: `${tag}:nth-of-type(${i + 1})`,
          recommendation: `Add role="button" and tabindex="0" for keyboard access, or use a <button> element instead`,
        });
      }
    });

    // Check for missing heading hierarchy
    const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"));
    let prevLevel = 0;
    for (const h of headings) {
      const level = parseInt(h.tagName[1]);
      if (level > prevLevel + 1 && prevLevel > 0) {
        issues.push({
          type: "a11y-violation",
          description: `Heading level skipped: <h${prevLevel}> to <h${level}>`,
          selector: h.tagName.toLowerCase(),
          recommendation: `Use sequential heading levels. Change to <h${prevLevel + 1}> or add missing intermediate headings`,
        });
      }
      prevLevel = level;
    }

    return issues;
  });

  // Add page issues to bugs
  for (const issue of pageIssues) {
    const isPlaceholderOnly = issue.description.includes("relies only on placeholder");
    bugs.push({
      type: issue.type as BugReport["type"],
      severity: isPlaceholderOnly ? "medium" : (issue.type === "a11y-violation" ? "high" : "medium"),
      description: issue.description,
      url,
      selector: issue.selector,
      recommendation: issue.recommendation,
    });
  }

  // Add console errors
  for (const error of consoleErrors) {
    bugs.push({
      type: "console-error",
      severity: "high",
      description: error.slice(0, 200),
      url,
    });
  }

  return {
    bugs,
    pagesVisited: visited.size,
    duration: Date.now() - startTime,
  };
}
