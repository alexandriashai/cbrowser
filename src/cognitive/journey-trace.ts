/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */


/**
 * Journey Trace Module
 *
 * Per-step decision recording + LLM-free deterministic replay for cognitive
 * journeys. A journey run with `trace: true` appends one JSONL line per step
 * to `<dataDir>/traces/<journeyId>.jsonl`; a later run with `replayTrace`
 * pointing at that file replays the recorded decisions without calling the
 * Anthropic API. The page-state hash recorded per step guards replay: if the
 * live page stops matching the recorded run, replay throws
 * TraceDivergenceError instead of silently continuing with stale decisions.
 *
 * Privacy: trace files never contain raw HTML, page content, or secrets —
 * page state is persisted only as a sha256 hash, and every string field is
 * redacted before it touches disk.
 *
 * @module cognitive/journey-trace
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { getDataDir } from "../config.js";

/** Context available at the moment a per-step decision is needed. */
export interface StepContext {
  /** 1-based step number within the journey */
  stepIndex: number;
  /** sha256 of the step's page state — see hashPageState() */
  pageStateHash: string;
  /** Persona name the journey is running as */
  persona: string;
  /** Journey system prompt (persona + goal + thresholds) */
  systemPrompt: string;
  /** Conversation history, including the current step's user prompt */
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

/**
 * Source of per-step decisions. The default implementation (built inside
 * runCognitiveJourney) calls the Anthropic API; TraceReplayProvider serves
 * recorded decisions; tests inject deterministic fakes.
 */
export interface DecisionProvider {
  decide(ctx: StepContext): Promise<string>;
  /** Why the last decision's reply could not be read, if the provider knows more than the text shows. */
  describeLastReply?(): string | undefined;
}

/** One recorded decision — a single JSONL line in the trace file. */
export interface TraceStep {
  step: number;
  pageStateHash: string;
  persona: string;
  decision: string;
  ts: string;
}

/**
 * Hash a step's page state. Record and replay MUST call this with the same
 * inputs (current URL + extracted page content) or every replay diverges.
 * The raw page state never touches disk — only this hash is persisted.
 */
export function hashPageState(url: string, pageContent: string): string {
  return createHash("sha256").update(`${url}\n${pageContent}`).digest("hex");
}

// Anything shaped like an sk- secret key (Anthropic API keys etc.). Trace
// files may leave the machine, so this is scrubbed from every string field.
const SECRET_PATTERN = /sk-[A-Za-z0-9\-_]{10,}/g;
// Markup tags (`<html>`, `</body>`, `<!doctype ...>`) — traces store
// decisions and hashes, never raw HTML. Requires a letter/!// after `<` so
// prose like "progress < 0.3 and patience > 0.5" survives intact.
const HTML_TAG_PATTERN = /<\/?[a-zA-Z!][^>]*>/g;

function redact(text: string): string {
  return text.replace(SECRET_PATTERN, "[REDACTED]").replace(HTML_TAG_PATTERN, "");
}

/**
 * Opt-in JSONL trace writer. Constructed only when a journey runs with
 * `trace: true` — when tracing is off, no writer exists and nothing is
 * written. Appends one redacted TraceStep per line.
 */
export class JourneyTraceWriter {
  /** Path of the JSONL trace file this writer appends to. */
  readonly filePath: string;

  constructor(opts?: { journeyId?: string; dataDir?: string }) {
    const journeyId =
      opts?.journeyId ||
      `journey-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tracesDir = join(opts?.dataDir || getDataDir(), "traces");
    mkdirSync(tracesDir, { recursive: true });
    this.filePath = join(tracesDir, `${journeyId}.jsonl`);
  }

  /** Append one decision to the trace. String fields are redacted first. */
  record(step: TraceStep): void {
    const safe: TraceStep = {
      step: step.step,
      pageStateHash: step.pageStateHash,
      persona: redact(step.persona),
      decision: redact(step.decision),
      ts: step.ts,
    };
    appendFileSync(this.filePath, JSON.stringify(safe) + "\n");
  }
}

/**
 * Thrown by TraceReplayProvider when the live journey no longer matches the
 * recorded run — either the page-state hash differs at a step, or the journey
 * ran past the end of the trace. Replay never silently continues.
 */
export class TraceDivergenceError extends Error {
  readonly divergedAtStep: number;
  readonly expectedHash?: string;
  readonly actualHash?: string;

  constructor(
    divergedAtStep: number,
    detail: string,
    expectedHash?: string,
    actualHash?: string
  ) {
    super(`Trace diverged at step ${divergedAtStep}: ${detail}`);
    this.name = "TraceDivergenceError";
    this.divergedAtStep = divergedAtStep;
    this.expectedHash = expectedHash;
    this.actualHash = actualHash;
  }
}

/**
 * DecisionProvider that replays a recorded trace file — no API key, no
 * network. Each decide() call is checked against the recorded page-state
 * hash for that step before the recorded decision is returned.
 */
export class TraceReplayProvider implements DecisionProvider {
  private readonly steps = new Map<number, TraceStep>();

  constructor(tracePath: string) {
    if (!existsSync(tracePath)) {
      throw new Error(`Trace file not found: ${tracePath}`);
    }
    for (const line of readFileSync(tracePath, "utf-8").split("\n")) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line) as TraceStep;
      this.steps.set(parsed.step, parsed);
    }
  }

  async decide(ctx: StepContext): Promise<string> {
    const recorded = this.steps.get(ctx.stepIndex);
    if (!recorded) {
      throw new TraceDivergenceError(
        ctx.stepIndex,
        "no recorded decision for this step (journey ran past the end of the trace)"
      );
    }
    if (recorded.pageStateHash !== ctx.pageStateHash) {
      throw new TraceDivergenceError(
        ctx.stepIndex,
        "page state differs from the recorded run",
        recorded.pageStateHash,
        ctx.pageStateHash
      );
    }
    return recorded.decision;
  }
}
