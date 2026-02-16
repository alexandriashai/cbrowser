/**
 * CBrowser MCP Tools - Marketing Tools
 *
 * 3 real marketing tools for MCP-orchestrated campaign workflows:
 * - marketing_personas_list: List marketing personas with value profiles
 * - marketing_campaign_create: Create a marketing campaign
 * - marketing_campaign_report_result: Report journey results to campaign
 *
 * Workflow:
 * 1. List personas → marketing_personas_list
 * 2. Create campaign → marketing_campaign_create
 * 3. Run journeys via cognitive_journey_init/update_state (MCP orchestrated)
 * 4. Report results → marketing_campaign_report_result
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "../types.js";
import {
  BUILTIN_PERSONAS,
  ACCESSIBILITY_PERSONAS,
  getAnyPersona,
  listAllPersonas,
} from "../../personas.js";
import type { PersonaValues } from "../../values/schwartz-values.js";
import { getPersonaValues } from "../../values/persona-values.js";

// ============================================================================
// Types
// ============================================================================

interface CampaignJourneyResult {
  persona: string;
  goalAchieved: boolean;
  steps: number;
  frictionPoints: string[];
  timestamp: string;
  duration?: number;
  abandonmentReason?: string;
}

interface Campaign {
  name: string;
  url: string;
  goal: string;
  createdAt: string;
  results: CampaignJourneyResult[];
}

interface CampaignsStore {
  campaigns: Record<string, Campaign>;
  lastUpdated: string;
}

// ============================================================================
// Storage Utilities
// ============================================================================

function getCampaignsPath(): string {
  const dataDir = process.env.CBROWSER_DATA_DIR || join(homedir(), ".cbrowser");
  return join(dataDir, "campaigns.json");
}

function ensureDataDir(): void {
  const dataDir = process.env.CBROWSER_DATA_DIR || join(homedir(), ".cbrowser");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

function loadCampaigns(): CampaignsStore {
  const path = getCampaignsPath();
  if (!existsSync(path)) {
    return { campaigns: {}, lastUpdated: new Date().toISOString() };
  }
  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as CampaignsStore;
  } catch {
    return { campaigns: {}, lastUpdated: new Date().toISOString() };
  }
}

function saveCampaigns(store: CampaignsStore): void {
  ensureDataDir();
  const path = getCampaignsPath();
  store.lastUpdated = new Date().toISOString();
  writeFileSync(path, JSON.stringify(store, null, 2));
}

// ============================================================================
// Persona Utilities
// ============================================================================

interface MarketingPersonaProfile {
  name: string;
  category: "cognitive" | "accessibility" | "general";
  description: string;
  values: PersonaValues;
  influenceSusceptibility: {
    scarcity: number;
    authority: number;
    socialProof: number;
    reciprocity: number;
    commitment: number;
    liking: number;
  };
}

function calculateInfluenceSusceptibility(values: PersonaValues): MarketingPersonaProfile["influenceSusceptibility"] {
  // Map Schwartz values to Cialdini's influence principles
  // Based on research correlations between values and persuasion susceptibility
  return {
    // Scarcity: driven by achievement, power, stimulation
    scarcity: Math.min(1, (values.achievement + values.power + values.stimulation) / 3 + 0.1),
    // Authority: driven by conformity, tradition, security
    authority: Math.min(1, (values.conformity + values.tradition + values.security) / 3 + 0.1),
    // Social proof: driven by conformity, benevolence, universalism
    socialProof: Math.min(1, (values.conformity + values.benevolence + values.universalism) / 3 + 0.1),
    // Reciprocity: driven by benevolence, universalism
    reciprocity: Math.min(1, (values.benevolence + values.universalism) / 2 + 0.1),
    // Commitment/consistency: driven by tradition, conformity, security
    commitment: Math.min(1, (values.tradition + values.conformity + values.security) / 3 + 0.1),
    // Liking: driven by benevolence, hedonism, stimulation
    liking: Math.min(1, (values.benevolence + values.hedonism + values.stimulation) / 3 + 0.1),
  };
}

function getMarketingPersonas(): MarketingPersonaProfile[] {
  const profiles: MarketingPersonaProfile[] = [];

  // Get built-in cognitive personas
  for (const [name, persona] of Object.entries(BUILTIN_PERSONAS)) {
    const values = getPersonaValues(name);
    if (values) {
      profiles.push({
        name: persona.name,
        category: "cognitive",
        description: persona.description,
        values,
        influenceSusceptibility: calculateInfluenceSusceptibility(values),
      });
    }
  }

  // Get accessibility personas
  for (const [name, persona] of Object.entries(ACCESSIBILITY_PERSONAS)) {
    const values = getPersonaValues(name);
    if (values) {
      profiles.push({
        name: persona.name,
        category: "accessibility",
        description: persona.description,
        values,
        influenceSusceptibility: calculateInfluenceSusceptibility(values),
      });
    }
  }

  return profiles;
}

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register marketing tools (3 tools)
 */
export function registerMarketingTools(server: McpServer): void {
  // =========================================================================
  // marketing_personas_list - List marketing personas with value profiles
  // =========================================================================

  server.tool(
    "marketing_personas_list",
    "List all available marketing personas with their Schwartz value profiles and Cialdini influence susceptibility scores. Use this to understand which personas to target in campaigns.",
    {},
    async () => {
      const personas = getMarketingPersonas();

      const summary = {
        totalPersonas: personas.length,
        byCategory: {
          cognitive: personas.filter(p => p.category === "cognitive").length,
          accessibility: personas.filter(p => p.category === "accessibility").length,
        },
        personas: personas.map(p => ({
          name: p.name,
          category: p.category,
          description: p.description,
          values: {
            // Show key values that affect marketing
            achievement: p.values.achievement.toFixed(2),
            security: p.values.security.toFixed(2),
            benevolence: p.values.benevolence.toFixed(2),
            conformity: p.values.conformity.toFixed(2),
            stimulation: p.values.stimulation.toFixed(2),
          },
          influenceSusceptibility: {
            scarcity: p.influenceSusceptibility.scarcity.toFixed(2),
            authority: p.influenceSusceptibility.authority.toFixed(2),
            socialProof: p.influenceSusceptibility.socialProof.toFixed(2),
            reciprocity: p.influenceSusceptibility.reciprocity.toFixed(2),
            commitment: p.influenceSusceptibility.commitment.toFixed(2),
            liking: p.influenceSusceptibility.liking.toFixed(2),
          },
        })),
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(summary, null, 2),
        }],
      };
    }
  );

  // =========================================================================
  // marketing_campaign_create - Create a marketing campaign
  // =========================================================================

  server.tool(
    "marketing_campaign_create",
    "Create a new marketing campaign for tracking cognitive journey results across personas. Returns campaign ID for use with marketing_campaign_report_result.",
    {
      name: z.string().describe("Unique campaign name (e.g., 'q1-signup-flow')"),
      url: z.string().url().describe("Target URL to analyze"),
      goal: z.string().describe("Goal to measure (e.g., 'Complete signup and reach dashboard')"),
    },
    async ({ name, url, goal }) => {
      const store = loadCampaigns();

      // Check if campaign already exists
      if (store.campaigns[name]) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: `Campaign '${name}' already exists. Use a different name or report results to the existing campaign.`,
              existingCampaign: {
                name: store.campaigns[name].name,
                url: store.campaigns[name].url,
                goal: store.campaigns[name].goal,
                createdAt: store.campaigns[name].createdAt,
                resultsCount: store.campaigns[name].results.length,
              },
            }, null, 2),
          }],
        };
      }

      // Create new campaign
      const campaign: Campaign = {
        name,
        url,
        goal,
        createdAt: new Date().toISOString(),
        results: [],
      };

      store.campaigns[name] = campaign;
      saveCampaigns(store);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            campaign: {
              name: campaign.name,
              url: campaign.url,
              goal: campaign.goal,
              createdAt: campaign.createdAt,
            },
            nextSteps: [
              "1. Use marketing_personas_list to see available personas",
              "2. For each persona, run cognitive_journey_init with the campaign URL and goal",
              "3. Orchestrate the journey with cognitive_journey_update_state",
              "4. When journey completes, call marketing_campaign_report_result with the outcome",
            ],
          }, null, 2),
        }],
      };
    }
  );

  // =========================================================================
  // marketing_campaign_report_result - Report journey result to campaign
  // =========================================================================

  server.tool(
    "marketing_campaign_report_result",
    "Report the result of a cognitive journey to a marketing campaign. Call this after completing a journey via cognitive_journey_init/update_state orchestration.",
    {
      campaign_name: z.string().describe("Campaign name from marketing_campaign_create"),
      persona: z.string().describe("Persona name that completed the journey"),
      goal_achieved: z.boolean().describe("Whether the persona achieved the campaign goal"),
      steps: z.number().int().positive().describe("Number of steps taken in the journey"),
      friction_points: z.array(z.string()).optional().describe("List of friction points encountered"),
      duration: z.number().optional().describe("Journey duration in seconds"),
      abandonment_reason: z.string().optional().describe("Reason for abandonment if goal not achieved"),
    },
    async ({ campaign_name, persona, goal_achieved, steps, friction_points, duration, abandonment_reason }) => {
      const store = loadCampaigns();

      // Check if campaign exists
      if (!store.campaigns[campaign_name]) {
        const availableCampaigns = Object.keys(store.campaigns);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: `Campaign '${campaign_name}' not found.`,
              availableCampaigns: availableCampaigns.length > 0 ? availableCampaigns : "No campaigns created yet. Use marketing_campaign_create first.",
            }, null, 2),
          }],
        };
      }

      const campaign = store.campaigns[campaign_name];

      // Add result
      const result: CampaignJourneyResult = {
        persona,
        goalAchieved: goal_achieved,
        steps,
        frictionPoints: friction_points || [],
        timestamp: new Date().toISOString(),
        duration,
        abandonmentReason: abandonment_reason,
      };

      campaign.results.push(result);
      saveCampaigns(store);

      // Calculate campaign stats
      const totalResults = campaign.results.length;
      const successCount = campaign.results.filter(r => r.goalAchieved).length;
      const conversionRate = totalResults > 0 ? (successCount / totalResults * 100).toFixed(1) : "0";
      const avgSteps = totalResults > 0
        ? (campaign.results.reduce((sum, r) => sum + r.steps, 0) / totalResults).toFixed(1)
        : "0";

      // Aggregate friction points
      const frictionCounts: Record<string, number> = {};
      for (const r of campaign.results) {
        for (const fp of r.frictionPoints) {
          frictionCounts[fp] = (frictionCounts[fp] || 0) + 1;
        }
      }
      const topFriction = Object.entries(frictionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([point, count]) => ({ point, count }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            resultRecorded: {
              persona,
              goalAchieved: goal_achieved,
              steps,
              frictionPoints: friction_points || [],
            },
            campaignStats: {
              name: campaign_name,
              totalJourneys: totalResults,
              successCount,
              conversionRate: `${conversionRate}%`,
              avgSteps,
              topFrictionPoints: topFriction,
            },
          }, null, 2),
        }],
      };
    }
  );
}
