/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Network mocking, tracking and HAR export
 *
 * Network mocks, the per-session request log (CDP or Playwright events), and HAR export.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import type { Page, Route } from "playwright";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { NetworkMock, NetworkRequest, HAREntry, HARLog } from "../types.js";
import { uniqueStamp } from "../temp-files.js";
import { decodeUtf8Prefix, capUtf8, capHeaders, MAX_URL_BYTES } from "./helpers.js";
import type { CBrowser } from "../browser.js";

const MAX_PENDING_REQUESTS = 2000;
/**
 * The per-session request log is a ring of this many entries, each with its
 * body, headers and URL capped. It used to keep every request with its whole
 * body for the life of the session, so a page that POSTed 2 MB every 20 ms
 * took the hosted server, one process for every account, to the V8 heap
 * limit in about 30 s (leaks-static-2, 2026-11-12). Dropped entries are
 * counted, and get_network_requests reports the count.
 */
const MAX_NETWORK_REQUESTS = 1000;
const MAX_POST_DATA_BYTES = 16 * 1024;
const MAX_HEADER_BYTES = 8 * 1024;
/** Map key for a request: its URL as the log keeps it, plus its method. */
function requestKey(url: string, method: string): string {
  return (url.length > MAX_URL_BYTES ? capUtf8(url, MAX_URL_BYTES).text : url) + method;
}


// =========================================================================
// Network Mocking
// =========================================================================

export async function setupNetworkMocks(this: CBrowser, mocks: NetworkMock[]): Promise<void> {
  const page = this.page!;

  for (const mock of mocks) {
    const pattern = typeof mock.urlPattern === "string"
      ? new RegExp(mock.urlPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      : mock.urlPattern;

    await page.route(pattern, async (route: Route) => {
      const request = route.request();

      // Check method match if specified
      if (mock.method && request.method() !== mock.method.toUpperCase()) {
        await route.continue();
        return;
      }

      // Handle abort
      if (mock.abort) {
        await route.abort();
        return;
      }

      // Apply delay if specified
      if (mock.delay) {
        await new Promise((r) => setTimeout(r, mock.delay));
      }

      // Fulfill with mock response
      const body = typeof mock.body === "object"
        ? JSON.stringify(mock.body)
        : mock.body || "";

      await route.fulfill({
        status: mock.status || 200,
        headers: mock.headers || { "Content-Type": "application/json" },
        body,
      });
    });
  }
}

// =========================================================================
// Network Tracking & HAR Export
// =========================================================================

export async function setupNetworkTracking(this: CBrowser): Promise<void> {
  if (!this.page) return;
  const page = this.page;
  const engine = page.context().browser()?.browserType().name() ?? this.config.browser ?? "chromium";
  if (engine === "chromium") {
    try {
      await this.setupCdpNetworkTracking(page);
      return;
    } catch (e) {
      if (this.config.verbose) console.warn(`[CBrowser] CDP network log unavailable, using page events: ${(e as Error).message}`);
    }
  }
  this.setupPlaywrightNetworkTracking(page);
}

export function logRequest(this: CBrowser, raw: {
  url: string; method: string; headers: Record<string, string>; resourceType: string;
  body?: Buffer; bodyOmitted?: boolean;
}): NetworkRequest {
  const url = capUtf8(raw.url, MAX_URL_BYTES);
  const headers = capHeaders(raw.headers, MAX_HEADER_BYTES);
  const networkRequest: NetworkRequest = {
    url: url.text,
    method: raw.method,
    headers: headers.headers,
    resourceType: raw.resourceType,
    timestamp: new Date().toISOString(),
  };
  if (url.truncated) networkRequest.urlTruncated = true;
  if (headers.truncated) networkRequest.headersTruncated = true;
  const body = raw.body;
  if (body && body.length > 0) {
    if (body.length > MAX_POST_DATA_BYTES) {
      networkRequest.postData = decodeUtf8Prefix(body, MAX_POST_DATA_BYTES);
      networkRequest.postDataTruncated = true;
      networkRequest.postDataBytes = body.length;
    } else {
      networkRequest.postData = body.toString("utf8");
    }
  } else if (raw.bodyOmitted) {
    networkRequest.postDataTruncated = true;
    const declared = Number(Object.entries(raw.headers).find(([n]) => n.toLowerCase() === "content-length")?.[1]);
    if (Number.isFinite(declared) && declared > 0) networkRequest.postDataBytes = declared;
  }
  this.networkRequests.push(networkRequest);
  if (this.networkRequests.length > MAX_NETWORK_REQUESTS) {
    this.networkRequests.shift();
    this.droppedNetworkRequests++;
  }
  return networkRequest;
}

export async function setupCdpNetworkTracking(this: CBrowser, page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable", {
    maxPostDataSize: MAX_POST_DATA_BYTES,
    // Response bodies are never read through this session; keep Chromium's
    // per-session copy of them small.
    maxTotalBufferSize: 1024 * 1024,
    maxResourceBufferSize: 512 * 1024,
  });
  const pending = new Map<string, { req: NetworkRequest; startedAt: number; har?: Partial<HAREntry> }>();
  type CdpRequest = { url: string; method: string; headers: Record<string, unknown>; postData?: string; hasPostData?: boolean };
  type CdpResponse = { status: number; statusText: string; headers: Record<string, unknown>; mimeType?: string };
  const strHeaders = (h: Record<string, unknown>): Record<string, string> =>
    Object.fromEntries(Object.entries(h ?? {}).map(([k, v]) => [k, String(v)]));

  const complete = (id: string, res: CdpResponse): void => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    entry.req.status = res.status;
    entry.req.statusText = res.statusText;
    const endTime = Date.now();
    entry.req.durationMs = endTime - entry.startedAt;
    if (entry.har && this.isRecordingHar) {
      const headers = strHeaders(res.headers);
      const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
      this.harEntries.push({
        ...(entry.har as HAREntry),
        time: endTime - entry.startedAt,
        response: {
          status: res.status,
          statusText: res.statusText,
          httpVersion: "HTTP/1.1",
          headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
          content: {
            size: parseInt(lower["content-length"] || "0"),
            mimeType: lower["content-type"] || res.mimeType || "application/octet-stream",
          },
          redirectURL: lower["location"] || "",
          headersSize: -1,
          bodySize: parseInt(lower["content-length"] || "-1"),
        },
        cache: {},
        timings: { blocked: 0, dns: -1, connect: -1, send: 0, wait: endTime - entry.startedAt, receive: 0, ssl: -1 },
      });
    }
  };

  cdp.on("Network.requestWillBeSent", (e: { requestId: string; request: CdpRequest; type?: string; redirectResponse?: CdpResponse }) => {
    // A redirect reuses the request id: the hop that redirected ends here.
    if (e.redirectResponse) complete(e.requestId, e.redirectResponse);
    const headers = strHeaders(e.request.headers);
    const req = this.logRequest({
      url: e.request.url,
      method: e.request.method,
      headers,
      resourceType: (e.type ?? "other").toLowerCase(),
      ...(e.request.postData !== undefined ? { body: Buffer.from(e.request.postData, "utf8") } : {}),
      ...(e.request.postData === undefined && e.request.hasPostData ? { bodyOmitted: true } : {}),
    });
    if (pending.size >= MAX_PENDING_REQUESTS) {
      const oldest = pending.keys().next();
      if (!oldest.done) pending.delete(oldest.value);
    }
    pending.set(e.requestId, {
      req,
      startedAt: Date.now(),
      ...(this.isRecordingHar
        ? {
            har: {
              startedDateTime: new Date().toISOString(),
              request: {
                method: e.request.method,
                url: req.url,
                httpVersion: "HTTP/1.1",
                headers: Object.entries(req.headers).map(([name, value]) => ({ name, value })),
                queryString: [],
                headersSize: -1,
                bodySize: req.postDataBytes ?? req.postData?.length ?? 0,
              },
            },
          }
        : {}),
    });
  });
  cdp.on("Network.responseReceived", (e: { requestId: string; response: CdpResponse }) => complete(e.requestId, e.response));
  cdp.on("Network.loadingFailed", (e: { requestId: string }) => { pending.delete(e.requestId); });
}

export function setupPlaywrightNetworkTracking(this: CBrowser, page: Page): void {
  page.on("request", (request) => {
    // Read from the buffer so only the kept part is ever decoded.
    const body = request.postDataBuffer();
    const networkRequest = this.logRequest({
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
      resourceType: request.resourceType(),
      ...(body ? { body } : {}),
    });

    // Track it so the response handler can complete the record. Evict the
    // oldest entry rather than growing forever when responses never arrive.
    if (this.pendingRequests.size >= MAX_PENDING_REQUESTS) {
      const oldest = this.pendingRequests.keys().next();
      if (!oldest.done) this.pendingRequests.delete(oldest.value);
    }
    // Keyed by the capped URL: a 2 MB query string held as a map key 2,000
    // times is the same leak by another road.
    this.pendingRequests.set(requestKey(request.url(), request.method()), {
      req: networkRequest,
      startedAt: Date.now(),
    });

    if (this.isRecordingHar) {
      // Start HAR entry
      const harEntry: Partial<HAREntry> = {
        startedDateTime: new Date().toISOString(),
        request: {
          method: request.method(),
          url: request.url(),
          httpVersion: "HTTP/1.1",
          headers: Object.entries(request.headers()).map(([name, value]) => ({ name, value })),
          queryString: [],
          headersSize: -1,
          bodySize: request.postData()?.length || 0,
        },
      };
      this.networkResponses.set(requestKey(request.url(), request.method()), harEntry as any);
    }
  });

  page.on("response", async (response) => {
    const key = requestKey(response.url(), response.request().method());

    // This status was already being computed here and then discarded into an
    // unused local, which is why get_network_requests could never report the
    // status codes and timing its description promised. Attach it to the
    // originating request record instead. (2026-07-28)
    const pending = this.pendingRequests.get(key);
    if (pending) {
      pending.req.status = response.status();
      pending.req.statusText = response.statusText();
      pending.req.durationMs = Date.now() - pending.startedAt;
      this.pendingRequests.delete(key);
    }

    if (this.isRecordingHar && this.networkResponses.has(key)) {
      const partial = this.networkResponses.get(key) as Partial<HAREntry>;
      const startTime = new Date(partial.startedDateTime!).getTime();
      const endTime = Date.now();

      const harEntry: HAREntry = {
        ...partial as HAREntry,
        time: endTime - startTime,
        response: {
          status: response.status(),
          statusText: response.statusText(),
          httpVersion: "HTTP/1.1",
          headers: Object.entries(response.headers()).map(([name, value]) => ({ name, value })),
          content: {
            size: parseInt(response.headers()["content-length"] || "0"),
            mimeType: response.headers()["content-type"] || "application/octet-stream",
          },
          redirectURL: response.headers()["location"] || "",
          headersSize: -1,
          bodySize: parseInt(response.headers()["content-length"] || "-1"),
        },
        cache: {},
        timings: {
          blocked: 0,
          dns: -1,
          connect: -1,
          send: 0,
          wait: endTime - startTime,
          receive: 0,
          ssl: -1,
        },
      };

      this.harEntries.push(harEntry);
      this.networkResponses.delete(key);
    }
  });
}

export async function exportHar(this: CBrowser, outputPath?: string): Promise<string> {
  this.isRecordingHar = false;

  const harLog: HARLog = {
    version: "1.2",
    creator: { name: "CBrowser", version: "2.4.0" },
    entries: this.harEntries,
  };

  const har = { log: harLog };
  const harDir = join(this.paths.dataDir, "har");
  if (!existsSync(harDir)) {
    mkdirSync(harDir, { recursive: true });
  }

  const filename = outputPath || join(harDir, `har-${uniqueStamp()}.har`);
  writeFileSync(filename, JSON.stringify(har, null, 2));

  return filename;
}

export function clearNetworkHistory(this: CBrowser): void {
  this.networkRequests = [];
  this.droppedNetworkRequests = 0;
  this.harEntries = [];
  this.pendingRequests.clear();
}
