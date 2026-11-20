/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */


/**
 * CBrowser - Main Browser Class
 *
 * AI-powered browser automation with constitutional safety.
 */

import type { Browser, Page, BrowserContext, Locator, ElementHandle, Response } from "playwright";
import { isRestorablePageUrl } from "./utils.js";
import { join } from "path";
import {
  type CBrowserConfig,
  mergeConfig,
  defaultLocale,
  getPaths,
  ensureDirectories,
  type CBrowserPaths,
  type ColorScheme,
  type PrivacySignals,
} from "./config.js";
import type { ProxyForwarder } from "./proxy-forwarder.js";
import type {
  SavedSession,
  NavigateOptions,
  NavigationResult,
  ClickResult,
  ExtractResult,
  JourneyResult,
  CapturedConsoleMessage,
  ActionZone,
  CleanupOptions,
  CleanupResult,
  JourneyOptions,
  Persona,
  NetworkMock,
  NetworkRequest,
  NetworkResponse,
  HAREntry,
  PerformanceMetrics,
  PerformanceAuditResult,
  SmartRetryResult,
  RetryAttempt,
  AssertionResult,
  SelectorAlternative,
  SelectorCacheEntry,
  SelectorCacheStats,
  PageAnalysis,
  GeneratedTest,
  TestGenerationResult,
  DismissOverlayOptions,
  DismissOverlayResult,
  SessionMetadata,
  LoadSessionResult,
  BrowserHealthResult,
  BrowserRecoveryResult,
} from "./types.js";
import { LOCATION_PRESETS } from "./types.js";
import { DEVICE_PRESETS } from "./devices.js";
import { SessionManager } from "./browser/session-manager.js";
import { SelectorCacheManager } from "./browser/selector-cache.js";
import { OverlayHandler } from "./browser/overlay-handler.js";
import { gotoThroughGate } from "./browser/helpers.js";
import type { SessionState, ScreenshotOptions, ScreenshotInfo, FittedJpeg, ClipRect } from "./browser/helpers.js";
import * as sessionState from "./browser/session-state.js";
import * as lifecycle from "./browser/lifecycle.js";
import * as crashRecovery from "./browser/crash-recovery.js";
import * as network from "./browser/network.js";
import * as consoleCapture from "./browser/console-capture.js";
import * as performanceMetrics from "./browser/performance-metrics.js";
import * as contextSettings from "./browser/context-settings.js";
import * as navigation from "./browser/navigation.js";
import * as interaction from "./browser/interaction.js";
import * as overlays from "./browser/overlays.js";
import * as customControls from "./browser/custom-controls.js";
import * as selfHealing from "./browser/self-healing.js";
import * as testGeneration from "./browser/test-generation.js";
import * as debugHelpers from "./browser/debug-helpers.js";
import * as assertions from "./browser/assertions.js";
import * as elementFinding from "./browser/element-finding.js";
import * as extraction from "./browser/extraction.js";
import * as screenshots from "./browser/screenshots.js";
import * as journey from "./browser/journey.js";
import * as constitutionalSafety from "./browser/constitutional-safety.js";
import * as storageCleanup from "./browser/storage-cleanup.js";
import * as visualRegression from "./browser/visual-regression.js";
import * as accessibilityAudit from "./browser/accessibility-audit.js";
import * as testRecording from "./browser/test-recording.js";

// What this file declared before it was split, and still exports from here.
export {
  isBrowserNotInstalledError,
  installPlaywrightBrowsers,
  getBrowserInstallErrorMessage,
  launchBrowserWithFallback,
  namedClickables,
  summarizePlaywrightError,
  gotoThroughGate,
  copyString,
  decodeUtf8Prefix,
  capUtf8,
  capHeaders,
} from "./browser/helpers.js";
export type { ScreenshotOptions, ScreenshotInfo, ClipRect } from "./browser/helpers.js";


export class CBrowser {
  /** @internal */
  config: CBrowserConfig;
  /** @internal */
  paths: CBrowserPaths;
  /** @internal */
  browser: Browser | null = null;
  /** @internal */
  context: BrowserContext | null = null;
  /**
   * The local proxy the browser uses: the forwarder in place of a proxy with a login, or on the hosted server the egress gate (proxy-forwarder.ts).
   * @internal
   */
  proxyForwarder: ProxyForwarder | null = null;
  /**
   * The same object when it is the egress gate: what navigate asks why a page was not carried.
   * @internal
   */
  gate: ProxyForwarder | null = null;
  /**
   * The launch in flight, restore of the saved page included: what a second launch() call is given.
   * @internal
   */
  launching: Promise<void> | null = null;
  /**
   * The part of that launch that starts the browser: what close() waits for.
   * @internal
   */
  starting: Promise<void> | null = null;
  /**
   * Contexts whose new pages follow setColorScheme (one listener each).
   * @internal
   */
  colorSchemeFollowers = new WeakSet<BrowserContext>();
  /** @internal */
  page: Page | null = null;
  /** @internal */
  currentPersona: Persona | null = null;
  /** @internal */
  networkRequests: NetworkRequest[] = [];
  /** @internal */
  networkResponses: Map<string, NetworkResponse> = new Map();
  /**
   * In-flight requests awaiting a response, so the response handler can attach
   * status and duration to the originating record. Keyed by url+method, capped
   * so a page that fires requests which never resolve cannot grow it without
   * bound. (2026-07-28)
   * @internal
   */
  pendingRequests: Map<string, { req: NetworkRequest; startedAt: number }> = new Map();
  /** @internal */
  droppedNetworkRequests = 0;
  /** @internal */
  harEntries: HAREntry[] = [];
  /** @internal */
  isRecordingHar = false;
  /**
   * Console capture, one ring buffer per tab (v8 B27, 2026-10-10). Filled by a
   * single page.on("console") + page.on("pageerror") pair attached when the tab
   * is created, so it holds what was logged during page load and what the
   * browser itself reports (a 404 is "Failed to load resource", not a console.*
   * call). Measured on 19.3.6: get_console_messages returned [] for a page that
   * had logged and 404'd, because it patched console.* on its first call; and
   * navigate added a listener per call (6 -> 9 over three navigates). Keyed by
   * Page so a tab switched to by manage_tabs reads its own buffer.
   * @internal
   */
  consoleBuffers: WeakMap<Page, { entries: Array<{ seq: number; msg: CapturedConsoleMessage }>; dropped: number }> = new WeakMap();
  /**
   * Increases on every captured message, across tabs; navigate slices by it.
   * @internal
   */
  consoleSeq = 0;
  /** @internal */
  skipSessionRestore: boolean;

  /**
   * Called with the saved URL each time this browser reloads it into its
   * page. A new browser has none of what earlier commands did to that page,
   * and the CLI says so through this (src/page-continuity.ts).
   */
  onSessionRestored: ((url: string) => void) | null = null;

  /**
   * Called when the saved URL does not load, which leaves the page blank (a
   * browser error page). Throwing from it stops the command: the CLI does
   * that for a command that acts on the page, rather than run it on nothing.
   */
  onSessionRestoreFailed: ((url: string, error: Error) => void) | null = null;

  /**
   * The saved URL this browser will reload when it opens its page, or null
   * when it will open on about:blank: not persistent, restore skipped, or no
   * saved page from the last hour. Reads the same state the launch does.
   */
  pendingSessionRestore(): string | null {
    if (!this.config.persistent || this.skipSessionRestore) return null;
    const url = this.loadSessionState()?.url;
    return isRestorablePageUrl(url) ? url : null;
  }

  /**
   * After loading the saved URL threw. A timeout once the page has committed
   * leaves the real page, slow but there, so it counts as reloaded, as it did
   * before the failure hook existed. A load that never got there leaves
   * about:blank or the browser's error page, which onSessionRestoreFailed may
   * refuse to act on. Telling the two apart is the point: a page whose
   * DOMContentLoaded came after 15 s was refused as blank while on screen.
   * @internal
   */
  afterFailedRestore(page: Page, url: string, error: Error): void {
    if (isRestorablePageUrl(page.url())) {
      if (this.config.verbose) {
        console.error(`⚠️ The saved page is still loading; going on with it as it stands: ${error.message.split("\n")[0]}`);
      }
      this.onSessionRestored?.(url);
      return;
    }
    if (this.config.verbose) {
      console.error(`⚠️ Could not restore session, so the page is blank: ${error.message}`);
    }
    this.onSessionRestoreFailed?.(url, error);
  }

  // Modular components (extracted for maintainability)
  private sessionManager: SessionManager;
  private selectorCacheManager: SelectorCacheManager;
  /** @internal */
  overlayHandler: OverlayHandler;

  // Track last filled input for Enter key fallback when submit buttons are hidden
  /** @internal */
  lastFilledInputSelector: string | null = null;

  /**
   * Set by every compressed screenshot; cleared by every screenshot().
   * @internal
   */
  _lastScreenshotInfo: ScreenshotInfo | undefined;

  /**
   * Size, quality and source size of the last compressed screenshot, or
   * undefined when the last screenshot was not compressed or could not be
   * measured. Compare `path` with the file you hold before trusting it.
   */
  get lastScreenshotInfo(): ScreenshotInfo | undefined {
    return this._lastScreenshotInfo;
  }

  constructor(userConfig: Partial<CBrowserConfig> = {}) {
    this.config = mergeConfig(userConfig);
    this.skipSessionRestore = userConfig.skipSessionRestore ?? false;
    this.paths = ensureDirectories(getPaths(this.config.dataDir));

    // Initialize modular components
    this.sessionManager = new SessionManager({
      sessionsDir: this.paths.sessionsDir,
      viewportWidth: this.config.viewportWidth,
      viewportHeight: this.config.viewportHeight,
      verbose: this.config.verbose,
    });

    this.selectorCacheManager = new SelectorCacheManager({
      dataDir: this.paths.dataDir,
      verbose: this.config.verbose,
    });

    this.overlayHandler = new OverlayHandler({
      verbose: this.config.verbose,
    });
  }

  // =========================================================================
  // Session State Persistence
  // =========================================================================

  /**
   * True when this run was given --device or --viewport (see launch).
   * @internal
   */
  explicitPageShape = false;

  /** @internal */
  get sessionStateFile(): string {
    return join(this.paths.dataDir, "browser-state", "last-session.json");
  }

  /**
   * Where cookies are snapshotted between CLI invocations. The persistent
   * userDataDir preserves *persistent* cookies but NOT session cookies (no
   * expiry) — Chromium keeps those only in memory, so they die when the browser
   * closes between invocations. We snapshot all cookies on close and re-add them
   * on launch so `cookie set` + a later `navigate` actually carries the cookie.
   * @internal
   */
  get persistedCookiesFile(): string {
    return join(this.paths.dataDir, "browser-state", "persisted-cookies.json");
  }

  /**
   * Remove a STALE Chromium `SingletonLock` from a persistent-profile dir before
   * launch. A SIGKILL'd browser leaves the lock symlink pointing at a dead pid,
   * which otherwise wedges `launchPersistentContext` indefinitely (the manual
   * fix was `rm browser-state/SingletonLock`). We remove it ONLY when
   * `isStaleSingletonLock` proves the target pid is not alive, so a lock held by
   * a live browser is never touched.
   * @internal
   */
  clearStaleSingletonLock(browserStateDir: string): void {
    sessionState.clearStaleSingletonLock.call(this, browserStateDir);
  }

  /** @internal */
  saveSessionState(url: string, viewport?: { width: number; height: number }, device?: string): void {
    sessionState.saveSessionState.call(this, url, viewport, device);
  }

  /**
   * Save device setting to session state for persistence.
   */
  saveDeviceSetting(device: string): void {
    sessionState.saveDeviceSetting.call(this, device);
  }

  /**
   * Save a geolocation to session state, so later commands launch with it
   * (`cbrowser geo set`). Returns false when the state could not be written.
   * Before 2026-10-21, geo set changed a browser that was never launched and
   * printed success, so nothing changed.
   */
  saveGeolocationSetting(geo: { latitude: number; longitude: number; accuracy?: number }): boolean {
    return sessionState.saveGeolocationSetting.call(this, geo);
  }

  /** @internal */
  loadSessionState(): SessionState | null {
    return sessionState.loadSessionState.call(this);
  }

  /** @internal */
  clearSessionState(): void {
    sessionState.clearSessionState.call(this);
  }

  // =========================================================================
  // Browser Installation
  // =========================================================================

  /**
   * Check if an error indicates missing Playwright browsers.
   * @internal
   */
  isBrowserNotInstalledError(error: unknown): boolean {
    return sessionState.isBrowserNotInstalledError.call(this, error);
  }

  /**
   * Attempt to install Playwright browsers automatically.
   * Returns true if installation succeeded, false otherwise.
   * @internal
   */
  installPlaywrightBrowsers(): Promise<boolean> {
    return sessionState.installPlaywrightBrowsers.call(this);
  }

  /**
   * Get actionable error message for browser installation failure.
   * @internal
   */
  getBrowserInstallErrorMessage(browserName: string): string {
    return sessionState.getBrowserInstallErrorMessage.call(this, browserName);
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /**
   * Launch the browser.
   *
   * One launch at a time. A call that arrives while a launch is in flight
   * gets that launch's promise, and so its outcome. Until 2026-11-12 the only
   * guard was "is there a browser yet", which is false for the whole start:
   * two getPage() calls in one tick started two browsers and kept one, and a
   * close() during the start found nothing to close while the start went on
   * (review, launch-wiring-3; the hosted server hands one CBrowser to every
   * concurrent call of an account).
   */
  launch(): Promise<void> {
    return lifecycle.launch.call(this);
  }

  /**
   * A browser start in flight, awaited: close() and forceClose() tear down
   * only what has finished starting. Closing during the start closed the
   * egress gate and left the browser, which then came up behind a proxy that
   * was gone: every later navigation of that hosted session failed until the
   * browser was reset (measured in the review of 2026-11-12, 3 to 15 ms after
   * the launch began). Not hosted the same race left a browser running with
   * nothing holding it. A start that fails has nothing to close. The restore
   * of the saved page is not waited for: closing under it ends it, as before.
   * @internal
   */
  async startSettled(): Promise<void> {
    while (this.starting) await this.starting.catch(() => { /* a failed start left nothing behind */ });
  }

  /**
   * The start of launch(): everything up to a browser, a context and a page.
   * @internal
   */
  startBrowser(): Promise<void> {
    return lifecycle.startBrowser.call(this);
  }

  /**
   * The end of launch(): the page of the last session, loaded again into the browser that has just started.
   * @internal
   */
  restoreSavedPage(): Promise<void> {
    return lifecycle.restoreSavedPage.call(this);
  }

  /**
   * Close the browser.
   */
  close(): Promise<void> {
    return lifecycle.close.call(this);
  }

  /** @internal */
  closeProxyForwarder(): Promise<void> {
    return lifecycle.closeProxyForwarder.call(this);
  }

  /**
   * Hosted server: run one main-frame navigation of this browser's page and
   * read a failure as the egress gate saw it (gotoThroughGate). For code that
   * calls page.goto on a page of this browser itself, as the agent-ready
   * audit does. Not hosted it is `go()`.
   */
  gotoThroughGate<T extends Response | null>(page: Page, url: string, go: () => Promise<T>): Promise<T> {
    return gotoThroughGate(this.gate, page, url, go);
  }

  /**
   * Reset persistent browser state (clear cookies, localStorage, etc.)
   */
  reset(): Promise<void> {
    return lifecycle.reset.call(this);
  }

  /**
   * Get the current page, launching if needed.
   * If the page exists but is at about:blank, restores the previous session.
   * v14.2.1: Added health check to prevent page desync issues.
   */
  getPage(): Promise<Page> {
    return lifecycle.getPage.call(this);
  }

  /**
   * Check if the browser is healthy and responsive.
   * This performs a lightweight operation to verify the browser process is alive.
   */
  isBrowserHealthy(): Promise<BrowserHealthResult> {
    return crashRecovery.isBrowserHealthy.call(this);
  }

  /**
   * Attempt to recover from a browser crash by restarting the browser.
   * Uses exponential backoff for retry attempts.
   */
  recoverBrowser(options?: {
    maxAttempts?: number;
    restoreUrl?: string;
  }): Promise<BrowserRecoveryResult> {
    return crashRecovery.recoverBrowser.call(this, options);
  }

  /**
   * Force close browser processes without normal cleanup.
   * Used when browser is unresponsive and normal close() would hang.
   * @internal
   */
  forceClose(): Promise<void> {
    return crashRecovery.forceClose.call(this);
  }

  /**
   * Execute an operation with automatic crash recovery.
   * If the browser crashes during the operation, it will be restarted and the operation retried.
   *
   * @param operation - The async operation to execute
   * @param operationName - Name of the operation for error messages
   * @returns Result of the operation or throws if recovery fails
   */
  withCrashRecovery<T>(
    operation: () => Promise<T>,
    operationName: string = "operation"
  ): Promise<T> {
    return (crashRecovery.withCrashRecovery<T>).call(this, operation, operationName);
  }

  // =========================================================================
  // Network Mocking
  // =========================================================================

  /**
   * Set up network mocks for API interception.
   * @internal
   */
  setupNetworkMocks(mocks: NetworkMock[]): Promise<void> {
    return network.setupNetworkMocks.call(this, mocks);
  }

  /**
   * Add a network mock at runtime.
   */
  async addNetworkMock(mock: NetworkMock): Promise<void> {
    await this.getPage(); // Ensure page exists
    await this.setupNetworkMocks([mock]);
  }

  /**
   * Clear all network mocks.
   */
  async clearNetworkMocks(): Promise<void> {
    const page = await this.getPage();
    await page.unrouteAll();
  }

  // =========================================================================
  // Network Tracking & HAR Export
  // =========================================================================

  /**
   * Set up network request/response tracking for HAR.
   *
   * Chromium reads the log from a CDP session of its own, not from
   * page.on("request"). Measured 2026-11-15 on Playwright 1.64.1: once
   * anything listens for "request", Playwright keeps every Request object,
   * body included, for the life of the page (a navigation does not free them):
   * a page posting 512 KB every 20 ms grew the heap 66 -> 789 MB in 30 s with
   * an empty listener, and stayed at 66 MB with no listener or with a CDP
   * Network listener. Capping this log alone left the server growing at the
   * page's full send rate (705 -> 1,860 MB from 15 to 60 s), so the audit's
   * leaks-static-2 was not bounded until the listener itself went.
   * Firefox and WebKit have no CDP and keep the Playwright listeners.
   * @internal
   */
  setupNetworkTracking(): Promise<void> {
    return network.setupNetworkTracking.call(this);
  }

  /**
   * Build a log record from one request, keep it, and drop the oldest past the
   * cap. Shared by both sources so the two keep the same shape and limits.
   * `body` is the body as far as the source has it; `bodyOmitted` means the
   * source had a body it did not hand over (CDP above maxPostDataSize).
   * @internal
   */
  logRequest(raw: {
    url: string; method: string; headers: Record<string, string>; resourceType: string;
    body?: Buffer; bodyOmitted?: boolean;
  }): NetworkRequest {
    return network.logRequest.call(this, raw);
  }

  /**
   * The Chromium network log, from a CDP session. Bodies longer than
   * MAX_POST_DATA_BYTES are not sent over CDP at all (maxPostDataSize), so
   * such a record carries postDataTruncated with no prefix. Events are plain
   * data and nothing Playwright keeps, so the log's own caps bound it.
   * @internal
   */
  setupCdpNetworkTracking(page: Page): Promise<void> {
    return network.setupCdpNetworkTracking.call(this, page);
  }

  /**
   * The page-event network log, for Firefox and WebKit (no CDP).
   * @internal
   */
  setupPlaywrightNetworkTracking(page: Page): void {
    network.setupPlaywrightNetworkTracking.call(this, page);
  }

  /**
   * Start recording HAR.
   */
  startHarRecording(): void {
    this.isRecordingHar = true;
    this.harEntries = [];
  }

  /**
   * Stop recording and export HAR.
   */
  exportHar(outputPath?: string): Promise<string> {
    return network.exportHar.call(this, outputPath);
  }

  /**
   * Get the captured network requests: the latest 1,000 since the session
   * started or since clearNetworkHistory(). networkRequestsDropped() counts
   * the older ones the log let go.
   */
  getNetworkRequests(): NetworkRequest[] {
    return [...this.networkRequests];
  }

  /** How many requests the log dropped to stay at its cap. */
  networkRequestsDropped(): number {
    return this.droppedNetworkRequests;
  }

  /**
   * Clear network request history.
   */
  clearNetworkHistory(): void {
    network.clearNetworkHistory.call(this);
  }

  // =========================================================================
  // Console Capture (v8 B27)
  // =========================================================================

  /**
   * Give a tab its one console + pageerror listener pair. Idempotent.
   *
   * The buffer is NOT reset on navigation (decided 2026-10-10, v8 B27). A flow
   * that submits a form and lands on a confirmation page would otherwise lose
   * the form page's errors, which are usually what the caller is looking for,
   * and Playwright's public API cannot tell a new document from a pushState
   * route change, so a reset would also wipe an SPA's load errors on its first
   * client-side navigation. Each entry carries pageUrl instead; clear starts
   * fresh.
   * @internal
   */
  attachConsoleCapture(page: Page): void {
    consoleCapture.attachConsoleCapture.call(this, page);
  }

  /**
   * The current tab's console messages, oldest first: the latest 500 since the
   * tab opened or since clearConsoleMessages(), across navigations, including
   * uncaught exceptions (source "pageerror") and browser-generated messages
   * such as a resource 404. `dropped` counts older ones the ring evicted.
   */
  getConsoleMessages(): { messages: CapturedConsoleMessage[]; dropped: number } {
    const buffer = this.page ? this.consoleBuffers.get(this.page) : undefined;
    if (!buffer) return { messages: [], dropped: 0 };
    return { messages: buffer.entries.map((e) => ({ ...e.msg })), dropped: buffer.dropped };
  }

  /** Empty the current tab's console buffer and its dropped count. */
  clearConsoleMessages(): void {
    consoleCapture.clearConsoleMessages.call(this);
  }

  /**
   * What a tab logged after sequence number `afterSeq` (navigate's own slice).
   * @internal
   */
  consoleMessagesSince(page: Page, afterSeq: number): CapturedConsoleMessage[] {
    return (this.consoleBuffers.get(page)?.entries ?? []).filter((e) => e.seq > afterSeq).map((e) => e.msg);
  }

  // =========================================================================
  // Performance Metrics
  // =========================================================================

  /**
   * Collect Core Web Vitals and performance metrics.
   */
  getPerformanceMetrics(): Promise<PerformanceMetrics> {
    return performanceMetrics.getPerformanceMetrics.call(this);
  }

  /**
   * Run a performance audit against a budget.
   */
  auditPerformance(url?: string): Promise<PerformanceAuditResult> {
    return performanceMetrics.auditPerformance.call(this, url);
  }

  // =========================================================================
  // Cookie Management
  // =========================================================================

  /**
   * Get all cookies for the current context.
   */
  getCookies(urls?: string[]): Promise<SavedSession["cookies"]> {
    return contextSettings.getCookies.call(this, urls);
  }

  /**
   * Set cookies.
   */
  setCookies(cookies: SavedSession["cookies"]): Promise<void> {
    return contextSettings.setCookies.call(this, cookies);
  }

  /**
   * Clear all cookies.
   */
  clearCookies(): Promise<void> {
    return contextSettings.clearCookies.call(this);
  }

  /**
   * Delete specific cookies by name.
   */
  deleteCookie(name: string, domain?: string): Promise<void> {
    return contextSettings.deleteCookie.call(this, name, domain);
  }

  // =========================================================================
  // Video Recording
  // =========================================================================

  /**
   * Get the path to the video file (after browser closes).
   */
  getVideoPath(): Promise<string | null> {
    return contextSettings.getVideoPath.call(this);
  }

  /**
   * Save the video with a custom filename.
   */
  saveVideo(outputPath: string): Promise<string | null> {
    return contextSettings.saveVideo.call(this, outputPath);
  }

  // =========================================================================
  // Device Emulation
  // =========================================================================

  /**
   * Set device emulation (requires browser restart).
   */
  setDevice(deviceName: string): boolean {
    return contextSettings.setDevice.call(this, deviceName);
  }

  /**
   * Emulate a device preset and/or set the page size, relaunching if the
   * browser is already up (context options are fixed at launch). An unknown
   * device throws, as at launch. Returns the device key applied.
   */
  emulate(opts: { device?: string; viewport?: { width: number; height: number } }): Promise<{ device: string | null }> {
    return contextSettings.emulate.call(this, opts);
  }

  /**
   * Set the page's prefers-color-scheme: "light", "dark" or "no-preference".
   * Unlike a device this needs no relaunch: Playwright emulates the media
   * feature on a live page, so an open session keeps its page and login. Pages
   * opened later in the same browser follow it, and a later launch reads it
   * from config. An unknown value throws, as an unknown device does.
   */
  setColorScheme(scheme: ColorScheme): Promise<void> {
    return contextSettings.setColorScheme.call(this, scheme);
  }

  /**
   * Open a tab in this browser's context, with the color scheme already
   * applied when setColorScheme changed it, so the tab's first load renders
   * in it. A bare context.newPage() followed by goto raced the follower
   * above: on GitHub's ubuntu-26.04 runner the page loaded light after
   * setColorScheme("dark"), twice in a row (Tests run 42462587260, 2026-11-08).
   */
  newTab(): Promise<Page> {
    return contextSettings.newTab.call(this);
  }

  /** The color scheme pages render with, or null for the browser default. */
  get colorScheme(): ColorScheme | null {
    return this.config.colorScheme ?? null;
  }

  /**
   * The locale this browser's contexts get: the configured one, else
   * defaultLocale(). An empty string counts as unset (`--locale=`).
   */
  get locale(): string {
    return this.config.locale || defaultLocale();
  }

  /** Whether this browser's contexts send Do Not Track and Global Privacy Control. */
  get privacySignals(): Required<PrivacySignals> {
    return {
      doNotTrack: this.config.doNotTrack === true,
      globalPrivacyControl: this.config.globalPrivacyControl === true,
    };
  }

  /**
   * List available device presets.
   */
  static listDevices(): string[] {
    return Object.keys(DEVICE_PRESETS);
  }

  // =========================================================================
  // Geolocation
  // =========================================================================

  /**
   * Set geolocation (requires browser restart or use setGeolocationRuntime).
   */
  setGeolocation(location: string | { latitude: number; longitude: number; accuracy?: number }): boolean {
    return contextSettings.setGeolocation.call(this, location);
  }

  /**
   * Set geolocation at runtime without restarting.
   */
  setGeolocationRuntime(
    location: string | { latitude: number; longitude: number; accuracy?: number }
  ): Promise<boolean> {
    return contextSettings.setGeolocationRuntime.call(this, location);
  }

  /**
   * List available location presets.
   */
  static listLocations(): string[] {
    return Object.keys(LOCATION_PRESETS);
  }

  /**
   * Apply persona location settings for cognitive journey simulation.
   *
   * This method:
   * - Sets geolocation at runtime (immediate effect)
   * - Stores timezone/locale in config (applies on next context creation)
   *
   * @param location - PersonaLocation settings to apply
   * @returns Object with applied settings and notes
   */
  applyPersonaLocation(location: {
    timezone?: string;
    locale?: string;
    geolocation?: { latitude: number; longitude: number; accuracy?: number };
  }): Promise<{
    geolocationApplied: boolean;
    timezoneStored: boolean;
    localeStored: boolean;
    effectiveTimezone: string | undefined;
    effectiveLocale: string | undefined;
    note?: string;
  }> {
    return contextSettings.applyPersonaLocation.call(this, location);
  }

  // =========================================================================
  // Navigation
  // =========================================================================

  /**
   * Navigate to a URL.
   *
   * v10.10.0: Uses progressive loading strategy to avoid hangs on SPAs:
   * 1. Try networkidle with short timeout (10s)
   * 2. Fall back to domcontentloaded + stability check
   * 3. Always succeeds if page loads at all
   *
   * v11.3.0: Added configurable wait strategy via options parameter
   * @param url - URL to navigate to
   * @param options - Navigation options (waitStrategy, waitTimeout, waitForStability)
   */
  navigate(url: string, options: NavigateOptions = {}): Promise<NavigationResult> {
    return navigation.navigate.call(this, url, options);
  }

  /**
   * Wait for page to stabilize (minimal DOM mutations).
   * Used as fallback when networkidle times out on SPAs.
   * @internal
   * @internal
   */
  waitForStability(page: Page, maxWaitMs: number = 2000): Promise<void> {
    return navigation.waitForStability.call(this, page, maxWaitMs);
  }

  /**
   * Detect if the current page is a Cloudflare challenge.
   * Checks for various Cloudflare protection signatures.
   * @returns Object with detected challenge type and evidence
   */
  detectCloudflareChallenge(): Promise<{
    detected: boolean;
    type: "turnstile" | "managed" | "interstitial" | "js-challenge" | null;
    evidence: string[];
  }> {
    return navigation.detectCloudflareChallenge.call(this);
  }

  /**
   * Wait for a Cloudflare challenge to resolve.
   * Monitors the page for redirect after challenge completion.
   *
   * @param timeout - Maximum time to wait in ms (default: 30000)
   * @param checkInterval - How often to check in ms (default: 1000)
   * @returns Success status and final URL
   */
  waitForCloudflareResolution(timeout: number = 30000, checkInterval: number = 1000): Promise<{
    resolved: boolean;
    originalUrl: string;
    finalUrl: string;
    waitTime: number;
    message: string;
  }> {
    return navigation.waitForCloudflareResolution.call(this, timeout, checkInterval);
  }

  // =========================================================================
  // Interaction
  // =========================================================================

  /**
   * Click an element using AI-powered selector.
   */
  click(selector: string, options: { force?: boolean; verbose?: boolean; debugDir?: string } = {}): Promise<ClickResult> {
    return interaction.click.call(this, selector, options);
  }

  /**
   * Hover over an element using AI-powered selector.
   */
  hover(selector: string): Promise<ClickResult> {
    return interaction.hover.call(this, selector);
  }

  /**
   * Check if a click on an element would be intercepted by a sticky/fixed element.
   * Returns the intercepting element locator if found, null otherwise.
   */
  checkForInterception(element: Locator): Promise<{ intercepted: boolean; interceptorSelector: string | null; interceptorInfo?: string }> {
    return overlays.checkForInterception.call(this, element);
  }

  /**
   * Find all sticky/fixed positioned elements that could intercept clicks.
   */
  findStickyElements(): Promise<Array<{ selector: string; position: string; rect: DOMRect }>> {
    return overlays.findStickyElements.call(this);
  }

  /**
   * Handle a sticky element intercepting a click by trying multiple strategies.
   */
  handleStickyInterception(
    element: Locator,
    interceptorSelector: string,
    options: { verbose?: boolean; position?: { x: number; y: number } } = {}
  ): Promise<{ success: boolean; strategy?: string; error?: string }> {
    return overlays.handleStickyInterception.call(this, element, interceptorSelector, options);
  }

  // =========================================================================
  // Custom Dropdown Handling (v8.8.0)
  // Handles hidden <select> elements with custom dropdown UIs (Alpine.js, React Select, etc.)
  // =========================================================================

  /**
   * Check if an element is visually hidden (but exists in DOM).
   * Common patterns: display:none, visibility:hidden, opacity:0, zero dimensions,
   * or positioned off-screen.
   */
  isElementHidden(element: Locator): Promise<boolean> {
    return customControls.isElementHidden.call(this, element);
  }

  /**
   * Find the visible custom dropdown trigger associated with a hidden select.
   * Uses multiple heuristics to locate the clickable UI element.
   */
  findCustomDropdownTrigger(hiddenSelect: Locator): Promise<Locator | null> {
    return customControls.findCustomDropdownTrigger.call(this, hiddenSelect);
  }

  /**
   * Find and select an option in a custom dropdown.
   * Opens the dropdown, waits for options, and clicks the target option.
   */
  selectCustomDropdownOption(
    trigger: Locator,
    optionValue: string,
    options: { timeout?: number; verbose?: boolean } = {}
  ): Promise<{ success: boolean; strategy?: string; error?: string }> {
    return customControls.selectCustomDropdownOption.call(this, trigger, optionValue, options);
  }

  /**
   * Handle filling a custom dropdown (hidden select with custom UI).
   * Automatically detects and interacts with the visible dropdown component.
   */
  handleCustomDropdown(
    hiddenSelect: Locator,
    value: string,
    options: { verbose?: boolean } = {}
  ): Promise<{ success: boolean; strategy?: string; error?: string }> {
    return customControls.handleCustomDropdown.call(this, hiddenSelect, value, options);
  }

  /**
   * Find the best click candidate from multiple matches.
   * Prioritizes: exact text match > non-sticky elements > shorter text (closer match)
   * @internal
   */
  findBestClickCandidate(locator: Locator, searchText: string): Promise<Locator | null> {
    return interaction.findBestClickCandidate.call(this, locator, searchText);
  }

  /**
   * Hover then click - useful for dropdown menus that need hover to reveal items.
   * ALWAYS hovers the parent menu and keeps it hovered while clicking the submenu item.
   */
  hoverClick(
    selector: string,
    options: { force?: boolean; hoverParent?: string } = {}
  ): Promise<ClickResult> {
    return interaction.hoverClick.call(this, selector, options);
  }

  /**
   * Fill a form field.
   */
  fill(selector: string, value: string, options: { verbose?: boolean; debugDir?: string } = {}): Promise<ClickResult> {
    return interaction.fill.call(this, selector, value, options);
  }

  /**
   * Handle filling a custom input (hidden input with custom UI).
   * Handles autocomplete, datepickers, custom text inputs, etc.
   */
  handleCustomInput(
    hiddenInput: Locator,
    value: string,
    _options: { verbose?: boolean } = {}
  ): Promise<{ success: boolean; strategy?: string; error?: string }> {
    return customControls.handleCustomInput.call(this, hiddenInput, value, _options);
  }

  // =========================================================================
  // Tier 5: Smart Retry (v5.0.0)
  // =========================================================================

  /**
   * Click with smart retry - automatically retries with alternative selectors on failure.
   * v11.8.0: Added confidence gating - only reports success if confidence >= minConfidence
   */
  smartClick(
    selector: string,
    options: { force?: boolean; maxRetries?: number; retryDelay?: number; dismissOverlays?: boolean; minConfidence?: number } = {}
  ): Promise<SmartRetryResult> {
    return selfHealing.smartClick.call(this, selector, options);
  }

  // =========================================================================
  // Overlay Detection & Dismissal (v7.4.14)
  // Delegated to OverlayHandler module for maintainability
  // =========================================================================

  /**
   * Detect and dismiss overlays (cookie consent, age verification, newsletter popups).
   * Constitutional safety: Yellow zone - logs all dismissed overlays.
   */
  dismissOverlay(options: DismissOverlayOptions = { type: "auto" }): Promise<DismissOverlayResult> {
    return overlays.dismissOverlay.call(this, options);
  }

  /**
   * Find alternative selectors for an element.
   * @internal
   */
  findAlternativeSelectors(originalSelector: string): Promise<SelectorAlternative[]> {
    return overlays.findAlternativeSelectors.call(this, originalSelector);
  }

  // =========================================================================
  // Tier 5: Self-Healing Selector Cache (v5.0.0)
  // Delegated to SelectorCache module for maintainability
  // =========================================================================

  /**
   * Get current page domain for cache key generation.
   */
  private getCurrentDomain(): string {
    return selfHealing.getCurrentDomain.call(this);
  }

  /**
   * Sync the current domain to the selector cache manager.
   */
  private syncCacheDomain(): void {
    this.selectorCacheManager.setCurrentDomain(this.getCurrentDomain());
  }

  /**
   * Cache a working alternative selector for future use.
   * @internal
   */
  cacheAlternativeSelector(original: string, working: string, reason: string = "Alternative found"): void {
    this.syncCacheDomain();
    this.selectorCacheManager.cacheAlternative(original, working, reason);
  }

  /**
   * Get a cached alternative selector if available.
   * @internal
   */
  getCachedSelector(original: string): SelectorCacheEntry | null {
    this.syncCacheDomain();
    return this.selectorCacheManager.getCached(original);
  }

  /**
   * Update cache entry statistics.
   * @internal
   */
  updateCacheStats(original: string, success: boolean): void {
    this.syncCacheDomain();
    this.selectorCacheManager.updateStats(original, success);
  }

  /**
   * Get selector cache statistics.
   */
  getSelectorCacheStats(): SelectorCacheStats {
    return this.selectorCacheManager.getStats();
  }

  /**
   * Clear the selector cache.
   */
  clearSelectorCache(domain?: string): number {
    return this.selectorCacheManager.clear(domain);
  }

  /**
   * List all cached selectors.
   */
  listCachedSelectors(domain?: string): SelectorCacheEntry[] {
    return this.selectorCacheManager.list(domain);
  }

  // =========================================================================
  // Tier 5: AI Test Generation (v5.0.0)
  // =========================================================================

  /**
   * Analyze a page and generate test scenarios.
   */
  generateTests(url?: string): Promise<TestGenerationResult> {
    return testGeneration.generateTests.call(this, url);
  }

  /**
   * The click gate's zone for every element generate_tests might click, keyed by selector: the selector
   * string as click() judges it, the element's names, and the element itself through elementZone (the
   * gate's own classifyElement, so a benign label on a button whose form posts to /account/delete is still
   * red). The generator used to click whatever it found: a fixture with a "Delete account" button got
   * `click text="Delete account"` as an unremarked step, which nl_test_inline then refuses, and the
   * Playwright export would simply run. (v8 b39, 2026-10-10)
   * @internal
   */
  clickTargetZones(analysis: PageAnalysis): Promise<Map<string, ActionZone>> {
    return testGeneration.clickTargetZones.call(this, analysis);
  }

  /**
   * Analyze page structure for testable elements.
   */
  analyzePage(): Promise<PageAnalysis> {
    return testGeneration.analyzePage.call(this);
  }

  /**
   * Generate test scenarios from page analysis.
   *
   * zones: the click gate's zone per selector (clickTargetZones). A red control is never an exploratory
   * click: it is left out and named in the test's notes. A form's own submit that is red stays (the test
   * means nothing without it) but is marked zone "red" and says it will be refused. Hidden elements and
   * in-page links make no step at all. (v8 b39, 2026-10-10)
   * @internal
   */
  generateTestScenarios(analysis: PageAnalysis, zones: Map<string, ActionZone> = new Map()): GeneratedTest[] {
    return testGeneration.generateTestScenarios.call(this, analysis, zones);
  }

  /**
   * Generate CBrowser script from tests.
   * @internal
   */
  generateCBrowserScript(tests: GeneratedTest[], url: string): string {
    return testGeneration.generateCBrowserScript.call(this, tests, url);
  }

  /**
   * Generate Playwright test code from tests.
   * @internal
   */
  generatePlaywrightCode(tests: GeneratedTest[], url: string): string {
    return testGeneration.generatePlaywrightCode.call(this, tests, url);
  }

  // =========================================================================
  // Verbose Debug Helpers (v7.4.16)
  // =========================================================================

  /**
   * Get all clickable elements on the page for verbose output.
   * Public so cognitive journey can use it to show Claude what's clickable.
   */
  /**
   * Snapshot of viewport-level state — what the cognitive journey AI needs to
   * reason about layout, scroll position, and active overlays. Returned as a
   * structured object that buildStepPrompt can format for Claude.
   */
  getViewportContext(page?: Page): Promise<{
    viewport: { width: number; height: number };
    scroll: { y: number; max: number; pct: number; atTop: boolean; atBottom: boolean };
    headings: Array<{ level: number; text: string; visible: boolean }>;
    activeModals: number;
    formErrors: string[];
    bannersBlocking: string[];
  }> {
    return debugHelpers.getViewportContext.call(this, page);
  }

  getAvailableClickables(page?: Page): Promise<Array<{ tag: string; text: string; selector: string; role?: string; aboveFold?: boolean; region?: string; x?: number; y?: number; width?: number; height?: number }>> {
    return debugHelpers.getAvailableClickables.call(this, page);
  }

  /**
   * Get all input fields on the page for verbose output.
   */
  /**
   * Get available form inputs on the page, including hidden ones with custom UI triggers.
   * Public so cognitive journey can use it.
   */
  getAvailableInputs(page?: Page): Promise<Array<{ selector: string; type: string; name: string; placeholder: string; label: string; isHidden?: boolean; triggerText?: string; options?: string[] }>> {
    return debugHelpers.getAvailableInputs.call(this, page);
  }

  /**
   * Generate AI suggestion for a failed click.
   * @internal
   */
  generateClickSuggestion(selector: string, available: Array<{ tag: string; text: string; selector: string }>): string {
    return debugHelpers.generateClickSuggestion.call(this, selector, available);
  }

  /**
   * Generate AI suggestion for a failed fill.
   * @internal
   */
  generateFillSuggestion(selector: string, available: Array<{ selector: string; type: string; name: string; placeholder: string; label: string }>): string {
    return debugHelpers.generateFillSuggestion.call(this, selector, available);
  }

  /**
   * Capture a debug screenshot with element highlighting.
   * Green outlines = available alternatives, Red outline = attempted selector.
   * @internal
   */
  captureDebugScreenshot(
    page: Page,
    options: { availableSelectors?: string[]; attemptedSelector?: string; debugDir?: string }
  ): Promise<string> {
    return debugHelpers.captureDebugScreenshot.call(this, page, options);
  }

  /**
   * Analyze a failure and provide AI-powered suggestions.
   * @internal
   */
  analyzeFailure(
    selector: string,
    attempts: RetryAttempt[],
  ): Promise<{ suggestion: string; available: Awaited<ReturnType<CBrowser["getAvailableClickables"]>> }> {
    return debugHelpers.analyzeFailure.call(this, selector, attempts);
  }

  // =========================================================================
  // Tier 5: Assertions (v5.0.0)
  // =========================================================================

  /**
   * Assert a condition using natural language.
   *
   * Text comparisons (title contains, page contains, quoted text) ignore case
   * by default, which is what the standalone `assert` tool and CLI `assert`
   * have always done. Pass `caseSensitive: true` to compare exactly: the NL
   * test runner does that unless fuzzy matching was asked for, because a test
   * step that says `verify page contains "Persona Testing"` must fail on a page
   * that says "persona testing". Title-equals and URL checks were already exact.
   */
  assert(assertion: string, options: { caseSensitive?: boolean } = {}): Promise<AssertionResult> {
    return assertions.assert.call(this, assertion, options);
  }

  /**
   * Evaluate a natural language assertion.
   * @internal
   */
  evaluateAssertion(assertion: string, caseSensitive = false): Promise<Omit<AssertionResult, "screenshot">> {
    return assertions.evaluateAssertion.call(this, assertion, caseSensitive);
  }

  /**
   * Public accessor for the element resolver, for callers outside this class
   * that need a Locator rather than an action (screen capture element
   * tracking, for one). Deliberately a thin delegate: all nine resolution
   * strategies, the self-healing cache and the verbose reporting stay in
   * findElement, so there is exactly one resolver in the codebase.
   */
  async resolveElementLocator(selector: string): Promise<Locator | null> {
    return this.findElement(selector);
  }

  /**
   * Find an element using multiple strategies.
   * @internal
   */
  findElement(selector: string, options: { skipCache?: boolean } = {}): Promise<Locator | null> {
    return elementFinding.findElement.call(this, selector, options);
  }

  /**
   * v16.11.0: Find a fillable element (input/textarea/select).
   * Prioritizes fillable elements over text/label matches to avoid matching
   * div labels instead of actual input fields.
   *
   * Bug fix for: "fill matches div label instead of input"
   * @internal
   */
  findFillableElement(selector: string): Promise<Locator | null> {
    return elementFinding.findFillableElement.call(this, selector);
  }

  // =========================================================================
  // Extraction
  // =========================================================================

  /**
   * Extract data from the page.
   */
  extract(what: string): Promise<ExtractResult> {
    return extraction.extract.call(this, what);
  }

  // =========================================================================
  // Screenshots
  // =========================================================================

  /**
   * Take a screenshot.
   *
   * In remote MCP mode, screenshots are automatically compressed to JPEG
   * to stay under Claude.ai's 200KB tool response limit.
   */
  screenshot(path?: string, options?: ScreenshotOptions): Promise<string> {
    return screenshots.screenshot.call(this, path, options);
  }

  /**
   * Clamp a caller-supplied clip rect to the surface actually being captured
   * (the viewport, or the full document when fullPage is set).
   * @internal
   */
  resolveClip(opts: ScreenshotOptions): Promise<ClipRect | undefined> {
    return screenshots.resolveClip.call(this, opts);
  }

  /**
   * Take a compressed JPEG screenshot that fits `maxSize` bytes.
   *
   * The page is captured once, at its current viewport, and the budget is met
   * in memory -- lower JPEG quality first, then a smaller image. The viewport
   * is never resized. `lastScreenshotInfo` says what came out.
   *
   * @param path - Output path (will use .jpg extension)
   * @param options - Compression options
   * @returns Path to the compressed screenshot
   */
  screenshotCompressed(path?: string, options?: ScreenshotOptions): Promise<string> {
    return screenshots.screenshotCompressed.call(this, path, options);
  }

  /**
   * Fit a JPEG into `maxSize` bytes without going back to the page.
   *
   * Every candidate is encoded from the pixels of `source`, the one
   * high-quality capture. The old last resort re-encoded an already-degraded
   * q25 file at q62; the result came out larger, was discarded, and the
   * over-budget file shipped (measured: 2560x1440 at 91.9KB and a 1280x800
   * noise canvas at 96KB, both against 89KB). A single pass with a fixed
   * floor cannot promise the budget either, so this loops until it fits.
   *
   * Order, each step tried only when the one before did not fit:
   *   1. full size, q70 then q55 -- the floor where text stays clean;
   *   2. narrower, q70 then q55, down to READABLE_WIDTH;
   *   3. at that width, q45 then q35 -- below it text stops being readable,
   *      so quality is the cheaper thing to give up first;
   *   4. narrower still at the floor quality, down to MIN_WIDTH;
   *   5. at MIN_WIDTH, q45 / q35 / q25.
   * If nothing fits, the smallest candidate comes back over budget, and the
   * inline budget check in buildContentWithScreenshots reports it omitted.
   * @internal
   */
  fitJpegToBudget(source: Buffer, maxSize: number, startQuality: number): Promise<FittedJpeg> {
    return screenshots.fitJpegToBudget.call(this, source, maxSize, startQuality);
  }

  // =========================================================================
  // Sessions
  // =========================================================================

  /**
   * Save the current session.
   */
  async saveSession(name: string): Promise<void> {
    const page = await this.getPage();
    await this.sessionManager.save(name, page, this.context!);
  }

  /**
   * Load a saved session.
   */
  async loadSession(name: string): Promise<LoadSessionResult> {
    const page = await this.getPage();
    // Itself, so the saved page loads through the gate reading.
    return this.sessionManager.load(name, page, this.context!, this);
  }

  /**
   * List all saved session names.
   */
  listSessions(): string[] {
    return this.sessionManager.list();
  }

  /**
   * List all saved sessions with rich metadata.
   */
  listSessionsDetailed(): SessionMetadata[] {
    return this.sessionManager.listDetailed();
  }

  /**
   * Get detailed info for a single session.
   */
  getSessionDetails(name: string): SavedSession | null {
    return this.sessionManager.getDetails(name);
  }

  /**
   * Delete a saved session.
   */
  deleteSession(name: string): boolean {
    return this.sessionManager.delete(name);
  }

  /**
   * Delete sessions older than a given number of days.
   */
  cleanupSessions(olderThanDays: number): { deleted: string[]; kept: string[] } {
    return this.sessionManager.cleanup(olderThanDays);
  }

  /**
   * Export a session to a portable JSON file.
   */
  exportSession(name: string, outputPath: string): boolean {
    return this.sessionManager.export(name, outputPath);
  }

  /**
   * Import a session from a JSON file.
   */
  importSession(inputPath: string, name: string): boolean {
    return this.sessionManager.import(inputPath, name);
  }

  // =========================================================================
  // Journeys
  // =========================================================================

  /**
   * Run an autonomous journey: a model-driven cognitive journey for one persona.
   *
   * Needs an Anthropic API key. There is no keyless fallback any more (20.0.0):
   * the old heuristic explorer clicked the highest keyword match among the first
   * twenty links and called the goal reached when any goal word, "the"
   * included, appeared anywhere on the page. Measured 2026-10-21: "buy the blue
   * widget" on a page with no widget reported success for every persona, with
   * identical click paths. A result that is always yes is not a measurement.
   *
   * @requires ANTHROPIC_API_KEY (set via `npx cbrowser config set-api-key`)
   */
  journey(options: JourneyOptions): Promise<JourneyResult> {
    return journey.journey.call(this, options);
  }

  // =========================================================================
  // Constitutional Safety
  // =========================================================================

  /**
   * Classify an action into a safety zone.
   *
   * v11.1.0: Context-aware classification to reduce false positives.
   * Uses semantic patterns instead of naive keyword matching.
   *
   * Zones:
   * - BLACK: Security violations (bypass, inject, hack) - NEVER execute
   * - RED: Financial or destructive actions - requires --force
   * - YELLOW: Interactive actions (click, fill) - log and proceed
   * - GREEN: Read-only actions - auto-execute
   * @internal
   */
  classifyAction(action: string, target: string, options: { ignoreBlack?: boolean } = {}): ActionZone {
    return constitutionalSafety.classifyAction.call(this, action, target, options);
  }

  /**
   * Classify a RESOLVED element by what it is, with the same patterns classifyAction applies to a
   * string. Reads the control a click would act on (the element, its nearest interactive ancestor in the
   * composed tree, or the control under the point the click lands on) and runs classifyAction over every
   * description of it: aria-label, resolved aria-labelledby, a button's value, title, its own visible
   * text, names that live below it and belong to it (an icon's aria-label or <title>, an image's alt,
   * an image input's alt, open-shadow-root and slotted text), and the action - or the submitter's
   * formaction - of the form it submits. The most severe zone wins.
   *
   * Not judged, because acting on them has no consequence of its own: a text field (typed text and the
   * field's label are data; clicking into "Reason you want to close account" closes nothing) and a choice
   * control (checkbox, radio, switch, select, option: choosing a value; the submit that commits it is
   * judged when it is clicked).
   *
   * implicitSubmit: the caller is about to press Enter, which submits the focused field's form. The
   * form's action and its default submit button are then the descriptions that matter.
   * skipHit: the element is already the deepest element at a known point (a coordinate click, a drag
   * endpoint, the focused element); do not hit-test its centre.
   *
   * position: for an element that is not itself a control (a section, a card, <main>), the point that was
   * judged, relative to the element's padding box. Callers pass it to the click so the point judged is the
   * point clicked.
   *
   * Returns null when the element cannot be read (detached, frame gone); the caller keeps the string zone.
   * @internal
   */
  classifyElement(
    element: Locator | ElementHandle,
    options: { implicitSubmit?: boolean; skipHit?: boolean } = {},
  ): Promise<{ zone: ActionZone; tag: string; label: string; descriptors: string[]; position?: { x: number; y: number } } | null> {
    return constitutionalSafety.classifyElement.call(this, element, options);
  }

  /**
   * Gate a resolved element before it is activated. Returns a refusal when the element is red and the
   * caller did not pass force; otherwise the effective zone (the more severe of the string zone and the
   * element zone), the element's tag and label for the result and the audit trail, and - for a
   * container - the position that was judged, which the caller must click.
   * @internal
   */
  gateElement(
    verb: string,
    selector: string,
    element: Locator | ElementHandle,
    stringZone: ActionZone,
    force: boolean | undefined,
    options: { implicitSubmit?: boolean } = {},
  ): Promise<{ zone: ActionZone; target?: ClickResult["target"]; refusal?: ClickResult; position?: { x: number; y: number } }> {
    return constitutionalSafety.gateElement.call(this, verb, selector, element, stringZone, force, options);
  }

  /**
   * The element a pointer at viewport (x, y) reaches: the topmost element there, followed into open shadow
   * roots and same-origin frames. Cross-origin frames stop at the <iframe>. (classifyElement carries the
   * same walk for a container's hit-test; the two are kept identical.)
   * @internal
   */
  deepElementAt(x: number, y: number): Promise<ElementHandle | null> {
    return constitutionalSafety.deepElementAt.call(this, x, y);
  }

  /**
   * The click gate's verdict on the element `selector` resolves to, judged on the element ITSELF (no
   * hit-test, so nothing scrolls). find_element_by_intent reports it as `zone`. A real click is additionally
   * judged where the pointer lands, so a container (a card, a section) can read yellow here and still be
   * refused when the control at its centre is red. Resolves `selector` as CSS, not through the text-first
   * click resolver or the self-healing cache. The finder's selectors are built so that the text-first resolver
   * reaches the same element (no form that is also page text, no lone tag), but click() consults the self-healing
   * cache before resolving, so a stale cache entry for the same selector string can still send click() to a
   * different element than the one judged here.
   */
  elementZone(selector: string): Promise<{ zone: ActionZone; label: string } | null> {
    return constitutionalSafety.elementZone.call(this, selector);
  }

  /**
   * Refusal message when a click at viewport point (x, y) would activate a red-zone control, else null.
   * Used by the NL test runner's "click at X, Y".
   */
  pointRedZone(x: number, y: number, force?: boolean): Promise<string | null> {
    return constitutionalSafety.pointRedZone.call(this, x, y, force);
  }

  /**
   * Refusal message when dragging `source` onto `target` would click a red-zone control, else null.
   * A drag is a mousedown where the pointer is over the source's centre and a mouseup over the target's
   * centre, and the browser fires click on the nearest common ancestor of the two elements actually under
   * the pointer. So the press and release points are resolved the way the pointer reaches them (beneath
   * nothing, into shadow roots and same-origin frames), each after scrolling its element into view as the
   * drag itself does, and the control containing both is judged.
   */
  dragRedZone(source: string, target: string, force?: boolean): Promise<string | null> {
    return constitutionalSafety.dragRedZone.call(this, source, target, force);
  }

  /**
   * Zone of pressing `key` on whatever has focus. Enter activates the focused control or submits the
   * form of the focused field; Space activates a focused button-like control. Any other key, or nothing
   * focused, returns null (no activation to gate). Focus is followed into open shadow roots and
   * same-origin frames (a design-system app shell's host is not what has focus). Used by the keyboard
   * paths through keystrokeRedZone.
   */
  classifyKeyActivation(key: string): Promise<{ zone: ActionZone; tag: string; label: string } | null> {
    return constitutionalSafety.classifyKeyActivation.call(this, key);
  }

  /**
   * Refusal message when a keystroke would activate a red-zone control, else null. A key press is
   * checked as itself; typed text is checked for the activating characters it contains (a newline is
   * Enter, a space is Space). Every user-directed keyboard path calls this: the press_key and type_text
   * MCP tools, the CLI's press / type / keyboard commands and the daemon's equivalents.
   * Checked against what has focus now; a Tab inside typed text that moves focus first is not followed.
   */
  keystrokeRedZone(input: { key?: string; text?: string }, force?: boolean): Promise<string | null> {
    return constitutionalSafety.keystrokeRedZone.call(this, input, force);
  }

  /**
   * The more severe of two zones (green < yellow < red < black).
   * @internal
   */
  maxZone(a: ActionZone, b: ActionZone): ActionZone {
    const rank: Record<ActionZone, number> = { green: 0, yellow: 1, red: 2, black: 3 };
    return rank[b] > rank[a] ? b : a;
  }

  /**
   * Log an action to the audit trail.
   * @internal
   */
  audit(
    action: string,
    target: string,
    zone: ActionZone,
    result: "success" | "failure" | "blocked"
  ): void {
    constitutionalSafety.audit.call(this, action, target, zone, result);
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  /**
   * Clean up old files.
   */
  cleanup(options: CleanupOptions = {}): CleanupResult {
    return storageCleanup.cleanup.call(this, options);
  }

  /**
   * Get storage statistics.
   */
  getStorageStats(): Record<string, { count: number; size: number }> {
    return storageCleanup.getStorageStats.call(this);
  }

  /**
   * Get the data directory path.
   */
  getDataDir(): string {
    return this.paths.dataDir;
  }

  // =========================================================================
  // Tier 2: Visual Regression (v2.5.0)
  // =========================================================================

  /**
   * Save a visual baseline screenshot.
   */
  saveBaseline(name: string, url?: string): Promise<string> {
    return visualRegression.saveBaseline.call(this, name, url);
  }

  /**
   * Compare current page to a baseline.
   */
  compareBaseline(name: string, threshold: number = 0.1): Promise<{
    baseline: string;
    current: string;
    diffPath?: string;
    diffPercentage: number;
    passed: boolean;
  }> {
    return visualRegression.compareBaseline.call(this, name, threshold);
  }

  /**
   * List all visual baselines.
   */
  listBaselines(): string[] {
    return visualRegression.listBaselines.call(this);
  }

  // =========================================================================
  // Tier 2: Accessibility Audit (v2.5.0)
  // =========================================================================

  /**
   * Run accessibility audit on current page.
   */
  auditAccessibility(): Promise<{
    url: string;
    violations: Array<{ id: string; impact: string; description: string; helpUrl: string }>;
    passes: number;
    score: number;
  }> {
    return accessibilityAudit.auditAccessibility.call(this);
  }

  // =========================================================================
  // Tier 2: Test Recording (v2.5.0)
  // =========================================================================

  /** @internal */
  recordingActions: Array<{ type: string; selector?: string; value?: string; url?: string; timestamp: number }> = [];
  /** @internal */
  isRecording = false;

  /**
   * Start recording user interactions.
   */
  startRecording(url?: string): Promise<void> {
    return testRecording.startRecording.call(this, url);
  }

  /**
   * Stop recording and return actions.
   */
  stopRecording(): Array<{ type: string; selector?: string; value?: string; url?: string; timestamp: number }> {
    this.isRecording = false;
    return [...this.recordingActions];
  }

  /**
   * Save recording to file.
   */
  saveRecording(name: string, actions?: Array<{ type: string; selector?: string; value?: string; url?: string; timestamp: number }>): string {
    return testRecording.saveRecording.call(this, name, actions);
  }

  /**
   * Generate test code from recording.
   */
  generateTestCode(name: string, actions: Array<{ type: string; selector?: string; value?: string; url?: string }>): string {
    return testRecording.generateTestCode.call(this, name, actions);
  }

  // =========================================================================
  // Tier 2: Test Export (v2.5.0)
  // =========================================================================

  /**
   * Export test results as JUnit XML.
   */
  exportJUnit(suite: { name: string; tests: Array<{ name: string; status: string; duration: number; error?: string }> }, outputPath?: string): string {
    return testRecording.exportJUnit.call(this, suite, outputPath);
  }

  /**
   * Export test results as TAP format.
   */
  exportTAP(suite: { name: string; tests: Array<{ name: string; status: string; error?: string }> }, outputPath?: string): string {
    return testRecording.exportTAP.call(this, suite, outputPath);
  }

  // =========================================================================
  // Tier 2: Parallel Execution (v2.5.0)
  // =========================================================================

  /**
   * Run multiple browser tasks in parallel.
   */
  static async parallel<T>(
    tasks: Array<{
      name: string;
      config?: Partial<import("./config.js").CBrowserConfig>;
      run: (browser: CBrowser) => Promise<T>;
    }>,
    options: { maxConcurrency?: number } = {}
  ): Promise<Array<{ name: string; result?: T; error?: string; duration: number }>> {
    const maxConcurrency = options.maxConcurrency || tasks.length;
    const results: Array<{ name: string; result?: T; error?: string; duration: number }> = [];

    // Process tasks in batches
    for (let i = 0; i < tasks.length; i += maxConcurrency) {
      const batch = tasks.slice(i, i + maxConcurrency);

      const batchResults = await Promise.all(
        batch.map(async (task) => {
          const startTime = Date.now();
          const browser = new CBrowser(task.config || {});

          try {
            const result = await task.run(browser);
            return {
              name: task.name,
              result,
              duration: Date.now() - startTime,
            };
          } catch (e: any) {
            return {
              name: task.name,
              error: e.message,
              duration: Date.now() - startTime,
            };
          } finally {
            await browser.close();
          }
        })
      );

      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Run the same task across multiple device configurations in parallel.
   */
  static async parallelDevices<T>(
    devices: string[],
    run: (browser: CBrowser, device: string) => Promise<T>,
    options: { maxConcurrency?: number; config?: Partial<import("./config.js").CBrowserConfig> } = {}
  ): Promise<Array<{ device: string; result?: T; error?: string; duration: number }>> {
    // `config` is shared by every device (headless, engine); each task's own
    // device wins over one in it.
    const tasks = devices.map(device => ({
      name: device,
      config: { ...options.config, device },
      run: (browser: CBrowser) => run(browser, device),
    }));

    const results = await CBrowser.parallel(tasks, options);
    return results.map(r => ({ device: r.name, ...r }));
  }

  /**
   * Run the same task across multiple URLs in parallel.
   */
  static async parallelUrls<T>(
    urls: string[],
    run: (browser: CBrowser, url: string) => Promise<T>,
    options: { maxConcurrency?: number; config?: Partial<import("./config.js").CBrowserConfig> } = {}
  ): Promise<Array<{ url: string; result?: T; error?: string; duration: number }>> {
    const tasks = urls.map(url => ({
      name: url,
      config: options.config,
      run: (browser: CBrowser) => run(browser, url),
    }));

    const results = await CBrowser.parallel(tasks, options);
    return results.map(r => ({ url: r.name, ...r }));
  }

  // =========================================================================
  // Tier 3: Fluent API (v3.0.0)
  // =========================================================================

  /**
   * Fluent API - navigate and return chainable instance.
   */
  async goto(url: string): Promise<FluentCBrowser> {
    await this.navigate(url);
    return new FluentCBrowser(this);
  }
}

/**
 * Fluent wrapper for chainable API.
 */
export class FluentCBrowser {
  constructor(private browser: CBrowser) {}

  async click(selector: string, options?: { force?: boolean }): Promise<FluentCBrowser> {
    await this.browser.click(selector, options);
    return this;
  }

  async fill(selector: string, value: string): Promise<FluentCBrowser> {
    await this.browser.fill(selector, value);
    return this;
  }

  async screenshot(path?: string): Promise<FluentCBrowser> {
    await this.browser.screenshot(path);
    return this;
  }

  async wait(ms: number): Promise<FluentCBrowser> {
    await new Promise(resolve => setTimeout(resolve, ms));
    return this;
  }

  async extract(what: string): Promise<{ data: unknown; fluent: FluentCBrowser }> {
    const result = await this.browser.extract(what);
    return { data: result.data, fluent: this };
  }

  async close(): Promise<void> {
    await this.browser.close();
  }

  get instance(): CBrowser {
    return this.browser;
  }
}

