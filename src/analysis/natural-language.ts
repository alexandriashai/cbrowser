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

/**
 * AI-powered semantic element finding.
 * Examples: "the cheapest product", "login form", "main navigation"
 */
export async function findElementByIntent(
  browser: CBrowser,
  intent: string,
  options: FindByIntentOptions = {}
): Promise<{ selector: string; confidence: number; description: string; alternatives?: Array<{ selector: string; text: string; tag: string; confidence: number }>; aiSuggestion?: string; debugScreenshot?: string } | null> {
  const page = await (browser as any).getPage();

  // Type for extracted elements
  type PageElement = {
    tag: string;
    text: string;
    classes: string;
    id: string;
    role: string;
    type: string;
    price?: string;
    selector: string;
  };

  // Extract page structure for AI analysis
  const pageData: PageElement[] = await page.evaluate(() => {
    const elements: Array<{
      tag: string;
      text: string;
      classes: string;
      id: string;
      role: string;
      type: string;
      price?: string;
      selector: string;
    }> = [];

    // Find interactive elements
    const interactives = document.querySelectorAll(
      "button, a, input, select, [role='button'], [onclick], .btn, .card, .product, [data-price], .price"
    );

    interactives.forEach((el, i) => {
      const text = (el as HTMLElement).innerText?.trim().slice(0, 100) || "";
      const priceMatch = text.match(/\$[\d,.]+|\d+\.\d{2}/);

      elements.push({
        tag: el.tagName.toLowerCase(),
        text,
        classes: el.className.toString().slice(0, 100),
        id: el.id,
        role: el.getAttribute("role") || "",
        type: (el as HTMLInputElement).type || "",
        price: priceMatch ? priceMatch[0] : undefined,
        selector: el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}:nth-of-type(${i + 1})`,
      });
    });

    return elements;
  });

  // Intent matching logic
  const intentLower = intent.toLowerCase();

  // Price-based intents
  if (intentLower.includes("cheapest") || intentLower.includes("lowest price")) {
    const withPrices = pageData.filter(el => el.price);
    if (withPrices.length > 0) {
      const sorted = withPrices.sort((a, b) => {
        const priceA = parseFloat(a.price!.replace(/[$,]/g, ""));
        const priceB = parseFloat(b.price!.replace(/[$,]/g, ""));
        return priceA - priceB;
      });
      return {
        selector: sorted[0].selector,
        confidence: 0.8,
        description: `Cheapest item: ${sorted[0].text.slice(0, 50)} (${sorted[0].price})`,
      };
    }
  }

  if (intentLower.includes("most expensive") || intentLower.includes("highest price")) {
    const withPrices = pageData.filter(el => el.price);
    if (withPrices.length > 0) {
      const sorted = withPrices.sort((a, b) => {
        const priceA = parseFloat(a.price!.replace(/[$,]/g, ""));
        const priceB = parseFloat(b.price!.replace(/[$,]/g, ""));
        return priceB - priceA;
      });
      return {
        selector: sorted[0].selector,
        confidence: 0.8,
        description: `Most expensive: ${sorted[0].text.slice(0, 50)} (${sorted[0].price})`,
      };
    }
  }

  // Form-based intents
  if (intentLower.includes("login") || intentLower.includes("sign in")) {
    const loginBtn = pageData.find(el =>
      el.text.toLowerCase().includes("login") ||
      el.text.toLowerCase().includes("sign in") ||
      el.classes.includes("login")
    );
    if (loginBtn) {
      return { selector: loginBtn.selector, confidence: 0.9, description: "Login button/form" };
    }
  }

  if (intentLower.includes("search")) {
    const searchInput = pageData.find(el =>
      el.type === "search" ||
      el.classes.includes("search") ||
      el.id.includes("search")
    );
    if (searchInput) {
      return { selector: searchInput.selector, confidence: 0.9, description: "Search input" };
    }
  }

  // Text-based matching
  const textMatch = pageData.find(el =>
    el.text.toLowerCase().includes(intentLower) ||
    el.classes.toLowerCase().includes(intentLower)
  );
  if (textMatch) {
    return { selector: textMatch.selector, confidence: 0.7, description: `Matched: ${textMatch.text.slice(0, 50)}` };
  }

  // No match found — return null, or verbose data if requested
  if (options.verbose) {
    // Build alternatives from partial matches
    const alternatives = pageData
      .filter(el => el.text.length > 0)
      .slice(0, 10)
      .map(el => {
        // Compute similarity score based on word overlap
        const intentWords = intentLower.split(/\s+/);
        const elText = el.text.toLowerCase();
        const matchingWords = intentWords.filter(w => w.length > 2 && elText.includes(w));
        const confidence = intentWords.length > 0 ? matchingWords.length / intentWords.length * 0.6 : 0;
        return {
          selector: el.selector,
          text: el.text.slice(0, 60),
          tag: el.tag,
          confidence: Math.round(confidence * 100) / 100,
        };
      })
      .sort((a, b) => b.confidence - a.confidence);

    const list = alternatives.slice(0, 8).map(a => `  • ${a.tag}: "${a.text}" → ${a.selector}`).join("\n");
    const aiSuggestion = `No element matching "${intent}" found.\n\nAvailable interactive elements:\n${list}\n\nTry using the exact text or a more specific description.`;

    // Return a "not found" result with verbose info instead of null
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
