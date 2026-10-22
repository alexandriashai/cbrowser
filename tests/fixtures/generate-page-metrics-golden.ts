/**
 * Write tests/fixtures/page-metrics-golden.json from the extractor as it is.
 *
 * Run only to re-pin after an INTENDED change to extractPageMetrics, and say
 * in the commit what moved and why; the golden exists to catch the changes
 * nobody intended. It was first written on e9b4f03, before the extractor's
 * constants moved into the provenance registry.
 *
 *   bun tests/fixtures/generate-page-metrics-golden.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { measurePageMetricsFixtures } from "./page-metrics-measure.js";

const browser = await chromium.launch();
try {
  const golden = await measurePageMetricsFixtures(browser);
  const path = join(import.meta.dir, "page-metrics-golden.json");
  writeFileSync(path, JSON.stringify(golden, null, 2) + "\n");
  console.log(`wrote ${path}`);
} finally {
  await browser.close();
}
