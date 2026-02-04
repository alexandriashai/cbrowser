/**
 * CBrowser Extension - MCP Server Bridge
 * Connects to remote CBrowser MCP server for headless operations
 */

import type { MCPConfig, MCPToolCall, MCPToolResult } from './types';

export class MCPBridge {
  private config: MCPConfig;
  private requestId = 0;

  constructor(config: MCPConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  /**
   * Update server configuration
   */
  updateConfig(config: Partial<MCPConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if the MCP server is reachable
   */
  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.serverUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get server info
   */
  async getInfo(): Promise<{ version: string; tools: string[] }> {
    const response = await fetch(`${this.config.serverUrl}/info`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.json();
  }

  /**
   * Call an MCP tool on the remote server
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const id = ++this.requestId;

    try {
      const response = await fetch(`${this.config.serverUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          ...(this.config.authToken
            ? { Authorization: `Bearer ${this.config.authToken}` }
            : {}),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method: 'tools/call',
          params: {
            name,
            arguments: args,
          },
        }),
        signal: AbortSignal.timeout(this.config.timeout || 30000),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();

      if (data.error) {
        return {
          success: false,
          error: data.error.message || 'Unknown MCP error',
        };
      }

      return {
        success: true,
        result: data.result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Request failed',
      };
    }
  }

  // ============================================
  // Convenience methods for common operations
  // ============================================

  /**
   * Run visual regression test
   */
  async visualRegression(
    url: string,
    baselineName: string,
    options?: { threshold?: number }
  ): Promise<MCPToolResult> {
    return this.callTool('visual_regression_test', {
      url,
      baselineName,
      ...options,
    });
  }

  /**
   * Capture visual baseline
   */
  async captureBaseline(url: string, name: string): Promise<MCPToolResult> {
    return this.callTool('visual_baseline', { url, name });
  }

  /**
   * Run natural language test suite
   */
  async runTestSuite(
    testFile: string,
    options?: { baseUrl?: string; continueOnFailure?: boolean }
  ): Promise<MCPToolResult> {
    return this.callTool('nl_test_file', { testFile, ...options });
  }

  /**
   * Run inline NL test
   */
  async runInlineTest(steps: string): Promise<MCPToolResult> {
    return this.callTool('nl_test_inline', { steps });
  }

  /**
   * A/B visual comparison
   */
  async abCompare(
    urlA: string,
    urlB: string,
    options?: { labelA?: string; labelB?: string }
  ): Promise<MCPToolResult> {
    return this.callTool('ab_comparison', { urlA, urlB, ...options });
  }

  /**
   * Cross-browser test
   */
  async crossBrowserTest(
    url: string,
    browsers?: string[]
  ): Promise<MCPToolResult> {
    return this.callTool('cross_browser_test', {
      url,
      browsers: browsers || ['chromium', 'firefox', 'webkit'],
    });
  }

  /**
   * Responsive test across viewports
   */
  async responsiveTest(
    url: string,
    viewports?: string[]
  ): Promise<MCPToolResult> {
    return this.callTool('responsive_test', {
      url,
      viewports: viewports || ['mobile', 'tablet', 'desktop'],
    });
  }

  /**
   * Hunt for bugs on a page
   */
  async huntBugs(url: string): Promise<MCPToolResult> {
    return this.callTool('hunt_bugs', { url });
  }

  /**
   * Run chaos test
   */
  async chaosTest(
    url: string,
    options?: { disableJs?: boolean; slowNetwork?: boolean }
  ): Promise<MCPToolResult> {
    return this.callTool('chaos_test', { url, ...options });
  }

  /**
   * Detect flaky tests
   */
  async detectFlakyTests(
    testFile: string,
    runs?: number
  ): Promise<MCPToolResult> {
    return this.callTool('detect_flaky_tests', {
      testFile,
      runs: runs || 5,
    });
  }

  /**
   * Repair broken test
   */
  async repairTest(testFile: string): Promise<MCPToolResult> {
    return this.callTool('repair_test', { testFile });
  }

  /**
   * Performance baseline
   */
  async capturePerformanceBaseline(
    url: string,
    name: string
  ): Promise<MCPToolResult> {
    return this.callTool('perf_baseline', { url, name });
  }

  /**
   * Performance regression check
   */
  async checkPerformanceRegression(
    url: string,
    baselineName: string
  ): Promise<MCPToolResult> {
    return this.callTool('perf_regression', { url, baselineName });
  }

  /**
   * Find element by natural language intent
   */
  async findElementByIntent(
    url: string,
    intent: string
  ): Promise<MCPToolResult> {
    return this.callTool('find_element_by_intent', { url, intent });
  }

  /**
   * Compare personas
   */
  async comparePersonas(
    url: string,
    goal: string,
    personas?: string[]
  ): Promise<MCPToolResult> {
    return this.callTool('compare_personas', {
      url,
      goal,
      personas: personas || ['power-user', 'first-timer', 'elderly-user'],
    });
  }

  /**
   * Get test coverage map
   */
  async getCoverageMap(
    baseUrl: string,
    testFiles: string[]
  ): Promise<MCPToolResult> {
    return this.callTool('coverage_map', { baseUrl, testFiles });
  }
}

// Default instance with demo server
let defaultBridge: MCPBridge | null = null;

export function getMCPBridge(): MCPBridge {
  if (!defaultBridge) {
    defaultBridge = new MCPBridge({
      serverUrl: 'https://cbrowser-mcp-demo.wyldfyre.ai',
    });
  }
  return defaultBridge;
}

export function setMCPBridge(config: MCPConfig): void {
  defaultBridge = new MCPBridge(config);
}
