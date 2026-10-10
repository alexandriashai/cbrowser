/**
 * Every error-shaped tool return must carry isError.
 *
 * Static walk over src/mcp-server.ts + src/mcp-tools/**\/*.ts: any
 * `return { content: [...] }` whose JSON payload looks like a failure
 * (an `error` key, or `success: false`) must set `isError` SOMEWHERE in
 * that same return object.
 *
 * Three named exceptions are the tool surface's genuine SUCCESS_NEGATIVE /
 * NOT_AN_ERROR sites (triaged 2026-09-17, P-09): the tool did billable work
 * and is reporting a negative outcome, or the return is a valid non-failure
 * (a confirm prompt). Refunding those would give away paid work.
 *
 * The upgrade prompt (tier-gate.ts) was on this list and came off it on
 * 2026-10-09: the tool never runs, so it is a refusal, and clients read it as
 * a completed result. It cannot refund paid work because it is never charged
 * (gate-before-charge in mcp-server-remote.ts, 2026-07-26) and its handler
 * sits outside the refund wrapper; tests/gate-refusal-iserror.test.ts pins
 * both.
 * Anything NOT on this list must have isError - a new error-shaped return
 * added later fails this test until it is explicitly triaged one way or
 * the other, rather than silently joining the untracked pool.
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

function findUncoveredSites(relPath: string): number[] {
  const abs = join(ROOT, relPath);
  const src = readFileSync(abs, "utf-8");
  const uncovered: number[] = [];
  const re = /return\s*\{\s*content\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const start = m.index;
    const braceStart = src.indexOf("{", start);
    let depth = 0, j = braceStart;
    while (j < src.length) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}") { depth--; if (depth === 0) break; }
      j++;
    }
    const block = src.slice(braceStart, j + 1);
    const looksLikeFailure = /\berror\s*:|success\s*:\s*false|"error"/.test(block);
    if (!looksLikeFailure) continue;
    if (block.includes("isError")) continue;
    const line = src.slice(0, start).split("\n").length;
    uncovered.push(line);
  }
  return uncovered;
}

// Files known to register MCP tools whose handlers can return error-shaped content.
const SCANNED_FILES = [
  "src/mcp-server.ts",
  "src/mcp-tools/base/audit-tools.ts",
  "src/mcp-tools/base/browser-management-tools.ts",
  "src/mcp-tools/base/browser-state-tools.ts",
  "src/mcp-tools/base/capture-tools.ts",
  "src/mcp-tools/base/cognitive-tools.ts",
  "src/mcp-tools/base/gif-tools.ts",
  "src/mcp-tools/base/interaction-tools.ts",
  "src/mcp-tools/base/llms-txt-tools.ts",
  "src/mcp-tools/base/marketing-tools.ts",
  "src/mcp-tools/base/persona-comparison-tools.ts",
  "src/mcp-tools/base/security-tools.ts",
  "src/mcp-tools/base/site-knowledge-tools.ts",
  "src/mcp-tools/base/testing-tools.ts",
  "src/mcp-tools/base/values-tools.ts",
  "src/mcp-tools/persona-creation-tools.ts",
  "src/mcp-tools/persona-lifecycle-tools.ts",
  "src/mcp-tools/tier-gate.ts",
];

describe("every error-shaped tool return carries isError", () => {
  test("the scan itself finds something to check (not vacuous)", () => {
    const total = SCANNED_FILES.reduce((n, f) => {
      const src = readFileSync(join(ROOT, f), "utf-8");
      return n + (src.match(/return\s*\{\s*content\s*:/g) || []).length;
    }, 0);
    expect(total).toBeGreaterThan(50);
  });

  for (const f of SCANNED_FILES) {
    test(`${f}: every error-shaped return not on the named exception list has isError`, () => {
      const uncovered = findUncoveredSites(f);
      // The three genuine exception files carry known, counted exceptions.
      // testing-tools.ts and mcp-server.ts each have exactly 3 (nl_test_file
      // result, nl_test_inline result, repair_test result);
      // persona-lifecycle-tools.ts has 1 (delete confirm). tier-gate.ts has 0
      // since 2026-10-09 (the upgrade prompt is a refusal; see header).
      const expectedExceptionCount: Record<string, number> = {
        "src/mcp-server.ts": 4, // the 3 test-result sites + the JSDoc comment line
        "src/mcp-tools/base/testing-tools.ts": 3,
        "src/mcp-tools/persona-lifecycle-tools.ts": 1,
      };
      const expected = expectedExceptionCount[f] ?? 0;
      expect(
        uncovered.length,
        `${f} has ${uncovered.length} error-shaped return(s) without isError at lines [${uncovered.join(", ")}] — expected exactly ${expected} known exception(s). A NEW uncovered site means an untriaged error-shaped return was added; either give it isError or add it to this test's exception count with a reason.`,
      ).toBe(expected);
    });
  }
});
