/**
 * agent_ready_audit: examples from the real element, whole-word testids, paging.
 *
 * Three defects from one report:
 *
 *   1. The generic-label finding's codeExample was one literal for every page:
 *        <!-- Instead of: --> <button>Submit</button>
 *        <!-- Use: -->        <button>Save Changes</button> ... Create Account ...
 *      so a carousel "Next" was told about account creation, in markup that
 *      matched nothing on the page. The unlabeled-button and missing-alt
 *      examples were canned the same way.
 *   2. The suggested data-testid was a hard substring(0, 40):
 *      "sign-up-for-pro-and-get-500-bonus-credit", a word the page lacks.
 *   3. The tool returned slice(0, 5) of issues and of recommendations, with no
 *      way to reach the rest; the stdio copy also sliced in detection order.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser } from "playwright";
import * as ara from "../src/analysis/agent-ready-audit.js";
import { registerAuditTools } from "../src/mcp-tools/base/audit-tools.js";
import type { AgentReadyAuditResult, AgentReadyIssue, AgentReadyRecommendation } from "../src/types.js";

type Fn = (...a: never[]) => unknown;
// Through the namespace so a missing export fails its own tests, not the file.
const fn = <T extends Fn>(name: string) => (...a: Parameters<T>) =>
  (ara as unknown as Record<string, T>)[name](...a) as ReturnType<T>;
const slugifyTestId = fn<(s: string) => string>("slugifyTestId");
const pageAgentReadyFindings = fn<(r: Pick<AgentReadyAuditResult, "issues" | "recommendations">, o?: { limit?: number; offset?: number }) => Record<string, unknown>>("pageAgentReadyFindings");

const SVG = `<svg width="16" height="16" aria-hidden="true"><path d="M0 0h16v16z"/></svg>`;
const GIF = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

const SNIPPET_FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Snippet fixture page for agent audit</title></head><body><main>
  <section id="stories" aria-label="Testimonials"><p>Quote</p></section>
  <button type="button" class="carousel-next" aria-controls="stories">Next</button>
  <form aria-label="Newsletter signup"><input type="email" aria-label="Email"><input type="submit" class="nl" value="Submit"></form>
  <button type="button" class="plain">Click here</button>
  <nav aria-label="Product links"><button type="button" class="more" aria-label="More">${SVG}</button></nav>
  <button type="button" class="icon-only">${SVG}</button>
  <img class="hero" src="${GIF}" width="200" height="100">
</main></body></html>`;

describe("slugifyTestId cuts at a word boundary", () => {
  test("the reported name", () => {
    expect(slugifyTestId("Sign up for Pro and get 500 bonus credits free, they never expire"))
      .toBe("sign-up-for-pro-and-get-500-bonus");
  });

  test("short names are untouched", () => {
    expect(slugifyTestId("Previous slide")).toBe("previous-slide");
    expect(slugifyTestId("  CBrowser home!  ")).toBe("cbrowser-home");
  });

  test("a cut that already lands on a hyphen keeps the full 40", () => {
    const forty = "abcdefghij-abcdefghij-abcdefghij-abcdefg"; // 40 chars
    expect(forty.length).toBe(40);
    expect(slugifyTestId(`${forty} next`)).toBe(forty);
  });

  test("a single word longer than the limit is hard-cut", () => {
    expect(slugifyTestId("x".repeat(60))).toBe("x".repeat(40));
  });

  test("never longer than 40, never ends in a hyphen", () => {
    for (const s of ["a b c d e f g h i j k l m n o p q r s t u v w x y z", "Ünïcödé wörds ārē kept as letters too, all of them", "one-two-three-four-five-six-seven-eight-nine"]) {
      const out = slugifyTestId(s);
      expect(out.length).toBeLessThanOrEqual(40);
      expect(out.endsWith("-")).toBe(false);
    }
  });
});

describe("pageAgentReadyFindings pages like hunt_bugs", () => {
  const sev = ["low", "critical", "medium", "low", "high", "medium", "low", "high", "low", "medium", "critical", "low"] as const;
  const issues = sev.map((s, i) => ({ category: "findability", severity: s, description: `issue ${i}`, detectionMethod: "x", recommendation: "r" })) as unknown as AgentReadyIssue[];
  const recommendations = Array.from({ length: 8 }, (_, i) => ({ priority: i + 1, category: "c", issue: `rec ${i + 1}`, fix: "f", effort: "easy", impact: "high" })) as unknown as AgentReadyRecommendation[];
  const rank = (s: string) => ["critical", "high", "medium", "low", "info"].indexOf(s);

  test("default: five worst, and the cut is stated with the next offset", () => {
    const r = pageAgentReadyFindings({ issues, recommendations });
    const shown = r.topIssues as AgentReadyIssue[];
    expect(shown.map((i) => i.severity)).toEqual(["critical", "critical", "high", "high", "medium"]);
    expect(r.returned).toBe(5);
    expect(r.offset).toBe(0);
    expect(r.issuesFound).toBe(12);
    expect(r.issuesOmitted).toBe(7);
    expect(String(r.omittedNote)).toContain("Re-run with offset=5");
    expect(r.bySeverity).toEqual({ low: 5, critical: 2, medium: 3, high: 2 });
  });

  test("offset walks the same worst-first order with nothing skipped or repeated", () => {
    const all = (pageAgentReadyFindings({ issues, recommendations }, { limit: 100 }).topIssues as AgentReadyIssue[]).map((i) => i.description);
    const pages: string[] = [];
    for (let off = 0; off < 12; off += 5) {
      pages.push(...(pageAgentReadyFindings({ issues, recommendations }, { limit: 5, offset: off }).topIssues as AgentReadyIssue[]).map((i) => i.description));
    }
    expect(pages).toEqual(all);
    expect(new Set(pages).size).toBe(12);
    const sevs = (pageAgentReadyFindings({ issues, recommendations }, { limit: 100 }).topIssues as AgentReadyIssue[]).map((i) => rank(i.severity));
    expect([...sevs].sort((a, b) => a - b)).toEqual(sevs);
  });

  test("the last page reports nothing omitted", () => {
    const r = pageAgentReadyFindings({ issues, recommendations }, { limit: 5, offset: 10 });
    expect(r.returned).toBe(2);
    expect(r.issuesOmitted).toBeUndefined();
    expect(r.omittedNote).toBeUndefined();
  });

  test("recommendations are cut by limit, the cut is stated, and offset never skips them", () => {
    const r = pageAgentReadyFindings({ issues, recommendations }, { limit: 5 });
    expect((r.topRecommendations as AgentReadyRecommendation[]).map((x) => x.priority)).toEqual([1, 2, 3, 4, 5]);
    expect(r.recommendationsFound).toBe(8);
    expect(r.recommendationsOmitted).toBe(3);
    expect(String(r.recommendationsNote)).toContain("Raise limit");
    // page two of the ISSUES must not drop recommendations 1-5
    const p2 = pageAgentReadyFindings({ issues, recommendations }, { limit: 5, offset: 5 });
    expect((p2.topRecommendations as AgentReadyRecommendation[]).map((x) => x.priority)).toEqual([1, 2, 3, 4, 5]);
  });

  test("the pre-19.2.3 issuesNote field is still present when issues are cut", () => {
    const r = pageAgentReadyFindings({ issues, recommendations });
    expect(String(r.issuesNote)).toBe(String(r.omittedNote));
  });
});

describe("examples are built from the flagged element", () => {
  let browser: Browser;
  let result: AgentReadyAuditResult;

  beforeAll(async () => {
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.setContent(SNIPPET_FIXTURE);
    try {
      result = await ara.runAgentReadyAudit("https://fixture.invalid/", { page, headless: true });
    } finally {
      await ctx.close();
    }
  }, 120_000);

  afterAll(async () => { await browser?.close(); });

  const genericExamples = () => result.issues.filter((i) => i.detectionMethod === "action-verb-check").map((i) => i.codeExample || "");
  const exampleFor = (needle: string) => genericExamples().find((e) => e.includes(needle));

  test("no generic-label example carries the canned account-creation advice", () => {
    expect(genericExamples().length).toBeGreaterThanOrEqual(4);
    for (const e of genericExamples()) {
      expect(e).not.toContain("Create Account");
      expect(e).not.toContain("Download Report");
      expect(e).not.toContain("<button>Submit</button>");
    }
  });

  test("a carousel Next shows its real markup and names its aria-controls target", () => {
    const e = exampleFor('class="carousel-next"');
    expect(e).toBeDefined();
    expect(e).toContain(`<button type="button" class="carousel-next" aria-controls="stories">Next</button>`);
    expect(e).toContain(">Next: Testimonials</button>");
  });

  test("a submit input changes its value, named after its form", () => {
    const e = exampleFor('class="nl"');
    expect(e).toBeDefined();
    expect(e).toContain(`<input type="submit" class="nl" value="Submit">`);
    expect(e).toContain(`value="Submit: Newsletter signup"`);
  });

  test("without context the suggestion is an explicit fill-in on the real element", () => {
    const e = exampleFor('class="plain"');
    expect(e).toBeDefined();
    expect(e).toContain(`<button type="button" class="plain">Click here</button>`);
    expect(e).toContain(`<button type="button" class="plain">Click here [what it acts on]</button>`);
  });

  test("an aria-label name is changed where it lives, the icon content left alone", () => {
    const e = exampleFor('class="more"');
    expect(e).toBeDefined();
    expect(e).toContain(`aria-label="More: Product links"`);
    expect(e).not.toContain("<svg");
  });

  test("the generic-label recommendation's snippet is one of those real examples", () => {
    const rec = result.recommendations.find((r) => /generic label/.test(r.issue));
    expect(rec).toBeDefined();
    expect(genericExamples()).toContain(rec!.codeSnippet);
  });

  test("an unlabeled icon button's example is that button with an aria-label added", () => {
    const i = result.issues.find((x) => x.detectionMethod === "button-label-check" && (x.codeExample || "").includes("icon-only"));
    expect(i).toBeDefined();
    expect(i!.codeExample).toContain(`<button type="button" class="icon-only" aria-label="Describe the action">`);
  });

  test("a missing-alt example is that <img> with alt added", () => {
    const i = result.issues.find((x) => x.detectionMethod === "img-alt-check");
    expect(i).toBeDefined();
    expect(i!.codeExample).toContain(`class="hero"`);
    expect(i!.codeExample).toContain(`src="${GIF}"`);
    expect(i!.codeExample).toMatch(/ alt="[^"]+"/);
  });
});

describe("the agent_ready_audit tool takes limit and offset", () => {
  type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
  let server: ReturnType<typeof Bun.serve>;
  let handler: Handler;

  beforeAll(() => {
    // Twelve images without alt (medium) and a few generic buttons (low):
    // well over one page of findings.
    const imgs = Array.from({ length: 12 }, (_, k) => `<img class="i${k}" src="${GIF}" width="50" height="50">`).join("");
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Paging fixture page for agent audit</title></head>
<body><main>${imgs}<button>Submit</button><button>Next</button><button>Click here</button></main></body></html>`;
    server = Bun.serve({ port: 0, fetch: () => new Response(html, { headers: { "content-type": "text/html" } }) });
    const handlers: Record<string, Handler> = {};
    registerAuditTools({ registerTool: (name: string, _c: unknown, h: Handler) => { handlers[name] = h; } } as never);
    handler = handlers["agent_ready_audit"];
  });

  afterAll(() => { server?.stop(true); });

  test("returned/offset/issuesOmitted/omittedNote reflect the page asked for", async () => {
    const res = await handler({ url: `http://localhost:${server.port}/`, limit: 3, offset: 2 });
    const r = JSON.parse(res.content[0].text);
    expect(r.issuesFound).toBeGreaterThan(5);
    expect(r.returned).toBe(3);
    expect(r.offset).toBe(2);
    expect(r.topIssues.length).toBe(3);
    expect(r.issuesOmitted).toBe(r.issuesFound - 5);
    expect(r.omittedNote).toContain("Re-run with offset=5");
    expect(r.topRecommendations.length).toBeLessThanOrEqual(3);
    expect(typeof r.recommendationsFound).toBe("number");
  }, 120_000);
});
