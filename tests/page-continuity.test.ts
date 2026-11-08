/**
 * What a CLI command run with no daemon found tells the user about the page it
 * acts on (src/page-continuity.ts), and which saved pages are worth reloading
 * (isRestorablePageUrl). The end-to-end check, with real browsers and a real
 * daemon, is tests/cli-page-continuity.test.ts.
 */
import { describe, expect, test } from "bun:test";
import {
  actsOnCurrentPage, blankPageRefusal, keepPageAdvice, openedUrl, PAGE_COMMANDS, pageCommandName,
  reloadNote, restoreFailedMessage, type BlankPageReason,
} from "../src/page-continuity.js";
import { isRestorablePageUrl } from "../src/utils.js";

/** Arguments each page command takes, so `run` gets a step the parser knows. */
const argsFor = (c: string): string[] => (c === "run" ? ["click the login button"] : ["a"]);

/**
 * The page subcommands, written out, with whether each takes its URL after the
 * subcommand. Each gets a name and --duration in the tests below: visual and
 * session save need the name, and only a bounded capture counts.
 */
const SUBCOMMANDS: Array<[string, string, boolean]> = [
  ["a11y", "audit", true],
  ["perf", "audit", true],
  ["visual", "save", false],
  ["visual", "compare", false],
  ["session", "save", false],
  ["capture", "start", true],
];
const BOUNDED = { duration: "1" };

describe("openedUrl", () => {
  test("--url is the page a command opens first, for every page command", () => {
    for (const c of PAGE_COMMANDS) expect(openedUrl(c, argsFor(c), { url: "http://x.test/" }), c).toBe("http://x.test/");
    for (const [c, sub] of SUBCOMMANDS) expect(openedUrl(c, [sub, "name"], { url: "http://x.test/" }), c).toBe("http://x.test/");
  });

  test("screenshot and extract also take the URL as their first argument", () => {
    expect(openedUrl("screenshot", ["https://x.test/", "out.png"], {})).toBe("https://x.test/");
    expect(openedUrl("extract", ["www.x.test", "links"], {})).toBe("www.x.test");
  });

  test("a11y audit, perf audit and capture start take it after the subcommand; visual and session save do not", () => {
    for (const [c, sub, positional] of SUBCOMMANDS) {
      expect(openedUrl(c, [sub, "http://x.test/"], BOUNDED), `${c} ${sub}`).toBe(positional ? "http://x.test/" : undefined);
    }
  });

  test("bare perf takes it first: perf [url]", () => {
    expect(openedUrl("perf", ["http://x.test/"], {})).toBe("http://x.test/");
    expect(openedUrl("perf", [], {})).toBeUndefined();
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

  test("so does every page subcommand with no URL, and bare perf", () => {
    // visual and session save take a name where a11y audit takes its URL.
    for (const [c, sub, positional] of SUBCOMMANDS) {
      expect(actsOnCurrentPage(c, positional ? [sub] : [sub, "name"], BOUNDED), `${c} ${sub}`).toBe(true);
    }
    expect(actsOnCurrentPage("perf", [], {})).toBe(true);
  });

  test("the other subcommands of those commands do not (list, load, stop, delete)", () => {
    for (const [c, sub] of [["visual", "list"], ["visual", "delete"], ["session", "load"], ["session", "list"], ["capture", "stop"], ["capture", "status"], ["a11y", undefined], ["a11y", "toString"]] as const) {
      expect(actsOnCurrentPage(c, sub ? [sub, "x"] : [], BOUNDED), `${c} ${sub}`).toBe(false);
    }
  });

  test("a form missing its name is left to its usage error; an open-ended capture to its own", () => {
    expect(actsOnCurrentPage("visual", ["save"], {})).toBe(false);
    expect(actsOnCurrentPage("visual", ["compare"], {})).toBe(false);
    expect(actsOnCurrentPage("session", ["save"], {})).toBe(false);
    expect(actsOnCurrentPage("capture", ["start"], {})).toBe(false);
    for (const until of ["until-element", "until-element-gone", "until-idle"]) {
      expect(actsOnCurrentPage("capture", ["start"], { [until]: "x" }), until).toBe(true);
    }
  });

  test("one told a URL to open does not", () => {
    expect(actsOnCurrentPage("evaluate", ["1"], { url: "http://x.test/" })).toBe(false);
    expect(actsOnCurrentPage("screenshot", ["http://x.test/"], {})).toBe(false);
    expect(actsOnCurrentPage("run", ["go to https://x.test/"], {})).toBe(false);
    expect(actsOnCurrentPage("a11y", ["audit", "http://x.test/"], {})).toBe(false);
    expect(actsOnCurrentPage("visual", ["save", "base"], { url: "http://x.test/" })).toBe(false);
  });

  test("a run step the parser does not know is left to fail with its own message", () => {
    expect(actsOnCurrentPage("run", ["do something vague"], {})).toBe(false);
  });

  test("commands that do not act on a page do not (cookie list, navigate, storage)", () => {
    for (const c of ["cookie", "navigate", "storage"]) expect(actsOnCurrentPage(c, ["a"], {}), c).toBe(false);
  });
});

describe("pageCommandName", () => {
  test("a page subcommand is named with its subcommand", () => {
    expect(pageCommandName("a11y", ["audit"])).toBe("a11y audit");
    expect(pageCommandName("evaluate", ["1"])).toBe("evaluate");
    expect(pageCommandName("visual", ["list"])).toBe("visual");
    expect(pageCommandName("perf", [])).toBe("perf");
    expect(pageCommandName("perf", ["audit"])).toBe("perf audit");
    expect(pageCommandName("capture", ["start"], BOUNDED)).toBe("capture start");
  });
});

describe("isRestorablePageUrl", () => {
  test("a web or file page is worth reloading", () => {
    for (const u of ["http://x.test/", "https://x.test/a?b", "file:///tmp/a.html", "data:text/html,<p>x"]) expect(isRestorablePageUrl(u), u).toBe(true);
  });

  test("a blank page or the browser's own error page is not (a failed load leaves chrome-error://)", () => {
    for (const u of [
      "", "about:blank", " about:blank ", "ABOUT:BLANK", "chrome-error://chromewebdata/", "about:neterror?e=x",
      "chrome://settings", "chrome-extension://abc/p.html", "chrome-search://local-ntp", "devtools://x",
      "edge://settings", "view-source:http://x.test/", undefined, null,
    ]) {
      expect(isRestorablePageUrl(u), String(u)).toBe(false);
    }
  });
});

describe("keepPageAdvice", () => {
  test("the daemon for what it runs, a test-suite for the other page commands, the URL for the rest", () => {
    expect(keepPageAdvice("evaluate", true)).toBe("daemon");
    expect(keepPageAdvice("assert", false)).toBe("test-suite");
    expect(keepPageAdvice("a11y", false)).toBe("url");
    // A bounded capture records in a browser of its own even with a daemon up.
    expect(keepPageAdvice("capture", false)).toBe("url");
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
      const r = blankPageRefusal("evaluate", reason, "/data", "daemon");
      expect(r, reason).toContain("about:blank");
      expect(r, reason).toContain(cause);
      expect(r, reason).toContain("--url <url>");
      expect(r, reason).toContain("cbrowser daemon start");
      expect(r, reason).toContain("/data");
      expect(r, reason).toContain("--url about:blank");
    }
  });

  test("a saved page needs a command that ended without an error, not only an hour", () => {
    expect(blankPageRefusal("evaluate", "nothing-saved", "/data", "daemon")).toContain("ends without an error");
  });

  test("a command the daemon refuses is not sent to the daemon", () => {
    const suite = blankPageRefusal("assert", "nothing-saved", "/data", "test-suite");
    expect(suite).not.toContain("cbrowser daemon start");
    expect(suite).toContain("assert does not run in the daemon");
    expect(suite).toContain("cbrowser test-suite");
    const url = blankPageRefusal("a11y audit", "nothing-saved", "/data", "url");
    expect(url).not.toContain("cbrowser daemon start");
    expect(url).toContain("a11y audit would run on a blank page");
  });
});

describe("reloadNote", () => {
  test("names the data dir searched, the page reloaded, what carries over and what does not", () => {
    const note = reloadNote("http://x.test/page", "evaluate", "/data", "daemon");
    expect(note).toContain("No daemon found for data dir /data");
    expect(note).toContain("http://x.test/page");
    expect(note).toContain("localStorage carry over");
    expect(note).toContain("sessionStorage");
    expect(note).toContain("script variables");
    expect(note).toContain("cbrowser daemon start");
    expect(note).toContain("another data dir");
  });

  test("for a command the daemon does not run, it points at a test-suite or the URL instead", () => {
    expect(reloadNote("http://x.test/page", "assert", "/data", "test-suite")).toContain("cbrowser test-suite");
    const url = reloadNote("http://x.test/page", "a11y audit", "/data", "url");
    expect(url).not.toContain("cbrowser daemon start");
    expect(url).toContain("a11y audit does not run in the daemon");
  });
});

describe("restoreFailedMessage", () => {
  test("names the page, the first line of the error, the blank page and the way out", () => {
    const m = restoreFailedMessage("http://x.test/page", "evaluate", new Error("page.goto: net::ERR_CONNECTION_REFUSED at http://x.test/page\nCall log:\n  - navigating"));
    expect(m).toContain("http://x.test/page");
    expect(m).toContain("net::ERR_CONNECTION_REFUSED");
    expect(m).not.toContain("Call log");
    expect(m).toContain("evaluate would run on a blank page");
    expect(m).toContain("--url <url>");
  });
});
