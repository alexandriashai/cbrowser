/**
 * What a CLI command run with no daemon found tells the user about the page it
 * acts on (src/page-continuity.ts). The end-to-end check, with real browsers
 * and a real daemon, is tests/cli-page-continuity.test.ts.
 */
import { describe, expect, test } from "bun:test";
import { actsOnCurrentPage, blankPageRefusal, openedUrl, PAGE_COMMANDS, reloadNote, type BlankPageReason } from "../src/page-continuity.js";

/** Arguments each page command takes, so `run` gets a step the parser knows. */
const argsFor = (c: string): string[] => (c === "run" ? ["click the login button"] : ["a"]);

describe("openedUrl", () => {
  test("--url is the page a command opens first, for every page command", () => {
    for (const c of PAGE_COMMANDS) expect(openedUrl(c, argsFor(c), { url: "http://x.test/" }), c).toBe("http://x.test/");
  });

  test("screenshot and extract also take the URL as their first argument", () => {
    expect(openedUrl("screenshot", ["https://x.test/", "out.png"], {})).toBe("https://x.test/");
    expect(openedUrl("extract", ["www.x.test", "links"], {})).toBe("www.x.test");
  });

  test("a run step that goes to a URL opens it", () => {
    expect(openedUrl("run", ["go to https://x.test/a"], {})).toBe("https://x.test/a");
    expect(openedUrl("run", ["click the login button"], {})).toBeUndefined();
  });

  test("a first argument that is not a URL is not one", () => {
    expect(openedUrl("screenshot", ["out.png"], {})).toBeUndefined();
    expect(openedUrl("extract", ["links"], {})).toBeUndefined();
    // A selector that looks like a URL is still a selector for click.
    expect(openedUrl("click", ["https://x.test/"], {})).toBeUndefined();
  });
});

describe("actsOnCurrentPage", () => {
  // Written out, not read from PAGE_COMMANDS: a loop over the list itself
  // cannot notice an entry dropped from it.
  const EXPECTED = [
    "click", "hover", "fill", "type", "press", "keyboard", "drag", "upload", "evaluate", "eval",
    "extract", "screenshot", "smart-click", "dismiss-overlay", "assert", "run",
  ];

  test("every page command with no URL to open acts on the page in front of it", () => {
    expect([...PAGE_COMMANDS].sort()).toEqual([...EXPECTED].sort());
    for (const c of EXPECTED) expect(actsOnCurrentPage(c, argsFor(c), {}), c).toBe(true);
    // scroll reaches the check as run.
    expect(actsOnCurrentPage("run", ["scroll to bottom"], {})).toBe(true);
  });

  test("one told a URL to open does not", () => {
    expect(actsOnCurrentPage("evaluate", ["1"], { url: "http://x.test/" })).toBe(false);
    expect(actsOnCurrentPage("screenshot", ["http://x.test/"], {})).toBe(false);
    expect(actsOnCurrentPage("run", ["go to https://x.test/"], {})).toBe(false);
  });

  test("a run step the parser does not know is left to fail with its own message", () => {
    expect(actsOnCurrentPage("run", ["do something vague"], {})).toBe(false);
  });

  test("commands that do not act on a page do not (cookie list, navigate, storage, perf)", () => {
    for (const c of ["cookie", "navigate", "storage", "session", "perf"]) expect(actsOnCurrentPage(c, ["a"], {}), c).toBe(false);
  });
});

describe("blankPageRefusal", () => {
  const reasons: Array<[BlankPageReason, string]> = [
    ["no-restore", "--no-restore"],
    ["no-persistent", "--no-persistent"],
    ["nothing-saved", "no saved page in data dir /data"],
  ];

  test("names the blank page, its cause, the way out and the data dir", () => {
    for (const [reason, cause] of reasons) {
      const r = blankPageRefusal("evaluate", reason, "/data", true);
      expect(r, reason).toContain("about:blank");
      expect(r, reason).toContain(cause);
      expect(r, reason).toContain("--url <url>");
      expect(r, reason).toContain("cbrowser daemon start");
      expect(r, reason).toContain("/data");
      expect(r, reason).toContain("--url about:blank");
    }
  });

  test("a saved page needs a command that ended without an error, not only an hour", () => {
    expect(blankPageRefusal("evaluate", "nothing-saved", "/data", true)).toContain("ends without an error");
  });

  test("a command the daemon refuses is not sent to the daemon (assert, smart-click)", () => {
    const r = blankPageRefusal("assert", "nothing-saved", "/data", false);
    expect(r).not.toContain("cbrowser daemon start");
    expect(r).toContain("assert does not run in the daemon");
    expect(r).toContain("cbrowser test-suite");
  });
});

describe("reloadNote", () => {
  test("names the data dir searched, the page reloaded, what carries over and what does not", () => {
    const note = reloadNote("http://x.test/page", "evaluate", "/data", true);
    expect(note).toContain("No daemon found for data dir /data");
    expect(note).toContain("http://x.test/page");
    expect(note).toContain("localStorage carry over");
    expect(note).toContain("sessionStorage");
    expect(note).toContain("script variables");
    expect(note).toContain("cbrowser daemon start");
    expect(note).toContain("another data dir");
  });

  test("for a command the daemon does not run, it points at a test-suite instead", () => {
    const note = reloadNote("http://x.test/page", "a11y", "/data", false);
    expect(note).not.toContain("cbrowser daemon start");
    expect(note).toContain("a11y does not run in the daemon");
  });
});
