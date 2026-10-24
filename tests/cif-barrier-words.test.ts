/**
 * CIF finds a barrier's kind by whole words in its type or description, not
 * by any substring.
 *
 * formAccessibility counted barriers whose text contained "form", and
 * "Information" does: empathy_audit's colour-only barrier ("Information
 * conveyed by color alone may not be perceivable by color-blind users")
 * deducted from formAccessibility as well as colorIndependence. The same
 * substring rule would read "platform", "format", "performance" and "conform"
 * as form findings, and "skipped" as a skip-link finding.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { computeCIFScore, type CIFInput, type CIFScore } from "../src/cif-score.js";

type Barrier = NonNullable<CIFInput["barriers"]>[number];

/** Audited (barriers: []) with no sizes or contrast issues, so every barrier path is live. */
const BASE: CIFInput = {
  url: "https://example.test/audited",
  barriers: [],
  agentReadyScore: 80,
  semanticScore: 80,
  ariaScore: 80,
  formLabelScore: 80,
  interactiveCount: 20,
};

function scores(result: CIFScore): Record<string, number> {
  const out: Record<string, number> = {};
  for (const cat of ["motor", "visual", "cognitive", "sensory", "navigation"] as const) {
    for (const [name, c] of Object.entries(result[cat].components)) out[`${cat}.${name}`] = c.score;
  }
  return out;
}

/** The components a barrier moves. */
function moved(barrier: Barrier): string[] {
  const before = scores(computeCIFScore(BASE));
  const after = scores(computeCIFScore({ ...BASE, barriers: [barrier] }));
  return Object.keys(before).filter((k) => before[k] !== after[k]).sort();
}

const sensory = (description: string): Barrier => ({ type: "sensory", severity: "major", description });

describe("CIF reads barrier kinds as words", () => {
  test("empathy_audit's colour-only barrier is a colour finding, not a form finding", () => {
    expect(moved(sensory("Information conveyed by color alone may not be perceivable by color-blind users")))
      .toEqual(["visual.colorIndependence"]);
  });

  test("words that only contain a kind's name are not that kind", () => {
    for (const description of [
      "Cookie platform banner covers the page",
      "Date format is ambiguous",
      "Slow performance on scroll",
      "Layout does not conform to the reading order",
      "Heading levels skipped (h1 to h3)",
    ]) {
      expect([description, moved(sensory(description))]).toEqual([description, []]);
    }
  });

  test("the audit's own wording still reaches each component", () => {
    const cases: Array<[Barrier, string[]]> = [
      [{ type: "cognitive_load", severity: "major", description: "Form input (email) has no accessible label (has placeholder, but placeholders are not valid labels)" }, ["navigation.formAccessibility"]],
      [{ type: "long-form", severity: "minor", description: "Form with 9 fields may overwhelm users with attention difficulties" }, ["navigation.formAccessibility"]],
      [sensory("Video has no captions - deaf users cannot access its audio content"), ["sensory.sensoryIndependence"]],
      [sensory("2 links are distinguished only by color, without underline or icon - color-blind users may not see them"), ["visual.colorIndependence"]],
      [{ type: "motor_precision", severity: "critical", description: "Drag-and-drop element lacks keyboard alternative" }, ["motor.dragFreeAlternatives", "navigation.keyboardOperability"]],
      [{ type: "missing_skip_link", severity: "major" }, ["navigation.skipMechanisms"]],
      [{ type: "form_unlabeled", severity: "major" }, ["navigation.formAccessibility"]],
    ];
    for (const [barrier, components] of cases) {
      expect([barrier.description ?? barrier.type, moved(barrier)]).toEqual([barrier.description ?? barrier.type, components]);
    }
  });
});
