/**
 * Shared fixture and driver for the B7 element-count tests.
 *
 * One handler call per PROCESS: a second empathy_audit call in the same Bun
 * process stalls in CBrowser.close() (reproduced on main 9f554c6 with a
 * local server and with a data: URL; unrelated to B7). So each scope has its
 * own test file, and the split runner gives each file its own process.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Three id-less 16x16 buttons 4px apart (two close pairs), two adjacent small
// links (one close pair), one AAA-only 40x40 button on its own, a hidden
// unlabelled input, and -- 3000px down -- a close pair the viewport never shows.
export const FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>counts</title>
<style>body{margin:0;font:16px sans-serif;color:#000;background:#fff}
main{padding:40px}.row{display:flex;gap:4px}
button{box-sizing:border-box;padding:0;border:0;margin:0;background:#ddd;color:#000;font:11px sans-serif}
.small{width:16px;height:16px}.forty{width:40px;height:40px}.big{width:50px;height:50px}
.links a{display:inline-block;padding:2px;color:#00e}</style></head>
<body><main>
  <div class="row"><button class="small">a</button><button class="small">b</button><button class="small">c</button></div>
  <p class="links"><a href="/alpha">Alpha</a><a href="/beta">Beta</a></p>
  <div style="margin-top:48px"><button class="forty">40</button></div>
  <input type="text" name="hidden-field" style="display:none">
  <div style="height:3000px"></div>
  <div class="row"><button class="big">Far1</button><button class="big">Far2</button></div>
</main></body></html>`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = Record<string, any>;

/**
 * Run the REAL empathy_audit handler once, registered on a fake MCP server,
 * against FIXTURE served over http. Side files go to throwaway dirs.
 */
export async function runEmpathyHandlerOnce(scope: "viewport" | "full_page"): Promise<{ json: Json; text: string }> {
  const dataDir = mkdtempSync(join(tmpdir(), "cbrowser-element-counts-"));
  const artifactDir = mkdtempSync(join(tmpdir(), "cbrowser-element-counts-art-"));
  const saved = { data: process.env.CBROWSER_DATA_DIR, art: process.env.CBROWSER_ARTIFACT_DIR };
  process.env.CBROWSER_DATA_DIR = dataDir;
  process.env.CBROWSER_ARTIFACT_DIR = artifactDir;
  const server = Bun.serve({ port: 0, fetch: () => new Response(FIXTURE, { headers: { "content-type": "text/html" } }) });
  try {
    const { registerEmpathyAuditTool } = await import("../../src/mcp-tools/base/audit-tools.js");
    let handler: ((args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>) | undefined;
    registerEmpathyAuditTool({
      registerTool: (name: string, _cfg: unknown, h: typeof handler) => { if (name === "empathy_audit") handler = h; },
      tool: () => {}, registerResource: () => {}, resource: () => {},
    } as never);
    if (!handler) throw new Error("empathy_audit was not registered");
    const res = await handler({
      url: `http://localhost:${server.port}/`, disabilities: ["motor-impairment-tremor"], wcagLevel: "AA",
      maxSteps: 1, maxTime: 15, scope, includeScreenshots: false, uiResource: true,
    });
    const text = res.content[0].text;
    return { json: JSON.parse(text) as Json, text };
  } finally {
    server.stop(true);
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(artifactDir, { recursive: true, force: true });
    if (saved.data === undefined) delete process.env.CBROWSER_DATA_DIR; else process.env.CBROWSER_DATA_DIR = saved.data;
    if (saved.art === undefined) delete process.env.CBROWSER_ARTIFACT_DIR; else process.env.CBROWSER_ARTIFACT_DIR = saved.art;
  }
}

/** sum(topBarriers[].affectedElementCount) + omitted groups' elements. */
export const sumTop = (j: Json): number =>
  (j.topBarriers as Json[]).reduce((n, b) => n + (b.affectedElementCount ?? 0), 0) +
  (j.topBarriersOmitted?.affectedElements ?? 0);
export const touchGroup = (j: Json): Json | undefined =>
  (j.topBarriers as Json[]).find((b) => b.type === "touch_target");
export const spacingGroup = (j: Json): Json | undefined =>
  (j.topBarriers as Json[]).find((b) => /very close together/.test(b.description));
export const coverage = (j: Json): Json => j.pageScreenshots[0].barrierRectCoverage as Json;
export const ALLOWED_UNDRAWN_REASONS = ["pageLevel", "zeroArea", "outsideCapture"];
