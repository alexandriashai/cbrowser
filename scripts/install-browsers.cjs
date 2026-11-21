#!/usr/bin/env node
/**
 * Installs Playwright browsers with the Playwright cbrowser itself resolves,
 * never `npx playwright`. npx can run a different, cached Playwright (1.58.0
 * against a bundled 1.65.1 was measured on 2026-11-20), which downloads browser
 * revisions cbrowser never launches. The runtime installer was fixed the same
 * way in src/browser/helpers.ts (f3e2fdb); this is the install-time twin.
 *
 * Used by the package's postinstall and by Dockerfile.mcp-demo.
 * Usage: node scripts/install-browsers.cjs [browser ...]   (default: chromium)
 * Exit status is Playwright's; the postinstall ignores it (`|| true`), so a
 * failed download never fails `npm install`, and the browsers then install on
 * first launch.
 *
 * CommonJS (.cjs) because the package is "type": "module" and this must run
 * before anything is built.
 */
"use strict";
const { spawnSync } = require("node:child_process");
const { dirname, join } = require("node:path");

let cli;
try {
  // Resolve from this package's location, not the caller's cwd.
  cli = join(dirname(require.resolve("playwright/package.json", { paths: [join(__dirname, "..")] })), "cli.js");
} catch (e) {
  console.error(`cbrowser: playwright not found, skipping the browser install (${e.message})`);
  process.exit(1);
}

const browsers = process.argv.slice(2);
const result = spawnSync(process.execPath, [cli, "install", ...(browsers.length ? browsers : ["chromium"])], { stdio: "inherit" });
process.exit(result.status ?? 1);
