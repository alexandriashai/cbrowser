/**
 * Device presets (src/devices.ts): which names `--device` and the MCP `device`
 * parameter accept, and what each one renders at.
 *
 * Reported 2026-10-21: there were 12 presets, none newer than the iPhone 15,
 * and an unknown name silently rendered 1280x800 desktop and reported success -
 * including names the MCP tool descriptions themselves advertised ("Pixel 7",
 * "iPad Pro"). These pin the 12 shipped presets unchanged, every Chrome DevTools
 * and Playwright device reachable by its display name, one size convention for
 * all of them, and unknown names refused with suggestions.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { devices as playwrightDevices } from "playwright";
import { CBROWSER_DEVICE_KEYS, DEVICE_PRESETS, normalizeDeviceName, resolveDevice } from "../src/devices.js";
import { DEVTOOLS_DEVICES } from "../src/device-presets-devtools.js";
import { CBrowser } from "../src/browser.js";
import { CBrowserError, CBrowserErrorCode, type DeviceDescriptor } from "../src/types.js";

/** DEVICE_PRESETS as it shipped in 19.5.0, captured from the code before this change. */
const ORIGINAL: Record<string, DeviceDescriptor> = JSON.parse(
  readFileSync(join(import.meta.dir, "fixtures", "device-presets-original.json"), "utf8"),
);

const keyOf = (name: string): string => {
  const r = resolveDevice(name);
  if (!("key" in r)) throw new Error(`${name}: ${r.error}`);
  return r.key;
};

describe("the shipped presets", () => {
  test("all 12 render exactly as before", () => {
    for (const [key, preset] of Object.entries(ORIGINAL)) expect(DEVICE_PRESETS[key]).toEqual(preset);
  });

  test("they are still the default set for `parallel devices`", () => {
    expect(CBROWSER_DEVICE_KEYS).toEqual(Object.keys(ORIGINAL));
  });
});

describe("every known device is reachable", () => {
  test("every Playwright device, by its display name", () => {
    const names = Object.keys(playwrightDevices);
    expect(names.length).toBeGreaterThan(100);
    for (const name of names) expect(DEVICE_PRESETS[keyOf(name)]).toBeDefined();
  });

  test("every Chrome DevTools device, by its display name", () => {
    const entries = Object.values(DEVTOOLS_DEVICES);
    expect(entries.length).toBeGreaterThan(40);
    for (const d of entries) expect(DEVICE_PRESETS[keyOf(d.name)]).toBeDefined();
  });

  test("devices newer than the old table", () => {
    for (const name of ["iPhone 16", "iPhone 16 Pro Max", "iPhone 16e", "Pixel 9", "Pixel 10", "Galaxy Z Fold 6", "iPad Pro 13", "iPad Mini", "Surface Pro 10"]) {
      expect(DEVICE_PRESETS[keyOf(name)]).toBeDefined();
    }
    // Values from the pinned DevTools source (EmulatedDevices.ts @ 4c3993d).
    expect(DEVICE_PRESETS["iphone-16"]).toMatchObject({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  });

  test("names the MCP tool descriptions advertise resolve", () => {
    expect(keyOf("iPhone 15")).toBe("iphone-15");
    expect(keyOf("pixel 7")).toBe("pixel-7"); // gif-tools lowercases its input
    expect(keyOf("iPad Pro 11")).toBe("ipad-pro-11");
  });
});

describe("one size convention", () => {
  test("a Playwright mobile device renders at its full screen, as cbrowser's own presets do", () => {
    // Playwright's `viewport` is the browser's visible area (iPhone 12: 390x664
    // of a 390x844 screen). cbrowser presets have always been the full screen.
    let checked = 0;
    for (const [name, d] of Object.entries(playwrightDevices)) {
      const key = normalizeDeviceName(name);
      if (!d.screen || !d.isMobile || key in ORIGINAL || key in DEVTOOLS_DEVICES) continue;
      expect(DEVICE_PRESETS[key].viewport).toEqual({ width: d.screen.width, height: d.screen.height });
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  });

  test("every preset is a usable size", () => {
    for (const [key, d] of Object.entries(DEVICE_PRESETS)) {
      expect(Number.isInteger(d.viewport.width) && d.viewport.width > 0, key).toBe(true);
      expect(Number.isInteger(d.viewport.height) && d.viewport.height > 0, key).toBe(true);
      expect(d.deviceScaleFactor, key).toBeGreaterThan(0);
      expect(d.userAgent, key).not.toContain("%s");
      if (d.isMobile) expect(d.userAgent.length, key).toBeGreaterThan(0);
    }
  });
});

describe("names", () => {
  test("normalising is idempotent", () => {
    fc.assert(fc.property(fc.string(), (s) => normalizeDeviceName(normalizeDeviceName(s)) === normalizeDeviceName(s)));
  });

  test("every key resolves to itself", () => {
    for (const key of Object.keys(DEVICE_PRESETS)) expect(keyOf(key)).toBe(key);
  });

  test("case and spacing do not matter", () => {
    fc.assert(fc.property(fc.constantFrom(...Object.keys(DEVICE_PRESETS)), (key) => {
      const name = DEVICE_PRESETS[key].name;
      return keyOf(name.toUpperCase()) === keyOf(`  ${name.replace(/ /g, "   ")} `);
    }));
  });
});

describe("unknown names are refused, never rendered as desktop", () => {
  test("an unlisted phone gets its family as suggestions", () => {
    const r = resolveDevice("iPhone 17");
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.suggestions).toContain("iphone-16");
    const s = resolveDevice("Galaxy S25");
    if ("error" in s) expect(s.suggestions).toContain("galaxy-s24");
    else throw new Error("Galaxy S25 resolved");
  });

  test("empty names are refused", () => {
    for (const name of ["", "   ", "---"]) expect("error" in resolveDevice(name)).toBe(true);
  });

  let dataDir = "";
  const previousDataDir = process.env.CBROWSER_DATA_DIR;
  beforeAll(() => {
    dataDir = mkdtempSync(join(tmpdir(), "cbrowser-device-test-"));
    process.env.CBROWSER_DATA_DIR = dataDir;
  });
  afterAll(() => {
    if (previousDataDir === undefined) delete process.env.CBROWSER_DATA_DIR;
    else process.env.CBROWSER_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("launch fails on an unknown device, naming it and the closest presets", async () => {
    const browser = new CBrowser({ device: "iphone-17", headless: true, persistent: false });
    let error: unknown;
    try {
      await browser.launch();
    } catch (e) {
      error = e;
    } finally {
      await browser.close().catch(() => {});
    }
    expect(error).toBeInstanceOf(CBrowserError);
    expect((error as CBrowserError).code).toBe(CBrowserErrorCode.CONFIG_INVALID);
    expect((error as Error).message).toContain("iphone-17");
    expect((error as Error).message).toContain("iphone-16");
  });
});
