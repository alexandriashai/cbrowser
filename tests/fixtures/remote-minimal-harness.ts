/**
 * The real hosted server (startRemoteMcpServer) with one probe tool, for tests
 * that only care about the HTTP layer in front of the MCP dispatch. Driven by
 * tests/remote-handler-bad-input.test.ts as a child process against a stand-in
 * CMS. Launches no browser.
 *
 * With CB_HARNESS_REJECT_AFTER_START=1 it leaves one promise rejection
 * unhandled once the server is up, so the test can check that the process-level
 * handler keeps the server running. (crash hotfix, 2026-11-12)
 */
import { startRemoteMcpServer } from "../../src/mcp-server-remote.js";

// Never outlive a test run that forgot to stop us.
setTimeout(() => process.exit(0), 180_000);

await startRemoteMcpServer({
  registerTools: (server) => {
    server.registerTool("status", { description: "probe", inputSchema: {} }, async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    }));
  },
});

if (process.env.CB_HARNESS_REJECT_AFTER_START === "1") {
  setTimeout(() => {
    void Promise.reject(new Error("harness rejection nobody handles"));
  }, 200);
}
