#!/usr/bin/env bun
/**
 * CBrowser CLI Wrapper for PAI Skills
 *
 * This is a thin wrapper that calls the cbrowser npm package.
 * Ensure cbrowser is installed: npm install -g cbrowser
 */

import { spawn } from "child_process";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
CBrowser CLI Wrapper

Usage: bun run Tools/CBrowser.ts <command> [options]

Commands:
  navigate <url>              Navigate to URL
  click <selector>            Click element
  smart-click <selector>      Click with auto-retry
  fill <selector> <value>     Fill form field
  extract <what>              Extract data
  screenshot [path]           Take screenshot
  session save|load|list      Session management
  auth <site>                 Authenticate with stored credentials
  creds add|list|delete       Credential management
  persona list|create|show    Persona management
  journey <persona>           Run autonomous journey
  compare-personas            Compare multiple personas
  test-suite <file>           Run natural language tests
  repair-tests <file>         Auto-repair broken tests
  flaky-check <file>          Detect flaky tests
  ai-visual capture|test      Visual regression testing
  cross-browser <url>         Cross-browser testing
  responsive <url>            Responsive testing
  ab <url1> <url2>            A/B comparison
  hunt-bugs <url>             Autonomous bug hunting
  chaos-test <url>            Chaos engineering

Examples:
  bun run Tools/CBrowser.ts navigate "https://example.com"
  bun run Tools/CBrowser.ts smart-click "Login button"
  bun run Tools/CBrowser.ts journey "first-timer" --start "https://example.com" --goal "Sign up"

For full documentation: https://github.com/alexandriashai/cbrowser/wiki
`);
  process.exit(0);
}

// Execute cbrowser command
const cbrowser = spawn("npx", ["cbrowser", ...args], {
  stdio: "inherit",
  shell: true,
});

cbrowser.on("error", (err) => {
  console.error("Error running cbrowser:", err.message);
  console.error("Make sure cbrowser is installed: npm install -g cbrowser");
  process.exit(1);
});

cbrowser.on("close", (code) => {
  process.exit(code ?? 0);
});
