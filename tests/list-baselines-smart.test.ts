/**
 * v10 B36: `visual_baseline` stores a smart (multi-capture) baseline, but
 * `list_baselines` listed only the old single-screenshot visual store, so a baseline
 * the caller had just made never appeared. Smart baselines are listed now, as
 * summaries: their barycenter histograms are internal data, not something to dump.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "cbrowser-list-baselines-"));
process.env.CBROWSER_DATA_DIR = dir;

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
const handlers = new Map<string, Handler>();
let listed: { visual: Array<Record<string, unknown>>; performance: unknown[] };

beforeAll(async () => {
  mkdirSync(join(dir, "smart-baselines"), { recursive: true });
  writeFileSync(join(dir, "smart-baselines", "smart-baselines.json"), JSON.stringify({
    baselines: [{
      id: "sb-1", name: "qa-1012-home-visual", url: "https://cbrowser.ai/",
      referencePath: join(dir, "smart-baselines", "ref.png"), capturePaths: ["a.png", "b.png", "c.png"],
      barycenter: { r: [0.1, 0.2], g: [0.3, 0.4], b: [0.5, 0.6] }, captureDistances: [0.001, 0.002, 0.0015],
      meanDistance: 0.0015, stdDevDistance: 0.0004, numCaptures: 3, numOutliers: 0, adaptiveThreshold: 0.004,
      timestamp: "2026-10-12T21:43:00.000Z", computeTimeMs: 812,
    }],
  }));
  const { registerPerformanceTools } = await import("../src/mcp-tools/base/performance-tools.js");
  registerPerformanceTools({ registerTool: (n: string, _c: unknown, h: Handler) => { handlers.set(n, h); } } as never);
  const r = await handlers.get("list_baselines")!({});
  listed = JSON.parse(r.content[0]!.text);
});
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

describe("list_baselines lists the smart baselines visual_baseline makes (v10 B36)", () => {
  test("the smart baseline is in the visual list, marked as smart", () => {
    const sb = listed.visual.find((b) => b.name === "qa-1012-home-visual");
    expect(sb).toBeDefined();
    expect(sb).toMatchObject({ kind: "smart", url: "https://cbrowser.ai/", captures: 3, timestamp: "2026-10-12T21:43:00.000Z" });
  });

  test("it is a summary: no histograms or per-capture paths", () => {
    const sb = listed.visual.find((b) => b.name === "qa-1012-home-visual")!;
    expect(sb).not.toHaveProperty("barycenter");
    expect(sb).not.toHaveProperty("capturePaths");
  });

  test("performance stays a list", () => {
    expect(Array.isArray(listed.performance)).toBe(true);
  });
});
