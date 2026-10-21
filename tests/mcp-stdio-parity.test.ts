/**
 * The stdio server (`npx cbrowser mcp-server`) serves the same tool set as the
 * hosted server, plus the stdio-only session bridges.
 *
 * Measured 2026-10-21 before this test: stdio listed 82 tools, the shared
 * registrar (registerAllPublicTools, what the hosted servers serve) 129. The
 * stdio server was a hand-written copy in src/mcp-server.ts, so every tool
 * added to the shared path after the copy was made never reached it:
 * evaluate_script, hover, type_text, press_key, drag, upload_file,
 * handle_dialog, manage_tabs/cookies/storage, get_console_messages,
 * get_network_requests, page_understand, attention_*, llms_txt_* and more.
 * Its navigate also hardcoded `success: true`, which the shared copy had
 * already fixed.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

let dataDir: string;
const prevDataDir = process.env.CBROWSER_DATA_DIR;

beforeAll(() => {
  dataDir = mkdtempSync(join(tmpdir(), "stdio-parity-"));
  process.env.CBROWSER_DATA_DIR = dataDir;
});
afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
  if (prevDataDir === undefined) delete process.env.CBROWSER_DATA_DIR;
  else process.env.CBROWSER_DATA_DIR = prevDataDir;
});

/** Tools only the stdio server has: session bridges that keep state in its process. */
const STDIO_ONLY = [
  "compare_personas_record_result",
  "compare_personas_summarize",
  "empathy_audit_complete_persona",
  "empathy_audit_init",
  "empathy_audit_record_barrier",
  "empathy_audit_summarize",
  "get_emotional_state",
  "list_emotional_personas",
  "trigger_emotional_event",
];

async function connect(server: McpServer): Promise<Client> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "stdio-parity-test", version: "1" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

async function listNames(server: McpServer): Promise<string[]> {
  const client = await connect(server);
  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  await client.close();
  return names;
}

describe("stdio MCP server parity with the shared tool set", () => {
  test("stdio lists every shared tool plus exactly the stdio-only bridges", async () => {
    const { registerAllPublicTools } = await import("../src/mcp-tools/index.js");
    const shared = new McpServer({ name: "shared", version: "1" });
    registerAllPublicTools(shared as never, {
      getBrowser: async () => { throw new Error("no browser in this test"); },
    }, null);
    const sharedNames = await listNames(shared);

    const { createMcpServer } = await import("../src/mcp-server.js");
    const stdioNames = await listNames(await createMcpServer());

    const missing = sharedNames.filter((n) => !stdioNames.includes(n));
    const extra = stdioNames.filter((n) => !sharedNames.includes(n)).sort();
    expect(missing).toEqual([]);
    expect(extra).toEqual([...STDIO_ONLY].sort());
    expect(stdioNames.length).toBe(sharedNames.length + STDIO_ONLY.length);
  }, 60_000);

  test("stdio acquires no hosted-only policy: no tier gate, no hosted path/URL refusals", async () => {
    const { createMcpServer } = await import("../src/mcp-server.js");
    await createMcpServer();
    const { getActiveTier } = await import("../src/mcp-tools/tier-gate.js");
    const { isHostedMode } = await import("../src/mcp-tools/hosted-inputs.js");
    const { getRemoteMode } = await import("../src/mcp-tools/screenshot-utils.js");
    expect(getActiveTier()).toBeNull();
    expect(isHostedMode()).toBe(false);
    expect(getRemoteMode()).toBe(false);
  }, 60_000);

  test("security_audit self-scan on stdio scans this server's own tools", async () => {
    const { createMcpServer } = await import("../src/mcp-server.js");
    const server = await createMcpServer();
    const client = await connect(server);
    const listed = (await client.listTools()).tools.length;
    const res = await client.callTool({ name: "security_audit", arguments: {} });
    const text = (res.content as Array<{ type: string; text: string }>)[0].text;
    // Without a registered list the shared tool falls back to fetching
    // localhost:$PORT/mcp, which is not this process.
    expect(res.isError).not.toBe(true);
    // Measured before the fix: toolCount 55 of 82 listed (only server.tool calls were collected).
    const body = JSON.parse(text) as { toolCount?: number };
    expect(body.toolCount).toBe(listed);
    await client.close();
  }, 60_000);
});
