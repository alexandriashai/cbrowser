// `cbrowser doctor` must pass exactly the Node versions package.json engines
// allows. It checked ">= 20.9" after 21.5.3 raised engines to
// "^20.19.0 || >=22.12.0", so it passed the very versions the raise was for
// (outside review, 2026-11-21).
import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { nodeMeetsEngines, NODE_FLOORS } from "../src/cli/doctor.js";

const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json() as { engines: { node: string } };
const ENGINES = pkg.engines.node;

describe("doctor's Node check is engines.node", () => {
  test("agrees with engines.node on every version 16.0.0 to 30.40.0", () => {
    fc.assert(fc.property(
      fc.integer({ min: 16, max: 30 }), fc.integer({ min: 0, max: 40 }), fc.integer({ min: 0, max: 9 }),
      (maj, min, patch) => nodeMeetsEngines(`${maj}.${min}.${patch}`) === Bun.semver.satisfies(`${maj}.${min}.${patch}`, ENGINES),
    ), { numRuns: 2000 });
  });

  test("the boundaries the review named", () => {
    for (const v of ["20.9.0", "20.18.1", "21.7.0", "22.0.0", "22.11.0"]) expect(nodeMeetsEngines(v), v).toBe(false);
    for (const v of ["20.19.0", "22.12.0", "24.1.0"]) expect(nodeMeetsEngines(v), v).toBe(true);
  });

  test("each floor is a lower bound of engines.node", () => {
    for (const [maj, min] of NODE_FLOORS) {
      expect(Bun.semver.satisfies(`${maj}.${min}.0`, ENGINES)).toBe(true);
      expect(Bun.semver.satisfies(`${maj}.${min - 1}.99`, ENGINES)).toBe(false);
    }
  });

  test("garbage is not a pass", () => {
    expect(nodeMeetsEngines("")).toBe(false);
    expect(nodeMeetsEngines("v22")).toBe(false);
  });
});
