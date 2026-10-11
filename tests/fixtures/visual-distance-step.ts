/**
 * Runs ONE visual call in a fresh process and writes its result as JSON to
 * argv[3]. Used by tests/visual-distance-browser.test.ts. (v8 B26, 2026-10-10)
 *
 * Why a process per call: under Bun, once sharp has decoded an image in a
 * process, later Playwright launches in that process wedge: the first command
 * on the new browser never answers and close() hangs, or launch() never
 * returns and chromium logs "Connection terminated while reading from pipe".
 * Measured 2026-10-10 (bun 1.3.8), rounds of 3 captures + 1 more launch, 15
 * rounds per run, with between the captures:
 *   computeWassersteinDistance ........ 7-9 rounds wedged or hung, 4 of 4 runs
 *   the same with sharp.cache(false) .. 7 and 8 (no help)
 *   a bare sharp decode ............... 7
 *   a 400 ms CPU busy-loop ............ 0
 *   nothing ........................... 0 of 35 rounds
 * Under node 22 (the production runtime, a tsc build) the
 * computeWassersteinDistance sequence wedged 0 of 15 rounds, so this is a
 * Bun runtime defect, not a product one.
 * One capture in a fresh process, analysed while the browser is still open,
 * closed cleanly 10 of 10. Every product call below launches all of its
 * browsers BEFORE its own analysis, so a fresh process per call never
 * launches after sharp.
 */
import { renameSync, writeFileSync } from "fs";

const [step, out, ...args] = process.argv.slice(2);

async function run(): Promise<unknown> {
  const { getPaths } = await import("../../src/config.js");
  const screenshotsDir = getPaths().screenshotsDir;
  switch (step) {
    case "baseline": {
      const R = await import("../../src/visual/regression.js");
      const b = await R.captureVisualBaseline(args[0], args[1]);
      return { screenshotPath: b.screenshotPath };
    }
    case "regression": {
      const R = await import("../../src/visual/regression.js");
      const r = await R.runVisualRegression(args[0], args[1]);
      return { passed: r.passed, analysis: r.analysis, current: r.currentScreenshotPath, screenshotsDir };
    }
    case "transport": {
      const R = await import("../../src/visual/regression.js");
      const r = await R.runRegressionWithTransportMap(args[0], args[1]);
      return { passed: r.passed, analysis: r.analysis, current: r.currentScreenshot, screenshotsDir };
    }
    case "ab": {
      const { runABComparison } = await import("../../src/visual/ab-comparison.js");
      const r = await runABComparison(args[0], args[1]);
      return { overallStatus: r.overallStatus, analysis: r.analysis };
    }
    case "cross": {
      const { runCrossBrowserTest } = await import("../../src/visual/cross-browser.js");
      const r = await runCrossBrowserTest(args[0], { browsers: ["chromium", "firefox", "webkit"] });
      return {
        overallStatus: r.overallStatus,
        comparisons: r.comparisons.map((c) => ({ browserA: c.browserA, browserB: c.browserB, analysis: c.analysis })),
      };
    }
    default:
      throw new Error(`unknown step ${step}`);
  }
}

let result: unknown;
try {
  result = await run();
} catch (e) {
  result = { error: e instanceof Error ? (e.stack ?? e.message) : String(e) };
}
// Rename into place so the parent never reads a half-written file.
writeFileSync(`${out}.tmp`, JSON.stringify(result));
renameSync(`${out}.tmp`, out);
process.exit(0);
