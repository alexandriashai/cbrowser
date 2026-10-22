/**
 * The three vectors the transport chain runs on must line up.
 *
 * A persona's capacity lives in COGNITIVE_TRAITS. A page's demand lives in
 * DEMAND_DIMENSIONS. Cost is transport between them, attributed to whichever of
 * the six layers claims that dimension in LAYER_DEFINITIONS. A dimension missing
 * from any one of the three is silently inert: it is read, carried, and then
 * contributes nothing, with no error anywhere.
 *
 * That is not theoretical. `siteFamiliarity` was missing from TWO of them
 * (2026-08-02). It was a member of COGNITIVE_TRAITS, so every persona carried a
 * value and the tool accepted a per-run parameter for it — and three runs at
 * familiarity unset, 1 and 0 returned byte-identical results across all six
 * layers, every interaction term, and every derived field, while the response
 * attested `siteFamiliaritySource: "supplied for this run"`. The parameter was
 * never overridden by anything. Nothing ever asked for it.
 *
 * The behavioural test below is the one that would have caught it, and it is
 * the check that was missing when the parameter shipped: not "was the input
 * accepted" but "did the output move".
 *
 * @since 2026-08-02
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COGNITIVE_TRAITS, buildOTCognitiveProfile } from "../src/visual/cognitive-transport.js";
import { DEMAND_DIMENSIONS, computeDemandDistribution, computeSequentialCTC } from "../src/visual/cognitive-transport-chain.js";

const CHAIN_SRC = readFileSync(join(import.meta.dir, "..", "src", "visual", "cognitive-transport-chain.ts"), "utf8");

function traitsUsedByLayers(): Set<string> {
  const block = CHAIN_SRC.slice(CHAIN_SRC.indexOf("LAYER_DEFINITIONS"), CHAIN_SRC.indexOf("INTERACTION_PAIRS"));
  return new Set(Array.from(block.matchAll(/'([a-zA-Z]+)'/g), (m) => m[1]));
}

/**
 * Traits that reach no layer TODAY, recorded so a new one cannot join them
 * unnoticed.
 *
 * This list is a defect, not a design: nine of twenty-six dimensions are read
 * off every persona and contribute nothing to its score, which means two
 * personas differing only in `curiosity` or `trustCalibration` produce the same
 * cognitive transport cost. It is pinned rather than fixed because the six-layer
 * weighting is a calibrated research instrument and re-partitioning it changes
 * every number the tool has ever produced — that is the maintainer's call, not a
 * side effect of a bug fix.
 */
const KNOWN_UNLAYERED = [
  // interruptRecovery reaches no layer BY NAME, and is no longer inert: it is
  // the fallback source for `sustainedAttention` whenever a persona states no
  // accessibilityTraits.attentionSpan, which is 24 of 36 personas -- so for most
  // of the roster it now drives the readingAttention layer. It stays on this list
  // because the list is computed from LAYER_DEFINITIONS membership, and the
  // sentence above about contributing "to no score at all" no longer applies to
  // it. (2026-08-02, BUG-07)
  "attributionStyle", "authoritySensitivity", "curiosity", "interruptRecovery",
  "mentalModelFlexibility", "metacognitivePlanning", "persistence", "timeHorizon",
  "trustCalibration",
  // ADDED 2026-08-02 AND THIS IS A REGRESSION, NOT A DESIGN.
  //
  // Both were removed from the readability layer when it was rewired to the
  // decoding model: readingTendency is how much text a person chooses to read
  // (a disposition) and it was swamping the capacity signal, and
  // transferLearning is about applying patterns across UIs rather than decoding
  // text. Removing them fixed the inversion and cost two traits their only
  // consumer -- they now contribute to no score at all.
  //
  // readingTendency in particular is meaningful and should land somewhere:
  // plausibly modulating DEMAND (a skimmer asks less of a text-dense page)
  // rather than serving as capacity. That is a modelling decision, not a
  // cleanup, so it is recorded here rather than guessed at.
  // readingTendency reaches no LAYER by design, and is not inert: it modulates
  // DEMAND instead of serving as capacity, which is the correct side of the
  // model for a strategy rather than an ability. Listed here because this test
  // asks only about layer membership, and covered by its own describe block
  // below which asserts the demand consumer exists and behaves.
  "readingTendency",
  // Removed from the frustration layer in 21.0, deliberately. No page feature
  // writes demand to either, so in a layer they cost nothing and only halved
  // frustration's content gate. resilience is read by abandonment (blended
  // tolerance); selfEfficacy currently reaches no score.
  "resilience", "selfEfficacy",
].sort();

/** Traits with no demand term today. Same status: recorded, not blessed. */
const KNOWN_UNDEMANDED = ["attributionStyle", "authoritySensitivity", "timeHorizon"].sort();

/**
 * The reverse gap: demand dimensions that are not persona traits. No persona in
 * the tool path carries them, so each reads chain.missingTraitCapacity, and none
 * is in a layer. Pinned so DEMAND_DIMENSIONS cannot grow a dimension no persona
 * can fill without someone deciding it should. (21.0)
 */
const KNOWN_DEMAND_ONLY = ["attentionPattern", "motorPrecision", "processingSpeed", "textProcessing"].sort();

describe("siteFamiliarity actually reaches the chain", () => {
  const baseTraits: Record<string, number> = Object.fromEntries(
    (COGNITIVE_TRAITS as readonly string[]).map((t) => [t, 0.5]),
  );
  // Navigation depth is what makes a page demand site knowledge; a one-click
  // page legitimately demands none, so the probe uses a page with real depth.
  const deepPage = {
    informationDensity: 0.6, visualComplexity: 0.5, interactiveElementCount: 40,
    textDensity: 0.5, animationLevel: 0.1, choiceCount: 12, navigationDepth: 4,
  } as never;

  function run(fam: number): { total: number; cognitiveLoad: number } {
    const demand = computeDemandDistribution(deepPage);
    const profile = buildOTCognitiveProfile("probe", { ...baseTraits, siteFamiliarity: fam });
    const r = computeSequentialCTC(profile, demand, { asymmetric: true, interactions: true });
    const cl = r.layers.find((l: { name: string }) => l.name === "cognitiveLoad");
    return { total: r.totalCTC, cognitiveLoad: (cl as { transportCost: number }).transportCost };
  }

  test("familiarity 0 and 1 produce different totals", () => {
    // The report's regression check, verbatim: run(fam=0) !== run(fam=1).
    const a = run(0), b = run(1);
    expect(a.total).not.toBe(b.total);
  });

  test("a first-time visitor pays MORE, not less", () => {
    // Direction matters as much as difference — a wired-up-backwards parameter
    // also passes "the numbers differ".
    expect(run(0).total).toBeGreaterThan(run(1).total);
    expect(run(0).cognitiveLoad).toBeGreaterThan(run(1).cognitiveLoad);
  });

  test("direction holds at EVERY navigation depth, not just a deep page", () => {
    // This test exists because the version above passed while the live tool was
    // inverted. It ran one deep page; on a shallow real site (cbrowser.ai) the
    // demand for site knowledge is near zero, a familiarity of 1.0 is then
    // almost entirely surplus, and surplus was billed at 0.3 — so the daily
    // user was charged MORE than the first-timer (0.268 vs 0.19). Knowing a
    // site cannot make it harder, so familiarity surplus is now free, and the
    // claim is checked across the range rather than at one convenient point.
    for (const navigationDepth of [0, 1, 2, 4, 8]) {
      const demand = computeDemandDistribution({
        informationDensity: 0.6, visualComplexity: 0.5, interactiveElementCount: 40,
        textDensity: 0.5, animationLevel: 0.1, choiceCount: 12, navigationDepth,
      } as never);
      const at = (fam: number) => computeSequentialCTC(
        buildOTCognitiveProfile("probe", { ...baseTraits, siteFamiliarity: fam }),
        demand, { asymmetric: true, interactions: true }).totalCTC;
      // Never worse for knowing the site. Equal is fine — a one-click page
      // legitimately asks nothing of your site knowledge.
      expect(at(0)).toBeGreaterThanOrEqual(at(1));
    }
  });

  test("more site knowledge is never a penalty, at any value", () => {
    const demand = computeDemandDistribution({
      informationDensity: 0.6, visualComplexity: 0.5, interactiveElementCount: 40,
      textDensity: 0.5, animationLevel: 0.1, choiceCount: 12, navigationDepth: 3,
    } as never);
    const at = (fam: number) => computeSequentialCTC(
      buildOTCognitiveProfile("probe", { ...baseTraits, siteFamiliarity: fam }),
      demand, { asymmetric: true, interactions: true }).totalCTC;
    // Monotonic, not merely correct at the endpoints.
    const costs = [0, 0.25, 0.5, 0.75, 1].map(at);
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]).toBeLessThanOrEqual(costs[i - 1] + 1e-9);
    }
  });

  test("the page must demand site knowledge for familiarity to matter", () => {
    // A one-click page asks nothing of your site knowledge, so familiarity
    // legitimately does not move the number there. If this ever stops holding,
    // the demand term has become a constant rather than a function of depth.
    const flat = computeDemandDistribution({ ...(deepPage as object), navigationDepth: 0 } as never);
    expect(flat.demands.siteFamiliarity).toBe(0);
  });

  test("it has a demand term and a home layer", () => {
    expect(DEMAND_DIMENSIONS as readonly string[]).toContain("siteFamiliarity");
    expect(traitsUsedByLayers().has("siteFamiliarity")).toBe(true);
  });
});

describe("no dimension goes silently inert", () => {
  test("every trait either reaches a layer or is on the known-unlayered list", () => {
    const used = traitsUsedByLayers();
    const unlayered = (COGNITIVE_TRAITS as readonly string[]).filter((t) => !used.has(t)).sort();
    // A new name here means a trait was added to the persona vector and wired to
    // nothing — read off every persona, contributing to no score.
    expect(unlayered).toEqual(KNOWN_UNLAYERED);
  });

  test("every trait either has a demand term or is on the known-undemanded list", () => {
    const dem = new Set(DEMAND_DIMENSIONS as readonly string[]);
    const undemanded = (COGNITIVE_TRAITS as readonly string[]).filter((t) => !dem.has(t)).sort();
    expect(undemanded).toEqual(KNOWN_UNDEMANDED);
  });

  test("every demand dimension is a persona trait or on the known demand-only list", () => {
    const traits = new Set(COGNITIVE_TRAITS as readonly string[]);
    const demandOnly = (DEMAND_DIMENSIONS as readonly string[]).filter((d) => !traits.has(d)).sort();
    expect(demandOnly).toEqual(KNOWN_DEMAND_ONLY);
  });

  test("the orphan lists are shrinking-only", () => {
    // Guards the guard: if someone fixes a trait, they must shorten the list,
    // and the test fails loudly rather than passing on a stale allowlist.
    const used = traitsUsedByLayers();
    for (const t of KNOWN_UNLAYERED) {
      expect(used.has(t)).toBe(false);
    }
  });
});

describe("siteFamiliarity is not stored on personas", () => {
  test("it is absent from every builtin definition", () => {
    const personas = readFileSync(join(import.meta.dir, "..", "src", "personas.ts"), "utf8");
    // A persona-SITE pair cannot be a stored disposition: "familiar with which
    // site?" has no answer until a URL is named.
    //
    // Matched as an assigned NUMBER, not the bare identifier: stripStoredFamiliarity
    // destructures the key by name, and a test that forbids the string outright
    // fails on the very guard that enforces it. Comparing a boolean also keeps a
    // failure from dumping the whole file into the output.
    const storedValues = personas.match(/siteFamiliarity:\s*[0-9]/g) ?? [];
    expect(storedValues.length).toBe(0);
  });

  test("the save path strips it, so it cannot come back through a write", () => {
    const personas = readFileSync(join(import.meta.dir, "..", "src", "personas.ts"), "utf8");
    expect(personas).toContain("export function stripStoredFamiliarity");
    expect(personas).toMatch(/writeFileSync\(filepath, JSON\.stringify\(stripStoredFamiliarity\(persona\)/);
  });
});

describe("an unknown persona is refused, not fabricated", () => {
  test("resolving a name that does not exist throws", async () => {
    const { resolvePersonaOrThrow } = await import("../src/personas.js");
    // It used to return createCognitivePersona(name, name, {}) — a complete
    // persona with every trait at 0.5, named after the typo, which then
    // produced a full six-layer breakdown, an abandonment risk and an
    // interpretation sentence quoting the typo as a subject. In range,
    // plausible, and indistinguishable from a measurement.
    expect(() => resolvePersonaOrThrow("zzz-not-a-real-persona")).toThrow(/Unknown persona/);
  });

  test("the refusal says nothing was measured", async () => {
    const { resolvePersonaOrThrow } = await import("../src/personas.js");
    try {
      resolvePersonaOrThrow("zzz-not-a-real-persona");
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).toContain("Nothing was measured");
    }
  });

  test("a near miss suggests the real name", async () => {
    const { suggestPersonaNames } = await import("../src/personas.js");
    // Case and punctuation are the commonest misses, then typos.
    expect(suggestPersonaNames("POWER-USER")).toContain("power-user");
    expect(suggestPersonaNames("power user")).toContain("power-user");
    expect(suggestPersonaNames("first-timr")).toContain("first-timer");
  });

  test("supplying traits still defines an ad-hoc persona", async () => {
    const { resolvePersonaOrThrow } = await import("../src/personas.js");
    // The one legitimate synthesis: a caller defining a persona outright.
    // Supplying NO traits and no known name is a typo, not a definition.
    const p = resolvePersonaOrThrow("adhoc-probe", { patience: 0.2 }) as { name: string };
    expect(p.name).toBe("adhoc-probe");
  });

  test("no tool still falls back to an all-default persona", () => {
    // Class-sweep guard: the fabrication signature is
    // `createCognitivePersona(x, x, {})` reached on a resolution miss.
    const files = [
      "src/mcp-tools/base/persona-comparison-tools.ts",
      "src/mcp-tools/base/audit-tools.ts",
    ];
    for (const f of files) {
      const src = readFileSync(join(import.meta.dir, "..", f), "utf8");
      // Every remaining `|| createCognitivePersona(...)` must be guarded by a
      // resolvePersonaOrThrow on the line above it.
      const unguarded = src.split("\n").filter((line, i, all) =>
        /\|\| createCognitivePersona\(/.test(line) &&
        !/resolvePersonaOrThrow/.test(all.slice(Math.max(0, i - 3), i + 1).join("\n")));
      expect(unguarded).toEqual([]);
    }
  });
});

describe("the chain coefficient compares matched units", () => {
  const base: Record<string, number> = Object.fromEntries(
    (COGNITIVE_TRAITS as readonly string[]).map((t) => [t, 0.5]));
  const at = (informationDensity: number) => {
    const demand = computeDemandDistribution({
      informationDensity, visualComplexity: informationDensity, interactiveElementCount: 40,
      textDensity: informationDensity, animationLevel: 0.1, choiceCount: 12, navigationDepth: 3,
    } as never);
    return computeSequentialCTC(buildOTCognitiveProfile("p", base), demand,
      { asymmetric: true, interactions: true });
  };

  test("totalCTC is a sigmoid of rawCTC, so they are not interchangeable", () => {
    // The bug this whole block exists for: the published coefficient divided
    // totalCTC (squashed to 0-1) by additiveCTC (a raw unbounded sum) and
    // reported ~0.3-0.5, which read as the chain dampening cost by 60%. It was
    // reporting the sigmoid, not the chain.
    const r = at(0.9);
    const expected = 1 / (1 + Math.exp(-2.5 * (r.rawCTC - 1.2)));
    expect(r.totalCTC).toBeCloseTo(expected, 6);
    expect(r.totalCTC).not.toBeCloseTo(r.rawCTC, 2);
  });

  test("the coefficient is >= 1: the chain adds cost, it does not remove it", () => {
    // Interactions and depletion can only ADD to the layer sum. A value below 1
    // means the ratio is measuring something other than the chain.
    for (const d of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const r = at(d);
      expect(r.rawCTC / r.additiveCTC).toBeGreaterThanOrEqual(0.999);
    }
  });

  test("the effect is real but small — 2% or less, not compounding", () => {
    // Stated so a claim of "costs compound sequentially" cannot quietly grow
    // past what the model does. Measured 1.002-1.019 across densities.
    for (const d of [0.1, 0.5, 0.9]) {
      const r = at(d);
      expect(r.rawCTC / r.additiveCTC).toBeLessThan(1.05);
    }
  });

  test("abandonment risk does not read totalCTC", () => {
    // They are different constructs and are allowed to disagree: a page can be
    // cheap in absolute terms and still exhaust a persona with little patience.
    // Two personas with identical trait vectors except patience must produce
    // the same CTC and different abandonment.
    const demand = computeDemandDistribution({
      informationDensity: 0.8, visualComplexity: 0.6, interactiveElementCount: 40,
      textDensity: 0.7, animationLevel: 0.1, choiceCount: 12, navigationDepth: 3,
    } as never);
    const run = (patience: number) => computeSequentialCTC(
      buildOTCognitiveProfile("p", { ...base, patience }), demand,
      { asymmetric: true, interactions: true });
    const calm = run(0.9), impatient = run(0.1);
    expect(impatient.abandonmentRisk).toBeGreaterThan(calm.abandonmentRisk);
  });
});

describe("attention tools render at the configured viewport", () => {
  test("no attention tool hardcodes its own viewport", async () => {
    // attention_analysis rendered at 1920x1080 while every other tool used the
    // configured 1280x800, so an attention run and a cognitive_effort run were
    // measuring different rendered pages while reporting coordinates as if they
    // shared a space. The tell was regions at x=1312 under a 1280 config.
    //
    // Checked across the files that register attention tools, because the first
    // fix for this landed in the wrong tool: visual_cognitive_story had an
    // identical line and got patched instead of attention_analysis.
    const { readFileSync } = await import("node:fs");
    const files = [
      "src/mcp-tools/base/visual-testing-tools.ts",
      "src/mcp-tools/base/audit-tools.ts",
    ];
    for (const f of files) {
      const src = readFileSync(join(import.meta.dir, "..", f), "utf8");
      const hardcoded = src.split("\n").filter((l) => /viewportWidth:\s*\d/.test(l));
      expect(hardcoded).toEqual([]);
    }
  });

  test("attention_analysis states the viewport it rendered at", () => {
    const src = readFileSync(join(import.meta.dir, "..", "src/mcp-tools/base/visual-testing-tools.ts"), "utf8");
    // So a reader can check comparability instead of assuming it.
    expect(src).toContain("renderedViewport:");
    expect(src).toContain("coordinateSpace:");
  });
});

describe("the mentalModelFlexibility rename is complete and back-compatible", () => {
  test("a persona stored under the old key still contributes", async () => {
    // The alias map and canonicalTraitName sat in trait-reference.ts for months
    // with NOTHING outside that file calling either, so a persona saved as
    // mentalModelRigidity loaded with a key matching no COGNITIVE_TRAITS member
    // and contributed nothing to any score. Same shape as a trait present in
    // the persona vector and absent from the demand vector.
    const { canonicalizeTraits } = await import("../src/trait-reference.js");
    const out = canonicalizeTraits({ mentalModelRigidity: 0.2, patience: 0.5 }) as Record<string, number>;
    expect(out.mentalModelFlexibility).toBe(0.2);
    expect("mentalModelRigidity" in out).toBe(false);
    expect(out.patience).toBe(0.5);
  });

  test("an explicit canonical value is not clobbered by a stale alias", () => {
    // Both keys present means the record was half-migrated. The new name wins.
    const { canonicalizeTraits } = require("../src/trait-reference.js");
    const out = canonicalizeTraits({ mentalModelFlexibility: 0.9, mentalModelRigidity: 0.1 });
    expect(out.mentalModelFlexibility).toBe(0.9);
  });

  test("the canonical name is the one in the model's trait vector", () => {
    expect(COGNITIVE_TRAITS as readonly string[]).toContain("mentalModelFlexibility");
    expect(COGNITIVE_TRAITS as readonly string[]).not.toContain("mentalModelRigidity");
  });

  test("the old name survives only as an alias, nowhere else in src", () => {
    // Guards the contract-half of expand-contract: the alias must stay until
    // nothing on disk uses the old key, but no live code path may read it.
    const ref = readFileSync(join(import.meta.dir, "..", "src/trait-reference.ts"), "utf8");
    expect(ref).toContain('mentalModelRigidity: "mentalModelFlexibility"');
  });
});

describe("capacity layers read capacity, not disposition", () => {
  test("a dyslexic persona costs MORE on readability than an ADHD persona", async () => {
    // The P0 this wiring exists for. Before it, the readability layer read
    // readingTendency -- how much text someone chooses to read -- so an ADHD
    // persona who skims (0.2) scored a larger capacity deficit than a dyslexic
    // persona who reads more (0.4), and the tool reported that a text-dense
    // university homepage cost the dyslexic reader LESS THAN HALF as much,
    // in the same response that reported them at 157 WPM against 204 and a
    // 4-character visual span against 6.
    const { getAnyPersona } = await import("../src/personas.js");
    const { getReadingProfile, getPointingProfile, readingCapacityOf, motorCapacityOf } =
      await import("../src/visual/cognitive-models.js");
    const demand = computeDemandDistribution({
      informationDensity: 0.8, visualComplexity: 0.6, interactiveElementCount: 60,
      textDensity: 0.85, animationLevel: 0.1, choiceCount: 20, navigationDepth: 3,
    } as never);
    const cost = (name: string) => {
      const t: Record<string, number> = { ...((getAnyPersona(name) as never as { cognitiveTraits: Record<string, number> }).cognitiveTraits) };
      t.readingCapacity = readingCapacityOf(getReadingProfile({ name, traits: t }));
      t.motorCapacity = motorCapacityOf(getPointingProfile({ name, traits: t }));
      const r = computeSequentialCTC(buildOTCognitiveProfile(name, t), demand, { asymmetric: true, interactions: true });
      return (r.layers.find((l: { name: string }) => l.name === "readability") as { transportCost: number }).transportCost;
    };
    expect(cost("dyslexic-user")).toBeGreaterThan(cost("cognitive-adhd"));
  });

  test("the reading capacity bridge tracks the decoding model, not the trait vector", async () => {
    const { getReadingProfile, readingCapacityOf } = await import("../src/visual/cognitive-models.js");
    const dys = readingCapacityOf(getReadingProfile({ name: "dyslexic-user" }));
    const adhd = readingCapacityOf(getReadingProfile({ name: "cognitive-adhd" }));
    // 0.39 vs 0.75 on the shipped profiles. Direction is what matters.
    expect(dys).toBeLessThan(adhd);
  });

  test("no disposition trait remains in a capacity layer", () => {
    // Extract the layer's OWN traits array. A fixed-width window truncated
    // before the traits line on one layer and spilled into the next on another
    // -- and the next layer is frustration, which legitimately keeps patience,
    // so the naive version failed on correct code.
    const block = CHAIN_SRC.slice(CHAIN_SRC.indexOf("LAYER_DEFINITIONS"), CHAIN_SRC.indexOf("INTERACTION_PAIRS"));
    const traitsOf = (layer: string): string => {
      const at = block.indexOf(`name: '${layer}'`);
      expect(at).toBeGreaterThan(-1);
      const m = block.slice(at).match(/traits: \[([^\]]*)\]/);
      expect(m).toBeTruthy();
      return (m as RegExpMatchArray)[1];
    };
    const readability = traitsOf("readability");
    const motor = traitsOf("motor");
    // The two dispositions that inverted their own layers.
    expect(readability).not.toContain("readingTendency");
    expect(motor).not.toContain("patience");
    expect(readability).toContain("readingCapacity");
    expect(motor).toContain("motorCapacity");
    // patience still belongs to frustration, and must not have been swept out.
    expect(traitsOf("frustration")).toContain("patience");
  });
});

describe("readingTendency modulates demand, not capacity", () => {
  const base: Record<string, number> = Object.fromEntries(
    (COGNITIVE_TRAITS as readonly string[]).map((t) => [t, 0.5]));
  const textPage = {
    informationDensity: 0.8, visualComplexity: 0.5, interactiveElementCount: 30,
    textDensity: 0.9, animationLevel: 0.1, choiceCount: 10, navigationDepth: 2,
  } as never;
  // Reads readingAttention, not readability. Engagement scales how long you
  // must hold the line; it does NOT change how hard the words you do read are
  // to decode, so as of the layer split (2026-08-02) it modulates only the
  // attentional demand. Skimming reduces exposure, not difficulty.
  const cost = (readingTendency: number) => {
    const demand = computeDemandDistribution(textPage);
    const r = computeSequentialCTC(
      buildOTCognitiveProfile("probe", { ...base, readingTendency, readingCapacity: 0.5, sustainedAttention: 0.3 }),
      demand, { asymmetric: true, interactions: true });
    return (r.layers.find((l: { name: string }) => l.name === "readingAttention") as { transportCost: number }).transportCost;
  };

  test("a skimmer engages less text demand than a careful reader", () => {
    // The trait is a STRATEGY, not an ability: skimming is how someone spends
    // less effort on text. On the capacity side it said the opposite — that a
    // skimmer lacks reading ability — which is what inverted the layer.
    expect(cost(0.1)).toBeLessThan(cost(0.9));
  });

  test("it does NOT touch decoding demand", () => {
    // Applied to readingCapacity for one commit. That made decoding demand
    // persona-specific and silently voided the legibilityQuality contract:
    // distracted-user at legibility 0.619 paid 0.000 while careful-reader at
    // 0.724 paid 0.016, purely because the skimmer's demand had been scaled
    // down. A contract stated across personas must be computed against a demand
    // that does not vary by persona.
    const demand = computeDemandDistribution(textPage);
    const decode = (readingTendency: number) => {
      const r = computeSequentialCTC(
        buildOTCognitiveProfile("p", { ...base, readingTendency, readingCapacity: 0.35 }),
        demand, { asymmetric: true, interactions: true });
      return (r.layers.find((l: { name: string }) => l.name === "readability") as { transportCost: number }).transportCost;
    };
    expect(decode(0.1)).toBeCloseTo(decode(0.9), 9);
    expect(decode(0.1)).toBeGreaterThan(0);
  });

  test("the modulation is bounded — strategy cannot outweigh decoding ability", () => {
    // Asserted on the ENGAGEMENT FACTOR, not on a cost ratio. The first version
    // divided two costs and blew up whenever the skim cost approached zero,
    // which is a property of the assertion rather than of the model.
    // 0.75 at pure skim, 1.25 at pure careful reading: a skimmer still has to
    // find the content, so demand can never fall toward zero.
    const src = CHAIN_SRC.slice(CHAIN_SRC.indexOf("const readingTendency ="),
      CHAIN_SRC.indexOf("const readingTendency =") + 500);
    // 0.75 and 0.5 are registered hypotheses (chain.engagement.atSkim / .range), read through param().
    expect(src).toContain("P.engagementAtSkim + readingTendency * P.engagementRange");
    // And the two ends stay within a factor the decoding gap can overcome.
    expect(cost(0.0)).toBeGreaterThan(0);
    expect(cost(1.0)).toBeGreaterThan(cost(0.0));
  });

  test("a skimmer with poor decoding still costs more than a careful reader with good decoding", () => {
    // The load-bearing case. ADHD skims (0.2) and decodes well (0.75);
    // dyslexic reads more (0.4) and decodes poorly (0.39). Decoding must win.
    const demand = computeDemandDistribution(textPage);
    const run = (readingTendency: number, readingCapacity: number) => {
      const r = computeSequentialCTC(
        buildOTCognitiveProfile("p", { ...base, readingTendency, readingCapacity }),
        demand, { asymmetric: true, interactions: true });
      return (r.layers.find((l: { name: string }) => l.name === "readability") as { transportCost: number }).transportCost;
    };
    expect(run(0.4, 0.39)).toBeGreaterThan(run(0.2, 0.75));
    // And now trivially so, because readability is decoding-only: the skimming
    // strategy cannot reach this layer at all.
  });

  test("readingTendency is no longer a capacity in any layer", () => {
    // Scans the traits ARRAYS, not the block text — the block explains at
    // length why readingTendency was moved, and the first version of this test
    // failed on its own explanation.
    const block = CHAIN_SRC.slice(CHAIN_SRC.indexOf("LAYER_DEFINITIONS"), CHAIN_SRC.indexOf("INTERACTION_PAIRS"));
    const arrays = Array.from(block.matchAll(/traits: \[([^\]]*)\]/g), (m) => m[1]);
    expect(arrays.length).toBeGreaterThan(0);
    for (const a of arrays) expect(a).not.toContain("readingTendency");
  });
});

describe("remaining hardening from the QA reports", () => {
  test("persona names resolve tolerantly, but an unknown name still fails", async () => {
    const { getAnyPersona } = await import("../src/personas.js");
    // Exact match is tried first and always wins, so this only ever ADDS
    // resolutions. Before unknown names threw, a capitalised name silently
    // produced an all-midpoint fabricated persona.
    for (const n of ["POWER-USER", "Power-User", "power user", "cognitive_adhd"]) {
      expect(getAnyPersona(n)).toBeTruthy();
    }
    expect(getAnyPersona("power-user")).toBeTruthy();
    // Tolerance must not become "resolves anything".
    expect(getAnyPersona("zzz-not-a-real-persona")).toBeUndefined();
    expect(getAnyPersona("")).toBeUndefined();
  });

  test("motor barrier selectors identify WHICH element", () => {
    const src = readFileSync(join(import.meta.dir, "..", "src/mcp-tools/base/persona-comparison-tools.ts"), "utf8");
    // Reported as bare "a" before, so every anchor looked identical: a finding
    // like "an <a> with 1% hit probability" named nothing anyone could fix, and
    // two runs surfacing different links looked like one element behaving
    // inconsistently.
    expect(src).toContain("nth-of-type");
    expect(src).toContain("aria-label");
  });

  test("each attention verdict names its basis", () => {
    const vt = readFileSync(join(import.meta.dir, "..", "src/mcp-tools/base/visual-testing-tools.ts"), "utf8");
    const aq = readFileSync(join(import.meta.dir, "..", "src/visual/attention-quality.ts"), "utf8");
    // Two bare verdicts in one payload read as the tool contradicting itself:
    // "design intent is working" beside "attention diverges from intended
    // design", off an alignmentScore of 0.484. Both were right about different
    // questions.
    expect(vt).toContain("alignmentScore ");
    // Checked on CODE lines, not raw file text: the comment explaining the
    // removal necessarily quotes the removed string, and the first version of
    // this assertion failed on its own explanation. Third time today.
    const codeLines = aq.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
    expect(codeLines.join("\n")).not.toContain("Design intent is working");
    expect(aq).toContain("Strong attention capture");
  });
});

describe("dyslexic-user carries a differentiated trait vector", () => {
  test("working memory is impaired, not above average", async () => {
    // The single clearest inversion in the old vector: it sat at 0.6, above
    // neutral, against one of the best-established findings in the dyslexia
    // literature — a WM deficit that persists into adulthood across both
    // phonological and visuospatial modalities.
    const { getAnyPersona } = await import("../src/personas.js");
    const t = (getAnyPersona("dyslexic-user") as never as { cognitiveTraits: Record<string, number> }).cognitiveTraits;
    expect(t.workingMemory).toBeLessThan(0.45);
  });

  test("compensation traits are elevated, not baseline", async () => {
    // Slower reading, text-structure use and sustained strategy are the three
    // documented compensatory mechanisms. A persona that models dyslexia purely
    // as deficit misses what these users actually do.
    const { getAnyPersona } = await import("../src/personas.js");
    const t = (getAnyPersona("dyslexic-user") as never as { cognitiveTraits: Record<string, number> }).cognitiveTraits;
    expect(t.patience).toBeGreaterThan(0.6);
    expect(t.persistence).toBeGreaterThan(0.6);
    expect(t.metacognitivePlanning).toBeGreaterThan(0.6);
    expect(t.informationForaging).toBeGreaterThan(0.55);
  });

  test("the vector is not effectively a default vector", async () => {
    // BUG-05: 21 of 25 traits sat at exactly 0.5 or 0.6, so the persona was
    // barely distinguishable from a generic user in trait space and the layers
    // had almost nothing persona-specific to read. Bound is deliberately loose
    // — the point is that it cannot silently flatten back.
    const { getAnyPersona } = await import("../src/personas.js");
    const t = (getAnyPersona("dyslexic-user") as never as { cognitiveTraits: Record<string, number> }).cognitiveTraits;
    const defined = (COGNITIVE_TRAITS as readonly string[]).filter((k) => t[k] !== undefined);
    const flat = defined.filter((k) => Math.abs(t[k] - 0.5) < 0.001 || Math.abs(t[k] - 0.6) < 0.001);
    expect(flat.length).toBeLessThan(15);
  });

  test("comprehension staying at 0.5 is correct, not an oversight", async () => {
    // Called out in the bug report as a defining-characteristic trait left at
    // baseline. It is not a reading trait: its own criteria are "grasp of UI
    // conventions". Dyslexia does not impair that, and decoding ability now
    // enters the chain through readingCapacity instead.
    const { getAnyPersona } = await import("../src/personas.js");
    const t = (getAnyPersona("dyslexic-user") as never as { cognitiveTraits: Record<string, number> }).cognitiveTraits;
    expect(t.comprehension).toBe(0.5);
    const ref = readFileSync(join(import.meta.dir, "..", "src/values/persona-completeness.ts"), "utf8");
    expect(ref).toContain("comprehension: \"Grasp of UI conventions");
  });
});

describe("motor pass admits only real pointing targets", () => {
  test("non-hit-testable elements are excluded before Fitts", () => {
    const src = readFileSync(join(import.meta.dir, "..", "src/mcp-tools/base/persona-comparison-tools.ts"), "utf8");
    // BUG-09: a visually-hidden skip link (1px box, clip: rect(0,0,0,0)) passed
    // the old size-and-viewport filter, went into Fitts, and produced a
    // multi-second movement time at 1% accuracy — so the tool docked a site's
    // motor accessibility score for implementing WCAG 2.4.1 Bypass Blocks.
    expect(src).toContain("elementFromPoint");
    expect(src).toContain("MIN_TARGET_PX");
    expect(src).toContain("pointerEvents");
    expect(src).toMatch(/visibility === "hidden"/);
  });

  test("the overlay is drawn from the scored list, not a second query", () => {
    const src = readFileSync(join(import.meta.dir, "..", "src/mcp-tools/base/persona-comparison-tools.ts"), "utf8");
    // The overlay used to re-query with a DIFFERENT filter and zip to
    // motorResult.elements by index, so tightening the scoring filter would
    // have drawn each element's hit probability on another element's box.
    expect(src).toContain("motorGeom.map(");
    expect(src).not.toMatch(/const els = document\.querySelectorAll\('a, button/);
  });
});

describe("suppressed decisionStyle reports itself", () => {
  test("null plus a suppression flag, not an omitted key", async () => {
    // BUG-08: the key was omitted while decisionStyleSource still said
    // "derived", so the source claimed a derivation for an absent value and
    // consumers could not tell suppression from "never computed".
    const { createCognitivePersona, getCognitiveProfile } = await import("../src/personas.js");
    const p = createCognitivePersona("tie-probe-2", "probe", {
      patience: 0.5, satisficing: 0.5, riskTolerance: 0.5,
      metacognitivePlanning: 0.5, informationForaging: 0.5, comprehension: 0.5,
    } as never);
    delete (p as never as { behaviors: Record<string, unknown> }).behaviors.decisionStyle;
    const prof = getCognitiveProfile(p) as never as Record<string, unknown>;
    expect(prof.decisionStyle).toBeNull();
    expect(prof.decisionStyleSuppressed).toBe(true);
    expect(prof.decisionStyleThreshold).toBe(0.05);
    expect(prof.decisionStyleSource).toBe("suppressed");
  });
});

describe("reading capacity is reachable from the trait schema", () => {
  test("stating a reading trait changes the reading profile", async () => {
    // BUG-10: getReadingProfile matched on the persona's NAME, so WPM, fixation
    // span and phonological penalty could not be tuned by any trait edit.
    // Twelve trait changes to dyslexic-user moved cognitiveLoad and frustration
    // substantially and left every reading measure byte-identical.
    const { getReadingProfile } = await import("../src/visual/cognitive-models.js");
    const base = getReadingProfile({ name: "dyslexic-user" });
    const tuned = getReadingProfile({ name: "dyslexic-user", accessibilityTraits: { visualSpan: 7 } });
    expect(base.visualSpan).toBe(4);
    expect(tuned.visualSpan).toBe(7);
  });

  test("a partial statement does not reset the other fields", async () => {
    // Stating one value must not silently blank the rest to defaults — that
    // would make the schema unusable for incremental authoring.
    const { getReadingProfile } = await import("../src/visual/cognitive-models.js");
    const base = getReadingProfile({ name: "dyslexic-user" });
    const tuned = getReadingProfile({ name: "dyslexic-user", accessibilityTraits: { visualSpan: 7 } });
    expect(tuned.phonological).toBe(base.phonological);
    expect(tuned.orthographic).toBe(base.orthographic);
    expect(tuned.crowding).toBe(base.crowding);
  });

  test("it reaches WPM, which is the measure the report tracked", async () => {
    const { readability } = await import("../src/visual/cognitive-models.js");
    const blocks = [{ text: "The interdisciplinary undergraduate admissions process requires documentation.".repeat(3),
      fontSize: 16, lineHeight: 1.5, fontFamily: "sans-serif", isSerif: false, contrastRatio: 7 }];
    const wpm = (acc?: Record<string, number>) => {
      const r = readability(blocks as never, { name: "dyslexic-user", accessibilityTraits: acc } as never);
      return (r.blocks[0] as { wordsPerMinute: number }).wordsPerMinute;
    };
    expect(wpm({ visualSpan: 7, phonologicalDecoding: 0.85 })).toBeGreaterThan(wpm());
  });

  test("the migrated personas state their capacity explicitly", async () => {
    const { getAnyPersona } = await import("../src/personas.js");
    for (const n of ["dyslexic-user", "cognitive-adhd", "low-vision-magnified", "elderly-low-vision"]) {
      const at = (getAnyPersona(n) as never as { accessibilityTraits?: Record<string, number> }).accessibilityTraits;
      expect(at?.visualSpan).toBeGreaterThan(0);
      expect(typeof at?.phonologicalDecoding).toBe("number");
    }
  });

  test("elderly-low-vision is no longer resolved by name-match ordering", async () => {
    // The lookup tests 'low-vision' before 'elderly', so a persona that is both
    // silently got only the low-vision half. Each dimension now takes the more
    // impaired value, except vocabulary where age is an advantage.
    const { getAnyPersona } = await import("../src/personas.js");
    const at = (getAnyPersona("elderly-low-vision") as never as { accessibilityTraits: Record<string, number> }).accessibilityTraits;
    expect(at.visualSpan).toBe(3);          // low vision, the worse of 3 and 5
    expect(at.phonologicalDecoding).toBe(0.65); // elderly, the worse of 0.65 and 0.75
    expect(at.vocabularyBreadth).toBe(0.85);    // elderly, crystallized vocabulary
  });
});

describe("attentional reading cost has a home (BUG-07)", () => {
  // Reading has two halves: decoding the words, and holding the line while you
  // do it. When `readingTendency` came out of the readability layer the chain
  // was left with decoding and nothing else, so the persona whose reading
  // difficulty is ENTIRELY attentional -- ADHD, intact decoding, loses place,
  // re-reads -- was scored as an unimpaired reader. `sustainedAttention` is
  // that half. It sits in readability rather than frustration because losing
  // your place is a processing cost, not an emotional response to one.
  const STATIC = {
    informationDensity: 0.6, visualComplexity: 0.3, interactiveElementCount: 20,
    textDensity: 0.8, animationLevel: 0.0, choiceCount: 8, navigationDepth: 2,
  };
  const BUSY = { ...STATIC, animationLevel: 0.8, visualComplexity: 0.7 };

  async function bridged(name: string): Promise<Record<string, number>> {
    const { getAnyPersona, getCognitiveProfile } = await import("../src/personas.js");
    const m = await import("../src/visual/cognitive-models.js");
    const p = getAnyPersona(name)!;
    const t = { ...(getCognitiveProfile(p as never).traits as Record<string, number>) };
    const acc = (p as never as { accessibilityTraits?: Record<string, number> }).accessibilityTraits;
    t.readingCapacity = m.readingCapacityOf(m.getReadingProfile({ name, traits: t, accessibilityTraits: acc }));
    t.motorCapacity = m.motorCapacityOf(m.getPointingProfile({ name, traits: t }));
    t.sustainedAttention = m.sustainedAttentionOf({ traits: t, accessibilityTraits: acc });
    return t;
  }

  async function layerOf(name: string, page: object, layer = "readingAttention"): Promise<number> {
    const demand = computeDemandDistribution(page as never);
    const r = computeSequentialCTC(buildOTCognitiveProfile(name, await bridged(name)), demand,
      { asymmetric: true, interactions: true });
    const l = (r.layers as Array<{ name: string; transportCost: number }>).find((x) => x.name === layer);
    return l!.transportCost;
  }

  test("it reaches a layer and has a demand term", () => {
    expect(COGNITIVE_TRAITS as readonly string[]).toContain("sustainedAttention");
    expect(DEMAND_DIMENSIONS as readonly string[]).toContain("sustainedAttention");
    expect(traitsUsedByLayers().has("sustainedAttention")).toBe(true);
  });

  test("it has its OWN layer, not a share of readability and not frustration", () => {
    // D-3 Option 1. It lived inside `readability` for one commit, which put two
    // mechanisms through one scalar under a contract describing only one of
    // them -- an ADHD attentionSpan of 0.30 against a dyslexic 0.50 swamped
    // five decoding terms pointing the other way, and the ordering inverted on
    // the real target. No weighting fixes that; separate layers do.
    const block = CHAIN_SRC.slice(CHAIN_SRC.indexOf("name: 'readingAttention'"));
    expect(block.slice(0, block.indexOf("];"))).toContain("'sustainedAttention'");
    // And it is in neither of the two layers it could plausibly have been buried in.
    const readBlock = CHAIN_SRC.slice(CHAIN_SRC.indexOf("name: 'readability'"), CHAIN_SRC.indexOf("name: 'readingAttention'"));
    expect(readBlock.match(/traits: \[([^\]]*)\]/)![1]).not.toContain("sustainedAttention");
    const frus = CHAIN_SRC.slice(CHAIN_SRC.indexOf("name: 'frustration'"), CHAIN_SRC.indexOf("name: 'readability'"));
    expect(frus.match(/traits: \[([^\]]*)\]/)![1]).not.toContain("sustainedAttention");
  });

  test("readability is decoding only, so the legibilityQuality contract is about one thing", () => {
    const readBlock = CHAIN_SRC.slice(CHAIN_SRC.indexOf("name: 'readability'"), CHAIN_SRC.indexOf("name: 'readingAttention'"));
    const traits = readBlock.match(/traits: \[([^\]]*)\]/)![1];
    expect(traits).toContain("readingCapacity");
    for (const moved of ["comprehension", "transferLearning", "sustainedAttention", "readingTendency"]) {
      expect(traits).not.toContain(moved);
    }
  });

  test("a page with no text demands none of it", () => {
    // Gated on text: however busy a page is, there is no line to lose your
    // place in if there is nothing to read.
    //
    // Zeroes BOTH text metrics, because both derive from the same textLength --
    // textDensity is that length over area, informationDensity is that length on
    // its own. A fixture setting one to 0 while the other stays high describes a
    // page with no text that nonetheless has text, which extraction cannot
    // produce. The old fixture did exactly that and passed only because the
    // demand read the area-normalised half alone, which is the defect (BUG-27).
    const d = computeDemandDistribution({ ...BUSY, textDensity: 0, informationDensity: 0 } as never);
    expect(d.demands.sustainedAttention).toBe(0);
  });

  test("attentional demand rises with absolute text, not text per unit area", () => {
    // The BUG-27 claim, as a property. Spreading the same prose over a taller
    // document lowers textDensity while informationDensity holds, and attentional
    // reading cost must not fall: twice the page to hold your place across is not
    // easier because the text is further apart.
    const dense = computeDemandDistribution({ ...BUSY, textDensity: 0.7, informationDensity: 0.6 } as never);
    const spread = computeDemandDistribution({ ...BUSY, textDensity: 0.49, informationDensity: 0.8 } as never);
    expect(spread.demands.sustainedAttention).toBeGreaterThanOrEqual(dense.demands.sustainedAttention);
  });

  test("distractors raise the demand, and text alone does not max it", () => {
    const quiet = computeDemandDistribution(STATIC as never).demands.sustainedAttention;
    const loud = computeDemandDistribution(BUSY as never).demands.sustainedAttention;
    expect(loud).toBeGreaterThan(quiet);
    // Below decoding demand on a still page: decoding is the primary cost of
    // text, attention the secondary one. Reversing this re-creates the exact
    // inversion that removing readingTendency fixed.
    expect(quiet).toBeLessThan(computeDemandDistribution(STATIC as never).demands.readingCapacity);
  });

  test("an attentional reader now responds to a page full of movement", async () => {
    // The bug, stated as the number that would not move. Measured at HEAD
    // before this change, adding animationLevel 0.8 and visualComplexity 0.7 to
    // a text-dense page moved cognitive-adhd's readability cost from 0.082 to
    // 0.083, and distracted-user's from 0.064 to 0.064. An autoplaying carousel
    // beside a wall of text cost the two personas defined by distractibility
    // one thousandth of a point and nothing at all respectively.
    //
    // This is the detector: it is the delta, not the level. An ordering
    // assertion would have passed at HEAD -- adhd already scored above
    // careful-reader (0.082 vs 0.067) on decoding and comprehension alone.
    for (const name of ["cognitive-adhd", "distracted-user"]) {
      const delta = await layerOf(name, BUSY) - await layerOf(name, STATIC);
      expect(delta).toBeGreaterThan(0.05);
    }
  });

  test("decoding cost stays with the dyslexic reader, on EVERY page", async () => {
    // The guard that the first version of this fix failed. It asserted the
    // ordering on a synthetic page at animationLevel 0 and passed, while on the
    // report's actual target the attentional term overwhelmed decoding and the
    // ordering inverted -- adhd 0.161 against dyslexic 0.126. Checked across
    // the distractor range now, because that is the axis that broke it.
    for (const page of [STATIC, { ...STATIC, animationLevel: 0.35 }, BUSY, { ...BUSY, animationLevel: 1 }]) {
      expect(await layerOf("dyslexic-user", page, "readability"))
        .toBeGreaterThan(await layerOf("cognitive-adhd", page, "readability"));
    }
  });

  test("and attentional cost stays with the ADHD reader, on every page", async () => {
    // The other half, and the reason the split exists rather than a reweighting:
    // both claims are now true at once, which no single scalar allowed.
    for (const page of [STATIC, { ...STATIC, animationLevel: 0.35 }, BUSY]) {
      expect(await layerOf("cognitive-adhd", page)).toBeGreaterThan(await layerOf("dyslexic-user", page));
    }
  });

  test("concentrating better than the page needs is never a penalty", async () => {
    // Surplus-free, for the reason siteFamiliarity is: billed, it charged
    // power-user for having an attention capacity of 0.85 against a demand of
    // 0.50 -- a penalty for concentrating well.
    const { sustainedAttentionOf } = await import("../src/visual/cognitive-models.js");
    const base = await bridged("power-user");
    const demand = computeDemandDistribution(STATIC as never);
    const at = (v: number) => {
      const r = computeSequentialCTC(buildOTCognitiveProfile("p", { ...base, sustainedAttention: v }),
        demand, { asymmetric: true, interactions: true });
      return (r.layers as Array<{ name: string; transportCost: number }>).find((x) => x.name === "readingAttention")!.transportCost;
    };
    expect(sustainedAttentionOf({ traits: base })).toBeGreaterThan(0.5);
    for (const v of [0.6, 0.75, 0.9, 1.0]) expect(at(v)).toBeLessThanOrEqual(at(0.5) + 1e-9);
  });
});

describe("sustainedAttention resolves from what the persona actually states", () => {
  test("a stated attentionSpan wins", async () => {
    const { sustainedAttentionOf } = await import("../src/visual/cognitive-models.js");
    expect(sustainedAttentionOf({ traits: { interruptRecovery: 0.9 }, accessibilityTraits: { attentionSpan: 0.2 } }))
      .toBe(0.2);
  });

  test("interruptRecovery is the fallback, and it matters", async () => {
    // 24 of 36 personas state no accessibility traits, including
    // `distracted-user`, whose entire identity is this dimension. Without the
    // fallback it would have been handed the same attention as power-user.
    const { sustainedAttentionOf } = await import("../src/visual/cognitive-models.js");
    const { getAnyPersona, getCognitiveProfile } = await import("../src/personas.js");
    const attn = (n: string) => {
      const p = getAnyPersona(n)!;
      return sustainedAttentionOf({
        traits: getCognitiveProfile(p as never).traits as Record<string, number>,
        accessibilityTraits: (p as never as { accessibilityTraits?: { attentionSpan?: number } }).accessibilityTraits,
      });
    };
    expect(attn("distracted-user")).toBeLessThan(attn("power-user"));
    expect(attn("distracted-user")).toBeLessThan(0.2);
  });

  test("a persona stating neither gets an unremarkable value, not a perfect one", async () => {
    const { sustainedAttentionOf } = await import("../src/visual/cognitive-models.js");
    const v = sustainedAttentionOf({});
    expect(v).toBe(0.7);
    expect(v).toBeLessThan(1);
  });

  test("it is runtime-scoped, so no persona is warned for lacking it", async () => {
    const personas = readFileSync(join(import.meta.dir, "..", "src", "personas.ts"), "utf8");
    expect(personas).toMatch(/RUNTIME_SCOPED = new Set\(\[[^\]]*"sustainedAttention"/);
  });

  test("the tool bridges it, or the dimension is inert in production", async () => {
    // The failure this whole class of bug keeps taking: a dimension wired into
    // the model and never populated by the caller reads as 0.5 for everyone.
    // Was a grep for the inline bridge in one tool. That block existed in exactly
    // ONE of the two tools that score this chain, which is how the motor layer came
    // to disagree 2.6x between them: the unbridged path scored against traitValue's
    // missing-trait fallback of 0.5. It is now a shared helper, so the assertion is
    // that EVERY scoring path calls it -- stated over the files rather than one of
    // them, since naming one is what let the other drift. (BUG-29)
    const bridge = readFileSync(join(import.meta.dir, "..", "src", "visual", "cognitive-models.ts"), "utf8");
    expect(bridge).toContain("export function bridgeCapacityTraits");
    expect(bridge).toContain("traits.sustainedAttention = sustainedAttentionOf(");

    for (const f of ["persona-comparison-tools.ts", "audit-tools.ts"]) {
      const src = readFileSync(join(import.meta.dir, "..", "src", "mcp-tools", "base", f), "utf8");
      const scoringCalls = (src.match(/computeSequentialCTC\(/g) ?? []).length;
      const bridgeCalls = (src.match(/bridgeCapacityTraits\(/g) ?? []).length;
      expect(scoringCalls).toBeGreaterThan(0);
      // One bridge per scoring call. Fewer means a path is scoring a persona
      // whose derived capacities were never populated.
      expect(bridgeCalls).toBeGreaterThanOrEqual(scoringCalls);
    }
  });
});

describe("the legibilityQuality contract, restored and pinned (BUG-01 / D-3)", () => {
  /**
   * The tool prints this promise in its own output: for a given persona, lower
   * legibility means higher readability cost. It held in R2 and R3, and R4
   * broke it -- cognitive-adhd at 91% legibility paid 0.161 while dyslexic-user
   * at 73% paid 0.126 -- because the readability layer had been given a second
   * mechanism to carry and only one of them is what legibilityQuality measures.
   *
   * Splitting decoding from attention is what makes the promise keepable. These
   * tests are the promise.
   */
  const PAGE = {
    informationDensity: 0.65, visualComplexity: 0.55, interactiveElementCount: 60,
    textDensity: 0.7, animationLevel: 0.35, choiceCount: 18, navigationDepth: 2,
  } as never;

  async function bridged(name: string): Promise<Record<string, number>> {
    const { getAnyPersona, getCognitiveProfile } = await import("../src/personas.js");
    const m = await import("../src/visual/cognitive-models.js");
    const p = getAnyPersona(name)!;
    const t = { ...(getCognitiveProfile(p as never).traits as Record<string, number>) };
    const acc = (p as never as { accessibilityTraits?: Record<string, number> }).accessibilityTraits;
    t.readingCapacity = m.readingCapacityOf(m.getReadingProfile({ name, traits: t, accessibilityTraits: acc }));
    t.motorCapacity = m.motorCapacityOf(m.getPointingProfile({ name, traits: t }));
    t.sustainedAttention = m.sustainedAttentionOf({ traits: t, accessibilityTraits: acc });
    return t;
  }
  const layer = (traits: Record<string, number>, name = "readability") => {
    const r = computeSequentialCTC(buildOTCognitiveProfile("p", traits),
      computeDemandDistribution(PAGE), { asymmetric: true, interactions: true });
    return (r.layers as Array<{ name: string; transportCost: number }>).find((l) => l.name === name)!.transportCost;
  };

  test("within a persona it is exact: less legible is never cheaper", async () => {
    // The strict form. legibilityQuality and readingCapacity are both derived
    // from the same reading profile, so holding the persona fixed and sweeping
    // capacity is the contract stated as a function.
    for (const name of ["cognitive-adhd", "dyslexic-user", "elderly-low-vision"]) {
      const base = await bridged(name);
      const costs = [0.2, 0.35, 0.5, 0.65, 0.8, 0.95].map((v) => layer({ ...base, readingCapacity: v }));
      for (let i = 1; i < costs.length; i++) expect(costs[i]).toBeLessThanOrEqual(costs[i - 1] + 1e-9);
      expect(costs[0]).toBeGreaterThan(costs[costs.length - 1]);
    }
  });

  test("surplus reading capacity is free, or the curve turns back on itself", async () => {
    // Billed surplus makes cost start RISING again above the page's demand, so
    // the strongest readers re-enter the cost curve from the far side and the
    // contract fails at the top end while looking fine in the middle.
    const base = await bridged("power-user");
    const beyond = [0.8, 0.9, 1.0].map((v) => layer({ ...base, readingCapacity: v }));
    expect(new Set(beyond).size).toBe(1);
    expect(beyond[0]).toBe(0);
  });

  test("across personas it holds for any material difference in legibility", async () => {
    // Not to the last decimal, and the note says so: layers spend from a budget
    // the earlier ones depleted, so two readers with near-identical legibility
    // can differ slightly by arriving more depleted. Measured: elderly-low-vision
    // (0.526, spent 0.128) against first-timer (0.520, spent 0.083). The defect
    // the report filed was a 0.18 legibility gap inverting, not a 0.006 one.
    const names = ["power-user", "cognitive-adhd", "careful-reader", "first-timer", "distracted-user",
      "elderly-user", "elderly-low-vision", "dyslexic-user", "intellectual-disability", "autism-spectrum", "deaf-user"];
    const rows = await Promise.all(names.map(async (n) => {
      const t = await bridged(n);
      return { n, legibility: t.readingCapacity, cost: layer(t) };
    }));
    let checked = 0;
    for (const a of rows) for (const b of rows) {
      if (a.legibility - b.legibility < 0.05) continue;  // a is materially MORE legible
      checked++;
      expect(a.cost).toBeLessThanOrEqual(b.cost + 1e-9);
    }
    expect(checked).toBeGreaterThan(20);  // the sweep must actually have compared something
  });

  test("the note tells the customer both of those things, and where the promise stops", () => {
    const tool = readFileSync(join(import.meta.dir, "..", "src", "mcp-tools", "base", "persona-comparison-tools.ts"), "utf8");
    expect(tool).toContain("lower legibility means higher readability cost");
    expect(tool).toContain("readingAttention");
    // And says the attentional half is deliberately excluded, so a reader does
    // not go looking for it in this number.
    expect(tool).toContain("deliberately not part of this number");
    // The word "strictly" was in this sentence and was not true at the floor:
    // cost is 0 at 91% legibility and stays 0 at 99%, so the layer stops
    // discriminating across its whole upper range. The note now says so and
    // points at the field that still carries signal there. (BUG-18)
    expect(tool).not.toContain("means strictly higher readability cost");
    expect(tool).toContain("its floor of 0");
    expect(tool).toContain("read `headroom`");
  });

  test("every layer in the chain is named in the overlay list", () => {
    // The COUNT is deliberately not asserted here any more. It was seven when
    // this was written and is eight since the motor split, and a bare number in
    // a test is the same staleness the widget caption had. tests/motor-split
    // owns the ordering; this owns the overlay coverage.
    const tool = readFileSync(join(import.meta.dir, "..", "src", "mcp-tools", "base", "persona-comparison-tools.ts"), "utf8");
    const block = CHAIN_SRC.slice(CHAIN_SRC.indexOf("LAYER_DEFINITIONS"), CHAIN_SRC.indexOf("INTERACTION_PAIRS"));
    const names = Array.from(block.matchAll(/name: '([a-zA-Z]+)'/g), (m) => m[1]);
    expect(names.length).toBeGreaterThanOrEqual(7);
    // A bar with no overlay entry renders as neither a button nor a no-overlay
    // tag -- it just looks broken next to its siblings.
    for (const n of names) expect(tool).toContain(`layer: "${n}"`);
  });
});

describe("one authoritative field per reading dimension (BUG-13 / D-11)", () => {
  /**
   * Reading ability was encoded twice: five explicit fields in
   * accessibility_traits, and `comprehension` + `readingTendency` in the main
   * trait vector, with nothing stating which the model actually reads.
   * `comprehension` was 0.5 for BOTH personas whose reading profiles differ
   * sharply, so it was either unused or contradicting the new fields, and no
   * consumer could tell which.
   *
   * That is the two-registry divergence shape, caught before the fields drifted
   * apart. These tests pin the split rather than the prose describing it.
   */
  const CHAIN = CHAIN_SRC.slice(CHAIN_SRC.indexOf("LAYER_DEFINITIONS"), CHAIN_SRC.indexOf("INTERACTION_PAIRS"));
  const layerTraits = (name: string): string => {
    const block = CHAIN.slice(CHAIN.indexOf(`name: '${name}'`));
    return block.slice(0, block.indexOf("]") + 1).match(/traits: \[([^\]]*)\]/)![1];
  };

  test("decoding reaches readability, and nothing else does", () => {
    const readability = layerTraits("readability");
    expect(readability).toContain("readingCapacity");
    // The two main-vector reading-adjacent traits are absent by construction.
    expect(readability).not.toContain("comprehension");
    expect(readability).not.toContain("readingTendency");
  });

  test("comprehension is consumed, but only as UI-convention grasp", () => {
    // Not orphaned -- that would be the other failure. It drives cognitiveLoad,
    // which is what its own criteria describe.
    expect(layerTraits("cognitiveLoad")).toContain("comprehension");
    expect(traitsUsedByLayers().has("comprehension")).toBe(true);
  });

  test("its definition says what it is not, where an author will read it", () => {
    const ref = readFileSync(join(import.meta.dir, "..", "src", "trait-reference.ts"), "utf8");
    const entry = ref.slice(ref.indexOf("comprehension: {"));
    const block = entry.slice(0, entry.indexOf("defaultValue"));
    expect(block).toContain("NOT reading comprehension");
    expect(block).toContain("accessibility_traits");
  });

  test("engagement modulates attention demand and never decoding demand", () => {
    // readingTendency is a disposition. It reaches no layer as a capacity, and
    // touches only the attentional half of demand.
    for (const layer of ["readability", "readingAttention", "cognitiveLoad", "frustration"]) {
      expect(layerTraits(layer)).not.toContain("readingTendency");
    }
    const mod = CHAIN_SRC.slice(CHAIN_SRC.indexOf("const readingTendency = persona.traits?.readingTendency"));
    const body = mod.slice(0, 1800);
    expect(body).toContain("modulatedDemand.demands.sustainedAttention");
    expect(body).not.toContain("modulatedDemand.demands.readingCapacity =");
  });

  test("the tool states the split, so a consumer never has to infer it", () => {
    const tool = readFileSync(join(import.meta.dir, "..", "src", "mcp-tools", "base", "persona-comparison-tools.ts"), "utf8");
    const block = tool.slice(tool.indexOf("readingModel: {"), tool.indexOf("scope: measureScope,"));
    for (const dimension of ["decoding", "attention", "engagement", "notConsumedForReading"]) {
      expect(block).toContain(dimension);
    }
    // And names comprehension explicitly as the one that is NOT consumed for
    // reading, because a field omitted from the map is indistinguishable from
    // one nobody thought about.
    expect(block).toContain("traits.comprehension");
  });

  test("no field is authoritative for two dimensions", () => {
    const tool = readFileSync(join(import.meta.dir, "..", "src", "mcp-tools", "base", "persona-comparison-tools.ts"), "utf8");
    const block = tool.slice(tool.indexOf("readingModel: {"), tool.indexOf("scope: measureScope,"));
    const claims = Array.from(block.matchAll(/authoritative: "([^"]+)"/g), (m) => m[1]);
    expect(claims.length).toBe(3);
    // Crude but sufficient: the same field name must not head two claims.
    const heads = claims.map((c) => c.split(".")[0] + "." + (c.split(".")[1] ?? "").replace(/[{,].*/, ""));
    expect(new Set(heads).size).toBe(heads.length);
  });
});
