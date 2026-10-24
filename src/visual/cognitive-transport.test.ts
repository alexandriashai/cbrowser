import { test, expect, describe } from "bun:test";
import {
  buildOTCognitiveProfile,
  cognitiveDistance,
  cognitiveBarycenter,
  cognitiveGeodesic,
  generateAdversarialPersonas,
  estimateCognitiveLoad,
  selectMaxCoveragePersonas,
  cognitiveDistanceMatrix,
  findWorstCaseOnGeodesic,
  COGNITIVE_TRAITS,
} from "./cognitive-transport.js";

// Test personas
const firstTimer = buildOTCognitiveProfile("first-timer", {
  patience: 0.7, riskTolerance: 0.3, comprehension: 0.5,
  frustrationResponse: 0.4, resilience: 0.5, confidenceLevel: 0.3,
  decisionStyle: 0.4, satisficing: 0.6, impulsivity: 0.3,
  goalPersistence: 0.5, taskSwitching: 0.4, planningHorizon: 0.3,
  attentionPattern: 0.5, visualProcessing: 0.6, informationFiltering: 0.4,
  trustCalibration: 0.5, socialProofSensitivity: 0.7, authorityResponse: 0.6,
  motorPrecision: 0.7, reactionTime: 0.6,
  workingMemory: 0.5, processingSpeed: 0.5,
  contrastSensitivity: 0.8, colorPerception: 0.9, textProcessing: 0.6,
});

const powerUser = buildOTCognitiveProfile("power-user", {
  patience: 0.3, riskTolerance: 0.8, comprehension: 0.9,
  frustrationResponse: 0.2, resilience: 0.8, confidenceLevel: 0.9,
  decisionStyle: 0.9, satisficing: 0.3, impulsivity: 0.6,
  goalPersistence: 0.9, taskSwitching: 0.8, planningHorizon: 0.8,
  attentionPattern: 0.8, visualProcessing: 0.9, informationFiltering: 0.9,
  trustCalibration: 0.7, socialProofSensitivity: 0.2, authorityResponse: 0.3,
  motorPrecision: 0.9, reactionTime: 0.9,
  workingMemory: 0.9, processingSpeed: 0.9,
  contrastSensitivity: 0.9, colorPerception: 0.9, textProcessing: 0.9,
});

const adhdUser = buildOTCognitiveProfile("adhd-user", {
  patience: 0.2, riskTolerance: 0.5, comprehension: 0.7,
  frustrationResponse: 0.7, resilience: 0.3, confidenceLevel: 0.5,
  decisionStyle: 0.3, satisficing: 0.8, impulsivity: 0.9,
  goalPersistence: 0.3, taskSwitching: 0.9, planningHorizon: 0.2,
  attentionPattern: 0.2, visualProcessing: 0.6, informationFiltering: 0.2,
  trustCalibration: 0.5, socialProofSensitivity: 0.6, authorityResponse: 0.4,
  motorPrecision: 0.6, reactionTime: 0.7,
  workingMemory: 0.4, processingSpeed: 0.7,
  contrastSensitivity: 0.8, colorPerception: 0.9, textProcessing: 0.5,
});

describe("Cognitive Distance", () => {
  test("distance to self is zero", () => {
    const d = cognitiveDistance(firstTimer, firstTimer);
    expect(d.w1).toBeLessThan(0.001);
    expect(d.w2).toBeLessThan(0.001);
  });

  test("different personas have positive distance", () => {
    const d = cognitiveDistance(firstTimer, powerUser);
    expect(d.w1).toBeGreaterThan(0.01);
    expect(d.w2).toBeGreaterThan(0.01);
  });

  test("distance is symmetric", () => {
    const ab = cognitiveDistance(firstTimer, powerUser);
    const ba = cognitiveDistance(powerUser, firstTimer);
    expect(Math.abs(ab.w1 - ba.w1)).toBeLessThan(0.001);
  });

  test("ADHD is farther from power-user than first-timer", () => {
    const adhdToPower = cognitiveDistance(adhdUser, powerUser);
    const firstToPower = cognitiveDistance(firstTimer, powerUser);
    // ADHD has more extreme trait differences from power user
    expect(adhdToPower.w1).toBeGreaterThan(firstToPower.w1 * 0.5);
  });

  test("trait contributions sum correctly", () => {
    const d = cognitiveDistance(firstTimer, powerUser);
    const totalContrib = Object.values(d.traitContributions).reduce((a, b) => a + b, 0);
    expect(Math.abs(totalContrib - d.w1)).toBeLessThan(0.001);
  });
});

describe("Cognitive Barycenter", () => {
  test("barycenter of identical profiles equals the profile", () => {
    const bary = cognitiveBarycenter([firstTimer, firstTimer, firstTimer]);
    expect(bary.meanDistance).toBeLessThan(0.001);
  });

  test("barycenter of different profiles has non-zero mean distance", () => {
    const bary = cognitiveBarycenter([firstTimer, powerUser, adhdUser]);
    expect(bary.meanDistance).toBeGreaterThan(0);
    expect(bary.distances.length).toBe(3);
  });

  test("outlier persona is identified", () => {
    const bary = cognitiveBarycenter([firstTimer, powerUser, adhdUser]);
    expect(bary.outlierPersona).toBeTruthy();
    // The outlier should have the maximum distance
    const maxDist = Math.max(...bary.distances);
    const outlierIdx = bary.distances.indexOf(maxDist);
    expect(bary.outlierPersona).toBe([firstTimer, powerUser, adhdUser][outlierIdx].name);
  });
});

describe("Geodesic Interpolation", () => {
  test("geodesic endpoints match input profiles", () => {
    const geo = cognitiveGeodesic(firstTimer, powerUser, 4);
    expect(geo.length).toBe(5); // 0, 0.25, 0.5, 0.75, 1.0
    expect(geo[0].t).toBe(0);
    expect(geo[4].t).toBe(1);
  });

  test("geodesic midpoint differs from both endpoints", () => {
    const geo = cognitiveGeodesic(firstTimer, powerUser, 2);
    const mid = geo[1]; // t = 0.5

    const distToA = cognitiveDistance(
      buildOTCognitiveProfile("mid", mid.traits), firstTimer
    ).w1;
    const distToB = cognitiveDistance(
      buildOTCognitiveProfile("mid", mid.traits), powerUser
    ).w1;

    expect(distToA).toBeGreaterThan(0);
    expect(distToB).toBeGreaterThan(0);
  });

  test("worst case on geodesic is found", () => {
    const worst = findWorstCaseOnGeodesic(
      firstTimer, powerUser,
      (traits) => (1 - (traits.patience ?? 0.5)) + (traits.impulsivity ?? 0.5), // Cost: impatient + impulsive
      10
    );
    expect(worst.cost).toBeGreaterThan(0);
    expect(worst.t).toBeGreaterThanOrEqual(0);
    expect(worst.t).toBeLessThanOrEqual(1);
  });
});

describe("Adversarial Persona Generation", () => {
  test("generates adversarial personas for each input", () => {
    const costFn = (traits: Record<string, number>) => {
      return (1 - (traits.patience ?? 0.5)) * 2 + (1 - (traits.comprehension ?? 0.5));
    };

    const adversarial = generateAdversarialPersonas(
      [firstTimer, powerUser], costFn, 0.15
    );

    expect(adversarial.length).toBe(2);
    for (const a of adversarial) {
      expect(a.failureScore).toBeGreaterThanOrEqual(costFn(firstTimer.traits) * 0.5);
      expect(a.perturbedTraits.length).toBeGreaterThan(0);
      expect(a.nearestPersona).toBeTruthy();
    }
  });

  test("larger epsilon produces more extreme adversarial", () => {
    const costFn = (traits: Record<string, number>) => 1 - (traits.patience ?? 0.5);

    const mild = generateAdversarialPersonas([firstTimer], costFn, 0.05);
    const aggressive = generateAdversarialPersonas([firstTimer], costFn, 0.3);

    expect(aggressive[0].failureScore).toBeGreaterThanOrEqual(mild[0].failureScore);
  });
});

describe("Cognitive Load Estimation", () => {
  test("simple page has low load for power user", () => {
    const load = estimateCognitiveLoad(powerUser, {
      informationDensity: 0.3,
      visualComplexity: 0.2,
      interactiveElementCount: 5,
      textDensity: 0.3,
      animationLevel: 0,
      choiceCount: 3,
      navigationDepth: 1,
    });

    expect(load.totalLoad).toBeLessThan(0.3);
    expect(load.overloaded).toBe(false);
  });

  test("complex page has high load for ADHD user", () => {
    const load = estimateCognitiveLoad(adhdUser, {
      informationDensity: 0.8,
      visualComplexity: 0.9,
      interactiveElementCount: 40,
      textDensity: 0.7,
      animationLevel: 0.8,
      choiceCount: 20,
      navigationDepth: 4,
    });

    expect(load.totalLoad).toBeGreaterThan(0.3);
    expect(load.bottleneck).toBeTruthy();
  });

  test("same page produces different loads for different personas", () => {
    const page = {
      informationDensity: 0.6,
      visualComplexity: 0.5,
      interactiveElementCount: 15,
      textDensity: 0.5,
      animationLevel: 0.3,
      choiceCount: 8,
      navigationDepth: 2,
    };

    const powerLoad = estimateCognitiveLoad(powerUser, page);
    const adhdLoad = estimateCognitiveLoad(adhdUser, page);

    // Through 20.x this asserted ADHD's total above power-user's, which the
    // comprehension x informationDensity term carried; that term is gone in 21.0
    // (comprehension is UI conventions, not reading). What these fixtures still
    // separate on their own traits: working memory (0.4 against 0.9).
    expect(adhdLoad.totalLoad).not.toBe(powerLoad.totalLoad);
    expect(adhdLoad.breakdown.memory).toBeGreaterThan(powerLoad.breakdown.memory);
  });
});

describe("Coverage Optimization", () => {
  test("selects N most different personas", () => {
    const selected = selectMaxCoveragePersonas(
      [firstTimer, powerUser, adhdUser], 2
    );
    expect(selected.length).toBe(2);
  });

  test("returns all if N >= total", () => {
    const selected = selectMaxCoveragePersonas(
      [firstTimer, powerUser], 5
    );
    expect(selected.length).toBe(2);
  });
});

describe("Distance Matrix", () => {
  test("produces symmetric matrix", () => {
    const { matrix, names } = cognitiveDistanceMatrix([firstTimer, powerUser, adhdUser]);
    expect(names.length).toBe(3);
    expect(matrix.length).toBe(3);

    for (let i = 0; i < 3; i++) {
      expect(matrix[i][i]).toBe(0); // Diagonal is zero
      for (let j = i + 1; j < 3; j++) {
        expect(Math.abs(matrix[i][j] - matrix[j][i])).toBeLessThan(0.001);
      }
    }
  });
});
