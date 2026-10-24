/**
 * Test preload (bunfig.toml): keep every node:child_process child that has
 * extra stdio pipes reachable for the life of the process.
 *
 * Bun 1.3.8 closes the parent ends of a child's pipes 3 and up a second time
 * when the dead ChildProcess is garbage collected, after they were already
 * closed when the child went away. By then the fd numbers have usually been
 * reused, so the late close shuts whatever holds them now. Playwright starts
 * chromium with stdio ["ignore", "pipe", "pipe", "pipe", "pipe"] and speaks
 * CDP over pipes 3 and 4, so every closed browser leaves two such numbers
 * behind. Measured on this tree (tests/bun-extra-stdio-late-close.test.ts):
 *
 *   - the next browser takes the same two numbers for its own CDP pipe, and
 *     a GC after the first browser closed leaves the second one unable to
 *     answer: newPage() never returns
 *   - a Bun.spawn child takes one of the numbers for its pidfd, the late close
 *     destroys it, Bun never reaps the child, and `exited` never resolves.
 *     The CLI tests' replay children sat as zombies to their 240 s timeout.
 *
 * Both are intermittent in a real run because they need a GC to finalize the
 * dead ChildProcess while one of its old numbers is in use again. Keeping the
 * object reachable means it is never finalized, so the second close never
 * happens. Keeping only its stdio sockets is not enough: a pipe nobody reads
 * still gets the second close. The cost, measured over 20 chromium launches,
 * is about 170 KiB of heap per launch (251 KiB/launch kept, 80-85 without),
 * held until the process exits.
 *
 * Only children with more than three stdio entries are kept: Bun's own
 * three-pipe children and Bun.spawn children do not close anything twice.
 * Not in src/: the installed CLI and the servers run under Node, which has no
 * such bug. Running cbrowser itself under Bun is exposed to it.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { ChildProcess } from "node:child_process";

const KEY = Symbol.for("cbrowser.extraStdioGuard");
const registry = globalThis as typeof globalThis & { [KEY]?: Set<ChildProcess> };

if (process.versions.bun && !registry[KEY]) {
  const kept = new Set<ChildProcess>();
  registry[KEY] = kept;
  const spawn = ChildProcess.prototype.spawn;
  ChildProcess.prototype.spawn = function (this: ChildProcess, ...args: Parameters<typeof spawn>) {
    const result = spawn.apply(this, args);
    if ((this.stdio?.length ?? 0) > 3) kept.add(this);
    return result;
  };
}

/** The children kept so far (for tests). Empty when not running under Bun. */
export function keptChildren(): ReadonlySet<ChildProcess> {
  return registry[KEY] ?? new Set();
}
