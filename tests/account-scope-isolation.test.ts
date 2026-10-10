/**
 * One hosted account cannot see, load, delete or drive another account's
 * saved sessions, baselines or browser. (v8 O3, 2026-10-10)
 *
 * Both hosted servers run as root with one HOME, so every account shared
 * /root/.cbrowser. Measured live before this fix: list_sessions on one key
 * returned another caller's saved sessions with their cookie counts, and one
 * of them held 110 cookies the shared browser had collected (ucdenver,
 * linkedin, dev.blackbook.reviews). load_session would have put them into the
 * caller's browser; every session tool is free tier. Tokenless calls shared a
 * single persistent browser, so its profile was readable by anyone, and a
 * browser token (8 base36 chars from Math.random) worked for any account.
 *
 * Hosted requests already run inside an AsyncLocalStorage account scope (the
 * persona fix of 2026-08-01). These tests pin that sessions, baselines,
 * tokens and the tokenless browser all honour it, and that an unscoped
 * process (CLI, stdio, local install) behaves exactly as before.
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = mkdtempSync(join(tmpdir(), "cb-scope-"));
process.env.CBROWSER_DATA_DIR = join(ROOT, "legacy");
process.env.CBROWSER_MIRROR_ROOT = join(ROOT, "mirror");

const { withPersonaScope, accountDataDir } = await import("../src/persona-scope.js");
const { SessionManager } = await import("../src/browser/session-manager.js");
const { getPaths, getDataDir } = await import("../src/config.js");
const { getBrowserByToken, getTokenlessBrowser, BrowserSessionExpiredError } = await import("../src/mcp-server-remote.js");

const session = (name: string) => JSON.stringify({
  name, url: "https://example.com/", domain: "example.com", created: new Date().toISOString(),
  cookies: [{ name: "sid", value: "secret", domain: "example.com", path: "/" }], localStorage: {}, sessionStorage: {},
});

let sm: InstanceType<typeof SessionManager>;
beforeAll(() => {
  const legacy = join(ROOT, "legacy", "sessions");
  mkdirSync(legacy, { recursive: true });
  writeFileSync(join(legacy, "shared.json"), session("shared"));
  const a1 = join(accountDataDir(1), "sessions");
  mkdirSync(a1, { recursive: true });
  writeFileSync(join(a1, "mine.json"), session("mine"));
  sm = new SessionManager({ sessionsDir: legacy, viewportWidth: 1280, viewportHeight: 800, verbose: false });
});

describe("saved sessions are per account", () => {
  test("an account lists only its own sessions", () => {
    expect(withPersonaScope(1, () => sm.list())).toEqual(["mine"]);
    expect(withPersonaScope(2, () => sm.list())).toEqual([]);
  });

  test("the owner can read them and another account cannot read or delete them", () => {
    // The owner's read is what makes the refusal below mean something.
    expect(withPersonaScope(1, () => sm.getDetails("mine"))?.name).toBe("mine");
    expect(withPersonaScope(2, () => sm.getDetails("mine"))).toBeNull();
    expect(withPersonaScope(2, () => sm.delete("mine"))).toBe(false);
    expect(existsSync(join(accountDataDir(1), "sessions", "mine.json"))).toBe(true);
  });

  test("the old shared directory is reachable by no account", () => {
    for (const id of [1, 2]) {
      expect(withPersonaScope(id, () => sm.listDetailed().map((s) => s.name))).not.toContain("shared");
      expect(withPersonaScope(id, () => sm.getDetails("shared"))).toBeNull();
    }
  });

  test("unscoped (CLI, local install) is unchanged", () => {
    expect(sm.list()).toEqual(["shared"]);
  });
});

describe("baselines and other data paths are per account", () => {
  test("getPaths() inside a scope points at the account's directory", () => {
    expect(withPersonaScope(2, () => getPaths().baselinesDir)).toBe(join(accountDataDir(2), "baselines"));
    expect(withPersonaScope(2, () => getPaths().dataDir)).toBe(accountDataDir(2));
  });

  test("unscoped getPaths() is unchanged", () => {
    expect(getPaths().dataDir).toBe(getDataDir());
  });
});

describe("browsers and tokens are per account", () => {
  test("a token is 64 random bits, not 8 base36 chars", async () => {
    const { token } = await withPersonaScope(1, () => getBrowserByToken());
    expect(token).toMatch(/^cb_[0-9a-f]{16}$/);
  });

  test("a token drives its own account's browser and no one else's", async () => {
    const minted = await withPersonaScope(1, () => getBrowserByToken());
    const again = await withPersonaScope(1, () => getBrowserByToken(minted.token));
    expect(again.browser).toBe(minted.browser);
    await expect(withPersonaScope(2, () => getBrowserByToken(minted.token))).rejects.toBeInstanceOf(BrowserSessionExpiredError);
    await expect(getBrowserByToken(minted.token)).rejects.toBeInstanceOf(BrowserSessionExpiredError);
  });

  test("tokenless calls get the account's own browser, never the shared one", async () => {
    const a1 = await withPersonaScope(1, () => getTokenlessBrowser());
    const a1again = await withPersonaScope(1, () => getTokenlessBrowser());
    const a2 = await withPersonaScope(2, () => getTokenlessBrowser());
    const shared = await getTokenlessBrowser();
    expect(a1again).toBe(a1);
    expect(a2).not.toBe(a1);
    expect(shared).not.toBe(a1);
    expect(shared).not.toBe(a2);
  });
});
