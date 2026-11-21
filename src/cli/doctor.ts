/**
 * The doctor command: environment health check.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { getDataDir } from "../config.js";
import { existsSync } from "node:fs";
import { isApiKeyConfigured } from "../cognitive/index.js";
import { VERSION } from "../version.js";
import { emitJson } from "../output.js";

/**
 * The lowest Node version on each supported line, as [major, minor]: the lower
 * bounds of package.json engines.node ("^20.19.0 || >=22.12.0"). Doctor checked
 * ">= 20.9" after 21.5.3 raised engines, so it passed 20.9-20.18 and
 * 22.0-22.11, the versions that raise was for (outside review, 2026-11-21).
 * tests/doctor-node-floor.test.ts holds this list to engines.node.
 */
export const NODE_FLOORS: ReadonlyArray<readonly [number, number]> = [[20, 19], [22, 12]];

/** True when `version` ("22.11.0") satisfies engines.node. */
export function nodeMeetsEngines(version: string): boolean {
  const [major, minor] = version.split(".").map((n) => parseInt(n, 10));
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
  const last = NODE_FLOORS[NODE_FLOORS.length - 1];
  if (major > last[0]) return true;
  const floor = NODE_FLOORS.find(([maj]) => maj === major);
  return floor !== undefined && minor >= floor[1];
}

/**
 * Doctor command — validates environment health with pass/fail checks.
 * Checks: Node version, Playwright chromium, API key, data directory.
 */
export async function runDoctor(outputOpts: import("../output.js").OutputOptions): Promise<void> {
  const fs = await import("fs");
  const { execSync } = await import("child_process");

  interface DoctorCheck {
    name: string;
    status: "pass" | "fail" | "warn";
    message: string;
    fix?: string;
  }

  const checks: DoctorCheck[] = [];

  // Check 1: Node.js version, against the same floors as engines.node.
  const nodeVersion = process.versions.node;
  const nodeRequired = NODE_FLOORS.map(([maj, min]) => `${maj}.${min}+`).join(" or ");
  if (nodeMeetsEngines(nodeVersion)) {
    checks.push({ name: "Node.js", status: "pass", message: `v${nodeVersion} (${nodeRequired} required)` });
  } else {
    checks.push({
      name: "Node.js",
      status: "fail",
      message: `v${nodeVersion} (${nodeRequired} required)`,
      fix: `Install Node.js ${nodeRequired} from https://nodejs.org`,
    });
  }

  // Check 2: Playwright chromium — the binary must actually be on disk.
  //
  // This used to shell out to `npx playwright install --dry-run chromium`, which
  // only PRINTS the install plan and exits 0 whether or not the browser exists —
  // so the check could not go red. Demonstrated 2026-07-26: with
  // PLAYWRIGHT_BROWSERS_PATH=/nonexistent-browsers-xyz the dry-run still exited 0
  // and doctor still reported "Playwright Chromium: Installed". A health check
  // that cannot fail is worse than no health check, because it is believed.
  // executablePath() resolves the path Playwright would actually launch, so an
  // absent browser now fails the way a missing browser should.
  try {
    const { chromium } = await import("playwright");
    const exe = chromium.executablePath();
    if (exe && existsSync(exe)) {
      checks.push({ name: "Playwright Chromium", status: "pass", message: `Installed (${exe})` });
    } else {
      checks.push({
        name: "Playwright Chromium",
        status: "fail",
        message: exe ? `Not on disk at ${exe}` : "Playwright reports no chromium executable path",
        fix: "Run: npx playwright install chromium",
      });
    }
  } catch (err) {
    checks.push({
      name: "Playwright Chromium",
      status: "fail",
      message: `Not installed or not resolvable (${err instanceof Error ? err.message : String(err)})`,
      fix: "Run: npx playwright install chromium",
    });
  }

  // Check 3: API key
  const hasApiKey = isApiKeyConfigured();
  if (hasApiKey) {
    checks.push({ name: "Anthropic API Key", status: "pass", message: "Configured" });
  } else {
    checks.push({
      name: "Anthropic API Key",
      status: "warn",
      message: "Not configured (cognitive features require it, basic commands work without it)",
      fix: "Run: cbrowser config set-api-key <your-key>",
    });
  }

  // Check 4: Data directory
  const dataDir = getDataDir();
  try {
    await fs.promises.access(dataDir, fs.constants.W_OK);
    checks.push({ name: "Data Directory", status: "pass", message: dataDir });
  } catch {
    checks.push({
      name: "Data Directory",
      status: "fail",
      message: `${dataDir} (not writable)`,
      fix: process.platform === "win32"
        ? "Check directory permissions in Properties"
        : `Run: sudo chown -R $USER:$USER ${dataDir}`,
    });
  }

  // Output results
  if (outputOpts.json) {
    const jsonResult: import("../output.js").JsonOutput = {
      success: checks.every(c => c.status !== "fail"),
      command: "doctor",
      data: { checks },
      meta: { version: VERSION },
    };
    emitJson(jsonResult);
    // Same rule as the human path below: a failed check must be visible to a
    // shell, not only to a reader.
    if (!jsonResult.success) process.exitCode = 1;
    return;
  }

  const passSymbol = outputOpts.plain ? "[PASS]" : "✅";
  const failSymbol = outputOpts.plain ? "[FAIL]" : "❌";
  const warnSymbol = outputOpts.plain ? "[WARN]" : "⚠️";

  console.log("");
  console.log(outputOpts.plain
    ? `CBrowser Doctor v${VERSION}`
    : `🩺 CBrowser Doctor v${VERSION}`
  );
  console.log(outputOpts.plain ? "---" : "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  for (const check of checks) {
    const symbol = check.status === "pass" ? passSymbol
      : check.status === "fail" ? failSymbol
      : warnSymbol;
    console.log(`${symbol} ${check.name}: ${check.message}`);
    if (check.fix) {
      console.log(`     Fix: ${check.fix}`);
    }
  }

  console.log("");
  const failCount = checks.filter(c => c.status === "fail").length;
  const warnCount = checks.filter(c => c.status === "warn").length;

  if (failCount === 0 && warnCount === 0) {
    console.log(outputOpts.plain
      ? "All checks passed. CBrowser is ready."
      : "🎉 All checks passed. CBrowser is ready!"
    );
  } else if (failCount === 0) {
    console.log(outputOpts.plain
      ? `All critical checks passed. ${warnCount} warning(s).`
      : `✅ All critical checks passed. ${warnCount} warning(s).`
    );
  } else {
    console.log(outputOpts.plain
      ? `${failCount} check(s) failed. Fix the issues above to use CBrowser.`
      : `❌ ${failCount} check(s) failed. Fix the issues above to use CBrowser.`
    );
  }
  console.log("");

  // A health command that reports failures and still exits 0 cannot gate
  // anything — `cbrowser doctor && deploy` would proceed on a broken
  // environment, and the project ISA's own probe for this criterion is
  // "doctor exits 0", which was unfalsifiable as a result. Failures now exit 1;
  // warnings still exit 0, since a warning is not a broken environment.
  if (failCount > 0) process.exitCode = 1;
}
