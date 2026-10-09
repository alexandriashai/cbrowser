#!/usr/bin/env node
/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * CBrowser MCP Server
 *
 * Exposes CBrowser browser automation tools via Model Context Protocol.
 * Run with: cbrowser mcp-server
 * Or: npx cbrowser mcp-server
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PERSONA_CATEGORIES } from "./persona-questionnaire.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CBrowser } from "./browser.js";
import { ensureDirectories, getStatusInfo } from "./config.js";

// Screen capture tools — implementation shared with the remote MCP server
import {
  startCapture,
  stopCapture,
  captureStatus,
  CAPTURE_START_DESCRIPTION,
  CAPTURE_STOP_DESCRIPTION,
  CAPTURE_STATUS_DESCRIPTION,
} from "./mcp-tools/base/capture-tools.js";
import { registerEmpathyAuditTool } from "./mcp-tools/base/audit-tools.js";
import { registerValuesTools } from "./mcp-tools/base/values-tools.js";
import { registerPersonaComparisonTools } from "./mcp-tools/base/persona-comparison-tools.js";
import { registerPersonaCreationTools } from "./mcp-tools/persona-creation-tools.js";
import { registerPersonaLifecycleTools } from "./mcp-tools/persona-lifecycle-tools.js";
import { registerUiResources } from "./mcp-tools/ui-resources.js";
import { countRegisteredTools } from "./mcp-tools/base/browser-management-tools.js";
import { applySecurityLayer } from "./mcp-tools/security-layer.js";

// Visual module imports
import {
  runVisualRegression,
  runCrossBrowserTest,
  runResponsiveTest,
  runABComparison,
  crossBrowserDiff,
  captureVisualBaseline,
  listVisualBaselines,
} from "./visual/index.js";

// Testing module imports
import {
  runNLTestSuite,
  parseNLTestSuite,
  dryRunNLTestSuite,
  repairTest,
  detectFlakyTests,
  generateCoverageMap,
} from "./testing/index.js";
import type { NLTestCase, NLTestStep } from "./types.js";

// Analysis module imports
import {
  huntBugs,
  huntBugsResponse,
  runChaosTest,
  comparePersonas,
  findElementByIntent,
  FIND_ELEMENT_BY_INTENT_DESCRIPTION,
  runAgentReadyAudit,
  pageAgentReadyFindings,
  runCompetitiveBenchmark,
  runEmpathyAudit,
  countAffectedElements,
} from "./analysis/index.js";
import { listAccessibilityPersonas, getAccessibilityPersona, describeAccessibilityPersona } from "./personas.js";

// Persona imports for cognitive journey
import {
  getPersona,
  getAnyPersona,
  listPersonas,
  listAllPersonas,
  getCognitiveProfile,
  createCognitivePersona,
  saveCustomPersona,
  listEmotionalPersonas,
  getEmotionalPersona,
  isAgentPersonaObject,
} from "./personas.js";

// Emotional state functions (v13.1.0)
import {
  createInitialEmotionalState,
  createEmotionalConfig,
  applyEmotionalTrigger,
  describeEmotionalState,
  shouldConsiderAbandonment,
  calculateAbandonmentModifier,
  calculateExplorationTendency,
  calculateDecisionSpeedModifier,
} from "./cognitive/emotions.js";
import type {
  CognitiveState,
  AbandonmentThresholds,
  CognitiveProfile,
  CognitiveTraits,
  Persona,
  AccessibilityPersona,
  AccessibilityBarrier,
  AccessibilityBarrierType,
  AccessibilityBarrierSeverity,
} from "./types.js";

// Performance module imports
import {
  capturePerformanceBaseline,
  detectPerformanceRegression,
  listPerformanceBaselines,
} from "./performance/index.js";

// Values system (Schwartz's 10 Universal Values)
import {
  resolveValuesForPersona,
  hasPersonaValues,
  PERSONA_VALUE_PROFILES,
  calculatePatternSusceptibility,
  rankInfluencePatternsForProfile,
  INFLUENCE_PATTERNS,
} from "./values/index.js";

// Version from package.json - single source of truth
import { VERSION } from "./version.js";

// Persona questionnaire imports
import {
  generatePersonaQuestionnaire,
  buildTraitsFromAnswers,
  TRAIT_REFERENCE_MATRIX,
  deriveValuesFromTraits,
  type QuestionnaireQuestion,
} from "./persona-questionnaire.js";

// Security tools (mcp-guardian)
import {
  securityAuditHandler,
  type SecurityAuditHandlerOptions,
} from "mcp-guardian";

// Shared browser instance
let browser: CBrowser | null = null;

async function getBrowser(): Promise<CBrowser> {
  if (!browser) {
    browser = new CBrowser({
      headless: true,
      persistent: true,
    });
  }
  return browser;
}

/**
 * v14.2.1: Retry wrapper for transient browser errors.
 * v14.2.5: Fixed page context desync after error recovery.
 * Retries operations that fail with common transient error patterns.
 *
 * v16.11.0: CRASH RESILIENCE PATTERN
 * For tools that use context-level operations (setOffline, route interception),
 * use an explicit try-catch + recovery pattern instead of withRetry:
 *
 *   try {
 *     const result = await dangerousOperation();
 *     return { content: [{ type: "text", text: JSON.stringify(result) }] };
 *   } catch (error: any) {
 *     try { await browser.recoverBrowser(); } catch { }
 *     return { content: [{ type: "text", text: JSON.stringify({
 *       error: error.message, recovered: true
 *     }) }] };
 *   }
 *
 * This ensures the MCP server never crashes from unhandled browser errors.
 * See chaos_test for the reference implementation.
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  options: { maxRetries?: number; retryDelay?: number } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const retryDelay = options.retryDelay ?? 500;

  let lastError: Error | null = null;

  // v14.2.5: Capture current URL before operation to restore after recovery
  let expectedUrl: string | null = null;
  try {
    const b = await getBrowser();
    const page = await b.getPage();
    expectedUrl = page.url();
  } catch {
    // Can't get URL, proceed without context preservation
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (e) {
      lastError = e as Error;
      const errorMessage = lastError.message || "";

      // Check if this is a transient error worth retrying
      const isTransient =
        errorMessage.includes("Target closed") ||
        errorMessage.includes("Execution context") ||
        errorMessage.includes("Session closed") ||
        errorMessage.includes("Connection refused") ||
        errorMessage.includes("Browser disconnected");

      if (!isTransient || attempt === maxRetries) {
        throw lastError;
      }

      // Wait before retry with exponential backoff
      await new Promise((r) => setTimeout(r, retryDelay * (attempt + 1)));

      // Try to recover the browser before retrying
      try {
        const b = await getBrowser();
        await b.recoverBrowser();

        // v14.2.5: Verify page context matches expected URL after recovery
        // This prevents desync where recovery loads a different saved session
        if (expectedUrl && expectedUrl !== "about:blank") {
          const page = await b.getPage();
          const currentUrl = page.url();
          if (currentUrl !== expectedUrl && !currentUrl.startsWith(expectedUrl.split("?")[0])) {
            // Page recovered to wrong URL, navigate back
            await page.goto(expectedUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
          }
        }
      } catch {
        // Recovery failed, will retry operation anyway
      }
    }
  }

  throw lastError;
}

// =========================================================================
// Persona Questionnaire Session Management
// =========================================================================

interface ValueQuestion {
  id: string;
  value: string;
  question: string;
  options: Array<{ value: number; label: string; description: string }>;
}

const VALUES_QUESTIONS: ValueQuestion[] = [
  {
    id: "security", value: "security",
    question: "How important is safety and stability to this persona?",
    options: [
      { value: 0.0, label: "Not Important", description: "Takes risks freely, ignores safety warnings" },
      { value: 0.33, label: "Somewhat Important", description: "Considers safety but willing to take chances" },
      { value: 0.67, label: "Important", description: "Prefers established, secure options" },
      { value: 1.0, label: "Very Important", description: "Prioritizes safety above almost everything" },
    ],
  },
  {
    id: "stimulation", value: "stimulation",
    question: "How much does this persona seek excitement and novelty?",
    options: [
      { value: 0.0, label: "Avoids", description: "Prefers predictable, calm experiences" },
      { value: 0.33, label: "Occasionally", description: "Open to new things but not seeking them" },
      { value: 0.67, label: "Seeks", description: "Actively looks for new and exciting experiences" },
      { value: 1.0, label: "Craves", description: "Constantly seeking stimulation and novelty" },
    ],
  },
  {
    id: "achievement", value: "achievement",
    question: "How driven is this persona by personal success and competence?",
    options: [
      { value: 0.0, label: "Not Driven", description: "Success is not a priority" },
      { value: 0.33, label: "Moderately", description: "Likes to succeed but not at all costs" },
      { value: 0.67, label: "Driven", description: "Works hard to demonstrate competence" },
      { value: 1.0, label: "Highly Driven", description: "Success and achievement are paramount" },
    ],
  },
  {
    id: "conformity", value: "conformity",
    question: "How much does this persona follow social expectations and norms?",
    options: [
      { value: 0.0, label: "Independent", description: "Makes own rules, ignores conventions" },
      { value: 0.33, label: "Flexible", description: "Follows norms when convenient" },
      { value: 0.67, label: "Compliant", description: "Generally follows social expectations" },
      { value: 1.0, label: "Traditional", description: "Strongly adheres to social norms" },
    ],
  },
  {
    id: "hedonism", value: "hedonism",
    question: "How much does this persona prioritize pleasure and enjoyment?",
    options: [
      { value: 0.0, label: "Practical", description: "Prioritizes function over pleasure" },
      { value: 0.33, label: "Balanced", description: "Enjoys pleasure but not a priority" },
      { value: 0.67, label: "Pleasure-Seeking", description: "Actively seeks enjoyable experiences" },
      { value: 1.0, label: "Hedonistic", description: "Pleasure and enjoyment are top priorities" },
    ],
  },
  {
    id: "power", value: "power",
    question: "How important is social status and influence to this persona?",
    options: [
      { value: 0.0, label: "Not Important", description: "Doesn't care about status or control" },
      { value: 0.33, label: "Minor Concern", description: "Aware of status but not driven by it" },
      { value: 0.67, label: "Important", description: "Values influence and recognition" },
      { value: 1.0, label: "Critical", description: "Status and control are major motivators" },
    ],
  },
  {
    id: "tradition", value: "tradition",
    question: "How much does this persona value cultural and family traditions?",
    options: [
      { value: 0.0, label: "Progressive", description: "Embraces change, questions traditions" },
      { value: 0.33, label: "Moderate", description: "Respects traditions but open to change" },
      { value: 0.67, label: "Traditional", description: "Values and maintains traditions" },
      { value: 1.0, label: "Strongly Traditional", description: "Traditions are core to identity" },
    ],
  },
  {
    id: "benevolence", value: "benevolence",
    question: "How much does this persona prioritize caring for close others?",
    options: [
      { value: 0.0, label: "Self-Focused", description: "Prioritizes own needs over others" },
      { value: 0.33, label: "Balanced", description: "Cares for others when convenient" },
      { value: 0.67, label: "Caring", description: "Actively helps and supports close others" },
      { value: 1.0, label: "Devoted", description: "Others' welfare is a top priority" },
    ],
  },
  {
    id: "universalism", value: "universalism",
    question: "How much does this persona care about broader social and environmental issues?",
    options: [
      { value: 0.0, label: "Narrow Focus", description: "Focuses on immediate concerns only" },
      { value: 0.33, label: "Aware", description: "Somewhat concerned about broader issues" },
      { value: 0.67, label: "Engaged", description: "Actively considers social/environmental impact" },
      { value: 1.0, label: "Activist", description: "Deeply committed to social justice and environment" },
    ],
  },
  {
    id: "selfDirection", value: "selfDirection",
    question: "How much does this persona value independence and autonomy?",
    options: [
      { value: 0.0, label: "Guided", description: "Prefers clear direction from others" },
      { value: 0.33, label: "Moderate", description: "Likes some guidance but can be independent" },
      { value: 0.67, label: "Independent", description: "Prefers making own choices" },
      { value: 1.0, label: "Autonomous", description: "Strongly values independence and self-reliance" },
    ],
  },
];

interface QuestionnaireSession {
  personaName: string;
  questions: QuestionnaireQuestion[];
  valueQuestions: ValueQuestion[];
  answers: Record<string, number>;
  valueAnswers: Record<string, number>;
  currentIndex: number;
  phase: "traits" | "values";
  comprehensive: boolean;
  startedAt: number;
  lastQuestionAskedAt: number;
}

const questionnaireSessionsMap = new Map<string, QuestionnaireSession>();

/**
 * Group a flat Schwartz/SDT value record into the nested schema every other
 * values-returning path uses (schwartz / higherOrder / sdt / maslowLevel).
 *
 * persona_questionnaire_build emitted `values` FLAT, with Schwartz and SDT
 * merged and no higherOrder grouping — so the C4b nested-schema fix never
 * reached the creation path, and a persona built through the questionnaire had
 * a different value shape from the same persona loaded back. Three sites
 * already hand-write this grouping; this is the shared one. (2026-07-29)
 */
function nestPersonaValues(values: Record<string, unknown> | undefined) {
  if (!values) return undefined;
  const pick = (...keys: string[]) => {
    const out: Record<string, unknown> = {};
    for (const k of keys) if (values[k] !== undefined) out[k] = values[k];
    return out;
  };
  return {
    schwartz: pick("selfDirection", "stimulation", "hedonism", "achievement", "power",
                   "security", "conformity", "tradition", "benevolence", "universalism"),
    higherOrder: pick("openness", "selfEnhancement", "conservation", "selfTranscendence"),
    sdt: pick("autonomyNeed", "competenceNeed", "relatednessNeed"),
    maslowLevel: values.maslowLevel,
  };
}

function getQuestionnaireSession(sessionId: string): QuestionnaireSession | undefined {
  return questionnaireSessionsMap.get(sessionId);
}

function setQuestionnaireSession(sessionId: string, session: QuestionnaireSession): void {
  questionnaireSessionsMap.set(sessionId, session);
}

function clearQuestionnaireSession(sessionId: string): void {
  questionnaireSessionsMap.delete(sessionId);
}

function getTraitHeader(trait: string): string {
  const headers: Record<string, string> = {
    patience: "Patience", riskTolerance: "Risk", comprehension: "Comprehension",
    persistence: "Persistence", curiosity: "Curiosity", workingMemory: "Memory",
    readingTendency: "Reading", resilience: "Resilience", selfEfficacy: "Confidence",
    satisficing: "Decisions", trustCalibration: "Trust", interruptRecovery: "Focus",
    informationForaging: "Search Style", changeBlindness: "Awareness", anchoringBias: "Anchoring",
    timeHorizon: "Time Focus", attributionStyle: "Attribution", metacognitivePlanning: "Planning",
    proceduralFluency: "Procedures", transferLearning: "Transfer", authoritySensitivity: "Authority",
    emotionalContagion: "Emotional", fearOfMissingOut: "FOMO", socialProofSensitivity: "Social Proof",
    mentalModelFlexibility: "Flexibility",
  };
  return headers[trait] || trait;
}

function convertToThirdPerson(question: string): string {
  return question
    .replace(/\bdo you\b/gi, "does this persona")
    .replace(/\bare you\b/gi, "is this persona")
    .replace(/\byou're\b/gi, "this persona is")
    .replace(/\byou've\b/gi, "they have")
    .replace(/\byou'd\b/gi, "they would")
    .replace(/\byour\b/gi, "their")
    .replace(/\byou\b/gi, "they");
}

// =========================================================================
// Comparison Session Bridge (for API-free persona comparisons via Claude)
// =========================================================================

interface ComparisonSession {
  id: string;
  url: string;
  goal: string;
  personas: Array<{
    name: string;
    description: string;
    profile: CognitiveProfile;
    initialState: CognitiveState;
    thresholds: AbandonmentThresholds;
  }>;
  results: Array<{
    persona: string;
    goalAchieved: boolean;
    abandonmentReason?: string;
    finalState: CognitiveState;
    stepCount: number;
    timeElapsed: number;
    frictionPoints: Array<{ type: string; description: string }>;
  }>;
  createdAt: number;
}

// Session storage (in-memory, cleared when server restarts)
const comparisonSessions = new Map<string, ComparisonSession>();

// =========================================================================
// Empathy Audit Session Bridge (for API-free accessibility testing via Claude)
// =========================================================================

interface EmpathyAuditSession {
  id: string;
  url: string;
  goal: string;
  wcagLevel: "A" | "AA" | "AAA";
  personas: Array<{
    name: string;
    disabilityType: string;
    description: string;
    accessibilityTraits: AccessibilityPersona["accessibilityTraits"];
    cognitiveTraits?: AccessibilityPersona["cognitiveTraits"];
  }>;
  currentPersonaIndex: number;
  barriers: AccessibilityBarrier[];
  wcagViolations: Set<string>;
  personaResults: Array<{
    persona: string;
    disabilityType: string;
    goalAchieved: boolean;
    barriers: AccessibilityBarrier[];
    wcagViolations: string[];
    stepCount: number;
    empathyScore: number;
  }>;
  createdAt: number;
}

// WCAG criteria reference for barrier mapping
const WCAG_CRITERIA: Record<string, { level: "A" | "AA" | "AAA"; description: string }> = {
  "1.1.1": { level: "A", description: "Non-text Content" },
  "1.3.1": { level: "A", description: "Info and Relationships" },
  "1.4.1": { level: "A", description: "Use of Color" },
  "1.4.3": { level: "AA", description: "Contrast (Minimum)" },
  "1.4.4": { level: "AA", description: "Resize Text" },
  "1.4.6": { level: "AAA", description: "Contrast (Enhanced)" },
  "1.4.10": { level: "AA", description: "Reflow" },
  "2.1.1": { level: "A", description: "Keyboard" },
  "2.1.2": { level: "A", description: "No Keyboard Trap" },
  "2.2.1": { level: "A", description: "Timing Adjustable" },
  "2.2.2": { level: "A", description: "Pause, Stop, Hide" },
  "2.4.1": { level: "A", description: "Bypass Blocks" },
  "2.4.3": { level: "A", description: "Focus Order" },
  "2.4.6": { level: "AA", description: "Headings and Labels" },
  "2.4.7": { level: "AA", description: "Focus Visible" },
  "2.5.5": { level: "AAA", description: "Target Size" },
  "2.5.8": { level: "AA", description: "Target Size (Minimum)" },
  "3.3.1": { level: "A", description: "Error Identification" },
  "3.3.2": { level: "A", description: "Labels or Instructions" },
  "4.1.2": { level: "A", description: "Name, Role, Value" },
};

function getWcagCriteriaForBarrier(barrierType: AccessibilityBarrierType): string[] {
  switch (barrierType) {
    case "motor_precision":
      return ["2.5.5", "2.5.8"];
    case "visual_clarity":
      return ["1.4.3", "1.4.6", "1.4.4"];
    case "cognitive_load":
      return ["2.4.6", "3.3.2"];
    case "temporal":
      return ["2.2.1", "2.2.2"];
    case "sensory":
      return ["1.1.1", "1.4.1"];
    case "contrast":
      return ["1.4.3", "1.4.6"];
    case "touch_target":
      return ["2.5.5", "2.5.8"];
    case "timing":
      return ["2.2.1", "2.2.2"];
    default:
      return [];
  }
}

const empathyAuditSessions = new Map<string, EmpathyAuditSession>();

// Cleanup old sessions (older than 1 hour)
function cleanupOldSessions(): void {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [id, session] of comparisonSessions) {
    if (session.createdAt < oneHourAgo) {
      comparisonSessions.delete(id);
    }
  }
  for (const [id, session] of empathyAuditSessions) {
    if (session.createdAt < oneHourAgo) {
      empathyAuditSessions.delete(id);
    }
  }
}

// Helper: Get barrier hints based on persona traits
function getBarrierHintsForPersona(persona: EmpathyAuditSession["personas"][0]): string[] {
  const hints: string[] = [];
  const traits = persona.accessibilityTraits;

  if (traits?.motorControl !== undefined && traits.motorControl < 0.5) {
    hints.push("Watch for small click targets (<44px), precise hover requirements, drag-and-drop interactions");
  }
  if (traits?.tremor) {
    hints.push("Test for accidental double-clicks, cursor jitter tolerance, need for 'undo' options");
  }
  if (traits?.visionLevel !== undefined && traits.visionLevel < 0.5) {
    hints.push("Check contrast ratios, text scaling support, zoom behavior at 200-300%");
  }
  if (traits?.colorBlindness) {
    hints.push(`Check for color-only information (${traits.colorBlindness} colorblindness), ensure status indicators have non-color cues`);
  }
  if (traits?.processingSpeed !== undefined && traits.processingSpeed < 0.5) {
    hints.push("Watch for time limits, auto-advancing content, complex multi-step processes");
  }
  if (traits?.attentionSpan !== undefined && traits.attentionSpan < 0.5) {
    hints.push("Note distracting animations, long forms, lack of progress indicators");
  }
  // Check for hearing-related disability
  const disabilityType = persona.disabilityType || "";
  const personaName = persona.name || "";
  if (disabilityType.includes("hearing") || disabilityType.includes("deaf") || personaName.includes("deaf") || personaName.includes("hearing")) {
    hints.push("Check for audio-only content, video captions, visual alerts for audio notifications");
  }

  if (hints.length === 0) {
    hints.push("Observe general usability and any unexpected difficulties");
  }

  return hints;
}

// Helper: Get remediation suggestion for barrier type
function getRemediationForBarrier(barrierType: AccessibilityBarrierType, element: string): string {
  const remediations: Record<AccessibilityBarrierType, string> = {
    motor_precision: `Increase target size to at least 44x44px for "${element}". Add generous padding and spacing.`,
    visual_clarity: `Improve contrast ratio to at least 4.5:1 for "${element}". Ensure text scales properly.`,
    cognitive_load: `Simplify "${element}" - reduce options, add clear labels, provide inline help.`,
    temporal: `Remove or extend time limits on "${element}". Allow users to pause/extend deadlines.`,
    sensory: `Add text alternative for "${element}". Don't rely on color alone to convey information.`,
    contrast: `Increase contrast ratio for "${element}" to at least 4.5:1 (3:1 for large text).`,
    touch_target: `Increase touch target size for "${element}" to minimum 44x44px (WCAG 2.5.8).`,
    timing: `Extend or remove timing constraints on "${element}". Provide pause/stop controls.`,
  };
  return remediations[barrierType] || `Review "${element}" for accessibility improvements.`;
}

// Helper: Derive disability type from persona traits
function getDisabilityTypeFromPersona(persona: EmpathyAuditSession["personas"][0]): string {
  const traits = persona.accessibilityTraits;
  if (traits?.tremor) return "Motor impairment (tremor)";
  if (traits?.visionLevel !== undefined && traits.visionLevel < 0.5) return "Low vision";
  if (traits?.colorBlindness) return `Color blindness (${traits.colorBlindness})`;
  if (persona.cognitiveTraits?.workingMemory !== undefined && persona.cognitiveTraits.workingMemory < 0.5) return "Cognitive (ADHD/Memory)";
  if (traits?.processingSpeed !== undefined && traits.processingSpeed < 0.6) return "Cognitive (Processing)";
  // Fallback to name-based detection
  if (persona.name.includes("deaf") || persona.name.includes("hearing")) return "Hearing impairment";
  if (persona.name.includes("motor")) return "Motor impairment";
  if (persona.name.includes("vision") || persona.name.includes("blind")) return "Vision impairment";
  if (persona.name.includes("cognitive") || persona.name.includes("adhd")) return "Cognitive";
  if (persona.name.includes("elderly")) return "Age-related impairments";
  if (persona.name.includes("dyslexic")) return "Dyslexia";
  return "General accessibility";
}

// Helper: Generate recommendations from empathy audit
function generateEmpathyRecommendations(session: EmpathyAuditSession): string[] {
  const recommendations: string[] = [];

  // Check success rate
  const successRate = session.personaResults.filter(r => r.goalAchieved).length / session.personaResults.length;
  if (successRate < 0.5) {
    recommendations.push("CRITICAL: Less than 50% of disability personas could complete the goal. Fundamental accessibility improvements needed.");
  } else if (successRate < 0.8) {
    recommendations.push("Several disability personas struggled to complete the goal. Review barriers by persona type.");
  }

  // Check for critical barriers
  const criticalBarriers = session.barriers.filter(b => b.severity === "critical");
  if (criticalBarriers.length > 0) {
    recommendations.push(`${criticalBarriers.length} critical barriers found. Address these first as they prevent task completion.`);
  }

  // Check WCAG violations by level
  const levelAViolations = Array.from(session.wcagViolations).filter(c => WCAG_CRITERIA[c]?.level === "A");
  if (levelAViolations.length > 0) {
    recommendations.push(`${levelAViolations.length} WCAG Level A violations (minimum compliance). These are legally required in most jurisdictions.`);
  }

  // Persona-specific recommendations
  const worstPersona = session.personaResults.sort((a, b) => a.empathyScore - b.empathyScore)[0];
  if (worstPersona && worstPersona.empathyScore < 50) {
    recommendations.push(`"${worstPersona.persona}" (${worstPersona.disabilityType}) had the worst experience (score: ${worstPersona.empathyScore}). Prioritize improvements for this user group.`);
  }

  if (recommendations.length === 0) {
    recommendations.push("Good accessibility foundation. Continue testing with real users with disabilities for deeper insights.");
  }

  return recommendations;
}

// Tool collector for security_audit self-scan
interface CollectedTool {
  name: string;
  description: string;
}
const collectedTools: CollectedTool[] = [];

/**
 * Register all CBrowser tools on an MCP server instance.
 * Internal function - use createMcpServer() for the public API.
 */
async function registerCBrowserTools(): Promise<McpServer> {
  // Auto-initialize all data directories on server start
  ensureDirectories();

  // Clear collected tools for fresh registration
  collectedTools.length = 0;

  const server = new McpServer({
    name: "cbrowser",
    version: VERSION,
  });

  // Wrap server.tool to collect tool definitions
  const originalTool = server.tool.bind(server);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).tool = (name: string, description: string, ...rest: unknown[]) => {
    collectedTools.push({ name, description });
    return (originalTool as (...args: unknown[]) => unknown)(name, description, ...rest);
  };

  // Security layer: audit logging, description scanning, zone checks. This server
  // registers its own ~100 tools through the deprecated `server.tool(...)` rather
  // than through registerAllPublicTools, so the layer is attached here directly.
  // Wiring only the shared registration path left this entire surface unaudited —
  // found by driving a real tools/call and finding no audit entry, which is the
  // exact "wired but never fires" outcome this change exists to eliminate.
  applySecurityLayer(server);

  // =========================================================================
  // Navigation Tools
  // =========================================================================

  server.tool(
    "navigate",
    "Navigate to a URL and take a screenshot",
    {
      url: z.string().url().describe("The URL to navigate to"),
    },
    async ({ url }) => {
      // v14.2.1: Wrap with retry for transient errors
      return await withRetry(async () => {
        const b = await getBrowser();
        const result = await b.navigate(url);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                url: result.url,
                title: result.title,
                loadTime: result.loadTime,
                screenshot: result.screenshot,
              }, null, 2),
            },
          ],
        };
      });
    }
  );

  // =========================================================================
  // Interaction Tools
  // =========================================================================

  server.tool(
    "click",
    "Click an element on the page using text, selector, or description. Use verbose=true for detailed debug info on failure.",
    {
      selector: z.string().describe("Element to click (text content, CSS selector, or description)"),
      force: z.boolean().optional().describe("Bypass safety checks for destructive actions"),
      verbose: z.boolean().optional().describe("Return available elements and AI suggestions on failure"),
    },
    async ({ selector, force, verbose }) => {
      // v14.2.1: Wrap with retry for transient errors
      return await withRetry(async () => {
        const b = await getBrowser();
        const result = await b.click(selector, { force, verbose });
        const response: Record<string, unknown> = {
          success: result.success,
          message: result.message,
          screenshot: result.screenshot,
        };
        if (result.zone) response.zone = result.zone;
        if (result.target) response.target = result.target;
        if (verbose && !result.success) {
          if (result.availableElements) response.availableElements = result.availableElements;
          if (result.aiSuggestion) response.aiSuggestion = result.aiSuggestion;
          if (result.debugScreenshot) response.debugScreenshot = result.debugScreenshot;
        }
        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        };
      });
    }
  );

  server.tool(
    "smart_click",
    "Click with auto-retry and self-healing selectors. v11.8.0: Added confidence gating - only reports success if healed selector has >= 60% confidence.",
    {
      selector: z.string().describe("Element to click"),
      maxRetries: z.number().optional().default(3).describe("Maximum retry attempts"),
      dismissOverlays: z.boolean().optional().default(false).describe("Dismiss overlays before clicking"),
    },
    async ({ selector, maxRetries, dismissOverlays }) => {
      const b = await getBrowser();
      const result = await b.smartClick(selector, { maxRetries, dismissOverlays });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: result.success,
              attempts: result.attempts.length,
              finalSelector: result.finalSelector,
              message: result.message,
              aiSuggestion: result.aiSuggestion,
              // v11.8.0: Confidence gating fields
              confidence: result.confidence,
              healed: result.healed,
              healReason: result.healReason,
              zone: result.zone,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "dismiss_overlay",
    "Detect and dismiss modal overlays (cookie consent, age verification, newsletter popups). Constitutional Yellow zone.",
    {
      type: z.enum(["auto", "cookie", "age-verify", "newsletter", "custom"]).optional().default("auto").describe("Overlay type to detect"),
      customSelector: z.string().optional().describe("Custom CSS selector for overlay close button"),
    },
    async ({ type, customSelector }) => {
      const b = await getBrowser();
      const result = await b.dismissOverlay({ type, customSelector });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              dismissed: result.dismissed,
              overlaysFound: result.overlaysFound,
              overlaysDismissed: result.overlaysDismissed,
              details: result.details,
              suggestion: result.suggestion,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "fill",
    "Fill a form field with text. Use verbose=true for detailed debug info on failure.",
    {
      selector: z.string().describe("Input field to fill (name, placeholder, label, or selector)"),
      value: z.string().describe("Value to enter"),
      verbose: z.boolean().optional().describe("Return available inputs and AI suggestions on failure"),
    },
    async ({ selector, value, verbose }) => {
      // v14.2.1: Wrap with retry for transient errors
      return await withRetry(async () => {
        const b = await getBrowser();
        const result = await b.fill(selector, value, { verbose });
        const response: Record<string, unknown> = {
          success: result.success,
          message: result.message,
        };
        if (verbose && !result.success) {
          if (result.availableInputs) response.availableInputs = result.availableInputs;
          if (result.aiSuggestion) response.aiSuggestion = result.aiSuggestion;
          if (result.debugScreenshot) response.debugScreenshot = result.debugScreenshot;
        }
        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        };
      });
    }
  );

  server.tool(
    "scroll",
    "Scroll the page in a direction. Use when content might be below the fold or to navigate long pages.",
    {
      direction: z.enum(["down", "up", "top", "bottom"]).default("down").describe("Scroll direction: down (400px), up (400px), top (page start), bottom (page end)"),
      amount: z.number().optional().describe("Custom scroll amount in pixels (only for up/down)"),
    },
    async ({ direction, amount }) => {
      const b = await getBrowser();
      const page = await b.getPage();

      try {
        const scrollAmount = amount || 400;
        switch (direction) {
          case "top":
            await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
            break;
          case "bottom":
            await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
            break;
          case "up":
            await page.evaluate((amt) => window.scrollBy({ top: -amt, behavior: "smooth" }), scrollAmount);
            break;
          case "down":
          default:
            await page.evaluate((amt) => window.scrollBy({ top: amt, behavior: "smooth" }), scrollAmount);
            break;
        }
        // Wait for scroll animation
        await new Promise(r => setTimeout(r, 300));

        // Get new scroll position
        const scrollY = await page.evaluate(() => window.scrollY);
        const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
        const viewportHeight = await page.evaluate(() => window.innerHeight);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              direction,
              scrollPosition: scrollY,
              scrollHeight,
              viewportHeight,
              atTop: scrollY === 0,
              atBottom: scrollY + viewportHeight >= scrollHeight - 10,
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }, null, 2),
          }],
        };
      }
    }
  );

  // =========================================================================
  // Extraction Tools
  // =========================================================================

  server.tool(
    "screenshot",
    "Take a screenshot of the current page",
    {
      path: z.string().optional().describe("Optional path to save the screenshot"),
    },
    async ({ path }) => {
      // v14.2.1: Wrap with retry for transient errors
      return await withRetry(async () => {
        const b = await getBrowser();
        const file = await b.screenshot(path);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ screenshot: file }, null, 2),
            },
          ],
        };
      });
    }
  );

  server.tool(
    "extract",
    "Extract data from the page",
    {
      what: z.enum(["links", "headings", "forms", "images", "text"]).describe("What to extract"),
    },
    async ({ what }) => {
      // v14.2.1: Wrap with retry for transient errors
      return await withRetry(async () => {
        const b = await getBrowser();
        const result = await b.extract(what);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.data, null, 2),
            },
          ],
        };
      });
    }
  );

  // =========================================================================
  // Screen Capture Tools
  //
  // Same three tools as the remote server (src/mcp-tools/base/capture-tools.ts),
  // in this server's older registration form and sharing that module's
  // implementation — a tool that exists on only one server is half-shipped.
  // This server is single-session, so no browser token is threaded through.
  // =========================================================================

  server.tool(
    "capture_start",
    CAPTURE_START_DESCRIPTION,
    {
      url: z.string().optional().describe("URL to navigate to before capturing. Omit to capture the current page."),
      fps: z.number().optional().describe("Target frames per second (default: 10)"),
      duration: z.string().optional().describe("Auto-stop after this long: 5s, 2m, 1500ms. Omit for an open-ended capture stopped by capture_stop."),
      viewport: z.string().optional().describe("Viewport as WIDTHxHEIGHT (e.g. 1280x720) or a preset name (mobile, tablet, desktop, desktop-lg)"),
      region: z.string().optional().describe("Capture a fixed region as x,y,width,height (e.g. 0,0,800,600). Clamped to the viewport."),
      element: z.string().optional().describe("CSS selector to capture. Resolved to the element's bounding box once at start; the region does not follow the element if it moves."),
      padding: z.number().optional().describe("Padding in pixels around the element region (default: 0)"),
      format: z.string().optional().describe("Comma-separated output formats: gif,webp,mp4,webm (default: gif). mp4 needs a full ffmpeg; the bundled one does webm."),
      quality: z.number().optional().describe("JPEG quality for captured frames, 1-100 (default: 80)"),
      max_frames: z.number().optional().describe("Hard cap on retained frames (default: 3000)"),
      name: z.string().optional().describe("Capture name / slug"),
      out_dir: z.string().optional().describe("Output directory (default: a slug directory under the recordings dir)"),
    },
    async (args) => {
      try {
        const b = await getBrowser();
        const payload = await startCapture(b, args);
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }, null, 2),
          }],
        };
      }
    }
  );

  server.tool(
    "capture_stop",
    CAPTURE_STOP_DESCRIPTION,
    {},
    async () => {
      try {
        const { payload } = await stopCapture();
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error),
            }, null, 2),
          }],
        };
      }
    }
  );

  server.tool(
    "capture_status",
    CAPTURE_STATUS_DESCRIPTION,
    {},
    async () => {
      return {
        content: [{ type: "text", text: JSON.stringify(captureStatus(), null, 2) }],
      };
    }
  );

  // =========================================================================
  // Assertion Tools
  // =========================================================================

  server.tool(
    "assert",
    "Assert a condition using natural language",
    {
      assertion: z.string().describe("Natural language assertion like \"page contains 'Welcome'\" or \"title is 'Home'\""),
    },
    async ({ assertion }) => {
      const b = await getBrowser();
      const result = await b.assert(assertion);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              passed: result.passed,
              message: result.message,
              actual: result.actual,
              expected: result.expected,
            }, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Analysis Tools
  // =========================================================================

  server.tool(
    "analyze_page",
    "Analyze page structure for forms, buttons, links",
    {},
    async () => {
      const b = await getBrowser();
      const analysis = await b.analyzePage();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              title: analysis.title,
              forms: analysis.forms.length,
              buttons: analysis.buttons.length,
              links: analysis.links.length,
              hasLogin: analysis.hasLogin,
              hasSearch: analysis.hasSearch,
              hasNavigation: analysis.hasNavigation,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "generate_tests",
    "Generate test scenarios for a page",
    {
      url: z.string().url().optional().describe("URL to analyze (uses current page if not provided)"),
    },
    async ({ url }) => {
      const b = await getBrowser();
      const result = await b.generateTests(url);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              testsGenerated: result.tests.length,
              tests: result.tests.map(t => ({
                name: t.name,
                description: t.description,
                steps: t.steps.length,
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Session Tools
  // =========================================================================

  server.tool(
    "save_session",
    "Save browser session (cookies, storage) for later use",
    {
      name: z.string().describe("Name for the saved session"),
    },
    async ({ name }) => {
      const b = await getBrowser();
      await b.saveSession(name);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: true, sessionName: name }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "load_session",
    "Load a previously saved session",
    {
      name: z.string().describe("Name of the session to load"),
    },
    async ({ name }) => {
      const b = await getBrowser();
      const result = await b.loadSession(name);
      // v11.8.0: Return flat structure, not nested
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "list_sessions",
    "List all saved sessions with metadata (name, domain, cookies count, localStorage keys, created date, size)",
    {},
    async () => {
      const b = await getBrowser();
      const sessions = b.listSessionsDetailed();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ sessions }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "delete_session",
    "Delete a saved session by name",
    {
      name: z.string().describe("Name of the session to delete"),
    },
    async ({ name }) => {
      const b = await getBrowser();
      const deleted = b.deleteSession(name);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: deleted, name, message: deleted ? `Session '${name}' deleted` : `Session '${name}' not found` }),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Self-Healing Tools
  // =========================================================================

  server.tool(
    "heal_stats",
    "Get self-healing selector cache statistics",
    {},
    async () => {
      // v14.2.1: Wrap with retry for transient errors
      return await withRetry(async () => {
        const b = await getBrowser();
        const stats = b.getSelectorCacheStats();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      });
    }
  );

  // =========================================================================
  // Visual Testing Tools (v7.0.0+)
  // =========================================================================

  server.tool(
    "visual_baseline",
    "Capture a visual baseline for a URL",
    {
      url: z.string().url().describe("URL to capture baseline for"),
      name: z.string().describe("Name for the baseline"),
    },
    async ({ url, name }) => {
      const result = await captureVisualBaseline(url, name, {});
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              name: result.name,
              url: result.url,
              timestamp: result.timestamp,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "visual_regression",
    "Run AI visual regression test against a baseline",
    {
      url: z.string().url().describe("URL to test"),
      baselineName: z.string().describe("Name of baseline to compare against"),
    },
    async ({ url, baselineName }) => {
      const result = await runVisualRegression(url, baselineName);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              passed: result.passed,
              similarityScore: result.analysis?.similarityScore,
              summary: result.analysis?.summary,
              changes: result.analysis?.changes?.length || 0,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "cross_browser_test",
    "Test page rendering across multiple browsers",
    {
      url: z.string().url().describe("URL to test"),
      browsers: z.array(z.enum(["chromium", "firefox", "webkit"])).optional().describe("Browsers to test"),
    },
    async ({ url, browsers }) => {
      const result = await runCrossBrowserTest(url, { browsers });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              url: result.url,
              overallStatus: result.overallStatus,
              summary: result.summary,
              // The evidence used to be collapsed to two integers —
              // screenshotCount / comparisonCount — while `result` carried every
              // screenshot path, every pairwise similarity score, and
              // problematicBrowsers. So the caller received an absolute verdict
              // ("renders consistently across all tested browsers") with every
              // number that could falsify it removed, and no way to open the
              // screenshots it said it had taken.
              //
              // It also explains the contradiction with cross_browser_diff: this
              // tool compares ABOVE-THE-FOLD PIXELS at a forced 1920x1080, while
              // the diff compares FULL-PAGE TEXT at 1280x720. Two different
              // measurements reported in language that claims to settle the same
              // question. `scope` now says which one you are reading.
              // (2026-07-29)
              scope: "above-the-fold pixels at 1920x1080; page TEXT is not compared — use cross_browser_diff for content",
              screenshots: result.screenshots.map((s) => ({
                browser: s.browser,
                path: (s as unknown as { screenshotPath?: string }).screenshotPath,
                viewport: (s as unknown as { viewport?: unknown }).viewport,
              })),
              comparisons: result.comparisons.map((c) => ({
                browserA: c.browserA,
                browserB: c.browserB,
                status: c.analysis?.overallStatus,
                similarity: c.analysis?.similarityScore,
                changes: (c.analysis?.changes ?? []).map((ch) => ({
                  severity: ch.severity,
                  description: ch.description,
                })),
              })),
              ...(result.problematicBrowsers?.length ? { problematicBrowsers: result.problematicBrowsers } : {}),
              screenshotCount: result.screenshots.length,
              comparisonCount: result.comparisons.length,
              ...(result.missingBrowsers?.length ? { missingBrowsers: result.missingBrowsers } : {}),
              ...(result.availableBrowsers ? { availableBrowsers: result.availableBrowsers } : {}),
              ...(result.suggestion ? { suggestion: result.suggestion } : {}),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "cross_browser_diff",
    "Quick diff of page metrics across browsers",
    {
      url: z.string().url().describe("URL to compare"),
      browsers: z.array(z.enum(["chromium", "firefox", "webkit"])).optional().describe("Browsers to compare"),
    },
    async ({ url, browsers }) => {
      const result = await crossBrowserDiff(url, browsers);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              url: result.url,
              browsers: result.browsers,
              differences: result.differences,
              metrics: result.metrics,
              ...(result.missingBrowsers?.length ? { missingBrowsers: result.missingBrowsers } : {}),
              ...(result.availableBrowsers ? { availableBrowsers: result.availableBrowsers } : {}),
              ...(result.suggestion ? { suggestion: result.suggestion } : {}),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "responsive_test",
    "Test page across different viewport sizes",
    {
      url: z.string().url().describe("URL to test"),
      viewports: z.array(z.string()).optional().describe("Viewport presets (mobile, tablet, desktop, etc.)"),
    },
    async ({ url, viewports }) => {
      const result = await runResponsiveTest(url, { viewports });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              url: result.url,
              overallStatus: result.overallStatus,
              summary: result.summary,
              // `result.issues` and `problematicViewports` were both computed and
              // then dropped here, so the caller got "13 issues: 7 overflow, 2
              // unreadable text..." with no way to learn WHICH viewport or WHICH
              // element — a count they could not act on. Same computed-then-
              // discarded shape as the cross-browser handler above. (2026-07-29)
              issues: (result.issues ?? []).map((i) => ({
                type: i.type,
                severity: i.severity,
                description: i.description,
                affectedViewports: i.affectedViewports,
                ...(i.breakpointRange ? { breakpointRange: i.breakpointRange } : {}),
              })),
              ...(result.problematicViewports?.length ? { problematicViewports: result.problematicViewports } : {}),
              viewports: result.screenshots.map((s) => ({
                name: (s as unknown as { viewport?: string; name?: string }).viewport
                  ?? (s as unknown as { name?: string }).name,
                path: (s as unknown as { screenshotPath?: string }).screenshotPath,
              })),
              viewportsCount: result.screenshots.length,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "ab_comparison",
    "Compare two URLs visually (staging vs production)",
    {
      urlA: z.string().url().describe("First URL (e.g., staging)"),
      urlB: z.string().url().describe("Second URL (e.g., production)"),
      labelA: z.string().optional().describe("Label for first URL"),
      labelB: z.string().optional().describe("Label for second URL"),
    },
    async ({ urlA, urlB, labelA, labelB }) => {
      const labels = labelA && labelB ? { a: labelA, b: labelB } : undefined;
      const result = await runABComparison(urlA, urlB, { labels });
      return {
        content: [
          {
            type: "text",
            // v11.11.0: Include full differences for structured diff (stress test fix)
            text: JSON.stringify({
              overallStatus: result.overallStatus,
              similarityScore: result.analysis?.similarityScore,
              summary: result.summary,
              // v11.11.0: Return detailed differences instead of just count
              differences: result.differences.slice(0, 10).map(d => ({
                type: d.type,
                severity: d.severity,
                description: d.description,
                affectedSide: d.affectedSide,
              })),
              differenceCount: result.differences.length,
              // v11.11.0: Include page structure comparison summary
              structureSummary: {
                a: {
                  headings: (result.screenshots.a as any).structure?.headings?.length || 0,
                  links: (result.screenshots.a as any).structure?.links?.length || 0,
                  forms: (result.screenshots.a as any).structure?.forms || 0,
                  buttons: (result.screenshots.a as any).structure?.buttons?.length || 0,
                },
                b: {
                  headings: (result.screenshots.b as any).structure?.headings?.length || 0,
                  links: (result.screenshots.b as any).structure?.links?.length || 0,
                  forms: (result.screenshots.b as any).structure?.forms || 0,
                  buttons: (result.screenshots.b as any).structure?.buttons?.length || 0,
                },
              },
              duration: result.duration,
            }, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Testing Tools (v6.0.0+)
  // =========================================================================

  server.tool(
    "nl_test_file",
    "Run natural language test suite from a file. Returns step-level results with enriched error info, partial matches, and suggestions.",
    {
      filepath: z.string().describe("Path to the test file"),
      dryRun: z.boolean().optional().describe("Parse and display steps without executing"),
      fuzzyMatch: z.boolean().optional().describe("Use case-insensitive fuzzy matching for assertions"),
    },
    async ({ filepath, dryRun, fuzzyMatch }) => {
      const fs = await import("fs");
      if (!fs.existsSync(filepath)) {
        return {isError: true,  content: [{ type: "text", text: JSON.stringify({ error: `Test file not found: ${filepath}` }) }] };
      }
      const fileContent = fs.readFileSync(filepath, "utf-8");
      const suiteName = filepath.split("/").pop()?.replace(/\.[^.]+$/, "") || "Test Suite";
      const suite = parseNLTestSuite(fileContent, suiteName);

      if (dryRun) {
        const dryResult = dryRunNLTestSuite(suite);
        return { content: [{ type: "text", text: JSON.stringify(dryResult, null, 2) }] };
      }

      const result = await runNLTestSuite(suite, { fuzzyMatch: fuzzyMatch || false });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name: result.name,
              total: result.summary.total,
              passed: result.summary.passed,
              failed: result.summary.failed,
              passRate: `${result.summary.passRate.toFixed(1)}%`,
              // v11.6.0: Step-level statistics for better granularity
              totalSteps: result.summary.totalSteps,
              passedSteps: result.summary.passedSteps,
              failedSteps: result.summary.failedSteps,
              stepPassRate: result.summary.stepPassRate ? `${result.summary.stepPassRate.toFixed(1)}%` : undefined,
              duration: result.duration,
              recommendations: result.recommendations,
              testResults: result.testResults.map(t => ({
                name: t.name,
                passed: t.passed,
                duration: t.duration,
                error: t.error,
                steps: t.stepResults.map(s => ({
                  instruction: s.instruction,
                  parsed: s.parsed,
                  passed: s.passed,
                  duration: s.duration,
                  error: s.error,
                  actualValue: s.actualValue,
                })),
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "nl_test_inline",
    "Run natural language tests from inline content. Returns step-level results with enriched error info, partial matches, and suggestions.",
    {
      content: z.string().describe("Test content with instructions like 'go to https://...' and 'click login'"),
      name: z.string().optional().describe("Name for the test suite"),
      dryRun: z.boolean().optional().describe("Parse and display steps without executing"),
      fuzzyMatch: z.boolean().optional().describe("Use case-insensitive fuzzy matching for assertions"),
    },
    async ({ content, name, dryRun, fuzzyMatch }) => {
      const suite = parseNLTestSuite(content, name || "Inline Test");

      if (dryRun) {
        const dryResult = dryRunNLTestSuite(suite);
        return { content: [{ type: "text", text: JSON.stringify(dryResult, null, 2) }] };
      }

      const result = await runNLTestSuite(suite, { fuzzyMatch: fuzzyMatch || false });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name: result.name,
              total: result.summary.total,
              passed: result.summary.passed,
              failed: result.summary.failed,
              passRate: `${result.summary.passRate.toFixed(1)}%`,
              // v11.6.0: Step-level statistics for better granularity
              totalSteps: result.summary.totalSteps,
              passedSteps: result.summary.passedSteps,
              failedSteps: result.summary.failedSteps,
              stepPassRate: result.summary.stepPassRate ? `${result.summary.stepPassRate.toFixed(1)}%` : undefined,
              duration: result.duration,
              recommendations: result.recommendations,
              testResults: result.testResults.map(t => ({
                name: t.name,
                passed: t.passed,
                duration: t.duration,
                error: t.error,
                steps: t.stepResults.map(s => ({
                  instruction: s.instruction,
                  parsed: s.parsed,
                  passed: s.passed,
                  duration: s.duration,
                  error: s.error,
                  actualValue: s.actualValue,
                })),
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "repair_test",
    "AI-powered test repair for broken tests",
    {
      testName: z.string().describe("Name for the test"),
      steps: z.array(z.string()).describe("Test step instructions"),
      autoApply: z.boolean().optional().describe("Automatically apply repairs"),
    },
    async ({ testName, steps, autoApply }) => {
      const testCase: NLTestCase = {
        name: testName,
        steps: steps.map(instruction => ({
          instruction,
          action: "unknown" as NLTestStep["action"],
        })),
      };
      const result = await repairTest(testCase, { autoApply: autoApply || false });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              originalTest: result.originalTest.name,
              failedSteps: result.failedSteps,
              repairedSteps: result.repairedSteps,
              repairedTestPasses: result.repairedTestPasses,
              repairs: result.failureAnalyses.map(a => ({
                step: a.step.instruction,
                error: a.error,
                suggestion: a.suggestions[0]?.suggestedInstruction || "No suggestion",
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "detect_flaky_tests",
    "Detect flaky/unreliable tests by running multiple times",
    {
      testContent: z.string().describe("Test content to analyze"),
      runs: z.number().optional().default(5).describe("Number of times to run each test"),
      threshold: z.number().optional().default(20).describe("Flakiness threshold percentage"),
    },
    async ({ testContent, runs, threshold }) => {
      const suite = parseNLTestSuite(testContent, "Flaky Test Analysis");
      const result = await detectFlakyTests(suite, { runs, flakinessThreshold: threshold });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              suiteName: result.suiteName,
              totalTests: result.summary.totalTests,
              stablePass: result.summary.stablePassTests,
              stableFail: result.summary.stableFailTests,
              flakyTests: result.summary.flakyTests,
              overallFlakiness: `${result.summary.overallFlakinessScore.toFixed(1)}%`,
              analyses: result.testAnalyses.map(a => ({
                test: a.testName,
                classification: a.classification,
                passRate: `${((a.passCount / a.totalRuns) * 100).toFixed(0)}%`,
                flakiness: `${a.flakinessScore}%`,
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "coverage_map",
    "Generate test coverage map for a site",
    {
      baseUrl: z.string().url().describe("Base URL to analyze"),
      testFiles: z.array(z.string()).describe("Array of test file paths"),
      maxPages: z.number().optional().default(100).describe("Maximum pages to crawl"),
    },
    async ({ baseUrl, testFiles, maxPages }) => {
      const result = await generateCoverageMap(baseUrl, testFiles, { maxPages });
      // Mirrors the guard in mcp-tools/base/testing-tools.ts. This file is the
      // local stdio server's independent registration of the same tool, so a fix
      // applied to only one of the two surfaces leaves the bug live on the other.
      if (result.missingTestFiles.length === testFiles.length && testFiles.length > 0) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: "no_readable_test_files",
              message: `None of the ${testFiles.length} test file path(s) could be read, so there is no coverage to report.`,
              missingTestFiles: result.missingTestFiles,
            }, null, 2),
          }],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              totalPages: result.sitePages.length,
              testedPages: result.testedPages.length,
              untestedPages: result.analysis.untestedPages,
              overallCoverage: `${result.analysis.coveragePercent.toFixed(1)}%`,
              ...(result.missingTestFiles.length > 0 ? {
                missingTestFiles: result.missingTestFiles,
                warning: `${result.missingTestFiles.length} of ${testFiles.length} test files could not be read and contributed no coverage.`,
              } : {}),
              gaps: result.gaps.slice(0, 10).map(g => ({
                url: g.page.url,
                priority: g.priority,
                reason: g.reason,
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Analysis Tools (v4.0.0+)
  // =========================================================================

  server.tool(
    "hunt_bugs",
    "Autonomous bug hunting - crawl and find issues. Returns bugs with severity, selector, and actionable recommendation for each issue found.",
    {
      url: z.string().url().describe("Starting URL to hunt from"),
      maxPages: z.number().optional().default(10).describe("Maximum pages to visit"),
      limit: z.number().optional().default(25).describe("How many bugs to return, worst first. The full count and a per-page/per-type breakdown are always reported, so a truncated list never hides the shape of what was found."),
      offset: z.number().optional().default(0).describe("Skip this many bugs before returning, for paging through a large result."),
      timeout: z.number().optional().default(60000).describe("Timeout in milliseconds"),
    },
    async ({ url, maxPages, timeout, limit, offset }) => {
      const b = await getBrowser();
      const result = await huntBugs(b, url, { maxPages, timeout });
      // Same response as the HTTP tool. This copy returned the first ten bugs
      // in crawl order, with no severity sort, paging or breakdowns.
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(huntBugsResponse(result, { limit, offset }), null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "chaos_test",
    "Inject failures and test resilience",
    {
      url: z.string().url().describe("URL to test"),
      networkLatency: z.number().optional().describe("Simulate network latency (ms)"),
      offline: z.boolean().optional().describe("Simulate offline mode"),
      blockUrls: z.array(z.string()).optional().describe("URL patterns to block"),
    },
    async ({ url, networkLatency, offline, blockUrls }) => {
      const b = await getBrowser();
      try {
        const result = await runChaosTest(b, url, { networkLatency, offline, blockUrls });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                passed: result.passed,
                errors: result.errors,
                duration: result.duration,
                // v16.11.0: Include impact analysis in response
                impact: result.impact,
              }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        // v16.11.0: Graceful error handling for chaos test crashes
        // Attempt browser recovery to prevent server crash
        try {
          await b.recoverBrowser();
        } catch {
          // Browser recovery failed, but continue with error response
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                passed: false,
                errors: [`Chaos test crashed: ${error.message}`],
                duration: 0,
                impact: {
                  loadTimeMs: 0,
                  blockedResources: [],
                  failedResources: [],
                  delayedResources: [],
                  pageCompleted: false,
                  pageInteractive: false,
                  consoleErrors: 0,
                  degradationSummary: ["Test crashed - browser recovered"],
                },
                recovered: true,
              }, null, 2),
            },
          ],
        };
      }
    }
  );


  server.tool(
    "find_element_by_intent",
    FIND_ELEMENT_BY_INTENT_DESCRIPTION,
    {
      intent: z.string().describe("Natural language description like 'sign up button in the header', 'email field', 'the cheapest product', 'login form', 'footer navigation'"),
      verbose: z.boolean().optional().describe("On a miss, list the first visible links/buttons/fields with unique selectors so you can rephrase; on a hit, unchanged"),
    },
    async ({ intent, verbose }) => {
      const b = await getBrowser();
      const result = await findElementByIntent(b, intent, { verbose });
      if (result && result.confidence > 0) {
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }
      // No match or zero-confidence verbose result
      return {
        content: [{ type: "text", text: JSON.stringify(result || { found: false, message: "No matching element found" }, null, 2) }],
      };
    }
  );

  // =========================================================================
  // Cognitive Simulation Tools (v8.3.0)
  // =========================================================================

  server.tool(
    "cognitive_journey_init",
    "Initialize a cognitive user journey simulation. Returns the persona's cognitive profile, initial state, and abandonment thresholds. The actual simulation is driven by the LLM using browser tools (navigate, click, fill, screenshot) while tracking cognitive state.",
    {
      persona: z.string().describe("Persona name (e.g., 'first-timer', 'elderly-user', 'power-user') or custom description"),
      goal: z.string().describe("What the simulated user is trying to accomplish"),
      startUrl: z.string().url().describe("Starting URL for the journey"),
      customTraits: z.object({
        // Core 7 traits
        patience: z.number().min(0).max(1).optional().describe("How long before giving up (0=impatient, 1=very patient)"),
        riskTolerance: z.number().min(0).max(1).optional().describe("Willingness to click unfamiliar elements (0=cautious, 1=adventurous)"),
        comprehension: z.number().min(0).max(1).optional().describe("UI/UX understanding speed (0=confused easily, 1=grasps quickly)"),
        persistence: z.number().min(0).max(1).optional().describe("Retry same approach vs try different (0=explores, 1=persists)"),
        curiosity: z.number().min(0).max(1).optional().describe("Tendency to explore vs stay focused (0=focused, 1=exploratory)"),
        workingMemory: z.number().min(0).max(1).optional().describe("Remembers what was tried (0=forgets, 1=remembers all)"),
        readingTendency: z.number().min(0).max(1).optional().describe("Reads content vs scans for CTAs (0=scans, 1=reads everything)"),
        // v16.11.0: Extended traits (18 more = 25 total)
        resilience: z.number().min(0).max(1).optional().describe("Emotional recovery after setbacks (0=gives up, 1=bounces back)"),
        selfEfficacy: z.number().min(0).max(1).optional().describe("Belief in ability to complete task (0=doubts self, 1=confident)"),
        satisficing: z.number().min(0).max(1).optional().describe("Accepts 'good enough' vs seeks optimal (0=optimizes, 1=satisfices)"),
        trustCalibration: z.number().min(0).max(1).optional().describe("Trust in website/CTAs (0=skeptical, 1=trusting)"),
        interruptRecovery: z.number().min(0).max(1).optional().describe("Recovers from distractions (0=loses place, 1=resumes smoothly)"),
        informationForaging: z.number().min(0).max(1).optional().describe("Efficiency finding info (0=scattered, 1=systematic)"),
        changeBlindness: z.number().min(0).max(1).optional().describe("Notices UI changes (0=misses changes, 1=notices all)"),
        anchoringBias: z.number().min(0).max(1).optional().describe("Influenced by first info seen (0=ignores, 1=anchors heavily)"),
        timeHorizon: z.number().min(0).max(1).optional().describe("Short vs long-term focus (0=immediate, 1=future-oriented)"),
        attributionStyle: z.number().min(0).max(1).optional().describe("Blames self vs external for failures (0=external, 1=internal)"),
        metacognitivePlanning: z.number().min(0).max(1).optional().describe("Plans approach before acting (0=impulsive, 1=strategic)"),
        proceduralFluency: z.number().min(0).max(1).optional().describe("Follows multi-step processes (0=struggles, 1=follows easily)"),
        transferLearning: z.number().min(0).max(1).optional().describe("Applies past learning to new contexts (0=compartmentalized, 1=transfers)"),
        authoritySensitivity: z.number().min(0).max(1).optional().describe("Responds to authority cues (0=ignores, 1=defers to authority)"),
        emotionalContagion: z.number().min(0).max(1).optional().describe("Affected by page emotional tone (0=immune, 1=absorbs mood)"),
        fearOfMissingOut: z.number().min(0).max(1).optional().describe("Responds to scarcity/urgency (0=immune, 1=strongly affected)"),
        socialProofSensitivity: z.number().min(0).max(1).optional().describe("Influenced by reviews/testimonials (0=ignores, 1=strongly influenced)"),
        // POLARITY CORRECTED 2026-08-01. This read "0=flexible, 1=rigid",
        // which is backwards from every other authority on the field: the
        // questionnaire runs 0 "Rigid Mental Models" to 1 "Extremely Flexible",
        // the glossary's high end is "Highly adaptive", and its typicalScores
        // put power-user high and elderly-user low. A caller trusting this
        // description would send 1.0 meaning rigid and get the most flexible
        // persona the scale can express, with nothing in the output looking
        // wrong -- exactly the failure the field's rename note warns about.
        mentalModelFlexibility: z.number().min(0).max(1).optional().describe("Mental-model adaptability. 0 = rigid, cannot adapt when conventions change; 1 = instantly adapts. Named 'Rigidity' for backwards compatibility; the SCALE runs toward flexibility."),
      }).optional().describe("Override specific cognitive traits (25 available)"),
    },
    async ({ persona: personaName, goal, startUrl, customTraits }) => {
      // Get or create persona
      // v16.14.1: Use getAnyPersona to find personas in ALL registries
      const existingPersona = getAnyPersona(personaName);
      let personaObj: Persona | AccessibilityPersona;

      // v17.0.0: Check for agent personas - cognitive journeys don't support them yet
      if (existingPersona && isAgentPersonaObject(existingPersona)) {
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: "Agent personas not supported for cognitive journeys",
              message: `"${personaName}" is an AI agent persona. Cognitive journeys simulate human behavior and require human personas. Use a human persona instead, or use agent-ready-audit for AI agent testing.`,
              suggestedPersonas: ["first-timer", "power-user", "mobile-user"],
            }, null, 2),
          }],
        };
      }

      if (!existingPersona) {
        // Create from description
        personaObj = createCognitivePersona(personaName, personaName, customTraits || {});
      } else if (customTraits) {
        // v16.11.0: full default trait set (was only 7, causing trait dropout).
        // Said 25 until 2026-08-01; the model has 26 and has for some time.
        const defaultTraits: CognitiveTraits = {
          // Core 7 traits
          patience: 0.5,
          riskTolerance: 0.5,
          comprehension: 0.5,
          persistence: 0.5,
          curiosity: 0.5,
          workingMemory: 0.5,
          readingTendency: 0.5,
          // Tier 1: Core (5 more)
          resilience: 0.5,
          selfEfficacy: 0.5,
          satisficing: 0.5,
          trustCalibration: 0.5,
          interruptRecovery: 0.5,
          // Tier 2-6: Extended (13 more)
          informationForaging: 0.5,
          changeBlindness: 0.3,
          anchoringBias: 0.5,
          timeHorizon: 0.5,
          attributionStyle: 0.5,
          metacognitivePlanning: 0.5,
          proceduralFluency: 0.5,
          transferLearning: 0.5,
          authoritySensitivity: 0.5,
          emotionalContagion: 0.5,
          fearOfMissingOut: 0.5,
          socialProofSensitivity: 0.5,
          mentalModelFlexibility: 0.5,
        };
        personaObj = {
          ...existingPersona,
          cognitiveTraits: {
            ...defaultTraits,
            ...(existingPersona.cognitiveTraits || {}),
            ...customTraits,
          },
        };
      } else {
        personaObj = existingPersona;
      }

      // Get cognitive profile
      const profile = getCognitiveProfile(personaObj);

      // Initial cognitive state
      const initialState: CognitiveState = {
        patienceRemaining: 1.0,
        confusionLevel: 0.0,
        frustrationLevel: 0.0,
        goalProgress: 0.0,
        confidenceLevel: 0.5,
        currentMood: "neutral",
        memory: {
          pagesVisited: [startUrl],
          actionsAttempted: [],
          errorsEncountered: [],
          backtrackCount: 0,
        },
        timeElapsed: 0,
        stepCount: 0,
      };

      // Abandonment thresholds (adjusted by persona traits)
      const traits = profile.traits;
      const thresholds: AbandonmentThresholds = {
        patienceMin: 0.1,
        confusionMax: traits.comprehension < 0.4 ? 0.6 : 0.8,  // Lower comprehension = lower tolerance
        frustrationMax: traits.patience < 0.3 ? 0.7 : 0.85,    // Impatient = lower tolerance
        maxStepsWithoutProgress: traits.persistence > 0.7 ? 15 : 10,
        loopDetectionThreshold: 3,
        timeLimit: traits.patience > 0.7 ? 180 : (traits.patience < 0.3 ? 60 : 120),
      };

      // Navigate to start URL
      const b = await getBrowser();
      await b.navigate(startUrl);

      // v16.12.0: Include persona values for influence pattern analysis
      const personaValues = resolveValuesForPersona(personaObj.name);
      const influencePatterns = personaValues
        ? rankInfluencePatternsForProfile(personaValues).slice(0, 5) // Top 5 most effective patterns
        : undefined;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              persona: {
                name: personaObj.name,
                description: personaObj.description,
                demographics: personaObj.demographics,
                values: personaValues ? {
                  schwartz: {
                    selfDirection: personaValues.selfDirection,
                    stimulation: personaValues.stimulation,
                    hedonism: personaValues.hedonism,
                    achievement: personaValues.achievement,
                    power: personaValues.power,
                    security: personaValues.security,
                    conformity: personaValues.conformity,
                    tradition: personaValues.tradition,
                    benevolence: personaValues.benevolence,
                    universalism: personaValues.universalism,
                  },
                  higherOrder: {
                    openness: personaValues.openness,
                    selfEnhancement: personaValues.selfEnhancement,
                    conservation: personaValues.conservation,
                    selfTranscendence: personaValues.selfTranscendence,
                  },
                  sdt: {
                    autonomyNeed: personaValues.autonomyNeed,
                    competenceNeed: personaValues.competenceNeed,
                    relatednessNeed: personaValues.relatednessNeed,
                  },
                  maslowLevel: personaValues.maslowLevel,
                } : undefined,
                influenceSusceptibility: influencePatterns?.map(ip => ({
                  pattern: ip.pattern.name,
                  susceptibility: ip.susceptibility,
                })),
              },
              cognitiveProfile: profile,
              initialState,
              abandonmentThresholds: thresholds,
              goal,
              startUrl,
              instructions: `
COGNITIVE JOURNEY SIMULATION INSTRUCTIONS:

You are now simulating a "${personaObj.name}" user with these cognitive traits:
- Patience: ${profile.traits.patience.toFixed(2)} ${profile.traits.patience < 0.3 ? "(impatient - will give up quickly)" : profile.traits.patience > 0.7 ? "(patient - will persist)" : "(moderate)"}
- Risk Tolerance: ${profile.traits.riskTolerance.toFixed(2)} ${profile.traits.riskTolerance < 0.3 ? "(cautious - hesitates)" : profile.traits.riskTolerance > 0.7 ? "(bold - clicks freely)" : "(moderate)"}
- Comprehension: ${profile.traits.comprehension.toFixed(2)} ${profile.traits.comprehension < 0.3 ? "(struggles with UI)" : profile.traits.comprehension > 0.7 ? "(expert at UI patterns)" : "(moderate)"}
- Reading Tendency: ${profile.traits.readingTendency.toFixed(2)} ${profile.traits.readingTendency < 0.3 ? "(scans only)" : profile.traits.readingTendency > 0.7 ? "(reads everything)" : "(selective reader)"}

Attention Pattern: ${profile.attentionPattern}
Decision Style: ${profile.decisionStyle}

GOAL: "${goal}"

SIMULATION LOOP:
1. PERCEIVE - Use screenshot/snapshot to see the page. Filter by attention pattern.
2. COMPREHEND - Interpret elements as this persona would (lower comprehension = more confusion)
3. DECIDE - Choose action based on traits. Generate inner monologue.
4. EXECUTE - Use click/fill/navigate tools.
5. EVALUATE - Update cognitive state after each action:
   - patienceRemaining -= 0.02 + (frustrationLevel × 0.05)
   - confusionLevel changes based on UI clarity
   - frustrationLevel increases on failures
6. CHECK ABANDONMENT - If thresholds exceeded, end journey with appropriate message.
7. LOOP - Return to PERCEIVE until goal achieved or abandoned.

ABANDONMENT TRIGGERS:
- Patience < ${thresholds.patienceMin}: "This is taking too long. I give up."
- Confusion > ${thresholds.confusionMax} for 30s: "I have no idea what to do."
- Frustration > ${thresholds.frustrationMax}: "This is so frustrating!"
- No progress after ${thresholds.maxStepsWithoutProgress} steps: "I'm not getting anywhere."
- Same page ${thresholds.loopDetectionThreshold}x: "I keep ending up here."
- Time > ${thresholds.timeLimit}s: "I've spent too long on this."

INNER MONOLOGUE EXAMPLES (${personaObj.name}):
${profile.traits.patience < 0.3 ? '- "Come ON. Why is this taking so long?"' : '- "Let me take my time to figure this out..."'}
${profile.traits.riskTolerance < 0.3 ? '- "I don\'t know what this button does. What if I click the wrong thing?"' : '- "This looks relevant, let me click it."'}
${profile.traits.comprehension < 0.4 ? '- "What does this mean? I don\'t understand these icons."' : '- "Ah, I see - that\'s the settings menu."'}

Begin the simulation now. Narrate your thoughts as this persona.
`,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "cognitive_journey_update_state",
    "Update the cognitive state during a journey simulation. Call this after each action to track mental state.",
    {
      currentState: z.object({
        patienceRemaining: z.number().describe("Remaining patience (0-1, depletes over time)"),
        confusionLevel: z.number().describe("Current confusion (0-1, high triggers abandonment)"),
        frustrationLevel: z.number().describe("Current frustration (0-1, high triggers abandonment)"),
        goalProgress: z.number().describe("Progress toward goal (0-1)"),
        confidenceLevel: z.number().describe("Self-confidence in completing task (0-1)"),
        currentMood: z.enum(["neutral", "hopeful", "confused", "frustrated", "defeated", "relieved"]).describe("Current emotional state"),
        stepCount: z.number().describe("Number of actions taken"),
        timeElapsed: z.number().describe("Seconds elapsed since journey start"),
      }).describe("Current cognitive state"),
      actionResult: z.object({
        success: z.boolean().describe("Whether the last action succeeded"),
        wasConfusing: z.boolean().optional().describe("Whether the UI was confusing"),
        progressMade: z.boolean().optional().describe("Whether progress was made toward goal"),
        wentBack: z.boolean().optional().describe("Whether user went back/undid action"),
      }).describe("Result of the last action"),
      personaTraits: z.object({
        patience: z.number().describe("Base patience trait (0-1)"),
        riskTolerance: z.number().describe("Willingness to try new things (0-1)"),
        comprehension: z.number().describe("UI understanding ability (0-1)"),
        persistence: z.number().describe("Tendency to retry same approach (0-1)"),
      }).describe("Persona traits affecting state changes"),
    },
    async ({ currentState, actionResult, personaTraits }) => {
      // Calculate new state based on action result
      let newPatienceRemaining = currentState.patienceRemaining - 0.02;
      let newConfusionLevel = currentState.confusionLevel;
      let newFrustrationLevel = currentState.frustrationLevel;
      let newConfidenceLevel = currentState.confidenceLevel;
      let newMood = currentState.currentMood;

      // Apply frustration decay on patience
      newPatienceRemaining -= currentState.frustrationLevel * 0.05;

      if (actionResult.success) {
        // Success reduces confusion and frustration
        newConfusionLevel = Math.max(0, newConfusionLevel - 0.1);
        newFrustrationLevel = Math.max(0, newFrustrationLevel - 0.05);

        if (actionResult.progressMade) {
          newConfidenceLevel = Math.min(1, newConfidenceLevel + 0.1);
          if (newMood === "confused" || newMood === "frustrated") {
            newMood = "hopeful";
          }
        }
      } else {
        // Failure increases frustration
        newFrustrationLevel = Math.min(1, newFrustrationLevel + 0.2);

        if (newFrustrationLevel > 0.7) {
          newMood = "frustrated";
        }
        if (newFrustrationLevel > 0.8 && personaTraits.persistence < 0.5) {
          newMood = "defeated";
        }
      }

      if (actionResult.wasConfusing) {
        // Confusion builds based on comprehension
        newConfusionLevel = Math.min(1, newConfusionLevel + (1 - personaTraits.comprehension) * 0.15);

        if (newConfusionLevel > 0.5 && newMood !== "frustrated") {
          newMood = "confused";
        }
      }

      if (actionResult.wentBack) {
        newConfidenceLevel = Math.max(0, newConfidenceLevel - 0.15);
      }

      const newState: Partial<CognitiveState> = {
        patienceRemaining: Math.max(0, newPatienceRemaining),
        confusionLevel: newConfusionLevel,
        frustrationLevel: newFrustrationLevel,
        confidenceLevel: newConfidenceLevel,
        currentMood: newMood as CognitiveState["currentMood"],
        stepCount: currentState.stepCount + 1,
        timeElapsed: currentState.timeElapsed + 2, // Estimate 2s per step
      };

      // Check abandonment conditions
      let shouldAbandon = false;
      let abandonmentReason: string | undefined;
      let abandonmentMessage: string | undefined;

      if (newState.patienceRemaining! < 0.1) {
        shouldAbandon = true;
        abandonmentReason = "patience";
        abandonmentMessage = "This is taking too long. I give up.";
      } else if (newState.frustrationLevel! > 0.85) {
        shouldAbandon = true;
        abandonmentReason = "frustration";
        abandonmentMessage = "This is so frustrating! I'm done.";
      } else if (newState.confusionLevel! > 0.8 && currentState.confusionLevel > 0.8) {
        shouldAbandon = true;
        abandonmentReason = "confusion";
        abandonmentMessage = "I have no idea what I'm supposed to do here.";
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              newState,
              shouldAbandon,
              abandonmentReason,
              abandonmentMessage,
              stateChange: {
                patienceDelta: newState.patienceRemaining! - currentState.patienceRemaining,
                confusionDelta: newState.confusionLevel! - currentState.confusionLevel,
                frustrationDelta: newState.frustrationLevel! - currentState.frustrationLevel,
              },
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "list_cognitive_personas",
    "List all available personas with their cognitive traits (includes accessibility and emotional personas)",
    {},
    async () => {
      // v16.11.0: Include all persona types - BUILTIN + ACCESSIBILITY + EMOTIONAL
      const builtinNames = listPersonas();
      const accessibilityNames = listAccessibilityPersonas();

      // Built-in personas (power-user, first-timer, etc.)
      const builtinPersonas = builtinNames.map(name => {
        const p = getPersona(name);
        if (!p) return null;
        const profile = getCognitiveProfile(p);
        // v16.12.0: Include Schwartz values for each persona
        const values = resolveValuesForPersona(p.name);
        return {
          name: p.name,
          description: p.description,
          category: "builtin",
          demographics: p.demographics,
          cognitiveTraits: profile.traits,
          attentionPattern: profile.attentionPattern,
          decisionStyle: profile.decisionStyle,
          values: values ? {
            schwartz: {
              selfDirection: values.selfDirection,
              stimulation: values.stimulation,
              hedonism: values.hedonism,
              achievement: values.achievement,
              power: values.power,
              security: values.security,
              conformity: values.conformity,
              tradition: values.tradition,
              benevolence: values.benevolence,
              universalism: values.universalism,
            },
            higherOrder: {
              openness: values.openness,
              selfEnhancement: values.selfEnhancement,
              conservation: values.conservation,
              selfTranscendence: values.selfTranscendence,
            },
            sdt: {
              autonomyNeed: values.autonomyNeed,
              competenceNeed: values.competenceNeed,
              relatednessNeed: values.relatednessNeed,
            },
            maslowLevel: values.maslowLevel,
          } : undefined,
        };
      }).filter(Boolean);

      // Accessibility personas (motor-tremor, low-vision, adhd, etc.)
      const accessibilityPersonas = accessibilityNames.map(name => {
        const p = getAccessibilityPersona(name);
        if (!p) return null;
        // Shared with the remote roster (personas.ts); a declared label wins
        // over inference. This copy and that one were identical inference
        // blocks, so a fix to one could only ever reach half the users.
        // (2026-10-07)
        const { disabilityType, barrierTypes } = describeAccessibilityPersona(p);

        // v16.12.0: Include Schwartz values for accessibility personas
        const values = resolveValuesForPersona(p.name);
        return {
          name: p.name,
          description: p.description,
          category: "accessibility",
          disabilityType,
          demographics: p.demographics,
          cognitiveTraits: p.cognitiveTraits || {},
          barrierTypes,
          values: values ? {
            schwartz: {
              selfDirection: values.selfDirection,
              stimulation: values.stimulation,
              hedonism: values.hedonism,
              achievement: values.achievement,
              power: values.power,
              security: values.security,
              conformity: values.conformity,
              tradition: values.tradition,
              benevolence: values.benevolence,
              universalism: values.universalism,
            },
            higherOrder: {
              openness: values.openness,
              selfEnhancement: values.selfEnhancement,
              conservation: values.conservation,
              selfTranscendence: values.selfTranscendence,
            },
            sdt: {
              autonomyNeed: values.autonomyNeed,
              competenceNeed: values.competenceNeed,
              relatednessNeed: values.relatednessNeed,
            },
            maslowLevel: values.maslowLevel,
          } : undefined,
        };
      }).filter(Boolean);

      const allPersonas = [...builtinPersonas, ...accessibilityPersonas];

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              personas: allPersonas,
              count: allPersonas.length,
              categories: {
                builtin: builtinPersonas.length,
                accessibility: accessibilityPersonas.length,
              },
            }, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Persona Questionnaire Tools (v16.5.0)
  // Research-based persona generation via questionnaire
  // =========================================================================





  // =========================================================================
  // Values System Tools (v16.12.0)
  // Schwartz's 10 Universal Values, Self-Determination Theory, Maslow
  // =========================================================================


  // persona_values_lookup lives in mcp-tools/base/values-tools.ts and is
  // registered below via registerValuesTools. A second copy lived here and
  // answered the stdio server while the remote server answered from the
  // shared one: same tool name, two different payloads, and the newer fields
  // (netNudge, valuesSource, the maslow basis) existed in only one of them.
  // The divergence was invisible because each server was self-consistent.
  // Same removal as the legacy empathy_audit above. (2026-08-01)


  // =========================================================================
  // Persona Comparison Session Bridge (API-free via Claude orchestration)
  // =========================================================================


  server.tool(
    "compare_personas_record_result",
    "Record the journey result for a persona in the comparison session. Call this when a persona's journey is complete (success or abandonment).",
    {
      sessionId: z.string().describe("Session ID from compare_personas_init"),
      persona: z.string().describe("Persona name"),
      goalAchieved: z.boolean().describe("Whether the goal was accomplished"),
      abandonmentReason: z.enum(["patience", "confusion", "frustration", "no_progress", "loop", "timeout"]).optional().describe("Why the persona abandoned (if goalAchieved is false)"),
      finalState: z.object({
        patienceRemaining: z.number().describe("Final patience level (0-1)"),
        confusionLevel: z.number().describe("Final confusion level (0-1)"),
        frustrationLevel: z.number().describe("Final frustration level (0-1)"),
        stepCount: z.number().describe("Total number of actions taken"),
        timeElapsed: z.number().describe("Total seconds elapsed"),
      }).describe("Final cognitive state"),
      frictionPoints: z.array(z.object({
        type: z.string().describe("Type of friction (e.g., 'navigation', 'form', 'loading')"),
        description: z.string().describe("Description of the friction point"),
      })).optional().describe("Friction points encountered during journey"),
    },
    async ({ sessionId, persona, goalAchieved, abandonmentReason, finalState, frictionPoints }) => {
      const session = comparisonSessions.get(sessionId);
      if (!session) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: "Session not found", sessionId }) }],
        };
      }

      // Add result
      session.results.push({
        persona,
        goalAchieved,
        abandonmentReason,
        finalState: {
          ...finalState,
          goalProgress: goalAchieved ? 1.0 : 0.5,
          confidenceLevel: goalAchieved ? 0.9 : 0.3,
          currentMood: goalAchieved ? "relieved" : "defeated",
          memory: {
            pagesVisited: [],
            actionsAttempted: [],
            errorsEncountered: [],
            backtrackCount: 0,
          },
        },
        stepCount: finalState.stepCount,
        timeElapsed: finalState.timeElapsed,
        frictionPoints: frictionPoints || [],
      });

      const remaining = session.personas.length - session.results.length;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              recorded: true,
              persona,
              goalAchieved,
              resultCount: session.results.length,
              totalPersonas: session.personas.length,
              remaining,
              nextStep: remaining > 0
                ? `Run journey for ${remaining} more persona(s), then call compare_personas_summarize`
                : "All personas complete. Call compare_personas_summarize to get the comparison report.",
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "compare_personas_summarize",
    "Generate the final comparison summary after all persona journeys are complete. Returns rankings, insights, and recommendations.",
    {
      sessionId: z.string().describe("Session ID from compare_personas_init"),
    },
    async ({ sessionId }) => {
      const session = comparisonSessions.get(sessionId);
      if (!session) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: "Session not found", sessionId }) }],
        };
      }

      if (session.results.length === 0) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: "No results recorded yet", sessionId }) }],
        };
      }

      // Generate summary (deterministic aggregation)
      const successfulResults = session.results.filter(r => r.goalAchieved);
      const failedResults = session.results.filter(r => !r.goalAchieved);

      const sortedByTime = [...successfulResults].sort((a, b) => a.timeElapsed - b.timeElapsed);
      const sortedBySteps = [...successfulResults].sort((a, b) => a.stepCount - b.stepCount);
      const sortedByFriction = [...session.results].sort((a, b) => b.frictionPoints.length - a.frictionPoints.length);

      // Collect all friction points
      const allFrictionPoints = session.results.flatMap(r => r.frictionPoints.map(fp => fp.type));
      const frictionCounts = allFrictionPoints.reduce((acc, fp) => {
        acc[fp] = (acc[fp] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const commonFriction = Object.entries(frictionCounts)
        .filter(([_, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([fp]) => fp);

      // Generate recommendations
      const recommendations: string[] = [];

      // Abandonment analysis
      const abandonedByPatience = failedResults.filter(r => r.abandonmentReason === "patience");
      const abandonedByFrustration = failedResults.filter(r => r.abandonmentReason === "frustration");
      const abandonedByConfusion = failedResults.filter(r => r.abandonmentReason === "confusion");

      if (abandonedByPatience.length > 0) {
        recommendations.push(`${abandonedByPatience.length} persona(s) abandoned due to PATIENCE exhaustion: ${abandonedByPatience.map(r => r.persona).join(", ")} - consider shorter flows`);
      }
      if (abandonedByFrustration.length > 0) {
        recommendations.push(`${abandonedByFrustration.length} persona(s) abandoned due to FRUSTRATION: ${abandonedByFrustration.map(r => r.persona).join(", ")} - review error messages and feedback`);
      }
      if (abandonedByConfusion.length > 0) {
        recommendations.push(`${abandonedByConfusion.length} persona(s) abandoned due to CONFUSION: ${abandonedByConfusion.map(r => r.persona).join(", ")} - improve UI clarity and labeling`);
      }

      if (sortedByFriction[0]?.frictionPoints.length > 0) {
        recommendations.push(`"${sortedByFriction[0].persona}" experienced the most friction (${sortedByFriction[0].frictionPoints.length} points)`);
      }

      // Calculate averages
      const avgTime = session.results.reduce((sum, r) => sum + r.timeElapsed, 0) / session.results.length;
      const avgSteps = session.results.reduce((sum, r) => sum + r.stepCount, 0) / session.results.length;

      const summary = {
        sessionId,
        url: session.url,
        goal: session.goal,
        timestamp: new Date().toISOString(),
        totalPersonas: session.personas.length,
        successCount: successfulResults.length,
        failureCount: failedResults.length,
        successRate: `${Math.round((successfulResults.length / session.results.length) * 100)}%`,
        fastestPersona: sortedByTime[0]?.persona || "N/A",
        slowestPersona: sortedByTime[sortedByTime.length - 1]?.persona || "N/A",
        fewestSteps: sortedBySteps[0]?.persona || "N/A",
        mostFriction: sortedByFriction[0]?.persona || "N/A",
        leastFriction: sortedByFriction[sortedByFriction.length - 1]?.persona || "N/A",
        avgCompletionTime: Math.round(avgTime),
        avgSteps: Math.round(avgSteps),
        commonFrictionPoints: commonFriction,
        recommendations,
        results: session.results.map(r => ({
          persona: r.persona,
          success: r.goalAchieved,
          abandonmentReason: r.abandonmentReason,
          timeElapsed: r.timeElapsed,
          stepCount: r.stepCount,
          frictionCount: r.frictionPoints.length,
          finalPatience: Math.round(r.finalState.patienceRemaining * 100) + "%",
          finalFrustration: Math.round(r.finalState.frustrationLevel * 100) + "%",
          finalConfusion: Math.round(r.finalState.confusionLevel * 100) + "%",
        })),
      };

      // Clean up session after summarizing
      comparisonSessions.delete(sessionId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Empathy Audit Session Bridge (API-free via Claude orchestration)
  // =========================================================================

  server.tool(
    "empathy_audit_init",
    "Initialize an accessibility empathy audit session. Returns disability persona profiles with traits, barrier detection hints, and WCAG criteria. Claude orchestrates the audit using browser tools, then records barriers. NO API KEY NEEDED - Claude is the brain.",
    {
      url: z.string().url().describe("URL to audit"),
      goal: z.string().describe("Task goal (e.g., 'complete checkout')"),
      disabilities: z.array(z.string()).optional().describe("Disability personas to test. Available: motor-impairment-tremor, low-vision-magnified, cognitive-adhd, dyslexic-user, deaf-user, elderly-low-vision, color-blind-deuteranopia"),
      wcagLevel: z.enum(["A", "AA", "AAA"]).optional().default("AA").describe("WCAG conformance level to check against"),
    },
    async ({ url, goal, disabilities, wcagLevel }) => {
      // Cleanup old sessions
      cleanupOldSessions();

      // Generate session ID
      const sessionId = `empathy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Get disability personas
      const disabilityList = disabilities || listAccessibilityPersonas();
      const personas = disabilityList.map(name => {
        const persona = getAccessibilityPersona(name);
        if (!persona) {
          const customPersona = {
            name,
            disabilityType: "unknown",
            description: `Custom disability persona: ${name}`,
            accessibilityTraits: {},
          };
          return customPersona;
        }
        // Build the session persona object first, then compute disabilityType
        const sessionPersona = {
          name: persona.name,
          disabilityType: "", // Will be computed below
          description: persona.description,
          accessibilityTraits: persona.accessibilityTraits,
          cognitiveTraits: persona.cognitiveTraits,
        };
        // A declared label wins; traits are inferred only for personas that
        // declare none. Inferring here gave dyslexic-user "Cognitive
        // (ADHD/Memory)" in this session and "Cognitive (Processing)" in the
        // roster. (2026-10-07)
        sessionPersona.disabilityType = persona.disabilityType ?? getDisabilityTypeFromPersona(sessionPersona);
        return sessionPersona;
      });

      // Store session
      const session: EmpathyAuditSession = {
        id: sessionId,
        url,
        goal,
        wcagLevel: wcagLevel || "AA",
        personas,
        currentPersonaIndex: 0,
        barriers: [],
        wcagViolations: new Set(),
        personaResults: [],
        createdAt: Date.now(),
      };
      empathyAuditSessions.set(sessionId, session);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              sessionId,
              url,
              goal,
              wcagLevel: session.wcagLevel,
              personaCount: personas.length,
              personas: personas.map(p => ({
                name: p.name,
                disabilityType: p.disabilityType,
                description: p.description,
                accessibilityTraits: p.accessibilityTraits,
                barrierHints: getBarrierHintsForPersona(p),
              })),
              wcagCriteria: Object.entries(WCAG_CRITERIA)
                .filter(([_, v]) => {
                  if (session.wcagLevel === "A") return v.level === "A";
                  if (session.wcagLevel === "AA") return v.level === "A" || v.level === "AA";
                  return true; // AAA includes all
                })
                .map(([code, v]) => ({ code, ...v })),
              instructions: "For each persona: 1) Use browser tools to attempt the goal while noting difficulties. 2) Call empathy_audit_record_barrier for each barrier encountered. 3) Call empathy_audit_complete_persona when done. 4) After all personas, call empathy_audit_summarize.",
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "empathy_audit_record_barrier",
    "Record an accessibility barrier found during the empathy audit. Call this when you observe something that would be difficult for the current disability persona.",
    {
      sessionId: z.string().describe("Session ID from empathy_audit_init"),
      persona: z.string().describe("Persona name experiencing this barrier"),
      barrierType: z.enum(["motor_precision", "visual_clarity", "cognitive_load", "temporal", "sensory", "contrast", "touch_target", "timing"]).describe("Type of accessibility barrier"),
      element: z.string().describe("CSS selector or description of the problematic element"),
      description: z.string().describe("Description of the barrier and its impact"),
      severity: z.enum(["minor", "major", "critical"]).describe("How severely this impacts the user"),
    },
    async ({ sessionId, persona, barrierType, element, description, severity }) => {
      const session = empathyAuditSessions.get(sessionId);
      if (!session) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: "Session not found. Call empathy_audit_init first." }) }],
        };
      }

      // Get WCAG criteria for this barrier type
      const wcagCriteria = getWcagCriteriaForBarrier(barrierType as AccessibilityBarrierType);
      wcagCriteria.forEach(c => session.wcagViolations.add(c));

      const barrier: AccessibilityBarrier = {
        type: barrierType as AccessibilityBarrierType,
        element,
        description,
        affectedPersonas: [persona],
        wcagCriteria,
        severity: severity as AccessibilityBarrierSeverity,
        remediation: getRemediationForBarrier(barrierType as AccessibilityBarrierType, element),
      };

      session.barriers.push(barrier);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              recorded: true,
              sessionId,
              totalBarriers: session.barriers.length,
              wcagViolations: Array.from(session.wcagViolations),
              barrier: {
                type: barrier.type,
                severity: barrier.severity,
                wcagCriteria: barrier.wcagCriteria.map(c => ({
                  code: c,
                  description: WCAG_CRITERIA[c]?.description || "Unknown",
                })),
                remediation: barrier.remediation,
              },
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "empathy_audit_complete_persona",
    "Mark a persona's journey as complete. Call this after finishing the audit for one disability persona.",
    {
      sessionId: z.string().describe("Session ID from empathy_audit_init"),
      persona: z.string().describe("Persona name that completed"),
      goalAchieved: z.boolean().describe("Whether the goal was accomplished"),
      stepCount: z.number().describe("Number of steps/actions taken"),
      notes: z.string().optional().describe("Additional observations about this persona's experience"),
    },
    async ({ sessionId, persona, goalAchieved, stepCount, notes }) => {
      const session = empathyAuditSessions.get(sessionId);
      if (!session) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: "Session not found." }) }],
        };
      }

      // Get barriers for this persona
      const personaBarriers = session.barriers.filter(b => b.affectedPersonas.includes(persona));
      const personaWcag = new Set<string>();
      personaBarriers.forEach(b => b.wcagCriteria.forEach(c => personaWcag.add(c)));

      // Calculate empathy score (heuristic)
      const barrierPenalty = personaBarriers.reduce((sum, b) => {
        const severityWeight = { minor: 5, major: 15, critical: 30 };
        return sum + (severityWeight[b.severity] || 10);
      }, 0);
      const empathyScore = Math.max(0, Math.min(100, 100 - barrierPenalty - (goalAchieved ? 0 : 20)));

      const result = {
        persona,
        disabilityType: session.personas.find(p => p.name === persona)?.disabilityType || "unknown",
        goalAchieved,
        barriers: personaBarriers,
        wcagViolations: Array.from(personaWcag),
        stepCount,
        empathyScore,
        notes,
      };

      session.personaResults.push(result);
      session.currentPersonaIndex++;

      const remaining = session.personas.length - session.personaResults.length;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              recorded: true,
              sessionId,
              persona,
              empathyScore,
              barriersFound: personaBarriers.length,
              wcagViolations: result.wcagViolations,
              completedPersonas: session.personaResults.length,
              totalPersonas: session.personas.length,
              remaining,
              nextStep: remaining > 0
                ? `Audit ${remaining} more persona(s), then call empathy_audit_summarize`
                : "All personas complete. Call empathy_audit_summarize for the final report.",
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "empathy_audit_summarize",
    "Generate the final empathy audit summary after all personas have completed. Returns scores, barriers, WCAG violations, and remediation priorities.",
    {
      sessionId: z.string().describe("Session ID from empathy_audit_init"),
    },
    async ({ sessionId }) => {
      const session = empathyAuditSessions.get(sessionId);
      if (!session) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: "Session not found." }) }],
        };
      }

      if (session.personaResults.length === 0) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: "No persona results recorded. Complete at least one persona journey first." }) }],
        };
      }

      // Calculate overall score
      const overallScore = Math.round(
        session.personaResults.reduce((sum, r) => sum + r.empathyScore, 0) / session.personaResults.length
      );

      // Determine grade
      const grade = overallScore >= 90 ? "A" : overallScore >= 80 ? "B" : overallScore >= 70 ? "C" : overallScore >= 60 ? "D" : "F";

      // Aggregate barriers by type
      const barriersByType: Record<string, number> = {};
      session.barriers.forEach(b => {
        barriersByType[b.type] = (barriersByType[b.type] || 0) + 1;
      });

      // Prioritize remediation
      const remediationPriority = session.barriers
        .sort((a, b) => {
          const severityOrder = { critical: 0, major: 1, minor: 2 };
          return (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2);
        })
        .slice(0, 10)
        .map((b, i) => ({
          priority: i + 1,
          type: b.type,
          element: b.element,
          severity: b.severity,
          remediation: b.remediation,
          wcagCriteria: b.wcagCriteria,
        }));

      const summary = {
        sessionId,
        url: session.url,
        goal: session.goal,
        wcagLevel: session.wcagLevel,
        timestamp: new Date().toISOString(),
        overallScore,
        grade,
        totalBarriers: session.barriers.length,
        totalWcagViolations: session.wcagViolations.size,
        wcagViolations: Array.from(session.wcagViolations).map(c => ({
          code: c,
          level: WCAG_CRITERIA[c]?.level || "?",
          description: WCAG_CRITERIA[c]?.description || "Unknown",
        })),
        barriersByType,
        personaResults: session.personaResults.map(r => {
          // v16.7.2: Separate barrier types from element counts
          const uniqueTypes = new Set(r.barriers.map(b => b.type));
          return {
            persona: r.persona,
            disabilityType: r.disabilityType,
            goalAchieved: r.goalAchieved,
            empathyScore: r.empathyScore,
            barrierTypeCount: uniqueTypes.size,  // Unique barrier categories
            barrierTypes: Array.from(uniqueTypes),
            // Records and elements are different numbers; both ship, counted
            // as the hosted empathy_audit counts them (B7). This was
            // barriers.length, labelled "Raw element count": the same element
            // recorded twice counted twice. (Round 2, 2026-10-09)
            barrierCount: r.barriers.length,
            affectedElements: countAffectedElements(r.barriers),
            wcagViolationCount: r.wcagViolations.length,
          };
        }),
        remediationPriority,
        recommendations: generateEmpathyRecommendations(session),
      };

      // Clean up session
      empathyAuditSessions.delete(sessionId);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Performance Tools (v6.4.0+)
  // =========================================================================

  server.tool(
    "perf_baseline",
    "Capture performance baseline for a URL",
    {
      url: z.string().url().describe("URL to capture baseline for"),
      name: z.string().describe("Name for the baseline"),
      runs: z.number().optional().default(3).describe("Number of runs to average"),
    },
    async ({ url, name, runs }) => {
      const result = await capturePerformanceBaseline(url, { name, runs });
      // v16.11.0: Return all available metrics, not just core 4
      const m = result.metrics;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name: result.name,
              url: result.url,
              // Core Web Vitals
              coreWebVitals: {
                lcp: m.lcp,
                lcpRating: m.lcpRating,
                fid: m.fid,
                fidRating: m.fidRating,
                cls: m.cls,
                clsRating: m.clsRating,
              },
              // Additional timing metrics
              timingMetrics: {
                fcp: m.fcp,
                fcpRating: m.fcpRating,
                ttfb: m.ttfb,
                ttfbRating: m.ttfbRating,
                tti: m.tti,
                tbt: m.tbt,
                domContentLoaded: m.domContentLoaded,
                load: m.load,
              },
              // Resource metrics
              resourceMetrics: {
                resourceCount: m.resourceCount,
                transferSize: m.transferSize,
              },
              // Flat copy for backward compatibility
              metrics: {
                lcp: m.lcp,
                fcp: m.fcp,
                ttfb: m.ttfb,
                cls: m.cls,
              },
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "perf_regression",
    "Detect performance regression against baseline with configurable sensitivity. Uses dual thresholds: both percentage AND absolute change must be exceeded. Profiles: strict (perf envs, FCP 10%/50ms), normal (default, FCP 20%/100ms), ci (automated pipelines, FCP 25%/150ms), lenient (dev, FCP 30%/200ms).",
    {
      url: z.string().url().describe("URL to test"),
      baselineName: z.string().describe("Name of baseline to compare against"),
      sensitivity: z.enum(["strict", "normal", "ci", "lenient"]).optional().default("normal").describe("Sensitivity profile: strict (perf testing), normal (local dev), ci (automated pipelines), lenient (development)"),
      thresholdLcp: z.number().optional().describe("Override LCP threshold percentage"),
    },
    async ({ url, baselineName, sensitivity, thresholdLcp }) => {
      const result = await detectPerformanceRegression(url, baselineName, {
        sensitivity,
        thresholds: thresholdLcp ? { lcp: thresholdLcp } : undefined,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              passed: result.passed,
              sensitivity: result.sensitivity,
              notes: result.notes,
              regressions: result.regressions,
              currentMetrics: result.currentMetrics,
              baseline: result.baseline.name,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "list_baselines",
    "List all saved baselines (visual and performance)",
    {},
    async () => {
      const visualBaselines = await listVisualBaselines();
      const perfBaselines = await listPerformanceBaselines();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              visual: visualBaselines,
              performance: perfBaselines,
            }, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Agent-Ready Audit, Competitive Benchmark, Accessibility Empathy (v8.0.0)
  // =========================================================================

  server.tool(
    "agent_ready_audit",
    "Audit a website for AI-agent friendliness. Analyzes findability, stability, accessibility, and semantics. Returns score (0-100), grade (A-F), issues, and remediation recommendations.",
    {
      url: z.string().url().describe("URL to audit"),
      limit: z.number().optional().default(5).describe("How many issues (worst first) and recommendations (priority order) to return. Totals and severity counts always cover ALL findings."),
      offset: z.number().optional().default(0).describe("Skip this many issues and recommendations before returning, for paging through a large result."),
    },
    async ({ url, limit, offset }) => {
      const result = await runAgentReadyAudit(url, { headless: true });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              url: result.url,
              score: result.score,
              grade: result.grade,
              summary: result.summary,
              // Same paging as the HTTP tool. This copy sliced issues in
              // detection order and never got the 2026-08-01 worst-first fix.
              ...pageAgentReadyFindings(result, { limit, offset }),
              duration: result.duration,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "competitive_benchmark",
    "Compare UX across competitor sites. Runs identical cognitive journeys on multiple sites and generates head-to-head comparison with rankings, friction analysis, and recommendations.",
    {
      sites: z.array(z.string().url()).describe("Array of URLs to compare"),
      goal: z.string().describe("Task goal (e.g., 'sign up for free trial')"),
      persona: z.string().optional().default("first-timer").describe("Persona to use"),
      maxSteps: z.number().optional().default(30).describe("Max steps per site"),
      maxTime: z.number().optional().default(180).describe("Max time per site in seconds"),
    },
    async ({ sites, goal, persona, maxSteps, maxTime }) => {
      const result = await runCompetitiveBenchmark({
        sites: sites.map((url) => ({ url })),
        goal,
        persona,
        maxSteps,
        maxTime,
        headless: true,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              goal: result.goal,
              persona: result.persona,
              ranking: result.ranking,
              comparison: result.comparison,
              recommendations: result.recommendations.slice(0, 5),
              duration: result.duration,
            }, null, 2),
          },
        ],
      };
    }
  );

  // The ui:// resources the canonical tools advertise via _meta.ui. Without
  // these the stdio server answered "Method not found" to resources/list while
  // its own tool pointed at ui://cbrowser/empathy, so a UI-capable host was
  // told a widget existed and could not fetch it.
  registerUiResources(server);

  // empathy_audit is registered from the canonical implementation in
  // mcp-tools/base/audit-tools.ts. This file used to carry its own older copy
  // of the same tool name -- thin summary, no barrier rects, no persona
  // weighting, no UI resource -- so the local server answered differently to
  // the remote one for the same call. Removed 2026-07-31.
  registerEmpathyAuditTool(server);
  registerValuesTools(server);
  // The eight cognitive/comparison tools were registered only on the PUBLIC
  // path, so the hosted server had them and `npx cbrowser mcp-server` did not:
  // compare_personas, compare_personas_init, compare_personas_complete,
  // cognitive_distance, cognitive_coverage, cognitive_interpolate,
  // cognitive_load_estimate and cognitive_effort. Two of them existed here as
  // separate older copies, which is how the gap stayed invisible -- the two
  // most-used names were present locally, so the absence of the other six read
  // as "those are enterprise features" rather than as a registration gap.
  // Same split, same fix as the values family earlier today. (2026-08-01)
  registerPersonaComparisonTools(server, { getBrowser });

  // The persona-creation family was duplicated here too -- five older copies
  // against the shared registrar's six. That is why Big Five inference from a
  // description reached the hosted server and not `npx cbrowser mcp-server`:
  // the stdio build was answering from tools that predate it. Eighth pair found
  // this way; the pattern is that anything registered only on the public path
  // silently diverges from anything hand-written here. (2026-08-01)
  registerPersonaCreationTools(server);
  registerPersonaLifecycleTools(server);

  // =========================================================================
  // Diagnostics Tools
  // =========================================================================

  server.tool(
    "status",
    "Get CBrowser environment status and diagnostics including data directories, installed browsers, configuration, self-healing cache statistics, and MCP tool count",
    {},
    async () => {
      // v18.22.0: Include tool count for self-diagnosis of tool discrepancies.
      // collectedTools sees only server.tool(...) calls, so every family this
      // server registers through registerTool (empathy_audit, values, persona
      // comparison/creation/lifecycle) was missing: 55 reported, 82 listed.
      // Count what tools/list actually serves. (2026-10-07)
      const info = await getStatusInfo(VERSION, countRegisteredTools(server) ?? collectedTools.length);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(info, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Browser Management Tools (v11.8.0)
  // =========================================================================

  server.tool(
    "browser_health",
    "Check if the browser is healthy and responsive. Use this before operations if you suspect the browser may have crashed.",
    {},
    async () => {
      const b = await getBrowser();
      const result = await b.isBrowserHealthy();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "browser_recover",
    "Attempt to recover from a browser crash by restarting the browser process. Use this when browser_health returns unhealthy.",
    {
      restoreUrl: z.string().url().optional().describe("URL to restore after recovery (uses last known URL if not provided)"),
      maxAttempts: z.number().optional().default(3).describe("Maximum recovery attempts"),
    },
    async ({ restoreUrl, maxAttempts }) => {
      const b = await getBrowser();
      const result = await b.recoverBrowser({ restoreUrl, maxAttempts });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "reset_browser",
    "Reset the browser to a clean state. Clears all cookies, localStorage, sessionStorage, and browser state. Use this when you need a fresh browser environment.",
    {},
    async () => {
      const b = await getBrowser();
      await b.reset();
      // Relaunch for immediate use
      await b.launch();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "Browser reset to clean state and relaunched",
            }, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Emotional State Manipulation Tools (v13.1.0)
  // =========================================================================

  server.tool(
    "get_emotional_state",
    "Get the current emotional state of a cognitive journey. Returns the dominant emotion, valence, arousal, and all emotion intensities.",
    {
      persona: z.string().describe("The persona name to get emotional state for"),
    },
    async ({ persona }) => {
      // Create initial emotional state based on persona traits
      const personaData = getPersona(persona);
      if (!personaData) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: `Persona not found: ${persona}` }) }],
        };
      }
      const emotionalState = createInitialEmotionalState(personaData.cognitiveTraits);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              persona,
              emotionalState,
              description: describeEmotionalState(emotionalState),
              abandonmentRisk: calculateAbandonmentModifier(emotionalState),
              explorationTendency: calculateExplorationTendency(emotionalState),
              decisionSpeedModifier: calculateDecisionSpeedModifier(emotionalState),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "trigger_emotional_event",
    "Simulate an emotional trigger event on a persona's state. Returns the updated emotional state after the trigger.",
    {
      persona: z.string().describe("The persona name"),
      trigger: z.enum([
        "success", "failure", "error", "progress", "setback",
        "waiting", "discovery", "completion", "confusion_onset",
        "clarity", "time_pressure", "recovery"
      ]).describe("The emotional trigger to apply"),
      severity: z.number().min(0).max(2).optional().default(1).describe("Severity multiplier (0-2, default 1)"),
      description: z.string().optional().describe("Custom description for the event"),
    },
    async ({ persona, trigger, severity, description }) => {
      const personaData = getPersona(persona);
      if (!personaData) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: `Persona not found: ${persona}` }) }],
        };
      }
      const initialState = createInitialEmotionalState(personaData.cognitiveTraits);
      const config = createEmotionalConfig(personaData.cognitiveTraits);
      const { state, event } = applyEmotionalTrigger(
        initialState,
        trigger,
        config,
        1,
        { severity, description }
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              trigger,
              event,
              previousState: {
                dominant: initialState.dominant,
                valence: initialState.valence.toFixed(2),
                arousal: initialState.arousal.toFixed(2),
              },
              newState: state,
              description: describeEmotionalState(state),
              shouldConsiderAbandonment: shouldConsiderAbandonment(state),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "list_emotional_personas",
    "List all available emotional personas designed for testing emotional response patterns.",
    {},
    async () => {
      const emotionalPersonas = listEmotionalPersonas();
      const personaDetails = emotionalPersonas.map(name => {
        const p = getEmotionalPersona(name);
        return {
          name,
          description: p?.description || "",
          keyTraits: p?.cognitiveTraits ? {
            resilience: p.cognitiveTraits.resilience,
            patience: p.cognitiveTraits.patience,
            selfEfficacy: p.cognitiveTraits.selfEfficacy,
          } : undefined,
        };
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              count: emotionalPersonas.length,
              personas: personaDetails,
              note: "Use these personas with cognitive_journey_init for emotion-sensitive testing",
            }, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Persona Creation Tools (v17.3.0)
  // =========================================================================








  // =========================================================================
  // Security Tools (mcp-guardian integration)
  // =========================================================================

  server.tool(
    "security_audit",
    "Audit MCP tool definitions for potential prompt injection attacks. Scans tool descriptions for cross-tool instructions, privilege escalation attempts, and data exfiltration patterns. Returns detailed report of any security issues found.",
    {
      config_path: z
        .string()
        .optional()
        .describe(
          "Path to claude_desktop_config.json. If not provided, scans the current CBrowser server's tools."
        ),
      format: z
        .enum(["json", "text"])
        .optional()
        .default("json")
        .describe("Output format: json (structured) or text (human-readable)"),
      async_scan: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, connects to MCP servers to scan their tools (slower but more accurate)."),
    },
    async (params) => {
      // If no config_path provided, scan CBrowser's own tools
      const options: SecurityAuditHandlerOptions = {
        ...params,
        // Pass collected CBrowser tools for self-scan when no config_path
        ...(params.config_path ? {} : {
          tools: collectedTools.map(t => ({ name: t.name, description: t.description, schema: {} })),
          serverName: "cbrowser",
        }),
      };
      return await securityAuditHandler(options);
    }
  );

  return server;
}

/**
 * Create and configure the MCP server with all CBrowser tools.
 * Returns the server instance before connecting, allowing Enterprise
 * or other packages to add additional tools.
 *
 * @example
 * ```typescript
 * import { createMcpServer } from 'cbrowser';
 *
 * const server = await createMcpServer();
 * // Add custom tools here
 * server.tool('my_custom_tool', 'Description', {}, async () => { ... });
 * // Then connect
 * await connectMcpServer(server);
 * ```
 */
export async function createMcpServer(): Promise<McpServer> {
  return registerCBrowserTools();
}

/**
 * Connect an MCP server via stdio transport and set up shutdown handling.
 * Use after createMcpServer() and adding any custom tools.
 */
export async function connectMcpServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Handle shutdown
  process.on("SIGINT", async () => {
    if (browser) {
      await browser.close();
    }
    process.exit(0);
  });
}

export async function startMcpServer(): Promise<void> {
  // CRITICAL: MCP stdio transport uses stdout for JSON-RPC messages — any console.log
  // corrupts the protocol ("Unexpected token" in clients). Redirect it to stderr here, at
  // the top of the stdio entry point (before createMcpServer's tool-registration logging),
  // NOT at module scope: cli.ts imports this module, so a module-level redirect poisoned
  // console.log for the whole CLI and sent command output to stderr. The HTTP remote server
  // (mcp-server-remote.ts) doesn't need this — its stdout is not the protocol channel.
  console.log = (...args: unknown[]) => console.error(...args);

  const server = await createMcpServer();
  await connectMcpServer(server);
}

// Run if called directly
if (process.argv[1]?.endsWith("mcp-server.js") || process.argv[1]?.endsWith("mcp-server.ts")) {
  startMcpServer().catch(console.error);
}
