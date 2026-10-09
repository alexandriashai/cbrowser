/**
 * B7 (2026-10-09 report): empathy_audit's element counts did not reconcile.
 * Viewport scope; the full_page half is empathy-element-counts-full-page.test.ts.
 *
 * - resultsSummary.affectedElements was `barriers.length`: barrier records,
 *   not elements.
 * - topBarriers[].affectedElementCount counted distinct element STRINGS, so
 *   three id-less buttons ("button") counted 1, a group barrier ("3 element
 *   groups") counted 1, and groups cut from topBarriers vanished from the sum.
 * - barrierRectCoverage subtracted drawn boxes from elements and gave one
 *   hardcoded reason, "typically below the fold, hidden, or an unresolvable
 *   selector" -- wrong by construction in a viewport audit, where located
 *   barriers below the fold were already dropped.
 * - The close-spacing scan read the first 30 targets in DOM order with no scope
 *   test and no rect, so a viewport audit counted pairs far below the fold.
 *
 * Driven through the REAL empathy_audit handler on a fake MCP server, against a
 * fixture served over http, the way a tools/call reaches it.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll } from "bun:test";
import {
  runEmpathyHandlerOnce, sumTop, touchGroup, spacingGroup, coverage, ALLOWED_UNDRAWN_REASONS, type Json,
} from "./fixtures/empathy-element-counts.js";

let json: Json;
let text: string;
beforeAll(async () => { ({ json, text } = await runEmpathyHandlerOnce("viewport")); }, 120_000);

describe("element counts reconcile (viewport)", () => {
  test("the audit ran without error", () => {
    expect(json.error).toBeUndefined();
    expect(json.errors).toEqual([]);
  });

  test("resultsSummary.affectedElements == sum of topBarriers counts (+ omitted)", () => {
    expect(json.resultsSummary[0].affectedElements).toBe(sumTop(json));
  });

  test("barrier records are reported separately from elements", () => {
    const s = json.resultsSummary[0];
    expect(typeof s.barrierCount).toBe("number");
    expect(s.barrierCount).not.toBe(s.affectedElements);
  });

  test("three id-less buttons and two links are five touch-target elements", () => {
    expect(touchGroup(json)?.affectedElementCount).toBe(5);
  });

  test("the close-spacing group counts its members, not 1", () => {
    // a-b, b-c, Alpha-Beta: three pairs, five distinct elements.
    expect(spacingGroup(json)?.affectedElementCount).toBe(5);
  });

  test("the close-spacing scan is viewport-filtered: the pair 3000px down is not counted", () => {
    expect(spacingGroup(json)?.description).toMatch(/^3 groups/);
  });
});

describe("rect coverage lists every undrawn barrier with a reason (viewport)", () => {
  test("undrawn equals the length of the undrawn list; drawn + undrawn = barriers", () => {
    const c = coverage(json);
    expect(c.undrawn ?? 0).toBe((c.undrawnBarriers ?? []).length);
    expect(c.drawn + (c.undrawn ?? 0)).toBe(json.resultsSummary[0].barrierCount);
  });

  test("every reason is one of pageLevel | zeroArea | outsideCapture, each explained", () => {
    const c = coverage(json);
    expect((c.undrawnBarriers ?? []).length).toBeGreaterThan(0);
    for (const u of c.undrawnBarriers) {
      expect(ALLOWED_UNDRAWN_REASONS).toContain(u.reason);
      expect(typeof c.undrawnReasons[u.reason]).toBe("string");
    }
  });

  test("the spacing aggregate is undrawn as pageLevel", () => {
    const u = (coverage(json).undrawnBarriers as Json[]).find((x) => /element groups/.test(x.element));
    expect(u?.reason).toBe("pageLevel");
  });

  test("a viewport audit never says \"below the fold\"", () => {
    expect(text).not.toMatch(/below the fold/i);
  });

  test("coverage counts elements the same way the summary does", () => {
    expect(coverage(json).affectedElements).toBe(json.resultsSummary[0].affectedElements);
  });

  test("the display:none unlabelled input is kept and undrawn as zeroArea, as in full_page", () => {
    // Round 2: the viewport filter dropped its {0,0,0,0} rect as off-screen,
    // so the element full_page scored vanished here.
    const u = ((coverage(json).undrawnBarriers ?? []) as Json[]).find((x) => /input/.test(x.element));
    expect(u?.reason).toBe("zeroArea");
  });

  test("no note calls a hidden element outside the viewport", () => {
    // Nothing in this fixture is a located, in-page barrier below the fold
    // (the far pair is scoped out in-page), so nothing is dropped.
    expect(json.outOfViewportBarriersDropped).toBeUndefined();
    expect(text).not.toMatch(/outside the viewport/);
  });
});

describe("above-level findings are advisories in the response", () => {
  test("the AAA-only 40x40 is an advisory, minor for the persona, and not in topBarriers", () => {
    const forty = ((json.advisories ?? []) as Json[]).find((a) => String(a.description).includes("(40x40px)"));
    expect(forty).toBeDefined();
    expect(forty!.aboveAuditLevel).toBe(true);
    expect(forty!.severityForPersona).toBe("minor");
    expect((json.topBarriers as Json[]).some((b) => String(b.description).includes("40x40"))).toBe(false);
  });

  test("no topBarriers entry made only of 2.5.5 findings is critical for the persona", () => {
    for (const b of json.topBarriers as Json[]) {
      if ((b.wcagCriteria as string[]).every((c) => c === "2.5.5")) expect(b.severityForPersona).not.toBe("critical");
    }
  });
});
