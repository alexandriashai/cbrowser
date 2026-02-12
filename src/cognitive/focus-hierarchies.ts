/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexa Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */


/**
 * Focus Hierarchy Presets for Realistic Attention Simulation
 *
 * Based on eye-tracking research and human attention patterns:
 * - Nielsen Norman Group: F-Pattern in reading web content
 * - Baymard Institute: User attention in e-commerce
 * - Google Material Design: Visual hierarchy principles
 * - WebAIM: How users with disabilities navigate
 *
 * These presets define how different users focus attention based on their task.
 */

import type {
  TaskType,
  FocusHierarchy,
  FocusHierarchyPreset,
  DistractionFilter,
  FocusAreaType,
} from "../types.js";

// ============================================================================
// Common Distraction Filters
// ============================================================================

/**
 * UI patterns that experienced users learn to ignore.
 * Based on "banner blindness" research and common web patterns.
 */
export const COMMON_DISTRACTIONS: DistractionFilter[] = [
  // Cookie/GDPR banners - users dismiss reflexively
  { pattern: "cookie", ignoreRate: 0.85, reason: "Cookie consent fatigue" },
  { pattern: "gdpr", ignoreRate: 0.85, reason: "GDPR banner blindness" },
  { pattern: "consent", ignoreRate: 0.8, reason: "Consent popup fatigue" },

  // Newsletter/subscription popups
  { pattern: "newsletter", ignoreRate: 0.9, reason: "Newsletter popup fatigue" },
  { pattern: "subscribe", ignoreRate: 0.75, reason: "Subscription prompts" },
  { pattern: "sign up for", ignoreRate: 0.7, reason: "Signup prompt fatigue" },

  // Chat widgets - ignored unless actively seeking help
  { pattern: "chat", ignoreRate: 0.8, reason: "Chat widget blindness" },
  { pattern: "help", ignoreRate: 0.6, reason: "Help widget (unless stuck)" },
  { pattern: "support", ignoreRate: 0.6, reason: "Support widget" },

  // Promotional elements
  { pattern: "promo", ignoreRate: 0.85, reason: "Promotional banner blindness" },
  { pattern: "sale", ignoreRate: 0.7, reason: "Sale banner (unless shopping)" },
  { pattern: "discount", ignoreRate: 0.7, reason: "Discount popup" },

  // Social media widgets
  { pattern: "social", ignoreRate: 0.9, reason: "Social widget blindness" },
  { pattern: "follow", ignoreRate: 0.85, reason: "Follow button blindness" },
  { pattern: "share", ignoreRate: 0.8, reason: "Share button blindness" },

  // Sidebar ads and recommendations
  { pattern: "recommended", ignoreRate: 0.75, reason: "Recommendation fatigue" },
  { pattern: "related", ignoreRate: 0.6, reason: "Related content (low priority)" },
  { pattern: "trending", ignoreRate: 0.7, reason: "Trending content distraction" },
];

/**
 * Task-specific distractions that matter less for certain goals.
 */
export const TASK_SPECIFIC_DISTRACTIONS: Record<TaskType, DistractionFilter[]> = {
  find_information: [
    // When finding info, forms are low priority unless they're search
    { pattern: "form:not([action*='search'])", ignoreRate: 0.7, reason: "Forms distract from info-seeking" },
    // Account/login sections are irrelevant for info tasks
    { pattern: "login", ignoreRate: 0.8, reason: "Login irrelevant for info" },
    { pattern: "account", ignoreRate: 0.8, reason: "Account irrelevant for info" },
  ],
  complete_action: [
    // When completing an action, informational content is lower priority
    { pattern: "blog", ignoreRate: 0.85, reason: "Blog content distracts from action" },
    { pattern: "news", ignoreRate: 0.85, reason: "News content distracts from action" },
    { pattern: "about", ignoreRate: 0.7, reason: "About page less relevant" },
  ],
  explore: [
    // Explorers are less distracted by anything - they're curious
    // (Lower ignore rates than other tasks)
  ],
  compare: [
    // Comparison tasks focus on feature lists, pricing
    { pattern: "testimonial", ignoreRate: 0.6, reason: "Social proof secondary to facts" },
    { pattern: "faq", ignoreRate: 0.5, reason: "FAQ might have comparison info" },
  ],
  troubleshoot: [
    // Troubleshooting focuses on help/error content
    { pattern: "testimonial", ignoreRate: 0.9, reason: "Irrelevant when troubleshooting" },
    { pattern: "pricing", ignoreRate: 0.9, reason: "Pricing irrelevant for troubleshooting" },
    { pattern: "features", ignoreRate: 0.8, reason: "Features less relevant when troubleshooting" },
  ],
};

// ============================================================================
// Focus Hierarchy Presets
// ============================================================================

/**
 * Focus hierarchy for information-seeking tasks.
 * Example: "Find the international student application deadline"
 *
 * Based on research:
 * - Users scan headings first (Nielsen Norman Group)
 * - Navigation is used when headings don't help (Baymard)
 * - Search is preferred by 30% of users as first action
 */
export const FIND_INFORMATION_HIERARCHY: FocusHierarchy = {
  taskType: "find_information",

  focusAreas: [
    // Primary: Headings tell users where content is
    { area: "headings", probability: 0.95, relevanceBoost: 2.5, isPrimary: true },
    // High: Navigation if headings don't help
    { area: "navigation", probability: 0.85, relevanceBoost: 2.0, isPrimary: true },
    // High: Search box as quick alternative
    { area: "search", probability: 0.75, relevanceBoost: 2.0, isPrimary: false },
    // Medium: Main content for answers
    { area: "content", probability: 0.70, relevanceBoost: 1.5 },
    // Medium: CTAs might lead to relevant pages
    { area: "cta", probability: 0.50, relevanceBoost: 1.2 },
    // Low: Sidebar for secondary info
    { area: "sidebar", probability: 0.30, relevanceBoost: 0.8 },
    // Very low: Forms usually not relevant
    { area: "forms", probability: 0.15, relevanceBoost: 0.5 },
    // Very low: Footer as last resort
    { area: "footer", probability: 0.20, relevanceBoost: 0.6 },
    // Low: Hero sections often marketing fluff
    { area: "hero", probability: 0.25, relevanceBoost: 0.7 },
    // Low: Images unless informational
    { area: "images", probability: 0.20, relevanceBoost: 0.5 },
  ],

  distractionFilters: [
    ...COMMON_DISTRACTIONS,
    ...TASK_SPECIFIC_DISTRACTIONS.find_information,
  ],

  scanPattern: "f-pattern",
  navFirstProbability: 0.6,        // Often check nav first for section structure
  searchUseProbability: 0.3,       // ~30% prefer search (Nielsen research)
  attentionCapacity: 7,            // Miller's 7±2 rule
  focusDecayMs: 8000,              // Lose focus after 8s without progress
};

/**
 * Focus hierarchy for action-completion tasks.
 * Example: "Apply for admission", "Submit an inquiry form"
 *
 * Based on research:
 * - Users seek clear CTA buttons (Baymard)
 * - Forms are primary targets (UX research)
 * - Navigation used to find the right section first
 */
export const COMPLETE_ACTION_HIERARCHY: FocusHierarchy = {
  taskType: "complete_action",

  focusAreas: [
    // Primary: CTAs are the goal
    { area: "cta", probability: 0.95, relevanceBoost: 3.0, isPrimary: true },
    // Primary: Forms need to be completed
    { area: "forms", probability: 0.90, relevanceBoost: 2.8, isPrimary: true },
    // High: Navigation to find the right section
    { area: "navigation", probability: 0.80, relevanceBoost: 2.0, isPrimary: true },
    // Medium: Headings to orient
    { area: "headings", probability: 0.60, relevanceBoost: 1.5 },
    // Medium: Content might have instructions
    { area: "content", probability: 0.50, relevanceBoost: 1.2 },
    // Low: Hero might have action buttons
    { area: "hero", probability: 0.40, relevanceBoost: 1.0 },
    // Low: Search less useful for actions
    { area: "search", probability: 0.20, relevanceBoost: 0.8 },
    // Very low: Sidebar usually irrelevant
    { area: "sidebar", probability: 0.15, relevanceBoost: 0.5 },
    // Very low: Footer rarely has actions
    { area: "footer", probability: 0.10, relevanceBoost: 0.4 },
    // Very low: Images rarely actionable
    { area: "images", probability: 0.10, relevanceBoost: 0.3 },
  ],

  distractionFilters: [
    ...COMMON_DISTRACTIONS,
    ...TASK_SPECIFIC_DISTRACTIONS.complete_action,
  ],

  scanPattern: "spotted",          // Jump to action elements
  navFirstProbability: 0.75,       // Usually need to navigate to action page first
  searchUseProbability: 0.15,      // Search less common for actions
  attentionCapacity: 5,            // Focused on fewer elements
  focusDecayMs: 12000,             // More patient when trying to complete action
};

/**
 * Focus hierarchy for exploratory browsing.
 * Example: "What is this university about?", "Learn about the program"
 *
 * Based on research:
 * - Explorers scan broadly (eye-tracking studies)
 * - Curiosity drives engagement with varied content
 * - Less goal-oriented, more serendipitous
 */
export const EXPLORE_HIERARCHY: FocusHierarchy = {
  taskType: "explore",

  focusAreas: [
    // High: Hero introduces the site
    { area: "hero", probability: 0.85, relevanceBoost: 1.8, isPrimary: true },
    // High: Headings reveal structure
    { area: "headings", probability: 0.80, relevanceBoost: 1.5, isPrimary: true },
    // High: Navigation shows what's available
    { area: "navigation", probability: 0.75, relevanceBoost: 1.5, isPrimary: true },
    // Medium-High: Content is interesting to explorers
    { area: "content", probability: 0.70, relevanceBoost: 1.3 },
    // Medium: Images engage explorers
    { area: "images", probability: 0.60, relevanceBoost: 1.2 },
    // Medium: CTAs might lead to interesting pages
    { area: "cta", probability: 0.55, relevanceBoost: 1.0 },
    // Medium: Sidebar has additional content
    { area: "sidebar", probability: 0.50, relevanceBoost: 1.0 },
    // Lower: Search when looking for specific topics
    { area: "search", probability: 0.40, relevanceBoost: 0.8 },
    // Lower: Forms less interesting unless signup
    { area: "forms", probability: 0.30, relevanceBoost: 0.6 },
    // Low: Footer for additional links
    { area: "footer", probability: 0.35, relevanceBoost: 0.7 },
  ],

  distractionFilters: [
    // Explorers are less distracted - lower ignore rates
    ...COMMON_DISTRACTIONS.map(d => ({ ...d, ignoreRate: d.ignoreRate * 0.6 })),
  ],

  scanPattern: "z-pattern",        // Broad scanning
  navFirstProbability: 0.5,        // Sometimes check nav, sometimes not
  searchUseProbability: 0.2,       // Less search, more browsing
  attentionCapacity: 10,           // Broader attention for exploration
  focusDecayMs: 15000,             // More patient, enjoying the journey
};

/**
 * Focus hierarchy for comparison tasks.
 * Example: "Which program is better?", "Compare pricing plans"
 *
 * Based on research:
 * - Comparers seek structured data (tables, lists)
 * - Feature lists and pricing are primary targets
 * - Side-by-side layouts preferred
 */
export const COMPARE_HIERARCHY: FocusHierarchy = {
  taskType: "compare",

  focusAreas: [
    // Primary: Content has comparison details
    { area: "content", probability: 0.90, relevanceBoost: 2.5, isPrimary: true },
    // Primary: Headings label comparison sections
    { area: "headings", probability: 0.85, relevanceBoost: 2.0, isPrimary: true },
    // High: Navigation to find comparison pages
    { area: "navigation", probability: 0.70, relevanceBoost: 1.8 },
    // Medium: CTAs for "Compare" or "See details"
    { area: "cta", probability: 0.60, relevanceBoost: 1.5 },
    // Medium: Images might show product comparisons
    { area: "images", probability: 0.50, relevanceBoost: 1.2 },
    // Medium: Sidebar might have comparison tools
    { area: "sidebar", probability: 0.45, relevanceBoost: 1.0 },
    // Lower: Search for specific features
    { area: "search", probability: 0.35, relevanceBoost: 0.9 },
    // Lower: Forms for contact/quote
    { area: "forms", probability: 0.25, relevanceBoost: 0.6 },
    // Low: Hero often marketing
    { area: "hero", probability: 0.30, relevanceBoost: 0.7 },
    // Low: Footer last resort
    { area: "footer", probability: 0.15, relevanceBoost: 0.5 },
  ],

  distractionFilters: [
    ...COMMON_DISTRACTIONS,
    ...TASK_SPECIFIC_DISTRACTIONS.compare,
  ],

  scanPattern: "exhaustive",       // Careful comparison requires thoroughness
  navFirstProbability: 0.65,       // Often need to find comparison page
  searchUseProbability: 0.25,      // Might search for specific features
  attentionCapacity: 8,            // Need to track multiple factors
  focusDecayMs: 10000,             // Moderate patience
};

/**
 * Focus hierarchy for troubleshooting tasks.
 * Example: "Why can't I log in?", "How do I reset my password?"
 *
 * Based on research:
 * - Stressed users seek help content urgently
 * - FAQ and support sections are primary targets
 * - Error messages and help text are critical
 */
export const TROUBLESHOOT_HIERARCHY: FocusHierarchy = {
  taskType: "troubleshoot",

  focusAreas: [
    // Primary: Search to find help articles
    { area: "search", probability: 0.90, relevanceBoost: 3.0, isPrimary: true },
    // Primary: Navigation to find help/support section
    { area: "navigation", probability: 0.85, relevanceBoost: 2.5, isPrimary: true },
    // Primary: Content might have error solutions
    { area: "content", probability: 0.80, relevanceBoost: 2.0, isPrimary: true },
    // High: Headings to find relevant sections
    { area: "headings", probability: 0.75, relevanceBoost: 1.8 },
    // Medium: Forms for contact/support tickets
    { area: "forms", probability: 0.60, relevanceBoost: 1.5 },
    // Medium: Footer often has help links
    { area: "footer", probability: 0.55, relevanceBoost: 1.3 },
    // Medium: CTAs might link to support
    { area: "cta", probability: 0.50, relevanceBoost: 1.2 },
    // Lower: Sidebar might have help widget
    { area: "sidebar", probability: 0.40, relevanceBoost: 1.0 },
    // Low: Hero rarely helpful for troubleshooting
    { area: "hero", probability: 0.15, relevanceBoost: 0.4 },
    // Very low: Images rarely help troubleshoot
    { area: "images", probability: 0.10, relevanceBoost: 0.3 },
  ],

  distractionFilters: [
    ...COMMON_DISTRACTIONS,
    ...TASK_SPECIFIC_DISTRACTIONS.troubleshoot,
    // Lower ignore rate for help-related elements
    { pattern: "help", ignoreRate: 0.1, reason: "Help actively sought" },
    { pattern: "support", ignoreRate: 0.1, reason: "Support actively sought" },
    { pattern: "contact", ignoreRate: 0.2, reason: "Contact might help" },
  ],

  scanPattern: "spotted",          // Jump to help-related elements
  navFirstProbability: 0.8,        // Usually need to find help section
  searchUseProbability: 0.7,       // High search usage when troubleshooting
  attentionCapacity: 5,            // Focused, stressed
  focusDecayMs: 5000,              // Impatient when stuck
};

// ============================================================================
// Preset Collection
// ============================================================================

export const FOCUS_HIERARCHY_PRESETS: FocusHierarchyPreset[] = [
  {
    name: "find_information",
    description: "Looking for specific information (e.g., deadlines, requirements, contact info)",
    taskType: "find_information",
    hierarchy: FIND_INFORMATION_HIERARCHY,
  },
  {
    name: "complete_action",
    description: "Trying to complete a specific action (e.g., apply, register, submit)",
    taskType: "complete_action",
    hierarchy: COMPLETE_ACTION_HIERARCHY,
  },
  {
    name: "explore",
    description: "Browsing to learn about a site or organization",
    taskType: "explore",
    hierarchy: EXPLORE_HIERARCHY,
  },
  {
    name: "compare",
    description: "Comparing options, features, or plans",
    taskType: "compare",
    hierarchy: COMPARE_HIERARCHY,
  },
  {
    name: "troubleshoot",
    description: "Trying to fix a problem or get help",
    taskType: "troubleshoot",
    hierarchy: TROUBLESHOOT_HIERARCHY,
  },
];

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get focus hierarchy for a specific task type.
 */
export function getFocusHierarchy(taskType: TaskType): FocusHierarchy {
  const preset = FOCUS_HIERARCHY_PRESETS.find(p => p.taskType === taskType);
  return preset?.hierarchy ?? FIND_INFORMATION_HIERARCHY;
}

/**
 * Infer task type from a goal description.
 * Uses keyword matching to categorize the goal.
 */
export function inferTaskTypeFromGoal(goal: string): TaskType {
  const lowerGoal = goal.toLowerCase();

  // Action keywords - trying to DO something
  const actionKeywords = [
    "apply", "submit", "register", "sign up", "signup", "create account",
    "enroll", "download", "buy", "purchase", "order", "book", "schedule",
    "complete", "fill out", "request", "subscribe", "join",
  ];

  // Information keywords - looking for INFORMATION
  const infoKeywords = [
    "find", "where", "what", "when", "how", "deadline", "requirements",
    "contact", "address", "phone", "email", "hours", "cost", "price",
    "information", "details", "learn about", "discover",
  ];

  // Comparison keywords - COMPARING options
  const compareKeywords = [
    "compare", "vs", "versus", "difference", "better", "best",
    "which", "choose between", "options", "alternatives",
  ];

  // Troubleshooting keywords - FIXING problems
  const troubleshootKeywords = [
    "help", "support", "problem", "issue", "error", "can't", "cannot",
    "won't", "doesn't work", "not working", "fix", "reset", "forgot",
    "trouble", "stuck",
  ];

  // Check in priority order (action > troubleshoot > compare > info > explore)
  if (actionKeywords.some(k => lowerGoal.includes(k))) {
    return "complete_action";
  }

  if (troubleshootKeywords.some(k => lowerGoal.includes(k))) {
    return "troubleshoot";
  }

  if (compareKeywords.some(k => lowerGoal.includes(k))) {
    return "compare";
  }

  if (infoKeywords.some(k => lowerGoal.includes(k))) {
    return "find_information";
  }

  // Default to explore for vague goals
  return "explore";
}

/**
 * Check if an element matches any distraction filter.
 * Returns the ignore probability if matched, 0 otherwise.
 */
export function getDistractionIgnoreRate(
  element: { text?: string; selector?: string; ariaLabel?: string },
  filters: DistractionFilter[]
): number {
  const textToCheck = [
    element.text?.toLowerCase() ?? "",
    element.selector?.toLowerCase() ?? "",
    element.ariaLabel?.toLowerCase() ?? "",
  ].join(" ");

  for (const filter of filters) {
    if (textToCheck.includes(filter.pattern.toLowerCase())) {
      return filter.ignoreRate;
    }
  }

  return 0;
}

/**
 * Calculate priority score for an element based on focus hierarchy.
 * Higher score = more likely to be selected for action.
 */
export function calculateFocusPriority(
  element: {
    area?: FocusAreaType;
    text?: string;
    selector?: string;
    ariaLabel?: string;
    isRelevantToGoal?: boolean;
  },
  hierarchy: FocusHierarchy
): number {
  let priority = 1.0;

  // 1. Apply area-based relevance boost
  if (element.area) {
    const focusArea = hierarchy.focusAreas.find(f => f.area === element.area);
    if (focusArea) {
      priority *= focusArea.relevanceBoost;

      // Extra boost for primary areas
      if (focusArea.isPrimary) {
        priority *= 1.5;
      }
    } else {
      // Unknown area gets low priority
      priority *= 0.3;
    }
  }

  // 2. Apply distraction filtering (reduce priority for distractions)
  const ignoreRate = getDistractionIgnoreRate(element, hierarchy.distractionFilters);
  if (ignoreRate > 0) {
    // Reduce priority based on ignore rate
    // e.g., 0.8 ignore rate -> 0.2 priority multiplier
    priority *= (1 - ignoreRate);
  }

  // 3. Goal relevance boost
  if (element.isRelevantToGoal) {
    priority *= 2.5;
  }

  return priority;
}

/**
 * Apply deterministic filtering to a list of elements based on focus hierarchy.
 * Returns elements that pass the attention filter using threshold-based selection.
 *
 * Previous versions used random filtering, but this created inconsistent results.
 * Now uses deterministic threshold: elements with probability >= 0.5 are included.
 */
export function filterByAttention<T extends { area?: FocusAreaType }>(
  elements: T[],
  hierarchy: FocusHierarchy
): T[] {
  const filtered: T[] = [];

  // Sort elements by their focus area probability (descending)
  const sortedElements = [...elements].sort((a, b) => {
    const aProb = a.area
      ? hierarchy.focusAreas.find(f => f.area === a.area)?.probability ?? 0.2
      : 0.2;
    const bProb = b.area
      ? hierarchy.focusAreas.find(f => f.area === b.area)?.probability ?? 0.2
      : 0.2;
    return bProb - aProb;
  });

  for (const element of sortedElements) {
    // Get probability of focusing on this element's area
    const focusArea = element.area
      ? hierarchy.focusAreas.find(f => f.area === element.area)
      : undefined;

    const focusProbability = focusArea?.probability ?? 0.2;

    // Deterministic filtering: include elements with probability >= 0.5
    // or if they're in primary areas
    if (focusProbability >= 0.5 || focusArea?.isPrimary) {
      filtered.push(element);
    }

    // Respect attention capacity
    if (filtered.length >= hierarchy.attentionCapacity) {
      break;
    }
  }

  return filtered;
}

/**
 * Determine the order to scan page areas based on hierarchy and scan pattern.
 */
export function getScanOrder(hierarchy: FocusHierarchy): FocusAreaType[] {
  const { scanPattern, focusAreas, navFirstProbability: _navFirstProbability } = hierarchy;

  // Start with primary areas sorted by probability
  const primaryAreas = focusAreas
    .filter(f => f.isPrimary)
    .sort((a, b) => b.probability - a.probability)
    .map(f => f.area);

  // Then secondary areas
  const secondaryAreas = focusAreas
    .filter(f => !f.isPrimary)
    .sort((a, b) => b.probability - a.probability)
    .map(f => f.area);

  // Apply scan pattern modifications
  switch (scanPattern) {
    case "nav-first":
      // Navigation always first
      return ["navigation", ...primaryAreas.filter(a => a !== "navigation"), ...secondaryAreas];

    case "f-pattern":
      // Top headings, then content, then navigation
      return ["headings", "content", "navigation", ...secondaryAreas];

    case "z-pattern":
      // Hero, then nav, then content, then CTA
      return ["hero", "navigation", "content", "cta", ...secondaryAreas];

    case "spotted":
      // Jump to high-probability areas (sorted by probability)
      return [...primaryAreas, ...secondaryAreas];

    case "exhaustive":
      // Methodical top-to-bottom
      return ["hero", "navigation", "headings", "content", "sidebar", "forms", "cta", "footer", "images", "search"];

    default:
      return [...primaryAreas, ...secondaryAreas];
  }
}
