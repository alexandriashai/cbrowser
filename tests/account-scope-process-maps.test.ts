/**
 * Process-wide maps on the hosted server hold each entry for the account that
 * wrote it. (tenant, 2026-10-10)
 *
 * Both hosted servers run one process for every account. Several module-level
 * maps were keyed without the account, so one account's entries were listed,
 * read, overwritten or stopped by another:
 *
 *   ui-resources.ts captureHtml        capture players, keyed by slug alone
 *   capture-tools.ts sessions/finished  one "__default__" slot for tokenless
 *                                       calls; status scanned every session
 *   persona-creation-tools.ts           one "default-session" questionnaire
 *   persona-values.ts registry          CMS custom-persona values, global
 *   personas.ts RUNTIME_PERSONAS        created/updated personas, global
 *   site-model/manager.ts singleton     site knowledge, one per process
 *
 * Each block: account B cannot list, read, stop, overwrite or resolve account
 * A's entry; A still can; an unscoped caller (CLI, stdio, local) behaves as
 * before. Scopes are entered exactly as the hosted server enters them
 * (withPersonaScope, withRequestIdentity). No browser is launched: capture
 * sessions run on a stubbed engine, journeys on a stub browser, and the CMS
 * is a recorder in place of globalThis.fetch.
 */
import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = mkdtempSync(join(tmpdir(), "cb-tenant-"));
// Assigned, not ??=: an earlier file's value is that file's temp dir (often
// already removed), and the unscoped "tenant-created-local" persona below
// would be written there. Restored and removed in afterAll.
const priorDataDir = process.env.CBROWSER_DATA_DIR;
const priorMirrorRoot = process.env.CBROWSER_MIRROR_ROOT;
process.env.CBROWSER_DATA_DIR = join(ROOT, "legacy");
process.env.CBROWSER_MIRROR_ROOT = join(ROOT, "mirror");

const { withPersonaScope } = await import("../src/persona-scope.js");
const { withRequestIdentity } = await import("../src/request-context.js");
const { registerUiResources, publishCaptureUi, CAPTURE_UI_PREFIX } = await import("../src/mcp-tools/ui-resources.js");
const { registerCaptureTools, startCapture, stopCapture, captureStatus, clearCaptureSessions } = await import("../src/mcp-tools/base/capture-tools.js");
const { VideoCaptureSession } = await import("../src/recording/engine.js");
const { registerPersonaCreationTools } = await import("../src/mcp-tools/persona-creation-tools.js");
const { registerCognitiveTools, setSessionApiKey } = await import("../src/mcp-tools/base/cognitive-tools.js");
const { getPersonaValues, PERSONA_VALUE_PROFILES } = await import("../src/values/persona-values.js");
const { getAnyPersona, listAllPersonas } = await import("../src/personas.js");
const { ALL_TRAITS } = await import("../src/values/persona-completeness.js");
const { SiteModelManager } = await import("../src/site-model/manager.js");

const A = 9301;
const B = 9302;
const asA = <T>(fn: () => T): T => withPersonaScope(A, fn);
const asB = <T>(fn: () => T): T => withPersonaScope(B, fn);
/** A hosted request that resolved to no account: identity context, no scope. */
const hostedNoAccount = <T>(fn: () => T, apiKey?: string): T =>
  withRequestIdentity({ keyHash: null, tier: null, apiKey }, fn);
/** A hosted request from an account: identity with its key, inside its scope. */
const hosted = <T>(accountId: number, apiKey: string, fn: () => T): T =>
  withRequestIdentity({ keyHash: `hash-${accountId}`, tier: null, apiKey }, () => withPersonaScope(accountId, fn));

type Result = { isError?: boolean; content: Array<{ type: string; text: string }>; _meta?: unknown };
type Handler = (args: Record<string, unknown>, extra?: Record<string, unknown>) => Promise<Result>;

/** Records registerTool / registerResource the way the MCP SDK receives them. */
function stubServer() {
  const tools: Record<string, Handler> = {};
  const resources: Record<string, { target: unknown; handler: (...a: unknown[]) => Promise<{ contents: Array<{ text: string }> }> }> = {};
  const server = {
    registerTool(name: string, _config: unknown, handler: Handler) { tools[name] = handler; },
    registerResource(name: string, target: unknown, _meta: unknown, handler: (...a: unknown[]) => Promise<{ contents: Array<{ text: string }> }>) {
      resources[name] = { target, handler };
    },
  };
  return { server, tools, resources };
}

const json = (r: Result) => JSON.parse(r.content[0].text) as Record<string, unknown>;

// ---------------------------------------------------------------------------
// Fake CMS
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch;
const realArtifactDir = process.env.CBROWSER_ARTIFACT_DIR;
const realCmsUrl = process.env.CMS_URL;

/** Custom personas the fake CMS holds per key, with values distinctive enough to recognise. */
const cmsRow = (name: string, power: number) => ({
  name, slug: name, description: "tenant probe persona", traits: "{}", source: "cms",
  schwartz_values: JSON.stringify({ power, security: 1 - power, selfDirection: 0.5 }),
});
const CMS_PERSONAS: Record<string, Array<ReturnType<typeof cmsRow>>> = {
  cbk_tenant_A: [cmsRow("tenant-values-alpha", 0.97)],
  cbk_tenant_C: [cmsRow("tenant-values-gamma", 0.91)],
  cbk_tenant_U: [cmsRow("tenant-values-local", 0.93)],
};

beforeAll(() => {
  process.env.CMS_URL = "http://cms.invalid";
  process.env.CBROWSER_ARTIFACT_DIR = join(ROOT, "artifacts");
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (url.endsWith("/api/personas") && (init?.method ?? "GET") === "GET") {
      const key = (headers.Authorization ?? "").replace(/^Bearer /, "");
      return new Response(JSON.stringify({ personas: CMS_PERSONAS[key] ?? [] }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
  if (realArtifactDir === undefined) delete process.env.CBROWSER_ARTIFACT_DIR;
  else process.env.CBROWSER_ARTIFACT_DIR = realArtifactDir;
  for (const [k, v] of [["CBROWSER_DATA_DIR", priorDataDir], ["CBROWSER_MIRROR_ROOT", priorMirrorRoot]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  rmSync(ROOT, { recursive: true, force: true });
  if (realCmsUrl === undefined) delete process.env.CMS_URL;
  else process.env.CMS_URL = realCmsUrl;
  setSessionApiKey(undefined);
});

// ---------------------------------------------------------------------------
// 1. Capture players served as ui:// resources
// ---------------------------------------------------------------------------

describe("capture players (ui:// resources) are per account", () => {
  const { server, resources } = stubServer();
  registerUiResources(server as never);
  const capture = resources["cbrowser-capture-ui"];
  const template = capture.target as { listCallback?: (extra: unknown) => Promise<{ resources: Array<{ uri: string }> }> };
  const list = async () =>
    (await template.listCallback!({})).resources.map((r) => r.uri).filter((u) => u.startsWith(CAPTURE_UI_PREFIX));
  const read = async (slug: string) =>
    (await capture.handler(new URL(`${CAPTURE_UI_PREFIX}${slug}`), { slug })).contents[0].text;

  test("another account cannot list or read a player; its owner can", async () => {
    await asA(async () => publishCaptureUi("tenant-a-only", "<p>A-ONLY</p>"));
    expect(await asB(list)).not.toContain(`${CAPTURE_UI_PREFIX}tenant-a-only`);
    const seenByB = await asB(() => read("tenant-a-only"));
    expect(seenByB).not.toContain("A-ONLY");
    expect(seenByB).toContain("no longer held in memory");
    // The owner's view is what makes the refusal above mean something.
    expect(await asA(list)).toContain(`${CAPTURE_UI_PREFIX}tenant-a-only`);
    expect(await asA(() => read("tenant-a-only"))).toContain("A-ONLY");
  });

  test("a same-named player from another account does not overwrite the owner's", async () => {
    await asA(async () => publishCaptureUi("tenant-same", "<p>A-SAME</p>"));
    await asB(async () => publishCaptureUi("tenant-same", "<p>B-SAME</p>"));
    expect(await asA(() => read("tenant-same"))).toContain("A-SAME");
    expect(await asB(() => read("tenant-same"))).toContain("B-SAME");
  });

  test("an unscoped caller does not see account players", async () => {
    await asA(async () => publishCaptureUi("tenant-a-hidden", "<p>A-HIDDEN</p>"));
    expect(await list()).not.toContain(`${CAPTURE_UI_PREFIX}tenant-a-hidden`);
    expect(await read("tenant-a-hidden")).not.toContain("A-HIDDEN");
  });

  test("unscoped (CLI, stdio, local) publishes, lists and reads as before", async () => {
    const uri = publishCaptureUi("tenant-local", "<p>LOCAL</p>");
    expect(uri).toBe(`${CAPTURE_UI_PREFIX}tenant-local`);
    expect(await list()).toContain(uri);
    expect(await read("tenant-local")).toContain("LOCAL");
  });
});

// ---------------------------------------------------------------------------
// 2. Screen capture sessions
// ---------------------------------------------------------------------------

describe("screen captures are per account", () => {
  // The engine records real pixels; these tests are about which caller owns
  // which session, so its three lifecycle methods are stubbed for this block
  // and restored after it.
  type Fake = { state: "idle" | "recording" | "stopped"; slug: string; outDir: string; manifestPath?: string };
  const proto = VideoCaptureSession.prototype as unknown as Record<string, unknown>;
  const real = { start: proto.start, stop: proto.stop, status: proto.status };
  let seq = 0;

  const manifestFor = (slug: string) => ({
    version: 1, slug, engine: "chromium", capture_method: "cdp-screencast", target_fps: 10, actual_fps: 10,
    viewport: { width: 800, height: 600, deviceScaleFactor: 1 }, target: { kind: "viewport" },
    start_trigger: null, stop_trigger: null, trigger_timeout: false, started_at: new Date().toISOString(),
    duration_ms: 1000, output_dims: { width: 800, height: 600 }, frames: [], change_points: [], frame_gaps: [],
    region_clamped: false, artifacts: {},
  });

  beforeAll(() => {
    proto.status = function (this: { __fake?: Fake }) {
      const f = this.__fake ?? { state: "idle", slug: "", outDir: "" };
      return {
        state: f.state, slug: f.slug, outDir: f.outDir, frames: 0, elapsedMs: 0, captureMethod: "cdp-screencast",
        ...(f.manifestPath ? { manifestPath: f.manifestPath } : {}),
      };
    };
    proto.start = async function (this: { __fake?: Fake; status: () => unknown }, opts: { slug?: string } = {}) {
      const slug = opts.slug ?? `tenant-cap-${++seq}`;
      this.__fake = { state: "recording", slug, outDir: join(ROOT, "videos", slug) };
      return this.status();
    };
    proto.stop = async function (this: { __fake: Fake }) {
      this.__fake.state = "stopped";
      this.__fake.manifestPath = join(this.__fake.outDir, "manifest.json");
      return { manifestPath: this.__fake.manifestPath, manifest: manifestFor(this.__fake.slug), encodeErrors: {} };
    };
  });

  afterAll(() => {
    proto.start = real.start;
    proto.stop = real.stop;
    proto.status = real.status;
    clearCaptureSessions();
  });

  beforeEach(() => clearCaptureSessions());

  const page = {
    context: () => ({ browser: () => ({ browserType: () => ({ name: () => "chromium" }) }) }),
    viewportSize: () => ({ width: 800, height: 600 }),
    setViewportSize: async () => {},
  };
  const browser = {
    getPage: async () => page,
    navigate: async () => {},
    screenshot: async () => { throw new Error("no screenshot in this test"); },
  };
  // No getBrowserByToken: every call is tokenless, the "__default__" slot.
  const { server, tools } = stubServer();
  registerCaptureTools(server as never, { getBrowser: async () => browser } as never);

  test("a tokenless capture_stop from another account does not stop the owner's capture", async () => {
    const started = await asA(() => tools.capture_start({ name: "tenant-a-cap" }));
    expect(json(started)).toMatchObject({ success: true, slug: "tenant-a-cap" });

    const byB = await asB(() => tools.capture_stop({}));
    expect(byB.isError).toBe(true);
    expect(JSON.stringify(byB)).not.toContain("tenant-a-cap");

    expect(json(await asA(() => tools.capture_status({})))).toMatchObject({ state: "recording", slug: "tenant-a-cap" });
    expect(json(await asA(() => tools.capture_stop({})))).toMatchObject({ success: true, slug: "tenant-a-cap" });
  });

  test("capture_status never reports another account's running or finished capture", async () => {
    await asA(() => startCapture(browser as never, { name: "tenant-a-running" }, "tok-a"));
    const whileRunning = asB(() => captureStatus("tok-b"));
    expect(JSON.stringify(whileRunning)).not.toContain("tenant-a-running");
    expect(whileRunning.state).toBe("idle");

    await asA(() => stopCapture("tok-a"));
    const afterStop = asB(() => captureStatus("tok-b"));
    expect(JSON.stringify(afterStop)).not.toContain("tenant-a-running");
    expect(afterStop.state).toBe("idle");

    // Another token of the owner's still finds its account's last capture.
    expect(asA(() => captureStatus("tok-a2"))).toMatchObject({ state: "stopped", slug: "tenant-a-running" });
  });

  test("unscoped (CLI, stdio, local) start, status and stop behave as before", async () => {
    expect(json(await tools.capture_start({ name: "tenant-local-cap" }))).toMatchObject({ success: true });
    expect(json(await tools.capture_status({}))).toMatchObject({ state: "recording", slug: "tenant-local-cap" });
    expect(json(await tools.capture_stop({}))).toMatchObject({ success: true, slug: "tenant-local-cap" });
    expect(json(await tools.capture_status({}))).toMatchObject({ state: "stopped", slug: "tenant-local-cap" });
  });
});

// ---------------------------------------------------------------------------
// 3. Persona questionnaires
// ---------------------------------------------------------------------------

describe("persona questionnaires are per account", () => {
  const { server, tools } = stubServer();
  registerPersonaCreationTools(server as never);
  const cancel = (extra?: Record<string, unknown>) => tools.persona_create_cancel({}, extra);

  beforeEach(async () => {
    await asA(() => cancel());
    await asB(() => cancel());
    await cancel();
  });

  test("another account cannot see, advance or cancel a questionnaire in progress", async () => {
    await asA(() => tools.persona_create_questionnaire_start({ persona_name: "tenant-alpha-secret" }));

    const start = await asB(() => tools.persona_create_start({ persona_name: "tenant-b-new" }));
    expect(JSON.stringify(start)).not.toContain("tenant-alpha-secret");

    const answer = await asB(() => tools.persona_create_questionnaire_answer({ answer_value: 0.5 }));
    expect(answer.isError).toBe(true);
    expect(json(answer).error).toBe("No questionnaire session in progress");

    expect(json(await asB(() => cancel())).message).toBe("No questionnaire session to cancel");

    // Untouched by any of it: the owner's slot still holds its questionnaire at question 1.
    expect(json(await asA(() => cancel()))).toMatchObject({
      cancelled: true, persona_name: "tenant-alpha-secret", progress_lost: "0 questions answered",
    });
  });

  test("another account starting its own questionnaire does not replace the owner's", async () => {
    await asA(() => tools.persona_create_questionnaire_start({ persona_name: "tenant-alpha" }));
    await asB(() => tools.persona_create_questionnaire_start({ persona_name: "tenant-beta" }));
    await asA(() => tools.persona_create_questionnaire_answer({ answer_value: 0.5 }));
    expect(json(await asA(() => cancel()))).toMatchObject({ persona_name: "tenant-alpha", progress_lost: "1 questions answered" });
    expect(json(await asB(() => cancel()))).toMatchObject({ persona_name: "tenant-beta", progress_lost: "0 questions answered" });
  });

  test("a hosted request with no account is refused rather than given a shared slot", async () => {
    for (const call of [
      () => tools.persona_create_questionnaire_start({ persona_name: "tenant-anon" }),
      () => tools.persona_create_questionnaire_answer({ answer_value: 0.5 }),
      () => cancel(),
    ]) {
      const r = await hostedNoAccount(call);
      expect(r.isError).toBe(true);
      expect(json(r).error).toBe("account_required");
    }
    // The describe route needs no slot, so the mode chooser still answers.
    const start = await hostedNoAccount(() => tools.persona_create_start({ persona_name: "tenant-anon" }));
    expect(start.isError).toBeUndefined();
  });

  test("two MCP sessions of one account keep separate questionnaires", async () => {
    await asA(() => tools.persona_create_questionnaire_start({ persona_name: "tenant-s1" }, { sessionId: "s1" }));
    expect(json(await asA(() => cancel({ sessionId: "s2" }))).message).toBe("No questionnaire session to cancel");
    expect(json(await asA(() => cancel({ sessionId: "s1" })))).toMatchObject({ persona_name: "tenant-s1" });
  });

  test("unscoped (CLI, stdio, local) start, answer and cancel behave as before", async () => {
    await tools.persona_create_questionnaire_start({ persona_name: "tenant-local" });
    const answer = await tools.persona_create_questionnaire_answer({ answer_value: 0.5 });
    expect(answer.isError).toBeUndefined();
    expect(answer.content[0].text).toContain("Question 2 of");
    expect(json(await cancel())).toMatchObject({ persona_name: "tenant-local", progress_lost: "1 questions answered" });
  });
});

// ---------------------------------------------------------------------------
// 4. Persona values registered from a caller's CMS custom persona
// ---------------------------------------------------------------------------

describe("custom-persona values are per account", () => {
  const journeyPage = { title: async () => "T", evaluate: async () => 1 };
  const journeyBrowser = {
    navigate: async () => {},
    getPage: async () => journeyPage,
    applyPersonaLocation: async () => ({}),
    close: async () => {},
    launch: async () => {},
  };
  const { server, tools } = stubServer();
  registerCognitiveTools(server as never, { getBrowser: async () => journeyBrowser } as never);
  // cognitive_journey_init is one of the four tools that registers a CMS
  // persona's values; it needs no page beyond the stub above.
  const init = (persona: string) =>
    tools.cognitive_journey_init({ persona, goal: "find pricing", startUrl: "https://tenant.example/" });

  test("values a tool registers for one account do not resolve for another", async () => {
    const r = await hosted(A, "cbk_tenant_A", () => init("tenant-values-alpha"));
    expect(r.isError).toBeUndefined();

    // The owner resolves its own values.
    expect(hosted(A, "cbk_tenant_A", () => getPersonaValues("tenant-values-alpha"))?.power).toBe(0.97);
    // Nobody else does: not another account, not an unscoped caller, and the
    // process-wide registry never held them.
    expect(hosted(B, "cbk_tenant_B", () => getPersonaValues("tenant-values-alpha"))).toBeUndefined();
    expect(getPersonaValues("tenant-values-alpha")).toBeUndefined();
    expect(PERSONA_VALUE_PROFILES.some((p) => p.personaName === "tenant-values-alpha")).toBe(false);
  });

  test("a hosted request with no account registers nothing process-wide", async () => {
    const r = await hostedNoAccount(() => init("tenant-values-gamma"), "cbk_tenant_C");
    expect(r.isError).toBeUndefined();
    expect(getPersonaValues("tenant-values-gamma")).toBeUndefined();
    expect(hosted(B, "cbk_tenant_B", () => getPersonaValues("tenant-values-gamma"))).toBeUndefined();
  });

  test("unscoped (CLI, stdio, local) registration is unchanged", async () => {
    setSessionApiKey("cbk_tenant_U");
    try {
      const r = await init("tenant-values-local");
      expect(r.isError).toBeUndefined();
      expect(getPersonaValues("tenant-values-local")?.power).toBe(0.93);
    } finally {
      setSessionApiKey(undefined);
    }
  });
});

// ---------------------------------------------------------------------------
// Sweep: personas created or updated through the persona tools
// ---------------------------------------------------------------------------

describe("created personas are per account", () => {
  const { server, tools } = stubServer();
  registerPersonaCreationTools(server as never);
  const submit = (persona_name: string) => tools.persona_create_submit_traits({
    persona_name,
    description: "tenant probe persona",
    traits: { patience: 0.2 },
    unsupportedTraits: ALL_TRAITS.filter((t) => t !== "patience"),
  });

  test("a persona one account creates does not resolve or list for another", async () => {
    const r = await hosted(A, "cbk_tenant_A", () => submit("tenant-created-alpha"));
    expect(r.isError).toBeUndefined();

    expect(hosted(A, "cbk_tenant_A", () => getAnyPersona("tenant-created-alpha"))).toBeDefined();
    expect(hosted(B, "cbk_tenant_B", () => getAnyPersona("tenant-created-alpha"))).toBeUndefined();
    expect(hosted(B, "cbk_tenant_B", () => listAllPersonas())).not.toContain("tenant-created-alpha");
    expect(getAnyPersona("tenant-created-alpha")).toBeUndefined();
  });

  test("unscoped (CLI, stdio, local) creation registers as before", async () => {
    const r = await submit("tenant-created-local");
    expect(r.isError).toBeUndefined();
    expect(getAnyPersona("tenant-created-local")).toBeDefined();
    expect(listAllPersonas()).toContain("tenant-created-local");
  });
});

// ---------------------------------------------------------------------------
// Sweep: site knowledge
// ---------------------------------------------------------------------------

describe("site models are per account", () => {
  const record = () => SiteModelManager.getInstance().recordNavigation(
    "tenant-site.example", "https://tenant-site.example/", "https://tenant-site.example/a-private-path", "a#private", "Private",
  );
  const nodes = async () => (await SiteModelManager.getInstance().getModelStats("tenant-site.example")).navigationNodes;

  test("one account's site knowledge is invisible to another and to unscoped callers", async () => {
    asA(record);
    expect(await asA(nodes)).toBeGreaterThan(0);
    expect(await asB(nodes)).toBe(0);
    expect(await nodes()).toBe(0);
  });

  test("unscoped (CLI, stdio, local) keeps one process-wide instance", async () => {
    expect(SiteModelManager.getInstance()).toBe(SiteModelManager.getInstance());
    SiteModelManager.getInstance().recordNavigation(
      "tenant-local-site.example", "https://tenant-local-site.example/", "https://tenant-local-site.example/next", "a#n", "Next",
    );
    expect((await SiteModelManager.getInstance().getModelStats("tenant-local-site.example")).navigationNodes).toBeGreaterThan(0);
  });
});
