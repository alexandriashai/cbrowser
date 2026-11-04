/**
 * --geo-region: every browser a command opens goes through the region's
 * residential proxy, and nothing leaves from this machine's own IP.
 *
 * Measured 2026-11-02 on 21.1.0 (Alexa: "navigate and the daemon ignore
 * --geo-region; only agent-ready-audit reads it", then "i want residential
 * proxy to work in all browser calls"): `navigate URL --geo-region us-west`
 * exited 0 and the page was fetched from the local IP. navigate is not in the
 * validated command registry, so the flag was taken and dropped; no other
 * command read it either.
 *
 * The proxy here is local and asks for credentials, like the real one, so each
 * request records the password the browser used, which carries the region
 * (geo-proxy.ts: _country-gb_city-london_...). The pages live on hostnames only
 * the proxy can answer for: a browser that skips the proxy cannot load them.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createServer as createHttpServer, request as httpRequest, type IncomingMessage, type Server } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { connect as netConnect, createServer as createNetServer } from "node:net";
import { createSocket } from "node:dgram";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join, resolve } from "node:path";

const workDir = mkdtempSync(join(tmpdir(), "cb-geo-region-"));
const dataDir = join(workDir, "data");
mkdirSync(dataDir);
const startDir = process.cwd();
const startEnv = { ...process.env };
process.chdir(workDir);
process.env.CBROWSER_DATA_DIR = dataDir;
// IPROYAL_* would win over geo-proxy.json and send these tests to the real proxy.
const GEO_ENV = ["CBROWSER_GEO_REGION", "CBROWSER_PROXY", "CBROWSER_PROXY_SERVER", "IPROYAL_USERNAME", "IPROYAL_PASSWORD", "LIGHTPANDA_ENDPOINT", "LIGHTPANDA_TOKEN"];
for (const k of GEO_ENV) delete process.env[k];

const { CBrowser } = await import("../src/browser.js");
const { mergeConfig, geoRegionProxy, defaultGeoRegion } = await import("../src/config.js");
const { listGeoRegions } = await import("../src/geo-proxy.js");
const { crossBrowserDiff } = await import("../src/visual/cross-browser.js");
const { runAgentReadyAudit } = await import("../src/analysis/agent-ready-audit.js");
const { capturePerformanceBaseline } = await import("../src/performance/metrics.js");
const { browserLaunchConfig } = await import("../src/browser-options.js");
const { registerAuditTools } = await import("../src/mcp-tools/base/audit-tools.js");
const { startProxyForwarder, loopbackPeerUid } = await import("../src/proxy-forwarder.js");
const { setHostedMode, refuseHostedProxy } = await import("../src/mcp-tools/hosted-inputs.js");
const { runCrossBrowserTest } = await import("../src/visual/cross-browser.js");
const { detectFlakyTests } = await import("../src/testing/flaky-detection.js");
const { repairTest } = await import("../src/testing/test-repair.js");

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");
const TIMEOUT = 90_000;
const SECRET = "s3cret-base";
const PAGE = "http://plain.test/";

/** One request the proxy let through: the host, the path (CONNECT for a tunnel), the user:password it carried, the browser. */
type Hit = { host: string; path: string; auth: string; ua: string };
const hits: Hit[] = [];
/** Authorization headers plain.test/auth received: a site that asks for a login must not get the proxy's. */
const siteLogins: string[] = [];
/** Proxy-Authorization headers the TLS site received inside the tunnel. */
const tunnelledProxyAuth: string[] = [];
/** Pages the TLS site served: only a browser that skipped the certificate check gets one. */
let tlsPages = 0;
let tlsPagesBefore = 0;
/** STUN packets that reached the local STUN server: WebRTC going around the proxy. */
let stunPackets = 0;
let stunPort = 0;
const STUN_HOST = Object.values(networkInterfaces()).flat().find((a) => a && a.family === "IPv4" && !a.internal)?.address ?? "127.0.0.1";
let stun: ReturnType<typeof createSocket>;
let wsServer: ReturnType<typeof Bun.serve>;
/** How each ws:// connection reached the proxy: "CONNECT" or "upgrade". */
const wsRoutes: string[] = [];
/** Every WebSocket request that reached the ws server, by any route. */
let wsConnections = 0;
let proxy: Server;
let tlsTarget: ReturnType<typeof createHttpsServer>;
let proxyPort = 0;
let tlsPort = 0;

function credentials(req: IncomingMessage): string | undefined {
  const header = req.headers["proxy-authorization"];
  if (typeof header !== "string" || !header.startsWith("Basic ")) return undefined;
  return Buffer.from(header.slice(6), "base64").toString();
}

/** "gb/london" for a password geo-proxy.ts built for uk, "none" for anything else. */
function region(auth: string): string {
  if (!auth.startsWith(`geo-user:${SECRET}_`)) return "none";
  return /_country-([a-z]+)_city-([a-z]+)_session-/.exec(auth)?.slice(1).join("/") ?? "none";
}

/** The region each plain.test path was fetched through. */
function pathsByRegion(ua = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of hits) {
    if (h.host !== "plain.test" || h.path === "CONNECT" || !h.ua.includes(ua)) continue;
    out[h.path] = out[h.path] && out[h.path] !== region(h.auth) ? "mixed" : region(h.auth);
  }
  return out;
}

/** A page that asks WebRTC for its public address from the local STUN server. */
const RTC_PAGE = (): string => `<!doctype html><title>rtc</title><script>
setTimeout(() => { document.title = "rtc-done"; }, 3000);
try {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:${STUN_HOST}:${stunPort}" }] });
  pc.createDataChannel("x");
  pc.createOffer().then((o) => pc.setLocalDescription(o));
} catch (e) { document.body.dataset.rtc = "none"; }
</script>`;

function writeGeoConfig(dir: string): void {
  writeFileSync(join(dir, "geo-proxy.json"), JSON.stringify({
    host: "127.0.0.1",
    port: proxyPort,
    username: "geo-user",
    basePassword: SECRET,
    regions: {},
  }), { mode: 0o600 });
}

beforeAll(async () => {
  // A self-signed site, for the certificate check.
  const keyPath = join(workDir, "k.pem");
  const certPath = join(workDir, "c.pem");
  const made = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath, "-days", "1", "-subj", "/CN=tls.test"], { stdio: "ignore" });
  if (made.status !== 0) throw new Error("openssl could not make the test certificate");
  tlsTarget = createHttpsServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, (req, res) => {
    tlsPages++;
    if (req.headers["proxy-authorization"]) tunnelledProxyAuth.push(String(req.headers["proxy-authorization"]));
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!doctype html><title>secure</title><p>secure-body</p>");
  });
  await new Promise<void>((r) => tlsTarget.listen(0, "127.0.0.1", () => r()));
  tlsPort = (tlsTarget.address() as { port: number }).port;

  proxy = createHttpServer((req, res) => {
    const auth = credentials(req);
    if (!auth) {
      res.writeHead(407, { "proxy-authenticate": 'Basic realm="geo"', "content-length": "0" });
      res.end();
      return;
    }
    const url = new URL(req.url ?? "/", "http://unknown.invalid");
    hits.push({ host: url.hostname, path: url.pathname, auth, ua: String(req.headers["user-agent"] ?? "") });
    if (url.hostname !== "plain.test") {
      res.writeHead(502, { "content-length": "0" });
      res.end();
      return;
    }
    if (url.pathname === "/auth") {
      const login = req.headers.authorization;
      if (!login) {
        res.writeHead(401, { "www-authenticate": 'Basic realm="site"', "content-type": "text/plain" });
        res.end("login");
        return;
      }
      siteLogins.push(Buffer.from(String(login).replace(/^Basic /, ""), "base64").toString());
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("in");
      return;
    }
    if (url.pathname === "/ws-page") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end('<!doctype html><title>ws</title><script>const ws = new WebSocket("ws://plain.test/ws"); ws.onmessage = (e) => { document.title = "ws " + e.data; }; ws.onopen = () => ws.send("ping"); ws.onerror = () => { document.title = "ws-error"; };</script>');
      return;
    }
    if (url.pathname === "/rtc-popup") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><title>rtc</title><script>
setTimeout(() => { document.title = "rtc-done"; }, 3000);
try {
  const w = window.open("");
  const pc = new w.RTCPeerConnection({ iceServers: [{ urls: "stun:${STUN_HOST}:${stunPort}" }] });
  pc.createDataChannel("x");
  pc.createOffer().then((o) => pc.setLocalDescription(o));
} catch (e) { document.body.dataset.rtc = "none"; }
</script>`);
      return;
    }
    if (url.pathname === "/truncated") {
      res.writeHead(200, { "content-type": "text/plain", "transfer-encoding": "chunked" });
      res.write("hello");
      setTimeout(() => res.socket?.destroy(), 50);
      return;
    }
    if (url.pathname === "/rtc") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(RTC_PAGE());
      return;
    }
    const body = url.pathname === "/"
      ? '<!doctype html><html lang="en"><title>start</title><img src="/i.png" alt=""><script>fetch("/xhr").then(() => { document.title = "done"; })</script></html>'
      : url.pathname === "/xhr" ? "ok" : "";
    const type = url.pathname === "/" ? "text/html" : url.pathname === "/i.png" ? "image/png" : "text/plain";
    res.writeHead(url.pathname === "/" || url.pathname === "/i.png" || url.pathname === "/xhr" ? 200 : 404, { "content-type": type });
    res.end(body);
  });
  proxy.on("connect", (req, socket, head) => {
    const auth = credentials(req);
    if (!auth) {
      socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="geo"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      return;
    }
    const host = (req.url ?? "").split(":")[0];
    hits.push({ host, path: "CONNECT", auth, ua: String(req.headers["user-agent"] ?? "") });
    if (req.url === "plain.test:80") {
      wsRoutes.push(`CONNECT ${region(auth)}`);
      const upstream = netConnect(wsServer.port!, "127.0.0.1", () => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length > 0) upstream.write(head);
        upstream.pipe(socket);
        socket.pipe(upstream);
      });
      upstream.on("error", () => socket.destroy());
      socket.on("error", () => upstream.destroy());
      return;
    }
    // Chromium may try https:// first for plain.test; refusing sends it back to http.
    if (host !== "tls.test") {
      socket.end("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    const upstream = netConnect(tlsPort, "127.0.0.1", () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });
  // A ws:// request sent to the proxy as an absolute-URL upgrade.
  proxy.on("upgrade", (req, socket, head) => {
    const auth = credentials(req);
    wsRoutes.push(`upgrade ${auth ? region(auth) : "none"}`);
    const upstream = netConnect(wsServer.port!, "127.0.0.1", () => {
      let text = `${req.method} /ws HTTP/1.1\r\n`;
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        if (!/^proxy-/i.test(req.rawHeaders[i])) text += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
      }
      upstream.write(text + "\r\n");
      if (head.length > 0) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });
  wsServer = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req, srv) {
      wsConnections++;
      return srv.upgrade(req) ? undefined : new Response("no", { status: 400 });
    },
    websocket: { message(ws, msg) { ws.send(`pong:${msg}`); } },
  });
  await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", () => r()));
  proxyPort = (proxy.address() as { port: number }).port;
  stun = createSocket("udp4");
  stun.on("message", () => { stunPackets++; });
  await new Promise<void>((r) => stun.bind(0, STUN_HOST, () => r()));
  stunPort = stun.address().port;
  writeGeoConfig(dataDir);
});

afterAll(() => {
  proxy?.close();
  tlsTarget?.close();
  stun?.close();
  wsServer?.stop(true);
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

/** Open the page in a fresh CBrowser and report the region each request went through. */
async function visit(config: Record<string, unknown>): Promise<Record<string, string>> {
  hits.length = 0;
  const b = new CBrowser({ headless: true, persistent: false, ...config });
  try {
    await b.launch();
    await b.navigate(PAGE);
    const p = await b.getPage();
    await p.waitForFunction(() => document.title === "done", null, { timeout: 10_000 });
    return pathsByRegion();
  } finally {
    await b.close();
  }
}

const EVERY_PATH = (r: string) => ({ "/": r, "/i.png": r, "/xhr": r });

/** The page, its image and its fetch went through `r`, and so did anything else asked for (firefox adds /favicon.ico). */
function expectThrough(paths: Record<string, string>, r: string): void {
  expect(paths).toMatchObject(EVERY_PATH(r));
  expect([...new Set(Object.values(paths))]).toEqual([r]);
}

describe("a region's proxy", () => {
  test("carries the region's country and city, for every configured region", () => {
    const regions = listGeoRegions();
    expect(regions).toContain("uk");
    for (const name of regions) {
      const p = geoRegionProxy(name);
      expect(p.server).toBe(`http://127.0.0.1:${proxyPort}`);
      expect(p.username).toBe("geo-user");
      expect(p.password).toMatch(new RegExp(`^${SECRET}_country-[a-z]+(_city-[a-z]+)?_session-\\w+_lifetime-30m$`));
    }
    expect(region(`geo-user:${geoRegionProxy("uk").password}`)).toBe("gb/london");
    expect(region(`geo-user:${geoRegionProxy("japan").password}`)).toBe("jp/tokyo");
  });

  test("an unknown region is refused, naming the configured ones", () => {
    expect(() => geoRegionProxy("atlantis")).toThrow(/geo region "atlantis" is not configured \(configured: .*\buk\b.*\), so the browser would run from this machine's own IP/);
  });
});

describe("which region a browser takes", () => {
  test("none by default: no proxy", async () => {
    await withEnv({ CBROWSER_GEO_REGION: undefined }, () => {
      const c = mergeConfig({});
      expect(c.geoRegion).toBeUndefined();
      expect(c.proxy).toBeUndefined();
    });
  });

  test("CBROWSER_GEO_REGION sets the proxy; blank is unset", async () => {
    await withEnv({ CBROWSER_GEO_REGION: "uk" }, () => {
      const c = mergeConfig({});
      expect(c.geoRegion).toBe("uk");
      expect(region(`${c.proxy?.username}:${c.proxy?.password}`)).toBe("gb/london");
    });
    await withEnv({ CBROWSER_GEO_REGION: "  " }, () => expect(mergeConfig({}).proxy).toBeUndefined());
  });

  test("the config file's geoRegion, and CBROWSER_GEO_REGION beats it", async () => {
    const file = join(dataDir, "config.json");
    writeFileSync(file, JSON.stringify({ geoRegion: "japan" }));
    try {
      expect(defaultGeoRegion()).toBe("japan");
      expect(region(`geo-user:${mergeConfig({}).proxy?.password}`)).toBe("jp/tokyo");
      await withEnv({ CBROWSER_GEO_REGION: "uk" }, () => expect(mergeConfig({}).geoRegion).toBe("uk"));
    } finally {
      rmSync(file);
    }
  });

  test("a region the caller names beats the default; a proxy it names drops the default region", async () => {
    await withEnv({ CBROWSER_GEO_REGION: "uk" }, () => {
      const named = mergeConfig({ geoRegion: "japan" });
      expect(named.geoRegion).toBe("japan");
      expect(region(`geo-user:${named.proxy?.password}`)).toBe("jp/tokyo");
      const own = mergeConfig({ proxy: { server: "http://own.example:3128" } });
      expect(own.proxy?.server).toBe("http://own.example:3128");
      expect(own.geoRegion).toBeUndefined();
    });
  });

  test("a region replaces CBROWSER_PROXY", async () => {
    await withEnv({ CBROWSER_PROXY: "http://corp.example:3128", CBROWSER_GEO_REGION: "uk" }, () => {
      expect(mergeConfig({}).proxy?.server).toBe(`http://127.0.0.1:${proxyPort}`);
    });
  });

  test("an unconfigured CBROWSER_GEO_REGION stops the browser at launch, not when its config is built", async () => {
    hits.length = 0;
    await withEnv({ CBROWSER_GEO_REGION: "atlantis" }, async () => {
      const c = mergeConfig({});
      expect(c.proxy).toBeUndefined();
      expect(c.invalid?.geoRegion).toContain('"atlantis" is not configured');
      const b = new CBrowser({ headless: true, persistent: false });
      expect(await b.launch().then(() => "launched", (e: Error) => e.message)).toContain('"atlantis" is not configured');
      await b.close();
      // A region or proxy the caller names makes the default's problem moot.
      expect(mergeConfig({ geoRegion: "uk" }).invalid).toBeUndefined();
      expect(mergeConfig({ proxy: { server: "http://own.example:3128" } }).invalid).toBeUndefined();
    });
    expect(hits).toEqual([]);
  }, TIMEOUT);

  test('"none" turns a config-file region off, and a blank region given is no region', async () => {
    const file = join(dataDir, "config.json");
    writeFileSync(file, JSON.stringify({ geoRegion: "japan" }));
    try {
      await withEnv({ CBROWSER_GEO_REGION: "none" }, () => {
        expect(mergeConfig({}).geoRegion).toBeUndefined();
        expect(mergeConfig({}).proxy).toBeUndefined();
      });
      const blank = mergeConfig({ geoRegion: " " });
      expect(blank.geoRegion).toBe("japan");
      expect(region(`geo-user:${blank.proxy?.password}`)).toBe("jp/tokyo");
    } finally {
      rmSync(file);
    }
  });

  test("one exit per region for the process: the same sticky session every time", () => {
    expect(geoRegionProxy("uk").password).toBe(geoRegionProxy("uk").password);
    expect(geoRegionProxy("uk").password).not.toBe(geoRegionProxy("japan").password);
  });
});

describe("every request goes through the region", () => {
  test("chromium", async () => {
    expectThrough(await visit({ geoRegion: "uk" }), "gb/london");
  }, TIMEOUT);

  test("chromium, persistent profile", async () => {
    expectThrough(await visit({ geoRegion: "uk", persistent: true }), "gb/london");
  }, TIMEOUT);

  test("firefox", async () => {
    expectThrough(await visit({ geoRegion: "uk", browser: "firefox" }), "gb/london");
  }, TIMEOUT);

  test("webkit", async () => {
    expectThrough(await visit({ geoRegion: "uk", browser: "webkit" }), "gb/london");
  }, TIMEOUT);

  test("CBROWSER_GEO_REGION, with nothing passed", async () => {
    expectThrough(await withEnv({ CBROWSER_GEO_REGION: "japan" }, () => visit({})), "jp/tokyo");
  }, TIMEOUT);

  test("certificates stay checked through a region; CBROWSER_PROXY keeps skipping them, as before", async () => {
    const body = async (config: Record<string, unknown>): Promise<string> => {
      const b = new CBrowser({ headless: true, persistent: false, ...config });
      try {
        await b.launch();
        await b.navigate("https://tls.test/").catch(() => undefined);
        const p = await b.getPage();
        return await p.evaluate(() => document.body?.innerText ?? "").catch(() => "");
      } finally {
        await b.close();
      }
    };
    hits.length = 0;
    expect(await body({ geoRegion: "uk" })).not.toContain("secure-body");
    // It did reach the site, through the region: the certificate stopped it.
    expect(hits.some((h) => h.path === "CONNECT" && h.host === "tls.test" && region(h.auth) === "gb/london")).toBe(true);
    const viaProxyEnv = await withEnv({ CBROWSER_PROXY: `http://geo-user:${SECRET}@127.0.0.1:${proxyPort}` }, () => body({}));
    expect(viaProxyEnv).toContain("secure-body");
  }, TIMEOUT);
});

describe("a library function given a region", () => {
  test("passes it to its browser", () => {
    expect(browserLaunchConfig({ geoRegion: "uk" }).geoRegion).toBe("uk");
    expect("geoRegion" in browserLaunchConfig({})).toBe(false);
  });

  test("capturePerformanceBaseline goes through it (it rebuilt its options and would have dropped it)", async () => {
    hits.length = 0;
    await capturePerformanceBaseline(PAGE, { geoRegion: "japan", runs: 1, name: "geo-lib" });
    expect(pathsByRegion()["/"]).toBe("jp/tokyo");
  }, TIMEOUT);

  // These three rebuilt the launch options from a list of fields, which would
  // have dropped the region.
  const OPEN_PAGE = { name: "open", steps: [{ instruction: `go to ${PAGE}`, action: "navigate" as const, target: PAGE }] };

  test("runCrossBrowserTest goes through it", async () => {
    hits.length = 0;
    await runCrossBrowserTest(PAGE, { browsers: ["chromium"], geoRegion: "uk" });
    expect(pathsByRegion()["/"]).toBe("gb/london");
  }, TIMEOUT);

  test("detectFlakyTests goes through it", async () => {
    hits.length = 0;
    await detectFlakyTests({ name: "geo", tests: [OPEN_PAGE] }, { runs: 1, geoRegion: "japan" });
    expect(pathsByRegion()["/"]).toBe("jp/tokyo");
  }, TIMEOUT);

  test("repairTest goes through it", async () => {
    hits.length = 0;
    await repairTest(OPEN_PAGE, { geoRegion: "uk", verifyRepairs: false });
    expect(pathsByRegion()["/"]).toBe("gb/london");
  }, TIMEOUT);
});

describe("the hosted assessment tool", () => {
  test("an unconfigured geoRegion is an error, not a run from the server's own IP", async () => {
    type Handler = (args: Record<string, unknown>, extra?: unknown) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
    const handlers: Record<string, Handler> = {};
    registerAuditTools({ registerTool: (name: string, _c: unknown, h: Handler) => { handlers[name] = h; } } as never);
    hits.length = 0;
    const r = await handlers.site_cognitive_assessment({ url: PAGE, geoRegion: "atlantis" }, {});
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('geoRegion \\"atlantis\\" is not configured on this server');
    expect(JSON.parse(r.content[0].text).result).toBe("ERROR");
    expect(hits).toEqual([]);
    const session = await handlers.site_cognitive_assessment({ url: PAGE, geoRegion: "uk", _browserToken: "t" }, {});
    expect(session.isError).toBe(true);
    expect(session.content[0].text).toContain("geoRegion and proxy do not apply to _browserToken");
    expect(hits).toEqual([]);
  }, TIMEOUT);
});

describe("the local forwarder", () => {
  test("reads the uid of a loopback peer from /proc/net/tcp, matching the whole connection", () => {
    const row = (local: string, remote: string, st: string, uid: number) =>
      `   0: ${local} ${remote} ${st} 00000000:00000000 00:00000000 00000000  ${uid}        0 11 1 0`;
    const table = [
      "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode",
      row("0100007F:1F90", "00000000:0000", "0A", 0), // the listener
      row("0100007F:1F90", "0100007F:D431", "01", 0), // its accepted socket
      row("0100007F:D431", "0100007F:1F90", "01", 1000), // the client
    ].join("\n");
    // The peer's socket is the row whose local end is the peer (0xD431).
    expect(loopbackPeerUid(table, 0xd431, 0x1f90)).toBe(1000);
    expect(loopbackPeerUid(table, 1, 2)).toBeUndefined();
    // A client that bound 127.0.0.2:<the forwarder's port> made the accepted
    // socket's row match on ports alone, under the forwarder's uid.
    const bound = [
      row("0200007F:1F90", "0100007F:1F90", "01", 65534),
      row("0100007F:1F90", "0200007F:1F90", "01", 0),
    ].join("\n");
    expect(loopbackPeerUid(bound, 0x1f90, 0x1f90)).toBeUndefined();
    // A connection that is no longer established is no one's.
    expect(loopbackPeerUid(row("0100007F:D431", "0100007F:1F90", "06", 0), 0xd431, 0x1f90)).toBeUndefined();
  });

  test("serves only clients on 127.0.0.1, and only proxy requests", async () => {
    const upstream = { server: `http://127.0.0.1:${proxyPort}`, username: "geo-user", password: `${SECRET}_country-gb_city-london_session-x_lifetime-30m` };
    const f = await startProxyForwarder(upstream);
    const port = Number(new URL(f.server).port);
    try {
      const fromOtherLoopback = await new Promise<string>((resolve) => {
        const sock = netConnect({ host: "127.0.0.1", port, localAddress: "127.0.0.2" }, () => {
          sock.write("GET http://plain.test/xhr HTTP/1.1\r\nHost: plain.test\r\n\r\n");
        });
        let got = "";
        sock.on("data", (d) => { got += d.toString(); });
        sock.on("close", () => resolve(got));
        sock.on("error", () => resolve(got));
      });
      expect(fromOtherLoopback).toBe("");
      const originForm = await new Promise<number>((resolve) => {
        const req = httpRequest({ host: "127.0.0.1", port, path: "/xhr", headers: { host: "plain.test" } }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
        req.on("error", () => resolve(-1));
        req.end();
      });
      expect(originForm).toBe(400);
    } finally {
      await f.close();
    }
  });

  test("serves only its own user's connections", async () => {
    if (process.platform !== "linux") return;
    const upstream = { server: `http://127.0.0.1:${proxyPort}`, username: "geo-user", password: `${SECRET}_country-gb_city-london_session-x_lifetime-30m` };
    const mine = await startProxyForwarder(upstream);
    const someoneElse = await startProxyForwarder(upstream, { uid: (process.getuid?.() ?? 0) + 4242 });
    const get = (server: string): Promise<number> => new Promise((resolve) => {
      const u = new URL(server);
      const req = httpRequest({ host: u.hostname, port: Number(u.port), path: "http://plain.test/xhr", headers: { host: "plain.test" } }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
      req.on("error", () => resolve(-1));
      req.end();
    });
    try {
      expect(await get(mine.server)).toBe(200);
      expect(await get(someoneElse.server)).toBe(-1);
    } finally {
      await mine.close();
      await someoneElse.close();
    }
  });
});

describe("the local forwarder passes failures on as failures", () => {
  test("an upstream that resets mid-body leaves the response incomplete, not complete and short", async () => {
    const upstream = { server: `http://127.0.0.1:${proxyPort}`, username: "geo-user", password: `${SECRET}_country-gb_city-london_session-x_lifetime-30m` };
    const f = await startProxyForwarder(upstream);
    const port = Number(new URL(f.server).port);
    try {
      const outcome = await new Promise<string>((resolve) => {
        const req = httpRequest({ host: "127.0.0.1", port, path: "http://plain.test/truncated", headers: { host: "plain.test" } }, (res) => {
          let body = "";
          res.on("data", (d) => { body += d; });
          res.on("aborted", () => resolve(`aborted after ${JSON.stringify(body)}`));
          res.on("error", () => resolve(`error after ${JSON.stringify(body)}`));
          res.on("end", () => resolve(res.complete ? `complete ${JSON.stringify(body)}` : `incomplete ${JSON.stringify(body)}`));
        });
        req.on("error", () => resolve("request error"));
        req.end();
      });
      expect(outcome).not.toStartWith("complete");
    } finally {
      await f.close();
    }
  }, TIMEOUT);
});

describe("the proxy's login stays with the proxy", () => {
  // Playwright 1.64 turns a launch proxy's username and password into
  // credentials for every site in chromium and webkit, and answers a site's 401
  // with them; webkit also sends them as a header. cbrowser now gives the
  // browser a local forwarder without credentials (proxy-forwarder.ts).
  for (const engine of ["chromium", "firefox", "webkit"] as const) {
    test(`a site that asks for a login does not get the proxy's (${engine})`, async () => {
      siteLogins.length = 0;
      hits.length = 0;
      const b = new CBrowser({ headless: true, persistent: false, geoRegion: "uk", browser: engine });
      try {
        await b.launch();
        await b.navigate(PAGE);
        await b.navigate("http://plain.test/auth").catch(() => undefined);
      } finally {
        await b.close();
      }
      expect(hits.some((h) => h.path === "/auth" && region(h.auth) === "gb/london")).toBe(true);
      expect(siteLogins.filter((l) => l.includes(SECRET))).toEqual([]);
    }, TIMEOUT);
  }

  test("a proxy server written without http:// still keeps its login out (webkit)", async () => {
    siteLogins.length = 0;
    hits.length = 0;
    const b = new CBrowser({ headless: true, persistent: false, browser: "webkit", proxy: { server: `127.0.0.1:${proxyPort}`, username: "geo-user", password: SECRET } });
    try {
      await b.launch();
      await b.navigate("http://plain.test/auth").catch(() => undefined);
    } finally {
      await b.close();
    }
    expect(hits.some((h) => h.path === "/auth")).toBe(true);
    expect(siteLogins.filter((l) => l.includes(SECRET))).toEqual([]);
  }, TIMEOUT);

  test("an HTTPS site gets no Proxy-Authorization inside the tunnel (webkit, CBROWSER_PROXY)", async () => {
    tunnelledProxyAuth.length = 0;
    await withEnv({ CBROWSER_PROXY: `http://geo-user:${SECRET}@127.0.0.1:${proxyPort}` }, async () => {
      const b = new CBrowser({ headless: true, persistent: false, browser: "webkit" });
      try {
        await b.launch();
        await b.navigate("https://tls.test/").catch(() => undefined);
        expect(await (await b.getPage()).evaluate(() => document.body?.innerText ?? "")).toContain("secure-body");
      } finally {
        await b.close();
      }
    });
    expect(tunnelledProxyAuth).toEqual([]);
  }, TIMEOUT);
});

describe("WebSockets go through the region", () => {
  for (const engine of ["chromium", "firefox"] as const) {
    test(engine, async () => {
      wsRoutes.length = 0;
      const b = new CBrowser({ headless: true, persistent: false, geoRegion: "uk", browser: engine });
      try {
        await b.launch();
        await b.navigate("http://plain.test/ws-page");
        const p = await b.getPage();
        await p.waitForFunction(() => document.title.startsWith("ws "), null, { timeout: 10_000 });
        expect(await p.title()).toBe("ws pong:ping");
      } finally {
        await b.close();
      }
      expect(wsRoutes.length).toBeGreaterThan(0);
      expect(wsRoutes.every((r) => r.endsWith("gb/london"))).toBe(true);
    }, TIMEOUT);
  }

  // Playwright's webkit opens no WebSocket through a launch proxy at all
  // (measured 2026-11-02 without cbrowser too): it fails, and nothing leaves
  // around the proxy.
  test("webkit: fails, and connects nowhere", async () => {
    wsRoutes.length = 0;
    wsConnections = 0;
    const b = new CBrowser({ headless: true, persistent: false, geoRegion: "uk", browser: "webkit" });
    try {
      await b.launch();
      await b.navigate("http://plain.test/ws-page");
      const p = await b.getPage();
      await p.waitForFunction(() => document.title.startsWith("ws"), null, { timeout: 10_000 });
      expect(await p.title()).toBe("ws-error");
    } finally {
      await b.close();
    }
    expect(wsRoutes).toEqual([]);
    expect(wsConnections).toBe(0);
  }, TIMEOUT);
});

describe("WebRTC does not go around the proxy", () => {
  test("webkit, from the page and from a frame it makes", async () => {
    stunPackets = 0;
    const b = new CBrowser({ headless: true, persistent: false, geoRegion: "uk", browser: "webkit" });
    try {
      await b.launch();
      await b.navigate("http://plain.test/rtc");
      const p = await b.getPage();
      await p.waitForFunction(() => document.title === "rtc-done", null, { timeout: 10_000 });
      const viaFrames = await p.evaluate(`(() => {
        const f = document.createElement("iframe");
        document.body.appendChild(f);
        const tried = ["RTCPeerConnection" in window ? "present" : "absent"];
        // By index first: a getter wrapped on contentWindow would not see these.
        for (const w of [window[0], window.frames[0], window.open(""), f.contentWindow]) {
          try {
            const pc = new w.RTCPeerConnection({ iceServers: [{ urls: "stun:${STUN_HOST}:${stunPort}" }] });
            pc.createDataChannel("x");
            pc.createOffer().then((o) => pc.setLocalDescription(o));
            tried.push("made");
          } catch (e) { tried.push("refused"); }
        }
        return tried.join(",");
      })()`);
      await new Promise((r) => setTimeout(r, 2000));
      expect(String(viaFrames)).toStartWith("absent");
      expect(String(viaFrames)).not.toContain("made");
    } finally {
      await b.close();
    }
    expect(stunPackets).toBe(0);
  }, TIMEOUT);

  test("webkit without a proxy does reach the STUN server (so the check can fail)", async () => {
    stunPackets = 0;
    const b = new CBrowser({ headless: true, persistent: false, browser: "webkit" });
    try {
      await b.launch();
      const p = await b.getPage();
      await p.setContent(RTC_PAGE());
      await p.waitForFunction(() => document.title === "rtc-done", null, { timeout: 10_000 });
    } finally {
      await b.close();
    }
    expect(stunPackets).toBeGreaterThan(0);
  }, TIMEOUT);

  for (const engine of ["chromium", "firefox"] as const) {
    test(engine, async () => {
      stunPackets = 0;
      const b = new CBrowser({ headless: true, persistent: false, geoRegion: "uk", browser: engine });
      try {
        await b.launch();
        await b.navigate("http://plain.test/rtc");
        await (await b.getPage()).waitForFunction(() => document.title === "rtc-done", null, { timeout: 10_000 });
      } finally {
        await b.close();
      }
      expect(stunPackets).toBe(0);
    }, TIMEOUT);

    test(`${engine} without a proxy does reach the STUN server (so the check can fail)`, async () => {
      stunPackets = 0;
      const b = new CBrowser({ headless: true, persistent: false, browser: engine });
      try {
        await b.launch();
        const p = await b.getPage();
        await p.setContent(RTC_PAGE());
        await p.waitForFunction(() => document.title === "rtc-done", null, { timeout: 10_000 });
      } finally {
        await b.close();
      }
      expect(stunPackets).toBeGreaterThan(0);
    }, TIMEOUT);
  }
});

describe("a hosted caller's proxy", () => {
  test("may not be this machine or a private network (each account's forwarder listens on 127.0.0.1)", async () => {
    setHostedMode(true);
    try {
      // The bracketed IPv4-in-IPv6 forms passed as public until 2026-11-04: the URL
      // parser writes [::ffff:127.0.0.1] as [::ffff:7f00:1].
      for (const p of ["http://127.0.0.1:9", "127.0.0.1:9", "http://localhost:3128", "http://10.1.2.3:3128", "http://[::1]:3128", "http://192.168.1.1:8080",
        "http://[::ffff:127.0.0.1]:9", "http://[::ffff:7f00:1]:9", "http://[0:0:0:0:0:ffff:7f00:1]:9", "http://[::7f00:1]:9", "http://[::ffff:a00:1]:9",
        "http://[64:ff9b::7f00:1]:9", "http://[::]:9", "http://[fd00::1]:9", "http://[fe80::1]:9", "http://[fec0::1]:9", "http://[ff02::1]:9", "http://2130706433:9"]) {
        const r = await refuseHostedProxy("t", p);
        expect(`${p}: ${r?.isError}`).toBe(`${p}: true`);
      }
      for (const p of ["http://[2606:4700:4700::1111]:3128", "http://[::ffff:8.8.8.8]:3128", "http://[64:ff9b::808:808]:3128"]) {
        expect(`${p}: ${await refuseHostedProxy("t", p)}`).toBe(`${p}: null`);
      }
      expect(await refuseHostedProxy("t", "http://8.8.8.8:3128")).toBeNull();
      type Handler = (args: Record<string, unknown>, extra?: unknown) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
      const handlers: Record<string, Handler> = {};
      registerAuditTools({ registerTool: (name: string, _c: unknown, h: Handler) => { handlers[name] = h; } } as never);
      hits.length = 0;
      const r = await handlers.site_cognitive_assessment({ url: "https://example.com/", proxy: "http://127.0.0.1:9" }, {});
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain("proxy_not_allowed");
      expect(hits).toEqual([]);
    } finally {
      setHostedMode(false);
    }
    expect(await refuseHostedProxy("t", "http://127.0.0.1:9")).toBeNull();
  });
});

describe("the browsers built without CBrowser", () => {
  test("crossBrowserDiff launches every engine through the region", async () => {
    hits.length = 0;
    await crossBrowserDiff(PAGE, ["chromium", "firefox"], { geoRegion: "uk" });
    expect(pathsByRegion("Chrome")["/"]).toBe("gb/london");
    expect(pathsByRegion("Firefox")["/"]).toBe("gb/london");
  }, TIMEOUT);

  test("crossBrowserDiff keeps the proxy's login out of the browser (webkit answered the first 401 with it)", async () => {
    siteLogins.length = 0;
    hits.length = 0;
    await crossBrowserDiff("http://plain.test/auth", ["webkit"], { geoRegion: "uk" });
    expect(hits.some((h) => h.path === "/auth" && region(h.auth) === "gb/london")).toBe(true);
    expect(siteLogins.filter((l) => l.includes(SECRET))).toEqual([]);
  }, TIMEOUT);

  test("crossBrowserDiff keeps WebRTC inside the proxy", async () => {
    stunPackets = 0;
    await crossBrowserDiff("http://plain.test/rtc", ["chromium", "firefox", "webkit"], { geoRegion: "uk" });
    await new Promise((r) => setTimeout(r, 500));
    expect(stunPackets).toBe(0);
  }, TIMEOUT);

  test("crossBrowserDiff keeps WebRTC inside the proxy in a popup the page opens (webkit)", async () => {
    stunPackets = 0;
    await crossBrowserDiff("http://plain.test/rtc-popup", ["webkit"], { geoRegion: "uk" });
    await new Promise((r) => setTimeout(r, 500));
    expect(stunPackets).toBe(0);
  }, TIMEOUT);

  test("crossBrowserDiff refuses an unconfigured CBROWSER_GEO_REGION before any request", async () => {
    hits.length = 0;
    const err = await withEnv({ CBROWSER_GEO_REGION: "atlantis" },
      () => crossBrowserDiff(PAGE, ["chromium"]).then(() => "ran", (e: Error) => e.message));
    expect(err).toContain('"atlantis" is not configured');
    expect(hits).toEqual([]);
  }, TIMEOUT);

  test("crossBrowserDiff takes CBROWSER_GEO_REGION", async () => {
    hits.length = 0;
    await withEnv({ CBROWSER_GEO_REGION: "japan" }, () => crossBrowserDiff(PAGE, ["chromium"]));
    expect(pathsByRegion("Chrome")["/"]).toBe("jp/tokyo");
  }, TIMEOUT);

  test("the agent-ready audit goes through the region", async () => {
    hits.length = 0;
    await withEnv({ CBROWSER_GEO_REGION: "uk" }, () => runAgentReadyAudit(PAGE, { headless: true }));
    expect(pathsByRegion()["/"]).toBe("gb/london");
  }, TIMEOUT);

  test("an audit given a proxy and its region keeps certificates checked; given the proxy alone it does not", async () => {
    const upstream = geoRegionProxy("uk");
    const loaded = async (options: Record<string, unknown>): Promise<boolean> => {
      hits.length = 0;
      await runAgentReadyAudit("https://tls.test/", { headless: true, proxy: upstream, ...options }).catch(() => undefined);
      return hits.some((h) => h.path === "CONNECT" && h.host === "tls.test");
    };
    // Both reach the site through the proxy; the TLS site's own log says whether a page loaded.
    tlsPagesBefore = tlsPages;
    expect(await loaded({ geoRegion: "uk" })).toBe(true);
    const checked = await new Promise<number>((r) => setTimeout(() => r(tlsPages), 100));
    expect(await loaded({})).toBe(true);
    expect(tlsPages).toBeGreaterThan(checked);
    expect(checked).toBe(tlsPagesBefore);
  }, TIMEOUT * 2);

  test("the audit closes the CBrowser it built (its forwarder held the proxy login open)", async () => {
    const original = CBrowser.prototype.close;
    let closed = 0;
    CBrowser.prototype.close = async function (this: InstanceType<typeof CBrowser>) { closed++; return original.call(this); };
    try {
      await withEnv({ CBROWSER_GEO_REGION: "uk" }, () => runAgentReadyAudit(PAGE, { headless: true }));
    } finally {
      CBrowser.prototype.close = original;
    }
    expect(closed).toBeGreaterThan(0);
  }, TIMEOUT);

  test("the audit refuses Lightpanda with a region, before anything opens", async () => {
    hits.length = 0;
    const err = await withEnv({ CBROWSER_GEO_REGION: "uk", LIGHTPANDA_ENDPOINT: "ws://127.0.0.1:9" },
      () => runAgentReadyAudit(PAGE, { useLightpanda: true }).then(() => "ran", (e: Error) => e.message));
    expect(err).toContain("Lightpanda does not go through geo region uk");
    expect(hits).toEqual([]);
  }, TIMEOUT);
});

// The command line, as a user runs it. Output goes to files: a daemon this
// starts keeps the pipes open.
let runSeq = 0;
async function cli(dir: string, env: Record<string, string>, ...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const n = runSeq++;
  const out = join(dir, `out-${n}.txt`);
  const err = join(dir, `err-${n}.txt`);
  const codeFile = join(dir, `code-${n}.txt`);
  const childEnv: Record<string, string> = { ...process.env as Record<string, string>, CBROWSER_DATA_DIR: dir, CB_OUT: out, CB_ERR: err, CB_CODE: codeFile, ...env };
  for (const k of GEO_ENV) if (!(k in env)) delete childEnv[k];
  const proc = Bun.spawn(
    ["bash", "-c", 'bun run "$0" "$@" > "$CB_OUT" 2> "$CB_ERR"; c=$?; echo $c > "$CB_CODE"; exit $c', CLI, ...args],
    { env: childEnv, stdout: "ignore", stderr: "ignore" },
  );
  const fromFile = (async () => {
    for (let i = 0; i < 3600; i++) {
      if (existsSync(codeFile)) {
        const raw = readFileSync(codeFile, "utf8").trim();
        if (raw) return Number(raw);
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`cli never reported an exit code: ${args.join(" ")}`);
  })();
  const code = await Promise.race([proc.exited, fromFile]);
  return { code, stdout: existsSync(out) ? readFileSync(out, "utf8") : "", stderr: existsSync(err) ? readFileSync(err, "utf8") : "" };
}

async function freePort(): Promise<number> {
  return await new Promise((r) => {
    const s = createNetServer();
    s.listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => r(p));
    });
  });
}

describe("cbrowser on the command line", () => {
  test("navigate --geo-region fetches the page through the region (21.1.0 fetched it from this machine)", async () => {
    hits.length = 0;
    const r = await cli(dataDir, {}, "navigate", PAGE, "--geo-region", "uk");
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(pathsByRegion()["/"]).toBe("gb/london");
  }, TIMEOUT);

  test("an unconfigured region exits 1 before any request, naming the configured ones", async () => {
    hits.length = 0;
    const r = await cli(dataDir, {}, "navigate", PAGE, "--geo-region", "atlantis");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('geo region "atlantis" is not configured (configured: ');
    expect(hits).toEqual([]);
  }, TIMEOUT);

  test("--geo-region with no region exits 1", async () => {
    const r = await cli(dataDir, {}, "navigate", PAGE, "--geo-region");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("--geo-region needs a region name");
  }, TIMEOUT);

  test("the proxy password is never printed, --verbose included", async () => {
    const r = await cli(dataDir, {}, "navigate", PAGE, "--geo-region", "uk", "--verbose");
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain(`Using proxy: http://127.0.0.1:${proxyPort} (uk)`);
    expect(`${r.stdout}\n${r.stderr}`).not.toContain(SECRET);
  }, TIMEOUT);

  test("a command whose library function builds its own browser (perf-baseline) goes through the region", async () => {
    hits.length = 0;
    const r = await cli(dataDir, {}, "perf-baseline", "save", PAGE, "--runs", "1", "--name", "geo", "--geo-region", "japan");
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(pathsByRegion()["/"]).toBe("jp/tokyo");
  }, TIMEOUT);

  test("agent-ready-audit --lightpanda --geo-region exits 1", async () => {
    const r = await cli(dataDir, { LIGHTPANDA_ENDPOINT: "ws://127.0.0.1:9" }, "agent-ready-audit", PAGE, "--lightpanda", "--geo-region", "uk");
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("--lightpanda does not go through geo region uk");
  }, TIMEOUT);

  test("a validated command (evaluate) takes --geo-region", async () => {
    hits.length = 0;
    const r = await cli(dataDir, {}, "evaluate", "location.host", "--url", PAGE, "--geo-region", "uk", "--raw", "--force", "--no-persistent");
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout.trim().split("\n").pop()).toBe("plain.test");
    expect(pathsByRegion()["/"]).toBe("gb/london");
  }, TIMEOUT);

  test("a bad CBROWSER_GEO_REGION or CBROWSER_DNT does not stop commands that open no browser", async () => {
    for (const cmd of [["status"], ["session", "list"], ["device", "list"]]) {
      const good = await cli(dataDir, {}, ...cmd);
      for (const env of [{ CBROWSER_GEO_REGION: "atlantis" }, { CBROWSER_DNT: "maybe" }]) {
        const bad = await cli(dataDir, env, ...cmd);
        expect(`${cmd.join(" ")} ${JSON.stringify(env)}: ${bad.code}`).toBe(`${cmd.join(" ")} ${JSON.stringify(env)}: ${good.code}`);
      }
    }
    // A command that opens one is refused, before any request.
    hits.length = 0;
    const nav = await cli(dataDir, { CBROWSER_GEO_REGION: "atlantis" }, "navigate", PAGE);
    expect(nav.code).toBe(1);
    expect(nav.stdout + nav.stderr).toContain('"atlantis" is not configured');
    expect(hits).toEqual([]);
  }, TIMEOUT * 2);

  test("--no-geo-region turns a config-file region off for the run", async () => {
    const file = join(dataDir, "config.json");
    writeFileSync(file, JSON.stringify({ geoRegion: "japan" }));
    try {
      hits.length = 0;
      const off = await cli(dataDir, {}, "navigate", PAGE, "--no-geo-region", "--no-persistent");
      // It ran, without a proxy: plain.test is a name only the proxy knows.
      expect(off.stdout + off.stderr).not.toContain("--geo-region needs");
      expect(off.stdout + off.stderr).toContain("plain.test");
      expect(hits).toEqual([]);
      const routed = await cli(dataDir, {}, "navigate", PAGE, "--no-persistent");
      expect(routed.code, routed.stderr).toBe(0);
      expect(pathsByRegion()["/"]).toBe("jp/tokyo");
    } finally {
      rmSync(file);
    }
  }, TIMEOUT * 2);

  test("a bad CBROWSER_GEO_REGION does not stop doctor", async () => {
    const bad = await cli(dataDir, { CBROWSER_GEO_REGION: "atlantis" }, "doctor");
    const good = await cli(dataDir, {}, "doctor");
    expect(bad.code).toBe(good.code);
    expect(bad.stderr).not.toContain("atlantis");
  }, TIMEOUT * 2);
});

describe("the daemon", () => {
  test("a daemon keeps the region it started with, though its config file changes before its browser exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cb-geo-daemon-pin-"));
    writeGeoConfig(dir);
    writeFileSync(join(dir, "config.json"), JSON.stringify({ geoRegion: "japan" }));
    try {
      const start = await cli(dir, {}, "daemon", "start", "--port", String(await freePort()));
      expect(start.code, start.stdout + start.stderr).toBe(0);
      rmSync(join(dir, "config.json"));
      hits.length = 0;
      const nav = await cli(dir, {}, "navigate", PAGE);
      expect(nav.code, nav.stderr).toBe(0);
      expect(pathsByRegion()["/"]).toBe("jp/tokyo");
    } finally {
      await cli(dir, {}, "daemon", "stop").catch(() => {});
      try {
        const state = JSON.parse(readFileSync(join(dir, "daemon.json"), "utf8"));
        if (state.pid) process.kill(state.pid);
      } catch { /* stopped */ }
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT * 2);

  test("daemon start with an unconfigured region exits 1 and starts nothing, from the flag or CBROWSER_GEO_REGION", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cb-geo-daemon-bad-"));
    writeGeoConfig(dir);
    try {
      for (const [env, args] of [[{}, ["--geo-region", "atlantis"]], [{ CBROWSER_GEO_REGION: "atlantis" }, []]] as const) {
        const r = await cli(dir, { ...env }, "daemon", "start", "--port", String(await freePort()), ...args);
        expect(r.code).toBe(1);
        expect(r.stderr).toContain('geo region "atlantis" is not configured');
        expect(existsSync(join(dir, "daemon.json"))).toBe(false);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT);

  test("daemon start --geo-region: the daemon's browser goes through it, and a routed command's own flag is named as not applying", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cb-geo-daemon-"));
    writeGeoConfig(dir);
    try {
      const port = String(await freePort());
      const start = await cli(dir, {}, "daemon", "start", "--port", port, "--geo-region", "uk");
      expect(start.code, start.stdout + start.stderr).toBe(0);
      hits.length = 0;
      const nav = await cli(dir, {}, "navigate", PAGE);
      expect(nav.code, nav.stderr).toBe(0);
      expect(pathsByRegion()["/"]).toBe("gb/london");
      // The region it was started with applies, named or not.
      const same = await cli(dir, {}, "navigate", PAGE, "--geo-region", "uk");
      expect(same.code, same.stderr).toBe(0);
      expect(same.stderr).not.toContain("do not apply");
      // Another region is refused, from the flag, the env or the config file,
      // before anything is sent.
      for (const [env, args] of [[{}, ["--geo-region", "japan"]], [{ CBROWSER_GEO_REGION: "japan" }, []]] as const) {
        hits.length = 0;
        const other = await cli(dir, { ...env }, "navigate", PAGE, ...args);
        expect(other.code).toBe(1);
        expect(other.stderr).toContain("the daemon's browser goes out through geo region uk, and this command asks for geo region japan, so nothing was sent");
        expect(hits).toEqual([]);
      }
      // Reading the console is checked too: it can launch the browser.
      const consoleRead = await cli(dir, { CBROWSER_GEO_REGION: "japan" }, "console");
      expect(consoleRead.code).toBe(1);
      expect(consoleRead.stdout + consoleRead.stderr).toContain("asks for geo region japan");
      // And asking for no region is asking for something else.
      const none = await cli(dir, {}, "navigate", PAGE, "--no-geo-region");
      expect(none.code).toBe(1);
      expect(none.stderr).toContain("asks for no region");
      const again = await cli(dir, {}, "daemon", "start", "--port", port, "--geo-region", "japan");
      expect(again.code).toBe(1);
      expect(again.stderr).toContain("asks for geo region japan");
    } finally {
      await cli(dir, {}, "daemon", "stop").catch(() => {});
      try {
        const state = JSON.parse(readFileSync(join(dir, "daemon.json"), "utf8"));
        if (state.pid) process.kill(state.pid);
      } catch { /* stopped */ }
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT * 3);
});
