/**
 * B15 (2026-10-09 report): binary floating-point residue reached customer JSON.
 *
 * Reported: `totalBarrierDeduction: 29.299999999999997` (20 + 9.3, each already
 * rounded to 0.1), `cognitiveLoad: 0.43019999999999997`, raw `performance.now()`
 * differences in `computeTimeMs`. There is no shared rounding helper -- ~117
 * hand-written Math.round sites and two private round3 copies -- so rounding at
 * each producer depends on every producer remembering.
 *
 * The fix is one boundary: the `secured` wrapper in security-layer.ts, which
 * every tool on both surfaces (registerTool and the stdio server's .tool())
 * passes through. Driven here through applySecurityLayer on a fake server, the
 * way a real tools/call reaches a handler.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySecurityLayer } from "../src/mcp-tools/security-layer.js";

type Handler = (args: Record<string, unknown>) => Promise<unknown>;
type Result = { content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; structuredContent?: unknown };

const audit = {
  sessionId: "test", auditDir: mkdtempSync(join(tmpdir(), "float-residue-")), enabled: false,
  includeStackTraces: false, actionsTriggered: new Map(),
};

/** Register one tool through the security layer and return what a caller would receive. */
function serve(result: unknown, surface: "registerTool" | "tool" = "registerTool"): Handler {
  let registered: Handler | undefined;
  const server = {
    registerTool: (_n: string, _c: unknown, h: Handler) => { registered = h; },
    tool: (...args: unknown[]) => { registered = args[args.length - 1] as Handler; },
  };
  applySecurityLayer(server, { audit: audit as never });
  const handler = async () => result;
  if (surface === "registerTool") server.registerTool("probe_tool", { description: "probe" }, handler);
  else server.tool("probe_tool", "probe", {}, handler);
  if (!registered) throw new Error("not registered");
  return registered;
}

const PAYLOAD = {
  a: 0.1 + 0.2,
  b: 29.299999999999997,
  c: 0.43019999999999997,
  tiny: 1e-9,
  n: 3,
  s: "0.30000000000000004",
  nested: { deep: [0.1 + 0.2, { x: 1 - 0.9 }] },
};

describe("float residue is removed at the security-layer boundary", () => {
  test("a JSON text block comes back with clean numbers, tiny values and strings intact", async () => {
    const r = await serve({ content: [{ type: "text", text: JSON.stringify(PAYLOAD, null, 2) }] })({}) as Result;
    const out = JSON.parse(r.content[0].text!);
    expect(out.a).toBe(0.3);
    expect(out.b).toBe(29.3);
    expect(out.c).toBe(0.4302);
    expect(out.tiny).toBe(1e-9);
    expect(out.n).toBe(3);
    expect(out.s).toBe("0.30000000000000004");
    expect(out.nested.deep[0]).toBe(0.3);
    expect(out.nested.deep[1].x).toBe(0.1);
    // No residue left outside string values.
    expect(r.content[0].text!.replace(/"(?:[^"\\]|\\.)*"/g, '""')).not.toMatch(/0{6,}\d|9{6,}\d/);
  });

  test("the block keeps its own indentation", async () => {
    const pretty = await serve({ content: [{ type: "text", text: JSON.stringify(PAYLOAD, null, 2) }] })({}) as Result;
    expect(pretty.content[0].text).toBe(JSON.stringify({ ...PAYLOAD, a: 0.3, b: 29.3, c: 0.4302,
      nested: { deep: [0.3, { x: 0.1 }] } }, null, 2));
    const compact = await serve({ content: [{ type: "text", text: JSON.stringify(PAYLOAD) }] })({}) as Result;
    expect(compact.content[0].text).not.toContain("\n");
    expect(JSON.parse(compact.content[0].text!).a).toBe(0.3);
  });

  test("the stdio surface (.tool) gets the same treatment", async () => {
    const r = await serve({ content: [{ type: "text", text: JSON.stringify(PAYLOAD) }] }, "tool")({}) as Result;
    expect(JSON.parse(r.content[0].text!).b).toBe(29.3);
  });

  test("structuredContent is cleaned too", async () => {
    const r = await serve({ content: [], structuredContent: PAYLOAD })({}) as Result;
    const sc = r.structuredContent as typeof PAYLOAD;
    expect(sc.a).toBe(0.3);
    expect(sc.c).toBe(0.4302);
    expect(sc.tiny).toBe(1e-9);
    expect(sc.s).toBe("0.30000000000000004");
  });

  test("non-JSON text, image blocks and clean JSON are byte-identical", async () => {
    const prose = "took 0.30000000000000004 seconds { not json";
    const image = { type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" };
    // Odd spacing a re-serialization would normalise: proves clean JSON is not re-written.
    const clean = '{ "a" :  0.3, "b": 29.3 }';
    const precise = '{"lat": 37.7749291, "v": 1.0000001}';
    const r = await serve({ content: [
      { type: "text", text: prose }, image, { type: "text", text: clean }, { type: "text", text: precise },
    ] })({}) as Result;
    expect(r.content[0].text).toBe(prose);
    expect(r.content[1]).toEqual(image);
    expect(r.content[2].text).toBe(clean);
    expect(r.content[3].text).toBe(precise);
  });

  test("computeTimeMs is whole milliseconds at its source", async () => {
    // Not residue -- genuine sub-ms timer precision -- so the boundary rightly
    // leaves it alone. Rounded where it is measured instead.
    const sharp = (await import("sharp")).default;
    const { computeByteDiff, computeWassersteinDistance } = await import("../src/visual/distance-metrics.js");
    const { analyzeAttention } = await import("../src/visual/attention-transport.js");
    const dir = mkdtempSync(join(tmpdir(), "compute-ms-"));
    const a = join(dir, "a.png");
    const b = join(dir, "b.png");
    await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toFile(a);
    await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 20, b: 30 } } }).png().toFile(b);
    const times = [
      computeByteDiff(a, b).details.computeTimeMs,
      (await computeWassersteinDistance(a, b)).details.computeTimeMs,
      (await analyzeAttention(a, "first-timer", 16)).computeTimeMs,
    ];
    for (const t of times) expect(Number.isInteger(t)).toBe(true);
  });

  test("a string that only LOOKS like residue is not re-serialized", async () => {
    // Passes the cheap pre-check, parses, changes no number: kept as sent.
    const text = '{ "s":"0.30000000000000004" }';
    const r = await serve({ content: [{ type: "text", text }] })({}) as Result;
    expect(r.content[0].text).toBe(text);
  });
});
