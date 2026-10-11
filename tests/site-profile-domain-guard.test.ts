/**
 * site_profile_delete cannot remove anything outside its own profile
 * (hotfix 19.3.7, 2026-10-10).
 *
 * domainDir() replaced characters outside [a-zA-Z0-9._-] with "_", so "." and
 * ".." passed unchanged: site_profile_delete with domain ".." ran a recursive
 * rm on the data directory itself (on the hosted servers, the shared
 * /root/.cbrowser holding every account's data), and "" or "." removed the
 * whole site-profiles directory. Every path here lives under a fresh temp dir
 * set before the module is imported, and the test asserts that before it
 * calls delete, so the red run on the old code only ever removes temp files.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, realpathSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

type Handler = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;

const savedDataDir = process.env.CBROWSER_DATA_DIR;
const tmpRoot = realpathSync(tmpdir());
let dataDir = "";
let profiles = "";
let sentinel = "";
let SiteProfileManager: typeof import("../src/browser/site-profile-manager.js").SiteProfileManager;
let deleteTool: Handler;

function seed(): void {
  mkdirSync(join(profiles, "example.com"), { recursive: true });
  writeFileSync(join(profiles, "example.com", "meta.json"), "{}");
  mkdirSync(join(profiles, "other.com"), { recursive: true });
  writeFileSync(join(profiles, "other.com", "meta.json"), "{}");
  writeFileSync(sentinel, "must survive");
}

function intact(): void {
  expect(existsSync(sentinel)).toBe(true);
  expect(existsSync(join(profiles, "example.com", "meta.json"))).toBe(true);
  expect(existsSync(join(profiles, "other.com", "meta.json"))).toBe(true);
}

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpRoot, "cbrowser-sp-guard-"));
  profiles = join(dataDir, "site-profiles");
  sentinel = join(dataDir, "sentinel.txt");
  process.env.CBROWSER_DATA_DIR = dataDir;
  ({ SiteProfileManager } = await import("../src/browser/site-profile-manager.js"));
  const { registerSiteKnowledgeTools } = await import("../src/mcp-tools/base/site-knowledge-tools.js");
  const handlers: Record<string, Handler> = {};
  registerSiteKnowledgeTools(
    { registerTool: (name: string, _c: unknown, h: Handler) => { handlers[name] = h; } } as never,
    { getBrowser: async () => { throw new Error("no browser in this test"); }, getBrowserByToken: () => undefined } as never,
  );
  deleteTool = handlers["site_profile_delete"];
});

afterAll(() => {
  if (savedDataDir === undefined) delete process.env.CBROWSER_DATA_DIR;
  else process.env.CBROWSER_DATA_DIR = savedDataDir;
  if (dataDir.startsWith(join(tmpRoot, "cbrowser-sp-guard-"))) rmSync(dataDir, { recursive: true, force: true });
});

describe("site profile names stay inside site-profiles", () => {
  test("the data dir is a temp dir, so nothing real can be removed", () => {
    expect(dataDir.startsWith(join(tmpRoot, "cbrowser-sp-guard-"))).toBe(true);
    expect(process.env.CBROWSER_DATA_DIR).toBe(dataDir);
  });

  for (const domain of ["..", ".", ""]) {
    test(`deleteProfile(${JSON.stringify(domain)}) is refused and removes nothing`, async () => {
      seed();
      await expect(new SiteProfileManager(dataDir).deleteProfile(domain)).rejects.toThrow(/Invalid site profile domain/);
      intact();
    });
  }

  test("a name with a path separator is refused and removes nothing", async () => {
    seed();
    await expect(new SiteProfileManager(dataDir).deleteProfile("a/../..")).rejects.toThrow(/Invalid site profile domain/);
    intact();
  });

  test("site_profile_delete with '..' returns isError and removes nothing", async () => {
    seed();
    const res = await deleteTool({ domain: ".." });
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text).error).toMatch(/Invalid site profile domain/);
    intact();
  });

  test("a real domain still deletes only its own profile", async () => {
    seed();
    const res = await deleteTool({ domain: "example.com" });
    expect(res.isError).toBeUndefined();
    expect(JSON.parse(res.content[0].text).success).toBe(true);
    expect(existsSync(join(profiles, "example.com"))).toBe(false);
    expect(existsSync(join(profiles, "other.com", "meta.json"))).toBe(true);
    expect(existsSync(sentinel)).toBe(true);
  });
});
