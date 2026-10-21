/**
 * CLI `--device` end to end (reported 2026-10-21): `screenshot --device
 * iphone-16` rendered 1280x800 desktop and exited 0, because only `capture`
 * checked the name and the browser skipped presets it did not know.
 *
 * These drive the real CLI against a real page and read the PNG's own size, so
 * a command that ignored the device would fail here, not just one that crashed.
 * The subprocess harness is the one in cli-evaluate-keyboard.test.ts; its
 * comments explain why the exit code is read from a file.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { serveFixtures } from "./fixtures/serve-fixtures.js";

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");
const TIMEOUT = 60_000;

let fixtures: Awaited<ReturnType<typeof serveFixtures>>;
let dataDir = "";
let runSeq = 0;

interface RunResult { code: number; stdout: string; stderr: string }

async function cli(...args: string[]): Promise<RunResult> {
  const n = runSeq++;
  const outPath = join(dataDir, `out-${n}.txt`);
  const errPath = join(dataDir, `err-${n}.txt`);
  const codePath = join(dataDir, `code-${n}.txt`);
  const proc = Bun.spawn(
    ["bash", "-c", 'bun run "$0" "$@" > "$CB_OUT" 2> "$CB_ERR"; c=$?; echo $c > "$CB_CODE"; exit $c', CLI, ...args],
    {
      env: { ...process.env, CBROWSER_DATA_DIR: dataDir, CB_OUT: outPath, CB_ERR: errPath, CB_CODE: codePath },
      stdout: "ignore",
      stderr: "ignore",
    },
  );
  const fromFile = (async () => {
    for (let i = 0; i < 1800; i++) {
      if (existsSync(codePath)) {
        const raw = readFileSync(codePath, "utf8").trim();
        if (raw) return Number(raw);
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`cli never reported an exit code: ${args.join(" ")}`);
  })();
  const code = await Promise.race([proc.exited, fromFile]);
  return {
    code,
    stdout: existsSync(outPath) ? readFileSync(outPath, "utf8") : "",
    stderr: existsSync(errPath) ? readFileSync(errPath, "utf8") : "",
  };
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): { width: number; height: number } {
  const b = readFileSync(path);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "cbrowser-cli-device-"));
  fixtures = await serveFixtures();
});

afterAll(async () => {
  await fixtures.close();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

describe("cbrowser --device", () => {
  test("a device newer than the old table renders at its own size", async () => {
    const out = join(dataDir, "iphone-16.png");
    const r = await cli("screenshot", out, "--url", `${fixtures.base}static.html`, "--device", "iPhone 16");
    expect(r.code, r.stderr).toBe(0);
    // 393 CSS px at 3x. A device the browser ignored renders 1280 wide.
    expect(pngSize(out).width).toBe(1179);
  }, TIMEOUT);

  test("an unknown device fails and suggests the closest presets, instead of rendering desktop", async () => {
    const out = join(dataDir, "iphone-99.png");
    const r = await cli("screenshot", out, "--url", `${fixtures.base}static.html`, "--device", "iphone-99");
    expect(r.code).not.toBe(0);
    expect(r.stdout + r.stderr).toContain("iphone-99");
    expect(r.stdout + r.stderr).toMatch(/iphone-1[0-9]/);
    expect(existsSync(out)).toBe(false);
  }, TIMEOUT);

  test("device list includes the new devices, one per line", async () => {
    const r = await cli("device", "list");
    expect(r.code, r.stderr).toBe(0);
    const lines = r.stdout.split("\n").filter((l) => /^\s+\S+\s+\d+x\d+/.test(l));
    expect(lines.length).toBeGreaterThan(100);
    expect(lines.some((l) => /^\s+iphone-16\s/.test(l))).toBe(true);
    expect(lines.some((l) => /^\s+pixel-9\s/.test(l))).toBe(true);
  }, TIMEOUT);

  test("device list takes a filter", async () => {
    const r = await cli("device", "list", "pixel");
    expect(r.code, r.stderr).toBe(0);
    const lines = r.stdout.split("\n").filter((l) => /^\s+\S+\s+\d+x\d+/.test(l));
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.every((l) => /pixel/i.test(l))).toBe(true);
  }, TIMEOUT);

  test("a preset with no user agent keeps the browser's own, not an empty one", async () => {
    // The DevTools laptops carry user-agent ''. Playwright 1.58 treats '' as
    // unset (measured 2026-10-21) and browser.ts skips it too; this pins the
    // outcome whichever layer provides it.
    const r = await cli("evaluate", "navigator.userAgent", "--url", `${fixtures.base}static.html`,
      "--device", "Laptop with HiDPI screen", "--raw", "--force");
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout.trim().split("\n").pop()).toMatch(/Mozilla\/5\.0 .+/);
  }, TIMEOUT);
});

/**
 * `--viewport` is a global flag (2026-10-21). Before, commands that check their
 * flags (evaluate, keyboard, test-suite, cognitive-journey) refused it, the
 * rest took it, and with --device the preset's size silently won.
 */
describe("cbrowser --viewport", () => {
  const SIZE = "innerWidth + 'x' + innerHeight + ' dpr' + devicePixelRatio + ' touch' + (navigator.maxTouchPoints > 0)";

  test("evaluate takes it", async () => {
    const r = await cli("evaluate", SIZE, "--url", `${fixtures.base}static.html`, "--viewport", "390x844", "--raw", "--force");
    expect(r.code, r.stderr).toBe(0);
    // Size only: the pixel ratio without a device is the browser's default.
    expect(r.stdout.trim().split("\n").pop()).toStartWith("390x844 ");
  }, TIMEOUT);

  test("with --device it sets the size, and the device keeps its pixel ratio and touch", async () => {
    const r = await cli("evaluate", SIZE, "--url", `${fixtures.base}static.html`,
      "--device", "iPhone 16", "--viewport", "500x700", "--raw", "--force");
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout.trim().split("\n").pop()).toBe("500x700 dpr3 touchtrue");
  }, TIMEOUT);

  test("a malformed size is an error, not a default", async () => {
    const r = await cli("evaluate", "1", "--url", `${fixtures.base}static.html`, "--viewport", "wide", "--force");
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain("Invalid viewport");
  }, TIMEOUT);

  test("test-suite honours --viewport and --device", async () => {
    // test-suite runs its own browser; before, it was built with headless only.
    const page = `${fixtures.base}viewport.html`;
    const sized = await cli("test-suite", "--inline", `go to ${page} ; verify page contains "W390 H844"`, "--viewport", "390x844");
    expect(sized.code, sized.stdout + sized.stderr).toBe(0);
    const device = await cli("test-suite", "--inline", `go to ${page} ; verify page contains "W393 H852 DPR3"`, "--device", "iphone-16");
    expect(device.code, device.stdout + device.stderr).toBe(0);
  }, TIMEOUT * 2);
});
