/**
 * A client that hangs up cancels its tool call on the hosted server
 * (ISA 20261112-cbrowser-sessions-leaks ISC-12, 2026-11-16).
 *
 * Both hosted servers run stateless: one transport and one McpServer per
 * request. Nothing closed that transport when the client's connection closed,
 * and the stateless branch assigned an empty transport.onclose after
 * server.connect(), replacing the handler through which the SDK aborts running
 * tools. So extra.signal never fired: measured, a tool waiting on it ran its
 * full 20 s after the client left at 3 s. Enterprise's autonomous journeys rely
 * on that signal to kill their child and its browser when the request ends;
 * without it they ran to their time limit (up to 630 s each).
 *
 * Runs the real startRemoteMcpServer (tests/fixtures/remote-minimal-harness.ts)
 * as a child process with its "wait" tool. No browser, nothing beyond 127.0.0.1.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "fs";
import { request as httpRequest } from "http";
import { createServer as createNetServer } from "net";
import { tmpdir } from "os";
import { join } from "path";

const HOST = "127.0.0.1";
type Harness = { child: ReturnType<typeof Bun.spawn>; port: number; log: () => string };
let h: Harness;

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

beforeAll(async () => {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "cb-req-abort-"));
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  for (const k of ["MCP_API_KEY", "MCP_API_KEYS", "AUTH0_DOMAIN", "AUTH0_AUDIENCE", "REQUIRE_AUTH", "RATE_LIMIT_ENABLED", "CBROWSER_TIER"]) delete env[k];
  Object.assign(env, {
    PORT: String(port), HOST, MCP_SESSION_MODE: "stateless",
    HOME: dir, CBROWSER_DATA_DIR: join(dir, "data"), CBROWSER_MIRROR_ROOT: join(dir, "mirror"),
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
  h = { child, port, log: () => log };
}, 40_000);

afterAll(() => { h?.child.kill(); });

function callBody(ms: number, tag: string): string {
  return JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "wait", arguments: { ms, tag } } });
}

/** POST a tools/call; with hangUpAfterMs, destroy the connection that long after sending. */
function call(ms: number, tag: string, hangUpAfterMs?: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve) => {
    const body = callBody(ms, tag);
    const req = httpRequest({
      host: HOST, port: h.port, method: "POST", path: "/mcp",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "content-length": Buffer.byteLength(body) },
    }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      res.on("error", () => resolve({ status: 0, body: data }));
    });
    req.on("error", () => resolve({ status: 0, body: "" }));
    req.end(body);
    if (hangUpAfterMs !== undefined) setTimeout(() => req.destroy(), hangUpAfterMs);
  });
}

async function waitForLog(line: string, withinMs: number): Promise<boolean> {
  const deadline = Date.now() + withinMs;
  while (Date.now() < deadline) {
    if (h.log().includes(line)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return h.log().includes(line);
}

describe("stateless hosted server", () => {
  test("a client that hangs up mid-call cancels the tool (extra.signal fires)", async () => {
    void call(15_000, "hangup", 500);
    expect(await waitForLog("WAIT start hangup", 5_000)).toBe(true);
    expect(await waitForLog("WAIT aborted hangup", 3_000)).toBe(true);
    expect(h.log()).not.toContain("WAIT done hangup");
  }, 20_000);

  test("a call the client waits for still finishes and returns its result", async () => {
    const r = await call(200, "kept");
    expect(r.status).toBe(200);
    expect(r.body).toContain("done");
    expect(h.log()).toContain("WAIT done kept");
    expect(h.log()).not.toContain("WAIT aborted kept");
  }, 15_000);

  test("the server still answers after both", async () => {
    const r = await fetch(`http://${HOST}:${h.port}/health`);
    expect(r.status).toBe(200);
    expect(h.child.exitCode).toBeNull();
  });
});
