/**
 * Focus Hierarchies Tests
 *
 * Tests for probabilistic focus hierarchies (v9.0.0 feature).
 */

import { describe, test, expect } from "bun:test";
import {
  getFocusHierarchy,
  inferTaskTypeFromGoal,
  calculateFocusPriority,
  getDistractionIgnoreRate,
  COMMON_DISTRACTIONS,
} from "../src/cognitive/focus-hierarchies.js";

describe("Focus Hierarchies", () => {
  describe("inferTaskTypeFromGoal", () => {
    test("infers find_information for search goals", () => {
      expect(inferTaskTypeFromGoal("find the pricing page")).toBe("find_information");
      expect(inferTaskTypeFromGoal("where is the documentation")).toBe("find_information");
      expect(inferTaskTypeFromGoal("locate the contact info")).toBe("find_information");
    });

    test("infers complete_action for action goals", () => {
      expect(inferTaskTypeFromGoal("sign up for an account")).toBe("complete_action");
      expect(inferTaskTypeFromGoal("submit the form")).toBe("complete_action");
      expect(inferTaskTypeFromGoal("purchase a subscription")).toBe("complete_action");
    });

    test("infers explore for browsing goals", () => {
      expect(inferTaskTypeFromGoal("browse the products")).toBe("explore");
      expect(inferTaskTypeFromGoal("explore the website")).toBe("explore");
    });

    test("infers compare for comparison goals", () => {
      expect(inferTaskTypeFromGoal("compare the pricing plans")).toBe("compare");
      expect(inferTaskTypeFromGoal("evaluate the options")).toBe("compare");
    });

    test("infers troubleshoot for problem-solving goals", () => {
      expect(inferTaskTypeFromGoal("fix the error")).toBe("troubleshoot");
      expect(inferTaskTypeFromGoal("debug the issue")).toBe("troubleshoot");
    });

    test("defaults to explore for ambiguous goals", () => {
      expect(inferTaskTypeFromGoal("do something")).toBe("explore");
    });
  });

  describe("getFocusHierarchy", () => {
    test("returns hierarchy for find_information", () => {
      const hierarchy = getFocusHierarchy("find_information");
      expect(hierarchy).toBeDefined();
      expect(hierarchy.taskType).toBe("find_information");
      expect(hierarchy.focusAreas.length).toBeGreaterThan(0);
    });

    test("returns hierarchy for complete_action", () => {
      const hierarchy = getFocusHierarchy("complete_action");
      expect(hierarchy).toBeDefined();
      expect(hierarchy.taskType).toBe("complete_action");
    });

    test("hierarchy has required properties", () => {
      const hierarchy = getFocusHierarchy("find_information");
      expect(hierarchy).toHaveProperty("focusAreas");
      expect(hierarchy).toHaveProperty("distractionFilters");
      expect(hierarchy).toHaveProperty("scanPattern");
      expect(hierarchy).toHaveProperty("attentionCapacity");
    });

    test("focus areas have probability weights", () => {
      const hierarchy = getFocusHierarchy("find_information");
      for (const area of hierarchy.focusAreas) {
        expect(area.probability).toBeGreaterThanOrEqual(0);
        expect(area.probability).toBeLessThanOrEqual(1);
        expect(area.relevanceBoost).toBeGreaterThan(0);
      }
    });
  });

  describe("COMMON_DISTRACTIONS", () => {
    test("includes cookie consent patterns", () => {
      const cookieFilter = COMMON_DISTRACTIONS.find(d => d.pattern.includes("cookie"));
      expect(cookieFilter).toBeDefined();
      expect(cookieFilter?.ignoreRate).toBeGreaterThan(0.5);
    });

    test("includes newsletter popup patterns", () => {
      const newsletterFilter = COMMON_DISTRACTIONS.find(d => d.pattern.includes("newsletter"));
      expect(newsletterFilter).toBeDefined();
      expect(newsletterFilter?.ignoreRate).toBeGreaterThan(0.5);
    });

    test("all distractions have valid ignore rates", () => {
      for (const distraction of COMMON_DISTRACTIONS) {
        expect(distraction.ignoreRate).toBeGreaterThanOrEqual(0);
        expect(distraction.ignoreRate).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("calculateFocusPriority", () => {
    test("returns higher priority for primary focus areas", () => {
      const hierarchy = getFocusHierarchy("find_information");
      const headingPriority = calculateFocusPriority(
        { area: "headings", text: "About Us" },
        hierarchy
      );
      const footerPriority = calculateFocusPriority(
        { area: "footer", text: "Copyright" },
        hierarchy
      );
      expect(headingPriority).toBeGreaterThan(footerPriority);
    });
  });

  describe("getDistractionIgnoreRate", () => {
    test("returns high ignore rate for cookie banners", () => {
      const rate = getDistractionIgnoreRate(
        { text: "Accept cookies", selector: ".cookie-banner" },
        COMMON_DISTRACTIONS
      );
      expect(rate).toBeGreaterThan(0.5);
    });

    test("returns 0 for non-distraction elements", () => {
      const rate = getDistractionIgnoreRate(
        { text: "Submit Order", selector: ".checkout-button" },
        COMMON_DISTRACTIONS
      );
      expect(rate).toBe(0);
    });
  });
});
