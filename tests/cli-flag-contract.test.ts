/**
 * CLI flag contract (CLI consistency audit, 2026-10-21, flags lane).
 *
 * Each test drives the real CLI. The audit's theme was "accepted and did
 * nothing": an unknown subcommand that exited 0, a declared flag nothing read,
 * a documented form the code never looked at, a replay that silently ran live.
 * The subprocess harness is the one in cli-evaluate-keyboard.test.ts; its
 * comments explain why the exit code is read from a file.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { serveFixtures } from "./fixtures/serve-fixtures.js";

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");
const TIMEOUT = 60_000;

let fixtures: Awaited<ReturnType<typeof serveFixtures>>;
let dataDir = "";
let runSeq = 0;

interface RunResult { code: number; stdout: string; stderr: string }

async function cli(env: Record<string, string | undefined>, ...args: string[]): Promise<RunResult> {
  const n = runSeq++;
  const outPath = join(dataDir, `out-${n}.txt`);
  const errPath = join(dataDir, `err-${n}.txt`);
  const codePath = join(dataDir, `code-${n}.txt`);
  const childEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...process.env, CBROWSER_DATA_DIR: dataDir, ...env })) if (v !== undefined) childEnv[k] = v;
  const proc = Bun.spawn(
    ["bash", "-c", 'bun run "$0" "$@" > "$CB_OUT" 2> "$CB_ERR"; c=$?; echo $c > "$CB_CODE"; exit $c', CLI, ...args],
    { env: { ...childEnv, CB_OUT: outPath, CB_ERR: errPath, CB_CODE: codePath }, stdout: "ignore", stderr: "ignore" },
  );
  const fromFile = (async () => {
    for (let i = 0; i < 4800; i++) {
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
const run = (...args: string[]) => cli({}, ...args);

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "cbrowser-flag-contract-"));
  fixtures = await serveFixtures();
});

afterAll(async () => {
  await fixtures.close();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe("an unknown subcommand is an error", () => {
  // These printed their usage and exited 0, so `cbrowser visual compre home`
  // passed in CI (finding 22).
  for (const cmd of ["persona", "session", "cookie", "device", "geo", "visual", "ai-visual", "record", "webhook", "parallel", "ai", "har", "network"]) {
    test(cmd, async () => {
      const r = await run(cmd, "no-such-subcommand");
      expect(r.code, r.stdout + r.stderr).toBe(1);
      expect(r.stderr).toContain(`Usage: cbrowser ${cmd}`);
    }, TIMEOUT);
  }
});

describe("validated commands", () => {
  test("test-suite refuses a flag it declared but never read", async () => {
    // test-suite declared every report command's flags, so --persona passed
    // validation and did nothing (finding 12).
    const r = await run("test-suite", "--inline", "go to about:blank", "--persona", "first-timer");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("does not support --persona");
  }, TIMEOUT);

  test("the documented global output modes are accepted", async () => {
    // --plain and --json-output are documented globals the validated commands
    // rejected (finding 2).
    for (const flag of ["--plain", "--no-color"]) {
      const r = await run("evaluate", "1 + 1", "--url", `${fixtures.base}static.html`, flag, "--force");
      expect(r.code, `${flag}: ${r.stderr}`).toBe(0);
    }
  }, TIMEOUT * 2);

  test("type --delay is read (it was always 50 ms)", async () => {
    const r = await run("type", "#x", "abc", "--delay", "slow", "--url", `${fixtures.base}static.html`);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("--delay must be a number");
  }, TIMEOUT);
});

describe("help resolves every alias to its own section", () => {
  // `help stats` used to fall back to text search and show "heal stats".
  for (const [alias, target] of [["stats", "storage"], ["hunt", "hunt-bugs"], ["flaky", "flaky-check"], ["repair", "repair-tests"]]) {
    test(`help ${alias}`, async () => {
      const r = await run("help", alias);
      expect(r.code).toBe(0);
      expect(r.stdout).toContain(target);
      expect(r.stdout).not.toContain("heal stats");
    }, TIMEOUT);
  }
});

describe("cognitive-journey replay", () => {
  test("a missing trace file is named, not answered with an API-key prompt", async () => {
    const r = await cli({ ANTHROPIC_API_KEY: undefined }, "cognitive-journey", "--start", `${fixtures.base}static.html`,
      "--goal", "read the page", "--replay-trace", join(dataDir, "no-such-trace.jsonl"));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("trace file not found");
    expect(r.stdout).not.toContain("api_key_missing");
  }, TIMEOUT);

  test("a recorded journey replays with no API key and no model calls", async () => {
    // Record two steps through the library with a stub decision provider (no
    // key), then replay them through the CLI with no key set anywhere. Before
    // 20.0 the CLI refused for want of a key, and --replay-trace never reached
    // the engine, so a "replay" was a live, paid run.
    const recordDir = mkdtempSync(join(tmpdir(), "cbrowser-trace-record-"));
    const previous = process.env.CBROWSER_DATA_DIR;
    process.env.CBROWSER_DATA_DIR = recordDir;
    try {
      const { runCognitiveJourney } = await import("../src/cognitive/index.js");
      await runCognitiveJourney({
        persona: "first-timer",
        goal: "read the page",
        startUrl: `${fixtures.base}static.html`,
        maxSteps: 2,
        maxTime: 60,
        headless: true,
        vision: true,
        trace: true,
        decisionProvider: { decide: async () => "{}" },
      });
    } finally {
      if (previous === undefined) delete process.env.CBROWSER_DATA_DIR;
      else process.env.CBROWSER_DATA_DIR = previous;
    }
    const traces = readdirSync(join(recordDir, "traces"));
    expect(traces.length).toBe(1);
    const tracePath = join(recordDir, "traces", traces[0]);
    const recorded = readFileSync(tracePath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(recorded.filter((s) => s.step >= 0).length).toBeGreaterThan(0);
    // The post-journey goal evaluation is recorded too (step -1), so a replay
    // reproduces the verdict instead of asking a live model.
    expect(recorded.some((s) => s.step === -1)).toBe(true);

    const r = await cli({ ANTHROPIC_API_KEY: undefined }, "cognitive-journey", "--start", `${fixtures.base}static.html`,
      "--goal", "read the page", "--max-steps", "2", "--headless", "--replay-trace", tracePath);
    rmSync(recordDir, { recursive: true, force: true });
    expect(r.stdout).not.toContain("api_key_missing");
    expect(r.stdout + r.stderr).not.toMatch(/diverged/i);
    expect(r.stdout + r.stderr).not.toContain("API key not configured");
    expect(r.stdout).toMatch(/Step/);
  }, TIMEOUT * 3);
});

describe("geo set", () => {
  test("a later command sees the location (geo set used to change nothing)", async () => {
    const set = await run("geo", "set", "51.5,-0.12");
    expect(set.code, set.stderr).toBe(0);
    const r = await run("evaluate",
      "new Promise((r) => navigator.geolocation.getCurrentPosition((p) => r(p.coords.latitude + ',' + p.coords.longitude), (e) => r('error: ' + e.message)))",
      "--url", `${fixtures.base}static.html`, "--raw", "--force");
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout.trim().split("\n").pop()).toBe("51.5,-0.12");
  }, TIMEOUT * 2);
});

/**
 * A command that fails exits non-zero (audit 2026-10-21, output lane 5, 12,
 * 13, 22; daemon lane 4, 7; MCP lane 4, 22). Each of these printed a failure,
 * or nothing, and exited 0.
 */
describe("failures exit non-zero", () => {
  test("ai click on a red-zone control is refused, not reported as clicked", async () => {
    const r = await run("ai", "click", "Delete account", "--url", `${fixtures.base}red-zone.html`);
    expect(r.code).toBe(1);
    expect(r.stdout).not.toContain("Clicked element");
  }, TIMEOUT);

  test("record start says it cannot capture, instead of recording nothing", async () => {
    const r = await run("record", "start", "--url", `${fixtures.base}static.html`);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("cannot capture anything");
  }, TIMEOUT);

  test("an unknown extract kind is an error, not the page text", async () => {
    const r = await run("extract", "link", "--url", `${fixtures.base}static.html`);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("extract takes one of");
  }, TIMEOUT);

  test("generate rejects an unknown --format", async () => {
    const r = await run("generate", `${fixtures.base}static.html`, "--format", "yaml");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("--format must be");
  }, TIMEOUT);

  test("repair-tests --output without --auto-apply is refused before running", async () => {
    const testFile = join(dataDir, "one.txt");
    await Bun.write(testFile, "# Test: one\ngo to about:blank\n");
    const r = await run("repair-tests", testFile, "--output", join(dataDir, "fixed.txt"));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("needs --auto-apply");
  }, TIMEOUT);

  test("session delete of an unknown name exits 1", async () => {
    const r = await run("session", "delete", "no-such-session-xyz");
    expect(r.code).toBe(1);
  }, TIMEOUT);

  for (const phrase of ["scroll down 300", "scroll to bottom", "reload"]) {
    test(`run "${phrase}" runs (the parser knew it; the executor said "Unsupported action")`, async () => {
      const r = await run("run", phrase);
      expect(r.code, r.stdout + r.stderr).toBe(0);
      expect(r.stdout + r.stderr).not.toContain("Unsupported action");
    }, TIMEOUT);
  }
});

/**
 * Settings reach the browser the way the docs say (audit 2026-10-21, daemon
 * lane 3 and 12, output lane 15).
 */
describe("browser settings", () => {
  const fresh = () => mkdtempSync(join(tmpdir(), "cbrowser-settings-"));
  const width = "String(innerWidth)";

  test("a one-off --device does not stick to the next command", async () => {
    const dir = fresh();
    try {
      const a = await cli({ CBROWSER_DATA_DIR: dir }, "evaluate", width, "--url", `${fixtures.base}static.html`, "--device", "iphone-16", "--raw", "--force");
      expect(a.stdout.trim().split("\n").pop()).toBe("393");
      const b = await cli({ CBROWSER_DATA_DIR: dir }, "evaluate", width, "--url", `${fixtures.base}static.html`, "--raw", "--force");
      expect(b.stdout.trim().split("\n").pop()).not.toBe("393");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, TIMEOUT * 2);

  test("--viewport wins over the size the last run saved", async () => {
    const dir = fresh();
    try {
      await cli({ CBROWSER_DATA_DIR: dir }, "evaluate", width, "--url", `${fixtures.base}static.html`, "--viewport", "500x700", "--raw", "--force");
      const b = await cli({ CBROWSER_DATA_DIR: dir }, "evaluate", width, "--viewport", "800x600", "--raw", "--force");
      expect(b.stdout.trim().split("\n").pop()).toBe("800");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, TIMEOUT * 2);

  test("CBROWSER_DEVICE and CBROWSER_TIMEZONE are honoured", async () => {
    const dir = fresh();
    try {
      const r = await cli({ CBROWSER_DATA_DIR: dir, CBROWSER_DEVICE: "iphone-16", CBROWSER_TIMEZONE: "Asia/Tokyo" },
        "evaluate", "innerWidth + ' ' + Intl.DateTimeFormat().resolvedOptions().timeZone", "--url", `${fixtures.base}static.html`, "--raw", "--force");
      expect(r.code, r.stderr).toBe(0);
      expect(r.stdout.trim().split("\n").pop()).toBe("393 Asia/Tokyo");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, TIMEOUT);
});

/** Audit and journey options reach their engines (audit 2026-10-21, daemon lane 15-18, 21; MCP lane 10). */
describe("audit and journey options", () => {
  test("empathy-audit knows the shared persona aliases and validates --scope", async () => {
    // "autism" was missing from this command's own alias copy (MCP resolved it).
    const r = await run("empathy-audit", `${fixtures.base}static.html`, "--personas", "autism", "--scope", "everything");
    expect(r.code).toBe(1);
    expect(r.stderr).not.toContain("Unknown disability persona");
    expect(r.stderr).toContain("--scope must be viewport or full_page");
  }, TIMEOUT);

  test("agent-ready-audit refuses an unconfigured --geo-region instead of running from this IP", async () => {
    const r = await cli({ CBROWSER_DATA_DIR: mkdtempSync(join(tmpdir(), "cbrowser-geo-")) },
      "agent-ready-audit", `${fixtures.base}static.html`, "--geo-region", "atlantis");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("is not configured");
  }, TIMEOUT * 2);

  test("explore needs a key: the keyless heuristic mode reported success it never measured", async () => {
    // 19.6 said Success for "buy the blue widget" on a page with no widget, because "the" was on it.
    const r = await cli({ ANTHROPIC_API_KEY: undefined, CBROWSER_DATA_DIR: mkdtempSync(join(tmpdir(), "cbrowser-explore-")) },
      "explore", "first-timer", "--start", `${fixtures.base}static.html`, "--goal", "buy the blue widget");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("explore needs an Anthropic API key");
    expect(r.stdout).not.toContain("Success");
  }, TIMEOUT);
});

/** Help, flags and output (audit 2026-10-21: flags 10, 17-19, 24; output 6-9, 19, 24). */
describe("help, flags and output", () => {
  test("help documents no command that does not exist and carries no stale version labels", async () => {
    const r = await run("help");
    expect(r.code).toBe(0);
    expect(r.stdout).not.toContain("smart-baseline");
    expect(r.stdout).not.toContain("transport-map <");
    expect(r.stdout).not.toMatch(/^[A-Z][^\n]* \(v\d+\.\d+\.\d+\)/m);
    expect(r.stdout).not.toContain("screenshot https://example.com --lightpanda");
  }, TIMEOUT);

  test("help's questionnaire trait counts are the questionnaire's", async () => {
    const { generatePersonaQuestionnaire } = await import("../src/persona-questionnaire.js");
    const all = generatePersonaQuestionnaire({ comprehensive: true }).length;
    const core = generatePersonaQuestionnaire({}).length;
    const r = await run("help");
    expect(r.stdout).toContain(`All ${all} traits (default: ${core} core traits)`);
  }, TIMEOUT);

  test("--quiet is no longer accepted: nothing ever read it", async () => {
    const r = await run("evaluate", "1", "--quiet", "--force");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("quiet");
  }, TIMEOUT);

  test("an unknown a11y subcommand exits 1", async () => {
    const r = await run("a11y", "audti");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("Usage: cbrowser a11y audit");
  }, TIMEOUT);

  test("perf-regression refuses an unknown --sensitivity instead of running at normal", async () => {
    const r = await run("perf-regression", `${fixtures.base}static.html`, "home", "--sensitivity", "loose");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("--sensitivity must be strict, normal, ci or lenient");
  }, TIMEOUT);

  test("a --timeout that is not a duration is refused (\"30s\" used to mean 30 ms)", async () => {
    const file = join(dataDir, "t.txt");
    await Bun.write(file, `# Test: one\ngo to ${fixtures.base}static.html\n`);
    const r = await run("test-suite", file, "--timeout", "soon");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("--timeout:");
  }, TIMEOUT);

  test("--viewport takes a size name", async () => {
    const r = await run("evaluate", "window.innerWidth", "--viewport", "mobile", "--url", `${fixtures.base}static.html`, "--force", "--raw", "--no-persistent");
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout.trim().split("\n").at(-1)).toBe("393");
  }, TIMEOUT);

  test("extract under --json-output puts the data in data, unaltered", async () => {
    const r = await run("extract", `${fixtures.base}static.html`, "headings", "--json-output", "--no-persistent");
    expect(r.code, r.stderr).toBe(0);
    const env = JSON.parse(r.stdout) as { success: boolean; data: unknown };
    expect(env.success).toBe(true);
    expect(JSON.stringify(env.data)).toContain("Nothing moves here");
    expect((env.data as { output?: unknown }).output).toBeUndefined();
  }, TIMEOUT);

  test("--html never overwrites the JSON report", async () => {
    const file = join(dataDir, "h.txt");
    await Bun.write(file, `# Test: loads\ngo to ${fixtures.base}static.html\nverify page contains "Nothing moves here"\n`);
    const out = join(dataDir, "report.html");
    const r = await run("test-suite", file, "--output", out, "--html", "--no-persistent");
    expect(r.code, r.stderr).toBe(0);
    expect(() => JSON.parse(readFileSync(out, "utf8"))).not.toThrow();
    expect(readFileSync(join(dataDir, "report.report.html"), "utf8")).toContain("<html");
  }, TIMEOUT * 2);

  test("daemon status exits 1 when no daemon runs", async () => {
    const r = await cli({ CBROWSER_DATA_DIR: mkdtempSync(join(tmpdir(), "cbrowser-nodaemon-")) }, "daemon", "status");
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("not running");
  }, TIMEOUT);

  test("daemon start --timeout is honoured: the daemon stops after its idle timeout", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cbrowser-idle-"));
    const port = String(20000 + Math.floor(Math.random() * 20000));
    const bad = await cli({ CBROWSER_DATA_DIR: dir }, "daemon", "start", "--port", port, "--timeout", "soon");
    expect(bad.code).toBe(1);
    const started = Date.now();
    const s = await cli({ CBROWSER_DATA_DIR: dir }, "daemon", "start", "--port", port, "--timeout", "3s");
    try {
      expect(s.code, s.stderr).toBe(0);
      const st = await cli({ CBROWSER_DATA_DIR: dir }, "daemon", "status");
      expect(st.stdout).toContain("Idle timeout: 3s");
      let stopped = false;
      for (let i = 0; i < 40 && !stopped; i++) {
        await new Promise((r) => setTimeout(r, 500));
        stopped = (await cli({ CBROWSER_DATA_DIR: dir }, "daemon", "status")).code === 1;
      }
      expect(stopped).toBe(true);
      expect(Date.now() - started).toBeGreaterThanOrEqual(3000);
    } finally {
      await cli({ CBROWSER_DATA_DIR: dir }, "daemon", "stop");
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT * 2);
});
