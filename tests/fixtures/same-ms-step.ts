/**
 * Runs several product calls concurrently, with Date.now() frozen, in a fresh
 * process, and writes what each wrote to argv[3] as JSON. Used by
 * tests/same-ms-captures.test.ts.
 *
 * Frozen so that any file name built from the clock alone is the same for
 * every call, which is what two requests in one millisecond see. Playwright's
 * own timeouts do not read Date.now (measured: a 500 ms waitForSelector still
 * times out with it frozen). A process of its own, as visual-distance-step.ts
 * explains: under Bun a Playwright launch after sharp work in the same process
 * wedges, and these calls launch browsers.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const [kind, out, ...urls] = process.argv.slice(2);

const fingerprint = (path: string) =>
  existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : null;

async function run(): Promise<Array<{ url: string; path: string; sha256: string | null }>> {
  Date.now = () => 1_700_000_000_000;
  switch (kind) {
    case "screenshot": {
      const { CBrowser } = await import("../../src/browser.js");
      const browsers = urls.map(() => new CBrowser({ headless: true, viewportWidth: 640, viewportHeight: 400 }));
      try {
        await Promise.all(browsers.map(async (b, i) => { await b.launch(); await b.navigate(urls[i]); }));
        const paths = await Promise.all(browsers.map((b) => b.screenshot()));
        return paths.map((path, i) => ({ url: urls[i], path, sha256: fingerprint(path) }));
      } finally {
        await Promise.all(browsers.map((b) => b.close().catch(() => {})));
      }
    }
    case "baseline": {
      const { captureVisualBaseline } = await import("../../src/visual/regression.js");
      const shots = await Promise.all(urls.map((u) => captureVisualBaseline(u, "same-name")));
      return shots.map((b, i) => ({ url: urls[i], path: b.screenshotPath, sha256: fingerprint(b.screenshotPath) }));
    }
    case "crossdiff": {
      const { crossBrowserDiff } = await import("../../src/visual/cross-browser.js");
      const diffs = await Promise.all(urls.map((u) => crossBrowserDiff(u, ["chromium"])));
      return diffs.map((d, i) => {
        const path = d.screenshots.chromium ?? "";
        return { url: urls[i], path, sha256: fingerprint(path) };
      });
    }
    default:
      throw new Error(`unknown kind ${kind}`);
  }
}

run().then(
  (result) => {
    writeFileSync(`${out}.tmp`, JSON.stringify({ ok: true, result }));
    renameSync(`${out}.tmp`, out);
    process.exit(0);
  },
  (e) => {
    writeFileSync(`${out}.tmp`, JSON.stringify({ ok: false, error: String((e as Error)?.stack ?? e) }));
    renameSync(`${out}.tmp`, out);
    process.exit(1);
  },
);
