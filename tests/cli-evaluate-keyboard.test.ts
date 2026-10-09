/**
 * CLI tests for `evaluate` and `keyboard`.
 *
 * `evaluate` is red zone (it runs caller-supplied page script), so every call
 * that is meant to run a script passes --force; the refusal itself is pinned in
 * "evaluate is red zone" below.
 *
 * These drive the real CLI as a subprocess against a real page, because both
 * commands are mostly argument handling and exit codes - the parts a direct
 * function call would skip. The keyboard tests assert the ACTUAL DOM event
 * sequence the fixture recorded, not just that the command exited 0: a command
 * that pressed nothing would exit 0 too.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { serveFixtures } from "./fixtures/serve-fixtures.js";

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");
const TIMEOUT = 60_000;

let fixtures: Awaited<ReturnType<typeof serveFixtures>>;
let baseUrl = "";
let dataDir = "";
/** Distinct output files per invocation, so concurrent reads never collide. */
let runSeq = 0;

interface RunResult { code: number; stdout: string; stderr: string }

/** Run the CLI in an isolated data dir and capture everything. */
async function cli(...args: string[]): Promise<RunResult> {
  // Neither pipes nor `proc.exited` are trusted here.
  //
  // Two separate races, found in that order. First, the original helper read
  // stdout/stderr with `new Response(stream).text()`, and under load one of
  // those promises never settled while the child had already exited -- a sweep
  // for long-lived children during a hang found none. Redirecting output to
  // files fixed that pairing 3 runs of 3.
  //
  // The full suite still hung one test, and the same probe gave the same
  // answer: child gone, parent still waiting. So `await proc.exited` itself does
  // not always settle under load. `spawnSync` avoids both races and was tried,
  // but it blocks the event loop and pushed a paired run past ten minutes.
  //
  // So the shell records the exit status to a file and we race that against
  // `proc.exited`. Whichever answers first is correct -- the wrapper only writes
  // the code after both redirects have closed, so the output files are complete
  // whenever the code file exists. Nothing depends on Bun reaping the child
  // promptly. (2026-08-02)
  const n = runSeq++;
  const outPath = join(dataDir, `out-${n}.txt`);
  const errPath = join(dataDir, `err-${n}.txt`);
  const codePath = join(dataDir, `code-${n}.txt`);

  const proc = Bun.spawn(
    // The wrapper must EXIT with the CLI's status, not the echo's. Without the
    // trailing `exit $c` the script returns 0 (echo succeeded), proc.exited wins
    // the race with that 0, and every test asserting a failure exit code passes
    // a command that actually failed.
    ["bash", "-c", 'bun run "$0" "$@" > "$CB_OUT" 2> "$CB_ERR"; c=$?; echo $c > "$CB_CODE"; exit $c', CLI, ...args],
    {
      env: {
        ...process.env,
        CBROWSER_DATA_DIR: dataDir,
        CB_OUT: outPath, CB_ERR: errPath, CB_CODE: codePath,
      },
      stdout: "ignore",
      stderr: "ignore",
    },
  );

  const fromFile = (async () => {
    // 25ms poll, bounded well inside the test budget so a genuine hang still
    // fails as a hang rather than being masked by this fallback.
    for (let i = 0; i < 1800; i++) {
      if (existsSync(codePath)) {
        const raw = readFileSync(codePath, "utf8").trim();
        if (raw) return Number(raw);
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`cli never reported an exit code: ${args.join(" ")}`);
  })();

  const code = await Promise.race([proc.exited, fromFile]);
  return {
    code,
    stdout: existsSync(outPath) ? readFileSync(outPath, "utf8") : "",
    stderr: existsSync(errPath) ? readFileSync(errPath, "utf8") : "",
  };
}

/** Read the fixture's recorded key events back out of the page. */
async function keyLog(): Promise<{ type: string; key: string; shift: boolean; ctrl: boolean }[]> {
  const result = await cli(
    "evaluate",
    "localStorage.getItem('keyLog') || '[]'",
    "--url", `${baseUrl}/keyboard.html`,
    "--raw", "--force",
  );
  const line = result.stdout.trim().split("\n").pop() ?? "[]";
  return JSON.parse(line);
}

/** Clear the recorded events between scenarios. */
async function clearKeyLog(): Promise<void> {
  await cli("evaluate", "localStorage.removeItem('keyLog') || 'ok'", "--url", `${baseUrl}/keyboard.html`, "--raw", "--force");
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "cbrowser-cli-test-"));

  // Served over HTTP rather than file://: Chromium gives file:// pages an
  // opaque origin with no localStorage, and the fixture needs storage to carry
  // its event log across CLI invocations.
  fixtures = await serveFixtures();
  baseUrl = fixtures.base.replace(/\/$/, "");
});

afterAll(async () => {
  await fixtures.close();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe("evaluate", () => {
  test("the original one-argument form still works", async () => {
    const result = await cli("evaluate", "1 + 1", "--url", `${baseUrl}/keyboard.html`, "--force");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("2");
  }, TIMEOUT);

  test("a string result prints unquoted by default", async () => {
    const result = await cli("evaluate", "document.title", "--url", `${baseUrl}/keyboard.html`, "--force");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Keyboard fixture");
    expect(result.stdout).not.toContain('"Keyboard fixture');
  }, TIMEOUT);

  test("--json forces JSON for a string result", async () => {
    const result = await cli("evaluate", "'plain'", "--url", `${baseUrl}/keyboard.html`, "--json", "--force");
    expect(result.stdout).toContain('"plain"');
  }, TIMEOUT);

  test("--raw prints the bare value", async () => {
    const result = await cli("evaluate", "({a: 1}).a", "--url", `${baseUrl}/keyboard.html`, "--raw", "--force");
    expect(result.stdout.trim().split("\n").pop()).toBe("1");
  }, TIMEOUT);

  test("--file runs a multi-line script that shell quoting would mangle", async () => {
    const scriptPath = join(dataDir, "script.js");
    writeFileSync(scriptPath, "const parts = ['a', 'b'];\nparts.join('-');\n");
    const result = await cli("evaluate", "--file", scriptPath, "--url", `${baseUrl}/keyboard.html`, "--raw", "--force");
    expect(result.code).toBe(0);
    expect(result.stdout.trim().split("\n").pop()).toBe("a-b");
  }, TIMEOUT);

  test("--arg passes JSON-typed arguments into the script", async () => {
    const result = await cli(
      "evaluate", "(sel, n) => document.querySelectorAll(sel).length + n",
      "--arg", '"input"', "--arg", "10",
      "--url", `${baseUrl}/keyboard.html`, "--raw", "--force",
    );
    expect(result.code).toBe(0);
    // One <input> in the fixture, plus the numeric argument: proves both the
    // string and the number survived as their own types.
    expect(result.stdout.trim().split("\n").pop()).toBe("11");
  }, TIMEOUT);

  test("a malformed --arg is rejected by name, not passed to the page", async () => {
    const result = await cli("evaluate", "x => x", "--arg", "not-json", "--url", `${baseUrl}/keyboard.html`, "--force");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--arg #1");
    expect(result.stderr).toContain("not valid JSON");
  }, TIMEOUT);

  test("--expect-truthy exits 1 on a falsy result and 0 on a truthy one", async () => {
    const falsy = await cli("evaluate", "!!document.querySelector('#nope')", "--url", `${baseUrl}/keyboard.html`, "--expect-truthy", "--force");
    expect(falsy.code).toBe(1);
    expect(falsy.stderr).toContain("Expected a truthy result");

    const truthy = await cli("evaluate", "!!document.querySelector('#field')", "--url", `${baseUrl}/keyboard.html`, "--expect-truthy", "--force");
    expect(truthy.code).toBe(0);
  }, TIMEOUT);

  test("a falsy result without --expect-truthy still exits 0", async () => {
    const result = await cli("evaluate", "false", "--url", `${baseUrl}/keyboard.html`, "--force");
    expect(result.code).toBe(0);
  }, TIMEOUT);

  test("--wait-for waits for the selector before evaluating", async () => {
    const result = await cli("evaluate", "!!document.querySelector('#notes')", "--url", `${baseUrl}/keyboard.html`, "--wait-for", "#notes", "--raw", "--force");
    expect(result.code).toBe(0);
    expect(result.stdout.trim().split("\n").pop()).toBe("true");
  }, TIMEOUT);

  test("--wait-for that never matches fails loudly", async () => {
    // --timeout keeps this honest AND quick. Without it the wait was a hardcoded
    // 30s, so this test spent half its 60s budget waiting on purpose and the
    // remaining half had to cover browser launch and teardown -- which it did
    // alone and did not once the full suite ran browsers in parallel. Bounding
    // the wait tests the same behaviour against a constant the test controls.
    const result = await cli("evaluate", "1", "--url", `${baseUrl}/keyboard.html`, "--wait-for", "#never-there", "--timeout", "1500", "--force");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Timed out waiting for selector");
    // The message names the bound, so a wait that ended early is distinguishable
    // from one that ran its course.
    expect(result.stderr).toContain("1500ms");
  }, TIMEOUT);

  test("--timeout rejects a value that is not a positive number", async () => {
    const result = await cli("evaluate", "1", "--url", `${baseUrl}/keyboard.html`, "--wait-for", "#never-there", "--timeout", "nope", "--force");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--timeout must be a positive number");
  }, TIMEOUT);

  test("an error inside the page surfaces its stack and exits 1", async () => {
    const result = await cli("evaluate", "throw new Error('boom from the page')", "--url", `${baseUrl}/keyboard.html`, "--force");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("boom from the page");
    // The stack is the part that says where in the script it broke.
    expect(result.stderr.split("\n").length).toBeGreaterThan(2);
  }, TIMEOUT);

  test("an unsupported flag is rejected rather than ignored", async () => {
    const result = await cli("evaluate", "1", "--url", `${baseUrl}/keyboard.html`, "--fps", "10", "--force");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--fps");
  }, TIMEOUT);

  test("--file runs a statement body with an explicit return", async () => {
    const scriptPath = join(dataDir, "explicit-return.js");
    writeFileSync(scriptPath, "return document.title;\n");
    const result = await cli("evaluate", "--file", scriptPath, "--url", `${baseUrl}/keyboard.html`, "--raw", "--force");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Keyboard fixture");
  }, TIMEOUT);

  test("--file runs a real script with const and an object return", async () => {
    const scriptPath = join(dataDir, "real-script.js");
    writeFileSync(
      scriptPath,
      "const el = document.getElementById('field');\nconst n = document.querySelectorAll('input').length;\nreturn { tag: el.tagName, inputs: n };\n",
    );
    const result = await cli("evaluate", "--file", scriptPath, "--url", `${baseUrl}/keyboard.html`, "--json", "--force");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('"tag": "INPUT"');
    expect(result.stdout).toContain('"inputs": 1');
  }, TIMEOUT);

  test("--arg reaches a statement body through the args array", async () => {
    const scriptPath = join(dataDir, "args-script.js");
    writeFileSync(scriptPath, "const sel = args[0];\nconst bump = args[1];\nreturn document.querySelectorAll(sel).length + bump;\n");
    const result = await cli(
      "evaluate", "--file", scriptPath, "--arg", '"input"', "--arg", "10",
      "--url", `${baseUrl}/keyboard.html`, "--raw", "--force",
    );
    expect(result.code).toBe(0);
    expect(result.stdout.trim().split("\n").pop()).toBe("11");
  }, TIMEOUT);

  test("a parenthesised expression is not mistaken for a function literal", async () => {
    const result = await cli("evaluate", "({a: 41 + 1}).a", "--url", `${baseUrl}/keyboard.html`, "--raw", "--force");
    expect(result.code).toBe(0);
    expect(result.stdout.trim().split("\n").pop()).toBe("42");
  }, TIMEOUT);
});

describe("evaluate is red zone", () => {
  // Page script can click what click() refuses, so evaluate runs nothing
  // without --force (src/security/script-gate.ts). The 19.2.0 live proof was
  // exactly this: click("Delete account") refused, then a one-line script
  // clicking #delete-account fired the handler.
  const page = () => `${baseUrl}/red-zone.html`;
  const deleted = async () => {
    const r = await cli("evaluate", "localStorage.getItem('deleted')", "--url", page(), "--raw", "--force");
    return r.stdout.trim().split("\n").pop();
  };

  test("without --force it is refused, exits 1, and the script never runs", async () => {
    await cli("evaluate", "localStorage.removeItem('deleted') || 'ok'", "--url", page(), "--raw", "--force");
    expect(await deleted()).toBe("null");

    const refused = await cli("evaluate", "document.querySelector('#delete-account').click(); 'clicked'", "--url", page(), "--raw");
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("Red zone action requires --force: evaluate_script");
    expect(refused.stdout).not.toContain("clicked");
    expect(await deleted()).toBe("null");
  }, TIMEOUT);

  test("the eval alias is refused the same way", async () => {
    const refused = await cli("eval", "1 + 1", "--url", page());
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("Red zone action requires --force: evaluate_script");
  }, TIMEOUT);

  test("with --force it runs, keeps stdout to the result, and names the zone on stderr", async () => {
    await cli("evaluate", "localStorage.removeItem('deleted') || 'ok'", "--url", page(), "--raw", "--force");
    const forced = await cli("evaluate", "document.querySelector('#delete-account').click(); 'clicked'", "--url", page(), "--raw", "--force");
    expect(forced.code).toBe(0);
    expect(forced.stdout.trim().split("\n").pop()).toBe("clicked");
    expect(forced.stderr).toMatch(/Red zone/);
    expect(await deleted()).toBe("DELETE");
  }, TIMEOUT);

  test("--force placed before the script is explained, not silently refused", async () => {
    // The parser hands a flag the next word as its value, so this reads the
    // script as the value of --force.
    const result = await cli("evaluate", "--force", "1 + 1", "--url", page());
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--force takes no value");
  }, TIMEOUT);
});

describe("keyboard", () => {
  test("types literal text into the focused element", async () => {
    await clearKeyLog();
    const result = await cli("keyboard", "Hello", "--url", `${baseUrl}/keyboard.html`, "--selector", "#field");
    expect(result.code).toBe(0);

    const log = await keyLog();
    const typed = log.filter((e) => e.type === "keydown").map((e) => e.key).join("");
    expect(typed).toBe("Hello");
  }, TIMEOUT);

  test("sends a chord as one modified keypress", async () => {
    await clearKeyLog();
    const result = await cli("keyboard", "Control+a", "--url", `${baseUrl}/keyboard.html`, "--selector", "#field");
    expect(result.code).toBe(0);

    const log = await keyLog();
    const modified = log.filter((e) => e.type === "keydown" && e.ctrl);
    expect(modified.length).toBeGreaterThan(0);
    expect(modified.some((e) => e.key.toLowerCase() === "a")).toBe(true);
  }, TIMEOUT);

  test("runs a multi-token sequence in order", async () => {
    await clearKeyLog();
    const result = await cli(
      "keyboard", "Control+a", "Delete", "abc",
      "--url", `${baseUrl}/keyboard.html`, "--selector", "#field",
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Control+a → Delete → \"abc\"");

    const downs = (await keyLog()).filter((e) => e.type === "keydown");
    const keys = downs.map((e) => e.key);
    expect(keys).toContain("Delete");
    // Order matters: the typed text must land after the Delete. The "a" of the
    // Control+a chord is also in the log, so match the unmodified one.
    const typedA = downs.findIndex((e) => e.key === "a" && !e.ctrl);
    expect(keys.indexOf("Delete")).toBeLessThan(typedA);
  }, TIMEOUT);

  test("--hold keeps the modifier down across every step", async () => {
    await clearKeyLog();
    const result = await cli(
      "keyboard", "ArrowRight", "--repeat", "3", "--hold", "Shift",
      "--url", `${baseUrl}/keyboard.html`, "--selector", "#field",
    );
    expect(result.code).toBe(0);

    const log = await keyLog();
    const arrows = log.filter((e) => e.key === "ArrowRight" && e.type === "keydown");
    expect(arrows.length).toBe(3);
    // The point of --hold: every intervening event carries the modifier, and
    // Shift goes down and up exactly once around the whole sequence.
    expect(arrows.every((e) => e.shift)).toBe(true);
    expect(log.filter((e) => e.key === "Shift" && e.type === "keydown").length).toBe(1);
    expect(log.filter((e) => e.key === "Shift" && e.type === "keyup").length).toBe(1);
  }, TIMEOUT);

  test("--repeat repeats the whole sequence", async () => {
    await clearKeyLog();
    await cli("keyboard", "ArrowLeft", "ArrowRight", "--repeat", "2", "--url", `${baseUrl}/keyboard.html`, "--selector", "#field");

    const keys = (await keyLog()).filter((e) => e.type === "keydown").map((e) => e.key);
    expect(keys.filter((k) => k === "ArrowLeft").length).toBe(2);
    expect(keys.filter((k) => k === "ArrowRight").length).toBe(2);
  }, TIMEOUT);

  test("a near-miss key name is rejected, not typed as text", async () => {
    const result = await cli("keyboard", "Delet", "--url", `${baseUrl}/keyboard.html`);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Delet");
    expect(result.stderr).toContain("Delete");
  }, TIMEOUT);

  test("an unknown key inside a chord is rejected", async () => {
    const result = await cli("keyboard", "Control+Nope", "--url", `${baseUrl}/keyboard.html`);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Control+Nope");
  }, TIMEOUT);

  test("an unknown --hold modifier is rejected with the valid list", async () => {
    const result = await cli("keyboard", "Enter", "--hold", "Hyper", "--url", `${baseUrl}/keyboard.html`);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Hyper");
    expect(result.stderr).toContain("Control");
  }, TIMEOUT);

  test("ordinary words are still typed as text", async () => {
    await clearKeyLog();
    const result = await cli("keyboard", "Replaced", "--url", `${baseUrl}/keyboard.html`, "--selector", "#field");
    expect(result.code).toBe(0);

    const typed = (await keyLog()).filter((e) => e.type === "keydown").map((e) => e.key).join("");
    expect(typed).toBe("Replaced");
  }, TIMEOUT);

  test("a lowercase key name resolves to the real key", async () => {
    await clearKeyLog();
    await cli("keyboard", "enter", "--url", `${baseUrl}/keyboard.html`, "--selector", "#field");
    const keys = (await keyLog()).filter((e) => e.type === "keydown").map((e) => e.key);
    expect(keys).toContain("Enter");
  }, TIMEOUT);

  test("a selector that matches nothing fails loudly", async () => {
    const result = await cli("keyboard", "Enter", "--url", `${baseUrl}/keyboard.html`, "--selector", "#not-here");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("#not-here");
  }, TIMEOUT);

  test("an unsupported flag is rejected rather than ignored", async () => {
    const result = await cli("keyboard", "Enter", "--url", `${baseUrl}/keyboard.html`, "--region", "0,0,10,10");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--region");
  }, TIMEOUT);

  test("an unrecognised chord is rejected, never typed as text", async () => {
    // The exact shape that shipped broken: "Ctrl" is not the modifier's real
    // name, so the token failed the chord test and fell through to being TYPED.
    const result = await cli("keyboard", "Ctrl+NotAKey", "--url", `${baseUrl}/keyboard.html`);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Ctrl");
    expect(result.stderr).toContain("Control");
    expect(result.stdout).not.toContain("✓ Keyboard");
  }, TIMEOUT);

  test("a bad key inside an otherwise valid chord is rejected", async () => {
    const result = await cli("keyboard", "Control+NotAKey", "--url", `${baseUrl}/keyboard.html`);
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("✓ Keyboard");
  }, TIMEOUT);

  test("--text types a token containing + as literal text", async () => {
    await clearKeyLog();
    const result = await cli("keyboard", "1+1=2", "--text", "--url", `${baseUrl}/keyboard.html`, "--selector", "#field");
    expect(result.code).toBe(0);

    const typed = (await keyLog()).filter((e) => e.type === "keydown").map((e) => e.key).join("");
    expect(typed).toBe("1+1=2");
  }, TIMEOUT);

  test("a token with + and no --text never reaches the page", async () => {
    const result = await cli("keyboard", "1+1=2", "--url", `${baseUrl}/keyboard.html`);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--text");
  }, TIMEOUT);

  test("no tokens prints usage and exits 1", async () => {
    const result = await cli("keyboard");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Usage: cbrowser keyboard");
  }, TIMEOUT);
});
