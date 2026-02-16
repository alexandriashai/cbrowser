/**
 * Tests for Tool Invocation Audit Wrapper
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * @license MIT
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createAuditContext,
  wrapToolHandler,
  redactSensitiveParams,
  getToolZone,
  readAuditEntries,
  getAuditStats,
  type ToolHandler,
} from "../src/security/audit-wrapper.js";

describe("redactSensitiveParams", () => {
  test("redacts password fields", () => {
    const result = redactSensitiveParams({
      username: "user",
      password: "secret123",
    });
    expect(result.username).toBe("user");
    expect(result.password).toBe("[REDACTED]");
  });

  test("redacts nested sensitive fields", () => {
    const result = redactSensitiveParams({
      config: {
        apiKey: "abc123",
        host: "example.com",
      },
    });
    expect((result.config as Record<string, unknown>).apiKey).toBe("[REDACTED]");
    expect((result.config as Record<string, unknown>).host).toBe("example.com");
  });

  test("redacts sensitive fields in arrays", () => {
    const result = redactSensitiveParams({
      credentials: [
        { token: "secret1", name: "cred1" },
        { token: "secret2", name: "cred2" },
      ],
    });
    const creds = result.credentials as Array<Record<string, unknown>>;
    expect(creds[0].token).toBe("[REDACTED]");
    expect(creds[0].name).toBe("cred1");
    expect(creds[1].token).toBe("[REDACTED]");
    expect(creds[1].name).toBe("cred2");
  });

  test("handles case insensitivity", () => {
    const result = redactSensitiveParams({
      PASSWORD: "secret",
      ApiKey: "key",
      auth_token: "token",
    });
    expect(result.PASSWORD).toBe("[REDACTED]");
    expect(result.ApiKey).toBe("[REDACTED]");
    expect(result.auth_token).toBe("[REDACTED]");
  });

  test("preserves non-sensitive fields", () => {
    const result = redactSensitiveParams({
      url: "https://example.com",
      timeout: 5000,
      enabled: true,
    });
    expect(result.url).toBe("https://example.com");
    expect(result.timeout).toBe(5000);
    expect(result.enabled).toBe(true);
  });
});

describe("getToolZone", () => {
  test("returns green for read-only tools", () => {
    expect(getToolZone("screenshot")).toBe("green");
    expect(getToolZone("status")).toBe("green");
    expect(getToolZone("extract")).toBe("green");
  });

  test("returns yellow for state-modifying tools", () => {
    expect(getToolZone("navigate")).toBe("yellow");
    expect(getToolZone("click")).toBe("yellow");
    expect(getToolZone("fill")).toBe("yellow");
  });

  test("returns red for sensitive tools", () => {
    expect(getToolZone("set_api_key")).toBe("red");
    expect(getToolZone("clear_api_key")).toBe("red");
  });

  test("defaults to yellow for unknown tools", () => {
    expect(getToolZone("unknown_tool")).toBe("yellow");
  });
});

describe("wrapToolHandler", () => {
  let tempDir: string;
  let context: ReturnType<typeof createAuditContext>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cbrowser-audit-test-"));
    context = createAuditContext({
      auditDir: tempDir,
      sessionId: "test-session",
    });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  test("logs successful tool invocations", async () => {
    const handler: ToolHandler = async ({ url }) => ({
      content: [{ type: "text", text: `Navigated to ${url}` }],
    });

    const wrapped = wrapToolHandler(handler, "navigate", context);
    const result = await wrapped({ url: "https://example.com" });

    expect(result.content[0].text).toBe("Navigated to https://example.com");

    const entries = readAuditEntries(tempDir);
    expect(entries.length).toBe(1);
    expect(entries[0].tool).toBe("navigate");
    expect(entries[0].result).toBe("success");
    expect(entries[0].sessionId).toBe("test-session");
    expect(entries[0].parameters.url).toBe("https://example.com");
    expect(entries[0].duration).toBeGreaterThanOrEqual(0);
  });

  test("logs failed tool invocations", async () => {
    const handler: ToolHandler = async () => {
      throw new Error("Navigation failed");
    };

    const wrapped = wrapToolHandler(handler, "navigate", context);

    await expect(wrapped({ url: "https://example.com" })).rejects.toThrow("Navigation failed");

    const entries = readAuditEntries(tempDir);
    expect(entries.length).toBe(1);
    expect(entries[0].result).toBe("failure");
    expect(entries[0].error).toBe("Navigation failed");
  });

  test("redacts sensitive parameters in logs", async () => {
    const handler: ToolHandler = async () => ({
      content: [{ type: "text", text: "OK" }],
    });

    const wrapped = wrapToolHandler(handler, "fill", context);
    await wrapped({ selector: "#password", value: "secret123", password: "also_secret" });

    const entries = readAuditEntries(tempDir);
    expect(entries[0].parameters.selector).toBe("#password");
    expect(entries[0].parameters.value).toBe("secret123"); // Not redacted (key doesn't match)
    expect(entries[0].parameters.password).toBe("[REDACTED]");
  });

  test("respects enabled flag", async () => {
    const disabledContext = createAuditContext({
      auditDir: tempDir,
      enabled: false,
    });

    const handler: ToolHandler = async () => ({
      content: [{ type: "text", text: "OK" }],
    });

    const wrapped = wrapToolHandler(handler, "navigate", disabledContext);
    await wrapped({ url: "https://example.com" });

    const entries = readAuditEntries(tempDir);
    expect(entries.length).toBe(0);
  });
});

describe("getAuditStats", () => {
  let tempDir: string;
  let context: ReturnType<typeof createAuditContext>;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cbrowser-audit-test-"));
    context = createAuditContext({
      auditDir: tempDir,
      sessionId: "test-session",
    });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  test("computes statistics correctly", async () => {
    const successHandler: ToolHandler = async () => ({
      content: [{ type: "text", text: "OK" }],
    });
    const failHandler: ToolHandler = async () => {
      throw new Error("Failed");
    };

    const wrappedSuccess = wrapToolHandler(successHandler, "screenshot", context);
    const wrappedFail = wrapToolHandler(failHandler, "click", context);

    await wrappedSuccess({});
    await wrappedSuccess({});
    try {
      await wrappedFail({});
    } catch { /* expected */ }

    const stats = getAuditStats(tempDir);

    expect(stats.totalInvocations).toBe(3);
    expect(stats.successCount).toBe(2);
    expect(stats.failureCount).toBe(1);
    expect(stats.byTool.screenshot).toBe(2);
    expect(stats.byTool.click).toBe(1);
    expect(stats.byZone.green).toBe(2); // screenshot is green
    expect(stats.byZone.yellow).toBe(1); // click is yellow
    expect(stats.sessions).toContain("test-session");
  });
});
