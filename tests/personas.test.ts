/**
 * Persona Tests
 *
 * Tests for persona loading, cognitive profiles, and accessibility personas.
 */

import { describe, test, expect } from "bun:test";
import {
  getPersona,
  listPersonas,
  getCognitiveProfile,
  listAccessibilityPersonas,
} from "../src/personas.js";

describe("Personas", () => {
  describe("listPersonas", () => {
    test("returns array of persona names", () => {
      const personas = listPersonas();
      expect(Array.isArray(personas)).toBe(true);
      expect(personas.length).toBeGreaterThan(0);
    });

    test("includes core personas", () => {
      const personas = listPersonas();
      expect(personas).toContain("first-timer");
      expect(personas).toContain("power-user");
      expect(personas).toContain("elderly-user");
    });
  });

  describe("getPersona", () => {
    test("returns first-timer persona", () => {
      const persona = getPersona("first-timer");
      expect(persona).toBeDefined();
      expect(persona?.name).toBe("first-timer");
      expect(persona?.cognitiveTraits).toBeDefined();
    });

    test("returns power-user persona", () => {
      const persona = getPersona("power-user");
      expect(persona).toBeDefined();
      expect(persona?.name).toBe("power-user");
    });

    test("returns undefined for unknown persona", () => {
      const persona = getPersona("nonexistent-persona");
      expect(persona).toBeUndefined();
    });

    test("persona has required cognitive traits", () => {
      const persona = getPersona("first-timer");
      expect(persona?.cognitiveTraits).toBeDefined();
      expect(persona?.cognitiveTraits).toHaveProperty("patience");
    });
  });

  describe("getCognitiveProfile", () => {
    test("returns cognitive profile for persona object", () => {
      const persona = getPersona("first-timer");
      expect(persona).toBeDefined();
      if (persona) {
        const profile = getCognitiveProfile(persona);
        expect(profile).toBeDefined();
      }
    });

    test("profile has expected structure", () => {
      const persona = getPersona("first-timer");
      expect(persona).toBeDefined();
      if (persona) {
        const profile = getCognitiveProfile(persona);
        expect(profile?.traits).toBeDefined();
      }
    });
  });

  describe("listAccessibilityPersonas", () => {
    test("returns array of accessibility persona names", () => {
      const personas = listAccessibilityPersonas();
      expect(Array.isArray(personas)).toBe(true);
      expect(personas.length).toBeGreaterThan(0);
    });

    test("includes disability-focused personas", () => {
      const personas = listAccessibilityPersonas();
      // Check for at least some accessibility personas
      const hasMotor = personas.some(p => p.includes("motor"));
      const hasVision = personas.some(p => p.includes("vision"));
      expect(hasMotor || hasVision).toBe(true);
    });
  });
});
