/**
 * Measure what each CIF 21 fix moved across the golden CIF inputs.
 *
 * Every tree is a checkout of src/ at one commit (git archive). All trees
 * score the SAME inputs, the fixtures in this checkout's tests/golden/fixtures,
 * so only the scorer differs between them.
 *
 *   bun research/cif-21-deltas.ts <label>=<root>[+audited] [...]
 *
 * "+audited" scores that tree with every fixture's missing barrier list
 * replaced by [] (an audit that found nothing). Against the plain tree it
 * isolates what reading an undefined barrier list as "not audited" moved,
 * from the rest of the missing-input rule.
 *
 * Prints one table per tree (composite, grade, certification, the five
 * category scores and how many components were measured), then one table per
 * consecutive pair of trees with the change in each, and the components whose
 * score moved.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Component = { score: number; details: string; measured?: boolean };
type Category = { score: number; components: Record<string, Component> };
type Score = {
  composite: number;
  grade: string;
  certification: string;
  motor: Category;
  visual: Category;
  cognitive: Category;
  sensory: Category;
  navigation: Category;
};

const CATEGORIES = ["motor", "visual", "cognitive", "sensory", "navigation"] as const;
const fixturesDir = join(import.meta.dir, "..", "tests", "golden", "fixtures");
const fixtures = readdirSync(fixturesDir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => ({ name: f.replace(/\.json$/, ""), input: JSON.parse(readFileSync(join(fixturesDir, f), "utf8")) }));

async function score(root: string, audited: boolean): Promise<Record<string, Score>> {
  const m = await import(join(root, "src", "cif-score.ts"));
  return Object.fromEntries(fixtures.map((f) => [
    f.name,
    m.computeCIFScore(audited ? { ...f.input, barriers: f.input.barriers ?? [] } : f.input) as Score,
  ]));
}

const measuredCount = (s: Score) => {
  let n = 0, all = 0;
  for (const c of CATEGORIES) for (const comp of Object.values(s[c].components)) { all++; if (comp.measured !== false) n++; }
  return `${n}/${all}`;
};
const signed = (d: number) => (d > 0 ? `+${d}` : `${d}`);

const trees: Array<{ label: string; scores: Record<string, Score> }> = [];
for (const arg of process.argv.slice(2)) {
  const [label, spec] = arg.split("=");
  const audited = spec.endsWith("+audited");
  trees.push({ label, scores: await score(resolve(audited ? spec.slice(0, -"+audited".length) : spec), audited) });
}

for (const t of trees) {
  console.log(`\n### ${t.label}\n`);
  console.log("| fixture | composite | grade | certification | motor | visual | cognitive | sensory | navigation | components measured |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const f of fixtures) {
    const s = t.scores[f.name];
    console.log(`| ${f.name} | ${s.composite} | ${s.grade} | ${s.certification} | ${CATEGORIES.map((c) => s[c].score).join(" | ")} | ${measuredCount(s)} |`);
  }
}

for (let i = 1; i < trees.length; i++) {
  const a = trees[i - 1], b = trees[i];
  console.log(`\n### ${a.label} -> ${b.label}\n`);
  console.log("| fixture | composite | grade | certification | motor | visual | cognitive | sensory | navigation |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  const moved: string[] = [];
  for (const f of fixtures) {
    const x = a.scores[f.name], y = b.scores[f.name];
    const g = x.grade === y.grade ? y.grade : `${x.grade} -> ${y.grade}`;
    const c = x.certification === y.certification ? y.certification : `${x.certification} -> ${y.certification}`;
    console.log(`| ${f.name} | ${x.composite} -> ${y.composite} (${signed(y.composite - x.composite)}) | ${g} | ${c} | ${CATEGORIES.map((k) => signed(y[k].score - x[k].score)).join(" | ")} |`);
    for (const k of CATEGORIES) {
      for (const [name, comp] of Object.entries(y[k].components)) {
        const before = x[k].components[name];
        if (before.score !== comp.score) moved.push(`${f.name} ${k}.${name} ${before.score} -> ${comp.score}`);
      }
    }
  }
  console.log(`\nComponent scores that moved (${moved.length}):\n`);
  for (const m of moved) console.log(`- ${m}`);
}
