/**
 * The chain's registry and its code cannot drift from each other.
 *
 * The golden matrix (every persona, every demand, every option set, the
 * scroll inputs) is run under provenance recording. Every id the chain
 * reads must be registered (param() throws otherwise, so the run itself
 * proves that), and every CHAIN_PROVENANCE id must have been read at least
 * once, so a constant cannot sit in the registry describing a number the
 * code no longer uses. Each entry carries a status from the four and a
 * non-empty source, and since nothing in this chain is fitted or published
 * today, no entry may claim to be.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { CHAIN_PROVENANCE } from "../src/visual/provenance/chain.js";
import { MODEL_PROVENANCE, param, startProvenanceRecording, stopProvenanceRecording, withProvenance } from "../src/visual/model-provenance.js";
import { buildGoldenMatrix } from "./fixtures/ctc-golden-matrix.js";

const STATUSES = ["fitted", "published", "definition", "hypothesis"];

startProvenanceRecording();
buildGoldenMatrix();
const read = stopProvenanceRecording();
const chainReads = [...read].filter((id) => id.startsWith("chain."));
const registered = new Set(CHAIN_PROVENANCE.map((e) => e.id));

describe("chain provenance registry", () => {
  test("the registry is non-trivial and every id is unique and chain-prefixed", () => {
    expect(CHAIN_PROVENANCE.length).toBeGreaterThan(100);
    expect(registered.size).toBe(CHAIN_PROVENANCE.length);
    for (const e of CHAIN_PROVENANCE) expect(e.id.startsWith("chain.")).toBe(true);
  });

  test("every entry has one of the four statuses and a non-empty source", () => {
    for (const e of CHAIN_PROVENANCE) {
      expect(STATUSES).toContain(e.status);
      expect(typeof e.source).toBe("string");
      expect(e.source.trim().length).toBeGreaterThan(20);
      expect(Number.isFinite(e.value)).toBe(true);
    }
  });

  test("nothing in the chain claims to be fitted or published; hypotheses name what would test them", () => {
    const counts = { fitted: 0, published: 0, definition: 0, hypothesis: 0 };
    for (const e of CHAIN_PROVENANCE) {
      counts[e.status]++;
      if (e.status === "hypothesis") expect(e.source).toMatch(/would (fit|set|test|place|replace)/);
    }
    expect(counts.fitted).toBe(0);
    expect(counts.published).toBe(0);
    expect(counts.hypothesis).toBeGreaterThan(counts.definition);
  });

  test("every id the golden matrix reads is registered", () => {
    // param() throws on an unregistered id, so reaching here already proves
    // it for the ids the chain read; this asserts the recorded set agrees.
    const unregistered = chainReads.filter((id) => !registered.has(id));
    expect(unregistered).toEqual([]);
    expect(chainReads.length).toBeGreaterThan(100);
  });

  test("every registered id was read at least once (no dead entries)", () => {
    const dead = [...registered].filter((id) => !read.has(id));
    expect(dead).toEqual([]);
  });

  test("param() refuses an id the registry does not carry", () => {
    expect(() => param("chain.doesNotExist")).toThrow(/unregistered/);
    expect(MODEL_PROVENANCE["chain.depletionRate"]?.value).toBe(0.15);
  });

  test("withProvenance on one chain run reports hypothesis counts above zero", () => {
    const { provenance } = withProvenance(() => buildGoldenMatrix());
    expect(provenance.counts.hypothesis).toBeGreaterThan(100);
    expect(provenance.counts.definition).toBeGreaterThan(0);
    expect(provenance.counts.fitted).toBe(0);
    expect(provenance.counts.published).toBe(0);
    expect(provenance.hypotheses).toContain("chain.depletionRate");
  });
});
