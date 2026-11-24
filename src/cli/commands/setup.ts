/**
 * Commands that run before any browser exists: config, uninstall,
 * install-skill / sync-skill, install-browsers.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getDataDir } from "../../config.js";
import { setAnthropicApiKey, getAnthropicApiKey, removeAnthropicApiKey } from "../../cognitive/index.js";
import { formatBytes } from "../format.js";
import type { PreBrowserContext } from "../context.js";

// Config command - runs before browser instantiation
export async function runConfigCommand(ctx: PreBrowserContext): Promise<void> {
  const { args } = ctx;
  const subCommand = args[0];
  const fs = await import("fs");
  const path = await import("path");

  switch (subCommand) {
    case "set-api-key": {
      const apiKey = args[1];
      if (!apiKey) {
        console.error("Usage: cbrowser config set-api-key <api-key>");
        process.exit(1);
      }
      if (!apiKey.startsWith("sk-ant-")) {
        console.error("❌ Invalid API key format. Anthropic keys start with 'sk-ant-'");
        process.exit(1);
      }
      setAnthropicApiKey(apiKey);
      console.log("✅ Anthropic API key saved to ~/.cbrowser/config.json");
      process.exit(0);
    }

    case "show-api-key": {
      const key = getAnthropicApiKey();
      if (key) {
        const masked = key.slice(0, 7) + "..." + key.slice(-4);
        console.log(`Anthropic API key: ${masked}`);
        console.log(`Source: ${process.env.ANTHROPIC_API_KEY ? "environment" : "config file"}`);
      } else {
        console.log("No Anthropic API key configured.");
        console.log("Set with: cbrowser config set-api-key <key>");
      }
      process.exit(0);
    }

    case "remove-api-key": {
      removeAnthropicApiKey();
      console.log("✅ Anthropic API key removed from config.");
      if (process.env.ANTHROPIC_API_KEY) {
        console.log("⚠️  Note: ANTHROPIC_API_KEY environment variable is still set.");
      }
      process.exit(0);
    }

    case "set-model": {
      const model = args[1];
      if (!model) {
        console.error("Usage: cbrowser config set-model <model>");
        console.error("Examples: claude-sonnet-5, claude-haiku-4-5-20251001");
        process.exit(1);
      }
      const configPath = path.join(getDataDir(), "config.json");
      let config: Record<string, unknown> = {};
      if (fs.existsSync(configPath)) {
        try {
          config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        } catch {}
      }
      config.anthropicModel = model;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(`✅ Claude model set to: ${model}`);
      process.exit(0);
    }

    default:
      console.error("Usage: cbrowser config [set-api-key|show-api-key|remove-api-key|set-model]");
      process.exit(1);
  }
}

// Remove everything this tool wrote outside its own npm package.
//
// Dry run by default. The targets include the user's captured work, and
// deleting it because someone typed a command to find out what it does is not
// something they can undo.
export async function runUninstallCommand(ctx: PreBrowserContext): Promise<void> {
  const { options } = ctx;
  const { planUninstall, executeUninstall, renderPlan } = await import("../../uninstall.js");

  const confirmed = Boolean(options["yes"]);
  const plan = planUninstall({ keepConfig: Boolean(options["keep-config"]) });

  console.log(renderPlan(plan, !confirmed));

  if (!confirmed || plan.targets.length === 0) {
    return;
  }

  const result = executeUninstall(plan);
  console.log("");
  console.log(`Removed ${result.removed.length} items, freed ${formatBytes(result.bytesFreed)}.`);
  for (const f of result.failed) {
    console.error(`  FAILED: ${f.path} — ${f.error}`);
  }
  console.log("");
  console.log("The npm package itself is still installed. To finish:");
  console.log("  npm uninstall -g cbrowser");

  // A credential reported as removed but still on disk is the one outcome
  // that must not exit 0.
  if (result.failed.length > 0) process.exit(1);
  return;
}

// Install/Sync Claude skill (both commands do the same thing)
//
// The skill ships inside this package (plugins/cbrowser/skills/cbrowser, the same
// directory the Claude Code plugin loads), so the installed skill is always the one
// written for the installed version. This used to download a hard-coded list of 13
// files from GitHub main: it missed four of the skill's files, could install docs
// for a newer release than the CLI, and needed the network.
export function packagedSkillDir(): string {
  // dist/cli/commands/setup.js and src/cli/commands/setup.ts are both three levels down.
  return fileURLToPath(new URL("../../../plugins/cbrowser/skills/cbrowser/", import.meta.url));
}

/** Every file of a directory tree, as forward-slash paths relative to it, sorted. */
export function listSkillFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(r);
      else if (entry.isFile()) out.push(r);
    }
  };
  walk("");
  return out.sort();
}

/** Files earlier installs put in the skill dir that this skill no longer uses. Reported, never deleted. */
const RETIRED_SKILL_FILES = ["Tools/CBrowser.ts"];

export async function runInstallSkillCommand(): Promise<void> {
  const skillDir = join(homedir(), ".claude", "skills", "CBrowser");
  const source = packagedSkillDir();

  if (!existsSync(join(source, "SKILL.md"))) {
    console.error(`The skill is missing from this cbrowser install (looked in ${source}). Reinstall cbrowser.`);
    process.exit(1);
  }
  const files = listSkillFiles(source);
  const existed = existsSync(skillDir);
  console.log(`${existed ? "Updating" : "Installing"} the CBrowser skill (${files.length} files) in ${skillDir}`);

  // Write over the skill's own files only: anything else in the directory (notes,
  // a user's own workflow) is left alone.
  for (const file of files) {
    mkdirSync(dirname(join(skillDir, file)), { recursive: true });
    copyFileSync(join(source, file), join(skillDir, file));
  }

  const leftovers = RETIRED_SKILL_FILES.filter((f) => existsSync(join(skillDir, f)));
  console.log(`
CBrowser skill ${existed ? "updated" : "installed"}: ${skillDir}
Claude Code finds it on its own; start a new session to load it.
`);
  if (leftovers.length > 0) {
    console.log("An older install left files this skill no longer uses. You can delete them:");
    for (const f of leftovers) console.log(`  ${join(skillDir, f)}`);
    console.log("");
  }
  console.log(`Next:
  cbrowser doctor                              Check Node, the browser and the API key
  cbrowser install-browsers firefox webkit     Only for cross-browser testing

The Claude Code plugin bundles this skill with the MCP server:
  /plugin marketplace add wyldfyre-ai/cbrowser
  /plugin install cbrowser@cbrowser
`);
}

// Install Playwright browsers with the Playwright this package resolves. `npx
// playwright install` can run a different, cached Playwright and download browser
// revisions cbrowser never launches (1.58.0 against a bundled 1.65.1, measured
// 2026-11-20); scripts/install-browsers.cjs does the same at install time.
export async function runInstallBrowsersCommand(): Promise<void> {
  const at = process.argv.indexOf("install-browsers");
  const rest = at >= 0 ? process.argv.slice(at + 1) : [];
  const browsers = rest.some((a) => !a.startsWith("-")) ? rest : ["chromium", ...rest];
  let cli: string;
  try {
    cli = join(dirname(createRequire(import.meta.url).resolve("playwright/package.json")), "cli.js");
  } catch (e) {
    console.error(`playwright is not installed next to cbrowser (${(e as Error).message}). Reinstall cbrowser.`);
    process.exit(1);
  }
  const result = spawnSync(process.execPath, [cli, "install", ...browsers], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}
