#!/usr/bin/env node
/**
 * Set the "version" of manifest.json (the MCPB bundle) and of the Claude Code
 * plugin (plugins/cbrowser/.claude-plugin/plugin.json) to the version release-it
 * just bumped package.json to. Run from .release-it.json's after:bump hook, so the
 * release commit carries all three; tests/doc-tool-counts.test.ts and
 * tests/skill-plugin.test.ts fail when they differ. manifest.json sat at 18.59.0
 * through three majors before this existed.
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
// Replace only the version string, so the rest of each file keeps its formatting.
for (const file of ["../manifest.json", "../plugins/cbrowser/.claude-plugin/plugin.json"]) {
  const path = new URL(file, import.meta.url);
  const before = readFileSync(path, "utf8");
  const after = before.replace(/^(\s*"version":\s*")[^"]*(")/m, `$1${version}$2`);
  if (JSON.parse(after).version !== version) {
    console.error(`sync-manifest-version: the first "version" key in ${file} is not the top-level one`);
    process.exit(1);
  }
  writeFileSync(path, after);
  console.log(`${file.slice(3)} version -> ${version}`);
}
