/**
 * Color scheme: `--color-scheme` on the CLI and `colorScheme` on the MCP tools
 * (Alexa, 2026-10-28: "add a color schema flag to Cbrowser", then "also add to
 * mcp tools").
 *
 * The engine already read CBROWSER_COLOR_SCHEME and the config file, but no
 * flag set it, the daemon could not start with it and no MCP tool took it, so
 * a hosted caller had no way to see a site's dark theme. Every check here asks
 * the page itself: matchMedia('(prefers-color-scheme: dark)').
 *
 * The CLI subprocess harness is the one in cli-device.test.ts; its comments
 * explain the exit-code file.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { serveFixtures } from "./fixtures/serve-fixtures.js";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-color-scheme-"));

const { CBrowser } = await import("../src/browser.js");
const { registerNavigationTools } = await import("../src/mcp-tools/base/navigation-tools.js");
const { registerAllPublicTools } = await import("../src/mcp-tools/index.js");

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");
const TIMEOUT = 60_000;
const DARK = "matchMedia('(prefers-color-scheme: dark)').matches";
const LIGHT = "matchMedia('(prefers-color-scheme: light)').matches";

type Result = { isError?: boolean; content: Array<{ type: string; text: string }> };
type Handler = (args: Record<string, unknown>) => Promise<Result>;

let fixtures: Awaited<ReturnType<typeof serveFixtures>>;
let page = "";
let dataDir = "";
let runSeq = 0;

interface RunResult { code: number; stdout: string; stderr: string }

/** Env for the next cli() calls; CBROWSER_COLOR_SCHEME is cleared unless set here. */
let schemeEnv = "";

async function cli(dir: string, ...args: string[]): Promise<RunResult> {
  const n = runSeq++;
  const outPath = join(dir, `out-${n}.txt`);
  const errPath = join(dir, `err-${n}.txt`);
  const codePath = join(dir, `code-${n}.txt`);
  const proc = Bun.spawn(
    ["bash", "-c", 'bun run "$0" "$@" > "$CB_OUT" 2> "$CB_ERR"; c=$?; echo $c > "$CB_CODE"; exit $c', CLI, ...args],
    {
      env: { ...process.env, CBROWSER_DATA_DIR: dir, CBROWSER_COLOR_SCHEME: schemeEnv, CB_OUT: outPath, CB_ERR: errPath, CB_CODE: codePath },
      stdout: "ignore",
      stderr: "ignore",
    },
  );
  const fromFile = (async () => {
    for (let i = 0; i < 1800; i++) {
      if (existsSync(codePath)) {
        const raw = readFileSync(codePath, "utf8").trim();
        if (raw) return Number(raw);
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`cli never reported an exit code: ${args.join(" ")}`);
  })();
  const code = await Promise.race([proc.exited, fromFile]);
  return {
    code,
    stdout: existsSync(outPath) ? readFileSync(outPath, "utf8") : "",
    stderr: existsSync(errPath) ? readFileSync(errPath, "utf8") : "",
  };
}

const lastLine = (s: string): string => s.trim().split("\n").pop() ?? "";
const body = (r: Result) => JSON.parse(r.content.find((c) => c.type === "text")!.text);

beforeAll(async () => {
  fixtures = await serveFixtures();
  page = `${fixtures.base}color-scheme.html`;
  dataDir = mkdtempSync(join(tmpdir(), "cb-color-scheme-cli-"));
});

afterAll(async () => {
  await fixtures.close();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe("cbrowser --color-scheme", () => {
  test("dark makes the page match prefers-color-scheme: dark; no flag does not", async () => {
    const dark = await cli(dataDir, "evaluate", DARK, "--url", page, "--color-scheme", "dark", "--raw", "--force", "--no-persistent");
    expect(dark.code, dark.stderr).toBe(0);
    expect(lastLine(dark.stdout)).toBe("true");
    const none = await cli(dataDir, "evaluate", DARK, "--url", page, "--raw", "--force", "--no-persistent");
    expect(none.code, none.stderr).toBe(0);
    expect(lastLine(none.stdout)).toBe("false");
  }, TIMEOUT * 2);

  test("light matches light and not dark; --flag=value works", async () => {
    const light = await cli(dataDir, "evaluate", LIGHT, "--url", page, "--color-scheme=light", "--raw", "--force", "--no-persistent");
    expect(light.code, light.stderr).toBe(0);
    expect(lastLine(light.stdout)).toBe("true");
  }, TIMEOUT);

  test("an unknown scheme exits 1 naming the values, before a browser launches", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cb-color-scheme-bad-"));
    try {
      for (const bad of [["--color-scheme", "purple"], ["--color-scheme"]]) {
        const r = await cli(dir, "navigate", page, ...bad);
        expect(r.code).toBe(1);
        expect(r.stderr).toContain("--color-scheme must be light, dark or no-preference");
      }
      expect(existsSync(join(dir, "browser-state"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT);

  test("the flag wins over CBROWSER_COLOR_SCHEME and the config file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cb-color-scheme-config-"));
    try {
      writeFileSync(join(dir, "config.json"), JSON.stringify({ colorScheme: "light" }));
      const fromConfig = await cli(dir, "evaluate", LIGHT, "--url", page, "--raw", "--force", "--no-persistent");
      expect(lastLine(fromConfig.stdout), fromConfig.stderr).toBe("true");
      const overConfig = await cli(dir, "evaluate", DARK, "--url", page, "--color-scheme", "dark", "--raw", "--force", "--no-persistent");
      expect(lastLine(overConfig.stdout), overConfig.stderr).toBe("true");
      schemeEnv = "light";
      const overEnv = await cli(dir, "evaluate", DARK, "--url", page, "--color-scheme", "dark", "--raw", "--force", "--no-persistent");
      expect(lastLine(overEnv.stdout), overEnv.stderr).toBe("true");
    } finally {
      schemeEnv = "";
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT * 2);

  test("a command whose library function launches its own browser gets the scheme", async () => {
    // ai-visual capture hands off to captureVisualBaseline, which builds its
    // own CBrowser; the baseline records the scheme it rendered with.
    const r = await cli(dataDir, "ai-visual", "capture", page, "--name", "scheme-check", "--color-scheme", "dark", "--no-persistent");
    expect(r.code, r.stdout + r.stderr).toBe(0);
    const index = JSON.parse(readFileSync(join(dataDir, "visual-baselines", "baselines.json"), "utf8"));
    const baseline = index.baselines.find((b: { name: string }) => b.name === "scheme-check");
    expect(baseline.colorScheme).toBe("dark");
  }, TIMEOUT);

  test("test-suite builds its browser with the scheme", async () => {
    const r = await cli(dataDir, "test-suite", "--inline", `go to ${page} ; verify page contains "scheme: dark"`, "--color-scheme", "dark", "--no-persistent");
    expect(r.code, r.stdout + r.stderr).toBe(0);
  }, TIMEOUT);
});

describe("CBrowser.setColorScheme on a live browser", () => {
  test("switches the open page without a reload, and pages opened later follow it", async () => {
    const b = new CBrowser({ headless: true, persistent: false });
    try {
      await b.navigate(page);
      const p = await b.getPage();
      await p.evaluate(() => { (window as unknown as { marker: number }).marker = 42; });
      expect(await p.evaluate(DARK)).toBe(false);

      await b.setColorScheme("dark");
      expect(await p.evaluate(DARK)).toBe(true);
      // Same document: a reload or relaunch would have dropped the marker.
      expect(await p.evaluate(() => (window as unknown as { marker: number }).marker)).toBe(42);

      const second = await p.context().newPage();
      await second.goto(page);
      expect(await second.textContent("#scheme")).toBe("scheme: dark");
      await second.close();

      await b.setColorScheme("light");
      expect(await p.evaluate(DARK)).toBe(false);
      expect(await p.evaluate(LIGHT)).toBe(true);
    } finally {
      await b.close();
    }
  }, TIMEOUT);

  test("a scheme set before launch applies at launch", async () => {
    const b = new CBrowser({ headless: true, persistent: false });
    try {
      await b.setColorScheme("dark");
      await b.navigate(page);
      expect(await (await b.getPage()).evaluate(DARK)).toBe(true);
    } finally {
      await b.close();
    }
  }, TIMEOUT);
});

describe("MCP navigate colorScheme", () => {
  const sessions = new Map<string, InstanceType<typeof CBrowser>>();
  const handlers: Record<string, Handler> = {};
  const schemas: Record<string, Record<string, z.ZodTypeAny>> = {};
  let n = 0;

  beforeAll(() => {
    registerNavigationTools({
      registerTool: (name: string, cfg: { inputSchema: Record<string, z.ZodTypeAny> }, h: Handler) => { handlers[name] = h; schemas[name] = cfg.inputSchema; },
      tool: () => {}, registerResource: () => {}, resource: () => {},
    } as never, {
      getBrowser: async () => { throw new Error("hosted shape: tokens only"); },
      getBrowserByToken: async (token?: string) => {
        if (token) return { browser: sessions.get(token)!, token };
        const t = `cb_test_${++n}`;
        sessions.set(t, new CBrowser({ headless: true, persistent: false }));
        return { browser: sessions.get(t)!, token: t };
      },
    } as never);
  });

  afterAll(async () => {
    for (const b of sessions.values()) await b.close().catch(() => {});
  });

  test("a new session renders dark and says so", async () => {
    const out = body(await handlers.navigate({ url: page, colorScheme: "dark" }));
    expect(out.colorScheme).toBe("dark");
    const p = await sessions.get(out._browserToken)!.getPage();
    expect(await p.textContent("#scheme")).toBe("scheme: dark");
  }, TIMEOUT);

  test("an existing session switches without being relaunched", async () => {
    const first = body(await handlers.navigate({ url: page }));
    const session = sessions.get(first._browserToken)!;
    const contextBefore = (await session.getPage()).context();
    const r = await handlers.navigate({ url: page, colorScheme: "dark", _browserToken: first._browserToken });
    expect(r.isError).not.toBe(true);
    const out = body(r);
    expect(out._browserToken).toBe(first._browserToken);
    expect(out.colorScheme).toBe("dark");
    const p = await session.getPage();
    expect(p.context()).toBe(contextBefore);
    expect(await p.textContent("#scheme")).toBe("scheme: dark");
  }, TIMEOUT);

  test("the schema refuses an unknown scheme", () => {
    const shape = z.object(schemas.navigate);
    expect(shape.safeParse({ url: page, colorScheme: "purple" }).success).toBe(false);
    expect(shape.safeParse({ url: page, colorScheme: "no-preference" }).success).toBe(true);
  });
});

describe("an MCP tool with its own browser renders in the scheme", () => {
  test("visual_baseline captures the page dark, and records it so a regression renders dark too", async () => {
    const { registerVisualTestingTools } = await import("../src/mcp-tools/base/visual-testing-tools.js");
    const sharp = (await import("sharp")).default;
    const handlers: Record<string, Handler> = {};
    registerVisualTestingTools({
      registerTool: (name: string, _cfg: unknown, h: Handler) => { handlers[name] = h; },
      tool: () => {}, registerResource: () => {}, resource: () => {},
    } as never, { getBrowser: async () => { throw new Error("visual_baseline builds its own"); } } as never);

    // Mean brightness of the capture: the fixture's body is #000 in dark, #fff in light.
    const brightness = async (path: string) => (await sharp(path).greyscale().stats()).channels[0].mean;
    const dark = body(await handlers.visual_baseline({ url: page, name: "scheme-dark", captures: 2, delay: 100, colorScheme: "dark" }));
    expect(dark.colorScheme).toBe("dark");
    expect(await brightness(dark.reference)).toBeLessThan(40);
    const light = body(await handlers.visual_baseline({ url: page, name: "scheme-light", captures: 2, delay: 100 }));
    expect(light.colorScheme).toBeUndefined();
    expect(await brightness(light.reference)).toBeGreaterThan(215);

    // The regression takes no colorScheme: it renders with the baseline's, so
    // the dark baseline matches a dark render instead of failing on a light one.
    const regression = body(await handlers.visual_regression({ url: page, baselineName: "scheme-dark" }));
    expect(regression.mode).toBe("smart");
    expect(regression.passed).toBe(true);
  }, TIMEOUT * 3);
});

describe("every MCP tool that sets up rendering takes colorScheme", () => {
  test("each registered tool with a device parameter also has colorScheme, and it validates", () => {
    const schemas: Record<string, Record<string, z.ZodTypeAny>> = {};
    registerAllPublicTools({
      registerTool: (name: string, cfg: { inputSchema?: Record<string, z.ZodTypeAny> }) => { schemas[name] = cfg.inputSchema ?? {}; },
      tool: () => {}, registerResource: () => {}, resource: () => {},
    } as never, { getBrowser: async () => { throw new Error("not called"); } } as never, null);

    const withDevice = Object.keys(schemas).filter((t) => "device" in schemas[t]).sort();
    // Guard against a vacuous pass: on 2026-10-28 the class was navigate,
    // capture_start, visual_baseline, attention_analysis, agent_ready_audit,
    // empathy_audit, site_cognitive_assessment, visual_cognitive_story and
    // journey_heatmap_gif.
    expect(withDevice.length).toBeGreaterThanOrEqual(9);
    const missing = withDevice.filter((t) => !("colorScheme" in schemas[t]));
    expect(missing).toEqual([]);
    for (const t of withDevice) {
      const field = schemas[t].colorScheme;
      expect(field.safeParse("dark").success, t).toBe(true);
      expect(field.safeParse(undefined).success, t).toBe(true);
      expect(field.safeParse("purple").success, t).toBe(false);
    }
  });
});
