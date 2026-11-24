#!/usr/bin/env node
/**
 * Regenerate the copies of the canonical skill in plugins/cbrowser/skills/cbrowser/:
 * skill/ (below), and the cbrowser-local plugin's skills/ and commands/ (a plugin
 * is installed as its own directory, so it cannot point at a sibling's files).
 *
 * The skill lives in the Claude Code plugin's directory. skill/ is kept because
 * cbrowser 21.5.5 and older download `skill/<file>` from GitHub main in
 * `cbrowser install-skill`, and abort (changing nothing) if any of their 13 files
 * 404s. One of those files, Tools/CBrowser.ts, was a copy of the v5 CLI and is
 * retired; it stays here as a short stub so those versions keep working.
 *
 * Edit the canonical skill, then run: node scripts/sync-skill-mirror.mjs
 * tests/skill-plugin.test.ts fails when a copy and the canonical files differ.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const canonical = `${root}plugins/cbrowser/skills/cbrowser`;
const mirror = `${root}skill`;

const RETIRED_TOOL_STUB = `// This skill no longer ships a tool of its own.
//
// Tools/CBrowser.ts was a copy of the cbrowser v5 CLI. Use the cbrowser CLI
// (npm install -g cbrowser, then: cbrowser --help) or its MCP server
// (npx cbrowser mcp-server). Update this skill with: cbrowser install-skill
console.error("Tools/CBrowser.ts is retired. Use the cbrowser CLI: npm install -g cbrowser, then cbrowser --help");
process.exit(1);
`;

const local = `${root}plugins/cbrowser-local`;
for (const dir of ["skills", "commands"]) {
  rmSync(`${local}/${dir}`, { recursive: true, force: true });
  cpSync(`${root}plugins/cbrowser/${dir}`, `${local}/${dir}`, { recursive: true });
}

rmSync(mirror, { recursive: true, force: true });
cpSync(canonical, mirror, { recursive: true });
mkdirSync(`${mirror}/Tools`, { recursive: true });
writeFileSync(`${mirror}/Tools/CBrowser.ts`, RETIRED_TOOL_STUB);
console.log("skill/ and plugins/cbrowser-local/{skills,commands} regenerated from plugins/cbrowser/");
