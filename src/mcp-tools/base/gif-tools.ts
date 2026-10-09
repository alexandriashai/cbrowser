/**
 * Journey Heatmap GIF — animated cognitive journey visualization.
 *
 * Records attention heatmaps at each step of a cognitive journey
 * and combines them into an animated GIF showing how attention
 * shifts across pages and interactions.
 *
 * @since v18.53.0
 */

import { z } from "zod";
import { writeArtifact } from "../../artifact-store.js";
import { MAX_RESPONSE_SIZE } from "../screenshot-utils.js";
import { PREVIEW_RESULT_MARGIN, contentSize } from "../inline-image.js";
import type { McpServer, ToolRegistrationContext } from "../types.js";

/** Frame geometry of the heatmap GIF. Pinned — changing these changes output. */
export const HEATMAP_GIF_FRAME_WIDTH = 640;
export const HEATMAP_GIF_FRAME_HEIGHT = 400;

/**
 * Encode journey heatmap frames into an animated GIF.
 *
 * Lifted verbatim out of the `journey_heatmap_gif` handler so the encoder can
 * be regression-tested without running a live journey. The operations, their
 * order, and every parameter are unchanged: resize to 640x400, raw, stack
 * vertically into an RGBA buffer, encode with per-frame delay and infinite
 * loop. Output is byte-identical to the pre-extraction pipeline — see
 * tests/recording-gif-regression.test.ts, which reproduces the original inline
 * code and asserts equality.
 *
 * Note: the stacking assumes 4-channel (RGBA) frames, as the original did.
 * That assumption is preserved deliberately rather than "fixed" — this
 * function exists to hold behaviour still.
 */
export async function encodeJourneyHeatmapGif(
  frames: Buffer[],
  frameDelay: number,
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;

  // Sharp requires all frames as a single multi-page input
  const delays = frames.map(() => frameDelay);

  // Create the animated GIF by joining frames vertically then converting
  const frameHeight = HEATMAP_GIF_FRAME_HEIGHT;
  const frameWidth = HEATMAP_GIF_FRAME_WIDTH;

  // For multi-frame, we need to use sharp's join approach
  const compositeFrames = await Promise.all(
    frames.map(f => sharp(f).resize(frameWidth, frameHeight).raw().toBuffer())
  );

  // Stack frames vertically for sharp animated GIF
  const totalHeight = frameHeight * frames.length;
  const stackedBuffer = Buffer.alloc(frameWidth * totalHeight * 4);
  for (let i = 0; i < compositeFrames.length; i++) {
    compositeFrames[i].copy(stackedBuffer, i * frameWidth * frameHeight * 4);
  }

  return sharp(stackedBuffer, {
    raw: { width: frameWidth, height: totalHeight, channels: 4 },
  })
    .gif({
      delay: delays,
      loop: 0,
    })
    .toBuffer();
}

/**
 * journey_heatmap_gif's result: the JSON, then the GIF inline only when it fits.
 *
 * The old gate compared RAW bytes to 190,000, and base64 is 4/3 of that: a
 * 189 KB GIF went out as ~252k characters against a ~150k result cap, past
 * which the host swaps the whole result for a file pointer. Measured against
 * what the JSON leaves of the cap instead. Not re-encoded to fit like the still
 * overlays (src/mcp-tools/inline-image.ts): a JPEG would drop the animation,
 * which is the whole content. When it does not fit the result says so and
 * points at gifUrl. (2026-10-09)
 */
export function journeyGifContent(
  data: Record<string, unknown>,
  gif: Buffer,
): Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> {
  const gifBase64 = gif.toString("base64");
  const room = MAX_RESPONSE_SIZE - PREVIEW_RESULT_MARGIN
    - contentSize([{ type: "text", text: JSON.stringify(data, null, 2) }]);
  if (gifBase64.length <= room) {
    return [
      { type: "text", text: JSON.stringify(data, null, 2) },
      { type: "image", data: gifBase64, mimeType: "image/gif" },
    ];
  }
  const annotated = {
    ...data,
    gifInline: false,
    gifNote: `The GIF is ${gifBase64.length} characters of base64, over the ${Math.max(0, room)} this result has room for, so it is NOT in this response. Open gifUrl.`,
  };
  return [{ type: "text", text: JSON.stringify(annotated, null, 2) }];
}

export function registerGifTools(
  server: McpServer,
  context?: ToolRegistrationContext,
): void {
  const { getBrowser } = context || { getBrowser: async () => { throw new Error("No browser"); } };

  server.registerTool("journey_heatmap_gif", {
    title: "Journey Heatmap GIF",
    description: "Run a cognitive journey and capture attention heatmaps at each step, then combine into an animated GIF. Shows how a persona's attention shifts across pages during a task. Returns a public URL to the GIF.",
    inputSchema: {
      url: z.string().url().describe("Starting URL"),
      persona: z.string().optional().default("first-timer").describe("Persona name"),
      goal: z.string().describe("What the persona is trying to accomplish"),
      maxSteps: z.number().optional().default(8).describe("Maximum journey steps (each becomes a GIF frame)"),
      frameDelay: z.number().optional().default(2000).describe("Milliseconds per frame in the GIF (default: 2000ms)"),
      device: z.string().optional().describe("Device: 'mobile', 'tablet', 'desktop'"),
    },
    annotations: {
      title: "Journey Heatmap GIF",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ url, persona, goal, maxSteps, frameDelay, device }) => {
    const startTime = Date.now();

    try {
      const { CBrowser: BrowserClass } = await import("../../browser.js");
      const { join } = await import("path");
      const { tmpdir } = await import("os");
      const { writeFileSync, mkdirSync, existsSync, unlinkSync, readFileSync } = await import("fs");
      const sharp = (await import("sharp")).default;

      const browser = new BrowserClass({
        headless: true,
        ...(device ? { device: device.toLowerCase() } : { viewportWidth: 1280, viewportHeight: 800 }),
      });

      await browser.launch();
      await browser.navigate(url);
      await new Promise(r => setTimeout(r, 2000));

      const page = await browser.getPage();
      const frames: Buffer[] = [];
      const stepDescriptions: string[] = [];
      const tmpDir = join(tmpdir(), `journey-gif-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });

      // Import heatmap tools
      const { analyzeAttention } = await import("../../visual/attention-transport.js");
      const { generateHeatmapOverlay } = await import("../../visual/heatmap-overlay.js");
      const { collectDomAttentionElements } = await import("../../visual/attention-quality.js");

      // Step 0: initial page
      for (let step = 0; step < maxSteps; step++) {
        try {
          // Screenshot current page
          const ssPath = join(tmpDir, `step-${step}.png`);
          await page.screenshot({ path: ssPath, fullPage: false });

          // Generate attention heatmap.
          //
          // DOM is collected PER STEP, not once: the journey navigates, so the
          // elements behind frame N are not the elements behind frame N+1. Reusing
          // a single collection would pin the semantic layer to the first page and
          // make later frames a blend of this page's pixels with the FIRST page's
          // structure — worse than the visual-only fallback it replaces.
          //
          // Without any DOM, analyzeAttention silently drops to bottom-up colour
          // contrast, and this tool animates that as a persona's attention shifting
          // across a task. (2026-07-29)
          const domAttentionElements = await collectDomAttentionElements(page).catch(() => []);
          const attnResult = await analyzeAttention(ssPath, persona, 8, undefined, domAttentionElements, goal);

          if (attnResult.saliencyMap) {
            const heatmapB64 = await generateHeatmapOverlay(
              ssPath,
              attnResult.saliencyMap.cells,
              attnResult.saliencyMap.rows,
              attnResult.saliencyMap.cols,
              `${persona} · Step ${step + 1}`
            );

            const heatmapBuf = Buffer.from(heatmapB64, "base64");

            // Resize to consistent dimensions for GIF
            const resized = await sharp(heatmapBuf)
              .resize(640, 400, { fit: "contain", background: { r: 10, g: 10, b: 20, alpha: 1 } })
              .png()
              .toBuffer();

            frames.push(resized);
          }

          // Clean up screenshot
          try { unlinkSync(ssPath); } catch {}

          const currentUrl = await page.url();
          const title = await page.title();
          stepDescriptions.push(`Step ${step + 1}: ${title || currentUrl}`);

          // Simulate journey step — click a link or interact
          if (step < maxSteps - 1) {
            // Find clickable elements
            const links = await page.evaluate(() => {
              const els = Array.from(document.querySelectorAll('a[href], button, [role="button"]'));
              return els.slice(0, 10).map(el => ({
                text: (el as HTMLElement).innerText?.trim().slice(0, 50) || '',
                tag: el.tagName,
                href: (el as HTMLAnchorElement).href || '',
              })).filter((l: { text: string }) => l.text.length > 2);
            });

            if (links.length === 0) break;

            // Pick a link based on persona goal
            const targetLink = links.find((l: { text: string }) =>
              l.text.toLowerCase().includes(goal.split(' ')[0]?.toLowerCase() || '')
            ) || links[Math.floor(Math.random() * Math.min(links.length, 5))];

            try {
              await page.click(`text="${targetLink.text}"`).catch(() => {});
              await new Promise(r => setTimeout(r, 2000));
            } catch {
              break;
            }
          }
        } catch (e) {
          console.debug(`[journey_gif] Step ${step} failed: ${(e as Error).message}`);
          break;
        }
      }

      await browser.close();

      if (frames.length < 2) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Not enough frames captured", framesCollected: frames.length }) }],
        };
      }

      // Combine frames into animated GIF (see encodeJourneyHeatmapGif below —
      // the pipeline is unchanged, only lifted out so it can be regression-pinned)
      const animatedGif = await encodeJourneyHeatmapGif(frames, frameDelay);

      // Save through the served artifact store. This used to write to
      // cbrowser-web/out/heatmaps and return a cbrowser.ai/heatmaps URL — two
      // different directories, so the URL 404'd. See src/artifact-store.ts.
      const gifId = `journey-${persona}-${Date.now()}`;
      const written = writeArtifact(animatedGif, `${gifId}.gif`);
      const gifPath = written?.path ?? "";
      const gifUrl = written?.url ?? "";
      const elapsed = Date.now() - startTime;

      // Clean up temp dir
      try {
        const { rmSync } = await import("fs");
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {}

      const data: Record<string, unknown> = {
        url,
        persona,
        goal,
        frames: frames.length,
        steps: stepDescriptions,
        gifUrl,
        duration: `${elapsed}ms`,
        frameDelay: `${frameDelay}ms`,
      };

      return { content: journeyGifContent(data, animatedGif) };
    } catch (e) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: JSON.stringify({ error: (e as Error).message }) }],
      };
    }
  });
}
