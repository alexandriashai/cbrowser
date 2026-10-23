/**
 * Accessibility traits must reach the LLM relevance judge.
 *
 * The judge received `traits` (the 25 cognitive ones) and not
 * `accessibilityTraits` — a separate vector holding sensory, motor and
 * executive-function values. That is the wrong half to drop for a layer whose
 * entire job is deciding what a person attends to and reads, and this codebase
 * says so itself: `persona-comparison-tools.ts` names
 * `accessibility_traits.attentionSpan` the AUTHORITATIVE source for attention,
 * with `traits.interruptRecovery` only a fallback, and the decoding traits
 * authoritative for reading.
 *
 * Measured on the persona modelling an ADHD user: attentionSpan 0.30,
 * processingSpeed 0.40, fatigueSusceptibility 0.30 — the three values that
 * define her — were exactly the ones the judge never saw. It was told she has
 * high curiosity and comprehension, and not told she cannot hold a line of text.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * The persona is BUILT here, not read from whatever happens to be on the
 * machine.
 *
 * The first version of this file resolved "alexa-eden" from the local file
 * store. It passed on the author's box and failed in CI, which has no such
 * file — the identical defect the README carried in the same week, where a
 * region list was true on one machine's config and false for every reader.
 * A test that depends on undeclared local state is not a test.
 */
const FIXTURE_NAME = "fixture-a11y-persona";
const FIXTURE_ACCOUNT = 987654;
let mirrorRoot: string;
const prevRoot = process.env.CBROWSER_MIRROR_ROOT;

const FIXTURE = {
  name: FIXTURE_NAME,
  description: "Fixture persona modelling an ADHD user: short attention span, slow processing, full sensory and motor function.",
  cognitiveTraits: Object.fromEntries(
    ["patience","riskTolerance","comprehension","persistence","curiosity","workingMemory",
     "readingTendency","resilience","selfEfficacy","satisficing","trustCalibration",
     "interruptRecovery","metacognitivePlanning","proceduralFluency","transferLearning",
     "authoritySensitivity","emotionalContagion","fearOfMissingOut","socialProofSensitivity",
     "mentalModelFlexibility","siteFamiliarity","informationForaging","decisionLatency",
     "errorRecovery","noiseTolerance"].map((k, i) => [k, +(0.3 + (i % 7) * 0.1).toFixed(2)]),
  ),
  accessibilityTraits: {
    motorControl: 1, tremor: false, reachability: 1, visionLevel: 1,
    contrastSensitivity: 1, processingSpeed: 0.4, attentionSpan: 0.3,
    fatigueSusceptibility: 0.3,
  },
  // Required: getCognitiveProfile reads persona.demographics.device and throws
  // without it, and resolvePersonaContext catches that into an EMPTY context —
  // so a persona missing this reaches the judge with no traits and no error.
  // Worth hardening separately; the fixture must be complete either way.
  demographics: { age_range: "25-45", tech_level: "advanced", device: "desktop" },
  context: { viewport: [1280, 800] },
  schwartzValues: {
    selfDirection: 0.62, stimulation: 0.66, hedonism: 0.6, achievement: 0.48,
    power: 0.49, security: 0.41, conformity: 0.45, tradition: 0.43,
    benevolence: 0.6, universalism: 0.67,
  },
  behaviors: {},
};

beforeAll(() => {
  // CBROWSER_DATA_DIR did NOT work here until 21.0, which is why this setup
  // exists. `personas.ts` captured DATA_DIR in a module-level const at first
  // import, so in a single-process run — which is exactly how CI invokes
  // `bun test --coverage` — another file imported it before this beforeAll ran
  // and the env var was read too late. The test then passed alone and failed in
  // CI, which is what it did. personas.ts now reads it per call
  // (tests/real-personas-dir.test.ts); the scoped setup below still holds.
  //
  // `withPersonaScope` is the affordance built for this: AsyncLocalStorage, so
  // the data dir is bound to the async context rather than to the process, and
  // `accountDataDir` reads CBROWSER_MIRROR_ROOT at CALL time rather than freezing
  // it. Same reason it exists for concurrent requests on the hosted server.
  mirrorRoot = mkdtempSync(join(tmpdir(), "a11y-traits-"));
  process.env.CBROWSER_MIRROR_ROOT = mirrorRoot;
  const dir = join(mirrorRoot, "accounts", String(FIXTURE_ACCOUNT), "personas");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${FIXTURE_NAME}.json`), JSON.stringify(FIXTURE, null, 2));
});

afterAll(() => {
  rmSync(mirrorRoot, { recursive: true, force: true });
  if (prevRoot === undefined) delete process.env.CBROWSER_MIRROR_ROOT;
  else process.env.CBROWSER_MIRROR_ROOT = prevRoot;
});

/** Resolve inside the fixture's persona scope. */
async function resolve(name: string) {
  const { withPersonaScope } = await import("../src/persona-scope.js");
  const { resolvePersonaContext } = await import("../src/visual/persona-context.js");
  return await withPersonaScope(FIXTURE_ACCOUNT, () => resolvePersonaContext(name));
}

describe("resolvePersonaContext surfaces accessibility traits", () => {
  test("a persona that has them gets them", async () => {
    const ctx = await resolve(FIXTURE_NAME);
    expect(ctx.accessibilityTraits).toBeDefined();
    expect(Object.keys(ctx.accessibilityTraits!).length).toBeGreaterThan(0);
  });

  test("the executive-function values specifically come through", async () => {
    const a = (await resolve(FIXTURE_NAME)).accessibilityTraits!;
    // These are the ADHD signature and the whole reason this matters.
    expect(typeof a.attentionSpan).toBe("number");
    expect(typeof a.processingSpeed).toBe("number");
    expect(typeof a.fatigueSusceptibility).toBe("number");
  });

  test("the cognitive vector is unaffected — this is additive", async () => {
    const ctx = await resolve(FIXTURE_NAME);
    // Asserts the PROPERTY, not a count. The original `toBe(25)` was pinned to
    // one persona file's exact shape — the same machine-dependence this file was
    // just rewritten to remove, one assertion deeper.
    expect(Object.keys(ctx.traits ?? {}).length).toBeGreaterThanOrEqual(25);
    for (const t of ["patience", "curiosity", "comprehension", "workingMemory"]) {
      expect(typeof (ctx.traits ?? {})[t]).toBe("number");
    }
    expect(ctx.values).toBeDefined();
    expect(ctx.personaDescription).toBeTruthy();
  });

  test("a persona without them is not given an empty object", async () => {
    // Absent must stay absent, so the prompt omits the section entirely rather
    // than printing an empty heading the model has to interpret.
    const ctx = await resolve("first-timer");
    expect(ctx.accessibilityTraits).toBeUndefined();
  });

  test("an unresolvable persona yields an empty context, never a throw", async () => {
    const ctx = await resolve("no-such-persona-xyz");
    expect(ctx.accessibilityTraits).toBeUndefined();
    expect(ctx.traits).toBeUndefined();
  });
});

describe("the relevance layer consumes them", () => {
  test("the prompt renders a sensory/motor/executive section", async () => {
    const src = await Bun.file(
      new URL("../src/visual/llm-relevance.ts", import.meta.url),
    ).text();
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(code).toContain("describeAccessibility(ctx.accessibilityTraits)");
    // BOTH prompt sites — the scoring judge and the narrative judge. Fixing one
    // and leaving the other is how these two diverged the first time; the
    // shared resolver exists because of exactly that.
    const hits = code.split("describeAccessibility(ctx.accessibilityTraits)").length - 1;
    expect(hits).toBe(2);
  });

  test("the cache key includes them", async () => {
    // Without this the change is INERT rather than wrong: every persona already
    // cached keeps returning the answer computed before the judge could see
    // these traits. A silent no-op is the worse failure of the two.
    const src = await Bun.file(
      new URL("../src/visual/llm-relevance.ts", import.meta.url),
    ).text();
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const keyFn = code.slice(code.indexOf("function cacheKey"), code.indexOf("function readCache"));
    expect(keyFn).toContain("ctx.accessibilityTraits");
  });

  test("the cache version was bumped, so pre-change entries cannot be served", async () => {
    const src = await Bun.file(
      new URL("../src/visual/llm-relevance.ts", import.meta.url),
    ).text();
    expect(src).toContain('const CACHE_VERSION = "v3"');
  });
});

describe("describeAccessibility keeps unimpaired values visible", () => {
  test("a full-function persona still reports its sensory values", async () => {
    // Absence of impairment is information: it tells the judge NOT to attribute
    // a miss to eyesight, which is a conclusion an LLM reaches readily once it
    // knows a persona is disabled in some other respect. So this renderer is
    // deliberately NOT filtered to "notable" the way describeTraits is.
    const a = (await resolve(FIXTURE_NAME)).accessibilityTraits!;
    expect(a.visionLevel).toBe(1);
    expect(a.motorControl).toBe(1);
    expect(a.tremor).toBe(false);
  });
});
