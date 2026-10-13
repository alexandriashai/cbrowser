/**
 * Terminal escape injection (push review of 0ee2c27): `cbrowser console` printed
 * page-controlled text to the terminal raw, so a page could log ANSI/OSC sequences
 * that set the terminal title, write the clipboard (OSC 52), or move the cursor to
 * hide or forge output. The CLI prints page-derived text in many places (titles,
 * extract, links), so its stdout and stderr are guarded at the boundary: every
 * string written is made terminal-safe.
 */
import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { terminalSafe } from "../src/terminal-safe.js";

const UNSAFE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;

describe("terminalSafe", () => {
  test("ESC, BEL, C1 CSI and bidi overrides come out as visible escapes", () => {
    const s = terminalSafe("a\u001b]52;c;cHduZWQ=\u0007b\u001b[2Jc\u009bd\u202ee");
    expect(UNSAFE.test(s)).toBe(false);
    expect(s).toBe("a\\x1b]52;c;cHduZWQ=\\u0007b\\x1b[2Jc\\u009bd\\u202ee");
  });

  test("a leading carriage return (a progress line) is kept; any other is escaped", () => {
    expect(terminalSafe("\r   Step 1")).toBe("\r   Step 1");
    expect(terminalSafe("ok\rforged")).toBe("ok\\rforged");
  });

  test("newline and tab pass through", () => {
    expect(terminalSafe("a\tb\nc")).toBe("a\tb\nc");
  });

  test("property: no unsafe character survives, and safe text is unchanged", () => {
    fc.assert(fc.property(fc.string({ unit: "binary", maxLength: 200 }), (s) => {
      const out = terminalSafe(s);
      const body = out.startsWith("\r") ? out.slice(1) : out;
      if (UNSAFE.test(body)) return false;
      if (!UNSAFE.test(s) && out !== s) return false;
      return true;
    }), { numRuns: 1000 });
  });
});
