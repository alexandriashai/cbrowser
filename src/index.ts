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
