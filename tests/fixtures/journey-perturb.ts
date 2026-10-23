/**
 * Which journey constants move nothing: the perturbation behind
 * tests/journey-no-dead-constants.test.ts.
 *
 * Every scenario and sweep of the journey golden is a unit. Each unit is run
 * once under provenance recording, to learn which ids it reads and what it
 * produces. Then, for every id, each unit that reads it is re-run with the
 * id's value scaled by 1.1 (and by 0.9 if 1.1 moves nothing, for constants
 * behind a min or max), and the id is live as soon as one unit's output
 * differs. Only the units that read an id are re-run, which keeps a few
 * hundred perturbations to seconds.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { startProvenanceRecording, stopProvenanceRecording, withParamOverridesAsync, MODEL_PROVENANCE } from "../../src/visual/model-provenance.js";
import { SCENARIOS, runScenario } from "./journey-scenarios.js";
import { SWEEPS } from "./journey-sweeps.js";

export interface Unit {
  name: string;
  run: () => Promise<unknown>;
}

export function journeyUnits(): Unit[] {
  return [
    ...SCENARIOS.map((s) => ({ name: `scenario:${s.name}`, run: () => runScenario(s) })),
    ...Object.entries(SWEEPS).map(([name, run]) => ({ name: `sweep:${name}`, run })),
  ];
}

export interface Baseline {
  output: Map<string, string>;
  reads: Map<string, Set<string>>;
}

export async function baseline(units: Unit[]): Promise<Baseline> {
  const output = new Map<string, string>();
  const reads = new Map<string, Set<string>>();
  for (const u of units) {
    startProvenanceRecording();
    try {
      output.set(u.name, JSON.stringify(await u.run()));
    } finally {
      reads.set(u.name, stopProvenanceRecording());
    }
  }
  return { output, reads };
}

/** Ids among `ids` that no unit's output depends on, at 1.1x or 0.9x. */
export async function deadJourneyConstants(ids: string[], units: Unit[], base: Baseline): Promise<string[]> {
  const dead: string[] = [];
  for (const id of ids) {
    const value = MODEL_PROVENANCE[id].value;
    const readers = units.filter((u) => base.reads.get(u.name)?.has(id));
    let live = false;
    for (const factor of [1.1, 0.9]) {
      for (const u of readers) {
        const out = JSON.stringify(await withParamOverridesAsync({ [id]: value * factor }, u.run));
        if (out !== base.output.get(u.name)) { live = true; break; }
      }
      if (live) break;
    }
    if (!live) dead.push(id);
  }
  return dead;
}
