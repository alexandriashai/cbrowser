/**
 * A failed `verify page contains` suggests real page text you can paste back (B22).
 *
 * Reported against 19.2.3 on cbrowser.ai: `verify page contains "pERSONA tESTING
 * fOR pRODUCT"` correctly fails (assertions are exact since B8), but the
 * suggestion was a raw window of innerText:
 *
 *   Try: verify page contains "⌘\nK\nLog in\nSign up\nPersona Testing for Product Tea"
 *
 * toolbar glyphs, newlines, and a hard 50-character cut inside "Teams". Pasted
 * back, it fails again. Expected:
 *
 *   Try: verify page contains "Persona Testing for Product Teams"
 *
 * -- the case-insensitive match, in the page's real case, whitespace-collapsed,
 * one line, never cut mid-word. The same applies to `partialMatches`, which the
 * report formatter prints line by line.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as suiteModule from "../src/testing/nl-test-suite.js";
import { parseNLTestSuite, runNLTestSuite } from "../src/testing/nl-test-suite.js";

const LONG = "Every run scores the page with a Cognitive Transport Score that predicts where a real user "
  + "abandons, step by step, before you ship it, and then explains which element caused the drop and why.";

// Shaped like cbrowser.ai's top of page: a search hint made of <kbd> glyphs and
// flex-row auth links ahead of the heading, so innerText puts each on its own line.
const FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture</title>
<style>header{display:flex;gap:8px} header > *{display:block}</style></head><body>
<header><kbd>⌘</kbd><kbd>K</kbd><a href="#login">Log in</a><a href="#signup">Sign up</a></header>
<h1>Persona Testing for Product Teams</h1>
<p>${LONG}</p>
<p>Plans start free.</p>
<p style="text-transform:uppercase">Trusted by product teams</p>
</body></html>`;

type Step = { action: string; instruction: string; passed: boolean; error?: { suggestion?: string; partialMatches?: string[] } };

/** A snippet is shown to a reader: one line, collapsed, no glyph soup, never cut mid-word. */
function expectReadable(snippet: string, pageText: string) {
  expect(snippet).not.toMatch(/[\n\r\t]/);
  expect(snippet).not.toMatch(/ {2}/);
  expect(snippet).toBe(snippet.trim());
  expect(snippet).not.toContain("⌘");
  // It is real page text, and it starts and ends on word boundaries in that text.
  const lines = pageText.split(/\n+/).map((l) => l.replace(/\s+/g, " ").trim());
  const esc = snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bounded = new RegExp(`(^|\\s)${esc}(\\s|$)`);
  expect(lines.some((l) => bounded.test(l))).toBe(true);
}

describe("B22: findPartialMatches, pure", () => {
  const find = (suiteModule as Record<string, unknown>).findPartialMatches as
    ((t: string, e: string, n?: number) => string[]) | undefined;
  const PAGE = `⌘\nK\nLog in\nSign up\nPersona Testing for Product Teams\n${LONG}\nPlans start free.`;

  test("the reported case: the matching line, real case, nothing else", () => {
    expect(typeof find).toBe("function");
    expect(find!(PAGE, "pERSONA tESTING fOR pRODUCT")).toEqual(["Persona Testing for Product Teams"]);
  });

  test("a long line is trimmed around the match at word boundaries", () => {
    expect(typeof find).toBe("function");
    const [s] = find!(PAGE, "cOGNITIVE tRANSPORT sCORE");
    expect(s).toContain("Cognitive Transport Score");
    expect(s.length).toBeLessThanOrEqual(80);
    expectReadable(s, PAGE);
  });

  test("a target that is not on the page gets no near miss (no word-by-word fallback)", () => {
    // Round 2: the word fallback offered unrelated lines, e.g. "for" inside
    // "Platform", for a target that is simply absent.
    expect(typeof find).toBe("function");
    expect(find!(PAGE, "Persona Pricing Plans")).toEqual([]);
    expect(find!("Platform overview\nPlans start free.", "xqzv for qqzv")).toEqual([]);
  });

  test("a match across a line break returns only the matched span, not the neighbouring lines", () => {
    expect(typeof find).toBe("function");
    // The verifier's shape: the target runs from one rendered line into the next.
    const out = find!(PAGE, "SIGN UP PERSONA TESTING");
    expect(out).toEqual(["Sign up Persona Testing"]);
    expect(out[0]).not.toContain("⌘");
  });

  test("whitespace in the target or the page does not defeat the match", () => {
    expect(typeof find).toBe("function");
    expect(find!("Persona   Testing\tfor Product Teams", "persona testing  for")).toEqual(["Persona Testing for Product Teams"]);
  });
});

describe("B22: nl_test_inline suggestion on a served page", () => {
  let server: ReturnType<typeof Bun.serve>;
  let url: string;

  beforeAll(() => {
    server = Bun.serve({ port: 0, fetch: () => new Response(FIXTURE, { headers: { "content-type": "text/html; charset=utf-8" } }) });
    url = `http://localhost:${server.port}/`;
  });
  afterAll(() => { server?.stop(true); });

  const failingAssert = (r: Awaited<ReturnType<typeof runNLTestSuite>>, name: string) =>
    (r.testResults.find((t) => t.name === name)!.stepResults as Step[]).find((s) => s.action === "assert")!;

  test("wrong-case heading: suggests the heading's real text, and the suggestion passes", async () => {
    const suite = parseNLTestSuite(`# heading
go to ${url}
verify page contains "pERSONA tESTING fOR pRODUCT"
# paragraph
go to ${url}
verify page contains "cOGNITIVE tRANSPORT sCORE"
`, "b22");
    const r = await runNLTestSuite(suite, { headless: true, screenshotOnFailure: false });

    const heading = failingAssert(r, "heading");
    expect(heading.passed).toBe(false); // B8 still holds: exact unless fuzzy
    expect(heading.error?.suggestion).toMatch(/Try: verify page contains "Persona Testing for Product Teams"$/);
    expect(heading.error?.partialMatches).toEqual(["Persona Testing for Product Teams"]);

    const para = failingAssert(r, "paragraph");
    expect(para.passed).toBe(false);
    const suggested = /Try: verify page contains "(.*)"$/.exec(para.error?.suggestion ?? "")?.[1] ?? "";
    expect(suggested).toContain("Cognitive Transport Score");
    expect(suggested.length).toBeLessThanOrEqual(80);
    for (const s of para.error?.partialMatches ?? []) expect(s).not.toMatch(/[\n⌘]/);

    // The point of a suggestion: paste it back and it passes, case-sensitively.
    const pasted = parseNLTestSuite(`# pasted heading
go to ${url}
verify page contains "Persona Testing for Product Teams"
# pasted paragraph
go to ${url}
verify page contains "${suggested}"
`, "b22-pasted");
    const again = await runNLTestSuite(pasted, { headless: true, screenshotOnFailure: false });
    expect(again.testResults.map((t) => [t.name, t.passed])).toEqual([["pasted heading", true], ["pasted paragraph", true]]);
  }, 180_000);

  test("fuzzy near miss: partial matches keep the page's case and lines", async () => {
    const suite = parseNLTestSuite(`# near miss
go to ${url}
verify page contains "Persona Pricing"
`, "b22-fuzzy");
    const r = await runNLTestSuite(suite, { headless: true, screenshotOnFailure: false, fuzzyMatch: true });
    const step = failingAssert(r, "near miss");
    expect(step.passed).toBe(false);
    // "Persona Pricing" is not on the page in any case, so there is no near
    // miss to offer and no fabricated "Try:" (round 2: the word fallback used
    // to suggest an unrelated heading here).
    expect(step.error?.partialMatches ?? []).toEqual([]);
    expect(step.error?.suggestion ?? "").not.toMatch(/Try: verify page contains/);
  }, 180_000);

  test("CSS text-transform: the suggestion comes from the text the exact check reads, so pasted back it passes", async () => {
    // Round 2: snippets came from rendered innerText (uppercased by CSS here),
    // while the exact check reads the source text, so the "Try:" failed.
    const suite = parseNLTestSuite(`# eyebrow
go to ${url}
verify page contains "tRUSTED BY PRODUCT"
`, "b22-transform");
    const r = await runNLTestSuite(suite, { headless: true, screenshotOnFailure: false });
    const step = failingAssert(r, "eyebrow");
    expect(step.passed).toBe(false);
    const suggested = /Try: verify page contains "(.*)"$/.exec(step.error?.suggestion ?? "")?.[1];
    expect(suggested).toBe("Trusted by product");
    const again = await runNLTestSuite(parseNLTestSuite(`# pasted
go to ${url}
verify page contains "${suggested}"
`, "b22-transform-pasted"), { headless: true, screenshotOnFailure: false });
    expect(again.testResults[0].passed).toBe(true);
  }, 180_000);
});
