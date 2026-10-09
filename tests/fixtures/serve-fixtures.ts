/**
 * A throwaway HTTP server for tests/fixtures, by file name.
 *
 * Served over HTTP rather than file:// because Chromium gives file:// pages an
 * opaque origin, and so a fixture's stylesheet and script load the same way a
 * real page's do.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

const FIXTURES = import.meta.dir;
const TYPES: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };

/** Start serving; resolves with the base URL and a close function. */
export async function serveFixtures(): Promise<{ base: string; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const name = basename((req.url ?? "/").split("?")[0]);
    try {
      const body = readFileSync(join(FIXTURES, name));
      res.writeHead(200, { "Content-Type": TYPES[extname(name)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
