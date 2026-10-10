/**
 * v8 report P3 fixes that need no browser. (2026-10-10)
 *
 * B35: load_session for a name that does not exist returned `success: false`
 *      and nothing else: no reason, no isError, so a refund never fired and
 *      the caller could not tell "missing" from "failed".
 * B42: list_cognitive_personas said it includes the emotional personas and
 *      listed none of them: 21 entries where cognitive_distance counts 25.
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = mkdtempSync(join(tmpdir(), "cb-v8-units-"));
process.env.CBROWSER_DATA_DIR = ROOT;
const { SessionManager } = await import("../src/browser/session-manager.js");
const { registerSessionTools } = await import("../src/mcp-tools/base/session-tools.js");
const { registerCognitiveTools } = await import("../src/mcp-tools/base/cognitive-tools.js");
const { listEmotionalPersonas } = await import("../src/personas.js");

type Result = { isError?: boolean; content: Array<{ type: string; text?: string }> };
type Handler = (args: Record<string, unknown>) => Promise<Result>;
function stubServer() {
  const handlers: Record<string, Handler> = {};
  return { handlers, server: { registerTool: (name: string, _def: unknown, h: Handler) => { handlers[name] = h; } } };
}

describe("B35 load_session says why nothing loaded", () => {
  test("the manager reports session_not_found with a pointer to list_sessions", async () => {
    const dir = join(ROOT, "sessions-b35");
    mkdirSync(dir, { recursive: true });
    const sm = new SessionManager({ sessionsDir: dir, viewportWidth: 1280, viewportHeight: 800, verbose: false });
    const r = await sm.load("zzz-no-such-session-3", {} as never, {} as never);
    expect(r.success).toBe(false);
    expect(r.error).toBe("session_not_found");
    expect(r.message).toContain("list_sessions");
  });

  test("the tool marks it isError", async () => {
    const { handlers, server } = stubServer();
    const fakeBrowser = { loadSession: async (name: string) => ({ success: false, name, cookiesRestored: 0, localStorageKeysRestored: 0, sessionStorageKeysRestored: 0, error: "session_not_found", message: "No saved session" }) };
    registerSessionTools(server as never, { getBrowser: async () => fakeBrowser as never });
    const r = await handlers.load_session({ name: "zzz-no-such-session-3" });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content[0].text!).error).toBe("session_not_found");
  });
});

describe("B42 the roster lists the emotional personas", () => {
  test("every emotional persona is listed, counted under its own category", async () => {
    const { handlers, server } = stubServer();
    registerCognitiveTools(server as never, { getBrowser: async () => ({}) as never });
    const body = JSON.parse((await handlers.list_cognitive_personas({})).content[0].text!);
    const emotional = listEmotionalPersonas();
    expect(emotional.length).toBeGreaterThan(0);
    const listed = body.personas.filter((p: { category: string }) => p.category === "emotional").map((p: { name: string }) => p.name);
    expect(listed.sort()).toEqual([...emotional].sort());
    expect(body.categories.emotional).toBe(emotional.length);
    // Same fields as a built-in: the values block is not dropped for them.
    const one = body.personas.find((p: { name: string }) => p.name === emotional[0]);
    expect(one.cognitiveTraits).toBeTruthy();
  });
});
