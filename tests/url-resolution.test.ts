/**
 * The domain gate must run on where a URL GOES, not where it was typed.
 *
 * `ucdenver.edu` is a registered domain and 301s to `cudenver.edu`, which is
 * not. Reproduced 2026-08-03 with curl: one hop from the www host, two from the
 * apex. So an entire session's analyses were accepted against the registered
 * domain and performed against the unregistered one -- unregistered domains
 * reachable by redirect were analysable at no charge, and the results named the
 * requested URL while describing a different site.
 *
 * Resolution is a server-side fetch of a caller-supplied URL, which is its own
 * hazard, so these tests pin the constraints as hard as the behaviour.
 *
 * @since 2026-08-03
 */
import { test, expect, describe } from "bun:test";
import { resolveFinalUrl, isPrivateHost, sameSite } from "../src/url-resolution.js";
import { EgressRefused } from "../src/egress.js";

/** A fetch stand-in driven by a hop table, so no test touches the network. */
function fakeFetch(chain: Record<string, { status: number; location?: string }>) {
  const seen: string[] = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    seen.push(u);
    (impl as unknown as { lastInit: RequestInit | undefined }).lastInit = init;
    const hop = chain[u];
    if (!hop) throw new Error(`no stub for ${u}`);
    return {
      status: hop.status,
      headers: { get: (h: string) => (h.toLowerCase() === "location" ? hop.location ?? null : null) },
    } as unknown as Response;
  }) as unknown as typeof fetch & { seen: string[]; lastInit?: RequestInit };
  (impl as unknown as { seen: string[] }).seen = seen;
  return impl;
}

describe("the reported case", () => {
  test("a cross-domain redirect is followed and reported as a host change", async () => {
    const f = fakeFetch({
      "https://www.ucdenver.edu/academics": { status: 301, location: "https://www.cudenver.edu/academics" },
      "https://www.cudenver.edu/academics": { status: 200 },
    });
    const r = await resolveFinalUrl("https://www.ucdenver.edu/academics", f);
    expect(r.finalUrl).toBe("https://www.cudenver.edu/academics");
    expect(r.hostChanged).toBe(true);
    expect(r.finalHost).toBe("www.cudenver.edu");
    expect(r.hops).toBe(1);
    expect(r.error).toBeUndefined();
  });

  test("multiple hops resolve to the end of the chain", async () => {
    const f = fakeFetch({
      "https://ucdenver.edu/": { status: 301, location: "https://www.ucdenver.edu/" },
      "https://www.ucdenver.edu/": { status: 301, location: "https://www.cudenver.edu/" },
      "https://www.cudenver.edu/": { status: 200 },
    });
    const r = await resolveFinalUrl("https://ucdenver.edu/", f);
    expect(r.finalHost).toBe("www.cudenver.edu");
    expect(r.hops).toBe(2);
  });

  test("a www redirect within one site is NOT a host change", async () => {
    // Gating must not start denying example.com because it redirects to
    // www.example.com, which is most of the web.
    const f = fakeFetch({
      "https://example.com/": { status: 301, location: "https://www.example.com/" },
      "https://www.example.com/": { status: 200 },
    });
    const r = await resolveFinalUrl("https://example.com/", f);
    expect(r.hops).toBe(1);
    expect(r.hostChanged).toBe(false);
  });

  test("no redirect leaves everything alone", async () => {
    const f = fakeFetch({ "https://cbrowser.ai/": { status: 200 } });
    const r = await resolveFinalUrl("https://cbrowser.ai/", f);
    expect(r.finalUrl).toBe("https://cbrowser.ai/");
    expect(r.hostChanged).toBe(false);
    expect(r.hops).toBe(0);
  });
});

describe("failure returns the input, because denying on failure breaks the web", () => {
  test("a server that rejects HEAD ends the chain rather than erroring", async () => {
    const f = fakeFetch({ "https://example.com/": { status: 405 } });
    const r = await resolveFinalUrl("https://example.com/", f);
    expect(r.finalUrl).toBe("https://example.com/");
    expect(r.error).toBeUndefined();
  });

  test("a network failure returns the input with the reason attached", async () => {
    const f = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    const r = await resolveFinalUrl("https://example.com/", f);
    expect(r.finalUrl).toBe("https://example.com/");
    expect(r.error).toContain("ECONNREFUSED");
  });

  test("a redirect loop stops at the hop cap", async () => {
    const f = fakeFetch({
      "https://a.example/": { status: 302, location: "https://b.example/" },
      "https://b.example/": { status: 302, location: "https://a.example/" },
    });
    const r = await resolveFinalUrl("https://a.example/", f);
    expect(r.error).toContain("more than");
    expect(r.hops).toBeLessThanOrEqual(6);
  });

  test("a non-http scheme is refused before any request is made", async () => {
    const f = fakeFetch({});
    const r = await resolveFinalUrl("file:///etc/passwd", f);
    expect(r.error).toContain("unsupported protocol");
    expect((f as unknown as { seen: string[] }).seen).toEqual([]);
  });
});

describe("resolution does not become an SSRF primitive", () => {
  test("a redirect into private space is refused, not followed", async () => {
    const f = fakeFetch({
      "https://evil.example/": { status: 302, location: "http://169.254.169.254/latest/meta-data/" },
    });
    const r = await resolveFinalUrl("https://evil.example/", f);
    expect(r.error).toContain("private address space");
    // The decisive assertion: the metadata endpoint was never requested.
    expect((f as unknown as { seen: string[] }).seen).toEqual(["https://evil.example/"]);
  });

  test("redirects are followed manually so a hop can be inspected before it runs", async () => {
    const f = fakeFetch({
      "https://example.com/": { status: 301, location: "https://www.example.com/" },
      "https://www.example.com/": { status: 200 },
    });
    await resolveFinalUrl("https://example.com/", f);
    // With redirect:"follow" the runtime walks the chain itself and a hop into
    // private space is already requested by the time we see the result.
    expect((f as unknown as { lastInit?: RequestInit }).lastInit?.redirect).toBe("manual");
    expect((f as unknown as { lastInit?: RequestInit }).lastInit?.credentials).toBe("omit");
  });

  test("every private range is covered, and public addresses are not", () => {
    for (const h of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.16.0.1", "172.31.255.255",
      "169.254.169.254", "100.64.0.1", "0.0.0.0", "localhost", "foo.internal", "::1", "fd00::1", "fe80::1"]) {
      expect({ h, private: isPrivateHost(h) }).toEqual({ h, private: true });
    }
    for (const h of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.0.1", "192.169.0.1",
      "100.128.0.1", "example.com", "www.cudenver.edu"]) {
      expect({ h, private: isPrivateHost(h) }).toEqual({ h, private: false });
    }
  });

  test("the IPv6 prefixes are read on IPv6 literals only: fda.gov is not unique-local", async () => {
    // The fc/fd test ran on every host, so a name that starts with those
    // letters read as private and a redirect to it was refused (2026-11-12).
    for (const h of ["fda.gov", "www.fda.gov", "fcc.gov", "fdic.gov", "fc2.com", "fd.io", "fe80.example"]) {
      expect({ h, private: isPrivateHost(h) }).toEqual({ h, private: false });
    }
    for (const h of ["fc00::1", "fd12:3456:789a::1", "[fd00::1]", "[fc00::abcd]", "FD00::1", "[::1]", "[fe80::1]"]) {
      expect({ h, private: isPrivateHost(h) }).toEqual({ h, private: true });
    }
    const f = fakeFetch({
      "https://fda.example/": { status: 301, location: "https://www.fda.gov/" },
      "https://www.fda.gov/": { status: 200 },
    });
    const r = await resolveFinalUrl("https://fda.example/", f);
    expect({ finalHost: r.finalHost, hops: r.hops, error: r.error }).toEqual({ finalHost: "www.fda.gov", hops: 1, error: undefined });
  });
});

describe("a hop the address check refuses at connection time", () => {
  /** A stand-in that refuses one URL the way hostedFetch does on a hosted server. */
  function refusing(chain: Record<string, { status: number; location?: string }>, refused: string) {
    const inner = fakeFetch(chain);
    const impl = (async (url: string | URL, init?: RequestInit) => {
      if (String(url) === refused) {
        (inner as unknown as { seen: string[] }).seen.push(String(url));
        throw new EgressRefused("a redirect is refused: the address is private, reserved, or this server's own");
      }
      return inner(url, init);
    }) as unknown as typeof fetch;
    return { impl, seen: (inner as unknown as { seen: string[] }).seen };
  }

  test("on a redirect hop it is reported as a blocked hop: the chain ends at the URL before it, with an error", async () => {
    const { impl, seen } = refusing({
      "https://a.example/": { status: 302, location: "https://b.example/" },
      "https://b.example/": { status: 302, location: "https://rebind.example/" },
    }, "https://rebind.example/");
    const r = await resolveFinalUrl("https://a.example/", impl);
    expect(r).toEqual({ requestedHost: "a.example", finalHost: "b.example", finalUrl: "https://b.example/", hops: 1, hostChanged: true,
      error: "redirect into private address space (rebind.example) refused" });
    expect(seen).toEqual(["https://a.example/", "https://b.example/", "https://rebind.example/"]);
  });

  test("on the first hop the input comes back with an error, so the gate keeps the requested host", async () => {
    const { impl } = refusing({}, "https://rebind.example/");
    const r = await resolveFinalUrl("https://rebind.example/", impl);
    expect(r).toEqual({ requestedHost: "rebind.example", finalHost: "rebind.example", finalUrl: "https://rebind.example/", hops: 0, hostChanged: false,
      error: "private address space (rebind.example) refused" });
  });

  /** An EgressRefused that carries a kind the way hostedFetch attaches one. */
  const refusedAs = (kind: string, message = "refused"): EgressRefused => Object.assign(new EgressRefused(message), { kind });

  test("a name that does not resolve is a failed fetch at that hop, not a refusal of private address space", async () => {
    // Every EgressRefused took the branch above until 2026-11-12, so a typo
    // or a DNS outage was written to the log as an attempt on the internal
    // network, and the chain was reported one hop short.
    const f = (async (url: string | URL) => {
      if (String(url) === "https://a.example/") return { status: 302, headers: { get: () => "https://typo.example/" } } as unknown as Response;
      throw refusedAs("unresolved", "a redirect is refused");
    }) as unknown as typeof fetch;
    const hop = await resolveFinalUrl("https://a.example/", f);
    expect(hop).toEqual({ requestedHost: "a.example", finalHost: "typo.example", finalUrl: "https://typo.example/", hops: 1, hostChanged: true,
      error: "fetch failed: the name typo.example did not resolve" });
    const first = await resolveFinalUrl("https://typo.example/", (async () => { throw refusedAs("unresolved"); }) as unknown as typeof fetch);
    expect(first).toEqual({ requestedHost: "typo.example", finalHost: "typo.example", finalUrl: "https://typo.example/", hops: 0, hostChanged: false,
      error: "fetch failed: the name typo.example did not resolve" });
  });

  test("a refused address, a refused scheme, and a refusal that names no kind all take the blocked-hop branch", async () => {
    for (const kind of ["address", "scheme", undefined]) {
      const f = (async (url: string | URL) => {
        if (String(url) === "https://a.example/") return { status: 302, headers: { get: () => "https://b.example/" } } as unknown as Response;
        throw kind ? refusedAs(kind) : new EgressRefused("refused");
      }) as unknown as typeof fetch;
      const r = await resolveFinalUrl("https://a.example/", f);
      expect({ kind, finalUrl: r.finalUrl, hops: r.hops, hostChanged: r.hostChanged, error: r.error })
        .toEqual({ kind, finalUrl: "https://a.example/", hops: 0, hostChanged: false, error: "redirect into private address space (b.example) refused" });
    }
  });

  test("any other failure of a hop is still a fetch failure at that hop", async () => {
    const f = (async (url: string | URL) => {
      if (String(url) === "https://a.example/") return { status: 302, headers: { get: () => "https://b.example/" } } as unknown as Response;
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const r = await resolveFinalUrl("https://a.example/", f);
    expect({ finalUrl: r.finalUrl, hops: r.hops, error: r.error }).toEqual({ finalUrl: "https://b.example/", hops: 1, error: "fetch failed: ECONNRESET" });
  });
});

describe("same-site comparison", () => {
  test("subdomains and parents count as the same site, unrelated hosts do not", () => {
    expect(sameSite("www.example.com", "example.com")).toBe(true);
    expect(sameSite("example.com", "www.example.com")).toBe(true);
    expect(sameSite("EXAMPLE.com", "example.COM")).toBe(true);
    expect(sameSite("ucdenver.edu", "cudenver.edu")).toBe(false);
    expect(sameSite("notexample.com", "example.com")).toBe(false);
  });
});
