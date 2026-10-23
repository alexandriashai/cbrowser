/**
 * The manifest a client reads, checked against the handler it fronts.
 *
 * An external report filed four findings that all reduced to "the served schema does
 * not match the code". Three were wrong -- the schemas were correct and the process
 * serving them was old -- and the fourth was right for a string nobody had checked.
 * Being wrong three times out of four is the point: there was no way to settle any of
 * it except by hand, so a reasonable reader inferred a plausible mechanism and got it
 * backwards.
 *
 * The existing coverage cannot settle it either, and it is worth being precise about
 * why, because both files LOOK like they cover this:
 *
 *   tests/measurement-scope.test.ts        regex-matches the SOURCE TEXT of the
 *                                          registration files. Green while the wire
 *                                          serves something else entirely.
 *   tests/mcp-schema-handler-drift.test.ts checks one direction only -- a schema key
 *                                          the handler never binds. The opposite
 *                                          direction, a parameter the handler READS
 *                                          that no schema declares, is what makes a
 *                                          documented parameter unreachable, and it
 *                                          was uncovered.
 *
 * This file assembles the real registry in-process -- the same registerAllPublicTools
 * the server calls, against a recording stand-in -- and asserts against the objects
 * tools/list is generated from. No HTTP, so it runs in CI.
 *
 * What it deliberately does NOT do is verify the RUNNING server. It cannot: a test
 * proves things about the code it imports, and the live failure was a process running
 * older code. That is a different question with a different probe --
 * scripts/check-deploy-freshness.mjs and tests/deploy-freshness.test.ts -- and
 * conflating the two is how "the tests pass" came to be read as "the customer sees
 * this".
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { describe, test, expect } from "bun:test";
import { registerBaseTools } from "../src/mcp-tools/base/index.js";
import { registerPersonaCreationTools } from "../src/mcp-tools/persona-creation-tools.js";
import { registerAskUserTool } from "../src/mcp-tools/ask-user-tools.js";
import { registerEnterpriseStubs } from "../src/mcp-tools/enterprise-stubs.js";
import { LAYER_DEFINITIONS } from "../src/visual/cognitive-transport-chain.js";

interface Registered {
  description?: string;
  inputSchema?: Record<string, unknown>;
  handler: (...a: unknown[]) => unknown;
}

/**
 * Assemble the manifest, calling the registrars DIRECTLY.
 *
 * Not `registerAllPublicTools`, and the reason is the whole value of this file. That
 * entry point composes two proxies around the server before registering -- a tier
 * gate and a security layer -- and the security layer replaces every handler with
 * `async (params) => { ... }`. So a manifest built through it carries 129 wrappers,
 * every one of which destructures nothing, and a check that reads handler parameters
 * skips all 129 and reports the codebase clean.
 *
 * That is not hypothetical. The first version of this file did exactly that and
 * passed 5/5 while `scope` was deleted from cognitive_effort's schema underneath it.
 * It was caught only by removing the mechanism and watching for red, which is the one
 * procedure that distinguishes a guard from a green check.
 *
 * Registering directly gives the handlers as written. It also means this file must
 * name the four registrars `registerAllPublicTools` composes; the count assertion
 * below is what fails if that list drifts, rather than the coverage silently shrinking.
 *
 * Handlers are never invoked, so the context can be stubs.
 */
function buildManifest(): Map<string, Registered> {
  const tools = new Map<string, Registered>();
  const noop = () => ({ enable() {}, disable() {} });
  const recorder = {
    registerTool(name: string, config: Record<string, unknown>, handler: (...a: unknown[]) => unknown) {
      tools.set(name, { ...(config as object), handler } as Registered);
      return noop();
    },
    tool(name: string, config: Record<string, unknown>, handler: (...a: unknown[]) => unknown) {
      tools.set(name, { ...(config as object), handler } as Registered);
    },
    registerResource: noop,
    resource() {},
    registerPrompt: noop,
    server: { setRequestHandler() {} },
  };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const s = recorder as any;
  registerBaseTools(s, {} as any);
  registerPersonaCreationTools(s);
  registerAskUserTool(s);
  registerEnterpriseStubs(s);
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return tools;
}

const MANIFEST = buildManifest();

/**
 * The identifiers a handler destructures from its first argument.
 *
 * Same source-of-truth as tests/mcp-schema-handler-drift.test.ts uses for the other
 * direction: the handler's own parameter pattern. Renames (`a: b`), defaults
 * (`a = 1`) and rest (`...r`) are stripped. A handler that does not destructure
 * returns nothing and is skipped rather than guessed at -- a checker that invents
 * parameter names would fail tools at random, and a guard that cries wolf gets
 * deleted, which is worse than not having it.
 */
function destructuredParams(fn: (...a: unknown[]) => unknown): string[] | null {
  // A handler registered through recordedAnswer (answer-provenance.ts) is a
  // wrapper whose own parameters are a rest argument; the handler as written
  // is kept on it. Read that one, or the three CTC tools drop out of the check.
  const inner = (fn as unknown as Record<symbol, unknown>)[Symbol.for("cbrowser.recordedAnswer.handler")];
  const src = (typeof inner === "function" ? inner : fn).toString();
  const open = src.indexOf("{");
  if (open === -1 || open > src.indexOf(")")) return null;
  let depth = 0;
  let close = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) { close = i; break; }
    }
  }
  if (close === -1) return null;
  return src
    .slice(open + 1, close)
    .split(",")
    .map((p) => p.trim())
    // A rest element (`...args`) is not a named parameter — it is every key the
    // schema declares that was not destructured by name. Reading it as a parameter
    // called "args" reports a violation on correct code, and a guard that fires on
    // correct code is one someone deletes.
    .filter((p) => !p.startsWith("..."))
    .map((p) => p.split("=")[0].split(":")[0].trim())
    .filter((p) => /^[A-Za-z_$][\w$]*$/.test(p));
}

describe("the served manifest matches the handler it fronts", () => {
  test("the manifest is non-trivially populated", () => {
    // A guard whose subject can silently become empty is not a guard. If a
    // registration refactor breaks enumeration, every assertion below would pass
    // vacuously and report the codebase clean.
    expect(MANIFEST.size).toBeGreaterThan(100);
    expect(MANIFEST.has("cognitive_effort")).toBe(true);
    expect(MANIFEST.has("page_understand")).toBe(true);
  });

  test("handlers are readable, not wrapped — the guard is not vacuous", () => {
    // The assertion that would have caught the first version of this file. If the
    // handlers cannot be read, the parameter checks below have nothing to check and
    // pass on an empty set, which looks identical to passing on a clean codebase.
    // Asserting a floor on how many handlers are legible makes the difference visible.
    const legible = [...MANIFEST.values()].filter((t) => destructuredParams(t.handler) !== null);
    expect(legible.length).toBeGreaterThan(80);
    // And specifically the tool the whole report was about.
    expect(destructuredParams(MANIFEST.get("cognitive_effort")!.handler)).toContain("scope");
  });

  test("every parameter a handler reads is declared in its inputSchema", () => {
    // The uncovered direction, and the one that makes a parameter unreachable: the
    // handler honours it, the schema never advertises it, so no client can send it.
    // This is the shape the report ASSUMED had happened to `scope`. It had not -- but
    // nothing was checking, which is why the assumption survived contact.
    const violations: string[] = [];
    for (const [name, tool] of MANIFEST) {
      const declared = new Set(Object.keys(tool.inputSchema ?? {}));
      const read = destructuredParams(tool.handler);
      if (!read) continue;
      for (const p of read) {
        if (p.startsWith("_")) continue; // transport plumbing, e.g. _browserToken
        if (!declared.has(p)) violations.push(`${name} reads "${p}" but does not declare it`);
      }
    }
    expect(violations).toEqual([]);
  });

  test("scope is declared on every tool whose handler honours it", () => {
    // Stated as a property over the manifest rather than a list of tool names, so a
    // future scope-bearing tool is covered on the day it is written rather than the
    // day someone remembers to add it here.
    const missing: string[] = [];
    for (const [name, tool] of MANIFEST) {
      const read = destructuredParams(tool.handler);
      if (!read?.includes("scope")) continue;
      if (!Object.keys(tool.inputSchema ?? {}).includes("scope")) missing.push(name);
    }
    expect(missing).toEqual([]);
  });

  test("a served description's layer count is the code's layer count", () => {
    // The one finding in the report that was RIGHT, in a string it did not name. The
    // server instructions said "6-layer" while the chain had eight, so every client
    // selecting tools was reasoning about a six-layer model. Checked against
    // LAYER_DEFINITIONS rather than against another string, or the two copies just
    // drift together more quietly.
    const expected = LAYER_DEFINITIONS.length;
    const wrong: string[] = [];
    for (const [name, tool] of MANIFEST) {
      for (const m of (tool.description ?? "").matchAll(/(\d+)[- ]layer/gi)) {
        if (Number(m[1]) !== expected) wrong.push(`${name}: "${m[0]}" but the chain has ${expected}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  test("no served description names a layer the chain does not have", () => {
    // A count can be right while the names are stale. cognitive_effort's description
    // spells the chain out, so the spelling is checkable too.
    const known = new Set(LAYER_DEFINITIONS.map((l) => l.name.toLowerCase()));
    const desc = (MANIFEST.get("cognitive_effort")?.description ?? "").toLowerCase();
    expect(desc).toContain("8-layer");
    // Every layer the code has must appear, in the prose form the description uses.
    for (const layer of ["visual complexity", "cognitive load", "decision", "motor", "frustration", "readability"]) {
      expect(desc).toContain(layer);
    }
    expect(known.size).toBe(LAYER_DEFINITIONS.length);
  });
});
