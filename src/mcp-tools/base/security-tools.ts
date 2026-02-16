/**
 * CBrowser MCP Tools - Security Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer } from "../types.js";
import {
  securityAuditHandler,
  type SecurityAuditParams,
} from "mcp-guardian";

/**
 * Register security tools (1 tool: security_audit)
 */
export function registerSecurityTools(server: McpServer): void {
  server.tool(
    "security_audit",
    "Audit MCP tool definitions for potential prompt injection attacks. Scans tool descriptions for cross-tool instructions, privilege escalation attempts, and data exfiltration patterns. Returns detailed report of any security issues found.",
    {
      config_path: z
        .string()
        .optional()
        .describe(
          "Path to claude_desktop_config.json. If not provided, scans the current CBrowser server's tools."
        ),
      format: z
        .enum(["json", "text"])
        .optional()
        .default("json")
        .describe("Output format: json (structured) or text (human-readable)"),
      async_scan: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, connects to MCP servers to scan their tools (slower but more accurate)."),
    },
    async (params) => {
      return await securityAuditHandler(params as SecurityAuditParams);
    }
  );
}
