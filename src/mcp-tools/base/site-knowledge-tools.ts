/**
 * CBrowser MCP Tools - Site Knowledge Tools
 * Page understanding, site model learning, and site profile management.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 * @since v18.35.0
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import { refuseUnboundSession } from "../session-policy.js";

/**
 * Register site knowledge tools (7 tools: page_understand, site_model_status, site_model_query,
 * site_profile_list, site_profile_delete, site_profile_status, question_answer)
 */
export function registerSiteKnowledgeTools(
  server: McpServer,
  { getBrowser, getBrowserByToken }: ToolRegistrationContext
): void {
  // ---------------------------------------------------------------------------
  // Tool 1: page_understand
  // ---------------------------------------------------------------------------

  server.registerTool("page_understand", {
    title: "Page Understanding Analysis",
    description: "Analyze the current page to understand its type, available actions, form structure, and navigation. Returns a rich page model with affordances, structure, and element relationships. Useful before interacting with a page to know what's possible. SCOPE: defaults to 'auto', which reads the whole document on small pages and silently falls back to the viewport above 1000 elements — the response reports which one ran. Pass scope='full_page' to count everything regardless of size.",
    inputSchema: {
      _browserToken: z.string().optional().describe("Browser session token from a previous tool call. Pass this to analyze the same page you navigated to."),
      scope: z.enum(["auto", "viewport", "full_page"]).optional().default("auto").describe("What to extract: 'auto' (default, historical behaviour — whole document unless the page exceeds 1000 elements, then viewport), 'viewport' (first screenful plus landmarks), or 'full_page' (scroll for lazy content and count everything). Check `extractionScope` in the response for what actually ran."),
    },
    annotations: {
      title: "Page Understanding Analysis",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ _browserToken, scope }) => {
      try {
        // Classifies "the current page". Unbound it classifies about:blank and
        // still returns a confident page type and affordance list.
        const unbound = refuseUnboundSession("page_understand", { getBrowserByToken }, _browserToken);
        if (unbound) return unbound;

        let b: Awaited<ReturnType<typeof getBrowser>>;
        let token: string | undefined;
        if (getBrowserByToken) {
          const result = await getBrowserByToken(_browserToken);
          b = result.browser;
          token = result.token;
        } else {
          b = await getBrowser();
        }

        const page = await b.getPage();
        const { PageUnderstandingEngine } = await import("../../analysis/page-understanding.js");
        const engine = new PageUnderstandingEngine();
        const understanding = await engine.analyze(page, scope ?? "auto");

        // Record a structural fingerprint. SiteModelManager.updateFingerprint was
        // fully implemented and had ZERO callers anywhere, so model.fingerprints
        // was never written and the pageFingerprints stat could only ever report
        // 0 — which is exactly what it did after any number of journeys and
        // audits. page_understand is the natural writer: it already computes the
        // heading structure, form count, nav groups, CTA count and page type that
        // a fingerprint is made of. (2026-07-29)
        try {
          const u = new URL(understanding.url);
          // Collapse numeric and uuid-ish path segments so /post/1 and /post/2
          // share a fingerprint, which is the point of a URL pattern.
          const urlPattern = u.pathname
            .split("/")
            .map((seg) => (/^\d+$/.test(seg) || /^[0-9a-f-]{16,}$/i.test(seg) ? ":id" : seg))
            .join("/") || "/";
          const headingLabels = (function walk(nodes: Array<{ level?: number; children?: unknown[] }>): string[] {
            if (!nodes || nodes.length === 0) return [];
            return nodes.flatMap((n) => [
              `h${n.level ?? "?"}`,
              ...walk((n.children as Array<{ level?: number; children?: unknown[] }>) || []),
            ]);
          })(understanding.structure.headingHierarchy);
          // Cheap stable hash — this only needs to change when the structure does.
          let headingHash = 0;
          for (const ch of headingLabels.join(">")) {
            headingHash = ((headingHash << 5) - headingHash + ch.charCodeAt(0)) | 0;
          }
          const { SiteModelManager } = await import("../../site-model/manager.js");
          SiteModelManager.getInstance().updateFingerprint(
            u.hostname,
            urlPattern,
            String(headingHash),
            understanding.structure.forms.length,
            understanding.structure.navigation.length,
            understanding.structure.ctas.length,
            understanding.type,
          );
        } catch { /* a fingerprint is not worth failing the analysis over */ }

        // Persist what was just discovered. Affordances came back fully formed —
        // selector, action, confidence — and were previously thrown away, so
        // trackedElements never grew and the workflow site_model_status
        // recommends produced a graph node and nothing a persona could use.
        //
        // Discovery only: entries land with zero attempts, and an element that
        // has since accumulated real outcomes is not reset by rediscovery.
        let elementsLearned = 0;
        try {
          const { SiteModelManager } = await import("../../site-model/manager.js");
          const siteModel = SiteModelManager.getInstance();
          const selectors = understanding.affordances
            .map((a) => a.element)
            .filter((sel): sel is string => typeof sel === "string" && sel.length > 0);
          if (selectors.length > 0) {
            elementsLearned = siteModel.recordDiscoveredElements(
              new URL(understanding.url).hostname,
              understanding.url,
              selectors,
            );
          }
        } catch { /* a page model is still useful when the store is unavailable */ }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  url: understanding.url,
                  type: understanding.type,
                  // What was actually measured. Without this the counts below
                  // are unreadable: on a page above the element cap they
                  // describe the first screenful, on a smaller page the whole
                  // document, and the response looked identical either way.
                  extractionScope: understanding.extractionScope,
                  pageScreens: understanding.pageScreens,
                  totalElements: understanding.totalElements,
                  scopeNote: understanding.extractionScope === "viewport"
                    ? `VIEWPORT ONLY: counts below describe the first screenful plus landmarks, out of ${understanding.totalElements} elements across ${understanding.pageScreens} screens. Pass scope='full_page' to count the whole document.`
                    : `Whole document: ${understanding.totalElements} elements across ${understanding.pageScreens} screens.`,
                  affordanceCount: understanding.affordances.length,
                  // How many of those were NEW to the site model, so a caller can
                  // tell learning from re-reading.
                  elementsLearned,
                  formCount: understanding.structure.forms.length,
                  ctaCount: understanding.structure.ctas.length,
                  navigationGroups: understanding.structure.navigation.length,
                  // Was headingHierarchy.length, which counts ROOT headings, not
                  // depth: a page with h1 > h2 > h3 reported 1, and a page with
                  // five sibling h2s and no h1 reported 5. Measure the actual
                  // nesting depth of the tree. (2026-07-29)
                  headingDepth: (function depth(nodes: Array<{ children?: unknown[] }>): number {
                    if (!nodes || nodes.length === 0) return 0;
                    return 1 + Math.max(...nodes.map((n) => depth((n.children as Array<{ children?: unknown[] }>) || [])));
                  })(understanding.structure.headingHierarchy),
                  relationshipCount: understanding.relationships.length,
                  computeTimeMs: understanding.computeTimeMs,
                  topAffordances: understanding.affordances.slice(0, 20).map((a) => ({
                    element: a.element,
                    text: a.elementText,
                    action: a.action,
                    expectedOutcome: a.expectedOutcome,
                    confidence: a.confidence,
                    reversible: a.reversible,
                  })),
                  forms: understanding.structure.forms.map((f) => ({
                    label: f.label,
                    fieldCount: f.fields.length,
                    action: f.action,
                    method: f.method,
                    hasSubmitButton: !!f.submitButton,
                  })),
                  ctas: understanding.structure.ctas.map((c) => ({
                    text: c.text,
                    prominence: c.prominence,
                    type: c.type,
                  })),
                  ...(token ? { _browserToken: token } : {}),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: err instanceof Error ? err.message : String(err),
                  hint: "Ensure a page is loaded before calling page_understand. Navigate to a URL first.",
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Tool 2: site_model_status
  // ---------------------------------------------------------------------------

  server.registerTool("site_model_status", {
    title: "Site Model Status",
    description: "Check if site knowledge exists for a domain. Run this BEFORE using high-familiarity personas (power-user, confident-user) to verify site knowledge is available. Returns navigation graph stats, element reliability scores, known goal paths, and failure patterns. If empty, run page_understand or navigate the site to build knowledge.",
    inputSchema: {
      domain: z.string().describe("Domain to check (e.g., 'example.com')"),
    },
    annotations: {
      title: "Site Model Status",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ domain }) => {
      try {
        const { SiteModelManager } = await import("../../site-model/manager.js");
        const manager = SiteModelManager.getInstance();
        const stats = await manager.getModelStats(domain);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  domain,
                  error: err instanceof Error ? err.message : String(err),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Tool 3: site_model_query
  // ---------------------------------------------------------------------------

  server.registerTool("site_model_query", {
    title: "Query Site Model",
    description: "Query the site model for the best known path to achieve a goal on a domain. Pass a natural-language `goal` (preferred) and it is classified and planned for you; pass `goalType` if you already know the category. Returns the most successful action sequence if one exists, plus a plan when a goal is given.",
    inputSchema: {
      domain: z.string().describe("Domain to query (e.g., 'example.com')"),
      // Natural language is the shape a caller actually has. Requiring the enum
      // meant the caller had to do the classification the planner exists to do,
      // which is why GoalDecomposer -- the component that does it -- had no
      // route onto the tool surface at all.
      goal: z.string().optional()
        .describe("Natural-language goal, e.g. 'sign up for an account'. Classified into a goalType and planned against learned paths. Preferred over goalType."),
      goalType: z.enum([
        "find_information",
        "complete_action",
        "navigate_to",
        "fill_form",
        "compare",
        "explore",
        "extract_data",
      ]).optional().describe("Goal category, when you already know it. Ignored if `goal` is given."),
    },
    annotations: {
      title: "Query Site Model",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ domain, goal, goalType }) => {
      // Declared outside the try so the catch block can report which goal type
      // was actually resolved, not just the raw input.
      let resolvedType = goalType;
      try {
        const { SiteModelManager } = await import("../../site-model/manager.js");
        const manager = SiteModelManager.getInstance();
        await manager.loadModel(domain);

        // GoalDecomposer was exported and never constructed anywhere in src/,
        // so `decompose()` -- the half that READS learned paths and reuses any
        // above SITE_MODEL_MIN_SUCCESS_RATE -- could not run. goalPaths were
        // therefore write-only: recorded by the autonomous-journey path, never
        // consulted by anything. A learning loop with no reader is a log.
        //
        // This is the read side wired onto the tool surface. `goal` also removes
        // the enum requirement that made the tool unusable without the
        // classification it exists to perform. (2026-08-05)
        let plan: unknown;
        let parsedGoal: unknown;
        if (goal) {
          const { GoalDecomposer } = await import("../../cognitive/goal-decomposer.js");
          const decomposer = new GoalDecomposer(manager);
          const parsed = decomposer.parseGoal(goal);
          parsedGoal = parsed;
          resolvedType = parsed.type;
          const decomposed = await decomposer.decompose(goal, domain);
          plan = {
            // `source: "site-model"` is the whole point — it means this plan
            // reused a path the model LEARNED rather than a keyword heuristic.
            source: decomposed.source,
            confidence: decomposed.confidence,
            estimatedSteps: decomposed.estimatedSteps,
            subGoals: decomposed.subGoals.map((sg) => ({
              description: sg.description,
              strategyCount: sg.strategies?.length ?? 0,
              topStrategy: sg.strategies?.[0],
            })),
          };
        }
        if (!resolvedType) {
          return {isError: true,  content: [{ type: "text" as const, text: JSON.stringify({
            error: "goal_or_goalType_required",
            message: "Pass `goal` (natural language, preferred) or `goalType` (enum).",
          }, null, 2) }] };
        }
        const bestPath = manager.queryBestPath(domain, resolvedType);

        if (!bestPath) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    domain,
                    goalType: resolvedType,
                    ...(parsedGoal ? { parsedGoal } : {}),
                    found: false,
                    // A plan is still useful with no learned path — that is the
                    // heuristic branch, and saying so distinguishes "we have
                    // nothing" from "we have nothing LEARNED".
                    ...(plan ? { plan } : {}),
                    message: `No learned path for goal type '${resolvedType}' on ${domain}.`
                      + (plan ? " A heuristic plan is included; the site model learns paths as you interact with the site."
                             : " The site model will learn paths as you interact with the site."),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  domain,
                  goalType: resolvedType,
                  ...(parsedGoal ? { parsedGoal } : {}),
                  // The plan is what makes a learned path actionable rather
                  // than merely visible.
                  ...(plan ? { plan } : {}),
                  found: true,
                  path: {
                    goalDescription: bestPath.goalDescription,
                    successRate: bestPath.successRate,
                    attemptCount: bestPath.attemptCount,
                    averageSteps: bestPath.averageSteps,
                    lastUsed: new Date(bestPath.lastUsed).toISOString(),
                    actionSequence: bestPath.actionSequence,
                    personaPerformance: bestPath.personaPerformance,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  domain,
                  goalType: resolvedType ?? goalType,
                  error: err instanceof Error ? err.message : String(err),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Tool 4: site_profile_list
  // ---------------------------------------------------------------------------

  server.registerTool("site_profile_list", {
    title: "List Site Profiles",
    description: "List all persistent site profiles (saved browser state per domain). Shows which sites have saved cookies, localStorage, and auth state.",
    inputSchema: {},
    annotations: {
      title: "List Site Profiles",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async () => {
      try {
        const { SiteProfileManager } = await import("../../browser/site-profile-manager.js");
        const manager = new SiteProfileManager();
        const profiles = await manager.listProfiles();

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  profileCount: profiles.length,
                  profiles: profiles.map((p) => ({
                    domain: p.domain,
                    lastUsed: p.lastUsed,
                    cookieCount: p.cookieCount,
                    authStatus: p.authStatus,
                    sizeBytes: p.sizeBytes,
                    healthy: p.healthy,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: err instanceof Error ? err.message : String(err),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Tool 5: site_profile_delete
  // ---------------------------------------------------------------------------

  server.registerTool("site_profile_delete", {
    title: "Delete Site Profile",
    description: "Delete a persistent site profile for a domain. Removes saved cookies, localStorage, and auth state.",
    inputSchema: {
      domain: z.string().describe("Domain whose profile to delete (e.g., 'example.com')"),
    },
    annotations: {
      title: "Delete Site Profile",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ domain }) => {
      try {
        const { SiteProfileManager } = await import("../../browser/site-profile-manager.js");
        const manager = new SiteProfileManager();
        const deleted = await manager.deleteProfile(domain);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: deleted,
                  domain,
                  message: deleted
                    ? `Profile for '${domain}' deleted successfully`
                    : `No profile found for '${domain}'`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  domain,
                  error: err instanceof Error ? err.message : String(err),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Tool 6: site_profile_status
  // ---------------------------------------------------------------------------

  server.registerTool("site_profile_status", {
    title: "Site Profile Health",
    description: "Check the health of a site profile. Shows cookie count, expiry status, auth state, and whether the profile is still usable.",
    inputSchema: {
      domain: z.string().describe("Domain to check (e.g., 'example.com')"),
    },
    annotations: {
      title: "Site Profile Health",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ domain }) => {
      try {
        const { SiteProfileManager } = await import("../../browser/site-profile-manager.js");
        const manager = new SiteProfileManager();
        const health = await manager.getProfileHealth(domain);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(health, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  domain,
                  error: err instanceof Error ? err.message : String(err),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Tool 7: question_answer — ask questions about CBrowser
  // ---------------------------------------------------------------------------

  server.registerTool("question_answer", {
    title: "Ask About CBrowser",
    description: "Ask any question about CBrowser tools, features, personas, traits, scores, or workflows. Queries the CBrowser knowledge base (289 pages of documentation) and returns a grounded answer. Use this when you need to understand what a tool does, what a score means, how to use a feature, or how tools work together.",
    inputSchema: {
      question: z.string().describe("Your question about CBrowser (e.g., 'What does empathy_audit measure?', 'How do I test mobile accessibility?', 'What is CTC?', 'Which persona should I use for elderly users?')"),
      context: z.string().optional().describe("Optional context — the URL being tested, the tool being used, or the scores you're seeing"),
    },
    annotations: {
      title: "Ask About CBrowser",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ question, context }) => {
    const cmsUrl = process.env.CMS_URL || "http://localhost:3200";
    const { getActiveKeyHash } = await import("../../mcp-tools/tier-gate.js");
    const keyHash = getActiveKeyHash();

    try {
      const res = await fetch(`${cmsUrl}/api/ai/question`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(keyHash ? { Authorization: `Bearer ${keyHash}` } : {}),
        },
        body: JSON.stringify({ question, context }),
      });

      if (!res.ok) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Knowledge base query failed (${res.status})`, question }, null, 2) }],
        };
      }

      const data = await res.json() as { answer: string; sources: string[] };

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            question,
            answer: data.answer,
            sources: data.sources,
            note: "Answer grounded in CBrowser documentation (289 pages). Sources listed for reference.",
          }, null, 2),
        }],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: JSON.stringify({
          error: "Could not reach CBrowser knowledge base",
          question,
          suggestion: "Try rephrasing or check https://cbrowser.ai/docs for documentation",
        }, null, 2) }],
      };
    }
  });
}
