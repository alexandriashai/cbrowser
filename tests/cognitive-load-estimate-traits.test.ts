/**
 * cognitive_load_estimate reads traits that exist (report item B29, 2026-10-10).
 *
 * estimateCognitiveLoad read visualProcessing, motorPrecision and textProcessing,
 * which exist in no schema, and attentionPattern / decisionStyle, which are
 * enums on the cognitive profile and never numbers in the trait vector. All five
 * fell back to 0.5, so visual, attention, motor and text were identical for
 * every persona: live, cognitive-adhd, power-user, dyslexic-user and
 * distracted-user all came back with the same four numbers on them.
 *
 * Attention, motor and text now read the bridged capacities (sustainedAttention,
 * motorCapacity, readingCapacity). Visual has no researched mapping and is
 * reported as persona-invariant rather than given an invented one.
 *
 * Pure: no browser.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-load-traits-"));

const { COGNITIVE_TRAITS, buildOTCognitiveProfile, estimateCognitiveLoad } =
  await import("../src/visual/cognitive-transport.js");

const PAGE = {
  informationDensity: 0.6, visualComplexity: 0.6, interactiveElementCount: 30,
  textDensity: 0.6, animationLevel: 0.7, choiceCount: 12, navigationDepth: 2,
};

const midTraits = (over: Record<string, number> = {}) =>
  Object.fromEntries([...COGNITIVE_TRAITS.map((t) => [t, 0.5]), ...Object.entries(over)]) as Record<string, number>;

describe("every trait the estimator reads is a real trait (class guard)", () => {
  test("no read falls outside COGNITIVE_TRAITS", () => {
    // Recorded at runtime rather than grepped, so a renamed helper or a new
    // dimension cannot slip a phantom name past the check.
    const read = new Set<string>();
    const traits = new Proxy(midTraits(), {
      get(target, key, recv) {
        if (typeof key === "string") read.add(key);
        return Reflect.get(target, key, recv);
      },
    });
    const profile = { ...buildOTCognitiveProfile("probe", midTraits()), traits };
    estimateCognitiveLoad(profile, PAGE);

    // Guards the guard: a proxy that saw nothing would pass forever.
    expect(read.has("comprehension")).toBe(true);
    const known = new Set<string>(COGNITIVE_TRAITS);
    const phantom = [...read].filter((k) => !known.has(k));
    expect(phantom, `estimateCognitiveLoad reads names that are not traits: ${phantom.join(", ")}`).toEqual([]);
  });

  test("it reads the three bridged capacities and satisficing", () => {
    const read = new Set<string>();
    const traits = new Proxy(midTraits(), {
      get(target, key, recv) { if (typeof key === "string") read.add(key); return Reflect.get(target, key, recv); },
    });
    estimateCognitiveLoad({ ...buildOTCognitiveProfile("probe", midTraits()), traits }, PAGE);
    for (const t of ["sustainedAttention", "motorCapacity", "readingCapacity", "satisficing"]) {
      expect(read.has(t), t).toBe(true);
    }
  });
});

describe("capacities move the dimensions they name (red on base)", () => {
  const low = buildOTCognitiveProfile("low", midTraits({ sustainedAttention: 0.2, motorCapacity: 0.2, readingCapacity: 0.2 }));
  const high = buildOTCognitiveProfile("high", midTraits({ sustainedAttention: 0.9, motorCapacity: 0.9, readingCapacity: 0.9 }));
  const lo = estimateCognitiveLoad(low, PAGE);
  const hi = estimateCognitiveLoad(high, PAGE);

  test("low capacity carries more attention, motor and text load", () => {
    for (const dim of ["attention", "motor", "text"]) {
      expect(lo.breakdown[dim], dim).toBeGreaterThan(hi.breakdown[dim]);
    }
    expect(lo.totalLoad).toBeGreaterThan(hi.totalLoad);
  });

  test("visual is declared persona-invariant, and is", () => {
    expect(lo.personaInvariant).toEqual(["visual"]);
    expect(hi.personaInvariant).toEqual(["visual"]);
    expect(lo.breakdown.visual).toBe(hi.breakdown.visual);
  });
});

describe("Hick-Hyman normalisation stays in 0-1", () => {
  test("decision load never exceeds 1, and saturates at 32 choices", () => {
    // log2(choices)/5 passed 1 above 32 choices: 64 options scored 1.31.
    const maximiser = buildOTCognitiveProfile("m", midTraits({ satisficing: 0 }));
    const at = (choiceCount: number) => estimateCognitiveLoad(maximiser, { ...PAGE, choiceCount }).breakdown.decision;
    for (const n of [33, 64, 1000, 1e6]) expect(at(n), `${n} choices`).toBeLessThanOrEqual(1);
    expect(at(64)).toBe(at(32));
    expect(at(16)).toBeLessThan(at(32));
  });

  test("every breakdown dimension stays in 0-1 on an extreme page", () => {
    const floor = buildOTCognitiveProfile("f", Object.fromEntries(COGNITIVE_TRAITS.map((t) => [t, 0])) as Record<string, number>);
    const r = estimateCognitiveLoad(floor, {
      informationDensity: 1, visualComplexity: 1, interactiveElementCount: 500,
      textDensity: 1, animationLevel: 1, choiceCount: 4096, navigationDepth: 40,
    });
    for (const [k, v] of Object.entries(r.breakdown)) {
      expect(v, k).toBeGreaterThanOrEqual(0);
      expect(v, k).toBeLessThanOrEqual(1);
    }
  });
});

type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ type: string; text?: string }> }>;

describe("the tool bridges before it estimates (live repro, red on base)", () => {
  async function loadOf(persona: string): Promise<{ breakdown: Record<string, number>; personaInvariant?: string[] }> {
    const { registerPersonaComparisonTools } = await import("../src/mcp-tools/base/persona-comparison-tools.js");
    const handlers: Record<string, Handler> = {};
    const server = {
      registerTool: (name: string, _cfg: unknown, h: Handler) => { handlers[name] = h; },
      tool: () => {}, registerResource: () => {}, resource: () => {},
    };
    registerPersonaComparisonTools(server as never, { getBrowser: async () => { throw new Error("no browser in this test"); } } as never);
    const r = await handlers.cognitive_load_estimate({
      persona, informationDensity: 0.6, visualComplexity: 0.6, interactiveElements: 30,
      textDensity: 0.6, animationLevel: 0.7, choiceCount: 12, navigationDepth: 2,
    });
    expect(r.isError, persona).toBeFalsy();
    return JSON.parse(r.content[0].text!);
  }

  test("the four personas from the report no longer tie on attention, motor and text", async () => {
    const names = ["cognitive-adhd", "power-user", "dyslexic-user", "distracted-user"];
    const loads = await Promise.all(names.map(loadOf));
    for (const dim of ["attention", "motor", "text"]) {
      const values = new Set(loads.map((l) => l.breakdown[dim]));
      expect(values.size, `${dim}: ${[...values].join(", ")}`).toBeGreaterThan(1);
    }
    const [adhd, power, dyslexic, distracted] = loads;
    // Directions the bridged models predict, not just "different".
    expect(distracted.breakdown.attention).toBeGreaterThan(power.breakdown.attention);
    expect(adhd.breakdown.attention).toBeGreaterThan(power.breakdown.attention);
    expect(dyslexic.breakdown.text).toBeGreaterThan(power.breakdown.text);
    for (const l of loads) expect(l.personaInvariant).toEqual(["visual"]);
  });

  test("bridging does not write into the persona record", async () => {
    const { getAnyPersona } = await import("../src/personas.js");
    await loadOf("dyslexic-user");
    const stored = (getAnyPersona("dyslexic-user") as { cognitiveTraits?: Record<string, number> }).cognitiveTraits ?? {};
    expect(stored.readingCapacity).toBeUndefined();
    expect(stored.motorCapacity).toBeUndefined();
  });
});

describe("every caller of the estimator bridges first", () => {
  test("no src file calls estimateCognitiveLoad more often than it bridges", () => {
    // The empathy_audit path builds the same profile and cannot be driven
    // without a browser, so it is held by source: a file that estimates load
    // without bridging scores every persona at the 0.5 capacity fallback.
    const root = join(import.meta.dir, "..", "src");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) files.push(p);
      }
    };
    walk(root);
    let callers = 0;
    for (const f of files) {
      if (f.endsWith(join("visual", "cognitive-transport.ts"))) continue; // the definition
      const src = readFileSync(f, "utf8");
      const estimates = (src.match(/estimateCognitiveLoad\(/g) ?? []).length;
      if (estimates === 0) continue;
      callers++;
      const bridges = (src.match(/bridgeCapacityTraits\(/g) ?? []).length;
      expect(bridges, `${f} estimates load ${estimates}x but bridges ${bridges}x`).toBeGreaterThanOrEqual(estimates);
    }
    expect(callers).toBeGreaterThanOrEqual(2);
  });
});
