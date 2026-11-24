/**
 * Both skill installers install exactly the skill's files and nothing else.
 *
 * Before 2026-11-23, scripts/install-skill.sh (still labelled v7.4.8) and
 * `cbrowser install-skill` each carried a hand-typed list of 13 files that had
 * drifted from the skill (four files never installed), the shell script deleted
 * the whole installed directory before downloading, and both told users to edit a
 * skill-index.json Claude Code does not read and to run `npx playwright install`.
 * These tests run both installers into a temporary directory and compare the
 * result with plugins/cbrowser/skills/cbrowser/, file by file.
 *
 * No network: the shell script reads from a file:// base, the CLI copies from the
 * package. No browser: install-browsers runs Playwright's --dry-run.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listSkillFiles } from "../src/cli/commands/setup.js";

const ROOT = join(import.meta.dir, "..");
const SKILL = join(ROOT, "plugins/cbrowser/skills/cbrowser");
const SCRIPT = join(ROOT, "scripts/install-skill.sh");
const canonical = listSkillFiles(SKILL);

function sameTree(dir: string): void {
  for (const f of canonical) {
    expect(existsSync(join(dir, f)), f).toBe(true);
    expect(readFileSync(join(dir, f), "utf8"), f).toBe(readFileSync(join(SKILL, f), "utf8"));
  }
}

function runScript(base: string, dest: string) {
  return spawnSync("bash", [SCRIPT], {
    env: { ...process.env, CBROWSER_SKILL_BASE: base, CBROWSER_SKILL_DIR: dest },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runCli(args: string[], home: string) {
  return spawnSync(process.execPath, [join(ROOT, "src/cli.ts"), ...args], {
    env: { ...process.env, HOME: home, CBROWSER_DATA_DIR: join(home, ".cbrowser") },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  });
}

describe("scripts/install-skill.sh", () => {
  test("its file list is exactly the skill's files", () => {
    const body = readFileSync(SCRIPT, "utf8");
    const list = /SKILL_FILES=\(\n([\s\S]*?)\n\)/.exec(body)![1].split("\n").map((l) => l.trim()).filter(Boolean);
    expect([...list].sort()).toEqual(canonical);
  });

  test("installs every file, keeps a file the user added, and gives no stale advice", () => {
    const dest = join(mkdtempSync(join(tmpdir(), "cb-skill-sh-")), "CBrowser");
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "my-notes.md"), "mine");
    const r = runScript(`file://${SKILL}`, dest);
    expect(r.status, r.stderr).toBe(0);
    sameTree(dest);
    expect(readFileSync(join(dest, "my-notes.md"), "utf8")).toBe("mine");
    expect(r.stdout).not.toContain("skill-index");
    expect(r.stdout).not.toContain("npx playwright");
  });

  test("Anti: a failed download changes nothing", () => {
    const src = mkdtempSync(join(tmpdir(), "cb-skill-src-"));
    cpSync(SKILL, src, { recursive: true });
    rmSync(join(src, "Workflows/Test.md"));
    const dest = join(mkdtempSync(join(tmpdir(), "cb-skill-sh-")), "CBrowser");
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "SKILL.md"), "old install");
    const r = runScript(`file://${src}`, dest);
    expect(r.status).toBe(1);
    expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toBe("old install");
    expect(existsSync(join(dest, "Workflows"))).toBe(false);
  });
});

describe("cbrowser install-skill", () => {
  test("copies the packaged skill into ~/.claude/skills/CBrowser and keeps a file the user added", () => {
    const home = mkdtempSync(join(tmpdir(), "cb-skill-cli-"));
    const dest = join(home, ".claude/skills/CBrowser");
    mkdirSync(join(dest, "Tools"), { recursive: true });
    writeFileSync(join(dest, "my-notes.md"), "mine");
    writeFileSync(join(dest, "Tools/CBrowser.ts"), "// old v5 tool");
    const r = runCli(["install-skill"], home);
    expect(r.status, r.stderr).toBe(0);
    sameTree(dest);
    expect(readFileSync(join(dest, "my-notes.md"), "utf8")).toBe("mine");
    // An old install's retired tool is reported, never deleted.
    expect(existsSync(join(dest, "Tools/CBrowser.ts"))).toBe(true);
    expect(r.stdout).toContain("Tools/CBrowser.ts");
    expect(r.stdout).not.toContain("skill-index");
    expect(r.stdout).not.toContain("npx playwright");
  });
});

describe("cbrowser install-browsers", () => {
  test("runs the bundled Playwright's installer, chromium by default", () => {
    const home = mkdtempSync(join(tmpdir(), "cb-browsers-"));
    const r = runCli(["install-browsers", "--dry-run"], home);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.toLowerCase()).toContain("chromium");
    expect(r.stdout).not.toMatch(/browser: firefox/i);
  });

  test("passes the named browsers through", () => {
    const home = mkdtempSync(join(tmpdir(), "cb-browsers-"));
    const r = runCli(["install-browsers", "firefox", "--dry-run"], home);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.toLowerCase()).toContain("firefox");
  });
});
