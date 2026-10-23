/**
 * No test run leaves a file in the real personas dir, ~/.cbrowser/personas.
 *
 * Integration's journey-gif and overlay tests left zz-* personas, and the
 * tenant test a "tenant-created-local" persona, in the personas dir of
 * whoever ran the suite, although every one of them set its own temp
 * CBROWSER_DATA_DIR. The cause was personas.ts: it read CBROWSER_DATA_DIR once,
 * at import, and Bun shares one module registry across the files of a
 * process. Whichever file imported it first, usually one that set no data dir
 * at all, fixed the directory for the whole run.
 *
 * Two checks:
 *   - A real run, in a child `bun test` with HOME pointed at a throwaway dir
 *     standing in for the real home, no CBROWSER_DATA_DIR, and personas.ts
 *     preloaded first (fixtures/persona-guard-primer.ts). The writers then run:
 *     a fixture covering both write paths, and the fast persona-writing suite
 *     files. That home's .cbrowser/personas must be empty afterwards.
 *     CBROWSER_PERSONA_GUARD=all runs every persona-writing test file (about
 *     90 s of browsers) instead of the fast four. Run together in one process
 *     those can hit the long-process browser hang scripts/test-split.sh
 *     describes (a timeout, failing "the run itself passes"; it does so on
 *     21.0's tree before this fix too); the personas-dir check still holds.
 *   - Every test file that writes personas sets its own data dir (assigned,
 *     not ??=, which inherits an earlier file's) and removes it.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SELF = "tests/real-personas-dir.test.ts";

/** A persona write: a save, a tool that saves, or a path into a personas dir. */
const WRITES = /saveCustomPersona\(|persona_(create_submit_traits|questionnaire_build|update|create_questionnaire_answer)\b|join\(.*["']personas["']\)/;
/** Its own data dir: CBROWSER_DATA_DIR or CBROWSER_MIRROR_ROOT assigned (not ??=), or set in a child's env. */
const OWN_DIR = /process\.env\.CBROWSER_(DATA_DIR|MIRROR_ROOT)\s*=(?!=)|\bCBROWSER_DATA_DIR:\s/;
const CLEANUP = /\brmSync\(/;

/** Code without comments, so a comment that mentions a tool is not a write. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Every test file under tests/ that writes personas, repo-relative. */
function writerFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${name.name}`;
      if (name.isDirectory()) { if (name.name !== "fixtures") walk(rel); continue; }
      if (!/\.test\.tsx?$/.test(name.name) || rel === SELF) continue;
      if (WRITES.test(code(readFileSync(join(ROOT, rel), "utf8")))) out.push(rel);
    }
  };
  walk("tests");
  return out.sort();
}

const FAST = ["trait-provenance", "account-scope-process-maps", "persona-resolution-single-record", "saliency-overlay-traits"]
  .map((f) => `tests/${f}.test.ts`);

describe("a run of the persona-writing tests leaves the real personas dir alone", () => {
  let home = "";
  let left: string[] = [];
  let exit = -1;
  let log = "";

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), "cb-guard-home-"));
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
    for (const k of ["CBROWSER_DATA_DIR", "CBROWSER_MIRROR_ROOT", "CBROWSER_ARTIFACT_DIR"]) delete env[k];
    env.HOME = home;
    // Browsers stay where they are installed; only the data home moves.
    env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), ".cache", "ms-playwright");
    const files = ["tests/fixtures/persona-guard-writer.ts",
      ...(process.env.CBROWSER_PERSONA_GUARD === "all" ? writerFiles() : FAST)];
    const child = Bun.spawn([process.execPath, "test", "--preload", "./tests/fixtures/persona-guard-primer.ts", ...files.map((f) => `./${f}`)],
      { cwd: ROOT, env, stdout: "pipe", stderr: "pipe" });
    const [out, err] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
    exit = await child.exited;
    log = `${out}\n${err}`;
    const dir = join(home, ".cbrowser", "personas");
    left = existsSync(dir) ? readdirSync(dir).sort() : [];
  }, 600_000);

  afterAll(() => { if (home) rmSync(home, { recursive: true, force: true }); });

  test("the run itself passes", () => {
    expect({ exit, failures: exit === 0 ? [] : log.split("\n").filter((l) => /^\(fail\)|^error:/.test(l)).slice(0, 20) })
      .toEqual({ exit: 0, failures: [] });
  });

  test("and leaves no file in $HOME/.cbrowser/personas", () => {
    expect(left).toEqual([]);
  });
});

describe("every test file that writes personas isolates its own data dir", () => {
  const writers = writerFiles();

  test("the scan finds the known writers, so an empty result is not a pass", () => {
    for (const f of ["tests/journey-gif-traits.test.ts", "tests/saliency-overlay-traits.test.ts", "tests/account-scope-process-maps.test.ts",
      "tests/trait-provenance.test.ts", "tests/persona-incomplete-file.test.ts", "tests/relevance-accessibility-traits.test.ts"])
      expect(writers).toContain(f);
  });

  test("each sets its data dir by assignment (not ??=) and removes it", () => {
    const bad = writers.flatMap((f) => {
      const src = code(readFileSync(join(ROOT, f), "utf8"));
      const why = [!OWN_DIR.test(src) && "sets no data dir of its own", !CLEANUP.test(src) && "never removes it"].filter(Boolean);
      return why.length ? [`${f}: ${why.join(", ")}`] : [];
    });
    expect(bad).toEqual([]);
  });
});
