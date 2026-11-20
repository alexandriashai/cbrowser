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
 * directory, and PLAYWRIGHT_DOWNLOAD_HOST at a closed local port, so an install
 * that does run fails at once and nothing is downloaded. Both copies of the
 * install path are covered: CBrowser.launch and the exported
 * launchBrowserWithFallback.
 *
 * Where the install does run (not hosted), two later faults are pinned too
 * (2026-11-20). It ran `npx playwright install` with stdout inherited: on the
 * stdio MCP server stdout is the JSON-RPC channel, and a real server sent 11
 * download-progress lines down it among 13. And npx ran whatever Playwright the
 * caller's directory or npx cache had (1.58.0 against the bundled 1.65.1), so a
 * successful install fetched revisions this package never launches. So: the
 * child's stdout must be exactly its one JSON line, npx (a recording shim first
 * on PATH) must never run, and the revision the installer tries to fetch must be
 * the bundled playwright-core's.
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, chmodSync, existsSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const CHILD = new URL("./fixtures/launch-failure-child.ts", import.meta.url).pathname;

/** The chromium revision the bundled Playwright launches. */
const BUNDLED_CHROMIUM = (() => {
  const dir = dirname(createRequire(import.meta.url).resolve("playwright-core/package.json"));
  const json = JSON.parse(readFileSync(join(dir, "browsers.json"), "utf8")) as { browsers: { name: string; revision: string }[] };
  return json.browsers.find((b) => b.name === "chromium")!.revision;
})();

function run(via: "class" | "standalone", mode: "hosted" | "local") {
  const dir = mkdtempSync(join(tmpdir(), "cb-launch-fail-"));
  const shimDir = join(dir, "bin");
  const marker = join(dir, "npx-ran");
  spawnSync("mkdir", ["-p", shimDir, join(dir, "browsers"), join(dir, "data"), join(dir, "cwd")]);
  writeFileSync(join(shimDir, "npx"), `#!/bin/sh\necho "$@" > "${marker}"\nexit 1\n`);
  chmodSync(join(shimDir, "npx"), 0o755);
  const r = spawnSync(process.execPath, [CHILD, via, mode], {
    encoding: "utf8",
    timeout: 120_000,
    // A directory with no node_modules, like a user's: npx would not find this package's Playwright here.
    cwd: join(dir, "cwd"),
    env: {
      ...process.env,
      PATH: `${shimDir}:${process.env.PATH}`,
      PLAYWRIGHT_BROWSERS_PATH: join(dir, "browsers"),
      PLAYWRIGHT_DOWNLOAD_HOST: "http://127.0.0.1:9",
      CBROWSER_DATA_DIR: join(dir, "data"),
    },
  });
  const message = (JSON.parse(r.stdout) as { message: string }).message;
  const npx = existsSync(marker) ? readFileSync(marker, "utf8").trim() : null;
  rmSync(dir, { recursive: true, force: true });
  return { message, npx, stdout: r.stdout, stderr: r.stderr };
}

describe("a failed browser launch", () => {
  for (const via of ["class", "standalone"] as const) {
    test(`hosted (${via}): no install is run, the launch error is returned`, () => {
      const { message, npx, stderr } = run(via, "hosted");
      expect(npx).toBeNull();
      expect(stderr).not.toContain("Installing automatically");
      expect(message).toMatch(/Executable doesn't exist/);
      expect(message).not.toContain("Playwright browsers are not installed");
    }, 150_000);

    test(`not hosted (${via}): the automatic install runs the bundled Playwright, and only on stderr`, () => {
      const { message, npx, stdout, stderr } = run(via, "local");
      expect(stderr).toContain("Installing automatically");
      expect(npx).toBeNull();
      expect(stderr).toContain(`playwright chromium v${BUNDLED_CHROMIUM}`);
      // JSON.parse in run() already failed if anything else reached stdout; say it plainly.
      expect(stdout).toBe(JSON.stringify({ message }));
      expect(message).toContain("Playwright browsers are not installed");
    }, 150_000);
  }
});
