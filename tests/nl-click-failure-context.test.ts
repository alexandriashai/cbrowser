/**
 * A failed NL click step says what was on the page and what was tried.
 *
 * Reported on nl_test_inline: `click "Pricing"` style steps failed with
 *
 *   reason:          Failed to click: "Pricing"
 *   suggestion:      Try using a more specific selector or check if an overlay is blocking.
 *   recommendation:  Click ""Pricing"" failed. ...
 *
 * Two defects:
 *
 *   1. the parser kept the enclosing quotes in the target, so smartClick looked
 *      for the literal text `"Pricing"` and the recommendation wrapped the
 *      already-quoted target in quotes again;
 *   2. the runner threw `Failed to click: X` and dropped everything smartClick
 *      had worked out (its aiSuggestion and the selectors it tried); the catch
 *      then substituted a generic suggestion.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as nl from "../src/testing/nl-test-suite.js";

const { parseNLInstruction, parseNLTestSuite, runNLTestSuite } = nl;
// Read through the namespace so a missing export fails its own assertions
// instead of failing the whole file at import.
const unquote = (s: string): string => (nl as unknown as { unquote: (s: string) => string }).unquote(s);

const FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>click fixture</title></head><body>
<nav aria-label="Primary"><a href="#pricing">Pricing</a> <a href="#docs">Docs</a></nav>
<main><h1>Click fixture</h1><button type="button" id="contact">Contact</button>
<section id="pricing"><h2>Pricing</h2></section></main>
</body></html>`;

describe("unquote strips one enclosing pair and nothing else", () => {
  test("a quoted target loses its quotes", () => {
    expect(unquote('"Pricing"')).toBe("Pricing");
    expect(unquote("'Pricing'")).toBe("Pricing");
    expect(unquote("“Pricing”")).toBe("Pricing");
    expect(unquote('  "Get started"  ')).toBe("Get started");
  });

  test("a selector that contains quotes survives", () => {
    expect(unquote('[data-testid="x"]')).toBe('[data-testid="x"]');
    expect(unquote('"a" or "b"')).toBe('"a" or "b"');
  });

  test("degenerate input is returned as given", () => {
    expect(unquote('"')).toBe('"');
    expect(unquote('""')).toBe('""');
    expect(unquote('"Pricing')).toBe('"Pricing');
    expect(unquote("Pricing")).toBe("Pricing");
  });
});

describe("the parser unquotes click, fill, select and navigate targets", () => {
  test("click", () => {
    expect(parseNLInstruction('click "Pricing"').target).toBe("Pricing");
    expect(parseNLInstruction("click on the 'Docs'").target).toBe("Docs");
  });

  test("click keeps an attribute selector intact", () => {
    expect(parseNLInstruction('click [data-testid="nav-docs"]').target).toBe('[data-testid="nav-docs"]');
  });

  test("type ... into", () => {
    const s = parseNLInstruction('type "a@b.co" into "Email"');
    expect(s.target).toBe("Email");
    expect(s.value).toBe("a@b.co");
  });

  test("fill ... with", () => {
    const s = parseNLInstruction('fill "Email" with "a@b.co"');
    expect(s.target).toBe("Email");
    expect(s.value).toBe("a@b.co");
  });

  test("select ... from", () => {
    expect(parseNLInstruction('select "Red" from "Colour"').target).toBe("Colour");
  });

  test("navigate", () => {
    expect(parseNLInstruction('go to "https://example.com/"').target).toBe("https://example.com/");
  });
});

describe("a failed click carries the page's elements, the selectors tried and smartClick's suggestion", () => {
  let server: ReturnType<typeof Bun.serve>;
  let result: Awaited<ReturnType<typeof runNLTestSuite>>;

  beforeAll(async () => {
    server = Bun.serve({ port: 0, fetch: () => new Response(FIXTURE, { headers: { "content-type": "text/html" } }) });
    const suite = parseNLTestSuite(`# clicks
go to http://localhost:${server.port}/
click "Pricing"
click "Nonexistent Widget"
`, "clicks");
    result = await runNLTestSuite(suite, { headless: true, screenshotOnFailure: false });
  }, 120_000);

  afterAll(() => {
    server?.stop(true);
  });

  const steps = () => result.testResults[0].stepResults;

  test("the quoted click on a real link passes", () => {
    const s = steps().find((x) => x.instruction === 'click "Pricing"')!;
    expect(s.parsed.target).toBe("Pricing");
    expect(s.passed).toBe(true);
  });

  test("the failing step's reason still starts with Failed to click", () => {
    const s = steps().find((x) => x.instruction === 'click "Nonexistent Widget"')!;
    expect(s.passed).toBe(false);
    expect(s.error?.reason.startsWith("Failed to click: Nonexistent Widget")).toBe(true);
  });

  test("the failing step lists the clickable elements that ARE there (max 20)", () => {
    const s = steps().find((x) => x.instruction === 'click "Nonexistent Widget"')!;
    const els = s.error?.availableElements ?? [];
    expect(els.length).toBeGreaterThan(0);
    expect(els.length).toBeLessThanOrEqual(20);
    expect(els.map((e) => e.text)).toEqual(expect.arrayContaining(["Pricing", "Docs", "Contact"]));
  });

  test("the failing step lists the selectors smartClick tried, starting with the target", () => {
    const s = steps().find((x) => x.instruction === 'click "Nonexistent Widget"')!;
    expect(s.error?.selectorsTried?.[0]).toBe("Nonexistent Widget");
  });

  test("the suggestion is smartClick's analysis, not the generic fallback", () => {
    const s = steps().find((x) => x.instruction === 'click "Nonexistent Widget"')!;
    expect(s.error?.suggestion).toContain("not found after");
  });

  test("no recommendation doubles the quotes", () => {
    const recs = result.recommendations ?? [];
    expect(recs.some((r) => r.includes('Click "Nonexistent Widget" failed'))).toBe(true);
    expect(recs.filter((r) => r.includes('""'))).toEqual([]);
  });
});
