/**
 * Cognitive Journey API Module
 *
 * Provides autonomous cognitive user simulation using Claude API directly.
 * This allows CBrowser to run cognitive journeys standalone without Claude Code.
 *
 * @module cognitive
 */

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { CBrowser } from "../browser.js";
import {
  getPersona,
  getCognitiveProfile,
  createCognitivePersona,
} from "../personas.js";
import type {
  CognitiveState,
  CognitiveProfile,
  CognitiveJourneyResult,
  AbandonmentThresholds,
  FrictionPoint,
  Persona,
  CognitiveTraits,
} from "../types.js";
import { loadConfigFile, getDataDir } from "../config.js";

// ============================================================================
// API Key Management
// ============================================================================

/**
 * Get the Anthropic API key from environment or config file.
 */
export function getAnthropicApiKey(): string | null {
  // 1. Environment variable (highest priority)
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  // 2. Config file
  const config = loadConfigFile();
  if (config?.anthropicApiKey) {
    return config.anthropicApiKey;
  }

  return null;
}

/**
 * Get the Claude model to use for cognitive journeys.
 */
export function getAnthropicModel(): string {
  const config = loadConfigFile();
  return (
    process.env.ANTHROPIC_MODEL ||
    config?.anthropicModel ||
    "claude-sonnet-4-20250514"
  );
}

/**
 * Set the Anthropic API key in the config file.
 */
export function setAnthropicApiKey(apiKey: string): void {
  const configPath = join(getDataDir(), "config.json");
  let config: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      // Start fresh if corrupted
    }
  }

  config.anthropicApiKey = apiKey;
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Remove the Anthropic API key from the config file.
 */
export function removeAnthropicApiKey(): void {
  const configPath = join(getDataDir(), "config.json");
  if (!existsSync(configPath)) return;

  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    delete config.anthropicApiKey;
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch {
    // Ignore errors
  }
}

/**
 * Check if API key is configured and valid format.
 */
export function isApiKeyConfigured(): boolean {
  const key = getAnthropicApiKey();
  return !!key && key.startsWith("sk-ant-");
}

// ============================================================================
// Cognitive Journey Runner
// ============================================================================

export interface CognitiveJourneyOptions {
  /** Persona name or description */
  persona: string;
  /** Goal statement for the journey */
  goal: string;
  /** Starting URL */
  startUrl: string;
  /** Custom cognitive trait overrides */
  customTraits?: Partial<CognitiveTraits>;
  /** Maximum steps before timeout */
  maxSteps?: number;
  /** Maximum time in seconds */
  maxTime?: number;
  /** Verbose output */
  verbose?: boolean;
  /** Run in headless mode (default: false for live viewing, auto-detects server) */
  headless?: boolean;
  /** Callback for step updates */
  onStep?: (step: CognitiveStep) => void;
}

export interface CognitiveStep {
  step: number;
  phase: "perceive" | "comprehend" | "decide" | "execute" | "evaluate";
  monologue: string;
  action?: string;
  state: CognitiveState;
}

/**
 * Run an autonomous cognitive journey using the Claude API.
 *
 * @example
 * ```typescript
 * const result = await runCognitiveJourney({
 *   persona: "first-timer",
 *   goal: "Sign up for an account",
 *   startUrl: "https://example.com",
 * });
 * console.log(result.goalAchieved ? "Success!" : `Abandoned: ${result.abandonmentReason}`);
 * ```
 */
export async function runCognitiveJourney(
  options: CognitiveJourneyOptions
): Promise<CognitiveJourneyResult> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    throw new Error(
      "Anthropic API key not configured. Run: npx cbrowser config set-api-key YOUR_KEY"
    );
  }

  const anthropic = new Anthropic({ apiKey });
  const model = getAnthropicModel();

  // Get or create persona
  const existingPersona = getPersona(options.persona);
  let personaObj: Persona;

  if (!existingPersona) {
    personaObj = createCognitivePersona(
      options.persona,
      options.persona,
      options.customTraits || {}
    );
  } else if (options.customTraits) {
    const defaultTraits: CognitiveTraits = {
      patience: 0.5,
      riskTolerance: 0.5,
      comprehension: 0.5,
      persistence: 0.5,
      curiosity: 0.5,
      workingMemory: 0.5,
      readingTendency: 0.5,
    };
    personaObj = {
      ...existingPersona,
      cognitiveTraits: {
        ...defaultTraits,
        ...(existingPersona.cognitiveTraits || {}),
        ...options.customTraits,
      },
    };
  } else {
    personaObj = existingPersona;
  }

  const profile = getCognitiveProfile(personaObj);
  const traits = profile.traits;

  // Calculate abandonment thresholds
  const thresholds: AbandonmentThresholds = {
    patienceMin: 0.1,
    confusionMax: traits.comprehension < 0.4 ? 0.6 : 0.8,
    frustrationMax: traits.patience < 0.3 ? 0.7 : 0.85,
    maxStepsWithoutProgress: traits.persistence > 0.7 ? 15 : 10,
    loopDetectionThreshold: 3,
    timeLimit:
      options.maxTime ||
      (traits.patience > 0.7 ? 180 : traits.patience < 0.3 ? 60 : 120),
  };

  // Initialize state
  const state: CognitiveState = {
    patienceRemaining: 1.0,
    confusionLevel: 0.0,
    frustrationLevel: 0.0,
    goalProgress: 0.0,
    confidenceLevel: 0.5,
    currentMood: "neutral",
    memory: {
      pagesVisited: [options.startUrl],
      actionsAttempted: [],
      errorsEncountered: [],
      backtrackCount: 0,
    },
    timeElapsed: 0,
    stepCount: 0,
  };

  // Initialize browser (auto-detect headless for servers without display)
  const headless = options.headless ?? !process.env.DISPLAY;
  const browser = new CBrowser({ headless, persistent: true });
  await browser.navigate(options.startUrl);

  const fullMonologue: string[] = [];
  const frictionPoints: FrictionPoint[] = [];
  const startTime = Date.now();
  const maxSteps = options.maxSteps || 50;

  // Build system prompt
  const systemPrompt = buildCognitiveSystemPrompt(
    personaObj,
    profile,
    options.goal,
    thresholds
  );

  // Conversation history for Claude
  const messages: Array<{
    role: "user" | "assistant";
    content: string;
  }> = [];

  let goalAchieved = false;
  let abandonmentReason: CognitiveJourneyResult["abandonmentReason"];
  let abandonmentMessage: string | undefined;
  let currentUrl = options.startUrl;

  // Main cognitive loop
  for (let step = 1; step <= maxSteps; step++) {
    state.stepCount = step;
    state.timeElapsed = (Date.now() - startTime) / 1000;

    // Check time limit
    if (state.timeElapsed > thresholds.timeLimit) {
      abandonmentReason = "timeout";
      abandonmentMessage = `I've spent too long on this (${Math.round(state.timeElapsed)}s). Giving up.`;
      break;
    }

    // Get page state via screenshot
    const screenshotPath = await browser.screenshot();
    const pageTitle = "Current Page"; // Simplified - CBrowser doesn't expose title directly

    // Build step prompt
    const stepPrompt = buildStepPrompt(state, currentUrl, pageTitle, step);
    messages.push({ role: "user", content: stepPrompt });

    // Call Claude for cognitive reasoning
    const response = await anthropic.messages.create({
      model,
      max_tokens: 2000,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const assistantMessage =
      response.content[0].type === "text" ? response.content[0].text : "";
    messages.push({ role: "assistant", content: assistantMessage });

    // Parse Claude's response
    const parsed = parseCognitiveResponse(assistantMessage);

    // Update state with Claude's assessment
    state.confusionLevel = parsed.newConfusion ?? state.confusionLevel;
    state.frustrationLevel = parsed.newFrustration ?? state.frustrationLevel;
    state.goalProgress = parsed.goalProgress ?? state.goalProgress;
    state.currentMood = parsed.mood ?? state.currentMood;

    // Deplete patience
    state.patienceRemaining -= 0.02 + state.frustrationLevel * 0.05;

    // Record monologue
    if (parsed.monologue) {
      fullMonologue.push(parsed.monologue);
    }

    // Record friction point if confusion/frustration spiked
    if (parsed.frictionDescription && (state.confusionLevel > 0.4 || state.frustrationLevel > 0.4)) {
      frictionPoints.push({
        step,
        url: currentUrl,
        element: parsed.frictionElement,
        type: "confusing_ui",
        frustrationIncrease: parsed.newFrustration ? parsed.newFrustration - state.frustrationLevel : 0.1,
        monologue: parsed.monologue || "",
      });
    }

    // Callback
    if (options.onStep) {
      options.onStep({
        step,
        phase: parsed.phase || "evaluate",
        monologue: parsed.monologue || "",
        action: parsed.action,
        state: { ...state },
      });
    }

    // Verbose output
    if (options.verbose) {
      console.log(`\n━━━ Step ${step} ━━━`);
      console.log(`Mood: ${state.currentMood}`);
      console.log(
        `Patience: ${(state.patienceRemaining * 100).toFixed(0)}% | Confusion: ${(state.confusionLevel * 100).toFixed(0)}% | Frustration: ${(state.frustrationLevel * 100).toFixed(0)}%`
      );
      if (parsed.monologue) console.log(`💭 "${parsed.monologue}"`);
      if (parsed.action) console.log(`🎯 Action: ${parsed.action}`);
    }

    // Check for goal completion
    if (parsed.goalAchieved) {
      goalAchieved = true;
      break;
    }

    // Check abandonment triggers
    const abandonment = checkAbandonmentTriggers(state, thresholds);
    if (abandonment) {
      abandonmentReason = abandonment.reason;
      abandonmentMessage = abandonment.message;
      fullMonologue.push(abandonment.message);
      break;
    }

    // Execute action if provided
    if (parsed.action) {
      try {
        const result = await executeAction(browser, parsed.action);
        state.memory.actionsAttempted.push({
          action: parsed.action,
          target: parsed.actionTarget,
          success: result.success,
        });

        // Track page visits if URL changed
        if (result.newUrl && !state.memory.pagesVisited.includes(result.newUrl)) {
          state.memory.pagesVisited.push(result.newUrl);
          currentUrl = result.newUrl;
        }
      } catch (error) {
        state.memory.errorsEncountered.push({
          error: error instanceof Error ? error.message : String(error),
          context: `Step ${step}: ${parsed.action}`,
        });
        state.frustrationLevel = Math.min(1, state.frustrationLevel + 0.15);
      }
    }

    // Small delay between steps
    await sleep(500);
  }

  // Close browser
  await browser.close();

  // Calculate summary stats
  const avgConfusion = frictionPoints.length > 0
    ? frictionPoints.reduce((sum, fp) => sum + (state.confusionLevel), 0) / frictionPoints.length
    : state.confusionLevel;

  // Build result
  return {
    persona: personaObj.name,
    goal: options.goal,
    goalAchieved,
    abandonmentReason,
    abandonmentMessage,
    totalTime: (Date.now() - startTime) / 1000,
    stepCount: state.stepCount,
    frictionPoints,
    fullMonologue,
    finalState: state,
    summary: {
      avgConfusionLevel: avgConfusion,
      maxFrustrationLevel: state.frustrationLevel,
      backtrackCount: state.memory.backtrackCount,
      timeInConfusion: frictionPoints.length * 2, // Estimate
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function buildCognitiveSystemPrompt(
  persona: Persona,
  profile: CognitiveProfile,
  goal: string,
  thresholds: AbandonmentThresholds
): string {
  const traits = profile.traits;

  return `You are simulating a "${persona.name}" user navigating a website.

PERSONA DESCRIPTION: ${persona.description}

COGNITIVE TRAITS:
- Patience: ${traits.patience.toFixed(2)} ${traits.patience < 0.3 ? "(impatient)" : traits.patience > 0.7 ? "(patient)" : "(moderate)"}
- Risk Tolerance: ${traits.riskTolerance.toFixed(2)} ${traits.riskTolerance < 0.3 ? "(cautious)" : traits.riskTolerance > 0.7 ? "(bold)" : "(moderate)"}
- Comprehension: ${traits.comprehension.toFixed(2)} ${traits.comprehension < 0.4 ? "(struggles with UI)" : traits.comprehension > 0.7 ? "(expert)" : "(moderate)"}
- Persistence: ${traits.persistence.toFixed(2)}
- Curiosity: ${traits.curiosity.toFixed(2)}
- Reading Tendency: ${traits.readingTendency.toFixed(2)} ${traits.readingTendency < 0.3 ? "(scans only)" : traits.readingTendency > 0.7 ? "(reads everything)" : "(selective reader)"}

ATTENTION PATTERN: ${profile.attentionPattern}
DECISION STYLE: ${profile.decisionStyle}

GOAL: "${goal}"

RESPONSE FORMAT (JSON):
{
  "phase": "perceive|comprehend|decide|execute|evaluate",
  "monologue": "Internal thought as this persona (first person)",
  "action": "click:selector|fill:selector:value|navigate:url|null",
  "actionTarget": "description of what you're clicking/filling",
  "goalAchieved": boolean,
  "goalProgress": 0.0-1.0,
  "newConfusion": 0.0-1.0,
  "newFrustration": 0.0-1.0,
  "mood": "neutral|hopeful|confused|frustrated|defeated|relieved",
  "frictionDescription": "what caused confusion/frustration (if any)" | null,
  "frictionElement": "element that caused friction" | null
}

ABANDONMENT THRESHOLDS:
- If patience drops below ${thresholds.patienceMin}, give up
- If confusion exceeds ${thresholds.confusionMax}, give up
- If frustration exceeds ${thresholds.frustrationMax}, give up

BEHAVIOR GUIDELINES:
1. PERCEIVE: Describe what you see on the page
2. COMPREHEND: Interpret UI based on your comprehension level (low = more confusion)
3. DECIDE: Choose action based on risk tolerance and goal relevance
4. For click actions, use descriptive selectors like "login button", "email input", etc.
5. If comprehension is low, misinterpret ambiguous elements
6. If patience is low, get frustrated quickly with delays
7. Generate authentic inner monologue matching persona voice

Always respond with valid JSON.`;
}

function buildStepPrompt(
  state: CognitiveState,
  currentUrl: string,
  pageTitle: string,
  step: number
): string {
  return `STEP ${step}

CURRENT PAGE:
- URL: ${currentUrl}
- Title: ${pageTitle}

CURRENT STATE:
- Patience: ${(state.patienceRemaining * 100).toFixed(0)}%
- Confusion: ${(state.confusionLevel * 100).toFixed(0)}%
- Frustration: ${(state.frustrationLevel * 100).toFixed(0)}%
- Goal Progress: ${(state.goalProgress * 100).toFixed(0)}%
- Mood: ${state.currentMood}
- Pages Visited: ${state.memory.pagesVisited.length}
- Actions Attempted: ${state.memory.actionsAttempted.length}

Based on this information, what do you perceive, comprehend, and decide to do?
Describe what you would expect to see on a page at this URL, then choose an action.
Respond in JSON format.`;
}

interface ParsedCognitiveResponse {
  phase?: "perceive" | "comprehend" | "decide" | "execute" | "evaluate";
  monologue?: string;
  action?: string;
  actionTarget?: string;
  goalAchieved?: boolean;
  goalProgress?: number;
  newConfusion?: number;
  newFrustration?: number;
  mood?:
    | "neutral"
    | "hopeful"
    | "confused"
    | "frustrated"
    | "defeated"
    | "relieved";
  frictionDescription?: string;
  frictionElement?: string;
}

function parseCognitiveResponse(response: string): ParsedCognitiveResponse {
  try {
    // Extract JSON from response (may have markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Parsing failed
  }
  return {};
}

function checkAbandonmentTriggers(
  state: CognitiveState,
  thresholds: AbandonmentThresholds
): { reason: CognitiveJourneyResult["abandonmentReason"]; message: string } | null {
  if (state.patienceRemaining < thresholds.patienceMin) {
    return { reason: "patience", message: "This is taking too long. I give up." };
  }
  if (state.confusionLevel > thresholds.confusionMax) {
    return {
      reason: "confusion",
      message: "I have no idea what to do. This is too confusing.",
    };
  }
  if (state.frustrationLevel > thresholds.frustrationMax) {
    return {
      reason: "frustration",
      message: "This is so frustrating! I'm done.",
    };
  }

  // Loop detection
  const recentPages = state.memory.pagesVisited.slice(-5);
  const uniqueRecent = new Set(recentPages).size;
  if (
    recentPages.length >= 5 &&
    uniqueRecent <= thresholds.loopDetectionThreshold
  ) {
    return {
      reason: "loop",
      message: "I keep ending up on the same pages. Something is wrong.",
    };
  }

  // No progress
  if (
    state.stepCount > thresholds.maxStepsWithoutProgress &&
    state.goalProgress < 0.1
  ) {
    return {
      reason: "no_progress",
      message: "I'm not making any progress. This isn't working.",
    };
  }

  return null;
}

interface ActionResult {
  success: boolean;
  newUrl?: string;
}

async function executeAction(browser: CBrowser, action: string): Promise<ActionResult> {
  const [type, ...args] = action.split(":");

  switch (type) {
    case "click": {
      const selector = args.join(":");
      const result = await browser.click(selector);
      return { success: result.success };
    }
    case "fill": {
      const [selector, ...valueParts] = args;
      const result = await browser.fill(selector, valueParts.join(":"));
      return { success: result.success };
    }
    case "navigate": {
      const url = args.join(":");
      const result = await browser.navigate(url);
      return { success: true, newUrl: result.url };
    }
    default:
      // Unknown action type, skip
      return { success: false };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
