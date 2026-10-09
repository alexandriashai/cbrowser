/**
 * A navigation that cannot load says so in plain words.
 *
 * Reported: navigate to a host that does not resolve returned Playwright's raw
 *
 *   page.goto: net::ERR_NAME_NOT_RESOLVED at https://x.invalid/
 *   Call log:
 *     - navigating to "https://x.invalid/", waiting until "load"
 *
 * navigate() mapped only the proxy errors and rethrew everything else as is;
 * nothing anywhere mapped ERR_NAME_NOT_RESOLVED. `.invalid` is reserved
 * (RFC 2606) and never resolves, so the browser cases here need no network.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { CBrowser } from "../src/browser.js";
import { runAgentReadyAudit } from "../src/analysis/agent-ready-audit.js";

type Describe = (message: string, url: string) => string | null;
// Dynamic so a missing module fails these tests, not the file's import.
const describeNavigationError: Describe = (m, u) => describeImpl(m, u);
let describeImpl: Describe = () => { throw new Error("src/navigation-errors.ts did not load"); };
beforeAll(async () => {
  try {
    describeImpl = (await import("../src/navigation-errors.js")).describeNavigationError;
  } catch { /* left throwing */ }
});

const raw = (code: string, url: string) =>
  `page.goto: net::${code} at ${url}\nCall log:\n  - navigating to "${url}", waiting until "load"\n`;

describe("describeNavigationError", () => {
  test("unresolvable host: names the host, says what to check, keeps the code, drops the Call log", () => {
    const m = describeNavigationError(raw("ERR_NAME_NOT_RESOLVED", "https://x.invalid/"), "https://x.invalid/");
    expect(m).toBe("Could not resolve host x.invalid. Check the URL spelling or network access. Nothing was loaded. (net::ERR_NAME_NOT_RESOLVED)");
  });

  test("the other common net:: failures each get their own sentence", () => {
    const cases: Array<[string, RegExp]> = [
      ["ERR_CONNECTION_REFUSED", /^Connection to example\.test:8080 was refused/],
      ["ERR_CONNECTION_TIMED_OUT", /^Connection to example\.test:8080 timed out/],
      ["ERR_TIMED_OUT", /^Connection to example\.test:8080 timed out/],
      ["ERR_ADDRESS_UNREACHABLE", /^Host example\.test:8080 is unreachable/],
      ["ERR_INTERNET_DISCONNECTED", /^No network connection/],
      ["ERR_CONNECTION_RESET", /closed the connection/],
      ["ERR_CERT_DATE_INVALID", /certificate for example\.test:8080 was rejected \(expired/],
      ["ERR_CERT_AUTHORITY_INVALID", /untrusted authority/],
      ["ERR_CERT_COMMON_NAME_INVALID", /different host name/],
      ["ERR_TOO_MANY_REDIRECTS", /redirect loop/],
    ];
    for (const [code, re] of cases) {
      const m = describeNavigationError(raw(code, "https://example.test:8080/a"), "https://example.test:8080/a");
      expect(m, code).toMatch(re);
      expect(m, code).toContain("Nothing was loaded.");
      expect(m, code).toEndWith(`(net::${code})`);
      expect(m, code).not.toContain("Call log");
    }
  });

  test("anything else is left to the caller (null)", () => {
    expect(describeNavigationError("page.goto: Timeout 30000ms exceeded.", "https://a.test/")).toBeNull();
    expect(describeNavigationError(raw("ERR_ABORTED", "https://a.test/"), "https://a.test/")).toBeNull();
  });

  test("describing an already-described message gives the same message", () => {
    const once = describeNavigationError(raw("ERR_NAME_NOT_RESOLVED", "https://x.invalid/"), "https://x.invalid/")!;
    expect(describeNavigationError(once, "https://x.invalid/")).toBe(once);
  });
});

describe("user-facing navigation surfaces the plain message", () => {
  let browser: CBrowser;
  let closedPort: number;

  beforeAll(async () => {
    browser = new CBrowser({ headless: true });
    await browser.launch();
    // A port that was just listening and is now closed: refused, not filtered.
    const s = Bun.serve({ port: 0, fetch: () => new Response("x") });
    closedPort = s.port;
    s.stop(true);
  });

  afterAll(async () => {
    try { await browser?.close(); } catch { /* closing is not the assertion */ }
  });

  test("navigate() to an unresolvable host", async () => {
    let message = "";
    try {
      await browser.navigate("https://x.invalid/");
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/^Could not resolve host x\.invalid\./);
    expect(message).toContain("(net::ERR_NAME_NOT_RESOLVED)");
    expect(message).not.toContain("Call log");
  }, 60_000);

  test("navigate() to a closed port", async () => {
    let message = "";
    try {
      await browser.navigate(`http://127.0.0.1:${closedPort}/`);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(new RegExp(`^Connection to 127\\.0\\.0\\.1:${closedPort} was refused`));
    expect(message).not.toContain("Call log");
  }, 60_000);

  test("agent_ready_audit's own navigation", async () => {
    let message = "";
    try {
      await runAgentReadyAudit("https://x.invalid/", { headless: true });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/Could not resolve host x\.invalid\./);
    expect(message).not.toContain("Call log");
  }, 90_000);
});
