/**
 * CBrowser - Cognitive Browser Automation
 * 
 * Copyright (c) 2026 WF Media (Alexandria Eden)
 * Email: alexandria.shai.eden@gmail.com
 * 
 * This source code is licensed under the Business Source License 1.1
 * found in the LICENSE file in the root directory of this source tree.
 * 
 * Non-production use is permitted. Production use requires a commercial license.
 * See LICENSE for full terms.
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
export { BUILTIN_PERSONAS } from "./personas.js";

// Trait Reference (v15.0.0) - Cognitive trait definitions and guidelines
export * from "./trait-reference.js";
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

// Browser module (v10.4.5)
export * from "./browser/index.js";

// Constitutional Stealth Framework (v15.0.0)
// Full implementation available in cbrowser-enterprise
export * from "./stealth/index.js";
