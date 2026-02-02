/**
 * CBrowser Type Definitions
 */

// ============================================================================
// Persona Types
// ============================================================================

export interface TimingParams {
  reactionTime: { min: number; max: number };
  clickDelay: { min: number; max: number };
  typeSpeed: { min: number; max: number };
  readingSpeed: number;
  scrollPauseTime: { min: number; max: number };
}

export interface ErrorParams {
  misClickRate: number;
  doubleClickAccidental: number;
  typoRate: number;
  backtrackRate: number;
}

export interface MouseParams {
  curvature: number;
  jitter: number;
  overshoot: number;
  speed: "slow" | "normal" | "fast";
}

export interface AttentionParams {
  pattern: "f-pattern" | "z-pattern" | "skim" | "thorough";
  scrollBehavior: "continuous" | "chunked" | "jump";
  focusAreas: Array<"header" | "cta" | "images" | "prices" | "text">;
  distractionRate: number;
}

export interface HumanBehaviorParams {
  timing: TimingParams;
  errors: ErrorParams;
  mouse: MouseParams;
  attention: AttentionParams;
}

export interface Persona {
  name: string;
  description: string;
  demographics: {
    age_range?: string;
    tech_level?: "beginner" | "intermediate" | "expert";
    device?: "desktop" | "mobile" | "tablet";
  };
  behaviors: Record<string, unknown>;
  humanBehavior?: HumanBehaviorParams;
  context?: {
    viewport?: [number, number];
  };
}

// ============================================================================
// Session Types
// ============================================================================

export interface SavedSession {
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
  testCredentials?: {
    email: string;
    password: string; // base64 encoded
    baseUrl: string;
  };
}

// ============================================================================
// Result Types
// ============================================================================

export interface NavigationResult {
  url: string;
  title: string;
  screenshot: string;
  errors: string[];
  warnings: string[];
  loadTime: number;
}

export interface ClickResult {
  success: boolean;
  screenshot: string;
  message: string;
}

export interface ExtractResult {
  data: unknown;
  screenshot: string;
}

export interface ConsoleEntry {
  type: "log" | "info" | "warn" | "error" | "debug" | "trace";
  text: string;
  timestamp: string;
  url?: string;
  lineNumber?: number;
}

export interface JourneyStep {
  action: string;
  target?: string;
  result: string;
  screenshot?: string;
  timestamp: string;
}

export interface JourneyResult {
  persona: string;
  goal: string;
  steps: JourneyStep[];
  success: boolean;
  frictionPoints: string[];
  totalTime: number;
  consoleLogs: ConsoleEntry[];
}

// ============================================================================
// Audit Types
// ============================================================================

export type ActionZone = "green" | "yellow" | "red" | "black";

export interface AuditEntry {
  timestamp: string;
  action: string;
  target?: string;
  zone: ActionZone;
  result: "success" | "failure" | "blocked";
  screenshot?: string;
  persona?: string;
  duration?: number;
}

// ============================================================================
// Credential Types
// ============================================================================

export interface StoredCredential {
  site: string;
  username: string;
  password: string; // encrypted
  vaultPassphrase?: string; // encrypted
  pin?: string; // encrypted
  created: string;
  lastUsed?: string;
}

// ============================================================================
// Cleanup Types
// ============================================================================

export interface CleanupOptions {
  dryRun?: boolean;
  olderThan?: number; // Days
  keepScreenshots?: number;
  keepJourneys?: number;
  keepSessions?: number;
  verbose?: boolean;
}

export interface CleanupResult {
  deleted: number;
  freedBytes: number;
  details: {
    screenshots: { deleted: number; freed: number };
    journeys: { deleted: number; freed: number };
    sessions: { deleted: number; freed: number };
    audit: { deleted: number; freed: number };
  };
}

// ============================================================================
// Browser Options
// ============================================================================

export interface BrowserOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  timeout?: number;
  userAgent?: string;
}

export interface JourneyOptions {
  persona: string;
  startUrl: string;
  goal: string;
  maxSteps?: number;
  timeout?: number;
  recordVideo?: boolean;
}

// ============================================================================
// Device Emulation Types
// ============================================================================

export interface DeviceDescriptor {
  name: string;
  userAgent: string;
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
}

export const DEVICE_PRESETS: Record<string, DeviceDescriptor> = {
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
// Geolocation Types
// ============================================================================

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export const LOCATION_PRESETS: Record<string, GeoLocation> = {
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
// Network Interception Types
// ============================================================================

export interface NetworkMock {
  /** URL pattern to match (string or regex) */
  urlPattern: string | RegExp;
  /** HTTP method to match (GET, POST, etc.) */
  method?: string;
  /** Response status code */
  status?: number;
  /** Response headers */
  headers?: Record<string, string>;
  /** Response body (string or object to be JSON-stringified) */
  body?: string | object;
  /** Delay in ms before responding */
  delay?: number;
  /** Abort the request */
  abort?: boolean;
}

export interface NetworkRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
  resourceType: string;
  timestamp: string;
}

export interface NetworkResponse {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  timing?: {
    startTime: number;
    domainLookupStart: number;
    domainLookupEnd: number;
    connectStart: number;
    connectEnd: number;
    requestStart: number;
    responseStart: number;
    responseEnd: number;
  };
}

export interface HAREntry {
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

export interface HARLog {
  version: string;
  creator: { name: string; version: string };
  entries: HAREntry[];
}

// ============================================================================
// Performance Metrics Types
// ============================================================================

export interface PerformanceMetrics {
  // Core Web Vitals
  lcp?: number; // Largest Contentful Paint (ms)
  fid?: number; // First Input Delay (ms)
  cls?: number; // Cumulative Layout Shift (score)

  // Additional metrics
  fcp?: number; // First Contentful Paint (ms)
  ttfb?: number; // Time to First Byte (ms)
  tti?: number; // Time to Interactive (ms)
  tbt?: number; // Total Blocking Time (ms)

  // Resource metrics
  domContentLoaded?: number;
  load?: number;
  resourceCount?: number;
  transferSize?: number;

  // Ratings
  lcpRating?: "good" | "needs-improvement" | "poor";
  fidRating?: "good" | "needs-improvement" | "poor";
  clsRating?: "good" | "needs-improvement" | "poor";
}

export interface PerformanceBudget {
  lcp?: number;
  fid?: number;
  cls?: number;
  fcp?: number;
  ttfb?: number;
  transferSize?: number;
  resourceCount?: number;
}

export interface PerformanceAuditResult {
  url: string;
  timestamp: string;
  metrics: PerformanceMetrics;
  budget?: PerformanceBudget;
  passed: boolean;
  violations: string[];
}

// ============================================================================
// Video Recording Types
// ============================================================================

export interface VideoRecordingOptions {
  /** Output path for the video file */
  outputPath?: string;
  /** Video size (default: viewport size) */
  size?: { width: number; height: number };
}

export interface VideoRecordingResult {
  path: string;
  duration: number;
  size: number;
}

// ============================================================================
// Config File Types
// ============================================================================

export interface CBrowserConfigFile {
  browser?: "chromium" | "firefox" | "webkit";
  headless?: boolean;
  device?: string;
  viewport?: { width: number; height: number };
  timeout?: number;
  geolocation?: GeoLocation | string;
  locale?: string;
  timezone?: string;
  colorScheme?: "light" | "dark" | "no-preference";
  recordVideo?: boolean;
  networkMocks?: NetworkMock[];
  performanceBudget?: PerformanceBudget;
}
