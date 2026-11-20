/**
 * The flag registry: which flags each command accepts, and the one validation
 * gate main() runs before any command.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */



// parseArgs moved to ./cli-args.ts so it can be unit-tested (cli.ts self-executes).


// =========================================================================
// Flag validation — one gate, before dispatch
// =========================================================================

/**
 * Flags accepted by every command, consumed by the shared browser setup in
 * main() rather than by any individual case.
 */
/**
 * Commands that act on the live page and would therefore be wrong to run
 * against a second browser while the daemon holds the first. Anything listed
 * here must either be daemon-routed or refuse to run.
 */
/** What `extract` can return (browser.extract). */
export const EXTRACT_KINDS = ["text", "links", "headings", "images", "forms"];

export const DRIVES_THE_PAGE = [
  "navigate", "click", "fill", "hover", "screenshot", "extract", "run",
  "keyboard", "press", "type", "evaluate", "eval", "drag", "upload",
  "smart-click", "dismiss-overlay", "assert",
  // These also launch the shared profile the daemon holds, so they acted on
  // a page the user was not watching or failed on its lock (audit
  // 2026-10-21). reset deleted the profile under the daemon, which wrote its
  // cookies back on exit.
  "script", "ai", "explore", "analyze", "generate", "hunt", "hunt-bugs",
  "chaos", "a11y", "perf", "visual", "reset",
];

/**
 * Flags the shared CBrowser construction consumes, for every command that uses
 * it. One list, spread into each command's set below: when this list was copied
 * into each set, --viewport (2026-10-21) reached some commands and was refused
 * by evaluate and keyboard.
 */
const SHARED_BROWSER_FLAGS = [
  "url", "browser", "device", "viewport", "headless", "persistent", "restore",
  "locale", "timezone", "geo", "geo-region", "color-scheme", "dnt", "gpc", "verbose",
];

/**
 * Globals every command accepts. --plain and --json-output are the documented
 * output modes (src/output.ts); before 2026-10-21 the validated commands
 * rejected them.
 */
const GLOBAL_FLAGS = [...SHARED_BROWSER_FLAGS, "help", "no-color", "json", "plain", "json-output"];

/**
 * Declared options per command.
 *
 * This exists because "accepted and ignored" showed up eight times in this
 * build - each time a flag reached a code path that never read it, and the
 * command cheerfully exited 0. Per-command vigilance did not hold, so the rule
 * moved here: argv is validated against the command's declared set BEFORE
 * dispatch, and an undeclared flag never reaches an execution path.
 *
 * Commands absent from this map are not validated yet; see UNVALIDATED_REASON.
 * Lists for the large pre-existing commands are supersets derived from the
 * flags their case blocks actually read - deliberately permissive, since a
 * false rejection of a working flag would be a worse defect than the one being
 * fixed. They are still tight enough to catch a typo or an invented flag.
 */
const COMMAND_FLAGS: Record<string, string[]> = {
  capture: [
    "fps", "duration", "format", "out", "name", "quality", "max-frames",
    "viewport", "region", "element", "element-padding", "contact-sheet",
    "attention-overlay", "overlay-persona", "overlay-goal",
    "after", "after-element", "after-delay",
    "until-element", "until-element-gone", "until-idle", "timeout",
  ],
  // Declared so a mistyped flag errors instead of being silently ignored --
  // this command deletes credentials, so "--kep-config did nothing" is a bad
  // way to find out.
  uninstall: ["yes", "keep-config"],
  evaluate: ["file", "arg", "json", "raw", "wait-for", "timeout", "expect-truthy", "force"],
  eval: ["file", "arg", "json", "raw", "wait-for", "timeout", "expect-truthy", "force"],
  keyboard: ["delay", "selector", "hold", "repeat", "text", "force"],
  // test-suite and cognitive-journey list only the flags their code reads
  // (measured 2026-10-21). They used to declare every report command's flags,
  // so `test-suite --persona x` passed validation and did nothing.
  ask: ["context", "json"],
  "test-suite": [
    "capture", "capture-fps", "capture-format", "capture-out",
    "continue-on-failure", "dry-run", "fuzzy-match", "html", "inline", "output",
    "screenshot-on-failure", "step-through", "timeout",
  ],
  "cognitive-journey": [
    "capture", "capture-fps", "capture-format", "capture-out",
    "goal", "persona", "start", "max-steps", "max-time", "no-vision", "output",
    "geolocation", "trace", "replay-trace",
  ],
};

/**
 * Why the rest are not covered yet: cbrowser has ~90 commands whose flag sets
 * are not declared anywhere machine-readable, and inventing a list for a
 * command I have not exercised risks rejecting a flag that works today. Each
 * entry above was derived from that command's own code and then exercised.
 * Extending coverage is one line per command plus a run to confirm it.
 */
const UNVALIDATED_REASON =
  "not yet declared - see COMMAND_FLAGS in src/cli.ts";

/**
 * Reject undeclared flags before the command runs.
 *
 * Fails on the FIRST invalid flag with the command's full accepted set, so a
 * typo is a one-command fix rather than a guessing game.
 */
/**
 * Every flag a validated command accepts: its declared flags, the globals, and
 * both halves of each on/off pair. The parser turns --no-x into "no-x" and
 * "x"=false, so declaring either half must accept both; before 2026-10-21
 * --no-color failed with "does not support --color", a flag the user never
 * typed. The capture, evaluate and keyboard gates read this same set, so one
 * command line can no longer pass one gate and fail the other.
 */
export function allowedFlags(command: string): Set<string> {
  const allowed = new Set([...(COMMAND_FLAGS[command] ?? []), ...GLOBAL_FLAGS]);
  for (const flag of [...allowed]) {
    if (flag.startsWith("no-")) allowed.add(flag.slice(3));
    else allowed.add(`no-${flag}`);
  }
  return allowed;
}

export function validateCommandFlags(command: string, options: Record<string, string | boolean>): void {
  const declared = COMMAND_FLAGS[command];
  if (!declared) return; // UNVALIDATED_REASON

  const allowed = allowedFlags(command);
  const unknown = Object.keys(options).filter((flag) => !allowed.has(flag));
  if (unknown.length === 0) return;

  for (const flag of unknown) {
    const hint = flag.startsWith("record")
      ? " (did you mean --capture?)"
      : flag.startsWith("capture") ? " (capture options are --capture, --capture-fps, --capture-format, --capture-out)" : "";
    console.error(`Error: '${command}' does not support --${flag}${hint}`);
  }
  console.error(`  Accepted: ${[...declared].sort().map((f) => `--${f}`).join(" ")}`);
  console.error(`  Plus globals: ${GLOBAL_FLAGS.map((f) => `--${f}`).join(" ")}`);
  process.exit(1);
}

// Commands that drive the page. When a daemon holds the browser these MUST
// go through it: run locally and they open a second browser, drive a
// different page, and report success for work the user cannot see - which is
// exactly what `keyboard` did during a live capture. drag and upload were
// refused while a daemon ran (DRIVES_THE_PAGE below) until 2026-11-08, so a
// flow that kept its page in the daemon could not drag or upload on it.
export const INTERACTION_COMMANDS = [
  "navigate", "click", "fill", "hover", "screenshot", "extract", "run",
  "keyboard", "press", "type", "evaluate", "eval", "drag", "upload",
];
