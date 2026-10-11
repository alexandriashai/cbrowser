/**
 * Every published artifact name carries a random part. (r1010 artifact-nonce, 2026-10-10)
 *
 * The artifact store serves one public directory for every account, and most
 * names were guessable: capture artifacts were `<slug>.<fmt>`,
 * `<slug>-player.html` and `<slug>-contact-sheet.jpg`, where the slug is the
 * caller's capture name or `recording-<ISO time>`; heatmaps and overlays were
 * `<kind>-<persona>-<ms>`. So a capture of a customer's page sat at a URL anyone
 * could guess, and two accounts using one capture name overwrote each other's
 * public files. Only empathy_audit added randomBytes(6).
 *
 * writeArtifact now adds 48 random bits to every name, the files of one capture
 * share one nonce, and every name handed back is the name written. No browser
 * is started here: the capture publish, the screenshot republish and
 * artifact_fetch run in-process, and the call-site sweep reads src.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, afterAll } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "cb-artifact-nonce-"));
const ARTIFACTS = join(ROOT, "served");
const prevEnv = { dir: process.env.CBROWSER_ARTIFACT_DIR, base: process.env.CBROWSER_ARTIFACT_BASE_URL };
process.env.CBROWSER_ARTIFACT_DIR = ARTIFACTS;
process.env.CBROWSER_ARTIFACT_BASE_URL = "https://cbrowser.ai/heatmaps";

// Dynamic, and read as properties: on the pre-fix tree artifactNonce and
// publishCaptureArtifacts do not exist, and a static import of a missing name
// would fail the whole file instead of the tests that need it.
const store = await import("../src/artifact-store.js") as Record<string, unknown> & typeof import("../src/artifact-store.js");
const capture = await import("../src/mcp-tools/base/capture-tools.js") as Record<string, unknown>;
const { registerArtifactTools } = await import("../src/mcp-tools/base/artifact-tools.js");
const { buildContentWithScreenshots, setRemoteMode } = await import("../src/mcp-tools/screenshot-utils.js");
const { writeArtifact, artifactDir, artifactBaseUrl } = store;

type Published = { nonce: string; artifactUrls: Record<string, string>; contactSheetUrl?: string; playerUrl?: string };
const publishCaptureArtifacts = capture.publishCaptureArtifacts as
  | ((m: unknown, outDir: string, sheet: string | undefined, target: string | undefined) => Promise<Published>)
  | undefined;

/**
 * A random part of at least 48 bits: twelve or more hex chars, just before the
 * extension. Not sufficient alone: a 13-digit millisecond timestamp is also
 * twelve "hex" chars, so a name is checked against the name that was ASKED for
 * too (the random part must come after it, not be part of it).
 */
const NONCE_NAME = /^[A-Za-z0-9._-]+-([0-9a-f]{12,})(\.[A-Za-z0-9-]+)?$/;
const tail = (url: string) => new URL(url).pathname.split("/").pop()!;

afterAll(() => {
  setRemoteMode(false);
  rmSync(ROOT, { recursive: true, force: true });
  if (prevEnv.dir === undefined) delete process.env.CBROWSER_ARTIFACT_DIR; else process.env.CBROWSER_ARTIFACT_DIR = prevEnv.dir;
  if (prevEnv.base === undefined) delete process.env.CBROWSER_ARTIFACT_BASE_URL; else process.env.CBROWSER_ARTIFACT_BASE_URL = prevEnv.base;
});

/** A stopped capture on disk: encoded media and a contact sheet with the given bytes. */
function fakeCapture(slug: string, bytes: string): { manifest: unknown; outDir: string; sheet: string } {
  const outDir = mkdtempSync(join(ROOT, `capture-${slug}-`));
  writeFileSync(join(outDir, `${slug}.gif`), `GIF89a-${bytes}`);
  writeFileSync(join(outDir, `${slug}.webm`), `webm-${bytes}`);
  const sheet = join(outDir, "contact-sheet.jpg");
  writeFileSync(sheet, `jpeg-${bytes}`);
  const manifest = {
    slug,
    artifacts: { gif: `${slug}.gif`, webm: `${slug}.webm` },
    frames: [],
    duration_ms: 1200,
    actual_fps: 10,
  };
  return { manifest, outDir, sheet };
}

const artifactFetch = (() => {
  let handler: ((args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ type: string; data?: string; text?: string }> }>) | undefined;
  registerArtifactTools({ registerTool: (_n: string, _c: unknown, h: typeof handler) => { handler = h; } } as never);
  return (file: string) => handler!({ file });
})();

describe("(a) the same caller name never lands on the same public file", () => {
  test("store: two writes asked to be 'demo.gif' get different names, and both keep their own bytes", () => {
    const one = writeArtifact(Buffer.from("first"), "demo.gif");
    const two = writeArtifact(Buffer.from("second"), "demo.gif");
    expect(one).not.toBeNull();
    expect(two).not.toBeNull();
    expect(one!.filename).not.toBe(two!.filename);
    expect(readFileSync(one!.path, "utf8")).toBe("first");
    expect(readFileSync(two!.path, "utf8")).toBe("second");
  });

  test("capture: two publishes with capture name 'demo' produce different public names, both readable", async () => {
    expect(typeof publishCaptureArtifacts).toBe("function");
    const a = fakeCapture("demo", "account-A");
    const b = fakeCapture("demo", "account-B");
    const ra = await publishCaptureArtifacts!(a.manifest, a.outDir, a.sheet, "https://example.com/a");
    const rb = await publishCaptureArtifacts!(b.manifest, b.outDir, b.sheet, "https://example.com/b");
    for (const key of ["gif", "webm"]) {
      expect(tail(ra.artifactUrls[key])).not.toBe(tail(rb.artifactUrls[key]));
    }
    expect(tail(ra.contactSheetUrl!)).not.toBe(tail(rb.contactSheetUrl!));
    expect(tail(ra.playerUrl!)).not.toBe(tail(rb.playerUrl!));
    expect(readFileSync(join(artifactDir(), tail(ra.artifactUrls.gif)), "utf8")).toBe("GIF89a-account-A");
    expect(readFileSync(join(artifactDir(), tail(rb.artifactUrls.gif)), "utf8")).toBe("GIF89a-account-B");
  });

  test("a file already on disk under an old name is never replaced", () => {
    mkdirSync(artifactDir(), { recursive: true });
    const legacy = join(artifactDir(), "legacy.png");
    writeFileSync(legacy, "old bytes");
    const w = writeArtifact(Buffer.from("new bytes"), "legacy.png");
    expect(w!.filename).not.toBe("legacy.png");
    expect(readFileSync(legacy, "utf8")).toBe("old bytes");
  });

  test("a repeated name and nonce is refused rather than overwriting", () => {
    const nonce = "0123456789abcdef";
    const first = writeArtifact(Buffer.from("kept"), "pair.png", { nonce });
    const again = writeArtifact(Buffer.from("clobber"), "pair.png", { nonce });
    expect(first).not.toBeNull();
    expect(again).toBeNull();
    expect(readFileSync(first!.path, "utf8")).toBe("kept");
  });

  test("a caller-supplied nonce shorter than 48 bits, or not hex, is refused", () => {
    expect(writeArtifact(Buffer.from("x"), "weak.png", { nonce: "abc123" })).toBeNull();
    expect(writeArtifact(Buffer.from("x"), "weak.png", { nonce: "ZZZZZZZZZZZZ" })).toBeNull();
    expect(existsSync(join(artifactDir(), "weak-abc123.png"))).toBe(false);
  });
});

/**
 * Every writeArtifact call in src, with its name argument as written there.
 * `${...}` parts become sample text; a non-literal name (the screenshot
 * republish's basename(path)) gets a sample of what it is in practice.
 */
function writeArtifactCallSites(): Array<{ site: string; name: string; sharesNonce: boolean }> {
  const SRC = join(import.meta.dir, "..", "src");
  const sites: Array<{ site: string; name: string; sharesNonce: boolean }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      if (!entry.name.endsWith(".ts") || p.endsWith("artifact-store.ts")) continue;
      const text = readFileSync(p, "utf8");
      for (let i = text.indexOf("writeArtifact("); i !== -1; i = text.indexOf("writeArtifact(", i + 1)) {
        const lineStart = text.lastIndexOf("\n", i) + 1;
        const line = text.slice(lineStart, text.indexOf("\n", i));
        if (/^\s*(\/\/|\*)/.test(line) || /import\s*\{/.test(line)) continue;
        // Split the call's arguments at top-level commas, treating strings as opaque.
        const args: string[] = [];
        let depth = 0, cur = "", j = i + "writeArtifact(".length, quote = "";
        for (; j < text.length; j++) {
          const ch = text[j];
          if (quote) { cur += ch; if (ch === quote && text[j - 1] !== "\\") quote = ""; continue; }
          if (ch === "`" || ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
          if ("([{".includes(ch)) depth++;
          if (")]}".includes(ch)) { if (depth === 0) break; depth--; }
          if (ch === "," && depth === 0) { args.push(cur.trim()); cur = ""; continue; }
          cur += ch;
        }
        args.push(cur.trim());
        const raw = args[1] ?? "";
        const name = raw.startsWith("`")
          ? raw.slice(1, -1).replace(/\$\{[^}]*\}/g, "sample")
          : /^["']/.test(raw) ? raw.slice(1, -1) : "screenshot-1760000000000.png";
        const lineNo = text.slice(0, i).split("\n").length;
        sites.push({ site: `${p.slice(SRC.length + 1)}:${lineNo}`, name, sharesNonce: /\bnonce\b/.test(args[2] ?? "") });
      }
    }
  };
  walk(SRC);
  return sites;
}

describe("(b) every name the call sites produce has a random part of at least 48 bits", () => {
  const sites = writeArtifactCallSites();

  test("the sweep finds every writeArtifact call in src (15 at e326ef4)", () => {
    expect(sites.length).toBeGreaterThanOrEqual(15);
  });

  test("each call site's name comes out as <readable prefix>-<12+ hex>.<ext>", () => {
    const shared = typeof store.artifactNonce === "function" ? (store.artifactNonce as () => string)() : "0123456789ab";
    const failures: string[] = [];
    for (const { site, name, sharesNonce } of sites) {
      const w = writeArtifact(Buffer.from("x"), name, sharesNonce ? { nonce: shared } : {});
      const asked = name.replace(/[^a-zA-Z0-9._-]+/g, "-");
      const stem = asked.replace(/\.[A-Za-z0-9-]+$/, "");
      if (!w || !NONCE_NAME.test(w.filename) || !w.filename.startsWith(`${stem}-`)) {
        failures.push(`${site}: asked ${asked}, wrote ${w?.filename ?? "nothing"}`);
      }
    }
    expect(failures).toEqual([]);
  });

  test("nothing but artifact-store writes into the artifact directory", () => {
    const SRC = join(import.meta.dir, "..", "src");
    const users: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (entry.name.endsWith(".ts") && readFileSync(p, "utf8").includes("artifactDir(")) users.push(p.slice(SRC.length + 1));
      }
    };
    walk(SRC);
    // artifact-tools.ts only reads (artifact_fetch); every write goes through writeArtifact.
    expect(users.sort()).toEqual(["artifact-store.ts", "mcp-tools/base/artifact-tools.ts"]);
  });

  test("the files of one capture share one nonce, behind the readable slug", async () => {
    expect(typeof publishCaptureArtifacts).toBe("function");
    const c = fakeCapture("recording-2026-10-10T12-00-00-000Z", "shared");
    const r = await publishCaptureArtifacts!(c.manifest, c.outDir, c.sheet, undefined);
    const names = [...Object.values(r.artifactUrls), r.contactSheetUrl!, r.playerUrl!].map(tail);
    expect(names).toHaveLength(4);
    for (const n of names) {
      expect(n).toMatch(NONCE_NAME);
      expect(n.match(NONCE_NAME)![1]).toBe(r.nonce);
      expect(n.startsWith("recording-2026-10-10T12-00-00-000Z")).toBe(true);
    }
  });

  test("the screenshot republish hands back the name it wrote", () => {
    const shot = join(ROOT, "screenshot-1760000000000.png");
    writeFileSync(shot, "png-bytes");
    setRemoteMode(true);
    const data: Record<string, unknown> = { success: true };
    buildContentWithScreenshots(data, shot);
    setRemoteMode(false);
    expect(String(data.screenshotFile)).toMatch(NONCE_NAME);
    // The timestamp in the asked-for name is not the random part.
    expect(String(data.screenshotFile).startsWith("screenshot-1760000000000-")).toBe(true);
    expect(tail(String(data.screenshotUrl))).toBe(String(data.screenshotFile));
    expect(existsSync(join(artifactDir(), String(data.screenshotFile)))).toBe(true);
  });
});

describe("(c) artifact_fetch serves the name a tool returned", () => {
  test("capture GIF and contact sheet, by the names in the capture's URLs", async () => {
    expect(typeof publishCaptureArtifacts).toBe("function");
    const c = fakeCapture("fetch-me", "fetchable");
    const r = await publishCaptureArtifacts!(c.manifest, c.outDir, c.sheet, undefined);
    for (const [url, bytes] of [[r.artifactUrls.gif, "GIF89a-fetchable"], [r.contactSheetUrl!, "jpeg-fetchable"]] as const) {
      const res = await artifactFetch(tail(url));
      expect(res.isError).toBeFalsy();
      expect(res.content[0].type).toBe("image");
      expect(Buffer.from(res.content[0].data!, "base64").toString()).toBe(bytes);
    }
  });

  test("screenshotFile from the screenshot republish", async () => {
    const shot = join(ROOT, "screenshot-1760000000001.png");
    writeFileSync(shot, "png-shot");
    setRemoteMode(true);
    const data: Record<string, unknown> = {};
    buildContentWithScreenshots(data, shot);
    setRemoteMode(false);
    const res = await artifactFetch(String(data.screenshotFile));
    expect(res.isError).toBeFalsy();
    expect(Buffer.from(res.content[0].data!, "base64").toString()).toBe("png-shot");
  });

  test("an old name already on disk is still served", async () => {
    mkdirSync(artifactDir(), { recursive: true });
    writeFileSync(join(artifactDir(), "attn-first-timer-1760000000000.png"), "legacy-png");
    const res = await artifactFetch("attn-first-timer-1760000000000.png");
    expect(res.isError).toBeFalsy();
    expect(Buffer.from(res.content[0].data!, "base64").toString()).toBe("legacy-png");
  });
});

describe("(d) the capture player's references to its siblings resolve", () => {
  test("every src/href/poster in the published player points at a file that exists, and they are its own siblings", async () => {
    expect(typeof publishCaptureArtifacts).toBe("function");
    const c = fakeCapture("player-check", "player");
    const r = await publishCaptureArtifacts!(c.manifest, c.outDir, c.sheet, "https://example.com/");
    const html = readFileSync(join(artifactDir(), tail(r.playerUrl!)), "utf8");
    const refs = [...html.matchAll(/\b(?:src|href|poster)="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    const siblings = refs.filter((u) => u.startsWith(`${artifactBaseUrl()}/`));
    // The player shows the video, its poster (the contact sheet) and a download per format.
    expect(new Set(siblings)).toEqual(new Set([r.artifactUrls.gif, r.artifactUrls.webm, r.contactSheetUrl!]));
    for (const u of siblings) {
      expect(existsSync(join(artifactDir(), tail(u)))).toBe(true);
      expect(tail(u)).toContain(r.nonce);
    }
    // No sibling is referenced by a bare relative name a renamed file would break.
    for (const u of refs) expect(/^(https?:|data:|#|mailto:)/.test(u) || u === "").toBe(true);
  });
});
