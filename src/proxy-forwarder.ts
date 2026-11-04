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
import type { ProxyConfig } from "./types.js";

export interface ProxyForwarder {
  /** What the browser is given as its proxy: http://127.0.0.1:<port>, no login. */
  server: string;
  close(): Promise<void>;
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
function fromUser(socket: Socket, uid: number | undefined): boolean {
  if (socket.remoteAddress !== "127.0.0.1" && socket.remoteAddress !== "::ffff:127.0.0.1") return false;
  if (process.platform !== "linux" || uid === undefined) return true;
  if (socket.remotePort === undefined || socket.localPort === undefined) return false;
  let table = "";
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    try { table += readFileSync(file, "utf8") + "\n"; } catch { /* no IPv6 table */ }
  }
  return loopbackPeerUid(table, socket.remotePort, socket.localPort) === uid;
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
      res.writeHead(upRes.statusCode ?? 502, upRes.headers);
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
