/**
 * CBrowser MCP Tools - Values System Tools
 * Schwartz's 10 Universal Values, Self-Determination Theory, Maslow
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import { PERSONA_CATEGORIES } from "../../persona-questionnaire.js";
import { getAnyPersona, getCognitiveProfile } from "../../personas.js";
import { valueAxisCorrelationCounts, TRAIT_VALUE_CORRELATIONS } from "../../persona-questionnaire.js";
import { deriveValuesFromBigFive, bigFiveReachableAxes, BIG_FIVE_VALUE_LINKS } from "../../values/big-five-values.js";
import { widgetUri } from "../widget-kit.js";
import type { McpServer } from "../types.js";
import {
  getPersonaValues,
  PERSONA_VALUE_PROFILES,
  rankInfluencePatternsForProfile,
  INFLUENCE_PATTERNS,
} from "../../values/index.js";

/**
 * Register values system tools (7 tools)
 */
/**
 * The one place a persona's Schwartz values are resolved.
 *
 * Two tools answered this question and only one of them knew about the second
 * source: persona_lookup read the hand-authored registry AND the schwartzValues
 * block a custom persona carries on its own file, while persona_values_lookup
 * read the registry alone and hard-errored when it missed -- for a persona
 * whose values were sitting on disk. Same question, two answers, because there
 * were two implementations. (2026-07-31)
 */
/**
 * Optional caller-supplied persona data.
 *
 * The resolver finds a persona BY NAME, through the registry and the on-disk
 * store. A caller that already holds the row -- list_cognitive_personas reads
 * personas straight out of the CMS -- has nothing to gain from that lookup and
 * everything to lose: in a process whose data dir is not scoped to that
 * account, the name resolves to nothing and the resolver correctly reports
 * `source: "none"`. Correct about the lookup, and a lie about the persona,
 * which visibly has values right there in the payload.
 *
 * Passing the data in removes the question. Same arithmetic, same labels, no
 * dependency on whether this process can find the persona by name. (2026-08-01)
 */
export interface PersonaValuesOverride {
  values?: Record<string, number> | null;
  valuesDerivation?: { method?: string } | null;
  traits?: Record<string, number> | null;
}

export function resolvePersonaValues(name: string, override?: PersonaValuesOverride): {
  values: Record<string, number> | null;
  /**
   * WHICH ROUTE determined the numbers -- not where they are stored. The three
   * routes differ in how far they should be trusted, and that ordering is the
   * whole point of having them; a source field that cannot express it is not
   * reporting the fact a caller needs.
   */
  source: ValuesRoute;
  /** Where the numbers live. A different question from how they were decided. */
  storedIn?: "registry" | "persona";
  /** Axes whose Big Five link direction is a hypothesis rather than a finding. */
  hypothesisAxes?: string[];
  sdt?: Record<string, number>;
  sdtSource?: "derived" | "default";
  unpopulatedAxes?: string[];
  unpopulatedNote?: string;
  netZeroAxes?: string[];
  netZeroNote?: string;
  netNudge?: Record<string, number>;
  netNudgeNote?: string;
  /** The squash, named so it need not be recovered by fitting. */
  valueTransform?: string;
  higherOrderContamination?: Record<string, string>;
  higherOrder?: Record<string, number>;
  /** Pre-2026-08-01 imputed rollups, kept so the convention change is auditable. */
  higherOrderWithImputed?: Record<string, number>;
  /** The single imputation rule this payload follows, stated once. */
  imputationPolicy?: string;
  maslowLevel?: string;
  maslowSource?: "stored" | "derived";
  /** The arithmetic behind the winning level, same contract as pattern basis. */
  maslowBasis?: string;
  /** Gap to the runner-up. Small means the level is not a finding. */
  maslowMargin?: number;
  /** The runner-up scored and shown, so the margin can be checked not trusted. */
  maslowRunnerUp?: string;
  /** Bare argmax, for callers that need exactly one token even when it is a tie. */
  maslowTopScoring?: string;
  /** Present only when levels fall inside the tie threshold. */
  maslowTied?: string[];
  maslowTieSpan?: number;
  maslowStoredNote?: string;
  /** Per-level: how many of its inputs are unpopulated. Mirrors higherOrderContamination. */
  maslowContamination?: Record<string, string>;
  maslowCaveat?: string;
  /** Present on inferred routes: what the estimate rests on. */
  routeCaveat?: string;
} {
  const KEYS = ["selfDirection", "stimulation", "hedonism", "achievement", "power",
    "security", "conformity", "tradition", "benevolence", "universalism"] as const;
  const registry = getPersonaValues(name) as Record<string, number> | undefined;
  const looked = getAnyPersona(name) as unknown as Record<string, unknown> | undefined;
  // Supplied data wins over the lookup, and stands in for it entirely when the
  // lookup finds nothing.
  const persona = (override
    ? { ...(looked ?? {}),
        ...(override.valuesDerivation ? { valuesDerivation: override.valuesDerivation } : {}),
        ...(override.values ? { schwartzValues: override.values } : {}),
        ...(override.traits ? { cognitiveTraits: override.traits } : {}) }
    : looked) as Record<string, unknown> | undefined;
  const own = (override?.values ?? persona?.schwartzValues) as Record<string, number> | undefined;

  // Big Five, when the persona carries it and has no explicit values.
  //
  // Preferred over the cognitive-trait derivation because the published value
  // correlations are with the Big Five: this path crosses no gap the research
  // does not cover, and it reaches all thirteen axes rather than nine. Explicit
  // values still win — someone who wrote the numbers down meant them.
  const bigFive = persona?.bigFive as Record<string, number> | undefined;
  if (!registry && !own && bigFive && Object.keys(bigFive).length) {
    const d = deriveValuesFromBigFive(bigFive);
    const bfMaslow = scoreMaslow(d.values, d.values); // Big Five reaches all 13, nothing frozen
    const sdt: Record<string, number> = {};
    ["autonomyNeed", "competenceNeed", "relatednessNeed"].forEach((k) => {
      if (typeof d.values[k] === "number") sdt[k] = d.values[k];
    });
    const KEYS10 = ["selfDirection", "stimulation", "hedonism", "achievement", "power",
      "security", "conformity", "tradition", "benevolence", "universalism"];
    const ten: Record<string, number> = {};
    KEYS10.forEach((k) => { ten[k] = d.values[k]; });
    return {
      values: ten,
      // Which Big Five route this is, when the persona says. A bigFive block
      // with no derivation label is treated as stated, because that is what an
      // unlabelled one is: numbers someone put there.
      source: ((persona?.valuesDerivation as { method?: string } | undefined)?.method === "bigfive_inferred"
        ? "bigfive_inferred" : "big_five") as ValuesRoute,
      sdt,
      sdtSource: "derived",
      hypothesisAxes: d.hypothesisAxes,
      higherOrder: {
        openness: round3((ten.selfDirection + ten.stimulation) / 2),
        selfEnhancement: round3((ten.achievement + ten.power) / 2),
        conservation: round3((ten.security + ten.conformity + ten.tradition) / 3),
        selfTranscendence: round3((ten.benevolence + ten.universalism) / 2),
      },
      ...((persona?.valuesDerivation as { method?: string } | undefined)?.method === "bigfive_inferred"
        ? { routeCaveat: "These values come from a Big Five profile a model estimated by reading this persona's description, then the published trait-value correlations. The bridge is well supported; the five inputs are not measured and have no published calibration. Every axis is reachable on this route, which is why it is preferred over the cognitive-trait derivation — but a persona whose Big Five was answered rather than inferred is stronger evidence, and one whose values were stated directly is stronger still." }
        : {}),
      maslowLevel: bfMaslow[0].level,
      maslowSource: "derived",
      maslowBasis: bfMaslow[0].basis,
      maslowMargin: round3(bfMaslow[0].score - bfMaslow[1].score),
      ...(round3(bfMaslow[0].score - bfMaslow[1].score) < 0.05
        ? { maslowCaveat: `Margin over ${bfMaslow[1].level} is ${round3(bfMaslow[0].score - bfMaslow[1].score)}. Too close to read as a finding; treat the top two as tied.` }
        : {}),
    };
  }

  const src = registry ?? own;
  if (!src) return { values: null, source: "none" };

  const values: Record<string, number> = {};
  for (const k of KEYS) if (typeof src[k] === "number") values[k] = src[k];

  const sdt: Record<string, number> = {};
  ["autonomyNeed", "competenceNeed", "relatednessNeed"].forEach((k) => {
    const v = (src as Record<string, number>)[k];
    if (typeof v === "number") sdt[k] = v;
  });
  // Questionnaire-derived personas get SDT computed from answers; AI-generated
  // ones get a flat 0.5/0.5/0.5 that is a placeholder, not a measurement. They
  // were indistinguishable in the payload, so a caller could not tell a
  // derivation from a default -- and 0.5 across all three is the tell.
  const flat = Object.keys(sdt).length === 3 && Object.values(sdt).every((v) => v === 0.5);
  // ONE definition of "this route cannot reach that axis", shared by every
  // rollup, the Maslow scorer and the persuasion layer. Three sites computing
  // it separately is how they ended up with three conventions.
  const routeIsTraits = (persona?.valuesDerivation as { method?: string } | undefined)?.method === "traits";
  const hoFrozen = new Set(
    routeIsTraits
      ? ["selfDirection", "stimulation", "hedonism", "achievement", "power", "security",
         "conformity", "tradition", "benevolence", "universalism",
         "autonomyNeed", "competenceNeed", "relatednessNeed"]
          .filter((k) => !valueAxisCorrelationCounts()[k])
      : [],
  );
  // The four rollups. calculateHigherOrderValues has always existed and was
  // never called: both tools read values.openness and friends straight off the
  // base object, where those keys do not live, so every entry rendered its
  // formula string with an undefined value beside it. (2026-07-31)
  //
  // Three decimals, matching the primaries. At two, selfTranscendence for a
  // persona with benevolence 0.493 and universalism 0.500 is (0.4965) -> 0.5:
  // visually identical to an axis nothing ever touched, which is the exact
  // confusion the primaries went to three decimals to remove. The collision
  // was fixed one layer down and survived one layer up. (2026-08-01)
  //
  // Same exclusion convention as maslowLevel. These imputed until 2026-08-01,
  // which meant the Maslow caveat was arguing against a convention still
  // running three fields away in the same payload: selfEnhancement read
  // (0.698 + 0.5)/2 = 0.599 where the live-only value is 0.698, a 0.1 swing in
  // exactly the direction the caveat warns about, and enough to reorder the
  // four rollups for some personas. One convention, or the disclosure is
  // advice the payload does not take.
  const hoInputs: Record<string, string[]> = {
    openness: ["selfDirection", "stimulation"],
    selfEnhancement: ["achievement", "power"],
    conservation: ["security", "conformity", "tradition"],
    selfTranscendence: ["benevolence", "universalism"],
  };
  const higherOrder: Record<string, number> = {};
  const higherOrderWithImputed: Record<string, number> = {};
  for (const [roll, ins] of Object.entries(hoInputs)) {
    const live = ins.filter((k) => !hoFrozen.has(k));
    const use = live.length ? live : ins;
    higherOrder[roll] = round3(use.reduce((a, k) => a + values[k], 0) / use.length);
    higherOrderWithImputed[roll] = round3(ins.reduce((a, k) => a + values[k], 0) / ins.length);
  }

  const derivation = persona?.valuesDerivation as { method?: string } | undefined;
  //
  // ONE vocabulary. What is STORED and what is REPORTED were different
  // spellings of the same concept -- "bigfive"/"traits" on disk against
  // "big_five"/"cognitive_traits" in the payload -- so the same persona
  // answered differently depending on which surface you asked, and telling a
  // genuine route difference from a spelling difference required reading this
  // function. New writes use the ValuesRoute names; the old spellings still
  // read, because rewriting stored personas to fix a label is the overreach
  // this codebase keeps having to undo. (2026-08-01)
  const LEGACY_METHOD: Record<string, ValuesRoute> = {
    traits: "cognitive_traits",
    bigfive: "big_five",
  };
  const rawMethod = derivation?.method;
  const personaSource: ValuesRoute = rawMethod
    ? (LEGACY_METHOD[rawMethod] ?? (["stated", "big_five", "bigfive_inferred", "cognitive_traits"].includes(rawMethod)
        ? rawMethod as ValuesRoute
        : "stated"))
    : "stated";
  // Only the trait route is bounded by the trait correlation table. The Big
  // Five table reaches all thirteen axes, so applying the trait-derived
  // "unpopulated" logic to a big_five persona would report four axes as
  // unreachable that its own route reaches.
  const fromTraits = personaSource === "cognitive_traits";
  const fromDerivation = fromTraits || personaSource === "big_five";

  // Stored on registry profiles; absent from a persona-authored block, where
  // the closest honest answer is the level its own values point at. Which of
  // the two happened is reported rather than left to be guessed.
  const stored = (registry as unknown as { maslowLevel?: string })?.maslowLevel;
  //
  // This reported a bare category and nothing else, and the category was not
  // stable. For alexa-eden esteem scored 0.5990 and self-actualization 0.6015
  // -- a 0.0025 margin -- so moving the primaries to three decimals flipped
  // the answer with no other input changing. Worse, both of those scores are
  // half-composed of power 0.5 and universalism 0.5, which for a trait-derived
  // persona are UNPOPULATED BASELINES rather than measurements: the level was
  // being decided by axes the route cannot reach.
  //
  // It stays, because a rollup is useful, but it now carries its own arithmetic
  // the way the influence patterns do, and it says out loud when the winner is
  // inside the noise or is resting on axes with no signal. (2026-08-01)
  // Frozen = the route structurally cannot reach the axis (no correlation
  // entry), which is a property of the route rather than of this persona's
  // numbers. Deliberately NOT the `unpopulated` list below: that one also
  // requires the value to sit at baseline, so an axis with correlations whose
  // contributions happened to cancel would be misread as unreachable.
  const maslowScores = scoreMaslow(values, sdt, hoFrozen);
  //
  // A tie is carried BY the value, not beside it.
  //
  // The caveat said "treat the top two as tied" while `level` went on
  // returning one string, so a consumer reading `.level` and not `.caveat` got
  // a coin flip rendered as a determination -- the same defect as the two
  // kinds of 0.50, moved from a number to a category. The numeric case was
  // fixed by adding a decimal so the distinction lives in the value; the
  // categorical equivalent is a value that cannot be mistaken for a single
  // answer. `topScoring` keeps a bare argmax for callers that genuinely need
  // one token. (2026-08-01)
  const MASLOW_TIE = 0.05;
  // ONE rounded margin, used by the label, the tie test and the caveat.
  //
  // These were three separate quantities and they disagreed. Membership
  // filtered on the raw gap to the leader while the label printed the gap to
  // the RUNNER-UP, so a four-level set could be announced as "tied, margin
  // 0.008" with members 0.044 away. And the caveat tested the rounded margin
  // against the same 0.05 the raw filter used, so a persona whose gap rounded
  // up to exactly 0.05 was labelled tied by the string and denied by the prose.
  // A payload that contradicts itself is worse than either answer alone.
  // (2026-08-01)
  const maslowMargin = round3(maslowScores[0].score - maslowScores[1].score);
  const tiedWith = maslowScores.filter((c) =>
    round3(maslowScores[0].score - c.score) <= MASLOW_TIE);
  const maslowTied = tiedWith.map((c) => c.level);
  // The SPAN of the tie set, which is the number that describes the set. The
  // top-two margin describes only its first two members.
  const maslowTieSpan = round3(maslowScores[0].score - tiedWith[tiedWith.length - 1].score);
  const derivedMaslow = maslowTied.length > 1
    ? `${maslowTied.join(" | ")} (tied within ${maslowTieSpan}; next-best margin ${maslowMargin})`
    : maslowScores[0].level;
  // "Unreliable" is the union of two independent problems: too close to call,
  // and decided by an axis carrying no signal. Either one alone is enough.
  //
  // Contamination is reported the same way higherOrderValues reports it, and
  // for the same reason: a rollup over an unpopulated input is not a weaker
  // measurement, it is partly not a measurement. The first version of this
  // caveat blamed the MARGIN, which is the wrong diagnosis -- for alexa-eden
  // both candidates are half composed of a 0.5 placeholder, so a decisive gap
  // between them would not have made the winner a reading either. Composition
  // is reported independently of margin, and it is what the caveat leads with.
  // (2026-08-01)
  //
  // EVERY level reports its input count, including the clean ones. Reporting
  // only the contaminated levels encodes "clean" as an absent key, which is the
  // same shape as the defect this whole field exists to fix: a reader has to
  // know the field could have been there and infer meaning from its absence.
  // Two extra lines make both states explicit. (2026-08-01)
  const maslowContamination: Record<string, string> = {};
  for (const c of maslowScores) {
    maslowContamination[c.level] = c.frozenInputs.length
      ? `${c.frozenInputs.length} of ${c.inputsTotal} inputs unpopulated (${c.frozenInputs.join(", ")}); scored on the remaining ${c.inputsUsed}`
      : `0 of ${c.inputsTotal} inputs unpopulated`;
  }
  const winnerBad = maslowScores[0].frozenInputs;
  const tooClose = maslowMargin <= MASLOW_TIE;
  const anyFrozen = maslowScores.some((c) => c.frozenInputs.length > 0);
  const maslowCaveat = [
    winnerBad.length
      ? `${maslowScores[0].level} is scored on ${maslowScores[0].inputsUsed} of ${maslowScores[0].inputsTotal} inputs; ${winnerBad.join(", ")} is unpopulated on this route and was excluded rather than imputed.`
      : undefined,
    anyFrozen
      ? `Levels here rest on different numbers of inputs, so the ranking is thinner than it looks. Imputing 0.5 for a missing input would be worse than excluding it: imputation shrinks a contaminated level halfway toward the midpoint, downward when its live input is above 0.5 and upward when below, while leaving fully-populated levels untouched. That reorders the ranking rather than only compressing it.`
      : undefined,
    tooClose
      ? `Margin over ${maslowScores[1].level} is ${maslowMargin}, and ${maslowTied.length} level(s) sit within ${maslowTieSpan}. Too close to read as a finding; treat ${maslowTied.length > 2 ? "all " + maslowTied.length + " as tied" : "the top two as tied"}.`
      : undefined,
  ].filter(Boolean).join(" ") || undefined;

  // A persona's values can be authored by hand or written by the derivation.
  // Both live in the same field, and a value of exactly 0.5 means different
  // things in each case: a deliberate midpoint, or the untouched baseline the
  // derivation starts from. Anything treating values as evidence needs to be
  // able to tell them apart. (2026-07-31)
  //
  // Named for the ROUTE that determined the numbers, because that is the
  // question a caller has. "derived" answered a different one: it covered both
  // the Big Five derivation and the cognitive-trait derivation, which are the
  // two routes that differ most in how far you should trust them -- one is
  // published correlation, the other is our own bridge across a gap the
  // literature does not cover. A field that collapses them cannot express the
  // ordering the whole three-route account exists to make. (2026-08-01)

  // Axes the trait derivation cannot move.
  //
  // Four of the thirteen -- hedonism, power, universalism, relatednessNeed --
  // have no entry in the trait-value correlation table at all, so a derived
  // profile leaves them at the 0.5 baseline no matter what the traits say.
  // That is not a measurement of a midpoint, and anything running with
  // useValues:true will differentiate on the other nine only. selfTranscendence
  // is a rollup of benevolence and universalism, so it is pulled toward 0.5 by
  // an input that was never populated. Stated rather than left to be inferred
  // from a suspicious row of 0.5s. (2026-07-31)
  // Which table has links to an axis depends on WHICH ROUTE produced the
  // numbers. Using the trait counts on a Big Five route asks the wrong table:
  // power has no trait link, so a genuinely cancelled power reads as having no
  // inputs at all, and the cancellation goes unreported on the one route where
  // it is the only thing a 0.5 can mean.
  const traitCounts = valueAxisCorrelationCounts();
  const bigFiveAxes = new Set(bigFiveReachableAxes());
  const counts: Record<string, number> = fromTraits
    ? traitCounts
    : Object.fromEntries([...bigFiveAxes].map((a) => [a, 1]));
  const atBaseline = (k: string) => values[k] === 0.5 || sdt[k] === 0.5;
  const unpopulated = fromTraits
    ? Object.keys({ ...values, ...sdt }).filter((k) => atBaseline(k) && !counts[k])
    : [];
  // Axes that ARE derived but whose contributions cancelled. A different fact
  // from an axis with no correlations, and the two are indistinguishable by
  // value alone -- both read 0.5.
  // Which of the two zero-net shapes each axis is: a lone neutral input, or
  // opposing inputs that cancelled. Reported rather than assumed.
  const bigFiveScores = persona?.bigFive as Record<string, number> | undefined;
  const traitsForShape = getCognitiveProfile(persona as never)?.traits as
    unknown as Record<string, number> | undefined;
  const netZeroShape = (axis: string): string => {
    // The explanation has to name the table the ROUTE actually used. Reporting
    // "no contributing trait" for a Big Five persona describes a table that had
    // nothing to do with its numbers, which is the same defect as a formula
    // string that does not match its formula.
    if (!fromTraits) {
      const bfLinks = BIG_FIVE_VALUE_LINKS.filter((l) => l.value === axis);
      const live = bfLinks.filter((l) => typeof bigFiveScores?.[l.factor] === "number");
      if (live.length === 1) {
        return `${axis} has a single contributing factor (${live[0].factor}) sitting at the midpoint — nothing opposed it, nothing pushed it`;
      }
      if (live.length > 1) {
        // "Cancel" claims opposing non-zero forces. Two factors both sitting AT
        // the midpoint contribute exactly nothing each -- nothing opposed
        // anything, so calling it cancellation describes a mechanism that did
        // not occur. Same distinction as the single-input case, one level up.
        // (2026-08-01)
        const contributions = live.map((l) => ({
          l, c: ((bigFiveScores![l.factor] - 0.5) * l.weight * (l.direction === "positive" ? 1 : -1)),
        }));
        const label = live.map((l) => (l.direction === "positive" ? "+" : "-") + l.factor).join(", ");
        return contributions.every((x) => Math.abs(x.c) < 1e-9)
          ? `${axis} draws on ${live.length} factors (${label}), every one of which sits at the midpoint and so contributes nothing — not opposing forces, just no signal`
          : `${axis} draws on ${live.length} factors (${label}) whose contributions cancel`;
      }
      return `${axis} has no contributing Big Five factor on this persona`;
    }
    // Traits whose correlation table entry targets this axis AND which this
    // persona actually carries a number for.
    const contributing = Object.entries(TRAIT_VALUE_CORRELATIONS)
      .filter(([trait, c]) => c.affects.some((a) => a.value === axis)
        && typeof traitsForShape?.[trait] === "number")
      .map(([trait]) => trait);
    if (contributing.length === 1) {
      return `${axis} has a single contributing trait (${contributing[0]}) sitting at the midpoint — nothing opposed it, nothing pushed it`;
    }
    if (contributing.length > 1) {
      return `${axis} has ${contributing.length} contributing traits (${contributing.join(", ")}) whose pulls cancel`;
    }
    return `${axis} has no contributing trait carrying a number on this persona`;
  };
  // Cancellation is reportable on EVERY derived route, not just the trait one.
  //
  // Gating this on fromTraits left the Big Five routes with no way to tell a
  // cancelled axis from an untouched one -- the exact ambiguity netNudge exists
  // to remove, reappearing on a newer route. It shows up immediately in
  // practice: extraversion 0.33 and agreeableness 0.33 contribute +0.085 and
  // -0.085 to power, which cancel to exactly 0, and 0 is the code for "nothing
  // targets this axis". Nothing is UNPOPULATED on a Big Five route (all
  // thirteen are reachable), so a 0.5 there can only be a cancellation, and
  // saying so is strictly more information than silence. (2026-08-01)
  const netZero = fromDerivation
    ? Object.keys({ ...values, ...sdt }).filter((k) => atBaseline(k) && !!counts[k])
    : [];
  // The signed evidence behind each axis, recovered from the squash.
  //
  // Three decimals separate a derived 0.495 from an untouched 0.5, but only
  // for axes that happen to land off the midpoint. The nudge separates them
  // always: an axis nothing targets has exactly 0, an axis whose inputs
  // cancelled has a small non-zero. Beside every value rather than in a
  // separate list someone has to think to read.
  const netNudge = fromDerivation
    ? Object.fromEntries(Object.entries({ ...values, ...sdt }).map(([k, v]) => {
        // invert 0.5 + 0.5*tanh(raw) -> raw
        // Clamp MAGNITUDE, keep sign. Flooring at a positive epsilon turned
        // every below-midpoint axis into 0 — security and conformity, both
        // genuinely derived, reported the same "nothing targets it" as power.
        // The bug this field exists to prevent, reintroduced inside the field.
        const t = (v - 0.5) * 2;
        const clamped = Math.sign(t) * Math.min(0.999999, Math.abs(t));
        const raw = 0.5 * Math.log((1 + clamped) / (1 - clamped));
        return [k, Math.round(raw * 1000) / 1000];
      }))
    : undefined;

  return {
    values,
    source: personaSource,
    storedIn: registry ? "registry" : "persona",
    ...(unpopulated.length
      ? {
          unpopulatedAxes: unpopulated,
          unpopulatedNote: `These axes have no trait correlation defined, so the derivation leaves them at the 0.5 baseline regardless of the persona's traits. They carry no signal; a values-weighted run differentiates on the others only.`,
        }
      : {}),
    ...(netNudge ? { netNudge, netNudgeNote: "Signed evidence behind each axis before the squash. Exactly 0 means no trait targets it at all; a small non-zero means the contributions cancelled. Both can round to 0.5.",
        // Named, not left to be recovered by fitting. A reader checked the
        // disclosure by inferring this transform from thirteen (nudge, value)
        // pairs, which worked -- and is exactly the work the disclosure exists
        // to remove. (2026-08-01)
        valueTransform: "value = 0.5 + tanh(netNudge) / 2, applied per axis, then rounded to 3dp. Invertible: netNudge = atanh((value - 0.5) * 2)." } : {}),
    ...(netZero.length
      ? {
          netZeroAxes: netZero,
          // The note asserted OPPOSING FORCES ("pull them both ways"), which is
          // only one of the two ways an axis lands at zero net. The other, and
          // the more common one, is a single input sitting at exactly 0.5 —
          // chen-wei's benevolence has one link (trustCalibration 0.5) and its
          // autonomyNeed has one (selfEfficacy 0.5). Nothing cancelled; nothing
          // pushed. Stating a mechanism the numbers do not show is the same
          // defect as a value that overstates its own precision, so the note
          // now reports WHICH case each axis is. (2026-08-01)
          netZeroNote: `These axes ARE derived — the correlations for this route exist and were applied — but the net evidence lands at zero, so they sit at the baseline anyway. ${netZero.map(netZeroShape).join("; ")}. Reading 0.5 here means "measured, no net lean", which is not the same as the unpopulated axes above.`,
        }
      : {}),
    // Which rollups inherit a baseline input. openness can be clean while
    // selfTranscendence is half synthetic, and the composite hides that.
    ...(unpopulated.length
      ? (() => {
          const inputs: Record<string, string[]> = {
            openness: ["selfDirection", "stimulation"],
            selfEnhancement: ["achievement", "power"],
            conservation: ["security", "conformity", "tradition"],
            selfTranscendence: ["benevolence", "universalism"],
          };
          // Clean rollups say so rather than being omitted. Encoding "clean"
          // as a missing key makes the reader infer meaning from absence --
          // the same shape as the 0.5 ambiguity this field exists to remove.
          const contaminated: Record<string, string> = {};
          for (const [roll, ins] of Object.entries(inputs)) {
            const bad = ins.filter((i) => unpopulated.includes(i));
            contaminated[roll] = bad.length
              ? `${bad.length} of ${ins.length} inputs unpopulated (${bad.join(", ")})`
              : `0 of ${ins.length} inputs unpopulated`;
          }
          return { higherOrderContamination: contaminated };
        })()
      : {}),
    ...(Object.keys(sdt).length ? { sdt, sdtSource: flat ? "default" : "derived" } : {}),
    higherOrder,
    higherOrderWithImputed,
    imputationPolicy: hoFrozen.size
      ? `Axes this route cannot reach (${[...hoFrozen].join(", ")}) are EXCLUDED from every mean rather than imputed at 0.5. Imputing the midpoint shrinks a contaminated composite toward 0.5 while leaving a fully-populated one untouched, which reorders rankings instead of only widening them. Applies identically to higherOrder, maslowLevel and influencePatterns; the pre-change imputed figures are kept alongside each.`
      : "Nothing is imputed on this route: every axis is reachable.",
    maslowLevel: stored ?? derivedMaslow,
    maslowSource: stored ? "stored" : "derived",
    // Tie facts ship even when the level is STORED. A stored maslowLevel is an
    // authored answer and stays authoritative, but gating this whole block on
    // it meant the 21 builtin and accessibility personas never got any of it.
    // color-blind-deuteranopia is the proof: all ten Schwartz values and all
    // three SDT needs are exactly 0.5, so every level scores exactly 0.5 -- a
    // four-way tie at zero margin -- and it reported a bare "esteem". The one
    // persona where a single winner is guaranteed meaningless was the one
    // reporting it without qualification. (2026-08-01)
    maslowBasis: maslowScores[0].basis,
    maslowTopScoring: maslowScores[0].level,
    ...(maslowTied.length > 1 ? { maslowTied, maslowTieSpan } : {}),
    ...(stored && maslowTied.length > 1
      ? { maslowStoredNote: `maslowLevel here is an authored value. Computed from this persona's own numbers, ${maslowTied.length} levels tie within ${maslowTieSpan} (${maslowTied.join(", ")}), so the stored answer is a choice among them rather than a result.` }
      : {}),
    maslowRunnerUp: `${maslowScores[1].level} ${maslowScores[1].score} = ${maslowScores[1].basis}`,
    maslowMargin: maslowMargin,
    ...(Object.keys(maslowContamination).length ? { maslowContamination } : {}),
    ...(maslowCaveat ? { maslowCaveat } : {}),
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * The routes, ordered by how far the numbers should be trusted.
 *
 *   stated            someone answered; the measurement itself
 *   big_five          five scores a human supplied, then published correlations
 *   bigfive_inferred  five scores a model read out of a description, then the
 *                     same published correlations
 *   cognitive_traits  our own bridge from behaviour to motivation
 *
 * `bigfive_inferred` is deliberately NOT folded into `big_five`. Both use the
 * same well-supported bridge, but one starts from numbers a person gave and the
 * other from an estimate with no published calibration behind it. Collapsing
 * them would hide precisely the distinction this ordering exists to express --
 * the same mistake as the old `derived`, which meant two different things.
 *
 * It sits above cognitive_traits on COVERAGE, not on accuracy: it reaches all
 * thirteen axes where the trait route reaches nine. The two have their weakness
 * in different places -- weak inputs with a strong bridge, against stronger
 * inputs with a weak bridge -- and the payload says which you are holding.
 */
export type ValuesRoute = "stated" | "big_five" | "bigfive_inferred" | "cognitive_traits" | "none";

/**
 * Score the four Maslow levels from the value axes, worst-first sorted.
 *
 * Module-level because the Big Five branch used to return `maslowLevel:
 * "esteem"` as a literal -- the same answer for every persona that took that
 * route, derived from nothing. A shared scorer is the only way one path cannot
 * quietly disagree with the other. (2026-08-01)
 */
function scoreMaslow(
  values: Record<string, number>,
  sdt: Record<string, number>,
  frozen: Set<string> = new Set(),
) {
  const spec: Array<[string, string[]]> = [
    ["safety", ["security", "conformity"]],
    ["belonging", ["benevolence", "relatednessNeed"]],
    ["esteem", ["achievement", "power"]],
    ["self-actualization", ["selfDirection", "universalism"]],
  ];
  const pick = (k: string) => values[k] ?? sdt[k] ?? 0.5;
  return spec.map(([level, axes]) => {
    const live = axes.filter((k) => !frozen.has(k));
    const dead = axes.filter((k) => frozen.has(k));
    // Live inputs only. Averaging a live axis against a frozen 0.5 does not
    // merely add noise -- it shrinks that level halfway to the midpoint, DOWN
    // when the live input is above 0.5 and UP when it is below, while a level
    // with no frozen input is not shrunk at all. So contamination reorders the
    // ranking as well as compressing it, and the direction depends on the sign
    // of each level's live input. That is imputation-with-shrinkage presented
    // as a complete case. Dropping the imputed inputs removes the bias; it
    // cannot remove the fact that some levels rest on fewer inputs, which is
    // what `inputsUsed` is for. (2026-08-01)
    const denom = live.length || axes.length;
    const used = live.length ? live : axes;
    return {
      level,
      score: round3(used.reduce((a, k) => a + pick(k), 0) / denom),
      scoreWithImputed: round3(axes.reduce((a, k) => a + pick(k), 0) / axes.length),
      basis: `(${used.map((k) => `${k} ${pick(k)}`).join(" + ")}) / ${denom}`,
      inputsUsed: live.length,
      inputsTotal: axes.length,
      frozenInputs: dead,
      axes,
    };
  }).sort((a, b) => b.score - a.score);
}

/**
 * The persona_values_lookup payload, extracted from the tool handler so it can
 * be asserted directly.
 *
 * It lived inline, which meant the only way to see what the tool actually
 * returns was to run an MCP server -- and that is precisely why six resolver
 * fields shipped computed-but-undelivered in one day. A payload no test can
 * reach is a payload nothing checks. (2026-08-01)
 */
export async function buildValuesPayload(
  persona: string,
  includeInfluencePatterns = true,
): Promise<Record<string, unknown>> {
      const resolved = resolvePersonaValues(persona);
      // Keyed on "the resolver found something", not on an enumerated list of
      // sources. This read `source === "persona"` and then a later change
      // added "derived" for personas whose values the derivation wrote --
      // which is every regenerated custom persona -- so they stopped matching
      // and fell back into the not-found error the fallback exists to prevent.
      // A condition that enumerates the valid cases has to be revisited every
      // time a case is added; "not none" does not. (2026-07-31)
      const values = getPersonaValues(persona) ?? (resolved.source !== "none"
        ? (resolved.values as unknown as ReturnType<typeof getPersonaValues>)
        : undefined);

      if (!values) {
        const availablePersonas = PERSONA_VALUE_PROFILES.map(p => p.personaName);
        return {
                error: `No values profile found for persona: ${persona}`,
                availablePersonas,
                // These are the registry's OWN keys, and several differ from
                // the names every other tool advertises -- "adhd" here against
                // "cognitive-adhd" in empathy_audit, "motor-tremor" against
                // "motor-impairment-tremor". Both forms resolve, because
                // resolvePersonaName aliases them, but a list that teaches the
                // internal vocabulary sends a caller to a different name than
                // the rest of the surface uses. Say so rather than let the
                // list imply these are the canonical names. (2026-07-31)
                availablePersonasNote: "Registry keys. The longer names used by empathy_audit and the persona tools (cognitive-adhd, motor-impairment-tremor, low-vision-magnified) alias onto these and resolve fine. list_cognitive_personas is the authoritative roster.",
                note: "Values come from this registry, or from a schwartzValues block on a custom persona's own file — persona_lookup reads both. Custom personas can also have values added via the questionnaire.",
              };
      }

      const profile = PERSONA_VALUE_PROFILES.find(
        p => p.personaName.toLowerCase() === persona.toLowerCase()
      );

      let influencePatterns: Array<{pattern: string; susceptibility: number; description: string;
        basis?: { values: string[]; traits: string[]; weighting: string; formula: string;
          unpopulatedInputs: string; susceptibilityWithImputed?: number }}> | undefined;
      let influencePatternsTotal: number | undefined;
      let influencePatternsOmitted: string[] | undefined;
      let influencePatternsOmittedNote: string | undefined;
      if (includeInfluencePatterns) {
        // Traits passed through, so patterns sharing a value target set can
        // differ and a trait named for its pattern actually reaches it.
        const rankTraits = getCognitiveProfile(getAnyPersona(persona) as never)?.traits as
          unknown as Record<string, number> | undefined;
        const ranked = rankInfluencePatternsForProfile(values, rankTraits, new Set(resolved.unpopulatedAxes ?? []));
        // A silent top-7 cut made a mapped pattern look unmapped: social_proof
        // ranks 10th for some personas and simply vanished, with nothing in the
        // response distinguishing "scored low and truncated" from "this trait
        // never reaches the pattern list". The count and the omitted names are
        // reported now. (2026-07-31)
        influencePatternsTotal = ranked.length;
        influencePatternsOmitted = ranked.slice(7).map(r => r.pattern.name);
        // The cut is applied AFTER scoring, so the patterns the imputation
        // policy moves most are systematically the ones most likely to be
        // truncated away: scarcity and liking both target an axis this route
        // cannot reach, which drags them down the ranking, which pushes them
        // past the cut. On a low-achievement persona the two patterns whose
        // scores changed are precisely the two the caller never sees. Naming
        // them in the omission note is the difference between "these ranked
        // low" and "these ranked low partly because of a policy stated
        // elsewhere in this same payload". (2026-08-01)
        const omittedContaminated = ranked.slice(7)
          .filter(r => r.pattern.targetValues.some(v => (resolved.unpopulatedAxes ?? []).includes(v)))
          .map(r => r.pattern.name);
        if (omittedContaminated.length) {
          influencePatternsOmittedNote = `${omittedContaminated.join(", ")} ${omittedContaminated.length === 1 ? "was" : "were"} cut AND ${omittedContaminated.length === 1 ? "is" : "are"} scored on axes this route cannot reach. The ranking is computed before the cut, so a pattern held down by an unpopulated input is more likely to fall past it — the patterns the imputation policy affects most are the ones you are least likely to see.`;
        }
        // Each score's inputs, so a rank can be traced instead of guessed at.
        // commitment topping the list was untraceable from the output: the
        // reader could see 0.71 and had to reverse-engineer which values and
        // which traits produced it.
        // Unpopulated inputs marked INSIDE the basis, not only counted elsewhere.
        // The blog widget already badged these ("scarcity - 1 of 3 frozen") while
        // the API handed back a bare `power=0.5` that reads as a measured
        // midpoint. The web UI was more honest than the tool output, which is
        // backwards: the tool output is the one consumed programmatically, by a
        // reader with no page to look at. (2026-08-01)
        const frozen = new Set(resolved.unpopulatedAxes ?? []);
        const vAll = values as unknown as Record<string, number>;
        influencePatterns = ranked.slice(0, 7).map(r => {
          const badValues = r.pattern.targetValues.filter((v) => frozen.has(v));
          // The value mean is taken over DEFINED targets only, and the trait
          // half is dropped entirely when a pattern has no related traits or
          // none of them are on this persona (value-mappings.ts:609,618). So
          // the weighting is 60/40 or 100/0 depending on the pattern, and the
          // string said 60/40 unconditionally.
          const definedValues = r.pattern.targetValues.filter((v) => typeof vAll[v] === "number");
          const liveTraits = (r.pattern.relatedTraits ?? []).filter(
            (t) => typeof rankTraits?.[t.trait] === "number");
          const valueWeight = liveTraits.length ? 0.6 : 1;
          // The fraction of the FINAL score that is placeholder, not the
          // fraction of the value inputs. One frozen value out of three is a
          // third of the value mean, which is 0.6 x 1/3 = 20% of the score --
          // not 33%. A post about not overstating precision should not
          // overstate its own contamination. (2026-08-01)
          const syntheticShare = definedValues.length
            ? valueWeight * (badValues.length / definedValues.length)
            : 0;
          return {
          basis: {
            values: r.pattern.targetValues.map((v) =>
              `${v}=${vAll[v] ?? "n/a"}${frozen.has(v) ? " (unpopulated baseline, not a measurement)" : ""}`),
            traits: (r.pattern.relatedTraits ?? []).map(
              (t) => `${t.trait}=${rankTraits?.[t.trait] ?? "n/a"}${t.direction === "negative" ? " (inverted)" : ""}`),
            // "defined" was accurate about the CHECK and wrong about the
            // result: an axis this route cannot reach is defined -- it is
            // sitting at 0.5 -- so the mean silently included placeholders
            // while the string implied it did not. Says what it does now.
            formula: liveTraits.length
              ? "susceptibility = 0.6 * mean(target values that are populated on this route) + 0.4 * mean(related traits, inverted where direction is negative), rounded to 3dp"
              : "susceptibility = mean(target values that are populated on this route)",
            weighting: liveTraits.length
              ? "60% value mean, 40% trait mean"
              : "100% value mean (this pattern contributed no traits, so the 40% trait term is not applied)",
            unpopulatedInputs: badValues.length
              ? `${badValues.length} of ${definedValues.length} value inputs unpopulated (${badValues.join(", ")}) and EXCLUDED from the mean, so the score rests on ${definedValues.length - badValues.length}. Previously they were averaged in at 0.5, which at ${Math.round(valueWeight * 100)}% value weighting made ${Math.round(syntheticShare * 1000) / 10}% of the score placeholder.`
              : `0 of ${definedValues.length} value inputs unpopulated`,
            ...(r.susceptibilityWithImputed !== r.susceptibility
              ? { susceptibilityWithImputed: r.susceptibilityWithImputed }
              : {}),
          },
          pattern: r.pattern.name,
          susceptibility: r.susceptibility,
          description: r.pattern.description,
        };});
      }

      return {
              persona,
              rationale: profile?.rationale,
              schwartzValues: {
                selfDirection: { value: values.selfDirection, meaning: "Independent thought, creativity, freedom" },
                stimulation: { value: values.stimulation, meaning: "Excitement, novelty, challenge" },
                hedonism: { value: values.hedonism, meaning: "Pleasure, sensuous gratification" },
                achievement: { value: values.achievement, meaning: "Personal success through competence" },
                power: { value: values.power, meaning: "Social status, prestige, control" },
                security: { value: values.security, meaning: "Safety, harmony, stability" },
                conformity: { value: values.conformity, meaning: "Restraint of actions that harm others" },
                tradition: { value: values.tradition, meaning: "Respect for customs, heritage" },
                benevolence: { value: values.benevolence, meaning: "Welfare of close others" },
                universalism: { value: values.universalism, meaning: "Tolerance, social justice, environment" },
              },
              higherOrderValues: {
                openness: { value: resolved.higherOrder?.openness, meaning: "(selfDirection + stimulation) / 2" },
                selfEnhancement: { value: resolved.higherOrder?.selfEnhancement, meaning: "(achievement + power) / 2" },
                conservation: { value: resolved.higherOrder?.conservation, meaning: "(security + conformity + tradition) / 3" },
                selfTranscendence: { value: resolved.higherOrder?.selfTranscendence, meaning: "(benevolence + universalism) / 2" },
              },
              // From the resolver, which carries the SDT numbers whichever
              // source they came from. Reading them off `values` returned
              // undefined on the persona-file path -- the block rendered three
              // "meaning" strings with no values attached.
              // Values exist here but the persona does not, so nothing can
              // actually be RUN as it. Eight registry keys are in this state;
              // finding that out previously meant diffing this tool's output
              // against list_cognitive_personas by hand.
              ...(getAnyPersona(persona)
                ? {}
                : { runnable: false,
                    runnableNote: `A values profile exists for "${persona}" but no persona does, so it cannot be used by empathy_audit, cognitive_journey or any other tool that runs AS a persona. Values data without a persona behind it.` }),
              ...(resolved.sdtSource ? { selfDeterminationSource: resolved.sdtSource } : {}),
              selfDeterminationTheory: {
                autonomyNeed: { value: resolved.sdt?.autonomyNeed ?? values.autonomyNeed, meaning: "Need for choice and control" },
                competenceNeed: { value: resolved.sdt?.competenceNeed ?? values.competenceNeed, meaning: "Need to feel capable" },
                relatednessNeed: { value: resolved.sdt?.relatednessNeed ?? values.relatednessNeed, meaning: "Need for connection" },
              },
              maslowLevel: {
                level: resolved.maslowLevel ?? values.maslowLevel,
                source: resolved.maslowSource,
                meaning: (resolved.maslowLevel ?? values.maslowLevel) === "physiological" ? "Basic survival needs"
                  : (resolved.maslowLevel ?? values.maslowLevel) === "safety" ? "Security and stability"
                  : (resolved.maslowLevel ?? values.maslowLevel) === "belonging" ? "Social connection and love"
                  : (resolved.maslowLevel ?? values.maslowLevel) === "esteem" ? "Achievement and recognition"
                  : "Self-fulfillment and growth",
                // The level used to arrive bare. It is a rollup of four axes
                // that can be a coin-flip apart, so it now ships its own
                // arithmetic and says when the winner is not a finding.
                ...(resolved.maslowBasis ? { basis: resolved.maslowBasis } : {}),
                ...(resolved.maslowTopScoring ? { topScoring: resolved.maslowTopScoring } : {}),
                ...(resolved.maslowTied ? { tied: resolved.maslowTied } : {}),
                ...(resolved.maslowTieSpan !== undefined ? { tieSpan: resolved.maslowTieSpan } : {}),
                ...(resolved.maslowStoredNote ? { storedNote: resolved.maslowStoredNote } : {}),
                ...(resolved.maslowRunnerUp ? { runnerUp: resolved.maslowRunnerUp } : {}),
                ...(resolved.maslowMargin !== undefined ? { marginOverRunnerUp: resolved.maslowMargin } : {}),
                // Same contract as higherOrderContamination, and surfaced in the
                // same breath as the fields it qualifies -- adding it to the
                // resolver and forgetting it here is the exact defect this file
                // has now produced four times.
                ...(resolved.maslowContamination ? { contamination: resolved.maslowContamination } : {}),
                ...(resolved.maslowCaveat ? { caveat: resolved.maslowCaveat } : {}),
              },
              influencePatterns,
              ...(influencePatternsTotal !== undefined && influencePatternsOmitted?.length
                ? {
                    influencePatternsShown: influencePatterns?.length,
                    ...(influencePatternsOmittedNote ? { influencePatternsOmittedNote } : {}),
                    influencePatternsTotal,
                    influencePatternsOmitted,
                    influencePatternsNote: "Ranked by susceptibility and cut to the top seven. The omitted names ARE mapped and scored -- they ranked below the cut, which is different from a pattern the persona's traits never reach.",
                  }
                : {}),
              // The Schwartz block arrived unattributed here while
              // persona_lookup labelled the same values. Provenance should not
              // depend on which tool you asked.
              valuesSource: resolved.source,
              ...(resolved.routeCaveat ? { routeCaveat: resolved.routeCaveat } : {}),
              ...(resolved.higherOrderWithImputed ? { higherOrderWithImputed: resolved.higherOrderWithImputed } : {}),
              ...(resolved.imputationPolicy ? { imputationPolicy: resolved.imputationPolicy } : {}),
              ...(resolved.storedIn ? { valuesStoredIn: resolved.storedIn } : {}),
              ...(resolved.unpopulatedAxes
                ? { unpopulatedAxes: resolved.unpopulatedAxes, unpopulatedNote: resolved.unpopulatedNote }
                : {}),
              // Computed in the resolver since it was written and dropped on the
              // floor here, so the field built to disambiguate a 0.5 never
              // reached a single caller. Third producer with no consumer found
              // in this file. (2026-08-01)
              ...(resolved.netNudge
                ? { netNudge: resolved.netNudge, netNudgeNote: resolved.netNudgeNote,
                    ...(resolved.valueTransform ? { valueTransform: resolved.valueTransform } : {}) }
                : {}),
              ...(resolved.netZeroAxes
                ? { netZeroAxes: resolved.netZeroAxes, netZeroNote: resolved.netZeroNote }
                : {}),
              ...(resolved.higherOrderContamination
                ? { higherOrderContamination: resolved.higherOrderContamination }
                : {}),
              researchBasis: {
                schwartz: "Schwartz, S. H. (1992, 2012). Theory of Basic Human Values. DOI: 10.1016/S0065-2601(08)60281-6",
                sdt: "Deci, E. L., & Ryan, R. M. (1985, 2000). Self-Determination Theory. DOI: 10.1037/0003-066X.55.1.68",
                maslow: "Maslow, A. H. (1943). A Theory of Human Motivation. DOI: 10.1037/h0054346",
              },
            };
}

/** Test-facing alias; same function, named so its purpose is obvious in specs. */
export const buildValuesPayloadForTest = buildValuesPayload;

export function registerValuesTools(server: McpServer): void {
  server.registerTool("persona_values_list", {
    title: "List Persona Values",
    description: "List all Schwartz's 10 Universal Values with their meanings, plus higher-order values, Self-Determination Theory needs, and Maslow levels. Use this to understand the values framework before looking up specific personas.",
    inputSchema: {},
    annotations: {
      title: "List Persona Values",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              schwartzValues: {
                selfDirection: { range: "0-1", meaning: "Independent thought, creativity, freedom. High: values autonomy and exploration. Low: prefers guidance and structure." },
                stimulation: { range: "0-1", meaning: "Excitement, novelty, challenge. High: seeks variety and new experiences. Low: prefers routine and predictability." },
                hedonism: { range: "0-1", meaning: "Pleasure, sensuous gratification. High: prioritizes enjoyment and comfort. Low: prioritizes duty over pleasure." },
                achievement: { range: "0-1", meaning: "Personal success through competence. High: driven to excel and demonstrate capability. Low: content without external validation." },
                power: { range: "0-1", meaning: "Social status, prestige, control. High: seeks influence over others/resources. Low: indifferent to status hierarchies." },
                security: { range: "0-1", meaning: "Safety, harmony, stability. High: risk-averse, needs predictability. Low: comfortable with uncertainty." },
                conformity: { range: "0-1", meaning: "Restraint of actions that harm others. High: follows social rules carefully. Low: independent of social expectations." },
                tradition: { range: "0-1", meaning: "Respect for customs, heritage. High: values cultural/religious practices. Low: questions or ignores tradition." },
                benevolence: { range: "0-1", meaning: "Welfare of close others. High: prioritizes helping friends/family. Low: more self-focused." },
                universalism: { range: "0-1", meaning: "Tolerance, social justice, environment. High: cares about all people and nature. Low: focused on in-group." },
              },
              higherOrderValues: {
                openness: { formula: "(selfDirection + stimulation) / 2", meaning: "Openness to change - receptivity to new ideas and experiences" },
                selfEnhancement: { formula: "(achievement + power) / 2", meaning: "Focus on personal success and dominance" },
                conservation: { formula: "(security + conformity + tradition) / 3", meaning: "Preservation of stability and traditional practices" },
                selfTranscendence: { formula: "(benevolence + universalism) / 2", meaning: "Concern for welfare of others and nature" },
              },
              selfDeterminationTheory: {
                autonomyNeed: { range: "0-1", meaning: "Need for choice and self-direction (Deci & Ryan, 1985)" },
                competenceNeed: { range: "0-1", meaning: "Need to feel capable and effective" },
                relatednessNeed: { range: "0-1", meaning: "Need for connection and belonging" },
              },
              maslowLevels: [
                { level: "physiological", meaning: "Basic survival needs (food, water, shelter)" },
                { level: "safety", meaning: "Security, stability, freedom from fear" },
                { level: "belonging", meaning: "Social connection, love, acceptance" },
                { level: "esteem", meaning: "Achievement, recognition, respect" },
                { level: "self-actualization", meaning: "Self-fulfillment, reaching potential" },
              ],
              researchBasis: {
                schwartz: "Schwartz, S. H. (1992, 2012). Theory of Basic Human Values. DOI: 10.1016/S0065-2601(08)60281-6",
                sdt: "Deci, E. L., & Ryan, R. M. (1985, 2000). Self-Determination Theory. DOI: 10.1037/0003-066X.55.1.68",
                maslow: "Maslow, A. H. (1943). A Theory of Human Motivation. DOI: 10.1037/h0054346",
              },
              usage: "Use persona_values_lookup with a persona name to see these values for a specific persona, and list_influence_patterns to see which persuasion patterns work on which values.",
            }, null, 2),
          },
        ],
      };
    }
  );

  /**
   * Whole-persona lookup: traits, values, accessibility and demographics in one
   * call, and the payload the persona view renders.
   *
   * persona_values_lookup stays registered rather than being renamed into this.
   * It is a published tool name that connectors already call, and renaming it
   * in the same deploy as the replacement would break every existing caller --
   * the expand half of expand-contract. It can be retired once nothing calls it.
   */
  server.registerTool("persona_lookup", {
    title: "Look Up Persona",
    description: "Look up a complete persona: cognitive traits, Schwartz values, accessibility traits and demographics. Renders as an interactive profile with per-trait meters. Use this instead of persona_values_lookup when you want the whole persona rather than only its values.",
    inputSchema: {
      persona: z.string().describe("Persona name (e.g., 'first-timer', 'power-user', 'anxious-user')"),
    },
    annotations: {
      title: "Look Up Persona",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    _meta: { ui: { resourceUri: widgetUri("persona") } },
  }, async ({ persona }) => {
      const p = getAnyPersona(persona);
      if (!p) {
        return {
          content: [{ type: "text", text: JSON.stringify({
            error: `No persona found: ${persona}`,
            hint: "Call list_cognitive_personas for the authoritative roster.",
          }, null, 2) }],
          isError: true,
        };
      }
      const profile = getCognitiveProfile(p as never);
      const values = getPersonaValues((p as { name: string }).name);
      const rec = p as unknown as Record<string, unknown>;

      // Flattened to plain name->number maps because that is what the meters
      // read. The nested {value, meaning} shape values_lookup returns is fine
      // for prose and useless for a bar.
      const payload = {
        name: (p as { name: string }).name,
        description: (p as { description?: string }).description ?? "",
        demographics: rec.demographics ?? {},
        traits: profile?.traits ?? {},
        // One resolver, shared with persona_values_lookup, so the two tools
        // cannot answer the same question differently again.
        ...(() => {
          const r = resolvePersonaValues((p as { name: string }).name);
          if (r.source === "none") {
            return {
              values: null,
              valuesSource: "none",
              valuesNote: "No Schwartz values for this persona. They come from a hand-authored registry, or from a schwartzValues block on the persona itself; this persona has neither. Anything weighting by values is running on defaults for it.",
            };
          }
          return {
            values: r.values,
            valuesSource: r.source,
            ...(r.sdt ? { selfDeterminationNeeds: r.sdt, selfDeterminationSource: r.sdtSource } : {}),
            ...(r.unpopulatedAxes ? { unpopulatedAxes: r.unpopulatedAxes, unpopulatedNote: r.unpopulatedNote } : {}),
            ...(r.netZeroAxes ? { netZeroAxes: r.netZeroAxes, netZeroNote: r.netZeroNote } : {}),
            ...(r.higherOrderContamination ? { higherOrderContamination: r.higherOrderContamination } : {}),
            ...(r.higherOrder ? { higherOrderValues: r.higherOrder } : {}),
            ...(r.maslowLevel ? { maslowLevel: r.maslowLevel, maslowSource: r.maslowSource } : {}),
            ...(r.sdtSource === "default"
              ? { selfDeterminationNote: "All three needs read 0.5, which is the placeholder AI-generated personas ship with rather than a measurement. Questionnaire-derived personas carry computed values here." }
              : {}),
          };
        })(),
        ...(rec.accessibility_traits ? { accessibility_traits: rec.accessibility_traits } : {}),
        ...(rec.accessibilityTraits ? { accessibility_traits: rec.accessibilityTraits } : {}),
        ...(profile?.attentionPattern ? { attentionPattern: profile.attentionPattern } : {}),
        // NOT a truthiness guard. `decisionStyle` is null when the margin
        // between the top two styles is below threshold, and a truthiness
        // guard drops the key entirely on exactly that case -- so the payload
        // shipped `decisionStyleSource: "suppressed"` describing a field it
        // had omitted, and a consumer could not tell suppression from "never
        // computed". Emit the null. (2026-08-03, BUG-08)
        ...(profile && "decisionStyle" in profile ? { decisionStyle: profile.decisionStyle ?? null } : {}),
        ...(profile?.decisionStyleSuppressed ? {
          decisionStyleSuppressed: true,
          decisionStyleThreshold: profile.decisionStyleThreshold,
          decisionStyleNote: "The top two decision styles were separated by less than the threshold, so no label is claimed. decisionStyleMargin below is the gap that fell short.",
        } : {}),
        // Where those two came from. "default" means no rule matched and no
        // value was declared -- it is the initial literal, not a reading of
        // this persona, and it should not be acted on as one.
        ...(profile?.attentionPatternSource ? { attentionPatternSource: profile.attentionPatternSource } : {}),
        ...(profile?.decisionStyleSource ? { decisionStyleSource: profile.decisionStyleSource } : {}),
        // Gap to the runner-up style. Near zero means the traits do not favour
        // one, and the label is a weak reading rather than a finding.
        ...(profile?.decisionStyleMargin !== undefined
          ? { decisionStyleMargin: profile.decisionStyleMargin }
          : {}),
        // Author-declared summaries that disagree with the trait vector.
        //
        // A persona can declare attentionPattern "thorough" while carrying
        // attentionSpan 0.35, or a tech_level that its own traits contradict.
        // Both are legitimate authoring -- the declaration wins -- but shipping
        // the two side by side with nothing acknowledging the gap is what makes
        // a profile read as internally inconsistent. Named, not silently
        // reconciled: only the author knows which one is wrong.
        ...(() => {
          const notes: string[] = [];
          const t = (profile?.traits ?? {}) as unknown as Record<string, number>;
          const acc = (rec.accessibility_traits ?? rec.accessibilityTraits ?? {}) as Record<string, number>;
          const demo = (rec.demographics ?? {}) as Record<string, string>;
          const span = acc.attentionSpan;
          if (profile?.attentionPatternSource === "declared" &&
              profile.attentionPattern === "thorough" && typeof span === "number" && span < 0.5) {
            notes.push(`attentionPattern is declared "thorough" but accessibilityTraits.attentionSpan is ${span}. The declaration is used; the traits suggest skimming.`);
          }
          if (profile?.decisionStyleSource === "default") {
            notes.push(`decisionStyle "${profile.decisionStyle}" is the fallback: no rule matched this trait combination and the persona declares none. Do not read it as derived from the traits.`);
          }
          const tech = String(demo.tech_level ?? "");
          const transfer = t.transferLearning, fluency = t.proceduralFluency;
          if (tech && tech !== "expert" && typeof transfer === "number" && transfer >= 0.85 &&
              typeof fluency === "number" && fluency >= 0.65) {
            notes.push(`demographics.tech_level is "${tech}" while transferLearning is ${transfer} and proceduralFluency is ${fluency}. Demographics are set at creation and are not inferred from traits.`);
          }
          return notes.length ? { consistencyNotes: notes } : {};
        })(),
      };

      // JSON in the text block, no structuredContent and no outputSchema.
      //
      // An outputSchema of {} is not "unconstrained" -- the SDK expands it to
      // {type:object, properties:{}, additionalProperties:false}, a schema that
      // permits no properties at all, which every real payload then violates.
      // A schema loose enough to be correct here cannot be expressed as a Zod
      // raw shape anyway, since getStatusInfo-style payloads gain fields over
      // time.
      //
      // The view reads structuredContent when a host forwards it and falls back
      // to content[0].text otherwise, which is the shape Anthropic's own MCP
      // Apps example uses. Dropping both removes the validation failure without
      // costing the widget anything.
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  server.registerTool("persona_values_lookup", {
    title: "Lookup Persona Values",
    description: "Look up the values profile for a persona (Schwartz's 10 Universal Values, SDT needs, Maslow level). Values describe WHO the persona is at a deeper motivational level, informing influence susceptibility.",
    inputSchema: {
      persona: z.string().describe("Persona name (e.g., 'first-timer', 'power-user', 'anxious-user')"),
      includeInfluencePatterns: z.boolean().optional().default(true).describe("Include ranked influence patterns this persona is susceptible to"),
    },
    annotations: {
      title: "Lookup Persona Values",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ persona, includeInfluencePatterns }) => {
      // A name with no persona and no registered values returned a default
      // profile labelled source "none" -- refused instead. (2026-10-09)
      {
        const { getAnyPersona, suggestPersonaNames } = await import("../../personas.js");
        if (!getAnyPersona(persona) && resolvePersonaValues(persona).source === "none") {
          const suggestions = suggestPersonaNames(persona);
          return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({
            error: `Unknown persona "${persona}".${suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : ""} Run list_cognitive_personas for the roster.`,
            code: "unknown_persona", persona, suggestions,
          }, null, 2) }] };
        }
      }
      // Delegates so the shape is testable without an MCP server.
      const payload = await buildValuesPayload(persona, includeInfluencePatterns);
      return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
    }
  );

  server.registerTool("list_influence_patterns", {
    title: "List Influence Patterns",
    description: "List research-backed behavioral persuasion patterns (Cialdini, Kahneman) and which persona values correlate with susceptibility to each pattern.",
    inputSchema: {},
    annotations: {
      title: "List Influence Patterns",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async () => {
      const patterns = INFLUENCE_PATTERNS.map(pattern => ({
        name: pattern.name,
        description: pattern.description,
        researchBasis: pattern.researchBasis,
        targetValues: pattern.targetValues,
        mechanism: pattern.mechanism,
        examples: pattern.examples,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              count: patterns.length,
              patterns,
              usage: "Use persona_values_lookup to see which patterns a specific persona is susceptible to",
              note: "These patterns describe psychological influence mechanisms. Use ethically for UX optimization, not manipulation.",
            }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool("persona_questionnaire_get", {
    title: "Get Persona Questionnaire",
    description: "Get the persona questionnaire for building a custom persona. Returns research-backed questions that map to cognitive traits. Use comprehensive=true for all 26 traits, or leave false for the 8 core ones. v16.12.0: Now includes optional category question for disability-specific value safeguards.",
    inputSchema: {
      comprehensive: z.boolean().optional().default(false).describe("Include all 26 traits (true) or just the 8 core ones (false)"),
      traits: z.array(z.string()).optional().describe("Specific trait names to include (overrides comprehensive)"),
      includeCategory: z.boolean().optional().default(true).describe("Include category question for disability-aware values (v16.12.0)"),
    },
    annotations: {
      title: "Get Persona Questionnaire",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ comprehensive, traits, includeCategory }) => {
      const { generatePersonaQuestionnaire, formatForAskUserQuestion, CATEGORY_QUESTION } = await import("../../persona-questionnaire.js");

      const questions = generatePersonaQuestionnaire({
        comprehensive,
        traits: traits as Array<keyof import("../../types.js").CognitiveTraits> | undefined,
      });

      const formatted = formatForAskUserQuestion(questions);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              instructions: "Present these questions to the user one at a time or all at once. Each answer maps to a trait value. After collecting answers, use persona_questionnaire_build to create the persona. v16.12.0: Start with the category question to enable disability-aware value safeguards.",
              questionCount: questions.length,
              questions: formatted,
              rawQuestions: questions,
              ...(includeCategory && {
                categoryQuestion: CATEGORY_QUESTION,
                categoryInstructions: "Ask this FIRST to determine persona category. The category affects which values are applied and provides research-based safeguards for disability simulations.",
              }),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool("persona_questionnaire_build", {
    title: "Build Persona Questionnaire",
    description: "Build a custom persona from questionnaire answers with category-aware value safeguards. Answers should be a map of trait names to values (0-1). Missing traits will use intelligent defaults based on research correlations. v16.12.0: Optionally specify category for disability-specific value handling.",
    inputSchema: {
      name: z.string().describe("Name for the new persona"),
      description: z.string().describe("Description of the persona"),
      answers: z.record(z.string(), z.number()).describe("Map of trait names to values (0-1), e.g. {patience: 0.25, riskTolerance: 0.75}"),
      category: z.enum(PERSONA_CATEGORIES).optional().describe("Persona category for value safeguards (v16.12.0)"),
      valueOverrides: z.record(z.string(), z.number()).optional().describe("Override specific values (0-1) if different from category defaults"),
      save: z.boolean().optional().default(true).describe("Save the persona to disk for future use"),
    },
    annotations: {
      title: "Build Persona Questionnaire",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ name, description, answers, category, valueOverrides, save }) => {
      const {
        buildTraitsFromAnswers,
        getTraitLabel,
        getTraitBehaviors,
        detectPersonaCategory,
        buildValuesFromCategory,
        validateCategoryValues,
      } = await import("../../persona-questionnaire.js");
      const { createCognitivePersona, saveCustomPersona } = await import("../../personas.js");

      const detectedCategory = category || detectPersonaCategory(name, description);
      const traits = buildTraitsFromAnswers(answers);
      const categoryResult = buildValuesFromCategory(
        detectedCategory,
        valueOverrides as Record<string, number> | undefined,
        traits
      );
      const warnings = validateCategoryValues(detectedCategory, categoryResult.values);
      const persona = createCognitivePersona(name, description, traits, {});

      let savedPath: string | undefined;
      if (save) {
        savedPath = saveCustomPersona(persona);
      }

      const traitSummary: Record<string, { value: number; label: string; behaviors: string[] }> = {};
      for (const [trait, value] of Object.entries(traits)) {
        if (value !== 0.5) {
          traitSummary[trait] = {
            value: value as number,
            label: getTraitLabel(trait as keyof import("../../types.js").CognitiveTraits, value as number),
            behaviors: getTraitBehaviors(trait as keyof import("../../types.js").CognitiveTraits, value as number),
          };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              persona: {
                name: persona.name,
                description: persona.description,
                demographics: persona.demographics,
              },
              cognitiveTraits: traits,
              traitSummary,
              category: {
                detected: detectedCategory,
                strategy: categoryResult.valueStrategy,
                guidance: categoryResult.guidance,
              },
              values: categoryResult.values,
              researchBasis: categoryResult.researchBasis,
              ...(categoryResult.derivations && categoryResult.derivations.length > 0 && {
                valueDerivations: categoryResult.derivations,
              }),
              ...(warnings.length > 0 && { warnings }),
              savedPath,
              usage: `Use persona "${name}" with cognitive-journey or other commands`,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool("persona_trait_lookup", {
    title: "Lookup Persona Trait",
    description: "Look up behavioral descriptions for specific trait values. Useful for understanding what a trait value means in practice.",
    inputSchema: {
      trait: z.string().describe("Trait name (e.g., 'patience', 'riskTolerance')"),
      value: z.number().min(0).max(1).describe("Trait value (0-1)"),
    },
    // Declares the trait view. The bands are the finding; the JSON is a list
    // of five level objects a reader has to hold in their head to compare.
_meta: { ui: { resourceUri: "ui://cbrowser/trait-v2" } },
    annotations: {
      title: "Lookup Persona Trait",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ trait, value }) => {
      const { getTraitReference, getTraitLabel, getTraitBehaviors } = await import("../../persona-questionnaire.js");

      const reference = getTraitReference(trait as keyof import("../../types.js").CognitiveTraits);

      if (!reference) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Unknown trait: ${trait}`,
                availableTraits: [
                  "patience", "riskTolerance", "comprehension", "persistence", "curiosity",
                  "workingMemory", "readingTendency", "resilience", "selfEfficacy", "satisficing",
                  "trustCalibration", "interruptRecovery", "informationForaging", "changeBlindness",
                  "anchoringBias", "timeHorizon", "attributionStyle", "metacognitivePlanning",
                  "proceduralFluency", "transferLearning", "authoritySensitivity", "emotionalContagion",
                  "fearOfMissingOut", "socialProofSensitivity", "mentalModelFlexibility"
                ],
              }, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              trait: reference.name,
              description: reference.description,
              researchBasis: reference.researchBasis,
              value,
              label: getTraitLabel(trait as keyof import("../../types.js").CognitiveTraits, value),
              behaviors: getTraitBehaviors(trait as keyof import("../../types.js").CognitiveTraits, value),
              allLevels: reference.levels,
            }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool("persona_category_guidance", {
    title: "Persona Category Guidance",
    description: "Get guidance for value assignment based on persona category. (v16.12.0) Explains research basis for why cognitive, physical, sensory, and emotional disability categories require different value handling approaches.",
    inputSchema: {
      category: z.enum(PERSONA_CATEGORIES).describe("Persona category to get guidance for"),
    },
    annotations: {
      title: "Persona Category Guidance",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ category }) => {
      const { CATEGORY_VALUE_PRESETS, COGNITIVE_SUBTYPES } = await import("../../persona-questionnaire.js");

      const preset = CATEGORY_VALUE_PRESETS.find(p => p.category === category);

      if (!preset) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Unknown category: ${category}`,
                availableCategories: ["cognitive", "physical", "sensory", "emotional", "general"],
              }, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              category: preset.category,
              description: preset.description,
              valueStrategy: preset.valueStrategy,
              guidance: preset.guidance,
              defaultValues: preset.defaultValues,
              researchBasis: preset.researchBasis,
              ...(category === "cognitive" && {
                subtypes: Object.entries(COGNITIVE_SUBTYPES).map(([key, subtype]) => ({
                  name: key,
                  values: subtype.values,
                  researchBasis: subtype.researchBasis,
                })),
              }),
            }, null, 2),
          },
        ],
      };
    }
  );
}
