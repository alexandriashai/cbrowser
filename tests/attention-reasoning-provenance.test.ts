/**
 * attention_analysis labels where its narrative came from (B19, B23).
 *
 * Both reported against 19.2.3 on cbrowser.ai:
 *
 *   B19  attentionReasoning (the LLM narrative) names elements that are not
 *        among the measured targets: it judged every candidate element, while
 *        topAttentionTargets come from the 2-4 the saliency hotspots sampled.
 *   B23  attentionReasoning came back word for word identical across runs,
 *        because the relevance judgement is cached -- and nothing said so.
 *
 * Driven through the real tool handler on a fixture page, with a local stand-in
 * for the Messages API (the SDK honours ANTHROPIC_BASE_URL), so the payload
 * under test is the one the tool actually assembles.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const prev = {
  data: process.env.CBROWSER_DATA_DIR,
  base: process.env.ANTHROPIC_BASE_URL,
  key: process.env.ANTHROPIC_API_KEY,
};
const dataDir = mkdtempSync(join(tmpdir(), "cb-attn-provenance-"));
process.env.CBROWSER_DATA_DIR = dataDir;
const { CBrowser } = await import("../src/browser.js");
const { registerVisualTestingTools } = await import("../src/mcp-tools/base/visual-testing-tools.js");

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>fixture</title><style>
body{margin:0;font:16px sans-serif} nav a{margin-right:16px}
h1{font-size:40px;margin:40px} p{margin:0 40px 16px}
.cta{font-size:22px;padding:16px 32px;background:#c00;color:#fff;border:0;margin:0 40px}
</style></head><body>
<nav><a href="#a">Pricing</a><a href="#b">Docs</a><a href="#c">Log in</a></nav>
<h1>Persona Testing for Product Teams</h1>
<p>Find where users abandon before they do.</p>
<button class="cta">Claim the bonus credits</button>
<p>Free tier available. No card required.</p>
<footer><a href="#t">Terms</a> <a href="#p">Privacy</a></footer>
</body></html>`;

const REASONING = "Drawn to the red Claim button because it names the goal. Skims past the nav and footer.";

/** Element lines the model was shown on each call: "N. [type] text ...". */
const elementsSeen: number[] = [];
let llm: ReturnType<typeof Bun.serve>;
let site: ReturnType<typeof Bun.serve>;
let browser: InstanceType<typeof CBrowser>;
type Handler = (a: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ type: string; text?: string }> }>;
let handler: Handler;
const TOKEN = "cb_attn_provenance";

beforeAll(async () => {
  llm = Bun.serve({
    port: 0,
    fetch: async (req) => {
      if (!new URL(req.url).pathname.endsWith("/v1/messages")) return new Response("not found", { status: 404 });
      const body = await req.json() as { messages: Array<{ content: unknown }> };
      const c = body.messages[0].content;
      const text = typeof c === "string" ? c : (c as Array<{ type: string; text?: string }>).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const list = text.split("\nElements:\n")[1] ?? "";
      elementsSeen.push(list.split("\n").filter((l) => /^\d+\. \[/.test(l)).length);
      return Response.json({
        id: `msg_${elementsSeen.length}`, type: "message", role: "assistant", model: "claude-sonnet-5",
        content: [{ type: "text", text: JSON.stringify({ scores: { "0": 0.9 }, reasoning: REASONING }) }],
        stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 },
      });
    },
  });
  process.env.ANTHROPIC_BASE_URL = `http://localhost:${llm.port}`;
  process.env.ANTHROPIC_API_KEY = "test-key";

  site = Bun.serve({ port: 0, fetch: () => new Response(PAGE, { headers: { "content-type": "text/html" } }) });
  browser = new CBrowser({ headless: true });
  await browser.launch();
  await browser.navigate(`http://localhost:${site.port}/`);
  registerVisualTestingTools({
    registerTool: (name: string, _c: unknown, h: Handler) => { if (name === "attention_analysis") handler = h; },
    tool: () => {}, registerResource: () => {}, resource: () => {},
  } as never, {
    getBrowser: async () => browser,
    getBrowserByToken: async (t?: string) => { if (t !== TOKEN) throw new Error("bad token"); return { browser, token: TOKEN }; },
  } as never);
}, 60_000);

afterAll(async () => {
  await browser?.close();
  llm?.stop(true);
  site?.stop(true);
  rmSync(dataDir, { recursive: true, force: true });
  for (const [k, v] of [["CBROWSER_DATA_DIR", prev.data], ["ANTHROPIC_BASE_URL", prev.base], ["ANTHROPIC_API_KEY", prev.key]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}, 60_000);

const body = (r: { content: Array<{ type: string; text?: string }> }) =>
  JSON.parse(r.content.find((c) => c.type === "text")!.text!) as Record<string, unknown>;

// Unique per run, so no cache entry from an earlier run can be the first hit.
const goal = `claim the bonus credits (${process.pid}-${Date.now()})`;
const runs: Array<Record<string, unknown>> = [];

describe("B23: relevance provenance in the attention_analysis payload", () => {
  test("first run judged, second replayed from cache -- and the payload says which", async () => {
    runs.push(body(await handler({ _browserToken: TOKEN, persona: "first-timer", goal, heatmap: false })));
    runs.push(body(await handler({ _browserToken: TOKEN, persona: "first-timer", goal, heatmap: false })));
    const [a, b] = runs;

    // Precondition: the LLM path ran, once, and produced the narrative.
    expect(elementsSeen.length).toBe(1);
    expect(a.relevanceMethod).toBe("llm");
    expect(a.attentionReasoning).toBe(REASONING);

    expect(a.relevanceCached).toBe(false);
    expect(a.relevanceCacheAgeSeconds).toBeUndefined();
    expect(typeof a.relevanceJudgedAt).toBe("string");

    // The report's observation, now labelled: identical narrative, from cache.
    expect(b.attentionReasoning).toBe(a.attentionReasoning);
    expect(b.relevanceMethod).toBe("llm");
    expect(b.relevanceCached).toBe(true);
    expect(typeof b.relevanceCacheAgeSeconds).toBe("number");
    expect(b.relevanceCacheAgeSeconds as number).toBeGreaterThanOrEqual(0);
    expect(b.relevanceJudgedAt).toBe(a.relevanceJudgedAt);
    expect(String(b.relevanceCacheNote)).toContain("cache");

    // Next to relevanceMethod, where a reader of that field will see it.
    const keys = Object.keys(b);
    expect(keys.indexOf("relevanceCached")).toBe(keys.indexOf("relevanceMethod") + 1);
  }, 180_000);
});

describe("B19: the narrative's scope is stated beside it", () => {
  test("attentionReasoningScope gives N (judged) and M (sampled), matching the payload", async () => {
    const seenBefore = elementsSeen.length;
    // A fresh goal, so this run's narrative is judged on this call and the
    // stand-in records exactly what the model was shown.
    const b = body(await handler({ _browserToken: TOKEN, persona: "first-timer", goal: `${goal} scope`, heatmap: false }));
    expect(elementsSeen.length).toBe(seenBefore + 1);
    expect(b.attentionReasoning).toBe(REASONING);

    const scope = b.attentionReasoningScope as string;
    expect(typeof scope).toBe("string");

    // N: the candidates the LLM relevance pass judged -- counted on the wire.
    const n = Number(/LLM relevance pass over (\d+) candidate elements?/.exec(scope)?.[1]);
    expect(n).toBe(elementsSeen[elementsSeen.length - 1]);
    expect(n).toBeGreaterThan(0);

    // M: the elements the quantitative targets were computed over.
    const quality = b.attentionQuality as { sampledElements: number; topAttentionTargets: unknown[] };
    const m = Number(/come from (\d+) sampled elements?/.exec(scope)?.[1]);
    expect(m).toBe(quality.sampledElements);

    // Below the floor it says so; at or above it, it does not.
    if (m < 8) expect(scope).toContain(`${m} is below the sampling floor of 8`);
    else expect(scope).not.toContain("below the sampling floor");

    // Placed beside the narrative it qualifies.
    const keys = Object.keys(b);
    expect(keys.indexOf("attentionReasoningScope")).toBe(keys.indexOf("attentionReasoning") + 1);
  }, 180_000);
});
