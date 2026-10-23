/**
 * A caller-supplied persona name never takes a file outside its directory.
 *
 * An account can name a persona anything, "/" and ".." included, and the
 * measuring tools resolve that exact name. Two places joined it into a path
 * unfiltered: analyzePerceptualTransport's temp images (now fixed names in a
 * per-call directory, tests/perceptual-temp-files.test.ts) and
 * attention_analysis's local heatmap fallback, used when the artifact store
 * cannot take the file. path.join resolves ".." before the write, so
 * "x/../../escape" put the PNG beside the heatmaps directory instead of in it.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { basename, dirname, join, resolve, sep } from "node:path";
import * as VT from "../src/mcp-tools/base/visual-testing-tools.js";

const HOSTILE = ["x/../../escape", "../../../root/.ssh/x", "a/b", "..", ".", "a\\b", "x\0y", "/etc/passwd", "first-timer"];

describe("attention_analysis heatmap fallback name", () => {
  const fallbackFile = (VT as Record<string, unknown>).heatmapFallbackFile as ((persona: string) => string) | undefined;

  test("stays one plain file name inside the fallback directory, whatever the persona is called", () => {
    expect(typeof fallbackFile).toBe("function");
    const dir = "/srv/accounts/7/heatmaps";
    for (const persona of HOSTILE) {
      const name = fallbackFile!(persona);
      const path = join(dir, name);
      expect({ persona, dir: dirname(path), base: basename(path) === name, inside: resolve(path).startsWith(dir + sep) })
        .toEqual({ persona, dir, base: true, inside: true });
      expect(name).toMatch(/^attn-[A-Za-z0-9._-]+-\d+-[0-9a-f]{12}\.png$/);
    }
  });

  test("100 names for one persona in one frozen millisecond are distinct", () => {
    const realNow = Date.now;
    Date.now = () => 1_700_000_000_000;
    try {
      const names = Array.from({ length: 100 }, () => fallbackFile!("first-timer"));
      expect(new Set(names).size).toBe(100);
    } finally {
      Date.now = realNow;
    }
  });
});
