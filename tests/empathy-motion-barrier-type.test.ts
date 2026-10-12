/**
 * v10 B44/B45: a 2.2.2 (Pause, Stop, Hide) motion barrier was typed
 * "cognitive_load" while its criterion is weighted as "timing", and the type
 * alone rated its remediation "hard" (cognitive_load = restructure navigation).
 * Adding a pause control or honouring prefers-reduced-motion is a code change,
 * not a restructure. The type also fired the ADHD friction point "Lost focus due
 * to complex form layout" on pages with no form. Motion barriers are "timing"
 * now: the type, the weight and the effort agree.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGINAL_DATA_DIR = process.env.CBROWSER_DATA_DIR;
const DATA_DIR = mkdtempSync(join(ORIGINAL_DATA_DIR ?? tmpdir(), "cbrowser-motion-type-"));
process.env.CBROWSER_DATA_DIR = DATA_DIR;
const { runEmpathyAudit } = await import("../src/analysis/accessibility-empathy.js");

const CSS = `body{margin:0;font:16px sans-serif;color:#000;background:#fff}` +
  `@keyframes slide{from{transform:translateX(0)}to{transform:translateX(-12px)}}` +
  `.slide{display:inline-block;width:280px;height:150px;background:#eee;animation:slide 3s linear infinite}` +
  `.animate-pulse{height:40px;margin:4px;background:#ddd}`;
const doc = (body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>fixture</title><style>${CSS}</style></head><body>${body}</body></html>`;
const RUNNING = doc(`<main><section id="hero" aria-label="Featured"><div class="slide">One</div><div class="slide">Two</div></section><p>Body copy.</p></main>`);
const CLASS_ONLY = doc(`<main>${["p1", "p2", "p3", "p4"].map((id) => `<div class="slider" id="${id}" style="height:40px;margin:4px;background:#ddd"></div>`).join("")}</main>`);

type Barrier = { type: string; wcagCriteria: string[] };
type Result = {
  barriers: Barrier[];
  remediationPriority?: Array<{ wcagCriteria: string[]; effort: string }>;
  frictionPoints?: Array<{ description: string }>;
};

let browser: Browser;
const results: Record<string, Result> = {};
async function audit(html: string): Promise<Result> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.goto = (async () => { await page.setContent(html); return null; }) as Page["goto"];
  try {
    const result = await runEmpathyAudit("about:blank", {
      disabilities: ["cognitive-adhd"], wcagLevel: "AA", maxSteps: 1, maxTime: 15,
      headless: true, scope: "viewport", page,
    });
    return result.results[0] as unknown as Result;
  } finally {
    await context.close();
  }
}
beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  results.running = await audit(RUNNING);
  results.classOnly = await audit(CLASS_ONLY);
}, 120_000);
afterAll(async () => {
  await browser?.close();
  rmSync(DATA_DIR, { recursive: true, force: true });
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.CBROWSER_DATA_DIR;
  else process.env.CBROWSER_DATA_DIR = ORIGINAL_DATA_DIR;
}, 60_000);

describe("a 2.2.2 motion barrier is typed timing (v10 B44/B45)", () => {
  for (const key of ["running", "classOnly"] as const) {
    test(`${key}: every 2.2.2 barrier is type "timing"`, () => {
      const motion = results[key]!.barriers.filter((b) => b.wcagCriteria.includes("2.2.2"));
      expect(motion.length).toBeGreaterThan(0);
      for (const b of motion) expect(b.type).toBe("timing");
    });
    test(`${key}: its remediation effort is "medium", not "hard"`, () => {
      const items = (results[key]!.remediationPriority ?? []).filter((i) => i.wcagCriteria.includes("2.2.2"));
      expect(items.length).toBeGreaterThan(0);
      for (const i of items) expect(i.effort).toBe("medium");
    });
    test(`${key}: no "complex form layout" friction on a page with no form`, () => {
      expect((results[key]!.frictionPoints ?? []).some((f) => /complex form layout/.test(f.description))).toBe(false);
    });
  }
});
