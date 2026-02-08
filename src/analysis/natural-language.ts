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
 * Natural Language API for Browser Automation
 *
 * Tier 3: Provides natural language command parsing and execution for browser automation.
 * Allows commands like "click on the login button" or "fill 'hello' in the search box".
 */

import type { CBrowser } from "../browser.js";

/**
 * Natural language command patterns.
 */
const NL_PATTERNS: Array<{
  pattern: RegExp;
  action: string;
  extract: (match: RegExpMatchArray) => Record<string, string>;
}> = [
  // Navigation
  { pattern: /^(?:go to|navigate to|open|visit)\s+(.+)$/i, action: "navigate", extract: (m) => ({ url: m[1] }) },
  { pattern: /^(?:go\s+)?back$/i, action: "back", extract: () => ({}) },
  { pattern: /^(?:go\s+)?forward$/i, action: "forward", extract: () => ({}) },
  { pattern: /^refresh|reload$/i, action: "reload", extract: () => ({}) },

  // Clicking
  { pattern: /^click(?:\s+on)?\s+(?:the\s+)?["']?(.+?)["']?$/i, action: "click", extract: (m) => ({ selector: m[1] }) },
  { pattern: /^press(?:\s+the)?\s+["']?(.+?)["']?(?:\s+button)?$/i, action: "click", extract: (m) => ({ selector: m[1] }) },
  { pattern: /^tap(?:\s+on)?\s+["']?(.+?)["']?$/i, action: "click", extract: (m) => ({ selector: m[1] }) },

  // Form filling
  { pattern: /^(?:type|enter|input|fill(?:\s+in)?)\s+["'](.+?)["']\s+(?:in(?:to)?|on)\s+(?:the\s+)?["']?(.+?)["']?$/i, action: "fill", extract: (m) => ({ value: m[1], selector: m[2] }) },
  { pattern: /^(?:fill(?:\s+in)?|set)\s+(?:the\s+)?["']?(.+?)["']?\s+(?:to|with|as)\s+["'](.+?)["']$/i, action: "fill", extract: (m) => ({ selector: m[1], value: m[2] }) },

  // Selecting
  { pattern: /^select\s+["'](.+?)["']\s+(?:from|in)\s+(?:the\s+)?["']?(.+?)["']?$/i, action: "select", extract: (m) => ({ value: m[1], selector: m[2] }) },
  { pattern: /^choose\s+["'](.+?)["']$/i, action: "click", extract: (m) => ({ selector: m[1] }) },

  // Screenshots
  { pattern: /^(?:take\s+a?\s*)?screenshot(?:\s+as\s+["']?(.+?)["']?)?$/i, action: "screenshot", extract: (m) => ({ path: m[1] || "" }) },
  { pattern: /^capture(?:\s+the)?\s+(?:page|screen)$/i, action: "screenshot", extract: () => ({}) },

  // Waiting
  { pattern: /^wait(?:\s+for)?\s+(\d+)\s*(?:ms|milliseconds?)?$/i, action: "wait", extract: (m) => ({ ms: m[1] }) },
  { pattern: /^wait(?:\s+for)?\s+(\d+)\s*(?:s|seconds?)$/i, action: "waitSeconds", extract: (m) => ({ seconds: m[1] }) },
  { pattern: /^wait(?:\s+for)?\s+["']?(.+?)["']?(?:\s+to\s+appear)?$/i, action: "waitFor", extract: (m) => ({ selector: m[1] }) },

  // Scrolling
  { pattern: /^scroll\s+(?:to\s+)?(?:the\s+)?(top|bottom)$/i, action: "scroll", extract: (m) => ({ direction: m[1] }) },
  { pattern: /^scroll\s+(up|down)(?:\s+(\d+))?$/i, action: "scrollBy", extract: (m) => ({ direction: m[1], amount: m[2] || "300" }) },

  // Extraction
  { pattern: /^(?:get|extract|find)\s+(?:all\s+)?(?:the\s+)?(.+)$/i, action: "extract", extract: (m) => ({ what: m[1] }) },
];

/**
 * Parse natural language into browser action.
 */
export function parseNaturalLanguage(command: string): { action: string; params: Record<string, string> } | null {
  const trimmed = command.trim();

  for (const { pattern, action, extract } of NL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return { action, params: extract(match) };
    }
  }

  return null;
}

/**
 * Execute a natural language command.
 */
export async function executeNaturalLanguage(browser: CBrowser, command: string): Promise<{
  success: boolean;
  action: string;
  result?: unknown;
  error?: string;
}> {
  const parsed = parseNaturalLanguage(command);

  if (!parsed) {
    return { success: false, action: "unknown", error: `Could not parse command: "${command}"` };
  }

  const { action, params } = parsed;

  try {
    let result: unknown;

    switch (action) {
      case "navigate":
        result = await browser.navigate(params.url);
        break;
      case "click":
        result = await browser.click(params.selector);
        break;
      case "fill":
        result = await browser.fill(params.selector, params.value);
        break;
      case "screenshot":
        result = await browser.screenshot(params.path || undefined);
        break;
      case "wait":
        await new Promise(r => setTimeout(r, parseInt(params.ms)));
        result = { waited: parseInt(params.ms) };
        break;
      case "waitSeconds":
        await new Promise(r => setTimeout(r, parseInt(params.seconds) * 1000));
        result = { waited: parseInt(params.seconds) * 1000 };
        break;
      case "extract":
        result = await browser.extract(params.what);
        break;
      default:
        return { success: false, action, error: `Unsupported action: ${action}` };
    }

    return { success: true, action, result };
  } catch (e: any) {
    return { success: false, action, error: e.message };
  }
}

/**
 * Execute multiple natural language commands in sequence.
 */
export async function executeNaturalLanguageScript(
  browser: CBrowser,
  commands: string[]
): Promise<Array<{ command: string; success: boolean; action: string; result?: unknown; error?: string }>> {
  const results = [];

  for (const command of commands) {
    if (!command.trim() || command.startsWith("#")) continue; // Skip empty lines and comments
    const result = await executeNaturalLanguage(browser, command);
    results.push({ command, ...result });
    if (!result.success) break; // Stop on first error
  }

  return results;
}

// ============================================================================
// Tier 4: Visual AI Understanding (v4.0.0)
// ============================================================================

/** Options for findElementByIntent */
export interface FindByIntentOptions {
  verbose?: boolean;
  debugDir?: string;
}

import type { SelectorStrategyType } from "../types.js";

/** Enriched element data extracted from the page */
type EnrichedPageElement = {
  tag: string;
  text: string;
  classes: string;
  id: string;
  role: string;
  type: string;
  ariaLabel: string;
  ariaLabelledby: string;
  name: string;
  title: string;
  dataTestId: string;
  placeholder: string;
  price?: string;
  isSemanticElement: boolean;
  container?: string;  // v11.2.0: Parent container (nav, header, footer, etc.)
};

/** A selector candidate with strategy info */
interface SelectorCandidate {
  selector: string;
  type: SelectorStrategyType;
  confidence: number;
}

/** ARIA-first selector priority strategies (highest to lowest) */
const SELECTOR_PRIORITY: Array<{
  name: SelectorStrategyType;
  extract: (el: EnrichedPageElement) => string | null;
  toSelector: (value: string, el: EnrichedPageElement) => string;
  confidence: number;
}> = [
  {
    name: "aria-label",
    extract: (el) => el.ariaLabel || null,
    toSelector: (v) => `[aria-label="${v}"]`,
    confidence: 0.95,
  },
  {
    name: "aria-labelledby",
    extract: (el) => el.ariaLabelledby || null,
    toSelector: (v) => `[aria-labelledby="${v}"]`,
    confidence: 0.93,
  },
  {
    name: "role",
    extract: (el) => el.role || null,
    toSelector: (v, el) => el.text ? `${el.tag}[role="${v}"]` : `[role="${v}"]`,
    confidence: 0.90,
  },
  {
    name: "semantic-element",
    extract: (el) => el.isSemanticElement ? el.tag : null,
    toSelector: (v) => v,
    confidence: 0.85,
  },
  {
    name: "input-type",
    extract: (el) => el.tag === "input" && el.type ? el.type : null,
    toSelector: (v) => `input[type="${v}"]`,
    confidence: 0.80,
  },
  {
    name: "id",
    extract: (el) => el.id || null,
    toSelector: (v) => `#${v}`,
    confidence: 0.85,
  },
  {
    name: "data-testid",
    extract: (el) => el.dataTestId || null,
    toSelector: (v) => `[data-testid="${v}"]`,
    confidence: 0.82,
  },
  {
    name: "name",
    extract: (el) => el.name || null,
    toSelector: (v) => `[name="${v}"]`,
    confidence: 0.80,
  },
  {
    name: "css-class",
    extract: (el) => {
      const cls = el.classes.split(" ").find((c: string) => c.length > 3 && !c.includes("_") && !/^[a-z]{1,2}\d/.test(c));
      return cls || null;
    },
    toSelector: (v) => `.${v}`,
    confidence: 0.60,
  },
];

const _SEMANTIC_ELEMENTS = new Set(["button", "nav", "main", "header", "footer", "article", "aside", "section", "form", "dialog"]);

/**
 * Generate priority-ordered selectors for an element.
 */
function generatePrioritySelectors(el: EnrichedPageElement): SelectorCandidate[] {
  const candidates: SelectorCandidate[] = [];
  for (const strategy of SELECTOR_PRIORITY) {
    const value = strategy.extract(el);
    if (value) {
      candidates.push({
        selector: strategy.toSelector(value, el),
        type: strategy.name,
        confidence: strategy.confidence,
      });
    }
  }
  return candidates;
}

/**
 * Calculate accessibility score (0-1) for an element.
 */
function calculateAccessibilityScore(el: EnrichedPageElement): number {
  let score = 0;
  if (el.ariaLabel) score += 0.3;
  if (el.role) score += 0.2;
  if (el.isSemanticElement) score += 0.2;
  // Label association check (for inputs)
  if (el.tag === "input" || el.tag === "textarea" || el.tag === "select") {
    if (el.ariaLabel || el.ariaLabelledby || el.placeholder) score += 0.2;
  } else {
    // Non-input elements get points for having text content
    if (el.text.length > 0) score += 0.2;
  }
  if (el.text.length > 0 || el.ariaLabel) score += 0.1;
  return Math.min(1, Math.round(score * 100) / 100);
}

/**
 * Build result for a matched element with priority selectors.
 */
function buildElementResult(
  el: EnrichedPageElement,
  description: string,
  baseConfidence: number
): {
  selector: string;
  confidence: number;
  description: string;
  selectorType: SelectorStrategyType;
  accessibilityScore: number;
  alternatives: Array<{ selector: string; text: string; tag: string; type: SelectorStrategyType; confidence: number }>;
} {
  const candidates = generatePrioritySelectors(el);
  const best = candidates[0] || { selector: el.tag, type: "nth-of-type" as SelectorStrategyType, confidence: 0.3 };

  return {
    selector: best.selector,
    confidence: Math.max(best.confidence, baseConfidence),
    description,
    selectorType: best.type,
    accessibilityScore: calculateAccessibilityScore(el),
    alternatives: candidates.slice(1).map(c => ({
      selector: c.selector,
      text: el.text.slice(0, 60),
      tag: el.tag,
      type: c.type,
      confidence: c.confidence,
    })),
  };
}

/**
 * AI-powered semantic element finding with accessibility-first selectors.
 * Selector priority: ARIA > semantic HTML > ID > name > class.
 * Returns selectorType, accessibilityScore, and alternatives.
 *
 * Examples: "the cheapest product", "login form", "main navigation"
 */
export async function findElementByIntent(
  browser: CBrowser,
  intent: string,
  options: FindByIntentOptions = {}
): Promise<{
  selector: string;
  confidence: number;
  description: string;
  selectorType?: SelectorStrategyType;
  accessibilityScore?: number;
  alternatives?: Array<{ selector: string; text: string; tag: string; type: SelectorStrategyType; confidence: number }>;
  aiSuggestion?: string;
  debugScreenshot?: string;
} | null> {
  const page = await (browser as any).getPage();

  // Extract enriched page structure with ARIA attributes and container context
  // v11.2.0: Added container tracking for contextual matching ("in the navigation")
  const pageData: EnrichedPageElement[] = await page.evaluate(() => {
    const semanticSet = new Set(["BUTTON", "NAV", "MAIN", "HEADER", "FOOTER", "ARTICLE", "ASIDE", "SECTION", "FORM", "DIALOG"]);
    const containerTags = new Set(["NAV", "HEADER", "FOOTER", "MAIN", "ASIDE", "SECTION", "FORM"]);
    const elements: Array<{
      tag: string; text: string; classes: string; id: string; role: string; type: string;
      ariaLabel: string; ariaLabelledby: string; name: string; title: string;
      dataTestId: string; placeholder: string; price?: string; isSemanticElement: boolean;
      container: string;
    }> = [];

    // Find the nearest semantic container for an element
    const getContainer = (el: Element): string => {
      let parent = el.parentElement;
      while (parent) {
        if (containerTags.has(parent.tagName)) {
          return parent.tagName.toLowerCase();
        }
        const role = parent.getAttribute("role");
        if (role === "navigation") return "nav";
        if (role === "banner") return "header";
        if (role === "contentinfo") return "footer";
        if (role === "main") return "main";
        if (role === "complementary") return "aside";
        parent = parent.parentElement;
      }
      return "";
    };

    const interactives = document.querySelectorAll(
      "button, a, input, select, textarea, [role='button'], [role='link'], [role='tab'], [role='menuitem'], [onclick], nav, main, header, footer, article, aside, section, form, .btn, .card, .product, [data-price], .price"
    );

    interactives.forEach((el) => {
      const htmlEl = el as HTMLElement;
      const inputEl = el as HTMLInputElement;
      const text = htmlEl.innerText?.trim().slice(0, 100) || "";
      const priceMatch = text.match(/\$[\d,.]+|\d+\.\d{2}/);

      elements.push({
        tag: el.tagName.toLowerCase(),
        text,
        classes: el.className?.toString().slice(0, 100) || "",
        id: el.id || "",
        role: el.getAttribute("role") || "",
        type: inputEl.type || "",
        ariaLabel: el.getAttribute("aria-label") || "",
        ariaLabelledby: el.getAttribute("aria-labelledby") || "",
        name: el.getAttribute("name") || "",
        title: el.getAttribute("title") || "",
        dataTestId: el.getAttribute("data-testid") || "",
        placeholder: inputEl.placeholder || "",
        price: priceMatch ? priceMatch[0] : undefined,
        isSemanticElement: semanticSet.has(el.tagName),
        container: getContainer(el),
      });
    });

    return elements;
  });

  const intentLower = intent.toLowerCase();

  // =========================================================================
  // Word-level fuzzy matching utilities (v10.10.0)
  // =========================================================================

  // Tokenize intent into meaningful words (remove stop words)
  const stopWords = new Set(["the", "a", "an", "to", "for", "of", "in", "on", "at", "is", "are", "that", "this", "it"]);
  const intentWords = intentLower
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w));

  // Extract ordinal position if present ("first", "second", "last", etc.)
  // v11.2.0: Added "last" ordinal support (-1 means last element)
  const ordinalMap: Record<string, number> = {
    first: 0, second: 1, third: 2, fourth: 3, fifth: 4,
    sixth: 5, seventh: 6, eighth: 7, ninth: 8, tenth: 9,
    "1st": 0, "2nd": 1, "3rd": 2, "4th": 3, "5th": 4,
    "6th": 5, "7th": 6, "8th": 7, "9th": 8, "10th": 9,
    last: -1, final: -1,
  };
  let targetIndex: number | null = null;
  for (const word of intentWords) {
    if (ordinalMap[word] !== undefined) {
      targetIndex = ordinalMap[word];
      break;
    }
  }

  // v11.2.0: Extract container context from intent ("in the navigation", "in the header")
  const containerContextMap: Record<string, string> = {
    navigation: "nav", nav: "nav", navbar: "nav", menu: "nav",
    header: "header", banner: "header", top: "header",
    footer: "footer", bottom: "footer",
    sidebar: "aside", aside: "aside",
    main: "main", content: "main",
    form: "form",
  };
  let requiredContainer: string | null = null;
  const inMatch = intentLower.match(/\b(?:in|inside|within)\s+(?:the\s+)?(\w+)/);
  if (inMatch) {
    const containerWord = inMatch[1];
    if (containerContextMap[containerWord]) {
      requiredContainer = containerContextMap[containerWord];
    }
  }

  // Calculate word overlap score between intent and element text
  // v11.2.0: Enhanced with container context awareness
  // v11.3.0: Added semantic role matching for spatial/structural intents
  const calculateWordScore = (el: EnrichedPageElement & { container?: string }): number => {
    // If we require a specific container and element is not in it, heavily penalize
    if (requiredContainer && el.container !== requiredContainer) {
      return 0.05; // Very low score but not zero (for debugging)
    }

    const elementText = `${el.text} ${el.ariaLabel} ${el.title} ${el.placeholder} ${el.name}`.toLowerCase();
    const elementWords = elementText.split(/\s+/).filter(w => w.length > 1);

    let matchCount = 0;
    let totalWeight = 0;

    // v11.3.0: Semantic role synonyms - map intent words to element structural properties
    // This enables "main navigation menu" to match <nav aria-label="Main"> with high confidence
    const semanticRoleMatches: Record<string, (el: EnrichedPageElement) => boolean> = {
      navigation: (e) => e.tag === "nav" || e.role === "navigation" || e.ariaLabel.toLowerCase().includes("nav"),
      nav: (e) => e.tag === "nav" || e.role === "navigation",
      menu: (e) => e.role === "menu" || e.role === "menubar" || e.role === "navigation" || e.tag === "nav",
      header: (e) => e.tag === "header" || e.role === "banner" || e.container === "header",
      footer: (e) => e.tag === "footer" || e.role === "contentinfo" || e.container === "footer",
      sidebar: (e) => e.tag === "aside" || e.role === "complementary",
      main: (e) => e.tag === "main" || e.role === "main" || e.ariaLabel.toLowerCase().includes("main") || e.container === "main",
      form: (e) => e.tag === "form" || e.role === "form",
      search: (e) => e.role === "search" || e.type === "search" || e.ariaLabel.toLowerCase().includes("search"),
      banner: (e) => e.role === "banner" || e.tag === "header",
    };

    // Count semantic matches and add them as weighted matches
    let semanticMatches = 0;
    for (const intentWord of intentWords) {
      const checker = semanticRoleMatches[intentWord];
      if (checker && checker(el)) {
        semanticMatches += 1;
        totalWeight += 1;
        matchCount += 1; // Full match for semantic role
      }
    }

    for (const intentWord of intentWords) {
      // Skip stop words, ordinals
      if (stopWords.has(intentWord) || ordinalMap[intentWord] !== undefined) continue;
      // Skip words already handled by semantic matching
      if (semanticRoleMatches[intentWord]) continue;
      totalWeight += 1;

      // Exact match
      if (elementWords.some(ew => ew === intentWord)) {
        matchCount += 1;
      }
      // Partial match (word contains intent word or vice versa)
      else if (elementWords.some(ew => ew.includes(intentWord) || intentWord.includes(ew))) {
        matchCount += 0.7;
      }
      // Check if element text contains the word directly
      else if (elementText.includes(intentWord)) {
        matchCount += 0.5;
      }
    }

    // Boost for tag/role matches
    if (intentWords.includes("link") && el.tag === "a") matchCount += 0.5;
    if (intentWords.includes("button") && (el.tag === "button" || el.role === "button")) matchCount += 0.5;
    if (intentWords.includes("input") && ["input", "textarea", "select"].includes(el.tag)) matchCount += 0.5;
    if (intentWords.includes("headline") && /^h[1-6]$/.test(el.tag)) matchCount += 0.5;
    if (intentWords.includes("story") && el.tag === "a" && el.text.length > 10) matchCount += 0.3;

    // v11.8.0: Boost inputs when intent implies typing/entering (issue #87)
    const typingKeywords = ["type", "enter", "fill", "input", "field", "textbox", "text"];
    const impliesTyping = typingKeywords.some(kw => intentWords.includes(kw));
    if (impliesTyping && ["input", "textarea"].includes(el.tag)) {
      matchCount += 0.6; // Strong boost for form inputs when typing is implied
    }
    // Also boost if intent has "where" + action verb (e.g., "where I type my username")
    if (intentLower.includes("where") && (intentLower.includes("type") || intentLower.includes("enter") || intentLower.includes("put"))) {
      if (["input", "textarea"].includes(el.tag)) {
        matchCount += 0.7;
      }
    }

    // v11.2.0: Boost elements that ARE in the requested container
    if (requiredContainer && el.container === requiredContainer) {
      matchCount += 0.3;
    }

    // v11.3.0: Bonus for multiple semantic matches (e.g., "main navigation menu" matching nav with aria-label="Main")
    if (semanticMatches >= 2) {
      matchCount += 0.2 * (semanticMatches - 1);
    }

    return totalWeight > 0 ? matchCount / totalWeight : 0;
  };

  // Price-based intents
  if (intentLower.includes("cheapest") || intentLower.includes("lowest price")) {
    const withPrices = pageData.filter(el => el.price);
    if (withPrices.length > 0) {
      const sorted = withPrices.sort((a, b) =>
        parseFloat(a.price!.replace(/[$,]/g, "")) - parseFloat(b.price!.replace(/[$,]/g, ""))
      );
      return buildElementResult(sorted[0], `Cheapest item: ${sorted[0].text.slice(0, 50)} (${sorted[0].price})`, 0.8);
    }
  }

  if (intentLower.includes("most expensive") || intentLower.includes("highest price")) {
    const withPrices = pageData.filter(el => el.price);
    if (withPrices.length > 0) {
      const sorted = withPrices.sort((a, b) =>
        parseFloat(b.price!.replace(/[$,]/g, "")) - parseFloat(a.price!.replace(/[$,]/g, ""))
      );
      return buildElementResult(sorted[0], `Most expensive: ${sorted[0].text.slice(0, 50)} (${sorted[0].price})`, 0.8);
    }
  }

  // =========================================================================
  // v11.11.0: Semantic role heuristics for button/submit intents (stress test fix)
  // "submit button", "login button", "click the button" → prioritize <button>, input[type=submit]
  // =========================================================================
  const buttonKeywords = ["button", "submit", "btn", "click"];
  const impliesButton = buttonKeywords.some(kw => intentWords.includes(kw));

  if (impliesButton) {
    // Get all button-like elements
    const buttonElements = pageData.filter(el =>
      el.tag === "button" ||
      el.type === "submit" ||
      el.role === "button" ||
      (el.tag === "input" && el.type === "submit") ||
      (el.tag === "a" && el.classes.includes("btn"))
    );

    if (buttonElements.length > 0) {
      // Extract action keyword from intent (login, submit, search, etc.)
      const actionKeywords = intentWords.filter(w =>
        !buttonKeywords.includes(w) && !stopWords.has(w) && ordinalMap[w] === undefined
      );

      // Score buttons by how well they match the action
      const scoredButtons = buttonElements.map(el => {
        const elText = `${el.text} ${el.ariaLabel} ${el.title} ${el.name}`.toLowerCase();
        let score = 0.5; // Base score for being a button

        for (const action of actionKeywords) {
          if (elText.includes(action)) score += 0.4;
          else if (elText.split(/\s+/).some(w => w.includes(action) || action.includes(w))) score += 0.2;
        }

        // Boost for submit type
        if (el.type === "submit") score += 0.1;

        return { el, score };
      }).sort((a, b) => b.score - a.score);

      // Return best match if score is reasonable
      if (scoredButtons[0].score >= 0.5) {
        const best = scoredButtons[0];
        return buildElementResult(best.el, `Button: ${best.el.text.slice(0, 30) || best.el.ariaLabel || "submit"}`, best.score);
      }
    }
  }

  // Form-based intents (only if not already handled by button matcher above)
  if ((intentLower.includes("login") || intentLower.includes("sign in")) && !impliesButton) {
    const loginEl = pageData.find(el =>
      el.text.toLowerCase().includes("login") ||
      el.text.toLowerCase().includes("sign in") ||
      el.ariaLabel.toLowerCase().includes("login") ||
      el.ariaLabel.toLowerCase().includes("sign in") ||
      el.classes.includes("login")
    );
    if (loginEl) {
      return buildElementResult(loginEl, "Login button/form", 0.9);
    }
  }

  if (intentLower.includes("search")) {
    // v11.6.0: Prioritize actual input elements over containers (forms, divs)
    // First try to find an actual input/textarea with search attributes
    const inputTags = new Set(["input", "textarea"]);
    const searchInput = pageData.find(el =>
      inputTags.has(el.tag) && (
        el.type === "search" ||
        el.ariaLabel.toLowerCase().includes("search") ||
        el.placeholder.toLowerCase().includes("search") ||
        el.name.toLowerCase().includes("search") ||
        el.id.toLowerCase().includes("search")
      )
    );
    if (searchInput) {
      return buildElementResult(searchInput, "Search input", 0.95);
    }

    // Fall back to any element with search in class/id (for custom search components)
    const searchEl = pageData.find(el =>
      el.type === "search" ||
      el.ariaLabel.toLowerCase().includes("search") ||
      el.classes.includes("search") ||
      el.id.includes("search") ||
      el.placeholder.toLowerCase().includes("search")
    );
    if (searchEl) {
      return buildElementResult(searchEl, "Search element", 0.85);
    }
  }

  // Navigation intent
  // v11.3.0: Enhanced to prioritize qualifiers like "main" in aria-labels
  if (intentLower.includes("navigation") || intentLower.includes("nav") || intentLower.includes("menu")) {
    const navElements = pageData.filter(el =>
      el.tag === "nav" || el.role === "navigation" || el.role === "menu" || el.role === "menubar" || el.ariaLabel.toLowerCase().includes("nav")
    );

    if (navElements.length > 0) {
      // Check for qualifiers like "main", "primary", "global", "site"
      const qualifiers = ["main", "primary", "global", "site", "top", "header"];
      const qualifierMatch = qualifiers.find(q => intentLower.includes(q));

      if (qualifierMatch) {
        // Prefer nav element with matching qualifier in aria-label
        const qualified = navElements.find(el =>
          el.ariaLabel.toLowerCase().includes(qualifierMatch)
        );
        if (qualified) {
          return buildElementResult(qualified, `Navigation (${qualifierMatch})`, 0.9);
        }
      }

      // Fall back to first nav element
      return buildElementResult(navElements[0], "Navigation", 0.85);
    }
  }

  // ARIA-label matching (new: search by aria-label content)
  const ariaMatch = pageData.find(el =>
    el.ariaLabel.toLowerCase().includes(intentLower)
  );
  if (ariaMatch) {
    return buildElementResult(ariaMatch, `ARIA match: ${ariaMatch.ariaLabel.slice(0, 50)}`, 0.85);
  }

  // =========================================================================
  // Word-level fuzzy matching (v10.10.0)
  // =========================================================================

  // Score all elements and find best matches
  const scoredElements = pageData
    .map(el => ({ el, score: calculateWordScore(el) }))
    .filter(({ score }) => score > 0.3) // Minimum threshold
    .sort((a, b) => b.score - a.score);

  // Handle ordinal positions ("first headline link", "second story", "last link")
  // v11.2.0: Added "last" support (-1 means last element)
  if (targetIndex !== null && scoredElements.length > 0) {
    let actualIndex: number;
    let ordinalLabel: string;

    if (targetIndex === -1) {
      // "last" - get the final matching element
      actualIndex = scoredElements.length - 1;
      ordinalLabel = "last";
    } else if (targetIndex < scoredElements.length) {
      actualIndex = targetIndex;
      ordinalLabel = `#${targetIndex + 1}`;
    } else {
      // Requested index out of bounds, fall through to regular matching
      actualIndex = -1;
      ordinalLabel = "";
    }

    if (actualIndex >= 0) {
      const match = scoredElements[actualIndex];
      const confidence = Math.min(0.95, 0.6 + match.score * 0.35);
      return buildElementResult(
        match.el,
        `Ordinal match ${ordinalLabel}: ${match.el.text.slice(0, 50)}`,
        confidence
      );
    }
  }

  // Return best match if score is high enough
  if (scoredElements.length > 0 && scoredElements[0].score > 0.4) {
    const best = scoredElements[0];
    const confidence = Math.min(0.95, 0.5 + best.score * 0.45);
    return buildElementResult(
      best.el,
      `Word match (${Math.round(best.score * 100)}%): ${best.el.text.slice(0, 50)}`,
      confidence
    );
  }

  // Legacy text-based matching as fallback
  const textMatch = pageData.find(el =>
    el.text.toLowerCase().includes(intentLower) ||
    el.classes.toLowerCase().includes(intentLower)
  );
  if (textMatch) {
    return buildElementResult(textMatch, `Text match: ${textMatch.text.slice(0, 50)}`, 0.6);
  }

  // No match found — return verbose data if requested
  if (options.verbose) {
    const alternatives = pageData
      .filter(el => el.text.length > 0 || el.ariaLabel.length > 0)
      .slice(0, 10)
      .map(el => {
        const intentWords = intentLower.split(/\s+/);
        const searchText = `${el.text} ${el.ariaLabel}`.toLowerCase();
        const matchingWords = intentWords.filter(w => w.length > 2 && searchText.includes(w));
        const confidence = intentWords.length > 0 ? matchingWords.length / intentWords.length * 0.6 : 0;
        const selectors = generatePrioritySelectors(el);
        const best = selectors[0];
        return {
          selector: best?.selector || el.tag,
          text: (el.ariaLabel || el.text).slice(0, 60),
          tag: el.tag,
          type: (best?.type || "nth-of-type") as SelectorStrategyType,
          confidence: Math.round(confidence * 100) / 100,
        };
      })
      .sort((a, b) => b.confidence - a.confidence);

    const list = alternatives.slice(0, 8).map(a => `  • ${a.tag}: "${a.text}" (${a.type}) → ${a.selector}`).join("\n");
    const aiSuggestion = `No element matching "${intent}" found.\n\nAvailable interactive elements:\n${list}\n\nTry using the exact text, aria-label, or a more specific description.`;

    return {
      selector: "",
      confidence: 0,
      description: "No match found",
      alternatives,
      aiSuggestion,
    };
  }

  return null;
}
