/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * The egress gate: a local proxy that decides, at the moment of connection,
 * whether a hosted browser may reach an address.
 *
 * The hosted servers judged a caller's URL once, before the browser
 * connected. Whatever the browser fetched afterwards (a redirect, a
 * subresource, a frame, a worker, a WebSocket) was not judged, and a name
 * could answer with a public address for the check and a private one for the
 * connection (P-10, plan of 2026-11-07). A hosted browser is now launched
 * with this gate as its proxy. For every request the gate asks
 * resolveForEgress (egress.ts) about the target's host: one lookup, refused
 * when any answer is an address this machine does not connect to. A refused
 * target gets 403 and no socket is opened, to the target or to an upstream
 * proxy. An allowed one is connected to at an address that answer returned,
 * never by name and never after a second lookup.
 *
 * Three request shapes arrive (measured 2026-11-12, Playwright 1.64.1):
 * an absolute http:// URL for plain pages; CONNECT host:port for https, for
 * chromium's and firefox's WebSockets and for every APIRequestContext call;
 * and, from webkit, GET with an absolute ws:// URL and an Upgrade header.
 *
 * With an upstream proxy (a caller's proxy or a geo region) the gate checks
 * the target the same way and then forwards the NAME to the upstream, so this
 * machine itself connects only to the upstream. The upstream's login is added
 * by the gate, on its own CONNECT or on the request line of a plain request,
 * and the browser never holds it (see proxy-forwarder.ts for what a browser
 * does with a proxy login). A ws:// upgrade goes through the upstream as a
 * CONNECT tunnel, which is how chromium and firefox send every WebSocket.
 *
 * Two listeners, both on 127.0.0.1. The front one is a plain TCP server that
 * reads the first request line of each connection. CONNECT and ws:// requests
 * end in a byte pipe, so it serves them itself. A connection that opens with
 * an http:// request is handed, bytes untouched, to the inner node:http
 * server, which knows where one request ends and the next begins and checks
 * every request on a kept-alive connection. The front exists because Bun's
 * node:http server answers 400 to an absolute ws:// request line before any
 * event is emitted (measured on Bun 1.4.4; Node 22.19 emits 'upgrade'), and
 * the tests run under Bun while the hosted servers run under Node: one path
 * on both. The front serves only 127.0.0.1 clients of the gate's user. The
 * inner one serves only the connections the front itself opened to it.
 *
 * The gate runs inside the hosted server's one process, and everything it
 * reads comes from a page, a target or an upstream proxy. So no event
 * callback here may throw (nothing in the server catches an uncaught
 * exception: it stops the process for every account), and nothing here may
 * hold the thread for long.
 *
 * Whoever started a navigation cannot see why the gate did not carry it: a
 * browser reports every failed CONNECT as one tunnel error, and a plain-http
 * answer from the gate looks like a page. So the gate keeps the reason of its
 * last failure per target for a minute (failure()), and every answer it
 * writes itself carries the header named in EGRESS_HEADER.
 */

import { createServer as createHttpServer, request as httpRequest, type ClientRequest, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from "node:http";
import { connect as netConnect, createServer as createNetServer, isIP, type Server as NetServer, type Socket } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { resolveForEgress, type EgressPolicy } from "./egress.js";
import { loopbackUserCheck, proxyServerUrl, relayHead, type EgressFailure, type ProxyForwarder } from "./proxy-forwarder.js";
import type { ProxyConfig } from "./types.js";

/**
 * The limits a gate runs with. The hosted servers pass none of their own
 * (openBrowserRoute gives startEgressGate only the upstream), so these are
 * the values in use; tests/egress-gate.test.ts asserts them.
 */
export const EGRESS_GATE_LIMITS = Object.freeze({
  /** Milliseconds for a direct connection to be made, over all the checked addresses of one target. */
  connectMs: 10_000,
  /** Milliseconds one checked address is given before the next is tried beside it. */
  nextAddressMs: 250,
  /** Connection attempts to one target's addresses that are open at once. */
  dialAttempts: 2,
  /** How many of a target's checked addresses are tried at all, in dialOrder. */
  dialAddresses: 8,
  /** Milliseconds for an upstream proxy to connect and to answer a CONNECT. */
  upstreamAnswerMs: 30_000,
  /** Milliseconds a client has to send a complete request head, and to close after the gate answered it with an error. */
  headMs: 30_000,
  /** Milliseconds a connection to the inner listener has to turn out to be one the front opened. */
  relayClaimMs: 1_000,
  /** Bytes of a request head, and of an upstream proxy's answer to CONNECT. */
  maxHeadBytes: 64 * 1024,
  /** How long the reason of a failure is kept, and for how many targets. */
  failureTtlMs: 60_000,
  failureMax: 500,
});

/**
 * The response header on every answer the gate writes itself (400, 403, 502,
 * 504, and an upstream proxy's 407), with why: "refused", "unreachable",
 * "upstream" or "bad-request". It is removed from what a plain-http target
 * sends, so on a plain-http answer it means the gate. Inside an https tunnel
 * the gate sees no headers, so a site can send it there: for https, ask
 * failure().
 */
export const EGRESS_HEADER = "X-CBrowser-Egress";

/** What EGRESS_HEADER says: why the gate did not carry the request, or that it was not a proxy request. */
export type EgressMark = EgressFailure | "bad-request";

/** A gate: a ProxyForwarder that always answers failure(). */
export interface EgressGate extends ProxyForwarder {
  failure(host: string, port: number): EgressFailure | undefined;
}

export interface EgressGateOptions {
  /** An http or https proxy to forward allowed requests through, with or without a login. */
  upstream?: ProxyConfig;
  /** The only user the gate serves on Linux; default this process's. */
  uid?: number;
  /** Replaces the lookup or the address decision (tests). */
  policy?: EgressPolicy;
  /** Milliseconds: see EGRESS_GATE_LIMITS for what each bounds and its default. */
  timeouts?: { connect?: number; nextAddress?: number; upstreamAnswer?: number; head?: number };
  /**
   * For tests only: the certificate authority an https upstream proxy is
   * checked against, in place of the system's. No call in src passes it
   * (tests/egress-gate.test.ts scans src for what startEgressGate is given).
   */
  ca?: string | Buffer | Array<string | Buffer>;
}

/** Where a request is going: the host to check, and the forms it is written in further on. */
interface Target {
  /** As resolveForEgress takes it: a name, an IPv4 address, or an IPv6 address in brackets. */
  host: string;
  port: number;
  /** For the Host header: the port left off when it is the default. */
  hostHeader: string;
  /** Path and query for an origin-form request line; empty for CONNECT. */
  path: string;
}

/** A socket ready for the target's bytes (with what arrived on it already), or the answer to give and why. */
type Opened = { socket: Socket; early: Buffer } | { status: number; reason: string; why: EgressFailure };

interface Upstream {
  open: () => Socket;
  ready: "connect" | "secureConnect";
  /** The Proxy-Authorization value, when the upstream has a login. */
  login: string | undefined;
}

const MAX_HEAD = EGRESS_GATE_LIMITS.maxHeadBytes;
const TOKEN = "[!#$%&'*+.^_`|~0-9A-Za-z-]+";
const REQUEST_LINE = new RegExp(`^(${TOKEN}) (\\S+) HTTP/1\\.[01]$`);
// The value is taken whole and trimmed afterwards. With the trimming inside
// the pattern (a lazy value followed by optional blanks) a run of blanks in
// the middle of a value was retried from every position: one header with
// 60,000 spaces held the thread for a second (measured 2026-11-12, Node
// 22.19 and Bun 1.4.4), and webkit sends a page's cookies in this head.
const HEADER_LINE = new RegExp(`^(${TOKEN}):([^\\r\\n\\0]*)$`);
/** Headers that belong to the browser's connection to the gate, not to the request. */
const TO_GATE_ONLY = new Set(["connection", "keep-alive", "proxy-connection", "proxy-authorization", "upgrade"]);
/** Headers of the target's connection, and the gate's own mark, which only the gate may set. */
const FROM_TARGET_ONLY = new Set(["connection", "keep-alive", "proxy-connection", EGRESS_HEADER.toLowerCase()]);

const isBlank = (code: number): boolean => code === 32 || code === 9;

/** `text` without the spaces and tabs at either end. */
function trimBlanks(text: string): string {
  let from = 0;
  let to = text.length;
  while (from < to && isBlank(text.charCodeAt(from))) from++;
  while (to > from && isBlank(text.charCodeAt(to - 1))) to--;
  return text.slice(from, to);
}

/** A CONNECT target, host:port. Null when it is not one, the host is empty or the port is outside 1-65535. */
function connectTarget(text: string): Target | null {
  const m = /^(\[[0-9a-f:.]+\]|[a-z0-9._-]+):(\d{1,5})$/i.exec(text);
  if (!m) return null;
  const port = Number(m[2]);
  if (port < 1 || port > 65535) return null;
  if (m[1].startsWith("[") && isIP(m[1].slice(1, -1)) !== 6) return null;
  return { host: m[1], port, hostHeader: `${m[1]}:${port}`, path: "" };
}

/**
 * An absolute URL of one of `schemes` as a target. The URL parser's reading
 * is the one checked AND the one written further on, so the gate and whatever
 * receives the request cannot read two different hosts out of one line. Any
 * login in the URL and the fragment are dropped.
 */
function urlTarget(text: string, schemes: string[]): Target | null {
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return null;
  }
  // The parser throws on an empty host, so there is always one here.
  if (!schemes.includes(u.protocol)) return null;
  // http and ws both default to 80. The parser already refused a port above 65535.
  const port = u.port === "" ? 80 : Number(u.port);
  if (port < 1) return null;
  return { host: u.hostname, port, hostHeader: u.host, path: u.pathname + u.search };
}

/** Header lines as node's rawHeaders (name, value, name, value). Null when a line is not a header. */
function headerLines(text: string): string[] | null {
  const raw: string[] = [];
  if (text === "") return raw;
  for (const line of text.split("\r\n")) {
    const m = HEADER_LINE.exec(line);
    if (!m) return null;
    raw.push(m[1], trimBlanks(m[2]));
  }
  return raw;
}

function hasHeader(rawHeaders: string[], name: string): boolean {
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (rawHeaders[i].toLowerCase() === name) return true;
  }
  return false;
}

function withoutHeaders(headers: IncomingHttpHeaders, drop: Set<string>): Record<string, string | string[]> {
  const kept: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v !== undefined && !drop.has(k)) kept[k] = v;
  }
  return kept;
}

const isLoopbackClient = (address: string | undefined): boolean => address === "127.0.0.1" || address === "::ffff:127.0.0.1";

/**
 * The checked addresses in the order they are tried: the resolver's order,
 * with the two families taking turns from the family of the first answer on.
 * A name with several addresses of a family that does not work from here
 * (three AAAA records on a machine whose IPv6 route is down) then costs one
 * wait before an address of the other family is tried, not one per record.
 * Node's own connect and the browsers do the same (RFC 8305).
 */
export function dialOrder(addresses: string[]): string[] {
  if (addresses.length < 3) return addresses;
  const family = isIP(addresses[0]);
  const same = addresses.filter((a) => isIP(a) === family);
  const other = addresses.filter((a) => isIP(a) !== family);
  const order: string[] = [];
  for (let i = 0; i < Math.max(same.length, other.length); i++) {
    if (i < same.length) order.push(same[i]);
    if (i < other.length) order.push(other[i]);
  }
  return order;
}

/** End a socket once what was written to it has gone out. */
function finish(socket: Socket): void {
  if (socket.destroyed) return;
  if (socket.writableFinished) {
    socket.destroy();
    return;
  }
  socket.once("finish", () => socket.destroy());
  socket.end();
}

/** Bytes both ways until either side is done; an error on one side resets the other. */
function splice(a: Socket, b: Socket): void {
  a.pipe(b);
  b.pipe(a);
  a.on("error", () => b.destroy());
  b.on("error", () => a.destroy());
  a.once("close", () => finish(b));
  b.once("close", () => finish(a));
}

const MARK_NAME = EGRESS_HEADER.toLowerCase();

/** A response head (status line and header lines, no blank line) without any EGRESS_HEADER line, nor a line folded onto one. */
export function withoutMark(head: string): string {
  const kept: string[] = [];
  let dropping = false;
  for (const [i, line] of head.split("\r\n").entries()) {
    if (i > 0 && (line.startsWith(" ") || line.startsWith("\t"))) {
      if (!dropping) kept.push(line);
      continue;
    }
    const colon = line.indexOf(":");
    dropping = i > 0 && colon >= 0 && trimBlanks(line.slice(0, colon)).toLowerCase() === MARK_NAME;
    if (!dropping) kept.push(line);
  }
  return kept.join("\r\n");
}

/**
 * splice() for an upgrade: the client's bytes go to the target at once, and
 * the target's go to the client once its answer head has been passed on
 * without the gate's mark (gate-3, second review). Every head is filtered up
 * to the final one: a 1xx other than 101 is followed by another. On the plain
 * path FROM_TARGET_ONLY does this, so the mark on an answer the browser reads
 * outside a tunnel always means the gate wrote it. A head longer than
 * MAX_HEAD ends both connections. `early` is what the target sent already.
 */
function spliceAfterHead(client: Socket, target: Socket, early: Buffer): void {
  client.pipe(target);
  client.on("error", () => target.destroy());
  target.on("error", () => client.destroy());
  client.once("close", () => finish(target));
  target.once("close", () => finish(client));
  let buffered: Buffer = Buffer.alloc(0);
  const onData = (chunk: Buffer): void => {
    buffered = buffered.length === 0 ? chunk : Buffer.concat([buffered, chunk]);
    for (;;) {
      const end = buffered.indexOf("\r\n\r\n");
      if (end < 0) {
        if (buffered.length > MAX_HEAD) {
          target.destroy();
          client.destroy();
        }
        return;
      }
      const head = buffered.subarray(0, end).toString("latin1");
      buffered = buffered.subarray(end + 4);
      client.write(`${withoutMark(head)}\r\n\r\n`, "latin1");
      const status = Number(/^HTTP\/\d(?:\.\d)? (\d{3})/.exec(head)?.[1] ?? 0);
      if (status >= 200 || status === 101 || status < 100) break;
    }
    target.off("data", onData);
    target.off("end", cutShort);
    if (buffered.length > 0) client.write(buffered);
    // Attached in the same turn as the listener above came off, so no byte is lost between them.
    target.pipe(client);
  };
  // The target ended inside a head: there is no answer to pass on.
  const cutShort = (): void => {
    target.destroy();
    client.destroy();
  };
  target.on("data", onData);
  target.once("end", cutShort);
  // An upstream's tunnel socket was paused when it was handed over, and a listener alone does not resume it.
  target.resume();
  if (early.length > 0) onData(early);
}

/**
 * Answer a client the gate holds as a bare socket, and end the connection.
 * Whatever else the client sends is read and dropped, so its close is seen
 * (closing first would reset the connection under the answer). A client that
 * has not closed after `lingerMs` is dropped: it would otherwise be kept for
 * the life of the gate.
 */
function answerRaw(client: Socket, lingerMs: number, status: number, reason: string, mark: EgressMark, body = ""): void {
  if (client.destroyed) return;
  client.end(`HTTP/1.1 ${status} ${reason}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n${EGRESS_HEADER}: ${mark}\r\nConnection: close\r\n\r\n${body}`);
  client.resume();
  const linger = setTimeout(() => client.destroy(), lingerMs);
  linger.unref();
  client.once("close", () => clearTimeout(linger));
}

/** One of the gate's own answers to a plain-http request. The connection stays usable for the next request. */
function answerHttp(req: IncomingMessage, res: ServerResponse, status: number, mark: EgressMark, body = ""): void {
  req.resume();
  if (res.headersSent || res.destroyed) {
    res.destroy();
    return;
  }
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "content-length": String(Buffer.byteLength(body)), [EGRESS_HEADER]: mark });
  res.end(body);
}

const refusal = (reason: string): string => `cbrowser egress gate: ${reason}\n`;

/** One target in the failure record: the host lower-cased and without brackets, and the port. */
const targetKey = (host: string, port: number): string => `${host.toLowerCase().replace(/^\[(.*)\]$/, "$1")}:${port}`;

/** How to reach an upstream proxy. Only http and https: a socks proxy takes no CONNECT. */
function upstreamOf(proxy: ProxyConfig, ca: EgressGateOptions["ca"]): Upstream {
  const up = new URL(proxyServerUrl(proxy.server));
  if (up.protocol !== "http:" && up.protocol !== "https:") {
    throw new Error("the egress gate forwards only through an http or https proxy");
  }
  const secure = up.protocol === "https:";
  const host = up.hostname.replace(/^\[(.*)\]$/, "$1");
  const port = Number(up.port) || (secure ? 443 : 80);
  // The certificate is always checked, whatever NODE_TLS_REJECT_UNAUTHORIZED
  // says: the login goes to whoever answers. No SNI for an IP address (Bun
  // throws on one).
  const tlsOptions = { host, port, rejectUnauthorized: true, ...(ca ? { ca } : {}), ...(isIP(host) ? {} : { servername: host }) };
  const hasLogin = !!(proxy.username || proxy.password);
  return {
    open: () => (secure ? tlsConnect(tlsOptions) : netConnect(port, host)),
    ready: secure ? "secureConnect" : "connect",
    login: hasLogin ? `Basic ${Buffer.from(`${proxy.username ?? ""}:${proxy.password ?? ""}`).toString("base64")}` : undefined,
  };
}

/**
 * Start a gate. Give its `server` to the browser as the proxy, with no bypass
 * list, and close it when the browser closes. Throws when it cannot listen or
 * the upstream is not an http(s) proxy: the caller must then not launch.
 */
export async function startEgressGate(options: EgressGateOptions = {}): Promise<EgressGate> {
  const uid = options.uid ?? (typeof process.getuid === "function" ? process.getuid() : undefined);
  // Every lookup this gate asks for is asked as this gate (lookup-1): the
  // system lookup gives each owner only a share of its places, so one
  // browser aimed at slow names cannot take the places every other account's
  // first lookup of a name needs. A resolver or a decision a test injects is
  // kept as given.
  const policy: EgressPolicy = { ...options.policy, owner: {} };
  const connectMs = options.timeouts?.connect ?? EGRESS_GATE_LIMITS.connectMs;
  const nextAddressMs = options.timeouts?.nextAddress ?? EGRESS_GATE_LIMITS.nextAddressMs;
  const answerMs = options.timeouts?.upstreamAnswer ?? EGRESS_GATE_LIMITS.upstreamAnswerMs;
  const headMs = options.timeouts?.head ?? EGRESS_GATE_LIMITS.headMs;
  const upstream = options.upstream ? upstreamOf(options.upstream, options.ca) : undefined;
  const ownUser = loopbackUserCheck(uid);
  const sockets = new Set<Socket>();
  let closed = false;
  let innerPort = 0;

  const track = <S extends Socket>(socket: S): S => {
    if (closed) socket.destroy();
    sockets.add(socket);
    // A reset is an ordinary end of a connection, not a reason to stop the process.
    socket.on("error", () => { /* handled where the socket is used */ });
    socket.once("close", () => sockets.delete(socket));
    return socket;
  };

  // Why the gate last failed to carry a request to each target. Oldest first:
  // an entry is put at the end again each time it is written.
  const failures = new Map<string, { why: EgressFailure; at: number }>();
  const failed = (to: Target, why: EgressFailure): void => {
    const key = targetKey(to.host, to.port);
    failures.delete(key);
    failures.set(key, { why, at: Date.now() });
    if (failures.size > EGRESS_GATE_LIMITS.failureMax) {
      for (const oldest of failures.keys()) {
        failures.delete(oldest);
        break;
      }
    }
  };
  const carried = (to: Target): void => {
    failures.delete(targetKey(to.host, to.port));
  };
  const failure = (host: string, port: number): EgressFailure | undefined => {
    const key = targetKey(host, port);
    const found = failures.get(key);
    if (!found) return undefined;
    const age = Date.now() - found.at;
    // Also when the clock was set back: an entry from the future has no known age.
    if (age < 0 || age > EGRESS_GATE_LIMITS.failureTtlMs) {
      failures.delete(key);
      return undefined;
    }
    return found.why;
  };

  /** Call `then` once when `gone` fires (at once if it has); the returned function stops listening. */
  const onGone = (gone: AbortSignal, then: () => void): (() => void) => {
    if (gone.aborted) {
      then();
      return () => { /* already called */ };
    }
    gone.addEventListener("abort", then, { once: true });
    return () => gone.removeEventListener("abort", then);
  };

  /** The socket once it is connected, or null when it is not within `ms` or the client is `gone` first. */
  const connected = (open: () => Socket, ready: "connect" | "secureConnect", ms: number, gone: AbortSignal): Promise<Socket | null> => new Promise((resolve) => {
    const socket = track(open());
    let settled = false;
    let unwatch = (): void => { /* set below */ };
    const settle = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unwatch();
      if (!ok) socket.destroy();
      resolve(ok ? socket : null);
    };
    const timer = setTimeout(() => settle(false), ms);
    timer.unref();
    unwatch = onGone(gone, () => settle(false));
    socket.once(ready, () => settle(true));
    socket.once("error", () => settle(false));
    socket.once("close", () => settle(false));
  });

  /**
   * A connection to one of the checked addresses: the first that accepts.
   * The addresses are literals (resolveForEgress returns nothing else), so no
   * lookup happens here: the address checked is the address connected to.
   *
   * They are tried in dialOrder, the next one beside the previous when that
   * has not connected within nextAddressMs, or at once when it has failed.
   * The first socket to connect is kept and the rest are destroyed. Walking
   * them one after another with the whole limit each made a name whose first
   * address is silent (a published AAAA record with no working route) cost
   * 10 s per dead address on every connection, where node's own connect and
   * the browsers fall back in about 250 ms (measured 2026-11-12). Null when
   * every address failed, none connected within the connect limit, or the
   * client is `gone`.
   *
   * The race is bounded, because the addresses are the target's choice
   * (gate-1, second review). With a new attempt every 250 ms and none ended
   * before the limit, a name with 100 silent addresses had one CONNECT hold
   * about 40 sockets sending SYNs to addresses the page chose, and kept
   * opening them after the browser had gone: 192 SYNs per aborted fetch, from
   * this server's address. So at most dialAttempts are open at once (the
   * stagger starts another only while fewer are open, a failure starts the
   * next at once), only the first dialAddresses of dialOrder are tried, and
   * the client leaving ends every attempt. Chromium keeps about two attempts
   * open, node's own connect one.
   */
  const dial = (addresses: string[], port: number, gone: AbortSignal): Promise<Socket | null> => new Promise((resolve) => {
    const order = dialOrder(addresses).slice(0, EGRESS_GATE_LIMITS.dialAddresses);
    const attempts = new Set<Socket>();
    let next = 0;
    let done = false;
    let stagger: ReturnType<typeof setTimeout> | undefined;
    let unwatch = (): void => { /* set below */ };
    const settle = (winner: Socket | null): void => {
      if (done) return;
      done = true;
      clearTimeout(overall);
      clearTimeout(stagger);
      unwatch();
      for (const socket of attempts) {
        if (socket !== winner) socket.destroy();
      }
      resolve(winner);
    };
    const overall = setTimeout(() => settle(null), connectMs);
    overall.unref();
    unwatch = onGone(gone, () => settle(null));
    const start = (): void => {
      clearTimeout(stagger);
      if (done) return;
      if (closed) {
        settle(null);
        return;
      }
      if (next >= order.length) {
        if (attempts.size === 0) settle(null);
        return;
      }
      // The stagger fired with the open attempts at the ceiling: the next starts when one of them fails.
      if (attempts.size >= EGRESS_GATE_LIMITS.dialAttempts) return;
      let socket: Socket;
      try {
        socket = track(netConnect({ host: order[next++], port, allowHalfOpen: true }));
      } catch {
        // This runs from a timer as well, where a throw would stop the process: on to the next address.
        start();
        return;
      }
      attempts.add(socket);
      const lost = (): void => {
        if (attempts.delete(socket) && !done) start();
      };
      socket.once("connect", () => settle(socket));
      socket.once("error", lost);
      socket.once("close", lost);
      stagger = setTimeout(start, nextAddressMs);
      stagger.unref();
    };
    start();
  });

  /** A tunnel to `to` through the upstream proxy: CONNECT with the login, then the upstream's answer. */
  const viaUpstream = (up: Upstream, to: Target, gone: AbortSignal): Promise<Opened> => new Promise((resolve) => {
    const socket = track(up.open());
    const authority = `${to.host}:${to.port}`;
    let buffered = Buffer.alloc(0);
    let settled = false;
    let unwatch = (): void => { /* set below */ };
    const settle = (result: Opened): void => {
      if (settled) return;
      settled = true;
      clearTimeout(waiting);
      unwatch();
      socket.off("data", onData);
      if ("socket" in result) socket.pause();
      else socket.destroy();
      resolve(result);
    };
    const unreachable = (): void => settle({ status: 502, reason: "Upstream proxy unreachable", why: "upstream" });
    const waiting = setTimeout(() => settle({ status: 504, reason: "Upstream proxy did not answer", why: "upstream" }), answerMs);
    waiting.unref();
    // The client left: the answer is never read, and checkedOpen records nothing for it.
    unwatch = onGone(gone, unreachable);
    const onData = (chunk: Buffer): void => {
      buffered = Buffer.concat([buffered, chunk]);
      const end = buffered.indexOf("\r\n\r\n");
      if (end < 0) {
        if (buffered.length > MAX_HEAD) unreachable();
        return;
      }
      const status = Number(/^HTTP\/\d(?:\.\d)? (\d{3})/.exec(buffered.subarray(0, end).toString("latin1"))?.[1] ?? 502);
      if (status === 200) settle({ socket, early: buffered.subarray(end + 4) });
      else settle({ status: status >= 400 ? status : 502, reason: "Upstream proxy refused the tunnel", why: "upstream" });
    };
    socket.once(up.ready, () => {
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n${up.login ? `Proxy-Authorization: ${up.login}\r\n` : ""}\r\n`);
    });
    socket.on("data", onData);
    socket.once("error", unreachable);
    socket.once("close", unreachable);
  });

  /** Bytes to the target: straight to a checked address, or through the upstream by name. */
  const open = async (to: Target, addresses: string[], gone: AbortSignal): Promise<Opened> => {
    if (upstream) return viaUpstream(upstream, to, gone);
    const socket = await dial(addresses, to.port, gone);
    return socket ? { socket, early: Buffer.alloc(0) } : { status: 502, reason: "Could not connect", why: "unreachable" };
  };

  /**
   * Watch a client the gate holds as a bare socket while its target is
   * looked up and connected to. The socket was paused, so the gate did not
   * see a browser that gave up: its close was read only when the gate wrote
   * to it, after the connect limit (gate-1, second review). It is read now,
   * and `gone` fires when it ends, closes or sends more than a head's worth.
   * stop() hands back what it sent meanwhile, which belongs to the target
   * after the bytes that came with the head.
   */
  const watchClient = (client: Socket): { gone: AbortSignal; stop: () => Buffer } => {
    const leaving = new AbortController();
    const chunks: Buffer[] = [];
    let bytes = 0;
    const leave = (): void => {
      leaving.abort();
      client.destroy();
    };
    const onData = (chunk: Buffer): void => {
      bytes += chunk.length;
      if (bytes > MAX_HEAD) leave();
      else chunks.push(chunk);
    };
    client.on("data", onData);
    client.on("end", leave);
    client.on("close", leave);
    if (client.destroyed) leave();
    else client.resume();
    let stopped = false;
    return {
      gone: leaving.signal,
      stop: () => {
        if (!stopped) {
          stopped = true;
          client.off("data", onData);
          client.off("end", leave);
          client.off("close", leave);
          client.pause();
        }
        return Buffer.concat(chunks);
      },
    };
  };

  /**
   * The target checked, then opened; or null, with the answer already given
   * to the client. `sent` is what the client sent while it waited. A client
   * that left meanwhile is given nothing and leaves no record: its target
   * did not fail, it was given up on.
   */
  const checkedOpen = async (to: Target | null, client: Socket): Promise<{ socket: Socket; early: Buffer; sent: Buffer } | null> => {
    if (!to) {
      answerRaw(client, headMs, 400, "Bad Request", "bad-request");
      return null;
    }
    const watch = watchClient(client);
    let opened: Opened;
    try {
      const answer = await resolveForEgress(to.host, policy);
      if (!answer.ok) {
        failed(to, "refused");
        watch.stop();
        answerRaw(client, headMs, 403, "Forbidden", "refused", refusal(answer.reason));
        return null;
      }
      if (watch.gone.aborted) return null;
      opened = await open(to, answer.addresses, watch.gone);
    } finally {
      watch.stop();
    }
    if (watch.gone.aborted || client.destroyed) {
      if ("socket" in opened) opened.socket.destroy();
      return null;
    }
    if (!("socket" in opened)) {
      failed(to, opened.why);
      answerRaw(client, headMs, opened.status, opened.reason, opened.why);
      return null;
    }
    carried(to);
    return { ...opened, sent: watch.stop() };
  };

  // CONNECT host:port (https, and the WebSockets of chromium and firefox).
  const tunnel = async (target: string, client: Socket, head: Buffer): Promise<void> => {
    const opened = await checkedOpen(connectTarget(target), client);
    if (!opened) return;
    client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (opened.early.length > 0) client.write(opened.early);
    if (head.length > 0) opened.socket.write(head);
    if (opened.sent.length > 0) opened.socket.write(opened.sent);
    splice(client, opened.socket);
  };

  // An absolute URL with an Upgrade header (webkit's WebSockets): the request
  // goes on in origin form with the browser's headers, less anything meant
  // for a proxy, and the connection becomes a byte pipe once the target's
  // answer head has been passed on without the gate's mark (spliceAfterHead).
  const upgrade = async (method: string, target: string, rawHeaders: string[], client: Socket, head: Buffer): Promise<void> => {
    const to = urlTarget(target, ["ws:", "http:"]);
    const opened = await checkedOpen(to, client);
    if (!to || !opened) return;
    const { socket } = opened;
    let text = `${method} ${to.path} HTTP/1.1\r\nHost: ${to.hostHeader}\r\n`;
    for (let i = 0; i + 1 < rawHeaders.length; i += 2) {
      if (/^(?:host$|proxy-)/i.test(rawHeaders[i])) continue;
      text += `${rawHeaders[i]}: ${rawHeaders[i + 1]}\r\n`;
    }
    socket.write(text + "\r\n", "latin1");
    if (head.length > 0) socket.write(head);
    if (opened.sent.length > 0) socket.write(opened.sent);
    spliceAfterHead(client, socket, opened.early);
  };

  const run = (work: Promise<void>, client: Socket): void => {
    work.catch(() => client.destroy());
  };

  // Which connections the inner listener serves: those the front opened to
  // it. `relayPorts` holds the local port of every relay socket that is
  // connected and not closed, and a connection is a relay's when it comes
  // from 127.0.0.1 and from one of those ports (servesInner). That is a
  // stronger rule than the user check it replaces (another process of the
  // same user is refused too) and it reads no kernel table: with the user
  // check, each plain-http connection paid for a second synchronous read of
  // /proc/net/tcp.
  //
  // A connection is not judged when it is accepted, because the inner
  // listener can be handed a relay's accepted socket before the relay's own
  // 'connect' event has told the front which port it got (both orders occur,
  // under Node and under Bun; measured 2026-11-12). It is judged twice
  // instead. Every request, CONNECT and upgrade asks servesInner before
  // anything is done for it: a relay sends its first byte only after its
  // port is in the set, so a relay's request is never refused there. And
  // relayClaimMs after it was accepted, a connection that is not a relay's
  // is destroyed, which lets go of a local client that connects and says
  // nothing.
  const relayPorts = new Set<number>();
  const servesInner = (socket: Socket | undefined | null): boolean =>
    !!socket && isLoopbackClient(socket.remoteAddress) && socket.remotePort !== undefined && relayPorts.has(socket.remotePort);
  /** A connection to the inner listener that carries `client`'s bytes, first among them `first`. */
  const relayTo = (client: Socket, first: Buffer): void => {
    const relay = track(netConnect({ host: "127.0.0.1", port: innerPort, allowHalfOpen: true }));
    // Registered before the write below, so the port is known before a byte goes out.
    relay.once("connect", () => {
      const port = relay.localPort;
      if (port === undefined || relay.destroyed) return;
      relayPorts.add(port);
      // The kernel hands the port out again: it is a relay's only while this relay lives.
      relay.once("close", () => relayPorts.delete(port));
    });
    relay.write(first);
    splice(client, relay);
  };

  // Plain http: an absolute http:// URL. Anything else (an origin-form request
  // to the port itself) is not a proxy request and is refused.
  const plain = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // An error event with no listener is an uncaught exception.
    req.on("error", () => { /* the browser went away */ });
    res.on("error", () => { /* the browser went away */ });
    const to = urlTarget(req.url ?? "", ["http:"]);
    if (!to) {
      answerHttp(req, res, 400, "bad-request");
      return;
    }
    const answer = await resolveForEgress(to.host, policy);
    if (!answer.ok) {
      failed(to, "refused");
      answerHttp(req, res, 403, "refused", refusal(answer.reason));
      return;
    }
    // What a failure from here on is: this machine talks to the upstream when there is one.
    const why: EgressFailure = upstream ? "upstream" : "unreachable";
    const headers = withoutHeaders(req.headers, TO_GATE_ONLY);
    headers.host = to.hostHeader;
    if (upstream?.login) headers["proxy-authorization"] = upstream.login;
    // The browser giving up on the request ends the connect attempts (gate-1).
    // res closes when the relay's connection ends or closes, under Node and under Bun.
    const leaving = new AbortController();
    const leave = (): void => leaving.abort();
    res.once("close", leave);
    if (res.destroyed) leave();
    let socket: Socket | null;
    try {
      socket = upstream
        ? await connected(upstream.open, upstream.ready, answerMs, leaving.signal)
        : await dial(answer.addresses, to.port, leaving.signal);
    } finally {
      res.off("close", leave);
    }
    // Given up on by the browser: nothing to answer, and the target did not fail.
    if (leaving.signal.aborted || res.destroyed) {
      socket?.destroy();
      return;
    }
    if (!socket) {
      failed(to, why);
      answerHttp(req, res, 502, why);
      return;
    }
    // One connection per request, made above and used for nothing else: no
    // agent, so no socket is kept for a later request to another target.
    let out: ClientRequest;
    try {
      out = httpRequest({
        createConnection: () => socket,
        method: req.method,
        path: upstream ? `http://${to.hostHeader}${to.path}` : to.path,
        headers,
        setHost: false,
      });
    } catch {
      // The request cannot be written (a method or header node will not send).
      socket.destroy();
      answerHttp(req, res, 400, "bad-request");
      return;
    }
    // No answer the gate can pass on: 502 from the gate, or a cut connection
    // when part of an answer has gone to the browser already.
    const giveUp = (): void => {
      req.unpipe(out);
      out.destroy();
      if (res.headersSent || res.destroyed) {
        res.destroy();
        return;
      }
      failed(to, why);
      try {
        answerHttp(req, res, 502, why);
      } catch {
        res.destroy();
      }
    };
    // Nothing in this callback may throw: it runs from the target's socket,
    // outside the promise this function returns, and an uncaught exception
    // stops the hosted server. writeHead does throw, on a status below 100
    // and on headers node will not send (see relayHead).
    out.on("response", (upRes: IncomingMessage) => {
      const refusedByUpstream = upstream !== undefined && upRes.statusCode === 407;
      const answerHeaders: Record<string, string | string[]> = withoutHeaders(upRes.headers, FROM_TARGET_ONLY);
      // 407 is a proxy's own answer: with an upstream it is the upstream refusing the gate's login.
      if (refusedByUpstream) answerHeaders[EGRESS_HEADER] = "upstream";
      if (!relayHead(res, upRes.statusCode, answerHeaders)) {
        // The read that giveUp cuts short must not be an unhandled error.
        upRes.on("error", () => { /* given up on */ });
        upRes.resume();
        giveUp();
        return;
      }
      if (refusedByUpstream) failed(to, "upstream");
      else carried(to);
      upRes.pipe(res);
      // Cut short upstream: cut short here. Ending normally wrote a chunked
      // response's last chunk, so a truncated body read as complete.
      upRes.on("aborted", () => res.destroy());
      upRes.on("error", () => res.destroy());
      upRes.on("close", () => { if (!upRes.complete) res.destroy(); });
    });
    out.on("error", giveUp);
    out.on("close", () => {
      socket.destroy();
      // Closed with nothing passed on and no error (a 101 nobody asked for): still an answer owed.
      if (!res.headersSent && !res.destroyed) giveUp();
    });
    // The browser gave up on it: so does the request to the target.
    res.on("close", () => { if (!res.writableFinished) out.destroy(); });
    req.pipe(out);
  };

  const inner = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    if (!servesInner(req.socket)) {
      req.socket?.destroy();
      return;
    }
    plain(req, res).catch(() => res.destroy());
  });
  // A CONNECT or an upgrade that follows a plain request on a kept-alive connection.
  inner.on("connect", (req: IncomingMessage, client: Socket, head: Buffer) => {
    if (!servesInner(client)) {
      client.destroy();
      return;
    }
    run(tunnel(req.url ?? "", client, head), client);
  });
  inner.on("upgrade", (req: IncomingMessage, client: Socket, head: Buffer) => {
    if (!servesInner(client)) {
      client.destroy();
      return;
    }
    run(upgrade(req.method ?? "GET", req.url ?? "", req.rawHeaders, client, head), client);
  });
  inner.on("connection", (socket: Socket) => {
    track(socket);
    // See relayPorts. The check waits one more turn of the loop after the
    // timer, so that a relay's 'connect' that was already due when a busy
    // loop came back is handled before it.
    const claim = setTimeout(() => {
      setImmediate(() => {
        if (!servesInner(socket)) socket.destroy();
      });
    }, EGRESS_GATE_LIMITS.relayClaimMs);
    claim.unref();
    socket.once("close", () => clearTimeout(claim));
  });

  // The front: read the first request line, serve the tunnel shapes here and
  // hand an http:// connection to the inner server.
  const serve = (client: Socket, handedOn: () => void): void => {
    let buffered = Buffer.alloc(0);
    // A client that ends before a complete head has nothing coming: without
    // this its socket stayed half-open for the life of the gate (the listener
    // allows half-open connections, for tunnels).
    const onEnd = (): void => { client.destroy(); };
    const stop = (): void => {
      client.off("data", onData);
      client.off("end", onEnd);
      client.pause();
      handedOn();
    };
    const onData = (chunk: Buffer): void => {
      buffered = Buffer.concat([buffered, chunk]);
      const lineEnd = buffered.indexOf("\r\n");
      const line = lineEnd < 0 ? null : REQUEST_LINE.exec(buffered.subarray(0, lineEnd).toString("latin1"));
      if (lineEnd < 0 ? buffered.length > MAX_HEAD : !line) {
        stop();
        answerRaw(client, headMs, 400, "Bad Request", "bad-request");
        return;
      }
      if (!line) return;
      const [, method, target] = line;
      if (method !== "CONNECT" && /^http:\/\//i.test(target)) {
        stop();
        relayTo(client, buffered);
        return;
      }
      const headEnd = buffered.indexOf("\r\n\r\n");
      if (headEnd < 0 && buffered.length <= MAX_HEAD) return;
      stop();
      const rawHeaders = headEnd < 0 ? null : headerLines(buffered.subarray(lineEnd + 2, Math.max(lineEnd + 2, headEnd)).toString("latin1"));
      const rest = buffered.subarray(headEnd + 4);
      if (rawHeaders && method === "CONNECT") run(tunnel(target, client, rest), client);
      else if (rawHeaders && /^ws:\/\//i.test(target) && hasHeader(rawHeaders, "upgrade")) run(upgrade(method, target, rawHeaders, client, rest), client);
      else answerRaw(client, headMs, 400, "Bad Request", "bad-request");
    };
    client.on("end", onEnd);
    client.on("data", onData);
  };
  const front = createNetServer({ allowHalfOpen: true }, (client: Socket) => {
    // Tracked at once: a reset while the user check is pending would
    // otherwise be an error event with no listener.
    track(client);
    // A client that sends no complete head in time is dropped: one that goes
    // quiet (webkit's unused preconnects did) otherwise holds a descriptor
    // for the life of the gate. Stopped when the connection is handed on.
    const headTimer = setTimeout(() => client.destroy(), headMs);
    headTimer.unref();
    client.once("close", () => clearTimeout(headTimer));
    // Its bytes wait in the socket until the check is back: nothing reads them before.
    //
    // The check is one read of the kernel's tables shared by every gate in the
    // process (sharedLoopbackPeers in proxy-forwarder.ts), and its length grows
    // with the rows. A page can add rows cheaply (each refusal leaves a
    // TIME_WAIT row for a minute), so it can slow every account's new
    // connections to its gate (gate-2, second review). The cost is bounded: a
    // client waits for at most one read plus the budget's 50 ms
    // (LOOPBACK_READ_BUDGET), every client waiting when a read starts is
    // decided by that one read, and nobody is refused for it. The cheaper fix,
    // not made yet, is to ask the kernel for the rows of the gate's own ports
    // only (sock_diag with a port filter) instead of reading the whole table.
    const ends = { remoteAddress: client.remoteAddress, remotePort: client.remotePort, localPort: client.localPort };
    ownUser(ends).then((mine) => {
      if (!mine || client.destroyed || closed) {
        client.destroy();
        return;
      }
      serve(client, () => clearTimeout(headTimer));
    }).catch(() => client.destroy());
  });

  const listen = (server: NetServer): Promise<void> => new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      // A failed accept later on (no descriptor left) must not stop the process the gate runs in.
      server.on("error", () => { /* that one connection is lost */ });
      resolve();
    });
  });
  await listen(inner);
  innerPort = (inner.address() as { port: number }).port;
  try {
    await listen(front);
  } catch (error) {
    inner.close();
    throw error;
  }
  // Not a reason for the process to stay up: the browser's connections are.
  inner.unref();
  front.unref();
  const address = front.address() as { port: number };

  return {
    server: `http://127.0.0.1:${address.port}`,
    failure,
    close: () => new Promise<void>((resolve) => {
      closed = true;
      for (const s of sockets) s.destroy();
      let open = 2;
      const done = (): void => { if (--open === 0) resolve(); };
      front.close(done);
      inner.close(done);
    }),
  };
}
