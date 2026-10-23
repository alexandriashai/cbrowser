/**
 * A whole journey on the live decision path, with the Anthropic client
 * replaced: each reply opens with a non-text block, as the replies did in the
 * 2026-10-23 ucdenver.edu run where 15 of 17 steps were unreadable. Every step
 * must now read, and a named run ("ucdenver", the CLI's first word) names its
 * trace and comes back on the result.
 *
 * The SDK is replaced through mock.module, so this file is listed in
 * scripts/browser-tests.txt and runs in its own process. No request leaves
 * the machine. The CLI part replays the recorded trace (no model, no key).
 */
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const requests: unknown[] = [];
let calls = 0;
const CLICK = { phase: "decide", monologue: "Tuition should be under Pricing.", action: "click:Pricing", actionTarget: "the Pricing link", goalProgress: 0.4, mood: "hopeful", goalAchieved: false };
const FOUND = { phase: "evaluate", monologue: "There it is: $20 a credit hour.", action: null, goalProgress: 1, mood: "relieved", goalAchieved: true, goalEvidence: "$20 a credit hour", achieved: true, evidence: "$20 a credit hour" };

class FakeAnthropic {
  messages = {
    create: async (params: unknown) => {
      requests.push(params);
      calls++;
      return { stop_reason: "end_turn", content: [{ type: "thinking", thinking: "..." }, { type: "text", text: JSON.stringify(calls === 1 ? CLICK : FOUND) }] };
    },
  };
}
mock.module("@anthropic-ai/sdk", () => ({ default: FakeAnthropic, Anthropic: FakeAnthropic }));

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");
const GOAL = "find the tuition cost";
const PAGES: Record<string, string> = {
  "/": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Home</title></head>
<body><header><nav><a href="/pricing">Pricing</a></nav></header><main><h1>Welcome</h1></main></body></html>`,
  "/pricing": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Pricing</title></head>
<body><main><h1>Pricing</h1><p>Tuition: $20 a credit hour.</p></main></body></html>`,
};

let server: ReturnType<typeof Bun.serve>;
let dataDir = "";
let url = "";
const savedKey = process.env.ANTHROPIC_API_KEY;
const steps: Array<{ step: number; replyReadable: boolean }> = [];
let result: { name?: string; tracePath?: string; goalAchieved: boolean };

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    fetch: (req) => {
      const page = PAGES[new URL(req.url).pathname];
      return page ? new Response(page, { headers: { "content-type": "text/html" } }) : new Response("not found", { status: 404 });
    },
  });
  url = `http://127.0.0.1:${server.port}/`;
  dataDir = mkdtempSync(join(tmpdir(), "cb-journey-replies-"));
  process.env.CBROWSER_DATA_DIR = dataDir;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-a-key";
  const { runCognitiveJourney } = await import("../src/cognitive/index.js");
  result = await runCognitiveJourney({
    name: "ucdenver", persona: "first-timer", goal: GOAL, startUrl: url, maxSteps: 4, headless: true,
    persistent: false, vision: false, trace: true,
    onStep: (s) => { steps.push({ step: s.step, replyReadable: s.replyReadable }); },
  });
}, 240_000);

afterAll(() => {
  server?.stop(true);
  if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = savedKey;
  rmSync(dataDir, { recursive: true, force: true });
});

describe("a journey whose replies open with a non-text block", () => {
  test("went through the replaced client", () => {
    expect(requests.length).toBeGreaterThanOrEqual(2);
  });

  test("every step's reply is read, and the goal is reached", () => {
    expect(steps.length).toBeGreaterThanOrEqual(2);
    expect(steps.every((s) => s.replyReadable)).toBe(true);
    expect(result.goalAchieved).toBe(true);
  });

  test("the trace records each decision's text, not an empty string", () => {
    const lines = readFileSync(String(result.tracePath), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) expect(line.decision.length).toBeGreaterThan(0);
  });

  test("the run's name comes back on the result and names its trace", () => {
    expect(result.name).toBe("ucdenver");
    expect(basename(String(result.tracePath))).toMatch(/^journey-ucdenver-\d+-[a-z0-9]+\.jsonl$/);
  });
});

async function cli(...args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>), CBROWSER_DATA_DIR: dataDir, NO_COLOR: "1" };
  delete env.ANTHROPIC_API_KEY;
  const proc = Bun.spawn(["bun", "run", CLI, ...args], { stdout: "pipe", stderr: "pipe", env });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, code };
}

describe("cbrowser cognitive-journey <name>", () => {
  test("the first word names the run in the header", async () => {
    expect(existsSync(String(result.tracePath))).toBe(true);
    const r = await cli("cognitive-journey", "ucdenver", "--start", url, "--goal", GOAL, "--persona", "first-timer",
      "--max-steps", "4", "--no-vision", "--replay-trace", String(result.tracePath));
    expect(r.stdout).toContain("🧠 COGNITIVE JOURNEY: ucdenver");
    expect(r.stdout).toContain('💭 "Tuition should be under Pricing."');
    expect(r.stdout).not.toContain("could not be read");
  }, 240_000);

  test("a second word is refused before any browser starts", async () => {
    const r = await cli("cognitive-journey", "ucdenver", "tuition", "--start", url, "--goal", GOAL,
      "--replay-trace", String(result.tracePath));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('takes one name before its flags; got "ucdenver" "tuition"');
    expect(r.stdout).not.toContain("COGNITIVE JOURNEY");
  }, 60_000);

  test("a curly-quoted goal reaches the journey whole, with a note", async () => {
    const r = await cli("cognitive-journey", "ucdenver", "--start", url, "--goal", "“find", "the", "tuition", "cost”",
      "--persona", "first-timer", "--max-steps", "4", "--no-vision", "--replay-trace", String(result.tracePath));
    expect(r.stderr).toContain("Note: --goal was in curly quotes");
    expect(r.stdout).toContain(`Goal: "${GOAL}"`);
  }, 240_000);
});
