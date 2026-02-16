/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Tool Description Injection Scanner for CBrowser MCP Server
 *
 * Scans MCP tool descriptions for potential prompt injection attacks.
 * Detects patterns that could be used to:
 * - Execute cross-tool attacks (chaining tools maliciously)
 * - Escalate privileges (bypassing safety instructions)
 * - Exfiltrate data (sending data to external servers)
 *
 * Usage:
 *   import { scanToolDescription, scanToolDefinitions } from "./security/description-scanner.js";
 *
 *   const result = scanToolDescription("navigate", "Navigate to a URL");
 *   if (result.status === "critical") {
 *     console.error("Potential injection detected:", result.issues);
 *   }
 */

import { existsSync, readFileSync } from "node:fs";
import type { ToolDefinition } from "./tool-pinning.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Severity levels for scan issues
 * - info: Informational, not necessarily problematic
 * - warning: Potentially suspicious, warrants review
 * - critical: Highly likely malicious, should be blocked
 */
export type ScanSeverity = "info" | "warning" | "critical";

/**
 * A single issue detected in a tool description
 */
export interface ScanIssue {
  /** Pattern category that matched (e.g., "cross_tool_instruction") */
  pattern: string;
  /** Severity level of this issue */
  severity: ScanSeverity;
  /** The actual text that matched the pattern */
  match: string;
  /** Character position in the description where match was found */
  position?: number;
}

/**
 * Result of scanning a single tool's description
 */
export interface ToolScanResult {
  /** Name of the tool that was scanned */
  toolName: string;
  /** Overall status based on highest severity issue found */
  status: "clean" | "warning" | "critical";
  /** List of issues found in the description */
  issues: ScanIssue[];
}

/**
 * Result of scanning all tools on an MCP server
 */
export interface ServerScanResult {
  /** Name of the server that was scanned */
  serverName: string;
  /** Total number of tools scanned */
  toolCount: number;
  /** Overall status based on worst tool status */
  status: "clean" | "warning" | "critical";
  /** List of tools that had issues (excludes clean tools) */
  issues: ToolScanResult[];
}

/**
 * Summary of scanning multiple MCP servers
 */
export interface ScanSummary {
  /** Results for each server scanned */
  servers: ServerScanResult[];
  /** Aggregate statistics */
  summary: {
    /** Total tools scanned across all servers */
    total: number;
    /** Tools with no issues */
    clean: number;
    /** Tools with warning-level issues */
    warning: number;
    /** Tools with critical-level issues */
    critical: number;
  };
}

// ============================================================================
// Pattern Definitions
// ============================================================================

/**
 * Pattern definition for detection
 */
interface DetectionPattern {
  /** Regex pattern to match */
  regex: RegExp;
  /** Pattern category name */
  pattern: string;
  /** Severity if matched */
  severity: ScanSeverity;
}

/**
 * CRITICAL severity patterns - these indicate likely malicious intent
 */
const CRITICAL_PATTERNS: DetectionPattern[] = [
  // Cross-tool instructions - attempts to chain tool calls
  {
    regex: /\bbefore\s+using\s+this\s+tool\b/i,
    pattern: "cross_tool_instruction",
    severity: "critical",
  },
  {
    regex: /\bfirst\s+call\b/i,
    pattern: "cross_tool_instruction",
    severity: "critical",
  },
  {
    regex: /\bthen\s+execute\b/i,
    pattern: "cross_tool_instruction",
    severity: "critical",
  },
  {
    regex: /\bafter\s+this\s+tool\b/i,
    pattern: "cross_tool_instruction",
    severity: "critical",
  },
  {
    regex: /\balways\s+call\b/i,
    pattern: "cross_tool_instruction",
    severity: "critical",
  },
  {
    regex: /\byou\s+must\s+(call|use|execute|run)\b/i,
    pattern: "cross_tool_instruction",
    severity: "critical",
  },
  {
    regex: /\bmust\s+first\b/i,
    pattern: "cross_tool_instruction",
    severity: "critical",
  },

  // Privilege escalation - attempts to override safety
  {
    regex: /\bignore\s+(previous|prior|all)\s+instructions?\b/i,
    pattern: "privilege_escalation",
    severity: "critical",
  },
  {
    regex: /\bdisregard\s+(prior|previous|all)\b/i,
    pattern: "privilege_escalation",
    severity: "critical",
  },
  {
    regex: /\boverride\s+(system|safety|security)\b/i,
    pattern: "privilege_escalation",
    severity: "critical",
  },
  {
    regex: /\bbypass\s+(security|safety|restrictions?)\b/i,
    pattern: "privilege_escalation",
    severity: "critical",
  },
  {
    regex: /\bnew\s+system\s+prompt\b/i,
    pattern: "privilege_escalation",
    severity: "critical",
  },
  {
    regex: /\byou\s+are\s+now\b/i,
    pattern: "privilege_escalation",
    severity: "critical",
  },
  {
    regex: /\bforget\s+(everything|all|previous)\b/i,
    pattern: "privilege_escalation",
    severity: "critical",
  },

  // Exfiltration - attempts to send data externally
  {
    regex: /https?:\/\/[^\s]+/i,
    pattern: "exfiltration",
    severity: "critical",
  },
  {
    regex: /\bsend\s+to\b/i,
    pattern: "exfiltration",
    severity: "critical",
  },
  {
    regex: /\bpost\s+to\b/i,
    pattern: "exfiltration",
    severity: "critical",
  },
  {
    regex: /\bforward\s+to\b/i,
    pattern: "exfiltration",
    severity: "critical",
  },
  {
    regex: /\bupload\s+to\b/i,
    pattern: "exfiltration",
    severity: "critical",
  },
  {
    regex: /\btransmit\s+to\b/i,
    pattern: "exfiltration",
    severity: "critical",
  },
  {
    regex: /\bexfiltrate\b/i,
    pattern: "exfiltration",
    severity: "critical",
  },
];

/**
 * WARNING severity patterns - suspicious but may be legitimate
 */
const WARNING_PATTERNS: DetectionPattern[] = [
  // Sensitive file paths
  {
    regex: /~\/\.ssh\b/i,
    pattern: "sensitive_path",
    severity: "warning",
  },
  {
    regex: /~\/\.aws\b/i,
    pattern: "sensitive_path",
    severity: "warning",
  },
  {
    regex: /~\/\.config\b/i,
    pattern: "sensitive_path",
    severity: "warning",
  },
  {
    regex: /\bcredentials?\b/i,
    pattern: "sensitive_path",
    severity: "warning",
  },
  {
    regex: /\/etc\/passwd\b/i,
    pattern: "sensitive_path",
    severity: "warning",
  },
  {
    regex: /\/etc\/shadow\b/i,
    pattern: "sensitive_path",
    severity: "warning",
  },
  {
    regex: /\.env\b/i,
    pattern: "sensitive_path",
    severity: "warning",
  },
  {
    regex: /\bprivate[_-]?key\b/i,
    pattern: "sensitive_path",
    severity: "warning",
  },
  {
    regex: /\bapi[_-]?key\b/i,
    pattern: "sensitive_path",
    severity: "warning",
  },
  {
    regex: /\bsecret[_-]?key\b/i,
    pattern: "sensitive_path",
    severity: "warning",
  },

  // Encoded content (potential obfuscation)
  // Base64: at least 20 chars of alphanumeric with possible padding
  {
    regex: /[A-Za-z0-9+/]{20,}={0,2}/,
    pattern: "encoded_content",
    severity: "warning",
  },
  // Unicode escape sequences
  {
    regex: /\\u00[0-9a-fA-F]{2}/,
    pattern: "encoded_content",
    severity: "warning",
  },
  // Hex encoded strings
  {
    regex: /\\x[0-9a-fA-F]{2}/,
    pattern: "encoded_content",
    severity: "warning",
  },
];

/**
 * All patterns combined for scanning
 */
const ALL_PATTERNS: DetectionPattern[] = [
  ...CRITICAL_PATTERNS,
  ...WARNING_PATTERNS,
];

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Scan a single tool's description for injection patterns.
 *
 * @param name - The tool's name
 * @param description - The tool's description text
 * @returns Scan result with status and any issues found
 *
 * @example
 * ```typescript
 * const result = scanToolDescription("navigate", "Navigate to a URL");
 * if (result.status !== "clean") {
 *   console.warn("Issues found:", result.issues);
 * }
 * ```
 */
export function scanToolDescription(
  name: string,
  description: string
): ToolScanResult {
  const issues: ScanIssue[] = [];

  // Scan for all patterns
  for (const pattern of ALL_PATTERNS) {
    // Use global flag for finding all matches
    const globalRegex = new RegExp(pattern.regex.source, "gi");
    let match;

    while ((match = globalRegex.exec(description)) !== null) {
      issues.push({
        pattern: pattern.pattern,
        severity: pattern.severity,
        match: match[0],
        position: match.index,
      });
    }
  }

  // Determine overall status from highest severity
  let status: "clean" | "warning" | "critical" = "clean";
  if (issues.some((i) => i.severity === "critical")) {
    status = "critical";
  } else if (issues.some((i) => i.severity === "warning")) {
    status = "warning";
  }

  return {
    toolName: name,
    status,
    issues,
  };
}

/**
 * Scan an array of tool definitions for injection patterns.
 *
 * @param tools - Array of tool definitions to scan
 * @param serverName - Name of the server (optional, defaults to "unknown")
 * @returns Server scan result with aggregate status
 *
 * @example
 * ```typescript
 * const tools = [
 *   { name: "navigate", description: "Navigate to URL", schema: {} },
 *   { name: "click", description: "Click element", schema: {} },
 * ];
 * const result = scanToolDefinitions(tools, "cbrowser");
 * console.log("Server status:", result.status);
 * ```
 */
export function scanToolDefinitions(
  tools: ToolDefinition[],
  serverName: string = "unknown"
): ServerScanResult {
  const toolResults: ToolScanResult[] = [];

  for (const tool of tools) {
    const result = scanToolDescription(tool.name, tool.description);
    if (result.status !== "clean") {
      toolResults.push(result);
    }
  }

  // Determine overall server status
  let status: "clean" | "warning" | "critical" = "clean";
  if (toolResults.some((r) => r.status === "critical")) {
    status = "critical";
  } else if (toolResults.some((r) => r.status === "warning")) {
    status = "warning";
  }

  return {
    serverName,
    toolCount: tools.length,
    status,
    issues: toolResults,
  };
}

/**
 * MCP config structure for parsing claude_desktop_config.json
 */
interface McpConfig {
  mcpServers?: Record<
    string,
    {
      command?: string;
      args?: string[];
      env?: Record<string, string>;
    }
  >;
}

/**
 * Scan MCP configuration file for all registered servers.
 * Currently this function parses the config but cannot actually
 * scan tool descriptions without starting the servers.
 *
 * @param configPath - Path to claude_desktop_config.json
 * @returns Scan summary with results for each server
 *
 * @example
 * ```typescript
 * const summary = scanMcpConfig("~/.config/claude/claude_desktop_config.json");
 * console.log("Total issues:", summary.summary.critical + summary.summary.warning);
 * ```
 */
export function scanMcpConfig(configPath: string): ScanSummary {
  const servers: ServerScanResult[] = [];
  let total = 0;
  let clean = 0;
  let warning = 0;
  let critical = 0;

  // Check if config file exists
  if (!existsSync(configPath)) {
    return {
      servers: [],
      summary: { total: 0, clean: 0, warning: 0, critical: 0 },
    };
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const config = JSON.parse(content) as McpConfig;

    if (config.mcpServers) {
      // For each server in config, we note it exists
      // Full scanning would require starting each server and querying tools
      for (const serverName of Object.keys(config.mcpServers)) {
        servers.push({
          serverName,
          toolCount: 0,
          status: "clean", // Cannot determine without querying server
          issues: [],
        });
      }
    }
  } catch {
    // Config parsing failed
    return {
      servers: [],
      summary: { total: 0, clean: 0, warning: 0, critical: 0 },
    };
  }

  return {
    servers,
    summary: {
      total,
      clean,
      warning,
      critical,
    },
  };
}

/**
 * Get a formatted report of scan results.
 *
 * @param result - Server scan result to format
 * @returns Human-readable report string
 */
export function formatScanReport(result: ServerScanResult): string {
  const lines: string[] = [];

  lines.push(`=== Security Scan Report: ${result.serverName} ===`);
  lines.push(`Tools scanned: ${result.toolCount}`);
  lines.push(`Status: ${result.status.toUpperCase()}`);
  lines.push("");

  if (result.issues.length === 0) {
    lines.push("No issues detected.");
  } else {
    lines.push(`Issues found in ${result.issues.length} tool(s):`);
    lines.push("");

    for (const tool of result.issues) {
      lines.push(`[${tool.status.toUpperCase()}] ${tool.toolName}`);
      for (const issue of tool.issues) {
        lines.push(`  - ${issue.pattern}: "${issue.match}"`);
        if (issue.position !== undefined) {
          lines.push(`    Position: ${issue.position}`);
        }
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Quick check if a description is safe (no critical issues).
 *
 * @param description - Description text to check
 * @returns true if no critical issues found
 */
export function isDescriptionSafe(description: string): boolean {
  const result = scanToolDescription("_check", description);
  return result.status !== "critical";
}
