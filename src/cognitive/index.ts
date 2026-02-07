/**
 * Cognitive Journey API Module
 *
 * Provides cognitive user simulation with two modes:
 *
 * ## Mode 1: Claude Code Session (Recommended when inside Claude Code)
 * When running via MCP inside Claude Code, use the step-by-step tools:
 * - `cognitive_journey_init` - Initialize journey with persona
 * - `cognitive_journey_update_state` - Track cognitive state after each action
 * No API key needed - Claude Code itself is the reasoning engine.
 *
 * ## Mode 2: Standalone (API Key Required)
 * When running standalone (CLI, CI/CD, scripts), uses Anthropic API directly:
 * - `npx cbrowser cognitive-journey --persona X --start URL --goal "..."
 * Requires: `npx cbrowser config set-api-key YOUR_KEY`
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
  DecisionFatigueState,
  CognitiveMode,
} from "../types.js";
import {
  calculateFatigueIncrement,
  calculateFittsMovementTime,
  FittsLawParams,
  shouldSwitchToSystem2,
  canReturnToSystem1,
  calculateTypingTime,
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

/**
 * Check if running inside Claude Code session (via MCP).
 * In this mode, cognitive journeys can be driven by Claude Code itself
 * without needing a separate API key.
 */
export function isClaudeCodeSession(): boolean {
  // Check for MCP environment markers
  return !!(
    process.env.CLAUDE_CODE_SESSION ||
    process.env.MCP_SERVER_NAME ||
    process.env.CLAUDE_CODE
  );
}

/**
 * Check if cognitive features are available (either via API key or Claude Code session).
 */
export function isCognitiveAvailable(): boolean {
  return isApiKeyConfigured() || isClaudeCodeSession();
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
  /** Enable vision mode - send screenshots to Claude for visual understanding */
  vision?: boolean;
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
      "Anthropic API key not configured.\n\n" +
      "TWO OPTIONS:\n" +
      "1. Inside Claude Code: Use MCP tools (cognitive_journey_init, cognitive_journey_update_state) - no API key needed\n" +
      "2. Standalone/CLI: Run: npx cbrowser config set-api-key YOUR_KEY"
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
    // Decision fatigue threshold based on persistence (v9.9.0)
    // High persistence = can handle more decisions before giving up
    decisionFatigueMax: traits.persistence > 0.7 ? 0.95 : traits.persistence < 0.3 ? 0.7 : 0.85,
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
    // Decision fatigue tracking (v9.9.0)
    decisionFatigue: {
      decisionsMade: 0,
      fatigueLevel: 0,
      lastDecisionComplexity: 0,
      choosingDefaults: false,
    },
    // Dual-process cognitive mode (v9.10.0)
    // Experts start in System 1 (fast), novices in System 2 (slow)
    cognitiveMode: {
      system: traits.comprehension > 0.7 ? 1 : 2,
      switchThreshold: traits.comprehension < 0.4 ? 0.4 : 0.6,
      system1Errors: 0,
      timeInSystem1: 0,
      timeInSystem2: 0,
    },
  };

  // Calculate Fitts' Law params from persona (v9.9.0)
  // Higher jitter/overshoot = more tremor-like movement
  // Demographics age affects motor control
  const mouseParams = personaObj.humanBehavior?.mouse;
  const ageRange = personaObj.demographics?.age_range;

  // Derive age modifier from age_range (e.g., "18-25", "65+")
  let ageModifier = 1.0;
  if (ageRange) {
    const ageMatch = ageRange.match(/(\d+)/);
    if (ageMatch) {
      const age = parseInt(ageMatch[1], 10);
      // Motor control degrades with age: 1.0 at 25, 1.5 at 65, 2.0 at 85
      ageModifier = age > 40 ? 1 + (age - 40) / 50 : 1.0;
    }
  }

  // Derive tremor modifier from mouse params or motor traits
  let tremorModifier = 0;
  if (mouseParams) {
    // Higher jitter = more tremor effect
    tremorModifier = (mouseParams.jitter || 0) / 10;
  }

  const fittsParams: Partial<FittsLawParams> = {
    ageModifier,
    tremorModifier,
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

    // Get page info and available elements
    const page = await browser.getPage();
    const pageTitle = await page.title() || "Current Page";
    const availableElements = await browser.getAvailableClickables();
    const availableInputs = await browser.getAvailableInputs();

    // Extract visible page content (headings, paragraphs, etc.)
    const pageContent = await page.evaluate(() => {
      const content: string[] = [];
      // Get main headings
      document.querySelectorAll('h1, h2, h3').forEach(el => {
        const text = (el as HTMLElement).innerText?.trim();
        if (text && text.length < 100) content.push(`[${el.tagName}] ${text}`);
      });
      // Get key paragraphs (first 3)
      const paragraphs = Array.from(document.querySelectorAll('p, .content, main, article'));
      paragraphs.slice(0, 3).forEach(el => {
        const text = (el as HTMLElement).innerText?.trim().substring(0, 200);
        if (text && text.length > 20) content.push(`[content] ${text}...`);
      });
      return content.slice(0, 10).join('\n');
    }).catch(() => '');

    // Build step prompt with available elements so Claude knows what's clickable and fillable
    const stepPrompt = buildStepPrompt(state, currentUrl, pageTitle, step, availableElements, availableInputs, pageContent);

    // Build message content - with or without vision
    let messageContent: Anthropic.MessageParam["content"];
    if (options.vision && screenshotPath && existsSync(screenshotPath)) {
      // Vision mode: send screenshot as image
      const imageData = readFileSync(screenshotPath).toString('base64');
      messageContent = [
        {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: "image/png" as const,
            data: imageData,
          },
        },
        {
          type: "text" as const,
          text: stepPrompt,
        },
      ];
    } else {
      messageContent = stepPrompt;
    }

    messages.push({ role: "user", content: messageContent as string });

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

    // Dual-Process Theory: System 1/2 switching (v9.10.0)
    if (state.cognitiveMode) {
      const stepStartTime = Date.now();

      if (state.cognitiveMode.system === 1) {
        // In System 1 (fast mode) - check if should switch to System 2
        if (shouldSwitchToSystem2(state.confusionLevel, state.cognitiveMode)) {
          state.cognitiveMode.system = 2;
          if (options.verbose) {
            console.log(`🧠 Switching to System 2 (deliberate thinking) - confusion: ${(state.confusionLevel * 100).toFixed(0)}%`);
          }
        }
        state.cognitiveMode.timeInSystem1 += Date.now() - stepStartTime;
      } else {
        // In System 2 (slow mode) - check if can return to System 1
        const recentSuccess = state.memory.actionsAttempted.length > 0 &&
          state.memory.actionsAttempted[state.memory.actionsAttempted.length - 1]?.success;
        if (canReturnToSystem1(state.confusionLevel, recentSuccess)) {
          state.cognitiveMode.system = 1;
          state.cognitiveMode.system1Errors = 0; // Reset error count
          if (options.verbose) {
            console.log(`🧠 Returning to System 1 (intuitive thinking) - task familiar`);
          }
        }
        state.cognitiveMode.timeInSystem2 += Date.now() - stepStartTime;
      }
    }

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
        const result = await executeAction(browser, parsed.action, fittsParams);
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

      // Update decision fatigue (v9.9.0)
      // Every action is a decision - fatigue accumulates
      if (state.decisionFatigue) {
        state.decisionFatigue.decisionsMade++;
        // Estimate decision complexity: clicks on links = easy (2 options),
        // form fills = medium (5), navigation choices = hard (8+)
        const estimatedOptions = parsed.action.toLowerCase().includes("fill")
          ? 5
          : parsed.action.toLowerCase().includes("navigate") || parsed.action.toLowerCase().includes("search")
            ? 8
            : 3;
        const fatigueIncrement = calculateFatigueIncrement(estimatedOptions);
        state.decisionFatigue.fatigueLevel = Math.min(1, state.decisionFatigue.fatigueLevel + fatigueIncrement);
        state.decisionFatigue.lastDecisionComplexity = estimatedOptions;

        // High fatigue triggers default-seeking behavior
        if (state.decisionFatigue.fatigueLevel > 0.7) {
          state.decisionFatigue.choosingDefaults = true;
        }

        if (options.verbose) {
          console.log(
            `🧠 Decision Fatigue: ${(state.decisionFatigue.fatigueLevel * 100).toFixed(0)}% (${state.decisionFatigue.decisionsMade} decisions)`
          );
        }
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
      // Decision fatigue metrics (v9.9.0)
      decisionsMade: state.decisionFatigue?.decisionsMade ?? 0,
      finalDecisionFatigue: state.decisionFatigue?.fatigueLevel ?? 0,
      wasChoosingDefaults: state.decisionFatigue?.choosingDefaults ?? false,
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
  "action": "click:selector|hover:selector|fill:selector:value|navigate:url|null",
  "actionTarget": "description of what you're clicking/filling",
  "goalAchieved": boolean,
  "goalProgress": 0.0-1.0,
  "newConfusion": 0.0-1.0,
  "newFrustration": 0.0-1.0,
  "mood": "neutral|hopeful|confused|frustrated|defeated|relieved",
  "frictionDescription": "what caused confusion/frustration (if any)" | null,
  "frictionElement": "element that caused friction" | null
}

ACTIONS:
- click:selector - Click an element (auto-hovers parent menus for dropdowns)
- hover:selector - Hover over element to reveal dropdown menus
- fill:selector:value - Type text into an input field OR select an option from a dropdown
  IMPORTANT: For <select> dropdowns, use fill with the option text (e.g., fill:Gender:Female)
  Do NOT click on select dropdowns - use fill directly with the desired option value
- navigate:url - Go to a URL directly

ABANDONMENT THRESHOLDS:
- If patience drops below ${thresholds.patienceMin}, give up
- If confusion exceeds ${thresholds.confusionMax}, give up
- If frustration exceeds ${thresholds.frustrationMax}, give up

BEHAVIOR GUIDELINES:
1. PERCEIVE: Describe what you see on the page
2. COMPREHEND: Interpret UI based on your comprehension level (low = more confusion)
3. DECIDE: Choose action based on risk tolerance and goal relevance
4. For click actions, use text that matches elements from AVAILABLE ELEMENTS (partial match OK, e.g., "Admissions" or "Apply" - the system does fuzzy matching)
5. Prefer clicking elements you can SEE in the AVAILABLE ELEMENTS list - avoid guessing element names
6. For dropdown menus: if a click doesn't work, try hover:menuname first to reveal the submenu
7. If comprehension is low, misinterpret ambiguous elements
8. If patience is low, get frustrated quickly with delays
9. Generate authentic inner monologue matching persona voice

Always respond with valid JSON.`;
}

interface PageElement {
  tag: string;
  text: string;
  selector: string;
  role?: string;
}

interface AvailableInput {
  selector: string;
  type: string;
  name: string;
  placeholder: string;
  label: string;
  isHidden?: boolean;
  triggerText?: string;
  options?: string[]; // Available options for select elements
}

function buildStepPrompt(
  state: CognitiveState,
  currentUrl: string,
  pageTitle: string,
  step: number,
  availableElements: PageElement[] = [],
  availableInputs: AvailableInput[] = [],
  pageContent: string = ""
): string {
  const elementsStr = availableElements.length > 0
    ? availableElements.map(e => `  - "${e.text}" (${e.tag}${e.role ? `, role=${e.role}` : ""})`).join("\n")
    : "  (no clickable elements detected)";

  // Format inputs - highlight hidden ones with their triggers, show options for selects
  const inputsStr = availableInputs.length > 0
    ? availableInputs.map(i => {
        const desc = i.label || i.placeholder || i.name || i.type;
        if (i.isHidden && i.triggerText) {
          return `  - "${desc}" (${i.type}, custom dropdown - click "${i.triggerText}" to open)`;
        } else if (i.isHidden) {
          return `  - "${desc}" (${i.type}, hidden/custom UI)`;
        } else if (i.type === 'select' && i.options && i.options.length > 0) {
          // Show available options for select dropdowns
          return `  - "${desc}" (select dropdown) → use fill:${desc}:OptionValue\n      Options: ${i.options.join(", ")}`;
        }
        return `  - "${desc}" (${i.type})`;
      }).join("\n")
    : "  (no form inputs detected)";

  const contentStr = pageContent
    ? `\nVISIBLE PAGE CONTENT:\n${pageContent}\n`
    : "";

  return `STEP ${step}

CURRENT PAGE:
- URL: ${currentUrl}
- Title: ${pageTitle}
${contentStr}
AVAILABLE ELEMENTS (clickable):
${elementsStr}

FORM INPUTS (fillable):
${inputsStr}

CURRENT STATE:
- Patience: ${(state.patienceRemaining * 100).toFixed(0)}%
- Confusion: ${(state.confusionLevel * 100).toFixed(0)}%
- Frustration: ${(state.frustrationLevel * 100).toFixed(0)}%
- Goal Progress: ${(state.goalProgress * 100).toFixed(0)}%
- Mood: ${state.currentMood}
- Pages Visited: ${state.memory.pagesVisited.length}
- Actions Attempted: ${state.memory.actionsAttempted.length}

Based on the page content, AVAILABLE ELEMENTS, and FORM INPUTS above, what do you perceive, comprehend, and decide to do?
- To click: use "click:ElementText"
- To fill a form field: use "fill:FieldName:value"
- To navigate: use "navigate:URL"
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

  // Decision fatigue check (v9.9.0)
  if (
    state.decisionFatigue &&
    thresholds.decisionFatigueMax &&
    state.decisionFatigue.fatigueLevel > thresholds.decisionFatigueMax
  ) {
    return {
      reason: "decision_fatigue" as CognitiveJourneyResult["abandonmentReason"],
      message: "Too many choices... I can't think straight anymore. Maybe later.",
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
  movementTimeMs?: number;
  typingTimeMs?: number;
}

/**
 * Execute an action with optional Fitts' Law mouse timing (v9.9.0)
 *
 * Fitts' Law: MT = a + b × log₂(D/W + 1)
 * - MT: Movement time in ms
 * - D: Distance to target
 * - W: Target width
 * - a, b: Empirical constants (50ms, 150ms)
 *
 * For cognitive simulation, we estimate distance as 300px (average screen movement)
 * and target width as 80px (average button size). Persona traits modify timing.
 */
async function executeAction(
  browser: CBrowser,
  action: string,
  fittsParams?: Partial<FittsLawParams>
): Promise<ActionResult> {
  const [type, ...args] = action.split(":");

  // Apply Fitts' Law timing for mouse actions (v9.9.0)
  let movementTimeMs = 0;
  if (["click", "hover", "hoverclick"].includes(type) && fittsParams) {
    // Estimate target size and distance
    // Average button width ~80px, average screen movement distance ~300px
    const estimatedDistance = 300;
    const estimatedTargetWidth = 80;

    movementTimeMs = calculateFittsMovementTime(
      estimatedDistance,
      estimatedTargetWidth,
      fittsParams
    );

    // Add realistic delay before the click
    await sleep(movementTimeMs);
  }

  switch (type) {
    case "click": {
      const selector = args.join(":");
      // Use hoverClick for potentially dropdown menu items
      // This will try hovering parent menus if the element isn't immediately found
      const result = await browser.hoverClick(selector);
      return { success: result.success, movementTimeMs };
    }
    case "hover": {
      const selector = args.join(":");
      const result = await browser.hover(selector);
      return { success: result.success, movementTimeMs };
    }
    case "hoverclick": {
      // Explicit hover-click with optional parent: hoverclick:target:parent
      const [selector, parent] = args;
      const result = await browser.hoverClick(selector, { hoverParent: parent });
      return { success: result.success, movementTimeMs };
    }
    case "fill": {
      const [selector, ...valueParts] = args;
      const value = valueParts.join(":");

      // Apply KLM timing for typing (v9.10.0)
      // Use age modifier as proxy for typing expertise (younger = faster)
      const expertise = fittsParams?.ageModifier
        ? Math.max(0, 1 - (fittsParams.ageModifier - 1))
        : 0.5;
      const typingTimeMs = calculateTypingTime(value, expertise, true);

      // Add realistic typing delay
      await sleep(typingTimeMs);

      const result = await browser.fill(selector, value);
      return { success: result.success, typingTimeMs };
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
