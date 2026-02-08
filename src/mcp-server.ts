#!/usr/bin/env node
/**
 * CBrowser MCP Server
 *
 * Exposes CBrowser browser automation tools via Model Context Protocol.
 * Run with: cbrowser mcp-server
 * Or: npx cbrowser mcp-server
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CBrowser } from "./browser.js";
import { ensureDirectories, getStatusInfo } from "./config.js";

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
  runChaosTest,
  comparePersonas,
  findElementByIntent,
  runAgentReadyAudit,
  runCompetitiveBenchmark,
  runEmpathyAudit,
} from "./analysis/index.js";
import { listAccessibilityPersonas, getAccessibilityPersona } from "./personas.js";

// Persona imports for cognitive journey
import {
  getPersona,
  listPersonas,
  getCognitiveProfile,
  createCognitivePersona,
} from "./personas.js";
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

// Version from package.json - single source of truth
import { VERSION } from "./version.js";

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

export async function startMcpServer(): Promise<void> {
  // Auto-initialize all data directories on server start
  ensureDirectories();

  const server = new McpServer({
    name: "cbrowser",
    version: VERSION,
  });

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
      const b = await getBrowser();
      const result = await b.click(selector, { force, verbose });
      const response: Record<string, unknown> = {
        success: result.success,
        message: result.message,
        screenshot: result.screenshot,
      };
      if (verbose && !result.success) {
        if (result.availableElements) response.availableElements = result.availableElements;
        if (result.aiSuggestion) response.aiSuggestion = result.aiSuggestion;
        if (result.debugScreenshot) response.debugScreenshot = result.debugScreenshot;
      }
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
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
    }
  );

  server.tool(
    "extract",
    "Extract data from the page",
    {
      what: z.enum(["links", "headings", "forms", "images", "text"]).describe("What to extract"),
    },
    async ({ what }) => {
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
            text: JSON.stringify({
              overallStatus: result.overallStatus,
              similarityScore: result.analysis?.similarityScore,
              summary: result.analysis?.summary,
              changesCount: result.analysis?.changes?.length || 0,
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
        return { content: [{ type: "text", text: JSON.stringify({ error: `Test file not found: ${filepath}` }) }] };
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
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              totalPages: result.sitePages.length,
              testedPages: result.testedPages.length,
              untestedPages: result.analysis.untestedPages,
              overallCoverage: `${result.analysis.coveragePercent.toFixed(1)}%`,
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
      timeout: z.number().optional().default(60000).describe("Timeout in milliseconds"),
    },
    async ({ url, maxPages, timeout }) => {
      const b = await getBrowser();
      const result = await huntBugs(b, url, { maxPages, timeout });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              pagesVisited: result.pagesVisited,
              bugsFound: result.bugs.length,
              duration: result.duration,
              bugs: result.bugs.slice(0, 10).map(bug => ({
                type: bug.type,
                severity: bug.severity,
                description: bug.description,
                url: bug.url,
                selector: bug.selector,
                recommendation: bug.recommendation,
              })),
            }, null, 2),
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
      const result = await runChaosTest(b, url, { networkLatency, offline, blockUrls });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              passed: result.passed,
              errors: result.errors,
              duration: result.duration,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "compare_personas",
    "Compare how different user personas experience a journey. REQUIRES API KEY for internal simulation. For API-free usage over remote MCP, use compare_personas_init + browser tools + compare_personas_record_result + compare_personas_summarize instead.",
    {
      url: z.string().url().describe("Starting URL"),
      goal: z.string().describe("Goal to accomplish"),
      personas: z.array(z.string()).describe("Persona names to compare"),
    },
    async ({ url, goal, personas }) => {
      try {
        const result = await comparePersonas({
          startUrl: url,
          goal,
          personas,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                url: result.url,
                goal: result.goal,
                personasCompared: result.personas.length,
                summary: result.summary,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("API key")) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "API key required for all-in-one compare_personas",
                  solution: "Use the API-free session bridge pattern instead:",
                  steps: [
                    "1. Call compare_personas_init with url, goal, personas",
                    "2. For each persona, use browser tools (navigate, click, fill) to attempt the goal",
                    "3. Call cognitive_journey_update_state after each action to track cognitive state",
                    "4. Call compare_personas_record_result when each persona completes (success or abandon)",
                    "5. Call compare_personas_summarize to get the comparison report",
                  ],
                  note: "Claude orchestrates the simulation - no API key needed when YOU are the brain!",
                }, null, 2),
              },
            ],
          };
        }
        throw error;
      }
    }
  );

  server.tool(
    "find_element_by_intent",
    "AI-powered semantic element finding with ARIA-first selector strategy. Prioritizes aria-label > role > semantic HTML > ID > name > class. Returns selectorType, accessibilityScore (0-1), and alternatives. Use verbose=true for enriched failure responses.",
    {
      intent: z.string().describe("Natural language description like 'the cheapest product' or 'login form'"),
      verbose: z.boolean().optional().describe("Include alternative matches with confidence scores and AI suggestions"),
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
        patience: z.number().min(0).max(1).optional(),
        riskTolerance: z.number().min(0).max(1).optional(),
        comprehension: z.number().min(0).max(1).optional(),
        persistence: z.number().min(0).max(1).optional(),
        curiosity: z.number().min(0).max(1).optional(),
        workingMemory: z.number().min(0).max(1).optional(),
        readingTendency: z.number().min(0).max(1).optional(),
      }).optional().describe("Override specific cognitive traits"),
    },
    async ({ persona: personaName, goal, startUrl, customTraits }) => {
      // Get or create persona
      const existingPersona = getPersona(personaName);
      let personaObj: Persona;

      if (!existingPersona) {
        // Create from description
        personaObj = createCognitivePersona(personaName, personaName, customTraits || {});
      } else if (customTraits) {
        // Merge custom traits with defaults
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

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              persona: {
                name: personaObj.name,
                description: personaObj.description,
                demographics: personaObj.demographics,
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
        patienceRemaining: z.number(),
        confusionLevel: z.number(),
        frustrationLevel: z.number(),
        goalProgress: z.number(),
        confidenceLevel: z.number(),
        currentMood: z.enum(["neutral", "hopeful", "confused", "frustrated", "defeated", "relieved"]),
        stepCount: z.number(),
        timeElapsed: z.number(),
      }).describe("Current cognitive state"),
      actionResult: z.object({
        success: z.boolean(),
        wasConfusing: z.boolean().optional(),
        progressMade: z.boolean().optional(),
        wentBack: z.boolean().optional(),
      }).describe("Result of the last action"),
      personaTraits: z.object({
        patience: z.number(),
        riskTolerance: z.number(),
        comprehension: z.number(),
        persistence: z.number(),
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
    "List all available personas with their cognitive traits",
    {},
    async () => {
      const names = listPersonas();
      const personas = names.map(name => {
        const p = getPersona(name);
        if (!p) return null;
        const profile = getCognitiveProfile(p);
        return {
          name: p.name,
          description: p.description,
          demographics: p.demographics,
          cognitiveTraits: profile.traits,
          attentionPattern: profile.attentionPattern,
          decisionStyle: profile.decisionStyle,
        };
      }).filter(Boolean);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ personas, count: personas.length }, null, 2),
          },
        ],
      };
    }
  );

  // =========================================================================
  // Persona Comparison Session Bridge (API-free via Claude orchestration)
  // =========================================================================

  server.tool(
    "compare_personas_init",
    "Initialize a multi-persona comparison session. Returns all persona profiles and initial states. Claude orchestrates the journeys using browser tools + cognitive_journey_update_state, then records results. NO API KEY NEEDED - Claude is the brain.",
    {
      url: z.string().url().describe("Starting URL for all journeys"),
      goal: z.string().describe("Goal to accomplish"),
      personas: z.array(z.string()).describe("Persona names to compare (e.g., ['first-timer', 'elderly-user', 'power-user'])"),
    },
    async ({ url, goal, personas: personaNames }) => {
      // Cleanup old sessions
      cleanupOldSessions();

      // Generate session ID
      const sessionId = `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Build persona profiles
      const personas = personaNames.map(name => {
        const existingPersona = getPersona(name);
        let personaObj: Persona;

        if (!existingPersona) {
          personaObj = createCognitivePersona(name, name, {});
        } else {
          personaObj = existingPersona;
        }

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
            pagesVisited: [url],
            actionsAttempted: [],
            errorsEncountered: [],
            backtrackCount: 0,
          },
          timeElapsed: 0,
          stepCount: 0,
        };

        // Abandonment thresholds
        const traits = profile.traits;
        const thresholds: AbandonmentThresholds = {
          patienceMin: 0.1,
          confusionMax: traits.comprehension < 0.4 ? 0.6 : 0.8,
          frustrationMax: traits.patience < 0.3 ? 0.7 : 0.85,
          maxStepsWithoutProgress: traits.persistence > 0.7 ? 15 : 10,
          loopDetectionThreshold: 3,
          timeLimit: traits.patience > 0.7 ? 180 : (traits.patience < 0.3 ? 60 : 120),
        };

        return {
          name,
          description: personaObj.description || name,
          profile,
          initialState,
          thresholds,
        };
      });

      // Store session
      const session: ComparisonSession = {
        id: sessionId,
        url,
        goal,
        personas,
        results: [],
        createdAt: Date.now(),
      };
      comparisonSessions.set(sessionId, session);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              sessionId,
              url,
              goal,
              personaCount: personas.length,
              personas: personas.map(p => ({
                name: p.name,
                description: p.description,
                cognitiveTraits: p.profile.traits,
                attentionPattern: p.profile.attentionPattern,
                decisionStyle: p.profile.decisionStyle,
                initialState: p.initialState,
                thresholds: p.thresholds,
              })),
              instructions: "For each persona: 1) Use browser tools (navigate, click, fill) to attempt the goal. 2) Call cognitive_journey_update_state after each action. 3) Call compare_personas_record_result when done (success or abandon). 4) After all personas, call compare_personas_summarize.",
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "compare_personas_record_result",
    "Record the journey result for a persona in the comparison session. Call this when a persona's journey is complete (success or abandonment).",
    {
      sessionId: z.string().describe("Session ID from compare_personas_init"),
      persona: z.string().describe("Persona name"),
      goalAchieved: z.boolean().describe("Whether the goal was accomplished"),
      abandonmentReason: z.enum(["patience", "confusion", "frustration", "no_progress", "loop", "timeout"]).optional().describe("Why the persona abandoned (if goalAchieved is false)"),
      finalState: z.object({
        patienceRemaining: z.number(),
        confusionLevel: z.number(),
        frustrationLevel: z.number(),
        stepCount: z.number(),
        timeElapsed: z.number(),
      }).describe("Final cognitive state"),
      frictionPoints: z.array(z.object({
        type: z.string(),
        description: z.string(),
      })).optional().describe("Friction points encountered during journey"),
    },
    async ({ sessionId, persona, goalAchieved, abandonmentReason, finalState, frictionPoints }) => {
      const session = comparisonSessions.get(sessionId);
      if (!session) {
        return {
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
          content: [{ type: "text", text: JSON.stringify({ error: "Session not found", sessionId }) }],
        };
      }

      if (session.results.length === 0) {
        return {
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
        // Compute disability type from traits
        sessionPersona.disabilityType = getDisabilityTypeFromPersona(sessionPersona);
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
          content: [{ type: "text", text: JSON.stringify({ error: "Session not found." }) }],
        };
      }

      if (session.personaResults.length === 0) {
        return {
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
        personaResults: session.personaResults.map(r => ({
          persona: r.persona,
          disabilityType: r.disabilityType,
          goalAchieved: r.goalAchieved,
          empathyScore: r.empathyScore,
          barriersFound: r.barriers.length,
          wcagViolationCount: r.wcagViolations.length,
        })),
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
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name: result.name,
              url: result.url,
              lcp: result.metrics.lcp,
              fcp: result.metrics.fcp,
              ttfb: result.metrics.ttfb,
              cls: result.metrics.cls,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "perf_regression",
    "Detect performance regression against baseline with configurable sensitivity. Uses dual thresholds: both percentage AND absolute change must be exceeded. Profiles: strict (CI/CD, FCP 10%/50ms), normal (default, FCP 20%/100ms), lenient (dev, FCP 30%/200ms). Sub-50ms FCP variations ignored by default.",
    {
      url: z.string().url().describe("URL to test"),
      baselineName: z.string().describe("Name of baseline to compare against"),
      sensitivity: z.enum(["strict", "normal", "lenient"]).optional().default("normal").describe("Sensitivity profile: strict (CI/CD), normal (default), lenient (development)"),
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
    },
    async ({ url }) => {
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
              topIssues: result.issues.slice(0, 5),
              topRecommendations: result.recommendations.slice(0, 5),
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

  server.tool(
    "empathy_audit",
    "Simulate how people with disabilities experience a site. REQUIRES API KEY for internal simulation. For API-free usage over remote MCP, use empathy_audit_init + browser tools + empathy_audit_record_barrier + empathy_audit_complete_persona + empathy_audit_summarize instead.",
    {
      url: z.string().url().describe("URL to audit"),
      goal: z.string().describe("Task goal (e.g., 'complete checkout')"),
      disabilities: z.array(z.string()).optional().describe("Disability personas to test. Available: motor-impairment-tremor, low-vision-magnified, cognitive-adhd, dyslexic-user, deaf-user, elderly-low-vision, color-blind-deuteranopia"),
      wcagLevel: z.enum(["A", "AA", "AAA"]).optional().default("AA").describe("WCAG conformance level"),
      maxSteps: z.number().optional().default(20).describe("Max steps per persona"),
      maxTime: z.number().optional().default(120).describe("Max time per persona in seconds"),
    },
    async ({ url, goal, disabilities, wcagLevel, maxSteps, maxTime }) => {
      try {
        // Default to all if not specified
        const disabilityList = disabilities || listAccessibilityPersonas();
        const result = await runEmpathyAudit(url, {
          goal,
          disabilities: disabilityList,
          wcagLevel,
          maxSteps,
          maxTime,
          headless: true,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                url: result.url,
                goal: result.goal,
                overallScore: result.overallScore,
                resultsSummary: result.results.map((r) => ({
                  persona: r.persona,
                  disabilityType: r.disabilityType,
                  goalAchieved: r.goalAchieved,
                  empathyScore: r.empathyScore,
                  barrierCount: r.barriers.length,
                  wcagViolationCount: r.wcagViolations.length,
                })),
                allWcagViolations: result.allWcagViolations,
                topBarriers: result.allBarriers.slice(0, 5),
                topRemediation: result.combinedRemediation.slice(0, 5),
                duration: result.duration,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("API key")) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: "API key required for all-in-one empathy_audit",
                  solution: "Use the API-free session bridge pattern instead:",
                  steps: [
                    "1. Call empathy_audit_init with url, goal, disabilities, wcagLevel",
                    "2. For each disability persona, use browser tools to attempt the goal",
                    "3. Call empathy_audit_record_barrier when you observe accessibility barriers",
                    "4. Call empathy_audit_complete_persona when each persona finishes",
                    "5. Call empathy_audit_summarize to get the final audit report",
                  ],
                  note: "Claude orchestrates the audit - no API key needed when YOU are the brain!",
                  availablePersonas: listAccessibilityPersonas(),
                }, null, 2),
              },
            ],
          };
        }
        throw error;
      }
    }
  );

  // =========================================================================
  // Diagnostics Tools
  // =========================================================================

  server.tool(
    "status",
    "Get CBrowser environment status and diagnostics including data directories, installed browsers, configuration, and self-healing cache statistics",
    {},
    async () => {
      const info = await getStatusInfo(VERSION);
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

  // Connect via stdio transport
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

// Run if called directly
if (process.argv[1]?.endsWith("mcp-server.js") || process.argv[1]?.endsWith("mcp-server.ts")) {
  startMcpServer().catch(console.error);
}
