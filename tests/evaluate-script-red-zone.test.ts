/**
 * evaluate_script is red zone: refused without force, before anything runs.
 *
 * Live proof on 19.2.0 (:3100): click("Delete account") was refused as red,
 * then evaluate_script with `document.querySelector('#delete-account').click()`
 * fired the handler, and the response carried no zone. Since 19.1.8 every path
 * that activates an element is judged by the element; a script is not an
 * element and can activate any of them, so running one is red by itself
 * (decided by the principal). The CLI and daemon copies are pinned in
 * cli-evaluate-keyboard.test.ts and daemon-evaluate-red-zone.test.ts.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-eval-red-data-"));

const { CBrowser } = await import("../src/browser.js");
const { registerBrowserStateTools } = await import("../src/mcp-tools/base/browser-state-tools.js");
const { DEFAULT_ZONES } = await import("../src/security/tool-permissions.js");
const { getToolZone: auditZone } = await import("../src/security/audit-wrapper.js");

const PAGE = `<!doctype html><html lang="en"><body>
<button id="delete-account" onclick="window.__c='DELETE'">Delete account</button>
</body></html>`;

type Result = { isError?: boolean; content: Array<{ type: string; text: string }> };
type Handler = (args: Record<string, unknown>) => Promise<Result>;
type Config = { description: string; inputSchema: Record<string, { description?: string }> };

let b: InstanceType<typeof CBrowser>;
let page: Awaited<ReturnType<InstanceType<typeof CBrowser>["getPage"]>>;
let browserResolutions = 0;
let handler: Handler;
let config: Config;

const fired = () => page.evaluate(() => {
  const w = window as unknown as { __c?: string | null };
  const v = w.__c ?? null;
  w.__c = null;
  return v;
});
const CLICK = "document.querySelector('#delete-account').click()";

beforeAll(async () => {
  b = new CBrowser({ headless: true });
  page = await b.getPage();
  registerBrowserStateTools({
    registerTool: (name: string, cfg: Config, h: Handler) => {
      if (name === "evaluate_script") { handler = h; config = cfg; }
    },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  } as never, { getBrowser: async () => { browserResolutions++; return b; } } as never);
});

afterAll(async () => { await b.close(); });

describe("evaluate_script without force", () => {
  test("is refused before anything runs: no click, no browser, zone red, isError", async () => {
    await page.setContent(PAGE);
    await fired();
    browserResolutions = 0;

    const r = await handler({ script: CLICK });
    expect(r.isError).toBe(true);
    const body = JSON.parse(r.content[0].text);
    expect(body.success).toBe(false);
    expect(body.zone).toBe("red");
    expect(body.message).toMatch(/^Red zone action requires --force: evaluate_script/);
    expect(body.message).toContain("arbitrary page script can activate any control");

    expect(browserResolutions).toBe(0);
    expect(await fired()).toBeNull();
  });

  test("force: false is refused the same way", async () => {
    await page.setContent(PAGE);
    const r = await handler({ script: CLICK, force: false });
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content[0].text).zone).toBe("red");
    expect(await fired()).toBeNull();
  });
});

describe("evaluate_script with force", () => {
  test("runs the script and reports zone red", async () => {
    await page.setContent(PAGE);
    await fired();
    const r = await handler({ script: `${CLICK}; 'clicked'`, force: true });
    expect(r.isError).toBeUndefined();
    const body = JSON.parse(r.content[0].text);
    expect(body.result).toBe("clicked");
    expect(body.zone).toBe("red");
    expect(await fired()).toBe("DELETE");
  });

  test("a script error is still isError and still names the zone", async () => {
    await page.setContent(PAGE);
    const r = await handler({ script: "throw new Error('boom')", force: true });
    expect(r.isError).toBe(true);
    const body = JSON.parse(r.content[0].text);
    expect(body.error).toContain("boom");
    expect(body.zone).toBe("red");
  });
});

describe("evaluate_script declares the gate", () => {
  test("schema has force and the description says why it is red", () => {
    expect(config.inputSchema.force).toBeDefined();
    expect(config.description).toMatch(/Red zone/);
    expect(config.description).toMatch(/force/);
  });

  test("both zone tables record it as red", () => {
    expect(DEFAULT_ZONES.evaluate_script).toBe("red");
    expect(auditZone("evaluate_script")).toBe("red");
  });

  test("only force === true opens the gate", async () => {
    const { evaluateScriptRefusal } = await import("../src/security/script-gate.js");
    expect(evaluateScriptRefusal(true)).toBeNull();
    for (const v of [undefined, false, "true", 1, null]) {
      expect(evaluateScriptRefusal(v)).toMatch(/^Red zone action requires --force: evaluate_script/);
    }
  });
});
