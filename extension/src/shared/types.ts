/**
 * CBrowser Extension Types
 */

// Page analysis types
export interface PageSnapshot {
  url: string;
  title: string;
  elements: ElementInfo[];
  forms: FormInfo[];
  links: LinkInfo[];
  images: ImageInfo[];
  headings: HeadingInfo[];
  a11yIssues: A11yIssue[];
  timestamp: number;
}

export interface ElementInfo {
  tag: string;
  id?: string;
  classes: string[];
  text?: string;
  selector: string;
  ariaLabel?: string;
  role?: string;
  rect: DOMRect;
}

export interface FormInfo {
  action: string;
  method: string;
  inputs: InputInfo[];
  submitButton?: ElementInfo;
}

export interface InputInfo {
  type: string;
  name?: string;
  id?: string;
  placeholder?: string;
  required: boolean;
  selector: string;
}

export interface LinkInfo {
  href: string;
  text: string;
  selector: string;
  isExternal: boolean;
}

export interface ImageInfo {
  src: string;
  alt?: string;
  selector: string;
  hasAlt: boolean;
}

export interface HeadingInfo {
  level: number;
  text: string;
  selector: string;
}

export interface A11yIssue {
  type: 'missing-alt' | 'missing-label' | 'low-contrast' | 'empty-link' | 'heading-skip';
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
  element: string;
  message: string;
  recommendation: string;
}

// Recording types
export interface RecordedStep {
  id: string;
  action: 'navigate' | 'click' | 'fill' | 'select' | 'scroll' | 'keypress' | 'wait' | 'assert';
  target?: string;
  value?: string;
  url?: string;
  timestamp: number;
  screenshot?: string;
  description?: string;
}

export interface RecordingSession {
  id: string;
  name: string;
  startUrl: string;
  steps: RecordedStep[];
  startedAt: number;
  endedAt?: number;
}

// MCP types
export interface MCPConfig {
  serverUrl: string;
  authToken?: string;
  timeout?: number;
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

// Console/Network monitoring
export interface ConsoleMessage {
  type: 'log' | 'warn' | 'error' | 'info' | 'debug';
  message: string;
  timestamp: number;
  source?: string;
  lineNumber?: number;
}

export interface NetworkRequest {
  id: string;
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  type: string;
  startTime: number;
  endTime?: number;
  size?: number;
  responseHeaders?: Record<string, string>;
  requestHeaders?: Record<string, string>;
}

// Message types for extension communication
export type MessageType =
  | { type: 'START_RECORDING' }
  | { type: 'STOP_RECORDING' }
  | { type: 'GET_RECORDING_STATUS' }
  | { type: 'STEP_RECORDED'; step: RecordedStep }
  | { type: 'ANALYZE_PAGE' }
  | { type: 'TAKE_SCREENSHOT' }
  | { type: 'ENABLE_INSPECTOR' }
  | { type: 'DISABLE_INSPECTOR' }
  | { type: 'ELEMENT_SELECTED'; element: ElementInfo }
  | { type: 'SMART_CLICK'; target: string }
  | { type: 'FILL_INPUT'; selector: string; value: string }
  | { type: 'CALL_MCP_TOOL'; tool: MCPToolCall }
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; settings: ExtensionSettings };

export interface ExtensionSettings {
  mcpServerUrl: string;
  mcpAuthToken?: string;
  autoScreenshot: boolean;
  recordingHotkey: string;
  theme: 'light' | 'dark' | 'system';
}

// Result types
export interface VisualRegressionResult {
  passed: boolean;
  similarity: number;
  diffImageUrl?: string;
  baselineUrl: string;
  currentUrl: string;
  differences: string[];
}

export interface TestSuiteResult {
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  tests: TestResult[];
}

export interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  screenshot?: string;
}

// Journey tracking types for user session replay
export interface JourneyEvent {
  type: 'mouse' | 'click' | 'scroll' | 'input' | 'navigation';
  timestamp: number;
  x?: number;
  y?: number;
  scrollX?: number;
  scrollY?: number;
  target?: string;
  value?: string;
  url?: string;
  button?: number; // 0=left, 1=middle, 2=right
}

export interface JourneyRecording {
  id: string;
  startUrl: string;
  startedAt: number;
  endedAt?: number;
  events: JourneyEvent[];
  viewportWidth: number;
  viewportHeight: number;
}
