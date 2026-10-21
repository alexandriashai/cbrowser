/**
 * competitive-benchmark and ai-benchmark pass --device/--viewport to the
 * engine that renders the page (audit 2026-10-21, flags lane F20: both
 * commands accepted the flags and dropped them, so a "mobile" benchmark ran on
 * desktop and said nothing).
 *
 * The engines are replaced with recorders through mock.module: a real journey
 * needs a model and a real audit cannot report which device it ran on, so the
 * options handed to the engine are the observable. Listed in
 * scripts/browser-tests.txt so it runs in its own process; mock.module would
 * otherwise reach other files sharing the process.
 */
import { describe, expect, mock, test } from "bun:test";

const journeyCalls: Array<Record<string, unknown>> = [];
const auditCalls: Array<Record<string, unknown>> = [];

const realCognitive = await import("../src/cognitive/index.js");
mock.module("../src/cognitive/index.js", () => ({
  ...realCognitive,
  isApiKeyConfigured: () => true,
  runCognitiveJourney: async (opts: Record<string, unknown>) => {
    journeyCalls.push(opts);
    return {
      goalAchieved: true, abandonmentReason: undefined, totalTime: 1, stepCount: 1, frictionPoints: [],
      finalState: { patienceRemaining: 1, frustrationLevel: 0, confusionLevel: 0 },
    };
  },
}));

const realAudit = await import("../src/analysis/agent-ready-audit.js");
mock.module("../src/analysis/agent-ready-audit.js", () => ({
  ...realAudit,
  runAgentReadyAudit: async (_url: string, opts: Record<string, unknown>) => {
    auditCalls.push(opts);
    return {
      score: { overall: 70, findability: 70, stability: 70, agentPerceivability: 70, semantics: 70 },
      grade: "C", issues: [], duration: 1,
    };
  },
}));

const { runCompetitiveBenchmark, runAIReadinessBenchmark } = await import("../src/analysis/competitive-benchmark.js");

describe("benchmarks hand the device to the engine", () => {
  test("competitive-benchmark: every journey gets the device and the viewport", async () => {
    journeyCalls.length = 0;
    await runCompetitiveBenchmark({
      sites: [{ url: "https://a.test/" }, { url: "https://b.test/" }],
      goal: "sign up",
      device: "iphone-16",
      viewport: { width: 400, height: 700 },
    });
    expect(journeyCalls).toHaveLength(2);
    for (const c of journeyCalls) {
      expect(c.device).toBe("iphone-16");
      expect(c.viewport).toEqual({ width: 400, height: 700 });
    }
  });

  test("competitive-benchmark: no flags, no device", async () => {
    journeyCalls.length = 0;
    await runCompetitiveBenchmark({ sites: [{ url: "https://a.test/" }], goal: "sign up" });
    expect(journeyCalls[0].device).toBeUndefined();
    expect(journeyCalls[0].viewport).toBeUndefined();
  });

  test("ai-benchmark: every audit gets the device", async () => {
    auditCalls.length = 0;
    await runAIReadinessBenchmark({ urls: ["https://a.test/", "https://b.test/"], device: "pixel-9" });
    expect(auditCalls).toHaveLength(2);
    for (const c of auditCalls) expect(c.device).toBe("pixel-9");
  });
});
