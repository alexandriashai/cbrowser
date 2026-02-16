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

import { chromium, firefox, webkit, type Browser, type Page, type BrowserContext, type Route, type Locator } from "playwright";
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";

import { type CBrowserConfig, mergeConfig, getPaths, ensureDirectories, type CBrowserPaths } from "./config.js";
import { BUILTIN_PERSONAS, getPersona } from "./personas.js";
import type {
  SavedSession,
  NavigateOptions,
  NavigationResult,
  ClickResult,
  ExtractResult,
  JourneyResult,
  JourneyStep,
  ConsoleEntry,
  AuditEntry,
  ActionZone,
  CleanupOptions,
  CleanupResult,
  JourneyOptions,
  Persona,
  NetworkMock,
  NetworkRequest,
  NetworkResponse,
  HAREntry,
  HARLog,
  PerformanceMetrics,
  PerformanceAuditResult,
  SmartRetryResult,
  RetryAttempt,
  AssertionResult,
  SelectorAlternative,
  SelectorCacheEntry,
  SelectorCacheStats,
  PageElement,
  PageAnalysis,
  FormAnalysis,
  GeneratedTest,
  TestGenerationResult,
  SupportedBrowser,
  DismissOverlayOptions,
  DismissOverlayResult,
  SessionMetadata,
  LoadSessionResult,
  BrowserHealthResult,
  BrowserRecoveryResult,
} from "./types.js";
import { DEVICE_PRESETS, LOCATION_PRESETS, CBrowserErrorCode } from "./types.js";
import {
  runCognitiveJourney,
  isApiKeyConfigured,
} from "./cognitive/index.js";
import { SessionManager } from "./browser/session-manager.js";
import { SelectorCacheManager } from "./browser/selector-cache.js";
import { OverlayHandler } from "./browser/overlay-handler.js";

// Browser-specific fast launch args for performance optimization
const BROWSER_LAUNCH_ARGS: Record<SupportedBrowser, string[]> = {
  // Chromium args - reduces cold start time significantly
  chromium: [
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-setuid-sandbox",
    "--no-sandbox",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-breakpad",
    "--disable-component-extensions-with-background-pages",
    "--disable-features=TranslateUI",
    "--disable-ipc-flooding-protection",
    "--disable-renderer-backgrounding",
    "--enable-features=NetworkService,NetworkServiceInProcess",
    "--force-color-profile=srgb",
    "--metrics-recording-only",
    "--no-first-run",
  ],
  // Firefox args - uses different flag format
  firefox: [
    "-no-remote", // Don't connect to existing Firefox instance
    "-new-instance", // Force new browser instance
  ],
  // WebKit args - minimal flags, WebKit is already lean
  webkit: [],
};

// Legacy alias for backward compatibility
const _FAST_LAUNCH_ARGS = BROWSER_LAUNCH_ARGS.chromium;

// Session state persistence - saves current URL between CLI invocations
interface SessionState {
  url: string;
  timestamp: number;
  viewport?: { width: number; height: number };
  device?: string;
}

export class CBrowser {
  private config: CBrowserConfig;
  private paths: CBrowserPaths;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private currentPersona: Persona | null = null;
  private networkRequests: NetworkRequest[] = [];
  private networkResponses: Map<string, NetworkResponse> = new Map();
  private harEntries: HAREntry[] = [];
  private isRecordingHar = false;
  private skipSessionRestore = false;

  // Modular components (extracted for maintainability)
  private sessionManager: SessionManager;
  private selectorCacheManager: SelectorCacheManager;
  private overlayHandler: OverlayHandler;

  // Track last filled input for Enter key fallback when submit buttons are hidden
  private lastFilledInputSelector: string | null = null;

  constructor(userConfig: Partial<CBrowserConfig> = {}) {
    this.config = mergeConfig(userConfig);
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

  private get sessionStateFile(): string {
    return join(this.paths.dataDir, "browser-state", "last-session.json");
  }

  private saveSessionState(url: string, viewport?: { width: number; height: number }, device?: string): void {
    try {
      // Don't save about:blank or empty URLs
      if (!url || url === "about:blank" || url === "") return;

      const state: SessionState = {
        url,
        timestamp: Date.now(),
        viewport,
        device: device || this.config.device,
      };

      const stateDir = join(this.paths.dataDir, "browser-state");
      if (!existsSync(stateDir)) {
        mkdirSync(stateDir, { recursive: true });
      }

      writeFileSync(this.sessionStateFile, JSON.stringify(state, null, 2));
    } catch (e) {
      // Silently fail - this is a best-effort feature
    }
  }

  /**
   * Save device setting to session state for persistence.
   */
  saveDeviceSetting(device: string): void {
    try {
      const stateDir = join(this.paths.dataDir, "browser-state");
      if (!existsSync(stateDir)) {
        mkdirSync(stateDir, { recursive: true });
      }

      // Load existing state or create new
      let state: SessionState;
      if (existsSync(this.sessionStateFile)) {
        state = JSON.parse(readFileSync(this.sessionStateFile, "utf-8"));
      } else {
        state = { url: "", timestamp: Date.now() };
      }

      state.device = device;
      state.timestamp = Date.now();
      writeFileSync(this.sessionStateFile, JSON.stringify(state, null, 2));
    } catch (e) {
      console.error(`Failed to save device setting: ${(e as Error).message}`);
    }
  }

  private loadSessionState(): SessionState | null {
    try {
      if (!existsSync(this.sessionStateFile)) return null;
      const content = readFileSync(this.sessionStateFile, "utf-8");
      const state = JSON.parse(content) as SessionState;

      // Expire sessions older than 1 hour
      const oneHour = 60 * 60 * 1000;
      if (Date.now() - state.timestamp > oneHour) {
        unlinkSync(this.sessionStateFile);
        return null;
      }

      return state;
    } catch (e) {
      return null;
    }
  }

  private clearSessionState(): void {
    try {
      if (existsSync(this.sessionStateFile)) {
        unlinkSync(this.sessionStateFile);
      }
    } catch (e) {
      // Silently fail
    }
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /**
   * Launch the browser.
   */
  async launch(): Promise<void> {
    if (this.browser || this.context) return;

    // Load saved session state to restore device setting if not explicitly set
    if (this.config.persistent && !this.config.device) {
      const savedSession = this.loadSessionState();
      if (savedSession?.device && DEVICE_PRESETS[savedSession.device]) {
        this.config.device = savedSession.device;
        if (this.config.verbose) {
          console.log(`🔄 Restoring device: ${savedSession.device}`);
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
    };

    // Apply device emulation if configured
    if (this.config.device && DEVICE_PRESETS[this.config.device]) {
      const device = DEVICE_PRESETS[this.config.device];
      contextOptions.viewport = device.viewport;
      contextOptions.userAgent = device.userAgent;
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

    // Apply locale if configured
    if (this.config.locale) {
      contextOptions.locale = this.config.locale;
    }

    // Apply timezone if configured
    if (this.config.timezone) {
      contextOptions.timezoneId = this.config.timezone;
    }

    // Apply color scheme if configured
    if (this.config.colorScheme) {
      contextOptions.colorScheme = this.config.colorScheme;
    }

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
    const launchArgs = BROWSER_LAUNCH_ARGS[this.config.browser];

    // Build proxy options for Playwright if configured
    const proxyOptions = this.config.proxy ? {
      proxy: {
        server: this.config.proxy.server,
        username: this.config.proxy.username,
        password: this.config.proxy.password,
        bypass: this.config.proxy.bypass?.join(","),
      },
    } : {};

    if (this.config.persistent) {
      const browserStateDir = join(this.paths.dataDir, "browser-state");
      if (!existsSync(browserStateDir)) {
        mkdirSync(browserStateDir, { recursive: true });
      }
      this.context = await browserType.launchPersistentContext(browserStateDir, {
        headless: this.config.headless,
        args: launchArgs,
        ...contextOptions,
        ...proxyOptions,
      });
      this.page = this.context.pages()[0] || await this.context.newPage();
      if (this.config.verbose) {
        console.log(`🔄 Using persistent browser context: ${browserStateDir}`);
        if (this.config.proxy) {
          console.log(`🌐 Using proxy: ${this.config.proxy.server}`);
        }
      }
    } else {
      this.browser = await browserType.launch({
        headless: this.config.headless,
        args: launchArgs,
        ...proxyOptions,
      });
      this.context = await this.browser.newContext(contextOptions);
      this.page = await this.context.newPage();
      if (this.config.verbose && this.config.proxy) {
        console.log(`🌐 Using proxy: ${this.config.proxy.server}`);
      }
    }

    // Apply network mocks if configured
    if (this.config.networkMocks && this.config.networkMocks.length > 0) {
      await this.setupNetworkMocks(this.config.networkMocks);
    }

    // Set up network request/response tracking for HAR
    this.setupNetworkTracking();

    // Restore previous session URL if available (persistent mode only)
    if (this.config.persistent && !this.skipSessionRestore) {
      const savedSession = this.loadSessionState();
      if (savedSession && savedSession.url && savedSession.url !== "about:blank") {
        try {
          if (this.config.verbose) {
            console.log(`🔄 Restoring session: ${savedSession.url}`);
          }
          await this.page!.goto(savedSession.url, {
            waitUntil: "domcontentloaded",
            timeout: 15000,
          });
          // Wait for network idle and JS hydration
          await this.page!.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
          await this.page!.waitForTimeout(1000);
          // Apply saved viewport if available
          if (savedSession.viewport) {
            await this.page!.setViewportSize(savedSession.viewport);
          }
        } catch (e) {
          // If restore fails, continue with blank page
          if (this.config.verbose) {
            console.log(`⚠️ Could not restore session: ${(e as Error).message}`);
          }
        }
      }
    }
  }

  /**
   * Close the browser.
   */
  async close(): Promise<void> {
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
  }

  /**
   * Reset persistent browser state (clear cookies, localStorage, etc.)
   */
  async reset(): Promise<void> {
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

  /**
   * Get the current page, launching if needed.
   * If the page exists but is at about:blank, restores the previous session.
   * v14.2.1: Added health check to prevent page desync issues.
   */
  async getPage(): Promise<Page> {
    if (!this.page) {
      await this.launch();
    }

    // v14.2.1: Verify page is healthy before returning (fixes page desync)
    if (this.page) {
      try {
        // Quick health check - verify page is responsive
        if (this.page.isClosed()) {
          if (this.config.verbose) {
            console.log(`⚠️ Page was closed, recovering...`);
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
          console.log(`⚠️ Page unresponsive, recovering: ${(e as Error).message}`);
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
        if (savedSession && savedSession.url && savedSession.url !== "about:blank") {
          try {
            if (this.config.verbose) {
              console.log(`🔄 Restoring session: ${savedSession.url}`);
            }
            await this.page.goto(savedSession.url, {
              waitUntil: "domcontentloaded",
              timeout: 15000,
            });
            // Wait for network idle and JS hydration
            await this.page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
            await this.page.waitForTimeout(1000);
            if (savedSession.viewport) {
              await this.page.setViewportSize(savedSession.viewport);
            }
          } catch (e) {
            if (this.config.verbose) {
              console.log(`⚠️ Could not restore session: ${(e as Error).message}`);
            }
          }
        }
      }
    }

    return this.page!;
  }

  // =========================================================================
  // Browser Crash Recovery (v11.8.0)
  // =========================================================================

  /** Maximum attempts for crash recovery */
  private static readonly MAX_RECOVERY_ATTEMPTS = 3;
  /** Default timeout for health check in ms */
  private static readonly HEALTH_CHECK_TIMEOUT = 5000;
  /** Base retry delay in ms (exponential backoff) */
  private static readonly BASE_RETRY_DELAY = 1000;

  /**
   * Check if the browser is healthy and responsive.
   * This performs a lightweight operation to verify the browser process is alive.
   */
  async isBrowserHealthy(): Promise<BrowserHealthResult> {
    const startTime = Date.now();

    // No page or context means browser needs launch, not recovery
    if (!this.page || !this.context) {
      return {
        healthy: false,
        error: CBrowserErrorCode.BROWSER_DISCONNECTED,
        message: "Browser not launched",
        checkDurationMs: Date.now() - startTime,
      };
    }

    try {
      // Check if page is closed
      if (this.page.isClosed()) {
        return {
          healthy: false,
          error: CBrowserErrorCode.BROWSER_CRASHED,
          message: "Page is closed unexpectedly",
          checkDurationMs: Date.now() - startTime,
        };
      }

      // Try a simple evaluate to verify browser is responsive
      const healthCheck = await Promise.race([
        this.page.evaluate(() => ({
          url: window.location.href,
          readyState: document.readyState,
          timestamp: Date.now(),
        })),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error("Health check timeout")), CBrowser.HEALTH_CHECK_TIMEOUT)
        ),
      ]);

      if (!healthCheck) {
        return {
          healthy: false,
          error: CBrowserErrorCode.BROWSER_UNRESPONSIVE,
          message: "Browser failed to respond within timeout",
          checkDurationMs: Date.now() - startTime,
        };
      }

      return {
        healthy: true,
        message: `Browser healthy, page at ${(healthCheck as { url: string }).url}`,
        checkDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Detect specific crash patterns
      if (errorMessage.includes("Target closed") || errorMessage.includes("Browser closed")) {
        return {
          healthy: false,
          error: CBrowserErrorCode.BROWSER_CRASHED,
          message: `Browser process crashed: ${errorMessage}`,
          checkDurationMs: Date.now() - startTime,
        };
      }

      if (errorMessage.includes("disconnected") || errorMessage.includes("Connection refused")) {
        return {
          healthy: false,
          error: CBrowserErrorCode.BROWSER_DISCONNECTED,
          message: `Browser disconnected: ${errorMessage}`,
          checkDurationMs: Date.now() - startTime,
        };
      }

      if (errorMessage.includes("timeout") || errorMessage.includes("Timeout")) {
        return {
          healthy: false,
          error: CBrowserErrorCode.BROWSER_UNRESPONSIVE,
          message: `Browser unresponsive: ${errorMessage}`,
          checkDurationMs: Date.now() - startTime,
        };
      }

      return {
        healthy: false,
        error: CBrowserErrorCode.BROWSER_CRASHED,
        message: `Browser health check failed: ${errorMessage}`,
        checkDurationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Attempt to recover from a browser crash by restarting the browser.
   * Uses exponential backoff for retry attempts.
   */
  async recoverBrowser(options?: {
    maxAttempts?: number;
    restoreUrl?: string;
  }): Promise<BrowserRecoveryResult> {
    const startTime = Date.now();
    const maxAttempts = options?.maxAttempts ?? CBrowser.MAX_RECOVERY_ATTEMPTS;

    // First check if recovery is actually needed
    const healthResult = await this.isBrowserHealthy();
    if (healthResult.healthy) {
      return {
        success: true,
        recoveryNeeded: false,
        message: "Browser is already healthy, no recovery needed",
        attempts: 0,
        recoveryDurationMs: Date.now() - startTime,
      };
    }

    if (this.config.verbose) {
      console.log(`🔄 Browser crash detected: ${healthResult.message}`);
      console.log(`🔄 Attempting recovery (max ${maxAttempts} attempts)...`);
    }

    // Get the last known URL before crash for restoration
    const savedSession = this.loadSessionState();
    const restoreUrl = options?.restoreUrl ?? savedSession?.url;

    let lastError: string | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (this.config.verbose) {
          console.log(`🔄 Recovery attempt ${attempt}/${maxAttempts}...`);
        }

        // Force close any zombie processes
        await this.forceClose();

        // Wait with exponential backoff before retry
        const delay = CBrowser.BASE_RETRY_DELAY * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));

        // Relaunch browser
        await this.launch();

        // Restore previous URL if available
        if (restoreUrl && restoreUrl !== "about:blank" && this.page) {
          try {
            await this.page.goto(restoreUrl, {
              waitUntil: "domcontentloaded",
              timeout: 15000,
            });
          } catch (e) {
            // URL restoration is best-effort, don't fail recovery
            if (this.config.verbose) {
              console.log(`⚠️ Could not restore URL: ${restoreUrl}`);
            }
          }
        }

        // Verify recovery was successful
        const postRecoveryHealth = await this.isBrowserHealthy();
        if (postRecoveryHealth.healthy) {
          if (this.config.verbose) {
            console.log(`✅ Browser recovered successfully on attempt ${attempt}`);
          }
          return {
            success: true,
            recoveryNeeded: true,
            message: `Browser recovered after ${attempt} attempt(s)`,
            attempts: attempt,
            recoveryDurationMs: Date.now() - startTime,
          };
        }

        lastError = postRecoveryHealth.message;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (this.config.verbose) {
          console.log(`❌ Recovery attempt ${attempt} failed: ${lastError}`);
        }
      }
    }

    // All attempts failed
    return {
      success: false,
      recoveryNeeded: true,
      error: CBrowserErrorCode.BROWSER_RECOVERY_FAILED,
      message: `Failed to recover browser after ${maxAttempts} attempts: ${lastError}`,
      attempts: maxAttempts,
      recoveryDurationMs: Date.now() - startTime,
      retryAfterMs: CBrowser.BASE_RETRY_DELAY * Math.pow(2, maxAttempts),
    };
  }

  /**
   * Force close browser processes without normal cleanup.
   * Used when browser is unresponsive and normal close() would hang.
   */
  private async forceClose(): Promise<void> {
    // Remove listeners to prevent memory leaks
    if (this.page) {
      try {
        this.page.removeAllListeners();
      } catch {
        // Ignore - page may be destroyed
      }
    }

    // Force close context
    if (this.context) {
      try {
        await Promise.race([
          this.context.close(),
          new Promise((r) => setTimeout(r, 2000)), // 2s timeout for close
        ]);
      } catch {
        // Ignore - may already be closed
      }
      this.context = null;
      this.page = null;
    }

    // Force close browser
    if (this.browser) {
      try {
        await Promise.race([
          this.browser.close(),
          new Promise((r) => setTimeout(r, 2000)), // 2s timeout for close
        ]);
      } catch {
        // Ignore - may already be closed
      }
      this.browser = null;
    }
  }

  /**
   * Execute an operation with automatic crash recovery.
   * If the browser crashes during the operation, it will be restarted and the operation retried.
   *
   * @param operation - The async operation to execute
   * @param operationName - Name of the operation for error messages
   * @returns Result of the operation or throws if recovery fails
   */
  async withCrashRecovery<T>(
    operation: () => Promise<T>,
    operationName: string = "operation"
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if this looks like a browser crash
      const crashIndicators = [
        "Target closed",
        "Browser closed",
        "disconnected",
        "Connection refused",
        "Protocol error",
        "browser has been closed",
        "Execution context was destroyed",
      ];

      const isCrash = crashIndicators.some((indicator) =>
        errorMessage.toLowerCase().includes(indicator.toLowerCase())
      );

      if (!isCrash) {
        // Not a crash, re-throw original error
        throw error;
      }

      if (this.config.verbose) {
        console.log(`🔄 Browser crash detected during ${operationName}, attempting recovery...`);
      }

      // Attempt recovery
      const recovery = await this.recoverBrowser();

      if (!recovery.success) {
        // Recovery failed, throw structured error
        throw new Error(
          JSON.stringify({
            error: "browser_crash",
            errorCode: CBrowserErrorCode.BROWSER_RECOVERY_FAILED,
            message: recovery.message,
            recovering: false,
            retryAfterMs: recovery.retryAfterMs ?? 5000,
            operation: operationName,
          })
        );
      }

      // Recovery succeeded, retry the operation once
      if (this.config.verbose) {
        console.log(`🔄 Retrying ${operationName} after recovery...`);
      }

      try {
        return await operation();
      } catch (retryError) {
        // Second failure after recovery
        throw new Error(
          JSON.stringify({
            error: "browser_crash",
            errorCode: CBrowserErrorCode.BROWSER_CRASHED,
            message: `Operation failed after recovery: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
            recovering: false,
            retryAfterMs: 5000,
            operation: operationName,
          })
        );
      }
    }
  }

  // =========================================================================
  // Network Mocking
  // =========================================================================

  /**
   * Set up network mocks for API interception.
   */
  private async setupNetworkMocks(mocks: NetworkMock[]): Promise<void> {
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
   */
  private setupNetworkTracking(): void {
    if (!this.page) return;

    this.page.on("request", (request) => {
      const networkRequest: NetworkRequest = {
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        postData: request.postData() || undefined,
        resourceType: request.resourceType(),
        timestamp: new Date().toISOString(),
      };
      this.networkRequests.push(networkRequest);

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
        this.networkResponses.set(request.url() + request.method(), harEntry as any);
      }
    });

    this.page.on("response", async (response) => {
      const key = response.url() + response.request().method();
      const _networkResponse: NetworkResponse = {
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
        headers: response.headers(),
      };

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
  async exportHar(outputPath?: string): Promise<string> {
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

    const filename = outputPath || join(harDir, `har-${Date.now()}.har`);
    writeFileSync(filename, JSON.stringify(har, null, 2));

    return filename;
  }

  /**
   * Get all captured network requests.
   */
  getNetworkRequests(): NetworkRequest[] {
    return [...this.networkRequests];
  }

  /**
   * Clear network request history.
   */
  clearNetworkHistory(): void {
    this.networkRequests = [];
    this.harEntries = [];
  }

  // =========================================================================
  // Performance Metrics
  // =========================================================================

  /**
   * Collect Core Web Vitals and performance metrics.
   */
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const page = await this.getPage();

    const metrics = await page.evaluate(() => {
      const result: Record<string, number | undefined> = {};

      // Navigation timing
      const navTiming = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      if (navTiming) {
        result.ttfb = navTiming.responseStart - navTiming.requestStart;
        result.domContentLoaded = navTiming.domContentLoadedEventEnd - navTiming.startTime;
        result.load = navTiming.loadEventEnd - navTiming.startTime;
      }

      // Paint timing
      const paintEntries = performance.getEntriesByType("paint");
      for (const entry of paintEntries) {
        if (entry.name === "first-contentful-paint") {
          result.fcp = entry.startTime;
        }
      }

      // LCP from PerformanceObserver (if available)
      const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
      if (lcpEntries.length > 0) {
        result.lcp = (lcpEntries[lcpEntries.length - 1] as any).startTime;
      }

      // CLS from layout-shift entries
      const clsEntries = performance.getEntriesByType("layout-shift");
      let clsScore = 0;
      for (const entry of clsEntries) {
        if (!(entry as any).hadRecentInput) {
          clsScore += (entry as any).value || 0;
        }
      }
      result.cls = clsScore;

      // Resource counts
      const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      result.resourceCount = resources.length;
      result.transferSize = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);

      return result;
    });

    // Rate the metrics
    const lcpRating = metrics.lcp
      ? metrics.lcp <= 2500 ? "good" : metrics.lcp <= 4000 ? "needs-improvement" : "poor"
      : undefined;

    const clsRating = metrics.cls !== undefined
      ? metrics.cls <= 0.1 ? "good" : metrics.cls <= 0.25 ? "needs-improvement" : "poor"
      : undefined;

    return {
      lcp: metrics.lcp,
      cls: metrics.cls,
      fcp: metrics.fcp,
      ttfb: metrics.ttfb,
      domContentLoaded: metrics.domContentLoaded,
      load: metrics.load,
      resourceCount: metrics.resourceCount,
      transferSize: metrics.transferSize,
      lcpRating: lcpRating as PerformanceMetrics["lcpRating"],
      clsRating: clsRating as PerformanceMetrics["clsRating"],
    };
  }

  /**
   * Run a performance audit against a budget.
   */
  async auditPerformance(url?: string): Promise<PerformanceAuditResult> {
    if (url) {
      await this.navigate(url);
    }

    const page = await this.getPage();
    const metrics = await this.getPerformanceMetrics();
    const budget = this.config.performanceBudget;
    const violations: string[] = [];
    let passed = true;

    if (budget) {
      if (budget.lcp && metrics.lcp && metrics.lcp > budget.lcp) {
        violations.push(`LCP ${metrics.lcp}ms exceeds budget ${budget.lcp}ms`);
        passed = false;
      }
      if (budget.fcp && metrics.fcp && metrics.fcp > budget.fcp) {
        violations.push(`FCP ${metrics.fcp}ms exceeds budget ${budget.fcp}ms`);
        passed = false;
      }
      if (budget.cls && metrics.cls && metrics.cls > budget.cls) {
        violations.push(`CLS ${metrics.cls} exceeds budget ${budget.cls}`);
        passed = false;
      }
      if (budget.ttfb && metrics.ttfb && metrics.ttfb > budget.ttfb) {
        violations.push(`TTFB ${metrics.ttfb}ms exceeds budget ${budget.ttfb}ms`);
        passed = false;
      }
      if (budget.transferSize && metrics.transferSize && metrics.transferSize > budget.transferSize) {
        violations.push(`Transfer size ${metrics.transferSize}B exceeds budget ${budget.transferSize}B`);
        passed = false;
      }
      if (budget.resourceCount && metrics.resourceCount && metrics.resourceCount > budget.resourceCount) {
        violations.push(`Resource count ${metrics.resourceCount} exceeds budget ${budget.resourceCount}`);
        passed = false;
      }
    }

    return {
      url: page.url(),
      timestamp: new Date().toISOString(),
      metrics,
      budget,
      passed,
      violations,
    };
  }

  // =========================================================================
  // Cookie Management
  // =========================================================================

  /**
   * Get all cookies for the current context.
   */
  async getCookies(urls?: string[]): Promise<SavedSession["cookies"]> {
    if (!this.context) {
      await this.launch();
    }
    return await this.context!.cookies(urls) as SavedSession["cookies"];
  }

  /**
   * Set cookies.
   */
  async setCookies(cookies: SavedSession["cookies"]): Promise<void> {
    if (!this.context) {
      await this.launch();
    }
    await this.context!.addCookies(cookies);
  }

  /**
   * Clear all cookies.
   */
  async clearCookies(): Promise<void> {
    if (!this.context) return;
    await this.context.clearCookies();
  }

  /**
   * Delete specific cookies by name.
   */
  async deleteCookie(name: string, domain?: string): Promise<void> {
    const cookies = await this.getCookies();
    const filtered = cookies.filter((c) => {
      if (c.name !== name) return true;
      if (domain && c.domain !== domain) return true;
      return false;
    });

    await this.clearCookies();
    if (filtered.length > 0) {
      await this.setCookies(filtered);
    }
  }

  // =========================================================================
  // Video Recording
  // =========================================================================

  /**
   * Get the path to the video file (after browser closes).
   */
  async getVideoPath(): Promise<string | null> {
    if (!this.page) return null;

    const video = this.page.video();
    if (!video) return null;

    return await video.path();
  }

  /**
   * Save the video with a custom filename.
   */
  async saveVideo(outputPath: string): Promise<string | null> {
    if (!this.page) return null;

    const video = this.page.video();
    if (!video) return null;

    await video.saveAs(outputPath);
    return outputPath;
  }

  // =========================================================================
  // Device Emulation
  // =========================================================================

  /**
   * Set device emulation (requires browser restart).
   */
  setDevice(deviceName: string): boolean {
    if (DEVICE_PRESETS[deviceName]) {
      this.config.device = deviceName;
      return true;
    }
    return false;
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
    if (typeof location === "string") {
      if (LOCATION_PRESETS[location]) {
        this.config.geolocation = LOCATION_PRESETS[location];
        return true;
      }
      return false;
    }
    this.config.geolocation = location;
    return true;
  }

  /**
   * Set geolocation at runtime without restarting.
   */
  async setGeolocationRuntime(
    location: string | { latitude: number; longitude: number; accuracy?: number }
  ): Promise<boolean> {
    if (!this.context) return false;

    let geo: { latitude: number; longitude: number; accuracy?: number };

    if (typeof location === "string") {
      if (!LOCATION_PRESETS[location]) return false;
      geo = LOCATION_PRESETS[location];
    } else {
      geo = location;
    }

    await this.context.setGeolocation(geo);
    await this.context.grantPermissions(["geolocation"]);
    return true;
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
  async applyPersonaLocation(location: {
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
    let geolocationApplied = false;
    let timezoneStored = false;
    let localeStored = false;

    // Apply geolocation at runtime (immediate effect)
    if (location.geolocation) {
      geolocationApplied = await this.setGeolocationRuntime(location.geolocation);
    }

    // Store timezone for context (affects Date objects, Intl APIs)
    if (location.timezone) {
      this.config.timezone = location.timezone;
      timezoneStored = true;
    }

    // Store locale for context (affects number/date formatting, language)
    if (location.locale) {
      this.config.locale = location.locale;
      localeStored = true;
    }

    return {
      geolocationApplied,
      timezoneStored,
      localeStored,
      effectiveTimezone: this.config.timezone,
      effectiveLocale: this.config.locale,
      note: (timezoneStored || localeStored)
        ? "Timezone/locale stored in config. For full effect, these apply when browser context is recreated."
        : undefined,
    };
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
  async navigate(url: string, options: NavigateOptions = {}): Promise<NavigationResult> {
    // Skip session restore since we're explicitly navigating to a new URL
    this.skipSessionRestore = true;
    const page = await this.getPage();
    this.skipSessionRestore = false;
    const startTime = Date.now();

    const errors: string[] = [];
    const warnings: string[] = [];

    // Capture console errors
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      } else if (msg.type() === "warning") {
        warnings.push(msg.text());
      }
    });

    // v11.3.0: Configurable wait strategy
    const waitStrategy = options.waitStrategy || "auto";
    const waitTimeout = options.waitTimeout ?? 10000;
    const waitForStability = options.waitForStability ?? (waitStrategy === "auto" || waitStrategy === "domcontentloaded");

    if (waitStrategy === "commit") {
      // Fastest: don't wait at all after navigation commits
      await page.goto(url, { waitUntil: "commit", timeout: this.config.timeout || 30000 });
    } else if (waitStrategy === "load") {
      // Standard: wait for load event
      await page.goto(url, { waitUntil: "load", timeout: this.config.timeout || 30000 });
    } else if (waitStrategy === "domcontentloaded") {
      // Fast: wait only for DOM
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: this.config.timeout || 30000 });
      if (waitForStability) {
        await this.waitForStability(page, 2000);
      }
    } else if (waitStrategy === "networkidle") {
      // Strict: wait for network idle, may fail on SPAs
      await page.goto(url, { waitUntil: "networkidle", timeout: this.config.timeout || 30000 });
    } else {
      // "auto" (default): Progressive loading strategy
      // Many SPAs (GitHub, NYT, BBC, etc.) never reach networkidle
      const networkIdleTimeout = Math.min(waitTimeout, this.config.timeout || 30000);

      try {
        // Try networkidle first with short timeout
        await page.goto(url, {
          waitUntil: "networkidle",
          timeout: networkIdleTimeout,
        });
      } catch (e) {
        const error = e as Error;
        if (error.message?.includes("Timeout") || error.message?.includes("timeout")) {
          // Fallback: Use domcontentloaded + manual stability check
          if (this.config.verbose) {
            console.log(`⚠️ networkidle timeout after ${waitTimeout}ms, falling back to domcontentloaded...`);
          }

          // Fallback to domcontentloaded (rethrows on failure)
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: this.config.timeout || 30000,
          });

          // Wait for page to stabilize (no major DOM changes for 500ms)
          if (waitForStability) {
            await this.waitForStability(page, 2000);
          }
        } else {
          // Non-timeout error, rethrow
          throw e;
        }
      }
    }

    const loadTime = Date.now() - startTime;

    // v11.9.0: Post-navigation verification to detect context desync (issue #84)
    const actualUrl = page.url();
    const actualTitle = await page.title();

    // Extract domains for comparison
    const getHostname = (urlStr: string): string => {
      try {
        return new URL(urlStr).hostname.toLowerCase();
      } catch {
        return urlStr.toLowerCase();
      }
    };

    const expectedHost = getHostname(url);
    const actualHost = getHostname(actualUrl);

    // Check for domain mismatch (indicates desync)
    const hostMismatch = expectedHost !== actualHost &&
      !actualHost.endsWith(`.${expectedHost}`) && // Allow subdomains
      !expectedHost.endsWith(`.${actualHost}`);   // Allow parent domains

    if (hostMismatch) {
      // Page context is desynced - return error with details
      const screenshot = await this.screenshot();
      if (this.config.verbose) {
        console.log(`⚠️ Page context desync detected: expected ${expectedHost}, got ${actualHost}`);
      }
      return {
        url: actualUrl,
        title: actualTitle,
        screenshot,
        errors: [...errors, `Page context desync: navigated to ${url} but landed on ${actualUrl}`],
        warnings: [...warnings, `Expected domain: ${expectedHost}, Actual domain: ${actualHost}`],
        loadTime,
        success: false,
        desyncDetected: true,
        expectedUrl: url,
      } as NavigationResult;
    }

    const screenshot = await this.screenshot();

    return {
      url: actualUrl,
      title: actualTitle,
      screenshot,
      errors,
      warnings,
      loadTime,
      success: true,
    };
  }

  /**
   * Wait for page to stabilize (minimal DOM mutations).
   * Used as fallback when networkidle times out on SPAs.
   * @internal
   */
  private async waitForStability(page: Page, maxWaitMs: number = 2000): Promise<void> {
    const checkInterval = 200;
    const minStableChecks = 2; // Require 2 consecutive stable checks
    let stableChecks = 0;
    let elapsed = 0;

    while (elapsed < maxWaitMs && stableChecks < minStableChecks) {
      const mutationCount = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          let mutations = 0;
          const observer = new MutationObserver((records) => {
            mutations += records.length;
          });
          observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
          });
          setTimeout(() => {
            observer.disconnect();
            resolve(mutations);
          }, 150);
        });
      });

      if (mutationCount < 3) {
        stableChecks++;
      } else {
        stableChecks = 0;
      }

      await page.waitForTimeout(checkInterval);
      elapsed += checkInterval + 150;
    }
  }

  /**
   * Detect if the current page is a Cloudflare challenge.
   * Checks for various Cloudflare protection signatures.
   * @returns Object with detected challenge type and evidence
   */
  async detectCloudflareChallenge(): Promise<{
    detected: boolean;
    type: "turnstile" | "managed" | "interstitial" | "js-challenge" | null;
    evidence: string[];
  }> {
    const page = await this.getPage();
    const evidence: string[] = [];
    let type: "turnstile" | "managed" | "interstitial" | "js-challenge" | null = null;

    try {
      const content = await page.content();
      const pageUrl = page.url();

      // Cloudflare Turnstile (CAPTCHA alternative)
      if (content.includes("challenges.cloudflare.com") || content.includes("turnstile")) {
        evidence.push("Cloudflare Turnstile widget detected");
        type = "turnstile";
      }

      // Cloudflare Managed Challenge (browser verification)
      if (content.includes("cf-browser-verification") || content.includes("cf_chl_opt")) {
        evidence.push("Cloudflare browser verification page");
        type = "managed";
      }

      // Cloudflare Interstitial (5-second wait)
      if (content.includes("Just a moment") && content.includes("cf-spinner")) {
        evidence.push("Cloudflare interstitial page");
        type = "interstitial";
      }

      // Cloudflare JS Challenge
      if (content.includes("jschl-answer") || content.includes("cf_chl_jschl")) {
        evidence.push("Cloudflare JavaScript challenge");
        type = "js-challenge";
      }

      // Check for Cloudflare ray ID in headers/page
      if (content.includes("cf-ray") || content.includes("__cf_bm")) {
        evidence.push("Cloudflare Ray ID or bot management cookie present");
      }

      // Check URL for challenge path
      if (pageUrl.includes("/cdn-cgi/challenge-platform/")) {
        evidence.push("URL contains Cloudflare challenge platform path");
        if (!type) type = "managed";
      }

    } catch (e) {
      evidence.push(`Detection error: ${(e as Error).message}`);
    }

    return {
      detected: type !== null,
      type,
      evidence,
    };
  }

  /**
   * Wait for a Cloudflare challenge to resolve.
   * Monitors the page for redirect after challenge completion.
   *
   * @param timeout - Maximum time to wait in ms (default: 30000)
   * @param checkInterval - How often to check in ms (default: 1000)
   * @returns Success status and final URL
   */
  async waitForCloudflareResolution(timeout: number = 30000, checkInterval: number = 1000): Promise<{
    resolved: boolean;
    originalUrl: string;
    finalUrl: string;
    waitTime: number;
    message: string;
  }> {
    const page = await this.getPage();
    const startTime = Date.now();
    const originalUrl = page.url();
    let elapsed = 0;

    // First, confirm we're on a Cloudflare challenge
    const initialCheck = await this.detectCloudflareChallenge();
    if (!initialCheck.detected) {
      return {
        resolved: true,
        originalUrl,
        finalUrl: originalUrl,
        waitTime: 0,
        message: "No Cloudflare challenge detected",
      };
    }

    if (this.config.verbose) {
      console.log(`⏳ Cloudflare ${initialCheck.type} challenge detected, waiting for resolution...`);
    }

    // Wait for the challenge to resolve (URL changes or content changes)
    while (elapsed < timeout) {
      await page.waitForTimeout(checkInterval);
      elapsed = Date.now() - startTime;

      const currentCheck = await this.detectCloudflareChallenge();
      const currentUrl = page.url();

      // Challenge resolved if:
      // 1. No longer on a challenge page
      // 2. URL has changed (redirected to actual content)
      if (!currentCheck.detected || currentUrl !== originalUrl) {
        // Wait a bit more for page to stabilize
        await this.waitForStability(page, 2000);

        const finalUrl = page.url();
        const waitTime = Date.now() - startTime;

        if (this.config.verbose) {
          console.log(`✅ Cloudflare challenge resolved in ${waitTime}ms`);
        }

        return {
          resolved: true,
          originalUrl,
          finalUrl,
          waitTime,
          message: `Cloudflare challenge resolved after ${waitTime}ms`,
        };
      }

      if (this.config.verbose && elapsed % 5000 === 0) {
        console.log(`⏳ Still waiting for Cloudflare... (${Math.round(elapsed / 1000)}s)`);
      }
    }

    // Timeout
    return {
      resolved: false,
      originalUrl,
      finalUrl: page.url(),
      waitTime: elapsed,
      message: `Timeout waiting for Cloudflare challenge (${timeout}ms)`,
    };
  }

  // =========================================================================
  // Interaction
  // =========================================================================

  /**
   * Click an element using AI-powered selector.
   */
  async click(selector: string, options: { force?: boolean; verbose?: boolean; debugDir?: string } = {}): Promise<ClickResult> {
    const page = await this.getPage();

    // Classify action zone
    const zone = this.classifyAction("click", selector);
    if (zone === "red" && !options.force) {
      return {
        success: false,
        screenshot: await this.screenshot(),
        message: `Red zone action requires --force: click "${selector}"`,
      };
    }

    try {
      // Try multiple selector strategies
      const element = await this.findElement(selector);

      if (!element) {
        const result: ClickResult = {
          success: false,
          screenshot: await this.screenshot(),
          message: `Element not found: ${selector}`,
        };

        if (options.verbose) {
          const available = await this.getAvailableClickables(page);
          result.availableElements = available;
          result.aiSuggestion = this.generateClickSuggestion(selector, available);
          result.debugScreenshot = await this.captureDebugScreenshot(page, {
            availableSelectors: available.map(e => e.selector),
            attemptedSelector: selector,
            debugDir: options.debugDir,
          });
        }

        return result;
      }

      // v17.5.0: When clicking URL-text links, ensure we click the anchor, not inner text
      // Sites often render link URLs as visible text inside <a> tags. When findElement matches
      // that URL text, it may return an inner element (span, text node) rather than the anchor.
      // Clicking the inner element doesn't always trigger navigation. Fix: find and click the anchor.
      let clickTarget = element;
      const looksLikeUrl = selector.startsWith('http://') || selector.startsWith('https://') || selector.includes('://');

      if (looksLikeUrl) {
        const ancestorAnchorInfo = await element.evaluate((el: Element) => {
          // If we're already an anchor, no change needed
          if (el.tagName === 'A') {
            return { isAnchor: true, href: (el as HTMLAnchorElement).href };
          }

          // Walk up to find parent anchor
          let current = el.parentElement;
          while (current) {
            if (current.tagName === 'A') {
              // Generate a selector for this anchor
              const anchor = current as HTMLAnchorElement;
              let anchorSelector = '';

              if (anchor.id) {
                anchorSelector = `#${anchor.id}`;
              } else if (anchor.href) {
                // Use href attribute selector - escape special chars
                const escapedHref = anchor.href.replace(/"/g, '\\"');
                anchorSelector = `a[href="${escapedHref}"]`;
              }

              return {
                isAnchor: false,
                hasAncestorAnchor: true,
                ancestorSelector: anchorSelector,
                href: anchor.href
              };
            }
            current = current.parentElement;
          }

          return { isAnchor: false, hasAncestorAnchor: false };
        });

        if (ancestorAnchorInfo.hasAncestorAnchor && ancestorAnchorInfo.ancestorSelector) {
          // Found a parent anchor - click that instead
          const ancestorAnchor = page.locator(ancestorAnchorInfo.ancestorSelector).first();
          if (await ancestorAnchor.count() > 0) {
            clickTarget = ancestorAnchor;
            if (options.verbose) {
              console.log(`URL-text click: found parent anchor, clicking ${ancestorAnchorInfo.ancestorSelector}`);
            }
          }
        }
      }

      // v17.4.2: Handle target="_blank" links - navigate in same tab instead of opening new tab
      // This matches user intent: "click this link" means "go there", not "open new tab"
      const targetBlankRemoved = await clickTarget.evaluate((el: Element) => {
        if (el.tagName === 'A' && (el as HTMLAnchorElement).target === '_blank') {
          (el as HTMLAnchorElement).removeAttribute('target');
          return true;
        }
        return false;
      });

      if (targetBlankRemoved && options.verbose) {
        console.log('Removed target="_blank" to navigate in same tab');
      }

      // Check for sticky element interception before clicking
      const interception = await this.checkForInterception(clickTarget);

      if (interception.intercepted && interception.interceptorSelector) {
        if (options.verbose) {
          console.log(`Sticky element detected: ${interception.interceptorInfo}`);
        }

        // Try to handle the interception
        const handled = await this.handleStickyInterception(
          clickTarget,
          interception.interceptorSelector,
          { verbose: options.verbose }
        );

        if (!handled.success) {
          return {
            success: false,
            screenshot: await this.screenshot(),
            message: `Click intercepted by sticky element (${interception.interceptorInfo}). ${handled.error || 'All mitigation strategies failed.'}`,
          };
        }

        if (options.verbose) {
          console.log(`Successfully clicked using strategy: ${handled.strategy}`);
        }
      } else {
        // No interception, normal click
        await clickTarget.click();
      }

      // Wait for any navigation or network activity
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

      this.audit("click", selector, zone, "success");

      return {
        success: true,
        screenshot: await this.screenshot(),
        message: `Clicked: ${selector}`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // v17.4.0: Enter key fallback for hidden submit buttons
      // When a submit button is not visible (common in toggle-to-expand UIs),
      // pressing Enter on the last filled input is the universal form submission fallback
      const isVisibilityError = errorMessage.includes('not visible') ||
                                errorMessage.includes('is not visible') ||
                                errorMessage.includes('hidden');
      const isLikelySubmit = selector.toLowerCase().includes('submit') ||
                             selector.toLowerCase().includes('search') ||
                             selector.toLowerCase().includes('go') ||
                             selector.toLowerCase().includes('send');

      if (isVisibilityError && isLikelySubmit && this.lastFilledInputSelector) {
        if (options.verbose) {
          console.log(`Submit button "${selector}" not visible, trying Enter key on last filled input "${this.lastFilledInputSelector}"`);
        }

        try {
          // Find the last filled input and press Enter on it
          const lastInput = await this.findElement(this.lastFilledInputSelector);
          if (lastInput) {
            await lastInput.focus();
            await page.keyboard.press('Enter');

            // Wait for navigation or network activity
            await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

            this.audit("click", `${selector} (Enter-fallback)`, zone, "success");

            return {
              success: true,
              screenshot: await this.screenshot(),
              message: `Submitted via Enter key (button "${selector}" was not visible)`,
            };
          }
        } catch (enterError) {
          if (options.verbose) {
            console.log(`Enter key fallback failed: ${enterError instanceof Error ? enterError.message : String(enterError)}`);
          }
          // Fall through to normal error handling
        }
      }

      this.audit("click", selector, zone, "failure");

      const result: ClickResult = {
        success: false,
        screenshot: await this.screenshot(),
        message: `Failed to click: ${errorMessage}`,
      };

      if (options.verbose) {
        const available = await this.getAvailableClickables(page);
        result.availableElements = available;
        result.aiSuggestion = this.generateClickSuggestion(selector, available);
        result.debugScreenshot = await this.captureDebugScreenshot(page, {
          availableSelectors: available.map(e => e.selector),
          attemptedSelector: selector,
          debugDir: options.debugDir,
        });
      }

      return result;
    }
  }

  /**
   * Hover over an element using AI-powered selector.
   */
  async hover(selector: string): Promise<ClickResult> {
    const page = await this.getPage();

    try {
      const element = await this.findElement(selector);

      if (!element) {
        return {
          success: false,
          screenshot: await this.screenshot(),
          message: `Element not found for hover: ${selector}`,
        };
      }

      await element.hover();
      // Wait a bit for any hover-triggered animations/menus
      await page.waitForTimeout(300);

      this.audit("hover", selector, "green", "success");

      return {
        success: true,
        screenshot: await this.screenshot(),
        message: `Hovered: ${selector}`,
      };
    } catch (error) {
      this.audit("hover", selector, "green", "failure");

      return {
        success: false,
        screenshot: await this.screenshot(),
        message: `Failed to hover: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Check if a click on an element would be intercepted by a sticky/fixed element.
   * Returns the intercepting element locator if found, null otherwise.
   */
  async checkForInterception(element: Locator): Promise<{ intercepted: boolean; interceptorSelector: string | null; interceptorInfo?: string }> {
    const page = await this.getPage();

    try {
      const box = await element.boundingBox();
      if (!box) {
        return { intercepted: false, interceptorSelector: null };
      }

      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;

      // Get info about element at the click point using coordinates only
      const result = await page.evaluate(([x, y]) => {
        const topElement = document.elementFromPoint(x, y);
        if (!topElement) return { intercepted: false, interceptorInfo: null, interceptorSelector: null };

        // Build a selector for the top element
        let selector = topElement.tagName.toLowerCase();
        if (topElement.id) {
          selector = `#${topElement.id}`;
        } else if (topElement.className && typeof topElement.className === 'string') {
          selector += `.${topElement.className.split(' ')[0]}`;
        }

        // Check if it's a sticky/fixed element (those are the problematic ones)
        const style = getComputedStyle(topElement);
        const isSticky = style.position === 'fixed' || style.position === 'sticky';

        if (!isSticky) {
          // Not a sticky element, let normal click handle it
          return { intercepted: false, interceptorInfo: null, interceptorSelector: null };
        }

        // It's a sticky element - gather info
        const info = {
          tag: topElement.tagName.toLowerCase(),
          id: topElement.id,
          classes: topElement.className,
          position: style.position,
          zIndex: style.zIndex,
          text: topElement.textContent?.slice(0, 50) || '',
        };

        return {
          intercepted: true,
          interceptorSelector: selector,
          interceptorInfo: `${info.tag}${info.id ? '#' + info.id : ''}${info.classes && typeof info.classes === 'string' ? '.' + info.classes.split(' ')[0] : ''} (position: ${info.position}, z-index: ${info.zIndex})`
        };
      }, [centerX, centerY]);

      return {
        intercepted: result.intercepted,
        interceptorSelector: result.interceptorSelector,
        interceptorInfo: result.interceptorInfo || undefined
      };
    } catch {
      // If check fails, assume not intercepted and let normal click try
      return { intercepted: false, interceptorSelector: null };
    }
  }

  /**
   * Find all sticky/fixed positioned elements that could intercept clicks.
   */
  async findStickyElements(): Promise<Array<{ selector: string; position: string; rect: DOMRect }>> {
    const page = await this.getPage();

    return page.evaluate(() => {
      const results: Array<{ selector: string; position: string; rect: DOMRect }> = [];
      const allElements = Array.from(document.querySelectorAll('*'));

      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i];
        const style = getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'sticky') {
          const rect = el.getBoundingClientRect();
          // Only include elements that are visible and have size
          if (rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none') {
            let selector = el.tagName.toLowerCase();
            if (el.id) selector += `#${el.id}`;
            else if (el.className && typeof el.className === 'string') selector += `.${el.className.split(' ')[0]}`;

            results.push({
              selector,
              position: style.position,
              rect: rect.toJSON() as DOMRect,
            });
          }
        }
      }

      return results;
    });
  }

  /**
   * Handle a sticky element intercepting a click by trying multiple strategies.
   */
  async handleStickyInterception(
    element: Locator,
    interceptorSelector: string,
    options: { verbose?: boolean } = {}
  ): Promise<{ success: boolean; strategy?: string; error?: string }> {
    const page = await this.getPage();

    // Strategy 1: Scroll element to viewport center (away from sticky headers/footers)
    try {
      if (options.verbose) console.log('  Trying strategy: scroll to safe zone');

      await element.evaluate((el: Element) => {
        const rect = el.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const targetY = rect.top + window.scrollY - (viewportHeight / 2) + (rect.height / 2);
        window.scrollTo({ top: targetY, behavior: 'instant' });
      });

      await page.waitForTimeout(100);

      // Check if still intercepted
      const recheck = await this.checkForInterception(element);
      if (!recheck.intercepted) {
        await element.click();
        return { success: true, strategy: 'scroll-to-safe-zone' };
      }
    } catch {
      // Continue to next strategy
    }

    // Strategy 2: Temporarily hide the interceptor
    try {
      if (options.verbose) console.log('  Trying strategy: hide interceptor');

      const interceptor = page.locator(interceptorSelector).first();

      // Store original display value and hide
      const originalDisplay = await interceptor.evaluate((el: Element) => {
        const style = (el as HTMLElement).style;
        const original = style.display;
        style.setProperty('display', 'none', 'important');
        return original;
      });

      await page.waitForTimeout(50);

      // Click the element
      await element.click();

      // Restore the interceptor
      await interceptor.evaluate((el: Element, original: string) => {
        (el as HTMLElement).style.display = original;
      }, originalDisplay);

      return { success: true, strategy: 'hide-interceptor' };
    } catch (e) {
      // Try to restore even on failure
      const interceptor = page.locator(interceptorSelector).first();
      await interceptor.evaluate((el: Element) => {
        (el as HTMLElement).style.removeProperty('display');
      }).catch(() => {});
    }

    // Strategy 3: Force JavaScript click (bypasses coordinate-based clicking)
    try {
      if (options.verbose) console.log('  Trying strategy: force JS click');

      await element.evaluate((el: Element) => {
        (el as HTMLElement).click();
      });

      return { success: true, strategy: 'force-js-click' };
    } catch (e) {
      return {
        success: false,
        error: `All strategies failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }
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
  async isElementHidden(element: Locator): Promise<boolean> {
    try {
      const isHidden = await element.evaluate((el: Element) => {
        const style = getComputedStyle(el);

        // Check common hiding methods
        if (style.display === 'none') return true;
        if (style.visibility === 'hidden') return true;
        if (style.opacity === '0') return true;

        // Check for zero dimensions
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return true;

        // Check for off-screen positioning
        if (rect.right < 0 || rect.bottom < 0) return true;
        if (rect.left > window.innerWidth || rect.top > window.innerHeight) return true;

        // Check for clip-path hiding
        if (style.clipPath === 'inset(100%)' || style.clip === 'rect(0, 0, 0, 0)') return true;

        // Check for sr-only / screen-reader-only patterns
        if (style.position === 'absolute' &&
            (parseInt(style.width) === 1 || parseInt(style.height) === 1) &&
            style.overflow === 'hidden') return true;

        return false;
      });

      return isHidden;
    } catch {
      return false;
    }
  }

  /**
   * Find the visible custom dropdown trigger associated with a hidden select.
   * Uses multiple heuristics to locate the clickable UI element.
   */
  async findCustomDropdownTrigger(hiddenSelect: Locator): Promise<Locator | null> {
    const page = await this.getPage();

    try {
      // Get info about the hidden select to help find its trigger
      const selectInfo = await hiddenSelect.evaluate((el: Element) => {
        const select = el as HTMLSelectElement;
        return {
          id: select.id,
          name: select.name,
          parentId: select.parentElement?.id,
          parentClasses: select.parentElement?.className,
          // Check for Alpine.js x-model binding
          xModel: select.getAttribute('x-model'),
          // Check for aria associations
          ariaLabelledBy: select.getAttribute('aria-labelledby'),
        };
      });

      // Strategy 1: Look for adjacent sibling that's visible (common Alpine pattern)
      const adjacentTrigger = await page.evaluate((selectInfo) => {
        let select: Element | null = null;

        // Find the select by various methods
        if (selectInfo.id) {
          select = document.getElementById(selectInfo.id);
        }
        if (!select && selectInfo.name) {
          select = document.querySelector(`select[name="${selectInfo.name}"]`);
        }

        if (!select) return null;

        // Check next sibling
        let sibling = select.nextElementSibling;
        while (sibling) {
          const style = getComputedStyle(sibling);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            // Check if it looks like a dropdown trigger
            const hasClickIndicator = sibling.querySelector('[class*="chevron"], [class*="arrow"], [class*="caret"], svg') !== null;
            const hasRole = sibling.getAttribute('role') === 'button' || sibling.getAttribute('role') === 'combobox';
            const isButton = sibling.tagName === 'BUTTON';
            const hasDropdownClass = /dropdown|select|trigger|toggle/i.test(sibling.className);

            if (hasClickIndicator || hasRole || isButton || hasDropdownClass) {
              // Return a selector for this element
              if (sibling.id) return `#${sibling.id}`;
              if (sibling.className) return `.${sibling.className.split(' ')[0]}`;
              return null;
            }
          }
          sibling = sibling.nextElementSibling;
        }

        return null;
      }, selectInfo);

      if (adjacentTrigger) {
        const trigger = page.locator(adjacentTrigger).first();
        if (await trigger.isVisible()) {
          return trigger;
        }
      }

      // Strategy 2: Look for parent container with click handler/dropdown classes
      const parentTrigger = await page.evaluate((selectInfo) => {
        let select: Element | null = null;

        if (selectInfo.id) {
          select = document.getElementById(selectInfo.id);
        }
        if (!select && selectInfo.name) {
          select = document.querySelector(`select[name="${selectInfo.name}"]`);
        }

        if (!select) return null;

        // Walk up to find a clickable parent container
        let parent = select.parentElement;
        let depth = 0;
        while (parent && depth < 5) {
          const style = getComputedStyle(parent);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            // Check for Alpine x-data (indicates interactive component)
            const hasAlpineData = parent.hasAttribute('x-data');
            const hasDropdownClass = /dropdown|select|combobox|listbox/i.test(parent.className);
            const hasRole = parent.getAttribute('role') === 'combobox' || parent.getAttribute('role') === 'listbox';

            if (hasAlpineData || hasDropdownClass || hasRole) {
              // Look for a visible clickable child
              const clickable = parent.querySelector('button, [role="button"], [tabindex="0"], div[class*="trigger"], div[class*="selected"]');
              if (clickable) {
                const clickableStyle = getComputedStyle(clickable);
                if (clickableStyle.display !== 'none') {
                  if ((clickable as HTMLElement).id) return `#${(clickable as HTMLElement).id}`;
                  if (clickable.className) return `.${clickable.className.split(' ')[0]}`;
                }
              }

              // If parent itself looks clickable
              if (parent.id) return `#${parent.id}`;
              if (parent.className) return `.${parent.className.split(' ')[0]}`;
            }
          }
          parent = parent.parentElement;
          depth++;
        }

        return null;
      }, selectInfo);

      if (parentTrigger) {
        const trigger = page.locator(parentTrigger).first();
        if (await trigger.isVisible()) {
          return trigger;
        }
      }

      // Strategy 3: Look for aria-controls or aria-labelledby relationships
      if (selectInfo.ariaLabelledBy) {
        const trigger = page.locator(`#${selectInfo.ariaLabelledBy}`).first();
        if (await trigger.isVisible()) {
          return trigger;
        }
      }

      // Strategy 4: Find any visible element with matching x-model (Alpine.js)
      if (selectInfo.xModel) {
        const alpineTrigger = await page.evaluate((xModel) => {
          // Look for visible elements with same x-model that aren't the select
          const elements = Array.from(document.querySelectorAll(`[x-model="${xModel}"], [\\@click*="${xModel}"]`));
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
            if (el.tagName !== 'SELECT') {
              const style = getComputedStyle(el);
              if (style.display !== 'none' && style.visibility !== 'hidden') {
                if (el.id) return `#${el.id}`;
                if (el.className) return `.${el.className.split(' ')[0]}`;
              }
            }
          }
          return null;
        }, selectInfo.xModel);

        if (alpineTrigger) {
          const trigger = page.locator(alpineTrigger).first();
          if (await trigger.isVisible()) {
            return trigger;
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Find and select an option in a custom dropdown.
   * Opens the dropdown, waits for options, and clicks the target option.
   */
  async selectCustomDropdownOption(
    trigger: Locator,
    optionValue: string,
    options: { timeout?: number; verbose?: boolean } = {}
  ): Promise<{ success: boolean; strategy?: string; error?: string }> {
    const page = await this.getPage();
    const _timeout = options.timeout ?? 5000;

    try {
      // Click the trigger to open the dropdown
      if (options.verbose) console.log(`  Opening dropdown by clicking trigger`);
      await trigger.click();

      // Wait for dropdown options to appear
      // Try multiple common patterns for option containers
      const _optionSelectors = [
        // Alpine.js / Headless UI patterns
        '[x-show]:not([x-show="false"])',
        '[role="listbox"]',
        '[role="menu"]',
        '[role="option"]',
        // Common class patterns
        '[class*="dropdown-menu"]:not([class*="hidden"])',
        '[class*="select-options"]',
        '[class*="listbox-options"]',
        '[class*="menu-items"]',
        // Generic visible dropdown
        '.dropdown-content:visible',
        '.dropdown-options',
        // React Select patterns
        '[class*="menu"]',
        '[class*="MenuList"]',
      ];

      await page.waitForTimeout(200); // Brief wait for animation

      // Find the option with matching text
      if (options.verbose) console.log(`  Looking for option: "${optionValue}"`);

      // Strategy 1: Find by exact text match
      const optionByText = page.getByRole('option', { name: optionValue });
      if (await optionByText.isVisible({ timeout: 500 }).catch(() => false)) {
        await optionByText.click();
        return { success: true, strategy: 'role-option-exact' };
      }

      // Strategy 2: Find by partial text match in role=option
      const optionByPartial = page.locator('[role="option"]').filter({ hasText: optionValue }).first();
      if (await optionByPartial.isVisible({ timeout: 500 }).catch(() => false)) {
        await optionByPartial.click();
        return { success: true, strategy: 'role-option-partial' };
      }

      // Strategy 3: Find by li elements (common dropdown pattern)
      const liOption = page.locator('li').filter({ hasText: optionValue }).first();
      if (await liOption.isVisible({ timeout: 500 }).catch(() => false)) {
        await liOption.click();
        return { success: true, strategy: 'li-element' };
      }

      // Strategy 4: Find any clickable element with the text
      const anyOption = page.locator(`text="${optionValue}"`).first();
      if (await anyOption.isVisible({ timeout: 500 }).catch(() => false)) {
        await anyOption.click();
        return { success: true, strategy: 'text-match' };
      }

      // Strategy 5: Find by data-value attribute
      const dataValueOption = page.locator(`[data-value="${optionValue}"], [value="${optionValue}"]`).first();
      if (await dataValueOption.isVisible({ timeout: 500 }).catch(() => false)) {
        await dataValueOption.click();
        return { success: true, strategy: 'data-value' };
      }

      // If we couldn't find the option, close dropdown and report
      await page.keyboard.press('Escape');

      return {
        success: false,
        error: `Could not find option "${optionValue}" in dropdown`
      };

    } catch (e) {
      // Try to close any open dropdown
      await page.keyboard.press('Escape').catch(() => {});

      return {
        success: false,
        error: `Custom dropdown selection failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }

  /**
   * Handle filling a custom dropdown (hidden select with custom UI).
   * Automatically detects and interacts with the visible dropdown component.
   */
  async handleCustomDropdown(
    hiddenSelect: Locator,
    value: string,
    options: { verbose?: boolean } = {}
  ): Promise<{ success: boolean; strategy?: string; error?: string }> {
    if (options.verbose) console.log(`  Detected hidden select, looking for custom dropdown trigger`);

    // Find the visible trigger element
    const trigger = await this.findCustomDropdownTrigger(hiddenSelect);

    if (!trigger) {
      return {
        success: false,
        error: 'Could not find custom dropdown trigger for hidden select'
      };
    }

    if (options.verbose) console.log(`  Found dropdown trigger`);

    // Try to select the option
    const result = await this.selectCustomDropdownOption(trigger, value, options);

    return result;
  }

  /**
   * Find the best click candidate from multiple matches.
   * Prioritizes: exact text match > non-sticky elements > shorter text (closer match)
   */
  private async findBestClickCandidate(locator: Locator, searchText: string): Promise<Locator | null> {
    const count = await locator.count();

    if (count === 0) return null;
    if (count === 1) return locator.first();

    // Score each candidate
    const candidates: Array<{ index: number; score: number }> = [];
    const searchLower = searchText.toLowerCase();

    for (let i = 0; i < count; i++) {
      const el = locator.nth(i);
      let score = 0;

      try {
        const info = await el.evaluate((element: Element, search: string) => {
          const text = element.textContent?.trim() || '';

          // Check if element is in a sticky/fixed container
          let inStickyContainer = false;
          let parent: Element | null = element;
          while (parent) {
            const parentStyle = getComputedStyle(parent);
            if (parentStyle.position === 'fixed' || parentStyle.position === 'sticky') {
              inStickyContainer = true;
              break;
            }
            parent = parent.parentElement;
          }

          // Check for exact text match vs partial
          const textLower = text.toLowerCase();
          const isExactMatch = textLower === search.toLowerCase();
          const isPartialMatch = textLower.includes(search.toLowerCase());

          // Get element role/type info
          const tagName = element.tagName.toLowerCase();
          const role = element.getAttribute('role');
          const isInteractive = ['button', 'a', 'input', 'select'].includes(tagName) ||
                               ['button', 'link', 'option'].includes(role || '');

          return {
            text,
            textLength: text.length,
            inStickyContainer,
            isExactMatch,
            isPartialMatch,
            isInteractive,
          };
        }, searchLower);

        // Scoring:
        // +100: exact text match
        // +50: not in sticky container
        // +20: is interactive element
        // -1 per extra character (prefer shorter matches)

        if (info.isExactMatch) score += 100;
        if (!info.inStickyContainer) score += 50;
        if (info.isInteractive) score += 20;
        score -= Math.abs(info.textLength - searchText.length);

        candidates.push({ index: i, score });
      } catch {
        // If evaluation fails, give low score
        candidates.push({ index: i, score: -1000 });
      }
    }

    // Sort by score descending and return the best match
    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length > 0 && candidates[0].score > -1000) {
      return locator.nth(candidates[0].index);
    }

    return locator.first();
  }

  /**
   * Hover then click - useful for dropdown menus that need hover to reveal items.
   * ALWAYS hovers the parent menu and keeps it hovered while clicking the submenu item.
   */
  async hoverClick(
    selector: string,
    options: { force?: boolean; hoverParent?: string } = {}
  ): Promise<ClickResult> {
    const page = await this.getPage();

    try {
      // STEP 1: Detect the likely parent menu from selector text
      // e.g., "International Admissions" → parent is likely "Admissions"
      const selectorWords = selector.split(/\s+/);
      const possibleParents = [
        // Last word is often the parent menu name
        selectorWords[selectorWords.length - 1],
        // Common menu words
        ...selectorWords.filter(w =>
          ['Admissions', 'Academics', 'About', 'Resources', 'Campus', 'Student', 'Apply'].includes(w)
        ),
      ];

      // STEP 2: Find and hover the parent menu trigger
      let parentHovered = false;

      if (options.hoverParent) {
        await this.hover(options.hoverParent);
        await page.waitForTimeout(400);
        parentHovered = true;
      } else {
        for (const parentName of possibleParents) {
          if (!parentName || parentName.length < 3) continue;

          // Find the parent menu trigger
          const parentSelectors = [
            `nav a:text-is("${parentName}")`,
            `header a:text-is("${parentName}")`,
            `[role="menubar"] a:text-is("${parentName}")`,
            `nav button:text-is("${parentName}")`,
            `.nav-link:text-is("${parentName}")`,
          ];

          for (const ps of parentSelectors) {
            try {
              const parentEl = await page.$(ps);
              if (parentEl) {
                await parentEl.hover();
                await page.waitForTimeout(500); // Wait for dropdown animation
                parentHovered = true;
                break;
              }
            } catch {
              // Continue
            }
          }
          if (parentHovered) break;
        }
      }

      // STEP 3: While parent is hovered, find the target element
      const element = await this.findElement(selector);

      if (!element) {
        // If not found, try generic nav hovering
        if (!parentHovered) {
          const navItems = await page.$$('nav > ul > li > a, [role="menubar"] > li > a');
          for (const item of navItems.slice(0, 8)) {
            try {
              await item.hover();
              await page.waitForTimeout(400);
              const found = await this.findElement(selector);
              if (found) {
                await found.click();
                await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
                this.audit("hoverClick", selector, "yellow", "success");
                return {
                  success: true,
                  screenshot: await this.screenshot(),
                  message: `Hover-clicked (nav scan): ${selector}`,
                };
              }
            } catch {
              // Continue
            }
          }
        }

        return {
          success: false,
          screenshot: await this.screenshot(),
          message: `Element not found after hover attempts: ${selector}`,
        };
      }

      // STEP 4: Click the element (parent should still be hovered)
      await element.click();
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

      this.audit("hoverClick", selector, "yellow", "success");

      return {
        success: true,
        screenshot: await this.screenshot(),
        message: `Hover-clicked: ${selector}`,
      };
    } catch (error) {
      this.audit("hoverClick", selector, "yellow", "failure");

      return {
        success: false,
        screenshot: await this.screenshot(),
        message: `Failed to hover-click: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Fill a form field.
   */
  async fill(selector: string, value: string, options: { verbose?: boolean; debugDir?: string } = {}): Promise<ClickResult> {
    const page = await this.getPage();

    try {
      // v16.11.0: Use findFillableElement to prioritize input/textarea/select over text matches
      const element = await this.findFillableElement(selector);

      if (!element) {
        const available = await this.getAvailableInputs(page);
        const aiSuggestion = this.generateFillSuggestion(selector, available);
        const result: ClickResult = {
          success: false,
          screenshot: await this.screenshot(),
          message: `Element not found: ${selector}`,
          availableInputs: available,
          aiSuggestion,
        };

        if (options.verbose) {
          result.debugScreenshot = await this.captureDebugScreenshot(page, {
            availableSelectors: available.map(e => e.selector),
            attemptedSelector: selector,
            debugDir: options.debugDir,
          });
        }

        return result;
      }

      // Check if the element is hidden (custom dropdown/input pattern)
      const isHidden = await this.isElementHidden(element);

      if (isHidden) {
        if (options.verbose) console.log(`  Element "${selector}" is hidden, checking for custom UI component`);

        // Get the tag name to determine handling strategy
        const tagName = await element.evaluate((el: Element) => el.tagName.toLowerCase());

        if (tagName === 'select') {
          // Hidden select with custom dropdown UI
          const customResult = await this.handleCustomDropdown(element, value, options);

          if (customResult.success) {
            this.audit("fill", `${selector} (custom-dropdown:${customResult.strategy})`, "yellow", "success");
            this.lastFilledInputSelector = selector;
            return {
              success: true,
              screenshot: await this.screenshot(),
              message: `Filled custom dropdown: ${selector} (strategy: ${customResult.strategy})`,
            };
          } else {
            // Fall through to try standard fill anyway
            if (options.verbose) console.log(`  Custom dropdown handling failed: ${customResult.error}`);
          }
        } else if (tagName === 'input') {
          // Hidden input - might be part of autocomplete, datepicker, etc.
          const customResult = await this.handleCustomInput(element, value, options);

          if (customResult.success) {
            this.audit("fill", `${selector} (custom-input:${customResult.strategy})`, "yellow", "success");
            this.lastFilledInputSelector = selector;
            return {
              success: true,
              screenshot: await this.screenshot(),
              message: `Filled custom input: ${selector} (strategy: ${customResult.strategy})`,
            };
          }
        }
      }

      // Check if this is a select element - requires selectOption instead of fill
      const tagName = await element.evaluate((el: Element) => el.tagName.toLowerCase());

      if (tagName === 'select') {
        // For select elements, use selectOption
        // Try to match by label text first, then by value
        try {
          await element.selectOption({ label: value });
        } catch {
          // If label match fails, try value match
          try {
            await element.selectOption({ value: value });
          } catch {
            // Try partial/case-insensitive label match
            const options = await element.evaluate((el: Element) => {
              const select = el as HTMLSelectElement;
              return Array.from(select.options).map(o => ({
                value: o.value,
                text: o.text,
              }));
            });

            const match = options.find(o =>
              o.text.toLowerCase().includes(value.toLowerCase()) ||
              o.value.toLowerCase().includes(value.toLowerCase())
            );

            if (match) {
              await element.selectOption({ value: match.value });
            } else {
              throw new Error(`No option matching "${value}" in select. Available: ${options.map(o => o.text).join(', ')}`);
            }
          }
        }

        this.audit("fill", `${selector} (select)`, "yellow", "success");
        this.lastFilledInputSelector = selector;

        return {
          success: true,
          screenshot: await this.screenshot(),
          message: `Selected: ${value} in ${selector}`,
        };
      }

      // Standard fill - works for visible inputs and textareas
      await element.fill(value);

      this.audit("fill", selector, "yellow", "success");

      // Track last filled input for Enter key fallback when submit buttons are hidden
      this.lastFilledInputSelector = selector;

      return {
        success: true,
        screenshot: await this.screenshot(),
        message: `Filled: ${selector}`,
      };
    } catch (error) {
      this.audit("fill", selector, "yellow", "failure");

      const result: ClickResult = {
        success: false,
        screenshot: await this.screenshot(),
        message: `Failed to fill: ${error instanceof Error ? error.message : String(error)}`,
      };

      const available = await this.getAvailableInputs(page);
      result.availableInputs = available;
      result.aiSuggestion = this.generateFillSuggestion(selector, available);
      if (options.verbose) {
        result.debugScreenshot = await this.captureDebugScreenshot(page, {
          availableSelectors: available.map(e => e.selector),
          attemptedSelector: selector,
          debugDir: options.debugDir,
        });
      }

      return result;
    }
  }

  /**
   * Handle filling a custom input (hidden input with custom UI).
   * Handles autocomplete, datepickers, custom text inputs, etc.
   */
  async handleCustomInput(
    hiddenInput: Locator,
    value: string,
    _options: { verbose?: boolean } = {}
  ): Promise<{ success: boolean; strategy?: string; error?: string }> {
    const page = await this.getPage();

    try {
      // Get input info to help find its visible counterpart
      const inputInfo = await hiddenInput.evaluate((el: Element) => {
        const input = el as HTMLInputElement;
        return {
          id: input.id,
          name: input.name,
          type: input.type,
          ariaLabelledBy: input.getAttribute('aria-labelledby'),
          xModel: input.getAttribute('x-model'),
        };
      });

      // Strategy 1: Look for visible sibling input or wrapper
      const adjacentVisible = await page.evaluate((inputInfo) => {
        let input: Element | null = null;

        if (inputInfo.id) input = document.getElementById(inputInfo.id);
        if (!input && inputInfo.name) input = document.querySelector(`input[name="${inputInfo.name}"]`);

        if (!input) return null;

        // Check parent container for visible input
        const parent = input.closest('[x-data], .form-group, .input-wrapper, .field-container');
        if (parent) {
          const visibleInputs = Array.from(parent.querySelectorAll('input:not([type="hidden"])'));
          for (let i = 0; i < visibleInputs.length; i++) {
            const vi = visibleInputs[i] as HTMLInputElement;
            const style = getComputedStyle(vi);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
              if (vi.id) return { selector: `#${vi.id}`, type: 'visible-input' };
              if (vi.name) return { selector: `input[name="${vi.name}"]`, type: 'visible-input' };
            }
          }

          // Check for text display element that might be the "face" of a custom input
          const textDisplay = parent.querySelector('[contenteditable="true"], .editable, .input-display');
          if (textDisplay) {
            const style = getComputedStyle(textDisplay);
            if (style.display !== 'none') {
              if (textDisplay.id) return { selector: `#${textDisplay.id}`, type: 'contenteditable' };
            }
          }
        }

        return null;
      }, inputInfo);

      if (adjacentVisible) {
        if (adjacentVisible.type === 'visible-input') {
          const visibleInput = page.locator(adjacentVisible.selector).first();
          await visibleInput.fill(value);
          return { success: true, strategy: 'visible-sibling-input' };
        } else if (adjacentVisible.type === 'contenteditable') {
          const editableEl = page.locator(adjacentVisible.selector).first();
          await editableEl.click();
          await editableEl.fill(value);
          return { success: true, strategy: 'contenteditable' };
        }
      }

      // Strategy 2: For datepickers, try clicking the wrapper and typing
      if (inputInfo.type === 'date' || inputInfo.type === 'datetime-local' || inputInfo.type === 'time') {
        const wrapper = await page.evaluate((inputInfo) => {
          let input: Element | null = null;
          if (inputInfo.id) input = document.getElementById(inputInfo.id);
          if (!input && inputInfo.name) input = document.querySelector(`input[name="${inputInfo.name}"]`);
          if (!input) return null;

          const parent = input.closest('.datepicker, .date-input, [class*="picker"]');
          if (parent) {
            if ((parent as HTMLElement).id) return `#${(parent as HTMLElement).id}`;
          }
          return null;
        }, inputInfo);

        if (wrapper) {
          const wrapperEl = page.locator(wrapper).first();
          await wrapperEl.click();
          await page.keyboard.type(value);
          return { success: true, strategy: 'datepicker-type' };
        }
      }

      // Strategy 3: Set value directly via JavaScript (last resort)
      // v14.3.0: Use native setter + InputEvent for React compatibility
      // v17.4.1: Enhanced event dispatch for jQuery/vanilla JS compatibility
      await hiddenInput.evaluate((el: Element, val: string) => {
        const input = el as HTMLInputElement;

        // Focus the element first (required for many event listeners)
        input.focus();
        el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
        el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

        // Clear existing value
        input.value = '';

        // Get the native value setter to bypass React's synthetic property
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set;
        const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        )?.set;

        // Use native setter if available (required for React state sync)
        if (input.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
          nativeTextAreaValueSetter.call(input, val);
        } else if (nativeInputValueSetter) {
          nativeInputValueSetter.call(input, val);
        } else {
          input.value = val;
        }

        // Dispatch comprehensive events for framework compatibility
        // 1. KeyboardEvents (jQuery and vanilla JS often listen to these)
        const lastChar = val.slice(-1);
        const keyboardEventInit = {
          bubbles: true,
          cancelable: true,
          key: lastChar,
          code: `Key${lastChar.toUpperCase()}`,
          keyCode: lastChar.charCodeAt(0),
          which: lastChar.charCodeAt(0),
        };
        el.dispatchEvent(new KeyboardEvent('keydown', keyboardEventInit));
        el.dispatchEvent(new KeyboardEvent('keypress', keyboardEventInit));
        el.dispatchEvent(new KeyboardEvent('keyup', keyboardEventInit));

        // 2. InputEvent (React and modern frameworks)
        el.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: val
        }));

        // 3. Change event (form validation, jQuery .change())
        el.dispatchEvent(new Event('change', { bubbles: true }));

        // 4. Blur events (trigger validation on blur)
        el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
        el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      }, value);

      return { success: true, strategy: 'js-value-set' };

    } catch (e) {
      return {
        success: false,
        error: `Custom input handling failed: ${e instanceof Error ? e.message : String(e)}`
      };
    }
  }

  // =========================================================================
  // Tier 5: Smart Retry (v5.0.0)
  // =========================================================================

  /**
   * Click with smart retry - automatically retries with alternative selectors on failure.
   * v11.8.0: Added confidence gating - only reports success if confidence >= minConfidence
   */
  async smartClick(
    selector: string,
    options: { force?: boolean; maxRetries?: number; retryDelay?: number; dismissOverlays?: boolean; minConfidence?: number } = {}
  ): Promise<SmartRetryResult> {
    const maxRetries = options.maxRetries ?? 3;
    const retryDelay = options.retryDelay ?? 1000;
    const minConfidence = options.minConfidence ?? 0.8; // v11.11.0: Raised from 0.6 to 0.8 (stress test fix)
    const attempts: RetryAttempt[] = [];

    // Dismiss overlays first if requested
    if (options.dismissOverlays) {
      await this.dismissOverlay({ type: "auto", timeout: 3000 });
    }

    // First attempt with original selector
    let result = await this.click(selector, { force: options.force });
    attempts.push({
      attempt: 1,
      selector,
      success: result.success,
      error: result.success ? undefined : result.message,
      screenshot: result.screenshot,
    });

    if (result.success) {
      return {
        success: true,
        attempts,
        finalSelector: selector,
        message: result.message,
        screenshot: result.screenshot,
      };
    }

    // Try to find alternative selectors
    const alternatives = await this.findAlternativeSelectors(selector);

    for (let i = 0; i < Math.min(maxRetries - 1, alternatives.length); i++) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));

      const alt = alternatives[i];
      result = await this.click(alt.selector, { force: options.force });

      attempts.push({
        attempt: i + 2,
        selector: alt.selector,
        success: result.success,
        error: result.success ? undefined : result.message,
        alternativeUsed: alt.reason,
        screenshot: result.screenshot,
      });

      if (result.success) {
        // v11.8.0: Gate success on confidence threshold
        const meetsConfidence = alt.confidence >= minConfidence;

        if (meetsConfidence) {
          // Cache the working alternative for future use
          this.cacheAlternativeSelector(selector, alt.selector);
        }

        return {
          success: meetsConfidence, // v11.8.0: Only success if confidence meets threshold
          attempts,
          finalSelector: alt.selector,
          message: meetsConfidence
            ? `Clicked using alternative: ${alt.reason}`
            : `Clicked element with low confidence (${(alt.confidence * 100).toFixed(0)}%) - may not be the intended target`,
          screenshot: result.screenshot,
          confidence: alt.confidence,
          healed: true,
          healReason: alt.reason,
        };
      }
    }

    // All attempts failed - provide AI suggestion
    const aiSuggestion = await this.analyzeFailure(selector, attempts);

    return {
      success: false,
      attempts,
      message: `Failed after ${attempts.length} attempts`,
      screenshot: result.screenshot,
      aiSuggestion,
    };
  }

  // =========================================================================
  // Overlay Detection & Dismissal (v7.4.14)
  // Delegated to OverlayHandler module for maintainability
  // =========================================================================

  /**
   * Detect and dismiss overlays (cookie consent, age verification, newsletter popups).
   * Constitutional safety: Yellow zone - logs all dismissed overlays.
   */
  async dismissOverlay(options: DismissOverlayOptions = { type: "auto" }): Promise<DismissOverlayResult> {
    const page = await this.getPage();
    const result = await this.overlayHandler.dismissOverlays(
      page,
      options,
      () => this.screenshot()
    );

    // Log dismissed overlays to audit trail
    for (const detail of result.details) {
      if (detail.dismissed) {
        this.audit("dismiss-overlay", detail.selector, "yellow", "success");
      }
    }

    return result;
  }

  /**
   * Find alternative selectors for an element.
   */
  private async findAlternativeSelectors(originalSelector: string): Promise<SelectorAlternative[]> {
    const page = await this.getPage();
    const alternatives: SelectorAlternative[] = [];

    // v10.10.0: Tokenize selector for better word-level matching
    const selectorLower = originalSelector.toLowerCase();
    const selectorWords = selectorLower
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !["the", "a", "an", "to", "for", "of", "in", "on"].includes(w));

    try {
      // Try to find elements with similar text
      const elements = await page.$$('button, a, [role="button"], input[type="submit"]');

      for (const el of elements.slice(0, 20)) {
        const text = await el.textContent().catch(() => "");
        const ariaLabel = await el.getAttribute("aria-label").catch(() => "");
        const title = await el.getAttribute("title").catch(() => "");
        const id = await el.getAttribute("id").catch(() => "");
        const href = await el.getAttribute("href").catch(() => "");

        const textLower = (text || "").toLowerCase().trim();
        const ariaLower = (ariaLabel || "").toLowerCase();

        // v10.10.0: Bidirectional word-level matching for text
        if (textLower) {
          const textWords = textLower.replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
          const matchingWords = selectorWords.filter(sw => textWords.some(tw => tw.includes(sw) || sw.includes(tw)));
          const matchRatio = selectorWords.length > 0 ? matchingWords.length / selectorWords.length : 0;

          // Also check if text IS a word in the selector (e.g., "submit" in "submit a story")
          const exactWordMatch = selectorWords.includes(textLower);

          if (matchRatio >= 0.5 || exactWordMatch || selectorLower.includes(textLower)) {
            // v10.10.0: Use plain text (not text="...") since findElement uses getByText
            const textTrimmed = text?.trim() || "";
            alternatives.push({
              selector: textTrimmed,
              confidence: exactWordMatch ? 0.9 : matchRatio >= 0.7 ? 0.85 : 0.75,
              reason: `Text match: "${textTrimmed}"`,
            });
          }
        }

        // Check aria-label with word matching
        if (ariaLower) {
          const ariaWords = ariaLower.replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
          const matchingWords = selectorWords.filter(sw => ariaWords.some(aw => aw.includes(sw) || sw.includes(aw)));
          const matchRatio = selectorWords.length > 0 ? matchingWords.length / selectorWords.length : 0;

          if (matchRatio >= 0.5 || selectorLower.includes(ariaLower)) {
            // CSS selector works with findElement's Strategy 7
            alternatives.push({
              selector: `css:[aria-label="${ariaLabel}"]`,
              confidence: 0.9,
              reason: `Aria-label: "${ariaLabel}"`,
            });
          }
        }

        // Check title attribute
        if (title && selectorLower.includes(title.toLowerCase())) {
          alternatives.push({
            selector: `css:[title="${title}"]`,
            confidence: 0.85,
            reason: `Title: "${title}"`,
          });
        }

        // Check id
        if (id && selectorLower.includes(id.toLowerCase())) {
          alternatives.push({
            selector: `css:#${id}`,
            confidence: 0.95,
            reason: `ID match: #${id}`,
          });
        }

        // v10.10.0: Check href for link selectors
        // v11.11.0: Require at least 2 matching words to avoid false positives (stress test fix)
        if (href && selectorWords.length >= 2) {
          const hrefLower = href.toLowerCase();
          const matchingHrefWords = selectorWords.filter(w => hrefLower.includes(w));
          // Only match if at least 50% of selector words are in href
          if (matchingHrefWords.length >= Math.max(2, selectorWords.length * 0.5)) {
            alternatives.push({
              selector: `css:a[href*="${href.slice(0, 50)}"]`,
              confidence: 0.7,
              reason: `Href match: ${href.slice(0, 30)}...`,
            });
          }
        }
      }

      // Sort by confidence
      alternatives.sort((a, b) => b.confidence - a.confidence);

    } catch {
      // Ignore errors in alternative finding
    }

    return alternatives.slice(0, 5);
  }

  // =========================================================================
  // Tier 5: Self-Healing Selector Cache (v5.0.0)
  // Delegated to SelectorCache module for maintainability
  // =========================================================================

  /**
   * Get current page domain for cache key generation.
   */
  private getCurrentDomain(): string {
    try {
      if (this.page) {
        const url = this.page.url();
        return new URL(url).hostname;
      }
    } catch {
      // Ignore
    }
    return "unknown";
  }

  /**
   * Sync the current domain to the selector cache manager.
   */
  private syncCacheDomain(): void {
    this.selectorCacheManager.setCurrentDomain(this.getCurrentDomain());
  }

  /**
   * Cache a working alternative selector for future use.
   */
  private cacheAlternativeSelector(original: string, working: string, reason: string = "Alternative found"): void {
    this.syncCacheDomain();
    this.selectorCacheManager.cacheAlternative(original, working, reason);
  }

  /**
   * Get a cached alternative selector if available.
   */
  private getCachedSelector(original: string): SelectorCacheEntry | null {
    this.syncCacheDomain();
    return this.selectorCacheManager.getCached(original);
  }

  /**
   * Update cache entry statistics.
   */
  private updateCacheStats(original: string, success: boolean): void {
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
  async generateTests(url?: string): Promise<TestGenerationResult> {
    if (url) {
      await this.navigate(url);
    }

    const page = await this.getPage();
    const analysis = await this.analyzePage();
    const tests = this.generateTestScenarios(analysis);

    return {
      url: page.url(),
      analysis,
      tests,
      cbrowserScript: this.generateCBrowserScript(tests, page.url()),
      playwrightCode: this.generatePlaywrightCode(tests, page.url()),
    };
  }

  /**
   * Analyze page structure for testable elements.
   */
  async analyzePage(): Promise<PageAnalysis> {
    const page = await this.getPage();

    const analysis = await page.evaluate(() => {
      const getSelector = (el: Element): string => {
        if (el.id) return `#${el.id}`;
        if (el.getAttribute("data-testid")) return `[data-testid="${el.getAttribute("data-testid")}"]`;
        if (el.getAttribute("name")) return `[name="${el.getAttribute("name")}"]`;
        const text = el.textContent?.trim().substring(0, 30);
        if (text) return `text="${text}"`;
        return el.tagName.toLowerCase();
      };

      // Analyze forms
      const forms: FormAnalysis[] = Array.from(document.querySelectorAll("form")).map(form => {
        const fields: PageElement[] = Array.from(form.querySelectorAll("input, select, textarea")).map(el => ({
          type: el.tagName.toLowerCase() as PageElement["type"],
          selector: getSelector(el),
          name: el.getAttribute("name") || undefined,
          id: el.id || undefined,
          placeholder: (el as HTMLInputElement).placeholder || undefined,
          inputType: (el as HTMLInputElement).type || undefined,
          required: (el as HTMLInputElement).required || false,
          ariaLabel: el.getAttribute("aria-label") || undefined,
        }));

        const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
        const submitButton = submitBtn ? {
          type: "button" as const,
          selector: getSelector(submitBtn),
          text: submitBtn.textContent?.trim(),
        } : undefined;

        // v11.9.0: Enhanced form purpose detection (issue #89)
        // v14.2.4: Added newsletter, subscription, booking, comment form detection
        let purpose: FormAnalysis["purpose"] = "unknown";
        const formHtml = form.innerHTML.toLowerCase();
        const formClass = (form.className || '').toLowerCase();
        const formId = (form.id || '').toLowerCase();
        const hasPasswordField = !!form.querySelector('input[type="password"]');
        const hasEmailField = !!form.querySelector('input[type="email"]');
        const hasUsernameField = !!form.querySelector('[name*="user" i], [name*="login" i], [placeholder*="user" i], [placeholder*="login" i]');
        const hasSearchField = !!form.querySelector('input[type="search"], [name*="search" i], [placeholder*="search" i], [role="search"]');

        // Login: has password field + (email OR username field) + few fields
        if (hasPasswordField && (hasEmailField || hasUsernameField || formHtml.includes("sign in") || formHtml.includes("log in"))) {
          purpose = fields.length <= 4 ? "login" : "signup";
        } else if (hasPasswordField && formHtml.includes("password") && !formHtml.includes("confirm")) {
          // Single password field with no confirm = likely login
          purpose = fields.length <= 3 ? "login" : "signup";
        } else if (hasSearchField || formHtml.includes("search")) {
          purpose = "search";
        } else if (formHtml.includes("contact") || formHtml.includes("message") || formHtml.includes("feedback") || formHtml.includes("inquiry")) {
          purpose = "contact";
        } else if (formHtml.includes("card") || formHtml.includes("payment") || formHtml.includes("checkout") || formHtml.includes("billing")) {
          purpose = "checkout";
        } else if (formHtml.includes("register") || formHtml.includes("sign up") || formHtml.includes("create account")) {
          purpose = "signup";
        } else if (
          // v14.2.4: Newsletter/subscription detection
          formHtml.includes("newsletter") || formHtml.includes("subscribe") || formHtml.includes("subscription") ||
          formHtml.includes("mailing list") || formHtml.includes("email updates") || formHtml.includes("stay updated") ||
          formClass.includes("newsletter") || formClass.includes("subscribe") ||
          formId.includes("newsletter") || formId.includes("subscribe")
        ) {
          purpose = "newsletter" as FormAnalysis["purpose"];
        } else if (
          // v14.2.4: Comment form detection
          formHtml.includes("comment") || formHtml.includes("reply") || formHtml.includes("leave a comment") ||
          formClass.includes("comment") || formId.includes("comment")
        ) {
          purpose = "comment" as FormAnalysis["purpose"];
        } else if (
          // v14.2.4: Booking/reservation detection
          formHtml.includes("book") || formHtml.includes("reservation") || formHtml.includes("schedule") ||
          formHtml.includes("appointment") || formHtml.includes("check-in") || formHtml.includes("check-out") ||
          form.querySelector('input[type="date"]')
        ) {
          purpose = "booking" as FormAnalysis["purpose"];
        } else if (
          // v14.2.4: Profile/settings form detection
          formHtml.includes("profile") || formHtml.includes("settings") || formHtml.includes("preferences") ||
          formHtml.includes("update your") || formHtml.includes("edit your")
        ) {
          purpose = "profile" as FormAnalysis["purpose"];
        } else if (hasEmailField && fields.length <= 2) {
          // Single email field form is likely newsletter
          purpose = "newsletter" as FormAnalysis["purpose"];
        }

        return {
          action: form.action || undefined,
          method: form.method || undefined,
          fields,
          submitButton,
          purpose,
        };
      });

      // Analyze buttons
      const buttons: PageElement[] = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"]'))
        .slice(0, 20)
        .map(el => ({
          type: "button" as const,
          selector: getSelector(el),
          text: el.textContent?.trim(),
          id: el.id || undefined,
          ariaLabel: el.getAttribute("aria-label") || undefined,
        }));

      // Analyze links
      const links: PageElement[] = Array.from(document.querySelectorAll("a[href]"))
        .slice(0, 20)
        .map(el => ({
          type: "link" as const,
          selector: getSelector(el),
          text: el.textContent?.trim(),
          href: (el as HTMLAnchorElement).href,
        }));

      // Analyze standalone inputs
      const inputs: PageElement[] = Array.from(document.querySelectorAll("input:not(form input), textarea:not(form textarea)"))
        .slice(0, 10)
        .map(el => ({
          type: "input" as const,
          selector: getSelector(el),
          name: el.getAttribute("name") || undefined,
          placeholder: (el as HTMLInputElement).placeholder || undefined,
          inputType: (el as HTMLInputElement).type || undefined,
        }));

      // Analyze selects
      const selects: PageElement[] = Array.from(document.querySelectorAll("select"))
        .slice(0, 10)
        .map(el => ({
          type: "select" as const,
          selector: getSelector(el),
          name: el.getAttribute("name") || undefined,
          id: el.id || undefined,
        }));

      return {
        url: window.location.href,
        title: document.title,
        forms,
        buttons,
        links,
        inputs,
        selects,
        hasLogin: forms.some(f => f.purpose === "login"),
        hasSearch: forms.some(f => f.purpose === "search") ||
            inputs.some(i => i.inputType === "search") ||
            !!document.querySelector('[role="search"]') ||
            !!document.querySelector('input[placeholder*="search" i], input[placeholder*="Search" i]') ||
            !!document.querySelector('input[aria-label*="search" i], input[aria-label*="Search" i]'),
        hasNavigation: links.filter(l => l.href?.startsWith(window.location.origin)).length > 3,
      };
    });

    return analysis;
  }

  /**
   * Generate test scenarios from page analysis.
   */
  private generateTestScenarios(analysis: PageAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // Generate form tests
    for (const form of analysis.forms) {
      if (form.purpose === "login") {
        tests.push({
          name: "Login Form Submission",
          description: "Test the login form with valid credentials",
          steps: [
            { action: "navigate", target: analysis.url, description: "Navigate to page" },
            ...form.fields.filter(f => f.inputType !== "submit").map(f => ({
              action: "fill" as const,
              target: f.selector,
              value: f.inputType === "email" ? "test@example.com" : f.inputType === "password" ? "TestPassword123" : "test value",
              description: `Fill ${f.name || f.placeholder || "field"}`,
            })),
            { action: "click", target: form.submitButton?.selector || "Submit", description: "Submit form" },
            { action: "wait", value: "1000", description: "Wait for response" },
          ],
          assertions: ["url contains '/dashboard' OR url contains '/home'", "page does not contain 'error'"],
        });

        tests.push({
          name: "Login Form Validation",
          description: "Test login form with invalid credentials",
          steps: [
            { action: "navigate", target: analysis.url, description: "Navigate to page" },
            { action: "fill", target: form.fields.find(f => f.inputType === "email")?.selector || "", value: "invalid", description: "Enter invalid email" },
            { action: "click", target: form.submitButton?.selector || "Submit", description: "Submit form" },
          ],
          assertions: ["page contains 'error' OR page contains 'invalid'"],
        });
      }

      if (form.purpose === "search") {
        tests.push({
          name: "Search Functionality",
          description: "Test search with a query",
          steps: [
            { action: "navigate", target: analysis.url, description: "Navigate to page" },
            { action: "fill", target: form.fields[0]?.selector || "[type='search']", value: "test query", description: "Enter search term" },
            { action: "click", target: form.submitButton?.selector || "Search", description: "Submit search" },
          ],
          assertions: ["url contains 'search' OR url contains 'q='", "page contains 'result'"],
        });
      }
    }

    // Generate navigation tests
    if (analysis.hasNavigation) {
      const navLinks = analysis.links.filter(l => l.href?.startsWith(analysis.url.split("/").slice(0, 3).join("/")));
      if (navLinks.length > 0) {
        tests.push({
          name: "Navigation Links",
          description: "Test main navigation links work",
          steps: navLinks.slice(0, 5).flatMap(link => [
            { action: "navigate" as const, target: analysis.url, description: "Start from home" },
            { action: "click" as const, target: link.selector, description: `Click ${link.text || "link"}` },
            { action: "assert" as const, target: `url contains '${new URL(link.href || "").pathname}'`, description: "Verify navigation" },
          ]),
          assertions: ["no console errors"],
        });
      }
    }

    // Generate button interaction tests
    const actionButtons = analysis.buttons.filter(b =>
      b.text && !b.text.toLowerCase().includes("submit") && b.text.length < 30
    );
    if (actionButtons.length > 0) {
      tests.push({
        name: "Button Interactions",
        description: "Test clickable buttons respond correctly",
        steps: [
          { action: "navigate", target: analysis.url, description: "Navigate to page" },
          ...actionButtons.slice(0, 3).map(btn => ({
            action: "click" as const,
            target: btn.selector,
            description: `Click "${btn.text}"`,
          })),
        ],
        assertions: ["no console errors", "page is interactive"],
      });
    }

    // Default smoke test
    tests.push({
      name: "Page Load Smoke Test",
      description: "Verify page loads without errors",
      steps: [
        { action: "navigate", target: analysis.url, description: "Navigate to page" },
        { action: "assert", target: `title contains '${analysis.title.split(" ")[0]}'`, description: "Verify title" },
      ],
      assertions: ["page loads successfully", "no console errors"],
    });

    return tests;
  }

  /**
   * Generate CBrowser script from tests.
   */
  private generateCBrowserScript(tests: GeneratedTest[], url: string): string {
    let script = `# CBrowser Test Script\n# Generated for: ${url}\n# Date: ${new Date().toISOString()}\n\n`;

    for (const test of tests) {
      script += `# ${test.name}\n`;
      script += `# ${test.description}\n`;

      for (const step of test.steps) {
        switch (step.action) {
          case "navigate":
            script += `navigate "${step.target}"\n`;
            break;
          case "click":
            script += `click "${step.target}"\n`;
            break;
          case "fill":
            script += `fill "${step.target}" "${step.value}"\n`;
            break;
          case "assert":
            script += `assert "${step.target}"\n`;
            break;
          case "wait":
            script += `# wait ${step.value}ms\n`;
            break;
        }
      }

      for (const assertion of test.assertions) {
        script += `assert "${assertion}"\n`;
      }

      script += "\n";
    }

    return script;
  }

  /**
   * Generate Playwright test code from tests.
   */
  private generatePlaywrightCode(tests: GeneratedTest[], url: string): string {
    let code = `// Playwright Test Code\n// Generated for: ${url}\n// Date: ${new Date().toISOString()}\n\n`;
    code += `import { test, expect } from '@playwright/test';\n\n`;

    for (const testDef of tests) {
      const _testName = testDef.name.toLowerCase().replace(/\s+/g, "-");
      code += `test('${testDef.name}', async ({ page }) => {\n`;
      code += `  // ${testDef.description}\n\n`;

      for (const step of testDef.steps) {
        switch (step.action) {
          case "navigate":
            code += `  await page.goto('${step.target}');\n`;
            break;
          case "click":
            if (step.target?.startsWith("text=")) {
              code += `  await page.getByText('${step.target.replace("text=", "").replace(/"/g, "")}').click();\n`;
            } else {
              code += `  await page.locator('${step.target}').click();\n`;
            }
            break;
          case "fill":
            code += `  await page.locator('${step.target}').fill('${step.value}');\n`;
            break;
          case "assert":
            if (step.target?.includes("url contains")) {
              const match = step.target.match(/url contains '([^']+)'/);
              if (match) {
                code += `  await expect(page).toHaveURL(/${match[1]}/);\n`;
              }
            } else if (step.target?.includes("title contains")) {
              const match = step.target.match(/title contains '([^']+)'/);
              if (match) {
                code += `  await expect(page).toHaveTitle(/${match[1]}/);\n`;
              }
            }
            break;
          case "wait":
            code += `  await page.waitForTimeout(${step.value});\n`;
            break;
        }
      }

      code += `});\n\n`;
    }

    return code;
  }

  // =========================================================================
  // Verbose Debug Helpers (v7.4.16)
  // =========================================================================

  /**
   * Get all clickable elements on the page for verbose output.
   * Public so cognitive journey can use it to show Claude what's clickable.
   */
  async getAvailableClickables(page?: Page): Promise<Array<{ tag: string; text: string; selector: string; role?: string }>> {
    const targetPage = page || await this.getPage();
    try {
      // v11.6.0: Expanded selector to include all button types, form submits, and onclick handlers
      // Fixed: Was missing button[type="submit"], form buttons, and onclick handlers
      return await targetPage.$$eval(
        'button, a, [role="button"], [role="link"], input[type="submit"], input[type="button"], [onclick], [type="submit"]',
        els => {
          // Deduplicate and filter to visible elements only
          const seen = new Set<Element>();
          return els
            .filter(el => {
              if (seen.has(el)) return false;
              seen.add(el);
              const style = window.getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden';
            })
            .slice(0, 50) // v14.2.1: Increased from 20 to 50 for better verbose output
            .map((el, i) => ({
              tag: el.tagName.toLowerCase(),
              text: (el as HTMLElement).innerText?.trim().substring(0, 60) || el.getAttribute("aria-label") || el.getAttribute("value") || "",
              selector: el.id ? `#${el.id}` : el.getAttribute("data-testid") ? `[data-testid="${el.getAttribute("data-testid")}"]` : `${el.tagName.toLowerCase()}:nth-of-type(${i + 1})`,
              role: el.getAttribute("role") || undefined,
            }));
        }
      );
    } catch {
      return [];
    }
  }

  /**
   * Get all input fields on the page for verbose output.
   */
  /**
   * Get available form inputs on the page, including hidden ones with custom UI triggers.
   * Public so cognitive journey can use it.
   */
  async getAvailableInputs(page?: Page): Promise<Array<{ selector: string; type: string; name: string; placeholder: string; label: string; isHidden?: boolean; triggerText?: string; options?: string[] }>> {
    const activePage = page || await this.getPage();
    try {
      return await activePage.$$eval('input, textarea, select', els =>
        els.slice(0, 20).map(el => {
          const input = el as HTMLInputElement;
          const htmlEl = el as HTMLElement;

          // Check if element is hidden (common with custom dropdowns)
          const style = window.getComputedStyle(el);
          const isHidden = style.display === 'none' ||
                          style.visibility === 'hidden' ||
                          parseFloat(style.opacity) === 0 ||
                          htmlEl.offsetWidth === 0 ||
                          htmlEl.offsetHeight === 0;

          // Find associated label
          let label = "";
          if (input.id) {
            const labelEl = document.querySelector(`label[for="${input.id}"]`);
            if (labelEl) label = (labelEl as HTMLElement).innerText?.trim().substring(0, 50) || "";
          }
          if (!label && input.closest("label")) {
            label = (input.closest("label") as HTMLElement).innerText?.trim().substring(0, 50) || "";
          }

          // For hidden elements, try to find the visible trigger
          let triggerText = "";
          if (isHidden) {
            // Look for sibling or parent with visible text (custom dropdown trigger)
            const parent = el.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children).filter(c => c !== el);
              for (const sib of siblings) {
                const sibStyle = window.getComputedStyle(sib);
                if (sibStyle.display !== 'none' && (sib as HTMLElement).innerText?.trim()) {
                  triggerText = (sib as HTMLElement).innerText.trim().substring(0, 50);
                  break;
                }
              }
            }
            // Also check for aria-labelledby or data attributes
            if (!triggerText) {
              const ariaLabel = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
              if (ariaLabel) triggerText = ariaLabel.substring(0, 50);
            }
          }

          // For select elements, get available options
          let options: string[] | undefined;
          if (el.tagName.toLowerCase() === 'select') {
            const selectEl = el as HTMLSelectElement;
            options = Array.from(selectEl.options)
              .filter(opt => opt.value && opt.text.trim()) // Skip empty/placeholder options
              .slice(0, 10) // Limit to first 10 options
              .map(opt => opt.text.trim());
          }

          return {
            selector: input.id ? `#${input.id}` : input.name ? `[name="${input.name}"]` : input.placeholder ? `[placeholder="${input.placeholder}"]` : `${el.tagName.toLowerCase()}`,
            type: input.type || el.tagName.toLowerCase(),
            name: input.name || "",
            placeholder: input.placeholder || "",
            label,
            isHidden,
            triggerText,
            options,
          };
        })
      );
    } catch (error) {
      // v11.7.1: Log errors instead of silently swallowing them
      if (process.env.DEBUG || process.env.CBROWSER_DEBUG) {
        console.error(`[getAvailableInputs] Error:`, error instanceof Error ? error.message : String(error));
      }
      return [];
    }
  }

  /**
   * Generate AI suggestion for a failed click.
   */
  private generateClickSuggestion(selector: string, available: Array<{ tag: string; text: string; selector: string }>): string {
    if (available.length === 0) {
      return `No clickable elements found on the page. The page may still be loading.`;
    }
    const list = available.slice(0, 8).map(e => `  • ${e.tag}: "${e.text}" → ${e.selector}`).join("\n");
    return `Element "${selector}" not found.\n\nAvailable clickable elements:\n${list}\n\nTry using the exact text or selector from one of these elements.`;
  }

  /**
   * Generate AI suggestion for a failed fill.
   */
  private generateFillSuggestion(selector: string, available: Array<{ selector: string; type: string; name: string; placeholder: string; label: string }>): string {
    if (available.length === 0) {
      return `No input fields found on the page. The page may still be loading.`;
    }
    const list = available.slice(0, 8).map(e => {
      const desc = e.label || e.placeholder || e.name || e.type;
      return `  • ${desc} (${e.type}) → ${e.selector}`;
    }).join("\n");
    return `Input "${selector}" not found.\n\nAvailable input fields:\n${list}\n\nTry using the name, placeholder, or label text from one of these fields.`;
  }

  /**
   * Capture a debug screenshot with element highlighting.
   * Green outlines = available alternatives, Red outline = attempted selector.
   */
  private async captureDebugScreenshot(
    page: Page,
    options: { availableSelectors?: string[]; attemptedSelector?: string; debugDir?: string }
  ): Promise<string> {
    try {
      // Inject CSS highlights
      await page.evaluate((opts: { availableSelectors?: string[]; attemptedSelector?: string }) => {
        // Highlight available elements in green
        for (const sel of opts.availableSelectors || []) {
          try {
            const el = document.querySelector(sel);
            if (el) {
              (el as HTMLElement).style.outline = "3px solid #22c55e";
              (el as HTMLElement).style.outlineOffset = "2px";
            }
          } catch {}
        }
        // Mark attempted element in red
        if (opts.attemptedSelector) {
          try {
            const el = document.querySelector(opts.attemptedSelector);
            if (el) {
              (el as HTMLElement).style.outline = "3px solid #ef4444";
              (el as HTMLElement).style.outlineOffset = "2px";
            }
          } catch {}
        }
      }, { availableSelectors: options.availableSelectors, attemptedSelector: options.attemptedSelector });

      // Take screenshot
      const dir = options.debugDir || this.paths.screenshotsDir;
      const filename = `debug-${Date.now()}.png`;
      const filepath = join(dir, filename);
      await page.screenshot({ path: filepath, fullPage: false });

      // Clean up highlights
      await page.evaluate(() => {
        const highlighted = document.querySelectorAll('[style*="outline"]');
        for (let i = 0; i < highlighted.length; i++) {
          (highlighted[i] as HTMLElement).style.outline = "";
          (highlighted[i] as HTMLElement).style.outlineOffset = "";
        }
      });

      return filepath;
    } catch {
      return await this.screenshot();
    }
  }

  /**
   * Analyze a failure and provide AI-powered suggestions.
   */
  private async analyzeFailure(selector: string, attempts: RetryAttempt[]): Promise<string> {
    const page = await this.getPage();

    try {
      // Get page context for suggestion
      const buttons = await page.$$eval('button, a, [role="button"]', els =>
        els.slice(0, 10).map(el => ({
          text: el.textContent?.trim().substring(0, 50),
          tag: el.tagName,
        }))
      );

      const buttonList = buttons.map(b => `- ${b.tag}: "${b.text}"`).join("\n");

      return `Element "${selector}" not found after ${attempts.length} attempts.\n\nAvailable clickable elements:\n${buttonList}\n\nTry using the exact text from one of these elements.`;
    } catch {
      return `Element "${selector}" not found. Check that the element exists and is visible.`;
    }
  }

  // =========================================================================
  // Tier 5: Assertions (v5.0.0)
  // =========================================================================

  /**
   * Assert a condition using natural language.
   */
  async assert(assertion: string): Promise<AssertionResult> {
    await this.getPage(); // Ensure page exists

    try {
      // Parse the assertion
      const result = await this.evaluateAssertion(assertion);

      this.audit("assert", assertion, "green", result.passed ? "success" : "failure");

      return {
        ...result,
        screenshot: await this.screenshot(),
      };
    } catch (error) {
      return {
        passed: false,
        assertion,
        message: `Assertion error: ${error instanceof Error ? error.message : String(error)}`,
        screenshot: await this.screenshot(),
      };
    }
  }

  /**
   * Evaluate a natural language assertion.
   */
  private async evaluateAssertion(assertion: string): Promise<Omit<AssertionResult, "screenshot">> {
    const page = await this.getPage();
    const lowerAssertion = assertion.toLowerCase();

    // Page title assertions
    if (lowerAssertion.includes("title") && (lowerAssertion.includes("is") || lowerAssertion.includes("contains"))) {
      const title = await page.title();
      const match = assertion.match(/["']([^"']+)["']/);
      const expected = match?.[1] || "";

      if (lowerAssertion.includes("contains")) {
        const passed = title.toLowerCase().includes(expected.toLowerCase());
        return { passed, assertion, actual: title, expected, message: passed ? "Title contains expected text" : `Title "${title}" does not contain "${expected}"` };
      } else {
        const passed = title === expected;
        return { passed, assertion, actual: title, expected, message: passed ? "Title matches" : `Title "${title}" does not match "${expected}"` };
      }
    }

    // URL assertions
    if (lowerAssertion.includes("url") && (lowerAssertion.includes("is") || lowerAssertion.includes("contains"))) {
      const url = page.url();
      const match = assertion.match(/["']([^"']+)["']/);
      const expected = match?.[1] || "";

      if (lowerAssertion.includes("contains")) {
        const passed = url.includes(expected);
        return { passed, assertion, actual: url, expected, message: passed ? "URL contains expected text" : `URL "${url}" does not contain "${expected}"` };
      } else {
        const passed = url === expected;
        return { passed, assertion, actual: url, expected, message: passed ? "URL matches" : `URL "${url}" does not match "${expected}"` };
      }
    }

    // Text presence assertions
    // v14.3.0: Filter script/style content to avoid ad injection false negatives
    if (lowerAssertion.includes("page") && (lowerAssertion.includes("contains") || lowerAssertion.includes("has") || lowerAssertion.includes("shows"))) {
      const match = assertion.match(/["']([^"']+)["']/);
      const expected = match?.[1] || "";
      // v14.3.0: Use filtered text extraction (excludes script/style content)
      const content = await page.evaluate(() => {
        const clone = document.body.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
        return clone.innerText || clone.textContent || "";
      }) || "";
      const passed = content.toLowerCase().includes(expected.toLowerCase());
      // v11.7.1: Include actual content snippet for debugging (truncated to 200 chars)
      const actualSnippet = content.length > 200 ? content.substring(0, 200) + "..." : content;

      return { passed, assertion, actual: actualSnippet, expected, message: passed ? `Page contains "${expected}"` : `Page does not contain "${expected}"` };
    }

    // Element existence assertions
    if (lowerAssertion.includes("exists") || lowerAssertion.includes("visible") || lowerAssertion.includes("present")) {
      const match = assertion.match(/["']([^"']+)["']/);
      const selector = match?.[1] || "";
      const element = await this.findElement(selector);
      const passed = element !== null;

      return { passed, assertion, expected: selector, message: passed ? `Element "${selector}" exists` : `Element "${selector}" not found` };
    }

    // Element count assertions
    const countMatch = lowerAssertion.match(/(\d+)\s+(items?|elements?|buttons?|links?|rows?)/);
    if (countMatch) {
      const expectedCount = parseInt(countMatch[1]);
      const elementType = countMatch[2];

      let selectorForType: string;
      switch (elementType.replace(/s$/, "")) {
        case "button": selectorForType = "button, [role='button']"; break;
        case "link": selectorForType = "a"; break;
        case "row": selectorForType = "tr"; break;
        case "item": selectorForType = "li"; break;
        default: selectorForType = "*"; break;
      }

      const elements = await page.$$(selectorForType);
      const actualCount = elements.length;
      const passed = actualCount === expectedCount;

      return { passed, assertion, actual: String(actualCount), expected: String(expectedCount), message: passed ? `Found ${expectedCount} ${elementType}` : `Expected ${expectedCount} ${elementType} but found ${actualCount}` };
    }

    // Default: treat as text search
    const match = assertion.match(/["']([^"']+)["']/);
    if (match) {
      const expected = match[1];
      // v17.3.2: Use same filtered text extraction as "page contains" assertions
      // This normalizes whitespace and removes script/style content
      const content = await page.evaluate(() => {
        const clone = document.body.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('script, style, noscript').forEach(el => el.remove());
        // Get innerText (normalizes whitespace) and clean it up
        let text = clone.innerText || clone.textContent || "";
        // Normalize whitespace: collapse multiple spaces/newlines to single space
        text = text.replace(/[\n\t\r]+/g, ' ').replace(/\s+/g, ' ').trim();
        return text;
      }) || "";
      const passed = content.toLowerCase().includes(expected.toLowerCase());

      return { passed, assertion, expected, message: passed ? `Found "${expected}"` : `Did not find "${expected}"` };
    }

    return { passed: false, assertion, message: "Could not parse assertion. Use quotes around expected values." };
  }

  /**
   * Find an element using multiple strategies.
   */
  private async findElement(selector: string, options: { skipCache?: boolean } = {}): Promise<Locator | null> {
    const page = await this.getPage();

    // Strategy 0: Check self-healing cache first (unless skipped)
    if (!options.skipCache) {
      const cached = this.getCachedSelector(selector);
      if (cached) {
        try {
          const cachedElement = await this.findElement(cached.workingSelector, { skipCache: true });
          if (cachedElement && await cachedElement.count() > 0) {
            this.updateCacheStats(selector, true);
            if (this.config.verbose) {
              console.log(`🔧 Self-healed: "${selector}" → "${cached.workingSelector}"`);
            }
            return cachedElement;
          } else {
            // Cached selector no longer works
            this.updateCacheStats(selector, false);
          }
        } catch {
          this.updateCacheStats(selector, false);
        }
      }
    }

    // Strategy 1: Direct CSS selector
    if (selector.startsWith("css:")) {
      return page.locator(selector.slice(4)).first();
    }

    // Strategy 2: ARIA selector
    if (selector.startsWith("aria:")) {
      const [role, name] = selector.slice(5).split("/");
      return page.getByRole(role as any, { name }).first();
    }

    // Strategy 3: Text content - prefer exact matches over fuzzy, non-sticky over sticky
    // First, try exact text match
    const byTextExact = page.getByText(selector, { exact: true });
    const exactCount = await byTextExact.count();
    if (exactCount > 0) {
      // If multiple exact matches, prefer non-sticky elements
      if (exactCount > 1) {
        const bestMatch = await this.findBestClickCandidate(byTextExact, selector);
        if (bestMatch) return bestMatch;
      }
      return byTextExact.first();
    }

    // Then try partial/fuzzy text match (but with sticky deprioritization)
    const byTextFuzzy = page.getByText(selector, { exact: false });
    const fuzzyCount = await byTextFuzzy.count();
    if (fuzzyCount > 0) {
      // If multiple fuzzy matches, prefer non-sticky elements and shorter/exact matches
      if (fuzzyCount > 1) {
        const bestMatch = await this.findBestClickCandidate(byTextFuzzy, selector);
        if (bestMatch) return bestMatch;
      }
      return byTextFuzzy.first();
    }

    // Strategy 4: Placeholder
    const byPlaceholder = page.getByPlaceholder(selector).first();
    if (await byPlaceholder.count() > 0) {
      return byPlaceholder;
    }

    // Strategy 5: Label
    const byLabel = page.getByLabel(selector).first();
    if (await byLabel.count() > 0) {
      return byLabel;
    }

    // Strategy 6: Role with name
    const byRole = page.getByRole("button", { name: selector }).first();
    if (await byRole.count() > 0) {
      return byRole;
    }

    // Strategy 7: Try as CSS
    try {
      const byCss = page.locator(selector).first();
      if (await byCss.count() > 0) {
        return byCss;
      }
    } catch {
      // Invalid CSS selector, continue
    }

    // Strategy 8: Input by name attribute
    try {
      const byName = page.locator(`input[name="${selector}"]`).first();
      if (await byName.count() > 0) return byName;
    } catch {}

    // Strategy 9: Input by type attribute (e.g., "email", "password")
    try {
      const byType = page.locator(`input[type="${selector}"]`).first();
      if (await byType.count() > 0) return byType;
    } catch {}

    // Strategy 10: Element by id
    try {
      const byId = page.locator(`#${selector}`).first();
      if (await byId.count() > 0) return byId;
    } catch {}

    // Strategy 11: Textarea by name
    try {
      const byTextarea = page.locator(`textarea[name="${selector}"]`).first();
      if (await byTextarea.count() > 0) return byTextarea;
    } catch {}

    // Strategy 12: Role link with name
    try {
      const byLink = page.getByRole("link", { name: selector }).first();
      if (await byLink.count() > 0) return byLink;
    } catch {}

    // Strategy 13: Fuzzy attribute match via JS
    try {
      const fuzzyHandle = await page.evaluateHandle((search) => {
        const inputs = Array.from(document.querySelectorAll("input, textarea, select, button, a, [role='button'], [role='link']"));
        const searchLower = search.toLowerCase();
        for (const el of inputs) {
          const name = el.getAttribute("name")?.toLowerCase() || "";
          const id = el.getAttribute("id")?.toLowerCase() || "";
          const placeholder = el.getAttribute("placeholder")?.toLowerCase() || "";
          const type = el.getAttribute("type")?.toLowerCase() || "";
          const ariaLabel = el.getAttribute("aria-label")?.toLowerCase() || "";
          const text = (el as HTMLElement).innerText?.toLowerCase() || "";
          if (name.includes(searchLower) || id.includes(searchLower) ||
              placeholder.includes(searchLower) || type === searchLower ||
              ariaLabel.includes(searchLower) || text.includes(searchLower)) {
            return el;
          }
        }
        return null;
      }, selector);

      const element = fuzzyHandle.asElement();
      if (element) {
        // Convert ElementHandle back to Locator isn't directly possible,
        // but we can get a selector from it
        const generatedSelector = await page.evaluate((el) => {
          if (el.id) return `#${el.id}`;
          const name = el.getAttribute("name");
          if (name) return `[name="${name}"]`;
          const testId = el.getAttribute("data-testid");
          if (testId) return `[data-testid="${testId}"]`;
          return null;
        }, element);

        if (generatedSelector) {
          return page.locator(generatedSelector).first();
        }
      }
    } catch {}

    // Strategy 14: Search within iframes (v14.3.0)
    // For embedded apps like TodoMVC, search inside iframes
    try {
      const frames = page.frames();
      for (const frame of frames) {
        if (frame === page.mainFrame()) continue; // Skip main frame, already searched

        // Try common selectors in iframe
        try {
          // Text match in iframe
          const byText = frame.getByText(selector, { exact: false });
          if (await byText.count() > 0) {
            // Store which iframe has the element for later operations
            (this as any)._activeFrame = frame;
            return byText.first();
          }

          // Placeholder match in iframe
          const byPlaceholder = frame.getByPlaceholder(selector, { exact: false });
          if (await byPlaceholder.count() > 0) {
            (this as any)._activeFrame = frame;
            return byPlaceholder.first();
          }

          // Role match in iframe
          const roles = ["button", "link", "textbox", "checkbox", "radio", "combobox"] as const;
          for (const role of roles) {
            const byRole = frame.getByRole(role, { name: selector });
            if (await byRole.count() > 0) {
              (this as any)._activeFrame = frame;
              return byRole.first();
            }
          }
        } catch {
          // Frame may be cross-origin, skip it
          continue;
        }
      }
    } catch {}

    return null;
  }

  /**
   * v16.11.0: Find a fillable element (input/textarea/select).
   * Prioritizes fillable elements over text/label matches to avoid matching
   * div labels instead of actual input fields.
   *
   * Bug fix for: "fill matches div label instead of input"
   */
  private async findFillableElement(selector: string): Promise<Locator | null> {
    const page = await this.getPage();

    // Strategy 1: Direct CSS selector (passthrough)
    if (selector.startsWith("css:")) {
      return page.locator(selector.slice(4)).first();
    }

    // Strategy 2: ARIA selector (passthrough)
    if (selector.startsWith("aria:")) {
      const [role, name] = selector.slice(5).split("/");
      return page.getByRole(role as any, { name }).first();
    }

    // Strategy 3: Input by name attribute (PRIORITY for fill)
    try {
      const byName = page.locator(`input[name="${selector}"], textarea[name="${selector}"], select[name="${selector}"]`).first();
      if (await byName.count() > 0) return byName;
    } catch {}

    // Strategy 4: Input by id (PRIORITY for fill)
    try {
      const byId = page.locator(`input#${selector}, textarea#${selector}, select#${selector}`).first();
      if (await byId.count() > 0) return byId;
    } catch {}

    // Strategy 5: Input by type attribute (e.g., "email", "password")
    try {
      const byType = page.locator(`input[type="${selector}"]`).first();
      if (await byType.count() > 0) return byType;
    } catch {}

    // Strategy 6: Placeholder (common for inputs)
    const byPlaceholder = page.getByPlaceholder(selector).first();
    if (await byPlaceholder.count() > 0) {
      return byPlaceholder;
    }

    // Strategy 7: Label - this returns the associated INPUT, not the label itself
    // getByLabel is specifically designed for form fields
    const byLabel = page.getByLabel(selector).first();
    if (await byLabel.count() > 0) {
      // Verify it's actually a fillable element, not a div with aria-label
      const tagName = await byLabel.evaluate((el) => el.tagName.toLowerCase());
      if (['input', 'textarea', 'select'].includes(tagName)) {
        return byLabel;
      }
    }

    // Strategy 8: ARIA label on fillable elements
    try {
      const byAriaLabel = page.locator(`input[aria-label*="${selector}" i], textarea[aria-label*="${selector}" i], select[aria-label*="${selector}" i]`).first();
      if (await byAriaLabel.count() > 0) return byAriaLabel;
    } catch {}

    // Strategy 9: Fuzzy match on fillable elements only
    try {
      const fuzzyHandle = await page.evaluateHandle((search) => {
        const fillables = Array.from(document.querySelectorAll("input, textarea, select"));
        const searchLower = search.toLowerCase();
        for (const el of fillables) {
          const name = el.getAttribute("name")?.toLowerCase() || "";
          const id = el.getAttribute("id")?.toLowerCase() || "";
          const placeholder = el.getAttribute("placeholder")?.toLowerCase() || "";
          const type = el.getAttribute("type")?.toLowerCase() || "";
          const ariaLabel = el.getAttribute("aria-label")?.toLowerCase() || "";
          // Check associated label
          const labelledBy = el.getAttribute("aria-labelledby");
          const labelText = labelledBy
            ? document.getElementById(labelledBy)?.textContent?.toLowerCase() || ""
            : "";
          // Check for<label for="id"> pattern
          const labelFor = el.id
            ? document.querySelector(`label[for="${el.id}"]`)?.textContent?.toLowerCase() || ""
            : "";

          if (name.includes(searchLower) || id.includes(searchLower) ||
              placeholder.includes(searchLower) || type === searchLower ||
              ariaLabel.includes(searchLower) || labelText.includes(searchLower) ||
              labelFor.includes(searchLower)) {
            return el;
          }
        }
        return null;
      }, selector);

      const element = fuzzyHandle.asElement();
      if (element) {
        const generatedSelector = await page.evaluate((el) => {
          if (el.id) return `#${el.id}`;
          const name = el.getAttribute("name");
          if (name) return `[name="${name}"]`;
          const testId = el.getAttribute("data-testid");
          if (testId) return `[data-testid="${testId}"]`;
          return null;
        }, element);

        if (generatedSelector) {
          return page.locator(generatedSelector).first();
        }
      }
    } catch {}

    // Strategy 10: Search within iframes
    try {
      const frames = page.frames();
      for (const frame of frames) {
        if (frame === page.mainFrame()) continue;

        try {
          // Placeholder in iframe
          const byPlaceholderFrame = frame.getByPlaceholder(selector, { exact: false });
          if (await byPlaceholderFrame.count() > 0) {
            (this as any)._activeFrame = frame;
            return byPlaceholderFrame.first();
          }

          // Label in iframe (for form fields)
          const byLabelFrame = frame.getByLabel(selector, { exact: false });
          if (await byLabelFrame.count() > 0) {
            const tagName = await byLabelFrame.first().evaluate((el) => el.tagName.toLowerCase());
            if (['input', 'textarea', 'select'].includes(tagName)) {
              (this as any)._activeFrame = frame;
              return byLabelFrame.first();
            }
          }
        } catch {
          continue;
        }
      }
    } catch {}

    // Fallback: Use standard findElement (may match non-fillable elements)
    // This maintains backward compatibility for edge cases
    return this.findElement(selector);
  }

  // =========================================================================
  // Extraction
  // =========================================================================

  /**
   * Extract data from the page.
   */
  async extract(what: string): Promise<ExtractResult> {
    const page = await this.getPage();

    let data: unknown;

    switch (what.toLowerCase()) {
      case "links":
        data = await page.evaluate(() =>
          Array.from(document.querySelectorAll("a")).map((a) => ({
            text: a.textContent?.trim(),
            href: a.href,
          }))
        );
        break;

      case "headings":
        data = await page.evaluate(() =>
          Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((h) => ({
            level: h.tagName,
            text: h.textContent?.trim(),
          }))
        );
        break;

      case "images":
        data = await page.evaluate(() =>
          Array.from(document.querySelectorAll("img")).map((img) => ({
            src: img.src,
            alt: img.alt,
          }))
        );
        break;

      case "forms":
        data = await page.evaluate(() =>
          Array.from(document.querySelectorAll("form")).map((form) => ({
            action: form.action,
            method: form.method,
            inputs: Array.from(form.querySelectorAll("input, select, textarea")).map((el) => ({
              type: (el as HTMLInputElement).type || el.tagName.toLowerCase(),
              name: (el as HTMLInputElement).name,
              id: el.id,
            })),
          }))
        );
        break;

      case "text":
      default:
        // v11.7.1: Explicit text case (was falling through to default which caused issues)
        // v14.3.0: Filter script/style content to avoid ad injection pollution
        // v16.7.1: Fixed whitespace normalization regression - restore proper text normalization
        data = await page.evaluate(() => {
          // Clone body to avoid modifying the DOM
          const clone = document.body.cloneNode(true) as HTMLElement;

          // v14.3.0: Remove script and style elements before text extraction
          // This prevents Google Ads and other injected scripts from polluting assertions
          const scriptsAndStyles = clone.querySelectorAll('script, style, noscript');
          scriptsAndStyles.forEach(el => el.remove());

          // v16.7.1: Block-level elements that should have space separation
          const blockElements = new Set([
            'DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TR', 'TD', 'TH',
            'ARTICLE', 'SECTION', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'MAIN',
            'BLOCKQUOTE', 'PRE', 'ADDRESS', 'FIGCAPTION', 'FIGURE', 'DT', 'DD'
          ]);

          // v16.7.1: Recursive text extraction with proper spacing
          function extractTextWithSpacing(node: Node): string {
            if (node.nodeType === Node.TEXT_NODE) {
              return node.textContent || '';
            }
            if (node.nodeType !== Node.ELEMENT_NODE) {
              return '';
            }
            const el = node as HTMLElement;
            // Skip hidden elements
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') {
              return '';
            }

            const parts: string[] = [];
            for (const child of Array.from(el.childNodes)) {
              parts.push(extractTextWithSpacing(child));
            }
            let text = parts.join('');

            // Add space after block elements to prevent concatenation
            if (blockElements.has(el.tagName)) {
              text = text + ' ';
            }
            return text;
          }

          // v16.7.1: Normalize text - collapse whitespace, trim
          function normalizeText(text: string): string {
            return text
              // Replace newlines and tabs with spaces
              .replace(/[\n\t\r]/g, ' ')
              // Collapse multiple spaces to single space
              .replace(/\s+/g, ' ')
              // Trim leading/trailing whitespace
              .trim();
          }

          // Primary extraction with proper spacing
          let text = extractTextWithSpacing(clone);
          text = normalizeText(text);

          // Fallback: if text is empty (SPA hydration), try textContent with normalization
          if (!text || text === "") {
            text = normalizeText(clone.textContent || "");
          }

          // Second fallback: extract from visible elements with spacing
          if (!text || text === "") {
            const elements = Array.from(clone.querySelectorAll("h1, h2, h3, h4, h5, h6, p, span, li, td, th, a, label, div"));
            const texts: string[] = [];
            for (const el of elements) {
              const t = (el as HTMLElement).innerText?.trim();
              if (t && t.length > 0 && !texts.includes(t)) {
                texts.push(t);
              }
            }
            // Join with space (not newline) for proper normalization
            text = texts.join(" ");
          }
          return text;
        });
    }

    return {
      data,
      screenshot: await this.screenshot(),
    };
  }

  // =========================================================================
  // Screenshots
  // =========================================================================

  /**
   * Take a screenshot.
   */
  async screenshot(path?: string): Promise<string> {
    const page = await this.getPage();
    const filename = path || join(this.paths.screenshotsDir, `screenshot-${Date.now()}.png`);

    await page.screenshot({ path: filename, fullPage: false });
    return filename;
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
    return this.sessionManager.load(name, page, this.context!);
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
   * Run an autonomous journey.
   *
   * When API key is configured, uses AI-driven cognitive journeys (Claude API)
   * for realistic user simulation with cognitive state tracking.
   *
   * Without API key, falls back to heuristic exploration (simplified).
   *
   * @requires ANTHROPIC_API_KEY for cognitive mode (set via `npx cbrowser config set-api-key`)
   */
  async journey(options: JourneyOptions): Promise<JourneyResult> {
    const { persona: personaName, startUrl, goal, maxSteps = 20, maxTime = 120 } = options;

    // Check if cognitive journeys are available (API key configured)
    if (isApiKeyConfigured()) {
      try {
        const cognitiveResult = await runCognitiveJourney({
          persona: personaName,
          startUrl,
          goal,
          maxSteps,
          maxTime,
          headless: this.config.headless,
          vision: false,
          verbose: false,
        });

        // Map cognitive journey result to JourneyResult format
        return {
          persona: personaName,
          goal,
          steps: cognitiveResult.frictionPoints.map((fp, _i) => ({
            action: fp.type,
            target: fp.element || 'page',
            result: fp.monologue.substring(0, 100),
            screenshot: fp.screenshot,
            timestamp: new Date().toISOString(),
          })),
          success: cognitiveResult.goalAchieved,
          frictionPoints: cognitiveResult.frictionPoints.map(fp =>
            `${fp.type}: ${fp.monologue.substring(0, 80)}`
          ),
          totalTime: cognitiveResult.totalTime * 1000, // Convert to ms
          consoleLogs: [],
          cognitive: {
            patienceRemaining: cognitiveResult.finalState.patienceRemaining,
            frustrationLevel: cognitiveResult.finalState.frustrationLevel,
            confusionLevel: cognitiveResult.finalState.confusionLevel,
            abandonmentReason: cognitiveResult.abandonmentReason,
            backtrackCount: cognitiveResult.summary.backtrackCount,
            monologue: cognitiveResult.fullMonologue,
          },
        };
      } catch (e) {
        console.warn(`Cognitive journey failed, falling back to heuristic: ${(e as Error).message}`);
        // Fall through to heuristic mode
      }
    }

    // Heuristic mode (no API key or cognitive journey failed)
    // NOTE: This is simplified exploration. For realistic user simulation,
    // configure an API key: npx cbrowser config set-api-key YOUR_KEY

    const persona = getPersona(personaName) || BUILTIN_PERSONAS["first-timer"];
    this.currentPersona = persona;

    // Set viewport based on persona
    if (persona.context?.viewport) {
      this.config.viewportWidth = persona.context.viewport[0];
      this.config.viewportHeight = persona.context.viewport[1];
    }

    const page = await this.getPage();
    const steps: JourneyStep[] = [];
    const consoleLogs: ConsoleEntry[] = [];
    const frictionPoints: string[] = [];
    const startTime = Date.now();

    // Capture console logs
    page.on("console", (msg) => {
      const entry: ConsoleEntry = {
        type: msg.type() as ConsoleEntry["type"],
        text: msg.text().substring(0, 500),
        timestamp: new Date().toISOString(),
        url: msg.location()?.url,
        lineNumber: msg.location()?.lineNumber,
      };
      consoleLogs.push(entry);

      if (msg.type() === "error") {
        frictionPoints.push(`Console error: ${msg.text().substring(0, 100)}`);
      }
    });

    // Navigate to start
    await this.navigate(startUrl);
    steps.push({
      action: "navigate",
      target: startUrl,
      result: `Loaded: ${await page.title()}`,
      screenshot: await this.screenshot(),
      timestamp: new Date().toISOString(),
    });

    // Heuristic exploration (simplified - no API key available)
    // For realistic AI-driven exploration, set API key: npx cbrowser config set-api-key
    let stepCount = 0;
    let success = false;

    while (stepCount < maxSteps && !success) {
      stepCount++;

      // Wait with human-like timing
      const delay = this.getHumanDelay(persona);
      await new Promise((r) => setTimeout(r, delay));

      // Try to find clickable elements
      const clickable = await page.evaluate((goalText) => {
        const elements = Array.from(
          document.querySelectorAll('a, button, [role="button"], input[type="submit"]')
        );

        // Score elements by relevance to goal (deterministic, not random)
        const scored = elements.slice(0, 20).map((el) => {
          const text = el.textContent?.trim().substring(0, 50) || '';
          const href = (el as HTMLAnchorElement).href || '';
          const textLower = text.toLowerCase();
          const goalWords = goalText.toLowerCase().split(' ').filter(w => w.length > 2);

          // Calculate relevance score
          let score = 0;
          for (const word of goalWords) {
            if (textLower.includes(word)) score += 3;
            if (href.toLowerCase().includes(word)) score += 2;
          }
          // Boost common action words
          if (textLower.match(/submit|continue|next|proceed|sign|login|register/)) score += 1;

          return { tag: el.tagName, text, href, score };
        });

        // Sort by score (highest first) and return top 5
        return scored.sort((a, b) => b.score - a.score).slice(0, 5);
      }, goal);

      if (clickable.length === 0) {
        frictionPoints.push("No clickable elements found");
        break;
      }

      // Select highest-scored element (deterministic)
      const target = clickable[0];
      const result = await this.click(target.text || target.tag);

      steps.push({
        action: "click",
        target: target.text || target.tag,
        result: result.message,
        screenshot: result.screenshot,
        timestamp: new Date().toISOString(),
      });

      // Check if goal might be achieved
      const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());
      if (goal.toLowerCase().split(" ").some((word) => pageText.includes(word))) {
        success = true;
      }
    }

    // Save final screenshot
    steps.push({
      action: "final",
      result: `Final page: ${await page.title()}`,
      screenshot: await this.screenshot(),
      timestamp: new Date().toISOString(),
    });

    const result: JourneyResult = {
      persona: personaName,
      goal,
      steps,
      success,
      frictionPoints,
      totalTime: Date.now() - startTime,
      consoleLogs,
    };

    // Save journey results
    const journeyFile = join(this.paths.dataDir, `journey-${Date.now()}.json`);
    writeFileSync(journeyFile, JSON.stringify(result, null, 2));

    return result;
  }

  /**
   * Get human-like delay based on persona.
   * Uses deterministic average of min/max (no random).
   * For realistic variable timing, use cognitive journeys with API key.
   */
  private getHumanDelay(persona: Persona): number {
    const timing = persona.humanBehavior?.timing;
    if (!timing) return 500;

    const min = timing.reactionTime.min;
    const max = timing.reactionTime.max;
    // Use midpoint for deterministic behavior (no random)
    return Math.floor((min + max) / 2);
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
   */
  private classifyAction(action: string, target: string): ActionZone {
    const lowerTarget = target.toLowerCase();

    // =========================================================================
    // BLACK ZONE - Security violations, never execute
    // =========================================================================
    const blackPatterns = [
      /bypass/i,
      /inject/i,
      /\bhack\b/i,
      /exploit/i,
      /sql\s*injection/i,
      /xss/i,
    ];

    if (blackPatterns.some(p => p.test(lowerTarget))) {
      return "black";
    }

    // =========================================================================
    // For non-click actions, use simple classification
    // =========================================================================
    if (action !== "click") {
      if (action === "fill") return "yellow";
      return "green";
    }

    // =========================================================================
    // RED ZONE - Truly dangerous actions requiring --force
    // These patterns indicate financial commitment or irreversible destruction
    // =========================================================================

    // Financial transactions - always Red
    const financialPatterns = [
      /\b(buy|purchase)\s*(now|this|item)?/i,
      /\bpay\s*(\$|€|£|\d)/i,           // "Pay $50", "Pay 50"
      /\bpay\s*(now|with)/i,             // "Pay now", "Pay with card"
      /\bcheckout\b/i,
      /\bplace\s*order/i,
      /\bcomplete\s*(order|purchase|payment)/i,
      /\bsubmit\s*(order|payment)/i,
      /\bproceed\s*to\s*(checkout|payment)/i,
    ];

    if (financialPatterns.some(p => p.test(lowerTarget))) {
      return "red";
    }

    // Destructive actions - context matters
    const destructivePatterns = [
      /\bdelete\s*(my\s*)?(account|profile|data|all)/i,
      /\bremove\s*(my\s*)?(account|profile|permanently)/i,
      /\bpermanently\s*(delete|remove)/i,
      /\bclose\s*(my\s*)?account/i,
      /\bdeactivate\s*(my\s*)?account/i,
      /\berase\s*(all|my\s*data)/i,
    ];

    if (destructivePatterns.some(p => p.test(lowerTarget))) {
      return "red";
    }

    // Confirmation of dangerous actions
    const dangerousConfirmPatterns = [
      /\bconfirm\s*(purchase|order|payment|deletion|removal)/i,
      /\byes,?\s*(delete|remove|pay|purchase|buy)/i,
      /\bi\s*agree.*(purchase|payment|terms)/i,
    ];

    if (dangerousConfirmPatterns.some(p => p.test(lowerTarget))) {
      return "red";
    }

    // =========================================================================
    // YELLOW ZONE - Safe interactive actions (explicit benign patterns)
    // These are common actions that sound dangerous but are actually safe
    // =========================================================================

    // Benign "submit" actions
    const benignSubmitPatterns = [
      /\bsubmit\s*(search|review|feedback|form|comment|email|message|query)/i,
      /\bsubmit\b(?!.*(?:order|payment|purchase))/i,  // "submit" without financial
    ];

    // Benign "remove" actions
    const benignRemovePatterns = [
      /\bremove\s*(filter|item|from\s*cart|selection|tag|label)/i,
      /\bremove\b(?!.*(?:account|profile|permanently|all))/i,
    ];

    // Benign "delete" actions
    const benignDeletePatterns = [
      /\bdelete\s*(filter|item|from\s*cart|selection|draft|message)/i,
      /\bdelete\b(?!.*(?:account|profile|permanently|all|my))/i,
    ];

    // Benign "confirm" actions
    const benignConfirmPatterns = [
      /\bconfirm\s*(email|selection|password|choice|age|identity)/i,
      /\bconfirm\b(?!.*(?:purchase|order|payment|deletion|removal))/i,
    ];

    // Check all benign patterns - if matched, safe to proceed as Yellow
    const allBenignPatterns = [
      ...benignSubmitPatterns,
      ...benignRemovePatterns,
      ...benignDeletePatterns,
      ...benignConfirmPatterns,
    ];

    if (allBenignPatterns.some(p => p.test(lowerTarget))) {
      return "yellow";
    }

    // =========================================================================
    // FALLBACK - Default to Yellow for any click action
    // This ensures we don't over-block; clicks are logged but proceed
    // =========================================================================
    return "yellow";
  }

  /**
   * Log an action to the audit trail.
   */
  private audit(
    action: string,
    target: string,
    zone: ActionZone,
    result: "success" | "failure" | "blocked"
  ): void {
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      action,
      target,
      zone,
      result,
      persona: this.currentPersona?.name,
    };

    const auditFile = join(this.paths.auditDir, `audit-${new Date().toISOString().split("T")[0]}.json`);

    let entries: AuditEntry[] = [];
    if (existsSync(auditFile)) {
      entries = JSON.parse(readFileSync(auditFile, "utf-8"));
    }

    entries.push(entry);
    writeFileSync(auditFile, JSON.stringify(entries, null, 2));
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  /**
   * Clean up old files.
   */
  cleanup(options: CleanupOptions = {}): CleanupResult {
    const {
      dryRun = false,
      olderThan = 7,
      keepScreenshots = 10,
      keepJourneys = 5,
      keepSessions = 3,
    } = options;

    const result: CleanupResult = {
      deleted: 0,
      freedBytes: 0,
      details: {
        screenshots: { deleted: 0, freed: 0 },
        journeys: { deleted: 0, freed: 0 },
        sessions: { deleted: 0, freed: 0 },
        audit: { deleted: 0, freed: 0 },
      },
    };

    const cleanDir = (
      dir: string,
      pattern: RegExp,
      keep: number,
      category: keyof CleanupResult["details"]
    ) => {
      if (!existsSync(dir)) return;

      const files = readdirSync(dir)
        .filter((f) => pattern.test(f))
        .map((f) => ({
          name: f,
          path: join(dir, f),
          mtime: statSync(join(dir, f)).mtime,
          size: statSync(join(dir, f)).size,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      const cutoff = Date.now() - olderThan * 24 * 60 * 60 * 1000;
      const toDelete = files.slice(keep).filter((f) => f.mtime.getTime() < cutoff);

      for (const file of toDelete) {
        if (!dryRun) {
          unlinkSync(file.path);
        }
        result.deleted++;
        result.freedBytes += file.size;
        result.details[category].deleted++;
        result.details[category].freed += file.size;
      }
    };

    cleanDir(this.paths.screenshotsDir, /\.png$/i, keepScreenshots, "screenshots");
    cleanDir(this.paths.dataDir, /^journey-.*\.json$/i, keepJourneys, "journeys");
    cleanDir(this.paths.sessionsDir, /\.json$/i, keepSessions, "sessions");
    cleanDir(this.paths.auditDir, /\.json$/i, 30, "audit");

    return result;
  }

  /**
   * Get storage statistics.
   */
  getStorageStats(): Record<string, { count: number; size: number }> {
    const stats: Record<string, { count: number; size: number }> = {};

    const countDir = (dir: string, pattern: RegExp): { count: number; size: number } => {
      if (!existsSync(dir)) return { count: 0, size: 0 };

      const files = readdirSync(dir).filter((f) => pattern.test(f));
      let size = 0;
      for (const file of files) {
        size += statSync(join(dir, file)).size;
      }
      return { count: files.length, size };
    };

    stats.screenshots = countDir(this.paths.screenshotsDir, /\.png$/i);
    stats.journeys = countDir(this.paths.dataDir, /^journey-.*\.json$/i);
    stats.sessions = countDir(this.paths.sessionsDir, /\.json$/i);
    stats.audit = countDir(this.paths.auditDir, /\.json$/i);

    return stats;
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
  async saveBaseline(name: string, url?: string): Promise<string> {
    const baselinesDir = join(this.paths.dataDir, "baselines");
    if (!existsSync(baselinesDir)) {
      mkdirSync(baselinesDir, { recursive: true });
    }

    const page = await this.getPage();
    const screenshotPath = join(baselinesDir, `${name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const baseline = {
      name,
      url: url || page.url(),
      viewport: page.viewportSize() || { width: 1280, height: 800 },
      screenshotPath,
      created: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
    };

    const metaPath = join(baselinesDir, `${name}.json`);
    writeFileSync(metaPath, JSON.stringify(baseline, null, 2));

    return screenshotPath;
  }

  /**
   * Compare current page to a baseline.
   */
  async compareBaseline(name: string, threshold: number = 0.1): Promise<{
    baseline: string;
    current: string;
    diffPath?: string;
    diffPercentage: number;
    passed: boolean;
  }> {
    const baselinesDir = join(this.paths.dataDir, "baselines");
    const metaPath = join(baselinesDir, `${name}.json`);

    if (!existsSync(metaPath)) {
      throw new Error(`Baseline not found: ${name}`);
    }

    const baseline = JSON.parse(readFileSync(metaPath, "utf-8"));
    const page = await this.getPage();

    const currentPath = join(baselinesDir, `${name}-current-${Date.now()}.png`);
    await page.screenshot({ path: currentPath, fullPage: true });

    const baselineBuffer = readFileSync(baseline.screenshotPath);
    const currentBuffer = readFileSync(currentPath);

    const sizeDiff = Math.abs(baselineBuffer.length - currentBuffer.length);
    const maxSize = Math.max(baselineBuffer.length, currentBuffer.length);
    const diffPercentage = sizeDiff / maxSize;

    return {
      baseline: baseline.screenshotPath,
      current: currentPath,
      diffPercentage,
      passed: diffPercentage <= threshold,
    };
  }

  /**
   * List all visual baselines.
   */
  listBaselines(): string[] {
    const baselinesDir = join(this.paths.dataDir, "baselines");
    if (!existsSync(baselinesDir)) return [];
    return readdirSync(baselinesDir)
      .filter(f => f.endsWith(".json"))
      .map(f => f.replace(".json", ""));
  }

  // =========================================================================
  // Tier 2: Accessibility Audit (v2.5.0)
  // =========================================================================

  /**
   * Run accessibility audit on current page.
   */
  async auditAccessibility(): Promise<{
    url: string;
    violations: Array<{ id: string; impact: string; description: string; helpUrl: string }>;
    passes: number;
    score: number;
  }> {
    const page = await this.getPage();

    const results = await page.evaluate(() => {
      const violations: Array<{ id: string; impact: string; description: string; helpUrl: string }> = [];

      // Check images without alt
      document.querySelectorAll("img").forEach(img => {
        if (!img.alt && !img.getAttribute("aria-label")) {
          violations.push({
            id: "img-alt",
            impact: "serious",
            description: "Image missing alt text",
            helpUrl: "https://dequeuniversity.com/rules/axe/4.4/image-alt",
          });
        }
      });

      // Check buttons without text
      document.querySelectorAll("button").forEach(btn => {
        if (!btn.textContent?.trim() && !btn.getAttribute("aria-label")) {
          violations.push({
            id: "button-name",
            impact: "critical",
            description: "Button has no accessible name",
            helpUrl: "https://dequeuniversity.com/rules/axe/4.4/button-name",
          });
        }
      });

      // Check inputs without labels
      document.querySelectorAll("input:not([type='hidden'])").forEach(input => {
        const id = input.id;
        const hasLabel = id && document.querySelector(`label[for="${id}"]`);
        if (!hasLabel && !input.getAttribute("aria-label")) {
          violations.push({
            id: "label",
            impact: "serious",
            description: "Form input missing label",
            helpUrl: "https://dequeuniversity.com/rules/axe/4.4/label",
          });
        }
      });

      // Check lang attribute
      if (!document.documentElement.lang) {
        violations.push({
          id: "html-has-lang",
          impact: "serious",
          description: "Page missing lang attribute",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.4/html-has-lang",
        });
      }

      const passes = document.querySelectorAll("img[alt], button:not(:empty), label").length;
      return { violations, passes };
    });

    const score = results.passes > 0
      ? Math.round((results.passes / (results.passes + results.violations.length)) * 100)
      : 100;

    return {
      url: page.url(),
      violations: results.violations,
      passes: results.passes,
      score,
    };
  }

  // =========================================================================
  // Tier 2: Test Recording (v2.5.0)
  // =========================================================================

  private recordingActions: Array<{ type: string; selector?: string; value?: string; url?: string; timestamp: number }> = [];
  private isRecording = false;

  /**
   * Start recording user interactions.
   */
  async startRecording(url?: string): Promise<void> {
    this.isRecording = true;
    this.recordingActions = [];

    if (url) {
      await this.navigate(url);
      this.recordingActions.push({ type: "navigate", url, timestamp: Date.now() });
    }
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
    const recordingsDir = join(this.paths.dataDir, "recordings");
    if (!existsSync(recordingsDir)) {
      mkdirSync(recordingsDir, { recursive: true });
    }

    const recording = {
      name,
      actions: actions || this.recordingActions,
      created: new Date().toISOString(),
    };

    const filePath = join(recordingsDir, `${name}.json`);
    writeFileSync(filePath, JSON.stringify(recording, null, 2));

    return filePath;
  }

  /**
   * Generate test code from recording.
   */
  generateTestCode(name: string, actions: Array<{ type: string; selector?: string; value?: string; url?: string }>): string {
    let code = `// Generated test: ${name}\n\n`;
    code += `import { CBrowser } from 'cbrowser';\n\n`;
    code += `async function test_${name.replace(/[^a-zA-Z0-9]/g, "_")}() {\n`;
    code += `  const browser = new CBrowser();\n\n`;

    for (const action of actions) {
      switch (action.type) {
        case "navigate":
          code += `  await browser.navigate("${action.url}");\n`;
          break;
        case "click":
          code += `  await browser.click("${action.selector}");\n`;
          break;
        case "fill":
          code += `  await browser.fill("${action.selector}", "${action.value}");\n`;
          break;
      }
    }

    code += `\n  await browser.close();\n`;
    code += `}\n\n`;
    code += `test_${name.replace(/[^a-zA-Z0-9]/g, "_")}();\n`;

    return code;
  }

  // =========================================================================
  // Tier 2: Test Export (v2.5.0)
  // =========================================================================

  /**
   * Export test results as JUnit XML.
   */
  exportJUnit(suite: { name: string; tests: Array<{ name: string; status: string; duration: number; error?: string }> }, outputPath?: string): string {
    const filename = outputPath || join(this.paths.dataDir, `junit-${Date.now()}.xml`);

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<testsuite name="${suite.name}" tests="${suite.tests.length}">\n`;

    for (const test of suite.tests) {
      xml += `  <testcase name="${test.name}" time="${(test.duration / 1000).toFixed(3)}">\n`;
      if (test.status === "failed" && test.error) {
        xml += `    <failure message="${test.error.replace(/"/g, "&quot;")}">${test.error}</failure>\n`;
      }
      xml += `  </testcase>\n`;
    }

    xml += `</testsuite>\n`;
    writeFileSync(filename, xml);

    return filename;
  }

  /**
   * Export test results as TAP format.
   */
  exportTAP(suite: { name: string; tests: Array<{ name: string; status: string; error?: string }> }, outputPath?: string): string {
    const filename = outputPath || join(this.paths.dataDir, `tap-${Date.now()}.tap`);

    let tap = `TAP version 13\n`;
    tap += `1..${suite.tests.length}\n`;

    suite.tests.forEach((test, i) => {
      const status = test.status === "passed" ? "ok" : "not ok";
      tap += `${status} ${i + 1} ${test.name}\n`;
    });

    writeFileSync(filename, tap);
    return filename;
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
    options: { maxConcurrency?: number } = {}
  ): Promise<Array<{ device: string; result?: T; error?: string; duration: number }>> {
    const tasks = devices.map(device => ({
      name: device,
      config: { device },
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

