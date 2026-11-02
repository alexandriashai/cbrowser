/**
 * Do Not Track and Global Privacy Control: off unless asked, and when asked,
 * on the browser's requests and in the page's JS.
 *
 * Measured 2026-11-02 (Alexa: "make sure cbrowser has a dnt option", then
 * "and GPC"): cbrowser had neither. With no option, chromium, firefox and
 * webkit send no DNT and no Sec-GPC. A context's extraHTTPHeaders reach every
 * request type in all three, cross-origin fetch included, with no CORS
 * preflight. The JS does not follow the header (navigator.doNotTrack stayed
 * null / "unspecified" / undefined with DNT: 1 on the wire), so an init script
 * sets navigator.doNotTrack and navigator.globalPrivacyControl.
 *
 * Every check asks the server what arrived, by request type, and the page
 * what navigator says.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const workDir = mkdtempSync(join(tmpdir(), "cb-privacy-signals-"));
const dataDir = join(workDir, "data");
mkdirSync(dataDir);
const startDir = process.cwd();
const startEnv = { ...process.env };
process.chdir(workDir);
process.env.CBROWSER_DATA_DIR = dataDir;
for (const k of ["CBROWSER_DNT", "CBROWSER_GPC"]) delete process.env[k];

const { CBrowser } = await import("../src/browser.js");
const { mergeConfig, privacyFlag, defaultPrivacySignals } = await import("../src/config.js");
const { privacyHeaders, privacyInitScript } = await import("../src/privacy-signals.js");
const { crossBrowserDiff } = await import("../src/visual/cross-browser.js");
const { captureVisualBaseline, runVisualRegression, captureSmartBaseline, runSmartRegression } = await import("../src/visual/regression.js");
const { runAgentReadyAudit } = await import("../src/analysis/agent-ready-audit.js");
const { capturePerformanceBaseline, detectPerformanceRegression } = await import("../src/performance/metrics.js");

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");
const TIMEOUT = 90_000;

/** What a browser sent per path: "DNT/Sec-GPC", "-" for a header it left out. */
const seen = new Map<string, string>();
let server: ReturnType<typeof Bun.serve>;
let other: ReturnType<typeof Bun.serve>;
let base = "";

// One request of each kind: stylesheet, image, script, an iframe behind a
// redirect, same-origin fetch and a cross-origin fetch to a server that allows
// GET from anywhere and answers no preflight (one would fail the fetch). The
// page also sends what its navigator says to /js, so the JS is checked on paths
// where the test cannot evaluate in the page (crossBrowserDiff, the audit, the
// CLI). The title changes once every fetch has answered.
const page = (otherBase: string) => `<!doctype html><html lang="en"><head><title>start</title><link rel="stylesheet" href="/c.css"></head>
<body><h1>Privacy</h1><img src="/i.png" alt=""><iframe src="/r" title="frame"></iframe><script src="/s.js"></script>
<script>const js = encodeURIComponent(JSON.stringify([navigator.doNotTrack, navigator.globalPrivacyControl]));
Promise.all([fetch("/xhr"), fetch("${otherBase}/cross"), fetch("/js?v=" + js)]).then(() => { document.title = "done"; }, (e) => { document.title = "failed " + e; });</script></body></html>`;
const PATHS = ["/", "/c.css", "/i.png", "/s.js", "/r", "/frame", "/xhr", "/cross", "/js"];
const TYPES: Record<string, string> = { "/": "text/html", "/frame": "text/html", "/c.css": "text/css", "/s.js": "text/javascript", "/i.png": "image/png" };

function record(req: Request): void {
  // Only what a browser sent: some tools also fetch the page from Bun.
  if (!/Chrome|Firefox|AppleWebKit/.test(req.headers.get("user-agent") ?? "")) return;
  const url = new URL(req.url);
  seen.set(url.pathname, `${req.headers.get("dnt") ?? "-"}/${req.headers.get("sec-gpc") ?? "-"}`);
  if (url.pathname === "/js") seen.set("navigator", url.searchParams.get("v") ?? "");
}

beforeAll(() => {
  other = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      if (req.method === "OPTIONS") {
        seen.set("preflight", "sent");
        return new Response(null, { status: 204 });
      }
      record(req);
      return new Response("ok", { headers: { "access-control-allow-origin": "*", "content-type": "text/plain" } });
    },
  });
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      record(req);
      const path = new URL(req.url).pathname;
      if (path === "/r") return new Response(null, { status: 302, headers: { location: "/frame" } });
      const body = path === "/" ? page(`http://127.0.0.1:${other.port}`) : path === "/frame" ? "<!doctype html><p>frame</p>" : "";
      return new Response(body, { status: TYPES[path] || path === "/xhr" ? 200 : 404, headers: { "content-type": TYPES[path] ?? "text/plain" } });
    },
  });
  base = `http://127.0.0.1:${server.port}`;
});

afterAll(() => {
  server?.stop(true);
  other?.stop(true);
  process.chdir(startDir);
  for (const k of Object.keys(process.env)) if (!(k in startEnv)) delete process.env[k];
  Object.assign(process.env, startEnv);
  rmSync(workDir, { recursive: true, force: true });
});

/** Run with these env vars set (undefined deletes), then put them back. */
async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T> | T): Promise<T> {
  const before: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    before[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// JSON, so the type shows: "1" is the string DNT uses, true the boolean GPC detection code compares with ===.
const JS_SIGNALS = () => `${JSON.stringify(navigator.doNotTrack)}/${JSON.stringify((navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl)}`;

/** Open the page in a fresh CBrowser and report what each request carried and what navigator says. */
async function visit(config: Record<string, unknown>): Promise<{ headers: Record<string, string>; js: string; preflight: boolean }> {
  seen.clear();
  const b = new CBrowser({ headless: true, persistent: false, ...config });
  try {
    await b.launch();
    await b.navigate(`${base}/`);
    const p = await b.getPage();
    await p.waitForFunction(() => document.title !== "start", null, { timeout: 10_000 });
    expect(await p.title()).toBe("done");
    const js = await p.evaluate(JS_SIGNALS);
    const headers = Object.fromEntries(PATHS.map((path) => [path, seen.get(path) ?? "(not requested)"]));
    return { headers, js, preflight: seen.has("preflight") };
  } finally {
    await b.close();
  }
}

/** Every request type carried exactly this "DNT/Sec-GPC". */
function everyRequest(value: string): Record<string, string> {
  return Object.fromEntries(PATHS.map((path) => [path, value]));
}

test("no ~/.cbrowserrc.json is there to replace the defaults these tests expect", () => {
  expect(existsSync(join(homedir(), ".cbrowserrc.json")) ? `${join(homedir(), ".cbrowserrc.json")} exists` : "none").toBe("none");
});

describe("a privacy signal setting", () => {
  test("takes 1/0, true/false, on/off and yes/no in any case, and blank as unset", () => {
    for (const on of ["1", "true", "TRUE", " on ", "Yes", true]) expect(privacyFlag(on, "X")).toBe(true);
    for (const off of ["0", "false", "Off", "no", false]) expect(privacyFlag(off, "X")).toBe(false);
    for (const unset of [undefined, null, "", "  "]) expect(privacyFlag(unset, "X")).toBeUndefined();
  });

  test("refuses anything else, naming where it came from", () => {
    expect(() => privacyFlag("yes please", "CBROWSER_DNT")).toThrow('CBROWSER_DNT must be 1 or 0 (or true or false), got "yes please"');
    expect(() => privacyFlag(2, "doNotTrack in the config file")).toThrow("doNotTrack in the config file");
  });
});

describe("the signals nothing names", () => {
  test("are both off", () => {
    expect(defaultPrivacySignals(null)).toEqual({ doNotTrack: false, globalPrivacyControl: false });
    expect(privacyHeaders({ doNotTrack: false, globalPrivacyControl: false })).toBeUndefined();
    expect(privacyInitScript({})).toBeUndefined();
  });

  test("the config file turns them on, and CBROWSER_DNT / CBROWSER_GPC beat it both ways", async () => {
    expect(defaultPrivacySignals({ doNotTrack: true, globalPrivacyControl: true })).toEqual({ doNotTrack: true, globalPrivacyControl: true });
    await withEnv({ CBROWSER_DNT: "0", CBROWSER_GPC: "1" }, () => {
      expect(defaultPrivacySignals({ doNotTrack: true, globalPrivacyControl: false })).toEqual({ doNotTrack: false, globalPrivacyControl: true });
    });
  });

  test("a bad env value is refused, not read as off", async () => {
    await withEnv({ CBROWSER_GPC: "maybe" }, () => {
      expect(() => defaultPrivacySignals(null)).toThrow('CBROWSER_GPC must be 1 or 0 (or true or false), got "maybe"');
    });
  });

  test("a CBrowser takes the env, and an explicit setting beats it", async () => {
    await withEnv({ CBROWSER_DNT: "1" }, () => {
      expect(mergeConfig({}).doNotTrack).toBe(true);
      expect(mergeConfig({ doNotTrack: false }).doNotTrack).toBe(false);
      expect(mergeConfig({}).globalPrivacyControl).toBe(false);
    });
  });
});

describe("on the wire and in the page", () => {
  test("off: no request carries either header, and navigator keeps the engine's values", async () => {
    const r = await visit({});
    expect(r.headers).toEqual(everyRequest("-/-"));
    expect(r.js).toBe("null/undefined");
  }, TIMEOUT);

  test("Do Not Track alone: DNT: 1 on every request, cross-origin fetch with no preflight, navigator.doNotTrack \"1\"", async () => {
    const r = await visit({ doNotTrack: true });
    expect(r.headers).toEqual(everyRequest("1/-"));
    expect(r.preflight).toBe(false);
    expect(r.js).toBe('"1"/undefined');
  }, TIMEOUT);

  test("GPC alone: Sec-GPC: 1 on every request, navigator.globalPrivacyControl true", async () => {
    const r = await visit({ globalPrivacyControl: true });
    expect(r.headers).toEqual(everyRequest("-/1"));
    expect(r.preflight).toBe(false);
    expect(r.js).toBe("null/true");
  }, TIMEOUT);

  test("from the env, with no option given", async () => {
    const r = await withEnv({ CBROWSER_DNT: "1", CBROWSER_GPC: "true" }, () => visit({}));
    expect(r.headers).toEqual(everyRequest("1/1"));
    expect(r.js).toBe('"1"/true');
  }, TIMEOUT);

  test("a persistent context (the CLI's default) and a tab opened later carry both", async () => {
    seen.clear();
    const b = new CBrowser({ headless: true, persistent: true, dataDir: join(workDir, "persistent"), doNotTrack: true, globalPrivacyControl: true });
    try {
      await b.launch();
      await b.navigate(`${base}/`);
      const p = await b.getPage();
      await p.waitForFunction(() => document.title === "done", null, { timeout: 10_000 });
      expect(await p.evaluate(JS_SIGNALS)).toBe('"1"/true');
      expect(seen.get("/")).toBe("1/1");
      const tab = await p.context().newPage();
      await tab.goto(`${base}/frame`);
      expect(await tab.evaluate(JS_SIGNALS)).toBe('"1"/true');
    } finally {
      await b.close();
    }
  }, TIMEOUT);

  for (const engine of ["firefox", "webkit"] as const) {
    test(`${engine}: off sends neither, on sends both on every request and in the page`, async () => {
      const off = await visit({ browser: engine });
      expect(off.headers).toEqual(everyRequest("-/-"));
      const on = await visit({ browser: engine, doNotTrack: true, globalPrivacyControl: true });
      expect(on.headers).toEqual(everyRequest("1/1"));
      expect(on.preflight).toBe(false);
      expect(on.js).toBe('"1"/true');
    }, TIMEOUT * 2);
  }
});

describe("the page's view of the signals", () => {
  test("chromium: each getter is named as the engine's are and refuses a receiver that is not a Navigator", async () => {
    const b = new CBrowser({ headless: true, persistent: false, doNotTrack: true, globalPrivacyControl: true });
    try {
      await b.launch();
      await b.navigate(`${base}/frame`);
      const r = await (await b.getPage()).evaluate(() => ["doNotTrack", "globalPrivacyControl"].map((name) => {
        const get = Object.getOwnPropertyDescriptor(Navigator.prototype, name)!.get!;
        let threw = "no";
        try { get.call({}); } catch (e) { threw = (e as Error).constructor.name; }
        return `${get.name}:${threw}`;
      }).join(" "));
      expect(r).toBe("get doNotTrack:TypeError get globalPrivacyControl:TypeError");
    } finally {
      await b.close();
    }
  }, TIMEOUT);
});

describe("a page a service worker controls", () => {
  // A pass-through worker, as Workbox and most PWAs install. Firefox dropped a
  // context's extraHTTPHeaders on everything such a worker handles, while the
  // init script kept navigator saying both signals were on; its own
  // preferences cover it.
  const SW = `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));
self.addEventListener("fetch", (e) => { if (new URL(e.request.url).pathname.startsWith("/via")) e.respondWith(fetch(e.request)); });`;
  const HTML = { headers: { "content-type": "text/html" } };

  test("firefox sends both through the worker, and a persistent profile does not keep them for a run without", async () => {
    const log: string[] = [];
    const sw = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(req) {
        const path = new URL(req.url).pathname;
        log.push(`${path} ${req.headers.get("dnt") ?? "-"}/${req.headers.get("sec-gpc") ?? "-"}`);
        if (path === "/sw.js") return new Response(SW, { headers: { "content-type": "text/javascript" } });
        if (path === "/") {
          return new Response(`<!doctype html><title>start</title><script>navigator.serviceWorker.register("/sw.js");
navigator.serviceWorker.ready.then(() => { document.title = "ready"; });</script>`, HTML);
        }
        return new Response("<!doctype html><title>via</title><p>via", HTML);
      },
    });
    const swBase = base.replace(String(server.port), String(sw.port));
    const dataDir = join(workDir, "firefox-sw");
    try {
      const on = new CBrowser({ browser: "firefox", headless: true, persistent: true, dataDir, doNotTrack: true, globalPrivacyControl: true });
      try {
        await on.launch();
        await on.navigate(`${swBase}/`);
        const p = await on.getPage();
        await p.waitForFunction(() => document.title === "ready", null, { timeout: 15_000 });
        await on.navigate(`${swBase}/via-page`);
        expect(await p.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
        expect(log.filter((l) => l.startsWith("/via-page "))).toEqual(["/via-page 1/1"]);
        expect(await p.evaluate(JS_SIGNALS)).toBe('"1"/true');
      } finally {
        await on.close();
      }
      log.length = 0;
      const off = new CBrowser({ browser: "firefox", headless: true, persistent: true, dataDir });
      try {
        await off.launch();
        await off.navigate(`${swBase}/via-later`);
        expect(log.filter((l) => l.startsWith("/via-later "))).toEqual(["/via-later -/-"]);
        expect(await (await off.getPage()).evaluate(JS_SIGNALS)).toBe('"unspecified"/false');
      } finally {
        await off.close();
      }
    } finally {
      sw.stop(true);
    }
  }, TIMEOUT * 2);
});

describe("pages built outside CBrowser take the same settings", () => {
  test("crossBrowserDiff sends what it is given, else the env, else nothing", async () => {
    seen.clear();
    await crossBrowserDiff(`${base}/`, ["chromium"], { doNotTrack: true });
    expect(seen.get("/")).toBe("1/-");
    expect(seen.get("navigator")).toBe('["1",null]');
    seen.clear();
    await withEnv({ CBROWSER_GPC: "1" }, () => crossBrowserDiff(`${base}/`, ["chromium"]));
    expect(seen.get("/")).toBe("-/1");
    expect(seen.get("navigator")).toBe("[null,true]");
    seen.clear();
    await crossBrowserDiff(`${base}/`, ["chromium"]);
    expect(seen.get("/")).toBe("-/-");
    expect(seen.get("navigator")).toBe("[null,null]");
    // Firefox through its own preferences, as CBrowser does.
    seen.clear();
    await crossBrowserDiff(`${base}/`, ["firefox"], { doNotTrack: true, globalPrivacyControl: true });
    expect(seen.get("/")).toBe("1/1");
    expect(seen.get("navigator")).toBe('["1",true]');
  }, TIMEOUT);

  test("the agent-ready audit's Playwright fallback, when Lightpanda cannot connect", async () => {
    seen.clear();
    await withEnv({ LIGHTPANDA_ENDPOINT: "ws://127.0.0.1:9", LIGHTPANDA_TIMEOUT: "3000", CBROWSER_DNT: "1", CBROWSER_GPC: "1" }, () =>
      runAgentReadyAudit(`${base}/`, { useLightpanda: true, headless: true }));
    expect(seen.get("/")).toBe("1/1");
    expect(seen.get("navigator")).toBe('["1",true]');
  }, TIMEOUT);
});

describe("baselines keep the signals they were captured with", () => {
  test("a performance baseline records what the browser sent, so a regression sends the same", async () => {
    seen.clear();
    const baseline = await withEnv({ CBROWSER_DNT: "1" }, () => capturePerformanceBaseline(`${base}/`, { runs: 1, name: "privacy-perf" }));
    expect(seen.get("/")).toBe("1/-");
    expect(baseline.environment.requested).toMatchObject({ doNotTrack: true, globalPrivacyControl: false });
    seen.clear();
    await withEnv({ CBROWSER_GPC: "1" }, () => detectPerformanceRegression(`${base}/`, "privacy-perf"));
    expect(seen.get("/")).toBe("1/-");
  }, TIMEOUT * 2);

  test("a visual regression sends the baseline's signals, not the current default", async () => {
    const baseline = await withEnv({ CBROWSER_DNT: "1", CBROWSER_GPC: "1" }, () => captureVisualBaseline(`${base}/`, "privacy-baseline"));
    expect(baseline).toMatchObject({ doNotTrack: true, globalPrivacyControl: true });
    seen.clear();
    await runVisualRegression(`${base}/`, "privacy-baseline");
    expect(seen.get("/")).toBe("1/1");
  }, TIMEOUT);

  test("a smart regression does too", async () => {
    const baseline = await withEnv({ CBROWSER_GPC: "1" }, () =>
      captureSmartBaseline(`${base}/`, "privacy-smart", { numCaptures: 2, captureDelay: 100 }));
    expect(baseline).toMatchObject({ doNotTrack: false, globalPrivacyControl: true });
    seen.clear();
    await withEnv({ CBROWSER_DNT: "1" }, () => runSmartRegression(`${base}/`, "privacy-smart"));
    expect(seen.get("/")).toBe("-/1");
  }, TIMEOUT * 2);
});

describe("the CLI's --dnt and --gpc", () => {
  async function cli(env: Record<string, string>, ...args: string[]): Promise<{ code: number; stderr: string }> {
    const proc = Bun.spawn(["bun", "run", CLI, ...args], {
      cwd: workDir,
      env: { ...process.env, CBROWSER_DATA_DIR: join(workDir, "cli-data"), ...env },
      stdout: "ignore",
      stderr: "pipe",
    });
    const stderr = await new Response(proc.stderr).text();
    return { code: await proc.exited, stderr };
  }

  test("reach a command that builds its own browser (diff)", async () => {
    seen.clear();
    const r = await cli({}, "diff", `${base}/`, "--browsers", "chromium", "--dnt", "--gpc");
    expect(r.code, r.stderr).toBe(0);
    expect(seen.get("/")).toBe("1/1");
    expect(seen.get("navigator")).toBe('["1",true]');
  }, TIMEOUT);

  test("take no value, so the next word stays the URL", async () => {
    seen.clear();
    const r = await cli({}, "navigate", "--dnt", `${base}/`, "--no-persistent");
    expect(r.code, r.stderr).toBe(0);
    expect(seen.get("/")).toBe("1/-");
  }, TIMEOUT);

  test("--no-dnt beats CBROWSER_DNT=1", async () => {
    seen.clear();
    const r = await cli({ CBROWSER_DNT: "1" }, "diff", `${base}/`, "--browsers", "chromium", "--no-dnt");
    expect(r.code, r.stderr).toBe(0);
    expect(seen.get("/")).toBe("-/-");
  }, TIMEOUT);

  test("a bad env var stops a command that opens a browser, not one that opens none (doctor)", async () => {
    const r = await cli({ CBROWSER_DNT: "yes please" }, "doctor");
    expect(r.stderr).not.toContain("CBROWSER_DNT must be");
  }, TIMEOUT);

  test("commands that replay a baseline refuse them, naming why, as they refuse --device", async () => {
    for (const [args, flag] of [
      [["perf-regression", `${base}/`, "no-such-baseline", "--dnt"], "--dnt (or --no-dnt)"],
      [["ai-visual", "test", `${base}/`, "no-such-baseline", "--no-gpc"], "--gpc (or --no-gpc)"],
    ] as const) {
      const r = await cli({}, ...args);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain(`cannot take ${flag}`);
      expect(r.stderr).toContain("baseline");
    }
  }, TIMEOUT);

  test("--no-dnt=true turns it off and --no-dnt=false on, as --no-dnt and --dnt do", async () => {
    seen.clear();
    const off = await cli({ CBROWSER_DNT: "1" }, "diff", `${base}/`, "--browsers", "chromium", "--no-dnt=true");
    expect(off.code, off.stderr).toBe(0);
    expect(seen.get("/")).toBe("-/-");
    seen.clear();
    const on = await cli({}, "diff", `${base}/`, "--browsers", "chromium", "--no-dnt=false");
    expect(on.code, on.stderr).toBe(0);
    expect(seen.get("/")).toBe("1/-");
  }, TIMEOUT);

  test("refuse a value that is not 1 or 0, and a bad env var, before a browser opens", async () => {
    for (const [env, args, message] of [
      [{}, ["--dnt=maybe"], '--dnt must be 1 or 0 (or true or false), got "maybe"'],
      [{}, ["--gpc="], "--gpc=<value> must be 1 or 0"],
      [{ CBROWSER_GPC: "yes please" }, [], 'CBROWSER_GPC must be 1 or 0 (or true or false), got "yes please"'],
    ] as const) {
      seen.clear();
      const r = await cli({ ...env }, "diff", `${base}/`, "--browsers", "chromium", ...args);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain(message);
      expect(seen.size).toBe(0);
    }
  }, TIMEOUT);
});
