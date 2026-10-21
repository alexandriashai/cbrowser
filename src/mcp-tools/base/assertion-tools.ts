/**
 * CBrowser MCP Tools - Assertion Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer, ToolRegistrationContext } from "../types.js";
import { refuseUnboundSession } from "../session-policy.js";

/**
 * Register assertion tools (1 tool: assert)
 */
export function registerAssertionTools(
  server: McpServer,
  { getBrowser, getBrowserByToken }: ToolRegistrationContext
): void {
  server.registerTool("assert", {
    title: "Assert Page State",
    description: "Assert a condition using natural language. Text comparisons ignore case unless caseSensitive is true (the same default as `cbrowser assert`; nl_test steps compare exactly unless fuzzyMatch).",
    inputSchema: {
      assertion: z.string().describe("Natural language assertion like \"page contains 'Welcome'\" or \"title is 'Home'\""),
      // Without this, assert could not bind to the session navigate created on the
      // HTTP transport: it asserted against a blank page and returned
      // `passed:false, actual:""`. Worse than a crash — a NEGATIVE assertion
      // ("page does not contain 'error'") then PASSED against nothing, so a whole
      // suite could report green while testing an empty browser. (2026-07-28)
      _browserToken: z.string().optional().describe("Browser session token from a previous tool call"),
      // nl_test passes caseSensitive: !fuzzyMatch; this tool had no way to ask
      // for an exact comparison at all. (audit M20, 2026-10-21)
      caseSensitive: z.boolean().optional().default(false).describe("Compare text exactly, case included. Default false: \"page contains 'welcome'\" matches \"Welcome\"."),
    },
    annotations: {
      title: "Assert Page State",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ assertion, _browserToken, caseSensitive }) => {
      // Adding the token was only half the fix: omitting it entirely still
      // asserted against a blank page and returned a confident verdict, with a
      // fresh _browserToken attached that made it look session-backed.
      const unbound = refuseUnboundSession("assert", { getBrowserByToken }, _browserToken);
      if (unbound) return unbound;

      let b;
      let token: string | undefined;
      if (getBrowserByToken) {
        const resolved = await getBrowserByToken(_browserToken);
        b = resolved.browser;
        token = resolved.token;
      } else {
        b = await getBrowser();
      }
      const result = await b.assert(assertion, { caseSensitive: caseSensitive === true });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              passed: result.passed,
              message: result.message,
              actual: result.actual,
              expected: result.expected,
              ...(token ? { _browserToken: token } : {}),
            }, null, 2),
          },
        ],
      };
    }
  );
}
