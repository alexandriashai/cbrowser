/**
 * CBrowser MCP Tools - Enterprise Stubs
 *
 * 22 stub tools that return upgrade messages for Enterprise-only features:
 * - API Key Management (3): set_api_key, clear_api_key, api_key_status
 * - API Key Prompt (1): get_api_key_prompt
 * - Autonomous Journey (1): cognitive_journey_autonomous
 * - Marketing Core (8): marketing_campaign_create, marketing_campaign_run,
 *   marketing_campaign_influence_matrix, marketing_campaign_levers, marketing_funnel_analysis,
 *   marketing_competitive_compare, marketing_personas_list, marketing_report_result
 * - Marketing Discovery (2): marketing_audience_discover, marketing_audience_discover_status
 * - Stealth (7): stealth_status, stealth_enable, stealth_disable, stealth_check,
 *   stealth_diagnose, cloudflare_detect, cloudflare_wait
 *
 * @copyright 2026 Alexa Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer } from "./types.js";

/**
 * Standard upgrade message for enterprise features
 */
function enterpriseUpgradeMessage(feature: string, description?: string): {
  available: false;
  feature: string;
  message: string;
  description?: string;
  upgrade_info: string;
  contact: string;
} {
  return {
    available: false,
    feature,
    message: `${feature} requires CBrowser Enterprise.`,
    description,
    upgrade_info: "https://github.com/alexandriashai/cbrowser/wiki/Enterprise",
    contact: "alexandria.shai.eden@gmail.com",
  };
}

/**
 * Register enterprise stub tools (22 stubs)
 */
export function registerEnterpriseStubs(server: McpServer): void {
  // =========================================================================
  // API Key Management Stubs (3)
  // =========================================================================

  server.tool(
    "set_api_key",
    "[Enterprise] Store your Anthropic API key for autonomous journey execution.",
    {
      api_key: z.string().describe("Your Anthropic API key (starts with sk-ant-)"),
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "API Key Management",
          "Store API keys for autonomous cognitive journey execution on the server."
        ), null, 2),
      }],
    })
  );

  server.tool(
    "clear_api_key",
    "[Enterprise] Remove your stored Anthropic API key from session memory.",
    {},
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "API Key Management",
          "Clear stored API keys from session memory."
        ), null, 2),
      }],
    })
  );

  server.tool(
    "api_key_status",
    "[Enterprise] Check if an Anthropic API key is configured for autonomous journey execution.",
    {},
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "API Key Management",
          "Check API key configuration status for autonomous journeys."
        ), null, 2),
      }],
    })
  );

  // =========================================================================
  // API Key Prompt Stub (1)
  // =========================================================================

  server.tool(
    "get_api_key_prompt",
    "[Enterprise] Generate a prompt to ask the user for their API key for autonomous execution.",
    {
      tool_name: z.string().describe("The tool that needs the API key"),
      journey_count: z.number().optional().describe("Number of journeys to estimate cost"),
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "Autonomous Journey Execution",
          "Generate API key prompts with cost estimates for autonomous journey execution."
        ), null, 2),
      }],
    })
  );

  // =========================================================================
  // Autonomous Journey Stub (1)
  // =========================================================================

  server.tool(
    "cognitive_journey_autonomous",
    "[Enterprise] Run a complete cognitive journey autonomously on the server, returning full results.",
    {
      persona: z.string().describe("Persona name to simulate"),
      start_url: z.string().url().describe("Starting URL for the journey"),
      goal: z.string().describe("Goal to accomplish"),
      max_steps: z.number().optional().describe("Maximum steps (default: 30)"),
      max_time: z.number().optional().describe("Maximum time in seconds (default: 120)"),
      vision: z.boolean().optional().describe("Enable vision mode (default: true)"),
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "Autonomous Cognitive Journeys",
          "Run complete cognitive journeys server-side without step-by-step orchestration. Requires API key storage."
        ), null, 2),
      }],
    })
  );

  // =========================================================================
  // Marketing Core Stubs (8) - campaign management and influence analysis
  // =========================================================================

  server.tool(
    "marketing_campaign_create",
    "[Enterprise] Create a new marketing campaign for influence and persuasion analysis.",
    {
      name: z.string().describe("Campaign name"),
      url: z.string().url().describe("Target URL to analyze"),
      goal: z.string().describe("Campaign goal (e.g., 'sign up for free trial')"),
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "Marketing Suite",
          "Create and manage marketing campaigns with influence pattern analysis."
        ), null, 2),
      }],
    })
  );

  server.tool(
    "marketing_campaign_run",
    "[Enterprise] Execute a marketing campaign by running cognitive journeys for all variants and personas.",
    {
      campaign_id: z.string().describe("Campaign ID from marketing_campaign_create"),
      parallel: z.boolean().optional().describe("Run journeys in parallel (default: true)"),
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "Marketing Suite - Campaign Execution",
          "Run cognitive journeys across all variant/persona combinations."
        ), null, 2),
      }],
    })
  );

  server.tool(
    "marketing_campaign_influence_matrix",
    "[Enterprise] Generate an influence pattern matrix for a campaign showing persona susceptibility.",
    {
      campaign_name: z.string().describe("Name of the campaign to analyze"),
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "Marketing Suite - Influence Matrix",
          "Visualize which influence patterns work best for different personas."
        ), null, 2),
      }],
    })
  );

  server.tool(
    "marketing_campaign_levers",
    "[Enterprise] Analyze actionable persuasion levers for a campaign.",
    {
      campaign_name: z.string().describe("Name of the campaign to analyze"),
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "Marketing Suite - Lever Analysis",
          "Get actionable recommendations for improving conversion through influence patterns."
        ), null, 2),
      }],
    })
  );

  server.tool(
    "marketing_funnel_analysis",
    "[Enterprise] Analyze conversion funnel for a campaign across all personas.",
    {
      campaign_name: z.string().describe("Name of the campaign to analyze"),
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "Marketing Suite - Funnel Analysis",
          "Analyze drop-off points and friction in the conversion funnel."
        ), null, 2),
      }],
    })
  );

  server.tool(
    "marketing_competitive_compare",
    "[Enterprise] Compare your conversion funnel against competitors.",
    {
      campaign_name: z.string().describe("Your campaign name"),
      competitor_urls: z.array(z.string().url()).describe("Competitor URLs to compare"),
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "Marketing Suite - Competitive Analysis",
          "Run cognitive journeys on competitor sites and compare conversion effectiveness."
        ), null, 2),
      }],
    })
  );

  server.tool(
    "marketing_personas_list",
    "[Enterprise] List all available marketing personas with their value profiles.",
    {},
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "Marketing Suite - Persona Library",
          "Access marketing-focused personas with detailed influence susceptibility profiles."
        ), null, 2),
      }],
    })
  );

  server.tool(
    "marketing_report_result",
    "[Enterprise] Report the result of a cognitive journey for campaign analysis.",
    {
      campaign_name: z.string().describe("Campaign name"),
      persona: z.string().describe("Persona name"),
      goal_achieved: z.boolean().describe("Whether the goal was achieved"),
      steps: z.number().describe("Number of steps taken"),
      friction_points: z.array(z.string()).optional().describe("Friction points encountered"),
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "Marketing Suite - Result Reporting",
          "Report journey results to build campaign analytics."
        ), null, 2),
      }],
    })
  );

  // =========================================================================
  // Marketing Discovery Stubs (2)
  // =========================================================================

  server.tool(
    "marketing_audience_discover",
    "[Enterprise] Autonomous audience discovery - run cognitive journeys across randomized personas.",
    {
      url: z.string().url().describe("URL to analyze"),
      goal: z.string().describe("Goal to accomplish"),
      persona_count: z.number().optional().describe("Number of randomized personas (default: 10)"),
      max_concurrency: z.number().optional().describe("Max parallel journeys (default: 3)"),
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "Marketing Suite - Audience Discovery",
          "Run autonomous cognitive journeys across randomized personas to discover which user types convert best."
        ), null, 2),
      }],
    })
  );

  server.tool(
    "marketing_audience_discover_status",
    "[Enterprise] Check status of a running audience discovery job.",
    {
      job_id: z.string().describe("Job ID from marketing_audience_discover"),
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "Marketing Suite - Discovery Status",
          "Track progress of autonomous audience discovery jobs."
        ), null, 2),
      }],
    })
  );

  // =========================================================================
  // Stealth Stubs (7)
  // =========================================================================

  server.tool(
    "stealth_status",
    "[Enterprise] Check the current stealth mode configuration and status.",
    {},
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "Stealth Mode",
          "Check stealth configuration for bot detection evasion."
        ), null, 2),
      }],
    })
  );

  server.tool(
    "stealth_enable",
    "[Enterprise] Enable stealth mode to evade bot detection.",
    {
      level: z.enum(["low", "medium", "high", "maximum"]).optional().describe("Stealth level (default: medium)"),
      proxy: z.string().optional().describe("Proxy server URL"),
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "Stealth Mode",
          "Enable bot detection evasion with configurable stealth levels and proxy support."
        ), null, 2),
      }],
    })
  );

  server.tool(
    "stealth_disable",
    "[Enterprise] Disable stealth mode.",
    {},
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "Stealth Mode",
          "Disable stealth features and return to standard browser fingerprint."
        ), null, 2),
      }],
    })
  );

  server.tool(
    "stealth_check",
    "[Enterprise] Run a comprehensive stealth check against bot detection systems.",
    {
      url: z.string().url().optional().describe("URL to test against (uses default detection sites if not specified)"),
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "Stealth Mode - Detection Check",
          "Test current browser fingerprint against bot detection systems."
        ), null, 2),
      }],
    })
  );

  server.tool(
    "stealth_diagnose",
    "[Enterprise] Diagnose stealth issues and get recommendations.",
    {},
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "Stealth Mode - Diagnostics",
          "Get detailed diagnostics and recommendations for improving stealth effectiveness."
        ), null, 2),
      }],
    })
  );

  server.tool(
    "cloudflare_detect",
    "[Enterprise] Detect if a page is protected by Cloudflare and identify the challenge type.",
    {
      url: z.string().url().describe("URL to check"),
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "Cloudflare Detection",
          "Detect Cloudflare protection and identify challenge types (Turnstile, JS Challenge, etc.)."
        ), null, 2),
      }],
    })
  );

  server.tool(
    "cloudflare_wait",
    "[Enterprise] Wait for Cloudflare challenge to complete with intelligent detection.",
    {
      url: z.string().url().describe("URL with Cloudflare challenge"),
      timeout: z.number().optional().describe("Timeout in milliseconds (default: 30000)"),
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify(enterpriseUpgradeMessage(
          "Cloudflare Bypass",
          "Intelligently wait for Cloudflare challenges to complete before proceeding."
        ), null, 2),
      }],
    })
  );
}
