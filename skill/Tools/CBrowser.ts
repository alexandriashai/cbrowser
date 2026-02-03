#!/usr/bin/env bun
/**
 * CBrowser CLI v5.0.0
 *
 * ACTUALLY EXECUTES browser automation with Playwright.
 * AI vision, constitutional safety, personas, autonomous journeys,
 * and PERSISTENT SESSION MANAGEMENT.
 *
 * Usage:
 *   bun run CBrowser.ts <command> [options]
 *
 * Commands:
 *   navigate <url>              Navigate and screenshot
 *   click <selector>            Click element
 *   fill <selector> <value>     Fill input field
 *   extract <what>              Extract data from page
 *   screenshot [path]           Take screenshot
 *   journey <persona>           Run autonomous journey
 *   persona list                List available personas
 *   session save <name>         Save current session (cookies, storage, URL)
 *   session load <name>         Load a saved session
 *   session list                List saved sessions
 *   session delete <name>       Delete a saved session
 *   login --url --email --pass  Login and save authenticated session
 *   session-info --url          Check authentication status
 *   storage                     Show storage usage stats
 *   cleanup [--dry-run]         Clean up old files in .memory
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// ============================================================================
// Configuration
// ============================================================================

const SKILL_DIR = join(homedir(), ".claude/skills/CBrowser");
const MEMORY_DIR = join(SKILL_DIR, ".memory");
const SESSIONS_DIR = join(MEMORY_DIR, "sessions");
const PERSONAS_DIR = join(MEMORY_DIR, "personas");
const SCENARIOS_DIR = join(MEMORY_DIR, "scenarios");
const AUDIT_DIR = join(MEMORY_DIR, "audit");
const SCREENSHOTS_DIR = join(MEMORY_DIR, "screenshots");
const HELPERS_DIR = join(MEMORY_DIR, "helpers");
const HAR_DIR = join(MEMORY_DIR, "har");
const BASELINES_DIR_INIT = join(MEMORY_DIR, "baselines");
const RECORDINGS_DIR_INIT = join(MEMORY_DIR, "recordings");
const BROWSER_STATE_DIR_INIT = join(MEMORY_DIR, "browser-state");
const CREDENTIALS_FILE = join(MEMORY_DIR, "credentials.json");

// Ensure all data directories exist on first run
[MEMORY_DIR, SESSIONS_DIR, PERSONAS_DIR, SCENARIOS_DIR, AUDIT_DIR, SCREENSHOTS_DIR, HELPERS_DIR, HAR_DIR, BASELINES_DIR_INIT, RECORDINGS_DIR_INIT, BROWSER_STATE_DIR_INIT].forEach(
  (dir) => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
);

// ============================================================================
// Types
// ============================================================================

// Detailed human behavior parameters
interface TimingParams {
  reactionTime: { min: number; max: number };      // MS before first action
  clickDelay: { min: number; max: number };        // MS between clicks
  typeSpeed: { min: number; max: number };         // MS between keystrokes
  readingSpeed: number;                             // Words per minute
  scrollPauseTime: { min: number; max: number };   // MS pause after scroll
}

interface ErrorParams {
  misClickRate: number;           // 0-1, chance of missing target
  doubleClickAccidental: number;  // 0-1, chance of accidental double-click
  typoRate: number;               // 0-1, chance of typo per character
  backtrackRate: number;          // 0-1, chance of going back after action
}

interface MouseParams {
  curvature: number;      // 0-1, how curved the mouse path is
  jitter: number;         // Pixels of random jitter
  overshoot: number;      // 0-1, chance of overshooting target
  speed: "slow" | "normal" | "fast";
}

interface AttentionParams {
  pattern: "f-pattern" | "z-pattern" | "skim" | "thorough";
  scrollBehavior: "continuous" | "chunked" | "jump";
  focusAreas: Array<"header" | "cta" | "images" | "prices" | "text">;
  distractionRate: number;  // 0-1, chance of getting distracted
}

interface HumanBehaviorParams {
  timing: TimingParams;
  errors: ErrorParams;
  mouse: MouseParams;
  attention: AttentionParams;
}

interface Persona {
  name: string;
  description: string;
  demographics: {
    age_range?: string;
    tech_level?: "beginner" | "intermediate" | "expert";
    device?: "desktop" | "mobile" | "tablet";
  };
  behaviors: Record<string, unknown>;
  humanBehavior?: HumanBehaviorParams;  // Detailed human simulation params
  context?: {
    viewport?: [number, number];
  };
}

interface AuditEntry {
  timestamp: string;
  action: string;
  target?: string;
  zone: "green" | "yellow" | "red";
  result: "success" | "failure" | "blocked";
  screenshot?: string;
  persona?: string;
  duration?: number;
}

interface NavigationResult {
  url: string;
  title: string;
  screenshot: string;
  errors: string[];
  warnings: string[];
  loadTime: number;
}

interface ClickResult {
  success: boolean;
  screenshot: string;
  message: string;
}

interface ExtractResult {
  data: unknown;
  screenshot: string;
}

interface SavedSession {
  name: string;
  created: string;
  lastUsed: string;
  domain: string;
  url: string;
  viewport: { width: number; height: number };
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }>;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  // Optional test credentials for auto-relogin (base64 encoded for minimal protection)
  testCredentials?: {
    email: string;
    password: string; // base64 encoded
    baseUrl: string;
  };
}

interface ConsoleEntry {
  type: "log" | "info" | "warn" | "error" | "debug" | "trace";
  text: string;
  timestamp: string;
  url?: string;
  lineNumber?: number;
}

interface JourneyStep {
  action: string;
  target?: string;
  result: string;
  screenshot: string;
  timestamp: string;
  consoleLogs?: ConsoleEntry[]; // Console logs during this step
}

interface JourneyResult {
  persona: string;
  goal: string;
  steps: JourneyStep[];
  success: boolean;
  frictionPoints: string[];
  totalTime: number;
  consoleLogs: ConsoleEntry[]; // All console logs for the journey
}

// ============================================================================
// Device Emulation Types (v2.4.0)
// ============================================================================

interface DeviceDescriptor {
  name: string;
  userAgent: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
}

const DEVICE_PRESETS: Record<string, DeviceDescriptor> = {
  "iphone-15": {
    name: "iPhone 15",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  "iphone-15-pro-max": {
    name: "iPhone 15 Pro Max",
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  "pixel-8": {
    name: "Pixel 8",
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
  },
  "pixel-8-pro": {
    name: "Pixel 8 Pro",
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    viewport: { width: 448, height: 998 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
  },
  "samsung-galaxy-s24": {
    name: "Samsung Galaxy S24",
    userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    viewport: { width: 360, height: 780 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  "ipad-pro-12": {
    name: "iPad Pro 12.9",
    userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 1024, height: 1366 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  "ipad-air": {
    name: "iPad Air",
    userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 820, height: 1180 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  "desktop-1080p": {
    name: "Desktop 1080p",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  "desktop-1440p": {
    name: "Desktop 1440p",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 2560, height: 1440 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
};

// ============================================================================
// Geolocation Types (v2.4.0)
// ============================================================================

interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

const LOCATION_PRESETS: Record<string, GeoLocation> = {
  "new-york": { latitude: 40.7128, longitude: -74.006, accuracy: 100 },
  "london": { latitude: 51.5074, longitude: -0.1278, accuracy: 100 },
  "tokyo": { latitude: 35.6762, longitude: 139.6503, accuracy: 100 },
  "paris": { latitude: 48.8566, longitude: 2.3522, accuracy: 100 },
  "sydney": { latitude: -33.8688, longitude: 151.2093, accuracy: 100 },
  "berlin": { latitude: 52.52, longitude: 13.405, accuracy: 100 },
  "san-francisco": { latitude: 37.7749, longitude: -122.4194, accuracy: 100 },
  "singapore": { latitude: 1.3521, longitude: 103.8198, accuracy: 100 },
  "dubai": { latitude: 25.2048, longitude: 55.2708, accuracy: 100 },
  "mumbai": { latitude: 19.076, longitude: 72.8777, accuracy: 100 },
};

// ============================================================================
// Network & Performance Types (v2.4.0)
// ============================================================================

interface NetworkMock {
  urlPattern: string | RegExp;
  method?: string;
  status?: number;
  headers?: Record<string, string>;
  body?: string | object;
  delay?: number;
  abort?: boolean;
}

interface NetworkRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  resourceType: string;
  timestamp: string;
}

interface HAREntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    queryString: Array<{ name: string; value: string }>;
    postData?: { mimeType: string; text: string };
    headersSize: number;
    bodySize: number;
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    content: { size: number; mimeType: string; text?: string };
    redirectURL: string;
    headersSize: number;
    bodySize: number;
  };
  cache: object;
  timings: {
    blocked: number;
    dns: number;
    connect: number;
    send: number;
    wait: number;
    receive: number;
    ssl: number;
  };
}

interface HARLog {
  version: string;
  creator: { name: string; version: string };
  entries: HAREntry[];
}

interface PerformanceMetrics {
  lcp?: number;
  fid?: number;
  cls?: number;
  fcp?: number;
  ttfb?: number;
  tti?: number;
  tbt?: number;
  domContentLoaded?: number;
  load?: number;
  resourceCount?: number;
  transferSize?: number;
  lcpRating?: "good" | "needs-improvement" | "poor";
  fidRating?: "good" | "needs-improvement" | "poor";
  clsRating?: "good" | "needs-improvement" | "poor";
}

interface PerformanceBudget {
  lcp?: number;
  fid?: number;
  cls?: number;
  fcp?: number;
  ttfb?: number;
  transferSize?: number;
  resourceCount?: number;
}

interface PerformanceAuditResult {
  url: string;
  timestamp: string;
  metrics: PerformanceMetrics;
  budget?: PerformanceBudget;
  passed: boolean;
  violations: string[];
}

// Global state for HAR recording
let harEntries: HAREntry[] = [];
let networkRequests: NetworkRequest[] = [];
let isRecordingHar = false;

// ============================================================================
// Tier 2: Visual Regression Types (v2.5.0)
// ============================================================================

interface VisualRegressionResult {
  baseline: string;
  current: string;
  diff?: string;
  diffPercentage: number;
  passed: boolean;
  threshold: number;
  timestamp: string;
}

interface VisualBaseline {
  name: string;
  url: string;
  device?: string;
  viewport: { width: number; height: number };
  screenshotPath: string;
  created: string;
  lastUsed: string;
}

// ============================================================================
// Tier 2: Accessibility Types (v2.5.0)
// ============================================================================

interface AccessibilityViolation {
  id: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  description: string;
  help: string;
  helpUrl: string;
  nodes: Array<{
    html: string;
    target: string[];
    failureSummary: string;
  }>;
}

interface AccessibilityAuditResult {
  url: string;
  timestamp: string;
  violations: AccessibilityViolation[];
  passes: number;
  incomplete: number;
  score: number;
}

// ============================================================================
// Tier 2: Test Output Types (v2.5.0)
// ============================================================================

interface TestResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  duration: number;
  error?: string;
  screenshot?: string;
}

interface TestSuiteResult {
  name: string;
  timestamp: string;
  duration: number;
  tests: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
}

// Directory for visual baselines
const BASELINES_DIR = join(MEMORY_DIR, "baselines");

// ============================================================================
// Tier 2: Test Recording Types (v2.5.0)
// ============================================================================

interface RecordedAction {
  type: "navigate" | "click" | "fill" | "select" | "screenshot" | "wait";
  selector?: string;
  value?: string;
  url?: string;
  timestamp: number;
}

interface RecordedTest {
  name: string;
  startUrl: string;
  actions: RecordedAction[];
  created: string;
}

// Recording state
let isRecording = false;
let recordedActions: RecordedAction[] = [];
let recordingStartUrl = "";

// ============================================================================
// Tier 2: Webhook Types (v2.5.0)
// ============================================================================

interface WebhookConfig {
  name: string;
  url: string;
  events: Array<"test.pass" | "test.fail" | "journey.complete" | "visual.fail">;
  format: "slack" | "discord" | "generic";
}

// Webhooks config file
const WEBHOOKS_FILE = join(MEMORY_DIR, "webhooks.json");
const RECORDINGS_DIR = join(MEMORY_DIR, "recordings");

// ============================================================================
// Tier 4: Visual AI Types (v4.0.0)
// ============================================================================

interface AIElement {
  selector: string;
  confidence: number;
  description: string;
}

interface PageElement {
  tag: string;
  text: string;
  classes: string;
  id: string;
  role: string;
  type: string;
  price?: string;
  selector: string;
}

// ============================================================================
// Tier 4: Bug Hunter Types (v4.0.0)
// ============================================================================

interface BugReport {
  type: "broken-link" | "console-error" | "a11y-violation" | "slow-resource" | "missing-image" | "form-error";
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  url: string;
  selector?: string;
  screenshot?: string;
}

interface HuntOptions {
  maxPages?: number;
  timeout?: number;
  checkLinks?: boolean;
  checkConsole?: boolean;
  checkA11y?: boolean;
  checkImages?: boolean;
  checkForms?: boolean;
}

interface HuntResult {
  bugs: BugReport[];
  pagesVisited: number;
  duration: number;
}

// ============================================================================
// Tier 4: Cross-Browser Diff Types (v4.0.0)
// ============================================================================

type BrowserName = "chromium" | "firefox" | "webkit";

interface BrowserDiffResult {
  url: string;
  browsers: BrowserName[];
  differences: BrowserDifference[];
  screenshots: Record<BrowserName, string>;
  timing: Record<BrowserName, number>;
}

interface BrowserDifference {
  type: "visual" | "timing" | "content" | "console";
  description: string;
  browsers: BrowserName[];
  details: string;
}

// ============================================================================
// Tier 4: Chaos Engineering Types (v4.0.0)
// ============================================================================

interface ChaosConfig {
  networkLatency?: number;
  offline?: boolean;
  blockUrls?: string[];
  failApiCalls?: string[];
  cpuThrottle?: number;
  memoryPressure?: boolean;
}

interface ChaosTestResult {
  url: string;
  chaos: ChaosConfig;
  survived: boolean;
  errors: string[];
  screenshots: string[];
  duration: number;
}

// ============================================================================
// Tier 5: Smart Automation Types (v5.0.0)
// ============================================================================

interface SmartRetryResult {
  success: boolean;
  attempts: RetryAttempt[];
  finalSelector: string | null;
  message: string;
  screenshot: string;
  aiSuggestion?: string;
}

interface RetryAttempt {
  selector: string;
  success: boolean;
  error?: string;
  timestamp: string;
}

interface AssertionResult {
  passed: boolean;
  assertion: string;
  actual?: string;
  expected?: string;
  message: string;
  screenshot: string;
}

interface SelectorAlternative {
  selector: string;
  confidence: number;
  reason: string;
}

interface SelectorCacheEntry {
  originalSelector: string;
  workingSelector: string;
  domain: string;
  successCount: number;
  failCount: number;
  lastUsed: string;
  reason: string;
}

interface SelectorCache {
  version: number;
  entries: Record<string, SelectorCacheEntry>;
}

interface SelectorCacheStats {
  totalEntries: number;
  totalSuccesses: number;
  totalFailures: number;
  topDomains: Array<{ domain: string; count: number }>;
}

interface FormAnalysis {
  selector: string;
  action: string;
  method: string;
  fields: Array<{
    name: string;
    inputType: string;
    label: string;
    required: boolean;
    selector: string;
  }>;
  submitButton: {
    text: string;
    selector: string;
  } | null;
  isLoginForm: boolean;
  isSearchForm: boolean;
}

interface PageAnalysis {
  url: string;
  title: string;
  forms: FormAnalysis[];
  buttons: PageElement[];
  links: PageElement[];
  inputs: PageElement[];
  selects: PageElement[];
  hasLogin: boolean;
  hasSearch: boolean;
  hasNavigation: boolean;
}

interface TestStep {
  action: "navigate" | "click" | "fill" | "assert" | "wait";
  target?: string;
  value?: string;
  description: string;
}

interface GeneratedTest {
  name: string;
  description: string;
  steps: TestStep[];
  assertions: string[];
}

interface TestGenerationResult {
  url: string;
  analysis: PageAnalysis;
  tests: GeneratedTest[];
  cbrowserScript: string;
  playwrightCode: string;
}

// Selector cache file
const SELECTOR_CACHE_FILE = join(MEMORY_DIR, "selector-cache.json");

// Global selector cache
let selectorCache: SelectorCache | null = null;

// ============================================================================
// Built-in Personas
// ============================================================================

const BUILTIN_PERSONAS: Record<string, Persona> = {
  "power-user": {
    name: "power-user",
    description: "Tech-savvy user who knows shortcuts and expects efficiency",
    demographics: { age_range: "25-40", tech_level: "expert", device: "desktop" },
    behaviors: { click_speed: "fast", read_time: "minimal", uses_keyboard: true },
    humanBehavior: {
      timing: {
        reactionTime: { min: 100, max: 300 },
        clickDelay: { min: 100, max: 400 },
        typeSpeed: { min: 30, max: 80 },
        readingSpeed: 400,
        scrollPauseTime: { min: 200, max: 500 },
      },
      errors: {
        misClickRate: 0.02,
        doubleClickAccidental: 0.01,
        typoRate: 0.01,
        backtrackRate: 0.05,
      },
      mouse: {
        curvature: 0.15,
        jitter: 1,
        overshoot: 0.05,
        speed: "fast",
      },
      attention: {
        pattern: "f-pattern",
        scrollBehavior: "jump",
        focusAreas: ["cta", "header"],
        distractionRate: 0.02,
      },
    },
    context: { viewport: [1920, 1080] },
  },
  "first-timer": {
    name: "first-timer",
    description: "New user exploring the site for the first time",
    demographics: { age_range: "any", tech_level: "beginner", device: "desktop" },
    behaviors: { click_speed: "slow", read_time: "long", hovers_before_click: true },
    humanBehavior: {
      timing: {
        reactionTime: { min: 500, max: 1500 },
        clickDelay: { min: 800, max: 2000 },
        typeSpeed: { min: 100, max: 250 },
        readingSpeed: 200,
        scrollPauseTime: { min: 1000, max: 3000 },
      },
      errors: {
        misClickRate: 0.08,
        doubleClickAccidental: 0.05,
        typoRate: 0.05,
        backtrackRate: 0.15,
      },
      mouse: {
        curvature: 0.35,
        jitter: 3,
        overshoot: 0.15,
        speed: "slow",
      },
      attention: {
        pattern: "z-pattern",
        scrollBehavior: "chunked",
        focusAreas: ["header", "text", "images", "cta"],
        distractionRate: 0.10,
      },
    },
    context: { viewport: [1280, 800] },
  },
  "mobile-user": {
    name: "mobile-user",
    description: "User on smartphone with touch interface",
    demographics: { age_range: "18-45", tech_level: "intermediate", device: "mobile" },
    behaviors: { tap_accuracy: "44px_minimum", scrolls_frequently: true },
    humanBehavior: {
      timing: {
        reactionTime: { min: 200, max: 600 },
        clickDelay: { min: 300, max: 800 },
        typeSpeed: { min: 80, max: 180 },
        readingSpeed: 250,
        scrollPauseTime: { min: 300, max: 1000 },
      },
      errors: {
        misClickRate: 0.10,  // Fat finger
        doubleClickAccidental: 0.03,
        typoRate: 0.08,  // Touch keyboard
        backtrackRate: 0.12,
      },
      mouse: {
        curvature: 0.0,  // Touch is direct
        jitter: 8,  // Touch inaccuracy
        overshoot: 0.0,
        speed: "normal",
      },
      attention: {
        pattern: "skim",
        scrollBehavior: "continuous",
        focusAreas: ["cta", "images", "prices"],
        distractionRate: 0.15,
      },
    },
    context: { viewport: [375, 812] },
  },
  "elderly-user": {
    name: "elderly-user",
    description: "Older adult with potential vision and motor limitations",
    demographics: { age_range: "65+", tech_level: "beginner", device: "desktop" },
    behaviors: { click_speed: "slow", read_time: "long", prefers_larger_text: true },
    humanBehavior: {
      timing: {
        reactionTime: { min: 800, max: 2500 },
        clickDelay: { min: 1000, max: 3000 },
        typeSpeed: { min: 200, max: 500 },
        readingSpeed: 150,
        scrollPauseTime: { min: 2000, max: 5000 },
      },
      errors: {
        misClickRate: 0.15,
        doubleClickAccidental: 0.20,
        typoRate: 0.10,
        backtrackRate: 0.20,
      },
      mouse: {
        curvature: 0.40,
        jitter: 5,
        overshoot: 0.25,
        speed: "slow",
      },
      attention: {
        pattern: "thorough",
        scrollBehavior: "chunked",
        focusAreas: ["text", "header", "cta"],
        distractionRate: 0.08,
      },
    },
    context: { viewport: [1280, 800] },
  },
  "screen-reader-user": {
    name: "screen-reader-user",
    description: "Blind user navigating with screen reader and keyboard only",
    demographics: { age_range: "any", tech_level: "intermediate", device: "desktop" },
    behaviors: { click_speed: "normal", read_time: "long", uses_keyboard: true },
    humanBehavior: {
      timing: {
        reactionTime: { min: 300, max: 800 },
        clickDelay: { min: 400, max: 1000 },
        typeSpeed: { min: 50, max: 120 },
        readingSpeed: 300,
        scrollPauseTime: { min: 500, max: 1500 },
      },
      errors: {
        misClickRate: 0.03,
        doubleClickAccidental: 0.02,
        typoRate: 0.03,
        backtrackRate: 0.10,
      },
      mouse: {
        curvature: 0.0,
        jitter: 0,
        overshoot: 0.0,
        speed: "normal",
      },
      attention: {
        pattern: "thorough",
        scrollBehavior: "chunked",
        focusAreas: ["header", "text", "cta"],
        distractionRate: 0.05,
      },
    },
    context: { viewport: [1280, 800] },
  },
  "impatient-user": {
    name: "impatient-user",
    description: "User who abandons slow or confusing experiences quickly",
    demographics: { age_range: "18-35", tech_level: "intermediate", device: "desktop" },
    behaviors: { abandons_after: "3s", skips_reading: true },
    humanBehavior: {
      timing: {
        reactionTime: { min: 100, max: 400 },
        clickDelay: { min: 150, max: 500 },
        typeSpeed: { min: 40, max: 100 },
        readingSpeed: 500,  // Skims
        scrollPauseTime: { min: 100, max: 400 },
      },
      errors: {
        misClickRate: 0.06,
        doubleClickAccidental: 0.08,  // Clicks fast, sometimes double
        typoRate: 0.04,
        backtrackRate: 0.03,  // Doesn't go back, just leaves
      },
      mouse: {
        curvature: 0.20,
        jitter: 2,
        overshoot: 0.10,
        speed: "fast",
      },
      attention: {
        pattern: "skim",
        scrollBehavior: "jump",
        focusAreas: ["cta", "prices"],
        distractionRate: 0.25,  // High - easily distracted
      },
    },
    context: { viewport: [1440, 900] },
  },
};

// ============================================================================
// Human Behavior Simulation Engine
// ============================================================================

// QWERTY keyboard adjacency map for realistic typos
const ADJACENT_KEYS: Record<string, string[]> = {
  'a': ['q', 'w', 's', 'z'],
  'b': ['v', 'g', 'h', 'n'],
  'c': ['x', 'd', 'f', 'v'],
  'd': ['s', 'e', 'r', 'f', 'c', 'x'],
  'e': ['w', 's', 'd', 'r'],
  'f': ['d', 'r', 't', 'g', 'v', 'c'],
  'g': ['f', 't', 'y', 'h', 'b', 'v'],
  'h': ['g', 'y', 'u', 'j', 'n', 'b'],
  'i': ['u', 'j', 'k', 'o'],
  'j': ['h', 'u', 'i', 'k', 'm', 'n'],
  'k': ['j', 'i', 'o', 'l', 'm'],
  'l': ['k', 'o', 'p'],
  'm': ['n', 'j', 'k'],
  'n': ['b', 'h', 'j', 'm'],
  'o': ['i', 'k', 'l', 'p'],
  'p': ['o', 'l'],
  'q': ['w', 'a'],
  'r': ['e', 'd', 'f', 't'],
  's': ['a', 'w', 'e', 'd', 'x', 'z'],
  't': ['r', 'f', 'g', 'y'],
  'u': ['y', 'h', 'j', 'i'],
  'v': ['c', 'f', 'g', 'b'],
  'w': ['q', 'a', 's', 'e'],
  'x': ['z', 's', 'd', 'c'],
  'y': ['t', 'g', 'h', 'u'],
  'z': ['a', 's', 'x'],
  '1': ['2', 'q'],
  '2': ['1', '3', 'q', 'w'],
  '3': ['2', '4', 'w', 'e'],
  '4': ['3', '5', 'e', 'r'],
  '5': ['4', '6', 'r', 't'],
  '6': ['5', '7', 't', 'y'],
  '7': ['6', '8', 'y', 'u'],
  '8': ['7', '9', 'u', 'i'],
  '9': ['8', '0', 'i', 'o'],
  '0': ['9', 'o', 'p'],
};

// ============================================================================
// Research-Based Calibration Constants
// Sources: Nielsen Norman Group, Baymard Institute, Google UX Research
// ============================================================================

const RESEARCH_DATA = {
  // Average human reaction times (milliseconds)
  // Source: Human Benchmark data from 100M+ samples
  reactionTime: {
    visualStimulus: 250,      // Average visual reaction
    audioStimulus: 170,       // Average audio reaction
    complexDecision: 400,     // Choice reaction time
    ageMultiplier: {          // Multiplier by age group
      "18-24": 0.9,
      "25-34": 1.0,
      "35-44": 1.1,
      "45-54": 1.2,
      "55-64": 1.4,
      "65+": 1.7,
    },
  },

  // Reading speeds (words per minute)
  // Source: Marc Brysbaert (2019) meta-analysis
  readingSpeed: {
    average: 238,             // Silent reading
    skimming: 450,            // Quick scan
    careful: 150,             // Comprehension focus
    mobileReduction: 0.85,    // Mobile reduces speed 15%
  },

  // Mouse movement patterns
  // Source: Fitts's Law research
  fittsLaw: {
    baseTime: 200,            // MS base movement time
    indexOfDifficulty: 0.1,   // ID coefficient
  },

  // Form field hesitation (milliseconds)
  // Source: Baymard Institute checkout UX research
  formHesitation: {
    email: 500,               // Familiar, low hesitation
    password: 800,            // Privacy concern
    phone: 1200,              // Privacy concern, formatting
    creditCard: 2000,         // High security concern
    ssn: 3500,                // Maximum hesitation
    address: 700,             // Moderate - needs recall
    name: 300,                // Very familiar
    dateOfBirth: 900,         // Needs recall
    securityQuestion: 1500,   // Decision required
  },

  // Mobile thumb zone reachability (iPhone X dimensions)
  // Source: Steven Hoober thumb zone research
  thumbZone: {
    // Percentages of screen height from bottom
    easy: { top: 0.33, bottom: 0 },      // Bottom third - easy reach
    ok: { top: 0.66, bottom: 0.33 },     // Middle third - stretch
    hard: { top: 1.0, bottom: 0.66 },    // Top third - hard to reach
    // Horizontal zones (right-handed user)
    leftEdge: 0.15,                       // Hard to reach
    rightEdge: 0.85,                      // Easy for right thumb
  },

  // Eye tracking patterns
  // Source: Nielsen Norman Group eye tracking studies
  eyeTracking: {
    // F-pattern: Users read horizontally then scan vertically
    fPattern: {
      firstHorizontal: { y: 0.1, width: 0.8 },   // Top horizontal bar
      secondHorizontal: { y: 0.25, width: 0.6 }, // Second bar (shorter)
      verticalScan: { x: 0.1, height: 0.8 },     // Left vertical scan
    },
    // Z-pattern: For less text-heavy pages
    zPattern: {
      topLeft: { x: 0.1, y: 0.1 },
      topRight: { x: 0.9, y: 0.1 },
      bottomLeft: { x: 0.1, y: 0.9 },
      bottomRight: { x: 0.9, y: 0.9 },
    },
    // Fixation durations (milliseconds)
    fixationDuration: {
      min: 100,
      average: 250,
      max: 500,
    },
    // Saccade (eye jump) patterns
    saccadeSpeed: 500,  // Degrees per second
  },

  // Frustration thresholds
  // Source: Akamai/Gomez studies on user patience
  frustration: {
    pageLoadAbandonment: 3000,    // MS before abandon on slow load
    formErrorTolerance: 3,        // Errors before frustration
    clicksToGoal: 4,              // Max clicks before frustration
    scrollDepthAbandonment: 0.7,  // 70% scroll without finding = abandon
  },

  // Hover behavior before clicking
  // Source: Click tracking analytics aggregate data
  hoverBehavior: {
    preClickHover: 150,           // MS hover before click
    linkPreview: 400,             // MS to trigger preview intent
    tooltipTrigger: 800,          // MS to show tooltip
    uncertaintyMultiplier: 2.5,   // Multiply hover time when uncertain
  },
};

// Sensitive form fields that cause hesitation
const SENSITIVE_FIELDS = {
  high: ['ssn', 'social', 'tax', 'credit', 'card', 'cvv', 'cvc', 'security'],
  medium: ['password', 'phone', 'mobile', 'birth', 'dob', 'address', 'street'],
  low: ['email', 'name', 'first', 'last', 'username', 'city', 'state', 'zip'],
};

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getNearbyKey(char: string): string {
  const lower = char.toLowerCase();
  const adjacent = ADJACENT_KEYS[lower];
  if (adjacent && adjacent.length > 0) {
    const nearby = adjacent[Math.floor(Math.random() * adjacent.length)];
    return char === char.toUpperCase() ? nearby.toUpperCase() : nearby;
  }
  return char;
}

interface Point {
  x: number;
  y: number;
}

/**
 * Generate Bézier curve control points for natural mouse movement
 */
function generateBezierPath(start: Point, end: Point, params: MouseParams): Point[] {
  const points: Point[] = [];
  const distance = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));

  // Number of points based on distance
  const numPoints = Math.max(10, Math.floor(distance / 20));

  // Generate control point for curve
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  // Perpendicular offset for curve
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const perpX = -dy * params.curvature * (Math.random() > 0.5 ? 1 : -1);
  const perpY = dx * params.curvature * (Math.random() > 0.5 ? 1 : -1);

  const controlPoint: Point = {
    x: midX + perpX,
    y: midY + perpY,
  };

  // Generate points along quadratic Bézier curve
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const x = Math.pow(1 - t, 2) * start.x + 2 * (1 - t) * t * controlPoint.x + Math.pow(t, 2) * end.x;
    const y = Math.pow(1 - t, 2) * start.y + 2 * (1 - t) * t * controlPoint.y + Math.pow(t, 2) * end.y;

    // Add jitter
    const jitterX = randomFloat(-params.jitter, params.jitter);
    const jitterY = randomFloat(-params.jitter, params.jitter);

    points.push({ x: x + jitterX, y: y + jitterY });
  }

  // Maybe overshoot
  if (Math.random() < params.overshoot) {
    const overshootDistance = randomBetween(5, 15);
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    points.push({
      x: end.x + Math.cos(angle) * overshootDistance,
      y: end.y + Math.sin(angle) * overshootDistance,
    });
    // Then correct back
    points.push(end);
  }

  return points;
}

/**
 * HumanBehavior - Wraps Playwright page with realistic human behaviors
 */
class HumanBehavior {
  private page: Page;
  private params: HumanBehaviorParams;
  private personaName: string;
  private lastMousePosition: Point = { x: 0, y: 0 };

  constructor(page: Page, persona: Persona) {
    this.page = page;
    this.personaName = persona.name;
    this.params = persona.humanBehavior || getDefaultBehaviorParams();
  }

  /**
   * Wait with natural timing variation
   */
  async wait(type: "reaction" | "click" | "scroll" | "read", wordCount?: number): Promise<void> {
    let ms: number;

    switch (type) {
      case "reaction":
        ms = randomBetween(this.params.timing.reactionTime.min, this.params.timing.reactionTime.max);
        break;
      case "click":
        ms = randomBetween(this.params.timing.clickDelay.min, this.params.timing.clickDelay.max);
        break;
      case "scroll":
        ms = randomBetween(this.params.timing.scrollPauseTime.min, this.params.timing.scrollPauseTime.max);
        break;
      case "read":
        const words = wordCount || 50;
        ms = (words / this.params.timing.readingSpeed) * 60 * 1000;
        break;
      default:
        ms = 500;
    }

    console.log(`   ⏳ [${this.personaName}] Waiting ${ms}ms (${type})`);
    await delay(ms);
  }

  /**
   * Move mouse along natural curved path
   */
  async moveMouseTo(x: number, y: number): Promise<void> {
    const start = this.lastMousePosition;
    const end = { x, y };

    const path = generateBezierPath(start, end, this.params.mouse);

    // Speed multiplier
    const speedMultiplier = {
      slow: 2.0,
      normal: 1.0,
      fast: 0.5,
    }[this.params.mouse.speed];

    for (const point of path) {
      await this.page.mouse.move(point.x, point.y);
      await delay(randomBetween(5, 15) * speedMultiplier);
    }

    this.lastMousePosition = end;
  }

  /**
   * Click with human-like behavior (hesitation, potential errors)
   */
  async click(selector: string): Promise<{ success: boolean; misClicked: boolean; recovered: boolean }> {
    console.log(`   🖱️ [${this.personaName}] Clicking: ${selector}`);

    // Initial hesitation
    await this.wait("reaction");

    // Get element position
    const element = await this.page.locator(selector).first();
    const box = await element.boundingBox();

    if (!box) {
      console.log(`   ❌ [${this.personaName}] Element not found: ${selector}`);
      return { success: false, misClicked: false, recovered: false };
    }

    // Calculate click target (center with some variation)
    const targetX = box.x + box.width / 2 + randomFloat(-box.width * 0.1, box.width * 0.1);
    const targetY = box.y + box.height / 2 + randomFloat(-box.height * 0.1, box.height * 0.1);

    // Move mouse naturally
    await this.moveMouseTo(targetX, targetY);

    // Check for mis-click
    let misClicked = false;
    let recovered = false;

    if (Math.random() < this.params.errors.misClickRate) {
      misClicked = true;
      console.log(`   ⚠️ [${this.personaName}] Mis-clicked! Recovering...`);

      // Click slightly off target
      const missX = targetX + randomBetween(-20, 20);
      const missY = targetY + randomBetween(-20, 20);
      await this.page.mouse.click(missX, missY);

      // Pause to "realize" mistake
      await delay(randomBetween(300, 800));

      // Move to correct target and click
      await this.moveMouseTo(targetX, targetY);
      await this.page.mouse.click(targetX, targetY);
      recovered = true;
    } else {
      // Check for accidental double-click
      if (Math.random() < this.params.errors.doubleClickAccidental) {
        console.log(`   ⚠️ [${this.personaName}] Accidental double-click`);
        await this.page.mouse.dblclick(targetX, targetY);
      } else {
        await this.page.mouse.click(targetX, targetY);
      }
    }

    // Post-click delay
    await this.wait("click");

    return { success: true, misClicked, recovered };
  }

  /**
   * Type with realistic delays and potential typos
   */
  async type(selector: string, text: string): Promise<{ typos: number; corrections: number }> {
    console.log(`   ⌨️ [${this.personaName}] Typing ${text.length} chars`);

    await this.click(selector);

    let typos = 0;
    let corrections = 0;

    for (const char of text) {
      // Check for typo
      if (Math.random() < this.params.errors.typoRate && char.match(/[a-zA-Z0-9]/)) {
        const wrongKey = getNearbyKey(char);
        await this.page.keyboard.type(wrongKey);
        typos++;

        // Pause to "notice" mistake
        await delay(randomBetween(100, 400));

        // Backspace and correct
        await this.page.keyboard.press("Backspace");
        await delay(randomBetween(50, 150));
        corrections++;
      }

      // Type the character
      await this.page.keyboard.type(char);

      // Natural typing delay
      const typeDelay = randomBetween(
        this.params.timing.typeSpeed.min,
        this.params.timing.typeSpeed.max
      );
      await delay(typeDelay);
    }

    console.log(`   ✅ [${this.personaName}] Typed with ${typos} typos, ${corrections} corrections`);
    return { typos, corrections };
  }

  /**
   * Scroll with persona-specific behavior
   */
  async scroll(direction: "down" | "up" = "down", amount: number = 300): Promise<void> {
    console.log(`   📜 [${this.personaName}] Scrolling ${direction}`);

    const scrollAmount = direction === "down" ? amount : -amount;

    if (this.params.attention.scrollBehavior === "continuous") {
      // Smooth continuous scroll
      const steps = 10;
      const stepAmount = scrollAmount / steps;
      for (let i = 0; i < steps; i++) {
        await this.page.mouse.wheel(0, stepAmount);
        await delay(randomBetween(30, 80));
      }
    } else if (this.params.attention.scrollBehavior === "chunked") {
      // Chunk scroll with pause
      await this.page.mouse.wheel(0, scrollAmount);
      await this.wait("scroll");
    } else {
      // Jump scroll (fast, no pauses)
      await this.page.mouse.wheel(0, scrollAmount * 2);
    }

    // Maybe pause to read after scroll
    if (Math.random() > this.params.attention.distractionRate) {
      await this.wait("scroll");
    }
  }

  /**
   * Read content on page (simulated reading time)
   */
  async readContent(selector?: string): Promise<void> {
    let wordCount = 50;

    if (selector) {
      try {
        const text = await this.page.locator(selector).textContent();
        wordCount = text?.split(/\s+/).length || 50;
      } catch {
        // Use default
      }
    }

    console.log(`   📖 [${this.personaName}] Reading ~${wordCount} words`);
    await this.wait("read", wordCount);
  }

  /**
   * Check if user would get distracted and abandon
   */
  shouldAbandon(): boolean {
    return Math.random() < this.params.attention.distractionRate;
  }

  /**
   * Check if user would backtrack
   */
  shouldBacktrack(): boolean {
    return Math.random() < this.params.errors.backtrackRate;
  }

  /**
   * Get a summary of this persona's behavior characteristics
   */
  // =========================================================================
  // Eye Tracking Simulation
  // =========================================================================

  /**
   * Simulate eye tracking pattern on the page
   * Returns array of fixation points the user would look at
   */
  async simulateEyeTracking(viewport: { width: number; height: number }): Promise<Point[]> {
    const pattern = this.params.attention.pattern;
    const fixations: Point[] = [];

    console.log(`   👁️ [${this.personaName}] Eye tracking: ${pattern}`);

    if (pattern === "f-pattern") {
      // F-pattern: Two horizontal scans + vertical scan
      const fp = RESEARCH_DATA.eyeTracking.fPattern;

      // First horizontal line (top)
      for (let x = 0.1; x <= fp.firstHorizontal.width; x += 0.15) {
        fixations.push({
          x: x * viewport.width,
          y: fp.firstHorizontal.y * viewport.height,
        });
      }

      // Second horizontal line (shorter)
      for (let x = 0.1; x <= fp.secondHorizontal.width; x += 0.15) {
        fixations.push({
          x: x * viewport.width,
          y: fp.secondHorizontal.y * viewport.height,
        });
      }

      // Vertical scan down left side
      for (let y = 0.3; y <= 0.8; y += 0.1) {
        fixations.push({
          x: fp.verticalScan.x * viewport.width,
          y: y * viewport.height,
        });
      }
    } else if (pattern === "z-pattern") {
      // Z-pattern: Corners in Z shape
      const zp = RESEARCH_DATA.eyeTracking.zPattern;
      fixations.push(
        { x: zp.topLeft.x * viewport.width, y: zp.topLeft.y * viewport.height },
        { x: zp.topRight.x * viewport.width, y: zp.topRight.y * viewport.height },
        { x: zp.bottomLeft.x * viewport.width, y: zp.bottomLeft.y * viewport.height },
        { x: zp.bottomRight.x * viewport.width, y: zp.bottomRight.y * viewport.height }
      );
    } else if (pattern === "skim") {
      // Skim: Quick jumps to key areas
      const focusAreas = this.params.attention.focusAreas;
      if (focusAreas.includes("header")) {
        fixations.push({ x: viewport.width * 0.5, y: viewport.height * 0.1 });
      }
      if (focusAreas.includes("cta")) {
        fixations.push({ x: viewport.width * 0.7, y: viewport.height * 0.3 });
      }
      if (focusAreas.includes("prices")) {
        fixations.push({ x: viewport.width * 0.8, y: viewport.height * 0.4 });
      }
    } else {
      // Thorough: Grid-based scanning
      for (let y = 0.1; y <= 0.9; y += 0.15) {
        for (let x = 0.1; x <= 0.9; x += 0.2) {
          fixations.push({ x: x * viewport.width, y: y * viewport.height });
        }
      }
    }

    // Simulate fixations with appropriate timing
    for (const fixation of fixations) {
      await this.moveMouseTo(fixation.x, fixation.y);
      const fixationTime = randomBetween(
        RESEARCH_DATA.eyeTracking.fixationDuration.min,
        RESEARCH_DATA.eyeTracking.fixationDuration.average
      );
      await delay(fixationTime);
    }

    return fixations;
  }

  // =========================================================================
  // Form Field Hesitation
  // =========================================================================

  /**
   * Calculate hesitation time for a form field based on sensitivity
   */
  getFieldHesitation(fieldName: string, fieldType: string): number {
    const name = fieldName.toLowerCase();
    const type = fieldType.toLowerCase();

    let baseHesitation = RESEARCH_DATA.formHesitation.name; // Default

    // Check for sensitive fields
    for (const sensitiveWord of SENSITIVE_FIELDS.high) {
      if (name.includes(sensitiveWord) || type.includes(sensitiveWord)) {
        baseHesitation = RESEARCH_DATA.formHesitation.ssn;
        console.log(`   ⚠️ [${this.personaName}] High sensitivity field: ${fieldName}`);
        break;
      }
    }

    if (baseHesitation === RESEARCH_DATA.formHesitation.name) {
      for (const sensitiveWord of SENSITIVE_FIELDS.medium) {
        if (name.includes(sensitiveWord) || type.includes(sensitiveWord)) {
          if (name.includes("password") || type === "password") {
            baseHesitation = RESEARCH_DATA.formHesitation.password;
          } else if (name.includes("phone") || type === "tel") {
            baseHesitation = RESEARCH_DATA.formHesitation.phone;
          } else if (name.includes("address")) {
            baseHesitation = RESEARCH_DATA.formHesitation.address;
          } else {
            baseHesitation = RESEARCH_DATA.formHesitation.dateOfBirth;
          }
          console.log(`   ⚡ [${this.personaName}] Medium sensitivity field: ${fieldName}`);
          break;
        }
      }
    }

    // Specific type checks
    if (type === "email") baseHesitation = RESEARCH_DATA.formHesitation.email;
    if (type === "password") baseHesitation = RESEARCH_DATA.formHesitation.password;

    // Adjust for persona characteristics
    const techMultiplier = {
      beginner: 1.5,
      intermediate: 1.0,
      expert: 0.7,
    }[this.params.timing.readingSpeed < 200 ? "beginner" :
       this.params.timing.readingSpeed > 350 ? "expert" : "intermediate"] || 1.0;

    return Math.floor(baseHesitation * techMultiplier);
  }

  /**
   * Fill form field with hesitation behavior
   */
  async fillFormField(selector: string, value: string, fieldName?: string): Promise<void> {
    const name = fieldName || selector;

    // Get field type from page
    let fieldType = "text";
    try {
      fieldType = await this.page.locator(selector).getAttribute("type") || "text";
    } catch {
      // Use default
    }

    // Calculate and apply hesitation
    const hesitation = this.getFieldHesitation(name, fieldType);
    console.log(`   ⏸️ [${this.personaName}] Hesitating ${hesitation}ms before "${name}"`);
    await delay(hesitation);

    // Now type with normal behavior
    await this.type(selector, value);
  }

  // =========================================================================
  // Mobile Thumb Zone Reachability
  // =========================================================================

  /**
   * Check if element is in easy/ok/hard thumb zone
   */
  getThumbZoneReachability(elementY: number, viewportHeight: number): "easy" | "ok" | "hard" {
    const relativeY = elementY / viewportHeight;

    if (relativeY >= RESEARCH_DATA.thumbZone.easy.bottom &&
        relativeY <= RESEARCH_DATA.thumbZone.easy.top) {
      return "easy";
    } else if (relativeY >= RESEARCH_DATA.thumbZone.ok.bottom &&
               relativeY <= RESEARCH_DATA.thumbZone.ok.top) {
      return "ok";
    }
    return "hard";
  }

  /**
   * Mobile click with thumb zone awareness
   */
  async mobileClick(selector: string): Promise<{ success: boolean; reachability: string; adjusted: boolean }> {
    console.log(`   📱 [${this.personaName}] Mobile tap: ${selector}`);

    const element = await this.page.locator(selector).first();
    const box = await element.boundingBox();

    if (!box) {
      return { success: false, reachability: "unknown", adjusted: false };
    }

    const viewport = this.page.viewportSize() || { width: 375, height: 812 };
    const reachability = this.getThumbZoneReachability(box.y + box.height / 2, viewport.height);

    console.log(`   📍 [${this.personaName}] Thumb zone: ${reachability}`);

    // Adjust behavior based on reachability
    let adjusted = false;
    if (reachability === "hard") {
      // User might scroll to bring element into easier zone
      if (Math.random() < 0.6) {
        console.log(`   📜 [${this.personaName}] Scrolling to improve reach`);
        await this.scroll("up", 150);
        adjusted = true;
        await delay(200);
      }
      // Increase miss rate for hard-to-reach elements
      this.params.errors.misClickRate *= 1.5;
    }

    const result = await this.click(selector);

    // Reset miss rate if we modified it
    if (reachability === "hard") {
      this.params.errors.misClickRate /= 1.5;
    }

    return { success: result.success, reachability, adjusted };
  }

  // =========================================================================
  // Frustration Detection
  // =========================================================================

  private frustrationLevel = 0;
  private errorCount = 0;
  private clickCount = 0;

  /**
   * Track frustration indicators
   */
  trackFrustration(event: "error" | "slowLoad" | "click" | "scroll" | "success"): void {
    switch (event) {
      case "error":
        this.errorCount++;
        this.frustrationLevel += 20;
        break;
      case "slowLoad":
        this.frustrationLevel += 15;
        break;
      case "click":
        this.clickCount++;
        if (this.clickCount > RESEARCH_DATA.frustration.clicksToGoal) {
          this.frustrationLevel += 10;
        }
        break;
      case "scroll":
        // Deep scrolling without finding content
        this.frustrationLevel += 5;
        break;
      case "success":
        // Success reduces frustration
        this.frustrationLevel = Math.max(0, this.frustrationLevel - 15);
        this.clickCount = 0;
        break;
    }

    if (this.frustrationLevel > 0) {
      console.log(`   😤 [${this.personaName}] Frustration: ${this.frustrationLevel}%`);
    }
  }

  /**
   * Check if user would abandon due to frustration
   */
  wouldAbandon(): { abandon: boolean; reason: string } {
    if (this.frustrationLevel >= 80) {
      return { abandon: true, reason: "High frustration level" };
    }
    if (this.errorCount >= RESEARCH_DATA.frustration.formErrorTolerance) {
      return { abandon: true, reason: `${this.errorCount} form errors` };
    }
    if (this.clickCount >= RESEARCH_DATA.frustration.clicksToGoal * 1.5) {
      return { abandon: true, reason: "Too many clicks to goal" };
    }
    return { abandon: false, reason: "" };
  }

  /**
   * Reset frustration tracking (new page/task)
   */
  resetFrustration(): void {
    this.frustrationLevel = 0;
    this.errorCount = 0;
    this.clickCount = 0;
  }

  // =========================================================================
  // Hover Preview Behavior
  // =========================================================================

  /**
   * Hover over element before clicking (link preview behavior)
   */
  async hoverPreview(selector: string, uncertain: boolean = false): Promise<void> {
    console.log(`   🔍 [${this.personaName}] Hover preview: ${selector}`);

    const element = await this.page.locator(selector).first();
    const box = await element.boundingBox();

    if (!box) return;

    // Move to element
    await this.moveMouseTo(box.x + box.width / 2, box.y + box.height / 2);

    // Calculate hover duration
    let hoverTime = RESEARCH_DATA.hoverBehavior.preClickHover;

    // Beginners hover longer
    if (this.params.attention.pattern === "thorough" ||
        this.params.attention.pattern === "z-pattern") {
      hoverTime = RESEARCH_DATA.hoverBehavior.linkPreview;
    }

    // Uncertainty increases hover time
    if (uncertain) {
      hoverTime *= RESEARCH_DATA.hoverBehavior.uncertaintyMultiplier;
      console.log(`   🤔 [${this.personaName}] Uncertain - extended hover`);
    }

    await delay(hoverTime);
  }

  /**
   * Click with hover preview (natural link clicking)
   */
  async clickWithPreview(selector: string, uncertain: boolean = false): Promise<{ success: boolean; hoverTime: number }> {
    const startTime = Date.now();

    // Hover first
    await this.hoverPreview(selector, uncertain);

    // Then click
    const result = await this.click(selector);

    return {
      success: result.success,
      hoverTime: Date.now() - startTime,
    };
  }

  // =========================================================================
  // Calibrated Timing
  // =========================================================================

  /**
   * Get age-adjusted reaction time based on research data
   */
  getCalibratedReactionTime(): number {
    const baseTime = RESEARCH_DATA.reactionTime.complexDecision;
    const ageRange = this.personaName.includes("elderly") ? "65+" :
                     this.personaName.includes("power") ? "25-34" : "35-44";
    const multiplier = RESEARCH_DATA.reactionTime.ageMultiplier[ageRange as keyof typeof RESEARCH_DATA.reactionTime.ageMultiplier] || 1.0;

    return Math.floor(baseTime * multiplier * (0.8 + Math.random() * 0.4));
  }

  /**
   * Get calibrated reading time based on research
   */
  getCalibratedReadingTime(wordCount: number, mode: "normal" | "skim" | "careful" = "normal"): number {
    let wpm = RESEARCH_DATA.readingSpeed.average;

    if (mode === "skim" || this.params.attention.pattern === "skim") {
      wpm = RESEARCH_DATA.readingSpeed.skimming;
    } else if (mode === "careful" || this.params.attention.pattern === "thorough") {
      wpm = RESEARCH_DATA.readingSpeed.careful;
    }

    // Mobile reduces reading speed
    if (this.page.viewportSize()?.width || 1280 < 600) {
      wpm *= RESEARCH_DATA.readingSpeed.mobileReduction;
    }

    return Math.floor((wordCount / wpm) * 60 * 1000);
  }

  /**
   * Get a summary of this persona's behavior characteristics
   */
  getBehaviorSummary(): string {
    return `
Persona: ${this.personaName}
Timing: Reaction ${this.params.timing.reactionTime.min}-${this.params.timing.reactionTime.max}ms
Errors: Misclick ${(this.params.errors.misClickRate * 100).toFixed(0)}%, Typo ${(this.params.errors.typoRate * 100).toFixed(0)}%
Mouse: ${this.params.mouse.speed}, curvature ${this.params.mouse.curvature}
Attention: ${this.params.attention.pattern}, ${this.params.attention.scrollBehavior} scroll
Research-calibrated: Yes (NNg, Baymard, Fitts's Law)
    `.trim();
  }
}

/**
 * Get default behavior params (neutral user)
 */
function getDefaultBehaviorParams(): HumanBehaviorParams {
  return {
    timing: {
      reactionTime: { min: 300, max: 800 },
      clickDelay: { min: 300, max: 1000 },
      typeSpeed: { min: 80, max: 150 },
      readingSpeed: 250,
      scrollPauseTime: { min: 500, max: 1500 },
    },
    errors: {
      misClickRate: 0.05,
      doubleClickAccidental: 0.03,
      typoRate: 0.03,
      backtrackRate: 0.10,
    },
    mouse: {
      curvature: 0.25,
      jitter: 2,
      overshoot: 0.10,
      speed: "normal",
    },
    attention: {
      pattern: "f-pattern",
      scrollBehavior: "chunked",
      focusAreas: ["header", "cta", "text"],
      distractionRate: 0.08,
    },
  };
}

// ============================================================================
// Zone Classification (Constitutional Safety)
// ============================================================================

type Zone = "green" | "yellow" | "red" | "black";

function classifyAction(action: string, target?: string): Zone {
  // Green zone: safe, auto-execute
  const greenActions = ["navigate", "screenshot", "scroll", "hover", "extract", "read"];
  if (greenActions.includes(action)) return "green";

  // Black zone: never execute
  const blackPatterns = ["bypass", "inject", "exploit", "hack"];
  if (blackPatterns.some((p) => action.includes(p) || target?.toLowerCase().includes(p))) {
    return "black";
  }

  // Red zone: destructive, needs verification
  const redPatterns = ["delete", "remove", "cancel", "purchase", "checkout", "payment", "submit"];
  if (target && redPatterns.some((p) => target.toLowerCase().includes(p))) {
    return "red";
  }

  // Yellow zone: log and proceed
  return "yellow";
}

// ============================================================================
// Audit Trail
// ============================================================================

function logAudit(entry: AuditEntry): void {
  const today = new Date().toISOString().split("T")[0];
  const auditFile = join(AUDIT_DIR, `${today}.jsonl`);
  const line = JSON.stringify(entry) + "\n";
  writeFileSync(auditFile, line, { flag: "a" });
}

// ============================================================================
// Browser Session Management (Persistent Context)
// ============================================================================

// Use persistent context to maintain state between CLI invocations
const BROWSER_STATE_DIR = join(MEMORY_DIR, "browser-state");
const SESSION_STATE_FILE = join(BROWSER_STATE_DIR, "last-session.json");
let globalContext: BrowserContext | null = null;
let globalBrowser: Browser | null = null;
let globalPage: Page | null = null;

// Session state persistence - saves current URL between CLI invocations
interface SessionState {
  url: string;
  timestamp: number;
  viewport?: { width: number; height: number };
}

function saveSessionState(url: string, viewport?: { width: number; height: number }): void {
  try {
    // Don't save about:blank or empty URLs
    if (!url || url === "about:blank" || url === "") return;

    const state: SessionState = {
      url,
      timestamp: Date.now(),
      viewport,
    };
    writeFileSync(SESSION_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    // Silently fail - this is a best-effort feature
  }
}

function loadSessionState(): SessionState | null {
  try {
    if (!existsSync(SESSION_STATE_FILE)) return null;
    const content = readFileSync(SESSION_STATE_FILE, "utf-8");
    const state = JSON.parse(content) as SessionState;

    // Expire sessions older than 1 hour
    const oneHour = 60 * 60 * 1000;
    if (Date.now() - state.timestamp > oneHour) {
      unlinkSync(SESSION_STATE_FILE);
      return null;
    }

    return state;
  } catch (e) {
    return null;
  }
}

function clearSessionState(): void {
  try {
    if (existsSync(SESSION_STATE_FILE)) {
      unlinkSync(SESSION_STATE_FILE);
    }
  } catch (e) {
    // Silently fail
  }
}

// Ensure browser state directory exists
if (!existsSync(BROWSER_STATE_DIR)) {
  mkdirSync(BROWSER_STATE_DIR, { recursive: true });
}

// Fast launch args for Chromium
const FAST_LAUNCH_ARGS = [
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
];

async function getBrowser(): Promise<Browser> {
  if (!globalBrowser) {
    globalBrowser = await chromium.launch({
      headless: true,
      args: FAST_LAUNCH_ARGS,
    });
  }
  return globalBrowser;
}

async function getPersistentContext(): Promise<BrowserContext> {
  if (!globalContext) {
    // Launch persistent context - this stores cookies, localStorage, sessionStorage
    globalContext = await chromium.launchPersistentContext(BROWSER_STATE_DIR, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
      acceptDownloads: false,
      args: FAST_LAUNCH_ARGS,
    });
    console.log(`🔄 Using persistent browser context: ${BROWSER_STATE_DIR}`);
  }
  return globalContext;
}

async function getPage(viewport?: [number, number], skipRestore: boolean = false): Promise<Page> {
  // Use persistent context for state persistence
  const context = await getPersistentContext();

  let isNewPage = false;

  // Reuse existing page if available
  const pages = context.pages();
  if (pages.length > 0 && !pages[0].isClosed()) {
    globalPage = pages[0];
    // Update viewport if specified
    if (viewport) {
      await globalPage.setViewportSize({ width: viewport[0], height: viewport[1] });
    }
  } else {
    // Create new page in persistent context
    globalPage = await context.newPage();
    isNewPage = true;
    if (viewport) {
      await globalPage.setViewportSize({ width: viewport[0], height: viewport[1] });
    }
  }

  // Restore previous session URL if:
  // - Not explicitly navigating (skipRestore = false)
  // - Page is at about:blank (new page or empty existing page)
  const currentUrl = globalPage.url();
  const needsRestore = !skipRestore && (isNewPage || currentUrl === "about:blank" || currentUrl === "");

  if (needsRestore) {
    const savedSession = loadSessionState();
    if (savedSession && savedSession.url && savedSession.url !== "about:blank") {
      try {
        console.log(`🔄 Restoring session: ${savedSession.url}`);
        await globalPage.goto(savedSession.url, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });
        // Wait for network idle and JS hydration
        await globalPage.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
        await globalPage.waitForTimeout(1000);
        // Apply saved viewport if no explicit viewport was requested
        if (!viewport && savedSession.viewport) {
          await globalPage.setViewportSize(savedSession.viewport);
        }
      } catch (e) {
        // If restore fails, continue with blank page
        console.log(`⚠️ Could not restore session: ${(e as Error).message}`);
      }
    }
  }

  return globalPage;
}

async function closeBrowser(): Promise<void> {
  // For persistent context, we must close it to save state and free resources
  // Playwright saves cookies/localStorage to browser-state directory on close

  // Save current URL before closing so next invocation can restore it
  if (globalPage && !globalPage.isClosed()) {
    try {
      const currentUrl = globalPage.url();
      const viewport = globalPage.viewportSize();
      saveSessionState(currentUrl, viewport || undefined);
    } catch (e) {
      // Ignore errors during cleanup
    }
  }

  if (globalContext) {
    await globalContext.close().catch(() => {});
    globalContext = null;
  }
  if (globalBrowser) {
    await globalBrowser.close().catch(() => {});
    globalBrowser = null;
  }
  globalPage = null;
}

// Force close - use when you need to actually terminate the browser
async function forceCloseBrowser(): Promise<void> {
  if (globalContext) {
    await globalContext.close().catch(() => {});
    globalContext = null;
  }
  if (globalBrowser) {
    await globalBrowser.close().catch(() => {});
    globalBrowser = null;
  }
  globalPage = null;
}

// New: Close without saving (for fresh start)
async function resetBrowser(): Promise<void> {
  await forceCloseBrowser();
  // Clear session state first (before clearing directory)
  clearSessionState();
  // Clear browser state directory recursively
  if (existsSync(BROWSER_STATE_DIR)) {
    const { rmSync } = await import("fs");
    rmSync(BROWSER_STATE_DIR, { recursive: true, force: true });
    mkdirSync(BROWSER_STATE_DIR, { recursive: true });
  }
  console.log("🔄 Browser state reset");
}

function screenshotPath(prefix: string = "screenshot"): string {
  return join(SCREENSHOTS_DIR, `${prefix}-${Date.now()}.png`);
}

// ============================================================================
// Core Commands - ACTUAL EXECUTION
// ============================================================================

async function navigate(url: string, options: Record<string, string> = {}): Promise<NavigationResult> {
  const startTime = Date.now();
  const zone = classifyAction("navigate", url);

  console.log(`🌐 Navigating to ${url}...`);

  // Skip session restore since we're explicitly navigating to a new URL
  const page = await getPage(undefined, true);
  const errors: string[] = [];
  const warnings: string[] = [];

  // Capture console messages
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
    if (msg.type() === "warning") warnings.push(msg.text());
  });

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForTimeout(1500); // Extra wait for JS hydration

    const ssPath = screenshotPath("nav");
    await page.screenshot({ path: ssPath, fullPage: true });

    const result: NavigationResult = {
      url: page.url(),
      title: await page.title(),
      screenshot: ssPath,
      errors: errors.slice(0, 10),
      warnings: warnings.slice(0, 5),
      loadTime: Date.now() - startTime,
    };

    logAudit({
      timestamp: new Date().toISOString(),
      action: "navigate",
      target: url,
      zone,
      result: "success",
      screenshot: ssPath,
      duration: result.loadTime,
    });

    // Output
    console.log(`✅ Loaded: "${result.title}"`);
    console.log(`📸 Screenshot: ${ssPath}`);
    console.log(`⏱️  Load time: ${result.loadTime}ms`);
    if (errors.length) {
      console.log(`🔴 Errors (${errors.length}):`);
      errors.slice(0, 3).forEach(e => console.log(`   • ${e.substring(0, 100)}`));
    }
    if (warnings.length) {
      console.log(`⚠️  Warnings (${warnings.length})`);
    }

    return result;
  } catch (err: any) {
    logAudit({
      timestamp: new Date().toISOString(),
      action: "navigate",
      target: url,
      zone,
      result: "failure",
      duration: Date.now() - startTime,
    });
    throw new Error(`Navigation failed: ${err.message}`);
  }
}

async function click(selector: string, options: Record<string, string> = {}): Promise<ClickResult> {
  const zone = classifyAction("click", selector);

  if (zone === "black") {
    console.log(`🚫 BLOCKED: "${selector}" classified as dangerous`);
    return { success: false, screenshot: "", message: "Action blocked by safety rules" };
  }

  if (zone === "red" && !options.force) {
    console.log(`⚠️  RED ZONE: Clicking "${selector}" appears destructive`);
    console.log(`   Add --force to proceed`);
    return { success: false, screenshot: "", message: "Red zone action requires --force" };
  }

  console.log(`👆 Clicking: "${selector}"...`);

  const page = await getPage();

  try {
    // Try multiple selector strategies in order of specificity
    let clicked = false;
    const selectorLower = selector.toLowerCase();

    // Strategy 1: Direct CSS selector (if it looks like CSS)
    if (selector.startsWith(".") || selector.startsWith("#") || selector.startsWith("[")) {
      try {
        await page.click(selector, { timeout: 3000 });
        clicked = true;
        console.log(`   ✓ Strategy 1: CSS selector`);
      } catch {}
    }

    // Strategy 2: Data-testid attribute
    if (!clicked) {
      try {
        await page.click(`[data-testid="${selector}"]`, { timeout: 2000 });
        clicked = true;
        console.log(`   ✓ Strategy 2: data-testid`);
      } catch {}
    }

    // Strategy 3: Aria-label
    if (!clicked) {
      try {
        await page.click(`[aria-label="${selector}"]`, { timeout: 2000 });
        clicked = true;
        console.log(`   ✓ Strategy 3: aria-label`);
      } catch {}
    }

    // Strategy 4: Exact text content (button/link)
    if (!clicked) {
      try {
        await page.click(`text="${selector}"`, { timeout: 2000 });
        clicked = true;
        console.log(`   ✓ Strategy 4: Exact text`);
      } catch {}
    }

    // Strategy 5: Role-based button
    if (!clicked) {
      try {
        await page.getByRole("button", { name: selector }).click({ timeout: 2000 });
        clicked = true;
        console.log(`   ✓ Strategy 5: Role button`);
      } catch {}
    }

    // Strategy 6: Role-based link
    if (!clicked) {
      try {
        await page.getByRole("link", { name: selector }).click({ timeout: 2000 });
        clicked = true;
        console.log(`   ✓ Strategy 6: Role link`);
      } catch {}
    }

    // Strategy 7: Partial text match (case-insensitive)
    if (!clicked) {
      try {
        await page.click(`text=${selector}`, { timeout: 2000 });
        clicked = true;
        console.log(`   ✓ Strategy 7: Partial text`);
      } catch {}
    }

    // Strategy 8: Any element containing the text (using locator)
    if (!clicked) {
      try {
        const locator = page.locator(`*:has-text("${selector}")`).first();
        if (await locator.isVisible({ timeout: 1000 })) {
          await locator.click({ timeout: 3000 });
          clicked = true;
          console.log(`   ✓ Strategy 8: Element containing text`);
        }
      } catch {}
    }

    // Strategy 9: Find clickable ancestor of text (card, article, etc)
    if (!clicked) {
      try {
        const clickableEl = await page.evaluate((searchText) => {
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            null
          );

          let node;
          while ((node = walker.nextNode())) {
            if (node.textContent?.toLowerCase().includes(searchText.toLowerCase())) {
              // Found text node, now find clickable ancestor
              let el = node.parentElement;
              while (el && el !== document.body) {
                const style = window.getComputedStyle(el);
                const hasClickCursor = style.cursor === "pointer";
                const hasOnClick = el.getAttribute("onclick") !== null;
                const isInteractive = ["A", "BUTTON", "INPUT"].includes(el.tagName);
                const hasRole = el.getAttribute("role") === "button" || el.getAttribute("role") === "link";

                if (hasClickCursor || hasOnClick || isInteractive || hasRole) {
                  // Generate a unique selector for this element
                  if (el.id) return `#${el.id}`;

                  // Try data-testid
                  const testId = el.getAttribute("data-testid");
                  if (testId) return `[data-testid="${testId}"]`;

                  // Build a path selector
                  const tag = el.tagName.toLowerCase();
                  const classes = Array.from(el.classList).slice(0, 2).join(".");
                  const index = Array.from(el.parentElement?.children || []).indexOf(el);

                  if (classes) {
                    return `${tag}.${classes}`;
                  }
                  return null; // Can't create reliable selector
                }
                el = el.parentElement;
              }
            }
          }
          return null;
        }, selector);

        if (clickableEl) {
          console.log(`   🔍 Found clickable ancestor: ${clickableEl}`);
          await page.click(clickableEl, { timeout: 3000 });
          clicked = true;
          console.log(`   ✓ Strategy 9: Clickable ancestor`);
        }
      } catch {}
    }

    // Strategy 10: Click element by text content with JS (force click)
    if (!clicked) {
      try {
        const found = await page.evaluate((searchText) => {
          const elements = document.querySelectorAll("*");
          for (const el of elements) {
            if (el.textContent?.includes(searchText)) {
              const style = window.getComputedStyle(el);
              if (style.cursor === "pointer" || el.closest("[class*='card']") || el.closest("[class*='Card']")) {
                (el as HTMLElement).click();
                return true;
              }
            }
          }
          // Try clicking any card that contains the text
          const cards = document.querySelectorAll("[class*='card'], [class*='Card'], article");
          for (const card of cards) {
            if (card.textContent?.toLowerCase().includes(searchText.toLowerCase())) {
              (card as HTMLElement).click();
              return true;
            }
          }
          return false;
        }, selector);

        if (found) {
          clicked = true;
          console.log(`   ✓ Strategy 10: JS click on card/element`);
        }
      } catch {}
    }

    // Strategy 11: Click nth matching element (if selector is like "Review 1" or contains number)
    if (!clicked) {
      const match = selector.match(/(.+?)\s*(\d+)$/);
      if (match) {
        try {
          const baseText = match[1].trim();
          const index = parseInt(match[2], 10) - 1;
          const elements = page.locator(`*:has-text("${baseText}")`);
          const count = await elements.count();
          if (count > index) {
            await elements.nth(index).click({ timeout: 3000 });
            clicked = true;
            console.log(`   ✓ Strategy 11: Nth element (${index + 1} of ${count})`);
          }
        } catch {}
      }
    }

    if (!clicked) {
      throw new Error(`Could not find element: "${selector}"`);
    }

    await page.waitForTimeout(1000); // Wait for any transitions

    const ssPath = screenshotPath("click");
    await page.screenshot({ path: ssPath });

    logAudit({
      timestamp: new Date().toISOString(),
      action: "click",
      target: selector,
      zone,
      result: "success",
      screenshot: ssPath,
    });

    console.log(`✅ Clicked: "${selector}"`);
    console.log(`📸 Screenshot: ${ssPath}`);

    return { success: true, screenshot: ssPath, message: "Click successful" };
  } catch (err: any) {
    const ssPath = screenshotPath("click-fail");
    await page.screenshot({ path: ssPath }).catch(() => {});

    logAudit({
      timestamp: new Date().toISOString(),
      action: "click",
      target: selector,
      zone,
      result: "failure",
      screenshot: ssPath,
    });

    console.log(`❌ Click failed: ${err.message}`);
    console.log(`📸 Screenshot: ${ssPath}`);

    return { success: false, screenshot: ssPath, message: err.message };
  }
}

async function fill(selector: string, value: string, options: Record<string, string> = {}): Promise<ClickResult> {
  const zone = classifyAction("fill", selector);
  const isPassword = selector.toLowerCase().includes("password");
  const displayValue = isPassword ? "***" : value;

  console.log(`📝 Filling "${selector}" with: ${displayValue}...`);

  const page = await getPage();

  try {
    // Try multiple selector strategies
    let filled = false;

    // Strategy 1: Direct CSS selector
    try {
      await page.fill(selector, value, { timeout: 5000 });
      filled = true;
    } catch {}

    // Strategy 2: Placeholder text
    if (!filled) {
      try {
        await page.getByPlaceholder(selector).fill(value, { timeout: 5000 });
        filled = true;
      } catch {}
    }

    // Strategy 3: Label
    if (!filled) {
      try {
        await page.getByLabel(selector).fill(value, { timeout: 5000 });
        filled = true;
      } catch {}
    }

    // Strategy 4: Role textbox with name
    if (!filled) {
      try {
        await page.getByRole("textbox", { name: selector }).fill(value, { timeout: 5000 });
        filled = true;
      } catch {}
    }

    // Strategy 5: Input by name attribute
    if (!filled) {
      try {
        await page.fill(`input[name="${selector}"]`, value, { timeout: 3000 });
        filled = true;
      } catch {}
    }

    // Strategy 6: Input by type attribute (e.g., "email", "password")
    if (!filled) {
      try {
        await page.fill(`input[type="${selector}"]`, value, { timeout: 3000 });
        filled = true;
      } catch {}
    }

    // Strategy 7: Input by id attribute
    if (!filled) {
      try {
        await page.fill(`#${selector}`, value, { timeout: 3000 });
        filled = true;
      } catch {}
    }

    // Strategy 8: Textarea by name or placeholder
    if (!filled) {
      try {
        await page.fill(`textarea[name="${selector}"]`, value, { timeout: 3000 });
        filled = true;
      } catch {}
    }

    // Strategy 9: Any visible input/textarea matching partial attribute
    if (!filled) {
      try {
        const selectorLower = selector.toLowerCase();
        const inputHandle = await page.evaluateHandle((search) => {
          const inputs = document.querySelectorAll("input, textarea, select");
          for (const input of inputs) {
            const name = input.getAttribute("name")?.toLowerCase() || "";
            const id = input.getAttribute("id")?.toLowerCase() || "";
            const placeholder = input.getAttribute("placeholder")?.toLowerCase() || "";
            const type = input.getAttribute("type")?.toLowerCase() || "";
            const ariaLabel = input.getAttribute("aria-label")?.toLowerCase() || "";
            const searchLower = search.toLowerCase();
            if (name.includes(searchLower) || id.includes(searchLower) ||
                placeholder.includes(searchLower) || type === searchLower ||
                ariaLabel.includes(searchLower)) {
              return input;
            }
          }
          return null;
        }, selector);

        const element = inputHandle.asElement();
        if (element) {
          await element.fill(value, { timeout: 3000 });
          filled = true;
        }
      } catch {}
    }

    if (!filled) {
      throw new Error(`Could not find input: "${selector}"`);
    }

    const ssPath = screenshotPath("fill");
    await page.screenshot({ path: ssPath });

    logAudit({
      timestamp: new Date().toISOString(),
      action: "fill",
      target: selector,
      zone,
      result: "success",
      screenshot: ssPath,
    });

    console.log(`✅ Filled: "${selector}"`);
    console.log(`📸 Screenshot: ${ssPath}`);

    return { success: true, screenshot: ssPath, message: "Fill successful" };
  } catch (err: any) {
    console.log(`❌ Fill failed: ${err.message}`);
    return { success: false, screenshot: "", message: err.message };
  }
}

async function extract(what: string, options: Record<string, string> = {}): Promise<ExtractResult> {
  console.log(`📊 Extracting: "${what}"...`);

  const page = await getPage();

  try {
    // Get page content for AI analysis
    const content = await page.content();
    let text = await page.evaluate(() => document.body.innerText);
    // Fallback: if innerText is empty (SPA hydration), try textContent
    if (!text || text.trim() === "") {
      text = await page.evaluate(() => document.body.textContent || "");
    }
    // Second fallback: extract from all visible elements
    if (!text || text.trim() === "") {
      text = await page.evaluate(() => {
        const elements = document.querySelectorAll("h1, h2, h3, h4, h5, h6, p, span, li, td, th, a, label, div");
        const texts: string[] = [];
        for (const el of elements) {
          const t = (el as HTMLElement).innerText?.trim();
          if (t && t.length > 0 && !texts.includes(t)) {
            texts.push(t);
          }
        }
        return texts.join("\n");
      });
    }

    // Extract based on what was requested
    let data: unknown;

    if (what.toLowerCase().includes("link")) {
      data = await page.$$eval("a", links =>
        links.map(l => ({ text: l.textContent?.trim(), href: l.getAttribute("href") }))
      );
    } else if (what.toLowerCase().includes("image")) {
      data = await page.$$eval("img", imgs =>
        imgs.map(i => ({ src: i.getAttribute("src"), alt: i.getAttribute("alt") }))
      );
    } else if (what.toLowerCase().includes("heading")) {
      data = await page.$$eval("h1, h2, h3, h4, h5, h6", headings =>
        headings.map(h => ({ level: h.tagName, text: h.textContent?.trim() }))
      );
    } else if (what.toLowerCase().includes("form")) {
      data = await page.$$eval("input, select, textarea", inputs =>
        inputs.map(i => ({
          type: i.getAttribute("type") || i.tagName.toLowerCase(),
          name: i.getAttribute("name"),
          placeholder: i.getAttribute("placeholder")
        }))
      );
    } else {
      // Generic text extraction
      data = {
        title: await page.title(),
        url: page.url(),
        textContent: text.substring(0, 5000),
      };
    }

    const ssPath = screenshotPath("extract");
    await page.screenshot({ path: ssPath });

    logAudit({
      timestamp: new Date().toISOString(),
      action: "extract",
      target: what,
      zone: "green",
      result: "success",
      screenshot: ssPath,
    });

    console.log(`✅ Extracted: "${what}"`);
    console.log(`📸 Screenshot: ${ssPath}`);
    console.log(`📋 Data:`, JSON.stringify(data, null, 2).substring(0, 2000));

    return { data, screenshot: ssPath };
  } catch (err: any) {
    console.log(`❌ Extract failed: ${err.message}`);
    return { data: null, screenshot: "" };
  }
}

async function takeScreenshot(path?: string): Promise<string> {
  const page = await getPage();
  const ssPath = path || screenshotPath("manual");
  await page.screenshot({ path: ssPath, fullPage: true });
  console.log(`📸 Screenshot: ${ssPath}`);
  return ssPath;
}

// Internal screenshot without console output (for Tier 5 features)
async function takeScreenshotInternal(prefix: string = "auto"): Promise<string> {
  const page = await getPage();
  const ssPath = screenshotPath(prefix);
  await page.screenshot({ path: ssPath, fullPage: true });
  return ssPath;
}

// ============================================================================
// Authentication with Credential Storage
// ============================================================================

/**
 * Auto-verify an email address using the dev API endpoint.
 * This bypasses the email verification step for automated testing.
 *
 * @param email - The email address to verify
 * @param baseUrl - The base URL of the site (e.g., https://dev2.blackbook.reviews)
 * @returns Promise<{success: boolean, message: string}>
 */
async function autoVerifyEmail(
  email: string,
  baseUrl: string
): Promise<{ success: boolean; message: string; userId?: number }> {
  console.log(`📧 Auto-verifying email: ${email}`);

  const endpoint = `${baseUrl.replace(/\/$/, "")}/api/dev/verify-email`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CBrowser-Test": "true",
      },
      body: JSON.stringify({ email }),
    });

    const data = await response.json();

    if (data.success) {
      console.log(`   ✅ Email verified: ${email}`);
      console.log(`   🆔 User ID: ${data.user_id}`);
      return { success: true, message: data.message || "Verified", userId: data.user_id };
    } else {
      console.log(`   ❌ Verification failed: ${data.error}`);
      return { success: false, message: data.error || "Unknown error" };
    }
  } catch (err: any) {
    console.log(`   ❌ Network error: ${err.message}`);
    return { success: false, message: err.message };
  }
}

/**
 * Check email verification status using the dev API endpoint.
 *
 * @param email - The email address to check
 * @param baseUrl - The base URL of the site
 * @returns Promise<{exists: boolean, verified: boolean}>
 */
async function checkVerificationStatus(
  email: string,
  baseUrl: string
): Promise<{ exists: boolean; verified: boolean; userId?: number }> {
  console.log(`🔍 Checking verification status: ${email}`);

  const endpoint = `${baseUrl.replace(/\/$/, "")}/api/dev/verification-status?email=${encodeURIComponent(email)}`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "X-CBrowser-Test": "true",
      },
    });

    const data = await response.json();

    if (data.success) {
      console.log(`   ✅ User exists: ${data.exists}, Verified: ${data.verified}`);
      return { exists: data.exists, verified: data.verified, userId: data.user_id };
    } else {
      console.log(`   ℹ️ User not found`);
      return { exists: false, verified: false };
    }
  } catch (err: any) {
    console.log(`   ❌ Network error: ${err.message}`);
    return { exists: false, verified: false };
  }
}

/**
 * Login a test user via the dev API endpoint.
 * This creates a server-side session and returns the session info.
 *
 * @param email - The email address to login
 * @param password - The password
 * @param baseUrl - The base URL of the site
 * @returns Promise with session info including cookies
 */
async function loginTestUser(
  email: string,
  password: string,
  baseUrl: string
): Promise<{
  success: boolean;
  message: string;
  userId?: number;
  sessionId?: string;
  roles?: string[];
  cookies?: Array<{ name: string; value: string; domain: string; path: string }>;
}> {
  console.log(`🔐 Logging in test user: ${email}`);

  const endpoint = `${baseUrl.replace(/\/$/, "")}/api/dev/login`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CBrowser-Test": "true",
      },
      body: JSON.stringify({ email, password }),
    });

    // Get cookies from response
    const setCookieHeaders = response.headers.getSetCookie?.() || [];
    const cookies: Array<{ name: string; value: string; domain: string; path: string }> = [];

    for (const cookieStr of setCookieHeaders) {
      const parts = cookieStr.split(";").map((p) => p.trim());
      const [nameValue] = parts;
      if (nameValue) {
        const [name, value] = nameValue.split("=");
        if (name && value) {
          // Parse domain and path from cookie attributes
          let domain = new URL(baseUrl).hostname;
          let path = "/";
          for (const part of parts.slice(1)) {
            const [key, val] = part.split("=");
            if (key?.toLowerCase() === "domain") domain = val || domain;
            if (key?.toLowerCase() === "path") path = val || path;
          }
          cookies.push({ name, value, domain, path });
        }
      }
    }

    const data = await response.json();

    if (data.success) {
      console.log(`   ✅ Logged in successfully`);
      console.log(`   🆔 User ID: ${data.user_id}`);
      console.log(`   🔑 Session ID: ${data.session_id}`);
      console.log(`   👤 Roles: ${data.roles?.join(", ") || "none"}`);
      return {
        success: true,
        message: data.message || "Logged in",
        userId: data.user_id,
        sessionId: data.session_id,
        roles: data.roles,
        cookies,
      };
    } else {
      console.log(`   ❌ Login failed: ${data.error}`);
      return { success: false, message: data.error || "Unknown error" };
    }
  } catch (err: any) {
    console.log(`   ❌ Network error: ${err.message}`);
    return { success: false, message: err.message };
  }
}

/**
 * Login and apply session to browser context.
 * This combines the API login with browser cookie injection.
 *
 * @param email - The email address to login
 * @param password - The password
 * @param baseUrl - The base URL of the site
 * @param saveAs - Optional session name to save for later reuse
 * @returns Promise with login result
 */
async function loginAndApplySession(
  email: string,
  password: string,
  baseUrl: string,
  saveAs?: string
): Promise<{ success: boolean; message: string; userId?: number }> {
  console.log(`🔐 Login and apply session for: ${email}`);

  // First, login via API
  const loginResult = await loginTestUser(email, password, baseUrl);

  if (!loginResult.success) {
    return { success: false, message: loginResult.message };
  }

  // Get the page and browser context
  const page = await getPage();
  const context = page.context();

  // Apply session cookies to browser context
  if (loginResult.cookies && loginResult.cookies.length > 0) {
    console.log(`   🍪 Applying ${loginResult.cookies.length} session cookies to browser`);

    // Also need to fetch the actual session cookie from the site
    // Navigate to a page to establish the session
    const baseHostname = new URL(baseUrl).hostname;
    const cookiesToAdd = loginResult.cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain.startsWith(".") ? c.domain : `.${baseHostname}`,
      path: c.path,
      httpOnly: c.name.includes("session"),
      secure: baseUrl.startsWith("https"),
      sameSite: "Lax" as const,
    }));

    await context.addCookies(cookiesToAdd);
  }

  // Verify the session by navigating to a test endpoint
  console.log(`   🔄 Verifying session in browser...`);
  await page.goto(`${baseUrl}/api/dev/session-info`, { waitUntil: "networkidle", timeout: 10000 });

  // Get the response text
  const bodyText = await page.textContent("body");
  try {
    const sessionInfo = JSON.parse(bodyText || "{}");
    if (sessionInfo.authenticated) {
      console.log(`   ✅ Browser session verified!`);
      console.log(`   👤 Logged in as user ID: ${sessionInfo.user_id}`);
    } else {
      console.log(`   ⚠️ Session may not have applied correctly`);
    }
  } catch {
    console.log(`   ⚠️ Could not parse session info response`);
  }

  // Optionally save the session for later reuse (with credentials for auto-relogin)
  if (saveAs) {
    console.log(`   💾 Saving session as: ${saveAs}`);
    await saveSession(saveAs, undefined, { email, password, baseUrl });
  }

  return {
    success: true,
    message: `Logged in as ${email}`,
    userId: loginResult.userId,
  };
}

/**
 * Get current session info from the dev API.
 *
 * @param baseUrl - The base URL of the site
 * @returns Promise with session info
 */
async function getSessionInfo(
  baseUrl: string
): Promise<{ authenticated: boolean; userId?: number; sessionId?: string; roles?: string[] }> {
  const page = await getPage();
  await page.goto(`${baseUrl}/api/dev/session-info`, { waitUntil: "networkidle", timeout: 10000 });

  const bodyText = await page.textContent("body");
  try {
    const data = JSON.parse(bodyText || "{}");
    return {
      authenticated: data.authenticated || false,
      userId: data.user_id,
      sessionId: data.session_id,
      roles: data.roles,
    };
  } catch {
    return { authenticated: false };
  }
}

/**
 * Complete registration flow with auto-verification.
 * 1. Fill registration form
 * 2. Submit
 * 3. Auto-verify email via dev API
 * 4. Continue with authenticated session
 */
async function completeRegistrationWithVerification(
  baseUrl: string,
  formData: {
    email: string;
    password: string;
    name?: string;
  },
  persona?: Persona
): Promise<{ success: boolean; userId?: number; message: string }> {
  console.log(`🚀 Complete registration flow with auto-verification`);

  const page = await getPage();
  const human = persona ? new HumanBehavior(page, persona) : null;

  try {
    // Navigate to registration page
    const registerUrl = `${baseUrl}/register`;
    console.log(`   📍 Navigating to: ${registerUrl}`);
    await page.goto(registerUrl, { waitUntil: "networkidle", timeout: 30000 });

    // Handle any modals
    await handleModals(page);

    // Fill form fields (with human behavior if persona provided)
    if (human) {
      await human.fillFormField('input[name="email"], input[type="email"]', formData.email, "email");
      await human.fillFormField('input[name="password"], input[type="password"]', formData.password, "password");
      if (formData.name) {
        await human.fillFormField('input[name="name"], input[name="display_name"]', formData.name, "name");
      }
    } else {
      await page.fill('input[name="email"], input[type="email"]', formData.email);
      await page.fill('input[name="password"], input[type="password"]', formData.password);
      if (formData.name) {
        await page.fill('input[name="name"], input[name="display_name"]', formData.name).catch(() => {});
      }
    }

    // Submit form
    console.log(`   📝 Submitting registration form...`);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    // Now auto-verify the email
    const verifyResult = await autoVerifyEmail(formData.email, baseUrl);

    if (!verifyResult.success) {
      return { success: false, message: `Registration may have succeeded but verification failed: ${verifyResult.message}` };
    }

    // Refresh to apply verification
    await page.reload({ waitUntil: "networkidle" });

    console.log(`   ✅ Registration complete with auto-verification!`);
    return { success: true, userId: verifyResult.userId, message: "Registered and verified" };

  } catch (err: any) {
    console.log(`   ❌ Registration failed: ${err.message}`);
    return { success: false, message: err.message };
  }
}

async function authenticate(site: string, options: Record<string, string> = {}): Promise<boolean> {
  console.log(`🔐 Authenticating to ${site}...`);

  // Check for stored credentials
  const creds = getCredential(site);
  const helper = getSiteHelper(site);

  if (!creds && !options.username) {
    console.log(`❌ No stored credentials for ${site}`);
    console.log(`   Use: creds add ${site} to save credentials first`);
    return false;
  }

  const username = options.username || creds?.username || "";
  const password = options.password || creds?.password || "";

  if (!username || !password) {
    console.log(`❌ Missing username or password`);
    return false;
  }

  const page = await getPage();

  try {
    // Navigate to login page
    let loginUrl = helper?.auth?.loginUrl || `https://${site}/login`;
    if (!loginUrl.startsWith("http")) {
      loginUrl = `https://${site}${loginUrl}`;
    }

    console.log(`   Navigating to: ${loginUrl}`);
    await page.goto(loginUrl, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1500);

    // Handle any modals first
    await handleModals(page);

    // Find and fill username/email
    const usernameSelectors = helper?.auth?.usernameSelector
      ? [helper.auth.usernameSelector]
      : [
          'input[name="email"]',
          'input[type="email"]',
          'input[name="username"]',
          'input[name="login"]',
          'input[name="identifier"]',
          'input[id="email"]',
          'input[id="username"]',
          '[placeholder*="email" i]',
          '[placeholder*="username" i]',
          '[placeholder*="slug" i]',
          'input[type="text"]', // fallback for generic text input
          'input:not([type="password"]):not([type="hidden"]):not([type="submit"])', // any visible input
        ];

    let usernameFilled = false;
    for (const sel of usernameSelectors) {
      try {
        const input = await page.$(sel);
        if (input && await input.isVisible()) {
          await page.fill(sel, username, { timeout: 2000 });
          usernameFilled = true;
          console.log(`   ✅ Filled username/email`);
          break;
        }
      } catch {}
    }

    // Fallback: try to find and fill the first visible text input
    if (!usernameFilled) {
      try {
        const firstInput = await page.$('input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="password"])');
        if (firstInput && await firstInput.isVisible()) {
          await firstInput.fill(username);
          usernameFilled = true;
          console.log(`   ✅ Filled username/email (fallback)`);
        }
      } catch {}
    }

    if (!usernameFilled) {
      throw new Error("Could not find username field");
    }

    // Check if password field is visible NOW (single-step login)
    let passwordVisible = false;
    const passwordSelectors = [
      'input[name="password"]',
      'input[type="password"]',
      'input[id="password"]',
    ];

    for (const sel of passwordSelectors) {
      try {
        const pwInput = await page.$(sel);
        if (pwInput && await pwInput.isVisible()) {
          passwordVisible = true;
          break;
        }
      } catch {}
    }

    // If password not visible, this is a TWO-STEP login - click Continue first
    if (!passwordVisible) {
      console.log(`   🔄 Two-step login detected, clicking Continue...`);

      const continueSelectors = [
        'button:has-text("Continue")',
        'button:has-text("Next")',
        'button[type="submit"]',
        'input[type="submit"]',
      ];

      let continued = false;
      for (const sel of continueSelectors) {
        try {
          const btn = await page.$(sel);
          if (btn && await btn.isVisible()) {
            await page.click(sel, { timeout: 3000 });
            continued = true;
            console.log(`   ✅ Clicked Continue`);
            break;
          }
        } catch {}
      }

      if (!continued) {
        await page.keyboard.press("Enter");
        console.log(`   ✅ Pressed Enter`);
      }

      // Wait for next step
      await page.waitForTimeout(2000);

      // Take intermediate screenshot
      const ssStep1 = screenshotPath("auth-step1");
      await page.screenshot({ path: ssStep1 });
      console.log(`   📸 Step 1: ${ssStep1}`);

      // Check for Passkey/WebAuthn flow - need to click "Use password instead"
      const usePasswordSelectors = [
        'button:has-text("Use password")',
        'button:has-text("password instead")',
        'a:has-text("Use password")',
        'a:has-text("password instead")',
        '[class*="password-option"]',
      ];

      for (const sel of usePasswordSelectors) {
        try {
          const btn = await page.$(sel);
          if (btn && await btn.isVisible()) {
            await page.click(sel, { timeout: 3000 });
            console.log(`   ✅ Clicked "Use password instead"`);
            await page.waitForTimeout(1500);
            break;
          }
        } catch {}
      }
    }

    // Now find and fill password
    let passwordFilled = false;
    for (const sel of passwordSelectors) {
      try {
        const pwInput = await page.$(sel);
        if (pwInput && await pwInput.isVisible()) {
          await page.fill(sel, password, { timeout: 3000 });
          passwordFilled = true;
          console.log(`   ✅ Filled password`);
          break;
        }
      } catch {}
    }

    if (!passwordFilled) {
      // Maybe we need to wait more or click something
      await page.waitForTimeout(1000);

      // Try again
      for (const sel of passwordSelectors) {
        try {
          await page.fill(sel, password, { timeout: 2000 });
          passwordFilled = true;
          console.log(`   ✅ Filled password (retry)`);
          break;
        } catch {}
      }
    }

    if (!passwordFilled) {
      const ssPath = screenshotPath("auth-fail");
      await page.screenshot({ path: ssPath });
      console.log(`   📸 Debug screenshot: ${ssPath}`);
      throw new Error("Could not find password field");
    }

    // Find and click final submit/login button
    const submitSelectors = helper?.auth?.submitSelector
      ? [helper.auth.submitSelector]
      : [
          'button:has-text("Sign in")',
          'button:has-text("Log in")',
          'button:has-text("Login")',
          'button[type="submit"]',
          'input[type="submit"]',
        ];

    let submitted = false;
    for (const sel of submitSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn && await btn.isVisible()) {
          await page.click(sel, { timeout: 3000 });
          submitted = true;
          console.log(`   ✅ Clicked login`);
          break;
        }
      } catch {}
    }

    if (!submitted) {
      await page.keyboard.press("Enter");
      console.log(`   ✅ Pressed Enter to submit`);
    }

    // Wait for navigation/response
    await page.waitForTimeout(4000);

    const ssPath = screenshotPath("auth-final");
    await page.screenshot({ path: ssPath });

    // Check if login was successful
    const currentUrl = page.url();
    const pageContent = await page.textContent("body") || "";
    const isOnLoginPage = currentUrl.includes("login") || currentUrl.includes("signin");
    const hasError = pageContent.toLowerCase().includes("invalid") ||
                     pageContent.toLowerCase().includes("incorrect") ||
                     pageContent.toLowerCase().includes("failed");

    if (isOnLoginPage && hasError) {
      console.log(`❌ Login failed - invalid credentials`);
      console.log(`📸 Screenshot: ${ssPath}`);
      return false;
    }

    if (isOnLoginPage) {
      console.log(`⚠️  May still be on login page: ${currentUrl}`);
      console.log(`📸 Screenshot: ${ssPath}`);
      // Could be waiting for 2FA or other verification
    } else {
      console.log(`✅ Authenticated successfully`);
      console.log(`   URL: ${currentUrl}`);
    }

    console.log(`📸 Screenshot: ${ssPath}`);

    // ========================================================================
    // POST-LOGIN: Handle Vault Passphrase and PIN prompts
    // ========================================================================
    const vaultPassphrase = options.vaultPassphrase || creds?.vaultPassphrase;
    const pin = options.pin || creds?.pin;

    // Check for vault passphrase prompt (E2E encryption)
    if (vaultPassphrase) {
      await page.waitForTimeout(1500);

      const passphraseSelectors = [
        'input[name="passphrase"]',
        'input[name="vault_passphrase"]',
        'input[name="encryption_passphrase"]',
        'input[placeholder*="passphrase" i]',
        'input[placeholder*="vault" i]',
        'input[type="password"]:not([name="password"])',
        '[data-testid="passphrase-input"]',
        'input[aria-label*="passphrase" i]',
      ];

      let passphraseFilled = false;
      for (const sel of passphraseSelectors) {
        try {
          const input = await page.$(sel);
          if (input && await input.isVisible()) {
            await page.fill(sel, vaultPassphrase, { timeout: 3000 });
            passphraseFilled = true;
            console.log(`   ✅ Filled vault passphrase`);

            // Look for confirm/unlock button
            const unlockSelectors = [
              'button:has-text("Unlock")',
              'button:has-text("Decrypt")',
              'button:has-text("Continue")',
              'button:has-text("Confirm")',
              'button[type="submit"]',
            ];

            for (const btnSel of unlockSelectors) {
              try {
                const btn = await page.$(btnSel);
                if (btn && await btn.isVisible()) {
                  await page.click(btnSel, { timeout: 3000 });
                  console.log(`   ✅ Clicked unlock/decrypt`);
                  await page.waitForTimeout(2000);
                  break;
                }
              } catch {}
            }
            break;
          }
        } catch {}
      }

      if (passphraseFilled) {
        const ssVault = screenshotPath("auth-vault");
        await page.screenshot({ path: ssVault });
        console.log(`   📸 Vault step: ${ssVault}`);
      }
    }

    // Check for PIN prompt
    if (pin) {
      await page.waitForTimeout(1000);

      const pinSelectors = [
        'input[name="pin"]',
        'input[type="tel"]',
        'input[inputmode="numeric"]',
        'input[placeholder*="pin" i]',
        'input[placeholder*="code" i]',
        'input[maxlength="4"]',
        'input[maxlength="6"]',
        '[data-testid="pin-input"]',
        'input[aria-label*="pin" i]',
      ];

      let pinFilled = false;
      for (const sel of pinSelectors) {
        try {
          const input = await page.$(sel);
          if (input && await input.isVisible()) {
            await page.fill(sel, pin, { timeout: 3000 });
            pinFilled = true;
            console.log(`   ✅ Filled PIN`);

            // Look for confirm button or auto-submit
            await page.waitForTimeout(500);
            const confirmSelectors = [
              'button:has-text("Confirm")',
              'button:has-text("Submit")',
              'button:has-text("Continue")',
              'button[type="submit"]',
            ];

            for (const btnSel of confirmSelectors) {
              try {
                const btn = await page.$(btnSel);
                if (btn && await btn.isVisible()) {
                  await page.click(btnSel, { timeout: 3000 });
                  console.log(`   ✅ Clicked PIN confirm`);
                  await page.waitForTimeout(2000);
                  break;
                }
              } catch {}
            }
            break;
          }
        } catch {}
      }

      if (pinFilled) {
        const ssPin = screenshotPath("auth-pin");
        await page.screenshot({ path: ssPin });
        console.log(`   📸 PIN step: ${ssPin}`);
      }
    }

    // Save credentials if provided via options
    if (options.username && options.password) {
      saveCredential(
        site,
        options.username,
        options.password,
        options.vaultPassphrase,
        options.pin
      );
    }

    // Learn auth flow for this site
    if (!helper || !helper.auth) {
      const newHelper = helper || { domain: site, lastUpdated: "" };
      newHelper.auth = {
        loginUrl: "/login",
        usernameSelector: 'input[type="email"], input[name="email"]',
        passwordSelector: 'input[type="password"]',
        submitSelector: 'button[type="submit"]',
        successIndicator: "dashboard",
      };
      saveSiteHelper(newHelper as SiteHelper);
    }

    return !isOnLoginPage;
  } catch (err: any) {
    console.log(`❌ Authentication failed: ${err.message}`);
    const ssPath = screenshotPath("auth-error");
    await page.screenshot({ path: ssPath }).catch(() => {});
    console.log(`📸 Debug screenshot: ${ssPath}`);
    return false;
  }
}

async function addCredential(site: string): Promise<void> {
  console.log(`
🔐 Add Credentials for: ${site}

To add credentials, run with --username and --password:
  bun run CBrowser.ts creds add ${site} --username "your@email.com" --password "yourpassword"

Or create manually at:
  ${CREDENTIALS_FILE}
`);
}

function listCredentials(): void {
  const creds = loadCredentials();
  const sites = Object.keys(creds);

  console.log(`
🔐 Stored Credentials
═══════════════════════════════════════════════════════════════════════════════
`);

  if (sites.length === 0) {
    console.log("  (none)");
  } else {
    for (const site of sites) {
      const c = creds[site];
      console.log(`  ${site.padEnd(30)} ${c.username.padEnd(30)} (last: ${c.lastUsed?.split("T")[0] || "never"})`);
    }
  }
}

function listHelpers(): void {
  console.log(`
🧠 Learned Site Helpers
═══════════════════════════════════════════════════════════════════════════════
`);

  try {
    const files = readdirSync(HELPERS_DIR).filter(f => f.endsWith(".json"));
    if (files.length === 0) {
      console.log("  (none - helpers are learned automatically)");
    } else {
      for (const file of files) {
        const helper = JSON.parse(readFileSync(join(HELPERS_DIR, file), "utf-8")) as SiteHelper;
        const modalCount = helper.modals?.length || 0;
        const hasAuth = helper.auth ? "✅" : "❌";
        console.log(`  ${helper.domain.padEnd(30)} Modals: ${modalCount}  Auth: ${hasAuth}  (${helper.lastUpdated?.split("T")[0] || "?"})`);
      }
    }
  } catch {
    console.log("  (none)");
  }
}

// ============================================================================
// Journey - Autonomous Multi-Step Exploration
// ============================================================================

async function runJourney(personaName: string, options: Record<string, string> = {}): Promise<JourneyResult> {
  const persona = BUILTIN_PERSONAS[personaName] || loadCustomPersona(personaName);
  if (!persona) {
    console.error(`❌ Persona not found: ${personaName}`);
    console.log("Available: " + Object.keys(BUILTIN_PERSONAS).join(", "));
    process.exit(1);
  }

  const startUrl = options.start || options.url;
  const goal = options.goal || "Explore the site";

  if (!startUrl) {
    console.error("❌ Journey requires --start <url>");
    process.exit(1);
  }

  console.log(`
🎭 ═══════════════════════════════════════════════════════════════════════════
   AUTONOMOUS JOURNEY: ${persona.name}
   "${persona.description}"
═══════════════════════════════════════════════════════════════════════════════
   Start:   ${startUrl}
   Goal:    ${goal}
   Viewport: ${persona.context?.viewport?.join("x") || "1280x800"}
═══════════════════════════════════════════════════════════════════════════════
`);

  const startTime = Date.now();
  const steps: JourneyStep[] = [];
  const frictionPoints: string[] = [];
  const consoleLogs: ConsoleEntry[] = [];
  let currentStepLogs: ConsoleEntry[] = [];

  // Console type icons for real-time display
  const consoleIcons: Record<string, string> = {
    log: "📝",
    info: "ℹ️",
    warn: "⚠️",
    error: "❌",
    debug: "🔍",
    trace: "📋",
  };

  // Set viewport for persona
  const viewport = persona.context?.viewport || [1280, 800];

  // Close any existing page and create new one with persona viewport
  if (globalPage) {
    await globalPage.close().catch(() => {});
    globalPage = null;
  }

  const browser = await getBrowser();
  globalPage = await browser.newPage({
    viewport: { width: viewport[0], height: viewport[1] }
  });
  const page = globalPage;

  // Create HumanBehavior wrapper for realistic interactions
  const human = new HumanBehavior(page, persona);

  // Log behavior summary
  console.log(`\n🧠 Human Behavior Simulation:`);
  console.log(human.getBehaviorSummary());
  console.log("");

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSOLE CAPTURE: Real-time streaming + storage
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`📺 Console Output (${persona.name}):`);
  console.log("─".repeat(70));

  page.on("console", (msg) => {
    const type = msg.type() as ConsoleEntry["type"];
    const text = msg.text();
    const location = msg.location();
    const timestamp = new Date().toISOString();

    const entry: ConsoleEntry = {
      type,
      text: text.substring(0, 500), // Limit length
      timestamp,
      url: location?.url,
      lineNumber: location?.lineNumber,
    };

    // Store in both journey-wide and current step logs
    consoleLogs.push(entry);
    currentStepLogs.push(entry);

    // Real-time streaming to terminal
    const icon = consoleIcons[type] || "•";
    const shortText = text.length > 80 ? text.substring(0, 80) + "..." : text;

    // Color based on type
    if (type === "error") {
      console.log(`   ${icon} \x1b[31m[ERROR]\x1b[0m ${shortText}`);
      frictionPoints.push(`Console error: ${text.substring(0, 100)}`);
    } else if (type === "warn") {
      console.log(`   ${icon} \x1b[33m[WARN]\x1b[0m ${shortText}`);
    } else if (type === "info") {
      console.log(`   ${icon} \x1b[36m[INFO]\x1b[0m ${shortText}`);
    } else if (type === "debug") {
      console.log(`   ${icon} \x1b[90m[DEBUG]\x1b[0m ${shortText}`);
    } else {
      console.log(`   ${icon} [LOG] ${shortText}`);
    }
  });

  // Also capture page errors (uncaught exceptions)
  page.on("pageerror", (error) => {
    const entry: ConsoleEntry = {
      type: "error",
      text: `Page Error: ${error.message}`,
      timestamp: new Date().toISOString(),
    };
    consoleLogs.push(entry);
    currentStepLogs.push(entry);
    console.log(`   ❌ \x1b[31m[PAGE ERROR]\x1b[0m ${error.message.substring(0, 80)}`);
    frictionPoints.push(`Page error: ${error.message.substring(0, 100)}`);
  });

  console.log("─".repeat(70));

  try {
    // Step 1: Navigate to start
    console.log(`\n📍 Step 1: Navigate to start URL`);

    // Human-like initial reaction time before starting
    await human.wait("reaction");

    await page.goto(startUrl, { waitUntil: "networkidle", timeout: 45000 });

    // Human reads the page initially
    await human.readContent("body");

    let ssPath = screenshotPath("journey-1");
    await page.screenshot({ path: ssPath, fullPage: true });
    steps.push({
      action: "navigate",
      target: startUrl,
      result: `Loaded: ${await page.title()}`,
      screenshot: ssPath,
      timestamp: new Date().toISOString(),
    });
    console.log(`   ✅ Loaded: "${await page.title()}"`);
    console.log(`   📸 ${ssPath}`);

    // Step 2: Handle any modals/popups
    console.log(`\n📍 Step 2: Handle popups/modals`);

    // Human pauses to notice and read modal
    await human.wait("reaction");

    const modalHandled = await handleModals(page);
    if (modalHandled) {
      // Human takes time to process the modal
      await human.wait("click");

      ssPath = screenshotPath("journey-2");
      await page.screenshot({ path: ssPath });
      steps.push({
        action: "dismiss_modal",
        result: "Modal dismissed",
        screenshot: ssPath,
        timestamp: new Date().toISOString(),
      });
      console.log(`   ✅ Modal handled`);
    } else {
      console.log(`   ℹ️  No modal detected`);
    }

    // Step 3: Explore navigation
    console.log(`\n📍 Step 3: Explore navigation`);

    // Human scans the navigation
    await human.scroll("down", 100);  // Small scroll to see nav
    await human.wait("reaction");

    const navLinks = await page.$$eval("nav a, header a", links =>
      links.slice(0, 10).map(l => ({
        text: l.textContent?.trim(),
        href: l.getAttribute("href")
      })).filter(l => l.text && l.href)
    );
    console.log(`   Found ${navLinks.length} navigation links`);

    // Check if impatient user would abandon
    if (human.shouldAbandon() && navLinks.length === 0) {
      frictionPoints.push("User would abandon: no clear navigation");
      console.log(`   ⚠️ [${persona.name}] Might abandon - no clear nav`);
    }

    // Step 4: Click a main navigation link (based on goal)
    console.log(`\n📍 Step 4: Navigate based on goal`);
    const targetLink = findRelevantLink(navLinks, goal);
    if (targetLink) {
      console.log(`   Clicking: "${targetLink.text}" → ${targetLink.href}`);

      // Use HumanBehavior for realistic click
      const clickResult = await human.click(`a[href="${targetLink.href}"]`).catch(async () => {
        return await human.click(`text="${targetLink.text}"`);
      });

      if (clickResult?.misClicked) {
        frictionPoints.push(`Mis-clicked on "${targetLink.text}" (recovered: ${clickResult.recovered})`);
      }

      // Human reads the new page
      await human.readContent("body");

      ssPath = screenshotPath("journey-4");
      await page.screenshot({ path: ssPath, fullPage: true });
      steps.push({
        action: "click",
        target: targetLink.text || targetLink.href,
        result: `Navigated to: ${page.url()}`,
        screenshot: ssPath,
        timestamp: new Date().toISOString(),
      });
      console.log(`   ✅ Now at: ${page.url()}`);
      console.log(`   📸 ${ssPath}`);

      // Handle modals again
      await handleModals(page);
    }

    // Step 5: Look for and click into content (links OR clickable cards)
    console.log(`\n📍 Step 5: Explore content`);

    // First, try to find clickable cards (divs with cursor-pointer)
    let clickedContent = false;

    // Strategy A: Find clickable cards
    try {
      const cardClicked = await page.evaluate(() => {
        // Look for cards with cursor pointer
        const cards = document.querySelectorAll("[class*='card'], [class*='Card'], article, [role='article']");
        for (const card of cards) {
          const style = window.getComputedStyle(card);
          if (style.cursor === "pointer") {
            const text = card.textContent?.trim().substring(0, 50);
            (card as HTMLElement).click();
            return text || "card";
          }
        }

        // Look for any clickable content area
        const clickables = document.querySelectorAll("main [style*='cursor: pointer'], main [class*='clickable'], main [class*='hover']");
        for (const el of clickables) {
          const style = window.getComputedStyle(el);
          if (style.cursor === "pointer") {
            const text = el.textContent?.trim().substring(0, 50);
            (el as HTMLElement).click();
            return text || "element";
          }
        }

        return null;
      });

      if (cardClicked) {
        console.log(`   Clicked card: "${cardClicked}..."`);
        await page.waitForTimeout(2000);

        ssPath = screenshotPath("journey-5");
        await page.screenshot({ path: ssPath, fullPage: true });
        steps.push({
          action: "click_card",
          target: cardClicked,
          result: `Clicked: ${cardClicked}`,
          screenshot: ssPath,
          timestamp: new Date().toISOString(),
        });
        console.log(`   ✅ Clicked card content`);
        console.log(`   📸 ${ssPath}`);
        clickedContent = true;

        // Handle modals again
        await handleModals(page);
      }
    } catch (err) {
      console.log(`   ⚠️  Card click failed: ${err}`);
    }

    // Strategy B: Fall back to links
    if (!clickedContent) {
      const contentLinks = await page.$$eval("main a, article a, .card a, [class*='card'] a", links =>
        links.slice(0, 5).map(l => ({
          text: l.textContent?.trim(),
          href: l.getAttribute("href")
        })).filter(l => l.href && !l.href.startsWith("#"))
      );

      if (contentLinks.length > 0) {
        const contentLink = contentLinks[0];
        console.log(`   Clicking link: "${contentLink.text?.substring(0, 30)}..."`);

        try {
          await page.click(`a[href="${contentLink.href}"]`);
          await page.waitForTimeout(2000);

          ssPath = screenshotPath("journey-5");
          await page.screenshot({ path: ssPath, fullPage: true });
          steps.push({
            action: "click",
            target: contentLink.text || contentLink.href,
            result: `Viewed: ${await page.title()}`,
            screenshot: ssPath,
            timestamp: new Date().toISOString(),
          });
          console.log(`   ✅ Viewed: "${await page.title()}"`);
          console.log(`   📸 ${ssPath}`);
          clickedContent = true;

          // Handle modals again
          await handleModals(page);
        } catch (err) {
          frictionPoints.push(`Could not click content link: ${contentLink.text}`);
        }
      }
    }

    if (!clickedContent) {
      console.log(`   ℹ️  No clickable content found`);
    }

    // Step 6: Final screenshot and summary
    console.log(`\n📍 Step 6: Final state`);
    ssPath = screenshotPath("journey-final");
    await page.screenshot({ path: ssPath, fullPage: true });
    steps.push({
      action: "final",
      result: `Final page: ${await page.title()}`,
      screenshot: ssPath,
      timestamp: new Date().toISOString(),
    });

    const totalTime = Date.now() - startTime;

    // Journey summary
    console.log(`
🎭 ═══════════════════════════════════════════════════════════════════════════
   JOURNEY COMPLETE
═══════════════════════════════════════════════════════════════════════════════
   Persona:      ${persona.name}
   Goal:         ${goal}
   Steps:        ${steps.length}
   Total time:   ${(totalTime / 1000).toFixed(1)}s
   Friction:     ${frictionPoints.length} points
═══════════════════════════════════════════════════════════════════════════════
`);

    if (frictionPoints.length > 0) {
      console.log("🔴 Friction Points:");
      frictionPoints.forEach(f => console.log(`   • ${f}`));
    }

    // Console log summary
    const errorCount = consoleLogs.filter(l => l.type === "error").length;
    const warnCount = consoleLogs.filter(l => l.type === "warn").length;
    const logCount = consoleLogs.filter(l => l.type === "log" || l.type === "info").length;

    console.log(`\n📺 Console Summary (${persona.name}):`);
    console.log(`   Total entries: ${consoleLogs.length}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   ⚠️  Warnings: ${warnCount}`);
    console.log(`   📝 Logs/Info: ${logCount}`);

    if (errorCount > 0) {
      console.log(`\n   Top errors:`);
      consoleLogs
        .filter(l => l.type === "error")
        .slice(0, 5)
        .forEach(l => console.log(`   • ${l.text.substring(0, 60)}...`));
    }

    console.log("\n📸 Screenshots:");
    steps.forEach((s, i) => console.log(`   ${i + 1}. ${s.screenshot}`));

    const result: JourneyResult = {
      persona: personaName,
      goal,
      steps,
      success: true,
      frictionPoints,
      totalTime,
      consoleLogs,
    };

    // Save journey result
    const journeyFile = join(MEMORY_DIR, `journey-${Date.now()}.json`);
    writeFileSync(journeyFile, JSON.stringify(result, null, 2));
    console.log(`\n📁 Journey saved: ${journeyFile}`);

    return result;
  } catch (err: any) {
    console.error(`❌ Journey failed: ${err.message}`);

    // Still show console summary on failure
    console.log(`\n📺 Console captured (${consoleLogs.length} entries) before failure`);

    return {
      persona: personaName,
      goal,
      steps,
      success: false,
      frictionPoints: [...frictionPoints, err.message],
      totalTime: Date.now() - startTime,
      consoleLogs,
    };
  }
}

// ============================================================================
// Site Helpers - Smart Navigation Memory
// ============================================================================

interface SiteHelper {
  domain: string;
  modals?: Array<{
    name: string;
    selector: string;
    dismissMethod: "click" | "js_remove" | "storage";
    dismissSelector?: string;
    storageKey?: string;
    storageValue?: string;
  }>;
  auth?: {
    loginUrl: string;
    usernameSelector: string;
    passwordSelector: string;
    submitSelector: string;
    successIndicator: string;
  };
  navigation?: Record<string, string>; // "providers" -> "/providers"
  lastUpdated: string;
}

function getSiteHelper(domain: string): SiteHelper | null {
  const helperFile = join(HELPERS_DIR, `${domain.replace(/\./g, "_")}.json`);
  if (existsSync(helperFile)) {
    return JSON.parse(readFileSync(helperFile, "utf-8"));
  }
  return null;
}

function saveSiteHelper(helper: SiteHelper): void {
  const helperFile = join(HELPERS_DIR, `${helper.domain.replace(/\./g, "_")}.json`);
  helper.lastUpdated = new Date().toISOString();
  writeFileSync(helperFile, JSON.stringify(helper, null, 2));
  console.log(`   💾 Saved helper for ${helper.domain}`);
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ============================================================================
// Credential Storage
// ============================================================================

interface StoredCredentials {
  [site: string]: {
    username: string;
    password: string; // In real use, this should be encrypted
    vaultPassphrase?: string; // For E2E encrypted vaults
    pin?: string; // For quick-unlock or secondary verification
    lastUsed?: string;
  };
}

function loadCredentials(): StoredCredentials {
  if (existsSync(CREDENTIALS_FILE)) {
    return JSON.parse(readFileSync(CREDENTIALS_FILE, "utf-8"));
  }
  return {};
}

function saveCredential(
  site: string,
  username: string,
  password: string,
  vaultPassphrase?: string,
  pin?: string
): void {
  const creds = loadCredentials();
  creds[site] = {
    username,
    password,
    ...(vaultPassphrase && { vaultPassphrase }),
    ...(pin && { pin }),
    lastUsed: new Date().toISOString(),
  };
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2));
  console.log(`   💾 Saved credentials for ${site}`);
  if (vaultPassphrase) console.log(`   💾 Saved vault passphrase`);
  if (pin) console.log(`   💾 Saved PIN`);
}

function getCredential(site: string): {
  username: string;
  password: string;
  vaultPassphrase?: string;
  pin?: string;
} | null {
  const creds = loadCredentials();
  return creds[site] || null;
}

// ============================================================================
// Smart Modal Handling with Learning
// ============================================================================

async function handleModals(page: Page): Promise<boolean> {
  const domain = getDomain(page.url());
  let helper = getSiteHelper(domain);
  let handled = false;

  try {
    // First, try site-specific helpers if we have them
    if (helper?.modals) {
      for (const modal of helper.modals) {
        const modalEl = await page.$(modal.selector);
        if (modalEl && await modalEl.isVisible()) {
          console.log(`   🧠 Using learned helper for: ${modal.name}`);

          if (modal.dismissMethod === "click" && modal.dismissSelector) {
            await page.click(modal.dismissSelector, { timeout: 3000 }).catch(() => {});
            await page.waitForTimeout(500);
          } else if (modal.dismissMethod === "storage" && modal.storageKey) {
            await page.evaluate(({ key, value }) => {
              localStorage.setItem(key, value || "true");
              sessionStorage.setItem(key, value || "true");
            }, { key: modal.storageKey, value: modal.storageValue });
          } else if (modal.dismissMethod === "js_remove") {
            await page.evaluate((sel) => {
              document.querySelector(sel)?.remove();
            }, modal.selector);
          }

          handled = true;
        }
      }
    }

    // Generic modal detection and handling
    const modalSelectors = [
      'div[role="dialog"]',
      '[aria-modal="true"]',
      '.modal',
      '[class*="modal"]',
      '[class*="popup"]',
    ];

    for (const selector of modalSelectors) {
      const modal = await page.$(selector);
      if (modal && await modal.isVisible()) {
        console.log(`   🔍 Detected modal: ${selector}`);

        // Try many dismiss patterns
        const dismissPatterns = [
          'button:has-text("I am 18")',
          'button:has-text("Enter")',
          'button:has-text("Accept")',
          'button:has-text("Agree")',
          'button:has-text("OK")',
          'button:has-text("Close")',
          'button:has-text("Got it")',
          'button:has-text("Continue")',
          'button:has-text("Yes")',
          '[aria-label="Close"]',
          '.close-button',
          '.btn-close',
          '[class*="close"]',
        ];

        for (const pattern of dismissPatterns) {
          try {
            const btn = await page.$(pattern);
            if (btn && await btn.isVisible()) {
              console.log(`   👆 Clicking dismiss: ${pattern}`);
              await btn.click({ force: true });
              await page.waitForTimeout(500);

              // Check if modal is gone
              const stillVisible = await modal.isVisible().catch(() => false);
              if (!stillVisible) {
                // Learn this pattern for future use
                if (!helper) {
                  helper = { domain, modals: [], lastUpdated: "" };
                }
                if (!helper.modals) helper.modals = [];
                helper.modals.push({
                  name: `auto-detected-${helper.modals.length}`,
                  selector,
                  dismissMethod: "click",
                  dismissSelector: pattern,
                });
                saveSiteHelper(helper);
                return true;
              }
            }
          } catch {}
        }

        // Try escape key
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);

        // Check if gone after escape
        let stillVisible = await modal.isVisible().catch(() => false);
        if (!stillVisible) {
          return true;
        }

        // Try setting common age-verification storage keys
        await page.evaluate(() => {
          const ageKeys = ["ageVerified", "age_verified", "isAdult", "over18", "age-gate"];
          ageKeys.forEach(key => {
            localStorage.setItem(key, "true");
            sessionStorage.setItem(key, "true");
          });
        });
        await page.waitForTimeout(300);

        // Last resort: JS remove
        stillVisible = await modal.isVisible().catch(() => false);
        if (stillVisible) {
          console.log(`   🔧 Force-removing modal via JS`);
          await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (el) el.remove();
            // Also remove any backdrop
            document.querySelectorAll('[class*="backdrop"], [class*="overlay"]').forEach(e => e.remove());
          }, selector);

          // Learn this for future
          if (!helper) {
            helper = { domain, modals: [], lastUpdated: "" };
          }
          if (!helper.modals) helper.modals = [];
          helper.modals.push({
            name: `force-remove-${helper.modals.length}`,
            selector,
            dismissMethod: "js_remove",
          });
          saveSiteHelper(helper);
          handled = true;
        }
      }
    }

    return handled;
  } catch (err) {
    console.log(`   ⚠️  Modal handling error: ${err}`);
    return false;
  }
}

function findRelevantLink(
  links: Array<{ text?: string; href?: string | null }>,
  goal: string
): { text?: string; href?: string | null } | null {
  const goalLower = goal.toLowerCase();

  // Keywords to look for based on goal
  const keywords = goalLower.split(/\s+/).filter(w => w.length > 3);

  for (const link of links) {
    const text = (link.text || "").toLowerCase();
    const href = (link.href || "").toLowerCase();

    // Check if link matches goal keywords
    for (const keyword of keywords) {
      if (text.includes(keyword) || href.includes(keyword)) {
        return link;
      }
    }
  }

  // Default to first meaningful link
  return links.find(l => l.text && l.href && !l.href.startsWith("#")) || null;
}

function loadCustomPersona(name: string): Persona | null {
  // Check JSON first, then YAML
  const jsonFile = join(PERSONAS_DIR, `${name}.json`);
  if (existsSync(jsonFile)) {
    return JSON.parse(readFileSync(jsonFile, "utf-8"));
  }
  const yamlFile = join(PERSONAS_DIR, `${name}.yaml`);
  if (existsSync(yamlFile)) {
    // Basic YAML to persona object parsing
    const content = readFileSync(yamlFile, "utf-8");
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const descMatch = content.match(/^description:\s*(.+)$/m);
    return {
      name: nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, "") : name,
      description: descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, "") : "Custom persona",
      demographics: { age_range: "any", tech_level: "intermediate", device: "desktop" },
      behaviors: {},
      humanBehavior: BUILTIN_PERSONAS["first-timer"].humanBehavior,
      context: { viewport: [1280, 800] },
    };
  }
  const ymlFile = join(PERSONAS_DIR, `${name}.yml`);
  if (existsSync(ymlFile)) {
    const content = readFileSync(ymlFile, "utf-8");
    const nameMatch = content.match(/^name:\s*(.+)$/m);
    const descMatch = content.match(/^description:\s*(.+)$/m);
    return {
      name: nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, "") : name,
      description: descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, "") : "Custom persona",
      demographics: { age_range: "any", tech_level: "intermediate", device: "desktop" },
      behaviors: {},
      humanBehavior: BUILTIN_PERSONAS["first-timer"].humanBehavior,
      context: { viewport: [1280, 800] },
    };
  }
  return null;
}

// ============================================================================
// Persona Management
// ============================================================================

function listPersonas(): void {
  console.log(`
🎭 Available Personas
═══════════════════════════════════════════════════════════════════════════════

Built-in:
`);
  for (const [name, persona] of Object.entries(BUILTIN_PERSONAS)) {
    const viewport = persona.context?.viewport?.join("x") || "default";
    console.log(`  ${name.padEnd(15)} ${persona.description}`);
    console.log(`                  Tech: ${persona.demographics.tech_level}, Viewport: ${viewport}`);
  }

  // Check for custom personas
  console.log("\nCustom:");
  try {
    const files = readdirSync(PERSONAS_DIR);
    const customPersonas = files.filter((f: string) => f.endsWith(".json") || f.endsWith(".yaml") || f.endsWith(".yml"));
    if (customPersonas.length === 0) {
      console.log("  (none)");
    } else {
      for (const file of customPersonas) {
        try {
          const content = readFileSync(join(PERSONAS_DIR, file), "utf-8");
          let persona: any;
          if (file.endsWith(".json")) {
            persona = JSON.parse(content);
          } else {
            // Simple YAML parsing for name/description fields
            const nameMatch = content.match(/^name:\s*(.+)$/m);
            const descMatch = content.match(/^description:\s*(.+)$/m);
            persona = {
              name: nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, "") : file.replace(/\.(yaml|yml)$/, ""),
              description: descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, "") : "Custom persona",
            };
          }
          console.log(`  ${persona.name.padEnd(15)} ${persona.description}`);
        } catch {
          console.log(`  ${file.padEnd(15)} (error reading)`);
        }
      }
    }
  } catch {
    console.log("  (none)");
  }
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Save current browser session to disk
 * @param name - Session name for saving
 * @param targetUrl - Optional URL to navigate to first (if browser is on about:blank)
 */
async function saveSession(
  name: string,
  targetUrl?: string,
  testCredentials?: { email: string; password: string; baseUrl: string }
): Promise<void> {
  const page = await getPage();
  const context = page.context();

  // Check if we're on a blank page
  let currentUrl = page.url();
  if (currentUrl === "about:blank" || currentUrl === "") {
    if (targetUrl) {
      console.log(`🌐 Navigating to ${targetUrl} before saving session...`);
      await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
      currentUrl = page.url();
    } else {
      console.error("Error: Browser is on about:blank. Use --url to specify a site to save.");
      console.log("Example: session save mysite --url https://example.com");
      process.exit(1);
    }
  }

  // Get current state
  const url = currentUrl;
  const domain = new URL(url).hostname;
  const viewport = page.viewportSize() || { width: 1280, height: 720 };

  // Get cookies
  const cookies = await context.cookies();

  // Get localStorage and sessionStorage
  const storageData = await page.evaluate(() => {
    const local: Record<string, string> = {};
    const session: Record<string, string> = {};

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) local[key] = localStorage.getItem(key) || "";
    }

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) session[key] = sessionStorage.getItem(key) || "";
    }

    return { localStorage: local, sessionStorage: session };
  });

  const session: SavedSession = {
    name,
    created: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
    domain,
    url,
    viewport,
    cookies: cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite as "Strict" | "Lax" | "None",
    })),
    localStorage: storageData.localStorage,
    sessionStorage: storageData.sessionStorage,
    // Store test credentials for auto-relogin (base64 encoded password)
    testCredentials: testCredentials
      ? {
          email: testCredentials.email,
          password: Buffer.from(testCredentials.password).toString("base64"),
          baseUrl: testCredentials.baseUrl,
        }
      : undefined,
  };

  const sessionPath = join(SESSIONS_DIR, `${name}.json`);
  writeFileSync(sessionPath, JSON.stringify(session, null, 2));
  console.log(`✓ Session saved: ${name}`);
  console.log(`  Domain: ${domain}`);
  console.log(`  URL: ${url}`);
  console.log(`  Cookies: ${cookies.length}`);
  console.log(`  localStorage keys: ${Object.keys(storageData.localStorage).length}`);
  console.log(`  sessionStorage keys: ${Object.keys(storageData.sessionStorage).length}`);
  if (testCredentials) {
    console.log(`  Test credentials: ${testCredentials.email} (auto-relogin enabled)`);
  }
  console.log(`  File: ${sessionPath}`);
}

/**
 * Load a saved session with auto-relogin support
 */
async function loadSession(name: string): Promise<void> {
  const sessionPath = join(SESSIONS_DIR, `${name}.json`);

  if (!existsSync(sessionPath)) {
    console.error(`Session not found: ${name}`);
    console.log("Use 'session list' to see available sessions");
    process.exit(1);
  }

  const session: SavedSession = JSON.parse(readFileSync(sessionPath, "utf-8"));
  const page = await getPage();
  const context = page.context();

  // Set viewport
  await page.setViewportSize(session.viewport);

  // Add cookies
  if (session.cookies.length > 0) {
    await context.addCookies(session.cookies);
  }

  // Navigate to URL first (needed for localStorage/sessionStorage)
  await page.goto(session.url, { waitUntil: "domcontentloaded" });

  // Restore localStorage and sessionStorage
  await page.evaluate(
    ({ local, sess }) => {
      // Restore localStorage
      for (const [key, value] of Object.entries(local)) {
        localStorage.setItem(key, value);
      }
      // Restore sessionStorage
      for (const [key, value] of Object.entries(sess)) {
        sessionStorage.setItem(key, value);
      }
    },
    { local: session.localStorage, sess: session.sessionStorage }
  );

  // Reload to apply any auth-dependent state
  await page.reload({ waitUntil: "domcontentloaded" });

  // Check if session is still valid (if this is a test session with credentials)
  if (session.testCredentials) {
    console.log(`  🔐 Test session detected, checking authentication...`);
    const baseUrl = session.testCredentials.baseUrl;

    // Check session validity
    await page.goto(`${baseUrl}/api/dev/session-info`, { waitUntil: "networkidle", timeout: 10000 });
    const bodyText = await page.textContent("body");

    try {
      const sessionInfo = JSON.parse(bodyText || "{}");
      if (!sessionInfo.authenticated) {
        console.log(`  ⚠️ Session expired, auto-relogin in progress...`);

        // Decode password and relogin
        const password = Buffer.from(session.testCredentials.password, "base64").toString("utf-8");
        const loginResult = await loginTestUser(session.testCredentials.email, password, baseUrl);

        if (loginResult.success && loginResult.cookies) {
          // Apply new session cookies
          const baseHostname = new URL(baseUrl).hostname;
          const cookiesToAdd = loginResult.cookies.map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain.startsWith(".") ? c.domain : `.${baseHostname}`,
            path: c.path,
            httpOnly: c.name.includes("session"),
            secure: baseUrl.startsWith("https"),
            sameSite: "Lax" as const,
          }));

          await context.addCookies(cookiesToAdd);

          // Update cookies in saved session
          session.cookies = cookiesToAdd.map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            expires: -1,
            httpOnly: c.httpOnly,
            secure: c.secure,
            sameSite: c.sameSite as "Strict" | "Lax" | "None",
          }));

          console.log(`  ✅ Auto-relogin successful!`);
        } else {
          console.log(`  ❌ Auto-relogin failed: ${loginResult.message}`);
        }
      } else {
        console.log(`  ✅ Session still valid (user ID: ${sessionInfo.user_id})`);
      }
    } catch {
      console.log(`  ⚠️ Could not verify session status`);
    }

    // Navigate back to original URL
    await page.goto(session.url, { waitUntil: "domcontentloaded" });
  }

  // Update lastUsed
  session.lastUsed = new Date().toISOString();
  writeFileSync(sessionPath, JSON.stringify(session, null, 2));

  console.log(`✓ Session loaded: ${name}`);
  console.log(`  Domain: ${session.domain}`);
  console.log(`  URL: ${session.url}`);
  console.log(`  Created: ${session.created}`);

  // Take screenshot to verify
  const screenshotPath = join(SCREENSHOTS_DIR, `session-${name}-${Date.now()}.png`);
  await page.screenshot({ path: screenshotPath });
  console.log(`  Screenshot: ${screenshotPath}`);
}

/**
 * List all saved sessions
 */
function listSessions(): void {
  console.log("\n📂 Saved Sessions:");
  console.log("─".repeat(70));

  try {
    const files = readdirSync(SESSIONS_DIR);
    const sessions = files.filter((f: string) => f.endsWith(".json"));

    if (sessions.length === 0) {
      console.log("  (no saved sessions)");
      console.log("\n  Use 'session save <name>' to save the current session");
      return;
    }

    for (const file of sessions) {
      try {
        const session: SavedSession = JSON.parse(readFileSync(join(SESSIONS_DIR, file), "utf-8"));
        const lastUsed = new Date(session.lastUsed).toLocaleDateString();
        const name = session.name.padEnd(20);
        console.log(`  ${name} ${lastUsed.padEnd(12)} ${session.domain}`);
      } catch {
        console.log(`  ${file} (invalid format)`);
      }
    }

    console.log("─".repeat(70));
    console.log(`  Total: ${sessions.length} session(s)`);
  } catch {
    console.log("  (no saved sessions)");
  }
}

/**
 * Delete a saved session
 */
function deleteSession(name: string): void {
  const sessionPath = join(SESSIONS_DIR, `${name}.json`);

  if (!existsSync(sessionPath)) {
    console.error(`Session not found: ${name}`);
    console.log("Use 'session list' to see available sessions");
    process.exit(1);
  }

  const session: SavedSession = JSON.parse(readFileSync(sessionPath, "utf-8"));
  const { unlinkSync } = require("fs");
  unlinkSync(sessionPath);

  console.log(`✓ Session deleted: ${name}`);
  console.log(`  Domain: ${session.domain}`);
  console.log(`  Created: ${session.created}`);
}

// ============================================================================
// Cleanup - Keep footprint minimal
// ============================================================================

interface CleanupOptions {
  dryRun?: boolean;
  olderThan?: number; // Days
  keepJourneys?: number; // Keep last N journeys
  keepScreenshots?: number; // Keep last N screenshots
  keepSessions?: number; // Keep last N sessions
  verbose?: boolean;
}

interface CleanupResult {
  screenshots: { deleted: number; bytes: number; files: string[] };
  journeys: { deleted: number; bytes: number; files: string[] };
  sessions: { deleted: number; bytes: number; files: string[] };
  audit: { deleted: number; bytes: number; files: string[] };
  total: { deleted: number; bytes: number };
}

/**
 * Parse duration string like "7d", "24h", "30d" to milliseconds
 */
function parseDuration(str: string): number {
  const match = str.match(/^(\d+)(d|h|m)$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // Default 7 days

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "d":
      return value * 24 * 60 * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "m":
      return value * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}

// ============================================================================
// Tier 1 Features (v2.4.0)
// ============================================================================

/**
 * Parse geolocation from string (preset name or lat,lon)
 */
function parseGeoLocation(location: string): GeoLocation | null {
  if (LOCATION_PRESETS[location]) {
    return LOCATION_PRESETS[location];
  }
  const parts = location.split(",");
  if (parts.length === 2) {
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lon)) {
      return { latitude: lat, longitude: lon, accuracy: 100 };
    }
  }
  return null;
}

/**
 * Set geolocation on browser context
 */
async function setGeolocation(geo: GeoLocation): Promise<void> {
  const page = await getPage();
  const context = page.context();
  await context.setGeolocation(geo);
  await context.grantPermissions(["geolocation"]);
}

/**
 * List all cookies
 */
async function listCookies(): Promise<void> {
  const page = await getPage();
  const context = page.context();
  const cookies = await context.cookies();

  if (cookies.length === 0) {
    console.log("No cookies found");
    return;
  }

  console.log("\n🍪 Cookies:\n");
  for (const cookie of cookies) {
    console.log(`  ${cookie.name}`);
    console.log(`    Value: ${cookie.value.substring(0, 50)}${cookie.value.length > 50 ? "..." : ""}`);
    console.log(`    Domain: ${cookie.domain}`);
    console.log(`    Path: ${cookie.path}`);
    console.log(`    Expires: ${cookie.expires === -1 ? "Session" : new Date(cookie.expires * 1000).toISOString()}`);
    console.log("");
  }
}

/**
 * Set a cookie
 */
async function setCookie(name: string, value: string, domain: string, path: string): Promise<void> {
  const page = await getPage();
  const context = page.context();
  await context.addCookies([{
    name,
    value,
    domain,
    path,
    expires: Math.floor(Date.now() / 1000) + 86400, // 24 hours from now
    httpOnly: false,
    secure: domain.includes(".") ? true : false,
    sameSite: "Lax" as const,
  }]);
  console.log(`✓ Cookie set: ${name}=${value}`);
}

/**
 * Delete a cookie
 */
async function deleteCookie(name: string, domain?: string): Promise<void> {
  const page = await getPage();
  const context = page.context();
  const cookies = await context.cookies();
  const filtered = cookies.filter((c) => {
    if (c.name !== name) return true;
    if (domain && c.domain !== domain) return true;
    return false;
  });

  await context.clearCookies();
  if (filtered.length > 0) {
    await context.addCookies(filtered);
  }
  console.log(`✓ Cookie deleted: ${name}`);
}

/**
 * Clear all cookies
 */
async function clearCookies(): Promise<void> {
  const page = await getPage();
  const context = page.context();
  await context.clearCookies();
  console.log("✓ All cookies cleared");
}

/**
 * Start HAR recording
 */
function startHarRecording(): void {
  isRecordingHar = true;
  harEntries = [];
  networkRequests = [];
}

/**
 * Export HAR file
 */
async function exportHar(outputPath?: string): Promise<void> {
  isRecordingHar = false;

  const harLog: HARLog = {
    version: "1.2",
    creator: { name: "CBrowser", version: "2.4.0" },
    entries: harEntries,
  };

  const har = { log: harLog };
  const harDir = join(MEMORY_DIR, "har");
  if (!existsSync(harDir)) {
    mkdirSync(harDir, { recursive: true });
  }

  const filename = outputPath || join(harDir, `har-${Date.now()}.har`);
  writeFileSync(filename, JSON.stringify(har, null, 2));

  console.log(`✓ HAR saved: ${filename}`);
  console.log(`  Entries: ${harEntries.length}`);
}

/**
 * List network requests
 */
function listNetworkRequests(): void {
  if (networkRequests.length === 0) {
    console.log("No network requests captured");
    console.log("Navigate to a page first to capture requests");
    return;
  }

  console.log(`\n🌐 Network Requests (${networkRequests.length}):\n`);
  for (const req of networkRequests.slice(-20)) {
    console.log(`  ${req.method} ${req.url.substring(0, 80)}${req.url.length > 80 ? "..." : ""}`);
    console.log(`    Type: ${req.resourceType} | Time: ${req.timestamp}`);
  }
  if (networkRequests.length > 20) {
    console.log(`\n  ... and ${networkRequests.length - 20} more requests`);
  }
}

/**
 * Clear network history
 */
function clearNetworkHistory(): void {
  networkRequests = [];
  harEntries = [];
}

/**
 * Collect performance metrics
 */
async function collectPerformanceMetrics(): Promise<PerformanceMetrics> {
  const page = await getPage();

  const metrics = await page.evaluate(() => {
    const result: Record<string, number | undefined> = {};

    const navTiming = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    if (navTiming) {
      result.ttfb = navTiming.responseStart - navTiming.requestStart;
      result.domContentLoaded = navTiming.domContentLoadedEventEnd - navTiming.startTime;
      result.load = navTiming.loadEventEnd - navTiming.startTime;
    }

    const paintEntries = performance.getEntriesByType("paint");
    for (const entry of paintEntries) {
      if (entry.name === "first-contentful-paint") {
        result.fcp = entry.startTime;
      }
    }

    const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
    if (lcpEntries.length > 0) {
      result.lcp = (lcpEntries[lcpEntries.length - 1] as any).startTime;
    }

    const clsEntries = performance.getEntriesByType("layout-shift");
    let clsScore = 0;
    for (const entry of clsEntries) {
      if (!(entry as any).hadRecentInput) {
        clsScore += (entry as any).value || 0;
      }
    }
    result.cls = clsScore;

    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    result.resourceCount = resources.length;
    result.transferSize = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);

    return result;
  });

  const lcpRating = metrics.lcp
    ? metrics.lcp <= 2500 ? "good" : metrics.lcp <= 4000 ? "needs-improvement" : "poor"
    : undefined;

  const clsRating = metrics.cls !== undefined
    ? metrics.cls <= 0.1 ? "good" : metrics.cls <= 0.25 ? "needs-improvement" : "poor"
    : undefined;

  const result: PerformanceMetrics = {
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

  console.log("\n📊 Performance Metrics:\n");
  if (result.lcp) console.log(`  LCP: ${result.lcp.toFixed(0)}ms (${result.lcpRating})`);
  if (result.fcp) console.log(`  FCP: ${result.fcp.toFixed(0)}ms`);
  if (result.cls !== undefined) console.log(`  CLS: ${result.cls.toFixed(3)} (${result.clsRating})`);
  if (result.ttfb) console.log(`  TTFB: ${result.ttfb.toFixed(0)}ms`);
  if (result.domContentLoaded) console.log(`  DOMContentLoaded: ${result.domContentLoaded.toFixed(0)}ms`);
  if (result.load) console.log(`  Load: ${result.load.toFixed(0)}ms`);
  if (result.resourceCount) console.log(`  Resources: ${result.resourceCount}`);
  if (result.transferSize) console.log(`  Transfer Size: ${formatBytes(result.transferSize)}`);

  return result;
}

/**
 * Audit performance against budget
 */
async function auditPerformance(budget: PerformanceBudget): Promise<PerformanceAuditResult> {
  const page = await getPage();
  const metrics = await collectPerformanceMetrics();
  const violations: string[] = [];
  let passed = true;

  if (budget.lcp && metrics.lcp && metrics.lcp > budget.lcp) {
    violations.push(`LCP ${metrics.lcp.toFixed(0)}ms exceeds budget ${budget.lcp}ms`);
    passed = false;
  }
  if (budget.fcp && metrics.fcp && metrics.fcp > budget.fcp) {
    violations.push(`FCP ${metrics.fcp.toFixed(0)}ms exceeds budget ${budget.fcp}ms`);
    passed = false;
  }
  if (budget.cls && metrics.cls && metrics.cls > budget.cls) {
    violations.push(`CLS ${metrics.cls.toFixed(3)} exceeds budget ${budget.cls}`);
    passed = false;
  }
  if (budget.ttfb && metrics.ttfb && metrics.ttfb > budget.ttfb) {
    violations.push(`TTFB ${metrics.ttfb.toFixed(0)}ms exceeds budget ${budget.ttfb}ms`);
    passed = false;
  }

  const result: PerformanceAuditResult = {
    url: page.url(),
    timestamp: new Date().toISOString(),
    metrics,
    budget,
    passed,
    violations,
  };

  console.log("");
  console.log(`  Result: ${passed ? "✓ PASSED" : "✗ FAILED"}`);

  if (violations.length > 0) {
    console.log("");
    console.log("  ⚠️  Budget Violations:");
    for (const v of violations) {
      console.log(`    - ${v}`);
    }
  }

  return result;
}

// ============================================================================
// Tier 2: Visual Regression Functions (v2.5.0)
// ============================================================================

/**
 * Ensure baselines directory exists
 */
function ensureBaselinesDir(): void {
  if (!existsSync(BASELINES_DIR)) {
    mkdirSync(BASELINES_DIR, { recursive: true });
  }
}

/**
 * Save a visual baseline
 */
async function saveBaseline(name: string, url?: string): Promise<string> {
  ensureBaselinesDir();
  const page = await getPage();

  const screenshotPath = join(BASELINES_DIR, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const baseline: VisualBaseline = {
    name,
    url: url || page.url(),
    viewport: page.viewportSize() || { width: 1280, height: 800 },
    screenshotPath,
    created: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
  };

  const metaPath = join(BASELINES_DIR, `${name}.json`);
  writeFileSync(metaPath, JSON.stringify(baseline, null, 2));

  console.log(`✓ Baseline saved: ${name}`);
  console.log(`  Screenshot: ${screenshotPath}`);

  return screenshotPath;
}

/**
 * Compare current page to a baseline
 */
async function compareBaseline(name: string, threshold: number = 0.1): Promise<VisualRegressionResult> {
  ensureBaselinesDir();
  const page = await getPage();

  const metaPath = join(BASELINES_DIR, `${name}.json`);
  if (!existsSync(metaPath)) {
    throw new Error(`Baseline not found: ${name}. Run 'visual save ${name}' first.`);
  }

  const baseline: VisualBaseline = JSON.parse(readFileSync(metaPath, "utf-8"));

  // Take current screenshot
  const currentPath = join(BASELINES_DIR, `${name}-current-${Date.now()}.png`);
  await page.screenshot({ path: currentPath, fullPage: true });

  // Read both images and compare pixels
  const baselineBuffer = readFileSync(baseline.screenshotPath);
  const currentBuffer = readFileSync(currentPath);

  // Simple pixel comparison (comparing buffer lengths as basic check)
  // In production, you'd use a proper image diffing library
  const sizeDiff = Math.abs(baselineBuffer.length - currentBuffer.length);
  const maxSize = Math.max(baselineBuffer.length, currentBuffer.length);
  const diffPercentage = sizeDiff / maxSize;

  const passed = diffPercentage <= threshold;

  const result: VisualRegressionResult = {
    baseline: baseline.screenshotPath,
    current: currentPath,
    diffPercentage,
    passed,
    threshold,
    timestamp: new Date().toISOString(),
  };

  // Update baseline lastUsed
  baseline.lastUsed = new Date().toISOString();
  writeFileSync(metaPath, JSON.stringify(baseline, null, 2));

  console.log(`\n🖼️  Visual Regression Test: ${name}`);
  console.log(`   Baseline: ${baseline.screenshotPath}`);
  console.log(`   Current:  ${currentPath}`);
  console.log(`   Diff:     ${(diffPercentage * 100).toFixed(2)}%`);
  console.log(`   Threshold: ${(threshold * 100).toFixed(2)}%`);
  console.log(`   Result:   ${passed ? "✓ PASSED" : "✗ FAILED"}`);

  return result;
}

/**
 * List all baselines
 */
function listBaselines(): void {
  ensureBaselinesDir();

  const files = readdirSync(BASELINES_DIR).filter(f => f.endsWith(".json"));

  if (files.length === 0) {
    console.log("No visual baselines found");
    console.log("Create one with: visual save <name>");
    return;
  }

  console.log(`\n🖼️  Visual Baselines (${files.length}):\n`);

  for (const file of files) {
    const baseline: VisualBaseline = JSON.parse(readFileSync(join(BASELINES_DIR, file), "utf-8"));
    console.log(`  ${baseline.name}`);
    console.log(`    URL: ${baseline.url}`);
    console.log(`    Viewport: ${baseline.viewport.width}x${baseline.viewport.height}`);
    console.log(`    Created: ${baseline.created}`);
    console.log("");
  }
}

/**
 * Delete a baseline
 */
function deleteBaseline(name: string): void {
  const metaPath = join(BASELINES_DIR, `${name}.json`);
  const screenshotPath = join(BASELINES_DIR, `${name}.png`);

  if (existsSync(metaPath)) unlinkSync(metaPath);
  if (existsSync(screenshotPath)) unlinkSync(screenshotPath);

  console.log(`✓ Baseline deleted: ${name}`);
}

// ============================================================================
// Tier 2: Accessibility Audit Functions (v2.5.0)
// ============================================================================

/**
 * Run accessibility audit using axe-core rules (simplified implementation)
 */
async function runAccessibilityAudit(): Promise<AccessibilityAuditResult> {
  const page = await getPage();

  // Inject simplified accessibility checks (in production, use axe-core)
  const results = await page.evaluate(() => {
    const violations: any[] = [];

    // Check for images without alt text
    document.querySelectorAll("img").forEach((img, i) => {
      if (!img.alt && !img.getAttribute("aria-label")) {
        violations.push({
          id: "img-alt",
          impact: "serious",
          description: "Images must have alternate text",
          help: "Ensures <img> elements have alternate text",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.4/image-alt",
          nodes: [{
            html: img.outerHTML.substring(0, 200),
            target: [`img:nth-of-type(${i + 1})`],
            failureSummary: "Missing alt attribute"
          }]
        });
      }
    });

    // Check for buttons without accessible names
    document.querySelectorAll("button").forEach((btn, i) => {
      if (!btn.textContent?.trim() && !btn.getAttribute("aria-label")) {
        violations.push({
          id: "button-name",
          impact: "critical",
          description: "Buttons must have discernible text",
          help: "Ensures buttons have discernible text",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.4/button-name",
          nodes: [{
            html: btn.outerHTML.substring(0, 200),
            target: [`button:nth-of-type(${i + 1})`],
            failureSummary: "Button has no accessible name"
          }]
        });
      }
    });

    // Check for inputs without labels
    document.querySelectorAll("input:not([type='hidden'])").forEach((input, i) => {
      const id = input.id;
      const hasLabel = id && document.querySelector(`label[for="${id}"]`);
      const hasAriaLabel = input.getAttribute("aria-label") || input.getAttribute("aria-labelledby");

      if (!hasLabel && !hasAriaLabel) {
        violations.push({
          id: "label",
          impact: "serious",
          description: "Form elements must have labels",
          help: "Ensures every form element has a label",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.4/label",
          nodes: [{
            html: (input as HTMLElement).outerHTML.substring(0, 200),
            target: [`input:nth-of-type(${i + 1})`],
            failureSummary: "Input has no associated label"
          }]
        });
      }
    });

    // Check for links without text
    document.querySelectorAll("a").forEach((link, i) => {
      if (!link.textContent?.trim() && !link.getAttribute("aria-label")) {
        violations.push({
          id: "link-name",
          impact: "serious",
          description: "Links must have discernible text",
          help: "Ensures links have discernible text",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.4/link-name",
          nodes: [{
            html: link.outerHTML.substring(0, 200),
            target: [`a:nth-of-type(${i + 1})`],
            failureSummary: "Link has no accessible name"
          }]
        });
      }
    });

    // Check for missing document language
    if (!document.documentElement.lang) {
      violations.push({
        id: "html-has-lang",
        impact: "serious",
        description: "Page must have lang attribute",
        help: "The <html> element must have a lang attribute",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.4/html-has-lang",
        nodes: [{
          html: "<html>",
          target: ["html"],
          failureSummary: "Missing lang attribute"
        }]
      });
    }

    // Count passes (elements that passed checks)
    const passes = document.querySelectorAll("img[alt], button:not(:empty), label, a:not(:empty)").length;

    return { violations, passes };
  });

  const score = results.passes > 0
    ? Math.round((results.passes / (results.passes + results.violations.length)) * 100)
    : 100;

  const audit: AccessibilityAuditResult = {
    url: page.url(),
    timestamp: new Date().toISOString(),
    violations: results.violations,
    passes: results.passes,
    incomplete: 0,
    score,
  };

  console.log(`\n♿ Accessibility Audit Results`);
  console.log(`   URL: ${audit.url}`);
  console.log(`   Score: ${score}%`);
  console.log(`   Passes: ${results.passes}`);
  console.log(`   Violations: ${results.violations.length}`);

  if (results.violations.length > 0) {
    console.log(`\n   ⚠️  Violations:`);
    for (const v of results.violations) {
      console.log(`\n   [${v.impact.toUpperCase()}] ${v.id}`);
      console.log(`     ${v.description}`);
      console.log(`     Help: ${v.helpUrl}`);
      for (const node of v.nodes.slice(0, 3)) {
        console.log(`     - ${node.failureSummary}`);
      }
      if (v.nodes.length > 3) {
        console.log(`     ... and ${v.nodes.length - 3} more`);
      }
    }
  }

  return audit;
}

// ============================================================================
// Tier 2: Test Output Functions (v2.5.0)
// ============================================================================

/**
 * Export test results as JUnit XML
 */
function exportJUnit(suite: TestSuiteResult, outputPath?: string): string {
  const output = outputPath || join(MEMORY_DIR, `junit-${Date.now()}.xml`);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<testsuite name="${suite.name}" tests="${suite.tests.length}" failures="${suite.failed}" skipped="${suite.skipped}" time="${(suite.duration / 1000).toFixed(3)}" timestamp="${suite.timestamp}">\n`;

  for (const test of suite.tests) {
    xml += `  <testcase name="${test.name}" time="${(test.duration / 1000).toFixed(3)}">\n`;
    if (test.status === "failed" && test.error) {
      xml += `    <failure message="${test.error.replace(/"/g, "&quot;")}">${test.error}</failure>\n`;
    }
    if (test.status === "skipped") {
      xml += `    <skipped/>\n`;
    }
    xml += `  </testcase>\n`;
  }

  xml += `</testsuite>\n`;

  writeFileSync(output, xml);
  console.log(`✓ JUnit report saved: ${output}`);

  return output;
}

/**
 * Export test results as TAP (Test Anything Protocol)
 */
function exportTAP(suite: TestSuiteResult, outputPath?: string): string {
  const output = outputPath || join(MEMORY_DIR, `tap-${Date.now()}.tap`);

  let tap = `TAP version 13\n`;
  tap += `1..${suite.tests.length}\n`;

  suite.tests.forEach((test, i) => {
    const status = test.status === "passed" ? "ok" : "not ok";
    tap += `${status} ${i + 1} ${test.name}`;
    if (test.status === "skipped") {
      tap += ` # SKIP`;
    }
    if (test.status === "failed" && test.error) {
      tap += `\n  ---\n  message: ${test.error}\n  ...`;
    }
    tap += `\n`;
  });

  writeFileSync(output, tap);
  console.log(`✓ TAP report saved: ${output}`);

  return output;
}

// ============================================================================
// Tier 2: Test Recording Functions (v2.5.0)
// ============================================================================

/**
 * Ensure recordings directory exists
 */
function ensureRecordingsDir(): void {
  if (!existsSync(RECORDINGS_DIR)) {
    mkdirSync(RECORDINGS_DIR, { recursive: true });
  }
}

/**
 * Start recording interactions
 */
async function startRecording(startUrl?: string): Promise<void> {
  isRecording = true;
  recordedActions = [];

  if (startUrl) {
    const navResult = await navigate(startUrl, {});
    recordingStartUrl = startUrl;
    recordedActions.push({
      type: "navigate",
      url: startUrl,
      timestamp: Date.now(),
    });
  } else {
    const page = await getPage();
    recordingStartUrl = page.url();
  }

  console.log("🎬 Recording started");
  console.log(`   Start URL: ${recordingStartUrl}`);
  console.log("   Perform actions, then run 'record stop <name>'");
}

/**
 * Stop recording and save
 */
async function stopRecording(name: string): Promise<string> {
  ensureRecordingsDir();
  isRecording = false;

  const recording: RecordedTest = {
    name,
    startUrl: recordingStartUrl,
    actions: recordedActions,
    created: new Date().toISOString(),
  };

  const filePath = join(RECORDINGS_DIR, `${name}.json`);
  writeFileSync(filePath, JSON.stringify(recording, null, 2));

  console.log(`✓ Recording saved: ${name}`);
  console.log(`   Actions: ${recordedActions.length}`);
  console.log(`   File: ${filePath}`);

  // Generate TypeScript test code
  const codePath = join(RECORDINGS_DIR, `${name}.ts`);
  const code = generateTestCode(recording);
  writeFileSync(codePath, code);
  console.log(`   Test code: ${codePath}`);

  recordedActions = [];
  recordingStartUrl = "";

  return filePath;
}

/**
 * Generate TypeScript test code from recording
 */
function generateTestCode(recording: RecordedTest): string {
  let code = `// Generated test: ${recording.name}\n`;
  code += `// Created: ${recording.created}\n\n`;
  code += `import { CBrowser } from "./CBrowser";\n\n`;
  code += `async function test_${recording.name.replace(/[^a-zA-Z0-9]/g, "_")}() {\n`;
  code += `  const browser = new CBrowser();\n\n`;

  for (const action of recording.actions) {
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
      case "screenshot":
        code += `  await browser.screenshot();\n`;
        break;
      case "wait":
        code += `  await browser.wait(${action.value});\n`;
        break;
    }
  }

  code += `\n  await browser.close();\n`;
  code += `}\n\n`;
  code += `test_${recording.name.replace(/[^a-zA-Z0-9]/g, "_")}();\n`;

  return code;
}

/**
 * List recordings
 */
function listRecordings(): void {
  ensureRecordingsDir();
  const files = readdirSync(RECORDINGS_DIR).filter(f => f.endsWith(".json"));

  if (files.length === 0) {
    console.log("No recordings found");
    console.log("Start recording with: record start [--url <url>]");
    return;
  }

  console.log(`\n🎬 Recordings (${files.length}):\n`);

  for (const file of files) {
    const recording: RecordedTest = JSON.parse(readFileSync(join(RECORDINGS_DIR, file), "utf-8"));
    console.log(`  ${recording.name}`);
    console.log(`    URL: ${recording.startUrl}`);
    console.log(`    Actions: ${recording.actions.length}`);
    console.log(`    Created: ${recording.created}`);
    console.log("");
  }
}

/**
 * Replay a recording
 */
async function replayRecording(name: string): Promise<void> {
  const filePath = join(RECORDINGS_DIR, `${name}.json`);
  if (!existsSync(filePath)) {
    throw new Error(`Recording not found: ${name}`);
  }

  const recording: RecordedTest = JSON.parse(readFileSync(filePath, "utf-8"));
  console.log(`\n▶️  Replaying: ${recording.name}`);

  for (const action of recording.actions) {
    console.log(`   ${action.type}: ${action.selector || action.url || ""}`);
    switch (action.type) {
      case "navigate":
        await navigate(action.url!, {});
        break;
      case "click":
        await click(action.selector!, {});
        break;
      case "fill":
        await fill(action.selector!, action.value!, {});
        break;
    }
  }

  console.log(`✓ Replay complete`);
}

// ============================================================================
// Tier 2: Webhook Functions (v2.5.0)
// ============================================================================

/**
 * Load webhooks config
 */
function loadWebhooks(): WebhookConfig[] {
  if (!existsSync(WEBHOOKS_FILE)) {
    return [];
  }
  return JSON.parse(readFileSync(WEBHOOKS_FILE, "utf-8"));
}

/**
 * Save webhooks config
 */
function saveWebhooks(webhooks: WebhookConfig[]): void {
  writeFileSync(WEBHOOKS_FILE, JSON.stringify(webhooks, null, 2));
}

/**
 * Add a webhook
 */
function addWebhook(name: string, url: string, format: "slack" | "discord" | "generic" = "generic"): void {
  const webhooks = loadWebhooks();
  webhooks.push({
    name,
    url,
    events: ["test.pass", "test.fail", "journey.complete", "visual.fail"],
    format,
  });
  saveWebhooks(webhooks);
  console.log(`✓ Webhook added: ${name}`);
}

/**
 * List webhooks
 */
function listWebhooks(): void {
  const webhooks = loadWebhooks();

  if (webhooks.length === 0) {
    console.log("No webhooks configured");
    console.log("Add one with: webhook add <name> <url> [--format slack|discord|generic]");
    return;
  }

  console.log(`\n🔔 Webhooks (${webhooks.length}):\n`);

  for (const wh of webhooks) {
    console.log(`  ${wh.name}`);
    console.log(`    URL: ${wh.url.substring(0, 50)}...`);
    console.log(`    Format: ${wh.format}`);
    console.log(`    Events: ${wh.events.join(", ")}`);
    console.log("");
  }
}

/**
 * Delete a webhook
 */
function deleteWebhook(name: string): void {
  const webhooks = loadWebhooks();
  const filtered = webhooks.filter(w => w.name !== name);
  if (filtered.length === webhooks.length) {
    console.log(`Webhook not found: ${name}`);
    return;
  }
  saveWebhooks(filtered);
  console.log(`✓ Webhook deleted: ${name}`);
}

/**
 * Send webhook notification
 */
async function sendWebhookNotification(event: string, data: Record<string, any>): Promise<void> {
  const webhooks = loadWebhooks();

  for (const wh of webhooks) {
    if (!wh.events.includes(event as any)) continue;

    let body: string;
    let headers: Record<string, string> = { "Content-Type": "application/json" };

    switch (wh.format) {
      case "slack":
        body = JSON.stringify({
          text: `[CBrowser] ${event}: ${data.name || data.url}`,
          attachments: [{
            color: data.passed ? "good" : "danger",
            fields: Object.entries(data).map(([k, v]) => ({ title: k, value: String(v), short: true })),
          }],
        });
        break;
      case "discord":
        body = JSON.stringify({
          content: `[CBrowser] ${event}`,
          embeds: [{
            title: data.name || data.url,
            color: data.passed ? 0x00ff00 : 0xff0000,
            fields: Object.entries(data).map(([k, v]) => ({ name: k, value: String(v), inline: true })),
          }],
        });
        break;
      default:
        body = JSON.stringify({ event, ...data });
    }

    try {
      const response = await fetch(wh.url, {
        method: "POST",
        headers,
        body,
      });
      console.log(`   Webhook ${wh.name}: ${response.ok ? "✓" : "✗"}`);
    } catch (err) {
      console.log(`   Webhook ${wh.name}: ✗ (${(err as Error).message})`);
    }
  }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * Get file stats safely
 */
function getFileSize(filePath: string): number {
  try {
    const stats = statSync(filePath);
    return stats.size;
  } catch {
    return 0;
  }
}

/**
 * Get file modification time safely
 */
function getFileMtime(filePath: string): Date {
  try {
    const stats = statSync(filePath);
    return stats.mtime;
  } catch {
    return new Date(0);
  }
}

/**
 * Clean up old files from CBrowser memory directories
 */
function cleanupMemory(options: CleanupOptions = {}): CleanupResult {
  const {
    dryRun = false,
    olderThan = 7, // Default 7 days
    keepJourneys = 50, // Keep last 50 journeys
    keepScreenshots = 100, // Keep last 100 screenshots
    keepSessions = 20, // Keep last 20 sessions
    verbose = false,
  } = options;

  const cutoffDate = new Date(Date.now() - olderThan * 24 * 60 * 60 * 1000);

  const result: CleanupResult = {
    screenshots: { deleted: 0, bytes: 0, files: [] },
    journeys: { deleted: 0, bytes: 0, files: [] },
    sessions: { deleted: 0, bytes: 0, files: [] },
    audit: { deleted: 0, bytes: 0, files: [] },
    total: { deleted: 0, bytes: 0 },
  };

  console.log(`
🧹 ═══════════════════════════════════════════════════════════════════════════
   CBROWSER CLEANUP ${dryRun ? "(DRY RUN)" : ""}
═══════════════════════════════════════════════════════════════════════════════
   Policy: Delete files older than ${olderThan} days (before ${cutoffDate.toLocaleDateString()})
   Keep: ${keepJourneys} journeys, ${keepScreenshots} screenshots, ${keepSessions} sessions
═══════════════════════════════════════════════════════════════════════════════
`);

  // Helper to clean a directory
  const cleanDirectory = (
    dir: string,
    pattern: RegExp,
    keepCount: number,
    category: keyof Omit<CleanupResult, "total">
  ) => {
    if (!existsSync(dir)) {
      console.log(`   📁 ${category}: Directory not found`);
      return;
    }

    try {
      const files = readdirSync(dir)
        .filter((f) => pattern.test(f))
        .map((f) => ({
          name: f,
          path: join(dir, f),
          mtime: getFileMtime(join(dir, f)),
          size: getFileSize(join(dir, f)),
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // Newest first

      // Keep the newest N files, delete the rest that are also older than cutoff
      const toDelete = files.slice(keepCount).filter((f) => f.mtime < cutoffDate);

      if (toDelete.length === 0) {
        console.log(`   📁 ${category}: Nothing to clean (${files.length} files, all recent)`);
        return;
      }

      for (const file of toDelete) {
        result[category].files.push(file.name);
        result[category].bytes += file.size;
        result[category].deleted++;

        if (verbose) {
          console.log(`      ${dryRun ? "Would delete" : "Deleting"}: ${file.name} (${formatBytes(file.size)})`);
        }

        if (!dryRun) {
          try {
            unlinkSync(file.path);
          } catch (e) {
            console.log(`      ⚠️ Failed to delete: ${file.name}`);
          }
        }
      }

      console.log(
        `   📁 ${category}: ${dryRun ? "Would delete" : "Deleted"} ${toDelete.length}/${files.length} files (${formatBytes(result[category].bytes)})`
      );
    } catch (err) {
      console.log(`   📁 ${category}: Error reading directory`);
    }
  };

  // Clean screenshots (oldest first, keep recent)
  cleanDirectory(SCREENSHOTS_DIR, /\.(png|jpg|jpeg|webp)$/i, keepScreenshots, "screenshots");

  // Clean journeys (oldest first, keep recent)
  cleanDirectory(MEMORY_DIR, /^journey-.*\.json$/i, keepJourneys, "journeys");

  // Clean sessions (oldest first, keep recent) - be more conservative
  cleanDirectory(SESSIONS_DIR, /\.json$/i, keepSessions, "sessions");

  // Clean audit logs (oldest first)
  const auditDir = join(MEMORY_DIR, "audit");
  if (existsSync(auditDir)) {
    cleanDirectory(auditDir, /\.json$/i, 100, "audit");
  }

  // Calculate totals
  result.total.deleted =
    result.screenshots.deleted + result.journeys.deleted + result.sessions.deleted + result.audit.deleted;
  result.total.bytes =
    result.screenshots.bytes + result.journeys.bytes + result.sessions.bytes + result.audit.bytes;

  // Summary
  console.log(`
═══════════════════════════════════════════════════════════════════════════════
   SUMMARY ${dryRun ? "(DRY RUN - no files deleted)" : ""}
═══════════════════════════════════════════════════════════════════════════════
   Screenshots: ${result.screenshots.deleted} files (${formatBytes(result.screenshots.bytes)})
   Journeys:    ${result.journeys.deleted} files (${formatBytes(result.journeys.bytes)})
   Sessions:    ${result.sessions.deleted} files (${formatBytes(result.sessions.bytes)})
   Audit:       ${result.audit.deleted} files (${formatBytes(result.audit.bytes)})
   ─────────────────────────────────────────────────────────────────────────────
   TOTAL:       ${result.total.deleted} files | ${formatBytes(result.total.bytes)} ${dryRun ? "would be " : ""}freed
═══════════════════════════════════════════════════════════════════════════════
`);

  if (dryRun && result.total.deleted > 0) {
    console.log("   Run without --dry-run to actually delete these files.\n");
  }

  return result;
}

/**
 * Show storage usage stats
 */
function showStorageStats(): void {
  console.log(`
📊 ═══════════════════════════════════════════════════════════════════════════
   CBROWSER STORAGE USAGE
═══════════════════════════════════════════════════════════════════════════════
`);

  const countAndSize = (dir: string, pattern?: RegExp): { count: number; bytes: number } => {
    if (!existsSync(dir)) return { count: 0, bytes: 0 };
    try {
      const files = readdirSync(dir).filter((f) => !pattern || pattern.test(f));
      let bytes = 0;
      for (const f of files) {
        bytes += getFileSize(join(dir, f));
      }
      return { count: files.length, bytes };
    } catch {
      return { count: 0, bytes: 0 };
    }
  };

  const screenshots = countAndSize(SCREENSHOTS_DIR, /\.(png|jpg|jpeg|webp)$/i);
  const journeys = countAndSize(MEMORY_DIR, /^journey-.*\.json$/i);
  const sessions = countAndSize(SESSIONS_DIR, /\.json$/i);
  const selectors = countAndSize(join(MEMORY_DIR, "selectors"), /\.json$/i);
  const personas = countAndSize(join(MEMORY_DIR, "personas"), /\.json$/i);

  const total = screenshots.bytes + journeys.bytes + sessions.bytes + selectors.bytes + personas.bytes;

  console.log(`   📸 Screenshots:    ${screenshots.count.toString().padStart(5)} files  ${formatBytes(screenshots.bytes).padStart(10)}`);
  console.log(`   🎭 Journeys:       ${journeys.count.toString().padStart(5)} files  ${formatBytes(journeys.bytes).padStart(10)}`);
  console.log(`   💾 Sessions:       ${sessions.count.toString().padStart(5)} files  ${formatBytes(sessions.bytes).padStart(10)}`);
  console.log(`   🎯 Selectors:      ${selectors.count.toString().padStart(5)} files  ${formatBytes(selectors.bytes).padStart(10)}`);
  console.log(`   👤 Personas:       ${personas.count.toString().padStart(5)} files  ${formatBytes(personas.bytes).padStart(10)}`);
  console.log(`   ─────────────────────────────────────────────────────────────────────────────`);
  console.log(`   📦 TOTAL:                         ${formatBytes(total).padStart(10)}`);
  console.log(`
═══════════════════════════════════════════════════════════════════════════════
   Tip: Run 'cleanup --dry-run' to preview what would be deleted
        Run 'cleanup' to free space (uses safe defaults)
═══════════════════════════════════════════════════════════════════════════════
`);
}

// ============================================================================
// Natural Language API (v3.0.0)
// ============================================================================

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

  // Screenshots
  { pattern: /^(?:take\s+a?\s*)?screenshot(?:\s+as\s+["']?(.+?)["']?)?$/i, action: "screenshot", extract: (m) => ({ path: m[1] || "" }) },
  { pattern: /^capture(?:\s+the)?\s+(?:page|screen)$/i, action: "screenshot", extract: () => ({}) },

  // Waiting
  { pattern: /^wait(?:\s+for)?\s+(\d+)\s*(?:ms|milliseconds?)?$/i, action: "wait", extract: (m) => ({ ms: m[1] }) },
  { pattern: /^wait(?:\s+for)?\s+(\d+)\s*(?:s|seconds?)$/i, action: "waitSeconds", extract: (m) => ({ seconds: m[1] }) },

  // Extraction
  { pattern: /^(?:get|extract|find)\s+(?:all\s+)?(?:the\s+)?(.+)$/i, action: "extract", extract: (m) => ({ what: m[1] }) },
];

function parseNaturalLanguage(command: string): { action: string; params: Record<string, string> } | null {
  const trimmed = command.trim();
  for (const { pattern, action, extract } of NL_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return { action, params: extract(match) };
    }
  }
  return null;
}

async function executeNaturalLanguage(command: string, options: Record<string, string>): Promise<{
  success: boolean;
  action: string;
  result?: unknown;
  error?: string;
}> {
  const parsed = parseNaturalLanguage(command);
  if (!parsed) {
    return { success: false, action: "unknown", error: `Could not parse: "${command}"` };
  }

  const { action, params } = parsed;

  try {
    let result: unknown;
    switch (action) {
      case "navigate":
        result = await navigate(params.url, options);
        break;
      case "click":
        result = await click(params.selector, options);
        break;
      case "fill":
        result = await fill(params.selector, params.value, options);
        break;
      case "screenshot":
        result = await screenshot(params.path || undefined);
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
        result = await extract(params.what);
        break;
      default:
        return { success: false, action, error: `Unsupported action: ${action}` };
    }
    return { success: true, action, result };
  } catch (e: any) {
    return { success: false, action, error: e.message };
  }
}

// ============================================================================
// Parallel Execution (v2.5.0)
// ============================================================================

async function runParallelDevices(
  url: string,
  devices: string[],
  concurrency: number
): Promise<Array<{ device: string; result?: any; error?: string; duration: number }>> {
  const results: Array<{ device: string; result?: any; error?: string; duration: number }> = [];

  for (let i = 0; i < devices.length; i += concurrency) {
    const batch = devices.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (deviceName) => {
        const startTime = Date.now();
        try {
          const device = DEVICE_PRESETS[deviceName];
          if (!device) throw new Error(`Unknown device: ${deviceName}`);

          const browser = await chromium.launch({ headless: true });
          const context = await browser.newContext({
            viewport: device.viewport,
            userAgent: device.userAgent,
            deviceScaleFactor: device.deviceScaleFactor,
            isMobile: device.isMobile,
            hasTouch: device.hasTouch,
          });
          const page = await context.newPage();
          await page.goto(url, { waitUntil: "domcontentloaded" });

          const title = await page.title();
          const loadTime = Date.now() - startTime;
          const screenshotPath = join(SCREENSHOTS_DIR, `parallel-${deviceName}-${Date.now()}.png`);
          await page.screenshot({ path: screenshotPath });

          await browser.close();
          return { device: deviceName, result: { title, loadTime, screenshot: screenshotPath }, duration: Date.now() - startTime };
        } catch (e: any) {
          return { device: deviceName, error: e.message, duration: Date.now() - startTime };
        }
      })
    );
    results.push(...batchResults);
  }

  return results;
}

async function runParallelUrls(
  urls: string[],
  concurrency: number,
  task: "navigate" | "perf" = "navigate"
): Promise<Array<{ url: string; result?: any; error?: string; duration: number }>> {
  const results: Array<{ url: string; result?: any; error?: string; duration: number }> = [];

  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (url) => {
        const startTime = Date.now();
        try {
          const browser = await chromium.launch({ headless: true });
          const page = await browser.newPage();
          await page.goto(url, { waitUntil: "domcontentloaded" });

          let result: any;
          if (task === "perf") {
            const metrics = await page.evaluate(() => {
              const timing = performance.timing;
              const paintEntries = performance.getEntriesByType("paint");
              const fcp = paintEntries.find(e => e.name === "first-contentful-paint")?.startTime;
              return {
                ttfb: timing.responseStart - timing.requestStart,
                fcp: fcp || 0,
                load: timing.loadEventEnd - timing.navigationStart,
              };
            });
            result = metrics;
          } else {
            const title = await page.title();
            result = { title, loadTime: Date.now() - startTime };
          }

          await browser.close();
          return { url, result, duration: Date.now() - startTime };
        } catch (e: any) {
          return { url, error: e.message, duration: Date.now() - startTime };
        }
      })
    );
    results.push(...batchResults);
  }

  return results;
}

// ============================================================================
// Tier 4: Visual AI Understanding (v4.0.0)
// ============================================================================

async function findElementByIntent(intent: string): Promise<AIElement | null> {
  const page = await getPage();

  // Collect page elements with semantic info
  const pageData: PageElement[] = await page.evaluate(() => {
    const elements: PageElement[] = [];
    const all = document.querySelectorAll("a, button, input, select, textarea, [role='button'], [role='link'], [onclick]");

    all.forEach((el, i) => {
      const htmlEl = el as HTMLElement;
      const rect = htmlEl.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const text = htmlEl.innerText?.trim().substring(0, 100) || "";
      const ariaLabel = htmlEl.getAttribute("aria-label") || "";
      const placeholder = htmlEl.getAttribute("placeholder") || "";
      const title = htmlEl.getAttribute("title") || "";
      const price = text.match(/\$[\d,.]+/)?.[0];

      elements.push({
        tag: el.tagName.toLowerCase(),
        text: text || ariaLabel || placeholder || title,
        classes: htmlEl.className || "",
        id: htmlEl.id || "",
        role: htmlEl.getAttribute("role") || "",
        type: htmlEl.getAttribute("type") || "",
        price,
        selector: htmlEl.id ? `#${htmlEl.id}` : `[data-ai-index="${i}"]`
      });

      htmlEl.setAttribute("data-ai-index", String(i));
    });

    return elements;
  });

  // Match intent to elements
  const intentLower = intent.toLowerCase();
  let bestMatch: { element: PageElement; score: number } | null = null;

  for (const el of pageData) {
    let score = 0;
    const textLower = (el.text + " " + el.classes + " " + el.id).toLowerCase();

    // Keyword matching
    const keywords = intentLower.split(/\s+/);
    for (const kw of keywords) {
      if (textLower.includes(kw)) score += 20;
    }

    // Special intent patterns
    if (intentLower.includes("login") || intentLower.includes("sign in")) {
      if (textLower.includes("login") || textLower.includes("sign in")) score += 30;
      if (el.tag === "button" || el.role === "button") score += 10;
    }
    if (intentLower.includes("search")) {
      if (textLower.includes("search") || el.type === "search") score += 30;
      if (el.tag === "input") score += 10;
    }
    if (intentLower.includes("submit") || intentLower.includes("send")) {
      if (el.type === "submit" || textLower.includes("submit")) score += 30;
    }
    if (intentLower.includes("cheap") || intentLower.includes("price") || intentLower.includes("lowest")) {
      if (el.price) score += 25;
    }
    if (intentLower.includes("cart") || intentLower.includes("add to cart")) {
      if (textLower.includes("cart") || textLower.includes("add")) score += 30;
    }

    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { element: el, score };
    }
  }

  if (bestMatch && bestMatch.score >= 20) {
    return {
      selector: bestMatch.element.selector,
      confidence: Math.min(bestMatch.score / 100, 0.95),
      description: `${bestMatch.element.tag}: "${bestMatch.element.text.substring(0, 50)}"`
    };
  }

  return null;
}

async function clickByIntent(intent: string): Promise<{ success: boolean; selector?: string; error?: string }> {
  const element = await findElementByIntent(intent);
  if (!element) {
    return { success: false, error: `No element found matching: "${intent}"` };
  }

  try {
    const page = await getPage();
    await page.click(element.selector, { timeout: 5000 });
    return { success: true, selector: element.selector };
  } catch (err: any) {
    return { success: false, selector: element.selector, error: err.message };
  }
}

// ============================================================================
// Tier 4: Autonomous Bug Hunter (v4.0.0)
// ============================================================================

async function huntBugs(url: string, huntOptions: HuntOptions = {}): Promise<HuntResult> {
  const {
    maxPages = 10,
    timeout = 60000,
    checkLinks = true,
    checkConsole = true,
    checkA11y = true,
    checkImages = true,
  } = huntOptions;

  const bugs: BugReport[] = [];
  const visited = new Set<string>();
  const toVisit = [url];
  const startTime = Date.now();

  const browser = await getBrowser();
  const page = await browser.newPage();
  const consoleErrors: string[] = [];

  // Capture console errors
  if (checkConsole) {
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
  }

  while (toVisit.length > 0 && visited.size < maxPages && (Date.now() - startTime) < timeout) {
    const currentUrl = toVisit.shift()!;
    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    try {
      console.log(`🔍 Checking: ${currentUrl}`);
      await page.goto(currentUrl, { waitUntil: "networkidle", timeout: 15000 });
      consoleErrors.length = 0;

      // Check for console errors
      if (checkConsole && consoleErrors.length > 0) {
        for (const err of consoleErrors) {
          bugs.push({
            type: "console-error",
            severity: err.toLowerCase().includes("error") ? "high" : "medium",
            description: err.substring(0, 200),
            url: currentUrl,
          });
        }
      }

      // Check for broken images
      if (checkImages) {
        const brokenImages = await page.evaluate(() => {
          const imgs = document.querySelectorAll("img");
          const broken: string[] = [];
          imgs.forEach((img) => {
            if (!img.complete || img.naturalHeight === 0) {
              broken.push(img.src || img.getAttribute("data-src") || "unknown");
            }
          });
          return broken;
        });

        for (const src of brokenImages) {
          bugs.push({
            type: "missing-image",
            severity: "medium",
            description: `Broken image: ${src.substring(0, 100)}`,
            url: currentUrl,
          });
        }
      }

      // Basic accessibility checks
      if (checkA11y) {
        const a11yIssues = await page.evaluate(() => {
          const issues: string[] = [];
          // Images without alt
          document.querySelectorAll("img:not([alt])").forEach((img) => {
            issues.push(`Image missing alt attribute: ${(img as HTMLImageElement).src?.substring(0, 50)}`);
          });
          // Inputs without labels
          document.querySelectorAll("input:not([aria-label]):not([id])").forEach(() => {
            issues.push("Input element without associated label");
          });
          // Links without text
          document.querySelectorAll("a:empty, a:not(:has(*))").forEach((a) => {
            if (!(a as HTMLAnchorElement).innerText?.trim()) {
              issues.push(`Empty link: ${(a as HTMLAnchorElement).href?.substring(0, 50)}`);
            }
          });
          // Low contrast (basic check)
          // Buttons without accessible names
          document.querySelectorAll("button:empty:not([aria-label])").forEach(() => {
            issues.push("Button without accessible name");
          });
          return issues.slice(0, 10);
        });

        for (const issue of a11yIssues) {
          bugs.push({
            type: "a11y-violation",
            severity: "medium",
            description: issue,
            url: currentUrl,
          });
        }
      }

      // Collect links for further crawling
      if (checkLinks && visited.size < maxPages) {
        const links = await page.evaluate((baseUrl) => {
          const anchors = document.querySelectorAll("a[href]");
          const urls: string[] = [];
          const base = new URL(baseUrl);
          anchors.forEach((a) => {
            try {
              const href = (a as HTMLAnchorElement).href;
              const linkUrl = new URL(href);
              if (linkUrl.hostname === base.hostname && !urls.includes(href)) {
                urls.push(href);
              }
            } catch {}
          });
          return urls.slice(0, 20);
        }, url);

        for (const link of links) {
          if (!visited.has(link) && !toVisit.includes(link)) {
            toVisit.push(link);
          }
        }
      }
    } catch (err: any) {
      bugs.push({
        type: "broken-link",
        severity: "high",
        description: `Page failed to load: ${err.message}`,
        url: currentUrl,
      });
    }
  }

  await page.close();

  return {
    bugs,
    pagesVisited: visited.size,
    duration: Date.now() - startTime,
  };
}

// ============================================================================
// Tier 4: Cross-Browser Diff (v4.0.0)
// ============================================================================

async function crossBrowserDiff(url: string, browsers: BrowserName[] = ["chromium", "firefox", "webkit"]): Promise<BrowserDiffResult> {
  const { chromium, firefox, webkit } = await import("playwright");

  const screenshots: Record<string, string> = {};
  const timing: Record<string, number> = {};
  const differences: BrowserDifference[] = [];

  const browserLaunchers = {
    chromium: chromium,
    firefox: firefox,
    webkit: webkit,
  };

  for (const browserName of browsers) {
    const launcher = browserLaunchers[browserName];
    if (!launcher) continue;

    try {
      console.log(`🌐 Testing ${browserName}...`);
      const startTime = Date.now();

      const browser = await launcher.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

      const loadTime = Date.now() - startTime;
      timing[browserName] = loadTime;

      const ssPath = screenshotPath(`diff-${browserName}`);
      await page.screenshot({ path: ssPath, fullPage: true });
      screenshots[browserName] = ssPath;

      await browser.close();
      console.log(`   ✅ ${browserName}: ${loadTime}ms`);
    } catch (err: any) {
      console.log(`   ❌ ${browserName}: ${err.message}`);
      differences.push({
        type: "content",
        description: `${browserName} failed to load: ${err.message}`,
        browsers: [browserName],
        details: err.message,
      });
    }
  }

  // Timing comparison
  const timings = Object.entries(timing);
  if (timings.length >= 2) {
    const sorted = timings.sort((a, b) => a[1] - b[1]);
    const fastest = sorted[0];
    const slowest = sorted[sorted.length - 1];

    if (slowest[1] > fastest[1] * 1.5) {
      differences.push({
        type: "timing",
        description: `${slowest[0]} is ${Math.round((slowest[1] / fastest[1] - 1) * 100)}% slower than ${fastest[0]}`,
        browsers: [slowest[0] as BrowserName, fastest[0] as BrowserName],
        details: `${fastest[0]}: ${fastest[1]}ms, ${slowest[0]}: ${slowest[1]}ms`,
      });
    }
  }

  return {
    url,
    browsers,
    differences,
    screenshots: screenshots as Record<BrowserName, string>,
    timing: timing as Record<BrowserName, number>,
  };
}

// ============================================================================
// Tier 4: Chaos Engineering (v4.0.0)
// ============================================================================

async function applyChaos(page: any, config: ChaosConfig): Promise<void> {
  const context = page.context();

  // Network latency
  if (config.networkLatency) {
    await context.route("**/*", async (route: any) => {
      await new Promise((r) => setTimeout(r, config.networkLatency));
      await route.continue();
    });
    console.log(`   💥 Added ${config.networkLatency}ms network latency`);
  }

  // Offline mode
  if (config.offline) {
    await context.setOffline(true);
    console.log(`   💥 Set offline mode`);
  }

  // Block URLs
  if (config.blockUrls && config.blockUrls.length > 0) {
    for (const pattern of config.blockUrls) {
      await context.route(new RegExp(pattern), (route: any) => route.abort());
    }
    console.log(`   💥 Blocking: ${config.blockUrls.join(", ")}`);
  }

  // Fail API calls
  if (config.failApiCalls && config.failApiCalls.length > 0) {
    for (const pattern of config.failApiCalls) {
      await context.route(new RegExp(pattern), (route: any) =>
        route.fulfill({ status: 500, body: "Chaos: Simulated failure" })
      );
    }
    console.log(`   💥 Failing APIs: ${config.failApiCalls.join(", ")}`);
  }
}

async function runChaosTest(url: string, chaos: ChaosConfig, actions?: string[]): Promise<ChaosTestResult> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  const errors: string[] = [];
  const screenshots: string[] = [];
  const startTime = Date.now();

  // Capture errors
  page.on("console", (msg: any) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
    }
  });

  page.on("pageerror", (err: any) => {
    errors.push(`Page error: ${err.message}`);
  });

  try {
    // Apply chaos before navigation
    await applyChaos(page, chaos);

    // Navigate
    console.log(`\n🔥 Chaos test: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch((e: any) => {
      if (!chaos.offline) {
        errors.push(`Navigation failed: ${e.message}`);
      }
    });

    let ssPath = screenshotPath("chaos-start");
    await page.screenshot({ path: ssPath }).catch(() => {});
    screenshots.push(ssPath);

    // Execute actions if provided
    if (actions && actions.length > 0) {
      for (const action of actions) {
        try {
          if (action.startsWith("click ")) {
            const selector = action.replace("click ", "");
            await page.click(selector, { timeout: 5000 });
          } else if (action.startsWith("fill ")) {
            const [, selector, value] = action.match(/fill "([^"]+)" "([^"]+)"/) || [];
            if (selector && value) {
              await page.fill(selector, value, { timeout: 5000 });
            }
          } else if (action === "wait") {
            await page.waitForTimeout(2000);
          }
        } catch (err: any) {
          errors.push(`Action "${action}" failed: ${err.message}`);
        }
      }
    }

    ssPath = screenshotPath("chaos-end");
    await page.screenshot({ path: ssPath }).catch(() => {});
    screenshots.push(ssPath);

  } catch (err: any) {
    errors.push(`Test failed: ${err.message}`);
  }

  await page.close();

  const survived = errors.length === 0 || (chaos.offline && errors.every(e => e.includes("offline") || e.includes("network")));

  return {
    url,
    chaos,
    survived,
    errors,
    screenshots,
    duration: Date.now() - startTime,
  };
}

// ============================================================================
// Tier 5: Self-Healing Selector Cache (v5.0.0)
// ============================================================================

function loadSelectorCache(): SelectorCache {
  if (selectorCache) return selectorCache;

  if (existsSync(SELECTOR_CACHE_FILE)) {
    try {
      const data = readFileSync(SELECTOR_CACHE_FILE, "utf-8");
      selectorCache = JSON.parse(data);
      return selectorCache!;
    } catch {
      // Corrupted cache, start fresh
    }
  }

  selectorCache = { version: 1, entries: {} };
  return selectorCache;
}

function saveSelectorCache(): void {
  if (!selectorCache) return;
  writeFileSync(SELECTOR_CACHE_FILE, JSON.stringify(selectorCache, null, 2));
}

function getCachedSelector(originalSelector: string, domain: string): SelectorCacheEntry | null {
  const cache = loadSelectorCache();
  const key = `${domain}::${originalSelector}`;
  return cache.entries[key] || null;
}

function cacheSelector(
  originalSelector: string,
  workingSelector: string,
  domain: string,
  reason: string
): void {
  const cache = loadSelectorCache();
  const key = `${domain}::${originalSelector}`;

  if (cache.entries[key]) {
    cache.entries[key].workingSelector = workingSelector;
    cache.entries[key].successCount++;
    cache.entries[key].lastUsed = new Date().toISOString();
    cache.entries[key].reason = reason;
  } else {
    cache.entries[key] = {
      originalSelector,
      workingSelector,
      domain,
      successCount: 1,
      failCount: 0,
      lastUsed: new Date().toISOString(),
      reason,
    };
  }

  saveSelectorCache();
}

function updateCacheStats(originalSelector: string, domain: string, success: boolean): void {
  const cache = loadSelectorCache();
  const key = `${domain}::${originalSelector}`;

  if (cache.entries[key]) {
    if (success) {
      cache.entries[key].successCount++;
    } else {
      cache.entries[key].failCount++;
    }
    cache.entries[key].lastUsed = new Date().toISOString();
    saveSelectorCache();
  }
}

function getSelectorCacheStats(): SelectorCacheStats {
  const cache = loadSelectorCache();
  const entries = Object.values(cache.entries);

  const domainCounts = new Map<string, number>();
  let totalSuccesses = 0;
  let totalFailures = 0;

  for (const entry of entries) {
    totalSuccesses += entry.successCount;
    totalFailures += entry.failCount;
    domainCounts.set(entry.domain, (domainCounts.get(entry.domain) || 0) + 1);
  }

  const topDomains = Array.from(domainCounts.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalEntries: entries.length,
    totalSuccesses,
    totalFailures,
    topDomains,
  };
}

// ============================================================================
// Tier 5: Smart Click with Retry (v5.0.0)
// ============================================================================

async function generateAlternativeSelectors(selector: string): Promise<SelectorAlternative[]> {
  const page = await getPage();
  const alternatives: SelectorAlternative[] = [];

  // Try to find elements with similar text
  const normalizedText = selector.replace(/['"]/g, "").trim().toLowerCase();

  // Strategy 1: Case-insensitive text match
  try {
    const textVariants = [
      `text=${normalizedText}`,
      `text=${normalizedText.charAt(0).toUpperCase() + normalizedText.slice(1)}`,
      `text=${normalizedText.toUpperCase()}`,
    ];
    for (const variant of textVariants) {
      const count = await page.locator(variant).count();
      if (count > 0) {
        alternatives.push({
          selector: variant,
          confidence: 0.8,
          reason: "Case-insensitive text match",
        });
      }
    }
  } catch {}

  // Strategy 2: Partial text match
  try {
    const words = normalizedText.split(/\s+/);
    for (const word of words) {
      if (word.length > 3) {
        const partial = `text=${word}`;
        const count = await page.locator(partial).count();
        if (count > 0 && count < 5) {
          alternatives.push({
            selector: partial,
            confidence: 0.6,
            reason: `Partial text match: "${word}"`,
          });
        }
      }
    }
  } catch {}

  // Strategy 3: Role-based selectors
  try {
    const roles = ["button", "link", "menuitem", "tab"];
    for (const role of roles) {
      const roleSelector = `role=${role}[name=/${normalizedText}/i]`;
      const count = await page.locator(roleSelector).count();
      if (count > 0) {
        alternatives.push({
          selector: roleSelector,
          confidence: 0.75,
          reason: `ARIA role match: ${role}`,
        });
      }
    }
  } catch {}

  // Strategy 4: Attribute contains
  try {
    const attrs = ["aria-label", "title", "placeholder", "value"];
    for (const attr of attrs) {
      const attrSelector = `[${attr}*="${normalizedText}" i]`;
      const count = await page.locator(attrSelector).count();
      if (count > 0) {
        alternatives.push({
          selector: attrSelector,
          confidence: 0.7,
          reason: `Attribute match: ${attr}`,
        });
      }
    }
  } catch {}

  // Sort by confidence
  return alternatives.sort((a, b) => b.confidence - a.confidence);
}

async function smartClick(
  selector: string,
  options: { force?: boolean; maxRetries?: number; retryDelay?: number } = {}
): Promise<SmartRetryResult> {
  const { maxRetries = 3, retryDelay = 500 } = options;
  const page = await getPage();
  const url = new URL(page.url());
  const domain = url.hostname;

  const attempts: RetryAttempt[] = [];

  // Check cache first
  const cached = getCachedSelector(selector, domain);
  if (cached) {
    console.log(`   🔧 Self-healing: trying cached selector "${cached.workingSelector}"`);
    try {
      await page.locator(cached.workingSelector).first().click({ timeout: 5000 });
      updateCacheStats(selector, domain, true);
      attempts.push({
        selector: cached.workingSelector,
        success: true,
        timestamp: new Date().toISOString(),
      });
      return {
        success: true,
        attempts,
        finalSelector: cached.workingSelector,
        message: `Clicked using cached selector: ${cached.workingSelector}`,
        screenshot: await takeScreenshotInternal(),
      };
    } catch (err) {
      updateCacheStats(selector, domain, false);
      attempts.push({
        selector: cached.workingSelector,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Try original selector
  console.log(`   🔍 Trying original selector: "${selector}"`);
  try {
    const result = await click(selector, { force: options.force ? "true" : undefined });
    if (result.success) {
      attempts.push({
        selector,
        success: true,
        timestamp: new Date().toISOString(),
      });
      return {
        success: true,
        attempts,
        finalSelector: selector,
        message: result.message,
        screenshot: result.screenshot,
      };
    }
  } catch (err) {
    attempts.push({
      selector,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
  }

  // Generate and try alternatives
  console.log(`   🔄 Generating alternative selectors...`);
  const alternatives = await generateAlternativeSelectors(selector);

  for (let i = 0; i < Math.min(alternatives.length, maxRetries); i++) {
    const alt = alternatives[i];
    console.log(`   🔍 Trying alternative ${i + 1}: "${alt.selector}" (${alt.reason})`);

    await new Promise(resolve => setTimeout(resolve, retryDelay));

    try {
      await page.locator(alt.selector).first().click({ timeout: 5000 });
      attempts.push({
        selector: alt.selector,
        success: true,
        timestamp: new Date().toISOString(),
      });

      // Cache the working alternative
      cacheSelector(selector, alt.selector, domain, alt.reason);
      console.log(`   ✅ Success! Cached for future use.`);

      return {
        success: true,
        attempts,
        finalSelector: alt.selector,
        message: `Clicked using alternative: ${alt.selector} (${alt.reason})`,
        screenshot: await takeScreenshotInternal(),
      };
    } catch (err) {
      attempts.push({
        selector: alt.selector,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
    }
  }

  // All attempts failed
  const aiSuggestion = `Element "${selector}" not found. The page may have changed or the element may be hidden. Try checking if the page has loaded completely, or if the element requires scrolling into view.`;

  return {
    success: false,
    attempts,
    finalSelector: null,
    message: `Failed to click after ${attempts.length} attempts`,
    screenshot: await takeScreenshotInternal(),
    aiSuggestion,
  };
}

// ============================================================================
// Tier 5: Natural Language Assertions (v5.0.0)
// ============================================================================

async function evaluateAssertion(assertion: string): Promise<Omit<AssertionResult, "screenshot">> {
  const page = await getPage();
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
    try {
      const count = await page.locator(selector).count();
      const passed = count > 0;
      return { passed, assertion, expected: selector, message: passed ? `Element "${selector}" exists` : `Element "${selector}" not found` };
    } catch {
      return { passed: false, assertion, expected: selector, message: `Element "${selector}" not found` };
    }
  }

  // Element count assertions
  const countMatch = lowerAssertion.match(/(\d+)\s+(items?|elements?|buttons?|links?|rows?)/);
  if (countMatch) {
    const expectedCount = parseInt(countMatch[1]);
    const elementType = countMatch[2];

    let selectorToCount = "*";
    if (elementType.startsWith("button")) selectorToCount = "button, [role='button'], input[type='button'], input[type='submit']";
    if (elementType.startsWith("link")) selectorToCount = "a[href]";
    if (elementType.startsWith("row")) selectorToCount = "tr";
    if (elementType.startsWith("item")) {
      const containerMatch = assertion.match(/in\s+["']([^"']+)["']/);
      if (containerMatch) {
        selectorToCount = `${containerMatch[1]} > *`;
      }
    }

    const elements = await page.$$(selectorToCount);
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

async function assertCondition(assertion: string): Promise<AssertionResult> {
  try {
    const result = await evaluateAssertion(assertion);
    return {
      ...result,
      screenshot: await takeScreenshotInternal(),
    };
  } catch (error) {
    return {
      passed: false,
      assertion,
      message: `Assertion error: ${error instanceof Error ? error.message : String(error)}`,
      screenshot: await takeScreenshotInternal(),
    };
  }
}

// ============================================================================
// Tier 5: Page Analysis & Test Generation (v5.0.0)
// ============================================================================

async function analyzePage(): Promise<PageAnalysis> {
  const page = await getPage();

  const analysis = await page.evaluate(() => {
    const getSelector = (el: Element): string => {
      if (el.id) return `#${el.id}`;
      if (el.getAttribute("data-testid")) return `[data-testid="${el.getAttribute("data-testid")}"]`;
      if (el.getAttribute("name")) return `[name="${el.getAttribute("name")}"]`;

      const tag = el.tagName.toLowerCase();
      const classes = Array.from(el.classList).slice(0, 2).join(".");
      if (classes) return `${tag}.${classes}`;

      return tag;
    };

    const forms: FormAnalysis[] = Array.from(document.querySelectorAll("form")).map(form => {
      const fields = Array.from(form.querySelectorAll("input, textarea, select")).map(input => {
        const inputEl = input as HTMLInputElement;
        const label = form.querySelector(`label[for="${inputEl.id}"]`)?.textContent?.trim() || "";
        return {
          name: inputEl.name || "",
          inputType: inputEl.type || "text",
          label,
          required: inputEl.required,
          selector: getSelector(input),
        };
      });

      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');

      const isLoginForm = fields.some(f => f.inputType === "password") && fields.some(f => f.inputType === "email" || f.name.includes("email") || f.name.includes("user"));
      const isSearchForm = fields.some(f => f.inputType === "search" || f.name.includes("search") || f.name.includes("q"));

      return {
        selector: getSelector(form),
        action: form.action || "",
        method: form.method || "GET",
        fields,
        submitButton: submitBtn ? { text: submitBtn.textContent?.trim() || "Submit", selector: getSelector(submitBtn) } : null,
        isLoginForm,
        isSearchForm,
      };
    });

    const buttons: PageElement[] = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]')).map(btn => ({
      tag: btn.tagName.toLowerCase(),
      text: btn.textContent?.trim() || "",
      classes: Array.from(btn.classList).join(" "),
      id: btn.id || "",
      role: btn.getAttribute("role") || "",
      type: (btn as HTMLButtonElement).type || "",
      selector: getSelector(btn),
    }));

    const links: PageElement[] = Array.from(document.querySelectorAll("a[href]")).slice(0, 50).map(link => {
      const anchor = link as HTMLAnchorElement;
      return {
        tag: "a",
        text: anchor.textContent?.trim() || "",
        classes: Array.from(anchor.classList).join(" "),
        id: anchor.id || "",
        role: anchor.getAttribute("role") || "",
        type: "",
        href: anchor.href,
        selector: getSelector(anchor),
      };
    });

    const inputs: PageElement[] = Array.from(document.querySelectorAll("input:not([type='hidden']), textarea")).map(input => ({
      tag: input.tagName.toLowerCase(),
      text: "",
      classes: Array.from(input.classList).join(" "),
      id: input.id || "",
      role: input.getAttribute("role") || "",
      type: (input as HTMLInputElement).type || "",
      selector: getSelector(input),
    }));

    const selects: PageElement[] = Array.from(document.querySelectorAll("select")).map(select => ({
      tag: "select",
      text: "",
      classes: Array.from(select.classList).join(" "),
      id: select.id || "",
      role: select.getAttribute("role") || "",
      type: "",
      selector: getSelector(select),
    }));

    const hasLogin = forms.some(f => f.isLoginForm);
    const hasSearch = forms.some(f => f.isSearchForm);
    const hasNavigation = document.querySelector("nav, [role='navigation']") !== null;

    return {
      url: window.location.href,
      title: document.title,
      forms,
      buttons,
      links,
      inputs,
      selects,
      hasLogin,
      hasSearch,
      hasNavigation,
    };
  }) as PageAnalysis;

  return analysis;
}

function generateTestScenarios(analysis: PageAnalysis): GeneratedTest[] {
  const tests: GeneratedTest[] = [];

  // Generate login tests
  for (const form of analysis.forms) {
    if (form.isLoginForm) {
      tests.push({
        name: "Login - Valid Credentials",
        description: "Test login with valid credentials",
        steps: [
          { action: "navigate", target: analysis.url, description: "Navigate to login page" },
          { action: "fill", target: form.fields.find(f => f.inputType === "email" || f.name.includes("email"))?.selector || "", value: "test@example.com", description: "Enter email" },
          { action: "fill", target: form.fields.find(f => f.inputType === "password")?.selector || "", value: "password123", description: "Enter password" },
          { action: "click", target: form.submitButton?.selector || "Submit", description: "Submit form" },
          { action: "wait", value: "1000", description: "Wait for response" },
        ],
        assertions: ["url contains '/dashboard' OR url contains '/home'", "page does not contain 'error'"],
      });

      tests.push({
        name: "Login - Invalid Credentials",
        description: "Test login with invalid credentials shows error",
        steps: [
          { action: "navigate", target: analysis.url, description: "Navigate to login page" },
          { action: "fill", target: form.fields.find(f => f.inputType === "email")?.selector || "", value: "invalid", description: "Enter invalid email" },
          { action: "click", target: form.submitButton?.selector || "Submit", description: "Submit form" },
        ],
        assertions: ["page contains 'error' OR page contains 'invalid'"],
      });
    }

    if (form.isSearchForm) {
      tests.push({
        name: "Search - Basic Query",
        description: "Test search functionality",
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
  if (analysis.hasNavigation && analysis.links.length > 0) {
    const navLinks = analysis.links.filter(l => l.href && !l.href.startsWith("javascript:") && !l.href.includes("#"));

    if (navLinks.length > 0) {
      tests.push({
        name: "Navigation - Main Links",
        description: "Test main navigation links work",
        steps: navLinks.slice(0, 5).flatMap(link => [
          { action: "navigate" as const, target: analysis.url, description: "Start from home" },
          { action: "click" as const, target: link.selector, description: `Click ${link.text || "link"}` },
          { action: "assert" as const, target: `url contains '${new URL(link.href || analysis.url).pathname}'`, description: "Verify navigation" },
        ]),
        assertions: ["no console errors"],
      });
    }
  }

  // Generate button interaction tests
  if (analysis.buttons.length > 0) {
    const interactiveButtons = analysis.buttons.filter(b => b.text && !b.text.toLowerCase().includes("submit"));
    if (interactiveButtons.length > 0) {
      tests.push({
        name: "Buttons - Click Test",
        description: "Test button interactions",
        steps: [
          { action: "navigate", target: analysis.url, description: "Navigate to page" },
          ...interactiveButtons.slice(0, 3).map(btn => ({
            action: "click" as const,
            target: btn.selector,
            description: `Click "${btn.text}"`,
          })),
        ],
        assertions: ["no console errors", "page is interactive"],
      });
    }
  }

  // Always add basic page load test
  tests.push({
    name: "Page Load - Basic",
    description: "Verify page loads without errors",
    steps: [
      { action: "navigate", target: analysis.url, description: "Navigate to page" },
      { action: "assert", target: `title contains '${analysis.title.split(" ")[0]}'`, description: "Verify title" },
    ],
    assertions: ["page loads successfully", "no console errors"],
  });

  return tests;
}

function generateCBrowserScript(tests: GeneratedTest[]): string {
  let script = "# Generated CBrowser Test Script\n\n";

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

function generatePlaywrightCode(tests: GeneratedTest[]): string {
  let code = `import { test, expect } from '@playwright/test';\n\n`;

  for (const test of tests) {
    code += `test('${test.name}', async ({ page }) => {\n`;
    code += `  // ${test.description}\n`;

    for (const step of test.steps) {
      switch (step.action) {
        case "navigate":
          code += `  await page.goto('${step.target}');\n`;
          break;
        case "click":
          code += `  await page.locator('${step.target}').click();\n`;
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

async function generateTests(url?: string): Promise<TestGenerationResult> {
  if (url) {
    await navigate(url, {});
  }

  const analysis = await analyzePage();
  const tests = generateTestScenarios(analysis);

  return {
    url: analysis.url,
    analysis,
    tests,
    cbrowserScript: generateCBrowserScript(tests),
    playwrightCode: generatePlaywrightCode(tests),
  };
}

// ============================================================================
// Help
// ============================================================================

function showHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                           CBrowser CLI v5.0.0                                ║
║    AI-powered browser automation with natural language & parallel execution  ║
╚══════════════════════════════════════════════════════════════════════════════╝

NAVIGATION
  navigate <url>              Navigate and take screenshot
  screenshot [path]           Take screenshot of current page

INTERACTION
  click <selector>            Click element (tries CSS, text, role)
  fill <selector> <value>     Fill input field

EXTRACTION
  extract <what>              Extract data (links, images, headings, forms)

AUTHENTICATION
  auth <site>                 Authenticate using stored credentials
  creds list                  List stored credentials
  creds add <site>            Add credentials for a site
    --username <email>        Username/email
    --password <pass>         Password
    --vaultPassphrase <pass>  Vault/E2E encryption passphrase
    --pin <digits>            PIN for quick-unlock or verification

TEST VERIFICATION (Dev API)
  verify-email <email>        Auto-verify email (bypasses email confirmation)
    --url <baseUrl>           Site URL (required)
  check-verification <email>  Check if email is verified
    --url <baseUrl>           Site URL (required)
  register                    Complete registration with auto-verify
    --url <baseUrl>           Site URL (required)
    --email <email>           Email address
    --password <pass>         Password
    --name <name>             Display name (optional)
    --persona <name>          Use persona for human-like form filling
  login                       Login and create authenticated session
    --url <baseUrl>           Site URL (required)
    --email <email>           Email address (required)
    --password <pass>         Password (required)
    --save <name>             Save session for reuse (optional)
  session-info                Check current authentication status
    --url <baseUrl>           Site URL (required)

AUTONOMOUS JOURNEYS
  journey <persona>           Run autonomous exploration
    --start <url>             Starting URL (required)
    --goal <goal>             What to accomplish
    --record-video            Record journey as video

PERSONAS & HELPERS
  persona list                List available personas
  helpers                     List learned site helpers

SESSION MANAGEMENT
  session save <name>         Save browser session (cookies, storage, URL)
    --url <url>               Navigate to URL before saving (required if no active page)
  session load <name>         Load a saved session and navigate to it
  session list                List all saved sessions
  session delete <name>       Delete a saved session

COOKIE MANAGEMENT (v2.4.0)
  cookie list                 List all cookies for current page
    --url <url>               Navigate to URL first
  cookie set <name> <value>   Set a cookie
    --domain <domain>         Cookie domain
    --path <path>             Cookie path (default: /)
  cookie delete <name>        Delete a cookie
  cookie clear                Clear all cookies

DEVICE EMULATION (v2.4.0)
  device list                 List available device presets
  device set <name>           Set device emulation for session
    Examples: iphone-15, pixel-8, ipad-pro-12, desktop-1080p

GEOLOCATION (v2.4.0)
  geo list                    List available location presets
  geo set <location>          Set geolocation (preset name or lat,lon)
    Examples: new-york, london, tokyo, 37.7749,-122.4194

PERFORMANCE (v2.4.0)
  perf [url]                  Collect Core Web Vitals metrics
  perf audit [url]            Run performance audit against budget
    --budget-lcp <ms>         LCP budget (default: 2500)
    --budget-fcp <ms>         FCP budget (default: 1800)
    --budget-cls <score>      CLS budget (default: 0.1)

NETWORK / HAR (v2.4.0)
  har start                   Start recording HAR
  har stop [output]           Stop and save HAR file
  network list                List captured network requests
  network clear               Clear network request history

VISUAL REGRESSION (v2.5.0)
  visual save <name>          Save baseline screenshot
    --url <url>               Navigate to URL first
  visual compare <name>       Compare current page to baseline
    --threshold <0.1>         Diff threshold (default: 10%)
  visual list                 List all saved baselines
  visual delete <name>        Delete a baseline

ACCESSIBILITY (v2.5.0)
  a11y [url]                  Run accessibility audit (WCAG checks)
  accessibility [url]         Alias for a11y

TEST EXPORT (v2.5.0)
  export junit <file>         Export test results as JUnit XML
  export tap <file>           Export test results as TAP format

TEST RECORDING (v2.5.0)
  record start                Start recording interactions
    --url <url>               Start URL
  record stop <name>          Stop and save recording
  record list                 List all recordings
  record replay <name>        Replay a recording

WEBHOOKS (v2.5.0)
  webhook add <name> <url>    Add webhook endpoint
    --format <type>           slack, discord, or generic (default)
  webhook list                List configured webhooks
  webhook delete <name>       Remove a webhook
  webhook test                Send test notification

PARALLEL EXECUTION (v2.5.0)
  parallel devices <url>      Run URL across multiple device presets
    --devices <list>          Comma-separated device names (default: all)
    --concurrency <n>         Max parallel browsers (default: 3)
  parallel urls <url1> ...    Run same task across multiple URLs
    --concurrency <n>         Max parallel browsers (default: 3)
  parallel perf <url1> ...    Performance audit multiple URLs in parallel
    --concurrency <n>         Max parallel browsers (default: 3)

NATURAL LANGUAGE (v3.0.0)
  run "<command>"             Execute natural language command
    Examples:
      bun run CBrowser.ts run "go to https://example.com"
      bun run CBrowser.ts run "click the login button"
      bun run CBrowser.ts run "type 'hello' in the search box"
  script <file>               Execute script file with NL commands

VISUAL AI (v4.0.0)
  ai find "<intent>"          Find element by semantic intent
    --url <url>               Navigate to URL first
  ai click "<intent>"         Click element found by AI intent
    --url <url>               Navigate to URL first
    Examples:
      bun run CBrowser.ts ai find "login button" --url "https://example.com"
      bun run CBrowser.ts ai click "add to cart"
      bun run CBrowser.ts ai find "cheapest product"

BUG HUNTER (v4.0.0)
  hunt <url>                  Autonomously find bugs on site
    --max-pages <n>           Max pages to crawl (default: 10)
    --timeout <ms>            Max time in ms (default: 60000)
    Examples:
      bun run CBrowser.ts hunt "https://example.com" --max-pages 5

CROSS-BROWSER DIFF (v4.0.0)
  diff <url>                  Compare page across browsers
    --browsers <list>         Browsers to test: chromium,firefox,webkit
    Examples:
      bun run CBrowser.ts diff "https://example.com"
      bun run CBrowser.ts diff "https://example.com" --browsers chromium,firefox

CHAOS ENGINEERING (v4.0.0)
  chaos <url>                 Test resilience under failure conditions
    --latency <ms>            Add network latency
    --offline                 Test offline behavior
    --block <pattern>         Block URLs matching pattern
    --fail-api <pattern>      Return 500 for matching API calls
    Examples:
      bun run CBrowser.ts chaos "https://example.com" --latency 2000
      bun run CBrowser.ts chaos "https://example.com" --offline
      bun run CBrowser.ts chaos "https://example.com" --fail-api "/api/"

SMART AUTOMATION (v5.0.0)
  smart-click <selector>      Click with auto-retry and self-healing
    --max-retries <n>         Maximum retry attempts (default: 3)
    --url <url>               Navigate first, then click
    Examples:
      bun run CBrowser.ts smart-click "Submit"
      bun run CBrowser.ts smart-click "Add to Cart" --url "https://shop.example.com"

  assert <assertion>          Natural language assertions
    --url <url>               Navigate first, then assert
    Supported patterns:
      title contains 'text'   Check page title
      title is 'text'         Exact title match
      url contains 'path'     Check URL contains text
      page contains 'text'    Check page has text
      'element' exists        Check element is present
      N items/buttons/links   Count elements
    Examples:
      bun run CBrowser.ts assert "title contains 'Home'"
      bun run CBrowser.ts assert "page contains 'Welcome'"
      bun run CBrowser.ts assert "3 buttons" --url "https://example.com"

  analyze <url>               Analyze page structure
    Examples:
      bun run CBrowser.ts analyze "https://example.com"

  generate-tests <url>        Generate test scenarios from page
    --format <format>         Output format: cbrowser, playwright, json (default: all)
    --output <path>           Save to file
    Examples:
      bun run CBrowser.ts generate-tests "https://example.com"
      bun run CBrowser.ts generate-tests "https://example.com" --format playwright

SELF-HEALING SELECTORS (v5.0.0)
  heal-stats                  Show selector cache statistics
  heal-clear                  Clear the selector cache
    Examples:
      bun run CBrowser.ts heal-stats

STORAGE & CLEANUP
  storage                     Show storage usage statistics
  stats                       Alias for storage
  cleanup                     Clean up old files in .memory directory
    --dry-run                 Preview what would be deleted (no actual deletion)
    --older-than <days>       Delete files older than N days (default: 7)
    --keep-screenshots <n>    Keep at least N screenshots (default: 10)
    --keep-journeys <n>       Keep at least N journeys (default: 5)
    --keep-sessions <n>       Keep at least N sessions (default: 3)
    --verbose                 Show detailed deletion info
  reset                       Reset browser state (clear cookies, storage)
                              Use when you need a fresh browser session

OPTIONS
  --device <name>             Device preset: iphone-15, pixel-8, ipad-pro-12, etc.
  --geo <location>            Location preset or lat,lon coordinates
  --locale <locale>           Browser locale (e.g., en-US, fr-FR)
  --timezone <tz>             Timezone (e.g., America/New_York)
  --record-video              Enable video recording
  --force                     Bypass red zone safety checks

SMART FEATURES
  • PERSISTENT BROWSER STATE - cookies, localStorage survive between CLI calls
  • Learns modal dismiss patterns per-site
  • Remembers authentication flows
  • Auto-handles age verification, cookie banners
  • Stores credentials securely for reuse
  • Device emulation with 9 presets
  • Geolocation spoofing with 10 city presets
  • Core Web Vitals performance audits

EXAMPLES
  bun run CBrowser.ts navigate "https://example.com"
  bun run CBrowser.ts navigate "https://example.com" --device iphone-15
  bun run CBrowser.ts navigate "https://example.com" --geo san-francisco
  bun run CBrowser.ts perf audit "https://example.com" --budget-lcp 2000
  bun run CBrowser.ts cookie list --url "https://example.com"
  bun run CBrowser.ts journey first-timer --start "https://example.com" --record-video
  `);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  // Parse options
  const options: Record<string, string> = {};
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      options[key] = args[i + 1] || "true";
      i++;
    }
  }

  // Get positional arguments
  const positionalArgs: string[] = [];
  for (let i = 1; i < args.length; i++) {
    if (!args[i].startsWith("--") && !args[i - 1]?.startsWith("--")) {
      positionalArgs.push(args[i]);
    }
  }

  if (!command || command === "help" || command === "--help" || command === "-h") {
    showHelp();
    return;
  }

  try {
    switch (command) {
      case "navigate":
        const navUrl = positionalArgs[0] || options.url;
        if (!navUrl) {
          console.error("URL required");
          process.exit(1);
        }
        await navigate(navUrl, options);
        break;

      case "click":
        if (!positionalArgs[0]) {
          console.error("Selector required");
          process.exit(1);
        }
        // Navigate first if --url provided
        if (options.url) {
          await navigate(options.url, {});
        }
        await click(positionalArgs[0], options);
        break;

      case "fill":
        if (!positionalArgs[0] || !positionalArgs[1]) {
          console.error("Selector and value required");
          process.exit(1);
        }
        // Navigate first if --url provided
        if (options.url) {
          await navigate(options.url, {});
        }
        await fill(positionalArgs[0], positionalArgs[1], options);
        break;

      case "extract":
        if (!positionalArgs[0]) {
          console.error("Extraction target required");
          process.exit(1);
        }
        // Navigate first if --url provided
        if (options.url) {
          await navigate(options.url, {});
        }
        await extract(positionalArgs[0], options);
        break;

      case "screenshot":
        await takeScreenshot(positionalArgs[0]);
        break;

      case "journey":
        if (!positionalArgs[0]) {
          console.error("Persona required");
          process.exit(1);
        }
        await runJourney(positionalArgs[0], options);
        break;

      case "persona":
        if (positionalArgs[0] === "list" || !positionalArgs[0]) {
          listPersonas();
        } else {
          console.log("Usage: persona list");
        }
        break;

      case "auth":
        if (!positionalArgs[0]) {
          console.error("Site required (e.g., 'auth example.com')");
          process.exit(1);
        }
        await authenticate(positionalArgs[0], options);
        break;

      case "verify-email":
        // Auto-verify email for testing
        // Usage: verify-email user@example.com --url https://dev2.blackbook.reviews
        if (!positionalArgs[0]) {
          console.error("Email required: verify-email <email> --url <baseUrl>");
          process.exit(1);
        }
        if (!options.url) {
          console.error("Base URL required: verify-email <email> --url <baseUrl>");
          process.exit(1);
        }
        await autoVerifyEmail(positionalArgs[0], options.url);
        break;

      case "check-verification":
        // Check verification status
        // Usage: check-verification user@example.com --url https://dev2.blackbook.reviews
        if (!positionalArgs[0]) {
          console.error("Email required: check-verification <email> --url <baseUrl>");
          process.exit(1);
        }
        if (!options.url) {
          console.error("Base URL required: check-verification <email> --url <baseUrl>");
          process.exit(1);
        }
        await checkVerificationStatus(positionalArgs[0], options.url);
        break;

      case "register":
        // Complete registration with auto-verification
        // Usage: register --url https://... --email user@... --password pass123 [--name "Name"]
        if (!options.url || !options.email || !options.password) {
          console.error("Required: register --url <baseUrl> --email <email> --password <pass> [--name <name>]");
          process.exit(1);
        }
        const persona = options.persona ? (BUILTIN_PERSONAS[options.persona] || loadCustomPersona(options.persona)) : undefined;
        await completeRegistrationWithVerification(options.url, {
          email: options.email,
          password: options.password,
          name: options.name,
        }, persona);
        break;

      case "login":
        // Login a test user and apply session to browser
        // Usage: login --url https://... --email user@... --password pass123 [--save session-name]
        if (!options.url || !options.email || !options.password) {
          console.error("Required: login --url <baseUrl> --email <email> --password <pass> [--save <sessionName>]");
          process.exit(1);
        }
        await loginAndApplySession(options.email, options.password, options.url, options.save);
        break;

      case "session-info":
        // Get current session info from browser
        // Usage: session-info --url https://...
        if (!options.url) {
          console.error("Required: session-info --url <baseUrl>");
          process.exit(1);
        }
        const sessInfo = await getSessionInfo(options.url);
        if (sessInfo.authenticated) {
          console.log(`✅ Authenticated`);
          console.log(`   🆔 User ID: ${sessInfo.userId}`);
          console.log(`   🔑 Session: ${sessInfo.sessionId}`);
          console.log(`   👤 Roles: ${sessInfo.roles?.join(", ") || "none"}`);
        } else {
          console.log(`❌ Not authenticated (no active session)`);
        }
        break;

      case "cleanup":
        // Clean up old files to keep footprint minimal
        // Usage: cleanup [--dry-run] [--older-than 7] [--keep-journeys 50] [--verbose]
        {
          const cleanupOpts: CleanupOptions = {
            dryRun: options["dry-run"] === "true" || options.dryRun === "true",
            olderThan: options["older-than"] ? parseInt(options["older-than"], 10) : 7,
            keepJourneys: options["keep-journeys"] ? parseInt(options["keep-journeys"], 10) : 50,
            keepScreenshots: options["keep-screenshots"] ? parseInt(options["keep-screenshots"], 10) : 100,
            keepSessions: options["keep-sessions"] ? parseInt(options["keep-sessions"], 10) : 20,
            verbose: options.verbose === "true",
          };
          cleanupMemory(cleanupOpts);
        }
        break;

      case "storage":
      case "stats":
        // Show storage usage statistics
        // Usage: storage
        showStorageStats();
        break;

      case "reset":
        // Reset browser state for fresh start
        await resetBrowser();
        break;

      case "creds":
        if (positionalArgs[0] === "list" || !positionalArgs[0]) {
          listCredentials();
        } else if (positionalArgs[0] === "add" && positionalArgs[1]) {
          if (options.username && options.password) {
            saveCredential(
              positionalArgs[1],
              options.username,
              options.password,
              options.vaultPassphrase,
              options.pin
            );
          } else {
            await addCredential(positionalArgs[1]);
          }
        } else {
          console.log("Usage: creds list | creds add <site> --username <u> --password <p> [--vaultPassphrase <p>] [--pin <n>]");
        }
        break;

      case "helpers":
        listHelpers();
        break;

      case "session":
        const sessionCmd = positionalArgs[0];
        const sessionName = positionalArgs[1];

        switch (sessionCmd) {
          case "save":
            if (!sessionName) {
              console.error("Session name required: session save <name>");
              process.exit(1);
            }
            await saveSession(sessionName, options.url);
            break;

          case "load":
            if (!sessionName) {
              console.error("Session name required: session load <name>");
              process.exit(1);
            }
            await loadSession(sessionName);
            break;

          case "list":
            listSessions();
            break;

          case "delete":
            if (!sessionName) {
              console.error("Session name required: session delete <name>");
              process.exit(1);
            }
            deleteSession(sessionName);
            break;

          default:
            console.log("Usage:");
            console.log("  session save <name>     Save current session");
            console.log("  session load <name>     Load saved session");
            console.log("  session list            List all saved sessions");
            console.log("  session delete <name>   Delete saved session");
        }
        break;

      // =========================================================================
      // TIER 1 FEATURES (v2.4.0)
      // =========================================================================

      case "cookie":
        const cookieCmd = positionalArgs[0];
        switch (cookieCmd) {
          case "list":
            if (options.url) {
              await navigate(options.url, {});
            }
            await listCookies();
            break;
          case "set":
            if (!positionalArgs[1] || !positionalArgs[2]) {
              console.error("Usage: cookie set <name> <value> [--domain <domain>]");
              process.exit(1);
            }
            if (options.url) {
              await navigate(options.url, {});
            }
            await setCookie(positionalArgs[1], positionalArgs[2], options.domain || "localhost", options.path || "/");
            break;
          case "delete":
            if (!positionalArgs[1]) {
              console.error("Usage: cookie delete <name>");
              process.exit(1);
            }
            await deleteCookie(positionalArgs[1], options.domain);
            break;
          case "clear":
            await clearCookies();
            break;
          default:
            console.log("Usage: cookie [list|set|delete|clear]");
        }
        break;

      case "device":
        const deviceCmd = positionalArgs[0];
        switch (deviceCmd) {
          case "list":
            console.log("\n📱 Available Device Presets:\n");
            for (const [name, device] of Object.entries(DEVICE_PRESETS)) {
              console.log(`  ${name}`);
              console.log(`    ${device.name}`);
              console.log(`    ${device.viewport.width}x${device.viewport.height} @${device.deviceScaleFactor}x`);
              console.log(`    Mobile: ${device.isMobile} | Touch: ${device.hasTouch}`);
              console.log("");
            }
            break;
          case "set":
            if (!positionalArgs[1]) {
              console.error("Usage: device set <name>");
              process.exit(1);
            }
            if (!DEVICE_PRESETS[positionalArgs[1]]) {
              console.error(`Unknown device: ${positionalArgs[1]}`);
              console.error("Run 'device list' to see available devices");
              process.exit(1);
            }
            console.log(`✓ Device set: ${positionalArgs[1]}`);
            console.log("  Note: Use --device flag when launching browser");
            break;
          default:
            console.log("Usage: device [list|set]");
        }
        break;

      case "geo":
        const geoCmd = positionalArgs[0];
        switch (geoCmd) {
          case "list":
            console.log("\n🌍 Available Location Presets:\n");
            for (const [name, loc] of Object.entries(LOCATION_PRESETS)) {
              console.log(`  ${name}`);
              console.log(`    Lat: ${loc.latitude}, Lon: ${loc.longitude}`);
              console.log("");
            }
            break;
          case "set":
            if (!positionalArgs[1]) {
              console.error("Usage: geo set <location>");
              process.exit(1);
            }
            const geo = parseGeoLocation(positionalArgs[1]);
            if (!geo) {
              console.error(`Invalid location: ${positionalArgs[1]}`);
              process.exit(1);
            }
            await setGeolocation(geo);
            console.log(`✓ Geolocation set: ${geo.latitude}, ${geo.longitude}`);
            break;
          default:
            console.log("Usage: geo [list|set]");
        }
        break;

      case "perf":
        const perfCmd = positionalArgs[0];
        if (perfCmd === "audit") {
          const perfUrl = positionalArgs[1] || options.url;
          if (perfUrl) {
            await navigate(perfUrl, options);
          }
          const budget: PerformanceBudget = {
            lcp: options["budget-lcp"] ? parseInt(options["budget-lcp"], 10) : 2500,
            fcp: options["budget-fcp"] ? parseInt(options["budget-fcp"], 10) : 1800,
            cls: options["budget-cls"] ? parseFloat(options["budget-cls"]) : 0.1,
          };
          await auditPerformance(budget);
        } else {
          // Just collect metrics
          const perfUrl = positionalArgs[0] || options.url;
          if (perfUrl) {
            await navigate(perfUrl, options);
          }
          await collectPerformanceMetrics();
        }
        break;

      case "har":
        const harCmd = positionalArgs[0];
        switch (harCmd) {
          case "start":
            startHarRecording();
            console.log("✓ HAR recording started");
            console.log("  Navigate and interact, then run 'har stop'");
            break;
          case "stop":
            const harPath = positionalArgs[1];
            await exportHar(harPath);
            break;
          default:
            console.log("Usage: har [start|stop]");
        }
        break;

      case "network":
        const netCmd = positionalArgs[0];
        switch (netCmd) {
          case "list":
            listNetworkRequests();
            break;
          case "clear":
            clearNetworkHistory();
            console.log("✓ Network history cleared");
            break;
          default:
            console.log("Usage: network [list|clear]");
        }
        break;

      // =========================================================================
      // TIER 2 FEATURES (v2.5.0)
      // =========================================================================

      case "visual":
        const visualCmd = positionalArgs[0];
        switch (visualCmd) {
          case "save":
            if (!positionalArgs[1]) {
              console.error("Usage: visual save <name> [--url <url>]");
              process.exit(1);
            }
            if (options.url) {
              await navigate(options.url, {});
            }
            await saveBaseline(positionalArgs[1], options.url);
            break;
          case "compare":
            if (!positionalArgs[1]) {
              console.error("Usage: visual compare <name> [--threshold <0.1>]");
              process.exit(1);
            }
            if (options.url) {
              await navigate(options.url, {});
            }
            const threshold = options.threshold ? parseFloat(options.threshold) : 0.1;
            await compareBaseline(positionalArgs[1], threshold);
            break;
          case "list":
            listBaselines();
            break;
          case "delete":
            if (!positionalArgs[1]) {
              console.error("Usage: visual delete <name>");
              process.exit(1);
            }
            deleteBaseline(positionalArgs[1]);
            break;
          default:
            console.log("Usage: visual [save|compare|list|delete]");
            console.log("  visual save <name>     Save baseline screenshot");
            console.log("  visual compare <name>  Compare current to baseline");
            console.log("  visual list            List all baselines");
            console.log("  visual delete <name>   Delete a baseline");
        }
        break;

      case "a11y":
      case "accessibility":
        if (options.url) {
          await navigate(options.url, {});
        } else if (positionalArgs[0] && positionalArgs[0].startsWith("http")) {
          await navigate(positionalArgs[0], {});
        }
        await runAccessibilityAudit();
        break;

      case "export":
        const exportCmd = positionalArgs[0];
        console.log("Usage:");
        console.log("  export junit <results-file> [--output <path>]");
        console.log("  export tap <results-file> [--output <path>]");
        console.log("");
        console.log("Note: Run tests first to generate results to export");
        break;

      case "record":
        const recordCmd = positionalArgs[0];
        switch (recordCmd) {
          case "start":
            await startRecording(options.url);
            break;
          case "stop":
            if (!positionalArgs[1]) {
              console.error("Usage: record stop <name>");
              process.exit(1);
            }
            await stopRecording(positionalArgs[1]);
            break;
          case "list":
            listRecordings();
            break;
          case "replay":
            if (!positionalArgs[1]) {
              console.error("Usage: record replay <name>");
              process.exit(1);
            }
            await replayRecording(positionalArgs[1]);
            break;
          default:
            console.log("Usage: record [start|stop|list|replay]");
            console.log("  record start [--url <url>]  Start recording");
            console.log("  record stop <name>          Stop and save recording");
            console.log("  record list                 List all recordings");
            console.log("  record replay <name>        Replay a recording");
        }
        break;

      case "webhook":
        const webhookCmd = positionalArgs[0];
        switch (webhookCmd) {
          case "add":
            if (!positionalArgs[1] || !positionalArgs[2]) {
              console.error("Usage: webhook add <name> <url> [--format slack|discord|generic]");
              process.exit(1);
            }
            const whFormat = (options.format || "generic") as "slack" | "discord" | "generic";
            addWebhook(positionalArgs[1], positionalArgs[2], whFormat);
            break;
          case "list":
            listWebhooks();
            break;
          case "delete":
            if (!positionalArgs[1]) {
              console.error("Usage: webhook delete <name>");
              process.exit(1);
            }
            deleteWebhook(positionalArgs[1]);
            break;
          case "test":
            await sendWebhookNotification("test.pass", {
              name: "Test Notification",
              passed: true,
              url: "https://example.com",
            });
            break;
          default:
            console.log("Usage: webhook [add|list|delete|test]");
            console.log("  webhook add <name> <url>  Add webhook endpoint");
            console.log("  webhook list              List configured webhooks");
            console.log("  webhook delete <name>     Remove a webhook");
            console.log("  webhook test              Send test notification");
        }
        break;

      // =========================================================================
      // Parallel Execution
      // =========================================================================

      case "parallel": {
        const subCommand = positionalArgs[0];

        switch (subCommand) {
          case "devices": {
            const url = positionalArgs[1];
            if (!url) {
              console.log("Usage: parallel devices <url> [--devices <list>] [--concurrency <n>]");
              break;
            }

            const deviceList = options.devices
              ? options.devices.split(",")
              : Object.keys(DEVICE_PRESETS);
            const concurrency = parseInt(options.concurrency || "3");

            console.log(`\n🚀 Running parallel device tests...`);
            console.log(`   URL: ${url}`);
            console.log(`   Devices: ${deviceList.length}`);
            console.log(`   Concurrency: ${concurrency}\n`);

            const results = await runParallelDevices(url, deviceList, concurrency);

            console.log("📊 Results:\n");
            for (const r of results) {
              if (r.error) {
                console.log(`  ✗ ${r.device}: ${r.error} (${r.duration}ms)`);
              } else {
                console.log(`  ✓ ${r.device}: ${r.result?.title} - ${r.result?.loadTime}ms (${r.duration}ms total)`);
              }
            }

            const passed = results.filter(r => !r.error).length;
            console.log(`\n  Summary: ${passed}/${results.length} passed`);
            break;
          }

          case "urls": {
            const urls = positionalArgs.slice(1);
            if (urls.length === 0) {
              console.log("Usage: parallel urls <url1> <url2> ... [--concurrency <n>]");
              break;
            }

            const concurrency = parseInt(options.concurrency || "3");

            console.log(`\n🚀 Running parallel URL tests...`);
            console.log(`   URLs: ${urls.length}`);
            console.log(`   Concurrency: ${concurrency}\n`);

            const results = await runParallelUrls(urls, concurrency, "navigate");

            console.log("📊 Results:\n");
            for (const r of results) {
              if (r.error) {
                console.log(`  ✗ ${r.url}: ${r.error}`);
              } else {
                console.log(`  ✓ ${r.url}: ${r.result?.title} (${r.result?.loadTime}ms)`);
              }
            }
            break;
          }

          case "perf": {
            const urls = positionalArgs.slice(1);
            if (urls.length === 0) {
              console.log("Usage: parallel perf <url1> <url2> ... [--concurrency <n>]");
              break;
            }

            const concurrency = parseInt(options.concurrency || "3");

            console.log(`\n🚀 Running parallel performance audits...`);
            console.log(`   URLs: ${urls.length}`);
            console.log(`   Concurrency: ${concurrency}\n`);

            const results = await runParallelUrls(urls, concurrency, "perf");

            console.log("📊 Performance Results:\n");
            for (const r of results) {
              if (r.error) {
                console.log(`  ✗ ${r.url}: ${r.error}`);
              } else {
                const m = r.result;
                console.log(`  ✓ ${r.url}`);
                if (m?.fcp) console.log(`      FCP: ${m.fcp.toFixed(0)}ms`);
                if (m?.ttfb) console.log(`      TTFB: ${m.ttfb.toFixed(0)}ms`);
                if (m?.load) console.log(`      Load: ${m.load.toFixed(0)}ms`);
              }
            }
            break;
          }

          default:
            console.log("Usage: parallel [devices|urls|perf] ...");
        }
        break;
      }

      // =========================================================================
      // Natural Language
      // =========================================================================

      case "run": {
        const nlCommand = positionalArgs.join(" ");
        if (!nlCommand) {
          console.log("Usage: run \"<natural language command>\"");
          console.log("Examples:");
          console.log("  run \"go to https://example.com\"");
          console.log("  run \"click the login button\"");
          console.log("  run \"type 'hello' in the search box\"");
          break;
        }

        console.log(`\n🗣️  Executing: "${nlCommand}"\n`);

        const result = await executeNaturalLanguage(nlCommand, options);

        if (result.success) {
          console.log(`✓ Action: ${result.action}`);
          if (result.result && typeof result.result === "object") {
            const r = result.result as Record<string, unknown>;
            if (r.url) console.log(`  URL: ${r.url}`);
            if (r.title) console.log(`  Title: ${r.title}`);
            if (r.screenshot) console.log(`  Screenshot: ${r.screenshot}`);
          }
        } else {
          console.error(`✗ ${result.error}`);
        }
        break;
      }

      case "script": {
        const scriptFile = positionalArgs[0];
        if (!scriptFile) {
          console.log("Usage: script <file>");
          break;
        }

        if (!existsSync(scriptFile)) {
          console.error(`Script file not found: ${scriptFile}`);
          break;
        }

        const content = readFileSync(scriptFile, "utf-8");
        const commands = content.split("\n").filter(line => line.trim() && !line.trim().startsWith("#"));

        console.log(`\n📜 Executing script: ${scriptFile}`);
        console.log(`   Commands: ${commands.length}\n`);

        let passed = 0;
        for (const cmd of commands) {
          const result = await executeNaturalLanguage(cmd, options);
          if (result.success) {
            console.log(`✓ ${cmd}`);
            passed++;
          } else {
            console.log(`✗ ${cmd}`);
            console.log(`  Error: ${result.error}`);
            break;
          }
        }

        console.log(`\n  Summary: ${passed}/${commands.length} commands succeeded`);
        break;
      }

      // =========================================================================
      // TIER 4 FEATURES (v4.0.0)
      // =========================================================================

      case "ai": {
        const aiCmd = positionalArgs[0];
        const intent = positionalArgs.slice(1).join(" ");

        if (!aiCmd || !intent) {
          console.log("Usage: ai [find|click] \"<intent>\"");
          console.log("Examples:");
          console.log("  ai find \"login button\" --url https://example.com");
          console.log("  ai click \"add to cart\"");
          break;
        }

        if (options.url) {
          await navigate(options.url, {});
        }

        if (aiCmd === "find") {
          console.log(`\n🧠 Finding element: "${intent}"\n`);
          const element = await findElementByIntent(intent);
          if (element) {
            console.log(`✅ Found element:`);
            console.log(`   Selector: ${element.selector}`);
            console.log(`   Confidence: ${(element.confidence * 100).toFixed(0)}%`);
            console.log(`   Description: ${element.description}`);
          } else {
            console.log(`❌ No element found matching: "${intent}"`);
          }
        } else if (aiCmd === "click") {
          console.log(`\n🧠 Clicking element: "${intent}"\n`);
          const result = await clickByIntent(intent);
          if (result.success) {
            console.log(`✅ Clicked: ${result.selector}`);
            const ssPath = screenshotPath("ai-click");
            const page = await getPage();
            await page.screenshot({ path: ssPath });
            console.log(`📸 Screenshot: ${ssPath}`);
          } else {
            console.log(`❌ ${result.error}`);
          }
        } else {
          console.log("Usage: ai [find|click] \"<intent>\"");
        }
        break;
      }

      case "hunt": {
        const huntUrl = positionalArgs[0];
        if (!huntUrl) {
          console.log("Usage: hunt <url> [--max-pages N] [--timeout N]");
          break;
        }

        console.log(`\n🐛 Bug Hunter starting...`);
        console.log(`   URL: ${huntUrl}`);
        console.log(`   Max pages: ${options["max-pages"] || 10}`);
        console.log(`   Timeout: ${options.timeout || 60000}ms\n`);

        const huntOpts: HuntOptions = {
          maxPages: options["max-pages"] ? parseInt(options["max-pages"], 10) : 10,
          timeout: options.timeout ? parseInt(options.timeout, 10) : 60000,
        };

        const huntResult = await huntBugs(huntUrl, huntOpts);

        console.log(`\n📊 Bug Hunt Results:`);
        console.log(`   Pages visited: ${huntResult.pagesVisited}`);
        console.log(`   Duration: ${(huntResult.duration / 1000).toFixed(1)}s`);
        console.log(`   Bugs found: ${huntResult.bugs.length}\n`);

        if (huntResult.bugs.length > 0) {
          for (const bug of huntResult.bugs) {
            const icon = bug.severity === "critical" ? "🔴" :
                         bug.severity === "high" ? "🟠" :
                         bug.severity === "medium" ? "🟡" : "🟢";
            console.log(`${icon} [${bug.type}] ${bug.description}`);
            console.log(`   URL: ${bug.url}`);
          }
        } else {
          console.log(`✅ No bugs found!`);
        }
        break;
      }

      case "diff": {
        const diffUrl = positionalArgs[0];
        if (!diffUrl) {
          console.log("Usage: diff <url> [--browsers chromium,firefox,webkit]");
          break;
        }

        const browserList = options.browsers
          ? options.browsers.split(",") as BrowserName[]
          : ["chromium", "firefox", "webkit"] as BrowserName[];

        console.log(`\n🔄 Cross-Browser Diff`);
        console.log(`   URL: ${diffUrl}`);
        console.log(`   Browsers: ${browserList.join(", ")}\n`);

        const diffResult = await crossBrowserDiff(diffUrl, browserList);

        console.log(`\n📊 Results:`);
        console.log(`   Screenshots saved:`);
        for (const [browser, path] of Object.entries(diffResult.screenshots)) {
          console.log(`     ${browser}: ${path}`);
        }

        console.log(`\n   Timing:`);
        for (const [browser, time] of Object.entries(diffResult.timing)) {
          console.log(`     ${browser}: ${time}ms`);
        }

        if (diffResult.differences.length > 0) {
          console.log(`\n   Differences found:`);
          for (const diff of diffResult.differences) {
            console.log(`     [${diff.type}] ${diff.description}`);
          }
        } else {
          console.log(`\n   ✅ No significant differences detected`);
        }
        break;
      }

      case "chaos": {
        const chaosUrl = positionalArgs[0];
        if (!chaosUrl) {
          console.log("Usage: chaos <url> [--latency N] [--offline] [--block pattern] [--fail-api pattern]");
          break;
        }

        const chaosConfig: ChaosConfig = {};
        if (options.latency) chaosConfig.networkLatency = parseInt(options.latency, 10);
        if (options.offline === "true") chaosConfig.offline = true;
        if (options.block) chaosConfig.blockUrls = [options.block];
        if (options["fail-api"]) chaosConfig.failApiCalls = [options["fail-api"]];

        console.log(`\n🔥 Chaos Engineering Test`);
        console.log(`   URL: ${chaosUrl}`);
        console.log(`   Config: ${JSON.stringify(chaosConfig)}\n`);

        const chaosResult = await runChaosTest(chaosUrl, chaosConfig);

        console.log(`\n📊 Chaos Test Results:`);
        console.log(`   Duration: ${(chaosResult.duration / 1000).toFixed(1)}s`);
        console.log(`   Survived: ${chaosResult.survived ? "✅ YES" : "❌ NO"}`);

        if (chaosResult.errors.length > 0) {
          console.log(`\n   Errors (${chaosResult.errors.length}):`);
          for (const err of chaosResult.errors.slice(0, 10)) {
            console.log(`     - ${err.substring(0, 100)}`);
          }
        }

        console.log(`\n   Screenshots:`);
        for (const ss of chaosResult.screenshots) {
          console.log(`     ${ss}`);
        }
        break;
      }

      // =========================================================================
      // TIER 5 FEATURES (v5.0.0)
      // =========================================================================

      case "smart-click": {
        const smartSelector = positionalArgs[0];
        if (!smartSelector) {
          console.log("Usage: smart-click <selector> [--max-retries N] [--url <url>]");
          break;
        }

        // Navigate first if --url provided
        if (options.url) {
          await navigate(options.url, {});
        }

        console.log(`\n🔍 Smart Click: "${smartSelector}"`);
        const smartResult = await smartClick(smartSelector, {
          maxRetries: options["max-retries"] ? parseInt(options["max-retries"], 10) : 3,
        });

        console.log(`\n📊 Result:`);
        console.log(`   Success: ${smartResult.success ? "✅" : "❌"}`);
        console.log(`   Attempts: ${smartResult.attempts.length}`);
        if (smartResult.finalSelector) {
          console.log(`   Final Selector: ${smartResult.finalSelector}`);
        }
        console.log(`   Message: ${smartResult.message}`);
        if (smartResult.aiSuggestion) {
          console.log(`\n   💡 Suggestion: ${smartResult.aiSuggestion}`);
        }
        console.log(`\n   Screenshot: ${smartResult.screenshot}`);
        break;
      }

      case "assert": {
        const assertion = positionalArgs[0];
        if (!assertion) {
          console.log("Usage: assert <assertion> [--url <url>]");
          console.log("\nSupported patterns:");
          console.log("  title contains 'text'    - Check page title contains text");
          console.log("  title is 'text'          - Check page title exactly matches");
          console.log("  url contains 'path'      - Check URL contains text");
          console.log("  page contains 'text'     - Check page body has text");
          console.log("  'element' exists         - Check element is present");
          console.log("  N items/buttons/links    - Count elements");
          break;
        }

        // Navigate first if --url provided
        if (options.url) {
          await navigate(options.url, {});
        }

        console.log(`\n✅ Asserting: "${assertion}"`);
        const assertResult = await assertCondition(assertion);

        console.log(`\n📊 Result:`);
        console.log(`   Passed: ${assertResult.passed ? "✅ YES" : "❌ NO"}`);
        console.log(`   Message: ${assertResult.message}`);
        if (assertResult.actual !== undefined) {
          console.log(`   Actual: ${assertResult.actual}`);
        }
        if (assertResult.expected !== undefined) {
          console.log(`   Expected: ${assertResult.expected}`);
        }
        console.log(`\n   Screenshot: ${assertResult.screenshot}`);

        if (!assertResult.passed) {
          process.exit(1);
        }
        break;
      }

      case "analyze": {
        const analyzeUrl = positionalArgs[0];
        if (!analyzeUrl) {
          console.log("Usage: analyze <url>");
          break;
        }

        await navigate(analyzeUrl, {});
        console.log(`\n🔍 Analyzing: ${analyzeUrl}`);
        const analysis = await analyzePage();

        console.log(`\n📊 Page Analysis:`);
        console.log(`   Title: ${analysis.title}`);
        console.log(`   URL: ${analysis.url}`);
        console.log(`\n   Forms: ${analysis.forms.length}`);
        for (const form of analysis.forms) {
          console.log(`     - ${form.selector} (${form.fields.length} fields)`);
          if (form.isLoginForm) console.log(`       🔐 Login form detected`);
          if (form.isSearchForm) console.log(`       🔍 Search form detected`);
        }
        console.log(`\n   Buttons: ${analysis.buttons.length}`);
        console.log(`   Links: ${analysis.links.length}`);
        console.log(`   Inputs: ${analysis.inputs.length}`);
        console.log(`   Selects: ${analysis.selects.length}`);
        console.log(`\n   Has Login: ${analysis.hasLogin ? "✅" : "❌"}`);
        console.log(`   Has Search: ${analysis.hasSearch ? "✅" : "❌"}`);
        console.log(`   Has Navigation: ${analysis.hasNavigation ? "✅" : "❌"}`);
        break;
      }

      case "generate-tests": {
        const testUrl = positionalArgs[0];
        if (!testUrl) {
          console.log("Usage: generate-tests <url> [--format cbrowser|playwright|json] [--output <path>]");
          break;
        }

        console.log(`\n🧪 Generating tests for: ${testUrl}`);
        const testResult = await generateTests(testUrl);

        console.log(`\n📊 Generated ${testResult.tests.length} test scenarios:`);
        for (const test of testResult.tests) {
          console.log(`\n   📝 ${test.name}`);
          console.log(`      ${test.description}`);
          console.log(`      Steps: ${test.steps.length}`);
          console.log(`      Assertions: ${test.assertions.length}`);
        }

        const format = options.format || "all";
        const outputPath = options.output;

        if (format === "cbrowser" || format === "all") {
          console.log(`\n${"=".repeat(60)}`);
          console.log("📜 CBrowser Script:");
          console.log("=".repeat(60));
          console.log(testResult.cbrowserScript);
          if (outputPath && format === "cbrowser") {
            writeFileSync(outputPath, testResult.cbrowserScript);
            console.log(`\nSaved to: ${outputPath}`);
          }
        }

        if (format === "playwright" || format === "all") {
          console.log(`\n${"=".repeat(60)}`);
          console.log("🎭 Playwright Code:");
          console.log("=".repeat(60));
          console.log(testResult.playwrightCode);
          if (outputPath && format === "playwright") {
            writeFileSync(outputPath, testResult.playwrightCode);
            console.log(`\nSaved to: ${outputPath}`);
          }
        }

        if (format === "json") {
          const jsonOutput = JSON.stringify(testResult, null, 2);
          if (outputPath) {
            writeFileSync(outputPath, jsonOutput);
            console.log(`\nSaved to: ${outputPath}`);
          } else {
            console.log(jsonOutput);
          }
        }
        break;
      }

      case "heal-stats": {
        const stats = getSelectorCacheStats();
        console.log(`\n📊 Self-Healing Selector Cache Stats:`);
        console.log(`   Total entries: ${stats.totalEntries}`);
        console.log(`   Total successes: ${stats.totalSuccesses}`);
        console.log(`   Total failures: ${stats.totalFailures}`);
        if (stats.topDomains.length > 0) {
          console.log(`\n   Top domains:`);
          for (const { domain, count } of stats.topDomains) {
            console.log(`     ${domain}: ${count} selectors`);
          }
        }
        break;
      }

      case "heal-clear": {
        selectorCache = { version: 1, entries: {} };
        saveSelectorCache();
        console.log(`✅ Selector cache cleared`);
        break;
      }

      default:
        // If it looks like a URL, treat as navigate
        if (command.startsWith("http")) {
          await navigate(command, options);
        } else {
          console.log(`Unknown command: ${command}`);
          console.log("Use 'help' for available commands");
        }
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}

main();
