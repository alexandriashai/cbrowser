/**
 * A real CBrowser on the hosted server goes through the tool-browser gate
 * unless it belongs to a session (src/launch-gate.ts; challenger review
 * 2026-11-16). Real Chromium, about:blank, nothing beyond the machine.
 */
import { describe, test, expect, afterEach } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-launch-gate-"));
const { CBrowser } = await import("../src/browser.js");
const { setHostedMode } = await import("../src/mcp-tools/hosted-inputs.js");
const { setEgressPolicyForTests } = await import("../src/egress.js");
const { configureLaunchGate, markSessionBrowser, toolBrowserCount, ToolBrowserLimitError } = await import("../src/launch-gate.js");

configureLaunchGate({ bucket: () => "account:gate-browser" });
const saved = process.env.MAX_TOOL_BROWSERS_PER_ACCOUNT;
afterEach(() => {
  setHostedMode(false);
  setEgressPolicyForTests(null);
  if (saved === undefined) delete process.env.MAX_TOOL_BROWSERS_PER_ACCOUNT; else process.env.MAX_TOOL_BROWSERS_PER_ACCOUNT = saved;
});

function hosted(): void {
  setHostedMode(true);
  setEgressPolicyForTests({ resolve: async () => ["93.184.215.14"], allow: () => true });
}

describe("CBrowser on the hosted server", () => {
  test("a tool's own browser is counted while it runs and released when it closes", async () => {
    hosted();
    process.env.MAX_TOOL_BROWSERS_PER_ACCOUNT = "1";
    const a = new CBrowser({ headless: true, persistent: false });
    const b = new CBrowser({ headless: true, persistent: false });
    try {
      await a.launch();
      expect(toolBrowserCount("account:gate-browser")).toBe(1);
      await expect(b.launch()).rejects.toBeInstanceOf(ToolBrowserLimitError);
      await a.close();
      expect(await until(() => toolBrowserCount("account:gate-browser") === 0)).toBe(true);
      await b.launch();
      expect(toolBrowserCount("account:gate-browser")).toBe(1);
    } finally {
      await a.close().catch(() => {});
      await b.close().catch(() => {});
    }
    expect(await until(() => toolBrowserCount() === 0)).toBe(true);
  }, 90_000);

  test("a session's browser is not counted here (the session admission counts it)", async () => {
    hosted();
    process.env.MAX_TOOL_BROWSERS_PER_ACCOUNT = "1";
    const s = new CBrowser({ headless: true, persistent: false });
    markSessionBrowser(s);
    try {
      await s.launch();
      expect(toolBrowserCount()).toBe(0);
    } finally {
      await s.close();
    }
  }, 60_000);
});

async function until(cond: () => boolean, ms = 5000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (cond()) return true; await new Promise((r) => setTimeout(r, 25)); }
  return cond();
}
