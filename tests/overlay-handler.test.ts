/**
 * Overlay Handler Tests
 *
 * Tests for overlay detection and classification (cookie consent, age verification, newsletters).
 */

import { describe, test, expect } from "bun:test";
import { OverlayHandler, OVERLAY_PATTERNS } from "../src/browser/overlay-handler.js";

describe("OverlayHandler", () => {
  describe("OVERLAY_PATTERNS", () => {
    test("includes cookie pattern with selectors", () => {
      const cookiePattern = OVERLAY_PATTERNS.find((p) => p.type === "cookie");
      expect(cookiePattern).toBeDefined();
      expect(cookiePattern?.selectors.length).toBeGreaterThan(0);
      expect(cookiePattern?.closeButtons.length).toBeGreaterThan(0);
    });

    test("includes age-verify pattern with selectors", () => {
      const agePattern = OVERLAY_PATTERNS.find((p) => p.type === "age-verify");
      expect(agePattern).toBeDefined();
      expect(agePattern?.selectors.length).toBeGreaterThan(0);
      expect(agePattern?.closeButtons.length).toBeGreaterThan(0);
    });

    test("includes newsletter pattern with selectors", () => {
      const newsletterPattern = OVERLAY_PATTERNS.find((p) => p.type === "newsletter");
      expect(newsletterPattern).toBeDefined();
      expect(newsletterPattern?.selectors.length).toBeGreaterThan(0);
      expect(newsletterPattern?.closeButtons.length).toBeGreaterThan(0);
    });

    test("cookie pattern includes common accept buttons", () => {
      const cookiePattern = OVERLAY_PATTERNS.find((p) => p.type === "cookie");
      const closeButtons = cookiePattern?.closeButtons || [];

      // Should include various accept variations
      expect(closeButtons.some((b) => b.includes("Accept"))).toBe(true);
      expect(closeButtons.some((b) => b.includes("Agree"))).toBe(true);
    });

    test("age-verify pattern includes common verification buttons", () => {
      const agePattern = OVERLAY_PATTERNS.find((p) => p.type === "age-verify");
      const closeButtons = agePattern?.closeButtons || [];

      // Should include age confirmation buttons
      expect(closeButtons.some((b) => b.includes("18") || b.includes("21"))).toBe(true);
    });
  });

  describe("classifyOverlayType", () => {
    const handler = new OverlayHandler({ verbose: false });

    test("classifies cookie consent text", () => {
      expect(handler.classifyOverlayType("This site uses cookies")).toBe("cookie");
      expect(handler.classifyOverlayType("We use cookies to improve your experience")).toBe("cookie");
      expect(handler.classifyOverlayType("Accept cookies")).toBe("cookie");
    });

    test("classifies GDPR/consent text as cookie", () => {
      expect(handler.classifyOverlayType("GDPR consent required")).toBe("cookie");
      expect(handler.classifyOverlayType("Privacy policy consent")).toBe("cookie");
    });

    test("classifies age verification text", () => {
      expect(handler.classifyOverlayType("You must be 18 or older")).toBe("age-verify");
      expect(handler.classifyOverlayType("Are you over 21?")).toBe("age-verify");
      expect(handler.classifyOverlayType("Age verification required")).toBe("age-verify");
      expect(handler.classifyOverlayType("Adult content - must be 18+")).toBe("age-verify");
    });

    test("classifies newsletter signup text", () => {
      expect(handler.classifyOverlayType("Subscribe to our newsletter")).toBe("newsletter");
      expect(handler.classifyOverlayType("Sign up for email updates")).toBe("newsletter");
      expect(handler.classifyOverlayType("Stay updated with our latest news")).toBe("newsletter");
    });

    test("returns unknown for unrecognized text", () => {
      expect(handler.classifyOverlayType("Welcome to our site")).toBe("unknown");
      expect(handler.classifyOverlayType("Loading...")).toBe("unknown");
      expect(handler.classifyOverlayType("")).toBe("unknown");
    });

    test("is case-insensitive", () => {
      expect(handler.classifyOverlayType("COOKIES")).toBe("cookie");
      expect(handler.classifyOverlayType("NEWSLETTER")).toBe("newsletter");
      expect(handler.classifyOverlayType("AGE VERIFICATION")).toBe("age-verify");
    });
  });

  describe("constructor", () => {
    test("accepts empty config", () => {
      const handler = new OverlayHandler();
      expect(handler).toBeDefined();
    });

    test("accepts verbose config", () => {
      const handler = new OverlayHandler({ verbose: true });
      expect(handler).toBeDefined();
    });
  });
});
