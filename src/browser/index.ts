/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexa Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
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
