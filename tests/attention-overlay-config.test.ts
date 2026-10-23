/**
 * The in-page journey overlay paints with the attention model's own weights
 * (ISC-48.1).
 *
 * The live cognitive-journey heatmap is drawn inside the page by
 * ATTENTION_OVERLAY_SCRIPT (src/cognitive/index.ts) from a config built in
 * Node. That config was a hand-written mirror of attention-transport's tables,
 * "kept in sync by hand", and it had drifted: its navigation weight still read
 * siteFamiliarity, which attention-transport dropped on 2026-08-05 (navigation
 * is the registered constant attention.traitMod.navigation). A journey given
 * customTraits { siteFamiliarity: 0 } drew navigation at 1.0 in the overlay
 * and 0.7 in attention_analysis. The page script also kept its own fallback
 * weight (0.2), goal gain (2.0), keyword length and stop words.
 *
 * Now the config IS attention-transport's semanticWeightTable, and the page
 * script holds no weights of its own. The first block checks the config
 * against what attention-transport's semantic layer actually paints, for all
 * 25 human personas, without reaching into either side's internals. The second
 * runs the page script and reads the weights it painted.
 *
 * Not claimed: the overlay is still a simpler model than attention_analysis
 * (max per cell rather than coverage-weighted, max-normalised rather than p95,
 * no values layer, no perceptual filter, no gaze calibration, its own element
 * classifier). The weights agree; the maps are not expected to.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";
import { buildAttentionConfig, attentionOverlayInitScript } from "../src/cognitive/index.js";
import { buildSemanticMap } from "../src/visual/attention-transport.js";
import { param } from "../src/visual/model-provenance.js";
import {
  BUILTIN_PERSONAS, ACCESSIBILITY_PERSONAS, EMOTIONAL_PERSONAS, getCognitiveProfile,
} from "../src/personas.js";

const TYPES = ["cta", "heading", "form", "search", "image", "navigation", "link", "content", "decorative", "price", "error"];
const HUMAN = { ...BUILTIN_PERSONAS, ...ACCESSIBILITY_PERSONAS, ...EMOTIONAL_PERSONAS };
const traitsOf = (name: string) =>
  getCognitiveProfile(HUMAN[name] as never).traits as unknown as Record<string, number>;

/**
 * What attention-transport's semantic layer paints for one element of `type`,
 * as typeWeight x persona modifier.
 *
 * A large anchor of an unknown type, weighted 100 through the typeWeights seam,
 * sets the p95 normaliser to exactly 100, so the one-cell probe reads its own
 * weight / 100 with nothing clipped. The other type weights are the registered
 * constants, so this measures the shipped table through the shipped function.
 */
function painted(persona: string, traits: Record<string, number>, type: string): number {
  const cell = 16, cols = 50, rows = 30;
  const typeWeights: Record<string, number> = { "zz-anchor": 100 };
  for (const t of TYPES) typeWeights[t] = param(`attention.type.${t}`);
  const map = buildSemanticMap(
    [
      { type: "zz-anchor", x: 0, y: 0, width: cols * cell, height: 25 * cell },
      { type, x: 0, y: 26 * cell, width: cell, height: cell },
    ],
    rows, cols, cell, cols * cell, rows * cell, persona, undefined, traits, undefined, undefined, typeWeights,
  );
  return map[26 * cols] * 100;
}

const product = (cfg: ReturnType<typeof buildAttentionConfig>, type: string) =>
  (cfg.typeWeights[type] ?? cfg.typeFallback) * (cfg.personaMods[type] ?? 1);

describe("the overlay config carries attention-transport's weights", () => {
  test("for all 25 human personas, every element type weighs what the semantic layer paints", () => {
    expect(Object.keys(HUMAN).length).toBe(25);
    for (const name of Object.keys(HUMAN)) {
      const traits = traitsOf(name);
      const cfg = buildAttentionConfig(name, "", traits);
      for (const type of TYPES) {
        expect({ name, type, w: product(cfg, type) }).toEqual({ name, type, w: expect.closeTo(painted(name, traits, type), 9) });
      }
    }
  });

  test("site familiarity does not move the overlay's navigation weight, as it does not move the model's", () => {
    // runCognitiveJourney with customTraits fills siteFamiliarity (0.5 by
    // default, or the caller's value); the mirror read it, the model does not.
    for (const familiarity of [0, 0.5, 1]) {
      const traits = { ...traitsOf("first-timer"), siteFamiliarity: familiarity };
      const cfg = buildAttentionConfig("first-timer", "", traits);
      expect(product(cfg, "navigation")).toBeCloseTo(painted("first-timer", traits, "navigation"), 9);
      expect(cfg.personaMods.navigation).toBe(param("attention.traitMod.navigation"));
    }
  });

  test("the page receives the fallback weight and goal-relevance constants the model uses", () => {
    const cfg = buildAttentionConfig("first-timer", "Start a free trial", traitsOf("first-timer"));
    expect(cfg.typeFallback).toBe(param("attention.type.fallback"));
    expect(cfg.relevanceGain).toBe(param("attention.relevance.gain"));
    expect(cfg.minKeywordLength).toBe(param("attention.goal.minKeywordLength"));
    expect(cfg.stopWords).toContain("the");
    expect(cfg.goal).toBe("Start a free trial");
  });
});

// ── In the page ──────────────────────────────────────────────────────────────

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Overlay</title><style>
body{margin:0;font:16px sans-serif} .x{position:absolute;display:block;margin:0;padding:0;overflow:hidden}
</style></head><body>
<nav class="x" style="left:0;top:0;width:320px;height:48px"><a class="x" href="#docs" style="left:0;top:0;width:160px;height:48px">Docs</a></nav>
<h1 class="x" style="left:0;top:96px;width:320px;height:48px;font-size:20px">Choose a plan</h1>
<button class="x" style="left:0;top:192px;width:160px;height:48px">Continue</button>
<a class="x" href="#pricing" style="left:0;top:288px;width:160px;height:48px">See pricing</a>
<p class="x" style="left:0;top:384px;width:320px;height:48px">Every plan includes support.</p>
</body></html>`;
/** Element type -> a point inside it, as the page script classifies them. */
const PROBES: Record<string, [number, number]> = {
  navigation: [80, 24], heading: [160, 120], cta: [80, 216], link: [80, 312], content: [160, 408],
};

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
}, 60_000);

/**
 * Load the page with the overlay installed from `config` and read the weight at
 * each probe. A fresh page each time: the script installs once per window.
 */
async function paintedInPage(config: unknown): Promise<Record<string, number>> {
  const page: Page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  try {
    return await readPainted(page, config);
  } finally {
    await page.close();
  }
}

async function readPainted(page: Page, config: unknown): Promise<Record<string, number>> {
  await page.setContent(PAGE);
  await page.evaluate(attentionOverlayInitScript(config as never));
  await page.waitForFunction(() => {
    const read = (window as unknown as { __cbAttentionCells?: () => unknown }).__cbAttentionCells;
    return typeof read === "function" && read() !== null;
  }, undefined, { timeout: 10_000 });
  return page.evaluate((probes) => {
    const snap = (window as unknown as {
      __cbAttentionCells: () => { cols: number; cellSize: number; cells: number[] };
    }).__cbAttentionCells();
    const out: Record<string, number> = {};
    for (const [type, [x, y]] of Object.entries(probes)) {
      out[type] = snap.cells[Math.floor(y / snap.cellSize) * snap.cols + Math.floor(x / snap.cellSize)];
    }
    return out;
  }, PROBES);
}

describe("the page script paints with the config's weights and none of its own", () => {
  test("each element weighs typeWeight x persona modifier from the config", async () => {
    for (const name of ["first-timer", "impatient-user", "cognitive-adhd"]) {
      const cfg = buildAttentionConfig(name, "", traitsOf(name));
      const got = await paintedInPage(cfg);
      for (const type of Object.keys(PROBES)) {
        expect({ name, type, w: got[type] }).toEqual({ name, type, w: expect.closeTo(product(cfg, type), 6) });
      }
    }
  }, 60_000);

  test("a config with different constants is followed exactly (nothing hard-coded wins)", async () => {
    const got = await paintedInPage({
      typeWeights: { cta: 0.5, heading: 0.5, navigation: 0.5, link: 0.5 }, // no "content": the fallback applies
      personaMods: {},
      typeFallback: 0.33,
      relevanceGain: 5,
      minKeywordLength: 3,
      stopWords: ["see"],
      goal: "see pricing",
      persona: "zz-test",
    });
    expect(got.cta).toBeCloseTo(0.5, 6);
    expect(got.heading).toBeCloseTo(0.5, 6);
    expect(got.navigation).toBeCloseTo(0.5, 6);
    expect(got.content).toBeCloseTo(0.33, 6);
    // "see" is a stop word here, so the goal is the one word "pricing": a full
    // match boosts the link by 1 + 5.
    expect(got.link).toBeCloseTo(0.5 * 6, 6);
  }, 60_000);
});
