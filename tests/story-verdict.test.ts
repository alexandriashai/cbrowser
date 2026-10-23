/**
 * visual_cognitive_story's effort section and verdict, on the registered bands.
 *
 * Through 21.0 the story read totalCTC on the logistic: "comfortable" below
 * 0.5, "Moderate effort" below 1.0, "Significant cognitive burden" above, and
 * a verdict quadrant whose "Hard but focused" branch needed totalCTC > 1.0,
 * which no logistic or percentile can reach. A page ranked in the middle with
 * the CTAs seen fell to "Needs work. High effort AND low CTA visibility",
 * which said the opposite of both inputs; a failed effort run defaulted to 0
 * and was called comfortable.
 *
 * Now: the cost axis is the band (lower half / upper half / high and top), the
 * attention axis is the CTA capture rate, every branch is reachable, and each
 * is reached here by a constructed input. No branch claims how a person feels.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { storyEffortSection, storyVerdict, STORY_VERDICTS, type StoryEffort } from "../src/mcp-tools/base/story-narrative.js";
import { ctcRank } from "../src/visual/ctc-bands.js";
import { withParamOverrides } from "../src/visual/model-provenance.js";

const FEELING = /comfort|struggl|easy|easily|difficult|frustrat|overwhelm|burden|pushes through|can use this page|works for/i;

const effort = (totalCTC: number, rawCTC = 1.1): StoryEffort => ({
  totalCTC, rawCTC, referenceScope: "viewport", bottleneck: "decision", abandonmentRiskPercent: 12,
});
const seen = { ctaCaptureRate: 0.35, distractorRatio: 0.2, qualityScore: 80 };
const seenLeaking = { ctaCaptureRate: 0.35, distractorRatio: 0.6, qualityScore: 40 };
const missed = { ctaCaptureRate: 0.05, distractorRatio: 0.2, qualityScore: 70 };
const between = { ctaCaptureRate: 0.15, distractorRatio: 0.2, qualityScore: 70 }; // 0.1-0.2 used to fall through

describe("every verdict branch is reached by a constructed input", () => {
  const cases: Array<[string, StoryEffort | null, Parameters<typeof storyVerdict>[2]]> = [
    ["strong", effort(0.3), seen],
    ["mixed", effort(0.3), seenLeaking],
    ["lowUnfocused", effort(0.3), missed],
    ["upperFocused", effort(0.65), seen],
    ["upperUnfocused", effort(0.65), between],
    ["highFocused", effort(0.9), seen],
    ["highUnfocused", effort(0.97), missed],
    ["costOnly", effort(0.65), undefined],
    ["unranked", null, seen],
  ];

  test("each named branch, once, and the list of branches is exactly these", () => {
    const reached = cases.map(([want, e, q]) => {
      const v = storyVerdict("cognitive-adhd", e, q);
      expect({ want, got: v.branch }).toEqual({ want, got: want });
      return v.branch;
    });
    expect(new Set(reached)).toEqual(new Set(STORY_VERDICTS));
  });

  test("the cost axis reads the band, at its edges", () => {
    expect(storyVerdict("p", effort(0.4999), seen).branch).toBe("strong");
    expect(storyVerdict("p", effort(0.5), seen).branch).toBe("upperFocused");
    expect(storyVerdict("p", effort(0.7999), seen).branch).toBe("upperFocused");
    expect(storyVerdict("p", effort(0.8), seen).branch).toBe("highFocused");
    expect(storyVerdict("p", effort(1), missed).branch).toBe("highUnfocused");
    // The registered cut points decide it.
    withParamOverrides({ "ctcBands.upperHalf": 0.3 }, () => {
      expect(storyVerdict("p", effort(0.35), seen).branch).toBe("upperFocused");
    });
  });

  test("the old unreachable and wrong branches are gone", () => {
    // A mid-ranked page with the CTAs seen is not "high effort AND low CTA visibility".
    const mid = storyVerdict("p", effort(0.65), seen).text;
    expect(mid).not.toMatch(/low CTA visibility/);
    // A failed effort run is not called cheap.
    expect(storyVerdict("p", null, seen).text).not.toMatch(/lower half/);
    // A CTA rate between 0.1 and 0.2 on a cheap page is still about the CTAs being missed.
    expect(storyVerdict("p", effort(0.3), between).branch).toBe("lowUnfocused");
  });

  test("no branch describes how a person feels", () => {
    for (const [, e, q] of cases) expect(storyVerdict("p", e, q).text).not.toMatch(FEELING);
  });

  test("cost-bearing branches name the band from the registry", () => {
    expect(storyVerdict("p", effort(0.97), missed).text).toContain("top 5%");
    expect(storyVerdict("p", effort(0.9), seen).text).toContain("high band");
    expect(storyVerdict("p", effort(0.3), seen).text).toContain("lower half");
  });
});

describe("the effort section states the rank", () => {
  test("it carries the rank sentence, the bottleneck, and abandonment as a separate quantity", () => {
    const e = effort(0.873, 1.5);
    const text = storyEffortSection("cognitive-adhd", e);
    expect(text).toContain(ctcRank(e).sentence);
    expect(text).toContain("**decision**");
    expect(text).toMatch(/Abandonment risk.*separate.*\*\*12%\*\*/);
    expect(text).not.toMatch(FEELING);
    expect(text).not.toMatch(/Total cognitive transport cost: 0\./);
  });

  test("a failed effort run says so instead of scoring 0", () => {
    const text = storyEffortSection("cognitive-adhd", null);
    expect(text).toMatch(/could not be computed/);
    expect(text).not.toMatch(/lower half|comfortable|cheapest/);
  });
});
