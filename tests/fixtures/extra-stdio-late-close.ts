/**
 * The late-close chain behind the CLI-child hang, without a browser.
 *
 * 1. A node:child_process child with Playwright's stdio, ["ignore", "pipe",
 *    "pipe", "pipe", "pipe"], runs and exits. Its ChildProcess then becomes
 *    unreachable, as Playwright's does after browser.close().
 * 2. Bun.spawn children take the freed fd numbers for their pidfds (the
 *    kernel hands out the lowest free number).
 * 3. A forced GC finalizes the dead ChildProcess. Bun before 1.4.0 closes its
 *    pipes 3 and 4 again at that point, which shuts a live child's pidfd.
 *    That child's `exited` never resolves and it stays a zombie.
 *
 * Imported by tests/bun-extra-stdio-late-close.test.ts, and run as a script
 * (`bun run`, so without the test preload) to show what Bun does unguarded.
 * Prints the result as JSON when run directly.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { spawn } from "node:child_process";
import { readdirSync, readlinkSync } from "node:fs";

export interface LateCloseResult {
  /** Parent-side fds the dead child held, all closed once it went away. */
  freed: number[];
  /** Freed numbers a live Bun.spawn child's pidfd took. */
  covered: number[];
  /** Of those, the pidfds closed by someone other than their owner. */
  lateClosed: number[];
  /** Bun.spawn children whose `exited` never resolved. */
  stranded: number[];
  children: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const target = (fd: number) => {
  try {
    return readlinkSync(`/proc/self/fd/${fd}`);
  } catch {
    return null;
  }
};
const openFds = () => new Set(readdirSync("/proc/self/fd").map(Number));

/** Runs and reaps a child with Playwright's stdio; returns the fds it held. */
async function runDeadChild(): Promise<number[]> {
  const before = openFds();
  const child = spawn("/bin/sh", ["-c", "sleep 0.2"], {
    stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"],
  });
  await sleep(50);
  const held = [...openFds()].filter((fd) => !before.has(fd));
  await new Promise((resolve) => child.once("close", resolve));
  await sleep(50);
  return held;
}

export async function lateCloseChain(): Promise<LateCloseResult> {
  const held = await runDeadChild();
  const freed = held.filter((fd) => target(fd) === null);

  // Spawn until a pidfd sits on every freed number, or give up at 32.
  const children: Array<ReturnType<typeof Bun.spawn>> = [];
  const pidfdOn = (fd: number) => target(fd) === "anon_inode:[pidfd]";
  while (children.length < 32 && !freed.every(pidfdOn)) {
    children.push(Bun.spawn(["/bin/sleep", "1"], { stdin: "ignore", stdout: "ignore", stderr: "ignore" }));
  }
  const covered = freed.filter(pidfdOn);

  for (let i = 0; i < 5; i++) {
    Bun.gc(true);
    await sleep(20);
  }
  const lateClosed = covered.filter((fd) => !pidfdOn(fd));

  const settled = await Promise.all(
    children.map((child) => Promise.race([child.exited.then(() => true), sleep(4000).then(() => false)])),
  );
  const stranded = children.filter((_, i) => !settled[i]).map((child) => child.pid);
  return { freed, covered, lateClosed, stranded, children: children.length };
}

if (import.meta.main) {
  console.log(JSON.stringify(await lateCloseChain()));
  process.exit(0);
}
