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
import { existsSync, readFileSync, writeFileSync, unlinkSync, createWriteStream, renameSync } from "fs";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { join } from "path";
import { spawn } from "child_process";
import { VideoCaptureSession, type VideoCaptureOptions, type VideoCaptureResult } from "./recording/engine.js";
import { CBrowser } from "./browser.js";
import { executeNaturalLanguage } from "./analysis/index.js";
import { getPaths, mergeConfig, type CBrowserConfig } from "./config.js";
import { evaluateScriptRefusal } from "./security/script-gate.js";
import { evaluateScript } from "./eval-script.js";

const DEFAULT_PORT = 9222;
const DAEMON_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes idle timeout

interface DaemonState {
  pid: number;
  port: number;
  startedAt: string;
  lastActivity: string;
  /**
   * Required (X-CBrowser-Daemon-Token) on /command and /shutdown. The daemon had no
   * authentication and reflected any Origin with credentials, so any local user, or
   * any web page open on the machine, could drive it: navigate to a file:// URL and
   * extract it, write a screenshot anywhere the daemon user can. The state file is
   * 0600, so only the daemon's own user can read the token. (2026-10-12)
   */
  token?: string;
}

const TOKEN_HEADER = "x-cbrowser-daemon-token";

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
  // A new file, created 0600 and exclusive, then renamed over the old one: writing
  // the token into an existing file and chmod-ing afterwards left it readable at the
  // old mode in between. rename replaces a symlink, it does not follow it.
  const tmp = `${statePath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600, flag: "wx" });
  renameSync(tmp, statePath);
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

const proofFor = (token: string, nonce: string): string => createHmac("sha256", token).update(nonce).digest("hex");

/**
 * Does the process on the recorded port hold this state file's token? It must answer
 * a fresh nonce with HMAC(token, nonce) before the client sends it anything. If the
 * daemon died and another local user bound the port, a client that trusted /ping
 * handed that process the token and obeyed its answers (e.g. HAR content written to
 * a path the user chose). (2026-10-12)
 */
async function verifyDaemon(state: DaemonState, timeoutMs = 1000): Promise<"verified" | "unreachable" | "impostor"> {
  if (!state.token) return "impostor";
  const nonce = randomBytes(16).toString("hex");
  let proof: unknown;
  try {
    const response = await fetch(`http://127.0.0.1:${state.port}/ping?nonce=${nonce}`, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return "impostor";
    proof = ((await response.json()) as { proof?: unknown }).proof;
  } catch {
    return "unreachable";
  }
  const expected = proofFor(state.token, nonce);
  return typeof proof === "string" && proof.length === expected.length &&
    timingSafeEqual(Buffer.from(proof), Buffer.from(expected)) ? "verified" : "impostor";
}

/** Whether a process with this pid exists (signal 0 checks without signalling). */
function processAlive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: it exists but belongs to someone else.
    return (e as NodeJS.ErrnoException).code === "EPERM";
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
  let v = await verifyDaemon(state, 1500);
  // A daemon busy encoding a capture can miss a short ping. If its process is
  // alive, ask again with more time, and never delete the state file under a
  // live daemon: the token exists only there, so deleting it orphaned the
  // daemon and let the next command launch a second browser on its profile.
  const alive = v === "unreachable" && processAlive(state.pid);
  if (alive) v = await verifyDaemon(state, 5000);
  if (v !== "verified") {
    if (alive) {
      console.debug(`[CBrowser] Daemon pid ${state.pid} is alive but not answering on port ${state.port}; leaving its state in place`);
      return false;
    }
    console.debug(`[CBrowser] Daemon on port ${state.port} ${v === "unreachable" ? "not responding" : "did not prove it holds the token"}; cleaning up stale state`);
    clearDaemonState();
    return false;
  }
  return true;
}

/**
 * Send a command to the running daemon
 */
export async function sendToDaemon(command: string, args: Record<string, unknown> = {}): Promise<DaemonResponse> {
  const state = getDaemonState();
  if (!state) {
    return { success: false, error: "Daemon not running" };
  }
  const v = await verifyDaemon(state, 5000);
  if (v !== "verified") {
    return { success: false, error: v === "unreachable" ? "Daemon not responding" : `The process on port ${state.port} did not prove it is this daemon; nothing was sent` };
  }

  try {
    const response = await fetch(`http://127.0.0.1:${state.port}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [TOKEN_HEADER]: state.token ?? "" },
      body: JSON.stringify({ command, args } as DaemonRequest),
      // Above the daemon's own COMMAND_TIMEOUT_MS (180s, sized for a capture
      // stop that has to encode). At 120s the client gave up and reported a
      // failure while the daemon went on to finish and write the manifest.
      signal: AbortSignal.timeout(190_000),
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
export async function startDaemon(
  port: number = DEFAULT_PORT,
  /** Flags for `daemon run` that shape its browser, e.g. ["--device", "iphone-16"]. */
  launchArgs: string[] = [],
): Promise<{ success: boolean; message: string; alreadyRunning?: boolean }> {
  // Check if already running
  if (await isDaemonRunning()) {
    const state = getDaemonState()!;
    return { success: true, message: `Daemon already running on port ${state.port} (PID: ${state.pid})`, alreadyRunning: true };
  }

  // Start daemon as background process
  const logPath = getDaemonLogPath();
  const child = spawn(
    process.execPath,
    [process.argv[1], "daemon", "run", "--port", String(port), ...launchArgs],
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
    const v = await verifyDaemon(state, 5000);
    if (v === "verified") {
      await fetch(`http://127.0.0.1:${state.port}/shutdown`, {
        method: "POST",
        headers: { [TOKEN_HEADER]: state.token ?? "" },
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Force kill if still running - but only a process that is this daemon (verified,
    // or /proc names a cbrowser daemon). An unverified state file's pid may by now
    // belong to anything, and a root CLI could signal any process.
    try {
      process.kill(state.pid, 0); // Check if process exists
      let isDaemon = v === "verified";
      if (!isDaemon) {
        try {
          const cmd = readFileSync(`/proc/${state.pid}/cmdline`, "utf-8").replace(/\0/g, " ");
          isDaemon = /cbrowser|cli\.(js|ts)/.test(cmd) && /\bdaemon\b/.test(cmd);
        } catch { /* no /proc: do not guess */ }
      }
      if (isDaemon) process.kill(state.pid, "SIGTERM");
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
   * HAR recording lives in the daemon's browser, the only one that outlives a CLI
   * command. Recorded in a client process, `har start` / navigate / `har stop`
   * were three processes and the HAR came back empty (2026-10-12).
   */
  let harRecording = false;

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

      // An action that ran but did not succeed (a red-zone refusal, an element
      // not found, a navigation that landed elsewhere) is a failure. Before
      // 20.0 every case answered success: true whenever nothing threw, so a
      // refused click exited 0 through the daemon and 1 without it.
      const outcome = (result: unknown): DaemonResponse => {
        const r = result as { success?: boolean; message?: string; error?: string } | undefined;
        if (r && r.success === false) {
          return { success: false, error: r.message ?? r.error ?? "The action did not succeed", result };
        }
        return { success: true, result };
      };

      // A command given --url acts on that page, as it does without a daemon.
      // The daemon used to ignore it and act on whatever page it had open.
      if (req.command !== "navigate" && req.command !== "evaluate" && typeof req.args.url === "string" && req.args.url) {
        const nav = await b.navigate(req.args.url);
        if (nav.success === false) return { success: false, error: `Navigation to ${req.args.url} did not land on that page`, result: nav };
      }

      switch (req.command) {
        case "navigate": {
          const url = req.args.url as string;
          return outcome(await b.navigate(url));
        }

        case "click": {
          // The same click as the local path. This used hoverClick, which first
          // hovers guessed menu parents, so the same click resolved and timed
          // differently with a daemon running; hoverClick stays available below.
          const selector = req.args.selector as string;
          return outcome(await b.click(selector, { force: req.args.force === true }));
        }

        case "hover": {
          const selector = req.args.selector as string;
          return outcome(await b.hover(selector));
        }

        case "hoverClick": {
          const selector = req.args.selector as string;
          const hoverParent = req.args.hoverParent as string | undefined;
          return outcome(await b.hoverClick(selector, { hoverParent, force: req.args.force === true }));
        }

        case "fill": {
          const selector = req.args.selector as string;
          const value = req.args.value as string;
          return outcome(await b.fill(selector, value));
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
          return outcome(await executeNaturalLanguage(b, command));
        }

        case "getPage": {
          // Read-only: the current URL and title. This used to navigate to
          // about:blank first, wiping the page a capture was recording.
          const page = await b.getPage();
          return { success: true, result: { url: page.url(), title: await page.title() } };
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
          if (typeof req.args.url === "string") await b.navigate(req.args.url);
          const page = await b.getPage();
          if (typeof req.args.waitFor === "string") {
            const timeout = Number(req.args.timeout) > 0 ? Number(req.args.timeout) : 30_000;
            try {
              await page.waitForSelector(req.args.waitFor, { timeout });
            } catch {
              return { success: false, error: `Timed out waiting for selector: ${req.args.waitFor} (after ${timeout}ms)`, zone: "red" };
            }
          }
          const evalArgs = (req.args.args as unknown[]) ?? [];
          // `script`: a caller's script in any shape, compiled as the local CLI does
          // (src/eval-script.ts). `body`: a function body, kept for older clients.
          const result = typeof req.args.script === "string"
            ? await evaluateScript(page, req.args.script, evalArgs)
            : await page.evaluate(
              (payload: { src: string; a: unknown[] }) => {
                const fn = new Function("args", payload.src);
                return fn(payload.a);
              },
              { src: req.args.body as string, a: evalArgs },
            );
          return { success: true, result, zone: "red" };
        }

        // The request log, like a HAR, is only meaningful in the browser that
        // outlives commands. (2026-10-12)
        // The console buffer of the daemon's tab: what get_console_messages returns
        // over MCP, for the CLI. Same filter set; clear empties it after reading.
        // (2026-10-12)
        case "consoleMessages": {
          const filter = typeof req.args.filter === "string" ? req.args.filter : "all";
          if (!["all", "error", "warning", "log", "info"].includes(filter)) {
            return { success: false, error: `filter must be one of all, error, warning, log, info (got "${filter}")` };
          }
          await b.getPage(); // a tab exists, so its console capture is attached
          const { messages, dropped } = b.getConsoleMessages();
          const filtered = filter === "all" ? messages : messages.filter((m) => m.type === filter);
          if (req.args.clear === true) b.clearConsoleMessages();
          return { success: true, result: { messages: filtered, count: filtered.length, ...(dropped > 0 ? { dropped } : {}) } };
        }

        case "networkList": {
          return { success: true, result: { requests: b.getNetworkRequests() } };
        }

        case "networkClear": {
          b.clearNetworkHistory();
          return { success: true, result: { cleared: true } };
        }

        case "harStart": {
          b.startHarRecording();
          harRecording = true;
          return { success: true, result: { recording: true } };
        }

        case "harStop": {
          if (!harRecording) {
            return { success: false, error: "No HAR recording is running in the daemon; run 'cbrowser har start' first" };
          }
          // Written to the daemon's own har directory only, and handed back: the
          // client writes any path it wants with its own permissions. A client path
          // here would let a command write anywhere the daemon user can.
          const file = await b.exportHar();
          harRecording = false;
          return { success: true, result: { file, har: readFileSync(file, "utf-8") } };
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

  const token = randomBytes(32).toString("hex");
  const authorized = (req: IncomingMessage): boolean => {
    const got = req.headers[TOKEN_HEADER];
    if (typeof got !== "string" || got.length !== token.length) return false;
    return timingSafeEqual(Buffer.from(got), Buffer.from(token));
  };
  const refuse = (res: ServerResponse): void => {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, error: "unauthorized: this daemon only accepts its own CLI (token in its state file)" }));
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

    if (req.url?.startsWith("/ping") && req.method === "GET") {
      // With ?nonce=, prove this daemon holds the token: HMAC(token, nonce). The
      // client checks it before it sends the token or trusts an answer.
      const nonce = new URL(req.url, "http://127.0.0.1").searchParams.get("nonce");
      const proof = nonce && /^[0-9a-f]{16,128}$/.test(nonce) ? proofFor(token, nonce) : undefined;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", uptime: process.uptime(), ...(proof ? { proof } : {}) }));
      return;
    }

    if (req.url === "/shutdown" && req.method === "POST") {
      if (!authorized(req)) return refuse(res);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "shutting down" }));
      await shutdown();
      return;
    }

    if (req.url === "/command" && req.method === "POST") {
      if (!authorized(req)) return refuse(res);
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
      token,
    };
    writeDaemonState(state);

    console.log(`[${new Date().toISOString()}] CBrowser daemon started on port ${port} (PID: ${process.pid})`);
    console.log(`[${new Date().toISOString()}] Idle timeout: ${DAEMON_TIMEOUT_MS / 1000 / 60} minutes`);

    resetIdleTimer();
  });
}
