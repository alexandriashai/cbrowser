/**
 * Network and console inspection: har, console, network.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { isDaemonRunning, sendToDaemon } from "../../daemon.js";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getOutputOptions } from "../../output.js";
import { printData } from "../format.js";
import type { CommandContext } from "../context.js";

/** Runs `command` when it belongs to this group; false when it does not. */
export async function runNetworkCommand(ctx: CommandContext): Promise<boolean> {
  const { command, args, options, browser } = ctx;
  switch (command) {
    // =========================================================================
    // HAR Recording
    // =========================================================================

    case "har": {
      const subcommand = args[0];
      if (subcommand !== "start" && subcommand !== "stop") {
        console.error("Usage: cbrowser har [start|stop]");
        process.exit(1);
      }
      // A recording has to span several commands, and each cbrowser command is
      // its own process: only the daemon's browser outlives them. Recorded here,
      // start, navigate and stop were three processes and every HAR was empty,
      // with or without a daemon, while this printed "started" and "saved".
      // (2026-10-12)
      if (!(await isDaemonRunning())) {
        console.error("Error: HAR recording spans several commands, and each cbrowser command is its own process,");
        console.error("  so nothing records between them. Start the daemon first:");
        console.error("  cbrowser daemon start  ->  cbrowser har start  ->  navigate/click...  ->  cbrowser har stop [file]");
        process.exit(1);
      }
      const response = subcommand === "start"
        ? await sendToDaemon("harStart", {})
        : await sendToDaemon("harStop", {});
      if (!response.success) {
        console.error(`✗ Daemon error: ${response.error}`);
        process.exit(1);
      }
      if (subcommand === "start") {
        console.log("✓ HAR recording started in the daemon");
        console.log("  Navigate and interact with pages, then run 'cbrowser har stop'");
      } else {
        // The daemon writes only its own har directory; a chosen path is written here,
        // with this process's permissions.
        const { file, har } = response.result as { file: string; har: string };
        if (args[1]) {
          const out = resolve(args[1]);
          writeFileSync(out, har);
          console.log(`✓ HAR saved: ${out}`);
        } else {
          console.log(`✓ HAR saved: ${file}`);
        }
      }
      process.exit(0);
    }

    // =========================================================================
    // Network
    // =========================================================================

    case "console": {
      // The daemon tab's console (log, info, warning, error, uncaught exceptions,
      // failed resources), as get_console_messages returns it over MCP. Served by
      // the daemon: a fresh process has no tab and would always list nothing.
      const filter = typeof options.filter === "string" ? options.filter : "all";
      if (!["all", "error", "warning", "log", "info"].includes(filter)) {
        console.error(`Error: --filter must be one of all, error, warning, log, info (got "${filter}")`);
        process.exit(1);
      }
      if (!(await isDaemonRunning())) {
        console.error("Error: the console log only spans commands in the daemon's browser; each cbrowser command is");
        console.error("  its own process. Start the daemon first:");
        console.error("  cbrowser daemon start  ->  navigate/click...  ->  cbrowser console [--filter error] [--clear] [--json]");
        process.exit(1);
      }
      const response = await sendToDaemon("consoleMessages", { filter, clear: options.clear === true });
      if (!response.success) {
        console.error(`✗ Daemon error: ${response.error}`);
        process.exit(1);
      }
      const out = response.result as { messages: Array<{ type: string; text: string; source: string; url?: string; lineNumber?: number; pageUrl: string }>; count: number; dropped?: number };
      if (options.json === true) {
        console.log(JSON.stringify(out, null, 2));
      } else if (out.count === 0) {
        console.log(filter === "all" ? "No console messages" : `No ${filter} console messages`);
      } else {
        console.log(`\n🖥  Console (${out.count}${out.dropped ? `, ${out.dropped} older dropped` : ""}):\n`);
        for (const m of out.messages) {
          const where = m.url ? ` (${m.url}${m.lineNumber !== undefined ? `:${m.lineNumber}` : ""})` : "";
          console.log(`  [${m.type}${m.source === "pageerror" ? ", uncaught" : ""}] ${m.text}${where}`);
          console.log(`    on ${m.pageUrl}`);
        }
      }
      if (options.clear === true) console.log("✓ Console cleared");
      process.exit(0);
    }

    case "network": {
      const subcommand = args[0];
      if (subcommand !== "list" && subcommand !== "clear") {
        console.error("Usage: cbrowser network [list|clear]");
        process.exit(1);
      }
      // Same reason as har: the request log lives in a browser, and only the
      // daemon's browser outlives a command. A fresh process always listed
      // nothing and said "Navigate to a page first", even right after a
      // navigate. (2026-10-12)
      if (!(await isDaemonRunning())) {
        console.error("Error: the network log only spans commands in the daemon's browser; each cbrowser command is");
        console.error("  its own process. Start the daemon first:");
        console.error("  cbrowser daemon start  ->  navigate/click...  ->  cbrowser network list");
        process.exit(1);
      }
      if (subcommand === "clear") {
        const cleared = await sendToDaemon("networkClear", {});
        if (!cleared.success) {
          console.error(`✗ Daemon error: ${cleared.error}`);
          process.exit(1);
        }
        console.log("✓ Network history cleared");
        process.exit(0);
      }
      const listed = await sendToDaemon("networkList", {});
      if (!listed.success) {
        console.error(`✗ Daemon error: ${listed.error}`);
        process.exit(1);
      }
      switch (subcommand) {
        case "list": {
          const all = (listed.result as { requests: ReturnType<typeof browser.getNetworkRequests> }).requests;
          // Newest first, as the MCP tool lists them; it used to print the
          // oldest of the last 20 first and offered no way past 20.
          const filter = typeof options.filter === "string" ? options.filter.toLowerCase() : undefined;
          const matching = all.filter((r) => !filter || r.url.toLowerCase().includes(filter)
            || r.resourceType.toLowerCase() === filter || r.method.toLowerCase() === filter);
          const newestFirst = [...matching].reverse();
          const shown = options.all === true ? newestFirst : newestFirst.slice(0, 20);
          if (options.json === true || getOutputOptions().json) {
            printData("network", { total: all.length, matching: matching.length, requests: shown });
            break;
          }
          if (matching.length === 0) {
            console.log(filter ? `No captured request matches "${filter}"` : "No network requests captured");
            if (!filter) console.log("Navigate to a page first to capture requests");
          } else {
            console.log(`\n🌐 Network Requests (${matching.length}${filter ? ` of ${all.length}` : ""}, newest first):\n`);
            for (const req of shown) {
              const status = req.status !== undefined ? ` ${req.status}` : "";
              console.log(`  ${req.method}${status} ${req.url.substring(0, 80)}${req.url.length > 80 ? "..." : ""}`);
              console.log(`    Type: ${req.resourceType} | Time: ${req.timestamp}`);
            }
            if (matching.length > shown.length) {
              console.log(`\n  ... and ${matching.length - shown.length} older requests (--all lists them)`);
            }
          }
          break;
        }
      }
      process.exit(0);
    }

    default:
      return false;
  }
  return true;
}
