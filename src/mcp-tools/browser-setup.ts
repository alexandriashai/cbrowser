/**
 * browser-setup.ts — proxy, userTimezone and userLocation: the parameters that
 * decide the browser a page is measured in, for cognitive_effort and
 * site_cognitive_assessment.
 *
 * Through 21.4.0 cognitive_effort read none of the three. It measured from the
 * server's own IP, in the server's time zone, with no geolocation, and only
 * echoed the location and time zone back in userContext. site_cognitive_assessment
 * set the time zone on the browser it opened, dropped it silently on a session,
 * and only echoed the location (2026-11-04, Alexa: "fix the hosted
 * cognitive_effort proxy", then "fix userLocation and userTimezone too").
 *
 * All three are set when a browser is created (Playwright has no way to move a
 * live context to another proxy or time zone), so a call given any of them
 * opens a browser of its own with them and closes it afterwards, and refuses
 * them with _browserToken, whose browser keeps what it was opened with. A
 * place name is not looked up: a location is a preset or coordinates, and
 * anything else is refused rather than guessed at.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { z } from "zod";
import { LOCATION_PRESETS, type GeoLocation, type ProxyConfig } from "../types.js";
import { proxyConfigFromUrl } from "../proxy-forwarder.js";

const PRESETS = Object.keys(LOCATION_PRESETS);

export const proxyParam = z.string().optional().describe(
  "Proxy server URL for geo-accurate testing (e.g., 'http://user:pass@proxy.example.com:12321'). The call opens its own browser through the proxy, so the site sees the proxy's IP and location instead of the server's, and closes it when done. Not with _browserToken. On the hosted server the proxy must be a public host.",
);

export const userTimezoneParam = z.string().optional().describe(
  "The browser's time zone, as an IANA name (e.g., 'America/Denver'): what Date and Intl report to the page. The call opens its own browser with it and closes it when done. Not with _browserToken. An unknown name is an error.",
);

export const userLocationParam = z.string().optional().describe(
  `The browser's geolocation (what navigator.geolocation reports, with permission granted): a preset (${PRESETS.join(", ")}) or 'latitude,longitude' (e.g., '39.74,-104.99' for Denver). It does not change the IP the site sees; use proxy for that. A place name is not looked up and is an error. The call opens its own browser with it and closes it when done. Not with _browserToken.`,
);

/** A preset ("new-york", "New York") or "latitude,longitude" in range; null for anything else. */
export function parseUserLocation(value: string): GeoLocation | null {
  const preset = LOCATION_PRESETS[value.trim().toLowerCase().replace(/[\s_]+/g, "-")];
  if (preset) return preset;
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(value);
  if (!m) return null;
  const latitude = Number(m[1]);
  const longitude = Number(m[2]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/** True for a time zone name this runtime's Intl knows. */
export function isTimeZone(value: string): boolean {
  if (!value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export type BrowserSetupProblem = { error: string; parameters: string[]; message: string };

/** Options for the browser a call opens: none of the three given means none is needed. */
export type BrowserSetupOptions = {
  proxy?: ProxyConfig;
  timeout?: number;
  timezone?: string;
  geolocation?: GeoLocation;
};

/**
 * Check the three and turn them into options for the call's own browser.
 * `alsoSession` names other parameters that likewise need a browser of the
 * call's own (site_cognitive_assessment's geoRegion), for the _browserToken
 * refusal. A proxy that is not a URL is refused here, before anything opens.
 */
export function resolveBrowserSetup(given: {
  proxy?: string;
  userTimezone?: string;
  userLocation?: string;
  _browserToken?: string;
  alsoSession?: Record<string, unknown>;
}): { ok: true; options: BrowserSetupOptions | null } | { ok: false; problem: BrowserSetupProblem } {
  // "" counts as omitted, as refuseHostedProxy treats it.
  const proxy = given.proxy || undefined;
  const userTimezone = given.userTimezone?.trim() || undefined;
  const userLocation = given.userLocation?.trim() || undefined;
  const { _browserToken } = given;
  if (userTimezone !== undefined && !isTimeZone(userTimezone)) {
    return { ok: false, problem: {
      error: "unknown_timezone",
      parameters: ["userTimezone"],
      message: `userTimezone "${userTimezone}" is not a time zone this server knows. Use an IANA name such as America/Denver or Europe/London.`,
    } };
  }
  const geolocation = userLocation !== undefined ? parseUserLocation(userLocation) : undefined;
  if (geolocation === null) {
    return { ok: false, problem: {
      error: "unknown_location",
      parameters: ["userLocation"],
      message: `userLocation must be a preset (${PRESETS.join(", ")}) or 'latitude,longitude', e.g. '39.74,-104.99'. A place name is not looked up, so "${userLocation}" would set no location.`,
    } };
  }
  const sessionBound = Object.entries({ proxy, userTimezone, userLocation, ...given.alsoSession })
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k]) => k);
  if (_browserToken && sessionBound.length > 0) {
    return { ok: false, problem: {
      error: "not_with_browser_token",
      parameters: sessionBound,
      message: `${sessionBound.join(", ")} ${sessionBound.length === 1 ? "does" : "do"} not apply to _browserToken: the session's browser keeps the network path, time zone and location it was opened with. Call without _browserToken to use ${sessionBound.length === 1 ? "it" : "them"}.`,
    } };
  }
  let proxyConfig: ProxyConfig | undefined;
  if (proxy) {
    try {
      proxyConfig = proxyConfigFromUrl(proxy);
    } catch (e) {
      return { ok: false, problem: { error: "proxy_not_a_url", parameters: ["proxy"], message: (e as Error).message } };
    }
  }
  if (!proxyConfig && !userTimezone && !geolocation) return { ok: true, options: null };
  return { ok: true, options: {
    // A proxy is slower to load through (Geo-Proxy docs: 30 s -> 60 s).
    ...(proxyConfig ? { proxy: proxyConfig, timeout: 60000 } : {}),
    ...(userTimezone ? { timezone: userTimezone } : {}),
    ...(geolocation ? { geolocation } : {}),
  } };
}
