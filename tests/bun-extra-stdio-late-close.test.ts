/**
 * A dead browser's pipes cannot close a live child's pidfd.
 *
 * The intermittent CLI-child hang (journey-replies-browser,
 * cli-journey-dialog-browser, real-personas-dir in the gate): a CLI child
 * started with Bun.spawn exited, and its `exited` never resolved, so the test
 * sat to its timeout. Caught in the act: the child was a zombie, and the test
 * process held no pidfd for it. A syscall trace of a hung run showed the
 * main thread closing that pidfd's number about 8 s after a chromium had gone,
 * once with success and then again with EBADF, together with the number next
 * to it. Those two were the dead chromium's CDP pipes, already closed once.
 *
 * Cause: Bun before 1.4.0 closes a node:child_process child's pipes 3 and up a
 * second time when the dead ChildProcess is garbage collected (measured on
 * 1.3.8 and 1.3.14; 1.4.0 and 1.4.4 do not). Playwright starts chromium with
 * five stdio entries, so every closed browser leaves two such numbers behind.
 * tests/fixtures/extra-stdio-guard.ts, preloaded by bunfig.toml, keeps those
 * ChildProcess objects reachable so the second close never happens.
 *
 * tests/fixtures/extra-stdio-late-close.ts makes the chain deterministic with a
 * forced GC. The third test runs it without the preload, which shows the chain
 * can see the bug, and says when Bun no longer needs the guard.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { lateCloseChain, type LateCloseResult } from "./fixtures/extra-stdio-late-close";

const ROOT = join(import.meta.dir, "..");
const FIXTURE = join(import.meta.dir, "fixtures", "extra-stdio-late-close.ts");
/** Read the guard's registry directly: importing the guard here would install it. */
const kept = () => (globalThis as Record<symbol, Set<ChildProcess> | undefined>)[Symbol.for("cbrowser.extraStdioGuard")];
const bunHasTheBug = Bun.semver.order(Bun.version, "1.4.0") < 0;

describe("Bun's second close of a dead child's extra stdio", () => {
  test("the test preload keeps a child with extra stdio reachable", async () => {
    expect(kept(), "bunfig.toml must preload tests/fixtures/extra-stdio-guard.ts").toBeInstanceOf(Set);
    const withExtra = spawn("/bin/sh", ["-c", "exit 0"], { stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"] });
    const plain = spawn("/bin/sh", ["-c", "exit 0"], { stdio: ["ignore", "pipe", "pipe"] });
    await Promise.all([withExtra, plain].map((child) => new Promise((resolve) => child.once("close", resolve))));
    expect(kept()!.has(withExtra)).toBe(true);
    expect(kept()!.has(plain)).toBe(false);
  });

  test("a dead child with extra stdio cannot strand a Bun.spawn child", async () => {
    const result = await lateCloseChain();
    // The chain only means something if live pidfds sat on the dead child's numbers.
    expect(result.covered.length).toBeGreaterThanOrEqual(4);
    expect(result.lateClosed).toEqual([]);
    expect(result.stranded).toEqual([]);
  }, 20_000);

  test(`without the preload, Bun ${Bun.version} ${bunHasTheBug ? "still closes them twice" : "closes them once"}`, async () => {
    // `bun run` does not apply bunfig's [test] preload, so this is Bun unguarded.
    const proc = Bun.spawn([process.execPath, "run", FIXTURE], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    expect(code, err).toBe(0);
    const result = JSON.parse(out.trim().split("\n").pop()!) as LateCloseResult;
    expect(result.covered.length).toBeGreaterThanOrEqual(4);
    if (bunHasTheBug) {
      expect(result.lateClosed.length, "the chain must see the bug where Bun has it").toBeGreaterThan(0);
      expect(result.stranded.length).toBeGreaterThan(0);
    } else {
      // Bun 1.4.0 fixed it. If this fails on a newer Bun, the bug is back and
      // the guard is what keeps the suite from hanging.
      expect(result.lateClosed).toEqual([]);
      expect(result.stranded).toEqual([]);
    }
  }, 30_000);
});
