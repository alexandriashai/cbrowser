/**
 * The cognitive-effort widget, and the one thing its chain block exists to say.
 *
 * cognitive_effort's whole model is that the six layers run in SEQUENCE: each
 * spends what the last left over, so a cost late in the chain lands on a
 * depleted budget. The payload states it as
 * `cognitiveTransportCost.sequentialAmplification` and buries it in a nested
 * object next to two other numbers.
 *
 * The widget's job is to make that visible rather than asserted, so these tests
 * pin the parts that carry the claim: the bottleneck is labelled in TEXT (not
 * colour alone), and colour and width use different denominators on purpose.
 *
 * That last one is not a style preference. Ramping colour on the shared scale
 * made every layer green -- the largest layer was 0.171 against a 0.742 total,
 * 23% of the ramp -- so a page at 63% abandonment risk rendered as six healthy
 * green bars. Verified by eye in a real browser, which is the only way that
 * class of bug is ever caught.
 *
 * @since 2026-08-02
 */
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dir, "..", "src");
const kit = readFileSync(join(SRC, "mcp-tools", "widget-kit.ts"), "utf8");
const uiRes = readFileSync(join(SRC, "mcp-tools", "ui-resources.ts"), "utf8");
const tool = readFileSync(join(SRC, "mcp-tools", "base", "persona-comparison-tools.ts"), "utf8");

describe("the tool and the widget are actually connected", () => {
  test("cognitive_effort declares the effort resource", () => {
    const idx = tool.indexOf('registerTool("cognitive_effort"');
    expect(idx).toBeGreaterThan(-1);
    expect(tool.slice(idx, idx + 300)).toContain('resourceUri: "ui://cbrowser/effort"');
  });

  test("the resource is registered, so the declaration resolves", () => {
    // A tool pointing at a ui:// nobody serves renders as nothing at all, with
    // no error anywhere — the failure mode is silence.
    expect(uiRes).toContain('widgetUri("effort")');
    expect(uiRes).toContain("cbrowser-effort-ui");
    expect(uiRes).toContain("buildEffortTemplate");
  });

  test("the spec reads the fields the tool actually emits", () => {
    const spec = uiRes.slice(uiRes.indexOf("export const EFFORT_SPEC"));
    const head = spec.slice(0, spec.indexOf("export function buildEffortTemplate"));
    for (const field of [
      "layers", "bottleneck",
      "cognitiveTransportCost.additive", "cognitiveTransportCost.total",
      "abandonmentRisk", "interpretation",
    ]) {
      expect(head).toContain(field);
      // and the tool emits it
      expect(tool).toContain(field.split(".").pop()!);
    }
  });
});

describe("the chain block carries the claim", () => {
  test("the bottleneck gets a text label, never colour alone", () => {
    // WCAG 1.4.1. Especially load-bearing in a tool that reports on exactly this.
    expect(kit).toContain('el("span", "peaktag", "bottleneck")');
  });

  test("colour and width use different denominators", () => {
    // width: shared scale, so a layer bar and the sequential-total bar below it
    // are comparable. colour: relative to the largest LAYER, or nothing is hot.
    expect(kit).toContain("var layerMax = Math.max.apply(null, costs);");
    expect(kit).toContain("cost / layerMax");
    expect(kit).toMatch(/fill\.style\.width[\s\S]{0,80}scaleMax/);
  });

  test("the amplification bars share the layer scale", () => {
    // Drawn to a different ruler, the comparison the block exists to make would
    // be a lie told in pixels.
    expect(kit).toMatch(/scaleMax = Math\.max\.apply\(null, costs\.concat\(/);
  });

  test("it says why the total exceeds the sum, in words", () => {
    expect(kit).toContain("The layers run in sequence, so each one spends what the last left over");
    // And does NOT claim amplification when there is none.
    expect(kit).toContain("no layer is arriving on a materially depleted budget");
  });

  test("a chain with no layers renders nothing rather than an empty frame", () => {
    expect(kit).toMatch(/function chainBlock[\s\S]{0,200}if \(!isObjArray\(layers\) \|\| !layers\.length\) return null;/);
  });
});

describe("bars open into their layer's overlay", () => {
  test("a layer with an overlay becomes a real button", () => {
    // Not a styled div. Keyboard operability and the control role come free
    // from the right element; faking them with ARIA on a div does not.
    expect(kit).toContain('? document.createElement("button")');
    expect(kit).toContain('seg.type = "button"; seg.setAttribute("aria-expanded", "false")');
  });

  test("a layer WITHOUT an overlay stays inert and says why", () => {
    // An affordance that does nothing is worse than no affordance. Four
    // clickable bars and two silently dead ones reads as a broken widget.
    expect(kit).toContain('var interactive = !!(ov && ov.available && ov.file)');
    expect(kit).toContain('el("span", "noov", "no overlay")');
    expect(kit).toContain('why.title = String(ov.reason');
  });

  test("opening one layer closes the others", () => {
    expect(kit).toMatch(/querySelectorAll\("button\.seg"\)[\s\S]{0,120}aria-expanded", "false"/);
  });

  test("the image carries alt text naming the layer, not 'overlay image'", () => {
    expect(kit).toContain('node.alt = label + " overlay for this page: "');
  });

  test("a failed fetch says so instead of leaving a spinner", () => {
    expect(kit).toContain("Could not load the ");
    expect(kit).toContain("overlay could not be loaded");
  });

  test("the spec points the block at the payload field the tool emits", () => {
    const spec = uiRes.slice(uiRes.indexOf("export const EFFORT_SPEC"));
    expect(spec.slice(0, spec.indexOf("export function buildEffortTemplate")))
      .toContain('overlaysField: "layerOverlays"');
    expect(tool).toContain("response.layerOverlays = layerOverlays");
  });
});

describe("the server states why a layer has no overlay", () => {
  test("every layer without one carries a reason, not just a false flag", () => {
    // camelCase, matching LAYER_DEFINITIONS. Emitted hyphenated at first, which
    // matched no layer name, so that bar got neither a button nor a no-overlay tag.
    for (const layer of ["cognitiveLoad", "decision", "frustration"]) {
      const idx = tool.indexOf(`layer: "${layer}", available: false`);
      expect(idx).toBeGreaterThan(-1);
      expect(tool.slice(idx, idx + 260)).toContain("reason:");
    }
  });

  test("saliency is computed keylessly, so it is not gated behind an API key", () => {
    // computeLabSaliency is centre-surround over the screenshot: no model call,
    // which is what lets this layer have an overlay on every run.
    expect(tool).toContain("computeLabSaliency");
    expect(tool).toContain("generateHeatmapOverlay");
  });

});

/**
 * The layer overlays' screenshot lives exactly as long as the overlays drawn
 * from it: it exists while saliency and readability are drawn, and its
 * per-call temp dir is gone when the tool returns.
 *
 * This was a grep for a source comment ("ssPath is deliberately NOT deleted
 * here any more"), which proved nothing about behaviour and failed the moment
 * the determinism fix (4097718) rewrote the block around a per-call temp dir.
 * Now the real handler runs on a page that gives every screenshot overlay
 * something to draw. Deleting the screenshot before the overlays turns both
 * entries into "failed" reasons; leaving the temp dir behind leaves it in
 * TMPDIR, watched here so "gone" cannot pass by never having existed.
 */
describe("the layer screenshot lives exactly as long as the overlays drawn from it", () => {
  const words = "Every account keeps its own records and the reports you run are drawn from them, so a change here shows up in the next report you open.";
  const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>layers</title><style>
body{margin:0;font:17px/1.5 sans-serif;color:#222} header{background:#123;color:#fff;padding:18px 32px}
main{padding:24px 32px;max-width:760px} button{font-size:16px;padding:10px 18px;margin-right:12px}
</style></head><body><header><nav><a href="#">Home</a> <a href="#">Pricing</a> <a href="#">Help</a></nav></header>
<main><h1>Your reports</h1>${[1, 2, 3, 4].map(() => `<p>${words} ${words}</p>`).join("")}
<button>Run report</button><button>Export</button></main></body></html>`;

  type Entry = { layer: string; file?: string; available: boolean; reason?: string };
  let result: { isError?: boolean; content: Array<{ type: string; text?: string }> };
  let created: string[] = [];
  let leftover: string[] = [];
  let artifacts = "";
  const cleanup: Array<() => Promise<void> | void> = [];

  beforeAll(async () => {
    const { mkdtempSync, rmSync, readdirSync, watch } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const keep = { data: process.env.CBROWSER_DATA_DIR, art: process.env.CBROWSER_ARTIFACT_DIR, tmp: process.env.TMPDIR };
    const data = mkdtempSync(join(tmpdir(), "cb-effort-layers-data-"));
    artifacts = mkdtempSync(join(tmpdir(), "cb-effort-layers-art-"));
    const callTmp = mkdtempSync(join(tmpdir(), "cb-effort-layers-tmp-"));
    process.env.CBROWSER_DATA_DIR = data;
    process.env.CBROWSER_ARTIFACT_DIR = artifacts;
    delete process.env.ANTHROPIC_API_KEY;
    cleanup.push(() => {
      for (const [k, v] of [["CBROWSER_DATA_DIR", keep.data], ["CBROWSER_ARTIFACT_DIR", keep.art]] as const) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
      for (const d of [data, artifacts, callTmp]) rmSync(d, { recursive: true, force: true });
    });

    const server = Bun.serve({ port: 0, fetch: () => new Response(PAGE, { headers: { "content-type": "text/html" } }) });
    cleanup.push(() => server.stop(true));
    const { CBrowser } = await import("../src/browser.js");
    const browser = new CBrowser({ headless: true, viewportWidth: 1280, viewportHeight: 800, persistent: false, skipSessionRestore: true });
    await browser.launch();
    cleanup.push(() => browser.close());
    const { registerPersonaComparisonTools } = await import("../src/mcp-tools/base/persona-comparison-tools.js");
    let handler: ((a: Record<string, unknown>) => Promise<typeof result>) | undefined;
    registerPersonaComparisonTools({
      registerTool: (name: string, _c: unknown, h: typeof handler) => { if (name === "cognitive_effort") handler = h; },
      tool: () => {}, registerResource: () => {}, resource: () => {},
    } as never, { getBrowser: async () => browser } as never);

    // Only the call itself makes its temp dirs here: the browser is already
    // up, and TMPDIR points at a directory of the test's own for the call.
    const seen = new Set<string>();
    const watcher = watch(callTmp, (_e, name) => { if (name && String(name).startsWith("cbrowser-cog-effort")) seen.add(String(name)); });
    process.env.TMPDIR = callTmp;
    try {
      result = await handler!({ url: `http://localhost:${server.port}/`, persona: "first-timer", useValues: false, scope: "viewport" });
    } finally {
      if (keep.tmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = keep.tmp;
      watcher.close();
    }
    leftover = readdirSync(callTmp).filter((n) => n.startsWith("cbrowser-cog-effort")).sort();
    // A dir the watcher reported, or one still there: either way the call
    // made it here. (The watcher can miss a creation; a removal it reports.)
    created = [...new Set([...seen, ...leftover])].sort();
  }, 180_000);

  afterAll(async () => { for (const c of cleanup.reverse()) await c(); }, 60_000);

  const overlays = (): Entry[] => JSON.parse(result.content.find((c) => c.type === "text")!.text!).layerOverlays;
  /** Width and height from a PNG's IHDR. */
  const pngSize = (bytes: Buffer) => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });

  test("every overlay drawn from the screenshot was drawn: saliency and readability", async () => {
    expect(result.isError).toBeFalsy();
    const { readFileSync, existsSync } = await import("node:fs");
    for (const layer of ["visualComplexity", "readability"]) {
      const e = overlays().find((o) => o.layer === layer)!;
      // A screenshot gone before the draw reads "saliency map failed: ..." or
      // "readability overlay failed: ...", with available false.
      expect({ layer, available: e.available, reason: e.reason }).toEqual({ layer, available: true, reason: undefined });
      const png = join(artifacts, e.file!);
      expect(existsSync(png)).toBe(true);
      // Drawn over the page itself: the overlay has the screenshot's size.
      expect(pngSize(readFileSync(png))).toEqual({ width: 1280, height: 800 });
    }
  });

  test("the per-call temp dirs existed during the call and are gone after it returns", () => {
    // Both: the motor overlay's (cbrowser-cog-effort-*) and the layers' (cbrowser-cog-effort-layers-*).
    expect(created.some((n) => n.startsWith("cbrowser-cog-effort-layers-"))).toBe(true);
    expect(created.some((n) => !n.startsWith("cbrowser-cog-effort-layers-"))).toBe(true);
    expect(leftover).toEqual([]);
  });
});

describe("the widget script is inside a template literal", () => {
  test("no backtick appears in the widget JS block", () => {
    // A backtick anywhere in that block — including inside a comment — ends the
    // template literal and the whole file stops compiling. I hit this twice in
    // one afternoon: once writing `sequentialAmplification` in a comment, then
    // again writing `total` and `raw` in the comment warning about the first.
    //
    // A comment saying "do not use backticks" evidently does not stop it. This
    // does, and it names the fix in the failure message.
    // Bounded at the literal's own closing backtick, which is legitimate — the
    // first version of this test ran past it to buildWidget and flagged the
    // terminator as an offender.
    const anchor = kit.indexOf("function chainBlock");
    expect(anchor).toBeGreaterThan(-1);
    const closeIdx = kit.indexOf("\n`;", anchor);
    expect(closeIdx).toBeGreaterThan(anchor);
    const block = kit.slice(anchor, closeIdx);
    const offenders = block.split("\n")
      .map((line, i) => ({ line: line.trim(), n: i }))
      .filter((x) => x.line.includes("`"));
    // Empty, or the build is already broken. Message names the offending text.
    expect(offenders.map((o) => o.line.slice(0, 70))).toEqual([]);
  });
});

describe("no user-visible string hardcodes a stale layer count", () => {
  /**
   * The widget captioned its bars "The six-layer transport chain". Splitting
   * readability into decoding and attention made that seven, and the caption
   * went stale within the hour -- so the panel drew seven bars under a heading
   * that said six, and the tool's own description still listed six layer names
   * to the model choosing it.
   *
   * The count lives in exactly one place, LAYER_DEFINITIONS. Every other
   * mention is a copy, and this test is what stops a copy from disagreeing.
   */
  const CHAIN = readFileSync(join(SRC, "visual", "cognitive-transport-chain.ts"), "utf8");
  const gate = readFileSync(join(SRC, "mcp-tools", "tier-gate.ts"), "utf8");
  const layerCount = Array.from(
    CHAIN.slice(CHAIN.indexOf("LAYER_DEFINITIONS"), CHAIN.indexOf("INTERACTION_PAIRS")).matchAll(/name: '[a-zA-Z]+'/g),
  ).length;

  const WORDS: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };

  test("the chain really is more than one layer, or this test proves nothing", () => {
    expect(layerCount).toBeGreaterThan(1);
  });

  for (const [label, src] of [["widget spec", uiRes], ["tool description", tool], ["tier gate", gate]] as const) {
    test(`${label} states no count that contradicts LAYER_DEFINITIONS`, () => {
      // Only strings a user or the model can actually read: quoted text.
      const strings = Array.from(src.matchAll(/"((?:[^"\\]|\\.)*)"/g), (m) => m[1]);
      for (const s of strings) {
        for (const m of s.matchAll(/\b(\d+|[a-z]+)[\s-]layers?\b/gi)) {
          const raw = m[1].toLowerCase();
          const n = /^\d+$/.test(raw) ? Number(raw) : WORDS[raw];
          if (n === undefined) continue;  // "per-layer", "the layer" etc.
          // A historical statement is allowed to name the old count, but it has
          // to say so; a bare count is a claim about now.
          if (/was |used to|before|previously|at six layers|re-measured/i.test(s) && n !== layerCount) continue;
          expect(n).toBe(layerCount);
        }
      }
    });
  }

  test("the widget's chain caption carries no count at all", () => {
    // Strongest form: the bars state the count themselves, so prose that
    // restates it is a second copy with nothing keeping it honest.
    const spec = uiRes.slice(uiRes.indexOf("export const EFFORT_SPEC"));
    const title = spec.match(/\{ type: "chain", title: "([^"]+)"/)![1];
    expect(title).toBe("The sequential transport chain");
    for (const w of Object.keys(WORDS)) expect(title.toLowerCase()).not.toContain(w + "-layer");
  });
});
