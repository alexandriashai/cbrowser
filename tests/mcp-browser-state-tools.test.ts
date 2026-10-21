/**
 * MCP browser-state tools: evaluate_script, get_network_requests and
 * manage_cookies, driven through their registered handlers on a real browser.
 *
 * Audit 2026-10-21 (MCP parity lane):
 * - M2: evaluate_script called page.evaluate(script) on the raw string, so
 *   `function t(){ return document.title }; t()` was a SyntaxError, a body with
 *   a top-level `return` threw, and `(sel) => ...` came back uncalled. The CLI
 *   and daemon already share evaluateScript (src/eval-script.ts); the MCP tool
 *   now does too, with an `args` array.
 * - M17: get_network_requests returned filtered.slice(0, 50): the OLDEST 50, so
 *   on a busy page the request you just triggered was never in the answer.
 * - M19: manage_cookies set wrote a 24-hour cookie where the CLI writes a
 *   session cookie, and delete ignored `domain` and removed the name on every
 *   domain.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-mcp-state-data-"));

const { CBrowser } = await import("../src/browser.js");
const { registerBrowserStateTools } = await import("../src/mcp-tools/base/browser-state-tools.js");

type Result = { isError?: boolean; content: Array<{ type: string; text: string }> };
type Handler = (args: Record<string, unknown>) => Promise<Result>;
type Config = { description: string; inputSchema: Record<string, unknown> };

const handlers: Record<string, Handler> = {};
const configs: Record<string, Config> = {};
let b: InstanceType<typeof CBrowser>;
let http: Server;
let base: string;

const PAGE = `<!doctype html><html lang="en"><head><title>State tools</title></head>
<body><p id="x">hello</p></body></html>`;

beforeAll(async () => {
  http = createServer((req, res) => {
    if ((req.url ?? "/").startsWith("/r/")) { res.writeHead(200, { "Content-Type": "text/plain" }); res.end("ok"); return; }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(PAGE);
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;

  b = new CBrowser({ headless: true });
  registerBrowserStateTools({
    registerTool: (name: string, cfg: Config, h: Handler) => { handlers[name] = h; configs[name] = cfg; },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  } as never, { getBrowser: async () => b } as never);
});

afterAll(async () => {
  await b.close();
  await new Promise<void>((r) => http.close(() => r()));
});

const body = (r: Result) => JSON.parse(r.content[0].text);

describe("evaluate_script uses the shared compiler (M2)", () => {
  test("a function declaration followed by a call returns the call's value", async () => {
    await (await b.getPage()).goto(`${base}/`);
    const r = await handlers.evaluate_script({ script: "function t(){ return document.title }; t()", force: true });
    expect(r.isError).not.toBe(true);
    expect(body(r).result).toBe("State tools");
  });

  test("statements with a top-level return run as a function body", async () => {
    const r = await handlers.evaluate_script({ script: "const p = document.querySelector('#x');\nreturn p.textContent", force: true });
    expect(r.isError).not.toBe(true);
    expect(body(r).result).toBe("hello");
  });

  test("an arrow function literal is called with args", async () => {
    const r = await handlers.evaluate_script({ script: "(sel) => document.querySelector(sel).id", args: ["#x"], force: true });
    expect(r.isError).not.toBe(true);
    expect(body(r).result).toBe("x");
  });

  test("args is in the schema and the description names the shapes", () => {
    expect(Object.keys(configs.evaluate_script.inputSchema)).toContain("args");
    expect(configs.evaluate_script.description).toContain("args");
    expect(configs.evaluate_script.description).not.toMatch(/wrap in an IIFE/);
  });
});

describe("get_network_requests returns the newest requests (M17)", () => {
  test("with more than 50, the last request made is in the answer and the first is not", async () => {
    const page = await b.getPage();
    await page.goto(`${base}/`);
    b.clearNetworkHistory();
    await page.evaluate(async () => {
      for (let i = 0; i < 60; i++) await fetch(`/r/${i}`);
    });
    const r = await handlers.get_network_requests({ filter: "fetch", clear: false });
    const out = body(r) as { requests: Array<{ url: string }>; total: number; showing: number };
    expect(out.total).toBe(60);
    expect(out.showing).toBe(50);
    const urls = out.requests.map((q) => q.url);
    expect(urls.some((u) => u.endsWith("/r/59"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/r/0"))).toBe(false);
    expect(configs.get_network_requests.description).toMatch(/newest|most recent/i);
  });
});

describe("manage_cookies (M19)", () => {
  test("set writes a session cookie, as the CLI does", async () => {
    const page = await b.getPage();
    await page.goto(`${base}/`);
    await b.clearCookies();
    const r = await handlers.manage_cookies({ action: "set", name: "sess", value: "1", path: "/" });
    expect(r.isError).not.toBe(true);
    const c = (await b.getCookies()).find((k) => k.name === "sess");
    expect(c?.expires).toBe(-1);
  });

  test("set with expires keeps that expiry", async () => {
    const at = Math.floor(Date.now() / 1000) + 3600;
    await handlers.manage_cookies({ action: "set", name: "timed", value: "1", path: "/", expires: at });
    const c = (await b.getCookies()).find((k) => k.name === "timed");
    expect(Math.round(c?.expires ?? 0)).toBe(at);
  });

  test("delete with a domain removes the name on that domain only", async () => {
    await b.clearCookies();
    await b.setCookies([
      { name: "dup", value: "a", domain: "127.0.0.1", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" },
      { name: "dup", value: "b", domain: "other.test", path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" },
    ]);
    const r = await handlers.manage_cookies({ action: "delete", name: "dup", domain: "127.0.0.1" });
    expect(r.isError).not.toBe(true);
    const left = (await b.getCookies()).filter((k) => k.name === "dup").map((k) => k.domain);
    expect(left).toEqual(["other.test"]);
  });

  test("delete without a domain still removes the name everywhere", async () => {
    const r = await handlers.manage_cookies({ action: "delete", name: "dup" });
    expect(r.isError).not.toBe(true);
    expect((await b.getCookies()).filter((k) => k.name === "dup")).toEqual([]);
  });
});
