/**
 * The daemon command, and the route that sends page commands to a running
 * daemon.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { startDaemon, daemonRegionMismatch, getDaemonState, stopDaemon, getDaemonStatus, isDaemonRunning, runDaemonServer, sendToDaemon } from "../../daemon.js";
import { defaultGeoRegion, geoRegionProxy } from "../../config.js";
import { resolve } from "node:path";
import { resolveDevicePreset } from "../capture.js";
import { prepareEvaluate, printEvaluateResult } from "../evaluate.js";
import { validateCommandFlags, EXTRACT_KINDS } from "../flags.js";
import { printData } from "../format.js";
import { parseKeyboardToken, KEYBOARD_MODIFIERS, parseKeyboardNumbers } from "../keyboard.js";
import { parseViewportList, parseGeoLocation, parseDurationMs } from "../options.js";
import type { PreBrowserContext } from "../context.js";

// Daemon mode commands
export async function runDaemonCommand(ctx: PreBrowserContext): Promise<void> {
  const { args, options, colorScheme } = ctx;
  const subCommand = args[0];
  const port = parseInt(options.port as string) || 9222;

  switch (subCommand) {
    case "start": {
      // The daemon's browser takes its device and size from here. Both are
      // checked now: a bad value inside the detached daemon would only show
      // up as a daemon that failed to start.
      const launchArgs: string[] = [];
      if (typeof options.device === "string") launchArgs.push("--device", resolveDevicePreset(options.device));
      if (typeof options.viewport === "string") {
        try {
          parseViewportList(options.viewport);
        } catch (e) {
          console.error(`Error: ${(e as Error).message}`);
          process.exit(1);
        }
        launchArgs.push("--viewport", options.viewport);
      }
      // The rest of the shared browser settings. daemon start used to forward
      // only --device and --viewport, so --browser firefox or --no-headless
      // silently gave a headless chromium daemon.
      if (typeof options.browser === "string") {
        if (!["chromium", "firefox", "webkit"].includes(options.browser)) {
          console.error(`Error: --browser must be chromium, firefox or webkit, got: ${options.browser}`);
          process.exit(1);
        }
        launchArgs.push("--browser", options.browser);
      }
      if (options.headless === false) launchArgs.push("--no-headless");
      for (const flag of ["locale", "timezone"] as const) {
        if (typeof options[flag] === "string") launchArgs.push(`--${flag}`, options[flag] as string);
      }
      // The region is not forwarded: --geo-region and --no-geo-region set
      // CBROWSER_GEO_REGION for this run, and the daemon inherits this env
      // (startDaemon spawns it without its own), then pins it (daemon.ts).
      if (colorScheme) launchArgs.push("--color-scheme", colorScheme);
      for (const flag of ["dnt", "gpc"] as const) {
        if (typeof options[flag] === "boolean") launchArgs.push(options[flag] ? `--${flag}` : `--no-${flag}`);
      }
      if (typeof options.geo === "string") {
        if (!parseGeoLocation(options.geo)) {
          console.error(`Error: invalid --geo: ${options.geo} (a preset name or lat,lon)`);
          process.exit(1);
        }
        launchArgs.push("--geo", options.geo);
      }
      // --timeout: a bare number is minutes, as the help has always said;
      // 90s / 45m / 2h also work. It used to be accepted and ignored.
      if (options.timeout !== undefined) {
        const raw = String(options.timeout).trim();
        let ms: number;
        try {
          ms = /^\d+(\.\d+)?$/.test(raw) ? Math.round(parseFloat(raw) * 60_000) : parseDurationMs(raw);
        } catch {
          console.error(`Error: --timeout must be a positive number of minutes or a duration (90s, 45m, 2h), got "${raw}"`);
          process.exit(1);
        }
        if (!(ms > 0)) {
          console.error(`Error: --timeout must be greater than zero, got: ${raw}`);
          process.exit(1);
        }
        launchArgs.push("--idle-timeout-ms", String(ms));
      }
      // A region from CBROWSER_GEO_REGION or the config file is checked here
      // too (--geo-region was, above): a bad one inside the detached daemon
      // would only show up as a daemon whose every command fails.
      const daemonRegion = defaultGeoRegion();
      if (daemonRegion) {
        try {
          geoRegionProxy(daemonRegion);
        } catch (e) {
          console.error(`Error: ${(e as Error).message}`);
          process.exit(1);
        }
      }
      console.log("🚀 Starting CBrowser daemon...");
      const result = await startDaemon(port, launchArgs);
      console.log(result.success ? `✓ ${result.message}` : `✗ ${result.message}`);
      if (result.alreadyRunning) {
        // A running daemon in another region would answer every command
        // from there: refused, not warned (2026-11-02).
        const mismatch = daemonRegionMismatch(getDaemonState()?.geoRegion);
        if (mismatch) {
          console.error(`Error: ${mismatch}`);
          process.exit(1);
        }
      }
      if (result.alreadyRunning && launchArgs.length > 0) {
        console.error("⚠ The browser flags were not applied: the daemon was already running. Run cbrowser daemon stop first.");
      }
      process.exit(result.success ? 0 : 1);
      break;
    }

    case "stop": {
      console.log("🛑 Stopping CBrowser daemon...");
      const result = await stopDaemon();
      console.log(result.success ? `✓ ${result.message}` : `✗ ${result.message}`);
      process.exit(result.success ? 0 : 1);
      break;
    }

    case "status": {
      const status = await getDaemonStatus();
      console.log(status);
      // Non-zero when nothing is running, so `cbrowser daemon status && ...` works.
      process.exit((await isDaemonRunning()) ? 0 : 1);
      break;
    }

    case "run": {
      // Internal: run daemon in foreground
      console.log("🔧 Running daemon in foreground mode...");
      const browserType = options.browser === "firefox" ? "firefox"
        : options.browser === "webkit" ? "webkit"
        : "chromium";
      // runDaemonServer will merge with defaults internally
      const runViewport = typeof options.viewport === "string" ? parseViewportList(options.viewport)[0] : undefined;
      await runDaemonServer({
        browser: browserType,
        headless: options.headless !== false && options.headless !== "false",
        ...(typeof options.device === "string" ? { device: options.device } : {}),
        ...(runViewport ? { viewportWidth: runViewport.width, viewportHeight: runViewport.height, viewportOverride: runViewport } : {}),
        ...(typeof options.locale === "string" ? { locale: options.locale } : {}),
        ...(typeof options.timezone === "string" ? { timezone: options.timezone } : {}),
        ...(typeof options.geo === "string" && parseGeoLocation(options.geo) ? { geolocation: parseGeoLocation(options.geo)! } : {}),
      }, port, typeof options["idle-timeout-ms"] === "string" ? Number(options["idle-timeout-ms"]) : undefined);
      return;
    }

    default:
      console.error(`Unknown daemon command: ${subCommand}`);
      console.error("Use: daemon start | daemon stop | daemon status");
      process.exit(1);
  }
  return;
}

// A command in INTERACTION_COMMANDS while a daemon is running: the daemon's
// browser runs it. Every path ends the process.
export async function routeToDaemon(ctx: PreBrowserContext): Promise<void> {
  const { options, command, args } = ctx;
  // Status on stderr: stdout carries only the command's result, so piping
  // it (--raw, --json) works the same with and without a daemon.
  console.error("🔌 Connected to running daemon");
  // The daemon's browser keeps the settings it started with; a flag on a
  // command it runs cannot change them, so say so instead of ignoring it.
  // --geo-region is not here: sendToDaemon refuses one the daemon was not
  // started with, and one it was started with applies.
  const browserFlags = ["device", "viewport", "browser", "headless", "locale", "timezone", "geo", "color-scheme", "dnt", "gpc"]
    .filter((f) => options[f] !== undefined);
  if (browserFlags.length > 0) {
    console.error(`⚠ ${browserFlags.map((f) => `--${f}`).join(", ")} do not apply to commands the daemon runs: its browser keeps the settings it started with.`);
    console.error("  To change them: cbrowser daemon stop, then cbrowser daemon start with those flags");
  }

  // The daemon knows "evaluate"; "eval" reached it unchanged and failed.
  const daemonCommand = command === "eval" ? "evaluate" : command;
  let daemonArgs: Record<string, unknown> = {};
  // --url means "act on this page" for every routed command; the daemon
  // navigates first, as the local path does.
  const urlArg = typeof options.url === "string" ? { url: options.url } : {};

  switch (command) {
    case "navigate":
      daemonArgs = { url: args[0] || options.url };
      break;
    case "click":
      daemonArgs = { selector: args[0], force: options.force === true, ...urlArg };
      break;
    case "hover":
      daemonArgs = { selector: args[0], ...urlArg };
      break;
    case "fill":
      daemonArgs = { selector: args[0], value: args[1], ...urlArg };
      break;
    case "drag":
      if (!args[0] || !args[1]) {
        console.error("Usage: cbrowser drag <source-selector> <target-selector>");
        process.exit(1);
      }
      daemonArgs = { source: args[0], target: args[1], force: options.force === true, ...urlArg };
      break;
    case "upload":
      if (!args[0] || !args[1]) {
        console.error("Usage: cbrowser upload <selector> <file-path>");
        process.exit(1);
      }
      // Resolved here, as screenshot's path is: the daemon's cwd is wherever
      // `daemon start` ran.
      daemonArgs = { selector: args[0], file: resolve(args[1]), ...urlArg };
      break;
    case "keyboard": {
      validateCommandFlags("keyboard", options);
      if (args.length === 0) {
        console.error('Usage: cbrowser keyboard "<key|chord|text>" ["<key|chord|text>" ...]');
        process.exit(1);
      }
      // Tokens are validated HERE, before the request leaves: an unknown key
      // must never reach an execution path, daemon-side or not.
      const literal = options.text === true;
      const steps = args.map((token) => parseKeyboardToken(token, literal));
      const hold = typeof options.hold === "string"
        ? options.hold.split("+").map((m) => m.trim()).filter(Boolean)
        : [];
      for (const modifier of hold) {
        if (!KEYBOARD_MODIFIERS.includes(modifier)) {
          console.error(`Error: unknown --hold modifier "${modifier}"`);
          console.error(`  Valid modifiers: ${KEYBOARD_MODIFIERS.join(", ")}`);
          process.exit(1);
        }
      }
      const { delay, repeat } = parseKeyboardNumbers(options);
      daemonArgs = {
        steps,
        hold,
        delay,
        repeat,
        selector: typeof options.selector === "string" ? options.selector : undefined,
        force: options.force === true,
        ...urlArg,
      };
      break;
    }
    case "press":
      daemonArgs = { key: args[0], force: options.force === true, ...urlArg };
      break;
    case "type": {
      const delay = options.delay !== undefined ? Number(options.delay) : 50;
      if (!Number.isFinite(delay) || delay < 0) {
        console.error(`Error: --delay must be a number of milliseconds, got: ${options.delay}`);
        process.exit(1);
      }
      daemonArgs = { text: args[0], delay, force: options.force === true, ...urlArg };
      break;
    }
    case "eval":
    case "evaluate": {
      validateCommandFlags(command, options);
      // Same validation as the local path (prepareEvaluate), then the whole
      // request: refused here and again daemon-side, since anything on this
      // machine can POST to the daemon. The daemon compiles the raw script
      // with the same evaluateScript as the local path.
      const prep = await prepareEvaluate(args, options);
      daemonArgs = {
        script: prep.script,
        args: prep.evalArgs,
        force: true,
        ...(typeof options.url === "string" ? { url: options.url } : {}),
        ...(prep.waitFor ? { waitFor: prep.waitFor, timeout: prep.waitMs } : {}),
      };
      break;
    }
    case "screenshot": {
      let ssUrl: string | undefined;
      let ssPath: string | undefined = typeof options.output === "string" ? options.output : undefined;
      if (args[0]) {
        if (args[0].startsWith("http://") || args[0].startsWith("https://") || args[0].startsWith("www.")) {
          ssUrl = args[0];
          if (args[1] && !args[1].startsWith("-")) ssPath = args[1];
        } else {
          ssPath = args[0];
        }
      }
      // Resolved here: the daemon's cwd is wherever `daemon start` ran, so a
      // relative path used to land there instead of where the user is.
      daemonArgs = { path: ssPath ? resolve(ssPath) : undefined, url: ssUrl || options.url };
      break;
    }
    case "extract": {
      let extractUrl: string | undefined;
      let extractWhat = "text";
      if (args[0]) {
        if (args[0].startsWith("http://") || args[0].startsWith("https://") || args[0].startsWith("www.")) {
          extractUrl = args[0];
          extractWhat = args[1] || "text";
        } else {
          extractWhat = args[0];
        }
      }
      if (!EXTRACT_KINDS.includes(extractWhat.toLowerCase())) {
        console.error(`Error: extract takes one of: ${EXTRACT_KINDS.join(", ")} (got "${extractWhat}")`);
        process.exit(1);
      }
      daemonArgs = { what: extractWhat, url: extractUrl || options.url };
      break;
    }
    case "run":
      daemonArgs = { command: args.join(" "), ...urlArg };
      break;
  }

  const result = await sendToDaemon(daemonCommand, daemonArgs);
  if (result.success) {
    console.error("✓ Command executed via daemon");
    if (daemonCommand === "evaluate") {
      // The same output and --expect-truthy rule as the local path; the
      // daemon used to print strings JSON-quoted.
      printEvaluateResult(result.result, options);
    } else if (daemonCommand === "extract" && result.result && typeof result.result === "object" && "data" in result.result) {
      // As the local path prints it: the extracted data, not the wrapper.
      printData("extract", (result.result as { data: unknown }).data);
    } else if (result.result) {
      console.log(JSON.stringify(result.result, null, 2));
    }
  } else {
    console.error(`✗ Daemon error: ${result.error}`);
    // A daemon outlives a CLI upgrade, and one started before a command was
    // routed to it (drag and upload, 2026-11-08) does not know it.
    if (typeof result.error === "string" && result.error.startsWith("Unknown command:")) {
      console.error("  The running daemon was started by an older cbrowser. Restart it: cbrowser daemon stop, then cbrowser daemon start");
    }
    process.exit(1);
  }
  // Every other command path ends with an explicit exit; this one returned,
  // so a keep-alive socket to a busy daemon held the process open forever.
  // That is what looked like `fill` deadlocking against a live capture: the
  // command had already completed and printed its result.
  process.exit(process.exitCode ?? 0);
}
