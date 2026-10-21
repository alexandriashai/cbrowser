/**
 * One shape for every MCP red-zone refusal, and success: true on success.
 *
 * Audit 2026-10-21 (MCP parity lane, M15): refusals came back five ways.
 * evaluate_script set isError and howToRun; click and smart_click had no
 * isError (so a hosted refused call was billed and never refunded, since the
 * refund keys on isError); type_text and drag said "--force" with no howToRun;
 * press_key said "force:" and wrote no audit entry (M14: it called
 * classifyKeyActivation directly instead of keystrokeRedZone, which logs the
 * block). smart_click's refusal said to re-run with force: true, and the tool
 * had no force parameter (M5). type_text used `delay || 50`, so delay 0 typed
 * at 50 ms a key (M13).
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-red-shape-data-"));

const { CBrowser } = await import("../src/browser.js");
const { registerInteractionTools } = await import("../src/mcp-tools/base/interaction-tools.js");
const { registerAdvancedInteractionTools } = await import("../src/mcp-tools/base/advanced-interaction-tools.js");
const { registerBrowserStateTools } = await import("../src/mcp-tools/base/browser-state-tools.js");

type Result = { isError?: boolean; content: Array<{ type: string; text: string }> };
type Handler = (args: Record<string, unknown>) => Promise<Result>;

const handlers: Record<string, Handler> = {};
const schemas: Record<string, Record<string, unknown>> = {};
let b: InstanceType<typeof CBrowser>;
let page: Awaited<ReturnType<InstanceType<typeof CBrowser>["getPage"]>>;

const PAGE = `<!doctype html><html lang="en"><body>
<button id="delete-account" onclick="window.__c=(window.__c||0)+1">Delete account</button>
<input id="q" aria-label="Search">
<div id="a" style="width:40px;height:40px">A</div><div id="b" style="width:40px;height:40px">B</div>
<input id="f" type="file" aria-label="File">
</body></html>`;

const fired = () => page.evaluate(() => {
  const w = window as unknown as { __c?: number };
  const v = w.__c ?? 0;
  w.__c = 0;
  return v;
});
const body = (r: Result) => JSON.parse(r.content.find((c) => c.type === "text")!.text);

beforeAll(async () => {
  b = new CBrowser({ headless: true });
  page = await b.getPage();
  const fake = {
    registerTool: (name: string, cfg: { inputSchema: Record<string, unknown> }, h: Handler) => { handlers[name] = h; schemas[name] = cfg.inputSchema; },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  } as never;
  const ctx = { getBrowser: async () => b } as never;
  registerInteractionTools(fake, ctx);
  registerAdvancedInteractionTools(fake, ctx);
  registerBrowserStateTools(fake, ctx);
});

afterAll(async () => { await b.close(); });

function expectRedRefusal(r: Result, tool: string) {
  expect(r.isError).toBe(true);
  const out = body(r);
  expect(out.success).toBe(false);
  expect(out.zone).toBe("red");
  expect(out.tool).toBe(tool);
  expect(out.howToRun).toContain("force: true");
  expect(out.message).toContain("force: true");
  return out;
}

describe("red refusals share one shape", () => {
  const cases: Array<[string, () => Promise<Result>]> = [
    ["click", () => handlers.click({ selector: "Delete account" })],
    ["smart_click", () => handlers.smart_click({ selector: "Delete account", maxRetries: 1, retryDelay: 0 })],
    ["press_key", async () => { await page.focus("#delete-account"); return handlers.press_key({ key: "Enter" }); }],
    ["type_text", async () => { await page.focus("#delete-account"); return handlers.type_text({ text: "a b" }); }],
    ["drag", () => handlers.drag({ source: "#delete-account", target: "#delete-account" })],
    ["evaluate_script", () => handlers.evaluate_script({ script: "document.querySelector('#delete-account').click()" })],
  ];
  for (const [tool, run] of cases) {
    test(`${tool}: isError, zone red, howToRun names force: true, nothing fired`, async () => {
      await page.setContent(PAGE);
      await fired();
      expectRedRefusal(await run(), tool);
      expect(await fired()).toBe(0);
    });
  }
});

describe("smart_click takes force (M5)", () => {
  test("force and retryDelay are in the schema", () => {
    expect(Object.keys(schemas.smart_click)).toEqual(expect.arrayContaining(["force", "retryDelay"]));
  });
  test("force: true clicks the red control", async () => {
    await page.setContent(PAGE);
    await fired();
    const r = await handlers.smart_click({ selector: "Delete account", force: true, maxRetries: 1, retryDelay: 0 });
    expect(r.isError).not.toBe(true);
    expect(body(r).success).toBe(true);
    expect(await fired()).toBe(1);
  });
});

describe("press_key refusal is audited like every keyboard refusal (M14)", () => {
  test("a refused Enter writes a blocked keyboard entry", async () => {
    await page.setContent(PAGE);
    await page.focus("#delete-account");
    const auditDir = (b as unknown as { paths: { auditDir: string } }).paths.auditDir;
    const count = () => readdirSync(auditDir).filter((f) => f.startsWith("audit-"))
      .flatMap((f) => JSON.parse(readFileSync(join(auditDir, f), "utf8")) as Array<{ action: string; target: string; result: string }>)
      .filter((e) => e.action === "keyboard" && e.target === "Enter" && e.result === "blocked").length;
    let before = 0;
    try { before = count(); } catch { /* no audit file yet */ }
    await handlers.press_key({ key: "Enter" });
    expect(count()).toBe(before + 1);
  });
});

describe("success: true on success", () => {
  test("press_key, type_text, drag, upload_file", async () => {
    await page.setContent(PAGE);
    await page.focus("#q");
    expect(body(await handlers.press_key({ key: "Tab" })).success).toBe(true);
    await page.focus("#q");
    expect(body(await handlers.type_text({ text: "hi" })).success).toBe(true);
    expect(body(await handlers.drag({ source: "#a", target: "#b" })).success).toBe(true);
    const file = join(mkdtempSync(join(tmpdir(), "cb-upload-")), "x.txt");
    writeFileSync(file, "x");
    expect(body(await handlers.upload_file({ selector: "#f", filePaths: [file] })).success).toBe(true);
  });
});

describe("type_text delay 0 means no delay (M13)", () => {
  test("40 characters at delay 0 take well under 40 x 50 ms", async () => {
    await page.setContent(PAGE);
    await page.focus("#q");
    const t0 = Date.now();
    const r = await handlers.type_text({ text: "x".repeat(40), delay: 0 });
    const took = Date.now() - t0;
    expect(r.isError).not.toBe(true);
    expect(took).toBeLessThan(1000);
    expect(await page.inputValue("#q")).toBe("x".repeat(40));
  });
});
