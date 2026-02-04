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

const SEMANTIC_ELEMENTS = new Set(["button", "nav", "main", "header", "footer", "article", "aside", "section", "form", "dialog"]);

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

  // Extract enriched page structure with ARIA attributes
  const pageData: EnrichedPageElement[] = await page.evaluate(() => {
    const semanticSet = new Set(["BUTTON", "NAV", "MAIN", "HEADER", "FOOTER", "ARTICLE", "ASIDE", "SECTION", "FORM", "DIALOG"]);
    const elements: Array<{
      tag: string; text: string; classes: string; id: string; role: string; type: string;
      ariaLabel: string; ariaLabelledby: string; name: string; title: string;
      dataTestId: string; placeholder: string; price?: string; isSemanticElement: boolean;
    }> = [];

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
      });
    });

    return elements;
  });

  const intentLower = intent.toLowerCase();

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

  // Form-based intents
  if (intentLower.includes("login") || intentLower.includes("sign in")) {
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
    const searchEl = pageData.find(el =>
      el.type === "search" ||
      el.ariaLabel.toLowerCase().includes("search") ||
      el.classes.includes("search") ||
      el.id.includes("search") ||
      el.placeholder.toLowerCase().includes("search")
    );
    if (searchEl) {
      return buildElementResult(searchEl, "Search input", 0.9);
    }
  }

  // Navigation intent
  if (intentLower.includes("navigation") || intentLower.includes("nav") || intentLower.includes("menu")) {
    const navEl = pageData.find(el =>
      el.tag === "nav" || el.role === "navigation" || el.role === "menu" || el.ariaLabel.toLowerCase().includes("nav")
    );
    if (navEl) {
      return buildElementResult(navEl, "Navigation", 0.9);
    }
  }

  // ARIA-label matching (new: search by aria-label content)
  const ariaMatch = pageData.find(el =>
    el.ariaLabel.toLowerCase().includes(intentLower)
  );
  if (ariaMatch) {
    return buildElementResult(ariaMatch, `ARIA match: ${ariaMatch.ariaLabel.slice(0, 50)}`, 0.85);
  }

  // Text-based matching
  const textMatch = pageData.find(el =>
    el.text.toLowerCase().includes(intentLower) ||
    el.classes.toLowerCase().includes(intentLower)
  );
  if (textMatch) {
    return buildElementResult(textMatch, `Matched: ${textMatch.text.slice(0, 50)}`, 0.7);
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
