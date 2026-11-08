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
 * last command), or it would not load, the command ran on a blank page and
 * exited 0, and the help said --no-restore kept the page state.
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

/** Whether `capture start` has an end of its own; an open-ended one lives in the daemon. */
export function isBoundedCapture(options: Record<string, unknown>): boolean {
  return options.duration !== undefined || options["until-element"] !== undefined
    || options["until-element-gone"] !== undefined || options["until-idle"] !== undefined;
}

/**
 * The forms of a11y, perf, visual, session and capture that act on the page in
 * front of them unless given a URL: where their URL argument is (a position;
 * null for --url only), or undefined for a form that is not one. An audit or
 * baseline of about:blank scored 100 or saved a blank image. A form missing
 * the name it needs is left to its usage error, and an open-ended capture to
 * its own (it needs the daemon).
 */
function pageFormUrlArg(command: string, args: string[], options: Record<string, unknown>): number | null | undefined {
  const sub = args[0];
  switch (command) {
    case "a11y": return sub === "audit" ? 1 : undefined;
    // perf audit [url], and perf [url]
    case "perf": return sub === "audit" ? 1 : 0;
    case "visual": return (sub === "save" || sub === "compare") && args[1] ? null : undefined;
    case "session": return sub === "save" && args[1] ? null : undefined;
    case "capture": return sub === "start" && isBoundedCapture(options) ? 1 : undefined;
    default: return undefined;
  }
}

/** The command as the user would say it: `a11y audit` for a page subcommand. */
export function pageCommandName(command: string, args: string[], options: Record<string, unknown> = {}): string {
  const form = pageFormUrlArg(command, args, options);
  if (form === undefined || (command === "perf" && args[0] !== "audit")) return command;
  return `${command} ${args[0]}`;
}

const isUrlArg = (s: string): boolean => s.startsWith("http://") || s.startsWith("https://") || s.startsWith("www.");

/**
 * The URL a command opens before it acts: --url, screenshot's and extract's
 * first argument, a page subcommand's URL argument, or the URL of a `run`
 * step that goes to one.
 */
export function openedUrl(command: string, args: string[], options: Record<string, unknown>): string | undefined {
  if (typeof options.url === "string") return options.url;
  if ((command === "screenshot" || command === "extract") && args[0] && isUrlArg(args[0])) return args[0];
  const at = pageFormUrlArg(command, args, options);
  if (typeof at === "number" && args[at]) return args[at];
  if (command === "run") {
    const step = parseNaturalLanguage(args.join(" "));
    if (step?.action === "navigate") return step.params.url;
  }
  return undefined;
}

/** Whether a command acts on the page in front of it rather than one it opens. */
export function actsOnCurrentPage(command: string, args: string[], options: Record<string, unknown>): boolean {
  const isPageCommand = PAGE_COMMANDS.includes(command) || pageFormUrlArg(command, args, options) !== undefined;
  if (!isPageCommand || openedUrl(command, args, options) !== undefined) return false;
  // A `run` step the parser does not know fails with its own message.
  return command !== "run" || parseNaturalLanguage(args.join(" ")) !== null;
}

/** Why a new browser would have no page: what keeps it from reloading the saved one. */
export type BlankPageReason = "no-restore" | "no-persistent" | "nothing-saved";

/**
 * How a command can keep one page across commands. The daemon runs the
 * interaction commands. assert, smart-click and dismiss-overlay refuse while
 * it holds the browser but run as test-suite steps. The rest (a11y audit,
 * perf, visual, session save, a bounded capture, explore...) refuse there or
 * run in a browser of their own, and test the page they are given. Pointing
 * those at the daemon led to a second refusal, or to a blank capture.
 */
export type KeepPageAdvice = "daemon" | "test-suite" | "url";

export function keepPageAdvice(command: string, daemonRunsIt: boolean): KeepPageAdvice {
  if (daemonRunsIt) return "daemon";
  return PAGE_COMMANDS.includes(command) ? "test-suite" : "url";
}

function keepThePage(name: string, dataDir: string, advice: KeepPageAdvice): string {
  switch (advice) {
    case "daemon":
      return `To keep one page across commands, start a daemon with \`cbrowser daemon start\` and run every command with the same CBROWSER_DATA_DIR (now ${dataDir}). If one is running under another data dir, use that value here.`;
    case "test-suite":
      return `${name} does not run in the daemon; to keep one page across steps, run the flow as one \`cbrowser test-suite\`.`;
    case "url":
      return `${name} does not run in the daemon; give it the URL of the page it should act on.`;
  }
}

/** The refusal for a page command that would run on about:blank. */
export function blankPageRefusal(name: string, reason: BlankPageReason, dataDir: string, advice: KeepPageAdvice): string {
  const why = {
    "no-restore": `--no-restore skips reloading the saved page, and with no daemon found for data dir ${dataDir} this command's browser is its own`,
    "no-persistent": "--no-persistent starts from an empty profile, with no saved page",
    // The page is saved when a command ends; one that stops on an error saves nothing.
    "nothing-saved": `there is no saved page in data dir ${dataDir}: a command saves its page when it ends without an error, and the saved page lasts an hour`,
  }[reason];
  // "url" advice says what the first sentence already does.
  const keep = advice === "url" ? "" : ` ${keepThePage(name, dataDir, advice)}`;
  return [
    `✗ No page to act on: ${name} would run on a blank page (about:blank), because ${why}.`,
    `  Give it a page with --url <url>.${keep}`,
    "  To run on a blank page on purpose: --url about:blank",
  ].join("\n");
}

/** Said when a command with no daemon found reloads the saved page. */
export function reloadNote(url: string, name: string, dataDir: string, advice: KeepPageAdvice): string {
  return [
    `ℹ No daemon found for data dir ${dataDir}, so this command opened its own browser and reloaded ${url}. Cookies and localStorage carry over; script variables, sessionStorage, scroll and typed input from earlier commands do not.`,
    `  ${keepThePage(name, dataDir, advice)}`,
  ].join("\n");
}

/**
 * Why a page command stops when the saved page does not load: the browser is
 * left on its own blank error page, and the command used to act on that and
 * exit 0.
 */
export function restoreFailedMessage(url: string, name: string, error: Error): string {
  const reason = (error?.message || String(error)).split("\n")[0].trim();
  return `Could not reload the saved page ${url} (${reason}), so ${name} would run on a blank page instead. Check that the page is up, or give it one with --url <url>.`;
}
