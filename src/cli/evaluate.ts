/**
 * The evaluate (eval) command.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { CBrowser } from "../browser.js";
import { evaluateScriptRefusal } from "../security/script-gate.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateScript } from "../eval-script.js";
import { allowedFlags } from "./flags.js";
import { timeoutOption } from "./options.js";

// =========================================================================
// evaluate — run JavaScript in the page
// =========================================================================

/** Flags `evaluate` understands; anything else is rejected rather than ignored. */
const EVALUATE_FLAGS = allowedFlags("evaluate");

/**
 * `--force` is a bare flag, but the parser gives any flag the next non-flag
 * word as its value, so `evaluate --force "document.title"` reads the SCRIPT as
 * the value of --force and leaves no script. The gate would refuse it anyway
 * (only `true` opens it); this says why instead of a confusing refusal.
 */
function rejectForceValue(options: Record<string, string | boolean>): void {
  if (typeof options.force === "string") {
    console.error(`Error: --force takes no value, so "${options.force}" was read as one.`);
    console.error('  Put the script first: cbrowser evaluate "<javascript>" --force');
    process.exit(1);
  }
}

/**
 * Collect a repeatable flag's values.
 *
 * parseArgs keeps only the last value for a repeated flag, so `--arg` is
 * re-read from argv here. Without this, `--arg 1 --arg 2` would silently pass
 * a single argument.
 */
function repeatedFlag(name: string): string[] {
  const values: string[] = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${name}` && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) {
      values.push(argv[i + 1]);
      i++;
    }
  }
  return values;
}


/**
 * Run JavaScript in the page.
 *
 * The bare `evaluate "<js>"` form is unchanged. Everything else is additive:
 * a script from a file (shell quoting mangles multi-line scripts), JSON
 * arguments (so a script is reusable instead of string-interpolated), an
 * explicit output mode, and an assertion mode for CI.
 */
interface PreparedEvaluate {
  script: string;
  evalArgs: unknown[];
  /** Selector to wait for before evaluating, and how long. */
  waitFor?: string;
  waitMs: number;
}

/**
 * Validate evaluate's flags and build the script, its arguments and the wait.
 * Exits with a message on any error. Shared by the local path and the daemon
 * route so they cannot drift: before 2026-10-21 the daemon route sent only the
 * script, so --arg, --url, --wait-for, --timeout, --raw, --json and
 * --expect-truthy did nothing when a daemon was running, and an
 * --expect-truthy CI check passed on a falsy result.
 */
export async function prepareEvaluate(
  args: string[],
  options: Record<string, string | boolean>,
): Promise<PreparedEvaluate> {
  const unknown = Object.keys(options).filter((f) => !EVALUATE_FLAGS.has(f));
  if (unknown.length > 0) {
    console.error(`Error: 'evaluate' does not support ${unknown.map((f) => `--${f}`).join(", ")}`);
    console.error(`  Supported: ${[...EVALUATE_FLAGS].map((f) => `--${f}`).join(" ")}`);
    process.exit(1);
  }

  if (options.json === true && options.raw === true) {
    console.error("Error: --json and --raw are mutually exclusive - pick one");
    process.exit(1);
  }
  rejectForceValue(options);

  const fromFile = typeof options.file === "string";
  if (fromFile && args[0]) {
    console.error("Error: pass the script as an argument OR --file, not both");
    process.exit(1);
  }

  let script: string;
  if (fromFile) {
    const path = resolve(options.file as string);
    if (!existsSync(path)) {
      console.error(`Error: script file not found: ${path}`);
      process.exit(1);
    }
    script = readFileSync(path, "utf-8");
  } else if (args[0]) {
    script = args[0];
    // The URL goes in --url, not positionally, and getting that wrong used to
    // produce a baffling error instead of a useful one: "https://example.com"
    // compiles as the label `https:` followed by `//example.com` as a comment,
    // which swallows the rest of the generated line and reports
    // `SyntaxError: Unexpected token '}'` from deep inside the page. Nothing in
    // that message points at the real mistake. (2026-07-29)
    if (/^https?:\/\/\S+$/i.test(script.trim())) {
      console.error(`Error: that looks like a URL, not JavaScript: ${script.trim()}`);
      console.error(`  The script is the positional argument; the page goes in --url:`);
      console.error(`    cbrowser evaluate "document.title" --url "${script.trim()}"`);
      process.exit(1);
    }
  } else {
    console.error('Usage: cbrowser evaluate "<javascript>" | --file <path>');
    console.error("  Run 'cbrowser help evaluate' for options");
    process.exit(1);
  }

  // Arguments arrive as JSON so types survive: --arg 3 is a number, --arg '"3"'
  // is a string. A malformed value names itself rather than reaching the page.
  const rawArgs = repeatedFlag("arg");
  const evalArgs = rawArgs.map((raw, i) => {
    try {
      return JSON.parse(raw);
    } catch {
      console.error(`Error: --arg #${i + 1} is not valid JSON: ${raw}`);
      console.error(`  Strings need quotes the shell will keep, e.g. --arg '"text"'`);
      process.exit(1);
    }
  });

  // Red zone, refused before the page is touched: no navigation, no wait, no
  // script. A script can click what click refuses (src/security/script-gate.ts).
  const refusal = evaluateScriptRefusal(options.force === true);
  if (refusal) {
    console.error(`✗ ${refusal}`);
    console.error("  Re-run with --force to run it anyway.");
    process.exit(1);
  }
  // Said on stderr so stdout stays exactly the result (--raw / --json pipes).
  console.error("⚠ Red zone: running caller-supplied page script (--force)");


  const waitFor = typeof options["wait-for"] === "string" ? options["wait-for"] : undefined;
  let waitMs = 30_000;
  if (waitFor) {
    const { getDefaultConfig } = await import("../config.js");
    const configuredMs = getDefaultConfig().timeout ?? 30_000;
    waitMs = typeof options.timeout === "number" ? options.timeout : timeoutOption(options.timeout, configuredMs);
    if (!Number.isFinite(waitMs) || waitMs <= 0) {
      console.error(`Error: --timeout must be a positive number of milliseconds, got: ${options.timeout}`);
      process.exit(1);
    }
  }
  return { script, evalArgs, waitFor, waitMs };
}

/** Print an evaluate result the same way for the local path and the daemon. */
export function printEvaluateResult(result: unknown, options: Record<string, string | boolean>): void {
  if (options.raw === true) {
    console.log(String(result));
  } else if (options.json === true) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    // Legacy default, kept so the existing one-arg form behaves identically.
    console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
  }

  if (options["expect-truthy"] === true && !result) {
    console.error(`✗ Expected a truthy result, got ${JSON.stringify(result)}`);
    process.exit(1);
  }
}

export async function runEvaluate(
  browser: CBrowser,
  args: string[],
  options: Record<string, string | boolean>,
): Promise<void> {
  const prep = await prepareEvaluate(args, options);

  if (options.url) await browser.navigate(options.url as string);
  const page = await browser.getPage();

  if (prep.waitFor) {
    try {
      await page.waitForSelector(prep.waitFor, { timeout: prep.waitMs });
    } catch {
      console.error(`✗ Timed out waiting for selector: ${prep.waitFor} (after ${prep.waitMs}ms)`);
      process.exit(1);
    }
  }

  let result: unknown;
  try {
    result = await evaluateScript(page, prep.script, prep.evalArgs);
  } catch (e) {
    const error = e as Error;
    console.error(`✗ ${error.message}`);
    // The page-side stack is the part that says WHERE in the script it broke.
    if (error.stack) console.error(error.stack.split("\n").slice(1).join("\n"));
    process.exit(1);
  }

  printEvaluateResult(result, options);
}
