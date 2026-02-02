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
  SelectorCache,
  SelectorCacheStats,
} from "./types.js";
import { DEVICE_PRESETS, LOCATION_PRESETS } from "./types.js";

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

  constructor(userConfig: Partial<CBrowserConfig> = {}) {
    this.config = mergeConfig(userConfig);
    this.paths = ensureDirectories(getPaths(this.config.dataDir));
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /**
   * Launch the browser.
   */
  async launch(): Promise<void> {
    if (this.browser || this.context) return;

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
    if (this.config.persistent) {
      const browserStateDir = join(this.paths.dataDir, "browser-state");
      if (!existsSync(browserStateDir)) {
        mkdirSync(browserStateDir, { recursive: true });
      }
      this.context = await browserType.launchPersistentContext(browserStateDir, {
        headless: this.config.headless,
        ...contextOptions,
      });
      this.page = this.context.pages()[0] || await this.context.newPage();
      if (this.config.verbose) {
        console.log(`🔄 Using persistent browser context: ${browserStateDir}`);
      }
    } else {
      this.browser = await browserType.launch({
        headless: this.config.headless,
      });
      this.context = await this.browser.newContext(contextOptions);
      this.page = await this.context.newPage();
    }

    // Apply network mocks if configured
    if (this.config.networkMocks && this.config.networkMocks.length > 0) {
      await this.setupNetworkMocks(this.config.networkMocks);
    }

    // Set up network request/response tracking for HAR
    this.setupNetworkTracking();
  }

  /**
   * Close the browser.
   */
  async close(): Promise<void> {
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
   */
  private async getPage(): Promise<Page> {
    if (!this.page) {
      await this.launch();
    }
    return this.page!;
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
    const page = await this.getPage();
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
      const networkResponse: NetworkResponse = {
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

  // =========================================================================
  // Navigation
  // =========================================================================

  /**
   * Navigate to a URL.
   */
  async navigate(url: string): Promise<NavigationResult> {
    const page = await this.getPage();
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

    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: this.config.timeout,
    });

    const loadTime = Date.now() - startTime;
    const screenshot = await this.screenshot();

    return {
      url: page.url(),
      title: await page.title(),
      screenshot,
      errors,
      warnings,
      loadTime,
    };
  }

  // =========================================================================
  // Interaction
  // =========================================================================

  /**
   * Click an element using AI-powered selector.
   */
  async click(selector: string, options: { force?: boolean } = {}): Promise<ClickResult> {
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
        return {
          success: false,
          screenshot: await this.screenshot(),
          message: `Element not found: ${selector}`,
        };
      }

      await element.click();

      // Wait for any navigation or network activity
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

      this.audit("click", selector, zone, "success");

      return {
        success: true,
        screenshot: await this.screenshot(),
        message: `Clicked: ${selector}`,
      };
    } catch (error) {
      this.audit("click", selector, zone, "failure");
      return {
        success: false,
        screenshot: await this.screenshot(),
        message: `Failed to click: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Fill a form field.
   */
  async fill(selector: string, value: string): Promise<ClickResult> {
    const page = await this.getPage();

    try {
      const element = await this.findElement(selector);

      if (!element) {
        return {
          success: false,
          screenshot: await this.screenshot(),
          message: `Element not found: ${selector}`,
        };
      }

      await element.fill(value);

      this.audit("fill", selector, "yellow", "success");

      return {
        success: true,
        screenshot: await this.screenshot(),
        message: `Filled: ${selector}`,
      };
    } catch (error) {
      this.audit("fill", selector, "yellow", "failure");
      return {
        success: false,
        screenshot: await this.screenshot(),
        message: `Failed to fill: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // =========================================================================
  // Tier 5: Smart Retry (v5.0.0)
  // =========================================================================

  /**
   * Click with smart retry - automatically retries with alternative selectors on failure.
   */
  async smartClick(
    selector: string,
    options: { force?: boolean; maxRetries?: number; retryDelay?: number } = {}
  ): Promise<SmartRetryResult> {
    const maxRetries = options.maxRetries ?? 3;
    const retryDelay = options.retryDelay ?? 1000;
    const attempts: RetryAttempt[] = [];

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
        // Cache the working alternative for future use
        this.cacheAlternativeSelector(selector, alt.selector);

        return {
          success: true,
          attempts,
          finalSelector: alt.selector,
          message: `Clicked using alternative: ${alt.reason}`,
          screenshot: result.screenshot,
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

  /**
   * Find alternative selectors for an element.
   */
  private async findAlternativeSelectors(originalSelector: string): Promise<SelectorAlternative[]> {
    const page = await this.getPage();
    const alternatives: SelectorAlternative[] = [];

    try {
      // Try to find elements with similar text
      const elements = await page.$$('button, a, [role="button"], input[type="submit"]');

      for (const el of elements.slice(0, 10)) {
        const text = await el.textContent().catch(() => "");
        const ariaLabel = await el.getAttribute("aria-label").catch(() => "");
        const title = await el.getAttribute("title").catch(() => "");
        const id = await el.getAttribute("id").catch(() => "");
        const className = await el.getAttribute("class").catch(() => "");

        // Check if text matches original selector
        if (text && originalSelector.toLowerCase().includes(text.toLowerCase().trim().substring(0, 20))) {
          alternatives.push({
            selector: `text="${text.trim()}"`,
            confidence: 0.8,
            reason: `Text match: "${text.trim()}"`,
          });
        }

        // Check aria-label
        if (ariaLabel && originalSelector.toLowerCase().includes(ariaLabel.toLowerCase().substring(0, 20))) {
          alternatives.push({
            selector: `[aria-label="${ariaLabel}"]`,
            confidence: 0.9,
            reason: `Aria-label: "${ariaLabel}"`,
          });
        }

        // Check id
        if (id && originalSelector.toLowerCase().includes(id.toLowerCase())) {
          alternatives.push({
            selector: `#${id}`,
            confidence: 0.95,
            reason: `ID match: #${id}`,
          });
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
  // =========================================================================

  private selectorCache: SelectorCache | null = null;

  /**
   * Get the selector cache file path.
   */
  private getSelectorCachePath(): string {
    return join(this.paths.dataDir, "selector-cache.json");
  }

  /**
   * Load the selector cache from disk.
   */
  private loadSelectorCache(): SelectorCache {
    if (this.selectorCache) return this.selectorCache;

    const cachePath = this.getSelectorCachePath();
    if (existsSync(cachePath)) {
      try {
        const data = readFileSync(cachePath, "utf-8");
        this.selectorCache = JSON.parse(data);
        return this.selectorCache!;
      } catch {
        // Corrupted cache, start fresh
      }
    }

    this.selectorCache = { version: 1, entries: {} };
    return this.selectorCache;
  }

  /**
   * Save the selector cache to disk.
   */
  private saveSelectorCache(): void {
    if (!this.selectorCache) return;
    const cachePath = this.getSelectorCachePath();
    writeFileSync(cachePath, JSON.stringify(this.selectorCache, null, 2));
  }

  /**
   * Get cache key for a selector (includes domain for context).
   */
  private getSelectorCacheKey(selector: string, domain?: string): string {
    const d = domain || this.getCurrentDomain();
    return `${d}::${selector.toLowerCase()}`;
  }

  /**
   * Get current page domain.
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
   * Cache a working alternative selector for future use.
   */
  private cacheAlternativeSelector(original: string, working: string, reason: string = "Alternative found"): void {
    const cache = this.loadSelectorCache();
    const key = this.getSelectorCacheKey(original);
    const domain = this.getCurrentDomain();

    cache.entries[key] = {
      originalSelector: original,
      workingSelector: working,
      domain,
      successCount: 1,
      failCount: 0,
      lastUsed: new Date().toISOString(),
      reason,
    };

    this.saveSelectorCache();

    if (this.config.verbose) {
      console.log(`📦 Cached healed selector: "${original}" → "${working}"`);
    }
  }

  /**
   * Get a cached alternative selector if available.
   */
  private getCachedSelector(original: string): SelectorCacheEntry | null {
    const cache = this.loadSelectorCache();
    const key = this.getSelectorCacheKey(original);
    return cache.entries[key] || null;
  }

  /**
   * Update cache entry statistics.
   */
  private updateCacheStats(original: string, success: boolean): void {
    const cache = this.loadSelectorCache();
    const key = this.getSelectorCacheKey(original);
    const entry = cache.entries[key];

    if (entry) {
      if (success) {
        entry.successCount++;
      } else {
        entry.failCount++;
      }
      entry.lastUsed = new Date().toISOString();
      this.saveSelectorCache();
    }
  }

  /**
   * Get selector cache statistics.
   */
  getSelectorCacheStats(): SelectorCacheStats {
    const cache = this.loadSelectorCache();
    const entries = Object.values(cache.entries);

    const byDomain: Record<string, number> = {};
    for (const entry of entries) {
      byDomain[entry.domain] = (byDomain[entry.domain] || 0) + 1;
    }

    const topHealedSelectors = entries
      .sort((a, b) => b.successCount - a.successCount)
      .slice(0, 10)
      .map(e => ({
        original: e.originalSelector,
        working: e.workingSelector,
        heals: e.successCount,
      }));

    return {
      totalEntries: entries.length,
      totalHeals: entries.reduce((sum, e) => sum + e.successCount, 0),
      byDomain,
      topHealedSelectors,
    };
  }

  /**
   * Clear the selector cache.
   */
  clearSelectorCache(domain?: string): number {
    const cache = this.loadSelectorCache();
    let cleared = 0;

    if (domain) {
      // Clear only for specific domain
      for (const [key, entry] of Object.entries(cache.entries)) {
        if (entry.domain === domain) {
          delete cache.entries[key];
          cleared++;
        }
      }
    } else {
      // Clear all
      cleared = Object.keys(cache.entries).length;
      cache.entries = {};
    }

    this.saveSelectorCache();
    return cleared;
  }

  /**
   * List all cached selectors.
   */
  listCachedSelectors(domain?: string): SelectorCacheEntry[] {
    const cache = this.loadSelectorCache();
    let entries = Object.values(cache.entries);

    if (domain) {
      entries = entries.filter(e => e.domain === domain);
    }

    return entries.sort((a, b) => b.successCount - a.successCount);
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
    const page = await this.getPage();

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
    if (lowerAssertion.includes("page") && (lowerAssertion.includes("contains") || lowerAssertion.includes("has") || lowerAssertion.includes("shows"))) {
      const match = assertion.match(/["']([^"']+)["']/);
      const expected = match?.[1] || "";
      const content = await page.textContent("body") || "";
      const passed = content.toLowerCase().includes(expected.toLowerCase());

      return { passed, assertion, expected, message: passed ? `Page contains "${expected}"` : `Page does not contain "${expected}"` };
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
      const content = await page.textContent("body") || "";
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

    // Strategy 3: Text content
    const byText = page.getByText(selector, { exact: false }).first();
    if (await byText.count() > 0) {
      return byText;
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

    return null;
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

      default:
        // Generic text extraction
        data = await page.evaluate(() => document.body.innerText);
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
    const context = this.context!;

    const cookies = await context.cookies();
    const localStorage = await page.evaluate(() => {
      const data: Record<string, string> = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key) data[key] = window.localStorage.getItem(key) || "";
      }
      return data;
    });

    const sessionStorage = await page.evaluate(() => {
      const data: Record<string, string> = {};
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i);
        if (key) data[key] = window.sessionStorage.getItem(key) || "";
      }
      return data;
    });

    const url = page.url();
    const domain = new URL(url).hostname;

    const session: SavedSession = {
      name,
      created: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      domain,
      url,
      viewport: {
        width: this.config.viewportWidth,
        height: this.config.viewportHeight,
      },
      cookies: cookies as SavedSession["cookies"],
      localStorage,
      sessionStorage,
    };

    const sessionPath = join(this.paths.sessionsDir, `${name}.json`);
    writeFileSync(sessionPath, JSON.stringify(session, null, 2));
  }

  /**
   * Load a saved session.
   */
  async loadSession(name: string): Promise<boolean> {
    const sessionPath = join(this.paths.sessionsDir, `${name}.json`);

    if (!existsSync(sessionPath)) {
      return false;
    }

    const session: SavedSession = JSON.parse(readFileSync(sessionPath, "utf-8"));
    const page = await this.getPage();
    const context = this.context!;

    // Restore cookies
    if (session.cookies.length > 0) {
      await context.addCookies(session.cookies);
    }

    // Navigate to saved URL
    await page.goto(session.url, { waitUntil: "networkidle" });

    // Restore localStorage
    await page.evaluate((data) => {
      for (const [key, value] of Object.entries(data)) {
        window.localStorage.setItem(key, value);
      }
    }, session.localStorage);

    // Restore sessionStorage
    await page.evaluate((data) => {
      for (const [key, value] of Object.entries(data)) {
        window.sessionStorage.setItem(key, value);
      }
    }, session.sessionStorage);

    // Refresh to apply storage
    await page.reload({ waitUntil: "networkidle" });

    // Update lastUsed
    session.lastUsed = new Date().toISOString();
    writeFileSync(sessionPath, JSON.stringify(session, null, 2));

    return true;
  }

  /**
   * List all saved sessions.
   */
  listSessions(): string[] {
    const files = readdirSync(this.paths.sessionsDir);
    return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
  }

  /**
   * Delete a saved session.
   */
  deleteSession(name: string): boolean {
    const sessionPath = join(this.paths.sessionsDir, `${name}.json`);
    if (existsSync(sessionPath)) {
      unlinkSync(sessionPath);
      return true;
    }
    return false;
  }

  // =========================================================================
  // Journeys
  // =========================================================================

  /**
   * Run an autonomous journey.
   */
  async journey(options: JourneyOptions): Promise<JourneyResult> {
    const { persona: personaName, startUrl, goal, maxSteps = 20 } = options;

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

    // Simple autonomous exploration (simplified for public version)
    // In a full implementation, this would use AI to decide actions
    let stepCount = 0;
    let success = false;

    while (stepCount < maxSteps && !success) {
      stepCount++;

      // Wait with human-like timing
      const delay = this.getHumanDelay(persona);
      await new Promise((r) => setTimeout(r, delay));

      // Try to find clickable elements
      const clickable = await page.evaluate(() => {
        const elements = Array.from(
          document.querySelectorAll('a, button, [role="button"], input[type="submit"]')
        );
        return elements.slice(0, 5).map((el) => ({
          tag: el.tagName,
          text: el.textContent?.trim().substring(0, 50),
          href: (el as HTMLAnchorElement).href,
        }));
      });

      if (clickable.length === 0) {
        frictionPoints.push("No clickable elements found");
        break;
      }

      // Click a random element (simplified)
      const target = clickable[Math.floor(Math.random() * clickable.length)];
      const result = await this.click(target.text || target.tag);

      steps.push({
        action: "click",
        target: target.text || target.tag,
        result: result.message,
        screenshot: result.screenshot,
        timestamp: new Date().toISOString(),
      });

      // Check if goal might be achieved (simplified check)
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
   */
  private getHumanDelay(persona: Persona): number {
    const timing = persona.humanBehavior?.timing;
    if (!timing) return 500;

    const min = timing.reactionTime.min;
    const max = timing.reactionTime.max;
    return Math.floor(Math.random() * (max - min) + min);
  }

  // =========================================================================
  // Constitutional Safety
  // =========================================================================

  /**
   * Classify an action into a safety zone.
   */
  private classifyAction(action: string, target: string): ActionZone {
    const lowerTarget = target.toLowerCase();

    // Black zone - never execute
    if (
      lowerTarget.includes("bypass") ||
      lowerTarget.includes("inject") ||
      lowerTarget.includes("hack")
    ) {
      return "black";
    }

    // Red zone - requires force
    if (
      action === "click" &&
      (lowerTarget.includes("delete") ||
        lowerTarget.includes("remove") ||
        lowerTarget.includes("submit") ||
        lowerTarget.includes("purchase") ||
        lowerTarget.includes("pay") ||
        lowerTarget.includes("confirm"))
    ) {
      return "red";
    }

    // Yellow zone - log and proceed
    if (action === "click" || action === "fill") {
      return "yellow";
    }

    // Green zone - auto-execute
    return "green";
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

// ============================================================================
// Tier 3: Natural Language API (v3.0.0)
// ============================================================================

/**
 * Natural language command patterns.
 */
const NL_PATTERNS: Array<{
  pattern: RegExp;
  action: string;
  extract: (match: RegExpMatchArray) => Record<string, string>;
}> = [
  // Navigation
  { pattern: /^(?:go to|navigate to|open|visit)\s+(.+)$/i, action: "navigate", extract: (m) => ({ url: m[1] }) },
  { pattern: /^(?:go\s+)?back$/i, action: "back", extract: () => ({}) },
  { pattern: /^(?:go\s+)?forward$/i, action: "forward", extract: () => ({}) },
  { pattern: /^refresh|reload$/i, action: "reload", extract: () => ({}) },

  // Clicking
  { pattern: /^click(?:\s+on)?\s+(?:the\s+)?["']?(.+?)["']?$/i, action: "click", extract: (m) => ({ selector: m[1] }) },
  { pattern: /^press(?:\s+the)?\s+["']?(.+?)["']?(?:\s+button)?$/i, action: "click", extract: (m) => ({ selector: m[1] }) },
  { pattern: /^tap(?:\s+on)?\s+["']?(.+?)["']?$/i, action: "click", extract: (m) => ({ selector: m[1] }) },

  // Form filling
  { pattern: /^(?:type|enter|input|fill(?:\s+in)?)\s+["'](.+?)["']\s+(?:in(?:to)?|on)\s+(?:the\s+)?["']?(.+?)["']?$/i, action: "fill", extract: (m) => ({ value: m[1], selector: m[2] }) },
  { pattern: /^(?:fill(?:\s+in)?|set)\s+(?:the\s+)?["']?(.+?)["']?\s+(?:to|with|as)\s+["'](.+?)["']$/i, action: "fill", extract: (m) => ({ selector: m[1], value: m[2] }) },

  // Selecting
  { pattern: /^select\s+["'](.+?)["']\s+(?:from|in)\s+(?:the\s+)?["']?(.+?)["']?$/i, action: "select", extract: (m) => ({ value: m[1], selector: m[2] }) },
  { pattern: /^choose\s+["'](.+?)["']$/i, action: "click", extract: (m) => ({ selector: m[1] }) },

  // Screenshots
  { pattern: /^(?:take\s+a?\s*)?screenshot(?:\s+as\s+["']?(.+?)["']?)?$/i, action: "screenshot", extract: (m) => ({ path: m[1] || "" }) },
  { pattern: /^capture(?:\s+the)?\s+(?:page|screen)$/i, action: "screenshot", extract: () => ({}) },

  // Waiting
  { pattern: /^wait(?:\s+for)?\s+(\d+)\s*(?:ms|milliseconds?)?$/i, action: "wait", extract: (m) => ({ ms: m[1] }) },
  { pattern: /^wait(?:\s+for)?\s+(\d+)\s*(?:s|seconds?)$/i, action: "waitSeconds", extract: (m) => ({ seconds: m[1] }) },
  { pattern: /^wait(?:\s+for)?\s+["']?(.+?)["']?(?:\s+to\s+appear)?$/i, action: "waitFor", extract: (m) => ({ selector: m[1] }) },

  // Scrolling
  { pattern: /^scroll\s+(?:to\s+)?(?:the\s+)?(top|bottom)$/i, action: "scroll", extract: (m) => ({ direction: m[1] }) },
  { pattern: /^scroll\s+(up|down)(?:\s+(\d+))?$/i, action: "scrollBy", extract: (m) => ({ direction: m[1], amount: m[2] || "300" }) },

  // Extraction
  { pattern: /^(?:get|extract|find)\s+(?:all\s+)?(?:the\s+)?(.+)$/i, action: "extract", extract: (m) => ({ what: m[1] }) },
];

/**
 * Parse natural language into browser action.
 */
export function parseNaturalLanguage(command: string): { action: string; params: Record<string, string> } | null {
  const trimmed = command.trim();

  for (const { pattern, action, extract } of NL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return { action, params: extract(match) };
    }
  }

  return null;
}

/**
 * Execute a natural language command.
 */
export async function executeNaturalLanguage(browser: CBrowser, command: string): Promise<{
  success: boolean;
  action: string;
  result?: unknown;
  error?: string;
}> {
  const parsed = parseNaturalLanguage(command);

  if (!parsed) {
    return { success: false, action: "unknown", error: `Could not parse command: "${command}"` };
  }

  const { action, params } = parsed;

  try {
    let result: unknown;

    switch (action) {
      case "navigate":
        result = await browser.navigate(params.url);
        break;
      case "click":
        result = await browser.click(params.selector);
        break;
      case "fill":
        result = await browser.fill(params.selector, params.value);
        break;
      case "screenshot":
        result = await browser.screenshot(params.path || undefined);
        break;
      case "wait":
        await new Promise(r => setTimeout(r, parseInt(params.ms)));
        result = { waited: parseInt(params.ms) };
        break;
      case "waitSeconds":
        await new Promise(r => setTimeout(r, parseInt(params.seconds) * 1000));
        result = { waited: parseInt(params.seconds) * 1000 };
        break;
      case "extract":
        result = await browser.extract(params.what);
        break;
      default:
        return { success: false, action, error: `Unsupported action: ${action}` };
    }

    return { success: true, action, result };
  } catch (e: any) {
    return { success: false, action, error: e.message };
  }
}

/**
 * Execute multiple natural language commands in sequence.
 */
export async function executeNaturalLanguageScript(
  browser: CBrowser,
  commands: string[]
): Promise<Array<{ command: string; success: boolean; action: string; result?: unknown; error?: string }>> {
  const results = [];

  for (const command of commands) {
    if (!command.trim() || command.startsWith("#")) continue; // Skip empty lines and comments
    const result = await executeNaturalLanguage(browser, command);
    results.push({ command, ...result });
    if (!result.success) break; // Stop on first error
  }

  return results;
}

// ============================================================================
// Tier 4: Visual AI Understanding (v4.0.0)
// ============================================================================

/**
 * AI-powered semantic element finding.
 * Examples: "the cheapest product", "login form", "main navigation"
 */
export async function findElementByIntent(
  browser: CBrowser,
  intent: string
): Promise<{ selector: string; confidence: number; description: string } | null> {
  const page = await (browser as any).getPage();

  // Type for extracted elements
  type PageElement = {
    tag: string;
    text: string;
    classes: string;
    id: string;
    role: string;
    type: string;
    price?: string;
    selector: string;
  };

  // Extract page structure for AI analysis
  const pageData: PageElement[] = await page.evaluate(() => {
    const elements: Array<{
      tag: string;
      text: string;
      classes: string;
      id: string;
      role: string;
      type: string;
      price?: string;
      selector: string;
    }> = [];

    // Find interactive elements
    const interactives = document.querySelectorAll(
      "button, a, input, select, [role='button'], [onclick], .btn, .card, .product, [data-price], .price"
    );

    interactives.forEach((el, i) => {
      const text = (el as HTMLElement).innerText?.trim().slice(0, 100) || "";
      const priceMatch = text.match(/\$[\d,.]+|\d+\.\d{2}/);

      elements.push({
        tag: el.tagName.toLowerCase(),
        text,
        classes: el.className.toString().slice(0, 100),
        id: el.id,
        role: el.getAttribute("role") || "",
        type: (el as HTMLInputElement).type || "",
        price: priceMatch ? priceMatch[0] : undefined,
        selector: el.id ? `#${el.id}` : `${el.tagName.toLowerCase()}:nth-of-type(${i + 1})`,
      });
    });

    return elements;
  });

  // Intent matching logic
  const intentLower = intent.toLowerCase();

  // Price-based intents
  if (intentLower.includes("cheapest") || intentLower.includes("lowest price")) {
    const withPrices = pageData.filter(el => el.price);
    if (withPrices.length > 0) {
      const sorted = withPrices.sort((a, b) => {
        const priceA = parseFloat(a.price!.replace(/[$,]/g, ""));
        const priceB = parseFloat(b.price!.replace(/[$,]/g, ""));
        return priceA - priceB;
      });
      return {
        selector: sorted[0].selector,
        confidence: 0.8,
        description: `Cheapest item: ${sorted[0].text.slice(0, 50)} (${sorted[0].price})`,
      };
    }
  }

  if (intentLower.includes("most expensive") || intentLower.includes("highest price")) {
    const withPrices = pageData.filter(el => el.price);
    if (withPrices.length > 0) {
      const sorted = withPrices.sort((a, b) => {
        const priceA = parseFloat(a.price!.replace(/[$,]/g, ""));
        const priceB = parseFloat(b.price!.replace(/[$,]/g, ""));
        return priceB - priceA;
      });
      return {
        selector: sorted[0].selector,
        confidence: 0.8,
        description: `Most expensive: ${sorted[0].text.slice(0, 50)} (${sorted[0].price})`,
      };
    }
  }

  // Form-based intents
  if (intentLower.includes("login") || intentLower.includes("sign in")) {
    const loginBtn = pageData.find(el =>
      el.text.toLowerCase().includes("login") ||
      el.text.toLowerCase().includes("sign in") ||
      el.classes.includes("login")
    );
    if (loginBtn) {
      return { selector: loginBtn.selector, confidence: 0.9, description: "Login button/form" };
    }
  }

  if (intentLower.includes("search")) {
    const searchInput = pageData.find(el =>
      el.type === "search" ||
      el.classes.includes("search") ||
      el.id.includes("search")
    );
    if (searchInput) {
      return { selector: searchInput.selector, confidence: 0.9, description: "Search input" };
    }
  }

  // Text-based matching
  const textMatch = pageData.find(el =>
    el.text.toLowerCase().includes(intentLower) ||
    el.classes.toLowerCase().includes(intentLower)
  );
  if (textMatch) {
    return { selector: textMatch.selector, confidence: 0.7, description: `Matched: ${textMatch.text.slice(0, 50)}` };
  }

  return null;
}

// ============================================================================
// Tier 4: Autonomous Bug Hunter (v4.0.0)
// ============================================================================

export interface BugReport {
  type: "broken-link" | "console-error" | "a11y-violation" | "slow-resource" | "missing-image" | "form-error";
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  url: string;
  selector?: string;
  screenshot?: string;
}

/**
 * Autonomously explore a page and find bugs.
 */
export async function huntBugs(
  browser: CBrowser,
  url: string,
  options: { maxDepth?: number; maxPages?: number; timeout?: number } = {}
): Promise<{
  bugs: BugReport[];
  pagesVisited: number;
  duration: number;
}> {
  const startTime = Date.now();
  const bugs: BugReport[] = [];
  const visited = new Set<string>();
  const maxPages = options.maxPages || 10;
  const timeout = options.timeout || 60000;

  const page = await (browser as any).getPage();
  const consoleErrors: string[] = [];

  // Capture console errors
  page.on("console", (msg: any) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  // Start with initial URL
  await browser.navigate(url);
  visited.add(url);

  // Check for issues on current page
  const pageIssues = await page.evaluate(() => {
    const issues: Array<{ type: string; description: string; selector?: string }> = [];

    // Check for broken images
    document.querySelectorAll("img").forEach((img, i) => {
      if (!img.complete || img.naturalWidth === 0) {
        issues.push({
          type: "missing-image",
          description: `Broken image: ${img.src || img.alt || "unknown"}`,
          selector: `img:nth-of-type(${i + 1})`,
        });
      }
    });

    // Check for empty links
    document.querySelectorAll("a").forEach((a, i) => {
      if (!a.href || a.href === "#" || a.href === "javascript:void(0)") {
        issues.push({
          type: "broken-link",
          description: `Empty/invalid link: ${a.textContent?.slice(0, 50) || "no text"}`,
          selector: `a:nth-of-type(${i + 1})`,
        });
      }
    });

    // Check for empty buttons
    document.querySelectorAll("button").forEach((btn, i) => {
      if (!btn.textContent?.trim() && !btn.getAttribute("aria-label")) {
        issues.push({
          type: "a11y-violation",
          description: "Button with no accessible text",
          selector: `button:nth-of-type(${i + 1})`,
        });
      }
    });

    // Check for missing form labels
    document.querySelectorAll("input:not([type='hidden'])").forEach((input, i) => {
      const id = input.id;
      const hasLabel = id && document.querySelector(`label[for="${id}"]`);
      if (!hasLabel && !input.getAttribute("aria-label") && !input.getAttribute("placeholder")) {
        issues.push({
          type: "form-error",
          description: "Input without label or placeholder",
          selector: `input:nth-of-type(${i + 1})`,
        });
      }
    });

    return issues;
  });

  // Add page issues to bugs
  for (const issue of pageIssues) {
    bugs.push({
      type: issue.type as BugReport["type"],
      severity: issue.type === "a11y-violation" ? "high" : "medium",
      description: issue.description,
      url,
      selector: issue.selector,
    });
  }

  // Add console errors
  for (const error of consoleErrors) {
    bugs.push({
      type: "console-error",
      severity: "high",
      description: error.slice(0, 200),
      url,
    });
  }

  return {
    bugs,
    pagesVisited: visited.size,
    duration: Date.now() - startTime,
  };
}

// ============================================================================
// Tier 4: Cross-Browser Diff (v4.0.0)
// ============================================================================

export interface BrowserDiffResult {
  url: string;
  browsers: string[];
  differences: Array<{
    type: "visual" | "timing" | "content" | "error";
    description: string;
    browsers: string[];
  }>;
  screenshots: Record<string, string>;
  metrics: Record<string, { loadTime: number; resourceCount: number }>;
}

/**
 * Compare page behavior across multiple browsers.
 */
export async function crossBrowserDiff(
  url: string,
  browsers: Array<"chromium" | "firefox" | "webkit"> = ["chromium", "firefox", "webkit"]
): Promise<BrowserDiffResult> {
  const { chromium, firefox, webkit } = await import("playwright");
  const screenshots: Record<string, string> = {};
  const metrics: Record<string, { loadTime: number; resourceCount: number }> = {};
  const differences: BrowserDiffResult["differences"] = [];
  const contents: Record<string, string> = {};

  const browserLaunchers = { chromium, firefox, webkit };

  for (const browserName of browsers) {
    const launcher = browserLaunchers[browserName];
    const browser = await launcher.launch({ headless: true });
    const page = await browser.newPage();

    const startTime = Date.now();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    const loadTime = Date.now() - startTime;

    // Capture metrics
    const resourceCount = await page.evaluate(() => performance.getEntriesByType("resource").length);
    metrics[browserName] = { loadTime, resourceCount };

    // Capture screenshot
    const screenshotPath = `/tmp/cross-browser-${browserName}-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    screenshots[browserName] = screenshotPath;

    // Capture content hash
    contents[browserName] = await page.evaluate(() => document.body.innerText.slice(0, 1000));

    await browser.close();
  }

  // Compare timing
  const loadTimes = Object.entries(metrics).map(([b, m]) => ({ browser: b, time: m.loadTime }));
  const avgTime = loadTimes.reduce((sum, t) => sum + t.time, 0) / loadTimes.length;
  const slowBrowsers = loadTimes.filter(t => t.time > avgTime * 1.5);
  if (slowBrowsers.length > 0) {
    differences.push({
      type: "timing",
      description: `Significantly slower in: ${slowBrowsers.map(b => `${b.browser} (${b.time}ms)`).join(", ")}`,
      browsers: slowBrowsers.map(b => b.browser),
    });
  }

  // Compare content
  const contentValues = Object.values(contents);
  const contentMismatch = contentValues.some(c => c !== contentValues[0]);
  if (contentMismatch) {
    differences.push({
      type: "content",
      description: "Page content differs between browsers",
      browsers,
    });
  }

  return { url, browsers, differences, screenshots, metrics };
}

// ============================================================================
// Tier 4: Chaos Engineering (v4.0.0)
// ============================================================================

export interface ChaosConfig {
  /** Simulate slow network (ms latency) */
  networkLatency?: number;
  /** Simulate offline mode */
  offline?: boolean;
  /** Block specific URL patterns */
  blockUrls?: string[];
  /** Inject random delays (0-1 probability) */
  randomDelays?: number;
  /** Fail specific API calls */
  failApis?: Array<{ pattern: string; status: number; body?: string }>;
  /** CPU throttling (1-20x slowdown) */
  cpuThrottle?: number;
}

/**
 * Apply chaos engineering conditions to browser.
 */
export async function applyChaos(browser: CBrowser, config: ChaosConfig): Promise<void> {
  const context = await (browser as any).context;
  const page = await (browser as any).getPage();

  // Network conditions
  if (config.offline) {
    await context.setOffline(true);
  }

  // Route interception for latency/failures
  if (config.networkLatency || config.blockUrls || config.failApis) {
    await page.route("**/*", async (route: any) => {
      const url = route.request().url();

      // Block URLs
      if (config.blockUrls?.some(pattern => url.includes(pattern))) {
        await route.abort();
        return;
      }

      // Fail specific APIs
      const failConfig = config.failApis?.find(f => url.includes(f.pattern));
      if (failConfig) {
        await route.fulfill({
          status: failConfig.status,
          body: failConfig.body || "Chaos: Simulated failure",
        });
        return;
      }

      // Add latency
      if (config.networkLatency) {
        await new Promise(r => setTimeout(r, config.networkLatency));
      }

      // Random delays
      if (config.randomDelays && Math.random() < config.randomDelays) {
        await new Promise(r => setTimeout(r, Math.random() * 3000));
      }

      await route.continue();
    });
  }
}

/**
 * Run chaos test - apply conditions and verify app resilience.
 */
export async function runChaosTest(
  browser: CBrowser,
  url: string,
  chaos: ChaosConfig,
  actions: string[] = []
): Promise<{
  passed: boolean;
  errors: string[];
  duration: number;
  screenshot: string;
}> {
  const startTime = Date.now();
  const errors: string[] = [];

  try {
    await applyChaos(browser, chaos);
    await browser.navigate(url);

    // Execute actions
    for (const action of actions) {
      const result = await executeNaturalLanguage(browser, action);
      if (!result.success) {
        errors.push(`Action failed: ${action} - ${result.error}`);
      }
    }

    const screenshot = await browser.screenshot();

    return {
      passed: errors.length === 0,
      errors,
      duration: Date.now() - startTime,
      screenshot,
    };
  } catch (e: any) {
    return {
      passed: false,
      errors: [...errors, e.message],
      duration: Date.now() - startTime,
      screenshot: "",
    };
  }
}
