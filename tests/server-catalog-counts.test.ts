/**
 * Every count the remote server prints about itself is derived (report item
 * B33, 2026-10-10).
 *
 * They were literals and disagreed with each other and with tools/list: the
 * instructions said "120 tools across 16 categories", docs://tools-overview said
 * 105 in its description and "120 across 11" in its body, persona_creation was
 * "(6 tools)" with nine registered, docs://personas said 21 and listed 6 of the
 * 10 general personas, and llms.txt said 91. tools/list on the enterprise server
 * returned 130: 126 in TOOL_CATEGORIES' 20 categories and 4 in none
 * (persona_lookup, visual_cognitive_story, question_answer, artifact_fetch).
 *
 * Pure: no browser.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-catalog-counts-"));

const { TOOL_CATEGORIES, getToolPricingTier } = await import("../src/mcp-tools/tool-categories.js");
const remote = await import("../src/mcp-server-remote.js");
const personas = await import("../src/personas.js");

const allCategorized = new Set(TOOL_CATEGORIES.flatMap((c) => c.tools));
const ORPHANS = ["persona_lookup", "visual_cognitive_story", "question_answer", "artifact_fetch"];

describe("the instructions count what TOOL_CATEGORIES holds", () => {
  test("headline numbers equal the category count and the categorized tool total", () => {
    const text: string = (remote as { buildServerInstructions?: () => string }).buildServerInstructions?.() ?? "";
    const m = text.match(/with (\d+) tools across (\d+) categories/);
    expect(m, "instructions headline").toBeTruthy();
    expect(Number(m![1])).toBe(allCategorized.size);
    expect(Number(m![2])).toBe(TOOL_CATEGORIES.length);
  });

  test("every per-category number matches, and every specialist category is listed", () => {
    const text: string = (remote as { buildServerInstructions?: () => string }).buildServerInstructions?.() ?? "";
    const listed = new Map<string, number>();
    for (const m of text.matchAll(/^• ([a-z_]+) \((\d+) tools?\)/gm)) listed.set(m[1], Number(m[2]));
    const specialist = TOOL_CATEGORIES.filter((c) => c.tier > 1);
    expect(listed.size).toBe(specialist.length);
    for (const cat of specialist) expect(listed.get(cat.name), cat.name).toBe(cat.tools.length);
    // The one the report named.
    expect(listed.get("persona_creation")).toBe(TOOL_CATEGORIES.find((c) => c.name === "persona_creation")!.tools.length);
  });

  test("docs://tools-overview carries the same numbers", () => {
    const text: string = (remote as { buildToolsOverviewText?: () => string }).buildToolsOverviewText?.() ?? "";
    const m = text.match(/provides (\d+) MCP tools across (\d+) categories/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBe(allCategorized.size);
    expect(Number(m![2])).toBe(TOOL_CATEGORIES.length);
    for (const cat of TOOL_CATEGORIES) expect(text).toContain(`${cat.name} (${cat.tools.length})`);
  });

  test("docs://personas is listed from the persona maps", () => {
    const text: string = (remote as { buildPersonasOverviewText?: () => string }).buildPersonasOverviewText?.() ?? "";
    const maps = [personas.BUILTIN_PERSONAS, personas.ACCESSIBILITY_PERSONAS, personas.EMOTIONAL_PERSONAS, personas.AGENT_PERSONAS];
    const total = maps.reduce((n, m) => n + Object.keys(m).length, 0);
    expect(text).toContain(`includes ${total} built-in personas`);
    for (const m of maps) for (const name of Object.keys(m)) expect(text, name).toContain(name);
    expect(text).toContain(`Cognitive (${Object.keys(personas.BUILTIN_PERSONAS).length})`);
  });

  test("no hand-typed count survives in the server source", () => {
    // Comments may quote the old numbers; code and string literals may not.
    const src = readFileSync(join(import.meta.dir, "..", "src", "mcp-server-remote.ts"), "utf8");
    const code = src.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l));
    const typed = /\b\d{2,}\s+(?:[A-Z]\w*\s+)*(?:MCP\s+)?tools\b|\(\d+\s+tools?\)|Tools \(\d+\)|\b\d+\s+(?:built-in\s+)?personas\b|\b\d+\s+categories\b/;
    const hits = code.filter((l) => typed.test(l));
    expect(hits, hits.join("\n")).toEqual([]);
  });
});

describe("every registered tool belongs to a category", () => {
  // The public package's enterprise stubs register five marketing tools under
  // names the enterprise server does not use (it serves the TOOL_CATEGORIES
  // names). They are pinned here, exactly, so a NEW uncategorized tool still
  // fails while the alias question stays visible rather than hidden.
  const STUB_ALIASES = [
    "marketing_audience_discover_status", "marketing_campaign_influence_matrix",
    "marketing_campaign_levers", "marketing_competitive_compare", "marketing_funnel_analysis",
  ];

  test("registerAllPublicTools registers nothing outside TOOL_CATEGORIES but the pinned stub aliases", async () => {
    const { registerAllPublicTools } = await import("../src/mcp-tools/index.js");
    const names: string[] = [];
    const server = {
      registerTool: (name: string) => { names.push(name); return {}; },
      tool: (name: string) => { names.push(name); return {}; },
      registerResource: () => {}, resource: () => {}, prompt: () => {}, registerPrompt: () => {},
    };
    registerAllPublicTools(server as never, {
      getBrowser: async () => { throw new Error("no browser in this test"); },
    } as never, null);
    expect(names.length).toBeGreaterThan(100);
    const uncategorized = [...new Set(names)].filter((n) => !allCategorized.has(n)).sort();
    expect(uncategorized).toEqual(STUB_ALIASES);
    for (const o of ORPHANS) expect(names, `${o} is registered`).toContain(o);
  });

  test("the four former orphans are categorized", () => {
    for (const o of ORPHANS) expect(allCategorized.has(o), o).toBe(true);
  });

  test("categorizing them changed no price", () => {
    // Uncategorized defaulted to pro; artifact_fetch is free by name.
    expect(getToolPricingTier("persona_lookup")).toBe("pro");
    expect(getToolPricingTier("visual_cognitive_story")).toBe("pro");
    expect(getToolPricingTier("question_answer")).toBe("pro");
    expect(getToolPricingTier("artifact_fetch")).toBe("free");
  });
});
