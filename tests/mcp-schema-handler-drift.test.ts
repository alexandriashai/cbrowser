// ============================================================================
// MCP schema-vs-handler argument drift — bun test suite
// ============================================================================
//
// The class this prevents: a tool declares an argument in its inputSchema, the
// handler never destructures it, and the caller gets a confident answer computed
// without it. Found 2026-07-26 in four tools — agent_ready_audit (userLanguage),
// empathy_audit (userLocation, userLanguage), cognitive_effort (geoRegion,
// device) and site_cognitive_assessment (device). A caller asking for a mobile
// audit received a desktop one with nothing in the response indicating the
// argument was dropped. It is the only place in the package where someone paying
// for a number can be handed a silently wrong one.
//
// It is mechanically detectable, which is why this is a test and not a one-time
// sweep: fixing four instances without a guard just means a fifth next quarter.
//
// Run:  bun test tests/mcp-schema-handler-drift.test.ts

import { describe, test, expect } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TOOLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "mcp-tools");

function* tsFiles(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* tsFiles(p);
    else if (e.name.endsWith(".ts")) yield p;
  }
}

interface Drift { file: string; schemaKeys: string[]; dropped: string[] }

/**
 * Pair each `inputSchema: { ... }` block with the `async ({ ... })` handler that
 * follows it, and report declared keys the handler never binds.
 *
 * A destructured parameter may carry a rename (`persona: personaName`), a
 * default (`comprehensive = false`), or both. Both forms must be stripped — an
 * earlier version of this scan stripped only the rename and reported two false
 * positives on `comprehensive`.
 */
function scanDrift(): { toolsScanned: number; drifts: Drift[] } {
  let toolsScanned = 0;
  const drifts: Drift[] = [];

  for (const file of tsFiles(TOOLS_DIR)) {
    const src = readFileSync(file, "utf-8");
    // `}, recordedAnswer(async ({` is the same handler, wrapped so its whole
    // answer is one provenance recording (answer-provenance.ts). Without the
    // optional wrapper the lazy match ran on to the NEXT tool's handler and
    // paired this tool's schema with it.
    const re = /inputSchema:\s*\{([\s\S]*?)\n\s{4}\},[\s\S]*?\}, (?:recordedAnswer\()?async \(\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const schemaKeys = [...m[1].matchAll(/^\s{6}([a-zA-Z_][a-zA-Z0-9_]*):\s*z\./gm)].map((x) => x[1]);
      if (!schemaKeys.length) continue;
      toolsScanned++;
      const bound = m[2]
        .split(",")
        .map((s) => s.split("=")[0].split(":")[0].trim())
        .filter(Boolean);
      const dropped = schemaKeys.filter((k) => !bound.includes(k));
      if (dropped.length) drifts.push({ file: file.replace(TOOLS_DIR + "/", ""), schemaKeys, dropped });
    }
  }
  return { toolsScanned, drifts };
}

describe("every declared MCP tool argument is bound by its handler", () => {
  const { toolsScanned, drifts } = scanDrift();

  test("the scan actually parses tools (guards against a vacuously green regex)", () => {
    // If a refactor changes the registration shape, the regex silently matches
    // nothing and this suite would pass while checking zero tools. That failure
    // mode is exactly what this class of test is supposed to prevent, so assert
    // the scan has real reach before trusting its verdict.
    expect(toolsScanned).toBeGreaterThan(50);
  });

  test("the scan can see a declared key at all (detector sanity)", () => {
    const { drifts: _d } = scanDrift();
    void _d;
    // Build a synthetic handler that drops a key and confirm the same matcher
    // flags it — proving a green result means "nothing dropped", not "nothing looked at".
    const synthetic = `
    inputSchema: {
      url: z.string(),
      ignoredArg: z.string().optional(),
    },
    annotations: {},
  }, async ({ url }) => {`;
    const m = /inputSchema:\s*\{([\s\S]*?)\n\s{4}\},[\s\S]*?\}, async \(\{([^}]*)\}/.exec(synthetic);
    expect(m).not.toBeNull();
    const keys = [...m![1].matchAll(/^\s{6}([a-zA-Z_][a-zA-Z0-9_]*):\s*z\./gm)].map((x) => x[1]);
    const bound = m![2].split(",").map((s) => s.split("=")[0].split(":")[0].trim()).filter(Boolean);
    expect(keys.filter((k) => !bound.includes(k))).toEqual(["ignoredArg"]);

    // And through the recordedAnswer wrapper, paired with its own handler.
    const wrapped = synthetic.replace("}, async ({ url }) => {", "}, recordedAnswer(async ({ url }) => {");
    const w = /inputSchema:\s*\{([\s\S]*?)\n\s{4}\},[\s\S]*?\}, (?:recordedAnswer\()?async \(\{([^}]*)\}/.exec(wrapped);
    expect(w).not.toBeNull();
    expect(w![2].trim()).toBe("url");
  });

  test("no tool declares an argument its handler ignores", () => {
    const report = drifts
      .map((d) => `  ${d.file}: drops ${d.dropped.join(", ")}`)
      .join("\n");
    expect(drifts.length === 0 ? "" : `\n${report}\n`).toBe("");
  });
});
