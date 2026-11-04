/**
 * userTimezone and userLocation reach the page they describe.
 *
 * Through 21.4.0 cognitive_effort read neither: it measured in the server's own
 * time zone with no geolocation and echoed both back in userContext as if they
 * had been used. site_cognitive_assessment set the time zone on the browser it
 * opened, dropped it on a session, and only echoed the location (2026-11-04,
 * Alexa: "fix userLocation and userTimezone too").
 *
 * The page reports what its own browser says, Intl's time zone and
 * navigator.geolocation, to the local server that served it, so each check
 * reads the browser, not the tool's account of it.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workDir = mkdtempSync(join(tmpdir(), "cb-user-context-"));
process.env.CBROWSER_DATA_DIR = join(workDir, "data");
process.env.CBROWSER_ARTIFACT_DIR = join(workDir, "artifacts");
for (const k of ["ANTHROPIC_API_KEY", "CBROWSER_GEO_REGION", "CBROWSER_PROXY", "CBROWSER_PROXY_SERVER", "IPROYAL_USERNAME", "IPROYAL_PASSWORD"]) delete process.env[k];

const { CBrowser } = await import("../src/browser.js");
const { registerPersonaComparisonTools } = await import("../src/mcp-tools/base/persona-comparison-tools.js");
const { registerAuditTools } = await import("../src/mcp-tools/base/audit-tools.js");
const { parseUserLocation, isTimeZone } = await import("../src/mcp-tools/browser-setup.js");

type Result = { isError?: boolean; content: Array<{ type: string; text?: string }> };
type Handler = (args: Record<string, unknown>, extra?: unknown) => Promise<Result>;

const PAGE_HTML = `<!doctype html><html lang="en"><title>start</title><p>Where and when is this page?</p>
<script>
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const report = (geo) => fetch("/report?tz=" + encodeURIComponent(tz) + "&geo=" + encodeURIComponent(geo))
  .then(() => { document.body.dataset.reported = "1"; });
navigator.permissions.query({ name: "geolocation" }).then((p) => {
  if (p.state !== "granted") return report("not-granted");
  navigator.geolocation.getCurrentPosition((pos) => report(pos.coords.latitude + "," + pos.coords.longitude), () => report("error"), { timeout: 3000 });
}).catch(() => report("error"));
</script></html>`;

/** What each page load reported, and every request the server saw. */
const reports: Array<{ tz: string; geo: string }> = [];
const requests: string[] = [];
let server: ReturnType<typeof Bun.serve>;
let PAGE = "";
const WAIT = "body[data-reported]";

beforeAll(() => {
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const u = new URL(req.url);
      requests.push(u.pathname);
      if (u.pathname === "/report") {
        reports.push({ tz: u.searchParams.get("tz") ?? "", geo: u.searchParams.get("geo") ?? "" });
        return new Response("ok");
      }
      if (u.pathname === "/") return new Response(PAGE_HTML, { headers: { "content-type": "text/html" } });
      return new Response("", { status: 404 });
    },
  });
  PAGE = `http://127.0.0.1:${server.port}/`;
});

afterAll(() => {
  server?.stop(true);
  rmSync(workDir, { recursive: true, force: true });
});

/** cognitive_effort with a session browser that is set up with nothing, and how often it was handed out. */
async function withEffort<T>(fn: (effort: Handler, sessionUses: () => number) => Promise<T>): Promise<T> {
  const handlers: Record<string, Handler> = {};
  let session: InstanceType<typeof CBrowser> | undefined;
  let uses = 0;
  const getBrowser = async () => { uses++; return (session ??= new CBrowser({ headless: true, persistent: false })); };
  registerPersonaComparisonTools({
    registerTool: (name: string, _c: unknown, h: Handler) => { handlers[name] = h; },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  } as never, { getBrowser, getBrowserByToken: async (t?: string) => ({ browser: await getBrowser(), token: t ?? "session" }) } as never);
  try {
    return await fn(handlers.cognitive_effort, () => uses);
  } finally {
    await session?.close();
  }
}

function assessment(): Handler {
  const handlers: Record<string, Handler> = {};
  registerAuditTools({ registerTool: (name: string, _c: unknown, h: Handler) => { handlers[name] = h; } } as never);
  return handlers.site_cognitive_assessment;
}

const body = (r: Result) => JSON.parse(r.content[0].text ?? "{}");
const TOKYO = parseUserLocation("tokyo")!;

describe("the two values", () => {
  test("a location is a preset or coordinates in range; a place name is not looked up", () => {
    expect(parseUserLocation("tokyo")).toEqual({ latitude: 35.6762, longitude: 139.6503, accuracy: 100 });
    expect(parseUserLocation("New York")).toEqual(parseUserLocation("new-york"));
    expect(parseUserLocation(" 39.74 , -104.99 ")).toEqual({ latitude: 39.74, longitude: -104.99 });
    for (const v of ["Denver, Colorado, US", "91,0", "0,181", "denver", "39.74", ""]) expect(`${v}: ${parseUserLocation(v)}`).toBe(`${v}: null`);
  });

  test("a time zone is an IANA name", () => {
    expect(isTimeZone("America/Denver")).toBe(true);
    expect(isTimeZone("Asia/Tokyo")).toBe(true);
    for (const v of ["Mars/Olympus", "Denver", " ", ""]) expect(`${v}: ${isTimeZone(v)}`).toBe(`${v}: false`);
  });
});

describe("cognitive_effort", () => {
  test("without either, the page sees the machine's own time zone and no location (so the next test can fail)", async () => {
    await withEffort(async (effort) => {
      reports.length = 0;
      const r = await effort({ url: PAGE, persona: "first-timer", useValues: false, scope: "viewport", waitForSelector: WAIT });
      expect(r.isError).toBeUndefined();
      // The browser's zone, not this process's: bun test runs under TZ=UTC, chromium under the system zone.
      expect(reports.length).toBe(1);
      expect(reports[0].tz).not.toBe("Asia/Tokyo");
      expect(reports[0].geo).toBe("not-granted");
    });
  }, 180_000);

  test("the page sees the time zone and location given, in a browser of the call's own", async () => {
    await withEffort(async (effort, sessionUses) => {
      reports.length = 0;
      const r = await effort({ url: PAGE, persona: "first-timer", userTimezone: "Asia/Tokyo", userLocation: "tokyo", useValues: false, scope: "viewport", waitForSelector: WAIT });
      expect(r.isError).toBeUndefined();
      expect(reports).toEqual([{ tz: "Asia/Tokyo", geo: `${TOKYO.latitude},${TOKYO.longitude}` }]);
      const data = body(r);
      expect(data.userContext).toEqual({ location: "tokyo", geolocation: TOKYO, timezone: "Asia/Tokyo", language: null });
      expect(data._browserToken).toBeUndefined();
      expect(sessionUses()).toBe(0);
    });
  }, 180_000);

  test("coordinates work as a location", async () => {
    await withEffort(async (effort) => {
      reports.length = 0;
      await effort({ url: PAGE, persona: "first-timer", userLocation: "39.74,-104.99", useValues: false, scope: "viewport", waitForSelector: WAIT });
      expect(reports.map((x) => x.geo)).toEqual(["39.74,-104.99"]);
    });
  }, 180_000);

  test("a place name, an unknown time zone, or either with _browserToken is refused before any request", async () => {
    await withEffort(async (effort, sessionUses) => {
      requests.length = 0;
      const place = await effort({ url: PAGE, persona: "first-timer", userLocation: "Denver, Colorado, US" });
      expect(place.isError).toBe(true);
      expect(body(place)).toMatchObject({ error: "unknown_location", parameters: ["userLocation"] });
      const zone = await effort({ url: PAGE, persona: "first-timer", userTimezone: "Mars/Olympus" });
      expect(body(zone)).toMatchObject({ error: "unknown_timezone", parameters: ["userTimezone"] });
      const session = await effort({ url: PAGE, persona: "first-timer", userTimezone: "Asia/Tokyo", userLocation: "tokyo", _browserToken: "t" });
      expect(body(session)).toMatchObject({ error: "not_with_browser_token", parameters: ["userTimezone", "userLocation"] });
      expect(body(session).message).toContain("userTimezone, userLocation do not apply to _browserToken");
      expect(requests).toEqual([]);
      expect(sessionUses()).toBe(0);
    });
  }, 60_000);

  test("an empty string counts as not given", async () => {
    await withEffort(async (effort, sessionUses) => {
      reports.length = 0;
      const r = await effort({ url: PAGE, persona: "first-timer", userTimezone: "", userLocation: "", useValues: false, scope: "viewport", waitForSelector: WAIT });
      expect(r.isError).toBeUndefined();
      expect(sessionUses()).toBe(1);
      expect(body(r).userContext).toBeUndefined();
    });
  }, 180_000);
});

describe("site_cognitive_assessment", () => {
  test("the page sees the location given, not only the time zone (it echoed the location and set nothing)", async () => {
    reports.length = 0;
    const r = await assessment()({ url: PAGE, personas: "first-timer", userTimezone: "Asia/Tokyo", userLocation: "tokyo", waitForSelector: WAIT }, {});
    expect(reports.length).toBeGreaterThan(0);
    expect(new Set(reports.map((x) => `${x.tz} ${x.geo}`))).toEqual(new Set([`Asia/Tokyo ${TOKYO.latitude},${TOKYO.longitude}`]));
    expect(body(r).userContext).toMatchObject({ location: "tokyo", timezone: "Asia/Tokyo", geolocation: TOKYO });
  }, 180_000);

  test("a time zone or location with _browserToken is refused before any request (the session dropped the time zone)", async () => {
    requests.length = 0;
    const r = await assessment()({ url: PAGE, userTimezone: "Asia/Tokyo", _browserToken: "t" }, {});
    expect(r.isError).toBe(true);
    expect(body(r).gate1).toMatchObject({ status: "error", code: "not_with_browser_token", parameters: ["userTimezone"] });
    const place = await assessment()({ url: PAGE, userLocation: "Denver, Colorado, US" }, {});
    expect(body(place).gate1).toMatchObject({ code: "unknown_location" });
    expect(requests).toEqual([]);
  }, 60_000);
});
