/**
 * CBrowser MCP Tools - Navigation Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import { buildContentWithScreenshots, describeDownscale } from "../screenshot-utils.js";
import { describeContentIntegrity } from "../../content-integrity.js";
import { refuseHostedUrl } from "../hosted-inputs.js";
import { DEVICE_PRESETS, resolveDevice } from "../../devices.js";
import { VIEWPORT_PRESETS } from "../../types.js";
import { parseViewport } from "./capture-tools.js";

function navigateRefusal(error: string, message: string, extra: Record<string, unknown> = {}) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify({ success: false, error, message, ...extra }, null, 2) }],
  };
}

/**
 * Register navigation tools (2 tools: navigate, list_devices)
 */
export function registerNavigationTools(
  server: McpServer,
  { getBrowser, getBrowserByToken }: ToolRegistrationContext
): void {
  server.registerTool("navigate", {
    title: "Navigate to URL",
    description: "Navigate to a URL and take a screenshot. Pass _browserToken from a previous tool call to reuse the same browser session. To emulate a phone or tablet, pass device (list_devices shows the presets) and/or viewport on the navigate that starts the session; the response reports the device and viewport used.",
    inputSchema: {
      url: z.string().url().describe("The URL to navigate to"),
      waitAfterLoad: z.number().optional().describe("Additional milliseconds to wait after page loads. Useful for sites with client-side translation, deferred rendering, or async content. Example: 3000 for i18n sites."),
      waitForSelector: z.string().optional().describe("CSS selector to wait for after navigation. Useful for dynamic content. Example: '[data-translated]', '.content-loaded', '#app:not(:empty)'. Times out gracefully after 10s."),
      _browserToken: z.string().optional().describe("Browser session token from a previous tool call. Pass this to maintain browser state (cookies, page) across calls."),
      device: z.string().optional().describe("Device preset to emulate for this session: 'mobile', 'tablet', 'desktop', or a name from list_devices such as 'iPhone 15' or 'Pixel 8' (user agent, touch, pixel ratio and size). Applies when navigate starts a session (no _browserToken); a session keeps the device it started with."),
      viewport: z.string().optional().describe("Page size for this session: WIDTHxHEIGHT (e.g. 1280x720) or a size preset (mobile, tablet, desktop, desktop-sm, ...). With device, sets the size and keeps the device's emulation. Applies when navigate starts a session (no _browserToken)."),
    },
    annotations: {
      title: "Navigate to URL",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ url, waitAfterLoad, waitForSelector, _browserToken, device, viewport }) => {
      // Hosted: http(s) only. z.string().url() accepts file:, data: and
      // view-source:, and the root-run browser opened them (sec-paths, 2026-10-10).
      const refused = refuseHostedUrl("navigate", { url });
      if (refused) return refused;

      // Device emulation (audit M9, 2026-10-21). Hosted session browsers were
      // built with headless/persistent/proxy only, so no hosted caller could
      // test a phone layout. Applied only when this call creates the session:
      // a token names a session that may hold a login, and relaunching it to
      // change the device would drop that state. Sessions stay bound to the
      // account that created them (getBrowserByToken); this only configures
      // the caller's own new browser.
      const emulating = device !== undefined || viewport !== undefined;
      if (emulating && _browserToken && getBrowserByToken) {
        return navigateRefusal("device_needs_new_session",
          "device and viewport apply when navigate starts a session. Call navigate without _browserToken to start an emulated session.",
          { _browserToken });
      }
      let deviceKey: string | undefined;
      if (device !== undefined) {
        const resolved = resolveDevice(device);
        if ("error" in resolved) {
          return navigateRefusal("unknown_device", `${resolved.error}. Call list_devices for the presets.`, { suggestions: resolved.suggestions });
        }
        deviceKey = resolved.key;
      }
      let size: { width: number; height: number } | undefined;
      if (viewport !== undefined) {
        try { size = parseViewport(viewport); } catch (e) {
          return navigateRefusal("invalid_viewport", (e as Error).message);
        }
      }

      let b: Awaited<ReturnType<typeof getBrowser>>;
      let token: string | undefined;
      if (getBrowserByToken) {
        const result = await getBrowserByToken(_browserToken);
        b = result.browser;
        token = result.token;
      } else {
        b = await getBrowser();
      }
      const applied = emulating ? await b.emulate({ device: deviceKey, viewport: size }) : undefined;
      let result = await b.navigate(url, {
        ...(waitAfterLoad ? { waitAfterLoad } : {}),
        ...(waitForSelector ? { waitForSelector } : {}),
      });

      // v18.30.0: Auto-recover from corrupted browser state with retry
      if (!result.title && !result.screenshot) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            console.warn(`[navigate] Blank page on attempt ${attempt + 1} for ${url}. Resetting browser (persistent state preserved).`);
            await b.close();
            await b.launch();
            result = await b.navigate(url);
            if (result.title || result.screenshot) break;
          } catch {}
        }
      }

      // v18.35.0: Update site model with navigation edge
      try {
        const { SiteModelManager } = await import("../../site-model/manager.js");
        const siteModel = SiteModelManager.getInstance();
        const fromUrl = _browserToken ? "previous-page" : "direct";
        const toUrl = result.url || url;
        const toDomain = new URL(toUrl).hostname;
        siteModel.recordNavigation(toDomain, fromUrl, toUrl, "navigate", result.title || "");
        console.log(`[site-model] Recorded navigation to ${toDomain}: ${toUrl}`);
      } catch (e) {
        console.warn(`[site-model] Navigation hook error: ${(e as Error).message}`);
      }

      // `result.success`, not `true`.
      //
      // This was hardcoded `success: true`, so a navigation the browser layer had
      // already judged a FAILURE was reported to the caller as a success. Browser
      // .navigate detects a landing on a different host and returns success:false
      // with desyncDetected, an errors entry, and a warning naming both domains --
      // and this handler forwarded the warning while dropping the verdict that
      // explained it. An external report saw exactly that: `success: true` beside an
      // orphaned "Expected domain ... Actual domain ..." string, on a Cloudflare
      // interstitial that scored as a page.
      //
      // The cost is not cosmetic. Every cognitive tool downstream of navigate
      // inherits the DOM navigate returned, so a challenge page gets measured and
      // reported "comfortable". A wrong page silently analysed is worse than a
      // refusal, because the numbers look ordinary.
      const integrity = describeContentIntegrity(url, result);
      return {
        content: buildContentWithScreenshots(
          {
            success: result.success !== false,
            url: result.url,
            title: result.title,
            loadTime: result.loadTime,
            screenshot: result.screenshot,
            ...describeDownscale(b.lastScreenshotInfo, result.screenshot),
            ...(result.waitSelectorTimedOut ? { waitSelectorTimedOut: true, waitWarning: `waitForSelector timed out — the expected element never appeared` } : {}),
            ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
            ...(result.errors && result.errors.length > 0 ? { errors: result.errors } : {}),
            ...(result.desyncDetected ? { desyncDetected: true, expectedUrl: result.expectedUrl } : {}),
            ...(integrity.ok ? {} : { contentIntegrity: integrity }),
            ...(applied ? await renderedAt(b, applied.device) : {}),
            ...(token ? { _browserToken: token } : {}),
          },
          result.screenshot
        ),
      };
    }
  );

  server.registerTool("list_devices", {
    title: "List Device Presets",
    description: "List the device presets navigate's device parameter (and every other tool's device parameter) accepts, with each one's size, pixel ratio and touch/mobile flags, and the size-only viewport presets. Names match in any case and with spaces or hyphens ('iPhone 15' = 'iphone-15').",
    inputSchema: {
      query: z.string().optional().describe("Only presets whose key or name contains this text (case-insensitive), e.g. 'iphone', 'pixel', 'ipad'"),
      includeLandscape: z.boolean().optional().default(false).describe("Include the '-landscape' variants (default false)"),
    },
    annotations: { title: "List Device Presets", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ query, includeLandscape }) => {
    const q = query?.trim().toLowerCase();
    const devices = Object.entries(DEVICE_PRESETS)
      .filter(([key]) => includeLandscape || !key.endsWith("-landscape"))
      .filter(([key, d]) => !q || key.includes(q) || d.name.toLowerCase().includes(q))
      .map(([key, d]) => ({
        key,
        name: d.name,
        width: d.viewport.width,
        height: d.viewport.height,
        deviceScaleFactor: d.deviceScaleFactor,
        isMobile: d.isMobile,
        hasTouch: d.hasTouch,
      }));
    return { content: [{ type: "text" as const, text: JSON.stringify({
      count: devices.length,
      devices,
      viewportSizes: VIEWPORT_PRESETS.map((v) => ({ name: v.name, width: v.width, height: v.height })),
      note: "device = full emulation (user agent, touch, pixel ratio, size). viewport = size only. 'mobile', 'tablet' and 'desktop' are the same size in both lists.",
    }, null, 2) }] };
  });
}

/** The device and page size a session is rendering at, for navigate's response. */
async function renderedAt(b: { getPage: () => Promise<{ viewportSize: () => { width: number; height: number } | null }> }, device: string | null) {
  try {
    const page = await b.getPage();
    return { device, viewport: page.viewportSize() };
  } catch {
    return { device };
  }
}
