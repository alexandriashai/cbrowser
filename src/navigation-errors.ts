/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Plain-language messages for navigation failures.
 *
 * Reported: navigate("https://cbrowser.ai.invalid/") returned Playwright's raw
 * error,
 *
 *   page.goto: net::ERR_NAME_NOT_RESOLVED at https://cbrowser.ai.invalid/
 *   Call log:
 *     - navigating to "https://cbrowser.ai.invalid/", waiting until "load"
 *
 * which says what Chromium did, not what the caller should do, and carries a
 * Call log that is noise to anyone but a Playwright maintainer. navigate()
 * mapped only the proxy errors (ERR_TUNNEL / ERR_PROXY / ERR_NETWORK_CHANGED)
 * and rethrew everything else as is.
 *
 * Pure: no browser, no Playwright import, so any module that calls page.goto
 * can use it.
 *
 * The second half of this file is the same job for the hosted server, where
 * every browser sits behind the egress gate (egress-gate.ts) and a page the
 * gate does not carry reaches the browser as a proxy's answer. Review of
 * 2026-11-12 (launch-wiring-1, regression-2, regression-3): a mistyped https
 * host came back as "The target site is blocking proxy/VPN connections", with
 * no proxy configured, and the same host over plain http came back as a
 * loaded page whose text was the gate's refusal.
 */

import type { EgressFailure } from "./proxy-forwarder.js";

/** net:: codes mapped to a sentence about the host. `{host}` is filled in. */
const NET_ERRORS: Array<{ code: RegExp; describe: (host: string, code: string) => string }> = [
  {
    code: /^ERR_NAME_NOT_RESOLVED$/,
    describe: (host) => `Could not resolve host ${host}. Check the URL spelling or network access. Nothing was loaded.`,
  },
  {
    code: /^ERR_CONNECTION_REFUSED$/,
    describe: (host) => `Connection to ${host} was refused: nothing is listening there, or a firewall rejected it. Check the address and port. Nothing was loaded.`,
  },
  {
    code: /^ERR_(CONNECTION_)?TIMED_OUT$/,
    describe: (host) => `Connection to ${host} timed out: the host did not answer. Check the address and network access. Nothing was loaded.`,
  },
  {
    code: /^ERR_ADDRESS_UNREACHABLE$/,
    describe: (host) => `Host ${host} is unreachable from this machine (no route to it). Check the address and network access. Nothing was loaded.`,
  },
  {
    code: /^ERR_INTERNET_DISCONNECTED$/,
    describe: (host) => `No network connection: could not reach ${host}. Nothing was loaded.`,
  },
  {
    code: /^ERR_(CONNECTION_RESET|CONNECTION_CLOSED|EMPTY_RESPONSE)$/,
    describe: (host) => `${host} closed the connection without sending a page. The server may be down or rejecting this client. Nothing was loaded.`,
  },
  {
    code: /^ERR_CERT_[A-Z_]+$/,
    describe: (host, code) => `The TLS certificate for ${host} was rejected (${certReason(code)}). Nothing was loaded.`,
  },
  {
    code: /^ERR_SSL_[A-Z_]+$/,
    describe: (host) => `A secure (TLS) connection to ${host} could not be established. Nothing was loaded.`,
  },
  {
    code: /^ERR_TOO_MANY_REDIRECTS$/,
    describe: (host) => `${host} redirected too many times (a redirect loop). Nothing was loaded.`,
  },
];

function certReason(code: string): string {
  if (code === "ERR_CERT_DATE_INVALID") return "expired or not yet valid";
  if (code === "ERR_CERT_COMMON_NAME_INVALID") return "issued for a different host name";
  if (code === "ERR_CERT_AUTHORITY_INVALID") return "issued by an untrusted authority, for example self-signed";
  if (code === "ERR_CERT_REVOKED") return "revoked";
  return "invalid";
}

/** host[:port] of `url`, or the url itself when it does not parse. */
function hostOf(url: string, message: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    const at = message.match(/ at (\S+)/)?.[1];
    if (at) {
      try { return new URL(at).host || at; } catch { return at; }
    }
    return url;
  }
}

/**
 * A plain-language message for a navigation error, or null when the error is
 * not one of the known net:: failures (the caller then keeps the original).
 *
 * The message names the host, says what to check, says nothing was loaded,
 * and ends with the net:: code in parentheses for anyone searching it. The
 * Playwright "Call log" is dropped.
 */
export function describeNavigationError(message: string, url: string): string | null {
  const code = message.match(/net::(ERR_[A-Z_]+)/)?.[1];
  if (!code) return null;
  const entry = NET_ERRORS.find((e) => e.code.test(code));
  if (!entry) return null;
  return `${entry.describe(hostOf(url, message), code)} (net::${code})`;
}

/**
 * The error to throw for a failed navigation: a new Error carrying
 * describeNavigationError's message when the failure is a known net:: code,
 * otherwise the original error unchanged.
 */
export function navigationError(error: unknown, url: string): unknown {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const described = describeNavigationError(message, url);
  return described ? new Error(described) : error;
}

/** The part of the egress gate a reading needs: ProxyForwarder.failure. */
export interface GateRecord {
  failure?(host: string, port: number): EgressFailure | undefined;
}

/**
 * Thrown for a navigation the hosted server's egress gate did not carry: the
 * host was refused, or its address was allowed and nothing answered. It
 * carries which of the two, and the URL that failed, for a caller that wants
 * them without reading the message.
 *
 * The callers in src sort navigation errors by their text (the proxy
 * branches of navigate, of the agent-ready audit and of
 * site_cognitive_assessment look for a net:: code, navigate's fallback for
 * "Timeout"). This error passes all of them untouched because its sentence
 * holds none of those words, and tests/browser-route.test.ts holds the
 * sentences to that. A guard on the class in front of each check was tried
 * and removed on 2026-11-12: with or without it every test gave the same
 * result.
 */
export class EgressNavigationError extends Error {
  /** What the gate recorded. */
  readonly why: Exclude<EgressFailure, "upstream">;
  /** The URL the gate did not carry: the one asked for, or the redirect target that failed. */
  readonly failedUrl: string;
  constructor(message: string, why: Exclude<EgressFailure, "upstream">, failedUrl: string) {
    super(message);
    this.name = "EgressNavigationError";
    this.why = why;
    this.failedUrl = failedUrl;
  }
}

/**
 * The host and port of an http or https URL, as the gate keys its record:
 * the URL parser's host (the gate drops the brackets of an IPv6 address
 * itself) and the port the browser connects to, 443 or 80 when the URL names
 * none. Null for any other URL: the gate carries nothing else.
 */
export function gateTarget(url: string): { host: string; port: number } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!u.hostname) return null;
  return { host: u.hostname, port: u.port === "" ? (u.protocol === "https:" ? 443 : 80) : Number(u.port) };
}

/**
 * Why the gate did not carry the last request to `url`'s host and port, when
 * it has a record of that from the last minute. Undefined without a gate
 * (not hosted, or a socks proxy), without a record, and for a URL that is not
 * http(s). It never throws: a gate that does is read as having no record.
 */
export function gateFailure(gate: GateRecord | null | undefined, url: string): EgressFailure | undefined {
  if (!gate || typeof gate.failure !== "function") return undefined;
  const target = gateTarget(url);
  if (!target) return undefined;
  try {
    return gate.failure(target.host, target.port);
  } catch {
    return undefined;
  }
}

/**
 * The sentence for a navigation the gate did not carry. `failedUrl` is the
 * request that failed and `askedUrl` the navigation it belongs to; when their
 * hosts differ the page redirected, and the message names both.
 *
 * "refused" is one sentence for a name that does not resolve and for an
 * address the server does not open, as the gate's own answer is: telling
 * them apart would say which names exist on the server's side of its
 * resolver (egress.ts, EGRESS_REFUSAL_REASON).
 *
 * "unreachable" is what a direct browser reported as connection refused,
 * timed out or, over plain http, an empty answer. The gate keeps one record
 * for all of them, so the sentence names them together, in the words of the
 * entries above. Neither sentence says "proxy": no proxy the caller knows of
 * is involved.
 */
export function describeGateFailure(why: Exclude<EgressFailure, "upstream">, failedUrl: string, askedUrl: string = failedUrl): string {
  const host = hostOf(failedUrl, "");
  const asked = hostOf(askedUrl, "");
  const via = host !== asked ? `${asked} redirected to ${host}. ` : "";
  if (why === "refused") {
    return `${via}${host} cannot be reached from the hosted server: its name does not resolve, or it is an address the server does not open (private, local, or the server's own). Check the URL spelling. Nothing was loaded.`;
  }
  const plain = /^http:/i.test(failedUrl);
  return `${via}Connection to ${host} failed: it was refused (nothing is listening there, or a firewall rejected it)${plain ? "," : " or"} it timed out (the host did not answer)${plain ? ", or the host closed the connection without sending a page" : ""}. Check the address and port. Nothing was loaded.`;
}

/**
 * The error for a main-frame request to `failedUrl` that the gate did not
 * carry, or null when the gate's record is not one of the two a caller is
 * told about in plain words: no record, or "upstream" (the configured proxy
 * failed, which keeps the caller's own proxy text).
 */
export function gateNavigationError(gate: GateRecord | null | undefined, failedUrl: string, askedUrl: string = failedUrl): EgressNavigationError | null {
  return markedNavigationError(gateFailure(gate, failedUrl), failedUrl, askedUrl);
}

/**
 * The same error for a reason already in hand: the record's, or the mark on a
 * plain-http answer the gate wrote itself (EGRESS_HEADER in egress-gate.ts).
 * Null for any reason other than the two a caller is told about in plain
 * words.
 */
export function markedNavigationError(why: string | undefined, failedUrl: string, askedUrl: string = failedUrl): EgressNavigationError | null {
  if (why !== "refused" && why !== "unreachable") return null;
  return new EgressNavigationError(describeGateFailure(why, failedUrl, askedUrl), why, failedUrl);
}
