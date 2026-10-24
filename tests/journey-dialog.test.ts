/**
 * formatJourneyStep (src/cognitive/journey-dialog.ts): one cognitive-journey
 * step as the lines `cbrowser cognitive-journey` prints while it runs.
 * tests/cli-journey-dialog-browser.test.ts runs the command end to end.
 */
import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { formatJourneyStep, journeyEndLine } from "../src/cognitive/journey-dialog.js";
import type { CognitiveStep } from "../src/cognitive/index.js";

function step(over: Partial<CognitiveStep>): CognitiveStep {
  return {
    step: 2,
    phase: "decide",
    monologue: "",
    replyReadable: true,
    state: { currentMood: "hopeful" } as CognitiveStep["state"],
    ...over,
  };
}

describe("formatJourneyStep", () => {
  test("a step prints its phase and mood, the persona's words, and what it did", () => {
    expect(formatJourneyStep(step({
      monologue: "  I want the price. There's a Pricing link at the top.  ",
      action: "click:Pricing",
      actionTarget: "the Pricing link",
    }))).toEqual([
      "   Step 2 · decide · hopeful",
      '   💭 "I want the price. There\'s a Pricing link at the top."',
      "   → click: the Pricing link",
    ]);
  });

  test("without a target the raw action is shown, so nothing the model chose is hidden", () => {
    expect(formatJourneyStep(step({ action: "scroll:down" }))).toEqual([
      "   Step 2 · decide · hopeful",
      "   → scroll (scroll:down)",
    ]);
  });

  test("a step with no action says so", () => {
    expect(formatJourneyStep(step({ monologue: "Reading the page." })).at(-1)).toBe("   → no action");
  });

  test("an unreadable reply is named, not shown as an 'evaluate' step", () => {
    const lines = formatJourneyStep(step({ phase: "evaluate", replyReadable: false }));
    expect(lines).toEqual(["   Step 2: the model's reply could not be read, so this step took no action"]);
    expect(lines.join("\n")).not.toContain("evaluate");
  });
});

describe("journeyEndLine", () => {
  const end = { stepCount: 4, totalTime: 12.34 };

  test("a reached goal", () => {
    expect(journeyEndLine({ ...end, goalAchieved: true })).toBe("✅ GOAL ACHIEVED in 4 steps (12.3s)");
  });

  test("an abandoned run names its reason", () => {
    expect(journeyEndLine({ ...end, goalAchieved: false, abandonmentReason: "timeout" })).toBe("❌ ABANDONED: timeout");
  });

  test("a run that used every step says so instead of 'ABANDONED: undefined'", () => {
    const line = journeyEndLine({ ...end, goalAchieved: false });
    expect(line).toBe("❌ GOAL NOT REACHED: stopped at the step limit after 4 steps (raise it with --max-steps)");
    expect(line).not.toContain("undefined");
  });
});

describe("each step names the page it is on, as a URL a terminal can open", () => {
  test("the URL sits alone at the end of its own line, after the header, without its query string but with its anchor", () => {
    const lines = formatJourneyStep(step({ url: "https://www.ucdenver.edu/tuition/undergraduate?term=fall#rates", monologue: "Tuition is here." }));
    expect(lines[0]).toBe("   Step 2 · decide · hopeful");
    expect(lines[1]).toBe("   🔗 https://www.ucdenver.edu/tuition/undergraduate#rates");
    expect(lines[2]).toBe('   💭 "Tuition is here."');
  });

  test("a tracking parameter is dropped (the 2026-10-23 run's _gl links)", () => {
    const url = "https://business.ucdenver.edu/?_gl=1*lvoksd*_gcl_au*MTkzNzM1NTE1MC4xNzkyNzk5ODM5";
    expect(formatJourneyStep(step({ url }))[1]).toBe("   🔗 https://business.ucdenver.edu/");
  });

  test("a string that is not a URL prints as given", () => {
    expect(formatJourneyStep(step({ url: "about:blank" }))[1]).toBe("   🔗 about:blank");
    expect(formatJourneyStep(step({ url: "not a url" }))[1]).toBe("   🔗 not%20a%20url");
  });

  test("an unreadable step still says where it was", () => {
    expect(formatJourneyStep(step({ replyReadable: false, url: "https://example.com/a" }))).toEqual([
      "   Step 2: the model's reply could not be read, so this step took no action",
      "   🔗 https://example.com/a",
    ]);
  });

  test("whitespace in a URL is encoded so the link is not cut", () => {
    expect(formatJourneyStep(step({ url: "https://example.com/a b" }))[1]).toBe("   🔗 https://example.com/a%20b");
  });

  test("no URL, no line", () => {
    expect(formatJourneyStep(step({ url: undefined }))).toEqual(["   Step 2 · decide · hopeful", "   → no action"]);
  });

  test("for any web URL, the line is the marker and the same page and anchor with no query string", () => {
    fc.assert(fc.property(fc.webUrl({ withQueryParameters: true, withFragments: true }), (url) => {
      const line = formatJourneyStep(step({ url }))[1];
      expect(line.startsWith("   🔗 ")).toBe(true);
      const printed = new URL(line.slice("   🔗 ".length));
      const given = new URL(url);
      expect(printed.search).toBe("");
      expect(printed.hash).toBe(given.hash);
      expect(printed.origin + printed.pathname).toBe(given.origin + given.pathname);
      expect(/\s/.test(line.slice("   🔗 ".length))).toBe(false);
    }), { numRuns: 300 });
  });
});
