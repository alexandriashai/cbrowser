// Pin the README against the code, so the region list cannot drift again.
import { describe, test, expect } from "bun:test";
const README = await Bun.file(new URL("../README.md", import.meta.url)).text();
const SRC = await Bun.file(new URL("../src/geo-proxy.ts", import.meta.url)).text();

describe("README advertises only what the package ships", () => {
  test("the region list matches DEFAULT_REGIONS exactly", () => {
    // It advertised 12 including india and singapore; the package ships 10, so
    // both resolved to nothing on a clean install. They existed only in one
    // machine's local config file, which merges OVER the defaults — so the claim
    // was true on the author's box and false everywhere else.
    const blk = SRC.slice(SRC.indexOf("const DEFAULT_REGIONS"),
                          SRC.indexOf("};", SRC.indexOf("const DEFAULT_REGIONS")));
    const shipped = [...blk.matchAll(/"([a-z-]+)":\s*\{/g)].map((m) => m[1]).sort();
    const line = README.split("\n").find((l) => l.startsWith("**Regions:**"))!;
    const advertised = [...line.matchAll(/`([a-z-]+)`/g)].map((m) => m[1]).sort();
    expect(advertised).toEqual(shipped);
  });

  test("the stated count matches the list", () => {
    const line = README.split("\n").find((l) => l.startsWith("**Regions:**"))!;
    const n = [...line.matchAll(/`([a-z-]+)`/g)].length;
    expect(README).toContain(`Test from ${n} global regions`);
  });
});

describe("README does not advertise removed keys", () => {
  test("no stale accessibility axis in the tool table", () => {
    expect(README).not.toContain("findability, stability, accessibility, semantics");
    expect(README).toContain("agent-perceivability");
  });
});

/**
 * 20.0 README rewrite (2026-10-21): every count, command and tool name the
 * README states is pinned to the code. The 19.x README advertised CLI commands
 * that never existed (cognitive-effort, attention-analysis, ...), 122 tools,
 * 17 personas and Node >=18; each was true of some earlier build or none.
 */
describe("README counts, commands and tools match the code", () => {
  const toolNames = async (): Promise<string[]> => {
    const names: string[] = [];
    const fake = new Proxy({}, { get: (_t, p) => (p === "registerTool" || p === "tool" ? (n: string) => { names.push(n); } : () => {}) });
    const { registerAllPublicTools } = await import("../src/mcp-tools/index.js");
    registerAllPublicTools(fake as never, { getBrowser: async () => { throw new Error("no browser"); } } as never, null);
    return names;
  };

  test("the tool count is the registry's, everywhere the README states it", async () => {
    const n = new Set(await toolNames()).size;
    expect(README).toContain(`MCP-${n}%20Tools`);
    expect(README).toContain(`### ${n} MCP Tools`);
    expect(README).toContain(`${n} MCP tools, 21 built-in personas`);
  });

  test("every tool in the table is registered, and the table's counts add up", async () => {
    const registered = new Set(await toolNames());
    const table = README.slice(README.indexOf("| Category | Tools | Count |"), README.indexOf("The 18 Enterprise tools"));
    const rows = table.split("\n").filter((l) => /^\| \*\*/.test(l));
    let total = 0;
    for (const row of rows) {
      const cells = row.split("|").map((c) => c.trim());
      total += Number(cells[3]);
      for (const m of cells[2].matchAll(/`([a-z_]+)`/g)) expect(registered.has(m[1]), m[1]).toBe(true);
    }
    expect(total).toBe(registered.size);
  });

  test("the stdio-only tools are the ones the README names", async () => {
    const src = await Bun.file(new URL("../src/mcp-server.ts", import.meta.url)).text();
    const local = [...src.matchAll(/server\.tool\(\s*"([a-z_]+)"/g)].map((m) => m[1]).sort();
    expect(README).toContain(`plus ${local.length} that keep their state in the local process`);
    for (const name of local) expect(README).toContain(`\`${name}\``);
  });

  test("persona lists and counts are the built-in ones", async () => {
    const { BUILTIN_PERSONAS, listAccessibilityPersonas } = await import("../src/personas.js");
    const general = Object.keys(BUILTIN_PERSONAS);
    const a11y = listAccessibilityPersonas();
    expect(README).toContain(`### ${general.length + a11y.length} Built-in Personas`);
    expect(README).toContain(`**${general.length} general:** ${general.join(", ")}`);
    expect(README).toContain(`**${a11y.length} accessibility:** ${a11y.join(", ")}`);
  });

  test("questionnaire trait counts are the questionnaire's", async () => {
    const { generatePersonaQuestionnaire } = await import("../src/persona-questionnaire.js");
    expect(README).toContain(`(${generatePersonaQuestionnaire({}).length} core traits)`);
    expect(README).toContain(`(all ${generatePersonaQuestionnaire({ comprehensive: true }).length} traits)`);
  });

  test("the Node badge and quickstart match engines.node", async () => {
    const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json() as { engines: { node: string } };
    const min = pkg.engines.node.replace(/^>=/, "");
    const short = min.replace(/\.0$/, "");
    expect(README).toContain(`Node-%3E%3D${short}`);
    expect(README).toContain(`Node.js ${short} or newer`);
  });

  test("the documented default page size is the config default", async () => {
    const cfg = await Bun.file(new URL("../src/config.ts", import.meta.url)).text();
    const w = /CBROWSER_VIEWPORT_WIDTH[^\n]*\|\| "(\d+)"/.exec(cfg)![1];
    const h = /CBROWSER_VIEWPORT_HEIGHT[^\n]*\|\| "(\d+)"/.exec(cfg)![1];
    expect(README).toContain(`\`${w}\` / \`${h}\``);
    expect(README).toContain(`The default page size is **${w}x${h}**`);
  });

  test("every cbrowser command in a shell example is a real command", async () => {
    const cli = await Bun.file(new URL("../src/cli.ts", import.meta.url)).text();
    const known = new Set([
      ...[...cli.matchAll(/case "([a-z0-9-]+)":/g)].map((m) => m[1]),
      ...[...cli.matchAll(/command === "([a-z0-9-]+)"/g)].map((m) => m[1]),
      "scroll", // rewritten to run before dispatch (rewriteScroll)
    ]);
    const blocks = [...README.matchAll(/```(?:bash|yaml)\n([\s\S]*?)```/g)].map((m) => m[1]);
    const used = new Set<string>();
    for (const b of blocks) for (const m of b.matchAll(/(?:^|\s|`)(?:npx )?cbrowser ([a-z0-9-]+)/gm)) used.add(m[1]);
    used.delete("test-suite"); used.add("test-suite"); // keep the set stable for the message below
    const missing = [...used].filter((c) => !known.has(c));
    expect(missing).toEqual([]);
    expect(used.size).toBeGreaterThan(15);
  });
});
