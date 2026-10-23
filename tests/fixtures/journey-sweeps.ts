/**
 * The journey golden's helper sweeps: every function the journey computes
 * with, run over a grid of inputs that straddles each of its cut points, so a
 * change to any constant in it moves some pinned number even when no scripted
 * journey happens to land near that constant.
 *
 * Covered: the motor, typing, scan, gaze, peripheral-vision, habituation and
 * fatigue helpers in types.ts; the emotional engine (emotions.ts); the
 * time-of-day model (temporal.ts); the human-input timing (human-input.ts, on
 * a fake page, a virtual clock and a seeded random source); and the two MCP
 * journey tools, cognitive_journey_init (thresholds, site familiarity, the
 * served instructions) and cognitive_journey_update_state (the update rules
 * and abandonment), through a stub server and a fake browser.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { EmotionalState, EmotionalTrigger } from "../../src/types.js";
import { withSeededRandom, withVirtualTime } from "./journey-world.js";

const range = (from: number, to: number, step: number): number[] => {
  const out: number[] = [];
  for (let i = 0; from + i * step <= to + 1e-9; i++) out.push(Math.round((from + i * step) * 1e6) / 1e6);
  return out;
};

/** Points either side of every cut point used in the journey code, within 10%. */
const UNIT = [...new Set([...range(0, 1, 0.05), 0.04, 0.045, 0.055, 0.09, 0.11, 0.18, 0.22, 0.27, 0.28, 0.31, 0.33, 0.36, 0.38, 0.42, 0.44, 0.48, 0.52, 0.54, 0.57, 0.63, 0.66, 0.68, 0.72, 0.74, 0.77, 0.78, 0.82, 0.84, 0.86, 0.88, 0.91, 0.93, 0.97, 0.99])].sort((a, b) => a - b);

const TRIGGERS: EmotionalTrigger[] = [
  "success", "failure", "error", "progress", "setback", "waiting", "discovery", "completion", "confusion_onset", "clarity", "time_pressure", "recovery",
];

/** A deterministic spread of emotional states, plus the corners. */
function emotionalStates(): EmotionalState[] {
  let s = 12345;
  const next = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out: EmotionalState[] = [];
  const mk = (a: number, f: number, b: number, c: number, sat: number, e: number, r: number): EmotionalState => ({
    anxiety: a, frustration: f, boredom: b, confusion: c, satisfaction: sat, excitement: e, relief: r, dominant: "neutral", valence: 0, arousal: 0.3,
  });
  out.push(mk(0, 0, 0, 0, 0, 0, 0), mk(1, 1, 1, 1, 1, 1, 1), mk(0.9, 0.85, 0.65, 0.75, 0.1, 0.05, 0.1), mk(0.05, 0.62, 0.55, 0.72, 0.15, 0.3, 0.19));
  // All positive, no negative: the abandonment modifier's lowest reach.
  out.push(mk(0, 0, 0, 0, 1, 1, 1));
  // A dominant emotion either side of the "somewhat" and "very" words.
  out.push(mk(0.38, 0.1, 0, 0, 0, 0, 0), mk(0.42, 0.1, 0, 0, 0, 0, 0), mk(0.68, 0.1, 0, 0, 0, 0, 0), mk(0.72, 0.1, 0, 0, 0, 0, 0));
  // Weak states, where whether any emotion is dominant after a decay turns on the floor.
  for (const v of [0.08, 0.1, 0.105, 0.11, 0.12, 0.16]) out.push(mk(v, v / 2, 0, 0, 0, 0, 0));
  for (let i = 0; i < 160; i++) out.push(mk(next(), next(), next(), next(), next(), next(), next()));
  return out;
}

/** States whose valence and arousal are set, either side of the rule that reads them. */
function derivedStates(): EmotionalState[] {
  const out: EmotionalState[] = [];
  for (const valence of [-0.7, -0.62, -0.58, -0.5]) {
    for (const arousal of [0.5, 0.58, 0.62, 0.7]) {
      out.push({ anxiety: 0.2, frustration: 0.3, boredom: 0.1, confusion: 0.2, satisfaction: 0.3, excitement: 0.2, relief: 0.3, dominant: "frustration", valence, arousal });
    }
  }
  return out;
}

async function helperSweeps(): Promise<Record<string, unknown>> {
  const T = await import("../../src/types.js");
  const out: Record<string, unknown> = {};
  out.fatigueIncrement = range(0, 12, 1).map((n) => T.calculateFatigueIncrement(n));
  out.fittsDefaults = { ...T.DEFAULT_FITTS_PARAMS };
  out.fitts = [50, 300, 1200].flatMap((d) => [0.5, 20, 80].flatMap((w) =>
    [{}, { ageModifier: 1.5, tremorModifier: 2 }, { a: 100, b: 200 }].map((p) => T.calculateFittsMovementTime(d, w, p))));
  out.system2 = UNIT.flatMap((c) => [0.4, 0.6].flatMap((t) => [0, 2, 3].map((e) => T.shouldSwitchToSystem2(c, { system: 1, switchThreshold: t, system1Errors: e, timeInSystem1: 0, timeInSystem2: 0 }))));
  out.system1 = UNIT.flatMap((c) => [true, false].map((ok) => T.canReturnToSystem1(c, ok)));
  out.klm = { ...T.KLM_OPERATORS };
  out.typing = ["", "a", "hello world", "x".repeat(40)].flatMap((t) => [0, 0.25, 0.5, 1].flatMap((x) => [true, false].map((m) => T.calculateTypingTime(t, x, m))));
  out.typingDefault = T.calculateTypingTime("abc");
  out.scanWidth = UNIT.map((l) => T.calculateScanWidthMultiplier(l));
  out.gazeLag = ["18-25", "20-30", "25-45", "38-60", "40-65", "55+", "65+", "75+", "85+", "n/a", ""].map((a) => T.calculateGazeMouseLag(a));
  out.gazeLagDefault = T.calculateGazeMouseLag(undefined);
  out.peripheral = UNIT.flatMap((f) => [0, 0.5, 0.85].map((c) => T.calculatePeripheralVision(f, c)));
  out.habituationVisibility = [2, 3, 5].flatMap((th) => range(0, 6, 1).flatMap((n) => [0, 0.5, 1].map((comp) =>
    T.calculateHabituationVisibility("cookie-banner", { exposureCount: { "cookie-banner": n } as never, blindnessThreshold: th, blindPatterns: [] }, comp))));
  out.habituationBlind = T.calculateHabituationVisibility("chat-widget", { exposureCount: {} as never, blindnessThreshold: 3, blindPatterns: ["chat-widget"] }, 0.5);
  let hab = T.createHabituationState();
  const seen: unknown[] = [hab];
  for (const p of ["cookie-banner", "newsletter-popup", "cookie-banner", "cookie-banner", "newsletter-popup", "cookie-banner"] as const) {
    hab = T.updateHabituationState(hab, p);
    seen.push(hab);
  }
  out.habituationSequence = seen;
  out.uiPatterns = ["Accept all cookies", "Subscribe", "Share", "Live chat", "50% off", "Pricing", "Sponsored", "Loading"].map((t) => T.classifyUIPattern(t));
  return out;
}

async function emotionSweeps(): Promise<Record<string, unknown>> {
  const E = await import("../../src/cognitive/emotions.js");
  const out: Record<string, unknown> = {};
  const grid = [0, 0.25, 0.5, 0.75, 1];
  out.initial = grid.flatMap((p) => grid.flatMap((c) => grid.map((se) => E.createInitialEmotionalState({ patience: p, curiosity: c, selfEfficacy: se, resilience: 0.5 }))));
  out.initialDefault = E.createInitialEmotionalState();
  out.config = grid.flatMap((r) => grid.map((p) => E.createEmotionalConfig({ resilience: r, patience: p })));
  const config = E.createEmotionalConfig({ resilience: 0.4, patience: 0.6, curiosity: 0.7, selfEfficacy: 0.3 });
  const mid = E.createInitialEmotionalState({ patience: 0.6, curiosity: 0.7, selfEfficacy: 0.3 });
  out.triggers = TRIGGERS.flatMap((t) => [0.5, 1, 2].map((sev) => {
    const r = E.applyEmotionalTrigger(mid, t, config, 3, { severity: sev });
    return { state: r.state, changes: r.event.changes, description: r.event.description };
  }));
  out.triggerDefaultDescription = TRIGGERS.map((t) => E.applyEmotionalTrigger(mid, t, config, 1).event.description);
  const states = emotionalStates();
  out.decayLegacy = states.slice(0, 40).map((s) => E.decayEmotions(s, config));
  out.decayTraits = states.slice(0, 50).flatMap((s) => [{}, { comprehension: 0, resilience: 1, curiosity: 0.3 }, { comprehension: 1, resilience: 0, curiosity: 1 }].map((tr) => E.decayEmotionsWithTraits(s, config, tr)));
  out.abandonmentModifier = states.map((s) => E.calculateAbandonmentModifier(s));
  out.exploration = states.map((s) => E.calculateExplorationTendency(s));
  out.decisionSpeed = states.map((s) => E.calculateDecisionSpeedModifier(s));
  out.shouldConsider = [...states, ...derivedStates()].map((s) => E.shouldConsiderAbandonment(s));
  out.simplified = states.flatMap((s) => [0.05, 0.1, 0.2, 0.5, 1].map((p) => E.deriveSimplifiedState(s, { patience: p })));
  // Derived values (dominant, valence, arousal) go through a trigger; describe them too.
  out.described = states.map((s) => {
    const d = E.applyEmotionalTrigger(s, "waiting", config, 1, { severity: 0 }).state;
    return { d, text: E.describeEmotionalState(d) };
  });
  return out;
}

async function temporalSweeps(): Promise<Record<string, unknown>> {
  const M = await import("../../src/cognitive/temporal.js");
  const out: Record<string, unknown> = {};
  out.energy = range(0, 23, 1).map((h) => M.circadianEnergy(h));
  out.states = range(0, 6, 1).flatMap((dow) => range(0, 23, 1).map((h) => {
    // 2026-10-18 is a Sunday.
    const st = M.getTemporalState({ now: new Date(Date.UTC(2026, 9, 18 + dow, h, 30)), timezone: "UTC" });
    return { st, mod: M.computeTemporalModulators(st) };
  }));
  out.distraction = await withSeededRandom(5, async () =>
    [0.03, 0.3, 1].map((rate) => range(1, 300, 1).map(() => M.rollDistraction({ patienceDelta: 0, workingMemoryDelta: 0, curiosityDelta: 0, metacognitiveDelta: 0, distractionRate: rate, satisfactionMultiplier: 1 }))));
  return out;
}

/** A page that records what the human-input helpers did to it. */
function inputPage(log: string[]) {
  return {
    keyboard: {
      type: async (t: string) => { log.push(`type ${t}`); },
      press: async (k: string) => { log.push(`press ${k}`); },
    },
    mouse: {
      move: async (x: number, y: number, o?: { steps?: number }) => { log.push(`move ${x},${y},${o?.steps}`); },
      click: async (x: number, y: number) => { log.push(`click ${x},${y}`); },
    },
    evaluate: async (_fn: unknown, arg?: { d: number }) => { log.push(`scroll ${arg?.d}`); },
  };
}

/**
 * Run `fn` with Math.random cycling through values that reach the tails:
 * near 0 and near 1 (so a Box-Muller draw lands about 7 standard deviations
 * out and every clamp binds), and values just either side of each rate the
 * human-input timing rolls against (2%, 4%, 5%).
 */
async function withTailRandom<T>(fn: () => Promise<T>): Promise<T> {
  const real = Math.random;
  // Odd length, so a pair (u, v) drawn by gauss starts on either parity; the
  // tiny-tiny pair gives z of about +7.4 and tiny-then-half about -7.4.
  const cycle = [1e-12, 1e-12, 0.5, 1e-12, 0.5, 1 - 1e-12, 0.25, 0.019, 0.039, 0.049, 0.75, 1e-4, 0.6, 0.021, 0.041, 0.051, 0.3, 0.999, 0.1];
  let i = 0;
  Math.random = () => cycle[i++ % cycle.length];
  try {
    return await fn();
  } finally {
    Math.random = real;
  }
}

async function humanInputSweeps(): Promise<Record<string, unknown>> {
  const H = await import("../../src/visual/human-input.js");
  const out: Record<string, unknown> = {};
  const traitSets = [
    undefined,
    { proceduralFluency: 1, motorPrecision: 1, patience: 0.2, readingTendency: 0 },
    { proceduralFluency: 0, motorPrecision: 0, patience: 1, readingTendency: 1 },
    // Patience just above the glance-back cut, and a motor precision outside
    // 0-1 (a direct caller may pass one) that widens the aim past the default target.
    { proceduralFluency: 0.3, motorPrecision: -1, patience: 0.42, readingTendency: 0.5 },
  ];
  const drive = async (tr: (typeof traitSets)[number]) => {
    const log: string[] = [];
    const page = inputPage(log) as never;
    const { delays } = await withVirtualTime(async () => {
      await H.humanType(page, "Quick brown fox jumps over 12 lazy dogs", tr);
      for (let k = 0; k < 60; k++) await H.humanClick(page, 400, 300, tr, k % 3 ? { width: 120, height: 40 } : undefined);
      for (let k = 0; k < 60; k++) await H.humanScroll(page, k % 2 ? 400 : -400, tr);
      for (let k = 0; k < 20; k++) await H.humanSettle(tr);
    });
    return { log, delays };
  };
  for (const [i, tr] of traitSets.entries()) {
    out[`set${i}`] = await withSeededRandom(17 + i, () => drive(tr));
    out[`tails${i}`] = await withTailRandom(() => drive(tr));
  }
  return out;
}

type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ type: string; text?: string }> }>;

async function mcpSweeps(): Promise<Record<string, unknown>> {
  const { registerCognitiveTools } = await import("../../src/mcp-tools/base/cognitive-tools.js");
  const { SiteModelManager } = await import("../../src/site-model/manager.js");
  const handlers: Record<string, Handler> = {};
  const server = { registerTool: (name: string, _def: unknown, h: Handler) => { handlers[name] = h; } };
  // A page that renders; a blank one makes the init tool reload it.
  let blank = false;
  const browserCalls: string[] = [];
  const fakeBrowser = {
    navigate: async () => { browserCalls.push("navigate"); return {}; },
    getPage: async () => ({ title: async () => (blank ? "" : "Fixture"), evaluate: async () => (blank ? 0 : 42) }),
    applyPersonaLocation: async () => ({ timezoneStored: true }),
    close: async () => { browserCalls.push("close"); },
    launch: async () => { browserCalls.push("launch"); },
  };
  registerCognitiveTools(server as never, { getBrowser: async () => fakeBrowser as never });

  // Seed site models with 0, 5, 12 and 25 crawled pages, with and without
  // known goal paths and failures, for the familiarity ceiling.
  const manager = SiteModelManager.getInstance();
  // Idempotent, so the sweep can run more than once in a process.
  const seed = async (domain: string, pages: number, goals: number, failures: number) => {
    const model = await manager.loadModel(domain);
    for (let i = 0; i < pages; i++) (model.navigation.nodes as Record<string, unknown>)[`/p${i}`] = { url: `/p${i}`, lastVisited: 0 };
    (model.goalPaths as unknown[]).length = 0;
    (model.failures as unknown[]).length = 0;
    for (let i = 0; i < goals; i++) (model.goalPaths as unknown[]).push({ lastUsed: 0 });
    for (let i = 0; i < failures; i++) (model.failures as unknown[]).push({ lastSeen: 0 });
  };
  await seed("two.example", 2, 0, 0);
  await seed("five.example", 5, 0, 2);
  await seed("ten.example", 10, 0, 0);
  await seed("twelve.example", 12, 0, 0);
  await seed("sixteen.example", 16, 0, 0);
  await seed("full.example", 25, 3, 0);
  await seed("fullnogoal.example", 25, 0, 0);

  // A custom persona on disk that sets only some traits, and a CMS custom
  // persona that sets only some values (served by a stub CMS).
  const { getPersonasDir } = await import("../../src/personas.js");
  const { mkdirSync, writeFileSync } = await import("node:fs");
  mkdirSync(getPersonasDir(), { recursive: true });
  writeFileSync(`${getPersonasDir()}/mcp-partial-traits.json`, JSON.stringify({
    name: "mcp-partial-traits", description: "A custom persona that sets only three traits",
    demographics: { age_range: "30-40", tech_level: "intermediate", device: "desktop" },
    cognitiveTraits: { patience: 0.6, comprehension: 0.55, riskTolerance: 0.45 },
  }));
  const cms = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => Response.json({ personas: [{
      name: "CMS Shopper", slug: "cms-shopper", description: "A shopper from the CMS", source: "cms",
      traits: JSON.stringify({ patience: 0.4, comprehension: 0.6 }),
      schwartz_values: JSON.stringify({ security: 0.8, stimulation: 0.2 }),
    }] }),
  });
  const { setSessionApiKey } = await import("../../src/mcp-tools/base/cognitive-tools.js");
  const savedCms = process.env.CMS_URL;

  const out: Record<string, unknown> = {};
  const init: unknown[] = [];
  const traitGrid = [0.2, 0.28, 0.31, 0.37, 0.42, 0.65, 0.72, 0.8];
  for (const domain of ["none.example", "two.example", "five.example", "ten.example", "twelve.example", "sixteen.example", "full.example", "fullnogoal.example"]) {
    for (const fam of [0, 0.04, 0.05, 0.08, 0.1, 0.3, 0.55, 0.6, 0.9]) {
      const r = await handlers.cognitive_journey_init({ persona: "first-timer", goal: "g", startUrl: `https://${domain}/`, customTraits: { siteFamiliarity: fam } });
      init.push(JSON.parse(r.content[0].text!));
    }
  }
  for (const v of traitGrid) {
    const r = await handlers.cognitive_journey_init({ persona: "first-timer", goal: "g", startUrl: "https://none.example/", customTraits: { patience: v, comprehension: v, persistence: v, riskTolerance: v, readingTendency: v } });
    init.push(JSON.parse(r.content[0].text!));
  }
  for (const persona of ["power-user", "elderly-user", "impatient-user", "careful-reader"]) {
    const r = await handlers.cognitive_journey_init({ persona, goal: "g", startUrl: "https://none.example/", location: { timezone: "Europe/London" } });
    init.push(JSON.parse(r.content[0].text!));
  }
  blank = true;
  const r = await handlers.cognitive_journey_init({ persona: "first-timer", goal: "g", startUrl: "https://none.example/" });
  init.push(JSON.parse(r.content[0].text!));
  blank = false;
  init.push(JSON.parse((await handlers.cognitive_journey_init({ persona: "mcp-partial-traits", goal: "g", startUrl: "https://none.example/", customTraits: { curiosity: 0.4 } })).content[0].text!));
  try {
    process.env.CMS_URL = `http://127.0.0.1:${cms.port}`;
    setSessionApiKey("cbk_journey_sweep");
    init.push(JSON.parse((await handlers.cognitive_journey_init({ persona: "cms-shopper", goal: "g", startUrl: "https://none.example/" })).content[0].text!));
    out.cmsRoster = JSON.parse((await handlers.list_cognitive_personas({})).content[0].text!).personas.filter((p: { name: string }) => p.name === "CMS Shopper");
  } finally {
    setSessionApiKey(undefined);
    if (savedCms === undefined) delete process.env.CMS_URL;
    else process.env.CMS_URL = savedCms;
    cms.stop(true);
  }
  out.initBrowserCalls = browserCalls;
  // _browserToken is null without a token-based browser, so the pin holds no session id.
  out.init = init;

  const update: unknown[] = [];
  // The last set is outside 0-1, as the schema allows: a modulation at or
  // below zero makes a threshold zero or negative.
  const valueSets = [undefined, { security: 0.9, conformity: 0.9, achievement: 0.9, stimulation: 0.9 }, { security: 0.1, conformity: 0.1, achievement: 0.1, stimulation: 0.1 }, { security: -3, conformity: -3 }];
  const results = [{ success: true }, { success: true, progressMade: true }, { success: false }, { success: true, wasConfusing: true }, { success: false, wasConfusing: true, wentBack: true }];
  for (const values of valueSets) {
    for (const actionResult of results) {
      for (const [pat, conf, frus] of [[1, 0, 0], [0.5, 0.45, 0.6], [0.11, 0.85, 0.84], [0.3, 0.95, 0.9], [0.05, 0.7, 0.75]]) {
        for (const persistence of [0.3, 0.5, 0.7]) {
          const r = await handlers.cognitive_journey_update_state({
            currentState: { patienceRemaining: pat, confusionLevel: conf, frustrationLevel: frus, goalProgress: 0.4, confidenceLevel: 0.5, currentMood: "neutral", stepCount: 3, timeElapsed: 10 },
            actionResult,
            personaTraits: { patience: 0.5, riskTolerance: 0.5, comprehension: 0.3, persistence },
            ...(values ? { personaValues: values } : {}),
          });
          update.push(JSON.parse(r.content[0].text!));
        }
      }
    }
  }
  out.update = update;
  return out;
}

/** Each sweep by name, in the order the pin holds them. */
export const SWEEPS: Record<string, () => Promise<Record<string, unknown>>> = {
  helpers: helperSweeps,
  emotions: emotionSweeps,
  temporal: temporalSweeps,
  humanInput: humanInputSweeps,
  mcp: mcpSweeps,
};

export async function runHelperSweeps(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [name, run] of Object.entries(SWEEPS)) out[name] = await run();
  return out;
}
