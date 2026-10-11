/**
 * Per-request caller identity, through the real hosted HTTP server.
 * (sec-identity, 2026-10-10)
 *
 * tests/identity-per-request.test.ts pins the getters and setters. This file
 * pins the wiring in mcp-server-remote.ts: that every HTTP request gets its own
 * identity context and that a tool, the usage log and the gate-before-charge
 * check all read the request's own caller.
 *
 * The defect: the server set the key hash, tier and API key as module globals
 * while building each request's MCP server, then awaited the body, the
 * redirect check and the credit deduct before the tool ran. Request A below is
 * held in its redirect check (its url points at a slow endpoint) while request
 * B, from another account, arrives and completes. Before the fix A's tool then
 * saw B's identity, A's usage was logged under B's key hash, and A, on the free
 * plan, passed the pro-tool gate on B's plan and was charged for the upgrade
 * prompt it then received.
 *
 * Runs tests/fixtures/identity-harness.ts (the real startRemoteMcpServer with
 * two probe tools) as a child process against a fake CMS served here. No
 * browser, no network beyond 127.0.0.1.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createHash } from "crypto";
import { mkdtempSync } from "fs";
import { createServer as createNetServer } from "net";
import { tmpdir } from "os";
import { join } from "path";

const KEY_A = "cbk_identity_test_free_A";
const KEY_B = "cbk_identity_test_pro_B";
const sha = (k: string) => createHash("sha256").update(k).digest("hex");
const TIERS: Record<string, { tier: string; accountId: number }> = {
  [KEY_A]: { tier: "free", accountId: 9101 },
  [KEY_B]: { tier: "pro", accountId: 9102 },
};

type Deduct = { keyHash: string | null; tool: string | null };
let deducts: Deduct[] = [];
let usage: string[] = [];

let cms: ReturnType<typeof Bun.serve> | undefined;
let CMS = "";
const startCms = () => Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/api/accounts/validate-key") {
      const t = TIERS[req.headers.get("x-api-key") ?? ""];
      return Response.json(t ? { valid: true, ...t } : { valid: false });
    }
    if (url.pathname === "/api/credits/deduct") {
      deducts.push({ keyHash: url.searchParams.get("key_hash"), tool: url.searchParams.get("tool") });
      return Response.json({ allowed: true, remaining: 100 });
    }
    if (url.pathname === "/api/accounts/log-usage") {
      usage.push(((await req.json()) as { keyHash: string }).keyHash);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/slow") {
      // Holds request A in mcp-server-remote's redirect check, which runs
      // after the caller is set and before the gate and the tool.
      await new Promise((r) => setTimeout(r, Number(url.searchParams.get("ms") ?? 0)));
      return new Response("ok");
    }
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
let MCP = "";
let childLog = "";

beforeAll(async () => {
  const server = startCms();
  cms = server;
  CMS = `http://127.0.0.1:${server.port}`;
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "cb-identity-http-"));
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  // Open access, so the probes see exactly what the request carried; no
  // operator keys, no Auth0, no rate limit, nothing pointing at a real CMS.
  for (const k of ["MCP_API_KEY", "MCP_API_KEYS", "AUTH0_DOMAIN", "AUTH0_AUDIENCE", "REQUIRE_AUTH", "RATE_LIMIT_ENABLED", "CBROWSER_TIER"]) delete env[k];
  Object.assign(env, {
    PORT: String(port), HOST: "127.0.0.1", MCP_SESSION_MODE: "stateless",
    CMS_URL: CMS, CMS_INTERNAL_SECRET: "test-secret",
    HOME: dir, CBROWSER_DATA_DIR: join(dir, "data"), CBROWSER_MIRROR_ROOT: join(dir, "mirror"),
  });
  child = Bun.spawn([process.execPath, join(import.meta.dir, "fixtures", "identity-harness.ts")], {
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

afterAll(() => {
  child?.kill();
  cms?.stop(true);
});

beforeEach(() => { deducts = []; usage = []; });

/** One tools/call; returns the JSON-RPC result. */
async function call(key: string, tool: string, args: Record<string, unknown>): Promise<{ isError?: boolean; content: Array<{ text: string }> }> {
  const res = await fetch(MCP, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${key}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }),
  });
  const text = await res.text();
  const line = text.split("\n").filter((l) => l.startsWith("data:")).pop();
  const msg = JSON.parse(line ? line.slice(5) : text);
  if (!msg.result) throw new Error(`no result: ${text}\n${childLog.slice(-2000)}`);
  return msg.result;
}

/** A, held in its redirect check for 400 ms; B, sent 100 ms after A, not held. */
async function overlap(tool: string) {
  const a = call(KEY_A, tool, { url: `${CMS}/slow?ms=400` });
  await new Promise((r) => setTimeout(r, 100));
  const b = call(KEY_B, tool, {});
  return Promise.all([a, b]);
}

describe("hosted requests read their own caller", () => {
  test("a tool reads its own request's key hash, tier and API key while another account's request overlaps it", async () => {
    const [a, b] = await overlap("status");
    expect(JSON.parse(a.content[0].text)).toEqual({ keyHash: sha(KEY_A), tier: "free", apiKey: KEY_A });
    expect(JSON.parse(b.content[0].text)).toEqual({ keyHash: sha(KEY_B), tier: "pro", apiKey: KEY_B });
    // Each charged and logged under its own key.
    expect(deducts.map((d) => d.keyHash).sort()).toEqual([sha(KEY_A), sha(KEY_B)].sort());
    expect(usage.sort()).toEqual([sha(KEY_A), sha(KEY_B)].sort());
  }, 20_000);

  test("a free account is refused a pro tool WITHOUT a charge while a pro account's request overlaps it", async () => {
    const [a, b] = await overlap("empathy_audit");
    // The gate runs before the deduct, so the free account is never billed.
    expect(deducts).toEqual([{ keyHash: sha(KEY_B), tool: "empathy_audit" }]);
    expect(a.isError).toBe(true);
    expect(JSON.parse(a.content[0].text)).toMatchObject({ error: "Upgrade Required", currentTier: "free" });
    expect(JSON.parse(b.content[0].text)).toEqual({ keyHash: sha(KEY_B), tier: "pro", apiKey: KEY_B });
  }, 20_000);
});
