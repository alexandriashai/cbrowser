/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */
/**
 * Calculate decision fatigue increment based on decision complexity.
 * More options = more depletion. Based on Baumeister's ego depletion research.
 */
export function calculateFatigueIncrement(optionsConsidered) {
    // Logarithmic: first few options costly, diminishing returns
    return 0.05 * Math.log(optionsConsidered + 1);
}
/**
 * Default Fitts' Law parameters based on empirical research.
 */
export const DEFAULT_FITTS_PARAMS = {
    a: 50, // Base time in ms
    b: 150, // Movement coefficient
    ageModifier: 1.0,
    tremorModifier: 0,
};
/**
 * Calculate movement time using Fitts' Law.
 * @param distance - Distance to target in pixels
 * @param targetWidth - Width of target in pixels
 * @param params - Fitts' Law parameters (optional, uses defaults)
 * @returns Movement time in milliseconds
 */
export function calculateFittsMovementTime(distance, targetWidth, params = {}) {
    const { a, b, ageModifier, tremorModifier } = { ...DEFAULT_FITTS_PARAMS, ...params };
    // Fitts' Law: MT = a + b × log₂(D/W + 1)
    const indexOfDifficulty = Math.log2(distance / Math.max(targetWidth, 1) + 1);
    const baseMT = a + b * indexOfDifficulty;
    // Apply persona modifiers
    return baseMT * ageModifier * (1 + tremorModifier * 0.1);
}
/**
 * Check if cognitive state should switch to System 2.
 * Triggers: high confusion OR repeated failures in System 1.
 */
export function shouldSwitchToSystem2(confusionLevel, mode) {
    return confusionLevel > mode.switchThreshold || mode.system1Errors >= 3;
}
/**
 * Check if cognitive state can return to System 1.
 * Triggers: low confusion AND recent success.
 */
export function canReturnToSystem1(confusionLevel, recentSuccess) {
    return confusionLevel < 0.2 && recentSuccess;
}
// ============================================================================
// GOMS/KLM Timing Constants (v9.10.0) - Validated HCI Research
// ============================================================================
/**
 * Keystroke-Level Model (KLM) timing constants.
 * Empirically derived from Card, Moran & Newell (1983).
 *
 * @see Card, S. K., Moran, T. P., & Newell, A. (1983). The Psychology of Human-Computer Interaction
 * @see https://github.com/Cogulator/Cogulator
 */
export const KLM_OPERATORS = {
    /** Keystroke timing - average typist (ms) */
    K_keystroke: 280,
    /** Expert typist keystroke (ms) */
    K_expert: 120,
    /** Hunt-and-peck typist keystroke (ms) */
    K_novice: 500,
    /** Mouse pointing to target (ms) - replaced by Fitts' Law */
    P_pointing: 1100,
    /** Hand movement between keyboard and mouse (ms) */
    H_homing: 400,
    /** Mental preparation before action (ms) */
    M_mental: 1350,
    /** Mental prep for familiar task (ms) */
    M_familiar: 600,
    /** Button click time (ms) */
    B_button: 100,
    /** System response - variable, depends on application */
    R_system: 0,
};
/**
 * Calculate typing time for a string using KLM constants.
 * @param text - Text to type
 * @param expertise - Typing expertise level (0-1, where 1 = expert)
 * @param includesMentalPrep - Whether to include M operator
 * @returns Typing time in milliseconds
 */
export function calculateTypingTime(text, expertise = 0.5, includesMentalPrep = true) {
    // Interpolate between novice and expert keystroke time
    const keystrokeTime = KLM_OPERATORS.K_novice - (KLM_OPERATORS.K_novice - KLM_OPERATORS.K_expert) * expertise;
    // Calculate total keystroke time
    const keystrokes = text.length * keystrokeTime;
    // Add mental preparation if needed
    const mentalPrep = includesMentalPrep
        ? KLM_OPERATORS.M_familiar + (KLM_OPERATORS.M_mental - KLM_OPERATORS.M_familiar) * (1 - expertise)
        : 0;
    return keystrokes + mentalPrep;
}
/**
 * Calculate effective scan width based on cognitive load.
 * Research: Under high cognitive load, attention tunnels to left 30% of viewport.
 *
 * @param cognitiveLoad - Current cognitive load (0-1)
 * @returns Width multiplier for scan pattern
 */
export function calculateScanWidthMultiplier(cognitiveLoad) {
    if (cognitiveLoad > 0.8) {
        // Severe tunnel vision: only left 20%
        return 0.2;
    }
    else if (cognitiveLoad > 0.7) {
        // Tunnel vision: only left 30%
        return 0.3;
    }
    else if (cognitiveLoad > 0.5) {
        // Narrowed: left 60%
        return 0.6;
    }
    // Normal: full width
    return 1.0;
}
/**
 * Check if an element would be missed due to tunnel vision.
 *
 * @param elementXPosition - Element's X position as percentage (0-1)
 * @param scanWidth - Current effective scan width (0-1)
 * @returns true if element is outside the current scan area
 */
export function isElementInTunnelVision(elementXPosition, scanWidth) {
    return elementXPosition <= scanWidth;
}
/**
 * Loss-framing keywords that increase urgency.
 */
export const LOSS_FRAME_TRIGGERS = [
    "don't miss",
    "limited time",
    "expires",
    "last chance",
    "running out",
    "miss out",
    "before it's gone",
    "only",
    "hurry",
    "ending soon",
    "final",
    "lose",
    "avoid",
];
/**
 * Gain-framing keywords (less urgent).
 */
export const GAIN_FRAME_TRIGGERS = [
    "get",
    "save",
    "earn",
    "free",
    "bonus",
    "win",
    "unlock",
    "discover",
    "join",
    "start",
];
/**
 * Detect prospect frame from element text content.
 *
 * @param text - Element text content
 * @returns ProspectFrame with type, magnitude, and triggers
 */
export function detectProspectFrame(text) {
    const lowerText = text.toLowerCase();
    const lossMatches = LOSS_FRAME_TRIGGERS.filter((t) => lowerText.includes(t));
    const gainMatches = GAIN_FRAME_TRIGGERS.filter((t) => lowerText.includes(t));
    if (lossMatches.length > gainMatches.length) {
        return {
            type: "loss",
            magnitude: Math.min(0.5 + lossMatches.length * 0.15, 1.0),
            triggers: lossMatches,
        };
    }
    else if (gainMatches.length > 0) {
        return {
            type: "gain",
            magnitude: Math.min(0.3 + gainMatches.length * 0.1, 0.8),
            triggers: gainMatches,
        };
    }
    return { type: "neutral", magnitude: 0.5, triggers: [] };
}
/**
 * Calculate click probability modifier based on Prospect Theory.
 * Users are risk-seeking to avoid losses, risk-averse with gains.
 *
 * @param baseRiskTolerance - Persona's base risk tolerance (0-1)
 * @param frame - Detected prospect frame
 * @returns Modified click probability multiplier
 */
export function calculateProspectClickModifier(baseRiskTolerance, frame) {
    switch (frame.type) {
        case "loss":
            // Risk-seeking when avoiding loss: boost click probability
            // Kahneman & Tversky (1979): λ ≈ 2.25 loss aversion coefficient
            // Max effect: 1.0 + 1.25 = 2.25x click probability for high-magnitude loss frames
            return 1.0 + frame.magnitude * 1.25;
        case "gain":
            // Risk-averse with gains: reduce click probability
            return 0.7 + baseRiskTolerance * 0.3;
        default:
            return 1.0;
    }
}
/**
 * Calculate overall saliency score from factors.
 * Higher saliency = more likely to draw attention.
 *
 * @param factors - Individual saliency factors
 * @returns Combined saliency score (0-1)
 */
export function calculateSaliency(factors) {
    // Weighted combination: semantic > position > contrast > size > motion
    const weights = { size: 0.1, contrast: 0.2, position: 0.25, motion: 0.05, semantic: 0.4 };
    return (factors.size * weights.size +
        factors.contrast * weights.contrast +
        factors.position * weights.position +
        factors.motion * weights.motion +
        factors.semantic * weights.semantic);
}
/**
 * Calculate gaze-to-mouse lag based on age (WebGazer.js research).
 * Eye movements precede mouse movements by 200-500ms depending on age.
 *
 * @param ageRange - Age range string (e.g., "18-25", "65+")
 * @returns Gaze-to-mouse lag in milliseconds
 */
export function calculateGazeMouseLag(ageRange) {
    if (!ageRange)
        return 300; // Default
    const ageMatch = ageRange.match(/(\d+)/);
    if (!ageMatch)
        return 300;
    const age = parseInt(ageMatch[1], 10);
    // Young adults: 200ms, elderly: 500ms
    return Math.min(500, Math.max(200, 200 + (age - 20) * 5));
}
/**
 * Calculate peripheral vision reduction based on frustration and confusion.
 * High frustration/confusion = tunnel vision (narrowed attention).
 *
 * @param frustration - Frustration level (0-1)
 * @param confusion - Confusion level (0-1)
 * @returns PeripheralVision with width/height factors
 */
export function calculatePeripheralVision(frustration, confusion) {
    // Arousal is combination of frustration and confusion
    const arousalLevel = Math.max(frustration, confusion);
    // Yerkes-Dodson: moderate arousal (0.3-0.5) is optimal
    // High arousal (>0.7) causes tunnel vision
    let widthFactor = 1.0;
    let heightFactor = 1.0;
    if (arousalLevel > 0.8) {
        // Severe tunnel vision
        widthFactor = 0.3;
        heightFactor = 0.4;
    }
    else if (arousalLevel > 0.6) {
        // Moderate tunnel vision
        widthFactor = 0.5;
        heightFactor = 0.6;
    }
    else if (arousalLevel > 0.4) {
        // Slightly narrowed
        widthFactor = 0.75;
        heightFactor = 0.8;
    }
    return { widthFactor, heightFactor, arousalLevel };
}
/**
 * Keywords that indicate specific UI patterns.
 */
const UI_PATTERN_KEYWORDS = {
    "cookie-banner": ["cookie", "cookies", "privacy", "consent", "gdpr", "accept all"],
    "newsletter-popup": ["newsletter", "subscribe", "email", "updates", "sign up for", "join our"],
    "consent-dialog": ["consent", "agree", "terms", "accept", "continue", "i understand"],
    "promotional-banner": ["sale", "discount", "off", "deal", "limited time", "offer"],
    "social-share": ["share", "facebook", "twitter", "linkedin", "social", "follow"],
    "chat-widget": ["chat", "help", "support", "live chat", "message us"],
    "notification-badge": ["notification", "bell", "alert"],
    "sidebar-ad": ["ad", "sponsored", "advertisement", "partner"],
    "interstitial": ["continue", "skip", "wait", "loading"],
    "discount-popup": ["save", "coupon", "promo", "code", "% off"],
    "other": [],
};
/**
 * Classify UI element text into a pattern type.
 *
 * @param text - Element text content
 * @returns UIPattern classification
 */
export function classifyUIPattern(text) {
    const lowerText = text.toLowerCase();
    for (const [pattern, keywords] of Object.entries(UI_PATTERN_KEYWORDS)) {
        if (pattern === "other")
            continue;
        if (keywords.some((kw) => lowerText.includes(kw))) {
            return pattern;
        }
    }
    return "other";
}
/**
 * Calculate visibility multiplier based on habituation.
 * Low comprehension users develop blindness faster.
 *
 * @param pattern - UI pattern type
 * @param habituation - Current habituation state
 * @param comprehension - User's comprehension level (0-1)
 * @returns Visibility multiplier (0 = invisible, 1 = fully visible)
 */
export function calculateHabituationVisibility(pattern, habituation, comprehension) {
    if (habituation.blindPatterns.includes(pattern)) {
        return 0; // Completely blind to this pattern
    }
    const exposure = habituation.exposureCount[pattern] || 0;
    // Adjust threshold by comprehension (low comprehension = faster blindness)
    const adjustedThreshold = habituation.blindnessThreshold * (0.5 + comprehension * 0.5);
    if (exposure >= adjustedThreshold) {
        return 0.1; // Nearly blind
    }
    // Linear decay toward blindness
    return 1 - (exposure / adjustedThreshold) * 0.9;
}
/**
 * Create initial habituation state.
 *
 * @param blindnessThreshold - Exposures before blindness (default: 3)
 * @returns Initial HabituationState
 */
export function createHabituationState(blindnessThreshold = 3) {
    return {
        exposureCount: {},
        blindnessThreshold,
        blindPatterns: [],
    };
}
/**
 * Update habituation state after seeing a UI pattern.
 *
 * @param habituation - Current habituation state
 * @param pattern - UI pattern seen
 * @returns Updated habituation state
 */
export function updateHabituationState(habituation, pattern) {
    const newExposureCount = { ...habituation.exposureCount };
    newExposureCount[pattern] = (newExposureCount[pattern] || 0) + 1;
    const newBlindPatterns = [...habituation.blindPatterns];
    if (newExposureCount[pattern] >= habituation.blindnessThreshold &&
        !newBlindPatterns.includes(pattern)) {
        newBlindPatterns.push(pattern);
    }
    return {
        ...habituation,
        exposureCount: newExposureCount,
        blindPatterns: newBlindPatterns,
    };
}
/**
 * Handle a challenge based on self-efficacy state.
 * High efficacy users persist longer; low efficacy users seek help or abandon.
 *
 * @param challenge - The challenge event
 * @param state - Current self-efficacy state
 * @returns Challenge response with behavior predictions
 */
export function handleChallenge(challenge, state) {
    // Adjust efficacy based on domain experience
    const domainModifier = state.domainConfidence[challenge.domain] || 0;
    const effectiveEfficacy = Math.min(1, Math.max(0, state.currentEfficacy +
        domainModifier +
        (state.recentSuccesses - state.recentFailures) * 0.05));
    // Determine response based on challenge difficulty and efficacy
    const perceivedDifficulty = challenge.objectiveDifficulty * (1 - effectiveEfficacy * 0.3);
    if (perceivedDifficulty > effectiveEfficacy) {
        // Challenge seems too hard
        return {
            response: effectiveEfficacy < 0.3 ? "abandon" : "seek_help",
            persistenceAttempts: Math.ceil(effectiveEfficacy * 2),
            frustrationRate: (1 - effectiveEfficacy) * 0.4,
            abandonmentRisk: (perceivedDifficulty - effectiveEfficacy) * 0.5,
            helpSeekingDelay: effectiveEfficacy * 10000, // ms before seeking help
            explorationBreadth: effectiveEfficacy * 0.3,
            creativeSolutions: false,
        };
    }
    // Challenge seems manageable
    return {
        response: "attempt_solve",
        persistenceAttempts: 3 + Math.ceil(effectiveEfficacy * 4),
        frustrationRate: (1 - effectiveEfficacy) * 0.2,
        abandonmentRisk: 0.1,
        helpSeekingDelay: effectiveEfficacy * 20000,
        explorationBreadth: effectiveEfficacy * 0.7,
        creativeSolutions: effectiveEfficacy > 0.7,
    };
}
/**
 * Update self-efficacy state based on task outcome.
 * Success builds efficacy; failure erodes it.
 *
 * @param state - Current self-efficacy state
 * @param success - Whether the task was successful
 * @param domain - Domain of the task (optional)
 * @returns Updated self-efficacy state
 */
export function updateSelfEfficacy(state, success, domain) {
    // Success builds efficacy; failure erodes it
    const efficacyChange = success
        ? 0.05 * (1 - state.currentEfficacy) // Diminishing returns for success
        : -0.08 * state.currentEfficacy; // Failures hurt more when starting high
    const newDomainConfidence = { ...state.domainConfidence };
    if (domain) {
        const currentDomainConf = newDomainConfidence[domain] || 0;
        newDomainConfidence[domain] = success
            ? Math.min(0.3, currentDomainConf + 0.05)
            : Math.max(-0.3, currentDomainConf - 0.08);
    }
    return {
        ...state,
        currentEfficacy: Math.min(1, Math.max(0, state.currentEfficacy + efficacyChange)),
        recentSuccesses: success ? state.recentSuccesses + 1 : state.recentSuccesses,
        recentFailures: success ? state.recentFailures : state.recentFailures + 1,
        domainConfidence: newDomainConfidence,
    };
}
/**
 * Create initial self-efficacy state from persona trait.
 *
 * @param baseEfficacy - Base efficacy from persona (0-1)
 * @returns Initial SelfEfficacyState
 */
export function createSelfEfficacyState(baseEfficacy) {
    return {
        baseEfficacy,
        currentEfficacy: baseEfficacy,
        recentSuccesses: 0,
        recentFailures: 0,
        domainConfidence: {},
    };
}
/**
 * Evaluate an option and decide whether to accept or continue searching.
 * Satisficers accept when option meets aspiration level.
 * Maximizers continue until they've seen most options.
 *
 * @param optionValue - Value of the current option (0-1)
 * @param state - Current satisficing state
 * @param totalOptions - Total number of options available
 * @returns Decision about whether to accept
 */
export function evaluateOption(optionValue, state, totalOptions) {
    // Update best seen
    if (!state.bestOptionSeen || optionValue > state.bestOptionSeen.value) {
        state.bestOptionSeen = { value: optionValue, position: state.optionsExamined };
    }
    // Satisficers: accept if meets aspiration level
    if (state.tendency > 0.6) {
        const meetsAspiration = optionValue >= state.aspirationLevel;
        if (meetsAspiration) {
            return {
                decision: "accept",
                confidence: state.tendency * 0.8,
                regretRisk: 0.1,
                continueSearch: false,
            };
        }
        // Adjust aspiration if not finding anything (after seeing 30% of options)
        if (state.optionsExamined > totalOptions * 0.3) {
            state.aspirationLevel *= 0.95; // Lower standards
        }
    }
    // Maximizers: always want to see more
    if (state.tendency < 0.4) {
        const mustSeeMore = state.optionsExamined < totalOptions * 0.7;
        return {
            decision: mustSeeMore ? "continue" : "accept_best",
            confidence: 1 - state.tendency,
            regretRisk: 0.4, // Maximizers always wonder if better existed
            continueSearch: mustSeeMore,
        };
    }
    // Middle ground: probabilistic
    const searchProgress = state.optionsExamined / totalOptions;
    const shouldStop = searchProgress > (1 - state.tendency) * 0.5;
    return {
        decision: shouldStop ? "accept_best" : "continue",
        confidence: 0.5,
        regretRisk: 0.25,
        continueSearch: !shouldStop,
    };
}
/**
 * Create initial satisficing state from persona trait.
 *
 * @param tendency - Satisficing tendency from persona (0-1)
 * @param initialAspiration - Initial aspiration level (default: 0.7)
 * @returns Initial SatisficingState
 */
export function createSatisficingState(tendency, initialAspiration = 0.7) {
    return {
        tendency,
        aspirationLevel: initialAspiration,
        optionsExamined: 0,
        bestOptionSeen: null,
        searchFatigue: 0,
    };
}
/**
 * Update satisficing state after examining an option.
 *
 * @param state - Current satisficing state
 * @returns Updated satisficing state
 */
export function updateSatisficingState(state) {
    return {
        ...state,
        optionsExamined: state.optionsExamined + 1,
        searchFatigue: state.searchFatigue + 0.05 * (1 - state.tendency), // Maximizers fatigue faster
    };
}
/**
 * Evaluate whether to proceed with a trust-requiring action.
 *
 * Research: Fogg (2003) found trust decisions follow threshold model.
 * High-trust users accept with minimal evaluation; low-trust users scrutinize.
 *
 * @param actionRisk - How risky is this action (0-1)? Payment=0.9, newsletter=0.3
 * @param state - Current trust state
 * @returns Decision on whether to proceed
 */
export function evaluateTrustDecision(actionRisk, state) {
    // Calculate environmental trust from detected signals
    const detectedSignals = state.signalsDetected.filter((s) => s.detected);
    const environmentalTrust = detectedSignals.length > 0
        ? detectedSignals.reduce((sum, s) => sum + s.weight, 0) / detectedSignals.length
        : 0.3; // Low default if no signals
    // Apply betrayal penalty - recent betrayals have more impact
    const betrayalPenalty = state.betrayalHistory.reduce((penalty, event) => {
        const recency = Math.max(0, 1 - (Date.now() - event.timestamp) / 60000); // Decay over 1 minute
        return penalty + event.severity * recency * 0.5;
    }, 0);
    // Combine baseline with environment (skeptical users discount signals)
    // Research: Sillence et al. (2007) found 60/40 split between personal and environmental factors
    const effectiveTrust = Math.max(0, state.baselineTrust * 0.6 + environmentalTrust * 0.4 - betrayalPenalty);
    // Determine if action proceeds based on risk vs trust threshold
    // Higher risk actions require higher trust
    const threshold = 0.3 + actionRisk * 0.5; // Newsletter (0.3): 0.45 threshold; Payment (0.9): 0.75 threshold
    const proceed = effectiveTrust >= threshold;
    // Evaluation time: skeptical users take longer (inverse relationship)
    // Research: Sillence et al. found 3-10x longer evaluation for low-trust users
    const baseEvaluationTime = 500; // ms
    const trustFactor = Math.max(0.1, state.baselineTrust);
    const evaluationTime = Math.round(baseEvaluationTime / trustFactor);
    return {
        proceed,
        confidence: Math.abs(effectiveTrust - threshold),
        evaluationTime,
        reason: proceed
            ? effectiveTrust > 0.7
                ? "High trust - proceeding without hesitation"
                : "Trust signals adequate for this action"
            : effectiveTrust < 0.3
                ? "Insufficient trust - refusing action"
                : "Risk too high for current trust level",
    };
}
/**
 * Update trust state after a betrayal event.
 */
export function recordTrustBetrayal(state, event) {
    const betrayalEvent = {
        ...event,
        timestamp: Date.now(),
    };
    // Research: Trust destroyed faster than built (asymmetric)
    const trustReduction = event.severity * 0.3 * (1 + (1 - state.baselineTrust));
    return {
        ...state,
        currentTrust: Math.max(0, state.currentTrust - trustReduction),
        betrayalHistory: [...state.betrayalHistory, betrayalEvent],
    };
}
/**
 * Create initial trust state from persona trait.
 */
export function createTrustState(baselineTrust) {
    // Default trust signals with research-derived weights
    // Fogg (2003): Design quality and security indicators are strongest
    const defaultSignals = [
        { type: "https", weight: 0.7, detected: false },
        { type: "security_badge", weight: 0.5, detected: false },
        { type: "brand_recognition", weight: 0.8, detected: false },
        { type: "professional_design", weight: 0.6, detected: false },
        { type: "reviews_visible", weight: 0.4, detected: false },
        { type: "contact_info", weight: 0.5, detected: false },
        { type: "privacy_policy", weight: 0.3, detected: false },
        { type: "social_proof", weight: 0.4, detected: false },
    ];
    return {
        baselineTrust,
        currentTrust: baselineTrust,
        signalsDetected: defaultSignals,
        betrayalHistory: [],
    };
}
/**
 * Handle an interruption and determine resumption outcome.
 *
 * Research: Mark (2005) - External interruptions more disruptive than self-initiated.
 * Monk (2008) - Interruption duration affects recovery non-linearly.
 *
 * @param interruption - The interruption event
 * @param state - Current interrupt recovery state
 * @returns Result of the resumption attempt
 */
export function handleInterruption(interruption, state) {
    if (!state.currentTaskContext) {
        return {
            successful: true,
            resumptionTime: 0,
            action: "resume_exact",
            progressLost: 0,
            frustrationAdded: 0,
        };
    }
    const ctx = state.currentTaskContext;
    // Base resumption difficulty factors
    // Research: External > System > Self-initiated in disruption severity
    const typeMultiplier = {
        external: 1.5,
        system: 1.2,
        self_initiated: 0.7,
        timeout: 2.0, // Session timeouts are most disruptive
    }[interruption.type];
    // Duration effect (non-linear - short interruptions much easier to recover from)
    // Research: Monk (2008) found exponential decay in memory after ~15 seconds
    const durationEffect = Math.min(1, Math.log(1 + interruption.duration / 15000) / 3 // 15s threshold, log decay
    );
    // Step complexity - later steps harder to recover (more context accumulated)
    const stepComplexity = ctx.step / ctx.totalSteps;
    // Calculate base recovery difficulty
    const difficulty = typeMultiplier * durationEffect * (0.5 + stepComplexity * 0.5);
    // Apply persona's recovery ability (high ability reduces difficulty)
    const effectiveDifficulty = difficulty * (1 - state.recoveryAbility * 0.7);
    // Environmental cues help recovery
    const cueBonus = Math.min(0.3, state.environmentalCues.length * 0.1);
    const systemPreservationBonus = interruption.systemPreserved ? 0.3 : 0;
    // Final recovery probability
    const recoveryProbability = Math.max(0.1, Math.min(0.95, 1 - effectiveDifficulty + cueBonus + systemPreservationBonus));
    // Determine outcome based on recovery probability
    const roll = Math.random();
    let action;
    let progressLost;
    if (roll < recoveryProbability * 0.6) {
        action = "resume_exact";
        progressLost = 0;
    }
    else if (roll < recoveryProbability) {
        action = "resume_approximate";
        progressLost = 0.1 + Math.random() * 0.2; // Lose 10-30% of current step
    }
    else if (roll < recoveryProbability + (1 - recoveryProbability) * 0.5) {
        action = "restart";
        progressLost = ctx.step / ctx.totalSteps; // Lose all progress
    }
    else {
        action = "abandon";
        progressLost = 1;
    }
    // Calculate resumption time (Mark's 23-minute average is for complex office tasks)
    // Web tasks: scale down to 5-60 seconds for typical recovery
    // Research: Iqbal & Horvitz (2007) - Web task recovery typically under 2 minutes
    const baseResumptionMs = 5000; // 5 seconds base
    const resumptionTime = Math.round(baseResumptionMs * (1 + effectiveDifficulty * 10) * (1 - state.recoveryAbility * 0.5));
    // Frustration from interruption
    // Research: Interruptions increase negative affect, especially when progress is lost
    const frustrationAdded = progressLost * 0.3 + effectiveDifficulty * 0.1;
    return {
        successful: action !== "abandon",
        resumptionTime,
        action,
        progressLost,
        frustrationAdded: Math.min(0.5, frustrationAdded),
    };
}
/**
 * Create initial interrupt recovery state from persona trait.
 */
export function createInterruptRecoveryState(recoveryAbility) {
    return {
        recoveryAbility,
        currentTaskContext: null,
        interruptionLog: [],
        environmentalCues: [],
    };
}
/**
 * Set current task context for tracking.
 */
export function setTaskContext(state, context) {
    return {
        ...state,
        currentTaskContext: context,
    };
}
/**
 * Update environmental cues that help with recovery.
 */
export function updateEnvironmentalCues(state, cues) {
    return {
        ...state,
        environmentalCues: cues,
    };
}
// ============================================================================
// Error Codes (v10.4.4)
// ============================================================================
/**
 * Standardized error codes for programmatic error handling.
 * Use with CBrowserError class for typed error handling.
 */
export var CBrowserErrorCode;
(function (CBrowserErrorCode) {
    // Navigation errors (1xx)
    CBrowserErrorCode["NAVIGATION_FAILED"] = "E101";
    CBrowserErrorCode["NAVIGATION_TIMEOUT"] = "E102";
    CBrowserErrorCode["PAGE_NOT_FOUND"] = "E103";
    // Element errors (2xx)
    CBrowserErrorCode["ELEMENT_NOT_FOUND"] = "E201";
    CBrowserErrorCode["ELEMENT_NOT_VISIBLE"] = "E202";
    CBrowserErrorCode["ELEMENT_NOT_CLICKABLE"] = "E203";
    CBrowserErrorCode["ELEMENT_INTERCEPTED"] = "E204";
    // Session errors (3xx)
    CBrowserErrorCode["SESSION_NOT_FOUND"] = "E301";
    CBrowserErrorCode["SESSION_CORRUPTED"] = "E302";
    CBrowserErrorCode["SESSION_EXPIRED"] = "E303";
    // Authentication errors (4xx)
    CBrowserErrorCode["AUTH_REQUIRED"] = "E401";
    CBrowserErrorCode["AUTH_FAILED"] = "E402";
    CBrowserErrorCode["API_KEY_MISSING"] = "E403";
    CBrowserErrorCode["API_KEY_INVALID"] = "E404";
    // Configuration errors (5xx)
    CBrowserErrorCode["CONFIG_INVALID"] = "E501";
    CBrowserErrorCode["CONFIG_NOT_FOUND"] = "E502";
    CBrowserErrorCode["BROWSER_NOT_INSTALLED"] = "E503";
    // File system errors (6xx)
    CBrowserErrorCode["FILE_NOT_FOUND"] = "E601";
    CBrowserErrorCode["FILE_PERMISSION_DENIED"] = "E602";
    CBrowserErrorCode["PATH_TRAVERSAL_BLOCKED"] = "E603";
    // Test errors (7xx)
    CBrowserErrorCode["TEST_FAILED"] = "E701";
    CBrowserErrorCode["ASSERTION_FAILED"] = "E702";
    CBrowserErrorCode["TEST_TIMEOUT"] = "E703";
    // Browser lifecycle errors (8xx) - v11.8.0
    CBrowserErrorCode["BROWSER_CRASHED"] = "E801";
    CBrowserErrorCode["BROWSER_DISCONNECTED"] = "E802";
    CBrowserErrorCode["BROWSER_UNRESPONSIVE"] = "E803";
    CBrowserErrorCode["BROWSER_RECOVERY_FAILED"] = "E804";
    // Unknown
    CBrowserErrorCode["UNKNOWN"] = "E999";
})(CBrowserErrorCode || (CBrowserErrorCode = {}));
/**
 * Remediation guidance for each error code.
 * Maps error codes to human-friendly fix instructions and documentation links.
 */
export const ERROR_REMEDIATION = {
    [CBrowserErrorCode.NAVIGATION_FAILED]: {
        howToFix: "Check that the URL is correct and the site is reachable. Try opening it in a regular browser first.",
        docUrl: "https://cbrowser.ai/docs/errors#E101",
    },
    [CBrowserErrorCode.NAVIGATION_TIMEOUT]: {
        howToFix: "The page took too long to load. Increase timeout with --timeout <ms> or set CBROWSER_TIMEOUT env var.",
        docUrl: "https://cbrowser.ai/docs/errors#E102",
    },
    [CBrowserErrorCode.PAGE_NOT_FOUND]: {
        howToFix: "The URL returned a 404. Verify the path is correct and the page exists.",
        docUrl: "https://cbrowser.ai/docs/errors#E103",
    },
    [CBrowserErrorCode.ELEMENT_NOT_FOUND]: {
        howToFix: "No element matched that selector. Try using smart-click with a text description instead of a CSS selector.",
        docUrl: "https://cbrowser.ai/docs/errors#E201",
    },
    [CBrowserErrorCode.ELEMENT_NOT_VISIBLE]: {
        howToFix: "The element exists but is hidden. It may be behind a modal, scrolled off-screen, or have display:none.",
        docUrl: "https://cbrowser.ai/docs/errors#E202",
    },
    [CBrowserErrorCode.ELEMENT_NOT_CLICKABLE]: {
        howToFix: "The element is visible but not interactive. It may be disabled, covered by another element, or not a clickable type.",
        docUrl: "https://cbrowser.ai/docs/errors#E203",
    },
    [CBrowserErrorCode.ELEMENT_INTERCEPTED]: {
        howToFix: "Another element is blocking the click (e.g., a cookie banner or modal overlay). Try dismissing it first.",
        docUrl: "https://cbrowser.ai/docs/errors#E204",
    },
    [CBrowserErrorCode.SESSION_NOT_FOUND]: {
        howToFix: "No active session found. Start a new session with 'cbrowser navigate <url>' first.",
        docUrl: "https://cbrowser.ai/docs/errors#E301",
    },
    [CBrowserErrorCode.SESSION_CORRUPTED]: {
        howToFix: "Session data is corrupted. Delete ~/.cbrowser/sessions/ and start fresh.",
        docUrl: "https://cbrowser.ai/docs/errors#E302",
    },
    [CBrowserErrorCode.SESSION_EXPIRED]: {
        howToFix: "The session has expired. Start a new one with 'cbrowser navigate <url>'.",
        docUrl: "https://cbrowser.ai/docs/errors#E303",
    },
    [CBrowserErrorCode.AUTH_REQUIRED]: {
        howToFix: "This operation requires authentication. Run 'cbrowser config set-api-key <key>' to set your API key.",
        docUrl: "https://cbrowser.ai/docs/errors#E401",
    },
    [CBrowserErrorCode.AUTH_FAILED]: {
        howToFix: "Authentication failed. Verify your API key is correct and hasn't expired.",
        docUrl: "https://cbrowser.ai/docs/errors#E402",
    },
    [CBrowserErrorCode.API_KEY_MISSING]: {
        howToFix: "No API key configured. Run 'cbrowser config set-api-key <key>' with your Anthropic API key (starts with sk-ant-).",
        docUrl: "https://cbrowser.ai/docs/errors#E403",
    },
    [CBrowserErrorCode.API_KEY_INVALID]: {
        howToFix: "The API key format is invalid. Anthropic keys start with 'sk-ant-'. Run 'cbrowser config set-api-key <key>' with a valid key.",
        docUrl: "https://cbrowser.ai/docs/errors#E404",
    },
    [CBrowserErrorCode.CONFIG_INVALID]: {
        howToFix: "Configuration file has invalid syntax. Check .cbrowserrc.json for JSON errors. Run 'cbrowser doctor' to diagnose.",
        docUrl: "https://cbrowser.ai/docs/errors#E501",
    },
    [CBrowserErrorCode.CONFIG_NOT_FOUND]: {
        howToFix: "Configuration file not found. This is usually fine — CBrowser uses sensible defaults. Create .cbrowserrc.json if you need custom config.",
        docUrl: "https://cbrowser.ai/docs/errors#E502",
    },
    [CBrowserErrorCode.BROWSER_NOT_INSTALLED]: {
        howToFix: "Chromium is not installed. Run 'npx playwright install chromium' to install it (~150MB download).",
        docUrl: "https://cbrowser.ai/docs/errors#E503",
    },
    [CBrowserErrorCode.FILE_NOT_FOUND]: {
        howToFix: "The specified file does not exist. Check the path and try again.",
        docUrl: "https://cbrowser.ai/docs/errors#E601",
    },
    [CBrowserErrorCode.FILE_PERMISSION_DENIED]: {
        howToFix: process.platform === "win32"
            ? "Permission denied. Try running your terminal as Administrator, or check file permissions in Properties."
            : "Permission denied. Check file ownership with 'ls -la' and fix with 'chmod' or 'chown'. On Linux: sudo chown $USER:$USER <path>",
        docUrl: "https://cbrowser.ai/docs/errors#E602",
    },
    [CBrowserErrorCode.PATH_TRAVERSAL_BLOCKED]: {
        howToFix: "Path contains directory traversal (../) which is blocked for security. Use absolute paths or paths within the project directory.",
        docUrl: "https://cbrowser.ai/docs/errors#E603",
    },
    [CBrowserErrorCode.TEST_FAILED]: {
        howToFix: "One or more test assertions failed. Check the test output for details on which assertions didn't match.",
        docUrl: "https://cbrowser.ai/docs/errors#E701",
    },
    [CBrowserErrorCode.ASSERTION_FAILED]: {
        howToFix: "An assertion did not match the expected value. Review the expected vs actual values in the error details.",
        docUrl: "https://cbrowser.ai/docs/errors#E702",
    },
    [CBrowserErrorCode.TEST_TIMEOUT]: {
        howToFix: "Test exceeded the time limit. Increase timeout with --timeout <ms> or check if the page is loading correctly.",
        docUrl: "https://cbrowser.ai/docs/errors#E703",
    },
    [CBrowserErrorCode.BROWSER_CRASHED]: {
        howToFix: "The browser process crashed. This can happen with memory-intensive pages. Try with --headless or reduce concurrent operations.",
        docUrl: "https://cbrowser.ai/docs/errors#E801",
    },
    [CBrowserErrorCode.BROWSER_DISCONNECTED]: {
        howToFix: "Lost connection to the browser. The browser may have been closed externally. CBrowser will attempt auto-recovery.",
        docUrl: "https://cbrowser.ai/docs/errors#E802",
    },
    [CBrowserErrorCode.BROWSER_UNRESPONSIVE]: {
        howToFix: "The browser stopped responding. A page may be consuming too many resources. Try navigating to a simpler page first.",
        docUrl: "https://cbrowser.ai/docs/errors#E803",
    },
    [CBrowserErrorCode.BROWSER_RECOVERY_FAILED]: {
        howToFix: "Automatic recovery failed. Try restarting CBrowser. If persistent, run 'cbrowser doctor' to check your environment.",
        docUrl: "https://cbrowser.ai/docs/errors#E804",
    },
    [CBrowserErrorCode.UNKNOWN]: {
        howToFix: "An unexpected error occurred. Run 'cbrowser doctor' to check your environment, or report this at https://github.com/wyldfyre-ai/cbrowser/issues",
        docUrl: "https://cbrowser.ai/docs/errors#E999",
    },
};
/**
 * Structured error with code for programmatic handling.
 * Includes remediation guidance (howToFix) and documentation links (docUrl).
 */
export class CBrowserError extends Error {
    code;
    details;
    howToFix;
    docUrl;
    constructor(code, message, details) {
        super(message);
        this.name = "CBrowserError";
        this.code = code;
        this.details = details;
        const remediation = ERROR_REMEDIATION[code] || ERROR_REMEDIATION[CBrowserErrorCode.UNKNOWN];
        this.howToFix = details?.howToFix || remediation.howToFix;
        this.docUrl = details?.docUrl || remediation.docUrl;
    }
}
export const DEVICE_PRESETS = {
    "iphone-15": {
        name: "iPhone 15",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
    },
    "iphone-15-pro-max": {
        name: "iPhone 15 Pro Max",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        viewport: { width: 430, height: 932 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
    },
    "pixel-8": {
        name: "Pixel 8",
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        viewport: { width: 412, height: 915 },
        deviceScaleFactor: 2.625,
        isMobile: true,
        hasTouch: true,
    },
    "pixel-8-pro": {
        name: "Pixel 8 Pro",
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        viewport: { width: 448, height: 998 },
        deviceScaleFactor: 2.625,
        isMobile: true,
        hasTouch: true,
    },
    "samsung-galaxy-s24": {
        name: "Samsung Galaxy S24",
        userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        viewport: { width: 360, height: 780 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
    },
    "ipad-pro-12": {
        name: "iPad Pro 12.9",
        userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        viewport: { width: 1024, height: 1366 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
    },
    "ipad-air": {
        name: "iPad Air",
        userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        viewport: { width: 820, height: 1180 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
    },
    "desktop-1080p": {
        name: "Desktop 1080p",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
    },
    "desktop-1440p": {
        name: "Desktop 1440p",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 2560, height: 1440 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
    },
    // Generic device aliases
    "mobile": {
        name: "Mobile (iPhone 15)",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
    },
    "tablet": {
        name: "Tablet (iPad Pro 11)",
        userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        viewport: { width: 834, height: 1194 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
    },
    "desktop": {
        name: "Desktop (1920x1080)",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
    },
};
export const LOCATION_PRESETS = {
    "new-york": { latitude: 40.7128, longitude: -74.006, accuracy: 100 },
    "london": { latitude: 51.5074, longitude: -0.1278, accuracy: 100 },
    "tokyo": { latitude: 35.6762, longitude: 139.6503, accuracy: 100 },
    "paris": { latitude: 48.8566, longitude: 2.3522, accuracy: 100 },
    "sydney": { latitude: -33.8688, longitude: 151.2093, accuracy: 100 },
    "berlin": { latitude: 52.52, longitude: 13.405, accuracy: 100 },
    "san-francisco": { latitude: 37.7749, longitude: -122.4194, accuracy: 100 },
    "singapore": { latitude: 1.3521, longitude: 103.8198, accuracy: 100 },
    "dubai": { latitude: 25.2048, longitude: 55.2708, accuracy: 100 },
    "mumbai": { latitude: 19.076, longitude: 72.8777, accuracy: 100 },
};
/** Built-in viewport presets */
export const VIEWPORT_PRESETS = [
    // Mobile devices
    { name: "mobile-sm", width: 320, height: 568, deviceType: "mobile", deviceName: "iPhone SE", hasTouch: true, isMobile: true },
    { name: "mobile", width: 375, height: 667, deviceType: "mobile", deviceName: "iPhone 8", hasTouch: true, isMobile: true },
    { name: "mobile-lg", width: 414, height: 896, deviceType: "mobile", deviceName: "iPhone 11 Pro Max", hasTouch: true, isMobile: true },
    { name: "mobile-xl", width: 428, height: 926, deviceType: "mobile", deviceName: "iPhone 14 Pro Max", hasTouch: true, isMobile: true },
    // Tablet devices
    { name: "tablet", width: 768, height: 1024, deviceType: "tablet", deviceName: "iPad", hasTouch: true, isMobile: true },
    { name: "tablet-lg", width: 1024, height: 1366, deviceType: "tablet", deviceName: "iPad Pro 12.9", hasTouch: true, isMobile: true },
    // Desktop sizes
    { name: "desktop-sm", width: 1280, height: 800, deviceType: "desktop", deviceName: "Laptop" },
    { name: "desktop", width: 1440, height: 900, deviceType: "desktop", deviceName: "Desktop" },
    { name: "desktop-lg", width: 1920, height: 1080, deviceType: "desktop", deviceName: "Full HD" },
    { name: "desktop-xl", width: 2560, height: 1440, deviceType: "desktop", deviceName: "QHD" },
];
/**
 * Actions that are NEVER allowed with stealth mode (Black Zone)
 */
export const STEALTH_PROHIBITED_ACTIONS = [
    "bypass_captcha",
    "inject_cookies",
    "spoof_identity",
    "mass_account_creation",
    "credential_stuffing",
    "rate_limit_bypass",
];
/**
 * Domain patterns that are NEVER allowed with stealth mode
 */
export const STEALTH_PROHIBITED_DOMAINS = [
    "*.gov",
    "*.mil",
    "*.edu",
];
/** Tier names for the WebMCP evaluation framework */
export const WEBMCP_TIERS = {
    1: { name: "Server Implementation", weight: 0.25 },
    2: { name: "Tool Discoverability", weight: 0.20 },
    3: { name: "Instrumentation", weight: 0.15 },
    4: { name: "Consistency", weight: 0.15 },
    5: { name: "Agent Optimizations", weight: 0.15 },
    6: { name: "Documentation", weight: 0.10 },
};
//# sourceMappingURL=types.js.map