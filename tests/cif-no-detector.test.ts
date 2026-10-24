/**
 * A CIF component is measured only when a check that looks for it ran.
 *
 * skipMechanisms counted skip findings in the audit's barrier list, and
 * empathy_audit has no skip-link detector: an empty list said nothing about
 * skip links, yet the component read "No skip navigation issues detected" and
 * scored 100 on every page. It is now measured only when the caller says a
 * skip-link check ran (skipLinksChecked) or the list holds a skip finding.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect } from "bun:test";
import { computeCIFScore, type CIFInput } from "../src/cif-score.js";
import { param } from "../src/visual/model-provenance.js";

/** What empathy_audit reports on a page with no findings, plus every other input. */
const AUDITED: CIFInput = {
  url: "https://example.test/audited",
  barriers: [],
  touchTargets: [{ width: 48, height: 48 }],
  contrastIssues: [{ ratio: 3, isLargeText: false }],
  agentReadyScore: 80, semanticScore: 80, ariaScore: 80, landmarkScore: 80, headingScore: 80, formLabelScore: 80,
  totalCTC: 0.4, layers: [{ name: "decision", cost: 0.3 }],
  elementCount: 200, interactiveCount: 20, navItemCount: 6, animationCount: 0, hasReducedMotionSupport: true,
  informationDensity: 0.3, fleschScore: 70, ctaCaptureRate: 0.6,
};

describe("skipMechanisms needs a skip-link check", () => {
  test("an audit with no skip-link check leaves it not measured, and the page uncertified", () => {
    const r = computeCIFScore(AUDITED);
    const skip = r.navigation.components.skipMechanisms;
    expect(skip.measured).toBe(false);
    expect(skip.score).toBe(param("cif.noData.score"));
    expect(skip.details).toMatch(/^Not measured: no skip-link check/);
    expect(r.notMeasured).toEqual(["navigation.skipMechanisms"]);
    expect(r.certification).toBe("none");
  });

  test("a caller whose audit checked for skip links gets it measured", () => {
    const r = computeCIFScore({ ...AUDITED, skipLinksChecked: true });
    expect(r.navigation.components.skipMechanisms).toEqual(expect.objectContaining({ measured: true, score: 100 }));
    expect(r.notMeasured).toEqual([]);
  });

  test("a skip finding in the list shows a check ran", () => {
    const r = computeCIFScore({ ...AUDITED, barriers: [{ type: "missing_skip_link", severity: "major" }] });
    const skip = r.navigation.components.skipMechanisms;
    expect(skip.measured).toBe(true);
    expect(skip.score).toBeLessThan(100);
  });

  test("with no audit at all it stays not measured, as before", () => {
    const { barriers: _none, ...unaudited } = AUDITED;
    expect(computeCIFScore(unaudited).navigation.components.skipMechanisms.measured).toBe(false);
  });
});
