/**
 * v8 report P3 fixes that need a real browser. (2026-10-10)
 *
 * B46: responsive_test with one viewport threw away that viewport's own checks
 *      and returned "major_issues", issues: [].
 * B31/B48: its target check counted skip links and sr-only links (cbrowser.ai's
 *      sample "1x1px" was its skip link), applied AAA 44px everywhere including
 *      desktop, and graded by count. Now empathy_audit's rules: exemptions,
 *      24px AA per axis (major), 44px AAA as a minor advisory.
 * B37: chaos_test offline printed Playwright's raw message and call log, and a
 *      -99% "load time impact" for a page that never loaded.
 * B41: perf timings printed as 53.69999998807907.
 * B49: empathy_audit over MCP dropped motionControlsCredited, so a credited
 *      pause control and no motion at all looked the same.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-v8-browser-"));
const { runResponsiveTest } = await import("../src/visual/responsive.js");
const { runChaosTest } = await import("../src/analysis/chaos-testing.js");
const { CBrowser } = await import("../src/browser.js");
const { registerAuditTools } = await import("../src/mcp-tools/base/audit-tools.js");

const TARGETS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>targets</title>
<style>.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(1px,1px,1px,1px)}
.skip{position:absolute;left:-9999px} .b20{width:20px;height:20px;padding:0} .b30{width:30px;height:30px;padding:0}
.wide{width:2000px;height:10px;background:#ccc}</style></head><body>
<a class="skip" href="#main">Skip to main content</a><a class="sr" href="/x">Hidden link</a>
<main id="main"><h1>Targets</h1><p>Read the <a href="/doc">documentation page</a> for more about this fixture.</p>
<button class="b20" aria-label="tiny">t</button><button class="b30" aria-label="small">s</button>
<div class="wide"></div></main></body></html>`;

const MOTION = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>motion</title>
<style>@keyframes slide{to{transform:translateX(200px)}} .m{width:200px;height:60px;background:#06c;animation:slide 1s infinite alternate}</style>
</head><body><main><h1>Motion</h1><button type="button" aria-controls="mover">Pause animation</button><div class="m" id="mover"></div></main></body></html>`;

let server: ReturnType<typeof Bun.serve>;
let base: string;
beforeAll(() => {
  server = Bun.serve({ port: 0, fetch: (req) => {
    const p = new URL(req.url).pathname;
    return new Response(p === "/motion" ? MOTION : TARGETS, { headers: { "content-type": "text/html; charset=utf-8" } });
  } });
  base = `http://localhost:${server.port}`;
});
afterAll(() => { server?.stop(true); });

describe("responsive_test", () => {
  test("one viewport is checked on its own (B46) with empathy_audit's target rules (B31, B48)", async () => {
    const r = await runResponsiveTest(`${base}/targets`, { viewports: ["desktop"] });
    expect(r.issues.some((i) => i.type === "overflow")).toBe(true);
    const targets = r.issues.filter((i) => i.type === "touch_target");
    const aa = targets.filter((i) => /2\.5\.8/.test(i.description));
    const aaa = targets.filter((i) => /2\.5\.5/.test(i.description));
    expect(aa.length).toBe(1);
    expect(aa[0].description).toMatch(/^1 target under 24x24px/);
    expect(aa[0].severity).toBe("major");
    expect(aaa.length).toBe(1);
    expect(aaa[0].description).toMatch(/^1 target at least 24px/);
    expect(aaa[0].severity).toBe("minor");
    // The skip link and the sr-only link are not targets.
    expect(targets.map((i) => i.description).join(" ")).not.toMatch(/1x1px|Skip to main/);
    expect(r.summary).toContain("Single viewport (desktop)");
  }, 90000);
});

describe("chaos_test offline (B37)", () => {
  test("says the page failed to load offline, with no call log and no fake improvement", async () => {
    const b = new CBrowser({ headless: true, persistent: false, skipSessionRestore: true });
    try {
      const r = await runChaosTest(b, `${base}/targets`, { offline: true });
      const errs = r.errors.join("\n");
      expect(errs).not.toMatch(/Call log|page\.goto/);
      expect(r.impact.pageCompleted).toBe(false);
      expect(r.impact.loadTimeImpactPercent).toBeUndefined();
      expect(errs).toMatch(/offline/i);
    } finally { await b.close(); }
  }, 90000);
});

describe("perf timings (B41)", () => {
  test("are whole milliseconds and CLS has at most 4 decimals", async () => {
    const b = new CBrowser({ headless: true, persistent: false, skipSessionRestore: true });
    try {
      await b.navigate(`${base}/targets`);
      const m = await b.getPerformanceMetrics();
      for (const k of ["ttfb", "domContentLoaded", "load", "fcp"] as const) {
        if (typeof m[k] === "number") expect(Number.isInteger(m[k]), `${k}=${m[k]}`).toBe(true);
      }
      if (typeof m.cls === "number") expect(Math.round(m.cls * 10000) / 10000).toBe(m.cls);
    } finally { await b.close(); }
  }, 90000);
});

describe("empathy_audit over MCP (B49)", () => {
  test("carries motionControlsCredited when a pause control is credited", async () => {
    const handlers: Record<string, (a: Record<string, unknown>) => Promise<{ content: Array<{ text?: string }> }>> = {};
    registerAuditTools({ registerTool: (n: string, _d: unknown, h: never) => { handlers[n] = h; } } as never);
    // Called directly, the handler skips zod, so the schema's defaults must be passed.
    const r = await handlers.empathy_audit({ url: `${base}/motion`, disabilities: ["cognitive-adhd"], maxSteps: 3, maxTime: 20, scope: "viewport", wcagLevel: "AA" });
    const body = JSON.parse(r.content[0].text!);
    const credited = body.resultsSummary?.[0]?.motionControlsCredited;
    expect(credited?.length).toBe(1);
    expect(credited[0].content).toContain("mover");
  }, 120000);
});
