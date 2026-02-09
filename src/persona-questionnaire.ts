/**
 * CBrowser - Cognitive Browser Automation
 *
 * Persona Questionnaire System
 * Research-based behavioral trait mapping for custom persona generation
 *
 * Copyright (c) 2026 WF Media (Alexandria Eden)
 */

import type { CognitiveTraits } from "./types.js";

// ============================================================================
// Trait Reference Matrix
// Research-backed behavioral descriptions mapped to trait values
// ============================================================================

export interface TraitLevel {
  value: number;
  label: string;
  behaviors: string[];
  researchBasis?: string;
}

export interface TraitReference {
  name: keyof CognitiveTraits;
  description: string;
  researchBasis: string;
  levels: TraitLevel[];
}

/**
 * Complete research-backed trait reference matrix.
 * Each trait has 5 levels (0, 0.25, 0.5, 0.75, 1.0) with specific behaviors.
 */
export const TRAIT_REFERENCE_MATRIX: TraitReference[] = [
  {
    name: "patience",
    description: "How long before giving up on a task",
    researchBasis: "Nielsen Norman Group (2011) - Task abandonment studies",
    levels: [
      {
        value: 0.0,
        label: "Extremely Impatient",
        behaviors: [
          "Abandons after 3-5 seconds of confusion",
          "Clicks back immediately if page doesn't load in 2s",
          "Never scrolls below the fold",
          "Rage-clicks when frustrated",
        ],
      },
      {
        value: 0.25,
        label: "Impatient",
        behaviors: [
          "Gives up after 10-15 seconds of confusion",
          "Skips all instructions and tutorials",
          "Opens multiple tabs and abandons slow ones",
          "Frustrated by any loading indicators",
        ],
      },
      {
        value: 0.5,
        label: "Moderate Patience",
        behaviors: [
          "Will spend 30-60 seconds trying to solve a problem",
          "Reads headlines but skims body text",
          "Waits for pages up to 5 seconds",
          "Tries 2-3 approaches before giving up",
        ],
      },
      {
        value: 0.75,
        label: "Patient",
        behaviors: [
          "Spends 2-3 minutes on confusing tasks",
          "Reads error messages carefully",
          "Explores help documentation",
          "Tries multiple approaches systematically",
        ],
      },
      {
        value: 1.0,
        label: "Extremely Patient",
        behaviors: [
          "Will persist for 5+ minutes on difficult tasks",
          "Reads all instructions before starting",
          "Waits through long loading times without frustration",
          "Exhaustively explores all options",
        ],
      },
    ],
  },
  {
    name: "riskTolerance",
    description: "Willingness to click unfamiliar or uncertain elements",
    researchBasis: "Kahneman & Tversky (1979) - Prospect Theory; Fogg (2003) - Persuasive Technology",
    levels: [
      {
        value: 0.0,
        label: "Extremely Risk-Averse",
        behaviors: [
          "Only clicks elements they've used before",
          "Never enters personal information without extensive research",
          "Avoids all pop-ups and modals",
          "Won't click any CTA without reading fine print",
        ],
      },
      {
        value: 0.25,
        label: "Risk-Averse",
        behaviors: [
          "Hesitates before clicking unfamiliar buttons",
          "Checks URL security indicators frequently",
          "Prefers well-known brands and sites",
          "Reads privacy policies and terms",
        ],
      },
      {
        value: 0.5,
        label: "Moderate Risk Tolerance",
        behaviors: [
          "Clicks CTAs from reputable-looking sites",
          "Willing to try new features if clearly labeled",
          "Provides information for clear value exchange",
          "Balances caution with convenience",
        ],
      },
      {
        value: 0.75,
        label: "Risk-Tolerant",
        behaviors: [
          "Clicks most CTAs without hesitation",
          "Explores beta features and new tools",
          "Shares information freely for convenience",
          "Dismisses security warnings casually",
        ],
      },
      {
        value: 1.0,
        label: "Extremely Risk-Tolerant",
        behaviors: [
          "Clicks anything that looks interesting",
          "Ignores all security warnings",
          "Provides any information requested",
          "First to try experimental features",
        ],
      },
    ],
  },
  {
    name: "comprehension",
    description: "Ability to understand UI conventions and patterns",
    researchBasis: "Nielsen (2010) - Mental Models; Carroll (1990) - Minimal Manual",
    levels: [
      {
        value: 0.0,
        label: "Struggles Significantly",
        behaviors: [
          "Doesn't recognize standard UI patterns (hamburger menu, search icon)",
          "Confused by tabs, accordions, dropdowns",
          "Types URLs in search boxes",
          "Clicks logos expecting navigation",
        ],
      },
      {
        value: 0.25,
        label: "Below Average Comprehension",
        behaviors: [
          "Recognizes basic patterns but struggles with variations",
          "Needs labels for icons to understand function",
          "Confused by nested menus",
          "Misinterprets form validation messages",
        ],
      },
      {
        value: 0.5,
        label: "Average Comprehension",
        behaviors: [
          "Understands most common UI patterns",
          "Can navigate standard sites without help",
          "Sometimes confused by unconventional designs",
          "Needs help with complex multi-step flows",
        ],
      },
      {
        value: 0.75,
        label: "Good Comprehension",
        behaviors: [
          "Quickly understands new interface patterns",
          "Predicts where features will be located",
          "Adapts easily to different design systems",
          "Rarely needs help or documentation",
        ],
      },
      {
        value: 1.0,
        label: "Expert Comprehension",
        behaviors: [
          "Instantly grasps any UI pattern",
          "Predicts hidden features and shortcuts",
          "Notices subtle UX patterns others miss",
          "Can use any interface without instruction",
        ],
      },
    ],
  },
  {
    name: "persistence",
    description: "Tendency to retry the same approach vs. try alternatives",
    researchBasis: "Duckworth (2016) - Grit; Dweck (2006) - Growth Mindset",
    levels: [
      {
        value: 0.0,
        label: "Gives Up Immediately",
        behaviors: [
          "Abandons task on first failure",
          "Never retries failed actions",
          "Assumes errors are permanent",
          "Seeks help instead of trying again",
        ],
      },
      {
        value: 0.25,
        label: "Low Persistence",
        behaviors: [
          "Tries once more, then gives up",
          "Easily discouraged by error messages",
          "Quickly moves to alternatives",
          "Rarely waits for delayed results",
        ],
      },
      {
        value: 0.5,
        label: "Moderate Persistence",
        behaviors: [
          "Retries 2-3 times with same approach",
          "Willing to try one or two alternatives",
          "Balances persistence with pragmatism",
          "Knows when to ask for help",
        ],
      },
      {
        value: 0.75,
        label: "High Persistence",
        behaviors: [
          "Keeps trying same approach 4-5 times",
          "Believes problems are solvable",
          "Varies approach slightly each retry",
          "Rarely abandons without multiple attempts",
        ],
      },
      {
        value: 1.0,
        label: "Extremely Persistent",
        behaviors: [
          "Will retry indefinitely until success",
          "Never changes approach despite failures",
          "Convinced their method should work",
          "May miss obvious alternative solutions",
        ],
      },
    ],
  },
  {
    name: "curiosity",
    description: "Tendency to explore vs. stay focused on goal",
    researchBasis: "Kashdan (2004) - Curiosity and Exploration Inventory",
    levels: [
      {
        value: 0.0,
        label: "Tunnel Vision",
        behaviors: [
          "Never deviates from primary goal",
          "Ignores all non-essential elements",
          "Frustrated by distractions",
          "Uses sites purely transactionally",
        ],
      },
      {
        value: 0.25,
        label: "Goal-Focused",
        behaviors: [
          "Occasionally notices interesting elements",
          "Stays focused but may bookmark for later",
          "Prefers efficient, direct paths",
          "Explores only when goal is complete",
        ],
      },
      {
        value: 0.5,
        label: "Balanced Explorer",
        behaviors: [
          "Explores within reason while pursuing goals",
          "Clicks interesting links if convenient",
          "Balances task completion with discovery",
          "Sometimes gets sidetracked but returns",
        ],
      },
      {
        value: 0.75,
        label: "Curious",
        behaviors: [
          "Frequently explores tangential content",
          "Opens many tabs for later reading",
          "Enjoys discovering new features",
          "Often takes scenic routes to goals",
        ],
      },
      {
        value: 1.0,
        label: "Extremely Curious",
        behaviors: [
          "Constantly distracted by interesting content",
          "Forgets original task while exploring",
          "Opens dozens of tabs",
          "Values discovery over task completion",
        ],
      },
    ],
  },
  {
    name: "workingMemory",
    description: "Ability to remember what they've tried and where they are",
    researchBasis: "Baddeley (2000) - Working Memory Model; Miller (1956) - 7±2 Chunks",
    levels: [
      {
        value: 0.0,
        label: "Very Poor Working Memory",
        behaviors: [
          "Forgets what they just tried",
          "Repeats same failed actions",
          "Loses track of position in multi-step flows",
          "Can't remember form values between pages",
        ],
      },
      {
        value: 0.25,
        label: "Below Average",
        behaviors: [
          "Sometimes repeats failed attempts",
          "Needs visual indicators of progress",
          "Struggles with long multi-step processes",
          "Benefits from save-and-continue features",
        ],
      },
      {
        value: 0.5,
        label: "Average Working Memory",
        behaviors: [
          "Remembers most recent attempts",
          "Can handle 3-4 step processes",
          "Occasionally forgets earlier decisions",
          "Uses browser back button to retrace steps",
        ],
      },
      {
        value: 0.75,
        label: "Good Working Memory",
        behaviors: [
          "Tracks multiple parallel tasks",
          "Remembers all attempted solutions",
          "Comfortable with 5-7 step processes",
          "Rarely needs progress indicators",
        ],
      },
      {
        value: 1.0,
        label: "Excellent Working Memory",
        behaviors: [
          "Perfect recall of all attempts",
          "Tracks complex state across sessions",
          "Handles 10+ step processes easily",
          "Never repeats failed actions",
        ],
      },
    ],
  },
  {
    name: "readingTendency",
    description: "How much text content is actually read vs. scanned",
    researchBasis: "Nielsen (2006) - F-Pattern; Pernice (2017) - How People Read Online",
    levels: [
      {
        value: 0.0,
        label: "Pure Visual Scanner",
        behaviors: [
          "Never reads any text",
          "Looks only for buttons and images",
          "Ignores all instructions and labels",
          "Clicks based on visual prominence only",
        ],
      },
      {
        value: 0.25,
        label: "Heavy Skimmer",
        behaviors: [
          "Reads only headlines and CTAs",
          "Skims first few words of paragraphs",
          "Ignores body text entirely",
          "Relies on visual hierarchy for meaning",
        ],
      },
      {
        value: 0.5,
        label: "Moderate Reader",
        behaviors: [
          "Reads important-looking text",
          "Skims but catches key points",
          "Reads error messages and warnings",
          "Scans before committing to reading",
        ],
      },
      {
        value: 0.75,
        label: "Thorough Reader",
        behaviors: [
          "Reads most visible content",
          "Takes time to understand context",
          "Reads help text and tooltips",
          "Rarely misses important information",
        ],
      },
      {
        value: 1.0,
        label: "Complete Reader",
        behaviors: [
          "Reads every word on the page",
          "Reads terms and conditions",
          "Expands all collapsible content",
          "Never clicks without reading first",
        ],
      },
    ],
  },
  {
    name: "resilience",
    description: "Ability to recover emotionally from setbacks and errors",
    researchBasis: "Smith et al. (2008) - Brief Resilience Scale; Connor-Davidson (2003) - CD-RISC",
    levels: [
      {
        value: 0.0,
        label: "Very Low Resilience",
        behaviors: [
          "One error causes complete abandonment",
          "Frustration persists across sessions",
          "Associates site with negative emotions",
          "Won't retry failed sites for days/weeks",
        ],
      },
      {
        value: 0.25,
        label: "Low Resilience",
        behaviors: [
          "Errors cause lasting frustration",
          "Needs breaks after setbacks",
          "Recovery takes several minutes",
          "Multiple errors cause abandonment",
        ],
      },
      {
        value: 0.5,
        label: "Moderate Resilience",
        behaviors: [
          "Frustrated briefly by errors",
          "Recovers within a minute",
          "Can continue after a few setbacks",
          "Persistent problems cause abandonment",
        ],
      },
      {
        value: 0.75,
        label: "High Resilience",
        behaviors: [
          "Shrugs off most errors quickly",
          "Treats failures as learning opportunities",
          "Maintains positive attitude through problems",
          "Rarely abandons due to frustration",
        ],
      },
      {
        value: 1.0,
        label: "Extremely High Resilience",
        behaviors: [
          "Errors don't affect emotional state",
          "Instantly refocuses after failures",
          "Views all setbacks as temporary",
          "Never abandons due to frustration alone",
        ],
      },
    ],
  },
  {
    name: "selfEfficacy",
    description: "Belief in ability to solve interface problems",
    researchBasis: "Bandura (1977) - Self-Efficacy Theory; Compeau & Higgins (1995)",
    levels: [
      {
        value: 0.0,
        label: "Very Low Self-Efficacy",
        behaviors: [
          "Assumes they can't figure things out",
          "Seeks help immediately on any confusion",
          "Blames self for all interface problems",
          "Avoids unfamiliar features entirely",
        ],
      },
      {
        value: 0.25,
        label: "Low Self-Efficacy",
        behaviors: [
          "Doubts ability to solve problems",
          "Quick to ask for help",
          "Attributes success to luck",
          "Avoids complex features",
        ],
      },
      {
        value: 0.5,
        label: "Moderate Self-Efficacy",
        behaviors: [
          "Believes they can solve most problems",
          "Tries before asking for help",
          "Balanced attribution of success/failure",
          "Willing to attempt new features",
        ],
      },
      {
        value: 0.75,
        label: "High Self-Efficacy",
        behaviors: [
          "Confident in problem-solving ability",
          "Rarely needs external help",
          "Attributes success to skill",
          "Embraces challenging features",
        ],
      },
      {
        value: 1.0,
        label: "Very High Self-Efficacy",
        behaviors: [
          "Absolutely confident in ability",
          "Never seeks help, always self-solves",
          "May underestimate problem difficulty",
          "Attempts anything without hesitation",
        ],
      },
    ],
  },
  {
    name: "satisficing",
    description: "Decision style: accept 'good enough' vs. seek optimal",
    researchBasis: "Simon (1956) - Bounded Rationality; Schwartz (2002) - Maximizing vs Satisficing",
    levels: [
      {
        value: 0.0,
        label: "Extreme Maximizer",
        behaviors: [
          "Must find the absolute best option",
          "Compares all available alternatives",
          "Experiences choice paralysis with many options",
          "Often regrets decisions, wonders 'what if'",
        ],
      },
      {
        value: 0.25,
        label: "Maximizer",
        behaviors: [
          "Seeks best option within reason",
          "Compares multiple alternatives",
          "Struggles with too many choices",
          "Sometimes second-guesses decisions",
        ],
      },
      {
        value: 0.5,
        label: "Balanced Decision Style",
        behaviors: [
          "Compares a few options then decides",
          "Balances optimization with efficiency",
          "Comfortable with 'good enough'",
          "Occasionally optimizes for important decisions",
        ],
      },
      {
        value: 0.75,
        label: "Satisficer",
        behaviors: [
          "Accepts first option meeting criteria",
          "Decides quickly without comparison",
          "Rarely second-guesses choices",
          "Prioritizes speed over optimization",
        ],
      },
      {
        value: 1.0,
        label: "Extreme Satisficer",
        behaviors: [
          "Takes first available option",
          "Never compares alternatives",
          "Decides instantly without deliberation",
          "May miss better options due to speed",
        ],
      },
    ],
  },
  {
    name: "trustCalibration",
    description: "Baseline trust toward websites and requests",
    researchBasis: "Fogg (2003) - Persuasive Technology; Riegelsberger (2005)",
    levels: [
      {
        value: 0.0,
        label: "Highly Skeptical",
        behaviors: [
          "Assumes all sites are potentially malicious",
          "Never provides real personal information",
          "Uses fake emails and disposable cards",
          "Scrutinizes every request for data",
        ],
      },
      {
        value: 0.25,
        label: "Skeptical",
        behaviors: [
          "Suspicious of most requests",
          "Verifies site legitimacy before engaging",
          "Limits information sharing",
          "Prefers well-known brands",
        ],
      },
      {
        value: 0.5,
        label: "Moderate Trust",
        behaviors: [
          "Trusts reputable-looking sites",
          "Provides information for clear value",
          "Checks for security indicators",
          "Reasonable caution without paranoia",
        ],
      },
      {
        value: 0.75,
        label: "Trusting",
        behaviors: [
          "Generally trusts professional sites",
          "Provides information readily",
          "Doesn't scrutinize requests closely",
          "Assumes good intent from businesses",
        ],
      },
      {
        value: 1.0,
        label: "Highly Trusting",
        behaviors: [
          "Trusts almost any site or request",
          "Provides any information asked",
          "Ignores security warnings",
          "Doesn't verify legitimacy",
        ],
      },
    ],
  },
  {
    name: "interruptRecovery",
    description: "Ability to resume tasks after interruption",
    researchBasis: "Mark et al. (2005) - Average 23min recovery; Altmann & Trafton (2002)",
    levels: [
      {
        value: 0.0,
        label: "Very Poor Recovery",
        behaviors: [
          "Completely loses track after any interruption",
          "Must restart task from beginning",
          "Can't remember what they were doing",
          "Abandons interrupted tasks frequently",
        ],
      },
      {
        value: 0.25,
        label: "Poor Recovery",
        behaviors: [
          "Struggles to resume after interruption",
          "Takes 5+ minutes to reorient",
          "Often repeats completed steps",
          "Benefits greatly from progress indicators",
        ],
      },
      {
        value: 0.5,
        label: "Moderate Recovery",
        behaviors: [
          "Can resume with some effort",
          "Takes 1-2 minutes to reorient",
          "Uses environmental cues to remember",
          "Occasional backtracking after interruption",
        ],
      },
      {
        value: 0.75,
        label: "Good Recovery",
        behaviors: [
          "Quickly resumes interrupted tasks",
          "Remembers exact state before interruption",
          "Uses mental bookmarks effectively",
          "Rarely loses progress to interruptions",
        ],
      },
      {
        value: 1.0,
        label: "Excellent Recovery",
        behaviors: [
          "Seamlessly resumes any interrupted task",
          "Perfect recall of state before interruption",
          "Handles frequent interruptions easily",
          "Never loses progress or context",
        ],
      },
    ],
  },
  {
    name: "informationForaging",
    description: "Strategy for finding information: exhaustive search vs. scent-following",
    researchBasis: "Pirolli & Card (1999) - Information Foraging Theory",
    levels: [
      {
        value: 0.0,
        label: "Exhaustive Search",
        behaviors: [
          "Systematically examines every option",
          "Doesn't skip any section or link",
          "Reads all content before deciding",
          "Very slow but thorough exploration",
        ],
      },
      {
        value: 0.25,
        label: "Methodical Search",
        behaviors: [
          "Explores most options systematically",
          "Follows some information scent",
          "Reads section headings before diving in",
          "Balances thoroughness with efficiency",
        ],
      },
      {
        value: 0.5,
        label: "Balanced Foraging",
        behaviors: [
          "Follows strong information scent",
          "Explores promising paths first",
          "Backtracks if scent goes cold",
          "Moderate exploration efficiency",
        ],
      },
      {
        value: 0.75,
        label: "Efficient Foraging",
        behaviors: [
          "Quickly follows information scent",
          "Skips low-scent areas",
          "Makes rapid relevance judgments",
          "Rarely backtracks unnecessarily",
        ],
      },
      {
        value: 1.0,
        label: "Expert Foraging",
        behaviors: [
          "Instantly identifies strongest scent",
          "Extremely efficient path-finding",
          "Never explores dead ends",
          "May miss information off main scent trail",
        ],
      },
    ],
  },
  {
    name: "changeBlindness",
    description: "Tendency to miss changes in peripheral areas",
    researchBasis: "Simons & Rensink (2005) - Change Blindness; Inattentional Blindness",
    levels: [
      {
        value: 0.0,
        label: "Notices All Changes",
        behaviors: [
          "Immediately spots any UI change",
          "Notices subtle color or layout shifts",
          "Detects changes in peripheral vision",
          "High visual attention to entire screen",
        ],
      },
      {
        value: 0.25,
        label: "Good Change Detection",
        behaviors: [
          "Notices most changes",
          "Catches updates in focus area",
          "Sometimes misses peripheral changes",
          "Notices animations and movements",
        ],
      },
      {
        value: 0.5,
        label: "Moderate Change Detection",
        behaviors: [
          "Notices obvious changes",
          "Misses subtle or gradual changes",
          "Requires movement to draw attention",
          "May miss toast notifications",
        ],
      },
      {
        value: 0.75,
        label: "Poor Change Detection",
        behaviors: [
          "Misses most peripheral changes",
          "Needs explicit indicators for updates",
          "Doesn't notice banner updates",
          "Focused tunnel vision",
        ],
      },
      {
        value: 1.0,
        label: "Severe Change Blindness",
        behaviors: [
          "Misses even significant changes",
          "Doesn't notice error messages appearing",
          "Ignores notification badges",
          "Needs flashing/animation to notice anything",
        ],
      },
    ],
  },
  {
    name: "anchoringBias",
    description: "How much first information anchors subsequent judgments",
    researchBasis: "Tversky & Kahneman (1974) - Anchoring and Adjustment",
    levels: [
      {
        value: 0.0,
        label: "No Anchoring",
        behaviors: [
          "Evaluates each option independently",
          "Not influenced by first price/offer seen",
          "Compares objectively without bias",
          "Resets expectations with new information",
        ],
      },
      {
        value: 0.25,
        label: "Slight Anchoring",
        behaviors: [
          "Somewhat influenced by first information",
          "Can adjust when shown counter-evidence",
          "Compares to initial anchor but updates",
          "Mild preference for first option",
        ],
      },
      {
        value: 0.5,
        label: "Moderate Anchoring",
        behaviors: [
          "First information significantly influences",
          "Compares all options to first seen",
          "Adjustments from anchor are incomplete",
          "Default option strongly preferred",
        ],
      },
      {
        value: 0.75,
        label: "Strong Anchoring",
        behaviors: [
          "Heavily anchored to first information",
          "Rarely updates initial assessment",
          "First price seems 'normal', others 'high/low'",
          "Resistant to information that contradicts anchor",
        ],
      },
      {
        value: 1.0,
        label: "Extreme Anchoring",
        behaviors: [
          "Completely anchored to first information",
          "Won't change initial assessment",
          "All subsequent options judged against first",
          "Ignores contradicting information",
        ],
      },
    ],
  },
  {
    name: "timeHorizon",
    description: "Focus on immediate vs. long-term outcomes",
    researchBasis: "Ainslie (2001) - Hyperbolic Discounting; Present Bias",
    levels: [
      {
        value: 0.0,
        label: "Long-Term Focus",
        behaviors: [
          "Willing to wait for better outcomes",
          "Prefers delayed gratification",
          "Plans for future needs",
          "Accepts short-term inconvenience",
        ],
      },
      {
        value: 0.25,
        label: "Moderate Long-Term",
        behaviors: [
          "Considers future consequences",
          "Some patience for delayed rewards",
          "Balances now vs. later",
          "Values planning but not rigidly",
        ],
      },
      {
        value: 0.5,
        label: "Balanced Time Horizon",
        behaviors: [
          "Weighs immediate and future outcomes",
          "Context-dependent patience",
          "Reasonable trade-offs between now and later",
          "Neither impulsive nor over-planning",
        ],
      },
      {
        value: 0.75,
        label: "Present-Biased",
        behaviors: [
          "Prefers immediate outcomes",
          "Discounts future benefits heavily",
          "Chooses now over better-later",
          "Limited patience for delayed rewards",
        ],
      },
      {
        value: 1.0,
        label: "Extreme Present Focus",
        behaviors: [
          "Only cares about immediate results",
          "Won't wait for anything",
          "Ignores future consequences entirely",
          "Maximum hyperbolic discounting",
        ],
      },
    ],
  },
  {
    name: "attributionStyle",
    description: "Tendency to blame self vs. system for errors",
    researchBasis: "Weiner (1985) - Attribution Theory; Norman (1988) - Design of Everyday Things",
    levels: [
      {
        value: 0.0,
        label: "External Attribution",
        behaviors: [
          "Blames system/design for all errors",
          "Never assumes user error",
          "Expects interfaces to accommodate",
          "Reports bugs confidently",
        ],
      },
      {
        value: 0.25,
        label: "Mostly External",
        behaviors: [
          "Usually blames design for problems",
          "Recognizes some user errors",
          "Assumes most issues are system bugs",
          "Confident in problem reporting",
        ],
      },
      {
        value: 0.5,
        label: "Balanced Attribution",
        behaviors: [
          "Considers both user and system causes",
          "Reasonable assessment of fault",
          "Neither over-blames self nor system",
          "Context-dependent attribution",
        ],
      },
      {
        value: 0.75,
        label: "Mostly Internal",
        behaviors: [
          "Usually blames self for errors",
          "Assumes they're doing something wrong",
          "Reluctant to report bugs",
          "Questions own competence",
        ],
      },
      {
        value: 1.0,
        label: "Internal Attribution",
        behaviors: [
          "Always blames self for all errors",
          "Never considers system at fault",
          "Feels incompetent with any error",
          "Won't report bugs, assumes user error",
        ],
      },
    ],
  },
  {
    name: "metacognitivePlanning",
    description: "Tendency to plan before acting vs. trial-and-error",
    researchBasis: "Flavell (1979) - Metacognition; Card, Moran & Newell (1983) - GOMS",
    levels: [
      {
        value: 0.0,
        label: "Pure Trial-and-Error",
        behaviors: [
          "Clicks immediately without thinking",
          "No planning before action",
          "Random exploration strategy",
          "Doesn't form mental models",
        ],
      },
      {
        value: 0.25,
        label: "Minimal Planning",
        behaviors: [
          "Brief consideration before acting",
          "Some trial-and-error approach",
          "Forms simple expectations",
          "Adjusts approach after failures",
        ],
      },
      {
        value: 0.5,
        label: "Moderate Planning",
        behaviors: [
          "Thinks before acting on important tasks",
          "Mixes planning with exploration",
          "Forms rough mental models",
          "Plans for multi-step tasks",
        ],
      },
      {
        value: 0.75,
        label: "Careful Planning",
        behaviors: [
          "Plans most actions before taking them",
          "Forms clear mental models",
          "Anticipates consequences",
          "Systematic approach to tasks",
        ],
      },
      {
        value: 1.0,
        label: "Extensive Planning",
        behaviors: [
          "Always plans thoroughly before acting",
          "Detailed mental models of systems",
          "Anticipates all edge cases",
          "May over-plan simple tasks",
        ],
      },
    ],
  },
  {
    name: "proceduralFluency",
    description: "Ability to follow multi-step procedures",
    researchBasis: "Anderson (1982) - ACT-R; Procedural Memory",
    levels: [
      {
        value: 0.0,
        label: "Very Low Fluency",
        behaviors: [
          "Struggles with any multi-step process",
          "Loses place in procedures frequently",
          "Needs step-by-step guidance always",
          "Can't follow sequences from memory",
        ],
      },
      {
        value: 0.25,
        label: "Low Fluency",
        behaviors: [
          "Handles 2-3 step procedures",
          "Needs reminders for longer sequences",
          "Sometimes skips or repeats steps",
          "Benefits from progress indicators",
        ],
      },
      {
        value: 0.5,
        label: "Moderate Fluency",
        behaviors: [
          "Follows most standard procedures",
          "Handles 4-5 step sequences",
          "Occasional confusion on complex flows",
          "Can recover from minor errors in sequence",
        ],
      },
      {
        value: 0.75,
        label: "Good Fluency",
        behaviors: [
          "Follows complex procedures easily",
          "Handles 6-8 step sequences",
          "Rarely makes procedural errors",
          "Adapts procedures to context",
        ],
      },
      {
        value: 1.0,
        label: "Excellent Fluency",
        behaviors: [
          "Masters any procedure quickly",
          "Handles unlimited step sequences",
          "Never loses place in procedures",
          "Automates familiar procedures",
        ],
      },
    ],
  },
  {
    name: "transferLearning",
    description: "Ability to apply knowledge from one interface to another",
    researchBasis: "Thorndike (1901) - Transfer of Practice; Singley & Anderson (1989)",
    levels: [
      {
        value: 0.0,
        label: "No Transfer",
        behaviors: [
          "Each interface is completely novel",
          "Doesn't apply prior experience",
          "Starts from scratch every time",
          "No recognition of patterns across sites",
        ],
      },
      {
        value: 0.25,
        label: "Low Transfer",
        behaviors: [
          "Recognizes only identical patterns",
          "Struggles with variations",
          "Some learning transfers to identical UIs",
          "Confused by similar but different patterns",
        ],
      },
      {
        value: 0.5,
        label: "Moderate Transfer",
        behaviors: [
          "Transfers learning to similar interfaces",
          "Recognizes common patterns",
          "Adapts some knowledge across contexts",
          "Sometimes confused by variations",
        ],
      },
      {
        value: 0.75,
        label: "Good Transfer",
        behaviors: [
          "Applies learning broadly",
          "Recognizes patterns despite variations",
          "Quickly adapts to new interfaces",
          "Abstracts principles from experience",
        ],
      },
      {
        value: 1.0,
        label: "Excellent Transfer",
        behaviors: [
          "Instantly applies all prior learning",
          "Recognizes abstract patterns everywhere",
          "Every new interface feels familiar",
          "Master of analogical reasoning",
        ],
      },
    ],
  },
  {
    name: "authoritySensitivity",
    description: "Tendency to follow authority cues and official-looking content",
    researchBasis: "Milgram (1963) - Obedience to Authority; Cialdini (2006) - Authority Principle",
    levels: [
      {
        value: 0.0,
        label: "Authority Skeptic",
        behaviors: [
          "Questions all authority claims",
          "Verifies credentials independently",
          "Not influenced by official appearance",
          "Prefers peer reviews over expert claims",
        ],
      },
      {
        value: 0.25,
        label: "Moderately Skeptical",
        behaviors: [
          "Some skepticism of authority",
          "Verifies important claims",
          "Influenced but not controlled by authority",
          "Balances trust with verification",
        ],
      },
      {
        value: 0.5,
        label: "Balanced Authority Response",
        behaviors: [
          "Respects authority within reason",
          "Follows official guidance generally",
          "Questions when stakes are high",
          "Context-dependent authority trust",
        ],
      },
      {
        value: 0.75,
        label: "Authority Responsive",
        behaviors: [
          "Follows authority guidance readily",
          "Official-looking content is trusted",
          "Rarely questions expert claims",
          "Influenced by credentials and titles",
        ],
      },
      {
        value: 1.0,
        label: "Authority Deferential",
        behaviors: [
          "Always follows authority without question",
          "Completely trusts official appearance",
          "Never verifies claims from authorities",
          "Highly susceptible to authority manipulation",
        ],
      },
    ],
  },
  {
    name: "emotionalContagion",
    description: "How much UI emotional design affects user mood",
    researchBasis: "Hatfield (1994) - Emotional Contagion; Norman (2004) - Emotional Design",
    levels: [
      {
        value: 0.0,
        label: "Emotionally Stable",
        behaviors: [
          "UI design doesn't affect mood",
          "Same performance in any aesthetic",
          "Not influenced by color psychology",
          "Purely functional evaluation",
        ],
      },
      {
        value: 0.25,
        label: "Slightly Affected",
        behaviors: [
          "Minor mood influence from UI",
          "Prefers pleasant aesthetics but functions anywhere",
          "Subtle color effects noticed",
          "Mostly rational evaluation",
        ],
      },
      {
        value: 0.5,
        label: "Moderately Affected",
        behaviors: [
          "UI aesthetics affect experience noticeably",
          "Happy designs improve mood/performance",
          "Frustrated by ugly interfaces",
          "Emotional response to design choices",
        ],
      },
      {
        value: 0.75,
        label: "Strongly Affected",
        behaviors: [
          "UI design significantly affects mood",
          "Strong preference for pleasing aesthetics",
          "Performance varies with emotional design",
          "Very responsive to color and imagery",
        ],
      },
      {
        value: 1.0,
        label: "Highly Contagious",
        behaviors: [
          "Mood completely controlled by UI design",
          "Can't function in unappealing interfaces",
          "Extreme response to emotional design",
          "Performance entirely mood-dependent",
        ],
      },
    ],
  },
  {
    name: "fearOfMissingOut",
    description: "Susceptibility to urgency and scarcity messaging",
    researchBasis: "Przybylski (2013) - Fear of Missing Out Scale; Cialdini - Scarcity Principle",
    levels: [
      {
        value: 0.0,
        label: "FOMO Immune",
        behaviors: [
          "Ignores all urgency messaging",
          "Not influenced by countdown timers",
          "Scarcity claims don't affect decisions",
          "'Limited time' means nothing",
        ],
      },
      {
        value: 0.25,
        label: "Low FOMO",
        behaviors: [
          "Rarely affected by urgency",
          "Recognizes manipulation tactics",
          "Minor response to genuine scarcity",
          "Evaluates deals on merit",
        ],
      },
      {
        value: 0.5,
        label: "Moderate FOMO",
        behaviors: [
          "Sometimes influenced by urgency",
          "Responds to credible scarcity",
          "Countdown timers create mild pressure",
          "Balances FOMO with rationality",
        ],
      },
      {
        value: 0.75,
        label: "High FOMO",
        behaviors: [
          "Often influenced by urgency messaging",
          "'Only X left' creates strong pressure",
          "Countdown timers trigger action",
          "Fears missing good deals",
        ],
      },
      {
        value: 1.0,
        label: "Extreme FOMO",
        behaviors: [
          "Always responds to urgency",
          "Any scarcity claim triggers action",
          "Can't resist 'limited time' offers",
          "Highly susceptible to FOMO manipulation",
        ],
      },
    ],
  },
  {
    name: "socialProofSensitivity",
    description: "Influence of reviews, ratings, and social signals",
    researchBasis: "Cialdini (2006) - Social Proof; Bandura (1977) - Social Learning",
    levels: [
      {
        value: 0.0,
        label: "Ignores Social Proof",
        behaviors: [
          "Reviews don't influence decisions",
          "Evaluates purely on own criteria",
          "Star ratings are meaningless",
          "Trusts own judgment over crowd",
        ],
      },
      {
        value: 0.25,
        label: "Low Social Proof Influence",
        behaviors: [
          "Minor consideration of reviews",
          "Uses ratings as one factor",
          "Skeptical of testimonials",
          "Independent evaluation primary",
        ],
      },
      {
        value: 0.5,
        label: "Moderate Social Proof",
        behaviors: [
          "Reviews influence moderately",
          "Checks ratings before deciding",
          "Testimonials carry some weight",
          "Balances social proof with own assessment",
        ],
      },
      {
        value: 0.75,
        label: "High Social Proof Influence",
        behaviors: [
          "Reviews heavily influence decisions",
          "High ratings required for consideration",
          "Trusts testimonials significantly",
          "'Most popular' is very persuasive",
        ],
      },
      {
        value: 1.0,
        label: "Relies on Social Proof",
        behaviors: [
          "Won't decide without reviews",
          "Follows crowd blindly",
          "Highest-rated always chosen",
          "Incapable of independent evaluation",
        ],
      },
    ],
  },
  {
    name: "mentalModelRigidity",
    description: "Ability to update mental models when interfaces change",
    researchBasis: "Johnson-Laird (1983) - Mental Models; Norman (2013) - Design of Everyday Things",
    levels: [
      {
        value: 0.0,
        label: "Rigid Mental Models",
        behaviors: [
          "Can't adapt to interface changes",
          "Expects things where they used to be",
          "Frustrated by any redesign",
          "Stuck on old patterns",
        ],
      },
      {
        value: 0.25,
        label: "Slow to Adapt",
        behaviors: [
          "Gradual adjustment to changes",
          "Needs time to relearn",
          "Prefers familiar layouts",
          "Eventually adapts with effort",
        ],
      },
      {
        value: 0.5,
        label: "Moderately Flexible",
        behaviors: [
          "Adjusts to changes reasonably",
          "Some friction with new patterns",
          "Can update mental models with effort",
          "Balances old habits with new learning",
        ],
      },
      {
        value: 0.75,
        label: "Flexible",
        behaviors: [
          "Quickly adapts to new patterns",
          "Updates mental models easily",
          "Minor friction with changes",
          "Embraces improvements",
        ],
      },
      {
        value: 1.0,
        label: "Extremely Flexible",
        behaviors: [
          "Instantly adapts to any change",
          "Mental models update immediately",
          "No preference for old patterns",
          "Thrives on interface evolution",
        ],
      },
    ],
  },
];

// ============================================================================
// Questionnaire System
// ============================================================================

export interface QuestionnaireQuestion {
  id: string;
  trait: keyof CognitiveTraits;
  question: string;
  options: Array<{
    value: number;
    label: string;
    description: string;
  }>;
}

/**
 * Generate a questionnaire for building a custom persona.
 * Returns a subset of questions covering the most impactful traits.
 */
export function generatePersonaQuestionnaire(options?: {
  comprehensive?: boolean;  // All traits vs. core subset
  traits?: (keyof CognitiveTraits)[];  // Specific traits to include
}): QuestionnaireQuestion[] {
  const { comprehensive = false, traits } = options || {};

  // Core traits that have the highest behavioral impact
  const coreTraits: (keyof CognitiveTraits)[] = [
    "patience",
    "riskTolerance",
    "comprehension",
    "selfEfficacy",
    "satisficing",
    "trustCalibration",
    "workingMemory",
    "resilience",
  ];

  const traitsToInclude = traits || (comprehensive
    ? TRAIT_REFERENCE_MATRIX.map(t => t.name)
    : coreTraits);

  return traitsToInclude.map(traitName => {
    const traitRef = TRAIT_REFERENCE_MATRIX.find(t => t.name === traitName);
    if (!traitRef) return null;

    // Create question with 4 options (0.0, 0.33, 0.67, 1.0) for simpler choice
    const levels = [
      traitRef.levels[0],  // 0.0
      traitRef.levels[1],  // 0.25
      traitRef.levels[3],  // 0.75
      traitRef.levels[4],  // 1.0
    ];

    return {
      id: traitName,
      trait: traitName,
      question: generateQuestionText(traitRef),
      options: levels.map(level => ({
        value: level.value,
        label: level.label,
        description: level.behaviors.slice(0, 2).join("; "),
      })),
    };
  }).filter(Boolean) as QuestionnaireQuestion[];
}

function generateQuestionText(trait: TraitReference): string {
  const questionMap: Record<string, string> = {
    patience: "When you encounter a confusing website, how long do you typically try before giving up?",
    riskTolerance: "How comfortable are you clicking on unfamiliar buttons or entering information on new websites?",
    comprehension: "How easily do you understand new website interfaces and features?",
    persistence: "When something doesn't work the first time, what do you usually do?",
    curiosity: "While completing a task online, how often do you explore unrelated features or content?",
    workingMemory: "How well do you remember what you've already tried when troubleshooting?",
    readingTendency: "How much of a webpage's text do you typically read?",
    resilience: "After encountering an error or frustrating experience, how quickly do you recover?",
    selfEfficacy: "How confident are you in your ability to figure out new websites on your own?",
    satisficing: "When making choices online (products, services, options), how do you decide?",
    trustCalibration: "How trusting are you of websites asking for your information?",
    interruptRecovery: "If you're interrupted while completing an online task, how easily do you pick up where you left off?",
    informationForaging: "When searching for information on a website, what's your approach?",
    changeBlindness: "How often do you notice when something changes on a webpage (new messages, updates)?",
    anchoringBias: "When comparing options (prices, features), how much does the first option you see influence your judgment?",
    timeHorizon: "When faced with a choice between something now vs. something better later, what do you prefer?",
    attributionStyle: "When something goes wrong on a website, what's your first thought?",
    metacognitivePlanning: "Before starting a new task on a website, do you plan your approach?",
    proceduralFluency: "How comfortable are you with multi-step processes (like checkout flows)?",
    transferLearning: "When you visit a new website, how much do you apply what you learned from other sites?",
    authoritySensitivity: "How much do official-looking badges, certifications, or expert endorsements influence you?",
    emotionalContagion: "How much does the visual design and aesthetics of a website affect your experience?",
    fearOfMissingOut: "How do 'limited time' offers and countdown timers affect your decisions?",
    socialProofSensitivity: "How much do reviews, ratings, and testimonials influence your decisions?",
    mentalModelRigidity: "When a website you use regularly changes its layout, how do you respond?",
  };

  return questionMap[trait.name] || `How would you describe your ${trait.name}?`;
}

/**
 * Build cognitive traits from questionnaire answers.
 * Missing answers default to 0.5 (neutral baseline).
 */
export function buildTraitsFromAnswers(
  answers: Record<string, number>
): CognitiveTraits {
  const traits: CognitiveTraits = {
    patience: 0.5,
    riskTolerance: 0.5,
    comprehension: 0.5,
    persistence: 0.5,
    curiosity: 0.5,
    workingMemory: 0.5,
    readingTendency: 0.5,
    resilience: 0.5,
    selfEfficacy: 0.5,
    satisficing: 0.5,
    trustCalibration: 0.5,
    interruptRecovery: 0.5,
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

  // Apply answers
  for (const [trait, value] of Object.entries(answers)) {
    if (trait in traits) {
      (traits as unknown as Record<string, number>)[trait] = value;
    }
  }

  // Apply trait correlations (research-based)
  applyTraitCorrelations(traits);

  return traits;
}

/**
 * Round to 2 decimal places to avoid floating-point precision artifacts.
 * e.g., 0.8000000000000001 becomes 0.8
 */
function roundTrait(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Apply research-based correlations between traits.
 * When one trait is set, related traits should adjust unless explicitly set.
 * v16.7.2: Added precision rounding to avoid floating-point artifacts.
 * v16.7.2: Exported for use in createCognitivePersona.
 */
export function applyTraitCorrelations(traits: CognitiveTraits): void {
  // If patience is low, resilience tends to be low (r = 0.4)
  if (traits.patience < 0.3 && traits.resilience === 0.5) {
    traits.resilience = 0.3;
  }

  // High comprehension correlates with transfer learning (r = 0.6)
  if (traits.comprehension > 0.7 && traits.transferLearning === 0.5) {
    traits.transferLearning = roundTrait(traits.comprehension * 0.8);
  }

  // Low self-efficacy correlates with internal attribution (r = 0.5)
  if (traits.selfEfficacy !== undefined && traits.selfEfficacy < 0.3 && traits.attributionStyle === 0.5) {
    traits.attributionStyle = 0.7;  // Blame self more
  }

  // High curiosity correlates with FOMO (r = 0.3)
  if (traits.curiosity > 0.7 && traits.fearOfMissingOut === 0.5) {
    traits.fearOfMissingOut = 0.6;
  }

  // Low working memory correlates with poor procedural fluency (r = 0.7)
  if (traits.workingMemory < 0.3 && traits.proceduralFluency === 0.5) {
    traits.proceduralFluency = roundTrait(traits.workingMemory * 1.2);
  }

  // High trust correlates with authority sensitivity (r = 0.4)
  if (traits.trustCalibration !== undefined && traits.trustCalibration > 0.7 && traits.authoritySensitivity === 0.5) {
    traits.authoritySensitivity = 0.7;
  }
}

// ============================================================================
// Trait Lookup Utilities
// ============================================================================

/**
 * Get behavioral description for a specific trait value.
 */
export function getTraitBehaviors(
  trait: keyof CognitiveTraits,
  value: number
): string[] {
  const traitRef = TRAIT_REFERENCE_MATRIX.find(t => t.name === trait);
  if (!traitRef) return [];

  // Find the closest level
  const level = traitRef.levels.reduce((prev, curr) =>
    Math.abs(curr.value - value) < Math.abs(prev.value - value) ? curr : prev
  );

  return level.behaviors;
}

/**
 * Get the label for a specific trait value.
 */
export function getTraitLabel(
  trait: keyof CognitiveTraits,
  value: number
): string {
  const traitRef = TRAIT_REFERENCE_MATRIX.find(t => t.name === trait);
  if (!traitRef) return "Unknown";

  const level = traitRef.levels.reduce((prev, curr) =>
    Math.abs(curr.value - value) < Math.abs(prev.value - value) ? curr : prev
  );

  return level.label;
}

/**
 * Get full trait reference information.
 */
export function getTraitReference(trait: keyof CognitiveTraits): TraitReference | undefined {
  return TRAIT_REFERENCE_MATRIX.find(t => t.name === trait);
}

/**
 * v16.7.2: Meaningful short headers for traits (max 12 chars).
 * These are designed to be readable, not just truncated.
 */
const TRAIT_SHORT_HEADERS: Record<string, string> = {
  // Tier 1: Core (7)
  patience: "Patience",
  riskTolerance: "Risk",
  comprehension: "Comprehend",
  persistence: "Persist",
  curiosity: "Curiosity",
  workingMemory: "Memory",
  readingTendency: "Reading",
  // Tier 2: Emotional (4)
  resilience: "Resilience",
  selfEfficacy: "Self-Effic",
  satisficing: "Satisficing",
  trustCalibration: "Trust",
  // Tier 3: Decision (4)
  interruptRecovery: "Interrupt",
  informationForaging: "Foraging",
  changeBlindness: "Change",
  anchoringBias: "Anchoring",
  // Tier 4: Planning (4)
  timeHorizon: "TimeHorizon",
  attributionStyle: "Attribution",
  metacognitivePlanning: "MetaCog",
  proceduralFluency: "Procedure",
  // Tier 5: Perception (2)
  transferLearning: "Transfer",
  authoritySensitivity: "Authority",
  // Tier 6: Social (4)
  emotionalContagion: "Emotional",
  fearOfMissingOut: "FOMO",
  socialProofSensitivity: "SocialProof",
  mentalModelRigidity: "Rigidity",
};

/**
 * Get a short header for a trait (max 12 chars).
 */
function getTraitShortHeader(trait: string): string {
  return TRAIT_SHORT_HEADERS[trait] || trait.slice(0, 12);
}

/**
 * Export questionnaire as AskUserQuestion format for Claude sessions.
 */
export function formatForAskUserQuestion(questions: QuestionnaireQuestion[]): Array<{
  question: string;
  header: string;
  options: Array<{ label: string; description: string }>;
  multiSelect: boolean;
}> {
  return questions.map(q => ({
    question: q.question,
    header: getTraitShortHeader(q.trait),  // v16.7.2: Use meaningful abbreviations
    options: q.options.map(o => ({
      label: o.label,
      description: o.description,
    })),
    multiSelect: false,
  }));
}
