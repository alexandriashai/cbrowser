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
}
