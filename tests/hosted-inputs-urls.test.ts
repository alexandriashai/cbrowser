/**
 * Hosted transport: URLs the server opens must be http: or https:.
 *
 * Every URL parameter is declared z.string().url(), and zod accepts file:,
 * data:, javascript:, chrome: and view-source: alike (measured 2026-10-10), so
 * on the root-run hosted servers navigate("file:///...") opened the host's own
 * files in the browser. The 2026-10-10 security review (sec-paths) named
 * navigate; the class sweep below covers every URL parameter of every base
 * tool, plus the CBrowser.navigate backstop for URLs that arrive inside free
 * text (nl_test_inline steps).
 *
 * No real browser starts here. The sweep replaces CBrowser's launch/page
 * methods and Playwright's launchers with throwing stubs for its duration, so
 * a tool that is missing its guard fails fast instead of opening anything.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "cb-hosted-urls-"));
const prevData = process.env.CBROWSER_DATA_DIR;
process.env.CBROWSER_DATA_DIR = ROOT;

const { setHostedMode, refuseHostedUrl, assertHostedNavigable, isWebUrl } = await import("../src/mcp-tools/hosted-inputs.js");
const { registerNavigationTools } = await import("../src/mcp-tools/base/navigation-tools.js");
const { registerBaseTools } = await import("../src/mcp-tools/base/index.js");
const { CBrowser } = await import("../src/browser.js");
const playwright = await import("playwright");

type Result = { isError?: boolean; content: Array<{ type: string; text?: string }> };
type Handler = (args: Record<string, unknown>) => Promise<Result>;
type Schema = Record<string, unknown>;

function stubServer(): { server: never; tools: Map<string, { handler: Handler; schema: Schema }> } {
  const tools = new Map<string, { handler: Handler; schema: Schema }>();
  const server = {
    registerTool: (name: string, cfg: { inputSchema?: Schema }, h: Handler) => {
      tools.set(name, { handler: h, schema: cfg?.inputSchema ?? {} });
    },
    tool: (name: string, ...rest: unknown[]) => {
      const h = rest[rest.length - 1] as Handler;
      const schema = (rest.length >= 2 && typeof rest[rest.length - 2] === "object" ? rest[rest.length - 2] : {}) as Schema;
      tools.set(name, { handler: h, schema });
    },
    registerResource: () => {}, resource: () => {}, registerPrompt: () => {}, prompt: () => {},
  };
  return { server: server as never, tools };
}

const NO_BROWSER = "browser-must-not-be-reached";
const body = (r: Result) => JSON.parse(r.content[0].text ?? "{}");
const MARKER = join(ROOT, "marker.txt");
writeFileSync(MARKER, "host-file-marker");
const FILE_URL = `file://${MARKER}`;

afterEach(() => setHostedMode(false));
afterAll(() => {
  setHostedMode(false);
  if (prevData === undefined) delete process.env.CBROWSER_DATA_DIR; else process.env.CBROWSER_DATA_DIR = prevData;
  rmSync(ROOT, { recursive: true, force: true });
});

describe("refuseHostedUrl / isWebUrl", () => {
  test("only absolute http(s) URLs are web URLs", () => {
    for (const ok of ["https://example.com", "http://example.com/a?b#c", "HTTPS://EXAMPLE.COM"]) expect(isWebUrl(ok)).toBe(true);
    for (const bad of [FILE_URL, "FILE:///etc/hosts", "  file:///etc/hosts", "data:text/html,x", "javascript:alert(1)",
      "view-source:https://example.com", "chrome://version", "about:blank", "/etc/hosts", "example.com", "blob:https://a/b"]) {
      expect(isWebUrl(bad)).toBe(false);
    }
  });

  test("not hosted: nothing is refused", () => {
    expect(refuseHostedUrl("navigate", { url: FILE_URL })).toBeNull();
  });

  test("hosted: one bad element of an array refuses the call; omitted values pass", () => {
    setHostedMode(true);
    expect(refuseHostedUrl("x", { urls: ["https://a.example", FILE_URL] })?.isError).toBe(true);
    expect(refuseHostedUrl("x", { url: undefined, urls: [] })).toBeNull();
    expect(refuseHostedUrl("x", { url: "https://a.example" })).toBeNull();
  });
});

describe("navigate", () => {
  const { server, tools } = stubServer();
  let navigated: string[] = [];
  const fakeBrowser = {
    navigate: async (url: string) => { navigated.push(url); return { success: true, url, title: "t", loadTime: 1, errors: [], warnings: [] }; },
  };
  registerNavigationTools(server, { getBrowser: async () => fakeBrowser } as never);
  const handler = tools.get("navigate")!.handler;

  test("hosted: file: URL refused, the browser is never asked", async () => {
    setHostedMode(true);
    navigated = [];
    const r = await handler({ url: FILE_URL });
    expect(r.isError).toBe(true);
    const b = body(r);
    expect(b.error).toBe("url_scheme_not_allowed");
    expect(b.scheme).toBe("file:");
    expect(r.content[0].text).not.toContain("host-file-marker");
    expect(navigated).toEqual([]);
  });

  test("hosted: other non-web schemes refused too", async () => {
    setHostedMode(true);
    navigated = [];
    for (const url of ["data:text/html,<h1>x</h1>", "view-source:https://example.com", "chrome://version", "javascript:alert(1)"]) {
      const r = await handler({ url });
      expect(r.isError).toBe(true);
    }
    expect(navigated).toEqual([]);
  });

  test("hosted: https is allowed", async () => {
    setHostedMode(true);
    navigated = [];
    await handler({ url: "https://example.com/" });
    expect(navigated).toEqual(["https://example.com/"]);
  });

  test("not hosted: a file: URL is passed to the browser as before", async () => {
    navigated = [];
    await handler({ url: FILE_URL });
    expect(navigated).toEqual([FILE_URL]);
  });
});

describe("CBrowser.navigate backstop (URLs from free text, e.g. nl_test_inline steps)", () => {
  const PAGE = "page-must-not-be-created";
  const fakeThis = { getPage: async () => { throw new Error(PAGE); } };
  const nav = (url: string) => CBrowser.prototype.navigate.call(fakeThis as never, url);

  test("hosted: file: refused before a page exists", async () => {
    setHostedMode(true);
    await expect(nav(FILE_URL)).rejects.toThrow(/Navigation refused on the hosted server/);
  });

  test("hosted: about:blank (internal reset) and https get through to the page", async () => {
    setHostedMode(true);
    await expect(nav("about:blank")).rejects.toThrow(PAGE);
    await expect(nav("https://example.com")).rejects.toThrow(PAGE);
  });

  test("not hosted: file: gets through to the page as before", async () => {
    await expect(nav(FILE_URL)).rejects.toThrow(PAGE);
  });

  test("assertHostedNavigable is a no-op when not hosted", () => {
    expect(() => assertHostedNavigable(FILE_URL)).not.toThrow();
  });
});

/**
 * Every URL parameter of every base tool, refused when hosted.
 *
 * The exemptions do not open their URL on the server: compare_personas_init
 * and _complete only write it into instructions for the client, and
 * marketing_campaign_create stores it for marketing_campaign_run, which hands
 * it to cognitive_journey_init (guarded). chaos_test blockUrls are request
 * patterns, never opened.
 */
describe("class sweep: URL parameters of all base tools", () => {
  const URL_KEYS = new Set(["url", "urlA", "urlB", "urls", "startUrl", "start_url", "baseUrl", "sites", "restoreUrl", "mcp_url", "competitor_urls"]);
  const EXEMPT = new Set(["compare_personas_init.url", "compare_personas_complete.url", "marketing_campaign_create.url"]);
  const ARRAY_KEYS = new Set(["urls", "sites", "competitor_urls"]);

  const saved: Array<[object, string, unknown]> = [];
  const stub = (obj: object, name: string) => {
    saved.push([obj, name, (obj as Record<string, unknown>)[name]]);
    (obj as Record<string, unknown>)[name] = async () => { throw new Error(NO_BROWSER); };
  };

  beforeAll(() => {
    for (const m of ["launch", "getPage", "navigate"]) stub(CBrowser.prototype, m);
    for (const bt of [playwright.chromium, playwright.firefox, playwright.webkit]) {
      for (const m of ["launch", "launchPersistentContext", "connect", "connectOverCDP"]) stub(bt, m);
    }
  });
  afterAll(() => {
    for (const [obj, name, value] of saved.reverse()) (obj as Record<string, unknown>)[name] = value;
  });

  test("every one is refused with url_scheme_not_allowed before anything runs", async () => {
    const { server, tools } = stubServer();
    const reach = async () => { throw new Error(NO_BROWSER); };
    registerBaseTools(server, { getBrowser: reach, getBrowserByToken: reach } as never);

    const checked: string[] = [];
    const failures: string[] = [];
    setHostedMode(true);
    for (const [name, { handler, schema }] of tools) {
      for (const key of Object.keys(schema)) {
        if (!URL_KEYS.has(key) || EXEMPT.has(`${name}.${key}`)) continue;
        checked.push(`${name}.${key}`);
        const value = ARRAY_KEYS.has(key) ? ["https://example.com", FILE_URL] : FILE_URL;
        let r: Result | undefined;
        try {
          r = await Promise.race([
            handler({ [key]: value }),
            new Promise<Result>((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000)),
          ]);
        } catch (e) {
          failures.push(`${name}.${key}: threw ${(e as Error).message}`);
          continue;
        }
        const text = r?.content?.[0]?.text ?? "";
        let code: string | undefined;
        try { code = JSON.parse(text).error; } catch { /* not JSON */ }
        if (!r?.isError || code !== "url_scheme_not_allowed") failures.push(`${name}.${key}: ${text.slice(0, 120)}`);
      }
    }
    setHostedMode(false);

    expect(failures).toEqual([]);
    // The sweep must actually find the URL parameters it claims to cover.
    expect(checked.length).toBeGreaterThanOrEqual(30);
    for (const known of ["navigate.url", "ab_comparison.urlA", "ab_comparison.urlB", "ai_benchmark.urls",
      "competitive_benchmark.sites", "cognitive_journey_init.startUrl", "coverage_map.baseUrl",
      "browser_recover.restoreUrl", "manage_tabs.url", "capture_start.url", "security_audit.mcp_url"]) {
      expect(checked).toContain(known);
    }
  }, 60_000);
});
