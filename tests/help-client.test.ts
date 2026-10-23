/**
 * Product help for package users (Alexa, 2026-10-21: "i want anyone who has
 * access to the cli cbrowser package to be able to query an endpoint on the
 * website with their question about the product and get an ai answer").
 *
 * Before 20.0.0 the question_answer tool always posted to CMS_URL or
 * localhost:3200, which exists only on the hosted servers, so it could never
 * answer on a user's machine, and the CLI had no way to ask at all. Every
 * server here is a local stub: no request leaves the box and no model runs.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-help-"));

const { askCbrowser, helpTargets, PUBLIC_HELP_URL } = await import("../src/help-client.js");

interface Seen { path: string; auth: string | null; body: { question?: string; context?: string } }

function stub(reply: (req: Request) => Response | Promise<Response>) {
  const seen: Seen[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const body = await req.json().catch(() => ({}));
      seen.push({ path: new URL(req.url).pathname, auth: req.headers.get("Authorization"), body });
      return reply(req);
    },
  });
  return { seen, server, url: `http://127.0.0.1:${server.port}` };
}

const answer = () => Response.json({ answer: "Use --device iphone-16.", sources: ["Devices | docs\nmore"] });

const saved = { cms: process.env.CMS_URL, help: process.env.CBROWSER_HELP_URL };
afterEach(() => {
  if (saved.cms === undefined) delete process.env.CMS_URL; else process.env.CMS_URL = saved.cms;
  if (saved.help === undefined) delete process.env.CBROWSER_HELP_URL; else process.env.CBROWSER_HELP_URL = saved.help;
});

describe("where a question goes", () => {
  test("on a user's machine: the public endpoint, with no credentials even when a key hash exists", async () => {
    delete process.env.CMS_URL;
    const pub = stub(answer);
    process.env.CBROWSER_HELP_URL = `${pub.url}/cms/api/ai/question`;
    try {
      const r = await askCbrowser("iphone?", { keyHash: "deadbeef", context: "testing a form" });
      expect(r.answer).toBe("Use --device iphone-16.");
      expect(pub.seen).toHaveLength(1);
      expect(pub.seen[0].auth).toBeNull();
      expect(pub.seen[0].body).toEqual({ question: "iphone?", context: "testing a form" });
    } finally { pub.server.stop(true); }
  });

  test("the default public endpoint is cbrowser.ai's", () => {
    delete process.env.CMS_URL;
    delete process.env.CBROWSER_HELP_URL;
    expect(helpTargets({})).toEqual([{ url: PUBLIC_HELP_URL }]);
    expect(PUBLIC_HELP_URL).toBe("https://cbrowser.ai/cms/api/ai/question");
  });

  test("hosted: the local CMS first, with the caller's key hash, and nothing sent to the public endpoint", async () => {
    delete process.env.CMS_URL;
    const local = stub(answer);
    const pub = stub(answer);
    process.env.CBROWSER_HELP_URL = pub.url;
    try {
      await askCbrowser("q", { hosted: true, keyHash: "abc123", localCmsUrl: local.url });
      expect(local.seen.map((s) => [s.path, s.auth])).toEqual([["/api/ai/question", "Bearer abc123"]]);
      expect(pub.seen).toHaveLength(0);
    } finally { local.server.stop(true); pub.server.stop(true); }
  });

  test("hosted with the local CMS down: falls back to the public endpoint, without the key hash", async () => {
    delete process.env.CMS_URL;
    const closed = Bun.serve({ port: 0, fetch: () => new Response("") });
    const deadUrl = `http://127.0.0.1:${closed.port}`;
    closed.stop(true);
    const pub = stub(answer);
    process.env.CBROWSER_HELP_URL = pub.url;
    try {
      const r = await askCbrowser("q", { hosted: true, keyHash: "abc123", localCmsUrl: deadUrl });
      expect(r.answer).toBe("Use --device iphone-16.");
      expect(pub.seen).toHaveLength(1);
      expect(pub.seen[0].auth).toBeNull();
    } finally { pub.server.stop(true); }
  });

  test("CMS_URL: only that CMS, with the key hash", async () => {
    const own = stub(answer);
    process.env.CMS_URL = own.url + "/";
    try {
      await askCbrowser("q", { keyHash: "k1" });
      expect(own.seen.map((s) => [s.path, s.auth])).toEqual([["/api/ai/question", "Bearer k1"]]);
    } finally { own.server.stop(true); }
  });

  test("an HTTP error is the answer: no second server is asked (no double spend)", async () => {
    delete process.env.CMS_URL;
    const local = stub(() => new Response(JSON.stringify({ error: "boom" }), { status: 500 }));
    const pub = stub(answer);
    process.env.CBROWSER_HELP_URL = pub.url;
    try {
      await expect(askCbrowser("q", { hosted: true, localCmsUrl: local.url })).rejects.toThrow("answered 500: boom");
      expect(pub.seen).toHaveLength(0);
    } finally { local.server.stop(true); pub.server.stop(true); }
  });

  test("429 says when to try again", async () => {
    delete process.env.CMS_URL;
    const pub = stub(() => new Response(JSON.stringify({ error: "limit" }), { status: 429, headers: { "Retry-After": "120" } }));
    process.env.CBROWSER_HELP_URL = pub.url;
    try {
      await expect(askCbrowser("q")).rejects.toThrow("try again in 120s");
    } finally { pub.server.stop(true); }
  });

  test("a server that never answers times out instead of hanging", async () => {
    delete process.env.CMS_URL;
    const pub = stub(() => new Promise<Response>(() => { /* never */ }));
    process.env.CBROWSER_HELP_URL = pub.url;
    const t0 = Date.now();
    try {
      await expect(askCbrowser("q", { timeoutMs: 300 })).rejects.toThrow("did not answer within");
      expect(Date.now() - t0).toBeLessThan(5_000);
    } finally { pub.server.stop(true); }
  });
});

describe("the question_answer MCP tool", () => {
  test("answers on a user's machine through the public endpoint (it could only fail before 20.0)", async () => {
    delete process.env.CMS_URL;
    const pub = stub(answer);
    process.env.CBROWSER_HELP_URL = pub.url;
    const handlers: Record<string, (a: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>> = {};
    const fake = new Proxy({}, { get: (_t, p) => (p === "registerTool" ? (n: string, _d: unknown, h: never) => { handlers[n] = h; } : () => {}) });
    const { registerSiteKnowledgeTools } = await import("../src/mcp-tools/base/site-knowledge-tools.js");
    registerSiteKnowledgeTools(fake as never, { getBrowser: async () => { throw new Error("no browser"); } } as never);
    try {
      const r = await handlers.question_answer({ question: "iphone?" });
      expect(r.isError).toBeFalsy();
      expect(JSON.parse(r.content[0].text).answer).toBe("Use --device iphone-16.");
      expect(pub.seen[0].auth).toBeNull();
    } finally { pub.server.stop(true); }
  });
});

describe("cbrowser ask", () => {
  const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");
  let dir = "";
  let pub: ReturnType<typeof stub>;
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "cb-ask-")); pub = stub(answer); });
  afterAll(() => pub.server.stop(true));

  async function ask(env: Record<string, string>, ...args: string[]) {
    const out = join(dir, `o${Math.random()}`), err = join(dir, `e${Math.random()}`);
    const p = Bun.spawn(["bash", "-c", 'bun run "$0" "$@" > "$O" 2> "$E"', CLI, "ask", ...args], {
      env: { ...process.env, CBROWSER_DATA_DIR: dir, CMS_URL: "", ...env, O: out, E: err },
      stdout: "ignore", stderr: "ignore",
    });
    const code = await p.exited;
    return { code, stdout: existsSync(out) ? readFileSync(out, "utf8") : "", stderr: existsSync(err) ? readFileSync(err, "utf8") : "" };
  }

  test("prints the answer and its sources", async () => {
    const r = await ask({ CBROWSER_HELP_URL: pub.url }, "How do I test on an iPhone?");
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain("Use --device iphone-16.");
    expect(r.stdout).toContain("Sources:");
    expect(r.stdout).toContain("- Devices | docs");
    expect(pub.seen.at(-1)!.body.question).toBe("How do I test on an iPhone?");
  }, 30_000);

  test("--json prints the answer as JSON", async () => {
    const r = await ask({ CBROWSER_HELP_URL: pub.url }, "iphone?", "--json");
    expect(r.code, r.stderr).toBe(0);
    // sourceUrls (2026-10-23): full links for the sources that name a page; this one names none.
    expect(JSON.parse(r.stdout)).toEqual({ question: "iphone?", answer: "Use --device iphone-16.", sources: ["Devices | docs\nmore"], sourceUrls: [] });
  }, 30_000);

  test("a failure exits 1 with the reason", async () => {
    const down = stub(() => new Response("{}", { status: 503 }));
    try {
      const r = await ask({ CBROWSER_HELP_URL: down.url }, "iphone?");
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("answered 503");
    } finally { down.server.stop(true); }
  }, 30_000);

  test("no question is a usage error", async () => {
    const r = await ask({ CBROWSER_HELP_URL: pub.url });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('Usage: cbrowser ask "<question>"');
  }, 30_000);
});
