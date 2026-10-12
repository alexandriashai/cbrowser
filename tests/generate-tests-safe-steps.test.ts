/**
 * generate_tests makes steps a user could take, on the page it was given. (v8 b39, 2026-10-10)
 *
 * Reported (n=1): the generator
 *   (a) emitted a click on a destructive control with no safety-zone note: on
 *       this fixture, `click text="Delete account"` as a plain "Button
 *       Interactions" step, which nl_test_inline then refuses and the
 *       Playwright export would simply run;
 *   (b) turned a skip link into a navigation step ("Click Skip to content"),
 *       and with it every other element a user cannot see;
 *   (c) described every navigation pass as "Start from home" on a page that
 *       is not the home page.
 *
 * The zone is the click gate's own verdict (classifyAction over the names,
 * elementZone over the element), not a second keyword list: the search form
 * below has a benign "Go" button whose form posts to /account/delete, which
 * the gate refuses and so must the generator.
 *
 * Served from Bun.serve at /account/settings, not the site root.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-gen-tests-data-"));
process.env.CBROWSER_ARTIFACT_DIR ??= mkdtempSync(join(tmpdir(), "cb-gen-tests-art-"));

const { CBrowser } = await import("../src/browser.js");
const { parseNLTestSuite, parseNLInstruction } = await import("../src/testing/nl-test-suite.js");

const SETTINGS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Account settings</title>
<style>
.skip-link{position:absolute;left:-9999px}.skip-link:focus{left:0}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
.mobile-only{display:none}
</style></head><body>
<a class="skip-link" href="#main">Skip to content</a>
<header><nav>
<a href="/">Home</a> <a href="/pricing">Pricing</a> <a href="/docs">Docs</a> <a href="/blog">Blog</a>
<a class="sr-only" href="/sitemap">Sitemap</a>
</nav></header>
<main id="main"><h1>Account settings</h1>
<p><a href="#main">Jump to settings</a></p>
<button class="mobile-only" type="button">Toggle menu</button>
<button type="button" onclick="window.__deleted = true">Delete account</button>
<button type="button">
  Cancel
  subscription
</button>
<button type="button">Save changes</button>
<button type="button">Show more</button>
<button type="button">Export data</button>
</main></body></html>`;

const SEARCH = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Find things</title></head><body>
<main><h1>Find things</h1>
<form action="/account/delete" method="post"><input type="search" name="q" placeholder="Search"><button type="submit">Go</button></form>
</main></body></html>`;

// Follow-up from the branch's verifier (2026-10-10): hiddenFromView judged only the element's own box, so a
// link inside an sr-only wrapper and a button at opacity:0 still became steps.
const WRAPPED = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Wrapped things</title></head><body>
<nav><a href="/one">One</a> <a href="/two">Two</a> <a href="/three">Three</a> <a href="/four">Four</a>
<div class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)"><a href="/hidden-page">Hidden child link</a></div>
<div style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)"><a href="/clipped-page">Clipped child link</a></div>
<div style="width:1px;height:1px;overflow:hidden"><a href="/tiny-page">Tiny wrapper link</a></div>
</nav>
<main><h1>Wrapped things</h1>
<button type="button" style="opacity:0">Invisible opacity</button>
<div style="opacity:0"><button type="button">Faded wrapper button</button></div>
<button type="button">Visible button</button>
</main></body></html>`;

// A form whose submit is sr-only: 6fbeda6 clicked the hidden button; ee68ce7 fell back to the bare word
// "Search" / "Submit", a target that resolves to nothing.
const HIDDEN_SUBMIT = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Hidden submits</title>
<style>.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}</style></head><body>
<main><h1>Hidden submits</h1>
<form action="/results" method="get"><input type="search" name="q" placeholder="Search"><button type="submit" class="sr-only">Go</button></form>
<form action="/session" method="post"><input type="email" name="email"><input type="password" name="password"><button type="submit" class="sr-only">Sign in</button></form>
</main></body></html>`;

// v10 B39: a button whose label sounds harmless but is styled as a destructive or
// danger action (shadcn variant="destructive", Bootstrap btn-danger, a demo's
// data-testid) is not an exploratory click either.
const DANGER = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Variants</title></head><body>
<main><h1>Button variants</h1>
<button type="button" data-testid="demo-btn-destructive">Destructive</button>
<button type="button" class="btn btn-danger">Reset workspace</button>
<button type="button" data-variant="destructive">Clear</button>
<button type="button">Refresh</button>
</main></body></html>`;

let server: ReturnType<typeof Bun.serve>;
let base: string;
let b: InstanceType<typeof CBrowser>;
beforeAll(async () => {
  server = Bun.serve({ port: 0, fetch: (req) => {
    const p = new URL(req.url).pathname;
    const html = p === "/danger" ? DANGER : p === "/search" ? SEARCH : p === "/app" ? WRAPPED : p === "/hidden-submit" ? HIDDEN_SUBMIT : SETTINGS;
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } });
  base = `http://localhost:${server.port}`;
  b = new CBrowser({ headless: true, persistent: false, skipSessionRestore: true });
});
afterAll(async () => {
  await b?.close();
  server?.stop(true);
});

type Step = { action: string; target?: string; description: string; zone?: string };
const clicks = (tests: Array<{ steps: Step[] }>) => tests.flatMap((t) => t.steps).filter((s) => s.action === "click");

describe("generate_tests skips danger-styled buttons (v10 B39)", () => {
  test("only the plain button is clicked; the three danger-styled ones are named in notes", async () => {
    const r = await b.generateTests(`${base}/danger`);
    const buttons = r.tests.find((t) => t.name === "Button Interactions");
    expect(buttons?.steps.filter((s) => s.action === "click").map((s) => s.description)).toEqual(['Click "Refresh"']);
    const notes = r.tests.flatMap((t) => t.notes ?? []);
    for (const label of ["Destructive", "Reset workspace", "Clear"]) {
      expect(notes.some((n) => n.includes(`"${label}"`) && /destructive or danger/.test(n))).toBe(true);
    }
    expect(r.cbrowserScript).not.toMatch(/^click .*(Destructive|Reset workspace|demo-btn-destructive)/m);
  }, 90000);
});

describe("generate_tests on a page that is not the home page", () => {
  let result: Awaited<ReturnType<InstanceType<typeof CBrowser>["generateTests"]>>;
  beforeAll(async () => {
    result = await b.generateTests(`${base}/account/settings`);
  }, 90000);

  test("(a) no unannotated click on the red control; it is named in the notes instead", () => {
    const red = clicks(result.tests).filter((s) => /Delete account/i.test(`${s.target} ${s.description}`));
    for (const s of red) {
      expect(s.zone).toBe("red");
      expect(s.description).toMatch(/refuse/i);
    }
    const notes = result.tests.flatMap((t) => t.notes ?? []);
    expect(notes.some((n) => /Delete account/.test(n) && /force/.test(n))).toBe(true);
    // A label that wraps across lines is still one line in the note, so the
    // comment it becomes cannot spill into a script step or into code.
    expect(notes.some((n) => /"Cancel subscription"/.test(n))).toBe(true);
    expect(notes.every((n) => !/\n/.test(n))).toBe(true);
    // The other buttons still get their exploratory clicks.
    const buttons = result.tests.find((t) => t.name === "Button Interactions");
    expect(buttons?.steps.filter((s) => s.action === "click").map((s) => s.description))
      .toEqual(['Click "Save changes"', 'Click "Show more"', 'Click "Export data"']);
  });

  test("(a) the runnable outputs carry no bare red click", () => {
    expect(result.cbrowserScript).not.toMatch(/^click text="Delete account"$/m);
    expect(result.cbrowserScript).toMatch(/^\/\/ note: .*Delete account/m);
    expect(result.playwrightCode).not.toMatch(/^\s*await page\.getByText\('Delete account'\)\.click\(\);/m);
  });

  test("(b) no step for a skip link, an in-page anchor, or anything a user cannot see", () => {
    const steps = result.tests.flatMap((t) => t.steps);
    const text = steps.map((s) => `${s.target ?? ""} | ${s.description}`).join("\n");
    expect(text).not.toMatch(/Skip to content/);
    expect(text).not.toMatch(/Jump to settings/);
    expect(text).not.toMatch(/Sitemap/);
    expect(text).not.toMatch(/Toggle menu/);
    // The visible same-site links are still exercised.
    const nav = result.tests.find((t) => t.name === "Navigation Links");
    expect(nav?.steps.filter((s) => s.action === "click").map((s) => s.description))
      .toEqual(["Click Home", "Click Pricing", "Click Docs", "Click Blog"]);
  });

  test("(c) navigation passes start from the actual page, not 'home'", () => {
    const descriptions = result.tests.flatMap((t) => t.steps).map((s) => s.description);
    expect(descriptions).not.toContain("Start from home");
    expect(descriptions).toContain("Start from /account/settings");
  });

  test("the notes do not rename or split tests when the script is parsed", () => {
    const parsed = parseNLTestSuite(result.cbrowserScript, "generated");
    expect(parsed.tests.length).toBe(result.tests.length);
    expect(parsed.tests.flatMap((t) => t.steps).filter((s) => s.action === "unknown")).toEqual([]);
    expect(parsed.tests.map((t) => t.name)).toEqual(result.tests.map((t) => t.description));
  });
});

describe("generate_tests uses the click gate's element verdict", () => {
  test("a benign-looking submit whose form posts to /account/delete is marked red and refused, as click() refuses it", async () => {
    const result = await b.generateTests(`${base}/search`);
    const search = result.tests.find((t) => t.name === "Search Functionality");
    const submit = search?.steps.find((s) => s.action === "click");
    expect(submit?.target).toBe('text="Go"');
    expect(submit?.zone).toBe("red");
    expect(submit?.description).toMatch(/red zone: .*refuses it without force/);
    expect(result.cbrowserScript).toMatch(/^\/\/ red zone: .*\nclick text="Go"$/m);
    expect(result.playwrightCode).toMatch(/^\s*\/\/ await page\.getByText\('Go'\)\.click\(\);$/m);
    expect(result.playwrightCode).not.toMatch(/^\s*await page\.getByText\('Go'\)\.click\(\);$/m);
    // The gate agrees: the same selector is refused by click() without force.
    const c = await b.click('text="Go"');
    expect(c.success).toBe(false);
    expect(c.zone).toBe("red");
  }, 90000);
});

const stepText = (tests: Array<{ steps: Step[] }>) =>
  tests.flatMap((t) => t.steps).map((s) => `${s.target ?? ""} | ${s.description}`).join("\n");

describe("generate_tests leaves out what a wrapper hides", () => {
  let result: Awaited<ReturnType<InstanceType<typeof CBrowser>["generateTests"]>>;
  beforeAll(async () => {
    result = await b.generateTests(`${base}/app`);
  }, 90000);

  test("a link inside an sr-only, clipped or 1px overflow-hidden wrapper is not a navigation step", () => {
    const text = stepText(result.tests);
    expect(text).not.toMatch(/Hidden child link|hidden-page/);
    expect(text).not.toMatch(/Clipped child link|clipped-page/);
    expect(text).not.toMatch(/Tiny wrapper link|tiny-page/);
    expect(result.cbrowserScript).not.toMatch(/hidden-page|clipped-page|tiny-page/);
    const nav = result.tests.find((t) => t.name === "Navigation Links");
    expect(nav?.steps.filter((s) => s.action === "click").map((s) => s.description))
      .toEqual(["Click One", "Click Two", "Click Three", "Click Four"]);
    for (const name of ["Hidden child link", "Clipped child link", "Tiny wrapper link"]) {
      expect(result.analysis.links.find((l) => l.text === name)?.hidden).toBe(true);
    }
  });

  test("a button at opacity:0, or inside a wrapper at opacity:0, is not clicked", () => {
    const buttons = result.tests.find((t) => t.name === "Button Interactions");
    expect(buttons?.steps.filter((s) => s.action === "click").map((s) => s.description))
      .toEqual(['Click "Visible button"']);
    expect(result.cbrowserScript).not.toMatch(/Invisible opacity|Faded wrapper button/);
    expect(result.playwrightCode).not.toMatch(/Invisible opacity|Faded wrapper button/);
  });
});

describe("generate_tests with a hidden submit", () => {
  let result: Awaited<ReturnType<InstanceType<typeof CBrowser>["generateTests"]>>;
  const FORM_TESTS = ["Search Functionality", "Login Form Submission", "Login Form Validation"];
  beforeAll(async () => {
    result = await b.generateTests(`${base}/hidden-submit`);
  }, 90000);

  test("no bare 'Submit' or 'Search' target, and no click on the hidden button", () => {
    for (const name of FORM_TESTS) {
      const t = result.tests.find((x) => x.name === name);
      expect(t).toBeDefined();
      expect(t!.steps.filter((s) => s.action === "click")).toEqual([]);
      // The fields a user can fill are still filled.
      expect(t!.steps.some((s) => s.action === "fill")).toBe(true);
    }
    expect(clicks(result.tests).map((s) => s.target)).not.toContain("Search");
    expect(clicks(result.tests).map((s) => s.target)).not.toContain("Submit");
    expect(result.cbrowserScript).not.toMatch(/^click (Submit|Search)$/m);
    expect(result.playwrightCode).not.toMatch(/locator\('(Submit|Search)'\)/);
  });

  test("each form test names the hidden submit and says how to submit instead", () => {
    const notesOf = (name: string) => result.tests.find((t) => t.name === name)?.notes ?? [];
    expect(notesOf("Search Functionality").some((n) => /"Go"/.test(n) && /hidden from view/.test(n) && /Enter/.test(n))).toBe(true);
    expect(notesOf("Login Form Submission").some((n) => /"Sign in"/.test(n) && /hidden from view/.test(n))).toBe(true);
    expect(notesOf("Login Form Validation").some((n) => /"Sign in"/.test(n) && /hidden from view/.test(n))).toBe(true);
    expect(result.cbrowserScript).toMatch(/^\/\/ note: Not clicked: the form's submit "Go"/m);
    expect(result.playwrightCode).toMatch(/^\s*\/\/ note: Not clicked: the form's submit "Go"/m);
    const parsed = parseNLTestSuite(result.cbrowserScript, "generated");
    expect(parsed.tests.flatMap((t) => t.steps).filter((s) => s.action === "unknown")).toEqual([]);
  });

  test("no Enter step is offered because the NL dialect has no key press", () => {
    // If this starts failing, the dialect gained a key press: emit one on the last filled field instead of
    // the note.
    expect(parseNLInstruction("press Enter")).toMatchObject({ action: "click", target: "Enter" });
  });
});
