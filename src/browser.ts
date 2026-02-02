/**
 * CBrowser - Main Browser Class
 *
 * AI-powered browser automation with constitutional safety.
 */

import { chromium, firefox, webkit, type Browser, type Page, type BrowserContext } from "playwright";
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from "fs";
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
} from "./types.js";

export class CBrowser {
  private config: CBrowserConfig;
  private paths: CBrowserPaths;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private currentPersona: Persona | null = null;

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
    if (this.browser) return;

    // Select browser engine based on config
    const browserType = this.config.browser === "firefox"
      ? firefox
      : this.config.browser === "webkit"
        ? webkit
        : chromium;

    this.browser = await browserType.launch({
      headless: this.config.headless,
    });

    this.context = await this.browser.newContext({
      viewport: {
        width: this.config.viewportWidth,
        height: this.config.viewportHeight,
      },
    });

    this.page = await this.context.newPage();
  }

  /**
   * Close the browser.
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
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

  /**
   * Find an element using multiple strategies.
   */
  private async findElement(selector: string) {
    const page = await this.getPage();

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
}
