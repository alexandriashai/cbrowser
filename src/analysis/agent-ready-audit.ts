/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */


/**
 * Agent-Ready Audit Module
 *
 * Analyzes a site and outputs specific recommendations to make it AI-agent-friendly.
 * Flips CBrowser's "workaround" detections into "fix this" recommendations.
 */

import { type Page, type Browser } from "playwright";
import { VERSION } from "../version.js";
import { CBrowser } from "../browser.js";
import { navigationError } from "../navigation-errors.js";
import { launchWithLightpandaFallback, isLightpandaConfigured } from "../lightpanda.js";
import type {
  AgentReadyAuditResult,
  AgentReadyIssue,
  AgentReadyRecommendation,
  AgentReadyScore,
  AgentReadySummary,
  AgentReadyGrade,
  AgentReadyAuditOptions,
  AgentReadyIssueCategory,
  AgentReadyIssueSeverity,
} from "../types.js";

// ============================================================================
// Scoring Methodology & Disclaimers
// ============================================================================

/**
 * METHODOLOGY DISCLAIMER:
 *
 * Agent-Ready scores are HEURISTIC estimates based on pattern detection,
 * not precise measurements of AI agent compatibility.
 *
 * Scoring approach:
 * - Each detected issue deducts points based on severity
 * - Severity levels align with Nielsen's usability severity scale (0-4)
 * - Category weights reflect typical agent interaction patterns
 *
 * Research basis:
 * - WCAG 2.1 compliance thresholds (94.8% of sites have failures - WebAIM)
 * - Touch target minimums: 44x44px (WCAG 2.5.5/2.5.8)
 * - Screen reader success rates: ~55% task completion (WebAIM survey)
 *
 * Interpretation:
 * - A/B grades: Site works well with AI agents
 * - C grade: Some issues, agents may need workarounds
 * - D/F grades: Significant barriers to agent automation
 *
 * Use letter grades (not percentage scores) for clearer communication.
 */

// ============================================================================
// Scoring Algorithm
// ============================================================================

/**
 * Severity penalties calibrated to Nielsen's usability severity scale:
 * - Critical (4): Prevents task completion entirely
 * - High (3): Major problem, difficult workaround
 * - Medium (2): Minor problem, easy workaround
 * - Low (1): Cosmetic issue, minimal impact
 */
const SEVERITY_PENALTY: Record<AgentReadyIssueSeverity, number> = {
  critical: 25,  // ~Nielsen Level 4 - complete blocker
  high: 15,      // ~Nielsen Level 3 - major obstacle
  medium: 8,     // ~Nielsen Level 2 - minor problem
  low: 3,        // ~Nielsen Level 1 - cosmetic
};

/**
 * Category weights based on typical AI agent interaction priorities:
 * - Findability (35%): Can the agent locate elements? Most critical for automation
 * - Stability (30%): Will selectors remain stable across page loads?
 * - AgentPerceivability (20%): ARIA labels provide semantic meaning for agents
 *   (renamed from Accessibility -- it measures machine-perceivability, not WCAG)
 * - Semantics (15%): Proper HTML structure aids understanding
 */
const CATEGORY_WEIGHTS: Record<AgentReadyIssueCategory, number> = {
  findability: 0.35,
  stability: 0.30,
  agentPerceivability: 0.20,
  semantics: 0.15,
};

/**
 * Refuse to grade a page the audit never actually saw.
 *
 * ## The bug this closes
 *
 * `calculateAgentReadyScore` starts every category at 100 and SUBTRACTS a
 * penalty per issue found. An empty DOM yields no issues, so no penalties, so
 * 100. The audit therefore awarded its BEST grade to pages it had entirely
 * failed to load.
 *
 * Measured 2026-08-04. `espn.com` returned `grade: "A"`, `overall: 94`,
 * `findability: 97`, `stability: 100` -- with `summary.totalElements === 0`.
 * Three different ESPN URLs (homepage, /nfl/scoreboard, /nba/standings) returned
 * byte-identical scores AND byte-identical issue lists, because the auditor was
 * looking at the same nothing each time. `curl` of the same URL returns HTTP
 * 403: ESPN blocks automated clients, the headless browser got a challenge page,
 * and the scorer read that as a flawless site. It also reported "Missing
 * semantic landmarks: main, nav" and "No OpenGraph meta tags" for a site that
 * has all three -- the tell that should have been caught, since those findings
 * describe the challenge page, not ESPN.
 *
 * ## Why it inverted the product's central claim
 *
 * Sites with the most aggressive bot protection are the sites AI agents struggle
 * with most. Those are exactly the sites that blocked the auditor and collected
 * an A for it. Against WebVoyager's published per-site agent success rates, the
 * April grades correlated at **r = -0.27** -- the wrong sign -- with ESPN the
 * worst site in that benchmark for agents (38.6%) while holding the top grade
 * here. An A had become a marker of bot-blocking.
 *
 * ## Why this throws rather than returning a low score
 *
 * A blocked page is not a bad page; it is an ABSENT measurement, and the two
 * must not be reported in the same units. Scoring it 0 would be as false as
 * scoring it 94: it would tell a customer their site is hostile to agents when
 * what happened is that our crawler could not get in. The honest output is no
 * grade at all, loudly.
 */
export function assertPageWasAudited(totalElements: number, url: string): void {
  if (totalElements > 0) return;
  throw new Error(
    `Agent-ready audit found 0 interactive elements at ${url}, so there is nothing to grade.\n\n` +
    `This almost always means the page did not load for the auditor -- bot detection, a CAPTCHA ` +
    `or consent interstitial, a login wall, or a navigation that resolved to about:blank.\n\n` +
    `No grade is returned on purpose. The scorer starts at 100 and deducts per issue found, so an ` +
    `empty page scores as a perfect one; returning that number reports a blocked crawl as an A.\n\n` +
    `Try: --lightpanda, a different geo region, or an interior URL not behind the interstitial.`,
  );
}

export function calculateAgentReadyScore(issues: AgentReadyIssue[]): AgentReadyScore {
  // Start with perfect scores.
  //
  // Deduct-from-100 is why `assertPageWasAudited` above must run BEFORE this: on
  // an empty page there is nothing to deduct for, and silence scores as
  // perfection. Never call this without that guard.
  const scores: Record<AgentReadyIssueCategory, number> = {
    findability: 100,
    stability: 100,
    agentPerceivability: 100,
    semantics: 100,
  };

  // Deduct based on issues.
  //
  // The deprecated "accessibility" category is gone from the union, but an issue
  // constructed by an older caller can still arrive carrying it at runtime —
  // types do not survive a JSON boundary. Mapped rather than dropped: an unknown
  // category would index nothing, `undefined - penalty` is NaN, and NaN
  // propagates into `overall` as a broken score with nothing saying why.
  for (const issue of issues) {
    const penalty = SEVERITY_PENALTY[issue.severity];
    const cat = (issue.category as string) === "accessibility"
      ? "agentPerceivability" as const
      : issue.category;
    if (scores[cat] === undefined) continue; // unrecognised category scores nothing, silently is fine here
    scores[cat] = Math.max(0, scores[cat] - penalty);
  }

  // Calculate overall weighted score
  const overall = Math.round(
    scores.findability * CATEGORY_WEIGHTS.findability +
    scores.stability * CATEGORY_WEIGHTS.stability +
    scores.agentPerceivability * CATEGORY_WEIGHTS.agentPerceivability +
    scores.semantics * CATEGORY_WEIGHTS.semantics
  );

  return {
    overall,
    findability: Math.round(scores.findability),
    stability: Math.round(scores.stability),
    agentPerceivability: Math.round(scores.agentPerceivability),
    semantics: Math.round(scores.semantics),
  };
}

function calculateGrade(score: number): AgentReadyGrade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

// ============================================================================
// Detection Functions
// ============================================================================

interface DetectionContext {
  page: Page;
  issues: AgentReadyIssue[];
  summary: AgentReadySummary;
}

/**
 * Detect content that only exists after hydration.
 *
 * Every other check in this file inspects the live DOM, which is the DOM after
 * JavaScript has run. That is the right surface for most questions and the
 * wrong one for this: an audit that scores agent-readiness by driving a real
 * browser cannot see what a reader without a browser cannot see.
 *
 * Measured on cbrowser's own blog before this existed: 186KB of markup
 * carrying 554 characters of visible text against a 12,000-character article,
 * because the body was fetched client-side. The audit graded that route B. A
 * plain fetch, a crawler, and most agents got a page about nothing, and
 * nothing in the report said so.
 *
 * The check fetches the URL with no browser at all, strips script and style,
 * and compares visible text against what the hydrated page shows. A large
 * shortfall means the content is invisible to anyone not executing JavaScript.
 * (2026-08-01)
 */
async function detectClientOnlyContent(ctx: DetectionContext): Promise<void> {
  const { page, issues, summary } = ctx;

  const url = page.url();
  if (!/^https?:/i.test(url)) return;

  const hydratedChars: number = await page.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    return (main?.innerText ?? "").replace(/\s+/g, " ").trim().length;
  });
  // Nothing to compare against on a page that is legitimately near-empty.
  if (hydratedChars < 400) return;

  let rawChars = 0;
  let fetched = false;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "cbrowser-agent-ready-audit/1.0 (no-js probe)" },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const html = await res.text();
      rawChars = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&[a-z#0-9]+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim().length;
      fetched = true;
    }
  } catch {
    // A probe that cannot run reports nothing rather than guessing. Claiming
    // a page is fine because the check failed is the failure mode this whole
    // detector exists to prevent.
    return;
  }
  if (!fetched) return;

  const ratio = rawChars / hydratedChars;
  if (ratio >= 0.4) return;

  const pct = Math.round(ratio * 100);
  const severity: AgentReadyIssueSeverity = ratio < 0.15 ? "critical" : "high";
  issues.push({
    category: "findability",
    severity,
    element: "document",
    description:
      `Page content is only present after JavaScript runs: a plain fetch returns ${rawChars} characters of visible text against ${hydratedChars} in the rendered page (${pct}%). ` +
      `Agents, crawlers and any reader that does not execute JavaScript see a shell.`,
    detectionMethod: "no-JS fetch compared against the rendered DOM",
    recommendation:
      "Server-render the primary content, or pre-render it at build time, so it is present in the initial HTML. " +
      "Client-side fetching is fine for updates and personalisation; it should not be the only way the main content exists.",
  });
  summary.problematicElements++;
}

/**
 * Detect elements without proper labels (findability)
 */
async function detectUnlabeledElements(ctx: DetectionContext): Promise<void> {
  const { page, issues, summary } = ctx;

  // Find buttons without accessible names
  const unlabeledButtons = await page.$$eval(
    'button:not([aria-label]):not([aria-labelledby]), [role="button"]:not([aria-label]):not([aria-labelledby])',
    (elements) => elements.map(el => ({
      selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.className ? `.${String((el.className as unknown as { baseVal?: string })?.baseVal ?? el.className ?? "").split(' ')[0]}` : ''),
      text: el.textContent?.trim() || '',
      html: el.outerHTML.slice(0, 200),
      tag: el.tagName.toLowerCase(),
      attributes: Array.from(el.attributes).map(a => [a.name, a.value] as [string, string]),
    })).filter(el => !el.text) // Only those without visible text
  );

  for (const btn of unlabeledButtons) {
    issues.push({
      category: "findability",
      severity: "high",
      element: btn.selector,
      description: `Button without accessible text or aria-label`,
      detectionMethod: "button-label-check",
      recommendation: "Add aria-label or visible text to the button",
      // The flagged element's own tag, with the aria-label added. Was the
      // literal `<button aria-label="Describe action here">...</button>` for
      // every finding. (2026-10-09)
      codeExample: VOID_ELEMENTS.has(btn.tag)
        ? rebuildOpenTag(btn.tag, btn.attributes, { 'aria-label': NAMELESS_LABEL_PLACEHOLDER })
        : `${rebuildOpenTag(btn.tag, btn.attributes, { 'aria-label': NAMELESS_LABEL_PLACEHOLDER })}<!-- existing content unchanged --></${btn.tag}>`,
    });
    summary.elementsWithoutText++;
  }

  // Find inputs without labels
  const unlabeledInputs = await page.$$eval(
    'input:not([aria-label]):not([aria-labelledby]):not([type="hidden"]):not([type="submit"]):not([type="button"])',
    (elements) => elements.map(el => {
      const input = el as HTMLInputElement;
      const id = input.id;
      // Check if there's an associated label
      const hasLabel = id && document.querySelector(`label[for="${id}"]`);
      return {
        selector: `input${id ? `#${id}` : ''}[type="${input.type || 'text'}"]`,
        type: input.type || 'text',
        name: input.name,
        placeholder: input.placeholder,
        hasLabel: !!hasLabel,
      };
    }).filter(el => !el.hasLabel && !el.placeholder)
  );

  for (const input of unlabeledInputs) {
    issues.push({
      category: "agentPerceivability",
      severity: "medium",
      element: input.selector,
      description: `Input field without label or aria-label`,
      detectionMethod: "input-label-check",
      recommendation: "Add <label for=\"id\"> or aria-label attribute",
      codeExample: `<label for="${input.name || 'field'}">Label text</label>\n<input id="${input.name || 'field'}" ... />`,
    });
    summary.missingAriaLabels++;
  }
}

/**
 * Detect hidden inputs with custom UI (stability)
 */
async function detectHiddenInputs(ctx: DetectionContext): Promise<void> {
  const { page, issues, summary } = ctx;

  // Find visually hidden selects (custom dropdowns)
  const hiddenSelects = await page.$$eval('select', (elements) =>
    elements.map(el => {
      const rect = el.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      const isHidden =
        rect.width === 0 ||
        rect.height === 0 ||
        styles.opacity === '0' ||
        styles.visibility === 'hidden' ||
        styles.position === 'absolute' && rect.width < 2;
      return {
        selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.name ? `[name="${el.name}"]` : ''),
        isHidden,
        name: el.name,
      };
    }).filter(el => el.isHidden)
  );

  for (const select of hiddenSelects) {
    issues.push({
      category: "stability",
      severity: "high",
      element: select.selector,
      description: "Hidden select with custom UI - agents may not find options",
      detectionMethod: "hidden-select-check",
      recommendation: "Add aria-expanded, role=\"listbox\" to custom dropdown, or make native select visible",
      codeExample: `<div role="listbox" aria-expanded="false" aria-label="Select option">\n  <div role="option" aria-selected="true">Option 1</div>\n</div>`,
    });
    summary.hiddenInputs++;
    summary.customDropdowns++;
  }

  // Find hidden file inputs
  const hiddenFileInputs = await page.$$eval('input[type="file"]', (elements) =>
    elements.map(el => {
      const rect = el.getBoundingClientRect();
      const styles = window.getComputedStyle(el);
      const isHidden =
        rect.width < 2 ||
        rect.height < 2 ||
        styles.opacity === '0' ||
        styles.visibility === 'hidden';
      return {
        selector: `input[type="file"]${el.id ? `#${el.id}` : ''}`,
        isHidden,
      };
    }).filter(el => el.isHidden)
  );

  for (const input of hiddenFileInputs) {
    issues.push({
      category: "stability",
      severity: "medium",
      element: input.selector,
      description: "Hidden file input - agents must trigger it via label or button",
      detectionMethod: "hidden-file-input-check",
      recommendation: "Ensure the trigger element has for=\"input-id\" or aria-controls",
      codeExample: `<label for="file-upload" tabindex="0" role="button">Upload File</label>\n<input type="file" id="file-upload" />`,
    });
    summary.hiddenInputs++;
  }
}

/**
 * Ignore slivers: tracking pixels, 1px rules, zero-size wrappers. Anything a
 * pointer could plausibly land on is counted.
 */
const STICKY_MIN_DIMENSION_PX = 8;
/** A sticky element spanning at least this share of the viewport width is a bar. */
const STICKY_BAR_WIDTH_RATIO = 0.5;
/** Height at which a sticky element can hide a scroll target behind itself. */
const STICKY_OCCLUDING_HEIGHT_PX = 56;

/**
 * Detect sticky/fixed elements that may intercept clicks.
 *
 * `summary.stickyOverlays` COUNTS WHAT IS THERE. It used to count only the
 * subset large enough to raise an issue, which is a different question wearing
 * the same name, and on a real page the two answers were 0 and 4.
 *
 * Measured on cbrowser.ai, 1280x800: a sticky `<header>` 57px tall and three
 * fixed control buttons at 44, 44 and 40px. The old code filtered to
 * `height > 40` and then flagged `height > 60`, so every one of them fell into
 * the 40-60 gap and was discarded TWICE. The audit reported `stickyOverlays: 0`
 * on a page with a sticky header and three floating buttons, and the 40px button
 * never even survived the first filter -- a boundary that excludes an element of
 * exactly the boundary size.
 *
 * The two questions are now separated, because they have different right
 * answers:
 *
 *   summary.stickyOverlays  -- how many sticky/fixed elements exist (a FACT)
 *   issues[]                -- which of them can obstruct an agent (a JUDGEMENT)
 *
 * The judgement is no longer height alone. What makes a sticky element an
 * obstruction is covering something: a full-width bar occludes a whole band of
 * the page whatever its height (the 57px header is the case in point, and
 * `scroll-margin-top` exists precisely for it), while a 44px corner button
 * occludes 44px of corner. Height alone flagged the second and missed the first.
 * (2026-08-05)
 */
export async function detectStickyOverlays(ctx: DetectionContext): Promise<void> {
  const { page, issues, summary } = ctx;

  const stickyElements = await page.$$eval('*', (elements, minPx: number) => {
    const results: Array<{
      selector: string;
      position: string;
      zIndex: number;
      height: number;
      width: number;
      viewportWidth: number;
      isHeader: boolean;
      isFooter: boolean;
    }> = [];

    for (const el of elements) {
      const styles = window.getComputedStyle(el);
      const position = styles.position;

      if (position === 'fixed' || position === 'sticky') {
        const rect = el.getBoundingClientRect();
        // Invisible elements cannot intercept a click and are not overlays.
        if (styles.visibility === 'hidden' || styles.display === 'none' || styles.opacity === '0') continue;
        if (rect.width < minPx || rect.height < minPx) continue;
        const zIndex = parseInt(styles.zIndex) || 0;
        if (zIndex < 0) continue; // painted behind content
        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : '';
        const className = el.className && typeof el.className === 'string'
          ? `.${String((el.className as unknown as { baseVal?: string })?.baseVal ?? el.className ?? "").split(' ')[0]}`
          : '';

        results.push({
          selector: tag + id + className,
          position,
          zIndex,
          height: rect.height,
          width: rect.width,
          viewportWidth: window.innerWidth,
          isHeader: rect.top < 100,
          isFooter: rect.bottom > window.innerHeight - 100,
        });
      }
    }

    return results;
  }, STICKY_MIN_DIMENSION_PX);

  // The count is every sticky/fixed element found, not the flagged subset.
  summary.stickyOverlays = stickyElements.length;

  for (const sticky of stickyElements) {
    const isBar = sticky.viewportWidth > 0
      && sticky.width >= sticky.viewportWidth * STICKY_BAR_WIDTH_RATIO;
    const isTall = sticky.height >= STICKY_OCCLUDING_HEIGHT_PX;
    if (!isBar && !isTall) continue;

    issues.push({
      category: "stability",
      severity: sticky.zIndex > 100 ? "high" : "medium",
      element: sticky.selector,
      description: `${sticky.position} element may intercept clicks `
        + `(z-index: ${sticky.zIndex}, ${Math.round(sticky.width)}x${Math.round(sticky.height)}px`
        + `${isBar ? ", spans the viewport width" : ""})`,
      detectionMethod: "sticky-element-check",
      recommendation: "Add scroll-margin-top to target elements, or ensure proper z-index layering",
      codeExample: sticky.isHeader
        ? `/* Add to elements that sticky header might cover */\n.target-element {\n  scroll-margin-top: ${Math.round(sticky.height) + 20}px;\n}`
        : `/* Ensure modal/overlay has backdrop to prevent accidental clicks */`,
    });
  }
}

/**
 * Detect div/span with onclick but no button semantics
 */
async function detectClickableDivs(ctx: DetectionContext): Promise<void> {
  const { page, issues } = ctx;

  const clickableDivs = await page.$$eval(
    'div[onclick], span[onclick], div[data-action], span[data-action], [style*="cursor: pointer"]:not(button):not(a):not([role="button"])',
    (elements) => elements.map(el => ({
      selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.className && typeof el.className === 'string' ? `.${String((el.className as unknown as { baseVal?: string })?.baseVal ?? el.className ?? "").split(' ')[0]}` : ''),
      hasOnclick: el.hasAttribute('onclick'),
      hasRole: el.hasAttribute('role'),
      text: el.textContent?.trim().slice(0, 50) || '',
    })).filter(el => !el.hasRole)
  );

  for (const div of clickableDivs) {
    issues.push({
      category: "semantics",
      severity: "medium",
      element: div.selector,
      description: `Clickable ${div.selector.split('.')[0]} without button role`,
      detectionMethod: "clickable-div-check",
      recommendation: "Replace with <button> or add role=\"button\" and tabindex=\"0\"",
      codeExample: `<!-- Better: use semantic button -->\n<button onclick="...">${div.text || 'Action'}</button>\n\n<!-- If div is needed: -->\n<div role="button" tabindex="0" onclick="..." onkeydown="if(event.key==='Enter')...">${div.text || 'Action'}</div>`,
    });
  }
}

/**
 * Detect images without alt text
 */
async function detectMissingAltText(ctx: DetectionContext): Promise<void> {
  const { page, issues, summary } = ctx;

  const imagesWithoutAlt = await page.$$eval('img:not([alt])', (elements) =>
    elements.map(el => {
      const imgEl = el as HTMLImageElement;
      return {
        selector: `img${imgEl.id ? `#${imgEl.id}` : ''}[src="${imgEl.src.slice(0, 50)}..."]`,
        src: imgEl.src,
        isDecorative: imgEl.width < 20 || imgEl.height < 20,
        attributes: Array.from(el.attributes).map(a => [a.name, a.value] as [string, string]),
      };
    }).filter(el => !el.isDecorative)
  );

  for (const img of imagesWithoutAlt) {
    issues.push({
      category: "agentPerceivability",
      severity: "medium",
      element: img.selector,
      description: "Image without alt text",
      detectionMethod: "img-alt-check",
      recommendation: "Add descriptive alt text, or alt=\"\" if decorative",
      // The flagged <img> as the page has it, with alt added. (2026-10-09)
      codeExample: rebuildOpenTag("img", img.attributes, { alt: "Describe the image, or empty if decorative" }),
    });
    summary.missingAriaLabels++;
  }
}

/**
 * Detect links without href or with javascript: href
 */
async function detectBadLinks(ctx: DetectionContext): Promise<void> {
  const { page, issues } = ctx;

  const badLinks = await page.$$eval(
    'a:not([href]), a[href=""], a[href="#"], a[href^="javascript:"]',
    (elements) => elements.map(el => ({
      selector: `a${el.id ? `#${el.id}` : ''}`,
      // Display copy only. fullText is what the code example must use, or the
      // suggested markup silently shortens the link's visible label.
      text: el.textContent?.trim().slice(0, 30) || '',
      fullText: el.textContent?.trim().slice(0, 200) || '',
      // Real markup for the patch's `before`. Captured here because this is
      // where DOM access legitimately happens; patch templates are pure.
      outerHTML: (el.outerHTML || '').slice(0, 600),
      outerHTMLTruncated: (el.outerHTML || '').length > 600,
      href: el.getAttribute('href') || '',
    }))
  );

  for (const link of badLinks) {
    issues.push({
      category: "semantics",
      severity: "low",
      element: link.selector,
      description: `Link with ${link.href ? 'javascript:' : 'no'} href acts as button`,
      elementHtml: link.outerHTML,
      elementHtmlTruncated: link.outerHTMLTruncated,
      detectionMethod: "link-href-check",
      recommendation: "Use <button> for actions, <a href> for navigation",
      codeExample: `<!-- For actions, use button: -->\n<button onclick="...">${link.fullText || 'Action'}</button>\n\n<!-- For navigation, use proper href: -->\n<a href="/path">${link.fullText || 'Link'}</a>`,
    });
  }
}

/** Fill-in label, used ONLY for an element that has no accessible name at all. */
const NAMELESS_LABEL_PLACEHOLDER = "Describe the action";

/** Elements with no closing tag; [role="button"] can land on any of them. */
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
]);

/**
 * Attribute values longer than this are elided in a suggested example, keeping
 * the first EXAMPLE_ATTR_HEAD characters and saying how many were left out.
 * Copying every value verbatim turned one <a href="data:text/csv;base64,..."> on
 * a fixture into a 200,092-char codeExample, sent three times over (example,
 * recommendation snippet, patch "after"): the audit JSON went from 6,292 to
 * 406,336 bytes. elementHtml is capped at 600 for the same reason. (2026-10-07)
 */
const EXAMPLE_ATTR_MAX = 200;
const EXAMPLE_ATTR_HEAD = 80;

/** Attribute values are quoted, so any quote or angle bracket in page text would otherwise emit malformed HTML. */
const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeText = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** The marker is plain text inside the quotes, so the example stays valid markup and nobody mistakes the cut value for the real one. */
const elideAttr = (v: string) => v.length > EXAMPLE_ATTR_MAX
  ? `${v.slice(0, EXAMPLE_ATTR_HEAD)}[...${v.length - EXAMPLE_ATTR_HEAD} more characters unchanged]`
  : v;

/**
 * An element's REAL opening tag, with the `set` attributes replaced in place
 * (or appended when the element does not have them). Every other attribute is
 * kept as the page has it, long values elided. Used by the examples that used
 * to be canned literals: a finding about a specific element should show THAT
 * element, not a generic <button>. (2026-10-09)
 */
function rebuildOpenTag(tag: string, attributes: Array<[string, string]>, set: Record<string, string> = {}): string {
  const pending = new Map(Object.entries(set));
  const parts = attributes.map(([name, value]) => {
    if (pending.has(name)) {
      const replacement = pending.get(name)!;
      pending.delete(name);
      return ` ${name}="${escapeAttr(replacement)}"`;
    }
    return ` ${name}="${escapeAttr(elideAttr(value))}"`;
  });
  for (const [name, value] of pending) parts.push(` ${name}="${escapeAttr(value)}"`);
  return `<${tag}${parts.join('')}>`;
}

/** Longest suggested data-testid. */
const TESTID_MAX = 40;

/**
 * A data-testid slug for an accessible name, at most TESTID_MAX characters,
 * cut at a word boundary.
 *
 * It was a hard substring(0, 40), so "Sign up for Pro and get 500 bonus
 * credits free" became "sign-up-for-pro-and-get-500-bonus-credit": a testid
 * that names a word the page does not contain. Now the cut lands on the last
 * hyphen inside the limit ("...-500-bonus"), and falls back to a hard cut only
 * for a single word longer than the limit.
 */
export function slugifyTestId(text: string): string {
  const s = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  if (s.length <= TESTID_MAX) return s;
  // One character past the limit: if it is a hyphen, the first TESTID_MAX
  // characters already end on a whole word.
  const head = s.slice(0, TESTID_MAX + 1);
  const cut = head.lastIndexOf('-');
  return (cut > 0 ? head.slice(0, cut) : s.slice(0, TESTID_MAX)).replace(/-+$/, '');
}

/** What detectLowFindabilityElements captures about an element to suggest markup for it. */
interface FindabilityElement {
  tag: string;
  /** The element's own attributes, in document order, exactly as the page has them. */
  attributes: Array<[string, string]>;
  /**
   * aria-label > aria-labelledby text > rendered text > img alt > input value >
   * text > title; "" when it has none.
   */
  accessibleName: string;
  fullText: string;
  textTruncated: boolean;
  hasElementChildren: boolean;
}

/**
 * Suggested markup for a findability finding: the element's REAL opening tag
 * with one attribute added, data-testid.
 *
 * Measured 2026-10-06 on cbrowser.ai: this example was built from textContent
 * alone, so an icon button named aria-label="Previous slide" came back as
 *   <button data-testid="button" aria-label="button action">...</button>
 * which deletes the real name and every other attribute. remediation_patches
 * then shipped that as the fix. Now nothing the element already has is
 * dropped or overridden. An aria-label is added only when the element has no
 * accessible name from any source, because a placeholder aria-label on a link
 * named by its <img alt> or title REPLACES that name. (2026-10-07)
 */
function buildFindabilityCodeExample(el: FindabilityElement, usedTestIds: Set<string>): string {
  const attr = escapeAttr;
  // A testid is a slug, so shortening THIS is correct and expected; it is cut
  // at a word boundary (slugifyTestId).
  const slug = slugifyTestId;

  const name = el.accessibleName.trim();
  // Two elements that share a name are flagged precisely because they are
  // ambiguous; giving both the same testid would leave them ambiguous.
  const base = slug(name) || slug(NAMELESS_LABEL_PLACEHOLDER);
  let testId = base;
  for (let n = 2; usedTestIds.has(testId); n++) testId = `${base}-${n}`;
  usedTestIds.add(testId);

  const shown = elideAttr;

  let hasAriaLabelAttr = false;
  const kept = el.attributes.map(([attrName, value]) => {
    if (attrName === 'aria-label') {
      hasAriaLabelAttr = true;
      // aria-label="   " names nothing. Fill it in place rather than appending
      // a second aria-label, which is invalid markup.
      if (!value.trim() && !name) return ` aria-label="${attr(NAMELESS_LABEL_PLACEHOLDER)}"`;
    }
    return ` ${attrName}="${attr(shown(value))}"`;
  }).join('');
  const addedLabel = !name && !hasAriaLabelAttr ? ` aria-label="${attr(NAMELESS_LABEL_PLACEHOLDER)}"` : '';
  const open = `<${el.tag} data-testid="${attr(testId)}"${kept}${addedLabel}>`;
  if (VOID_ELEMENTS.has(el.tag)) return open;

  // Built from fullText, not the 30-char display copy. Using the truncated
  // text here produced a patch that REWROTE the element's visible content:
  //   <a data-testid="sign-up-for-pro-and-get-500-bo"
  //      aria-label="Sign up for Pro and get 500 bo">Sign up for Pro and get 500 bo</a>
  // Applying that silently amputates the link label on the live page. The
  // recommendation is "add a data-testid", so the example must leave the
  // content exactly as it is. (2026-07-29) Content with child elements (an
  // icon, an <img>, a card's heading + paragraph) is not flattened to text
  // either; it is left alone. (2026-10-07)
  const body = el.hasElementChildren || el.textTruncated
    ? '<!-- existing content unchanged -->'
    : el.fullText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `${open}${body}</${el.tag}>`;
}

/**
 * Detect elements only findable by fuzzy/visual match
 */
async function detectLowFindabilityElements(ctx: DetectionContext): Promise<void> {
  const { page, issues, summary } = ctx;

  // Check for buttons/links that lack good selectors
  const poorSelectors = await page.$$eval(
    'button, a, [role="button"]',
    (elements) => {
      // Trimmed: aria-label="   " is not a name and is not a hook.
      const ariaLabel = (e: Element) => (e.getAttribute('aria-label') || '').trim();
      // aria-labelledby ids resolve in the element's OWN tree: a button in an
      // open shadow root is labelled by an id in that shadow root, which
      // document.getElementById cannot see. (2026-10-07)
      const byId = (e: Element, id: string): Element | null => {
        const root = e.getRootNode() as Document | DocumentFragment;
        return typeof root.getElementById === 'function' ? root.getElementById(id) : null;
      };
      // aria-label first, then aria-labelledby resolved to text: the order the
      // accessible-name computation that find_element_by_intent matches on reads
      // them (natural-language.ts accName, inside the page-side picker).
      const ariaName = (e: Element): string => {
        const label = ariaLabel(e);
        if (label) return label;
        const ids = (e.getAttribute('aria-labelledby') || '').trim();
        if (!ids) return '';
        return ids.split(/\s+/)
          .map(id => byId(e, id)?.textContent || '')
          .join(' ').replace(/\s+/g, ' ').trim();
      };
      const nameKey = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
      // An ARIA name is a stable hook only when it picks out ONE element:
      // two buttons both labelled "Add to cart" match [aria-label="Add to cart"]
      // twice, which is exactly the ambiguity this check exists to report.
      // Counted across open shadow roots too: the elements scored here come
      // from $$eval, which pierces them, and so does a Playwright
      // [aria-label="..."] lookup, so a light-DOM and a shadow-DOM "Open menu"
      // are ambiguous to an agent. (2026-10-07)
      const ariaNameCounts = new Map<string, number>();
      const countAriaNames = (root: Document | ShadowRoot) => {
        for (const e of Array.from(root.querySelectorAll('[aria-label], [aria-labelledby]'))) {
          const k = nameKey(ariaName(e));
          if (k) ariaNameCounts.set(k, (ariaNameCounts.get(k) || 0) + 1);
        }
        for (const host of Array.from(root.querySelectorAll('*'))) {
          if (host.shadowRoot) countAriaNames(host.shadowRoot);
        }
      };
      countAriaNames(document);

      return elements.map(el => {
        const hasId = !!el.id;
        const hasTestId = el.hasAttribute('data-testid') || el.hasAttribute('data-test') || el.hasAttribute('data-cy');
        const aria = ariaName(el);
        const ariaIsUnique = !!aria && ariaNameCounts.get(nameKey(aria)) === 1;
        const hasName = el.hasAttribute('name');
        const hasGoodClass = el.className && typeof el.className === 'string' &&
          /btn|button|cta|submit|action/i.test(el.className);
        const text = el.textContent?.trim() || '';

        // Score how findable this element is.
        // A unique aria-label weighs the same as id and data-testid. It was 2,
        // so an icon button named aria-label="Previous slide" scored 2/10 and
        // was flagged, while find_element_by_intent resolves it on its first
        // rung at 0.95 (the exact accessible-name match, natural-language.ts
        // cascade) and emits a tag[aria-label=".."] selector ahead of testid and
        // id. A name shared with another
        // element keeps its OLD weight, aria-label 2 and aria-labelledby 0 (it
        // was never scored), so a duplicate is flagged exactly as before.
        // Giving a shared aria-labelledby 2 stopped flagging two text buttons
        // labelled by the same "Edit profile" span. (2026-10-07)
        const findabilityScore =
          (hasId ? 3 : 0) +
          (hasTestId ? 3 : 0) +
          (ariaIsUnique ? 3 : ariaLabel(el) ? 2 : 0) +
          (hasName ? 2 : 0) +
          (hasGoodClass ? 1 : 0) +
          (text.length > 0 && text.length < 50 ? 2 : 0);

        // The element's accessible name from every source, so the suggested
        // markup never invents a name for an element that already has one.
        const imgAlt = [el, ...Array.from(el.querySelectorAll('img'))]
          .filter(e => e.tagName === 'IMG')
          .map(e => (e.getAttribute('alt') || '').trim())
          .find(Boolean) || '';
        const title = (el.getAttribute('title') || '').trim();
        // <input type="submit" value="Send feedback"> is named by its value, a
        // submit or reset input without one by the browser's default label,
        // and an image input by its alt. Missing this put a placeholder
        // aria-label over value="Send feedback". (2026-10-07)
        const inputName = (() => {
          if (el.tagName !== 'INPUT') return '';
          const type = (el.getAttribute('type') || '').toLowerCase();
          if (type === 'image') return (el.getAttribute('alt') || '').trim();
          if (type !== 'submit' && type !== 'reset' && type !== 'button') return '';
          return (el.getAttribute('value') || '').trim() ||
            (type === 'submit' ? 'Submit' : type === 'reset' ? 'Reset' : '');
        })();
        // innerText keeps a card's "Heading" and "Description" apart, where
        // textContent glues them into "HeadingDescription".
        const rendered = ((el as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim();
        // Rendered text beats img alt: in a list of user cards every
        // <a><img alt="Avatar"> Jane Doe</a> has the same alt, so ranking alt
        // first made every testid "avatar", "avatar-2", ... where base gave
        // "jane-doe". alt still names a link that has no text (a logo).
        // title is last, as in the accessible-name computation: it names an
        // element only when the content does not. <a title="a > b">Short link</a>
        // is "Short link", and its testid must be "short-link", not "a-b".
        const accessibleName = aria || rendered || imgAlt || inputName || text || title;

        return {
          selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
          tag: el.tagName.toLowerCase(),
          attributes: Array.from(el.attributes).map(a => [a.name, a.value] as [string, string]),
          accessibleName: accessibleName.slice(0, 200),
          hasElementChildren: el.children.length > 0,
          // Truncated copy, for human-readable descriptions ONLY. Never build
          // suggested markup from this — see fullText. (2026-07-29)
          text: text.slice(0, 30),
          // The real text, for code examples. Capped generously to bound payload
          // size without amputating a normal link label.
          fullText: text.slice(0, 200),
          textTruncated: text.length > 200,
          outerHTML: (el.outerHTML || '').slice(0, 600),
          outerHTMLTruncated: (el.outerHTML || '').length > 600,
          findabilityScore,
          suggestions: {
            needsId: !hasId,
            needsTestId: !hasTestId,
            needsAriaLabel: !accessibleName,
          },
        };
      }).filter(el => el.findabilityScore < 3);
    }
  );

  const usedTestIds = new Set<string>();
  for (const el of poorSelectors.slice(0, 10)) { // Limit to avoid noise
    issues.push({
      category: "findability",
      severity: "low",
      element: el.selector,
      description: `Element lacks stable selectors (score: ${el.findabilityScore}/10)`,
      elementHtml: el.outerHTML,
      elementHtmlTruncated: el.outerHTMLTruncated,
      detectionMethod: "findability-score-check",
      recommendation: el.suggestions.needsTestId
        ? "Add data-testid for stable automation selectors"
        : el.suggestions.needsAriaLabel
          ? "Add aria-label for accessibility and findability"
          : "Add unique id or data-testid",
      codeExample: buildFindabilityCodeExample(el, usedTestIds),
    });
  }

  summary.totalElements += poorSelectors.length;
}

// ============================================================================
// AI-Specific Detection Functions (v17.0.0)
// ============================================================================

/**
 * Detect machine-readable metadata (JSON-LD, OpenGraph, Twitter Cards, landmarks)
 * @since 17.0.0
 */
async function detectMachineMetadata(ctx: DetectionContext): Promise<void> {
  const { page, issues, summary } = ctx;

  const metadata = await page.evaluate(() => {
    // Check for JSON-LD
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    const hasJsonLd = jsonLdScripts.length > 0;
    let jsonLdValid = true;
    jsonLdScripts.forEach(script => {
      try {
        JSON.parse(script.textContent || '');
      } catch {
        jsonLdValid = false;
      }
    });

    // Check for OpenGraph tags
    const ogTags = document.querySelectorAll('meta[property^="og:"]');
    const hasOg = ogTags.length > 0;
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');

    // Check for Twitter Cards
    const twitterTags = document.querySelectorAll('meta[name^="twitter:"]');
    const hasTwitter = twitterTags.length > 0;

    // Check for semantic landmarks
    const hasMain = !!document.querySelector('main, [role="main"]');
    const hasNav = !!document.querySelector('nav, [role="navigation"]');
    const hasHeader = !!document.querySelector('header, [role="banner"]');
    const hasFooter = !!document.querySelector('footer, [role="contentinfo"]');

    return {
      jsonLd: { present: hasJsonLd, valid: jsonLdValid, count: jsonLdScripts.length },
      og: { present: hasOg, hasTitle: !!ogTitle, hasDescription: !!ogDescription, count: ogTags.length },
      twitter: { present: hasTwitter, count: twitterTags.length },
      landmarks: { main: hasMain, nav: hasNav, header: hasHeader, footer: hasFooter },
    };
  });

  // Track metadata count
  let metadataCount = 0;
  if (metadata.jsonLd.present) metadataCount++;
  if (metadata.og.present) metadataCount++;
  if (metadata.twitter.present) metadataCount++;
  summary.machineMetadataCount = metadataCount;

  // Report missing JSON-LD
  if (!metadata.jsonLd.present) {
    issues.push({
      category: "semantics",
      severity: "medium",
      subcategory: "machine-metadata",
      element: "head",
      description: "No JSON-LD structured data found",
      detectionMethod: "json-ld-check",
      recommendation: "Add JSON-LD schema markup for better AI agent understanding",
      codeExample: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "Page Title",
  "description": "Page description"
}
</script>`,
    });
  } else if (!metadata.jsonLd.valid) {
    issues.push({
      category: "semantics",
      severity: "high",
      subcategory: "machine-metadata",
      element: "script[type='application/ld+json']",
      description: "Invalid JSON-LD (malformed JSON)",
      detectionMethod: "json-ld-check",
      recommendation: "Fix JSON syntax errors in structured data",
    });
  }

  // Report missing OpenGraph
  if (!metadata.og.present) {
    issues.push({
      category: "semantics",
      severity: "low",
      subcategory: "machine-metadata",
      element: "head",
      description: "No OpenGraph meta tags found",
      detectionMethod: "og-check",
      recommendation: "Add OpenGraph tags for better content previews",
      codeExample: `<meta property="og:title" content="Page Title">
<meta property="og:description" content="Page description">
<meta property="og:image" content="https://example.com/image.jpg">`,
    });
  }

  // Report missing landmarks
  const missingLandmarks: string[] = [];
  if (!metadata.landmarks.main) missingLandmarks.push("main");
  if (!metadata.landmarks.nav) missingLandmarks.push("nav");

  if (missingLandmarks.length > 0) {
    issues.push({
      category: "agentPerceivability",
      severity: "medium",
      subcategory: "machine-metadata",
      element: "body",
      description: `Missing semantic landmarks: ${missingLandmarks.join(", ")}`,
      detectionMethod: "landmark-check",
      recommendation: "Add semantic landmark elements for page structure",
      codeExample: `<header role="banner">...</header>
<nav role="navigation">...</nav>
<main role="main">...</main>
<footer role="contentinfo">...</footer>`,
    });
  }
}

/**
 * Detect navigation patterns (breadcrumbs, skip links, heading hierarchy)
 * @since 17.0.0
 */
async function detectNavigationPatterns(ctx: DetectionContext): Promise<void> {
  const { page, issues, summary } = ctx;

  const navPatterns = await page.evaluate(() => {
    // Check for breadcrumbs
    const breadcrumbNav = document.querySelector('nav[aria-label*="breadcrumb" i], nav[aria-label*="Breadcrumb" i], [role="navigation"][aria-label*="breadcrumb" i]');
    // Microdata only. A JSON-LD BreadcrumbList lives inside a
    // <script type="application/ld+json"> as TEXT, so no selector can see it and
    // sites that ship one were told "No breadcrumb navigation found" —
    // cbrowser.ai itself among them. (2026-07-29)
    const breadcrumbSchema = document.querySelector('[itemtype*="BreadcrumbList"]');

    const hasJsonLdBreadcrumb = (() => {
      const blocks = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      for (const block of blocks) {
        try {
          const parsed = JSON.parse(block.textContent || "");
          // A block may be one object, an array of them, or an @graph wrapper.
          const stack: unknown[] = [parsed];
          while (stack.length) {
            const node = stack.pop();
            if (!node || typeof node !== "object") continue;
            if (Array.isArray(node)) { stack.push(...node); continue; }
            const obj = node as Record<string, unknown>;
            const t = obj["@type"];
            if (t === "BreadcrumbList" || (Array.isArray(t) && t.includes("BreadcrumbList"))) return true;
            if (Array.isArray(obj["@graph"])) stack.push(...(obj["@graph"] as unknown[]));
          }
        } catch { /* a malformed block is not a breadcrumb */ }
      }
      return false;
    })();

    const hasBreadcrumbs = !!breadcrumbNav || !!breadcrumbSchema || hasJsonLdBreadcrumb;

    // Check for skip links
    const skipLinks = document.querySelectorAll('a[href^="#"]:first-child, a[href^="#main"], a[href^="#content"], .skip-link, .skip-to-content');
    const hasSkipLink = skipLinks.length > 0;

    // Check heading hierarchy
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    const headingLevels = headings.map(h => parseInt(h.tagName[1]));
    let hierarchyValid = true;
    let hierarchyIssue = '';
    const h1Count = headingLevels.filter(l => l === 1).length;

    if (h1Count === 0) {
      hierarchyValid = false;
      hierarchyIssue = 'No H1 found';
    } else if (h1Count > 1) {
      hierarchyValid = false;
      hierarchyIssue = `Multiple H1 elements (${h1Count})`;
    }

    // Check for skipped levels (e.g., h1 -> h3)
    for (let i = 1; i < headingLevels.length; i++) {
      if (headingLevels[i] > headingLevels[i - 1] + 1) {
        hierarchyValid = false;
        hierarchyIssue = `Skipped heading level (h${headingLevels[i - 1]} to h${headingLevels[i]})`;
        break;
      }
    }

    // Check page title
    const pageTitle = document.title?.trim();

    return {
      breadcrumbs: hasBreadcrumbs,
      skipLink: hasSkipLink,
      headings: { valid: hierarchyValid, issue: hierarchyIssue, count: headings.length },
      pageTitle: { present: !!pageTitle, length: pageTitle?.length || 0 },
    };
  });

  // Track navigation aids
  let navAidsCount = 0;
  if (navPatterns.breadcrumbs) navAidsCount++;
  if (navPatterns.skipLink) navAidsCount++;
  summary.navigationAidsCount = navAidsCount;

  // Report missing breadcrumbs (only for multi-page sites with depth)
  if (!navPatterns.breadcrumbs) {
    issues.push({
      category: "findability",
      severity: "low",
      subcategory: "navigation-patterns",
      element: "nav",
      description: "No breadcrumb navigation found",
      detectionMethod: "breadcrumb-check",
      recommendation: "Add breadcrumb navigation for hierarchical sites",
      codeExample: `<nav aria-label="Breadcrumb">
  <ol>
    <li><a href="/">Home</a></li>
    <li><a href="/section">Section</a></li>
    <li aria-current="page">Current Page</li>
  </ol>
</nav>`,
    });
  }

  // Report missing skip link
  if (!navPatterns.skipLink) {
    issues.push({
      category: "agentPerceivability",
      severity: "medium",
      subcategory: "navigation-patterns",
      element: "body",
      description: "No skip-to-content link found",
      detectionMethod: "skip-link-check",
      recommendation: "Add a skip link for keyboard navigation",
      codeExample: `<a href="#main-content" class="skip-link">Skip to main content</a>
<!-- CSS: .skip-link { position: absolute; left: -10000px; } .skip-link:focus { left: 0; } -->`,
    });
  }

  // Report heading hierarchy issues
  if (!navPatterns.headings.valid) {
    issues.push({
      category: "semantics",
      severity: "medium",
      subcategory: "navigation-patterns",
      element: "h1-h6",
      description: `Heading hierarchy issue: ${navPatterns.headings.issue}`,
      detectionMethod: "heading-hierarchy-check",
      recommendation: "Use a single H1 and maintain proper heading order (h1 → h2 → h3)",
    });
  }

  // Report missing or short page title
  if (!navPatterns.pageTitle.present) {
    issues.push({
      category: "findability",
      severity: "high",
      subcategory: "navigation-patterns",
      element: "title",
      description: "Page has no title",
      detectionMethod: "page-title-check",
      recommendation: "Add a descriptive <title> element",
    });
  } else if (navPatterns.pageTitle.length < 10) {
    issues.push({
      category: "findability",
      severity: "low",
      subcategory: "navigation-patterns",
      element: "title",
      description: "Page title is very short (< 10 chars)",
      detectionMethod: "page-title-check",
      recommendation: "Use a more descriptive page title",
    });
  }
}

/**
 * Detect actionable elements (action verbs on buttons, aria-describedby)
 * @since 17.0.0
 */
async function detectActionableElements(ctx: DetectionContext): Promise<void> {
  const { page, issues } = ctx;

  const actionAnalysis = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]'));

    // A label is generic only when EVERY word in it is. Matching ANY word
    // called "next slide" generic on cbrowser.ai because it contains "next",
    // and suggested "Save Changes" for a carousel arrow. "slide" names the
    // thing acted on, so the label is specific. "click here", "go back" and
    // "OK, got it" are generic through and through. So is "submit form":
    // "form" and "button" name the widget, not the outcome, and two forms'
    // "Submit form" buttons give an agent nothing to choose by.
    // Filler words (me, now, to, the, please, thanks) are generic too. Without
    // them "Click me", "Submit now", "Send now", "Go now" and "Yes please",
    // all flagged by the old any-word rule, stopped being flagged. They add no
    // information, so "Click to copy" and "Go to the dashboard" stay specific.
    // show/see/view join read/learn so "Show more" is as generic as "Read
    // more", while "Show details" is not. (2026-10-07)
    const genericWords = new Set([
      'click', 'tap', 'press', 'here', 'this', 'go', 'back', 'next', 'more', 'read', 'learn',
      'show', 'see', 'view',
      'continue', 'done', 'submit', 'send', 'ok', 'okay', 'got', 'it', 'yes', 'no',
      'button', 'link', 'form',
      'me', 'now', 'to', 'the', 'please', 'thanks',
    ]);

    const weakButtons: Array<{
      selector: string;
      text: string;
      /** The name with its original case, for the code example. */
      label: string;
      /** Where the name comes from, which decides what the example changes. */
      nameSource: 'aria-label' | 'aria-labelledby' | 'content' | 'value';
      labelledBy: string;
      /** The element's own text content (whitespace collapsed), which may differ from its name. */
      content: string;
      tag: string;
      attributes: Array<[string, string]>;
      hasElementChildren: boolean;
      /** What the button acts on, when the page says: its aria-controls target's name, or the nearest named container's. */
      context: string;
    }> = [];
    let elementsWithDescribedBy = 0;

    const clean = (v: string | null | undefined) => (v || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    // A container's own name: aria-label, aria-labelledby text, or its first heading.
    const nameOf = (el: Element): string => {
      const own = clean(el.getAttribute('aria-label'));
      if (own) return own;
      const ids = (el.getAttribute('aria-labelledby') || '').trim().split(/\s+/).filter(Boolean);
      const byIds = clean(ids.map(id => document.getElementById(id)?.textContent || '').join(' '));
      if (byIds) return byIds;
      return clean(el.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"], legend, caption')?.textContent);
    };
    const contextOf = (btn: Element): string => {
      const controls = (btn.getAttribute('aria-controls') || '').trim().split(/\s+/)[0];
      const target = controls ? document.getElementById(controls) : null;
      if (target) {
        const n = nameOf(target);
        if (n) return n;
      }
      const containers = 'nav, form, section, article, aside, dialog, fieldset, [role="dialog"], [role="region"], [role="navigation"], [role="form"], [role="group"]';
      for (let c = btn.closest(containers), hops = 0; c && hops < 4; c = c.parentElement?.closest(containers) ?? null, hops++) {
        const n = nameOf(c);
        if (n) return n;
      }
      return '';
    };

    buttons.forEach(btn => {
      // The accessible name, in the order a screen reader or role+name lookup
      // resolves it: aria-label="Next slide" names the button even when its
      // visible (aria-hidden) glyph text says "Next". (2026-10-07)
      const labelledBy = (btn.getAttribute('aria-labelledby') || '').trim().split(/\s+/).filter(Boolean)
        .map(id => document.getElementById(id)?.textContent || '').join(' ').trim();
      const ariaLabel = (btn.getAttribute('aria-label') || '').trim();
      const content = btn.textContent?.trim() || '';
      const nameSource = ariaLabel ? 'aria-label' : labelledBy ? 'aria-labelledby' : content ? 'content' : 'value';
      const raw = (ariaLabel || labelledBy || content || btn.getAttribute('value') || '').replace(/\s+/g, ' ');
      const text = raw.toLowerCase();
      // Punctuation and arrows are not words: "Next →" is "next", "OK, got it" is "ok got it".
      const words = text.split(/[^\p{L}\p{N}']+/u).filter(Boolean);

      // `every` over zero words is true, so an unnamed icon button needs the length guard.
      const isGeneric = words.length > 0 && words.every(w => genericWords.has(w));

      if (isGeneric && text.length < 20) {
        weakButtons.push({
          selector: btn.tagName.toLowerCase() + (btn.id ? `#${btn.id}` : ''),
          text: text.slice(0, 30),
          label: raw.trim().slice(0, 80),
          nameSource,
          labelledBy: (btn.getAttribute('aria-labelledby') || '').trim(),
          content: content.replace(/\s+/g, ' ').slice(0, 80),
          tag: btn.tagName.toLowerCase(),
          attributes: Array.from(btn.attributes).map(a => [a.name, a.value] as [string, string]),
          hasElementChildren: btn.children.length > 0,
          context: contextOf(btn),
        });
      }

      // Track aria-describedby usage
      if (btn.hasAttribute('aria-describedby')) {
        elementsWithDescribedBy++;
      }
    });

    return {
      weakButtons: weakButtons.slice(0, 5), // Limit to avoid noise
      totalButtons: buttons.length,
      elementsWithDescribedBy,
    };
  });

  // Report buttons with generic labels
  for (const btn of actionAnalysis.weakButtons) {
    issues.push({
      category: "findability",
      severity: "low",
      subcategory: "actionable-elements",
      element: btn.selector,
      description: `Button with generic label: "${btn.text}"`,
      detectionMethod: "action-verb-check",
      recommendation: "Use specific action verbs (e.g., 'Save Changes' instead of 'Submit')",
      codeExample: buildGenericLabelExample(btn),
    });
  }
}

/** What detectActionableElements captures about a generic-label button. */
interface GenericLabelButton {
  label: string;
  nameSource: 'aria-label' | 'aria-labelledby' | 'content' | 'value';
  labelledBy: string;
  content: string;
  tag: string;
  attributes: Array<[string, string]>;
  hasElementChildren: boolean;
  context: string;
}

/**
 * Code example for a generic-label finding, built from the flagged element.
 *
 * It was one literal for every finding (`<button>Submit</button>` -> "Save
 * Changes" / "Create Account" / "Download Report"), so a carousel's "Next" and
 * a newsletter form's "Submit" got the same advice about account creation, in
 * markup that matched neither. Now: the element as it is, then the same
 * element with the name changed where the name actually comes from (visible
 * text, value, or aria-label), naming what the page says it acts on when it
 * says so (aria-controls target, or nearest named nav/form/section).
 * Without a context the suggestion is an explicit fill-in.
 *
 * Content with child elements (an icon beside the word) is not rewritten; it
 * gets an aria-label that starts with the visible word, which keeps the
 * visible label inside the accessible name (WCAG 2.5.3).
 */
function buildGenericLabelExample(b: GenericLabelButton): string {
  const isVoid = VOID_ELEMENTS.has(b.tag);
  // The element's content as it is: its text, or a marker when it holds other
  // elements (an icon, a span), which an example must not flatten.
  const body = b.hasElementChildren
    ? (b.content ? `<!-- existing content, text "${escapeText(b.content)}" -->` : '<!-- existing content -->')
    : escapeText(b.content);
  const before = isVoid
    ? rebuildOpenTag(b.tag, b.attributes)
    : `${rebuildOpenTag(b.tag, b.attributes)}${body}</${b.tag}>`;

  if (b.nameSource === 'aria-labelledby') {
    return `<!-- Instead of: -->\n${before}\n<!-- Its name comes from aria-labelledby="${escapeAttr(b.labelledBy)}": change that element's text to say what this ${b.tag} does${b.context ? ` in "${escapeText(b.context)}"` : ''}. -->`;
  }

  const suggested = b.context ? `${b.label}: ${b.context}` : `${b.label} [what it acts on]`;
  let after: string;
  if (b.nameSource === 'value' || (isVoid && b.nameSource !== 'aria-label')) {
    after = rebuildOpenTag(b.tag, b.attributes, { value: suggested });
  } else if (b.nameSource === 'aria-label' || b.hasElementChildren) {
    const open = rebuildOpenTag(b.tag, b.attributes, { 'aria-label': suggested });
    after = isVoid ? open : `${open}${body}</${b.tag}>`;
  } else {
    after = `${rebuildOpenTag(b.tag, b.attributes)}${escapeText(suggested)}</${b.tag}>`;
  }
  const why = b.context
    ? `<!-- Say what it does. The page names its context "${escapeText(b.context)}", so for example: -->`
    : `<!-- Say what it does (verb + what it acts on), for example: -->`;
  return `<!-- Instead of: -->\n${before}\n${why}\n${after}`;
}

/**
 * Detect content-to-navigation ratio
 * @since 17.0.0
 */
async function detectContentChrome(ctx: DetectionContext): Promise<void> {
  const { page, issues } = ctx;

  const ratio = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const viewportArea = viewport.width * viewport.height;

    // Calculate nav/header/footer area
    let chromeArea = 0;
    const chromeElements = document.querySelectorAll('nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"]');

    chromeElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      // Only count visible elements in viewport
      if (rect.width > 0 && rect.height > 0 && rect.top < viewport.height) {
        const visibleHeight = Math.min(rect.bottom, viewport.height) - Math.max(rect.top, 0);
        const visibleWidth = Math.min(rect.right, viewport.width) - Math.max(rect.left, 0);
        if (visibleHeight > 0 && visibleWidth > 0) {
          chromeArea += visibleWidth * visibleHeight;
        }
      }
    });

    // Calculate main content area
    let mainArea = 0;
    const mainEl = document.querySelector('main, [role="main"], article, .content, #content, #main');
    if (mainEl) {
      const rect = mainEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const visibleHeight = Math.min(rect.bottom, viewport.height) - Math.max(rect.top, 0);
        const visibleWidth = Math.min(rect.right, viewport.width) - Math.max(rect.left, 0);
        if (visibleHeight > 0 && visibleWidth > 0) {
          mainArea = visibleWidth * visibleHeight;
        }
      }
    }

    const chromeRatio = chromeArea / viewportArea;
    const contentRatio = mainArea / viewportArea;

    return {
      chromeRatio: Math.round(chromeRatio * 100),
      contentRatio: Math.round(contentRatio * 100),
      viewportArea,
    };
  });

  // Flag excessive chrome (> 50% of viewport)
  if (ratio.chromeRatio > 50) {
    issues.push({
      category: "findability",
      severity: "medium",
      subcategory: "content-chrome",
      element: "viewport",
      description: `Navigation/chrome occupies ${ratio.chromeRatio}% of above-fold viewport`,
      detectionMethod: "content-chrome-check",
      recommendation: "Reduce navigation prominence or use collapsible menus",
    });
  }
}

/**
 * Detect API exposure (links to /api/ endpoints, GraphQL hints)
 * @since 17.0.0
 */
async function detectApiExposure(ctx: DetectionContext): Promise<void> {
  const { page, issues, summary } = ctx;

  const apiInfo = await page.evaluate(() => {
    const pageSource = document.documentElement.outerHTML;

    // Look for /api/ patterns in links and scripts
    const apiPatterns = pageSource.match(/["'](\/api\/[^"']*|https?:\/\/[^"']*\/api\/[^"']*)["']/gi) || [];
    const uniqueApiPaths = [...new Set(apiPatterns.map(p => p.replace(/["']/g, '').split('?')[0]))];

    // Look for GraphQL hints
    const hasGraphQL = /graphql|__schema|__typename/i.test(pageSource);
    const graphqlEndpoint = pageSource.match(/["'](\/graphql|https?:\/\/[^"']*graphql[^"']*)["']/i);

    return {
      apiEndpoints: uniqueApiPaths.slice(0, 10),
      hasGraphQL,
      graphqlEndpoint: graphqlEndpoint ? graphqlEndpoint[1] : null,
    };
  });

  summary.apiEndpointsCount = apiInfo.apiEndpoints.length;

  // API exposure is a POSITIVE signal for agent friendliness — do NOT add to issues.
  // The summary.apiEndpointsCount is still tracked for informational display.
}

/**
 * Detect /llms.txt presence
 * @since 17.0.0
 */
async function detectLlmsTxt(ctx: DetectionContext): Promise<void> {
  const { page, issues, summary } = ctx;

  try {
    const pageUrl = new URL(page.url());
    // Bail unless we have a real http(s) origin.
    //
    // When navigation is blocked the page sits at `about:blank`, whose origin is
    // not a fetchable base -- so this template produced the bare string
    // "/llms.txt", `fetch` threw `TypeError: "/llms.txt" cannot be parsed as a
    // URL`, and the ENTIRE audit died with a stack trace instead of a report.
    // Reproduced 2026-08-04 on amazon.com, allrecipes.com and booking.com: three
    // of eight sites in a benchmark sample returned nothing at all for this.
    //
    // Same root cause as the espn.com false-A (see assertPageWasAudited): the
    // audit did not check that the page loaded. That guard is the real fix and
    // now runs; this one keeps an optional signal from taking the report down
    // with it if anything else ever leaves the page unnavigated.
    if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") return;
    const llmsTxtUrl = `${pageUrl.origin}/llms.txt`;

    // Plain fetch, NOT `page.context().request.get()`.
    //
    // The Playwright request API runs every response through
    // `_parseSetCookieHeader`, and on amazon.com that throws
    // `TypeError: "/llms.txt" cannot be parsed as a URL` from inside
    // playwright-core (fetch.js:158). The throw originates in an HTTP event
    // handler, NOT in the awaited promise, so the `try` wrapped around this
    // block never catches it and the whole audit dies with a stack trace instead
    // of returning a report. Reproduced 2026-08-04 on amazon.com, allrecipes.com
    // and booking.com -- three of eight sites in a benchmark sample produced no
    // output at all, and it read to the customer as a cbrowser failure.
    //
    // What this gives up: the page's cookies and auth. `/llms.txt` is a public
    // file by definition, so that costs nothing real, and an OPTIONAL signal
    // must never be able to take the whole report down with it.
    const response = await fetch(llmsTxtUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });

    const status = response.status;
    summary.hasLlmsTxt = status === 200;

    if (status === 200) {
      const content = await response.text();
      const lines = content.split('\n').filter(l => l.trim());

      // Basic validation
      const hasTitle = lines.some(l => l.startsWith('#'));
      const hasLinks = lines.some(l => l.includes('[') && l.includes(']('));

      if (!hasTitle || !hasLinks) {
        issues.push({
          category: "semantics",
          severity: "low",
          subcategory: "llms-txt",
          element: "/llms.txt",
          description: "llms.txt exists but may be incomplete (missing headers or links)",
          detectionMethod: "llms-txt-check",
          recommendation: "Add markdown headers (#) and links ([text](url)) to llms.txt",
        });
      }
      // No issue if llms.txt is present and valid - it's a positive signal
    } else if (status === 404) {
      issues.push({
        category: "semantics",
        severity: "low",
        subcategory: "llms-txt",
        element: "/llms.txt",
        description: "No /llms.txt found (recommended for AI agent documentation)",
        detectionMethod: "llms-txt-check",
        recommendation: "Add /llms.txt to help AI agents understand your site",
        codeExample: `# Site Name

> Brief description of the site

## Documentation
- [Getting Started](/docs/start)
- [API Reference](/api)

## Important Pages
- [Pricing](/pricing)
- [Contact](/contact)`,
      });
    }
  } catch {
    // Silently handle fetch errors - don't penalize for network issues
    summary.hasLlmsTxt = false;
  }
}

/**
 * Detect state persistence patterns (CSRF tokens, session indicators)
 * @since 17.0.0
 */
async function detectStatePersistence(ctx: DetectionContext): Promise<void> {
  const { page, issues } = ctx;

  const stateInfo = await page.evaluate(() => {
    // Look for CSRF tokens
    const csrfInputs = document.querySelectorAll('input[name*="csrf" i], input[name*="token" i], input[name="_token"], input[name="authenticity_token"]');
    const csrfMeta = document.querySelector('meta[name*="csrf" i]');
    const hasCsrf = csrfInputs.length > 0 || !!csrfMeta;

    // Look for session indicators in forms
    const hiddenInputs = document.querySelectorAll('input[type="hidden"]');
    const sessionIndicators = Array.from(hiddenInputs).filter(input => {
      const name = input.getAttribute('name')?.toLowerCase() || '';
      return name.includes('session') || name.includes('state') || name.includes('nonce');
    });

    // Look for forms that might have non-idempotent actions
    const forms = document.querySelectorAll('form');
    const postForms = Array.from(forms).filter(f => f.method.toLowerCase() === 'post');

    return {
      hasCsrf,
      csrfCount: csrfInputs.length + (csrfMeta ? 1 : 0),
      sessionIndicators: sessionIndicators.length,
      postFormCount: postForms.length,
    };
  });

  // CSRF tokens are good security practice — do NOT penalize score.
  // Just note their presence for informational purposes (no issue pushed).

  if (stateInfo.sessionIndicators > 0) {
    issues.push({
      category: "stability",
      severity: "low",
      subcategory: "state-persistence",
      element: "input[type='hidden']",
      description: `${stateInfo.sessionIndicators} session state indicator(s) in forms`,
      detectionMethod: "session-check",
      recommendation: "Document required session state for programmatic form submission",
    });
  }
}

/**
 * Detect dynamic content patterns (loading states, infinite scroll, lazy load)
 * @since 17.0.0
 */
async function detectDynamicContent(ctx: DetectionContext): Promise<void> {
  const { page, issues, summary } = ctx;

  const dynamicInfo = await page.evaluate(() => {
    // Look for loading indicators
    const loadingIndicators = document.querySelectorAll('[class*="loading" i], [class*="spinner" i], [class*="skeleton" i], [aria-busy="true"], [data-loading]');

    // Look for infinite scroll patterns
    const infiniteScrollHints = document.querySelectorAll('[data-infinite], [class*="infinite" i], [class*="load-more" i]');

    // Look for lazy-load images
    const lazyImages = document.querySelectorAll('img[loading="lazy"], img[data-src], img[data-lazy]');

    // Check for intersection observer usage (common for infinite scroll)
    const hasIntersectionObserver = typeof IntersectionObserver !== 'undefined';

    // Look for "Load More" buttons
    const loadMoreButtons = Array.from(document.querySelectorAll('button, a')).filter(el => {
      const text = el.textContent?.toLowerCase() || '';
      return text.includes('load more') || text.includes('show more') || text.includes('view more');
    });

    return {
      loadingIndicators: loadingIndicators.length,
      infiniteScrollHints: infiniteScrollHints.length,
      lazyImages: lazyImages.length,
      loadMoreButtons: loadMoreButtons.length,
      hasIntersectionObserver,
    };
  });

  const dynamicCount =
    (dynamicInfo.loadingIndicators > 0 ? 1 : 0) +
    (dynamicInfo.infiniteScrollHints > 0 ? 1 : 0) +
    (dynamicInfo.lazyImages > 5 ? 1 : 0) +
    (dynamicInfo.loadMoreButtons > 0 ? 1 : 0);

  summary.deferredLoadingPatterns = dynamicCount;


  // Report infinite scroll as a potential challenge for agents
  if (dynamicInfo.infiniteScrollHints > 0 || dynamicInfo.loadMoreButtons > 0) {
    issues.push({
      category: "stability",
      severity: "medium",
      subcategory: "dynamic-content",
      element: "body",
      description: "Infinite scroll or load-more pattern detected",
      detectionMethod: "infinite-scroll-check",
      recommendation: "Provide pagination alternative or API endpoint for programmatic access",
    });
  }

  // Report loading indicators
  if (dynamicInfo.loadingIndicators > 3) {
    issues.push({
      category: "stability",
      severity: "low",
      subcategory: "dynamic-content",
      element: "body",
      description: `${dynamicInfo.loadingIndicators} loading indicator(s) found - agents should wait for content`,
      detectionMethod: "loading-state-check",
      recommendation: "Use aria-busy and loading states consistently for better agent detection",
    });
  }
}

/**
 * Detect CAPTCHA scripts that block AI agent automation
 * @since 17.1.0
 */
async function detectCaptcha(ctx: DetectionContext): Promise<void> {
  const { page, issues } = ctx;

  const captchaScripts = await page.$$eval('script[src], iframe[src]', (els) => {
    const captchaPatterns = ['recaptcha', 'hcaptcha', 'turnstile', 'captcha'];
    return els.filter(el => {
      const src = el.getAttribute('src') || '';
      return captchaPatterns.some(p => src.toLowerCase().includes(p));
    }).map(el => ({ tag: el.tagName, src: el.getAttribute('src') }));
  });

  if (captchaScripts.length > 0) {
    issues.push({
      category: "findability",
      severity: "high",
      element: captchaScripts[0].tag,
      description: `CAPTCHA detected (${captchaScripts[0].src?.split('/').pop()}) — blocks AI agent automation`,
      detectionMethod: "captcha-check",
      recommendation: 'Provide an API or authenticated bypass for automated agents',
    });
  }
}

// ============================================================================
// Report Generation
// ============================================================================

/**
 * How to say "N of these" for detections whose per-element description carries
 * that element's own figures.
 *
 * The aggregate line used to be `${count} ${typeIssues[0].description}`, so one
 * element's details were printed as if they described all of them. Measured
 * 2026-10-06 on cbrowser.ai: "10 elements lack stable selectors (score: 0/10)"
 * over per-element scores [0,2,2,2,2,2,0,0,0,0]. On the triage fixture:
 * "2 sticky element may intercept clicks (z-index: 50, 1264x40px, ...)" over a
 * sticky bar AND a 300x60 fixed dock at z-index 10, and
 * "3 Button with generic label: "go"" over "go", "done" and "click here".
 * Each summary below is true of every issue it counts. The per-issue
 * descriptions are unchanged; competitive-benchmark matches on them. (2026-10-07)
 */
const GROUP_SUMMARIES: Record<string, {
  pattern: RegExp;
  summarize: (count: number, matches: RegExpExecArray[]) => string;
}> = {
  "findability-score-check": {
    pattern: /^Element lacks stable selectors \(score: (\d+)\/10\)$/,
    summarize: (count, m) => {
      const scores = m.map(x => Number(x[1]));
      const lo = Math.min(...scores), hi = Math.max(...scores);
      return `${count} elements lack stable selectors (${lo === hi ? `score: ${lo}/10` : `scores: ${lo}-${hi}/10`})`;
    },
  },
  "sticky-element-check": {
    pattern: /^(\w+) element may intercept clicks \(z-index: (-?\d+)/,
    summarize: (count, m) => {
      const positions = [...new Set(m.map(x => x[1]))].join(" or ");
      const z = m.map(x => Number(x[2]));
      const lo = Math.min(...z), hi = Math.max(...z);
      return `${count} ${positions} elements may intercept clicks (z-index: ${lo === hi ? lo : `${lo}-${hi}`})`;
    },
  },
  "action-verb-check": {
    pattern: /^Button with generic label: "(.*)"$/,
    summarize: (count, m) => {
      // Repeats collapse: cbrowser.ai's two nav "More" triggers read "more" x2.
      const seen = new Map<string, number>();
      for (const x of m) seen.set(x[1], (seen.get(x[1]) || 0) + 1);
      const labels = [...seen].map(([label, n]) => `"${label}"${n > 1 ? ` x${n}` : ""}`);
      return `${count} buttons with generic labels: ${labels.join(", ")}`;
    },
  },
  "clickable-div-check": {
    pattern: /^Clickable (\S+) without button role$/,
    // Element types only, at most five. The selector carries the element's id,
    // so listing selectors printed all 60 ids of a grid of
    // <div id="cell-N" onclick>, 812 chars in a top recommendation. (2026-10-07)
    summarize: (count, m) => {
      const tags = [...new Set(m.map(x => x[1].split("#")[0]))];
      const more = tags.length > 5 ? `, +${tags.length - 5} more` : "";
      return `${count} clickable elements without button role (${tags.slice(0, 5).join(", ")}${more})`;
    },
  },
  "link-href-check": {
    pattern: /^Link with (javascript:|no) href acts as button$/,
    summarize: (count, m) => `${count} links with ${[...new Set(m.map(x => x[1]))].join(" or ")} href act as buttons`,
  },
};

/** One line for a group of same-detection issues that is true of every one of them. */
function summarizeIssueGroup(typeIssues: AgentReadyIssue[]): string {
  const representative = typeIssues[0];
  const count = typeIssues.length;
  if (count === 1) return representative.description;

  const summary = GROUP_SUMMARIES[representative.detectionMethod];
  if (summary) {
    const matches = typeIssues.map(i => summary.pattern.exec(i.description));
    if (matches.every((m): m is RegExpExecArray => m !== null)) return summary.summarize(count, matches);
  }

  if (typeIssues.every(i => i.description === representative.description)) {
    // v14.2.4: Fix grammar - "10 elements lack" not "10 Elements lacks"
    const issueText = representative.description
      .replace(/^Element /, "elements ")
      .replace(/ lacks /, " lack ");
    return `${count} ${issueText}`;
  }
  // Descriptions differ and there is no summary for this detection: say the
  // quoted one is an example rather than present it as all of them.
  return `${count} similar issues, for example: ${representative.description}`;
}

function generateRecommendations(issues: AgentReadyIssue[]): AgentReadyRecommendation[] {
  // Group issues by category and sort by severity
  const grouped = issues.reduce((acc, issue) => {
    const key = `${issue.category}-${issue.severity}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(issue);
    return acc;
  }, {} as Record<string, AgentReadyIssue[]>);

  const recommendations: AgentReadyRecommendation[] = [];
  let priority = 1;

  // Critical issues first
  const severityOrder: AgentReadyIssueSeverity[] = ['critical', 'high', 'medium', 'low'];

  for (const severity of severityOrder) {
    for (const category of Object.keys(CATEGORY_WEIGHTS) as AgentReadyIssueCategory[]) {
      const key = `${category}-${severity}`;
      const categoryIssues = grouped[key];

      if (categoryIssues && categoryIssues.length > 0) {
        // Group similar issues
        const issueTypes = new Map<string, AgentReadyIssue[]>();
        for (const issue of categoryIssues) {
          const type = issue.detectionMethod;
          if (!issueTypes.has(type)) issueTypes.set(type, []);
          issueTypes.get(type)!.push(issue);
        }

        for (const [_type, typeIssues] of issueTypes) {
          const representative = typeIssues[0];
          const issueText = summarizeIssueGroup(typeIssues);

          recommendations.push({
            priority: priority++,
            category: representative.category,
            issue: issueText,
            fix: representative.recommendation,
            effort: severity === 'critical' || severity === 'high' ? 'easy' : 'trivial',
            impact: severity === 'critical' ? 'high' : severity === 'high' ? 'high' : 'medium',
            codeSnippet: representative.codeExample,
          });
        }
      }
    }
  }

  return recommendations;
}

/**
 * One page of an audit's findings for a tool response: issues worst-first,
 * recommendations in priority order, with what was cut stated and a way to ask
 * for the rest. Same contract as hunt_bugs (limit/offset, returned, offset,
 * omitted + omittedNote "Re-run with offset=N").
 *
 * agent_ready_audit used a fixed slice(0, 5) for both lists: a page with 40
 * findings returned five and the other 35 were unreachable, and the five
 * recommendations were cut with no note at all. The stdio server's copy also
 * sliced issues in DETECTION order, so a critical found sixth was dropped for
 * five lows (the HTTP tool got the worst-first fix on 2026-08-01; this one
 * never did). Both now call this. (2026-10-09)
 */
export function pageAgentReadyFindings(
  result: Pick<AgentReadyAuditResult, "issues" | "recommendations">,
  options: { limit?: number; offset?: number } = {},
): Record<string, unknown> {
  const limit = Math.max(1, Math.floor(options.limit ?? 5));
  const start = Math.max(0, Math.floor(options.offset ?? 0));
  const rank = (sev: string) =>
    ({ critical: 0, high: 1, medium: 2, low: 3, info: 4 }[String(sev).toLowerCase()] ?? 5);
  // Stable: equal severities keep detection order.
  const sorted = result.issues
    .map((issue, i) => ({ issue, i }))
    .sort((a, b) => rank(a.issue.severity) - rank(b.issue.severity) || a.i - b.i)
    .map(({ issue }) => issue);
  const shown = sorted.slice(start, start + limit);
  const omitted = Math.max(0, sorted.length - (start + shown.length));
  const bySeverity = sorted.reduce((m: Record<string, number>, i) => {
    const k = String(i.severity); m[k] = (m[k] ?? 0) + 1; return m;
  }, {});
  const severityLine = Object.entries(bySeverity).map(([k, v]) => `${k} ${v}`).join(", ");

  // Recommendations are NOT walked by `offset`: offset pages the issue list, and
  // sharing it made page two of the issues silently skip recommendations 1-5.
  const recs = [...result.recommendations].sort((a, b) => a.priority - b.priority);
  const recsShown = recs.slice(0, limit);
  const recsOmitted = Math.max(0, recs.length - recsShown.length);

  return {
    topIssues: shown,
    issuesFound: sorted.length,
    returned: shown.length,
    offset: start,
    ...(omitted > 0
      ? {
          issuesOmitted: omitted,
          omittedNote: `Showing ${shown.length} of ${sorted.length} issues, worst first. Re-run with offset=${start + shown.length} for the next page, or raise limit. Severity counts across ALL findings: ${severityLine}.`,
          // Pre-19.2.3 field name, kept so existing clients that read it still
          // see the cut. Same text as omittedNote.
          issuesNote: `Showing ${shown.length} of ${sorted.length} issues, worst first. Re-run with offset=${start + shown.length} for the next page, or raise limit. Severity counts across ALL findings: ${severityLine}.`,
        }
      : {}),
    bySeverity,
    topRecommendations: recsShown,
    recommendationsFound: recs.length,
    ...(recsOmitted > 0
      ? {
          recommendationsOmitted: recsOmitted,
          recommendationsNote: `Showing the first ${recsShown.length} of ${recs.length} recommendations, in priority order. Raise limit to see more (offset pages the issues only).`,
        }
      : {}),
  };
}

export function formatAgentReadyReport(result: AgentReadyAuditResult): string {
  const gradeEmoji: Record<AgentReadyGrade, string> = {
    A: '🟢',
    B: '🟡',
    C: '🟠',
    D: '🔴',
    F: '⛔',
  };

  let report = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                        AGENT-READY AUDIT REPORT                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

URL: ${result.url}
Timestamp: ${result.timestamp}
Duration: ${(result.duration / 1000).toFixed(1)}s

⚠️  METHODOLOGY: Letter grades indicate AI agent compatibility level.*
    Grade A/B: Works well with agents | C: May need workarounds | D/F: Significant barriers
    *Based on pattern detection. See documentation for methodology and sources.

┌────────────────────────────────────────────────────────────────────────────┐
│  GRADE: ${gradeEmoji[result.grade]} ${result.grade}                                                                 │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Findability    ${result.score.findability}/100  ${'█'.repeat(Math.floor(result.score.findability / 10))}${'░'.repeat(10 - Math.floor(result.score.findability / 10))}                │
│  Stability      ${result.score.stability}/100  ${'█'.repeat(Math.floor(result.score.stability / 10))}${'░'.repeat(10 - Math.floor(result.score.stability / 10))}                │
│  AgentPerceive ${result.score.agentPerceivability}/100  ${'█'.repeat(Math.floor(result.score.agentPerceivability / 10))}${'░'.repeat(10 - Math.floor(result.score.agentPerceivability / 10))}                │
│  Semantics      ${result.score.semantics}/100  ${'█'.repeat(Math.floor(result.score.semantics / 10))}${'░'.repeat(10 - Math.floor(result.score.semantics / 10))}                │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘

SUMMARY
───────
  Total elements scanned: ${result.summary.totalElements}
  Problematic elements: ${result.summary.problematicElements}
  Missing ARIA labels: ${result.summary.missingAriaLabels}
  Hidden inputs: ${result.summary.hiddenInputs}
  Sticky overlays: ${result.summary.stickyOverlays}
  Custom dropdowns: ${result.summary.customDropdowns}

`;

  if (result.recommendations.length > 0) {
    report += `TOP RECOMMENDATIONS
───────────────────
`;
    for (const rec of result.recommendations.slice(0, 10)) {
      const severityIcon = rec.impact === 'high' ? '🔴' : rec.impact === 'medium' ? '🟠' : '🟡';
      report += `
  ${rec.priority}. [${severityIcon} ${rec.impact.toUpperCase()}] ${rec.issue}
     → ${rec.fix}
${rec.codeSnippet ? `     \`\`\`\n     ${rec.codeSnippet.split('\n').join('\n     ')}\n     \`\`\`\n` : ''}`;
    }
  }

  report += `
ISSUES BY CATEGORY
──────────────────
  Findability: ${result.issues.filter(i => i.category === 'findability').length} issues
  Stability: ${result.issues.filter(i => i.category === 'stability').length} issues
  Agent-perceivability: ${result.issues.filter(i => i.category === 'agentPerceivability').length} issues
  Semantics: ${result.issues.filter(i => i.category === 'semantics').length} issues

─────────────────────────────────────────────────────────────────────────────
* Methodology and research sources: docs/METHODOLOGY.md
  Key sources: Nielsen Norman Group (severity scale), WCAG 2.1, WebAIM

Generated by CBrowser v${VERSION} - Agent-Ready Audit
`;

  return report;
}

export function generateAgentReadyHtmlReport(result: AgentReadyAuditResult): string {
  const gradeColor: Record<AgentReadyGrade, string> = {
    A: '#10b981',
    B: '#84cc16',
    C: '#f59e0b',
    D: '#ef4444',
    F: '#7f1d1d',
  };

  const issueRows = result.issues.slice(0, 50).map(issue => `
    <tr class="severity-${issue.severity}">
      <td><span class="badge badge-${issue.category}">${issue.category}</span></td>
      <td><span class="badge badge-${issue.severity}">${issue.severity}</span></td>
      <td><code>${issue.element}</code></td>
      <td>${issue.description}</td>
      <td>${issue.recommendation}</td>
    </tr>
  `).join('');

  const recommendationCards = result.recommendations.slice(0, 10).map(rec => `
    <div class="rec-card impact-${rec.impact}">
      <div class="rec-header">
        <span class="priority">#${rec.priority}</span>
        <span class="badge badge-${rec.impact}">${rec.impact}</span>
        <span class="badge badge-effort-${rec.effort}">${rec.effort}</span>
      </div>
      <h4>${rec.issue}</h4>
      <p>${rec.fix}</p>
      ${rec.codeSnippet ? `<pre><code>${rec.codeSnippet.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>` : ''}
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent-Ready Audit - ${result.url}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
      background: #0f172a;
      color: #e2e8f0;
    }
    h1 {
      color: #f8fafc;
      border-bottom: 3px solid #3b82f6;
      padding-bottom: 0.5rem;
    }
    h2 { color: #94a3b8; margin-top: 2rem; }
    .meta {
      background: #1e293b;
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
    }
    .meta p { margin: 0.25rem 0; }
    .score-card {
      background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
      border-radius: 16px;
      padding: 2rem;
      text-align: center;
      margin: 2rem 0;
    }
    .score-value {
      font-size: 4rem;
      font-weight: bold;
      color: ${gradeColor[result.grade]};
    }
    .grade {
      font-size: 2rem;
      margin-top: 0.5rem;
      padding: 0.5rem 2rem;
      background: ${gradeColor[result.grade]}33;
      border: 2px solid ${gradeColor[result.grade]};
      border-radius: 8px;
      display: inline-block;
    }
    .score-bars {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      margin-top: 2rem;
    }
    .score-bar {
      background: #1e293b;
      padding: 1rem;
      border-radius: 8px;
      text-align: center;
    }
    .score-bar .value {
      font-size: 1.5rem;
      font-weight: bold;
      color: #3b82f6;
    }
    .score-bar .label {
      font-size: 0.875rem;
      color: #94a3b8;
    }
    .progress-bar {
      height: 8px;
      background: #334155;
      border-radius: 4px;
      margin-top: 0.5rem;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: #3b82f6;
      border-radius: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #1e293b;
      border-radius: 8px;
      overflow: hidden;
      margin: 1rem 0;
    }
    th, td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid #334155;
    }
    th { background: #0f172a; color: #94a3b8; }
    code {
      background: #334155;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      font-size: 0.875rem;
    }
    pre {
      background: #1e293b;
      padding: 1rem;
      border-radius: 8px;
      overflow-x: auto;
      font-size: 0.875rem;
    }
    pre code {
      background: none;
      padding: 0;
    }
    .badge {
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    .badge-findability { background: #3b82f633; color: #60a5fa; }
    .badge-stability { background: #f59e0b33; color: #fbbf24; }
    .badge-agentPerceivability { background: #10b98133; color: #34d399; }
    .badge-semantics { background: #8b5cf633; color: #a78bfa; }
    .badge-critical { background: #7f1d1d; color: #fca5a5; }
    .badge-high { background: #7f1d1d80; color: #f87171; }
    .badge-medium { background: #78350f; color: #fbbf24; }
    .badge-low { background: #365314; color: #a3e635; }
    .badge-effort-trivial { background: #166534; color: #86efac; }
    .badge-effort-easy { background: #1e3a8a; color: #93c5fd; }
    .badge-effort-medium { background: #78350f; color: #fde047; }
    .badge-effort-hard { background: #7f1d1d; color: #fca5a5; }
    .rec-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1rem;
    }
    .rec-card {
      background: #1e293b;
      border-radius: 8px;
      padding: 1rem;
      border-left: 4px solid #3b82f6;
    }
    .rec-card.impact-high { border-left-color: #ef4444; }
    .rec-card.impact-medium { border-left-color: #f59e0b; }
    .rec-card.impact-low { border-left-color: #10b981; }
    .rec-header {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    .rec-header .priority {
      font-weight: bold;
      color: #94a3b8;
    }
    .rec-card h4 {
      margin: 0.5rem 0;
      color: #f8fafc;
    }
    .rec-card p {
      color: #94a3b8;
      margin: 0.5rem 0;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 1rem;
      margin: 1rem 0;
    }
    .summary-stat {
      background: #1e293b;
      padding: 1rem;
      border-radius: 8px;
      text-align: center;
    }
    .summary-stat .value {
      font-size: 1.5rem;
      font-weight: bold;
      color: #3b82f6;
    }
    .summary-stat .label {
      font-size: 0.875rem;
      color: #94a3b8;
    }
    .disclaimer {
      background: #1e3a5f;
      border-left: 4px solid #3b82f6;
      padding: 1rem;
      margin: 1rem 0;
      border-radius: 0 8px 8px 0;
    }
    .disclaimer h4 {
      margin: 0 0 0.5rem 0;
      color: #60a5fa;
    }
    .disclaimer p {
      margin: 0.25rem 0;
      font-size: 0.875rem;
      color: #94a3b8;
    }
    .footnote {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid #334155;
    }
  </style>
</head>
<body>
  <h1>🤖 Agent-Ready Audit Report</h1>

  <div class="disclaimer">
    <h4>⚠️ Methodology Note</h4>
    <p>Letter grades indicate AI agent compatibility level based on <strong>pattern detection</strong>, not precise measurements.*</p>
    <p><strong>A/B:</strong> Works well with agents | <strong>C:</strong> May need workarounds | <strong>D/F:</strong> Significant barriers</p>
    <p style="font-size: 0.75rem; margin-top: 0.5rem;">*Severity calibrated to Nielsen's usability scale. Touch targets per WCAG 2.5.5/2.5.8 (44x44px min).</p>
  </div>

  <div class="meta">
    <p><strong>URL:</strong> ${result.url}</p>
    <p><strong>Timestamp:</strong> ${result.timestamp}</p>
    <p><strong>Duration:</strong> ${(result.duration / 1000).toFixed(1)}s</p>
  </div>

  <div class="score-card">
    <div class="score-value">${result.score.overall}</div>
    <div class="grade">${result.grade}</div>
    <div class="score-bars">
      <div class="score-bar">
        <div class="value">${result.score.findability}</div>
        <div class="label">Findability</div>
        <div class="progress-bar"><div class="progress-fill" style="width: ${result.score.findability}%"></div></div>
      </div>
      <div class="score-bar">
        <div class="value">${result.score.stability}</div>
        <div class="label">Stability</div>
        <div class="progress-bar"><div class="progress-fill" style="width: ${result.score.stability}%"></div></div>
      </div>
      <div class="score-bar">
        <div class="value">${result.score.agentPerceivability}</div>
        <div class="label" title="Whether a machine can perceive these elements — not WCAG conformance">Agent perceivability</div>
        <div class="progress-bar"><div class="progress-fill" style="width: ${result.score.agentPerceivability}%"></div></div>
      </div>
      <div class="score-bar">
        <div class="value">${result.score.semantics}</div>
        <div class="label">Semantics</div>
        <div class="progress-bar"><div class="progress-fill" style="width: ${result.score.semantics}%"></div></div>
      </div>
    </div>
  </div>

  <h2>Summary</h2>
  <div class="summary-grid">
    <div class="summary-stat">
      <div class="value">${result.summary.totalElements}</div>
      <div class="label">Total Elements</div>
    </div>
    <div class="summary-stat">
      <div class="value">${result.summary.problematicElements}</div>
      <div class="label">With Issues</div>
    </div>
    <div class="summary-stat">
      <div class="value">${result.summary.missingAriaLabels}</div>
      <div class="label">Missing ARIA</div>
    </div>
    <div class="summary-stat">
      <div class="value">${result.summary.hiddenInputs}</div>
      <div class="label">Hidden Inputs</div>
    </div>
    <div class="summary-stat">
      <div class="value">${result.summary.stickyOverlays}</div>
      <div class="label">Sticky Overlays</div>
    </div>
    <div class="summary-stat">
      <div class="value">${result.summary.customDropdowns}</div>
      <div class="label">Custom Dropdowns</div>
    </div>
  </div>

  <h2>Top Recommendations</h2>
  <div class="rec-cards">
    ${recommendationCards}
  </div>

  <h2>All Issues (${result.issues.length})</h2>
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Severity</th>
        <th>Element</th>
        <th>Issue</th>
        <th>Fix</th>
      </tr>
    </thead>
    <tbody>
      ${issueRows}
    </tbody>
  </table>

  <div class="footnote">
    <p>* Methodology and research sources: <a href="docs/METHODOLOGY.md" style="color: #60a5fa;">docs/METHODOLOGY.md</a></p>
    <p>Key sources: Nielsen Norman Group (severity scale), WCAG 2.1, WebAIM Million (2024)</p>
  </div>

  <p style="color: #64748b; text-align: center; margin-top: 2rem;">
    Generated by CBrowser v${VERSION} - Agent-Ready Audit
  </p>
</body>
</html>`;
}

// ============================================================================
// SPA Hydration Detection (v18.22.0)
// ============================================================================

/**
 * Detected SPA framework
 */
type SpaFramework = "react" | "vue" | "angular" | "svelte" | "next" | "nuxt" | "unknown";

/**
 * Detect which SPA framework a page uses
 */
async function detectSpaFramework(page: import("playwright").Page): Promise<SpaFramework> {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;

    // React detection
    if (
      win.__REACT_DEVTOOLS_GLOBAL_HOOK__ ||
      document.querySelector("[data-reactroot]") ||
      document.querySelector("[data-react-helmet]") ||
      document.getElementById("__next") // Next.js
    ) {
      return document.getElementById("__next") ? "next" : "react";
    }

    // Vue detection
    if (
      win.__VUE__ ||
      document.querySelector("[data-v-]") ||
      document.getElementById("__nuxt") // Nuxt
    ) {
      return document.getElementById("__nuxt") ? "nuxt" : "vue";
    }

    // Angular detection
    if (
      win.ng ||
      document.querySelector("[ng-version]") ||
      document.querySelector("app-root")
    ) {
      return "angular";
    }

    // Svelte detection
    if (document.querySelector("[class^='svelte-']")) {
      return "svelte";
    }

    return "unknown";
  });
}

/**
 * Wait for SPA framework to hydrate and render dynamic content
 */
async function waitForSpaHydration(
  page: import("playwright").Page,
  options: { timeout?: number } = {}
): Promise<{ framework: SpaFramework; hydrationTime: number }> {
  const startTime = Date.now();
  const timeout = options.timeout ?? 5000;

  const framework = await detectSpaFramework(page);

  // Framework-specific hydration wait strategies
  try {
    switch (framework) {
      case "react":
      case "next":
        // Wait for React to finish rendering (no pending state updates)
        await page.waitForFunction(
          () => {
            // Check for loading indicators
            const loadingElements = document.querySelectorAll(
              '[class*="loading"], [class*="skeleton"], [class*="spinner"], [aria-busy="true"]'
            );
            return loadingElements.length === 0;
          },
          { timeout }
        );
        break;

      case "vue":
      case "nuxt":
        // Wait for Vue to finish hydration
        await page.waitForFunction(
          () => {
            // Vue adds data-v- attributes after hydration
            const hydratedElements = document.querySelectorAll("[data-v-]");
            // Also check for loading states
            const loadingElements = document.querySelectorAll(
              '[class*="loading"], [class*="skeleton"], [aria-busy="true"]'
            );
            return hydratedElements.length > 0 && loadingElements.length === 0;
          },
          { timeout }
        );
        break;

      case "angular":
        // Wait for Angular to stabilize
        await page.waitForFunction(
          () => {
            // Angular removes ng-pending after hydration
            const pending = document.querySelector("[ng-pending]");
            return !pending;
          },
          { timeout }
        );
        break;

      default:
        // Generic SPA wait - wait for no network activity and no loading indicators
        await page.waitForLoadState("networkidle", { timeout }).catch(() => {
          // If networkidle times out, continue anyway
        });
    }
  } catch {
    // If framework-specific wait times out, fall back to basic wait
    await page.waitForTimeout(Math.min(2000, timeout));
  }

  // Additional wait for dynamic content that might load after initial hydration
  await page.waitForTimeout(500);

  return {
    framework,
    hydrationTime: Date.now() - startTime,
  };
}

// ============================================================================
// Main Audit Function
// ============================================================================

export async function runAgentReadyAudit(
  url: string,
  options: AgentReadyAuditOptions = {}
): Promise<AgentReadyAuditResult> {
  const startTime = Date.now();
  const overallTimeout = options.timeout ?? 60000;
  const navigationTimeout = options.navigationTimeout ?? 30000;
  let browser: Browser | null = null;

  // Wrap entire operation in timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Audit timed out after ${overallTimeout}ms`)), overallTimeout);
  });

  const auditPromise = async (): Promise<AgentReadyAuditResult> => {
    // If a pre-existing page is provided, skip browser launch + navigation
    const externalPage = options.page;
    try {
      let page: Page;
      if (externalPage) {
        page = externalPage;
        // Skip navigation — caller already navigated
      } else if (options.useLightpanda && isLightpandaConfigured()) {
        const result = await launchWithLightpandaFallback({
          headless: true,
          explicitOptIn: true,
          operation: "agent-ready-audit",
        });
        browser = result.browser;
        if (result.isLightpanda) {
          console.log("🐼 Using Lightpanda for audit (11x faster)");
        }
        const context = await browser.newContext({
          viewport: { width: 1920, height: 1080 },
          ...(options.locale ? { locale: options.locale } : {}),
        });
        page = await context.newPage();
      } else {
        const cbrowser = new CBrowser({
          headless: options.headless ?? true,
          persistent: false,
          ...(options.proxy ? { proxy: options.proxy } : {}),
          ...(options.locale ? { locale: options.locale } : {}),
          ...(options.device ? { device: options.device.toLowerCase() } : {}),
        });
        await cbrowser.launch();
        browser = (cbrowser as any).browser;
        page = await cbrowser.getPage();
      }

      // Navigate to URL (skip if external page provided — already navigated)
      if (!externalPage) try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: navigationTimeout });
      } catch (navError) {
        const errMsg = navError instanceof Error ? navError.message : String(navError);
        if (errMsg.includes("ERR_TUNNEL_CONNECTION_FAILED") || errMsg.includes("ERR_PROXY_CONNECTION_FAILED")) {
          throw new Error(
            `Proxy tunnel rejected by ${url}. The target site is blocking proxy/VPN connections. ` +
            `This is the site's anti-bot defense, not a CBrowser issue.\n\n` +
            `Recommendations:\n` +
            `1. Re-run without the proxy/geo-region to test from your direct IP\n` +
            `2. Try a different geo region — the site may block specific IP ranges\n` +
            `3. Some sites (Stripe, GitHub, banking) aggressively block residential proxies`
          );
        }
        if (errMsg.includes("ERR_NETWORK_CHANGED") && options.proxy) {
          throw new Error(
            `Network changed during proxy connection to ${url}. The residential proxy IP may have rotated mid-request.\n\n` +
            `Recommendations:\n` +
            `1. Retry — residential proxy IPs rotate and the next one may work\n` +
            `2. Re-run without the proxy to test from your direct IP`
          );
        }
        // Unresolvable host, refused, timed out, bad certificate...: say so
        // in plain words instead of Playwright's raw error and Call log.
        throw navigationError(navError, url);
      }

      // v18.22.0: SPA mode - detect framework and wait for hydration
      if (!externalPage) {
        if (options.spaMode) {
          await waitForSpaHydration(page, { timeout: 5000 });
        } else {
          await page.waitForTimeout(1000);
        }
      }

    // Initialize detection context
    const issues: AgentReadyIssue[] = [];
    const summary: AgentReadySummary = {
      totalElements: 0,
      problematicElements: 0,
      missingAriaLabels: 0,
      hiddenInputs: 0,
      stickyOverlays: 0,
      customDropdowns: 0,
      elementsWithoutText: 0,
      // AI-specific counters (v17.0.0)
      machineMetadataCount: 0,
      navigationAidsCount: 0,
      hasLlmsTxt: false,
      apiEndpointsCount: 0,
      deferredLoadingPatterns: 0,
    };

    const ctx: DetectionContext = { page, issues, summary };

    // Run all detection functions
    await detectUnlabeledElements(ctx);
    await detectHiddenInputs(ctx);
    await detectStickyOverlays(ctx);
    await detectClickableDivs(ctx);
    await detectMissingAltText(ctx);
    await detectBadLinks(ctx);
    await detectLowFindabilityElements(ctx);

    // AI-specific detection functions (v17.0.0)
    await detectMachineMetadata(ctx);
    await detectNavigationPatterns(ctx);
    await detectActionableElements(ctx);
    await detectContentChrome(ctx);
    await detectApiExposure(ctx);
    await detectLlmsTxt(ctx);
    await detectStatePersistence(ctx);
    await detectDynamicContent(ctx);
    await detectCaptcha(ctx);
    await detectClientOnlyContent(ctx);

    // Update summary — count total interactive elements actually on the page
    summary.totalElements = await page.evaluate(() => {
      return document.querySelectorAll('a, button, input, select, textarea, [role="button"], [onclick], [tabindex], img, [aria-label]').length;
    }).catch(() => 0);
    summary.problematicElements = Math.min(issues.length, summary.totalElements);

    // Nothing on the page means nothing was measured. Throws rather than
    // grading -- see assertPageWasAudited for the espn.com case that motivated it.
    assertPageWasAudited(summary.totalElements, url);

    // Calculate scores
    const score = calculateAgentReadyScore(issues);
    const grade = calculateGrade(score.overall);

    // Generate recommendations
    const recommendations = generateRecommendations(issues);

    const result: AgentReadyAuditResult = {
      url,
      timestamp: new Date().toISOString(),
      score,
      issues,
      recommendations,
      summary,
      grade,
      duration: Date.now() - startTime,
    };

    return result;
    } finally {
      // Don't close browser if it was externally provided
      if (browser && !externalPage) {
        await browser.close();
      }
    }
  };

  // Race between audit and timeout
  try {
    return await Promise.race<AgentReadyAuditResult>([auditPromise(), timeoutPromise]);
  } catch (error) {
    if (browser && !options.page) {
      await (browser as Browser).close();
    }
    throw error;
  }
}
