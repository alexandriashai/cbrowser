/**
 * The real flow behind tests/journey-session-scripts.test.ts: a session that
 * cognitive_journey_init opens refuses evaluate_script, even with force, until
 * cognitive_journey_update_state reports the journey over; a session that is
 * not a journey runs scripts as before. A real browser on a local page.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
const parse = (r: { content: Array<{ text: string }> }) => JSON.parse(r.content[0].text);

const handlers = new Map<string, Handler>();
const sessions = new Map<string, { close: () => Promise<void> }>();
let server: ReturnType<typeof Bun.serve>;
let dataDir = "";
const savedDataDir = process.env.CBROWSER_DATA_DIR;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "cb-journey-scripts-"));
  process.env.CBROWSER_DATA_DIR = dataDir;
  server = Bun.serve({
    port: 0,
    fetch: () => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Shop</title></head>
<body><main><h1>Shop</h1><a href="/pricing">Pricing</a></main></body></html>`, { headers: { "content-type": "text/html" } }),
  });
  const { CBrowser } = await import("../src/browser.js");
  let n = 0;
  const ctx = {
    getBrowser: async () => { throw new Error("hosted path only"); },
    getBrowserByToken: async (token?: string) => {
      if (token) {
        const b = sessions.get(token);
        if (!b) throw new Error(`no session ${token}`);
        return { browser: b, token };
      }
      const t = `cb_test_${++n}`;
      const b = new CBrowser({ headless: true, persistent: false, skipSessionRestore: true });
      sessions.set(t, b);
      return { browser: b, token: t };
    },
  };
  const fake = {
    registerTool: (name: string, _c: unknown, h: Handler) => { handlers.set(name, h); },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  };
  const { registerBrowserStateTools } = await import("../src/mcp-tools/base/browser-state-tools.js");
  const { registerCognitiveTools } = await import("../src/mcp-tools/base/cognitive-tools.js");
  registerBrowserStateTools(fake as never, ctx as never);
  registerCognitiveTools(fake as never, ctx as never);
}, 60_000);

afterAll(async () => {
  for (const b of sessions.values()) await b.close().catch(() => {});
  server?.stop(true);
  if (savedDataDir === undefined) delete process.env.CBROWSER_DATA_DIR; else process.env.CBROWSER_DATA_DIR = savedDataDir;
  rmSync(dataDir, { recursive: true, force: true });
}, 60_000);

describe("a cognitive journey's session takes no page script", () => {
  let token = "";

  test("cognitive_journey_init opens a session whose instructions say scripts are refused", async () => {
    const r = await handlers.get("cognitive_journey_init")!({
      persona: "first-timer", goal: "find the pricing", startUrl: `http://127.0.0.1:${server.port}/`,
    });
    const out = parse(r);
    token = out._browserToken;
    expect(token).toMatch(/^cb_test_/);
    expect(out.instructions).toContain("evaluate_script is refused on this session");
  }, 120_000);

  test("evaluate_script on it is refused, even with force", async () => {
    const r = await handlers.get("evaluate_script")!({ script: "document.title", force: true, _browserToken: token });
    expect(r.isError).toBe(true);
    expect(parse(r)).toMatchObject({ result: null, refused: "journey_session" });
  }, 60_000);

  test("another session still runs scripts", async () => {
    const r = await handlers.get("evaluate_script")!({ script: "1 + 1", force: true });
    expect(parse(r).result).toBe(2);
  }, 60_000);

  test("once update_state reports the journey over, the journey's session runs scripts again", async () => {
    const u = await handlers.get("cognitive_journey_update_state")!({
      currentState: {
        patienceRemaining: 0.05, confusionLevel: 0.2, frustrationLevel: 0.3, goalProgress: 0.2,
        confidenceLevel: 0.4, currentMood: "frustrated", stepCount: 6, timeElapsed: 40,
      },
      actionResult: { success: false },
      personaTraits: { patience: 0.3, riskTolerance: 0.5, comprehension: 0.3, persistence: 0.4 },
      _browserToken: token,
    });
    expect(parse(u)).toMatchObject({ journeyOver: true, sessionReleased: true });
    const r = await handlers.get("evaluate_script")!({ script: "document.title", force: true, _browserToken: token });
    expect(r.isError).toBeFalsy();
    expect(parse(r).result).toBe("Shop");
  }, 60_000);
});
