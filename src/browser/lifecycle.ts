/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Lifecycle
 *
 * Starting the browser (launch, startBrowser, the saved page), closing it, reset, and getPage.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import { chromium, firefox, webkit, type Browser, type Page } from "playwright";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { isRestorablePageUrl } from "../utils.js";
import { join } from "path";
import { addPrivacyInitScript, privacySetup } from "../privacy-signals.js";
import { openBrowserRoute, webRtcGuard } from "../proxy-forwarder.js";
import { CBrowserError, CBrowserErrorCode } from "../types.js";
import { DEVICE_PRESETS, resolveDevice } from "../devices.js";
import { isHostedMode } from "../mcp-tools/hosted-inputs.js";
import { gatedLaunch, isSessionBrowser, onBrowserGone, onContextGone } from "../launch-gate.js";
import { BROWSER_LAUNCH_ARGS } from "./helpers.js";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Lifecycle
// =========================================================================

export async function launch(this: CBrowser): Promise<void> {
  if (this.launching) return this.launching;
  if (this.browser || this.context) return;
  const starting = this.startBrowser();
  const launching = starting.then(() => this.restoreSavedPage());
  this.starting = starting;
  this.launching = launching;
  const started = (): void => { if (this.starting === starting) this.starting = null; };
  const launched = (): void => { if (this.launching === launching) this.launching = null; };
  starting.then(started, started);
  launching.then(launched, launched);
  return launching;
}

export async function startBrowser(this: CBrowser): Promise<void> {
  // An unconfigured geo region, or a Do Not Track / GPC value that is not 1
  // or 0, from the environment or the config file: refused here, before
  // anything opens, rather than when the config is built, so commands that
  // open no browser are not stopped by it (config.ts `invalid`).
  const unusable = [this.config.invalid?.geoRegion, this.config.invalid?.privacySignals].filter(Boolean);
  if (unusable.length > 0) {
    throw new CBrowserError(CBrowserErrorCode.CONFIG_INVALID, unusable.join("; "), {
      howToFix: "Fix CBROWSER_GEO_REGION, CBROWSER_DNT or CBROWSER_GPC (or the config file), or unset it.",
    });
  }

  // An unknown device is an error, never a silent desktop render (reported
  // 2026-10-21: "iphone-16" captured 1280x800 and called it success, and so did
  // "Pixel 7" from the MCP tools' own descriptions). Names are normalised here,
  // so "iPhone 16" and "iphone-16" are the same preset.
  if (this.config.device) {
    const resolved = resolveDevice(this.config.device);
    if ("error" in resolved) {
      const closest = resolved.suggestions.length > 0 ? ` Closest presets: ${resolved.suggestions.join(", ")}.` : "";
      throw new CBrowserError(CBrowserErrorCode.CONFIG_INVALID, `${resolved.error}.${closest}`, {
        device: this.config.device,
        suggestions: resolved.suggestions,
        howToFix: "Use a preset name ('cbrowser device list' shows them all; case and spaces do not matter), or set a custom size with --viewport WIDTHxHEIGHT.",
      });
    }
    this.config.device = resolved.key;
  }

  // Was the page shape asked for on this run? Then the saved session's
  // viewport must not overwrite it after launch.
  this.explicitPageShape = !!this.config.device || !!this.config.viewportOverride;

  // Restore a location saved by `cbrowser geo set` unless one was given.
  if (this.config.persistent && !this.config.geolocation) {
    const saved = this.loadSessionState();
    if (saved?.geolocation) this.config.geolocation = saved.geolocation;
  }

  // Load saved session state to restore device setting if not explicitly set
  if (this.config.persistent && !this.config.device) {
    const savedSession = this.loadSessionState();
    if (savedSession?.device && DEVICE_PRESETS[savedSession.device]) {
      this.config.device = savedSession.device;
      if (this.config.verbose) {
        console.error(`🔄 Restoring device: ${savedSession.device}`);
      }
    }
  }

  // Select browser engine based on config
  const browserType = this.config.browser === "firefox"
    ? firefox
    : this.config.browser === "webkit"
      ? webkit
      : chromium;

  // Build context options
  const contextOptions: Parameters<Browser["newContext"]>[0] = {
    viewport: {
      width: this.config.viewportWidth,
      height: this.config.viewportHeight,
    },
    // Accept self-signed certs when using proxies (SOCKS proxies may alter cert chain).
    // Not for a residential region: its exit is a stranger's device and the
    // tunnel leaves TLS end to end, so a certificate error there is a real one.
    ...(this.config.proxy && !this.config.geoRegion ? { ignoreHTTPSErrors: true } : {}),
  };

  // Apply device emulation if configured
  if (this.config.device && DEVICE_PRESETS[this.config.device]) {
    const device = DEVICE_PRESETS[this.config.device];
    contextOptions.viewport = device.viewport;
    // The DevTools laptops have no user agent of their own and keep the
    // browser's. Playwright 1.58 already treats "" as unset; this does not
    // rely on that.
    if (device.userAgent) contextOptions.userAgent = device.userAgent;
    contextOptions.deviceScaleFactor = device.deviceScaleFactor;
    contextOptions.isMobile = device.isMobile;
    contextOptions.hasTouch = device.hasTouch;
  } else if (this.config.deviceDescriptor) {
    const device = this.config.deviceDescriptor;
    contextOptions.viewport = device.viewport;
    contextOptions.userAgent = device.userAgent;
    contextOptions.deviceScaleFactor = device.deviceScaleFactor;
    contextOptions.isMobile = device.isMobile;
    contextOptions.hasTouch = device.hasTouch;
  }

  // An explicit --viewport sets the size even with a device preset, which
  // keeps its pixel ratio, touch and user agent. Before 2026-10-21 the preset
  // silently won.
  if (this.config.viewportOverride) {
    contextOptions.viewport = { ...this.config.viewportOverride };
  }

  // Apply custom user agent if set (overrides device)
  if (this.config.userAgent) {
    contextOptions.userAgent = this.config.userAgent;
  }

  // Apply geolocation if configured
  if (this.config.geolocation) {
    contextOptions.geolocation = {
      latitude: this.config.geolocation.latitude,
      longitude: this.config.geolocation.longitude,
      accuracy: this.config.geolocation.accuracy,
    };
    contextOptions.permissions = ["geolocation"];
  }

  // Locale, always (this.locale: the configured one, else defaultLocale()).
  // Playwright's locale sets navigator.language, Intl and Accept-Language,
  // the same value on documents, frames, subresources and fetch in chromium,
  // firefox and webkit (measured 2026-10-31). It used to apply only when
  // configured, and nothing configured it, so Chromium sent no
  // Accept-Language at all. With a locale, it also added a header built by
  // hand ("fr-FR,fr;q=0.9,en;q=0.5"; "en-US,en;q=0.9,en;q=0.5" repeats "en"):
  // Firefox and WebKit sent that on every request, Chromium only on
  // subresources and fetch, its documents and frames keeping the bare locale.
  // One value everywhere costs that fallback list; RFC 4647 lookup still
  // reduces "fr-FR" to "fr".
  contextOptions.locale = this.locale;

  // Apply timezone if configured
  if (this.config.timezone) {
    contextOptions.timezoneId = this.config.timezone;
  }

  // Apply color scheme if configured
  if (this.config.colorScheme) {
    contextOptions.colorScheme = this.config.colorScheme;
  }

  // Do Not Track and Global Privacy Control (privacy-signals.ts): Firefox's
  // own preferences at launch, always both; in chromium and webkit, when on,
  // the headers here and navigator's values by init script once the context
  // exists.
  const privacy = privacySetup(this.config.browser, this.privacySignals);
  if (privacy.extraHTTPHeaders) {
    contextOptions.extraHTTPHeaders = privacy.extraHTTPHeaders;
  }
  // Through a proxy, WebRTC must not reach STUN servers directly: it would
  // give the page this machine's own address (measured 2026-11-02, chromium
  // and firefox both did). Firefox's pref is set either way, as a persistent
  // profile keeps it. On the hosted server the same holds without a
  // configured proxy, since the egress gate is every browser's proxy there
  // (webRtcGuard, proxy-forwarder.ts).
  const webRtc = webRtcGuard(this.config.browser, this.config.proxy, this.config.headless);
  const privacyLaunch = this.config.browser === "firefox"
    ? { firefoxUserPrefs: { ...privacy.firefoxUserPrefs, "media.peerconnection.ice.proxy_only": webRtc.firefoxProxyOnly } }
    : privacy.firefoxUserPrefs ? { firefoxUserPrefs: privacy.firefoxUserPrefs } : {};

  // Enable video recording if configured
  if (this.config.recordVideo) {
    const videoDir = this.config.videoDir || join(this.paths.dataDir, "videos");
    if (!existsSync(videoDir)) {
      mkdirSync(videoDir, { recursive: true });
    }
    contextOptions.recordVideo = {
      dir: videoDir,
      size: {
        width: contextOptions.viewport?.width || 1280,
        height: contextOptions.viewport?.height || 800,
      },
    };
  }

  // Use persistent context if enabled (preserves cookies/localStorage between sessions)
  // Use browser-specific launch args for optimal performance
  const launchArgs = [...BROWSER_LAUNCH_ARGS[this.config.browser]];

  // Size the OS window to the configured viewport. Without this, chromium
  // launches at its default (~1280×720) regardless of viewportWidth/Height,
  // leaving black margins inside Xvfb when viewing via VNC. Only meaningful
  // for chromium — Firefox/WebKit ignore --window-size.
  if (this.config.browser === "chromium") {
    const winW = this.config.windowWidth ?? this.config.viewportWidth;
    const winH = this.config.windowHeight ?? this.config.viewportHeight;
    launchArgs.push(`--window-size=${winW},${winH}`);
    launchArgs.push("--window-position=0,0");
    // Stability flags for long-running journeys on Xvfb/software rendering:
    //   --disable-background-timer-throttling: keep timers running while VNC peer disconnects
    //   --disable-features=PaintHolding: disable paint holding which can leave white frames during nav
    //   --disable-renderer-backgrounding: prevent renderer freezing when not focused
    //   --renderer-process-limit=4: cap renderer count, avoid memory blowup
    //   --js-flags=--max-old-space-size=512: cap V8 heap so a runaway page doesn't OOM the slot
    launchArgs.push(
      "--disable-renderer-backgrounding",
      "--disable-features=PaintHolding,Translate",
      "--renderer-process-limit=4",
      "--js-flags=--max-old-space-size=512",
    );
  }

  launchArgs.push(...webRtc.args);

  // Build proxy options for Playwright if configured. A proxy with a login is
  // reached through a local forwarder that holds the login, because
  // Playwright hands a launch proxy's login to every site in chromium and
  // webkit (proxy-forwarder.ts). On the hosted server every browser goes
  // through the egress gate instead, with or without a configured proxy,
  // and a gate that cannot start throws here, before any browser exists
  // (openBrowserRoute decides; egress-gate.ts).
  await this.closeProxyForwarder();
  const route = await openBrowserRoute(this.config.proxy);
  this.proxyForwarder = route.forwarder;
  this.gate = route.gated ? route.forwarder : null;
  const proxyOptions = route.proxy ? { proxy: route.proxy } : {};

  // Helper to perform the actual browser launch
  const performLaunch = async (): Promise<void> => {
    if (this.config.persistent) {
      const browserStateDir = join(this.paths.dataDir, "browser-state");
      if (!existsSync(browserStateDir)) {
        mkdirSync(browserStateDir, { recursive: true });
      }
      // Recover from a stale SingletonLock left by a hard-killed browser,
      // which would otherwise wedge the launch below (see method doc).
      this.clearStaleSingletonLock(browserStateDir);
      // A browser of a hosted session is counted there; any other launch on
      // the hosted server goes through the tool-browser gate (launch-gate.ts).
      const launchContext = () => browserType.launchPersistentContext(browserStateDir, {
        headless: this.config.headless,
        args: launchArgs,
        env: this.config.launchEnv ? { ...process.env, ...this.config.launchEnv } as Record<string, string> : undefined,
        ...contextOptions,
        ...proxyOptions,
        ...privacyLaunch,
      });
      this.context = isSessionBrowser(this) ? await launchContext() : await gatedLaunch(launchContext, onContextGone);
      await addPrivacyInitScript(this.context, privacy);
      if (webRtc.initScript) await this.context.addInitScript(webRtc.initScript);
      this.page = this.context.pages()[0] || await this.context.newPage();
      // Restore cookies snapshotted on the previous close — in particular
      // session cookies, which the persistent userDataDir drops between CLI
      // invocations. Additive: re-adding a persistent cookie by name is
      // idempotent, so this only ever recovers what would otherwise be lost.
      try {
        if (existsSync(this.persistedCookiesFile)) {
          const cookies = JSON.parse(readFileSync(this.persistedCookiesFile, "utf-8"));
          if (Array.isArray(cookies) && cookies.length > 0) {
            await this.context.addCookies(cookies);
          }
        }
      } catch (e) {
        if (this.config.verbose) {
          console.warn(`[browser] cookie restore failed: ${(e as Error).message}`);
        }
      }
      // Status, so stderr: stdout carries a command's result, and
      // `evaluate --raw` piped these lines in ahead of it.
      if (this.config.verbose) {
        console.error(`🔄 Using persistent browser context: ${browserStateDir}`);
        if (this.config.proxy) {
          console.error(`🌐 Using proxy: ${this.config.proxy.server}${this.config.geoRegion ? ` (${this.config.geoRegion})` : ""}`);
        }
      }
    } else {
      const launchPlain = () => browserType.launch({
        headless: this.config.headless,
        args: launchArgs,
        env: this.config.launchEnv ? { ...process.env, ...this.config.launchEnv } as Record<string, string> : undefined,
        ...proxyOptions,
        ...privacyLaunch,
      });
      this.browser = isSessionBrowser(this) ? await launchPlain() : await gatedLaunch(launchPlain, onBrowserGone);
      this.context = await this.browser.newContext(contextOptions);
      await addPrivacyInitScript(this.context, privacy);
      if (webRtc.initScript) await this.context.addInitScript(webRtc.initScript);
      this.page = await this.context.newPage();
      if (this.config.verbose && this.config.proxy) {
        console.error(`🌐 Using proxy: ${this.config.proxy.server}${this.config.geoRegion ? ` (${this.config.geoRegion})` : ""}`);
      }
    }

    // Console capture for every tab of this context: the ones open now, and
    // any opened later by the site (popups), followPopups, or manage_tabs,
    // which calls context.newPage() directly (v8 B27, 2026-10-10).
    const ctx = this.context;
    if (ctx) {
      ctx.on("page", (p) => this.attachConsoleCapture(p));
      for (const p of ctx.pages()) this.attachConsoleCapture(p);
    }

    // Live-journey mode: when a click opens a new tab, swap the journey's
    // active page to it and bring it to the front so VNC stream follows.
    // Closes the old page after a short grace period so its DOM is freed.
    if (this.config.followPopups && this.context) {
      this.context.on("page", async (newPage) => {
        try {
          await newPage.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
          const oldPage = this.page;
          this.page = newPage;
          try { await newPage.bringToFront(); } catch {}
          // Close the old tab after a moment so the persona doesn't leak tabs
          // across many popups. Skip if it's the same page or already closed.
          if (oldPage && oldPage !== newPage && !oldPage.isClosed()) {
            setTimeout(() => { oldPage.close().catch(() => {}); }, 1500);
          }
        } catch (e) {
          if (this.config.verbose) {
            console.warn(`[CBrowser] followPopups handler error: ${(e as Error).message}`);
          }
        }
      });
    }
  };

  // Attempt launch with automatic browser installation fallback. A launch
  // that fails for good takes its proxy forwarder with it; the retry after
  // an install still needs it.
  try {
    try {
      await performLaunch();
    } catch (error) {
      // Not on the hosted server. The classifier matches every launch
      // failure (Playwright prefixes them all with "browserType.launch"), so
      // a launch that failed for lack of tasks or memory, or timed out under
      // load, ran `npx playwright install` through execSync: the one Node
      // process serving every account stopped for as long as npx took (up
      // to 5 minutes), as root, and the caller was then told browsers are
      // not installed. The hosted server's browsers are installed at deploy
      // time, so the launch error itself is the answer. (audit
      // leaks-live-2, 2026-11-12) The CLI, the stdio server and library use
      // keep the automatic install.
      if (this.isBrowserNotInstalledError(error) && !isHostedMode()) {
        // Attempt automatic installation
        const installed = await this.installPlaywrightBrowsers();
        if (installed) {
          // Retry launch after installation
          try {
            await performLaunch();
          } catch (retryError) {
            // Installation succeeded but launch still failed
            throw new Error(
              `Browser launch failed after installation. ` +
              `This may indicate a system configuration issue.\n\n` +
              `Original error: ${retryError instanceof Error ? retryError.message : String(retryError)}`
            );
          }
        } else {
          // Installation failed - provide actionable instructions
          throw new Error(this.getBrowserInstallErrorMessage(this.config.browser));
        }
      } else {
        // Not a browser installation error - re-throw
        throw error;
      }
    }
  } catch (error) {
    if (!this.browser && !this.context) await this.closeProxyForwarder();
    throw error;
  }

  // Apply network mocks if configured
  if (this.config.networkMocks && this.config.networkMocks.length > 0) {
    await this.setupNetworkMocks(this.config.networkMocks);
  }

  // Set up network request/response tracking for HAR. Awaited so the CDP
  // logger is listening before the first navigation.
  await this.setupNetworkTracking();
}

export async function restoreSavedPage(this: CBrowser): Promise<void> {
  // Restore previous session URL if available (persistent mode only)
  if (this.config.persistent && !this.skipSessionRestore) {
    const savedSession = this.loadSessionState();
    if (savedSession && isRestorablePageUrl(savedSession.url)) {
      try {
        if (this.config.verbose) {
          console.error(`🔄 Restoring session: ${savedSession.url}`);
        }
        // Through the gate reading, as every load of a page of this browser
        // is: on the hosted server the gate's refusal is a failed restore,
        // not the saved page (review of 2026-11-12, wiring-1).
        const page = this.page!;
        await this.gotoThroughGate(page, savedSession.url, () => page.goto(savedSession.url, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        }));
        this.onSessionRestored?.(savedSession.url);
        // Wait for network idle and JS hydration
        await this.page!.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        await this.page!.waitForTimeout(1000);
        // Apply saved viewport if available
        // An explicit --device or --viewport wins over last run's size.
        if (savedSession.viewport && !this.explicitPageShape) {
          await this.page!.setViewportSize(savedSession.viewport);
        }
      } catch (e) {
        this.afterFailedRestore(this.page!, savedSession.url, e as Error);
      }
    }
  }
}

export async function close(this: CBrowser): Promise<void> {
  // A browser that is still starting is closed once it has started (startSettled).
  await this.startSettled();

  // Save current URL before closing so next invocation can restore it
  if (this.page && !this.page.isClosed()) {
    try {
      const currentUrl = this.page.url();
      const viewport = this.page.viewportSize();
      this.saveSessionState(currentUrl, viewport || undefined);
    } catch (e) {
      // Ignore errors during cleanup
    }
  }

  // Snapshot cookies (incl. in-memory session cookies) so the next CLI
  // invocation can restore them — the persistent userDataDir does not.
  if (this.config.persistent && this.context) {
    try {
      const cookies = await this.context.cookies();
      const stateDir = join(this.paths.dataDir, "browser-state");
      if (!existsSync(stateDir)) {
        mkdirSync(stateDir, { recursive: true });
      }
      writeFileSync(this.persistedCookiesFile, JSON.stringify(cookies, null, 2));
    } catch (e) {
      if (this.config.verbose) {
        console.warn(`[browser] cookie snapshot failed: ${(e as Error).message}`);
      }
    }
  }

  // Remove all listeners to prevent memory leaks
  if (this.page && !this.page.isClosed()) {
    this.page.removeAllListeners();
  }

  if (this.context) {
    await this.context.close().catch(() => {});
    this.context = null;
    this.page = null;
  }
  if (this.browser) {
    await this.browser.close().catch(() => {});
    this.browser = null;
  }
  await this.closeProxyForwarder();
}

export async function closeProxyForwarder(this: CBrowser): Promise<void> {
  const forwarder = this.proxyForwarder;
  this.proxyForwarder = null;
  this.gate = null;
  await forwarder?.close().catch(() => {});
}

export async function reset(this: CBrowser): Promise<void> {
  // Clear session state first (to prevent close() from saving)
  this.clearSessionState();
  await this.close();
  const browserStateDir = join(this.paths.dataDir, "browser-state");
  if (existsSync(browserStateDir)) {
    const { rmSync } = await import("fs");
    rmSync(browserStateDir, { recursive: true, force: true });
    mkdirSync(browserStateDir, { recursive: true });
  }
  if (this.config.verbose) {
    console.log("🔄 Browser state reset");
  }
}

export async function getPage(this: CBrowser): Promise<Page> {
  if (!this.page) {
    await this.launch();
  }

  // v14.2.1: Verify page is healthy before returning (fixes page desync)
  if (this.page) {
    try {
      // Quick health check - verify page is responsive
      if (this.page.isClosed()) {
        if (this.config.verbose) {
          console.error(`⚠️ Page was closed, recovering...`);
        }
        await this.recoverBrowser();
      } else {
        // Verify page context is valid with a lightweight check
        await Promise.race([
          this.page.evaluate(() => document.readyState),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Health check timeout")), 2000)),
        ]);
      }
    } catch (e) {
      // Page is unresponsive, attempt recovery
      if (this.config.verbose) {
        console.error(`⚠️ Page unresponsive, recovering: ${(e as Error).message}`);
      }
      try {
        await this.recoverBrowser();
      } catch {
        // Recovery failed, relaunch
        await this.close();
        await this.launch();
      }
    }
  }

  // Check if page is at about:blank and needs session restoration
  if (this.page && this.config.persistent && !this.skipSessionRestore) {
    const currentUrl = this.page.url();
    if (currentUrl === "about:blank" || currentUrl === "") {
      const savedSession = this.loadSessionState();
      if (savedSession && isRestorablePageUrl(savedSession.url)) {
        try {
          if (this.config.verbose) {
            console.error(`🔄 Restoring session: ${savedSession.url}`);
          }
          // Through the gate reading, as in restoreSavedPage.
          const page = this.page;
          await this.gotoThroughGate(page, savedSession.url, () => page.goto(savedSession.url, {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          }));
          this.onSessionRestored?.(savedSession.url);
          // Wait for network idle and JS hydration
          await this.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          await this.page.waitForTimeout(1000);
          if (savedSession.viewport && !this.explicitPageShape) {
            await this.page.setViewportSize(savedSession.viewport);
          }
        } catch (e) {
          this.afterFailedRestore(this.page, savedSession.url, e as Error);
        }
      }
    }
  }

  if (!this.page) {
    throw new Error("Browser page is not available — launch and recovery both failed");
  }
  return this.page;
}
