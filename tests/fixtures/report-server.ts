/**
 * A fixture server that also records what pages report back.
 *
 * Serves tests/fixtures by file name, like serve-fixtures.ts, and records every
 * GET /report?... (device-report.js sends one per page load) with the request's
 * user agent, so a test can read what a browser was given without driving the
 * page itself. A POST to any path is recorded too, body parsed as JSON, so the
 * same server can stand in for a webhook receiver.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

const FIXTURES = import.meta.dir;
const TYPES: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };

export interface PageReport {
  userAgent: string;
  values: Record<string, string>;
}

export interface Posted {
  path: string;
  contentType: string;
  body: unknown;
}

export interface ReportServer {
  base: string;
  reports: PageReport[];
  posts: Posted[];
  /** Resolves once `count` reports have arrived, or rejects after `ms`. */
  waitForReports(count: number, ms?: number): Promise<PageReport[]>;
  close(): void;
}

export function startReportServer(): ReportServer {
  const reports: PageReport[] = [];
  const posts: Posted[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "POST") {
        const text = await req.text();
        let body: unknown = text;
        try { body = JSON.parse(text); } catch { /* keep the text */ }
        posts.push({ path: url.pathname, contentType: req.headers.get("content-type") ?? "", body });
        return new Response("ok");
      }
      if (url.pathname === "/report") {
        reports.push({ userAgent: req.headers.get("user-agent") ?? "", values: Object.fromEntries(url.searchParams) });
        return new Response("ok");
      }
      const name = basename(url.pathname);
      try {
        const body = readFileSync(join(FIXTURES, name));
        return new Response(body, { headers: { "Content-Type": TYPES[extname(name)] ?? "application/octet-stream" } });
      } catch {
        return new Response("not found", { status: 404 });
      }
    },
  });
  return {
    base: `http://127.0.0.1:${server.port}/`,
    reports,
    posts,
    async waitForReports(count, ms = 5000) {
      const end = Date.now() + ms;
      while (reports.length < count) {
        if (Date.now() > end) throw new Error(`expected ${count} page report(s), got ${reports.length}`);
        await new Promise((r) => setTimeout(r, 25));
      }
      return reports;
    },
    close: () => server.stop(true),
  };
}
