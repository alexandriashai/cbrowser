/**
 * Write the journey goldens from the CURRENT journey code.
 *
 *   bun tests/fixtures/generate-journey-golden.ts --browser  real browser   -> golden-journey-browser.json
 *
 * Run once on the code whose behaviour is to be pinned; never re-run to make
 * a red journey-golden test green without a deliberate decision that the
 * journey's numbers were meant to change, and say so in the commit.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-journey-golden-data-"));
process.env.CBROWSER_ARTIFACT_DIR = mkdtempSync(join(tmpdir(), "cb-journey-golden-art-"));
delete process.env.ANTHROPIC_API_KEY;

/** JSON cannot carry NaN, Infinity or -0 faithfully; refuse to pin any of them. */
export function countPinnable(v: unknown, path = "golden"): number {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`${path} is ${v}`);
    if (Object.is(v, -0)) throw new Error(`${path} is -0`);
    return 1;
  }
  if (Array.isArray(v)) return v.reduce((n: number, x, i) => n + countPinnable(x, `${path}[${i}]`), 0);
  if (v && typeof v === "object") return Object.entries(v).reduce((n, [k, x]) => n + countPinnable(x, `${path}.${k}`), 0);
  return 0;
}

if (import.meta.main) {
  if (process.argv.includes("--browser")) {
    const { serveFixtures } = await import("./serve-fixtures.js");
    const { BROWSER_SCENARIOS, runBrowserScenario } = await import("./journey-browser-scenarios.js");
    const server = await serveFixtures();
    try {
      const runs: Record<string, unknown> = {};
      for (const s of BROWSER_SCENARIOS) runs[s.name] = await runBrowserScenario(s, server.base);
      const out = join(import.meta.dir, "golden-journey-browser.json");
      writeFileSync(out, JSON.stringify({ runs }, null, 1));
      console.log(`wrote ${out}: ${BROWSER_SCENARIOS.length} journeys, ${countPinnable(runs)} numbers`);
    } finally {
      await server.close();
    }
  }
  process.exit(0);
}
