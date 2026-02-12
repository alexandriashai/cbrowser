/**
 * CBrowser MCP Tools - Testing Tools
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { z } from "zod";
import type { McpServer } from "../types.js";
import {
  runNLTestSuite,
  parseNLTestSuite,
  dryRunNLTestSuite,
  repairTest,
  detectFlakyTests,
  generateCoverageMap,
} from "../../testing/index.js";
import type { NLTestCase, NLTestStep } from "../../types.js";

/**
 * Register testing tools (5 tools: nl_test_file, nl_test_inline, repair_test, detect_flaky_tests, coverage_map)
 */
export function registerTestingTools(server: McpServer): void {
  server.tool(
    "nl_test_file",
    "Run natural language test suite from a file. Returns step-level results with enriched error info, partial matches, and suggestions.",
    {
      filepath: z.string().describe("Path to the test file"),
      dryRun: z.boolean().optional().describe("Parse and display steps without executing"),
      fuzzyMatch: z.boolean().optional().describe("Use case-insensitive fuzzy matching for assertions"),
    },
    async ({ filepath, dryRun, fuzzyMatch }) => {
      const fs = await import("fs");
      if (!fs.existsSync(filepath)) {
        return { content: [{ type: "text", text: JSON.stringify({ error: `Test file not found: ${filepath}` }) }] };
      }
      const fileContent = fs.readFileSync(filepath, "utf-8");
      const suiteName = filepath.split("/").pop()?.replace(/\.[^.]+$/, "") || "Test Suite";
      const suite = parseNLTestSuite(fileContent, suiteName);

      if (dryRun) {
        const dryResult = dryRunNLTestSuite(suite);
        return { content: [{ type: "text", text: JSON.stringify(dryResult, null, 2) }] };
      }

      const result = await runNLTestSuite(suite, { fuzzyMatch: fuzzyMatch || false });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name: result.name,
              total: result.summary.total,
              passed: result.summary.passed,
              failed: result.summary.failed,
              passRate: `${result.summary.passRate.toFixed(1)}%`,
              totalSteps: result.summary.totalSteps,
              passedSteps: result.summary.passedSteps,
              failedSteps: result.summary.failedSteps,
              stepPassRate: result.summary.stepPassRate ? `${result.summary.stepPassRate.toFixed(1)}%` : undefined,
              duration: result.duration,
              recommendations: result.recommendations,
              testResults: result.testResults.map(t => ({
                name: t.name,
                passed: t.passed,
                duration: t.duration,
                error: t.error,
                steps: t.stepResults.map(s => ({
                  instruction: s.instruction,
                  parsed: s.parsed,
                  passed: s.passed,
                  duration: s.duration,
                  error: s.error,
                  actualValue: s.actualValue,
                })),
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "nl_test_inline",
    "Run natural language tests from inline content. Returns step-level results with enriched error info, partial matches, and suggestions.",
    {
      content: z.string().describe("Test content with instructions like 'go to https://...' and 'click login'"),
      name: z.string().optional().describe("Name for the test suite"),
      dryRun: z.boolean().optional().describe("Parse and display steps without executing"),
      fuzzyMatch: z.boolean().optional().describe("Use case-insensitive fuzzy matching for assertions"),
    },
    async ({ content, name, dryRun, fuzzyMatch }) => {
      const suite = parseNLTestSuite(content, name || "Inline Test");

      if (dryRun) {
        const dryResult = dryRunNLTestSuite(suite);
        return { content: [{ type: "text", text: JSON.stringify(dryResult, null, 2) }] };
      }

      const result = await runNLTestSuite(suite, { fuzzyMatch: fuzzyMatch || false });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name: result.name,
              total: result.summary.total,
              passed: result.summary.passed,
              failed: result.summary.failed,
              passRate: `${result.summary.passRate.toFixed(1)}%`,
              totalSteps: result.summary.totalSteps,
              passedSteps: result.summary.passedSteps,
              failedSteps: result.summary.failedSteps,
              stepPassRate: result.summary.stepPassRate ? `${result.summary.stepPassRate.toFixed(1)}%` : undefined,
              duration: result.duration,
              recommendations: result.recommendations,
              testResults: result.testResults.map(t => ({
                name: t.name,
                passed: t.passed,
                duration: t.duration,
                error: t.error,
                steps: t.stepResults.map(s => ({
                  instruction: s.instruction,
                  parsed: s.parsed,
                  passed: s.passed,
                  duration: s.duration,
                  error: s.error,
                  actualValue: s.actualValue,
                })),
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "repair_test",
    "AI-powered test repair for broken tests",
    {
      testName: z.string().describe("Name for the test"),
      steps: z.array(z.string()).describe("Test step instructions"),
      autoApply: z.boolean().optional().describe("Automatically apply repairs"),
    },
    async ({ testName, steps, autoApply }) => {
      const testCase: NLTestCase = {
        name: testName,
        steps: steps.map(instruction => ({
          instruction,
          action: "unknown" as NLTestStep["action"],
        })),
      };
      const result = await repairTest(testCase, { autoApply: autoApply || false });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              originalTest: result.originalTest.name,
              failedSteps: result.failedSteps,
              repairedSteps: result.repairedSteps,
              repairedTestPasses: result.repairedTestPasses,
              repairs: result.failureAnalyses.map(a => ({
                step: a.step.instruction,
                error: a.error,
                suggestion: a.suggestions[0]?.suggestedInstruction || "No suggestion",
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "detect_flaky_tests",
    "Detect flaky/unreliable tests by running multiple times",
    {
      testContent: z.string().describe("Test content to analyze"),
      runs: z.number().optional().default(5).describe("Number of times to run each test"),
      threshold: z.number().optional().default(20).describe("Flakiness threshold percentage"),
    },
    async ({ testContent, runs, threshold }) => {
      const suite = parseNLTestSuite(testContent, "Flaky Test Analysis");
      const result = await detectFlakyTests(suite, { runs, flakinessThreshold: threshold });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              suiteName: result.suiteName,
              totalTests: result.summary.totalTests,
              stablePass: result.summary.stablePassTests,
              stableFail: result.summary.stableFailTests,
              flakyTests: result.summary.flakyTests,
              overallFlakiness: `${result.summary.overallFlakinessScore.toFixed(1)}%`,
              analyses: result.testAnalyses.map(a => ({
                test: a.testName,
                classification: a.classification,
                passRate: `${((a.passCount / a.totalRuns) * 100).toFixed(0)}%`,
                flakiness: `${a.flakinessScore}%`,
              })),
            }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "coverage_map",
    "Generate test coverage map for a site",
    {
      baseUrl: z.string().url().describe("Base URL to analyze"),
      testFiles: z.array(z.string()).describe("Array of test file paths"),
      maxPages: z.number().optional().default(100).describe("Maximum pages to crawl"),
    },
    async ({ baseUrl, testFiles, maxPages }) => {
      const result = await generateCoverageMap(baseUrl, testFiles, { maxPages });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              totalPages: result.sitePages.length,
              testedPages: result.testedPages.length,
              untestedPages: result.analysis.untestedPages,
              overallCoverage: `${result.analysis.coveragePercent.toFixed(1)}%`,
              gaps: result.gaps.slice(0, 10).map(g => ({
                url: g.page.url,
                priority: g.priority,
                reason: g.reason,
              })),
            }, null, 2),
          },
        ],
      };
    }
  );
}
