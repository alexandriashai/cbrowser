/**
 * MCP Capture Session Continuity Tests (F12)
 *
 * Capture on the MCP surface is stateful across tool calls: `capture_start`
 * returns while the recording is still running, other tools drive the same page
 * via `_browserToken`, and `capture_stop` closes it. These tests exercise that
 * lifecycle against a real browser, because the failure modes here are all
 * "looks right, does nothing".
 *
 * The end-to-end proof that interactions actually land in the frames is a
 * separate live MCP handshake (capture_start -> click -> capture_stop, with the
 * change point correlated against the click time); this file guards the session
 * bookkeeping that proof depends on.
 */

import { describe, test, expect, afterAll, beforeAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Artifacts go to a temp dir, never the directory nginx serves (/var/www/cbrowser-data/heatmaps).
process.env.CBROWSER_ARTIFACT_DIR ??= mkdtempSync(join(tmpdir(), "cb-artifacts-"));
import { CBrowser } from "../src/browser.js";
import {
  startCapture,
  stopCapture,
  captureStatus,
  clearCaptureSessions,
} from "../src/mcp-tools/base/capture-tools.js";

const workDir = mkdtempSync(join(tmpdir(), "cbrowser-mcp-session-"));
let browser: CBrowser;
let fixtureUrl: string;
const created: string[] = [];

beforeAll(async () => {
  const path = join(workDir, "fixture.html");
  writeFileSync(
    path,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Session Fixture</title></head>
     <body style="margin:0;background:#111"><h1 id="h" style="color:#fff">0</h1>
     <script>let n=0;setInterval(()=>{n++;document.getElementById("h").textContent=n;
       document.body.style.background="hsl("+(n*29%360)+",65%,25%)";},60)</script></body></html>`,
  );
  fixtureUrl = `file://${path}`;
  browser = new CBrowser({ headless: true });
  await browser.launch();
});

afterAll(async () => {
  await browser?.close();
  clearCaptureSessions();
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
  rmSync(workDir, { recursive: true, force: true });
});

describe("capture session continuity across tool calls", () => {
  test("start -> status (running) -> stop -> status (completed, not idle)", async () => {
    clearCaptureSessions();
    const token = "tok-primary";
    const outDir = join(workDir, "primary");
    created.push(outDir);

    // capture_start returns while the recording is still going.
    const start = await startCapture(
      browser,
      { url: fixtureUrl, fps: 10, name: "primary", outDir },
      token,
    );
    expect(start.state).toBe("recording");

    // A separate tool call on the same token sees the RUNNING capture.
    await new Promise((r) => setTimeout(r, 800));
    const during = captureStatus(token);
    expect(during.state).toBe("recording");
    expect(during.frames as number).toBeGreaterThan(0);
    expect(during.elapsed_ms as number).toBeGreaterThan(0);

    const { payload } = await stopCapture(token);
    expect(payload.frames).toBeGreaterThan(0);
    expect(existsSync(payload.manifest_path)).toBe(true);

    // The regression this guards: status used to report
    // "No capture has been started on this browser session" once the session
    // object was dropped, so a completed capture read as though it never ran.
    const after = captureStatus(token);
    expect(after.state).toBe("stopped");
    expect(after.slug).toBe("primary");
    expect(after.manifest_path).toBe(payload.manifest_path);
    expect(after.frames).toBe(payload.frames);
    expect(after.state).not.toBe("idle");
  }, 120000);

  test("a capture running on another token is never invisible", async () => {
    clearCaptureSessions();
    const owner = "tok-owner";
    const other = "tok-observer";
    const outDir = join(workDir, "cross-token");
    created.push(outDir);

    await startCapture(browser, { url: fixtureUrl, fps: 10, name: "cross-token", outDir }, owner);
    await new Promise((r) => setTimeout(r, 500));

    // A different token must not be told "idle" while frames are being written.
    const seen = captureStatus(other);
    expect(seen.state).toBe("recording");
    expect(seen.slug).toBe("cross-token");
    expect(String(seen.started_by)).toMatch(/another browser token/);
    expect(String(seen.note)).toMatch(/_browserToken/);

    await stopCapture(owner);
  }, 120000);

  test("a session's own finished capture is not masked by one running elsewhere", async () => {
    clearCaptureSessions();
    const first = "tok-first";
    const second = "tok-second";
    const firstDir = join(workDir, "first");
    const secondDir = join(workDir, "second");
    created.push(firstDir, secondDir);

    // First session records and stops.
    await startCapture(browser, { url: fixtureUrl, fps: 10, name: "first", outDir: firstDir }, first);
    await new Promise((r) => setTimeout(r, 500));
    const firstResult = await stopCapture(first);

    // Second session starts a capture that is still running.
    await startCapture(browser, { url: fixtureUrl, fps: 10, name: "second", outDir: secondDir }, second);
    await new Promise((r) => setTimeout(r, 400));

    const status = captureStatus(first);
    // Its OWN completed run comes first...
    expect(status.state).toBe("stopped");
    expect(status.slug).toBe("first");
    expect(status.manifest_path).toBe(firstResult.payload.manifest_path);
    // ...with the live one attached alongside rather than replacing it.
    const elsewhere = status.also_running_elsewhere as Record<string, unknown>;
    expect(elsewhere).toBeDefined();
    expect(elsewhere.slug).toBe("second");

    await stopCapture(second);
  }, 120000);

  test("starting a second capture on a busy token is refused, not silently dropped", async () => {
    clearCaptureSessions();
    const token = "tok-busy";
    const outDir = join(workDir, "busy");
    created.push(outDir);

    await startCapture(browser, { url: fixtureUrl, fps: 10, name: "busy", outDir }, token);
    await expect(
      startCapture(browser, { url: fixtureUrl, name: "busy-2" }, token),
    ).rejects.toThrow(/already running/);

    await stopCapture(token);
  }, 120000);

  test("stop without a start reports the reason", async () => {
    clearCaptureSessions();
    await expect(stopCapture("tok-never-started")).rejects.toThrow(/No capture has been started/);
  });

  test("idle only when nothing has run at all", () => {
    // captureStatus reads the CLI/daemon pointer at <dataDir>/videos/active.json
    // so a foreign capture is never invisible from MCP. That makes "idle"
    // conditional on real machine state, and any live daemon capture — another
    // agent, a user, CI parallelism — would flip this to "recording". Point the
    // data dir at an empty temp dir for the duration of the call so the pointer
    // read finds nothing, testing the idle path in isolation rather than
    // asserting the box is quiet.
    clearCaptureSessions();
    const emptyDataDir = mkdtempSync(join(tmpdir(), "cbrowser-empty-datadir-"));
    const previous = process.env.CBROWSER_DATA_DIR;
    process.env.CBROWSER_DATA_DIR = emptyDataDir;
    try {
      const status = captureStatus("tok-fresh");
      expect(status.state).toBe("idle");
    } finally {
      if (previous === undefined) delete process.env.CBROWSER_DATA_DIR;
      else process.env.CBROWSER_DATA_DIR = previous;
      rmSync(emptyDataDir, { recursive: true, force: true });
    }
  });
});
