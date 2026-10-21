/**
 * On-disk stores a hosted tool reaches resolve under the calling account's
 * directory. (tenant, 2026-10-10)
 *
 * These read CBROWSER_DATA_DIR (or the home directory) directly, so on the
 * hosted servers every account shared one directory for them: site profiles
 * (encrypted cookies and storage per domain), campaigns.json, and the
 * screenshot, heatmap, transport-map and audit directories. Browsers built
 * during a hosted request took the same shared directory from
 * getDefaultConfig(). Each block: account B cannot list, inspect, run or
 * delete account A's entries, A still can, and an unscoped caller (CLI,
 * stdio, local) resolves exactly as before.
 *
 * Also pins the site-profile name check: "..", "." and "" addressed the data
 * directory and the profile root, and site_profile_delete removes its target
 * recursively.
 *
 * Every directory here is under a temporary root set before any import, and
 * the destructive test refuses to run unless that holds. No browser is
 * launched; site profiles are saved from a stub browser context.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";

const ROOT = mkdtempSync(join(tmpdir(), "cb-tenant-disk-"));
const saved = {
  dataDir: process.env.CBROWSER_DATA_DIR,
  mirror: process.env.CBROWSER_MIRROR_ROOT,
  artifacts: process.env.CBROWSER_ARTIFACT_DIR,
  mode: process.env.MCP_MODE,
};
process.env.CBROWSER_DATA_DIR = join(ROOT, "legacy");
process.env.CBROWSER_MIRROR_ROOT = join(ROOT, "mirror");
process.env.CBROWSER_ARTIFACT_DIR = join(ROOT, "artifacts");

const { withPersonaScope, accountDataDir } = await import("../src/persona-scope.js");
const { getDataDir, mergeConfig } = await import("../src/config.js");
const { SiteProfileManager } = await import("../src/browser/site-profile-manager.js");
const { registerSiteKnowledgeTools } = await import("../src/mcp-tools/base/site-knowledge-tools.js");
const { registerMarketingTools } = await import("../src/mcp-tools/base/marketing-tools.js");
const visualTools = await import("../src/mcp-tools/base/visual-testing-tools.js");
const auditTools = await import("../src/mcp-tools/base/audit-tools.js");
const ab = await import("../src/visual/ab-comparison.js");
const responsive = await import("../src/visual/responsive.js");
const crossBrowser = await import("../src/visual/cross-browser.js");
const { getTokenlessBrowser } = await import("../src/mcp-server-remote.js");

afterAll(() => {
  for (const [key, value] of [
    ["CBROWSER_DATA_DIR", saved.dataDir], ["CBROWSER_MIRROR_ROOT", saved.mirror],
    ["CBROWSER_ARTIFACT_DIR", saved.artifacts], ["MCP_MODE", saved.mode],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const A = 9501;
const B = 9502;
const asA = <T>(fn: () => T): T => withPersonaScope(A, fn);
const asB = <T>(fn: () => T): T => withPersonaScope(B, fn);

type Result = { isError?: boolean; content: Array<{ text: string }> };
type Handler = (args: Record<string, unknown>) => Promise<Result>;
function stubServer() {
  const tools: Record<string, Handler> = {};
  return { server: { registerTool(name: string, _c: unknown, h: Handler) { tools[name] = h; } }, tools };
}
const json = (r: Result) => JSON.parse(r.content[0].text) as Record<string, unknown>;

/** A browser context with one session cookie and no pages. */
const context = (domain: string) => ({
  cookies: async () => [{ name: "sid", value: "secret", domain, path: "/", expires: -1, httpOnly: true, secure: true, sameSite: "Lax" }],
  pages: () => [],
});
const saveProfile = (domain: string) =>
  new SiteProfileManager().saveProfile(domain, context(domain) as never, `https://${domain}/account`);

// ---------------------------------------------------------------------------
// Site profiles
// ---------------------------------------------------------------------------

describe("site profiles are per account", () => {
  const { server, tools } = stubServer();
  registerSiteKnowledgeTools(server as never, { getBrowser: async () => { throw new Error("no browser in this test"); } } as never);
  const listed = async () =>
    ((json(await tools.site_profile_list({})).profiles ?? []) as Array<{ domain: string }>).map((p) => p.domain);
  const status = async (domain: string) => json(await tools.site_profile_status({ domain })).status;

  test("another account cannot list or inspect a profile; its owner can", async () => {
    await asA(() => saveProfile("tenant-profile-a.example"));
    expect(await asA(listed)).toContain("tenant-profile-a.example");
    expect(await asA(() => status("tenant-profile-a.example"))).toBe("healthy");

    expect(await asB(listed)).not.toContain("tenant-profile-a.example");
    expect(await asB(() => status("tenant-profile-a.example"))).toBe("missing");
    expect(await listed()).not.toContain("tenant-profile-a.example");
  });

  test("another account cannot delete a profile", async () => {
    await asA(() => saveProfile("tenant-profile-keep.example"));
    const r = await asB(() => tools.site_profile_delete({ domain: "tenant-profile-keep.example" }));
    expect(json(r).success).toBe(false);
    expect(await asA(() => status("tenant-profile-keep.example"))).toBe("healthy");
  });

  test("unscoped (CLI, stdio, local) saves, lists and deletes as before", async () => {
    await saveProfile("tenant-profile-local.example");
    expect(existsSync(join(getDataDir(), "site-profiles", "tenant-profile-local.example", "meta.json"))).toBe(true);
    expect(await listed()).toContain("tenant-profile-local.example");
    expect(json(await tools.site_profile_delete({ domain: "tenant-profile-local.example" })).success).toBe(true);
    expect(await listed()).not.toContain("tenant-profile-local.example");
  });

  test("a profile name cannot address the data directory or the profile root", async () => {
    // Guard first: if these ever pointed outside the temporary root, a
    // regression would delete real data. Refuse to run rather than risk it.
    expect(getDataDir().startsWith(ROOT)).toBe(true);
    expect(accountDataDir(A).startsWith(ROOT)).toBe(true);

    await saveProfile("tenant-profile-root.example");
    const sentinel = join(getDataDir(), "tenant-sentinel.txt");
    writeFileSync(sentinel, "must survive");
    for (const domain of ["..", ".", ""]) {
      const r = await tools.site_profile_delete({ domain });
      expect(r.isError).toBe(true);
    }
    expect(existsSync(sentinel)).toBe(true);
    expect(await listed()).toContain("tenant-profile-root.example");
  });
});

// ---------------------------------------------------------------------------
// Marketing campaigns
// ---------------------------------------------------------------------------

describe("marketing campaigns are per account", () => {
  const { server, tools } = stubServer();
  // The campaign tools are live only on the demo and enterprise servers.
  beforeAll(() => {
    process.env.MCP_MODE = "demo";
    registerMarketingTools(server as never);
  });

  const create = (name: string) => tools.marketing_campaign_create({ name, url: "https://tenant.example/", goal: "sign up" });
  const run = (campaign_name: string) => tools.marketing_campaign_run({ campaign_name });

  test("another account cannot run, report to, list or collide with a campaign; its owner can", async () => {
    expect(json(await asA(() => create("tenant-camp-a"))).success).toBe(true);
    expect((await asA(() => run("tenant-camp-a"))).isError).toBeUndefined();

    expect((await asB(() => run("tenant-camp-a"))).isError).toBe(true);
    const report = await asB(() => tools.marketing_campaign_report_result({
      campaign_name: "tenant-camp-a", persona: "first-timer", goal_achieved: false, steps: 1,
    }));
    expect(report.isError).toBe(true);
    const miss = await asB(() => run("tenant-camp-none"));
    expect(JSON.stringify(miss)).not.toContain("tenant-camp-a");
    // The same name is free in B's own namespace instead of reporting A's campaign.
    expect(json(await asB(() => create("tenant-camp-a"))).success).toBe(true);

    expect((await run("tenant-camp-a")).isError).toBe(true);
  });

  test("unscoped (CLI, stdio, local) creates and runs as before", async () => {
    expect(json(await create("tenant-camp-local")).success).toBe(true);
    expect(existsSync(join(getDataDir(), "campaigns.json"))).toBe(true);
    expect((await run("tenant-camp-local")).isError).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Screenshot, heatmap, transport-map and audit directories
// ---------------------------------------------------------------------------

describe("output directories resolve under the caller's account", () => {
  const dirs: Array<[string, () => string, string]> = [
    ["ab_comparison screenshots", () => ab.getABScreenshotsPath(), "ab-comparison"],
    ["responsive_test screenshots", () => responsive.getResponsiveScreenshotsPath(), "responsive"],
    ["cross_browser_test screenshots", () => crossBrowser.getCrossBrowserScreenshotsPath(), "cross-browser"],
    ["transport_map SVGs", () => visualTools.transportMapsDir(), "transport-maps"],
  ];

  for (const [what, resolve, leaf] of dirs) {
    test(`${what}: the account's directory inside a scope, the data dir unscoped`, () => {
      expect(asA(resolve)).toBe(join(accountDataDir(A), leaf));
      expect(asB(resolve)).toBe(join(accountDataDir(B), leaf));
      expect(resolve()).toBe(join(getDataDir(), leaf));
    });
  }

  test("attention heatmap fallback: the account's directory inside a scope, ~/.cbrowser unscoped", () => {
    expect(asA(() => visualTools.heatmapFallbackDir())).toBe(join(accountDataDir(A), "heatmaps"));
    expect(visualTools.heatmapFallbackDir()).toBe(join(homedir(), ".cbrowser", "heatmaps"));
  });

  test("empathy_audit screenshots are written under the caller's account", () => {
    const png = Buffer.from("tenant").toString("base64");
    const scoped = asA(() => auditTools.writeAuditScreenshot(png, "first-timer"));
    expect(scoped.path?.startsWith(join(accountDataDir(A), "audit-screenshots"))).toBe(true);
    const unscoped = auditTools.writeAuditScreenshot(png, "first-timer");
    expect(unscoped.path?.startsWith(join(getDataDir(), "audit-screenshots"))).toBe(true);
  });

  test("a browser built inside a scope keeps its files in the account's directory", async () => {
    expect(asA(() => mergeConfig({}).dataDir)).toBe(accountDataDir(A));
    expect(mergeConfig({}).dataDir).toBe(getDataDir());
    // The account's own tokenless browser, and the shared legacy one.
    expect((await asA(() => getTokenlessBrowser())).getDataDir()).toBe(accountDataDir(A));
    // The shared legacy browser is one per process, built with the data dir that
    // was current when something first asked for it. Another file in the same
    // test process (account-scope-isolation) can build it first, which is the
    // file order CI used for the 20.0 release gate. The claim that matters holds
    // in any order: it never lives in an account's directory.
    const legacy = (await getTokenlessBrowser()).getDataDir();
    expect(legacy).not.toBe(accountDataDir(A));
    expect(legacy.split(/[\\/]/)).not.toContain("accounts");
  });
});
