// ============================================================================
// --json-output contract — bun test suite
// ============================================================================
//
// Regression cover for the 2026-07-26 silent-empty-output defect.
//
// The bug: installOutputWrappers()'s JSON branch set `console.log = () => {}`
// under a comment claiming output was "captured for JSON", but nothing captured
// it, and only 2 call sites in a ~140-command CLI ever call emitJson. So
// `--json-output` made virtually every command print nothing and exit 0.
// Probed live before the fix: `navigate <file-url> --json-output` -> 0 bytes,
// exit 0; after: 577 bytes of valid JSON.
//
// The contract these tests pin: in --json-output mode stdout is ALWAYS parseable
// JSON, never empty, whether or not the command has a native JSON shape.
//
// Run:  bun test tests/json-output-contract.test.ts

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  detectOutputOptions,
  setOutputOptions,
  installOutputWrappers,
  emitJson,
  emitJsonFallback,
  hasEmittedJson,
  _resetJsonCapture,
  _capturedJsonLines,
  _captureTruncated,
  _setJsonSink,
} from "../src/output.js";

const realLog = console.log;
const realError = console.error;

/**
 * Capture the envelope. Uses the sink seam rather than spying on
 * process.stdout.write, because the emitter writes to fd 1 synchronously on
 * purpose — an exit handler cannot drain an async pipe write, which is the
 * defect this contract exists to prevent.
 */
function withStdout(fn: () => void): string {
  const chunks: string[] = [];
  _setJsonSink((text) => { chunks.push(text); });
  try { fn(); } finally { _setJsonSink(); }
  return chunks.join("");
}

beforeEach(() => {
  _resetJsonCapture();
  setOutputOptions(detectOutputOptions({ "json-output": true }));
  installOutputWrappers();
});

afterEach(() => {
  console.log = realLog;
  console.error = realError;
  setOutputOptions(detectOutputOptions({}));
  _resetJsonCapture();
});

describe("--json-output never leaves stdout empty", () => {
  test("console.log in JSON mode is captured, not discarded", () => {
    console.log("Navigated to: file:///x.html");
    console.log("  Title: Example");
    expect(_capturedJsonLines()).toEqual(["Navigated to: file:///x.html", "Title: Example"]);
  });

  test("a command that never calls emitJson still emits parseable JSON", () => {
    console.log("✓ Navigated to: file:///x.html");
    const out = withStdout(() => emitJsonFallback("navigate", "18.72.6"));
    expect(out.length).toBeGreaterThan(0);
    const parsed = JSON.parse(out);
    expect(parsed.command).toBe("navigate");
    expect(parsed.success).toBe(true);
    expect(parsed.meta.version).toBe("18.72.6");
    // The check mark is a pass marker, kept as a word since 20.0 (it used to vanish).
    expect(parsed.data.output).toContain("[PASS] Navigated to: file:///x.html");
  });

  test("a command producing NO output still emits parseable JSON, not zero bytes", () => {
    const out = withStdout(() => emitJsonFallback("silent-command", "18.72.6"));
    expect(out.trim().length).toBeGreaterThan(0);
    const parsed = JSON.parse(out);
    expect(parsed.command).toBe("silent-command");
    expect(parsed.data.output).toEqual([]);
  });

  test("the fallback does NOT double-emit over a real emitJson envelope", () => {
    const first = withStdout(() =>
      emitJson({ success: true, command: "audit", data: { score: 0.91 }, meta: { version: "18.72.6" } }),
    );
    expect(hasEmittedJson()).toBe(true);
    const second = withStdout(() => emitJsonFallback("audit", "18.72.6"));
    expect(second).toBe("");
    expect(JSON.parse(first).data.score).toBe(0.91);
  });

  test("decorations are stripped from captured lines (screen-reader contract)", () => {
    console.log("✓ \x1b[32mdone\x1b[0m ━━━");
    const lines = _capturedJsonLines();
    expect(lines[0]).not.toContain("\x1b[");
    expect(lines[0]).not.toContain("━");
    expect(lines[0]).toContain("done");
  });

  test("blank lines are not captured as empty entries", () => {
    console.log("real line");
    console.log("");
    console.log("   ");
    expect(_capturedJsonLines()).toEqual(["real line"]);
  });
});

// --------------------------------------------------------------------------
// Found by the 2026-07-26 cross-vendor audit OF THIS FIX. The first version of
// emitJsonFallback hardcoded `success: true`, so `personas --json-output` exited
// 1 while the envelope claimed success — the same truthy-default-standing-in-
// for-a-decision shape as the auth bypass fixed in this same release. It is
// worse than the empty stdout it replaced, because a confident lie beats
// silence at fooling `| jq -e .success`.
// --------------------------------------------------------------------------
describe("the fallback envelope reports the real outcome", () => {
  afterEach(() => { process.exitCode = 0; });

  test("a non-zero exit code produces success:false", () => {
    process.exitCode = 1;
    expect(JSON.parse(withStdout(() => emitJsonFallback("personas", "18.72.6"))).success).toBe(false);
  });

  test("a zero exit code produces success:true", () => {
    process.exitCode = 0;
    expect(JSON.parse(withStdout(() => emitJsonFallback("navigate", "18.72.6"))).success).toBe(true);
  });

  test("an unset exit code is treated as success", () => {
    process.exitCode = undefined;
    expect(JSON.parse(withStdout(() => emitJsonFallback("navigate", "18.72.6"))).success).toBe(true);
  });

  test("any non-zero code counts as failure, not just 1", () => {
    for (const code of [2, 3, 127, 255]) {
      _resetJsonCapture();
      process.exitCode = code;
      expect(JSON.parse(withStdout(() => emitJsonFallback("x", "18.72.6"))).success).toBe(false);
    }
  });
});

describe("captured output is bounded so the envelope stays writable", () => {
  test("output past the budget is dropped and the truncation is REPORTED, not silent", () => {
    for (let i = 0; i < 4000; i++) console.log(`line ${i} ${"x".repeat(40)}`);
    expect(_captureTruncated()).toBe(true);
    const parsed = JSON.parse(withStdout(() => emitJsonFallback("verbose", "18.72.6")));
    expect(parsed.data.truncated).toBe(true);
    expect(parsed.warnings.some((w: string) => w.includes("truncated"))).toBe(true);
    // The point of the budget: the envelope must still fit inside one 64KB pipe
    // buffer, because it is written from a process-exit handler that cannot
    // await a drain.
    expect(Buffer.byteLength(JSON.stringify(parsed))).toBeLessThan(64 * 1024);
  });

  test("ordinary output is not marked truncated", () => {
    console.log("a modest amount of output");
    expect(_captureTruncated()).toBe(false);
    expect(JSON.parse(withStdout(() => emitJsonFallback("navigate", "18.72.6"))).data.truncated).toBe(false);
  });
});
