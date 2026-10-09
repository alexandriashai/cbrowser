/**
 * Round 2 of B6 (2026-10-09): advisories reach the CLI text and HTML reports.
 *
 * splitAboveAuditLevel moves above-level findings out of `barriers` into
 * `advisories`. The MCP handler reports them, but formatEmpathyAuditReport
 * (the CLI text report) and generateEmpathyAuditHtmlReport (--html) read only
 * barriers, violations and remediation -- so an AAA-only 40x40 target that
 * main showed as a minor barrier vanished from both reports.
 *
 * Pure: the two report functions on a constructed result, no browser.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGINAL_DATA_DIR = process.env.CBROWSER_DATA_DIR;
const DATA_DIR = mkdtempSync(join(ORIGINAL_DATA_DIR ?? tmpdir(), "cbrowser-advisories-report-"));
process.env.CBROWSER_DATA_DIR = DATA_DIR;
const { formatEmpathyAuditReport, generateEmpathyAuditHtmlReport } =
  await import("../src/analysis/accessibility-empathy.js");
type Result = Parameters<typeof formatEmpathyAuditReport>[0];

afterAll(() => {
  rmSync(DATA_DIR, { recursive: true, force: true });
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.CBROWSER_DATA_DIR;
  else process.env.CBROWSER_DATA_DIR = ORIGINAL_DATA_DIR;
});

const FORTY = {
  type: "touch_target" as const,
  element: "button.forty",
  description: "Touch target too small (40x40px), below the 44x44 enhanced size",
  affectedPersonas: ["motor-impairment-tremor"],
  wcagCriteria: ["2.5.5"],
  severity: "minor" as const,
  remediation: "Make the target at least 44x44 CSS pixels",
  aboveAuditLevel: true,
  wcagLevelOfFinding: "AAA" as const,
};
/** Page text reaches element names through aria-labels; the HTML must not run it. */
const HOSTILE = {
  ...FORTY,
  element: `button[aria-label="<img src=x onerror=alert(1)>"]`,
  description: "Touch target too small (30x60px) <script>alert(2)</script>",
};

function result(advisories?: Array<typeof FORTY>): Result {
  return {
    url: "https://example.test/",
    timestamp: "2026-10-09T00:00:00.000Z",
    results: [{
      persona: "motor-impairment-tremor",
      disabilityType: "Motor (tremor)",
      goalAchieved: true,
      noBlockingBarriers: true,
      barriers: [],
      frictionPoints: [],
      wcagViolations: [],
      empathyScore: 90,
      remediation: [],
      duration: 1000,
      ...(advisories ? { advisories } : {}),
    }],
    allWcagViolations: [],
    allBarriers: [],
    topBarriers: [],
    ...(advisories ? { advisories } : {}),
    combinedRemediation: [],
    overallScore: 90,
    duration: 1000,
  } as unknown as Result;
}

describe("the CLI text report lists advisories", () => {
  test("an AAA-only finding in an AA audit appears, with its criterion, level and element", () => {
    const text = formatEmpathyAuditReport(result([FORTY]));
    expect(text).toMatch(/ADVISORIES \(1\)/);
    expect(text).toContain("2.5.5 (Level AAA)");
    expect(text).toContain("(40x40px)");
    expect(text).toContain("button.forty");
    expect(text).toMatch(/not scored/);
  });

  test("no advisories, no section", () => {
    expect(formatEmpathyAuditReport(result())).not.toMatch(/ADVISORIES/);
  });

  test("a long list is capped and says how many more", () => {
    const many = Array.from({ length: 23 }, (_, i) => ({ ...FORTY, element: `button.t${i}` }));
    const text = formatEmpathyAuditReport(result(many));
    expect(text).toContain("button.t19");
    expect(text).not.toContain("button.t20");
    expect(text).toContain("+3 more advisories");
  });
});

describe("the HTML report lists advisories", () => {
  test("an AAA-only finding in an AA audit appears in an Advisories section", () => {
    const html = generateEmpathyAuditHtmlReport(result([FORTY]));
    expect(html).toContain("<h2>Advisories (1)</h2>");
    expect(html).toContain("2.5.5 (Level AAA)");
    expect(html).toContain("(40x40px)");
    expect(html).toContain("<code>button.forty</code>");
  });

  test("no advisories, no section", () => {
    expect(generateEmpathyAuditHtmlReport(result())).not.toContain("Advisories (");
  });

  test("page-derived text in an advisory is escaped, not rendered as markup", () => {
    const html = generateEmpathyAuditHtmlReport(result([HOSTILE]));
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>alert(2)");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;script&gt;alert(2)&lt;/script&gt;");
  });
});
