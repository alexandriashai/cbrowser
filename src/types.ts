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
  cognitiveTraits?: CognitiveTraits;
  context?: {
    viewport?: [number, number];
  };
  /** Focus hierarchy for task-specific attention patterns */
  focusHierarchy?: FocusHierarchy;
}

// ============================================================================
// Focus Hierarchy Types (v8.1.0) - Probabilistic Attention Patterns
// ============================================================================

/**
 * Task types that affect focus patterns.
 * Different tasks cause users to focus on different page areas.
 */
export type TaskType =
  | "find_information"    // Looking for specific info (e.g., "find application deadline")
  | "complete_action"     // Need to do something (e.g., "submit form", "register")
  | "explore"             // Just browsing/learning (e.g., "what is this site about")
  | "compare"             // Comparing options (e.g., "which plan is best")
  | "troubleshoot";       // Fixing a problem (e.g., "why isn't this working")

/**
 * Page areas where users can focus attention.
 * Based on eye-tracking research and common page layouts.
 */
export type FocusAreaType =
  | "navigation"          // Nav bars, menus, breadcrumbs
  | "headings"            // H1-H6, section titles
  | "content"             // Main content area, paragraphs
  | "sidebar"             // Side panels, secondary content
  | "forms"               // Input fields, buttons, form elements
  | "footer"              // Footer links, secondary navigation
  | "hero"                // Hero sections, prominent banners
  | "cta"                 // Call-to-action buttons, prominent links
  | "images"              // Informational images, diagrams
  | "search";             // Search boxes and results

/**
 * Focus area with probability weight and relevance boost.
 * Probability determines likelihood of focusing here.
 * RelevanceBoost amplifies element priority when in this area.
 */
export interface FocusArea {
  /** Page area type */
  area: FocusAreaType;
  /** Probability 0-1: how likely to focus here during action selection */
  probability: number;
  /** Relevance multiplier: boosts priority of elements in this area */
  relevanceBoost: number;
  /** Whether this area is a primary target for the task (affects scan order) */
  isPrimary?: boolean;
}

/**
 * Pattern to filter out as distractions.
 * Common UI elements that real users learn to ignore.
 */
export interface DistractionFilter {
  /** Pattern to match (CSS selector, text pattern, or keyword) */
  pattern: string;
  /** Ignore rate 0-1: probability of skipping elements matching this pattern */
  ignoreRate: number;
  /** Reason for filtering (helps with debugging) */
  reason?: string;
}

/**
 * Visual scan pattern based on eye-tracking research.
 * Affects order in which page areas are examined.
 */
export type ScanPattern =
  | "f-pattern"           // F-shaped scan (most common for text-heavy pages)
  | "z-pattern"           // Z-shaped scan (landing pages, simple layouts)
  | "spotted"             // Jump to salient elements (experienced users)
  | "exhaustive"          // Methodical top-to-bottom (elderly, careful users)
  | "nav-first";          // Always check navigation first (task-oriented)

/**
 * Focus hierarchy configuration for realistic attention simulation.
 * Controls how a persona allocates attention across page areas.
 */
export interface FocusHierarchy {
  /** Task type this hierarchy is optimized for */
  taskType: TaskType;

  /** Ordered focus areas with probability weights */
  focusAreas: FocusArea[];

  /** Patterns to filter as distractions */
  distractionFilters: DistractionFilter[];

  /** Visual scan pattern for initial page examination */
  scanPattern: ScanPattern;

  /** Probability 0-1 of checking navigation before content */
  navFirstProbability: number;

  /** Probability 0-1 of using search if available */
  searchUseProbability: number;

  /** Max elements to consider per action (prevents exhaustive search) */
  attentionCapacity: number;

  /** Time in ms before attention wanders (triggers distraction check) */
  focusDecayMs: number;
}

/**
 * Preset focus hierarchies for common task types.
 */
export interface FocusHierarchyPreset {
  /** Preset name */
  name: string;
  /** Description of when to use */
  description: string;
  /** Task type this preset is for */
  taskType: TaskType;
  /** The hierarchy configuration */
  hierarchy: FocusHierarchy;
}

// ============================================================================
// Cognitive Simulation Types (v8.3.0)
// ============================================================================

/**
 * Cognitive traits that define how a persona thinks and makes decisions.
 * All values are 0.0 to 1.0.
 */
export interface CognitiveTraits {
  /** How long before giving up (0 = abandons quickly, 1 = very patient) */
  patience: number;
  /** Willingness to click unfamiliar elements (0 = only obvious CTAs, 1 = explores freely) */
  riskTolerance: number;
  /** Ability to understand UI conventions (0 = struggles, 1 = instant comprehension) */
  comprehension: number;
  /** Tendency to retry vs try something else (0 = gives up, 1 = keeps trying same approach) */
  persistence: number;
  /** Tendency to explore vs stay focused (0 = tunnel vision, 1 = easily distracted) */
  curiosity: number;
  /** Remembers what they've tried (0 = forgets and repeats, 1 = tracks all attempts) */
  workingMemory: number;
  /** Reads content vs scans for CTAs (0 = visual scanner, 1 = reads everything) */
  readingTendency: number;
}

/**
 * Attention patterns that define how a persona visually scans pages.
 */
export type AttentionPatternType =
  | "targeted"      // Goes directly to expected location
  | "f-pattern"     // Horizontal top, then down left side
  | "z-pattern"     // Top left → top right → bottom left → bottom right
  | "exploratory"   // Random exploration, notices everything
  | "sequential"    // Tab order, screen reader navigation
  | "thorough"      // Everything, slowly
  | "skim";         // Big elements only, minimal reading

/**
 * Decision styles that define how a persona makes click decisions.
 */
export type DecisionStyleType =
  | "efficient"     // Takes optimal path, no hesitation (200-500ms)
  | "cautious"      // Hovers first, reads, then decides (2-5s)
  | "quick-tap"     // Taps what looks relevant quickly (300-800ms)
  | "structured"    // Follows logical navigation order (1-3s)
  | "deliberate"    // Reads everything, decides slowly (5-15s)
  | "impulsive";    // Clicks first thing that seems right (100-300ms)

/**
 * Extended cognitive profile for a persona.
 */
export interface CognitiveProfile {
  traits: CognitiveTraits;
  attentionPattern: AttentionPatternType;
  decisionStyle: DecisionStyleType;
  /** Template for generating inner monologue */
  innerVoiceTemplate?: string;
}

/**
 * Runtime cognitive state during a journey simulation.
 */
export interface CognitiveState {
  /** Remaining patience (starts at 1.0, depletes over time) */
  patienceRemaining: number;
  /** Current confusion level (0 = clear, 1 = completely lost) */
  confusionLevel: number;
  /** Current frustration level (0 = calm, 1 = very frustrated) */
  frustrationLevel: number;
  /** Goal progress (0 = not started, 1 = achieved) */
  goalProgress: number;
  /** Confidence in being on the right path */
  confidenceLevel: number;
  /** Current emotional state */
  currentMood: "neutral" | "hopeful" | "confused" | "frustrated" | "defeated" | "relieved";
  /** Memory of actions taken */
  memory: CognitiveMemory;
  /** Time elapsed in seconds */
  timeElapsed: number;
  /** Number of steps taken */
  stepCount: number;
}

/**
 * Memory tracking during cognitive simulation.
 */
export interface CognitiveMemory {
  /** URLs visited */
  pagesVisited: string[];
  /** Actions attempted */
  actionsAttempted: Array<{ action: string; target?: string; success: boolean }>;
  /** Errors encountered */
  errorsEncountered: Array<{ error: string; context: string }>;
  /** Number of times user went "back" */
  backtrackCount: number;
}

/**
 * Abandonment thresholds for cognitive simulation.
 */
export interface AbandonmentThresholds {
  /** Abandon if patience drops below this (default: 0.1) */
  patienceMin: number;
  /** Abandon if confusion exceeds this for 30+ seconds (default: 0.8) */
  confusionMax: number;
  /** Abandon if frustration exceeds this (default: 0.85) */
  frustrationMax: number;
  /** Abandon if no progress after this many steps (default: 10) */
  maxStepsWithoutProgress: number;
  /** Abandon if same page visited this many times (default: 3) */
  loopDetectionThreshold: number;
  /** Maximum time in seconds (default: 120) */
  timeLimit: number;
}

/**
 * A single decision made during cognitive simulation.
 */
export interface CognitiveDecision {
  /** Action type */
  action: "click" | "scroll" | "type" | "wait" | "back" | "abandon";
  /** Target element (if applicable) */
  target?: string;
  /** Reasoning for this decision */
  reasoning: string;
  /** Confidence in this decision (0-1) */
  confidence: number;
  /** Alternatives considered */
  alternatives: Array<{ action: string; rejectionReason: string }>;
  /** Inner monologue for this step */
  monologue: string;
}

/**
 * Friction point identified during cognitive simulation.
 */
export interface FrictionPoint {
  /** Step number where friction occurred */
  step: number;
  /** URL where friction occurred */
  url: string;
  /** Element that caused friction */
  element?: string;
  /** Type of friction */
  type: "unclear_button" | "confusing_ui" | "form_error" | "slow_load" | "missing_element" | "other";
  /** Frustration increase caused */
  frustrationIncrease: number;
  /** Inner monologue at this point */
  monologue: string;
  /** Screenshot path (if captured) */
  screenshot?: string;
}

/**
 * Result of a cognitive journey simulation.
 */
export interface CognitiveJourneyResult {
  /** Persona used */
  persona: string;
  /** Goal attempted */
  goal: string;
  /** Whether goal was achieved */
  goalAchieved: boolean;
  /** If abandoned, why */
  abandonmentReason?: "patience" | "confusion" | "frustration" | "no_progress" | "loop" | "timeout";
  /** Final abandonment message */
  abandonmentMessage?: string;
  /** Total time in seconds */
  totalTime: number;
  /** Number of steps taken */
  stepCount: number;
  /** Path efficiency (optimal steps / actual steps, if known) */
  pathEfficiency?: number;
  /** Friction points encountered */
  frictionPoints: FrictionPoint[];
  /** Full inner monologue */
  fullMonologue: string[];
  /** Final cognitive state */
  finalState: CognitiveState;
  /** Summary metrics */
  summary: {
    avgConfusionLevel: number;
    maxFrustrationLevel: number;
    backtrackCount: number;
    timeInConfusion: number;
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

export interface SessionMetadata {
  name: string;
  created: string;
  lastUsed: string;
  domain: string;
  url: string;
  cookies: number;
  localStorageKeys: number;
  sessionStorageKeys: number;
  sizeBytes: number;
}

export interface LoadSessionResult {
  success: boolean;
  name: string;
  cookiesRestored: number;
  localStorageKeysRestored: number;
  sessionStorageKeysRestored: number;
  warning?: string;
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
  /** Available clickable elements (verbose mode) */
  availableElements?: Array<{
    tag: string;
    text: string;
    selector: string;
    role?: string;
  }>;
  /** Available input fields (verbose mode, fill only) */
  availableInputs?: Array<{
    selector: string;
    type: string;
    name: string;
    placeholder: string;
    label: string;
  }>;
  /** AI-generated suggestion for fixing the failure (verbose mode) */
  aiSuggestion?: string;
  /** Debug screenshot with highlighted elements (verbose mode) */
  debugScreenshot?: string;
}

/** Selector strategy type used for element finding */
export type SelectorStrategyType =
  | "aria-label"
  | "aria-labelledby"
  | "role"
  | "semantic-element"
  | "input-type"
  | "id"
  | "data-testid"
  | "name"
  | "css-class"
  | "text-content"
  | "nth-of-type";

/** Result from findElementByIntent with verbose info */
export interface FindByIntentResult {
  found: boolean;
  selector?: string;
  confidence?: number;
  description?: string;
  /** Which selector strategy was used (e.g., "aria-label", "id", "text-content") */
  selectorType?: SelectorStrategyType;
  /** Accessibility score 0-1 based on ARIA/semantic attributes */
  accessibilityScore?: number;
  /** Alternative selectors for the same element, ordered by priority */
  alternatives?: Array<{
    selector: string;
    text: string;
    tag: string;
    type: SelectorStrategyType;
    confidence: number;
  }>;
  /** AI-generated suggestion (verbose mode) */
  aiSuggestion?: string;
  /** Debug screenshot (verbose mode) */
  debugScreenshot?: string;
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
  /** Cognitive state (when using cognitive journeys) */
  cognitive?: {
    /** Final patience level (0-1) */
    patienceRemaining: number;
    /** Final frustration level (0-1) */
    frustrationLevel: number;
    /** Final confusion level (0-1) */
    confusionLevel: number;
    /** Abandonment reason if failed */
    abandonmentReason?: "patience" | "confusion" | "frustration" | "no_progress" | "loop" | "timeout";
    /** Number of backtracks */
    backtrackCount: number;
    /** Full inner monologue */
    monologue: string[];
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

/** Enriched error info for NL test step failures (v7.4.15) */
export interface NLTestStepError {
  /** Why the step failed */
  reason: string;
  /** What was actually found */
  actual?: string;
  /** What was expected */
  expected?: string;
  /** Partial text matches found on the page */
  partialMatches?: string[];
  /** AI-generated suggestion for fixing the test */
  suggestion?: string;
}

export interface NLTestStepResult {
  instruction: string;
  /** Parsed interpretation of the instruction */
  parsed: NLTestStep;
  action: NLTestStep["action"];
  passed: boolean;
  duration: number;
  /** Enriched error information */
  error?: NLTestStepError;
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
  /** AI-generated recommendations for fixing failures */
  recommendations?: string[];
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
  /** Anthropic API key for autonomous cognitive journeys */
  anthropicApiKey?: string;
  /** Default Claude model for cognitive journeys (default: claude-sonnet-4-20250514) */
  anthropicModel?: string;
}

// ============================================================================
// Tier 2: Visual Regression Types (v2.5.0) - Legacy pixel-diff
// ============================================================================

export interface PixelDiffResult {
  baseline: string;
  current: string;
  diff?: string;
  diffPercentage: number;
  passed: boolean;
  threshold: number;
  timestamp: string;
}

// Old VisualBaseline moved to Tier 7 AI Visual Regression types

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

/** Threshold with both percentage and absolute minimum */
export interface DualThreshold {
  /** Percentage threshold */
  percent: number;
  /** Minimum absolute change in ms (or absolute for CLS) to count as regression */
  minAbsolute: number;
}

/** Sensitivity profile for performance regression detection */
export interface SensitivityProfile {
  /** Profile name */
  name: "strict" | "normal" | "lenient";
  /** Per-metric dual thresholds */
  thresholds: {
    fcp: DualThreshold;
    lcp: DualThreshold;
    ttfb: DualThreshold;
    cls: DualThreshold;
    tti: DualThreshold;
    tbt: DualThreshold;
    fid: DualThreshold;
    transferSize: DualThreshold;
  };
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
  /** Percentage threshold that was exceeded */
  threshold: number;
  /** Absolute threshold that was exceeded */
  absoluteThreshold: number;
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
  /** Note about why a large % change was not flagged (noise threshold) */
  note?: string;
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
  /** Sensitivity profile used */
  sensitivity: "strict" | "normal" | "lenient";
  /** Detailed comparison per metric */
  comparisons: PerformanceComparison[];
  /** Detected regressions */
  regressions: MetricRegression[];
  /** Overall result */
  passed: boolean;
  /** Notes about changes within noise threshold */
  notes: Array<{ metric: string; message: string }>;
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

// ============================================================================
// Tier 7: AI Visual Regression Types (v7.0.0)
// ============================================================================

export interface VisualBaseline {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** URL that was captured */
  url: string;
  /** Path to baseline screenshot */
  screenshotPath: string;
  /** Screenshot dimensions */
  dimensions: { width: number; height: number };
  /** Viewport used */
  viewport: { width: number; height: number };
  /** Device emulation if any */
  device?: string;
  /** Timestamp of capture */
  timestamp: string;
  /** Optional element selector for partial screenshot */
  selector?: string;
  /** Metadata for context */
  metadata?: Record<string, unknown>;
}

export interface VisualChange {
  /** Type of change detected */
  type: "layout" | "content" | "style" | "missing" | "added" | "moved";
  /** Severity of the change */
  severity: "breaking" | "warning" | "info" | "acceptable";
  /** Region where change was detected */
  region: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** AI description of what changed */
  description: string;
  /** Why this severity was assigned */
  reasoning: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Suggested action */
  suggestion?: string;
}

export interface AIVisualAnalysis {
  /** Overall assessment */
  overallStatus: "pass" | "warning" | "fail";
  /** Human-readable summary */
  summary: string;
  /** Detailed changes detected */
  changes: VisualChange[];
  /** Semantic similarity score (0-1) */
  similarityScore: number;
  /** Is this acceptable for production? */
  productionReady: boolean;
  /** AI confidence in assessment (0-1) */
  confidence: number;
  /** Raw AI response for debugging */
  rawAnalysis?: string;
}

export interface VisualRegressionResult {
  /** Did the test pass? */
  passed: boolean;
  /** Baseline used */
  baseline: VisualBaseline;
  /** Path to current screenshot */
  currentScreenshotPath: string;
  /** Path to diff image (highlighted changes) */
  diffImagePath?: string;
  /** AI analysis of visual differences */
  analysis: AIVisualAnalysis;
  /** Duration of analysis in ms */
  duration: number;
}

export interface VisualRegressionOptions {
  /** Similarity threshold (0-1, default 0.9) */
  threshold?: number;
  /** Detection sensitivity: low, medium, high */
  sensitivity?: "low" | "medium" | "high";
  /** Regions to ignore (dynamic content areas) */
  ignoreRegions?: Array<{ x: number; y: number; width: number; height: number }>;
  /** Generate diff image */
  generateDiff?: boolean;
  /** Wait time before capture (ms) */
  waitBeforeCapture?: number;
}

export interface VisualTestSuite {
  /** Suite name */
  name: string;
  /** Pages to test */
  pages: VisualTestPage[];
}

export interface VisualTestPage {
  /** Page name/identifier */
  name: string;
  /** URL to test */
  url: string;
  /** Baseline name to compare against */
  baselineName: string;
  /** Page-specific options */
  options?: VisualRegressionOptions;
}

export interface VisualTestSuiteResult {
  /** Suite definition */
  suite: VisualTestSuite;
  /** Individual page results */
  results: VisualRegressionResult[];
  /** Summary */
  summary: {
    total: number;
    passed: number;
    warnings: number;
    failed: number;
  };
  /** Total duration in ms */
  duration: number;
  /** Timestamp */
  timestamp: string;
}

// ============================================================================
// Tier 7.1: Cross-Browser Visual Testing Types (v7.1.0)
// ============================================================================

export type SupportedBrowser = "chromium" | "firefox" | "webkit";

export interface BrowserScreenshot {
  /** Browser used */
  browser: SupportedBrowser;
  /** Path to screenshot */
  screenshotPath: string;
  /** Viewport used */
  viewport: { width: number; height: number };
  /** User agent */
  userAgent: string;
  /** Capture timestamp */
  timestamp: string;
  /** Time to capture (ms) */
  captureTime: number;
}

export interface BrowserComparison {
  /** First browser */
  browserA: SupportedBrowser;
  /** Second browser */
  browserB: SupportedBrowser;
  /** AI analysis of differences */
  analysis: AIVisualAnalysis;
  /** Screenshots compared */
  screenshots: {
    a: string;
    b: string;
  };
}

export interface CrossBrowserResult {
  /** URL tested */
  url: string;
  /** Screenshots from each browser */
  screenshots: BrowserScreenshot[];
  /** Pairwise comparisons between browsers */
  comparisons: BrowserComparison[];
  /** Overall status */
  overallStatus: "consistent" | "minor_differences" | "major_differences";
  /** Summary of findings */
  summary: string;
  /** Browsers with issues */
  problematicBrowsers: SupportedBrowser[];
  /** Total duration */
  duration: number;
  /** Timestamp */
  timestamp: string;
  /** Browsers that were not installed */
  missingBrowsers?: SupportedBrowser[];
  /** Browsers that were available and used */
  availableBrowsers?: SupportedBrowser[];
  /** Installation suggestion for missing browsers */
  suggestion?: string;
}

export interface CrossBrowserOptions {
  /** Browsers to test (default: all three) */
  browsers?: SupportedBrowser[];
  /** Viewport dimensions */
  viewport?: { width: number; height: number };
  /** Wait before screenshot (ms) */
  waitBeforeCapture?: number;
  /** Wait for selector before capture */
  waitForSelector?: string;
  /** Sensitivity for comparison */
  sensitivity?: "low" | "medium" | "high";
  /** Generate comparison report */
  generateReport?: boolean;
}

export interface CrossBrowserSuite {
  /** Suite name */
  name: string;
  /** URLs to test */
  urls: string[];
  /** Default options */
  options?: CrossBrowserOptions;
}

export interface CrossBrowserSuiteResult {
  /** Suite info */
  suite: CrossBrowserSuite;
  /** Results per URL */
  results: CrossBrowserResult[];
  /** Summary */
  summary: {
    total: number;
    consistent: number;
    minorDifferences: number;
    majorDifferences: number;
  };
  /** Duration */
  duration: number;
  /** Timestamp */
  timestamp: string;
}

// ============================================================================
// Responsive Visual Testing Types (v7.2.0)
// ============================================================================

/** Preset viewport configurations */
export interface ViewportPreset {
  /** Preset name (e.g., "mobile", "tablet", "desktop") */
  name: string;
  /** Viewport width */
  width: number;
  /** Viewport height */
  height: number;
  /** Device type for categorization */
  deviceType: "mobile" | "tablet" | "desktop";
  /** Optional device name (e.g., "iPhone 14", "iPad Pro") */
  deviceName?: string;
  /** Pixel ratio for high-DPI screens */
  deviceScaleFactor?: number;
  /** Whether to emulate touch */
  hasTouch?: boolean;
  /** Whether to emulate mobile mode */
  isMobile?: boolean;
}

/** Built-in viewport presets */
export const VIEWPORT_PRESETS: ViewportPreset[] = [
  // Mobile devices
  { name: "mobile-sm", width: 320, height: 568, deviceType: "mobile", deviceName: "iPhone SE", hasTouch: true, isMobile: true },
  { name: "mobile", width: 375, height: 667, deviceType: "mobile", deviceName: "iPhone 8", hasTouch: true, isMobile: true },
  { name: "mobile-lg", width: 414, height: 896, deviceType: "mobile", deviceName: "iPhone 11 Pro Max", hasTouch: true, isMobile: true },
  { name: "mobile-xl", width: 428, height: 926, deviceType: "mobile", deviceName: "iPhone 14 Pro Max", hasTouch: true, isMobile: true },
  // Tablet devices
  { name: "tablet", width: 768, height: 1024, deviceType: "tablet", deviceName: "iPad", hasTouch: true, isMobile: true },
  { name: "tablet-lg", width: 1024, height: 1366, deviceType: "tablet", deviceName: "iPad Pro 12.9", hasTouch: true, isMobile: true },
  // Desktop sizes
  { name: "desktop-sm", width: 1280, height: 800, deviceType: "desktop", deviceName: "Laptop" },
  { name: "desktop", width: 1440, height: 900, deviceType: "desktop", deviceName: "Desktop" },
  { name: "desktop-lg", width: 1920, height: 1080, deviceType: "desktop", deviceName: "Full HD" },
  { name: "desktop-xl", width: 2560, height: 1440, deviceType: "desktop", deviceName: "QHD" },
];

/** Screenshot captured at a specific viewport */
export interface ResponsiveScreenshot {
  /** Viewport preset used */
  viewport: ViewportPreset;
  /** Path to screenshot file */
  screenshotPath: string;
  /** Timestamp of capture */
  timestamp: string;
  /** Time to capture (ms) */
  captureTime: number;
}

/** Comparison between two viewport sizes */
export interface ResponsiveComparison {
  /** Smaller viewport */
  viewportA: ViewportPreset;
  /** Larger viewport */
  viewportB: ViewportPreset;
  /** AI analysis of differences */
  analysis: AIVisualAnalysis;
  /** Screenshot paths */
  screenshots: {
    a: string;
    b: string;
  };
}

/** Issues detected in responsive testing */
export interface ResponsiveIssue {
  /** Issue type */
  type: "layout_break" | "overflow" | "truncation" | "overlap" | "hidden_content" | "unreadable_text" | "touch_target" | "other";
  /** Severity */
  severity: "critical" | "major" | "minor";
  /** Description */
  description: string;
  /** Affected viewports */
  affectedViewports: string[];
  /** Breakpoint where issue occurs (if applicable) */
  breakpointRange?: { min: number; max: number };
}

/** Result of responsive visual test */
export interface ResponsiveTestResult {
  /** URL tested */
  url: string;
  /** Screenshots from each viewport */
  screenshots: ResponsiveScreenshot[];
  /** Pairwise comparisons between viewports */
  comparisons: ResponsiveComparison[];
  /** Detected responsive issues */
  issues: ResponsiveIssue[];
  /** Overall status */
  overallStatus: "responsive" | "minor_issues" | "major_issues";
  /** Summary of findings */
  summary: string;
  /** Viewports with issues */
  problematicViewports: string[];
  /** Total duration */
  duration: number;
  /** Timestamp */
  timestamp: string;
}

/** Options for responsive testing */
export interface ResponsiveTestOptions {
  /** Viewport presets to test (default: mobile, tablet, desktop) */
  viewports?: (string | ViewportPreset)[];
  /** Wait before screenshot (ms) */
  waitBeforeCapture?: number;
  /** Wait for selector before capture */
  waitForSelector?: string;
  /** Sensitivity for comparison */
  sensitivity?: "low" | "medium" | "high";
  /** Generate HTML report */
  generateReport?: boolean;
  /** Check specific breakpoints */
  breakpoints?: number[];
}

/** Suite definition for testing multiple URLs */
export interface ResponsiveSuite {
  /** Suite name */
  name: string;
  /** URLs to test */
  urls: string[];
  /** Default options */
  options?: ResponsiveTestOptions;
}

/** Result of running a responsive test suite */
export interface ResponsiveSuiteResult {
  /** Suite info */
  suite: ResponsiveSuite;
  /** Results per URL */
  results: ResponsiveTestResult[];
  /** Summary */
  summary: {
    total: number;
    responsive: number;
    minorIssues: number;
    majorIssues: number;
    totalIssues: number;
  };
  /** Common issues across pages */
  commonIssues: ResponsiveIssue[];
  /** Duration */
  duration: number;
  /** Timestamp */
  timestamp: string;
}

// ============================================================================
// A/B Visual Comparison Types (v7.3.0)
// ============================================================================

/** Screenshot captured for A/B comparison */
export interface ABScreenshot {
  /** Label (A or B) */
  label: "A" | "B";
  /** URL captured */
  url: string;
  /** Path to screenshot file */
  screenshotPath: string;
  /** Page title */
  title: string;
  /** Viewport used */
  viewport: { width: number; height: number };
  /** Timestamp of capture */
  timestamp: string;
  /** Time to capture (ms) */
  captureTime: number;
}

/** Difference detected between A and B */
export interface ABDifference {
  /** Type of difference */
  type: "layout" | "content" | "style" | "missing" | "added" | "structure";
  /** Severity */
  severity: "critical" | "major" | "minor" | "info";
  /** Description of difference */
  description: string;
  /** Which side has the issue (or both) */
  affectedSide: "A" | "B" | "both";
  /** Region where difference was detected */
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/** Result of A/B visual comparison */
export interface ABComparisonResult {
  /** URL A */
  urlA: string;
  /** URL B */
  urlB: string;
  /** Labels for display */
  labels: { a: string; b: string };
  /** Screenshots */
  screenshots: {
    a: ABScreenshot;
    b: ABScreenshot;
  };
  /** AI visual analysis */
  analysis: AIVisualAnalysis;
  /** Detailed differences */
  differences: ABDifference[];
  /** Overall status */
  overallStatus: "identical" | "similar" | "different" | "very_different";
  /** Summary */
  summary: string;
  /** Duration */
  duration: number;
  /** Timestamp */
  timestamp: string;
}

/** Options for A/B comparison */
export interface ABComparisonOptions {
  /** Custom labels for A and B */
  labels?: { a: string; b: string };
  /** Viewport dimensions */
  viewport?: { width: number; height: number };
  /** Wait before screenshot (ms) */
  waitBeforeCapture?: number;
  /** Wait for selector before capture */
  waitForSelector?: string;
  /** Sensitivity for comparison */
  sensitivity?: "low" | "medium" | "high";
  /** Generate side-by-side diff image */
  generateDiff?: boolean;
}

/** Page pair for A/B suite testing */
export interface ABPagePair {
  /** URL A */
  urlA: string;
  /** URL B */
  urlB: string;
  /** Optional name for this pair */
  name?: string;
}

/** Suite definition for A/B testing multiple page pairs */
export interface ABSuite {
  /** Suite name */
  name: string;
  /** Page pairs to compare */
  pairs: ABPagePair[];
  /** Default options */
  options?: ABComparisonOptions;
}

/** Result of running an A/B test suite */
export interface ABSuiteResult {
  /** Suite info */
  suite: ABSuite;
  /** Results per pair */
  results: ABComparisonResult[];
  /** Summary */
  summary: {
    total: number;
    identical: number;
    similar: number;
    different: number;
    veryDifferent: number;
  };
  /** Duration */
  duration: number;
  /** Timestamp */
  timestamp: string;
}

// ============================================================================
// Overlay Detection Types (v7.4.14)
// ============================================================================

/** Supported overlay types for detection */
export type OverlayType = "cookie" | "age-verify" | "newsletter" | "custom" | "unknown";

/** Pattern definition for overlay detection */
export interface OverlayPattern {
  type: OverlayType;
  selectors: string[];
  closeButtons: string[];
}

/** Options for dismissing overlays */
export interface DismissOverlayOptions {
  type?: "auto" | OverlayType;
  customSelector?: string;
  timeout?: number;
}

/** Result of overlay detection */
export interface DetectedOverlay {
  type: OverlayType;
  selector: string;
  text: string;
  zIndex: number;
  position: string;
}

/** Result of overlay dismissal */
export interface DismissOverlayResult {
  dismissed: boolean;
  overlaysFound: number;
  overlaysDismissed: number;
  details: Array<{
    type: OverlayType;
    selector: string;
    dismissed: boolean;
    closeMethod?: string;
    error?: string;
  }>;
  screenshot: string;
  suggestion?: string;
}

// ============================================================================
// Agent-Ready Audit Types (v8.0.0)
// ============================================================================

/** Issue category for agent-ready audit */
export type AgentReadyIssueCategory = "findability" | "stability" | "accessibility" | "semantics";

/** Severity level for agent-ready issues */
export type AgentReadyIssueSeverity = "low" | "medium" | "high" | "critical";

/** Effort level for fixing issues */
export type AgentReadyEffort = "trivial" | "easy" | "medium" | "hard";

/** Impact level for fixing issues */
export type AgentReadyImpact = "low" | "medium" | "high";

/** Issue found during agent-ready audit */
export interface AgentReadyIssue {
  /** Issue category */
  category: AgentReadyIssueCategory;
  /** Severity level */
  severity: AgentReadyIssueSeverity;
  /** Element selector or description */
  element: string;
  /** Description of the issue */
  description: string;
  /** Which CBrowser detection method found this */
  detectionMethod: string;
  /** Recommended fix */
  recommendation: string;
  /** Code example for fix */
  codeExample?: string;
}

/** Prioritized recommendation for agent-ready improvements */
export interface AgentReadyRecommendation {
  /** Priority (1-10, lower is higher priority) */
  priority: number;
  /** Category of improvement */
  category: string;
  /** Issue description */
  issue: string;
  /** How to fix it */
  fix: string;
  /** Effort to implement */
  effort: AgentReadyEffort;
  /** Impact of the fix */
  impact: AgentReadyImpact;
  /** Code snippet for the fix */
  codeSnippet?: string;
}

/** Score breakdown for agent-ready audit */
export interface AgentReadyScore {
  /** Overall score 0-100 */
  overall: number;
  /** Can agents locate elements? */
  findability: number;
  /** Will selectors break? */
  stability: number;
  /** ARIA/semantic HTML quality */
  accessibility: number;
  /** Meaningful labels/text */
  semantics: number;
}

/** Summary statistics for agent-ready audit */
export interface AgentReadySummary {
  /** Total elements scanned */
  totalElements: number;
  /** Elements with issues */
  problematicElements: number;
  /** Elements missing aria-label */
  missingAriaLabels: number;
  /** Hidden inputs found */
  hiddenInputs: number;
  /** Sticky overlays detected */
  stickyOverlays: number;
  /** Custom dropdowns found */
  customDropdowns: number;
  /** Elements without visible text */
  elementsWithoutText: number;
}

/** Letter grade for agent-ready audit */
export type AgentReadyGrade = "A" | "B" | "C" | "D" | "F";

/** Result of agent-ready audit */
export interface AgentReadyAuditResult {
  /** URL audited */
  url: string;
  /** When audit was run */
  timestamp: string;
  /** Score breakdown */
  score: AgentReadyScore;
  /** Issues found */
  issues: AgentReadyIssue[];
  /** Prioritized recommendations */
  recommendations: AgentReadyRecommendation[];
  /** Summary statistics */
  summary: AgentReadySummary;
  /** Letter grade */
  grade: AgentReadyGrade;
  /** Duration of audit in ms */
  duration: number;
}

/** Options for agent-ready audit */
export interface AgentReadyAuditOptions {
  /** Include verbose detection info */
  verbose?: boolean;
  /** Output path for JSON report */
  output?: string;
  /** Generate HTML report */
  html?: boolean;
  /** Run browser in headless mode */
  headless?: boolean;
}

// ============================================================================
// Competitive Benchmark Types (v8.0.0)
// ============================================================================

/** Result for a single site in competitive benchmark */
export interface SiteBenchmarkResult {
  /** URL tested */
  url: string;
  /** Site name (extracted or user-provided) */
  siteName: string;
  /** Whether the goal was achieved */
  goalAchieved: boolean;
  /** Reason for abandonment if goal not achieved */
  abandonmentReason?: string;
  /** Total time in ms */
  totalTime: number;
  /** Number of steps taken */
  stepCount: number;
  /** Friction points encountered */
  frictionPoints: string[];
  /** Confusion level 0-100 */
  confusionLevel: number;
  /** Frustration level 0-100 */
  frustrationLevel: number;
  /** Abandonment risk percentage */
  abandonmentRisk: number;
  /** Screenshots (start and end) */
  screenshots?: {
    start: string;
    end: string;
  };
}

/** Site ranking in competitive benchmark */
export interface SiteRanking {
  /** Rank position (1 = best) */
  rank: number;
  /** Site name */
  site: string;
  /** Composite UX score */
  score: number;
  /** Strengths compared to others */
  strengths: string[];
  /** Weaknesses compared to others */
  weaknesses: string[];
}

/** Comparison statistics for competitive benchmark */
export interface BenchmarkComparison {
  /** Site with fastest completion */
  fastestSite: string;
  /** Site with slowest completion */
  slowestSite: string;
  /** Site with most friction */
  mostFriction: string;
  /** Site with least friction */
  leastFriction: string;
  /** Site with highest abandonment risk */
  highestAbandonmentRisk: string;
  /** Friction points common across sites */
  commonFrictionAcrossSites: string[];
}

/** Recommendation for improving a site based on competitors */
export interface CompetitiveRecommendation {
  /** Site the recommendation is for */
  site: string;
  /** What to improve */
  improvement: string;
  /** Reference to competitor doing it better */
  competitorReference?: string;
}

/** Result of competitive benchmark */
export interface CompetitiveBenchmarkResult {
  /** Goal being tested */
  goal: string;
  /** Persona used */
  persona: string;
  /** When benchmark was run */
  timestamp: string;
  /** Duration of entire benchmark in ms */
  duration: number;
  /** Results per site */
  sites: SiteBenchmarkResult[];
  /** Sites ranked by UX score */
  ranking: SiteRanking[];
  /** Comparative statistics */
  comparison: BenchmarkComparison;
  /** Recommendations for each site */
  recommendations: CompetitiveRecommendation[];
}

/** Options for competitive benchmark */
export interface CompetitiveBenchmarkOptions {
  /** Sites to benchmark */
  sites: Array<{ url: string; name?: string }>;
  /** Goal to accomplish */
  goal: string;
  /** Persona to use */
  persona?: string;
  /** Max steps per site */
  maxSteps?: number;
  /** Max time per site in seconds */
  maxTime?: number;
  /** Run headless */
  headless?: boolean;
  /** Max concurrent browsers */
  maxConcurrency?: number;
  /** Output path for JSON report */
  output?: string;
  /** Generate HTML report */
  html?: boolean;
}

// ============================================================================
// Accessibility Empathy Types (v8.0.0)
// ============================================================================

/** Accessibility traits for personas */
export interface AccessibilityTraits {
  // Physical
  /** Motor control level 0-1 (0=severe impairment, 1=full control) */
  motorControl?: number;
  /** Has hand tremor (Parkinson's, essential tremor) */
  tremor?: boolean;
  /** Screen area reachable 0-1 */
  reachability?: number;

  // Sensory
  /** Vision level 0-1 (0=blind, 0.5=low vision, 1=sighted) */
  visionLevel?: number;
  /** Type of color blindness */
  colorBlindness?: "red-green" | "blue-yellow" | "monochrome";
  /** Contrast sensitivity multiplier (1-5x) */
  contrastSensitivity?: number;

  // Cognitive
  /** Information processing speed 0-1 */
  processingSpeed?: number;
  /** Focus duration before fatigue 0-1 */
  attentionSpan?: number;

  // Fatigue
  /** Performance degradation over time 0-1 */
  fatigueSusceptibility?: number;
}

/** Type of accessibility barrier */
export type AccessibilityBarrierType =
  | "motor_precision"
  | "visual_clarity"
  | "cognitive_load"
  | "temporal"
  | "sensory"
  | "contrast"
  | "touch_target"
  | "timing";

/** Severity of accessibility barrier */
export type AccessibilityBarrierSeverity = "minor" | "major" | "critical";

/** Barrier found during accessibility empathy audit */
export interface AccessibilityBarrier {
  /** Type of barrier */
  type: AccessibilityBarrierType;
  /** Element selector or description */
  element: string;
  /** Description of the barrier */
  description: string;
  /** Personas affected by this barrier */
  affectedPersonas: string[];
  /** WCAG criteria violated */
  wcagCriteria: string[];
  /** Severity of the barrier */
  severity: AccessibilityBarrierSeverity;
  /** How to remediate */
  remediation: string;
}

/** Friction point specific to accessibility */
export interface AccessibilityFrictionPoint {
  /** Step where friction occurred */
  step: number;
  /** Type of friction */
  type: string;
  /** Description */
  description: string;
  /** How much it impacted the user */
  impact: "low" | "medium" | "high";
  /** Accessibility-specific context */
  accessibilityContext?: string;
}

/** Remediation item with priority */
export interface RemediationItem {
  /** Priority (lower = more important) */
  priority: number;
  /** What to fix */
  issue: string;
  /** How to fix it */
  fix: string;
  /** WCAG criteria addressed */
  wcagCriteria: string[];
  /** Effort level */
  effort: AgentReadyEffort;
}

/** Result of accessibility empathy audit for a single persona */
export interface AccessibilityEmpathyResult {
  /** URL tested */
  url: string;
  /** Persona used */
  persona: string;
  /** Type of disability simulated */
  disabilityType: string;
  /** Whether the goal was achieved */
  goalAchieved: boolean;
  /** Barriers encountered */
  barriers: AccessibilityBarrier[];
  /** Friction points encountered */
  frictionPoints: AccessibilityFrictionPoint[];
  /** WCAG violations found */
  wcagViolations: string[];
  /** Prioritized remediation items */
  remediationPriority: RemediationItem[];
  /** Empathy score 0-100 */
  empathyScore: number;
  /** Duration in ms */
  duration: number;
}

/** Combined result for multiple disability types */
export interface EmpathyAuditResult {
  /** URL tested */
  url: string;
  /** Goal attempted */
  goal: string;
  /** When audit was run */
  timestamp: string;
  /** Results per disability type */
  results: AccessibilityEmpathyResult[];
  /** Combined WCAG violations across all personas */
  allWcagViolations: string[];
  /** All barriers across personas */
  allBarriers: AccessibilityBarrier[];
  /** Prioritized remediation across all */
  combinedRemediation: RemediationItem[];
  /** Overall empathy score */
  overallScore: number;
  /** Duration of entire audit in ms */
  duration: number;
}

/** Options for accessibility empathy audit */
export interface EmpathyAuditOptions {
  /** Goal to accomplish */
  goal: string;
  /** Disability types to simulate */
  disabilities: string[];
  /** WCAG level to check against */
  wcagLevel?: "A" | "AA" | "AAA";
  /** Max steps per persona */
  maxSteps?: number;
  /** Max time per persona in seconds */
  maxTime?: number;
  /** Run headless */
  headless?: boolean;
  /** Output path for JSON report */
  output?: string;
  /** Generate HTML report */
  html?: boolean;
}

/** Accessibility-focused persona extending base persona */
export interface AccessibilityPersona extends Omit<Persona, 'cognitiveTraits'> {
  /** Accessibility traits */
  accessibilityTraits: AccessibilityTraits;
  /** Cognitive traits (optional partial override) */
  cognitiveTraits?: Partial<CognitiveTraits>;
}
