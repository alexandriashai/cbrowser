/**
 * formatJourneyStep (src/cognitive/journey-dialog.ts): one cognitive-journey
 * step as the lines `cbrowser cognitive-journey` prints while it runs.
 * tests/cli-journey-dialog-browser.test.ts runs the command end to end.
 */
import { describe, expect, test } from "bun:test";
import { formatJourneyStep } from "../src/cognitive/journey-dialog.js";
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
