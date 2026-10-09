/**
 * B6 (2026-10-09 report): the 51x28 "Change language" button was missed, and an
 * AAA-only miss became the largest deduction in an AA audit.
 *
 * Three defects, each pinned below:
 *
 * 1. The filter exempted any target whose larger side was >= 44 and smaller
 *    side >= 24 -- one axis "rescuing" the other -- so 51x28 passed while 40x40
 *    failed, though both miss 2.5.5 (44x44). Checked per axis now: 2.5.8 (AA)
 *    fails if w < 24 || h < 24; 2.5.5 (AAA) fails if w < 44 || h < 44.
 *
 * 2. Policy decided by Alexa: a finding above the audited WCAG level is
 *    ADVISORY. `aboveAuditLevel`, listed in `advisories`, no score deduction,
 *    never escalated by persona weight, never "critical". Before, the 40x40 was
 *    capped at minor and then moved up two steps by weightedSeverity at the
 *    tremor persona's 3.0 weight, which knew nothing of the audit level.
 *
 * 3. The close-spacing barrier cited 2.5.5 (Target SIZE), so the spacing
 *    heuristic was charged in the touch_target bucket, graded major and never
 *    level-adjusted. It now relates to 2.5.8 (advisory), is minor, and has its
 *    own weight bucket, target_spacing.
 *
 * Plus: AA failures sort before the 10-target cap, and selectors are unique
 * (two id-less buttons were both "button").
 *
 * Fixtures run through the SHIPPED runEmpathyAudit, the call the empathy_audit
 * MCP handler makes.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGINAL_DATA_DIR = process.env.CBROWSER_DATA_DIR;
const DATA_DIR = mkdtempSync(join(ORIGINAL_DATA_DIR ?? tmpdir(), "cbrowser-touch-level-"));
process.env.CBROWSER_DATA_DIR = DATA_DIR;
const { runEmpathyAudit } = await import("../src/analysis/accessibility-empathy.js");
const { weightedSeverity, barrierWeightFor } = await import("../src/visual/perceptual-transport.js");

type Rect = { x: number; y: number; width: number; height: number };
type Barrier = {
  type: string; element: string; description: string; severity: string;
  wcagCriteria: string[]; wcagAdvisoryCriteria?: string[]; weightKey?: string;
  aboveAuditLevel?: boolean; rect?: Rect;
};
type PersonaResult = {
  barriers: Barrier[];
  advisories?: Barrier[];
  scoreContext?: { deductionsByType?: Record<string, number> };
};

const doc = (body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>fixture</title>` +
  `<style>body{margin:0;font:16px sans-serif;color:#000;background:#fff}` +
  `button{box-sizing:border-box;padding:0;border:0;margin:0;background:#ddd;color:#000;font:12px sans-serif}` +
  `.row{display:flex;gap:16px;padding:40px;align-items:flex-start}</style></head>` +
  `<body><main>${body}</main></body></html>`;
const btn = (w: number, h: number, attrs = "", text = "B") =>
  `<button ${attrs} style="width:${w}px;height:${h}px">${text}</button>`;

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); }, 60_000);
afterAll(async () => {
  await browser?.close();
  rmSync(DATA_DIR, { recursive: true, force: true });
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.CBROWSER_DATA_DIR;
  else process.env.CBROWSER_DATA_DIR = ORIGINAL_DATA_DIR;
}, 60_000);

/**
 * One tremor audit. runEmpathyAudit navigates itself, so the fixture is
 * installed with setContent at that moment. `resolve` maps each touch-target
 * selector to the data-t of the element it resolves to, while the page is open.
 */
async function audit(html: string, wcagLevel: "A" | "AA" | "AAA" = "AA"):
  Promise<{ r: PersonaResult; resolved: Record<string, string | null> }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.goto = (async () => { await page.setContent(html); return null; }) as Page["goto"];
  try {
    const result = await runEmpathyAudit("about:blank", {
      disabilities: ["motor-impairment-tremor"], wcagLevel, maxSteps: 1, maxTime: 15,
      headless: true, scope: "viewport", page,
    });
    const r = result.results[0] as unknown as PersonaResult;
    const sels = [...r.barriers, ...(r.advisories ?? [])]
      .filter((b) => b.type === "touch_target").map((b) => b.element);
    const resolved: Record<string, string | null> = {};
    for (const s of sels) {
      resolved[s] = await page.evaluate((sel) => {
        try {
          const all = document.querySelectorAll(sel);
          return all.length === 1 ? (all[0] as HTMLElement).dataset.t ?? "(no data-t)" : `(${all.length} matches)`;
        } catch { return "(invalid)"; }
      }, s);
    }
    return { r, resolved };
  } finally {
    await context.close();
  }
}

const touch = (list: Barrier[] | undefined) => (list ?? []).filter((b) => b.type === "touch_target");
const sized = (list: Barrier[] | undefined, w: number, h: number) =>
  touch(list).filter((b) => b.description.includes(`(${w}x${h}px)`));

const TWO_AAA_ONLY = doc(`<div class="row">
  ${btn(51, 28, 'aria-label="Change language" data-t="lang"', "EN")}
  ${btn(40, 40, 'data-t="forty"', "X")}
</div>`);

describe("per-axis target size: 51x28 and 40x40 are treated alike", () => {
  test("AA audit: both are flagged, both as advisories, neither scored", async () => {
    const { r } = await audit(TWO_AAA_ONLY, "AA");
    const flagged = [...touch(r.barriers), ...touch(r.advisories)];
    expect(flagged.some((b) => b.description.includes("(51x28px)"))).toBe(true);
    expect(flagged.some((b) => b.description.includes("(40x40px)"))).toBe(true);
    expect(touch(r.barriers)).toEqual([]);
    for (const a of touch(r.advisories)) {
      expect(a.aboveAuditLevel).toBe(true);
      expect(a.wcagCriteria).toEqual(["2.5.5"]);
      expect(a.severity).toBe("minor");
    }
  }, 60_000);

  test("AA audit: an AAA-only target takes no deduction", async () => {
    const { r } = await audit(TWO_AAA_ONLY, "AA");
    expect(r.scoreContext?.deductionsByType?.touch_target).toBeUndefined();
  }, 60_000);

  test("AAA audit: both are scored 2.5.5 findings", async () => {
    const { r } = await audit(TWO_AAA_ONLY, "AAA");
    expect(sized(r.barriers, 51, 28).length).toBe(1);
    expect(sized(r.barriers, 40, 40).length).toBe(1);
    expect(touch(r.advisories)).toEqual([]);
    expect(r.scoreContext?.deductionsByType?.touch_target).toBeLessThan(0);
  }, 60_000);
});

describe("AA failures survive the 10-target cap", () => {
  // Eleven AAA-only targets first in document order, then one 16x16.
  const ELEVEN_THEN_TINY = doc(`<div class="row" style="flex-wrap:wrap">
    ${Array.from({ length: 11 }, (_, i) => btn(40, 40, `data-t="f${i}"`)).join("")}
    ${btn(16, 16, 'data-t="tiny"')}
  </div>`);

  test("AA audit: the 16x16 is a scored 2.5.8 barrier", async () => {
    const { r } = await audit(ELEVEN_THEN_TINY, "AA");
    const tiny = sized(r.barriers, 16, 16);
    expect(tiny.length).toBe(1);
    expect(tiny[0].wcagCriteria).toContain("2.5.8");
  }, 60_000);

  test("A audit: a 2.5.8 (AA) failure is itself above level, so advisory", async () => {
    const { r } = await audit(ELEVEN_THEN_TINY, "A");
    expect(sized(r.barriers, 16, 16)).toEqual([]);
    const tiny = sized(r.advisories, 16, 16);
    expect(tiny.length).toBe(1);
    expect(tiny[0].aboveAuditLevel).toBe(true);
    expect(tiny[0].severity).not.toBe("critical");
  }, 60_000);
});

describe("touch-target selectors are unique", () => {
  test("two id-less buttons get different selectors, each resolving to its own element", async () => {
    const { r, resolved } = await audit(doc(`<div class="row">
      <div>${btn(16, 16, 'data-t="one"')}</div>
      <div>${btn(16, 16, 'data-t="two"')}</div>
      ${btn(16, 16, 'aria-label="Close dialog" data-t="three"')}
    </div>`), "AA");
    const els = touch(r.barriers).map((b) => b.element);
    expect(els.length).toBe(3);
    expect(new Set(els).size).toBe(3);
    expect(Object.values(resolved).sort()).toEqual(["one", "three", "two"]);
  }, 60_000);
});

describe("the close-spacing barrier is not 2.5.5", () => {
  // Two 50x50 targets 4px apart: no size failure at all, only closeness.
  const CLOSE_BIG = doc(`<div class="row" style="gap:4px">
    ${btn(50, 50, 'data-t="l"', "Prev")}${btn(50, 50, 'data-t="r"', "Next")}
  </div>`);

  test("it cites no 2.5.5, relates to 2.5.8 without violating it, and is minor", async () => {
    const { r } = await audit(CLOSE_BIG, "AA");
    const spacing = r.barriers.filter((b) => /very close together/.test(b.description));
    expect(spacing.length).toBe(1);
    expect(spacing[0].wcagCriteria).not.toContain("2.5.5");
    expect(spacing[0].wcagCriteria).toEqual(["2.5.8"]);
    expect(spacing[0].wcagAdvisoryCriteria).toEqual(["2.5.8"]);
    expect(spacing[0].severity).toBe("minor");
  }, 60_000);

  test("it is charged in its own bucket, not touch_target", async () => {
    const { r } = await audit(CLOSE_BIG, "AA");
    const d = r.scoreContext?.deductionsByType ?? {};
    expect(d.touch_target).toBeUndefined();
    expect(d.target_spacing).toBeLessThan(0);
  }, 60_000);

  test("target_spacing borrows target-size susceptibility rather than defaulting", () => {
    const w = barrierWeightFor("motor-impairment-tremor", "motor_precision", ["2.5.8"], "target_spacing");
    expect(w.key).toBe("target_spacing");
    expect(w.weight).toBe(3.0);
    expect(w.defaulted).toBe(false);
  });
});

describe("persona weighting never escalates an above-level finding", () => {
  test("minor at weight 3.0 stays minor when above the audit level", () => {
    expect(weightedSeverity("minor", 3.0).severity).toBe("critical"); // in-level: unchanged behaviour
    expect(weightedSeverity("minor", 3.0, { aboveAuditLevel: true }).severity).toBe("minor");
    expect(weightedSeverity("minor", 3.0, { aboveAuditLevel: true }).shifted).toBe(0);
  });
});
