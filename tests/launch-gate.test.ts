/**
 * The limit on browsers tools start for one call on the hosted server
 * (src/launch-gate.ts; challenger review 2026-11-16: about a dozen tools
 * launched browsers outside every session count, so one free account could
 * hold about 30 Chromiums). Fake launches; tests/launch-gate-browser.test.ts
 * covers a real CBrowser.
 */
import { describe, test, expect, afterEach } from "bun:test";
import { EventEmitter } from "node:events";

const gate = await import("../src/launch-gate.js");
const { setHostedMode } = await import("../src/mcp-tools/hosted-inputs.js");
const { gatedLaunch, onBrowserGone, onContextGone, configureLaunchGate, toolBrowserCount, ToolBrowserLimitError, toolBrowserLimits } = gate;

let bucket: string | undefined = "account:1";
let refunds = 0;
configureLaunchGate({ bucket: () => bucket, onRefuse: async () => { refunds++; } });

const ENV = ["MAX_TOOL_BROWSERS_PER_ACCOUNT", "MAX_TOOL_BROWSERS"];
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const open: EventEmitter[] = [];
afterEach(() => {
  for (const b of open.splice(0)) b.emit("disconnected");
  for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  setHostedMode(false);
  bucket = "account:1";
  refunds = 0;
});

const fakeBrowser = async () => { const b = new EventEmitter(); open.push(b); return b; };
const launch = () => gatedLaunch(fakeBrowser, onBrowserGone);

describe("hosted", () => {
  test("an account gets its share; the next launch is refused, refunded, and nothing is launched", async () => {
    setHostedMode(true);
    process.env.MAX_TOOL_BROWSERS_PER_ACCOUNT = "3";
    process.env.MAX_TOOL_BROWSERS = "100";
    for (let i = 0; i < 3; i++) await launch();
    let launched = false;
    await expect(gatedLaunch(async () => { launched = true; return new EventEmitter(); }, onBrowserGone)).rejects.toBeInstanceOf(ToolBrowserLimitError);
    expect(launched).toBe(false);
    expect(refunds).toBe(1);
    expect(toolBrowserCount("account:1")).toBe(3);
    bucket = "account:2"; // another account still launches
    await launch();
    expect(toolBrowserCount()).toBe(4);
  });

  test("the process total holds across accounts", async () => {
    setHostedMode(true);
    process.env.MAX_TOOL_BROWSERS_PER_ACCOUNT = "10";
    process.env.MAX_TOOL_BROWSERS = "2";
    bucket = "account:3"; await launch();
    bucket = "account:4"; await launch();
    bucket = "account:5";
    await expect(launch()).rejects.toThrow(/limit of 2 browsers/);
  });

  test("a slot comes back when the browser disconnects (close, crash, kill), once", async () => {
    setHostedMode(true);
    process.env.MAX_TOOL_BROWSERS_PER_ACCOUNT = "1";
    const b = await launch();
    await expect(launch()).rejects.toBeInstanceOf(ToolBrowserLimitError);
    open.splice(open.indexOf(b), 1);
    b.emit("disconnected");
    b.emit("disconnected");
    expect(toolBrowserCount("account:1")).toBe(0);
    await launch();
    expect(toolBrowserCount()).toBe(1);
  });

  test("a persistent context's slot comes back on its close", async () => {
    setHostedMode(true);
    process.env.MAX_TOOL_BROWSERS_PER_ACCOUNT = "1";
    const ctx = await gatedLaunch(async () => new EventEmitter(), onContextGone);
    await expect(launch()).rejects.toBeInstanceOf(ToolBrowserLimitError);
    ctx.emit("close");
    await launch();
  });

  test("a launch that fails gives its slot back", async () => {
    setHostedMode(true);
    process.env.MAX_TOOL_BROWSERS_PER_ACCOUNT = "1";
    await expect(gatedLaunch(async () => { throw new Error("no chromium"); }, onBrowserGone)).rejects.toThrow("no chromium");
    expect(toolBrowserCount("account:1")).toBe(0);
    await launch();
  });

  test("a batch in one tick cannot all pass before any is counted", async () => {
    setHostedMode(true);
    process.env.MAX_TOOL_BROWSERS_PER_ACCOUNT = "2";
    const r = await Promise.allSettled(Array.from({ length: 6 }, () => launch()));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(2);
  });
});

describe("not hosted", () => {
  test("nothing is counted or refused", async () => {
    process.env.MAX_TOOL_BROWSERS_PER_ACCOUNT = "1";
    for (let i = 0; i < 5; i++) await launch();
    expect(toolBrowserCount()).toBe(0);
  });

  test("defaults: 3 per account, 6 in total", () => {
    expect(toolBrowserLimits({})).toEqual({ perAccount: 3, total: 6 });
  });
});
