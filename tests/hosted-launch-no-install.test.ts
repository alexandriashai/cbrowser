/**
 * The hosted server never runs `npx playwright install` when a launch fails
 * (audit leaks-live-2, 2026-11-12).
 *
 * isBrowserNotInstalledError matches every launch error, because Playwright
 * prefixes them all with "browserType.launch", so a launch that failed under
 * load or for lack of tasks ran the install through execSync: the server's one
 * event loop, serving every account, stopped while npx ran (a 3 s shim stalled
 * it 3,012 ms in the audit), as root, and the caller was told browsers are not
 * installed. Hosted now returns the launch error itself; everything else keeps
 * the automatic install.
 *
 * The launch is made to fail by pointing PLAYWRIGHT_BROWSERS_PATH at an empty
 * directory, and `npx` is a shim first on PATH that only records that it ran,
 * so nothing is downloaded and no browser starts. Both copies of the install
 * path are covered: CBrowser.launch and the exported launchBrowserWithFallback.
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, chmodSync, existsSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "node:child_process";

const CHILD = new URL("./fixtures/launch-failure-child.ts", import.meta.url).pathname;

function run(via: "class" | "standalone", mode: "hosted" | "local") {
  const dir = mkdtempSync(join(tmpdir(), "cb-launch-fail-"));
  const shimDir = join(dir, "bin");
  const marker = join(dir, "npx-ran");
  spawnSync("mkdir", ["-p", shimDir, join(dir, "browsers"), join(dir, "data")]);
  writeFileSync(join(shimDir, "npx"), `#!/bin/sh\necho "$@" > "${marker}"\nexit 1\n`);
  chmodSync(join(shimDir, "npx"), 0o755);
  const r = spawnSync(process.execPath, [CHILD, via, mode], {
    encoding: "utf8",
    timeout: 60_000,
    env: {
      ...process.env,
      PATH: `${shimDir}:${process.env.PATH}`,
      PLAYWRIGHT_BROWSERS_PATH: join(dir, "browsers"),
      CBROWSER_DATA_DIR: join(dir, "data"),
    },
  });
  const out = r.stdout.slice(r.stdout.lastIndexOf('{"message"'));
  const message = (JSON.parse(out) as { message: string }).message;
  const npx = existsSync(marker) ? readFileSync(marker, "utf8").trim() : null;
  rmSync(dir, { recursive: true, force: true });
  return { message, npx };
}

describe("a failed browser launch", () => {
  for (const via of ["class", "standalone"] as const) {
    test(`hosted (${via}): no install is run, the launch error is returned`, () => {
      const { message, npx } = run(via, "hosted");
      expect(npx).toBeNull();
      expect(message).toMatch(/Executable doesn't exist/);
      expect(message).not.toContain("Playwright browsers are not installed");
    }, 90_000);

    test(`not hosted (${via}): the automatic install still runs`, () => {
      const { message, npx } = run(via, "local");
      expect(npx).toMatch(/^playwright install (chromium firefox webkit|chromium)$/);
      expect(message).toContain("Playwright browsers are not installed");
    }, 90_000);
  }
});
