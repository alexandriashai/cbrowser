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
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CBrowser } from "./browser.js";
import { ensureDirectories } from "./config.js";

import { registerAllPublicTools } from "./mcp-tools/index.js";
import { registerUiResources } from "./mcp-tools/ui-resources.js";
import { setSecurityAuditToolList } from "./mcp-tools/base/security-tools.js";

import { countAffectedElements } from "./analysis/index.js";
import { listAccessibilityPersonas, getAccessibilityPersona } from "./personas.js";

// Persona imports for the emotional-state tools
import {
  getPersona,
  listEmotionalPersonas,
  getEmotionalPersona,
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
  AccessibilityPersona,
  AccessibilityBarrier,
  AccessibilityBarrierType,
  AccessibilityBarrierSeverity,
} from "./types.js";

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

/** Name and description of every tool tools/list will serve, for security_audit. */
function listRegisteredTools(server: McpServer): Array<{ name: string; description: string }> {
  const registry = (server as unknown as {
    _registeredTools?: Record<string, { description?: string; enabled?: boolean }>;
  })._registeredTools ?? {};
  return Object.entries(registry)
    .filter(([, t]) => t?.enabled !== false)
    .map(([name, t]) => ({ name, description: t.description ?? "" }));
}

/**
 * Register all CBrowser tools on an MCP server instance.
 * Internal function - use createMcpServer() for the public API.
 */
async function registerCBrowserTools(): Promise<McpServer> {
  // Auto-initialize all data directories on server start
  ensureDirectories();

  const server = new McpServer({
    name: "cbrowser",
    version: VERSION,
  });

  // The shared tool set, the same registrar the hosted servers call. This file
  // used to hand-write its own copies of ~45 tools and import a few shared
  // families on top; every tool added to the shared path after the copy was
  // made never reached `npx cbrowser mcp-server` (measured 2026-10-21: stdio 82
  // tools, hosted 129, missing evaluate_script, hover, type_text, press_key,
  // drag, upload_file, handle_dialog, manage_*, page_understand, attention_*,
  // llms_txt_* and more), and the copies drifted (navigate here hardcoded
  // `success: true` long after the shared one forwarded the browser's verdict).
  //
  // Tier null = self-hosted: no tier gate, no credits. Hosted path and URL
  // refusals key on the hosted-mode flag, which only the remote server sets,
  // and screenshots stay file paths because remote mode is never set here.
  // registerAllPublicTools also attaches the security layer (audit log,
  // description scan, zone checks); it wraps this server object in place, so
  // the stdio-only tools registered below pass through it too.
  registerAllPublicTools(server, { getBrowser }, null);

  // The ui:// resources the canonical tools advertise via _meta.ui. Without
  // these the stdio server answered "Method not found" to resources/list while
  // its own tool pointed at ui://cbrowser/empathy, so a UI-capable host was
  // told a widget existed and could not fetch it.
  registerUiResources(server);

  // Only stdio-only tools below: session bridges whose state lives in this
  // process. Anything that exists on the shared path belongs there, not here.
  // compare_personas_record_result and compare_personas_summarize were removed
  // in 20.0.0: nothing created the session they looked up (the stdio
  // compare_personas_init went 2026-08-01 and the shared one returns no
  // sessionId), so both always answered "Session not found" (audit M, Alexa
  // 2026-10-21).

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

  // security_audit's self-scan reads this list. Without it the shared tool
  // falls back to fetching localhost:$PORT/mcp, which is not this process.
  setSecurityAuditToolList(listRegisteredTools(server));

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
