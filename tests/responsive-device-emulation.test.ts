/**
 * responsive's mobile and tablet presets emulate a device, not only a size
 * (audit D19, 2026-10-21).
 *
 * Every preset built `new CBrowser({ viewportWidth, viewportHeight })`; the
 * mobile ones added only prefers-reduced-motion. So at "mobile" a page saw
 * pointer:fine, no touch points and a desktop user agent, while
 * `responsive viewports` listed "(touch)" and "iPhone 15". The page here
 * reports what it was given (tests/fixtures/device-report.js) and these read
 * that report, so a preset that set only the size fails.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startReportServer, type ReportServer } from "./fixtures/report-server.js";

const workDir = mkdtempSync(join(tmpdir(), "cbrowser-responsive-device-"));
process.env.CBROWSER_DATA_DIR = join(workDir, "data");
process.env.CBROWSER_ARTIFACT_DIR = join(workDir, "artifacts");

const { runResponsiveTest } = await import("../src/visual/responsive.js");
const { VIEWPORT_PRESETS } = await import("../src/types.js");

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");
const TIMEOUT = 90_000;

let server: ReportServer;

beforeAll(() => {
  server = startReportServer();
});

afterAll(() => {
  server.close();
  rmSync(workDir, { recursive: true, force: true });
});

/** Run one preset and return the single report its page sent. */
async function reportAt(preset: string) {
  server.reports.length = 0;
  const result = await runResponsiveTest(`${server.base}device-report.html`, { viewports: [preset] });
  expect(result.screenshots.map((s) => s.viewport.name)).toEqual([preset]);
  const [report] = await server.waitForReports(1);
  return report;
}

describe("responsive presets emulate their device", () => {
  test("mobile is a touch phone with a phone user agent, at the preset's size", async () => {
    const r = await reportAt("mobile");
    expect(r.values.pointer).toBe("coarse");
    expect(r.values.hover).toBe("none");
    expect(Number(r.values.touch)).toBeGreaterThan(0);
    expect(r.userAgent).toMatch(/iPhone/);
    expect(r.values.width).toBe("393");
  }, TIMEOUT);

  test("tablet-sm, whose device name devices.ts does not know, still emulates a tablet", async () => {
    const r = await reportAt("tablet-sm");
    expect(r.values.pointer).toBe("coarse");
    expect(r.userAgent).toMatch(/iPad/);
    expect(r.values.width).toBe("768");
  }, TIMEOUT);

  test("desktop stays a mouse desktop", async () => {
    const r = await reportAt("desktop");
    expect(r.values.pointer).toBe("fine");
    expect(r.values.touch).toBe("0");
    expect(r.userAgent).not.toMatch(/iPhone|iPad|Android/);
    expect(r.values.width).toBe("1920");
  }, TIMEOUT);

  test("no size sets reduced motion, so sizes differ only in what a device implies", async () => {
    // The mobile shots alone ran with prefers-reduced-motion: reduce.
    expect((await reportAt("mobile")).values.motion).toBe("no-preference");
    expect((await reportAt("desktop")).values.motion).toBe("no-preference");
  }, TIMEOUT);
});

describe("responsive help lists the preset table", () => {
  test("every preset, at its current size", async () => {
    const proc = Bun.spawn(["bun", "run", CLI, "help", "responsive"], {
      env: { ...process.env, CBROWSER_DATA_DIR: join(workDir, "data") },
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    // The hand-written list said "mobile (375x667)" and had no tablet-sm or desktop-md.
    for (const p of VIEWPORT_PRESETS) expect(out).toContain(`${p.name} (${p.width}x${p.height})`);
  }, TIMEOUT);
});
