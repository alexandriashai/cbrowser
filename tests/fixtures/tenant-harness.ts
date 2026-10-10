/**
 * The real hosted server (startRemoteMcpServer) with the persona-creation
 * tools and two probes: which browser a call's MCP session resolves to, and a
 * capture-player publish. Driven by tests/account-scope-process-maps-http.test.ts
 * as a child process against a fake CMS. Constructs browsers but never
 * launches one. (tenant, 2026-10-10)
 */
import { z } from "zod";
import { startRemoteMcpServer } from "../../src/mcp-server-remote.js";
import { publishCaptureUi } from "../../src/mcp-tools/ui-resources.js";
import { registerPersonaCreationTools } from "../../src/mcp-tools/persona-creation-tools.js";

// Never outlive a test run that forgot to stop us.
setTimeout(() => process.exit(0), 120_000);

/** A stable number per browser object, so the test can tell two apart. */
const tags = new WeakMap<object, number>();
let next = 0;

await startRemoteMcpServer({
  registerTools: (server, context) => {
    server.registerTool("browser_probe", { description: "which browser this call's session resolves to", inputSchema: {} }, async () => {
      const browser = await context.getBrowser();
      if (!tags.has(browser)) tags.set(browser, ++next);
      return { content: [{ type: "text" as const, text: JSON.stringify({ browser: tags.get(browser) }) }] };
    });
    server.registerTool(
      "publish_capture_probe",
      { description: "publish a capture player", inputSchema: { slug: z.string(), html: z.string() } },
      async ({ slug, html }) => ({ content: [{ type: "text" as const, text: publishCaptureUi(slug, html) }] }),
    );
    registerPersonaCreationTools(server);
  },
});
