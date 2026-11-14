/**
 * Which addresses a hosted server may connect to (src/egress.ts), and the
 * hosted proxy check that asks it (src/mcp-tools/hosted-inputs.ts).
 *
 * The hosted servers used to judge a caller's proxy with a private-range list
 * of their own, and that list passed the machine's own public address as
 * public (P-10, plan of 2026-11-07). The decision now lives in one module:
 * global unicast, and not one of the machine's own addresses. This file pins
 * that decision address form by address form, at both edges of every special
 * block, and pins the lookup that goes with it: one lookup per name, any
 * refused answer refuses, and no answer in time refuses. The system lookup
 * itself (c-ares, its memory and its ceiling) is in tests/egress-lookup.test.ts.
 *
 * Nothing here opens a connection or sends a query. Names end in .test and
 * are answered by a resolver the test passes in; the names given to the real
 * lookup are "localhost" and one under it, which it answers itself without
 * asking a name server. The public addresses used as "own" are borrowed for
 * the table only and are never connected to.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, afterEach, afterAll } from "bun:test";
import fc from "fast-check";
import { networkInterfaces } from "node:os";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  allowedEgressAddress,
  ownAddressesFrom,
  ownAddresses,
  checkOwnAddressConfig,
  kernelLocalAddresses,
  localV4FromFibTrie,
  localV6FromIpv6Route,
  v6FromIfInet6,
  resolveForEgress,
  setEgressPolicyForTests,
  egressLookup,
  EgressRefused,
  EGRESS_REFUSAL_REASON,
  LOOKUP_TIMEOUT_MS,
  OWN_ADDRESSES_TTL_MS,
  type EgressResolver,
} from "../src/egress.js";
import { setHostedMode, refuseHostedProxy, pinHostedProxy } from "../src/mcp-tools/hosted-inputs.js";

/** No own addresses: the class of the address alone decides. */
const NONE = ownAddressesFrom([]);

// The one text a refusal carries (review of 2026-11-12, policy-5), written
// out here so a change of wording is a change someone made on purpose.
const REFUSAL = "the host cannot be reached from this server: its name does not resolve, or resolves to an address the server does not connect to";
const UNRESOLVED = { ok: false, reason: REFUSAL, kind: "unresolved" };
const REFUSED_ADDRESS = { ok: false, reason: REFUSAL, kind: "address" };

const verdict = (ip: string, own = NONE): string => `${ip} -> ${allowedEgressAddress(ip, own) ? "allowed" : "refused"}`;
const allowed = (ip: string): string => `${ip} -> allowed`;
const refused = (ip: string): string => `${ip} -> refused`;

/** a.b.c.d as the two hex groups it takes inside an IPv6 address. */
function hexPair(v4: string): string {
  const [a, b, c, d] = v4.split(".").map(Number);
  return `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
}

/** Every way an IPv4 address is written inside IPv6 and still reaches that IPv4 address. */
const sameReach = (v4: string): string[] => [`::ffff:${v4}`, `::ffff:${hexPair(v4)}`, `0:0:0:0:0:ffff:${hexPair(v4)}`, `64:ff9b::${v4}`, `64:ff9b::${hexPair(v4)}`];
/** The deprecated v4-compatible spelling, dotted and hex. */
const compatible = (v4: string): string[] => [`::${v4}`, `::${hexPair(v4)}`];

const F = "ffff:ffff:ffff:ffff:ffff:ffff:ffff";

// The IPv4 special-purpose blocks, each with its first and last address and
// the public address on either side (IANA IPv4 Special-Purpose Address
// Registry, plus multicast and everything above it).
const V4_BLOCKS: Array<{ block: string; first: string; last: string; before?: string; after?: string }> = [
  { block: "0.0.0.0/8 this network", first: "0.0.0.0", last: "0.255.255.255", after: "1.0.0.0" },
  { block: "10.0.0.0/8 private", first: "10.0.0.0", last: "10.255.255.255", before: "9.255.255.255", after: "11.0.0.0" },
  { block: "100.64.0.0/10 shared", first: "100.64.0.0", last: "100.127.255.255", before: "100.63.255.255", after: "100.128.0.0" },
  { block: "127.0.0.0/8 loopback", first: "127.0.0.0", last: "127.255.255.255", before: "126.255.255.255", after: "128.0.0.0" },
  { block: "169.254.0.0/16 link-local", first: "169.254.0.0", last: "169.254.255.255", before: "169.253.255.255", after: "169.255.0.0" },
  { block: "172.16.0.0/12 private", first: "172.16.0.0", last: "172.31.255.255", before: "172.15.255.255", after: "172.32.0.0" },
  { block: "192.0.0.0/24 protocol assignments", first: "192.0.0.0", last: "192.0.0.255", before: "191.255.255.255", after: "192.0.1.0" },
  { block: "192.0.2.0/24 documentation", first: "192.0.2.0", last: "192.0.2.255", before: "192.0.1.255", after: "192.0.3.0" },
  { block: "192.88.99.0/24 6to4 relay", first: "192.88.99.0", last: "192.88.99.255", before: "192.88.98.255", after: "192.88.100.0" },
  { block: "192.168.0.0/16 private", first: "192.168.0.0", last: "192.168.255.255", before: "192.167.255.255", after: "192.169.0.0" },
  { block: "198.18.0.0/15 benchmarking", first: "198.18.0.0", last: "198.19.255.255", before: "198.17.255.255", after: "198.20.0.0" },
  { block: "198.51.100.0/24 documentation", first: "198.51.100.0", last: "198.51.100.255", before: "198.51.99.255", after: "198.51.101.0" },
  { block: "203.0.113.0/24 documentation", first: "203.0.113.0", last: "203.0.113.255", before: "203.0.112.255", after: "203.0.114.0" },
  { block: "224.0.0.0/3 multicast and reserved", first: "224.0.0.0", last: "255.255.255.255", before: "223.255.255.255" },
];

// The same blocks as numbers, for the property test: a second, independent
// statement of the IPv4 decision (ranges of 32-bit numbers, not octet rules).
const V4_CIDRS = ["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24",
  "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/3"];
const toNumber = (v4: string): number => v4.split(".").reduce((n, o) => n * 256 + Number(o), 0);
const toDotted = (n: number): string => [n / 2 ** 24, n / 2 ** 16, n / 2 ** 8, n].map((x) => Math.floor(x) % 256).join(".");
const V4_RANGES = V4_CIDRS.map((cidr) => {
  const [base, bits] = cidr.split("/");
  return { start: toNumber(base), end: toNumber(base) + 2 ** (32 - Number(bits)) - 1 };
});
const specialV4 = (v4: string): boolean => V4_RANGES.some((r) => toNumber(v4) >= r.start && toNumber(v4) <= r.end);

describe("ISC-1: IPv4, global unicast only", () => {
  for (const b of V4_BLOCKS) {
    test(`${b.block}: refused from ${b.first} to ${b.last}, public on either side`, () => {
      expect([b.first, b.last].map((ip) => verdict(ip))).toEqual([b.first, b.last].map(refused));
      const outside = [b.before, b.after].filter((ip): ip is string => !!ip);
      expect(outside.map((ip) => verdict(ip))).toEqual(outside.map(allowed));
    });
  }

  test("addresses inside the blocks", () => {
    const inside = ["127.0.0.1", "127.0.0.53", "10.1.2.3", "172.17.0.1", "172.24.0.1", "192.168.1.1", "169.254.169.254", "100.100.100.200",
      "192.0.0.8", "192.0.2.1", "192.88.99.1", "198.18.0.1", "198.19.0.1", "198.51.100.7", "203.0.113.9", "224.0.0.251", "239.255.255.255",
      "240.0.0.0", "255.255.255.254"];
    expect(inside.map((ip) => verdict(ip))).toEqual(inside.map(refused));
  });

  test("a public address that shares octets with a special block stays allowed", () => {
    // Each row differs from a block in one octet, so a rule that stops reading
    // that octet refuses it.
    const near = ["99.64.0.1", "101.64.0.1", "168.254.0.1", "170.254.0.1", "171.16.0.1", "173.16.0.1", "172.0.0.1", "191.168.0.1", "193.168.0.1",
      "192.1.0.1", "192.1.2.1", "193.0.0.1", "193.0.2.1", "192.0.1.1", "192.89.99.1", "193.88.99.1", "192.88.0.1", "197.18.0.1", "199.18.0.1",
      "199.19.0.1", "198.52.100.1", "199.51.100.1", "198.51.0.1", "203.1.113.1", "204.0.113.1", "203.0.0.1", "8.8.8.8", "1.1.1.1", "93.184.216.34",
      "223.255.255.254"];
    expect(near.map((ip) => verdict(ip))).toEqual(near.map(allowed));
  });

  test("written inside IPv6 as v4-mapped or NAT64, an edge address gets the verdict of the IPv4 address; v4-compatible is refused", () => {
    for (const b of V4_BLOCKS) {
      for (const ip of [b.first, b.last]) {
        expect(sameReach(ip).map((s) => verdict(s))).toEqual(sameReach(ip).map(refused));
        expect(compatible(ip).map((s) => verdict(s))).toEqual(compatible(ip).map(refused));
      }
      for (const ip of [b.before, b.after].filter((x): x is string => !!x)) {
        expect(sameReach(ip).map((s) => verdict(s))).toEqual(sameReach(ip).map(allowed));
        expect(compatible(ip).map((s) => verdict(s))).toEqual(compatible(ip).map(refused));
      }
    }
  });
});

describe("ISC-1: IPv6, inside 2000::/3 and not a special block there", () => {
  test("every form outside global unicast is refused", () => {
    const rows = [
      // unspecified and loopback
      "::", "0:0:0:0:0:0:0:0", "::1", "0:0:0:0:0:0:0:1", "0000:0000:0000:0000:0000:0000:0000:0001",
      // v4-mapped, dotted and hex: loopback, private, link-local, shared
      "::ffff:127.0.0.1", "::ffff:7f00:1", "0:0:0:0:0:ffff:7f00:1", "::ffff:10.0.0.1", "::ffff:a00:1", "::ffff:192.168.1.1", "::ffff:c0a8:101",
      "::ffff:169.254.169.254", "::ffff:a9fe:a9fe", "::ffff:100.64.0.1", "::ffff:6440:1", "::ffff:0.0.0.0", "::ffff:0:0",
      // NAT64 64:ff9b::/96, dotted and hex
      "64:ff9b::127.0.0.1", "64:ff9b::7f00:1", "64:ff9b::10.0.0.1", "64:ff9b::a00:1", "64:ff9b::192.168.1.1", "64:ff9b::c0a8:101", "64:ff9b:0:0:0:0:7f00:1",
      // v4-compatible, dotted and hex: refused whatever the IPv4 address is
      "::127.0.0.1", "::7f00:1", "::10.0.0.1", "::a00:1", "::8.8.8.8", "::808:808", "0:0:0:0:0:0:808:808",
      // near misses of the two prefixes that are read as IPv4: not that prefix, so judged as IPv6 and outside 2000::/3
      "::fffe:8.8.8.8", "::1:ffff:8.8.8.8", "0:0:0:1:0:ffff:808:808", "::ffff:0:8.8.8.8", "64:ff9b:1::8.8.8.8", "64:ff9b:0:0:0:1:808:808", "64:ff9a::8.8.8.8", "65:ff9b::8.8.8.8",
      // unique local fc00::/7
      "fc00::", "fc00::1", "fd00::1", "fdc9:2ab:aff2::1", `fdff:${F}`,
      // link-local fe80::/10 and site-local fec0::/10
      "fe80::", "fe80::1", `febf:${F}`, "fec0::", "fec0::1", `feff:${F}`,
      // multicast ff00::/8
      "ff00::", "ff02::1", "ff05::1:3", `ffff:${F}`,
      // discard-only 100::/64 and the rest of 100::/8
      "100::", "100::1", "100:0:0:0:ffff:ffff:ffff:ffff", "100:0:0:1::1",
      // documentation 2001:db8::/32 and 3fff::/20
      "2001:db8::", "2001:db8::1", "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff", "3fff::", "3fff::1", "3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff",
      // 6to4 2002::/16, which names an IPv4 address
      "2002::", "2002:7f00:1::1", "2002:808:808::1", `2002:${F}`,
      // protocol assignments 2001::/23, which holds Teredo 2001::/32
      "2001::", "2001::1", "2001:0:ffff:ffff:ffff:ffff:ffff:ffff", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "2001:2::1", "2001:10::1", "2001:20::1",
      "2001:1ff:ffff:ffff:ffff:ffff:ffff:ffff",
      // either side of 2000::/3
      `1fff:${F}`, "4000::", "0:1::", "200::1", "400::1", "800::1", "1000::1", "8000::1", "a000::1", "c000::1", "e000::1", "f000::1",
    ];
    expect(rows.map((ip) => verdict(ip))).toEqual(rows.map(refused));
  });

  test("global unicast is allowed, up to the edge of each special block", () => {
    const rows = [
      "2606:4700:4700::1111", "2607:f8b0:4005:80a::200e", "2a00:1450:4001:81b::200e", "2400:cb00::1", "2c0f:f248::1",
      // the edges of 2000::/3
      "2000::", "2000::1", `3fff:${F}`,
      // just outside 2001::/23
      "2000:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "2001:200::", "2001:200::1",
      // just outside 2001:db8::/32
      "2001:db7:ffff:ffff:ffff:ffff:ffff:ffff", "2001:db9::",
      // a special block's second group under another first group is ordinary space
      "2606:db8::1", "2606:0:1::1", "2606:1ff::1", "2a00:fff::1",
      // just outside 2002::/16
      "2001:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "2003::",
      // just outside 3fff::/20
      `3ffe:${F}`, "3fff:1000::",
      // v4-mapped and NAT64 forms of a public IPv4 address
      "::ffff:8.8.8.8", "::ffff:808:808", "0:0:0:0:0:ffff:808:808", "64:ff9b::8.8.8.8", "64:ff9b::808:808", "64:ff9b:0:0:0:0:808:808",
    ];
    expect(rows.map((ip) => verdict(ip))).toEqual(rows.map(allowed));
  });

  test("capitals, brackets and a zone id do not change the verdict", () => {
    const rows: Array<[string, boolean]> = [
      ["FE80::1", false], ["::FFFF:7F00:1", false], ["::FFFF:127.0.0.1", false], ["64:FF9B::7F00:1", false], ["FD00::1", false],
      ["2606:4700:4700::ABCD", true], ["::FFFF:8.8.8.8", true], ["64:FF9B::808:808", true],
      ["[::1]", false], ["[::]", false], ["[::ffff:7f00:1]", false], ["[::ffff:127.0.0.1]", false], ["[fd00::1]", false], ["[fe80::1]", false],
      ["[64:ff9b::7f00:1]", false], ["[2001:db8::1]", false], ["[2606:4700:4700::1111]", true], ["[::ffff:808:808]", true],
      ["fe80::1%eth0", false], ["fe80::1%25eth0", false], ["::1%lo", false], ["[fe80::1%eth0]", false], ["::ffff:7f00:1%eth0", false],
      ["2606:4700:4700::1111%eth0", true],
    ];
    expect(rows.map(([ip]) => verdict(ip))).toEqual(rows.map(([ip, ok]) => (ok ? allowed(ip) : refused(ip))));
  });

  test("text that is not an address is refused, also when it looks like an allowed one", () => {
    const rows = [
      "", " ", "localhost", "example.com", "proxy.test", "http://8.8.8.8", "8.8.8.8:80", "8.8.8.8/32", "8.8.8.8 ", " 8.8.8.8", "8.8.8.8\n", "8.8.8.8%eth0",
      // IPv4 spellings the address parser does not take (a lookup would, which is why a name is always looked up and its answers judged)
      "127.1", "2130706433", "0x7f.0.0.1", "0177.0.0.1", "008.8.8.8", "8.8.8.08", "256.1.1.1", "1.2.3", "1.2.3.4.5", "8.8.8", "8.8.8.8.",
      // brackets belong to IPv6 only, one pair, both ends
      "[8.8.8.8]", "[[2606:4700:4700::1111]]", "[2606:4700:4700::1111", "2606:4700:4700::1111]", "[2606:4700:4700::1111]%eth0", "[]", "[",
      // malformed IPv6
      "2606:4700:4700::g", "12345::1", "2606::1::1", ":::", "2606:4700:4700:1:2:3:4", "2606:4700:4700:1:2:3:4:5:6", "2606:4700:4700:1:2:3:4:5::",
      "::2606:4700:4700:1:2:3:4:5", "2606:4700:4700::1111%", "2606:4700:4700::1111%eth0%x", "2606:4700:4700::1111%a b/../", "2606:4700:4700::1111\n",
      "2606:4700:4700::1111 ", "2606:4700:4700::1111/64",
      // a dotted tail that is not an IPv4 address, or does not start a group
      "2600::f1.2.3.4", "2606:4700::256.1.1.1", "2606:4700::01.2.3.4", "2606:4700::1.2.3", "2606:4700::1.2.3.4.5", "::ffff:256.0.0.1", "::ffff:08.8.8.8",
    ];
    expect(rows.map((ip) => verdict(ip))).toEqual(rows.map(refused));
  });
});

describe("ISC-2: the machine's own addresses are refused, public ones included", () => {
  const OWN_V4 = "93.184.216.34";
  const OWN_V6 = "2606:4700:4700:1111::5";

  test("an own public IPv4 address is refused in every spelling that reaches it, and its neighbours are not", () => {
    const own = ownAddressesFrom([OWN_V4]);
    expect(verdict(OWN_V4, NONE)).toBe(allowed(OWN_V4));
    const spellings = [OWN_V4, ...sameReach(OWN_V4), `[::ffff:${hexPair(OWN_V4)}]`, `::FFFF:${OWN_V4}`];
    expect(spellings.map((ip) => verdict(ip, own))).toEqual(spellings.map(refused));
    const neighbours = ["93.184.216.33", "93.184.216.35", "93.184.217.34", "94.184.216.34", "::ffff:93.184.216.35", "64:ff9b::5db8:d823"];
    expect(neighbours.map((ip) => verdict(ip, own))).toEqual(neighbours.map(allowed));
  });

  test("an own IPv4 address given in its mapped spelling refuses the plain address", () => {
    for (const spelling of [`::ffff:${OWN_V4}`, `::ffff:${hexPair(OWN_V4)}`, `64:ff9b::${OWN_V4}`, `[::ffff:${OWN_V4}]`]) {
      const own = ownAddressesFrom([spelling]);
      expect([...own.v4]).toEqual([OWN_V4]);
      expect(own.v6.size).toBe(0);
      expect(verdict(OWN_V4, own)).toBe(refused(OWN_V4));
    }
  });

  test("an own IPv6 address refuses its whole /64 and leaves the /64 on either side", () => {
    const own = ownAddressesFrom([OWN_V6]);
    expect(verdict(OWN_V6, NONE)).toBe(allowed(OWN_V6));
    const inside = [OWN_V6, "2606:4700:4700:1111::", "2606:4700:4700:1111::1", "2606:4700:4700:1111:ffff:ffff:ffff:ffff", "[2606:4700:4700:1111:1:2:3:4]",
      "2606:4700:4700:1111:0:0:8.8.8.8"];
    expect(inside.map((ip) => verdict(ip, own))).toEqual(inside.map(refused));
    const outside = ["2606:4700:4700:1110:ffff:ffff:ffff:ffff", "2606:4700:4700:1112::", "2606:4700:4701:1111::5", "2606:4701:4700:1111::5",
      "2607:4700:4700:1111::5", "2606:4700:4700::1111"];
    expect(outside.map((ip) => verdict(ip, own))).toEqual(outside.map(allowed));
    // An IPv6 own address says nothing about any IPv4 address.
    expect(own.v4.size).toBe(0);
    expect(verdict("8.8.8.8", own)).toBe(allowed("8.8.8.8"));
  });

  // Until 2026-11-12 this test pinned the opposite: a prefix length was dropped
  // and the one address before it kept, so 198.50.100.8/29 protected .8 alone
  // (review, policy-4). An entry with a prefix length is a range now.
  test("an entry with a prefix length protects the whole range it names, spaces are trimmed, and text that is neither is skipped", () => {
    const skipped = ["", "  ", "not-an-address", "999.1.1.1", "/24", "2606:4700::g", "8.8.4.4/abc", "[9.9.9.9]", "8.8.4.4/33", "8.8.4.4/-1", "8.8.4.4/", "8.8.4.4/024",
      "8.8.4.4 /24", "8.8.4.4/24/24", "8.8.4.4/2 4", "2606:4700::1/129", "2606:4700::1/", "::ffff:8.8.4.4/95", "8.8.4.4;9.9.9.9", "8.8.4.4 9.9.9.9", "lb.example.com"];
    const own = ownAddressesFrom([`${OWN_V4}/29`, `  ${OWN_V6}/64 `, ...skipped]);
    // 93.184.216.34/29 is .32 to .39, whatever spelling reaches it.
    const inside = ["93.184.216.32", OWN_V4, "93.184.216.39", "::ffff:93.184.216.35", `64:ff9b::${hexPair("93.184.216.39")}`, "[::ffff:5db8:d820]"];
    expect(inside.map((ip) => verdict(ip, own))).toEqual(inside.map(refused));
    const outside = ["93.184.216.31", "93.184.216.40", "93.184.217.34", "::ffff:93.184.216.40", "8.8.4.4", "9.9.9.9"];
    expect(outside.map((ip) => verdict(ip, own))).toEqual(outside.map(allowed));
    expect(verdict("2606:4700:4700:1111::9", own)).toBe(refused("2606:4700:4700:1111::9"));
    expect(verdict("2606:4700:4700:1112::9", own)).toBe(allowed("2606:4700:4700:1112::9"));
    // Nothing of the skipped texts got in: one IPv4 range, one IPv6 /64.
    expect([own.v4.size, own.v4Ranges.length, own.v6.size, own.v6Ranges.length]).toEqual([0, 1, 1, 0]);
    expect(own.v4Ranges[0]).toEqual([toNumber("93.184.216.32"), toNumber("93.184.216.39")]);
    for (const text of skipped) {
      const one = ownAddressesFrom([text]);
      expect(`${JSON.stringify(text)}: ${one.v4.size + one.v4Ranges.length + one.v6.size + one.v6Ranges.length}`).toBe(`${JSON.stringify(text)}: 0`);
    }
  });

  test("an IPv4 range at every prefix length: its first and last address are refused and the address on either side is not", () => {
    const BASE = "93.184.216.34";
    for (let bits = 8; bits <= 32; bits++) {
      const own = ownAddressesFrom([`${BASE}/${bits}`]);
      const size = 2 ** (32 - bits);
      const first = Math.floor(toNumber(BASE) / size) * size;
      const last = first + size - 1;
      const edges = [toDotted(first), toDotted(last), BASE];
      expect(edges.map((ip) => `/${bits} ${verdict(ip, own)}`)).toEqual(edges.map((ip) => `/${bits} ${refused(ip)}`));
      const beside = [toDotted(first - 1), toDotted(last + 1)];
      expect(beside.map((ip) => `/${bits} ${verdict(ip, own)}`)).toEqual(beside.map((ip) => `/${bits} ${allowed(ip)}`));
    }
    // /32 is the one address and /0 is every address; an IPv6 address is not touched by either.
    expect([...ownAddressesFrom([`${BASE}/32`]).v4]).toEqual([BASE]);
    const all = ownAddressesFrom(["0.0.0.0/0"]);
    expect(["8.8.8.8", "1.1.1.1", BASE, "223.255.255.254", "::ffff:8.8.8.8"].map((ip) => verdict(ip, all))).toEqual(["8.8.8.8", "1.1.1.1", BASE, "223.255.255.254", "::ffff:8.8.8.8"].map(refused));
    expect(verdict("2606:4700:4700::1111", all)).toBe(allowed("2606:4700:4700::1111"));
  });

  test("an IPv6 range: /56 covers its 256 /64s, /128 is one address, no prefix length is the /64, and a prefix that ends inside a group is honoured", () => {
    const routed = ownAddressesFrom(["2607:5300:61:aa00::/56"]);
    const inside = ["2607:5300:61:aa00::1", "2607:5300:61:aa01::1", "2607:5300:61:aa80:1:2:3:4", "2607:5300:61:aaff:ffff:ffff:ffff:ffff", "[2607:5300:61:aa7f::9]"];
    expect(inside.map((ip) => verdict(ip, routed))).toEqual(inside.map(refused));
    const outside = ["2607:5300:61:a9ff:ffff:ffff:ffff:ffff", "2607:5300:61:ab00::", "2607:5300:60:aa00::1", "2606:5300:61:aa00::1"];
    expect(outside.map((ip) => verdict(ip, routed))).toEqual(outside.map(allowed));
    expect([routed.v6.size, routed.v6Ranges.length, routed.v4.size, routed.v4Ranges.length]).toEqual([0, 1, 0, 0]);
    expect(verdict("8.8.8.8", routed)).toBe(allowed("8.8.8.8"));

    const single = ownAddressesFrom([`${OWN_V6}/128`]);
    expect(verdict(OWN_V6, single)).toBe(refused(OWN_V6));
    expect(["2606:4700:4700:1111::4", "2606:4700:4700:1111::6", "2606:4700:4700:1111:8000::5"].map((ip) => verdict(ip, single))).toEqual(
      ["2606:4700:4700:1111::4", "2606:4700:4700:1111::6", "2606:4700:4700:1111:8000::5"].map(allowed));
    // Without a prefix length the same address stands for its /64, as an interface address does.
    expect(verdict("2606:4700:4700:1111:8000::5", ownAddressesFrom([OWN_V6]))).toBe(refused("2606:4700:4700:1111:8000::5"));

    // /65: the upper half of one /64. /3: all of global unicast.
    const half = ownAddressesFrom(["2606:4700:4700:1111:8000::/65"]);
    expect(["2606:4700:4700:1111:8000::", "2606:4700:4700:1111:ffff:ffff:ffff:ffff"].map((ip) => verdict(ip, half))).toEqual(
      ["2606:4700:4700:1111:8000::", "2606:4700:4700:1111:ffff:ffff:ffff:ffff"].map(refused));
    expect(["2606:4700:4700:1111:7fff:ffff:ffff:ffff", "2606:4700:4700:1112:8000::"].map((ip) => verdict(ip, half))).toEqual(
      ["2606:4700:4700:1111:7fff:ffff:ffff:ffff", "2606:4700:4700:1112:8000::"].map(allowed));
    const everything = ownAddressesFrom(["2000::/3"]);
    expect(["2606:4700:4700::1111", "2a00:1450:4001:81b::200e", `3fff:${F}`].map((ip) => verdict(ip, everything))).toEqual(
      ["2606:4700:4700::1111", "2a00:1450:4001:81b::200e", `3fff:${F}`].map(refused));
    expect(verdict("8.8.8.8", everything)).toBe(allowed("8.8.8.8"));

    // An IPv4 address written inside IPv6 counts its prefix length in IPv6 bits: /125 there is /29 of the IPv4 address.
    const mapped = ownAddressesFrom([`::ffff:${OWN_V4}/125`]);
    expect(mapped.v4Ranges).toEqual([[toNumber("93.184.216.32"), toNumber("93.184.216.39")]]);
    expect(["93.184.216.32", "93.184.216.39"].map((ip) => verdict(ip, mapped))).toEqual(["93.184.216.32", "93.184.216.39"].map(refused));
    expect(verdict("93.184.216.40", mapped)).toBe(allowed("93.184.216.40"));
  });
});

// ownAddresses() keeps what it read for 30 seconds and takes the time as a
// parameter. Each forced re-read below asks with a later time than any before
// it, and the file ends by asking with the real time, which puts the real
// reading back for whatever runs next in this process.
let clock = Date.now();
const rereadOwn = (): ReturnType<typeof ownAddresses> => ownAddresses((clock += 120_000));
const prevOwnEnv = process.env.CBROWSER_OWN_ADDRESSES;
function setOwnEnv(value: string | undefined): void {
  if (value === undefined) delete process.env.CBROWSER_OWN_ADDRESSES;
  else process.env.CBROWSER_OWN_ADDRESSES = value;
}
/** Run with CBROWSER_OWN_ADDRESSES set and already read, then put the variable and the reading back. */
async function withOwnEnv<T>(value: string | undefined, fn: () => T | Promise<T>): Promise<T> {
  setOwnEnv(value);
  rereadOwn();
  try {
    return await fn();
  } finally {
    setOwnEnv(prevOwnEnv);
    rereadOwn();
  }
}

afterEach(() => {
  setHostedMode(false);
  setEgressPolicyForTests(null);
  setOwnEnv(prevOwnEnv);
});
afterAll(() => {
  setOwnEnv(prevOwnEnv);
  rereadOwn();
  ownAddresses();
});

describe("ISC-2: ownAddresses() reads this machine", () => {
  const interfaces = Object.values(networkInterfaces()).flat().filter((a): a is NonNullable<typeof a> => !!a);

  test("every address of every network interface is in the set, and none of them is allowed", async () => {
    await withOwnEnv(undefined, () => {
      const own = ownAddresses();
      expect(interfaces.length).toBeGreaterThan(0);
      const missing: string[] = [];
      for (const entry of interfaces) {
        const one = ownAddressesFrom([entry.address]);
        expect(`${entry.address}: ${one.v4.size + one.v6.size}`).toBe(`${entry.address}: 1`);
        if (![...one.v4].every((k) => own.v4.has(k)) || ![...one.v6].every((k) => own.v6.has(k))) missing.push(entry.address);
      }
      expect(missing).toEqual([]);
      expect(interfaces.map((e) => verdict(e.address, own))).toEqual(interfaces.map((e) => refused(e.address)));
      // And through the default argument, which is what the callers use.
      expect(interfaces.filter((e) => allowedEgressAddress(e.address)).map((e) => e.address)).toEqual([]);
      // Nothing that is not an interface address: a public address elsewhere stays allowed.
      expect(allowedEgressAddress("93.184.216.34")).toBe(true);
    });
  });

  test("CBROWSER_OWN_ADDRESSES adds addresses that are on no interface", async () => {
    await withOwnEnv(undefined, () => {
      expect(allowedEgressAddress("93.184.216.34")).toBe(true);
      expect(allowedEgressAddress("2606:4700:4700:1111::7")).toBe(true);
    });
    await withOwnEnv(" 93.184.216.34 , 2606:4700:4700:1111::5/64,, 198.50.100.8/29 , 2607:5300:61:aa00::/56,", () => {
      const own = ownAddresses();
      expect(own.v4.has("93.184.216.34")).toBe(true);
      expect(allowedEgressAddress("93.184.216.34")).toBe(false);
      expect(allowedEgressAddress("::ffff:5db8:d822")).toBe(false);
      expect(allowedEgressAddress("2606:4700:4700:1111::7")).toBe(false);
      expect(allowedEgressAddress("93.184.216.35")).toBe(true);
      expect(allowedEgressAddress("2606:4700:4700:1112::7")).toBe(true);
      // A range protects every address in it (review of 2026-11-12, policy-4: it used to protect .8 alone, and one /64 of the /56).
      const inRange = ["198.50.100.8", "198.50.100.9", "198.50.100.15", "::ffff:198.50.100.12", "2607:5300:61:aa00::1", "2607:5300:61:aa01::1", "2607:5300:61:aaff::1"];
      expect(inRange.map((ip) => `${ip}: ${allowedEgressAddress(ip)}`)).toEqual(inRange.map((ip) => `${ip}: false`));
      const beside = ["198.50.100.7", "198.50.100.16", "2607:5300:61:a9ff::1", "2607:5300:61:ab00::1"];
      expect(beside.map((ip) => `${ip}: ${allowedEgressAddress(ip)}`)).toEqual(beside.map((ip) => `${ip}: true`));
      // The interface addresses are still there next to the configured ones.
      for (const entry of interfaces) expect(`${entry.address}: ${allowedEgressAddress(entry.address)}`).toBe(`${entry.address}: false`);
    });
    expect(allowedEgressAddress("93.184.216.34")).toBe(true);
    expect(allowedEgressAddress("198.50.100.9")).toBe(true);
  });

  // Until 2026-11-12 an entry that could not be read was dropped without a
  // word, so a list typed with ";" or a host name left the server running
  // with the addresses it was meant to protect allowed (review, policy-4).
  test("an entry of CBROWSER_OWN_ADDRESSES that is neither an address nor a range: ownAddresses() throws naming it, and every address is refused until it is corrected", async () => {
    const said: string[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => { said.push(args.map(String).join(" ")); };
    try {
      const cases: Array<{ value: string; bad: string; neighbour?: string }> = [
        { value: "93.184.216.34, lb.example.com ,8.8.4.4", bad: "lb.example.com", neighbour: "93.184.216.34" },
        { value: "8.8.4.4;9.9.9.9", bad: "8.8.4.4;9.9.9.9" },
        { value: "93.184.216.34,8.8.8.8 1.1.1.1", bad: "8.8.8.8 1.1.1.1", neighbour: "93.184.216.34" },
        { value: "198.50.100.8/33", bad: "198.50.100.8/33" },
        { value: "2607:5300:61:aa00::/129, 93.184.216.34", bad: "2607:5300:61:aa00::/129", neighbour: "93.184.216.34" },
        { value: "198.50.100.8/", bad: "198.50.100.8/" },
        { value: "198.50.100.8-198.50.100.15", bad: "198.50.100.8-198.50.100.15" },
      ];
      for (const c of cases) {
        setOwnEnv(c.value);
        let message = "did not throw";
        try { rereadOwn(); } catch (error) { message = (error as Error).message; }
        expect(message).toContain("CBROWSER_OWN_ADDRESSES");
        expect(message).toContain(JSON.stringify(c.bad));
        if (c.neighbour) expect(message).not.toContain(c.neighbour);
        // Fail closed: nothing is allowed, through the default argument and through resolveForEgress, and neither throws.
        expect(`${c.value}: ${allowedEgressAddress("8.8.8.8")}`).toBe(`${c.value}: false`);
        expect(`${c.value}: ${allowedEgressAddress("2606:4700:4700::1111")}`).toBe(`${c.value}: false`);
        expect(await resolveForEgress("8.8.8.8")).toEqual(REFUSED_ADDRESS);
        expect(await resolveForEgress("named.test", { resolve: async () => ["8.8.8.8"] })).toEqual(REFUSED_ADDRESS);
        expect(() => checkOwnAddressConfig()).toThrow(JSON.stringify(c.bad));
        setHostedMode(true);
        expect((await pinHostedProxy("t", "http://8.8.8.8:3128")).ok).toBe(false);
        expect(await refuseHostedProxy("t", "http://8.8.8.8:3128")).not.toBeNull();
        setHostedMode(false);
        // The classifier with an explicit set is untouched: it is the reading that failed.
        expect(allowedEgressAddress("8.8.8.8", NONE)).toBe(true);
      }
      // The reason reached the error log once per mistake, not once per refused address.
      for (const c of cases) expect(`${c.bad}: ${said.filter((line) => line.includes(JSON.stringify(c.bad))).length}`).toBe(`${c.bad}: 1`);
    } finally {
      console.error = realError;
      setOwnEnv(prevOwnEnv);
    }
    // Corrected, the server connects again.
    rereadOwn();
    expect(allowedEgressAddress("8.8.8.8")).toBe(true);
    expect((await resolveForEgress("8.8.8.8")).ok).toBe(true);
  });

  test("checkOwnAddressConfig reads afresh and counts the entries, for the server to call when it starts", () => {
    setOwnEnv(undefined);
    const base = checkOwnAddressConfig();
    expect(base.v4).toBeGreaterThan(0);
    // It does not wait out the 30 seconds a reading is kept for: the variable set a moment ago is in the count.
    setOwnEnv("93.184.216.34, 198.50.100.8/29, 2606:4700:4700:1111::5, 2607:5300:61:aa00::/56");
    expect(checkOwnAddressConfig()).toEqual({ v4: base.v4 + 2, v6: base.v6 + 2 });
    expect(allowedEgressAddress("198.50.100.15")).toBe(false);
    setOwnEnv(undefined);
    expect(checkOwnAddressConfig()).toEqual(base);
    expect(allowedEgressAddress("198.50.100.15")).toBe(true);
  });

  // os.networkInterfaces() leaves out an interface that is not up and
  // running, and the kernel still answers on its address (review of
  // 2026-11-12, policy-3: two docker bridges without carrier on this machine).
  //
  // The file prints every routing table, each under a header line. Only the
  // "Local:" table says what this machine is: a LOCAL route in a policy
  // table ("Id 100:", as a transparent proxy sets one up) applies only to the
  // packets a rule sends there, and read as own it made 0.0.0.0/0 this
  // machine's (review of 2026-11-12, lookup-3). The "Main:" leaf marked LOCAL
  // below is not in "Local:" and so is not read; a real kernel prints the
  // merged table under both headers, which this fixture does not need to.
  const FIB_TRIE = [
    "Main:",
    "  +-- 0.0.0.0/0 3 0 5",
    "     |-- 0.0.0.0",
    "        /0 universe UNICAST",
    "     |-- 93.184.216.77",
    "        /32 host LOCAL",
    "Local:",
    "        /32 host LOCAL",
    "  +-- 0.0.0.0/0 3 0 5",
    "     +-- 127.0.0.0/8 2 0 2",
    "        +-- 127.0.0.0/31 1 0 0",
    "           |-- 127.0.0.0",
    "              /8 host LOCAL",
    "           |-- 127.0.0.1",
    "              /32 host LOCAL",
    "        |-- 127.255.255.255",
    "           /32 link BROADCAST",
    "     +-- 172.26.0.0/16 2 0 2",
    "        +-- 172.26.0.0/31 1 0 0",
    "           |-- 172.26.0.0",
    "              /16 link UNICAST",
    "           |-- 172.26.0.1",
    "              /32 host LOCAL",
    "        |-- 172.26.255.255",
    "           /32 link BROADCAST",
    "     +-- 198.50.100.0/24 2 0 2",
    "        |-- 198.50.100.0",
    "           /24 link UNICAST",
    "           /32 host LOCAL",
    "        |-- 198.50.100.8",
    "           /32 host LOCAL",
    "        |-- 198.50.100.255",
    "           /32 link BROADCAST",
    "     |-- 203.0.112.0",
    "        /24 host LOCAL",
    "     +-- 93.184.216.0/24 2 0 2",
    "        /32 host LOCAL",
    "     |-- 93.184.216.99",
    "        /32 universe UNICAST",
    "Id 100:",
    "        /0 host LOCAL",
    "  |-- 0.0.0.0",
    "     /0 host LOCAL",
    "  |-- 93.184.217.0",
    "     /29 host LOCAL",
    "",
  ].join("\n");
  const IF_INET6 = [
    "00000000000000000000000000000001 01 80 10 80       lo",
    "fe800000000000000042acfffe1a0001 0d 40 20 80 br-d4f8cf69ba21",
    "26075300006100aa0000000000000001 02 40 00 80   enp6s0",
    "FDC902ABAFF200000000000000000001 07 40 00 82  docker0",
    "not a line of this file",
    "2607530000610 02 40 00 80 short",
    "",
  ].join("\n");

  test("the kernel's local table is read as it is written: LOCAL leaves only, a shorter prefix as a range", () => {
    // 198.50.100.0 carries two lines, of which one is LOCAL. The LOCAL line
    // under a branch (93.184.216.0/24) and the one right after "Local:" belong
    // to no leaf. 93.184.216.99 is a route, not an address of this machine.
    expect(localV4FromFibTrie(FIB_TRIE)).toEqual(["127.0.0.0/8", "127.0.0.1", "172.26.0.1", "198.50.100.0", "198.50.100.8", "203.0.112.0/24"]);
    expect(localV4FromFibTrie("")).toEqual([]);
    expect(v6FromIfInet6(IF_INET6)).toEqual(["0000:0000:0000:0000:0000:0000:0000:0001", "fe80:0000:0000:0000:0042:acff:fe1a:0001", "2607:5300:0061:00aa:0000:0000:0000:0001",
      "FDC9:02AB:AFF2:0000:0000:0000:0000:0001"]);
    expect(v6FromIfInet6("")).toEqual([]);
    // And as own addresses: the address on a bridge without carrier, the public one, the routed block, the /64 of each IPv6 address.
    const own = ownAddressesFrom([...localV4FromFibTrie(FIB_TRIE), ...v6FromIfInet6(IF_INET6)]);
    expect(own.v4.has("172.26.0.1")).toBe(true);
    const mine = ["198.50.100.8", "198.50.100.0", "203.0.112.0", "203.0.112.77", "203.0.112.255", "2607:5300:61:aa::1", "2607:5300:61:aa:9:9:9:9"];
    expect(mine.map((ip) => verdict(ip, own))).toEqual(mine.map(refused));
    expect(mine.map((ip) => verdict(ip, NONE))).toEqual(mine.map(allowed));
    const notMine = ["198.50.100.9", "93.184.216.99", "93.184.216.0", "203.0.111.255", "2607:5300:61:ab::1", "93.184.216.77", "93.184.217.3", "8.8.4.4"];
    expect(notMine.map((ip) => verdict(ip, own))).toEqual(notMine.map(allowed));
  });

  // The reviewer's text: a transparent-proxy table holding local 0.0.0.0/0.
  const TPROXY_TRIE = "Main:\n  +-- 0.0.0.0/0 3 0 5\n     |-- 0.0.0.0\n        /0 universe UNICAST\nLocal:\n  +-- 127.0.0.0/8 2 0 2\n     +-- 127.0.0.0/31 1 0 0\n" +
    "        |-- 127.0.0.0\n           /8 host LOCAL\n        |-- 127.0.0.1\n           /32 host LOCAL\nId 100:\n  |-- 0.0.0.0\n     /0 host LOCAL\n";

  test("a LOCAL route in a policy table is not this machine's: with a transparent proxy's table, public IPv4 stays allowed", () => {
    expect(localV4FromFibTrie(TPROXY_TRIE)).toEqual(["127.0.0.0/8", "127.0.0.1"]);
    const own = ownAddressesFrom(localV4FromFibTrie(TPROXY_TRIE));
    expect(["93.184.216.34", "8.8.8.8", "1.1.1.1"].map((ip) => verdict(ip, own))).toEqual(["93.184.216.34", "8.8.8.8", "1.1.1.1"].map(allowed));
    // Second layer: even inside "Local:" a /0 is not taken (see the next test).
    const realError = console.error;
    console.error = () => {};
    try {
      expect(localV4FromFibTrie(TPROXY_TRIE.replace("Id 100:", "Local:"))).toEqual(["127.0.0.0/8", "127.0.0.1"]);
    } finally {
      console.error = realError;
    }
  });

  test("a kernel range wider than /8 is not taken as own, and is reported once; 127.0.0.0/8 and a /8 are taken", () => {
    const said: string[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => { said.push(args.map(String).join(" ")); };
    try {
      const wide = "Local:\n  +-- 0.0.0.0/0 2 0 2\n     |-- 64.0.0.0\n        /2 host LOCAL\n     |-- 10.0.0.0\n        /8 host LOCAL\n" +
        "     |-- 127.0.0.0\n        /8 host LOCAL\n     |-- 96.0.0.0\n        /7 host LOCAL\n";
      expect(localV4FromFibTrie(wide)).toEqual(["10.0.0.0/8", "127.0.0.0/8"]);
      expect(localV4FromFibTrie(wide)).toEqual(["10.0.0.0/8", "127.0.0.0/8"]);
      expect(said.length).toBe(2);
      expect(said.filter((line) => line.includes("64.0.0.0/2")).length).toBe(1);
      expect(said.filter((line) => line.includes("96.0.0.0/7")).length).toBe(1);
      expect(said.every((line) => line.startsWith("[egress]") && line.includes("CBROWSER_OWN_ADDRESSES"))).toBe(true);
      expect(allowedEgressAddress("93.184.216.34", ownAddressesFrom(localV4FromFibTrie(wide)))).toBe(true);
    } finally {
      console.error = realError;
    }
  });

  // /proc/net/ipv6_route lists the routes of every table, the local one
  // included; RTF_LOCAL (0x80000000) marks a route the kernel answers itself.
  // Lines in the kernel's format; the first five as written by 6.8.0 in a
  // private namespace on 2026-11-12, with public prefixes put in place of the
  // documentation ones that namespace used. An IPv6 block routed to the
  // machine with "ip -6 route add local" is on no interface, so
  // /proc/net/if_inet6 does not list it (review of 2026-11-12, lookup-4).
  const route6 = (dest: string, plen: number, flags: string, dev: string): string =>
    `${dest} ${plen.toString(16).padStart(2, "0")} ${"0".repeat(32)} 00 ${"0".repeat(32)} 00000400 00000001 00000000 ${flags} ${dev.padStart(8)}`;
  const IPV6_ROUTE = [
    route6("26075300006200000000000000000000", 48, "80000001", "lo"), // table 100
    route6("26060000000000000000000000000000", 24, "80000001", "lo"), // table 100, wider than /32
    route6("00000000000000000000000000000000", 0, "80000001", "lo"), // table 100, ::/0
    route6("00000000000000000000000000000001", 128, "80200001", "lo"),
    route6("260753000061aa000000000000000000", 56, "80000001", "lo"),
    route6("260753000061cc000000000000000000", 56, "00000001", "eth0"), // a route out, not local
    route6("fd4d61696c636f770000000000000000", 128, "00300001", "br0"), // anycast, not local
    "not a line of this file",
    "26075300006100000000000000000000 40",
    "",
  ].join("\n");

  test("IPv6 local routes are read from every table, /32 and longer, and a wider one is reported once and not taken", () => {
    const said: string[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => { said.push(args.map(String).join(" ")); };
    try {
      expect(localV6FromIpv6Route(IPV6_ROUTE)).toEqual([
        "2607:5300:0062:0000:0000:0000:0000:0000/48",
        "0000:0000:0000:0000:0000:0000:0000:0001/128",
        "2607:5300:0061:aa00:0000:0000:0000:0000/56",
      ]);
      expect(localV6FromIpv6Route(IPV6_ROUTE).length).toBe(3);
      expect(localV6FromIpv6Route("")).toEqual([]);
      expect(said.length).toBe(2);
      expect(said.filter((line) => line.includes("2606:0000:0000:0000:0000:0000:0000:0000/24")).length).toBe(1);
      expect(said.filter((line) => line.includes("0000:0000:0000:0000:0000:0000:0000:0000/0")).length).toBe(1);
    } finally {
      console.error = realError;
    }
    const own = ownAddressesFrom(localV6FromIpv6Route(IPV6_ROUTE));
    const mine = ["2607:5300:61:aa01::5", "2607:5300:61:aaff:ffff:ffff:ffff:ffff", "2607:5300:62:ffff::1", "2607:5300:62::"];
    expect(mine.map((ip) => verdict(ip, own))).toEqual(mine.map(refused));
    const notMine = ["2607:5300:61:ab00::1", "2607:5300:61:a9ff::1", "2607:5300:61:cc00::1", "2606:4700::1111", "2a00:1450::1", "2607:5300:63::1"];
    expect(notMine.map((ip) => verdict(ip, own))).toEqual(notMine.map(allowed));
  });

  test("kernelLocalAddresses reads the three files, uses the ones that can be read, and never throws", () => {
    const asked: string[] = [];
    const text = (path: string): string => (path.endsWith("fib_trie") ? FIB_TRIE : path.endsWith("ipv6_route") ? IPV6_ROUTE : IF_INET6);
    const realError = console.error;
    console.error = () => {};
    let all: string[];
    try {
      all = kernelLocalAddresses((path) => { asked.push(path); return text(path); });
    } finally {
      console.error = realError;
    }
    expect(asked).toEqual(["/proc/net/fib_trie", "/proc/net/if_inet6", "/proc/net/ipv6_route"]);
    expect(all).toContain("198.50.100.8");
    expect(all).toContain("2607:5300:0061:00aa:0000:0000:0000:0001");
    expect(all).toContain("2607:5300:0061:aa00:0000:0000:0000:0000/56");
    expect(kernelLocalAddresses((path) => (path.endsWith("ipv6_route") ? IPV6_ROUTE.split("\n").slice(3).join("\n") : null)))
      .toEqual(["0000:0000:0000:0000:0000:0000:0000:0001/128", "2607:5300:0061:aa00:0000:0000:0000:0000/56"]);
    const both = all;
    expect(both).toContain("2607:5300:0061:00aa:0000:0000:0000:0001");
    expect(kernelLocalAddresses((path) => (path.endsWith("fib_trie") ? null : IF_INET6))).toEqual(v6FromIfInet6(IF_INET6));
    expect(kernelLocalAddresses((path) => (path.endsWith("fib_trie") ? FIB_TRIE : null))).toEqual(localV4FromFibTrie(FIB_TRIE));
    expect(kernelLocalAddresses(() => null)).toEqual([]);
    expect(kernelLocalAddresses(() => { throw new Error("EACCES"); })).toEqual([]);
    expect(kernelLocalAddresses(() => "nothing a kernel wrote")).toEqual([]);
  });

  test("ownAddresses() adds the kernel's table to the interface list: an address on an interface that is down is own", () => {
    setOwnEnv(undefined);
    const realError = console.error;
    console.error = () => {};
    let withTable: ReturnType<typeof ownAddresses>;
    try {
      withTable = ownAddresses((clock += 120_000), () =>
        kernelLocalAddresses((path) => (path.endsWith("fib_trie") ? FIB_TRIE : path.endsWith("ipv6_route") ? IPV6_ROUTE : IF_INET6)));
    } finally {
      console.error = realError;
    }
    const mine = ["198.50.100.8", "203.0.112.77", "2607:5300:61:aa::1", "2607:5300:61:aa01::5"];
    expect(mine.map((ip) => verdict(ip, withTable))).toEqual(mine.map(refused));
    expect(withTable.v4.has("172.26.0.1")).toBe(true);
    // The interface addresses are there as well, and a neighbour of a kernel address is not own.
    for (const entry of interfaces) expect(`${entry.address}: ${allowedEgressAddress(entry.address, withTable)}`).toBe(`${entry.address}: false`);
    expect(verdict("198.50.100.9", withTable)).toBe(allowed("198.50.100.9"));
    // Control: the same reading without the table has none of them.
    const without = ownAddresses((clock += 120_000), () => []);
    expect(mine.map((ip) => verdict(ip, without))).toEqual(mine.map(allowed));
  });

  // Read here with one regular expression over the whole text, not line by
  // line as the module reads it. On a machine with an interface that is down
  // (this one has two such bridges) the interface list alone fails this test.
  const procText = (path: string): string | null => { try { return readFileSync(path, "latin1"); } catch { return null; } };
  const trie = process.platform === "linux" ? procText("/proc/net/fib_trie") : null;
  const inet6 = process.platform === "linux" ? procText("/proc/net/if_inet6") : null;
  const route6Text = process.platform === "linux" ? procText("/proc/net/ipv6_route") : null;

  test.skipIf(!trie)("every address in this machine's kernel local table is in the own set, whether its interface is up or not", async () => {
    await withOwnEnv(undefined, () => {
      const own = ownAddresses();
      const local = [...new Set([...(trie as string).matchAll(/\|-- (\d+\.\d+\.\d+\.\d+)\n\s+\/32 host LOCAL/g)].map((m) => m[1]))];
      expect(local).toContain("127.0.0.1");
      expect(local.filter((ip) => !own.v4.has(ip))).toEqual([]);
      expect(local.filter((ip) => allowedEgressAddress(ip))).toEqual([]);
      const v6 = [...(inet6 ?? "").matchAll(/^([0-9a-f]{32}) /gm)].map((m) => (m[1].match(/.{4}/g) as string[]).join(":"));
      expect(v6.filter((ip) => ![...ownAddressesFrom([ip]).v6].every((key) => own.v6.has(key)))).toEqual([]);
      expect(v6.filter((ip) => allowedEgressAddress(ip))).toEqual([]);
      // Every IPv6 route the kernel answers itself, /32 or longer, in any table: its first and last address are own.
      const routes = [...(route6Text ?? "").matchAll(/^([0-9a-f]{32}) ([0-9a-f]{2}) (?:\S+ ){6}([0-9a-f]{8}) /gm)]
        .filter((m) => (parseInt(m[3], 16) & 0x80000000) !== 0 && parseInt(m[2], 16) >= 32);
      if (route6Text) expect(routes.length).toBeGreaterThan(0);
      const edges = routes.flatMap((m) => {
        const bits = parseInt(m[2], 16);
        const first = BigInt(`0x${m[1]}`);
        const last = first | ((1n << BigInt(128 - bits)) - 1n);
        return [first, last].map((n) => (n.toString(16).padStart(32, "0").match(/.{4}/g) as string[]).join(":"));
      });
      expect(edges.filter((ip) => allowedEgressAddress(ip))).toEqual([]);
    });
  });

  test("the reading is kept for 30 seconds and then made again", () => {
    setOwnEnv(undefined);
    const t = (clock += 120_000);
    const first = ownAddresses(t);
    expect(first.v4.has("93.184.216.34")).toBe(false);
    setOwnEnv("93.184.216.34");
    expect(ownAddresses(t)).toBe(first);
    expect(ownAddresses(t + 29_999)).toBe(first);
    expect(ownAddresses(t + 29_999).v4.has("93.184.216.34")).toBe(false);
    const second = ownAddresses(t + 30_000);
    expect(second).not.toBe(first);
    expect(second.v4.has("93.184.216.34")).toBe(true);
    clock = t + 30_000;
  });

  test("a reading made under a later clock is not served to an earlier one (a clock set back must not freeze the set)", () => {
    setOwnEnv(undefined);
    const t = (clock += 120_000);
    const late = ownAddresses(t);
    setOwnEnv("93.184.216.34");
    const early = ownAddresses(t - 1_000);
    expect(early).not.toBe(late);
    expect(early.v4.has("93.184.216.34")).toBe(true);
  });
});

describe("ISC-3: an IPv4 address gets one verdict however it is spelled", () => {
  // Uniform addresses rarely land in a /24, so half the cases sit within three
  // addresses of the start or the end of a special block.
  const nearEdge = fc.tuple(fc.constantFrom(...V4_RANGES), fc.boolean(), fc.integer({ min: -3, max: 3 }))
    .map(([r, atStart, off]) => toDotted(Math.min(2 ** 32 - 1, Math.max(0, (atStart ? r.start : r.end) + off))));
  const anyV4 = fc.oneof(fc.ipV4(), nearEdge);

  test("v4-mapped and NAT64 spellings match the IPv4 verdict, v4-compatible is always refused, and the verdict is the block list's", () => {
    fc.assert(
      fc.property(anyV4, (ip) => {
        const want = !specialV4(ip);
        expect(verdict(ip)).toBe(want ? allowed(ip) : refused(ip));
        expect(sameReach(ip).map((s) => verdict(s))).toEqual(sameReach(ip).map(want ? allowed : refused));
        expect(compatible(ip).map((s) => verdict(s))).toEqual(compatible(ip).map(refused));
        expect(verdict(`[::ffff:${hexPair(ip)}]`)).toBe(want ? allowed(`[::ffff:${hexPair(ip)}]`) : refused(`[::ffff:${hexPair(ip)}]`));
      }),
      { numRuns: 10_000 },
    );
  });

  test("an own IPv4 address is refused in every spelling, and being own changes no other address", () => {
    fc.assert(
      fc.property(anyV4, anyV4, (ownIp, other) => {
        const own = ownAddressesFrom([ownIp]);
        const all = [ownIp, ...sameReach(ownIp), ...compatible(ownIp)];
        expect(all.map((s) => verdict(s, own))).toEqual(all.map(refused));
        if (other !== ownIp) {
          const others = [other, ...sameReach(other)];
          expect(others.map((s) => allowedEgressAddress(s, own))).toEqual(others.map((s) => allowedEgressAddress(s, NONE)));
        }
      }),
      { numRuns: 5_000 },
    );
  });

  test("an own IPv4 range refuses exactly the addresses inside it, in every spelling, and changes no address outside it", () => {
    fc.assert(
      fc.property(anyV4, fc.integer({ min: 0, max: 32 }), anyV4, fc.integer({ min: 0, max: 2 ** 32 - 1 }), (base, bits, other, offset) => {
        const own = ownAddressesFrom([`${base}/${bits}`]);
        // The range, worked out here with numbers alone.
        const size = 2 ** (32 - bits);
        const first = Math.floor(toNumber(base) / size) * size;
        const last = first + size - 1;
        const within = (ip: string): boolean => toNumber(ip) >= first && toNumber(ip) <= last;
        // A random address is rarely inside a small range, so one is taken from inside it too.
        const picked = toDotted(first + (offset % size));
        for (const ip of [base, picked, toDotted(first), toDotted(last)]) {
          const all = [ip, ...sameReach(ip)];
          expect(all.map((s) => verdict(s, own))).toEqual(all.map(refused));
        }
        const outside = [other, toDotted(Math.max(0, first - 1)), toDotted(Math.min(2 ** 32 - 1, last + 1))].filter((ip) => !within(ip));
        for (const ip of outside) {
          const all = [ip, ...sameReach(ip)];
          expect(all.map((s) => allowedEgressAddress(s, own))).toEqual(all.map(() => !specialV4(ip)));
        }
        // The spelling inside IPv6 names the same range: 96 more bits of prefix.
        const mapped = ownAddressesFrom([`::ffff:${base}/${bits + 96}`]);
        expect(mapped.v4Ranges.length + mapped.v4.size).toBe(1);
        expect(allowedEgressAddress(picked, mapped)).toBe(false);
        for (const ip of outside) expect(allowedEgressAddress(ip, mapped)).toBe(!specialV4(ip));
      }),
      { numRuns: 5_000 },
    );
  });

  test("an own IPv6 range refuses exactly the addresses that share its leading bits", () => {
    // Eight groups inside 2600::/7, where no special block lies, so every base is an address the class rule allows.
    const globalGroups = fc.array(fc.integer({ min: 0, max: 0xffff }), { minLength: 8, maxLength: 8 }).map((g) => [0x2600 | (g[0] & 0x1ff), ...g.slice(1)]);
    const text = (g: number[]): string => g.map((x) => x.toString(16)).join(":");
    const big = (g: number[]): bigint => g.reduce((n, x) => (n << 16n) | BigInt(x), 0n);
    fc.assert(
      fc.property(globalGroups, fc.integer({ min: 0, max: 128 }), fc.integer({ min: 0, max: 127 }), globalGroups, (base, bits, flip, other) => {
        const own = ownAddressesFrom([`${text(base)}/${bits}`]);
        const shares = (g: number[]): boolean => bits === 0 || big(g) >> BigInt(128 - bits) === big(base) >> BigInt(128 - bits);
        expect(allowedEgressAddress(text(base), NONE)).toBe(true);
        expect(allowedEgressAddress(text(base), own)).toBe(false);
        // The base with one bit turned: inside the range exactly when the bit lies after the prefix.
        const turned = [...base];
        turned[flip >> 4] ^= 0x8000 >> (flip & 15);
        expect(shares(turned)).toBe(flip >= bits);
        for (const g of [turned, other]) {
          expect(allowedEgressAddress(text(g), own)).toBe(allowedEgressAddress(text(g), NONE) && !shares(g));
          expect(allowedEgressAddress(`[${text(g).toUpperCase()}]`, own)).toBe(allowedEgressAddress(text(g), own));
        }
        // An IPv6 range says nothing about any IPv4 address.
        expect(allowedEgressAddress("8.8.8.8", own)).toBe(true);
        expect(allowedEgressAddress("::ffff:8.8.8.8", own)).toBe(true);
      }),
      { numRuns: 5_000 },
    );
  });

  test("the edges themselves: every block's first and last address and the address on either side", () => {
    for (const r of V4_RANGES) {
      for (const n of [r.start - 1, r.start, r.end, r.end + 1]) {
        if (n < 0 || n > 2 ** 32 - 1) continue;
        const ip = toDotted(n);
        const want = !specialV4(ip);
        const all = [ip, ...sameReach(ip)];
        expect(all.map((s) => verdict(s))).toEqual(all.map(want ? allowed : refused));
        expect(compatible(ip).map((s) => verdict(s))).toEqual(compatible(ip).map(refused));
      }
    }
  });

  test("an IPv6 address is allowed only inside 2000::/3, and brackets or capitals never change that", () => {
    fc.assert(
      fc.property(fc.ipV6(), (ip) => {
        const ok = allowedEgressAddress(ip, NONE);
        expect(allowedEgressAddress(`[${ip}]`, NONE)).toBe(ok);
        expect(allowedEgressAddress(ip.toUpperCase(), NONE)).toBe(ok);
        const first = ip.startsWith("::") ? 0 : parseInt(ip.split(":")[0], 16);
        const mappedOrNat64 = /^(::ffff:|0?64:ff9b::)/i.test(ip);
        if (ok && !mappedOrNat64) expect(first >> 13).toBe(1);
      }),
      { numRuns: 5_000 },
    );
  });
});

describe("resolveForEgress: one lookup, and every answer judged", () => {
  const PUBLIC = "93.184.216.34";
  function counting(answer: (host: string, call: number) => string[] | Promise<string[]>): { resolve: EgressResolver; asked: string[] } {
    const asked: string[] = [];
    return { asked, resolve: async (host) => { asked.push(host); return answer(host, asked.length); } };
  }
  const mustNotResolve: EgressResolver = async () => { throw new Error("an address is not looked up"); };

  test("an address is never looked up, with or without brackets", async () => {
    const r = counting(() => [PUBLIC]);
    expect(await resolveForEgress("8.8.8.8", { resolve: r.resolve })).toEqual({ ok: true, addresses: ["8.8.8.8"] });
    expect(await resolveForEgress("2606:4700:4700::1111", { resolve: r.resolve })).toEqual({ ok: true, addresses: ["2606:4700:4700::1111"] });
    expect(await resolveForEgress("[2606:4700:4700::1111]", { resolve: r.resolve })).toEqual({ ok: true, addresses: ["2606:4700:4700::1111"] });
    expect(await resolveForEgress("::ffff:8.8.8.8", { resolve: r.resolve })).toEqual({ ok: true, addresses: ["::ffff:8.8.8.8"] });
    // A refused address is refused as it stands: the resolver that would have called it public is not asked.
    for (const host of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "[::1]", "::1", "[::ffff:7f00:1]", "[fd00::1]", "[64:ff9b::7f00:1]", "0.0.0.0", "[::]"]) {
      const answer = await resolveForEgress(host, { resolve: r.resolve });
      expect(`${host}: ${JSON.stringify(answer)}`).toBe(`${host}: ${JSON.stringify(REFUSED_ADDRESS)}`);
    }
    expect(r.asked).toEqual([]);
    expect((await resolveForEgress("8.8.8.8", { resolve: mustNotResolve })).ok).toBe(true);
  });

  test("a name is looked up exactly once, and a name that would answer differently the second time is not asked twice", async () => {
    // A rebinding name: public for the first question, loopback for the next.
    const r = counting((_host, call) => (call === 1 ? [PUBLIC] : ["127.0.0.1"]));
    expect(await resolveForEgress("rebind.test", { resolve: r.resolve })).toEqual({ ok: true, addresses: [PUBLIC] });
    expect(r.asked).toEqual(["rebind.test"]);
    // Control, so the count can fail: the second question does get the loopback answer, and it is refused.
    expect((await resolveForEgress("rebind.test", { resolve: r.resolve })).ok).toBe(false);
    expect(r.asked).toEqual(["rebind.test", "rebind.test"]);
  });

  test("any refused answer refuses the name, wherever it stands in the list", async () => {
    const refusedReason = REFUSED_ADDRESS;
    for (const answers of [["127.0.0.1"], [PUBLIC, "127.0.0.1"], ["127.0.0.1", PUBLIC], [PUBLIC, "8.8.8.8", "10.0.0.1"], [PUBLIC, "::1"],
      [PUBLIC, "::ffff:7f00:1"], ["2606:4700:4700::1111", "fd00::1"], [PUBLIC, "64:ff9b::a00:1"], [PUBLIC, "::8.8.8.8"]]) {
      const r = counting(() => answers);
      expect(`${answers}: ${JSON.stringify(await resolveForEgress("mixed.test", { resolve: r.resolve }))}`).toBe(`${answers}: ${JSON.stringify(refusedReason)}`);
      expect(r.asked).toEqual(["mixed.test"]);
    }
    // Control: all answers public, all returned, in the resolver's order.
    const all = [PUBLIC, "2606:4700:4700::1111", "8.8.8.8", "::ffff:8.8.4.4"];
    expect(await resolveForEgress("public.test", { resolve: async () => all })).toEqual({ ok: true, addresses: all });
  });

  test("an answer that is not an address refuses, even under a decision that allows everything", async () => {
    const allowAll = (): boolean => true;
    expect((await resolveForEgress("cname.test", { resolve: async () => [PUBLIC, "other.test"], allow: allowAll })).ok).toBe(false);
    expect((await resolveForEgress("cname.test", { resolve: async () => [""], allow: allowAll })).ok).toBe(false);
    expect((await resolveForEgress("cname.test", { resolve: async () => ["127.1"], allow: allowAll })).ok).toBe(false);
    // Control: the same decision does pass real addresses, loopback included.
    expect(await resolveForEgress("cname.test", { resolve: async () => ["127.0.0.1"], allow: allowAll })).toEqual({ ok: true, addresses: ["127.0.0.1"] });
  });

  test("no answer, a failed lookup and an empty host refuse", async () => {
    const unresolved = UNRESOLVED;
    expect(await resolveForEgress("empty.test", { resolve: async () => [] })).toEqual(unresolved);
    expect(await resolveForEgress("nxdomain.test", { resolve: async () => { throw new Error("ENOTFOUND"); } })).toEqual(unresolved);
    expect(await resolveForEgress("throws.test", { resolve: (() => { throw new Error("thrown before any promise"); }) as EgressResolver })).toEqual(unresolved);
    // An answer that is not a list of addresses at all is no answer; it is not handed to a caller and it does not throw.
    for (const answer of [undefined, null, "93.184.216.34", { length: 1, 0: "93.184.216.34" }, 7]) {
      expect(await resolveForEgress("odd.test", { resolve: (async () => answer) as unknown as EgressResolver })).toEqual(unresolved);
    }
    expect(allowedEgressAddress(undefined as unknown as string, NONE)).toBe(false);
    expect(allowedEgressAddress(8 as unknown as string, NONE)).toBe(false);
    const r = counting(() => [PUBLIC]);
    expect(await resolveForEgress("", { resolve: r.resolve })).toEqual({ ok: false, reason: "no host", kind: "unresolved" });
    expect(await resolveForEgress("[]", { resolve: r.resolve })).toEqual({ ok: false, reason: "no host", kind: "unresolved" });
    expect(r.asked).toEqual([]);
  });

  test("a lookup that never answers is refused when the time allowed for it is over", async () => {
    let asked = 0;
    const never: EgressResolver = () => { asked++; return new Promise<string[]>(() => {}); };
    const started = performance.now();
    const answer = await resolveForEgress("silent.test", { resolve: never, lookupTimeoutMs: 40 });
    const took = performance.now() - started;
    expect(answer).toEqual(UNRESOLVED);
    expect(asked).toBe(1);
    expect(took).toBeGreaterThanOrEqual(30);
    expect(took).toBeLessThan(2_000);
    // Control: an answer inside the time allowed is used, so the limit is not what refuses everything.
    const slow: EgressResolver = (host) => new Promise((done) => setTimeout(() => done(host === "slow.test" ? [PUBLIC] : []), 20));
    expect(await resolveForEgress("slow.test", { resolve: slow, lookupTimeoutMs: 1_500 })).toEqual({ ok: true, addresses: [PUBLIC] });
    // An answer that comes after the limit is too late, even a public one.
    const late: EgressResolver = () => new Promise((done) => setTimeout(() => done([PUBLIC]), 200));
    expect((await resolveForEgress("late.test", { resolve: late, lookupTimeoutMs: 20 })).ok).toBe(false);
  });

  test("the default decision is the classifier with this machine's own addresses", async () => {
    await withOwnEnv(undefined, async () => {
      expect(await resolveForEgress("own.test", { resolve: async () => [PUBLIC] })).toEqual({ ok: true, addresses: [PUBLIC] });
      expect((await resolveForEgress(PUBLIC, { resolve: mustNotResolve })).ok).toBe(true);
    });
    await withOwnEnv(PUBLIC, async () => {
      const own = REFUSED_ADDRESS;
      expect(await resolveForEgress("own.test", { resolve: async () => [PUBLIC] })).toEqual(own);
      expect(await resolveForEgress("own.test", { resolve: async () => ["8.8.8.8", `::ffff:${PUBLIC}`] })).toEqual(own);
      expect(await resolveForEgress(PUBLIC, { resolve: mustNotResolve })).toEqual(own);
      expect((await resolveForEgress("8.8.8.8", { resolve: mustNotResolve })).ok).toBe(true);
    });
  });

  test("setEgressPolicyForTests replaces the lookup and the decision, an explicit policy still wins, and null restores the real ones", async () => {
    const testResolver = counting(() => ["127.0.0.1"]);
    setEgressPolicyForTests({ resolve: testResolver.resolve, allow: (ip) => ip === "127.0.0.1" });
    expect(await resolveForEgress("listener.test")).toEqual({ ok: true, addresses: ["127.0.0.1"] });
    expect(await resolveForEgress("127.0.0.1")).toEqual({ ok: true, addresses: ["127.0.0.1"] });
    expect((await resolveForEgress("8.8.8.8")).ok).toBe(false);
    expect(testResolver.asked).toEqual(["listener.test"]);
    // A policy passed to the call is used in place of the process-wide one, field by field.
    expect(await resolveForEgress("listener.test", { resolve: async () => ["127.0.0.2"] })).toEqual(REFUSED_ADDRESS);
    expect((await resolveForEgress("listener.test", { allow: (ip) => allowedEgressAddress(ip, NONE) })).ok).toBe(false);
    expect(testResolver.asked).toEqual(["listener.test", "listener.test"]);
    // The classifier itself never reads the test policy.
    expect(allowedEgressAddress("127.0.0.1")).toBe(false);

    setEgressPolicyForTests(null);
    expect((await resolveForEgress("127.0.0.1")).ok).toBe(false);
    expect((await resolveForEgress("8.8.8.8")).ok).toBe(true);
    expect((await resolveForEgress("listener.test", { resolve: async () => ["127.0.0.1"] })).ok).toBe(false);
    // The real lookup is back: it answers "localhost" itself, with loopback,
    // which is refused, where the test resolver's answer was let through.
    setEgressPolicyForTests({ resolve: async () => [PUBLIC] });
    expect((await resolveForEgress("localhost")).ok).toBe(true);
    setEgressPolicyForTests(null);
    expect(await resolveForEgress("localhost")).toEqual(REFUSED_ADDRESS);
    expect(testResolver.asked.length).toBe(2);
  });

  // Until 2026-11-12 the two kinds carried two texts, and both went back to a
  // hosted caller word for word (the gate's 403 page, llms_txt_validate's
  // per-link error), which listed the names that exist on the server's side
  // of its resolver (review, policy-5).
  test("a name that does not resolve and a name on a refused address are refused in the same words, and only kind tells them apart", async () => {
    const answers = [
      await resolveForEgress("no-such-name.test", { resolve: async () => [] }),
      await resolveForEgress("no-such-name.test", { resolve: async () => { throw new Error("ENOTFOUND"); } }),
      await resolveForEgress("silent.test", { resolve: () => new Promise<string[]>(() => {}), lookupTimeoutMs: 20 }),
      await resolveForEgress("db-internal.test", { resolve: async () => ["10.0.0.5"] }),
      await resolveForEgress("mixed.test", { resolve: async () => [PUBLIC, "127.0.0.1"] }),
      await resolveForEgress("10.0.0.5"),
      await resolveForEgress("cname.test", { resolve: async () => ["other.test"] }),
      await resolveForEgress("throws.test", { resolve: async () => [PUBLIC], allow: () => { throw new Error("the decision itself failed"); } }),
    ];
    expect(answers.map((a) => (a.ok ? "ok" : a.kind))).toEqual(["unresolved", "unresolved", "unresolved", "address", "address", "address", "address", "address"]);
    expect([...new Set(answers.map((a) => (a.ok ? "ok" : a.reason)))]).toEqual([REFUSAL]);
    expect(EGRESS_REFUSAL_REASON).toBe(REFUSAL);
    // The text says nothing a caller could tell the two apart by, and names no address.
    expect(REFUSAL).not.toMatch(/\d+\.\d+|private|reserved|own\b/);
  });

  // No caller in src passes lookupTimeoutMs, so the default is the limit a
  // hosted server runs with, and every other test here passes its own
  // (review of 2026-11-12, tests-2). The timer is watched, not waited for.
  test("with no limit passed, a lookup that never answers is given LOOKUP_TIMEOUT_MS, which is ten seconds", async () => {
    expect(LOOKUP_TIMEOUT_MS).toBe(10_000);
    expect(OWN_ADDRESSES_TTL_MS).toBe(30_000);
    const realSetTimeout = globalThis.setTimeout;
    const armed: number[] = [];
    // Ten seconds pass at once here; any other timer runs as it is.
    globalThis.setTimeout = ((fn: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
      armed.push(ms ?? 0);
      return realSetTimeout(fn, ms === 10_000 ? 0 : ms, ...rest);
    }) as unknown as typeof setTimeout;
    let asked = 0;
    const never: EgressResolver = () => { asked++; return new Promise<string[]>(() => {}); };
    let pending: ReturnType<typeof resolveForEgress>;
    // The timer is armed before resolveForEgress first waits, so the real setTimeout is back before anything else can run.
    try {
      pending = resolveForEgress("silent.test", { resolve: never });
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
    expect(armed).toEqual([10_000]);
    expect(await pending).toEqual(UNRESOLVED);
    expect(asked).toBe(1);
  });

  test("the lookup in force when none is passed is the shared one with its memory, and it answers names under localhost itself", async () => {
    setEgressPolicyForTests(null);
    egressLookup.clear();
    expect(egressLookup.stats().cached).toBe(0);
    // Loopback, so refused; and remembered, which only the shared lookup does.
    expect(await resolveForEgress("egress-policy-test.localhost")).toEqual(REFUSED_ADDRESS);
    expect(egressLookup.stats().cached).toBe(1);
    expect(await resolveForEgress("LOCALHOST.")).toEqual(REFUSED_ADDRESS);
    expect(egressLookup.stats().cached).toBe(2);
    // The answer is the addresses, v4 first, and the decision still runs on every call.
    expect(await resolveForEgress("egress-policy-test.localhost", { allow: () => true })).toEqual({ ok: true, addresses: ["127.0.0.1", "::1"] });
    expect(await resolveForEgress("egress-policy-test.localhost")).toEqual(REFUSED_ADDRESS);
    expect(egressLookup.stats().cached).toBe(2);
    // A resolver that is passed in is called as given and nothing of it is remembered.
    let asked = 0;
    for (let i = 0; i < 3; i++) await resolveForEgress("passed-in.test", { resolve: async () => { asked++; return [PUBLIC]; } });
    expect(asked).toBe(3);
    expect(egressLookup.stats().cached).toBe(2);
    egressLookup.clear();
  });

  test("EgressRefused is an Error that names itself", () => {
    const e = new EgressRefused("the address is private");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("EgressRefused");
    expect(e.message).toBe("the address is private");
  });
});

describe("a hosted caller's proxy is judged by the same decision", () => {
  const PUBLIC = "93.184.216.34";
  const refusedBody = (r: Awaited<ReturnType<typeof refuseHostedProxy>>): string => (r ? JSON.parse(r.content[0].text).error : "accepted");
  const firstExternalV4 = Object.values(networkInterfaces()).flat().find((a) => a && a.family === "IPv4" && !a.internal)?.address;

  // On a server with a public address on its interface this is the case the
  // old private-range list let through. On a machine whose first address is
  // private it was refused before too, and the next test carries the proof.
  test.skipIf(!firstExternalV4)("on this machine's first non-internal IPv4 address: refused when hosted, accepted when not", async () => {
    const proxy = `http://${firstExternalV4}:3128`;
    const byName = (): { resolve: EgressResolver; asked: string[] } => {
      const asked: string[] = [];
      return { asked, resolve: async (host) => { asked.push(host); return [firstExternalV4 as string]; } };
    };
    await withOwnEnv(undefined, async () => {
      setHostedMode(true);
      expect(refusedBody(await refuseHostedProxy("t", proxy))).toBe("proxy_not_allowed");
      expect(refusedBody(await refuseHostedProxy("t", `${firstExternalV4}:3128`))).toBe("proxy_not_allowed");
      expect(refusedBody(await refuseHostedProxy("t", `http://[::ffff:${firstExternalV4}]:3128`))).toBe("proxy_not_allowed");
      const pinned = await pinHostedProxy("t", proxy);
      expect(pinned.ok).toBe(false);
      expect(JSON.stringify(pinned)).toContain("proxy_not_allowed");
      const a = byName();
      expect(refusedBody(await refuseHostedProxy("t", "http://box.test:3128", a.resolve))).toBe("proxy_not_allowed");
      const b = byName();
      expect((await pinHostedProxy("t", "http://u:p@box.test:3128", b.resolve)).ok).toBe(false);
      expect([a.asked, b.asked]).toEqual([["box.test"], ["box.test"]]);

      setHostedMode(false);
      expect(await refuseHostedProxy("t", proxy)).toBeNull();
      expect(await pinHostedProxy("t", proxy)).toEqual({ ok: true, proxy });
      const c = byName();
      expect(await refuseHostedProxy("t", "http://box.test:3128", c.resolve)).toBeNull();
      expect(await pinHostedProxy("t", "http://box.test:3128", c.resolve)).toEqual({ ok: true, proxy: "http://box.test:3128" });
      expect(c.asked).toEqual([]);
    });
  });

  test("on a public address that is the server's own: refused when hosted, in every spelling and by name; accepted when it is not the server's", async () => {
    const proxies = [`http://${PUBLIC}:3128`, `${PUBLIC}:3128`, `socks5://${PUBLIC}:1080`, `https://${PUBLIC}:443`, `http://u:p@${PUBLIC}:3128`,
      `http://[::ffff:${PUBLIC}]:3128`, `http://[::ffff:${hexPair(PUBLIC)}]:3128`, `http://[64:ff9b::${hexPair(PUBLIC)}]:3128`];
    // Control: the same address, when it is not this server's, is an ordinary public proxy.
    await withOwnEnv(undefined, async () => {
      setHostedMode(true);
      for (const p of proxies) {
        expect(`${p}: ${refusedBody(await refuseHostedProxy("t", p))}`).toBe(`${p}: accepted`);
        expect(`${p}: ${(await pinHostedProxy("t", p)).ok}`).toBe(`${p}: true`);
      }
      expect(await pinHostedProxy("t", "http://own.test:3128", async () => [PUBLIC])).toEqual({ ok: true, proxy: `http://${PUBLIC}:3128/` });
      expect(await pinHostedProxy("t", "http://own.test:3128", async () => ["2606:4700:4700:1111::5"])).toEqual({ ok: true, proxy: "http://[2606:4700:4700:1111::5]:3128/" });
    });
    await withOwnEnv(`${PUBLIC},2606:4700:4700:1111::1`, async () => {
      setHostedMode(true);
      for (const p of proxies) {
        expect(`${p}: ${refusedBody(await refuseHostedProxy("t", p))}`).toBe(`${p}: proxy_not_allowed`);
        expect(`${p}: ${(await pinHostedProxy("t", p)).ok}`).toBe(`${p}: false`);
      }
      // By name: one own answer among public ones refuses, and so does any address of the own IPv6 /64.
      for (const answers of [[PUBLIC], ["8.8.8.8", PUBLIC], [PUBLIC, "8.8.8.8"], ["2606:4700:4700:1111::5"], ["8.8.8.8", `::ffff:${PUBLIC}`]]) {
        expect(`${answers}: ${refusedBody(await refuseHostedProxy("t", "http://own.test:3128", async () => answers))}`).toBe(`${answers}: proxy_not_allowed`);
        expect(`${answers}: ${(await pinHostedProxy("t", "http://own.test:3128", async () => answers)).ok}`).toBe(`${answers}: false`);
      }
      expect(refusedBody(await refuseHostedProxy("t", "http://[2606:4700:4700:1111::9]:3128"))).toBe("proxy_not_allowed");
      // Other public proxies are untouched.
      expect(await refuseHostedProxy("t", "http://8.8.8.8:3128")).toBeNull();
      expect(await pinHostedProxy("t", "http://other.test:3128", async () => ["93.184.216.35"])).toEqual({ ok: true, proxy: "http://93.184.216.35:3128/" });
      expect(await refuseHostedProxy("t", "http://[2606:4700:4700:1112::9]:3128")).toBeNull();

      // Not hosted: the caller's own machine, nothing is judged and nothing is looked up.
      setHostedMode(false);
      const mustNotResolve: EgressResolver = async () => { throw new Error("not hosted: no lookup"); };
      for (const p of proxies) {
        expect(await refuseHostedProxy("t", p, mustNotResolve)).toBeNull();
        expect(await pinHostedProxy("t", p, mustNotResolve)).toEqual({ ok: true, proxy: p });
      }
      expect(await pinHostedProxy("t", "http://own.test:3128", mustNotResolve)).toEqual({ ok: true, proxy: "http://own.test:3128" });
    });
  });

  test("address classes the old private-range list passed are refused when hosted, and public ones still pass", async () => {
    await withOwnEnv(undefined, async () => {
      // Documentation, benchmarking, protocol-assignment and 6to4-relay IPv4;
      // documentation, 6to4, Teredo, discard-only and never-assigned IPv6; and
      // the v4-compatible spelling of a public IPv4 address.
      const newlyRefused = ["http://192.0.2.10:3128", "http://198.51.100.10:3128", "http://203.0.113.10:3128", "http://198.18.0.1:3128", "http://198.19.255.254:3128",
        "http://192.0.0.8:3128", "http://192.88.99.1:3128", "http://[2001:db8::1]:3128", "http://[3fff::1]:3128", "http://[2002:7f00:1::1]:3128", "http://[2001::1]:3128",
        "http://[100::1]:3128", "http://[4000::1]:3128", "http://[::8.8.8.8]:3128", "http://[::808:808]:3128", "http://[::ffff:c000:20a]:3128", "http://[64:ff9b::c612:1]:3128"];
      const stillAccepted = ["http://8.8.8.8:3128", "8.8.8.8:3128", "socks5://1.1.1.1:1080", "http://[2606:4700:4700::1111]:3128", "http://[::ffff:8.8.8.8]:3128",
        "http://[64:ff9b::808:808]:3128", "http://192.0.1.1:3128", "http://198.20.0.1:3128", "http://[2001:200::1]:3128", "http://[2003::1]:3128"];
      setHostedMode(true);
      for (const p of newlyRefused) {
        expect(`${p}: ${refusedBody(await refuseHostedProxy("t", p))}`).toBe(`${p}: proxy_not_allowed`);
        expect(`${p}: ${(await pinHostedProxy("t", p)).ok}`).toBe(`${p}: false`);
      }
      expect((await pinHostedProxy("t", "http://doc.test:3128", async () => ["8.8.8.8", "192.0.2.10"])).ok).toBe(false);
      // Every answer was judged, and the proxy is pinned to the first of them.
      expect(await pinHostedProxy("t", "http://two.test:3128", async () => ["8.8.8.8", "93.184.216.35"])).toEqual({ ok: true, proxy: "http://8.8.8.8:3128/" });
      for (const p of stillAccepted) {
        expect(`${p}: ${refusedBody(await refuseHostedProxy("t", p))}`).toBe(`${p}: accepted`);
        expect(await pinHostedProxy("t", p)).toEqual({ ok: true, proxy: p });
      }
      setHostedMode(false);
      for (const p of newlyRefused) expect(`${p}: ${refusedBody(await refuseHostedProxy("t", p))}`).toBe(`${p}: accepted`);
    });
  });

  // Until 2026-11-12 the proxy check did its own lookup with no time limit,
  // while egress.ts said it went through resolveForEgress: with a resolver
  // that never answered, pinHostedProxy was still waiting 15 seconds later
  // (review, policy-6).
  test("a proxy name whose lookup never answers is refused when the lookup's time is over, by the check and by the pin", async () => {
    await withOwnEnv(undefined, async () => {
      setHostedMode(true);
      setEgressPolicyForTests({ lookupTimeoutMs: 40 });
      let asked = 0;
      const never: EgressResolver = () => { asked++; return new Promise<string[]>(() => {}); };
      const stillWaiting = (): Promise<string> => new Promise((done) => setTimeout(() => done("still waiting after 2 s"), 2_000));
      const started = performance.now();
      expect(await Promise.race([pinHostedProxy("t", "http://silent.test:3128", never).then((r) => (r.ok ? "accepted" : "refused")), stillWaiting()])).toBe("refused");
      expect(await Promise.race([refuseHostedProxy("t", "http://silent.test:3128", never).then(refusedBody), stillWaiting()])).toBe("proxy_not_allowed");
      expect(performance.now() - started).toBeLessThan(1_500);
      expect(asked).toBe(2);
      // Control: the same name, answered in time, is pinned to the answer, so the limit is not what refuses.
      expect(await pinHostedProxy("t", "http://silent.test:3128", async () => [PUBLIC])).toEqual({ ok: true, proxy: `http://${PUBLIC}:3128/` });
    });
  }, 10_000);

  test("the proxy check goes through resolveForEgress: one lookup per check, and the process-wide test lookup when none is passed", async () => {
    await withOwnEnv(undefined, async () => {
      setHostedMode(true);
      const asked: string[] = [];
      setEgressPolicyForTests({ resolve: async (host) => { asked.push(host); return host === "public-proxy.test" ? [PUBLIC] : ["10.0.0.5"]; } });
      expect(await pinHostedProxy("t", "http://public-proxy.test:3128")).toEqual({ ok: true, proxy: `http://${PUBLIC}:3128/` });
      expect(refusedBody(await refuseHostedProxy("t", "http://public-proxy.test:3128"))).toBe("accepted");
      expect((await pinHostedProxy("t", "http://inside-proxy.test:3128")).ok).toBe(false);
      expect(asked).toEqual(["public-proxy.test", "public-proxy.test", "inside-proxy.test"]);
      // A resolver passed to the call still wins over the process-wide one, and an address is not looked up.
      expect(await pinHostedProxy("t", "http://public-proxy.test:3128", async () => ["8.8.8.8"])).toEqual({ ok: true, proxy: "http://8.8.8.8:3128/" });
      expect(await pinHostedProxy("t", "http://8.8.4.4:3128")).toEqual({ ok: true, proxy: "http://8.8.4.4:3128" });
      expect(asked.length).toBe(3);
      // A test decision that lets loopback through for the gate does not open the proxy check: it keeps the real decision as well.
      setEgressPolicyForTests({ resolve: async () => ["127.0.0.1"], allow: () => true });
      expect((await pinHostedProxy("t", "http://loop.test:3128")).ok).toBe(false);
      expect((await pinHostedProxy("t", "http://127.0.0.1:3128")).ok).toBe(false);
      // "localhost" is refused without any lookup, as before.
      expect((await pinHostedProxy("t", "http://localhost:3128", async () => { throw new Error("localhost is not looked up"); })).ok).toBe(false);
    });
  });
});

describe("the egress lookup stays off getaddrinfo", () => {
  // dns.lookup is getaddrinfo on libuv's thread pool, two at a time for the
  // whole process: a few slow names stopped every other account's lookups
  // (review of 2026-11-12, regression-1). The modules that look a caller's
  // name up may take the c-ares Resolver from node:dns and nothing else.
  const SRC = join(import.meta.dir, "..", "src");
  const dnsImports = (text: string): string[] => [...text.matchAll(/import\s+([^;]+?)\s+from\s+["']node:dns(?:\/promises)?["']/g)].map((m) => m[1].replace(/\s+/g, " "));
  /** Comment lines say why getaddrinfo is not used, by name; only code is searched for a use of it. */
  const code = (text: string): string => text.split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");
  const usesLookup = (text: string): boolean => /\bdns(\.promises)?\.lookup\b|\brequire\(["'](node:)?dns/.test(code(text));

  test("egress.ts imports only Resolver from node:dns, and the hosted proxy check imports nothing from it", () => {
    const egress = readFileSync(join(SRC, "egress.ts"), "utf8");
    const hostedInputs = readFileSync(join(SRC, "mcp-tools", "hosted-inputs.ts"), "utf8");
    expect(dnsImports(egress)).toEqual(["{ Resolver }"]);
    expect(dnsImports(hostedInputs)).toEqual([]);
    expect([usesLookup(egress), usesLookup(hostedInputs)]).toEqual([false, false]);
  });

  test("absence test: the scan finds a lookup import, a namespace import and a call when they are there", () => {
    expect(dnsImports(`import { lookup } from "node:dns/promises";\nimport { Resolver, lookup as l } from 'node:dns';\nimport * as dns from "node:dns";`)).toEqual(["{ lookup }", "{ Resolver, lookup as l }", "* as dns"]);
    expect([usesLookup("await dns.promises.lookup(host)"), usesLookup("dns.lookup(host, cb)"), usesLookup(`const dns = require("node:dns");`), usesLookup("egressLookup(host)"),
      usesLookup(" * not with dns.lookup, which is getaddrinfo"), usesLookup("  // dns.lookup was here")]).toEqual([true, true, true, false, false, false]);
  });
});

describe("the test-only switch stays out of the product", () => {
  const SRC = join(import.meta.dir, "..", "src");
  const NAME = "setEgressPolicyForTests";
  const HOME = "egress.ts";

  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out.push(...sources(p));
      else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name)) out.push(p);
    }
    return out;
  }

  /** Files other than src/egress.ts whose text names the switch at all: an import, a re-export, a call or a comment. */
  function mentions(files: Array<{ file: string; text: string }>): string[] {
    return files.filter((f) => f.file !== HOME && f.text.includes(NAME)).map((f) => f.file);
  }
  /** Lines of code in a file that call the switch. */
  function calls(text: string): string[] {
    return text.split("\n").map((l) => l.trim()).filter((l) => !/^(\/\/|\*|\/\*)/.test(l) && l.includes(`${NAME}(`) && !l.startsWith("export function "));
  }

  const files = sources(SRC).map((p) => ({ file: relative(SRC, p), text: readFileSync(p, "utf8") }));

  test("no file under src except egress.ts mentions setEgressPolicyForTests", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.file === HOME && f.text.includes(`export function ${NAME}(`))).toBe(true);
    expect(mentions(files)).toEqual([]);
  });

  test("egress.ts defines it and does not call it", () => {
    const home = files.find((f) => f.file === HOME);
    expect(calls(home?.text ?? `${NAME}(`)).toEqual([]);
  });

  test("absence test: the scan finds an import, a re-export, a call and a nested file when they are there", () => {
    const planted = [
      { file: HOME, text: `export function ${NAME}(policy) {}` },
      { file: "egress-gate.ts", text: `import { ${NAME} } from "./egress.js";` },
      { file: "index.ts", text: `export { ${NAME} } from "./egress.js";` },
      { file: join("mcp-tools", "hosted-inputs.ts"), text: `  ${NAME}({ allow: () => true });` },
      { file: join("visual", HOME), text: `// see ${NAME}` },
      { file: "clean.ts", text: "export const nothing = 1;" },
    ];
    expect(mentions(planted)).toEqual(["egress-gate.ts", "index.ts", join("mcp-tools", "hosted-inputs.ts"), join("visual", HOME)]);
    expect(calls(`export function ${NAME}(policy) {\n  testPolicy = policy;\n}\n// ${NAME}(null) in a comment\nif (x) ${NAME}({ allow: () => true });`)).toEqual([`if (x) ${NAME}({ allow: () => true });`]);
  });
});
