/**
 * On the hosted server every browser goes through the egress gate, so nothing
 * a caller names can make it connect to this machine or its network.
 *
 * P-10 (plan of 2026-11-07): the hosted servers judged a caller's URL once,
 * before the browser connected. A redirect, a subresource, a frame, a worker
 * fetch or a WebSocket after that was not judged, and the machine's own
 * public address passed as public. CBrowser.launch and crossBrowserDiff now
 * take their proxy from openBrowserRoute (src/proxy-forwarder.ts), which on
 * the hosted server starts the egress gate (src/egress-gate.ts) and gives the
 * browser nothing else.
 *
 * Everything here runs against listeners this file starts: the "refused"
 * ones on 127.0.0.1, [::1] and this machine's first non-internal IPv4
 * address, the "allowed" ones on 127.0.0.2, which the injected address
 * decision lets through on top of the real one. Names end in .test and are
 * answered by the injected resolver only. Each refused case has the same
 * request made without hosted mode next to it, which does arrive, so a
 * count of 0 is a count that can be something else.
 *
 * The tests of openBrowserRoute and webRtcGuard that start no browser are in
 * tests/browser-route.test.ts, which the release gate runs (this file it
 * leaves out; review of 2026-11-12, tests-1).
 *
 * Linux only: it reads /proc for the browser's command line and for the
 * listeners this process holds.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { createServer as createHttpsServer } from "node:https";
import { connect as netConnect, createServer as createNetServer, Server as NetServer, type Socket } from "node:net";
import { createSocket } from "node:dgram";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";

const workDir = mkdtempSync(join(tmpdir(), "cb-hosted-egress-"));
const dataDir = join(workDir, "data");
mkdirSync(dataDir);
const startDir = process.cwd();
const startEnv = { ...process.env };
process.chdir(workDir);
process.env.CBROWSER_DATA_DIR = dataDir;
const LOOPBACK_SWITCH = "PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK";
// A proxy or region from the environment would put every launch here behind it.
for (const k of ["CBROWSER_GEO_REGION", "CBROWSER_PROXY", "CBROWSER_PROXY_SERVER", "IPROYAL_USERNAME", "IPROYAL_PASSWORD", "CBROWSER_OWN_ADDRESSES", LOOPBACK_SWITCH]) delete process.env[k];

const { CBrowser } = await import("../src/browser.js");
const { crossBrowserDiff } = await import("../src/visual/cross-browser.js");
const { setHostedMode, isHostedMode } = await import("../src/mcp-tools/hosted-inputs.js");
const { setEgressPolicyForTests, allowedEgressAddress } = await import("../src/egress.js");
const { runAgentReadyAudit } = await import("../src/analysis/agent-ready-audit.js");
const { registerAuditTools } = await import("../src/mcp-tools/base/audit-tools.js");
const { registerRemediationTools } = await import("../src/mcp-tools/base/remediation-tools.js");
const { registerBugAnalysisTools } = await import("../src/mcp-tools/base/bug-analysis-tools.js");
const { registerBrowserManagementTools } = await import("../src/mcp-tools/base/browser-management-tools.js");
const { registerSessionTools } = await import("../src/mcp-tools/base/session-tools.js");

const TIMEOUT = 120_000;
const ENGINES = ["chromium", "firefox", "webkit"] as const;
type Engine = (typeof ENGINES)[number];
type Page = Awaited<ReturnType<InstanceType<typeof CBrowser>["getPage"]>>;

/** This machine's first non-internal IPv4 address: public on the hosted box, private on a CI runner, refused either way. */
const BOX = Object.values(networkInterfaces()).flat().find((a) => a && a.family === "IPv4" && !a.internal)?.address ?? "127.0.0.1";
const HAS_V6 = Object.values(networkInterfaces()).flat().some((a) => a && a.address === "::1");
/** Nothing a caller is told about the gate may read as a proxy the site blocks, or as an engine's own error code. */
const NOT_PLAIN = /prox|vpn|anti-bot|tunnel|residential|geo region|egress gate|net::|NS_ERROR|Download is starting|Call log/i;

/** One request a listener received. */
interface Seen { method: string; path: string; headers: Record<string, string>; ws: boolean }
interface Reply { status?: number; type?: string; body?: string | Buffer; headers?: Record<string, string>; delayMs?: number }
interface Listener {
  port: number;
  origin: string;
  hits: Seen[];
  /** TCP connections accepted, whether or not a request followed. */
  connections: number;
  /** "/path", or "WS /path" for a WebSocket handshake, without the query. */
  paths(): string[];
  reset(): void;
  close(): Promise<void>;
}

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/**
 * A small HTTP and WebSocket listener on a raw TCP server, so a connection
 * that never sends a request is counted too. One request per connection.
 */
async function listen(host: string, label: string, respond: (seen: Seen) => Reply | undefined = () => undefined, port = 0): Promise<Listener> {
  const sockets = new Set<Socket>();
  const hits: Seen[] = [];
  const server = createNetServer((socket) => {
    self.connections++;
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => { /* the browser went away */ });
    let buffered = Buffer.alloc(0);
    const onData = (chunk: Buffer): void => {
      buffered = Buffer.concat([buffered, chunk]);
      const end = buffered.indexOf("\r\n\r\n");
      if (end < 0) return;
      socket.off("data", onData);
      const [line, ...rest] = buffered.subarray(0, end).toString("latin1").split("\r\n");
      const [method, target] = line.split(" ");
      const headers: Record<string, string> = {};
      for (const h of rest) headers[h.slice(0, h.indexOf(":")).toLowerCase()] = h.slice(h.indexOf(":") + 1).trim();
      const seen: Seen = { method, path: target, headers, ws: /websocket/i.test(headers.upgrade ?? "") };
      hits.push(seen);
      if (seen.ws) {
        const accept = createHash("sha1").update(`${headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
        socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
        // One text frame, "hi": the page's onmessage is the proof it got through.
        socket.write(Buffer.from([0x81, 0x02, 0x68, 0x69]));
        return;
      }
      const path = target.split("?")[0];
      const reply = respond(seen) ?? {};
      const body = Buffer.from(reply.body ?? (path === "/img" ? GIF : path === "/" || path === "/frame" ? `<!doctype html><title>${label}</title><p>${label}-body</p>` : "ok"));
      const type = reply.type ?? (path === "/img" ? "image/gif" : path === "/" || path === "/frame" ? "text/html" : "text/plain");
      let head = `HTTP/1.1 ${reply.status ?? 200} X\r\nContent-Type: ${type}\r\nContent-Length: ${body.length}\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nConnection: close\r\n`;
      for (const [k, v] of Object.entries(reply.headers ?? {})) head += `${k}: ${v}\r\n`;
      const send = (): void => { socket.end(Buffer.concat([Buffer.from(head + "\r\n", "latin1"), body])); };
      if (reply.delayMs) setTimeout(send, reply.delayMs);
      else send();
    };
    socket.on("data", onData);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  const at = (server.address() as { port: number }).port;
  const self: Listener = {
    port: at,
    origin: `http://${host.includes(":") ? `[${host}]` : host}:${at}`,
    hits,
    connections: 0,
    paths: () => hits.map((h) => `${h.ws ? "WS " : ""}${h.path.split("?")[0]}`),
    reset: () => { hits.length = 0; self.connections = 0; },
    close: () => new Promise<void>((resolve) => {
      for (const s of sockets) s.destroy();
      server.close(() => resolve());
    }),
  };
  return self;
}

/** A page that asks each `to` origin for an image, a fetch, a frame, a fetch from a worker and a WebSocket, then sets its title. */
const PROBE_PAGE = `<!doctype html><title>probe</title><body><script>
const targets = new URLSearchParams(location.search).getAll("to");
const settle = (p) => Promise.race([p, new Promise((r) => setTimeout(() => r("timeout"), 6000))]);
const jobs = [];
for (const to of targets) {
  jobs.push(settle(new Promise((r) => { const i = new Image(); i.onload = () => r("ok"); i.onerror = () => r("error"); i.src = to + "/img"; })));
  jobs.push(settle(fetch(to + "/fetch", { mode: "no-cors" }).then(() => "ok", () => "error")));
  jobs.push(settle(new Promise((r) => { const f = document.createElement("iframe"); f.onload = () => r("loaded"); f.onerror = () => r("error"); f.src = to + "/frame"; document.body.appendChild(f); })));
  jobs.push(settle(new Promise((r) => { const w = new Worker("/worker.js"); w.onmessage = (e) => r(e.data); w.onerror = () => r("error"); w.postMessage(to + "/worker"); })));
  jobs.push(settle(new Promise((r) => { try { const ws = new WebSocket(to.replace(/^http/, "ws") + "/ws"); ws.onmessage = () => { r("ok"); ws.close(); }; ws.onerror = () => r("error"); ws.onclose = () => r("closed"); } catch (e) { r("threw"); } })));
}
Promise.all(jobs).then((results) => { window.__results = results; document.title = "probe-done"; });
</script>`;
const WORKER_JS = `onmessage = (e) => { fetch(e.data, { mode: "no-cors" }).then(() => postMessage("ok"), () => postMessage("error")); };`;
const PROBED = ["/img", "/fetch", "/frame", "/worker", "WS /ws"];

/**
 * A page that asks WebRTC for its address from the STUN listener and, with
 * ?to=, loads an image from that origin. /slow.js holds the parser for a
 * moment, so a caller that leaves at DOMContentLoaded still gave both time.
 */
const rtcPage = (to: string | null): string => `<!doctype html><title>rtc</title><body><script>
setTimeout(() => { document.title = "rtc-done"; }, 2500);
try {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:${BOX}:${stunPort}" }] });
  pc.createDataChannel("x");
  pc.createOffer().then((o) => pc.setLocalDescription(o));
  document.body.dataset.rtc = "made";
} catch (e) { document.body.dataset.rtc = "none"; }
${to ? `new Image().src = ${JSON.stringify(`${to}/img`)};` : ""}
</script><script src="/slow.js"></script><p>rtc page</p>`;

let allowed: Listener;
let loop4: Listener;
let loop6: Listener | undefined;
let box: Listener;
/** Counts connections to the TLS site, which sits behind it: a tunnel that opened is a connection here. */
let tlsFront: ReturnType<typeof createNetServer>;
let tlsSite: ReturnType<typeof createHttpsServer>;
let tlsPort = 0;
let tlsConnections = 0;
/** Headers of every page the TLS site served. */
const tlsPages: Record<string, string | string[] | undefined>[] = [];
let stun: ReturnType<typeof createSocket>;
let stunPort = 0;
let stunPackets = 0;
/** The upstream proxy of the chained cases: asks for a login, answers only for the .test names. */
let upstream: ReturnType<typeof createNetServer>;
let upstreamPort = 0;
/** Each request the upstream proxy received: its request line and the login it carried. */
const upstreamSeen: { line: string; login: string | undefined }[] = [];
const UP_USER = "up-user";
const UP_PASS = "up-s3cret";

/** A port on 127.0.0.2, where the injected decision allows a connection, at which something listened a moment ago and nothing does now. */
let deadPort = 0;

/** Names the injected resolver answers. Any other name does not resolve: nothing here asks real DNS. */
const NAMES: Record<string, string[]> = {
  "allowed.test": ["127.0.0.2"],
  "tls.test": ["127.0.0.2"],
  "refused.test": ["127.0.0.1"],
  localhost: ["127.0.0.1"],
};
const asked: string[] = [];
/** The real decision, plus 127.0.0.2 where the allowed listeners are. */
const allowForTests = (ip: string): boolean => ip === "127.0.0.2" || allowedEgressAddress(ip);
const policy = {
  resolve: async (host: string): Promise<string[]> => {
    asked.push(host);
    const answer = NAMES[host];
    if (!answer) throw new Error("not a name this test knows");
    return answer;
  },
  allow: allowForTests,
};

function refusedListeners(): Listener[] {
  return [loop4, box, ...(loop6 ? [loop6] : [])];
}
function resetAll(): void {
  for (const l of [allowed, ...refusedListeners()]) l.reset();
  tlsConnections = 0;
  tlsPages.length = 0;
  stunPackets = 0;
  upstreamSeen.length = 0;
  asked.length = 0;
}
/** Nothing arrived at any refused listener: no request and no connection. */
function expectNothingRefusedWasReached(): void {
  for (const l of refusedListeners()) {
    expect(l.paths()).toEqual([]);
    expect(l.connections).toBe(0);
  }
}
/** The origins a refused listener answers on, by every loopback spelling and by this machine's address. */
function refusedOrigins(): string[] {
  return [loop4.origin, `http://localhost:${loop4.port}`, box.origin, ...(loop6 ? [loop6.origin] : [])];
}

beforeAll(async () => {
  allowed = await listen("127.0.0.2", "allowed", (seen) => {
    const url = new URL(seen.path, "http://allowed.test");
    if (url.pathname === "/redirect") return { status: 302, headers: { Location: url.searchParams.get("to") ?? "/" }, body: "" };
    if (url.pathname === "/probe") return { type: "text/html", body: PROBE_PAGE };
    if (url.pathname === "/worker.js") return { type: "text/javascript", body: WORKER_JS };
    if (url.pathname === "/rtc") return { type: "text/html", body: rtcPage(url.searchParams.get("to")) };
    if (url.pathname === "/slow.js") return { type: "text/javascript", body: "", delayMs: 900 };
    // A saved page that takes a while: a close() can land while it is being restored.
    if (url.pathname === "/slow-page") return { type: "text/html", body: "<!doctype html><title>slow</title><p>slow-body</p>", delayMs: 4000 };
    // A site's own 403 that carries the gate's mark: only the gate's word makes an answer the gate's.
    if (url.pathname === "/marked") return { status: 403, type: "text/html", headers: { "X-CBrowser-Egress": "refused" }, body: "<!doctype html><title>marked</title><p>site-own-403</p>" };
    if (url.pathname === "/missing") return { status: 404, type: "text/html", body: "<!doctype html><title>missing</title><p>site-own-404</p>" };
    return undefined;
  });
  const once = createNetServer();
  await new Promise<void>((r) => once.listen(0, "127.0.0.2", () => r()));
  deadPort = (once.address() as { port: number }).port;
  await new Promise<void>((r) => once.close(() => r()));
  loop4 = await listen("127.0.0.1", "refused-v4");
  if (HAS_V6) {
    // The same port as the IPv4 one when it is free, so http://localhost:<port>/ finds a listener whichever family the browser tries.
    loop6 = await listen("::1", "refused-v6", undefined, loop4.port).catch(() => listen("::1", "refused-v6"));
  }
  box = await listen(BOX, "refused-box");

  const keyPath = join(workDir, "k.pem");
  const certPath = join(workDir, "c.pem");
  const made = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath, "-days", "1", "-subj", "/CN=tls.test"], { stdio: "ignore" });
  if (made.status !== 0) throw new Error("openssl could not make the test certificate");
  tlsSite = createHttpsServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, (req, res) => {
    tlsPages.push(req.headers);
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<!doctype html><title>secure</title><p>secure-body</p>");
  });
  await new Promise<void>((r) => tlsSite.listen(0, "127.0.0.1", () => r()));
  const tlsSitePort = (tlsSite.address() as { port: number }).port;
  tlsFront = createNetServer((socket) => {
    tlsConnections++;
    const to = netConnect(tlsSitePort, "127.0.0.1");
    socket.pipe(to);
    to.pipe(socket);
    socket.on("error", () => to.destroy());
    to.on("error", () => socket.destroy());
  });
  await new Promise<void>((r) => tlsFront.listen(0, "127.0.0.2", () => r()));
  tlsPort = (tlsFront.address() as { port: number }).port;

  stun = createSocket("udp4");
  stun.on("message", () => { stunPackets++; });
  await new Promise<void>((r) => stun.bind(0, BOX, () => r()));
  stunPort = stun.address().port;

  upstream = createNetServer((client) => {
    client.on("error", () => { /* the gate went away */ });
    let buffered = Buffer.alloc(0);
    const onData = (chunk: Buffer): void => {
      buffered = Buffer.concat([buffered, chunk]);
      const end = buffered.indexOf("\r\n\r\n");
      if (end < 0) return;
      client.off("data", onData);
      const [line, ...rest] = buffered.subarray(0, end).toString("latin1").split("\r\n");
      const auth = rest.find((h) => /^proxy-authorization:/i.test(h))?.split(":").slice(1).join(":").trim();
      const login = auth?.startsWith("Basic ") ? Buffer.from(auth.slice(6), "base64").toString() : undefined;
      upstreamSeen.push({ line, login });
      if (login !== `${UP_USER}:${UP_PASS}`) {
        client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="up"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
        return;
      }
      const [method, target] = line.split(" ");
      const url = method === "CONNECT" ? new URL(`http://${target}`) : new URL(target);
      // Like a real proxy, it resolves the name itself; these two are all it knows.
      if (url.hostname !== "allowed.test" && url.hostname !== "tls.test") {
        client.end("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        return;
      }
      const to = netConnect(Number(url.port) || 80, "127.0.0.2", () => {
        if (method === "CONNECT") {
          client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        } else {
          const kept = rest.filter((h) => !/^proxy-/i.test(h) && !/^connection:/i.test(h));
          to.write(`${method} ${url.pathname}${url.search} HTTP/1.1\r\n${kept.join("\r\n")}\r\nConnection: close\r\n\r\n`);
        }
        const more = buffered.subarray(end + 4);
        if (more.length > 0) to.write(more);
        to.pipe(client);
        client.pipe(to);
      });
      to.on("error", () => client.destroy());
    };
    client.on("data", onData);
  });
  await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", () => r()));
  upstreamPort = (upstream.address() as { port: number }).port;

  setEgressPolicyForTests(policy);
});

afterEach(() => {
  setHostedMode(false);
  delete process.env[LOOPBACK_SWITCH];
});

afterAll(async () => {
  setEgressPolicyForTests(null);
  setHostedMode(false);
  await Promise.all([allowed, loop4, loop6, box].map((l) => l?.close()));
  tlsFront?.close();
  tlsSite?.close();
  upstream?.close();
  stun?.close();
  process.chdir(startDir);
  for (const k of Object.keys(process.env)) if (!(k in startEnv)) delete process.env[k];
  Object.assign(process.env, startEnv);
  rmSync(workDir, { recursive: true, force: true });
});

async function hosted<T>(fn: () => Promise<T>): Promise<T> {
  setHostedMode(true);
  try {
    return await fn();
  } finally {
    setHostedMode(false);
  }
}

type Launched = InstanceType<typeof CBrowser>;

/** Launch a CBrowser (hosted or not as the flag stands now), run `fn` with its page, close it. */
async function withBrowser<T>(config: Record<string, unknown>, fn: (page: Page, b: Launched) => Promise<T>): Promise<T> {
  const b = new CBrowser({ headless: true, persistent: false, ...config });
  try {
    await b.launch();
    return await fn(await b.getPage(), b);
  } finally {
    await b.close();
  }
}

/** Open `url`; a refused or failed load is an answer here, not an error. */
async function go(page: Page, url: string): Promise<string> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
    return await page.evaluate(() => document.body?.innerText ?? "");
  } catch (e) {
    return `failed: ${(e as Error).message.split("\n")[0]}`;
  }
}

/** Run the probe page from `pageOrigin` against `targets` and wait for every request to end one way or the other. */
async function probe(page: Page, pageOrigin: string, targets: string[]): Promise<void> {
  await page.goto(`${pageOrigin}/probe?${targets.map((t) => `to=${encodeURIComponent(t)}`).join("&")}`, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.waitForFunction(() => document.title === "probe-done", null, { timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 300));
}

async function runRtc(page: Page, url: string): Promise<string> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.waitForFunction(() => document.title === "rtc-done", null, { timeout: 15_000 });
  return await page.evaluate(() => `${document.body.dataset.rtc},${"RTCPeerConnection" in window ? "present" : "absent"}`);
}

/** The browser processes this process started and that are still there: pid and command line. */
function browserChildren(): { pid: number; args: string[] }[] {
  const out: { pid: number; args: string[] }[] = [];
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    try {
      const stat = readFileSync(`/proc/${name}/stat`, "utf8");
      const [state, ppid] = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      if (Number(ppid) !== process.pid || state === "Z") continue;
      // Chromium rewrites its command line as one string with spaces; the others keep the NULs.
      const args = readFileSync(`/proc/${name}/cmdline`, "utf8").split(/[\0 ]+/).filter(Boolean);
      if (/chrom|headless_shell|firefox|webkit|minibrowser|pw_run/i.test(args.join(" "))) out.push({ pid: Number(name), args });
    } catch { /* gone between the listing and the read */ }
  }
  return out;
}

/** The TCP listeners this process holds, as /proc/net/tcp writes their addresses. Other processes' listeners are not counted. */
function ownListeners(): string[] {
  const inodes = new Set<string>();
  for (const fd of readdirSync("/proc/self/fd")) {
    try {
      const m = /^socket:\[(\d+)\]$/.exec(readlinkSync(`/proc/self/fd/${fd}`));
      if (m) inodes.add(m[1]);
    } catch { /* closed between the listing and the read */ }
  }
  const rows: string[] = [];
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let table = "";
    try { table = readFileSync(file, "utf8"); } catch { /* no IPv6 table */ }
    for (const line of table.split("\n").slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols[3] === "0A" && inodes.has(cols[9])) rows.push(cols[1]);
    }
  }
  return rows.sort();
}

/** Wait (up to 3 s) for this process's listeners to be `expected` again: a closed server leaves the table a moment later. */
async function listenersSettle(expected: string[]): Promise<string[]> {
  for (let i = 0; i < 30; i++) {
    if (JSON.stringify(ownListeners()) === JSON.stringify(expected)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return ownListeners();
}

/** Wait (up to 10 s) for the browser processes this process started to be `expected` again: a closed browser's process leaves a moment later. */
async function childrenSettle(expected: number[]): Promise<number[]> {
  const pids = (): number[] => browserChildren().map((c) => c.pid).sort((a, b) => a - b);
  const want = JSON.stringify([...expected].sort((a, b) => a - b));
  for (let i = 0; i < 100; i++) {
    if (JSON.stringify(pids()) === want) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return pids();
}

/**
 * What a call that should fail said, or that it did not fail.
 *
 * A browser shows its own error page for a navigation that failed, and that
 * page can arrive a moment after the failure was reported. A navigation
 * started in that moment is rejected as "interrupted by another navigation"
 * (firefox did it once in this file on 2026-11-12, to the navigation after a
 * refused one; chromium does it when two failures follow each other with
 * nothing in between). These tests are about what a failure says, so each
 * one is given 300 ms to finish before the next call.
 */
async function told(call: Promise<unknown>): Promise<string> {
  try {
    const result = await call as { success?: boolean; url?: string } | undefined;
    return `DID NOT FAIL: success=${String(result?.success)} url=${String(result?.url)}`;
  } catch (e) {
    await new Promise((r) => setTimeout(r, 300));
    return (e as Error).message;
  }
}

/** Make every net server in this process fail to listen, as when no port or descriptor is left, until the returned function is called. */
function breakListen(): () => void {
  const real = NetServer.prototype.listen;
  NetServer.prototype.listen = function (this: NetServer) {
    queueMicrotask(() => this.emit("error", new Error("listen refused (test)")));
    return this;
  } as typeof real;
  return () => { NetServer.prototype.listen = real; };
}

const upstreamProxy = (extra: Record<string, unknown> = {}) => ({ server: `http://127.0.0.1:${upstreamPort}`, username: UP_USER, password: UP_PASS, ...extra });

describe("the fixtures", () => {
  test("this machine's own address is refused by the real decision, and only 127.0.0.2 is added to it", () => {
    expect(allowedEgressAddress(BOX)).toBe(false);
    expect(allowForTests(BOX)).toBe(false);
    expect(allowForTests("127.0.0.1")).toBe(false);
    expect(allowForTests("::1")).toBe(false);
    expect(allowForTests("127.0.0.2")).toBe(true);
    expect(isHostedMode()).toBe(false);
  });
});

for (const engine of ENGINES) {
  describe(`hosted, ${engine}`, () => {
    test("ISC-10, 11, 14: opening this machine's addresses, by any loopback spelling or after a redirect, reaches nothing", async () => {
      resetAll();
      await hosted(() => withBrowser({ browser: engine }, async (page, b) => {
        // The first two through CBrowser.navigate, as a tool would.
        await b.navigate(`${loop4.origin}/`).catch(() => undefined);
        await b.navigate(`${box.origin}/`).catch(() => undefined);
        for (const origin of refusedOrigins()) {
          expect(await go(page, `${origin}/`)).not.toContain("refused-");
          await go(page, `${allowed.origin}/redirect?to=${encodeURIComponent(`${origin}/landed`)}`);
        }
        // A name that answers with this machine's address.
        expect(await go(page, `http://refused.test:${loop4.port}/`)).not.toContain("refused-");
      }));
      // The redirects themselves were served: the first hop went out, the second did not.
      expect(allowed.paths().filter((p) => p === "/redirect").length).toBeGreaterThanOrEqual(refusedOrigins().length);
      expectNothingRefusedWasReached();
    }, TIMEOUT);

    test("ISC-12, 13, 14, 25: an image, a fetch, a frame, a worker's fetch and a WebSocket reach nothing here, and all five reach an allowed host", async () => {
      resetAll();
      await hosted(() => withBrowser({ browser: engine }, async (page) => {
        await probe(page, allowed.origin, [...refusedOrigins(), `http://allowed.test:${allowed.port}`]);
      }));
      expectNothingRefusedWasReached();
      // The same page's requests to the allowed name arrived, each kind of them, so the page did run and the gate does carry them.
      expect(allowed.paths()).toEqual(expect.arrayContaining(PROBED));
      expect(asked).toContain("allowed.test");
    }, TIMEOUT);

    test("ISC-21, 27: an allowed page loads by name over http and https, and its WebRTC sends nothing to this machine", async () => {
      resetAll();
      const seen = await hosted(() => withBrowser({ browser: engine }, async (page, b) => {
        // Only the gate's resolver knows these names: a browser that went around it loads nothing.
        await b.navigate(`http://allowed.test:${allowed.port}/`);
        const plain = await go(page, `http://allowed.test:${allowed.port}/`);
        // The site's certificate is self-signed, and CBrowser checks certificates when no proxy is configured.
        const strict = await go(page, `https://tls.test:${tlsPort}/`);
        const tunnels = tlsConnections;
        const lenient = await page.context().browser()!.newContext({ ignoreHTTPSErrors: true });
        const secure = await go(await lenient.newPage(), `https://tls.test:${tlsPort}/`);
        await lenient.close();
        const rtc = await runRtc(page, `http://allowed.test:${allowed.port}/rtc`);
        return { plain, strict, tunnels, secure, rtc };
      }));
      expect(seen.plain).toContain("allowed-body");
      expect(seen.strict).toStartWith("failed:");
      expect(seen.tunnels).toBeGreaterThan(0);
      expect(seen.secure).toContain("secure-body");
      expect(tlsPages.length).toBeGreaterThan(0);
      if (engine === "webkit") expect(seen.rtc).toBe("none,absent");
      expect(stunPackets).toBe(0);
      expectNothingRefusedWasReached();
    }, TIMEOUT);

    test("ISC-8, 22, 26: behind a configured proxy with a bypass list, the list does not open a way to this machine and the login stays with the gate", async () => {
      resetAll();
      const seen = await hosted(() => withBrowser({ browser: engine, proxy: upstreamProxy({ bypass: ["127.0.0.1", "localhost", "::1", "[::1]", BOX, "<loopback>"] }) }, async (page) => {
        for (const origin of refusedOrigins()) await go(page, `${origin}/`);
        const plain = await go(page, `http://allowed.test:${allowed.port}/`);
        // With a configured proxy CBrowser skips certificate errors, so the self-signed page loads.
        const secure = await go(page, `https://tls.test:${tlsPort}/`);
        return { plain, secure };
      }));
      expectNothingRefusedWasReached();
      // Refused before the upstream proxy was asked: it saw the two allowed names and nothing else.
      expect(upstreamSeen.filter((u) => !/allowed\.test|tls\.test/.test(u.line))).toEqual([]);
      expect(seen.plain).toContain("allowed-body");
      expect(seen.secure).toContain("secure-body");
      expect(upstreamSeen.some((u) => u.line.startsWith("GET http://allowed.test:"))).toBe(true);
      expect(upstreamSeen.some((u) => u.line.startsWith(`CONNECT tls.test:${tlsPort}`))).toBe(true);
      expect(upstreamSeen.every((u) => u.login === `${UP_USER}:${UP_PASS}`)).toBe(true);
      // The sites got no proxy login, in a header or anywhere else.
      const secret = Buffer.from(`${UP_USER}:${UP_PASS}`).toString("base64");
      for (const headers of [...allowed.hits.map((h) => h.headers), ...tlsPages]) {
        expect(Object.keys(headers)).not.toContain("proxy-authorization");
        expect(JSON.stringify(headers)).not.toContain(secret);
      }
    }, TIMEOUT);

    test("ISC-20: not hosted, the same requests do arrive, WebRTC does send, and no gate is started", async () => {
      resetAll();
      const before = ownListeners();
      const seen = await withBrowser({ browser: engine }, async (page, b) => {
        const during = ownListeners();
        const forwarder = (b as unknown as { proxyForwarder: unknown }).proxyForwarder;
        const proxied = browserChildren().some((c) => c.args.some((a) => a.startsWith("--proxy-server")));
        await b.navigate(`${loop4.origin}/`);
        const direct = await go(page, `${loop4.origin}/`);
        for (const origin of refusedOrigins()) {
          await go(page, `${origin}/`);
          await go(page, `${allowed.origin}/redirect?to=${encodeURIComponent(`${origin}/landed`)}`);
        }
        await probe(page, allowed.origin, refusedOrigins());
        const rtc = await runRtc(page, `${allowed.origin}/rtc`);
        return { during, forwarder, proxied, direct, rtc };
      });
      expect(seen.during).toEqual(before);
      expect(seen.forwarder).toBeNull();
      expect(seen.proxied).toBe(false);
      expect(seen.direct).toContain("refused-v4-body");
      expect(asked).toEqual([]);
      expect(loop4.paths()).toEqual(expect.arrayContaining(["/", "/landed", ...PROBED]));
      if (loop6) expect(loop6.paths()).toEqual(expect.arrayContaining(["/", "/landed", ...PROBED]));
      expect(box.paths()).toEqual(expect.arrayContaining(["/", "/landed", ...PROBED]));
      expect(seen.rtc).toBe("made,present");
      expect(stunPackets).toBeGreaterThan(0);
    }, TIMEOUT);
  });

  describe(`crossBrowserDiff on the hosted server, ${engine}`, () => {
    test("ISC-10, 15: a page on this machine is not reached", async () => {
      resetAll();
      const before = ownListeners();
      await hosted(() => crossBrowserDiff(`${loop4.origin}/`, [engine]));
      await hosted(() => crossBrowserDiff(`${allowed.origin}/redirect?to=${encodeURIComponent(`${box.origin}/landed`)}`, [engine]));
      expectNothingRefusedWasReached();
      expect(allowed.paths()).toContain("/redirect");
      // Each engine's gate was closed with its browser.
      expect(await listenersSettle(before)).toEqual(before);
    }, TIMEOUT);

    test("ISC-12, 21, 27: an allowed page loads by name; its image from this machine and its WebRTC go nowhere", async () => {
      resetAll();
      const result = await hosted(() => crossBrowserDiff(`http://allowed.test:${allowed.port}/rtc?to=${encodeURIComponent(loop4.origin)}`, [engine]));
      expect(result.differences.filter((d) => d.type === "error")).toEqual([]);
      expect(result.metrics[engine]).toBeDefined();
      expect(allowed.paths()).toEqual(expect.arrayContaining(["/rtc", "/slow.js"]));
      expect(stunPackets).toBe(0);
      expectNothingRefusedWasReached();
    }, TIMEOUT);

    test("not hosted, the same page's image and WebRTC do arrive (so the two above can fail)", async () => {
      resetAll();
      const result = await crossBrowserDiff(`${allowed.origin}/rtc?to=${encodeURIComponent(loop4.origin)}`, [engine]);
      expect(result.differences.filter((d) => d.type === "error")).toEqual([]);
      expect(loop4.paths()).toContain("/img");
      expect(stunPackets).toBeGreaterThan(0);
      expect(asked).toEqual([]);
    }, TIMEOUT);

    test("ISC-16: with a gate that cannot start, the engine is not launched on the page and reports why", async () => {
      resetAll();
      const before = browserChildren().map((c) => c.pid);
      const restore = breakListen();
      let result: Awaited<ReturnType<typeof crossBrowserDiff>>;
      try {
        result = await hosted(() => crossBrowserDiff(`${loop4.origin}/`, [engine]));
      } finally {
        restore();
      }
      expect(result.differences.map((d) => d.description).join("\n")).toMatch(/egress gate .*could not start/);
      expect(result.metrics[engine]).toBeUndefined();
      expect(browserChildren().map((c) => c.pid)).toEqual(before);
      expectNothingRefusedWasReached();
    }, TIMEOUT);
  });

  describe(`what a hosted caller is told when a page cannot be opened, ${engine}`, () => {
    /** The six ways a page is not carried: over https and over plain http, a name that answers with this machine's address, a name with no answer, and an allowed address where nothing listens. */
    const cases = (): Array<{ label: string; url: string; host: string; kind: "refused" | "unreachable" }> => [
      { label: "https, a name the resolver answers with this machine's address", url: `https://refused.test:${loop4.port}/`, host: `refused.test:${loop4.port}`, kind: "refused" },
      { label: "https, a name that does not resolve", url: "https://nx.test/", host: "nx.test", kind: "refused" },
      { label: "https, an allowed address where nothing listens", url: `https://allowed.test:${deadPort}/`, host: `allowed.test:${deadPort}`, kind: "unreachable" },
      { label: "http, a name the resolver answers with this machine's address", url: `http://refused.test:${loop4.port}/`, host: `refused.test:${loop4.port}`, kind: "refused" },
      { label: "http, a name that does not resolve", url: "http://nx.test/", host: "nx.test", kind: "refused" },
      { label: "http, an allowed address where nothing listens", url: `http://allowed.test:${deadPort}/`, host: `allowed.test:${deadPort}`, kind: "unreachable" },
    ];
    const expectPlain = (label: string, message: string, host: string, kind: "refused" | "unreachable"): void => {
      const escaped = host.replace(/[.[\]]/g, "\\$&");
      if (kind === "refused") {
        expect(`${label}: ${message}`).toMatch(new RegExp(`: (\\S+ redirected to ${escaped}\\. )?${escaped} cannot be reached from the hosted server: its name does not resolve, or it is an address the server does not open \\(private, local, or the server's own\\)\\. Check the URL spelling\\. Nothing was loaded\\.$`));
      } else {
        expect(`${label}: ${message}`).toMatch(new RegExp(`: (\\S+ redirected to ${escaped}\\. )?Connection to ${escaped} failed: it was refused \\(nothing is listening there, or a firewall rejected it\\).* it timed out \\(the host did not answer\\).*\\. Check the address and port\\. Nothing was loaded\\.$`));
      }
      expect(`${label}: ${message}`).not.toMatch(NOT_PLAIN);
    };

    test("navigate rejects, and says in plain words that the host cannot be reached or did not answer (launch-wiring-1, regression-2, regression-3)", async () => {
      resetAll();
      const seen = await hosted(() => withBrowser({ browser: engine }, async (_page, b) => {
        const out: Array<{ label: string; message: string; host: string; kind: "refused" | "unreachable"; left: string }> = [];
        for (const c of cases()) {
          const message = await told(b.navigate(c.url));
          const page = await b.getPage();
          // What a later screenshot or extract would work on.
          const left = `${page.url()} ${await page.evaluate(() => document.body?.innerText ?? "").catch(() => "")}`;
          out.push({ ...c, message, left });
        }
        // The session is not broken by any of it: an allowed page still loads.
        const after = await b.navigate(`http://allowed.test:${allowed.port}/`);
        return { out, after: `${after.success} ${after.title}` };
      }));
      for (const c of seen.out) {
        expectPlain(c.label, c.message, c.host, c.kind);
        // The gate's own answer is not left in the tab as if it were the page.
        expect(`${c.label}: ${c.left}`).not.toContain("egress gate");
        // Where that answer arrived as a page (plain http), the tab is cleared.
        // Where the engine itself rejected the navigation (every https case,
        // and firefox's rejection of the gate's empty 502 over plain http) it
        // shows its own error page, which firefox keeps at the URL that failed
        // once it has loaded (seen here on 2026-11-12, after the 300 ms that
        // told() waits), so there only the gate's words are looked for.
        const engineErrorPage = c.url.startsWith("https:") || (engine === "firefox" && c.kind === "unreachable");
        if (!engineErrorPage) expect(`${c.label}: ${c.left}`).not.toContain(c.host);
      }
      expect(seen.after).toBe("true allowed");
      expectNothingRefusedWasReached();
    }, TIMEOUT);

    test("after a redirect it is the host that failed that is named, with the host that redirected", async () => {
      resetAll();
      const via = `allowed.test:${allowed.port}`;
      const targets: Array<{ label: string; to: string; host: string; kind: "refused" | "unreachable" }> = [
        { label: "to https, refused", to: `https://refused.test:${loop4.port}/landed`, host: `refused.test:${loop4.port}`, kind: "refused" },
        { label: "to http, refused", to: `http://refused.test:${loop4.port}/landed`, host: `refused.test:${loop4.port}`, kind: "refused" },
        { label: "to https, nothing listens", to: `https://allowed.test:${deadPort}/landed`, host: `allowed.test:${deadPort}`, kind: "unreachable" },
        { label: "to http, this machine by address", to: `${loop4.origin}/landed`, host: `127.0.0.1:${loop4.port}`, kind: "refused" },
      ];
      const seen = await hosted(() => withBrowser({ browser: engine }, async (_page, b) => {
        const out: string[] = [];
        for (const t of targets) out.push(await told(b.navigate(`http://${via}/redirect?to=${encodeURIComponent(t.to)}`)));
        return out;
      }));
      targets.forEach((t, i) => {
        expectPlain(t.label, seen[i], t.host, t.kind);
        expect(`${t.label}: ${seen[i]}`).toContain(`: ${via} redirected to ${t.host}. `);
      });
      // Each redirect itself was served; what it pointed at was not reached.
      expect(allowed.paths().filter((p) => p === "/redirect").length).toBeGreaterThanOrEqual(targets.length);
      expectNothingRefusedWasReached();
    }, TIMEOUT);

    test("a site's own error page is still a page: a 403 that carries the gate's mark, and a 404, hosted and not", async () => {
      resetAll();
      const run = (): Promise<string[]> => withBrowser({ browser: engine }, async (page, b) => {
        const out: string[] = [];
        for (const path of ["/marked", "/missing"]) {
          const result = await b.navigate(`${isHostedMode() ? `http://allowed.test:${allowed.port}` : allowed.origin}${path}`);
          out.push(`${result.success} ${await page.evaluate(() => document.body?.innerText ?? "")}`);
        }
        return out;
      });
      expect(await hosted(run)).toEqual(["true site-own-403", "true site-own-404"]);
      expect(await run()).toEqual(["true site-own-403", "true site-own-404"]);
    }, TIMEOUT);

    test("not hosted, the same failures are the browser's own and say nothing of a hosted server (so the ones above can fail)", async () => {
      resetAll();
      const seen = await withBrowser({ browser: engine }, async (_page, b) => [
        await told(b.navigate(`https://127.0.0.2:${deadPort}/`)),
        await told(b.navigate(`http://127.0.0.2:${deadPort}/`)),
        await told(b.navigate(`${allowed.origin}/redirect?to=${encodeURIComponent(`http://127.0.0.2:${deadPort}/landed`)}`)),
      ]);
      for (const message of seen) {
        expect(message).not.toStartWith("DID NOT FAIL");
        expect(message).not.toContain("hosted server");
        // Chromium's refusal has had a plain sentence since 21.x; the other engines' errors are passed on as they are.
        if (engine === "chromium") expect(message).toMatch(/^Connection to 127\.0\.0\.2:\d+ was refused: nothing is listening there, or a firewall rejected it\. Check the address and port\. Nothing was loaded\. \(net::ERR_CONNECTION_REFUSED\)$/);
      }
      expect(asked).toEqual([]);
    }, TIMEOUT);

    test("crossBrowserDiff reports the same plain sentence as this engine's result, for https and for plain http", async () => {
      resetAll();
      for (const c of cases().filter((x) => /this machine's address|nothing listens/.test(x.label))) {
        const result = await hosted(() => crossBrowserDiff(c.url, [engine]));
        const errors = result.differences.filter((d) => d.type === "error");
        expect(`${c.label}: ${errors.length}`).toBe(`${c.label}: 1`);
        expect(errors[0].description).toStartWith(`${engine}: `);
        expectPlain(c.label, errors[0].description, c.host, c.kind);
        // Nothing was measured or captured for a page that was not opened.
        expect(result.metrics[engine]).toBeUndefined();
        expect(result.screenshots[engine]).toBeUndefined();
      }
      expectNothingRefusedWasReached();
    }, TIMEOUT);

    test.skipIf(!HAS_V6)("ISC-10, 14 over IPv6: [::1] is not reached by address, by redirect or from a page, and is reached when not hosted (skipped where this machine has no ::1)", async () => {
      resetAll();
      const v6 = loop6!;
      const message = await hosted(() => withBrowser({ browser: engine }, async (page, b) => {
        const said = await told(b.navigate(`${v6.origin}/`));
        await go(page, `${allowed.origin}/redirect?to=${encodeURIComponent(`${v6.origin}/landed`)}`);
        await probe(page, allowed.origin, [v6.origin]);
        return said;
      }));
      expect(v6.paths()).toEqual([]);
      expect(v6.connections).toBe(0);
      expectPlain("[::1]", message, `[::1]:${v6.port}`, "refused");
      // The same three, not hosted, do arrive.
      await withBrowser({ browser: engine }, async (page) => {
        await go(page, `${v6.origin}/`);
        await go(page, `${allowed.origin}/redirect?to=${encodeURIComponent(`${v6.origin}/landed`)}`);
        await probe(page, allowed.origin, [v6.origin]);
      });
      expect(v6.paths()).toEqual(expect.arrayContaining(["/", "/landed", ...PROBED]));
    }, TIMEOUT);
  });
}

describe("crossBrowserDiff on the hosted server, behind a configured proxy", () => {
  test("ISC-8, 26: the gate is chained to the proxy, which gets the allowed page with its login and never hears of a refused one", async () => {
    resetAll();
    process.env.CBROWSER_PROXY = `http://${UP_USER}:${UP_PASS}@127.0.0.1:${upstreamPort}`;
    try {
      const result = await hosted(() => crossBrowserDiff(`http://allowed.test:${allowed.port}/rtc?to=${encodeURIComponent(loop4.origin)}`, ["chromium"]));
      expect(result.differences.filter((d) => d.type === "error")).toEqual([]);
      await hosted(() => crossBrowserDiff(`${box.origin}/`, ["chromium"]));
    } finally {
      delete process.env.CBROWSER_PROXY;
    }
    expectNothingRefusedWasReached();
    expect(upstreamSeen.some((u) => u.line.startsWith("GET http://allowed.test:") && u.login === `${UP_USER}:${UP_PASS}`)).toBe(true);
    expect(upstreamSeen.filter((u) => !u.line.includes("allowed.test"))).toEqual([]);
    expect(allowed.paths()).toContain("/rtc");
    expect(allowed.hits.some((h) => "proxy-authorization" in h.headers)).toBe(false);
    expect(stunPackets).toBe(0);
  }, TIMEOUT);
});

describe("hosted, behind a configured proxy that does not answer", () => {
  test("the caller is told about the proxy, as before, and a plain-http page is a failed navigation too, not a blank page", async () => {
    resetAll();
    // Nothing listens there: the gate allows the page's address and then cannot reach the proxy it is chained to.
    const proxy = { server: `http://127.0.0.1:${deadPort}` };
    const seen = await hosted(() => withBrowser({ proxy }, async (_page, b) => [
      await told(b.navigate(`https://allowed.test:${allowed.port}/`)),
      await told(b.navigate(`http://allowed.test:${allowed.port}/`)),
    ]));
    for (const message of seen) {
      expect(message).toStartWith("Proxy tunnel rejected by ");
      expect(message).toContain(`(proxy: ${proxy.server})`);
      // It is the proxy that failed, not an address the server refuses.
      expect(message).not.toContain("hosted server");
    }
    expect(allowed.connections).toBe(0);
    expectNothingRefusedWasReached();
  }, TIMEOUT);
});

describe("what the audit tools are told on the hosted server", () => {
  const PROXY_BLAME = /blocking proxy|anti-bot|PROXY_BLOCKED|proxy_blocked|residential|Re-run without/i;

  test("agent_ready_audit: a page the gate does not carry stops the audit with the plain sentence, over https and over plain http", async () => {
    resetAll();
    const refused = [`https://refused.test:${loop4.port}/`, `http://refused.test:${loop4.port}/`, "https://nx.test/"];
    for (const url of refused) {
      const message = await told(hosted(() => runAgentReadyAudit(url, { headless: true })));
      expect(`${url}: ${message}`).toContain(`${new URL(url).host} cannot be reached from the hosted server: its name does not resolve, or it is an address the server does not open`);
      expect(`${url}: ${message}`).not.toMatch(PROXY_BLAME);
    }
    const dead = await told(hosted(() => runAgentReadyAudit(`https://allowed.test:${deadPort}/`, { headless: true })));
    expect(dead).toContain(`Connection to allowed.test:${deadPort} failed: it was refused`);
    expect(dead).not.toMatch(PROXY_BLAME);
    expectNothingRefusedWasReached();
  }, TIMEOUT);

  test("agent_ready_audit control: not hosted, the same address is the browser's own refusal", async () => {
    const message = await told(runAgentReadyAudit(`https://127.0.0.2:${deadPort}/`, { headless: true }));
    expect(message).toMatch(/^Connection to 127\.0\.0\.2:\d+ was refused/);
    expect(message).not.toContain("hosted server");
  }, TIMEOUT);

  test("site_cognitive_assessment: the result is ERROR with the plain sentence, never PROXY_BLOCKED and never a scored gate page", async () => {
    resetAll();
    type Handler = (args: Record<string, unknown>, extra?: unknown) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
    const handlers: Record<string, Handler> = {};
    registerAuditTools({ registerTool: (name: string, _c: unknown, h: Handler) => { handlers[name] = h; } } as never);
    for (const url of [`https://refused.test:${loop4.port}/`, `http://refused.test:${loop4.port}/`, `https://allowed.test:${deadPort}/`, `http://allowed.test:${deadPort}/`]) {
      const answer = await hosted(() => handlers.site_cognitive_assessment({ url, personas: "first-timer" }, {}));
      const text = answer.content[0].text;
      const response = JSON.parse(text) as { result?: string; gate1?: { status?: string; error?: string } };
      expect(`${url}: ${response.result}`).toBe(`${url}: ERROR`);
      expect(`${url}: ${response.gate1?.status}`).toBe(`${url}: error`);
      expect(`${url}: ${response.gate1?.error}`).toContain(url.includes("refused.test") ? `refused.test:${loop4.port} cannot be reached from the hosted server:` : `Connection to allowed.test:${deadPort} failed: it was refused`);
      expect(`${url}: ${text}`).not.toMatch(PROXY_BLAME);
    }
    expectNothingRefusedWasReached();
  }, TIMEOUT);
});

/**
 * The tools that open a CBrowser's page with page.goto themselves, and not
 * through navigate (wiring-1, second review of 2026-11-12). Before they went
 * through the gate reading, llms_txt_generate and structured_data_suggest
 * read the gate's refusal text over plain http as the site ("# Untitled", a
 * "homepage"), and threw the engine's raw tunnel error with its Call log over
 * https. The MCP server turns a thrown error into an isError result with the
 * error's message as its text; empathy_audit makes the result itself.
 */
describe("what the tools that open a page themselves are told on the hosted server", () => {
  type Handler = (args: Record<string, unknown>, extra?: unknown) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
  const handlersOf = (register: (server: never, context: never) => void): Record<string, Handler> => {
    const handlers: Record<string, Handler> = {};
    register({ registerTool: (name: string, _c: unknown, h: Handler) => { handlers[name] = h; } } as never, {} as never);
    return handlers;
  };
  const plain = (host: string, kind: "refused" | "unreachable"): string => kind === "refused"
    ? `${host} cannot be reached from the hosted server: its name does not resolve, or it is an address the server does not open (private, local, or the server's own). Check the URL spelling. Nothing was loaded.`
    : `Connection to ${host} failed: it was refused (nothing is listening there, or a firewall rejected it)`;

  test("llms_txt_generate over plain http and structured_data_suggest over https: the plain sentence, and nothing generated from the gate's answer", async () => {
    resetAll();
    const tools = handlersOf(registerRemediationTools as never);
    const cases: Array<{ tool: string; url: string; host: string; kind: "refused" | "unreachable" }> = [
      { tool: "llms_txt_generate", url: `http://refused.test:${loop4.port}/`, host: `refused.test:${loop4.port}`, kind: "refused" },
      { tool: "llms_txt_generate", url: "http://nx.test/", host: "nx.test", kind: "refused" },
      { tool: "llms_txt_generate", url: `http://allowed.test:${deadPort}/`, host: `allowed.test:${deadPort}`, kind: "unreachable" },
      { tool: "structured_data_suggest", url: `https://refused.test:${loop4.port}/`, host: `refused.test:${loop4.port}`, kind: "refused" },
      { tool: "structured_data_suggest", url: "https://nx.test/", host: "nx.test", kind: "refused" },
      { tool: "structured_data_suggest", url: `https://allowed.test:${deadPort}/`, host: `allowed.test:${deadPort}`, kind: "unreachable" },
    ];
    for (const c of cases) {
      const label = `${c.tool} ${c.url}`;
      // A result here would be one built from the gate's answer: told() reports it as DID NOT FAIL.
      const message = await told(hosted(() => tools[c.tool]({ url: c.url, crawl: false, maxPages: 10 }, {})));
      expect(`${label}: ${message}`).toContain(`${label}: ${plain(c.host, c.kind)}`);
      expect(`${label}: ${message}`).not.toMatch(NOT_PLAIN);
    }
    // The same tools do open an allowed page on the hosted server.
    const made = await hosted(() => tools.llms_txt_generate({ url: `http://allowed.test:${allowed.port}/`, crawl: false, maxPages: 10 }, {}));
    expect((JSON.parse(made.content[0].text) as { title?: string }).title).toBe("allowed");
    expectNothingRefusedWasReached();
  }, TIMEOUT);

  test("empathy_audit: an isError result with the plain sentence, not a score of the gate's answer or of a blank page", async () => {
    resetAll();
    const tools = handlersOf(registerAuditTools as never);
    for (const [url, host, kind] of [[`http://refused.test:${loop4.port}/`, `refused.test:${loop4.port}`, "refused"], [`https://allowed.test:${deadPort}/`, `allowed.test:${deadPort}`, "unreachable"]] as const) {
      const answer = await hosted(() => tools.empathy_audit({ url, scope: "viewport" }, {}));
      const text = answer.content[0].text;
      expect(`${url}: ${answer.isError}`).toBe(`${url}: true`);
      const message = (JSON.parse(text) as { message?: string }).message ?? "";
      expect(`${url}: ${message}`).toStartWith(`${url}: ${plain(host, kind)}`);
      expect(`${url}: ${message}`).not.toMatch(NOT_PLAIN);
      expect(`${url}: ${text}`).not.toMatch(/empathyScore|finalScore|egress gate/);
    }
    expectNothingRefusedWasReached();
  }, TIMEOUT);

  test("chaos_test gives the sentence in its result, manage_tabs leaves the new tab blank, and load_session fails with it", async () => {
    resetAll();
    const refusedUrl = `http://refused.test:${loop4.port}/`;
    const seen = await hosted(() => withBrowser({}, async (_page, b) => {
      const context = { getBrowser: async () => b, getToolCount: () => 0 };
      const chaosTools = handlersOf(((server: never) => registerBugAnalysisTools(server, context as never)) as never);
      const tabTools = handlersOf(((server: never) => registerBrowserManagementTools(server, context as never)) as never);
      const sessionTools = handlersOf(((server: never) => registerSessionTools(server, context as never)) as never);
      const chaos = JSON.parse((await chaosTools.chaos_test({ url: refusedUrl }, {})).content[0].text) as { passed: boolean; errors: string[] };
      const tab = JSON.parse((await tabTools.manage_tabs({ action: "create", url: refusedUrl }, {})).content[0].text) as { created: boolean; url: string };
      const tabText = await (await b.getPage()).evaluate(() => document.body?.innerText ?? "");
      // A session saved on an allowed page, whose saved address is then made the refused one.
      expect((await b.navigate(`http://allowed.test:${allowed.port}/`)).success).toBe(true);
      await sessionTools.save_session({ name: "egress-load" }, {});
      const files: string[] = [];
      const walk = (dir: string): void => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name === "egress-load.json") files.push(p); } };
      walk(dataDir);
      expect(files.length).toBe(1);
      const saved = JSON.parse(readFileSync(files[0], "utf8")) as { url: string };
      writeFileSync(files[0], JSON.stringify({ ...saved, url: refusedUrl }));
      const loaded = await told(sessionTools.load_session({ name: "egress-load" }, {}));
      return { chaos, tab, tabText, loaded };
    }));
    expect(seen.chaos.passed).toBe(false);
    expect(seen.chaos.errors).toContain(`Navigation failed: ${plain(`refused.test:${loop4.port}`, "refused")}`);
    expect(JSON.stringify(seen.chaos)).not.toMatch(NOT_PLAIN);
    expect([seen.tab.created, seen.tab.url, seen.tabText]).toEqual([true, "about:blank", ""]);
    expect(seen.loaded).toBe(plain(`refused.test:${loop4.port}`, "refused"));
    expectNothingRefusedWasReached();
  }, TIMEOUT);

  test("not hosted, the same tools report the browser's own refusal, as before (so the two above can fail)", async () => {
    const tools = handlersOf(registerRemediationTools as never);
    const message = await told(tools.llms_txt_generate({ url: `http://127.0.0.2:${deadPort}/`, crawl: false, maxPages: 10 }, {}));
    expect(message).toMatch(/^Connection to 127\.0\.0\.2:\d+ was refused: nothing is listening there, or a firewall rejected it\. Check the address and port\. Nothing was loaded\. \(net::ERR_CONNECTION_REFUSED\)$/);
    const made = await tools.llms_txt_generate({ url: `${allowed.origin}/`, crawl: false, maxPages: 10 }, {});
    expect((JSON.parse(made.content[0].text) as { title?: string }).title).toBe("allowed");
  }, TIMEOUT);
});

describe("one launch at a time (launch-wiring-3)", () => {
  /** An allowed page loads in `b`'s page through whatever gate its browser was started behind. */
  const loads = async (b: Launched): Promise<string> => {
    try {
      const page = await b.getPage();
      const response = await page.goto(`http://allowed.test:${allowed.port}/`, { waitUntil: "domcontentloaded", timeout: 15_000 });
      return `${response?.status()} ${await page.title()}`;
    } catch (e) {
      return `failed: ${(e as Error).message.split("\n")[0]}`;
    }
  };

  test("hosted: close() while the browser is starting waits for it, so no gate is closed under a browser and the session works afterwards", async () => {
    resetAll();
    const listeners = ownListeners();
    const children = browserChildren().map((c) => c.pid);
    // The gaps at which the review saw every later navigation fail (3 to 15 ms after the launch began).
    for (const gapMs of [0, 3, 8, 15]) {
      const outcome = await hosted(async () => {
        const b = new CBrowser({ headless: true, persistent: false });
        try {
          const first = b.getPage().then(() => "fulfilled", () => "rejected");
          await new Promise((r) => setTimeout(r, gapMs));
          await b.close();
          await first;
          const later = [await loads(b), await loads(b)];
          return { later, gates: (ownListeners().length - listeners.length) / 2, browsers: browserChildren().length - children.length };
        } finally {
          await b.close();
        }
      });
      expect(`gap ${gapMs}: ${outcome.later.join(" | ")}`).toBe(`gap ${gapMs}: 200 allowed | 200 allowed`);
      // One browser behind one gate, not a second of either left over from the race.
      expect(`gap ${gapMs}: ${outcome.gates} gate(s), ${outcome.browsers} browser(s)`).toBe(`gap ${gapMs}: 1 gate(s), 1 browser(s)`);
      expect(await listenersSettle(listeners)).toEqual(listeners);
      expect(await childrenSettle(children)).toEqual([...children].sort((a, b) => a - b));
    }
    expectNothingRefusedWasReached();
  }, TIMEOUT);

  test("hosted: two getPage() calls in one tick start one browser behind one gate, and close() leaves nothing", async () => {
    resetAll();
    const listeners = ownListeners();
    const children = browserChildren().map((c) => c.pid);
    const seen = await hosted(async () => {
      const b = new CBrowser({ headless: true, persistent: false });
      try {
        const [one, two] = await Promise.all([b.getPage(), b.getPage()]);
        return { same: one === two, gates: (ownListeners().length - listeners.length) / 2, browsers: browserChildren().length - children.length, loads: await loads(b) };
      } finally {
        await b.close();
      }
    });
    expect(seen).toEqual({ same: true, gates: 1, browsers: 1, loads: "200 allowed" });
    expect(await listenersSettle(listeners)).toEqual(listeners);
    expect(await childrenSettle(children)).toEqual([...children].sort((a, b) => a - b));
  }, TIMEOUT);

  test("hosted: a second launch() while the first is starting gets the first one's outcome, also when it fails, and the gate goes with it", async () => {
    const listeners = ownListeners();
    const { chromium } = await import("playwright");
    const engine = chromium as unknown as { launch: (...args: unknown[]) => Promise<unknown> };
    const realLaunch = engine.launch;
    let starts = 0;
    engine.launch = async () => {
      starts++;
      await new Promise((r) => setTimeout(r, 50));
      throw new Error("start failed (test)");
    };
    const b = new CBrowser({ headless: true, persistent: false });
    try {
      const settled = await hosted(() => Promise.allSettled([b.launch(), b.launch(), b.getPage()]));
      expect(settled.map((x) => (x.status === "rejected" ? (x.reason as Error).message : "fulfilled"))).toEqual(["start failed (test)", "start failed (test)", "start failed (test)"]);
      expect(starts).toBe(1);
      expect((b as unknown as { proxyForwarder: unknown }).proxyForwarder).toBeNull();
      expect(await listenersSettle(listeners)).toEqual(listeners);
      // The failed start is not remembered: the next call starts again.
      engine.launch = realLaunch;
      expect(await hosted(() => loads(b))).toBe("200 allowed");
    } finally {
      engine.launch = realLaunch;
      await b.close();
    }
    expect(await listenersSettle(listeners)).toEqual(listeners);
  }, TIMEOUT);

  test("hosted: a forced close while the browser is starting waits for it too, and takes the gate with the browser", async () => {
    resetAll();
    const listeners = ownListeners();
    const children = browserChildren().map((c) => c.pid);
    for (const gapMs of [0, 5, 15]) {
      const outcome = await hosted(async () => {
        const b = new CBrowser({ headless: true, persistent: false });
        const inside = b as unknown as { forceClose(): Promise<void>; browser: unknown; context: unknown; proxyForwarder: unknown };
        try {
          const first = b.launch().then(() => "fulfilled", () => "rejected");
          await new Promise((r) => setTimeout(r, gapMs));
          await inside.forceClose();
          // The browser that was starting is gone, and so is the gate it was started behind.
          const after = { first: await first, held: [inside.browser, inside.context, inside.proxyForwarder], listeners: (await listenersSettle(listeners)).length - listeners.length };
          return { after, loads: await loads(b) };
        } finally {
          await b.close();
        }
      });
      expect(`gap ${gapMs}: ${JSON.stringify(outcome)}`).toBe(`gap ${gapMs}: ${JSON.stringify({ after: { first: "fulfilled", held: [null, null, null], listeners: 0 }, loads: "200 allowed" })}`);
      expect(await listenersSettle(listeners)).toEqual(listeners);
      expect(await childrenSettle(children)).toEqual([...children].sort((a, b) => a - b));
    }
  }, TIMEOUT);

  test("not hosted: two getPage() calls in one tick start one browser, a close during the start leaves none, and no gate is involved", async () => {
    resetAll();
    const listeners = ownListeners();
    const children = browserChildren().map((c) => c.pid);
    const b = new CBrowser({ headless: true, persistent: false });
    try {
      const [one, two] = await Promise.all([b.getPage(), b.getPage()]);
      expect(one).toBe(two);
      expect(browserChildren().length).toBe(children.length + 1);
      expect(ownListeners()).toEqual(listeners);
      expect((await one.goto(`${loop4.origin}/`))?.status()).toBe(200);
    } finally {
      await b.close();
    }
    expect(await childrenSettle(children)).toEqual([...children].sort((a, b) => a - b));
    for (const gapMs of [3, 15]) {
      const c = new CBrowser({ headless: true, persistent: false });
      try {
        const first = c.launch().then(() => "fulfilled", () => "rejected");
        await new Promise((r) => setTimeout(r, gapMs));
        await c.close();
        expect(`gap ${gapMs}: ${await first}`).toBe(`gap ${gapMs}: fulfilled`);
        const inside = c as unknown as { browser: unknown; context: unknown };
        expect([inside.browser, inside.context]).toEqual([null, null]);
      } finally {
        await c.close();
      }
      expect(await childrenSettle(children)).toEqual([...children].sort((a, b) => a - b));
    }
    expect(ownListeners()).toEqual(listeners);
    expect(asked).toEqual([]);
  }, TIMEOUT);

  test("not hosted: a close() while the saved page is being restored ends that launch, and the next getPage() starts a new browser", async () => {
    resetAll();
    const children = browserChildren().map((c) => c.pid);
    const dir = join(workDir, "restore-race");
    mkdirSync(join(dir, "browser-state"), { recursive: true });
    const saved = (): void => writeFileSync(join(dir, "browser-state", "last-session.json"), JSON.stringify({ url: `${allowed.origin}/slow-page`, timestamp: Date.now() }));
    saved();
    const b = new CBrowser({ headless: true, persistent: true, dataDir: dir });
    try {
      const first = b.launch().then(() => "fulfilled", (e: unknown) => `rejected: ${(e as Error).message.split("\n")[0]}`);
      // The browser has started and the restore is under way once the slow page has been asked for.
      for (let i = 0; i < 300 && !allowed.paths().includes("/slow-page"); i++) await new Promise((r) => setTimeout(r, 50));
      expect(allowed.paths()).toContain("/slow-page");
      await b.close();
      // The restore that was cut short is not the launch the next call is given.
      saved();
      const page = await b.getPage();
      expect(page === null || page === undefined).toBe(false);
      expect(page.isClosed()).toBe(false);
      expect((await page.goto(`${allowed.origin}/missing`, { timeout: 15_000 }))?.status()).toBe(404);
      expect(await first).toBe("fulfilled");
    } finally {
      await b.close();
    }
    expect(await childrenSettle(children)).toEqual([...children].sort((a, b) => a - b));
  }, TIMEOUT);
});

describe("hosted, chromium: the launch itself", () => {
  test("ISC-26: the command line names the gate as the proxy and no bypass beyond Playwright's own loopback marker", async () => {
    for (const proxy of [undefined, upstreamProxy({ bypass: ["127.0.0.1", "localhost", "bypassed.test"] }), { server: `http://127.0.0.1:${upstreamPort}`, bypass: ["127.0.0.1"] }]) {
      const seen = await hosted(() => withBrowser({ proxy }, async (_page, b) => {
        const gate = (b as unknown as { proxyForwarder: { server: string } | null }).proxyForwarder;
        const args = browserChildren().flatMap((c) => c.args);
        return { gate: gate?.server, args };
      }));
      expect(seen.gate).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(seen.args.filter((a) => a.startsWith("--proxy-server"))).toEqual([`--proxy-server=${seen.gate}`]);
      expect(seen.args.filter((a) => a.startsWith("--proxy-bypass-list"))).toEqual(["--proxy-bypass-list=<-loopback>"]);
      expect(seen.args).toContain("--force-webrtc-ip-handling-policy=disable_non_proxied_udp");
      expect(seen.args.join(" ")).not.toContain(UP_PASS);
    }
  }, TIMEOUT);

  test("ISC-26: a socks proxy's bypass list does not reach the browser either", async () => {
    resetAll();
    const args = await hosted(() => withBrowser({ proxy: { server: "socks5://127.0.0.1:9", bypass: ["127.0.0.1", "localhost"] } }, async (page) => {
      // Nothing listens on the socks port: a request that honoured the bypass list would arrive directly.
      await go(page, `${loop4.origin}/`);
      await go(page, `http://localhost:${loop4.port}/`);
      return browserChildren().flatMap((c) => c.args);
    }));
    expect(args.filter((a) => a.startsWith("--proxy-server"))).toEqual(["--proxy-server=socks5://127.0.0.1:9"]);
    expect(args.filter((a) => a.startsWith("--proxy-bypass-list"))).toEqual(["--proxy-bypass-list=<-loopback>"]);
    expectNothingRefusedWasReached();
  }, TIMEOUT);

  test("not hosted, a bypass list does open the direct way (so the two above can fail)", async () => {
    resetAll();
    const seen = await withBrowser({ proxy: { server: `http://127.0.0.1:${upstreamPort}`, bypass: ["127.0.0.1"] } }, async (page) => {
      const body = await go(page, `${loop4.origin}/`);
      return { body, args: browserChildren().flatMap((c) => c.args) };
    });
    expect(seen.body).toContain("refused-v4-body");
    expect(seen.args.filter((a) => a.startsWith("--proxy-bypass-list"))).toEqual(["--proxy-bypass-list=127.0.0.1"]);
  }, TIMEOUT);

  test("ISC-26: with Playwright's loopback switch set the launch throws and no browser starts; not hosted it launches", async () => {
    const before = browserChildren().map((c) => c.pid);
    process.env[LOOPBACK_SWITCH] = "1";
    const b = new CBrowser({ headless: true, persistent: false });
    try {
      await expect(hosted(() => b.launch())).rejects.toThrow(LOOPBACK_SWITCH);
      expect(browserChildren().map((c) => c.pid)).toEqual(before);
      expect((b as unknown as { browser: unknown }).browser).toBeNull();
      // Not hosted the switch is the user's own business, as before.
      await b.launch();
      expect(browserChildren().length).toBe(before.length + 1);
    } finally {
      await b.close();
    }
  }, TIMEOUT);

  test("ISC-16: a gate that cannot start makes the launch throw, and no browser is left behind", async () => {
    resetAll();
    const children = browserChildren().map((c) => c.pid);
    const listeners = ownListeners();
    for (const persistent of [false, true]) {
      const b = new CBrowser({ headless: true, persistent, dataDir: join(workDir, "gate-fails") });
      const restore = breakListen();
      try {
        await expect(hosted(() => b.launch())).rejects.toThrow(/egress gate .*could not start/);
        await expect(hosted(() => b.navigate(`${loop4.origin}/`))).rejects.toThrow(/egress gate .*could not start/);
      } finally {
        restore();
      }
      const inside = b as unknown as { browser: unknown; context: unknown; proxyForwarder: unknown };
      expect([inside.browser, inside.context, inside.proxyForwarder]).toEqual([null, null, null]);
      expect(browserChildren().map((c) => c.pid)).toEqual(children);
      await b.close();
    }
    expect(await listenersSettle(listeners)).toEqual(listeners);
    expectNothingRefusedWasReached();
  }, TIMEOUT);

  test("a launch that fails after the gate started closes the gate", async () => {
    const before = ownListeners();
    const { chromium } = await import("playwright");
    const realLaunch = chromium.launch;
    let gateDuringLaunch = 0;
    chromium.launch = (async () => {
      gateDuringLaunch = ownListeners().length - before.length;
      throw new Error("launch failed (test)");
    }) as typeof realLaunch;
    const b = new CBrowser({ headless: true, persistent: false });
    try {
      await expect(hosted(() => b.launch())).rejects.toThrow("launch failed (test)");
      // The gate was up when the browser was asked for, and is gone now,
      // before anyone calls close(): nobody closes a browser that never was.
      expect(gateDuringLaunch).toBe(2);
      expect((b as unknown as { proxyForwarder: unknown }).proxyForwarder).toBeNull();
      expect(await listenersSettle(before)).toEqual(before);
    } finally {
      chromium.launch = realLaunch;
      await b.close();
    }
  }, TIMEOUT);

  test("a forced close closes the gate with its browser, and the relaunch starts a new one", async () => {
    const before = ownListeners();
    const b = new CBrowser({ headless: true, persistent: false });
    try {
      await hosted(() => b.launch());
      // recoverBrowser's order: forceClose, then launch. The gate goes with the browser it was started for.
      await (b as unknown as { forceClose(): Promise<void> }).forceClose();
      expect((b as unknown as { proxyForwarder: unknown }).proxyForwarder).toBeNull();
      expect(await listenersSettle(before)).toEqual(before);
      await hosted(() => b.launch());
      expect(ownListeners().length).toBe(before.length + 2);
    } finally {
      await b.close();
    }
    expect(await listenersSettle(before)).toEqual(before);
  }, TIMEOUT);

  test("ISC-16 control: with the same failure and no hosted mode, the launch goes ahead", async () => {
    resetAll();
    const restore = breakListen();
    try {
      const body = await withBrowser({}, (page) => go(page, `${loop4.origin}/`));
      expect(body).toContain("refused-v4-body");
    } finally {
      restore();
    }
  }, TIMEOUT);

  test("ISC-10, 14: a persistent profile, as the shared hosted browser uses, goes through the gate too", async () => {
    resetAll();
    const before = ownListeners();
    const seen = await hosted(() => withBrowser({ persistent: true, dataDir: join(workDir, "persistent") }, async (page) => {
      for (const origin of refusedOrigins()) await go(page, `${origin}/`);
      await probe(page, allowed.origin, [loop4.origin, `http://allowed.test:${allowed.port}`]);
      return { listeners: ownListeners().length, args: browserChildren().flatMap((c) => c.args) };
    }));
    expect(seen.listeners).toBe(before.length + 2);
    expect(seen.args.filter((a) => a.startsWith("--proxy-bypass-list"))).toEqual(["--proxy-bypass-list=<-loopback>"]);
    expect(allowed.paths()).toEqual(expect.arrayContaining(PROBED));
    expectNothingRefusedWasReached();
    // Closing the browser closed its gate.
    expect(await listenersSettle(before)).toEqual(before);
  }, TIMEOUT);

  test("ISC-27: webkit with a persistent profile has no WebRTC on the hosted server", async () => {
    resetAll();
    const rtc = await hosted(() => withBrowser({ browser: "webkit", persistent: true, dataDir: join(workDir, "persistent-webkit") }, (page) => runRtc(page, `http://allowed.test:${allowed.port}/rtc`)));
    expect(rtc).toBe("none,absent");
    expect(stunPackets).toBe(0);
  }, TIMEOUT);

  test("the gate is what refuses: with an address decision that allows everything, the same hosted browser does arrive", async () => {
    resetAll();
    setEgressPolicyForTests({ resolve: policy.resolve, allow: () => true });
    try {
      const body = await hosted(() => withBrowser({}, async (page) => {
        await probe(page, allowed.origin, [loop4.origin]);
        return go(page, `${box.origin}/`);
      }));
      expect(body).toContain("refused-box-body");
      expect(loop4.paths()).toEqual(expect.arrayContaining(PROBED));
    } finally {
      setEgressPolicyForTests(policy);
    }
  }, TIMEOUT);

  test("closing the browser closes its gate, and a relaunch gets a new one", async () => {
    const before = ownListeners();
    const b = new CBrowser({ headless: true, persistent: false });
    const gateOf = (): string | undefined => (b as unknown as { proxyForwarder: { server: string } | null }).proxyForwarder?.server;
    try {
      await hosted(() => b.launch());
      expect(gateOf()).toBeDefined();
      expect(ownListeners().length).toBe(before.length + 2);
      await b.close();
      expect(gateOf()).toBeUndefined();
      expect(await listenersSettle(before)).toEqual(before);
      await hosted(() => b.launch());
      expect(gateOf()).toBeDefined();
      expect(ownListeners().length).toBe(before.length + 2);
    } finally {
      await b.close();
    }
    expect(await listenersSettle(before)).toEqual(before);
  }, TIMEOUT);
});
