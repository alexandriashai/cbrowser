/**
 * Round 2 of B7 (2026-10-09): the stdio empathy_audit_summarize counted
 * affected elements as barrier RECORDS.
 *
 * B7 made the hosted empathy_audit report `barrierCount` (records) and
 * `affectedElements` (elements, via countAffectedElements) separately. The
 * stdio server's manual flow (empathy_audit_init -> record_barrier ->
 * complete_persona -> summarize) kept `affectedElements: r.barriers.length`,
 * commented "Raw element count", so the same element recorded twice counted
 * as two elements.
 *
 * Driven through the real stdio server over an in-memory MCP transport, the
 * way a client calls it.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const ORIGINAL_DATA_DIR = process.env.CBROWSER_DATA_DIR;
let dataDir: string;
let client: Client;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "cbrowser-summarize-count-"));
  process.env.CBROWSER_DATA_DIR = dataDir;
  const { createMcpServer } = await import("../src/mcp-server.js");
  const server: McpServer = await createMcpServer();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "summarize-count-test", version: "1" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
}, 60_000);

afterAll(async () => {
  await client?.close();
  rmSync(dataDir, { recursive: true, force: true });
  if (ORIGINAL_DATA_DIR === undefined) delete process.env.CBROWSER_DATA_DIR;
  else process.env.CBROWSER_DATA_DIR = ORIGINAL_DATA_DIR;
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;
async function call(name: string, args: Json): Promise<Json> {
  const r = await client.callTool({ name, arguments: args }) as { content: Array<{ text: string }> };
  return JSON.parse(r.content[0].text) as Json;
}

describe("empathy_audit_summarize counts elements, not records (stdio)", () => {
  test("the same element recorded twice is one affected element; records ship separately", async () => {
    const persona = "motor-impairment-tremor";
    const { sessionId } = await call("empathy_audit_init", {
      url: "https://example.test/", goal: "read the page", disabilities: [persona],
    });
    const record = (element: string) => call("empathy_audit_record_barrier", {
      sessionId, persona, barrierType: "touch_target", element,
      description: "Target smaller than 24x24", severity: "major",
    });
    await record("button#a");
    await record("button#a");
    await record("button#b");
    await call("empathy_audit_complete_persona", { sessionId, persona, goalAchieved: true, stepCount: 3 });
    const summary = await call("empathy_audit_summarize", { sessionId });

    const row = summary.personaResults[0];
    expect(row.affectedElements).toBe(2);
    expect(row.barrierCount).toBe(3);
    expect(summary.totalBarriers).toBe(3);
  }, 60_000);
});
