/**
 * The persona roster carries no binary float residue, on any server (B15).
 *
 * The residue boundary lives in the security layer, and the hosted servers
 * (pro :3000, enterprise :3100) do not pass through it -- so list_cognitive_
 * personas served "openness": 0.30000000000000004 and "conservation":
 * 0.39999999999999997 there. The higher-order values are now rounded to 3dp at
 * the source, as persona_values_lookup already publishes them. This drives the
 * real handler WITHOUT the security layer, i.e. the hosted path.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-b15-"));
const { registerCognitiveTools } = await import("../src/mcp-tools/base/cognitive-tools.js");

const RESIDUE = /\d\.\d*(?:0{6,}|9{6,})\d/;

describe("B15: list_cognitive_personas without the security layer", () => {
  test("no number in the roster carries float residue", async () => {
    let handler: ((a: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }>) | undefined;
    registerCognitiveTools({
      registerTool: (name: string, _c: unknown, h: typeof handler) => { if (name === "list_cognitive_personas") handler = h; },
      tool: () => {}, registerResource: () => {}, resource: () => {},
    } as never, { getBrowser: async () => { throw new Error("no browser"); } } as never);
    const r = await handler!({});
    const text = r.content.find((c) => c.type === "text")!.text!;
    const roster = JSON.parse(text);
    expect((roster.personas ?? []).length).toBeGreaterThan(5);
    expect(text).toContain("higherOrder");
    const hit = text.match(RESIDUE);
    expect(hit?.[0]).toBeUndefined();
  });
});
