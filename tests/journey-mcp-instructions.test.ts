/**
 * The rules cognitive_journey_init tells the client model to follow come
 * from the registry, and say what they are.
 *
 * The init tool serves instructions that state cognitive_journey_update_state's
 * update rules and the persona's abandonment limits. Through 21.0 they
 * stated a patience rule from hard-coded text that update_state did not
 * apply (it also scales by achievement), a 30-second confusion window that
 * update_state never had (it counts two consecutive updates), and nothing
 * about the numbers being hand-set. Now every number in the rules and limits
 * is a registered value the call read (or one of the two modulation bounds
 * derived from them), changing a registered value changes the text, and the
 * text calls the rules hypotheses.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CBROWSER_DATA_DIR = mkdtempSync(join(tmpdir(), "cb-journey-mcp-text-"));

const { registerCognitiveTools } = await import("../src/mcp-tools/base/cognitive-tools.js");
const { withProvenanceAsync, withParamOverridesAsync, MODEL_PROVENANCE } = await import("../src/visual/model-provenance.js");

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }>;
const handlers: Record<string, Handler> = {};
const fakeBrowser = {
  navigate: async () => ({}),
  getPage: async () => ({ title: async () => "Fixture", evaluate: async () => 42 }),
  applyPersonaLocation: async () => ({}),
  close: async () => {},
  launch: async () => {},
};
registerCognitiveTools({ registerTool: (name: string, _d: unknown, h: Handler) => { handlers[name] = h; } } as never, { getBrowser: async () => fakeBrowser as never });

async function instructions(persona = "first-timer"): Promise<{ text: string; read: string[] }> {
  const { result, provenance } = await withProvenanceAsync(() => handlers.cognitive_journey_init({ persona, goal: "g", startUrl: "https://none.example/" }));
  const body = JSON.parse(result.content[0].text!) as { instructions: string };
  // The hypotheses list names only hand-set reads; every read id is what the rules may cite.
  return { text: body.instructions, read: provenance.hypotheses };
}

/** The rules and limits: from step 5 to the end, step numbers dropped. */
function rulesSection(text: string): string {
  return text.slice(text.indexOf("5. EVALUATE")).replace(/^\d\. /gm, "");
}

describe("cognitive_journey_init's served rules", () => {
  test("say the rules and limits are hand-set hypotheses, and name update_state's own checks", async () => {
    const { text } = await instructions();
    const rules = rulesSection(text);
    expect(rules).toContain("They are hypotheses, untested against people, not measurements");
    expect(rules).toContain("call cognitive_journey_update_state");
    expect(rules).toContain("on two consecutive updates");
    expect(rules).not.toMatch(/for \d+s/);
  });

  test("every number in the rules and limits is a value the call read from the registry", async () => {
    for (const persona of ["first-timer", "elderly-user", "impatient-user", "careful-reader"]) {
      const { text, read } = await instructions(persona);
      const values = new Set(read.map((id) => MODEL_PROVENANCE[id].value));
      for (const id of ["journey.abandon.patienceFloor", "journey.abandon.timeLimitSeconds", "journey.abandon.timeLimitSeconds.highPatience", "journey.abandon.timeLimitSeconds.lowPatience"]) {
        values.add(MODEL_PROVENANCE[id].value);
      }
      const n = MODEL_PROVENANCE["journeyMcp.value.neutral"].value;
      const g = MODEL_PROVENANCE["journeyMcp.value.modulationGain"].value;
      // The modulation's range across the scale, and the scale's own ends.
      for (const derived of [1 - n * g, 1 + (1 - n) * g, 0, 1]) values.add(derived);
      const numbers = [...rulesSection(text).matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
      expect(numbers.length).toBeGreaterThan(20);
      expect(numbers.filter((x) => !values.has(x))).toEqual([]);
    }
  });

  test("a registered value changed is a rule changed (the text is interpolated, not written)", async () => {
    const before = rulesSection((await instructions()).text);
    const after = rulesSection((await withParamOverridesAsync({ "journeyMcp.update.patiencePerStep": 0.03, "journeyMcp.update.frustrationPerFailure": 0.25 }, () => instructions())).text);
    expect(before).toContain("patienceRemaining -= 0.02 +");
    expect(after).toContain("patienceRemaining -= 0.03 +");
    expect(after).toContain("frustrationLevel += 0.25 × security modulation");
  });
});
