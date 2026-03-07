/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
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
  type:
    | "broken-link"
    | "console-error"
    | "a11y-violation"
    | "slow-resource"
    | "missing-image"
    | "form-error"
    | "contrast-violation"
    | "missing-aria"
    | "duplicate-id"
    | "missing-page-title"
    | "missing-lang"
    | "keyboard-trap"
    | "autoplay-media"
    | "missing-skip-link";
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  url: string;
  selector?: string;
  screenshot?: string;
  recommendation?: string;
  wcagCriteria?: string[];
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

    // v18.15.0: Additional detection categories

    // 1. Check for duplicate IDs
    const allIds = Array.from(document.querySelectorAll("[id]")).map(el => el.id);
    const idCounts = new Map<string, number>();
    for (const id of allIds) {
      idCounts.set(id, (idCounts.get(id) || 0) + 1);
    }
    for (const [id, count] of idCounts) {
      if (count > 1) {
        issues.push({
          type: "duplicate-id",
          description: `Duplicate ID "${id}" found ${count} times - IDs must be unique`,
          selector: `#${id}`,
          recommendation: `Change duplicate IDs to unique values. This breaks label associations and JavaScript functionality.`,
        });
      }
    }

    // 2. Check for missing page title
    if (!document.title || document.title.trim().length === 0) {
      issues.push({
        type: "missing-page-title",
        description: "Page is missing a <title> element",
        recommendation: "Add a descriptive <title> in the <head> section for accessibility and SEO",
      });
    }

    // 3. Check for missing language attribute
    const htmlLang = document.documentElement.getAttribute("lang");
    if (!htmlLang || htmlLang.trim().length === 0) {
      issues.push({
        type: "missing-lang",
        description: "HTML element is missing lang attribute",
        selector: "html",
        recommendation: 'Add lang="en" (or appropriate language code) to the <html> element for screen readers',
      });
    }

    // 4. Check for missing skip link
    const firstLink = document.querySelector("a");
    const hasSkipLink =
      document.querySelector('a[href="#main"], a[href="#content"], a[href="#maincontent"]') !== null ||
      document.querySelector('a[class*="skip"], a[class*="Skip"]') !== null ||
      (firstLink && firstLink.textContent?.toLowerCase().includes("skip"));
    if (!hasSkipLink) {
      issues.push({
        type: "missing-skip-link",
        description: "Page may lack a skip navigation link",
        recommendation: 'Add a "Skip to main content" link at the top of the page for keyboard users',
      });
    }

    // 5. Check for auto-playing media
    document.querySelectorAll("video[autoplay], audio[autoplay]").forEach((media, i) => {
      const isMuted = media.hasAttribute("muted");
      const tag = media.tagName.toLowerCase();
      if (!isMuted) {
        issues.push({
          type: "autoplay-media",
          description: `Auto-playing ${tag} without muted attribute`,
          selector: `${tag}:nth-of-type(${i + 1})`,
          recommendation: "Add muted attribute to autoplay media, or remove autoplay and provide controls",
        });
      }
    });

    // 6. Check for missing ARIA on interactive elements
    document.querySelectorAll('[role="button"], [role="tab"], [role="checkbox"], [role="radio"]').forEach((el, i) => {
      const role = el.getAttribute("role");
      const missingAttrs: string[] = [];

      if (role === "checkbox" || role === "radio") {
        if (!el.hasAttribute("aria-checked")) {
          missingAttrs.push("aria-checked");
        }
      }
      if (role === "tab") {
        if (!el.hasAttribute("aria-selected")) {
          missingAttrs.push("aria-selected");
        }
      }
      if (!el.hasAttribute("aria-label") && !el.hasAttribute("aria-labelledby") && !(el as HTMLElement).textContent?.trim()) {
        missingAttrs.push("aria-label or text content");
      }

      if (missingAttrs.length > 0) {
        issues.push({
          type: "missing-aria",
          description: `Element with role="${role}" is missing: ${missingAttrs.join(", ")}`,
          selector: `[role="${role}"]:nth-of-type(${i + 1})`,
          recommendation: `Add required ARIA attributes for role="${role}": ${missingAttrs.join(", ")}`,
        });
      }
    });

    // 7. Check for low contrast text (simplified heuristic)
    const textElements = Array.from(document.querySelectorAll("p, span, h1, h2, h3, h4, h5, h6, a, button, label")).slice(0, 50);
    for (const el of textElements) {
      const styles = window.getComputedStyle(el);
      const color = styles.color;
      // Simple check for very light gray text
      if (color.includes("rgb")) {
        const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
          const [, r, g, b] = match.map(Number);
          // Check for light gray that's likely low contrast on white
          if (r > 180 && g > 180 && b > 180 && r < 220 && g < 220 && b < 220) {
            issues.push({
              type: "contrast-violation",
              description: `Text may have low contrast (color: ${color})`,
              selector: el.tagName.toLowerCase(),
              recommendation: "Ensure text has at least 4.5:1 contrast ratio against background (3:1 for large text)",
            });
            break; // Only report once
          }
        }
      }
    }

    return issues;
  });

  // Add page issues to bugs with severity mapping
  for (const issue of pageIssues) {
    const isPlaceholderOnly = issue.description.includes("relies only on placeholder");

    // Determine severity based on issue type
    let severity: BugReport["severity"] = "medium";
    if (isPlaceholderOnly) {
      severity = "medium";
    } else if (issue.type === "duplicate-id") {
      severity = "high"; // Breaks functionality
    } else if (issue.type === "missing-page-title" || issue.type === "missing-lang") {
      severity = "high"; // WCAG Level A
    } else if (issue.type === "autoplay-media") {
      severity = "critical"; // Can cause seizures
    } else if (issue.type === "missing-skip-link") {
      severity = "low"; // WCAG Level A but common omission
    } else if (issue.type === "contrast-violation") {
      severity = "high"; // Affects readability
    } else if (issue.type === "missing-aria") {
      severity = "medium"; // Affects AT users
    } else if (issue.type === "a11y-violation") {
      severity = "high";
    }

    bugs.push({
      type: issue.type as BugReport["type"],
      severity,
      description: issue.description,
      url,
      selector: issue.selector,
      recommendation: issue.recommendation,
    });
  }

  // Add console errors (deduplicated with count)
  const errorCounts = new Map<string, number>();
  for (const error of consoleErrors) {
    const key = error.slice(0, 200);
    errorCounts.set(key, (errorCounts.get(key) || 0) + 1);
  }
  for (const [error, count] of errorCounts) {
    bugs.push({
      type: "console-error",
      severity: "high",
      description: count > 1 ? `${error} (×${count})` : error,
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
