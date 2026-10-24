/**
 * withVirtualTime must hand the real clock back when it returns.
 *
 * 2026-10-24, the 21.0 release gate on CI: poll-until-bounded failed five
 * tests at exactly the 5 s test timeout, though it passes alone. The journey
 * fixture's virtual clock restored setTimeout and called setSystemTime() in
 * its finally, but a timer still queued when fn returned kept being pumped
 * through setImmediate, and each pump called setSystemTime(new Date(now))
 * again. Date.now() then stayed frozen for every later file in the process,
 * so a loop that waits for Date.now() to pass a deadline never ends.
 */
import { describe, expect, test } from "bun:test";
import { withVirtualTime } from "./fixtures/journey-world.js";

/** Let every setImmediate the fixture may have queued run. */
async function drainImmediates(rounds = 20): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setImmediate(r));
}

describe("withVirtualTime", () => {
  test("a timer still queued when fn returns does not keep the clock frozen", async () => {
    await withVirtualTime(async () => {
      // Left pending on purpose: a journey that returns while a page wait or
      // an animation timer is still scheduled.
      setTimeout(() => {}, 60_000);
      setTimeout(() => {}, 120_000);
    });
    await drainImmediates();
    const before = Date.now();
    await new Promise((r) => setTimeout(r, 30));
    expect(Date.now() - before).toBeGreaterThanOrEqual(20);
    // And the clock is the wall clock, not the virtual epoch.
    expect(Math.abs(Date.now() - performance.timeOrigin - performance.now())).toBeLessThan(5_000);
  });

  test("a timer left queued never fires after the clock is handed back", async () => {
    let fired = false;
    await withVirtualTime(async () => {
      setTimeout(() => { fired = true; }, 10);
    });
    await drainImmediates();
    expect(fired).toBe(false);
  });

  test("the real setTimeout is back after fn returns", async () => {
    const real = globalThis.setTimeout;
    await withVirtualTime(async () => {
      expect(globalThis.setTimeout).not.toBe(real);
    });
    expect(globalThis.setTimeout).toBe(real);
  });
});
