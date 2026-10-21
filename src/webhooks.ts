/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Webhooks configured with `cbrowser webhook add`, and the sender.
 *
 * `webhook add` wrote webhooks.json and nothing ever read it except `webhook
 * list` and `webhook test`: no command sent test.fail or journey.complete, so a
 * configured webhook never fired (audit O17, 2026-10-21). test-suite now sends
 * test.pass or test.fail once per run. Events nothing sends are refused at
 * `webhook add` rather than stored to wait forever.
 *
 * Sending never fails the run it reports on: one POST per webhook, JSON, a
 * 10 s timeout, no retries, and a failure is a stderr warning that names the
 * webhook, never its URL (a Slack or Discord URL is itself the credential).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Events a command sends. test-suite sends one of these per run. */
export const SENT_WEBHOOK_EVENTS = ["test.pass", "test.fail"] as const;
export type SentWebhookEvent = (typeof SENT_WEBHOOK_EVENTS)[number];

export const WEBHOOK_FORMATS = ["generic", "slack", "discord"] as const;

export interface StoredWebhook {
  name: string;
  url: string;
  events: string[];
  format: string;
}

export const WEBHOOK_TIMEOUT_MS = 10_000;

export function webhooksPath(dataDir: string): string {
  return join(dataDir, "webhooks.json");
}

/** The configured webhooks; none when the file is missing or unreadable. */
export function loadWebhooks(dataDir: string): StoredWebhook[] {
  const path = webhooksPath(dataDir);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return Array.isArray(parsed) ? (parsed as StoredWebhook[]) : [];
  } catch {
    return [];
  }
}

/**
 * Why a URL cannot be a webhook, or null when it can. Only http and https, and
 * no user name or password in the URL: those would be sent on every event and
 * printed by `webhook list`.
 */
export function webhookUrlProblem(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `"${url}" is not a URL`;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `webhook URLs must be http or https, not ${parsed.protocol.replace(/:$/, "")}`;
  }
  if (parsed.username || parsed.password) {
    return "a webhook URL must not carry a user name or password";
  }
  return null;
}

/** What a test-suite run reports. */
export interface TestRunEvent {
  suite: string;
  summary: { total: number; passed: number; failed: number; skipped: number };
  failedTests: Array<{ name: string; error?: string }>;
}

/** The request body for one webhook format. */
export function webhookBody(format: string, event: SentWebhookEvent, run: TestRunEvent, timestamp: string): unknown {
  const { suite, summary, failedTests } = run;
  const text = `CBrowser test-suite "${suite}": ${summary.passed}/${summary.total} passed`
    + (failedTests.length > 0 ? `. Failed: ${failedTests.map((t) => t.name).join(", ")}` : "");
  if (format === "slack") return { text };
  if (format === "discord") return { content: text };
  return { event, suite, summary, failedTests, timestamp };
}

export interface WebhookSendResult {
  sent: string[];
  failed: Array<{ name: string; reason: string }>;
}

/**
 * POST the event to every webhook subscribed to it. Never throws: each failure
 * is collected and, unless `quiet`, printed to stderr as a warning.
 */
export async function sendWebhookEvent(
  dataDir: string,
  event: SentWebhookEvent,
  run: TestRunEvent,
  options: { timeoutMs?: number; quiet?: boolean } = {},
): Promise<WebhookSendResult> {
  const result: WebhookSendResult = { sent: [], failed: [] };
  const timestamp = new Date().toISOString();
  for (const hook of loadWebhooks(dataDir)) {
    if (!Array.isArray(hook.events) || !hook.events.includes(event)) continue;
    const problem = typeof hook.url === "string" ? webhookUrlProblem(hook.url) : "it has no URL";
    let reason: string | null = problem;
    if (!problem) {
      try {
        const response = await fetch(hook.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(webhookBody(hook.format, event, run, timestamp)),
          redirect: "error",
          signal: AbortSignal.timeout(options.timeoutMs ?? WEBHOOK_TIMEOUT_MS),
        });
        reason = response.ok ? null : `HTTP ${response.status}`;
      } catch (e) {
        const err = e as Error;
        reason = err.name === "TimeoutError"
          ? `no answer in ${(options.timeoutMs ?? WEBHOOK_TIMEOUT_MS) / 1000}s`
          : err.message.split(hook.url).join("<url>");
      }
    }
    if (reason === null) {
      result.sent.push(hook.name);
    } else {
      result.failed.push({ name: hook.name, reason });
      if (!options.quiet) console.error(`Warning: webhook "${hook.name}" (${event}) was not delivered: ${reason}`);
    }
  }
  return result;
}
