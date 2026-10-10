/**
 * A site-profile domain cannot address anything outside site-profiles.
 * (site-profile path traversal, 2026-10-10)
 *
 * SiteProfileManager joined the sanitized domain under site-profiles, and the
 * character filter let "." and ".." through. deleteProfile removes its target
 * recursively, so site_profile_delete with domain ".." deleted the whole data
 * directory, and "." or "" deleted every profile.
 *
 * Everything here lives under one temporary directory. CBROWSER_DATA_DIR
 * points at it before anything is imported, and every test checks that
 * before it calls delete, so a run against unfixed code can only ever remove
 * temporary files. No browser: profiles are saved from a stub context.
 */
import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = mkdtempSync(join(tmpdir(), "cb-profile-traversal-"));
const DATA = join(ROOT, "data");
const PROFILES = join(DATA, "site-profiles");
const SENTINEL = join(DATA, "sentinel.txt");
const OUTSIDE = join(ROOT, "outside");
const savedDataDir = process.env.CBROWSER_DATA_DIR;
process.env.CBROWSER_DATA_DIR = DATA;

const { SiteProfileManager } = await import("../src/browser/site-profile-manager.js");
const { registerSiteKnowledgeTools } = await import("../src/mcp-tools/base/site-knowledge-tools.js");

afterAll(() => {
  if (savedDataDir === undefined) delete process.env.CBROWSER_DATA_DIR;
  else process.env.CBROWSER_DATA_DIR = savedDataDir;
  rmSync(ROOT, { recursive: true, force: true });
});

type Result = { isError?: boolean; content: Array<{ text: string }> };
const tools: Record<string, (args: Record<string, unknown>) => Promise<Result>> = {};
registerSiteKnowledgeTools(
  { registerTool: (name: string, _config: unknown, handler: (args: Record<string, unknown>) => Promise<Result>) => { tools[name] = handler; } } as never,
  { getBrowser: async () => { throw new Error("no browser in this test"); } } as never,
);
const body = (r: Result) => JSON.parse(r.content[0].text) as Record<string, unknown>;

/** A browser context with one cookie and no pages. */
const context = (domain: string) => ({
  cookies: async () => [{ name: "sid", value: "secret", domain, path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" }],
  pages: () => [],
});
const save = (domain: string) =>
  new SiteProfileManager().saveProfile(domain, context(domain) as never, `https://${domain}/`);
const profileExists = (domain: string) => existsSync(join(PROFILES, domain, "meta.json"));

/**
 * Refuse to go on unless every path in play is the temporary one. Called at
 * the top of each test, before anything is deleted, so a broken setup fails
 * the test instead of pointing a recursive delete somewhere real.
 */
function sandboxed(): void {
  if (process.env.CBROWSER_DATA_DIR !== DATA || !DATA.startsWith(tmpdir()) || !profileExists("keep.example")) {
    throw new Error(`not sandboxed: CBROWSER_DATA_DIR=${process.env.CBROWSER_DATA_DIR}`);
  }
}

beforeEach(async () => {
  expect(process.env.CBROWSER_DATA_DIR).toBe(DATA);
  rmSync(DATA, { recursive: true, force: true });
  rmSync(OUTSIDE, { recursive: true, force: true });
  mkdirSync(DATA, { recursive: true });
  mkdirSync(OUTSIDE, { recursive: true });
  writeFileSync(SENTINEL, "must survive");
  writeFileSync(join(OUTSIDE, "keep.txt"), "must survive");
  await save("keep.example");
  await save("drop.example");
});

describe("site_profile_delete refuses names that leave site-profiles", () => {
  for (const domain of ["..", ".", "", "a/../..", "...", "_", "%%"]) {
    test(`domain ${JSON.stringify(domain)} is refused and nothing is deleted`, async () => {
      sandboxed();
      const r = await tools.site_profile_delete({ domain });
      expect(r.isError).toBe(true);
      expect(String(body(r).error)).toContain("Invalid site profile domain");
      expect(existsSync(SENTINEL)).toBe(true);
      expect(profileExists("keep.example")).toBe(true);
      expect(profileExists("drop.example")).toBe(true);
    });
  }

  test("a profile entry symlinked outside site-profiles is refused", async () => {
    sandboxed();
    symlinkSync(OUTSIDE, join(PROFILES, "linked.example"));
    const r = await tools.site_profile_delete({ domain: "linked.example" });
    expect(r.isError).toBe(true);
    expect(existsSync(join(OUTSIDE, "keep.txt"))).toBe(true);
  });

  test("site_profile_status and saveProfile refuse the same names", async () => {
    sandboxed();
    const status = await tools.site_profile_status({ domain: ".." });
    expect(status.isError).toBe(true);
    await expect(save("..")).rejects.toThrow("Invalid site profile domain");
    // Nothing was written into the data directory itself.
    expect(existsSync(join(DATA, "meta.json"))).toBe(false);
  });
});

describe("normal domains are unaffected", () => {
  test("deleting a normal domain removes only its own profile", async () => {
    sandboxed();
    const r = await tools.site_profile_delete({ domain: "drop.example" });
    expect(r.isError).toBeUndefined();
    expect(body(r).success).toBe(true);
    expect(profileExists("drop.example")).toBe(false);
    expect(profileExists("keep.example")).toBe(true);
    expect(existsSync(SENTINEL)).toBe(true);
  });

  test("site_profile_list and site_profile_status still report saved profiles", async () => {
    sandboxed();
    const listed = (body(await tools.site_profile_list({})).profiles as Array<{ domain: string }>).map((p) => p.domain);
    expect(listed.sort()).toEqual(["drop.example", "keep.example"]);
    expect(body(await tools.site_profile_status({ domain: "keep.example" })).status).toBe("healthy");
  });
});
