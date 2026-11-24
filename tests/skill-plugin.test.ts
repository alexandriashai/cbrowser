/**
 * The Claude skill and the Claude Code plugin say only what this version does.
 *
 * Before 2026-11-23 the skill named CLI commands that did not exist (`creds`,
 * `auth`), led with a skill-local copy of the v5 CLI (Tools/CBrowser.ts), sorted
 * its features by v6-v8 release numbers, and told readers to run
 * `npx playwright install`, which can resolve a different Playwright than the one
 * cbrowser launches. Nothing checked any of it. This test reads every file of the
 * skill and the plugin's commands and holds each command and tool name to the code:
 * - every `cbrowser <command>` in inline code or a code block is a CLI command
 * - every backticked snake_case name is a tool the local stdio server registers,
 *   unless it is a known parameter or field name (NON_TOOL_NAMES) or written
 *   `param: name`
 * It also pins the plugin manifest, the marketplace entry, and skill/, the mirror
 * that cbrowser 21.5.5 and older download from GitHub.
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
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { listSkillFiles } from "../src/cli/commands/setup.js";

const ROOT = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const PLUGIN = "plugins/cbrowser";
const SKILL = `${PLUGIN}/skills/cbrowser`;
const skillFiles = listSkillFiles(join(ROOT, SKILL));
const commandFiles = listSkillFiles(join(ROOT, PLUGIN, "commands")).map((f) => `${PLUGIN}/commands/${f}`);
const docs = [...skillFiles.map((f) => `${SKILL}/${f}`), ...commandFiles];

/** Parameter and field names the docs legitimately put in backticks. Not tools. */
const NON_TOOL_NAMES = new Set<string>([]);

// The files cbrowser <= 21.5.5 request from skill/ in `install-skill`; one 404 aborts it.
const LEGACY_FILES = [
  "SKILL.md", "Philosophy.md", "AIVision.md", "SessionManagement.md", "Credentials.md", "Personas.md",
  "Workflows/Navigate.md", "Workflows/Interact.md", "Workflows/Extract.md", "Workflows/Authenticate.md",
  "Workflows/Test.md", "Workflows/Journey.md", "Tools/CBrowser.ts",
];

let tools = new Set<string>();
const prevDataDir = process.env.CBROWSER_DATA_DIR;

beforeAll(async () => {
  process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-skill-plugin-"));
  const { createMcpServer } = await import("../src/mcp-server.js");
  const server = await createMcpServer();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "skill-plugin", version: "1" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  tools = new Set((await client.listTools()).tools.map((t) => t.name));
  await client.close();
});

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.CBROWSER_DATA_DIR;
  else process.env.CBROWSER_DATA_DIR = prevDataDir;
});

/** The CLI's commands, as the help text lists them (two-space indent, then the name). */
function cliCommands(): Set<string> {
  const help = read("src/cli/help.ts");
  const names = new Set([...help.matchAll(/^ {2}([a-z][a-z0-9-]+)\b/gm)].map((m) => m[1]));
  // `cbrowser help <topic>` prints one section; it is how the help text itself is
  // reached, so it has no line of its own.
  names.add("help");
  return names;
}

/** Text inside fenced code blocks, and the rest. */
function split(md: string): { code: string[]; prose: string } {
  const code: string[] = [];
  const prose = md.replace(/^```[^\n]*\n([\s\S]*?)^```/gm, (_m, body: string) => {
    code.push(body);
    return "";
  });
  return { code, prose };
}

function inlineCode(prose: string): string[] {
  return [...prose.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
}

describe("every name the skill and plugin use is real", () => {
  test("the files exist and the server registered its tools", () => {
    expect(skillFiles).toContain("SKILL.md");
    expect(commandFiles.length).toBeGreaterThan(0);
    expect(tools.size).toBeGreaterThan(100);
  });

  test("every `cbrowser <command>` is a CLI command", () => {
    const commands = cliCommands();
    expect(commands.has("navigate")).toBe(true);
    expect(commands.has("install-browsers")).toBe(true);
    const bad: string[] = [];
    for (const f of docs) {
      const { code, prose } = split(read(f));
      const spans = [...inlineCode(prose), ...code.flatMap((c) => c.split("\n"))];
      for (const s of spans) {
        for (const m of s.matchAll(/(?:^|[\s;|&(])(?:npx (?:-y )?)?cbrowser(?:@[\w.^~]+)? ([a-z][a-z0-9-]*)/g)) {
          if (!commands.has(m[1])) bad.push(`${f}: cbrowser ${m[1]}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  test("every backticked snake_case name is a registered tool or a known field", () => {
    const bad: string[] = [];
    for (const f of docs) {
      const { prose } = split(read(f));
      for (const span of inlineCode(prose)) {
        const name = span.trim();
        if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(name)) continue;
        if (tools.has(name) || NON_TOOL_NAMES.has(name)) continue;
        bad.push(`${f}: \`${name}\``);
      }
    }
    expect(bad).toEqual([]);
  });

  test("Anti: nothing points at the retired v5 tool, npx playwright, or the removed vault commands", () => {
    for (const f of docs) {
      const text = read(f);
      expect(text, f).not.toContain("Tools/CBrowser.ts");
      expect(text, f).not.toMatch(/npx playwright install/);
      expect(text, f).not.toMatch(/cbrowser (?:creds|auth)\b/);
    }
  });

  test("no release-number labels: the docs describe what exists now", () => {
    for (const f of docs) {
      expect(read(f).match(/\bv\d+\.\d+(?:\.\d+)?\b/g), f).toBeNull();
    }
  });
});

describe("SKILL.md", () => {
  const skill = read(`${SKILL}/SKILL.md`);

  test("stays a router: under 500 lines", () => {
    expect(skill.split("\n").length).toBeLessThan(500);
  });

  test("every file it routes to exists", () => {
    const refs = [...skill.matchAll(/`((?:Workflows\/)?[A-Z][A-Za-z]+\.md)`/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(10);
    for (const r of refs) expect(existsSync(join(ROOT, SKILL, r)), r).toBe(true);
  });
});

describe("skill/ mirrors the canonical skill for older cbrowser versions", () => {
  test("every canonical file is in skill/ unchanged", () => {
    for (const f of skillFiles) expect(read(`skill/${f}`), `skill/${f}`).toBe(read(`${SKILL}/${f}`));
  });

  test("skill/ holds nothing else but the retired-tool stub", () => {
    const extra = listSkillFiles(join(ROOT, "skill")).filter((f) => !skillFiles.includes(f));
    expect(extra).toEqual(["Tools/CBrowser.ts"]);
    expect(read("skill/Tools/CBrowser.ts")).toContain("retired");
  });

  test("every file cbrowser <= 21.5.5 downloads is still there", () => {
    for (const f of LEGACY_FILES) expect(existsSync(join(ROOT, "skill", f)), f).toBe(true);
  });
});

describe("the Claude Code plugins", () => {
  const pkg = JSON.parse(read("package.json"));
  const market = JSON.parse(read(".claude-plugin/marketplace.json"));
  const PLUGINS = { cbrowser: PLUGIN, "cbrowser-local": "plugins/cbrowser-local" } as const;
  const manifest = (dir: string) => JSON.parse(read(`${dir}/.claude-plugin/plugin.json`));

  test("each plugin.json: its name, and the package's version", () => {
    for (const [name, dir] of Object.entries(PLUGINS)) {
      expect(manifest(dir).name).toBe(name);
      expect(manifest(dir).version, name).toBe(pkg.version);
    }
  });

  test("the release bump writes both plugin.json versions", () => {
    const script = read("scripts/sync-manifest-version.mjs");
    for (const dir of Object.values(PLUGINS)) expect(script).toContain(`${dir}/.claude-plugin/plugin.json`);
    expect(read(".release-it.json")).toContain("scripts/sync-manifest-version.mjs");
  });

  test("marketplace.json lists both plugins at sources that hold them", () => {
    expect(market.name).toBeTruthy();
    expect(market.owner?.name).toBeTruthy();
    for (const [name, dir] of Object.entries(PLUGINS)) {
      const entry = market.plugins.find((p: { name: string }) => p.name === name);
      expect(entry, name).toBeTruthy();
      expect(join(ROOT, entry.source)).toBe(join(ROOT, dir));
      expect(existsSync(join(ROOT, entry.source, ".claude-plugin/plugin.json"))).toBe(true);
    }
  });

  // The claude.ai directory's checklist (2026-11-23): a README saying what the
  // plugin does and what data it sends, a license, an icon, a privacy policy for
  // a remote server.
  test("each plugin meets the directory's checklist", () => {
    for (const dir of Object.values(PLUGINS)) {
      const m = manifest(dir);
      expect(read(`${dir}/README.md`), dir).toMatch(/## What data it sends/);
      expect(m.license, dir).toBe("MIT");
      expect(m.privacyPolicyUrl, dir).toBe("https://cbrowser.ai/privacy");
      expect(m.termsOfServiceUrl, dir).toBeTruthy();
      const icon = readFileSync(join(ROOT, dir, m.icon));
      expect(icon.subarray(1, 4).toString(), dir).toBe("PNG");
      expect([icon.readUInt32BE(16), icon.readUInt32BE(20)], dir).toEqual([512, 512]);
    }
  });

  test("cbrowser, the one submitted to the directory, runs no code on the user's machine: the hosted server, with sign-in", () => {
    const mcp = JSON.parse(read(`${PLUGIN}/.mcp.json`));
    expect(Object.keys(mcp)).toEqual(["cbrowser"]);
    expect(mcp.cbrowser).toEqual({ type: "http", url: "https://demo.cbrowser.ai/mcp/signin" });
    // No query string: the plugin directory reads "auth=" in a server URL as a secret and refuses the plugin.
    expect(new URL(mcp.cbrowser.url).search).toBe("");
    // A static Authorization header would turn Claude Code's OAuth sign-in off.
    expect(JSON.stringify(mcp)).not.toContain("Authorization");
  });

  test("cbrowser-local starts this major version's stdio server", () => {
    const server = JSON.parse(read("plugins/cbrowser-local/.mcp.json")).cbrowser;
    expect(server.command).toBe("npx");
    expect(server.args.find((a: string) => a.startsWith("cbrowser"))).toBe(`cbrowser@${pkg.version.split(".")[0]}`);
    expect(server.args.at(-1)).toBe("mcp-server");
  });

  test("cbrowser-local carries the same skill and commands, unchanged", () => {
    for (const sub of ["skills/cbrowser", "commands"]) {
      const files = listSkillFiles(join(ROOT, PLUGIN, sub));
      expect(listSkillFiles(join(ROOT, "plugins/cbrowser-local", sub))).toEqual(files);
      for (const f of files) expect(read(`plugins/cbrowser-local/${sub}/${f}`), f).toBe(read(`${PLUGIN}/${sub}/${f}`));
    }
  });

  test("every slash command has a description", () => {
    for (const f of commandFiles) expect(read(f), f).toMatch(/^---\n[\s\S]*?^description: \S[\s\S]*?^---\n/m);
  });

  test("the npm package ships the skill, so install-skill needs no network", () => {
    expect(pkg.files).toContain(`${SKILL}/`);
  });
});
