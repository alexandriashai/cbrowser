/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Which addresses a hosted server may connect to.
 *
 * The hosted servers judged a caller's URL before the browser connected, per
 * tool and once at navigate. Nothing judged the address at the moment of
 * connection, so a redirect, a subresource, a frame, a websocket, or a name
 * that answered differently on a second lookup was never checked, and the
 * machine's own public address passed as public (P-10, plan of 2026-11-07).
 *
 * This module is the one answer to "may this machine connect to that
 * address": a global unicast address that is not one of the machine's own.
 * The egress gate (egress-gate.ts) asks it for every connection a hosted
 * browser makes, hostedFetch (hosted-fetch.ts) for every server-side request
 * to a caller's URL, and the hosted proxy check (proxyAddresses in
 * mcp-tools/hosted-inputs.ts) for a caller's proxy. All three go through
 * resolveForEgress and connect to an address it returned.
 *
 * THE LOOKUP. A name is looked up with node:dns's Resolver (c-ares), one
 * Resolver per lookup, and not with dns.lookup. dns.lookup is getaddrinfo on
 * libuv's thread pool, which runs two lookups at a time for the whole
 * process; giving up on one after ten seconds freed nothing, so a page with a
 * few names whose name server stayed silent made every other account's
 * lookups wait and fail (review of 2026-11-12: regression-1, gate-bypass-3,
 * policy-1). Measured on 2026-11-12 under Node 22.19.0 and Bun 1.4.4, in a
 * private network namespace with a UDP stand-in as the name server: with all
 * four pool threads busy a c-ares lookup took 0 ms where dns.lookup took
 * 1,580 ms (Node); with 40 silent names in flight a healthy name answered in
 * 0 ms; cancel() rejected both pending questions at once and no further
 * query was sent; 2,000 lookups on 2,000 Resolvers left no socket open.
 *
 * What c-ares answers differently from getaddrinfo (same measurement). The
 * answer is judged by the same rule either way, and the caller connects only
 * to an address from the answer, so none of these opens anything:
 *  - It does not read /etc/hosts. A name that exists only there is asked of
 *    the name server. Where the name server is systemd-resolved's stub (this
 *    machine, checked the same day) the stub answers such names itself.
 *  - "localhost" and names under it would be asked of the name server too.
 *    They are answered here with the loopback addresses and no query (RFC
 *    6761), which is what getaddrinfo gave.
 *  - Numeric spellings that getaddrinfo reads as an address (2130706433,
 *    0x7f.1, 127.1, 0177.0.0.1: all 127.0.0.1 there) are asked as names and
 *    get no answer. The URL parser turns them into an address before they
 *    arrive here in any case.
 *  - The search list of resolv.conf is not applied: the name is asked as
 *    written. A trailing dot and capitals make no difference.
 *  - A CNAME chain is followed by the name server; the addresses at its end
 *    come back, as with getaddrinfo.
 *  - A name with no record of one family is ENODATA under Node and ENOTFOUND
 *    under Bun; both mean "nothing of this family" here.
 *  - Node converts a name with non-ASCII letters to its xn-- form before
 *    asking and Bun does not ask at all, so the conversion is done here.
 *  - IPv4 answers come first, then IPv6 (getaddrinfo put IPv6 first). Callers
 *    try or race the addresses in the order given.
 *
 * Around the system lookup (and only there: a resolver passed in by a caller
 * or a test is called as given, every time) sits cachedResolver: one lookup
 * in flight per name, a short memory of the answer, and a ceiling on lookups
 * in flight, for the whole process and for each owner (one gate, one
 * hostedFetch call chain).
 */

import { isIP } from "node:net";
import { Resolver } from "node:dns/promises";
import { networkInterfaces } from "node:os";
import { openSync, readSync, closeSync } from "node:fs";
import { domainToASCII } from "node:url";

/** Every address a name stands for. A parameter so a test can answer as a rebinding name would. */
export type EgressResolver = (host: string) => Promise<string[]>;

export interface EgressPolicy {
  /**
   * Replaces the system lookup. Called as given for every name: no sharing,
   * no memory, no ceiling. A resolver made by cachedResolver is also handed
   * `owner`, as the system lookup is.
   */
  resolve?: EgressResolver;
  /** Replaces the whole address decision (classifier and own-address check). */
  allow?: (ip: string) => boolean;
  /** How long a lookup may take before the name counts as not resolving. Default LOOKUP_TIMEOUT_MS. */
  lookupTimeoutMs?: number;
  /**
   * Who is asking: one egress gate (one browser) or one hostedFetch call
   * chain. The system lookup gives each owner only a share of its places, so
   * one browser aimed at slow names cannot use up the places every other
   * account's lookups need. Compared by identity; undefined shares the
   * process-wide pool only.
   */
  owner?: object;
}

/**
 * The machine's own addresses. `v4` holds single IPv4 addresses and `v6` the
 * first four groups (the /64) of IPv6 addresses; the two range lists hold
 * what was given with a prefix length that is not /32 or /64.
 */
export interface OwnAddresses {
  v4: ReadonlySet<string>;
  v6: ReadonlySet<string>;
  /** First and last address of each IPv4 range, as 32-bit numbers. */
  v4Ranges: ReadonlyArray<readonly [number, number]>;
  /** The eight groups of an address in each IPv6 range and how many leading bits count. */
  v6Ranges: ReadonlyArray<{ readonly groups: readonly number[]; readonly bits: number }>;
}

/** Thrown by hostedFetch, and the reason the gate answers 403 with. */
export class EgressRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EgressRefused";
  }
}

// The limits a hosted server runs with. No caller in src overrides any of
// them, so they are exported and their values are pinned by
// tests/egress-policy.test.ts and tests/egress-lookup.test.ts: a limit that
// only ever ran under a test's own value could be removed unnoticed (review
// of 2026-11-12, tests-2).

/** How long resolveForEgress waits for a lookup, and the longest a system lookup runs before it is cancelled. */
export const LOOKUP_TIMEOUT_MS = 10_000;
/**
 * c-ares's wait for the first try, and its number of tries. Measured on
 * 2026-11-12 (Node 22.19.0 and Bun 1.4.4) against a name server that never
 * answers: 2,000 ms and 2 tries send two queries and give up after 6.0 s.
 */
export const LOOKUP_TRY_MS = 2_000;
export const LOOKUP_TRIES = 2;
/** How long an answer is remembered, and how long "no answer" is. */
export const LOOKUP_ANSWER_TTL_MS = 30_000;
export const LOOKUP_NO_ANSWER_TTL_MS = 5_000;
/** How many names are remembered; the oldest is dropped for a new one. */
export const LOOKUP_CACHE_NAMES = 2_000;
/** How many system lookups run at once, how many more may wait for a place, and for how long. */
export const LOOKUP_IN_FLIGHT = 192;
export const LOOKUP_WAITING = 512;
export const LOOKUP_WAIT_MS = 3_000;
/**
 * How many of those one owner may hold: lookups running, and lookups waiting
 * for a place. A browser keeps up to 32 proxy sockets busy, so without a share
 * per owner one browser aimed at slow names took every place in the process
 * and another account's new name was refused (review of 2026-11-12, lookup-1).
 */
export const LOOKUP_OWNER_IN_FLIGHT = 8;
export const LOOKUP_OWNER_WAITING = 24;
/**
 * The most addresses an answer may hold and still be remembered. A larger one
 * is judged and used for the call that asked, and not kept: a zone answering
 * every name with a full 64 KB message (about 6,400 addresses) held about
 * 0.5 GB of heap across 2,000 names, after the answers had expired (review of
 * 2026-11-12, lookup-2).
 */
export const LOOKUP_REMEMBERED_ADDRESSES = 64;
/** How long a reading of the machine's own addresses is used. */
export const OWN_ADDRESSES_TTL_MS = 30_000;

/** The eight 16-bit groups of an IPv6 address (a trailing dotted IPv4 part allowed), or null. */
export function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[(.*)\]$/, "$1").replace(/%.*$/, "");
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (dotted) {
    if (isIP(dotted[1]) !== 4) return null;
    const [a, b, c, d] = dotted[1].split(".").map(Number);
    s = s.slice(0, -dotted[1].length) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...tail].map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return groups.length === 8 && groups.every((g) => g >= 0) ? groups : null;
}

/**
 * An address as the thing a connection to it reaches: an IPv4 address, also
 * when it is written inside IPv6 as v4-mapped (::ffff:a.b.c.d) or NAT64
 * (64:ff9b::a.b.c.d), or the eight groups of any other IPv6 address. Null for
 * text that is not an address.
 */
function reach(ip: string): { v4: string } | { v6: number[] } | null {
  if (isIP(ip) === 4) return { v4: ip };
  // Only what the platform's own parser takes as an address is judged as one,
  // and brackets belong to IPv6 alone. The group parser below is lenient:
  // "2600::f1.2.3.4", "[8.8.8.8]", an empty zone id and "::" standing for no
  // group at all each read as an allowed address before this line was here
  // (tests/egress-policy.test.ts, 2026-11-12).
  const bare = ip.replace(/^\[(.*)\]$/, "$1");
  if (isIP(bare) !== 6) return null;
  const g = v6Groups(bare);
  if (!g) return null;
  const mapped = g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff;
  const nat64 = g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0);
  if (mapped || nat64) return { v4: `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}` };
  return { v6: g };
}

/**
 * IPv4 global unicast: not "this network" (0/8), private (10/8, 172.16/12,
 * 192.168/16), shared (100.64/10), loopback (127/8), link-local (169.254/16),
 * protocol assignments (192.0.0/24), documentation (192.0.2/24, 198.51.100/24,
 * 203.0.113/24), the 6to4 relay (192.88.99/24), benchmarking (198.18/15),
 * multicast or reserved (224 and above).
 */
function globalV4(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

/**
 * IPv6 global unicast: inside 2000::/3 and not a special block there
 * (2001::/23 protocol assignments, which holds Teredo; 2001:db8::/32 and
 * 3fff::/20 documentation; 2002::/16 6to4, which names an IPv4 address).
 * Everything outside 2000::/3 is refused: unspecified, loopback, the
 * deprecated v4-compatible form, unique local, link-local, site-local,
 * multicast, discard-only.
 */
function globalV6(g: number[]): boolean {
  if ((g[0] & 0xe000) !== 0x2000) return false;
  if (g[0] === 0x2001 && g[1] < 0x0200) return false;
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false;
  if (g[0] === 0x2002) return false;
  if (g[0] === 0x3fff && g[1] < 0x1000) return false;
  return true;
}

const v6Prefix = (g: readonly number[]): string => g.slice(0, 4).join(":");
const v4Number = (v4: string): number => v4.split(".").reduce((n, octet) => n * 256 + Number(octet), 0);

/** Do two IPv6 addresses agree in their first `bits` bits? */
function sameLeadingBits(a: readonly number[], b: readonly number[], bits: number): boolean {
  for (let i = 0; i < 8 && bits > 0; i++, bits -= 16) {
    const mask = bits >= 16 ? 0xffff : (0xffff << (16 - bits)) & 0xffff;
    if ((a[i] & mask) !== (b[i] & mask)) return false;
  }
  return true;
}

type OwnEntry = { v4: readonly [number, number] } | { v6: number[]; bits: number };

/**
 * One entry of an own-address list: an address, or an address and a prefix
 * length, which names the whole range the address lies in (198.50.100.8/29 is
 * .8 to .15). An IPv6 address without a prefix length stands for its /64: a
 * server is routed the /64 it has an address in, and any address of it may be
 * bound later. An IPv4 address written inside IPv6 counts its prefix length
 * in IPv6 bits, of which the last 32 are the IPv4 address. Null for text
 * that is neither.
 *
 * Until 2026-11-12 a prefix length was dropped and the one address kept, so
 * an operator who wrote a routed block protected its first address only
 * (review, policy-4).
 */
function ownEntry(text: string): OwnEntry | null {
  const t = text.trim();
  const slash = t.indexOf("/");
  const address = slash < 0 ? t : t.slice(0, slash);
  const prefix = slash < 0 ? undefined : t.slice(slash + 1);
  if (prefix !== undefined && !/^(0|[1-9]\d{0,2})$/.test(prefix)) return null;
  const r = reach(address);
  if (!r) return null;
  if ("v4" in r) {
    const bits = prefix === undefined ? 32 : Number(prefix) - (isIP(address) === 4 ? 0 : 96);
    if (bits < 0 || bits > 32) return null;
    const size = 2 ** (32 - bits);
    const first = Math.floor(v4Number(r.v4) / size) * size;
    return { v4: [first, first + size - 1] };
  }
  const bits = prefix === undefined ? 64 : Number(prefix);
  return bits > 128 ? null : { v6: r.v6, bits };
}

const v4Dotted = (n: number): string => [n / 2 ** 24, n / 2 ** 16, n / 2 ** 8, n].map((x) => Math.floor(x) % 256).join(".");

/**
 * The own-address set from a list of addresses and ranges (interfaces, the
 * kernel's local table, configured ones). Text that is neither is skipped
 * here; ownAddresses() refuses to skip a configured entry it cannot read.
 */
export function ownAddressesFrom(addresses: Iterable<string>): OwnAddresses {
  const v4 = new Set<string>();
  const v6 = new Set<string>();
  const v4Ranges: Array<readonly [number, number]> = [];
  const v6Ranges: Array<{ groups: number[]; bits: number }> = [];
  for (const text of addresses) {
    const entry = ownEntry(text);
    if (!entry) continue;
    if ("v4" in entry) {
      if (entry.v4[0] === entry.v4[1]) v4.add(v4Dotted(entry.v4[0]));
      else v4Ranges.push(entry.v4);
    } else if (entry.bits === 64) v6.add(v6Prefix(entry.v6));
    else v6Ranges.push({ groups: entry.v6, bits: entry.bits });
  }
  return { v4, v6, v4Ranges, v6Ranges };
}

/**
 * The shortest prefix a range read from the kernel may have, per family. A
 * wider LOCAL route is far more likely a routing trick than a block of
 * addresses this machine owns, and taking it would refuse a large part of the
 * internet; an operator who does own such a block names it in
 * CBROWSER_OWN_ADDRESSES. 127.0.0.0/8 is /8 and so is taken.
 */
const KERNEL_V4_MIN_PREFIX = 8;
const KERNEL_V6_MIN_PREFIX = 32;
const kernelRangesSaid = new Set<string>();

/** Writes once per range, to the error log, that a kernel range was too wide to take. */
function sayKernelRangeSkipped(range: string, min: number): void {
  if (kernelRangesSaid.has(range) || kernelRangesSaid.size >= 256) return;
  kernelRangesSaid.add(range);
  console.error(`[egress] the kernel lists ${range} as local; a range wider than /${min} is not taken as this machine's own. Name it in CBROWSER_OWN_ADDRESSES if it is.`);
}

/**
 * The IPv4 addresses the kernel answers on, from the text of
 * /proc/net/fib_trie: every leaf marked LOCAL in the "Local:" table. A LOCAL
 * leaf with a shorter prefix than /32 (127.0.0.0 /8, or a block routed to the
 * machine with "ip route add local") comes back as a range; one shorter than
 * /8 is left out and reported once.
 *
 * The file prints every routing table under a header line ("Main:",
 * "Local:", "Id 100:"). Only the local table holds what the machine answers
 * for every packet. A LOCAL route in a policy table, as a transparent proxy
 * sets one up ("ip route add local 0.0.0.0/0 dev lo table 100"), applies only
 * to the packets a rule sends there; read as own it made all of IPv4 this
 * machine's, and every connection was refused (review of 2026-11-12,
 * lookup-3).
 */
export function localV4FromFibTrie(text: string): string[] {
  const out = new Set<string>();
  let leaf: string | undefined;
  let inLocal = false;
  for (const line of text.split("\n")) {
    const header = /^(\S[^:]*):\s*$/.exec(line);
    if (header) {
      inLocal = header[1] === "Local";
      leaf = undefined;
      continue;
    }
    const isLeaf = /^\s*\|--\s+(\d+\.\d+\.\d+\.\d+)\s*$/.exec(line);
    if (isLeaf) {
      leaf = isLeaf[1];
      continue;
    }
    const local = /^\s*\/(\d+)\s+\S+\s+LOCAL\b/.exec(line);
    if (local && leaf && inLocal) {
      const bits = Number(local[1]);
      if (bits < KERNEL_V4_MIN_PREFIX) sayKernelRangeSkipped(`${leaf}/${bits}`, KERNEL_V4_MIN_PREFIX);
      else out.add(bits === 32 ? leaf : `${leaf}/${bits}`);
    } else if (!/^\s*\/\d+\s/.test(line)) leaf = undefined;
  }
  return [...out];
}

/** RTF_LOCAL in the flags column of /proc/net/ipv6_route: a route the kernel answers itself. */
const RTF_LOCAL = 0x80000000;

/**
 * The IPv6 ranges the kernel answers on, from the text of
 * /proc/net/ipv6_route: every route whose flags hold RTF_LOCAL, as
 * address/prefix. A block routed to the machine with "ip -6 route add local"
 * is on no interface, so /proc/net/if_inet6 does not list it and the kernel
 * still answers a connection to any address in it (review of 2026-11-12,
 * lookup-4).
 *
 * The file lists the routes of every table and does not say which; checked
 * on 6.8.0 on 2026-11-12, it held the same local routes as "ip -6 route show
 * table all type local", a policy table's included. So a local route in a
 * policy table is taken too, unlike IPv4, but only one of /32 or longer: a
 * wider one, ::/0 as a transparent proxy sets it, is left out and reported
 * once.
 */
export function localV6FromIpv6Route(text: string): string[] {
  const out = new Set<string>();
  for (const line of text.split("\n")) {
    const route = /^\s*([0-9a-f]{32}) ([0-9a-f]{2}) [0-9a-f]{32} [0-9a-f]{2} [0-9a-f]{32} [0-9a-f]{8} [0-9a-f]{8} [0-9a-f]{8} ([0-9a-f]{8})\s/i.exec(line);
    if (!route || (parseInt(route[3], 16) & RTF_LOCAL) === 0) continue;
    const range = `${(route[1].match(/.{4}/g) as string[]).join(":")}/${parseInt(route[2], 16)}`;
    if (parseInt(route[2], 16) < KERNEL_V6_MIN_PREFIX) sayKernelRangeSkipped(range, KERNEL_V6_MIN_PREFIX);
    else out.add(range);
  }
  return [...out];
}

/** The IPv6 addresses configured on any interface, from the text of /proc/net/if_inet6. */
export function v6FromIfInet6(text: string): string[] {
  const out = new Set<string>();
  for (const line of text.split("\n")) {
    const hex = /^\s*([0-9a-f]{32})\s/i.exec(line);
    if (hex) out.add((hex[1].match(/.{4}/g) as string[]).join(":"));
  }
  return [...out];
}

const KERNEL_TABLE_MAX_BYTES = 4 * 1024 * 1024;

/** A file of at most 4 MB as text, or null when it cannot be read or is larger (a router's full table). */
function readBounded(path: string): string | null {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const chunk = Buffer.allocUnsafe(64 * 1024);
      const n = readSync(fd, chunk, 0, chunk.length, null);
      if (n <= 0) break;
      total += n;
      if (total > KERNEL_TABLE_MAX_BYTES) return null;
      chunks.push(chunk.subarray(0, n));
    }
    return Buffer.concat(chunks).toString("latin1");
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* nothing to do about a failed close */ }
    }
  }
}

/**
 * The addresses the Linux kernel itself counts as this machine's.
 * os.networkInterfaces() leaves out an interface that is not up and running
 * (a bridge with no ports, a card with no link), while the kernel keeps its
 * address in the local table and answers a connection to it from this
 * machine. Measured here on 2026-11-12: two docker bridges without carrier
 * were in /proc/net/fib_trie and missing from networkInterfaces() (review,
 * policy-3). Three files are read: the IPv4 local table (fib_trie), the IPv6
 * interface addresses (if_inet6), and the IPv6 local routes (ipv6_route). A
 * file that cannot be read, or is larger than 4 MB (a router holding a full
 * table), adds nothing, and the rest is used. `read` is a parameter for the
 * tests.
 */
export function kernelLocalAddresses(read: (path: string) => string | null = readBounded): string[] {
  if (read === readBounded && process.platform !== "linux") return [];
  const out: string[] = [];
  try {
    const trie = read("/proc/net/fib_trie");
    if (trie) out.push(...localV4FromFibTrie(trie));
    const inet6 = read("/proc/net/if_inet6");
    if (inet6) out.push(...v6FromIfInet6(inet6));
    const routes6 = read("/proc/net/ipv6_route");
    if (routes6) out.push(...localV6FromIpv6Route(routes6));
  } catch { /* the interface list alone is used */ }
  return out;
}

const OWN_ENV = "CBROWSER_OWN_ADDRESSES";

/**
 * The entries of CBROWSER_OWN_ADDRESSES. Throws for an entry that is not an
 * address or a range: until 2026-11-12 such an entry was dropped without a
 * word, so a list typed with ";" or a host name left the addresses it was
 * meant to protect allowed (review, policy-4).
 */
function configuredOwnAddresses(): string[] {
  const out: string[] = [];
  for (const entry of (process.env[OWN_ENV] ?? "").split(",")) {
    const text = entry.trim();
    if (!text) continue;
    if (!ownEntry(text)) {
      throw new Error(`${OWN_ENV}: ${JSON.stringify(text)} is not an IP address or a range. An entry is an IPv4 or IPv6 address, optionally followed by /N, and entries are separated by commas.`);
    }
    out.push(text);
  }
  return out;
}

let ownCache: { at: number; own: OwnAddresses } | undefined;

/**
 * This machine's addresses: every interface address, every address and range
 * of the kernel's IPv4 local table and every IPv6 local route (Linux; ranges
 * wider than /8 and /32 left out, see localV4FromFibTrie and
 * localV6FromIpv6Route), plus the comma-separated
 * CBROWSER_OWN_ADDRESSES for an address or a range (a.b.c.d/N, IPv6/N) that
 * reaches the machine without being on an interface (a NAT or load balancer
 * in front of it, a routed block). Read again after 30 seconds, since
 * container bridges come and go, and at once when the clock reads earlier
 * than the last reading: a clock set back must not keep an old set in use
 * until it catches up.
 *
 * Throws when an entry of CBROWSER_OWN_ADDRESSES cannot be read.
 * allowedEgressAddress and resolveForEgress then refuse every address, and
 * the server can call checkOwnAddressConfig at start to say so early.
 * `now` and `kernel` are parameters for the tests: a machine whose interfaces
 * are all up cannot otherwise show that the kernel's table is read.
 */
export function ownAddresses(now: number = Date.now(), kernel: () => string[] = () => kernelLocalAddresses()): OwnAddresses {
  if (ownCache && now >= ownCache.at && now - ownCache.at < OWN_ADDRESSES_TTL_MS) return ownCache.own;
  // A reading that fails leaves no older reading behind to be served in its place.
  ownCache = undefined;
  const configured = configuredOwnAddresses();
  const found: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const entry of list ?? []) found.push(entry.address);
  }
  found.push(...kernel(), ...configured);
  ownCache = { at: now, own: ownAddressesFrom(found) };
  return ownCache.own;
}

/**
 * For the server to call when it starts: reads the own addresses afresh and
 * returns how many IPv4 and IPv6 entries (addresses, /64s and ranges) the
 * set holds. Throws, naming the variable and the entry, when
 * CBROWSER_OWN_ADDRESSES has an entry that is not an address or a range.
 */
export function checkOwnAddressConfig(): { v4: number; v6: number } {
  ownCache = undefined;
  const own = ownAddresses();
  return { v4: own.v4.size + own.v4Ranges.length, v6: own.v6.size + own.v6Ranges.length };
}

let ownErrorSaid = "";

/**
 * May a hosted server connect to `ip`? Only to a global unicast address that
 * is not one of the machine's own. Text that is not an address: no. When the
 * own addresses cannot be read (a bad entry in CBROWSER_OWN_ADDRESSES): no,
 * for every address, and the reason goes to the error log once. It never
 * throws: the egress gate calls it from socket callbacks, where an exception
 * would stop the whole server.
 */
export function allowedEgressAddress(ip: string, own?: OwnAddresses): boolean {
  if (typeof ip !== "string") return false;
  let set = own;
  if (!set) {
    try {
      set = ownAddresses();
    } catch (error) {
      const said = error instanceof Error ? error.message : String(error);
      if (said !== ownErrorSaid) {
        ownErrorSaid = said;
        console.error(`[egress] every address is refused until this is corrected: ${said}`);
      }
      return false;
    }
  }
  const r = reach(ip);
  if (!r) return false;
  if ("v4" in r) {
    if (!globalV4(r.v4) || set.v4.has(r.v4)) return false;
    if (set.v4Ranges.length === 0) return true;
    const n = v4Number(r.v4);
    return !set.v4Ranges.some(([first, last]) => n >= first && n <= last);
  }
  const g = r.v6;
  return globalV6(g) && !set.v6.has(v6Prefix(g)) && !set.v6Ranges.some((range) => sameLeadingBits(range.groups, g, range.bits));
}

let testPolicy: EgressPolicy | null = null;

/**
 * For tests only: replace the lookup and the address decision for the whole
 * process, or pass null to put the real ones back. Nothing in src calls it
 * (tests/egress-policy.test.ts scans src for a call).
 */
export function setEgressPolicyForTests(policy: EgressPolicy | null): void {
  testPolicy = policy;
}

export interface SystemLookupOptions {
  /** c-ares's wait for the first try. Default LOOKUP_TRY_MS. */
  tryMs?: number;
  /** c-ares's number of tries. Default LOOKUP_TRIES. */
  tries?: number;
  /** When the lookup is cancelled, whatever c-ares is doing. Default LOOKUP_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Name servers to ask in place of the system's. For tests: a stand-in on 127.0.0.1. */
  servers?: string[];
}

/** "Nothing of this family": ENODATA under Node, ENOTFOUND under Bun, and ENOTFOUND under both for a name that does not exist. */
const noRecord = (code: unknown): boolean => code === "ENODATA" || code === "ENOTFOUND";

/**
 * Every address of a name, asked of the system's name servers through c-ares
 * (see the header for why not getaddrinfo, and for what differs). A and AAAA
 * are asked at the same time on a Resolver of their own, and the answer is
 * the IPv4 addresses followed by the IPv6 ones; one family failing does not
 * matter when the other answers. An empty list: the name has no address.
 * Rejects when neither family answered for another reason (no reply in time,
 * a server failure). When `timeoutMs` passes the Resolver is cancelled, so
 * nothing is left running, and the promise rejects whether or not the
 * cancelling settled the questions.
 */
/** Whether any UTF-16 unit of `text` lies in [low, high]. Written as a loop: a pattern with \x00 in it trips no-control-regex. */
function hasCharIn(text: string, low: number, high: number): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= low && c <= high) return true;
  }
  return false;
}

/** Whether any UTF-16 unit of `text` lies outside [low, high]. */
function hasCharOutside(text: string, low: number, high: number): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < low || c > high) return true;
  }
  return false;
}

export async function systemLookup(host: string, options: SystemLookupOptions = {}): Promise<string[]> {
  // The xn-- form of a name with non-ASCII letters. An ASCII name is asked as
  // written: the same conversion would turn 2130706433 into 127.0.0.1.
  const name = hasCharOutside(host, 0x00, 0x7f) ? domainToASCII(host) : host;
  if (!name || isIP(name)) return [];
  // No host name holds a space or a control character. Node's binding hands
  // the name to c-ares as a C string, so "a\0.example" was asked as "a"
  // (measured 2026-11-12, Node 22.19.0); such a name is not asked at all.
  if (hasCharIn(name, 0x00, 0x20) || name.includes("\x7f")) return [];
  if (/(^|\.)localhost\.?$/i.test(name)) return ["127.0.0.1", "::1"];
  const resolver = new Resolver({ timeout: options.tryMs ?? LOOKUP_TRY_MS, tries: options.tries ?? LOOKUP_TRIES });
  if (options.servers) resolver.setServers(options.servers);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try { resolver.cancel(); } catch { /* the rejection below ends the wait either way */ }
      reject(new Error("the lookup was cancelled at its time limit"));
    }, options.timeoutMs ?? LOOKUP_TIMEOUT_MS);
  });
  // Each question starts inside an async function, so a resolver that throws
  // on the spot for one family leaves no promise of the other unattended.
  const ask = async (family: 4 | 6): Promise<string[]> => (family === 4 ? resolver.resolve4(name) : resolver.resolve6(name));
  try {
    const [v4, v6] = await Promise.race([Promise.allSettled([ask(4), ask(6)]), limit]);
    const addresses = [...(v4.status === "fulfilled" ? v4.value : []), ...(v6.status === "fulfilled" ? v6.value : [])];
    if (addresses.length > 0) return addresses;
    const failed = [v4, v6].filter((s): s is PromiseRejectedResult => s.status === "rejected").map((s) => (s.reason as { code?: unknown } | null)?.code);
    if (failed.every(noRecord)) return [];
    throw new Error(`the lookup failed: ${failed.join(", ")}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface LookupCacheOptions {
  /** How long an answer is remembered. Default LOOKUP_ANSWER_TTL_MS. */
  answerTtlMs?: number;
  /** How long "no answer" (none, or a failed lookup) is remembered. Default LOOKUP_NO_ANSWER_TTL_MS. */
  noAnswerTtlMs?: number;
  /** How many names are remembered. Default LOOKUP_CACHE_NAMES. */
  maxNames?: number;
  /** How many lookups run at once. Default LOOKUP_IN_FLIGHT. */
  maxInFlight?: number;
  /** How many more may wait for a place. Default LOOKUP_WAITING. */
  maxWaiting?: number;
  /** How long one waits for a place. Default LOOKUP_WAIT_MS. */
  maxWaitMs?: number;
  /** How many lookups one owner may have running. Default LOOKUP_OWNER_IN_FLIGHT. */
  ownerInFlight?: number;
  /** How many more one owner may have waiting for a place. Default LOOKUP_OWNER_WAITING. */
  ownerWaiting?: number;
  /** The most addresses an answer may hold and be remembered. Default LOOKUP_REMEMBERED_ADDRESSES. */
  maxRememberedAddresses?: number;
  /** The clock. For tests. */
  now?: () => number;
}

export interface CachedResolver {
  /** Every address of `host`. `owner` is who asks (EgressPolicy.owner); without one only the process-wide limits apply. */
  (host: string, owner?: object): Promise<string[]>;
  /** The limits in force. */
  readonly limits: Readonly<Required<Omit<LookupCacheOptions, "now">>>;
  /** Names remembered, lookups running, lookups waiting for a place. */
  stats(): { cached: number; inFlight: number; waiting: number };
  /** The lookups one owner has running and waiting. A name it joined another owner's lookup for is not counted. */
  ownerStats(owner: object): { inFlight: number; waiting: number };
  /** Forget every remembered answer. */
  clear(): void;
}

/** The resolvers cachedResolver made: resolveForEgress hands these the owner. */
const cachedResolvers = new WeakSet<object>();

/**
 * A resolver with three things around it.
 *
 * One lookup in flight per name: forty requests for one name are one lookup.
 *
 * A short memory of the ADDRESSES a name gave, never of a verdict: the
 * address decision runs on every call, since the own-address set changes.
 * Remembering is safe because a caller connects only to an address from the
 * answer it was handed; a name whose record changes within the 30 seconds is
 * still judged, and connected to, by the answer in hand. "No answer" is
 * remembered for 5 seconds, a failed lookup included, so a page that keeps
 * asking for a dead name costs one lookup per 5 seconds. An answer of more
 * than 64 addresses is not remembered, and answers whose time is up are
 * dropped from the oldest end whenever one is added, so the memory holds at
 * most 2,000 names of 64 addresses each.
 *
 * A ceiling on lookups in flight, with a short queue behind it, for the whole
 * process and for each owner (EgressPolicy.owner: one gate, one hostedFetch
 * call chain). A name that finds no room, or waits too long, is rejected and
 * nothing is remembered for it: it was never asked. resolveForEgress refuses
 * such a name as unresolved. An owner's share is 8 running and 8 waiting, and
 * past that only its own new names are refused, at once. Asking for a name
 * another owner's lookup is already running for, or waiting with, costs
 * nothing; and when such a name waits only because its first owner is at its
 * own limit, it starts as soon as an owner with room asks for it. A place
 * that frees goes to the waiting name whose owner holds the fewest lookups,
 * the one that waited longest on a tie, so owners that filled the process's
 * places do not keep a newcomer behind their queue. A lookup with no owner is
 * held to the process-wide limits only, and counts as holding none.
 */
export function cachedResolver(resolve: EgressResolver, options: LookupCacheOptions = {}): CachedResolver {
  const limits = {
    answerTtlMs: options.answerTtlMs ?? LOOKUP_ANSWER_TTL_MS,
    noAnswerTtlMs: options.noAnswerTtlMs ?? LOOKUP_NO_ANSWER_TTL_MS,
    maxNames: options.maxNames ?? LOOKUP_CACHE_NAMES,
    maxInFlight: options.maxInFlight ?? LOOKUP_IN_FLIGHT,
    maxWaiting: options.maxWaiting ?? LOOKUP_WAITING,
    maxWaitMs: options.maxWaitMs ?? LOOKUP_WAIT_MS,
    ownerInFlight: options.ownerInFlight ?? LOOKUP_OWNER_IN_FLIGHT,
    ownerWaiting: options.ownerWaiting ?? LOOKUP_OWNER_WAITING,
    maxRememberedAddresses: options.maxRememberedAddresses ?? LOOKUP_REMEMBERED_ADDRESSES,
  };
  const now = options.now ?? Date.now;
  type Who = object | undefined;
  /** A name waiting for a place, with every owner that asked for it while it waited. */
  interface Ticket { owners: Who[]; starter: Who; go: (who: Who) => void; timer: ReturnType<typeof setTimeout> }
  interface Pending { promise: Promise<string[]>; ticket?: Ticket; refused?: true }
  const cache = new Map<string, { addresses: string[]; at: number; until: number }>();
  const shared = new Map<string, Pending>();
  const queue: Ticket[] = [];
  // Keyed by the owner object, so an owner that is gone (a closed gate) leaves nothing behind.
  const owned = new WeakMap<object, { running: number; waiting: number }>();
  let running = 0;

  const stateOf = (who: object): { running: number; waiting: number } => {
    let state = owned.get(who);
    if (!state) {
      state = { running: 0, waiting: 0 };
      owned.set(who, state);
    }
    return state;
  };
  const runningOf = (who: Who): number => (who ? (owned.get(who)?.running ?? 0) : 0);
  const hasRoom = (who: Who): boolean => !who || runningOf(who) < limits.ownerInFlight;
  const take = (who: Who): void => {
    running++;
    if (who) stateOf(who).running++;
  };
  const stopWaiting = (ticket: Ticket): void => {
    clearTimeout(ticket.timer);
    if (ticket.starter) stateOf(ticket.starter).waiting--;
  };
  // Hands the free places to waiting names, each to the name whose owner with
  // room holds the fewest lookups, the earliest on a tie.
  const dispatch = (): void => {
    while (running < limits.maxInFlight && queue.length > 0) {
      let best = -1;
      let bestWho: Who;
      let bestLoad = Infinity;
      for (let i = 0; i < queue.length && bestLoad > 0; i++) {
        for (const who of queue[i].owners) {
          const load = runningOf(who);
          if (hasRoom(who) && load < bestLoad) {
            best = i;
            bestWho = who;
            bestLoad = load;
          }
        }
      }
      if (best < 0) return;
      const [ticket] = queue.splice(best, 1);
      stopWaiting(ticket);
      take(bestWho);
      ticket.go(bestWho);
    }
  };
  const leave = (who: Who): void => {
    running--;
    if (who) stateOf(who).running--;
    dispatch();
  };
  const remember = (key: string, addresses: string[]): void => {
    const at = now();
    cache.delete(key);
    if (addresses.length > limits.maxRememberedAddresses) return;
    for (const [name, entry] of cache) {
      if (at >= entry.at && at < entry.until) break;
      cache.delete(name);
    }
    cache.set(key, { addresses, at, until: at + (addresses.length > 0 ? limits.answerTtlMs : limits.noAnswerTtlMs) });
    while (cache.size > limits.maxNames) cache.delete(cache.keys().next().value as string);
  };
  /** One lookup in a place already taken for `who`. It never rejects: a failed lookup is "no answer". */
  const run = async (host: string, key: string, who: Who): Promise<string[]> => {
    let addresses: string[] = [];
    try {
      const answer = await resolve(host);
      if (Array.isArray(answer)) addresses = answer.filter((a) => typeof a === "string");
    } catch { /* a failed lookup is "no answer" */ } finally {
      leave(who);
    }
    remember(key, addresses);
    return addresses;
  };
  const refuse = (why: string): Pending => ({ promise: Promise.reject(new Error(why)), refused: true });
  const start = (host: string, key: string, who: Who): Pending => {
    if (running < limits.maxInFlight && hasRoom(who)) {
      take(who);
      return { promise: run(host, key, who) };
    }
    if (who && stateOf(who).waiting >= limits.ownerWaiting) return refuse("too many lookups are waiting for this caller");
    if (queue.length >= limits.maxWaiting) return refuse("too many lookups are waiting");
    const pending: Pending = { promise: Promise.resolve([]) };
    pending.promise = new Promise<string[]>((answer, fail) => {
      const ticket: Ticket = {
        owners: [who],
        starter: who,
        go: (by) => {
          pending.ticket = undefined;
          run(host, key, by).then(answer, fail);
        },
        timer: setTimeout(() => {
          const i = queue.indexOf(ticket);
          if (i < 0) return;
          queue.splice(i, 1);
          stopWaiting(ticket);
          pending.ticket = undefined;
          fail(new Error("no place for the lookup in time"));
        }, limits.maxWaitMs),
      };
      pending.ticket = ticket;
      queue.push(ticket);
      if (who) stateOf(who).waiting++;
    });
    return pending;
  };

  const lookup = async (host: string, owner?: object): Promise<string[]> => {
    const key = host.toLowerCase();
    const t = now();
    const hit = cache.get(key);
    // A clock set back must not keep an old answer in use until it catches up.
    if (hit && t >= hit.at && t < hit.until) return [...hit.addresses];
    if (hit) cache.delete(key);
    let pending = shared.get(key);
    if (pending) {
      const ticket = pending.ticket;
      if (ticket && !ticket.owners.includes(owner)) {
        ticket.owners.push(owner);
        dispatch();
      }
    } else {
      const started = start(host, key, owner);
      pending = started;
      // A refusal is not shared: another owner asking the same name a moment later gets its own chance.
      if (!started.refused) {
        shared.set(key, started);
        const forget = (): void => {
          if (shared.get(key) === started) shared.delete(key);
        };
        started.promise.then(forget, forget);
      }
    }
    return [...(await pending.promise)];
  };
  const made: CachedResolver = Object.assign(lookup, {
    limits,
    stats: () => ({ cached: cache.size, inFlight: running, waiting: queue.length }),
    ownerStats: (owner: object) => ({ inFlight: owned.get(owner)?.running ?? 0, waiting: owned.get(owner)?.waiting ?? 0 }),
    clear: () => cache.clear(),
  });
  cachedResolvers.add(made);
  return made;
}

/** The lookup resolveForEgress uses when no resolver is passed in: the system lookup behind the default limits. */
export const egressLookup: CachedResolver = cachedResolver((host) => systemLookup(host));

/**
 * Why there is no address to connect to. "unresolved": the name gave no
 * answer (or none in time, or found no place among the lookups in flight).
 * "address": an answer is an address this machine does not connect to.
 * Callers that write to a log may tell them apart; text that goes back to a
 * hosted caller must not (it would say whether a name only this machine's
 * resolver knows exists).
 */
export type EgressRefusalKind = "unresolved" | "address";

export type EgressAnswer = { ok: true; addresses: string[] } | { ok: false; reason: string; kind: EgressRefusalKind };

/**
 * The one text a refusal carries, whichever kind it is. Until 2026-11-12
 * there were two ("the host name does not resolve" and "the address is
 * private, reserved, or this server's own"), and both reached a hosted caller
 * word for word, which told the caller which names exist on the server's side
 * of its resolver (review, policy-5). `kind` keeps the difference for logs.
 */
export const EGRESS_REFUSAL_REASON = "the host cannot be reached from this server: its name does not resolve, or resolves to an address the server does not connect to";

const refusedAs = (kind: EgressRefusalKind): EgressAnswer => ({ ok: false, reason: EGRESS_REFUSAL_REASON, kind });

/**
 * The addresses a connection to `host` may use, or why there is none. A name
 * is looked up once; an address literal is not looked up at all. Refused when
 * the name does not resolve or when ANY answer is an address this machine
 * does not connect to: a name that answers with a public and a private
 * address would otherwise pass on one and be connected to on the other. The
 * caller connects to one of the returned addresses and must not resolve the
 * name again. It never throws: a decision that throws refuses.
 */
export async function resolveForEgress(host: string, policy: EgressPolicy = {}): Promise<EgressAnswer> {
  const resolve = policy.resolve ?? testPolicy?.resolve ?? egressLookup;
  const allow = policy.allow ?? testPolicy?.allow ?? ((ip: string) => allowedEgressAddress(ip));
  const timeoutMs = policy.lookupTimeoutMs ?? testPolicy?.lookupTimeoutMs ?? LOOKUP_TIMEOUT_MS;
  const bare = host.replace(/^\[(.*)\]$/, "$1");
  if (!bare) return { ok: false, reason: "no host", kind: "unresolved" };
  let addresses: string[];
  if (isIP(bare)) {
    addresses = [bare];
  } else {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      addresses = await Promise.race([
        // A resolver cachedResolver made counts the lookup against the owner of the policy.
        cachedResolvers.has(resolve) ? (resolve as CachedResolver)(bare, policy.owner) : resolve(bare),
        new Promise<string[]>((_, reject) => {
          timer = setTimeout(() => reject(new Error("lookup timed out")), timeoutMs);
        }),
      ]);
    } catch {
      return refusedAs("unresolved");
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  if (!Array.isArray(addresses) || addresses.length === 0) return refusedAs("unresolved");
  try {
    if (!addresses.every((a) => isIP(a) !== 0 && allow(a))) return refusedAs("address");
  } catch {
    return refusedAs("address");
  }
  return { ok: true, addresses };
}
