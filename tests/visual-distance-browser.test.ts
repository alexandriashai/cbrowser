/**
 * v8 B26 + B36 with a real browser (2026-10-10).
 *
 * B26: the visual verdict is the raw sliced Wasserstein distance with lines
 *      calibrated on measured captures (see VISUAL_DISTANCE_THRESHOLDS). Before,
 *      a 0.2 byte-diff term on compressed PNG bytes floored every cross-engine
 *      score at ~0.80 and printed 1 - that as the "Wasserstein distance".
 * B36: a regression run wrote current-*.png beside the baselines in
 *      visual-baselines/screenshots and never deleted it.
 *
 * Each product call runs in its own process (tests/fixtures/visual-distance-step.ts
 * says why: under Bun, a Playwright launch after sharp work in the same process
 * wedges). This process serves the fixtures and launches nothing itself.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const { VISUAL_DISTANCE_THRESHOLDS } = await import("../src/visual/regression.js");

const DATA = mkdtempSync(join(tmpdir(), "cb-b26-browser-"));
const STEP = new URL("./fixtures/visual-distance-step.ts", import.meta.url).pathname;

const ROBOTS = "User-agent: *\nDisallow: /admin/\nDisallow: /private/\nAllow: /\n\nSitemap: https://example.com/sitemap.xml\n";
const styled = (moved: boolean) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Styled</title>
<style>
body{margin:0;font-family:Arial, Helvetica, "Liberation Sans", sans-serif;background:#f7f7f9;color:#222}
header{background:#1e3a8a;color:#fff;padding:24px 48px} header h1{margin:0;font-size:28px}
.hero{padding:64px 48px;background:#e0e7ff} .hero h2{font-size:44px;margin:0 0 16px}
.btn{display:inline-block;background:#dc2626;color:#fff;padding:14px 28px;border-radius:6px;font-size:18px;text-decoration:none}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;padding:48px}
.card{background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.15);padding:24px;min-height:180px}
${moved ? ".hero .btn{position:relative;left:600px;top:40px}" : ""}
</style></head><body><header><h1>Acme Widgets</h1></header>
<section class="hero"><h2>Ship faster with Acme</h2><p>Acme widgets help teams build reliable interfaces.</p><a class="btn" href="#">Start free trial</a></section>
<section class="cards"><div class="card"><h3>Fast</h3><p>Renders in under a millisecond.</p></div>
<div class="card"><h3>Accessible</h3><p>Keyboard operable and labelled.</p></div>
<div class="card"><h3>Typed</h3><p>First-class TypeScript types.</p></div></section></body></html>`;

let server: ReturnType<typeof Bun.serve>;
let base: string;
beforeAll(() => {
  server = Bun.serve({ port: 0, fetch: (req) => {
    const u = new URL(req.url);
    if (u.pathname === "/robots.txt") return new Response(ROBOTS, { headers: { "content-type": "text/plain" } });
    return new Response(styled(u.searchParams.get("v") === "moved"), { headers: { "content-type": "text/html; charset=utf-8" } });
  } });
  base = `http://localhost:${server.port}`;
});
afterAll(() => { server?.stop(true); });

let seq = 0;
/**
 * Run one step in a child process and read its JSON result from a file. The
 * file is polled rather than trusting the child's exit to be reaped promptly
 * (the same precaution as tests/cli-evaluate-keyboard.test.ts).
 */
async function step(name: string, args: string[], timeoutMs = 90000): Promise<any> {
  const n = seq++;
  const out = join(DATA, `step-${n}.json`);
  const proc = Bun.spawn([process.execPath, "run", STEP, name, out, ...args], {
    env: { ...process.env, CBROWSER_DATA_DIR: DATA },
    stdout: Bun.file(join(DATA, `step-${n}.out.log`)),
    stderr: Bun.file(join(DATA, `step-${n}.err.log`)),
  });
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(out) && Date.now() < deadline) await Bun.sleep(100);
  if (!existsSync(out)) {
    proc.kill();
    throw new Error(`step ${name} wrote no result in ${timeoutMs}ms; logs in ${DATA}/step-${n}.*.log`);
  }
  const result = JSON.parse(readFileSync(out, "utf8"));
  if (result.error) throw new Error(`step ${name} failed: ${result.error}`);
  return result;
}

const baselineShots = () => readdirSync(join(DATA, "visual-baselines", "screenshots")).sort();

describe("same engine (B26, B36)", () => {
  test("B36: a regression run leaves no new file beside the baselines; its capture is in the session screenshots dir", async () => {
    await step("baseline", [`${base}/`, "b26-home"]);
    const before = baselineShots();
    expect(before.length).toBe(1);

    const r = await step("regression", [`${base}/`, "b26-home"]);
    expect(baselineShots()).toEqual(before);
    expect(r.current.startsWith(r.screenshotsDir)).toBe(true);
    expect(existsSync(r.current)).toBe(true);
  }, 300000);

  test("visual regression: unchanged page passes at distance 0, a moved button fails", async () => {
    const same = await step("regression", [`${base}/`, "b26-home"]);
    expect(same.analysis.wassersteinDistance).toBe(0);
    expect(same.analysis.overallStatus).toBe("pass");
    expect(same.passed).toBe(true);

    const moved = await step("regression", [`${base}/?v=moved`, "b26-home"]);
    expect(moved.analysis.wassersteinDistance).toBeGreaterThanOrEqual(VISUAL_DISTANCE_THRESHOLDS.sameEngine.failAt);
    expect(moved.analysis.overallStatus).toBe("fail");
    expect(moved.analysis.changes[0]?.severity).toBe("breaking");
    expect(moved.passed).toBe(false);
  }, 300000);

  test("transport-map regression against a traditional baseline: unchanged passes, a moved button fails, no capture beside the baselines", async () => {
    const before = baselineShots();
    const same = await step("transport", [`${base}/`, "b26-home"]);
    expect(same.analysis.wassersteinDistance).toBe(0);
    expect(same.passed).toBe(true);
    const moved = await step("transport", [`${base}/?v=moved`, "b26-home"]);
    expect(moved.analysis.overallStatus).toBe("fail");
    expect(moved.passed).toBe(false);
    expect(baselineShots()).toEqual(before);
    expect(moved.current.startsWith(moved.screenshotsDir)).toBe(true);
  }, 300000);

  test("A/B: a moved button is 'similar', not 'identical', and carries the raw distance", async () => {
    const r = await step("ab", [`${base}/`, `${base}/?v=moved`]);
    expect(r.analysis.wassersteinDistance).toBeGreaterThan(0);
    expect(r.overallStatus).toBe("similar");
  }, 150000);
});

// Cross-engine assertions need firefox and webkit; skip only these, loudly.
const playwright = await import("playwright");
const missing = (["firefox", "webkit"] as const).filter((b) => {
  try { return !existsSync(playwright[b].executablePath()); } catch { return true; }
});
if (missing.length > 0) {
  console.warn(`[visual-distance-browser] SKIPPING cross-engine assertions: ${missing.join(", ")} not installed (bunx playwright install ${missing.join(" ")})`);
}

describe("across engines (B26)", () => {
  for (const [label, path] of [["plain text (robots.txt)", "/robots.txt"], ["a styled page", "/"]] as const) {
    test.skipIf(missing.length > 0)(`${label} passes across chromium, firefox and webkit, at its real distance`, async () => {
      const r = await step("cross", [`${base}${path}`], 150000);
      expect(r.comparisons.length).toBe(3);
      expect(r.overallStatus).toBe("consistent");
      for (const c of r.comparisons) {
        expect(c.analysis.overallStatus).toBe("pass");
        expect(c.analysis.changes).toEqual([]);
        // Measured 0.00003-0.00053 for these pages; the old floored score
        // printed ~0.2 here.
        expect(c.analysis.wassersteinDistance).toBeLessThan(VISUAL_DISTANCE_THRESHOLDS.crossEngine.warnAt);
        expect(c.analysis.similarityScore).toBeGreaterThan(0.99);
      }
    }, 200000);
  }
});
