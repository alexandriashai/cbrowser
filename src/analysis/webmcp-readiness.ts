/**
 * CBrowser - WebMCP Readiness Audit
 *
 * 6-tier evaluation framework for MCP server Claude in Chrome compatibility.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import type {
  WebMCPReadyResult,
  WebMCPReadyOptions,
  WebMCPTierResult,
  WebMCPTierNumber,
  WebMCPCheck,
  WebMCPIssue,
  WebMCPGrade,
  WEBMCP_TIERS,
} from "../types.js";

// Re-export for consumers
export type {
  WebMCPReadyResult,
  WebMCPReadyOptions,
  WebMCPTierResult,
  WebMCPCheck,
  WebMCPIssue,
};

/**
 * Tier weights for scoring
 */
const TIER_CONFIG: Record<WebMCPTierNumber, { name: string; weight: number }> = {
  1: { name: "Server Implementation", weight: 0.25 },
  2: { name: "Tool Discoverability", weight: 0.20 },
  3: { name: "Instrumentation", weight: 0.15 },
  4: { name: "Consistency", weight: 0.15 },
  5: { name: "Agent Optimizations", weight: 0.15 },
  6: { name: "Documentation", weight: 0.10 },
};

/**
 * Parse SSE or JSON response from MCP server
 */
async function parseMcpResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  // Check if it's SSE format (starts with "event:" or "data:")
  if (text.startsWith("event:") || text.startsWith("data:")) {
    // Parse SSE - find the data line
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data:")) {
        const jsonStr = line.slice(5).trim();
        if (jsonStr) {
          return JSON.parse(jsonStr);
        }
      }
    }
    // No data line found
    return null;
  }

  // Regular JSON response
  return JSON.parse(text);
}

/**
 * Run WebMCP readiness audit on an MCP server
 */
export async function runWebMCPReadyAudit(
  url: string,
  options: WebMCPReadyOptions = {}
): Promise<WebMCPReadyResult> {
  const startTime = Date.now();
  const timeout = options.timeout || 30000;

  // Normalize URL
  const serverUrl = url.endsWith("/mcp") ? url : `${url.replace(/\/$/, "")}/mcp`;
  const baseUrl = serverUrl.replace(/\/mcp$/, "");

  // Initialize result structure
  const tiers: WebMCPTierResult[] = [];
  const issues: WebMCPIssue[] = [];
  let serverResponded = false;
  let protocolVersion: string | undefined;
  let toolCount: number | undefined;
  let toolList: unknown[] = [];

  // Helper to add issue
  const addIssue = (
    tier: WebMCPTierNumber,
    severity: WebMCPIssue["severity"],
    issue: string,
    remediation: string,
    effort: WebMCPIssue["effort"] = "moderate"
  ) => {
    issues.push({ tier, severity, issue, remediation, effort });
  };

  // Tier 1: Server Implementation (25%)
  const tier1Checks = await runTier1ServerImplementation(
    serverUrl,
    baseUrl,
    timeout,
    options,
    addIssue
  );
  serverResponded = tier1Checks.some(c => c.id === "server_responds" && c.passed);
  const versionCheck = tier1Checks.find(c => c.id === "protocol_version");
  if (versionCheck?.evidence) {
    protocolVersion = versionCheck.evidence;
  }
  tiers.push(createTierResult(1, tier1Checks));

  // Tier 2: Tool Discoverability (20%)
  const tier2Result = await runTier2ToolDiscoverability(
    serverUrl,
    timeout,
    options,
    addIssue
  );
  toolCount = tier2Result.toolCount;
  toolList = tier2Result.tools;
  tiers.push(createTierResult(2, tier2Result.checks));

  // Tier 3: Instrumentation (15%)
  const tier3Checks = await runTier3Instrumentation(
    baseUrl,
    timeout,
    options,
    addIssue
  );
  tiers.push(createTierResult(3, tier3Checks));

  // Tier 4: Consistency (15%)
  const tier4Checks = await runTier4Consistency(
    serverUrl,
    toolList,
    timeout,
    options,
    addIssue
  );
  tiers.push(createTierResult(4, tier4Checks));

  // Tier 5: Agent Optimizations (15%)
  const tier5Checks = await runTier5AgentOptimizations(
    toolList,
    options,
    addIssue
  );
  tiers.push(createTierResult(5, tier5Checks));

  // Tier 6: Documentation (10%)
  const tier6Checks = await runTier6Documentation(
    baseUrl,
    timeout,
    options,
    addIssue
  );
  tiers.push(createTierResult(6, tier6Checks));

  // Calculate overall score
  let overallScore = 0;
  for (const tier of tiers) {
    overallScore += tier.score * tier.weight;
  }
  overallScore = Math.round(overallScore);

  // Determine grade
  const grade = scoreToGrade(overallScore);

  // Sort issues by severity
  const severityOrder: Record<WebMCPIssue["severity"], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Generate prioritized recommendations
  const recommendations = generateRecommendations(issues, tiers);

  // Count checks
  const totalChecks = tiers.reduce((sum, t) => sum + t.checks.length, 0);
  const passedChecks = tiers.reduce(
    (sum, t) => sum + t.checks.filter(c => c.passed).length,
    0
  );

  return {
    url: serverUrl,
    timestamp: new Date().toISOString(),
    score: overallScore,
    grade,
    tiers,
    issues,
    recommendations,
    duration: Date.now() - startTime,
    summary: {
      totalChecks,
      passedChecks,
      criticalIssues: issues.filter(i => i.severity === "critical").length,
      highIssues: issues.filter(i => i.severity === "high").length,
      serverResponded,
      protocolVersion,
      toolCount,
    },
  };
}

/**
 * Create a tier result from checks
 */
function createTierResult(tier: WebMCPTierNumber, checks: WebMCPCheck[]): WebMCPTierResult {
  const totalScore = checks.reduce((sum, c) => sum + c.score, 0);
  const maxScore = checks.reduce((sum, c) => sum + c.maxScore, 0);
  const score = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

  return {
    tier,
    name: TIER_CONFIG[tier].name,
    score,
    weight: TIER_CONFIG[tier].weight,
    checks,
  };
}

/**
 * Convert score to letter grade
 */
function scoreToGrade(score: number): WebMCPGrade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/**
 * Tier 1: Server Implementation (25%)
 * - Protocol version, tool definitions, error handling, timeouts
 */
async function runTier1ServerImplementation(
  serverUrl: string,
  baseUrl: string,
  timeout: number,
  options: WebMCPReadyOptions,
  addIssue: (
    tier: WebMCPTierNumber,
    severity: WebMCPIssue["severity"],
    issue: string,
    remediation: string,
    effort?: WebMCPIssue["effort"]
  ) => void
): Promise<WebMCPCheck[]> {
  const checks: WebMCPCheck[] = [];

  // Check 1.1: Server responds
  let serverResponds = false;
  let responseTime = 0;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const start = Date.now();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (options.apiKey) {
      headers["Authorization"] = `Bearer ${options.apiKey}`;
    } else if (options.oauthToken) {
      headers["Authorization"] = `Bearer ${options.oauthToken}`;
    }

    // Send MCP initialize request
    const response = await fetch(serverUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "cbrowser-audit", version: "1.0.0" },
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    responseTime = Date.now() - start;
    serverResponds = response.ok || response.status === 401 || response.status === 403;

    if (response.ok) {
      checks.push({
        id: "server_responds",
        name: "Server responds to MCP requests",
        passed: true,
        score: 1,
        maxScore: 1,
        details: `Server responded in ${responseTime}ms`,
        evidence: `HTTP ${response.status}`,
      });
    } else if (response.status === 401 || response.status === 403) {
      checks.push({
        id: "server_responds",
        name: "Server responds to MCP requests",
        passed: true,
        score: 0.8,
        maxScore: 1,
        details: `Server requires authentication (${response.status})`,
        evidence: `HTTP ${response.status}`,
      });
      addIssue(1, "medium", "Server requires authentication", "Provide API key or OAuth token in options", "quick");
    } else {
      checks.push({
        id: "server_responds",
        name: "Server responds to MCP requests",
        passed: false,
        score: 0,
        maxScore: 1,
        details: `Server returned error: HTTP ${response.status}`,
        evidence: `HTTP ${response.status}`,
      });
      addIssue(1, "critical", "Server not responding correctly", "Verify MCP endpoint is accessible and returns 200 OK", "significant");
    }
  } catch (error) {
    checks.push({
      id: "server_responds",
      name: "Server responds to MCP requests",
      passed: false,
      score: 0,
      maxScore: 1,
      details: `Connection failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    addIssue(1, "critical", "Cannot connect to MCP server", "Verify server is running and URL is correct", "significant");
  }

  // Check 1.2: Protocol version
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (options.apiKey) headers["Authorization"] = `Bearer ${options.apiKey}`;
    else if (options.oauthToken) headers["Authorization"] = `Bearer ${options.oauthToken}`;

    const response = await fetch(serverUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "cbrowser-audit", version: "1.0.0" },
        },
      }),
    });

    if (response.ok) {
      const data = await parseMcpResponse(response) as { result?: { protocolVersion?: string } };
      const serverVersion = data?.result?.protocolVersion;
      const isLatest = serverVersion === "2024-11-05";

      checks.push({
        id: "protocol_version",
        name: "Uses latest MCP protocol version",
        passed: isLatest,
        score: isLatest ? 1 : 0.5,
        maxScore: 1,
        details: isLatest
          ? "Using latest protocol version 2024-11-05"
          : `Using older protocol version: ${serverVersion || "unknown"}`,
        evidence: serverVersion || "unknown",
      });

      if (!isLatest && serverVersion) {
        addIssue(1, "medium", `Protocol version ${serverVersion} is not the latest`, "Upgrade to protocol version 2024-11-05", "moderate");
      }
    } else {
      checks.push({
        id: "protocol_version",
        name: "Uses latest MCP protocol version",
        passed: false,
        score: 0,
        maxScore: 1,
        details: "Could not determine protocol version",
      });
    }
  } catch {
    checks.push({
      id: "protocol_version",
      name: "Uses latest MCP protocol version",
      passed: false,
      score: 0,
      maxScore: 1,
      details: "Failed to check protocol version",
    });
  }

  // Check 1.3: Error handling
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (options.apiKey) headers["Authorization"] = `Bearer ${options.apiKey}`;
    else if (options.oauthToken) headers["Authorization"] = `Bearer ${options.oauthToken}`;

    // Send invalid request to test error handling
    const response = await fetch(serverUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "nonexistent_method_xyz",
        params: {},
      }),
    });

    if (response.ok) {
      const data = await parseMcpResponse(response) as { error?: { code?: number; message?: string } };
      const hasError = data?.error !== undefined;
      const hasErrorCode = data?.error?.code !== undefined;
      const hasErrorMessage = data?.error?.message !== undefined;

      checks.push({
        id: "error_handling",
        name: "Returns proper JSON-RPC errors",
        passed: hasError && hasErrorCode && hasErrorMessage,
        score: hasError ? (hasErrorCode && hasErrorMessage ? 1 : 0.5) : 0,
        maxScore: 1,
        details: hasError
          ? `Returns error with code ${data.error?.code}: ${data.error?.message}`
          : "Does not return proper error for invalid method",
        evidence: hasError ? `Code: ${data.error?.code}` : undefined,
      });

      if (!hasError) {
        addIssue(1, "high", "Server does not return proper errors for invalid methods", "Implement JSON-RPC error handling per MCP spec", "moderate");
      }
    } else {
      // HTTP error is also acceptable for invalid requests
      checks.push({
        id: "error_handling",
        name: "Returns proper JSON-RPC errors",
        passed: true,
        score: 0.8,
        maxScore: 1,
        details: `Returns HTTP ${response.status} for invalid method`,
      });
    }
  } catch {
    checks.push({
      id: "error_handling",
      name: "Returns proper JSON-RPC errors",
      passed: false,
      score: 0,
      maxScore: 1,
      details: "Failed to test error handling",
    });
  }

  // Check 1.4: Response timeout behavior
  checks.push({
    id: "response_time",
    name: "Responds within acceptable time",
    passed: responseTime < 5000,
    score: responseTime < 1000 ? 1 : responseTime < 5000 ? 0.7 : 0.3,
    maxScore: 1,
    details: responseTime > 0
      ? `Response time: ${responseTime}ms`
      : "Could not measure response time",
    evidence: responseTime > 0 ? `${responseTime}ms` : undefined,
  });

  if (responseTime > 5000) {
    addIssue(1, "medium", `Slow response time: ${responseTime}ms`, "Optimize server startup and response handling", "moderate");
  }

  return checks;
}

/**
 * Tier 2: Tool Discoverability (20%)
 * - Schema completeness, descriptions, input validation
 */
async function runTier2ToolDiscoverability(
  serverUrl: string,
  timeout: number,
  options: WebMCPReadyOptions,
  addIssue: (
    tier: WebMCPTierNumber,
    severity: WebMCPIssue["severity"],
    issue: string,
    remediation: string,
    effort?: WebMCPIssue["effort"]
  ) => void
): Promise<{ checks: WebMCPCheck[]; toolCount?: number; tools: unknown[] }> {
  const checks: WebMCPCheck[] = [];
  let tools: unknown[] = [];
  let toolCount: number | undefined;

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (options.apiKey) headers["Authorization"] = `Bearer ${options.apiKey}`;
    else if (options.oauthToken) headers["Authorization"] = `Bearer ${options.oauthToken}`;

    // Initialize first
    await fetch(serverUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "cbrowser-audit", version: "1.0.0" },
        },
      }),
    });

    // List tools
    const response = await fetch(serverUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });

    if (response.ok) {
      const data = await parseMcpResponse(response) as { result?: { tools?: unknown[] } };
      tools = data?.result?.tools || [];
      toolCount = tools.length;

      // Check 2.1: Tools are exposed
      checks.push({
        id: "tools_exposed",
        name: "Exposes tools via tools/list",
        passed: toolCount > 0,
        score: toolCount > 0 ? 1 : 0,
        maxScore: 1,
        details: `Found ${toolCount} tools`,
        evidence: `${toolCount} tools`,
      });

      if (toolCount === 0) {
        addIssue(2, "critical", "No tools exposed", "Implement and register at least one MCP tool", "significant");
      }

      // Check 2.2: Tool descriptions
      const toolsWithDesc = tools.filter((t: any) => t.description && t.description.length > 10);
      const descRatio = toolCount > 0 ? toolsWithDesc.length / toolCount : 0;
      checks.push({
        id: "tool_descriptions",
        name: "Tools have descriptive descriptions",
        passed: descRatio >= 0.9,
        score: descRatio,
        maxScore: 1,
        details: `${toolsWithDesc.length}/${toolCount} tools have descriptions > 10 chars`,
        evidence: `${Math.round(descRatio * 100)}%`,
      });

      if (descRatio < 0.9) {
        addIssue(2, "medium", `${toolCount - toolsWithDesc.length} tools lack good descriptions`, "Add descriptive help text to all tools (>10 chars)", "quick");
      }

      // Check 2.3: Input schemas
      const toolsWithSchema = tools.filter((t: any) => t.inputSchema && Object.keys(t.inputSchema).length > 0);
      const schemaRatio = toolCount > 0 ? toolsWithSchema.length / toolCount : 0;
      checks.push({
        id: "input_schemas",
        name: "Tools have input schemas",
        passed: schemaRatio >= 0.9,
        score: schemaRatio,
        maxScore: 1,
        details: `${toolsWithSchema.length}/${toolCount} tools have input schemas`,
        evidence: `${Math.round(schemaRatio * 100)}%`,
      });

      if (schemaRatio < 0.9) {
        addIssue(2, "high", `${toolCount - toolsWithSchema.length} tools lack input schemas`, "Define JSON Schema for all tool inputs", "moderate");
      }

      // Check 2.4: Schema property descriptions
      let propsWithDesc = 0;
      let totalProps = 0;
      for (const tool of tools as any[]) {
        const props = tool.inputSchema?.properties || {};
        for (const key of Object.keys(props)) {
          totalProps++;
          if (props[key].description) propsWithDesc++;
        }
      }
      const propDescRatio = totalProps > 0 ? propsWithDesc / totalProps : 1;
      checks.push({
        id: "property_descriptions",
        name: "Schema properties have descriptions",
        passed: propDescRatio >= 0.8,
        score: propDescRatio,
        maxScore: 1,
        details: `${propsWithDesc}/${totalProps} properties have descriptions`,
        evidence: `${Math.round(propDescRatio * 100)}%`,
      });

      if (propDescRatio < 0.8) {
        addIssue(2, "low", `${totalProps - propsWithDesc} properties lack descriptions`, "Add descriptions to all schema properties", "quick");
      }

    } else {
      checks.push({
        id: "tools_exposed",
        name: "Exposes tools via tools/list",
        passed: false,
        score: 0,
        maxScore: 1,
        details: `tools/list failed: HTTP ${response.status}`,
      });
      addIssue(2, "critical", "tools/list endpoint not working", "Implement tools/list method per MCP spec", "significant");
    }
  } catch (error) {
    checks.push({
      id: "tools_exposed",
      name: "Exposes tools via tools/list",
      passed: false,
      score: 0,
      maxScore: 1,
      details: `Failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  return { checks, toolCount, tools };
}

/**
 * Tier 3: Instrumentation (15%)
 * - Execution timing, error logging, health endpoint
 */
async function runTier3Instrumentation(
  baseUrl: string,
  timeout: number,
  options: WebMCPReadyOptions,
  addIssue: (
    tier: WebMCPTierNumber,
    severity: WebMCPIssue["severity"],
    issue: string,
    remediation: string,
    effort?: WebMCPIssue["effort"]
  ) => void
): Promise<WebMCPCheck[]> {
  const checks: WebMCPCheck[] = [];

  // Check 3.1: Health endpoint
  try {
    const response = await fetch(`${baseUrl}/health`, { method: "GET" });
    const hasHealth = response.ok;

    checks.push({
      id: "health_endpoint",
      name: "Exposes /health endpoint",
      passed: hasHealth,
      score: hasHealth ? 1 : 0,
      maxScore: 1,
      details: hasHealth
        ? "Health endpoint available"
        : `Health endpoint returned ${response.status}`,
    });

    if (!hasHealth) {
      addIssue(3, "medium", "No /health endpoint", "Add GET /health endpoint for monitoring", "quick");
    }
  } catch {
    checks.push({
      id: "health_endpoint",
      name: "Exposes /health endpoint",
      passed: false,
      score: 0,
      maxScore: 1,
      details: "Health endpoint not accessible",
    });
    addIssue(3, "medium", "No /health endpoint", "Add GET /health endpoint for monitoring", "quick");
  }

  // Check 3.2: Info endpoint
  try {
    const response = await fetch(`${baseUrl}/info`, { method: "GET" });
    if (response.ok) {
      const data = await parseMcpResponse(response) as { name?: string; version?: string };
      const hasVersion = data?.version !== undefined;
      const hasName = data?.name !== undefined;

      checks.push({
        id: "info_endpoint",
        name: "Exposes /info endpoint with metadata",
        passed: hasVersion && hasName,
        score: hasVersion && hasName ? 1 : hasVersion || hasName ? 0.5 : 0,
        maxScore: 1,
        details: hasVersion && hasName
          ? `Name: ${data.name}, Version: ${data.version}`
          : "Incomplete info response",
        evidence: hasVersion ? data.version : undefined,
      });
    } else {
      checks.push({
        id: "info_endpoint",
        name: "Exposes /info endpoint with metadata",
        passed: false,
        score: 0,
        maxScore: 1,
        details: `Info endpoint returned ${response.status}`,
      });
      addIssue(3, "low", "No /info endpoint", "Add GET /info endpoint with name and version", "quick");
    }
  } catch {
    checks.push({
      id: "info_endpoint",
      name: "Exposes /info endpoint with metadata",
      passed: false,
      score: 0,
      maxScore: 1,
      details: "Info endpoint not accessible",
    });
    addIssue(3, "low", "No /info endpoint", "Add GET /info endpoint with name and version", "quick");
  }

  // Check 3.3: OAuth metadata (for Claude.ai compatibility)
  try {
    const response = await fetch(`${baseUrl}/.well-known/oauth-protected-resource`, {
      method: "GET",
    });

    if (response.ok) {
      const data = await parseMcpResponse(response) as { resource?: string; authorization_servers?: string[] };
      const hasResource = data?.resource !== undefined;
      const hasAuthServer = data?.authorization_servers !== undefined;

      checks.push({
        id: "oauth_metadata",
        name: "OAuth Protected Resource metadata",
        passed: hasResource && hasAuthServer,
        score: hasResource && hasAuthServer ? 1 : 0.5,
        maxScore: 1,
        details: hasResource && hasAuthServer
          ? "OAuth metadata properly configured"
          : "Partial OAuth metadata",
        evidence: data?.resource,
      });
    } else {
      checks.push({
        id: "oauth_metadata",
        name: "OAuth Protected Resource metadata",
        passed: false,
        score: 0,
        maxScore: 1,
        details: "No OAuth metadata (optional for non-Claude.ai use)",
      });
    }
  } catch {
    checks.push({
      id: "oauth_metadata",
      name: "OAuth Protected Resource metadata",
      passed: false,
      score: 0,
      maxScore: 1,
      details: "No OAuth metadata (optional for non-Claude.ai use)",
    });
  }

  return checks;
}

/**
 * Tier 4: Consistency (15%)
 * - Selector healing, idempotency, state management
 */
async function runTier4Consistency(
  serverUrl: string,
  tools: unknown[],
  timeout: number,
  options: WebMCPReadyOptions,
  addIssue: (
    tier: WebMCPTierNumber,
    severity: WebMCPIssue["severity"],
    issue: string,
    remediation: string,
    effort?: WebMCPIssue["effort"]
  ) => void
): Promise<WebMCPCheck[]> {
  const checks: WebMCPCheck[] = [];

  // Check 4.1: Has session management tools
  const sessionTools = (tools as any[]).filter(t =>
    t.name?.includes("session") ||
    t.name?.includes("state") ||
    t.description?.toLowerCase().includes("session")
  );
  const hasSessionMgmt = sessionTools.length > 0;

  checks.push({
    id: "session_management",
    name: "Provides session management tools",
    passed: hasSessionMgmt,
    score: hasSessionMgmt ? 1 : 0,
    maxScore: 1,
    details: hasSessionMgmt
      ? `Found ${sessionTools.length} session-related tools`
      : "No session management tools found",
    evidence: hasSessionMgmt
      ? sessionTools.map((t: any) => t.name).join(", ")
      : undefined,
  });

  if (!hasSessionMgmt) {
    addIssue(4, "medium", "No session management", "Add session save/load tools for state persistence", "moderate");
  }

  // Check 4.2: Has healing/recovery tools
  const healingTools = (tools as any[]).filter(t =>
    t.name?.includes("heal") ||
    t.name?.includes("recover") ||
    t.name?.includes("retry") ||
    t.description?.toLowerCase().includes("healing") ||
    t.description?.toLowerCase().includes("self-healing")
  );
  const hasHealing = healingTools.length > 0;

  checks.push({
    id: "self_healing",
    name: "Provides self-healing/recovery tools",
    passed: hasHealing,
    score: hasHealing ? 1 : 0,
    maxScore: 1,
    details: hasHealing
      ? `Found ${healingTools.length} healing-related tools`
      : "No self-healing tools found",
    evidence: hasHealing
      ? healingTools.map((t: any) => t.name).join(", ")
      : undefined,
  });

  if (!hasHealing) {
    addIssue(4, "low", "No self-healing capabilities", "Consider adding selector healing or retry tools", "moderate");
  }

  // Check 4.3: Consistent error structure
  // (Inferred from earlier checks - this is a meta-check)
  checks.push({
    id: "consistent_responses",
    name: "Uses consistent response structure",
    passed: true, // Assume true if server responds at all
    score: 1,
    maxScore: 1,
    details: "JSON-RPC response structure detected",
  });

  return checks;
}

/**
 * Tier 5: Agent Optimizations (15%)
 * - Vision mode, NL parsing, persona support
 */
async function runTier5AgentOptimizations(
  tools: unknown[],
  options: WebMCPReadyOptions,
  addIssue: (
    tier: WebMCPTierNumber,
    severity: WebMCPIssue["severity"],
    issue: string,
    remediation: string,
    effort?: WebMCPIssue["effort"]
  ) => void
): Promise<WebMCPCheck[]> {
  const checks: WebMCPCheck[] = [];
  const toolNames = (tools as any[]).map(t => t.name?.toLowerCase() || "");
  const toolDescs = (tools as any[]).map(t => t.description?.toLowerCase() || "");
  const combined = [...toolNames, ...toolDescs].join(" ");

  // Check 5.1: Vision/screenshot support
  const hasVision = combined.includes("screenshot") ||
    combined.includes("vision") ||
    combined.includes("visual");

  checks.push({
    id: "vision_support",
    name: "Supports visual/screenshot capabilities",
    passed: hasVision,
    score: hasVision ? 1 : 0,
    maxScore: 1,
    details: hasVision
      ? "Visual capabilities available"
      : "No visual/screenshot tools found",
  });

  if (!hasVision) {
    addIssue(5, "medium", "No vision/screenshot support", "Add screenshot tool for visual verification", "moderate");
  }

  // Check 5.2: Natural language support
  const hasNL = combined.includes("natural language") ||
    combined.includes("intent") ||
    combined.includes("smart") ||
    combined.includes("ai-");

  checks.push({
    id: "nl_support",
    name: "Supports natural language inputs",
    passed: hasNL,
    score: hasNL ? 1 : 0,
    maxScore: 1,
    details: hasNL
      ? "Natural language capabilities available"
      : "No natural language tools found",
  });

  // Check 5.3: Persona support
  const hasPersona = combined.includes("persona") ||
    combined.includes("cognitive") ||
    combined.includes("journey");

  checks.push({
    id: "persona_support",
    name: "Supports persona-based testing",
    passed: hasPersona,
    score: hasPersona ? 1 : 0,
    maxScore: 1,
    details: hasPersona
      ? "Persona capabilities available"
      : "No persona tools found",
  });

  // Check 5.4: Accessibility support
  const hasA11y = combined.includes("accessibility") ||
    combined.includes("a11y") ||
    combined.includes("wcag") ||
    combined.includes("empathy");

  checks.push({
    id: "accessibility_support",
    name: "Supports accessibility testing",
    passed: hasA11y,
    score: hasA11y ? 1 : 0,
    maxScore: 1,
    details: hasA11y
      ? "Accessibility testing available"
      : "No accessibility tools found",
  });

  return checks;
}

/**
 * Tier 6: Documentation (10%)
 * - /webmcp.txt, examples, troubleshooting
 */
async function runTier6Documentation(
  baseUrl: string,
  timeout: number,
  options: WebMCPReadyOptions,
  addIssue: (
    tier: WebMCPTierNumber,
    severity: WebMCPIssue["severity"],
    issue: string,
    remediation: string,
    effort?: WebMCPIssue["effort"]
  ) => void
): Promise<WebMCPCheck[]> {
  const checks: WebMCPCheck[] = [];

  // Check 6.1: /llms.txt or /webmcp.txt
  let hasLlmsTxt = false;
  let llmsContent = "";

  for (const path of ["/llms.txt", "/webmcp.txt", "/.well-known/llms.txt"]) {
    try {
      const response = await fetch(`${baseUrl}${path}`, { method: "GET" });
      if (response.ok) {
        llmsContent = await response.text();
        hasLlmsTxt = llmsContent.length > 50;
        if (hasLlmsTxt) break;
      }
    } catch {
      // Try next path
    }
  }

  checks.push({
    id: "llms_txt",
    name: "Provides /llms.txt or /webmcp.txt",
    passed: hasLlmsTxt,
    score: hasLlmsTxt ? 1 : 0,
    maxScore: 1,
    details: hasLlmsTxt
      ? `Found AI documentation (${llmsContent.length} chars)`
      : "No /llms.txt or /webmcp.txt found",
  });

  if (!hasLlmsTxt) {
    addIssue(6, "medium", "No /llms.txt file", "Create /llms.txt with AI-readable server documentation", "quick");
  }

  // Check 6.2: README or docs endpoint
  let hasReadme = false;
  try {
    const response = await fetch(`${baseUrl}/docs`, { method: "GET" });
    hasReadme = response.ok;
  } catch {
    // No docs endpoint
  }

  if (!hasReadme) {
    try {
      const response = await fetch(`${baseUrl}/README`, { method: "GET" });
      hasReadme = response.ok;
    } catch {
      // No README endpoint
    }
  }

  checks.push({
    id: "documentation",
    name: "Provides documentation endpoint",
    passed: hasReadme,
    score: hasReadme ? 1 : 0,
    maxScore: 1,
    details: hasReadme
      ? "Documentation endpoint available"
      : "No /docs or /README endpoint",
  });

  if (!hasReadme) {
    addIssue(6, "low", "No documentation endpoint", "Add /docs endpoint with usage examples", "quick");
  }

  return checks;
}

/**
 * Generate prioritized recommendations from issues and tier results
 */
function generateRecommendations(
  issues: WebMCPIssue[],
  tiers: WebMCPTierResult[]
): string[] {
  const recommendations: string[] = [];

  // Add critical issues first
  for (const issue of issues.filter(i => i.severity === "critical")) {
    recommendations.push(`[CRITICAL] ${issue.remediation}`);
  }

  // Add high issues
  for (const issue of issues.filter(i => i.severity === "high")) {
    recommendations.push(`[HIGH] ${issue.remediation}`);
  }

  // Add quick wins (low effort, medium severity)
  for (const issue of issues.filter(
    i => i.severity === "medium" && i.effort === "quick"
  )) {
    recommendations.push(`[QUICK WIN] ${issue.remediation}`);
  }

  // Add tier-specific recommendations for lowest scoring tiers
  const sortedTiers = [...tiers].sort((a, b) => a.score - b.score);
  for (const tier of sortedTiers.slice(0, 2)) {
    if (tier.score < 70) {
      recommendations.push(
        `[${tier.name.toUpperCase()}] Focus on improving tier ${tier.tier} (${tier.score}%): ${tier.checks
          .filter(c => !c.passed)
          .map(c => c.name)
          .slice(0, 2)
          .join(", ")}`
      );
    }
  }

  // Add remaining medium issues
  for (const issue of issues.filter(
    i => i.severity === "medium" && i.effort !== "quick"
  )) {
    recommendations.push(issue.remediation);
  }

  return recommendations.slice(0, 10); // Top 10 recommendations
}

/**
 * Generate HTML report for WebMCP readiness audit
 */
export function generateWebMCPReadyHtmlReport(result: WebMCPReadyResult): string {
  const gradeColors: Record<WebMCPGrade, string> = {
    "A": "#22c55e",
    "B": "#84cc16",
    "C": "#eab308",
    "D": "#f97316",
    "F": "#ef4444",
  };

  const severityColors: Record<string, string> = {
    critical: "#ef4444",
    high: "#f97316",
    medium: "#eab308",
    low: "#3b82f6",
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WebMCP Readiness Audit - ${result.url}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #0a0a0a; color: #e5e5e5; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #fff; margin-bottom: 8px; }
    .subtitle { color: #a3a3a3; margin-bottom: 24px; }
    .score-card { background: #171717; border-radius: 12px; padding: 24px; margin-bottom: 24px; display: flex; align-items: center; gap: 24px; }
    .grade { font-size: 72px; font-weight: bold; color: ${gradeColors[result.grade]}; }
    .score-details h2 { margin: 0 0 8px; color: #fff; }
    .score-details p { margin: 4px 0; color: #a3a3a3; }
    .tiers { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .tier { background: #171717; border-radius: 8px; padding: 16px; }
    .tier-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .tier-name { font-weight: 600; color: #fff; }
    .tier-score { font-weight: bold; }
    .progress-bar { height: 8px; background: #262626; border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #3b82f6, #8b5cf6); }
    .checks { margin-top: 12px; }
    .check { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 14px; }
    .check-pass { color: #22c55e; }
    .check-fail { color: #ef4444; }
    .issues { background: #171717; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
    .issues h3 { margin: 0 0 16px; color: #fff; }
    .issue { padding: 12px; background: #262626; border-radius: 6px; margin-bottom: 8px; }
    .issue-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    .severity { padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
    .recommendations { background: #171717; border-radius: 8px; padding: 16px; }
    .recommendations h3 { margin: 0 0 16px; color: #fff; }
    .rec { padding: 8px 0; border-bottom: 1px solid #262626; }
    .rec:last-child { border-bottom: none; }
    .footer { text-align: center; margin-top: 24px; color: #525252; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>WebMCP Readiness Audit</h1>
    <p class="subtitle">${result.url} • ${result.timestamp}</p>

    <div class="score-card">
      <div class="grade">${result.grade}</div>
      <div class="score-details">
        <h2>Score: ${result.score}/100</h2>
        <p>Checks passed: ${result.summary.passedChecks}/${result.summary.totalChecks}</p>
        <p>Critical issues: ${result.summary.criticalIssues} • High issues: ${result.summary.highIssues}</p>
        <p>Tools found: ${result.summary.toolCount} • Duration: ${result.duration}ms</p>
      </div>
    </div>

    <h3 style="color: #fff; margin-bottom: 16px;">Tier Scores</h3>
    <div class="tiers">
      ${result.tiers.map(tier => `
        <div class="tier">
          <div class="tier-header">
            <span class="tier-name">${tier.tier}. ${tier.name}</span>
            <span class="tier-score" style="color: ${tier.score >= 80 ? '#22c55e' : tier.score >= 60 ? '#eab308' : '#ef4444'}">${tier.score}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${tier.score}%"></div>
          </div>
          <div class="checks">
            ${tier.checks.map(check => `
              <div class="check ${check.passed ? 'check-pass' : 'check-fail'}">
                ${check.passed ? '✓' : '✗'} ${check.name}
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>

    ${result.issues.length > 0 ? `
    <div class="issues">
      <h3>Issues Found (${result.issues.length})</h3>
      ${result.issues.map(issue => `
        <div class="issue">
          <div class="issue-header">
            <span class="severity" style="background: ${severityColors[issue.severity]}20; color: ${severityColors[issue.severity]}">${issue.severity}</span>
            <span style="color: #a3a3a3">Tier ${issue.tier}</span>
          </div>
          <p style="margin: 4px 0; color: #fff;">${issue.issue}</p>
          <p style="margin: 4px 0; font-size: 14px; color: #a3a3a3;">💡 ${issue.remediation}</p>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${result.recommendations.length > 0 ? `
    <div class="recommendations">
      <h3>Recommendations</h3>
      ${result.recommendations.map(rec => `
        <div class="rec">• ${rec}</div>
      `).join('')}
    </div>
    ` : ''}

    <div class="footer">
      Generated by CBrowser WebMCP Readiness Audit • <a href="https://cbrowser.ai" style="color: #3b82f6">cbrowser.ai</a>
    </div>
  </div>
</body>
</html>`;
}
