/**
 * The `status` tool promises an MCP tool count. It must deliver one, and the
 * number must be the one tools/list returns.
 *
 * Measured 2026-10-06: on the hosted servers the status payload had no
 * toolCount at all. browser-management-tools reads `getToolCount?.()`, and the
 * only context the remote server builds is { getBrowser, getBrowserByToken },
 * so the optional call returned undefined and getStatusInfo omitted the key.
 * The description ("... and MCP tool count") described a field nobody sent.
 *
 * The stdio server did send one, but counted only `server.tool(...)` calls;
 * every family it registers through `registerTool` (empathy_audit, values,
 * persona comparison/creation/lifecycle) was missing from the figure.
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
  dataDir = mkdtempSync(join(tmpdir(), "status-count-"));
  process.env.CBROWSER_DATA_DIR = dataDir;
});
afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
  if (prevDataDir === undefined) delete process.env.CBROWSER_DATA_DIR;
  else process.env.CBROWSER_DATA_DIR = prevDataDir;
});

async function connect(server: McpServer): Promise<Client> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "status-count-test", version: "1" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return client;
}

async function statusAndList(client: Client): Promise<{ toolCount: unknown; listed: number }> {
  const listed = (await client.listTools()).tools.length;
  const res = await client.callTool({ name: "status", arguments: {} });
  const text = (res.content as Array<{ type: string; text: string }>)[0].text;
  return { toolCount: (JSON.parse(text) as { toolCount?: unknown }).toolCount, listed };
}

describe("status tool count", () => {
  test("shared registrar with the REMOTE server's context shape reports the listed count", async () => {
    // The exact context mcp-server-remote.ts builds: no getToolCount.
    const { registerBaseTools } = await import("../src/mcp-tools/base/index.js");
    const server = new McpServer({ name: "t", version: "1" });
    registerBaseTools(server as never, {
      getBrowser: async () => { throw new Error("no browser in this test"); },
      getBrowserByToken: async () => { throw new Error("no browser in this test"); },
    });
    const client = await connect(server);
    const { toolCount, listed } = await statusAndList(client);
    expect(listed).toBeGreaterThan(50);
    expect(toolCount).toBe(listed);
    await client.close();
  });

  test("an explicit getToolCount still wins", async () => {
    const { registerBrowserManagementTools } = await import("../src/mcp-tools/base/browser-management-tools.js");
    const server = new McpServer({ name: "t", version: "1" });
    registerBrowserManagementTools(server as never, {
      getBrowser: async () => { throw new Error("no browser in this test"); },
      getToolCount: () => 4242,
    });
    const client = await connect(server);
    const { toolCount } = await statusAndList(client);
    expect(toolCount).toBe(4242);
    await client.close();
  });

  test("stdio server counts registerTool families too", async () => {
    const { createMcpServer } = await import("../src/mcp-server.js");
    const server = await createMcpServer();
    const client = await connect(server);
    const { toolCount, listed } = await statusAndList(client);
    expect(listed).toBeGreaterThan(50);
    expect(toolCount).toBe(listed);
    await client.close();
  }, 30_000);
});
