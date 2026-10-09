/**
 * B7, full_page scope. See empathy-element-counts.test.ts for the defect.
 *
 * Its own file because a second empathy_audit handler call in one Bun process
 * stalls in CBrowser.close() (pre-existing on main, unrelated to B7); the split
 * runner gives each browser test file its own process.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll } from "bun:test";
import {
  runEmpathyHandlerOnce, sumTop, spacingGroup, coverage, ALLOWED_UNDRAWN_REASONS, type Json,
} from "./fixtures/empathy-element-counts.js";

let json: Json;
beforeAll(async () => { ({ json } = await runEmpathyHandlerOnce("full_page")); }, 120_000);

describe("element counts reconcile (full page)", () => {
  test("resultsSummary.affectedElements == sum of topBarriers counts (+ omitted)", () => {
    expect(json.resultsSummary[0].affectedElements).toBe(sumTop(json));
  });

  test("the close-spacing scan includes the far pair when the scope is the whole page", () => {
    expect(spacingGroup(json)?.description).toMatch(/^4 groups/);
    expect(spacingGroup(json)?.affectedElementCount).toBe(7);
  });
});

describe("rect coverage (full page)", () => {
  test("undrawn equals the length of the undrawn list; every reason is allowed and explained", () => {
    const c = coverage(json);
    expect(c.undrawn ?? 0).toBe((c.undrawnBarriers ?? []).length);
    expect(c.drawn + (c.undrawn ?? 0)).toBe(json.resultsSummary[0].barrierCount);
    for (const u of c.undrawnBarriers ?? []) {
      expect(ALLOWED_UNDRAWN_REASONS).toContain(u.reason);
      expect(typeof c.undrawnReasons[u.reason]).toBe("string");
    }
  });

  test("the display:none unlabelled input is undrawn as zeroArea", () => {
    const u = (coverage(json).undrawnBarriers as Json[]).find((x) => /input/.test(x.element));
    expect(u?.reason).toBe("zeroArea");
  });
});
