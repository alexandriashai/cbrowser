/**
 * NL test assertions are exact unless fuzzy matching was asked for.
 *
 * The bug report: `verify page contains "pERSONA tESTING"` passed on a page that
 * says "Persona Testing", with fuzzyMatch off. Two layers each threw case away:
 *
 *   1. parseNLInstruction matched the assert patterns against a lowercased copy
 *      of the instruction, so `target` came back lowercased;
 *   2. the runner then called browser.assert(), whose title-contains,
 *      page-contains and quoted-text checks lowercased both sides.
 *
 * So `fuzzyMatch: false` was fuzzy too, and the option documented as "use
 * case-insensitive fuzzy matching" switched between two case-insensitive modes.
 *
 * The standalone `assert` tool and CLI `assert` keep their case-insensitive
 * default; only the NL runner (nl_test_inline, nl_test_file, CLI test-suite)
 * asks for an exact compare, and only when fuzzyMatch is off.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { parseNLInstruction, parseNLTestSuite, runNLTestSuite } from "../src/testing/nl-test-suite.js";
import { CBrowser } from "../src/browser.js";

const FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Persona Testing Hub</title></head><body>
<h1>Persona Testing</h1><p>Run a cognitive journey.</p>
<button id="SubmitBtn">Go</button>
</body></html>`;

describe("the parser keeps the target's case", () => {
  test("page-contains target is not lowercased", () => {
    expect(parseNLInstruction('verify page contains "pERSONA tESTING"').target).toBe("pERSONA tESTING");
  });

  test("title-contains target is not lowercased", () => {
    expect(parseNLInstruction('verify title contains "Persona Testing"').target).toBe("Persona Testing");
  });

  test("count assertions keep the noun's case", () => {
    const step = parseNLInstruction("verify there are 3 Buttons");
    expect(step.value).toBe("3");
    expect(step.target).toBe("Buttons");
  });

  test("wait-for-text keeps the text's case", () => {
    // This target goes to waitForSelector(`text=...`) and to an
    // innerText.includes() fallback, which is case-sensitive.
    expect(parseNLInstruction('wait for "Persona Testing" appears').target).toBe("Persona Testing");
  });

  test("wait-for-element keeps a selector's case", () => {
    expect(parseNLInstruction("wait for #SubmitBtn to appear").target).toBe("#SubmitBtn");
  });

  test("the patterns still match regardless of the instruction's own case", () => {
    const step = parseNLInstruction('VERIFY PAGE CONTAINS "Persona Testing"');
    expect(step.action).toBe("assert");
    expect(step.target).toBe("Persona Testing");
  });
});

describe("the runner compares exactly unless fuzzyMatch is on", () => {
  let server: ReturnType<typeof Bun.serve>;
  let url: string;

  beforeAll(() => {
    server = Bun.serve({ port: 0, fetch: () => new Response(FIXTURE, { headers: { "content-type": "text/html" } }) });
    url = `http://localhost:${server.port}/`;
  });

  afterAll(() => {
    server?.stop(true);
  });

  const suiteText = () => `# exact case
go to ${url}
verify page contains "Persona Testing"
verify title contains "Persona Testing"
# wrong case, page
go to ${url}
verify page contains "pERSONA tESTING"
# wrong case, title
go to ${url}
verify title contains "pERSONA tESTING"
# wrong case, quoted text
go to ${url}
verify contains "pERSONA tESTING"
`;

  test("fuzzyMatch off: exact case passes, wrong case fails on every text check", async () => {
    const suite = parseNLTestSuite(suiteText(), "case");
    const r = await runNLTestSuite(suite, { headless: true, screenshotOnFailure: false });
    const byName = Object.fromEntries(r.testResults.map((t) => [t.name, t]));

    expect(byName["exact case"].passed).toBe(true);
    expect(byName["wrong case, page"].passed).toBe(false);
    expect(byName["wrong case, title"].passed).toBe(false);
    expect(byName["wrong case, quoted text"].passed).toBe(false);

    // The failure still points at the near-miss, so the reader sees why.
    const step = byName["wrong case, page"].stepResults.find((s) => s.action === "assert")!;
    expect(step.error?.partialMatches?.join(" ")).toContain("Persona Testing");
  }, 120_000);

  test("fuzzyMatch on: the wrong-case content checks pass", async () => {
    const suite = parseNLTestSuite(suiteText(), "case-fuzzy");
    const r = await runNLTestSuite(suite, { headless: true, screenshotOnFailure: false, fuzzyMatch: true });
    const byName = Object.fromEntries(r.testResults.map((t) => [t.name, t]));

    expect(byName["exact case"].passed).toBe(true);
    expect(byName["wrong case, page"].passed).toBe(true);
    expect(byName["wrong case, title"].passed).toBe(true);
    expect(byName["wrong case, quoted text"].passed).toBe(true);
  }, 120_000);
});

describe("browser.assert: opt-in caseSensitive, default unchanged", () => {
  let server: ReturnType<typeof Bun.serve>;
  let browser: CBrowser;

  beforeAll(async () => {
    server = Bun.serve({ port: 0, fetch: () => new Response(FIXTURE, { headers: { "content-type": "text/html" } }) });
    browser = new CBrowser({ headless: true });
    await browser.launch();
    await browser.navigate(`http://localhost:${server.port}/`);
  });

  afterAll(async () => {
    try { await browser?.close(); } catch { /* closing is not the assertion */ }
    server?.stop(true);
  });

  test("default (the standalone assert tool) still ignores case", async () => {
    expect((await browser.assert('page contains "pERSONA tESTING"')).passed).toBe(true);
    expect((await browser.assert('title contains "pERSONA"')).passed).toBe(true);
  });

  test("caseSensitive: true compares exactly", async () => {
    expect((await browser.assert('page contains "pERSONA tESTING"', { caseSensitive: true })).passed).toBe(false);
    expect((await browser.assert('page contains "Persona Testing"', { caseSensitive: true })).passed).toBe(true);
    expect((await browser.assert('title contains "pERSONA"', { caseSensitive: true })).passed).toBe(false);
    expect((await browser.assert('title contains "Persona"', { caseSensitive: true })).passed).toBe(true);
  });
});
