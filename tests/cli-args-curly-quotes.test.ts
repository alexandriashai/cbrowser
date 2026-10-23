/**
 * A flag value typed in curly quotes (src/cli-args.ts joinCurlyQuoted).
 *
 * Shells quote only with straight quotes, so on 2026-10-23
 *   cbrowser cognitive-journey ucdenver --start https://ucdenver.edu --goal “find exact tuition cost for undergraduate students”
 * reached the CLI as separate words, and the journey ran with the goal "“find".
 * The words up to the closing curly quote are now one value, and a note says so.
 */
import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { parseArgs } from "../src/cli-args.js";

const ARGV = ["cognitive-journey", "ucdenver", "--start", "https://ucdenver.edu", "--goal",
  "“find", "exact", "tuition", "cost", "for", "undergraduate", "students”"];

describe("curly-quoted flag values", () => {
  test("the run that failed: the goal is the whole sentence and the name stays positional", () => {
    const p = parseArgs(ARGV);
    expect(p.options.goal).toBe("find exact tuition cost for undergraduate students");
    expect(p.options.start).toBe("https://ucdenver.edu");
    expect(p.args).toEqual(["ucdenver"]);
    expect(p.notes).toHaveLength(1);
    expect(p.notes![0]).toContain('--goal was in curly quotes');
    expect(p.notes![0]).toContain('"find exact tuition cost for undergraduate students"');
  });

  test("flags after the quoted value still parse", () => {
    const p = parseArgs(["j", "--goal", "‘sign", "up’", "--persona", "first-timer"]);
    expect(p.options).toMatchObject({ goal: "sign up", persona: "first-timer" });
    expect(p.args).toEqual([]);
  });

  test("one curly-quoted word loses its quotes", () => {
    expect(parseArgs(["j", "--goal", "“pricing”"]).options.goal).toBe("pricing");
  });

  test("the --flag=value form is joined the same way", () => {
    expect(parseArgs(["j", "--goal=“find", "the", "price”"]).options.goal).toBe("find the price");
  });

  test("a quote that never closes takes nothing more and says so", () => {
    const p = parseArgs(["j", "--goal", "“find", "the", "price", "--persona", "x"]);
    expect(p.options.goal).toBe("“find");
    expect(p.args).toEqual(["the", "price"]);
    expect(p.notes![0]).toContain("never closes");
  });

  test("a straight-quoted value (one shell word) is untouched and leaves no note", () => {
    const p = parseArgs(["j", "--goal", "find the price"]);
    expect(p.options.goal).toBe("find the price");
    expect(p.notes).toBeUndefined();
  });

  test("for any words, a value curly-quoted around them is read as those words joined", () => {
    const word = fc.string({ minLength: 1 }).filter((w) => !/[\s“”‘’„‚«»]/.test(w) && !w.startsWith("--"));
    fc.assert(fc.property(fc.array(word, { minLength: 1, maxLength: 8 }), (words) => {
      const quoted = `“${words.join(" ")}”`.split(" ");
      const p = parseArgs(["j", "--goal", ...quoted, "--persona", "p"]);
      expect(p.options.goal).toBe(words.join(" "));
      expect(p.options.persona).toBe("p");
      expect(p.args).toEqual([]);
    }), { numRuns: 300 });
  });
});
