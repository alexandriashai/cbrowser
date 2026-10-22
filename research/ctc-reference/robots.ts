/**
 * robots.txt, as RFC 9309 reads it, for the CTC reference crawl (crawl-v2.ts).
 *
 * The crawl honours robots.txt for every page it loads. This is the subset of
 * RFC 9309 that decides one URL:
 *
 *   - Groups start at one or more `user-agent` lines; the rules that follow
 *     belong to every agent named. A crawler obeys the group whose product
 *     token equals its own (case-insensitive), all such groups merged, and
 *     falls back to the `*` group(s); with neither, everything is allowed.
 *   - `allow` and `disallow` paths match from the start of the URL path plus
 *     query. `*` matches any run of characters and a trailing `$` anchors the
 *     end. The longest matching rule wins; on a tie, allow wins. An empty
 *     `disallow` allows everything.
 *   - `crawl-delay` is not in the RFC, but it is a site asking for a slower
 *     pace, so it is returned for the crawler to honour.
 *
 * Fetch outcomes (RFC 9309 section 2.3.1): a 2xx body is parsed; a 4xx means
 * no robots.txt, so everything is allowed; a 5xx or a network failure means
 * the crawler must assume everything is disallowed. That is the caller's
 * decision (fetchRobots below implements it).
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

export interface RobotsRule { allow: boolean; path: string }
export interface Robots {
  /** "parsed": a 2xx robots.txt; "absent": a 4xx (allow all); "unreachable": 5xx or network failure (disallow all). */
  status: "parsed" | "absent" | "unreachable";
  /** HTTP status or the failure, for the record. */
  detail: string;
  /** The rules that apply to this crawler, after group selection. */
  rules: RobotsRule[];
  /** Seconds, when the selected group(s) asked for one. */
  crawlDelay?: number;
}

/** Parse a robots.txt body and keep the rules for `agent` (a product token, e.g. "cbrowser"). */
export function parseRobots(body: string, agent: string): Pick<Robots, "rules" | "crawlDelay"> {
  const token = agent.toLowerCase();
  interface Group { agents: string[]; rules: RobotsRule[]; crawlDelay?: number }
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of body.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "allow" || key === "disallow") {
      // An empty disallow is "allow everything"; an empty allow says nothing.
      if (value === "") continue;
      current.rules.push({ allow: key === "allow", path: value });
    } else if (key === "crawl-delay") {
      const s = Number(value);
      if (Number.isFinite(s) && s >= 0) current.crawlDelay = s;
    }
  }
  const named = groups.filter((g) => g.agents.some((a) => a !== "*" && a === token));
  const chosen = named.length ? named : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules);
  const delays = chosen.map((g) => g.crawlDelay).filter((d): d is number => d !== undefined);
  return { rules, ...(delays.length ? { crawlDelay: Math.max(...delays) } : {}) };
}

/** A robots path pattern as a regular expression over the URL's path and query. */
function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`);
}

/** Percent-decode only unreserved characters, so /%7Efoo and /~foo compare equal as RFC 9309 asks. */
function normalisePath(p: string): string {
  return p.replace(/%([0-9A-Fa-f]{2})/g, (whole, hex) => {
    const c = String.fromCharCode(parseInt(hex, 16));
    return /[A-Za-z0-9\-._~]/.test(c) ? c : whole.toUpperCase();
  });
}

/** Whether `url` may be fetched under `robots`. */
export function robotsAllows(robots: Robots, url: string): boolean {
  if (robots.status === "absent") return true;
  if (robots.status === "unreachable") return false;
  const u = new URL(url);
  // robots.txt itself is always allowed (RFC 9309 section 2.2.2).
  if (u.pathname === "/robots.txt") return true;
  const target = normalisePath(`${u.pathname}${u.search}`);
  let best: RobotsRule | null = null;
  for (const r of robots.rules) {
    if (!patternToRegExp(normalisePath(r.path)).test(target)) continue;
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow && !best.allow)) best = r;
  }
  return best ? best.allow : true;
}

/**
 * Fetch and parse https://<host>/robots.txt with a timeout, applying RFC
 * 9309's status rules. Redirects are followed (up to fetch's limit), as the
 * RFC allows for at least five hops.
 */
export async function fetchRobots(host: string, agent: string, userAgent: string, timeoutMs: number): Promise<Robots> {
  const once = async (verify: boolean): Promise<Robots> => {
    const res = await fetch(`https://${host}/robots.txt`, {
      headers: { "user-agent": userAgent },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      // Bun's option; used only on the retry below.
      ...(verify ? {} : { tls: { rejectUnauthorized: false } }),
    } as RequestInit);
    const how = verify ? "" : ", certificate not verified";
    if (res.status >= 200 && res.status < 300) {
      const text = await res.text();
      return { status: "parsed", detail: `HTTP ${res.status}${how}`, ...parseRobots(text, agent) };
    }
    if (res.status >= 400 && res.status < 500) return { status: "absent", detail: `HTTP ${res.status}${how}`, rules: [] };
    return { status: "unreachable", detail: `HTTP ${res.status}${how}`, rules: [] };
  };
  const code = (e: unknown) => {
    const err = e as Error & { code?: string; cause?: { code?: string } };
    return err.code ?? err.cause?.code ?? err.name ?? "fetch failed";
  };
  try {
    return await once(true);
  } catch (e) {
    // A server that omits its intermediate certificate loads in a browser
    // (which fetches the missing link) and fails here. The rules are public
    // text, so they are read without verification rather than treating the
    // whole site as disallowed for a fault of this client.
    if (/CERT|SIGNATURE|ISSUER|SELF_SIGNED/i.test(code(e))) {
      try { return await once(false); } catch (e2) { return { status: "unreachable", detail: code(e2), rules: [] }; }
    }
    return { status: "unreachable", detail: code(e), rules: [] };
  }
}
