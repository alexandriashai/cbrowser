/**
 * --plain keeps pass/fail meaning (audit 2026-10-21, output lane 7).
 *
 * stripDecorations deleted check and cross glyphs outright, so in the
 * screen-reader mode a passing and a failing test line read the same, and
 * `Success: ✓` became `Success:`. It also collapsed every run of whitespace,
 * newlines included, which rewrote multi-line text.
 */
import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { stripDecorations } from "../src/output.js";

describe("stripDecorations", () => {
  test("pass, fail and warning glyphs become words", () => {
    expect(stripDecorations("✓ login works")).toBe("[PASS] login works");
    expect(stripDecorations("✗ checkout fails")).toBe("[FAIL] checkout fails");
    expect(stripDecorations("❌ broken")).toBe("[FAIL] broken");
    expect(stripDecorations("✅ fine")).toBe("[PASS] fine");
    expect(stripDecorations("⚠️ careful")).toBe("[WARN] careful");
    expect(stripDecorations("   Success: ✓")).toBe(" Success: [PASS]");
  });

  test("a passing and a failing line never read the same", () => {
    fc.assert(fc.property(fc.stringMatching(/^[a-z ]{1,30}$/), (rest) =>
      stripDecorations(`✓ ${rest}`) !== stripDecorations(`✗ ${rest}`)));
  });

  test("newlines survive", () => {
    expect(stripDecorations("line one\n\nline two")).toBe("line one\n\nline two");
  });

  test("other decoration still goes", () => {
    expect(stripDecorations("🔍 Searching ━━━")).toBe(" Searching ---");
  });
});
