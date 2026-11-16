/**
 * releaseConsoleArgs disposes every argument handle of a console message
 * (ISA 20261112-cbrowser-sessions-leaks ISC-5; 2026-11-15). The heap effect is
 * measured in the ISA: through CBrowser, a page logging 512 KB every 20 ms held
 * 285-353 MB with the release and grew 482 -> 959 MB in 20 s without it.
 */
import { describe, test, expect } from "bun:test";
import { releaseConsoleArgs } from "../src/console-handles.js";

describe("releaseConsoleArgs", () => {
  test("disposes each argument handle once", () => {
    const disposed: number[] = [];
    const msg = { args: () => [0, 1, 2].map((i) => ({ dispose: async () => { disposed.push(i); } })) };
    releaseConsoleArgs(msg);
    expect(disposed).toEqual([0, 1, 2]);
  });

  test("a rejected dispose, a throwing args() or no args() does not throw", async () => {
    expect(() => releaseConsoleArgs({ args: () => [{ dispose: () => Promise.reject(new Error("gone")) }] })).not.toThrow();
    expect(() => releaseConsoleArgs({ args: () => { throw new Error("closed"); } })).not.toThrow();
    expect(() => releaseConsoleArgs({})).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
  });
});
