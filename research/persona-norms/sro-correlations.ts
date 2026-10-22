/**
 * Trait-pair correlations computed from the Self-Regulation Ontology open data
 * (Eisenberg et al. 2018, 2019; 522 adults recruited on Mechanical Turk), for
 * the eight traits whose instruments that battery contains.
 *
 * These are NOT published coefficients. They are Pearson correlations computed
 * here from the published per-subject data, and README.md keeps them in their
 * own column so the paper can decide whether to use them.
 *
 * The indicator for each trait was fixed before any correlation was looked at,
 * and is listed in INDICATORS with its sign: +1 when a higher score means more
 * of the trait as src/trait-reference.ts defines it, -1 when it means less.
 * A composite is the mean of the members' z-scores, each signed first.
 *
 * Input: Data/Complete_02-16-2019/meaningful_variables_clean.csv from
 * github.com/IanEisenberg/Self_Regulation_Ontology (sha256 in sources.md).
 *
 *   bun research/persona-norms/sro-correlations.ts <path-to-csv>
 */
import { readFileSync } from "node:fs";

type Member = { column: string; sign: 1 | -1 };

/** "survey" = self-report questionnaire; "task" = behavioural measure (the battery files Kirby under tasks). */
export const INDICATORS: Record<string, { label: string; kind: "survey" | "task"; members: Member[] }> = {
  riskTolerance: {
    label: "DOSPERT risk-taking, mean z of the 5 domains",
    kind: "survey",
    members: ["ethical", "financial", "health_safety", "recreational", "social"]
      .map((d) => ({ column: `dospert_rt_survey.${d}`, sign: 1 as const })),
  },
  timeHorizon: {
    label: "Kirby MCQ log k, mean z of small and large rewards (high = discounts more)",
    kind: "task",
    members: [
      { column: "kirby.hyp_discount_rate_small.logTr", sign: 1 },
      { column: "kirby.hyp_discount_rate_large.logTr", sign: 1 },
    ],
  },
  metacognitivePlanning: {
    label: "BIS-11 Nonplanning, reversed",
    kind: "survey",
    members: [{ column: "bis11_survey.Nonplanning", sign: -1 }],
  },
  persistence: {
    label: "UPPS-P lack of perseverance, reversed",
    kind: "survey",
    members: [{ column: "upps_impulsivity_survey.lack_of_perseverance", sign: -1 }],
  },
  workingMemory: {
    label: "mean z of digit span backward, spatial span backward, keep-track, adaptive n-back load",
    kind: "task",
    members: [
      { column: "digit_span.reverse_span", sign: 1 },
      { column: "spatial_span.reverse_span", sign: 1 },
      { column: "keep_track.score", sign: 1 },
      { column: "adaptive_n_back.mean_load.logTr", sign: 1 },
    ],
  },
  sustainedAttention: {
    label: "Mindful Attention Awareness Scale (fewer everyday attention lapses = higher)",
    kind: "survey",
    members: [{ column: "mindful_attention_awareness_survey.mindfulness", sign: 1 }],
  },
  mentalModelFlexibility: {
    label: "3-by-2 cued task switching, task-switch cost in HDDM drift (dataset valence +1 = smaller cost)",
    kind: "task",
    members: [{ column: "threebytwo.task_switch_cost_hddm_drift", sign: 1 }],
  },
  curiosity: {
    label: "Zuckerman Sensation Seeking, experience-seeking subscale",
    kind: "survey",
    members: [{ column: "sensation_seeking_survey.experience_seeking", sign: 1 }],
  },
};

function parse(path: string): { header: string[]; rows: string[][] } {
  const lines = readFileSync(path, "utf8").trim().split(/\r?\n/);
  return { header: lines[0].split(","), rows: lines.slice(1).map((l) => l.split(",")) };
}

function column(header: string[], rows: string[][], name: string): (number | null)[] {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`column not found: ${name}`);
  return rows.map((r) => (r[i] === "" || r[i] === undefined ? null : Number(r[i])));
}

function zscores(xs: (number | null)[]): (number | null)[] {
  const v = xs.filter((x): x is number => x !== null && Number.isFinite(x));
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
  return xs.map((x) => (x === null || !Number.isFinite(x) ? null : (x - m) / sd));
}

/** Mean of the signed z-scores of the members a subject has; null if none. */
function composite(header: string[], rows: string[][], members: Member[]): (number | null)[] {
  const zs = members.map((m) => zscores(column(header, rows, m.column)).map((z) => (z === null ? null : z * m.sign)));
  return rows.map((_, i) => {
    const have = zs.map((z) => z[i]).filter((z): z is number => z !== null);
    return have.length ? have.reduce((a, b) => a + b, 0) / have.length : null;
  });
}

export function pearson(a: (number | null)[], b: (number | null)[]): { r: number; n: number } {
  const pairs: [number, number][] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== null && b[i] !== null) pairs.push([a[i]!, b[i]!]);
  const n = pairs.length;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return { r: sxy / Math.sqrt(sxx * syy), n };
}

/** 95% CI by Fisher z. */
export function fisherCI(r: number, n: number): [number, number] {
  const z = Math.atanh(r), se = 1 / Math.sqrt(n - 3);
  return [Math.tanh(z - 1.959964 * se), Math.tanh(z + 1.959964 * se)];
}

if (import.meta.main) {
  const path = process.argv[2];
  if (!path) { console.error("usage: bun sro-correlations.ts <meaningful_variables_clean.csv>"); process.exit(2); }
  const { header, rows } = parse(path);
  const traits = Object.keys(INDICATORS);
  const scores = Object.fromEntries(traits.map((t) => [t, composite(header, rows, INDICATORS[t].members)]));
  console.log(`subjects: ${rows.length}`);
  for (const t of traits) console.log(`- ${t}: ${INDICATORS[t].label}`);
  console.log("\n| traitA | traitB | r | 95% CI | n |\n|---|---|---|---|---|");
  const byKind: Record<string, number[]> = {};
  for (let i = 0; i < traits.length; i++) {
    for (let j = i + 1; j < traits.length; j++) {
      const { r, n } = pearson(scores[traits[i]], scores[traits[j]]);
      const [lo, hi] = fisherCI(r, n);
      console.log(`| ${traits[i]} | ${traits[j]} | ${r.toFixed(2)} | [${lo.toFixed(2)}, ${hi.toFixed(2)}] | ${n} |`);
      const kind = [INDICATORS[traits[i]].kind, INDICATORS[traits[j]].kind].sort().join("-");
      (byKind[kind] ??= []).push(Math.abs(r));
    }
  }
  console.log("\nmean |r| by measurement method of the pair:");
  for (const [kind, rs] of Object.entries(byKind)) {
    const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
    console.log(`- ${kind}: ${rs.length} pairs, mean |r| ${mean.toFixed(3)}, range ${Math.min(...rs).toFixed(3)}-${Math.max(...rs).toFixed(3)}`);
  }
}
