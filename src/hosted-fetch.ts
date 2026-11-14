/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * fetch for a URL a hosted caller chose.
 *
 * Counted 2026-11-12 at 7444ae2: twenty server-side requests in eight files
 * went to a caller's URL through the runtime's fetch (the redirect resolver
 * that runs before every tool with a url, the no-JS probe and llms.txt read
 * of agent_ready_audit, llms_txt_validate and its link check, llms_txt_diff,
 * security_audit's mcp_url, the eleven requests of webmcp_ready_audit, and
 * the sitemap read). The runtime looks the name up itself and follows
 * redirects itself, so the address connected to was never checked, on the
 * first request or on any redirect, and a name could answer one address for
 * a check and another for the connection. Ten of them had no timeout and
 * none had a size limit (P-10, plan of 2026-11-07).
 *
 * On a hosted server hostedFetch asks resolveForEgress (egress.ts) once per
 * request, connects to an address it returned and to nothing else, and does
 * the same again for every redirect, which it follows by hand. The name is
 * still what the server sees in Host and what the certificate is checked
 * against. The whole call has a time limit and the decoded body a size limit.
 *
 * Not hosted it is the runtime's fetch, called with what the caller passed:
 * no lookup of its own, no limit added.
 *
 * Measured 2026-11-12 on Node 22.19.0 and Bun 1.4.4 against a listener on
 * 127.0.0.2 with a self-signed certificate for the name tls.test: a request
 * with host set to the address, the Host header and servername set to the
 * name, answers 200 when the certificate is trusted, fails with
 * DEPTH_ZERO_SELF_SIGNED_CERT when it is not, and with
 * ERR_TLS_CERT_ALTNAME_INVALID when the certificate is for another name.
 *
 * Since the review of 2026-11-12 hostedFetch makes the connection itself and
 * hands it to the request (connectFirst and secured below), because the
 * request's own connect could not be given a second address to fall back on:
 * a first address that dropped the connect used up the whole call, where the
 * runtime's fetch had moved to the next one after 250 ms. Measured the same
 * day on Node 22.19.0 and Bun 1.4.4: http.request with createConnection and
 * no agent writes to the socket it is handed and to no other, and
 * tls.connect over that socket checks the certificate against the name as
 * above (self-signed, another name, an address literal, and with
 * NODE_TLS_REJECT_UNAUTHORIZED=0 set).
 */

import { request as httpRequest, type ClientRequest, type IncomingMessage, type RequestOptions } from "node:http";
import { connect as netConnect, isIP, type Socket } from "node:net";
import { pipeline, Transform, type Duplex, type Readable, type TransformCallback } from "node:stream";
import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { constants as zlib, createBrotliDecompress, createGunzip, createInflate, createInflateRaw } from "node:zlib";
import { EGRESS_REFUSAL_REASON, EgressRefused, resolveForEgress, type EgressPolicy } from "./egress.js";
import { isHostedMode } from "./mcp-tools/hosted-inputs.js";

export interface HostedFetchOptions {
  /** Largest decoded body, in bytes. Default 10 MB. Hosted only. */
  maxBytes?: number;
  /** Time for the whole call, body included. Default 30 s. Hosted only. */
  timeoutMs?: number;
  /** Replaces the lookup or the address decision. For tests. */
  policy?: EgressPolicy;
  /**
   * Certificate authorities to trust in place of the system's. For tests of
   * the https path only: no call in src passes it
   * (tests/hosted-fetch-coverage.test.ts scans for one).
   */
  ca?: string | Buffer | Array<string | Buffer>;
}

export type HostedFetchInit = RequestInit & HostedFetchOptions;

/**
 * The limits every hosted call runs under: no call in src passes maxBytes or
 * timeoutMs. Exported so that a test can hold them to these values.
 */
export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_REDIRECTS = 10;
const MAX_CODINGS = 5;
/**
 * How long one checked address has to connect before the next is started
 * beside it. The runtime's own connect waits as long
 * (net.getDefaultAutoSelectFamilyAttemptTimeout() is 250 on Node 22.19.0).
 */
const NEXT_ADDRESS_AFTER_MS = 250;
/**
 * The ports the fetch specification does not connect to ("bad ports"), as
 * undici 6.21.2 in Node 22.19.0 lists them. The runtime's fetch refused them
 * before this file replaced it on hosted servers; without the list a caller's
 * URL had this machine write an HTTP request to another host's SMTP or IRC
 * port (review of 2026-11-12).
 */
const BAD_PORTS: ReadonlySet<number> = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119,
  123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995,
  1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);
const OWN_KEYS = ["maxBytes", "timeoutMs", "policy", "ca"] as const;

/** The statuses fetch treats as a redirect. */
const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
/** Headers that describe a body, dropped with the body when a redirect turns the request into a GET. */
const BODY_HEADERS = ["content-type", "content-length", "content-encoding", "content-language", "content-location"];
/** Headers that carry a login, dropped when a redirect leaves the origin they were meant for. */
const LOGIN_HEADERS = ["authorization", "cookie", "proxy-authorization"];
/** Headers the connection sets itself. */
const CONNECTION_HEADERS = ["host", "connection", "keep-alive", "transfer-encoding", "content-length", "upgrade"];

/**
 * Why hostedFetch refused: the name gave no address ("unresolved"), an
 * address is one this server does not connect to ("address"), or the URL is
 * not http or https ("scheme"). For the server's own log and for
 * url-resolution.ts. The message says the same sentence for the first two: a
 * hosted caller reads it (llms_txt_validate returns it per link), and a text
 * that told them apart would list the names only this machine's resolver
 * knows (review of 2026-11-12).
 */
export type RefusalKind = "unresolved" | "address" | "scheme";

/**
 * An EgressRefused that carries its kind as a read-only property. For the
 * two kinds that are about an address the text is the one sentence egress.ts
 * keeps for both, the same the gate's 403 page gives; the answer's own
 * `reason` is not passed on, so that no other wording can reach a caller
 * through here.
 */
function refused(subject: string, kind: RefusalKind): EgressRefused {
  const error = new EgressRefused(`${subject} is refused: ${kind === "scheme" ? "only http and https are fetched" : EGRESS_REFUSAL_REASON}`);
  Object.defineProperty(error, "kind", { value: kind, enumerable: true, writable: false, configurable: true });
  return error;
}

/** The kind of a refusal hostedFetch threw, or undefined for anything else (an EgressRefused made elsewhere has none). */
export function refusalKind(error: unknown): RefusalKind | undefined {
  if (!(error instanceof EgressRefused)) return undefined;
  const kind = (error as { kind?: unknown }).kind;
  return kind === "unresolved" || kind === "address" || kind === "scheme" ? kind : undefined;
}

/**
 * What the runtime's fetch reports for a transport failure: "fetch failed",
 * with the cause attached. The cause's own text names the address connected
 * to, and several tools return the message to the caller.
 */
function failed(cause: unknown): TypeError {
  return new TypeError("fetch failed", { cause });
}

/**
 * A connection to the first of the checked addresses that accepts one.
 *
 * The addresses are raced the way the runtime's own connect races them: the
 * first is started, the next one is started beside it when it has not
 * connected after NEXT_ADDRESS_AFTER_MS, or at once when it failed, and the
 * first socket to connect is kept and the others destroyed. Every address
 * here was checked, so which of them wins does not matter to the rule, and
 * nothing has been written on any socket when this returns: the caller
 * writes the request on the one it is given and on no other.
 */
function connectFirst(addresses: readonly string[], port: number, signal: AbortSignal): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const trying = new Set<Socket>();
    let next = 0;
    let over = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastError: unknown = new Error("no address to connect to");
    const end = (winner: Socket | null, reason?: unknown): void => {
      if (over) return;
      over = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      for (const socket of trying) {
        if (socket !== winner) socket.destroy();
      }
      trying.clear();
      if (winner) resolve(winner);
      else reject(reason);
    };
    const onAbort = (): void => end(null, signal.reason);
    const start = (): void => {
      clearTimeout(timer);
      if (over) return;
      if (next >= addresses.length) {
        // Nothing left to start. The call fails once the attempts still out have failed too.
        if (trying.size === 0) end(null, lastError);
        return;
      }
      const address = addresses[next++];
      let socket: Socket;
      try {
        // A literal address: net.connect looks nothing up for one.
        socket = netConnect({ host: address, port });
      } catch (e) {
        lastError = e;
        start();
        return;
      }
      trying.add(socket);
      socket.once("connect", () => end(socket));
      // Stays on the socket for its whole life: an error event with no
      // listener ends the process, and between winning and being handed to
      // the request the socket has no other.
      socket.on("error", (e) => {
        if (!trying.delete(socket)) return;
        // Failed before it connected, so nothing was sent to it: the next address may be tried.
        lastError = e;
        socket.destroy();
        start();
      });
      if (next < addresses.length) timer = setTimeout(start, NEXT_ADDRESS_AFTER_MS);
    };
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    start();
  });
}

/**
 * TLS over a connection connectFirst made. The certificate is checked
 * against the name (or the address, for an address literal), whatever
 * NODE_TLS_REJECT_UNAUTHORIZED says. Resolves once the handshake is over and
 * the certificate accepted, so nothing is written before that.
 */
function secured(socket: Socket, name: string, ca: HostedFetchOptions["ca"], signal: AbortSignal): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    let over = false;
    let tls: TLSSocket | undefined;
    const fail = (reason: unknown): void => {
      if (over) return;
      over = true;
      signal.removeEventListener("abort", onAbort);
      tls?.destroy();
      socket.destroy();
      reject(reason);
    };
    const onAbort = (): void => fail(signal.reason);
    try {
      tls = tlsConnect({
        socket,
        // Not connected to (the socket already is): the name the certificate is checked against.
        host: name,
        // No SNI for an IP address (Bun throws on one); its certificate is checked against the address.
        ...(isIP(name) ? {} : { servername: name }),
        rejectUnauthorized: true,
        // What the runtime's fetch offers, so a site answers as it did
        // before hostedFetch replaced it. https.request offers no ALPN at
        // all (both measured 2026-11-12 on Node 22.19.0 against a listener
        // that records the offer).
        ALPNProtocols: ["http/1.1"],
        ...(ca ? { ca } : {}),
      });
    } catch (e) {
      fail(e);
      return;
    }
    const made = tls;
    // Stays for the socket's whole life, for the reason given in connectFirst.
    made.on("error", fail);
    made.once("close", () => fail(new Error("the connection closed before the TLS handshake ended")));
    made.once("secureConnect", () => {
      if (over) return;
      // With rejectUnauthorized a certificate that fails is an error event on
      // Node 22.19.0 and Bun 1.4.4 and this line is not reached. Should a
      // runtime get here with one anyway, it is still refused.
      if (!made.authorized) {
        fail(Object.assign(new Error("the certificate was not accepted"), { code: String(made.authorizationError ?? "") }));
        return;
      }
      over = true;
      signal.removeEventListener("abort", onAbort);
      resolve(made);
    });
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * One request for `url` on a connection to one of `addresses`, all of them
 * checked. Resolves when the response head arrives. A failure to connect
 * moves on to the next address inside connectFirst; once the request has
 * been written a failure is the call's, and it is not sent again.
 */
async function send(
  url: URL,
  addresses: readonly string[],
  port: number,
  method: string,
  headers: Headers,
  body: Buffer | null,
  signal: AbortSignal,
  ca: HostedFetchOptions["ca"],
): Promise<IncomingMessage> {
  const name = url.hostname.replace(/^\[(.*)\]$/, "$1");
  const raw = await connectFirst(addresses, port, signal);
  const connection: Duplex = url.protocol === "https:" ? await secured(raw, name, ca, signal) : raw;
  return new Promise((resolve, reject) => {
    const out: Record<string, string> = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    // The name, with its port when the URL gives one: the server picks the site by it.
    out.host = url.host;
    // A POST or PUT with no body gets Content-Length: 0 from the runtime
    // (seen on Node 22.19.0 and Bun 1.4.4), as fetch sends it.
    if (body) out["content-length"] = String(body.length);
    const options: RequestOptions = {
      // The request goes out on the connection made above. With
      // createConnection and no agent the runtime makes none of its own, and
      // so keeps none alive either: a kept socket belongs to an address, and
      // the next request for the name has its own check.
      createConnection: () => connection as Socket,
      // Never used to connect. An address all the same, so that no part of
      // these options is a name something could look up.
      host: raw.remoteAddress ?? addresses[0],
      port,
      method,
      path: `${url.pathname}${url.search}`,
      headers: out,
    };
    let settled = false;
    let req: ClientRequest;
    const onAbort = (): void => {
      if (settled) return;
      settled = true;
      reject(signal.reason);
      req.destroy();
      connection.destroy();
    };
    try {
      req = httpRequest(options, (res) => {
        if (settled) {
          res.destroy();
          return;
        }
        settled = true;
        signal.removeEventListener("abort", onAbort);
        resolve(res);
      });
    } catch (e) {
      // A request the runtime will not build (a header it does not take). The connection is already open: close it.
      connection.destroy();
      reject(e);
      return;
    }
    req.on("error", (e) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      connection.destroy();
      reject(e);
    });
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    if (body) req.end(body);
    else req.end();
  });
}

/**
 * Decodes a "deflate" body in either of the two forms servers send under
 * that name: with the zlib header (what the name means) or the bare deflate
 * stream. The first byte tells them apart (the low four bits of a zlib
 * header are 8), which is how the runtime's fetch reads both. createInflate
 * alone failed the bare form with "incorrect header check" (2026-11-12).
 */
class EitherInflate extends Transform {
  private inner: Transform | null = null;

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    if (!this.inner) {
      if (chunk.length === 0) {
        callback();
        return;
      }
      const settings = { flush: zlib.Z_SYNC_FLUSH, finishFlush: zlib.Z_SYNC_FLUSH };
      const inner: Transform = (chunk[0] & 0x0f) === 0x08 ? createInflate(settings) : createInflateRaw(settings);
      inner.on("data", (decoded: Buffer) => this.push(decoded));
      inner.on("error", (e) => this.destroy(e));
      this.inner = inner;
    }
    this.inner.write(chunk, (e) => callback(e ?? null));
  }

  override _flush(callback: TransformCallback): void {
    if (!this.inner) {
      callback();
      return;
    }
    // The stream ends only when the decoder has given up everything it holds.
    this.inner.once("end", () => callback());
    this.inner.end();
  }

  override _destroy(error: Error | null, callback: (error: Error | null) => void): void {
    this.inner?.destroy();
    callback(error);
  }
}

/** The decoders for a Content-Encoding value, in the order the body passes through them, or null to leave the body as sent. */
function decoders(encoding: string | null): Readable[] | null {
  if (!encoding) return [];
  const codings = encoding.toLowerCase().split(",").map((c) => c.trim()).filter((c) => c && c !== "identity");
  if (codings.length > MAX_CODINGS) return null;
  const out: Readable[] = [];
  // Applied by the server left to right, so undone right to left. The flush
  // settings accept a body that ends without its trailer, as the runtime's fetch does.
  for (const coding of codings.reverse()) {
    if (coding === "gzip" || coding === "x-gzip") out.push(createGunzip({ flush: zlib.Z_SYNC_FLUSH, finishFlush: zlib.Z_SYNC_FLUSH }));
    else if (coding === "deflate") out.push(new EitherInflate());
    else if (coding === "br") out.push(createBrotliDecompress({ flush: zlib.BROTLI_OPERATION_FLUSH, finishFlush: zlib.BROTLI_OPERATION_FLUSH }));
    else return null;
  }
  return out;
}

/**
 * The response head and its body as a Response. The body is handed over as
 * it arrives, decoded, and stops with an error past `maxBytes`, on abort, or
 * when the connection closes early. `done` runs once, when the body is over.
 */
function toResponse(
  res: IncomingMessage,
  url: URL,
  method: string,
  redirected: boolean,
  maxBytes: number,
  signal: AbortSignal,
  done: () => void,
): Response {
  const headers = new Headers();
  for (let i = 0; i + 1 < res.rawHeaders.length; i += 2) {
    try {
      headers.append(res.rawHeaders[i], res.rawHeaders[i + 1]);
    } catch {
      // A header the server sent that Headers does not accept is left out.
    }
  }
  const status = res.statusCode ?? 0;
  let body: ReadableStream<Uint8Array> | null = null;
  if (method === "HEAD" || status === 204 || status === 205 || status === 304) {
    res.destroy();
    done();
  } else {
    const declared = Number(headers.get("content-length"));
    if (declared > maxBytes) {
      res.destroy();
      done();
      throw new Error(`the response is larger than ${maxBytes} bytes`);
    }
    const chain = decoders(headers.get("content-encoding"));
    if (chain && chain.length > 0) {
      // The body below is the decoded one; these two described the encoded one.
      headers.delete("content-encoding");
      headers.delete("content-length");
    }
    let over = false;
    const stop = (): void => {
      if (over) return;
      over = true;
      signal.removeEventListener("abort", onAbort);
      done();
      res.destroy();
      for (const d of chain ?? []) d.destroy();
    };
    let fail: (reason: unknown) => void = stop;
    const onAbort = (): void => fail(signal.reason);
    body = new ReadableStream<Uint8Array>({
      start(controller) {
        fail = (reason) => {
          if (over) return;
          stop();
          controller.error(reason);
        };
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
        let total = 0;
        const decoded: Readable = chain && chain.length > 0
          ? (pipeline([res, ...chain] as unknown as [Readable, ...NodeJS.ReadWriteStream[]], (e) => { if (e) fail(failed(e)); }) as unknown as Readable)
          : res;
        decoded.on("data", (chunk: Buffer) => {
          if (over) return;
          total += chunk.length;
          if (total > maxBytes) {
            fail(new Error(`the response is larger than ${maxBytes} bytes`));
            return;
          }
          controller.enqueue(chunk);
        });
        decoded.on("end", () => {
          if (over) return;
          over = true;
          signal.removeEventListener("abort", onAbort);
          done();
          controller.close();
        });
        // A connection that drops mid-body. The error listener must be there
        // (an error event nobody listens for ends the process); the close
        // check is for a runtime that closes without one. On Bun 1.4.4 either
        // alone fails the read, and with both removed the read hangs.
        res.on("error", (e) => fail(failed(e)));
        res.on("close", () => {
          if (!res.complete) fail(failed(new Error("the connection closed before the response ended")));
        });
      },
      cancel() {
        stop();
      },
    });
  }
  // Response takes 200 to 599 and throws for anything else, on Node and on
  // Bun. Servers do send other statuses (linkedin.com answers 999 to clients
  // that are not browsers) and the runtime's fetch returns them, so such a
  // response is built under a status Response takes and shows its own.
  const buildable = status >= 200 && status <= 599;
  let response: Response;
  try {
    response = new Response(body, { status: buildable ? status : 200, statusText: res.statusMessage ?? "", headers });
  } catch {
    try {
      // A reason phrase Response does not accept.
      response = new Response(body, { status: buildable ? status : 200, headers });
    } catch (e) {
      if (body) void body.cancel().catch(() => {});
      throw failed(e);
    }
  }
  if (!buildable) {
    Object.defineProperty(response, "status", { value: status });
    Object.defineProperty(response, "ok", { value: false });
  }
  const shown = new URL(url.href);
  shown.hash = "";
  Object.defineProperty(response, "url", { value: shown.href });
  Object.defineProperty(response, "redirected", { value: redirected });
  return response;
}

/**
 * fetch, for a URL that came from a caller of a hosted server.
 *
 * Hosted: http and https only; every request, and every redirect, connects
 * only to an address resolveForEgress allowed, and throws EgressRefused when
 * there is none (refusalKind says which way). The ports fetch does not
 * connect to fail as they do there. `redirect` is honoured as fetch does
 * ("follow" up to ten, "manual", "error"), `signal` aborts the call and the
 * body, and gzip, deflate and br bodies are decoded.
 *
 * Not hosted: fetch(input, init), with this function's own options removed.
 */
export async function hostedFetch(input: string | URL, init?: HostedFetchInit): Promise<Response> {
  if (!isHostedMode()) {
    if (!init || !OWN_KEYS.some((key) => key in init)) return fetch(input, init);
    const rest: Record<string, unknown> = { ...init };
    for (const key of OWN_KEYS) delete rest[key];
    return fetch(input, rest as RequestInit);
  }

  const maxBytes = init?.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const mode = init?.redirect ?? "follow";
  let url = new URL(String(input));
  let method = (init?.method ?? "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  let body: Buffer | null = null;
  if (init?.body !== undefined && init.body !== null) {
    if (method === "GET" || method === "HEAD") throw new TypeError("Request with GET/HEAD method cannot have body.");
    // Read once into memory, so a 307 or 308 can send it again. Response
    // reads every kind of body fetch takes and names its content type.
    const carrier = new Response(init.body);
    body = Buffer.from(await carrier.arrayBuffer());
    const type = carrier.headers.get("content-type");
    if (type && !headers.has("content-type")) headers.set("content-type", type);
  }
  for (const name of CONNECTION_HEADERS) headers.delete(name);
  // What the hosted servers' fetch (Node) sent before, so a site answers as it did.
  if (!headers.has("accept")) headers.set("accept", "*/*");
  if (!headers.has("accept-language")) headers.set("accept-language", "*");
  if (!headers.has("user-agent")) headers.set("user-agent", "node");
  if (!headers.has("accept-encoding")) headers.set("accept-encoding", "gzip, deflate, br");

  // One clock for the whole call: lookups, every hop, and the body.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new DOMException("The operation timed out.", "TimeoutError")), timeoutMs);
  const outer = init?.signal ?? null;
  const onOuterAbort = (): void => abort.abort(outer?.reason);
  let finished = false;
  const done = (): void => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    outer?.removeEventListener("abort", onOuterAbort);
  };
  if (outer?.aborted) onOuterAbort();
  else outer?.addEventListener("abort", onOuterAbort, { once: true });
  const aborted = new Promise<never>((_, reject) => {
    if (abort.signal.aborted) reject(abort.signal.reason);
    else abort.signal.addEventListener("abort", () => reject(abort.signal.reason), { once: true });
  });
  aborted.catch(() => {});

  // The system lookup gives each owner only a share of its places, so that
  // one caller aimed at slow names cannot use up the places every other
  // account's lookups need. One call is one owner, for all its hops: a new
  // object, unless a test passed one. A test's own policy is kept beside it.
  const lookupPolicy: EgressPolicy = { ...init?.policy, owner: init?.policy?.owner ?? {} };

  try {
    for (let hop = 0; ; hop++) {
      const subject = hop === 0 ? "the URL" : "a redirect";
      if (url.protocol !== "http:" && url.protocol !== "https:") throw refused(subject, "scheme");
      if (url.username || url.password) {
        throw new TypeError("a URL that includes a login is not fetched");
      }
      // An empty port is the scheme's own. Port 0 is nobody's: it used to be
      // read as "no port" here and sent to 80 or 443.
      const port = url.port === "" ? (url.protocol === "https:" ? 443 : 80) : Number(url.port);
      // Checked on every hop, so a redirect cannot lead to one either.
      if (port === 0 || BAD_PORTS.has(port)) throw failed(new Error("bad port"));
      // The one lookup for this hop. Every address in the answer was checked.
      const answer = await Promise.race([resolveForEgress(url.hostname, lookupPolicy), aborted]);
      if (!answer.ok) throw refused(subject, answer.kind);
      let res: IncomingMessage;
      try {
        res = await send(url, answer.addresses, port, method, headers, body, abort.signal, init?.ca);
      } catch (e) {
        if (abort.signal.aborted) throw abort.signal.reason;
        throw failed(e);
      }

      const status = res.statusCode ?? 0;
      if (REDIRECT_STATUS.has(status) && mode !== "manual") {
        if (mode === "error") {
          res.destroy();
          throw failed(new Error("unexpected redirect"));
        }
        const location = res.headers.location;
        if (location) {
          res.destroy();
          if (hop >= MAX_REDIRECTS) throw failed(new Error(`more than ${MAX_REDIRECTS} redirects`));
          let next: URL;
          try {
            next = new URL(location, url);
          } catch {
            throw failed(new Error("a redirect to something that is not a URL"));
          }
          if (((status === 301 || status === 302) && method === "POST") || (status === 303 && method !== "GET" && method !== "HEAD")) {
            method = "GET";
            body = null;
            for (const name of BODY_HEADERS) headers.delete(name);
          }
          if (next.origin !== url.origin) {
            for (const name of LOGIN_HEADERS) headers.delete(name);
          }
          url = next;
          continue;
        }
      }
      return toResponse(res, url, method, hop > 0, maxBytes, abort.signal, done);
    }
  } catch (e) {
    done();
    throw e;
  }
}
