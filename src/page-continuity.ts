/**
 * The page a CLI command acts on when no daemon is found (2026-11-08).
 *
 * Without a daemon every command is its own process with its own browser. The
 * persistent profile keeps cookies, localStorage and the last URL, and the
 * command reloads that URL, so what earlier commands did to the page itself
 * is gone: script variables, sessionStorage, scroll, typed input. Nothing
 * said so. Two `evaluate` calls looked like one page, and the second could
 * not see what the first set. When there was no saved page to reload
 * (--no-restore, --no-persistent, a new data dir, or over an hour since the
 * last command) the command ran on about:blank and exited 0, and the help
 * said --no-restore kept the page state.
 *
 * With a daemon these commands run on the daemon's page and none of this
 * applies. The daemon is found through the data dir (CBROWSER_DATA_DIR), so a
 * command run with a different one opens its own browser: the usual way an
 * agent's later shell call misses the daemon an earlier call started.
 */
import { parseNaturalLanguage } from "./analysis/natural-language.js";

/**
 * Commands that act on the page in front of them unless told a URL to open
 * first. `scroll` reaches here as `run` (rewriteScroll in cli.ts).
 */
export const PAGE_COMMANDS = [
  "click", "hover", "fill", "type", "press", "keyboard", "drag", "upload",
  "evaluate", "eval", "extract", "screenshot", "smart-click", "dismiss-overlay",
  "assert", "run",
];

const isUrlArg = (s: string): boolean => s.startsWith("http://") || s.startsWith("https://") || s.startsWith("www.");

/**
 * The URL a command opens before it acts: --url, screenshot's and extract's
 * first argument, or the URL of a `run` step that goes to one.
 */
export function openedUrl(command: string, args: string[], options: Record<string, unknown>): string | undefined {
  if (typeof options.url === "string") return options.url;
  if ((command === "screenshot" || command === "extract") && args[0] && isUrlArg(args[0])) return args[0];
  if (command === "run") {
    const step = parseNaturalLanguage(args.join(" "));
    if (step?.action === "navigate") return step.params.url;
  }
  return undefined;
}

/** Whether a command acts on the page in front of it rather than one it opens. */
export function actsOnCurrentPage(command: string, args: string[], options: Record<string, unknown>): boolean {
  if (!PAGE_COMMANDS.includes(command) || openedUrl(command, args, options) !== undefined) return false;
  // A `run` step the parser does not know fails with its own message.
  return command !== "run" || parseNaturalLanguage(args.join(" ")) !== null;
}

/** Why a new browser would have no page: what keeps it from reloading the saved one. */
export type BlankPageReason = "no-restore" | "no-persistent" | "nothing-saved";

/**
 * How to keep one page across commands. Only commands the daemon runs can use
 * it; the rest (assert, smart-click, a11y and others) refuse while it holds
 * the browser, so pointing them at it led to a second refusal.
 */
function keepThePage(command: string, dataDir: string, daemonRunsIt: boolean): string {
  if (!daemonRunsIt) return `${command} does not run in the daemon, so run the flow as one \`cbrowser test-suite\`, whose steps share one browser.`;
  return `start a daemon with \`cbrowser daemon start\` and run every command with the same CBROWSER_DATA_DIR (now ${dataDir}). If one is running under another data dir, use that value here.`;
}

/** The refusal for a page command that would run on about:blank. */
export function blankPageRefusal(command: string, reason: BlankPageReason, dataDir: string, daemonRunsIt: boolean): string {
  const why = {
    "no-restore": `--no-restore skips reloading the saved page, and with no daemon found for data dir ${dataDir} this command's browser is its own`,
    "no-persistent": "--no-persistent starts from an empty profile, with no saved page",
    // The page is saved when a command ends; one that stops on an error saves nothing.
    "nothing-saved": `there is no saved page in data dir ${dataDir}: a command saves its page when it ends without an error, and the saved page lasts an hour`,
  }[reason];
  return [
    `✗ No page to act on: ${command} would run on a blank page (about:blank), because ${why}.`,
    `  Give it a page with --url <url>. To keep one page across commands, ${keepThePage(command, dataDir, daemonRunsIt)}`,
    "  To run on a blank page on purpose: --url about:blank",
  ].join("\n");
}

/** Said when a command with no daemon found reloads the saved page. */
export function reloadNote(url: string, command: string, dataDir: string, daemonRunsIt: boolean): string {
  return [
    `ℹ No daemon found for data dir ${dataDir}, so this command opened its own browser and reloaded ${url}. Cookies and localStorage carry over; script variables, sessionStorage, scroll and typed input from earlier commands do not.`,
    `  To keep one page across commands, ${keepThePage(command, dataDir, daemonRunsIt)}`,
  ].join("\n");
}
