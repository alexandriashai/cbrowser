/**
 * evaluate_script is refused on a session that is running a cognitive journey
 * (Alexa, 2026-10-23: "refuse evaluate_script on a session while a journey
 * runs on it"), and cognitive_journey_update_state releases the session when
 * the journey ends. Fake browsers here; tests/journey-session-scripts-browser.test.ts
 * runs the real flow from cognitive_journey_init.
 */
import { describe, expect, test } from "bun:test";
import { isJourneyBrowser, markJourneyBrowser } from "../src/mcp-tools/journey-sessions.js";

type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;

/** A browser whose page evaluates by calling the compiled function with its payload. */
function fakeBrowser() {
  let pageCalls = 0;
  const browser = {
    getPage: async () => {
      pageCalls++;
      return { evaluate: async (fn: (p: unknown) => unknown, payload: unknown) => fn(payload) };
    },
  };
  return { browser, pageCalls: () => pageCalls };
}

async function tools(sessions: Map<string, unknown>) {
  const handlers = new Map<string, Handler>();
  const server = {
    registerTool: (name: string, _config: unknown, h: Handler) => { handlers.set(name, h); },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  };
  const ctx = {
    getBrowser: async () => { throw new Error("hosted path only in these tests"); },
    getBrowserByToken: async (token?: string) => {
      const b = token ? sessions.get(token) : undefined;
      if (!b) throw new Error(`no session ${token}`);
      return { browser: b, token: token! };
    },
  };
  const { registerBrowserStateTools } = await import("../src/mcp-tools/base/browser-state-tools.js");
  const { registerCognitiveTools } = await import("../src/mcp-tools/base/cognitive-tools.js");
  registerBrowserStateTools(server as never, ctx as never);
  registerCognitiveTools(server as never, ctx as never);
  return handlers;
}

const parse = (r: { content: Array<{ text: string }> }) => JSON.parse(r.content[0].text);

const STATE = {
  patienceRemaining: 0.9, confusionLevel: 0.1, frustrationLevel: 0.1, goalProgress: 0.5,
  confidenceLevel: 0.5, currentMood: "neutral", stepCount: 3, timeElapsed: 12,
};
const TRAITS = { patience: 0.5, riskTolerance: 0.5, comprehension: 0.5, persistence: 0.5 };

describe("evaluate_script on a journey session", () => {
  test("is refused even with force, and nothing touches the page", async () => {
    const j = fakeBrowser();
    markJourneyBrowser(j.browser as never);
    const h = await tools(new Map([["cb_journey", j.browser]]));
    const r = await h.get("evaluate_script")!({ script: "document.title", force: true, _browserToken: "cb_journey" });
    expect(r.isError).toBe(true);
    expect(parse(r)).toMatchObject({ result: null, zone: "red", refused: "journey_session" });
    expect(parse(r).reason).toContain("cognitive journey");
    expect(j.pageCalls()).toBe(0);
  });

  test("still runs with force on a session that is not a journey", async () => {
    const other = fakeBrowser();
    const h = await tools(new Map([["cb_other", other.browser]]));
    const r = await h.get("evaluate_script")!({ script: "1 + 41", force: true, _browserToken: "cb_other" });
    expect(r.isError).toBeFalsy();
    expect(parse(r).result).toBe(42);
  });
});

describe("cognitive_journey_update_state releases the session when the journey ends", () => {
  test("an abandoning update with the session's token releases it, and scripts run again", async () => {
    const j = fakeBrowser();
    markJourneyBrowser(j.browser as never);
    const h = await tools(new Map([["cb_j2", j.browser]]));
    const r = await h.get("cognitive_journey_update_state")!({
      currentState: { ...STATE, patienceRemaining: 0.05 }, actionResult: { success: false }, personaTraits: TRAITS,
      _browserToken: "cb_j2",
    });
    expect(parse(r)).toMatchObject({ shouldAbandon: true, journeyOver: true, sessionReleased: true });
    expect(isJourneyBrowser(j.browser as never)).toBe(false);
    const e = await h.get("evaluate_script")!({ script: "6 * 7", force: true, _browserToken: "cb_j2" });
    expect(parse(e).result).toBe(42);
  });

  test("reaching the goal ends the journey too", async () => {
    const j = fakeBrowser();
    markJourneyBrowser(j.browser as never);
    const h = await tools(new Map([["cb_j3", j.browser]]));
    const r = await h.get("cognitive_journey_update_state")!({
      currentState: { ...STATE, goalProgress: 0.95 }, actionResult: { success: true, progressMade: true }, personaTraits: TRAITS,
      _browserToken: "cb_j3",
    });
    expect(parse(r)).toMatchObject({ shouldAbandon: false, journeyOver: true, sessionReleased: true });
    expect(isJourneyBrowser(j.browser as never)).toBe(false);
  });

  test("a step that does not end the journey keeps the session locked", async () => {
    const j = fakeBrowser();
    markJourneyBrowser(j.browser as never);
    const h = await tools(new Map([["cb_j4", j.browser]]));
    const r = await h.get("cognitive_journey_update_state")!({
      currentState: STATE, actionResult: { success: true }, personaTraits: TRAITS, _browserToken: "cb_j4",
    });
    expect(parse(r).journeyOver).toBe(false);
    expect(parse(r).sessionReleased).toBeUndefined();
    expect(isJourneyBrowser(j.browser as never)).toBe(true);
  });

  test("on the hosted path, an update without a token releases nothing and mints no session", async () => {
    const j = fakeBrowser();
    markJourneyBrowser(j.browser as never);
    const sessions = new Map([["cb_j5", j.browser]]);
    const h = await tools(sessions);
    const r = await h.get("cognitive_journey_update_state")!({
      currentState: { ...STATE, patienceRemaining: 0.05 }, actionResult: { success: false }, personaTraits: TRAITS,
    });
    expect(parse(r)).toMatchObject({ journeyOver: true, sessionReleased: false });
    expect(isJourneyBrowser(j.browser as never)).toBe(true);
    expect(sessions.size).toBe(1);
  });
});
