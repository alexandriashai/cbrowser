/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * CBrowser Security Module
 *
 * Provides security features for the CBrowser MCP server:
 * - Request signing (HMAC-SHA256) for integrity verification
 * - Tool invocation audit logging for compliance and debugging
 * - Tool definition pinning for tamper detection
 * - Per-tool permission model for granular access control
 * - Description injection scanning for prompt injection detection
 */

// Request signing
export {
  createSignature,
  validateSignature,
  generateSigningHeaders,
  getSigningConfig,
  type SignatureValidationResult,
  type RequestSigningConfig,
} from "./request-signing.js";

// Audit wrapper
export {
  wrapToolHandler,
  createAuditContext,
  createWrapperFactory,
  redactSensitiveParams,
  getToolZone as getAuditToolZone, // Renamed to avoid conflict with tool-permissions
  linkActionToInvocation,
  readAuditEntries,
  getAuditStats,
  type AuditContext,
  type ToolHandler,
} from "./audit-wrapper.js";

// Tool pinning - re-export from @cbrowser/mcp-guardian
export {
  hashToolDefinition,
  createToolManifest,
  loadToolManifest,
  saveToolManifest,
  verifyToolDefinitions,
  approveToolChange,
  removeToolFromManifest,
  approveAllTools,
  getManifestPath,
  getManifestSummary,
  type ToolDefinition,
  type ToolPinEntry,
  type ToolManifest,
  type PinningResult,
} from "mcp-guardian";

// Tool permissions
export {
  loadToolPermissions,
  saveToolPermissions,
  setToolZone,
  getToolZone,
  checkToolPermission,
  listToolZones,
  resetToolZones,
  DEFAULT_ZONES,
  type ToolZone,
  type ToolPermissionConfig,
  type PermissionCheckResult,
} from "./tool-permissions.js";

// Description injection scanning - re-export from @cbrowser/mcp-guardian
export {
  scanToolDescription,
  scanToolDefinitions,
  formatScanReport,
  isDescriptionSafe,
  scanMcpConfig,
  scanMcpConfigSync,
  type ScanSeverity,
  type ScanIssue,
  type ToolScanResult,
  type ServerScanResult,
  type ScanSummary,
} from "mcp-guardian";

// Output sanitization
export {
  sanitizeOutput,
  wrapWithDelimiters,
  detectInjectionPatterns,
  detectHiddenContent,
  detectEncodedContent,
  stripHiddenCharacters,
  isContentSafe,
  getSanitizationSummary,
  type SanitizationResult,
  type SanitizationIssue,
  type IssueType,
  type IssueAction,
} from "./output-sanitizer.js";
