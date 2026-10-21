/**
 * "mobile", "tablet" and "desktop" mean one thing everywhere.
 *
 * Audit 2026-10-21 (MCP parity lane):
 * - M7: three tables disagreed. devices.ts (what --device and every MCP
 *   `device` parameter resolve through) said mobile = 393x852 with a phone
 *   user agent and touch; types.ts VIEWPORT_PRESETS (responsive_test,
 *   capture_start's viewport) said 375x667, desktop 1440x900; regression.ts
 *   GENERIC_VIEWPORTS (visual_baseline's device) said 375x667, desktop
 *   1920x1080, desktop-lg 2560x1440, and was case-sensitive.
 * - M8: tools described their default as "desktop (1920x1080)" and echoed
 *   device "desktop" while rendering at the 1280x800 configured default with no
 *   emulation.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_DATA_DIR ??= mkdtempSync(join(tmpdir(), "cb-device-names-"));

const { DEVICE_PRESETS, describeRenderTarget } = await import("../src/devices.js");
const { VIEWPORT_PRESETS } = await import("../src/types.js");
const { resolveBaselineTarget } = await import("../src/visual/regression.js");

describe("one meaning for the generic names (M7)", () => {
  for (const name of ["mobile", "tablet", "desktop"]) {
    test(`VIEWPORT_PRESETS "${name}" is the size of device "${name}"`, () => {
      const size = VIEWPORT_PRESETS.find((p) => p.name === name)!;
      expect({ width: size.width, height: size.height }).toEqual(DEVICE_PRESETS[name].viewport);
    });
  }

  test("viewport preset names stay unique", () => {
    const names = VIEWPORT_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("a baseline's device resolves through the device presets, any case", () => {
    expect(resolveBaselineTarget("mobile")).toEqual({ device: "mobile" });
    expect(resolveBaselineTarget("Mobile")).toEqual({ device: "mobile" });
    expect(resolveBaselineTarget("iPhone 15")).toEqual({ device: "iphone-15" });
  });

  test("a baseline's size-only name resolves through VIEWPORT_PRESETS", () => {
    expect(resolveBaselineTarget("desktop-sm")).toEqual({ viewport: { width: 1280, height: 800 } });
    expect(resolveBaselineTarget("desktop-xl")).toEqual({ viewport: { width: 2560, height: 1440 } });
  });

  test("an unknown name is an error, never a silent default", () => {
    expect(() => resolveBaselineTarget("no-such-device-xyz")).toThrow(/Unknown device/);
  });

  test("no device and no viewport keeps the baseline default", () => {
    expect(resolveBaselineTarget(undefined)).toEqual({});
  });
});

describe("render target is reported as rendered (M8)", () => {
  test("no device: no emulation, the configured viewport", () => {
    expect(describeRenderTarget(undefined, { width: 1280, height: 800 }))
      .toEqual({ device: null, viewport: { width: 1280, height: 800 } });
  });
  test("a device: its preset key and viewport", () => {
    expect(describeRenderTarget("Mobile", { width: 1280, height: 800 }))
      .toEqual({ device: "mobile", viewport: { width: 393, height: 852 } });
  });

  test("no tool describes its default as desktop 1920x1080", async () => {
    const { registerAuditTools } = await import("../src/mcp-tools/base/audit-tools.js");
    const descriptions: string[] = [];
    registerAuditTools({
      registerTool: (_n: string, cfg: { inputSchema?: Record<string, { description?: string }> }) => {
        for (const p of Object.values(cfg.inputSchema ?? {})) if (p?.description) descriptions.push(p.description);
      },
      tool: () => {}, registerResource: () => {}, resource: () => {},
    } as never, { getBrowser: async () => { throw new Error("no browser"); } } as never);
    const deviceDescs = descriptions.filter((d) => /Device/i.test(d) && /desktop/.test(d));
    expect(deviceDescs.length).toBeGreaterThan(0);
    for (const d of deviceDescs) {
      expect(d).not.toMatch(/Default: desktop/);
    }
  });
});
