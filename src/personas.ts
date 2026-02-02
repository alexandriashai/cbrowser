/**
 * Built-in Personas for CBrowser
 *
 * Each persona represents a different user archetype with specific
 * behaviors, timing, and interaction patterns.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Persona } from "./types.js";

// ============================================================================
// Custom Personas Storage
// ============================================================================

const DATA_DIR = process.env.CBROWSER_DATA_DIR || join(homedir(), ".cbrowser");
const PERSONAS_DIR = join(DATA_DIR, "personas");

function ensurePersonasDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!existsSync(PERSONAS_DIR)) {
    mkdirSync(PERSONAS_DIR, { recursive: true });
  }
}

/**
 * Load all custom personas from disk.
 */
export function loadCustomPersonas(): Record<string, Persona> {
  ensurePersonasDir();
  const personas: Record<string, Persona> = {};

  try {
    const files = readdirSync(PERSONAS_DIR).filter(f => f.endsWith(".json"));
    for (const file of files) {
      try {
        const content = readFileSync(join(PERSONAS_DIR, file), "utf-8");
        const persona = JSON.parse(content) as Persona;
        personas[persona.name] = persona;
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return personas;
}

/**
 * Save a custom persona to disk.
 */
export function saveCustomPersona(persona: Persona): string {
  ensurePersonasDir();
  const filename = `${persona.name.toLowerCase().replace(/[^a-z0-9-]/g, "-")}.json`;
  const filepath = join(PERSONAS_DIR, filename);
  writeFileSync(filepath, JSON.stringify(persona, null, 2));
  return filepath;
}

/**
 * Delete a custom persona.
 */
export function deleteCustomPersona(name: string): boolean {
  ensurePersonasDir();
  const customPersonas = loadCustomPersonas();

  if (!customPersonas[name]) {
    return false;
  }

  const filename = `${name.toLowerCase().replace(/[^a-z0-9-]/g, "-")}.json`;
  const filepath = join(PERSONAS_DIR, filename);

  try {
    if (existsSync(filepath)) {
      unlinkSync(filepath);
      return true;
    }
  } catch {
    // Ignore errors
  }

  return false;
}

/**
 * Check if a persona name is a built-in (cannot be overwritten).
 */
export function isBuiltinPersona(name: string): boolean {
  return name in BUILTIN_PERSONAS;
}

// ============================================================================
// AI Persona Generation
// ============================================================================

/**
 * Generate a persona from a natural language description using AI.
 * This creates realistic behavioral parameters based on the description.
 */
export function generatePersonaFromDescription(
  name: string,
  description: string
): Persona {
  // Analyze description for key traits
  const descLower = description.toLowerCase();

  // Determine tech level
  let techLevel: "beginner" | "intermediate" | "expert" = "intermediate";
  if (descLower.match(/expert|developer|engineer|tech.?savvy|power user|advanced/)) {
    techLevel = "expert";
  } else if (descLower.match(/beginner|new|first.?time|elderly|senior|novice|learning/)) {
    techLevel = "beginner";
  }

  // Determine device
  let device: "desktop" | "mobile" | "tablet" = "desktop";
  if (descLower.match(/mobile|phone|smartphone|iphone|android/)) {
    device = "mobile";
  } else if (descLower.match(/tablet|ipad/)) {
    device = "tablet";
  }

  // Determine age range
  let ageRange = "25-45";
  if (descLower.match(/elderly|senior|older|65\+|retired/)) {
    ageRange = "65+";
  } else if (descLower.match(/teen|young|student|gen.?z|18-24/)) {
    ageRange = "18-24";
  } else if (descLower.match(/middle.?age|40s|50s/)) {
    ageRange = "45-65";
  }

  // Determine speed/patience traits
  const isImpatient = descLower.match(/impatient|rush|fast|quick|busy|frustrated|annoyed/);
  const isSlow = descLower.match(/slow|careful|cautious|elderly|senior|deliberate|thorough/);
  const isDistracted = descLower.match(/distract|adhd|multitask|busy|interrupt/);

  // Determine disability/accessibility needs
  const hasVisionIssues = descLower.match(/vision|blind|visually.?impaired|screen.?reader|low.?vision/);
  const hasMotorIssues = descLower.match(/motor|tremor|parkinson|arthritis|dexterity/);

  // Calculate timing parameters
  let reactionMin = 200, reactionMax = 500;
  let clickDelayMin = 100, clickDelayMax = 300;
  let typeSpeedMin = 50, typeSpeedMax = 120;
  let readingSpeed = 250;
  let scrollPauseMin = 200, scrollPauseMax = 500;

  if (techLevel === "expert" || isImpatient) {
    reactionMin = 100; reactionMax = 300;
    clickDelayMin = 50; clickDelayMax = 150;
    typeSpeedMin = 30; typeSpeedMax = 80;
    readingSpeed = 400;
    scrollPauseMin = 100; scrollPauseMax = 300;
  } else if (techLevel === "beginner" || isSlow) {
    reactionMin = 500; reactionMax = 1500;
    clickDelayMin = 300; clickDelayMax = 800;
    typeSpeedMin = 100; typeSpeedMax = 200;
    readingSpeed = 150;
    scrollPauseMin = 500; scrollPauseMax = 1500;
  }

  if (hasMotorIssues || ageRange === "65+") {
    reactionMin = Math.max(reactionMin, 800);
    reactionMax = Math.max(reactionMax, 2000);
    clickDelayMin = Math.max(clickDelayMin, 500);
    clickDelayMax = Math.max(clickDelayMax, 1200);
    typeSpeedMin = Math.max(typeSpeedMin, 150);
    typeSpeedMax = Math.max(typeSpeedMax, 300);
    readingSpeed = Math.min(readingSpeed, 100);
  }

  // Calculate error parameters
  let misClickRate = 0.05;
  let doubleClickAccidental = 0.03;
  let typoRate = 0.05;
  let backtrackRate = 0.1;

  if (techLevel === "expert") {
    misClickRate = 0.02;
    doubleClickAccidental = 0.01;
    typoRate = 0.02;
    backtrackRate = 0.05;
  } else if (techLevel === "beginner") {
    misClickRate = 0.1;
    doubleClickAccidental = 0.05;
    typoRate = 0.08;
    backtrackRate = 0.2;
  }

  if (hasMotorIssues) {
    misClickRate = Math.max(misClickRate, 0.2);
    doubleClickAccidental = Math.max(doubleClickAccidental, 0.15);
  }

  if (device === "mobile") {
    misClickRate = Math.max(misClickRate, 0.15);
    typoRate = Math.max(typoRate, 0.12);
  }

  // Calculate mouse parameters
  let curvature = 0.4;
  let jitter = 5;
  let overshoot = 0.1;
  let speed: "slow" | "normal" | "fast" = "normal";

  if (techLevel === "expert" || isImpatient) {
    curvature = 0.2;
    jitter = 2;
    overshoot = 0.05;
    speed = "fast";
  } else if (techLevel === "beginner" || isSlow) {
    curvature = 0.6;
    jitter = 8;
    overshoot = 0.15;
    speed = "slow";
  }

  if (hasMotorIssues) {
    jitter = Math.max(jitter, 12);
    overshoot = Math.max(overshoot, 0.25);
    speed = "slow";
  }

  if (hasVisionIssues) {
    // Screen reader users don't use mouse
    curvature = 0;
    jitter = 0;
    overshoot = 0;
  }

  // Calculate attention parameters
  let pattern: "f-pattern" | "z-pattern" | "skim" | "thorough" = "f-pattern";
  let scrollBehavior: "continuous" | "chunked" | "jump" = "chunked";
  let focusAreas: Array<"header" | "cta" | "images" | "prices" | "text"> = ["header", "cta", "text"];
  let distractionRate = 0.2;

  if (techLevel === "expert" || isImpatient) {
    pattern = "skim";
    scrollBehavior = "jump";
    focusAreas = ["cta", "prices"];
    distractionRate = 0.1;
  } else if (techLevel === "beginner" || isSlow) {
    pattern = "thorough";
    scrollBehavior = "chunked";
    focusAreas = ["header", "text", "images"];
    distractionRate = 0.3;
  }

  if (isDistracted) {
    distractionRate = Math.max(distractionRate, 0.5);
  }

  if (hasVisionIssues) {
    pattern = "thorough";
    focusAreas = ["header", "text"];
  }

  // Determine viewport
  let viewport: [number, number] = [1280, 800];
  if (device === "mobile") {
    viewport = [375, 812];
  } else if (device === "tablet") {
    viewport = [820, 1180];
  } else if (techLevel === "expert") {
    viewport = [1920, 1080];
  }

  // Build behaviors object
  const behaviors: Record<string, boolean> = {};

  if (techLevel === "expert") {
    behaviors.uses_keyboard_shortcuts = true;
    behaviors.reads_quickly = true;
    behaviors.skips_tutorials = true;
  }
  if (techLevel === "beginner") {
    behaviors.reads_everything = true;
    behaviors.hesitant_to_click = true;
    behaviors.follows_tutorials = true;
  }
  if (isImpatient) {
    behaviors.abandons_quickly = true;
    behaviors.skips_reading = true;
    behaviors.expects_speed = true;
  }
  if (hasVisionIssues) {
    behaviors.keyboard_only = true;
    behaviors.relies_on_aria = true;
    behaviors.needs_alt_text = true;
  }
  if (device === "mobile") {
    behaviors.uses_gestures = true;
    behaviors.expects_mobile_friendly = true;
    behaviors.short_sessions = true;
  }

  return {
    name,
    description,
    demographics: {
      age_range: ageRange,
      tech_level: techLevel,
      device,
    },
    behaviors,
    humanBehavior: {
      timing: {
        reactionTime: { min: reactionMin, max: reactionMax },
        clickDelay: { min: clickDelayMin, max: clickDelayMax },
        typeSpeed: { min: typeSpeedMin, max: typeSpeedMax },
        readingSpeed,
        scrollPauseTime: { min: scrollPauseMin, max: scrollPauseMax },
      },
      errors: {
        misClickRate,
        doubleClickAccidental,
        typoRate,
        backtrackRate,
      },
      mouse: {
        curvature,
        jitter,
        overshoot,
        speed,
      },
      attention: {
        pattern,
        scrollBehavior,
        focusAreas,
        distractionRate,
      },
    },
    context: {
      viewport,
    },
  };
}

// ============================================================================
// Built-in Personas
// ============================================================================

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
 * Checks custom personas first, then built-ins.
 */
export function getPersona(name: string): Persona | undefined {
  // Check custom personas first
  const customPersonas = loadCustomPersonas();
  if (customPersonas[name]) {
    return customPersonas[name];
  }

  // Fall back to built-ins
  return BUILTIN_PERSONAS[name];
}

/**
 * List all available persona names (built-in + custom).
 */
export function listPersonas(): string[] {
  const builtinNames = Object.keys(BUILTIN_PERSONAS);
  const customNames = Object.keys(loadCustomPersonas());

  // Combine and dedupe (custom personas with same name as built-in take precedence in getPersona)
  return [...new Set([...builtinNames, ...customNames])];
}

/**
 * List only custom persona names.
 */
export function listCustomPersonas(): string[] {
  return Object.keys(loadCustomPersonas());
}

/**
 * Get the custom personas directory path.
 */
export function getPersonasDir(): string {
  return PERSONAS_DIR;
}
