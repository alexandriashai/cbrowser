/**
 * Capture limits on the hosted server, and the lifetime of a capture nobody
 * stops (audit leaks-static-1, leaks-static-7; ISA 20261112-cbrowser-sessions-leaks
 * ISC-4 and ISC-6; 2026-11-15).
 *
 * Before: capture_start on the hosted server took any fps, duration, frame cap
 * and viewport the caller sent, an open-ended capture recorded until someone
 * called capture_stop, and the process-wide capture map kept every entry for
 * the life of the server, including captures whose browser session had closed.
 *
 * The engine is stubbed (as in account-scope-process-maps.test.ts): these tests
 * are about the options the tool hands the engine and about which entries the
 * map keeps. The engine's own duration timer is covered by the recording tests.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = mkdtempSync(join(tmpdir(), "cb-hosted-capture-"));
process.env.CBROWSER_DATA_DIR = join(ROOT, "data");

const {
  startCapture, stopCapture, captureStatus, clearCaptureSessions,
  hostedCaptureLimits, clampCaptureForHosted, releaseCapturesForBrowser,
  sweepCaptureSessions, captureSessionCount,
} = await import("../src/mcp-tools/base/capture-tools.js");
const { setHostedMode } = await import("../src/mcp-tools/hosted-inputs.js");
const { VideoCaptureSession } = await import("../src/recording/engine.js");

type Fake = { state: "idle" | "recording" | "stopped"; slug: string; outDir: string; opts: Record<string, unknown> };
const proto = VideoCaptureSession.prototype as unknown as Record<string, unknown>;
const real = { start: proto.start, stop: proto.stop, status: proto.status };
let seq = 0;
let lastStartOpts: Record<string, unknown> = {};
let stops = 0;

beforeAll(() => {
  proto.status = function (this: { __fake?: Fake }) {
    const f = this.__fake ?? { state: "idle", slug: "", outDir: "" };
    return { state: f.state, slug: f.slug, outDir: f.outDir, frames: 0, elapsedMs: 0, captureMethod: "cdp-screencast" };
  };
  proto.start = async function (this: { __fake?: Fake; status: () => unknown }, opts: Record<string, unknown> = {}) {
    lastStartOpts = opts;
    const slug = `hosted-cap-${++seq}`;
    this.__fake = { state: "recording", slug, outDir: join(ROOT, "videos", slug), opts };
    return this.status();
  };
  proto.stop = async function (this: { __fake: Fake }) {
    stops++;
    this.__fake.state = "stopped";
    return {
      manifestPath: join(this.__fake.outDir, "manifest.json"),
      manifest: {
        version: 1, slug: this.__fake.slug, engine: "chromium", capture_method: "cdp-screencast", target_fps: 10, actual_fps: 10,
        viewport: { width: 800, height: 600, deviceScaleFactor: 1 }, target: { kind: "viewport" },
        start_trigger: null, stop_trigger: null, trigger_timeout: false, started_at: new Date().toISOString(),
        duration_ms: 1000, output_dims: { width: 800, height: 600 }, frames: [], change_points: [], frame_gaps: [],
        region_clamped: false, artifacts: {},
      },
      encodeErrors: {},
    };
  };
});

afterAll(() => {
  proto.start = real.start;
  proto.stop = real.stop;
  proto.status = real.status;
  setHostedMode(false);
  clearCaptureSessions();
});

beforeEach(() => {
  clearCaptureSessions();
  lastStartOpts = {};
  stops = 0;
});

function fakeBrowser() {
  const viewports: Array<{ width: number; height: number }> = [];
  let current = { width: 800, height: 600 };
  const page = {
    context: () => ({ browser: () => ({ browserType: () => ({ name: () => "chromium" }) }) }),
    viewportSize: () => current,
    setViewportSize: async (v: { width: number; height: number }) => { viewports.push(v); current = v; },
  };
  const browser = {
    getPage: async () => page,
    navigate: async () => {},
    screenshot: async () => { throw new Error("no screenshot in this test"); },
  };
  return { browser: browser as never, viewports };
}

describe("hosted capture limits (pure)", () => {
  const limits = { maxFps: 30, maxDurationMs: 120_000, maxFrames: 1800, maxWidth: 1920, maxHeight: 1920 };

  test("values inside the limits pass through unchanged, with no notes", () => {
    const out = clampCaptureForHosted({ fps: 10, durationMs: 5000, maxFrames: 100, viewport: { width: 1280, height: 720 } }, limits);
    expect(out).toEqual({ fps: 10, durationMs: 5000, maxFrames: 100, viewport: { width: 1280, height: 720 }, notes: [] });
  });

  test("each value over its limit comes down to the limit, and says so", () => {
    const out = clampCaptureForHosted({ fps: 400, durationMs: 3_600_000, maxFrames: 1_000_000, viewport: { width: 8000, height: 6000 } }, limits);
    expect(out.fps).toBe(30);
    expect(out.durationMs).toBe(120_000);
    expect(out.maxFrames).toBe(1800);
    expect(out.viewport).toEqual({ width: 1920, height: 1920 });
    expect(out.notes).toHaveLength(4);
    expect(out.notes.join(" ")).toContain("400");
  });

  test("an open-ended capture gets the time limit as its duration, and a frame cap", () => {
    const out = clampCaptureForHosted({}, limits);
    expect(out.durationMs).toBe(120_000);
    expect(out.maxFrames).toBe(1800);
    expect(out.fps).toBeUndefined();
    expect(out.viewport).toBeUndefined();
    expect(out.notes.some((n) => /stops on its own after 120 s/.test(n))).toBe(true);
  });

  test("limits come from the environment when set to positive numbers, defaults otherwise", () => {
    expect(hostedCaptureLimits({})).toEqual(limits);
    expect(hostedCaptureLimits({
      CBROWSER_HOSTED_CAPTURE_MAX_FPS: "15",
      CBROWSER_HOSTED_CAPTURE_MAX_DURATION_MS: "60000",
      CBROWSER_HOSTED_CAPTURE_MAX_FRAMES: "-4",
      CBROWSER_HOSTED_CAPTURE_MAX_WIDTH: "abc",
    })).toEqual({ ...limits, maxFps: 15, maxDurationMs: 60_000 });
  });
});

describe("capture_start on the hosted server", () => {
  afterAll(() => setHostedMode(false));

  test("hosted: the engine gets the clamped options, the viewport is clamped, the caller is told", async () => {
    setHostedMode(true);
    const { browser, viewports } = fakeBrowser();
    const payload = await startCapture(browser, { fps: 400, max_frames: 1_000_000, viewport: "8000x6000" } as never);
    expect(lastStartOpts.fps).toBe(30);
    expect(lastStartOpts.durationMs).toBe(120_000);
    expect(lastStartOpts.maxFrames).toBe(1800);
    expect(viewports).toEqual([{ width: 1920, height: 1920 }]);
    expect(Array.isArray(payload.hosted_limits)).toBe(true);
    expect((payload.hosted_limits as string[]).length).toBe(4);
  });

  test("not hosted: the options pass through as given and nothing is added", async () => {
    setHostedMode(false);
    const { browser, viewports } = fakeBrowser();
    const payload = await startCapture(browser, { fps: 400, max_frames: 1_000_000, viewport: "8000x6000" } as never);
    expect(lastStartOpts.fps).toBe(400);
    expect(lastStartOpts.durationMs).toBeUndefined();
    expect(lastStartOpts.maxFrames).toBe(1_000_000);
    expect(viewports).toEqual([{ width: 8000, height: 6000 }]);
    expect(payload.hosted_limits).toBeUndefined();
  });
});

describe("a capture's lifetime", () => {
  test("closing a browser stops its recording capture and frees the entry, leaving other browsers' captures", async () => {
    const a = fakeBrowser();
    const b = fakeBrowser();
    await startCapture(a.browser, {} as never, "tok-a");
    await startCapture(b.browser, {} as never, "tok-b");
    expect(captureSessionCount()).toBe(2);

    const released = await releaseCapturesForBrowser(a.browser);
    expect(released).toBe(1);
    expect(stops).toBe(1);
    expect(captureSessionCount()).toBe(1);
    expect(captureStatus("tok-b").state).toBe("recording");
  });

  test("a capture whose stop never settles is still freed after the timeout", async () => {
    const a = fakeBrowser();
    await startCapture(a.browser, {} as never, "tok-hang");
    const saved = proto.stop;
    proto.stop = () => new Promise(() => {});
    try {
      const t0 = Date.now();
      expect(await releaseCapturesForBrowser(a.browser, 200)).toBe(1);
      expect(Date.now() - t0).toBeLessThan(2000);
      expect(captureSessionCount()).toBe(0);
    } finally {
      proto.stop = saved;
    }
  });

  test("a stopped capture nobody collected is dropped after the grace; a recording one is kept", async () => {
    const a = fakeBrowser();
    const b = fakeBrowser();
    await startCapture(a.browser, {} as never, "tok-done");
    await startCapture(b.browser, {} as never, "tok-live");
    const t0 = Date.now();
    sweepCaptureSessions(t0, 60_000); // first sight of nothing stopped: no change
    expect(captureSessionCount()).toBe(2);

    await stopCaptureEngineOnly("tok-done");
    sweepCaptureSessions(t0, 60_000);          // first seen stopped: kept
    expect(captureSessionCount()).toBe(2);
    sweepCaptureSessions(t0 + 59_000, 60_000); // inside the grace: kept
    expect(captureSessionCount()).toBe(2);
    sweepCaptureSessions(t0 + 61_000, 60_000); // past it: dropped
    expect(captureSessionCount()).toBe(1);
    expect(captureStatus("tok-live").state).toBe("recording");
  });

  test("collecting a capture before the grace still works", async () => {
    const a = fakeBrowser();
    await startCapture(a.browser, {} as never, "tok-collect");
    await stopCaptureEngineOnly("tok-collect");
    sweepCaptureSessions(Date.now(), 60_000);
    const { payload } = await stopCapture("tok-collect");
    expect(payload).toBeDefined();
  });
});

/** Stop the engine the way its duration timer does, without capture_stop. */
async function stopCaptureEngineOnly(token: string): Promise<void> {
  const { _captureEngineForTest } = await import("../src/mcp-tools/base/capture-tools.js");
  await (_captureEngineForTest(token) as { stop: () => Promise<unknown> }).stop();
}

describe("the hosted server frees captures", () => {
  const ENV = ["MAX_CONCURRENT_SESSIONS", "MAX_SESSIONS_PER_ACCOUNT", "SESSION_IDLE_TIMEOUT_MS"];
  const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  afterAll(() => {
    for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });

  test("a session the server closes takes its recording capture with it", async () => {
    const remote = await import("../src/mcp-server-remote.js");
    const { withPersonaScope } = await import("../src/persona-scope.js");
    process.env.MAX_CONCURRENT_SESSIONS = "100000";
    process.env.MAX_SESSIONS_PER_ACCOUNT = "1000";
    const acct = 9777;
    const { browser, token } = await withPersonaScope(acct, () => remote.getBrowserByToken());
    // The session's own CBrowser, with its page stubbed so nothing launches.
    const fake = fakeBrowser().browser as unknown as Record<string, unknown>;
    const b = browser as unknown as Record<string, unknown>;
    b.getPage = fake.getPage; b.navigate = fake.navigate; b.screenshot = fake.screenshot;
    await withPersonaScope(acct, () => startCapture(browser, {} as never, token));
    expect(captureSessionCount()).toBe(1);

    process.env.SESSION_IDLE_TIMEOUT_MS = "1";
    await new Promise((r) => setTimeout(r, 10));
    await remote.sweepSessions();
    delete process.env.SESSION_IDLE_TIMEOUT_MS;
    expect(stops).toBe(1);
    expect(captureSessionCount()).toBe(0);
  });

  test("the session sweep drops a stopped capture nobody collected", async () => {
    const remote = await import("../src/mcp-server-remote.js");
    const a = fakeBrowser();
    await startCapture(a.browser, {} as never, "tok-swept");
    await stopCaptureEngineOnly("tok-swept");
    const now = Date.now();
    await remote.sweepSessions(now);
    expect(captureSessionCount()).toBe(1);
    await remote.sweepSessions(now + 11 * 60_000);
    expect(captureSessionCount()).toBe(0);
  });
});
