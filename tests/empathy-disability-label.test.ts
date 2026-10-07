/**
 * The empathy audit labels each accessibility persona the way the roster does.
 *
 * Measured 2026-10-06: four places inferred a disability label four ways, so
 * dyslexic-user listed as "Cognitive (Processing)" in list_cognitive_personas
 * and came back "Cognitive (ADHD/Memory)" from its own empathy_audit. The
 * labels are now declared on the persona and every site reads them.
 *
 * This runs the REAL audit (runEmpathyAudit on a local fixture, no network)
 * for all eleven built-ins and compares the `disabilityType` a customer reads
 * in the result with the hosted roster. It replaces a unit test that called
 * getDisabilityType directly: exporting that helper for the test put it on the
 * package's public surface through `export *` (reviewer, 2026-10-07), and the
 * audit result is the thing customers see anyway.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium, type Browser, type Page } from "playwright";
import { runEmpathyAudit } from "../src/analysis/accessibility-empathy.js";
import { ACCESSIBILITY_PERSONAS } from "../src/personas.js";

const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture</title></head>
<body><main><h1>Plans</h1><p>Short text.</p><a href="#a">Continue</a></main></body></html>`;
const URL = `data:text/html;charset=utf-8,${encodeURIComponent(HTML)}`;

type Row = { name: string; category: string; disabilityType?: string };

let dataDir: string;
const prevDataDir = process.env.CBROWSER_DATA_DIR;
let browser: Browser;
let page: Page;
let result: Awaited<ReturnType<typeof runEmpathyAudit>>;
let roster: Row[];

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "empathy-label-"));
  process.env.CBROWSER_DATA_DIR = dataDir;

  // The hosted list_cognitive_personas, called through its registered handler.
  const { registerCognitiveTools } = await import("../src/mcp-tools/base/cognitive-tools.js");
  let handler: (() => Promise<{ content: Array<{ text: string }> }>) | undefined;
  registerCognitiveTools(
    {
      registerTool: (name: string, _c: unknown, fn: typeof handler) => {
        if (name === "list_cognitive_personas") handler = fn;
      },
      tool: () => {}, registerResource: () => {}, resource: () => {},
    } as never,
    { getBrowser: async () => { throw new Error("no browser"); } } as never,
  );
  roster = (JSON.parse((await handler!()).content[0].text) as { personas: Row[] }).personas;

  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  result = await runEmpathyAudit(URL, {
    disabilities: Object.keys(ACCESSIBILITY_PERSONAS),
    wcagLevel: "AA",
    maxSteps: 1,
    maxTime: 10,
    headless: true,
    scope: "viewport",
    page,
  });
}, 180_000);

afterAll(async () => {
  await browser?.close();
  rmSync(dataDir, { recursive: true, force: true });
  if (prevDataDir === undefined) delete process.env.CBROWSER_DATA_DIR;
  else process.env.CBROWSER_DATA_DIR = prevDataDir;
});

describe("empathy_audit disabilityType matches the roster", () => {
  test("the audit ran every built-in accessibility persona", () => {
    expect(result.results.map((r) => r.persona).sort())
      .toEqual(Object.keys(ACCESSIBILITY_PERSONAS).sort());
  });

  test("each persona's audit label equals its roster label", () => {
    const mismatches: string[] = [];
    for (const r of result.results) {
      const row = roster.find((x) => x.name === r.persona && x.category === "accessibility");
      if (row?.disabilityType !== r.disabilityType) {
        mismatches.push(`${r.persona}: audit "${r.disabilityType}" vs roster "${row?.disabilityType}"`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
