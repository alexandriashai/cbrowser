/**
 * How much nested prose inflates the reading word count of RawPageMeasurement
 * format 1. measurePageRaw tokenises every prose element in scope (p, li,
 * h1-h6, td, th, blockquote, figcaption longer than pageMetrics.prose.lengthAbove),
 * so a p inside an li, or a nested list, is read twice. This counts the same
 * words two ways on the sample pages: as measurePageRaw does, and counting each
 * prose element only when no ancestor is itself counted. For the Stage B design
 * note; read-only.
 *
 *   bun research/stage-b-nesting.ts
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SAMPLE } from "./stage-b-sample.js";

const MARK = "@@NEST@@";

function runOne(url: string): Promise<string> {
  return new Promise((resolve) => {
    const p = spawn("bun", [join(import.meta.dir, "stage-b-nesting.ts"), "--one", url], { env: process.env });
    let out = "";
    p.stdout.on("data", (d) => { out += d.toString(); });
    p.stderr.on("data", () => { /* page console noise */ });
    const killer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* gone */ } }, 90_000);
    p.on("close", () => {
      clearTimeout(killer);
      const line = out.split("\n").find((l) => l.startsWith(MARK));
      resolve(line ? line.slice(MARK.length) : `${url.padEnd(60)} timeout or no result`);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] !== "--one") {
    for (const s of SAMPLE) console.log(await runOne(s.url));
    process.exit(0);
  }
  const { CBrowser } = await import("../src/browser.js");
  const { param } = await import("../src/visual/model-provenance.js");
  const above = param("pageMetrics.prose.lengthAbove");
  for (const s of SAMPLE.filter((x) => x.url === args[1])) {
    const dataDir = mkdtempSync(join(tmpdir(), "stage-b-nest-"));
    const b = new CBrowser({ headless: true, viewportWidth: 1920, viewportHeight: 1080, dataDir });
    try {
      await b.navigate(s.url);
      const page = await b.getPage();
      const r = await page.evaluate((lengthAbove: number) => {
        const sel = "p, li, h1, h2, h3, h4, h5, h6, td, th, blockquote, figcaption";
        const out: Record<string, { all: number; outer: number }> = {};
        for (const full of [false, true]) {
          const vh = window.innerHeight, vw = window.innerWidth;
          const inScope = (el: Element) => {
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return false;
            return full || (rect.bottom > 0 && rect.top < vh && rect.right > 0 && rect.left < vw);
          };
          const counted = new Set<Element>();
          let all = 0, outer = 0;
          document.querySelectorAll(sel).forEach((el) => {
            if (!inScope(el)) return;
            const t = (el as HTMLElement).innerText?.trim();
            if (!t || t.length <= lengthAbove) return;
            counted.add(el);
            all += t.split(/\s+/).filter((w) => w.length > 0).length;
          });
          counted.forEach((el) => {
            let p = el.parentElement, nested = false;
            while (p) { if (counted.has(p)) { nested = true; break; } p = p.parentElement; }
            if (!nested) outer += ((el as HTMLElement).innerText || "").trim().split(/\s+/).filter((w) => w.length > 0).length;
          });
          out[full ? "full_page" : "viewport"] = { all, outer };
        }
        return out;
      }, above);
      const fmt = (x: { all: number; outer: number }) => `${x.all}/${x.outer} = ${(x.all / Math.max(1, x.outer)).toFixed(2)}`;
      console.log(`${MARK}${s.url.padEnd(60)} viewport ${fmt(r.viewport).padEnd(20)} full_page ${fmt(r.full_page)}`);
    } catch (e) {
      console.log(`${MARK}${s.url.padEnd(60)} error ${String((e as Error).message).slice(0, 80)}`);
    } finally {
      await b.close().catch(() => {});
      try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
  process.exit(0);
}

if (import.meta.main) main();
