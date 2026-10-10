/**
 * A client's mcp-session-id cannot reach another account's browser (19.3.8, 2026-10-10).
 *
 * On the /mcp path the browser session id is the client's mcp-session-id header,
 * and getSessionBrowser reused any session by id. 19.3.7 (v8 O3) gave each
 * account its own tokenless browser under the id "account:<id>", and account ids
 * are small integers, so any caller could send "account:2" and drive account 2's
 * browser (cookies, logged-in pages), or claim the id first and lock the owner out.
 * Now sessions record the account that created them and refuse any other caller,
 * and a header in the "account:" namespace is ignored. No browser is launched:
 * getSessionBrowser only constructs CBrowser objects.
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = mkdtempSync(join(tmpdir(), "cb-session-bind-"));
process.env.CBROWSER_DATA_DIR = join(ROOT, "legacy");
process.env.CBROWSER_MIRROR_ROOT = join(ROOT, "mirror");

const { withPersonaScope } = await import("../src/persona-scope.js");
const {
  getSessionBrowser, getTokenlessBrowser, SessionOwnedElsewhereError,
  sessionIdFromHeader, ACCOUNT_SESSION_PREFIX,
} = await import("../src/mcp-server-remote.js");

describe("mcp-session-id header", () => {
  test("an id in the account namespace is ignored", () => {
    expect(ACCOUNT_SESSION_PREFIX).toBe("account:");
    expect(sessionIdFromHeader("account:2")).toBeUndefined();
    expect(sessionIdFromHeader(["account:2", "x"])).toBeUndefined();
  });

  test("an ordinary id passes through; empty and missing are absent", () => {
    expect(sessionIdFromHeader("6f1c2a9e-0d3b-4c55-9a1e-2b7d8c9e0f11")).toBe("6f1c2a9e-0d3b-4c55-9a1e-2b7d8c9e0f11");
    expect(sessionIdFromHeader(["abc", "def"])).toBe("abc");
    expect(sessionIdFromHeader("")).toBeUndefined();
    expect(sessionIdFromHeader(undefined)).toBeUndefined();
  });
});

describe("a session is reused only by the account that created it", () => {
  test("account B cannot reuse account A's session id", async () => {
    const a = await withPersonaScope(101, () => getSessionBrowser("sess-a"));
    await expect(withPersonaScope(102, () => getSessionBrowser("sess-a"))).rejects.toBeInstanceOf(SessionOwnedElsewhereError);
    expect(await withPersonaScope(101, () => getSessionBrowser("sess-a"))).toBe(a);
  });

  test("an unscoped caller cannot reuse a scoped session, nor a scoped one an unscoped session", async () => {
    await withPersonaScope(103, () => getSessionBrowser("sess-b"));
    await expect(getSessionBrowser("sess-b")).rejects.toBeInstanceOf(SessionOwnedElsewhereError);
    const u = await getSessionBrowser("sess-u");
    expect(await getSessionBrowser("sess-u")).toBe(u);
    await expect(withPersonaScope(104, () => getSessionBrowser("sess-u"))).rejects.toBeInstanceOf(SessionOwnedElsewhereError);
  });

  test("another account cannot take an account's own tokenless browser by its id", async () => {
    const own = await withPersonaScope(105, () => getTokenlessBrowser());
    await expect(withPersonaScope(106, () => getSessionBrowser(`${ACCOUNT_SESSION_PREFIX}105`))).rejects.toBeInstanceOf(SessionOwnedElsewhereError);
    expect(await withPersonaScope(105, () => getTokenlessBrowser())).toBe(own);
  });
});
