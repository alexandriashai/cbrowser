/**
 * The journey golden's inputs: a small scripted site, the persona journeys
 * that walk it, and the runner that records everything a journey produces.
 *
 * Each scenario drives runCognitiveJourney through tests/fixtures/journey-world.ts
 * (fake browser, scripted decisions, virtual time, seeded randomness) and is
 * chosen to reach one part of the loop: every emotional trigger, the progress
 * gate, every abandonment reason the loop can reach, the final evaluation and
 * its fallback, every action executeAction knows, the returning-visit and
 * time-of-day adjustments, and a trait sweep across the cut points the
 * abandonment thresholds are set at. What a run records: the system prompt
 * and every step prompt (they carry the thresholds and the state the persona
 * is told), the state after every step, the delay of every timer (the timing
 * constants), the browser calls, verbose console lines, and the result.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { CognitiveJourneyOptions } from "../../src/cognitive/index.js";
import type { World, ScriptedStep } from "./journey-world.js";
import { createWorldBrowser, ScriptedProvider, withSeededRandom, withVirtualTime } from "./journey-world.js";

const U = (path: string) => `https://acme.example${path}`;

const LONG =
  "Acme widgets are built for teams that need to move quickly without breaking things. Every plan includes unlimited projects, " +
  "role-based access, audit logs and priority support from engineers who actually built the product, so nobody waits on a ticket queue.";

export const WORLD: World = {
  [U("/")]: {
    title: "Acme Home",
    height: 2600,
    banner: "We use cookies to improve your experience",
    elements: [
      { tag: "a", text: "Pricing", selector: "#nav-pricing", region: "header-nav", x: 600, y: 20, width: 80, height: 30, href: U("/pricing") },
      { tag: "a", text: "Sign up", selector: "#nav-signup", region: "header-nav", x: 700, y: 20, width: 80, height: 30, href: U("/signup") },
      { tag: "a", text: "Docs", selector: "#nav-docs", region: "header-nav", x: 800, y: 20, width: 60, height: 30, href: U("/docs") },
      { tag: "button", text: "Accept all cookies", selector: "#cookie-accept", region: "modal", x: 900, y: 700, width: 180, height: 40 },
      { tag: "button", text: "Get started", selector: "#hero-cta", region: "main-visible", x: 100, y: 300, width: 160, height: 48, href: U("/signup") },
      { tag: "button", text: "Subscribe to newsletter", selector: "#newsletter", region: "sidebar", x: 1000, y: 400, width: 200, height: 40 },
      { tag: "a", text: "Share on social", selector: "#share", region: "sidebar", x: 1000, y: 460, width: 200, height: 30 },
      { tag: "a", text: "Pricing details", selector: "#body-pricing", region: "below-fold", x: 100, y: 1600, width: 140, height: 30, href: U("/pricing") },
      { tag: "a", text: "Contact", selector: "#footer-contact", region: "footer", x: 100, y: 2500, width: 80, height: 30, href: U("/contact") },
    ],
    blocks: [
      { tag: "h1", text: "Welcome to Acme", y: 100, height: 60, width: 800 },
      { tag: "p", text: "Acme makes widgets for teams.", y: 180, height: 30, width: 800 },
      { tag: "p", text: LONG, y: 220, height: 90, width: 800 },
      { tag: "p", text: "ok", y: 330, height: 20, width: 800 },
      { tag: "p", text: "Too narrow to read", y: 360, height: 20, width: 10 },
      { tag: "p", text: "Hidden promo text", y: 390, height: 20, width: 800, hidden: true },
      { tag: "h2", text: "Features", y: 900, height: 40, width: 800 },
      { tag: "li", text: "Fast", y: 960, height: 20, width: 400 },
      { tag: "li", text: "Reliable", y: 990, height: 20, width: 400 },
      { tag: "p", text: "Starter plans begin at ten dollars.", y: 1300, height: 30, width: 800 },
      { tag: "p", text: "Far below the fold", y: 2400, height: 30, width: 800 },
    ],
  },
  [U("/pricing")]: {
    title: "Pricing - Acme",
    height: 1400,
    elements: [
      { tag: "a", text: "Home", selector: "#home", region: "header-nav", x: 20, y: 20, width: 60, height: 30, href: U("/") },
      { tag: "a", text: "Sign up", selector: "#pricing-signup", region: "main-visible", x: 100, y: 500, width: 100, height: 40, href: U("/signup") },
      { tag: "button", text: "Compare plans", selector: "#compare", region: "main-visible", x: 300, y: 500, width: 140, height: 40 },
      { tag: "a", text: "Enterprise pricing", selector: "#enterprise", region: "below-fold", x: 100, y: 1200, width: 160, height: 30, href: U("/enterprise") },
    ],
    blocks: [
      { tag: "h1", text: "Pricing", y: 80, height: 50, width: 800 },
      { tag: "td", text: "Starter: $10/month", y: 200, height: 30, width: 300 },
      { tag: "td", text: "Team: $49/month", y: 240, height: 30, width: 300 },
      { tag: "p", text: "Annual billing saves 20 percent.", y: 300, height: 30, width: 800 },
    ],
  },
  [U("/signup")]: {
    title: "Create account",
    height: 900,
    formErrors: ["Email is required"],
    elements: [
      { tag: "button", text: "Create account", selector: "#create", region: "form", x: 100, y: 500, width: 160, height: 44, href: U("/welcome") },
      { tag: "a", text: "Home", selector: "#signup-home", region: "header-nav", x: 20, y: 20, width: 60, height: 30, href: U("/") },
    ],
    inputs: [
      { selector: "#email", type: "email", name: "email", placeholder: "you@example.com", label: "Email" },
      { selector: "#password", type: "password", name: "password", placeholder: "", label: "Password" },
      { selector: "#plan", type: "select", name: "plan", placeholder: "", label: "Plan", options: ["Starter", "Team"] },
      { selector: "#country", type: "select", name: "country", placeholder: "", label: "Country", isHidden: true, triggerText: "Choose a country" },
    ],
    blocks: [
      { tag: "h1", text: "Create your account", y: 80, height: 50, width: 800 },
      { tag: "p", text: "It takes less than a minute.", y: 150, height: 30, width: 800 },
    ],
  },
  [U("/welcome")]: {
    title: "Welcome aboard",
    height: 800,
    elements: [{ tag: "a", text: "Go to dashboard", selector: "#dash", region: "main-visible", x: 100, y: 300, width: 160, height: 40 }],
    blocks: [
      { tag: "h1", text: "Your account is ready", y: 80, height: 50, width: 800 },
      { tag: "p", text: "Account created on the Starter plan.", y: 150, height: 30, width: 800 },
    ],
  },
  [U("/docs")]: {
    title: "Docs - Acme",
    height: 6000,
    modal: true,
    elements: [
      { tag: "a", text: "Back to home", selector: "#docs-home", region: "header-nav", x: 20, y: 20, width: 120, height: 30, href: U("/") },
      { tag: "a", text: "Getting started guide", selector: "#guide", region: "main-visible", x: 100, y: 3000, width: 200, height: 30, href: U("/docs/guide") },
    ],
    blocks: [
      { tag: "h1", text: "Documentation", y: 80, height: 50, width: 800 },
      { tag: "h2", text: "Installation", y: 1000, height: 40, width: 800 },
      { tag: "h2", text: "Configuration", y: 2000, height: 40, width: 800 },
      { tag: "p", text: "Set the API token in your environment before you start.", y: 2050, height: 30, width: 800 },
      { tag: "h2", text: "Troubleshooting", y: 4000, height: 40, width: 800 },
    ],
  },
  [U("/docs/guide")]: {
    title: "Getting started",
    height: 1200,
    elements: [{ tag: "a", text: "Docs", selector: "#guide-docs", region: "header-nav", x: 20, y: 20, width: 60, height: 30, href: U("/docs") }],
    blocks: [{ tag: "h1", text: "Getting started", y: 80, height: 50, width: 800 }, { tag: "p", text: "Install the CLI with one command.", y: 150, height: 30, width: 800 }],
  },
};

type Step = ScriptedStep | string;

export interface Scenario {
  name: string;
  options: Omit<CognitiveJourneyOptions, "decisionProvider" | "createBrowser">;
  steps: Step[];
  finalEval?: { achieved: boolean; evidence?: string | null };
  seed?: number;
}

const ok = (action: string, extra: ScriptedStep = {}): ScriptedStep => ({ phase: "decide", monologue: `I will ${action}`, action, ...extra });

/** A fixed time for every scenario unless one tests the time of day. */
const WEDNESDAY_10AM = { now: "2026-10-21T10:00:00Z", timezone: "UTC" };

export const SCENARIOS: Scenario[] = [
  {
    // Clean success: coordinate click by text and by index, a scroll, fills,
    // a select, the submit, and a goal claim the page text confirms.
    name: "signup-success",
    options: { persona: "first-timer", goal: "Create an account on the Starter plan", startUrl: U("/"), temporalContext: WEDNESDAY_10AM },
    steps: [
      ok("dismiss", { newConfusion: 0.1, newFrustration: 0.05, goalProgress: 0.05, mood: "neutral" }),
      ok("scroll:down", { newConfusion: 0.12, goalProgress: 0.1 }),
      ok("click:Pricing details", { newConfusion: 0.05, goalProgress: 0.3, mood: "hopeful" }),
      ok("click:#1", { goalProgress: 0.5, actionTarget: "the Sign up link" }),
      ok("fill:Email:ada@example.com", { goalProgress: 0.6 }),
      ok("fill:Password:correct horse", { goalProgress: 0.65 }),
      ok("select:Plan:Starter", { goalProgress: 0.7 }),
      ok("click:Create account", { goalProgress: 0.95 }),
      { phase: "evaluate", monologue: "Done, the account exists.", action: null, goalAchieved: true, goalProgress: 1, goalEvidence: "Account created on the Starter plan" },
    ],
  },
  {
    // A low-comprehension persona grows confused: confusion onset at several
    // magnitudes (including one just past the 0.05 change threshold), one
    // clarity step, friction recorded, then abandonment on confusion.
    name: "confusion-abandon",
    options: { persona: "elderly-user", goal: "Find the configuration instructions", startUrl: U("/"), temporalContext: WEDNESDAY_10AM },
    steps: [
      ok("click:Docs", { newConfusion: 0.2, newFrustration: 0.1, goalProgress: 0.1, frictionDescription: "So many links" }),
      ok("scroll:down", { newConfusion: 0.252, newFrustration: 0.12, frictionDescription: "Where is it" }),
      ok("scroll:down", { newConfusion: 0.6, newFrustration: 0.3, frictionDescription: "Walls of text", frictionElement: "main" }),
      ok("scroll:up", { newConfusion: 0.4, newFrustration: 0.3 }),
      ok("find:configuration", { newConfusion: 0.95, newFrustration: 0.5, frictionDescription: "Nothing makes sense" }),
      ok("scroll:down", { newConfusion: 1, newFrustration: 0.7, frictionDescription: "Lost" }),
      ok("scroll:down", { newConfusion: 1, newFrustration: 0.9, frictionDescription: "Lost" }),
      ok("scroll:down", { newConfusion: 1, newFrustration: 1, frictionDescription: "Lost" }),
    ],
  },
  {
    // Failures and errors: an element that is not there (failure), a reported
    // error, a broken link (the action throws), a back, and setbacks.
    name: "failures-frustration",
    options: { persona: "careful-reader", goal: "Contact sales", startUrl: U("/"), temporalContext: WEDNESDAY_10AM },
    steps: [
      ok("click:Talk to sales", { newFrustration: 0.2, actionSuccess: false }),
      ok("click:Contact", { newFrustration: 0.4, actionSuccess: false, errorMessage: "Page failed to load" }),
      ok("navigate:https://acme.example/sales", { newFrustration: 0.5 }),
      ok("back", { newFrustration: 0.62, newConfusion: 0.3 }),
      ok("hover:Pricing", { newFrustration: 0.7 }),
      ok("hoverclick:Pricing:Home", { newFrustration: 0.85 }),
      ok("click:Talk to sales", { newFrustration: 0.95, actionSuccess: false }),
      ok("click:Talk to sales", { newFrustration: 1, actionSuccess: false }),
    ],
  },
  {
    // Decision fatigue: fills, searches and navigations add to fatigue until
    // the persona starts choosing defaults and then gives up.
    name: "decision-fatigue",
    options: { persona: "distracted-user", goal: "Compare every plan option", startUrl: U("/signup"), temporalContext: WEDNESDAY_10AM, maxSteps: 40 },
    steps: [
      ...Array.from({ length: 12 }, (_, i): Step => ok(i % 3 === 0 ? "fill:Email:x@example.com" : i % 3 === 1 ? "navigate:https://acme.example/signup" : "find:search plan", { goalProgress: 0.15 })),
    ],
  },
  {
    // Steady scrolling that never advances the goal, by a persistent persona,
    // ends on no_progress; the loop and failed-actions warnings reach the prompt.
    name: "no-progress",
    options: { persona: "careful-reader", goal: "Read the troubleshooting section", startUrl: U("/docs"), temporalContext: WEDNESDAY_10AM, maxSteps: 30 },
    // Decision fatigue (at least 0.069 an action) reaches its limit before step
    // 16, so steps with no action are what let no_progress fire.
    steps: [
      ...Array.from({ length: 4 }, (_, i): Step => ok(i % 2 ? "scroll:up" : "scroll:down", { goalProgress: 0.05 })),
      ok("click:Nowhere", { goalProgress: 0.05, actionSuccess: false }),
      ok("click:Nowhere", { goalProgress: 0.05, actionSuccess: false }),
      ok("tab:30", { goalProgress: 0.05 }),
      ...Array.from({ length: 20 }, (): Step => ({ phase: "perceive", monologue: "Still reading", action: null, goalProgress: 0.05 })),
    ],
  },
  {
    // Long waits push a patient persona past its time limit.
    name: "timeout",
    options: { persona: "screen-reader-user", goal: "Wait for the page", startUrl: U("/pricing"), temporalContext: WEDNESDAY_10AM },
    steps: [...Array.from({ length: 12 }, (): Step => ok("wait:20000", { goalProgress: 0.1 }))],
  },
  {
    // Runs out of steps; the final evaluation says the goal was met.
    name: "final-eval-achieved",
    options: { persona: "power-user", goal: "See the Team price", startUrl: U("/"), temporalContext: WEDNESDAY_10AM, maxSteps: 3 },
    steps: [ok("click:Pricing", { goalProgress: 0.6 }), ok("expand:Compare plans", { goalProgress: 0.7 }), ok("enter", { goalProgress: 0.8 })],
    finalEval: { achieved: true, evidence: "Team: $49/month" },
  },
  {
    // Out of steps, final evaluation says no, but progress is high and the last
    // thought says "found it": the strong-signal fallback.
    name: "fallback-strong-signal",
    options: { persona: "task-focused", goal: "Find the install command", startUrl: U("/docs"), temporalContext: WEDNESDAY_10AM, maxSteps: 3 },
    steps: [
      ok("dismiss", { goalProgress: 0.2 }),
      ok("click:Getting started guide", { goalProgress: 0.95 }),
      { phase: "evaluate", monologue: "Found it: install the CLI with one command.", action: "scroll:up", goalProgress: 0.95 },
    ],
  },
  {
    // A goal claim the page does not support is kept but marked unverified;
    // the reply is not JSON at step 1.
    name: "unverified-evidence",
    options: { persona: "explorer", goal: "Find the refund policy", startUrl: U("/pricing"), temporalContext: WEDNESDAY_10AM },
    steps: ["I am not sure what to do here.", { phase: "evaluate", monologue: "It must be here", action: null, goalAchieved: true, goalEvidence: "Refunds are processed within thirty business days" }],
  },
  {
    // Returning visit, older persona with tremor-like jitter, late on a Friday:
    // familiarity lift, carried-over feelings, time-of-day deltas, distraction
    // pauses, Fitts and gaze-lag timing, and typing time.
    name: "returning-friday-night",
    options: {
      persona: "elderly-user", goal: "Sign up again", startUrl: U("/"), maxSteps: 6,
      temporalContext: { now: "2026-10-23T23:30:00Z", timezone: "UTC" },
      priorMemory: {
        visitCount: 3, lastVisitAt: "2026-10-20 18:00:00", lastOutcome: { achieved: false, reason: "gave up at the form" },
        observations: ["The sign up button is at the top"], emotionalBaseline: { satisfaction: 0.1, frustration: 0.3, valence: -0.2 },
        thingsTried: ["Sign up"],
      },
    },
    seed: 7,
    steps: [
      ok("click:Sign up", { goalProgress: 0.4, newFrustration: 0.35 }),
      ok("fill:Email:old@example.com", { goalProgress: 0.5 }),
      ok("fill:Password:hunter2hunter2", { goalProgress: 0.6, newFrustration: 0.5 }),
      ok("click:Create account", { goalProgress: 0.9 }),
      ok("scroll:down", { goalProgress: 0.9, newFrustration: 0.2 }),
      ok("scroll:top", { goalProgress: 0.9 }),
    ],
    finalEval: { achieved: false, evidence: null },
  },
  {
    // A weekend evening, verbose: the console lines the verbose mode prints.
    name: "weekend-evening-verbose",
    options: { persona: "explorer", goal: "Look around", startUrl: U("/"), temporalContext: { now: "2026-10-24T19:00:00Z", timezone: "UTC" }, verbose: true, maxSteps: 7 },
    seed: 11,
    steps: [
      ok("subscribe", { newConfusion: 0.3, newFrustration: 0.3 }),
      ok("scroll:bottom", { newConfusion: 0.9, newFrustration: 0.9 }),
      ok("scroll:bottom", { newConfusion: 1, newFrustration: 1 }),
      ok("scroll:top", { newConfusion: 0.1, newFrustration: 0.1 }),
      ok("click:Docs", { newConfusion: 0.1 }),
      ok("dismiss", { newConfusion: 0.05 }),
      ok("click:Getting started guide", { goalProgress: 0.3 }),
    ],
  },
  {
    // humanInput on: typing, clicking, scrolling and settling with human
    // timing and imperfection, from a seeded random source.
    name: "human-input",
    options: { persona: "first-timer", goal: "Sign up", startUrl: U("/signup"), temporalContext: WEDNESDAY_10AM, humanInput: true, maxSteps: 6 },
    seed: 3,
    steps: [
      ok("fill:#email:Typing Practice Quickly", { goalProgress: 0.3 }),
      ok("fill:#password:abcdefghij", { goalProgress: 0.4 }),
      ok("scroll:down", { goalProgress: 0.4 }),
      ok("scroll:up", { goalProgress: 0.4 }),
      ok("click:Create account", { goalProgress: 0.9 }),
      { phase: "evaluate", monologue: "Ready", action: null, goalAchieved: true, goalEvidence: "Your account is ready" },
    ],
  },
  {
    // The live viewer: overlay scripts, the 1920x995 viewport and its
    // navigation timeout, and action banners.
    name: "live-viewer",
    options: { persona: "power-user", goal: "Open the docs", startUrl: U("/"), temporalContext: WEDNESDAY_10AM, enableMouseOverlay: true, maxSteps: 3 },
    steps: [ok("click:Docs", { goalProgress: 0.5, actionTarget: "the Docs link in the header" }), ok("dismiss", { goalProgress: 0.6 }), ok("scroll:down", { goalProgress: 0.6 })],
  },
  {
    // One failed first step drains an impatient persona's patience at once.
    name: "patience-abandon",
    options: { persona: "impatient-user", goal: "Contact sales", startUrl: U("/"), temporalContext: WEDNESDAY_10AM },
    steps: [ok("click:Talk to sales", { newFrustration: 0.2, actionSuccess: false })],
  },
  {
    // A patient, self-assured persona with no resilience: a setback, then
    // failures push frustration past its limit before anxiety follows.
    name: "frustration-abandon",
    options: { persona: "careful-reader", goal: "Find the API docs", startUrl: U("/docs"), temporalContext: WEDNESDAY_10AM, customTraits: { patience: 1, resilience: 0, selfEfficacy: 1 } },
    steps: [ok("scroll:down", { newFrustration: 0.6 }), ok("click:Nothing here", { actionSuccess: false })],
  },
  {
    // Repeated failures and errors raise anxiety and frustration together
    // while patience drains: the emotional rule, not a threshold, ends it.
    name: "emotional-abandon",
    options: { persona: "careful-reader", goal: "Contact sales", startUrl: U("/"), temporalContext: WEDNESDAY_10AM, customTraits: { patience: 0.75 } },
    steps: [
      ok("click:Talk to sales", { actionSuccess: false }),
      ok("click:Talk to sales", { actionSuccess: false, errorMessage: "Page failed to load" }),
      ok("click:Talk to sales", { actionSuccess: false }),
    ],
  },
  {
    // Negative feelings short of every threshold, with patience just above its
    // floor: the emotional modifier on the patience floor ends it.
    name: "emotional-modifier",
    options: { persona: "careful-reader", goal: "Contact sales", startUrl: U("/"), temporalContext: WEDNESDAY_10AM, customTraits: { patience: 0.5, resilience: 0.2, selfEfficacy: 0.3 } },
    steps: [
      ok("click:Talk to sales", { actionSuccess: false, newConfusion: 0.4 }),
      ok("scroll:down", { newFrustration: 0.7, newConfusion: 0.5 }),
      ok("scroll:down", { newFrustration: 0.7 }),
      ok("click:Talk to sales", { actionSuccess: false }),
      ok("scroll:down", {}),
    ],
  },
];

// The trait sweep: one short journey per grid point, waiting 61 s a step, so
// the system prompt shows the confusion and frustration limits and the step
// the journey times out on shows the time limit. The grid sits on both sides
// of every cut point the thresholds use (0.3, 0.4, 0.7) within 10%.
const GRID = [0.2, 0.28, 0.31, 0.37, 0.42, 0.65, 0.72, 0.8];
for (const v of GRID) {
  SCENARIOS.push({
    name: `sweep-${v}`,
    options: {
      persona: "task-focused", goal: "Wait", startUrl: U("/welcome"), temporalContext: WEDNESDAY_10AM, maxSteps: 5,
      customTraits: { patience: v, comprehension: v, persistence: v, resilience: v, curiosity: v },
    },
    steps: [ok("wait:61000", { newConfusion: 0.05 + v / 2, newFrustration: v / 2 })],
  });
}

/** Everything one scenario produced. */
export interface ScenarioRecord {
  systemPrompt: string;
  prompts: string[];
  finalEvalPrompt: string | null;
  steps: unknown[];
  delays: number[];
  elapsedMs: number;
  calls: string[];
  console: string[];
  /** The config runCognitiveJourney built its browser with. */
  browserConfig: unknown;
  result: unknown;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export async function runScenario(s: Scenario): Promise<ScenarioRecord> {
  const { runCognitiveJourney } = await import("../../src/cognitive/index.js");
  // Imported up front so no import is in flight while the virtual clock runs.
  await import("../../src/cognitive/temporal.js");
  await import("../../src/visual/human-input.js");
  const provider = new ScriptedProvider(s.steps, s.finalEval);
  const calls: string[] = [];
  const steps: unknown[] = [];
  let browserConfig: unknown = null;
  const consoleLines: string[] = [];
  const realLog = console.log;
  const realWarn = console.warn;
  console.log = (...a: unknown[]) => { consoleLines.push(a.map(String).join(" ")); };
  console.warn = (...a: unknown[]) => { consoleLines.push(`warn: ${a.map(String).join(" ")}`); };
  try {
    const { result, delays, elapsedMs } = await withSeededRandom(s.seed ?? 1, () =>
      withVirtualTime(() =>
        runCognitiveJourney({
          ...s.options,
          // Else it follows $DISPLAY, which the pin must not depend on.
          headless: true,
          decisionProvider: provider,
          createBrowser: (config) => {
            browserConfig = clone(config);
            return createWorldBrowser(WORLD, { calls }) as never;
          },
          onStep: (step) => { steps.push(clone(step)); },
        }),
      ),
    );
    return {
      systemPrompt: provider.systemPrompt,
      prompts: provider.prompts,
      finalEvalPrompt: provider.finalEvalPrompt,
      steps,
      delays,
      elapsedMs,
      calls,
      console: consoleLines,
      browserConfig,
      result: clone(result),
    };
  } finally {
    console.log = realLog;
    console.warn = realWarn;
  }
}

export async function runAllScenarios(): Promise<Record<string, ScenarioRecord>> {
  const out: Record<string, ScenarioRecord> = {};
  for (const s of SCENARIOS) out[s.name] = await runScenario(s);
  return out;
}
