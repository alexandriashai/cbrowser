/**
 * cli-args.ts — argv parsing for the CLI.
 *
 * Extracted from cli.ts so it can be unit-tested: cli.ts runs `main()` at the
 * top level, so importing it from a test executes the CLI.
 */

export interface ParsedArgs {
  command: string;
  args: string[];
  options: Record<string, string | boolean>;
}

/**
 * Parse argv into a command, positional args, and options.
 *
 * NEGATIVE FLAGS: `--no-x` sets options["no-x"] = true AND options.x = false.
 *
 * Setting both is deliberate. Before 2026-07-27 only options["no-x"] was set,
 * so a reader written as `options.x !== false` never saw the flag. Measured
 * across the four documented negative flags:
 *
 *   --no-color      reads options["no-color"]   worked
 *   --no-vision     reads options["no-vision"]  worked
 *   --no-persistent reads options.persistent    SILENTLY IGNORED
 *   --no-restore    reads options.restore       SILENTLY IGNORED
 *
 * The two that were broken are both opt-outs for persisted browser state, so
 * state the user explicitly asked to discard was kept instead:
 * `cbrowser cookie list --no-persistent` still returned cookies out of the
 * persistent profile. Writing both keys fixes those two without disturbing the
 * two that already worked.
 */
export function parseArgs(args: string[], booleanFlags: ReadonlySet<string> = BOOLEAN_FLAGS): ParsedArgs {
  const command = args[0] || "help";
  const restArgs: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--") && args[i].length > 2) {
      const body = args[i].slice(2);
      const eq = body.indexOf("=");

      if (eq > 0) {
        // `--max-pages=50`: before 2026-10-21 this became a flag literally
        // named "max-pages=50", and the command ran with its default.
        const key = body.slice(0, eq);
        const value = body.slice(eq + 1);
        options[key] = booleanFlags.has(key) && (value === "true" || value === "false") ? value === "true" : value;
        continue;
      }

      const key = body;
      const next = args[i + 1];
      // A flag that never takes a value must not swallow the next word:
      // `screenshot --no-restore out.png` took "out.png" as the flag's value,
      // so restore stayed on and the path was lost (audit, 2026-10-21).
      const takesNoValue = booleanFlags.has(key) || key.startsWith("no-");

      if (!takesNoValue && next && !next.startsWith("--")) {
        options[key] = next;
        i++;
      } else {
        options[key] = true;
      }

      if (key.startsWith("no-") && key.length > 3) {
        options[key.slice(3)] = false;
      }
    } else {
      restArgs.push(args[i]);
    }
  }

  return { command, args: restArgs, options };
}

/**
 * Flags that never take a value. Each was checked against how the CLI reads
 * it (2026-10-21): every one is tested as a boolean and none is read as a
 * string. `--no-*` flags are always boolean and need no entry. A flag missing
 * from this list still works; it just takes the next word as its value, which
 * is what every flag did before.
 */
export const BOOLEAN_FLAGS: ReadonlySet<string> = new Set([
  "attention-overlay", "auto-apply", "capture", "clear", "comprehensive",
  "contact-sheet", "continue-on-failure", "dismiss-overlays", "dry-run",
  "expect-truthy", "force", "full-page", "fuzzy-match", "headless", "help",
  "html", "json", "json-output", "keep-config", "lightpanda", "offline",
  "persistent", "plain", "quiet", "raw", "record-video", "restore",
  "screenshot-on-failure", "stateful", "step-through", "text", "trace",
  "verbose", "verify", "version", "vision", "yes",
]);
