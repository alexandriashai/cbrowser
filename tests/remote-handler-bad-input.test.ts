/**
 * One bad request must not end the hosted server. (crash hotfix, 2026-11-12)
 *
 * THE DEFECT
 *
 * The HTTP listener in startRemoteMcpServer was an async function whose promise
 * nobody caught, and nothing in the process handled an unhandled rejection. So
 * any throw before the MCP dispatch ended the process (Node and Bun both exit
 * with code 1), and with it every account's browser sessions, OAuth codes and
 * rate-limit counters. Throws that needed no credentials at all:
 *   - POST /token with a body that starts with "{" and is not JSON (bare JSON.parse)
 *   - a request line of "//", or a Host header that is not a host (new URL)
 *   - POST /token with a password grant while the CMS is down (bare fetch)
 *   - any POST whose body is cut off before it ends (the body loop rejects)
 * Found by the 2026-11-12 audit (auth-tenancy-billing-1, prior-plan-status-1)
 * and reproduced on the deployed 21.4.8 dist.
 *
 * WHAT THIS PINS
 *
 * After each malformed request the server answers it sensibly (400, 413 or 503,
 * never a dropped connection where an answer is possible) and is still running
 * and answering GET /health with 200.
 *
 * Runs tests/fixtures/remote-minimal-harness.ts (the real startRemoteMcpServer)
 * as a child process against a stand-in CMS served here. No browser, nothing
 * beyond 127.0.0.1. If a case kills the harness, the next case starts a new one,
 * so each case reports on its own.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { mkdtempSync } from "fs";
import { createServer as createHttpServer, request as httpRequest, type Server } from "http";
import { connect as netConnect, createServer as createNetServer } from "net";
import { tmpdir } from "os";
import { join } from "path";

const HOST = "127.0.0.1";
const ALLOWED_REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const GOOD_KEY = "cbk_badinput_test_key";

// ---------------------------------------------------------------------------
// Stand-in CMS. "ok" answers like the real one; "reset" drops each connection;
// "hang" never answers; "garbage" answers 200 with a body that is not JSON;
// "down" stops listening, so connections are refused outright.
// ---------------------------------------------------------------------------
type CmsMode = "ok" | "reset" | "hang" | "garbage" | "down";
let cmsMode: CmsMode = "ok";
let cmsPort = 0;
let cms: Server | undefined;
const hung: Array<() => void> = [];

function makeCms(): Server {
  return createHttpServer((req, res) => {
    if (cmsMode === "reset") { req.socket.destroy(); return; }
    if (cmsMode === "hang") { hung.push(() => req.socket.destroy()); return; }
    if (cmsMode === "garbage") { res.writeHead(200, { "content-type": "application/json" }); res.end("<html>not json"); return; }
    const url = new URL(req.url ?? "/", "http://cms");
    const send = (code: number, obj: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (url.pathname === "/api/accounts/validate-key") {
      return req.headers["x-api-key"] === GOOD_KEY ? send(200, { valid: true, tier: "free", accountId: 9301 }) : send(401, { valid: false });
    }
    if (url.pathname === "/api/accounts/login") return send(401, { error: "Invalid credentials" });
    send(404, { error: "not found" });
  });
}

async function cmsListen(): Promise<void> {
  cms = makeCms();
  await new Promise<void>((resolve, reject) => {
    cms!.once("error", reject);
    cms!.listen(cmsPort, HOST, () => resolve());
  });
  cmsPort = (cms.address() as { port: number }).port;
}

async function setCms(mode: CmsMode): Promise<void> {
  if (mode === "down" && cmsMode !== "down") {
    await new Promise<void>((resolve) => { cms!.close(() => resolve()); cms!.closeAllConnections?.(); });
  } else if (mode !== "down" && cmsMode === "down") {
    await cmsListen();
  }
  cmsMode = mode;
  if (mode !== "hang") while (hung.length) hung.pop()!();
}

// ---------------------------------------------------------------------------
// The harness.
// ---------------------------------------------------------------------------
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.once("error", reject);
    s.listen(0, HOST, () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

type Harness = { child: ReturnType<typeof Bun.spawn>; port: number; log: () => string };
let h: Harness | undefined;
let deaths = 0;

async function startHarness(extraEnv: Record<string, string> = {}): Promise<Harness> {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "cb-bad-input-"));
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  for (const k of ["MCP_API_KEY", "MCP_API_KEYS", "AUTH0_DOMAIN", "AUTH0_AUDIENCE", "RATE_LIMIT_ENABLED", "CBROWSER_TIER", "OAUTH_ALLOWED_REDIRECTS"]) delete env[k];
  Object.assign(env, {
    PORT: String(port), HOST, MCP_SESSION_MODE: "stateless", REQUIRE_AUTH: "true",
    CMS_URL: `http://${HOST}:${cmsPort}`, CMS_INTERNAL_SECRET: "test-secret",
    HOME: dir, CBROWSER_DATA_DIR: join(dir, "data"), CBROWSER_MIRROR_ROOT: join(dir, "mirror"),
    ...extraEnv,
  });
  const child = Bun.spawn([process.execPath, join(import.meta.dir, "fixtures", "remote-minimal-harness.ts")], {
    cwd: join(import.meta.dir, ".."), env, stdout: "pipe", stderr: "pipe",
  });
  let log = "";
  for (const stream of [child.stdout, child.stderr]) {
    void (async () => {
      for await (const chunk of stream as ReadableStream<Uint8Array>) log += new TextDecoder().decode(chunk);
    })();
  }
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`harness exited during start:\n${log}`);
    try {
      if ((await fetch(`http://${HOST}:${port}/health`, { signal: AbortSignal.timeout(2_000) })).ok) break;
    } catch { /* not listening yet */ }
    if (Date.now() > deadline) throw new Error(`harness did not start:\n${log}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  return { child, port, log: () => log };
}

/** True when the harness process is still running and /health answers 200. */
async function alive(x: Harness = h!, waitMs = 150): Promise<boolean> {
  // A crash takes a moment to land after the response is cut off; after a body
  // cut off mid-request it took over a second under Bun at 21.4.8.
  await new Promise((r) => setTimeout(r, waitMs));
  if (x.child.exitCode !== null) return false;
  try {
    const r = await fetch(`http://${HOST}:${x.port}/health`, { signal: AbortSignal.timeout(3_000) });
    return r.status === 200 && x.child.exitCode === null;
  } catch {
    return false;
  }
}

type Reply = { status: number; body: string; error?: string };

/** One request through node:http; status 0 when the connection was dropped. */
function send(method: string, path: string, opts: { body?: string | Buffer; headers?: Record<string, string> } = {}): Promise<Reply> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: Reply) => { if (!settled) { settled = true; resolve(r); } };
    const req = httpRequest({ host: HOST, port: h!.port, method, path, headers: opts.headers }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => done({ status: res.statusCode ?? 0, body: data }));
      res.on("error", () => done({ status: res.statusCode ?? 0, body: data }));
    });
    req.on("error", (e: NodeJS.ErrnoException) => done({ status: 0, body: "", error: e.code ?? e.message }));
    req.setTimeout(20_000, () => { req.destroy(); done({ status: 0, body: "", error: "client timeout" }); });
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

/**
 * Raw bytes on a socket, for request lines and bodies node:http will not send.
 * With cutAfterMs the socket is destroyed that long after writing, so a body
 * shorter than its Content-Length is cut off mid-request. Returns the status
 * line, or "" when the server answered nothing.
 */
function raw(text: string, cutAfterMs?: number): Promise<string> {
  return new Promise((resolve) => {
    const s = netConnect(h!.port, HOST);
    let out = "";
    s.on("data", (d) => { out += d.toString("latin1"); });
    s.on("error", () => {});
    s.on("close", () => resolve(out.split("\r\n")[0] ?? ""));
    s.write(text);
    if (cutAfterMs !== undefined) setTimeout(() => s.destroy(), cutAfterMs);
    else setTimeout(() => s.destroy(), 5_000);
  });
}

const form = { "content-type": "application/x-www-form-urlencoded" };
const json = { "content-type": "application/json" };
const errorOf = (r: Reply): string | undefined => { try { return (JSON.parse(r.body) as { error?: string }).error; } catch { return undefined; } };

beforeAll(async () => {
  await cmsListen();
  h = await startHarness();
}, 40_000);

afterAll(() => {
  h?.child.kill();
  while (hung.length) hung.pop()!();
  cms?.close();
  cms?.closeAllConnections?.();
});

beforeEach(async () => {
  await setCms("ok");
  // A dying process can still have no exit code for a moment, so ask /health
  // too; a harness that does not answer is replaced, and counted.
  if (h && !(await alive(h))) {
    deaths++;
    h.child.kill();
    h = await startHarness();
  }
}, 40_000);

describe("POST /token with a body it cannot read", () => {
  test('"{" is invalid_request, and the server survives', async () => {
    const r = await send("POST", "/token", { body: "{", headers: json });
    expect(await alive()).toBe(true);
    expect(r.status).toBe(400);
    expect(errorOf(r)).toBe("invalid_request");
  }, 20_000);

  test("JSON cut short is invalid_request", async () => {
    const r = await send("POST", "/token", { body: '{"grant_type":"client_credentials",', headers: json });
    expect(await alive()).toBe(true);
    expect(r.status).toBe(400);
    expect(errorOf(r)).toBe("invalid_request");
  }, 20_000);

  test('"[]" is invalid_request (JSON, but not an object)', async () => {
    const r = await send("POST", "/token", { body: "[]", headers: json });
    expect(await alive()).toBe(true);
    expect(r.status).toBe(400);
    expect(errorOf(r)).toBe("invalid_request");
  }, 20_000);

  test('"null" sent as JSON is invalid_request', async () => {
    const r = await send("POST", "/token", { body: "null", headers: json });
    expect(await alive()).toBe(true);
    expect(r.status).toBe(400);
    expect(errorOf(r)).toBe("invalid_request");
  }, 20_000);

  test("a 5 MB body is refused with 413 without being buffered", async () => {
    const r = await send("POST", "/token", { body: "{" + "A".repeat(5 * 1024 * 1024), headers: json });
    expect(await alive()).toBe(true);
    // The server may close the socket while the client is still writing, so a
    // dropped connection is acceptable; any other answer is not.
    expect(r.status === 413 || r.status === 0).toBe(true);
  }, 20_000);

  test("a body cut off mid-request does not end the server", async () => {
    await raw(`POST /token HTTP/1.1\r\nHost: ${HOST}\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: 1000\r\n\r\ngrant_type=cl`, 200);
    expect(await alive(h, 2_000)).toBe(true);
  }, 20_000);

  test("a well-formed JSON body still works (control)", async () => {
    const r = await send("POST", "/token", { body: JSON.stringify({ grant_type: "client_credentials", client_id: "a@example.test", client_secret: GOOD_KEY }), headers: json });
    expect(await alive()).toBe(true);
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body).access_token).toBe(GOOD_KEY);
  }, 20_000);
});

describe("POST /token password and key grants while the CMS is unusable", () => {
  const passwordGrant = "grant_type=client_credentials&client_id=a%40example.test&client_secret=not-a-key";
  const keyGrant = `grant_type=client_credentials&client_id=a%40example.test&client_secret=${GOOD_KEY}`;

  for (const mode of ["down", "reset", "garbage"] as const) {
    test(`password grant, CMS ${mode}: 503 temporarily_unavailable`, async () => {
      await setCms(mode);
      const r = await send("POST", "/token", { body: passwordGrant, headers: form });
      expect(await alive()).toBe(true);
      expect(r.status).toBe(503);
      expect(errorOf(r)).toBe("temporarily_unavailable");
    }, 20_000);

    test(`API-key grant, CMS ${mode}: 503 temporarily_unavailable`, async () => {
      await setCms(mode);
      const r = await send("POST", "/token", { body: keyGrant, headers: form });
      expect(await alive()).toBe(true);
      if (mode === "garbage") {
        // validate-key is read for its status only, and "garbage" answers 200.
        expect(r.status).toBe(200);
      } else {
        expect(r.status).toBe(503);
        expect(errorOf(r)).toBe("temporarily_unavailable");
      }
    }, 20_000);
  }

  test("password grant, CMS never answers: 503 within the time limit", async () => {
    await setCms("hang");
    const started = Date.now();
    const r = await send("POST", "/token", { body: passwordGrant, headers: form });
    const took = Date.now() - started;
    expect(await alive()).toBe(true);
    expect(r.status).toBe(503);
    expect(errorOf(r)).toBe("temporarily_unavailable");
    expect(took).toBeLessThan(15_000);
  }, 30_000);
});

describe("request lines and headers new URL cannot parse", () => {
  test("GET // is 400", async () => {
    const status = await raw(`GET // HTTP/1.1\r\nHost: ${HOST}\r\nConnection: close\r\n\r\n`);
    expect(await alive()).toBe(true);
    expect(status).toMatch(/^HTTP\/1\.1 400 /);
  }, 20_000);

  test("GET //evil.test/health is 400, not read as another host", async () => {
    const status = await raw(`GET //evil.test/health HTTP/1.1\r\nHost: ${HOST}\r\nConnection: close\r\n\r\n`);
    expect(await alive()).toBe(true);
    expect(status).toMatch(/^HTTP\/1\.1 400 /);
  }, 20_000);

  test('GET "/%" is answered without a server error', async () => {
    const status = await raw(`GET /% HTTP/1.1\r\nHost: ${HOST}\r\nConnection: close\r\n\r\n`);
    expect(await alive()).toBe(true);
    expect(status).toMatch(/^HTTP\/1\.1 4\d\d /);
  }, 20_000);

  test("absolute-form request line reaches the route its path names", async () => {
    const status = await raw(`GET http://evil.test/health HTTP/1.1\r\nHost: ${HOST}\r\nConnection: close\r\n\r\n`);
    expect(await alive()).toBe(true);
    expect(status).toMatch(/^HTTP\/1\.1 200 /);
  }, 20_000);

  test("a Host header that is not a host is 400", async () => {
    const status = await raw(`GET /health HTTP/1.1\r\nHost: a b\r\nConnection: close\r\n\r\n`);
    expect(await alive()).toBe(true);
    expect(status).toMatch(/^HTTP\/1\.1 400 /);
  }, 20_000);

  test("no Host header at all is still answered", async () => {
    const status = await raw(`GET /.well-known/oauth-authorization-server HTTP/1.0\r\n\r\n`);
    expect(await alive()).toBe(true);
    expect(status).toMatch(/^HTTP\/1\.[01] 200 /);
  }, 20_000);
});

describe("/authorize and /register with malformed input", () => {
  test("GET /authorize with broken percent-encoding is refused, not crashed", async () => {
    const r = await send("GET", "/authorize?redirect_uri=%E0%A4%A&state=%ZZ&client_id=%");
    expect(await alive()).toBe(true);
    expect(r.status).toBe(400);
  }, 20_000);

  test("POST /authorize cut off mid-body does not end the server", async () => {
    await raw(`POST /authorize HTTP/1.1\r\nHost: ${HOST}\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: 1000\r\n\r\nemail=a`, 200);
    expect(await alive(h, 2_000)).toBe(true);
  }, 20_000);

  test("POST /authorize with a 5 MB body is refused with 413", async () => {
    const r = await send("POST", "/authorize", { body: "email=" + "A".repeat(5 * 1024 * 1024), headers: form });
    expect(await alive()).toBe(true);
    expect(r.status === 413 || r.status === 0).toBe(true);
  }, 20_000);

  test("POST /authorize while the CMS is down sends the browser back with an error", async () => {
    await setCms("down");
    const body = new URLSearchParams({ email: "a@example.test", password: "pw", redirect_uri: ALLOWED_REDIRECT, state: "s", code_challenge: "c" }).toString();
    const r = await send("POST", "/authorize", { body, headers: { ...form, host: "mcp.example.test" } });
    expect(await alive()).toBe(true);
    expect(r.status).toBe(303);
  }, 20_000);

  test('POST /register "{" (no such route) is answered', async () => {
    const r = await send("POST", "/register", { body: "{", headers: json });
    expect(await alive()).toBe(true);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
  }, 20_000);
});

describe("the unauthenticated /mcp pre-read", () => {
  test("a body cut off mid-request does not end the server", async () => {
    await raw(`POST /mcp HTTP/1.1\r\nHost: ${HOST}\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n{"jsonrpc":"2.0",`, 200);
    expect(await alive(h, 2_000)).toBe(true);
  }, 20_000);

  test("a 5 MB unauthenticated body is refused with 413, not buffered", async () => {
    const r = await send("POST", "/mcp", { body: '{"pad":"' + "A".repeat(5 * 1024 * 1024) + '"}', headers: { ...json, accept: "application/json, text/event-stream" } });
    expect(await alive()).toBe(true);
    expect(r.status === 413 || r.status === 0).toBe(true);
  }, 20_000);

  test("unauthenticated initialize still answers (control)", async () => {
    const r = await send("POST", "/mcp", { body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }), headers: { ...json, accept: "application/json, text/event-stream" } });
    expect(await alive()).toBe(true);
    expect(r.status).toBe(200);
    expect(r.body).toContain('"serverInfo"');
  }, 20_000);
});

describe("the process-level second layer", () => {
  test("an unhandled rejection elsewhere in the process is logged and the server keeps running", async () => {
    const x = await startHarness({ CB_HARNESS_REJECT_AFTER_START: "1" });
    try {
      await new Promise((r) => setTimeout(r, 1_000));
      expect(await alive(x)).toBe(true);
      expect(x.log()).toContain("unhandled rejection");
    } finally {
      x.child.kill();
    }
  }, 40_000);
});

describe("bookkeeping", () => {
  test("no case above ended the server", () => {
    expect(deaths).toBe(0);
  });
});
