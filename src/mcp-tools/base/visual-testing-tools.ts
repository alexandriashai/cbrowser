/**
 * CBrowser MCP Tools - Visual Testing Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import { getDefaultConfig } from "../../config.js";
import { resolveValuesForPersona } from "../../values/persona-values.js";
import { writeArtifact } from "../../artifact-store.js";
import { buildContentWithPreviews } from "../inline-image.js";
import type { ContentBlock } from "../screenshot-utils.js";

/**
 * Scroll a page for an attention measurement, and say how to put it back.
 *
 * Shared by attention_analysis and attention_compare so the two cannot drift:
 * scrolling happens BEFORE the screenshot and the DOM read, both of which are
 * taken in the viewport, so the heatmap and element coordinates describe the
 * same band of the page. The page clamps an over-large offset; what applied is
 * reported, not what was asked. `restore` returns a caller's session to the
 * scroll position it had. (2026-10-09)
 */
async function scrollForAnalysis(
  page: { evaluate: <T, A>(fn: (a: A) => T, arg: A) => Promise<T> } & { evaluate: <T>(fn: () => T) => Promise<T> },
  scrollY: number | undefined,
): Promise<{ scroll?: { requested: number; applied: number; maxScrollY: number }; restore: () => Promise<void> }> {
  const original: number = await page.evaluate(() => window.scrollY).catch(() => 0);
  let scroll: { requested: number; applied: number; maxScrollY: number } | undefined;
  if (scrollY !== undefined) {
    // behavior "instant" overrides a page's CSS scroll-behavior: smooth.
    // Without it the scroll ANIMATES: the position read back is where the page
    // still was (cbrowser.ai: asked 2000, reported 0), and the screenshot can
    // land mid-scroll. (Live check, 2026-10-09)
    const applied = await page.evaluate((y: number) => {
      window.scrollTo({ top: y, left: 0, behavior: "instant" as ScrollBehavior });
      return { applied: Math.round(window.scrollY), max: Math.max(0, Math.round(document.documentElement.scrollHeight - window.innerHeight)) };
    }, scrollY);
    // Lazy content and sticky headers settle on scroll.
    await new Promise((r) => setTimeout(r, 500));
    scroll = { requested: scrollY, applied: applied.applied, maxScrollY: applied.max };
  }
  return {
    ...(scroll ? { scroll } : {}),
    restore: async () => {
      await page.evaluate((y: number) => window.scrollTo({ top: y, left: 0, behavior: "instant" as ScrollBehavior }), original).catch(() => {});
    },
  };
}

/**
 * Resolve a persona before anything is measured, or return the tool's refusal.
 *
 * Loads the calling account's CMS personas first (scoped to that account), so a
 * custom persona resolves exactly as list_cognitive_personas shows it. An
 * unknown name is refused here: it used to reach the relevance LLM as a bare
 * string, which role-played it from the name alone. (2026-10-09)
 */
async function resolveOrRefuse(requested: string): Promise<
  | { ok: true; name: string; resolvedFrom?: string }
  | { ok: false; result: { isError: true; content: Array<{ type: "text"; text: string }> } }
> {
  try {
    const { loadAccountPersonas } = await import("../account-personas.js");
    const { getSessionApiKey } = await import("./cognitive-tools.js");
    await loadAccountPersonas(getSessionApiKey());
  } catch { /* falls back to disk and built-ins */ }
  const { resolvePersonaForTool, UnknownPersonaError } = await import("../../personas.js");
  try {
    const r = resolvePersonaForTool(requested);
    return { ok: true, name: r.name, ...(r.resolvedFrom ? { resolvedFrom: r.resolvedFrom } : {}) };
  } catch (e) {
    if (!(e instanceof UnknownPersonaError)) throw e;
    return { ok: false, result: { isError: true, content: [{ type: "text" as const, text: JSON.stringify({
      error: e.message, code: e.code, persona: requested, suggestions: e.suggestions,
    }, null, 2) }] } };
  }
}
import type { McpServer, ToolRegistrationContext } from "../types.js";
import {
  runVisualRegression,
  runCrossBrowserTest,
  runResponsiveTest,
  runABComparison,
  crossBrowserDiff,
  captureVisualBaseline,
} from "../../visual/index.js";

/**
 * attention_analysis's result: the JSON, then the heatmap as an image block.
 *
 * Hosts truncate tool results near 150k characters and substitute a file
 * pointer for the payload, which downstream arrives as unparseable text.
 * Measured: a 1280x800 heatmap PNG is ~738k characters of base64, five times
 * the cap, so shipping it inline destroyed the JSON it accompanied (28e5786).
 * That fix kept the cap by dropping the picture whenever it was over a fixed
 * 100k budget -- which, at real page sizes, was always, so the tool whose
 * finding IS the heatmap returned no heatmap.
 *
 * The picture now always rides along as a JPEG preview fitted to what the JSON
 * leaves of the cap, `heatmapPreview` says exactly what was attached, and the
 * full-resolution PNG stays at heatmapUrl / heatmapFile for artifact_fetch.
 */
export async function assembleAttentionContent(
  data: Record<string, unknown>,
  heatmapPng: Buffer | undefined,
  fullResolution: string,
): Promise<ContentBlock[]> {
  if (!heatmapPng) return [{ type: "text", text: JSON.stringify(data, null, 2) }];
  return buildContentWithPreviews(
    data,
    [{ name: "heatmap", png: heatmapPng, fullResolution }],
    (p) => ({ heatmapPreview: p.heatmap }),
  );
}

/**
 * Register visual testing tools (6 tools: visual_baseline, visual_regression, cross_browser_test, cross_browser_diff, responsive_test, ab_comparison)
 */
export function registerVisualTestingTools(server: McpServer, context?: ToolRegistrationContext): void {
  server.registerTool("visual_baseline", {
    title: "Capture Visual Baseline",
    description: "Capture a visual baseline using Wasserstein barycenter. Takes multiple screenshots, rejects outliers, computes optimal consensus reference with adaptive threshold. Robust to dynamic content, animations, and timing variations.",
    inputSchema: {
      url: z.string().url().describe("URL to capture baseline for"),
      name: z.string().describe("Name for the baseline"),
      captures: z.number().optional().default(3).describe("Number of screenshots (default 3). More = more robust but slower."),
      delay: z.number().optional().default(1500).describe("Delay between captures in ms"),
      selector: z.string().optional().describe("CSS selector to capture specific element"),
      device: z.string().optional().describe("Device emulation (e.g. mobile, tablet, iphone-15)"),
      waitFor: z.union([z.number(), z.string()]).optional().describe("Wait after page load: number = ms delay, string = CSS selector to wait for. Useful for client-side translation or deferred rendering."),
    },
    annotations: {
      title: "Capture Visual Baseline",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ url, name, captures, delay, selector, device, waitFor }) => {
      const { captureSmartBaseline } = await import("../../visual/index.js");
      const result = await captureSmartBaseline(url, name, {
        numCaptures: captures || 3,
        captureDelay: delay,
        selector,
        device,
        waitFor,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: true,
              name: result.name,
              captures: result.numCaptures,
              outliers: result.numOutliers,
              meanDistance: result.meanDistance,
              adaptiveThreshold: result.adaptiveThreshold,
              reference: result.referencePath,
              computeTime: `${result.computeTimeMs.toFixed(0)}ms`,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool("visual_regression", {
    title: "Visual Regression Test",
    description: "Run visual regression test against a baseline. Automatically uses smart regression (Wasserstein) if a smart baseline exists for this name, otherwise falls back to traditional comparison.",
    inputSchema: {
      url: z.string().url().describe("URL to test"),
      baselineName: z.string().describe("Name of baseline to compare against"),
      transportMap: z.boolean().optional().describe("Also generate a visual transport map showing where content moved"),
      threshold: z.number().optional().describe("Override similarity threshold (0-1). Smart baselines use adaptive thresholds by default."),
    },
    annotations: {
      title: "Visual Regression Test",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ url, baselineName, transportMap: wantMap, threshold }) => {
      // Check if a smart baseline exists — if so, use smart regression
      const { getSmartBaseline, runSmartRegression, runRegressionWithTransportMap } = await import("../../visual/index.js");
      const smartBaseline = getSmartBaseline(baselineName);

      // transportMap used to be handled ONLY inside this smart-baseline branch,
      // so asking for a map against a traditional baseline fell through to the
      // plain path below and the flag was silently ignored — no map, no error,
      // no explanation. runRegressionWithTransportMap handles both kinds (it
      // falls back to regularBaseline.screenshotPath), so honour the flag first
      // and report which kind of baseline answered. (2026-07-29)
      if (wantMap) {
        const result = await runRegressionWithTransportMap(url, baselineName, { threshold });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                mode: smartBaseline ? "smart+transport" : "traditional+transport",
                passed: result.passed,
                similarity: result.analysis.similarityScore,
                status: result.analysis.overallStatus,
                summary: result.analysis.summary,
                ...(smartBaseline
                  ? { adaptiveThreshold: smartBaseline.adaptiveThreshold }
                  : { note: "Traditional baseline: scored by combined Wasserstein distance, not against an adaptive threshold. Capture with visual_baseline captures=5 for smart regression." }),
                hotspots: result.transportMap?.hotspots,
                flows: result.transportMap?.flows.length,
                svgPath: result.transportMapSvgPath,
              }, null, 2),
            },
          ],
        };
      }

      if (smartBaseline) {
        const result = await runSmartRegression(url, baselineName, { threshold });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                mode: "smart",
                passed: result.passed,
                similarity: result.analysis.similarityScore,
                status: result.analysis.overallStatus,
                summary: result.analysis.summary,
                adaptiveThreshold: smartBaseline.adaptiveThreshold,
                rawAnalysis: result.analysis.rawAnalysis,
              }, null, 2),
            },
          ],
        };
      }

      // Traditional regression
      const result = await runVisualRegression(url, baselineName);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              mode: "traditional",
              passed: result.passed,
              similarityScore: result.analysis?.similarityScore,
              summary: result.analysis?.summary,
              changes: result.analysis?.changes?.length || 0,
              tip: "Capture with visual_baseline captures=5 for smart Wasserstein regression",
            }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool("cross_browser_test", {
    title: "Cross-Browser Test",
    description: "Test page rendering across multiple browsers",
    inputSchema: {
      url: z.string().url().describe("URL to test"),
      browsers: z.array(z.enum(["chromium", "firefox", "webkit"])).optional().describe("Browsers to test"),
    },
    annotations: {
      title: "Cross-Browser Test",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ url, browsers }) => {
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

  server.registerTool("cross_browser_diff", {
    title: "Cross-Browser Diff",
    description: "Quick diff of page metrics across browsers",
    inputSchema: {
      url: z.string().url().describe("URL to compare"),
      browsers: z.array(z.enum(["chromium", "firefox", "webkit"])).optional().describe("Browsers to compare"),
    },
    annotations: {
      title: "Cross-Browser Diff",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ url, browsers }) => {
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

  server.registerTool("responsive_test", {
    title: "Responsive Test",
    description: "Test page across different viewport sizes",
    inputSchema: {
      url: z.string().url().describe("URL to test"),
      viewports: z.array(z.string()).optional().describe("Viewport presets (mobile, tablet, desktop, etc.)"),
    },
    annotations: {
      title: "Responsive Test",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ url, viewports }) => {
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

  server.registerTool("ab_comparison", {
    title: "A/B Visual Comparison",
    description: "Compare two URLs visually (staging vs production)",
    inputSchema: {
      urlA: z.string().url().describe("First URL (e.g., staging)"),
      urlB: z.string().url().describe("Second URL (e.g., production)"),
      labelA: z.string().optional().describe("Label for first URL"),
      labelB: z.string().optional().describe("Label for second URL"),
    },
    annotations: {
      title: "A/B Visual Comparison",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ urlA, urlB, labelA, labelB }) => {
      const labels = labelA && labelB ? { a: labelA, b: labelB } : undefined;
      const result = await runABComparison(urlA, urlB, { labels });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              overallStatus: result.overallStatus,
              similarityScore: result.analysis?.similarityScore,
              summary: result.summary,
              differences: result.differences.slice(0, 10).map(d => ({
                type: d.type,
                severity: d.severity,
                description: d.description,
                affectedSide: d.affectedSide,
              })),
              differenceCount: result.differences.length,
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

  // smart_baseline and smart_regression merged into visual_baseline and visual_regression (v18.34.0)

  server.registerTool("transport_map", {
    title: "Visual Transport Map",
    description: "Generate a Visual Transport Map showing WHERE visual content moved between two screenshots. Produces heatmap, flow arrows, hotspots, and SVG visualization.",
    inputSchema: {
      baselinePath: z.string().describe("Path to baseline screenshot"),
      currentPath: z.string().describe("Path to current screenshot"),
      cellSize: z.number().optional().describe("Grid cell size in pixels (default: 32)"),
      hotspots: z.number().optional().describe("Number of hotspots to identify (default: 5)"),
    },
    annotations: {
      title: "Visual Transport Map",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ baselinePath, currentPath, cellSize, hotspots: numHotspots }) => {
      const { computeTransportMap } = await import("../../visual/distance-metrics.js");
      const result = await computeTransportMap(baselinePath, currentPath, { cellSize, numHotspots });

      // Save SVG
      const { writeFileSync, mkdirSync, existsSync } = await import("fs");
      const { join } = await import("path");
      const { homedir } = await import("os");
      const baseDir = process.env.CBROWSER_DATA_DIR || join(homedir(), ".cbrowser");
      const mapsDir = join(baseDir, "transport-maps");
      if (!existsSync(mapsDir)) mkdirSync(mapsDir, { recursive: true });
      const svgPath = join(mapsDir, `transport-map-${Date.now()}.svg`);
      writeFileSync(svgPath, result.svg);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              grid: result.gridSize,
              flows: result.flows.length,
              totalCost: result.totalCost,
              hotspots: result.hotspots,
              svgPath,
              dimensions: result.dimensions,
              computeTime: `${result.computeTimeMs.toFixed(0)}ms`,
            }, null, 2),
          },
        ],
      };
    }
  );

  // ── Attention Transport (v18.28.0) ──

  server.registerTool("attention_analysis", {
    title: "Attention Saliency Analysis",
    description: "Analyze where a persona's attention goes on a page. Two-layer model: (1) visual saliency via W₂ on CIE-Lab (what POPS), (2) DOM semantic analysis (what MATTERS — CTAs, headings, forms, nav). Blended 35/65 so a gray search bar a power-user prioritizes outweighs a flashy banner they ignore. Returns attention metrics, a quality score, and the heatmap overlay: inline as a JPEG preview sized to fit the result (described in heatmapPreview), with the full-resolution PNG at heatmapUrl / artifact_fetch({ file: heatmapFile }).",
    inputSchema: {
      url: z.string().optional().describe("URL to analyze. Optional with _browserToken: omit it to analyze the session's current page as it stands (logged in, mid-flow); pass it to navigate that session first. Required without a token."),
      _browserToken: z.string().optional().describe("Browser session token from a previous tool call (navigate, click, fill...). Analyzes that live session instead of a fresh browser, so authenticated and mid-flow states can be measured. The session keeps its viewport (device is ignored), and its scroll position and animation state are restored afterwards."),
      scrollY: z.number().min(0).optional().describe("Vertical scroll offset in CSS pixels to analyze at. The screenshot, heatmap and DOM coordinates are all taken in the viewport at this offset. Clamped to the page's maximum scroll; the applied value is reported in `scroll`."),
      persona: z.string().optional().default("first-timer").describe("Persona name"),
      goal: z.string().optional().describe("Task goal — elements matching this goal get boosted attention (e.g., 'find pricing', 'sign up for an account')"),
      cellSize: z.number().optional().default(4).describe("Saliency grid cell size in pixels (smaller = finer heatmap, default: 4)"),
      heatmap: z.boolean().optional().default(true).describe("Generate visual heatmap overlay (default: true)"),
      device: z.string().optional().describe("Device emulation: 'mobile', 'tablet', 'desktop', or specific device name"),
      useValues: z.boolean().optional().default(false).describe("Enable motivational value influence on saliency map generation and attention scoring. Default: false."),
      freezeAnimations: z.boolean().optional().default(false).describe("Pause CSS and Web-Animations before the screenshot, so two runs of an animated page are comparable. An infinite animation has no canonical frame, so sampling one at random reports where attention goes during a fraction of a loop as where attention goes. Default false: every published attention number was measured with animation live. Check `animationState` in the response for what actually ran."),
    },
    annotations: {
      title: "Attention Saliency Analysis",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    // Declares the attention view. The heatmap is the finding here, and a JSON
    // list of scores is a lossy description of where a persona actually looks.
    _meta: { ui: { resourceUri: "ui://cbrowser/attention" } },
  }, async ({ url, persona: requestedPersona, goal, cellSize, heatmap, device, useValues, freezeAnimations: doFreeze, _browserToken, scrollY }) => {
      const refuse = (error: string) => ({ isError: true as const, content: [{ type: "text" as const, text: JSON.stringify({ error }, null, 2) }] });
      if (!url && !_browserToken) return refuse("attention_analysis needs a url, or a _browserToken to analyze that session's current page.");
      if (_browserToken && !context?.getBrowserByToken) return refuse("This server does not support browser session tokens; pass a url instead.");
      const resolved = await resolveOrRefuse(requestedPersona);
      if (!resolved.ok) return resolved.result;
      const persona = resolved.name;
      const { CBrowser } = await import("../../browser.js");
      // A session is the caller's: analyze it, leave it as found (scroll,
      // animation state), never close it. A fresh browser is ours to close.
      let sessionToken: string | undefined;
      const browser = _browserToken
        ? await (async () => { const r = await context!.getBrowserByToken!(_browserToken); sessionToken = r.token; return r.browser; })()
        : new CBrowser({
        headless: true,
        // The CONFIGURED viewport, not a hardcoded 1920x1080.
        //
        // Every other tool renders at the configured default (1280x800) and
        // this one alone rendered at 1920x1080, so an attention run and a
        // cognitive_effort run were measuring DIFFERENT rendered pages while
        // reporting coordinates as if they shared a space. The tell was
        // attention regions coming back at x=1312 against a config that says
        // the viewport is 1280 wide -- impossible unless the page was wider.
        // (2026-08-02)
        ...(device ? { device: device.toLowerCase() } : {
          viewportWidth: getDefaultConfig().viewportWidth,
          viewportHeight: getDefaultConfig().viewportHeight,
        }),
      });
      const { join } = await import("path");
      const { tmpdir } = await import("os");
      const { unlinkSync } = await import("fs");

      const ownsBrowser = !_browserToken;
      let restoreSession: (() => Promise<void>) | undefined;
      try {
        if (ownsBrowser) await browser.launch();
        if (url) {
          await browser.navigate(url);
          await new Promise(r => setTimeout(r, 2000));
        }

        const page = await browser.getPage();
        const pageUrl = url ?? page.url();
        const viewport = page.viewportSize?.() ?? null;

        const { scroll, restore: restoreScroll } = await scrollForAnalysis(page as never, scrollY);
        if (!ownsBrowser) restoreSession = restoreScroll;

        // Freeze BEFORE the screenshot, which is the only moment that matters:
        // the saliency layer reads the image, so anything still moving when the
        // shutter opens is in the measurement.
        const { freezeAnimations: doFreezeAnimations, countRunningAnimations } =
          await import("../../visual/freeze-animations.js");
        let animationState: "frozen" | "live" = "live";
        let animationsStillRunning = -1;
        if (doFreeze) {
          try {
            animationState = await doFreezeAnimations(page as never);
          } catch { /* a failed freeze is reported below, never fatal */ }
          if (!ownsBrowser) {
            // The freeze stylesheet and reduced-motion emulation would outlive
            // this call in the caller's session; undo both with the scroll.
            const restoreBefore = restoreSession;
            restoreSession = async () => {
              await restoreBefore?.();
              await page.evaluate(() => {
                for (const st of Array.from(document.querySelectorAll("style"))) {
                  if ((st.textContent ?? "").includes("cbrowser-freeze-animations")) st.remove();
                }
                try { for (const a of document.getAnimations?.() ?? []) { try { a.play(); } catch { /* not resumable */ } } } catch { /* older engines */ }
              }).catch(() => {});
              await (page as { emulateMedia?: (o: { reducedMotion: null }) => Promise<unknown> }).emulateMedia?.({ reducedMotion: null }).catch(() => {});
            };
          }
        }
        // Measured either way. On a live run it says how much motion the number
        // was taken through; on a frozen run a non-zero value means the freeze
        // did not take, which must not be silent.
        animationsStillRunning = await countRunningAnimations(page as never);

        const screenshotPath = join(tmpdir(), `attn-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });

        // Extract DOM elements BEFORE saliency computation so they feed into the
        // attention model. This was the only inline copy of the collect+DPR-scale
        // dance; it now shares one implementation with visual_cognitive_story and
        // journey_heatmap_gif, so the scaling cannot drift between the three.
        const { computeAttentionQuality, extractPageElementsForAttention, collectDomAttentionElements } =
          await import("../../visual/attention-quality.js");
        const rawElements = await extractPageElementsForAttention(page);
        const dpr: number = await page.evaluate(() => window.devicePixelRatio).catch(() => 1);
        const pageElements = rawElements.map(el => ({
          ...el,
          x: el.x * dpr,
          y: el.y * dpr,
          width: el.width * dpr,
          height: el.height * dpr,
        }));

        // Run attention analysis with DOM semantic layer (visual + semantic blend)
        const { analyzeAttention } = await import("../../visual/attention-transport.js");
        // Account personas were loaded by resolveOrRefuse, before the browser.

        const domAttentionElements = await collectDomAttentionElements(page).catch(() => []);

        // Persona-judged relevance, replacing keyword overlap in the semantic
        // layer. Computed HERE rather than inside analyzeAttention so the one
        // network call is visible, cached and tier-gated at the boundary that
        // knows the caller's entitlement.
        let relevanceScores: Record<number, number> | undefined;
        let relevanceSource: string | undefined;
        let relevanceReasoning: string | undefined;
        // Method AND provenance: whether this call judged, or replayed a
        // cached judgement (and how old it is). See relevanceProvenance.
        let relevanceFields: Record<string, unknown> = {};
        if (domAttentionElements.length > 0) {
          try {
            const { judgeRelevance, relevanceProvenance } = await import("../../visual/llm-relevance.js");
            const { getAnthropicApiKey } = await import("../../cognitive/index.js");
            const { getActiveTier } = await import("../tier-gate.js");
            const { tierHasAccess } = await import("../tool-categories.js");
            const tier = getActiveTier();
            const entitled = tier === null ? true : tierHasAccess(tier, "pro");

            // Traits, values and description -- not just the name. Shared with
            // the capture path so the two cannot drift.
            const { resolvePersonaContext } = await import("../../visual/persona-context.js");
            const pctx = await resolvePersonaContext(persona);

            const judged = await judgeRelevance(
              domAttentionElements.map((el, i) => ({
                index: i,
                type: el.type,
                text: el.text ?? "",
                x: el.x, y: el.y, width: el.width, height: el.height,
              })),
              { personaName: persona, goal, entitled, ...pctx },
              getAnthropicApiKey,
            );
            relevanceScores = judged.scores;
            relevanceSource = judged.source;
            relevanceReasoning = judged.reasoning;
            relevanceFields = relevanceProvenance(judged);
          } catch { /* keyword path inside buildSemanticMap remains the floor */ }
        }

        const result = await analyzeAttention(
          screenshotPath, persona, cellSize, undefined, domAttentionElements, goal,
          undefined, relevanceScores,
        );

        // Compute attention quality — cross-reference hotspots with classified elements
        let attentionQuality: unknown = null;
        try {
          const hotspots = result.saliencyMap?.hotspots || [];
          // Pass persona values only when useValues is enabled
          let pValues: Record<string, number> | undefined;
          if (useValues) {
            try {
              const { getPersonaValues, registerPersonaValues, createPersonaValues } = await import("../../values/index.js");
              let vals = resolveValuesForPersona(persona);

              // If not found in built-ins, check CMS for custom persona values
              if (!vals) {
                try {
                  const { getSessionApiKey } = await import("./cognitive-tools.js"); const _sessionApiKey = getSessionApiKey();
                  if (_sessionApiKey) {
                    const cmsUrl = process.env.CMS_URL || "http://localhost:3200";
                    const res = await fetch(`${cmsUrl}/api/personas`, {
                      headers: { "Authorization": `Bearer ${_sessionApiKey}` },
                    });
                    if (res.ok) {
                      const data = await res.json() as { personas: Array<{ name: string; slug: string; schwartz_values?: string }> };
                      const match = data.personas.find((p: any) => p.slug === persona || p.name.toLowerCase() === persona.toLowerCase());
                      if (match?.schwartz_values) {
                        const sv = typeof match.schwartz_values === "string" ? JSON.parse(match.schwartz_values) : match.schwartz_values;
                        const pv = createPersonaValues(
                          { selfDirection: sv.selfDirection ?? 0.5, stimulation: sv.stimulation ?? 0.5, hedonism: sv.hedonism ?? 0.5, achievement: sv.achievement ?? 0.5, power: sv.power ?? 0.5, security: sv.security ?? 0.5, conformity: sv.conformity ?? 0.5, tradition: sv.tradition ?? 0.5, benevolence: sv.benevolence ?? 0.5, universalism: sv.universalism ?? 0.5 },
                          { autonomyNeed: sv.autonomyNeed ?? 0.5, competenceNeed: sv.competenceNeed ?? 0.5, relatednessNeed: sv.relatednessNeed ?? 0.5 },
                          "esteem"
                        );
                        registerPersonaValues([{ personaName: persona, values: pv, rationale: "Custom persona from CMS" }]);
                        vals = pv;
                      }
                    }
                  }
                } catch { /* CMS lookup failed — proceed without values */ }
              }

              if (vals) pValues = vals as unknown as Record<string, number>;
            } catch {}
          }
          attentionQuality = computeAttentionQuality(hotspots, pageElements, cellSize, pValues);
        } catch (e) {
          console.debug(`[attention_analysis] Attention quality failed: ${(e as Error).message}`);
        }

        // The narrative and the metrics could contradict each other inside one
        // payload with nothing saying so: ctaCaptureRate 0 shipping beside
        // "CTAs like 'Try Free' stand out as safe next steps". The narrative
        // cannot simply be handed the metrics — it is generated FIRST and its
        // scores are an input to the map those metrics are computed from, so
        // feeding them back is a cycle. Reconciled after the fact instead, and
        // only ever annotated, never rewritten: the narrative carries the "why"
        // the metrics don't.
        let narrativeReconciliation: import("../../visual/narrative-reconcile.js").NarrativeReconciliation | undefined;
        try {
          const { reconcileAttentionNarrative } = await import("../../visual/narrative-reconcile.js");
          narrativeReconciliation = reconcileAttentionNarrative(
            relevanceReasoning,
            attentionQuality as { ctaCaptureRate?: number } | null,
          );
        } catch { /* annotation only; never block the result on it */ }

        const data: Record<string, unknown> = {
            persona: result.persona,
            ...(resolved.resolvedFrom ? { resolvedFrom: resolved.resolvedFrom } : {}),
            // Stated, because two tools silently rendering at different sizes is
            // exactly what made these coordinates incomparable with a CTC run.
            // A reader can now check instead of assuming they match.
            renderedViewport: !ownsBrowser
              ? (viewport ? `${viewport.width}x${viewport.height} (session)` : "session viewport")
              : device
                ? `device: ${device.toLowerCase()}`
                : `${getDefaultConfig().viewportWidth}x${getDefaultConfig().viewportHeight}`,
            url: pageUrl,
            ...(scroll ? { scroll } : {}),
            ...(sessionToken ? { _browserToken: sessionToken, ...(device ? { deviceIgnored: "device does not apply to an existing session; its own viewport was used" } : {}) } : {}),
            coordinateSpace: "CSS pixels in the rendered viewport above — compare only against runs reporting the same renderedViewport",
            // What actually ran, not what was asked for. A freeze that silently
            // failed would produce exactly the variance it was asked to remove,
            // under a label saying it had been removed.
            animationState,
            ...(animationsStillRunning >= 0 ? { animationsRunning: animationsStillRunning } : {}),
            ...(animationState === "frozen" && animationsStillRunning > 0 ? {
              animationWarning: `freezeAnimations was requested but ${animationsStillRunning} animation(s) are still running; this run is NOT reproducible.`,
            } : {}),
            ...(animationState === "live" && animationsStillRunning > 0 ? {
              animationNote: `${animationsStillRunning} animation(s) were running during capture, so saliency will vary slightly between runs. Pass freezeAnimations:true to compare runs.`,
            } : {}),
            alignmentScore: result.alignmentScore,
            entropy: result.entropy,
            concentration: result.concentration,
            transportCost: result.transportCost,
            topAttentionAreas: result.attentionCompetitors,
            ...(attentionQuality ? { attentionQuality } : {}),
            // Why this persona attends where it does, and by which method.
            // The scores were already being used to build the map while the
            // reasoning behind them was computed and thrown away — a judgement
            // with no stated reason is one the caller cannot argue with, which
            // was the point of leaving keyword matching.
            ...(relevanceReasoning ? { attentionReasoning: relevanceReasoning } : {}),
            // Only present when a checkable claim in the narrative actually
            // contradicts a computed metric. Silent otherwise — a spurious
            // "these disagree" on a narrative that was fine is its own defect.
            ...(narrativeReconciliation?.contradictsMetrics ? {
              narrativeReconciliation: {
                contradictsMetrics: true,
                contradictingClaims: narrativeReconciliation.contradictingClaims,
                note: narrativeReconciliation.reconciliationNote,
              },
            } : {}),
            // relevanceMethod, relevanceCached, and the cache age when replayed.
            ...(relevanceSource ? relevanceFields : {}),
            // These two lines used to read as a contradiction — "Scattered
            // attention (overwhelmed)" printed directly above "Attention
            // concentrated on few areas". The numbers were never wrong; the
            // prose was. They answer different questions:
            //   entropy       = normalized Shannon entropy, 1 = evenly spread
            //                   across every cell that gets any attention
            //   concentration = share of total saliency in the top 20% of cells,
            //                   whose floor is 0.2 for a perfectly uniform page,
            //                   NOT 0
            // Saliency spread evenly within a small region scores high on both
            // (measured: entropy 0.692 with concentration 1.0), and both
            // readings are correct. Each string now names its own basis, and
            // `pattern` gives the single combined verdict a caller actually
            // wants. (2026-07-28)
            interpretation: {
              // Each verdict names its BASIS, because two of them in one payload
              // read as a contradiction otherwise.
              //
              // Measured: attentionQuality.interpretation said "design intent is
              // working" while this line said "attention diverges from intended
              // design", in the same response, off an alignmentScore of 0.484.
              // Both were right about different questions -- one asks whether
              // the CTAs captured attention, the other whether the overall
              // distribution matches where the design puts emphasis -- and a
              // reader has no way to know that from two bare verdicts.
              // (2026-08-02)
              alignment: `${result.alignmentScore > 0.8 ? "Attention follows intended design" : result.alignmentScore > 0.5 ? "Moderate attention alignment" : "Attention diverges from intended design"} (alignmentScore ${result.alignmentScore.toFixed(3)}: how closely the whole attention distribution matches where the design places emphasis — a different question from whether the CTAs specifically captured attention, which attentionQuality answers)`,
              entropy: `Evenness of attention across the areas that draw it: ${result.entropy > 0.8 ? "very even" : result.entropy > 0.5 ? "moderately even" : "sharply peaked"} (${result.entropy.toFixed(2)} of 1.0)`,
              concentration: `Share of attention landing in the top 20% of the page: ${(result.concentration * 100).toFixed(0)}% (a perfectly uniform page scores 20%)`,
              pattern: result.concentration > 0.6
                ? (result.entropy > 0.5
                  ? "Attention pools into a small part of the page, and spreads evenly once there — a dense hotspot rather than a single focal point."
                  : "Attention locks onto one or two focal points and ignores the rest of the page.")
                : (result.entropy > 0.5
                  ? "Attention is spread broadly across the page with no dominant focal point."
                  : "Attention is split between a few separate areas, with the rest of the page largely unseen."),
            },
            computeTimeMs: Math.round(result.computeTimeMs),
            hasHeatmap: heatmap !== false,
        };

        // Generate heatmap overlay and save as public URL
        let heatmapPng: Buffer | undefined;
        let heatmapFullResolution = "";
        if (heatmap !== false && result.saliencyMap) {
          try {
            const { generateHeatmapOverlay } = await import("../../visual/heatmap-overlay.js");
            const heatmapBase64 = await generateHeatmapOverlay(
              screenshotPath,
              result.saliencyMap.cells,
              result.saliencyMap.rows,
              result.saliencyMap.cols,
              `${persona} Attention`,
            );

            // Save to public directory for URL access
            const { writeFileSync, mkdirSync, existsSync } = await import("fs");
            const { homedir } = await import("os");
            const heatmapId = `attn-${persona}-${Date.now()}`;

            // Both entries of the old deployedPaths list were wrong: nginx
            // serves /heatmaps/ from /var/www/cbrowser-data/heatmaps, and this
            // picked whichever candidate's PARENT existed — /var/www exists, so
            // it wrote to /var/www/cbrowser-web/heatmaps and returned a
            // cbrowser.ai URL for a file no one could fetch. One store now owns
            // the directory and the URL together. (2026-07-29)
            const cbrowserDir = join(homedir(), ".cbrowser", "heatmaps");
            let savedPath = "";
            let publicUrl = "";

            const png = Buffer.from(heatmapBase64, "base64");
            const written = writeArtifact(png, `${heatmapId}.png`);
            if (written) {
              savedPath = written.path;
              publicUrl = written.url;
              heatmapFullResolution = "the PNG at heatmapUrl, or artifact_fetch({ file: heatmapFile })";
            } else {
              // Served store unavailable — keep the local copy, and return the
              // local path rather than a URL that would not resolve.
              if (!existsSync(cbrowserDir)) mkdirSync(cbrowserDir, { recursive: true });
              savedPath = join(cbrowserDir, `${heatmapId}.png`);
              writeFileSync(savedPath, png);
              publicUrl = savedPath;
              heatmapFullResolution = "the PNG at the local path in heatmapUrl (the artifact store was unavailable, so artifact_fetch cannot serve it)";
            }

            data.heatmapUrl = publicUrl;
            // The filename, not just the URL: the widget sandbox cannot fetch
            // that URL, so the view asks artifact_fetch for these bytes over
            // the MCP connection instead.
            data.heatmapFile = `${heatmapId}.png`;
            data.heatmapNote = "Show this heatmap image to the user. The red areas show where this persona's attention concentrates. Blue areas receive little attention.";
            heatmapPng = png;

            // Auto-save to Visual Reports gallery
            try {
              const { saveVisualReport } = await import("../visual-report-saver.js");
              const { getSessionApiKey } = await import("./cognitive-tools.js");
              saveVisualReport({
                apiKey: getSessionApiKey(),
                imageUrl: publicUrl,
                toolName: "attention_analysis",
                targetUrl: pageUrl,
                persona,
                metadata: { entropy: result.entropy, concentration: result.concentration, alignmentScore: result.alignmentScore },
              });
            } catch {}
          } catch (e) {
            console.debug(`[attention_analysis] Heatmap generation failed: ${(e as Error).message}`);
          }
        }

        try { unlinkSync(screenshotPath); } catch {}

        return { content: await assembleAttentionContent(data, heatmapPng, heatmapFullResolution) };
      } finally {
        if (ownsBrowser) await browser.close();
        else await restoreSession?.();
      }
    }
  );

  server.registerTool("attention_compare", {
    title: "Compare Persona Attention",
    description: "Compare attention patterns between two personas on the same page. Shows where they look differently and the Wasserstein divergence between their saliency maps. The comparison map comes back inline as a JPEG preview sized to fit the result (described in comparisonHeatmapPreview), with the full-resolution PNG at comparisonHeatmapUrl / artifact_fetch({ file: comparisonHeatmapFile }).",
    inputSchema: {
      url: z.string().optional().describe("URL to analyze. Optional with _browserToken: omit it to compare on the session's current page as it stands (logged in, mid-flow); pass it to navigate that session first. Required without a token."),
      personaA: z.string().describe("First persona"),
      personaB: z.string().describe("Second persona"),
      _browserToken: z.string().optional().describe("Browser session token from a previous tool call. Compares on that live session instead of a fresh browser; the session keeps its viewport, is never closed, and its scroll position is restored afterwards."),
      scrollY: z.number().min(0).optional().describe("Vertical scroll offset in CSS pixels to compare at. Both personas are measured on the same screenshot at this offset. Clamped to the page's maximum scroll; the applied value is reported in `scroll`."),
    },
    annotations: {
      title: "Compare Persona Attention",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ url, personaA: requestedA, personaB: requestedB, _browserToken, scrollY }) => {
      const refuse = (error: string) => ({ isError: true as const, content: [{ type: "text" as const, text: JSON.stringify({ error }, null, 2) }] });
      if (!url && !_browserToken) return refuse("attention_compare needs a url, or a _browserToken to compare on that session's current page.");
      if (_browserToken && !context?.getBrowserByToken) return refuse("This server does not support browser session tokens; pass a url instead.");
      // Both refused before measuring: an unknown name compared as "maximally
      // different" from power-user, more than the extreme real pair. (2026-10-09)
      const resolvedA = await resolveOrRefuse(requestedA);
      if (!resolvedA.ok) return resolvedA.result;
      const resolvedB = await resolveOrRefuse(requestedB);
      if (!resolvedB.ok) return resolvedB.result;
      const personaA = resolvedA.name;
      const personaB = resolvedB.name;
      const { CBrowser } = await import("../../browser.js");
      // Same configured viewport as attention_analysis. This tool COMPARES two
      // attention runs, so rendering at a size no other tool uses meant its
      // comparison was internally consistent and incomparable with everything
      // else that reports attention coordinates. (2026-08-02)
      // A session is the caller's: compare on it, leave its scroll as found,
      // never close it. A fresh browser is ours to close. (2026-10-09)
      let sessionToken: string | undefined;
      const browser = _browserToken
        ? await (async () => { const r = await context!.getBrowserByToken!(_browserToken); sessionToken = r.token; return r.browser; })()
        : new CBrowser({
          headless: true,
          viewportWidth: getDefaultConfig().viewportWidth,
          viewportHeight: getDefaultConfig().viewportHeight,
        });
      const ownsBrowser = !_browserToken;
      let restoreSession: (() => Promise<void>) | undefined;
      const { join } = await import("path");
      const { tmpdir } = await import("os");
      const { unlinkSync } = await import("fs");

      try {
        if (ownsBrowser) await browser.launch();
        if (url) {
          await browser.navigate(url);
          await new Promise(r => setTimeout(r, 2000));
        }

        const page = await browser.getPage();
        const pageUrl = url ?? page.url();
        const viewport = page.viewportSize?.() ?? null;
        const { scroll, restore: restoreScroll } = await scrollForAnalysis(page as never, scrollY);
        if (!ownsBrowser) restoreSession = restoreScroll;
        const screenshotPath = join(tmpdir(), `attn-cmp-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });

        // Extract DOM elements for semantic attention layer
        const { extractPageElementsForAttention } = await import("../../visual/attention-quality.js");
        const rawEls = await extractPageElementsForAttention(page);
        const cmpDpr: number = await page.evaluate(() => window.devicePixelRatio).catch(() => 1);
        const domEls = rawEls.map(el => ({
          type: el.type, x: el.x * cmpDpr, y: el.y * cmpDpr,
          width: el.width * cmpDpr, height: el.height * cmpDpr,
          text: el.text, isCTA: el.isCTA, isHeading: el.isHeading,
          isNav: el.isNav, isDecorative: el.isDecorative,
        }));

        const { compareAttention } = await import("../../visual/attention-transport.js");
        const result = await compareAttention(screenshotPath, personaA, personaB, 4, domEls);

        const responseData: Record<string, unknown> = {
          url: pageUrl,
          renderedViewport: !ownsBrowser
            ? (viewport ? `${viewport.width}x${viewport.height} (session)` : "session viewport")
            : `${getDefaultConfig().viewportWidth}x${getDefaultConfig().viewportHeight}`,
          ...(scroll ? { scroll } : {}),
          ...(sessionToken ? { _browserToken: sessionToken } : {}),
          personaA: {
            name: personaA,
            ...(resolvedA.resolvedFrom ? { resolvedFrom: resolvedA.resolvedFrom } : {}),
            alignment: result.personaA.alignmentScore,
            entropy: result.personaA.entropy,
            concentration: result.personaA.concentration,
          },
          personaB: {
            name: personaB,
            ...(resolvedB.resolvedFrom ? { resolvedFrom: resolvedB.resolvedFrom } : {}),
            alignment: result.personaB.alignmentScore,
            entropy: result.personaB.entropy,
            concentration: result.personaB.concentration,
          },
          attentionDivergence: result.attentionDivergence,
          interpretation: result.attentionDivergence < 0.05
            ? "Nearly identical attention patterns"
            : result.attentionDivergence < 0.15
            ? "Moderate attention differences"
            : "Substantially different attention patterns",
          divergentRegions: result.divergentRegions.slice(0, 5),
        };

        // Generate comparison heatmap overlay
        let comparisonPng: Buffer | undefined;
        let comparisonFullResolution = "";
        if (result.personaA.saliencyMap && result.personaB.saliencyMap) {
          try {
            const { generateComparisonHeatmap } = await import("../../visual/visual-overlays.js");
            const compBase64 = await generateComparisonHeatmap(
              screenshotPath,
              result.personaA.saliencyMap.cells,
              result.personaB.saliencyMap.cells,
              result.personaA.saliencyMap.rows,
              result.personaA.saliencyMap.cols,
              personaA,
              personaB,
            );

            // Save to public URL
            const heatmapId = `cmp-${personaA}-${personaB}-${Date.now()}`;
            comparisonPng = Buffer.from(compBase64, "base64");
            const written = writeArtifact(comparisonPng, `${heatmapId}.png`);
            // Only advertise a URL when the artifact actually landed in the
            // served directory. A URL for a file that was not written is the
            // defect the artifact store exists to end.
            if (written) {
              responseData.comparisonHeatmapUrl = written.url;
              responseData.comparisonHeatmapFile = `${heatmapId}.png`;
              comparisonFullResolution = "the PNG at comparisonHeatmapUrl, or artifact_fetch({ file: comparisonHeatmapFile })";
            } else {
              comparisonFullResolution = "not available (the artifact store was unavailable, so the full-resolution PNG was not saved)";
            }
            responseData.heatmapNote = `Blue = ${personaA} looks here more. Red = ${personaB} looks here more. Transparent = similar attention.`;
          } catch (e) {
            console.debug(`[attention_compare] Comparison heatmap failed: ${(e as Error).message}`);
          }
        }

        try { unlinkSync(screenshotPath); } catch {}

        // The comparison map was pushed inline at full PNG size, ~500 KB of
        // base64 against a ~150k result cap, so on a real page this tool
        // blew the cap that attention_analysis was fixed for. Same remedy:
        // a JPEG preview fitted to what the JSON leaves.
        const content = comparisonPng
          ? await buildContentWithPreviews(
              responseData,
              [{ name: "comparison", png: comparisonPng, fullResolution: comparisonFullResolution }],
              (p) => ({ comparisonHeatmapPreview: p.comparison }),
            )
          : [{ type: "text" as const, text: JSON.stringify(responseData, null, 2) }];

        return { content };
      } finally {
        if (ownsBrowser) await browser.close();
        else await restoreSession?.();
      }
    }
  );
}
