/**
 * Hosted transport: no tool acts on a server path the caller chose.
 *
 * Both hosted servers run startRemoteMcpServer as root for many accounts. The
 * 2026-10-10 security review (sec-paths) found tool parameters that named
 * server paths: nl_test_file filepath, upload_file filePaths, transport_map
 * baselinePath/currentPath, coverage_map testFiles, screenshot path,
 * capture_start out_dir. The class sweep added capture_start name (joined into
 * the output path unchecked), security_audit config_path, and the domain of
 * site_profile_delete / site_profile_status (".." resolved to the data
 * directory itself, which delete then removed recursively).
 *
 * Each parameter is driven through its registered handler with hosted mode on
 * (refused, target untouched) and off (behaves as before). No real browser is
 * started: every handler gets a fake one.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "cb-hosted-paths-"));
const DATA = join(ROOT, "data");
const MIRROR = join(ROOT, "mirror");
const OUTSIDE = join(ROOT, "outside");
mkdirSync(DATA, { recursive: true });
mkdirSync(OUTSIDE, { recursive: true });
const prevEnv = { data: process.env.CBROWSER_DATA_DIR, mirror: process.env.CBROWSER_MIRROR_ROOT };
process.env.CBROWSER_DATA_DIR = DATA;
process.env.CBROWSER_MIRROR_ROOT = MIRROR;

const { setHostedMode, isHostedMode } = await import("../src/mcp-tools/hosted-inputs.js");
const { withPersonaScope, accountDataDir } = await import("../src/persona-scope.js");
const { registerExtractionTools } = await import("../src/mcp-tools/base/extraction-tools.js");
const { registerTestingTools } = await import("../src/mcp-tools/base/testing-tools.js");
const { registerAdvancedInteractionTools } = await import("../src/mcp-tools/base/advanced-interaction-tools.js");
const { registerVisualTestingTools } = await import("../src/mcp-tools/base/visual-testing-tools.js");
const { registerCaptureTools } = await import("../src/mcp-tools/base/capture-tools.js");
const { registerSecurityTools } = await import("../src/mcp-tools/base/security-tools.js");
const { registerSiteKnowledgeTools } = await import("../src/mcp-tools/base/site-knowledge-tools.js");
const sharp = (await import("sharp")).default;

type Result = { isError?: boolean; content: Array<{ type: string; text?: string }> };
type Handler = (args: Record<string, unknown>) => Promise<Result>;

/** Stub McpServer that keeps every handler registered on it. */
function stubServer(): { server: never; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>();
  const server = {
    registerTool: (name: string, _cfg: unknown, h: Handler) => { handlers.set(name, h); },
    tool: (name: string, ...rest: unknown[]) => { handlers.set(name, rest[rest.length - 1] as Handler); },
    registerResource: () => {}, resource: () => {}, registerPrompt: () => {}, prompt: () => {},
  };
  return { server: server as never, handlers };
}

const REACHED = "browser-reached-sentinel";
const unreachable = { getBrowser: async () => { throw new Error(REACHED); } } as never;

const body = (r: Result) => JSON.parse(r.content[0].text ?? "{}");
const refusedHosted = (r: Result, tool: string, param: string) => {
  expect(r.isError).toBe(true);
  const b = body(r);
  expect(b.error).toBe("not_available_on_hosted_server");
  expect(b.tool).toBe(tool);
  expect(b.parameter).toBe(param);
  expect(b.message).toContain("not available on the hosted server");
};

async function png(path: string, rgb: [number, number, number]): Promise<void> {
  await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } })
    .png().toFile(path);
}

afterEach(() => setHostedMode(false));
afterAll(() => {
  setHostedMode(false);
  if (prevEnv.data === undefined) delete process.env.CBROWSER_DATA_DIR; else process.env.CBROWSER_DATA_DIR = prevEnv.data;
  if (prevEnv.mirror === undefined) delete process.env.CBROWSER_MIRROR_ROOT; else process.env.CBROWSER_MIRROR_ROOT = prevEnv.mirror;
  rmSync(ROOT, { recursive: true, force: true });
});

describe("the flag", () => {
  test("is off unless something sets it", () => {
    expect(isHostedMode()).toBe(false);
  });

  test("startRemoteMcpServer sets it; the stdio server and the CLI never do", async () => {
    const { readFileSync } = await import("node:fs");
    const src = (f: string) => readFileSync(join(import.meta.dir, "..", "src", f), "utf-8");
    const remote = src("mcp-server-remote.ts");
    const start = remote.indexOf("export async function startRemoteMcpServer(");
    expect(start).toBeGreaterThan(-1);
    const startBody = remote.slice(start, remote.indexOf("const port =", start));
    expect(startBody).toContain("setHostedMode(true)");
    expect(src("mcp-server.ts")).not.toContain("setHostedMode");
    expect(src("cli.ts")).not.toContain("setHostedMode");
  });
});

describe("screenshot path", () => {
  const { server, handlers } = stubServer();
  let screenshotCalls: Array<string | undefined> = [];
  const fakeBrowser = {
    lastScreenshotInfo: undefined,
    screenshot: async (p?: string) => {
      screenshotCalls.push(p);
      const out = p ?? join(OUTSIDE, "default.png");
      writeFileSync(out, "png-bytes");
      return out;
    },
  };
  registerExtractionTools(server, { getBrowser: async () => fakeBrowser } as never);
  const handler = handlers.get("screenshot")!;

  test("hosted: refused, nothing written, browser never asked", async () => {
    setHostedMode(true);
    screenshotCalls = [];
    const target = join(OUTSIDE, "hosted-shot.png");
    const r = await handler({ path: target });
    refusedHosted(r, "screenshot", "path");
    expect(body(r).message).toContain("Omit path");
    expect(existsSync(target)).toBe(false);
    expect(screenshotCalls).toEqual([]);
  });

  test("hosted without path: still works", async () => {
    setHostedMode(true);
    screenshotCalls = [];
    const r = await handler({});
    expect(r.isError).toBeFalsy();
    expect(screenshotCalls).toEqual([undefined]);
  });

  test("not hosted: path is honoured as before", async () => {
    screenshotCalls = [];
    const target = join(OUTSIDE, "local-shot.png");
    const r = await handler({ path: target });
    expect(r.isError).toBeFalsy();
    expect(screenshotCalls).toEqual([target]);
    expect(existsSync(target)).toBe(true);
  });
});

describe("nl_test_file filepath", () => {
  const { server, handlers } = stubServer();
  registerTestingTools(server);
  const handler = handlers.get("nl_test_file")!;
  const file = join(OUTSIDE, "suite.txt");
  writeFileSync(file, "# Test: marker-suite\ngo to https://example.com/secret-marker-page\n");

  test("hosted: refused before the file is read, nothing of it echoed", async () => {
    setHostedMode(true);
    const r = await handler({ filepath: file, dryRun: true });
    refusedHosted(r, "nl_test_file", "filepath");
    expect(body(r).message).toContain("nl_test_inline");
    expect(r.content[0].text).not.toContain("secret-marker-page");
  });

  test("not hosted: the file is read and parsed as before", async () => {
    const r = await handler({ filepath: file, dryRun: true });
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toContain("secret-marker-page");
  });
});

describe("coverage_map testFiles", () => {
  const { server, handlers } = stubServer();
  registerTestingTools(server);
  const handler = handlers.get("coverage_map")!;
  const file = join(OUTSIDE, "coverage-suite.txt");
  writeFileSync(file, "go to https://example.com/covered\n");
  // maxPages 0: the crawl loop never runs, so no browser starts in either mode.
  const args = { baseUrl: "https://example.com", testFiles: [file], maxPages: 0 };

  test("hosted: refused, the server's disk is not read", async () => {
    setHostedMode(true);
    const r = await handler(args);
    refusedHosted(r, "coverage_map", "testFiles");
    expect(body(r).message).toContain("testFiles: []");
  });

  test("hosted with testFiles: [] still runs", async () => {
    setHostedMode(true);
    const r = await handler({ ...args, testFiles: [] });
    expect(r.isError).toBeFalsy();
  });

  test("not hosted: the file is read as before", async () => {
    const r = await handler(args);
    expect(r.isError).toBeFalsy();
    expect(body(r).testedPages).toBe(1);
  });
});

describe("upload_file filePaths (confined to the account directory)", () => {
  const { server, handlers } = stubServer();
  let uploaded: unknown[] = [];
  const fakeBrowser = {
    getPage: async () => ({ locator: () => ({ setInputFiles: async (p: unknown) => { uploaded.push(p); } }) }),
  };
  registerAdvancedInteractionTools(server, { getBrowser: async () => fakeBrowser } as never);
  const handler = handlers.get("upload_file")!;
  const ACCOUNT = 4242;
  const accountDir = accountDataDir(ACCOUNT);
  mkdirSync(join(accountDir, "screenshots"), { recursive: true });
  const inside = join(accountDir, "screenshots", "mine.png");
  writeFileSync(inside, "mine");
  const outside = join(OUTSIDE, "not-mine.txt");
  writeFileSync(outside, "not mine");
  const link = join(accountDir, "screenshots", "link-out.txt");
  symlinkSync(outside, link);

  test("hosted, outside the account directory: refused, nothing uploaded", async () => {
    setHostedMode(true);
    uploaded = [];
    const r = await withPersonaScope(ACCOUNT, () => handler({ selector: "#f", filePaths: [outside] }));
    expect(r.isError).toBe(true);
    expect(body(r).error).toBe("path_outside_account_directory");
    expect(uploaded).toEqual([]);
  });

  test("hosted, symlink inside pointing out: refused", async () => {
    setHostedMode(true);
    uploaded = [];
    const r = await withPersonaScope(ACCOUNT, () => handler({ selector: "#f", filePaths: [link] }));
    expect(r.isError).toBe(true);
    expect(uploaded).toEqual([]);
  });

  test("hosted, traversal out of the account directory: refused", async () => {
    setHostedMode(true);
    uploaded = [];
    const r = await withPersonaScope(ACCOUNT, () =>
      handler({ selector: "#f", filePaths: ["../../../outside/not-mine.txt"] }));
    expect(r.isError).toBe(true);
    expect(uploaded).toEqual([]);
  });

  test("hosted with no account scope: refused", async () => {
    setHostedMode(true);
    uploaded = [];
    const r = await handler({ selector: "#f", filePaths: [inside] });
    expect(r.isError).toBe(true);
    expect(uploaded).toEqual([]);
  });

  test("hosted, the account's own file (relative or absolute): uploaded", async () => {
    setHostedMode(true);
    uploaded = [];
    const r = await withPersonaScope(ACCOUNT, () =>
      handler({ selector: "#f", filePaths: ["screenshots/mine.png", inside] }));
    expect(r.isError).toBeFalsy();
    expect(uploaded).toHaveLength(1);
    expect((uploaded[0] as string[]).every((p) => p.endsWith(join("screenshots", "mine.png")))).toBe(true);
  });

  test("not hosted: any path is passed through as before", async () => {
    uploaded = [];
    const r = await handler({ selector: "#f", filePaths: [outside] });
    expect(r.isError).toBeFalsy();
    expect(uploaded).toEqual([[outside]]);
  });
});

describe("transport_map baselinePath/currentPath (confined to the account directory)", () => {
  const { server, handlers } = stubServer();
  registerVisualTestingTools(server, unreachable);
  const handler = handlers.get("transport_map")!;
  const ACCOUNT = 4343;
  const accountDir = accountDataDir(ACCOUNT);
  const a = join(OUTSIDE, "a.png");
  const b = join(OUTSIDE, "b.png");
  const mineA = join(accountDir, "screenshots", "a.png");
  const mineB = join(accountDir, "screenshots", "b.png");
  const mapsDir = join(DATA, "transport-maps");
  const maps = () => (existsSync(mapsDir) ? readdirSync(mapsDir).length : 0);

  beforeAll(async () => {
    mkdirSync(join(accountDir, "screenshots"), { recursive: true });
    await png(a, [255, 0, 0]);
    await png(b, [0, 0, 255]);
    await png(mineA, [255, 0, 0]);
    await png(mineB, [0, 0, 255]);
  });

  test("hosted, paths outside the account directory: refused, no map computed", async () => {
    setHostedMode(true);
    const before = maps();
    const r = await withPersonaScope(ACCOUNT, () => handler({ baselinePath: a, currentPath: b }));
    expect(r.isError).toBe(true);
    const out = body(r);
    expect(out.error).toBe("path_outside_account_directory");
    expect(out.parameter).toBe("baselinePath");
    expect(out.message).toContain("transportMap: true");
    expect(maps()).toBe(before);
  });

  test("hosted, current outside: refused on currentPath", async () => {
    setHostedMode(true);
    const r = await withPersonaScope(ACCOUNT, () => handler({ baselinePath: mineA, currentPath: b }));
    expect(r.isError).toBe(true);
    expect(body(r).parameter).toBe("currentPath");
  });

  test("hosted, the account's own screenshots: map computed", async () => {
    setHostedMode(true);
    const r = await withPersonaScope(ACCOUNT, () => handler({ baselinePath: mineA, currentPath: mineB }));
    expect(r.isError).toBeFalsy();
    expect(body(r).svgPath).toBeTruthy();
  });

  test("not hosted: any path is read as before", async () => {
    const before = maps();
    const r = await handler({ baselinePath: a, currentPath: b });
    expect(r.isError).toBeFalsy();
    expect(maps()).toBe(before + 1);
  });
});

describe("capture_start out_dir and name", () => {
  const { server, handlers } = stubServer();
  registerCaptureTools(server, unreachable);
  const handler = handlers.get("capture_start")!;

  test("hosted out_dir: refused before any browser, directory not created", async () => {
    setHostedMode(true);
    const target = join(OUTSIDE, "capture-out");
    const r = await handler({ out_dir: target });
    refusedHosted(r, "capture_start", "out_dir");
    expect(r.content[0].text).not.toContain(REACHED);
    expect(existsSync(target)).toBe(false);
  });

  test("hosted name with a path in it: refused before any browser", async () => {
    setHostedMode(true);
    for (const name of ["../../escape", "a/b", "..", "."]) {
      const r = await handler({ name });
      expect(r.isError).toBe(true);
      expect(body(r).parameter).toBe("name");
      expect(r.content[0].text).not.toContain(REACHED);
    }
  });

  test("hosted plain name: accepted (goes on to the browser)", async () => {
    setHostedMode(true);
    const r = await handler({ name: "hero-animation" });
    expect(r.content[0].text).toContain(REACHED);
  });

  test("not hosted: out_dir and a path-shaped name are accepted as before", async () => {
    const r1 = await handler({ out_dir: join(OUTSIDE, "capture-out") });
    expect(r1.content[0].text).toContain(REACHED);
    const r2 = await handler({ name: "../elsewhere" });
    expect(r2.content[0].text).toContain(REACHED);
  });
});

describe("security_audit config_path", () => {
  const { server, handlers } = stubServer();
  registerSecurityTools(server);
  const handler = handlers.get("security_audit")!;
  const config = join(OUTSIDE, "claude_desktop_config.json");
  writeFileSync(config, JSON.stringify({ mcpServers: { "marker-server-xyz": { command: "true", args: [] } } }));

  test("hosted: refused, the file is not read", async () => {
    setHostedMode(true);
    const r = await handler({ config_path: config, format: "json" });
    refusedHosted(r, "security_audit", "config_path");
    expect(r.content[0].text).not.toContain("marker-server-xyz");
  });

  test("not hosted: the config is read as before", async () => {
    const r = await handler({ config_path: config, format: "json" });
    expect(r.content.map((c) => c.text ?? "").join("\n")).toContain("marker-server-xyz");
  });
});

describe("site_profile_delete / site_profile_status domain", () => {
  const { server, handlers } = stubServer();
  registerSiteKnowledgeTools(server, unreachable);
  const del = handlers.get("site_profile_delete")!;
  const status = handlers.get("site_profile_status")!;

  // Its own data directory: on the base commit ".." deletes whatever
  // CBROWSER_DATA_DIR names, so the test must not point it at anything shared.
  const withDataDir = async <T>(fn: (dir: string) => Promise<T>): Promise<T> => {
    const dir = mkdtempSync(join(ROOT, "profiles-"));
    mkdirSync(join(dir, "site-profiles", "example.com"), { recursive: true });
    writeFileSync(join(dir, "keep-me.json"), "{}");
    const prev = process.env.CBROWSER_DATA_DIR;
    process.env.CBROWSER_DATA_DIR = dir;
    try { return await fn(dir); } finally { process.env.CBROWSER_DATA_DIR = prev; }
  };

  test("hosted delete with domain '..': refused, data directory intact", async () => {
    setHostedMode(true);
    await withDataDir(async (dir) => {
      const r = await del({ domain: ".." });
      expect(r.isError).toBe(true);
      expect(body(r).parameter).toBe("domain");
      expect(existsSync(join(dir, "keep-me.json"))).toBe(true);
      expect(existsSync(join(dir, "site-profiles", "example.com"))).toBe(true);
    });
  });

  test("hosted delete with domain '.': refused, other profiles intact", async () => {
    setHostedMode(true);
    await withDataDir(async (dir) => {
      const r = await del({ domain: "." });
      expect(r.isError).toBe(true);
      expect(existsSync(join(dir, "site-profiles", "example.com"))).toBe(true);
    });
  });

  test("hosted status with domain '..': refused", async () => {
    setHostedMode(true);
    const r = await status({ domain: ".." });
    expect(r.isError).toBe(true);
    expect(body(r).parameter).toBe("domain");
  });

  test("hosted delete of a real domain: works", async () => {
    setHostedMode(true);
    await withDataDir(async (dir) => {
      const r = await del({ domain: "example.com" });
      expect(r.isError).toBeFalsy();
      expect(existsSync(join(dir, "site-profiles", "example.com"))).toBe(false);
      expect(existsSync(join(dir, "keep-me.json"))).toBe(true);
    });
  });

  test("not hosted: delete of a real domain behaves as before", async () => {
    await withDataDir(async (dir) => {
      const r = await del({ domain: "example.com" });
      expect(r.isError).toBeFalsy();
      expect(existsSync(join(dir, "site-profiles", "example.com"))).toBe(false);
    });
  });
});
