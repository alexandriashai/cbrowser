/**
 * agent_ready_audit must not tell a site to replace a good accessible name with
 * a worse one, and must not call a specific label generic.
 *
 * Measured 2026-10-06 on cbrowser.ai (3 of 3 live runs, BUG-04): the carousel's
 * icon buttons carry aria-label="Previous slide", "Next slide" and
 * "Pause auto-play". The audit:
 *   - flagged each as "Element lacks stable selectors (score: 2/10)", although
 *     find_element_by_intent ranks aria-label as its FIRST strategy
 *     (natural-language.ts SELECTOR_PRIORITY, 0.95);
 *   - suggested `<button data-testid="button" aria-label="button action">...</button>`,
 *     which deletes the real name and every other attribute;
 *   - called "next slide" a generic label because it contains the word "next";
 *   - printed "10 elements lack stable selectors (score: 0/10)" over per-element
 *     scores [0,2,2,2,2,2,0,0,0,0];
 * and remediation_patches re-created the same `aria-label="button action"`
 * markup independently, plus `<title ... aria-label="title action">` for a
 * page-title finding.
 *
 * Every fixture here is local (page.setContent), so the audit's network probes
 * bail on about:blank and nothing leaves the box. Tests call the SHIPPED
 * pipeline (runAgentReadyAudit -> recommendations -> generateRemediationPatches),
 * not a copy of its logic.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser } from "playwright";
import { runAgentReadyAudit } from "../src/analysis/agent-ready-audit.js";
import { generatePatch, generateRemediationPatches } from "../src/remediation/patch-generator.js";
import type { AgentReadyAuditResult, AgentReadyIssue } from "../src/types.js";

const SVG = `<svg width="16" height="16" aria-hidden="true"><path d="M0 0h16v16z"/></svg>`;
const GIF = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

/** One carousel with specific, UNIQUE aria-labels, plus the edge cases the skeptic found. */
const NAMES_FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Findability names fixture page</title></head><body><main>
  <section aria-roledescription="carousel">
    <button class="p-2" aria-label="Previous slide">${SVG}</button>
    <button class="p-2" aria-label="Next slide">${SVG}</button>
    <button class="p-2" aria-label="Pause auto-play">${SVG}</button>
  </section>
  <a class="block" href="/pricing/">Sign up for Pro and get 500 bonus credits free, they never expire</a>
  <a href="/"><img src="${GIF}" width="40" height="40" alt="CBrowser home"></a>
  <button class="p-2" title="Settings">${SVG}</button>
  <span id="lbl">Close dialog</span><button class="p-2" aria-labelledby="lbl">${SVG}</button>
  <button class="p-2 blank" aria-label="   ">${SVG}</button>
  <button class="p-2 cart" aria-label="Add to cart">${SVG}</button>
  <button class="p-2 cart" aria-label="Add to cart">${SVG}</button>
  <a class="tip" href="/x" title="a > b">Short link</a>
  <a class="card" href="/personas"><h3>Custom Personas</h3><p>Describe your user</p></a>
</main></body></html>`;

/** Two carousels: "Previous slide" is now ambiguous, so it IS flagged and the example builder runs. */
const DUP_CAROUSEL_FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Two carousels fixture page</title></head><body><main>
  <section aria-roledescription="carousel"><h2>Featured</h2>
    <button class="p-2" type="button" aria-label="Previous slide">${SVG}</button>
  </section>
  <section aria-roledescription="carousel"><h2>Testimonials</h2>
    <button class="p-2" type="button" aria-label="Previous slide">${SVG}</button>
  </section>
  <h2 id="dlg-title">Close dialog</h2>
  <button class="p-2 x" aria-labelledby="dlg-title">${SVG}</button>
  <button class="p-2 x" aria-labelledby="dlg-title">${SVG}</button>
</main></body></html>`;

/** Specific labels that merely contain a generic word, and labels that are generic all the way through. */
const GENERIC_FIXTURE_A = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Generic labels fixture A</title></head><body><main>
  <button>Next slide</button><button>Previous slide</button><button>Back to top</button>
  <button>Send message</button><button>Continue to checkout</button>
  <button aria-label="Next slide"><span aria-hidden="true">Next</span></button>
  <button class="p-2">${SVG}</button>
  <button>Click here</button><button>Go back</button><button>Next &rarr;</button>
</main></body></html>`;

const GENERIC_FIXTURE_B = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Generic labels fixture B</title></head><body><main>
  <button>Submit form</button><button>Next</button><button>Submit</button><button>OK, got it</button>
</main></body></html>`;

/** Multi-instance findings whose per-element descriptions differ. */
const AGGREGATE_FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Aggregate lines fixture page</title><style>
  body { margin: 0; height: 3000px; }
  .bar  { position: sticky; top: 0; z-index: 50; height: 40px; width: 100%; background: #eee; }
  .dock { position: fixed; bottom: 0; left: 0; z-index: 10; height: 60px; width: 300px; background: #ddd; }
</style></head><body>
  <div class="bar">A</div><div class="dock">B</div>
  <main>
    <div onclick="void 0">Open panel</div><span onclick="void 0">Toggle</span>
    <a>Plain anchor</a><a href="javascript:void(0)">Script anchor</a>
    <nav><button>More</button><button>More</button></nav>
  </main>
</body></html>`;

// ---------------------------------------------------------------------------
// Second skeptic round (2026-10-07): regressions the first version of this fix
// introduced, each observed against base 6da7718, plus two residuals.
// ---------------------------------------------------------------------------

/** One download link whose href is a 200,000-char data: URL. */
const BIG_HREF = `data:text/csv;base64,${"A".repeat(200_000)}`;
const PAYLOAD_FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Payload bound fixture page</title></head><body><main>
  <a download="x.csv" href="${BIG_HREF}">Download CSV</a>
</main></body></html>`;

/** Names that come from somewhere other than aria-label, and shared aria-labelledby on TEXT buttons. */
const NAME_SOURCES_FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Name sources fixture page</title></head><body><main>
  <a href="/u/1"><img src="${GIF}" width="30" height="30" alt="Avatar"> Jane Doe</a>
  <a href="/u/2"><img src="${GIF}" width="30" height="30" alt="Avatar"> John Roe</a>
  <input type="submit" role="button" value="Send feedback">
  <input type="reset" role="button">
  <span id="t">Edit profile</span>
  <button aria-labelledby="t">Edit</button><button aria-labelledby="t">Edit</button>
</main></body></html>`;

/** ARIA names inside an open shadow root, which Playwright's $$eval pierces. */
const SHADOW_FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Shadow DOM fixture page</title></head><body><main>
  <div id="host"></div>
  <button class="light" aria-label="Open menu">${SVG}</button>
  <script>
    document.getElementById("host").attachShadow({ mode: "open" }).innerHTML =
      '<button class="drawer" aria-label="Close drawer">${SVG}</button>' +
      '<button class="shadow-menu" aria-label="Open menu">${SVG}</button>' +
      '<span id="cap">Zoom in</span><button class="zoom" aria-labelledby="cap">${SVG}</button>';
  </script>
</main></body></html>`;

/** Generic words padded with filler. Five per page: the detector keeps at most five. */
const GENERIC_FIXTURE_C = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Generic labels fixture C</title></head><body><main>
  <button>Click me</button><button>Submit now</button><button>Send now</button>
  <button>Go now</button><button>Yes please</button>
</main></body></html>`;

const GENERIC_FIXTURE_D = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Generic labels fixture D</title></head><body><main>
  <button>No thanks</button><button>Show more</button>
  <button>Show details</button><button>Go to the dashboard</button><button>Click to copy</button>
</main></body></html>`;

/** 60 id'd clickable cells plus six other clickable tags. */
const CLICKABLE_FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Clickable cells fixture page</title></head><body><main>
  ${Array.from({ length: 60 }, (_, k) => `<div id="cell-${k}" onclick="void 0">${k}</div>`).join("")}
  <span onclick="void 0">s</span><ul><li style="cursor: pointer">l</li></ul>
  <p style="cursor: pointer">p</p><section style="cursor: pointer">x</section>
  <article style="cursor: pointer">a</article><header style="cursor: pointer">h</header>
</main></body></html>`;

let browser: Browser;
const results: Record<string, AgentReadyAuditResult> = {};

async function audit(html: string): Promise<AgentReadyAuditResult> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.setContent(html);
  try {
    return await runAgentReadyAudit("https://fixture.invalid/", { page, headless: true });
  } finally {
    await ctx.close();
  }
}

const findability = (r: AgentReadyAuditResult) =>
  r.issues.filter((i) => i.detectionMethod === "findability-score-check");
const generic = (r: AgentReadyAuditResult) =>
  r.issues.filter((i) => i.detectionMethod === "action-verb-check").map((i) => i.description);
const flaggedFor = (r: AgentReadyAuditResult, needle: string) =>
  findability(r).filter((i) => (i.elementHtml || "").includes(needle));
/** Every attribute name in the example's opening tag, in order, duplicates kept. */
const attrNames = (example: string) =>
  [...(example.match(/^<[^>]*>/)?.[0] ?? "").matchAll(/\s([a-zA-Z_:][-a-zA-Z0-9_:.]*)=/g)].map((m) => m[1]);

beforeAll(async () => {
  browser = await chromium.launch();
  results.names = await audit(NAMES_FIXTURE);
  results.dup = await audit(DUP_CAROUSEL_FIXTURE);
  results.genA = await audit(GENERIC_FIXTURE_A);
  results.genB = await audit(GENERIC_FIXTURE_B);
  results.agg = await audit(AGGREGATE_FIXTURE);
  results.payload = await audit(PAYLOAD_FIXTURE);
  results.sources = await audit(NAME_SOURCES_FIXTURE);
  results.shadow = await audit(SHADOW_FIXTURE);
  results.genC = await audit(GENERIC_FIXTURE_C);
  results.genD = await audit(GENERIC_FIXTURE_D);
  results.clickable = await audit(CLICKABLE_FIXTURE);
}, 120_000);

afterAll(async () => { await browser?.close(); });

describe("a specific accessible name counts as a stable hook", () => {
  test("unique aria-labels on icon buttons are not flagged as lacking stable selectors", () => {
    // find_element_by_intent resolves these by [aria-label="..."] at 0.95 confidence.
    for (const name of ["Previous slide", "Next slide", "Pause auto-play"]) {
      expect(flaggedFor(results.names, `aria-label="${name}"`)).toEqual([]);
    }
  });

  test("a unique aria-labelledby that resolves to text is not flagged either", () => {
    expect(flaggedFor(results.names, `aria-labelledby="lbl"`)).toEqual([]);
  });

  test("two identical aria-labels are still flagged: the selector matches both", () => {
    // [aria-label="Add to cart"] is ambiguous, so it is not a stable hook.
    expect(flaggedFor(results.names, `aria-label="Add to cart"`).length).toBe(2);
  });
});

describe("the suggested markup keeps the element's real name and attributes", () => {
  test("Previous slide keeps its aria-label and gets data-testid=\"previous-slide\"", () => {
    const flagged = flaggedFor(results.dup, `aria-label="Previous slide"`);
    expect(flagged.length).toBe(2);
    const [first, second] = flagged.map((i) => i.codeExample || "");
    expect(first).toContain(`aria-label="Previous slide"`);
    expect(first).toContain(`data-testid="previous-slide"`);
    // Every attribute the element already had survives.
    expect(first).toContain(`class="p-2"`);
    expect(first).toContain(`type="button"`);
    // The two copies must not be handed the SAME new testid: that would not
    // disambiguate anything, which is the whole point of the recommendation.
    expect(second).toContain(`aria-label="Previous slide"`);
    expect(second).not.toContain(`data-testid="previous-slide"`);
    expect(second).toMatch(/data-testid="previous-slide-\d+"/);
  });

  test("no example ever emits a `<tag> action` placeholder or a bare-tag testid", () => {
    for (const r of [results.names, results.dup]) {
      for (const i of findability(r)) {
        expect(i.codeExample).not.toMatch(/aria-label="[a-z]+ action"/);
        expect(i.codeExample).not.toMatch(/data-testid="(button|a)"/);
      }
    }
  });

  test("an img-alt-named logo link keeps its name: no aria-label is invented", () => {
    const [logo] = flaggedFor(results.names, `alt="CBrowser home"`);
    expect(logo).toBeDefined();
    const ex = logo.codeExample || "";
    expect(ex).toContain(`data-testid="cbrowser-home"`);
    expect(ex).toContain(`href="/"`);
    // An aria-label here would OVERRIDE alt="CBrowser home" as the link's name.
    expect(ex).not.toContain("aria-label=");
    // The image is still inside the link, not flattened to text.
    expect(ex).not.toMatch(/>\s*CBrowser home\s*</);
  });

  test("a title-named icon button keeps its name: no placeholder aria-label", () => {
    const [settings] = flaggedFor(results.names, `title="Settings"`);
    expect(settings).toBeDefined();
    expect(settings.codeExample).toContain(`data-testid="settings"`);
    expect(settings.codeExample).toContain(`title="Settings"`);
    expect(settings.codeExample).not.toContain("aria-label=");
  });

  test("a long text link keeps its full text and gets no aria-label copy of it", () => {
    const [link] = flaggedFor(results.names, `class="block"`);
    expect(link).toBeDefined();
    const ex = link.codeExample || "";
    expect(ex).toContain(">Sign up for Pro and get 500 bonus credits free, they never expire</a>");
    expect(ex).toContain(`href="/pricing/"`);
    expect(ex).not.toContain("aria-label=");
  });

  test("a name from aria-labelledby is kept, and no aria-label is added over it", () => {
    // Two buttons share it, so they are flagged. The example must still not add
    // an aria-label: the element already has a name, and a second, different
    // one is a placeholder that would drift from the real label.
    const flagged = flaggedFor(results.dup, `aria-labelledby="dlg-title"`);
    expect(flagged.length).toBe(2);
    for (const i of flagged) {
      expect(i.codeExample).toContain(`aria-labelledby="dlg-title"`);
      expect(i.codeExample).not.toContain("aria-label=");
    }
    expect(flagged[0].codeExample).toContain(`data-testid="close-dialog"`);
    expect(flagged[1].codeExample).toContain(`data-testid="close-dialog-2"`);
  });

  test("title is the last name source: a link's text beats its tooltip", () => {
    const [tip] = flaggedFor(results.names, `class="tip"`);
    expect(tip).toBeDefined();
    expect(tip.codeExample).toContain(`data-testid="short-link"`);
    expect(tip.codeExample).toContain(">Short link</a>");
  });

  test("a card link is not flattened, and its testid keeps the words apart", () => {
    const [card] = flaggedFor(results.names, `class="card"`);
    expect(card).toBeDefined();
    // textContent glues these into "Custom PersonasDescribe your user".
    expect(card.codeExample).toContain(`data-testid="custom-personas-describe-your-user"`);
    expect(card.codeExample).not.toContain("PersonasDescribe");
    expect(card.codeExample).not.toContain("aria-label=");
  });

  test("aria-label=\"   \" is treated as missing and never duplicated", () => {
    const [blank] = flaggedFor(results.names, `class="p-2 blank"`);
    expect(blank).toBeDefined();
    const names = attrNames(blank.codeExample || "");
    expect(names.filter((n) => n === "aria-label").length).toBe(1);
    expect(names.filter((n) => n === "data-testid").length).toBe(1);
    // It has no name at all, so this is the one case that gets a fill-in label.
    expect(blank.codeExample).not.toContain(`aria-label="   "`);
  });
});

describe("generic labels are generic all the way through", () => {
  test("\"next slide\" and other specific labels are not generic", () => {
    const g = generic(results.genA).join(" | ").toLowerCase();
    for (const label of ["next slide", "previous slide", "back to top", "send message", "continue to checkout"]) {
      expect(g).not.toContain(`"${label}"`);
    }
  });

  test("\"click here\" and \"go back\" are generic", () => {
    const g = generic(results.genA);
    expect(g).toContain(`Button with generic label: "click here"`);
    expect(g).toContain(`Button with generic label: "go back"`);
  });

  test("punctuation does not hide a generic label: \"Next ->\" is still \"next\"", () => {
    expect(generic(results.genA).some((d) => /"next\s*\S?"$/.test(d))).toBe(true);
  });

  test("the accessible name wins over hidden visual text", () => {
    // aria-label="Next slide" names the button; the visual "Next" is aria-hidden.
    expect(generic(results.genA).filter((d) => d === `Button with generic label: "next"`)).toEqual([]);
  });

  test("an unnamed icon button is not reported as a generic label", () => {
    // `every` over zero words is true; an empty label must not count.
    expect(generic(results.genA)).not.toContain(`Button with generic label: ""`);
  });

  test("bare generic labels are still flagged (no over-correction)", () => {
    const g = generic(results.genB);
    expect(g).toContain(`Button with generic label: "next"`);
    expect(g).toContain(`Button with generic label: "submit"`);
    expect(g).toContain(`Button with generic label: "ok, got it"`);
  });

  test("\"submit form\" is generic: \"form\" names the widget, not the outcome", () => {
    // Decision 2026-10-07. "Next slide" names the object acted on, so it is
    // specific. "Submit form" names only the mechanism; on a page with two
    // forms, two "Submit form" buttons give an agent nothing to choose by.
    expect(generic(results.genB)).toContain(`Button with generic label: "submit form"`);
  });
});

describe("aggregate recommendations describe every issue they count", () => {
  test("the stable-selectors line reports the score range, not one element's score", () => {
    const scores = findability(results.names).map((i) => Number(/score: (\d+)/.exec(i.description)?.[1]));
    const lo = Math.min(...scores), hi = Math.max(...scores);
    expect(hi).toBeGreaterThan(lo); // the fixture really does mix scores
    const agg = results.names.recommendations.find((r) => /stable selectors/.test(r.issue));
    expect(agg?.issue).toBe(`${scores.length} elements lack stable selectors (scores: ${lo}-${hi}/10)`);
  });

  test("the sticky line does not print one element's z-index and size as everyone's", () => {
    const sticky = results.agg.issues.filter((i) => i.detectionMethod === "sticky-element-check");
    expect(sticky.length).toBe(2);
    const agg = results.agg.recommendations.find((r) => /intercept clicks/.test(r.issue));
    expect(agg?.issue).toMatch(/^2 /);
    expect(agg?.issue).toContain("z-index: 10-50");
    expect(agg?.issue).not.toMatch(/\d+x\d+px/);
  });

  test("the generic-label line lists every label it counts", () => {
    const agg = results.genA.recommendations.find((r) => /generic label/.test(r.issue));
    expect(agg?.issue).toMatch(/^3 /);
    for (const label of ["click here", "go back"]) expect(agg?.issue).toContain(`"${label}"`);
    expect(agg?.issue).toMatch(/"next\s*\S?"/);
  });

  test("repeated generic labels are counted, not listed twice", () => {
    // cbrowser.ai has two nav-menu triggers labelled "More".
    const agg = results.agg.recommendations.find((r) => /generic label/.test(r.issue));
    expect(agg?.issue).toBe(`2 buttons with generic labels: "more" x2`);
  });

  test("clickable-div and bad-link lines do not misreport mixed elements", () => {
    const recs = results.agg.recommendations.map((r) => r.issue);
    const clickable = recs.find((t) => /^2 clickable/i.test(t));
    expect(clickable).toBeDefined();
    expect(clickable).toContain("div");
    expect(clickable).toContain("span");
    const links = recs.find((t) => /^2 links?/i.test(t));
    expect(links).toBeDefined();
    expect(links).toContain("javascript:");
    expect(links).toContain("no");
  });
});

describe("remediation_patches never fabricates a name", () => {
  test("no patch from a real audit carries a `<tag> action` aria-label", () => {
    for (const r of Object.values(results)) {
      for (const p of generateRemediationPatches(r)) {
        expect(p.after).not.toMatch(/aria-label="[a-z]+ action"/);
      }
    }
  });

  test("findability patches reuse the audit's example, which keeps the real name", () => {
    const patches = generateRemediationPatches(results.dup);
    const prev = patches.filter((p) => p.before.includes(`aria-label="Previous slide"`));
    expect(prev.length).toBe(2);
    for (const p of prev) expect(p.after).toContain(`aria-label="Previous slide"`);
  });

  test("page-level findability findings with no markup fix get no invented element", () => {
    const pageLevel: AgentReadyIssue[] = [
      { category: "findability", severity: "low", element: "title", description: "Page title is very short (< 10 chars)", detectionMethod: "page-title-check", recommendation: "Use a more descriptive page title" },
      { category: "findability", severity: "high", element: "document", description: "Page content is only present after JavaScript runs", detectionMethod: "no-JS fetch compared against the rendered DOM", recommendation: "Server-render the primary content" },
      { category: "findability", severity: "medium", element: "viewport", description: "Navigation/chrome occupies 62% of above-fold viewport", detectionMethod: "content-chrome-check", recommendation: "Reduce navigation prominence" },
      { category: "findability", severity: "high", element: "script", description: "CAPTCHA detected (api.js) — blocks AI agent automation", detectionMethod: "captcha-check", recommendation: "Provide an API or authenticated bypass" },
    ];
    for (const issue of pageLevel) {
      const after = generatePatch(issue).after;
      expect(after).not.toMatch(/ action"/);
      expect(after).not.toContain("data-testid");
      expect(after).not.toContain(`<${issue.element} `);
    }
  });
});

describe("second skeptic round: the fix must not regress what base got right", () => {
  test("a 200,000-char attribute does not ride along in the example, the patch or the audit JSON", () => {
    // Base: codeExample 72 chars, audit JSON 6,292 bytes. The first version of
    // this fix copied the href verbatim: 200,092 / 406,336. elementHtml is
    // capped at 600 for the same reason. (2026-10-07)
    const [link] = flaggedFor(results.payload, `download="x.csv"`);
    expect(link).toBeDefined();
    const ex = link.codeExample || "";
    expect(ex.length).toBeLessThan(1000);
    expect(ex).toContain(`data-testid="download-csv"`);
    expect(ex).toContain(`download="x.csv"`);
    expect(ex).toContain(`href="data:text/csv;base64,AAAA`);
    // The elision is explicit, so nobody pastes a cut-off href as the real one.
    expect(ex).toMatch(/more characters unchanged/);
    expect(attrNames(ex).filter((n) => n === "href").length).toBe(1);
    for (const p of generateRemediationPatches(results.payload)) expect(p.after.length).toBeLessThan(1000);
    for (const r of results.payload.recommendations) expect((r.codeSnippet || "").length).toBeLessThan(1000);
    expect(JSON.stringify(results.payload).length).toBeLessThan(50_000);
  });

  test("short attribute values are not elided", () => {
    const [prev] = flaggedFor(results.dup, `aria-label="Previous slide"`);
    expect(prev.codeExample).not.toMatch(/more characters unchanged/);
  });

  test("filler words do not hide a generic label: \"Click me\", \"Submit now\", \"Send now\", \"Go now\", \"Yes please\"", () => {
    // All five were generic on base and stopped being generic under the first
    // every-word rule, because "me", "now" and "please" were not in the vocabulary.
    const g = generic(results.genC);
    for (const label of ["click me", "submit now", "send now", "go now", "yes please"]) {
      expect(g).toContain(`Button with generic label: "${label}"`);
    }
  });

  test("\"No thanks\" and \"Show more\" are generic; filler does not make a specific label generic", () => {
    const g = generic(results.genD);
    expect(g).toContain(`Button with generic label: "no thanks"`);
    expect(g).toContain(`Button with generic label: "show more"`);
    // "to" and "the" are filler, but "details", "dashboard" and "copy" are not.
    for (const label of ["show details", "go to the dashboard", "click to copy"]) {
      expect(g).not.toContain(`Button with generic label: "${label}"`);
    }
  });

  test("a SHARED aria-labelledby keeps its old weight of 0, so text buttons that share one are still flagged", () => {
    // Base flagged both (score 2/10: text only). The first fix gave a
    // duplicated aria-labelledby 2, totalling 4, and stopped flagging them.
    const flagged = flaggedFor(results.sources, `aria-labelledby="t"`);
    expect(flagged.length).toBe(2);
    for (const i of flagged) expect(i.description).toBe("Element lacks stable selectors (score: 2/10)");
  });

  test("an image-plus-text link is named by its text, as base did: jane-doe, not avatar", () => {
    const jane = flaggedFor(results.sources, `href="/u/1"`)[0];
    const john = flaggedFor(results.sources, `href="/u/2"`)[0];
    expect(jane?.codeExample).toContain(`data-testid="jane-doe"`);
    expect(john?.codeExample).toContain(`data-testid="john-roe"`);
    for (const i of [jane, john]) expect(i?.codeExample).not.toContain("aria-label=");
  });

  test("a value-named submit input keeps its name: no placeholder aria-label over value=\"Send feedback\"", () => {
    const [input] = flaggedFor(results.sources, `value="Send feedback"`);
    expect(input).toBeDefined();
    const ex = input.codeExample || "";
    expect(ex).toContain(`data-testid="send-feedback"`);
    expect(ex).toContain(`value="Send feedback"`);
    expect(ex).not.toContain("aria-label=");
    expect(ex).not.toContain("</input>");
  });

  test("a reset input with no value is named \"Reset\" by the browser, so it gets no placeholder either", () => {
    const [input] = flaggedFor(results.sources, `type="reset"`);
    expect(input).toBeDefined();
    expect(input.codeExample).toContain(`data-testid="reset"`);
    expect(input.codeExample).not.toContain("aria-label=");
  });

  test("a unique ARIA name inside an open shadow root counts as a stable hook", () => {
    expect(flaggedFor(results.shadow, `aria-label="Close drawer"`)).toEqual([]);
    // aria-labelledby resolves inside the shadow root, where id="cap" lives.
    expect(flaggedFor(results.shadow, `aria-labelledby="cap"`)).toEqual([]);
  });

  test("an ARIA name repeated across the light DOM and a shadow root is not unique", () => {
    // Playwright CSS pierces open shadow roots, so [aria-label="Open menu"] matches both.
    expect(flaggedFor(results.shadow, `aria-label="Open menu"`).length).toBe(2);
  });

  test("the clickable-element line names element types, not every id, and stays bounded", () => {
    const rec = results.clickable.recommendations.find((r) => /^\d+ clickable/i.test(r.issue));
    expect(rec?.issue).toBe("66 clickable elements without button role (div, span, li, p, section, +2 more)");
    expect(rec?.issue).not.toContain("#cell-");
  });
});
