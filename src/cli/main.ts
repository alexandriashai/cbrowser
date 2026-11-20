/**
 * The CLI's main(): global flag handling, the commands that run before a
 * browser exists, the daemon route, the browser setup, and the dispatch to the
 * command groups in ./commands/.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { CBrowser } from "../browser.js";
import { parseArgs } from "../cli-args.js";
import { startMcpServer } from "../mcp-server.js";
import { startRemoteMcpServer } from "../mcp-server-remote.js";
import { isDaemonRunning } from "../daemon.js";
import { isColorScheme, localeTag, privacyFlag, getStatusInfo, formatStatus, getDataDir } from "../config.js";
import { guardTerminalOutput, guardConsole, setTerminalHyperlinks } from "../terminal-safe.js";
import { printEnterpriseStatus } from "../stealth/index.js";
import { VERSION } from "../version.js";
import { keepPageAdvice, pageCommandName, actsOnCurrentPage, blankPageRefusal, restoreFailedMessage, reloadNote } from "../page-continuity.js";
import { detectOutputOptions, setOutputOptions, installOutputWrappers, emitJsonFallback } from "../output.js";
import { resolveDevicePreset } from "./capture.js";
import { runDoctor } from "./doctor.js";
import { validateCommandFlags, DRIVES_THE_PAGE, INTERACTION_COMMANDS } from "./flags.js";
import { showCommandHelp, showHelp } from "./help.js";
import { rewriteScroll, parseGeoLocation, parseViewportList } from "./options.js";
import type { CommandContext, PreBrowserContext } from "./context.js";
import { runAskCommand } from "./commands/ask.js";
import { runConfigCommand, runUninstallCommand, runInstallSkillCommand } from "./commands/setup.js";
import { runDaemonCommand, routeToDaemon } from "./commands/daemon.js";
import { runInteractionCommand } from "./commands/interaction.js";
import { runAutomationCommand } from "./commands/automation.js";
import { runCognitiveCommand } from "./commands/cognitive.js";
import { runPersonaCommand } from "./commands/persona.js";
import { runSessionCommand } from "./commands/session.js";
import { runNetworkCommand } from "./commands/network.js";
import { runPerformanceCommand } from "./commands/performance.js";
import { runVisualCommand } from "./commands/visual.js";
import { runRecordingCommand } from "./commands/recording.js";
import { runTestingCommand } from "./commands/testing.js";
import { runAuditCommand } from "./commands/audits.js";

/** The command groups main() dispatches to, each owning its own case labels. */
const COMMAND_GROUPS: ((ctx: CommandContext) => Promise<boolean>)[] = [
  runInteractionCommand,
  runAutomationCommand,
  runCognitiveCommand,
  runPersonaCommand,
  runSessionCommand,
  runNetworkCommand,
  runPerformanceCommand,
  runVisualCommand,
  runRecordingCommand,
  runTestingCommand,
  runAuditCommand,
];

export async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const { command, args, options } = rewriteScroll(parsed);

  // Initialize accessible output system (v18.54.0)
  const outputOpts = detectOutputOptions(options);
  setOutputOptions(outputOpts);
  installOutputWrappers();
  // Page-derived text (console messages, titles, extracted text) reaches stdout in
  // many places; escape sequences and bidi overrides in it come out as visible
  // escapes instead of acting on the terminal. (2026-10-12)
  guardTerminalOutput(process.stdout);
  guardTerminalOutput(process.stderr);
  guardConsole();
  // Every URL printed is a hyperlink to itself on a terminal (src/terminal-safe.ts):
  // never with --json, --json-output, --plain or TERM=dumb, and not when piped
  // unless CBROWSER_HYPERLINKS=1. CBROWSER_HYPERLINKS=0 turns them off. (2026-10-23)
  const linksEnv = process.env.CBROWSER_HYPERLINKS;
  const linksFor = (s: NodeJS.WriteStream) => linksEnv !== "0" && !outputOpts.plain && options.json !== true
    && process.env.TERM !== "dumb" && (linksEnv === "1" || s.isTTY === true);
  setTerminalHyperlinks({ stdout: linksFor(process.stdout), stderr: linksFor(process.stderr) });
  // After the guards, so a note quoting the user's own words is escaped too.
  for (const note of parsed.notes ?? []) console.error(`Note: ${note}`);

  // --json-output must never leave stdout empty. Only two commands in this file
  // call emitJson, so without this every other command printed nothing at all and
  // still exited 0 — a CI step piping to jq saw empty input beside a success code.
  // An exit hook rather than a call after main(): the command paths below exit
  // through ~20 separate process.exit() sites, and a hook covers all of them.
  if (outputOpts.json) {
    process.on("exit", () => emitJsonFallback(command ?? "unknown", VERSION));
  }

  // `--help`/`-h` are aliases for `help`, matching how `--version`/`-v` alias
  // `version` below. `help <command>` and `<command> --help` both narrow to a
  // single section rather than dumping the whole manual.
  const isHelpCommand = command === "help" || command === "--help" || command === "-h";
  if (isHelpCommand || options.help) {
    const topic = isHelpCommand
      ? args[0] ?? (typeof options.help === "string" ? options.help : undefined)
      : command;

    if (topic) {
      process.exit(showCommandHelp(topic) ? 0 : 1);
    }
    showHelp();
    process.exit(0);
  }

  // One gate for every command in the registry, before anything executes.
  validateCommandFlags(command, options);

  // --color-scheme takes the CSS prefers-color-scheme values. Checked here, so
  // every command (daemon start included) refuses a bad one before a browser
  // opens; Playwright would otherwise fail at launch with its own wording.
  if (options["color-scheme"] !== undefined && !isColorScheme(options["color-scheme"])) {
    const got = options["color-scheme"] === true ? "no value" : `"${options["color-scheme"]}"`;
    console.error(`Error: --color-scheme must be light, dark or no-preference, got ${got}`);
    process.exit(1);
  }
  const colorScheme = isColorScheme(options["color-scheme"]) ? options["color-scheme"] : undefined;
  // The flag sets what CBROWSER_COLOR_SCHEME sets, for this run (and wins over
  // the config file, as the env var does). Every CBrowser reads the env when it
  // is built (mergeConfig), so this one line reaches the shared browser, the
  // daemon's, test-suite's and the library functions that launch their own
  // (visual, responsive, ab, perf, flaky, coverage...): none of them can accept
  // the flag and ignore it.
  if (colorScheme) process.env.CBROWSER_COLOR_SCHEME = colorScheme;

  // --locale, the same way (2026-10-31): the library functions above build
  // their own browser and dropped the flag, so `diff --locale fr-FR` or
  // `responsive --locale fr-FR` ran in the default locale and exited 0. A value
  // that is no language tag ("german" passes BCP 47 and fails in Chromium), or
  // no value at all, is refused before a browser opens. The POSIX spelling
  // (en_US) is taken, as Playwright took it before.
  if (options.locale !== undefined) {
    const tag = typeof options.locale === "string" ? localeTag(options.locale) : undefined;
    if (!tag) {
      const got = typeof options.locale === "string" && options.locale.trim() ? `"${options.locale}"` : "no value";
      console.error(`Error: --locale must be a language tag such as en-US or fr-FR, got ${got}`);
      process.exit(1);
    }
    options.locale = tag;
    process.env.CBROWSER_LOCALE = tag;
  }

  // --dnt and --gpc (2026-11-02), the same way: each sets its env var for this
  // run, so every browser the command builds sends the signal. --no-dnt and
  // --no-gpc set it to 0, which beats a config file that turns it on. A bad
  // CBROWSER_DNT or CBROWSER_GPC is refused where a browser's config is built
  // (defaultPrivacySignals), before it opens; commands that open none, such as
  // doctor and ask, are not stopped by it.
  for (const [flag, envName] of [["dnt", "CBROWSER_DNT"], ["gpc", "CBROWSER_GPC"]] as const) {
    try {
      if (options[flag] !== undefined) {
        const on = privacyFlag(options[flag], `--${flag}`);
        if (on === undefined) throw new Error(`--${flag}=<value> must be 1 or 0 (or true or false), got no value`);
        options[flag] = on;
        process.env[envName] = on ? "1" : "0";
      }
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(1);
    }
  }

  // --geo-region (2026-11-02), the same way: it sets CBROWSER_GEO_REGION for
  // this run, and every browser's config resolves the region to its proxy
  // (getDefaultConfig), so no browser the command opens can leave from this
  // machine's IP. Until then only agent-ready-audit read it: navigate and the
  // daemon took the flag and exited 0 from the local IP.
  if (options["geo-region"] === false) {
    // --no-geo-region: no region for this run, whatever CBROWSER_GEO_REGION or
    // the config file says (defaultGeoRegion reads "none" as none).
    process.env.CBROWSER_GEO_REGION = "none";
  } else if (options["geo-region"] !== undefined) {
    const region = typeof options["geo-region"] === "string" ? options["geo-region"].trim() : "";
    if (!region) {
      console.error("Error: --geo-region needs a region name, e.g. --geo-region uk");
      process.exit(1);
    }
    // An unconfigured one is refused where a browser launches (CBrowser.launch,
    // proxyFor) and by daemon start, before any request.
    options["geo-region"] = region;
    process.env.CBROWSER_GEO_REGION = region;
  }

  // Doctor command - environment health check (v18.54.0)
  if (command === "doctor") {
    await runDoctor(outputOpts);
    // Honour the exit code runDoctor set. A hard exit(0) here made the failure
    // path unreachable from a shell no matter what the checks found.
    process.exit(process.exitCode ?? 0);
  }

  // What the commands that run before a browser exists read from main().
  const preCtx: PreBrowserContext = { command, args, options, colorScheme };

  if (command === "ask") {
    await runAskCommand(preCtx);
    return;
  }

  // MCP Server mode - runs before browser instantiation
  if (command === "mcp-server") {
    console.error("🔌 Starting CBrowser MCP Server...");
    await startMcpServer();
    return;
  }

  // Remote MCP Server mode - HTTP server for claude.ai connectors
  if (command === "mcp-remote") {
    if (options.port) process.env.PORT = String(options.port);
    if (options.host) process.env.HOST = String(options.host);
    if (options.stateful) process.env.MCP_SESSION_MODE = "stateful";
    await startRemoteMcpServer();
    return;
  }

  // Version command - just print version and exit
  if (command === "version" || command === "-v" || command === "--version") {
    console.log(VERSION);
    process.exit(0);
  }

  // Status command - runs before browser instantiation
  if (command === "status") {
    // VERSION is imported from version.ts which reads from package.json
    const info = await getStatusInfo(VERSION);
    console.log(formatStatus(info));
    console.log(""); // Blank line
    await printEnterpriseStatus();
    process.exit(0);
  }

  if (command === "config") {
    await runConfigCommand(preCtx);
    return;
  }

  if (command === "uninstall") {
    await runUninstallCommand(preCtx);
    return;
  }

  if (command === "install-skill" || command === "sync-skill") {
    await runInstallSkillCommand();
    return;
  }

  if (command === "daemon") {
    await runDaemonCommand(preCtx);
    return;
  }

  // Check if daemon is running and use it for supported commands
  const daemonRunning = await isDaemonRunning();

  if (daemonRunning && INTERACTION_COMMANDS.includes(command)) {
    await routeToDaemon(preCtx);
    return;
  }

  // An interaction command that is NOT routed would drive a second browser.
  // So would session save and load: save stored a blank page's session while
  // the daemon held the real one (2026-11-08).
  const sessionOpensPage = command === "session" && (args[0] === "save" || args[0] === "load");
  if (daemonRunning && !INTERACTION_COMMANDS.includes(command) && (DRIVES_THE_PAGE.includes(command) || sessionOpensPage)) {
    console.error(`Error: '${sessionOpensPage ? `session ${args[0]}` : command}' cannot run while the daemon holds the browser.`);
    console.error(`  It would launch a second browser and drive a different page,`);
    console.error(`  so its effects would not appear in a running capture.`);
    console.error(`  Stop the daemon first: cbrowser daemon stop`);
    process.exit(1);
  }

  // Parse browser type
  const browserType = options.browser === "firefox" ? "firefox"
    : options.browser === "webkit" ? "webkit"
    : "chromium";

  // Parse geolocation
  let geolocation = undefined;
  if (options.geo) {
    geolocation = parseGeoLocation(options.geo as string);
    if (!geolocation) {
      console.error(`Invalid geolocation: ${options.geo}`);
      console.error("Use a preset name (new-york, london, etc.) or lat,lon format");
      process.exit(1);
    }
  }

  // Default to persistent mode for session continuity between commands
  // Use --no-persistent to disable
  const persistentMode = options.persistent !== false && options.persistent !== "false";
  if (!persistentMode) {
    console.error("🔄 Persistent mode disabled");
  }

  // Default to headless for CLI usage, unless explicitly set to false
  const headless = options.headless !== false && options.headless !== "false";

  // --no-restore: skip session URL restoration (see the blank-page check below)
  const skipRestore = options.restore === false || options.restore === "false";

  // Device presets are validated before the browser is built, since that is
  // where the name is consumed - an unknown name is silently dropped there.
  if (command === "capture" && typeof options.device === "string") {
    options.device = resolveDevicePreset(options.device);
  }

  // --viewport WxH overrides the configured viewport for this invocation.
  let viewportOverride: { width: number; height: number } | undefined;
  if (typeof options.viewport === "string") {
    try {
      viewportOverride = parseViewportList(options.viewport)[0];
    } catch (e) {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(1);
    }
  }

  // Only what the user passed: an unset flag leaves the env var or config file
  // value in place (mergeConfig drops undefined keys too).
  const browser = new CBrowser({
    ...(options.browser !== undefined ? { browser: browserType } : {}),
    ...(options.headless !== undefined ? { headless } : {}),
    device: options.device as string,
    ...(viewportOverride ? { viewportWidth: viewportOverride.width, viewportHeight: viewportOverride.height, viewportOverride } : {}),
    geolocation,
    locale: options.locale as string,
    timezone: options.timezone as string,
    ...(options["record-video"] !== undefined ? { recordVideo: options["record-video"] === true } : {}),
    persistent: persistentMode,
    skipSessionRestore: skipRestore,
    verbose: true,
  });

  // No daemon was found (a page command goes through it when one is), so this
  // browser is new and its page is the saved URL, reloaded, or about:blank
  // when there is none to reload. A command that acts on the page in front of
  // it is refused here, before anything launches, when that would be blank;
  // otherwise it says, when the reload happens, that what earlier commands
  // did to the page is not on it, or stops when it does not load
  // (src/page-continuity.ts). Only a bounded capture counts: it records in a
  // browser of its own, while an open-ended one goes to the daemon.
  const advice = keepPageAdvice(command, INTERACTION_COMMANDS.includes(command));
  const pageName = pageCommandName(command, args, options);
  const actsOnPage = !daemonRunning && actsOnCurrentPage(command, args, options);
  if (actsOnPage) {
    const reason = skipRestore ? "no-restore" : !persistentMode ? "no-persistent" : browser.pendingSessionRestore() ? null : "nothing-saved";
    if (reason) {
      console.error(blankPageRefusal(pageName, reason, getDataDir(), advice));
      process.exit(1);
    }
    browser.onSessionRestoreFailed = (url, error) => {
      throw new Error(restoreFailedMessage(url, pageName, error));
    };
  }
  if (actsOnPage || (!daemonRunning && DRIVES_THE_PAGE.includes(command))) {
    browser.onSessionRestored = (url) => console.error(reloadNote(url, pageName, getDataDir(), advice));
  }

  // Each command group runs the commands it owns (./commands/); none owns an unknown one.
  const ctx: CommandContext = { command, args, options, colorScheme, browser, browserType, headless, geolocation, viewportOverride };
  try {
    let handled = false;
    for (const run of COMMAND_GROUPS) {
      if (await run(ctx)) {
        handled = true;
        break;
      }
    }
    if (!handled) {
      console.error(`Unknown command: ${command}`);
      console.error("Run 'cbrowser help' for usage");
      process.exit(1);
    }
  } finally {
    await browser.close();
  }

  // Explicitly exit after successful browser commands
  // Persistent context may keep handles open that prevent natural exit.
  // Honour process.exitCode: a command that completed its work but had a part
  // fail (a requested encoder missing, say) sets it, and a hardcoded exit(0)
  // would report success for a run the caller can't detect as broken.
  process.exit(process.exitCode ?? 0);
}
