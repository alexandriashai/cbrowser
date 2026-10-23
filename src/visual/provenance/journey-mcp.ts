/**
 * Provenance entries for the MCP-driven journey (src/mcp-tools/base/
 * cognitive-tools.ts): cognitive_journey_init, which hands the client model
 * a persona, abandonment thresholds and instructions, and
 * cognitive_journey_update_state, which applies the update rules and
 * decides abandonment. See ../model-provenance.ts for the statuses.
 *
 * In this flow the client model drives the browser and reports what
 * happened; these rules turn its report into state. They were set by hand,
 * so every rule entry is a `hypothesis`, and the instructions the init tool
 * serves say so and interpolate these values. Shared quantities (the trait
 * bands, the patience floor, the time limits, the default trait) are the
 * journey.* entries the autonomous engine reads.
 *
 * The MCP flow's confusion and frustration limits differ from the
 * autonomous engine's (journey.abandon.*): both are registered, neither has
 * a source, and the disagreement is reported rather than resolved here.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { ProvenanceEntry } from "../model-provenance.js";

const h = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `journeyMcp.${id}`, value, status: "hypothesis", source });
const d = (id: string, value: number, source: string): ProvenanceEntry => ({ id: `journeyMcp.${id}`, value, status: "definition", source });

const UPDATE = (what: string) =>
  `Hand-set ${what}. Per-step self-reports of patience, confusion, frustration and confidence from people working through tasks with scripted successes, failures, confusing steps and back-navigations would set it.`;
const ABANDON = (what: string) =>
  `Hand-set ${what}. The level reached in the step before people abandon a task, for people of measured trait level, would set it.`;
const VALUES =
  "Task behaviour (failure reactions, abandonment, confusion without social proof) across people of measured Schwartz values (PVQ), regressed on the value, would set it.";
const FAMILIARITY =
  "A ceiling on what may be simulated, not a measurement: it is set by how many pages this install has crawled. Agreement between simulated familiar-user paths and real returning users' paths, by crawl coverage, would set it.";

export const JOURNEY_MCP_PROVENANCE: ProvenanceEntry[] = [
  // ── Thresholds the init tool announces ──
  h("abandon.confusionLimit", 0.8, ABANDON("confusion above which the MCP-driven persona gives up (cognitive_journey_update_state scales it by conformity)")),
  h("abandon.confusionLimit.lowComprehension", 0.6, ABANDON("confusion limit cognitive_journey_init announces for a low-comprehension persona (cognitive_journey_update_state does not apply it)")),
  h("abandon.frustrationLimit", 0.85, ABANDON("frustration above which the MCP-driven persona gives up (cognitive_journey_update_state scales it by security)")),
  h("abandon.frustrationLimit.lowPatience", 0.7, ABANDON("frustration limit cognitive_journey_init announces for an impatient persona (cognitive_journey_update_state does not apply it)")),
  h("abandon.noProgressSteps", 10, ABANDON("number of steps without progress the init tool announces for a persona of ordinary persistence")),
  h("abandon.noProgressSteps.highPersistence", 15, ABANDON("number of steps without progress the init tool announces for a persistent persona")),
  h("abandon.loopVisits", 3, ABANDON("number of visits to the same page the init tool announces as a loop")),
  h("abandon.confusionSeconds", 30, ABANDON("seconds above the confusion limit the init instructions told the client model to wait before giving up (cognitive_journey_update_state counts two consecutive updates instead)")),

  // ── Site familiarity ceiling ──
  h("familiarity.claimFloor", 0.1, `Hand-set siteFamiliarity above which a persona with no crawled pages for the site is downgraded to a first visit. ${FAMILIARITY}`),
  h("familiarity.scaleFloor", 0.05, `Hand-set siteFamiliarity above which a crawled site's coverage caps it. ${FAMILIARITY}`),
  h("familiarity.fullCoveragePages", 20, `Hand-set number of crawled pages at which coverage is full (the cap is pages / 20). ${FAMILIARITY}`),
  h("familiarity.warnMargin", 0.1, `Hand-set drop from the requested familiarity above which the init tool warns that it was capped. ${FAMILIARITY}`),
  h("familiarity.expert", 0.8, `Hand-set effective familiarity at or above which the persona is treated as knowing the site (an expert). ${FAMILIARITY}`),
  h("familiarity.familiar", 0.5, `Hand-set effective familiarity at or above which the persona is familiar. ${FAMILIARITY}`),
  h("familiarity.vague", 0.1, `Hand-set effective familiarity at or above which the persona vaguely recalls the site. ${FAMILIARITY}`),

  // ── Labels in the served instructions ──
  h("label.lowComprehension", 0.3, "Hand-set comprehension below which the init instructions call the persona one who struggles with UI (the thresholds use journey.band.low.comprehension, 0.4; the two disagree). The percentile of the comprehension measure where people start needing help would set it."),
  h("valueLabel.high", 0.7, `Hand-set Schwartz value above which the init instructions describe the value as driving behaviour, and above which update_state picks the value's abandonment message. ${VALUES}`),
  h("valueLabel.low", 0.3, `Hand-set Schwartz value below which the init instructions describe its opposite. ${VALUES}`),

  // ── Persona values ──
  h("cmsValueDefault", 0.5, "Hand-set Schwartz or self-determination value given to a CMS custom persona that does not set it (the scale's midpoint). The population median on the value's instrument (PVQ for Schwartz values) would place it."),
  h("value.neutral", 0.5, `Hand-set Schwartz value at which a value modulates nothing (modulation = 1 + (value - 0.5) x gain), also the value assumed when the caller passes none. ${VALUES}`),
  h("value.modulationGain", 0.4, `Hand-set gain of a value's modulation (0.8x to 1.2x across the scale), the same for security, stimulation, achievement and conformity. ${VALUES}`),

  // ── The update rules ──
  h("update.patiencePerStep", 0.02, UPDATE("patience lost per step")),
  h("update.patiencePerFrustration", 0.05, UPDATE("extra patience lost per step per unit of frustration (scaled by achievement)")),
  h("update.confusionRecovery", 0.1, UPDATE("confusion recovered after a successful action (scaled by stimulation)")),
  h("update.frustrationRecovery", 0.05, UPDATE("frustration recovered after a successful action")),
  h("update.confidenceGain", 0.1, UPDATE("confidence gained when an action makes progress (scaled by achievement)")),
  h("update.frustrationPerFailure", 0.2, UPDATE("frustration added by a failed action (scaled by security)")),
  h("update.confusionPerConfusing", 0.15, UPDATE("confusion added by a confusing step per unit of low comprehension (scaled by conformity)")),
  h("update.confidenceLossOnBack", 0.15, UPDATE("confidence lost by going back (scaled by security)")),
  h("update.progressPerStep", 0.1, UPDATE("goal progress added by a step that makes progress")),
  h("update.secondsPerStep", 2, UPDATE("seconds added to timeElapsed per step (the tool does not see the clock)")),
  h("mood.defeatedFrustration", 0.8, UPDATE("frustration above which a persona of low persistence is defeated")),
  h("mood.defeatedPersistence", 0.5, UPDATE("persistence below which high frustration means defeat")),
  h("mood.frustrated", 0.7, UPDATE("frustration above which the mood is frustrated or confused, whichever is higher")),
  h("mood.confused", 0.5, UPDATE("confusion above which the mood is frustrated or confused, whichever is higher")),
  d("update.marginEpsilon", 1e-6, "Smallest divisor when a breach's margin is expressed relative to its threshold; a numerical guard against dividing by zero."),

  // ── The init tool's page check ──
  h("init.blankPageRetries", 2, "Hand-set number of times the init tool reloads a start page that renders blank (no title, no text) before handing it over. The share of blank first loads that recover on each reload, across real sites, would set it."),

  // ── Display ──
  d("init.influencePatterns", 5, "Number of influence patterns, ranked by susceptibility, the init tool lists for the persona; a display length."),
  d("display.rounding", 1000, "Rounding of the higher-order Schwartz values in the roster and init answers to 3 decimal places; a display choice."),
];
