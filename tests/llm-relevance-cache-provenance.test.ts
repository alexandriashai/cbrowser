/**
 * A relevance judgement says whether it came from the cache, and how old it is (B23).
 *
 * Reported against 19.2.3: attentionReasoning came back word for word identical
 * across attention_analysis runs. That is the relevance cache doing its job --
 * one LLM call per (persona, goal, element set), replayed after -- but nothing in
 * the payload said so, and a replay is indistinguishable from a model that
 * ignores the page.
 *
 * Driven through the real judgeRelevance against a local stand-in for the
 * Messages API (the SDK honours ANTHROPIC_BASE_URL), so the cache path under
 * test is the shipping one: miss -> model call -> write -> hit -> replay.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, utimesSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const prev = {
  data: process.env.CBROWSER_DATA_DIR,
  base: process.env.ANTHROPIC_BASE_URL,
};
const dataDir = mkdtempSync(join(tmpdir(), "cb-relevance-cache-"));
process.env.CBROWSER_DATA_DIR = dataDir;
// Namespace import, so a missing export fails the assertion that needs it
// rather than the whole file at link time.
const relevance = await import("../src/visual/llm-relevance.js") as Record<string, unknown>;
const judgeRelevance = relevance.judgeRelevance as typeof import("../src/visual/llm-relevance.js").judgeRelevance;

const REASONING = "Drawn to the filled Sign up button because the goal names it. Ignores the footer links.";
let server: ReturnType<typeof Bun.serve>;
let calls = 0;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      if (!new URL(req.url).pathname.endsWith("/v1/messages")) return new Response("not found", { status: 404 });
      calls++;
      return Response.json({
        id: `msg_${calls}`, type: "message", role: "assistant", model: "claude-sonnet-5",
        content: [{ type: "text", text: JSON.stringify({ scores: { "0": 0.9, "1": 0.2 }, reasoning: REASONING }) }],
        stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10 },
      });
    },
  });
  process.env.ANTHROPIC_BASE_URL = `http://localhost:${server.port}`;
});

afterAll(() => {
  server?.stop(true);
  rmSync(dataDir, { recursive: true, force: true });
  for (const [k, v] of [["CBROWSER_DATA_DIR", prev.data], ["ANTHROPIC_BASE_URL", prev.base]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// A goal unique to this run, so no entry from an earlier run can be a hit.
const goal = `sign up (provenance test ${process.pid}-${Date.now()})`;
const elements = [
  { index: 0, type: "button", text: "Sign up", x: 100, y: 100, width: 120, height: 40 },
  { index: 1, type: "link", text: "Terms", x: 100, y: 700, width: 60, height: 16 },
];
const ctx = { personaName: "fixture-persona", goal, entitled: true };
const key = () => "test-key";

describe("B23: the cache path, driven twice", () => {
  test("first call judges, second replays -- and each says which", async () => {
    const callsBefore = calls;
    const first = await judgeRelevance(elements, ctx, key);
    expect(calls - callsBefore).toBe(1);
    expect(first.source).toBe("llm");
    expect(first.reasoning).toBe(REASONING);
    expect(first.cached).toBe(false);
    expect(first.cacheAgeMs).toBeUndefined();
    expect(typeof first.judgedAt).toBe("string");
    const judgedAt = Date.parse(first.judgedAt!);
    expect(Math.abs(Date.now() - judgedAt)).toBeLessThan(60_000);

    await Bun.sleep(60);

    const second = await judgeRelevance(elements, ctx, key);
    // The model was NOT called again: this is the replay the report saw.
    expect(calls - callsBefore).toBe(1);
    expect(second.reasoning).toBe(first.reasoning);
    expect(second.cached).toBe(true);
    expect(second.judgedAt).toBe(first.judgedAt);
    expect(second.cacheAgeMs).toBeGreaterThanOrEqual(50);
    expect(second.cacheAgeMs!).toBeLessThan(60_000);

    // And the payload fields built from each say the same thing.
    const provenance = relevance.relevanceProvenance as (j: unknown) => Record<string, unknown>;
    expect(typeof provenance).toBe("function");
    const p1 = provenance(first);
    expect(p1.relevanceMethod).toBe("llm");
    expect(p1.relevanceCached).toBe(false);
    expect(p1.relevanceCacheAgeSeconds).toBeUndefined();
    expect(p1.relevanceCacheNote).toBeUndefined();
    const p2 = provenance(second);
    expect(p2.relevanceMethod).toBe("llm");
    expect(p2.relevanceCached).toBe(true);
    expect(p2.relevanceCacheAgeSeconds).toBe(Math.round(second.cacheAgeMs! / 1000));
    expect(p2.relevanceJudgedAt).toBe(first.judgedAt);
    expect(String(p2.relevanceCacheNote)).toContain("cache");
  });

  test("the cache file never stores the read-side fields", () => {
    const dir = join(dataDir, "llm-relevance-cache");
    for (const f of readdirSync(dir)) {
      const entry = JSON.parse(readFileSync(join(dir, f), "utf8"));
      expect(entry.cached).toBe(false);
      expect(entry.cacheAgeMs).toBeUndefined();
    }
  });

  test("an entry written before judgedAt existed is aged from its file time", async () => {
    // Rewrite every entry the way an older build stored it -- no judgedAt --
    // and date the file an hour back.
    const dir = join(dataDir, "llm-relevance-cache");
    const hourAgo = new Date(Date.now() - 3_600_000);
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      const { judgedAt: _drop, ...legacy } = JSON.parse(readFileSync(p, "utf8"));
      writeFileSync(p, JSON.stringify(legacy));
      utimesSync(p, hourAgo, hourAgo);
    }
    const callsBefore = calls;
    const replay = await judgeRelevance(elements, ctx, key);
    expect(calls).toBe(callsBefore);
    expect(replay.cached).toBe(true);
    expect(replay.cacheAgeMs!).toBeGreaterThanOrEqual(3_590_000);
    expect(replay.cacheAgeMs!).toBeLessThan(3_700_000);
    expect(typeof replay.judgedAt).toBe("string");
  });

  test("a keyword fallback is never reported as cached", async () => {
    const fallback = await judgeRelevance(elements, { ...ctx, goal: `${goal} unentitled`, entitled: false }, key);
    expect(fallback.source).toBe("keyword-fallback");
    const p = (relevance.relevanceProvenance as (j: unknown) => Record<string, unknown>)(fallback);
    expect(p.relevanceMethod).toBe("keyword-fallback");
    expect(p.relevanceCached).toBe(false);
    expect(p.relevanceCacheAgeSeconds).toBeUndefined();
  });
});
