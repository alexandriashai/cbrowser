/**
 * Action recording and screen capture: record, capture.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { runCaptureStart, runCaptureStop, runCaptureStatus } from "../capture.js";
import type { CommandContext } from "../context.js";

/** Runs `command` when it belongs to this group; false when it does not. */
export async function runRecordingCommand(ctx: CommandContext): Promise<boolean> {
  const { command, args, options, browser } = ctx;
  switch (command) {
    // =========================================================================
    // Test Recording (Tier 2)
    // =========================================================================

    case "record": {
      const subcommand = args[0];

      // A recording has to span several commands, and each command is its own
      // process, so start / stop / save each saw a fresh, empty recorder: stop
      // always reported 0 actions and save wrote an empty test (audit
      // 2026-10-21, the class HAR had until 19.4.3). Only list and generate
      // work on their own; the rest are refused instead of pretending.
      if (subcommand === "start" || subcommand === "stop" || subcommand === "save") {
        console.error(`Error: 'record ${subcommand}' cannot capture anything: each cbrowser command is its own process, so a recording does not survive between them.`);
        console.error("  To record a flow, write it as a test and run it in one process:");
        console.error('    cbrowser test-suite --inline "go to https://example.com ; click Sign in ; verify page contains Welcome" --capture');
        process.exit(1);
      }

      switch (subcommand) {
        case "start": {
          const url = options.url as string;
          await browser.startRecording(url);
          console.log("✓ Recording started");
          if (url) {
            console.log(`  Navigated to: ${url}`);
          }
          console.log("  Interact with the page, then run 'cbrowser record stop'");
          break;
        }
        case "stop": {
          const actions = browser.stopRecording();
          console.log(`✓ Recording stopped`);
          console.log(`  Captured ${actions.length} actions`);
          if (actions.length > 0) {
            console.log("\n  Actions:");
            for (const action of actions) {
              console.log(`    ${action.type}: ${action.selector || action.url || action.value || ""}`);
            }
          }
          break;
        }
        case "save": {
          const name = args[1];
          if (!name) {
            console.error("Usage: cbrowser record save <name>");
            process.exit(1);
          }
          const path = browser.saveRecording(name);
          console.log(`✓ Recording saved: ${name}`);
          console.log(`  Path: ${path}`);
          break;
        }
        case "list": {
          const fs = await import("fs");
          const path = await import("path");
          const recordingsDir = path.join(browser.getDataDir(), "recordings");
          if (!fs.existsSync(recordingsDir)) {
            console.log("No recordings saved");
          } else {
            const files = fs.readdirSync(recordingsDir).filter((f: string) => f.endsWith(".json"));
            if (files.length === 0) {
              console.log("No recordings saved");
            } else {
              console.log("\n🎬 Saved Recordings:\n");
              for (const f of files) {
                console.log(`  - ${f.replace(".json", "")}`);
              }
            }
          }
          break;
        }
        case "generate-tests":
        case "generate": {
          const name = args[1];
          if (!name) {
            console.error("Usage: cbrowser record generate <name>");
            process.exit(1);
          }
          const fs = await import("fs");
          const path = await import("path");
          const recordingPath = path.join(browser.getDataDir(), "recordings", `${name}.json`);
          if (!fs.existsSync(recordingPath)) {
            console.error(`Recording not found: ${name}`);
            process.exit(1);
          }
          const recording = JSON.parse(fs.readFileSync(recordingPath, "utf-8"));
          const code = browser.generateTestCode(name, recording.actions);
          console.log(code);
          break;
        }
        default:
          console.error("Usage: cbrowser record [start|stop|save|list|generate]");
          process.exit(1);
      }
      break;
    }

    // =========================================================================
    // Screen Capture (video/GIF)
    // =========================================================================

    // Deliberately separate from `record` above: `record` captures user
    // ACTIONS for test generation, `capture` captures PIXELS for video/GIF.
    // They share nothing but a rough English synonym - do not unify them.
    case "capture": {
      switch (args[0]) {
        case "start":
          await runCaptureStart(browser, args[1] || (typeof options.url === "string" ? options.url : undefined), options);
          break;
        case "stop":
          await runCaptureStop();
          break;
        case "status":
          await runCaptureStatus();
          break;
        default:
          console.error("Usage: cbrowser capture [start <url>|stop|status]");
          process.exit(1);
      }
      break;
    }

    default:
      return false;
  }
  return true;
}
