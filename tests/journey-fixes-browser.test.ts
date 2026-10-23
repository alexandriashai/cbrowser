/**
 * Whole cognitive journeys on local pages, with scripted decisions (no model
 * call), for four journey bugs found on 2026-10-23:
 *  - an accessibility persona ran on traits generated from its name;
 *  - after following a link from partway down a page, the next prompt said
 *    "Scrolled up Npx";
 *  - failed actions in fast mode (System 1) were never counted, so the
 *    three-error switch to System 2 never fired;
 *  - the summary's average confusion was the final confusion.
 * tests/journey-personas.test.ts covers the pure parts.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CognitiveStep } from "../src/cognitive/index.js";

const PAGES: Record<string, string> = {
  "/": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Home</title></head>
<body><main><h1>Welcome</h1><p>Tools for testing your site.</p><div style="height:3000px"></div>
<p>Plans and prices:</p><a href="/pricing">Pricing</a></main></body></html>`,
  "/pricing": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Pricing</title></head>
<body><main><h1>Pricing</h1><p>Pro plan: $20 per month.</p></main></body></html>`,
};

type Decision = Record<string, unknown>;
const decide = (d: Decision) => JSON.stringify({ phase: "decide", monologue: "", goalProgress: 0.1, mood: "neutral", goalAchieved: false, newConfusion: 0.1, newFrustration: 0.1, ...d });
const NOT_ACHIEVED = JSON.stringify({ achieved: false, evidence: "" });

let server: ReturnType<typeof Bun.serve>;
let dataDir = "";
let url = "";

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: (req) => {
      const page = PAGES[new URL(req.url).pathname];
      return page ? new Response(page, { headers: { "content-type": "text/html" } }) : new Response("not found", { status: 404 });
    },
  });
  url = `http://127.0.0.1:${server.port}/`;
  dataDir = mkdtempSync(join(tmpdir(), "cb-journey-fixes-"));
  process.env.CBROWSER_DATA_DIR = dataDir;
});

afterAll(() => {
  server?.stop(true);
  rmSync(dataDir, { recursive: true, force: true });
});

async function journey(persona: string, replies: Record<number, string>, maxSteps: number) {
  const { runCognitiveJourney } = await import("../src/cognitive/index.js");
  const steps: CognitiveStep[] = [];
  const prompts: Record<number, string> = {};
  const result = await runCognitiveJourney({
    persona, goal: "find the price of the pro plan", startUrl: url, maxSteps, maxTime: 120,
    headless: true, persistent: false, vision: false,
    onStep: (s) => { steps.push(JSON.parse(JSON.stringify(s))); },
    decisionProvider: {
      decide: async (ctx) => {
        if (ctx.stepIndex === -1) return NOT_ACHIEVED;
        const last = ctx.messages[ctx.messages.length - 1];
        prompts[ctx.stepIndex] = String(last?.content ?? "");
        return replies[ctx.stepIndex] ?? replies[0];
      },
    },
  });
  return { result, steps, prompts };
}

describe("an accessibility persona's journey", () => {
  test("runs on the persona's own traits (comprehension 0.2 sets the 0.4 switch threshold)", async () => {
    const { steps } = await journey("intellectual-disability", { 0: decide({ action: "scroll:down" }) }, 1);
    expect(steps).toHaveLength(1);
    // Traits generated from the name had comprehension 0.5, which gives 0.6.
    expect(steps[0].state.cognitiveMode?.switchThreshold).toBe(0.4);
  }, 180_000);
});

describe("a link followed from partway down a page", () => {
  let prompts: Record<number, string> = {};
  beforeAll(async () => {
    ({ prompts } = await journey("first-timer", {
      1: decide({ action: "scroll:down" }),
      2: decide({ action: "click:Pricing", actionTarget: "the Pricing link" }),
      0: decide({ action: "scroll:down" }),
    }, 3));
  }, 180_000);

  test("a real scroll is still reported", () => {
    expect(prompts[2]).toMatch(/Scrolled down \d+px/);
  });

  test("the navigation is reported as a navigation, not as a scroll", () => {
    expect(prompts[3]).toContain("Page navigated:");
    expect(prompts[3]).not.toMatch(/Scrolled (up|down)/);
  });
});

describe("failed actions in fast mode", () => {
  let out: Awaited<ReturnType<typeof journey>>;
  beforeAll(async () => {
    out = await journey("careful-reader", { 0: decide({ action: "click:A button that does not exist", actionTarget: "a missing button" }) }, 5);
  }, 240_000);

  test("start in System 1", () => {
    expect(out.steps[0].state.cognitiveMode?.system).toBe(1);
  });

  test("are counted, and three of them switch the persona to System 2 while confusion is below the threshold", () => {
    const mode = out.result.finalState.cognitiveMode!;
    expect(mode.system1Errors).toBeGreaterThanOrEqual(3);
    const switched = out.steps.find((s) => s.state.cognitiveMode?.system === 2);
    expect(switched).toBeDefined();
    expect(switched!.state.confusionLevel).toBeLessThan(switched!.state.cognitiveMode!.switchThreshold);
  });

  test("the summary's average confusion is the mean over the steps, not the final confusion", () => {
    const logged = out.steps.map((s) => s.state.confusionLevel);
    const mean = logged.reduce((a, b) => a + b, 0) / logged.length;
    expect(out.result.summary.avgConfusionLevel).toBeCloseTo(mean, 12);
    expect(out.result.summary.maxFrustrationLevel).toBe(Math.max(out.result.finalState.frustrationLevel, ...out.steps.map((s) => s.state.frustrationLevel)));
  });
});
