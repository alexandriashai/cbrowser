/**
 * Attention Quality — bridges cognitive effort and visual saliency.
 *
 * Measures not just WHERE a persona looks, but whether they see
 * the things that matter: CTAs, value props, and primary actions.
 *
 * Four components:
 * 1. CTA Capture Rate — do top saliency zones overlap with CTAs?
 * 2. Value Prop Salience — share of top attention on headings AND CTAs
 *    together (headingShare is the heading-only part of it)
 * 3. Distractor Ratio — how much attention goes to non-actionable elements?
 * 4. Value Relevance Score — does the persona see what THEIR values care about?
 *
 * @since v18.39.0 (base), v18.46.0 (value-driven semantic classification)
 */

import type { PageUnderstanding, Affordance, CTAElement } from "../analysis/page-understanding.js";

// ── Semantic Element Types (value-relevant) ──

export type SemanticType =
  | "trust-signal"    // Security badges, locks, "verified", guarantees, certifications
  | "social-proof"    // Star ratings, review counts, "trusted by X", testimonials
  | "novelty"         // "New", "Beta", "Updated", recent dates, feature badges
  | "metrics"         // Numbers, percentages, stats, ROI, performance data
  | "urgency"         // "Limited time", "Only X left", countdowns, scarcity
  | "community"       // "Join", forums, team, "community", user counts
  | "authority"       // Expert endorsements, "Fortune 500", logos, awards
  | "none";

// Every alternative below is left-anchored with \b, and whole words are anchored
// on both sides. Without that these are SUBSTRING matches, and the failure is
// not theoretical: measured 2026-08-05, 17 of 18 sampled UI strings misclassified.
//
//   "Get started"          -> social-proof   (`star` inside "started")
//   "Operating system"     -> social-proof   (`rating` inside "Operating")
//   "Preview your report"  -> social-proof   (`review` inside "Preview")
//   "Unlock advanced mode" -> trust-signal   (`lock` inside "Unlock")
//   "Remember my choice"   -> community      (`member` inside "Remember")
//   "Pending invitations"  -> urgency        (`ending` inside "Pending")
//   "Leaderboard"          -> authority      (`leader` inside "Leaderboard")
//
// "Get started" is the worst of these and the reason this is a correctness bug
// rather than a tidy-up: it is the most common CTA string on the web, and
// semanticType feeds computeValueRelevance, which weights social-proof by the
// persona's `conformity` value. So every persona deliberately set LOW on social
// proof -- several custom ones sit in the 0.3-0.45 band -- had its attention to
// the primary CTA *suppressed* by a trait that should never have been in that
// path at all. A persona configured to ignore testimonials was quietly
// configured to ignore "Get started".
//
// Stems keep their right side open on purpose (`\bverif` -> verify/verified/
// verification); only whole words get a closing \b.
const TRUST_PATTERNS = /\bsecur|\btrust|\bverif|\bcertif|\bguarant|\bmoney.?back|\brefund|\bprivacy\b|\bencrypt|\bssl\b|\bbadge|\bshield|\block(?:ed|s|ing)?\b|\bsafe(?:ty)?\b|\bprotect|\bcomplian/i;
// Bare `users`/`customers`/`clients` were their own alternatives here, which is
// why the numeral in "Test like 17 users, not like you" was a red herring —
// removing it still classified social-proof. A bare noun carries no social-proof
// semantics; a COUNT of them does, and the cardinality alternative already
// covers that ("400 customers"), as does `trusted by`.
// The count alternative additionally requires a BOASTABLE count: 3+ digits, a
// k/M suffix, or a trailing "+". Nobody cites 17 users as evidence that other
// people trust them, which is why "Test like 17 users, not like you" — a
// differentiation claim about personas, not a customer count — was being read as
// social proof. Explicit framing ("trusted by 17 companies") still counts, via
// the `trusted.?by` alternative; it is the framing that makes it a claim about
// other people, and a bare mid-sentence count that carries none.
const SOCIAL_PROOF_PATTERNS = /\breview|\brating|\bstars?\b|\btrusted.?by|\btestimonial|\brecommend|(?:\d{3,}|\d+[kKmM]|\d+\+)\s*(?:users|customers|downloads|installs|companies)|\b4\.\d|\b5\.0\b/i;
const NOVELTY_PATTERNS = /\bnew\b|\bbeta\b|\blaunch|\bupdat|\bjust.?added|\bfresh|\blatest\b|\bcoming.?soon|\bearly.?access|\bpreview/i;
const METRICS_PATTERNS = /\d+%|\d+x\s|\broi\b|\bsave\b.*\d|\bfaster\b|\breduc|\bimprov(?:e|ing)|\bincrease|\bdecrease|\bperformance\b|\bbenchmark|\$\d/i;
// \blimited\b, not `limited`: "unlimited" is the OPPOSITE of scarcity and was
// being scored as urgency.
const URGENCY_PATTERNS = /\blimited\b|\bonly\s*\d|\bhurry\b|\bexpir|\bcountdown\b|\blast.?chance|\bending\b|\bleft.?in.?stock|\bact.?now|\bdon.?t.?miss/i;
const COMMUNITY_PATTERNS = /\bcommunity\b|\bjoin\b|\bforum|\btogether\b|\bteams?\b|\bfamily\b|\bfellow|\bmember|\bbelong|\bcontrib|\bopen.?source/i;
const AUTHORITY_PATTERNS = /\bfortune\b|\bforbes\b|\btechcrunch\b|\baward|\bwinner|\bleaders?\b|\bexpert|\bpartner|\benterprise\b|\bgovernment\b|\buniversit/i;

/** Classify an element's semantic type from its text content */
export function classifySemanticType(text: string, classList?: string): SemanticType {
  if (!text && !classList) return "none";
  const combined = `${text || ""} ${classList || ""}`;
  if (TRUST_PATTERNS.test(combined)) return "trust-signal";
  if (SOCIAL_PROOF_PATTERNS.test(combined)) return "social-proof";
  if (NOVELTY_PATTERNS.test(combined)) return "novelty";
  if (METRICS_PATTERNS.test(combined)) return "metrics";
  if (URGENCY_PATTERNS.test(combined)) return "urgency";
  if (COMMUNITY_PATTERNS.test(combined)) return "community";
  if (AUTHORITY_PATTERNS.test(combined)) return "authority";
  return "none";
}

/** Schwartz value weights for each semantic type (which values care about which elements) */
const VALUE_SEMANTIC_WEIGHTS: Record<SemanticType, Record<string, number>> = {
  "trust-signal":  { security: 1.0, conformity: 0.5, tradition: 0.3 },
  "social-proof":  { conformity: 1.0, security: 0.6, tradition: 0.3 },
  "novelty":       { stimulation: 1.0, selfDirection: 0.5 },
  "metrics":       { achievement: 1.0, power: 0.4 },
  "urgency":       { stimulation: 0.5, achievement: 0.4 },
  "community":     { benevolence: 0.8, universalism: 0.6, conformity: 0.3 },
  "authority":     { security: 0.5, conformity: 0.6, tradition: 0.4, power: 0.3 },
  "none":          {},
};

/** Compute how relevant an element is to a persona's values (0-1) */
export function computeValueRelevance(
  semanticType: SemanticType,
  values: Partial<Record<string, number>>,
): number {
  const weights = VALUE_SEMANTIC_WEIGHTS[semanticType];
  if (!weights || Object.keys(weights).length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;
  for (const [valueName, weight] of Object.entries(weights)) {
    const personaValue = values[valueName] ?? 0.5;
    weightedSum += personaValue * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

export interface AttentionQualityResult {
  /** CTA capture rate: fraction of top saliency in CTA zones (0-1) */
  ctaCaptureRate: number;
  /** Heading share alone — valuePropSalience includes CTA and hides this. */
  headingShare?: number;
  /** The classifier's default bucket, previously published nowhere. */
  contentRatio?: number;
  /** Residual after every bucket, so a gap is visible rather than silent. */
  unaccountedRatio?: number;
  ratioNote?: string;
  /**
   * Share of top attention on headings and CTAs together (0-1).
   *
   * NOT "is the value proposition seen": it includes CTA attention, so it is 1
   * whenever every sampled hotspot lands on a CTA, headings or not. Read
   * headingShare for the heading-only figure. The interpretation therefore
   * speaks about headings and CTAs, never about "the value prop".
   */
  valuePropSalience: number;
  /** Distractor ratio: fraction of top attention on non-actionable elements (0-1) */
  distractorRatio: number;
  /** Combined attention quality score (0-100) */
  qualityScore: number;
  /** Value relevance score: how much attention hits elements this persona's values care about (0-1). Only present when values provided. */
  valueRelevanceScore?: number;
  /** Hotspot cells the ratios were computed over. */
  sampledHotspots?: number;
  /** DISTINCT elements those cells landed on — the real sample size. */
  sampledElements?: number;
  /** Present only when the sample is too thin for the ratios to discriminate. */
  sampleNote?: string;
  /**
   * The saliency mass each ratio was computed from, before division.
   *
   * The ratios are rounded to three decimals, and three decimals is enough
   * precision to look like identity when it is not. Two personas returned
   * `ctaCaptureRate: 0.343` from 122.531/357.183 and 118.899/346.169 -- values
   * that differ in the fourth decimal -- and a reader diffing the two runs
   * reasonably concluded the metric was persona-invariant and filed it as a P0.
   * It was a rounding collision.
   *
   * Publishing more decimals would be the wrong fix: the ratio genuinely does
   * not carry four-decimal precision, since it is computed over three or four
   * coarse buckets, and `sampleNote` already says to read it as indicative.
   * Rounding to TWO decimals, the other obvious move, collides more often, not
   * less.
   *
   * So the ratio keeps the precision it deserves and the basis ships beside it.
   * A diff can now distinguish "the same measurement" from "two different
   * measurements that round alike", which is the actual question a reader
   * comparing runs is asking.
   */
  basis?: {
    /** Saliency summed over the sampled window, per bucket. */
    cta: number;
    heading: number;
    navigation: number;
    decorative: number;
    content: number;
    unaccounted: number;
    /** The denominator every ratio above divides by. */
    total: number;
  };
  /** What the top attention zones are hitting */
  topAttentionTargets: Array<{
    type: "cta" | "heading" | "navigation" | "content" | "decorative" | "unknown";
    element: string;
    saliency: number;
    semanticType?: SemanticType;
    valueRelevance?: number;
  }>;
  /** Interpretation */
  interpretation: string;
}

interface SaliencyHotspot {
  x: number;
  y: number;
  saliency: number;
  row: number;
  col: number;
}

interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute attention quality by cross-referencing saliency hotspots
 * with page structure (CTAs, headings, navigation, content).
 *
 * @param hotspots - Top saliency hotspots from attention_analysis
 * @param pageElements - Interactive elements with bounding boxes from the page
 * @param pageUnderstanding - Page structure from page_understand
 * @param cellSize - Saliency grid cell size
 */
/**
 * Collapse per-cell attention entries into one entry per element.
 *
 * cellCount is kept so a caller can tell a broad element from a sharp one.
 *
 * The dedupe originally summed saliency into the `saliency` field, which put a
 * value of 9.943 on a field every sibling reads as 0-1 (`topAttentionAreas`
 * reports 1 and 0.99 on that scale). Summing was not wrong — total attention
 * mass is the right way to RANK targets — but publishing a sum under a name
 * that means a normalized score is, and it is the same defect shape as several
 * others in this codebase: two quantities sharing one name.
 *
 * So both are reported and each says what it is: `saliency` is the mean, on the
 * documented scale, and `saliencySum` is the total mass the ranking uses.
 * (2026-07-29)
 */
/** Six decimals — fine enough that the basis cannot collide the way the ratio did. */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Element bounds a hotspot falls inside, or null. */
type AttentionElement = {
  text: string; type: string; x: number; y: number; width: number; height: number;
  isHeading?: boolean; isCTA?: boolean; isNav?: boolean; isDecorative?: boolean;
  semanticType?: SemanticType; selector?: string;
};

/**
 * Which element a hotspot lands on, or null.
 *
 * Extracted so the WINDOW and the RATIOS attribute hotspots identically. When
 * the window was chosen by a bare `slice(0, 20)` and attribution lived inline in
 * the ratio loop, the two could not disagree only because the window did no
 * attribution at all — which was the bug. Now they share one definition.
 */
function elementAtPoint(
  hx: number, hy: number, pageElements: AttentionElement[],
): AttentionElement | null {
  const pad = 20; // pixels of tolerance
  for (const el of pageElements) {
    if (hx >= el.x - pad && hx <= el.x + el.width + pad
      && hy >= el.y - pad && hy <= el.y + el.height + pad) return el;
  }
  return null;
}

function dedupeTargetsByElement(
  targets: AttentionQualityResult["topAttentionTargets"],
): AttentionQualityResult["topAttentionTargets"] {
  const byElement = new Map<
    string,
    AttentionQualityResult["topAttentionTargets"][number] & { cellCount?: number; saliencySum?: number }
  >();
  for (const t of targets) {
    const key = `${t.type}::${t.element}`;
    const existing = byElement.get(key);
    if (existing) {
      existing.saliencySum = (existing.saliencySum ?? existing.saliency) + t.saliency;
      existing.cellCount = (existing.cellCount ?? 1) + 1;
    } else {
      byElement.set(key, { ...t, cellCount: 1, saliencySum: t.saliency });
    }
  }
  const round3 = (n: number) => Math.round(n * 1000) / 1000;
  for (const entry of byElement.values()) {
    const sum = entry.saliencySum ?? entry.saliency;
    const count = entry.cellCount ?? 1;
    entry.saliencySum = round3(sum);
    entry.saliency = round3(sum / count);
  }
  // Ranked by total attention captured, not by mean: an element spanning ten
  // hot cells genuinely draws more attention than one spanning a single cell of
  // the same intensity.
  return [...byElement.values()].sort(
    (a, b) => (b.saliencySum ?? b.saliency) - (a.saliencySum ?? a.saliency),
  );
}

/**
 * The sampling floor: the attention window widens until it covers this many
 * DISTINCT elements, and a result below it carries `sampleNote`. Exported so
 * every statement about "below the floor" reads the same number.
 */
export const MIN_DISTINCT_ELEMENTS = 8;

export function computeAttentionQuality(
  hotspots: SaliencyHotspot[],
  pageElements: Array<{
    selector: string;
    text: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    isHeading?: boolean;
    isCTA?: boolean;
    isNav?: boolean;
    isDecorative?: boolean;
    semanticType?: SemanticType;
  }>,
  cellSize: number = 4,
  personaValues?: Partial<Record<string, number>>,
): AttentionQualityResult {
  // The window is chosen over ELEMENTS, not over raw cells.
  //
  // `hotspots` are grid cells (4px by default), so a single H1 spans dozens of
  // them. Taking a flat top-20 CELLS therefore did not sample the page — on a
  // page with one dominant headline it sampled ONE ELEMENT twenty times, and
  // every ratio below then had to come out 0 or 1:
  //
  //   ctaCaptureRate 0 · valuePropSalience 1 · headingShare 1
  //   distractorRatio 0 · contentRatio 0 · topAttentionTargets: [1 entry]
  //
  // Those are not measurements. A metric computed over a sample of one cannot
  // discriminate between pages or between personas, which is exactly the
  // complaint the July report logged as "attention quality saturates and fails
  // to separate personas".
  //
  // Note this is the SAME defect the 2026-07-29 dedupe fixed — one element
  // filling all ten display slots — fixed there only for `topAttentionTargets`
  // and left standing in the ratio math right beside it. Fixing the visible
  // instance of a class and not sweeping the class is how it survived a month.
  //
  // So: walk hotspots in rank order and keep going until the window covers a
  // usable number of DISTINCT elements. Cell-level weighting is preserved on
  // purpose — an element covering ten hot cells genuinely draws more attention
  // than one covering a single cell of the same intensity — only the window
  // stopping rule changes.
  const MIN_HOTSPOTS = 20;
  const seenKeys = new Set<string>();
  let windowEnd = 0;
  for (let i = 0; i < hotspots.length; i++) {
    const el = elementAtPoint(hotspots[i].x, hotspots[i].y, pageElements);
    if (el) seenKeys.add(`${el.x},${el.y},${el.width},${el.height}`);
    windowEnd = i + 1;
    if (windowEnd >= MIN_HOTSPOTS && seenKeys.size >= MIN_DISTINCT_ELEMENTS) break;
  }
  const topHotspots = hotspots.slice(0, windowEnd);
  // Published, not assumed. When a page genuinely has fewer than
  // MIN_DISTINCT_ELEMENTS competing for attention the ratios are still thin, and
  // a reader has to be able to see that rather than read 1.0 as confidence.
  const sampledHotspots = topHotspots.length;
  const sampledElements = seenKeys.size;

  if (topHotspots.length === 0) {
    return {
      ctaCaptureRate: 0,
      valuePropSalience: 0,
      distractorRatio: 1,
      qualityScore: 0,
      topAttentionTargets: [],
      interpretation: "No saliency data available.",
    };
  }

  const totalTopSaliency = topHotspots.reduce((s, h) => s + h.saliency, 0) || 1;

  let ctaSaliency = 0;
  let headingSaliency = 0;
  let navSaliency = 0;
  let contentSaliency = 0;
  let decorativeSaliency = 0;
  let unknownSaliency = 0;

  const targets: AttentionQualityResult["topAttentionTargets"] = [];

  for (const hotspot of topHotspots) {
    const hx = hotspot.x;
    const hy = hotspot.y;

    const el = elementAtPoint(hx, hy, pageElements);
    if (el) {
      let type: "cta" | "heading" | "navigation" | "content" | "decorative" = "content";

      if (el.isCTA) {
        type = "cta";
        ctaSaliency += hotspot.saliency;
      } else if (el.isHeading) {
        type = "heading";
        headingSaliency += hotspot.saliency;
      } else if (el.isNav) {
        type = "navigation";
        navSaliency += hotspot.saliency;
      } else if (el.isDecorative) {
        type = "decorative";
        decorativeSaliency += hotspot.saliency;
      } else {
        contentSaliency += hotspot.saliency;
      }

      // Semantic classification + value relevance
      const semType = el.semanticType || classifySemanticType(el.text || "", el.selector);
      const valRel = personaValues ? computeValueRelevance(semType, personaValues) : undefined;

      targets.push({
        type,
        // `selector` is optional on the element shape, so it cannot be the last
        // fallback — an element with neither text nor selector would put
        // `undefined` into a field typed string. Falls through to the type name,
        // which always exists.
        element: el.text?.slice(0, 50) || el.selector || el.type,
        saliency: Math.round(hotspot.saliency * 1000) / 1000,
        semanticType: semType !== "none" ? semType : undefined,
        valueRelevance: valRel !== undefined ? Math.round(valRel * 1000) / 1000 : undefined,
      });
    }

    if (!el) {
      unknownSaliency += hotspot.saliency;
      targets.push({
        type: "unknown",
        element: `(${hx}, ${hy})`,
        saliency: Math.round(hotspot.saliency * 1000) / 1000,
      });
    }
  }

  // Compute rates
  const ctaCaptureRate = ctaSaliency / totalTopSaliency;
  const valuePropSalience = (headingSaliency + ctaSaliency) / totalTopSaliency;
  const distractorRatio = (decorativeSaliency + unknownSaliency + navSaliency) / totalTopSaliency;
  // contentSaliency was accumulated and consumed by NOTHING.
  //
  // It is the DEFAULT bucket -- anything the classifier does not recognise as
  // cta / heading / nav / decorative lands here -- so unrecognised elements
  // vanished from every published ratio and the ratios did not sum to 1. On a
  // real university homepage that produced `distractorRatio: 0` while the
  // persona was demonstrably fixating on nav-like dropdown triggers: they were
  // not flagged isNav, fell through to content, and were counted nowhere.
  //
  // Published now, along with the residual, so a reader can see what share of
  // attention the classifier could not account for. (2026-08-02)
  const contentRatio = contentSaliency / totalTopSaliency;
  const unaccountedRatio = Math.max(0, 1 - (ctaCaptureRate + (headingSaliency / totalTopSaliency)
    + distractorRatio + contentRatio));
  const headingShare = headingSaliency / totalTopSaliency;

  // Value relevance score (only when persona values provided)
  let valueRelevanceScore: number | undefined;
  if (personaValues) {
    let valRelSum = 0;
    let valRelCount = 0;
    for (const t of targets) {
      if (t.valueRelevance !== undefined && t.valueRelevance > 0) {
        valRelSum += t.saliency * t.valueRelevance;
        valRelCount++;
      }
    }
    valueRelevanceScore = valRelCount > 0
      ? Math.round((valRelSum / totalTopSaliency) * 1000) / 1000
      : 0;
  }

  // Quality score: rewards CTA capture, heading + CTA attention, low distraction, and value relevance
  const valueBonus = valueRelevanceScore !== undefined ? valueRelevanceScore * 10 : 0;
  const qualityScore = Math.max(0, Math.min(100, Math.round(
    ctaCaptureRate * 35 +          // 35 points for CTA capture
    valuePropSalience * 25 +       // 25 points for heading + CTA attention
    (1 - distractorRatio) * 25 +   // 25 points for low distraction
    valueBonus +                   // up to 10 points for value-relevant attention
    5                              // 5 base points
  )));

  // Interpretation
  let interpretation: string;
  // headingShare, not valuePropSalience, decides whether the headings were
  // seen. valuePropSalience INCLUDES ctaSaliency, so it can never be low when
  // CTA capture is high -- the metric is structurally unable to detect "sees
  // the CTA, misses the heading". Measured on a real run: ctaCaptureRate and
  // valuePropSalience both 0.598 to three decimals, which happens exactly when
  // headingSaliency is zero, and the tool nonetheless reported "the persona
  // sees the value prop". It saw no heading at all.
  //
  // The prose then made the opposite mistake (B18, 2026-10-09): it said "the
  // value prop does not" capture attention, judged from headingShare, right
  // beside `valuePropSalience: 1` -- the field whose NAME is that claim. Both
  // numbers were right; the sentence borrowed one field's name for the other
  // field's measurement. So the verdicts below name what they measured --
  // headings, CTAs -- and never "the value prop", and the one branch where the
  // two fields diverge says how they relate.
  const pct = (n: number) => Math.round(n * 100) + "%";
  // The published 3dp value, so the prose quotes exactly what the field says.
  const r3 = (n: number) => String(Math.round(n * 1000) / 1000);
  if (ctaCaptureRate > 0.3 && headingShare > 0.15) {
    // "Design intent is working" removed: it is a claim about the whole design,
    // and this metric only knows whether the CTAs and heading drew top saliency.
    // Sitting beside an alignment verdict that said the opposite, it read as the
    // tool contradicting itself. Scoped to what it measures. (2026-08-02)
    interpretation = "Strong attention capture — the CTAs and the headings both drew top attention for this persona. This is about the conversion elements specifically; see interpretation.alignment for whether the overall distribution matches the design.";
  } else if (ctaCaptureRate > 0.3 && headingShare <= 0.02) {
    interpretation = "CTAs capture attention but headings do not — headings drew "
      + pct(headingShare) + " of top attention (headingShare). The persona is seeing where to click without reading the headings that say what it is for. "
      + "valuePropSalience (" + r3(valuePropSalience) + ") counts CTA and heading attention together, so here it is almost all CTA attention; headingShare is the heading-only figure.";
  } else if (valuePropSalience >= 0.7) {
    // Most top attention is on CTAs and headings together. The Moderate and
    // Mixed verdicts below said "split with other content" / "without strong
    // focus on conversion elements" here, contradicting valuePropSalience
    // (verifier sweep: 91 of 10,626 mixes, e.g. CTAs 0.9 + headings 0.1).
    // (2026-10-09)
    interpretation = "Attention concentrates on conversion elements — CTAs and headings together drew valuePropSalience "
      + r3(valuePropSalience) + " of top attention (CTAs " + pct(ctaCaptureRate) + ", headings " + pct(headingShare) + ").";
  } else if (ctaCaptureRate > 0.1 && valuePropSalience > 0.3) {
    interpretation = "Moderate attention quality — the persona partially sees key elements but attention is split with other content: "
      + pct(1 - valuePropSalience) + " of top attention went to elements that are neither CTAs nor headings.";
  } else if (distractorRatio > 0.5) {
    interpretation = "Poor attention quality — more than half of top attention goes to non-actionable elements; CTAs and headings together drew valuePropSalience "
      + r3(valuePropSalience) + " of it.";
  } else if (ctaCaptureRate < 0.05) {
    interpretation = "CTAs are invisible to this persona — none of the top saliency zones overlap with calls to action. Consider making CTAs larger, higher-contrast, or more prominently positioned.";
  } else {
    interpretation = "Mixed attention quality — attention is distributed across the page without strong focus on conversion elements (CTAs and headings together drew valuePropSalience "
      + r3(valuePropSalience) + ").";
  }

  return {
    ctaCaptureRate: Math.round(ctaCaptureRate * 1000) / 1000,
    valuePropSalience: Math.round(valuePropSalience * 1000) / 1000,
    // Separated out because valuePropSalience is heading+CTA and therefore
    // equals ctaCaptureRate exactly whenever this is 0 -- two metrics agreeing
    // to three decimals is that, not a coincidence.
    headingShare: Math.round(headingShare * 1000) / 1000,
    distractorRatio: Math.round(distractorRatio * 1000) / 1000,
    contentRatio: Math.round(contentRatio * 1000) / 1000,
    unaccountedRatio: Math.round(unaccountedRatio * 1000) / 1000,
    ratioNote: "Ratios are rounded to 3dp, which is enough to look like identity when it is not — compare `basis` before concluding two runs match. ctaCaptureRate + headingShare + distractorRatio + contentRatio sum to 1. contentRatio is the classifier's default bucket: attention on elements it did not recognise as CTA, heading, nav or decorative. A high contentRatio next to distractorRatio 0 means the distractor classifier is not recognising the distractors, not that there are none.",
    qualityScore,
    valueRelevanceScore,
    // Deduplicated by element. The loop above walks HOTSPOTS — grid cells — and
    // pushes one entry per cell that overlaps an element, so a large CTA
    // spanning ten cells appeared ten times ("Try Free — 5 Tests" at 1.0, 0.998,
    // 0.997 …). That filled all ten slots with one element, which made
    // ctaCaptureRate 1 and distractorRatio 0 trivially true and hid everything
    // else competing for attention. Saliency is SUMMED per element, which is the
    // meaningful figure: total attention the element drew across its cells.
    // (2026-07-29)
    // How wide the sample actually was. A ratio computed over two elements is
    // not the same claim as one computed over twenty, and the reader cannot tell
    // them apart from the ratio alone — 1.0 looks equally confident either way.
    sampledHotspots,
    sampledElements,
    // Six decimals: enough that two genuinely different measurements cannot
    // collide here as well, which is the whole point of publishing it.
    basis: {
      cta: round6(ctaSaliency),
      heading: round6(headingSaliency),
      navigation: round6(navSaliency),
      decorative: round6(decorativeSaliency),
      content: round6(contentSaliency),
      unaccounted: round6(unknownSaliency),
      total: round6(totalTopSaliency),
    },
    ...(sampledElements < MIN_DISTINCT_ELEMENTS ? {
      sampleNote: `Ratios computed over ${sampledElements} distinct element(s). `
        + "Below ~8 the buckets are coarse and a single element can dominate; "
        + "read the ratios as indicative, not as measurements.",
    } : {}),
    topAttentionTargets: dedupeTargetsByElement(targets).slice(0, 10),
    interpretation,
  };
}

/**
 * Extract element metadata from a Playwright page for attention quality analysis.
 * Returns elements with bounding boxes and type classifications.
 */
/**
 * Collect DOM elements ready for the attention model's semantic layer.
 *
 * `analyzeAttention` blends 35% bottom-up saliency with 65% DOM semantics — but
 * ONLY when it is given elements. Passed nothing, it silently falls back to the
 * visual layer alone, which is colour-contrast pop-out and not a model of where
 * a person looks. Two of the three production callers were doing exactly that.
 *
 * The devicePixelRatio scaling is the part that is easy to get wrong and fails
 * quietly: `getBoundingClientRect` returns CSS pixels while the screenshot is in
 * device pixels, so on any HiDPI capture an unscaled rect lands on the wrong
 * cells and the semantic layer degrades the map instead of improving it — with
 * no error. One implementation, so the scaling cannot drift between callers.
 *
 * Callers must screenshot with `fullPage: false`; these rects are
 * viewport-relative. (2026-07-29)
 */
export async function collectDomAttentionElements(page: unknown): Promise<Array<{
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  isCTA?: boolean;
  isHeading?: boolean;
  isNav?: boolean;
  isDecorative?: boolean;
}>> {
  const raw = await extractPageElementsForAttention(page);
  const dpr: number = await (page as { evaluate: (fn: () => number) => Promise<number> })
    .evaluate(() => window.devicePixelRatio)
    .catch(() => 1);
  return raw.map((el) => ({
    type: el.type,
    x: el.x * dpr,
    y: el.y * dpr,
    width: el.width * dpr,
    height: el.height * dpr,
    text: el.text,
    isCTA: el.isCTA,
    isHeading: el.isHeading,
    isNav: el.isNav,
    isDecorative: el.isDecorative,
  }));
}

export async function extractPageElementsForAttention(page: unknown): Promise<Array<{
  selector: string;
  text: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isHeading: boolean;
  isCTA: boolean;
  isNav: boolean;
  isDecorative: boolean;
  classList: string;
  /** Computed foreground colour, as the browser reports it. */
  color?: string;
  /** Nearest non-transparent background colour walking up the tree. */
  backgroundColor?: string;
  fontSize?: number;
  fontWeight?: number;
  /**
   * Per-word bounding boxes for this element's text, in viewport coordinates.
   *
   * A heading's relevance belongs on its glyphs, not on the whitespace its box
   * happens to span — a 400x44 heading box is mostly empty pixels, and painting
   * the whole rect puts heat where there is nothing to look at.
   */
  words?: Array<{ text: string; x: number; y: number; width: number; height: number }>;
}>> {
  const p = page as { evaluate: (fn: () => unknown) => Promise<unknown> };
  return p.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Only include elements whose bounding box intersects the viewport
    const inViewport = (rect: DOMRect): boolean =>
      rect.width > 0 && rect.height > 0 &&
      rect.bottom > 0 && rect.top < vh &&
      rect.right > 0 && rect.left < vw;

    // Colour and type size, so a downstream judge can tell a buried grey link
    // from a filled primary button. Background walks UP the tree: an element's
    // own background is transparent far more often than not, and reporting
    // "rgba(0,0,0,0)" as the background makes every contrast judgement wrong.
    // Per-word rects via Range over the element's text nodes. Range.getClientRects
    // returns one rect per line box, so a word wrapped across lines yields the
    // pieces rather than one box spanning both — which is what makes this usable
    // on real running text instead of only on single-line labels.
    const wordRects = (el: Element): Array<{ text: string; x: number; y: number; width: number; height: number }> => {
      const out: Array<{ text: string; x: number; y: number; width: number; height: number }> = [];
      try {
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const raw = node.textContent ?? "";
          if (!raw.trim()) continue;
          // Walk the string so offsets stay aligned with the ORIGINAL text —
          // splitting and re-joining loses the real character positions and the
          // rects drift word by word across the line.
          const re = /\S+/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(raw))) {
            if (out.length >= 300) return out; // a pathological page is not worth an unbounded walk
            const range = document.createRange();
            range.setStart(node, m.index);
            range.setEnd(node, m.index + m[0].length);
            for (const r of Array.from(range.getClientRects())) {
              if (r.width <= 0 || r.height <= 0) continue;
              out.push({ text: m[0], x: r.x, y: r.y, width: r.width, height: r.height });
            }
            range.detach?.();
          }
        }
      } catch { /* an element whose text cannot be ranged still returns its box */ }
      return out;
    };

    const styleOf = (el: Element): {
      color?: string; backgroundColor?: string; fontSize?: number; fontWeight?: number;
    } => {
      try {
        const cs = window.getComputedStyle(el as HTMLElement);
        let bg = cs.backgroundColor;
        let node: Element | null = el.parentElement;
        while (node && (!bg || bg === "transparent" || /rgba\([^)]*,\s*0\s*\)/.test(bg))) {
          bg = window.getComputedStyle(node as HTMLElement).backgroundColor;
          node = node.parentElement;
        }
        return {
          color: cs.color,
          backgroundColor: bg,
          fontSize: parseFloat(cs.fontSize) || undefined,
          fontWeight: parseInt(cs.fontWeight, 10) || undefined,
        };
      } catch { return {}; }
    };

    const elements: Array<{
      selector: string;
      words?: Array<{ text: string; x: number; y: number; width: number; height: number }>;
      color?: string;
      backgroundColor?: string;
      fontSize?: number;
      fontWeight?: number;
      text: string;
      type: string;
      x: number;
      y: number;
      width: number;
      height: number;
      isHeading: boolean;
      isCTA: boolean;
      isNav: boolean;
      isDecorative: boolean;
      classList: string;
    }> = [];

    // CTAs: buttons with action text, prominent links
    const ctaPatterns = /apply|sign.?up|register|get.?started|buy|order|subscribe|enroll|join|donate|download|try|start|begin|contact|request|book/i;

    // Headings — viewport only
    document.querySelectorAll("h1, h2, h3").forEach(el => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (!inViewport(rect)) return;
      const text = (el as HTMLElement).innerText?.trim() || "";
      elements.push({
        selector: el.tagName.toLowerCase(),
        text,
        type: "heading",
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        isHeading: true,
        isCTA: false,
        isNav: false,
        isDecorative: false,
        classList: (el as HTMLElement).className || "",
        ...styleOf(el),
        words: wordRects(el),
      });
    });

    // Buttons and links — viewport only
    document.querySelectorAll('a, button, [role="button"], input[type="submit"]').forEach(el => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (!inViewport(rect)) return;
      const text = (el as HTMLElement).innerText?.trim() || (el as HTMLInputElement).value || "";
      const isNav = !!(el.closest("nav") || el.closest('[role="navigation"]'));
      const isCTA = !isNav && (
        ctaPatterns.test(text) ||
        (el as HTMLElement).classList.toString().match(/cta|primary|action|hero/i) !== null ||
        (rect.width > 120 && rect.height > 36 && !isNav) // large standalone button
      );

      elements.push({
        selector: el.tagName.toLowerCase() + (text ? `[${text.slice(0, 20)}]` : ""),
        text,
        type: isCTA ? "cta" : isNav ? "navigation" : "link",
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        isHeading: false,
        isCTA: !!isCTA,
        isNav,
        isDecorative: false,
        classList: (el as HTMLElement).className || "",
        ...styleOf(el),
        words: wordRects(el),
      });
    });

    // Images (decorative) — viewport only
    // Body content, prices and form fields.
    //
    // The extractor emitted only headings, links/buttons and images, which made
    // ELEMENT_TYPE_WEIGHTS' `content`, `form`, `search`, `price` and `error`
    // entries unreachable — the semantic layer had literally nothing to say
    // about the text of a page. Visibly: a pricing page rendered heat on its
    // heading and nav while every plan card, price and feature line sat dead,
    // because none of them were extracted.
    const priceRe = /(?:[$£€¥]\s?\d|\d+\s?(?:USD|EUR|GBP)|\/\s?(?:mo|month|year|yr)\b)/i;
    const CONTENT_LIMIT = 120;
    let contentSeen = 0;
    document.querySelectorAll("p, li, td, th, dd, blockquote").forEach(el => {
      if (contentSeen >= CONTENT_LIMIT) return;
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (!inViewport(rect)) return;
      // Skip wrappers: a <li> containing a link is represented by the link.
      if (el.querySelector("a, button, input, p, li")) return;
      const text = (el as HTMLElement).innerText?.trim() || "";
      if (!text || text.length < 2) return;
      contentSeen++;
      elements.push({
        selector: el.tagName.toLowerCase(),
        text: text.slice(0, 200),
        type: priceRe.test(text) ? "price" : "content",
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        isHeading: false,
        isCTA: false,
        isNav: !!(el.closest("nav") || el.closest('[role="navigation"]')),
        isDecorative: false,
        classList: (el as HTMLElement).className || "",
        ...styleOf(el),
        words: wordRects(el),
      });
    });

    // Form fields — the `form` and `search` weights were equally unreachable.
    document.querySelectorAll("input:not([type=submit]):not([type=hidden]), textarea, select").forEach(el => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (!inViewport(rect)) return;
      const input = el as HTMLInputElement;
      const label = input.getAttribute("aria-label") || input.placeholder || input.name || "";
      const isSearch = input.type === "search" || /search/i.test(label);
      elements.push({
        selector: el.tagName.toLowerCase(),
        text: label.slice(0, 100),
        type: isSearch ? "search" : "form",
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        isHeading: false,
        isCTA: false,
        isNav: false,
        isDecorative: false,
        classList: (el as HTMLElement).className || "",
        ...styleOf(el),
      });
    });

    document.querySelectorAll("img, svg, video").forEach(el => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (!inViewport(rect)) return;
      if (rect.width < 50 || rect.height < 50) return; // skip tiny icons
      const alt = (el as HTMLImageElement).alt || "";
      const isDecorative = !alt || alt === "" || (el as HTMLElement).getAttribute("role") === "presentation";
      elements.push({
        selector: el.tagName.toLowerCase(),
        text: alt.slice(0, 50),
        type: "image",
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        isHeading: false,
        isCTA: false,
        isNav: false,
        isDecorative,
        classList: (el as HTMLElement).className || "",
        ...styleOf(el),
        words: wordRects(el),
      });
    });

    return elements;
  }) as Promise<Array<{
    selector: string; text: string; type: string;
    x: number; y: number; width: number; height: number;
    isHeading: boolean; isCTA: boolean; isNav: boolean; isDecorative: boolean;
    classList: string;
  }>>;
}
