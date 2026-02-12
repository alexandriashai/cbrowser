/**
 * CBrowser MCP Tools - Ask User Tool
 *
 * @copyright 2026 Alexa Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer } from "./types.js";

/**
 * User prompt structure for AskUserQuestion-compatible format
 */
interface UserPrompt {
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description?: string }>;
    multiSelect: boolean;
  }>;
  answers?: Record<string, string | string[]>;
  _metadata?: {
    prompt_id: string;
    context?: string[];
    security_note?: string;
    follow_up_tool?: string;
    pending_request?: Record<string, unknown>;
  };
}

let promptCounter = 0;

/**
 * Create a structured user prompt
 */
function createUserPrompt(options: {
  question: string;
  header: string;
  context?: string[];
  options: Array<{ label: string; description?: string }>;
  multiSelect?: boolean;
  securityNote?: string;
  followUpTool?: string;
  pendingRequest?: Record<string, unknown>;
}): UserPrompt {
  return {
    questions: [{
      question: options.question,
      header: options.header.substring(0, 12),
      options: options.options,
      multiSelect: options.multiSelect || false,
    }],
    _metadata: {
      prompt_id: `prompt_${Date.now()}_${++promptCounter}`,
      context: options.context,
      security_note: options.securityNote,
      follow_up_tool: options.followUpTool,
      pending_request: options.pendingRequest,
    },
  };
}

/**
 * Register ask_user tool (1 tool)
 */
export function registerAskUserTool(server: McpServer): void {
  server.tool(
    "ask_user",
    "Create a structured prompt to ask the user a question. Returns AskUserQuestion-compatible format. Use this when you need user input before proceeding. Claude should present this to the user and return their selection.",
    {
      question: z.string().describe("The complete question to ask the user"),
      header: z.string().max(12).describe("Short label displayed as chip/tag (max 12 chars)"),
      context: z.array(z.string()).optional().describe("Contextual information to help the user decide"),
      options: z.array(z.object({
        label: z.string().describe("Display text for this option (1-5 words)"),
        description: z.string().optional().describe("Explanation of what this option means"),
      })).min(2).max(4).describe("Available choices (2-4 options, 'Other' auto-added by SDK)"),
      multiSelect: z.boolean().optional().describe("Whether multiple options can be selected"),
      securityNote: z.string().optional().describe("Optional security/privacy note"),
    },
    async ({ question, header, context, options, multiSelect, securityNote }) => {
      const prompt = createUserPrompt({
        question,
        header,
        context,
        options,
        multiSelect,
        securityNote,
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify(prompt, null, 2),
        }],
      };
    }
  );
}
