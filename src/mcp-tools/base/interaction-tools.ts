/**
 * CBrowser MCP Tools - Interaction Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import { buildContentWithScreenshots } from "../screenshot-utils.js";
import { RED_ZONE_MCP_HINT } from "../../security/script-gate.js";

/**
 * Register interaction tools (5 tools: click, smart_click, dismiss_overlay, fill, scroll)
 */
export function registerInteractionTools(
  server: McpServer,
  { getBrowser, getBrowserByToken }: ToolRegistrationContext
): void {
  server.registerTool("click", {
    title: "Click Element",
    description: "Click an element on the page. MUST pass _browserToken from previous tool call to click on the same page. Without it, clicks go to a blank new browser.",
    inputSchema: {
      selector: z.string().describe("Element to click (text content, CSS selector, or description)"),
      force: z.boolean().optional().describe("Allow clicking red-zone elements"),
      verbose: z.boolean().optional().describe("Return available elements on failure"),
      _browserToken: z.string().optional().describe("Browser session token from a previous tool call"),
    },
    annotations: {
      title: "Click Element",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ selector, force, verbose, _browserToken }) => {
      let b: Awaited<ReturnType<typeof getBrowser>>;
      let token: string | undefined;
      if (getBrowserByToken) {
        const result = await getBrowserByToken(_browserToken);
        b = result.browser;
        token = result.token;
      } else {
        b = await getBrowser();
      }
      const result = await b.click(selector, { force, verbose });
      const response: Record<string, unknown> = {
        success: result.success,
        message: result.message,
        screenshot: result.screenshot,
      };
      // The zone the click was judged in and what the selector resolved to, so a refused red names its target.
      if (result.zone) response.zone = result.zone;
      if (result.target) response.target = result.target;
      if (!result.success && result.zone === "red") response.howToRun = RED_ZONE_MCP_HINT;
      if (verbose && !result.success) {
        if (result.availableElements) response.availableElements = result.availableElements;
        if (result.aiSuggestion) response.aiSuggestion = result.aiSuggestion;
        if (result.debugScreenshot) response.debugScreenshot = result.debugScreenshot;
      }
      if (token) response._browserToken = token;

      // v18.35.0: Update site model with element interaction result
      try {
        const page = await b.getPage();
        const pageUrl = page.url();
        const domain = new URL(pageUrl).hostname;
        const { SiteModelManager } = await import("../../site-model/manager.js");
        const siteModel = SiteModelManager.getInstance();
        siteModel.recordElementResult(domain, pageUrl, selector, result.success);
        // A red-zone refusal found the element; it is not a not-found failure.
        if (!result.success && result.zone !== "red") {
          siteModel.recordFailure(domain, pageUrl, selector, "element_not_found", [result.message || ""]);
        }
      } catch {}

      return {
        content: buildContentWithScreenshots(response, result.screenshot, result.debugScreenshot),
      };
    }
  );

  server.registerTool("smart_click", {
    title: "Smart Click with Self-Healing",
    description: "Click with auto-retry and self-healing selectors. v11.8.0: Added confidence gating - only reports success if healed selector has >= 60% confidence.",
    inputSchema: {
      selector: z.string().describe("Element to click"),
      maxRetries: z.number().optional().default(3).describe("Maximum retry attempts"),
      dismissOverlays: z.boolean().optional().default(false).describe("Dismiss overlays before clicking"),
      // Its sibling `click` (above) already took this; smart_click did not, so on
      // the HTTP transport it retried against a blank page and reported a clean
      // "element not found" — and self-healing then cached heals derived from
      // nothing. (2026-07-28)
      _browserToken: z.string().optional().describe("Browser session token from a previous tool call"),
    },
    annotations: {
      title: "Smart Click with Self-Healing",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ selector, maxRetries, dismissOverlays, _browserToken }) => {
      let b;
      let token: string | undefined;
      if (getBrowserByToken) {
        const resolved = await getBrowserByToken(_browserToken);
        b = resolved.browser;
        token = resolved.token;
      } else {
        b = await getBrowser();
      }
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
              confidence: result.confidence,
              healed: result.healed,
              healReason: result.healReason,
              zone: result.zone,
              ...(!result.success && result.zone === "red" ? { howToRun: RED_ZONE_MCP_HINT } : {}),
              ...(token ? { _browserToken: token } : {}),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool("dismiss_overlay", {
    title: "Dismiss Overlay",
    description: "Detect and dismiss modal overlays (cookie consent, age verification, newsletter popups). Constitutional Yellow zone.",
    inputSchema: {
      type: z.enum(["auto", "cookie", "age-verify", "newsletter", "custom"]).optional().default("auto").describe("Overlay type to detect"),
      customSelector: z.string().optional().describe("Custom CSS selector for overlay close button"),
      // Without the token this dismissed overlays on a blank page and reported
      // `overlaysFound: 0` — so the caller's actual cookie banner stayed up while
      // the response said there was nothing to dismiss. (2026-07-28)
      _browserToken: z.string().optional().describe("Browser session token from a previous tool call"),
    },
    annotations: {
      title: "Dismiss Overlay",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ type, customSelector, _browserToken }) => {
      let b;
      let token: string | undefined;
      if (getBrowserByToken) {
        const resolved = await getBrowserByToken(_browserToken);
        b = resolved.browser;
        token = resolved.token;
      } else {
        b = await getBrowser();
      }
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
              ...(token ? { _browserToken: token } : {}),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool("fill", {
    title: "Fill Form Field",
    description: "Fill a form field with text. MUST pass _browserToken from previous tool call to interact with the same page.",
    inputSchema: {
      selector: z.string().describe("Input field to fill (name, placeholder, label, or selector)"),
      value: z.string().describe("Value to enter"),
      verbose: z.boolean().optional().describe("Return available inputs on failure"),
      _browserToken: z.string().optional().describe("Browser session token"),
    },
    annotations: {
      title: "Fill Form Field",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ selector, value, verbose, _browserToken }) => {
      let b: Awaited<ReturnType<typeof getBrowser>>;
      let token: string | undefined;
      if (getBrowserByToken) {
        const result = await getBrowserByToken(_browserToken);
        b = result.browser;
        token = result.token;
      } else {
        b = await getBrowser();
      }
      const result = await b.fill(selector, value, { verbose });
      const response: Record<string, unknown> = {
        success: result.success,
        message: result.message,
      };
      if (token) response._browserToken = token;
      if (verbose && !result.success) {
        if (result.availableInputs) response.availableInputs = result.availableInputs;
        if (result.aiSuggestion) response.aiSuggestion = result.aiSuggestion;
        if (result.debugScreenshot) response.debugScreenshot = result.debugScreenshot;
      }

      // v18.35.0: Update site model with fill interaction result
      try {
        const page = await b.getPage();
        const pageUrl = page.url();
        const domain = new URL(pageUrl).hostname;
        const { SiteModelManager } = await import("../../site-model/manager.js");
        const siteModel = SiteModelManager.getInstance();
        siteModel.recordElementResult(domain, pageUrl, selector, result.success);
      } catch {}

      return {
        content: buildContentWithScreenshots(response, result.debugScreenshot),
      };
    }
  );

  server.registerTool("scroll", {
    title: "Scroll Page",
    description: "Scroll the page. MUST pass _browserToken from previous tool call to scroll the same page.",
    inputSchema: {
      direction: z.enum(["down", "up", "top", "bottom"]).default("down").describe("Scroll direction"),
      amount: z.number().optional().describe("Custom scroll amount in pixels"),
      _browserToken: z.string().optional().describe("Browser session token"),
    },
    annotations: {
      title: "Scroll Page",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ direction, amount, _browserToken }) => {
      let b: Awaited<ReturnType<typeof getBrowser>>;
      let token: string | undefined;
      if (getBrowserByToken) {
        const result = await getBrowserByToken(_browserToken);
        b = result.browser;
        // The resolved token was being discarded here, so scroll was the one
        // bound tool that never echoed it and a caller chaining off it lost the
        // session. (2026-07-28)
        token = result.token;
      } else {
        b = await getBrowser();
      }
      const page = await b.getPage();

      const scrollAmount = amount || 400;
      let scrollPosition = 0;
      let maxScroll = 0;

      try {
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

        // Smooth scrolling is asynchronous. The previous fixed 300ms wait read
        // the position mid-animation, so a long page reported atBottom:false for
        // a scroll that did in fact reach the bottom. Poll until the position
        // stops moving instead of guessing how long it takes.
        //
        // maxScroll also read document.body.scrollHeight alone; on standards-mode
        // pages the scrolling element is usually documentElement, and the two
        // disagree, which by itself made atBottom wrong. (2026-07-28)
        const readPos = () => page.evaluate(() => {
          const doc = document.documentElement;
          const scrollHeight = Math.max(document.body?.scrollHeight ?? 0, doc?.scrollHeight ?? 0);
          return {
            scrollY: window.scrollY || doc?.scrollTop || 0,
            maxScroll: Math.max(0, scrollHeight - window.innerHeight),
          };
        });

        const SETTLE_DEADLINE_MS = 2000;
        const SETTLE_POLL_MS = 60;
        const deadline = Date.now() + SETTLE_DEADLINE_MS;
        let pos = await readPos();
        let stableReads = 0;
        let settled = false;
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, SETTLE_POLL_MS));
          const next = await readPos();
          stableReads = next.scrollY === pos.scrollY ? stableReads + 1 : 0;
          pos = next;
          if (stableReads >= 2) { settled = true; break; }
        }
        scrollPosition = pos.scrollY;
        maxScroll = pos.maxScroll;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                direction,
                scrollPosition,
                maxScroll,
                atTop: scrollPosition <= 0,
                atBottom: scrollPosition >= maxScroll - 10,
                // False means the page was still moving when we gave up, so the
                // position above is a snapshot rather than a resting place.
                settled,
                ...(token ? { _browserToken: token } : {}),
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: (error as Error).message,
              }, null, 2),
            },
          ],
        };
      }
    }
  );
}
