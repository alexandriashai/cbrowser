/**
 * The effort view shows the percentile's 95% interval and the four law times
 * against the time budget (ISC-70).
 *
 * After the reference re-crawl (ref-v2) cognitive_effort's headline,
 * cognitiveTransportCost.total, is a percentile among 512 real pages and the
 * result carries totalCTCInterval, the 95% interval of that percentile across
 * bootstrap resamples of the reference. After Stage B it also carries
 * lawTimes: the seconds of work four published laws give for the page
 * (pointing, Fitts; choosing, novice visual search after Cockburn et al.;
 * reading, Brysbaert plus 0.13 s per visible menu label; procedure, the
 * keystroke-level model), each a demand against one time budget,
 * d = T / (T + budget). The view drew the percentile as a bare decimal
 * ("0.951 percentile vs real pages") and none of the law times.
 *
 * Payloads are built from the server's own functions (lawTimesReport,
 * ctcRank) and shaped as the tool shapes them: the rank computed on the
 * unrounded percentile, total and totalCTCInterval rounded to three places,
 * and rankFigures, the whole percents the rank sentence states. The view's
 * numbers are checked against that sentence. Recomputed from the rounded
 * total they could differ by a point: cbrowser.ai measured 0.8098, stated 80,
 * and shipped total 0.81, which reads 81.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMBOS, expectSound, startViewHost } from "./fixtures/view-render.js";

const priorDataDir = process.env.CBROWSER_DATA_DIR;
const dataDir = mkdtempSync(join(tmpdir(), "cb-effort-laws-"));
process.env.CBROWSER_DATA_DIR = dataDir;

const ui = await import("../src/mcp-tools/ui-resources.js");
const { lawTimesReport } = await import("../src/visual/law-times-report.js");
const { ctcRank } = await import("../src/visual/ctc-bands.js");
const { param } = await import("../src/visual/model-provenance.js");

const SHOTS = process.env.EFFORT_LAWS_SHOTS; // a directory, to look at the renders by eye
const LEVEL = Math.round(param("ctcReference.interval.level") * 100);
const METRICS = { pointingSeconds: 3.44, choosingSeconds: 6.08, readingSeconds: 38.2, procedureSeconds: 2.71, choosingSecondsExpert: 1.93 };
const LAYERS = ["visualComplexity", "cognitiveLoad", "decision", "motor", "motorProcedure", "frustration", "readability", "readingAttention"];

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * A cognitive_effort payload, shaped as the tool returns it, for one
 * (unrounded) percentile and interval. figures: false leaves out rankFigures,
 * as a payload from before 21.0 does.
 */
function payload(total: number, interval: [number, number] | null, opts: { familiarity?: number; laws?: boolean; figures?: boolean } = {}) {
  const rank = ctcRank({ totalCTC: total, rawCTC: 1.3, referenceScope: "viewport", ...(interval ? { totalCTCInterval: interval } : {}) });
  const end = total === 0 ? "cheapest" : total === 1 ? "costliest" : null;
  return {
    url: "https://example.test/", persona: "cognitive-adhd",
    interpretation: `For cognitive-adhd, the top of this page is ${rank.statement}. ${rank.bandSentence} Bottleneck: readingAttention.`,
    ...(opts.laws === false ? {} : { lawTimes: lawTimesReport(METRICS, opts.familiarity ?? 0) }),
    cognitiveTransportCost: { total: r3(total), ...(interval ? { totalCTCInterval: interval.map(r3) } : {}), band: rank.band, referenceScope: "viewport",
      rank: rank.sentence,
      ...(opts.figures === false ? {} : { rankFigures: { percent: rank.percent, interval: rank.interval, end } }),
      raw: 1.3, additive: 1.29, chainCoefficient: 1.008 },
    abandonmentRisk: "21%", bottleneck: "readingAttention",
    layers: LAYERS.map((name, i) => ({ name, cost: 0.02 * (i + 1), capacityConsumed: 0.02 })),
  };
}

/** N, L and H as the server's sentence states them. */
function serverNumbers(sentence: string) {
  const n = /costlier than (under 1|\d+)% of the real pages/i.exec(sentence);
  const iv = /(\d+)% interval (\d+)-(\d+)%/.exec(sentence);
  return { n: n ? n[1] : null, lo: iv ? iv[2] : null, hi: iv ? iv[3] : null, level: iv ? iv[1] : null };
}

let host: Awaited<ReturnType<typeof startViewHost>>;
beforeAll(async () => { host = await startViewHost(); });
afterAll(async () => {
  await host?.close();
  if (priorDataDir === undefined) delete process.env.CBROWSER_DATA_DIR; else process.env.CBROWSER_DATA_DIR = priorDataDir;
  rmSync(dataDir, { recursive: true, force: true });
});

const RANK_Q = [".rank .rankh", ".rank .rint", ".rank .rscale", ".rank .rband", ".rank .rpoint", ".facts .fact", ".facts .fact b", ".facts .fact .nw"];
const LAW_Q = [".laws li.law", ".laws .lname", ".laws .ldetail", ".laws .lsec", ".laws .ldemand", ".laws .ltag", ".laws .lfill", ".laws .lbudget", ".laws .lcap", ".laws .lalt"];

describe("the percentile and its 95% interval, in words and on a scale", () => {
  for (const { theme, width } of COMBOS)
    test(`${theme} at ${width}px`, async () => {
      const p = payload(0.6234, [0.5512, 0.6901]);
      const v = await host.render(ui.buildEffortTemplate(), p, theme, width,
        { ready: ".rank", query: [...RANK_Q, ...LAW_Q], ...(SHOTS ? { shot: join(SHOTS, `effort-laws-${theme}-${width}.png`) } : {}) });
      expectSound(v, theme);
      // The server's own numbers for these values: 62, interval 55-70.
      expect(serverNumbers(p.cognitiveTransportCost.rank)).toEqual({ n: "62", lo: "55", hi: "70", level: String(LEVEL) });
      expect(v.q[".rank .rankh"]).toEqual(["Costlier than 62% of the real pages we measured"]);
      expect(v.q[".rank .rint"][0]).toStartWith(`${LEVEL}% interval: 55% to 70% of the real pages.`);
      // The point and the interval sit where the (rounded) percentile puts them.
      expect(v.geom[".rank .rpoint"][0].left).toBeCloseTo(62.3, 2);
      expect(v.geom[".rank .rband"][0].left).toBeCloseTo(55.1, 2);
      expect(v.geom[".rank .rband"][0].width).toBeCloseTo(69.0 - 55.1, 2);
      expect(v.aria[".rank .rscale"][0]).toBe(`Costlier than 62% of the real pages we measured; ${LEVEL}% interval 55% to 70%`);
      // The hero says the rank in words, never as a bare decimal.
      expect(v.q[".facts .fact"]).toContain(`costlier than 62%of real pages, ${LEVEL}% interval 55-70%`);
      expect(v.q[".facts .fact"].some((f) => /^0\.\d+/.test(f))).toBe(false);
      // At any width the rank stays whole: its value on one line, and the
      // range never split at its hyphen ("55-" / "70%" at 393 px).
      const chip = v.q[".facts .fact b"].indexOf("costlier than 62%");
      expect(chip).toBeGreaterThanOrEqual(0);
      expect(v.box[".facts .fact b"][chip].height).toBeLessThan(v.box[".facts .fact b"][chip].lineHeight * 1.5);
      expect(v.q[".facts .fact .nw"]).toEqual(["55-70%"]);
    }, 60000);

  const CASES: Array<[number, [number, number]]> = [
    [0.6234, [0.5512, 0.6901]], [0.8098, [0.7886, 0.8324]], [0.004, [0.001, 0.012]], [0.0004, [0.0001, 0.0118]],
    [0.5, [0.5, 0.5]], [0.999, [0.991, 1]], [0.95, [0.9399999, 0.9700001]], [0.1, [0.0999999999, 0.1000000001]], [0.6995, [0.6904, 0.7096]],
  ];
  const viewNumbers = (v: { q: Record<string, string[]> }) => ({
    head: v.q[".rank .rankh"][0], int: v.q[".rank .rint"][0]?.split(".")[0] ?? null,
  });

  test("the view states the numbers of the server's sentence, which rounded decimals cannot always give", async () => {
    for (const [t, iv] of CASES) {
      const p = payload(t, iv);
      const s = serverNumbers(p.cognitiveTransportCost.rank);
      const v = await host.render(ui.buildEffortTemplate(), p, "light", 900, { ready: ".rank", query: RANK_Q });
      expect({ t, ...viewNumbers(v) }).toEqual({ t, head: `Costlier than ${s.n}% of the real pages we measured`,
        int: `${LEVEL}% interval: ${s.lo}% to ${s.hi}% of the real pages` });
    }
  }, 120000);

  test("the cbrowser.ai case: 0.8098 is stated 80 and ships as total 0.81; the view says 80", async () => {
    const p = payload(0.8098, [0.7886, 0.8324]);
    expect(p.cognitiveTransportCost.total).toBe(0.81);
    expect(serverNumbers(p.cognitiveTransportCost.rank).n).toBe("80");
    const v = await host.render(ui.buildEffortTemplate(), p, "dark", 393, { ready: ".rank", query: RANK_Q });
    expect(v.q[".rank .rankh"]).toEqual(["Costlier than 80% of the real pages we measured"]);
    expect(v.q[".facts .fact"]).toContain(`costlier than 80%of real pages, ${LEVEL}% interval 78-84%`);
  }, 60000);

  test("a payload without rankFigures is rounded as ctcRank rounds, from the decimals it has", async () => {
    for (const [t, iv] of CASES) {
      const p = payload(t, iv, { figures: false });
      const tc = p.cognitiveTransportCost as { total: number; totalCTCInterval: [number, number] };
      const s = serverNumbers(ctcRank({ totalCTC: tc.total, rawCTC: 1.3, referenceScope: "viewport", totalCTCInterval: tc.totalCTCInterval }).sentence);
      const v = await host.render(ui.buildEffortTemplate(), p, "light", 900, { ready: ".rank", query: RANK_Q });
      const want = s.n === null ? viewNumbers(v).head : `Costlier than ${s.n}% of the real pages we measured`;
      expect({ t, ...viewNumbers(v) }).toEqual({ t, head: want, int: s.lo === null ? null : `${LEVEL}% interval: ${s.lo}% to ${s.hi}% of the real pages` });
    }
  }, 120000);

  test("at either end the rank says so and states no interval, as the server's sentence does", async () => {
    for (const [t, head] of [[0, "At or below the cheapest real page we measured"], [1, "At least as costly as the costliest real page we measured"]] as const) {
      const p = payload(t, [t, t]);
      expect(serverNumbers(p.cognitiveTransportCost.rank).lo).toBeNull();
      const v = await host.render(ui.buildEffortTemplate(), p, "dark", 393, { ready: ".rank", query: RANK_Q });
      expect(v.q[".rank .rankh"]).toEqual([head]);
      expect(v.q[".rank .rint"]).toEqual([]);
      expect(v.q[".rank .rband"]).toEqual([]);
    }
  }, 60000);

  test("a result with no interval shows the rank alone", async () => {
    const v = await host.render(ui.buildEffortTemplate(), payload(0.6234, null), "light", 393, { ready: ".rank", query: RANK_Q });
    expect(v.q[".rank .rankh"]).toEqual(["Costlier than 62% of the real pages we measured"]);
    expect(v.q[".rank .rint"]).toEqual([]);
    expect(v.q[".rank .rband"]).toEqual([]);
    expect(v.q[".facts .fact"]).toContain("costlier than 62%of real pages");
  }, 60000);
});

describe("the four law times against the time budget", () => {
  const laws = lawTimesReport(METRICS, 0);
  const KEYS = ["pointing", "choosing", "reading", "procedure"] as const;

  for (const { theme, width } of COMBOS)
    test(`${theme} at ${width}px`, async () => {
      const v = await host.render(ui.buildEffortTemplate(), payload(0.6234, [0.5512, 0.6901]), theme, width, { ready: ".laws", query: LAW_Q });
      expectSound(v, theme);
      expect(v.q[".laws li.law"].length).toBe(4);
      // One row per law, in the chain's order, each naming its law.
      expect(v.q[".laws .lname"]).toEqual(["Pointing", "Choosing", "Reading", "Procedure"]);
      expect(v.q[".laws .ldetail"][0]).toContain("Fitts");
      expect(v.q[".laws .ldetail"][1]).toContain("novice visual search");
      expect(v.q[".laws .ldetail"][2]).toContain("Brysbaert");
      expect(v.q[".laws .ldetail"][2]).toContain("0.13 s");
      expect(v.q[".laws .ldetail"][3]).toContain("keystroke-level model");
      // Each law's seconds and its demand, as the payload states them.
      expect(v.q[".laws .lsec"]).toEqual(KEYS.map((k) => `${laws[k].seconds.toFixed(1)} s`));
      expect(v.q[".laws .ldemand"]).toEqual(KEYS.map((k) => `demand ${laws[k].demand.toFixed(2)}`));
      // The dominant law is named in text, once.
      expect(v.q[".laws .ltag"]).toEqual(["largest"]);
      expect(v.q[".laws li.law"].findIndex((r) => r.includes("largest"))).toBe(2);
      // The budget, and the rule that turns seconds into demand.
      expect(v.q[".laws .lcap"][0]).toContain(`${laws.budgetSeconds} s`);
      expect(v.q[".laws .lcap"][0]).toContain(`d = T / (T + ${laws.budgetSeconds} s)`);
      // Every bar and the budget mark on one ruler.
      const per = KEYS.map((k, i) => v.geom[".laws .lfill"][i].width! / laws[k].seconds);
      for (const r of per) expect(r).toBeCloseTo(per[0], 3);
      for (const m of v.geom[".laws .lbudget"]) expect(m.left! / laws.budgetSeconds).toBeCloseTo(per[0], 3);
      expect(v.geom[".laws .lbudget"].length).toBe(4);
      // No familiar run, no familiar line.
      expect(v.q[".laws .lalt"]).toEqual([]);
    }, 60000);

  test("a familiar visit's choosing time is shown beside the first visit's", async () => {
    const fam = lawTimesReport(METRICS, 0.6);
    const v = await host.render(ui.buildEffortTemplate(), payload(0.6234, [0.5512, 0.6901], { familiarity: 0.6 }), "dark", 900, { ready: ".laws", query: LAW_Q });
    expect(v.q[".laws .lalt"]).toEqual([`familiar visit (siteFamiliarity 0.6): ${fam.choosing.familiarSeconds!.toFixed(1)} s, demand ${fam.choosing.familiarDemand!.toFixed(2)}`]);
  }, 60000);

  test("a result without law times draws no law block", async () => {
    const v = await host.render(ui.buildEffortTemplate(), payload(0.6234, [0.5512, 0.6901], { laws: false }), "light", 900, { ready: ".rank", query: LAW_Q });
    expect(v.q[".laws li.law"]).toEqual([]);
  }, 60000);
});
