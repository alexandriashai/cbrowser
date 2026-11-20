/**
 * Every command in the dispatch switch must resolve to help.
 *
 * The command list is READ FROM THE SOURCE, not maintained here: the dispatch
 * switch is the only real registry of what commands exist, so a hand-written
 * copy would drift and this test would guarantee nothing. Adding a command
 * without documenting it now fails here, which is the point - five commands
 * (`eval`, `chaos-test`, `generate-tests`, `persona-questionnaire`, `upload`)
 * had shipped answering "No help section", implying they did not exist.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");
// The dispatch switch was split by command group (2026-11-20): each module in
// src/cli/commands/ holds one group's switch, plus the daemon route and the
// commands that run before a browser exists.
const COMMANDS_DIR = resolve(import.meta.dir, "..", "src", "cli", "commands");
const TIMEOUT = 300_000;

/**
 * Extract the `case "x":` labels of the dispatch switches.
 *
 * Cases inside nested switches (subcommand handling) are indented deeper, so
 * matching on the exact indentation of a group's top-level switch keeps this
 * to real top-level commands.
 */
function dispatchCommands(): string[] {
  const commands = new Set<string>();

  for (const file of readdirSync(COMMANDS_DIR).filter((f) => f.endsWith(".ts"))) {
    const source = readFileSync(join(COMMANDS_DIR, file), "utf-8");
    for (const line of source.split("\n")) {
      const match = /^ {4}case "([a-z0-9-]+)":/.exec(line);
      if (match) commands.add(match[1]);
    }
  }
  return [...commands].sort();
}

async function helpFor(command: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "run", CLI, "help", command], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code: await proc.exited, stdout, stderr };
}

describe("per-command help coverage", () => {
  test("the dispatch switch yields a plausible command list", () => {
    const commands = dispatchCommands();
    // A parser that silently matched nothing would make every other assertion
    // in this file vacuous.
    expect(commands.length).toBeGreaterThan(50);
    expect(commands).toContain("capture");
    expect(commands).toContain("record");
    expect(commands).toContain("keyboard");
  });

  test("every command in the dispatch switch resolves to help", async () => {
    const commands = dispatchCommands();
    const unresolved: string[] = [];

    for (const command of commands) {
      const result = await helpFor(command);
      if (result.code !== 0 || /No help section/.test(result.stderr)) {
        unresolved.push(command);
      }
    }

    expect(unresolved).toEqual([]);
  }, TIMEOUT);

  test("an unknown command still fails loudly", async () => {
    const result = await helpFor("definitely-not-a-command");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("No help section");
  }, TIMEOUT);

  test("an alias says what it is an alias for", async () => {
    const result = await helpFor("eval");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("alias for 'evaluate'");
    // And it prints the target's actual documentation, not just the pointer.
    expect(result.stdout).toContain("SCRIPTING");
  }, TIMEOUT);
});
