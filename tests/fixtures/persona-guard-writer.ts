/**
 * Run by tests/real-personas-dir.test.ts right after persona-guard-primer.ts,
 * in the same `bun test` process: personas.ts is already imported, with no
 * CBROWSER_DATA_DIR. This file then does what every persona-writing test
 * does: set its own temp CBROWSER_DATA_DIR, write personas, remove the dir.
 * Each write must land in that dir, through both write paths (a direct
 * saveCustomPersona and the persona_create_submit_traits tool).
 *
 * Not named *.test.ts on purpose; see persona-guard-primer.ts.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { test, expect, afterAll } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "cb-persona-guard-"));
process.env.CBROWSER_DATA_DIR = dir;
// No CMS on any path: an unscoped call without a key never contacts one, and
// if that changed this would fail rather than reach a real CMS.
process.env.CMS_URL = "http://127.0.0.1:9";
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => { throw new Error("persona-guard-writer: no network"); }) as unknown as typeof fetch;

const { createCognitivePersona, saveCustomPersona } = await import("../../src/personas.js");
const { registerPersonaCreationTools } = await import("../../src/mcp-tools/persona-creation-tools.js");
const { ALL_TRAITS } = await import("../../src/values/persona-completeness.js");

afterAll(() => {
  globalThis.fetch = realFetch;
  rmSync(dir, { recursive: true, force: true });
});

test("a persona saved after personas.ts was imported lands in this file's own CBROWSER_DATA_DIR", () => {
  const path = saveCustomPersona(createCognitivePersona("zz-guard-direct", "persona guard, direct save", { patience: 0.3 }));
  expect(path.startsWith(dir)).toBe(true);
  expect(existsSync(path)).toBe(true);
});

test("so does one created through persona_create_submit_traits", async () => {
  type Handler = (a: Record<string, unknown>) => Promise<{ isError?: boolean }>;
  const tools: Record<string, Handler> = {};
  registerPersonaCreationTools({
    registerTool: (name: string, _c: unknown, h: Handler) => { tools[name] = h; },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  } as never);
  const r = await tools.persona_create_submit_traits({
    persona_name: "zz-guard-tool",
    description: "persona guard, tool save",
    traits: { patience: 0.3 },
    unsupportedTraits: ALL_TRAITS.filter((t: string) => t !== "patience"),
  });
  expect(r.isError).toBeFalsy();
  expect(existsSync(join(dir, "personas", "zz-guard-tool.json"))).toBe(true);
});
