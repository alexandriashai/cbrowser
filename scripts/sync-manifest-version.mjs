#!/usr/bin/env node
/**
 * Set manifest.json's "version" (the MCPB bundle) to the version release-it just
 * bumped package.json to. Run from .release-it.json's after:bump hook, so the
 * release commit carries both; tests/doc-tool-counts.test.ts fails when they differ.
 * manifest.json sat at 18.59.0 through three majors before this existed.
 *
 * Usage: node scripts/sync-manifest-version.mjs <version>
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? "")) {
  console.error(`sync-manifest-version: not a version: ${version}`);
  process.exit(1);
}
const path = new URL("../manifest.json", import.meta.url);
// Replace only the version string, so the rest of the file keeps its formatting.
const before = readFileSync(path, "utf8");
const after = before.replace(/^(\s*"version":\s*")[^"]*(")/m, `$1${version}$2`);
if (JSON.parse(after).version !== version) {
  console.error("sync-manifest-version: the first \"version\" key is not the top-level one");
  process.exit(1);
}
writeFileSync(path, after);
console.log(`manifest.json version -> ${version}`);
