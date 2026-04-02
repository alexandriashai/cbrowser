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

import { chromium, type Page, type Browser } from "playwright";
import { launchBrowserWithFallback } from "../browser.js";
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
 * - Accessibility (20%): ARIA labels provide semantic meaning for agents
 * - Semantics (15%): Proper HTML structure aids understanding
 */
const CATEGORY_WEIGHTS: Record<AgentReadyIssueCategory, number> = {
  findability: 0.35,
  stability: 0.30,
  accessibility: 0.20,
  semantics: 0.15,
};

function calculateAgentReadyScore(issues: AgentReadyIssue[]): AgentReadyScore {
  // Start with perfect scores
  const scores: Record<AgentReadyIssueCategory, number> = {
    findability: 100,
    stability: 100,
    accessibility: 100,
    semantics: 100,
  };

  // Deduct based on issues
  for (const issue of issues) {
    const penalty = SEVERITY_PENALTY[issue.severity];
    scores[issue.category] = Math.max(0, scores[issue.category] - penalty);
  }

  // Calculate overall weighted score
  const overall = Math.round(
    scores.findability * CATEGORY_WEIGHTS.findability +
    scores.stability * CATEGORY_WEIGHTS.stability +
    scores.accessibility * CATEGORY_WEIGHTS.accessibility +
    scores.semantics * CATEGORY_WEIGHTS.semantics
  );

  return {
    overall,
    findability: Math.round(scores.findability),
    stability: Math.round(scores.stability),
    accessibility: Math.round(scores.accessibility),
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
 * Detect elements without proper labels (findability)
 */
async function detectUnlabeledElements(ctx: DetectionContext): Promise<void> {
  const { page, issues, summary } = ctx;

  // Find buttons without accessible names
  const unlabeledButtons = await page.$$eval(
    'button:not([aria-label]):not([aria-labelledby]), [role="button"]:not([aria-label]):not([aria-labelledby])',
    (elements) => elements.map(el => ({
      selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.className ? `.${el.className.split(' ')[0]}` : ''),
      text: el.textContent?.trim() || '',
      html: el.outerHTML.slice(0, 200),
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
      codeExample: `<button aria-label="Describe action here">...</button>`,
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
      category: "accessibility",
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
 * Detect sticky/fixed elements that may intercept clicks
 */
async function detectStickyOverlays(ctx: DetectionContext): Promise<void> {
  const { page, issues, summary } = ctx;

  const stickyElements = await page.$$eval('*', (elements) => {
    const results: Array<{
      selector: string;
      position: string;
      zIndex: number;
      height: number;
      isHeader: boolean;
      isFooter: boolean;
    }> = [];

    for (const el of elements) {
      const styles = window.getComputedStyle(el);
      const position = styles.position;

      if (position === 'fixed' || position === 'sticky') {
        const rect = el.getBoundingClientRect();
        const zIndex = parseInt(styles.zIndex) || 0;
        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : '';
        const className = el.className && typeof el.className === 'string'
          ? `.${el.className.split(' ')[0]}`
          : '';

        results.push({
          selector: tag + id + className,
          position,
          zIndex,
          height: rect.height,
          isHeader: rect.top < 100,
          isFooter: rect.bottom > window.innerHeight - 100,
        });
      }
    }

    return results.filter(el => el.height > 40 && el.zIndex >= 0);
  });

  for (const sticky of stickyElements) {
    // Only flag non-trivial sticky elements
    if (sticky.height > 60) {
      issues.push({
        category: "stability",
        severity: sticky.zIndex > 100 ? "high" : "medium",
        element: sticky.selector,
        description: `${sticky.position} element may intercept clicks (z-index: ${sticky.zIndex}, height: ${sticky.height}px)`,
        detectionMethod: "sticky-element-check",
        recommendation: "Add scroll-margin-top to target elements, or ensure proper z-index layering",
        codeExample: sticky.isHeader
          ? `/* Add to elements that sticky header might cover */\n.target-element {\n  scroll-margin-top: ${sticky.height + 20}px;\n}`
          : `/* Ensure modal/overlay has backdrop to prevent accidental clicks */`,
      });
      summary.stickyOverlays++;
    }
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
      selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : ''),
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
      };
    }).filter(el => !el.isDecorative)
  );

  for (const img of imagesWithoutAlt) {
    issues.push({
      category: "accessibility",
      severity: "medium",
      element: img.selector,
      description: "Image without alt text",
      detectionMethod: "img-alt-check",
      recommendation: "Add descriptive alt text, or alt=\"\" if decorative",
      codeExample: `<img src="..." alt="Description of the image" />`,
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
      text: el.textContent?.trim().slice(0, 30) || '',
      href: el.getAttribute('href') || '',
    }))
  );

  for (const link of badLinks) {
    issues.push({
      category: "semantics",
      severity: "low",
      element: link.selector,
      description: `Link with ${link.href ? 'javascript:' : 'no'} href acts as button`,
      detectionMethod: "link-href-check",
      recommendation: "Use <button> for actions, <a href> for navigation",
      codeExample: `<!-- For actions, use button: -->\n<button onclick="...">${link.text || 'Action'}</button>\n\n<!-- For navigation, use proper href: -->\n<a href="/path">${link.text || 'Link'}</a>`,
    });
  }
}

/**
 * Detect elements only findable by fuzzy/visual match
 */
async function detectLowFindabilityElements(ctx: DetectionContext): Promise<void> {
  const { page, issues, summary } = ctx;

  // Check for buttons/links that lack good selectors
  const poorSelectors = await page.$$eval(
    'button, a, [role="button"]',
    (elements) => elements.map(el => {
      const hasId = !!el.id;
      const hasTestId = el.hasAttribute('data-testid') || el.hasAttribute('data-test') || el.hasAttribute('data-cy');
      const hasAriaLabel = el.hasAttribute('aria-label');
      const hasName = el.hasAttribute('name');
      const hasGoodClass = el.className && typeof el.className === 'string' &&
        /btn|button|cta|submit|action/i.test(el.className);
      const text = el.textContent?.trim() || '';

      // Score how findable this element is
      const findabilityScore =
        (hasId ? 3 : 0) +
        (hasTestId ? 3 : 0) +
        (hasAriaLabel ? 2 : 0) +
        (hasName ? 2 : 0) +
        (hasGoodClass ? 1 : 0) +
        (text.length > 0 && text.length < 50 ? 2 : 0);

      return {
        selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
        text: text.slice(0, 30),
        findabilityScore,
        suggestions: {
          needsId: !hasId,
          needsTestId: !hasTestId,
          needsAriaLabel: !hasAriaLabel && !text,
        },
      };
    }).filter(el => el.findabilityScore < 3)
  );

  for (const el of poorSelectors.slice(0, 10)) { // Limit to avoid noise
    issues.push({
      category: "findability",
      severity: "low",
      element: el.selector,
      description: `Element lacks stable selectors (score: ${el.findabilityScore}/10)`,
      detectionMethod: "findability-score-check",
      recommendation: el.suggestions.needsTestId
        ? "Add data-testid for stable automation selectors"
        : el.suggestions.needsAriaLabel
          ? "Add aria-label for accessibility and findability"
          : "Add unique id or data-testid",
      codeExample: `<button data-testid="submit-form" aria-label="Submit form">${el.text || '...'}</button>`,
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
      category: "accessibility",
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
    const breadcrumbSchema = document.querySelector('[itemtype*="BreadcrumbList"]');
    const hasBreadcrumbs = !!breadcrumbNav || !!breadcrumbSchema;

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
      category: "accessibility",
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

    // Generic/weak button labels
    const genericLabels = ['submit', 'click', 'ok', 'yes', 'no', 'go', 'next', 'back', 'continue', 'send', 'done'];
    // Strong action verbs
    const actionVerbs = ['add', 'create', 'save', 'delete', 'remove', 'edit', 'update', 'download', 'upload', 'share', 'copy', 'search', 'filter', 'sort', 'buy', 'subscribe', 'register', 'login', 'logout', 'sign'];

    const weakButtons: Array<{ selector: string; text: string }> = [];
    let elementsWithDescribedBy = 0;

    buttons.forEach(btn => {
      const text = (btn.textContent?.trim() || btn.getAttribute('value') || btn.getAttribute('aria-label') || '').toLowerCase();
      const words = text.split(/\s+/);

      // Check if button uses generic label without action verb
      const isGeneric = words.some(w => genericLabels.includes(w)) && !words.some(w => actionVerbs.some(v => w.startsWith(v)));

      if (isGeneric && text.length < 20) {
        weakButtons.push({
          selector: btn.tagName.toLowerCase() + (btn.id ? `#${btn.id}` : ''),
          text: text.slice(0, 30),
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
      codeExample: `<!-- Instead of: -->
<button>Submit</button>
<!-- Use: -->
<button>Save Changes</button>
<button>Create Account</button>
<button>Download Report</button>`,
    });
  }
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

  // Report API exposure as informational (positive for agents)
  if (apiInfo.apiEndpoints.length > 0) {
    issues.push({
      category: "findability",
      severity: "low", // Actually positive - just noting for awareness
      subcategory: "api-exposure",
      element: "script/link",
      description: `${apiInfo.apiEndpoints.length} API endpoint(s) detected in page source`,
      detectionMethod: "api-exposure-check",
      recommendation: "API endpoints are agent-friendly. Ensure they're documented.",
    });
  }

  if (apiInfo.hasGraphQL) {
    issues.push({
      category: "findability",
      severity: "low",
      subcategory: "api-exposure",
      element: apiInfo.graphqlEndpoint || "script",
      description: "GraphQL API detected",
      detectionMethod: "graphql-check",
      recommendation: "GraphQL is agent-friendly. Consider enabling introspection for agents.",
    });
  }
}

/**
 * Detect /llms.txt presence
 * @since 17.0.0
 */
async function detectLlmsTxt(ctx: DetectionContext): Promise<void> {
  const { page, issues, summary } = ctx;

  try {
    const pageUrl = new URL(page.url());
    const llmsTxtUrl = `${pageUrl.origin}/llms.txt`;

    // Use page context to fetch (same cookies/auth)
    const response = await page.context().request.get(llmsTxtUrl, {
      timeout: 5000,
      failOnStatusCode: false,
    });

    const status = response.status();
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

  // Report CSRF presence as informational (awareness for agents)
  if (stateInfo.hasCsrf) {
    issues.push({
      category: "stability",
      severity: "low",
      subcategory: "state-persistence",
      element: "form",
      description: `${stateInfo.csrfCount} CSRF token(s) detected - agents need fresh tokens per request`,
      detectionMethod: "csrf-check",
      recommendation: "Ensure API endpoints support token refresh or use stateless auth for agents",
    });
  }

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

  summary.dynamicContentCount = dynamicCount;

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

// ============================================================================
// Report Generation
// ============================================================================

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
          const count = typeIssues.length;

          // v14.2.4: Fix grammar - "10 elements lack" not "10 Elements lacks"
          let issueText = representative.description;
          if (count > 1) {
            // Replace "Element lacks" with "elements lack" for proper grammar
            issueText = representative.description
              .replace(/^Element /, "elements ")
              .replace(/ lacks /, " lack ");
            issueText = `${count} ${issueText}`;
          }

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
│  Accessibility  ${result.score.accessibility}/100  ${'█'.repeat(Math.floor(result.score.accessibility / 10))}${'░'.repeat(10 - Math.floor(result.score.accessibility / 10))}                │
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
  Accessibility: ${result.issues.filter(i => i.category === 'accessibility').length} issues
  Semantics: ${result.issues.filter(i => i.category === 'semantics').length} issues

─────────────────────────────────────────────────────────────────────────────
* Methodology and research sources: docs/METHODOLOGY.md
  Key sources: Nielsen Norman Group (severity scale), WCAG 2.1, WebAIM

Generated by CBrowser v8.0.0 - Agent-Ready Audit
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
    .badge-accessibility { background: #10b98133; color: #34d399; }
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
        <div class="value">${result.score.accessibility}</div>
        <div class="label">Accessibility</div>
        <div class="progress-bar"><div class="progress-fill" style="width: ${result.score.accessibility}%"></div></div>
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
    Generated by CBrowser v8.0.0 - Agent-Ready Audit
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
    try {
      // Use Lightpanda if explicitly requested and configured
      if (options.useLightpanda && isLightpandaConfigured()) {
        const result = await launchWithLightpandaFallback({
          headless: true,
          explicitOptIn: true,
          operation: "agent-ready-audit",
        });
        browser = result.browser;
        if (result.isLightpanda) {
          console.log("🐼 Using Lightpanda for audit (11x faster)");
        }
      } else {
        browser = await launchBrowserWithFallback(chromium, { headless: options.headless ?? true });
      }

      // v18.22.0: User agent rotation for bot detection hardening
      const userAgents = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      ];
      const selectedUserAgent = options.useRandomUserAgent
        ? userAgents[Math.floor(Math.random() * userAgents.length)]
        : undefined;

      // v18.22.0: Slight viewport variation to avoid detection
      const viewportJitter = options.useRandomUserAgent
        ? { width: 1920 + Math.floor(Math.random() * 40) - 20, height: 1080 + Math.floor(Math.random() * 40) - 20 }
        : { width: 1920, height: 1080 };

      const context = await browser.newContext({
        viewport: viewportJitter,
        ...(selectedUserAgent && { userAgent: selectedUserAgent }),
      });
      const page = await context.newPage();

      // Navigate to URL - use domcontentloaded for faster completion
      // networkidle can hang on sites with continuous network activity
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: navigationTimeout });

      // v18.22.0: SPA mode - detect framework and wait for hydration
      if (options.spaMode) {
        await waitForSpaHydration(page, { timeout: 5000 });
      } else {
        // Brief wait for initial JS execution (reduced from 2s)
        await page.waitForTimeout(1000);
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
      dynamicContentCount: 0,
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

    // Update summary
    summary.problematicElements = issues.length;

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
      if (browser) {
        await browser.close();
      }
    }
  };

  // Race between audit and timeout
  try {
    return await Promise.race<AgentReadyAuditResult>([auditPromise(), timeoutPromise]);
  } catch (error) {
    // Ensure browser is closed on timeout
    if (browser) {
      await (browser as Browser).close();
    }
    throw error;
  }
}
