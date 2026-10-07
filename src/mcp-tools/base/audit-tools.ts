/**
 * CBrowser MCP Tools - Audit Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import { barrierWeightFor, weightedSeverity, weightKeyFor } from "../../visual/perceptual-transport.js";
import { randomBytes } from "crypto";
import { htmlUiResource, attachUiResource, uiResourcesEnabled, type ToolContentBlock } from "../../mcp-ui-resources.js";
import { writeArtifact } from "../../artifact-store.js";
import { bridgeCapacityTraits } from "../../visual/cognitive-models.js";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import {
  runAgentReadyAudit,
  runCompetitiveBenchmark,
  runEmpathyAudit,
  runWebMCPReadyAudit,
} from "../../analysis/index.js";
import { listAccessibilityPersonas } from "../../personas.js";
import { getDefaultConfig } from "../../config.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

/**
 * Persist an audit screenshot and return its path.
 *
 * empathy_audit inlined base64 page screenshots, which routinely overflowed an
 * MCP client's context and made the tool untestable through a normal client.
 * Writing them out keeps the overlay data usable without carrying megabytes
 * through the transport. Returns undefined rather than throwing if the write
 * fails — a screenshot is not worth failing an audit over. (2026-07-29)
 */
function writeAuditScreenshot(
  base64: string | undefined,
  persona: string,
): { path?: string; url?: string; file?: string } {
  if (!base64) return {};
  const safe = String(persona || "persona").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const out: { path?: string; url?: string; file?: string } = {};

  // Local copy, as before — the CLI and anything on this box reads this.
  try {
    const dir = join(process.env.CBROWSER_DATA_DIR || join(homedir(), ".cbrowser"), "audit-screenshots");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const path = join(dir, `empathy-${safe}-${Date.now()}.png`);
    writeFileSync(path, Buffer.from(base64, "base64"));
    out.path = path;
  } catch { /* a screenshot is not worth failing an audit over */ }

  // Served copy, so the barrier overlay has an image an MCP host can fetch.
  // The name carries 12 random hex chars rather than only a timestamp: these
  // are captures of a CUSTOMER'S page served from a public path, and a
  // timestamped name is guessable by anyone who knows roughly when an audit
  // ran. Unguessability is the only access control this path has. (2026-07-29)
  try {
    const nonce = randomBytes(6).toString("hex");
    const written = writeArtifact(Buffer.from(base64, "base64"), `empathy-${safe}-${nonce}.png`);
    // The filename too, not just the URL: the widget sandbox cannot fetch that
    // URL and asks artifact_fetch for the bytes by name instead.
    if (written) { out.url = written.url; out.file = written.filename; }
  } catch { /* overlay is optional; the audit is not */ }

  return out;
}

/**
 * Register audit tools (4 tools + site_cognitive_assessment + visual_cognitive_story)
 */
export function registerAuditTools(server: McpServer, context?: ToolRegistrationContext): void {
  const getBrowserByToken = context?.getBrowserByToken;
  server.registerTool("agent_ready_audit", {
    title: "Agent-Ready Audit",
    description: "Audit a website for AI-agent friendliness. Analyzes findability, stability, accessibility, and semantics. Returns score (0-100), grade (A-F), issues, and remediation recommendations.",
    inputSchema: {
      url: z.string().url().describe("URL to audit"),
      device: z.string().optional().describe("Device emulation: 'mobile', 'tablet', 'desktop', or specific device like 'iPhone 15'. Tests mobile AI-friendliness (responsive selectors, touch targets, viewport-specific layouts)."),
    },
    annotations: {
      title: "Agent-Ready Audit",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ url, device }) => {
      const result = await runAgentReadyAudit(url, { headless: true, ...(device ? { device } : {}) });
      const responseData = {
        url: result.url,
        score: result.score,
        grade: result.grade,
        summary: result.summary,
        // Worst-first, and the cut is reported.
        //
        // This was a plain slice(0,5) over the issues in detection order, so
        // severity had no bearing on what survived: a critical finding placed
        // sixth by the order detectors happen to run was dropped in favour of
        // five low ones, with nothing saying anything had been dropped. Found
        // when a new critical detector fired in the audit and was invisible in
        // the tool that wraps it. (2026-08-01)
        ...(() => {
          const rank = (sev: string) =>
            ({ critical: 0, high: 1, medium: 2, low: 3, info: 4 }[String(sev).toLowerCase()] ?? 5);
          const sorted = [...result.issues].sort((a, b) => rank(a.severity) - rank(b.severity));
          const shown = sorted.slice(0, 5);
          const omitted = sorted.length - shown.length;
          return {
            topIssues: shown,
            issuesFound: result.issues.length,
            ...(omitted > 0
              ? {
                  issuesOmitted: omitted,
                  issuesNote: `Showing the 5 most severe of ${result.issues.length}. Severity counts across ALL findings: ` +
                    Object.entries(result.issues.reduce((m: Record<string, number>, i) => {
                      const k = String(i.severity); m[k] = (m[k] ?? 0) + 1; return m;
                    }, {})).map(([k, v]) => `${k} ${v}`).join(", ") + ".",
                }
              : {}),
          };
        })(),
        topRecommendations: result.recommendations.slice(0, 5),
        duration: result.duration,
      };
      // Auto-save handled by tier-gate wrapper
      return { content: [{ type: "text", text: JSON.stringify(responseData, null, 2) }] };
    }
  );

  server.registerTool("competitive_benchmark", {
    title: "Competitive Benchmark",
    description: "Compare UX across competitor sites. Runs identical cognitive journeys on multiple sites and generates head-to-head comparison with rankings, friction analysis, and recommendations.",
    inputSchema: {
      sites: z.array(z.string().url()).describe("Array of URLs to compare"),
      goal: z.string().describe("Task goal (e.g., 'sign up for free trial')"),
      persona: z.string().optional().default("first-timer").describe("Persona to use"),
      maxSteps: z.number().optional().default(8).describe("Max steps per site (keep low to avoid timeout)"),
      maxTime: z.number().optional().default(20).describe("Max time per site in seconds"),
    },
    annotations: {
      title: "Competitive Benchmark",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ sites, goal, persona, maxSteps, maxTime }) => {
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

  registerEmpathyAuditTool(server);

  server.registerTool("webmcp_ready_audit", {
    title: "WebMCP Readiness Audit",
    description: "Audit an MCP server for Claude in Chrome / WebMCP compatibility. Uses 6-tier evaluation: Server Implementation (25%), Tool Discoverability (20%), Instrumentation (15%), Consistency (15%), Agent Optimizations (15%), Documentation (10%). Returns score (0-100), grade (A-F), tier breakdown, issues, and recommendations.",
    inputSchema: {
      url: z.string().url().describe("MCP server URL to audit (e.g., https://demo.cbrowser.ai/mcp)"),
      apiKey: z.string().optional().describe("API key if server requires authentication"),
      oauthToken: z.string().optional().describe("OAuth token if server uses OAuth"),
      timeout: z.number().optional().default(30000).describe("Timeout in ms (default: 30000)"),
    },
    annotations: {
      title: "WebMCP Readiness Audit",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ url, apiKey, oauthToken, timeout }) => {
      const result = await runWebMCPReadyAudit(url, {
        apiKey,
        oauthToken,
        timeout,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              url: result.url,
              score: result.score,
              grade: result.grade,
              summary: result.summary,
              tierScores: result.tiers.map((t) => ({
                tier: t.tier,
                name: t.name,
                score: t.score,
                weight: `${Math.round(t.weight * 100)}%`,
              })),
              topIssues: result.issues.slice(0, 5),
              topRecommendations: result.recommendations.slice(0, 5),
              duration: result.duration,
            }, null, 2),
          },
        ],
      };
    }
  );

  // ── Site Cognitive Assessment (Composite Pipeline) ──

  server.registerTool("site_cognitive_assessment", {
    title: "Site Cognitive Assessment",
    description: "Three-gate pipeline: (1) bot-detection probe, (2) agent-ready qualification, (3) per-persona cognitive effort analysis. IMPORTANT: If the user requests high-familiarity personas (power-user, confident-user), check site_model_status first. Without site knowledge, these personas are tested as first-time visitors and a familiarityWarning is returned. Ask the user if they want to build site knowledge first.",
    inputSchema: {
      url: z.string().url().describe("URL to assess"),
      personas: z.string().optional().default("first-timer,cognitive-adhd").describe("Comma-separated persona names (default: first-timer,cognitive-adhd)"),
      threshold: z.number().optional().default(60).describe("Minimum agent-ready score to proceed to persona analysis (default: 60)"),
      // Per RUN, not per persona. The same person is familiar with one site and new
      // to another, so this has no value until a site is named -- a stored value only
      // ever answered "familiar with which site?" by accident. The persona's value is
      // the fallback when a caller does not pass one. (2026-08-01)
      siteFamiliarity: z.number().min(0).max(1).optional()
        .describe("How familiar these personas are with THIS site: 0 first visit, 1 regular user. Overrides any value stored on the persona. Familiarity is a persona-site pair, not a disposition, so set it per run."),
      userLocation: z.string().optional().describe("User's approximate location (e.g., 'Denver, Colorado, US') — for geo-aware content expectations"),
      userTimezone: z.string().optional().describe("User's timezone (e.g., 'America/Denver') — for time-sensitive content evaluation"),
      userLanguage: z.string().optional().describe("User's expected language (e.g., 'en-US') — for readability calibration"),
      proxy: z.string().optional().describe("Proxy server URL for geo-accurate testing (e.g., 'http://user:pass@proxy.example.com:12321'). Routes browser through the proxy so sites see the proxy's IP/location instead of the server's."),
      geoRegion: z.string().optional().describe("Route through a residential proxy in this region. Available: us-west, us-east, us-central, uk, germany, japan. Overrides proxy parameter."),
      device: z.string().optional().describe("Device emulation: 'mobile', 'tablet', 'desktop', or specific device like 'iPhone 15'. Default: desktop."),
      waitAfterLoad: z.number().optional().describe("Extra milliseconds to wait after page loads. Use for sites with client-side translation or deferred rendering (e.g., 3000-5000 for i18n sites)."),
      waitForSelector: z.string().optional().describe("CSS selector to wait for after load. Example: '[data-translated]', '.content-loaded'. Times out gracefully."),
      scope: z.enum(["viewport", "full_page"]).optional().default("viewport").describe("What to measure: 'viewport' (first impression, above-the-fold — default) or 'full_page' (scroll through entire page). Viewport is right for landing page optimization; full_page for WCAG compliance."),
      _browserToken: z.string().optional().describe("Reuse an existing browser session. Essential for testing translated pages: first navigate + click the language selector, then pass the token here to assess the already-translated page. Without this, the tool creates a fresh browser that defaults to English."),
    },
    annotations: {
      title: "Site Cognitive Assessment",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ url, personas, threshold, siteFamiliarity, userLocation, userTimezone, userLanguage, proxy, geoRegion, device, waitAfterLoad, waitForSelector, scope, _browserToken }) => {
    const startTime = Date.now();
    const personaList = (personas || "first-timer,cognitive-adhd").split(",").map(s => s.trim()).filter(Boolean);

    // Derive locale from userLanguage (e.g., "en-US" → locale "en-US", language "en")
    const expectedLocale = userLanguage || "en-US";
    const expectedLang = expectedLocale.split("-")[0] || "en";

    const response: Record<string, unknown> = {
      url,
      personas: personaList,
      threshold,
      userContext: {
        location: userLocation || null,
        timezone: userTimezone || null,
        language: expectedLocale,
      },
    };

    // ── Gate 1: Bot Detection Probe ──
    let ownsBrowser = true;
    let proxyConfig: { server: string; username?: string; password?: string } | undefined;
    try {
      const { CBrowser: BrowserClass } = await import("../../browser.js");
      let browser: InstanceType<typeof BrowserClass>;
      let token: string | undefined;

      // If _browserToken is provided, reuse existing session (preserves language selection, cookies, etc.)
      if (_browserToken && getBrowserByToken) {
        const session = await getBrowserByToken(_browserToken);
        browser = session.browser;
        token = session.token;
        ownsBrowser = false; // Don't close — it belongs to the session pool
        (response as Record<string, unknown>)._browserToken = token;
        (response as Record<string, unknown>).sessionReused = true;
      } else {
        // Create fresh browser with locale and proxy settings
        // Resolve geoRegion to proxy config (overrides raw proxy)
        if (geoRegion && !proxy) {
          const { getGeoProxy } = await import("../../geo-proxy.js");
          const geoProxy = getGeoProxy(geoRegion);
          if (geoProxy) {
            proxy = `http://${encodeURIComponent(geoProxy.username)}:${encodeURIComponent(geoProxy.password)}@${geoProxy.server.replace('http://', '')}`;
            (response as Record<string, unknown>).geoRegion = geoRegion;
          }
        }

        proxyConfig = proxy ? (() => {
          try {
            const u = new URL(proxy);
            return {
              server: `${u.protocol}//${u.hostname}:${u.port}`,
              ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
              ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
            };
          } catch { return { server: proxy }; }
        })() : undefined;

        browser = new BrowserClass({
          headless: true,
          locale: expectedLocale,
          // `device` was declared in this tool's inputSchema, described as
          // "Essential for mobile WCAG audits", and then never destructured — so
          // a caller asking for a mobile audit silently received a desktop one,
          // with nothing in the response saying the argument was dropped. This is
          // the only class in the package where a paying caller gets a confidently
          // wrong number. (2026-07-26)
          ...(device ? { device } : {}),
          ...(userTimezone ? { timezone: userTimezone } : {}),
          ...(proxyConfig ? { proxy: proxyConfig, timeout: 60000 } : {}),
        });
        await browser.launch();

        // Pre-seed localStorage for client-side i18n frameworks
        if (expectedLang !== "en") {
          try {
            const page = await browser.getPage();
            await page.context().addInitScript((lang: string) => {
              try {
                localStorage.setItem("cbrowser-lang", lang);
                localStorage.setItem("lang", lang);
                localStorage.setItem("locale", lang);
              } catch {}
            }, expectedLang);
          } catch {}
        }
      }

      try {
        // For non-English, ensure enough total wait time for client-side translation:
        // waitForSelector catches the marker, then waitAfterLoad gives GT time to finish text swaps
        const effectiveWaitAfterLoad = waitAfterLoad || (expectedLang !== "en" ? 3000 : 0);
        const navResult = await browser.navigate(url, {
          ...(effectiveWaitAfterLoad ? { waitAfterLoad: effectiveWaitAfterLoad } : {}),
          ...(waitForSelector ? { waitForSelector } : {}),
        });
        const page = await browser.getPage();

        // Scope-dependent page discovery
        const auditScope = scope || "viewport";
        if (auditScope === "full_page") {
          try {
            const pageHeight = await page.evaluate(() => document.body.scrollHeight);
            const viewportHeight = await page.evaluate(() => window.innerHeight);
            const scrollSteps = Math.min(5, Math.ceil(pageHeight / viewportHeight));
            for (let i = 1; i <= scrollSteps; i++) {
              await page.evaluate((y: number) => window.scrollTo(0, y), i * viewportHeight);
              await page.waitForTimeout(300);
            }
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(300);
          } catch { /* scroll failure non-fatal */ }
        }
        (response as Record<string, unknown>).scope = auditScope;

        // Verify translation actually happened by checking page content, not just a DOM attribute.
        // The selector may exist (set by our own addInitScript) even when GT failed silently.
        if (expectedLang !== "en") {
          const contentCheck = await page.evaluate(() => {
            // Check VISIBLE body content only (not <title> which can't be client-side translated)
            const h1 = document.querySelector("h1")?.textContent || "";
            const nav = document.querySelector("nav")?.textContent || "";
            const body = document.body?.innerText?.substring(0, 500) || "";
            const visibleText = h1 + " " + nav + " " + body;
            // Check primary nav items that are always above-fold and always visible.
            // Translation is viewport-progressive, so only check items guaranteed
            // to be in the first viewport at 1920x1080.
            const englishIndicators = ["Docs", "Pricing", "Log in", "Sign up"];
            const stillEnglish = englishIndicators.filter(en => visibleText.includes(en)).length;
            // Also check page lang attribute
            const pageLang = document.documentElement.lang || "en";
            return { stillEnglish, totalChecked: englishIndicators.length, pageLang, visibleSample: visibleText.substring(0, 100) };
          }).catch(() => ({ stillEnglish: 0, totalChecked: 0, pageLang: "en", visibleSample: "" }));

          if (contentCheck.stillEnglish >= 2) {
            // Multiple English indicators still present — translation didn't work
            (response as Record<string, unknown>).translationWarning = {
              expected: expectedLocale,
              actual: "en",
              englishIndicatorsFound: contentCheck.stillEnglish,
              pageLang: contentCheck.pageLang,
              message: `Page content appears to still be in English despite userLanguage="${expectedLocale}". ${contentCheck.stillEnglish}/${contentCheck.totalChecked} English UI strings found in visible content. The site may require a language selector click, not just Accept-Language. Scores reflect English content, not ${expectedLocale}.`,
            };
          } else if (contentCheck.stillEnglish === 0) {
            (response as Record<string, unknown>).translationNote = {
              language: expectedLocale,
              verified: true,
              pageLang: contentCheck.pageLang,
              message: `Page content verified as translated — no English UI indicators found in visible text. Scores reflect ${expectedLocale} content.`,
            };
          } else {
            (response as Record<string, unknown>).translationNote = {
              language: expectedLocale,
              verified: "partial",
              pageLang: contentCheck.pageLang,
              englishIndicatorsRemaining: contentCheck.stillEnglish,
              message: `Page mostly translated — ${contentCheck.stillEnglish}/${contentCheck.totalChecked} English UI strings still present in visible content. Scores mostly reflect ${expectedLocale} content.`,
            };
          }
        }

        // Also surface waitForSelector timeout if relevant
        if (waitForSelector && navResult.waitSelectorTimedOut) {
          (response as Record<string, unknown>).waitWarning = {
            selector: waitForSelector,
            timedOut: true,
            message: `waitForSelector "${waitForSelector}" timed out — element not found after page load.`,
          };
        }

        const pageTitle = await page.title().catch(() => "");
        const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || "").catch(() => "");
        const elementCount = await page.evaluate((vpOnly: boolean) => {
          const els = Array.from(document.querySelectorAll("a, button, input, select, textarea"));
          if (!vpOnly) return els.length;
          const vh = window.innerHeight;
          return els.filter(el => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh;
          }).length;
        }, auditScope === "viewport").catch(() => 0);

        const BLOCK_SIGNATURES = [
          "access denied", "403 forbidden", "just a moment", "press & hold",
          "verify you are human", "captcha", "blocked", "robot check",
          "cloudflare", "please wait", "checking your browser",
        ];
        const lowerTitle = pageTitle.toLowerCase();
        const lowerBody = bodyText.toLowerCase();
        const blockSignature = BLOCK_SIGNATURES.find(sig => lowerTitle.includes(sig) || lowerBody.includes(sig));
        const isEmpty = elementCount < 5 && bodyText.length < 100;

        // Language mismatch detection — runs regardless of waitForSelector
        const pageLang = await page.evaluate(() => document.documentElement.lang || "").catch(() => "");
        const pageLangShort = pageLang.split("-")[0].toLowerCase();
        const languageMismatch = pageLangShort && pageLangShort !== expectedLang && pageLangShort !== "";

        if (languageMismatch) {
          (response as Record<string, unknown>).languageWarning = {
            expected: expectedLocale,
            detected: pageLang,
            message: `Page language "${pageLang}" does not match expected "${expectedLocale}". The site may be geo-detecting the server's IP rather than the user's locale. Content scoring may not reflect the user's actual experience.`,
          };
        }

        if (blockSignature || isEmpty) {
          response.gate1 = {
            status: "blocked",
            signature: blockSignature || "empty page",
            pageTitle,
            elementCount,
            bodyLength: bodyText.length,
          };
          response.result = "BLOCKED";
          response.message = `Site is bot-blocked (${blockSignature || "empty DOM"}). Cannot assess cognitive experience. Try with stealth mode enabled or use a staging URL.`;
          response.duration = `${Date.now() - startTime}ms`;
          if (ownsBrowser) await browser.close();
          return { content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }] };
        }

        response.gate1 = { status: "accessible", pageTitle, elementCount };

        // ── Gate 2: Agent-Ready Audit ──
        try {
          const auditResult = await runAgentReadyAudit(url, {
            headless: true,
            ...(proxyConfig ? { proxy: proxyConfig } : {}),
            locale: expectedLocale,
            // Increase timeouts when proxied — residential proxies add 5-15s latency
            ...(proxyConfig ? { timeout: 120000, navigationTimeout: 60000 } : {}),
          });
          const score = auditResult.score.overall;
          const grade = auditResult.grade;

          response.gate2 = {
            status: score >= threshold ? "qualified" : "unqualified",
            score,
            grade,
            threshold,
            topIssues: auditResult.issues?.slice(0, 5).map((issue) => ({
              description: issue.description,
              severity: issue.severity,
              category: issue.category,
            })) || [],
          };

          if (score < threshold) {
            response.result = "UNQUALIFIED";
            response.message = `Site scored ${score}/100 (grade ${grade}), below the ${threshold} threshold. Fix structural issues before persona testing adds value.`;
            response.duration = `${Date.now() - startTime}ms`;
            if (ownsBrowser) await browser.close();
            return { content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }] };
          }
        } catch (auditErr) {
          response.gate2 = { status: "error", error: auditErr instanceof Error ? auditErr.message : String(auditErr) };
          // Continue to Gate 3 even if audit fails — don't block on optional qualification
        }

        // ── Gate 3: Per-Persona Cognitive Effort ──
        const personaResults: Record<string, unknown> = {};
        const { buildOTCognitiveProfile } = await import("../../visual/cognitive-transport.js");
        const { computeDemandDistribution, computeSequentialCTC } = await import("../../visual/cognitive-transport-chain.js");
        const { extractPageMetrics } = await import("../../visual/cognitive-transport.js");
        const { getAnyPersona, createCognitivePersona, resolvePersonaOrThrow } = await import("../../personas.js");

        // Navigate in our browser for page metrics
        await browser.navigate(url);
        const metricsPage = await browser.getPage();
        // `auditScope`, not the default. This argument was omitted, so every layer
        // cost this tool produced was computed from viewport-only metrics while the
        // payload said `"scope": "full_page"` (set at :369). The response asserted a
        // scope the measurement never used.
        //
        // The report that found it compared this tool at full_page against
        // cognitive_effort at viewport and got six of eight layers identical to three
        // decimals. That is the signature: cognitive_effort DOES thread scope
        // (persona-comparison-tools.ts), this did not, so both measured the same first
        // screenful.
        //
        // This is worse than the undeclared-viewport defect it replaced. That one was
        // a silent default; this one was an explicit false claim, and the criterion
        // asserting "every response states its scope" passed throughout, because the
        // response did state one. It just was not true.
        //
        // extractPageMetrics runs its own lazy-load scroll walk at full_page, so
        // forwarding the scope is the entire fix.
        const pageMetrics = await extractPageMetrics(metricsPage, auditScope);
        const demand = computeDemandDistribution(pageMetrics);

        // Page understanding
        let pageUnderstanding: Record<string, unknown> | null = null;
        try {
          const { PageUnderstandingEngine } = await import("../../analysis/page-understanding.js");
          const engine = new PageUnderstandingEngine();
          // Display-only — it feeds no layer. Scoped anyway: a payload reporting
          // affordanceCount beside a full_page verdict should be counting the full
          // page's affordances, or it is the same false claim one field over.
          const pu = await engine.analyze(metricsPage, auditScope);
          pageUnderstanding = {
            type: pu.type,
            affordanceCount: pu.affordances.length,
            formCount: pu.structure.forms.length,
            ctaCount: pu.structure.ctas.length,
          };
        } catch {}

        // Check site knowledge — binary gate for siteFamiliarity
        // Has data = persona keeps its familiarity. No data = forced to 0.0 (first visit).
        let hasSiteKnowledge = false;
        try {
          const domain = new URL(url).hostname;
          const { SiteModelManager } = await import("../../site-model/manager.js");
          const mgr = SiteModelManager.getInstance();
          const stats = await mgr.getModelStats(domain);
          hasSiteKnowledge = !!(stats && stats.navigationNodes > 0);
        } catch {}

        for (const personaName of personaList) {
          try {
            const existingPersona = getAnyPersona(personaName);
            if (!existingPersona) resolvePersonaOrThrow(personaName);
            const personaObj = existingPersona || createCognitivePersona(personaName, personaName, {});
            const traits = { ...((personaObj as unknown as Record<string, unknown>).cognitiveTraits || {}) as Record<string, number> };

            // Familiarity is a persona-SITE pair, so the caller's value for THIS
            // run wins over anything stored on the persona. A stored value only
            // ever answered "familiar with which site?" by accident.
            // (2026-08-01)
            const reqFam = traits.siteFamiliarity ?? 0.5;
            const familiarityFromCaller = typeof siteFamiliarity === "number";
            if (familiarityFromCaller) {
              traits.siteFamiliarity = siteFamiliarity;
            } else {
              // v18.61.0: without an explicit value it stays a binary gate on
              // whether this install has crawled the site at all.
              if (hasSiteKnowledge) {
                if (reqFam > 0.5) traits.siteFamiliarity = 1.0;
              } else {
                traits.siteFamiliarity = 0.0;
              }
            }

            // Bridge the derived capacities before building the profile. This was
            // MISSING here and present in cognitive_effort, so the motor layer --
            // whose sole trait is motorCapacity -- scored against traitValue's
            // missing-trait fallback of 0.5. That constant means "trait absent",
            // not "average pointing ability", and the two tools disagreed by 2.6x
            // on the same page in the same run window (0.058 here vs 0.022 there).
            //
            // The bridged number is the correct one: the model defines
            // motorCapacity as derived from the Fitts pointing model, and reading
            // dispositional traits instead is the defect the bridge was written to
            // fix. Scoring against a placeholder was never a second opinion.
            //
            // This moves more than motor. readability, readingAttention, totalCTC,
            // bottleneck and abandonmentRisk all shift for every persona here, all
            // converging on what cognitive_effort already reported.
            bridgeCapacityTraits(personaName, traits,
              (personaObj as unknown as { accessibilityTraits?: Record<string, number> }).accessibilityTraits);

            const otProfile = buildOTCognitiveProfile(personaName, traits);
            const result = computeSequentialCTC(otProfile, demand, { asymmetric: true, interactions: true });

            personaResults[personaName] = {
              totalCTC: Math.round(result.totalCTC * 1000) / 1000,
              bottleneck: result.bottleneckLayer,
              abandonmentRisk: Math.round(result.abandonmentRisk * 100) + "%",
              deficit: Math.round(result.deficitCost * 1000) / 1000,
              surplus: Math.round(result.surplusCost * 1000) / 1000,
              layers: result.layers.map(l => ({
                name: l.name,
                cost: Math.round(l.transportCost * 1000) / 1000,
              })),
              // Only warn about the automatic downgrade. A caller who SET the
              // value for this run has already answered the question the
              // downgrade exists to answer.
              ...(!familiarityFromCaller && reqFam > 0.5 && !hasSiteKnowledge ? {
                familiarityWarning: `siteFamiliarity downgraded from ${reqFam} to 0.0 — no site knowledge exists for this domain. Pass siteFamiliarity on this call to state it directly, or run page_understand first.`,
              } : {}),
              ...(familiarityFromCaller ? { siteFamiliaritySource: "supplied for this run" } : {}),
            };
          } catch (personaErr) {
            personaResults[personaName] = { error: personaErr instanceof Error ? personaErr.message : String(personaErr) };
          }
        }

        response.gate3 = { status: "complete", personas: personaResults };
        response.pageMetrics = {
          informationDensity: Math.round(pageMetrics.informationDensity * 1000) / 1000,
          visualComplexity: Math.round(pageMetrics.visualComplexity * 1000) / 1000,
          interactiveElements: pageMetrics.interactiveElementCount,
          choiceCount: pageMetrics.choiceCount,
          // Text readability metrics (v18.56)
          avgWordLength: Math.round(pageMetrics.avgWordLength * 1000) / 1000,
          avgSentenceLength: Math.round(pageMetrics.avgSentenceLength * 1000) / 1000,
          lexicalDiversity: Math.round(pageMetrics.lexicalDiversity * 1000) / 1000,
          longWordRatio: Math.round(pageMetrics.longWordRatio * 1000) / 1000,
          technicalDensity: Math.round(pageMetrics.technicalDensity * 1000) / 1000,
          scriptFamily: pageMetrics.scriptFamily || "alphabetic",
          // Every ratio above is 0-1 NORMALIZED, not a raw measurement.
          // cognitive_effort's readability penalties report avg word length in
          // raw CHARACTERS (e.g. 11.4), so the same name carried two scales
          // across tools with nothing in either payload to distinguish them.
          // Naming the scale here is the same remedy already used for
          // barrierFieldNotes and cognitiveLoadReadings. (2026-07-29)
          metricScaleNote: "All ratios in pageMetrics are normalized 0-1, including avgWordLength. cognitive_effort reports avg word length in raw characters instead — the two are not comparable.",
        };

        if (pageUnderstanding) response.pageUnderstanding = pageUnderstanding;

        // Generate recommendations
        const recommendations: string[] = [];
        for (const [name, data] of Object.entries(personaResults)) {
          const d = data as Record<string, unknown>;
          if (d.bottleneck) {
            recommendations.push(`${name}: Reduce ${d.bottleneck} complexity (primary bottleneck, CTC=${d.totalCTC})`);
          }
        }
        response.recommendations = recommendations.slice(0, 5);
        response.result = "COMPLETE";
        response.duration = `${Date.now() - startTime}ms`;

        // Auto-save to site dashboard
        // Auto-save handled by tier-gate wrapper

        if (ownsBrowser) await browser.close();
      } catch (navErr) {
        const errMsg = navErr instanceof Error ? navErr.message : String(navErr);
        const isProxyBlock = errMsg.includes("ERR_TUNNEL_CONNECTION_FAILED") || errMsg.includes("ERR_PROXY_CONNECTION_FAILED");
        const isProxyTimeout = errMsg.includes("ERR_NETWORK_CHANGED") && geoRegion;

        if (isProxyBlock || isProxyTimeout) {
          response.gate1 = {
            status: "proxy_blocked",
            error: errMsg.split("\n")[0],
            geoRegion: geoRegion || undefined,
          };
          response.result = "PROXY_BLOCKED";
          response.message = `The site rejected the residential proxy connection${geoRegion ? ` (${geoRegion})` : ""}. This means ${url} actively blocks proxy/VPN traffic — this is the site's anti-bot defense, not a CBrowser issue.\n\nRecommendations:\n1. Re-run without --geo-region to test from the server's direct IP\n2. Try a different geo region (the site may block specific IP ranges)\n3. If you need geo-accurate results, use a datacenter proxy or test from a machine in the target region`;
        } else {
          response.gate1 = { status: "error", error: errMsg };
          response.result = "ERROR";
        }
        response.duration = `${Date.now() - startTime}ms`;
        if (ownsBrowser) await browser.close();
      }
    } catch (browserErr) {
      const errMsg = browserErr instanceof Error ? browserErr.message : String(browserErr);
      response.gate1 = { status: "error", error: errMsg };
      response.result = "ERROR";
      response.duration = `${Date.now() - startTime}ms`;
    }

    return { content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }] };
  });

  // ── Visual Cognitive Story ──

  server.registerTool("visual_cognitive_story", {
    title: "Visual Cognitive Story",
    description: "Generate a complete visual narrative of how a persona experiences a page. Produces multiple annotated screenshots: attention heatmap (where they look), motor overlay (what they can click), attention quality (do they see the CTAs), and a written narrative connecting effort, attention, and conversion. Returns all images as public URLs.",
    inputSchema: {
      url: z.string().url().describe("URL to analyze"),
      persona: z.string().optional().default("cognitive-adhd").describe("Persona name"),
      device: z.string().optional().describe("Device to emulate: 'mobile', 'tablet', 'desktop', or a specific device like 'iPhone 15', 'Pixel 7', 'iPad Pro'. Default: desktop (1920x1080)."),
      useValues: z.boolean().optional().default(false).describe("Enable motivational value influence on saliency map generation, attention scoring, and narrative. Default: false."),
      // Goal-directed attention is the largest single lever in the semantic
      // layer: computeGoalRelevance boosts any element whose text matches the
      // goal's keywords, which is what separates "where the eye lands on this
      // page" from "where the eye lands while trying to DO something". The tool
      // narrates a persona pursuing a task, so it had the concept and not the
      // input. (2026-07-29)
      goal: z.string().optional().describe("What the persona is trying to accomplish (e.g. 'find pricing', 'sign up'). Elements matching the goal are weighted far higher in the attention model — without it the map shows undirected browsing rather than task-driven attention."),
      aiLayer: z.boolean().optional().default(false).describe("Add a third attention layer: a vision model reads the rendered page AS this persona and reports where they look and why. Sees what the DOM cannot — what the copy MEANS to them, text inside images, compositional hierarchy, and what they deliberately skip. Costs one Anthropic call (~12s, cached per image+persona+goal so repeats are free) and requires an API key. Returned as a SEPARATE labelled layer, never silently blended into the deterministic saliency numbers."),
      _browserToken: z.string().optional().describe("Reuse an existing browser session. Useful for testing translated or state-dependent pages."),
    },
    annotations: {
      title: "Visual Cognitive Story",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ url, persona, device, useValues, goal, aiLayer, _browserToken }) => {
    const startTime = Date.now();
    const { join } = await import("path");
    const { tmpdir } = await import("os");
    const { writeFileSync, mkdirSync, existsSync, unlinkSync } = await import("fs");
    let ownsVcsBrowser = true;

    try {
      const { CBrowser: BrowserClass } = await import("../../browser.js");
      let browser: InstanceType<typeof BrowserClass>;
      let vcsToken: string | undefined;

      if (_browserToken && getBrowserByToken) {
        const session = await getBrowserByToken(_browserToken);
        browser = session.browser;
        vcsToken = session.token;
        ownsVcsBrowser = false;
      } else {
        browser = new BrowserClass({
          headless: true,
          // The CONFIGURED viewport, not a hardcoded 1920x1080.
          //
          // cognitive_effort and every other tool render at the configured
          // default (1280x800), and this one alone rendered at 1920x1080. The
          // two tools were therefore measuring different rendered pages while
          // reporting coordinates as if they shared a space -- attention regions
          // came back at x=1312 against a config that says the viewport is 1280
          // wide, which is impossible and was the tell. Any comparison between
          // an attention run and a CTC run was comparing two different layouts.
          // (2026-08-02)
          ...(device ? { device: device.toLowerCase() } : {
            viewportWidth: getDefaultConfig().viewportWidth,
            viewportHeight: getDefaultConfig().viewportHeight,
          }),
        });
        await browser.launch();
      }

      try {
        await browser.navigate(url);
        await new Promise(r => setTimeout(r, 2000));
        const page = await browser.getPage();

        const ssPath = join(tmpdir(), `story-${Date.now()}.png`);
        await page.screenshot({ path: ssPath, fullPage: false });

        // webDir removed: this pointed at /var/www/cbrowser-web/heatmaps, a
        // FIFTH directory nginx does not serve (it serves /heatmaps/ from
        // /var/www/cbrowser-data/heatmaps). All four story overlays below wrote
        // there and returned cbrowser.ai URLs that 404'd. (2026-07-29)
        // (directory creation is the artifact store's job now)
        const ts = Date.now();

        const images: Array<{ type: "image"; data: string; mimeType: string }> = [];
        const urls: Record<string, string> = {};

        // ── 1. Attention Heatmap ──
        let attentionData: { entropy: number; concentration: number; hotspots: Array<{ x: number; y: number; saliency: number; row: number; col: number }>; saliencyMap?: { cells: Float64Array; rows: number; cols: number } } | null = null;
        try {
          const { analyzeAttention } = await import("../../visual/attention-transport.js");
          // Feed the DOM in. Without it analyzeAttention falls back to the
          // bottom-up layer alone — colour-contrast pop-out — and this tool then
          // narrates it as where the persona's attention goes. The blend is 65%
          // semantic, so the fallback was not a minor degradation; it was a
          // different model wearing the same name. (2026-07-29)
          const { collectDomAttentionElements } = await import("../../visual/attention-quality.js");
          const domAttentionElements = await collectDomAttentionElements(page).catch(() => []);
          const attnResult = await analyzeAttention(ssPath, persona, 4, undefined, domAttentionElements, goal);
          attentionData = {
            entropy: attnResult.entropy,
            concentration: attnResult.concentration,
            hotspots: attnResult.saliencyMap?.hotspots || [],
            saliencyMap: attnResult.saliencyMap,
          };

          if (attnResult.saliencyMap) {
            const { generateHeatmapOverlay } = await import("../../visual/heatmap-overlay.js");
            const heatB64 = await generateHeatmapOverlay(ssPath, attnResult.saliencyMap.cells, attnResult.saliencyMap.rows, attnResult.saliencyMap.cols, `${persona} Attention`);
            const heatId = `story-attn-${persona}-${ts}`;
            const w_attention = writeArtifact(Buffer.from(heatB64, "base64"), `${heatId}.png`);
            if (w_attention) urls.attention = w_attention.url;
            images.push({ type: "image", data: heatB64, mimeType: "image/png" });
            // Auto-save to gallery
            try {
              const { saveVisualReport } = await import("../visual-report-saver.js");
              const { getSessionApiKey } = await import("./cognitive-tools.js");
              saveVisualReport({ apiKey: getSessionApiKey(), imageUrl: urls.attention, toolName: "visual_cognitive_story_attention", targetUrl: url, persona });
            } catch {}
          }
        } catch (e) { console.debug(`[story] Attention failed: ${(e as Error).message}`); }

        // ── 2. Motor Accessibility Overlay ──
        try {
          const { motorAccessibility } = await import("../../visual/cognitive-models.js");
          const { buildOTCognitiveProfile } = await import("../../visual/cognitive-transport.js");
          const { getAnyPersona, createCognitivePersona, resolvePersonaOrThrow } = await import("../../personas.js");

          // A miss throws instead of yielding an all-midpoint stand-in.
          const personaObj = getAnyPersona(persona) || resolvePersonaOrThrow(persona) as ReturnType<typeof createCognitivePersona>;
          const traits = ((personaObj as unknown as Record<string, unknown>).cognitiveTraits || {}) as Record<string, number>;
          const otProfile = buildOTCognitiveProfile(persona, traits);

          const elements = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a, button, input, select, textarea, [role="button"]')).slice(0, 30).map(el => {
              const rect = (el as HTMLElement).getBoundingClientRect();
              const vw = window.innerWidth / 2;
              const vh = window.innerHeight / 2;
              return {
                selector: el.tagName.toLowerCase() + ((el as HTMLElement).innerText?.trim().slice(0, 15) ? `[${(el as HTMLElement).innerText.trim().slice(0, 15)}]` : ''),
                width: rect.width, height: rect.height,
                distance: Math.sqrt((rect.x + rect.width / 2 - vw) ** 2 + (rect.y + rect.height / 2 - vh) ** 2),
                x: rect.x, y: rect.y,
              };
            }).filter((e: { width: number; height: number }) => e.width > 0 && e.height > 0);
          });

          const motorResult = motorAccessibility(elements, otProfile);

          const { generateMotorOverlay } = await import("../../visual/visual-overlays.js");
          const motorElements = elements.map((el: { selector: string; x: number; y: number; width: number; height: number }, i: number) => ({
            ...el,
            hitProbability: motorResult.elements[i]?.hitProbability ?? 0.9,
            isBarrier: motorResult.elements[i]?.isBarrier ?? false,
          }));
          // Pass CSS viewport width for coordinate scaling (getBoundingClientRect returns CSS px)
          const cssVW = await page.evaluate(() => window.innerWidth).catch(() => 1920);
          const motorB64 = await generateMotorOverlay(ssPath, motorElements, persona, cssVW);
          const motorId = `story-motor-${persona}-${ts}`;
          const w_motor = writeArtifact(Buffer.from(motorB64, "base64"), `${motorId}.png`);
          if (w_motor) urls.motor = w_motor.url;
          images.push({ type: "image", data: motorB64, mimeType: "image/png" });
          try { const { saveVisualReport } = await import("../visual-report-saver.js"); const { getSessionApiKey } = await import("./cognitive-tools.js"); saveVisualReport({ apiKey: getSessionApiKey(), imageUrl: urls.motor, toolName: "visual_cognitive_story_motor", targetUrl: url, persona }); } catch {}
        } catch (e) { console.debug(`[story] Motor failed: ${(e as Error).message}`); }

        // ── 3. Attention Quality Overlay ──
        try {
          if (attentionData?.hotspots) {
            const { computeAttentionQuality, extractPageElementsForAttention } = await import("../../visual/attention-quality.js");
            const { generateAttentionQualityOverlay } = await import("../../visual/visual-overlays.js");
            const rawElements = await extractPageElementsForAttention(page);

            // Scale CSS coordinates to screenshot pixel coordinates (DPR adjustment)
            const dpr: number = await page.evaluate(() => window.devicePixelRatio).catch(() => 1);
            const pageElements = rawElements.map(el => ({
              ...el,
              x: el.x * dpr,
              y: el.y * dpr,
              width: el.width * dpr,
              height: el.height * dpr,
            }));
            // Pass persona values only when useValues is enabled
            let pValues: Record<string, number> | undefined;
            if (useValues) {
              try {
                const { getPersonaValues: getPV, registerPersonaValues: regPV, createPersonaValues: createPV } = await import("../../values/index.js");
                let v = getPV(persona);

                // Custom persona CMS fallback
                if (!v) {
                  try {
                    const { getSessionApiKey } = await import("./cognitive-tools.js"); const _sessionApiKey = getSessionApiKey();
                    if (_sessionApiKey) {
                      const cmsUrl = process.env.CMS_URL || "http://localhost:3200";
                      const res = await fetch(`${cmsUrl}/api/personas`, { headers: { "Authorization": `Bearer ${_sessionApiKey}` } });
                      if (res.ok) {
                        const data = await res.json() as { personas: Array<{ name: string; slug: string; schwartz_values?: string }> };
                        const match = data.personas.find((p: any) => p.slug === persona || p.name.toLowerCase() === persona.toLowerCase());
                        if (match?.schwartz_values) {
                          const sv = typeof match.schwartz_values === "string" ? JSON.parse(match.schwartz_values) : match.schwartz_values;
                          const pv = createPV(
                            { selfDirection: sv.selfDirection ?? 0.5, stimulation: sv.stimulation ?? 0.5, hedonism: sv.hedonism ?? 0.5, achievement: sv.achievement ?? 0.5, power: sv.power ?? 0.5, security: sv.security ?? 0.5, conformity: sv.conformity ?? 0.5, tradition: sv.tradition ?? 0.5, benevolence: sv.benevolence ?? 0.5, universalism: sv.universalism ?? 0.5 },
                            { autonomyNeed: sv.autonomyNeed ?? 0.5, competenceNeed: sv.competenceNeed ?? 0.5, relatednessNeed: sv.relatednessNeed ?? 0.5 },
                            "esteem"
                          );
                          regPV([{ personaName: persona, values: pv, rationale: "Custom persona from CMS" }]);
                          v = pv;
                        }
                      }
                    }
                  } catch { /* CMS fallback failed */ }
                }

                if (v) pValues = v as unknown as Record<string, number>;
              } catch {}
            }
            const quality = computeAttentionQuality(attentionData.hotspots, pageElements, 4, pValues);

            // Build overlay targets from page elements that matched hotspots
            const overlayTargets = quality.topAttentionTargets.map(t => {
              const el = pageElements.find(e => e.text?.includes(t.element.slice(0, 20)) || e.selector === t.element);
              return {
                type: t.type,
                x: el?.x ?? 0, y: el?.y ?? 0,
                width: el?.width ?? 100, height: el?.height ?? 30,
                saliency: t.saliency,
                label: t.element,
              };
            }).filter(t => t.x > 0 || t.y > 0);

            if (overlayTargets.length > 0) {
              const cssVW2 = await page.evaluate(() => window.innerWidth).catch(() => 1920);
              const qualB64 = await generateAttentionQualityOverlay(ssPath, overlayTargets, persona, cssVW2);
              const qualId = `story-quality-${persona}-${ts}`;
              const w_quality = writeArtifact(Buffer.from(qualB64, "base64"), `${qualId}.png`);
              if (w_quality) urls.quality = w_quality.url;
              images.push({ type: "image", data: qualB64, mimeType: "image/png" });
              try { const { saveVisualReport } = await import("../visual-report-saver.js"); const { getSessionApiKey } = await import("./cognitive-tools.js"); saveVisualReport({ apiKey: getSessionApiKey(), imageUrl: urls.quality, toolName: "visual_cognitive_story_quality", targetUrl: url, persona }); } catch {}
            }

            urls.qualityData = quality as unknown as string;
          }
        } catch (e) { console.debug(`[story] Quality failed: ${(e as Error).message}`); }

        // ── 4. Cognitive Effort Summary ──
        let effortData: Record<string, unknown> | null = null;
        try {
          const { buildOTCognitiveProfile } = await import("../../visual/cognitive-transport.js");
          const { computeDemandDistribution, computeSequentialCTC } = await import("../../visual/cognitive-transport-chain.js");
          const { extractPageMetrics } = await import("../../visual/cognitive-transport.js");
          const { getAnyPersona, createCognitivePersona, resolvePersonaOrThrow } = await import("../../personas.js");

          // A miss throws instead of yielding an all-midpoint stand-in.
          const personaObj = getAnyPersona(persona) || resolvePersonaOrThrow(persona) as ReturnType<typeof createCognitivePersona>;
          const traits = ((personaObj as unknown as Record<string, unknown>).cognitiveTraits || {}) as Record<string, number>;
          // Same bridge as Gate 3 and cognitive_effort. Without it this tool has
          // the identical missing-capacity defect and would reproduce the motor
          // disagreement against cognitive_effort the moment anyone compared them.
          bridgeCapacityTraits(persona, traits,
            (personaObj as unknown as { accessibilityTraits?: Record<string, number> }).accessibilityTraits);
          const otProfile = buildOTCognitiveProfile(persona, traits);
          // viewport-by-design: visual_cognitive_story declares no `scope` parameter,
          // so it promises the caller nothing about how much of the page it read, and
          // measuring the viewport is an honest default rather than a dropped
          // argument. Distinct from the site_cognitive_assessment defect above, where
          // a scope WAS offered, echoed, and then not applied. If this tool ever gains
          // a scope, this marker must go and the scope must be threaded.
          const pageMetrics = await extractPageMetrics(page);
          const demand = computeDemandDistribution(pageMetrics);
          const ctcResult = computeSequentialCTC(otProfile, demand, { asymmetric: true, interactions: true });

          effortData = {
            totalCTC: Math.round(ctcResult.totalCTC * 1000) / 1000,
            bottleneck: ctcResult.bottleneckLayer,
            abandonmentRisk: Math.round(ctcResult.abandonmentRisk * 100),
            layers: ctcResult.layers.map(l => ({ name: l.name, cost: Math.round(l.transportCost * 1000) / 1000 })),
          };
        } catch (e) { console.debug(`[story] Effort failed: ${(e as Error).message}`); }

        // ── 5. Combined overlay — all layers on one grayscale image ──
        try {
          const { generateCombinedStoryOverlay } = await import("../../visual/visual-overlays.js");

          const motorEls = [];
          try {
            const motorElements = await page.evaluate(() => {
              return Array.from(document.querySelectorAll('a, button, input, select, [role="button"]')).slice(0, 20).map(el => {
                const rect = (el as HTMLElement).getBoundingClientRect();
                return { selector: el.tagName.toLowerCase(), x: rect.x, y: rect.y, width: rect.width, height: rect.height };
              }).filter((e: { width: number; height: number }) => e.width > 0 && e.height > 0);
            });
            for (const el of motorElements) {
              motorEls.push({ ...el, hitProbability: 0.85, isBarrier: el.width < 30 || el.height < 30 });
            }
          } catch {}

          const qualTargets: Array<{ type: "cta" | "heading" | "decorative" | "navigation" | "content" | "unknown"; x: number; y: number; width: number; height: number; saliency: number; label: string }> = [];
          try {
            const { extractPageElementsForAttention } = await import("../../visual/attention-quality.js");
            const pageEls = await extractPageElementsForAttention(page);
            for (const el of pageEls.filter(e => e.isCTA || e.isHeading || e.isDecorative).slice(0, 15)) {
              qualTargets.push({
                type: el.isCTA ? "cta" : el.isHeading ? "heading" : "decorative",
                x: el.x, y: el.y, width: el.width, height: el.height,
                saliency: 0.5, label: el.text?.slice(0, 25) || el.selector,
              });
            }
          } catch {}

          const cssVW3 = await page.evaluate(() => window.innerWidth).catch(() => 1920);
          const combinedB64 = await generateCombinedStoryOverlay(
            ssPath,
            attentionData?.saliencyMap?.cells ?? null,
            attentionData?.saliencyMap?.rows ?? 0,
            attentionData?.saliencyMap?.cols ?? 0,
            motorEls,
            qualTargets,
            persona,
            cssVW3,
          );
          const combId = `story-combined-${persona}-${ts}`;
          const w_combined = writeArtifact(Buffer.from(combinedB64, "base64"), `${combId}.png`);
          if (w_combined) urls.combined = w_combined.url;
          images.push({ type: "image", data: combinedB64, mimeType: "image/png" });
          try { const { saveVisualReport } = await import("../visual-report-saver.js"); const { getSessionApiKey } = await import("./cognitive-tools.js"); saveVisualReport({ apiKey: getSessionApiKey(), imageUrl: urls.combined, toolName: "visual_cognitive_story_combined", targetUrl: url, persona }); } catch {}
        } catch (e) { console.debug(`[story] Combined overlay failed: ${(e as Error).message}`); }

        // ── Build narrative ──
        const concentration = attentionData?.concentration ?? 0;
        const entropy = attentionData?.entropy ?? 0;
        const ctc = (effortData?.totalCTC as number) ?? 0;
        const bottleneck = (effortData?.bottleneck as string) ?? "unknown";
        const risk = (effortData?.abandonmentRisk as number) ?? 0;
        const qualityData = urls.qualityData as unknown as { ctaCaptureRate?: number; distractorRatio?: number; qualityScore?: number; interpretation?: string } | undefined;

        const _nu = new URL(url);
        let narrative = `## ${persona} on ${_nu.hostname.replace(/^www\d*\./, '')}${_nu.pathname !== '/' ? _nu.pathname.replace(/\/$/, '') : ''}\n\n`;
        narrative += `### The Eye: Where Attention Goes\n`;
        // Concentration and entropy were emitted as two independent sentences, so
        // a page could be told "Attention is focused (91%)" and immediately
        // "High visual entropy means too many competing elements" — which reads
        // as the report contradicting itself one line later. It is not a
        // contradiction, it is a real and specific combination: one dominant
        // anchor plus a crowded field behind it. Say that, rather than two
        // half-truths in sequence. (2026-07-29)
        const focused = concentration > 0.5;
        const crowded = entropy > 0.8;
        const pct = (concentration * 100).toFixed(0);
        if (focused && crowded) {
          narrative += `Attention concentrates on one anchor (${pct}%), but the field behind it is crowded (entropy ${entropy.toFixed(2)}). This persona locks onto a single element and the rest of the page competes for whatever attention is left — strong focus, weak hierarchy.\n\n`;
        } else if (focused) {
          narrative += `Attention is focused (concentration: ${pct}%) and the hierarchy supports it. This persona quickly identifies a visual anchor and locks onto it.\n\n`;
        } else if (crowded) {
          narrative += `Attention is scattered (concentration: ${pct}%) across a crowded page (entropy ${entropy.toFixed(2)}). Too many elements compete and none wins — the eye wanders without finding a focal point.\n\n`;
        } else {
          narrative += `Attention is spread evenly (concentration: ${pct}%) without a dominant anchor, though the page is not visually noisy. Nothing is fighting for attention; nothing is claiming it either.\n\n`;
        }

        narrative += `### The Effort: How Hard It Is\n`;
        narrative += `Total cognitive transport cost: ${ctc.toFixed(2)}. `;
        narrative += ctc < 0.5 ? `This page is comfortable for ${persona}. ` : ctc < 1.0 ? `Moderate effort required. ` : `Significant cognitive burden. `;
        narrative += `The bottleneck is **${bottleneck}** — this is where the design creates the most friction.\n`;
        narrative += `Abandonment risk: **${risk}%**.\n\n`;

        narrative += `### The Question: Do They See What Matters?\n`;
        if (qualityData) {
          const cta = qualityData.ctaCaptureRate ?? 0;
          const distract = qualityData.distractorRatio ?? 0;
          narrative += cta > 0.2
            ? `CTAs capture ${(cta * 100).toFixed(0)}% of top attention — the conversion path is visible.\n`
            : `CTAs capture only ${(cta * 100).toFixed(0)}% of top attention — the conversion path is nearly invisible to this persona.\n`;
          narrative += distract > 0.4
            ? `${(distract * 100).toFixed(0)}% of attention goes to non-actionable elements (decorative images, nav chrome). Design is leaking attention.\n`
            : `Low distractor ratio (${(distract * 100).toFixed(0)}%) — most attention goes to actionable content.\n`;
          narrative += `\nAttention quality score: **${qualityData.qualityScore ?? 0}/100**\n`;
        } else {
          narrative += `Attention quality data unavailable.\n`;
        }

        narrative += `\n### The Verdict\n`;
        // The verdict branched on ctc and ctaCaptureRate ONLY, ignoring the
        // distractor ratio and quality score printed directly above it. So a
        // page scoring 31/100 with 70% of attention on non-actionable elements
        // was told "**Strong.** Easy to use AND attention lands on CTAs" — the
        // verdict contradicting its own evidence one line later. A summary that
        // reads less of the data than the section above it is worse than no
        // summary, because it is the line people quote. (2026-07-29)
        const distractRatio = qualityData?.distractorRatio ?? 0;
        const qScore = qualityData?.qualityScore ?? 0;
        const leaking = distractRatio > 0.4 || (qualityData !== undefined && qScore < 50);
        if (ctc < 0.5 && (qualityData?.ctaCaptureRate ?? 0) > 0.2 && !leaking) {
          narrative += `**Strong.** Easy to use AND attention lands on CTAs. This page works for ${persona}.`;
        } else if (ctc < 0.5 && (qualityData?.ctaCaptureRate ?? 0) > 0.2 && leaking) {
          narrative += `**Mixed.** Low cognitive effort and the CTAs do get seen, but attention quality is ${qScore}/100 with ${(distractRatio * 100).toFixed(0)}% going to non-actionable elements. ${persona} can use this page; the design is spending most of their attention on things that do not convert.`;
        } else if (ctc < 0.5 && (qualityData?.ctaCaptureRate ?? 0) < 0.1) {
          narrative += `**Easy but unfocused.** Low cognitive effort, but attention misses the CTAs. The page needs stronger visual hierarchy to guide ${persona} toward conversion.`;
        } else if (ctc > 1.0 && (qualityData?.ctaCaptureRate ?? 0) > 0.2) {
          narrative += `**Hard but focused.** High cognitive effort, but when ${persona} pushes through, they see the CTAs. Reduce complexity to lower the abandonment risk without losing the visual focus.`;
        } else {
          narrative += `**Needs work.** High effort AND low CTA visibility. ${persona} is both struggling to process the page AND not seeing the conversion path. Prioritize: simplify the ${bottleneck} layer, then make CTAs more prominent.`;
        }

        // ── Assemble response ──
        // Third layer, opt-in. Runs AFTER the deterministic layers and is
        // reported beside them rather than folded in: layers 1 and 2 are
        // reproducible and visual baselines depend on that, while this one is a
        // model's judgement. Naming which is which is the whole point.
        let aiAttention: unknown = undefined;
        if (aiLayer) {
          try {
            const { analyzeAttentionWithAI } = await import("../../visual/attention-ai-layer.js");
            const vp = page.viewportSize();
            const { getAnyPersona } = await import("../../personas.js");
            const pObj = getAnyPersona(persona) as
              { values?: Record<string, number>; description?: string } | undefined;
            aiAttention = await analyzeAttentionWithAI(ssPath, persona, {
              goal,
              values: pObj?.values,
              personaDescription: pObj?.description,
              imageWidth: vp?.width,
              imageHeight: vp?.height,
            });
          } catch { /* additive layer; never fails the story */ }
        }

        const storyResponse = {
          url,
          persona,
          narrative,
          ...(aiAttention ? { aiAttention } : {}),
          images: urls,
          effort: effortData,
          attention: {
            entropy: Math.round(entropy * 1000) / 1000,
            concentration: Math.round(concentration * 1000) / 1000,
          },
          quality: qualityData ? {
            ctaCaptureRate: qualityData.ctaCaptureRate,
            distractorRatio: qualityData.distractorRatio,
            score: qualityData.qualityScore,
          } : null,
          duration: `${Date.now() - startTime}ms`,
        };

        const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
          { type: "text", text: JSON.stringify(storyResponse, null, 2) },
          ...images,
        ];

        try { unlinkSync(ssPath); } catch {}
        return { content };
      } finally {
        if (ownsVcsBrowser) await browser.close();
      }
    } catch (err) {
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: JSON.stringify({ error: err instanceof Error ? err.message : String(err), url, persona }, null, 2),
        }],
      };
    }
  });
}

/**
 * The canonical empathy_audit. Exported on its own so the stdio server can
 * register it too: mcp-server.ts carried a second, older implementation of
 * the same tool name that returned a thin summary with no barrier rects, no
 * persona weighting and no UI resource. Two implementations of one tool is a
 * bug generator -- fixes landed on the remote one for weeks while the local
 * one silently served stale shapes -- and registerAuditTools cannot simply be
 * called from there because three of its other tools collide with the stdio
 * server's own. (2026-07-31)
 */
export function registerEmpathyAuditTool(server: McpServer): void {
  server.registerTool("empathy_audit", {
    // Barriers ranked by severity is the artifact a product team acts on, and
    // nested JSON buries the ordering that makes it actionable.
    _meta: { ui: { resourceUri: "ui://cbrowser/empathy" } },
    title: "Empathy Accessibility Audit",
    description: "Simulate how real users experience a site. Accepts ANY persona — disability personas get specialized barrier detection, non-disability personas get general UX analysis with a flag. Tests ONE persona per call. Disability: motor-impairment-tremor, low-vision-magnified, cognitive-adhd, dyslexic-user, deaf-user, elderly-low-vision, color-blind-deuteranopia. General: first-timer, power-user, mobile-user, elderly-user, impatient-user, or any custom persona.",
    inputSchema: {
      url: z.string().url().describe("URL to audit"),
      // Optional as of 2026-08-02. It was required, which implied every audit
      // traversed toward it — most do not. A cognitive journey runs only when an
      // API key is configured; without one, nothing reads this. Barrier
      // detection, the score, and the noBlockingBarriers verdict never do.
      goal: z.string().optional().describe("Optional. What the persona is trying to do (e.g. 'complete checkout'). Used ONLY when an API key is set, to drive a cognitive journey and record a goal path. Barrier detection and the empathy score do not use it, so omitting it changes nothing about the accessibility findings."),
      disabilities: z.array(z.string()).optional().describe("Persona to test. Accepts disability names OR any cognitive persona (first-timer, power-user, etc). Non-disability personas are flagged. Pass ONE for reliable results."),
      wcagLevel: z.enum(["A", "AA", "AAA"]).optional().default("AA").describe("WCAG conformance level"),
      maxSteps: z.number().optional().default(5).describe("Max cognitive journey steps (keep low for MCP)"),
      maxTime: z.number().optional().default(20).describe("Max time per persona in seconds"),
      // Base64 page screenshots are large enough to blow an MCP client's context
      // on a single call — every empathy_audit in the 18.73.3 test pass had to be
      // read off disk instead. Off by default; images go to disk and their paths
      // are returned. (2026-07-29)
      includeScreenshots: z.boolean().optional().default(false).describe("Inline base64 page screenshots in the response. Off by default because they are large enough to overflow an MCP client's context; when off, screenshots are written to disk and screenshotPath is returned instead."),
      scope: z.enum(["viewport", "full_page"]).optional().default("viewport").describe("What to score: 'viewport' (first impression, above-the-fold only — default) or 'full_page' (scroll through entire page, all barriers). Use 'viewport' for landing page optimization; 'full_page' for WCAG compliance audits."),
      device: z.string().optional().describe("Device emulation: 'mobile', 'tablet', 'desktop', or specific device like 'iPhone 15', 'Pixel 7'. Essential for mobile WCAG audits — touch targets, viewport sizing, and responsive barriers differ significantly on mobile."),
      // Description only, behaviour unchanged. The view is declared on the tool
      // (_meta.ui above), so the host renders it whatever this flag says; the
      // old text told scripted callers to set it false, which did nothing.
      // (2026-10-07)
      uiResource: z.boolean().optional().default(true).describe("Deprecated; has no effect. The interactive report is declared on this tool (ui://cbrowser/empathy), so hosts that support MCP Apps render the view regardless of this value, and hosts that do not simply show the JSON. The JSON text block is the same either way. Accepted only so existing callers do not break."),
    },
    annotations: {
      title: "Empathy Accessibility Audit",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ url, goal, disabilities, wcagLevel, maxSteps, maxTime, scope, device, includeScreenshots, uiResource }) => {
      try {
        // Auto-limit to 1 persona to avoid MCP client timeout on Claude.ai (~60s limit)
        const allPersonas = listAccessibilityPersonas();
        const requestedList = disabilities || allPersonas;
        const wasLimited = requestedList.length > 1;
        const singlePersona = [requestedList[0]];

        const result = await runEmpathyAudit(url, {
          goal,
          disabilities: singlePersona,
          wcagLevel,
          maxSteps,
          maxTime,
          headless: true,
          scope: scope || "viewport",
          device: device || undefined,
        });
        // Build response with guidance for additional personas
        const testedPersona = singlePersona[0];
        const remainingPersonas = allPersonas.filter(p => p !== testedPersona);

        // The findings shown, selected once so the overlay and the list agree.
        // Both the numbered boxes on the map and the numbered entries in the
        // list index into this array, so box 3 is finding 3 by construction
        // rather than by two pieces of code happening to sort the same way.
        const chosenBarriers = (() => {
          const top = result.topBarriers.slice(0, 5);
          const covered = new Set(top.flatMap((b) => b.wcagCriteria ?? []));
          const rescued: typeof top = [];
          for (const b of result.topBarriers.slice(5)) {
            const missing = (b.wcagCriteria ?? []).filter((c) => !covered.has(c));
            if (missing.length === 0) continue;
            missing.forEach((c) => covered.add(c));
            rescued.push(b);
          }
          // Numbered in the order they are DISPLAYED (worst-first by the
          // persona-weighted grade, which is how the widget sorts them), so
          // the numbers on the map read 1,2,3 down the list instead of
          // whatever order the analyzer happened to emit.
          const rank = (b: any) => {
            const { weight } = barrierWeightFor(
              testedPersona, String(b.type ?? ""), b.wcagCriteria);
            const { severity } = weightedSeverity(String(b.severity ?? "minor"), weight);
            const order: Record<string, number> = {
              critical: 0, blocker: 0, high: 1, major: 1, serious: 1,
              medium: 2, moderate: 2, low: 3, minor: 3, info: 4, notice: 4 };
            return order[String(severity).toLowerCase()] ?? 9;
          };
          return [...top, ...rescued].sort((a, b) => rank(a) - rank(b));
        })();
        // Group keys in list order; a rect's key looked up here gives its
        // finding number.
        const findingKeys = chosenBarriers.map(
          (b) => `${b.type}|${weightKeyFor(String(b.type ?? ""), b.wcagCriteria) ?? ""}`);

        const response: Record<string, unknown> = {
          url: result.url,
          goal: result.goal,
          testedPersona,
          overallScore: result.overallScore,
          scope: scope || "viewport",
          device: device || "desktop",
          scopeNote: scope === "full_page"
            ? "Full-page audit: scrolled through entire page before barrier detection. Scores reflect all content including below-the-fold."
            : "Viewport-only audit: scored first impression (above-the-fold). Use scope='full_page' for complete barrier inventory, or cognitive_journey for path-dependent experience.",
          // How many barriers the viewport filter removed. Until 2026-08-05 the
          // scope flag reached exactly one of eleven detectors, so a viewport
          // audit scored content seven screens below the fold and said nothing.
          // Reported so a silent filter cannot be mistaken for no filter.
          ...((result as { outOfViewportBarriersDropped?: number }).outOfViewportBarriersDropped
            ? {
                outOfViewportBarriersDropped: (result as { outOfViewportBarriersDropped?: number }).outOfViewportBarriersDropped,
                scopeFilterNote: `${(result as { outOfViewportBarriersDropped?: number }).outOfViewportBarriersDropped} barrier(s) outside the viewport were excluded from scoring. Use scope='full_page' to include them.`,
              }
            : {}),
          resultsSummary: result.results.map((r) => {
            const uniqueTypes = new Set(r.barriers.map(b => b.type));
            return {
              persona: r.persona,
              disabilityType: r.disabilityType,
              // What the audit actually computed: no barrier found that would
              // block this persona. Renamed from goalAchieved, which asserted a
              // completed task nobody attempted.
              noBlockingBarriers: r.noBlockingBarriers,
              /** @deprecated one release only — use noBlockingBarriers */
              goalAchieved: r.noBlockingBarriers,
              empathyScore: r.empathyScore,
              // v18.22.0: Added score context for transparency
              // Whitelist projection: anything added to scoreContext upstream is
              // invisible to the caller unless named here. The blend breakdown
              // below is what lets the deductions reconcile to a score the
              // caller can actually see. (2026-07-28)
              scoreContext: r.scoreContext ? {
                explanation: r.scoreContext.explanation,
                deductionsByType: r.scoreContext.deductionsByType,
                totalBarrierDeduction: (r.scoreContext as any).totalBarrierDeduction,
                frictionDeduction: r.scoreContext.frictionDeduction,
                goalDeduction: r.scoreContext.goalDeduction,
                cognitiveOverloadPenalty: (r.scoreContext as any).cognitiveOverloadPenalty,
                appliedBarrierWeights: (r.scoreContext as any).appliedBarrierWeights,
                explainsScore: (r.scoreContext as any).explainsScore,
                barrierOnlyScore: (r.scoreContext as any).barrierOnlyScore,
                perceptualScore: (r.scoreContext as any).perceptualScore,
                blendWeights: (r.scoreContext as any).blendWeights,
                finalScore: (r.scoreContext as any).finalScore,
                // A partial score must be distinguishable from a measured one.
                // Set when the navigation simulation threw: the goal traversal
                // did not run, so no goal deduction was charged and the score
                // reflects barriers only. Without these two names the whitelist
                // above would drop the flag and the score would read as clean.
                degraded: (r.scoreContext as any).degraded,
                degradedReason: (r.scoreContext as any).degradedReason,
              } : undefined,
              barrierTypeCount: uniqueTypes.size,
              barrierTypes: Array.from(uniqueTypes),
              affectedElements: r.barriers.length,
              wcagViolationCount: r.wcagViolations.length,
              // v18.26.0: Perceptual transport metrics (Wasserstein-based)
              perceptualTransport: (r as any).perceptualTransport || undefined,
              empathyScoreBarrierOnly: (r as any).empathyScoreBarrierOnly || undefined,
              // v18.27.0: Cognitive load estimation (optimal transport)
              cognitiveLoad: (r as any).cognitiveLoad || undefined,
              // Names the three different "cognitive load" numbers in this
              // payload and what each measures. Same whitelist caveat as
              // scoreContext above: set upstream, invisible unless named here.
              cognitiveLoadReadings: (r as any).cognitiveLoadReadings || undefined,
              // v18.28.0: Attention transport analysis (W₂ saliency)
              attentionAnalysis: (r as any).attentionAnalysis || undefined,
              // Same metric names as the attention_analysis tool, different
              // implementation, and the distributions do not overlap --
              // measured on one page: alignment 0.884 here against 0.389-0.616
              // there, concentration 0.292 against 0.65-0.90, transportCost
              // 0.460 against 0.756-1.010. Comparing a number from one against
              // a number from the other is meaningless, and nothing said so.
              // Corrected: this is the SAME analyzeAttention implementation the
              // attention_analysis tool calls, not a second one. The earlier
              // note claimed otherwise, which was wrong -- the divergence comes
              // from parameters, a 16px grid here against the tool's finer
              // default and a viewport rather than full-page capture.
              attentionAnalysisNote: (r as any).attentionAnalysis
                ? "Same analyzeAttention implementation the attention_analysis tool uses, run here on a 16px grid over the viewport rather than the tool's finer default — so the values are not comparable across the two and only entropy, concentration and transportCost are published, because those are the three that feed this audit's perceptual score. Call attention_analysis directly for attention metrics."
                : undefined,
              // v18.29.0: Journey validation — evidence, path, forensics
              journeyValidation: (r as any).journeyValidation || undefined,
              // v18.35.0: Non-disability persona flag
              isDisabilityPersona: (r as any).isDisabilityPersona !== false,
              personaNote: (r as any).personaNote || undefined,
              // Media this page cannot decide about. Not barriers and not
              // scored: a third-party embed keeps its caption and description
              // tracks inside a cross-origin iframe, so the only honest report
              // is that the question is open and where to go to close it.
              // Previously these were asserted as missing captions.
              unverifiableMedia: (r as any).unverifiableMedia || undefined,
            };
          }),
          allWcagViolations: result.allWcagViolations,
          // Top five, PLUS one barrier for every WCAG criterion the top five
          // would otherwise drop.
          //
          // A flat slice made the audit unusable for compliance: 1.1.1 and
          // 1.2.2 appeared in allWcagViolations while no barrier, remediation
          // or rect mentioned them, so fixing everything listed still left two
          // violations with nothing saying what they were. The criteria are
          // reported either way, so the slice was hiding the explanation while
          // keeping the accusation.
          topBarriers: (() => {
            const chosen = chosenBarriers;
            // Severity as this persona experiences it, alongside the base.
            // The base is what maps to WCAG conformance -- a criterion is not
            // more or less violated depending on who reads it -- so both ship
            // and the weight that separates them ships with them.
            return chosen.map((b, i) => {
              const { weight, key, defaulted } = barrierWeightFor(
                testedPersona, String(b.type ?? ""), b.wcagCriteria);
              const { severity, shifted } = weightedSeverity(String(b.severity ?? "minor"), weight);
              return {
                ...b,
                // Same number the overlay draws on the matching boxes.
                finding: i + 1,
                severityForPersona: severity,
                personaWeight: Math.round(weight * 100) / 100,
                personaWeightKey: key,
                // An unmeasured 1.0 and a measured 1.0 mean different things.
                // Saying which prevents a default from reading as a finding.
                personaWeightIsDefault: defaulted,
                ...(shifted !== 0
                  ? { severityShiftedBy: shifted > 0 ? `+${shifted}` : String(shifted) }
                  : {}),
              };
            });
          })(),
          topBarriersNote:
            "Ordered worst-first by severityForPersona — the persona-weighted grade — so an entry can sit above a higher WCAG severity when this persona is more susceptible to it. Any entries after the fifth are included because they carry a WCAG criterion the top five do not.",
          // Asserting full coverage was itself a defect: the claim held only
          // when a barrier existed for every criterion, and said nothing when
          // one did not. Now it reports the gap instead of asserting there
          // isn't one.
          wcagCriteriaWithoutBarrier: (() => {
            const covered = new Set(result.topBarriers.flatMap((b: any) => b.wcagCriteria ?? []));
            const missing = Array.from(result.allWcagViolations ?? []).filter((c: any) => !covered.has(c));
            return missing.length ? missing : undefined;
          })(),
          // A barrier's affectedPersonas names the personas it hits HARDEST. It
          // is not an exclusion list, which is why a persona absent from it can
          // still take a deduction — susceptibility is applied as a weight, not
          // a gate (see scoreContext.appliedBarrierWeights). Stating it here
          // because the pairing otherwise reads as a contradiction: a
          // touch_target barrier listing motor and elderly personas, scored
          // against cognitive-adhd. (2026-07-29)
          // Same treatment cognitiveLoadReadings got: state why two numbers
          // that look contradictory are both right, rather than leaving a
          // reader to conclude one is broken.
          scoreFieldNotes: {
            cognitiveOverloadPenalty:
              "Persona susceptibility to visual noise, derived from the persona's own noiseTolerance and charged on every page — NOT a finding that this page overloaded anyone. It is non-zero for a sensitive persona even where cognitiveLoad.overloaded is false, because that flag is a separate page measurement against a threshold. The two disagreeing is expected.",
          },
          barrierFieldNotes: {
            affectedPersonas: "Exemplars — the personas this barrier affects most. NOT an exclusion list; every tested persona is scored against every barrier, weighted by susceptibility.",
            severity: "On topBarriers entries this is the group maximum across all elements of that type (severityIsGroupMax), not one element's severity.",
            severityForPersona: "The same barrier re-graded by this persona's susceptibility weight, which is what should drive triage order. `severity` stays the WCAG-facing grade: a criterion is not more or less violated depending on who reads it. A 169-item navigation is genuinely minor to most personas and critical to cognitive-adhd, whose cognitive_load weight is 3.0 — and only the weighted grade says so.",
          },
          topRemediation: result.combinedRemediation.slice(0, 5),
          duration: result.duration,
          // Errors caught during the run, promoted out of the HTML report. The
          // SVG className crash changed goalAchieved and the goal deduction while
          // being visible ONLY in the HTML, so the JSON reported a confident
          // wrong number. Anything that moves a scored field is surfaced here.
          errors: result.results.flatMap((r) =>
            (r.frictionPoints ?? [])
              .filter((fp: any) => fp.type === "error")
              .map((fp: any) => ({ persona: r.persona, message: fp.description })),
          ),
          // v18.60.0: Include per-result screenshots and element rects for WCAG overlay
          pageScreenshots: result.results?.map((r: any) => ({
            persona: r.persona,
            ...(includeScreenshots
              ? { screenshot: r.pageScreenshot }
              : (() => {
                  const shot = writeAuditScreenshot(r.pageScreenshot, r.persona);
                  return {
                    screenshotPath: shot.path,
                    screenshotUrl: shot.url,
                    screenshotFile: shot.file,
                    screenshotNote: "Pass includeScreenshots:true to inline the base64 instead.",
                  };
                })()),
            viewportSize: r.viewportSize,
            // How much of the barrier set the overlay can actually draw.
            //
            // A rect needs an element that resolved to a bounding box at
            // capture time, so anything below the fold, hidden, or behind an
            // unresolvable selector produces a barrier with no box. The
            // overlay then silently understates coverage -- 21 affected
            // elements against 10 rects reads as "10 problems" unless the gap
            // is stated. Reported rather than papered over, the same way
            // cognitiveLoadReadings reports its disagreement.
            barrierRectCoverage: (() => {
              // Counted the same way barrierRects is built below, from
              // barriers that resolved to a rect. Reading r.barrierRects gave
              // 0 every time: that field is this payload's OUTPUT name, not an
              // input, so the coverage line reported drawn:0 beside ten
              // populated rects.
              // Zero-area rects draw nothing. They were counted as drawn, so
              // coverage read 19 while only 16 boxes were visible -- an
              // element that resolved to {0,0,0,0} (display:none, a collapsed
              // menu item) is undrawn in every sense that matters.
              const rects = (r.barriers ?? []).filter(
                (b: any) => b.rect && b.rect.width > 0 && b.rect.height > 0).length;
              const affected = (r.barriers ?? []).reduce(
                (n: number, b: any) => n + (b.affectedElementCount ?? 1), 0);
              return {
                drawn: rects,
                affectedElements: affected,
                ...(affected > rects
                  ? { undrawn: affected - rects,
                      undrawnReason: "Barriers whose element did not resolve to a bounding box at capture time — typically below the fold, hidden, or an unresolvable selector. They are counted in the score and listed in barriers, but the overlay cannot outline them." }
                  : {}),
              };
            })(),
            // Rects come from getBoundingClientRect with no scroll compensation,
            // so they are VIEWPORT coordinates — which is correct here, because
            // the screenshot above is captured with fullPage: false and these are
            // meant to overlay it. Converting them to document coordinates would
            // break that alignment.
            //
            // The real hazard is scope: "full_page", where the audit scrolls and
            // rects captured at different offsets land in one list against a
            // single viewport image; anything above the captured viewport then
            // carries a negative y and would render off-canvas. Say which space
            // these are in and flag the ones that fall outside the image rather
            // than emitting silent negatives. (2026-07-28)
            // Rects are now DOCUMENT coordinates (scroll offset added at capture),
            // so they are stable across the scrolling that scope:"full_page" does.
            // They were previously labelled "viewport" while holding values from
            // several scroll positions at once — y:-274 and y:3951 in one list.
            coordinateSpace: "document",
            // The document-space region the screenshot actually covers, so a
            // consumer can map a rect onto the image without guessing. A
            // full_page capture starts at the document origin; a viewport
            // capture starts wherever the page was scrolled to.
            //
            // These two fields exist because captureHeight alone was not
            // enough: it reported documentHeight while the image was the
            // viewport, and the overlay scaled 5363px of coordinates onto an
            // 800px picture. Origin plus size is the whole answer, and it is
            // read from the PNG header rather than measured separately, so it
            // cannot disagree with the picture it describes. (2026-07-31)
            captureOrigin: scope === "full_page"
              ? { x: 0, y: 0 }
              : (r.captureScroll ?? { x: 0, y: 0 }),
            captureSize: r.screenshotSize,
            // Height of the captured image in document space. A viewport capture
            // covers only the scroll position it was taken at; a full_page capture
            // covers the document. Without this the bounds test compared document
            // coordinates against a viewport height and flagged EVERY rect,
            // including ones plainly inside the image. (2026-07-29)
            // The height of the image that exists, preferred over the
            // separately-measured documentHeight. A page that lazy-loads
            // during capture makes the two disagree, and the picture is the
            // one the boxes are drawn on.
            captureHeight: r.screenshotSize?.height
              ?? (scope === "full_page" ? (r.documentHeight ?? undefined) : r.viewportSize?.height),
            barrierRects: r.barriers?.filter(
              (b: any) => b.rect && b.rect.width > 0 && b.rect.height > 0).map((b: any) => {
              // Bounds tested in IMAGE space: document rect minus capture
              // origin, against the real image size. Testing document
              // coordinates against documentHeight passed every rect as
              // "inside" even when the image showed only the top 800px, so
              // nothing was ever listed as off-capture and the overlay
              // claimed coverage it did not have.
              const origin = scope === "full_page"
                ? { x: 0, y: 0 }
                : (r.captureScroll ?? { x: 0, y: 0 });
              const size = r.screenshotSize
                ?? { width: r.viewportSize?.width ?? Infinity,
                     height: scope === "full_page" ? (r.documentHeight ?? Infinity) : (r.viewportSize?.height ?? Infinity) };
              const ix = b.rect ? b.rect.x - origin.x : 0;
              const iy = b.rect ? b.rect.y - origin.y : 0;
              const outside = !!b.rect && (
                iy + b.rect.height < 0 || ix + b.rect.width < 0 ||
                iy > size.height || ix > size.width
              );
              // The map is coloured by the SAME grade the findings list is
              // ranked by. It previously carried only the raw WCAG severity
              // while the list below it used severityForPersona, so on a
              // weighted audit one barrier was orange on the map and red in
              // the list -- two scales, no label saying which was which.
              // (2026-07-31)
              const { weight } = barrierWeightFor(
                r.persona, String(b.type ?? ""), b.wcagCriteria);
              const { severity: weighted } = weightedSeverity(
                String(b.severity ?? "minor"), weight);
              // Which findings-list entry this box belongs to. Boxes are
              // per-element and findings are grouped by type+criterion, so
              // ten boxes can map to five findings; without the link there is
              // no way to tell which box the list is talking about.
              const gk = `${b.type}|${weightKeyFor(String(b.type ?? ""), b.wcagCriteria) ?? ""}`;
              const findingIndex = findingKeys.indexOf(gk);
              return {
                type: b.type, severity: b.severity, element: b.element,
                severityForPersona: weighted,
                ...(findingIndex >= 0 ? { finding: findingIndex + 1 } : {}),
                description: b.description, rect: b.rect,
                wcag: b.wcagCriteria,
                ...(outside ? { outsideScreenshot: true } : {}),
              };
            }),
          // Keep entries that carry EITHER the inline image or a path to it.
          // Filtering on `screenshot` alone silently dropped every entry once
          // the default stopped inlining base64, taking the barrierRects with
          // them. (2026-07-29)
          })).filter((s: any) => s.screenshot || s.screenshotPath),
        };

        // Add guidance if we limited the request
        if (wasLimited) {
          response.note = `Limited to 1 persona to avoid timeout. For full coverage, call again with: ${remainingPersonas.slice(0, 3).join(", ")}${remainingPersonas.length > 3 ? `, and ${remainingPersonas.length - 3} more` : ""}`;
          response.remainingPersonas = remainingPersonas;
        }

        // Auto-save handled by tier-gate wrapper.
        //
        // The UI resource is APPENDED to the text block, never substituted for
        // it: content[0] stays the same JSON every CLI and CI caller already
        // parses. `generateEmpathyAuditHtmlReport` is the report the --html flag
        // has always produced — self-contained, no remote refs — so this is a
        // transport seam rather than new UI. If it cannot be produced safely,
        // htmlUiResource returns null and the response is exactly as before.
        // (2026-07-29)
        const content: ToolContentBlock[] = [
          { type: "text", text: JSON.stringify(response, null, 2) },
        ];
        // No UI resource is attached here any more.
        //
        // Both mcp-ui attachments are retired: the whole-report rawHtml and the
        // barrier overlay. Both embedded rendered HTML in the result, which
        // costs payload against the host's ~150k cap, and the overlay's boxes
        // were drawn over an img on cbrowser.ai that the widget sandbox will
        // not load -- outlines over empty space. Both are now served by
        // ui://cbrowser/empathy, declared on the tool, where the host fetches
        // the view and the overlay pulls its screenshot through artifact_fetch.
        //
        // uiResource is still accepted as an argument so existing callers do
        // not break; it simply no longer changes the response.
        return { content };
      } catch (error) {
        // Categorize the error for better user feedback
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;

        // Determine error type for actionable feedback
        let errorType = "unknown";
        let suggestion = "Please try again or contact support if the issue persists.";

        if (errorMessage.includes("timeout") || errorMessage.includes("Timeout")) {
          errorType = "timeout";
          suggestion = "The page took too long to load. Try increasing maxTime or testing a faster page.";
        } else if (errorMessage.includes("net::") || errorMessage.includes("DNS") || errorMessage.includes("ERR_")) {
          errorType = "network";
          suggestion = "Unable to reach the URL. Check the URL is valid and accessible.";
        } else if (errorMessage.includes("blocked") || errorMessage.includes("403") || errorMessage.includes("captcha")) {
          errorType = "bot-detection";
          suggestion = "The site may be blocking automation. Try with a different URL.";
        } else if (errorMessage.includes("chromium") || errorMessage.includes("browser")) {
          errorType = "browser";
          suggestion = "Browser automation error. The server may need to restart.";
        }

        // Log the full error for debugging
        console.error(`[empathy_audit] Error: ${errorMessage}`);
        if (errorStack) {
          console.error(`[empathy_audit] Stack: ${errorStack}`);
        }

        // Return a structured error response
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: true,
                errorType,
                message: errorMessage,
                suggestion,
                url,
                goal,
                disabilities: disabilities || "all",
              }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );
}
