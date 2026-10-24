/**
 * The journey golden in a real browser: two scripted journeys over the
 * journey-*.html fixtures (fixed geometry, so coordinates do not depend on
 * fonts), with every state number per step pinned.
 *
 * The scripted world (journey-scenarios.ts) covers the loop's branches; this
 * pins the same loop against Chromium, the real CBrowser and the real page
 * reads (clickables, inputs, viewport, the visible-content extractor), so a
 * refactor of the journey is proven against what the product actually runs.
 * Wall-clock values (timestamps, timeElapsed, totalTime, the time spent in
 * each thinking mode) and screenshot paths are dropped. An ambient
 * distraction (a random pause) changes only those, so randomness is left alone:
 * holding Math.random constant hangs Playwright.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { ScriptedProvider, type ScriptedStep } from "./journey-world.js";

const ok = (action: string, extra: ScriptedStep = {}): ScriptedStep => ({ phase: "decide", monologue: `I will ${action}`, action, ...extra });

export interface BrowserScenario {
  name: string;
  persona: string;
  goal: string;
  start: string;
  steps: Array<ScriptedStep | string>;
  maxSteps: number;
  finalEval?: { achieved: boolean; evidence?: string | null };
}

export const BROWSER_SCENARIOS: BrowserScenario[] = [
  {
    name: "browser-signup",
    persona: "first-timer",
    goal: "Create an account on the Starter plan",
    start: "journey-home.html",
    maxSteps: 8,
    steps: [
      ok("scroll:down", { newConfusion: 0.12, goalProgress: 0.1 }),
      ok("click:Pricing details", { newConfusion: 0.05, goalProgress: 0.3, mood: "hopeful" }),
      ok("click:Sign up", { goalProgress: 0.5 }),
      ok("fill:Email:ada@example.com", { goalProgress: 0.6 }),
      ok("select:Plan:Starter", { goalProgress: 0.7 }),
      ok("click:Create account", { goalProgress: 0.95 }),
      { phase: "evaluate", monologue: "Done.", action: null, goalAchieved: true, goalProgress: 1, goalEvidence: "Account created on the Starter plan" },
    ],
  },
  {
    name: "browser-struggle",
    persona: "elderly-user",
    goal: "Find the Team price",
    start: "journey-home.html",
    maxSteps: 7,
    steps: [
      ok("click:Talk to sales", { actionSuccess: false, newConfusion: 0.3, newFrustration: 0.2, frictionDescription: "No such link" }),
      ok("expand:More info", { newConfusion: 0.5, newFrustration: 0.3, frictionDescription: "Not here" }),
      ok("find:ten dollars", { newConfusion: 0.4 }),
      ok("click:#0", { goalProgress: 0.4 }),
      ok("back", { newFrustration: 0.5 }),
      ok("hover:Sign up", { newConfusion: 0.6 }),
      ok("tab:2", { newConfusion: 0.7 }),
    ],
    finalEval: { achieved: false, evidence: null },
  },
];

const WALL_CLOCK = new Set(["timestamp", "totalTime", "timeElapsed", "timeInSystem1", "timeInSystem2", "screenshotPath", "tracePath"]);

/** Deep copy without the wall-clock values and screenshot paths. */
export function stripWallClock(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripWallClock);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (!WALL_CLOCK.has(k)) out[k] = stripWallClock(x);
    return out;
  }
  return v;
}

export async function runBrowserScenario(s: BrowserScenario, base: string): Promise<Record<string, unknown>> {
  const { runCognitiveJourney } = await import("../../src/cognitive/index.js");
  const provider = new ScriptedProvider(s.steps, s.finalEval);
  const steps: unknown[] = [];
  const result = await runCognitiveJourney({
    persona: s.persona,
    goal: s.goal,
    startUrl: base + s.start,
    maxSteps: s.maxSteps,
    headless: true,
    persistent: false,
    temporalContext: { now: "2026-10-21T10:00:00Z", timezone: "UTC" },
    viewport: { width: 1280, height: 800 },
    decisionProvider: provider,
    onStep: (step) => { steps.push(JSON.parse(JSON.stringify(step))); },
  });
  // The page URLs carry the fixture server's random port.
  const portless = (x: unknown) => JSON.parse(JSON.stringify(x).split(base).join("fixture:"));
  return portless({
    systemPrompt: provider.systemPrompt,
    prompts: provider.prompts,
    finalEvalPrompt: provider.finalEvalPrompt,
    steps: stripWallClock(steps),
    result: stripWallClock(result),
  });
}
