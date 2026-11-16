/**
 * The real hosted server (startRemoteMcpServer) with one probe tool, for tests
 * that only care about the HTTP layer in front of the MCP dispatch. Driven by
 * tests/remote-handler-bad-input.test.ts as a child process against a stand-in
 * CMS. Launches no browser.
 *
 * The "wait" tool waits `ms` milliseconds or until its call is cancelled
 * (extra.signal) and prints WAIT start / WAIT aborted / WAIT done, so a test
 * can see whether a client hanging up cancels the call
 * (tests/remote-request-abort.test.ts, 2026-11-16).
 *
 * With CB_HARNESS_REJECT_AFTER_START=1 it leaves one promise rejection
 * unhandled once the server is up, so the test can check that the process-level
 * handler keeps the server running. (crash hotfix, 2026-11-12)
 */
import { z } from "zod";
import { startRemoteMcpServer } from "../../src/mcp-server-remote.js";

// Never outlive a test run that forgot to stop us.
setTimeout(() => process.exit(0), 180_000);

await startRemoteMcpServer({
  registerTools: (server) => {
    server.registerTool("status", { description: "probe", inputSchema: {} }, async () => ({
      content: [{ type: "text" as const, text: "ok" }],
    }));
    server.registerTool(
      "wait",
      { description: "probe: waits ms or until cancelled", inputSchema: { ms: z.number(), tag: z.string() } },
      async ({ ms, tag }, extra) => {
        console.log(`WAIT start ${tag}`);
        const how = await new Promise<string>((resolve) => {
          const t = setTimeout(() => resolve("done"), ms);
          extra.signal.addEventListener("abort", () => { clearTimeout(t); resolve("aborted"); }, { once: true });
        });
        console.log(`WAIT ${how} ${tag}`);
        return { content: [{ type: "text" as const, text: how }] };
      },
    );
  },
});

if (process.env.CB_HARNESS_REJECT_AFTER_START === "1") {
  setTimeout(() => {
    void Promise.reject(new Error("harness rejection nobody handles"));
  }, 200);
}
