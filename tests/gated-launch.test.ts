/**
 * openGatedLaunch: one gated launch for code that drives Playwright itself
 * (cbrowser-enterprise's runWebSecurityScan, run by the CMS audit worker with
 * a bare chromium.launch until P-10b, 2026-11-14).
 */
import { describe, test, expect, afterEach } from "bun:test";
import { createServer, type Server } from "node:http";
import { chromium } from "playwright";
import { openGatedLaunch } from "../src/proxy-forwarder.js";
import { setHostedMode } from "../src/mcp-tools/hosted-inputs.js";

afterEach(() => setHostedMode(false));

function listener(): Promise<{ server: Server; port: number; hits: () => number }> {
  let n = 0;
  const server = createServer((_req, res) => { n++; res.end("<title>local</title>here"); });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    resolve({ server, port: (server.address() as { port: number }).port, hits: () => n });
  }));
}

describe("openGatedLaunch: the options", () => {
  test("not hosted, no proxy: no proxy and no extra arguments, nothing to close", async () => {
    setHostedMode(false);
    const g = await openGatedLaunch("chromium", { headless: true });
    expect(g.gated).toBe(false);
    expect(g.launchOptions.proxy).toBeUndefined();
    expect(g.launchOptions.args).toEqual([]);
    expect(g.initScript).toBeUndefined();
    await g.close();
  });

  test("hosted: the gate is the proxy, with no login and no bypass, and WebRTC kept off UDP", async () => {
    setHostedMode(true);
    const g = await openGatedLaunch("chromium", { headless: true });
    try {
      expect(g.gated).toBe(true);
      expect(g.launchOptions.proxy?.server).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(g.launchOptions.proxy?.username).toBeUndefined();
      expect(g.launchOptions.proxy?.bypass ?? "").toBe("");
      expect(g.launchOptions.args).toContain("--force-webrtc-ip-handling-policy=disable_non_proxied_udp");
    } finally {
      await g.close();
    }
  });

  test("hosted, headed chromium: the script that removes WebRTC is given too", async () => {
    setHostedMode(true);
    const g = await openGatedLaunch("chromium", { headless: false });
    try {
      expect(g.initScript).toBeTruthy();
    } finally {
      await g.close();
    }
  });
});

describe("openGatedLaunch: a real browser", () => {
  test("hosted: a page on this machine is not reached", async () => {
    const local = await listener();
    setHostedMode(true);
    const g = await openGatedLaunch("chromium", { headless: true });
    const browser = await chromium.launch({ headless: true, ...g.launchOptions });
    try {
      const page = await (await browser.newContext()).newPage();
      await page.goto(`http://127.0.0.1:${local.port}/`, { timeout: 8000 }).catch(() => undefined);
      expect(local.hits()).toBe(0);
    } finally {
      await browser.close();
      await g.close();
      local.server.close();
    }
  }, 30_000);

  test("not hosted (control): the same page is reached", async () => {
    const local = await listener();
    setHostedMode(false);
    const g = await openGatedLaunch("chromium", { headless: true });
    const browser = await chromium.launch({ headless: true, ...g.launchOptions });
    try {
      const page = await (await browser.newContext()).newPage();
      await page.goto(`http://127.0.0.1:${local.port}/`, { timeout: 8000 });
      expect(local.hits()).toBe(1);
    } finally {
      await browser.close();
      await g.close();
      local.server.close();
    }
  }, 30_000);
});
