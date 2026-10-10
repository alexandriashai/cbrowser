/**
 * CBrowser MCP Tools - Performance Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer } from "../types.js";
import { refuseHostedUrl } from "../hosted-inputs.js";
import {
  capturePerformanceBaseline,
  detectPerformanceRegression,
  listPerformanceBaselines,
} from "../../performance/index.js";
import { listVisualBaselines } from "../../visual/index.js";

/**
 * Register performance tools (3 tools: perf_baseline, perf_regression, list_baselines)
 */
export function registerPerformanceTools(server: McpServer): void {
  server.registerTool("perf_baseline", {
    title: "Capture Performance Baseline",
    description: "Capture performance baseline for a URL",
    inputSchema: {
      url: z.string().url().describe("URL to capture baseline for"),
      name: z.string().describe("Name for the baseline"),
      runs: z.number().optional().default(3).describe("Number of runs to average"),
    },
    annotations: {
      title: "Capture Performance Baseline",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ url, name, runs }) => {
      // Hosted: http(s) only (sec-paths, 2026-10-10; see hosted-inputs.ts).
      const hostedRefusal = refuseHostedUrl("perf_baseline", { url });
      if (hostedRefusal) return hostedRefusal;
      const result = await capturePerformanceBaseline(url, { name, runs });
      const m = result.metrics;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name: result.name,
              url: result.url,
              coreWebVitals: {
                lcp: m.lcp,
                lcpRating: m.lcpRating,
                fid: m.fid,
                fidRating: m.fidRating,
                cls: m.cls,
                clsRating: m.clsRating,
              },
              timingMetrics: {
                fcp: m.fcp,
                fcpRating: m.fcpRating,
                ttfb: m.ttfb,
                ttfbRating: m.ttfbRating,
                tti: m.tti,
                tbt: m.tbt,
                domContentLoaded: m.domContentLoaded,
                load: m.load,
              },
              resourceMetrics: {
                resourceCount: m.resourceCount,
                transferSize: m.transferSize,
              },
              metrics: {
                lcp: m.lcp,
                fcp: m.fcp,
                ttfb: m.ttfb,
                cls: m.cls,
              },
            }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool("perf_regression", {
    title: "Performance Regression Test",
    description: "Detect performance regression against baseline with configurable sensitivity. Uses dual thresholds: both percentage AND absolute change must be exceeded. Profiles: strict (perf envs, FCP 10%/50ms), normal (default, FCP 20%/100ms), ci (automated pipelines, FCP 25%/150ms), lenient (dev, FCP 30%/200ms).",
    inputSchema: {
      url: z.string().url().describe("URL to test"),
      baselineName: z.string().describe("Name of baseline to compare against"),
      sensitivity: z.enum(["strict", "normal", "ci", "lenient"]).optional().default("normal").describe("Sensitivity profile: strict (perf testing), normal (local dev), ci (automated pipelines), lenient (development)"),
      thresholdLcp: z.number().optional().describe("Override LCP threshold percentage"),
    },
    annotations: {
      title: "Performance Regression Test",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ url, baselineName, sensitivity, thresholdLcp }) => {
      // Hosted: http(s) only (sec-paths, 2026-10-10; see hosted-inputs.ts).
      const hostedRefusal = refuseHostedUrl("perf_regression", { url });
      if (hostedRefusal) return hostedRefusal;
      const result = await detectPerformanceRegression(url, baselineName, {
        sensitivity,
        thresholds: thresholdLcp ? { lcp: thresholdLcp } : undefined,
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              passed: result.passed,
              sensitivity: result.sensitivity,
              notes: result.notes,
              regressions: result.regressions,
              currentMetrics: result.currentMetrics,
              baseline: result.baseline.name,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool("list_baselines", {
    title: "List Performance Baselines",
    description: "List all saved baselines (visual and performance)",
    inputSchema: {},
    annotations: {
      title: "List Performance Baselines",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async () => {
      const visualBaselines = await listVisualBaselines();
      const perfBaselines = await listPerformanceBaselines();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              visual: visualBaselines,
              performance: perfBaselines,
            }, null, 2),
          },
        ],
      };
    }
  );
}
