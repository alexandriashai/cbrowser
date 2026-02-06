/**
 * Competitive UX Benchmark Module
 *
 * Run identical cognitive journeys across multiple sites simultaneously.
 * Output: head-to-head comparison with friction analysis.
 */

import { chromium, type Browser, type Page, type BrowserContext } from "playwright";
import type {
  CompetitiveBenchmarkResult,
  CompetitiveBenchmarkOptions,
  SiteBenchmarkResult,
  SiteRanking,
  BenchmarkComparison,
  CompetitiveRecommendation,
  Persona,
  FocusHierarchy,
  FocusAreaType,
} from "../types.js";
import { getPersona, BUILTIN_PERSONAS } from "../personas.js";
import {
  getFocusHierarchy,
  inferTaskTypeFromGoal,
  calculateFocusPriority,
  getDistractionIgnoreRate,
  COMMON_DISTRACTIONS,
} from "../cognitive/focus-hierarchies.js";
import {
  runCognitiveJourney,
  isApiKeyConfigured,
  isCognitiveAvailable,
} from "../cognitive/index.js";

// ============================================================================
// Scoring Methodology & Disclaimers
// ============================================================================

/**
 * METHODOLOGY DISCLAIMER:
 *
 * CBrowser's competitive benchmark uses HEURISTIC estimates, not precise measurements.
 * Scores are derived from behavioral simulation and pattern detection, calibrated against
 * published UX research where available.
 *
 * Research-backed thresholds used:
 * - Page load abandonment: 53% at 3s (Google/SOASTA 2017)
 * - Form complexity: 7-8 fields optimal (Baymard Institute)
 * - Rage click detection: 3+ clicks in 1-2s indicates frustration (FullStory)
 *
 * Heuristic estimates (interpret as directional, not precise):
 * - Abandonment Risk: Letter grade (A-F) based on friction accumulation
 * - Confusion/Frustration: Relative scale based on detected friction points
 * - Site Score: Weighted composite for RANKING purposes only
 *
 * These scores are useful for comparing sites RELATIVE to each other,
 * not as absolute measurements of user behavior.
 */

// 1-10 scale with descriptive labels for abandonment risk
const ABANDONMENT_RISK_LABELS: Array<{ max: number; score: number; label: string }> = [
  { max: 10, score: 1, label: "Very Low" },
  { max: 20, score: 2, label: "Very Low" },
  { max: 30, score: 3, label: "Low" },
  { max: 40, score: 4, label: "Low-Medium" },
  { max: 50, score: 5, label: "Medium" },
  { max: 60, score: 6, label: "Medium" },
  { max: 70, score: 7, label: "Medium-High" },
  { max: 80, score: 8, label: "High" },
  { max: 90, score: 9, label: "Very High" },
  { max: 100, score: 10, label: "Very High" },
];

// ============================================================================
// Journey Simulation (Simplified cognitive journey)
// ============================================================================

interface JourneyState {
  patience: number;
  frustration: number;
  confusion: number;
  steps: number;
  frictionPoints: string[];
  startTime: number;
}

/**
 * Simulate a user journey toward a goal
 */
async function simulateJourney(
  page: Page,
  url: string,
  goal: string,
  persona: Persona,
  maxSteps: number,
  maxTime: number
): Promise<SiteBenchmarkResult> {
  const startTime = Date.now();
  const state: JourneyState = {
    patience: 100,
    frustration: 0,
    confusion: 0,
    steps: 0,
    frictionPoints: [],
    startTime,
  };

  let goalAchieved = false;
  let abandonmentReason: string | undefined;
  const screenshots: { start: string; end: string } = {
    start: '',
    end: '',
  };

  try {
    // Navigate to starting URL
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1000);

    // Take start screenshot
    const startBuffer = await page.screenshot();
    screenshots.start = startBuffer.toString("base64");

    // Check initial page state
    const initialAnalysis = await analyzePageForGoal(page, goal);

    if (initialAnalysis.goalReached) {
      goalAchieved = true;
    } else {
      // Simulate exploration toward goal
      for (let step = 0; step < maxSteps && !goalAchieved; step++) {
        // Check time limit
        if (Date.now() - startTime > maxTime * 1000) {
          abandonmentReason = "Time limit exceeded";
          break;
        }

        state.steps++;

        // Analyze current page for actions
        const pageAnalysis = await analyzePageForGoal(page, goal);

        if (pageAnalysis.goalReached) {
          goalAchieved = true;
          break;
        }

        // Check for friction points
        if (pageAnalysis.frictionPoints.length > 0) {
          state.frictionPoints.push(...pageAnalysis.frictionPoints);
          state.patience -= pageAnalysis.frictionPoints.length * 5;
          state.frustration += pageAnalysis.frictionPoints.length * 3;
        }

        // Try to take an action toward the goal
        const action = await findBestAction(page, goal, pageAnalysis);

        if (!action) {
          state.confusion += 10;
          state.patience -= 5;

          if (state.patience <= 20 || state.confusion >= 70) {
            abandonmentReason = "User became confused and lost";
            break;
          }

          // Try scrolling to find more options
          await page.evaluate(() => window.scrollBy(0, 300));
          await page.waitForTimeout(500);
          continue;
        }

        // Execute the action
        try {
          await executeAction(page, action);
          await page.waitForTimeout(1000);

          // Patience recovery on success
          state.patience = Math.min(100, state.patience + 2);
        } catch (e) {
          state.frictionPoints.push(`Failed to ${action.type}: ${action.target}`);
          state.frustration += 5;
          state.patience -= 10;

          if (state.patience <= 10) {
            abandonmentReason = "Too many failed interactions";
            break;
          }
        }

        // Check for patience exhaustion
        if (state.patience <= 0) {
          abandonmentReason = "User ran out of patience";
          break;
        }
      }
    }

    // Take end screenshot
    const endBuffer = await page.screenshot();
    screenshots.end = endBuffer.toString("base64");

  } catch (e) {
    abandonmentReason = `Error: ${(e as Error).message}`;
  }

  // Extract site name from URL
  const siteName = new URL(url).hostname.replace('www.', '');

  return {
    url,
    siteName,
    goalAchieved,
    abandonmentReason,
    totalTime: Date.now() - startTime,
    stepCount: state.steps,
    frictionPoints: [...new Set(state.frictionPoints)], // Dedupe
    confusionLevel: Math.round(state.confusion),
    frustrationLevel: Math.round(state.frustration),
    abandonmentRisk: calculateAbandonmentRisk(state, goalAchieved),
    screenshots,
  };
}

/**
 * Calculate abandonment risk as a letter grade.
 *
 * Research basis:
 * - 53% abandon at 3s load time (Google/SOASTA)
 * - 67% abandon with too many steps (Baymard)
 * - Rage clicks (3+ in 1-2s) correlate with 6.5% frustration rate (FullStory)
 *
 * This is a HEURISTIC estimate for comparison purposes, not a prediction.
 */
function calculateAbandonmentRisk(state: JourneyState, goalAchieved: boolean): number {
  if (goalAchieved) return 0;

  // Weighted risk factors (calibrated to research where possible)
  let risk = 0;

  // Patience depletion: primary driver (research shows patience exhaustion = abandonment)
  risk += (100 - state.patience) * 0.4;

  // Frustration accumulation: rage clicks correlate with ~6.5% session abandonment
  risk += state.frustration * 0.3;

  // Confusion: correlates with backtracking and eventual abandonment
  risk += state.confusion * 0.3;

  // Cap at 100
  return Math.min(100, Math.round(risk));
}

/**
 * Convert numeric risk to 1-10 scale with descriptive label.
 * Returns { score: 1-10, label: "Low" | "Medium" | "High" etc. }
 */
function getAbandonmentRiskRating(risk: number): { score: number; label: string } {
  for (const tier of ABANDONMENT_RISK_LABELS) {
    if (risk <= tier.max) {
      return { score: tier.score, label: tier.label };
    }
  }
  return { score: 10, label: "Very High" };
}

// ============================================================================
// Page Analysis
// ============================================================================

interface PageAnalysis {
  goalReached: boolean;
  frictionPoints: string[];
  availableActions: ActionCandidate[];
  pageContent: string;
}

interface ActionCandidate {
  type: "click" | "fill" | "scroll";
  target: string;
  selector: string;
  relevance: number; // 0-1 how relevant to goal
  area?: FocusAreaType; // Page area for focus hierarchy
  text?: string; // Text content for distraction filtering
}

async function analyzePageForGoal(page: Page, goal: string): Promise<PageAnalysis> {
  const goalLower = goal.toLowerCase();
  const frictionPoints: string[] = [];

  // Extract page content for analysis with position data for focus hierarchy
  const pageData = await page.evaluate(() => {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Helper: detect page area from element position and context
    function detectArea(el: Element): string {
      const rect = el.getBoundingClientRect();
      const classes = el.className?.toString?.().toLowerCase() || '';
      const id = el.id?.toLowerCase() || '';
      const tagName = el.tagName.toLowerCase();

      // Semantic detection first
      if (el.closest('nav') || classes.includes('nav') || id.includes('nav') || el.closest('[role="navigation"]')) {
        return 'navigation';
      }
      if (el.closest('form') || classes.includes('form')) {
        return 'forms';
      }
      if (el.closest('footer') || classes.includes('footer') || id.includes('footer')) {
        return 'footer';
      }
      if (el.closest('aside') || classes.includes('sidebar') || classes.includes('aside')) {
        return 'sidebar';
      }
      if (tagName.match(/^h[1-6]$/) || el.closest('h1, h2, h3, h4, h5, h6')) {
        return 'headings';
      }
      if (classes.includes('hero') || classes.includes('banner') || classes.includes('jumbotron')) {
        return 'hero';
      }
      if (classes.includes('cta') || classes.includes('call-to-action') ||
          (tagName === 'button' && rect.width > 100) ||
          (el as HTMLElement).getAttribute?.('role') === 'button') {
        return 'cta';
      }
      if (tagName === 'img' || el.closest('figure, picture')) {
        return 'images';
      }
      if (classes.includes('search') || id.includes('search') || (el as HTMLInputElement).type === 'search') {
        return 'search';
      }

      // Position-based detection
      if (rect.top < 100) {
        // Top of page - likely navigation or hero
        return rect.height > 200 ? 'hero' : 'navigation';
      }
      if (rect.top > viewportHeight * 0.8) {
        return 'footer';
      }
      if (rect.left < viewportWidth * 0.2 || rect.right > viewportWidth * 0.8) {
        return 'sidebar';
      }

      // Default to content
      return 'content';
    }

    const data = {
      title: document.title,
      url: window.location.href,
      text: document.body.innerText.slice(0, 5000),
      buttons: Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]')).map(el => ({
        text: el.textContent?.trim() || (el as HTMLInputElement).value || '',
        selector: el.id ? `#${el.id}` : el.className ? `.${el.className.toString().split(' ')[0]}` : el.tagName.toLowerCase(),
        visible: el.getBoundingClientRect().width > 0,
        area: detectArea(el),
      })),
      links: Array.from(document.querySelectorAll('a[href]')).map(el => ({
        text: el.textContent?.trim() || '',
        href: (el as HTMLAnchorElement).href,
        selector: el.id ? `#${el.id}` : `a[href="${(el as HTMLAnchorElement).getAttribute('href')}"]`,
        visible: el.getBoundingClientRect().width > 0,
        area: detectArea(el),
      })).slice(0, 50),
      inputs: Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select')).map(el => {
        const input = el as HTMLInputElement;
        return {
          type: input.type || 'text',
          name: input.name,
          placeholder: input.placeholder,
          label: document.querySelector(`label[for="${input.id}"]`)?.textContent?.trim() || '',
          selector: input.id ? `#${input.id}` : input.name ? `[name="${input.name}"]` : input.placeholder ? `[placeholder="${input.placeholder}"]` : 'input',
          visible: el.getBoundingClientRect().width > 0,
          area: detectArea(el),
        };
      }),
      // Check for common friction indicators
      hasPopup: !!document.querySelector('[class*="modal"], [class*="popup"], [role="dialog"]'),
      hasError: !!document.querySelector('[class*="error"], .alert-danger, [role="alert"]'),
      hasCaptcha: !!document.querySelector('[class*="captcha"], [class*="recaptcha"], iframe[src*="captcha"]'),
      formCount: document.querySelectorAll('form').length,
    };
    return data;
  });

  // Detect friction points
  if (pageData.hasPopup) {
    frictionPoints.push("Popup/modal blocking content");
  }
  if (pageData.hasError) {
    frictionPoints.push("Error message displayed");
  }
  if (pageData.hasCaptcha) {
    frictionPoints.push("CAPTCHA blocking progress");
  }

  // Check if goal is reached based on semantic analysis
  const goalKeywords = extractGoalKeywords(goal);
  const pageText = pageData.text.toLowerCase();
  const pageUrl = pageData.url.toLowerCase();

  let goalReached = false;

  // Action-oriented goal patterns (require completion confirmation)
  if (goalLower.includes("sign up") || goalLower.includes("register")) {
    goalReached = pageText.includes("welcome") ||
                  pageText.includes("account created") ||
                  pageText.includes("verify your email") ||
                  pageUrl.includes("dashboard") ||
                  pageUrl.includes("welcome");
  } else if (goalLower.includes("login") || goalLower.includes("sign in")) {
    goalReached = pageUrl.includes("dashboard") ||
                  pageUrl.includes("account") ||
                  pageText.includes("welcome back");
  } else if (goalLower.includes("checkout") || goalLower.includes("purchase")) {
    goalReached = pageText.includes("order confirmed") ||
                  pageText.includes("thank you for your") ||
                  pageUrl.includes("confirmation");
  } else {
    // Information-seeking goals: "find X", "search for X", "locate X", or generic
    // Extract the subject being sought (remove action verbs)
    const actionVerbs = ["find", "search", "locate", "look", "get", "see", "view", "check", "learn", "discover"];
    const subjectKeywords = goalKeywords.filter(kw => !actionVerbs.includes(kw));

    // Expand subject keywords with synonyms (e.g., "requirements" -> also check "eligibility", "criteria")
    const expandedKeywords = expandKeywordsWithSynonyms(subjectKeywords);

    // If we have subject keywords, check for their presence and density
    if (subjectKeywords.length > 0) {
      // Count how many expanded keywords (including synonyms) appear in the page
      const keywordsFound = expandedKeywords.filter(kw => pageText.includes(kw));

      // For ratio, compare against original subject count (finding ANY synonym counts)
      // If we find synonyms for a concept, that concept is "found"
      const conceptsFound = new Set<string>();
      for (const kw of subjectKeywords) {
        // Check if original keyword or any of its synonyms appear
        const synonyms = expandKeywordsWithSynonyms([kw]);
        if (synonyms.some(syn => pageText.includes(syn))) {
          conceptsFound.add(kw);
        }
      }
      const keywordRatio = conceptsFound.size / subjectKeywords.length;

      // Also check keyword density (multiple mentions = more relevant)
      let totalMentions = 0;
      for (const kw of expandedKeywords) {
        const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches = pageText.match(regex);
        totalMentions += matches ? matches.length : 0;
      }

      // Goal reached if:
      // - At least 50% of subject CONCEPTS are present (via original or synonym), AND
      // - Keywords/synonyms are mentioned at least 3x total (indicates actual content)
      goalReached = keywordRatio >= 0.5 && totalMentions >= 3;

      // Also check if URL contains subject keywords (strong signal)
      const urlHasSubject = expandedKeywords.some(kw => pageUrl.includes(kw));
      if (urlHasSubject && keywordRatio >= 0.4) {
        goalReached = true;
      }
    } else {
      // Fallback: all keywords are action verbs, just check if we're on a relevant page
      goalReached = goalKeywords.some(kw => pageUrl.includes(kw));
    }
  }

  // Build action candidates
  const availableActions: ActionCandidate[] = [];

  // Score buttons by relevance to goal (with area detection)
  for (const btn of pageData.buttons.filter(b => b.visible)) {
    const textLower = btn.text.toLowerCase();
    let relevance = 0;

    for (const keyword of goalKeywords) {
      if (textLower.includes(keyword)) relevance += 0.3;
    }

    // Common action words
    if (textLower.match(/submit|continue|next|proceed|sign|login|create|register|add|buy|checkout/)) {
      relevance += 0.2;
    }

    if (relevance > 0 || btn.text.length > 0) {
      availableActions.push({
        type: "click",
        target: btn.text || "button",
        selector: btn.selector,
        relevance: Math.min(1, relevance),
        area: btn.area as FocusAreaType,
        text: btn.text,
      });
    }
  }

  // Score links by relevance (with area detection)
  for (const link of pageData.links.filter(l => l.visible)) {
    const textLower = link.text.toLowerCase();
    let relevance = 0;

    for (const keyword of goalKeywords) {
      if (textLower.includes(keyword) || link.href.toLowerCase().includes(keyword)) {
        relevance += 0.3;
      }
    }

    if (relevance > 0) {
      availableActions.push({
        type: "click",
        target: link.text || link.href,
        selector: link.selector,
        relevance: Math.min(1, relevance),
        area: link.area as FocusAreaType,
        text: link.text,
      });
    }
  }

  // Score inputs (with area detection)
  for (const input of pageData.inputs.filter(i => i.visible)) {
    const labelLower = (input.label + input.placeholder + input.name).toLowerCase();
    let relevance = 0;

    for (const keyword of goalKeywords) {
      if (labelLower.includes(keyword)) relevance += 0.2;
    }

    // Common form fields
    if (labelLower.match(/email|password|name|username|search/)) {
      relevance += 0.3;
    }

    if (relevance > 0) {
      availableActions.push({
        type: "fill",
        target: input.label || input.placeholder || input.name || input.type,
        selector: input.selector,
        relevance: Math.min(1, relevance),
        area: input.area as FocusAreaType,
        text: input.label || input.placeholder,
      });
    }
  }

  // Sort by relevance (focus hierarchy applied later in findBestAction)
  availableActions.sort((a, b) => b.relevance - a.relevance);

  return {
    goalReached,
    frictionPoints,
    availableActions,
    pageContent: pageData.text.slice(0, 1000),
  };
}

function extractGoalKeywords(goal: string): string[] {
  const stopWords = ['a', 'an', 'the', 'to', 'for', 'on', 'in', 'at', 'and', 'or', 'of', 'with'];
  return goal.toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word));
}

// Synonym map for common goal terms - expands keywords to include related terms
const KEYWORD_SYNONYMS: Record<string, string[]> = {
  requirements: ['requirements', 'eligibility', 'criteria', 'prerequisites', 'qualifications', 'what you need', 'how to apply', 'checklist'],
  application: ['application', 'apply', 'applying', 'submit', 'enrollment', 'enroll'],
  admission: ['admission', 'admissions', 'accepted', 'acceptance', 'enrolled'],
  cost: ['cost', 'tuition', 'fees', 'price', 'pricing', 'financial', 'payment'],
  deadline: ['deadline', 'due date', 'dates', 'when to apply', 'timeline'],
  contact: ['contact', 'email', 'phone', 'reach', 'support', 'help'],
  international: ['international', 'global', 'foreign', 'overseas', 'visa', 'i-20'],
};

function expandKeywordsWithSynonyms(keywords: string[]): string[] {
  const expanded = new Set<string>();

  for (const kw of keywords) {
    expanded.add(kw);
    // Check if this keyword has synonyms
    if (KEYWORD_SYNONYMS[kw]) {
      for (const syn of KEYWORD_SYNONYMS[kw]) {
        expanded.add(syn);
      }
    }
    // Also check if keyword is IN a synonym list (reverse lookup)
    for (const [key, syns] of Object.entries(KEYWORD_SYNONYMS)) {
      if (syns.includes(kw)) {
        expanded.add(key);
        for (const syn of syns) {
          expanded.add(syn);
        }
      }
    }
  }

  return Array.from(expanded);
}

/**
 * Find the best action using focus hierarchy weighting.
 *
 * This applies probabilistic focus patterns to simulate how real users
 * prioritize different page areas based on their task type.
 *
 * Key behaviors:
 * - Information-seeking tasks prioritize headings/navigation
 * - Action-completion tasks prioritize forms/CTAs
 * - Common distractions (newsletter popups, etc.) are filtered
 */
async function findBestAction(page: Page, goal: string, analysis: PageAnalysis): Promise<ActionCandidate | null> {
  if (analysis.availableActions.length === 0) return null;

  // Infer task type from goal and get appropriate focus hierarchy
  const taskType = inferTaskTypeFromGoal(goal);
  const focusHierarchy = getFocusHierarchy(taskType);

  // Apply focus hierarchy weighting to each action
  const weightedActions = analysis.availableActions.map(action => {
    // Calculate focus priority based on area and distraction filtering
    const focusPriority = calculateFocusPriority(
      {
        area: action.area,
        text: action.text,
        selector: action.selector,
        isRelevantToGoal: action.relevance > 0.3,
      },
      focusHierarchy
    );

    // Check if this action should be filtered as a distraction
    const distractionRate = getDistractionIgnoreRate(
      { text: action.text, selector: action.selector },
      focusHierarchy.distractionFilters
    );

    // Deterministic filtering: skip high-probability distractions
    // (Previously random, now uses threshold for consistent behavior)
    const skipAsDistraction = distractionRate >= 0.7;

    // Combined score: relevance * focus priority, with distraction penalty
    const combinedScore = skipAsDistraction
      ? 0  // Filtered out as distraction
      : action.relevance * focusPriority;

    return {
      action,
      focusPriority,
      distractionRate,
      combinedScore,
      skipped: skipAsDistraction,
    };
  });

  // Filter out skipped distractions
  const viableActions = weightedActions.filter(w => !w.skipped);

  if (viableActions.length === 0) {
    // All actions were filtered as distractions - fall back to nav-first
    // This happens when page is full of popups/banners but has some nav
    const navActions = weightedActions.filter(w =>
      w.action.area === 'navigation' || w.action.area === 'headings'
    );

    if (navActions.length > 0) {
      // Force through navigation even if it was a distraction
      navActions.sort((a, b) => b.action.relevance - a.action.relevance);
      return navActions[0].action;
    }

    // Absolute fallback: return highest relevance regardless of focus
    return analysis.availableActions[0];
  }

  // Sort by combined score (focus-weighted relevance)
  viableActions.sort((a, b) => b.combinedScore - a.combinedScore);

  // Apply attention capacity limit (humans don't consider all options)
  const consideredActions = viableActions.slice(0, focusHierarchy.attentionCapacity);

  // Select best action deterministically (no random selection)
  // When using cognitive journeys, Claude provides intelligent decision making
  // For heuristic mode, we use the highest-scored action consistently
  return consideredActions[0]?.action ?? null;
}

async function executeAction(page: Page, action: ActionCandidate): Promise<void> {
  switch (action.type) {
    case "click":
      await page.click(action.selector, { timeout: 5000 });
      break;
    case "fill":
      // Generate test data based on field type
      const testValue = generateTestValue(action.target);
      await page.fill(action.selector, testValue, { timeout: 5000 });
      break;
    case "scroll":
      await page.evaluate(() => window.scrollBy(0, 500));
      break;
  }
}

function generateTestValue(fieldHint: string): string {
  const hint = fieldHint.toLowerCase();
  if (hint.includes("email")) return "test@example.com";
  if (hint.includes("password")) return "TestPassword123!";
  if (hint.includes("name")) return "Test User";
  if (hint.includes("phone")) return "555-123-4567";
  if (hint.includes("search")) return "test search";
  return "test value";
}

// ============================================================================
// Comparison and Ranking
// ============================================================================

function calculateSiteScore(result: SiteBenchmarkResult): number {
  let score = 0;

  // Goal achieved is worth a lot
  if (result.goalAchieved) score += 50;

  // Faster is better (up to 30 points for speed)
  const timeScore = Math.max(0, 30 - (result.totalTime / 1000 / 2));
  score += timeScore;

  // Fewer steps is better (up to 10 points)
  const stepScore = Math.max(0, 10 - result.stepCount);
  score += stepScore;

  // Less friction is better (up to 10 points)
  const frictionScore = Math.max(0, 10 - result.frictionPoints.length * 2);
  score += frictionScore;

  return Math.round(score);
}

function generateRankings(results: SiteBenchmarkResult[]): SiteRanking[] {
  const scored = results.map(r => ({
    result: r,
    score: calculateSiteScore(r),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored.map((item, index) => {
    // Determine strengths and weaknesses
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    const avgTime = results.reduce((sum, r) => sum + r.totalTime, 0) / results.length;
    const avgSteps = results.reduce((sum, r) => sum + r.stepCount, 0) / results.length;
    const avgFriction = results.reduce((sum, r) => sum + r.frictionPoints.length, 0) / results.length;

    if (item.result.goalAchieved) {
      strengths.push("Goal achieved successfully");
    } else {
      weaknesses.push("Failed to achieve goal");
    }

    if (item.result.totalTime < avgTime * 0.8) {
      strengths.push("Faster than average");
    } else if (item.result.totalTime > avgTime * 1.2) {
      weaknesses.push("Slower than average");
    }

    if (item.result.stepCount < avgSteps * 0.8) {
      strengths.push("Fewer steps needed");
    } else if (item.result.stepCount > avgSteps * 1.2) {
      weaknesses.push("Too many steps required");
    }

    if (item.result.frictionPoints.length < avgFriction * 0.8) {
      strengths.push("Low friction experience");
    } else if (item.result.frictionPoints.length > avgFriction * 1.2) {
      weaknesses.push("High friction experience");
    }

    return {
      rank: index + 1,
      site: item.result.siteName,
      score: item.score,
      strengths,
      weaknesses,
    };
  });
}

function generateComparison(results: SiteBenchmarkResult[]): BenchmarkComparison {
  const sorted = [...results];

  // Find fastest/slowest
  sorted.sort((a, b) => a.totalTime - b.totalTime);
  const fastestSite = sorted[0].siteName;
  const slowestSite = sorted[sorted.length - 1].siteName;

  // Find most/least friction
  sorted.sort((a, b) => a.frictionPoints.length - b.frictionPoints.length);
  const leastFriction = sorted[0].siteName;
  const mostFriction = sorted[sorted.length - 1].siteName;

  // Find highest abandonment risk
  sorted.sort((a, b) => b.abandonmentRisk - a.abandonmentRisk);
  const highestAbandonmentRisk = sorted[0].siteName;

  // Find common friction points
  const frictionCounts = new Map<string, number>();
  for (const result of results) {
    for (const friction of result.frictionPoints) {
      frictionCounts.set(friction, (frictionCounts.get(friction) || 0) + 1);
    }
  }

  const commonFrictionAcrossSites = Array.from(frictionCounts.entries())
    .filter(([_, count]) => count >= results.length / 2)
    .map(([friction, _]) => friction);

  return {
    fastestSite,
    slowestSite,
    mostFriction,
    leastFriction,
    highestAbandonmentRisk,
    commonFrictionAcrossSites,
  };
}

function generateCompetitiveRecommendations(
  results: SiteBenchmarkResult[],
  ranking: SiteRanking[]
): CompetitiveRecommendation[] {
  const recommendations: CompetitiveRecommendation[] = [];
  const bestSite = ranking[0];

  for (const result of results) {
    if (result.siteName === bestSite.site) continue; // Skip the winner

    const thisRanking = ranking.find(r => r.site === result.siteName);
    if (!thisRanking) continue;

    // Generate recommendations based on weaknesses
    for (const weakness of thisRanking.weaknesses) {
      let improvement = "";
      let reference = "";

      if (weakness.includes("Failed to achieve")) {
        improvement = "Improve conversion flow to ensure users can complete the goal";
        if (bestSite.strengths.includes("Goal achieved successfully")) {
          reference = `${bestSite.site} successfully guides users to goal completion`;
        }
      } else if (weakness.includes("Slower")) {
        improvement = "Reduce time-to-completion by streamlining steps";
        const fastest = results.reduce((a, b) => a.totalTime < b.totalTime ? a : b);
        reference = `${fastest.siteName} completes in ${(fastest.totalTime / 1000).toFixed(1)}s`;
      } else if (weakness.includes("Too many steps")) {
        improvement = "Reduce the number of steps required";
        const fewestSteps = results.reduce((a, b) => a.stepCount < b.stepCount ? a : b);
        reference = `${fewestSteps.siteName} only requires ${fewestSteps.stepCount} steps`;
      } else if (weakness.includes("High friction")) {
        improvement = "Reduce friction points in the user flow";
        const leastFriction = results.reduce((a, b) => a.frictionPoints.length < b.frictionPoints.length ? a : b);
        reference = `${leastFriction.siteName} has fewer friction points`;
      }

      if (improvement) {
        recommendations.push({
          site: result.siteName,
          improvement,
          competitorReference: reference || undefined,
        });
      }
    }

    // Add friction-specific recommendations
    for (const friction of result.frictionPoints) {
      recommendations.push({
        site: result.siteName,
        improvement: `Fix: ${friction}`,
      });
    }
  }

  return recommendations;
}

// ============================================================================
// Report Generation
// ============================================================================

export function formatCompetitiveBenchmarkReport(result: CompetitiveBenchmarkResult): string {
  let report = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                     COMPETITIVE UX BENCHMARK                                 ║
╚══════════════════════════════════════════════════════════════════════════════╝

Goal: "${result.goal}"
Persona: ${result.persona}
Timestamp: ${result.timestamp}
Total Duration: ${(result.duration / 1000).toFixed(1)}s

⚠️  METHODOLOGY NOTE: Scores are heuristic estimates for RELATIVE comparison.

    ABANDONMENT RISK SCALE (1-10):
    1-2 Very Low   │ Users likely to complete. Smooth experience.
    3-4 Low        │ Minor friction. Most users persist.
    5-6 Medium     │ Noticeable friction. Some users may leave.
    7-8 High       │ Significant obstacles. Many users abandon.
    9-10 Very High │ Critical barriers. Most users will leave.

    See docs/METHODOLOGY.md for research sources.

┌────────────────────────────────────────────────────────────────────────────┐
│                            RANKING                                          │
├────────────────────────────────────────────────────────────────────────────┤
`;

  const medals = ['🥇', '🥈', '🥉'];
  for (const site of result.ranking) {
    const medal = medals[site.rank - 1] || `#${site.rank}`;
    const siteResult = result.sites.find(s => s.siteName === site.site)!;
    const riskRating = getAbandonmentRiskRating(siteResult.abandonmentRisk);
    report += `│  ${medal} ${site.site.padEnd(20)} — ${(siteResult.totalTime / 1000).toFixed(1)}s, ${siteResult.stepCount} steps, Risk: ${riskRating.score}/10 (${riskRating.label})\n`;
  }

  report += `└────────────────────────────────────────────────────────────────────────────┘

DETAILED COMPARISON
───────────────────
`;

  // Build comparison table
  const metrics = ['Time', 'Steps', 'Friction', 'Confusion', 'Goal'];
  const headers = ['Metric', ...result.sites.map(s => s.siteName.slice(0, 15))];
  const colWidth = 16;

  report += headers.map(h => h.padEnd(colWidth)).join('') + '\n';
  report += '─'.repeat(colWidth * headers.length) + '\n';

  // Find best values for highlighting
  const bestTime = Math.min(...result.sites.map(s => s.totalTime));
  const bestSteps = Math.min(...result.sites.map(s => s.stepCount));
  const bestFriction = Math.min(...result.sites.map(s => s.frictionPoints.length));
  const bestConfusion = Math.min(...result.sites.map(s => s.confusionLevel));

  for (const metric of metrics) {
    const row = [metric];
    for (const site of result.sites) {
      let value = '';
      let isBest = false;

      switch (metric) {
        case 'Time':
          value = `${(site.totalTime / 1000).toFixed(1)}s`;
          isBest = site.totalTime === bestTime;
          break;
        case 'Steps':
          value = `${site.stepCount}`;
          isBest = site.stepCount === bestSteps;
          break;
        case 'Friction':
          value = `${site.frictionPoints.length}`;
          isBest = site.frictionPoints.length === bestFriction;
          break;
        case 'Confusion':
          value = `${site.confusionLevel}%`;
          isBest = site.confusionLevel === bestConfusion;
          break;
        case 'Goal':
          value = site.goalAchieved ? '✓' : '✗';
          isBest = site.goalAchieved;
          break;
      }

      row.push(isBest ? `${value} ✓` : value);
    }
    report += row.map(c => c.padEnd(colWidth)).join('') + '\n';
  }

  report += `
RECOMMENDATIONS
───────────────
`;

  const groupedRecs = new Map<string, string[]>();
  for (const rec of result.recommendations) {
    if (!groupedRecs.has(rec.site)) groupedRecs.set(rec.site, []);
    groupedRecs.get(rec.site)!.push(rec.improvement + (rec.competitorReference ? ` — ${rec.competitorReference}` : ''));
  }

  for (const [site, recs] of groupedRecs) {
    report += `\n${site}:\n`;
    for (const rec of recs.slice(0, 5)) {
      report += `  • ${rec}\n`;
    }
  }

  report += `
─────────────────────────────────────────────────────────────────────────────
* Methodology and research sources: docs/METHODOLOGY.md
  Key sources: Google/SOASTA (2017), Baymard Institute, Nielsen Norman Group

Generated by CBrowser v8.0.0 - Competitive UX Benchmark
`;

  return report;
}

export function generateCompetitiveBenchmarkHtmlReport(result: CompetitiveBenchmarkResult): string {
  const medals = ['🥇', '🥈', '🥉'];

  const rankingRows = result.ranking.map((site, i) => {
    const siteResult = result.sites.find(s => s.siteName === site.site)!;
    const riskRating = getAbandonmentRiskRating(siteResult.abandonmentRisk);
    const riskClass = riskRating.score <= 3 ? 'risk-low' :
                      riskRating.score <= 6 ? 'risk-medium' : 'risk-high';
    return `
      <tr class="${siteResult.goalAchieved ? 'success' : 'failure'}">
        <td>${medals[i] || `#${site.rank}`}</td>
        <td><strong>${site.site}</strong></td>
        <td>${site.score}</td>
        <td>${(siteResult.totalTime / 1000).toFixed(1)}s</td>
        <td>${siteResult.stepCount}</td>
        <td>${siteResult.frictionPoints.length}</td>
        <td><span class="risk-score ${riskClass}">${riskRating.score}/10 <small>${riskRating.label}</small></span></td>
        <td>${siteResult.goalAchieved ? '✓' : '✗'}</td>
      </tr>
    `;
  }).join('');

  const recommendationCards = Array.from(
    result.recommendations.reduce((map, rec) => {
      if (!map.has(rec.site)) map.set(rec.site, []);
      map.get(rec.site)!.push(rec);
      return map;
    }, new Map<string, CompetitiveRecommendation[]>())
  ).map(([site, recs]) => `
    <div class="rec-site">
      <h4>${site}</h4>
      <ul>
        ${recs.slice(0, 5).map(r => `
          <li>
            ${r.improvement}
            ${r.competitorReference ? `<br><small class="reference">${r.competitorReference}</small>` : ''}
          </li>
        `).join('')}
      </ul>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Competitive UX Benchmark - ${result.goal}</title>
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
    tr.success { background: #064e3b40; }
    tr.failure { background: #7f1d1d40; }
    .comparison-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin: 1rem 0;
    }
    .stat-card {
      background: #1e293b;
      padding: 1rem;
      border-radius: 8px;
      text-align: center;
    }
    .stat-card .label {
      font-size: 0.875rem;
      color: #94a3b8;
    }
    .stat-card .value {
      font-size: 1.5rem;
      font-weight: bold;
      color: #3b82f6;
    }
    .rec-site {
      background: #1e293b;
      border-radius: 8px;
      padding: 1rem;
      margin: 1rem 0;
    }
    .rec-site h4 {
      margin-top: 0;
      color: #f8fafc;
    }
    .rec-site ul {
      margin: 0;
      padding-left: 1.5rem;
    }
    .rec-site li {
      margin: 0.5rem 0;
    }
    .reference {
      color: #94a3b8;
    }
    .risk-score {
      display: inline-block;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-weight: bold;
    }
    .risk-score small {
      font-weight: normal;
      opacity: 0.8;
    }
    .risk-low { background: #10b98133; color: #10b981; }
    .risk-medium { background: #f59e0b33; color: #f59e0b; }
    .risk-high { background: #ef444433; color: #ef4444; }
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
  </style>
</head>
<body>
  <h1>📊 Competitive UX Benchmark</h1>

  <div class="disclaimer">
    <h4>⚠️ Methodology Note</h4>
    <p>Scores are <strong>heuristic estimates</strong> for relative comparison between sites, not precise measurements.</p>
    <p><strong>Abandonment Risk Scale (1-10):</strong></p>
    <table style="width: 100%; margin: 0.5rem 0; font-size: 0.875rem;">
      <tr><td style="width: 80px;"><span class="risk-score risk-low">1-2</span></td><td><strong>Very Low</strong> — Users likely to complete. Smooth experience.</td></tr>
      <tr><td><span class="risk-score risk-low">3-4</span></td><td><strong>Low</strong> — Minor friction. Most users persist.</td></tr>
      <tr><td><span class="risk-score risk-medium">5-6</span></td><td><strong>Medium</strong> — Noticeable friction. Some users may leave.</td></tr>
      <tr><td><span class="risk-score risk-high">7-8</span></td><td><strong>High</strong> — Significant obstacles. Many users abandon.</td></tr>
      <tr><td><span class="risk-score risk-high">9-10</span></td><td><strong>Very High</strong> — Critical barriers. Most users will leave.</td></tr>
    </table>
  </div>

  <div class="meta">
    <p><strong>Goal:</strong> "${result.goal}"</p>
    <p><strong>Persona:</strong> ${result.persona}</p>
    <p><strong>Timestamp:</strong> ${result.timestamp}</p>
    <p><strong>Duration:</strong> ${(result.duration / 1000).toFixed(1)}s</p>
  </div>

  <h2>Ranking</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th>
        <th>Site</th>
        <th>Score</th>
        <th>Time</th>
        <th>Steps</th>
        <th>Friction</th>
        <th>Abandon Risk</th>
        <th>Goal</th>
      </tr>
    </thead>
    <tbody>
      ${rankingRows}
    </tbody>
  </table>

  <h2>Quick Comparison</h2>
  <div class="comparison-grid">
    <div class="stat-card">
      <div class="label">Fastest</div>
      <div class="value">${result.comparison.fastestSite}</div>
    </div>
    <div class="stat-card">
      <div class="label">Slowest</div>
      <div class="value">${result.comparison.slowestSite}</div>
    </div>
    <div class="stat-card">
      <div class="label">Least Friction</div>
      <div class="value">${result.comparison.leastFriction}</div>
    </div>
    <div class="stat-card">
      <div class="label">Most Friction</div>
      <div class="value">${result.comparison.mostFriction}</div>
    </div>
  </div>

  <h2>Recommendations</h2>
  ${recommendationCards}

  <div class="footnote">
    <p>* Methodology and research sources: <a href="docs/METHODOLOGY.md" style="color: #60a5fa;">docs/METHODOLOGY.md</a></p>
    <p>Key sources: Google/SOASTA (2017), Baymard Institute, Nielsen Norman Group, FullStory</p>
  </div>

  <p style="color: #64748b; text-align: center; margin-top: 2rem;">
    Generated by CBrowser v8.0.0 - Competitive UX Benchmark
  </p>
</body>
</html>`;
}

// ============================================================================
// Main Benchmark Function
// ============================================================================

export async function runCompetitiveBenchmark(
  options: CompetitiveBenchmarkOptions
): Promise<CompetitiveBenchmarkResult> {
  const {
    sites,
    goal,
    persona = "first-timer",
    maxSteps = 30,
    maxTime = 180,
    headless = true,
    maxConcurrency = 3,
  } = options;

  const startTime = Date.now();
  const personaConfig = getPersona(persona) || BUILTIN_PERSONAS["first-timer"];
  const useCognitiveJourneys = isApiKeyConfigured();

  // Run journeys in parallel (limited concurrency)
  const results: SiteBenchmarkResult[] = [];

  // Process sites in batches
  for (let i = 0; i < sites.length; i += maxConcurrency) {
    const batch = sites.slice(i, i + maxConcurrency);

    const batchResults = await Promise.all(
      batch.map(async (site) => {
        // Use cognitive journeys when API key is available (realistic simulation)
        if (useCognitiveJourneys) {
          try {
            const journey = await runCognitiveJourney({
              persona,
              startUrl: site.url,
              goal,
              maxSteps,
              maxTime,
              headless,
              vision: false,
              verbose: false,
            });

            const siteName = site.name || new URL(site.url).hostname.replace('www.', '');

            return {
              url: site.url,
              siteName,
              goalAchieved: journey.goalAchieved,
              abandonmentReason: journey.abandonmentReason,
              totalTime: journey.totalTime * 1000, // Convert to ms
              stepCount: journey.stepCount,
              frictionPoints: journey.frictionPoints.map(fp =>
                `${fp.type}: ${fp.monologue.substring(0, 80)}`
              ),
              confusionLevel: Math.round(journey.finalState.confusionLevel * 100),
              frustrationLevel: Math.round(journey.finalState.frustrationLevel * 100),
              abandonmentRisk: calculateAbandonmentRisk(
                {
                  patience: journey.finalState.patienceRemaining * 100,
                  frustration: journey.finalState.frustrationLevel * 100,
                  confusion: journey.finalState.confusionLevel * 100,
                  steps: journey.stepCount,
                  frictionPoints: [],
                  startTime: Date.now(),
                },
                journey.goalAchieved
              ),
              screenshots: { start: '', end: '' },
            } as SiteBenchmarkResult;
          } catch (e) {
            // Fall back to heuristic mode on error
            console.warn(`Cognitive journey failed for ${site.url}, falling back to heuristic: ${(e as Error).message}`);
          }
        }

        // Fallback: Heuristic simulation (when no API key or cognitive journey failed)
        let browser: Browser | null = null;
        try {
          browser = await chromium.launch({ headless });
          const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
          });
          const page = await context.newPage();

          const result = await simulateJourney(page, site.url, goal, personaConfig, maxSteps, maxTime);

          // Override site name if provided
          if (site.name) {
            result.siteName = site.name;
          }

          return result;
        } finally {
          if (browser) {
            await browser.close();
          }
        }
      })
    );

    results.push(...batchResults);
  }

  // Generate rankings and comparisons
  const ranking = generateRankings(results);
  const comparison = generateComparison(results);
  const recommendations = generateCompetitiveRecommendations(results, ranking);

  return {
    goal,
    persona,
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    sites: results,
    ranking,
    comparison,
    recommendations,
  };
}
