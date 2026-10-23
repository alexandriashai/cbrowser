/**
 * Process-wide maps are per account through the real hosted HTTP server.
 * (tenant, 2026-10-10)
 *
 * tests/account-scope-process-maps.test.ts pins each map in-process. This file
 * pins the wiring: that resources/list and resources/read run in the caller's
 * account scope, that the questionnaire tools see the scope the server
 * entered, and that a client-supplied mcp-session-id header no longer reaches
 * a browser another account's session created.
 *
 * Runs tests/fixtures/tenant-harness.ts (the real startRemoteMcpServer) as a
 * child process against a fake CMS served here. Stateless mode, as both
 * hosted servers run. No browser is launched, no network beyond 127.0.0.1.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { createServer as createNetServer } from "net";
import { tmpdir } from "os";
import { join } from "path";

const KEY_A = "cbk_tenant_http_A";
const KEY_B = "cbk_tenant_http_B";
const ACCOUNTS: Record<string, { tier: string; accountId: number }> = {
  [KEY_A]: { tier: "enterprise", accountId: 9401 },
  [KEY_B]: { tier: "enterprise", accountId: 9402 },
};
const CAPTURE = "ui://cbrowser/capture/";

let cms: ReturnType<typeof Bun.serve> | undefined;
const startCms = () => Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/api/accounts/validate-key") {
      const account = ACCOUNTS[req.headers.get("x-api-key") ?? ""];
      return Response.json(account ? { valid: true, ...account } : { valid: false });
    }
    if (url.pathname === "/api/credits/deduct") return Response.json({ allowed: true, remaining: 100 });
    return Response.json({});
  },
});

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });
}

let child: ReturnType<typeof Bun.spawn> | undefined;
// The child's HOME and data dir; removed in afterAll.
let dir = "";
let MCP = "";
let childLog = "";

beforeAll(async () => {
  const server = startCms();
  cms = server;
  const port = await freePort();
  dir = mkdtempSync(join(tmpdir(), "cb-tenant-http-"));
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  // Open access, so a request with no key reaches the tools as an
  // unauthenticated hosted caller; nothing pointing at a real CMS.
  for (const k of ["MCP_API_KEY", "MCP_API_KEYS", "AUTH0_DOMAIN", "AUTH0_AUDIENCE", "REQUIRE_AUTH", "RATE_LIMIT_ENABLED", "CBROWSER_TIER"]) delete env[k];
  Object.assign(env, {
    PORT: String(port), HOST: "127.0.0.1", MCP_SESSION_MODE: "stateless",
    CMS_URL: `http://127.0.0.1:${server.port}`, CMS_INTERNAL_SECRET: "test-secret",
    HOME: dir, CBROWSER_DATA_DIR: join(dir, "data"), CBROWSER_MIRROR_ROOT: join(dir, "mirror"),
  });
  child = Bun.spawn([process.execPath, join(import.meta.dir, "fixtures", "tenant-harness.ts")], {
    cwd: join(import.meta.dir, ".."), env, stdout: "pipe", stderr: "pipe",
  });
  for (const stream of [child.stdout, child.stderr]) {
    void (async () => {
      for await (const chunk of stream as ReadableStream<Uint8Array>) childLog += new TextDecoder().decode(chunk);
    })();
  }
  MCP = `http://127.0.0.1:${port}/mcp`;
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) break;
    } catch { /* not listening yet */ }
    if (Date.now() > deadline) throw new Error(`harness did not start:\n${childLog}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}, 40_000);

afterAll(async () => {
  child?.kill();
  await child?.exited;
  cms?.stop(true);
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** One JSON-RPC request as `key` (or no key); returns its result. */
async function rpc(key: string | null, method: string, params: Record<string, unknown>, headers: Record<string, string> = {}) {
  const res = await fetch(MCP, {
    method: "POST",
    headers: {
      "content-type": "application/json", accept: "application/json, text/event-stream",
      ...(key ? { authorization: `Bearer ${key}` } : {}), ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await res.text();
  const line = text.split("\n").filter((l) => l.startsWith("data:")).pop();
  const msg = JSON.parse(line ? line.slice(5) : text);
  if (!msg.result) throw new Error(`no result: ${text}\n${childLog.slice(-2000)}`);
  return msg.result;
}

type ToolResult = { isError?: boolean; content: Array<{ text: string }> };
const tool = (key: string | null, name: string, args: Record<string, unknown> = {}, headers?: Record<string, string>) =>
  rpc(key, "tools/call", { name, arguments: args }, headers) as Promise<ToolResult>;
const captureUris = async (key: string | null) =>
  ((await rpc(key, "resources/list", {})) as { resources: Array<{ uri: string }> }).resources
    .map((r) => r.uri).filter((u) => u.startsWith(CAPTURE));
const readText = async (key: string | null, uri: string) =>
  ((await rpc(key, "resources/read", { uri })) as { contents: Array<{ text: string }> }).contents[0].text;

describe("capture players over resources/list and resources/read", () => {
  test("another account and an unauthenticated caller cannot list or read an account's player", async () => {
    await tool(KEY_A, "publish_capture_probe", { slug: "tenant-http-a", html: "<p>HTTP-A-ONLY</p>" });
    expect(await captureUris(KEY_A)).toContain(`${CAPTURE}tenant-http-a`);
    expect(await readText(KEY_A, `${CAPTURE}tenant-http-a`)).toContain("HTTP-A-ONLY");

    for (const other of [KEY_B, null]) {
      expect(await captureUris(other)).not.toContain(`${CAPTURE}tenant-http-a`);
      expect(await readText(other, `${CAPTURE}tenant-http-a`)).not.toContain("HTTP-A-ONLY");
    }
  }, 20_000);
});

describe("persona questionnaires over the hosted tool path", () => {
  test("another account cannot advance or cancel an account's questionnaire; an unauthenticated caller is refused", async () => {
    const started = await tool(KEY_A, "persona_create_questionnaire_start", { persona_name: "tenant-http-secret" });
    expect(started.isError).toBeUndefined();

    const answer = await tool(KEY_B, "persona_create_questionnaire_answer", { answer_value: 0.5 });
    expect(answer.isError).toBe(true);
    expect(JSON.parse(answer.content[0].text).error).toBe("No questionnaire session in progress");
    const cancelled = await tool(KEY_B, "persona_create_cancel");
    expect(JSON.parse(cancelled.content[0].text).message).toBe("No questionnaire session to cancel");

    const anon = await tool(null, "persona_create_questionnaire_start", { persona_name: "tenant-http-anon" });
    expect(anon.isError).toBe(true);
    expect(JSON.parse(anon.content[0].text).error).toBe("account_required");

    // The owner's questionnaire is intact.
    expect(JSON.parse((await tool(KEY_A, "persona_create_cancel")).content[0].text))
      .toMatchObject({ cancelled: true, persona_name: "tenant-http-secret", progress_lost: "0 questions answered" });
  }, 20_000);
});

describe("MCP session browsers", () => {
  test("another account presenting an account's mcp-session-id does not get its browser", async () => {
    const session = { "mcp-session-id": "tenant-http-shared-session" };
    const first = await tool(KEY_A, "browser_probe", {}, session);
    expect(first.isError).toBeUndefined();
    const owner = JSON.parse(first.content[0].text).browser;

    for (const other of [KEY_B, null]) {
      const r = await tool(other, "browser_probe", {}, session);
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain("not available to this caller");
    }

    // The owner still reaches the same browser through its session.
    expect(JSON.parse((await tool(KEY_A, "browser_probe", {}, session)).content[0].text).browser).toBe(owner);
  }, 20_000);

  test("unauthenticated callers keep the old behaviour among themselves", async () => {
    const session = { "mcp-session-id": "tenant-http-anon-session" };
    const first = JSON.parse((await tool(null, "browser_probe", {}, session)).content[0].text).browser;
    expect(JSON.parse((await tool(null, "browser_probe", {}, session)).content[0].text).browser).toBe(first);
  }, 20_000);
});
