/**
 * src/temp-files.ts: names and temp directories that no other call shares,
 * with the clock frozen so a clock-built name would collide every time.
 *
 * Every site that wrote a clock-named file now takes its name or directory
 * from here (tests/no-clock-named-paths.test.ts checks that), so these
 * properties are what keep concurrent calls apart.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { makeTempDir, randomPart, uniqueStamp, withTempDir } from "../src/temp-files.js";

const FROZEN = 1_700_000_000_000;
const tempRoot = mkdtempSync(join(tmpdir(), "cb-temp-files-"));
const savedTmpdir = process.env.TMPDIR;
const realNow = Date.now;

beforeAll(() => {
  process.env.TMPDIR = tempRoot;
  expect(tmpdir()).toBe(tempRoot);
  Date.now = () => FROZEN;
});
afterAll(() => {
  Date.now = realNow;
  if (savedTmpdir === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = savedTmpdir;
  try { rmSync(tempRoot, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("uniqueStamp", () => {
  test("10,000 stamps in one frozen millisecond are all distinct, and each starts with the time", () => {
    const stamps = Array.from({ length: 10_000 }, () => uniqueStamp());
    expect(new Set(stamps).size).toBe(stamps.length);
    for (const s of stamps) expect(s).toMatch(new RegExp(`^${FROZEN}-[0-9a-f]{12}$`));
  });

  test("randomPart is 12 lowercase hex characters", () => {
    expect(randomPart()).toMatch(/^[0-9a-f]{12}$/);
    expect(randomPart()).not.toBe(randomPart());
  });
});

describe("makeTempDir / withTempDir", () => {
  test("50 calls in parallel in one frozen millisecond each get their own private directory, and each reads back only its own file", async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        withTempDir("collide", async (dir) => {
          const f = dir.file("page.png");
          writeFileSync(f, `call ${i}`);
          // Yield, so the other calls write in between.
          await new Promise((r) => setTimeout(r, 1));
          const mode = statSync(dir.path).mode & 0o777;
          return { dir: dir.path, read: readFileSync(f, "utf8"), mode, i };
        }),
      ),
    );
    expect(new Set(results.map((r) => r.dir)).size).toBe(50);
    for (const r of results) {
      expect(r.read).toBe(`call ${r.i}`);
      expect(r.mode).toBe(0o700);
      expect(dirname(r.dir)).toBe(tempRoot);
      expect(basename(r.dir)).toMatch(/^cbrowser-collide-/);
    }
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  test("a call that throws still removes its directory, and the error reaches the caller", async () => {
    let seen = "";
    await expect(
      withTempDir("fails", async (dir) => {
        seen = dir.path;
        writeFileSync(dir.file("partial.png"), "x");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(seen).not.toBe("");
    expect(existsSync(seen)).toBe(false);
    expect(readdirSync(tempRoot)).toEqual([]);
  });

  test("remove() is safe to call twice and after the directory is gone", async () => {
    const dir = await makeTempDir("twice");
    writeFileSync(dir.file("a.png"), "a");
    await dir.remove();
    await dir.remove();
    expect(existsSync(dir.path)).toBe(false);
  });

  test("file() takes one plain name only; label is lowercase letters, digits and -", async () => {
    const dir = await makeTempDir("names");
    try {
      for (const bad of ["../x.png", "a/b.png", "..", ".", "", "/etc/passwd", "a\\b.png", ".hidden"]) {
        expect(() => dir.file(bad)).toThrow();
      }
      expect(dir.file("step-3.png")).toBe(join(dir.path, "step-3.png"));
    } finally {
      await dir.remove();
    }
    for (const bad of ["Upper", "a/b", "", "-lead", "a_b"]) {
      await expect(makeTempDir(bad)).rejects.toThrow();
    }
  });
});
