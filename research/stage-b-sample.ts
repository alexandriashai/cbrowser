/**
 * A small sample of raw page measurements (RawPageMeasurement format 1) for
 * the Stage B design note (research/stage-b-design.md): enough real pages to
 * see the orders of magnitude of the three law times before the ~500-page
 * reference crawl lands. Landing, article, form and non-Latin pages, measured
 * at viewport and full_page scope, 1920x1080, the same way the reference crawl
 * measures (measurePageGeometry once, then measurePageRaw per scope).
 *
 * Read-only: navigates and measures, never clicks or submits.
 *
 *   bun research/stage-b-sample.ts            writes research/stage-b-sample/raw.jsonl
 *   bun research/stage-b-sample.ts --one URL  one page, JSON on stdout
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const VIEWPORT = { width: 1920, height: 1080 };
const MARK = "@@STAGE_B@@";
const PAGE_CEILING_MS = 120_000;

export const SAMPLE: Array<{ url: string; type: string }> = [
  { url: "https://cbrowser.ai/", type: "landing" },
  { url: "https://stripe.com/", type: "landing" },
  { url: "https://github.com/", type: "landing" },
  { url: "https://www.python.org/", type: "landing" },
  { url: "https://www.mozilla.org/en-US/", type: "landing" },
  { url: "https://www.gov.uk/", type: "landing" },
  { url: "https://www.usa.gov/", type: "landing" },
  { url: "https://www.bbc.com/news", type: "landing" },
  { url: "https://www.w3.org/", type: "landing" },
  { url: "https://www.craigslist.org/about/sites", type: "landing" },
  { url: "https://www.wikipedia.org/", type: "landing" },
  { url: "https://en.wikipedia.org/wiki/Fitts%27s_law", type: "article" },
  { url: "https://en.wikipedia.org/wiki/Reading", type: "article" },
  { url: "https://developer.mozilla.org/en-US/docs/Web/HTML", type: "article" },
  { url: "https://www.w3.org/WAI/fundamentals/accessibility-intro/", type: "article" },
  { url: "https://www.gov.uk/browse/driving", type: "article" },
  { url: "https://www.python.org/about/", type: "article" },
  { url: "https://github.com/login", type: "form" },
  { url: "https://github.com/signup", type: "form" },
  { url: "https://www.usa.gov/agency-index", type: "list" },
  { url: "https://news.ycombinator.com/", type: "list" },
  { url: "https://zh.wikipedia.org/wiki/%E9%98%85%E8%AF%BB", type: "cjk" },
  { url: "https://ja.wikipedia.org/wiki/%E8%AA%AD%E6%9B%B8", type: "cjk" },
  { url: "https://ar.wikipedia.org/wiki/%D9%82%D8%B1%D8%A7%D8%A1%D8%A9", type: "abjad" },
];

async function measureOne(url: string): Promise<Record<string, unknown>> {
  const dataDir = mkdtempSync(join(tmpdir(), "stage-b-"));
  process.env.CBROWSER_DATA_DIR = dataDir;
  delete process.env.CBROWSER_PROXY;
  delete process.env.CBROWSER_PROXY_SERVER;
  const { CBrowser } = await import("../src/browser.js");
  const { measurePageRaw, measurePageGeometry } = await import("../src/visual/cognitive-transport.js");
  const b = new CBrowser({ headless: true, viewportWidth: VIEWPORT.width, viewportHeight: VIEWPORT.height, dataDir });
  try {
    await b.navigate(url);
    const page = await b.getPage();
    const finalUrl = page.url();
    const geometry = await measurePageGeometry(page);
    const viewport = await measurePageRaw(page, "viewport", geometry);
    const full_page = await measurePageRaw(page, "full_page", geometry);
    return { outcome: "measured", finalUrl, raw: { viewport, full_page } };
  } catch (e) {
    return { outcome: "error", detail: String((e as Error).message ?? e).split("\n")[0].slice(0, 200) };
  } finally {
    await b.close().catch(() => {});
    try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

function runOne(url: string): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const p = spawn("bun", [join(import.meta.dir, "stage-b-sample.ts"), "--one", url], { env: process.env });
    let out = "";
    p.stdout.on("data", (d) => { out += d.toString(); });
    p.stderr.on("data", () => { /* page console noise */ });
    const killer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* gone */ } }, PAGE_CEILING_MS);
    p.on("close", () => {
      clearTimeout(killer);
      const line = out.split("\n").find((l) => l.startsWith(MARK));
      if (!line) return resolve({ outcome: "error", detail: "no result" });
      try { resolve(JSON.parse(line.slice(MARK.length))); } catch { resolve({ outcome: "error", detail: "unparseable" }); }
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--one") {
    process.stdout.write(`${MARK}${JSON.stringify(await measureOne(args[1]))}\n`);
    process.exit(0);
  }
  const outDir = join(import.meta.dir, "stage-b-sample");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "raw.jsonl");
  writeFileSync(outPath, "");
  let next = 0;
  async function worker() {
    while (next < SAMPLE.length) {
      const s = SAMPLE[next++];
      const r = await runOne(s.url);
      writeFileSync(outPath, `${JSON.stringify({ ...s, ...r })}\n`, { flag: "a" });
      console.log(`${s.type.padEnd(8)} ${String(r.outcome).padEnd(9)} ${s.url}`);
    }
  }
  await Promise.all([worker(), worker()]);
  process.exit(0);
}

if (import.meta.main) main();
