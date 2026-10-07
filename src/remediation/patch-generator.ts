/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Remediation Patch Generator
 *
 * Transforms audit issues into actionable before/after code patches.
 * Each issue type maps to a specific fix template.
 *
 * @since 17.0.0
 */

import type {
  AgentReadyIssue,
  AgentReadyAuditResult,
} from "../types.js";

/**
 * Represents a code patch to fix an audit issue
 */
export interface RemediationPatch {
  /** Issue being fixed */
  issueId: string;
  /** Issue category */
  category: string;
  /** Issue description */
  description: string;
  /** Original problematic code */
  before: string;
  /** Fixed code */
  after: string;
  /** Explanation of the fix */
  explanation: string;
  /** Effort level to implement */
  effort: "trivial" | "easy" | "medium" | "hard";
  /** Impact of the fix */
  impact: "low" | "medium" | "high";
}

/**
 * Patch templates keyed by detection method
 */
const PATCH_TEMPLATES: Record<string, (issue: AgentReadyIssue) => RemediationPatch> = {
  "button-label-check": (issue) => ({
    issueId: `btn-${Date.now()}`,
    category: issue.category,
    description: issue.description,
    before: `<button class="icon-btn">
  <svg>...</svg>
</button>`,
    after: `<button class="icon-btn" aria-label="Describe the action">
  <svg aria-hidden="true">...</svg>
</button>`,
    explanation: "Add aria-label to describe the button's action. Hide decorative icons from screen readers with aria-hidden.",
    effort: "trivial",
    impact: "high",
  }),

  "input-label-check": (issue) => ({
    issueId: `input-${Date.now()}`,
    category: issue.category,
    description: issue.description,
    before: `<input type="text" name="email" placeholder="Enter email" />`,
    after: `<label for="email-input" class="visually-hidden">Email address</label>
<input type="text" id="email-input" name="email" placeholder="Enter email" aria-describedby="email-hint" />
<span id="email-hint" class="hint">We'll never share your email</span>`,
    explanation: "Add an explicit label (visible or visually-hidden). Use aria-describedby for hints. Labels provide context for both screen readers and AI agents.",
    effort: "easy",
    impact: "high",
  }),

  "custom-select-check": (issue) => ({
    issueId: `select-${Date.now()}`,
    category: issue.category,
    description: issue.description,
    before: `<div class="custom-select" onclick="toggle()">
  <span class="selected">Select option</span>
  <div class="options" hidden>
    <div data-value="1">Option 1</div>
    <div data-value="2">Option 2</div>
  </div>
</div>`,
    after: `<div class="custom-select" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-label="Select an option">
  <span class="selected" id="selected-value">Select option</span>
  <div class="options" role="listbox" hidden>
    <div role="option" data-value="1" tabindex="0">Option 1</div>
    <div role="option" data-value="2" tabindex="0">Option 2</div>
  </div>
</div>

<!-- Better: Use native select with custom styling -->
<select name="options" class="styled-select">
  <option value="">Select option</option>
  <option value="1">Option 1</option>
  <option value="2">Option 2</option>
</select>`,
    explanation: "Either add proper ARIA roles (combobox, listbox, option) to custom selects, or better yet, use native <select> with CSS styling. Native selects work better with AI agents.",
    effort: "medium",
    impact: "high",
  }),

  "dynamic-content-check": (issue) => ({
    issueId: `dynamic-${Date.now()}`,
    category: issue.category,
    description: issue.description,
    before: `<div class="infinite-scroll" onscroll="loadMore()">
  <div class="items">...</div>
  <div class="loading-spinner" hidden>Loading...</div>
</div>`,
    after: `<div class="paginated-content">
  <div class="items">...</div>
  <nav aria-label="Pagination">
    <a href="?page=1" aria-current="page">1</a>
    <a href="?page=2">2</a>
    <a href="?page=3">3</a>
    <a href="?page=4">Next</a>
  </nav>
</div>

<!-- If infinite scroll is required, add a fallback -->
<div class="items" aria-live="polite">...</div>
<button id="load-more" aria-describedby="load-status">Load more items</button>
<span id="load-status" class="visually-hidden">Loading additional items</span>`,
    explanation: "Replace infinite scroll with pagination links that AI agents can follow. If infinite scroll is required, add a 'Load more' button as fallback and use aria-live regions.",
    effort: "hard",
    impact: "high",
  }),

  "link-text-check": (issue) => ({
    issueId: `link-${Date.now()}`,
    category: issue.category,
    description: issue.description,
    before: `<a href="/docs">Click here</a>
<a href="/pricing">Read more</a>`,
    after: `<a href="/docs">View documentation</a>
<a href="/pricing">See pricing details</a>`,
    explanation: "Use descriptive link text that explains where the link goes. Avoid 'click here', 'read more', 'learn more' - these are meaningless out of context.",
    effort: "trivial",
    impact: "medium",
  }),

  "navigation-structure-check": (issue) => ({
    issueId: `nav-${Date.now()}`,
    category: issue.category,
    description: issue.description,
    before: `<div class="nav">
  <div class="nav-item"><a href="/">Home</a></div>
  <div class="nav-item"><a href="/about">About</a></div>
  <div class="nav-item"><a href="/contact">Contact</a></div>
</div>`,
    after: `<nav aria-label="Main navigation">
  <ul>
    <li><a href="/">Home</a></li>
    <li><a href="/about">About</a></li>
    <li><a href="/contact">Contact</a></li>
  </ul>
</nav>

<!-- Add breadcrumbs for deep pages -->
<nav aria-label="Breadcrumb">
  <ol>
    <li><a href="/">Home</a></li>
    <li><a href="/products">Products</a></li>
    <li aria-current="page">Widget Pro</li>
  </ol>
</nav>`,
    explanation: "Use semantic <nav> with aria-label to distinguish multiple navigations. Add breadcrumbs for pages more than 2 levels deep. Use lists for nav items.",
    effort: "easy",
    impact: "medium",
  }),

  "actionable-elements-check": (issue) => ({
    issueId: `action-${Date.now()}`,
    category: issue.category,
    description: issue.description,
    before: `<div class="btn" onclick="submit()">Submit</div>
<span class="link" onclick="navigate('/home')">Go Home</span>`,
    after: `<button type="submit">Submit</button>
<a href="/home">Go Home</a>

<!-- If JS behavior is required -->
<button type="button" onclick="submit()">Submit</button>`,
    explanation: "Use native interactive elements (<button>, <a>) instead of divs/spans with click handlers. Native elements have built-in keyboard support and are easier for AI agents to identify.",
    effort: "easy",
    impact: "high",
  }),

  "state-persistence-check": (issue) => ({
    issueId: `state-${Date.now()}`,
    category: issue.category,
    description: issue.description,
    before: `<form action="/purchase" method="POST">
  <input type="hidden" name="item" value="widget-123" />
  <button type="submit">Buy Now</button>
</form>`,
    after: `<form action="/purchase" method="POST">
  <input type="hidden" name="item" value="widget-123" />
  <input type="hidden" name="_csrf" value="{{csrfToken}}" />
  <button type="submit" data-action="purchase" data-confirms="true">Buy Now</button>
</form>

<!-- Add confirmation for destructive actions -->
<button type="submit"
  data-action="delete"
  data-confirms="true"
  data-confirm-message="Are you sure you want to delete this item?">
  Delete
</button>`,
    explanation: "Mark non-idempotent actions with data attributes so AI agents can identify state-changing operations. Include CSRF tokens and add confirmation prompts for destructive actions.",
    effort: "medium",
    impact: "high",
  }),

  "machine-metadata-check": (issue) => ({
    issueId: `meta-${Date.now()}`,
    category: issue.category,
    description: issue.description,
    before: `<head>
  <title>My Site</title>
</head>`,
    after: `<head>
  <title>My Site - Brief description</title>
  <meta name="description" content="Clear description of page content" />

  <!-- OpenGraph for social/AI context -->
  <meta property="og:title" content="My Site" />
  <meta property="og:description" content="Clear description" />
  <meta property="og:type" content="website" />

  <!-- JSON-LD for structured data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "My Site",
    "url": "https://example.com",
    "description": "Clear description"
  }
  </script>
</head>`,
    explanation: "Add OpenGraph meta tags for social context. Include JSON-LD structured data for machine-readable semantics. Both help AI agents understand page purpose.",
    effort: "easy",
    impact: "high",
  }),
};

/**
 * Default patch template for unknown issue types
 */
/**
 * ROI impact for a patch: how much is fixing this worth, not how bad it is.
 * Severity says how bad; effort says how expensive; impact ranks the trade.
 */
function deriveImpact(
  severity: AgentReadyIssue["severity"],
  effort: RemediationPatch["effort"],
): RemediationPatch["impact"] {
  if (severity === "critical" || severity === "high") return "high";
  // A cheap fix is worth doing even for a middling issue.
  if (effort === "trivial" && severity === "medium") return "high";
  if (severity === "medium") return "medium";
  return effort === "trivial" ? "medium" : "low";
}

function createDefaultPatch(issue: AgentReadyIssue): RemediationPatch {
  // Classify effort based on issue category — single-attribute additions are trivial
  const effort: RemediationPatch["effort"] =
    issue.category === "findability" ? "trivial" :
    issue.category === "agentPerceivability" && issue.detectionMethod?.includes("alt-text") ? "trivial" :
    issue.category === "agentPerceivability" && issue.detectionMethod?.includes("aria") ? "trivial" :
    "medium";

  // Use the audit's codeExample. For a findability finding it is the element's
  // real opening tag plus a data-testid, e.g.
  //   <button data-testid="previous-slide" class="p-2" aria-label="Previous slide">
  //
  // This used to SYNTHESISE markup for any findability issue whose example was
  // missing or contained ">...</":
  //   <${tag} data-testid="${tag}-<random>" aria-label="${tag} action">...</${tag}>
  // Measured 2026-10-06, that replaced aria-label="Previous slide" on
  // cbrowser.ai's carousel with "button action", and for page-level findings,
  // which have no element to patch, it produced
  //   <title data-testid="title-l6c1" aria-label="title action">...</title>
  // and <document ... aria-label="document action">. A guessed tag with an
  // invented name is never a correct patch, so when the audit has no markup
  // fix the patch says so and points at the recommendation. (2026-10-07)
  const after = issue.codeExample || "<!-- See recommendation below -->";

  return {
    issueId: `issue-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    category: issue.category,
    description: issue.description,
    // Real markup when the audit captured it, so the patch is a genuine diff
    // rather than "a" versus a suggested element. Falls back to the selector
    // for detections that do not carry an element. (2026-07-29)
    // Real markup when the audit captured it. Otherwise say so explicitly rather
    // than emitting a bare selector like "nav", which reads as broken markup: a
    // great many findings are about an element being ABSENT, where there is
    // genuinely nothing to replace and a diff is the wrong shape entirely.
    before: issue.elementHtml
      || (issue.element ? `<!-- no markup captured for "${issue.element}" — this finding is about what is missing, not what to replace -->` : "<!-- Current implementation -->"),
    ...(issue.elementHtmlTruncated ? { beforeTruncated: true } : {}),
    after,
    explanation: issue.recommendation || "Review the element and apply accessibility best practices.",
    effort,
    // `impact` is deliberately NOT a restatement of the audit's `severity` — it
    // is the ROI axis the dashboard sorts by, "highest impact / lowest effort
    // first" (see AGENTS.md). That design is fine. The bug was this line: a
    // constant per category, so every findability finding came back "high" and
    // the sort had nothing to sort on. With 26 detection methods in the audit
    // and 9 templates here, most findings reach this default, which is why a
    // single audit returned 12 patches all rated high. (2026-07-29)
    //
    // Now derived from the issue's own severity, keeping the documented case
    // where a trivial fix is high ROI even for a minor issue ("changing one
    // aria-label is trivial+high").
    impact: deriveImpact(issue.severity, effort),
  };
}

/**
 * Generate a remediation patch for a single audit issue
 */
export function generatePatch(issue: AgentReadyIssue): RemediationPatch {
  const template = PATCH_TEMPLATES[issue.detectionMethod];
  if (template) {
    return template(issue);
  }
  return createDefaultPatch(issue);
}

/**
 * Generate remediation patches for all issues in an audit result
 */
export function generateRemediationPatches(
  auditResult: AgentReadyAuditResult
): RemediationPatch[] {
  const patches: RemediationPatch[] = [];

  for (const issue of auditResult.issues) {
    const patch = generatePatch(issue);
    patches.push(patch);
  }

  // Sort by impact (high first) then effort (easy first)
  const impactOrder = { high: 0, medium: 1, low: 2 };
  const effortOrder = { trivial: 0, easy: 1, medium: 2, hard: 3 };

  patches.sort((a, b) => {
    const impactDiff = impactOrder[a.impact] - impactOrder[b.impact];
    if (impactDiff !== 0) return impactDiff;
    return effortOrder[a.effort] - effortOrder[b.effort];
  });

  return patches;
}

/**
 * Get a summary of patches grouped by category
 */
export function summarizePatches(patches: RemediationPatch[]): {
  total: number;
  byCategory: Record<string, number>;
  byEffort: Record<string, number>;
  byImpact: Record<string, number>;
  quickWins: number; // trivial/easy + high impact
} {
  const byCategory: Record<string, number> = {};
  const byEffort: Record<string, number> = {};
  const byImpact: Record<string, number> = {};
  let quickWins = 0;

  for (const patch of patches) {
    byCategory[patch.category] = (byCategory[patch.category] || 0) + 1;
    byEffort[patch.effort] = (byEffort[patch.effort] || 0) + 1;
    byImpact[patch.impact] = (byImpact[patch.impact] || 0) + 1;

    if (
      (patch.effort === "trivial" || patch.effort === "easy") &&
      patch.impact === "high"
    ) {
      quickWins++;
    }
  }

  return {
    total: patches.length,
    byCategory,
    byEffort,
    byImpact,
    quickWins,
  };
}
