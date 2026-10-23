/**
 * The journey times pointing with Stage B's published laws and the element's
 * measured geometry.
 *
 * Before 21.0 the journey charged every click and hover a Fitts' law time from
 * its own hand-set constants (50 ms + 150 ms per bit) for a 300 px move to an
 * 80 px target, whatever the element was, and its keystroke model carried its
 * own copy of KLM's mental operator. Now:
 *   - the law is Stage B's (law.fitts.intercept, law.fitts.slope, the Shannon
 *     index with law.fitts.minWidth as the width floor), in milliseconds;
 *   - the move is from the screen's centre (Stage B's pointer start) to the
 *     centre of the element the action names, found in the journey's own list
 *     of clickables, and the width is the smaller of its width and height
 *     (SMALLER-OF), as Stage B measures pointing;
 *   - an action whose element is not in that list falls back to
 *     journey.fitts.unlocatedDistancePx and .unlocatedTargetWidthPx, both
 *     hypotheses; scrolls, typed URLs and the other actions move no pointer
 *     and are charged no pointing time;
 *   - the mental operator is law.klm.mentalPreparation.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-journey-fitts-data-"));
process.env.CBROWSER_ARTIFACT_DIR = mkdtempSync(join(tmpdir(), "cb-journey-fitts-art-"));
delete process.env.ANTHROPIC_API_KEY;

const { MODEL_PROVENANCE, startProvenanceRecording, stopProvenanceRecording } = await import("../src/visual/model-provenance.js");
const T = await import("../src/types.js");
const { runScenario, WORLD } = await import("./fixtures/journey-scenarios.js");
const { VIEWPORT } = await import("./fixtures/journey-world.js");

const v = (id: string) => MODEL_PROVENANCE[id]?.value;
const MS = 1000;
const U = (p: string) => `https://acme.example${p}`;

// power-user: age range 25-45 (no age slowdown), mouse jitter 2 (tremor 0.2).
const AGE = 1.0;
const TREMOR = 2 / v("journey.fitts.jitterScale");
const motor = (distance: number, width: number) =>
  (v("law.fitts.intercept") * MS + v("law.fitts.slope") * MS * Math.log2(distance / Math.max(width, v("law.fitts.minWidth")) + 1)) * AGE * (1 + TREMOR * v("journey.fitts.tremorGain"));

async function hoverDelays(action: string) {
  startProvenanceRecording();
  try {
    const r = await runScenario({
      name: "fitts-probe",
      options: { persona: "power-user", goal: "Look at the menu", startUrl: U("/"), temporalContext: { now: "2026-10-21T10:00:00Z", timezone: "UTC" }, maxSteps: 1 },
      steps: [{ phase: "decide", monologue: "hover", action }],
    });
    return { delays: r.delays, gaze: (r.result as { finalState: { gazeMouseLag: number } }).finalState.gazeMouseLag };
  } finally {
    stopProvenanceRecording();
  }
}

describe("journey pointing time", () => {
  test("the journey's own Fitts and mental-operator constants are gone; Stage B's are the ones read", () => {
    for (const id of ["journey.fitts.intercept", "journey.fitts.slope", "journey.klm.mentalPreparation", "journey.fitts.distancePx", "journey.fitts.targetWidthPx"]) {
      expect(MODEL_PROVENANCE[id]).toBeUndefined();
    }
    startProvenanceRecording();
    const a = T.DEFAULT_FITTS_PARAMS.a;
    const b = T.DEFAULT_FITTS_PARAMS.b;
    const m = T.KLM_OPERATORS.M_mental;
    const read = stopProvenanceRecording();
    expect(a).toBe(v("law.fitts.intercept") * MS);
    expect(b).toBe(v("law.fitts.slope") * MS);
    expect(m).toBe(v("law.klm.mentalPreparation") * MS);
    expect([...read].sort()).toEqual(["journey.msPerSecond", "law.fitts.intercept", "law.fitts.slope", "law.klm.mentalPreparation"]);
  });

  test("calculateFittsMovementTime is the published law in milliseconds, with the law's width floor", () => {
    for (const [d, w] of [[365, 30], [300, 80], [50, 0.5], [1200, 20]]) {
      expect(T.calculateFittsMovementTime(d, w)).toBe((v("law.fitts.intercept") * MS + v("law.fitts.slope") * MS * Math.log2(d / Math.max(w, v("law.fitts.minWidth")) + 1)));
    }
  });

  test("a hover on a listed element waits the law's time for its measured distance and size, plus the gaze lag", async () => {
    // The Pricing link: 80 x 30 at (600, 20), so its centre is at (640, 35),
    // 365 px straight up from the centre of the 1280 x 800 screen.
    const box = WORLD[U("/")].elements.find((e: { selector: string }) => e.selector === "#nav-pricing")!;
    const distance = Math.hypot(box.x + box.width / 2 - VIEWPORT.width / 2, box.y + box.height / 2 - VIEWPORT.height / 2);
    expect(distance).toBe(365);
    const { delays, gaze } = await hoverDelays("hover:Pricing");
    expect(delays).toContain(motor(distance, Math.min(box.width, box.height)) + gaze);
  });

  test("a hover on an element the journey cannot find waits the law's time for the registered fallback move", async () => {
    const { delays, gaze } = await hoverDelays("hover:No such menu");
    expect(delays).toContain(motor(v("journey.fitts.unlocatedDistancePx"), v("journey.fitts.unlocatedTargetWidthPx")) + gaze);
  });
});
