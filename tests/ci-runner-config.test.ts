/**
 * CI must run the split runner, not the single-process union.
 *
 * `test.yml` ran `bun test --coverage` — the whole suite in one process, which
 * is exactly the configuration `scripts/test-split.sh` exists to avoid. Browser-
 * launching files accumulate something across a long-lived `bun test` until a
 * launch hangs, and which test times out is random.
 *
 * release.yml's own comments name this hazard ("the exact configuration
 * scripts/test-split.sh exists to avoid") while test.yml kept doing it, so the
 * lesson was written down and not applied one file over. This test applies it.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";

const wf = async (name: string) =>
  await Bun.file(new URL(`../.github/workflows/${name}`, import.meta.url)).text();
/** Strip `#` comments so a comment mentioning a command is not read as running it. */
const cmds = (s: string) =>
  s.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

describe("the Tests workflow uses the split runner", () => {
  test("it invokes `bun run test`, which is test-split.sh", async () => {
    const c = cmds(await wf("test.yml"));
    expect(c).toContain("run: bun run test");
  });

  test("it does NOT invoke the single-process union", async () => {
    // `bun test` and `bun run test` are different commands. The first is the
    // union; the second is the package script, which is the split.
    //
    // The forbidden thing is the ARGUMENT-LESS union -- `bun test` with no
    // paths, which discovers and runs everything in one process. `bun test
    // <one file>` is a different command and a legitimate one; the diagnostic
    // step uses it deliberately.
    //
    // The first version of this test banned the substring, so adding a
    // single-file diagnostic tripped it. The assertion was broader than the
    // invariant it stood for, which made it wrong in the safe-looking
    // direction: it would have blocked a correct change while still permitting
    // `bun test --coverage=false` or similar. Narrowed to the real rule.
    const c = cmds(await wf("test.yml"));
    for (const line of c.split("\n")) {
      const m = line.match(/run:\s*bun test(.*)$/);
      if (!m) continue;
      const rest = m[1].trim();
      const paths = rest.split(/\s+/).filter((t) => t && !t.startsWith("-"));
      expect(paths.length, `"${line.trim()}" runs the whole suite in one process`)
        .toBeGreaterThan(0);
    }
    expect(c).not.toContain("bun test --coverage");
  });

  test("the test step is bounded", async () => {
    // A hang must fail by name rather than eat the runner ceiling and be
    // cancelled — a cancelled job names no culprit.
    const c = cmds(await wf("test.yml"));
    const step = c.slice(c.indexOf("run: bun run test"));
    expect(step).toContain("timeout-minutes:");
  });
});

describe("the package script still points at the split", () => {
  test("`test` is test-split.sh", async () => {
    const pkg = JSON.parse(await Bun.file(new URL("../package.json", import.meta.url)).text());
    expect(pkg.scripts.test).toContain("test-split.sh");
  });

  test("the single-process form is kept, but under a name that says so", async () => {
    // Deleting it would remove a useful local tool. Naming it `test:single`
    // means nobody reaches for it by accident.
    const pkg = JSON.parse(await Bun.file(new URL("../package.json", import.meta.url)).text());
    expect(pkg.scripts["test:single"]).toBe("bun test");
  });
});

describe("the split runner and the release gate agree about the hanging files", () => {
  const read = async (rel: string) =>
    await Bun.file(new URL(rel, import.meta.url)).text();

  /**
   * The single source both scripts read (2026-09-17).
   *
   * Each script used to carry its own hand-written copy, and they drifted: the
   * gate quarantined 7 files while the split isolated 10, so five
   * browser-launching files ran in the gate's shared process. Parsing one file
   * means "the two lists agree" is now true by construction rather than by
   * assertion -- so the tests below shift from comparing two lists to checking
   * that the one list is complete and that both scripts actually read it.
   */
  const browserList = async () =>
    new Set(
      (await read("../scripts/browser-tests.txt"))
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l !== "" && !l.startsWith("#")),
    );

  /** Files test-gate.sh excludes from the release gate. */
  const quarantined = async (_src?: string) => await browserList();

  /** Files test-split.sh runs in their own process. */
  const isolated = async (_src?: string) => await browserList();

  test("every gate-quarantined file is isolated by the split", async () => {
    // The gate's list IS the curated "does real browser work and hangs in a
    // shared process" set. The split may run more files than the gate, but it
    // must never run one of THOSE in the shared pass.
    //
    // They disagreed on four files, and CI proved it the first time the split
    // ran there: recording-autocapture timed out at exactly 180000.96ms in
    // pass 1. It passes on a fast dev box, which is why the disagreement
    // survived a full green local run.
    const splitSet = await isolated();
    const missing = [...(await quarantined())].filter((f) => !splitSet.has(f));
    expect(missing).toEqual([]);

    // And prove both scripts genuinely consume the shared file, so this cannot
    // pass because they each stopped having a list at all.
    for (const script of ["test-split.sh", "test-gate.sh"]) {
      expect(await read(`../scripts/${script}`), `${script} must read the shared list`)
        .toContain("browser-tests.txt");
    }
  });

  test("the list is non-empty — this cannot pass by parsing nothing", async () => {
    expect((await browserList()).size).toBeGreaterThan(9);
  });

  test("every file that launches a real browser is in the list", async () => {
    // The drift guard. scripts/test-split.sh has said since 2026-08-05 that
    // "any new test file calling chromium.launch() belongs in this list"; that
    // was a comment, and comments do not fail builds. On 2026-09-17 five files
    // had accumulated outside the gate's copy of the list and took the release
    // workflow red.
    //
    // Grep is deliberately broad: recording-* files launch through helpers
    // rather than calling chromium.launch() directly, so a narrow pattern would
    // report a clean sweep while missing them -- the absent-mechanism failure
    // this repo keeps finding in its own probes.
    //
    // NAMED LIMIT, not fixed: the grep reads only the test file's own text. It
    // cannot see a launch that happens inside product code the test calls
    // (hotfix-path-escape calls crossBrowserDiff, which launches chromium) or
    // inside a fixture the test spawns (same-ms-captures runs
    // tests/fixtures/same-ms-step.ts). Both ran in the release gate's shared
    // process until they were listed by hand. One of them timed out there at
    // 120 s (2026-10-24). A file that launches that way passes this test
    // unlisted, so listing it stays a reviewer's job.
    const listed = await browserList();
    const glob = new Bun.Glob("**/*.test.ts");
    const launchers: string[] = [];
    for (const dir of ["tests", "src"]) {
      for await (const rel of glob.scan({ cwd: new URL(`../${dir}/`, import.meta.url).pathname })) {
        const path = `${dir}/${rel}`;
        // This file carries the launch pattern as a string literal, so it
        // matches itself. Same self-match trap as a probe that greps for a
        // phrase living in its own criterion.
        if (path === "tests/ci-runner-config.test.ts") continue;
        const body = await Bun.file(new URL(`../${path}`, import.meta.url)).text();
        if (/chromium\.launch\(|browser\.launch\(|launchPersistentContext\(|new CBrowser\(/.test(body)) {
          launchers.push(path);
        }
      }
    }
    expect(launchers.length, "the grep itself must find something").toBeGreaterThan(4);
    expect(launchers.filter((f) => !listed.has(f))).toEqual([]);
  });

  test("the split still RUNS the quarantined files, it does not drop them", async () => {
    // Isolation is not exclusion. The gate excludes these; the split must still
    // execute each one, just in its own process.
    //
    // Until 2026-09-17 this was checked by grepping test-split.sh for each
    // filename, which worked only while the script inlined the list. Now both
    // scripts read scripts/browser-tests.txt, so the check is that the split
    // consumes that file and loops over what it holds -- grepping the script
    // for filenames it no longer contains would pass vacuously forever.
    const split = await read("../scripts/test-split.sh");
    expect(split).toContain("browser-tests.txt");
    expect(split).toMatch(/mapfile -t ISOLATED_FILES/);
    expect(split).toMatch(/for iso in "\$\{ISOLATED_FILES\[@\]\}"/);
    expect((await quarantined()).size).toBeGreaterThan(9);
  });
});

describe("the runner never executes build output", () => {
  const read = async (rel: string) =>
    await Bun.file(new URL(rel, import.meta.url)).text();

  test("test discovery excludes dist/", async () => {
    // dist/ is gitignored, so anything found there runs HERE and not on CI.
    // That divergence is not theoretical: dist/security/audit-wrapper.test.js
    // was the whole 1298-vs-1284 gap between this box and the runner, and it
    // was a stale compiled duplicate of tests/audit-wrapper.test.ts built from
    // src/security/audit-wrapper.test.ts, a path that no longer exists.
    //
    // A test suite whose membership depends on whether someone has run a build
    // is not a suite, it is a coincidence.
    const split = await read("../scripts/test-split.sh");
    expect(split).toContain("-not -path './dist/*'");
  });

  test("the release gate searches source directories, not the repo root", async () => {
    // The gate never had the dist problem because it searches `tests src`.
    // Pinned so a future edit does not "helpfully" widen it to `.`.
    const gate = await read("../scripts/test-gate.sh");
    expect(gate).toMatch(/find\s+tests\s+src\b/);
  });

  test("the discovery command, as written, returns nothing from dist/", async () => {
    // End-to-end rather than by inspection: pull the actual find(1) invocation
    // out of the script and run it. A previous version of this test asserted
    // expect(true).toBe(true) after a console.warn -- decorative, could not
    // fail, and would have reported success while dist crept back in.
    const split = await read("../scripts/test-split.sh");
    const find = split.match(/find \. \\\([\s\S]*?\| sort\)/)?.[0];
    expect(find, "the find command must be locatable in the script").toBeTruthy();

    const cmd = find!.replace(/^mapfile[^<]*< <\(/, "").replace(/\)$/, "");
    const proc = Bun.spawnSync(["bash", "-c", cmd], {
      cwd: new URL("..", import.meta.url).pathname,
    });
    const files = new TextDecoder().decode(proc.stdout).trim().split("\n").filter(Boolean);

    expect(files.length).toBeGreaterThan(50);          // it really discovered a suite
    expect(files.filter((f) => f.startsWith("dist/"))).toEqual([]);
  });
});

describe("the isolated runs retry once, loudly", () => {
  const split = async () =>
    await Bun.file(new URL("../scripts/test-split.sh", import.meta.url)).text();

  test("a failed isolated run is retried", async () => {
    expect(await split()).toContain("Retrying ONCE");
  });

  test("a file that fails twice still fails the run", async () => {
    // The point of a retry is to absorb a flake, not to make red impossible.
    const src = await split();
    expect(src).toContain("failed TWICE");
    expect(src).toMatch(/FAILED\+=/);
    expect(src).toMatch(/exit 1/);
  });

  test("a pass-on-retry is REPORTED, not swallowed", async () => {
    // A retry that hides the flake rate is the same silent-degradation defect
    // this suite keeps finding in the product. "Green" and "green after a
    // retry" must never render as the same report.
    const src = await split();
    expect(src).toContain("PASSED ONLY ON RETRY");
    expect(src).toMatch(/RETRIED\+=/);
  });

  test("pass 1 is NOT retried", async () => {
    // Ordinary deterministic tests. A retry there would hide a real
    // regression, which is the opposite of what this buys.
    const src = await split();
    const passOne = src.slice(src.indexOf("bun test \"${REST[@]}\""));
    const beforeIsolated = passOne.slice(0, passOne.indexOf("for iso in"));
    expect(beforeIsolated).not.toContain("Retrying");
  });

  test("the retry is scoped to the isolated list only", async () => {
    // Every retried file must be one the release gate also quarantines, so the
    // set of "allowed to be flaky" files cannot quietly grow.
    const src = await split();
    const retryBlock = src.slice(src.indexOf("for iso in"));
    expect(retryBlock).toContain("${ISOLATED_FILES[@]}");
  });
});

describe("the CI-only quarantine", () => {
  const split = async () =>
    await Bun.file(new URL("../scripts/test-split.sh", import.meta.url)).text();

  test("the quarantine applies ONLY when CI is set", async () => {
    // The file still runs on a developer machine. A quarantine that also
    // stopped local runs would delete the coverage rather than relocate it.
    const src = await split();
    const block = src.slice(src.indexOf("for iso in"));
    expect(block).toContain('if [ -n "${CI:-}" ]');
    expect(block).toContain("QUARANTINED_ON_CI");
  });

  test("a skip is announced, not silent", async () => {
    // This script's own discovery guard exists because "silently skipping it is
    // how a suite goes green while a file stops being tested". A quarantine is
    // a deliberate skip and gets held to the same standard.
    const src = await split();
    expect(src).toContain("SKIPPED ON CI");
    expect(src).toContain("NOT RUN on CI");
  });

  test("the quarantine list is small and explicitly enumerated", async () => {
    // Not a pattern, not a directory: a list someone has to type into, so
    // growing it is a visible act.
    const src = await split();
    const block = src.slice(src.indexOf("QUARANTINED_ON_CI=("));
    const files = [...block.slice(0, block.indexOf(")")).matchAll(/"(tests\/[^"]+)"/g)];
    expect(files.length).toBeGreaterThan(0);
    expect(files.length).toBeLessThanOrEqual(2);
  });

  test("everything quarantined on CI is also in the isolated list", async () => {
    // So a file cannot be quarantined without first having been isolated —
    // i.e. without having earned it.
    const src = await split();
    const q = src.slice(src.indexOf("QUARANTINED_ON_CI=("));
    const quarantined = [...q.slice(0, q.indexOf(")")).matchAll(/"(tests\/[^"]+)"/g)].map((m) => m[1]);
    const listed = (await Bun.file(new URL("../scripts/browser-tests.txt", import.meta.url).pathname).text())
      .split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#"));
    for (const f of quarantined) expect(listed, `${f} must be isolated too`).toContain(f);
  });

  test("the reason is recorded in the file, not just in a commit message", async () => {
    // A quarantine whose justification lives only in git history is one nobody
    // will ever revisit.
    const src = await split();
    expect(src).toMatch(/DETERMINISTIC|deterministic/);
    expect(src).toContain("hypotheses refuted");
  });
});
