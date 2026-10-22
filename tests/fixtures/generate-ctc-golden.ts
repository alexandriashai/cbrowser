/**
 * Write tests/fixtures/ctc-golden-21.0.0.json from the CURRENT chain code.
 *
 * 21.0.0 replaced the 20.0.1 pin, which stays in the repo as history and is no
 * longer asserted: 21.0 changed the chain's numbers on purpose (see
 * research/ctc-21-deltas.md).
 *
 * Run once on the code whose behaviour is to be pinned; never re-run to make
 * a red ctc-golden.test.ts green without a deliberate decision that the
 * chain's numbers were meant to change.
 *
 *   bun tests/fixtures/generate-ctc-golden.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildGoldenMatrix } from "./ctc-golden-matrix.js";

const matrix = buildGoldenMatrix();

// JSON cannot carry NaN, Infinity or -0 faithfully; refuse to pin any of them.
let numbers = 0;
(function check(v: unknown, path: string) {
  if (typeof v === "number") {
    numbers++;
    if (!Number.isFinite(v)) throw new Error(`${path} is ${v}`);
    if (Object.is(v, -0)) throw new Error(`${path} is -0`);
  } else if (Array.isArray(v)) v.forEach((x, i) => check(x, `${path}[${i}]`));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) check(x, `${path}.${k}`);
})(matrix, "matrix");

const out = join(import.meta.dir, "ctc-golden-21.0.0.json");
writeFileSync(out, JSON.stringify({ pinnedOn: "21.0.0", ...matrix }));
console.log(`wrote ${out}: ${matrix.personas.length} personas x ${matrix.demands.length} demands x ${matrix.optionSets.length} option sets + ${Object.keys(matrix.scroll[matrix.personas[0]]).length} scroll inputs, ${numbers} numbers`);
