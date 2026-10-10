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
    /**
     * A declared-decorative image worth confirming, not a violation.
     *
     * Added to the union 2026-08-11, a day after it started being emitted. The
     * issues are built as untyped object literals inside `page.evaluate` and
     * pushed through a loosely-typed path, so tsc never saw the mismatch — a
     * value with a producer and a consumer and no type between them, which is
     * the third instance of that shape found in this repo this week.
     */
    | "a11y-verify"
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
  /** The page the bug was found on. */
  url: string;
  /**
   * For a "Failed to load resource" console error: the resource that failed,
   * which `url` (the page) does not name. (v5 B24, 2026-10-09)
   */
  resourceUrl?: string;
  selector?: string;
  screenshot?: string;
  recommendation?: string;
  wcagCriteria?: string[];
}

/**
 * The crawl's identity for a URL: parsed, fragment dropped, trailing slash
 * trimmed from a non-root path. `http://host` and `http://host/` and
 * `http://host/#top` are one page; so are `/pricing` and `/pricing/`.
 *
 * Without it the start URL was stored as typed. cbrowser.ai's own `href="/"`
 * resolves to `https://cbrowser.ai/`, which did not equal a start URL typed
 * without the slash, so the home page was crawled a second time as a "new"
 * page and pagesVisited counted it twice.
 */
export function normalizeCrawlUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.href;
  } catch {
    return raw;
  }
}

/**
 * Severity for a finding, the same on every page.
 *
 * The first page had this mapping; crawled pages used
 * `a11y-violation ? "high" : "medium"`, so an alt="" image the first page
 * graded "low" (a prompt to confirm a decorative image) was "medium" on page
 * two. One function, both loops.
 */
export function severityFor(issue: { type: string; description?: string }): BugReport["severity"] {
  const isPlaceholderOnly = (issue.description ?? "").includes("relies only on placeholder");
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
  } else if (issue.type === "console-error") {
    severity = "high";
  } else if (issue.type === "a11y-violation") {
    severity = "high";
  } else if (issue.type === "a11y-verify") {
    // A prompt to confirm an existing decision, not a violation. Grading it
    // high is what made hunt_bugs contradict empathy_audit on the same six
    // images — one calling it critical, the other minor.
    severity = "low";
  }
  return severity;
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
  /** Every page analysed, as normalizeCrawlUrl of where the browser landed, in visit order. */
  visitedUrls: string[];
  duration: number;
}> {
  const startTime = Date.now();
  const bugs: BugReport[] = [];
  // Requested and landed URLs, normalized: never request the same page twice.
  const seen = new Set<string>();
  // Pages actually analysed. pagesVisited is its length, so the count and the
  // list cannot disagree.
  const visitedUrls: string[] = [];
  const _maxPages = options.maxPages || 10;
  const _timeout = options.timeout || 60000;

  const page = await (browser as any).getPage();
  const consoleErrors: Array<{ text: string; resourceUrl?: string }> = [];

  // Capture console errors. Chrome's "Failed to load resource" message does
  // not name the resource in its text; it is the message's location. Without
  // it a 404 was reported as a high bug against the page with no way to tell
  // which asset failed (cbrowser.ai/blog). (v5 B24)
  page.on("console", (msg: any) => {
    if (msg.type() === "error") {
      const text: string = msg.text();
      const loc = typeof msg.location === "function" ? msg.location() : undefined;
      const resourceUrl = /^Failed to load resource/.test(text) && loc?.url ? String(loc.url) : undefined;
      consoleErrors.push({ text, ...(resourceUrl ? { resourceUrl } : {}) });
    }
  });

  // Console errors collected since the last flush belong to `pageUrl`.
  // Crawled pages' errors used to be collected and never reported: the only
  // flush ran once, before the crawl started.
  const flushConsoleErrors = (pageUrl: string) => {
    // Keyed by text AND resource: two different missing assets are two bugs,
    // each with its own fix, not one bug "×2".
    const errorCounts = new Map<string, { text: string; resourceUrl?: string; count: number }>();
    for (const error of consoleErrors.splice(0)) {
      const key = `${error.text.slice(0, 200)}\u0000${error.resourceUrl ?? ""}`;
      const entry = errorCounts.get(key);
      if (entry) entry.count++;
      else errorCounts.set(key, { ...error, count: 1 });
    }
    for (const { text, resourceUrl, count } of errorCounts.values()) {
      const described = resourceUrl ? `${text} - ${resourceUrl}` : text;
      bugs.push({
        type: "console-error",
        severity: severityFor({ type: "console-error", description: text }),
        description: count > 1 ? `${described} (×${count})` : described,
        url: pageUrl,
        ...(resourceUrl ? { resourceUrl } : {}),
      });
    }
  };

  // Start with initial URL. The page is recorded where the browser LANDED,
  // so a redirect is not visited twice under two names.
  await browser.navigate(url);
  const startUrl = normalizeCrawlUrl(page.url() || url);
  seen.add(normalizeCrawlUrl(url));
  seen.add(startUrl);
  visitedUrls.push(startUrl);

  // Check for issues on current page
  const pageIssues = await page.evaluate(() => {
    const issues: Array<{ type: string; description: string; selector?: string; recommendation?: string }> = [];

    // Check for broken images
    document.querySelectorAll("img").forEach((img, i) => {
      if (!img.complete || img.naturalWidth === 0) {
        // getAttribute returns null when ABSENT and "" when alt="" is present,
        // and both are falsy — so `!!` conflates a WCAG failure with a valid
        // declaration that the image is decorative. Compare against null.
        const hasAlt = img.getAttribute("alt") !== null;
        issues.push({
          type: "missing-image",
          description: `Broken image: ${img.src || img.alt || "unknown"}`,
          selector: `img:nth-of-type(${i + 1})`,
          recommendation: hasAlt
            ? "Fix the image source URL or remove the broken image element"
            : "Fix the image source URL and add an alt attribute for accessibility",
        });
      }
      // alt ABSENT and alt="" are different defects, and `!img.getAttribute("alt")`
      // treated them as one: null and "" are both falsy.
      //
      // A missing alt is an unambiguous WCAG 1.1.1 failure. An empty alt is a
      // VALID declaration that the image is decorative — possibly wrong, but
      // already a decision someone made. Grading the second as high severity and
      // prescribing "add alt attribute" prescribes a fix that is already applied,
      // and contradicted empathy_audit, which grades the same six images as minor
      // and asks the reader to VERIFY the decorative intent. (2026-08-06)
      const altAttr = img.getAttribute("alt");
      const rendered = img.complete && img.naturalWidth > 0;
      // Matches empathy_audit's threshold so the two tools agree on which images
      // are too small to be worth asking about.
      const isTiny = img.width < 20 || img.height < 20;
      if (altAttr === null && rendered) {
        issues.push({
          type: "a11y-violation",
          description: `Image has no alt attribute: ${img.src?.slice(-50) || "unknown"}`,
          selector: `img:nth-of-type(${i + 1})`,
          recommendation: "Add alt=\"descriptive text\" for screen readers, or alt=\"\" if decorative",
        });
      } else if (altAttr === "" && rendered && !isTiny) {
        issues.push({
          type: "a11y-verify",
          description: `Image (${Math.round(img.width)}x${Math.round(img.height)}px) declares alt="" (decorative): ${img.src?.slice(-50) || "unknown"}`,
          selector: `img:nth-of-type(${i + 1})`,
          recommendation: "Verify this image is purely decorative. If it conveys meaning, replace alt=\"\" with descriptive text",
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
    bugs.push({
      type: issue.type as BugReport["type"],
      severity: severityFor(issue),
      description: issue.description,
      url: startUrl,
      selector: issue.selector,
      recommendation: issue.recommendation,
    });
  }

  // Add console errors (deduplicated with count)
  flushConsoleErrors(startUrl);

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

    const queued = new Set<string>();
    const toVisit: string[] = [];
    const enqueue = (links: string[]) => {
      for (const link of links) {
        const key = normalizeCrawlUrl(link);
        if (seen.has(key) || queued.has(key)) continue;
        queued.add(key);
        toVisit.push(link);
      }
    };
    enqueue(await extractLinks());

    // Visit additional pages up to maxPages
    while (visitedUrls.length < _maxPages && toVisit.length > 0 && (Date.now() - startTime) < _timeout) {
      const nextUrl = toVisit.shift();
      if (!nextUrl) continue;
      const requested = normalizeCrawlUrl(nextUrl);
      if (seen.has(requested)) continue;
      seen.add(requested);

      try {
        // Errors logged from here on belong to this page.
        consoleErrors.length = 0;
        await browser.navigate(nextUrl);
        const landed = normalizeCrawlUrl(page.url() || nextUrl);
        if (landed !== requested && seen.has(landed)) {
          // Redirected to a page already analysed.
          consoleErrors.length = 0;
          continue;
        }
        seen.add(landed);
        visitedUrls.push(landed);

        // Check for issues on this page
        const pageIssues2 = await page.evaluate(() => {
          const issues: Array<{ type: string; description: string; selector?: string; recommendation?: string }> = [];

          // Abbreviated checks for crawled pages (same as above but condensed)
          document.querySelectorAll("img").forEach((img, i) => {
            if (!img.complete || img.naturalWidth === 0) {
              issues.push({ type: "missing-image", description: `Broken image: ${img.src || "unknown"}`, selector: `img:nth-of-type(${i + 1})` });
            }
            // Same null-vs-empty distinction as the first-page check above. This
            // condensed copy is why the class needed sweeping rather than the one
            // reported line fixing.
            const altAttr = img.getAttribute("alt");
            const rendered = img.complete && img.naturalWidth > 0;
            if (altAttr === null && rendered) {
              issues.push({ type: "a11y-violation", description: "Image has no alt attribute", selector: `img:nth-of-type(${i + 1})`, recommendation: "Add alt=\"descriptive text\", or alt=\"\" if decorative" });
            } else if (altAttr === "" && rendered && img.width >= 20 && img.height >= 20) {
              issues.push({ type: "a11y-verify", description: `Image (${Math.round(img.width)}x${Math.round(img.height)}px) declares alt="" (decorative)`, selector: `img:nth-of-type(${i + 1})`, recommendation: "Verify this image is purely decorative" });
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
            severity: severityFor(issue),
            description: issue.description,
            url: landed,
            selector: issue.selector,
            recommendation: issue.recommendation,
          });
        }
        flushConsoleErrors(landed);

        // Extract more links from this page
        enqueue(await extractLinks());
      } catch {
        // Navigation failed, skip this URL
        consoleErrors.length = 0;
      }
    }
  }

  return {
    bugs,
    pagesVisited: visitedUrls.length,
    visitedUrls,
    duration: Date.now() - startTime,
  };
}

/**
 * The hunt_bugs tool response, shared by the HTTP and stdio servers.
 *
 * Repeats of one finding on one page are collapsed with an occurrence count;
 * findings are sorted worst first and paged (limit/offset) with the cut
 * stated; byPage/byType/bySeverity describe ALL findings. byPage starts with
 * every visited page at 0, so a clean page is listed rather than missing:
 * pagesVisited said 5 while byPage named 3, and the reader could not tell
 * "two clean pages" from "two pages lost". The stdio copy had none of this:
 * crawl-order slice(0, 10), no paging, no breakdowns. (2026-10-09)
 */
export function huntBugsResponse(
  result: { bugs: BugReport[]; pagesVisited: number; visitedUrls?: string[]; duration: number },
  options: { limit?: number; offset?: number } = {},
): Record<string, unknown> {
  const all = result.bugs ?? [];

  // Collapse repeats of the same finding on the same page.
  //
  // A carousel with duplicated slides reported the same five broken images
  // twice, so ten "bugs" were five distinct assets. Counting the work
  // rather than the DOM occurrences is the honest figure; occurrences are
  // kept so nothing is lost. (2026-07-31)
  type Group = BugReport & { occurrences: number; selectors: string[] };
  const groups = new Map<string, Group>();
  for (const bug of all) {
    const key = `${bug.type}|${bug.url}|${bug.description}`;
    const prior = groups.get(key);
    if (prior) {
      prior.occurrences += 1;
      if (bug.selector && !prior.selectors.includes(bug.selector)) prior.selectors.push(bug.selector);
    } else {
      groups.set(key, { ...bug, occurrences: 1, selectors: bug.selector ? [bug.selector] : [] });
    }
  }
  const distinct = [...groups.values()];

  const SEV = (x: string) => ({ critical: 0, high: 1, major: 1, medium: 2, moderate: 2, low: 3, minor: 3, info: 4 }[String(x).toLowerCase()] ?? 5);
  // Worst first. A plain slice took the first ten in crawl order, which is
  // page one -- so a five-page crawl reported thirty-five bugs and showed
  // ten, every one of them from the homepage, with nothing saying so.
  distinct.sort((x, y) => SEV(x.severity) - SEV(y.severity));

  const start = Math.max(0, options.offset ?? 0);
  const shown = distinct.slice(start, start + Math.max(1, options.limit ?? 25));

  const tally = (rows: Group[], key: "url" | "type" | "severity", seed: string[] = []) => rows.reduce((m: Record<string, number>, r) => {
    const k = String(r[key] ?? "unknown"); m[k] = (m[k] ?? 0) + 1; return m;
  }, Object.fromEntries(seed.map((u) => [u, 0])) as Record<string, number>);

  const visitedUrls = result.visitedUrls ?? [];
  return {
    pagesVisited: result.pagesVisited,
    visitedUrls,
    // Raw DOM occurrences, and the distinct findings behind them.
    bugsFound: all.length,
    distinctBugs: distinct.length,
    duration: result.duration,
    returned: shown.length,
    offset: start,
    // Stated, not implied. The previous shape reported a count it did
    // not deliver and gave no way to ask for the rest.
    ...(start + shown.length < distinct.length
      ? {
          omitted: distinct.length - (start + shown.length),
          omittedNote: `Showing ${shown.length} of ${distinct.length} distinct bugs, worst first. Re-run with offset=${start + shown.length} for the next page, or raise limit. The breakdowns below cover ALL findings, not just the ones shown.`,
        }
      : {}),
    // Composition of everything found, so a truncated list cannot
    // misrepresent the shape of the result. Every visited page is listed,
    // clean ones at 0.
    byPage: tally(distinct, "url", visitedUrls),
    byType: tally(distinct, "type"),
    bySeverity: tally(distinct, "severity"),
    bugs: shown.map(bug => ({
      type: bug.type,
      severity: bug.severity,
      description: bug.description,
      url: bug.url,
      selector: bug.selector,
      ...(bug.occurrences > 1
        ? { occurrences: bug.occurrences, allSelectors: bug.selectors }
        : {}),
      recommendation: bug.recommendation,
    })),
  };
}
