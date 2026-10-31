/**
 * Accept-Language: sent on every request, the same value on every request and
 * in the page, and the host's language (else en-US) when nothing names one.
 *
 * Measured 2026-10-31 (Alexa: "does cbrowser have appropriate headers when
 * visiting sites so pages render properly", then "fix the locale first"). With
 * no locale configured, which is the CLI default and every hosted server's,
 * Chromium sent no Accept-Language on any request, while its page took the
 * host's language (navigator.language "de" under LANG=de_DE.UTF-8, "en-US"
 * under LANG=C.UTF-8). A site that picks its language from the header then
 * served a page no real browser gets: mozilla.org answered with its language
 * picker (200) instead of redirecting to /en-US/. Firefox sent
 * "en-US,en;q=0.9" and WebKit "en-US", whatever the host. With a locale,
 * Firefox and WebKit sent a hand-built "fr-FR,fr;q=0.9,en;q=0.5" everywhere,
 * Chromium only on subresources and fetch.
 *
 * Every check asks the server what arrived, by request type, and the page what
 * navigator.language says. The process's cwd and host locale are set here,
 * because loadConfigFile reads the cwd and the default now follows LANGUAGE /
 * LC_ALL / LC_MESSAGES / LANG. loadConfigFile also reads ~/.cbrowserrc.json,
 * and Bun's homedir() ignores a changed HOME, so that file cannot be moved
 * aside here: the first test fails, naming it, when it exists.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const workDir = mkdtempSync(join(tmpdir(), "cb-accept-language-"));
const dataDir = join(workDir, "data");
mkdirSync(dataDir);
const startDir = process.cwd();
const startEnv = { ...process.env };
process.chdir(workDir);
process.env.CBROWSER_DATA_DIR = dataDir;
for (const k of ["CBROWSER_LOCALE", "LANGUAGE", "LC_ALL", "LC_MESSAGES"]) delete process.env[k];
process.env.LANG = "C.UTF-8";
const HOST_ENV = { LANG: "C.UTF-8" } as const;

const { CBrowser } = await import("../src/browser.js");
const { mergeConfig, defaultLocale, hostLocale, localeTag } = await import("../src/config.js");
const { crossBrowserDiff } = await import("../src/visual/cross-browser.js");
const { captureVisualBaseline, runVisualRegression } = await import("../src/visual/regression.js");
const { runAgentReadyAudit } = await import("../src/analysis/agent-ready-audit.js");
const { capturePerformanceBaseline } = await import("../src/performance/metrics.js");

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");
const TIMEOUT = 90_000;

/** Last Accept-Language a browser sent per path; null when it sent none. */
const seen = new Map<string, string | null>();
let server: ReturnType<typeof Bun.serve>;
let base = "";

// A document that makes one request of each kind: stylesheet, image, script,
// iframe document and fetch. The title changes once the fetch has answered, so
// the test knows every request has arrived.
const PAGE = `<!doctype html><html lang="en"><head><title>start</title><link rel="stylesheet" href="/c.css"></head>
<body><h1>Locale</h1><img src="/i.png" alt=""><iframe src="/frame" title="frame"></iframe><script src="/s.js"></script>
<script>fetch("/xhr").then(() => { document.title = "done"; });</script></body></html>`;
const PATHS = ["/", "/c.css", "/i.png", "/s.js", "/frame", "/xhr"];
const TYPES: Record<string, string> = { "/": "text/html", "/frame": "text/html", "/c.css": "text/css", "/s.js": "text/javascript", "/i.png": "image/png" };

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const path = new URL(req.url).pathname;
      // Only what a browser sent: some tools also fetch the page from Bun.
      if (/Chrome|Firefox|AppleWebKit/.test(req.headers.get("user-agent") ?? "")) {
        seen.set(path, req.headers.get("accept-language"));
      }
      const body = path === "/" ? PAGE : path === "/frame" ? "<!doctype html><p>frame</p>" : "";
      return new Response(body, { status: TYPES[path] || path === "/xhr" ? 200 : 404, headers: { "content-type": TYPES[path] ?? "text/plain" } });
    },
  });
  base = `http://127.0.0.1:${server.port}`;
});

afterAll(() => {
  server?.stop(true);
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

/** Open the page in a fresh CBrowser and report what each request carried. */
async function visit(config: Record<string, unknown>): Promise<{ headers: Record<string, string | null>; language: string }> {
  seen.clear();
  const b = new CBrowser({ headless: true, persistent: false, ...config });
  try {
    await b.launch();
    await b.navigate(`${base}/`);
    const page = await b.getPage();
    await page.waitForFunction(() => document.title === "done", null, { timeout: 10_000 });
    const language = await page.evaluate(() => navigator.language);
    const headers = Object.fromEntries(PATHS.map((p) => [p, seen.has(p) ? seen.get(p)! : "(not requested)"]));
    return { headers, language };
  } finally {
    await b.close();
  }
}

/** Every request type carried exactly this value. */
function everyRequest(value: string): Record<string, string> {
  return Object.fromEntries(PATHS.map((p) => [p, value]));
}

test("no ~/.cbrowserrc.json is there to replace the defaults these tests expect", () => {
  expect(existsSync(join(homedir(), ".cbrowserrc.json")) ? `${join(homedir(), ".cbrowserrc.json")} exists` : "none").toBe("none");
});

describe("the host's language, read as Chromium reads it", () => {
  test("LANG, with the codeset and modifier dropped", () => {
    expect(hostLocale({ LANG: "de_DE.UTF-8" })).toBe("de-DE");
    expect(hostLocale({ LANG: "pt_BR" })).toBe("pt-BR");
    expect(hostLocale({ LANG: "sr_RS@latin" })).toBe("sr-RS");
    expect(hostLocale({ LANG: "fr" })).toBe("fr");
  });

  test("LC_ALL, then LC_MESSAGES, beat LANG, and LANGUAGE beats them all, even with LANG=C", () => {
    expect(hostLocale({ LANG: "de_DE.UTF-8", LC_ALL: "fr_FR.UTF-8" })).toBe("fr-FR");
    expect(hostLocale({ LANG: "de_DE.UTF-8", LC_MESSAGES: "fr_FR.UTF-8" })).toBe("fr-FR");
    expect(hostLocale({ LANG: "de_DE.UTF-8", LC_ALL: "fr_FR.UTF-8", LANGUAGE: "ja:en" })).toBe("ja");
    expect(hostLocale({ LANG: "C.UTF-8", LANGUAGE: "de" })).toBe("de");
  });

  test("names nothing for C, POSIX, unset, a glibc alias or a value that is no language tag", () => {
    // "german" and "french" are glibc aliases (/etc/locale.alias). BCP 47
    // allows a 5-8 letter language, so Intl takes them, and Chromium then
    // refused every context: "Invalid locale name".
    for (const LANG of ["C", "C.UTF-8", "c.utf8", "POSIX", "", "  ", "not a tag!", "german", "french", "x-private"]) {
      expect(hostLocale({ LANG })).toBeUndefined();
    }
    expect(hostLocale({})).toBeUndefined();
  });

  test("an entry that names no language is skipped, as Chromium skips it", () => {
    expect(hostLocale({ LANGUAGE: "C:de", LANG: "C.UTF-8" })).toBe("de");
    expect(hostLocale({ LANGUAGE: ":de" })).toBe("de");
    expect(hostLocale({ LANGUAGE: " ", LANG: "de_DE.UTF-8" })).toBe("de-DE");
    expect(hostLocale({ LC_ALL: "C", LANG: "de_DE.UTF-8" })).toBe("de-DE");
    expect(hostLocale({ LANGUAGE: "norwegian", LANG: "nb_NO.UTF-8" })).toBe("nb-NO");
    expect(hostLocale({ LANG: "german", LC_MESSAGES: "C" })).toBeUndefined();
  });

  test("localeTag takes the POSIX spelling and refuses what the engines refuse", () => {
    expect(localeTag("en_US")).toBe("en-US");
    expect(localeTag("de_DE.UTF-8")).toBe("de-DE");
    expect(localeTag("en-us")).toBe("en-US");
    for (const bad of ["german", "english", "posix", "x-private", "", undefined]) expect(localeTag(bad)).toBeUndefined();
  });
});

describe("the locale nothing names", () => {
  test("is en-US on a host that names no language", () => {
    expect(defaultLocale()).toBe("en-US");
    expect(mergeConfig({}).locale).toBe("en-US");
  });

  test("is the host's when it names one", async () => {
    await withEnv({ LANG: "de_DE.UTF-8" }, () => {
      expect(mergeConfig({}).locale).toBe("de-DE");
    });
  });

  test("a config file's beats the host's, and CBROWSER_LOCALE beats the file", async () => {
    const file = join(dataDir, "config.json");
    writeFileSync(file, JSON.stringify({ locale: "ja-JP" }));
    try {
      await withEnv({ LANG: "de_DE.UTF-8" }, async () => {
        expect(mergeConfig({}).locale).toBe("ja-JP");
        await withEnv({ CBROWSER_LOCALE: "fr-FR" }, () => {
          expect(mergeConfig({}).locale).toBe("fr-FR");
        });
      });
    } finally {
      rmSync(file, { force: true });
    }
  });
});

describe("Accept-Language on the wire", () => {
  test("with no locale configured, every request says en-US, and so does the page", async () => {
    const { headers, language } = await visit({});
    expect(headers).toEqual(everyRequest("en-US"));
    expect(language).toBe("en-US");
  }, TIMEOUT);

  test("on a host whose LANG is a glibc alias, the browser still launches, in en-US", async () => {
    for (const browser of ["chromium", "webkit"]) {
      const { headers, language } = await withEnv({ LANG: "german" }, () => visit({ browser }));
      expect(headers).toEqual(everyRequest("en-US"));
      expect(language).toBe("en-US");
    }
  }, TIMEOUT);

  test("on a German host, every request and the page say de-DE", async () => {
    const { headers, language } = await withEnv({ LANG: "de_DE.UTF-8" }, () => visit({}));
    expect(headers).toEqual(everyRequest("de-DE"));
    expect(language).toBe("de-DE");
  }, TIMEOUT);

  test("a configured locale reaches every request unchanged", async () => {
    const { headers, language } = await visit({ locale: "fr-FR" });
    expect(headers).toEqual(everyRequest("fr-FR"));
    expect(language).toBe("fr-FR");
  }, TIMEOUT);

  test("an empty locale counts as unset, not as no header", async () => {
    const { headers, language } = await visit({ locale: "" });
    expect(headers).toEqual(everyRequest("en-US"));
    expect(language).toBe("en-US");
  }, TIMEOUT);

  for (const engine of ["firefox", "webkit"] as const) {
    test(`${engine}: the default, a German host and a configured locale reach every request`, async () => {
      expect((await visit({ browser: engine })).headers).toEqual(everyRequest("en-US"));
      const german = await withEnv({ LANG: "de_DE.UTF-8" }, () => visit({ browser: engine }));
      expect(german.headers).toEqual(everyRequest("de-DE"));
      expect(german.language).toBe("de-DE");
      const french = await visit({ browser: engine, locale: "fr-FR" });
      expect(french.headers).toEqual(everyRequest("fr-FR"));
      expect(french.language).toBe("fr-FR");
    }, TIMEOUT);
  }
});

describe("pages built outside CBrowser take the same default", () => {
  test("crossBrowserDiff sends the locale it is given, CBROWSER_LOCALE when set, the host's otherwise", async () => {
    seen.clear();
    await crossBrowserDiff(`${base}/`, ["chromium"], { locale: "de-DE" });
    expect(seen.get("/")).toBe("de-DE");
    seen.clear();
    await withEnv({ CBROWSER_LOCALE: "fr-FR" }, () => crossBrowserDiff(`${base}/`, ["chromium"]));
    expect(seen.get("/")).toBe("fr-FR");
    seen.clear();
    await crossBrowserDiff(`${base}/`, ["chromium"]);
    expect(seen.get("/")).toBe("en-US");
  }, TIMEOUT);

  test("the agent-ready audit's Playwright fallback, when Lightpanda cannot connect", async () => {
    seen.clear();
    await withEnv({ LIGHTPANDA_ENDPOINT: "ws://127.0.0.1:9", LIGHTPANDA_TIMEOUT: "3000", CBROWSER_LOCALE: "fr-FR" }, () =>
      runAgentReadyAudit(`${base}/`, { useLightpanda: true, headless: true }));
    expect(seen.get("/")).toBe("fr-FR");
  }, TIMEOUT);
});

describe("a performance baseline takes the locale it is given", () => {
  test("and records it, so a regression renders the same page", async () => {
    seen.clear();
    const baseline = await capturePerformanceBaseline(`${base}/`, { runs: 1, name: "locale-perf", locale: "fr-FR" });
    expect(seen.get("/")).toBe("fr-FR");
    expect(baseline.environment.requested?.locale).toBe("fr-FR");
  }, TIMEOUT);
});

describe("visual baselines keep the locale they were captured in", () => {
  test("a regression run renders in the baseline's locale, not the current default", async () => {
    const baseline = await withEnv({ CBROWSER_LOCALE: "fr-FR" }, () => captureVisualBaseline(`${base}/`, "locale-baseline"));
    expect(baseline.locale).toBe("fr-FR");
    seen.clear();
    await runVisualRegression(`${base}/`, "locale-baseline");
    expect(seen.get("/")).toBe("fr-FR");
  }, TIMEOUT);
});

describe("the CLI's --locale", () => {
  async function cli(...args: string[]): Promise<{ code: number; stderr: string }> {
    const proc = Bun.spawn(["bun", "run", CLI, ...args], {
      cwd: workDir,
      env: { ...process.env, ...HOST_ENV, CBROWSER_DATA_DIR: join(workDir, "cli-data") },
      stdout: "ignore",
      stderr: "pipe",
    });
    const stderr = await new Response(proc.stderr).text();
    return { code: await proc.exited, stderr };
  }

  test("reaches a command that builds its own browser (diff)", async () => {
    seen.clear();
    const r = await cli("diff", `${base}/`, "--browsers", "chromium", "--locale", "fr-FR");
    expect(r.code).toBe(0);
    expect(seen.get("/")).toBe("fr-FR");
  }, TIMEOUT);

  test("takes the POSIX spelling (fr_FR) as the tag it means", async () => {
    seen.clear();
    const r = await cli("diff", `${base}/`, "--browsers", "chromium", "--locale", "fr_FR");
    expect(r.code).toBe(0);
    expect(seen.get("/")).toBe("fr-FR");
  }, TIMEOUT);

  test("refuses no value, an empty value and a value that is no language tag, before a browser opens", async () => {
    for (const bad of [["--locale"], ["--locale="], ["--locale", "not a tag!"], ["--locale", "german"]]) {
      seen.clear();
      const r = await cli("diff", `${base}/`, "--browsers", "chromium", ...bad);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("--locale must be a language tag");
      expect(seen.size).toBe(0);
    }
  }, TIMEOUT);
});
