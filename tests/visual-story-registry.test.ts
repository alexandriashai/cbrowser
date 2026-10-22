/**
 * visual_cognitive_story leaves the persona registry as it found it.
 *
 * Its effort section took `personaObj.cognitiveTraits` straight from
 * getAnyPersona -- the registry's own object -- and handed it to
 * bridgeCapacityTraits, which writes readingCapacity, motorCapacity and
 * sustainedAttention into whatever it is given. After one story run the
 * built-in persona carried three derived capacities it never declared, for the
 * rest of the process, and cognitive_distance read them as stored traits
 * (first-timer to power-user moved 0.1512 -> 0.1550). Every other caller of
 * the bridge already copied first.
 *
 * Runs the real handler, because the defect is in the handler's wiring, not in
 * the bridge.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveFixtures } from "./fixtures/serve-fixtures.js";

process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-story-registry-data-"));
process.env.CBROWSER_ARTIFACT_DIR = mkdtempSync(join(tmpdir(), "cb-story-registry-art-"));
delete process.env.ANTHROPIC_API_KEY;

const { registerAuditTools } = await import("../src/mcp-tools/base/audit-tools.js");
const { getAnyPersona } = await import("../src/personas.js");

type Block = { type: string; text?: string };
type Handler = (args: Record<string, unknown>) => Promise<{ content: Block[]; isError?: boolean }>;

const handlers: Record<string, Handler> = {};
registerAuditTools({
  registerTool: (name: string, _cfg: unknown, handler: Handler) => { handlers[name] = handler; },
  tool: () => {}, registerResource: () => {}, resource: () => {},
} as never);

let fixtures: Awaited<ReturnType<typeof serveFixtures>>;

beforeAll(async () => { fixtures = await serveFixtures(); });

afterAll(async () => {
  await fixtures.close();
  for (const dir of [process.env.CBROWSER_DATA_DIR!, process.env.CBROWSER_ARTIFACT_DIR!]) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe("visual_cognitive_story", () => {
  test("does not write the bridged capacities into the registry persona", async () => {
    const persona = "first-timer";
    const traitsOf = () => (getAnyPersona(persona) as unknown as { cognitiveTraits: Record<string, number> }).cognitiveTraits;
    const before = JSON.stringify(traitsOf());
    expect(traitsOf().readingCapacity).toBeUndefined();

    const result = await handlers.visual_cognitive_story({
      url: `${fixtures.base}noisy-page.html`, persona, useValues: false, aiLayer: false,
    });
    expect(result.isError).toBeUndefined();

    // The registry record is byte-identical...
    expect(JSON.stringify(traitsOf())).toBe(before);
    for (const k of ["readingCapacity", "motorCapacity", "sustainedAttention"]) {
      expect(traitsOf()[k]).toBeUndefined();
    }

    // ...and the story still bridged its own copy: the effort section ran.
    const data = JSON.parse(result.content[0].text!);
    expect(typeof data.effort?.totalCTC).toBe("number");
  }, 180_000);
});
