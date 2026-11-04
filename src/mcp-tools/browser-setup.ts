/**
 * browser-setup.ts — the proxy parameter: the network path a page is measured
 * from, for cognitive_effort.
 *
 * Through 21.4.0 cognitive_effort declared proxy and never read it, so it
 * measured from the server's own IP and the answer did not say so (2026-11-04,
 * Alexa: "fix the hosted cognitive_effort proxy").
 *
 * A proxy is set when a browser is created (Playwright cannot move a live
 * context to another proxy), so a call given one opens a browser of its own
 * through it and closes it afterwards, and refuses it with _browserToken, whose
 * browser keeps the network path it was opened with.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { z } from "zod";
import type { ProxyConfig } from "../types.js";
import { proxyConfigFromUrl } from "../proxy-forwarder.js";

export const proxyParam = z.string().optional().describe(
  "Proxy server URL for geo-accurate testing (e.g., 'http://user:pass@proxy.example.com:12321'). The call opens its own browser through the proxy, so the site sees the proxy's IP and location instead of the server's, and closes it when done. Not with _browserToken. On the hosted server the proxy must be a public host.",
);

export type BrowserSetupProblem = { error: string; parameters: string[]; message: string };

/** Options for the browser a call opens; no proxy given means none is needed. */
export type BrowserSetupOptions = { proxy?: ProxyConfig; timeout?: number };

/** Check the proxy and turn it into options for the call's own browser. A proxy that is not a URL is refused here, before anything opens. */
export function resolveBrowserSetup(given: {
  proxy?: string;
  _browserToken?: string;
}): { ok: true; options: BrowserSetupOptions | null } | { ok: false; problem: BrowserSetupProblem } {
  // "" counts as omitted, as refuseHostedProxy treats it.
  const proxy = given.proxy || undefined;
  if (!proxy) return { ok: true, options: null };
  if (given._browserToken) {
    return { ok: false, problem: {
      error: "not_with_browser_token",
      parameters: ["proxy"],
      message: "proxy does not apply to _browserToken: the session's browser keeps the network path it was opened with. Call without _browserToken to use it.",
    } };
  }
  try {
    // A proxy is slower to load through (Geo-Proxy docs: 30 s -> 60 s).
    return { ok: true, options: { proxy: proxyConfigFromUrl(proxy), timeout: 60000 } };
  } catch (e) {
    return { ok: false, problem: { error: "proxy_not_a_url", parameters: ["proxy"], message: (e as Error).message } };
  }
}
