/**
 * The provenance recorder counts reads across awaits, and only its own.
 *
 * Through 21.0 the recorder was one module-level set. withProvenance swapped
 * it in, ran a synchronous function and swapped it back, so a tool could only
 * record the synchronous part of its answer: the page measurement, the
 * persona's values and the verdict all happen around awaits and were outside
 * the block. Recording across an await with module state would have been
 * worse than not recording at all: while one request waited on the browser,
 * another request's reads would have landed in its set.
 *
 * withProvenanceAsync keeps the recording in the async context instead
 * (AsyncLocalStorage), so:
 *   - a param() read after an await inside the wrapped function is recorded;
 *   - two recordings interleaved on one event loop see only their own reads;
 *   - a recording nested in another, sync or async, still lands in the outer
 *     one, exactly as withProvenance and readsOf always nested;
 *   - withProvenance itself is unchanged for synchronous functions.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import {
  activeProvenance,
  param,
  readsOf,
  startProvenanceRecording,
  stopProvenanceRecording,
  withProvenance,
  withProvenanceAsync,
} from "../src/visual/model-provenance.js";

// Registered ids of each status, so a summary's counts are checkable by hand.
const H1 = "chain.depletionRate"; // hypothesis
const H2 = "chain.weightDeficit"; // hypothesis
const H3 = "chain.weightSurplus"; // hypothesis
const D1 = "ctcReference.viewport"; // definition
const D2 = "ctcReference.full_page"; // definition

/** A turn of the event loop that is a real macrotask, not a resolved microtask. */
const tick = () => new Promise<void>((r) => setTimeout(r, 1));

/** A promise the test resolves by hand, to force an exact interleaving. */
function gate() {
  let open!: () => void;
  const p = new Promise<void>((r) => { open = r; });
  return { p, open };
}

const ids = (p: { counts: Record<string, number>; hypotheses: string[] }) => p.hypotheses.slice().sort();

describe("withProvenanceAsync records across awaits", () => {
  test("reads before, between and after awaits are all recorded", async () => {
    const { result, provenance } = await withProvenanceAsync(async () => {
      param(H1);
      await tick();
      param(H2);
      await Promise.resolve();
      await tick();
      param(D1);
      return 42;
    });
    expect(result).toBe(42);
    expect(ids(provenance)).toEqual([H1, H2].sort());
    expect(provenance.counts).toEqual({ fitted: 0, published: 0, definition: 1, hypothesis: 2 });
  });

  test("the synchronous recorder does not see reads after an await (why the async one exists)", async () => {
    // Characterises the limit of withProvenance rather than asserting a bug:
    // it records what runs before it returns, and an async function returns
    // at its first await.
    let late: Promise<void> | undefined;
    const { provenance } = withProvenance(() => {
      param(H1);
      late = (async () => { await tick(); param(H2); })();
    });
    await late;
    expect(ids(provenance)).toEqual([H1]);
  });

  test("two interleaved recordings get disjoint ids", async () => {
    // A reads, waits; B reads, waits; A resumes and reads; B resumes and
    // reads. With module-level state, A's set would be whichever recording
    // started last when A resumed.
    const aMayResume = gate();
    const bMayResume = gate();
    const aDone = withProvenanceAsync(async () => {
      param(H1);
      await aMayResume.p;
      param(D1);
      await tick();
      param(H3);
    });
    const bDone = withProvenanceAsync(async () => {
      param(H2);
      aMayResume.open();
      await bMayResume.p;
      param(D2);
    });
    await tick();
    bMayResume.open();
    const [a, b] = await Promise.all([aDone, bDone]);

    expect(ids(a.provenance)).toEqual([H1, H3].sort());
    expect(a.provenance.counts.definition).toBe(1);
    expect(ids(b.provenance)).toEqual([H2]);
    expect(b.provenance.counts.definition).toBe(1);
    const aIds = new Set([...a.provenance.hypotheses]);
    for (const id of b.provenance.hypotheses) expect(aIds.has(id)).toBe(false);
  });

  test("many concurrent recordings, each reading its own id after random waits, never mix", async () => {
    const own = [H1, H2, H3];
    const runs = Array.from({ length: 30 }, (_, i) => withProvenanceAsync(async () => {
      const id = own[i % own.length];
      for (let k = 0; k < 4; k++) {
        await new Promise((r) => setTimeout(r, (i * 7 + k * 3) % 5));
        param(id);
      }
      return id;
    }));
    for (const { result, provenance } of await Promise.all(runs)) {
      expect(provenance.hypotheses).toEqual([result]);
    }
  });

  test("a nested async recording lands in the outer one, and so do sync withProvenance and readsOf inside it", async () => {
    const { provenance: outer } = await withProvenanceAsync(async () => {
      param(H1);
      const inner = await withProvenanceAsync(async () => {
        await tick();
        param(H2);
      });
      expect(ids(inner.provenance)).toEqual([H2]);
      await tick();
      const sync = withProvenance(() => param(H3));
      expect(ids(sync.provenance)).toEqual([H3]);
      const { ids: r } = readsOf(() => param(D1));
      expect([...r]).toEqual([D1]);
    });
    expect(ids(outer)).toEqual([H1, H2, H3].sort());
    expect(outer.counts.definition).toBe(1);
  });

  test("an async recording inside a startProvenanceRecording session lands in it", async () => {
    const session = startProvenanceRecording();
    try {
      param(D2);
      await withProvenanceAsync(async () => { await tick(); param(H1); });
    } finally {
      stopProvenanceRecording();
    }
    expect([...session].sort()).toEqual([H1, D2].sort());
  });

  test("a recording that throws still restores, and its reads still reach the outer one", async () => {
    const { provenance } = await withProvenanceAsync(async () => {
      await expect(withProvenanceAsync(async () => {
        param(H2);
        await tick();
        throw new Error("boom");
      })).rejects.toThrow(/boom/);
      param(H1);
    });
    expect(ids(provenance)).toEqual([H1, H2].sort());
    // And nothing is left recording once it is all over.
    expect(activeProvenance()).toBeNull();
  });

  test("reads outside any recording are not carried into a later one", async () => {
    param(H3);
    await tick();
    const { provenance } = await withProvenanceAsync(async () => { param(H1); });
    expect(ids(provenance)).toEqual([H1]);
  });
});

describe("activeProvenance is the recording in force, read so far", () => {
  test("null outside a recording; inside, everything read so far in this context", async () => {
    expect(activeProvenance()).toBeNull();
    await withProvenanceAsync(async () => {
      param(H1);
      await tick();
      withProvenance(() => param(D1)); // nested and finished: already merged
      const now = activeProvenance()!;
      expect(now.hypotheses).toEqual([H1]);
      expect(now.counts.definition).toBe(1);
    });
  });

  test("it is per context: a concurrent recording does not see the other's reads", async () => {
    const seen: string[][] = [];
    const go = gate();
    await Promise.all([
      withProvenanceAsync(async () => { param(H1); await go.p; seen.push(activeProvenance()!.hypotheses); }),
      withProvenanceAsync(async () => { param(H2); go.open(); await tick(); seen.push(activeProvenance()!.hypotheses); }),
    ]);
    expect(seen.map((s) => s.join()).sort()).toEqual([H1, H2].sort());
  });
});

describe("withProvenance keeps its synchronous behaviour", () => {
  test("returns synchronously, nests into an outer session, and restores after a throw", () => {
    const session = startProvenanceRecording();
    try {
      const r = withProvenance(() => { param(H1); return "x"; });
      // Not a promise: callers destructure it on the same line.
      expect(r.result).toBe("x");
      expect(r.provenance.hypotheses).toEqual([H1]);
      expect(() => withProvenance(() => { param(H2); throw new Error("sync boom"); })).toThrow(/sync boom/);
      param(D1);
    } finally {
      stopProvenanceRecording();
    }
    expect([...session].sort()).toEqual([H1, H2, D1].sort());
    expect(activeProvenance()).toBeNull();
  });

  test("an unregistered id still throws inside an async recording", async () => {
    await expect(withProvenanceAsync(async () => { await tick(); param("chain.doesNotExist"); }))
      .rejects.toThrow(/unregistered/);
  });
});
