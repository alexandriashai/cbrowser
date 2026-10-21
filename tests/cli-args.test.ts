/**
 * CLI argument parsing — negative flags
 *
 * Regression tests for a bug shipped in 18.72.3: `--no-x` set only
 * options["no-x"], so any reader written as `options.x !== false` never saw the
 * flag. Measured across the four documented negative flags:
 *
 *   --no-color      reads options["no-color"]   worked
 *   --no-vision     reads options["no-vision"]  worked
 *   --no-persistent reads options.persistent    SILENTLY IGNORED
 *   --no-restore    reads options.restore       SILENTLY IGNORED
 *
 * The two broken ones are both opt-outs for persisted browser state, so state
 * the user explicitly asked to discard was kept: `cbrowser cookie list
 * --no-persistent` still returned cookies out of the persistent profile. A
 * silently-ignored flag is worse than a rejected one - the command exits 0 and
 * looks like it honoured the request.
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { BOOLEAN_FLAGS, parseArgs } from "../src/cli-args.js";

const opts = (argv: string[]) => parseArgs(["cmd", ...argv]).options;

describe("negative flags set the stripped key to false", () => {
  test("--no-persistent (was silently ignored)", () => {
    // The exact read in cli.ts: options.persistent !== false && !== "false"
    const o = opts(["--no-persistent"]);
    expect(o.persistent).toBe(false);
    expect(o.persistent !== false).toBe(false); // i.e. persistentMode is now off
  });

  test("--no-restore (was silently ignored)", () => {
    expect(opts(["--no-restore"]).restore).toBe(false);
  });
});

describe("flags that already worked keep working", () => {
  test("--no-color still sets options['no-color']", () => {
    expect(opts(["--no-color"])["no-color"]).toBe(true);
  });

  test("--no-vision still sets options['no-vision']", () => {
    expect(opts(["--no-vision"])["no-vision"]).toBe(true);
  });

  test("both spellings are present, so either reader resolves", () => {
    const o = opts(["--no-persistent"]);
    expect(o["no-persistent"]).toBe(true);
    expect(o.persistent).toBe(false);
  });
});

describe("the inversion does not overreach", () => {
  test("a --no-x given an explicit value with = is not inverted", () => {
    // `--no-cache=foo` means the value "foo"; flipping it to cache=false would
    // invent a flag the user did not pass. (Before 2026-10-21 the space form
    // `--no-cache foo` also took a value, which made `screenshot --no-restore
    // out.png` swallow the path; no real --no-* flag takes a value.)
    const o = opts(["--no-cache=foo"]);
    expect(o["no-cache"]).toBe("foo");
    expect(o.cache).toBeUndefined();
  });

  test("a bare --no is not treated as a negation", () => {
    expect(opts(["--no"])["no"]).toBe(true);
    expect(Object.keys(opts(["--no"]))).toEqual(["no"]);
  });

  test("ordinary flags are untouched", () => {
    const o = opts(["--headless", "--device", "iphone-15"]);
    expect(o.headless).toBe(true);
    expect(o.device).toBe("iphone-15");
  });

  test("positional args still separate from options", () => {
    const p = parseArgs(["navigate", "https://example.com", "--no-persistent"]);
    expect(p.command).toBe("navigate");
    expect(p.args).toEqual(["https://example.com"]);
    expect(p.options.persistent).toBe(false);
  });
});

/**
 * Audit 2026-10-21 (flags lane, findings 13 and 14): `--flag=value` was not
 * parsed, and a flag that takes no value swallowed the next positional.
 */
describe("--flag=value and flags that take no value", () => {
  test("--key=value sets the value (was a flag named 'max-pages=50')", () => {
    const o = opts(["--max-pages=50"]);
    expect(o["max-pages"]).toBe("50");
    expect(o["max-pages=50"]).toBeUndefined();
  });

  test("a value may itself contain =", () => {
    expect(opts(["--url=https://x.test/?a=1&b=2"]).url).toBe("https://x.test/?a=1&b=2");
  });

  test("--flag=false on an on/off flag is false, not the string 'false'", () => {
    expect(opts(["--screenshot-on-failure=false"])["screenshot-on-failure"]).toBe(false);
    expect(opts(["--force=true"]).force).toBe(true);
  });

  test("a --no-* flag does not swallow the next positional", () => {
    const p = parseArgs(["screenshot", "--no-restore", "out.png"]);
    expect(p.args).toEqual(["out.png"]);
    expect(p.options.restore).toBe(false);
    expect(p.options["no-restore"]).toBe(true);
  });

  test("an on/off flag does not swallow the next positional", () => {
    const p = parseArgs(["screenshot", "--full-page", "out.png"]);
    expect(p.args).toEqual(["out.png"]);
    expect(p.options["full-page"]).toBe(true);
  });

  test("a flag that takes a value still takes it", () => {
    expect(opts(["--output", "report.json"]).output).toBe("report.json");
  });

  test("every on/off flag leaves the following word as a positional", () => {
    fc.assert(fc.property(
      fc.constantFrom(...BOOLEAN_FLAGS),
      fc.stringMatching(/^[a-z0-9./:_-]{1,20}$/).filter((w) => !w.startsWith("--")),
      (flag, word) => {
        const p = parseArgs(["cmd", `--${flag}`, word]);
        return p.options[flag] === true && p.args.length === 1 && p.args[0] === word;
      },
    ));
  });
});
