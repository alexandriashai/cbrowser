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
 * started and nothing touches the network: handlers get a fake browser, and
 * where code builds its own CBrowser (coverage_map's crawl) or could fetch,
 * stubBrowserAndNetwork replaces the launch, page, navigate and fetch paths
 * with recorders that throw. Before 2026-10-10 the coverage_map block started
 * headless Chromium and opened https://example.com, because maxPages 0 is
 * read as "use the default of 100".
 *
 * The class sweep at the end reads every refuseHostedPath call site from the
 * source and checks that "" and null are refused on each: "" used to count as
 * omitted, and capture_start then wrote into resolve(""), the server's working
 * directory.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

const { setHostedMode, isHostedMode, refuseHostedPath } = await import("../src/mcp-tools/hosted-inputs.js");
const { registerBaseTools } = await import("../src/mcp-tools/base/index.js");
const { CBrowser } = await import("../src/browser.js");
const playwright = await import("playwright");
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

const NO_BROWSER = "browser-or-network-must-not-be-reached";
/**
 * Replace every way code under test could start a real browser or reach the
 * network with a recorder that throws: CBrowser's launch/getPage/navigate,
 * Playwright's launchers, and fetch. `calls` lists each attempt, so a test can
 * show that a crawl reached the stub and that nothing launched or fetched.
 */
function stubBrowserAndNetwork(): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  const saved: Array<[object, string, unknown]> = [];
  const stub = (obj: object, label: string, name: string) => {
    saved.push([obj, name, (obj as Record<string, unknown>)[name]]);
    (obj as Record<string, unknown>)[name] = async (...args: unknown[]) => {
      const first = args[0] as { url?: string } | string | undefined;
      const arg = typeof first === "string" ? first : first?.url ?? (first === undefined ? "" : String(first));
      calls.push(arg ? `${label}.${name} ${arg}` : `${label}.${name}`);
      throw new Error(NO_BROWSER);
    };
  };
  for (const m of ["launch", "getPage", "navigate"]) stub(CBrowser.prototype, "CBrowser", m);
  for (const [label, bt] of [["chromium", playwright.chromium], ["firefox", playwright.firefox], ["webkit", playwright.webkit]] as const) {
    for (const m of ["launch", "launchPersistentContext", "connect", "connectOverCDP"]) stub(bt, label, m);
  }
  stub(globalThis, "globalThis", "fetch");
  return {
    calls,
    restore: () => { for (const [obj, name, value] of saved.reverse()) (obj as Record<string, unknown>)[name] = value; },
  };
}

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
  // The crawl builds its own CBrowser (maxPages 0 would mean the default 100),
  // so the stubs stand in for the browser and the network: the first
  // navigate reaches the recorder and throws, the crawl records the page as
  // unreachable, and nothing launches or fetches.
  const args = { baseUrl: "https://example.com", testFiles: [file], maxPages: 1 };
  let stubs: ReturnType<typeof stubBrowserAndNetwork>;
  beforeAll(() => { stubs = stubBrowserAndNetwork(); });
  afterAll(() => stubs.restore());
  const onlyTheStubbedNavigate = () => expect(stubs.calls).toEqual(["CBrowser.navigate https://example.com"]);

  test("hosted: refused, the server's disk is not read", async () => {
    setHostedMode(true);
    stubs.calls.length = 0;
    const r = await handler(args);
    refusedHosted(r, "coverage_map", "testFiles");
    expect(body(r).message).toContain("testFiles: []");
    expect(stubs.calls).toEqual([]);
  });

  test("hosted with testFiles: [] still runs", async () => {
    setHostedMode(true);
    stubs.calls.length = 0;
    const r = await handler({ ...args, testFiles: [] });
    expect(r.isError).toBeFalsy();
    onlyTheStubbedNavigate();
  });

  test("not hosted: the file is read as before", async () => {
    stubs.calls.length = 0;
    const r = await handler(args);
    expect(r.isError).toBeFalsy();
    expect(body(r).testedPages).toBe(1);
    onlyTheStubbedNavigate();
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

  // "" counted as omitted, startCapture tests out_dir !== undefined, and
  // resolve("") is the server's working directory (cbrowser-enterprise for
  // both hosted units), so output landed there, root-owned. (sec-paths, 2026-10-10)
  test("hosted out_dir \"\": refused before any browser", async () => {
    setHostedMode(true);
    const r = await handler({ out_dir: "" });
    refusedHosted(r, "capture_start", "out_dir");
    expect(r.content[0].text).not.toContain(REACHED);
  });

  test("not hosted: out_dir \"\" goes on to the browser as before", async () => {
    const r = await handler({ out_dir: "" });
    expect(r.content[0].text).toContain(REACHED);
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

/**
 * Class sweep: every parameter refuseHostedPath guards, read from the source
 * so a parameter guarded later is covered without editing this list. "" and
 * null used to count as omitted; only undefined (and an empty array, which
 * names no path) may pass on the hosted server. (sec-paths, 2026-10-10)
 */
describe("class: every refuseHostedPath parameter refuses \"\" and null on the hosted server", () => {
  const SRC = join(import.meta.dir, "..", "src", "mcp-tools");
  const guarded: Array<{ tool: string; param: string }> = [];
  for (const f of readdirSync(SRC, { recursive: true }) as string[]) {
    if (!f.endsWith(".ts")) continue;
    for (const m of readFileSync(join(SRC, f), "utf-8").matchAll(/refuseHostedPath\(\s*"([^"]+)",\s*"([^"]+)"/g)) {
      guarded.push({ tool: m[1], param: m[2] });
    }
  }
  const { server, handlers } = stubServer();
  const reach = async () => { throw new Error(REACHED); };
  registerBaseTools(server, { getBrowser: reach, getBrowserByToken: reach } as never);
  let stubs: ReturnType<typeof stubBrowserAndNetwork>;
  beforeAll(() => { stubs = stubBrowserAndNetwork(); });
  afterAll(() => stubs.restore());
  const call = (tool: string, args: Record<string, unknown>) => Promise.race([
    handlers.get(tool)!(args),
    new Promise<Result>((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000)),
  ]);
  const refusedFor = (r: Result, param: string) => {
    let b: { error?: string; parameter?: string } = {};
    try { b = JSON.parse(r.content?.[0]?.text ?? ""); } catch { /* not JSON */ }
    return r.isError === true && b.error === "not_available_on_hosted_server" && b.parameter === param;
  };

  test("the sweep finds every known call site, each a registered tool", () => {
    expect(guarded.map((g) => `${g.tool}.${g.param}`)).toEqual(expect.arrayContaining([
      "screenshot.path", "nl_test_file.filepath", "coverage_map.testFiles", "capture_start.out_dir", "security_audit.config_path",
    ]));
    for (const g of guarded) expect(handlers.has(g.tool)).toBe(true);
  });

  test("helper, hosted: \"\" and null are refused; undefined and [] are not", () => {
    setHostedMode(true);
    for (const { tool, param } of guarded) {
      for (const v of ["", null]) expect(refuseHostedPath(tool, param, v, "")?.isError).toBe(true);
      expect(refuseHostedPath(tool, param, undefined, "")).toBeNull();
      expect(refuseHostedPath(tool, param, [], "")).toBeNull();
    }
  });

  test("helper, not hosted: nothing is refused, \"\" included", () => {
    for (const { tool, param } of guarded) {
      for (const v of ["", null, undefined, "/etc/passwd", [""]]) expect(refuseHostedPath(tool, param, v, "")).toBeNull();
    }
  });

  test("each handler, hosted: \"\" and null are refused before any work", async () => {
    setHostedMode(true);
    const failures: string[] = [];
    for (const { tool, param } of guarded) {
      for (const v of ["", null]) {
        const label = `${tool}.${param}=${JSON.stringify(v)}`;
        try {
          const r = await call(tool, { [param]: v });
          if (!refusedFor(r, param)) failures.push(`${label}: ${(r.content?.[0]?.text ?? "").slice(0, 120)}`);
        } catch (e) {
          failures.push(`${label}: threw ${(e as Error).message}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test("each handler, hosted, parameter omitted: not refused for it", async () => {
    setHostedMode(true);
    const refused: string[] = [];
    for (const { tool, param } of guarded) {
      try {
        if (refusedFor(await call(tool, {}), param)) refused.push(`${tool}.${param}`);
      } catch {
        // Past the guard, then stopped by the fake browser or a stub: not a refusal.
      }
    }
    expect(refused).toEqual([]);
  });
});
