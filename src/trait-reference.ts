/**
 * CBrowser - Cognitive Browser Automation
 *
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 * 
 *
 * 
 * 
 */

/**
 * Cognitive Trait Reference Matrix (v15.0.0)
 *
 * This module provides authoritative definitions for all 25 cognitive traits.
 * Use this as a reference when creating custom personas.
 *
 * Scale Convention: All traits use 0.0 to 1.0
 * - 0.0-0.2 = Very Low
 * - 0.2-0.4 = Low
 * - 0.4-0.6 = Medium
 * - 0.6-0.8 = High
 * - 0.8-1.0 = Very High
 */

// ============================================================================
// TRAIT DEFINITIONS WITH VALUE GUIDES
// ============================================================================

export interface TraitDefinition {
  /** Trait identifier (matches CognitiveTraits interface) */
  name: string;
  /** Human-readable description */
  description: string;
  /** What 0.0 represents */
  lowEnd: string;
  /** What 1.0 represents */
  highEnd: string;
  /** Primary research citation */
  research: string;
  /** Research DOI or URL */
  researchUrl?: string;
  /** Behavioral examples at different levels */
  examples: {
    veryLow: string;   // 0.0-0.2
    low: string;       // 0.2-0.4
    medium: string;    // 0.4-0.6
    high: string;      // 0.6-0.8
    veryHigh: string;  // 0.8-1.0
  };
  /** Which personas typically score high/low */
  typicalScores: {
    high: string[];
    low: string[];
  };
  /** Related traits that often correlate */
  correlates: string[];
  /** Default value for new personas */
  defaultValue: number;
}

/**
 * Complete trait definitions for all 25 cognitive traits
 */
export const TRAIT_DEFINITIONS: Record<string, TraitDefinition> = {
  // ============================================================================
  // ORIGINAL TRAITS (v1.0 - v14.x)
  // ============================================================================

  patience: {
    name: "patience",
    description: "Tolerance for delays, loading times, and friction before abandoning",
    lowEnd: "Abandons immediately on any friction",
    highEnd: "Waits indefinitely, never abandons",
    research: "Forrester Research - Web Performance & User Experience",
    examples: {
      veryLow: "Leaves if page takes >2 seconds to load",
      low: "Gives up after 1-2 failed attempts",
      medium: "Tries 3-4 approaches before leaving",
      high: "Persists through multiple errors, reads help docs",
      veryHigh: "Never abandons, keeps trying indefinitely",
    },
    typicalScores: {
      high: ["elderly-user", "screen-reader-user", "stoic-user"],
      low: ["impatient-user", "mobile-user", "power-user"],
    },
    correlates: ["persistence", "resilience", "timeHorizon"],
    defaultValue: 0.5,
  },

  riskTolerance: {
    name: "riskTolerance",
    description: "Willingness to click unfamiliar elements or take uncertain actions",
    lowEnd: "Only clicks obvious, labeled buttons",
    highEnd: "Clicks anything that might work",
    research: "Kahneman & Tversky (1979) - Prospect Theory",
    examples: {
      veryLow: "Won't click unless 100% certain of outcome",
      low: "Needs tooltips/labels before clicking",
      medium: "Clicks familiar-looking elements",
      high: "Explores menu items and settings freely",
      veryHigh: "Clicks experimental features without hesitation",
    },
    typicalScores: {
      high: ["power-user", "impatient-user", "confident-user"],
      low: ["elderly-user", "anxious-user", "first-timer"],
    },
    correlates: ["curiosity", "selfEfficacy", "authoritySensitivity"],
    defaultValue: 0.5,
  },

  comprehension: {
    name: "comprehension",
    description: "Ability to understand UI conventions and interface patterns",
    lowEnd: "Unfamiliar with modern UI patterns",
    highEnd: "Instant recognition of all conventions",
    research: "Nielsen Norman Group - UI Pattern Recognition Studies",
    examples: {
      veryLow: "Doesn't recognize hamburger menu, search icons",
      low: "Needs labels on icons, struggles with gestures",
      medium: "Knows common patterns, learns new ones slowly",
      high: "Recognizes most patterns instantly",
      veryHigh: "Predicts UI behavior before seeing it",
    },
    typicalScores: {
      high: ["power-user", "screen-reader-user"],
      low: ["elderly-user", "first-timer", "elderly-low-vision"],
    },
    correlates: ["transferLearning", "proceduralFluency", "workingMemory"],
    defaultValue: 0.5,
  },

  persistence: {
    name: "persistence",
    description: "Tendency to retry same approach vs. trying alternatives",
    lowEnd: "Tries once, gives up or tries different approach",
    highEnd: "Keeps trying same approach repeatedly",
    research: "Dweck (2006) - Mindset Theory",
    examples: {
      veryLow: "One failure → abandons completely",
      low: "One failure → tries something completely different",
      medium: "Tries 2-3 times before switching approaches",
      high: "Keeps trying same approach with small variations",
      veryHigh: "Never switches approaches, keeps retrying",
    },
    typicalScores: {
      high: ["screen-reader-user", "elderly-user", "stoic-user"],
      low: ["impatient-user", "power-user", "cognitive-adhd"],
    },
    correlates: ["patience", "resilience", "attributionStyle"],
    defaultValue: 0.5,
  },

  curiosity: {
    name: "curiosity",
    description: "Tendency to explore vs. stay focused on immediate goal",
    lowEnd: "Tunnel vision, only goal-relevant actions",
    highEnd: "Easily distracted by interesting elements",
    research: "Berlyne (1960) - Curiosity and Exploration",
    examples: {
      veryLow: "Never clicks anything off the goal path",
      low: "Ignores most side content",
      medium: "Occasionally explores interesting features",
      high: "Frequently clicks on tangential content",
      veryHigh: "Explores everything, loses sight of original goal",
    },
    typicalScores: {
      high: ["first-timer", "cognitive-adhd"],
      low: ["power-user", "impatient-user", "elderly-user"],
    },
    correlates: ["fearOfMissingOut", "timeHorizon", "mentalModelRigidity"],
    defaultValue: 0.5,
  },

  workingMemory: {
    name: "workingMemory",
    description: "Capacity to remember previous attempts and current context",
    lowEnd: "Forgets what was tried, repeats mistakes",
    highEnd: "Perfect recall of all attempts and context",
    research: "Baddeley & Hitch (1974) - Working Memory Model",
    researchUrl: "https://pubmed.ncbi.nlm.nih.gov/28212479/",
    examples: {
      veryLow: "Repeats exact same failed action multiple times",
      low: "Sometimes forgets recent actions, slight repetition",
      medium: "Remembers last 2-3 attempts",
      high: "Tracks all attempts, systematically eliminates options",
      veryHigh: "Never repeats a failed approach",
    },
    typicalScores: {
      high: ["power-user", "screen-reader-user"],
      low: ["elderly-low-vision", "cognitive-adhd", "elderly-user"],
    },
    correlates: ["interruptRecovery", "proceduralFluency", "metacognitivePlanning"],
    defaultValue: 0.5,
  },

  readingTendency: {
    name: "readingTendency",
    description: "Reads content thoroughly vs. scans for CTAs",
    lowEnd: "Visual scanner, ignores all text",
    highEnd: "Reads every word before acting",
    research: "Nielsen (2006) - F-Pattern Reading Studies",
    examples: {
      veryLow: "Ignores all text, clicks based on visual hierarchy",
      low: "Reads headlines only",
      medium: "Skims key paragraphs",
      high: "Reads most content before proceeding",
      veryHigh: "Reads everything including fine print, ToS",
    },
    typicalScores: {
      high: ["screen-reader-user", "elderly-user", "anxious-user"],
      low: ["power-user", "impatient-user", "mobile-user"],
    },
    correlates: ["patience", "proceduralFluency", "trustCalibration"],
    defaultValue: 0.5,
  },

  resilience: {
    name: "resilience",
    description: "Speed of emotional recovery from setbacks and errors",
    lowEnd: "Frustration lingers, compounds with each error",
    highEnd: "Instantly shrugs off errors, stays positive",
    research: "Smith et al. (2008) - Brief Resilience Scale (BRS)",
    researchUrl: "https://pubmed.ncbi.nlm.nih.gov/18696313/",
    examples: {
      veryLow: "Single error ruins entire session mood",
      low: "Takes 5+ minutes to recover from frustration",
      medium: "Recovers after brief pause or deep breath",
      high: "Error barely registers emotionally",
      veryHigh: "Views errors as interesting challenges",
    },
    typicalScores: {
      high: ["power-user", "stoic-user", "confident-user"],
      low: ["emotional-user", "anxious-user", "impatient-user"],
    },
    correlates: ["selfEfficacy", "patience", "emotionalContagion"],
    defaultValue: 0.5,
  },

  selfEfficacy: {
    name: "selfEfficacy",
    description: "Belief in ability to solve interface problems",
    lowEnd: "\"I can't figure this out\"",
    highEnd: "\"I can solve anything\"",
    research: "Bandura (1977) - Self-Efficacy Theory",
    researchUrl: "https://psycnet.apa.org/record/1977-25733-001",
    examples: {
      veryLow: "Gives up immediately, \"this is beyond me\"",
      low: "Assumes difficulty means personal failure",
      medium: "Willing to try but unsure of success",
      high: "Confident in ability to find solutions",
      veryHigh: "Never doubts ability to succeed",
    },
    typicalScores: {
      high: ["power-user", "confident-user"],
      low: ["elderly-user", "anxious-user", "elderly-low-vision"],
    },
    correlates: ["resilience", "persistence", "attributionStyle"],
    defaultValue: 0.5,
  },

  satisficing: {
    name: "satisficing",
    description: "Accepts 'good enough' vs. seeks optimal solution",
    lowEnd: "Maximizer - seeks perfect option",
    highEnd: "Satisficer - accepts first adequate option",
    research: "Simon (1956) - Bounded Rationality; Schwartz et al. (2002)",
    examples: {
      veryLow: "Compares all options exhaustively before deciding",
      low: "Evaluates 3-4 options before choosing",
      medium: "Considers 2 options, picks better one",
      high: "Takes first option that meets basic needs",
      veryHigh: "Clicks first available option without comparing",
    },
    typicalScores: {
      high: ["impatient-user", "mobile-user", "cognitive-adhd"],
      low: ["power-user", "stoic-user"],
    },
    correlates: ["patience", "timeHorizon", "fearOfMissingOut"],
    defaultValue: 0.5,
  },

  trustCalibration: {
    name: "trustCalibration",
    description: "Baseline trust toward websites and UI claims",
    lowEnd: "Highly skeptical, verifies everything",
    highEnd: "Highly trusting, accepts claims at face value",
    research: "Fogg (2003) - Persuasive Technology, Stanford Web Credibility",
    examples: {
      veryLow: "Checks URL, looks for HTTPS, questions all claims",
      low: "Skeptical of promotional language",
      medium: "Trusts professional-looking sites",
      high: "Accepts most website claims",
      veryHigh: "Clicks through without reading warnings",
    },
    typicalScores: {
      high: ["impatient-user", "cognitive-adhd"],
      low: ["elderly-user", "anxious-user", "elderly-low-vision"],
    },
    correlates: ["authoritySensitivity", "readingTendency", "fearOfMissingOut"],
    defaultValue: 0.5,
  },

  interruptRecovery: {
    name: "interruptRecovery",
    description: "Ability to resume tasks after interruption",
    lowEnd: "Restarts from beginning after any interruption",
    highEnd: "Seamlessly resumes exactly where left off",
    research: "Mark et al. (2005) - \"No Task Left Behind?\"",
    examples: {
      veryLow: "Phone ring → completely forgets what was doing",
      low: "Takes 5+ minutes to find place again",
      medium: "Uses browser tabs/history to resume",
      high: "Mental bookmark allows quick resumption",
      veryHigh: "Interruption doesn't break concentration at all",
    },
    typicalScores: {
      high: ["power-user", "screen-reader-user", "stoic-user"],
      low: ["cognitive-adhd", "elderly-low-vision", "impatient-user"],
    },
    correlates: ["workingMemory", "metacognitivePlanning", "resilience"],
    defaultValue: 0.5,
  },

  // ============================================================================
  // NEW TRAITS (v15.0.0)
  // ============================================================================

  informationForaging: {
    name: "informationForaging",
    description: "Strategy for finding information - exhaustive search vs. scent-following",
    lowEnd: "Exhaustive search, clicks everything systematically",
    highEnd: "Follows information scent efficiently, abandons low-yield paths",
    research: "Pirolli & Card (1999) - Information Foraging Theory",
    researchUrl: "https://www.nngroup.com/articles/information-scent/",
    examples: {
      veryLow: "Clicks every link on page looking for answer",
      low: "Explores multiple paths before deciding",
      medium: "Follows promising links, occasionally backtracks",
      high: "Quickly identifies and follows strongest scent",
      veryHigh: "Abandons low-scent paths within seconds",
    },
    typicalScores: {
      high: ["power-user", "impatient-user"],
      low: ["first-timer", "elderly-low-vision"],
    },
    correlates: ["satisficing", "timeHorizon", "comprehension"],
    defaultValue: 0.5,
  },

  changeBlindness: {
    name: "changeBlindness",
    description: "Tendency to miss UI changes outside focal area",
    lowEnd: "Notices all changes, highly perceptive",
    highEnd: "Misses most changes outside focus area",
    research: "Simons & Chabris (1999) - Inattentional Blindness",
    researchUrl: "https://www.cell.com/trends/cognitive-sciences/abstract/S1364-6613(99)01310-2",
    examples: {
      veryLow: "Notices toast notifications, badge updates, loading states",
      low: "Catches most UI changes within viewport",
      medium: "Notices obvious changes, misses subtle ones",
      high: "Often misses notifications while focused on form",
      veryHigh: "Completely unaware of changes outside focal element",
    },
    typicalScores: {
      high: ["elderly-low-vision", "cognitive-adhd", "low-vision-magnified"],
      low: ["anxious-user", "deaf-user"],
    },
    correlates: ["workingMemory", "curiosity", "readingTendency"],
    defaultValue: 0.3,
  },

  anchoringBias: {
    name: "anchoringBias",
    description: "Tendency to over-weight initial information",
    lowEnd: "Freely adjusts opinion as new info appears",
    highEnd: "First information heavily influences all judgments",
    research: "Tversky & Kahneman (1974) - Anchoring Effect",
    examples: {
      veryLow: "Evaluates each option independently",
      low: "Slight preference for first-seen options",
      medium: "Compares all options to first one",
      high: "First price/rating sets strong expectation",
      veryHigh: "First information becomes absolute reference point",
    },
    typicalScores: {
      high: ["elderly-user", "first-timer", "elderly-low-vision"],
      low: ["power-user", "confident-user"],
    },
    correlates: ["satisficing", "mentalModelRigidity", "comprehension"],
    defaultValue: 0.5,
  },

  timeHorizon: {
    name: "timeHorizon",
    description: "Focus on immediate vs. future consequences",
    lowEnd: "Long-term focused, invests time in learning",
    highEnd: "Immediate gratification, wants results NOW",
    research: "Frederick et al. (2002) - Time Discounting",
    examples: {
      veryLow: "Reads entire tutorial before starting",
      low: "Willing to spend time on setup for future benefit",
      medium: "Balances immediate needs with future utility",
      high: "Skips tutorials, wants immediate results",
      veryHigh: "Won't invest any time that doesn't have instant payoff",
    },
    typicalScores: {
      high: ["impatient-user", "mobile-user", "cognitive-adhd"],
      low: ["stoic-user", "power-user"],
    },
    correlates: ["patience", "satisficing", "metacognitivePlanning"],
    defaultValue: 0.5,
  },

  attributionStyle: {
    name: "attributionStyle",
    description: "Where blame is assigned for errors",
    lowEnd: "Blames system/design (external attribution)",
    highEnd: "Blames self (internal attribution)",
    research: "Weiner (1985) - Attribution Theory; Abramson et al. (1978)",
    examples: {
      veryLow: "\"This interface is poorly designed\"",
      low: "\"That button is confusing\"",
      medium: "\"Maybe I did something wrong, or maybe the site is buggy\"",
      high: "\"I must have clicked the wrong thing\"",
      veryHigh: "\"I'm just not smart enough for this\"",
    },
    typicalScores: {
      high: ["elderly-user", "anxious-user", "elderly-low-vision"],
      low: ["power-user", "confident-user"],
    },
    correlates: ["selfEfficacy", "persistence", "resilience"],
    defaultValue: 0.5,
  },

  metacognitivePlanning: {
    name: "metacognitivePlanning",
    description: "Tendency to plan before acting",
    lowEnd: "Impulsive trial-and-error, no planning",
    highEnd: "Careful planning before any action",
    research: "Flavell (1979) - Metacognition; Schraw & Dennison (1994)",
    examples: {
      veryLow: "Clicks immediately without reading anything",
      low: "Glances at page before clicking",
      medium: "Scans form requirements before starting",
      high: "Reads all instructions, plans approach",
      veryHigh: "Creates mental checklist before each step",
    },
    typicalScores: {
      high: ["power-user", "screen-reader-user", "stoic-user"],
      low: ["impatient-user", "cognitive-adhd", "first-timer"],
    },
    correlates: ["workingMemory", "proceduralFluency", "readingTendency"],
    defaultValue: 0.5,
  },

  proceduralFluency: {
    name: "proceduralFluency",
    description: "Ease of following step-by-step instructions",
    lowEnd: "Struggles with sequences, skips steps, confuses order",
    highEnd: "Follows procedures precisely and efficiently",
    research: "Sweller (1988) - Cognitive Load Theory",
    examples: {
      veryLow: "Completes steps out of order, misses requirements",
      low: "Often needs to re-read instructions mid-flow",
      medium: "Follows most procedures with occasional errors",
      high: "Completes multi-step forms smoothly",
      veryHigh: "Executes complex procedures flawlessly",
    },
    typicalScores: {
      high: ["power-user", "screen-reader-user"],
      low: ["first-timer", "elderly-low-vision", "cognitive-adhd"],
    },
    correlates: ["workingMemory", "comprehension", "metacognitivePlanning"],
    defaultValue: 0.5,
  },

  transferLearning: {
    name: "transferLearning",
    description: "Ability to apply knowledge from familiar UIs to new ones",
    lowEnd: "Each new UI feels completely unfamiliar",
    highEnd: "Instantly applies patterns across all interfaces",
    research: "Barnett & Ceci (2002) - Transfer of Learning",
    examples: {
      veryLow: "Doesn't recognize hamburger menu on new site",
      low: "Needs time to find familiar elements in new layout",
      medium: "Recognizes common patterns, struggles with variations",
      high: "Quickly maps new UI to known mental models",
      veryHigh: "Instantly productive on any interface",
    },
    typicalScores: {
      high: ["power-user", "mobile-user"],
      low: ["elderly-low-vision", "first-timer", "elderly-user"],
    },
    correlates: ["comprehension", "mentalModelRigidity", "proceduralFluency"],
    defaultValue: 0.5,
  },

  authoritySensitivity: {
    name: "authoritySensitivity",
    description: "Compliance with perceived authority figures and cues",
    lowEnd: "Questions all authority, verifies claims",
    highEnd: "Follows authority cues without question",
    research: "Milgram (1963) - Obedience; Cialdini (2001) - Influence",
    examples: {
      veryLow: "Ignores \"Admin\" badges, verifies all claims",
      low: "Skeptical of official-looking messages",
      medium: "Trusts verified/official badges",
      high: "Follows instructions from authority-looking sources",
      veryHigh: "Immediately complies with any official-looking request",
    },
    typicalScores: {
      high: ["first-timer", "elderly-user", "elderly-low-vision"],
      low: ["power-user", "confident-user"],
    },
    correlates: ["trustCalibration", "riskTolerance", "socialProofSensitivity"],
    defaultValue: 0.5,
  },

  emotionalContagion: {
    name: "emotionalContagion",
    description: "Susceptibility to mood influence from UI tone",
    lowEnd: "Mood-stable, unaffected by UI emotional tone",
    highEnd: "Adopts UI's emotional tone completely",
    research: "Hatfield et al. (1993) - Emotional Contagion",
    examples: {
      veryLow: "Friendly/stern UI makes no difference to mood",
      low: "Slight mood influence from very emotional content",
      medium: "Noticeably affected by strongly-toned messaging",
      high: "UI frustration → user frustration quickly",
      veryHigh: "Error messages cause immediate emotional response",
    },
    typicalScores: {
      high: ["emotional-user", "anxious-user"],
      low: ["stoic-user", "power-user", "confident-user"],
    },
    correlates: ["resilience", "selfEfficacy", "fearOfMissingOut"],
    defaultValue: 0.5,
  },

  fearOfMissingOut: {
    name: "fearOfMissingOut",
    description: "FOMO-driven decision making",
    lowEnd: "Unaffected by scarcity/urgency cues",
    highEnd: "Highly responsive to urgency and scarcity",
    research: "Przybylski et al. (2013) - FoMO Scale; Cialdini (2001)",
    examples: {
      veryLow: "\"Limited time offer\" has zero effect",
      low: "Notices urgency but evaluates rationally",
      medium: "Urgency slightly speeds up decision-making",
      high: "\"Only 2 left!\" triggers immediate action",
      veryHigh: "Any urgency cue causes immediate click",
    },
    typicalScores: {
      high: ["impatient-user", "cognitive-adhd", "emotional-user"],
      low: ["stoic-user", "power-user", "elderly-user"],
    },
    correlates: ["emotionalContagion", "satisficing", "timeHorizon"],
    defaultValue: 0.5,
  },

  socialProofSensitivity: {
    name: "socialProofSensitivity",
    description: "Influence of reviews, ratings, and social validation",
    lowEnd: "Evaluates products on features alone",
    highEnd: "Heavily influenced by what others chose",
    research: "Cialdini (2001) - Social Proof Principle",
    examples: {
      veryLow: "Ignores star ratings, reads product specs only",
      low: "Glances at ratings but makes independent choice",
      medium: "Ratings are one factor among many",
      high: "Prioritizes highly-rated options",
      veryHigh: "Only considers options with many positive reviews",
    },
    typicalScores: {
      high: ["first-timer", "elderly-user"],
      low: ["power-user", "stoic-user"],
    },
    correlates: ["trustCalibration", "authoritySensitivity", "fearOfMissingOut"],
    defaultValue: 0.5,
  },

  mentalModelRigidity: {
    name: "mentalModelRigidity",
    description: "Ability to adapt mental models to unexpected UI patterns",
    /**
     * ⚠️ SEMANTIC INVERSION WARNING:
     * Despite the name "rigidity", this trait measures FLEXIBILITY.
     * - LOW (0.0) = MORE rigid (struggles with change)
     * - HIGH (1.0) = MORE flexible (adapts quickly)
     *
     * This naming was kept for backward compatibility with existing personas.
     * When setting this trait, think: "How flexible is this user?"
     */
    lowEnd: "Rigid - struggles when conventions are broken",
    highEnd: "Highly adaptive - quickly forms new mental models",
    research: "Johnson-Laird (1983) - Mental Models; Norman (1988)",
    examples: {
      veryLow: "Completely stuck if navigation isn't where expected",
      low: "Takes significant time to adapt to novel patterns",
      medium: "Eventually adapts with some frustration",
      high: "Quickly forms new mental model for novel interface",
      veryHigh: "Instantly productive regardless of UI conventions",
    },
    typicalScores: {
      high: ["power-user", "confident-user", "impatient-user"],
      low: ["elderly-user", "elderly-low-vision", "anxious-user"],
    },
    correlates: ["transferLearning", "comprehension", "resilience"],
    defaultValue: 0.5,
  },
};

// ============================================================================
// PERSONA-TRAIT MATRIX
// ============================================================================

/**
 * Quick reference for recommended trait values by persona archetype.
 * Use as starting point when creating custom personas.
 */
export const PERSONA_TRAIT_GUIDELINES: Record<string, Record<string, number>> = {
  // Tech expertise spectrum
  "expert": {
    patience: 0.3,
    riskTolerance: 0.9,
    comprehension: 0.95,
    selfEfficacy: 0.9,
    transferLearning: 0.95,
    metacognitivePlanning: 0.8,
    informationForaging: 0.9,
    mentalModelRigidity: 0.8,
  },
  "intermediate": {
    patience: 0.5,
    riskTolerance: 0.5,
    comprehension: 0.6,
    selfEfficacy: 0.5,
    transferLearning: 0.5,
    metacognitivePlanning: 0.5,
    informationForaging: 0.5,
    mentalModelRigidity: 0.5,
  },
  "beginner": {
    patience: 0.6,
    riskTolerance: 0.3,
    comprehension: 0.3,
    selfEfficacy: 0.4,
    transferLearning: 0.2,
    metacognitivePlanning: 0.3,
    informationForaging: 0.3,
    mentalModelRigidity: 0.3,
  },

  // Age spectrum
  "young-adult": {
    timeHorizon: 0.6,
    fearOfMissingOut: 0.7,
    emotionalContagion: 0.6,
    socialProofSensitivity: 0.7,
    workingMemory: 0.7,
  },
  "middle-aged": {
    timeHorizon: 0.5,
    fearOfMissingOut: 0.4,
    emotionalContagion: 0.4,
    socialProofSensitivity: 0.5,
    workingMemory: 0.6,
  },
  "elderly": {
    patience: 0.8,
    riskTolerance: 0.15,
    attributionStyle: 0.8,
    authoritySensitivity: 0.8,
    workingMemory: 0.35,
    mentalModelRigidity: 0.2,
    timeHorizon: 0.4,
  },

  // Emotional baseline
  "emotionally-stable": {
    resilience: 0.8,
    emotionalContagion: 0.2,
    fearOfMissingOut: 0.3,
    patience: 0.7,
  },
  "emotionally-reactive": {
    resilience: 0.2,
    emotionalContagion: 0.8,
    fearOfMissingOut: 0.7,
    patience: 0.3,
  },

  // Accessibility
  "motor-impaired": {
    patience: 0.7,
    proceduralFluency: 0.5,
    satisficing: 0.7,
  },
  "vision-impaired": {
    changeBlindness: 0.7,
    readingTendency: 0.9,
    metacognitivePlanning: 0.7,
  },
  "cognitive-impaired": {
    workingMemory: 0.3,
    interruptRecovery: 0.2,
    proceduralFluency: 0.3,
    metacognitivePlanning: 0.2,
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get trait definition by name
 */
export function getTraitDefinition(traitName: string): TraitDefinition | undefined {
  return TRAIT_DEFINITIONS[traitName];
}

/**
 * Get all trait names
 */
export function getTraitNames(): string[] {
  return Object.keys(TRAIT_DEFINITIONS);
}

/**
 * Validate trait value is in valid range
 */
export function isValidTraitValue(value: number): boolean {
  return value >= 0 && value <= 1;
}

/**
 * Get human-readable level description for a trait value
 */
export function getTraitLevel(value: number): "veryLow" | "low" | "medium" | "high" | "veryHigh" {
  if (value < 0.2) return "veryLow";
  if (value < 0.4) return "low";
  if (value < 0.6) return "medium";
  if (value < 0.8) return "high";
  return "veryHigh";
}

/**
 * Get example behavior for trait at given value
 */
export function getTraitExample(traitName: string, value: number): string | undefined {
  const def = TRAIT_DEFINITIONS[traitName];
  if (!def) return undefined;
  const level = getTraitLevel(value);
  return def.examples[level];
}

/**
 * Suggest trait value based on persona characteristics
 */
export function suggestTraitValue(
  traitName: string,
  techLevel: "beginner" | "intermediate" | "expert",
  ageGroup?: "young" | "middle" | "elderly"
): number {
  // Start with tech level baseline
  const techGuidelines = PERSONA_TRAIT_GUIDELINES[techLevel];
  if (techGuidelines && techGuidelines[traitName] !== undefined) {
    return techGuidelines[traitName];
  }

  // Check age group
  if (ageGroup) {
    const ageKey = ageGroup === "young" ? "young-adult" : ageGroup === "middle" ? "middle-aged" : "elderly";
    const ageGuidelines = PERSONA_TRAIT_GUIDELINES[ageKey];
    if (ageGuidelines && ageGuidelines[traitName] !== undefined) {
      return ageGuidelines[traitName];
    }
  }

  // Fall back to trait default
  const def = TRAIT_DEFINITIONS[traitName];
  return def?.defaultValue ?? 0.5;
}
