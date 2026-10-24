/**
 * The 20.0.3 path hotfix, reproduced end to end.
 *
 * 1. analyzePerceptualTransport named its filtered image
 *    `perceptual-${personaName}-${Date.now()}.png` in the shared temp dir, so
 *    a persona name with ../ segments resolved the write OUTSIDE that dir. Here
 *    the temp base is read-only and the persona's ../ points at a writable
 *    scratch dir: on the old code the filtered write escapes into the scratch
 *    dir (a PNG appears there); the fix writes only inside its own mkdtemp dir,
 *    so the scratch dir stays empty.
 * 2. crossBrowserDiff wrote full-page captures to a literal
 *    /tmp/cross-browser-<engine>-<ms>.png: a world-readable, world-traversable
 *    location any local user can list, shared across accounts, never deleted.
 *    The fix writes them in the account's own session screenshots dir.
 *
 * The scratch dir is a fresh directory under the system temp dir, removed at
 * the end. Run as an ordinary user: root ignores the read-only temp base.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";

const sharp = (await import("sharp")).default;

// Its own directory under the system temp dir: a fixed path here (it was one
// machine's home directory) does not exist on CI and failed the release gate.
const run = mkdtempSync(join(tmpdir(), "cb-hotfix-escape-"));
// A read-only temp base. The old filtered path escapes it (so the write lands
// in the scratch target below); the fix's mkdtemp inside it would fail, which
// is itself proof the fix never writes a clock/persona-named file in it.
const roBase = join(run, "ro-tmpbase");
const escapeTarget = join(run, "escaped"); // where the ../ persona points
let screenshot = "";
const savedTmpdir = process.env.TMPDIR;

beforeAll(async () => {
  mkdirSync(escapeTarget, { recursive: true });
  mkdirSync(roBase, { recursive: true });
  screenshot = join(run, "page.png");
  await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 60, b: 60 } } }).png().toFile(screenshot);
});
afterAll(() => {
  if (savedTmpdir === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = savedTmpdir;
  try { chmodSync(roBase, 0o700); } catch { /* best effort */ }
  try { rmSync(run, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe("analyzePerceptualTransport does not write outside its own temp dir", () => {
  test("a persona whose name is ../ segments cannot land a file in a sibling dir", async () => {
    const { analyzePerceptualTransport } = await import("../src/visual/perceptual-transport.js");
    // The old filtered path is join(TMPDIR, `perceptual-${persona}-${ms}.png`).
    // A leading segment then ../../ climbs out of the glued `perceptual-` prefix
    // and out of roBase into the sibling escaped/ dir, so the filtered PNG lands
    // at escaped/pwn-<ms>.png. (`../escaped` alone would NOT climb: it glues to
    // `perceptual-..`, a literal dir name.) roBase is read-only, so the old
    // code's SECOND write (the original image, which stays in roBase) throws
    // after the filtered one escaped, skipping its unlink -- the escaped file
    // stays. Verify escaped/ is empty: the fix's mkdtemp in a read-only roBase
    // throws before any write.
    const escDir = basename(escapeTarget); // "escaped"
    const persona = `x${sep}..${sep}..${sep}${escDir}${sep}pwn`;
    process.env.TMPDIR = roBase;
    expect(tmpdir()).toBe(roBase);
    chmodSync(roBase, 0o500); // read + execute, no write
    const log = console.log;
    console.log = () => {};
    try {
      await analyzePerceptualTransport(screenshot, persona, { entropy: 0.8, concentration: 0.9, transportCost: 1.5 }).catch(() => undefined);
    } finally {
      console.log = log;
      chmodSync(roBase, 0o700);
    }
    // The fix: nothing escaped into the sibling dir.
    expect(readdirSync(escapeTarget)).toEqual([]);
  }, 60_000);
});

describe("crossBrowserDiff keeps captures in the account dir, not world-readable /tmp", () => {
  test("every returned capture path is under the account data dir, not /tmp", async () => {
    const dataDir = mkdtempSync(join(run, "cbdata-"));
    const saved = process.env.CBROWSER_DATA_DIR;
    process.env.CBROWSER_DATA_DIR = dataDir;
    const server = Bun.serve({ port: 0, fetch: () => new Response("<!doctype html><html lang=en><meta charset=utf-8><title>x</title><h1>Hello</h1>", { headers: { "content-type": "text/html" } }) });
    try {
      const { crossBrowserDiff } = await import("../src/visual/cross-browser.js");
      const r = await crossBrowserDiff(`http://127.0.0.1:${server.port}/`, ["chromium"]);
      const paths = Object.values(r.screenshots);
      expect(paths.length).toBeGreaterThanOrEqual(1);
      for (const p of paths) {
        // Not in the shared temp root, where the old code wrote /tmp/cross-browser-*.png
        // (this test's own data dir lives under the temp dir, so "starts with /tmp" cannot be the check).
        expect([tmpdir(), "/tmp"]).not.toContain(dirname(p));
        expect(relative(dataDir, p).startsWith("..")).toBe(false);
      }
      expect(basename(paths[0])).toMatch(/^cross-browser-chromium-\d+-[0-9a-f]{12}\.png$/);
    } finally {
      server.stop(true);
      if (saved === undefined) delete process.env.CBROWSER_DATA_DIR; else process.env.CBROWSER_DATA_DIR = saved;
    }
  }, 120_000);
});
