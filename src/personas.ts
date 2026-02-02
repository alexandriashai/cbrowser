/**
 * Built-in Personas for CBrowser
 *
 * Each persona represents a different user archetype with specific
 * behaviors, timing, and interaction patterns.
 */

import type { Persona } from "./types.js";

export const BUILTIN_PERSONAS: Record<string, Persona> = {
  "power-user": {
    name: "power-user",
    description: "Tech-savvy expert who expects efficiency and knows shortcuts",
    demographics: {
      age_range: "25-45",
      tech_level: "expert",
      device: "desktop",
    },
    behaviors: {
      uses_keyboard_shortcuts: true,
      reads_quickly: true,
      skips_tutorials: true,
      expects_instant_response: true,
    },
    humanBehavior: {
      timing: {
        reactionTime: { min: 100, max: 300 },
        clickDelay: { min: 50, max: 150 },
        typeSpeed: { min: 30, max: 80 },
        readingSpeed: 400,
        scrollPauseTime: { min: 100, max: 300 },
      },
      errors: {
        misClickRate: 0.02,
        doubleClickAccidental: 0.01,
        typoRate: 0.02,
        backtrackRate: 0.05,
      },
      mouse: {
        curvature: 0.2,
        jitter: 2,
        overshoot: 0.05,
        speed: "fast",
      },
      attention: {
        pattern: "skim",
        scrollBehavior: "jump",
        focusAreas: ["cta", "prices"],
        distractionRate: 0.1,
      },
    },
    context: {
      viewport: [1920, 1080],
    },
  },

  "first-timer": {
    name: "first-timer",
    description: "New user exploring for the first time, needs guidance",
    demographics: {
      age_range: "18-65",
      tech_level: "beginner",
      device: "desktop",
    },
    behaviors: {
      reads_everything: true,
      hesitant_to_click: true,
      follows_tutorials: true,
      asks_for_help: true,
    },
    humanBehavior: {
      timing: {
        reactionTime: { min: 500, max: 1500 },
        clickDelay: { min: 300, max: 800 },
        typeSpeed: { min: 100, max: 200 },
        readingSpeed: 150,
        scrollPauseTime: { min: 500, max: 1500 },
      },
      errors: {
        misClickRate: 0.1,
        doubleClickAccidental: 0.05,
        typoRate: 0.08,
        backtrackRate: 0.2,
      },
      mouse: {
        curvature: 0.6,
        jitter: 8,
        overshoot: 0.15,
        speed: "slow",
      },
      attention: {
        pattern: "thorough",
        scrollBehavior: "chunked",
        focusAreas: ["header", "text", "images"],
        distractionRate: 0.3,
      },
    },
    context: {
      viewport: [1280, 800],
    },
  },

  "mobile-user": {
    name: "mobile-user",
    description: "Smartphone user with touch interface and limited screen",
    demographics: {
      age_range: "18-45",
      tech_level: "intermediate",
      device: "mobile",
    },
    behaviors: {
      uses_gestures: true,
      easily_distracted: true,
      short_sessions: true,
      expects_mobile_friendly: true,
    },
    humanBehavior: {
      timing: {
        reactionTime: { min: 200, max: 600 },
        clickDelay: { min: 150, max: 400 },
        typeSpeed: { min: 80, max: 150 },
        readingSpeed: 200,
        scrollPauseTime: { min: 200, max: 500 },
      },
      errors: {
        misClickRate: 0.15,
        doubleClickAccidental: 0.08,
        typoRate: 0.12,
        backtrackRate: 0.15,
      },
      mouse: {
        curvature: 0.3,
        jitter: 15,
        overshoot: 0.2,
        speed: "normal",
      },
      attention: {
        pattern: "f-pattern",
        scrollBehavior: "continuous",
        focusAreas: ["header", "cta", "images"],
        distractionRate: 0.4,
      },
    },
    context: {
      viewport: [375, 812], // iPhone X dimensions
    },
  },

  "screen-reader-user": {
    name: "screen-reader-user",
    description: "Blind user navigating with screen reader and keyboard",
    demographics: {
      age_range: "25-65",
      tech_level: "intermediate",
      device: "desktop",
    },
    behaviors: {
      keyboard_only: true,
      relies_on_aria: true,
      needs_alt_text: true,
      sequential_navigation: true,
    },
    humanBehavior: {
      timing: {
        reactionTime: { min: 300, max: 800 },
        clickDelay: { min: 200, max: 500 },
        typeSpeed: { min: 50, max: 120 },
        readingSpeed: 250,
        scrollPauseTime: { min: 300, max: 700 },
      },
      errors: {
        misClickRate: 0.05,
        doubleClickAccidental: 0.02,
        typoRate: 0.04,
        backtrackRate: 0.25,
      },
      mouse: {
        curvature: 0,
        jitter: 0,
        overshoot: 0,
        speed: "normal",
      },
      attention: {
        pattern: "thorough",
        scrollBehavior: "chunked",
        focusAreas: ["header", "text"],
        distractionRate: 0.15,
      },
    },
    context: {
      viewport: [1280, 800],
    },
  },

  "elderly-user": {
    name: "elderly-user",
    description: "Older adult with potential vision and motor limitations",
    demographics: {
      age_range: "65+",
      tech_level: "beginner",
      device: "desktop",
    },
    behaviors: {
      prefers_large_text: true,
      careful_clicking: true,
      avoids_complexity: true,
      needs_clear_feedback: true,
    },
    humanBehavior: {
      timing: {
        reactionTime: { min: 800, max: 2000 },
        clickDelay: { min: 500, max: 1200 },
        typeSpeed: { min: 150, max: 300 },
        readingSpeed: 100,
        scrollPauseTime: { min: 800, max: 2000 },
      },
      errors: {
        misClickRate: 0.2,
        doubleClickAccidental: 0.15,
        typoRate: 0.1,
        backtrackRate: 0.3,
      },
      mouse: {
        curvature: 0.7,
        jitter: 12,
        overshoot: 0.25,
        speed: "slow",
      },
      attention: {
        pattern: "thorough",
        scrollBehavior: "chunked",
        focusAreas: ["header", "text", "cta"],
        distractionRate: 0.2,
      },
    },
    context: {
      viewport: [1280, 800],
    },
  },

  "impatient-user": {
    name: "impatient-user",
    description: "Quick to abandon slow or confusing experiences",
    demographics: {
      age_range: "18-45",
      tech_level: "intermediate",
      device: "desktop",
    },
    behaviors: {
      abandons_quickly: true,
      skips_reading: true,
      expects_speed: true,
      low_tolerance_for_errors: true,
    },
    humanBehavior: {
      timing: {
        reactionTime: { min: 100, max: 400 },
        clickDelay: { min: 80, max: 200 },
        typeSpeed: { min: 40, max: 100 },
        readingSpeed: 350,
        scrollPauseTime: { min: 100, max: 300 },
      },
      errors: {
        misClickRate: 0.08,
        doubleClickAccidental: 0.05,
        typoRate: 0.06,
        backtrackRate: 0.1,
      },
      mouse: {
        curvature: 0.3,
        jitter: 5,
        overshoot: 0.1,
        speed: "fast",
      },
      attention: {
        pattern: "skim",
        scrollBehavior: "jump",
        focusAreas: ["cta", "prices"],
        distractionRate: 0.5,
      },
    },
    context: {
      viewport: [1280, 800],
    },
  },
};

/**
 * Get a persona by name.
 */
export function getPersona(name: string): Persona | undefined {
  return BUILTIN_PERSONAS[name];
}

/**
 * List all available persona names.
 */
export function listPersonas(): string[] {
  return Object.keys(BUILTIN_PERSONAS);
}
