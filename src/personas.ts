/**
 * CBrowser - Cognitive Browser Automation
 * 
 * Copyright (c) 2026 WF Media (Alexandria Eden)
 * Email: alexandria.shai.eden@gmail.com
 * 
 * This source code is licensed under the Business Source License 1.1
 * found in the LICENSE file in the root directory of this source tree.
 * 
 * Non-production use is permitted. Production use requires a commercial license.
 * See LICENSE for full terms.
 */


/**
 * Built-in Personas for CBrowser
 *
 * Each persona represents a different user archetype with specific
 * behaviors, timing, and interaction patterns.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Persona, CognitiveTraits, CognitiveProfile, AttentionPatternType, DecisionStyleType } from "./types.js";
import { applyTraitCorrelations } from "./persona-questionnaire.js";

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
    const files = readdirSync(PERSONAS_DIR).filter(f => f.endsWith(".json") || f.endsWith(".yaml") || f.endsWith(".yml"));
    for (const file of files) {
      try {
        const content = readFileSync(join(PERSONAS_DIR, file), "utf-8");
        let persona: Persona;
        if (file.endsWith(".json")) {
          persona = JSON.parse(content) as Persona;
        } else {
          // Simple YAML parsing for persona files
          const nameMatch = content.match(/^name:\s*(.+)$/m);
          const descMatch = content.match(/^description:\s*(.+)$/m);
          persona = {
            name: nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, "") : file.replace(/\.(yaml|yml)$/, ""),
            description: descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, "") : "Custom persona",
            demographics: { age_range: "any", tech_level: "intermediate", device: "desktop" },
            behaviors: {},
            humanBehavior: BUILTIN_PERSONAS["first-timer"].humanBehavior,
            context: { viewport: [1280, 800] },
          } as Persona;
        }
        personas[persona.name] = persona;
      } catch (e) {
        console.debug(`[CBrowser] Skipping invalid persona file ${file}: ${(e as Error).message}`);
      }
    }
  } catch (e) {
    console.debug(`[CBrowser] Custom personas directory not readable: ${(e as Error).message}`);
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

  const baseName = name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const extensions = [".json", ".yaml", ".yml"];

  for (const ext of extensions) {
    const filepath = join(PERSONAS_DIR, `${baseName}${ext}`);
    try {
      if (existsSync(filepath)) {
        unlinkSync(filepath);
        return true;
      }
    } catch {
      // Ignore errors
    }
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

  // Generate cognitive traits based on analysis
  const cognitiveTraits: CognitiveTraits = generateCognitiveTraitsFromDescription(descLower, techLevel, isImpatient, isSlow, hasVisionIssues, ageRange);

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
    cognitiveTraits,
    context: {
      viewport,
    },
  };
}

// ============================================================================
// Cognitive Traits Generation (v8.3.0)
// ============================================================================

/**
 * Generate cognitive traits from a description analysis.
 */
function generateCognitiveTraitsFromDescription(
  descLower: string,
  techLevel: "beginner" | "intermediate" | "expert",
  isImpatient: RegExpMatchArray | null,
  isSlow: RegExpMatchArray | null,
  hasVisionIssues: RegExpMatchArray | null,
  ageRange: string
): CognitiveTraits {
  // Base traits by tech level
  let patience = 0.5;
  let riskTolerance = 0.5;
  let comprehension = 0.5;
  let persistence = 0.5;
  let curiosity = 0.5;
  let workingMemory = 0.5;
  let readingTendency = 0.5;
  let resilience = 0.5; // Research: Brief Resilience Scale (Smith et al., 2008)

  // Adjust by tech level
  if (techLevel === "expert") {
    patience = 0.3;
    riskTolerance = 0.9;
    comprehension = 0.95;
    persistence = 0.4;
    curiosity = 0.2;
    workingMemory = 0.9;
    readingTendency = 0.1;
    resilience = 0.85; // High - experts shrug off errors quickly
  } else if (techLevel === "beginner") {
    patience = 0.6;
    riskTolerance = 0.3;
    comprehension = 0.3;
    persistence = 0.5;
    curiosity = 0.7;
    workingMemory = 0.4;
    readingTendency = 0.8;
    resilience = 0.4; // Low-medium - beginners get discouraged
  }

  // Adjust for impatience
  if (isImpatient) {
    patience = Math.min(patience, 0.2);
    persistence = Math.min(persistence, 0.2);
    readingTendency = Math.min(readingTendency, 0.1);
    riskTolerance = Math.max(riskTolerance, 0.7);
    resilience = Math.min(resilience, 0.2); // Low - no recovery, abandons
  }

  // Adjust for slow/careful users
  if (isSlow) {
    patience = Math.max(patience, 0.8);
    riskTolerance = Math.min(riskTolerance, 0.2);
    readingTendency = Math.max(readingTendency, 0.9);
    // Careful users often have moderate resilience - methodical recovery
  }

  // Adjust for elderly
  if (ageRange === "65+") {
    patience = Math.max(patience, 0.9);
    riskTolerance = Math.min(riskTolerance, 0.15);
    comprehension = Math.min(comprehension, 0.25);
    workingMemory = Math.min(workingMemory, 0.35);
    readingTendency = Math.max(readingTendency, 0.85);
    resilience = Math.min(resilience, 0.3); // Low - frustration lingers with age
  }

  // Adjust for vision issues (screen reader users)
  if (hasVisionIssues) {
    patience = Math.max(patience, 0.8);
    comprehension = Math.max(comprehension, 0.7);  // They're experienced with a11y
    workingMemory = Math.max(workingMemory, 0.9);
    readingTendency = 1.0;  // Everything is read aloud
    persistence = Math.max(persistence, 0.85);
    resilience = Math.max(resilience, 0.8); // High - adapted to challenges (CD-RISC)
  }

  // Check for specific traits in description
  if (descLower.match(/curious|explor/)) {
    curiosity = Math.max(curiosity, 0.8);
  }
  if (descLower.match(/nervous|anxious|worried|afraid/)) {
    riskTolerance = Math.min(riskTolerance, 0.15);
    patience = Math.max(patience, 0.7);
  }
  if (descLower.match(/confident|bold|experienced/)) {
    riskTolerance = Math.max(riskTolerance, 0.8);
    comprehension = Math.max(comprehension, 0.7);
  }
  if (descLower.match(/forgetful|distract|adhd/)) {
    workingMemory = Math.min(workingMemory, 0.3);
    curiosity = Math.max(curiosity, 0.7);
  }

  // New cognitive traits (v15.0.0) - derive from existing analysis
  let informationForaging = 0.5;
  let changeBlindness = 0.3;
  let anchoringBias = 0.5;
  let timeHorizon = 0.5;
  let attributionStyle = 0.5;
  let metacognitivePlanning = 0.5;
  let proceduralFluency = 0.5;
  let transferLearning = 0.5;
  let authoritySensitivity = 0.5;
  let emotionalContagion = 0.5;
  let fearOfMissingOut = 0.5;
  let socialProofSensitivity = 0.5;
  let mentalModelRigidity = 0.5;

  // Adjust new traits by tech level
  if (techLevel === "expert") {
    informationForaging = 0.9;   // Experts follow scent efficiently
    changeBlindness = 0.2;       // Notice UI changes
    anchoringBias = 0.3;         // Less anchored, compare options
    timeHorizon = 0.3;           // Plan for long-term
    attributionStyle = 0.2;      // Blame system, not self
    metacognitivePlanning = 0.8; // Plan before acting
    proceduralFluency = 0.9;     // Follow procedures easily
    transferLearning = 0.95;     // Apply knowledge across UIs
    authoritySensitivity = 0.3;  // Question authority, verify
    emotionalContagion = 0.2;    // Mood-stable
    fearOfMissingOut = 0.2;      // Not swayed by urgency
    socialProofSensitivity = 0.3; // Evaluate on merits
    mentalModelRigidity = 0.8;   // Adapt to new patterns
  } else if (techLevel === "beginner") {
    informationForaging = 0.3;   // Exhaustive search
    changeBlindness = 0.6;       // Miss peripheral changes
    anchoringBias = 0.7;         // Anchored to first info
    timeHorizon = 0.7;           // Want immediate results
    attributionStyle = 0.8;      // Blame self for errors
    metacognitivePlanning = 0.3; // Impulsive trial-and-error
    proceduralFluency = 0.3;     // Struggle with sequences
    transferLearning = 0.2;      // Each UI is novel
    authoritySensitivity = 0.8;  // Follow authority cues
    emotionalContagion = 0.7;    // Mood influenced by UI
    fearOfMissingOut = 0.7;      // Susceptible to urgency
    socialProofSensitivity = 0.8; // Rely on reviews
    mentalModelRigidity = 0.3;   // Struggle with new patterns
  }

  // Adjust for impatience
  if (isImpatient) {
    informationForaging = Math.max(informationForaging, 0.8); // Quick scent-following
    timeHorizon = Math.max(timeHorizon, 0.9);                 // Want results NOW
    metacognitivePlanning = Math.min(metacognitivePlanning, 0.2); // No planning
    fearOfMissingOut = Math.max(fearOfMissingOut, 0.8);       // Respond to urgency
  }

  // Adjust for slow/careful users
  if (isSlow) {
    changeBlindness = Math.min(changeBlindness, 0.2);         // Notice changes
    timeHorizon = Math.min(timeHorizon, 0.3);                 // Long-term focused
    metacognitivePlanning = Math.max(metacognitivePlanning, 0.8); // Plan carefully
    fearOfMissingOut = Math.min(fearOfMissingOut, 0.2);       // Not swayed by urgency
  }

  // Adjust for elderly
  if (ageRange === "65+") {
    informationForaging = Math.min(informationForaging, 0.3); // Exhaustive search
    changeBlindness = Math.max(changeBlindness, 0.7);         // Miss changes
    anchoringBias = Math.max(anchoringBias, 0.7);             // Anchored to first info
    attributionStyle = Math.max(attributionStyle, 0.8);       // Blame self
    proceduralFluency = Math.min(proceduralFluency, 0.35);    // Struggle with sequences
    transferLearning = Math.min(transferLearning, 0.25);      // Each UI novel
    authoritySensitivity = Math.max(authoritySensitivity, 0.7); // Trust authority
    mentalModelRigidity = Math.min(mentalModelRigidity, 0.2); // Rigid mental models
  }

  // Adjust for vision issues (screen reader users)
  if (hasVisionIssues) {
    informationForaging = Math.max(informationForaging, 0.7); // Sequential but efficient
    changeBlindness = Math.min(changeBlindness, 0.3);         // ARIA live regions help
    metacognitivePlanning = Math.max(metacognitivePlanning, 0.8); // Plan navigation
    proceduralFluency = Math.max(proceduralFluency, 0.8);     // Follow structures
    transferLearning = Math.max(transferLearning, 0.7);       // Know a11y patterns
  }

  return {
    patience,
    riskTolerance,
    comprehension,
    persistence,
    curiosity,
    workingMemory,
    readingTendency,
    resilience, // v10.6.0: Brief Resilience Scale (Smith et al., 2008)
    // New traits (v15.0.0)
    informationForaging,
    changeBlindness,
    anchoringBias,
    timeHorizon,
    attributionStyle,
    metacognitivePlanning,
    proceduralFluency,
    transferLearning,
    authoritySensitivity,
    emotionalContagion,
    fearOfMissingOut,
    socialProofSensitivity,
    mentalModelRigidity,
  };
}

/**
 * Create a cognitive persona with explicit trait values.
 * Use this when you want fine-grained control over cognitive traits.
 */
export function createCognitivePersona(
  name: string,
  description: string,
  traits: Partial<CognitiveTraits>,
  options: {
    techLevel?: "beginner" | "intermediate" | "expert";
    device?: "desktop" | "mobile" | "tablet";
    ageRange?: string;
    attentionPattern?: AttentionPatternType;
    decisionStyle?: DecisionStyleType;
    innerVoiceTemplate?: string;
  } = {}
): Persona {
  // Start with a base persona from description
  const basePersona = generatePersonaFromDescription(name, description);

  // Merge provided traits with defaults
  const cognitiveTraits: CognitiveTraits = {
    patience: traits.patience ?? basePersona.cognitiveTraits?.patience ?? 0.5,
    riskTolerance: traits.riskTolerance ?? basePersona.cognitiveTraits?.riskTolerance ?? 0.5,
    comprehension: traits.comprehension ?? basePersona.cognitiveTraits?.comprehension ?? 0.5,
    persistence: traits.persistence ?? basePersona.cognitiveTraits?.persistence ?? 0.5,
    curiosity: traits.curiosity ?? basePersona.cognitiveTraits?.curiosity ?? 0.5,
    workingMemory: traits.workingMemory ?? basePersona.cognitiveTraits?.workingMemory ?? 0.5,
    readingTendency: traits.readingTendency ?? basePersona.cognitiveTraits?.readingTendency ?? 0.5,
    resilience: traits.resilience ?? basePersona.cognitiveTraits?.resilience ?? 0.5,
    // New traits (v15.0.0)
    informationForaging: traits.informationForaging ?? basePersona.cognitiveTraits?.informationForaging ?? 0.5,
    changeBlindness: traits.changeBlindness ?? basePersona.cognitiveTraits?.changeBlindness ?? 0.3,
    anchoringBias: traits.anchoringBias ?? basePersona.cognitiveTraits?.anchoringBias ?? 0.5,
    timeHorizon: traits.timeHorizon ?? basePersona.cognitiveTraits?.timeHorizon ?? 0.5,
    attributionStyle: traits.attributionStyle ?? basePersona.cognitiveTraits?.attributionStyle ?? 0.5,
    metacognitivePlanning: traits.metacognitivePlanning ?? basePersona.cognitiveTraits?.metacognitivePlanning ?? 0.5,
    proceduralFluency: traits.proceduralFluency ?? basePersona.cognitiveTraits?.proceduralFluency ?? 0.5,
    transferLearning: traits.transferLearning ?? basePersona.cognitiveTraits?.transferLearning ?? 0.5,
    authoritySensitivity: traits.authoritySensitivity ?? basePersona.cognitiveTraits?.authoritySensitivity ?? 0.5,
    emotionalContagion: traits.emotionalContagion ?? basePersona.cognitiveTraits?.emotionalContagion ?? 0.5,
    fearOfMissingOut: traits.fearOfMissingOut ?? basePersona.cognitiveTraits?.fearOfMissingOut ?? 0.5,
    socialProofSensitivity: traits.socialProofSensitivity ?? basePersona.cognitiveTraits?.socialProofSensitivity ?? 0.5,
    mentalModelRigidity: traits.mentalModelRigidity ?? basePersona.cognitiveTraits?.mentalModelRigidity ?? 0.5,
  };

  // Update demographics if provided
  if (options.techLevel) {
    basePersona.demographics.tech_level = options.techLevel;
  }
  if (options.device) {
    basePersona.demographics.device = options.device;
  }
  if (options.ageRange) {
    basePersona.demographics.age_range = options.ageRange;
  }

  // Store attention pattern and decision style in behaviors
  if (options.attentionPattern) {
    basePersona.behaviors.attentionPattern = options.attentionPattern;
  }
  if (options.decisionStyle) {
    basePersona.behaviors.decisionStyle = options.decisionStyle;
  }
  if (options.innerVoiceTemplate) {
    basePersona.behaviors.innerVoiceTemplate = options.innerVoiceTemplate;
  }

  // v16.7.2: Apply research-based trait correlations to infer related traits
  // This prevents personas from having many 0.5 defaults when only a few traits are set
  applyTraitCorrelations(cognitiveTraits);

  basePersona.cognitiveTraits = cognitiveTraits;

  return basePersona;
}

/**
 * Get the cognitive profile for a persona.
 * Returns cognitive traits plus attention pattern and decision style.
 */
export function getCognitiveProfile(persona: Persona | AccessibilityPersona): CognitiveProfile {
  // Derive attention pattern from humanBehavior.attention.pattern or behaviors
  let attentionPattern: AttentionPatternType = "f-pattern";
  if (persona.humanBehavior?.attention?.pattern) {
    const pattern = persona.humanBehavior.attention.pattern;
    if (pattern === "skim") attentionPattern = "skim";
    else if (pattern === "thorough") attentionPattern = "thorough";
    else if (pattern === "f-pattern") attentionPattern = "f-pattern";
    else if (pattern === "z-pattern") attentionPattern = "z-pattern";
  }
  if (persona.behaviors.attentionPattern) {
    attentionPattern = persona.behaviors.attentionPattern as AttentionPatternType;
  }

  // Derive decision style from traits
  let decisionStyle: DecisionStyleType = "cautious";
  const traits = persona.cognitiveTraits;

  // v16.7.1: Validate trait completeness
  if (traits) {
    const expectedTraitCount = 25; // 7 required + 18 optional
    const actualTraitCount = Object.keys(traits).filter(k => traits[k as keyof typeof traits] !== undefined).length;
    if (actualTraitCount < expectedTraitCount) {
      console.warn(
        `[CBrowser] Persona "${persona.name}" has ${actualTraitCount}/${expectedTraitCount} traits. ` +
        `Missing traits will use defaults. Consider regenerating the persona for full 25-trait model.`
      );
    }
  }
  if (traits) {
    // v16.14.1: Use optional chaining and defaults for Partial<CognitiveTraits> compatibility
    const patience = traits.patience ?? 0.5;
    const riskTolerance = traits.riskTolerance ?? 0.5;
    const comprehension = traits.comprehension ?? 0.5;
    const readingTendency = traits.readingTendency ?? 0.5;

    if (patience < 0.3 && riskTolerance > 0.6) {
      decisionStyle = "impulsive";
    } else if (comprehension > 0.8 && patience < 0.4) {
      decisionStyle = "efficient";
    } else if (riskTolerance < 0.3) {
      decisionStyle = "cautious";
    } else if (readingTendency > 0.8 && patience > 0.7) {
      decisionStyle = "deliberate";
    } else if (persona.demographics.device === "mobile") {
      decisionStyle = "quick-tap";
    }
  }
  if (persona.behaviors.decisionStyle) {
    decisionStyle = persona.behaviors.decisionStyle as DecisionStyleType;
  }

  // v16.14.1: Merge traits with defaults to ensure complete CognitiveTraits
  // This handles both Persona (full traits) and AccessibilityPersona (partial traits)
  const defaultTraits: CognitiveTraits = {
    // Required traits (7)
    patience: 0.5,
    riskTolerance: 0.5,
    comprehension: 0.5,
    persistence: 0.5,
    curiosity: 0.5,
    workingMemory: 0.5,
    readingTendency: 0.5,
    // Optional traits - Tier 1: Core (v10.6.0+)
    resilience: 0.5, // Brief Resilience Scale (Smith et al., 2008)
    selfEfficacy: 0.5, // v16.7.1: Bandura (1977) - was missing!
    satisficing: 0.5, // v16.7.1: Simon (1956) - was missing!
    trustCalibration: 0.5, // v16.7.1: Fogg (2003) - was missing!
    interruptRecovery: 0.5, // v16.7.1: Mark et al. (2005) - was missing!
    // Optional traits - Tier 2+ (v15.0.0)
    informationForaging: 0.5,
    changeBlindness: 0.3,
    anchoringBias: 0.5,
    timeHorizon: 0.5,
    attributionStyle: 0.5,
    metacognitivePlanning: 0.5,
    proceduralFluency: 0.5,
    transferLearning: 0.5,
    authoritySensitivity: 0.5,
    emotionalContagion: 0.5,
    fearOfMissingOut: 0.5,
    socialProofSensitivity: 0.5,
    mentalModelRigidity: 0.5,
  };

  return {
    traits: traits ? { ...defaultTraits, ...traits } : defaultTraits,
    attentionPattern,
    decisionStyle,
    innerVoiceTemplate: persona.behaviors.innerVoiceTemplate as string | undefined,
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
    cognitiveTraits: {
      patience: 0.3,          // Low - expects things to work
      riskTolerance: 0.9,     // High - clicks confidently
      comprehension: 0.95,    // Expert - knows all conventions
      persistence: 0.4,       // Low - switches approaches quickly
      curiosity: 0.2,         // Low - stays focused on goal
      workingMemory: 0.9,     // High - never repeats attempts
      readingTendency: 0.1,   // Low - scans for shortcuts
      resilience: 0.85,       // High - shrugs off errors quickly (BRS)
      selfEfficacy: 0.9,      // High - trusts own expertise (Bandura)
      satisficing: 0.3,       // Low - knows quality, seeks optimal (Simon)
      trustCalibration: 0.7,  // High - trusts tech but verifies (Fogg)
      interruptRecovery: 0.85, // High - uses env cues, resumes fast (Mark)
      // New traits (v15.0.0)
      informationForaging: 0.9,   // High - follows scent efficiently
      changeBlindness: 0.2,       // Low - notices UI changes
      anchoringBias: 0.3,         // Low - compares options freely
      timeHorizon: 0.3,           // Long-term - invests in learning
      attributionStyle: 0.2,      // Blames system - "this is broken"
      metacognitivePlanning: 0.8, // High - plans before acting
      proceduralFluency: 0.9,     // High - follows procedures easily
      transferLearning: 0.95,     // High - applies knowledge across UIs
      authoritySensitivity: 0.3,  // Low - questions authority, verifies
      emotionalContagion: 0.2,    // Low - mood-stable
      fearOfMissingOut: 0.2,      // Low - not swayed by urgency
      socialProofSensitivity: 0.3, // Low - evaluates on merits
      mentalModelRigidity: 0.8,   // High - adapts to new patterns
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
    cognitiveTraits: {
      patience: 0.6,          // Medium - willing to learn
      riskTolerance: 0.3,     // Low - hesitates before clicking
      comprehension: 0.3,     // Low - doesn't know conventions
      persistence: 0.5,       // Medium - tries a few times
      curiosity: 0.7,         // High - explores the interface
      workingMemory: 0.4,     // Medium - might repeat mistakes
      readingTendency: 0.8,   // High - reads tooltips and help
      resilience: 0.4,        // Low-medium - new users get discouraged (BRS)
      selfEfficacy: 0.4,      // Low - uncertain of abilities (Bandura)
      satisficing: 0.5,       // Medium - unsure what's "good enough" (Simon)
      trustCalibration: 0.4,  // Low - skeptical, unsure what to trust (Fogg)
      interruptRecovery: 0.35, // Low - easily loses place, restarts (Mark)
      // New traits (v15.0.0)
      informationForaging: 0.3,   // Low - exhaustive search, clicks everything
      changeBlindness: 0.6,       // High - misses peripheral changes
      anchoringBias: 0.7,         // High - anchored to first information
      timeHorizon: 0.7,           // Short-term - wants quick results
      attributionStyle: 0.7,      // Self-blaming - "I must be doing it wrong"
      metacognitivePlanning: 0.3, // Low - trial-and-error approach
      proceduralFluency: 0.35,    // Low - struggles with multi-step flows
      transferLearning: 0.2,      // Low - each interface feels new
      authoritySensitivity: 0.8,  // High - trusts official-looking cues
      emotionalContagion: 0.7,    // High - influenced by UI tone
      fearOfMissingOut: 0.6,      // Medium-high - susceptible to urgency
      socialProofSensitivity: 0.8, // High - relies heavily on reviews
      mentalModelRigidity: 0.3,   // Low - struggles when patterns break
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
    cognitiveTraits: {
      patience: 0.4,          // Low - mobile = quick tasks
      riskTolerance: 0.6,     // Medium - taps somewhat freely
      comprehension: 0.6,     // Medium - knows mobile patterns
      persistence: 0.3,       // Low - gives up if fiddly
      curiosity: 0.3,         // Low - wants to complete and go
      workingMemory: 0.5,     // Medium
      readingTendency: 0.3,   // Low - minimal reading on mobile
      resilience: 0.5,        // Medium - recovers if next try works (BRS)
      selfEfficacy: 0.6,      // Medium - comfortable in mobile context (Bandura)
      satisficing: 0.8,       // High - mobile context demands quick decisions (Simon)
      trustCalibration: 0.6,  // Medium - quick decisions, moderate trust (Fogg)
      interruptRecovery: 0.45, // Low-Med - constant phone interruptions (Mark)
      // New traits (v15.0.0)
      informationForaging: 0.7,   // High - efficient mobile navigation
      changeBlindness: 0.5,       // Medium - small screen limits peripheral
      anchoringBias: 0.5,         // Medium
      timeHorizon: 0.8,           // Very short-term - mobile is quick tasks
      attributionStyle: 0.4,      // Medium - blames small screen/touch
      metacognitivePlanning: 0.4, // Low-medium - quick decisions
      proceduralFluency: 0.6,     // Medium - knows mobile patterns
      transferLearning: 0.7,      // High - mobile UI conventions
      authoritySensitivity: 0.5,  // Medium
      emotionalContagion: 0.5,    // Medium
      fearOfMissingOut: 0.7,      // High - push notifications, urgency
      socialProofSensitivity: 0.6, // Medium-high - app store ratings
      mentalModelRigidity: 0.6,   // Medium - adapts to mobile patterns
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
    cognitiveTraits: {
      patience: 0.8,          // High - used to slow navigation
      riskTolerance: 0.5,     // Medium - careful but experienced
      comprehension: 0.8,     // High - expert at a11y patterns
      persistence: 0.9,       // High - determination required
      curiosity: 0.2,         // Low - structured navigation
      workingMemory: 0.9,     // High - mental model essential
      readingTendency: 1.0,   // Full - ALL content is read aloud
      resilience: 0.8,        // High - experienced with setbacks (CD-RISC)
      selfEfficacy: 0.5,      // Medium - high in accessible sites, low otherwise (Bandura)
      satisficing: 0.6,       // Medium - relies on structured review content (Simon)
      trustCalibration: 0.5,  // Medium - cautious from past a11y failures (Fogg)
      interruptRecovery: 0.75, // High - strong mental model aids recovery (Mark)
      // New traits (v15.0.0)
      informationForaging: 0.7,   // High - sequential but efficient with landmarks
      changeBlindness: 0.3,       // Low - ARIA live regions announce changes
      anchoringBias: 0.4,         // Medium - sequential exposure to info
      timeHorizon: 0.3,           // Long-term - patient, thorough
      attributionStyle: 0.4,      // Medium - blames inaccessible design
      metacognitivePlanning: 0.85, // Very high - plans navigation carefully
      proceduralFluency: 0.8,     // High - follows heading structure
      transferLearning: 0.75,     // High - knows a11y patterns across sites
      authoritySensitivity: 0.5,  // Medium - verifies with screen reader
      emotionalContagion: 0.3,    // Low - focused on structure, not tone
      fearOfMissingOut: 0.2,      // Low - methodical, not impulsive
      socialProofSensitivity: 0.5, // Medium - reviews are accessible info
      mentalModelRigidity: 0.6,   // Medium - adapts but needs time
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
    cognitiveTraits: {
      patience: 0.9,          // High - not in a rush
      riskTolerance: 0.1,     // Very low - afraid of mistakes
      comprehension: 0.2,     // Low - unfamiliar with modern UI
      persistence: 0.7,       // High - determined but confused
      curiosity: 0.1,         // Very low - just wants to finish
      workingMemory: 0.3,     // Low - may forget steps
      readingTendency: 0.9,   // High - reads everything carefully
      resilience: 0.3,        // Low - frustration lingers longer (BRS age-related)
      selfEfficacy: 0.3,      // Low - often blame themselves for tech issues (Bandura)
      satisficing: 0.7,       // High - values simplicity over optimization (Simon)
      trustCalibration: 0.25, // Very low - skeptical of online requests (Fogg)
      interruptRecovery: 0.3,  // Low - difficulty resuming, forgets context (Mark)
      // New traits (v15.0.0)
      informationForaging: 0.25,  // Very low - exhaustive, uncertain search
      changeBlindness: 0.7,       // High - misses UI updates and changes
      anchoringBias: 0.8,         // High - sticks to first information
      timeHorizon: 0.4,           // Medium - patient but unsure of value
      attributionStyle: 0.85,     // Very high - blames self for all errors
      metacognitivePlanning: 0.25, // Low - doesn't know what to plan for
      proceduralFluency: 0.3,     // Low - struggles with multi-step processes
      transferLearning: 0.2,      // Low - each new site is confusing
      authoritySensitivity: 0.85, // Very high - trusts official-looking things
      emotionalContagion: 0.6,    // Medium-high - affected by stern warnings
      fearOfMissingOut: 0.3,      // Low - not driven by urgency, confused by it
      socialProofSensitivity: 0.7, // High - relies on grandchildren's recommendations
      mentalModelRigidity: 0.2,   // Very low - rigid, struggles with novel UIs
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
    cognitiveTraits: {
      patience: 0.1,          // Very low - abandons instantly
      riskTolerance: 0.8,     // High - clicks first thing
      comprehension: 0.5,     // Medium
      persistence: 0.1,       // Very low - one strike and out
      curiosity: 0.1,         // Very low - no time to explore
      workingMemory: 0.6,     // Medium
      readingTendency: 0.05,  // Almost none - scanning only
      resilience: 0.2,        // Very low - no recovery, abandons (BRS)
      selfEfficacy: 0.5,      // Medium - impatient doesn't mean incapable (Bandura)
      satisficing: 0.9,       // Very high - definition of satisficing (Simon)
      trustCalibration: 0.7,  // High - clicks through without reading (Fogg)
      interruptRecovery: 0.2,  // Very low - abandons rather than resumes (Mark)
      // New traits (v15.0.0)
      informationForaging: 0.9,   // Very high - follows first scent, moves on
      changeBlindness: 0.5,       // Medium - focused on task
      anchoringBias: 0.6,         // Medium-high - goes with first option
      timeHorizon: 0.95,          // Maximum short-term - no time for later
      attributionStyle: 0.3,      // Low - blames slow site
      metacognitivePlanning: 0.1, // Very low - no planning, just clicking
      proceduralFluency: 0.5,     // Medium - can follow if fast
      transferLearning: 0.7,      // High - recognizes patterns quickly
      authoritySensitivity: 0.4,  // Medium - only if it speeds things up
      emotionalContagion: 0.4,    // Medium - focused on goal, not tone
      fearOfMissingOut: 0.9,      // Very high - urgency works on them
      socialProofSensitivity: 0.5, // Medium - if it's quick to evaluate
      mentalModelRigidity: 0.7,   // High - adapts quickly, expects conventions
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

// ============================================================================
// Accessibility-Focused Personas (v8.0.0)
// ============================================================================

import type { AccessibilityPersona } from "./types.js";

/**
 * Built-in accessibility personas for empathy testing.
 * These simulate how people with different disabilities experience websites.
 */
export const ACCESSIBILITY_PERSONAS: Record<string, AccessibilityPersona> = {
  "motor-impairment-tremor": {
    name: "motor-impairment-tremor",
    // Research: Essential tremor prevalence 0.4-5.6% (npj Digital Medicine 2019)
    // SteadyMouse/anti-tremor tools filter 1-15Hz tremor frequencies
    // Cursor jitter and misclicks are primary computer use barriers
    description: "User with essential tremor affecting fine motor control",
    demographics: {
      age_range: "40-65",
      tech_level: "intermediate",
      device: "desktop",
    },
    behaviors: {
      careful_clicking: true,
      avoids_small_targets: true,
      prefers_large_buttons: true,
      uses_keyboard_when_possible: true,
    },
    humanBehavior: {
      timing: {
        reactionTime: { min: 600, max: 1500 },
        clickDelay: { min: 400, max: 1000 },
        typeSpeed: { min: 150, max: 300 },
        readingSpeed: 200,
        scrollPauseTime: { min: 500, max: 1200 },
      },
      errors: {
        misClickRate: 0.35,
        doubleClickAccidental: 0.25,
        typoRate: 0.15,
        backtrackRate: 0.25,
      },
      mouse: {
        curvature: 0.8,
        jitter: 20,
        overshoot: 0.4,
        speed: "slow",
      },
      attention: {
        pattern: "thorough",
        scrollBehavior: "chunked",
        focusAreas: ["header", "cta", "text"],
        distractionRate: 0.2,
      },
    },
    context: {
      viewport: [1280, 800],
    },
    accessibilityTraits: {
      motorControl: 0.3,
      tremor: true,
      reachability: 0.7,
      processingSpeed: 0.8, // Cognitive function is fine
      attentionSpan: 0.7,
      fatigueSusceptibility: 0.5,
    },
    cognitiveTraits: {
      // Research: Motor impairment + self-efficacy (Lorig et al., 2001 - Chronic Disease Self-Management)
      // Adapted users maintain moderate efficacy despite physical challenges
      selfEfficacy: 0.5,
      // Research: Physical effort increases satisficing (Kool et al., 2010 - Effort discounting)
      // Motor strain leads to accepting "good enough" to minimize fatigue
      satisficing: 0.7,
      // Research: Chronic condition users develop moderate trust (Lorig 2001)
      trustCalibration: 0.5,
      // Research: Motor issues make resumption harder but adaptation helps (Mark)
      interruptRecovery: 0.4,
      // New traits (v15.0.0)
      patience: 0.6,
      riskTolerance: 0.4,
      comprehension: 0.7,
      persistence: 0.7,
      curiosity: 0.4,
      workingMemory: 0.7,
      readingTendency: 0.6,
      resilience: 0.6,
      informationForaging: 0.5,
      changeBlindness: 0.4,
      anchoringBias: 0.5,
      timeHorizon: 0.4,           // Patient due to motor constraints
      attributionStyle: 0.4,      // Blames physical constraints, not self
      metacognitivePlanning: 0.7, // Plans to avoid difficult interactions
      proceduralFluency: 0.6,
      transferLearning: 0.6,
      authoritySensitivity: 0.5,
      emotionalContagion: 0.4,
      fearOfMissingOut: 0.3,      // Not swayed, focused on completing
      socialProofSensitivity: 0.5,
      mentalModelRigidity: 0.5,
    },
  },

  "low-vision-magnified": {
    name: "low-vision-magnified",
    // ~2.2 billion people have vision impairment globally (WHO)
    // 3x magnification = effectively sees 1/9th of screen at once
    // Causes "tunnel vision" effect and frequent scrolling/panning
    description: "User with low vision using 3x screen magnification",
    demographics: {
      age_range: "45-75",
      tech_level: "intermediate",
      device: "desktop",
    },
    behaviors: {
      uses_zoom: true,
      needs_high_contrast: true,
      reads_slowly: true,
      misses_peripheral_content: true,
    },
    humanBehavior: {
      timing: {
        reactionTime: { min: 400, max: 1000 },
        clickDelay: { min: 300, max: 700 },
        typeSpeed: { min: 100, max: 180 },
        readingSpeed: 100, // Slower due to magnification
        scrollPauseTime: { min: 600, max: 1500 },
      },
      errors: {
        misClickRate: 0.15,
        doubleClickAccidental: 0.05,
        typoRate: 0.08,
        backtrackRate: 0.3, // Often scrolls past content
      },
      mouse: {
        curvature: 0.5,
        jitter: 5,
        overshoot: 0.15,
        speed: "slow",
      },
      attention: {
        pattern: "thorough",
        scrollBehavior: "jump", // Jumps around due to limited visible area
        focusAreas: ["header", "text"],
        distractionRate: 0.15,
      },
    },
    context: {
      viewport: [1280, 800], // But effectively sees 1/9th at a time
    },
    accessibilityTraits: {
      visionLevel: 0.3,
      contrastSensitivity: 3.0,
      processingSpeed: 0.7,
      attentionSpan: 0.6, // Fatigue from straining to see
      fatigueSusceptibility: 0.6,
    },
    cognitiveTraits: {
      // Research: Visual impairment + self-efficacy (Brody et al., 2002 - AMD and depression)
      // Reduced vision correlates with lower confidence in task completion
      selfEfficacy: 0.45,
      // Research: Limited information access increases satisficing (Pachur & Hertwig, 2006)
      // Seeing only 1/9th of screen at a time → accept accessible options
      satisficing: 0.65,
      // Research: Vision impairment increases caution (Brody 2002)
      trustCalibration: 0.4,
      // Research: Limited visible area makes context recovery harder (Mark)
      interruptRecovery: 0.35,
      // New traits (v15.0.0)
      patience: 0.7,
      riskTolerance: 0.3,
      comprehension: 0.6,
      persistence: 0.7,
      curiosity: 0.3,
      workingMemory: 0.6,
      readingTendency: 0.8,       // Reads carefully when visible
      resilience: 0.5,
      informationForaging: 0.4,   // Limited by zoom - systematic search
      changeBlindness: 0.8,       // Very high - can't see peripheral
      anchoringBias: 0.6,         // Anchored due to limited comparison
      timeHorizon: 0.4,           // Patient, knows it takes time
      attributionStyle: 0.5,      // Balanced - knows about limitations
      metacognitivePlanning: 0.7, // Plans navigation with zoom
      proceduralFluency: 0.5,     // Harder with limited view
      transferLearning: 0.5,      // Standard
      authoritySensitivity: 0.5,
      emotionalContagion: 0.4,
      fearOfMissingOut: 0.3,      // Not swayed - focused
      socialProofSensitivity: 0.5,
      mentalModelRigidity: 0.4,   // Adapts but needs time
    },
  },

  "cognitive-adhd": {
    name: "cognitive-adhd",
    // Research: 75-81% of ADHD cases show central executive WM impairment (PMC7483636)
    // Impulsivity affects persistence and patience significantly
    description: "User with ADHD affecting focus and working memory",
    demographics: {
      age_range: "18-45",
      tech_level: "intermediate",
      device: "desktop",
    },
    behaviors: {
      easily_distracted: true,
      skips_around: true,
      impatient_with_long_forms: true,
      forgets_previous_steps: true,
    },
    humanBehavior: {
      timing: {
        reactionTime: { min: 150, max: 600 }, // Can be fast when hyperfocused
        clickDelay: { min: 100, max: 400 },
        typeSpeed: { min: 50, max: 120 },
        readingSpeed: 250,
        scrollPauseTime: { min: 100, max: 400 },
      },
      errors: {
        misClickRate: 0.12,
        doubleClickAccidental: 0.08,
        typoRate: 0.1,
        backtrackRate: 0.5, // Frequently goes back due to WM deficits
      },
      mouse: {
        curvature: 0.4,
        jitter: 8,
        overshoot: 0.15,
        speed: "fast",
      },
      attention: {
        pattern: "skim",
        scrollBehavior: "jump",
        focusAreas: ["cta", "images"],
        distractionRate: 0.7, // Very easily distracted
      },
    },
    context: {
      viewport: [1920, 1080],
    },
    accessibilityTraits: {
      processingSpeed: 0.6, // Variable - can be fast when interested
      attentionSpan: 0.3, // Short sustained attention
      fatigueSusceptibility: 0.4,
    },
    cognitiveTraits: {
      workingMemory: 0.25, // Research: large magnitude impairment (d=1.63-2.03)
      patience: 0.25, // Impulsivity: low tolerance for waiting
      persistence: 0.2, // Low task persistence before switching
      curiosity: 0.8, // High novelty-seeking
      riskTolerance: 0.7, // Impulsive clicking
      readingTendency: 0.2, // Skims rather than reads
      resilience: 0.55, // Medium - recovers emotionally but not focus (BRS)
      selfEfficacy: 0.4, // Variable - can feel capable when engaged (Bandura)
      satisficing: 0.85, // High - ADHD drives "good enough" decisions (Simon)
      trustCalibration: 0.65, // Medium-high - impulsive clicks without reading (Fogg)
      interruptRecovery: 0.2, // Very low - WM deficits make recovery difficult (Mark)
      // New traits (v15.0.0)
      comprehension: 0.5,
      informationForaging: 0.6,   // Follows interesting scents, not systematic
      changeBlindness: 0.7,       // High - focus elsewhere when changes happen
      anchoringBias: 0.4,         // Lower - novelty-seeking overrides anchoring
      timeHorizon: 0.9,           // Very short-term - immediate gratification
      attributionStyle: 0.6,      // Slightly self-blaming
      metacognitivePlanning: 0.15, // Very low - impulsive, no planning
      proceduralFluency: 0.3,     // Low - struggles with sequences
      transferLearning: 0.6,      // Medium - recognizes patterns when focused
      authoritySensitivity: 0.4,  // Low - impulsive, ignores authority
      emotionalContagion: 0.6,    // Medium-high - emotional variability
      fearOfMissingOut: 0.85,     // Very high - ADHD correlates with FOMO
      socialProofSensitivity: 0.5, // Medium - if interesting
      mentalModelRigidity: 0.7,   // High - adapts easily, novelty-seeking
    },
  },

  "dyslexic-user": {
    name: "dyslexic-user",
    // Research: Dyslexic adults read ~178 WPM vs 248 WPM controls (Scientific Reports 2021)
    // About 72% of typical speed, with more fixations and regressions
    description: "User with dyslexia affecting reading and text processing",
    demographics: {
      age_range: "18-55",
      tech_level: "intermediate",
      device: "desktop",
    },
    behaviors: {
      prefers_simple_text: true,
      avoids_text_walls: true,
      relies_on_visuals: true,
      rereads_often: true,
    },
    humanBehavior: {
      timing: {
        reactionTime: { min: 400, max: 1000 },
        clickDelay: { min: 200, max: 500 },
        typeSpeed: { min: 80, max: 160 },
        readingSpeed: 120, // Research: ~70% of normal (178/248 WPM)
        scrollPauseTime: { min: 800, max: 2000 },
      },
      errors: {
        misClickRate: 0.1,
        doubleClickAccidental: 0.05,
        typoRate: 0.15, // Spelling difficulties but not extreme
        backtrackRate: 0.4, // More regressions during reading
      },
      mouse: {
        curvature: 0.4,
        jitter: 5,
        overshoot: 0.1,
        speed: "normal",
      },
      attention: {
        pattern: "thorough",
        scrollBehavior: "chunked",
        focusAreas: ["header", "images", "cta"], // Relies more on visuals
        distractionRate: 0.3,
      },
    },
    context: {
      viewport: [1280, 800],
    },
    accessibilityTraits: {
      processingSpeed: 0.5, // Slower text processing
      attentionSpan: 0.5,
      fatigueSusceptibility: 0.6, // Reading requires more effort
    },
    cognitiveTraits: {
      workingMemory: 0.6, // WM typically unaffected
      patience: 0.5,
      curiosity: 0.7,
      readingTendency: 0.4, // Avoids heavy text, prefers visuals
      resilience: 0.6, // Medium-high - adapted to text challenges (BRS)
      selfEfficacy: 0.5, // Medium - effective with accommodations (Bandura)
      satisficing: 0.6, // Medium - avoids text-heavy paths (Simon)
      trustCalibration: 0.5, // Medium - standard trust evaluation (Fogg)
      interruptRecovery: 0.55, // Medium - visual cues help, text harder (Mark)
      // New traits (v15.0.0)
      riskTolerance: 0.5,
      comprehension: 0.5,      // Comprehension fine for visuals
      persistence: 0.6,
      informationForaging: 0.5, // Standard - prefers visual cues
      changeBlindness: 0.4,     // Lower - visual learner
      anchoringBias: 0.5,
      timeHorizon: 0.5,
      attributionStyle: 0.5,
      metacognitivePlanning: 0.5,
      proceduralFluency: 0.5,   // Fine with visual instructions
      transferLearning: 0.6,    // Recognizes visual patterns
      authoritySensitivity: 0.5,
      emotionalContagion: 0.5,
      fearOfMissingOut: 0.5,
      socialProofSensitivity: 0.6, // Relies on visual reviews
      mentalModelRigidity: 0.6,   // Good adaptation
    },
  },

  "deaf-user": {
    name: "deaf-user",
    description: "Deaf user who relies on visual content and captions",
    demographics: {
      age_range: "18-65",
      tech_level: "intermediate",
      device: "desktop",
    },
    behaviors: {
      needs_captions: true,
      visual_learner: true,
      misses_audio_cues: true,
      reads_everything: true,
    },
    humanBehavior: {
      timing: {
        reactionTime: { min: 200, max: 500 },
        clickDelay: { min: 100, max: 300 },
        typeSpeed: { min: 50, max: 100 },
        readingSpeed: 250,
        scrollPauseTime: { min: 300, max: 800 },
      },
      errors: {
        misClickRate: 0.05,
        doubleClickAccidental: 0.02,
        typoRate: 0.05,
        backtrackRate: 0.15,
      },
      mouse: {
        curvature: 0.4,
        jitter: 4,
        overshoot: 0.1,
        speed: "normal",
      },
      attention: {
        pattern: "f-pattern",
        scrollBehavior: "chunked",
        focusAreas: ["header", "text", "images"],
        distractionRate: 0.2,
      },
    },
    context: {
      viewport: [1920, 1080],
    },
    accessibilityTraits: {
      visionLevel: 1.0, // Vision is fine
      processingSpeed: 0.9,
      attentionSpan: 0.8,
    },
    cognitiveTraits: {
      patience: 0.7, // Accustomed to finding captions/text alternatives
      riskTolerance: 0.5, // Standard caution
      readingTendency: 0.9, // High - reads all text since can't hear audio
      resilience: 0.75, // High - adapted to audio-free experience (BRS)
      selfEfficacy: 0.6, // Medium-high - confident in visual navigation (Bandura)
      satisficing: 0.55, // Medium - seeks captioned/text content (Simon)
      trustCalibration: 0.55, // Medium - standard visual trust evaluation (Fogg)
      interruptRecovery: 0.65, // Medium-high - visual cues assist recovery (Mark)
      // New traits (v15.0.0)
      comprehension: 0.7,
      persistence: 0.7,
      curiosity: 0.5,
      workingMemory: 0.7,
      informationForaging: 0.6, // Good visual navigation
      changeBlindness: 0.2,     // Very low - visually attentive
      anchoringBias: 0.5,
      timeHorizon: 0.5,
      attributionStyle: 0.4,    // Blames lack of captions
      metacognitivePlanning: 0.6, // Plans for captioned content
      proceduralFluency: 0.7,   // Good with visual instructions
      transferLearning: 0.7,    // Recognizes visual patterns
      authoritySensitivity: 0.5,
      emotionalContagion: 0.4,  // Less affected by audio tone
      fearOfMissingOut: 0.4,
      socialProofSensitivity: 0.6, // Visual reviews/ratings
      mentalModelRigidity: 0.65,  // Good visual adaptation
    },
  },

  "elderly-low-vision": {
    name: "elderly-low-vision",
    // Research: Memory loss affects >1/3 of people over 70 (ScienceDaily 2025)
    // Cognitive decline accelerates after age 70 (Nature Communications 2026)
    // Working memory declines due to inhibitory control changes (PMC review)
    description: "Elderly user (75+) with age-related vision and motor decline",
    demographics: {
      age_range: "75+",
      tech_level: "beginner",
      device: "desktop",
    },
    behaviors: {
      prefers_large_text: true,
      careful_with_technology: true,
      needs_clear_feedback: true,
      avoids_complexity: true,
    },
    humanBehavior: {
      timing: {
        reactionTime: { min: 1000, max: 2500 },
        clickDelay: { min: 600, max: 1500 },
        typeSpeed: { min: 200, max: 400 },
        readingSpeed: 80,
        scrollPauseTime: { min: 1000, max: 2500 },
      },
      errors: {
        misClickRate: 0.25,
        doubleClickAccidental: 0.2,
        typoRate: 0.15,
        backtrackRate: 0.4, // Increased: WM decline causes step repetition
      },
      mouse: {
        curvature: 0.8,
        jitter: 15,
        overshoot: 0.3,
        speed: "slow",
      },
      attention: {
        pattern: "thorough",
        scrollBehavior: "chunked",
        focusAreas: ["header", "text", "cta"],
        distractionRate: 0.15,
      },
    },
    context: {
      viewport: [1280, 800],
    },
    accessibilityTraits: {
      motorControl: 0.5,
      tremor: false, // Not necessarily present
      reachability: 0.6,
      visionLevel: 0.4,
      contrastSensitivity: 2.5,
      processingSpeed: 0.4, // Significant slowing after 70
      attentionSpan: 0.5,
      fatigueSusceptibility: 0.7,
    },
    cognitiveTraits: {
      workingMemory: 0.35, // Research: inhibitory control decline limits WM
      patience: 0.7, // High: more methodical than young users
      persistence: 0.6, // Determined but confused
      curiosity: 0.3, // Low: prefers familiar patterns
      riskTolerance: 0.15, // Very cautious with unfamiliar interfaces
      comprehension: 0.3, // Unfamiliar with modern UI conventions
      resilience: 0.25, // Low - frustration compounds with physical challenges (BRS)
      selfEfficacy: 0.25, // Very low - often blame selves for tech issues (Bandura)
      satisficing: 0.75, // High - avoids complex decision trees (Simon)
      trustCalibration: 0.2, // Very low - very skeptical of online requests (Fogg)
      interruptRecovery: 0.25, // Very low - WM + vision decline makes recovery hard (Mark)
      // New traits (v15.0.0)
      readingTendency: 0.85,
      informationForaging: 0.2,   // Very low - exhaustive, uncertain
      changeBlindness: 0.75,      // High - vision issues
      anchoringBias: 0.8,         // High - sticks to first info
      timeHorizon: 0.4,           // Medium - patient but unsure
      attributionStyle: 0.9,      // Very high - blames self
      metacognitivePlanning: 0.2, // Low - doesn't know what to plan
      proceduralFluency: 0.25,    // Low - struggles with sequences
      transferLearning: 0.15,     // Very low - each UI is confusing
      authoritySensitivity: 0.85, // Very high - trusts official things
      emotionalContagion: 0.6,    // Medium-high
      fearOfMissingOut: 0.25,     // Low - not driven by urgency
      socialProofSensitivity: 0.7, // High - relies on family advice
      mentalModelRigidity: 0.15,  // Very low - rigid, struggles
    },
  },

  "color-blind-deuteranopia": {
    name: "color-blind-deuteranopia",
    // Affects ~8% of males, ~0.5% of females
    // Cannot distinguish red-green (e.g., error/success states)
    description: "User with red-green color blindness (deuteranopia)",
    demographics: {
      age_range: "18-65",
      tech_level: "intermediate",
      device: "desktop",
    },
    behaviors: {
      cant_distinguish_red_green: true,
      relies_on_labels: true,
      needs_patterns_not_colors: true,
      hesitates_on_color_only_indicators: true,
    },
    humanBehavior: {
      timing: {
        reactionTime: { min: 200, max: 600 }, // Slight delay on color-coded UI
        clickDelay: { min: 100, max: 400 },
        typeSpeed: { min: 50, max: 100 },
        readingSpeed: 250,
        scrollPauseTime: { min: 200, max: 500 },
      },
      errors: {
        misClickRate: 0.12, // Higher: may select wrong color-coded option
        doubleClickAccidental: 0.03,
        typoRate: 0.05,
        backtrackRate: 0.3, // Higher: realizes mistake after action fails
      },
      mouse: {
        curvature: 0.4,
        jitter: 4,
        overshoot: 0.1,
        speed: "normal",
      },
      attention: {
        pattern: "f-pattern",
        scrollBehavior: "chunked",
        focusAreas: ["header", "cta", "text"], // Avoids color-only cues
        distractionRate: 0.2,
      },
    },
    context: {
      viewport: [1920, 1080],
    },
    accessibilityTraits: {
      visionLevel: 0.9, // Acuity is fine
      colorBlindness: "red-green",
      processingSpeed: 0.85, // Slight delay interpreting color-coded info
      attentionSpan: 0.8,
    },
    cognitiveTraits: {
      patience: 0.6, // Accustomed to extra verification
      persistence: 0.7, // Used to working around color issues
      riskTolerance: 0.5, // Cautious with color-only indicators
      resilience: 0.7, // High - adapted to workarounds, recovers quickly (BRS)
      selfEfficacy: 0.7, // High - adapted strategies work well (Bandura)
      satisficing: 0.5, // Medium - needs extra verification (Simon)
      trustCalibration: 0.55, // Medium - cautious with color-coded security indicators (Fogg)
      interruptRecovery: 0.6, // Medium-high - good adaptation, unaffected cognition (Mark)
      // New traits (v15.0.0)
      comprehension: 0.7,
      curiosity: 0.5,
      workingMemory: 0.7,
      readingTendency: 0.7,     // Relies on text labels
      informationForaging: 0.6, // Good - unaffected cognition
      changeBlindness: 0.45,    // Medium - misses color-only changes
      anchoringBias: 0.5,
      timeHorizon: 0.5,
      attributionStyle: 0.3,    // Blames poor design, not self
      metacognitivePlanning: 0.6, // Plans for color verification
      proceduralFluency: 0.7,   // Good with non-color cues
      transferLearning: 0.7,    // Recognizes non-color patterns
      authoritySensitivity: 0.5,
      emotionalContagion: 0.5,
      fearOfMissingOut: 0.4,
      socialProofSensitivity: 0.5,
      mentalModelRigidity: 0.65,  // Adapts with workarounds
    },
  },
};

/**
 * Get an accessibility persona by name.
 */
export function getAccessibilityPersona(name: string): AccessibilityPersona | undefined {
  return ACCESSIBILITY_PERSONAS[name];
}

/**
 * List all accessibility persona names.
 */
export function listAccessibilityPersonas(): string[] {
  return Object.keys(ACCESSIBILITY_PERSONAS);
}

// ============================================================================
// Emotion-Focused Personas (v13.1.0)
// ============================================================================

/**
 * Built-in emotional personas for testing emotional response patterns.
 * These simulate how users with different emotional baselines and sensitivities
 * experience websites, triggering different abandonment patterns.
 *
 * Works with the Emotional State Engine (src/cognitive/emotions.ts):
 * - Baseline emotions are influenced by traits (patience, selfEfficacy, curiosity)
 * - Emotional sensitivity is influenced by patience and resilience
 * - Emotional recovery (decay) is influenced by resilience
 */
export const EMOTIONAL_PERSONAS: Record<string, Persona> = {
  "anxious-user": {
    name: "anxious-user",
    // Research: State-Trait Anxiety Inventory (Spielberger, 1983)
    // High trait anxiety leads to elevated baseline anxiety in novel situations
    // Anxiety increases with uncertainty and ambiguity (Grupe & Nitschke, 2013)
    description: "User with high baseline anxiety who worries about mistakes and consequences",
    demographics: {
      age_range: "25-55",
      tech_level: "intermediate",
      device: "desktop",
    },
    behaviors: {
      hesitant_to_click: true,
      double_checks_everything: true,
      avoids_irreversible_actions: true,
      reads_warnings_carefully: true,
      abandons_on_confusion: true,
    },
    humanBehavior: {
      timing: {
        reactionTime: { min: 400, max: 1200 }, // Slower due to deliberation
        clickDelay: { min: 300, max: 800 }, // Hesitates before clicking
        typeSpeed: { min: 80, max: 150 },
        readingSpeed: 150, // Reads carefully
        scrollPauseTime: { min: 400, max: 1000 },
      },
      errors: {
        misClickRate: 0.08,
        doubleClickAccidental: 0.04,
        typoRate: 0.07,
        backtrackRate: 0.35, // High - second-guesses decisions
      },
      mouse: {
        curvature: 0.5,
        jitter: 6, // Slight nervousness in movement
        overshoot: 0.12,
        speed: "slow",
      },
      attention: {
        pattern: "thorough",
        scrollBehavior: "chunked",
        focusAreas: ["header", "text", "cta"],
        distractionRate: 0.25,
      },
    },
    cognitiveTraits: {
      patience: 0.3,          // Low - anxiety makes waiting feel worse
      riskTolerance: 0.15,    // Very low - avoids uncertain outcomes
      comprehension: 0.6,     // Medium - understands but worries
      persistence: 0.4,       // Low-medium - gives up when anxious
      curiosity: 0.3,         // Low - prefers safe known paths
      workingMemory: 0.5,     // Medium - anxiety can impair WM
      readingTendency: 0.8,   // High - reads everything for reassurance
      resilience: 0.2,        // Very low - slow emotional recovery
      selfEfficacy: 0.25,     // Very low - doubts own abilities
      satisficing: 0.4,       // Low-medium - wants certainty
      trustCalibration: 0.3,  // Low - skeptical and worried
      interruptRecovery: 0.3, // Low - anxiety compounds on interruption
      // New traits (v15.0.0)
      informationForaging: 0.4,   // Low - overthinks each path
      changeBlindness: 0.3,       // Low - hypervigilant, notices changes
      anchoringBias: 0.7,         // High - sticks to first safe option
      timeHorizon: 0.3,           // Long-term - worries about consequences
      attributionStyle: 0.8,      // Very high - blames self for everything
      metacognitivePlanning: 0.6, // Medium-high - plans to avoid anxiety
      proceduralFluency: 0.5,     // Medium - follows carefully
      transferLearning: 0.5,      // Medium
      authoritySensitivity: 0.7,  // High - seeks reassurance from authority
      emotionalContagion: 0.8,    // Very high - absorbs UI emotional tone
      fearOfMissingOut: 0.6,      // Medium-high - anxiety about missing out
      socialProofSensitivity: 0.7, // High - seeks validation from others
      mentalModelRigidity: 0.4,   // Low-medium - struggles with unexpected
    },
    context: {
      viewport: [1280, 800],
    },
  },

  "confident-user": {
    name: "confident-user",
    // Research: Self-Efficacy Theory (Bandura, 1977)
    // High self-efficacy leads to persistence and quick recovery from setbacks
    // Confidence enables efficient decision-making under uncertainty
    description: "User with high self-efficacy who trusts their judgment and recovers quickly from errors",
    demographics: {
      age_range: "25-50",
      tech_level: "intermediate",
      device: "desktop",
    },
    behaviors: {
      clicks_decisively: true,
      expects_to_succeed: true,
      recovers_from_errors: true,
      explores_confidently: true,
      tolerates_ambiguity: true,
    },
    humanBehavior: {
      timing: {
        reactionTime: { min: 150, max: 400 },
        clickDelay: { min: 80, max: 200 },
        typeSpeed: { min: 40, max: 100 },
        readingSpeed: 300,
        scrollPauseTime: { min: 150, max: 400 },
      },
      errors: {
        misClickRate: 0.05,
        doubleClickAccidental: 0.02,
        typoRate: 0.04,
        backtrackRate: 0.1, // Low - trusts first decision
      },
      mouse: {
        curvature: 0.3,
        jitter: 3,
        overshoot: 0.08,
        speed: "fast",
      },
      attention: {
        pattern: "f-pattern",
        scrollBehavior: "jump",
        focusAreas: ["cta", "header"],
        distractionRate: 0.15,
      },
    },
    cognitiveTraits: {
      patience: 0.5,          // Medium - not impatient but efficient
      riskTolerance: 0.8,     // High - willing to try things
      comprehension: 0.7,     // High - understands quickly
      persistence: 0.8,       // High - doesn't give up easily
      curiosity: 0.6,         // Medium-high - willing to explore
      workingMemory: 0.7,     // High - focused and clear
      readingTendency: 0.3,   // Low - scans efficiently
      resilience: 0.9,        // Very high - bounces back immediately
      selfEfficacy: 0.9,      // Very high - trusts own abilities
      satisficing: 0.5,       // Medium - balances speed and quality
      trustCalibration: 0.7,  // High - appropriate trust
      interruptRecovery: 0.8, // High - resumes easily
      // New traits (v15.0.0)
      informationForaging: 0.8,   // High - efficient scent-following
      changeBlindness: 0.3,       // Low - notices changes
      anchoringBias: 0.3,         // Low - evaluates options freely
      timeHorizon: 0.4,           // Medium-long - thinks ahead
      attributionStyle: 0.2,      // Low - blames system issues
      metacognitivePlanning: 0.7, // High - plans efficiently
      proceduralFluency: 0.8,     // High - follows procedures well
      transferLearning: 0.85,     // High - applies knowledge
      authoritySensitivity: 0.4,  // Low-medium - independent judgment
      emotionalContagion: 0.2,    // Low - emotionally stable
      fearOfMissingOut: 0.3,      // Low - not swayed by urgency
      socialProofSensitivity: 0.4, // Low-medium - evaluates on merits
      mentalModelRigidity: 0.8,   // High - adapts easily
    },
    context: {
      viewport: [1920, 1080],
    },
  },

  "emotional-user": {
    name: "emotional-user",
    // Research: Affect Intensity Measure (Larsen & Diener, 1987)
    // High affect intensity = stronger emotional reactions to events
    // Both positive and negative emotions are amplified
    description: "User with high emotional sensitivity who experiences strong reactions to successes and failures",
    demographics: {
      age_range: "18-45",
      tech_level: "intermediate",
      device: "desktop",
    },
    behaviors: {
      expressive_reactions: true,
      mood_dependent: true,
      celebration_on_success: true,
      frustration_on_failure: true,
      seeks_feedback: true,
    },
    humanBehavior: {
      timing: {
        reactionTime: { min: 150, max: 600 }, // Variable based on mood
        clickDelay: { min: 100, max: 400 },
        typeSpeed: { min: 50, max: 130 },
        readingSpeed: 220,
        scrollPauseTime: { min: 200, max: 600 },
      },
      errors: {
        misClickRate: 0.1, // Higher when frustrated
        doubleClickAccidental: 0.06,
        typoRate: 0.08,
        backtrackRate: 0.25,
      },
      mouse: {
        curvature: 0.45,
        jitter: 7, // More movement when emotional
        overshoot: 0.15,
        speed: "normal",
      },
      attention: {
        pattern: "f-pattern",
        scrollBehavior: "chunked",
        focusAreas: ["header", "cta", "images"],
        distractionRate: 0.35, // Higher when emotional
      },
    },
    cognitiveTraits: {
      patience: 0.25,         // Low - emotions amplify impatience
      riskTolerance: 0.5,     // Medium - mood dependent
      comprehension: 0.5,     // Medium
      persistence: 0.4,       // Low-medium - gives up when frustrated
      curiosity: 0.6,         // Medium-high - excitement drives exploration
      workingMemory: 0.45,    // Medium - emotions can interfere
      readingTendency: 0.4,   // Medium
      resilience: 0.15,       // Very low - emotions linger long
      selfEfficacy: 0.5,      // Medium - mood dependent
      satisficing: 0.6,       // Medium-high - wants quick resolution
      trustCalibration: 0.5,  // Medium - emotional judgment
      interruptRecovery: 0.35, // Low - emotional state persists
      // New traits (v15.0.0)
      informationForaging: 0.5,   // Medium - mood dependent
      changeBlindness: 0.5,       // Medium - emotions distract
      anchoringBias: 0.6,         // Medium-high - first impressions stick
      timeHorizon: 0.7,           // Short-term - emotional decisions
      attributionStyle: 0.5,      // Medium - variable based on mood
      metacognitivePlanning: 0.3, // Low - emotional impulsivity
      proceduralFluency: 0.45,    // Medium - emotions interfere
      transferLearning: 0.5,      // Medium
      authoritySensitivity: 0.5,  // Medium - mood dependent
      emotionalContagion: 0.9,    // Maximum - highly influenced by UI tone
      fearOfMissingOut: 0.75,     // High - emotional FOMO
      socialProofSensitivity: 0.7, // High - seeks emotional validation
      mentalModelRigidity: 0.5,   // Medium
    },
    context: {
      viewport: [1280, 800],
    },
  },

  "stoic-user": {
    name: "stoic-user",
    // Research: Emotion Regulation (Gross, 2002)
    // High cognitive reappraisal = emotions don't escalate
    // Stoicism involves accepting setbacks without frustration (Pigliucci, 2017)
    description: "User with high emotional stability who remains calm regardless of successes or failures",
    demographics: {
      age_range: "30-65",
      tech_level: "intermediate",
      device: "desktop",
    },
    behaviors: {
      calm_under_pressure: true,
      methodical_approach: true,
      accepts_errors_gracefully: true,
      steady_persistence: true,
      rational_decisions: true,
    },
    humanBehavior: {
      timing: {
        reactionTime: { min: 250, max: 600 },
        clickDelay: { min: 150, max: 350 },
        typeSpeed: { min: 60, max: 120 },
        readingSpeed: 220,
        scrollPauseTime: { min: 250, max: 600 },
      },
      errors: {
        misClickRate: 0.05,
        doubleClickAccidental: 0.02,
        typoRate: 0.04,
        backtrackRate: 0.15,
      },
      mouse: {
        curvature: 0.35,
        jitter: 3, // Steady movement
        overshoot: 0.08,
        speed: "normal",
      },
      attention: {
        pattern: "thorough",
        scrollBehavior: "chunked",
        focusAreas: ["header", "text", "cta"],
        distractionRate: 0.1, // Very low - focused
      },
    },
    cognitiveTraits: {
      patience: 0.9,          // Very high - doesn't rush
      riskTolerance: 0.5,     // Medium - balanced judgment
      comprehension: 0.7,     // High - clear thinking
      persistence: 0.9,       // Very high - never gives up
      curiosity: 0.4,         // Medium - methodical exploration
      workingMemory: 0.8,     // High - unaffected by emotion
      readingTendency: 0.6,   // Medium-high - thorough
      resilience: 0.95,       // Maximum - emotions barely register
      selfEfficacy: 0.7,      // High - quiet confidence
      satisficing: 0.4,       // Low - willing to be thorough
      trustCalibration: 0.6,  // Medium-high - rational evaluation
      interruptRecovery: 0.8, // High - returns to task easily
      // New traits (v15.0.0)
      informationForaging: 0.6,   // Medium-high - methodical
      changeBlindness: 0.3,       // Low - attentive, focused
      anchoringBias: 0.3,         // Low - evaluates all options
      timeHorizon: 0.2,           // Very long-term - patient deliberation
      attributionStyle: 0.4,      // Medium - balanced evaluation
      metacognitivePlanning: 0.8, // High - plans carefully
      proceduralFluency: 0.8,     // High - follows procedures precisely
      transferLearning: 0.7,      // High - applies experience
      authoritySensitivity: 0.4,  // Low-medium - independent judgment
      emotionalContagion: 0.1,    // Minimum - emotionally unaffected
      fearOfMissingOut: 0.1,      // Minimum - not driven by urgency
      socialProofSensitivity: 0.3, // Low - evaluates independently
      mentalModelRigidity: 0.7,   // High - adapts methodically
    },
    context: {
      viewport: [1280, 800],
    },
  },
};

/**
 * Get an emotional persona by name.
 */
export function getEmotionalPersona(name: string): Persona | undefined {
  return EMOTIONAL_PERSONAS[name];
}

/**
 * List all emotional persona names.
 */
export function listEmotionalPersonas(): string[] {
  return Object.keys(EMOTIONAL_PERSONAS);
}

// ============================================================================
// Unified Persona Lookup (v16.14.1)
// ============================================================================

/**
 * Get ANY persona by name, checking all registries:
 * 1. Custom personas (highest priority - user overrides)
 * 2. Built-in personas (power-user, first-timer, etc.)
 * 3. Accessibility personas (cognitive-adhd, motor-impairment-tremor, etc.)
 * 4. Emotional personas (anxious-user, confident-user, etc.)
 *
 * v16.14.1: Fixes persona name mismatch bug where compare_personas_init
 * couldn't find accessibility personas like "cognitive-adhd" because
 * getPersona() only checked BUILTIN_PERSONAS.
 *
 * @param name Persona name to look up
 * @returns Persona object or undefined if not found
 */
export function getAnyPersona(name: string): Persona | AccessibilityPersona | undefined {
  // 1. Check custom personas first (user overrides)
  const customPersonas = loadCustomPersonas();
  if (customPersonas[name]) {
    return customPersonas[name];
  }

  // 2. Check built-in personas
  if (BUILTIN_PERSONAS[name]) {
    return BUILTIN_PERSONAS[name];
  }

  // 3. Check accessibility personas
  if (ACCESSIBILITY_PERSONAS[name]) {
    return ACCESSIBILITY_PERSONAS[name];
  }

  // 4. Check emotional personas
  if (EMOTIONAL_PERSONAS[name]) {
    return EMOTIONAL_PERSONAS[name];
  }

  return undefined;
}

/**
 * List ALL persona names from all registries.
 *
 * @returns Combined list of all available persona names
 */
export function listAllPersonas(): string[] {
  const builtinNames = Object.keys(BUILTIN_PERSONAS);
  const accessibilityNames = Object.keys(ACCESSIBILITY_PERSONAS);
  const emotionalNames = Object.keys(EMOTIONAL_PERSONAS);
  const customNames = Object.keys(loadCustomPersonas());

  // Combine and dedupe
  return [...new Set([...builtinNames, ...accessibilityNames, ...emotionalNames, ...customNames])];
}
