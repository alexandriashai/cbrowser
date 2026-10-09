/**
 * Every tool that RUNS an NL test step asserts exactly, like nl_test_inline.
 *
 * B8 made nl_test assertions case-sensitive unless fuzzyMatch is on. flaky-check
 * and test-repair run the same steps through browser.assert and still compared
 * case-insensitively, so a test nl_test fails on case alone could be reported
 * stable or "verified repaired" by those tools (skeptic finding, 2026-10-09).
 * A class sweep over the source: a new runner that forgets the flag goes red.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";

const RUNNERS = ["src/testing/flaky-detection.ts", "src/testing/test-repair.ts", "src/testing/nl-test-suite.ts"];

describe("NL step runners pass an explicit caseSensitive to browser.assert", () => {
  for (const file of RUNNERS) {
    test(file, () => {
      const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      const calls = src.match(/\.assert\(step\.instruction[^)]*\)/g) ?? [];
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) expect(c).toContain("caseSensitive");
    });
  }
});
