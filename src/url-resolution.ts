/**
 * Where does this URL actually go?
 *
 * The domain gate ran on the URL the caller typed. `ucdenver.edu` is a
 * registered domain; it 301s to `cudenver.edu`, which is not. So every call in
 * a five-hour session was accepted against the registered domain and then
 * analysed the unregistered one -- reproduced 2026-08-03:
 *
 *   https://www.ucdenver.edu           -> https://www.cudenver.edu/          (1 hop)
 *   https://ucdenver.edu               -> https://www.cudenver.edu/          (2 hops)
 *   https://www.ucdenver.edu/academics -> https://www.cudenver.edu/academics (1 hop)
 *
 * Two separate problems from one cause. Any unregistered domain reachable by
 * redirect from a registered one is analysable at no charge, and the result
 * reports the requested URL while describing a different site.
 *
 * This resolves redirects before the gate decides. It is a network call from
 * the server process to a caller-supplied host, so it is deliberately
 * constrained: http(s) only, no credentials, no cookies, a hop cap, per-hop and
 * overall timeouts, and a refusal to follow into private address space. The
 * browser that runs afterwards is a different egress path with different
 * protections; this one gets its own.
 *
 * Since 2026-11-12 each request goes out through hostedFetch. Before that the
 * first hop was not address-checked at all and later hops only by
 * isPrivateHost, which reads the host as text and never resolves a name. On a
 * hosted server every hop now connects only to an address that was checked
 * (hosted-fetch.ts); isPrivateHost stays as the early check that reads well.
 *
 * Resolution failure returns the input unchanged with `error` set. That is the
 * pre-fix behaviour and it is the safe direction: a gate that DENIED whenever a
 * HEAD was blocked would break every site that rejects HEAD.
 */

import { EgressRefused } from "./egress.js";
import { hostedFetch, refusalKind } from "./hosted-fetch.js";

export interface ResolvedUrl {
  /** Where the URL ends up, or the input if resolution failed. */
  finalUrl: string;
  /** Number of redirects followed. */
  hops: number;
  /** True when the final HOST differs from the requested host. */
  hostChanged: boolean;
  requestedHost: string;
  finalHost: string;
  /** Set when resolution could not complete. `finalUrl` is then the input. */
  error?: string;
}

/** fetch, as far as this file uses it. The default is hostedFetch; tests pass a stand-in. */
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const MAX_HOPS = 5;
const PER_HOP_TIMEOUT_MS = 4000;
const TOTAL_TIMEOUT_MS = 9000;

/**
 * Address space a redirect must never take us into.
 *
 * The browser may legitimately be pointed at localhost for local testing, but
 * a REDIRECT from a public host into private space is the classic SSRF shape
 * and there is no benign reason for the gate to follow it.
 */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // IPv6 loopback and unique-local / link-local. Only for an IPv6 literal
  // (a host name has no colon): the fc and fd prefixes were tested on every
  // host, so fda.gov, fcc.gov and fdic.gov read as private and a redirect to
  // them was refused.
  if (h.includes(":") && (h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80:"))) return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;   // link-local, incl. cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  return false;
}

/** Hostname comparison that treats a subdomain as the same site. */
export function sameSite(a: string, b: string): boolean {
  const x = a.toLowerCase(), y = b.toLowerCase();
  return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
}

/**
 * Follow redirects manually so every hop can be inspected.
 *
 * `redirect: "manual"` rather than `"follow"` is the point: with "follow" the
 * runtime would walk the chain itself and a hop into private space would
 * already have been requested by the time we saw the result.
 */
export async function resolveFinalUrl(
  input: string,
  fetchImpl: FetchLike = hostedFetch,
): Promise<ResolvedUrl> {
  let requestedHost = "";
  try {
    requestedHost = new URL(input).hostname;
  } catch {
    return { finalUrl: input, hops: 0, hostChanged: false, requestedHost: "", finalHost: "", error: "unparseable URL" };
  }
  const base = { requestedHost, finalHost: requestedHost };
  const proto = new URL(input).protocol;
  if (proto !== "http:" && proto !== "https:") {
    return { ...base, finalUrl: input, hops: 0, hostChanged: false, error: `unsupported protocol ${proto}` };
  }

  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  let current = input;
  /** The URL the last followed redirect came from. */
  let previous = input;
  let hops = 0;

  for (; hops <= MAX_HOPS; ) {
    if (Date.now() >= deadline) {
      return { ...base, finalUrl: current, hops, hostChanged: !sameSite(new URL(current).hostname, requestedHost),
        finalHost: new URL(current).hostname, error: "resolution timed out" };
    }
    let res: Response;
    try {
      res = await fetchImpl(current, {
        method: hops === 0 ? "HEAD" : "HEAD",
        redirect: "manual",
        // No cookies, no auth, nothing that could be replayed at the target.
        credentials: "omit",
        headers: { "user-agent": "cbrowser-domain-gate/1 (+https://cbrowser.ai)" },
        signal: AbortSignal.timeout(Math.min(PER_HOP_TIMEOUT_MS, Math.max(1, deadline - Date.now()))),
      } as RequestInit);
    } catch (e) {
      if (e instanceof EgressRefused && refusalKind(e) === "unresolved") {
        // The name gave no address. That is a fetch that failed at this hop,
        // as it was with the runtime's fetch, and not a refusal: reported as
        // one until 2026-11-12, a typo or a DNS outage read in the log as an
        // attempt on the internal network. This text goes to the server's
        // log only, so it may say what the caller's message does not.
        return { ...base, finalUrl: current, hops, hostChanged: !sameSite(new URL(current).hostname, requestedHost),
          finalHost: new URL(current).hostname, error: `fetch failed: the name ${new URL(current).hostname} did not resolve` };
      }
      if (e instanceof EgressRefused) {
        // The address check refused this hop at connection time (or the
        // refusal names no kind, and is read as the stricter one). Reported
        // as a hop blocked by isPrivateHost is: the chain ends at the URL
        // before it, with an error, so the gate falls back to the requested host.
        const refusedHost = new URL(current).hostname;
        if (hops === 0) {
          return { ...base, finalUrl: current, hops, hostChanged: false,
            error: `private address space (${refusedHost}) refused` };
        }
        const finalHost = new URL(previous).hostname;
        return { ...base, finalUrl: previous, hops: hops - 1, finalHost, hostChanged: !sameSite(finalHost, requestedHost),
          error: `redirect into private address space (${refusedHost}) refused` };
      }
      return { ...base, finalUrl: current, hops, hostChanged: !sameSite(new URL(current).hostname, requestedHost),
        finalHost: new URL(current).hostname, error: `fetch failed: ${(e as Error).message}` };
    }

    const location = res.headers.get("location");
    const isRedirect = res.status >= 300 && res.status < 400 && !!location;
    if (!isRedirect) {
      // A server that rejects HEAD is not a redirect and not an error; it is
      // simply the end of the chain as far as this check can see.
      const finalHost = new URL(current).hostname;
      return { ...base, finalUrl: current, hops, finalHost, hostChanged: !sameSite(finalHost, requestedHost) };
    }

    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      const finalHost = new URL(current).hostname;
      return { ...base, finalUrl: current, hops, finalHost, hostChanged: !sameSite(finalHost, requestedHost),
        error: "unparseable Location header" };
    }
    if (next.protocol !== "http:" && next.protocol !== "https:") {
      const finalHost = new URL(current).hostname;
      return { ...base, finalUrl: current, hops, finalHost, hostChanged: !sameSite(finalHost, requestedHost),
        error: `redirect to unsupported protocol ${next.protocol}` };
    }
    if (isPrivateHost(next.hostname)) {
      const finalHost = new URL(current).hostname;
      return { ...base, finalUrl: current, hops, finalHost, hostChanged: !sameSite(finalHost, requestedHost),
        error: `redirect into private address space (${next.hostname}) refused` };
    }
    previous = current;
    current = next.toString();
    hops++;
  }

  const finalHost = new URL(current).hostname;
  return { ...base, finalUrl: current, hops, finalHost, hostChanged: !sameSite(finalHost, requestedHost),
    error: `more than ${MAX_HOPS} redirects` };
}
