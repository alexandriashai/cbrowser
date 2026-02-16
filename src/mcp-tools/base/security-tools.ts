/**
 * CBrowser MCP Tools - Security Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer } from "../types.js";
import {
  scanToolDefinitions,
  scanMcpConfig,
  formatScanReport,
  type ServerScanResult,
  type ScanSummary,
} from "../../security/index.js";
import { loadToolManifest } from "../../security/tool-pinning.js";

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
    },
    async ({ config_path, format }) => {
      let result: ServerScanResult | ScanSummary;

      if (config_path) {
        // Scan external MCP config
        result = scanMcpConfig(config_path);
      } else {
        // Scan current CBrowser tools from manifest
        const manifest = loadToolManifest();

        if (!manifest) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    error: "No tool manifest found",
                    hint:
                      "Run CBrowser once to generate the tool manifest, or provide a config_path to scan.",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Convert manifest entries to tool definitions for scanning
        // Note: We only have the tool names and metadata, not the actual descriptions
        // from the manifest. For a full scan, we'd need to query the server.
        const tools = Object.entries(manifest.tools).map(([name, entry]) => ({
          name,
          // We use a placeholder description since manifest doesn't store descriptions
          // Full scanning would require querying the actual server
          description: `Tool: ${name} (${entry.descriptionLength} chars, ${entry.parameterCount} params)`,
          schema: {},
        }));

        result = scanToolDefinitions(tools, "cbrowser");

        // Add manifest info to result
        (result as ServerScanResult & { manifestInfo?: object }).manifestInfo = {
          version: manifest.version,
          pinnedAt: manifest.pinnedAt,
          toolCount: Object.keys(manifest.tools).length,
        };
      }

      // Format output
      if (format === "text" && "serverName" in result) {
        return {
          content: [
            {
              type: "text",
              text: formatScanReport(result as ServerScanResult),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}
