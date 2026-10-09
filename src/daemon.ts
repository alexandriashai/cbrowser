/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */


/**
 * CBrowser Daemon Mode
 *
 * Keeps browser running between CLI commands for faster iteration.
 *
 * Usage:
 *   cbrowser daemon start     # Start daemon in background
 *   cbrowser daemon stop      # Stop daemon
 *   cbrowser daemon status    # Check if daemon is running
 *
 * Once running, all other commands automatically connect to the daemon
 * instead of launching a new browser.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from "http";
import { existsSync, readFileSync, writeFileSync, unlinkSync, createWriteStream } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { VideoCaptureSession, type VideoCaptureOptions, type VideoCaptureResult } from "./recording/engine.js";
import { CBrowser } from "./browser.js";
import { executeNaturalLanguage } from "./analysis/index.js";
import { getPaths, mergeConfig, type CBrowserConfig } from "./config.js";
import { evaluateScriptRefusal } from "./security/script-gate.js";

const DEFAULT_PORT = 9222;
const DAEMON_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes idle timeout

interface DaemonState {
  pid: number;
  port: number;
  startedAt: string;
  lastActivity: string;
}

interface DaemonRequest {
  command: string;
  args: Record<string, unknown>;
}

interface DaemonResponse {
  success: boolean;
  result?: unknown;
  error?: string;
  /** Set by commands that judge a zone; "red" on evaluate, refused or forced. */
  zone?: string;
}

/**
 * Get the daemon state file path
 */
function getDaemonStatePath(): string {
  const paths = getPaths();
  return join(paths.dataDir, "daemon.json");
}

/**
 * Get the daemon log file path
 */
function getDaemonLogPath(): string {
  const paths = getPaths();
  return join(paths.dataDir, "daemon.log");
}

/**
 * Read daemon state from disk
 */
export function getDaemonState(): DaemonState | null {
  const statePath = getDaemonStatePath();
  if (!existsSync(statePath)) {
    return null;
  }
  try {
    const data = readFileSync(statePath, "utf-8");
    return JSON.parse(data) as DaemonState;
  } catch (e) {
    console.debug(`[CBrowser] Daemon state file corrupted: ${(e as Error).message}`);
    return null;
  }
}

/**
 * Write daemon state to disk
 */
function writeDaemonState(state: DaemonState): void {
  const statePath = getDaemonStatePath();
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

/**
 * Clear daemon state file
 */
function clearDaemonState(): void {
  const statePath = getDaemonStatePath();
  if (existsSync(statePath)) {
    unlinkSync(statePath);
  }
}

/**
 * Check if daemon is running
 */
export async function isDaemonRunning(): Promise<boolean> {
  const state = getDaemonState();
  if (!state) {
    return false;
  }

  // Try to ping the daemon
  try {
    const response = await fetch(`http://127.0.0.1:${state.port}/ping`, {
      method: "GET",
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch (e) {
    console.debug(`[CBrowser] Daemon not responding, cleaning up stale state: ${(e as Error).message}`);
    clearDaemonState();
    return false;
  }
}

/**
 * Send a command to the running daemon
 */
export async function sendToDaemon(command: string, args: Record<string, unknown> = {}): Promise<DaemonResponse> {
  const state = getDaemonState();
  if (!state) {
    return { success: false, error: "Daemon not running" };
  }

  try {
    const response = await fetch(`http://127.0.0.1:${state.port}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command, args } as DaemonRequest),
      signal: AbortSignal.timeout(120000), // 2 minute timeout for commands
    });

    const data = await response.json() as DaemonResponse;
    return data;
  } catch (err) {
    return { success: false, error: `Failed to communicate with daemon: ${err}` };
  }
}

/**
 * Start the daemon in the background
 */
export async function startDaemon(port: number = DEFAULT_PORT): Promise<{ success: boolean; message: string }> {
  // Check if already running
  if (await isDaemonRunning()) {
    const state = getDaemonState()!;
    return { success: true, message: `Daemon already running on port ${state.port} (PID: ${state.pid})` };
  }

  // Start daemon as background process
  const logPath = getDaemonLogPath();
  const child = spawn(
    process.execPath,
    [process.argv[1], "daemon", "run", "--port", String(port)],
    {
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  // Write logs to file
  const logStream = createWriteStream(logPath, { flags: "a" });
  child.stdout?.pipe(logStream);
  child.stderr?.pipe(logStream);

  child.unref();

  // Wait for daemon to be ready
  const maxWait = 10000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    await new Promise(resolve => setTimeout(resolve, 200));
    if (await isDaemonRunning()) {
      const state = getDaemonState()!;
      return { success: true, message: `Daemon started on port ${state.port} (PID: ${state.pid})` };
    }
  }

  return { success: false, message: "Daemon failed to start within 10 seconds" };
}

/**
 * Stop the running daemon
 */
export async function stopDaemon(): Promise<{ success: boolean; message: string }> {
  const state = getDaemonState();
  if (!state) {
    return { success: true, message: "Daemon not running" };
  }

  try {
    // Send shutdown command
    await fetch(`http://127.0.0.1:${state.port}/shutdown`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});

    // Wait for daemon to stop
    await new Promise(resolve => setTimeout(resolve, 500));

    // Force kill if still running
    try {
      process.kill(state.pid, 0); // Check if process exists
      process.kill(state.pid, "SIGTERM");
    } catch {
      // Process already gone
    }

    clearDaemonState();
    return { success: true, message: `Daemon stopped (was PID: ${state.pid})` };
  } catch (err) {
    clearDaemonState();
    return { success: true, message: `Daemon stopped (cleanup: ${err})` };
  }
}

/**
 * Get daemon status
 */
export async function getDaemonStatus(): Promise<string> {
  const running = await isDaemonRunning();
  const state = getDaemonState();

  if (!running || !state) {
    return "Daemon is not running";
  }

  const uptime = Math.round((Date.now() - new Date(state.startedAt).getTime()) / 1000);
  const lastActivity = Math.round((Date.now() - new Date(state.lastActivity).getTime()) / 1000);

  return `Daemon running:
  PID: ${state.pid}
  Port: ${state.port}
  Uptime: ${uptime}s
  Last activity: ${lastActivity}s ago`;
}

/**
 * Run the daemon server (called in foreground mode)
 */
export async function runDaemonServer(config: Partial<CBrowserConfig>, port: number = DEFAULT_PORT): Promise<void> {
  let browser: CBrowser | null = null;
  let idleTimer: NodeJS.Timeout | null = null;
  let lastActivity = new Date();

  const resetIdleTimer = () => {
    lastActivity = new Date();
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    idleTimer = setTimeout(async () => {
      console.log(`[${new Date().toISOString()}] Daemon idle timeout, shutting down...`);
      await shutdown();
    }, DAEMON_TIMEOUT_MS);
  };

  const updateState = () => {
    const state = getDaemonState();
    if (state) {
      state.lastActivity = lastActivity.toISOString();
      writeDaemonState(state);
    }
  };

  const getBrowser = async (): Promise<CBrowser> => {
    if (!browser) {
      const fullConfig = mergeConfig({ ...config, persistent: true });
      browser = new CBrowser(fullConfig);
    }
    return browser;
  };

  // The live capture, if one is running. Held by the daemon rather than by a
  // CLI process so the recording outlives the invocation that started it: that
  // is the whole point of daemon-routed capture. Later `click`/`fill`/
  // `navigate` calls hit the same browser, so their effects land in the frames.
  let capture: VideoCaptureSession | null = null;
  let captureResult: VideoCaptureResult | null = null;

  /**
   * Ceiling on a single command. A wedged command used to present as an
   * indefinite silence on the client; now it comes back as an error naming the
   * command, so a regression is visible instead of looking like slowness.
   * Generous because a capture stop has to encode before it returns.
   */
  const COMMAND_TIMEOUT_MS = 180_000;

  const handleCommand = async (req: DaemonRequest): Promise<DaemonResponse> => {
    resetIdleTimer();
    updateState();

    try {
      const b = await getBrowser();

      switch (req.command) {
        case "navigate": {
          const url = req.args.url as string;
          const result = await b.navigate(url);
          return { success: true, result };
        }

        case "click": {
          const selector = req.args.selector as string;
          // Use hoverClick for better dropdown menu support (it carries the same red-zone gate as click)
          const result = await b.hoverClick(selector, { force: req.args.force === true });
          return { success: true, result };
        }

        case "hover": {
          const selector = req.args.selector as string;
          const result = await b.hover(selector);
          return { success: true, result };
        }

        case "hoverClick": {
          const selector = req.args.selector as string;
          const hoverParent = req.args.hoverParent as string | undefined;
          const result = await b.hoverClick(selector, { hoverParent, force: req.args.force === true });
          return { success: true, result };
        }

        case "fill": {
          const selector = req.args.selector as string;
          const value = req.args.value as string;
          const result = await b.fill(selector, value);
          return { success: true, result };
        }

        case "screenshot": {
          const path = req.args.path as string | undefined;
          const result = await b.screenshot(path);
          return { success: true, result };
        }

        case "extract": {
          const what = req.args.what as string;
          const result = await b.extract(what);
          return { success: true, result };
        }

        case "run": {
          const command = req.args.command as string;
          const result = await executeNaturalLanguage(b, command);
          return { success: true, result };
        }

        case "getPage": {
          // Navigate to about:blank to ensure page is loaded, then get info
          const navResult = await b.navigate("about:blank");
          return {
            success: true,
            result: {
              url: navResult.url,
              title: navResult.title,
            },
          };
        }

        case "keyboard": {
          // Sequences/chords/held modifiers, driven on the daemon's page so a
          // capture running here records them.
          const page = await b.getPage();
          const steps = req.args.steps as { kind: string; key?: string; text?: string }[];
          const hold = (req.args.hold as string[]) ?? [];
          const delay = (req.args.delay as number) ?? 50;
          const repeat = (req.args.repeat as number) ?? 1;
          const selector = req.args.selector as string | undefined;

          if (selector) {
            const locator = await b.resolveElementLocator(selector);
            if (!locator) return { success: false, error: `No element matched selector: ${selector}` };
            await locator.focus();
          }

          for (const modifier of hold) await page.keyboard.down(modifier);
          try {
            for (let pass = 0; pass < repeat; pass++) {
              for (const step of steps) {
                const refusal = await b.keystrokeRedZone(step.kind === "text" ? { text: step.text ?? "" } : { key: step.key ?? "" }, req.args.force === true);
                if (refusal) return { success: false, error: refusal };
                if (step.kind === "text") {
                  await page.keyboard.type(step.text ?? "", { delay: Math.min(delay, 50) });
                } else {
                  await page.keyboard.press(step.key ?? "");
                }
                if (delay > 0) await new Promise((r) => setTimeout(r, delay));
              }
            }
          } finally {
            for (const modifier of [...hold].reverse()) await page.keyboard.up(modifier);
          }
          return { success: true, result: { steps: steps.length, repeat } };
        }

        case "press": {
          const page = await b.getPage();
          const refusal = await b.keystrokeRedZone({ key: req.args.key as string }, req.args.force === true);
          if (refusal) return { success: false, error: refusal };
          await page.keyboard.press(req.args.key as string);
          return { success: true, result: { key: req.args.key } };
        }

        case "type": {
          const page = await b.getPage();
          const refusal = await b.keystrokeRedZone({ text: req.args.text as string }, req.args.force === true);
          if (refusal) return { success: false, error: refusal };
          await page.keyboard.type(req.args.text as string, { delay: (req.args.delay as number) ?? 50 });
          return { success: true, result: { length: (req.args.text as string).length } };
        }

        case "evaluate": {
          // Gated here as well as in the CLI: anything on this machine can
          // POST to the daemon, so the CLI's check is not the boundary.
          // Refused before the page is touched (src/security/script-gate.ts).
          const refusal = evaluateScriptRefusal(req.args.force);
          if (refusal) return { success: false, error: refusal, zone: "red" };
          const page = await b.getPage();
          const result = await page.evaluate(
            (payload: { src: string; a: unknown[] }) => {
              const fn = new Function("args", payload.src);
              return fn(payload.a);
            },
            { src: req.args.body as string, a: (req.args.args as unknown[]) ?? [] },
          );
          return { success: true, result, zone: "red" };
        }

        case "captureStart": {
          if (capture && capture.status().state === "recording") {
            return {
              success: false,
              error: `A capture is already running (${capture.status().slug}); stop it first`,
            };
          }

          const opts = (req.args.options ?? {}) as VideoCaptureOptions;
          const url = req.args.url as string | undefined;
          if (url) await b.navigate(url);

          const page = await b.getPage();
          const engine = (req.args.engine as "chromium" | "firefox" | "webkit") ?? "chromium";
          const paths = getPaths();

          capture = new VideoCaptureSession(page, engine, join(paths.videosDir, paths.sessionId));
          captureResult = null;
          const status = await capture.start({
            ...opts,
            // Rebuilt daemon-side: a resolver cannot cross the HTTP boundary.
            resolveElement: (selector) => b.resolveElementLocator(selector),
          });

          // Finalise whenever the capture ends on its own (duration or a stop
          // trigger) so `capture status` can report the result afterwards.
          void capture.finished.then((result) => { captureResult = result; }).catch(() => {});

          return { success: true, result: status };
        }

        case "captureStop": {
          if (!capture) {
            return { success: false, error: "No capture is running in the daemon" };
          }
          const result = await capture.stop();
          captureResult = result;
          return {
            success: true,
            result: {
              manifestPath: result.manifestPath,
              manifest: result.manifest,
              encodeErrors: result.encodeErrors,
            },
          };
        }

        case "captureStatus": {
          if (!capture) {
            return { success: true, result: { state: "idle" } };
          }
          return {
            success: true,
            result: {
              ...capture.status(),
              ...(captureResult
                ? {
                    manifestPath: captureResult.manifestPath,
                    frames: captureResult.manifest.frames.length,
                    artifacts: captureResult.manifest.artifacts,
                    encodeErrors: captureResult.encodeErrors,
                  }
                : {}),
            },
          };
        }

        default:
          return { success: false, error: `Unknown command: ${req.command}` };
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }
  };

  /** Run a command under the timeout ceiling. */
  const handleCommandBounded = async (req: DaemonRequest): Promise<DaemonResponse> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        handleCommand(req),
        new Promise<DaemonResponse>((resolve) => {
          timer = setTimeout(
            () => resolve({
              success: false,
              error: `Command '${req.command}' did not complete within ${COMMAND_TIMEOUT_MS / 1000}s`,
            }),
            COMMAND_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers - use request origin instead of wildcard
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === "/ping" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
      return;
    }

    if (req.url === "/shutdown" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "shutting down" }));
      await shutdown();
      return;
    }

    if (req.url === "/command" && req.method === "POST") {
      // Cap body size to 10 MB. Without this, a malicious or buggy client
      // can stream gigabytes into memory and OOM the daemon.
      const MAX_BODY_SIZE = 10 * 1024 * 1024;
      let body = "";
      let aborted = false;
      req.on("data", chunk => {
        if (aborted) return;
        body += chunk;
        if (body.length > MAX_BODY_SIZE) {
          aborted = true;
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Request body too large (>10 MB)" }));
          req.destroy();
        }
      });
      req.on("end", async () => {
        if (aborted) return;
        try {
          const request = JSON.parse(body) as DaemonRequest;
          const response = await handleCommandBounded(request);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(response));
        } catch (err) {
          console.error("[daemon] Request handling failed:", err);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: `Invalid request: ${err}` }));
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  const shutdown = async () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    if (browser) {
      await browser.close();
    }
    server.close();
    clearDaemonState();
    process.exit(0);
  };

  // Handle termination signals
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Start server
  server.listen(port, "127.0.0.1", () => {
    const state: DaemonState = {
      pid: process.pid,
      port,
      startedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };
    writeDaemonState(state);

    console.log(`[${new Date().toISOString()}] CBrowser daemon started on port ${port} (PID: ${process.pid})`);
    console.log(`[${new Date().toISOString()}] Idle timeout: ${DAEMON_TIMEOUT_MS / 1000 / 60} minutes`);

    resetIdleTimer();
  });
}
