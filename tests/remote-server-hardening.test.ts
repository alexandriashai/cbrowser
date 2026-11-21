/**
 * Three fixes from an outside review (2026-11-21) to `cbrowser mcp-remote`:
 * - an open server (no authentication) listens on loopback unless HOST says
 *   otherwise, and warns when it is reachable beyond this machine;
 * - CORS still answers any origin but no longer allows credentials;
 * - the rate-limit bucket is a SHA-256 prefix of the API key, not a 32-bit
 *   string hash, and an open server buckets by IP whatever key is sent.
 * The bind and CORS checks run the real server (tests/fixtures/identity-harness.ts)
 * as a child process. Launches no browser.
 */
import { afterEach, describe, expect, test } from "bun:test";
import fc from "fast-check";
import { mkdtempSync } from "node:fs";
import { createServer, connect } from "node:net";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import { defaultBindHost, openAccessWarning, rateLimitKey } from "../src/mcp-server-remote.js";

describe("rateLimitKey", () => {
  // The old bucket: Java-style 32-bit string hash. "Aa" and "BB" share one.
  const oldBucket = (k: string) => { let h = 0; for (let i = 0; i < k.length; i++) h = ((h << 5) - h + k.charCodeAt(i)) | 0; return `account:${h}`; };

  test("keys the old hash merged get their own buckets", () => {
    expect(oldBucket("cbk_Aa")).toBe(oldBucket("cbk_BB"));
    expect(rateLimitKey("cbk_Aa", "1.2.3.4", true)).not.toBe(rateLimitKey("cbk_BB", "1.2.3.4", true));
  });

  test("distinct keys never share a bucket", () => {
    fc.assert(fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (a, b) => {
      fc.pre(a !== b);
      return rateLimitKey(a, "ip", true) !== rateLimitKey(b, "ip", true);
    }), { numRuns: 5000 });
  });

  test("the bucket does not contain the key", () => {
    expect(rateLimitKey("cbk_secret_value", "ip", true)).not.toContain("secret");
  });

  test("an open server buckets by IP, so rotating made-up keys does not escape the limit", () => {
    fc.assert(fc.property(fc.string({ minLength: 1 }), (k) => rateLimitKey(k, "203.0.113.9", false) === "ip:203.0.113.9"));
    expect(rateLimitKey(undefined, "203.0.113.9", true)).toBe("ip:203.0.113.9");
  });
});

describe("bind host and the open-access warning", () => {
  test("HOST wins; otherwise every interface only with authentication", () => {
    expect(defaultBindHost(undefined, true)).toBe("0.0.0.0");
    expect(defaultBindHost(undefined, false)).toBe("127.0.0.1");
    expect(defaultBindHost("", false)).toBe("127.0.0.1");
    expect(defaultBindHost("0.0.0.0", false)).toBe("0.0.0.0");
    expect(defaultBindHost("10.0.0.5", true)).toBe("10.0.0.5");
  });

  test("warns only for an open server off loopback", () => {
    expect(openAccessWarning("0.0.0.0", false)).toContain("authentication is OFF");
    expect(openAccessWarning("10.0.0.5", false)).toContain("10.0.0.5");
    for (const h of ["127.0.0.1", "::1", "localhost"]) expect(openAccessWarning(h, false)).toBeNull();
    expect(openAccessWarning("0.0.0.0", true)).toBeNull();
  });
});

// ---- the real server ----

const freePort = () => new Promise<number>((resolve) => {
  const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => resolve(p)); });
});
const canConnect = (host: string, port: number) => new Promise<boolean>((resolve) => {
  const c = connect({ host, port, timeout: 2000 }, () => { c.destroy(); resolve(true); });
  c.on("error", () => resolve(false)); c.on("timeout", () => { c.destroy(); resolve(false); });
});
const outsideIp = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address;

let child: ReturnType<typeof Bun.spawn> | undefined;
afterEach(() => { child?.kill(); child = undefined; });

async function startOpenServer(extra: Record<string, string>): Promise<{ port: number; log: () => string }> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "cb-remote-hardening-"));
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  for (const k of ["MCP_API_KEY", "MCP_API_KEYS", "AUTH0_DOMAIN", "AUTH0_AUDIENCE", "REQUIRE_AUTH", "RATE_LIMIT_ENABLED", "CBROWSER_TIER", "HOST"]) delete env[k];
  Object.assign(env, {
    PORT: String(port), MCP_SESSION_MODE: "stateless", CMS_URL: "http://127.0.0.1:9", CMS_INTERNAL_SECRET: "test-secret",
    HOME: dir, CBROWSER_DATA_DIR: join(dir, "data"), CBROWSER_MIRROR_ROOT: join(dir, "mirror"), ...extra,
  });
  let out = "";
  child = Bun.spawn([process.execPath, join(import.meta.dir, "fixtures", "identity-harness.ts")], {
    cwd: join(import.meta.dir, ".."), env, stdout: "pipe", stderr: "pipe",
  });
  for (const stream of [child.stdout, child.stderr]) {
    void (async () => { for await (const c of stream as ReadableStream<Uint8Array>) out += new TextDecoder().decode(c); })();
  }
  const deadline = Date.now() + 30_000;
  while (!out.includes("running at")) {
    if (Date.now() > deadline) throw new Error(`server did not start:\n${out}`);
    await Bun.sleep(100);
  }
  return { port, log: () => out };
}

describe("cbrowser mcp-remote without authentication", () => {
  test("listens on loopback only, and says so without a warning", async () => {
    const { port, log } = await startOpenServer({});
    expect(log()).toContain(`running at http://127.0.0.1:${port}`);
    expect(log()).not.toContain("authentication is OFF");
    expect(await canConnect("127.0.0.1", port)).toBe(true);
    if (outsideIp) expect(await canConnect(outsideIp, port)).toBe(false);
  }, 40_000);

  test("HOST=0.0.0.0 serves it on purpose, with the warning", async () => {
    const { port, log } = await startOpenServer({ HOST: "0.0.0.0" });
    expect(log()).toContain("authentication is OFF and the server listens on 0.0.0.0");
    if (outsideIp) expect(await canConnect(outsideIp, port)).toBe(true);
  }, 40_000);

  test("CORS answers the origin without allowing credentials", async () => {
    const { port } = await startOpenServer({});
    for (const method of ["OPTIONS", "GET"]) {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { method, headers: { Origin: "https://evil.example" } });
      expect(res.headers.get("access-control-allow-origin")).toBe("https://evil.example");
      expect(res.headers.get("access-control-allow-credentials")).toBeNull();
      expect(res.headers.get("vary") ?? "").toContain("Origin");
    }
  }, 40_000);
});
