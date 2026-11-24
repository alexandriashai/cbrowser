/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Helpers and types of CBrowser that are not methods: the launch arguments,
 * browser installation, Playwright error summaries, the gate-reading goto, and
 * the byte caps of the request log. src/browser.ts re-exports the exported ones.
 */

import { chromium, firefox, webkit, type Browser, type Page, type Request, type Response } from "playwright";
import { spawn } from "child_process";
import { createRequire } from "module";
import { dirname, join } from "path";
import { EGRESS_HEADER } from "../egress-gate.js";
import type { SupportedBrowser } from "../types.js";
import { isHostedMode } from "../mcp-tools/hosted-inputs.js";
import { gateNavigationError, markedNavigationError, type GateRecord } from "../navigation-errors.js";
import type { Rect } from "../recording/types.js";
import { gatedLaunch, onBrowserGone } from "../launch-gate.js";

// Browser-specific fast launch args for performance optimization
/** @internal */
export const BROWSER_LAUNCH_ARGS: Record<SupportedBrowser, string[]> = {
  // Chromium args - reduces cold start time significantly
  chromium: [
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-setuid-sandbox",
    "--no-sandbox",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-breakpad",
    "--disable-component-extensions-with-background-pages",
    "--disable-features=TranslateUI",
    "--disable-ipc-flooding-protection",
    "--disable-renderer-backgrounding",
    "--enable-features=NetworkService,NetworkServiceInProcess",
    "--force-color-profile=srgb",
    "--metrics-recording-only",
    "--no-first-run",
  ],
  // Firefox args - uses different flag format
  firefox: [
    "-no-remote", // Don't connect to existing Firefox instance
    "-new-instance", // Force new browser instance
  ],
  // WebKit args - minimal flags, WebKit is already lean
  webkit: [],
};

// Legacy alias for backward compatibility
const _FAST_LAUNCH_ARGS = BROWSER_LAUNCH_ARGS.chromium;

// Session state persistence - saves current URL between CLI invocations
/** Shared by the src/browser/ modules; the package does not export it. Left untagged so their declarations can import it. */
export interface SessionState {
  url: string;
  timestamp: number;
  viewport?: { width: number; height: number };
  device?: string;
  /** Set by `cbrowser geo set`; restored at launch like device. */
  geolocation?: { latitude: number; longitude: number; accuracy?: number };
}

/**
 * Screenshot options for compression.
 * Used to control JPEG compression when staying under Claude.ai's 200KB limit.
 */
export interface ScreenshotOptions {
  /** Use JPEG format with compression (default: false for PNG, auto-enabled in remote mode) */
  compress?: boolean;
  /** JPEG quality 0-100 (default: 85, only used when compress=true) */
  quality?: number;
  /**
   * Not applied. It only ever fed the old compression loop's skip guard and
   * never set a size; since 2026-10-07 (BUG-02) the image is downscaled only
   * as far as `maxSize` requires. Kept so existing callers still compile.
   */
  scale?: number;
  /** Target max file size in bytes - will auto-adjust quality/scale if needed */
  maxSize?: number;
  /**
   * Never resize the viewport to hit the size budget.
   *
   * Since 2026-10-07 (BUG-02) this is how compression always behaves: the
   * budget is met by re-encoding and downscaling the captured image in memory,
   * and the live viewport is never touched. The option is kept so the callers
   * that own the viewport (a running capture) still state that they do.
   */
  noResize?: boolean;
  /** Full page screenshot (default: false) */
  fullPage?: boolean;
  /**
   * Crop the screenshot to a rectangle in CSS pixels, relative to the top-left
   * of the page. Clamped to the viewport (or the full page when fullPage=true);
   * a rect that clamps to zero area throws.
   */
  clip?: { x: number; y: number; width: number; height: number };
}

/**
 * What a compressed screenshot actually is, once it has been fitted to its
 * byte budget. Read it from `CBrowser.lastScreenshotInfo`.
 *
 * The budget can now be met by downscaling the image rather than the viewport
 * (BUG-02, 2026-10-07), so a picture can be smaller than the page it shows.
 * A caller that maps what it sees back onto the page -- coordinates, text
 * size, "is that the mobile layout?" -- needs to know that, and the file name
 * alone does not say.
 */
export interface ScreenshotInfo {
  /** The file written. */
  path: string;
  /** Pixel size of the image in the file. */
  width: number;
  height: number;
  /** Pixel size the browser captured, before any in-memory downscale. */
  sourceWidth: number;
  sourceHeight: number;
  /** True when the image is smaller than the capture. */
  downscaled: boolean;
  /** JPEG quality of the file. */
  quality: number;
  /** Size of the file in bytes. */
  bytes: number;
  /** The byte budget it was fitted to; `bytes` exceeds it only when nothing fitted. */
  maxSize: number;
}

/**
 * One encoded candidate in CBrowser.fitJpegToBudget.
 */
export interface FittedJpeg {
  buffer: Buffer;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  quality: number;
}

/**
 * A screenshot clip rectangle in CSS pixels.
 *
 * Clamping is delegated to `clampRect` in the recording module so screenshots
 * and recordings share one definition of "trim this rect to the capture area".
 */
export type ClipRect = Rect;

// =========================================================================
// Standalone Browser Launch Utilities (for use outside CBrowser class)
// =========================================================================

/**
 * Check if an error indicates missing Playwright browsers.
 */
export function isBrowserNotInstalledError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("executable doesn't exist") ||
    message.includes("executable does not exist") ||
    message.includes("browsertype.launch") ||
    message.includes("no usable browser") ||
    message.includes("browser was not found")
  );
}

/**
 * The CLI of the Playwright this package depends on. `npx playwright` ran
 * whatever Playwright the caller's directory or npx cache held (measured
 * 2026-11-20: 1.58.0 from a user's directory against the bundled 1.65.1), so
 * it downloaded browser revisions this package never launches. Playwright does
 * not export cli.js, so the path is taken from its package.json, which it does.
 */
function bundledPlaywrightCli(): string {
  const req = createRequire(import.meta.url);
  return join(dirname(req.resolve("playwright/package.json")), "cli.js");
}

/** How long an automatic install may run before it is stopped. */
const INSTALL_TIMEOUT_MS = 5 * 60_000;

/**
 * Attempt to install Playwright browsers automatically.
 * Returns true if installation succeeded, false otherwise.
 *
 * Everything the installer prints goes to stderr. It used to inherit stdout,
 * and on the stdio MCP server stdout is the JSON-RPC channel: the download
 * progress lines landed between protocol messages and a client reading them
 * dropped the connection. It runs as a child process, not execSync, so the
 * event loop keeps serving while it downloads.
 *
 * @param browserName one browser, or a space-separated list; all three when omitted
 */
export async function installPlaywrightBrowsers(browserName?: string): Promise<boolean> {
  console.error("🔧 Playwright browsers not found. Installing automatically...");
  console.error("   This may take a few minutes on first run.\n");

  const browsers = (browserName || "chromium firefox webkit").split(/\s+/).filter(Boolean);
  let installed = false;
  try {
    const cli = bundledPlaywrightCli();
    installed = await new Promise<boolean>((resolve) => {
      const child = spawn(process.execPath, [cli, "install", ...browsers], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.pipe(process.stderr, { end: false });
      child.stderr.pipe(process.stderr, { end: false });
      const timer = setTimeout(() => child.kill("SIGTERM"), INSTALL_TIMEOUT_MS);
      child.on("error", () => { clearTimeout(timer); resolve(false); });
      child.on("close", (code) => { clearTimeout(timer); resolve(code === 0); });
    });
  } catch {
    installed = false;
  }
  console.error(installed
    ? "\n✅ Playwright browsers installed successfully.\n"
    : "\n❌ Automatic browser installation failed.\n");
  return installed;
}

/**
 * Get actionable error message for browser installation failure.
 */
export function getBrowserInstallErrorMessage(browserName: string = "chromium"): string {
  return `
╔══════════════════════════════════════════════════════════════════════════════╗
║  Playwright browsers are not installed                                        ║
╚══════════════════════════════════════════════════════════════════════════════╝

CBrowser requires Playwright browsers to run. Automatic installation failed.

To fix this, run one of these commands:

  cbrowser install-browsers chromium firefox webkit    # Install all browsers
  cbrowser install-browsers ${browserName.padEnd(26)} # Install ${browserName} only

Common issues:
  • Corporate network blocking downloads → Contact IT or use a VPN
  • Permission errors → Try with sudo or check write permissions
  • PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 → Unset this environment variable

For more help: https://playwright.dev/docs/browsers
`;
}

/**
 * Launch a Playwright browser with automatic installation fallback.
 * Use this instead of direct chromium.launch() / firefox.launch() / webkit.launch()
 * to ensure browsers are installed on first run.
 */
export async function launchBrowserWithFallback(
  browserType: typeof chromium | typeof firefox | typeof webkit = chromium,
  options: Parameters<typeof chromium.launch>[0] = {}
): Promise<Browser> {
  const browserName = browserType === chromium ? "chromium" : browserType === firefox ? "firefox" : "webkit";

  try {
    return await gatedLaunch(() => browserType.launch(options), onBrowserGone);
  } catch (error) {
    // Never on the hosted server: see the same test in CBrowser.launch.
    if (isBrowserNotInstalledError(error) && !isHostedMode()) {
      // Attempt automatic installation
      const installed = await installPlaywrightBrowsers(browserName);
      if (installed) {
        // Retry launch after installation
        try {
          return await browserType.launch(options);
        } catch (retryError) {
          throw new Error(
            `Browser launch failed after installation. ` +
            `This may indicate a system configuration issue.\n\n` +
            `Original error: ${retryError instanceof Error ? retryError.message : String(retryError)}`
          );
        }
      } else {
        // Installation failed - provide actionable instructions
        throw new Error(getBrowserInstallErrorMessage(browserName));
      }
    } else {
      // Not a browser installation error - re-throw
      throw error;
    }
  }
}

/**
 * The clickables a failure message may offer: visible ones (getAvailableClickables
 * already filters) that have an accessible name. A nameless control cannot be
 * clicked by its text, so listing it as `BUTTON: ""` only adds noise. The click
 * suggestion and the `availableElements` beside it are both built from this one
 * list; they used to come from two different page scans and disagreed. (v5 B25)
 */
export function namedClickables<T extends { text: string }>(list: T[]): T[] {
  return list.filter((e) => e.text.trim() !== "");
}

/**
 * Compress a Playwright error for a tool response.
 *
 * Playwright appends a "Call log:" listing every retry, which for a click that
 * waits out its timeout runs to dozens of near-identical lines and roughly 4k
 * tokens. The first lines say what failed and the last say how it ended; the
 * middle is the same line repeated. Keep both ends, drop the middle, and say how
 * much was dropped so nobody wonders what they are not seeing. (2026-07-29)
 */
export function summarizePlaywrightError(message: string, headLines = 6, tailLines = 4): string {
  const lines = message.split("\n");
  if (lines.length <= headLines + tailLines + 2) return message;
  const dropped = lines.length - headLines - tailLines;
  return [
    ...lines.slice(0, headLines),
    `  … ${dropped} more lines of Playwright retry log elided (set verbose for the full log) …`,
    ...lines.slice(-tailLines),
  ].join("\n");
}

/**
 * One main-frame navigation of `page`, read as the egress gate saw it.
 *
 * On the hosted server every browser is started behind the egress gate
 * (egress-gate.ts), and a page the gate does not carry reaches the browser as
 * a proxy's answer. Measured 2026-11-12 with Playwright 1.64.1, per engine:
 *
 *  - https (a CONNECT the gate answered 403 or 502): goto rejects with
 *    "net::ERR_TUNNEL_CONNECTION_FAILED at <the URL asked for>" in chromium,
 *    "NS_ERROR_PROXY_FORBIDDEN" or "NS_ERROR_PROXY_BAD_GATEWAY" in firefox,
 *    and "Download is starting" in webkit.
 *  - plain http: goto resolves with the gate's 403 or 502 as the page in
 *    chromium and webkit; firefox resolves with the 403 and rejects the
 *    empty 502 with "NS_ERROR_NET_ERROR_RESPONSE".
 *
 * None of these says which host failed or why, so the gate is asked
 * (ProxyForwarder.failure). A rejection asks about the last main-frame
 * navigation request the page made during `go`: every engine reports each
 * hop of a redirect as a request before it reports the failure, so after a
 * redirect that is the host that failed and not the one asked for. A
 * response is the gate's own answer when it came over plain http and carries
 * the gate's mark, and the mark's value is the reason. The gate removes the
 * header from every answer a plain-http site sends, so the mark alone says
 * the gate wrote it. The record is not asked there: it is one entry per host
 * and port for all of this browser's requests, so another request to the
 * same host carried in the meantime deletes it, and a later failure of
 * another request replaces it (gate-3, second review of 2026-11-12). Inside
 * https a site can send the header itself, so there the mark is never read.
 *
 * "refused" and "unreachable" become an EgressNavigationError with a plain
 * sentence. "upstream" (the configured proxy failed) keeps what the caller
 * said before: a rejection is passed on as it is, and a plain-http answer,
 * which used to come back as a loaded page, is rejected in the words
 * chromium uses for the same failure of an https page, so the caller's proxy
 * text applies to both. The gate's 400 ("bad-request", a request it could
 * not send on) is rejected in those words too, as chromium reports the same
 * answer to an https CONNECT. A rejection with no record goes back
 * untouched, and so does an unmarked response. Playwright's own time limit is
 * never read as the gate's: a record there could only be an older one.
 *
 * Without a gate (not hosted, or a socks proxy) this is `go()` and nothing
 * else: no listener is added to the page.
 */
export async function gotoThroughGate<T extends Response | null>(gate: GateRecord | null | undefined, page: Page, url: string, go: () => Promise<T>): Promise<T> {
  if (!gate || typeof gate.failure !== "function") return go();
  let last = url;
  // Called by the browser for every request of the page. It must not throw:
  // a request without a frame (a service worker's) throws from frame().
  const onRequest = (request: Request): void => {
    try {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) last = request.url();
    } catch { /* not this page's navigation */ }
  };
  page.on("request", onRequest);
  try {
    let response: T;
    try {
      response = await go();
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw (timedOut ? null : gateNavigationError(gate, last, url)) ?? error;
    }
    if (!response) return response;
    const answeredFor = response.url();
    if (!/^http:/i.test(answeredFor)) return response;
    const mark = response.headers()[EGRESS_HEADER.toLowerCase()];
    if (!mark) return response;
    const refusal = markedNavigationError(mark, answeredFor, url) ?? new Error(`net::ERR_TUNNEL_CONNECTION_FAILED at ${answeredFor}`);
    // The gate's text is not a page to take a screenshot of or to extract from.
    await page.goto("about:blank", { timeout: 5000 }).catch(() => { /* the failure below is what matters */ });
    throw refusal;
  } finally {
    page.off("request", onRequest);
  }
}

/**
 * A copy of `s` that shares no memory with the string it was cut from. V8 keeps
 * a slice of a long string as a view onto the original, so storing a short
 * slice keeps the whole original alive.
 */
export function copyString(s: string): string {
  return Buffer.from(s, "utf8").toString("utf8");
}

/** Decode at most `maxBytes` of a UTF-8 buffer, dropping a character cut in half. */
export function decodeUtf8Prefix(buf: Buffer, maxBytes: number): string {
  if (buf.length <= maxBytes) return buf.toString("utf8");
  let end = maxBytes;
  // Back up over continuation bytes so the cut lands on a character boundary.
  while (end > 0 && (buf[end]! & 0xc0) === 0x80) end--;
  return buf.subarray(0, end).toString("utf8");
}

/** `s` kept to at most `maxBytes` of UTF-8, as a fresh string, and whether it was cut. */
export function capUtf8(s: string, maxBytes: number): { text: string; truncated: boolean } {
  // Every UTF-16 unit is at most 3 bytes of UTF-8, so a short string needs no work.
  if (s.length * 3 <= maxBytes) return { text: s, truncated: false };
  if (s.length <= maxBytes && Buffer.byteLength(s) <= maxBytes) return { text: s, truncated: false };
  // maxBytes UTF-16 units encode to at least maxBytes bytes, so this covers the cut.
  return { text: decodeUtf8Prefix(Buffer.from(s.slice(0, maxBytes), "utf8"), maxBytes), truncated: true };
}

/** Headers kept to `maxBytes` of names and values in all; the rest are left out. */
export function capHeaders(headers: Record<string, string>, maxBytes: number): { headers: Record<string, string>; truncated: boolean } {
  const out: Record<string, string> = {};
  let left = maxBytes;
  let truncated = false;
  for (const [name, value] of Object.entries(headers)) {
    const cost = Buffer.byteLength(name) + Buffer.byteLength(value);
    if (cost <= left) {
      out[name] = value;
      left -= cost;
      continue;
    }
    truncated = true;
    const room = left - Buffer.byteLength(name);
    if (room > 0) {
      out[name] = capUtf8(value, room).text;
      left = 0;
    }
    break;
  }
  return { headers: out, truncated };
}

/** @internal */
export const MAX_URL_BYTES = 8 * 1024;
