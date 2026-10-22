/**
 * Crawl the CTC reference set, version 2: raw page measurements of about 500
 * real pages, from three sampling frames and six page types.
 *
 * ## Why a second crawl
 *
 * The first reference (crawl.ts, 2026-10-22) measured 111 brand landing pages
 * and stored the NORMALISED metrics. Three things followed from that. Inner
 * pages, where much of a visit happens, were absent. Whole industries were
 * missing or thin (retail 3 of 11, fashion 1 of 8, real estate 0 of 5), mostly
 * because their sites block a data-centre browser. And a change to a
 * registered page-metric normaliser could not move the curve, because the old
 * value was baked into every stored page. This crawl stores the RAW
 * measurement (measurePageRaw), so deriveMetrics re-derives every page under
 * the live constants.
 *
 * ## Frames (frames-v2.json, built by --build-frames)
 *
 *   brand    research/benchmark/sites.json, the v1 list (199), in a seeded order.
 *   tranco   a seeded random draw from a dated Tranco top-sites list, the same
 *            number per rank band (1-1k, 1k-10k, 10k-100k, 100k-1M). Adult
 *            and gambling domains are excluded by name before the crawl and
 *            by page content after the landing loads; parked domains, non-HTML
 *            answers, landing pages below the minimums (LANDING_MIN) and
 *            off-site redirects are excluded after it loads. Every exclusion
 *            is recorded with its reason.
 *   public   government and nonprofit sites from public directories: CISA's
 *            .gov registry (federal), USAGov's state pages (the 50 state
 *            portals), Wikidata (US cities of 400,000 or more, notable US
 *            nonprofits). Each source URL and query is recorded.
 *
 * ## Page types (discover.ts)
 *
 * landing, plus up to five inner pages found from the landing page's links and
 * forms: form (sign-up, login or contact; loaded, never submitted), search (the
 * GET its own search form sends, query "help"), article, help, cart (as linked:
 * the empty cart). Nothing is clicked, submitted (but a search GET), bought,
 * created, deleted or sent; no login.
 *
 * ## Balance
 *
 * Sites are taken from the frame with the fewest graded pages so far, until
 * it reaches FRAME_QUOTA; a site's inner types are tried in the order of its
 * frame's deficit and skipped once that (frame, type) cell holds TYPE_QUOTA.
 * Every site's landing is measured (discovery needs it), so landing pages
 * outnumber each inner type; the curve weights the cells (ctc-reference.ts).
 *
 * ## Politeness and routing
 *
 * robots.txt is honoured for every page (robots.ts, RFC 9309); a disallowed
 * page is an outcome, not a page. One page per site at a time, SITE_DELAY_MS
 * between them (or the site's crawl-delay, up to 30 s), CONCURRENCY sites at
 * once, a ceiling per page. Each page is tried DIRECT first. Only when that
 * answer is blocked (cognitive_effort's BLOCK_SIGNATURES, an HTTP error, or no
 * interactive element on the whole document) is it retried once through the
 * residential proxy, region us-central, never for a .gov or .mil host (the
 * proxy is known to 403 them). Proxy use stops when the proxy bytes reach
 * PROXY_BUDGET_BYTES, and the record says so.
 *
 * The proxy credential is read from the file named by CTC_PROXY_CREDENTIAL
 * (host, port, username, basePassword, regions). No value from it is ever
 * logged or stored: proxy-route failures are recorded by error code only, and
 * every detail string is scrubbed of the credential before it is written.
 *
 * Usage (as the tree's owner, never root; from a frozen copy of the tree):
 *   bun research/ctc-reference/crawl-v2.ts --build-frames
 *   CTC_PROXY_CREDENTIAL=<file> CTC_GIT_HEAD=<sha> bun research/ctc-reference/crawl-v2.ts [--concurrency 4] [--deadline-min 300] [--resume <jsonl>]
 *   bun research/ctc-reference/crawl-v2.ts --page '<job json>'      (one page, JSON on stdout)
 *
 * Writes research/ctc-reference/results/crawl-v2-<date>.jsonl (raw rows,
 * untracked) and crawl-v2-<date>.summary.json. The shipped reference is
 * assembled from the rows by assemble-v2.ts.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fetchRobots, robotsAllows, type Robots } from "./robots.js";
import {
  INNER_TYPES, type InnerType, type Discovered, type AnchorInfo, type FormInfo,
  discoverInner, siteDomain, domainExclusion, contentFlags, contentExclusion,
} from "./discover.js";

const ROOT = join(import.meta.dir, "..", "..");
const HERE = import.meta.dir;
const OUT = join(HERE, "results");
const FRAMES_PATH = join(HERE, "frames-v2.json");

const VIEWPORT = { width: 1920, height: 1080 };
/** One page, two measurements and a browser launch; the proxy is slower. */
const PAGE_CEILING_MS = 150_000;
const PROXY_PAGE_CEILING_MS = 180_000;
const MARK = "@@CTC-REF-V2@@";
/** Seed for every random choice in the frames (sample draws and orders). */
export const SEED = 20261022;
/** Sites drawn per Tranco rank band. */
const TRANCO_PER_BAND = 60;
export const TRANCO_BANDS: Array<[number, number]> = [[1, 1_000], [1_001, 10_000], [10_001, 100_000], [100_001, 1_000_000]];
const FEDERAL_SAMPLE = 45;
const NONPROFIT_SAMPLE = 60;
/** Graded pages per frame before it stops taking sites, and per (frame, inner type) cell. */
const FRAME_QUOTA = 170;
const TYPE_QUOTA = 40;
const SITE_DELAY_MS = 5_000;
const MAX_CRAWL_DELAY_S = 30;
const PROXY_BUDGET_BYTES = 3 * 1024 ** 3;
const PROXY_REGION = "us-central";
/** A tranco landing page must reach these at full_page to count as a web page. */
export const LANDING_MIN = { textChars: 500, interactiveElements: 5 };
const ROBOTS_AGENT = "cbrowser";
const ROBOTS_UA = "Mozilla/5.0 (compatible; cbrowser-ctc-reference/2.0; +https://cbrowser.ai)";
const ROBOTS_TIMEOUT_MS = 15_000;

/**
 * cognitive_effort's blocked-page signatures, verbatim
 * (src/mcp-tools/base/persona-comparison-tools.ts, BLOCK_SIGNATURES).
 * tests/ctc-reference.test.ts reads both and fails if they drift.
 */
export const BLOCK_SIGNATURES = [
  'access denied', '403 forbidden', 'just a moment', 'press & hold',
  'verify you are human', 'captcha', 'blocked', 'robot check',
  'cloudflare', 'please wait', 'checking your browser',
];

export type Frame = "brand" | "tranco" | "public";
export type PageType = "landing" | InnerType;
export type Outcome = "graded" | "blocked" | "error" | "excluded" | "robots";
export type Route = "direct" | "proxy";

export interface SiteEntry {
  site: string;
  /** The landing URL the crawl starts from. */
  landing: string;
  sector: string;
  /** brand: industry; tranco: rank and band; public: directory id. */
  rank?: number;
  band?: string;
  source?: string;
}

interface PageJob { url: string; route: Route; landing: boolean }

interface PageResult {
  outcome: "graded" | "blocked" | "error";
  detail?: string;
  finalUrl?: string;
  httpStatus?: number;
  contentType?: string;
  bytes: number;
  ms: number;
  measuredViewport?: { w: number; h: number };
  raw?: { viewport: unknown; full_page: unknown };
  flags?: { adult: string[]; gambling: string[]; parked: string[] };
  discovered?: Partial<Record<InnerType, Discovered>>;
}

interface Attempt { route: Route; outcome: PageResult["outcome"]; detail?: string; bytes: number; ms: number }

export interface PageRow {
  frame: Frame;
  site: string;
  sector: string;
  rank?: number;
  band?: string;
  source?: string;
  pageType: PageType;
  url: string;
  how?: string;
  outcome: Outcome;
  detail?: string;
  robots: string;
  route?: Route;
  attempts: Attempt[];
  bytes: number;
  proxyBytes: number;
  finalUrl?: string;
  httpStatus?: number;
  measuredViewport?: { w: number; h: number };
  raw?: { viewport: unknown; full_page: unknown };
  discovered?: Partial<Record<InnerType, Discovered>>;
}

// ── The proxy credential: read, used, never written anywhere ──

interface ProxyCredential { host: string; port: number; username: string; basePassword: string; regions?: Record<string, { country: string; city?: string }> }

function loadCredential(): ProxyCredential | null {
  const path = process.env.CTC_PROXY_CREDENTIAL;
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as ProxyCredential;
}

function proxyFor(c: ProxyCredential): { server: string; username: string; password: string } {
  const region = c.regions?.[PROXY_REGION] ?? { country: "us", city: "denver" };
  return {
    server: `http://${c.host}:${c.port}`,
    username: c.username,
    password: `${c.basePassword}_country-${region.country}${region.city ? `_city-${region.city}` : ""}`,
  };
}

/** Remove every credential value from a string before it is stored. */
function scrub(s: string, c: ProxyCredential | null): string {
  if (!c) return s;
  let out = s;
  for (const secret of [c.basePassword, c.username, `${c.host}:${c.port}`, c.host].filter((x) => x && x.length >= 4)) {
    out = out.split(secret).join("<proxy>");
  }
  return out;
}

// ── One page, in its own process ──

async function crawlPage(job: PageJob): Promise<PageResult> {
  const t0 = Date.now();
  const dataDir = mkdtempSync(join(tmpdir(), "ctc-ref2-"));
  process.env.CBROWSER_DATA_DIR = dataDir;
  delete process.env.CBROWSER_PROXY;
  delete process.env.CBROWSER_PROXY_SERVER;
  delete process.env.CBROWSER_VERBOSE;
  const cred = job.route === "proxy" ? loadCredential() : null;
  if (job.route === "proxy" && !cred) return { outcome: "error", detail: "no proxy credential", bytes: 0, ms: 0 };
  const { CBrowser } = await import("../../src/browser.js");
  const { measurePageRaw, measurePageGeometry } = await import("../../src/visual/cognitive-transport.js");
  const b = new CBrowser({
    headless: true, viewportWidth: VIEWPORT.width, viewportHeight: VIEWPORT.height, dataDir,
    ...(cred ? { proxy: proxyFor(cred) } : {}),
  });
  let bytes = 0;
  const pending: Promise<void>[] = [];
  const done = async () => { await Promise.race([Promise.allSettled(pending), new Promise((r) => setTimeout(r, 3_000))]); return bytes; };
  try {
    const first = await b.getPage();
    // Bytes over the wire for every request of the context (all frames):
    // encoded body plus headers, once each request finishes.
    first.context().on("requestfinished", (req) => {
      pending.push(req.sizes().then((s) => { bytes += s.responseBodySize + s.responseHeadersSize; }, () => {}));
    });
    await b.navigate(job.url);
    const page = await b.getPage();
    const finalUrl = page.url();
    const info = await page.evaluate(() => {
      const perf = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      return {
        title: document.title || "",
        description: document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
        opening: document.body?.innerText?.slice(0, 2000) || "",
        httpStatus: perf?.responseStatus || 200,
        contentType: document.contentType || "",
        w: window.innerWidth, h: window.innerHeight,
      };
    }).catch(() => ({ title: "", description: "", opening: "", httpStatus: 200, contentType: "", w: 0, h: 0 }));
    const lower = `${info.title}\n${info.opening.slice(0, 500)}`.toLowerCase();
    const signature = BLOCK_SIGNATURES.find((s) => lower.includes(s));
    if (info.httpStatus >= 400 || signature) {
      return { outcome: "blocked", detail: signature ? `signature "${signature}"` : `HTTP ${info.httpStatus}`, finalUrl, httpStatus: info.httpStatus, contentType: info.contentType, bytes: await done(), ms: Date.now() - t0 };
    }
    // Viewport first: what cognitive_effort measures right after navigation,
    // before anything has scrolled. full_page then walks the page.
    const geometry = await measurePageGeometry(page);
    const viewport = await measurePageRaw(page, "viewport", geometry);
    const full_page = await measurePageRaw(page, "full_page", geometry);
    if (full_page.interactiveElements === 0) {
      return { outcome: "blocked", detail: "0 interactive elements on the whole document", finalUrl, httpStatus: info.httpStatus, contentType: info.contentType, bytes: await done(), ms: Date.now() - t0 };
    }
    const result: PageResult = {
      outcome: "graded", finalUrl, httpStatus: info.httpStatus, contentType: info.contentType,
      measuredViewport: { w: info.w, h: info.h }, raw: { viewport, full_page }, bytes: 0, ms: 0,
    };
    if (job.landing) {
      result.flags = contentFlags(`${info.title}\n${info.description}\n${info.opening}`.toLowerCase());
      const exposed = await page.evaluate(() => {
        const region = (el: Element): "nav" | "footer" | "main" | "body" =>
          el.closest('header, nav, [role="navigation"], [role="banner"]') ? "nav"
            : el.closest('footer, [role="contentinfo"]') ? "footer"
              : el.closest('main, article, [role="main"]') ? "main" : "body";
        const anchors = Array.from(document.querySelectorAll("a[href]")).map((a) => {
          const r = a.getBoundingClientRect();
          return {
            href: (a as HTMLAnchorElement).href,
            text: ((a as HTMLElement).innerText || a.getAttribute("aria-label") || a.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 80),
            region: region(a), visible: r.width > 0 && r.height > 0,
          };
        });
        const labelOf = (el: Element) => {
          const id = el.getAttribute("id");
          const byFor = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : null;
          return (el.getAttribute("aria-label") || byFor || el.closest("label")?.textContent || "").trim();
        };
        const forms = Array.from(document.querySelectorAll("form")).map((f) => ({
          action: (f as HTMLFormElement).action,
          method: (f.getAttribute("method") || "get").toLowerCase(),
          inSearch: !!f.closest('[role="search"]'),
          role: f.getAttribute("role"),
          fields: Array.from((f as HTMLFormElement).elements).map((e) => ({
            tag: e.tagName.toLowerCase(),
            type: (e.getAttribute("type") || "").toLowerCase(),
            name: e.getAttribute("name"),
            value: (e as HTMLInputElement).value ?? "",
            placeholder: e.getAttribute("placeholder"),
            label: labelOf(e),
            checked: !!(e as HTMLInputElement).checked,
          })),
        }));
        return { anchors, forms };
      }).catch(() => ({ anchors: [] as AnchorInfo[], forms: [] as FormInfo[] }));
      result.discovered = discoverInner(finalUrl, exposed.anchors as AnchorInfo[], exposed.forms as FormInfo[]);
    }
    result.bytes = await done();
    result.ms = Date.now() - t0;
    return result;
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    // Through the proxy, an error message can name the proxy; keep the code only.
    const code = msg.match(/net::ERR_[A-Z_]+/)?.[0] ?? (/timeout/i.test(msg) ? "timeout" : "navigation failed");
    const detail = cred ? code : msg.split("\n")[0].slice(0, 200);
    return { outcome: "error", detail: scrub(detail, cred), bytes: await done(), ms: Date.now() - t0 };
  } finally {
    await b.close().catch(() => {});
    try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

function runPage(job: PageJob): Promise<PageResult> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const ceiling = job.route === "proxy" ? PROXY_PAGE_CEILING_MS : PAGE_CEILING_MS;
    const p = spawn("bun", [join(HERE, "crawl-v2.ts"), "--page", JSON.stringify(job)], { cwd: ROOT, env: process.env });
    let out = "";
    p.stdout.on("data", (d) => { out += d.toString(); });
    p.stderr.on("data", () => { /* page and browser noise; never logged */ });
    const killer = setTimeout(() => { try { p.kill("SIGKILL"); } catch { /* gone */ } }, ceiling);
    p.on("close", () => {
      clearTimeout(killer);
      const ms = Date.now() - t0;
      const line = out.split("\n").find((l) => l.startsWith(MARK));
      if (!line) return resolve({ outcome: "error", detail: ms >= ceiling ? "timeout" : "no result", bytes: 0, ms });
      try { resolve(JSON.parse(line.slice(MARK.length)) as PageResult); }
      catch { resolve({ outcome: "error", detail: "unparseable result", bytes: 0, ms }); }
    });
  });
}

// ── The crawl ──

interface FramesFile {
  builtOn: string;
  seed: number;
  frames: Record<Frame, { description: string; sites: SiteEntry[]; [k: string]: unknown }>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isPublicHost = (host: string) => /\.(gov|mil)$/i.test(host);

async function crawl(args: string[]) {
  const arg = (n: string, d: number) => (args.includes(n) ? Number(args[args.indexOf(n) + 1]) : d);
  const concurrency = arg("--concurrency", 4);
  const deadline = Date.now() + arg("--deadline-min", 300) * 60_000;
  // --frames, --frame-quota and --tag exist for a small trial run of the scheduler.
  const framesPath = args.includes("--frames") ? args[args.indexOf("--frames") + 1] : FRAMES_PATH;
  const frameQuota = arg("--frame-quota", FRAME_QUOTA);
  const tag = args.includes("--tag") ? `-${args[args.indexOf("--tag") + 1]}` : "";
  const frames = JSON.parse(readFileSync(framesPath, "utf8")) as FramesFile;
  const credential = loadCredential();
  if (!credential) console.log("no proxy credential: blocked pages will not be retried");
  const resumeFrom = args.includes("--resume") ? args[args.indexOf("--resume") + 1] : undefined;
  const date = resumeFrom ? (resumeFrom.match(/crawl-v2-(\d{4}-\d{2}-\d{2})\.jsonl$/)?.[1] ?? new Date().toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10);
  mkdirSync(OUT, { recursive: true });
  const rawPath = join(OUT, `crawl-v2-${date}${tag}${resumeFrom ? "-resumed" : ""}.jsonl`);
  writeFileSync(rawPath, "");

  const order: Frame[] = ["brand", "tranco", "public"];
  const graded: Record<Frame, number> = { brand: 0, tranco: 0, public: 0 };
  const cell: Record<Frame, Record<PageType, number>> = Object.fromEntries(order.map((f) => [f, Object.fromEntries((["landing", ...INNER_TYPES] as PageType[]).map((t) => [t, 0]))])) as Record<Frame, Record<PageType, number>>;
  const next: Record<Frame, number> = { brand: 0, tranco: 0, public: 0 };
  const landingDomains = new Set<string>();
  let proxyBytes = 0, proxyPages = 0, budgetExhausted = false;
  const robotsCache = new Map<string, Promise<Robots>>();
  const doneSites = new Set<string>();

  const emit = (row: PageRow) => {
    appendFileSync(rawPath, `${JSON.stringify(row)}\n`);
    if (row.outcome === "graded") { graded[row.frame]++; cell[row.frame][row.pageType]++; }
    if (row.outcome === "graded" && row.pageType === "landing" && row.finalUrl) landingDomains.add(siteDomain(new URL(row.finalUrl).hostname));
  };

  if (resumeFrom) {
    for (const line of readFileSync(resumeFrom, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const row = JSON.parse(line) as PageRow;
      emit(row);
      if (row.attempts.some((a) => a.route === "proxy")) { proxyPages++; proxyBytes += row.proxyBytes; }
      doneSites.add(`${row.frame}|${row.site}`);
    }
    console.log(`resumed ${doneSites.size} sites from ${resumeFrom}`);
  }

  const robotsFor = (host: string) => {
    let r = robotsCache.get(host);
    if (!r) { r = fetchRobots(host, ROBOTS_AGENT, ROBOTS_UA, ROBOTS_TIMEOUT_MS); robotsCache.set(host, r); }
    return r;
  };

  /** Load one page: direct, then once through the proxy if direct was blocked. */
  async function load(url: string, landing: boolean): Promise<{ result: PageResult; attempts: Attempt[]; route: Route; proxyBytes: number }> {
    const attempts: Attempt[] = [];
    const direct = await runPage({ url, route: "direct", landing });
    attempts.push({ route: "direct", outcome: direct.outcome, ...(direct.detail ? { detail: direct.detail } : {}), bytes: direct.bytes, ms: direct.ms });
    if (direct.outcome !== "blocked") return { result: direct, attempts, route: "direct", proxyBytes: 0 };
    const host = new URL(direct.finalUrl ?? url).hostname;
    if (!credential || isPublicHost(host) || isPublicHost(new URL(url).hostname)) return { result: direct, attempts, route: "direct", proxyBytes: 0 };
    if (proxyBytes >= PROXY_BUDGET_BYTES) {
      budgetExhausted = true;
      return { result: { ...direct, detail: `${direct.detail}; proxy budget exhausted` }, attempts, route: "direct", proxyBytes: 0 };
    }
    const viaProxy = await runPage({ url, route: "proxy", landing });
    proxyPages++;
    proxyBytes += viaProxy.bytes;
    attempts.push({ route: "proxy", outcome: viaProxy.outcome, ...(viaProxy.detail ? { detail: viaProxy.detail } : {}), bytes: viaProxy.bytes, ms: viaProxy.ms });
    return { result: viaProxy, attempts, route: "proxy", proxyBytes: viaProxy.bytes };
  }

  function rowOf(frame: Frame, s: SiteEntry, pageType: PageType, url: string, robots: string, l: Awaited<ReturnType<typeof load>>, how?: string): PageRow {
    const r = l.result;
    return {
      frame, site: s.site, sector: s.sector,
      ...(s.rank !== undefined ? { rank: s.rank } : {}), ...(s.band ? { band: s.band } : {}), ...(s.source ? { source: s.source } : {}),
      pageType, url, ...(how ? { how } : {}),
      outcome: r.outcome, ...(r.detail ? { detail: scrub(r.detail, credential) } : {}),
      robots, route: l.route, attempts: l.attempts.map((a) => ({ ...a, ...(a.detail ? { detail: scrub(a.detail, credential) } : {}) })),
      bytes: l.attempts.reduce((x, a) => x + a.bytes, 0), proxyBytes: l.proxyBytes,
      ...(r.finalUrl ? { finalUrl: r.finalUrl } : {}), ...(r.httpStatus ? { httpStatus: r.httpStatus } : {}),
      ...(r.outcome === "graded" ? { measuredViewport: r.measuredViewport, raw: r.raw } : {}),
    };
  }

  async function robotsGate(url: string): Promise<{ ok: boolean; unreachable: boolean; note: string; delayMs: number }> {
    const host = new URL(url).hostname;
    const r = await robotsFor(host);
    const ok = robotsAllows(r, url);
    const delayMs = Math.max(SITE_DELAY_MS, Math.min(MAX_CRAWL_DELAY_S, r.crawlDelay ?? 0) * 1000);
    return { ok, unreachable: r.status === "unreachable", note: `${ok ? "allowed" : "disallowed"} (robots.txt ${r.status}, ${r.detail})`, delayMs };
  }

  const robotsRow = (frame: Frame, s: SiteEntry, pageType: PageType, url: string, note: string, how?: string): PageRow => ({
    frame, site: s.site, sector: s.sector,
    ...(s.rank !== undefined ? { rank: s.rank } : {}), ...(s.band ? { band: s.band } : {}), ...(s.source ? { source: s.source } : {}),
    pageType, url, ...(how ? { how } : {}), outcome: "robots", detail: note, robots: note, attempts: [], bytes: 0, proxyBytes: 0,
  });

  async function site(frame: Frame, s: SiteEntry) {
    // ── Landing ──
    let landingUrl = s.landing;
    let gate = await robotsGate(landingUrl);
    // A drawn domain often answers only on www.: when the apex has no reachable
    // robots.txt (no DNS, refused), the www. host is the site, if it answers.
    if (!gate.ok && gate.unreachable && frame === "tranco" && !new URL(landingUrl).hostname.startsWith("www.")) {
      const www = new URL(landingUrl); www.hostname = `www.${www.hostname}`;
      const g2 = await robotsGate(www.toString());
      if (g2.ok) { landingUrl = www.toString(); gate = g2; }
      else gate = { ...gate, note: `${gate.note}; www.: ${g2.note}` };
    }
    if (!gate.ok) { emit(robotsRow(frame, s, "landing", landingUrl, gate.note)); return; }
    let l = await load(landingUrl, true);
    // A drawn domain often answers only on www.: try it once when the apex does not.
    if (frame === "tranco" && l.result.outcome === "error" && /NAME_NOT_RESOLVED|CONNECTION_REFUSED|CONNECTION_TIMED_OUT|ADDRESS_UNREACHABLE|CONNECTION_RESET|CERT_COMMON_NAME_INVALID|SSL_PROTOCOL/.test(l.result.detail ?? "")
      && !new URL(landingUrl).hostname.startsWith("www.")) {
      const www = new URL(landingUrl); www.hostname = `www.${www.hostname}`;
      const g2 = await robotsGate(www.toString());
      if (g2.ok) {
        await sleep(SITE_DELAY_MS);
        const l2 = await load(www.toString(), true);
        l2.attempts = [...l.attempts.map((a) => ({ ...a, detail: `${a.detail ?? ""} (apex)` })), ...l2.attempts];
        l = l2; landingUrl = www.toString(); gate = g2;
      }
    }
    const row = rowOf(frame, s, "landing", landingUrl, gate.note, l);
    const r = l.result;
    if (r.outcome === "graded") {
      const finalHost = new URL(r.finalUrl ?? landingUrl).hostname;
      const full = (r.raw?.full_page ?? {}) as { textChars?: number; interactiveElements?: number };
      let exclusion: string | null = null;
      if (frame === "tranco") {
        if (!/html/i.test(r.contentType ?? "text/html")) exclusion = `not an HTML page (${r.contentType})`;
        else if (siteDomain(finalHost) !== siteDomain(new URL(landingUrl).hostname)
          && !siteDomain(finalHost).endsWith(`.${siteDomain(new URL(landingUrl).hostname)}`)) exclusion = `redirected off-site to ${finalHost}`;
        else exclusion = contentExclusion(r.flags ?? { adult: [], gambling: [], parked: [] });
        if (!exclusion && ((full.textChars ?? 0) < LANDING_MIN.textChars || (full.interactiveElements ?? 0) < LANDING_MIN.interactiveElements)) {
          exclusion = `below the web-page minimums (${full.textChars} text characters, ${full.interactiveElements} interactive elements at full_page; need ${LANDING_MIN.textChars} and ${LANDING_MIN.interactiveElements})`;
        }
      }
      if (!exclusion && landingDomains.has(siteDomain(finalHost))) exclusion = `duplicate: ${siteDomain(finalHost)} is already in the reference`;
      if (exclusion) {
        delete row.raw; delete row.measuredViewport;
        row.outcome = "excluded"; row.detail = exclusion;
        emit(row);
        return;
      }
    }
    row.discovered = r.discovered;
    emit(row);
    if (r.outcome !== "graded" || !r.discovered) return;

    // ── Inner pages, in the order of this frame's deficit ──
    const types = (Object.keys(r.discovered) as InnerType[]).sort((a, b) => cell[frame][a] - cell[frame][b] || INNER_TYPES.indexOf(a) - INNER_TYPES.indexOf(b));
    for (const type of types) {
      if (cell[frame][type] >= TYPE_QUOTA || graded[frame] >= frameQuota || Date.now() > deadline) continue;
      const d = r.discovered[type]!;
      const g = await robotsGate(d.url);
      if (!g.ok) { emit(robotsRow(frame, s, type, d.url, g.note, d.how)); continue; }
      await sleep(Math.max(gate.delayMs, g.delayMs));
      const li = await load(d.url, false);
      emit(rowOf(frame, s, type, d.url, g.note, li, d.how));
    }
  }

  const frameOpen = (f: Frame) => graded[f] < frameQuota && next[f] < frames.frames[f].sites.length;
  let active = 0, sitesDone = 0;
  async function worker() {
    for (;;) {
      if (Date.now() > deadline) return;
      const open = order.filter(frameOpen);
      if (!open.length) return;
      const f = open.sort((a, b) => graded[a] - graded[b] || order.indexOf(a) - order.indexOf(b))[0];
      const s = frames.frames[f].sites[next[f]++];
      if (doneSites.has(`${f}|${s.site}`)) continue;
      active++;
      try { await site(f, s); } catch (e) { console.log(`site ${s.site} failed: ${String((e as Error).message).slice(0, 120)}`); }
      active--;
      sitesDone++;
      if (sitesDone % 5 === 0) {
        console.log(`[${new Date().toISOString()}] sites ${sitesDone}  graded brand ${graded.brand} tranco ${graded.tranco} public ${graded.public}  proxy pages ${proxyPages} bytes ${(proxyBytes / 1e6).toFixed(0)}MB  active ${active}`);
      }
    }
  }
  console.log(`crawl-v2 ${date}${tag}: concurrency ${concurrency}, quotas ${frameQuota}/frame and ${TYPE_QUOTA}/(frame, type), ${VIEWPORT.width}x${VIEWPORT.height}, proxy ${credential ? "available" : "off"}`);
  await Promise.all(Array.from({ length: concurrency }, worker));

  const rows = readFileSync(rawPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as PageRow);
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string };
  const summary = {
    date, rawPath: rawPath.slice(ROOT.length + 1),
    cbrowserVersion: pkg.version, gitHead: process.env.CTC_GIT_HEAD ?? "unknown",
    viewport: VIEWPORT, quotas: { frame: frameQuota, type: TYPE_QUOTA },
    deadlineReached: Date.now() > deadline,
    graded, cells: cell,
    outcomes: Object.fromEntries((["graded", "blocked", "error", "excluded", "robots"] as Outcome[]).map((o) => [o, rows.filter((r) => r.outcome === o).length])),
    attempted: rows.length,
    proxy: { region: PROXY_REGION, pages: proxyPages, bytes: proxyBytes, budgetBytes: PROXY_BUDGET_BYTES, budgetExhausted },
    bytes: rows.reduce((x, r) => x + r.bytes, 0),
    sitesTaken: next,
  };
  writeFileSync(join(OUT, `crawl-v2-${date}${tag}.summary.json`), JSON.stringify(summary, null, 1));
  console.log(JSON.stringify(summary));
}

// ── Frames ──

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

async function getText(url: string, accept?: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": ROBOTS_UA, ...(accept ? { accept } : {}) }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

const USAGOV_STATES = "https://www.usa.gov/states/";
const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
  "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
  "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
];
const WIKIDATA = "https://query.wikidata.org/sparql";
const SPARQL = {
  cities: `SELECT ?city (SAMPLE(?cityLabel) AS ?name) (MAX(?pop) AS ?population) (SAMPLE(?w) AS ?website) WHERE { ?city wdt:P17 wd:Q30; wdt:P1082 ?pop; wdt:P856 ?w; wdt:P31/wdt:P279* wd:Q515. ?city rdfs:label ?cityLabel. FILTER(LANG(?cityLabel) = "en") FILTER(?pop >= 400000) } GROUP BY ?city ORDER BY DESC(?population)`,
  nonprofits: `SELECT ?o (SAMPLE(?label) AS ?name) (SAMPLE(?w) AS ?website) (MAX(?links) AS ?sitelinks) WHERE { VALUES ?type { wd:Q163740 wd:Q708676 wd:Q18325436 wd:Q7210356 } ?o wdt:P31 ?type; wdt:P17 wd:Q30; wdt:P856 ?w; wikibase:sitelinks ?links. ?o rdfs:label ?label. FILTER(LANG(?label) = "en") FILTER(?links >= 15) } GROUP BY ?o ORDER BY DESC(?sitelinks) LIMIT 400`,
};

async function sparql(query: string): Promise<Array<Record<string, { value: string }>>> {
  const url = `${WIKIDATA}?query=${encodeURIComponent(query)}`;
  const body = JSON.parse(await getText(url, "application/sparql-results+json")) as { results: { bindings: Array<Record<string, { value: string }>> } };
  return body.results.bindings;
}

function csvRows(text: string): string[][] {
  return text.split(/\r?\n/).filter(Boolean).map((line) => {
    const out: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  });
}

async function buildFrames() {
  const builtOn = new Date().toISOString().slice(0, 10);
  const retrieved = new Date().toISOString();
  const brandList = JSON.parse(readFileSync(join(ROOT, "research", "benchmark", "sites.json"), "utf8")) as Array<{ site: string; url: string; industry: string }>;
  const brandDomains = new Set(brandList.map((b) => siteDomain(b.url.split("/")[0])));
  const brand: SiteEntry[] = shuffled(brandList, mulberry32(SEED)).map((b) => ({ site: b.site, landing: `https://${b.url}`, sector: b.industry }));

  // ── Tranco ──
  const listId = (await getText("https://tranco-list.eu/top-1m-id")).trim();
  const meta = JSON.parse(await getText(`https://tranco-list.eu/api/lists/id/${listId}`)) as { created_on: string; configuration: unknown; download: string };
  mkdirSync(OUT, { recursive: true });
  const csvPath = join(OUT, `tranco-${listId}.csv`);
  if (!existsSync(csvPath)) writeFileSync(csvPath, await getText(meta.download));
  const byRank = new Map<number, string>();
  for (const [rank, domain] of csvRows(readFileSync(csvPath, "utf8"))) byRank.set(Number(rank), domain);
  const rng = mulberry32(SEED + 1);
  const exclusions: Array<{ rank: number; domain: string; reason: string }> = [];
  const bands: SiteEntry[][] = [];
  const seen = new Set<number>();
  for (const [lo, hi] of TRANCO_BANDS) {
    const band = `${lo}-${hi}`;
    const picked: SiteEntry[] = [];
    while (picked.length < TRANCO_PER_BAND) {
      const rank = lo + Math.floor(rng() * (hi - lo + 1));
      if (seen.has(rank)) continue;
      seen.add(rank);
      const domain = byRank.get(rank);
      if (!domain) continue;
      const why = domainExclusion(domain) ?? (brandDomains.has(siteDomain(domain)) ? "in the brand frame" : null);
      if (why) { exclusions.push({ rank, domain, reason: why }); continue; }
      const tld = domain.split(".").pop() ?? "";
      const sector = tld === "edu" ? "education" : tld === "gov" || tld === "mil" ? "government" : tld === "org" ? "organisation (.org)" : "commercial or other";
      picked.push({ site: domain, landing: `https://${domain}/`, sector, rank, band });
    }
    bands.push(picked);
  }

  // ── Public: CISA .gov registry and Wikidata ──
  const cisaUrl = "https://raw.githubusercontent.com/cisagov/dotgov-data/main/current-federal.csv";
  const cisa = csvRows(await getText(cisaUrl));
  const header = cisa[0];
  const col = (n: string) => header.indexOf(n);
  const publicExclusions: Array<{ site: string; url: string; reason: string }> = [];
  const federalAll = cisa.slice(1).filter((r) => r[col("Domain type")]?.startsWith("Federal"));
  const federal: SiteEntry[] = shuffled(federalAll, mulberry32(SEED + 2)).slice(0, FEDERAL_SAMPLE)
    .map((r) => ({ site: r[col("Domain name")], landing: `https://${r[col("Domain name")]}/`, sector: "government (federal)", source: `cisa-federal: ${r[col("Organization name")]}` }));
  // The 50 state portals as USAGov lists them: each state's page names its
  // "State government website". Fetched at usa.gov's own crawl-delay.
  const usaRobots = await fetchRobots("www.usa.gov", ROBOTS_AGENT, ROBOTS_UA, ROBOTS_TIMEOUT_MS);
  const usaDelay = Math.max(1, Math.min(MAX_CRAWL_DELAY_S, usaRobots.crawlDelay ?? 1)) * 1000;
  const stateList: SiteEntry[] = [];
  for (const name of US_STATES) {
    const page = `${USAGOV_STATES}${name.toLowerCase().replace(/ /g, "-")}`;
    if (!robotsAllows(usaRobots, page)) { publicExclusions.push({ site: name, url: page, reason: "usa.gov robots.txt disallows the state page" }); continue; }
    const html = await getText(page);
    const section = html.slice(html.indexOf("State government website"));
    const m = section.match(/field--name-field-website[^>]*>\s*<a href="([^"]+)"/);
    if (!m) publicExclusions.push({ site: name, url: page, reason: "no state government website on the USAGov page" });
    else stateList.push({ site: name, landing: m[1], sector: "government (state)", source: `usagov-states: ${page}` });
    await sleep(usaDelay);
  }
  const states = shuffled(stateList, mulberry32(SEED + 3));
  const cityRows = await sparql(SPARQL.cities);
  const cities: SiteEntry[] = [];
  for (const b of cityRows) {
    const host = new URL(b.website.value).hostname;
    if (/visit|discover/i.test(host)) { publicExclusions.push({ site: b.name.value, url: b.website.value, reason: "tourism-board site, not the city's" }); continue; }
    cities.push({ site: b.name.value, landing: b.website.value, sector: "government (city)", source: `wikidata-cities: population ${b.population.value}` });
  }
  const npRows = await sparql(SPARQL.nonprofits);
  const npAll: SiteEntry[] = [];
  for (const b of npRows) {
    const host = new URL(b.website.value).hostname;
    if (/\.(gov|mil)$/i.test(host)) { publicExclusions.push({ site: b.name.value, url: b.website.value, reason: "government host" }); continue; }
    if (brandDomains.has(siteDomain(host))) { publicExclusions.push({ site: b.name.value, url: b.website.value, reason: "in the brand frame" }); continue; }
    npAll.push({ site: b.name.value, landing: b.website.value, sector: "nonprofit", source: `wikidata-nonprofits: ${b.sitelinks.value} sitelinks` });
  }
  const nonprofits = shuffled(npAll, mulberry32(SEED + 4)).slice(0, NONPROFIT_SAMPLE);

  const out = {
    builtOn,
    seed: SEED,
    note: "Built by research/ctc-reference/crawl-v2.ts --build-frames. Each frame's sites are in crawl order; the crawl takes them in that order until the frame's quota is met.",
    frames: {
      brand: {
        description: "The v1 brand list, research/benchmark/sites.json (199 sites with an industry label), in a seeded random order.",
        source: "research/benchmark/sites.json",
        sites: brand,
      },
      tranco: {
        description: `A seeded random draw of ${TRANCO_PER_BAND} domains per rank band from the Tranco list ${listId}, adult and gambling domains (by name) and brand-frame domains excluded and redrawn. Landing pages are further filtered after loading: not HTML, redirected off-site, parked, adult or gambling by content, below the web-page minimums.`,
        listId, listCreated: meta.created_on, listUrl: meta.download, listConfiguration: meta.configuration, retrieved,
        bands: TRANCO_BANDS.map(([lo, hi]) => `${lo}-${hi}`), perBand: TRANCO_PER_BAND,
        landingMinimums: LANDING_MIN,
        domainTerms: "research/ctc-reference/discover.ts DOMAIN_ADULT and DOMAIN_GAMBLING (substring of the domain); page terms PAGE_ADULT, PAGE_GAMBLING (two distinct terms of one kind) and PAGE_PARKED (one) in the title, meta description and first 2,000 characters of text",
        exclusions,
        sites: interleave(bands),
      },
      public: {
        description: "Government and nonprofit sites from public directories, interleaved by source.",
        sources: [
          { id: "cisa-federal", url: cisaUrl, what: `CISA's .gov registry, federal domains (${federalAll.length}); seeded sample of ${FEDERAL_SAMPLE}`, retrieved },
          { id: "usagov-states", url: `${USAGOV_STATES}<state>`, what: "the \"State government website\" USAGov lists on each of the 50 state pages, fetched at usa.gov's crawl-delay", retrieved },
          { id: "wikidata-cities", url: WIKIDATA, query: SPARQL.cities, what: "US cities (subclasses of Q515) of 400,000 or more with an official website; tourism-board sites excluded", retrieved },
          { id: "wikidata-nonprofits", url: WIKIDATA, query: SPARQL.nonprofits, what: `notable US nonprofits (15+ Wikipedia sitelinks) with an official website; government hosts and brand-frame domains excluded; seeded sample of ${NONPROFIT_SAMPLE}`, retrieved },
        ],
        exclusions: publicExclusions,
        sites: interleave([federal, states, cities, nonprofits]),
      },
    },
  };
  writeFileSync(FRAMES_PATH, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`wrote ${FRAMES_PATH}: brand ${brand.length}, tranco ${bands.flat().length} (${exclusions.length} excluded by name or frame), public ${out.frames.public.sites.length} (federal ${federal.length}, states ${states.length}, cities ${cities.length}, nonprofits ${nonprofits.length})`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--page") {
    const r = await crawlPage(JSON.parse(args[1]) as PageJob);
    process.stdout.write(`${MARK}${JSON.stringify(r)}\n`);
    process.exit(0);
  }
  if (args[0] === "--build-frames") return buildFrames();
  return crawl(args);
}

if (import.meta.main) main().catch((e) => { console.error(String((e as Error).message ?? e).slice(0, 300)); process.exit(1); });
