/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * A local proxy in front of a proxy that needs a login, so the browser never
 * holds the login.
 *
 * Measured 2026-11-02 with Playwright 1.64.1: a launch proxy's username and
 * password become the context's httpCredentials for every origin in chromium
 * and webkit, and Playwright answers every auth challenge with them. A site
 * that answers 401 got the proxy account's username and password back (chromium
 * on its second request, webkit on its first), and webkit also sent a
 * Proxy-Authorization header with them inside every HTTPS tunnel, to the site
 * itself. Firefox takes the login through its own proxy settings and leaked
 * neither.
 *
 * The browser now talks to this forwarder on 127.0.0.1 with no login. The
 * forwarder adds Proxy-Authorization only on its own requests to the upstream
 * proxy: on CONNECT for https and ws (all three engines tunnel WebSockets),
 * on the request line for plain http. It serves only proxy requests
 * (absolute http:// URLs and CONNECT), only from 127.0.0.1, and on Linux only
 * from this process's own user, so other accounts on the machine cannot
 * borrow the upstream proxy while it runs.
 */

import { Agent as HttpAgent, createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { connect as netConnect, isIP, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { ProxyConfig } from "./types.js";
import { startEgressGate } from "./egress-gate.js";
import { isHostedMode } from "./mcp-tools/hosted-inputs.js";

/**
 * Why the egress gate did not carry a request. "refused": the target's name
 * did not resolve or resolved to an address the hosted server does not
 * connect to. "unreachable": the address was allowed and nothing answered.
 * "upstream": the configured proxy refused or did not answer.
 */
export type EgressFailure = "refused" | "unreachable" | "upstream";

export interface ProxyForwarder {
  /** What the browser is given as its proxy: http://127.0.0.1:<port>, no login. */
  server: string;
  close(): Promise<void>;
  /**
   * Egress gate only: why the gate last failed to carry a request to
   * host:port, when it did within the last minute. A browser reports every
   * such failure of an https page as one tunnel error, and a plain-http one
   * as an ordinary response, so whoever started the navigation asks here.
   */
  failure?(host: string, port: number): EgressFailure | undefined;
}

/**
 * The proxy server as a URL. Playwright reads a server with no scheme
 * ("proxy.example.com:3128") as http, so this does too: without it such a
 * server skipped the forwarder and Playwright got the login.
 */
export function proxyServerUrl(server: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(server) ? server : `http://${server}`;
}

/**
 * A tool's proxy parameter ("http://user:pass@host:port") as a ProxyConfig,
 * with the login decoded. site_cognitive_assessment parsed it inline as
 * protocol//hostname:port, which wrote "http://host:" for a proxy without a
 * port and read "host:3128" as the scheme "host:" (2026-11-04).
 *
 * Text that is not a URL is refused, without repeating it, rather than used
 * whole as the server: the whole text can carry the login, which would then
 * skip the forwarder. A login with a malformed %-escape stays as written.
 */
export function proxyConfigFromUrl(proxy: string): ProxyConfig {
  let u: URL;
  try {
    u = new URL(proxyServerUrl(proxy));
  } catch {
    throw new Error("proxy is not a URL: give it as http://user:pass@host:port (or socks5://host:port).");
  }
  const decode = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
  return {
    server: `${u.protocol}//${u.host}`,
    ...(u.username ? { username: decode(u.username) } : {}),
    ...(u.password ? { password: decode(u.password) } : {}),
  };
}

/** Whether a proxy needs the forwarder: an http(s) proxy with a login. Playwright refuses a login on socks. */
export function needsForwarder(proxy: ProxyConfig | undefined): proxy is ProxyConfig {
  return !!proxy && !!(proxy.username || proxy.password) && /^https?:\/\//i.test(proxyServerUrl(proxy.server));
}

/** 127.0.0.1:port as /proc/net/tcp writes it, and as /proc/net/tcp6 writes its v4-mapped form. */
function procLoopback(port: number): string[] {
  const p = port.toString(16).toUpperCase().padStart(4, "0");
  return [`0100007F:${p}`, `0000000000000000FFFF00000100007F:${p}`];
}

/**
 * The uid that owns the established loopback socket 127.0.0.1:`peerPort` ->
 * 127.0.0.1:`serverPort`, read from /proc/net/tcp and tcp6 text; undefined if
 * no row matches. The whole connection is matched, addresses and state too:
 * matching ports alone also matched the forwarder's own accepted socket when a
 * client bound 127.0.0.2:<the forwarder's port>, and another user got served.
 * Columns: sl local_address rem_address st tx:rx tr:tm retrnsmt uid.
 */
export function loopbackPeerUid(table: string, peerPort: number, serverPort: number): number | undefined {
  const local = procLoopback(peerPort);
  const remote = procLoopback(serverPort);
  for (const line of table.split("\n")) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 8) continue;
    const at = local.indexOf(cols[1]);
    if (at >= 0 && cols[2] === remote[at] && cols[3] === "01") {
      const uid = Number(cols[7]);
      return Number.isInteger(uid) ? uid : undefined;
    }
  }
  return undefined;
}

/**
 * Is the client on this socket a loopback client of user `uid`? Only
 * 127.0.0.1 is served; on Linux the uid is checked too (elsewhere every local
 * client is served).
 */
export function fromUser(socket: Socket, uid: number | undefined): boolean {
  if (socket.remoteAddress !== "127.0.0.1" && socket.remoteAddress !== "::ffff:127.0.0.1") return false;
  if (process.platform !== "linux" || uid === undefined) return true;
  if (socket.remotePort === undefined || socket.localPort === undefined) return false;
  let table = "";
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    try { table += readFileSync(file, "utf8") + "\n"; } catch { /* no IPv6 table */ }
  }
  return loopbackPeerUid(table, socket.remotePort, socket.localPort) === uid;
}

const PROC_V4_LOOPBACK = "0100007F";
const PROC_MAPPED_LOOPBACK = "0000000000000000FFFF00000100007F";
/**
 * One established 127.0.0.1 to 127.0.0.1 row of /proc/net/tcp or tcp6: both
 * ports and the uid. The columns are those loopbackPeerUid reads, and both
 * addresses must be written the same way (plain in tcp, v4-mapped in tcp6).
 */
const ESTABLISHED_LOOPBACK_ROW = new RegExp(
  `^[ \\t]*\\S+[ \\t]+(?:${PROC_V4_LOOPBACK}:([0-9A-F]{4})[ \\t]+${PROC_V4_LOOPBACK}:([0-9A-F]{4})|${PROC_MAPPED_LOOPBACK}:([0-9A-F]{4})[ \\t]+${PROC_MAPPED_LOOPBACK}:([0-9A-F]{4}))[ \\t]+01[ \\t]+\\S+[ \\t]+\\S+[ \\t]+\\S+[ \\t]+(\\S+)`,
  "gm",
);

/** The key of one loopback connection in loopbackPeers: the peer's port and the server's. */
export function loopbackPeerKey(peerPort: number, serverPort: number): number {
  return peerPort * 65536 + serverPort;
}

/**
 * Every established loopback connection in /proc/net/tcp and tcp6 text, as
 * loopbackPeerKey(peer port, server port) to the uid that owns the peer's
 * socket: what loopbackPeerUid answers for one pair, for all pairs in one
 * pass. A row whose uid is not a number is kept as NaN, which equals no uid.
 * One pass over 20,000 rows took 2.6 ms where splitting each line took 7 to
 * 8 ms (Node 22.19 and Bun 1.4.4, 2026-11-12).
 */
export function loopbackPeers(table: string): Map<number, number> {
  const peers = new Map<number, number>();
  for (const m of table.matchAll(ESTABLISHED_LOOPBACK_ROW)) {
    const key = loopbackPeerKey(parseInt(m[1] ?? m[3], 16), parseInt(m[2] ?? m[4], 16));
    // The first row for a connection is the one loopbackPeerUid reads.
    if (peers.has(key)) continue;
    const uid = Number(m[5]);
    peers.set(key, Number.isInteger(uid) ? uid : NaN);
  }
  return peers;
}

/**
 * Both kernel tables as text, one after the other, so a read occupies one of
 * the runtime's four file threads (every file read and dns.lookup share
 * them) and not two. A table that cannot be read counts as empty, so no
 * connection is found in it.
 */
async function readLoopbackTables(): Promise<string> {
  let table = "";
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    table += (await readFile(file, "latin1").catch(() => "")) + "\n";
  }
  return table;
}

/**
 * How much reading of the kernel tables the user check may do: a quarter of
 * the time over the long run, up to 100 ms of reading ahead of that, and no
 * caller waits for the budget longer than 50 ms.
 */
export const LOOPBACK_READ_BUDGET = Object.freeze({ share: 0.25, aheadMs: 100, maxWaitMs: 50 });

/**
 * Wraps `read` so that one read runs at a time and every caller gets the
 * result of a read that STARTED after it asked: a caller that arrives during
 * a read waits for the next one, since the running one may have passed the
 * place its own row would be. Null when that read failed.
 *
 * The reading is on a budget (LOOPBACK_READ_BUDGET). Without one the reads
 * ran back to back under load, and the kernel's work to write the table out
 * is the cost: at 200 connections a second the process used as much CPU as
 * with one synchronous read per connection, only on another thread (measured
 * 2026-11-12, see loopbackUserCheck). The budget is time spent reading: it
 * grows by a quarter of the time that passes, a read takes its own length
 * out of it, and while it is overdrawn the next read waits. So the reading
 * takes a quarter of one thread whatever the rate of callers, and
 * connections that come one after another in ordinary use (the budget holds
 * 100 ms of reading, a hundred reads of a small table) are each read for at
 * once. Where one read is longer than about 17 ms (some 20,000 rows) the
 * 50 ms ceiling on a caller's wait comes first and the share is larger.
 */
function oneReadAtATime<T>(read: () => Promise<T>): () => Promise<T | null> {
  const { share, aheadMs, maxWaitMs } = LOOPBACK_READ_BUDGET;
  let waiting: Array<(result: T | null) => void> = [];
  let reading = false;
  let credit: number = aheadMs;
  let creditAt = performance.now();
  let resting: ReturnType<typeof setTimeout> | undefined;
  const earn = (now: number): void => {
    credit = Math.min(aheadMs, credit + (now - creditAt) * share);
    creditAt = now;
  };
  const next = (): void => {
    if (reading || resting || waiting.length === 0) return;
    const started = performance.now();
    earn(started);
    if (credit < 0) {
      resting = setTimeout(() => {
        resting = undefined;
        next();
      }, Math.ceil(-credit / share));
      return;
    }
    reading = true;
    const batch = waiting;
    waiting = [];
    const settle = (result: T | null): void => {
      reading = false;
      const done = performance.now();
      earn(done);
      // One read overdraws by no more than 50 ms earns back, however long it took.
      credit = Math.max(credit - (done - started), -maxWaitMs * share);
      for (const give of batch) give(result);
      next();
    };
    let pending: Promise<T>;
    try {
      pending = read();
    } catch {
      settle(null);
      return;
    }
    pending.then(settle, () => settle(null));
  };
  return () => new Promise((give) => {
    waiting.push(give);
    next();
  });
}

/** The process's one reader of the kernel tables: every egress gate shares it, so N gates still make one read at a time. */
const sharedLoopbackPeers = oneReadAtATime(async () => loopbackPeers(await readLoopbackTables()));

/** The three facts about a connection the user check reads. Taken when the socket is accepted: a socket that has closed no longer gives them. */
export interface PeerEnds {
  remoteAddress?: string;
  remotePort?: number;
  localPort?: number;
}

/**
 * fromUser for a listener that takes many connections: the same answer, read
 * without holding the thread. fromUser reads both kernel tables synchronously
 * for every connection, which is fine for the forwarder (one browser behind a
 * login proxy) and was not for the egress gate, which every hosted browser
 * goes through. Here the tables are read asynchronously, one read at a time
 * and on a budget (oneReadAtATime), parsed once, and every client that was
 * waiting when a read started is decided from it. The caller keeps the
 * client paused meanwhile. A read that fails decides "no".
 *
 * Measured 2026-11-12 on Node 22.19, refused CONNECTs to one gate at 200 a
 * second for 5 s, with 5,500 to 12,000 rows in the tables. One synchronous
 * read per connection: 6.6 to 9.3 s of CPU, all of it on the server's one
 * thread, and at the largest table only 793 of 1,000 were answered in time.
 * Asynchronous reads back to back: 6.2 s, 1.4 s of it on the server's
 * thread. On the budget: 1.5 s, 0.4 s of it on the server's thread.
 * `read` replaces the kernel tables (tests).
 */
export function loopbackUserCheck(uid: number | undefined, read?: () => Promise<string>): (peer: PeerEnds) => Promise<boolean> {
  const peersNow = read ? oneReadAtATime(async () => loopbackPeers(await read())) : sharedLoopbackPeers;
  return async (peer) => {
    if (peer.remoteAddress !== "127.0.0.1" && peer.remoteAddress !== "::ffff:127.0.0.1") return false;
    if (process.platform !== "linux" || uid === undefined) return true;
    if (peer.remotePort === undefined || peer.localPort === undefined) return false;
    const peers = await peersNow();
    return peers !== null && peers.get(loopbackPeerKey(peer.remotePort, peer.localPort)) === uid;
  };
}

/**
 * Start the answer to the browser with the status and headers another server
 * sent. False when they cannot be passed on, with nothing written: the caller
 * then answers for itself. Node's writeHead throws on a status below 100 or
 * above 999 and on a header it does not accept, and this runs inside the
 * http client's response callback, where a throw is an uncaught exception
 * that stops the process: a site answering "HTTP/1.1 099" or sending Trailer
 * beside Content-Length stopped the whole hosted server (2026-11-12, Node
 * 22.19). Trailer and Transfer-Encoding are not passed on at all: the body
 * arrives here already decoded, node frames what it sends itself, and
 * trailers were never forwarded.
 */
export function relayHead(res: ServerResponse, status: number | undefined, headers: Record<string, string | string[] | undefined>): boolean {
  if (res.headersSent || status === undefined || !Number.isInteger(status) || status < 100 || status > 999) return false;
  const kept: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (value !== undefined && lower !== "trailer" && lower !== "transfer-encoding") kept[name] = value;
  }
  try {
    res.writeHead(status, kept);
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes WebRTC from every page of a webkit context that goes through a
 * proxy. Playwright reaches no WebRTC setting in webkit, and webkit sent STUN
 * around the proxy, so a page learned this machine's own IP (2026-11-02).
 * Added to the context, so Playwright runs it in every frame and popup before
 * their own code; the interfaces are deleted, so `"RTCPeerConnection" in
 * window` is false, as in a browser without WebRTC.
 */
export const NO_WEBRTC_SCRIPT = `(() => {
  for (const name of ["RTCPeerConnection", "webkitRTCPeerConnection", "RTCDataChannel", "RTCIceCandidate", "RTCSessionDescription", "RTCRtpSender", "RTCRtpReceiver", "RTCRtpTransceiver"]) {
    try { delete window[name]; } catch {}
    if (name in window) {
      try { Object.defineProperty(window, name, { value: undefined, configurable: false, writable: false }); } catch {}
    }
  }
})();`;

/**
 * Start a forwarder for `upstream`. Close it when the browser closes.
 * `options.uid`: the only user it serves on Linux; default this process's.
 */
export async function startProxyForwarder(upstream: ProxyConfig, options: { uid?: number } = {}): Promise<ProxyForwarder> {
  const uid = options.uid ?? (typeof process.getuid === "function" ? process.getuid() : undefined);
  const up = new URL(proxyServerUrl(upstream.server));
  const secure = up.protocol === "https:";
  const host = up.hostname.replace(/^\[(.*)\]$/, "$1");
  const port = Number(up.port) || (secure ? 443 : 80);
  const login = `Basic ${Buffer.from(`${upstream.username ?? ""}:${upstream.password ?? ""}`).toString("base64")}`;
  // No SNI for an IP address (Bun throws on one).
  const tlsOptions = { host, port, ...(isIP(host) ? {} : { servername: host }) };
  const openUpstream = (): Socket => (secure ? tlsConnect(tlsOptions) : netConnect(port, host));
  // This forwarder's own agent: the shared one let one region's request ride
  // another region's upstream connection, and outlived close(). No keep-alive:
  // a reused socket the upstream had just closed became a 502 the browser
  // would not retry (plain http only; https goes through CONNECT).
  const agent = secure ? new HttpsAgent({ keepAlive: false, ...(isIP(host) ? {} : { servername: host }) }) : new HttpAgent({ keepAlive: false });
  const send = secure ? httpsRequest : httpRequest;
  const sockets = new Set<Socket>();

  // Plain http: the browser sends the absolute URL; pass it on with the login.
  // Anything else (an origin-form request to the port itself) is not a proxy
  // request and is refused.
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (!/^http:\/\//i.test(req.url ?? "")) {
      res.writeHead(400, { "content-length": "0" });
      res.end();
      return;
    }
    const headers: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v !== undefined && k !== "proxy-authorization" && k !== "proxy-connection") headers[k] = v;
    }
    headers["proxy-authorization"] = login;
    const out = send({ host, port, method: req.method, path: req.url, headers, agent }, (upRes) => {
      // Nothing in this callback may throw: it runs from the upstream
      // socket's data event, and an uncaught exception stops the process.
      if (!relayHead(res, upRes.statusCode, upRes.headers)) {
        // An answer that cannot be passed on (see relayHead): 502 from here.
        // The read that out.destroy() cuts short must not be an unhandled error.
        upRes.on("error", () => { /* given up on above */ });
        upRes.resume();
        out.destroy();
        if (res.headersSent) {
          res.destroy();
          return;
        }
        try {
          res.writeHead(502, { "content-length": "0" });
          res.end();
        } catch {
          res.destroy();
        }
        return;
      }
      upRes.pipe(res);
      // Cut short upstream: cut short here. Ending normally wrote a chunked
      // response's last chunk, so a truncated body read as complete.
      upRes.on("aborted", () => res.destroy());
      upRes.on("error", () => res.destroy());
      upRes.on("close", () => { if (!upRes.complete) res.destroy(); });
    });
    out.on("error", () => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.writeHead(502, { "content-length": "0" });
      res.end();
    });
    // The browser gave up on it: so does the upstream request.
    res.on("close", () => { if (!res.writableFinished) out.destroy(); });
    req.pipe(out);
  });

  // A tunnel (https, ws, wss): CONNECT upstream with the login, then pipe bytes.
  server.on("connect", (req: IncomingMessage, client: Socket, head: Buffer) => {
    const target = req.url ?? "";
    const upSocket = openUpstream();
    sockets.add(upSocket);
    upSocket.on("close", () => sockets.delete(upSocket));
    let buffered = Buffer.alloc(0);
    let open = false;
    const refuse = (status: number, reason: string): void => {
      if (open) return;
      client.end(`HTTP/1.1 ${status} ${reason}\r\nContent-Length: 0\r\n\r\n`);
      upSocket.destroy();
    };
    const waiting = setTimeout(() => refuse(504, "Upstream proxy did not answer"), 30_000);
    waiting.unref();
    const onData = (chunk: Buffer): void => {
      buffered = Buffer.concat([buffered, chunk]);
      const end = buffered.indexOf("\r\n\r\n");
      if (end < 0) {
        if (buffered.length > 64 * 1024) { upSocket.destroy(); client.destroy(); }
        return;
      }
      clearTimeout(waiting);
      upSocket.off("data", onData);
      const status = Number(/^HTTP\/\d(?:\.\d)? (\d{3})/.exec(buffered.subarray(0, end).toString("latin1"))?.[1] ?? 502);
      if (status !== 200) {
        client.end(`HTTP/1.1 ${status} Upstream proxy refused the tunnel\r\nContent-Length: 0\r\n\r\n`);
        upSocket.destroy();
        return;
      }
      open = true;
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (buffered.length > end + 4) client.write(buffered.subarray(end + 4));
      if (head.length > 0) upSocket.write(head);
      upSocket.pipe(client);
      client.pipe(upSocket);
    };
    upSocket.once(secure ? "secureConnect" : "connect", () => {
      upSocket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\nProxy-Authorization: ${login}\r\n\r\n`);
    });
    upSocket.on("data", onData);
    upSocket.on("error", () => {
      clearTimeout(waiting);
      if (open) client.destroy();
      else refuse(502, "Upstream proxy unreachable");
    });
    client.on("error", () => upSocket.destroy());
    upSocket.on("end", () => client.end());
    client.on("end", () => (open ? upSocket.end() : upSocket.destroy()));
    client.on("close", () => { clearTimeout(waiting); if (!open) upSocket.destroy(); });
  });

  server.on("connection", (socket: Socket) => {
    if (!fromUser(socket, uid)) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  // Not a reason for the process to stay up: the browser's connections are.
  server.unref();
  const address = server.address() as { port: number };

  return {
    server: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => {
      for (const s of sockets) s.destroy();
      agent.destroy();
      server.close(() => resolve());
    }),
  };
}

/** What one browser launch is given as its proxy, and what to close when that browser closes. */
export interface BrowserRoute {
  /** Playwright's `proxy` launch option; undefined for a launch without one. */
  proxy: { server: string; username?: string; password?: string; bypass?: string } | undefined;
  /** The forwarder or egress gate started for this launch. Close it when the browser closes. */
  forwarder: ProxyForwarder | null;
  /** Whether the browser's connections are checked by the egress gate (egress-gate.ts). */
  gated: boolean;
}

/** Playwright's own switch that lets chromium reach loopback around a launch proxy. */
const LOOPBACK_SWITCH = "PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK";

function socksProxy(proxy: ProxyConfig): boolean {
  return /^socks[0-9a-z]*:\/\//i.test(proxy.server.trim());
}

/**
 * The route for one browser launch: the one place that decides what a
 * browser gets as its proxy. CBrowser.launch and crossBrowserDiff both ask
 * here, and tests/hosted-launch-coverage.test.ts fails on a launch that does
 * not.
 *
 * Not hosted, it is what each of them did before: no proxy, the proxy as
 * configured with its bypass list, or a local forwarder in front of an
 * http(s) proxy with a login.
 *
 * Hosted, every browser goes through the egress gate, chained to the
 * configured http(s) proxy when there is one, and gets the gate's address
 * with no login and no bypass list. Measured 2026-11-12 with Playwright
 * 1.64.1: with a launch proxy and no bypass, chromium, firefox and webkit
 * send every local destination form to the proxy; one bypass entry naming
 * 127.0.0.1 made chromium send 127.0.0.1, localhost and [::1] direct. The
 * same holds for Playwright's environment switch, so with it set a hosted
 * launch is refused. A gate that cannot start throws: a hosted browser is
 * never launched without it. A socks proxy is the exception: the gate chains
 * only to http(s), so the browser gets the socks proxy itself, without a
 * bypass list, and the machine connects only to that proxy, whose address
 * pinHostedProxy already checked.
 */
export async function openBrowserRoute(proxy: ProxyConfig | undefined): Promise<BrowserRoute> {
  if (!isHostedMode()) {
    if (!proxy) return { proxy: undefined, forwarder: null, gated: false };
    const bypass = proxy.bypass?.join(",");
    // As a boolean: the guard's "is ProxyConfig" would leave nothing of the type below it.
    const behindForwarder: boolean = needsForwarder(proxy);
    if (behindForwarder) {
      const forwarder = await startProxyForwarder(proxy);
      return { proxy: { server: forwarder.server, bypass }, forwarder, gated: false };
    }
    return { proxy: { server: proxy.server, username: proxy.username, password: proxy.password, bypass }, forwarder: null, gated: false };
  }
  if (process.env[LOOPBACK_SWITCH]) {
    throw new Error(`The browser was not started: ${LOOPBACK_SWITCH} is set, and with it chromium connects to this machine's own addresses around the egress gate. Unset it on the hosted server.`);
  }
  if (proxy && socksProxy(proxy)) {
    return { proxy: { server: proxy.server, username: proxy.username, password: proxy.password }, forwarder: null, gated: false };
  }
  let gate: ProxyForwarder;
  try {
    gate = await startEgressGate(proxy ? { upstream: proxy } : {});
  } catch (error) {
    throw new Error(`The browser was not started: the egress gate every hosted browser goes through could not start (${error instanceof Error ? error.message : String(error)}).`);
  }
  return { proxy: { server: gate.server }, forwarder: gate, gated: true };
}

/** What keeps WebRTC from sending UDP around a browser's proxy, per engine. */
export interface WebRtcGuard {
  /** Launch arguments to add. */
  args: string[];
  /** Firefox's media.peerconnection.ice.proxy_only. */
  firefoxProxyOnly: boolean;
  /** A script to add to the context before any page, or undefined. */
  initScript: string | undefined;
}

/**
 * The WebRTC settings for a launch of `engine`. They are on when the browser
 * has a proxy and, hosted, always, since every hosted browser has the egress
 * gate as its proxy: WebRTC's STUN is UDP, which no http proxy carries, so it
 * left from this machine's own address and could be aimed at one (measured
 * 2026-11-02 and 2026-11-12). Chromium gets its policy flag, firefox its
 * preference, webkit the script that removes WebRTC (NO_WEBRTC_SCRIPT).
 * The chromium flag did nothing in the headed binary (2026-11-12: 8 STUN
 * packets with it, as without), so a hosted headed chromium gets the script
 * as well.
 */
export function webRtcGuard(engine: "chromium" | "firefox" | "webkit", proxy: ProxyConfig | undefined, headless: boolean): WebRtcGuard {
  const hosted = isHostedMode();
  const on = !!proxy || hosted;
  return {
    args: on && engine === "chromium" ? ["--force-webrtc-ip-handling-policy=disable_non_proxied_udp"] : [],
    firefoxProxyOnly: on,
    initScript: on && (engine === "webkit" || (hosted && engine === "chromium" && !headless)) ? NO_WEBRTC_SCRIPT : undefined,
  };
}
