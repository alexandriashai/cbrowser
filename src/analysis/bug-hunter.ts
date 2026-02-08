/**
 * CBrowser - Cognitive Browser Automation
 * 
 * Copyright (c) 2026 WF Media (Alexandria Eden)
 * Email: alexandria.shai.eden@gmail.com
 * 
 * This source code is licensed under the Business Source License 1.1
 * found in the LICENSE file in the root directory of this source tree.
 * 
 * Non-production use is permitted. Production use requires a commercial license.
 * See LICENSE for full terms.
 */


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

  // v11.6.0: Actually implement link-following crawler for maxPages > 1
  if (_maxPages > 1) {
    const baseUrl = new URL(url);
    const baseDomain = baseUrl.hostname;

    // Extract links from current page
    const extractLinks = async (): Promise<string[]> => {
      return await page.evaluate((domain: string) => {
        const links: string[] = [];
        document.querySelectorAll("a[href]").forEach((a) => {
          try {
            const href = (a as HTMLAnchorElement).href;
            const linkUrl = new URL(href);
            // Only follow same-domain links, skip anchors and javascript
            if (linkUrl.hostname === domain && !href.includes("#") && !href.startsWith("javascript:")) {
              links.push(href);
            }
          } catch {
            // Invalid URL, skip
          }
        });
        return [...new Set(links)]; // Deduplicate
      }, baseDomain);
    };

    const toVisit = await extractLinks();

    // Visit additional pages up to maxPages
    while (visited.size < _maxPages && toVisit.length > 0 && (Date.now() - startTime) < _timeout) {
      const nextUrl = toVisit.shift();
      if (!nextUrl || visited.has(nextUrl)) continue;

      try {
        await browser.navigate(nextUrl);
        visited.add(nextUrl);

        // Check for issues on this page
        const pageIssues2 = await page.evaluate(() => {
          const issues: Array<{ type: string; description: string; selector?: string; recommendation?: string }> = [];

          // Abbreviated checks for crawled pages (same as above but condensed)
          document.querySelectorAll("img").forEach((img, i) => {
            if (!img.complete || img.naturalWidth === 0) {
              issues.push({ type: "missing-image", description: `Broken image: ${img.src || "unknown"}`, selector: `img:nth-of-type(${i + 1})` });
            }
            if (!img.getAttribute("alt") && img.complete && img.naturalWidth > 0) {
              issues.push({ type: "a11y-violation", description: "Image missing alt attribute", selector: `img:nth-of-type(${i + 1})`, recommendation: "Add alt attribute" });
            }
          });
          document.querySelectorAll("a").forEach((a, i) => {
            if (!a.href || a.href === "#") {
              issues.push({ type: "broken-link", description: `Empty link: ${a.textContent?.slice(0, 30) || "no text"}`, selector: `a:nth-of-type(${i + 1})` });
            }
          });
          document.querySelectorAll("button").forEach((btn, i) => {
            if (!btn.textContent?.trim() && !btn.getAttribute("aria-label")) {
              issues.push({ type: "a11y-violation", description: "Button without accessible text", selector: `button:nth-of-type(${i + 1})` });
            }
          });
          return issues;
        });

        for (const issue of pageIssues2) {
          bugs.push({
            type: issue.type as BugReport["type"],
            severity: issue.type === "a11y-violation" ? "high" : "medium",
            description: issue.description,
            url: nextUrl,
            selector: issue.selector,
            recommendation: issue.recommendation,
          });
        }

        // Extract more links from this page
        const newLinks = await extractLinks();
        for (const link of newLinks) {
          if (!visited.has(link) && !toVisit.includes(link)) {
            toVisit.push(link);
          }
        }
      } catch {
        // Navigation failed, skip this URL
      }
    }
  }

  return {
    bugs,
    pagesVisited: visited.size,
    duration: Date.now() - startTime,
  };
}
