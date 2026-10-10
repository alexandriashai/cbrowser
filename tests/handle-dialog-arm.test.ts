/**
 * handle_dialog keeps one armed handler per page, the latest, and never throws (v8 B27).
 *
 * Found 2026-10-10 in the B27 listener sweep: every handle_dialog call added its
 * own page.once("dialog") to the shared page and left the earlier ones armed.
 * Three calls and one confirm() ran all three handlers: the FIRST call's action
 * was applied, and the other two threw "Cannot accept dialog which is already
 * handled!" from an async event listener, where nothing catches it. Both hosted
 * servers run under Node, so that unhandled rejection ended the process, and
 * every account's calls and browser sessions with it.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, beforeEach, afterAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-handle-dialog-"));

const { CBrowser } = await import("../src/browser.js");
const { registerAdvancedInteractionTools } = await import("../src/mcp-tools/base/advanced-interaction-tools.js");

type Result = { isError?: boolean; content: Array<{ type: string; text: string }> };
type Handler = (args: Record<string, unknown>) => Promise<Result>;
type Armed = {
  armed: boolean;
  handledImmediately: boolean;
  action: string;
  replacedArm?: string;
  previousDialogFailed?: { dialogType: string; message: string; action: string; error: string };
};

let b: InstanceType<typeof CBrowser>;
let handler: Handler;

// What a dialog listener throws surfaces as an unhandled rejection: fatal under
// Node, so captured here to assert that none happened.
const escaped: string[] = [];
const onEscaped = (e: unknown) => { escaped.push(e instanceof Error ? e.message : String(e)); };

beforeAll(async () => {
  process.on("unhandledRejection", onEscaped);
  process.on("uncaughtException", onEscaped);
  b = new CBrowser({ headless: true });
  registerAdvancedInteractionTools({
    registerTool: (name: string, _cfg: unknown, h: Handler) => {
      if (name === "handle_dialog") handler = h;
    },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  } as never, { getBrowser: async () => b } as never);
});

afterAll(async () => {
  await b?.close();
  process.off("unhandledRejection", onEscaped);
  process.off("uncaughtException", onEscaped);
});

beforeEach(async () => {
  escaped.length = 0;
  await (await b.getPage()).setContent("<!doctype html><html lang=\"en\"><title>d</title><p>x</p></html>");
});

const arm = async (args: Record<string, unknown>): Promise<Armed> => {
  const r = await handler(args);
  expect(r.isError).toBeUndefined();
  return JSON.parse(r.content[0].text) as Armed;
};
/** Long enough for a listener's rejected promise to be reported. */
const settle = () => new Promise((r) => setTimeout(r, 300));

describe("handle_dialog", () => {
  test("three arms, then confirm(): the latest call's dismiss is applied and nothing escapes", async () => {
    const page = await b.getPage();
    await arm({ action: "accept" });
    const second = await arm({ action: "accept" });
    const third = await arm({ action: "dismiss" });
    const answered = await page.evaluate(() => confirm("go?"));
    await settle();
    expect(answered).toBe(false);
    expect(escaped).toEqual([]);
    // Same output shape, plus which arm each call replaced.
    expect(second.replacedArm).toBe("accept");
    expect(third).toMatchObject({ armed: true, handledImmediately: false, action: "dismiss", replacedArm: "accept" });
  }, 60_000);

  test("three arms, then prompt(): the latest call's text is the one entered", async () => {
    const page = await b.getPage();
    await arm({ action: "accept", promptText: "first" });
    await arm({ action: "accept", promptText: "second" });
    await arm({ action: "accept", promptText: "third" });
    const typed = await page.evaluate(() => prompt("name?"));
    await settle();
    expect(typed).toBe("third");
    expect(escaped).toEqual([]);
  }, 60_000);

  test("three arms leave one dialog listener, and the page is back to its baseline once the dialog fires", async () => {
    const page = await b.getPage();
    const before = page.listenerCount("dialog");
    const first = await arm({ action: "accept" });
    expect(first.replacedArm).toBeUndefined();
    await arm({ action: "accept" });
    await arm({ action: "accept" });
    expect(page.listenerCount("dialog")).toBe(before + 1);
    await page.evaluate(() => alert("hi"));
    await settle();
    expect(page.listenerCount("dialog")).toBe(before);
    expect(escaped).toEqual([]);
  }, 60_000);

  test("a dialog something else already handled is reported by the next call, not thrown", async () => {
    const page = await b.getPage();
    // Registered first, so it dismisses the dialog before the armed handler runs.
    const other = (d: { dismiss(): Promise<void> }) => { d.dismiss().catch(() => {}); };
    page.on("dialog", other);
    try {
      await arm({ action: "accept" });
      const answered = await page.evaluate(() => confirm("pay?"));
      await settle();
      expect(answered).toBe(false);
      expect(escaped).toEqual([]);
    } finally {
      page.off("dialog", other);
    }
    const next = await arm({ action: "dismiss" });
    expect(next.previousDialogFailed).toMatchObject({ dialogType: "confirm", message: "pay?", action: "accept" });
    expect(next.previousDialogFailed!.error).toMatch(/already handled/);
    expect(next.replacedArm).toBeUndefined(); // the failed arm was spent, not replaced
    // Reported once.
    const after = await arm({ action: "dismiss" });
    expect(after.previousDialogFailed).toBeUndefined();
    await page.evaluate(() => alert("spend the arm"));
    await settle();
  }, 60_000);
});
