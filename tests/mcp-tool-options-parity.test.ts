/**
 * MCP tools take the options their CLI commands take.
 *
 * Audit 2026-10-21 (MCP parity lane):
 * - M20: the MCP assert tool always compared case-insensitively (the default
 *   of CBrowser.assert) while nl_test passes caseSensitive: !fuzzyMatch, and
 *   there was no way to ask for an exact match from MCP.
 * - M22: responsive_test lacked the CLI's --wait, --wait-for and
 *   --sensitivity; chaos_test lacked --fail-api.
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

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-mcp-options-"));

const { CBrowser } = await import("../src/browser.js");
const { registerAssertionTools } = await import("../src/mcp-tools/base/assertion-tools.js");
const { registerVisualTestingTools } = await import("../src/mcp-tools/base/visual-testing-tools.js");
const { registerBugAnalysisTools } = await import("../src/mcp-tools/base/bug-analysis-tools.js");

type Result = { isError?: boolean; content: Array<{ type: string; text: string }> };
type Handler = (args: Record<string, unknown>) => Promise<Result>;

const handlers: Record<string, Handler> = {};
const schemas: Record<string, Record<string, unknown>> = {};
let b: InstanceType<typeof CBrowser>;
let http: Server;
let base: string;

const PAGE = `<!doctype html><html lang="en"><head><title>Options</title></head>
<body><h1>Welcome</h1><p id="api">pending</p>
<script>fetch("/api/data").then(r => { document.getElementById("api").textContent = String(r.status); });</script>
</body></html>`;

beforeAll(async () => {
  http = createServer((req, res) => {
    if ((req.url ?? "").startsWith("/api/")) { res.writeHead(200, { "Content-Type": "application/json" }); res.end("{}"); return; }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(PAGE);
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}/`;
  b = new CBrowser({ headless: true });
  const fake = {
    registerTool: (name: string, cfg: { inputSchema: Record<string, unknown> }, h: Handler) => { handlers[name] = h; schemas[name] = cfg.inputSchema; },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  } as never;
  const ctx = { getBrowser: async () => b } as never;
  registerAssertionTools(fake, ctx);
  registerVisualTestingTools(fake, ctx);
  registerBugAnalysisTools(fake, ctx);
});

afterAll(async () => {
  await b.close();
  await new Promise<void>((r) => http.close(() => r()));
});

const body = (r: Result) => JSON.parse(r.content.find((c) => c.type === "text")!.text);

describe("assert caseSensitive (M20)", () => {
  test("default stays case-insensitive; caseSensitive: true compares exactly", async () => {
    expect(Object.keys(schemas.assert)).toContain("caseSensitive");
    await (await b.getPage()).goto(base);
    expect(body(await handlers.assert({ assertion: "page contains 'welcome'" })).passed).toBe(true);
    expect(body(await handlers.assert({ assertion: "page contains 'welcome'", caseSensitive: true })).passed).toBe(false);
    expect(body(await handlers.assert({ assertion: "page contains 'Welcome'", caseSensitive: true })).passed).toBe(true);
  });
});

describe("responsive_test takes wait, waitFor, sensitivity (M22)", () => {
  test("in the schema", () => {
    expect(Object.keys(schemas.responsive_test)).toEqual(expect.arrayContaining(["wait", "waitFor", "sensitivity"]));
  });
  test("wait is honoured", async () => {
    const t0 = Date.now();
    const r = await handlers.responsive_test({ url: base, viewports: ["mobile-sm"], wait: 2500 });
    expect(r.isError).not.toBe(true);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(2500);
  }, 60_000);
});

describe("chaos_test takes failApis (M22)", () => {
  test("a matching request is answered with the given status", async () => {
    expect(Object.keys(schemas.chaos_test)).toContain("failApis");
    const r = await handlers.chaos_test({ url: base, failApis: [{ pattern: "/api/", status: 503 }] });
    const out = body(r);
    expect(out.impact.failedResources.join(" ")).toContain("/api/data");
    expect(out.impact.failedResources.join(" ")).toContain("503");
  }, 60_000);
});
