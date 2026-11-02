/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Do Not Track and Global Privacy Control on a Playwright browser.
 *
 * Measured 2026-11-02 (Alexa: "make sure cbrowser has a dnt option", then "and
 * GPC"), with Playwright 1.64's chromium, firefox and webkit:
 *
 * - Unless asked, none of the three sends DNT or Sec-GPC on any request.
 * - Firefox does both itself when its preferences say so
 *   (privacy.donottrackheader.enabled, privacy.globalprivacycontrol.enabled):
 *   the headers on every request, those a service worker passes on or makes
 *   included, and navigator.doNotTrack "1" and navigator.globalPrivacyControl
 *   true. A context's extraHTTPHeaders did not do that: once a
 *   service worker controlled the page, firefox sent neither header while the
 *   page's JS still said both were on. A persistent profile keeps the
 *   preferences, so both are always set, false when off.
 * - Chromium and webkit have no such preferences. A context's extraHTTPHeaders
 *   reach the document, a redirect, an iframe, CSS, images, scripts and fetch,
 *   same-origin and cross-origin with no CORS preflight. The page's JS does not
 *   follow them (navigator.doNotTrack read null in chromium and undefined in
 *   webkit with DNT: 1 on the wire), so an init script sets both values on
 *   Navigator.prototype before any page script runs.
 *
 * Not covered: in chromium, the fetch of a service worker's script and
 * WebSocket handshakes; in webkit, requests a service worker makes itself.
 * Those carry neither header. Init scripts do not run in workers, so in both
 * engines a worker's navigator keeps the engine's own values.
 */

import type { BrowserContext, Page } from "playwright";
import type { PrivacySignals } from "./config.js";

export type { PrivacySignals };

type Engine = "chromium" | "firefox" | "webkit";

/** The headers for the signals that are on, or undefined when neither is. */
export function privacyHeaders(signals: PrivacySignals): Record<string, string> | undefined {
  const headers: Record<string, string> = {
    ...(signals.doNotTrack ? { DNT: "1" } : {}),
    ...(signals.globalPrivacyControl ? { "Sec-GPC": "1" } : {}),
  };
  return Object.keys(headers).length > 0 ? headers : undefined;
}

/**
 * The init script that makes navigator report the signals that are on, or
 * undefined when neither is. A signal that is off keeps the engine's value.
 * Each getter refuses a receiver that is not a Navigator and is named
 * "get <name>", as the engines' own getters are.
 */
export function privacyInitScript(signals: PrivacySignals): string | undefined {
  const values: Array<[string, string | boolean]> = [];
  if (signals.doNotTrack) values.push(["doNotTrack", "1"]);
  if (signals.globalPrivacyControl) values.push(["globalPrivacyControl", true]);
  if (values.length === 0) return undefined;
  return `(() => {
  for (const [name, value] of ${JSON.stringify(values)}) {
    try {
      const get = { get [name]() {
        if (!(this instanceof Navigator)) throw new TypeError("Illegal invocation");
        return value;
      } };
      const getter = Object.getOwnPropertyDescriptor(get, name).get;
      Object.defineProperty(Navigator.prototype, name, { get: getter, configurable: true, enumerable: true });
    } catch {}
  }
})();`;
}

/** What one engine needs to send the signals: launch options, context options and an init script. */
export interface PrivacySetup {
  /** Firefox only: both preferences, always, so a persistent profile cannot keep an old value. */
  firefoxUserPrefs?: Record<string, boolean>;
  /** Chromium and webkit: the headers, when a signal is on. */
  extraHTTPHeaders?: Record<string, string>;
  /** Chromium and webkit: navigator's values, when a signal is on. */
  initScript?: string;
}

export function privacySetup(engine: Engine, signals: PrivacySignals): PrivacySetup {
  if (engine === "firefox") {
    return {
      firefoxUserPrefs: {
        "privacy.donottrackheader.enabled": signals.doNotTrack === true,
        "privacy.globalprivacycontrol.enabled": signals.globalPrivacyControl === true,
      },
    };
  }
  const extraHTTPHeaders = privacyHeaders(signals);
  const initScript = privacyInitScript(signals);
  return { ...(extraHTTPHeaders ? { extraHTTPHeaders } : {}), ...(initScript ? { initScript } : {}) };
}

/** Adds the setup's init script to a context (every page, now and later) or one page. Nothing when it has none. */
export async function addPrivacyInitScript(target: BrowserContext | Page, setup: PrivacySetup): Promise<void> {
  if (setup.initScript) await target.addInitScript({ content: setup.initScript });
}
