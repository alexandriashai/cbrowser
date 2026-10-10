/**
 * The real hosted server (startRemoteMcpServer) with two probe tools that
 * report the caller identity they see when they run. Driven by
 * tests/identity-per-request-http.test.ts, which runs it as a child process
 * against a fake CMS. Launches no browser. (sec-identity, 2026-10-10)
 */
import { startRemoteMcpServer } from "../../src/mcp-server-remote.js";
import { createGatedServer, getActiveKeyHash, getActiveTier } from "../../src/mcp-tools/tier-gate.js";
import { getSessionApiKey } from "../../src/mcp-tools/base/cognitive-tools.js";

// Never outlive a test run that forgot to stop us.
setTimeout(() => process.exit(0), 120_000);

const probe = async () => {
  await new Promise((r) => setTimeout(r, 20));
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({ keyHash: getActiveKeyHash(), tier: getActiveTier(), apiKey: getSessionApiKey() }),
    }],
  };
};

await startRemoteMcpServer({
  registerTools: (server) => {
    const gated = createGatedServer(server) as typeof server;
    // "status" is a free-tier name and "empathy_audit" a pro one, so the
    // tier gate treats each exactly as it treats the real tool.
    gated.registerTool("status", { description: "identity probe", inputSchema: {} }, probe);
    gated.registerTool("empathy_audit", { description: "identity probe", inputSchema: {} }, probe);
  },
});
