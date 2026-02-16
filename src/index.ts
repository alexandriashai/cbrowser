/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */


/**
 * CBrowser - AI-powered browser automation
 *
 * @example
 * ```typescript
 * import { CBrowser } from 'cbrowser';
 *
 * const browser = new CBrowser();
 * await browser.navigate('https://example.com');
 * await browser.click('Sign In');
 * await browser.close();
 * ```
 */

export { CBrowser } from "./browser.js";
export { getDefaultConfig, getPaths, ensureDirectories, mergeConfig } from "./config.js";
export type { CBrowserConfig, CBrowserPaths, BrowserType } from "./config.js";
export * from "./types.js";
export { BUILTIN_PERSONAS, registerPersonas } from "./personas.js";

// Trait Reference (v15.0.0) - Cognitive trait definitions and guidelines
export * from "./trait-reference.js";
export { startMcpServer, createMcpServer, connectMcpServer } from "./mcp-server.js";
export { startDaemon, stopDaemon, getDaemonStatus, isDaemonRunning, sendToDaemon, runDaemonServer } from "./daemon.js";

// Modular exports (v7.3.0)
// Visual testing module
export * from "./visual/index.js";

// Testing module
export * from "./testing/index.js";

// Analysis module
export * from "./analysis/index.js";

// Performance module
export * from "./performance/index.js";

// Utilities module (v10.4.4)
export { validateFilePath, sanitizeFilename, safePath } from "./utils.js";

// Browser module (v10.4.5)
export * from "./browser/index.js";

// Constitutional Stealth Framework (v15.0.0)
// Full implementation available in cbrowser-enterprise
export * from "./stealth/index.js";

// Persona Questionnaire (v16.5.0) - Research-based persona generation
export * from "./persona-questionnaire.js";

// Values System (v16.7.0) - Research-backed psychological values framework
// Based on Schwartz's Theory of Basic Human Values, SDT, and Maslow
export * from "./values/index.js";

// MCP Tools (v17.5.0) - Modular MCP tool registration
// Allows granular tool imports for custom server composition
export {
  registerAllPublicTools,
  registerBaseTools,
  registerPersonaCreationTools,
  registerAskUserTool,
  registerEnterpriseStubs,
  // Individual tool categories for granular use
  registerNavigationTools,
  registerInteractionTools,
  registerExtractionTools,
  registerAssertionTools,
  registerAnalysisTools,
  registerSessionTools,
  registerHealingTools,
  registerVisualTestingTools,
  registerTestingTools,
  registerBugAnalysisTools,
  registerPersonaComparisonTools,
  registerCognitiveTools,
  registerValuesTools,
  registerPerformanceTools,
  registerAuditTools,
  registerBrowserManagementTools,
} from "./mcp-tools/index.js";
export type { ToolRegistrationContext } from "./mcp-tools/index.js";

// Security module (v18.0.0) - Request signing and audit logging
export * from "./security/index.js";
