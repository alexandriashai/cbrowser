/**
 * A missing `alt` and `alt=""` are different defects.
 *
 * `getAttribute("alt")` returns `null` when the attribute is ABSENT and `""` when
 * `alt=""` is present. Both are falsy, so `!img.getAttribute("alt")` treated them
 * as one thing — and `img.alt` is `""` in both cases too, which is the same trap
 * one property over.
 *
 * The consequence, on the same six blog covers on /docs/home:
 *
 *   hunt_bugs      "Image missing alt attribute"   HIGH   "Add alt attribute"
 *   empathy_audit  "has empty alt text"            minor  "Verify it is decorative"
 *
 * A missing alt is an unambiguous WCAG 1.1.1 failure. An empty alt is a VALID
 * declaration that the image is decorative — possibly wrong, but already a
 * decision someone made, and prescribing "add alt attribute" prescribes a fix
 * that is already applied.
 *
 * The 20px threshold matches empathy_audit's `isDecorative`, so the two tools
 * agree on which images are too small to be worth asking about.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { huntBugs } from "../src/analysis/bug-hunter.js";
import { CBrowser } from "../src/browser.js";

const PIX = "data:image/gif;base64,R0lGODlhZABkAIAAAP///wAAACH5BAEAAAAALAAAAABkAGQAAAIhhI+py+0Po5y02ouz3rz7D4biSJbmiabqyrbuC8fyTFcFADs=";
const TINY = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";

const FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>alt fixture</title></head><body><h1>alt fixture</h1>
  <img id="absent"    src="${PIX}"  width="100" height="100">
  <img id="empty"     src="${PIX}"  width="100" height="100" alt="">
  <img id="described" src="${PIX}"  width="100" height="100" alt="a real description">
  <img id="tinyempty" src="${TINY}" width="1"   height="1"   alt="">
</body></html>`;

let server: ReturnType<typeof Bun.serve>;
let browser: CBrowser;
let bugs: Awaited<ReturnType<typeof huntBugs>>["bugs"];

beforeAll(async () => {
  // Served over http and driven through the REAL huntBugs, not a copy of its
  // logic. An earlier version of this file reimplemented the classification
  // inline and passed against the broken code — the same mistake this suite
  // caught once already on the sticky-overlay detector.
  server = Bun.serve({ port: 0, fetch: () => new Response(FIXTURE, { headers: { "content-type": "text/html" } }) });
  browser = new CBrowser({ headless: true });
  await browser.launch();
  const res = await huntBugs(browser, `http://localhost:${server.port}/`, { maxPages: 1 });
  bugs = res.bugs;
});

afterAll(async () => {
  try { await browser?.close(); } catch { /* closing is not the assertion */ }
  server?.stop(true);
});

const altBugs = () => bugs.filter((b) =>
  /alt/i.test(b.description) || b.type === "a11y-verify" || b.type === "a11y-violation");

describe("the shipped detector tells the three cases apart", () => {
  test("a MISSING alt produces a high-severity violation", () => {
    const v = bugs.filter((b) => /has no alt attribute/i.test(b.description));
    expect(v.length).toBe(1);
    expect(v[0].severity).toBe("high");
  });

  test("an EMPTY alt produces a LOW-severity verification prompt", () => {
    // The reported case: this was graded high and told to "add alt attribute",
    // a fix already applied.
    const v = bugs.filter((b) => /declares alt=""/.test(b.description));
    expect(v.length).toBe(1);
    expect(v[0].severity).toBe("low");
  });

  test("the empty-alt remedy asks for verification, not for an alt attribute", () => {
    const v = bugs.find((b) => /declares alt=""/.test(b.description))!;
    expect(v.recommendation ?? "").toMatch(/verify/i);
  });

  test("a described image produces nothing", () => {
    expect(bugs.some((b) => /a real description/.test(b.description))).toBe(false);
  });

  test("a 1x1 pixel with alt=\"\" produces nothing", () => {
    // Genuinely decorative; empathy_audit excludes it at the same 20px threshold.
    const v = bugs.filter((b) => /declares alt=""/.test(b.description));
    expect(v.length).toBe(1); // only the 100x100 one, not the 1x1
  });

  test("missing and empty do not collapse — exactly one of each", () => {
    expect(altBugs().length).toBe(2);
    const sevs = altBugs().map((b) => b.severity).sort();
    expect(sevs).toEqual(["high", "low"]);
  });
});

describe("the old truthiness check is gone from every site", () => {
  const read = async (rel: string) =>
    (await Bun.file(new URL(rel, import.meta.url)).text())
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  test("bug-hunter.ts no longer uses falsy alt checks", async () => {
    const code = await read("../src/analysis/bug-hunter.ts");
    expect(code).not.toContain('!img.getAttribute("alt")');
    expect(code).not.toContain('!!img.getAttribute("alt")');
    expect(code).toContain('img.getAttribute("alt") !== null');
  });

  test("both bug-hunter call sites were fixed, not just the reported one", async () => {
    // One is the first-page scan and one is the condensed crawled-page copy.
    // Fixing only the reported line would leave the crawl still wrong.
    const code = await read("../src/analysis/bug-hunter.ts");
    expect(code.split("altAttr === null").length - 1).toBeGreaterThanOrEqual(2);
    expect(code.split('altAttr === ""').length - 1).toBeGreaterThanOrEqual(2);
  });

  test("browser.ts uses getAttribute, not the img.alt property", async () => {
    // `img.alt` is "" for both cases, so the property can never distinguish them.
    // The code moved from src/browser.ts to src/browser/ when that file was split.
    const { readdirSync } = await import("node:fs");
    const modules = readdirSync(new URL("../src/browser/", import.meta.url)).filter((f) => f.endsWith(".ts")).map((f) => `../src/browser/${f}`);
    expect(modules.length).toBeGreaterThan(20);
    const code = (await Promise.all(["../src/browser.ts", ...modules].map(read))).join("\n");
    expect(code).not.toContain("if (!img.alt && !img.getAttribute");
    expect(code).toContain('img.getAttribute("alt") === null');
  });

  test("the verify finding is graded low, not high", async () => {
    const code = await read("../src/analysis/bug-hunter.ts");
    const idx = code.indexOf('issue.type === "a11y-verify"');
    expect(idx).toBeGreaterThan(-1);
    expect(code.slice(idx, idx + 160)).toContain('severity = "low"');
  });
});

describe("the emitted type is declared", () => {
  test("a11y-verify is in the BugReport union", async () => {
    // It was emitted for a day before it was declared. The issues are built as
    // untyped object literals inside page.evaluate and pushed through a loosely
    // typed path, so tsc never saw the gap — a value with a producer and a
    // consumer and no type between them.
    const src = await Bun.file(
      new URL("../src/analysis/bug-hunter.ts", import.meta.url),
    ).text();
    const union = src.slice(src.indexOf("export interface BugReport"),
                            src.indexOf("severity: \"critical\""));
    expect(union).toContain('"a11y-verify"');
    expect(union).toContain('"a11y-violation"');
  });

  test("every type emitted at runtime appears in the union", async () => {
    // The general form, so the next added type cannot repeat this.
    const src = await Bun.file(
      new URL("../src/analysis/bug-hunter.ts", import.meta.url),
    ).text();
    const union = src.slice(src.indexOf("export interface BugReport"),
                            src.indexOf("severity: \"critical\""));
    const emitted = [...src.matchAll(/type:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(emitted.length).toBeGreaterThan(5);
    for (const t of new Set(emitted)) {
      expect(union).toContain(`"${t}"`);
    }
  });
});
