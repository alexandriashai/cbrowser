/**
 * A limit on the browsers tools start for themselves on the hosted server.
 *
 * Browser sessions (navigate, click, ...) are admitted and counted in
 * mcp-server-remote.ts. But about a dozen tools start a browser of their own
 * for one call (responsive_test, cross_browser_test, ab_comparison,
 * visual_regression, perf_baseline, agent_ready_audit, empathy_audit,
 * llms_txt_generate, structured_data_suggest, ...), and none of those went
 * through any count. The challenger review of 2026-11-16 found responsive_test
 * and cross_browser_test on the free tier: 30 calls in a burst held about 30
 * Chromiums, about 96 tasks each against a unit TasksMax of 1000, so one free
 * account could stop every other account's browsers from starting.
 *
 * Every launch outside a session now passes gatedLaunch: a share per account
 * (the same buckets as sessions) and a total for the process. The slot is held
 * from launch until the browser disconnects or its context closes, whichever
 * way the tool ends (close, crash, kill). Not hosted (CLI, stdio server,
 * library) nothing is counted.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { isHostedMode } from "./mcp-tools/hosted-inputs.js";

/** Browsers that belong to a hosted session: admitted and counted there, not here. */
const sessionBrowsers = new WeakSet<object>();

export function markSessionBrowser(browser: object): void {
  sessionBrowsers.add(browser);
}

export function isSessionBrowser(browser: object): boolean {
  return sessionBrowsers.has(browser);
}

const NO_BUCKET = "(none)";
let bucketOf: () => string | undefined = () => undefined;
let onRefuse: () => Promise<void> = async () => { /* nothing to refund */ };

/**
 * Set by the hosted server at start: whose share a launch counts against
 * (sessionBucket), and what to do before a refusal is thrown (refund the call).
 */
export function configureLaunchGate(opts: { bucket?: () => string | undefined; onRefuse?: () => Promise<void> }): void {
  if (opts.bucket) bucketOf = opts.bucket;
  if (opts.onRefuse) onRefuse = opts.onRefuse;
}

export function toolBrowserLimits(env: Record<string, string | undefined> = process.env): { perAccount: number; total: number } {
  const read = (name: string, fallback: number): number => {
    const n = parseInt(env[name] ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    perAccount: read("MAX_TOOL_BROWSERS_PER_ACCOUNT", 3),
    total: read("MAX_TOOL_BROWSERS", 6),
  };
}

const perBucket = new Map<string, number>();
let total = 0;

/** Tool browsers running now, in total or for one bucket. */
export function toolBrowserCount(bucket?: string): number {
  return bucket === undefined ? total : (perBucket.get(bucket) ?? 0);
}

export class ToolBrowserLimitError extends Error {
  constructor(scope: "account" | "process", open: number, limit: number) {
    super(scope === "account"
      ? `You already have ${open} browsers running for one-call tools (responsive_test, cross_browser_test and similar), the most one account runs at once. Try again when one of those calls has finished.`
      : `The server is running its limit of ${limit} browsers for one-call tools for all accounts right now. Try again in a minute.`);
    this.name = "ToolBrowserLimitError";
  }
}

/** Check and count in one synchronous step; returns the release, safe to call twice. */
function acquire(): (() => void) | ToolBrowserLimitError {
  const limits = toolBrowserLimits();
  const bucket = bucketOf() ?? NO_BUCKET;
  const mine = perBucket.get(bucket) ?? 0;
  if (bucket !== NO_BUCKET && mine >= limits.perAccount) return new ToolBrowserLimitError("account", mine, limits.perAccount);
  if (total >= limits.total) return new ToolBrowserLimitError("process", total, limits.total);
  perBucket.set(bucket, mine + 1);
  total++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    total--;
    const left = (perBucket.get(bucket) ?? 1) - 1;
    if (left > 0) perBucket.set(bucket, left);
    else perBucket.delete(bucket);
  };
}

/**
 * Launch through the gate. `watch` attaches the release to whatever ends the
 * launched thing (a Browser's "disconnected", a BrowserContext's "close").
 * Not hosted, it only launches.
 */
export async function gatedLaunch<T>(launch: () => Promise<T>, watch: (launched: T, release: () => void) => void): Promise<T> {
  if (!isHostedMode()) return launch();
  const got = acquire();
  if (got instanceof ToolBrowserLimitError) {
    await onRefuse().catch(() => { /* a refund failure must not hide the refusal */ });
    throw got;
  }
  try {
    const launched = await launch();
    watch(launched, got);
    return launched;
  } catch (err) {
    got();
    throw err;
  }
}

/** Release on a Playwright Browser's "disconnected" (close, crash or kill). */
export function onBrowserGone(b: { on(event: "disconnected", cb: () => void): unknown }, release: () => void): void {
  b.on("disconnected", release);
}

/** Release on a BrowserContext's "close" (persistent contexts). */
export function onContextGone(c: { on(event: "close", cb: () => void): unknown }, release: () => void): void {
  c.on("close", release);
}
