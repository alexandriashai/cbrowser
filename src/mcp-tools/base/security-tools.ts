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
  type SecurityAuditHandlerOptions,
} from "mcp-guardian";

// v18.35.0: Shared tool registry for self-scan
// Populated via setSecurityAuditToolList after all other tools are registered
let _registeredTools: Array<{ name: string; description: string; schema: unknown }> = [];

/** Set the tool list for self-scan (call after all tools are registered) */
export function setSecurityAuditToolList(tools: Array<{ name: string; description: string; inputSchema?: unknown }>): void {
  _registeredTools = tools.map(t => ({ name: t.name, description: t.description, schema: t.inputSchema || {} }));
}

/**
 * Register security tools (1 tool: security_audit)
 */
export function registerSecurityTools(server: McpServer): void {
  server.registerTool("security_audit", {
    title: "MCP Security Audit",
    description: "Audit MCP tool definitions for potential prompt injection attacks. Scans tool descriptions for cross-tool instructions, privilege escalation attempts, and data exfiltration patterns. Works with: local config file (Claude Desktop), remote MCP URL (Claude.ai connectors), or self-scan of current server.",
    inputSchema: {
      config_path: z
        .string()
        .optional()
        .describe(
          "Path to claude_desktop_config.json (Claude Desktop). If omitted, use mcp_url or self-scan."
        ),
      mcp_url: z
        .string()
        .optional()
        .describe(
          "URL of a remote MCP server to scan (e.g., 'https://demo.cbrowser.ai/mcp'). Fetches tool manifest directly — works from Claude.ai without a config file."
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
    annotations: {
      title: "MCP Security Audit",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async (params) => {
      const { mcp_url, ...baseParams } = params;

      // v18.35.0: Support scanning remote MCP servers by URL
      // Fetches the tool manifest via MCP initialize + tools/list, then passes
      // the tool definitions directly to mcp-guardian for scanning
      if (mcp_url) {
        try {
          // Connect to remote MCP server and fetch tool list
          const initResponse = await fetch(mcp_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "initialize",
              params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: { name: "cbrowser-security-audit", version: "1.0" },
              },
            }),
          });

          // Parse SSE response
          const initText = await initResponse.text();
          const initData = initText.split("\n").find(l => l.startsWith("data: "));
          if (!initData) throw new Error("No response from MCP server");

          // Fetch tool list
          const toolsResponse = await fetch(mcp_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              method: "tools/list",
              params: {},
            }),
          });

          const toolsText = await toolsResponse.text();
          const toolsData = toolsText.split("\n").find(l => l.startsWith("data: "));
          if (!toolsData) throw new Error("No tools/list response from MCP server");

          const parsed = JSON.parse(toolsData.replace("data: ", ""));
          const tools = parsed.result?.tools || [];

          if (tools.length === 0) {
            return {
              isError: true,
              content: [{
                type: "text" as const,
                text: JSON.stringify({ error: "No tools found at " + mcp_url, suggestion: "Verify the URL is a valid MCP endpoint" }, null, 2),
              }],
            };
          }

          // Map to mcp-guardian's ToolDefinition format
          const toolDefs = tools.map((t: { name: string; description?: string; inputSchema?: unknown }) => ({
            name: t.name,
            description: t.description || "",
            schema: t.inputSchema || {},
          }));

          // Pass tools directly to handler
          const options: SecurityAuditHandlerOptions = {
            format: baseParams.format,
            tools: toolDefs,
            serverName: new URL(mcp_url).hostname,
          };

          return await securityAuditHandler(options);
        } catch (err) {
          return {
            isError: true,
            content: [{
              type: "text" as const,
              text: JSON.stringify({
                error: `Failed to scan remote MCP server: ${err instanceof Error ? err.message : String(err)}`,
                mcp_url,
                suggestion: "Verify the URL is reachable and returns valid MCP responses. Example: https://demo.cbrowser.ai/mcp",
              }, null, 2),
            }],
          };
        }
      }

      // If config_path provided, use original file-based behavior
      if (baseParams.config_path) {
        return await securityAuditHandler(baseParams as SecurityAuditHandlerOptions);
      }

      // v18.35.0: Self-scan — use in-memory tool registry (works in all environments)
      // Bypasses auth issues on enterprise servers and config file requirements
      if (_registeredTools.length > 0) {
        return await securityAuditHandler({
          format: baseParams.format,
          tools: _registeredTools,
          serverName: "cbrowser (self-scan)",
        });
      }

      // Fallback: try localhost HTTP (works on demo/unauthenticated servers)
      const selfPort = process.env.PORT || "3000";
      const selfUrl = `http://localhost:${selfPort}/mcp`;
      try {
        const toolsResponse = await fetch(selfUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/list",
            params: {},
          }),
        });
        const toolsText = await toolsResponse.text();
        const toolsData = toolsText.split("\n").find(l => l.startsWith("data: "));
        if (toolsData) {
          const parsed = JSON.parse(toolsData.replace("data: ", ""));
          const tools = parsed.result?.tools || [];
          if (tools.length > 0) {
            const toolDefs = tools.map((t: { name: string; description?: string; inputSchema?: unknown }) => ({
              name: t.name,
              description: t.description || "",
              inputSchema: t.inputSchema || {},
            }));
            return await securityAuditHandler({
              format: baseParams.format,
              tools: toolDefs,
              serverName: "cbrowser (self-scan)",
            });
          }
        }
      } catch {
        // Self-scan via localhost failed — fall through to original handler
      }

      return await securityAuditHandler(baseParams as SecurityAuditHandlerOptions);
    }
  );
}
