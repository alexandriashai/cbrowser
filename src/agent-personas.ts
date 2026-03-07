/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * AI Agent Personas for CBrowser
 *
 * Agent personas represent different AI automation patterns with specific
 * behavioral traits. Unlike human personas, agents don't have emotions -
 * they have retry budgets, selector strategies, and exploration patterns.
 *
 * @since 17.0.0
 */

import type {
  AgentPersona,
  AgentTraits,
  AgentJourneyState,
} from "./types.js";

// ============================================================================
// Built-in Agent Personas
// ============================================================================

/**
 * Retrieval Agent
 *
 * Optimized for extracting information from pages. Uses text-based selection
 * for robustness across different sites. High ambiguity tolerance allows
 * it to work with imperfect matches.
 *
 * Use cases:
 * - Content extraction and summarization
 * - Data collection from multiple sources
 * - Research automation
 */
const RETRIEVAL_AGENT: AgentPersona = {
  name: "retrieval-agent",
  description: "Content extraction specialist - finds and extracts information efficiently",
  useCase: "retrieval",
  domains: ["news", "documentation", "research", "data-collection"],
  agentTraits: {
    selectorStrategy: "text",
    contextWindow: 32000,
    retryBudget: 3,
    backtrackWillingness: 0.3, // Low - commits to extraction paths
    explorationVsBreadth: 0.7, // Moderate breadth - covers more content
    ambiguityTolerance: 0.8,   // High - works with fuzzy matches
    errorRecovery: 0.7,        // Good recovery - continues despite missing elements
    domainKnowledge: "general",
    multiModalCapability: false,
  },
};

/**
 * Task Completion Agent
 *
 * Optimized for completing specific tasks like form filling, account creation,
 * or checkout flows. Uses ARIA-based selection for robustness with accessible
 * sites. Low ambiguity tolerance ensures accurate form interactions.
 *
 * Use cases:
 * - Form submission automation
 * - Account registration
 * - E-commerce checkout
 * - Settings configuration
 */
const TASK_COMPLETION_AGENT: AgentPersona = {
  name: "task-completion-agent",
  description: "Task execution specialist - completes forms and multi-step workflows",
  useCase: "task-completion",
  domains: ["e-commerce", "saas", "forms", "authentication"],
  agentTraits: {
    selectorStrategy: "aria",
    contextWindow: 16000,
    retryBudget: 5,            // Higher retries for form reliability
    backtrackWillingness: 0.6, // Moderate - will retry failed form steps
    explorationVsBreadth: 0.2, // Depth-first - follows task flow
    ambiguityTolerance: 0.2,   // Low - needs exact matches for forms
    errorRecovery: 0.8,        // High - must recover from validation errors
    domainKnowledge: "general",
    multiModalCapability: false,
  },
};

/**
 * Crawl Agent
 *
 * Optimized for site-wide indexing and discovery. Uses CSS-based selection
 * for speed. Breadth-first exploration to cover maximum pages efficiently.
 * High backtrack willingness to explore all branches.
 *
 * Use cases:
 * - Site mapping and indexing
 * - Link discovery
 * - Content inventory
 * - SEO auditing
 */
const CRAWL_AGENT: AgentPersona = {
  name: "crawl-agent",
  description: "Site exploration specialist - maps and indexes entire sites efficiently",
  useCase: "crawling",
  domains: ["seo", "indexing", "discovery", "mapping"],
  agentTraits: {
    selectorStrategy: "css",
    contextWindow: 8000,       // Lower context - focuses on structure, not content
    retryBudget: 2,            // Low - moves on quickly from failures
    backtrackWillingness: 0.9, // Very high - explores all branches
    explorationVsBreadth: 0.9, // Breadth-first - cover all links at each level
    ambiguityTolerance: 0.5,   // Moderate - selective about what to crawl
    errorRecovery: 0.6,        // Moderate - skips broken pages gracefully
    domainKnowledge: "none",   // Pure structure-based crawling
    multiModalCapability: false,
  },
};

/**
 * Conversational Agent
 *
 * Optimized for dialogue-driven interactions like chatbots, support systems,
 * or AI assistants. Uses text-based selection with multimodal capability
 * for rich understanding. High domain knowledge for contextual responses.
 *
 * Use cases:
 * - Customer support automation
 * - Chatbot testing
 * - Interactive form assistance
 * - Voice UI testing
 */
const CONVERSATIONAL_AGENT: AgentPersona = {
  name: "conversational-agent",
  description: "Dialogue specialist - handles conversational UI and chat interactions",
  useCase: "conversation",
  domains: ["support", "chatbot", "assistant", "voice-ui"],
  agentTraits: {
    selectorStrategy: "text",
    contextWindow: 64000,      // High - maintains conversation context
    retryBudget: 4,
    backtrackWillingness: 0.5, // Moderate - can restart conversations
    explorationVsBreadth: 0.4, // Balanced - follows dialogue flow
    ambiguityTolerance: 0.7,   // High - handles varied user inputs
    errorRecovery: 0.9,        // Very high - must maintain conversation
    domainKnowledge: "specialized",
    multiModalCapability: true, // Can process visual context
  },
};

// ============================================================================
// Agent Personas Registry
// ============================================================================

/**
 * Built-in agent personas registry.
 * Keys are persona names, values are AgentPersona definitions.
 */
export const AGENT_PERSONAS: Record<string, AgentPersona> = {
  "retrieval-agent": RETRIEVAL_AGENT,
  "task-completion-agent": TASK_COMPLETION_AGENT,
  "crawl-agent": CRAWL_AGENT,
  "conversational-agent": CONVERSATIONAL_AGENT,
};

// ============================================================================
// Agent Journey State Management
// ============================================================================

/**
 * Create initial journey state for an agent.
 * Unlike human emotional state, this tracks retries and exploration.
 */
export function createAgentJourneyState(traits: AgentTraits): AgentJourneyState {
  return {
    actionCount: 0,
    retriesRemaining: traits.retryBudget,
    selectorFailures: 0,
    backtrackCount: 0,
    ambiguityEncountered: 0,
    visitedPaths: new Set<string>(),
    loopDetected: false,
    depth: 0,
  };
}

/**
 * Update agent state after an action.
 * Returns updated state and whether agent should continue.
 */
export function updateAgentState(
  state: AgentJourneyState,
  traits: AgentTraits,
  event: {
    type: "success" | "failure" | "ambiguous" | "backtrack";
    path?: string;
  }
): { state: AgentJourneyState; shouldContinue: boolean; reason?: string } {
  const newState = { ...state };
  newState.actionCount++;

  switch (event.type) {
    case "success":
      // Reset retry budget on success
      newState.retriesRemaining = traits.retryBudget;
      if (event.path) {
        // Check for loops
        if (newState.visitedPaths.has(event.path)) {
          newState.loopDetected = true;
        }
        newState.visitedPaths.add(event.path);
      }
      break;

    case "failure":
      newState.selectorFailures++;
      newState.retriesRemaining--;
      if (newState.retriesRemaining <= 0) {
        return {
          state: newState,
          shouldContinue: false,
          reason: "Retry budget exhausted",
        };
      }
      break;

    case "ambiguous":
      newState.ambiguityEncountered++;
      // Low ambiguity tolerance agents fail on ambiguous situations
      if (newState.ambiguityEncountered > 3 && traits.ambiguityTolerance < 0.3) {
        return {
          state: newState,
          shouldContinue: false,
          reason: "Too many ambiguous situations for low-tolerance agent",
        };
      }
      break;

    case "backtrack":
      newState.backtrackCount++;
      newState.depth = Math.max(0, newState.depth - 1);
      // Low backtrack willingness agents fail after too many backtracks
      if (newState.backtrackCount > 5 && traits.backtrackWillingness < 0.3) {
        return {
          state: newState,
          shouldContinue: false,
          reason: "Backtrack limit reached for low-willingness agent",
        };
      }
      break;
  }

  // Check for loops
  if (newState.loopDetected && newState.actionCount > 10) {
    return {
      state: newState,
      shouldContinue: false,
      reason: "Loop detected - agent is repeating actions",
    };
  }

  return { state: newState, shouldContinue: true };
}

/**
 * Get agent persona by name.
 */
export function getAgentPersona(name: string): AgentPersona | undefined {
  return AGENT_PERSONAS[name];
}

/**
 * List all available agent persona names.
 */
export function listAgentPersonas(): string[] {
  return Object.keys(AGENT_PERSONAS);
}

/**
 * Check if a persona name is an agent persona.
 */
export function isAgentPersona(name: string): boolean {
  return name in AGENT_PERSONAS;
}

/**
 * Type guard to check if a persona object is an AgentPersona.
 * Use this to filter agent personas when code doesn't support them.
 */
export function isAgentPersonaObject(
  persona: unknown
): persona is AgentPersona {
  return (
    typeof persona === "object" &&
    persona !== null &&
    "agentTraits" in persona &&
    "useCase" in persona
  );
}
