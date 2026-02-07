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
export { BUILTIN_PERSONAS } from "./personas.js";
export { startMcpServer } from "./mcp-server.js";
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
