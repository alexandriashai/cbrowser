/**
 * No file name in src/ is built from the clock alone, and no temp file is
 * taken from os.tmpdir() outside src/temp-files.ts.
 *
 * A name like `attn-${Date.now()}.png` is the same for every call in one
 * millisecond, and the hosted servers run many requests, for many accounts, in
 * one process: concurrent calls wrote over, read and deleted each other's
 * files (empathy_audit's perceptual score was computed on another request's
 * screenshot). Temp files now come from makeTempDir/withTempDir, persistent
 * names from uniqueStamp (src/temp-files.ts; behaviour in
 * tests/temp-files.test.ts).
 *
 * The scan flags every `${...Date.now()...}` interpolation (elapsed-time
 * arithmetic and console lines aside) and every `${...toISOString()...}` on a
 * line that builds a path, unless the same line also carries a random part.
 * What is left is listed below, each with the reason it is not a collision
 * risk: a new clock-named literal fails here until someone decides which it
 * is. An entry that matches nothing fails too, so the list cannot go stale.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(import.meta.dir, "..", "src");
const HELPER = "temp-files.ts";

interface Allowed { file: string; match: string; reason: string }

const ALLOWED: Allowed[] = [
  { file: "cli.ts", match: "(options.output as string) || `",
    reason: "CLI --output default: one report per invocation, in the user's working directory" },
  { file: "visual/regression.ts", match: "`diff-${baseline.id}-${Date.now()}.png`",
    reason: "never written: runVisualRegression returns this path, but nothing writes a diff image" },
  { file: "visual/distance-metrics.ts", match: "id: `smart-",
    reason: "an id in the smart-baseline index, not a file name (the captures are named in regression.ts)" },
  { file: "mcp-tools/base/gif-tools.ts", match: "const gifId = `journey-",
    reason: "a name for writeArtifact, which adds 48 random bits and creates the file exclusively" },
  { file: "mcp-tools/base/visual-testing-tools.ts", match: "const heatmapId = `attn-",
    reason: "a name for writeArtifact (random bits, exclusive create); the local fallback builds its own name" },
  { file: "mcp-tools/base/visual-testing-tools.ts", match: "const heatmapId = `cmp-",
    reason: "a name for writeArtifact (random bits, exclusive create)" },
  { file: "mcp-tools/base/persona-comparison-tools.ts", match: "const heatmapId = `motor-",
    reason: "a name for writeArtifact (random bits, exclusive create)" },
  { file: "mcp-tools/base/persona-comparison-tools.ts", match: "writeArtifact(Buffer.from(b64, \"base64\"), `saliency-",
    reason: "a name for writeArtifact (random bits, exclusive create)" },
  { file: "mcp-tools/base/persona-comparison-tools.ts", match: "writeArtifact(Buffer.from(b64, \"base64\"), `readability-",
    reason: "a name for writeArtifact (random bits, exclusive create)" },
  { file: "mcp-tools/ask-user-tools.ts", match: "prompt_id: `prompt_",
    reason: "not a path: a prompt id, with a counter" },
  { file: "mcp-tools/screenshot-utils.ts", match: "const boundary = `----CBrowserUpload",
    reason: "not a path: a multipart boundary" },
  { file: "remediation/patch-generator.ts", match: "issueId: `",
    reason: "not a path: an issue id inside a patch report" },
  { file: "browser.ts", match: "`audit-${new Date().toISOString().split(\"T\")[0]}.json`",
    reason: "one audit log per day, shared on purpose; appended by a synchronous read-modify-write, which no other call in the process can interleave" },
];

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

const CLOCK = /\$\{[^}]*Date\.now\(\)/;
const ELAPSED = /Date\.now\(\)\s*-|-\s*Date\.now\(\)/;
const ISO = /\$\{[^}]*toISOString\(\)/;
const PATHISH = /\bjoin\(|\bslug\b|Path\b|File\b|filename|\.(png|jpe?g|json|svg|gif|html|har|xml|tap|jsonl)\b/;
const RANDOM = /randomPart\(\)|uniqueStamp\(\)|Math\.random\(\)|randomBytes\(|randomUUID\(/;
const COMMENT = /^\s*(\/\/|\*|\/\*)/;
const CONSOLE = /console\.(log|error|warn|debug|info)\(/;
const TMP = /\btmpdir\(\)|["'`]\/tmp\//;

interface Hit { file: string; line: number; text: string }

function scan(): { clock: Hit[]; tmp: Hit[] } {
  const clock: Hit[] = [];
  const tmp: Hit[] = [];
  for (const path of sources(SRC)) {
    const file = relative(SRC, path);
    if (file === HELPER) continue;
    readFileSync(path, "utf8").split("\n").forEach((text, i) => {
      if (COMMENT.test(text)) return;
      const hit = { file, line: i + 1, text: text.trim() };
      if (TMP.test(text)) tmp.push(hit);
      if (RANDOM.test(text) || CONSOLE.test(text)) return;
      if ((CLOCK.test(text) && !ELAPSED.test(text)) || (ISO.test(text) && PATHISH.test(text))) clock.push(hit);
    });
  }
  return { clock, tmp };
}

describe("file names are not built from the clock alone", () => {
  const { clock, tmp } = scan();
  const allowed = (h: Hit) => ALLOWED.find((a) => a.file === h.file && h.text.includes(a.match));

  test("every clock-built name in src/ is on the reviewed list", () => {
    expect(clock.filter((h) => !allowed(h)).map((h) => `${h.file}:${h.line}: ${h.text}`)).toEqual([]);
  });

  test("every reviewed entry still matches a line (no stale entries)", () => {
    expect(ALLOWED.filter((a) => !clock.some((h) => h.file === a.file && h.text.includes(a.match))).map((a) => `${a.file}: ${a.match}`)).toEqual([]);
  });

  test("os.tmpdir() and /tmp/ appear only in src/temp-files.ts", () => {
    expect(tmp.map((h) => `${h.file}:${h.line}: ${h.text}`)).toEqual([]);
  });

  test("absence test: the scan finds a clock-built name, a /tmp path and a tmpdir() call when they are there", () => {
    const lines = [
      "const p = join(dir, `current-${Date.now()}.png`);",
      "const s = `/tmp/x-${Date.now()}.png`;",
      "const t = join(tmpdir(), \"x\");",
      "this.slug = `recording-${new Date().toISOString()}`;",
    ];
    expect(lines.filter((l) => CLOCK.test(l) || (ISO.test(l) && PATHISH.test(l)))).toHaveLength(3);
    expect(lines.filter((l) => TMP.test(l))).toHaveLength(2);
    expect(RANDOM.test("join(dir, `current-${uniqueStamp()}.png`)")).toBe(true);
    expect(ELAPSED.test("`(${Date.now() - start}ms)`")).toBe(true);
  });
});
