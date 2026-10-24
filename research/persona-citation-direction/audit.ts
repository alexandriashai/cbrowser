/**
 * Every persona trait value the 2026-08-02 doc reconciliation (c912716)
 * changed, classified against the citation written beside it.
 *
 *   bun research/persona-citation-direction/audit.ts            # markdown table
 *   bun research/persona-citation-direction/audit.ts --summary  # counts only
 *
 * A value counts as cited when the provenance registry lists its citation
 * (VALUE_CITATIONS in src/visual/provenance/personas.ts): a named source
 * beside one value. Construct tags such as "(Bandura)" or "(Mark)" alone name
 * the trait's scale, not a finding about the persona, and do not count.
 *
 *   a  the change moved toward the direction the citation states
 *   b  the change moved against it: restored in 21.0 to the value the
 *      citation was written beside
 *   c  no cited direction: left as it is (its comment is fixed instead
 *      when the comment's level word contradicts the value)
 *
 * The cited verdicts are judgements, recorded in VERDICTS with the reason.
 * Everything else is read from git: the value before c912716, after it, at
 * dc79667 (the branch base) and in the working tree, and whether the comment
 * beside it changed on this branch.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extract } from "./extract.js";

const show = (rev: string) => execFileSync("git", ["show", `${rev}:src/personas.ts`], { encoding: "utf8", maxBuffer: 64 << 20 });
const before = extract(show("c912716^"));
const after = extract(show("c912716"));
const base = extract(show("dc79667"));
const now = extract(readFileSync(join(import.meta.dir, "..", "..", "src", "personas.ts"), "utf8"));

/** Judgements on the cited values c912716 changed. */
const VERDICTS: Record<string, { cls: "a" | "b" | "c"; why: string }> = {
  "low-vision-magnified.selfEfficacy": { cls: "b", why: "Brody et al. 2002: reduced vision, lower confidence. 0.45 -> 0.6 crossed to above neutral. Restored to 0.45." },
  "low-vision-magnified.satisficing": { cls: "b", why: "Pachur & Hertwig 2006: limited information access, more satisficing. 0.65 -> 0.4 crossed to the maximiser side. Restored to 0.65 earlier in 21.0." },
  "dyslexic-user.resilience": { cls: "b", why: "Kapur & Agrawal 2026: pulled down from 0.6, held at neutral. 0.5 -> 0.6 undid the stated pull. Restored to 0.5 earlier in 21.0." },
  "motor-impairment-tremor.interruptRecovery": { cls: "b", why: "Mark: motor issues make resumption harder, adaptation helps. 0.4 -> 0.6 crossed to easier than typical. Restored to 0.4." },
  "elderly-low-vision.workingMemory": { cls: "a", why: "Inhibitory-control decline limits WM. 0.35 -> 0.3 is further in the cited direction." },
  "motor-impairment-tremor.selfEfficacy": { cls: "c", why: "Lorig et al. 2001: users maintain 'moderate' efficacy. A level, not a direction; 0.6 is within a moderate reading, so it stays." },
  "elderly-user.proceduralFluency": { cls: "c", why: "Uncited when c912716 changed it (0.3 -> 0.4, 'Low - struggles'). Revised to 0.5 on 2026-08-03 with its own reasoning (Fisk et al. 2009), so it stays." },
};

const registry = readFileSync(join(import.meta.dir, "..", "..", "src", "visual", "provenance", "personas.ts"), "utf8");
const cited = new Set([...registry.matchAll(/"([a-z-]+\.[a-zA-Z]+)":\s*\{\s*cite/g)].map((m) => m[1]));

const rows: string[] = [];
const counts = { a: 0, b: 0, c: 0, commentFixed: 0 };
for (const persona of Object.keys(after)) {
  for (const trait of Object.keys(after[persona])) {
    const x = before[persona]?.[trait], y = after[persona][trait];
    if (!x || x.value === y.value) continue;
    const id = `${persona}.${trait}`;
    const verdict = VERDICTS[id] ?? (cited.has(id) ? undefined : { cls: "c" as const, why: "No citation beside it." });
    if (!verdict) throw new Error(`${id} is cited but has no verdict`);
    const b = base[persona][trait], n = now[persona][trait];
    const commentFixed = b.trailing !== n.trailing && b.value === n.value;
    counts[verdict.cls]++;
    if (commentFixed) counts.commentFixed++;
    rows.push(`| ${id} | ${x.value} | ${y.value} | ${b.value} | ${n.value} | ${cited.has(id) ? "yes" : "no"} | ${verdict.cls} | ${commentFixed ? "yes" : ""} | ${verdict.why} |`);
  }
}

if (process.argv.includes("--summary")) {
  console.log(JSON.stringify({ changed: rows.length, ...counts }));
} else {
  console.log("| persona.trait | before c912716 | c912716 | dc79667 | now | cited | class | comment fixed | reason |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) console.log(r);
  console.log(`\n${rows.length} values changed: a ${counts.a}, b ${counts.b}, c ${counts.c}; comments fixed on this branch among them: ${counts.commentFixed}`);
}
