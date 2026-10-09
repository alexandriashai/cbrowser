/**
 * LLM-judged element relevance for the semantic attention layer.
 *
 * WHAT THIS REPLACES. `computeGoalRelevance` scores an element by counting how
 * many goal keywords appear as substrings of its text, then scaling by 2.0. It
 * has no stemming, no synonyms and no semantics, so for the goal "buy a
 * subscription" the button "Checkout" scores ZERO, "Get Started" scores ZERO and
 * "Upgrade to Pro" scores ZERO — while a footer link reading "Subscription
 * terms" takes the full boost. Substring matching also fires on fragments:
 * "car rental" boosts "careers" and "shopping cart".
 *
 * That layer is supposed to model task-driven attention — Yarbus 1967, one of
 * the most replicated findings in eye-tracking — and it systematically misses
 * exactly the elements a goal-directed user goes for, because real calls to
 * action are rarely worded like the goal.
 *
 * WHAT IT DOES INSTEAD. One LLM call per (persona, goal, element-set) judges
 * every element at once. The model gets the persona's traits, motivational
 * values and description, not just its name, so relevance is judged the way the
 * persona would weigh it: an impatient power-user and an anxious first-timer
 * looking for the same thing do not attend to the same elements, and a semantic
 * vocabulary can express that where six element-type multipliers cannot.
 *
 * ONE CALL PER PAGE, NOT PER ELEMENT. A page carries tens of elements and the
 * overlay runs per frame; per-element or per-frame calls would make this
 * unusable. The cache key covers everything that can change the answer, so a
 * repeated run is free and deterministic — an LLM layer is only usable in a
 * regression context if repeating a run repeats the answer.
 *
 * FAILURE IS A DOWNGRADE, NEVER AN ERROR. No API key, a refused call, or
 * unparseable output falls back to the keyword scorer and reports `source`
 * accordingly. A relevance score whose provenance is unknown is worse than a
 * weak one: the caller must be able to say which method produced the number.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { getTraitDefinition, getTraitLevel } from "../trait-reference.js";

/**
 * Resolved per call, not frozen at import. A module-level constant read
 * CBROWSER_DATA_DIR once, at whichever import came first, so a process that set
 * it later (a test isolating its cache, a hosted request scoped to an account)
 * still read and wrote the shared ~/.cbrowser cache.
 */
function cacheDir(): string {
  return join(process.env.CBROWSER_DATA_DIR || join(homedir(), ".cbrowser"), "llm-relevance-cache");
}

/**
 * Element as the relevance judge sees it.
 *
 * Carries geometry and colour as well as text, because "does this deserve
 * attention" is not answerable from words alone: a primary action rendered as
 * 11px grey-on-white in a footer and the same words on a filled 200x56 button
 * are different elements to a viewer, and a low-vision or impatient persona
 * weighs that difference heavily.
 */
export interface RelevanceElement {
  /** Stable index the model scores against, so scores map back unambiguously. */
  index: number;
  type: string;
  text: string;
  /** Viewport-relative position. Above/below the fold changes attention. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Computed foreground colour. */
  color?: string;
  /** Nearest non-transparent background colour. */
  backgroundColor?: string;
  fontSize?: number;
  fontWeight?: number;
}

export interface RelevanceContext {
  goal?: string;
  /**
   * Whether the caller is entitled to spend a model call.
   *
   * This layer costs money per page, so entitlement is checked HERE rather than
   * only at the tool boundary: `screen_capture` is a free-tier tool whose
   * `attention_overlay` option would otherwise let any free key spend calls.
   * Absent means allowed, so non-MCP callers (CLI, tests, research harness) are
   * unaffected.
   */
  entitled?: boolean;
  /**
   * Screenshot bytes. Supplying them lets the judge see the rendered page —
   * visual hierarchy, whether an element actually stands out, what competes
   * with it — rather than inferring layout from numbers.
   */
  screenshot?: Buffer;
  /** Media type for the screenshot. Defaults to png. */
  screenshotMediaType?: "image/png" | "image/jpeg";
  /** Viewport, so the judge can reason about the fold. */
  viewport?: { width: number; height: number };
  personaName: string;
  /** Free-text persona description, when the persona carries one. */
  personaDescription?: string;
  /** Cognitive traits, 0-1. Patience, comprehension, risk tolerance and so on. */
  traits?: Record<string, number>;
  /** Schwartz motivational values, 0-1. */
  values?: Record<string, number>;
  /**
   * Sensory, motor and executive-function traits — a separate vector from
   * `traits`, and previously not passed at all. See persona-context.ts for why
   * dropping these specifically was the wrong half.
   */
  accessibilityTraits?: Record<string, number | boolean>;
}

export interface RelevanceResult {
  /** True when the judge was given the rendered screenshot. */
  sawScreenshot?: boolean;
  /**
   * Why these scores, in the persona's terms. Two sentences.
   *
   * Requested from the model alongside the scores rather than derived after,
   * because a number with no stated reason cannot be argued with — and the
   * whole point of moving off keyword matching was to get judgements a human
   * can inspect and disagree with.
   */
  reasoning?: string;
  /** Relevance per element index, 0-1. Missing index means zero. */
  scores: Record<number, number>;
  /** Which method produced these numbers. Never omit this from telemetry. */
  source: "llm" | "keyword-fallback";
  /**
   * True when this result was replayed from the on-disk cache rather than
   * judged now. A cached judgement repeats its reasoning word for word, which
   * is the point (a regression run must repeat its answer) and also looks
   * exactly like a model that ignores the page unless it is labelled.
   */
  cached: boolean;
  /** When the judgement was made (ISO 8601). Set on fresh LLM results and carried into the cache. */
  judgedAt?: string;
  /**
   * Age of a cached judgement in milliseconds, at read time. Present only on a
   * cache hit. Entries written before judgedAt existed are aged from the cache
   * file's modification time, which is when they were written.
   */
  cacheAgeMs?: number;
  model?: string;
  /** Present when the LLM path was attempted and could not be used. */
  unavailable?: string;
}

/**
 * The payload fields that say where a relevance judgement came from.
 *
 * `relevanceMethod` alone said WHICH method ran. It did not say WHEN: two
 * attention_analysis runs returned attentionReasoning word for word identical,
 * which reads as a model ignoring the page, and was in fact the second run
 * replaying the first from the cache (B23, 2026-10-09). The cache is right to
 * exist; leaving it unlabelled is what made a correct replay look like a defect.
 */
export function relevanceProvenance(
  judged: Pick<RelevanceResult, "source" | "cached" | "cacheAgeMs" | "judgedAt">,
): {
  relevanceMethod: RelevanceResult["source"];
  relevanceCached: boolean;
  relevanceCacheAgeSeconds?: number;
  relevanceJudgedAt?: string;
  relevanceCacheNote?: string;
} {
  const ageSeconds = judged.cached && typeof judged.cacheAgeMs === "number"
    ? Math.round(judged.cacheAgeMs / 1000)
    : undefined;
  return {
    relevanceMethod: judged.source,
    relevanceCached: judged.cached === true,
    ...(ageSeconds !== undefined ? { relevanceCacheAgeSeconds: ageSeconds } : {}),
    ...(judged.judgedAt ? { relevanceJudgedAt: judged.judgedAt } : {}),
    ...(judged.cached ? {
      relevanceCacheNote: "The relevance scores and attentionReasoning were replayed from a cache keyed on the persona, "
        + "goal and the page's element set (text, geometry, colour), not judged on this call. Identical wording "
        + "across runs of an unchanged page is this cache, by design, so repeated runs are comparable.",
    } : {}),
  };
}

/** The model rung this layer runs on. Judgement task, not a reasoning task. */
const RELEVANCE_MODEL = "claude-sonnet-5";

/**
 * Cache generation. Bump when a change makes existing entries wrong.
 *
 * v2: entries written before the partial-result guard can hold scores with no
 * reasoning, from a truncated response. Refusing to WRITE those does not stop
 * the ones already on disk from replaying forever — a content-addressed cache
 * has no other way to expire them, and the observed symptom was four of five
 * moments returning source "llm" with no reasoning, indefinitely.
 */
const CACHE_VERSION = "v3";

function cacheKey(elements: RelevanceElement[], ctx: RelevanceContext): string {
  const h = createHash("sha256");
  // Geometry and colour are part of the question, so they must be part of the
  // key: the same words restyled from a grey footer link to a filled button is
  // a different judgement, and reusing the old answer would hide exactly the
  // effect this layer was extended to capture.
  h.update(JSON.stringify(elements.map((e) => [
    e.index, e.type, e.text,
    e.x, e.y, e.width, e.height,
    e.color, e.backgroundColor, e.fontSize, e.fontWeight,
  ])));
  h.update(`|${CACHE_VERSION}|${ctx.personaName}|${ctx.goal ?? ""}|${RELEVANCE_MODEL}|`);
  h.update(JSON.stringify(ctx.traits ?? {}));
  h.update(JSON.stringify(ctx.values ?? {}));
  // Without this line the whole change is invisible: every persona already in
  // the cache would keep returning the answer computed before the judge could
  // see these traits, and the fix would look inert rather than wrong.
  h.update(JSON.stringify(ctx.accessibilityTraits ?? {}));
  if (ctx.screenshot) h.update(ctx.screenshot);
  return h.digest("hex").slice(0, 32);
}

function readCache(key: string): RelevanceResult | null {
  try {
    const p = join(cacheDir(), `${key}.json`);
    if (!existsSync(p)) return null;
    const entry = JSON.parse(readFileSync(p, "utf8")) as RelevanceResult;
    const judgedAtMs = entry.judgedAt ? Date.parse(entry.judgedAt) : NaN;
    const bornMs = Number.isFinite(judgedAtMs) ? judgedAtMs : statSync(p).mtimeMs;
    return {
      ...entry,
      cached: true,
      judgedAt: entry.judgedAt ?? new Date(bornMs).toISOString(),
      cacheAgeMs: Math.max(0, Math.round(Date.now() - bornMs)),
    };
  } catch {
    return null;
  }
}

function writeCache(key: string, value: RelevanceResult): void {
  try {
    const dir = cacheDir();
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    // Never persist the read-side fields: an entry that stored cached:true or
    // an age would replay a stale age forever.
    const { cacheAgeMs: _age, ...entry } = value;
    writeFileSync(join(dir, `${key}.json`), JSON.stringify({ ...entry, cached: false }));
  } catch { /* a cold cache is slower, never wrong */ }
}

/**
 * Render traits with what each VALUE means behaviourally for this persona.
 *
 * "patience 0.20 (low)" tells a judge almost nothing. The trait registry already
 * carries a behavioural example per band — patience 0.20 is "Gives up after 1-2
 * failed attempts" — and handing over that sentence instead of the number is the
 * difference between the model guessing what low patience implies and being told.
 */
function describeTraits(traits?: Record<string, number>): string {
  if (!traits) return "unspecified";
  const notable = Object.entries(traits)
    .filter(([, v]) => typeof v === "number" && (v <= 0.35 || v >= 0.65))
    .sort((a, b) => Math.abs(b[1] - 0.5) - Math.abs(a[1] - 0.5))
    .slice(0, 12)
    .map(([k, v]) => {
      const def = getTraitDefinition(k);
      if (!def) return `- ${k} ${v.toFixed(2)}`;
      const example = def.examples[getTraitLevel(v)];
      return `- ${k} ${v.toFixed(2)} — ${def.description}. At this level: ${example}`;
    });
  return notable.length > 0 ? "\n" + notable.join("\n") : "all traits near baseline";
}

/**
 * Render accessibility traits with what each value MEANS for reading and attention.
 *
 * Deliberately not filtered to "notable" the way describeTraits is. A vision or
 * motor value of 1.0 is unremarkable in the abstract but load-bearing here: it
 * tells the judge NOT to attribute a miss to eyesight, which is a conclusion an
 * LLM reaches readily when it knows a persona is disabled in some other respect.
 * Absence of impairment is information.
 */
function describeAccessibility(a?: Record<string, number | boolean>): string {
  if (!a || Object.keys(a).length === 0) return "";
  const band = (v: number) => (v <= 0.35 ? "low" : v >= 0.65 ? "high" : "moderate");
  const MEANING: Record<string, (v: number) => string> = {
    attentionSpan: (v) => `holds focus ${band(v)} — at ${v.toFixed(2)} they lose the thread partway through longer copy`,
    processingSpeed: (v) => `processes ${band(v)} — at ${v.toFixed(2)} dense or unfamiliar text costs noticeably more time`,
    fatigueSusceptibility: (v) => `tires ${v <= 0.35 ? "quickly" : v >= 0.65 ? "slowly" : "at an average rate"} (${v.toFixed(2)})`,
    visionLevel: (v) => `vision ${band(v)} (${v.toFixed(2)})`,
    contrastSensitivity: (v) => `contrast sensitivity ${band(v)} (${v.toFixed(2)})`,
    motorControl: (v) => `motor control ${band(v)} (${v.toFixed(2)})`,
    reachability: (v) => `reach ${band(v)} (${v.toFixed(2)})`,
  };
  const lines: string[] = [];
  for (const [k, raw] of Object.entries(a)) {
    if (typeof raw === "boolean") { lines.push(`- ${k}: ${raw ? "yes" : "no"}`); continue; }
    if (typeof raw !== "number") continue;
    const m = MEANING[k];
    lines.push(m ? `- ${k} ${raw.toFixed(2)} — ${m(raw)}` : `- ${k} ${raw.toFixed(2)}`);
  }
  return lines.length > 0 ? "\n" + lines.join("\n") : "";
}

/**
 * Schwartz values with their behavioural reading.
 *
 * No registry equivalent exists for values, and a bare number is as opaque here
 * as it is for traits, so the meaning is spelled out at the point of use.
 */
const VALUE_MEANING: Record<string, [string, string]> = {
  selfDirection: ["ignores recommendations, wants to explore and decide alone", "follows curated paths and suggestions"],
  stimulation: ["prefers familiar, predictable interfaces", "drawn to novelty, new, beta, latest"],
  hedonism: ["tolerates friction for utility", "abandons anything unpleasant or effortful"],
  achievement: ["satisfices, takes the first workable option", "optimises, compares, seeks the best outcome"],
  power: ["indifferent to status signals", "responds to premium, pro, exclusive framing"],
  security: ["untroubled by risk signals", "scrutinises safety, privacy, guarantees, refunds"],
  conformity: ["immune to social proof", "strongly moved by reviews, ratings, popularity"],
  tradition: ["comfortable with the unfamiliar", "distrusts novelty, wants the established option"],
  benevolence: ["self-focused in decisions", "attends to how choices affect others"],
  universalism: ["indifferent to ethics framing", "attends to sustainability, fairness, accessibility claims"],
};

function describeValues(values?: Record<string, number>): string {
  if (!values) return "unspecified";
  const notable = Object.entries(values)
    .filter(([, v]) => typeof v === "number" && (v <= 0.35 || v >= 0.65))
    .sort((a, b) => Math.abs(b[1] - 0.5) - Math.abs(a[1] - 0.5))
    .map(([k, v]) => {
      const m = VALUE_MEANING[k];
      if (!m) return `- ${k} ${v.toFixed(2)}`;
      return `- ${k} ${v.toFixed(2)} — ${v >= 0.65 ? m[1] : m[0]}`;
    });
  return notable.length > 0 ? "\n" + notable.join("\n") : "all values near baseline";
}

/**
 * The keyword scorer this layer replaces, kept as the fallback.
 *
 * Deliberately identical to the historical behaviour so a downgrade changes the
 * source field and nothing else.
 */
export function keywordRelevance(elementText: string, goal: string): number {
  if (!goal || !elementText) return 0;
  const stopWords = new Set(["the", "a", "an", "to", "for", "of", "in", "on", "at", "is", "it", "my", "i", "me", "and", "or", "how", "do", "can"]);
  const goalWords = goal.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));
  if (goalWords.length === 0) return 0;
  const textLower = elementText.toLowerCase();
  const matches = goalWords.filter((w) => textLower.includes(w)).length;
  return matches === 0 ? 0 : (matches / goalWords.length) * 2.0;
}

function keywordFallback(
  elements: RelevanceElement[],
  ctx: RelevanceContext,
  unavailable: string,
): RelevanceResult {
  const scores: Record<number, number> = {};
  if (ctx.goal) {
    for (const el of elements) {
      // Historical scorer runs 0-2; this layer's contract is 0-1.
      const raw = keywordRelevance(el.text, ctx.goal) / 2;
      if (raw > 0) scores[el.index] = Math.min(1, raw);
    }
  }
  return { scores, source: "keyword-fallback", cached: false, unavailable };
}

/**
 * Judge how much each element deserves this persona's attention.
 *
 * Returns 0-1 per element index. Callers multiply their existing element weight
 * by `1 + k * score` rather than replacing it — relevance modulates the
 * element-type prior, it does not override it.
 */
export async function judgeRelevance(
  elements: RelevanceElement[],
  ctx: RelevanceContext,
  getApiKey: () => string | null,
): Promise<RelevanceResult> {
  if (elements.length === 0) {
    return { scores: {}, source: "llm", cached: false };
  }

  const key = cacheKey(elements, ctx);
  const hit = readCache(key);
  if (hit) return hit;

  if (ctx.entitled === false) {
    return keywordFallback(
      elements, ctx,
      "Persona-judged relevance requires CBrowser Pro — using keyword matching",
    );
  }

  const apiKey = getApiKey();
  if (!apiKey) return keywordFallback(elements, ctx, "No Anthropic API key configured");

  const system =
    "You judge which page elements a specific person would pay attention to. " +
    "You are modelling ONE person's attention, described by their traits, values and goal. " +
    "Score every element 0.0-1.0 for how much THIS person's attention it deserves.\n\n" +
    "Judge by meaning, not word overlap. For the goal \"buy a subscription\", a button " +
    "labelled \"Checkout\", \"Get Started\" or \"Upgrade to Pro\" is highly relevant even though " +
    "it shares no words with the goal, while a footer link reading \"Subscription terms\" is not.\n\n" +
    "Weigh the persona. Low patience skips explanatory copy and hunts for the action. High " +
    "anxiety or low trust dwells on security, price and reassurance. High conformity is pulled " +
    "by social proof and ratings; high self-direction ignores them. Low comprehension needs " +
    "labels and headings before controls. Let these genuinely change the ranking — two personas " +
    "with the same goal should not produce the same scores.\n\n" +
    "Return ONLY JSON: {\"scores\": {\"<index>\": <0.0-1.0>, ...}, \"reasoning\": \"<two sentences>\"}. " +
    "Omit elements scoring 0. Keep `reasoning` to TWO sentences, under 60 words total — it is " +
    "emitted after the scores and a long one gets truncated, losing itself. Say what this persona " +
    "is drawn to on THIS page and what they ignore, naming their traits. Write it so a designer " +
    "reading it knows what to change.";

  const user = [
    `Persona: ${ctx.personaName}`,
    ctx.personaDescription ? `Description: ${ctx.personaDescription}` : "",
    `Notable traits:${describeTraits(ctx.traits)}`,
    ctx.accessibilityTraits ? `Sensory / motor / executive:${describeAccessibility(ctx.accessibilityTraits)}` : "",
    ctx.values ? `Motivational values:${describeValues(ctx.values)}` : "",
    ctx.goal ? `Goal on this page: ${ctx.goal}` : "No stated goal — judge by what this persona is drawn to.",
    ctx.viewport ? `Viewport: ${ctx.viewport.width}x${ctx.viewport.height} (fold at y=${ctx.viewport.height})` : "",
    "",
    ctx.screenshot
      ? "The rendered page is attached. Elements below are listed with size, position and colour."
      : "Elements below are listed with size, position and colour.",
    "",
    "Elements:",
    ...elements.map((e) => {
      const bits: string[] = [`${e.index}. [${e.type}] ${e.text.slice(0, 120)}`];
      if (e.width && e.height) bits.push(`${Math.round(e.width)}x${Math.round(e.height)}px`);
      if (e.x !== undefined && e.y !== undefined) bits.push(`at (${Math.round(e.x)},${Math.round(e.y)})`);
      if (e.fontSize) bits.push(`${Math.round(e.fontSize)}px${e.fontWeight && e.fontWeight >= 600 ? " bold" : ""}`);
      if (e.color) bits.push(`fg ${e.color}`);
      if (e.backgroundColor) bits.push(`bg ${e.backgroundColor}`);
      return bits.join("  ");
    }),
  ].filter(Boolean).join("\n");

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: RELEVANCE_MODEL,
      max_tokens: 4000,
      system,
      messages: [{
        role: "user",
        content: ctx.screenshot
          ? [
              {
                type: "image" as const,
                source: {
                  type: "base64" as const,
                  media_type: ctx.screenshotMediaType ?? "image/png",
                  data: ctx.screenshot.toString("base64"),
                },
              },
              { type: "text" as const, text: user },
            ]
          : user,
      }],
    });

    // Concatenate EVERY text block, not just the first: a leading prose block
    // pushed the JSON into content[1] and the layer silently degraded to keyword
    // matching, which is the worst possible failure here because the fallback
    // still returns plausible numbers.
    const text = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .replace(/```(?:json)?/gi, "");

    // Brace-balanced scan rather than a greedy regex, so prose containing braces
    // on either side of the payload does not swallow or truncate it.
    const extractJson = (src: string): string | null => {
      const start = src.indexOf("{");
      if (start < 0) return null;
      let depth = 0, inStr = false, esc = false;
      for (let i = start; i < src.length; i++) {
        const c = src[i];
        if (esc) { esc = false; continue; }
        if (c === "\\") { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (c === "{") depth++;
        else if (c === "}" && --depth === 0) return src.slice(start, i + 1);
      }
      return null;
    };

    const json = extractJson(text);

    // Salvage a truncated response rather than discarding it.
    //
    // `scores` is emitted before `reasoning`, so a response cut off mid-sentence
    // still contains a COMPLETE scores object — and the scores are the part that
    // matters. Throwing the whole thing away and silently returning keyword
    // numbers was strictly worse than losing only the prose. Observed live: a
    // response ending mid-reasoning with "scores": {"0": 0.95} fully intact.
    let parsed: { scores?: Record<string, number>; reasoning?: string } | null = null;
    if (json) {
      try { parsed = JSON.parse(json); } catch { parsed = null; }
    }
    if (!parsed) {
      const scoresOnly = text.match(/"scores"\s*:\s*(\{[^{}]*\})/);
      if (scoresOnly) {
        try { parsed = { scores: JSON.parse(scoresOnly[1]) }; } catch { parsed = null; }
      }
    }
    if (!parsed) {
      return keywordFallback(
        elements, ctx,
        `Model returned no parseable JSON (${text.slice(0, 80).replace(/\s+/g, " ")})`,
      );
    }
    const scores: Record<number, number> = {};
    for (const [k, v] of Object.entries(parsed.scores ?? {})) {
      const idx = Number(k);
      // Reject anything that is not a real index or a real 0-1 score rather
      // than letting a malformed key become element 0 at NaN weight.
      if (!Number.isInteger(idx) || typeof v !== "number" || !Number.isFinite(v)) continue;
      if (idx < 0 || idx >= elements.length) continue;
      if (v > 0) scores[idx] = Math.max(0, Math.min(1, v));
    }

    const result: RelevanceResult = {
      scores, source: "llm", cached: false, model: RELEVANCE_MODEL,
      judgedAt: new Date().toISOString(),
      sawScreenshot: Boolean(ctx.screenshot),
      ...(typeof parsed.reasoning === "string" ? { reasoning: parsed.reasoning } : {}),
    };
    // Only cache a COMPLETE judgement. A salvaged response carries scores but no
    // reasoning, and caching it meant every later frame sharing that DOM
    // replayed the reasoning-less result — observed as four of five moments
    // reporting source "llm" with no reasoning at all, while the one frame with
    // a different DOM came back complete. A partial answer should cost one
    // retry, not poison every subsequent lookup.
    if (result.reasoning) writeCache(key, result);
    return result;
  } catch (e) {
    return keywordFallback(elements, ctx, `LLM relevance failed: ${(e as Error).message}`);
  }
}

// ===========================================================================
// Capture summary
// ===========================================================================

/** One judged moment in a recording. */
export interface JudgedMoment {
  /** Frame index this judgement was made at. */
  frameIndex: number;
  /** Milliseconds from capture start. */
  tMs: number;
  /** Why this moment scored the way it did, in the persona's terms. */
  reasoning?: string;
  /**
   * Which method produced this moment's scores.
   *
   * Carried per-moment because a moment with no elements is otherwise
   * indistinguishable from a moment that was never judged, and the two need
   * completely different fixes.
   */
  source?: "llm" | "keyword-fallback";
  /** Why the judgement was unusable, when it was. */
  unavailable?: string;
  /** The elements that scored highest, already resolved to text. */
  topElements: Array<{ text: string; type: string; score: number }>;
}

export interface CaptureSummary {
  narrative: string;
  source: "llm" | "unavailable";
  unavailable?: string;
}

/**
 * Narrate a whole recording from the moments that were judged along the way.
 *
 * A per-frame judgement answers "what did this persona attend to here". It does
 * not answer "how did this experience go", which is the question a designer
 * watching a recording actually has — where attention went first, what pulled it
 * away, whether the thing they came to do ever became findable. That is a
 * different question over a different unit (the run, not the frame), so it is a
 * separate call rather than a field on the last frame.
 *
 * Costs one call per capture regardless of length, because it consumes the
 * already-computed keyframe judgements rather than the frames.
 */
export async function summarizeCapture(
  moments: JudgedMoment[],
  ctx: RelevanceContext & {
    durationMs: number;
    frameCount: number;
    /**
     * What actually happened, captured from the page.
     *
     * Without this the model had only timestamps, and read the gaps between them
     * as a person deliberating. With it, silence is attributable: nothing
     * happened because nothing was driven, which is a fact about the script and
     * not about a user.
     */
    actions?: Array<{ atMs: number; type: string; label: string }>;
  },
  getApiKey: () => string | null,
): Promise<CaptureSummary> {
  if (moments.length === 0) {
    return { narrative: "", source: "unavailable", unavailable: "No judged moments to summarise" };
  }

  if (ctx.entitled === false) {
    return { narrative: "", source: "unavailable", unavailable: "Capture summary requires CBrowser Pro" };
  }

  const apiKey = getApiKey();
  if (!apiKey) return { narrative: "", source: "unavailable", unavailable: "No Anthropic API key configured" };

  const system =
    "You narrate how one specific person experienced a screen recording of a web page. " +
    "You are given the moments where the interface changed enough to re-judge their attention. " +
    "Write 3-5 sentences covering: what the model predicts pulled attention first, how the predicted " +
    "attention differs between the moments shown, whether what the persona came to do is prominent, " +
    "and the single change that would most improve this page for THIS person. Refer to their traits " +
    "by name where it explains a difference. Write for a designer who will act on it — concrete, no " +
    "hedging.\n\n" +
    "An ACTION LOG may be supplied. It is the complete record of what was driven " +
    "on the page — every click, input and submit. Anything not in it did not happen. " +
    "You may say what an action led to; you may not invent one that is not listed.\n\n" +
    "CRITICAL — DO NOT INFER BEHAVIOUR FROM TIME. These timestamps are when an automation issued " +
    "its next command; the gaps between them are script cadence, NOT a person deliberating. Never " +
    "write that the user hesitated, stalled, lingered, re-read, second-guessed, hovered, or 'took N " +
    "seconds to decide'. There is no human in this recording and no dwell data. A four-second gap " +
    "means nothing called the tool for four seconds. Describe what the page shows and what the model " +
    "predicts about it — never a mental state, and never a duration as evidence of one.\n\n" +
    "This holds for the RECOMMENDATION too. Do not justify a fix with what a user 'will stall on' " +
    "or 'would hesitate over' — that reads as an observed finding to anyone skimming, and nothing " +
    "here observed a user. Argue from the model instead: 'this persona weights security signals " +
    "heavily and the page has none above the fold' is defensible; 'they stall before signing up' " +
    "is not, even as a prediction.\n\n" +
    "Return ONLY JSON: {\"narrative\": \"<3-5 sentences>\"}.";

  const user = [
    `Persona: ${ctx.personaName}`,
    ctx.personaDescription ? `Description: ${ctx.personaDescription}` : "",
    `Notable traits:${describeTraits(ctx.traits)}`,
    ctx.accessibilityTraits ? `Sensory / motor / executive:${describeAccessibility(ctx.accessibilityTraits)}` : "",
    ctx.values ? `Motivational values:${describeValues(ctx.values)}` : "",
    ctx.goal ? `Goal: ${ctx.goal}` : "No stated goal.",
    `Recording: ${ctx.frameCount} frames over ${(ctx.durationMs / 1000).toFixed(1)}s, ${moments.length} judged moments.`,
    "",
    ctx.actions && ctx.actions.length > 0
      ? "Action log (complete — nothing else was driven):\n" +
        ctx.actions.map((a) => `  t=${(a.atMs / 1000).toFixed(1)}s ${a.type}${a.label ? ` on "${a.label}"` : ""}`).join("\n")
      : "Action log: EMPTY. Nothing was clicked or typed during this recording. " +
        "Do not describe the persona as doing anything.",
    "",
    "Moments:",
    ...moments.map((m) => [
      `t=${(m.tMs / 1000).toFixed(1)}s (frame ${m.frameIndex})`,
      m.topElements.length > 0
        ? `  drew attention: ${m.topElements.map((e) => `${e.text.slice(0, 60)} (${e.score.toFixed(2)})`).join("; ")}`
        : "  drew attention: nothing scored",
      m.reasoning ? `  why: ${m.reasoning}` : "",
    ].filter(Boolean).join("\n")),
  ].filter(Boolean).join("\n");

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: RELEVANCE_MODEL,
      max_tokens: 2000,
      system,
      messages: [{ role: "user", content: user }],
    });

    const text = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .replace(/```(?:json)?/gi, "");

    // Salvage a truncated narrative rather than returning the raw JSON envelope.
    // A cut-off response has no closing brace, so the brace scan failed and the
    // "prose without JSON" fallback handed back the literal {"narrative":"...
    // string — which then rendered verbatim in the player.
    const narrativeOnly = text.match(/"narrative"\s*:\s*"((?:[^"\\]|\\.)*)/);
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if ((start < 0 || end <= start) && narrativeOnly) {
      const salvaged = narrativeOnly[1]
        .replace(/\\"/g, '"').replace(/\\n/g, " ").replace(/\\\\/g, "\\").trim();
      if (salvaged) return { narrative: salvaged, source: "llm" };
    }
    if (start < 0 || end <= start) {
      // Prose without JSON is still a usable narrative; losing it to a parse
      // rule would discard the answer over its packaging.
      const bare = text.trim();
      return bare
        ? { narrative: bare, source: "llm" }
        : { narrative: "", source: "unavailable", unavailable: "Model returned nothing usable" };
    }

    const parsed = JSON.parse(text.slice(start, end + 1)) as { narrative?: string };
    return parsed.narrative
      ? { narrative: parsed.narrative, source: "llm" }
      : { narrative: "", source: "unavailable", unavailable: "Model returned no narrative" };
  } catch (e) {
    return { narrative: "", source: "unavailable", unavailable: `Summary failed: ${(e as Error).message}` };
  }
}
