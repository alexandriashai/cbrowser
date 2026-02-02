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
// Tier 6: Multi-Persona Comparison (v6.0.0)
// ============================================================================

export interface PersonaJourneyResult {
  persona: string;
  description: string;
  techLevel: string;
  device: string;
  success: boolean;
  totalTime: number;
  stepCount: number;
  frictionCount: number;
  frictionPoints: string[];
  avgReactionTime: number;
  errorRate: number;
  screenshots: {
    start: string;
    end: string;
  };
}

export interface PersonaComparisonResult {
  url: string;
  goal: string;
  timestamp: string;
  duration: number;
  personas: PersonaJourneyResult[];
  summary: {
    totalPersonas: number;
    successCount: number;
    failureCount: number;
    fastestPersona: string;
    slowestPersona: string;
    mostFriction: string;
    leastFriction: string;
    avgCompletionTime: number;
    commonFrictionPoints: string[];
  };
  recommendations: string[];
}

// ============================================================================
// Tier 6: Natural Language Test Suites (v6.1.0)
// ============================================================================

export interface NLTestStep {
  /** Original natural language instruction */
  instruction: string;
  /** Parsed action type */
  action: "navigate" | "click" | "fill" | "select" | "scroll" | "wait" | "assert" | "screenshot" | "unknown";
  /** Target element or URL */
  target?: string;
  /** Value for fill/select actions */
  value?: string;
  /** Assertion type for assert actions */
  assertionType?: "contains" | "equals" | "exists" | "count" | "url" | "title";
}

export interface NLTestCase {
  /** Test case name */
  name: string;
  /** Description of what the test does */
  description?: string;
  /** Parsed test steps */
  steps: NLTestStep[];
}

export interface NLTestStepResult {
  instruction: string;
  action: NLTestStep["action"];
  passed: boolean;
  duration: number;
  error?: string;
  screenshot?: string;
  actualValue?: string;
}

export interface NLTestCaseResult {
  name: string;
  passed: boolean;
  duration: number;
  stepResults: NLTestStepResult[];
  error?: string;
}

export interface NLTestSuiteResult {
  /** Suite name */
  name: string;
  /** When the suite ran */
  timestamp: string;
  /** Total duration */
  duration: number;
  /** Individual test results */
  testResults: NLTestCaseResult[];
  /** Summary stats */
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;
  };
}

// ============================================================================
// Tier 6: AI Test Repair (v6.2.0)
// ============================================================================

/** Type of failure that was detected */
export type FailureType =
  | "selector_not_found"
  | "assertion_failed"
  | "timeout"
  | "navigation_failed"
  | "element_not_interactable"
  | "unknown";

/** A suggested repair for a failed test step */
export interface RepairSuggestion {
  /** Type of repair */
  type: "selector_update" | "assertion_update" | "add_wait" | "change_action" | "skip_step";
  /** Confidence score 0-1 */
  confidence: number;
  /** Human-readable description of the fix */
  description: string;
  /** The original instruction */
  originalInstruction: string;
  /** The suggested replacement instruction */
  suggestedInstruction: string;
  /** Reasoning for this suggestion */
  reasoning: string;
}

/** Analysis of a single test failure */
export interface FailureAnalysis {
  /** The step that failed */
  step: NLTestStep;
  /** Error message from the failure */
  error: string;
  /** Type of failure detected */
  failureType: FailureType;
  /** What element was being targeted */
  targetSelector?: string;
  /** Alternative selectors found on the page */
  alternativeSelectors?: string[];
  /** Page context at time of failure */
  pageContext?: {
    url: string;
    title: string;
    visibleText: string[];
  };
  /** Suggested repairs */
  suggestions: RepairSuggestion[];
}

/** Result of running test repair on a test case */
export interface TestRepairResult {
  /** Original test case */
  originalTest: NLTestCase;
  /** Repaired test case (if repairs were applied) */
  repairedTest?: NLTestCase;
  /** Number of steps that failed */
  failedSteps: number;
  /** Number of steps that were repaired */
  repairedSteps: number;
  /** Detailed analysis of each failure */
  failureAnalyses: FailureAnalysis[];
  /** Whether the repaired test passes */
  repairedTestPasses?: boolean;
}

/** Result of running test repair on a full suite */
export interface TestRepairSuiteResult {
  /** Suite name */
  suiteName: string;
  /** Timestamp */
  timestamp: string;
  /** Total duration */
  duration: number;
  /** Results per test */
  testResults: TestRepairResult[];
  /** Summary */
  summary: {
    totalTests: number;
    testsWithFailures: number;
    testsRepaired: number;
    totalFailedSteps: number;
    totalRepairedSteps: number;
    repairSuccessRate: number;
  };
}

// ============================================================================
// Tier 6: Flaky Test Detection (v6.3.0)
// ============================================================================

/** Result of a single test run */
export interface FlakyTestRun {
  /** Run number (1-indexed) */
  runNumber: number;
  /** Whether the test passed */
  passed: boolean;
  /** Duration in ms */
  duration: number;
  /** Error if failed */
  error?: string;
  /** Per-step results */
  stepResults: {
    instruction: string;
    passed: boolean;
    error?: string;
  }[];
}

/** Flakiness analysis for a single step */
export interface FlakyStepAnalysis {
  /** The instruction */
  instruction: string;
  /** Number of times it passed */
  passCount: number;
  /** Number of times it failed */
  failCount: number;
  /** Flakiness score (0-100) - 0 = stable, 100 = always different */
  flakinessScore: number;
  /** Whether this step is considered flaky */
  isFlaky: boolean;
  /** Errors seen across runs */
  errors: string[];
}

/** Flakiness analysis for a single test case */
export interface FlakyTestAnalysis {
  /** Test name */
  testName: string;
  /** Number of runs */
  totalRuns: number;
  /** Number of passes */
  passCount: number;
  /** Number of failures */
  failCount: number;
  /** Flakiness score (0-100) - 0 = always same result, 100 = 50/50 */
  flakinessScore: number;
  /** Whether this test is considered flaky */
  isFlaky: boolean;
  /** Classification */
  classification: "stable_pass" | "stable_fail" | "flaky" | "mostly_pass" | "mostly_fail";
  /** Individual run results */
  runs: FlakyTestRun[];
  /** Per-step flakiness analysis */
  stepAnalysis: FlakyStepAnalysis[];
  /** Average duration across runs */
  avgDuration: number;
  /** Duration variance (std dev) */
  durationVariance: number;
}

/** Result of flaky test detection on a suite */
export interface FlakyTestSuiteResult {
  /** Suite name */
  suiteName: string;
  /** Timestamp */
  timestamp: string;
  /** Total duration */
  duration: number;
  /** Number of runs per test */
  runsPerTest: number;
  /** Results per test */
  testAnalyses: FlakyTestAnalysis[];
  /** Summary */
  summary: {
    totalTests: number;
    stablePassTests: number;
    stableFailTests: number;
    flakyTests: number;
    mostFlakyTest?: string;
    mostFlakyStep?: string;
    overallFlakinessScore: number;
  };
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

// ============================================================================
// Tier 2: Visual Regression Types (v2.5.0)
// ============================================================================

export interface VisualRegressionResult {
  baseline: string;
  current: string;
  diff?: string;
  diffPercentage: number;
  passed: boolean;
  threshold: number;
  timestamp: string;
}

export interface VisualBaseline {
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

export interface AccessibilityViolation {
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

export interface AccessibilityAuditResult {
  url: string;
  timestamp: string;
  violations: AccessibilityViolation[];
  passes: number;
  incomplete: number;
  score: number;
}

// ============================================================================
// Tier 2: Test Recording Types (v2.5.0)
// ============================================================================

export interface RecordedAction {
  type: "navigate" | "click" | "fill" | "select" | "screenshot" | "wait";
  selector?: string;
  value?: string;
  url?: string;
  timestamp: number;
}

export interface RecordedTest {
  name: string;
  startUrl: string;
  actions: RecordedAction[];
  created: string;
}

// ============================================================================
// Tier 2: Test Output Types (v2.5.0)
// ============================================================================

export interface TestResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  duration: number;
  error?: string;
  screenshot?: string;
}

export interface TestSuiteResult {
  name: string;
  timestamp: string;
  duration: number;
  tests: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
}

// ============================================================================
// Tier 2: Webhook Types (v2.5.0)
// ============================================================================

export interface WebhookConfig {
  name: string;
  url: string;
  events: Array<"test.pass" | "test.fail" | "journey.complete" | "visual.fail">;
  format: "slack" | "discord" | "generic";
}

// ============================================================================
// Tier 5: Smart Retry & Assertions (v5.0.0)
// ============================================================================

export interface SmartRetryOptions {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Delay between retries in ms */
  retryDelay?: number;
  /** Use AI to analyze failures and suggest fixes */
  aiAnalysis?: boolean;
  /** Try alternative selectors on failure */
  tryAlternatives?: boolean;
}

export interface RetryAttempt {
  attempt: number;
  selector: string;
  success: boolean;
  error?: string;
  alternativeUsed?: string;
  screenshot?: string;
}

export interface SmartRetryResult {
  success: boolean;
  attempts: RetryAttempt[];
  finalSelector?: string;
  message: string;
  screenshot: string;
  aiSuggestion?: string;
}

export interface AssertionResult {
  passed: boolean;
  assertion: string;
  actual?: string;
  expected?: string;
  message: string;
  screenshot: string;
}

export interface SelectorAlternative {
  selector: string;
  confidence: number;
  reason: string;
}

export interface SelfHealingResult {
  originalSelector: string;
  workingSelector?: string;
  alternatives: SelectorAlternative[];
  healed: boolean;
}

export interface SelectorCacheEntry {
  originalSelector: string;
  workingSelector: string;
  domain: string;
  successCount: number;
  failCount: number;
  lastUsed: string;
  reason: string;
}

export interface SelectorCache {
  version: number;
  entries: Record<string, SelectorCacheEntry>;
}

export interface SelectorCacheStats {
  totalEntries: number;
  totalHeals: number;
  byDomain: Record<string, number>;
  topHealedSelectors: Array<{ original: string; working: string; heals: number }>;
}

// ============================================================================
// Tier 5: AI Test Generation (v5.0.0)
// ============================================================================

export interface PageElement {
  type: "button" | "link" | "input" | "form" | "select" | "textarea";
  selector: string;
  text?: string;
  name?: string;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  href?: string;
  inputType?: string;
  required?: boolean;
}

export interface PageAnalysis {
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

export interface FormAnalysis {
  action?: string;
  method?: string;
  fields: PageElement[];
  submitButton?: PageElement;
  purpose: "login" | "signup" | "search" | "contact" | "checkout" | "unknown";
}

export interface GeneratedTest {
  name: string;
  description: string;
  steps: TestStep[];
  assertions: string[];
}

export interface TestStep {
  action: "navigate" | "click" | "fill" | "select" | "assert" | "wait";
  target?: string;
  value?: string;
  description: string;
}

export interface TestGenerationResult {
  url: string;
  analysis: PageAnalysis;
  tests: GeneratedTest[];
  cbrowserScript: string;
  playwrightCode: string;
}

// ============================================================================
// Tier 6: Performance Regression Types (v6.4.0)
// ============================================================================

export interface PerformanceBaseline {
  /** Unique identifier for this baseline */
  id: string;
  /** URL this baseline was captured from */
  url: string;
  /** Human-readable name for this baseline */
  name: string;
  /** Timestamp when baseline was captured */
  timestamp: string;
  /** Performance metrics captured */
  metrics: PerformanceMetrics;
  /** Number of runs averaged (for stability) */
  runsAveraged: number;
  /** Environment info */
  environment: {
    browser: string;
    viewport: { width: number; height: number };
    device?: string;
    connection?: string;
  };
}

export interface PerformanceRegressionThresholds {
  /** Max allowed increase in LCP (percentage, default: 20) */
  lcp?: number;
  /** Max allowed increase in FID (percentage, default: 50) */
  fid?: number;
  /** Max allowed increase in CLS (absolute, default: 0.1) */
  cls?: number;
  /** Max allowed increase in FCP (percentage, default: 20) */
  fcp?: number;
  /** Max allowed increase in TTFB (percentage, default: 30) */
  ttfb?: number;
  /** Max allowed increase in TTI (percentage, default: 25) */
  tti?: number;
  /** Max allowed increase in TBT (percentage, default: 50) */
  tbt?: number;
  /** Max allowed increase in transfer size (percentage, default: 25) */
  transferSize?: number;
}

export interface MetricRegression {
  /** Metric name */
  metric: keyof PerformanceMetrics;
  /** Baseline value */
  baselineValue: number;
  /** Current value */
  currentValue: number;
  /** Change amount */
  change: number;
  /** Change percentage */
  changePercent: number;
  /** Threshold that was exceeded */
  threshold: number;
  /** Severity of regression */
  severity: "warning" | "regression" | "critical";
}

export interface PerformanceComparison {
  /** Metric name */
  metric: keyof PerformanceMetrics;
  /** Baseline value */
  baseline: number;
  /** Current value */
  current: number;
  /** Change amount (positive = worse, negative = better) */
  change: number;
  /** Change percentage */
  changePercent: number;
  /** Is this a regression? */
  isRegression: boolean;
  /** Is this an improvement? */
  isImprovement: boolean;
  /** Status indicator */
  status: "improved" | "stable" | "warning" | "regression" | "critical";
}

export interface PerformanceRegressionResult {
  /** URL tested */
  url: string;
  /** Baseline used for comparison */
  baseline: PerformanceBaseline;
  /** Current metrics */
  currentMetrics: PerformanceMetrics;
  /** Timestamp of this test */
  timestamp: string;
  /** Duration of test */
  duration: number;
  /** Detailed comparison per metric */
  comparisons: PerformanceComparison[];
  /** Detected regressions */
  regressions: MetricRegression[];
  /** Overall result */
  passed: boolean;
  /** Summary */
  summary: {
    totalMetrics: number;
    improved: number;
    stable: number;
    regressed: number;
    critical: number;
    overallChange: number; // Average change across all metrics
  };
}

// ============================================================================
// Tier 6: Test Coverage Map Types (v6.5.0)
// ============================================================================

export interface TestedPage {
  /** URL or route pattern */
  url: string;
  /** Normalized path for matching */
  path: string;
  /** Test files that cover this page */
  testFiles: string[];
  /** Actions tested on this page */
  actions: TestedAction[];
  /** Number of test cases covering this page */
  testCount: number;
  /** Coverage score (0-100) */
  coverageScore: number;
}

export interface TestedAction {
  /** Action type */
  type: "navigate" | "click" | "fill" | "verify" | "wait" | "scroll" | "hover";
  /** Target element description */
  target?: string;
  /** Value if applicable */
  value?: string;
  /** Test file containing this action */
  testFile: string;
  /** Line number in test file */
  lineNumber?: number;
}

export interface SitePage {
  /** Full URL */
  url: string;
  /** Path portion of URL */
  path: string;
  /** Page title if available */
  title?: string;
  /** Discovered from source */
  source: "sitemap" | "crawl" | "link";
  /** HTTP status code */
  status?: number;
  /** Links found on this page */
  outboundLinks?: string[];
  /** Interactive elements found */
  interactiveElements?: number;
  /** Forms found */
  formCount?: number;
}

export interface CoverageGap {
  /** Page without adequate test coverage */
  page: SitePage;
  /** Why this is flagged as a gap */
  reason: "untested" | "low-coverage" | "no-interactions" | "no-verifications";
  /** Priority level */
  priority: "critical" | "high" | "medium" | "low";
  /** Suggested test steps */
  suggestedTests: string[];
  /** Similar pages that are tested (for reference) */
  similarTestedPages?: string[];
}

export interface TestCoverageAnalysis {
  /** Total pages found on site */
  totalPages: number;
  /** Pages with at least one test */
  testedPages: number;
  /** Pages with no tests */
  untestedPages: number;
  /** Overall coverage percentage */
  coveragePercent: number;
  /** Coverage by section/route prefix */
  sectionCoverage: Record<string, {
    total: number;
    tested: number;
    percent: number;
  }>;
}

export interface CoverageMapResult {
  /** Base URL of the site */
  baseUrl: string;
  /** Timestamp of analysis */
  timestamp: string;
  /** Duration of analysis */
  duration: number;
  /** Test files analyzed */
  testFiles: string[];
  /** All pages found on site */
  sitePages: SitePage[];
  /** Pages with test coverage */
  testedPages: TestedPage[];
  /** Coverage gaps identified */
  gaps: CoverageGap[];
  /** Overall analysis */
  analysis: TestCoverageAnalysis;
  /** Recommendations */
  recommendations: string[];
}

export interface CoverageMapOptions {
  /** Sitemap URL to use instead of crawling */
  sitemapUrl?: string;
  /** Max pages to crawl (default: 100) */
  maxPages?: number;
  /** Include only paths matching pattern */
  includePattern?: string;
  /** Exclude paths matching pattern */
  excludePattern?: string;
  /** Minimum coverage % to not flag as gap (default: 50) */
  minCoverage?: number;
  /** Output format */
  format?: "json" | "html" | "summary";
}
