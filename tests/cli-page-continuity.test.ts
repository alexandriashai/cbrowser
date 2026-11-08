/**
 * The page a CLI command acts on, with and without a daemon (2026-11-08).
 *
 * Without a daemon every command opens its own browser and reloads the saved
 * URL, so a variable one `evaluate` set is gone by the next. That is how a
 * separate process works; what was wrong is that nothing said so, and that a
 * command with no saved page to reload (--no-restore, documented as keeping
 * the page state, --no-persistent, or a new data dir) ran on about:blank and
 * exited 0. An agent driving a flow from separate shell calls read results
 * from a blank page without knowing it.
 *
 * Drives the path a user takes: separate CLI invocations, then a detached
 * daemon from `daemon start`. The subprocess harness is the one in
 * daemon-viewport.test.ts; cli-evaluate-keyboard.test.ts explains the
 * exit-code file.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer } from "node:net";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { serveFixtures } from "./fixtures/serve-fixtures.js";

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");
const TIMEOUT = 60_000;
const MARK = "window.__mark = 42; 'set'";
const READ = "JSON.stringify({ mark: window.__mark ?? null, href: location.href })";
const NOTE = "No daemon found for data dir";

let fixtures: Awaited<ReturnType<typeof serveFixtures>>;
let page = "";
let localDir = "";
let daemonDir = "";
const dirs: string[] = [];
let runSeq = 0;

const newDir = (name: string): string => {
  const d = mkdtempSync(join(tmpdir(), `cb-page-continuity-${name}-`));
  dirs.push(d);
  return d;
};

async function freePort(): Promise<number> {
  return await new Promise((r) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => r(p));
    });
  });
}

async function cli(dir: string, ...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return cliIn(undefined, dir, ...args);
}

/** The CLI run from `cwd` (default: this process's), with its data dir at `dir`. */
async function cliIn(cwd: string | undefined, dir: string, ...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const n = runSeq++;
  const outPath = join(dir, `out-${n}.txt`);
  const errPath = join(dir, `err-${n}.txt`);
  const codePath = join(dir, `code-${n}.txt`);
  const proc = Bun.spawn(
    ["bash", "-c", 'bun run "$0" "$@" > "$CB_OUT" 2> "$CB_ERR"; c=$?; echo $c > "$CB_CODE"; exit $c', CLI, ...args],
    {
      env: { ...process.env, CBROWSER_DATA_DIR: dir, CB_OUT: outPath, CB_ERR: errPath, CB_CODE: codePath },
      ...(cwd ? { cwd } : {}),
      stdout: "ignore",
      stderr: "ignore",
    },
  );
  const fromFile = (async () => {
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

beforeAll(async () => {
  fixtures = await serveFixtures();
  page = `${fixtures.base}static.html`;
  localDir = newDir("local");
  daemonDir = newDir("daemon");
}, TIMEOUT);

afterAll(async () => {
  await cli(daemonDir, "daemon", "stop").catch(() => {});
  try {
    const state = JSON.parse(readFileSync(join(daemonDir, "daemon.json"), "utf8"));
    if (state.pid) process.kill(state.pid);
  } catch { /* stopped, or never started */ }
  await fixtures.close();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe("without a daemon, with a saved page", () => {
  test("a command that reloads the saved page says so, and what it means for earlier commands", async () => {
    expect((await cli(localDir, "navigate", page)).code).toBe(0);
    expect((await cli(localDir, "evaluate", MARK, "--raw", "--force")).code).toBe(0);
    const r = await cli(localDir, "evaluate", READ, "--raw", "--force");
    expect(r.code, r.stderr).toBe(0);
    // A new browser, so the mark is gone: the behaviour, now said out loud.
    expect(JSON.parse(r.stdout)).toEqual({ mark: null, href: page });
    expect(r.stderr).toContain(`${NOTE} ${localDir}`);
    expect(r.stderr).toContain(`reloaded ${page}`);
  }, TIMEOUT * 2);

  test("stdout carries only the result: the launch and restore lines are on stderr", async () => {
    const r = await cli(localDir, "evaluate", "1 + 1", "--raw", "--force");
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toBe("2\n");
    expect(r.stderr).toContain("Restoring session");
  }, TIMEOUT);

  test("the other page commands say so too (scroll, assert)", async () => {
    for (const args of [["scroll", "bottom"], ["assert", "title contains 'Recording'"]]) {
      const r = await cli(localDir, ...args);
      expect(r.stderr, args[0]).toContain(`reloaded ${page}`);
    }
  }, TIMEOUT * 2);

  test("a red-zone refusal opens no browser: no launch, no reload, no note", async () => {
    const r = await cli(localDir, "evaluate", "1 + 1", "--raw");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("--force");
    expect(r.stderr).not.toContain("Using persistent browser context");
    expect(r.stderr).not.toContain("Restoring session");
    expect(r.stderr).not.toContain(NOTE);
  }, TIMEOUT);

  test("a command given --url acts on that page, without reloading the saved one", async () => {
    const other = `${page}?other`;
    const r = await cli(localDir, "evaluate", "location.href", "--url", other, "--raw", "--force");
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toBe(`${other}\n`);
    expect(r.stderr).not.toContain("Restoring session");
    expect(r.stderr).not.toContain(NOTE);
  }, TIMEOUT);

  test("--no-restore with no URL is refused, before a browser opens, for each kind of page command", async () => {
    // One of each, so dropping any from PAGE_COMMANDS fails here as well as
    // in the unit test. Refusals open nothing, so this is quick.
    const commands = [
      ["evaluate", READ, "--raw", "--force"],
      ["eval", "1", "--raw", "--force"],
      ["screenshot", join(localDir, "blank.png")],
      ["extract", "text"],
      ["click", "#nothing"],
      ["fill", "#nothing", "x"],
      ["hover", "#nothing"],
      ["type", "hello", "--force"],
      ["press", "Enter", "--force"],
      ["keyboard", "Enter", "--force"],
      ["drag", "#a", "#b", "--force"],
      ["upload", "#f", join(import.meta.dir, "fixtures", "static.html")],
      ["assert", "title contains 'Recording'"],
      ["smart-click", "#nothing"],
      ["dismiss-overlay"],
      ["scroll", "bottom"],
      ["run", "click the login button"],
    ];
    for (const args of commands) {
      const r = await cli(localDir, ...args, "--no-restore");
      expect(r.code, `${args[0]}: ${r.stdout}${r.stderr}`).toBe(1);
      expect(r.stderr, args[0]).toContain("about:blank");
      expect(r.stderr, args[0]).toContain("--no-restore");
      expect(r.stderr, args[0]).not.toContain("Using persistent browser context");
      expect(r.stdout, args[0]).toBe("");
    }
    expect(existsSync(join(localDir, "blank.png"))).toBe(false);
  }, TIMEOUT * 3);

  test("--no-restore with a page to open runs: --url, or a run step that goes to one", async () => {
    const r = await cli(localDir, "evaluate", "location.href", "--url", page, "--no-restore", "--raw", "--force");
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toBe(`${page}\n`);
    const run = await cli(localDir, "run", `go to ${page}`, "--no-restore");
    expect(run.code, run.stdout + run.stderr).toBe(0);
  }, TIMEOUT * 2);

  test("a blank page on purpose: --url about:blank", async () => {
    const r = await cli(localDir, "evaluate", "location.href", "--url", "about:blank", "--no-restore", "--raw", "--force");
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toBe("about:blank\n");
  }, TIMEOUT);

  test("daemon status names the data dir it looked in", async () => {
    const r = await cli(localDir, "daemon", "status");
    expect(r.stdout).toContain("Daemon is not running");
    expect(r.stdout).toContain(localDir);
  }, TIMEOUT);
});

describe("without a daemon, with no saved page", () => {
  test("a new data dir has nothing to reload: refused, naming the data dir", async () => {
    const dir = newDir("fresh");
    const r = await cli(dir, "evaluate", "document.title", "--raw", "--force");
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stderr).toContain("about:blank");
    expect(r.stderr).toContain(`no saved page in data dir ${dir}`);
    expect(r.stdout).toBe("");
  }, TIMEOUT);

  test("a command the daemon does not run is pointed at a test-suite, not at a daemon that refuses it", async () => {
    const dir = newDir("assert");
    const r = await cli(dir, "assert", "title contains 'Recording'");
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stderr).toContain("assert does not run in the daemon");
    expect(r.stderr).not.toContain("cbrowser daemon start");
  }, TIMEOUT);

  test("a stale browser lock is cleared without its line reaching stdout", async () => {
    const dir = newDir("lock");
    mkdirSync(join(dir, "browser-state"), { recursive: true });
    // A pid that is not running: one that has just exited.
    const gone = Bun.spawnSync(["true"]).pid;
    symlinkSync(`cbtest-${gone}`, join(dir, "browser-state", "SingletonLock"));
    const r = await cli(dir, "evaluate", "1 + 1", "--url", page, "--raw", "--force");
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toBe("2\n");
    expect(r.stderr).toContain("removed stale SingletonLock");
  }, TIMEOUT);

  test("--no-persistent has nothing to reload: refused; with --url, stdout is the result alone", async () => {
    const r = await cli(localDir, "evaluate", "1 + 1", "--no-persistent", "--raw", "--force");
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stderr).toContain("--no-persistent");
    const ok = await cli(localDir, "evaluate", "location.href", "--no-persistent", "--url", page, "--raw", "--force");
    expect(ok.code, ok.stderr).toBe(0);
    expect(ok.stdout).toBe(`${page}\n`);
  }, TIMEOUT * 2);

  test("a saved device does not put its restore line on stdout", async () => {
    const dir = newDir("device");
    expect((await cli(dir, "device", "set", "iphone-15")).code).toBe(0);
    const r = await cli(dir, "evaluate", "1 + 1", "--url", page, "--raw", "--force");
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toBe("2\n");
    expect(r.stderr).toContain("Restoring device");
  }, TIMEOUT);
});

describe("with a daemon", () => {
  test("separate commands share one page, with no reload note, and --no-restore is not refused", async () => {
    const start = await cli(daemonDir, "daemon", "start", "--port", String(await freePort()));
    expect(start.code, start.stdout + start.stderr).toBe(0);
    expect((await cli(daemonDir, "navigate", page)).code).toBe(0);
    expect((await cli(daemonDir, "evaluate", MARK, "--raw", "--force")).code).toBe(0);
    for (const extra of [[], ["--no-restore"]]) {
      const r = await cli(daemonDir, "evaluate", READ, "--raw", "--force", ...extra);
      expect(r.code, r.stderr).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({ mark: 42, href: page });
      expect(r.stderr).not.toContain(NOTE);
    }
  }, TIMEOUT * 3);

  test("drag and upload run on the daemon's page (they were refused while it ran)", async () => {
    // The elements exist only on the page this evaluate builds, so a drag or
    // upload anywhere else finds nothing.
    const build = [
      "document.body.insertAdjacentHTML('beforeend', '<div id=src draggable=true style=\"width:80px;height:40px;background:#888\">drag</div>",
      "<div id=dst style=\"width:200px;height:100px;background:#ccc\">drop</div><input id=file type=file>');",
      "const dst = document.getElementById('dst');",
      "dst.addEventListener('dragover', (e) => e.preventDefault());",
      "dst.addEventListener('drop', (e) => { e.preventDefault(); window.__dropped = true; });",
      "'built'",
    ].join(" ");
    expect((await cli(daemonDir, "evaluate", build, "--raw", "--force")).code).toBe(0);

    const drag = await cli(daemonDir, "drag", "#src", "#dst", "--force");
    expect(drag.code, drag.stdout + drag.stderr).toBe(0);
    // A relative path, from a directory the daemon was not started in: the
    // CLI resolves it, since the daemon's cwd is wherever `daemon start` ran.
    const upload = await cliIn(join(import.meta.dir, "fixtures"), daemonDir, "upload", "#file", "static.html");
    expect(upload.code, upload.stdout + upload.stderr).toBe(0);

    const r = await cli(daemonDir, "evaluate", "JSON.stringify({ dropped: window.__dropped === true, file: document.getElementById('file').files[0]?.name ?? null })", "--raw", "--force");
    expect(r.code, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ dropped: true, file: "static.html" });
  }, TIMEOUT * 3);
});
