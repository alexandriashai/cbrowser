/**
 * Sign-up while connecting, through the real hosted server (2026-11-23).
 *
 * A Claude Code plugin user had no way to connect to the hosted server short of
 * making an API key on cbrowser.ai and exporting it: the server had no client
 * registration, refused every callback but claude.ai's, and answered initialize
 * without a token, so Claude Code (which offers sign-in only on a 401) never
 * offered one. This runs what Claude Code does against startRemoteMcpServer
 * with a stand-in CMS:
 *   connect to /mcp?auth=required -> 401 naming the resource metadata
 *   -> discovery -> POST /register (loopback callback) -> GET /authorize
 *   -> create the account (send-code, then code + name + password)
 *   -> 303 to the loopback callback -> POST /token with the PKCE verifier
 *   -> the new account's key.
 * Plain /mcp keeps answering initialize anonymously for existing connectors.
 *
 * Runs tests/fixtures/remote-minimal-harness.ts in a child process. No browser.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "crypto";
import { mkdtempSync } from "fs";
import { createServer as createHttpServer, type Server } from "http";
import { createServer as createNetServer } from "net";
import { tmpdir } from "os";
import { join } from "path";

const HOST = "127.0.0.1";
const NEW_KEY = "cbk_signup_test_key_0001";
const EXISTING = "taken@example.test";

// ---------------------------------------------------------------------------
// Stand-in CMS: the real send-code / verify-code / register contract.
// ---------------------------------------------------------------------------
const cmsCalls: Array<{ path: string; body: Record<string, unknown> }> = [];
const codes = new Map<string, string>();
const verified = new Set<string>();
let cms: Server;
let cmsPort = 0;

function makeCms(): Server {
  return createHttpServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const path = new URL(req.url ?? "/", "http://cms").pathname;
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      cmsCalls.push({ path, body });
      const send = (code: number, obj: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
      const email = String(body.email ?? "");
      if (path === "/api/accounts/send-code") {
        if (email === EXISTING) return send(409, { error: "Email already registered" });
        codes.set(email, "424242");
        return send(200, { success: true });
      }
      if (path === "/api/accounts/verify-code") {
        if (codes.get(email) !== body.code) return send(400, { error: "Invalid or expired verification code" });
        codes.delete(email);
        verified.add(email);
        return send(200, { verified: true });
      }
      if (path === "/api/accounts/register") {
        // The current CMS contract: the code comes with the registration.
        if (codes.get(email) !== body.code) return send(400, { error: "Invalid or expired verification code" });
        if (String(body.password ?? "").length < 8) return send(400, { error: "Password must be at least 8 characters" });
        codes.delete(email);
        return send(201, { apiKey: NEW_KEY, account: { id: 1, tier: "free" } });
      }
      if (path === "/api/accounts/validate-key") return send(req.headers["x-api-key"] === NEW_KEY ? 200 : 401, { valid: req.headers["x-api-key"] === NEW_KEY, tier: "free", accountId: 1 });
      send(404, { error: "not found" });
    });
  });
}

// ---------------------------------------------------------------------------
// The harness: the real startRemoteMcpServer in a child process.
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

let child: ReturnType<typeof Bun.spawn> | undefined;
let port = 0;
let base = "";

beforeAll(async () => {
  cms = makeCms();
  await new Promise<void>((r) => cms.listen(0, HOST, () => r()));
  cmsPort = (cms.address() as { port: number }).port;

  port = await freePort();
  base = `http://${HOST}:${port}`;
  const dir = mkdtempSync(join(tmpdir(), "cb-signup-flow-"));
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  for (const k of ["MCP_API_KEY", "MCP_API_KEYS", "AUTH0_DOMAIN", "AUTH0_AUDIENCE", "RATE_LIMIT_ENABLED", "CBROWSER_TIER", "OAUTH_ALLOWED_REDIRECTS"]) delete env[k];
  Object.assign(env, {
    PORT: String(port), HOST, MCP_SESSION_MODE: "stateless", REQUIRE_AUTH: "true",
    CMS_URL: `http://${HOST}:${cmsPort}`, CMS_INTERNAL_SECRET: "test-secret",
    HOME: dir, CBROWSER_DATA_DIR: join(dir, "data"), CBROWSER_MIRROR_ROOT: join(dir, "mirror"),
  });
  child = Bun.spawn([process.execPath, join(import.meta.dir, "fixtures", "remote-minimal-harness.ts")], {
    cwd: join(import.meta.dir, ".."), env, stdout: "pipe", stderr: "pipe",
  });
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error("harness exited during start");
    try {
      if ((await fetch(`${base}/health`, { signal: AbortSignal.timeout(2_000) })).ok) break;
    } catch { /* not listening yet */ }
    if (Date.now() > deadline) throw new Error("harness did not start");
    await new Promise((r) => setTimeout(r, 100));
  }
}, 40_000);

afterAll(() => {
  child?.kill();
  cms?.close();
});

const mcpHeaders = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const initialize = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();

describe("connecting", () => {
  test("/mcp?auth=required answers an anonymous connect with 401 and names the resource metadata", async () => {
    const r = await fetch(`${base}/mcp?auth=required`, { method: "POST", headers: mcpHeaders, body: initialize });
    expect(r.status).toBe(401);
    expect(r.headers.get("www-authenticate")).toBe(`Bearer resource_metadata="http://${HOST}:${port}/.well-known/oauth-protected-resource"`);
  });

  test("/mcp/signin (the plugin's URL) answers an anonymous connect with 401, and serves MCP to a signed-in caller", async () => {
    const anon = await fetch(`${base}/mcp/signin`, { method: "POST", headers: mcpHeaders, body: initialize });
    expect(anon.status).toBe(401);
    expect(anon.headers.get("www-authenticate")).toContain("resource_metadata=");
    const signedIn = await fetch(`${base}/mcp/signin`, { method: "POST", headers: { ...mcpHeaders, authorization: `Bearer ${NEW_KEY}` }, body: initialize });
    expect(signedIn.status).toBe(200);
    expect(await signedIn.text()).toContain('"serverInfo"');
  });

  test("plain /mcp still answers initialize anonymously", async () => {
    const r = await fetch(`${base}/mcp`, { method: "POST", headers: mcpHeaders, body: initialize });
    expect(r.status).toBe(200);
  });

  test("discovery names the registration endpoint", async () => {
    const meta = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json() as Record<string, unknown>;
    expect(meta.registration_endpoint).toBe(`http://${HOST}:${port}/register`);
    expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
  });
});

describe("sign-up while connecting, end to end", () => {
  const callback = "http://localhost:43219/callback";
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  let clientId = "";
  const oauth = () => ({ redirect_uri: callback, state: "st8", code_challenge: challenge, code_challenge_method: "S256", client_id: clientId });

  test("registers a client with a loopback callback", async () => {
    const r = await fetch(`${base}/register`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Claude Code", redirect_uris: [callback], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"] }),
    });
    expect(r.status).toBe(201);
    clientId = String(((await r.json()) as Record<string, unknown>).client_id);
    expect(clientId).toMatch(/^cbc_/);
  });

  test("the sign-in page opens for that callback, says a program on this computer is asking, and offers a free account", async () => {
    const r = await fetch(`${base}/authorize?${form(oauth())}`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("Create a free account");
    expect(html).toContain("A program on this computer (port 43219)");
  });

  test("Anti: a loopback callback without the client_id that registered it is refused", async () => {
    expect((await fetch(`${base}/authorize?${form({ ...oauth(), client_id: "" })}`)).status).toBe(400);
    expect((await fetch(`${base}/authorize?${form({ ...oauth(), redirect_uri: "http://localhost:43219/elsewhere" })}`)).status).toBe(400);
  });

  test("Anti: the page prints no text a link supplies, only known error codes", async () => {
    const r = await fetch(`${base}/authorize?${form({ ...oauth(), error: "Account suspended. Call 555-0100." })}`);
    expect(await r.text()).not.toContain("555-0100");
    const known = await fetch(`${base}/authorize?${form({ ...oauth(), error: "invalid_login" })}`);
    expect(await known.text()).toContain("That email and password do not match.");
  });

  test("Claude's own callback still needs no registration", async () => {
    const r = await fetch(`${base}/authorize?${form({ ...oauth(), redirect_uri: "https://claude.ai/api/mcp/auth_callback", client_id: "" })}`);
    expect(r.status).toBe(200);
    expect(await r.text()).not.toContain("A program on this computer");
  });

  test("an existing email is sent to sign in, and no code is mailed", async () => {
    const r = await fetch(`${base}/authorize`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ ...oauth(), action: "send-code", email: EXISTING }) });
    const html = await r.text();
    expect(html).toContain("already has a CBrowser account");
    expect(html).toContain('value="signin"');
  });

  test("email, then code, name and password: the account is made and the code goes to the loopback callback", async () => {
    const sent = await fetch(`${base}/authorize`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ ...oauth(), action: "send-code", email: "new@example.test" }) });
    expect(await sent.text()).toContain('value="register"');

    const wrong = await fetch(`${base}/authorize`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ ...oauth(), action: "register", email: "new@example.test", code: "000000", name: "New Person", password: "correct horse" }) });
    expect(wrong.status).toBe(200);
    expect(await wrong.text()).toContain("Invalid or expired verification code");

    const made = await fetch(`${base}/authorize`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ ...oauth(), action: "register", email: "new@example.test", code: "424242", name: "New Person", password: "correct horse" }) });
    expect(made.status).toBe(303);
    const location = new URL(made.headers.get("location")!);
    expect(`${location.origin}${location.pathname}`).toBe(callback);
    expect(location.searchParams.get("state")).toBe("st8");
    const code = location.searchParams.get("code")!;

    const tok = await fetch(`${base}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: callback, client_id: clientId }) });
    expect(tok.status).toBe(200);
    expect(((await tok.json()) as Record<string, unknown>).access_token).toBe(NEW_KEY);
    expect(cmsCalls.filter((c) => c.path === "/api/accounts/register").at(-1)!.body).toEqual({ email: "new@example.test", password: "correct horse", name: "New Person", code: "424242" });
  });

  test("Anti: a non-loopback callback is refused before any form is shown or posted", async () => {
    const evil = { ...oauth(), redirect_uri: "https://evil.test/callback" };
    expect((await fetch(`${base}/authorize?${form(evil)}`)).status).toBe(400);
    const before = cmsCalls.length;
    const r = await fetch(`${base}/authorize`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form({ ...evil, action: "send-code", email: "x@example.test" }) });
    expect(r.status).toBe(400);
    expect(cmsCalls.length).toBe(before);
  });
});
