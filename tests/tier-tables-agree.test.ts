/**
 * The MCP gate and the CMS billing layer must agree about what is free.
 *
 * They did not. Measured 2026-08-13, the CMS permitted 18 tools that this gate
 * refused, so a free user was told they had the tool and then got "Upgrade
 * Required" from the server. Two of those were agent_ready_audit and hunt_bugs
 * — the tools the public homepage demo runs, which is how it surfaced: the demo
 * was dead and the error blamed the key's tier.
 *
 * Root cause was structural, not a typo: pricing was read off TOOL_CATEGORIES,
 * which groups tools by FUNCTION. A tool could not be priced free unless every
 * functional sibling was, so `agent_ready_audit` inherited "pro" from the
 * category it shares with genuinely-Pro analysis tools.
 *
 * WHERE THE CROSS-REPO CHECK LIVES, and why not here: this file used to read
 * the CMS's list from an absolute path (/home/wyld-web/static/cbrowser-web/...).
 * That path exists only on the deployment box, so on a CI runner the read threw
 * and took down both the Tests workflow and the RELEASE GATE — which is why
 * npm sat at 19.1.3 while this very fix was unpublished. A public package's
 * tests must not reach into a private repo's filesystem.
 *
 * So the comparison lives on the CMS side, which legitimately knows about both.
 * This file asserts only what the package can prove about itself.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { FREE_TIER_TOOLS, getToolPricingTier, TOOL_CATEGORIES } from "../src/mcp-tools/tool-categories.js";

const allTools = new Set(TOOL_CATEGORIES.flatMap((c) => c.tools));

describe("free-tier tools resolve as free", () => {
  test("the 18 that were refused now resolve free", () => {
    // The exact set that disagreed. Named individually so a regression says
    // which capability a free user lost.
    for (const t of [
      "agent_ready_audit", "hunt_bugs", "cognitive_effort", "cognitive_load_estimate",
      "visual_baseline", "visual_regression", "cross_browser_test", "cross_browser_diff",
      "responsive_test", "ab_comparison", "perf_baseline", "perf_regression",
      "list_baselines", "heal_stats", "list_cognitive_personas", "llms_txt_generate",
      "page_understand", "persona_create_from_description",
    ]) {
      expect(getToolPricingTier(t), `${t} must be free`).toBe("free");
    }
  });

  test("every tool in FREE_TIER_TOOLS resolves free", () => {
    for (const t of FREE_TIER_TOOLS) expect(getToolPricingTier(t), t).toBe("free");
  });

  test("every tool a view calls to load its images is free", () => {
    // A view loads its picture through callServerTool (the sandbox cannot
    // fetch cbrowser.ai). artifact_fetch was unlisted, so it defaulted to Pro
    // and the FREE screenshot tool's view could never show its screenshot,
    // while a paid account was billed the CMS's 1-credit catalog-miss fallback
    // per image. Any fetcher a view names must be free. (2026-10-10)
    const src = ["ui-resources.ts", "widget-kit.ts"].map((f) =>
      readFileSync(new URL(`../src/mcp-tools/${f}`, import.meta.url), "utf8")).join("\n");
    const named = new Set<string>();
    for (const m of src.matchAll(/fetchTool:\s*"([a-z_]+)"/g)) named.add(m[1]);
    for (const m of src.matchAll(/fetchTool\s*\|\|\s*"([a-z_]+)"/g)) named.add(m[1]);
    expect(named.size, "expected the views to name at least one fetcher").toBeGreaterThan(0);
    for (const t of named) expect(getToolPricingTier(t), `${t} is called by a view`).toBe("free");
  });

  test("name beats category — a free tool in a pro category is still free", () => {
    // The structural bug in one assertion.
    const proCat = TOOL_CATEGORIES.find((c) => c.pricingTier === "pro" && c.tools.some((t) => FREE_TIER_TOOLS.has(t)));
    expect(proCat, "expected at least one free tool inside a pro category").toBeTruthy();
    const tool = proCat!.tools.find((t) => FREE_TIER_TOOLS.has(t))!;
    expect(getToolPricingTier(tool)).toBe("free");
  });
});

describe("genuinely paid tools stay paid", () => {
  test("Pro-only cognitive tools are not free", () => {
    // The guard on the fix: widening free access must not become universal.
    for (const t of ["empathy_audit", "attention_analysis", "cognitive_journey_init", "visual_cognitive_story"]) {
      expect(FREE_TIER_TOOLS.has(t), `${t} must not be free`).toBe(false);
      expect(getToolPricingTier(t)).not.toBe("free");
    }
  });

  test("enterprise marketing tools are untouched", () => {
    for (const t of ["marketing_influence_matrix", "marketing_lever_analysis"]) {
      if (allTools.has(t)) expect(getToolPricingTier(t)).toBe("enterprise");
    }
  });

  test("an unknown tool still defaults to pro", () => {
    expect(getToolPricingTier("a_tool_that_does_not_exist")).toBe("pro");
  });
});

describe("the suite does not depend on this machine", () => {
  test("no test file reads an absolute path outside the repo", async () => {
    // The defect this whole file learned the hard way: a test that reads
    // /home/wyld-web/... passes on the deployment box and throws on a CI
    // runner. It broke the Tests workflow AND the release gate, so npm stayed
    // at 19.1.3 while the fix it was gating sat unpublished.
    //
    // Checked mechanically rather than by review, because "don't hardcode a
    // path" is exactly the kind of rule that holds until someone is in a hurry.
    const dir = new URL("./", import.meta.url).pathname;
    const proc = Bun.spawnSync(["bash", "-c",
      `grep -rnE '(Bun\\.file|readFileSync|readFile)\\([^)]*"/(home|var|etc|root|Users)/' ${dir} || true`]);
    const hits = new TextDecoder().decode(proc.stdout).trim();
    expect(hits, `tests must not read machine-specific paths:\n${hits}`).toBe("");
  });

  test("the grep would actually catch one — verified against a known pattern", async () => {
    // Guards the guard: if the pattern stops matching, the test above passes
    // forever while proving nothing.
    //
    // The sample is ASSEMBLED at runtime rather than written as a literal,
    // because a literal bad path in this file would be found by the scan above
    // and fail it. Excluding this file from the scan would have been the easy
    // fix and the wrong one — it would blind the guard to a real bad path here.
    const sample = 'const x = Bun.' + 'file("' + "/home" + '/someone/thing.ts");';
    const proc = Bun.spawnSync(["bash", "-c",
      `printf '%s' ${JSON.stringify(sample)} | grep -cE '(Bun\\.file|readFileSync)\\([^)]*"/(home|var|etc|root|Users)/'`]);
    expect(new TextDecoder().decode(proc.stdout).trim()).toBe("1");
  });
});
