/**
 * A red refusal tells an MCP caller the spelling it can use (2026-10-09).
 *
 * The shared refusal text says "requires --force", the CLI flag. An MCP client
 * cannot pass a flag; its parameter is `force: true`. Alexa read "--force", found
 * no such flag, and concluded MCP clients could not run evaluate_script at all.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { registerBrowserStateTools } from "../src/mcp-tools/base/browser-state-tools.js";

describe("MCP red refusals name force: true", () => {
  test("evaluate_script refusal keeps its prefix and names the MCP parameter", async () => {
    let handler: ((a: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>) | undefined;
    registerBrowserStateTools({
      registerTool: (name: string, _c: unknown, h: typeof handler) => { if (name === "evaluate_script") handler = h; },
      tool: () => {}, registerResource: () => {}, resource: () => {},
    } as never, { getBrowser: async () => { throw new Error("must not launch"); } } as never);
    const r = await handler!({ script: "1" });
    expect(r.isError).toBe(true);
    const body = JSON.parse(r.content[0].text);
    expect(body.message).toMatch(/^Red zone action requires --force: evaluate_script/);
    expect(body.message).toContain("force: true");
    expect(body.howToRun).toContain("force: true");
  });

  test("click and smart_click attach the same hint to a red refusal", () => {
    const src = readFileSync(new URL("../src/mcp-tools/base/interaction-tools.ts", import.meta.url), "utf8");
    expect((src.match(/howToRun/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
