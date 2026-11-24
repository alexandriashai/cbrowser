/**
 * Commands that run before any browser exists: config, uninstall,
 * install-skill / sync-skill, install-browsers.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
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
export async function runInstallSkillCommand(): Promise<void> {
  const path = await import("path");
  const fs = await import("fs");
  const os = await import("os");

  const skillDir = path.join(os.homedir(), ".claude", "skills", "CBrowser");
  const repoUrl = "https://raw.githubusercontent.com/alexandriashai/cbrowser/main";

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║         CBrowser Claude Skill Sync (auto-versioned)           ║
╚═══════════════════════════════════════════════════════════════╝
`);

  // Check if ~/.claude/skills exists
  const skillsDir = path.join(os.homedir(), ".claude", "skills");
  if (!fs.existsSync(skillsDir)) {
    console.log("Creating ~/.claude/skills directory...");
    fs.mkdirSync(skillsDir, { recursive: true });
  }

  // Download everything first and change nothing unless every file arrived.
  // This used to delete the installed skill (its .memory/sessions included)
  // before downloading, then print "Installed Successfully" even when every
  // download failed (audit 2026-10-21).
  console.log("Downloading skill files...");
  const files = [
    "SKILL.md",
    "Philosophy.md",
    "AIVision.md",
    "SessionManagement.md",
    "Credentials.md",
    "Personas.md",
    "Workflows/Navigate.md",
    "Workflows/Interact.md",
    "Workflows/Extract.md",
    "Workflows/Authenticate.md",
    "Workflows/Test.md",
    "Workflows/Journey.md",
    "Tools/CBrowser.ts",
  ];

  const downloaded = new Map<string, string>();
  const failed: string[] = [];
  for (const file of files) {
    try {
      const url = `${repoUrl}/skill/${file}`;
      console.log(`  - ${file}`);
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      downloaded.set(file, await response.text());
    } catch (e) {
      failed.push(`${file} (${(e as Error).message})`);
    }
  }
  if (failed.length > 0) {
    console.error(`✗ ${failed.length} of ${files.length} files could not be downloaded; the installed skill was left unchanged:`);
    for (const f of failed) console.error(`  ${f}`);
    process.exit(1);
  }

  console.log(fs.existsSync(skillDir) ? "Updating the installed skill..." : "Creating skill directory structure...");
  fs.mkdirSync(path.join(skillDir, "Workflows"), { recursive: true });
  fs.mkdirSync(path.join(skillDir, "Tools"), { recursive: true });
  fs.mkdirSync(path.join(skillDir, ".memory", "sessions"), { recursive: true });
  for (const [file, content] of downloaded) {
    fs.writeFileSync(path.join(skillDir, file), content, "utf-8");
  }

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              CBrowser Skill Installed Successfully!           ║
╚═══════════════════════════════════════════════════════════════╝

Skill installed to: ${skillDir}

Next steps:
  1. Add to your skill-index.json:
     "CBrowser": "${skillDir}/SKILL.md"

  2. Install all Playwright browsers (for cross-browser testing):
     npx playwright install

  3. Start using CBrowser in Claude Code!

Documentation: https://github.com/alexandriashai/cbrowser/wiki
`);
  return;
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
