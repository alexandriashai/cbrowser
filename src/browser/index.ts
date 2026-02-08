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
 * Browser Module Exports
 *
 * Modular components extracted from CBrowser for better maintainability.
 */

export { SessionManager } from "./session-manager.js";
export type { SessionManagerConfig } from "./session-manager.js";

export { SelectorCacheManager } from "./selector-cache.js";
export type { SelectorCacheConfig } from "./selector-cache.js";

export { OverlayHandler, OVERLAY_PATTERNS } from "./overlay-handler.js";
export type { OverlayHandlerConfig } from "./overlay-handler.js";
