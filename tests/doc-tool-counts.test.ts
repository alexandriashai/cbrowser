/**
 * The tool counts and versions the docs state are the ones the code registers.
 *
 * An outside audit (2026-11-20) found the published docs disagreeing: README 130,
 * manifest.json "120 MCP tools" (and version 18.59.0 while 21.x shipped),
 * skill/SKILL.md "131" and "122", the src/mcp-tools/index.ts header "139" and
 * "9 stdio-only", SECURITY.md supporting only 18.x, and package.json "files"
 * naming a docs/ directory that does not exist. Every number was typed by hand
 * and drifted. This test counts the registered tools the way
 * tests/mcp-stdio-parity.test.ts does and holds each stated number to it.
 *
 * Numbers it knows:
 * - shared: registerAllPublicTools, the set every server lists (130 today)
 * - stdio: npx cbrowser mcp-server, shared plus the stdio-only bridges (137)
 * A hosted server can add tools of its own (the Pro server adds
 * web_security_scan from cbrowser-enterprise); that number is not knowable here,
 * so no doc in this repo may state it as a bare count.
 *
 * Pure: no browser.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const ROOT = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const prevDataDir = process.env.CBROWSER_DATA_DIR;
let shared = 0;
let stdio = 0;

async function count(server: McpServer): Promise<number> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "doc-tool-counts", version: "1" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  const n = (await client.listTools()).tools.length;
  await client.close();
  return n;
}

beforeAll(async () => {
  process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-doc-counts-"));
  const { registerAllPublicTools } = await import("../src/mcp-tools/index.js");
  const s = new McpServer({ name: "shared", version: "1" });
  registerAllPublicTools(s, {} as never, null as never);
  shared = await count(s);
  const { createMcpServer } = await import("../src/mcp-server.js");
  stdio = await count(await createMcpServer());
});

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.CBROWSER_DATA_DIR;
  else process.env.CBROWSER_DATA_DIR = prevDataDir;
});

/** Every three-digit "N tools" / "N MCP tools" / badge count in a text. */
function statedCounts(text: string): number[] {
  const found: number[] = [];
  for (const m of text.matchAll(/\b(\d{3})(?: MCP)? [Tt]ools\b/g)) found.push(Number(m[1]));
  for (const m of text.matchAll(/MCP-(\d{3})%20Tools/g)) found.push(Number(m[1]));
  return found;
}

describe("stated tool counts", () => {
  test("the counted sets are what the docs below describe", () => {
    expect(shared).toBeGreaterThan(100);
    expect(stdio).toBeGreaterThan(shared);
  });

  test("README: badge and headline give the shared set; local is shared plus the stdio-only tools", () => {
    const readme = read("README.md");
    expect(readme).toContain(`MCP-${shared}%20Tools`);
    expect(readme).toContain(`${shared} MCP tools`);
    expect(readme).toContain(`registers the ${shared}-tool set`);
    expect(readme).toContain(`plus ${stdio - shared} that keep their state in the local process`);
    // An "## Upgrading to N" section is history and may quote the counts of its
    // day; everywhere else a count must be one of the two numbers.
    const current = readme.replace(/^## Upgrading[^\n]*\n[\s\S]*?(?=^## )/gm, "");
    for (const n of statedCounts(current)) expect([shared, stdio], `README states ${n}`).toContain(n);
  });

  test("manifest.json (the local MCPB bundle) states the stdio count and the package version", () => {
    const manifest = JSON.parse(read("manifest.json"));
    const pkg = JSON.parse(read("package.json"));
    expect(manifest.description).toContain(`${stdio} MCP tools`);
    expect(manifest.version).toBe(pkg.version);
  });

  test("skill/SKILL.md states the stdio count wherever it states one", () => {
    const counts = statedCounts(read("skill/SKILL.md").split(/^## Version History/m)[0]);
    expect(counts.length).toBeGreaterThan(0);
    for (const n of counts) expect(n, `SKILL.md states ${n}`).toBe(stdio);
  });

  test("the src/mcp-tools/index.ts header matches", () => {
    const head = read("src/mcp-tools/index.ts").slice(0, 2500);
    expect(head).toContain(`SHARED SET (registerAllPublicTools): ${shared}`);
    expect(head).toContain(`LOCAL MCP (npx cbrowser mcp-server): ${stdio}`);
    expect(head).toContain(`Stdio-only session bridges: ${stdio - shared}`);
  });
});

describe("versions and packaging", () => {
  test("SECURITY.md supports the major version that ships", () => {
    const major = JSON.parse(read("package.json")).version.split(".")[0];
    const sec = read("SECURITY.md");
    expect(sec).toMatch(new RegExp(`\\|\\s*${major}\\.x\\s*\\|\\s*:white_check_mark:`));
    expect(sec).not.toMatch(/\|\s*1[0-9]\.x\s*\|\s*:white_check_mark:/);
  });

  test("every package.json \"files\" entry exists", () => {
    for (const f of JSON.parse(read("package.json")).files as string[]) {
      // dist/ is built before pack; the rest must be in the repo.
      if (f === "dist/") continue;
      expect(existsSync(join(ROOT, f)), f).toBe(true);
    }
  });
});
