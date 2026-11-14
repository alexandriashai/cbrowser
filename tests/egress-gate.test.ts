/**
 * The egress gate (src/egress-gate.ts): the local proxy a hosted browser is
 * launched with, which checks the address at the moment of connection.
 *
 * P-10 (plan of 2026-11-07): the hosted servers judged a caller's URL before
 * the browser connected and nothing judged the address at connection time, so
 * a redirect, a subresource, a WebSocket or a name that answered differently
 * on a second lookup reached whatever it pointed at.
 *
 * No browser here. Clients are raw sockets and node:http requests. Targets
 * are listeners this file starts: the "allowed" ones on 127.0.0.2, the
 * "refused" one on 127.0.0.1, with counters for requests AND for TCP
 * connections. The policy is injected: a resolver for invented .test names
 * and an address decision that allows only 127.0.0.2 and 127.0.0.3 (nothing
 * listens on 127.0.0.3). Next to each "refused" case the same request goes
 * through a gate that allows everything and does reach the listener, so the
 * refusal can fail.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { afterAll, beforeAll, beforeEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import { createServer as createHttpServer, request as httpRequest, type IncomingMessage, type Server } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { connect as netConnect, createServer as createNetServer, type Server as NetServer, type Socket } from "node:net";
import { connect as tlsConnect, createServer as createTlsServer } from "node:tls";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { EGRESS_GATE_LIMITS, EGRESS_HEADER, dialOrder, startEgressGate, withoutMark, type EgressGate } from "../src/egress-gate.js";
import { LOOPBACK_READ_BUDGET, loopbackPeerKey, loopbackPeerUid, loopbackPeers, loopbackUserCheck } from "../src/proxy-forwarder.js";
import * as egress from "../src/egress.js";
import type { EgressPolicy } from "../src/egress.js";

// lookup-1: the policy of every resolveForEgress call is recorded here and the
// call passed on unchanged, so a test can see who each lookup was asked as.
// The resolver a test injects is called as given and never sees the policy.
const realResolveForEgress = egress.resolveForEgress;
const policiesSeen: Array<EgressPolicy | undefined> = [];
mock.module("../src/egress.js", () => ({
  ...egress,
  resolveForEgress: (host: string, given?: EgressPolicy) => {
    policiesSeen.push(given);
    return realResolveForEgress(host, given);
  },
}));

const ALLOWED = "127.0.0.2";
const REFUSED = "127.0.0.1";
const LOGIN_USER = "gate-user";
// New for each run: a request that strays in from another test process on
// this machine (a port one of them has just freed) is answered 407, not served.
const LOGIN_PASS = `gate-${randomBytes(6).toString("hex")}`;
/** Whether this machine has ::1. The IPv6 cases are skipped, visibly, where it does not. */
const HAS_V6 = Object.values(networkInterfaces()).some((list) => (list ?? []).some((entry) => entry.address === "::1"));
const MARK = EGRESS_HEADER.toLowerCase();
const LOGIN = `Basic ${Buffer.from(`${LOGIN_USER}:${LOGIN_PASS}`).toString("base64")}`;
const CLIENT_JUNK = `Basic ${Buffer.from("browser:held").toString("base64")}`;

const workDir = mkdtempSync(join(tmpdir(), "cb-egress-gate-"));

// What each listener saw. Reset before every test.
let allowedHits: Array<{ method: string; url: string; headers: IncomingMessage["headers"] }> = [];
let allowedConns = 0;
let refusedHits: string[] = [];
let refusedConns = 0;
let securePages = 0;
let wsConnections = 0;
let rawSeen = "";
let upstreamSeen: Array<{ kind: string; target: string; auth: string | undefined }> = [];
let upstreamConns = 0;
let lookups: string[] = [];
let rebindAsked = 0;
let heldClosed = 0;
let silentConns = 0;
let silentClosed = 0;

let allowed: Server;
let refused: Server;
let secure: Server;
let rawTarget: NetServer;
let silent: NetServer;
let upstream: Server;
let openUpstream: Server;
let wsServer: ReturnType<typeof Bun.serve>;
let certificate: Buffer;
let A = 0; // allowed http
let R = 0; // refused http
let S = 0; // allowed https
let N = 0; // allowed raw TCP
let W = 0; // allowed WebSocket
let U = 0; // upstream proxy that demands the login
let O = 0; // upstream proxy with no login
let Q = 0; // a listener that never answers

let gate: EgressGate; // the policy below
let wideOpen: EgressGate; // allows every address: the control
let gatePort = 0;
let widePort = 0;

const names: Record<string, string[]> = {
  "open.test": [ALLOWED],
  "closed.test": [REFUSED],
  "mixed.test": [ALLOWED, REFUSED],
  "second.test": ["127.0.0.3", ALLOWED],
  "nowhere.test": ["127.0.0.3"],
};
/** The injected lookup. rebind.test answers allowed once and refused ever after. */
const resolve = async (host: string): Promise<string[]> => {
  lookups.push(host);
  if (host === "rebind.test") return rebindAsked++ === 0 ? [ALLOWED] : [REFUSED];
  const found = names[host];
  if (!found) throw new Error("ENOTFOUND");
  return found;
};
const policy = { resolve, allow: (ip: string): boolean => ip === ALLOWED || ip === "127.0.0.3" };
const allowAll = { resolve, allow: (): boolean => true };

const listenOn = (server: { listen(port: number, host: string, fn: () => void): unknown; address(): unknown }, host: string): Promise<number> =>
  new Promise((done) => server.listen(0, host, () => done((server.address() as { port: number }).port)));
const portOf = (g: { server: string }): number => Number(new URL(g.server).port);
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

/** A proxy as a caller's or a region's would be: it resolves names itself, from the same table. */
function makeUpstream(needsLogin: boolean): Server {
  const where = (host: string): string | undefined => names[host]?.[0] ?? (host === "rebind.test" ? REFUSED : undefined);
  const refuseLogin = (req: IncomingMessage): boolean => needsLogin && req.headers["proxy-authorization"] !== LOGIN;
  const proxy = createHttpServer((req, res) => {
    const auth = req.headers["proxy-authorization"];
    if (refuseLogin(req)) {
      res.writeHead(407, { "proxy-authenticate": 'Basic realm="up"', "content-length": "0" });
      res.end();
      return;
    }
    upstreamSeen.push({ kind: "request", target: req.url ?? "", auth });
    const u = new URL(req.url ?? "", "http://unknown.invalid");
    const address = where(u.hostname);
    if (!address) {
      res.writeHead(502, { "content-length": "0" });
      res.end();
      return;
    }
    const headers: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v !== undefined && !k.startsWith("proxy-")) headers[k] = v;
    }
    const out = httpRequest({ host: address, port: Number(u.port) || 80, method: req.method, path: u.pathname + u.search, headers, agent: false }, (upRes) => {
      res.writeHead(upRes.statusCode ?? 502, upRes.headers);
      upRes.pipe(res);
    });
    out.on("error", () => res.destroy());
    req.pipe(out);
  });
  proxy.on("connect", (req, socket: Socket, head: Buffer) => {
    const auth = req.headers["proxy-authorization"];
    if (refuseLogin(req)) {
      socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="up"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
      return;
    }
    upstreamSeen.push({ kind: "connect", target: req.url ?? "", auth });
    const [host, port] = (req.url ?? "").split(":");
    const address = where(host);
    if (!address || address === "127.0.0.3") {
      socket.end("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    const to = netConnect(Number(port), address, () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) to.write(head);
      to.pipe(socket);
      socket.pipe(to);
    });
    to.on("error", () => socket.destroy());
    socket.on("error", () => to.destroy());
  });
  proxy.on("connection", () => { upstreamConns++; });
  return proxy;
}

beforeAll(async () => {
  allowed = createHttpServer((req, res) => {
    allowedHits.push({ method: req.method ?? "", url: req.url ?? "", headers: req.headers });
    if (req.url === "/cut") {
      res.writeHead(200, { "content-type": "text/plain", "transfer-encoding": "chunked" });
      res.write("hello");
      setTimeout(() => res.socket?.destroy(), 50);
      return;
    }
    if (req.url === "/fake-mark") {
      // A site's own 403 that claims to be the gate's.
      res.writeHead(403, { "content-type": "text/plain", "content-length": "4", [EGRESS_HEADER]: "refused" });
      res.end("site");
      return;
    }
    if (req.url === "/hold") {
      // The start of a response that never ends, and a count of when its connection goes.
      req.socket.once("close", () => { heldClosed++; });
      res.writeHead(200, { "content-type": "text/plain" });
      res.write("start");
      return;
    }
    let body = "";
    req.on("data", (d) => { body += d.toString(); });
    req.on("end", () => {
      const text = `allowed-body:${body}`;
      res.writeHead(200, { "content-type": "text/plain", "content-length": String(Buffer.byteLength(text)) });
      res.end(text);
    });
  });
  allowed.on("connection", () => { allowedConns++; });
  A = await listenOn(allowed, ALLOWED);

  refused = createHttpServer((req, res) => {
    refusedHits.push(`${req.method} ${req.url}`);
    res.writeHead(200, { "content-type": "text/plain", "content-length": "12" });
    res.end("refused-body");
  });
  refused.on("connection", () => { refusedConns++; });
  R = await listenOn(refused, REFUSED);

  const keyPath = join(workDir, "k.pem");
  const certPath = join(workDir, "c.pem");
  const made = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath, "-days", "1", "-subj", "/CN=open.test", "-addext", "subjectAltName=DNS:open.test"], { stdio: "ignore" });
  if (made.status !== 0) throw new Error("openssl could not make the test certificate");
  certificate = readFileSync(certPath);
  secure = createHttpsServer({ key: readFileSync(keyPath), cert: certificate }, (req, res) => {
    securePages++;
    res.writeHead(200, { "content-type": "text/plain", "content-length": "11", connection: "close" });
    res.end("secure-body");
  });
  secure.on("connection", () => { allowedConns++; });
  S = await listenOn(secure, ALLOWED);

  // Keeps every byte it is sent. Answers an upgrade with 101 and then echoes,
  // anything else with a short page.
  rawTarget = createNetServer((socket) => {
    allowedConns++;
    let head = "";
    let echo = false;
    socket.on("error", () => { /* the client went away */ });
    socket.on("data", (d) => {
      rawSeen += d.toString("latin1");
      if (echo) {
        socket.write(d);
        return;
      }
      head += d.toString("latin1");
      if (!head.includes("\r\n\r\n")) return;
      if (/^upgrade:/im.test(head)) {
        echo = true;
        socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
      } else {
        socket.end("HTTP/1.1 200 OK\r\nContent-Length: 8\r\nConnection: close\r\n\r\nraw-body");
      }
    });
  });
  N = await listenOn(rawTarget, ALLOWED);

  silent = createNetServer((socket) => {
    silentConns++;
    socket.on("error", () => { /* closed by the gate */ });
    socket.on("close", () => { silentClosed++; });
    socket.resume();
  });
  Q = await listenOn(silent, "127.0.0.1");

  wsServer = Bun.serve({
    port: 0,
    hostname: ALLOWED,
    fetch(req, srv) {
      wsConnections++;
      return srv.upgrade(req) ? undefined : new Response("no", { status: 400 });
    },
    websocket: { message(ws, msg) { ws.send(`pong:${msg}`); } },
  });
  W = wsServer.port!;

  upstream = makeUpstream(true);
  U = await listenOn(upstream, "127.0.0.1");
  openUpstream = makeUpstream(false);
  O = await listenOn(openUpstream, "127.0.0.1");

  gate = await startEgressGate({ policy });
  wideOpen = await startEgressGate({ policy: allowAll });
  gatePort = portOf(gate);
  widePort = portOf(wideOpen);
});

afterAll(async () => {
  await gate?.close();
  await wideOpen?.close();
  for (const s of [allowed, refused, secure, rawTarget, silent, upstream, openUpstream]) s?.close();
  wsServer?.stop(true);
  rmSync(workDir, { recursive: true, force: true });
});

beforeEach(() => {
  allowedHits = [];
  allowedConns = 0;
  refusedHits = [];
  refusedConns = 0;
  securePages = 0;
  wsConnections = 0;
  rawSeen = "";
  upstreamSeen = [];
  upstreamConns = 0;
  lookups = [];
  rebindAsked = 0;
  heldClosed = 0;
  silentConns = 0;
  silentClosed = 0;
});

interface Got { status: number; body: string; complete: boolean; headers: IncomingMessage["headers"] }

/** A plain-http request sent to a gate the way a browser sends one to its proxy. */
function ask(port: number, url: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Got> {
  return new Promise((done) => {
    const req = httpRequest({
      host: "127.0.0.1",
      port,
      method: options.method ?? "GET",
      path: url,
      headers: { host: new URL(url, "http://origin.invalid").host, ...options.headers },
      agent: false,
    }, (res) => {
      let body = "";
      let ended = false;
      res.on("data", (d) => { body += d.toString(); });
      res.on("end", () => { ended = true; });
      res.on("error", () => { /* reported through complete */ });
      res.on("close", () => done({ status: res.statusCode ?? 0, body, complete: ended && res.complete, headers: res.headers }));
    });
    req.on("error", () => done({ status: -1, body: "", complete: false, headers: {} }));
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

interface Head { status: number; head: string; rest: Buffer; socket: Socket }

/** Write `text` to a gate and read one response head. status 0: the connection closed with nothing sent back. */
function send(port: number, text: string, from?: string, fromPort?: number): Promise<Head> {
  return new Promise((done) => {
    const socket = netConnect({ host: "127.0.0.1", port, ...(from ? { localAddress: from } : {}), ...(fromPort ? { localPort: fromPort } : {}) }, () => socket.write(text));
    let got = Buffer.alloc(0);
    let settled = false;
    const settle = (): void => {
      if (settled) return;
      settled = true;
      socket.off("data", onData);
      socket.pause();
      const end = got.indexOf("\r\n\r\n");
      const head = got.subarray(0, end < 0 ? got.length : end).toString("latin1");
      done({ status: Number(/^HTTP\/1\.1 (\d{3})/.exec(head)?.[1] ?? 0), head, rest: end < 0 ? Buffer.alloc(0) : got.subarray(end + 4), socket });
    };
    const onData = (d: Buffer): void => {
      got = Buffer.concat([got, d]);
      if (got.includes("\r\n\r\n")) settle();
    };
    socket.on("data", onData);
    socket.on("error", settle);
    socket.on("close", settle);
  });
}

/** Everything a socket still has to say, until it closes or `ms` pass. */
function drain(socket: Socket, first: Buffer, ms = 1500): Promise<string> {
  return new Promise((done) => {
    let got = first;
    const timer = setTimeout(() => { socket.destroy(); done(got.toString("latin1")); }, ms);
    socket.on("data", (d: Buffer) => { got = Buffer.concat([got, d]); });
    socket.on("close", () => { clearTimeout(timer); done(got.toString("latin1")); });
    socket.resume();
  });
}

/** The next `bytes` bytes from a socket. */
function take(socket: Socket, first: Buffer, bytes: number, ms = 2000): Promise<Buffer> {
  return new Promise((done) => {
    let got = first;
    const finish = (): void => { clearTimeout(timer); socket.off("data", onData); socket.pause(); done(got); };
    const timer = setTimeout(finish, ms);
    const onData = (d: Buffer): void => { got = Buffer.concat([got, d]); if (got.length >= bytes) finish(); };
    socket.on("data", onData);
    socket.resume();
    if (got.length >= bytes) finish();
  });
}

const connectLine = (authority: string, extra = ""): string => `CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n${extra}\r\n`;
const upgradeLines = (url: string, extra = ""): string =>
  `GET ${url} HTTP/1.1\r\nHost: ${/^\w+:\/\/([^/]+)/.exec(url)?.[1] ?? ""}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n${extra}\r\n`;

/** One masked text frame, as a client sends it. */
function frame(text: string): Buffer {
  const payload = Buffer.from(text);
  const mask = [7, 11, 13, 17];
  const out = Buffer.alloc(6 + payload.length);
  out[0] = 0x81;
  out[1] = 0x80 | payload.length;
  for (let i = 0; i < 4; i++) out[2 + i] = mask[i];
  for (let i = 0; i < payload.length; i++) out[6 + i] = payload[i] ^ mask[i % 4];
  return out;
}

/** Send "ping" on an upgraded socket and read the server's one text frame. */
async function pingPong(opened: Head): Promise<string> {
  opened.socket.write(frame("ping"));
  const reply = await take(opened.socket, opened.rest, 2 + "pong:ping".length);
  opened.socket.destroy();
  return reply[0] === 0x81 ? reply.subarray(2, 2 + reply[1]).toString() : `not a text frame: ${reply.toString("latin1")}`;
}

/** GET / over TLS inside an open tunnel. The listener's own certificate is the only one trusted. */
function tlsGet(opened: Head, servername: string): Promise<string> {
  return new Promise((done) => {
    const tls = tlsConnect({ socket: opened.socket, servername, ca: certificate }, () => {
      tls.write(`GET / HTTP/1.1\r\nHost: ${servername}\r\nConnection: close\r\n\r\n`);
    });
    let got = "";
    tls.on("data", (d) => { got += d.toString(); });
    tls.on("error", () => done(`tls error after: ${got}`));
    tls.on("close", () => done(got));
    opened.socket.resume();
  });
}

/**
 * The 127.0.0.1 ports this process is listening on (Linux): its own socket
 * inodes from /proc/self/fd matched against the LISTEN rows of /proc/net/tcp.
 * Columns: sl local_address rem_address st tx:rx tr:tm retrnsmt uid timeout inode.
 */
function ownListeningPorts(): Set<number> {
  const inodes = new Set<string>();
  for (const fd of readdirSync("/proc/self/fd")) {
    try {
      const m = /^socket:\[(\d+)\]$/.exec(readlinkSync(`/proc/self/fd/${fd}`));
      if (m) inodes.add(m[1]);
    } catch { /* the descriptor closed meanwhile */ }
  }
  const ports = new Set<number>();
  for (const line of readFileSync("/proc/net/tcp", "utf8").split("\n")) {
    const cols = line.trim().split(/\s+/);
    if (cols[3] === "0A" && cols[1]?.startsWith("0100007F:") && inodes.has(cols[9])) ports.add(parseInt(cols[1].slice(9), 16));
  }
  return ports;
}

/** The local port of an established connection from 127.0.0.1 to 127.0.0.1:`port` (Linux), or 0. */
function clientPortTo(port: number): number {
  const remote = `0100007F:${port.toString(16).toUpperCase().padStart(4, "0")}`;
  for (const line of readFileSync("/proc/net/tcp", "utf8").split("\n")) {
    const cols = line.trim().split(/\s+/);
    if (cols[2] === remote && cols[3] === "01" && cols[1]?.startsWith("0100007F:")) return parseInt(cols[1].slice(9), 16);
  }
  return 0;
}

// Connects from a given local port, also one whose last connection has just
// closed, sends argument 3 and prints what came back.
const PORT_REUSER = `
import socket, sys
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.settimeout(3)
try:
    s.bind(("127.0.0.1", int(sys.argv[1])))
    s.connect(("127.0.0.1", int(sys.argv[2])))
except Exception as e:
    print("not connected: " + str(e))
    sys.exit(0)
got = b""
try:
    s.sendall(sys.argv[3].encode("latin1"))
    while True:
        d = s.recv(4096)
        if not d:
            break
        got += d
except Exception:
    pass
print("connected, answer: " + repr(got[:15]))
`;

/** Whether the gate closes, within `ms`, a connection on which `act` was done. The client itself never closes. */
function closedByGate(port: number, act: (socket: Socket) => void, ms = 1500): Promise<boolean> {
  return new Promise((done) => {
    const socket = netConnect({ host: "127.0.0.1", port, allowHalfOpen: true }, () => act(socket));
    let waiting = true;
    const timer = setTimeout(() => { waiting = false; socket.destroy(); done(false); }, ms);
    socket.on("error", () => { /* a reset is a close too */ });
    // The gate's end of the connection is what is watched: with half-open
    // allowed, this side sees it as 'end' and stays open itself.
    const gone = (): void => {
      if (!waiting) return;
      waiting = false;
      clearTimeout(timer);
      socket.destroy();
      done(true);
    };
    socket.on("end", gone);
    socket.on("close", gone);
    socket.resume();
  });
}

describe("plain http through the gate", () => {
  test("an allowed name loads, by one lookup, with the name in Host and nothing meant for a proxy", async () => {
    // The Host header names another host: the request line is what was checked, so it is what the target gets.
    const got = await ask(gatePort, `http://open.test:${A}/page?x=1`, { headers: { host: "elsewhere.test", "proxy-authorization": CLIENT_JUNK, "proxy-connection": "keep-alive" } });
    expect(got.status).toBe(200);
    expect(got.body).toBe("allowed-body:");
    expect(lookups).toEqual(["open.test"]);
    expect(allowedHits.length).toBe(1);
    expect(allowedHits[0].url).toBe("/page?x=1");
    expect(allowedHits[0].headers.host).toBe(`open.test:${A}`);
    expect(allowedHits[0].headers["proxy-authorization"]).toBeUndefined();
    expect(allowedHits[0].headers["proxy-connection"]).toBeUndefined();
  });

  test("a request body is passed on, chunked or counted", async () => {
    const chunked = await ask(gatePort, `http://open.test:${A}/post`, { method: "POST", headers: { "transfer-encoding": "chunked" }, body: "one-two" });
    expect(chunked.body).toBe("allowed-body:one-two");
    const counted = await ask(gatePort, `http://open.test:${A}/post`, { method: "POST", headers: { "content-length": "5" }, body: "three" });
    expect(counted.body).toBe("allowed-body:three");
  });

  test("ISC-4: a name that resolves to a refused address gets 403 and no connection is opened", async () => {
    const got = await ask(gatePort, `http://closed.test:${R}/secret`);
    expect(got.status).toBe(403);
    expect(got.body).toContain("egress gate");
    expect(got.body).not.toContain("refused-body");
    expect(refusedHits).toEqual([]);
    expect(refusedConns).toBe(0);
  });

  test("ISC-4 control: the same request through a gate that allows everything does reach the listener", async () => {
    const got = await ask(widePort, `http://closed.test:${R}/secret`);
    expect(got.status).toBe(200);
    expect(got.body).toBe("refused-body");
    expect(refusedHits).toEqual(["GET /secret"]);
    expect(refusedConns).toBe(1);
  });

  test("ISC-4: a refused address written as a literal, in any spelling the URL parser reads, gets 403 with no lookup", async () => {
    // 0x7f.1 and 2130706433 are 127.0.0.1 to a URL parser, and a third slash is skipped.
    const spellings = [`127.0.0.1:${R}`, `0x7f.1:${R}`, `2130706433:${R}`, `/127.0.0.1:${R}`, `user:pass@127.0.0.1:${R}`];
    for (const host of spellings) {
      const got = await send(gatePort, `GET http://${host}/secret HTTP/1.1\r\nHost: open.test:${A}\r\nConnection: close\r\n\r\n`);
      got.socket.destroy();
      expect(`${host} -> ${got.status}`).toBe(`${host} -> 403`);
    }
    expect(lookups).toEqual([]);
    expect(refusedHits).toEqual([]);
    expect(refusedConns).toBe(0);
    expect(allowedConns).toBe(0);
    // Control: allowed, each spelling does reach the listener.
    for (const host of spellings) {
      const got = await send(widePort, `GET http://${host}/secret HTTP/1.1\r\nHost: open.test:${A}\r\nConnection: close\r\n\r\n`);
      expect(`${host} -> ${await drain(got.socket, got.rest)}`).toBe(`${host} -> refused-body`);
    }
    expect(refusedHits.length).toBe(spellings.length);
  });

  test("ISC-7: a name with one refused answer among several is refused, and neither address is connected to", async () => {
    const got = await ask(gatePort, `http://mixed.test:${A}/page`);
    expect(got.status).toBe(403);
    expect(allowedConns).toBe(0);
    expect(refusedConns).toBe(0);
    // Control: allowed, the same name loads from its first answer.
    expect((await ask(widePort, `http://mixed.test:${A}/page`)).body).toBe("allowed-body:");
  });

  test("ISC-6: a rebinding name is looked up once and the connection goes to the first answer", async () => {
    const got = await ask(gatePort, `http://rebind.test:${A}/page`);
    expect(got.status).toBe(200);
    expect(got.body).toBe("allowed-body:");
    expect(rebindAsked).toBe(1);
    expect(lookups).toEqual(["rebind.test"]);
    expect(refusedConns).toBe(0);
    // The resolver would answer the refused address now: the next request is refused.
    expect((await ask(gatePort, `http://rebind.test:${R}/page`)).status).toBe(403);
    expect(refusedConns).toBe(0);
  });

  test("a name that does not resolve is refused", async () => {
    const got = await ask(gatePort, `http://unknown.test:${A}/page`);
    expect(got.status).toBe(403);
    expect(allowedConns).toBe(0);
  });

  test("the next checked address is tried when the first does not accept, and 502 when none does", async () => {
    const second = await ask(gatePort, `http://second.test:${A}/page`);
    expect(second.status).toBe(200);
    expect(second.body).toBe("allowed-body:");
    expect(lookups).toEqual(["second.test"]);
    expect((await ask(gatePort, `http://nowhere.test:${A}/page`)).status).toBe(502);
  });

  test("an address that refuses the connection is passed over at once, not after the wait given to a silent one", async () => {
    // 5 s before the next address would be tried beside one that has not answered.
    const unhurried = await startEgressGate({ policy, timeouts: { nextAddress: 5000 } });
    try {
      const started = Date.now();
      expect((await ask(portOf(unhurried), `http://second.test:${A}/page`)).body).toBe("allowed-body:");
      const tunnel = await send(portOf(unhurried), connectLine(`second.test:${N}`));
      tunnel.socket.destroy();
      expect(tunnel.status).toBe(200);
      expect((await ask(portOf(unhurried), `http://nowhere.test:${A}/page`)).status).toBe(502);
      expect(Date.now() - started).toBeLessThan(2500);
    } finally {
      await unhurried.close();
    }
  });

  test("every request on a kept-alive connection is checked", async () => {
    const first = await send(gatePort, `GET http://open.test:${A}/one HTTP/1.1\r\nHost: open.test:${A}\r\n\r\n`);
    expect(first.status).toBe(200);
    expect((await take(first.socket, first.rest, "allowed-body:".length)).toString()).toBe("allowed-body:");
    const again = new Promise<string>((done) => {
      let got = "";
      first.socket.on("data", (d: Buffer) => { got += d.toString("latin1"); if (/\r\n\r\n[\s\S]*egress gate/.test(got) || got.includes("refused-body")) done(got); });
      first.socket.on("close", () => done(got));
      first.socket.resume();
    });
    first.socket.write(`GET http://closed.test:${R}/two HTTP/1.1\r\nHost: closed.test:${R}\r\n\r\n`);
    const second = await again;
    first.socket.destroy();
    expect(second).toMatch(/^HTTP\/1\.1 403 /);
    expect(refusedHits).toEqual([]);
    expect(refusedConns).toBe(0);
  });

  test("a response cut short by the target is cut short for the client", async () => {
    const got = await ask(gatePort, `http://open.test:${A}/cut`);
    expect(got.status).toBe(200);
    expect(got.body).toBe("hello");
    expect(got.complete).toBe(false);
    // Control: a whole response reads as complete.
    expect((await ask(gatePort, `http://open.test:${A}/whole`)).complete).toBe(true);
  });
});

describe("CONNECT through the gate", () => {
  test("ISC-25: an https target loads end to end through a tunnel to the checked address", async () => {
    const opened = await send(gatePort, connectLine(`open.test:${S}`));
    expect(opened.status).toBe(200);
    expect(await tlsGet(opened, "open.test")).toContain("secure-body");
    expect(securePages).toBe(1);
    expect(lookups).toEqual(["open.test"]);
  });

  test("ISC-5: a tunnel to a refused name or address gets 403 and no connection is opened", async () => {
    for (const authority of [`closed.test:${R}`, `127.0.0.1:${R}`, `mixed.test:${R}`]) {
      const got = await send(gatePort, connectLine(authority));
      expect(got.status).toBe(403);
      expect(await drain(got.socket, got.rest)).toContain("egress gate");
    }
    expect(lookups).toEqual(["closed.test", "mixed.test"]);
    expect(refusedConns).toBe(0);
    expect(allowedConns).toBe(0);
  });

  test("ISC-5 control: the same tunnel through a gate that allows everything does reach the listener", async () => {
    const opened = await send(widePort, connectLine(`closed.test:${R}`));
    expect(opened.status).toBe(200);
    opened.socket.write("GET /inside HTTP/1.1\r\nHost: closed.test\r\nConnection: close\r\n\r\n");
    expect(await drain(opened.socket, opened.rest)).toContain("refused-body");
    expect(refusedHits).toEqual(["GET /inside"]);
    expect(refusedConns).toBe(1);
  });

  test("ISC-6: a rebinding name is looked up once and the tunnel goes to the first answer", async () => {
    const opened = await send(gatePort, connectLine(`rebind.test:${N}`));
    expect(opened.status).toBe(200);
    opened.socket.write("GET /inside HTTP/1.1\r\nHost: rebind.test\r\n\r\n");
    expect(await drain(opened.socket, opened.rest)).toContain("raw-body");
    expect(rebindAsked).toBe(1);
    expect(allowedConns).toBe(1);
    expect(refusedConns).toBe(0);
  });

  test("the next checked address is tried when the first does not accept, and 502 when none does", async () => {
    const opened = await send(gatePort, connectLine(`second.test:${N}`));
    expect(opened.status).toBe(200);
    opened.socket.write("GET /inside HTTP/1.1\r\nHost: second.test\r\n\r\n");
    expect(await drain(opened.socket, opened.rest)).toContain("raw-body");
    const none = await send(gatePort, connectLine(`nowhere.test:${N}`));
    expect(none.status).toBe(502);
    none.socket.destroy();
  });

  test("bytes sent with the CONNECT reach the target after the tunnel opens", async () => {
    const opened = await send(gatePort, `${connectLine(`open.test:${N}`)}GET /early HTTP/1.1\r\nHost: open.test\r\n\r\n`);
    expect(opened.status).toBe(200);
    expect(await drain(opened.socket, opened.rest)).toContain("raw-body");
    expect(rawSeen).toStartWith("GET /early HTTP/1.1");
  });

  test("a CONNECT that follows a plain request on the same connection is checked too", async () => {
    for (const [authority, status] of [[`closed.test:${R}`, 403], [`open.test:${N}`, 200]] as const) {
      const first = await send(gatePort, `GET http://open.test:${A}/one HTTP/1.1\r\nHost: open.test:${A}\r\n\r\n`);
      expect(first.status).toBe(200);
      await take(first.socket, first.rest, "allowed-body:".length);
      const next = new Promise<string>((done) => {
        let got = "";
        first.socket.on("data", (d: Buffer) => { got += d.toString("latin1"); if (got.includes("\r\n\r\n")) done(got); });
        first.socket.on("close", () => done(got));
        first.socket.resume();
      });
      first.socket.write(connectLine(authority));
      const answer = await next;
      first.socket.destroy();
      expect(answer).toStartWith(`HTTP/1.1 ${status} `);
    }
    expect(refusedConns).toBe(0);
  });
});

/** A listener that answers any request with one short page. */
function fixedPage(body: string): NetServer {
  return createNetServer((socket) => {
    socket.on("error", () => { /* the client went away */ });
    socket.on("data", () => socket.end(`HTTP/1.1 200 OK\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n${body}`));
  });
}

const closeServer = (server: NetServer): Promise<void> => new Promise((done) => server.close(() => done()));

// Listens, then stops serving its event loop: the kernel completes
// connections until the accept queue is full and then drops every SYN, so a
// connect to it neither succeeds nor fails.
const STUCK_LISTENER = 'const s = require("node:net").createServer(); s.listen({ port: 0, host: "127.0.0.3", backlog: 1 }, () => { process.stdout.write(s.address().port + "\\n"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); });';

describe("which checked address a connection goes to", () => {
  test("the first answer that accepts is used, for a plain request and for a tunnel", async () => {
    const first = fixedPage("first-answer");
    const second = fixedPage("second-answer");
    let port = 0;
    for (let attempt = 0; attempt < 5 && port === 0; attempt++) {
      const candidate = await listenOn(first, ALLOWED);
      const both = await new Promise<boolean>((done) => {
        second.once("error", () => done(false));
        second.listen(candidate, "127.0.0.3", () => done(true));
      });
      if (both) port = candidate;
      else await closeServer(first);
    }
    expect(port).toBeGreaterThan(0);
    names["both.test"] = [ALLOWED, "127.0.0.3"];
    try {
      expect((await ask(gatePort, `http://both.test:${port}/page`)).body).toBe("first-answer");
      const opened = await send(gatePort, `${connectLine(`both.test:${port}`)}GET / HTTP/1.1\r\n\r\n`);
      expect(await drain(opened.socket, opened.rest)).toEndWith("\r\n\r\nfirst-answer");
    } finally {
      delete names["both.test"];
      await closeServer(first);
      await closeServer(second);
    }
  });

  // regression-4 and policy-2. The checked addresses were walked one after
  // another with the whole connect limit each, so a name whose first address
  // is silent cost 10 s per dead address on every connection. They are raced
  // now: the next one starts beside the previous after nextAddressMs.
  test("an address that does not answer the connect is not waited out: the next one is tried beside it", async () => {
    if (process.platform !== "linux") return;
    // The page that does answer listens on the silent listener's port, on
    // the other address. That port is the child's pick, and now and then it
    // is taken on 127.0.0.2 already (1 run in 27 with nine of these files
    // running at once, 2026-11-12): then another child picks another.
    let child = spawn("node", ["-e", STUCK_LISTENER], { stdio: ["ignore", "pipe", "ignore"] });
    const fillers: Socket[] = [];
    const page = fixedPage("after-the-wait");
    try {
      let port = 0;
      for (let attempt = 0; attempt < 5 && port === 0; attempt++) {
        if (attempt > 0) {
          child.kill("SIGKILL");
          child = spawn("node", ["-e", STUCK_LISTENER], { stdio: ["ignore", "pipe", "ignore"] });
        }
        const running = child;
        const candidate = await new Promise<number>((done, fail) => {
          running.stdout.once("data", (d: Buffer) => done(Number(d.toString().trim())));
          running.once("error", () => fail(new Error("node is needed for the listener that never accepts")));
        });
        const free = await new Promise<boolean>((done) => {
          page.once("error", () => done(false));
          page.listen(candidate, ALLOWED, () => done(true));
        });
        if (free) port = candidate;
      }
      expect(port).toBeGreaterThan(0);
      // Fill its accept queue: connect until one connect is left hanging.
      let hung = false;
      for (let i = 0; i < 1200 && !hung; i++) {
        hung = await new Promise<boolean>((done) => {
          const socket = netConnect(port, "127.0.0.3");
          fillers.push(socket);
          const timer = setTimeout(() => done(true), 250);
          socket.once("connect", () => { clearTimeout(timer); done(false); });
          socket.once("error", () => { clearTimeout(timer); done(false); });
        });
      }
      expect(hung).toBe(true);
      names["slow.test"] = ["127.0.0.3", ALLOWED];
      names["stuck.test"] = ["127.0.0.3"];
      // Connections still being attempted to the silent listener (state SYN_SENT in the kernel's table).
      const silentTarget = `0300007F:${port.toString(16).toUpperCase().padStart(4, "0")}`;
      const attempting = (): number => readFileSync("/proc/net/tcp", "utf8").split("\n").filter((line) => {
        const cols = line.trim().split(/\s+/);
        return cols[2] === silentTarget && cols[3] === "02";
      }).length;
      const attemptingBefore = attempting();
      expect(attemptingBefore).toBeGreaterThanOrEqual(1);
      // The gate with its own limits (10 s to connect): the second address
      // answers after the 250 ms the first is given alone, not after 10 s.
      let started = Date.now();
      expect((await ask(gatePort, `http://slow.test:${port}/page`)).body).toBe("after-the-wait");
      let took = Date.now() - started;
      expect(took).toBeGreaterThanOrEqual(EGRESS_GATE_LIMITS.nextAddressMs - 50);
      expect(took).toBeLessThan(2000);
      started = Date.now();
      const opened = await send(gatePort, `${connectLine(`slow.test:${port}`)}GET / HTTP/1.1\r\n\r\n`);
      took = Date.now() - started;
      expect(opened.status).toBe(200);
      expect(took).toBeGreaterThanOrEqual(EGRESS_GATE_LIMITS.nextAddressMs - 50);
      expect(took).toBeLessThan(2000);
      expect(await drain(opened.socket, opened.rest)).toEndWith("\r\n\r\nafter-the-wait");
      expect(gate.failure("slow.test", port)).toBeUndefined();
      // The attempts that lost are destroyed, not left to connect later: only this test's own hung connect is there.
      expect(attempting()).toBe(attemptingBefore);

      // No address answers: given up on after the connect limit, counted once for all of them.
      const patient = await startEgressGate({ policy, timeouts: { connect: 400 } });
      try {
        started = Date.now();
        const none = await ask(portOf(patient), `http://stuck.test:${port}/page`);
        took = Date.now() - started;
        expect(none.status).toBe(502);
        expect(none.headers[MARK]).toBe("unreachable");
        expect(took).toBeGreaterThanOrEqual(350);
        expect(took).toBeLessThan(3000);
        expect(patient.failure("stuck.test", port)).toBe("unreachable");
        const tunnel = await send(portOf(patient), connectLine(`stuck.test:${port}`));
        tunnel.socket.destroy();
        expect(tunnel.status).toBe(502);
        expect(tunnel.head.toLowerCase()).toContain(`${MARK}: unreachable`);
      } finally {
        await patient.close();
      }

      // tests-8 (G01): an upstream proxy that does not answer the connect is
      // given up on after its limit too, for a plain request as for a CONNECT.
      const chained = await startEgressGate({ policy, upstream: { server: `http://127.0.0.3:${port}` }, timeouts: { upstreamAnswer: 400 } });
      try {
        started = Date.now();
        const none = await ask(portOf(chained), `http://open.test:${A}/page`);
        took = Date.now() - started;
        expect(none.status).toBe(502);
        expect(none.headers[MARK]).toBe("upstream");
        expect(took).toBeGreaterThanOrEqual(350);
        expect(took).toBeLessThan(3000);
        expect(chained.failure("open.test", A)).toBe("upstream");
      } finally {
        await chained.close();
      }
      expect(allowedHits).toEqual([]);
    } finally {
      delete names["slow.test"];
      delete names["stuck.test"];
      for (const socket of fillers) socket.destroy();
      child.kill("SIGKILL");
      if (page.listening) await closeServer(page);
    }
  }, 30_000);

  test("the two families take turns, from the family of the first answer on", () => {
    expect(dialOrder([])).toEqual([]);
    expect(dialOrder(["192.0.2.1"])).toEqual(["192.0.2.1"]);
    expect(dialOrder(["192.0.2.1", "192.0.2.2", "192.0.2.3"])).toEqual(["192.0.2.1", "192.0.2.2", "192.0.2.3"]);
    expect(dialOrder(["2001:db8::1", "192.0.2.1"])).toEqual(["2001:db8::1", "192.0.2.1"]);
    // Three AAAA records, then three A records, as this machine's resolver sorts a dual-stack name.
    expect(dialOrder(["2001:db8::1", "2001:db8::2", "2001:db8::3", "192.0.2.1", "192.0.2.2", "192.0.2.3"]))
      .toEqual(["2001:db8::1", "192.0.2.1", "2001:db8::2", "192.0.2.2", "2001:db8::3", "192.0.2.3"]);
    expect(dialOrder(["192.0.2.1", "192.0.2.2", "2001:db8::1"])).toEqual(["192.0.2.1", "2001:db8::1", "192.0.2.2"]);
  });
});

// Listens on `count` addresses from 127.0.0.<base> on, all on one port, and
// never accepts: see STUCK_LISTENER. Prints the port, or 0 when one of the
// addresses has that port taken already (the caller tries again).
const STUCK_LISTENERS = 'const net = require("node:net"); const [n, base] = process.argv.slice(1).map(Number); let port = 0; const next = (i) => { if (i === n) { process.stdout.write(port + "\\n"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); return; } const s = net.createServer(); s.once("error", () => { process.stdout.write("0\\n"); process.exit(0); }); s.listen({ port, host: "127.0.0." + (base + i), backlog: 1 }, () => { port = s.address().port; next(i + 1); }); }; next(0);';

/** /proc/net/tcp's form of 127.0.0.<last>:<port>. */
const tcpAddress = (ip: string, port: number): string => {
  const [a, b, c, d] = ip.split(".").map((part) => Number(part).toString(16).toUpperCase().padStart(2, "0"));
  return `${d}${c}${b}${a}:${port.toString(16).toUpperCase().padStart(4, "0")}`;
};

/** Rows of the kernel's IPv4 table: [local, remote, state]. */
const tcpRows = (): string[][] => readFileSync("/proc/net/tcp", "utf8").split("\n").slice(1).map((line) => line.trim().split(/\s+/).slice(1, 4)).filter((cols) => cols.length === 3);

interface Silent {
  port: number;
  addresses: string[];
  /** Connections being attempted to the addresses (SYN_SENT) beyond this setup's own. */
  attempting: () => number;
  /** Which of the addresses have such an attempt beyond this setup's own. */
  attempted: () => string[];
  stop: () => void;
}

/** `count` addresses on loopback that neither accept nor refuse a connection (Linux). */
async function silentAddresses(count: number, base: number): Promise<Silent> {
  let child: ReturnType<typeof spawn> | undefined;
  let port = 0;
  for (let attempt = 0; attempt < 5 && port === 0; attempt++) {
    child?.kill("SIGKILL");
    const running = spawn("node", ["-e", STUCK_LISTENERS, String(count), String(base)], { stdio: ["ignore", "pipe", "ignore"] });
    child = running;
    port = await new Promise<number>((done, fail) => {
      running.stdout!.once("data", (d: Buffer) => done(Number(d.toString().trim())));
      running.once("error", () => fail(new Error("node is needed for the listeners that never accept")));
    });
  }
  expect(port).toBeGreaterThan(0);
  const addresses = Array.from({ length: count }, (_, i) => `127.0.0.${base + i}`);
  const remotes = new Map(addresses.map((ip) => [tcpAddress(ip, port), ip]));
  const perAddress = (): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const [, remote, state] of tcpRows()) {
      const ip = remotes.get(remote);
      if (ip && state === "02") counts.set(ip, (counts.get(ip) ?? 0) + 1);
    }
    return counts;
  };
  // Fill every accept queue (backlog 1 holds two): the connects past that hang.
  const fillers: Socket[] = [];
  for (const ip of addresses) {
    for (let i = 0; i < 4; i++) {
      const socket = netConnect(port, ip);
      socket.on("error", () => { /* destroyed at the end */ });
      fillers.push(socket);
    }
  }
  let own = perAddress();
  for (let i = 0; i < 80 && addresses.some((ip) => !own.get(ip)); i++) {
    await sleep(25);
    own = perAddress();
  }
  expect(addresses.filter((ip) => !own.get(ip))).toEqual([]);
  const beyond = (): Map<string, number> => {
    const now = perAddress();
    for (const [ip, n] of own) now.set(ip, (now.get(ip) ?? 0) - n);
    return now;
  };
  return {
    port,
    addresses,
    attempting: () => [...beyond().values()].reduce((sum, n) => sum + Math.max(0, n), 0),
    attempted: () => [...beyond()].filter(([, n]) => n > 0).map(([ip]) => ip),
    stop: () => {
      for (const socket of fillers) socket.destroy();
      child?.kill("SIGKILL");
    },
  };
}

/** The gate's side of the connection from 127.0.0.1:`clientPort` to its port, in any state but TIME_WAIT. */
const gateSide = (gatePortNumber: number, clientPort: number | undefined): string[] => {
  const local = tcpAddress("127.0.0.1", gatePortNumber);
  const remote = tcpAddress("127.0.0.1", clientPort ?? 0);
  return tcpRows().filter(([l, r, state]) => l === local && r === remote && state !== "06").map(([, , state]) => state);
};

// gate-1, second review. A CONNECT to a name with many silent addresses made
// the gate start one more connect every 250 ms and keep all of them for the
// whole 10 s limit, also after the browser had gone: about 40 sockets sending
// SYNs to addresses the page chose, per aborted fetch.
describe("gate-1: the race over a target's addresses is bounded, and ends when the client goes", () => {
  test("a client that leaves mid-race leaves no attempt and no connection behind, in every request shape", async () => {
    if (process.platform !== "linux") return;
    const silent = await silentAddresses(6, 100);
    names["many.test"] = silent.addresses;
    try {
      const shapes = [
        connectLine(`many.test:${silent.port}`),
        `GET http://many.test:${silent.port}/page HTTP/1.1\r\nHost: many.test:${silent.port}\r\n\r\n`,
        upgradeLines(`ws://many.test:${silent.port}/socket`),
      ];
      for (const text of shapes) {
        const client = netConnect(widePort, "127.0.0.1", () => client.write(text));
        client.on("error", () => { /* destroyed below */ });
        let answered = false;
        client.on("data", () => { answered = true; });
        await sleep(700);
        // The race is on (the gate with its own limits gives it 10 s), with no more than two attempts open.
        const racing = silent.attempting();
        expect({ text, answered, racing: racing >= 1 && racing <= EGRESS_GATE_LIMITS.dialAttempts }).toEqual({ text, answered: false, racing: true });
        const clientPort = client.localPort;
        expect(gateSide(widePort, clientPort).length).toBeGreaterThan(0);
        client.destroy();
        await sleep(100);
        expect({ text, attempting: silent.attempting(), gateSide: gateSide(widePort, clientPort) }).toEqual({ text, attempting: 0, gateSide: [] });
        // Nothing is recorded for a target the client gave up on.
        expect(wideOpen.failure("many.test", silent.port)).toBeUndefined();
      }
    } finally {
      delete names["many.test"];
      silent.stop();
    }
  }, 30_000);

  test("a name with 40 silent addresses never has more than two attempts open, and only the first ones are tried", async () => {
    if (process.platform !== "linux") return;
    const silent = await silentAddresses(40, 100);
    names["forty.test"] = silent.addresses;
    const patient = await startEgressGate({ policy: allowAll, timeouts: { connect: 1500 } });
    try {
      let peak = 0;
      const seen = new Set<string>();
      let answer: Got | undefined;
      const asking = ask(portOf(patient), `http://forty.test:${silent.port}/page`).then((got) => { answer = got; });
      while (!answer) {
        peak = Math.max(peak, silent.attempting());
        for (const ip of silent.attempted()) seen.add(ip);
        await sleep(20);
      }
      await asking;
      expect(answer.status).toBe(502);
      expect(answer.headers[MARK]).toBe("unreachable");
      expect(peak).toBe(EGRESS_GATE_LIMITS.dialAttempts);
      // Silent addresses never fail, so no third one is started at all.
      expect([...seen].sort()).toEqual(silent.addresses.slice(0, 2));
      expect(silent.attempting()).toBe(0);
    } finally {
      delete names["forty.test"];
      await patient.close();
      silent.stop();
    }
  }, 30_000);

  test("only the first eight addresses are tried: a ninth that would answer is not reached", async () => {
    // Nothing listens on these at the allowed listener's port: each refuses at once.
    const refusing = Array.from({ length: EGRESS_GATE_LIMITS.dialAddresses }, (_, i) => `127.0.0.${150 + i}`);
    names["ninth.test"] = [...refusing, ALLOWED];
    names["eighth.test"] = [...refusing.slice(0, -1), ALLOWED];
    try {
      const ninth = await ask(widePort, `http://ninth.test:${A}/page`);
      expect(ninth.status).toBe(502);
      expect(ninth.headers[MARK]).toBe("unreachable");
      expect(allowedHits).toEqual([]);
      // Control: the eighth is tried, after the seven before it refused.
      const eighth = await ask(widePort, `http://eighth.test:${A}/page`);
      expect(eighth.status).toBe(200);
      expect(allowedHits.length).toBe(1);
    } finally {
      delete names["ninth.test"];
      delete names["eighth.test"];
    }
  });

  test("a CONNECT through an upstream that never answers is let go of when the client goes", async () => {
    const chained = await startEgressGate({ policy, upstream: { server: `http://127.0.0.1:${Q}` } });
    try {
      const client = netConnect(portOf(chained), "127.0.0.1", () => client.write(connectLine(`open.test:${N}`)));
      client.on("error", () => { /* destroyed below */ });
      for (let i = 0; i < 40 && silentConns === 0; i++) await sleep(25);
      await sleep(200);
      // Control: while the client is there the gate waits for the upstream (30 s with its own limits).
      expect(silentConns).toBe(1);
      expect(silentClosed).toBe(0);
      client.destroy();
      for (let i = 0; i < 20 && silentClosed === 0; i++) await sleep(10);
      expect(silentClosed).toBe(1);
      expect(chained.failure("open.test", N)).toBeUndefined();
    } finally {
      await chained.close();
    }
  });
  test("bytes a client sends while its tunnel is being opened reach the target in order, and sending some does not hide its leaving", async () => {
    // An upstream that answers a CONNECT after 300 ms and keeps what comes after the head.
    let afterHead = "";
    const slow = createNetServer((socket) => {
      socket.on("error", () => { /* the gate went away */ });
      let head = "";
      let open = false;
      socket.on("data", (d: Buffer) => {
        if (open) {
          afterHead += d.toString("latin1");
          return;
        }
        head += d.toString("latin1");
        const end = head.indexOf("\r\n\r\n");
        if (end < 0) return;
        open = true;
        afterHead += head.slice(end + 4);
        setTimeout(() => socket.write("HTTP/1.1 200 Connection Established\r\n\r\n"), 300);
      });
    });
    const port = await listenOn(slow, "127.0.0.1");
    const chained = await startEgressGate({ policy, upstream: { server: `http://127.0.0.1:${port}` } });
    const waiting = await startEgressGate({ policy, upstream: { server: `http://127.0.0.1:${Q}` } });
    try {
      const client = netConnect(portOf(chained), "127.0.0.1", () => client.write(`${connectLine(`open.test:${N}`)}FIRST`));
      client.on("error", () => { /* destroyed below */ });
      await sleep(100);
      client.write("-LATER");
      let answer = "";
      client.on("data", (d: Buffer) => { answer += d.toString("latin1"); });
      for (let i = 0; i < 40 && !answer; i++) await sleep(25);
      expect(answer).toBe("HTTP/1.1 200 Connection Established\r\n\r\n");
      client.write("-AFTER");
      for (let i = 0; i < 40 && !afterHead.endsWith("-AFTER"); i++) await sleep(25);
      client.destroy();
      expect(afterHead).toBe("FIRST-LATER-AFTER");

      // A client that sent bytes after its CONNECT and then left: the wait for the upstream ends.
      const leaving = netConnect(portOf(waiting), "127.0.0.1", () => leaving.write(connectLine(`open.test:${N}`)));
      leaving.on("error", () => { /* destroyed below */ });
      for (let i = 0; i < 40 && silentConns === 0; i++) await sleep(25);
      leaving.write("pending bytes");
      await sleep(100);
      expect(silentClosed).toBe(0);
      leaving.end();
      for (let i = 0; i < 20 && silentClosed === 0; i++) await sleep(10);
      expect(silentClosed).toBe(1);
    } finally {
      await chained.close();
      await waiting.close();
      await closeServer(slow);
    }
  });
});

describe("lookup-1: every lookup a gate asks for is asked as that gate", () => {
  test("one owner per gate, the same for every request shape, and the injected lookup and decision kept", async () => {
    policiesSeen.length = 0;
    expect((await ask(gatePort, `http://open.test:${A}/page`)).status).toBe(200);
    const tunnel = await send(gatePort, connectLine(`open.test:${N}`));
    tunnel.socket.destroy();
    const socketUp = await send(gatePort, upgradeLines(`ws://open.test:${N}/socket`));
    socketUp.socket.destroy();
    expect((await ask(widePort, `http://open.test:${A}/page`)).status).toBe(200);
    // A gate given no policy at all asks as itself too. A literal needs no lookup, and the default decision refuses loopback.
    const plainGate = await startEgressGate();
    try {
      expect((await ask(portOf(plainGate), `http://127.0.0.1:${R}/page`)).status).toBe(403);
    } finally {
      await plainGate.close();
    }
    expect(policiesSeen.length).toBe(5);
    const [first, second, third, other, bare] = policiesSeen;
    expect(typeof first?.owner).toBe("object");
    expect(second?.owner).toBe(first!.owner!);
    expect(third?.owner).toBe(first!.owner!);
    expect(other?.owner).not.toBe(first!.owner!);
    expect(typeof other?.owner).toBe("object");
    expect(typeof bare?.owner).toBe("object");
    expect(bare?.owner).not.toBe(first!.owner!);
    expect(bare?.owner).not.toBe(other!.owner!);
    expect(first?.resolve).toBe(resolve);
    expect(first?.allow).toBe(policy.allow);
    expect(other?.allow).toBe(allowAll.allow);
    // The caller's policy object is left as it was given.
    expect(Object.keys(policy).sort()).toEqual(["allow", "resolve"]);
  });
});

describe("an absolute ws:// request with Upgrade (webkit's WebSockets)", () => {
  test("ISC-25: a WebSocket opens and carries frames both ways", async () => {
    const opened = await send(gatePort, upgradeLines(`ws://open.test:${W}/socket`));
    expect(opened.status).toBe(101);
    expect(await pingPong(opened)).toBe("pong:ping");
    expect(wsConnections).toBe(1);
    expect(lookups).toEqual(["open.test"]);
  });

  test("the target gets an origin-form request with the name in Host and no proxy header", async () => {
    const opened = await send(gatePort, upgradeLines(`ws://open.test:${N}/socket?room=1`, `Proxy-Authorization: ${CLIENT_JUNK}\r\nProxy-Connection: keep-alive\r\nOrigin: http://page.test\r\n`));
    expect(opened.status).toBe(101);
    opened.socket.write("after-the-upgrade");
    expect((await take(opened.socket, opened.rest, "after-the-upgrade".length)).toString()).toBe("after-the-upgrade");
    opened.socket.destroy();
    expect(rawSeen).toStartWith(`GET /socket?room=1 HTTP/1.1\r\nHost: open.test:${N}\r\n`);
    expect(rawSeen).toContain("Upgrade: websocket\r\n");
    expect(rawSeen).toContain("Origin: http://page.test\r\n");
    expect(rawSeen.match(/^host:/gim)?.length).toBe(1);
    expect(rawSeen.toLowerCase()).not.toContain("proxy-");
    expect(rawSeen).not.toContain(CLIENT_JUNK);
  });

  test("ISC-25: a WebSocket to a refused name or address gets 403 and no connection is opened", async () => {
    for (const url of [`ws://closed.test:${R}/socket`, `ws://127.0.0.1:${R}/socket`, `ws://mixed.test:${R}/socket`]) {
      const got = await send(gatePort, upgradeLines(url));
      expect(got.status).toBe(403);
      got.socket.destroy();
    }
    expect(refusedConns).toBe(0);
    expect(allowedConns).toBe(0);
    expect(refusedHits).toEqual([]);
  });

  test("ISC-25 control: the same WebSocket request through a gate that allows everything does reach the listener", async () => {
    const got = await send(widePort, upgradeLines(`ws://closed.test:${R}/socket`));
    got.socket.destroy();
    await sleep(50);
    expect(refusedConns).toBe(1);
  });

  test("ISC-6: a rebinding name is looked up once and the WebSocket goes to the first answer", async () => {
    const opened = await send(gatePort, upgradeLines(`ws://rebind.test:${W}/socket`));
    expect(opened.status).toBe(101);
    expect(await pingPong(opened)).toBe("pong:ping");
    expect(rebindAsked).toBe(1);
    expect(refusedConns).toBe(0);
  });

  test("an http:// URL with Upgrade is served the same way, and checked", async () => {
    const opened = await send(gatePort, upgradeLines(`http://open.test:${W}/socket`));
    expect(opened.status).toBe(101);
    expect(await pingPong(opened)).toBe("pong:ping");
    const got = await send(gatePort, upgradeLines(`http://closed.test:${R}/socket`));
    got.socket.destroy();
    expect(got.status).toBe(403);
    expect(refusedConns).toBe(0);
    expect(refusedHits).toEqual([]);
  });
});

describe("ISC-9: only proxy requests, only loopback clients of the gate's own user", () => {
  test("a request that is not a proxy request, or names no host or port, gets 400 and no lookup", async () => {
    const plainRequests = ["/origin-form", `http://open.test:0/`, `http://open.test:99999/`, "http:///", `ftp://open.test:${A}/file`, `https://open.test:${S}/`];
    for (const target of plainRequests) {
      const got = await send(gatePort, `GET ${target} HTTP/1.1\r\nHost: open.test\r\nConnection: close\r\n\r\n`);
      got.socket.destroy();
      expect(`${target} -> ${got.status}`).toBe(`${target} -> 400`);
    }
    for (const authority of ["open.test", "open.test:0", "open.test:65536", "open.test:123456", `:${A}`, `http://open.test:${A}/`, `open.test:${A}/path`, `[open.test]:${A}`, `[127.0.0.1]:${A}`, `user@open.test:${A}`]) {
      const got = await send(gatePort, connectLine(authority));
      got.socket.destroy();
      expect(`${authority} -> ${got.status}`).toBe(`${authority} -> 400`);
    }
    for (const url of [`ws://open.test:0/socket`, `ws://open.test:99999/socket`, `wss://open.test:${W}/socket`]) {
      const got = await send(gatePort, upgradeLines(url));
      got.socket.destroy();
      expect(`${url} -> ${got.status}`).toBe(`${url} -> 400`);
    }
    // A ws:// request line with no Upgrade header, a header line that is not one, and a line that is not a request.
    for (const text of [
      `GET ws://open.test:${W}/socket HTTP/1.1\r\nHost: open.test\r\n\r\n`,
      `CONNECT open.test:${N} HTTP/1.1\r\nnot a header\r\n\r\n`,
      `CONNECT open.test:${N} HTTP/1.1\r\n folded: value\r\n\r\n`,
      `hello\r\n\r\n`,
      `GET  http://open.test:${A}/ HTTP/1.1\r\n\r\n`,
    ]) {
      const got = await send(gatePort, text);
      got.socket.destroy();
      expect(`${JSON.stringify(text.slice(0, 40))} -> ${got.status}`).toBe(`${JSON.stringify(text.slice(0, 40))} -> 400`);
    }
    expect(lookups).toEqual([]);
    expect(allowedConns).toBe(0);
    expect(wsConnections).toBe(0);
  });

  test("a request line or a head that never ends is answered 400, not held", async () => {
    const longLine = await send(gatePort, `GET /${"a".repeat(70 * 1024)}`);
    longLine.socket.destroy();
    expect(longLine.status).toBe(400);
    const longHead = await send(gatePort, `CONNECT open.test:${N} HTTP/1.1\r\nX-Fill: ${"a".repeat(70 * 1024)}`);
    longHead.socket.destroy();
    expect(longHead.status).toBe(400);
    expect(allowedConns).toBe(0);
  });

  test("a client on another loopback address is not served, in any request shape", async () => {
    for (const text of [
      `GET http://open.test:${A}/page HTTP/1.1\r\nHost: open.test:${A}\r\n\r\n`,
      connectLine(`open.test:${N}`),
      upgradeLines(`ws://open.test:${W}/socket`),
    ]) {
      const other = await send(gatePort, text, "127.0.0.2");
      other.socket.destroy();
      expect(other.status).toBe(0);
      expect(other.head).toBe("");
      // Control: the same bytes from 127.0.0.1 are served.
      const mine = await send(gatePort, text);
      mine.socket.destroy();
      expect([200, 101]).toContain(mine.status);
    }
    expect(lookups.length).toBe(3);
  });

  test("a client of another user is not served", async () => {
    if (process.platform !== "linux") return;
    const someoneElse = await startEgressGate({ policy, uid: (process.getuid?.() ?? 0) + 4242 });
    try {
      expect((await ask(portOf(someoneElse), `http://open.test:${A}/page`)).status).toBe(-1);
      const tunnel = await send(portOf(someoneElse), connectLine(`open.test:${N}`));
      tunnel.socket.destroy();
      expect(tunnel.status).toBe(0);
      expect(lookups).toEqual([]);
      expect(allowedConns).toBe(0);
      // Control: this user's own gate serves the same request.
      expect((await ask(gatePort, `http://open.test:${A}/page`)).status).toBe(200);
    } finally {
      await someoneElse.close();
    }
  });

  // tests-4. The inner listener used to serve any local client of this
  // process's user, which no test could tell from serving every user. It now
  // serves only the connections the front opened to it, so this test, a
  // local client of the same user, must be refused there.
  test("the gate's second listener serves only the front's own connections, and close() frees both", async () => {
    if (process.platform !== "linux") return;
    const before = ownListeningPorts();
    const mine = await startEgressGate({ policy });
    const fresh = [...ownListeningPorts()].filter((p) => !before.has(p));
    expect(fresh.length).toBe(2);
    expect(fresh).toContain(portOf(mine));
    const inner = fresh.find((p) => p !== portOf(mine))!;
    try {
      const page = `GET http://open.test:${A}/page HTTP/1.1\r\nHost: open.test:${A}\r\n\r\n`;
      for (const text of [page, connectLine(`open.test:${N}`)]) {
        const direct = await send(inner, text);
        direct.socket.destroy();
        expect(direct.status).toBe(0);
        expect(direct.head).toBe("");
      }
      // An absolute ws:// request never reaches the gate's code on this
      // listener under Bun, whose http server answers it 400 itself (the
      // reason the front exists). Under Node it does, and the Node run below
      // asserts it is refused like the other two.
      const socketUp = await send(inner, upgradeLines(`ws://open.test:${W}/socket`));
      socketUp.socket.destroy();
      expect([0, 400]).toContain(socketUp.status);
      expect(lookups).toEqual([]);
      expect(allowedConns).toBe(0);
      expect(wsConnections).toBe(0);
      // And one that sends nothing is let go of once the time it had to turn
      // out to be a relay is up (a second), not kept and not dropped sooner.
      const silentFrom = Date.now();
      expect(await closedByGate(inner, () => { /* silent */ }, EGRESS_GATE_LIMITS.relayClaimMs + 3000)).toBe(true);
      expect(Date.now() - silentFrom).toBeGreaterThanOrEqual(EGRESS_GATE_LIMITS.relayClaimMs - 100);
      // Control: the same bytes through the front are served, by this inner listener.
      const kept = await send(portOf(mine), page);
      expect(kept.status).toBe(200);
      await take(kept.socket, kept.rest, "allowed-body:".length);
      // That connection is still open, so its relay's port is one the inner
      // listener serves: from 127.0.0.1 only. A client that binds the same
      // port on another loopback address is a different connection.
      const relayPort = clientPortTo(inner);
      expect(relayPort).toBeGreaterThan(0);
      const borrowed = await send(inner, page, "127.0.0.2", relayPort);
      borrowed.socket.destroy();
      expect(borrowed.status).toBe(0);
      const again = await send(inner, page);
      again.socket.destroy();
      expect(again.status).toBe(0);
      // The kept connection itself goes on being served, and checked, also
      // past the second after which a connection that is nobody's relay goes.
      await sleep(EGRESS_GATE_LIMITS.relayClaimMs + 300);
      const next = new Promise<string>((done) => {
        let got = "";
        kept.socket.on("data", (d: Buffer) => { got += d.toString("latin1"); if (got.includes("\r\n\r\n")) done(got); });
        kept.socket.on("close", () => done(got));
        kept.socket.resume();
      });
      kept.socket.write(`GET http://closed.test:${R}/two HTTP/1.1\r\nHost: closed.test:${R}\r\n\r\n`);
      expect(await next).toStartWith("HTTP/1.1 403 ");
      kept.socket.destroy();
      expect(allowedHits.length).toBe(1);
      expect(refusedConns).toBe(0);
    } finally {
      await mine.close();
    }
    const after = ownListeningPorts();
    expect(fresh.filter((p) => after.has(p))).toEqual([]);
  });

  // The kernel hands a port out again once its connection is gone, so a
  // relay's port must stop being served when the relay closes. The relay's
  // connection is ended from the inner listener's side here (a request with
  // Connection: close), which leaves the relay's port free at once: closed
  // from the relay's side it stays taken for a minute (TIME_WAIT; binding it
  // again gave EADDRINUSE from node, bun and python alike, 2026-11-12). The
  // later client is a few lines of python, so that this process, which is
  // the gate, stays free to answer it. Skipped, visibly, without python3 or
  // off Linux.
  test.skipIf(process.platform !== "linux" || spawnSync("python3", ["--version"]).status !== 0)("a relay's port is nobody's once the relay has closed", async () => {
    const before = ownListeningPorts();
    const mine = await startEgressGate({ policy });
    const inner = [...ownListeningPorts()].find((p) => !before.has(p) && p !== portOf(mine))!;
    const page = `GET http://open.test:${A}/page HTTP/1.1\r\nHost: open.test:${A}\r\n\r\n`;
    try {
      // Now and then both ends close at the same moment and the relay's port
      // stays taken after all (1 run in 15 here): then the client cannot
      // bind it, says so, and the whole exchange is made again.
      let said = "";
      let rounds = 0;
      while (rounds < 10 && !said.startsWith("connected")) {
        rounds++;
        const kept = await send(portOf(mine), page);
        expect(kept.status).toBe(200);
        await take(kept.socket, kept.rest, "allowed-body:".length);
        const relayPort = clientPortTo(inner);
        expect(relayPort).toBeGreaterThan(0);
        const closedFromInside = new Promise<void>((done) => {
          kept.socket.on("close", () => done());
          kept.socket.resume();
        });
        kept.socket.write(page.replace("\r\n\r\n", "\r\nConnection: close\r\n\r\n"));
        await closedFromInside;
        for (let i = 0; i < 40 && clientPortTo(inner) !== 0; i++) await sleep(25);
        expect(clientPortTo(inner)).toBe(0);
        await sleep(50);
        const child = spawn("python3", ["-c", PORT_REUSER, String(relayPort), String(inner), page], { stdio: ["ignore", "pipe", "ignore"] });
        said = "";
        child.stdout.on("data", (d: Buffer) => { said += d.toString(); });
        await new Promise((done) => child.once("close", done));
        said = said.trim();
      }
      // It did connect, from that port, and was told nothing.
      expect(said).toBe("connected, answer: b''");
      expect(allowedHits.length).toBe(2 * rounds);
    } finally {
      await mine.close();
    }
  }, 15_000);

  test("many plain connections at once are each matched to their own relay and served", async () => {
    const page = `GET http://open.test:${A}/page HTTP/1.1\r\nHost: open.test:${A}\r\nConnection: close\r\n\r\n`;
    const all = await Promise.all(Array.from({ length: 40 }, () => send(gatePort, page)));
    for (const one of all) one.socket.destroy();
    expect(all.filter((one) => one.status === 200).length).toBe(40);
    expect(allowedHits.length).toBe(40);
  });

  test("close() ends open tunnels and frees the port", async () => {
    const mine = await startEgressGate({ policy });
    const port = portOf(mine);
    const opened = await send(port, connectLine(`open.test:${N}`));
    expect(opened.status).toBe(200);
    const ended = new Promise<boolean>((done) => {
      opened.socket.on("close", () => done(true));
      opened.socket.resume();
    });
    const mineBefore = process.platform === "linux" ? ownListeningPorts().has(port) : true;
    await mine.close();
    expect(await Promise.race([ended, sleep(1500).then(() => false)])).toBe(true);
    // Asked of this process's own sockets, not by connecting to the port:
    // once freed, any process on the machine may be listening on it (tests-7).
    expect(mineBefore).toBe(true);
    if (process.platform === "linux") expect(ownListeningPorts().has(port)).toBe(false);
  });
});

describe("ISC-8 and ISC-22: forwarding through an upstream proxy that needs a login", () => {
  const login = (): { server: string; username: string; password: string } => ({ server: `http://127.0.0.1:${U}`, username: LOGIN_USER, password: LOGIN_PASS });
  async function withGate<T>(options: Parameters<typeof startEgressGate>[0], fn: (port: number) => Promise<T>): Promise<T> {
    const g = await startEgressGate(options);
    try {
      return await fn(portOf(g));
    } finally {
      await g.close();
    }
  }

  test("plain http: the name is looked up once here, then sent to the upstream by name with the gate's login", async () => {
    await withGate({ policy, upstream: login() }, async (port) => {
      const got = await ask(port, `http://open.test:${A}/page?x=1`, { headers: { "proxy-authorization": CLIENT_JUNK } });
      expect(got.status).toBe(200);
      expect(got.body).toBe("allowed-body:");
    });
    expect(lookups).toEqual(["open.test"]);
    expect(upstreamSeen).toEqual([{ kind: "request", target: `http://open.test:${A}/page?x=1`, auth: LOGIN }]);
    expect(allowedHits[0].headers.host).toBe(`open.test:${A}`);
    expect(allowedHits[0].headers["proxy-authorization"]).toBeUndefined();
  });

  test("a refused target is refused before the upstream is contacted, in all three request shapes", async () => {
    await withGate({ policy, upstream: login() }, async (port) => {
      expect((await ask(port, `http://closed.test:${R}/secret`)).status).toBe(403);
      expect((await ask(port, `http://127.0.0.1:${R}/secret`)).status).toBe(403);
      expect((await ask(port, `http://mixed.test:${R}/secret`)).status).toBe(403);
      for (const text of [connectLine(`closed.test:${R}`), connectLine(`127.0.0.1:${R}`), upgradeLines(`ws://closed.test:${R}/socket`), upgradeLines(`ws://mixed.test:${R}/socket`)]) {
        const got = await send(port, text);
        got.socket.destroy();
        expect(got.status).toBe(403);
      }
    });
    expect(upstreamConns).toBe(0);
    expect(upstreamSeen).toEqual([]);
    expect(refusedConns).toBe(0);
  });

  test("control: the upstream would have fetched the refused target for a gate that allows everything", async () => {
    await withGate({ policy: allowAll, upstream: login() }, async (port) => {
      expect((await ask(port, `http://closed.test:${R}/secret`)).body).toBe("refused-body");
      const opened = await send(port, connectLine(`closed.test:${R}`));
      expect(opened.status).toBe(200);
      opened.socket.destroy();
      const ws = await send(port, upgradeLines(`ws://closed.test:${R}/socket`));
      ws.socket.destroy();
    });
    await sleep(50);
    expect(upstreamSeen.map((s) => s.kind)).toEqual(["request", "connect", "connect"]);
    expect(refusedConns).toBe(3);
  });

  test("a rebinding name is looked up once here; the upstream is given the name", async () => {
    await withGate({ policy, upstream: login() }, async (port) => {
      const opened = await send(port, connectLine(`rebind.test:${R}`));
      opened.socket.destroy();
      expect(opened.status).toBe(200);
    });
    expect(rebindAsked).toBe(1);
    expect(upstreamSeen).toEqual([{ kind: "connect", target: `rebind.test:${R}`, auth: LOGIN }]);
  });

  test("CONNECT: https loads end to end, the login goes on the gate's own CONNECT only", async () => {
    await withGate({ policy, upstream: login() }, async (port) => {
      const opened = await send(port, connectLine(`open.test:${S}`, `Proxy-Authorization: ${CLIENT_JUNK}\r\n`));
      expect(opened.status).toBe(200);
      expect(await tlsGet(opened, "open.test")).toContain("secure-body");
    });
    expect(upstreamSeen).toEqual([{ kind: "connect", target: `open.test:${S}`, auth: LOGIN }]);
    expect(lookups).toEqual(["open.test"]);
  });

  test("ISC-22: nothing the target receives through a tunnel carries the login", async () => {
    await withGate({ policy, upstream: login() }, async (port) => {
      const opened = await send(port, `${connectLine(`open.test:${N}`)}GET /inside HTTP/1.1\r\nHost: open.test\r\n\r\n`);
      expect(opened.status).toBe(200);
      expect(await drain(opened.socket, opened.rest)).toContain("raw-body");
    });
    expect(upstreamSeen[0].auth).toBe(LOGIN);
    expect(rawSeen).toStartWith("GET /inside HTTP/1.1");
    expect(rawSeen.toLowerCase()).not.toContain("proxy-authorization");
    expect(rawSeen).not.toContain(LOGIN.slice(6));
  });

  test("ISC-22 and ISC-25: a ws:// upgrade goes through the upstream as a tunnel, and the target's copy carries no login", async () => {
    await withGate({ policy, upstream: login() }, async (port) => {
      const live = await send(port, upgradeLines(`ws://open.test:${W}/socket`));
      expect(live.status).toBe(101);
      expect(await pingPong(live)).toBe("pong:ping");
      const opened = await send(port, upgradeLines(`ws://open.test:${N}/socket`, `Proxy-Authorization: ${CLIENT_JUNK}\r\n`));
      expect(opened.status).toBe(101);
      opened.socket.destroy();
    });
    expect(upstreamSeen).toEqual([
      { kind: "connect", target: `open.test:${W}`, auth: LOGIN },
      { kind: "connect", target: `open.test:${N}`, auth: LOGIN },
    ]);
    expect(rawSeen).toStartWith(`GET /socket HTTP/1.1\r\nHost: open.test:${N}\r\n`);
    expect(rawSeen.toLowerCase()).not.toContain("proxy-authorization");
    expect(rawSeen).not.toContain(LOGIN.slice(6));
    expect(rawSeen).not.toContain(CLIENT_JUNK.slice(6));
  });

  test("an upstream with no login is sent no Proxy-Authorization", async () => {
    await withGate({ policy, upstream: { server: `http://127.0.0.1:${O}` } }, async (port) => {
      expect((await ask(port, `http://open.test:${A}/page`, { headers: { "proxy-authorization": CLIENT_JUNK } })).status).toBe(200);
      const opened = await send(port, connectLine(`open.test:${N}`, `Proxy-Authorization: ${CLIENT_JUNK}\r\n`));
      opened.socket.destroy();
      expect(opened.status).toBe(200);
    });
    expect(upstreamSeen).toEqual([
      { kind: "request", target: `http://open.test:${A}/page`, auth: undefined },
      { kind: "connect", target: `open.test:${N}`, auth: undefined },
    ]);
  });

  test("the upstream's refusal of a tunnel, a wrong login, and an upstream that is not there reach the client as errors", async () => {
    await withGate({ policy, upstream: login() }, async (port) => {
      const got = await send(port, connectLine(`nowhere.test:${N}`));
      got.socket.destroy();
      expect(got.status).toBe(502);
    });
    await withGate({ policy, upstream: { ...login(), password: "wrong" } }, async (port) => {
      const got = await send(port, connectLine(`open.test:${N}`));
      got.socket.destroy();
      expect(got.status).toBe(407);
      expect((await ask(port, `http://open.test:${A}/page`)).status).toBe(407);
    });
    // An upstream that is gone: a listener that drops every connection. It was
    // a port this test had just freed, which another process on the machine
    // could take meanwhile, and one did (tests-7, 2026-11-12).
    const gone = createNetServer((socket) => {
      socket.on("error", () => { /* dropped */ });
      socket.destroy();
    });
    const gonePort = await listenOn(gone, "127.0.0.1");
    try {
      await withGate({ policy, upstream: { ...login(), server: `http://127.0.0.1:${gonePort}` } }, async (port) => {
        const got = await send(port, connectLine(`open.test:${N}`));
        got.socket.destroy();
        expect(got.status).toBe(502);
        expect((await ask(port, `http://open.test:${A}/page`)).status).toBe(502);
      });
    } finally {
      await closeServer(gone);
    }
    expect(allowedConns).toBe(0);
  });

  test("an upstream that never answers a CONNECT is given up on with 504", async () => {
    await withGate({ policy, upstream: { ...login(), server: `http://127.0.0.1:${Q}` }, timeouts: { upstreamAnswer: 300 } }, async (port) => {
      const started = Date.now();
      const got = await send(port, connectLine(`open.test:${N}`));
      got.socket.destroy();
      expect(got.status).toBe(504);
      expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    });
  });

  test("a socks upstream is refused at start, so nothing is launched behind a gate that cannot forward", async () => {
    let message = "";
    try {
      const g = await startEgressGate({ policy, upstream: { server: "socks5://127.0.0.1:1080" } });
      await g.close();
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("http or https proxy");
  });
});

describe("gate-bypass-2: the user check does not read the kernel table once per connection", () => {
  const HEADER = "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode";
  const row = (local: string, remote: string, st: string, uid: number | string): string =>
    `   0: ${local} ${remote} ${st} 00000000:00000000 00:00000000 00000000  ${uid}        0 11 1 0`;
  const hex = (port: number): string => port.toString(16).toUpperCase().padStart(4, "0");
  const MAPPED = "0000000000000000FFFF00000100007F";

  test("the one-pass reading of the table agrees with loopbackPeerUid for every pair of ports", () => {
    const table = [
      HEADER,
      row("0100007F:1F90", "00000000:0000", "0A", 0), // a listener
      row("0100007F:1F90", "0100007F:D431", "01", 0), // its accepted socket
      row("0100007F:D431", "0100007F:1F90", "01", 1000), // the client
      row("0200007F:1F91", "0100007F:1F91", "01", 65534), // a client bound to 127.0.0.2:<the server's port>
      row("0100007F:1F91", "0200007F:1F91", "01", 0),
      row("0100007F:D432", "0100007F:1F90", "06", 7), // no longer established
      row(`${MAPPED}:D433`, `${MAPPED}:1F90`, "01", 33), // as /proc/net/tcp6 writes a v4-mapped connection
      row("0100007F:D434", `${MAPPED}:1F90`, "01", 34), // one end in each form: no table writes that
      row("0100007F:D435", "0100007F:1F90", "01", 12),
      row("0100007F:D435", "0100007F:1F90", "01", 13), // the first row for a connection is the one read
      row("0100007F:D436", "0100007F:1F90", "01", "x"), // a uid that is not a number is no one's
    ].join("\n");
    const peers = loopbackPeers(table);
    const ports = [0x1f90, 0x1f91, 0xd431, 0xd432, 0xd433, 0xd434, 0xd435, 0xd436, 1, 2];
    for (const peer of ports) {
      for (const server of ports) {
        const all = peers.get(loopbackPeerKey(peer, server));
        expect({ peer, server, uid: all === undefined || Number.isNaN(all) ? undefined : all }).toEqual({ peer, server, uid: loopbackPeerUid(table, peer, server) });
      }
    }
    expect(peers.get(loopbackPeerKey(0xd431, 0x1f90))).toBe(1000);
    expect(peers.get(loopbackPeerKey(0xd433, 0x1f90))).toBe(33);
    expect(peers.get(loopbackPeerKey(0xd435, 0x1f90))).toBe(12);
    expect(peers.has(loopbackPeerKey(0xd432, 0x1f90))).toBe(false);
    expect(peers.has(loopbackPeerKey(0x1f91, 0x1f91))).toBe(false);
  });

  test("one read at a time, and a client is decided only by a read that started after it arrived", async () => {
    if (process.platform !== "linux") return;
    const uid = 1000;
    let reads = 0;
    const pending: Array<(table: string) => void> = [];
    const check = loopbackUserCheck(uid, () => {
      reads++;
      return new Promise<string>((done) => pending.push(done));
    });
    const peer = (port: number) => ({ remoteAddress: "127.0.0.1", remotePort: port, localPort: 0x1f90 });
    const tableOf = (...clients: number[]): string => clients.map((port) => row(`0100007F:${hex(port)}`, "0100007F:1F90", "01", uid)).join("\n");
    const decided: Record<string, boolean> = {};
    const note = (name: string, answer: Promise<boolean>): Promise<void> => answer.then((ok) => { decided[name] = ok; });

    const first = note("first", check(peer(0xd431)));
    expect(reads).toBe(1);
    // Two more arrive while that read is out, and a hundred after them: no second read yet.
    const second = note("second", check(peer(0xd432)));
    const third = note("third", check(peer(0xd433)));
    const crowd = Array.from({ length: 100 }, (_, i) => check(peer(0xe000 + i)));
    await sleep(10);
    expect(reads).toBe(1);
    // The running read comes back with rows for all of them. Only the client
    // that was waiting when it started is decided from it: the others might
    // have connected after the read passed their row.
    pending.shift()!(tableOf(0xd431, 0xd432, 0xd433));
    await first;
    expect(decided).toEqual({ first: true });
    // One read for everyone who was waiting, not one each.
    await sleep(10);
    expect(decided).toEqual({ first: true });
    expect(reads).toBe(2);
    pending.shift()!(tableOf(0xd432, ...Array.from({ length: 100 }, (_, i) => 0xe000 + i)));
    await Promise.all([second, third]);
    expect(decided).toEqual({ first: true, second: true, third: false });
    expect((await Promise.all(crowd)).every((ok) => ok)).toBe(true);
    await sleep(10);
    expect(reads).toBe(2);
    expect(pending.length).toBe(0);
  });

  test("the reading is on a budget: 100 ms of it at once, then a quarter of the time, and never a wait over 50 ms", async () => {
    if (process.platform !== "linux") return;
    expect(LOOPBACK_READ_BUDGET).toEqual({ share: 0.25, aheadMs: 100, maxWaitMs: 50 });
    const table = row("0100007F:D431", "0100007F:1F90", "01", 1000);
    const mine = { remoteAddress: "127.0.0.1", remotePort: 0xd431, localPort: 0x1f90 };
    const startedAt: number[] = [];
    const endedAt: number[] = [];
    const reading = (ms: number) => loopbackUserCheck(1000, async () => {
      startedAt.push(performance.now());
      await sleep(ms);
      endedAt.push(performance.now());
      return table;
    });
    // Reads of 30 ms, one caller after another. Each takes 30 ms out of the
    // budget and 7.5 ms comes back meanwhile: the fifth leaves it overdrawn,
    // so the first five start at once and the sixth waits.
    const check = reading(30);
    const waits: number[] = [];
    for (let i = 0; i < 6; i++) {
      const asked = performance.now();
      expect(await check(mine)).toBe(true);
      waits.push(startedAt[i] - asked);
    }
    expect(waits.slice(0, 5).filter((ms) => ms < 10).length).toBe(5);
    expect(waits[5]).toBeGreaterThanOrEqual(25);
    expect(waits[5]).toBeLessThan(LOOPBACK_READ_BUDGET.maxWaitMs + 40);
    // Kept up, the reading is a quarter of the time. Thirty reads of 12 ms
    // back to back would take 0.36 s: eleven fit in the budget, and the rest
    // are spaced to one in four, about a second in all.
    const steady = reading(12);
    const from = performance.now();
    for (let i = 0; i < 30; i++) await steady(mine);
    const took = performance.now() - from;
    expect(took).toBeGreaterThanOrEqual(800);
    expect(took).toBeLessThan(2500);
    // One long read (300 ms, three times the whole budget) overdraws by no more than 50 ms earns back.
    const slow = reading(300);
    startedAt.length = 0;
    endedAt.length = 0;
    await slow(mine);
    await slow(mine);
    expect(startedAt[1] - endedAt[0]).toBeGreaterThanOrEqual(LOOPBACK_READ_BUDGET.maxWaitMs - 10);
    expect(startedAt[1] - endedAt[0]).toBeLessThan(LOOPBACK_READ_BUDGET.maxWaitMs + 150);
  }, 20_000);

  test("another user's client, another address, and a read that fails are not served", async () => {
    if (process.platform !== "linux") return;
    const table = row("0100007F:D431", "0100007F:1F90", "01", 1000);
    let reads = 0;
    const read = async (): Promise<string> => { reads++; return table; };
    const mine = { remoteAddress: "127.0.0.1", remotePort: 0xd431, localPort: 0x1f90 };
    expect(await loopbackUserCheck(1000, read)(mine)).toBe(true);
    expect(await loopbackUserCheck(1000, read)({ ...mine, remoteAddress: "::ffff:127.0.0.1" })).toBe(true);
    expect(await loopbackUserCheck(1001, read)(mine)).toBe(false);
    expect(await loopbackUserCheck(1000, read)({ ...mine, remotePort: 0xd432 })).toBe(false);
    expect(reads).toBe(4);
    // Not from 127.0.0.1, or a socket that no longer says where it is from: refused without a read.
    expect(await loopbackUserCheck(1000, read)({ ...mine, remoteAddress: "127.0.0.2" })).toBe(false);
    expect(await loopbackUserCheck(1000, read)({ ...mine, remoteAddress: undefined })).toBe(false);
    expect(await loopbackUserCheck(1000, read)({ ...mine, remotePort: undefined })).toBe(false);
    expect(reads).toBe(4);
    // No user to compare with (not on a platform with one): every 127.0.0.1 client, as fromUser.
    expect(await loopbackUserCheck(undefined, read)(mine)).toBe(true);
    expect(reads).toBe(4);
    // A read that fails, later or at once, decides "no" for everyone waiting on it, and the next read still runs.
    let fail = true;
    const flaky = loopbackUserCheck(1000, () => (fail ? Promise.reject(new Error("EACCES")) : Promise.resolve(table)));
    expect(await Promise.all([flaky(mine), flaky(mine)])).toEqual([false, false]);
    fail = false;
    expect(await flaky(mine)).toBe(true);
    const thrower = loopbackUserCheck(1000, () => { throw new Error("EMFILE"); });
    expect(await thrower(mine)).toBe(false);
  });

  test("a burst of connections is served, each one checked", async () => {
    const all = await Promise.all(Array.from({ length: 80 }, (_, i) => send(gatePort, connectLine(i % 2 ? `closed.test:${R}` : `open.test:${N}`))));
    for (const one of all) one.socket.destroy();
    expect(all.filter((one) => one.status === 403).length).toBe(40);
    expect(all.filter((one) => one.status === 200).length).toBe(40);
    expect(refusedConns).toBe(0);
  });

  test("the gate's own source reads nothing synchronously", () => {
    const source = readFileSync(join(import.meta.dir, "..", "src", "egress-gate.ts"), "utf8");
    expect(source).toContain("loopbackUserCheck(uid)");
    expect(source).not.toMatch(/readFileSync|\bfromUser\s*\(|Sync\(/);
  });
});

describe("gate-bypass-4: a client that leaves or goes quiet before a complete head", () => {
  const partial = (): string[] => ["", "GET http://open.te", `CONNECT open.test:${N} HTTP/1.1\r\nHost: open.te`];

  test("a client that ends before a complete head is let go of", async () => {
    // The end comes 300 ms after the connection: by then the gate has taken
    // the client in. (One that ends at once is not an established connection
    // any more when the user check reads the kernel table, and is dropped for
    // that reason, which would pass here whatever the gate did afterwards.)
    for (const early of partial()) {
      const closed = await closedByGate(gatePort, (socket) => { setTimeout(() => socket.end(early), 300); }, 1800);
      expect({ early, closed }).toEqual({ early, closed: true });
    }
    // Control: the same client, not ending, is kept (the head limit is 30 s).
    expect(await closedByGate(gatePort, (socket) => { setTimeout(() => socket.write("GET http://open.te"), 300); }, 1200)).toBe(false);
    expect(lookups).toEqual([]);
    // Control: a client that ends once its connection has been handed on is
    // served to the end. (The end is sent after the tunnel opens: a client
    // that has ended before the user check reads the kernel table is no
    // longer an established connection there and is not served at all, which
    // was so before this change too.)
    const served = await new Promise<string>((done) => {
      const socket = netConnect({ host: "127.0.0.1", port: gatePort, allowHalfOpen: true }, () => socket.write(connectLine(`open.test:${N}`)));
      let got = "";
      let ended = false;
      socket.on("data", (d: Buffer) => {
        got += d.toString("latin1");
        if (!ended && got.includes("\r\n\r\n")) {
          ended = true;
          socket.end("GET /late HTTP/1.1\r\nHost: open.test\r\n\r\n");
        }
      });
      socket.on("error", () => { /* reported through what was read */ });
      socket.on("close", () => done(got));
    });
    expect(served).toStartWith("HTTP/1.1 200 Connection Established");
    expect(served).toEndWith("raw-body");
  });

  test("a client that goes quiet is dropped after the head limit, and a connection handed on is not", async () => {
    // Half a second: well clear of what the user check and the lookup take before a connection is handed on.
    const brisk = await startEgressGate({ policy, timeouts: { head: 500 } });
    const port = portOf(brisk);
    try {
      for (const early of partial()) {
        const started = Date.now();
        expect({ early, closed: await closedByGate(port, (socket) => { if (early) socket.write(early); }) }).toEqual({ early, closed: true });
        expect(Date.now() - started).toBeGreaterThanOrEqual(450);
      }
      // Control: the gate with its own limit (30 s) keeps the same quiet client.
      expect(await closedByGate(gatePort, (socket) => socket.write("GET http://open.te"), 700)).toBe(false);

      // Handed on, in each of the three shapes: the limit no longer applies.
      const page = `GET http://open.test:${A}/page HTTP/1.1\r\nHost: open.test:${A}\r\n\r\n`;
      const tunnel = await send(port, connectLine(`open.test:${N}`));
      const socketUp = await send(port, upgradeLines(`ws://open.test:${N}/socket`));
      const kept = await send(port, page);
      expect([tunnel.status, socketUp.status, kept.status]).toEqual([200, 101, 200]);
      await take(kept.socket, kept.rest, "allowed-body:".length);
      await sleep(900);
      tunnel.socket.write("GET /inside HTTP/1.1\r\nHost: open.test\r\n\r\n");
      expect(await drain(tunnel.socket, tunnel.rest)).toContain("raw-body");
      socketUp.socket.write("still-here");
      expect((await take(socketUp.socket, socketUp.rest, "still-here".length)).toString()).toBe("still-here");
      socketUp.socket.destroy();
      kept.socket.write(page);
      expect((await take(kept.socket, Buffer.alloc(0), 20)).toString("latin1")).toStartWith("HTTP/1.1 200 ");
      kept.socket.destroy();
    } finally {
      await brisk.close();
    }
  });

  test("a client that stays after the gate's own answer is dropped after the same limit", async () => {
    // What a client sees when it writes to a gate that has let go of it: a reset.
    const resetAfterAnswer = (port: number, waitMs: number): Promise<boolean> => new Promise((done) => {
      const socket = netConnect({ host: "127.0.0.1", port, allowHalfOpen: true }, () => socket.write("hello\r\n\r\n"));
      let got = "";
      let reset = false;
      socket.on("data", (d: Buffer) => { got += d.toString("latin1"); });
      socket.on("error", () => { reset = true; });
      socket.on("end", () => {
        if (!got.startsWith("HTTP/1.1 400 ")) { socket.destroy(); done(false); return; }
        setTimeout(() => {
          socket.write("more");
          setTimeout(() => { socket.write("and more"); }, 100);
          setTimeout(() => { socket.destroy(); done(reset); }, 400);
        }, waitMs);
      });
    });
    const brisk = await startEgressGate({ policy, timeouts: { head: 300 } });
    try {
      expect(await resetAfterAnswer(portOf(brisk), 600)).toBe(true);
      // Control: before the limit, what the client goes on sending is read and dropped.
      expect(await resetAfterAnswer(gatePort, 600)).toBe(false);
    } finally {
      await brisk.close();
    }
  });
});

describe("gate-bypass-5: blanks in a header value", () => {
  test("a header with 60,000 spaces inside its value does not hold the thread", async () => {
    const started = performance.now();
    const got = await send(gatePort, connectLine(`closed.test:${R}`, `X-Pad: a${" ".repeat(60_000)}b\r\n`));
    const took = performance.now() - started;
    got.socket.destroy();
    expect(got.status).toBe(403);
    // About a second with the pattern that trimmed inside itself (Bun 1.4.4
    // and Node 22.19, 2026-11-12); a few milliseconds without.
    expect(took).toBeLessThan(400);
    // Fifteen cookie-sized runs in one line, as a page can set them.
    const cookies = Array.from({ length: 15 }, (_, i) => `c${i}=a${" ".repeat(3_900)}b`).join("; ");
    const again = performance.now();
    const many = await send(gatePort, upgradeLines(`ws://closed.test:${R}/socket`, `Cookie: ${cookies}\r\n`));
    many.socket.destroy();
    expect(many.status).toBe(403);
    expect(performance.now() - again).toBeLessThan(400);
  });

  test("a value is passed on trimmed at both ends and whole inside", async () => {
    const opened = await send(gatePort, upgradeLines(`ws://open.test:${N}/socket`, `X-Pad: \t two  words\t here \t \r\nX-Empty:\r\nX-Blank:  \t \r\nX-Tight:tight\r\n`));
    expect(opened.status).toBe(101);
    opened.socket.destroy();
    expect(rawSeen).toContain("X-Pad: two  words\t here\r\n");
    expect(rawSeen).toContain("X-Empty: \r\n");
    expect(rawSeen).toContain("X-Blank: \r\n");
    expect(rawSeen).toContain("X-Tight: tight\r\n");
  });
});

describe("why the gate did not carry a request: the mark on its own answers and failure()", () => {
  test("a refused address and a name that does not resolve: marked 'refused', by header and by failure()", async () => {
    const plainAnswer = await ask(gatePort, `http://closed.test:${R}/secret`);
    expect(plainAnswer.status).toBe(403);
    expect(plainAnswer.headers[MARK]).toBe("refused");
    expect(gate.failure("closed.test", R)).toBe("refused");
    const tunnel = await send(gatePort, connectLine(`unknown.test:${S}`));
    tunnel.socket.destroy();
    expect(tunnel.status).toBe(403);
    expect(tunnel.head.toLowerCase()).toContain(`${MARK}: refused`);
    expect(gate.failure("unknown.test", S)).toBe("refused");
    const socketUp = await send(gatePort, upgradeLines(`ws://127.0.0.1:${R}/socket`));
    socketUp.socket.destroy();
    expect(socketUp.head.toLowerCase()).toContain(`${MARK}: refused`);
    expect(gate.failure("127.0.0.1", R)).toBe("refused");
    // The host is compared lower-cased, the port exactly; another target has no record.
    expect(gate.failure("CLOSED.Test", R)).toBe("refused");
    expect(gate.failure("closed.test", R + 1)).toBeUndefined();
    expect(gate.failure("open.test", A)).toBeUndefined();
    expect(wideOpen.failure("closed.test", R)).toBeUndefined();
  });

  test("an allowed address that does not connect: 'unreachable'", async () => {
    const plainAnswer = await ask(gatePort, `http://nowhere.test:${A}/page`);
    expect(plainAnswer.status).toBe(502);
    expect(plainAnswer.headers[MARK]).toBe("unreachable");
    expect(gate.failure("nowhere.test", A)).toBe("unreachable");
    const tunnel = await send(gatePort, connectLine(`nowhere.test:${N}`));
    tunnel.socket.destroy();
    expect(tunnel.status).toBe(502);
    expect(tunnel.head.toLowerCase()).toContain(`${MARK}: unreachable`);
    expect(gate.failure("nowhere.test", N)).toBe("unreachable");
  });

  test("a target that drops the connection before answering: 502 from the gate, 'unreachable'", async () => {
    const dropper = createNetServer((socket) => {
      socket.on("error", () => { /* dropped */ });
      socket.once("data", () => socket.destroy());
    });
    const port = await listenOn(dropper, ALLOWED);
    try {
      const got = await ask(gatePort, `http://open.test:${port}/page`);
      expect(got.status).toBe(502);
      expect(got.headers[MARK]).toBe("unreachable");
      expect(gate.failure("open.test", port)).toBe("unreachable");
    } finally {
      await closeServer(dropper);
    }
  });

  test("an upstream that refuses, is gone or does not answer: 'upstream'", async () => {
    const withLogin = (password: string, server = `http://127.0.0.1:${U}`) => ({ server, username: LOGIN_USER, password });
    const wrong = await startEgressGate({ policy, upstream: withLogin("wrong") });
    try {
      const tunnel = await send(portOf(wrong), connectLine(`open.test:${N}`));
      tunnel.socket.destroy();
      expect(tunnel.status).toBe(407);
      expect(tunnel.head.toLowerCase()).toContain(`${MARK}: upstream`);
      expect(wrong.failure("open.test", N)).toBe("upstream");
      // Plain http: the 407 is the upstream's own answer, passed on with the mark added.
      const plainAnswer = await ask(portOf(wrong), `http://open.test:${A}/page`);
      expect(plainAnswer.status).toBe(407);
      expect(plainAnswer.headers[MARK]).toBe("upstream");
      expect(wrong.failure("open.test", A)).toBe("upstream");
    } finally {
      await wrong.close();
    }
    const right = await startEgressGate({ policy, upstream: withLogin(LOGIN_PASS) });
    try {
      // The upstream answers 502 to a CONNECT it cannot make.
      const tunnel = await send(portOf(right), connectLine(`nowhere.test:${N}`));
      tunnel.socket.destroy();
      expect(tunnel.status).toBe(502);
      expect(tunnel.head.toLowerCase()).toContain(`${MARK}: upstream`);
      expect(right.failure("nowhere.test", N)).toBe("upstream");
      // Control: what the upstream does carry is not marked and leaves no record.
      const page = await ask(portOf(right), `http://open.test:${A}/page`);
      expect(page.status).toBe(200);
      expect(page.headers[MARK]).toBeUndefined();
      expect(right.failure("open.test", A)).toBeUndefined();
    } finally {
      await right.close();
    }
    const slow = await startEgressGate({ policy, upstream: withLogin(LOGIN_PASS, `http://127.0.0.1:${Q}`), timeouts: { upstreamAnswer: 300 } });
    try {
      const tunnel = await send(portOf(slow), connectLine(`open.test:${N}`));
      tunnel.socket.destroy();
      expect(tunnel.status).toBe(504);
      expect(tunnel.head.toLowerCase()).toContain(`${MARK}: upstream`);
      expect(slow.failure("open.test", N)).toBe("upstream");
    } finally {
      await slow.close();
    }
  });

  test("what is not a proxy request is marked 'bad-request' and leaves no record", async () => {
    const origin = await send(gatePort, "GET /origin-form HTTP/1.1\r\nHost: open.test\r\nConnection: close\r\n\r\n");
    origin.socket.destroy();
    expect(origin.status).toBe(400);
    expect(origin.head.toLowerCase()).toContain(`${MARK}: bad-request`);
    const tunnel = await send(gatePort, connectLine("open.test:0"));
    tunnel.socket.destroy();
    expect(tunnel.status).toBe(400);
    expect(tunnel.head.toLowerCase()).toContain(`${MARK}: bad-request`);
    const noise = await send(gatePort, "hello\r\n\r\n");
    noise.socket.destroy();
    expect(noise.head.toLowerCase()).toContain(`${MARK}: bad-request`);
    expect(gate.failure("open.test", 0)).toBeUndefined();
  });

  test("a site's own answer is not marked, and a site cannot set the mark itself", async () => {
    const own = await ask(gatePort, `http://open.test:${A}/fake-mark`);
    expect(own.status).toBe(403);
    expect(own.body).toBe("site");
    expect(own.headers[MARK]).toBeUndefined();
    expect(gate.failure("open.test", A)).toBeUndefined();
    // Control: the site did send it.
    const direct = await new Promise<string | undefined>((done) => {
      httpRequest({ host: ALLOWED, port: A, path: "/fake-mark", agent: false }, (res) => {
        res.resume();
        done(res.headers[MARK] as string | undefined);
      }).end();
    });
    expect(direct).toBe("refused");
  });

  // gate-3, second review: the mark on an answer the browser reads outside a
  // tunnel is to mean that the gate wrote it, whoever else sends one.
  test("an upstream proxy's own mark is taken off a plain answer, and on its 407 the mark says 'upstream'", async () => {
    const marking = createNetServer((socket) => {
      socket.on("error", () => { /* the gate went away */ });
      socket.once("data", (d: Buffer) => {
        const wrongLogin = !d.toString("latin1").includes(LOGIN);
        socket.end(wrongLogin
          ? "HTTP/1.1 407 Proxy Authentication Required\r\nX-CBrowser-Egress: refused\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
          : "HTTP/1.1 502 Bad Gateway\r\nx-cbrowser-egress: unreachable\r\nContent-Length: 2\r\nConnection: close\r\n\r\nup");
      });
    });
    const port = await listenOn(marking, "127.0.0.1");
    const upAt = `http://127.0.0.1:${port}`;
    const right = await startEgressGate({ policy, upstream: { server: upAt, username: LOGIN_USER, password: LOGIN_PASS } });
    const wrong = await startEgressGate({ policy, upstream: { server: upAt, username: LOGIN_USER, password: "wrong" } });
    try {
      const passedOn = await ask(portOf(right), `http://open.test:${A}/page`);
      expect(passedOn.status).toBe(502);
      expect(passedOn.body).toBe("up");
      expect(passedOn.headers[MARK]).toBeUndefined();
      const refusedLogin = await ask(portOf(wrong), `http://open.test:${A}/page`);
      expect(refusedLogin.status).toBe(407);
      expect(refusedLogin.headers[MARK]).toBe("upstream");
      // Through an upstream that passes a site's answer on, the site's mark is taken off too.
      const chained = await startEgressGate({ policy, upstream: { server: `http://127.0.0.1:${O}` } });
      try {
        const site = await ask(portOf(chained), `http://open.test:${A}/fake-mark`);
        expect(site.status).toBe(403);
        expect(site.body).toBe("site");
        expect(site.headers[MARK]).toBeUndefined();
        expect(upstreamSeen.map((seen) => seen.target)).toEqual([`http://open.test:${A}/fake-mark`]);
      } finally {
        await chained.close();
      }
    } finally {
      await right.close();
      await wrong.close();
      await closeServer(marking);
    }
  });

  test("a target's answer to an upgrade is passed on without the mark, in every head up to the final one", async () => {
    const heads: Record<string, string[]> = {
      "/101": ["HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nX-CBrowser-Egress: refused\r\nConnection: Upgrade\r\n\r\nFRAME"],
      "/403": ["HTTP/1.1 403 Forbidden\r\nx-cbrowser-egress : refused\r\nContent-Length: 4\r\nConnection: close\r\n\r\nsite"],
      "/continue": ["HTTP/1.1 100 Continue\r\nX-CBrowser-Egress: refused\r\n\r\nHTTP/1.1 101 Switching Protocols\r\nX-CBrowser-Egress: unreachable\r\nUpgrade: websocket\r\n\r\nFRAME"],
      "/folded": ["HTTP/1.1 101 Switching Protocols\r\nX-CBrowser-Egress: re\r\n fused\r\nUpgrade: websocket\r\n\r\nFRAME"],
      // The head in pieces, the mark cut across two of them.
      "/split": ["HTTP/1.1 101 Switching Protocols\r\nX-CBrowser-Eg", "ress: refused\r\nUpgrade: websocket\r", "\n\r\nFRAME"],
    };
    const target = createNetServer((socket) => {
      socket.on("error", () => { /* the gate went away */ });
      socket.once("data", async (d: Buffer) => {
        const path = /^GET (\S+) /.exec(d.toString("latin1"))?.[1] ?? "";
        // After the head, the bytes are passed both ways as they are: what the client sends next comes back.
        socket.on("data", (more: Buffer) => socket.write(more));
        for (const piece of heads[path] ?? ["HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n"]) {
          socket.write(piece);
          await sleep(30);
        }
        if (path === "/403") socket.end();
      });
    });
    const port = await listenOn(target, ALLOWED);
    try {
      for (const [path, pieces] of Object.entries(heads)) {
        const whole = pieces.join("");
        const headsOnly = whole.slice(0, whole.lastIndexOf("\r\n\r\n"));
        const expected = `${headsOnly.split("\r\n\r\n").map(withoutMark).join("\r\n\r\n")}\r\n\r\n${path === "/403" ? "site" : "FRAMEecho"}`;
        for (const url of [`ws://open.test:${port}${path}`, `http://open.test:${port}${path}`]) {
          const socket = netConnect(gatePort, "127.0.0.1", () => socket.write(upgradeLines(url)));
          socket.on("error", () => { /* destroyed below */ });
          const got = await new Promise<string>((done) => {
            let text = "";
            let echoed = false;
            const timer = setTimeout(() => done(text), 2000);
            socket.on("data", (d: Buffer) => {
              text += d.toString("latin1");
              if (!echoed && text.endsWith("FRAME")) {
                echoed = true;
                socket.write("echo");
              }
              if (text.length >= expected.length) {
                clearTimeout(timer);
                done(text);
              }
            });
            socket.on("close", () => { clearTimeout(timer); done(text); });
          });
          socket.destroy();
          expect({ url, marked: /x-cbrowser-egress|fused/i.test(got) }).toEqual({ url, marked: false });
          expect({ url, got }).toEqual({ url, got: expected });
        }
      }
    } finally {
      await closeServer(target);
    }
  });

  test("withoutMark drops the mark's lines, in any case and spacing, and nothing else", () => {
    expect(withoutMark("HTTP/1.1 200 OK\r\nX-CBrowser-Egress: refused\r\nA: 1")).toBe("HTTP/1.1 200 OK\r\nA: 1");
    expect(withoutMark("HTTP/1.1 200 OK\r\nx-cbrowser-egress\t : refused\r\nA: 1\r\nX-CBROWSER-EGRESS:x")).toBe("HTTP/1.1 200 OK\r\nA: 1");
    // A folded continuation goes with its line, and stays with any other line.
    expect(withoutMark("HTTP/1.1 200 OK\r\nX-CBrowser-Egress: a\r\n b\r\n\tc\r\nA: 1\r\n d")).toBe("HTTP/1.1 200 OK\r\nA: 1\r\n d");
    // Other names, values that mention it, and the status line itself are kept.
    expect(withoutMark("HTTP/1.1 200 X-CBrowser-Egress: refused\r\nX-CBrowser-Egress-Not: 1\r\nA: X-CBrowser-Egress: refused"))
      .toBe("HTTP/1.1 200 X-CBrowser-Egress: refused\r\nX-CBrowser-Egress-Not: 1\r\nA: X-CBrowser-Egress: refused");
  });

  test("a later success for the same target clears the record", async () => {
    names["flip.test"] = [REFUSED];
    try {
      expect((await ask(gatePort, `http://flip.test:${A}/page`)).status).toBe(403);
      const refusedTunnel = await send(gatePort, connectLine(`flip.test:${N}`));
      refusedTunnel.socket.destroy();
      expect(gate.failure("flip.test", A)).toBe("refused");
      expect(gate.failure("flip.test", N)).toBe("refused");
      names["flip.test"] = [ALLOWED];
      expect((await ask(gatePort, `http://flip.test:${A}/page`)).status).toBe(200);
      expect(gate.failure("flip.test", A)).toBeUndefined();
      // The other port's record stands until that port is reached.
      expect(gate.failure("flip.test", N)).toBe("refused");
      const tunnel = await send(gatePort, connectLine(`flip.test:${N}`));
      tunnel.socket.destroy();
      expect(tunnel.status).toBe(200);
      expect(gate.failure("flip.test", N)).toBeUndefined();
    } finally {
      delete names["flip.test"];
    }
  });

  test("a record is kept for a minute", async () => {
    const mine = await startEgressGate({ policy });
    try {
      expect((await ask(portOf(mine), `http://closed.test:${R}/secret`)).status).toBe(403);
      const at = Date.now();
      expect(mine.failure("closed.test", R)).toBe("refused");
      setSystemTime(new Date(at + EGRESS_GATE_LIMITS.failureTtlMs - 2_000));
      expect(mine.failure("closed.test", R)).toBe("refused");
      setSystemTime(new Date(at + EGRESS_GATE_LIMITS.failureTtlMs + 2_000));
      expect(mine.failure("closed.test", R)).toBeUndefined();
      // Gone for good, not hidden: the clock back inside the minute does not bring it back.
      setSystemTime(new Date(at + 1_000));
      expect(mine.failure("closed.test", R)).toBeUndefined();
      // A record written before the time the clock now shows has no known age.
      setSystemTime(new Date(at + 500_000));
      expect((await ask(portOf(mine), `http://closed.test:${R}/secret`)).status).toBe(403);
      expect(mine.failure("closed.test", R)).toBe("refused");
      setSystemTime(new Date(at));
      expect(mine.failure("closed.test", R)).toBeUndefined();
    } finally {
      setSystemTime();
      await mine.close();
    }
  });

  test("the record holds 500 targets, and the oldest goes first", async () => {
    const mine = await startEgressGate({ policy });
    const port = portOf(mine);
    const target = (i: number): string => `10.0.${i >> 8}.${i & 255}`;
    const refuse = async (i: number): Promise<void> => {
      const got = await send(port, connectLine(`${target(i)}:9`));
      got.socket.destroy();
      expect(got.status).toBe(403);
    };
    try {
      await refuse(0);
      await refuse(1);
      // 0 is written again, so 1 is now the oldest.
      await refuse(0);
      for (let from = 2; from < EGRESS_GATE_LIMITS.failureMax; from += 50) {
        await Promise.all(Array.from({ length: Math.min(50, EGRESS_GATE_LIMITS.failureMax - from) }, (_, i) => refuse(from + i)));
      }
      expect(mine.failure(target(1), 9)).toBe("refused");
      await refuse(EGRESS_GATE_LIMITS.failureMax);
      expect(mine.failure(target(1), 9)).toBeUndefined();
      expect(mine.failure(target(0), 9)).toBe("refused");
      expect(mine.failure(target(EGRESS_GATE_LIMITS.failureMax), 9)).toBe("refused");
      let kept = 0;
      for (let i = 0; i <= EGRESS_GATE_LIMITS.failureMax; i++) {
        if (mine.failure(target(i), 9)) kept++;
      }
      expect(kept).toBe(EGRESS_GATE_LIMITS.failureMax);
      expect(lookups).toEqual([]);
    } finally {
      await mine.close();
    }
  }, 30_000);
});

describe("tests-3: an https upstream proxy", () => {
  let insideTls: Array<{ line: string; auth: string | undefined }> = [];
  let clearBytes = Buffer.alloc(0);
  let tlsProxy: ReturnType<typeof createTlsServer>;
  let clearFront: NetServer;
  let proxyCert: Buffer;
  let P = 0; // what the gate is given: a plain relay that keeps every byte, in front of the TLS proxy

  beforeAll(async () => {
    const keyPath = join(workDir, "up-k.pem");
    const certPath = join(workDir, "up-c.pem");
    const made = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath, "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
    if (made.status !== 0) throw new Error("openssl could not make the proxy's test certificate");
    proxyCert = readFileSync(certPath);
    // A proxy that speaks TLS to its clients: CONNECT, and absolute http:// requests.
    tlsProxy = createTlsServer({ key: readFileSync(keyPath), cert: proxyCert }, (socket) => {
      socket.on("error", () => { /* the gate went away */ });
      let head = "";
      const onData = (d: Buffer): void => {
        head += d.toString("latin1");
        const end = head.indexOf("\r\n\r\n");
        if (end < 0) return;
        socket.off("data", onData);
        const line = head.slice(0, head.indexOf("\r\n"));
        const auth = /^proxy-authorization: (.*)$/im.exec(head)?.[1];
        insideTls.push({ line, auth });
        if (auth !== LOGIN) {
          socket.end("HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n");
          return;
        }
        const tunnel = /^CONNECT ([^:\s]+):(\d+) /.exec(line);
        const absolute = /^GET http:\/\/([^:/\s]+):(\d+)(\S*) /.exec(line);
        const to = tunnel ?? absolute;
        const address = to ? names[to[1]]?.[0] : undefined;
        if (!to || !address) {
          socket.end("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n");
          return;
        }
        const out = netConnect(Number(to[2]), address, () => {
          if (tunnel) socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          else out.write(`GET ${absolute![3] || "/"} HTTP/1.1\r\nHost: ${to[1]}:${to[2]}\r\nConnection: close\r\n\r\n`);
          const rest = head.slice(end + 4);
          if (tunnel && rest) out.write(rest, "latin1");
          out.pipe(socket);
          socket.pipe(out);
        });
        out.on("error", () => socket.destroy());
      };
      socket.on("data", onData);
    });
    tlsProxy.on("tlsClientError", () => { /* a client that did not trust the certificate, or did not speak TLS */ });
    const tlsPort = await listenOn(tlsProxy, "127.0.0.1");
    clearFront = createNetServer((socket) => {
      const to = netConnect(tlsPort, "127.0.0.1");
      socket.on("data", (d: Buffer) => { clearBytes = Buffer.concat([clearBytes, d]); });
      socket.on("error", () => to.destroy());
      to.on("error", () => socket.destroy());
      socket.pipe(to);
      to.pipe(socket);
    });
    P = await listenOn(clearFront, "127.0.0.1");
  });

  afterAll(() => {
    tlsProxy?.close();
    clearFront?.close();
  });

  beforeEach(() => {
    insideTls = [];
    clearBytes = Buffer.alloc(0);
  });

  const upstreamHere = () => ({ server: `https://127.0.0.1:${P}`, username: LOGIN_USER, password: LOGIN_PASS });

  test("CONNECT and plain http both go through it, and the login is seen only inside TLS", async () => {
    const trusting = await startEgressGate({ policy, upstream: upstreamHere(), ca: proxyCert, timeouts: { upstreamAnswer: 5000 } });
    try {
      const opened = await send(portOf(trusting), `${connectLine(`open.test:${N}`)}GET /inside HTTP/1.1\r\nHost: open.test\r\n\r\n`);
      expect(opened.status).toBe(200);
      expect(await drain(opened.socket, opened.rest)).toContain("raw-body");
      const page = await ask(portOf(trusting), `http://open.test:${A}/page?x=1`);
      expect(page.status).toBe(200);
      expect(page.body).toBe("allowed-body:");
      const secure = await send(portOf(trusting), connectLine(`open.test:${S}`));
      expect(secure.status).toBe(200);
      expect(await tlsGet(secure, "open.test")).toContain("secure-body");
      // A refused target is refused before the proxy is spoken to.
      const before = insideTls.length;
      const refusedTunnel = await send(portOf(trusting), connectLine(`closed.test:${R}`));
      refusedTunnel.socket.destroy();
      expect(refusedTunnel.status).toBe(403);
      expect(insideTls.length).toBe(before);
      expect(trusting.failure("open.test", N)).toBeUndefined();
    } finally {
      await trusting.close();
    }
    expect(insideTls).toEqual([
      { line: `CONNECT open.test:${N} HTTP/1.1`, auth: LOGIN },
      { line: `GET http://open.test:${A}/page?x=1 HTTP/1.1`, auth: LOGIN },
      { line: `CONNECT open.test:${S} HTTP/1.1`, auth: LOGIN },
    ]);
    // What crossed the wire to the proxy: TLS records, and the login nowhere in them.
    const clear = clearBytes.toString("latin1");
    expect(clearBytes[0]).toBe(0x16);
    expect(clear).not.toContain(LOGIN.slice(6));
    expect(clear.toLowerCase()).not.toContain("proxy-authorization");
    expect(clear).not.toContain("CONNECT ");
    expect(clear).not.toContain("open.test");
    expect(refusedConns).toBe(0);
  });

  test("a certificate that is not trusted: 502, marked 'upstream', and nothing is sent to the proxy or the target", async () => {
    const wary = await startEgressGate({ policy, upstream: upstreamHere(), timeouts: { upstreamAnswer: 5000 } });
    try {
      const tunnel = await send(portOf(wary), connectLine(`open.test:${N}`));
      tunnel.socket.destroy();
      expect(tunnel.status).toBe(502);
      expect(tunnel.head.toLowerCase()).toContain(`${MARK}: upstream`);
      const page = await ask(portOf(wary), `http://open.test:${A}/page`);
      expect(page.status).toBe(502);
      expect(page.headers[MARK]).toBe("upstream");
      expect(wary.failure("open.test", N)).toBe("upstream");
      expect(wary.failure("open.test", A)).toBe("upstream");
    } finally {
      await wary.close();
    }
    expect(insideTls).toEqual([]);
    expect(allowedConns).toBe(0);
    expect(clearBytes.toString("latin1")).not.toContain(LOGIN.slice(6));
  });
});

describe("tests-9: IPv6 targets", () => {
  // Skipped, and shown as skipped, on a machine without ::1.
  test.skipIf(!HAS_V6)("an IPv6 target is refused in all three request shapes, and reached in all three when the policy allows it", async () => {
    const seen: string[] = [];
    let conns = 0;
    const six = createNetServer((socket) => {
      conns++;
      socket.on("error", () => { /* the client went away */ });
      socket.once("data", (d: Buffer) => {
        const head = d.toString("latin1");
        seen.push(`${head.split("\r\n")[0]} | ${/^host: (.*)$/im.exec(head)?.[1] ?? ""}`);
        socket.end("HTTP/1.1 200 OK\r\nContent-Length: 3\r\nConnection: close\r\n\r\nsix");
      });
    });
    const port = await listenOn(six, "::1");
    names["six.test"] = ["::1"];
    const shapes = (host: string): string[] => [
      `${connectLine(`${host}:${port}`)}GET /inside HTTP/1.1\r\nHost: inside.test\r\n\r\n`,
      `GET http://${host}:${port}/p?q=1 HTTP/1.1\r\nHost: ${host}:${port}\r\nConnection: close\r\n\r\n`,
      upgradeLines(`ws://${host}:${port}/s`),
    ];
    try {
      for (const host of ["[::1]", "six.test", "[0:0:0:0:0:0:0:1]"]) {
        for (const text of shapes(host)) {
          const got = await send(gatePort, text);
          got.socket.destroy();
          expect(`${host} ${text.slice(0, 12)} -> ${got.status}`).toBe(`${host} ${text.slice(0, 12)} -> 403`);
        }
      }
      expect(conns).toBe(0);
      // The record takes the address with or without its brackets.
      expect(gate.failure("::1", port)).toBe("refused");
      expect(gate.failure("[::1]", port)).toBe("refused");

      const sixOpen = await startEgressGate({ policy: { resolve, allow: (ip: string): boolean => ip === "::1" } });
      try {
        for (const host of ["[::1]", "six.test"]) {
          const answers: string[] = [];
          for (const text of shapes(host)) {
            const got = await send(portOf(sixOpen), text);
            answers.push(`${got.status} ${(await drain(got.socket, got.rest)).slice(-3)}`);
          }
          expect({ host, answers }).toEqual({ host, answers: ["200 six", "200 six", "200 six"] });
        }
        expect(sixOpen.failure("::1", port)).toBeUndefined();
      } finally {
        await sixOpen.close();
      }
      expect(seen).toEqual([
        "GET /inside HTTP/1.1 | inside.test",
        `GET /p?q=1 HTTP/1.1 | [::1]:${port}`,
        `GET /s HTTP/1.1 | [::1]:${port}`,
        "GET /inside HTTP/1.1 | inside.test",
        `GET /p?q=1 HTTP/1.1 | six.test:${port}`,
        `GET /s HTTP/1.1 | six.test:${port}`,
      ]);
      expect(conns).toBe(6);
    } finally {
      delete names["six.test"];
      await closeServer(six);
    }
  });
});

describe("tests-8: rules of the gate that no test reached", () => {
  test("G04: the browser's Connection and Keep-Alive headers stay with the gate", async () => {
    const got = await send(gatePort, `GET http://open.test:${A}/page HTTP/1.1\r\nHost: open.test:${A}\r\nConnection: keep-alive, x-hop\r\nKeep-Alive: timeout=5, max=100\r\nX-Kept: yes\r\n\r\n`);
    got.socket.destroy();
    expect(got.status).toBe(200);
    expect(allowedHits.length).toBe(1);
    expect(allowedHits[0].headers["keep-alive"]).toBeUndefined();
    expect(allowedHits[0].headers.connection ?? "").not.toContain("x-hop");
    expect(allowedHits[0].headers["x-kept"]).toBe("yes");
  });

  test("G25: bytes an upstream sends right after its 200 reach the client, for a tunnel and for an upgrade", async () => {
    const eager = createNetServer((socket) => {
      socket.on("error", () => { /* the gate went away */ });
      // For a tunnel they are the target's first bytes; for the upgrade (to
      // port 1), the start of the target's answer head.
      socket.once("data", (d: Buffer) => socket.write(d.toString("latin1").startsWith("CONNECT open.test:1 ")
        ? "HTTP/1.1 200 Connection Established\r\n\r\nHTTP/1.1 101 Switching Protocols\r\nX-CBrowser-Egress: refused\r\nUpgrade: websocket\r\n\r\nEARLY-BYTES"
        : "HTTP/1.1 200 Connection Established\r\n\r\nEARLY-BYTES"));
    });
    const port = await listenOn(eager, "127.0.0.1");
    const chained = await startEgressGate({ policy, upstream: { server: `http://127.0.0.1:${port}` } });
    try {
      const tunnel = await send(portOf(chained), connectLine(`open.test:${N}`));
      expect(tunnel.status).toBe(200);
      expect((await take(tunnel.socket, tunnel.rest, "EARLY-BYTES".length)).toString()).toBe("EARLY-BYTES");
      tunnel.socket.destroy();
      // An upgrade gets no head from the gate: the first bytes it reads are the
      // upstream's, the target's head passed on without the mark (gate-3).
      const socketUp = await new Promise<string>((done) => {
        const socket = netConnect(portOf(chained), "127.0.0.1", () => socket.write(upgradeLines("ws://open.test:1/socket")));
        let got = "";
        const timer = setTimeout(() => { socket.destroy(); done(got); }, 2000);
        socket.on("error", () => done("error"));
        socket.on("data", (d: Buffer) => {
          got += d.toString("latin1");
          if (got.endsWith("EARLY-BYTES")) { clearTimeout(timer); socket.destroy(); done(got); }
        });
      });
      expect(socketUp).toBe("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n\r\nEARLY-BYTES");
    } finally {
      await chained.close();
      await closeServer(eager);
    }
  });

  test("G26: an upstream whose answer to CONNECT never ends is given up on at 64 KB, not at the time limit", async () => {
    const endless = createNetServer((socket) => {
      socket.on("error", () => { /* the gate went away */ });
      socket.once("data", () => socket.write(`HTTP/1.1 200 ${"a".repeat(70 * 1024)}`));
    });
    const port = await listenOn(endless, "127.0.0.1");
    const chained = await startEgressGate({ policy, upstream: { server: `http://127.0.0.1:${port}` }, timeouts: { upstreamAnswer: 5000 } });
    try {
      const started = Date.now();
      const tunnel = await send(portOf(chained), connectLine(`open.test:${N}`));
      tunnel.socket.destroy();
      expect(tunnel.status).toBe(502);
      expect(Date.now() - started).toBeLessThan(2500);
      expect(chained.failure("open.test", N)).toBe("upstream");
    } finally {
      await chained.close();
      await closeServer(endless);
    }
  });

  test("G45: when the client gives up on a response, the gate lets go of the target", async () => {
    const got = await send(gatePort, `GET http://open.test:${A}/hold HTTP/1.1\r\nHost: open.test:${A}\r\n\r\n`);
    expect(got.status).toBe(200);
    await sleep(200);
    // Control: while the client is there, the connection to the target stays.
    expect(heldClosed).toBe(0);
    got.socket.destroy();
    for (let i = 0; i < 40 && heldClosed === 0; i++) await sleep(25);
    expect(heldClosed).toBe(1);
  });

  test("G45, through an upstream that takes a plain request and never answers it", async () => {
    const chained = await startEgressGate({ policy, upstream: { server: `http://127.0.0.1:${Q}` }, timeouts: { upstreamAnswer: 5000 } });
    try {
      const socket = netConnect(portOf(chained), "127.0.0.1", () => socket.write(`GET http://open.test:${A}/page HTTP/1.1\r\nHost: open.test:${A}\r\n\r\n`));
      let answered = false;
      socket.on("data", () => { answered = true; });
      socket.on("error", () => { /* destroyed below */ });
      for (let i = 0; i < 40 && silentConns === 0; i++) await sleep(25);
      await sleep(300);
      // No answer, and no limit on one: the gate waits as long as the browser does, and no longer.
      expect(silentConns).toBe(1);
      expect(silentClosed).toBe(0);
      expect(answered).toBe(false);
      socket.destroy();
      for (let i = 0; i < 40 && silentClosed === 0; i++) await sleep(25);
      expect(silentClosed).toBe(1);
    } finally {
      await chained.close();
    }
  });
});

describe("tests-2: what a hosted gate runs with", () => {
  test("the limits no caller overrides", () => {
    expect(EGRESS_GATE_LIMITS).toEqual({
      connectMs: 10_000,
      nextAddressMs: 250,
      dialAttempts: 2,
      dialAddresses: 8,
      upstreamAnswerMs: 30_000,
      headMs: 30_000,
      relayClaimMs: 1_000,
      maxHeadBytes: 65_536,
      failureTtlMs: 60_000,
      failureMax: 500,
    });
    expect(Object.isFrozen(EGRESS_GATE_LIMITS)).toBe(true);
    expect(EGRESS_HEADER).toBe("X-CBrowser-Egress");
  });

  test("no call in src gives a gate a policy, a user, a limit or a certificate authority of its own", () => {
    const root = join(import.meta.dir, "..", "src");
    const calls: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        const text = readFileSync(path, "utf8");
        for (const m of text.matchAll(/\bstartEgressGate\s*\(/g)) {
          // The definition itself is "function startEgressGate(options".
          if (/function\s+$/.test(text.slice(0, m.index))) continue;
          let depth = 1;
          let at = m.index! + m[0].length;
          const from = at;
          while (at < text.length && depth > 0) {
            if (text[at] === "(") depth++;
            if (text[at] === ")") depth--;
            at++;
          }
          calls.push(`${path.slice(root.length + 1)}: ${text.slice(from, at - 1).replace(/\s+/g, " ").trim()}`);
        }
      }
    };
    walk(root);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect({ call, testOnly: /\b(?:ca|policy|uid|timeouts)\b\s*[:,}]|\.\.\./.test(call) }).toEqual({ call, testOnly: false });
    }
    // The scan does see such a call when there is one.
    expect(/\b(?:ca|policy|uid|timeouts)\b\s*[:,}]|\.\.\./.test("x.ts: { upstream: proxy, ca: pem }")).toBe(true);
    expect(/\b(?:ca|policy|uid|timeouts)\b\s*[:,}]|\.\.\./.test("x.ts: { ...options }")).toBe(true);
    expect(/\b(?:ca|policy|uid|timeouts)\b\s*[:,}]|\.\.\./.test("x.ts: { upstream: proxy, timeouts }")).toBe(true);
  });
});

// The hosted servers run under Node (ExecStart=/usr/bin/node), these tests
// under Bun, and the two differ exactly where the gate listens: Bun's
// node:http server answers 400 to an absolute ws:// request line itself, Node
// hands it to the gate as an 'upgrade' or a 'request' event. They differ in
// more: Node's writeHead throws where Bun's does not, Node gives the inner
// listener a relay's accepted socket before the relay knows its own port and
// Bun after, and each has its own TLS. This script is the gate (and the
// forwarder), built for Node, driven the same way with its own listeners. It
// prints one JSON object. Arguments: the key and certificate of an https
// proxy on 127.0.0.1, and whether this machine has ::1.
const NODE_RUN = String.raw`
import { createServer as http } from "node:http";
import { createServer as tcp, connect } from "node:net";
import { createServer as tlsServer } from "node:tls";
import { readFileSync, readdirSync, readlinkSync } from "node:fs";
import { startEgressGate } from "./egress-gate.js";
import { startProxyForwarder } from "./proxy-forwarder.js";
const [keyPath, certPath, hasV6, silentPort, silentList] = process.argv.slice(2);
const ALLOWED = "127.0.0.2", REFUSED = "127.0.0.1";
const LOGIN = "Basic " + Buffer.from("gate-user:gate-s3cret").toString("base64");
let refusedConns = 0, rawSeen = "", rebindAsked = 0;
const lookups = [], upstreamAuth = [];
const listen = (s, host) => new Promise((r) => s.listen(0, host, () => r(s.address().port)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const allowed = http((req, res) => { res.writeHead(200, { "content-length": "7" }); res.end("allowed"); });
const refused = http((req, res) => { res.writeHead(200, { "content-length": "7" }); res.end("refused"); });
refused.on("connection", () => { refusedConns++; });
const raw = tcp((s) => {
  let head = "", echo = false;
  s.on("error", () => {});
  s.on("data", (d) => {
    rawSeen += d.toString("latin1");
    if (echo) { s.write(d); return; }
    head += d.toString("latin1");
    if (!head.includes("\r\n\r\n")) return;
    if (/^upgrade:/im.test(head)) { echo = true; s.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n"); }
    else s.end("HTTP/1.1 200 OK\r\nContent-Length: 3\r\nConnection: close\r\n\r\nraw");
  });
});
// What a target, or an upstream proxy, can answer a plain request with. The
// first group stopped the process before the response callback was guarded.
const answers = {
  "/ok": "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok",
  "/099": "HTTP/1.1 099 x\r\nContent-Length: 0\r\n\r\n",
  "/000": "HTTP/1.1 000 x\r\nContent-Length: 0\r\n\r\n",
  "/trailer-cl": "HTTP/1.1 200 OK\r\nTrailer: x-t\r\nContent-Length: 2\r\n\r\nok",
  "/trailer-204": "HTTP/1.1 204 No Content\r\nTrailer: x-t\r\n\r\n",
  "/trailer-304": "HTTP/1.1 304 Not Modified\r\nTrailer: x-t\r\n\r\n",
  "/trailer-chunked": "HTTP/1.1 200 OK\r\nTrailer: x-t\r\nTransfer-Encoding: chunked\r\n\r\n2\r\nok\r\n0\r\nx-t: 1\r\n\r\n",
  "/chunked": "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2\r\nok\r\n0\r\n\r\n",
  "/101": "HTTP/1.1 101 Switching Protocols\r\nUpgrade: x\r\nConnection: Upgrade\r\n\r\n",
  "/fake-mark": "HTTP/1.1 403 Forbidden\r\nX-CBrowser-Egress: refused\r\nContent-Length: 4\r\n\r\nsite",
  // gate-3: answers to an upgrade that carry the mark.
  "/ws-mark": "HTTP/1.1 101 Switching Protocols\r\nX-CBrowser-Egress: refused\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n",
  "/ws-mark-403": "HTTP/1.1 403 Forbidden\r\nx-cbrowser-egress: unreachable\r\nContent-Length: 0\r\n\r\n",
};
const hostile = tcp((s) => {
  let head = "";
  s.on("error", () => {});
  s.on("data", (d) => {
    head += d.toString("latin1");
    if (!head.includes("\r\n\r\n")) return;
    const path = /^\S+ (?:http:\/\/[^/\s]+)?(\S+)/.exec(head)?.[1] ?? "";
    head = "";
    s.write(answers[path] ?? answers["/ok"], "latin1");
  });
});
const A = await listen(allowed, ALLOWED), R = await listen(refused, REFUSED), N = await listen(raw, ALLOWED), H = await listen(hostile, ALLOWED);
const names = { "open.test": [ALLOWED], "closed.test": [REFUSED], "six.test": ["::1"] };
const resolve = async (host) => {
  lookups.push(host);
  if (host === "rebind.test") return rebindAsked++ === 0 ? [ALLOWED] : [REFUSED];
  if (!names[host]) throw new Error("ENOTFOUND");
  return names[host];
};
const policy = { resolve, allow: (ip) => ip === ALLOWED };
// An upstream proxy that takes CONNECT only, and only with the login.
const upstream = tcp((s) => {
  let head = "";
  s.on("error", () => {});
  const onData = (d) => {
    head += d.toString("latin1");
    if (!head.includes("\r\n\r\n")) return;
    s.off("data", onData);
    const auth = /^proxy-authorization: (.*)$/im.exec(head)?.[1] ?? null;
    upstreamAuth.push(auth === LOGIN);
    const m = /^CONNECT ([^:]+):(\d+) /.exec(head);
    if (auth !== LOGIN || !m || !names[m[1]]) { s.end("HTTP/1.1 407 No\r\nContent-Length: 0\r\n\r\n"); return; }
    const to = connect(Number(m[2]), names[m[1]][0], () => { s.write("HTTP/1.1 200 OK\r\n\r\n"); to.pipe(s); s.pipe(to); });
    to.on("error", () => s.destroy());
  };
  s.on("data", onData);
});
const U = await listen(upstream, "127.0.0.1");
const statusOf = (text) => Number(/^HTTP\/1\.1 (\d{3})/.exec(text)?.[1] ?? 0);
// The head of the answer to one request on a new connection; "" when nothing came back.
const firstHead = (port, text, from) => new Promise((done) => {
  const s = connect({ host: "127.0.0.1", port, ...(from ? { localAddress: from } : {}) }, () => s.write(text));
  let got = "";
  const give = () => done(got.split("\r\n\r\n")[0]);
  s.on("data", (d) => { got += d.toString("latin1"); if (got.includes("\r\n\r\n")) { s.destroy(); give(); } });
  s.on("error", give);
  s.on("close", give);
});
const first = async (port, text, from) => statusOf(await firstHead(port, text, from));
// The status and the gate's mark, as "502 unreachable" or "200".
const marked = async (port, text) => {
  const head = await firstHead(port, text);
  const mark = /^x-cbrowser-egress: (.*)$/im.exec(head)?.[1];
  return statusOf(head) + (mark ? " " + mark : "");
};
const page = (host, port, path = "/x") => "GET http://" + host + ":" + port + path + " HTTP/1.1\r\nHost: " + host + "\r\n\r\n";
const up = (url, extra = "") => "GET " + url + " HTTP/1.1\r\nHost: h.test\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" + extra + "\r\n";
// The status of the answer to a request that follows a plain one on the same connection.
const reused = (port, text) => new Promise((done) => {
  const s = connect(port, "127.0.0.1", () => s.write(page("open.test", A)));
  let got = "", sent = false;
  s.on("data", (d) => {
    got += d.toString("latin1");
    if (!sent && got.endsWith("allowed")) { sent = true; got = ""; s.write(text); return; }
    if (sent && got.includes("\r\n\r\n")) { s.destroy(); done(statusOf(got)); }
  });
  s.on("error", () => {});
  s.on("close", () => done(sent ? statusOf(got) : -1));
});
// The 127.0.0.1 ports this process listens on, as the Bun tests find them.
const ownListeningPorts = () => {
  const inodes = new Set();
  for (const fd of readdirSync("/proc/self/fd")) {
    try { const m = /^socket:\[(\d+)\]$/.exec(readlinkSync("/proc/self/fd/" + fd)); if (m) inodes.add(m[1]); } catch {}
  }
  const ports = new Set();
  for (const line of readFileSync("/proc/net/tcp", "utf8").split("\n")) {
    const cols = line.trim().split(/\s+/);
    if (cols[3] === "0A" && cols[1]?.startsWith("0100007F:") && inodes.has(cols[9])) ports.add(parseInt(cols[1].slice(9), 16));
  }
  return ports;
};
const linux = process.platform === "linux";
const portsBefore = linux ? ownListeningPorts() : new Set();
const gate = await startEgressGate({ policy });
const port = Number(new URL(gate.server).port);
const innerPort = linux ? [...ownListeningPorts()].find((p) => !portsBefore.has(p) && p !== port) : 0;
const out = {};
out.plainAllowed = await first(port, page("open.test", A));
out.plainRefused = await first(port, page("closed.test", R));
out.plainLiteral = await first(port, page("127.0.0.1", R));
out.connectAllowed = await first(port, "CONNECT open.test:" + N + " HTTP/1.1\r\n\r\n");
out.connectRefused = await first(port, "CONNECT closed.test:" + R + " HTTP/1.1\r\n\r\n");
rawSeen = "";
out.wsFirst = await first(port, up("ws://open.test:" + N + "/s"));
out.wsFirstSeen = rawSeen.startsWith("GET /s HTTP/1.1\r\nHost: open.test:" + N + "\r\n");
out.wsRefused = await first(port, up("ws://closed.test:" + R + "/s"));
out.reusedWs = await reused(port, up("ws://open.test:" + N + "/s"));
out.reusedWsRefused = await reused(port, up("ws://closed.test:" + R + "/s"));
out.reusedConnectRefused = await reused(port, "CONNECT closed.test:" + R + " HTTP/1.1\r\n\r\n");
const before = lookups.length;
out.reusedWss = await reused(port, up("wss://open.test:" + N + "/s"));
out.reusedFtp = await reused(port, "GET ftp://open.test:" + N + "/x HTTP/1.1\r\nHost: h.test\r\n\r\n");
out.reusedWsNoUpgrade = await reused(port, "GET ws://open.test:" + N + "/s HTTP/1.1\r\nHost: h.test\r\n\r\n");
out.reusedOrigin = await reused(port, "GET /x HTTP/1.1\r\nHost: h.test\r\n\r\n");
out.lookupsForThose = lookups.length - before - 4;
// A kept connection is served again after the second in which the inner
// listener waits for a connection to turn out to be a relay's.
out.reusedLate = await new Promise((done) => {
  const s = connect(port, "127.0.0.1", () => s.write(page("open.test", A)));
  let got = "", sent = false;
  s.on("data", (d) => {
    got += d.toString("latin1");
    if (!sent && got.endsWith("allowed")) { sent = true; got = ""; setTimeout(() => s.write(page("open.test", A)), 1400); return; }
    if (sent && got.endsWith("allowed")) { s.destroy(); done(statusOf(got)); }
  });
  s.on("error", () => {});
  s.on("close", () => done(sent ? statusOf(got) : -1));
});
out.otherLoopback = await first(port, page("open.test", A), "127.0.0.2");
out.rebind = await first(port, page("rebind.test", A));
out.rebindAsked = rebindAsked;

// gate-bypass-1: nothing a target answers stops the process, and the gate goes on serving.
out.hostile = {};
for (const path of Object.keys(answers)) out.hostile[path] = await marked(port, page("open.test", H, path));
out.afterHostile = await first(port, page("open.test", A));
out.upgradeMarks = [await marked(port, up("ws://open.test:" + H + "/ws-mark")), await marked(port, up("ws://open.test:" + H + "/ws-mark-403"))];
// gate-3: an upstream that answers a plain request with the mark of its own, on a 502 and on a 407.
const markingUp = tcp((s) => {
  s.on("error", () => {});
  s.once("data", (d) => s.end(d.toString("latin1").includes(LOGIN)
    ? "HTTP/1.1 502 Bad Gateway\r\nX-CBrowser-Egress: unreachable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    : "HTTP/1.1 407 No\r\nX-CBrowser-Egress: refused\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"));
});
const M = await listen(markingUp, "127.0.0.1");
out.upstreamMarks = [];
for (const password of ["gate-s3cret", "wrong"]) {
  const g = await startEgressGate({ policy, upstream: { server: "http://127.0.0.1:" + M, username: "gate-user", password } });
  out.upstreamMarks.push(await marked(Number(new URL(g.server).port), page("open.test", A)));
  await g.close();
}
markingUp.close();

// gate-1: a client that leaves while the gate races silent addresses ends the race, in every request shape.
if (silentPort) {
  const silent = silentList.split(",");
  names["many.test"] = silent;
  const remotes = new Set(silent.map((ip) => ip.split(".").reverse().map((p) => Number(p).toString(16).toUpperCase().padStart(2, "0")).join("") + ":" + Number(silentPort).toString(16).toUpperCase().padStart(4, "0")));
  const attempting = () => readFileSync("/proc/net/tcp", "utf8").split("\n").filter((line) => { const cols = line.trim().split(/\s+/); return remotes.has(cols[2]) && cols[3] === "02"; }).length;
  const baseline = attempting();
  const wide = await startEgressGate({ policy: { resolve, allow: () => true } });
  const wport = Number(new URL(wide.server).port);
  out.leaving = [];
  for (const text of ["CONNECT many.test:" + silentPort + " HTTP/1.1\r\n\r\n", page("many.test", silentPort), up("ws://many.test:" + silentPort + "/s")]) {
    const s = connect(wport, "127.0.0.1", () => s.write(text));
    s.on("error", () => {});
    await sleep(700);
    const racing = attempting() - baseline;
    s.destroy();
    await sleep(100);
    out.leaving.push([racing >= 1 && racing <= 2, attempting() - baseline]);
  }
  await wide.close();
} else {
  out.leaving = "not linux";
}
// The same answers from an upstream proxy to the forwarder, which has the same callback.
const forwarder = await startProxyForwarder({ server: "http://" + ALLOWED + ":" + H, username: "u", password: "p" });
const fport = Number(new URL(forwarder.server).port);
out.forwarder = {};
for (const path of ["/ok", "/099", "/000", "/trailer-cl", "/trailer-204", "/trailer-chunked"]) out.forwarder[path] = await first(fport, page("x.test", 80, path));
out.forwarderAfter = await first(fport, page("x.test", 80, "/ok"));
await forwarder.close();

// gate-bypass-2 and tests-4: many plain connections at once (Node sees each
// relay's accepted socket before the relay's own connect event), and a local
// client that is not the front is refused on the inner port.
out.burst = (await Promise.all(Array.from({ length: 40 }, () => first(port, page("open.test", A))))).filter((s) => s === 200).length;
out.innerDirect = linux ? [await first(innerPort, page("open.test", A)), await first(innerPort, "CONNECT open.test:" + N + " HTTP/1.1\r\n\r\n"), await first(innerPort, up("ws://open.test:" + N + "/s"))] : [0, 0, 0];
// A direct client that says nothing is let go of when the time it had to
// turn out to be a relay is up: after about a second, not before and not never.
const silentMs = (p) => new Promise((done) => {
  const t0 = performance.now();
  const s = connect({ host: "127.0.0.1", port: p, allowHalfOpen: true });
  const timer = setTimeout(() => { s.destroy(); done(9999); }, 4000);
  s.on("error", () => {});
  s.on("end", () => { clearTimeout(timer); s.destroy(); done(performance.now() - t0); });
  s.resume();
});
const silentFor = linux ? await silentMs(innerPort) : 1000;
out.innerSilent = silentFor >= 900 && silentFor < 3000;

// gate-bypass-4: a client that ends before a complete head is let go of.
const letGo = (early) => new Promise((done) => {
  const s = connect({ host: "127.0.0.1", port, allowHalfOpen: true }, () => setTimeout(() => s.end(early), 300));
  const timer = setTimeout(() => { s.destroy(); done(false); }, 1800);
  s.on("error", () => {});
  s.on("close", () => { clearTimeout(timer); done(true); });
  s.resume();
});
out.letGo = [await letGo(""), await letGo("GET http://open.te"), await letGo("CONNECT open.test:" + N + " HTTP/1.1\r\nHost: open.te")];

// gate-bypass-5: 60,000 spaces inside one header value.
const padStart = performance.now();
out.padded = await first(port, "CONNECT closed.test:" + R + " HTTP/1.1\r\nX-Pad: a" + " ".repeat(60000) + "b\r\n\r\n");
out.paddedFast = performance.now() - padStart < 400;

// Why a request was not carried.
out.failures = [gate.failure("closed.test", R) ?? null, gate.failure("CLOSED.TEST", R) ?? null, gate.failure("open.test", A) ?? null, gate.failure("open.test", H) ?? null];

// tests-9: an IPv6 target, refused here and reached through a gate that allows ::1.
if (hasV6 === "yes") {
  const six = tcp((s) => { s.on("error", () => {}); s.once("data", () => s.end("HTTP/1.1 200 OK\r\nContent-Length: 3\r\nConnection: close\r\n\r\nsix")); });
  const X = await listen(six, "::1");
  const sixGate = await startEgressGate({ policy: { resolve, allow: (ip) => ip === "::1" } });
  const sport = Number(new URL(sixGate.server).port);
  const shapes = (host) => ["CONNECT " + host + ":" + X + " HTTP/1.1\r\n\r\n", page(host, X), up("ws://" + host + ":" + X + "/s")];
  out.v6Refused = [];
  out.v6Allowed = [];
  for (const text of shapes("[::1]")) out.v6Refused.push(await first(port, text));
  for (const text of [...shapes("[::1]"), ...shapes("six.test")]) out.v6Allowed.push(await first(sport, text));
  await sixGate.close();
  six.close();
} else {
  out.v6Refused = "no ::1 here";
  out.v6Allowed = "no ::1 here";
}

const chained = await startEgressGate({ policy, upstream: { server: "http://127.0.0.1:" + U, username: "gate-user", password: "gate-s3cret" } });
const cport = Number(new URL(chained.server).port);
rawSeen = "";
out.upstreamWs = await first(cport, up("ws://open.test:" + N + "/s", "Proxy-Authorization: Basic anVuaw==\r\n"));
out.upstreamConnect = await first(cport, "CONNECT open.test:" + N + " HTTP/1.1\r\n\r\n");
out.upstreamRefused = await first(cport, "CONNECT closed.test:" + R + " HTTP/1.1\r\n\r\n");
await sleep(50);
out.upstreamAuth = upstreamAuth;
out.targetSawRequest = rawSeen.startsWith("GET /s HTTP/1.1\r\nHost: open.test:" + N + "\r\n");
out.targetSawLogin = /proxy-authorization/i.test(rawSeen) || rawSeen.includes(LOGIN.slice(6)) || rawSeen.includes("anVuaw==");
out.refusedConns = refusedConns;

// tests-3: an https upstream. The proxy speaks TLS; a plain relay in front of
// it keeps every byte that crosses, to show the login is not among them.
const insideTls = [];
let clearBytes = "";
const tlsProxy = tlsServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, (s) => {
  s.on("error", () => {});
  let head = "";
  const onData = (d) => {
    head += d.toString("latin1");
    if (!head.includes("\r\n\r\n")) return;
    s.off("data", onData);
    const line = head.split("\r\n")[0];
    insideTls.push(line.split(" ")[0] + " " + (/^proxy-authorization: (.*)$/im.exec(head)?.[1] === LOGIN));
    const tunnel = /^CONNECT ([^:\s]+):(\d+) /.exec(line);
    const absolute = /^GET http:\/\/([^:/\s]+):(\d+)(\S*) /.exec(line);
    const to = tunnel ?? absolute;
    const o = connect(Number(to[2]), names[to[1]][0], () => {
      if (tunnel) s.write("HTTP/1.1 200 OK\r\n\r\n");
      else o.write("GET " + absolute[3] + " HTTP/1.1\r\nHost: " + to[1] + "\r\nConnection: close\r\n\r\n");
      o.pipe(s); s.pipe(o);
    });
    o.on("error", () => s.destroy());
  };
  s.on("data", onData);
});
tlsProxy.on("tlsClientError", () => {});
const T = await listen(tlsProxy, "127.0.0.1");
const clearFront = tcp((s) => {
  const to = connect(T, "127.0.0.1");
  s.on("data", (d) => { clearBytes += d.toString("latin1"); });
  s.on("error", () => to.destroy());
  to.on("error", () => s.destroy());
  s.pipe(to); to.pipe(s);
});
const P = await listen(clearFront, "127.0.0.1");
const secureUp = { server: "https://127.0.0.1:" + P, username: "gate-user", password: "gate-s3cret" };
const trusting = await startEgressGate({ policy, upstream: secureUp, ca: readFileSync(certPath), timeouts: { upstreamAnswer: 5000 } });
const tport = Number(new URL(trusting.server).port);
out.httpsUpConnect = await first(tport, "CONNECT open.test:" + N + " HTTP/1.1\r\n\r\n");
out.httpsUpPlain = await first(tport, page("open.test", A));
out.httpsUpRefused = await marked(tport, "CONNECT closed.test:" + R + " HTTP/1.1\r\n\r\n");
await trusting.close();
out.httpsUpInsideTls = [...insideTls];
out.httpsUpClearIsTls = clearBytes.charCodeAt(0) === 0x16;
out.httpsUpLoginInClear = clearBytes.includes(LOGIN.slice(6)) || /proxy-authorization|CONNECT /i.test(clearBytes);
// The certificate is checked even when the environment says not to check any.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const wary = await startEgressGate({ policy, upstream: secureUp, timeouts: { upstreamAnswer: 5000 } });
const wport = Number(new URL(wary.server).port);
out.httpsUpUntrusted = [await marked(wport, "CONNECT open.test:" + N + " HTTP/1.1\r\n\r\n"), await marked(wport, page("open.test", A))];
out.httpsUpUntrustedSent = insideTls.length - out.httpsUpInsideTls.length;
await wary.close();

await gate.close();
await chained.close();
console.log(JSON.stringify(out));
process.exit(0);
`;

describe("under Node, the runtime of the hosted servers", () => {
  test("the request shapes, the user checks, hostile answers, both kinds of upstream and the failure record behave as under Bun", async () => {
    const built = await Bun.build({
      entrypoints: [join(import.meta.dir, "..", "src", "egress-gate.ts"), join(import.meta.dir, "..", "src", "proxy-forwarder.ts")],
      outdir: workDir,
      target: "node",
      format: "esm",
    });
    expect(built.success).toBe(true);
    const keyPath = join(workDir, "node-up-k.pem");
    const certPath = join(workDir, "node-up-c.pem");
    const made = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath, "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
    expect(made.status).toBe(0);
    writeFileSync(join(workDir, "node-run.mjs"), NODE_RUN);
    // NODE_NO_WARNINGS: the script sets NODE_TLS_REJECT_UNAUTHORIZED itself, and Node says so on stderr.
    // Addresses that neither accept nor refuse, for the gate-1 case (Linux only).
    const silent = process.platform === "linux" ? await silentAddresses(4, 120) : undefined;
    let ran: ReturnType<typeof spawnSync<string>>;
    try {
      const args = [join(workDir, "node-run.mjs"), keyPath, certPath, HAS_V6 ? "yes" : "no", ...(silent ? [String(silent.port), silent.addresses.join(",")] : [])];
      ran = spawnSync("node", args, { encoding: "utf8", timeout: 40_000, env: { ...process.env, NODE_NO_WARNINGS: "1" } });
    } finally {
      silent?.stop();
    }
    expect(ran.stderr).toBe("");
    expect(JSON.parse(ran.stdout || "{}")).toEqual({
      plainAllowed: 200,
      plainRefused: 403,
      plainLiteral: 403,
      connectAllowed: 200,
      connectRefused: 403,
      wsFirst: 101,
      wsFirstSeen: true,
      wsRefused: 403,
      // Node only: a ws:// request after a plain one reaches the gate as an 'upgrade' event.
      reusedWs: 101,
      reusedWsRefused: 403,
      reusedConnectRefused: 403,
      // Node only: these reach the gate's own handlers and are not proxy requests it serves.
      reusedWss: 400,
      reusedFtp: 400,
      reusedWsNoUpgrade: 400,
      reusedOrigin: 400,
      lookupsForThose: 0,
      // A relay's connection is not let go of when the claim time is up.
      reusedLate: 200,
      otherLoopback: 0,
      rebind: 200,
      rebindAsked: 1,
      // gate-bypass-1. Node only: writeHead throws on a status below 100 and
      // on Trailer without chunked encoding, and the throw stopped the process.
      hostile: {
        "/ok": "200",
        "/099": "502 unreachable",
        "/000": "502 unreachable",
        "/trailer-cl": "200",
        "/trailer-204": "204",
        "/trailer-304": "304",
        "/trailer-chunked": "200",
        "/chunked": "200",
        // A 101 nobody asked for ends the request with no error: an answer is still owed.
        "/101": "502 unreachable",
        // The site's own 403, with the mark it tried to set taken off.
        "/fake-mark": "403",
        // The two upgrade answers below, sent to a plain request.
        "/ws-mark": "502 unreachable",
        "/ws-mark-403": "403",
      },
      afterHostile: 200,
      // gate-3: the mark is taken off a target's answer to an upgrade, and an upstream's own mark off a plain answer.
      upgradeMarks: ["101", "403"],
      upstreamMarks: ["502", "407 upstream"],
      // gate-1: the race was on (one or two attempts open) and nothing was left of it 100 ms after the client went.
      leaving: process.platform === "linux" ? [[true, 0], [true, 0], [true, 0]] : "not linux",
      forwarder: { "/ok": 200, "/099": 502, "/000": 502, "/trailer-cl": 200, "/trailer-204": 204, "/trailer-chunked": 200 },
      forwarderAfter: 200,
      burst: 40,
      // tests-4: local clients of the inner listener that are not the front.
      innerDirect: [0, 0, 0],
      innerSilent: true,
      letGo: [true, true, true],
      padded: 403,
      paddedFast: true,
      failures: ["refused", "refused", null, null],
      v6Refused: HAS_V6 ? [403, 403, 403] : "no ::1 here",
      v6Allowed: HAS_V6 ? [200, 200, 200, 200, 200, 200] : "no ::1 here",
      upstreamWs: 101,
      upstreamConnect: 200,
      upstreamRefused: 403,
      upstreamAuth: [true, true],
      targetSawRequest: true,
      targetSawLogin: false,
      refusedConns: 0,
      httpsUpConnect: 200,
      httpsUpPlain: 200,
      httpsUpRefused: "403 refused",
      httpsUpInsideTls: ["CONNECT true", "GET true"],
      httpsUpClearIsTls: true,
      httpsUpLoginInClear: false,
      httpsUpUntrusted: ["502 upstream", "502 upstream"],
      httpsUpUntrustedSent: 0,
    });
  }, 60_000);
});
