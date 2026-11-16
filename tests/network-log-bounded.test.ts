/**
 * The network log does not keep request bodies alive (audit leaks-static-2;
 * ISA 20261112-cbrowser-sessions-leaks ISC-5; 2026-11-15).
 *
 * Measured on Playwright 1.64.1: once anything listens for page "request"
 * events, Playwright keeps every Request object, body included, for the life
 * of the page. A page posting 512 KB every 20 ms grew the heap 66 -> 789 MB in
 * 30 s with an empty listener and stayed flat without one. Capping the log was
 * not enough (heap 705 -> 1,860 MB from 15 to 60 s), so on Chromium the log
 * now comes from a CDP session and no "request" listener stays on the page.
 *
 * Real browser, loopback page. The listener count is the falsifier for the
 * leak itself; the rest pins that the log still says what it said before.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-netlog-"));
const { CBrowser } = await import("../src/browser.js");

const BIG = 64 * 1024;
const page = `<!doctype html><html><head><title>netlog</title></head><body><script>
(async () => {
  await fetch("/small", { method: "POST", body: "hello=world" });
  await fetch("/big", { method: "POST", body: "x".repeat(${BIG}), headers: { "content-type": "text/plain" } });
  await fetch("/missing");
  await fetch("/hop");
  document.title = "done";
})();
</script></body></html>`;

let server: Server;
let base = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/hop") { res.statusCode = 302; res.setHeader("location", "/small-get"); res.end(); return; }
    if (req.url === "/missing") { res.statusCode = 404; res.end("no"); return; }
    if (req.url === "/" ) { res.setHeader("content-type", "text/html"); res.end(page); return; }
    req.resume();
    req.on("end", () => res.end("ok"));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => { server?.close(); });

// Page is an EventEmitter at runtime; its typings leave listenerCount out.
const listeners = (p: unknown, event: string): number =>
  (p as { listenerCount: (e: string) => number }).listenerCount(event);

describe("the Chromium network log", () => {
  test("no request or response listener stays on the page, and the log still records method, body, status, type and redirects", async () => {
    const b = new CBrowser({ headless: true, persistent: false });
    try {
      await b.launch();
      const p = await b.getPage();
      // The leak: any lasting "request" listener makes Playwright keep every Request.
      expect(listeners(p, "request")).toBe(0);
      expect(listeners(p, "response")).toBe(0);

      await b.navigate(`${base}/`);
      await p.waitForFunction(() => document.title === "done", null, { timeout: 10_000 });
      await new Promise((r) => setTimeout(r, 300));
      expect(listeners(p, "request")).toBe(0);

      const log = b.getNetworkRequests();
      const by = (path: string) => log.find((r) => r.url === `${base}${path}`);

      const doc = by("/");
      expect(doc?.resourceType).toBe("document");
      expect(doc?.status).toBe(200);

      const small = by("/small");
      expect(small?.method).toBe("POST");
      expect(small?.postData).toBe("hello=world");
      expect(small?.postDataTruncated).toBeUndefined();
      expect(small?.resourceType).toBe("fetch");
      expect(small?.status).toBe(200);
      expect(typeof small?.durationMs).toBe("number");

      const big = by("/big");
      expect(big?.method).toBe("POST");
      expect(big?.postDataTruncated).toBe(true);
      expect((big?.postData ?? "").length).toBeLessThanOrEqual(16 * 1024);

      expect(by("/missing")?.status).toBe(404);
      expect(by("/hop")?.status).toBe(302);
      expect(by("/small-get")?.status).toBe(200);
    } finally {
      await b.close();
    }
  }, 60_000);

  test("HAR recording still produces entries with request and response", async () => {
    const b = new CBrowser({ headless: true, persistent: false });
    try {
      await b.launch();
      b.startHarRecording();
      await b.navigate(`${base}/`);
      const p = await b.getPage();
      await p.waitForFunction(() => document.title === "done", null, { timeout: 10_000 });
      await new Promise((r) => setTimeout(r, 300));
      const entries = (b as unknown as { harEntries: Array<{ request: { url: string; method: string }; response: { status: number } }> }).harEntries;
      const small = entries.find((e) => e.request.url === `${base}/small`);
      expect(small?.request.method).toBe("POST");
      expect(small?.response.status).toBe(200);
      expect(entries.find((e) => e.request.url === `${base}/missing`)?.response.status).toBe(404);
    } finally {
      await b.close();
    }
  }, 60_000);
});

describe("a capture's request timeline", () => {
  test("on Chromium it adds no request listener to the page and still records requests per frame", async () => {
    const { VideoCaptureSession } = await import("../src/recording/engine.js");
    const b = new CBrowser({ headless: true, persistent: false });
    try {
      await b.launch();
      const p = await b.getPage();
      await p.goto(`${base}/`);
      await p.waitForFunction(() => document.title === "done", null, { timeout: 10_000 });
      const dir = mkdtempSync(join(tmpdir(), "cb-netlog-cap-"));
      const session = new VideoCaptureSession(p, "chromium", dir);
      await session.start({ fps: 5, format: ["gif"] } as never);
      expect(listeners(p, "request")).toBe(0);
      await p.evaluate(async () => { await fetch("/small", { method: "POST", body: "during" }); });
      await p.evaluate(() => { document.body.style.background = "#eee"; });
      // A click, so the interaction binding has something to report.
      await p.evaluate(() => {
        const b = document.createElement("button");
        b.textContent = "Press me";
        document.body.appendChild(b);
      });
      await p.click("button");
      await new Promise((r) => setTimeout(r, 600));
      const navDuring = listeners(p, "framenavigated");
      const result = await session.stop();
      const urls = result.manifest.frames.flatMap((f: { network?: Array<{ url: string }> }) => (f.network ?? []).map((n) => n.url));
      expect(urls.some((u: string) => u.endsWith("/small"))).toBe(true);
      expect(listeners(p, "request")).toBe(0);
      // The CDP request source must not cost the rest of the page listeners
      // (challenger review 2026-11-16: an early return in attachPageListeners
      // skipped the DOM snapshots, navigation, interaction and scroll hooks).
      const interactions = (result.manifest as { interactions?: Array<{ type: string; label: string }> }).interactions ?? [];
      expect(interactions.some((i) => i.type === "click" && i.label.includes("Press me"))).toBe(true);
      expect(navDuring).toBeGreaterThan(0);
    } finally {
      await b.close();
    }
  }, 90_000);
});
