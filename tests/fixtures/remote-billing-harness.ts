/**
 * The real hosted server (startRemoteMcpServer) with probe tools under real tool
 * names, for tests of the billing path in front of the MCP dispatch. Driven by
 * tests/remote-billing-gates.test.ts as a child process against a stand-in CMS.
 * Launches no browser: every probe answers from its arguments.
 *
 * CB_BILLING_MODE=demo registers through createGatedServer with credits charged,
 * the way cbrowser-enterprise's mcp-server-demo.ts does. CB_BILLING_MODE=enterprise
 * registers on the raw server with chargeCredits false, the way its
 * mcp-server-remote-enterprise.ts does. Each time a probe handler runs it appends
 * one line to CB_BILLING_RUNS, so a test can tell "refused" from "ran".
 * (billing fixes, 2026-11-12)
 */
import { appendFileSync } from "fs";
import { z } from "zod";
import { startRemoteMcpServer } from "../../src/mcp-server-remote.js";
import { createGatedServer } from "../../src/mcp-tools/index.js";

setTimeout(() => process.exit(0), 240_000);

const runsFile = process.env.CB_BILLING_RUNS ?? "";
const mode = process.env.CB_BILLING_MODE === "enterprise" ? "enterprise" : "demo";

type Reg = {
  registerTool: (name: string, config: Record<string, unknown>, handler: (args: Record<string, unknown>) => unknown) => void;
};

function probes(server: Reg): void {
  const ran = (name: string, args: Record<string, unknown>) => {
    if (runsFile) appendFileSync(runsFile, JSON.stringify({ tool: name, args }) + "\n");
  };
  const ok = (name: string) => async (args: Record<string, unknown>) => {
    ran(name, args);
    return { content: [{ type: "text" as const, text: `${name} ran` }] };
  };
  server.registerTool("navigate", { description: "probe", inputSchema: { url: z.string().optional() } }, ok("navigate"));
  server.registerTool("empathy_audit", {
    description: "probe",
    inputSchema: { url: z.string().optional(), fail: z.boolean().optional() },
  }, async (args) => {
    ran("empathy_audit", args);
    return args.fail
      ? { isError: true, content: [{ type: "text" as const, text: "probe failure" }] }
      : { content: [{ type: "text" as const, text: "empathy_audit ran" }] };
  });
  server.registerTool("hunt_bugs", { description: "probe", inputSchema: { url: z.string().optional() } }, async (args) => {
    ran("hunt_bugs", args);
    throw new Error("probe handler threw");
  });
  server.registerTool("ab_comparison", {
    description: "probe", inputSchema: { urlA: z.string(), urlB: z.string() },
  }, ok("ab_comparison"));
  server.registerTool("cognitive_journey_init", {
    description: "probe", inputSchema: { startUrl: z.string(), persona: z.string().optional() },
  }, ok("cognitive_journey_init"));
  server.registerTool("cognitive_journey_autonomous", {
    description: "probe", inputSchema: { start_url: z.string(), goal: z.string().optional() },
  }, ok("cognitive_journey_autonomous"));
  server.registerTool("marketing_funnel_analyze", {
    description: "probe", inputSchema: { entry_url: z.string(), funnel_name: z.string().optional() },
  }, ok("marketing_funnel_analyze"));
}

await startRemoteMcpServer({
  chargeCredits: mode !== "enterprise",
  registerTools: (server) => {
    probes((mode === "demo" ? createGatedServer(server) : server) as unknown as Reg);
  },
});
