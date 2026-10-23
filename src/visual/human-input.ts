/**
 * Human input mechanics — wraps chromium's instant CDP-driven clicks and
 * keystrokes with realistic human timing and imperfection. The goal is that
 * a simulated journey, played back in any session-replay tool (FullStory,
 * LogRocket, Hotjar), is indistinguishable from a real user.
 *
 * What "realistic" means here:
 *   • Typing: Gaussian-spaced inter-key intervals + ~5% typo+correction rate
 *     + occasional "thinking" pauses + initial focus delay
 *   • Clicking: hover→dwell→click, with the click point off-center by a few
 *     pixels because humans don't aim perfectly
 *   • Scrolling: variable wheel deltas + occasional "glance back" (scroll up
 *     a hair then resume) which real readers do without thinking
 *   • Inter-action: a small "settle" pause after each action, modulated by
 *     persona traits (low patience → faster, high readingTendency → slower)
 *
 * All durations and probabilities are persona-trait-modulated so a "power
 * user" types twice as fast as an "elderly user" — the same way real
 * populations vary.
 */
import type { Page } from "playwright";
import { param } from "./model-provenance.js";

// Every duration, probability and distance below is registered, with where
// it comes from, in provenance/human-input.ts (humanInput.*) and read through
// param(). None is fitted or published.
const P = (id: string) => param(`humanInput.${id}`);

/**
 * Persona traits that drive input timing. Subset of CognitiveTraits — only
 * the ones that affect motor and reading behavior. All values are 0-1.
 */
export interface InputTraits {
  /** Procedural fluency — keyboard/mouse familiarity. 1 = fast, 0 = slow. */
  proceduralFluency?: number;
  /** Motor precision — aiming accuracy. 1 = bullseye, 0 = jittery. */
  motorPrecision?: number;
  /** Patience — willingness to wait. 1 = patient, 0 = impatient. */
  patience?: number;
  /** Reading tendency — time spent reading before acting. 1 = thorough, 0 = skim. */
  readingTendency?: number;
}

/** A trait the caller does not give: the journey's default, or for motor precision its own. */
const traits = (t?: InputTraits): Required<InputTraits> => ({
  proceduralFluency: t?.proceduralFluency ?? param("journey.defaultTrait"),
  motorPrecision: t?.motorPrecision ?? P("defaultMotorPrecision"),
  patience: t?.patience ?? param("journey.defaultTrait"),
  readingTendency: t?.readingTendency ?? param("journey.defaultTrait"),
});

// ─── Random helpers ─────────────────────────────────────────────────────────

/** Box-Muller sampler for Normal(mean, stddev). Truncated to [min, max]. */
function gauss(mean: number, std: number, min: number, max: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(min, Math.min(max, mean + z * std));
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, Math.max(0, ms)));

/** Uniform random in [min, max). */
const rand = (min: number, max: number) => min + Math.random() * (max - min);

// ─── Typing ─────────────────────────────────────────────────────────────────

// Adjacent-key map for realistic typos — neighboring keys on a QWERTY layout
// are far more likely typo sources than random characters.
const TYPO_NEIGHBORS: Record<string, string> = {
  q: "wa", w: "qes", e: "wrd", r: "etf", t: "ryg", y: "tuh", u: "yij", i: "uok", o: "ipl", p: "ol",
  a: "qsz", s: "awdz", d: "sefc", f: "drgv", g: "fthb", h: "gyjn", j: "hukm", k: "jiln", l: "kop",
  z: "axs", x: "zsdc", c: "xdfv", v: "cfgb", b: "vghn", n: "bhjm", m: "njk",
};

function typoFor(c: string): string {
  const lower = c.toLowerCase();
  const neighbors = TYPO_NEIGHBORS[lower];
  if (!neighbors) return c; // non-letter → no typo
  const pick = neighbors[Math.floor(Math.random() * neighbors.length)];
  return c === lower ? pick : pick.toUpperCase();
}

/**
 * Type into the focused element with realistic human cadence.
 *   • Gaussian inter-key intervals; high proceduralFluency → tighter, faster.
 *   • 5% typo rate per char — types the typo, pauses, backspaces, retypes.
 *   • Random "thinking" pauses (rare longer pauses).
 *   • Initial dwell before first key, modeling the user reading the label.
 */
export async function humanType(
  page: Page,
  text: string,
  inputTraits?: InputTraits,
): Promise<void> {
  const t = traits(inputTraits);
  // Faster procedural fluency → smaller mean and stddev: from the slowest
  // decile's mean inter-key interval at 0 to the fastest decile's at 1
  // (Dhakal et al. 2018, about 481 and 122 ms).
  const slow = P("type.slowIntervalMs");
  const meanInterval = slow - (slow - P("type.fastIntervalMs")) * t.proceduralFluency;
  const stdInterval = P("type.intervalSdMs") + P("type.intervalSdPerSlowness") * (1 - t.proceduralFluency);

  // Initial dwell — patient/thorough readers take longer to find the field
  await sleep(rand(P("type.focusMinMs"), P("type.focusMaxMs")) * (1 + t.readingTendency * P("type.focusReadingGain")));

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    // Occasional thinking pause (rare, longer)
    if (Math.random() < P("type.pauseRate")) {
      await sleep(rand(P("type.pauseMinMs"), P("type.pauseMaxMs")) * (1 + (1 - t.proceduralFluency) * P("type.pauseSlownessGain")));
    }

    // 5% typo+correction rate, only on letter chars
    if (/[a-zA-Z]/.test(ch) && Math.random() < P("type.typoRate")) {
      const wrong = typoFor(ch);
      await page.keyboard.type(wrong, { delay: 0 });
      await sleep(gauss(P("type.noticeMeanMs"), P("type.noticeSdMs"), P("type.noticeMinMs"), P("type.noticeMaxMs"))); // notice the typo
      await page.keyboard.press("Backspace");
      await sleep(gauss(meanInterval * P("type.correctionShare"), stdInterval * P("type.correctionShare"), P("type.minIntervalMs"), P("type.correctionMaxMs")));
    }

    // Type the actual char
    await page.keyboard.type(ch, { delay: 0 });
    await sleep(gauss(meanInterval, stdInterval, P("type.minIntervalMs"), P("type.maxIntervalMs")));
  }
}

// ─── Clicking ───────────────────────────────────────────────────────────────

/**
 * Click at (x, y) with human-realistic mechanics:
 *   • Move to a slightly off-center target (motor precision determines spread)
 *   • Hover-and-dwell briefly before pressing — humans pause before clicking
 *     to confirm aim
 *   • 2% mis-click rate: click slightly outside the bbox, register, then
 *     follow up with the corrected click
 *
 * Returns the actual coordinates clicked (post-jitter), so callers can record
 * the realistic position rather than the ideal center.
 */
export async function humanClick(
  page: Page,
  cx: number,
  cy: number,
  inputTraits?: InputTraits,
  bbox?: { width: number; height: number },
): Promise<{ x: number; y: number }> {
  const t = traits(inputTraits);

  // Aim spread — high motorPrecision = small spread (1-2px), low = big (6-10px).
  // Clamped so the click still lands inside the bbox we know about.
  const maxSpread = P("click.maxSpreadPx") - P("click.precisionNarrowingPx") * t.motorPrecision;
  const halfW = bbox ? bbox.width / 2 : P("click.defaultHalfWidthPx");
  const halfH = bbox ? bbox.height / 2 : P("click.defaultHalfHeightPx");
  const spreadX = Math.min(maxSpread, halfW * P("click.spreadShareOfHalf"));
  const spreadY = Math.min(maxSpread, halfH * P("click.spreadShareOfHalf"));
  const clampSd = P("clampSd");
  const dx = gauss(0, spreadX, -spreadX * clampSd, spreadX * clampSd);
  const dy = gauss(0, spreadY, -spreadY * clampSd, spreadY * clampSd);
  const targetX = cx + dx;
  const targetY = cy + dy;

  // Mis-click roll (only if we know the bbox so we can land just outside)
  const willMisclick = bbox && Math.random() < P("click.misclickRate");
  if (willMisclick) {
    // Click 6-12px outside the bbox edge, in a random direction
    const angle = Math.random() * Math.PI * 2;
    const dist = rand(halfW + P("click.missMinPx"), halfW + P("click.missMaxPx"));
    const missX = cx + Math.cos(angle) * dist;
    const missY = cy + Math.sin(angle) * dist;
    await page.mouse.move(missX, missY, { steps: P("click.missMoveSteps") });
    await sleep(gauss(P("click.missPauseMeanMs"), P("click.missPauseSdMs"), P("click.missPauseMinMs"), P("click.missPauseMaxMs")));
    await page.mouse.click(missX, missY);
    // Realize, recover
    await sleep(gauss(P("click.recoverMeanMs"), P("click.recoverSdMs"), P("click.recoverMinMs"), P("click.recoverMaxMs")));
  }

  // Hover with smooth interpolation (steps=8-15) so any in-page mouse-tracker
  // sees a real movement curve, not a teleport.
  const moveSteps = Math.round(gauss(P("click.moveStepsMean"), P("click.moveStepsSd"), P("click.moveStepsMin"), P("click.moveStepsMax")));
  await page.mouse.move(targetX, targetY, { steps: moveSteps });

  // Pre-click dwell — the "is this what I want?" pause
  const dwell = gauss(P("click.dwellMeanMs"), P("click.dwellSdMs"), P("click.dwellMinMs"), P("click.dwellMaxMs")) * (1 + t.readingTendency * P("click.dwellReadingGain"));
  await sleep(dwell);

  await page.mouse.click(targetX, targetY);

  return { x: targetX, y: targetY };
}

// ─── Scrolling ──────────────────────────────────────────────────────────────

/**
 * Scroll with variable deltas and occasional glance-back (a brief reverse
 * scroll real readers do unconsciously). Returns the actual delta applied.
 */
export async function humanScroll(
  page: Page,
  baseDeltaY: number,
  inputTraits?: InputTraits,
): Promise<number> {
  const t = traits(inputTraits);

  // Vary the delta ±20% — not always exactly 400px
  const variance = baseDeltaY * P("scroll.deltaVariance");
  const delta = baseDeltaY + gauss(0, variance / P("clampSd"), -variance, variance);

  // 5% glance-back: scroll the opposite way 60-100px, pause, then scroll the
  // intended direction. Real readers do this when something catches their eye
  // mid-scroll. Skip for impatient personas.
  const willGlance = t.patience > P("scroll.glancePatience") && Math.random() < P("scroll.glanceRate");
  if (willGlance) {
    const glanceBack = -Math.sign(delta) * rand(P("scroll.glanceMinPx"), P("scroll.glanceMaxPx"));
    await page.evaluate(({ d }: { d: number }) => {
      window.scrollBy({ top: d, behavior: "smooth" });
    }, { d: glanceBack });
    await sleep(gauss(P("scroll.glancePauseMeanMs"), P("scroll.glancePauseSdMs"), P("scroll.glancePauseMinMs"), P("scroll.glancePauseMaxMs")));
  }

  await page.evaluate(({ d }: { d: number }) => {
    window.scrollBy({ top: d, behavior: "smooth" });
  }, { d: delta });
  // Wait for the smooth scroll to settle
  await sleep(gauss(P("scroll.settleMeanMs"), P("scroll.settleSdMs"), P("scroll.settleMinMs"), P("scroll.settleMaxMs")));

  return delta;
}

// ─── Inter-action settle ────────────────────────────────────────────────────

/**
 * "Settle" pause between actions — humans don't fire actions back-to-back at
 * machine speed. Patient readers settle longer; impatient skim faster.
 */
export async function humanSettle(inputTraits?: InputTraits): Promise<void> {
  const t = traits(inputTraits);
  // Range: 200ms (impatient) → 1200ms (very patient + thorough)
  const ms = gauss(
    P("settle.baseMs") + P("settle.patienceMs") * t.patience + P("settle.readingMs") * t.readingTendency,
    P("settle.sdMs"),
    P("settle.minMs"),
    P("settle.maxMs"),
  );
  await sleep(ms);
}
