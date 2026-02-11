/**
 * CBrowser - Cognitive Browser Automation
 * 
 * Copyright (c) 2026 WF Media (Alexandria Eden)
 * Email: alexandria.shai.eden@gmail.com
 * Website: https://cbrowser.ai/
 * 
 * This source code is licensed under the Business Source License 1.1
 * found in the LICENSE file in the root directory of this source tree.
 * 
 * Non-production use is permitted. Production use requires a commercial license.
 * See LICENSE for full terms.
 */


/**
 * Accessibility Empathy Audit Module
 *
 * Simulate how people with disabilities EXPERIENCE a site — motor impairments,
 * cognitive differences, sensory limitations — not just WCAG compliance checking.
 *
 * METHODOLOGY DISCLAIMER:
 *
 * Empathy scores are HEURISTIC estimates based on barrier detection and
 * persona simulation, not actual user testing with disabled individuals.
 *
 * Research-backed thresholds:
 * - Touch targets: 44x44px minimum (WCAG 2.5.5 AAA, 2.5.8 AA)
 * - Contrast ratios: 4.5:1 normal text, 3:1 large text (WCAG 1.4.3)
 * - Form complexity: 7-8 fields optimal before cognitive overload (Baymard)
 * - Screen reader success: ~55.6% task completion rate (WebAIM 2024)
 *
 * Heuristic components (interpret as directional, not precise):
 * - Barrier detection: Identifies patterns known to cause difficulties
 * - Friction points: Simulated based on persona traits, not actual user data
 * - Empathy score: Composite for comparison, letter grades recommended
 *
 * For actual accessibility validation, combine with:
 * - Automated WCAG checkers (axe, WAVE)
 * - Manual testing with assistive technologies
 * - User testing with people who have disabilities
 */

import { chromium, type Browser, type Page } from "playwright";
import type {
  EmpathyAuditResult,
  EmpathyAuditOptions,
  AccessibilityEmpathyResult,
  AccessibilityBarrier,
  AccessibilityBarrierType,
  AccessibilityBarrierSeverity,
  AccessibilityFrictionPoint,
  RemediationItem,
  AccessibilityPersona,
  AgentReadyEffort,
} from "../types.js";
import { getAccessibilityPersona } from "../personas.js";
import {
  runCognitiveJourney,
  isApiKeyConfigured,
} from "../cognitive/index.js";
import {
  getEmotionVisualizationStyles,
  generateEmotionVisualizationSection,
} from "../utils.js";

// ============================================================================
// WCAG Mapping
// ============================================================================

const WCAG_CRITERIA: Record<string, { level: "A" | "AA" | "AAA"; description: string }> = {
  "1.1.1": { level: "A", description: "Non-text Content" },
  "1.3.1": { level: "A", description: "Info and Relationships" },
  "1.4.1": { level: "A", description: "Use of Color" },
  "1.4.3": { level: "AA", description: "Contrast (Minimum)" },
  "1.4.4": { level: "AA", description: "Resize Text" },
  "1.4.6": { level: "AAA", description: "Contrast (Enhanced)" },
  "1.4.10": { level: "AA", description: "Reflow" },
  "2.1.1": { level: "A", description: "Keyboard" },
  "2.1.2": { level: "A", description: "No Keyboard Trap" },
  "2.2.1": { level: "A", description: "Timing Adjustable" },
  "2.2.2": { level: "A", description: "Pause, Stop, Hide" },
  "2.3.1": { level: "A", description: "Three Flashes or Below" },
  "2.4.1": { level: "A", description: "Bypass Blocks" },
  "2.4.3": { level: "A", description: "Focus Order" },
  "2.4.4": { level: "A", description: "Link Purpose" },
  "2.4.6": { level: "AA", description: "Headings and Labels" },
  "2.4.7": { level: "AA", description: "Focus Visible" },
  "2.5.5": { level: "AAA", description: "Target Size" },
  "2.5.8": { level: "AA", description: "Target Size (Minimum)" },
  "3.1.1": { level: "A", description: "Language of Page" },
  "3.2.1": { level: "A", description: "On Focus" },
  "3.2.2": { level: "A", description: "On Input" },
  "3.3.1": { level: "A", description: "Error Identification" },
  "3.3.2": { level: "A", description: "Labels or Instructions" },
  "4.1.1": { level: "A", description: "Parsing" },
  "4.1.2": { level: "A", description: "Name, Role, Value" },
};

function _getWcagCriteriaForBarrier(barrierType: AccessibilityBarrierType): string[] {
  switch (barrierType) {
    case "motor_precision":
      return ["2.5.5", "2.5.8"];
    case "visual_clarity":
      return ["1.4.3", "1.4.6", "1.4.4"];
    case "cognitive_load":
      return ["2.4.6", "3.3.2"];
    case "temporal":
      return ["2.2.1", "2.2.2"];
    case "sensory":
      return ["1.1.1", "1.4.1"];
    case "contrast":
      return ["1.4.3", "1.4.6"];
    case "touch_target":
      return ["2.5.5", "2.5.8"];
    case "timing":
      return ["2.2.1", "2.2.2"];
    default:
      return [];
  }
}

// ============================================================================
// Barrier Detection Functions
// ============================================================================

interface BarrierContext {
  page: Page;
  persona: AccessibilityPersona;
  barriers: AccessibilityBarrier[];
  frictionPoints: AccessibilityFrictionPoint[];
  wcagViolations: Set<string>;
  stepCount: number;
}

/**
 * Detect small touch targets that are hard for motor-impaired users
 * v10.10.0: Always detect touch target issues regardless of persona
 * (issues exist on the page whether or not this persona would encounter them)
 */
async function detectSmallTouchTargets(ctx: BarrierContext): Promise<void> {
  const { page, persona, barriers } = ctx;

  // v10.10.0: Removed trait-based skipping - always detect issues
  // The severity is still adjusted based on persona traits
  const _motorControl = persona.accessibilityTraits.motorControl ?? 0.5;

  const smallTargets = await page.$$eval(
    'button, a, input[type="checkbox"], input[type="radio"], [role="button"], [onclick]',
    (elements) => elements.map(el => {
      const rect = el.getBoundingClientRect();
      return {
        selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
        width: rect.width,
        height: rect.height,
        text: el.textContent?.trim().slice(0, 30) || '',
        area: rect.width * rect.height,
      };
    }).filter(el => el.area > 0 && (el.width < 44 || el.height < 44))
  );

  for (const target of smallTargets.slice(0, 10)) {
    const severity: AccessibilityBarrierSeverity =
      target.width < 24 || target.height < 24 ? "critical" :
      target.width < 32 || target.height < 32 ? "major" : "minor";

    barriers.push({
      type: "touch_target",
      element: target.selector,
      description: `Touch target too small (${Math.round(target.width)}x${Math.round(target.height)}px) - minimum 44x44px recommended`,
      affectedPersonas: ["motor-impairment-tremor", "elderly-low-vision"],
      wcagCriteria: ["2.5.5", "2.5.8"],
      severity,
      remediation: `Increase clickable area to at least 44x44 pixels, or add padding/margin to increase touch target`,
    });
    ctx.wcagViolations.add("2.5.8");
  }
}

/**
 * Detect low contrast elements that are hard for low-vision users
 * v10.10.0: Always detect contrast issues regardless of persona
 * (issues exist on the page whether or not this persona would encounter them)
 */
async function detectLowContrast(ctx: BarrierContext): Promise<void> {
  const { page, persona, barriers } = ctx;

  // v10.10.0: Removed trait-based skipping - always detect issues
  // The severity is still adjusted based on persona traits
  const contrastSensitivity = persona.accessibilityTraits.contrastSensitivity || 1;

  // Check text elements for contrast (simplified check - real check needs computed colors)
  const lowContrastElements = await page.$$eval(
    'p, span, h1, h2, h3, h4, h5, h6, a, button, label',
    (elements) => {
      const results: Array<{
        selector: string;
        text: string;
        fontSize: string;
        color: string;
        bgColor: string;
      }> = [];

      for (const el of elements.slice(0, 100)) {
        const styles = window.getComputedStyle(el);
        const color = styles.color;
        const bgColor = styles.backgroundColor;

        // Simplified: flag light gray text as potential issue
        if (color.includes('rgb')) {
          const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
          if (match) {
            const [, r, g, b] = match.map(Number);
            // Light gray text (common contrast issue)
            if (r > 150 && g > 150 && b > 150 && r < 200 && g < 200 && b < 200) {
              results.push({
                selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
                text: el.textContent?.trim().slice(0, 30) || '',
                fontSize: styles.fontSize,
                color,
                bgColor,
              });
            }
          }
        }
      }

      return results;
    }
  );

  for (const el of lowContrastElements.slice(0, 5)) {
    barriers.push({
      type: "contrast",
      element: el.selector,
      description: `Low contrast text may be difficult to read (color: ${el.color})`,
      affectedPersonas: ["low-vision-magnified", "elderly-low-vision"],
      wcagCriteria: ["1.4.3", "1.4.6"],
      severity: contrastSensitivity > 2 ? "major" : "minor",
      remediation: "Increase text contrast to at least 4.5:1 for normal text, 3:1 for large text",
    });
    ctx.wcagViolations.add("1.4.3");
  }
}

/**
 * Detect cognitive load issues
 * v10.10.0: Always detect cognitive load issues regardless of persona
 * (issues exist on the page whether or not this persona would encounter them)
 */
async function detectCognitiveLoad(ctx: BarrierContext): Promise<void> {
  const { page, persona: _persona, barriers } = ctx;

  // v10.10.0: Removed trait-based skipping - always detect issues

  const cognitiveIssues = await page.evaluate(() => {
    const issues: Array<{ type: string; description: string; count?: number }> = [];

    // Check for long forms
    const forms = Array.from(document.querySelectorAll('form'));
    for (const form of forms) {
      const inputs = form.querySelectorAll('input:not([type="hidden"]), textarea, select');
      if (inputs.length > 7) {
        issues.push({
          type: "long-form",
          description: `Form with ${inputs.length} fields may overwhelm users with attention difficulties`,
          count: inputs.length,
        });
      }
    }

    // Check for text walls
    const paragraphs = Array.from(document.querySelectorAll('p'));
    for (const p of paragraphs) {
      if (p.textContent && p.textContent.length > 500) {
        issues.push({
          type: "text-wall",
          description: "Long paragraph without breaks may be difficult to process",
        });
        break; // Only flag once
      }
    }

    // Check for animations/movement
    const animations = document.querySelectorAll('[class*="animate"], [class*="slider"], [class*="carousel"]');
    if (animations.length > 0) {
      issues.push({
        type: "animation",
        description: "Animated content may distract users with attention difficulties",
        count: animations.length,
      });
    }

    // Check for complex navigation
    const navItems = document.querySelectorAll('nav a, header a, [role="navigation"] a');
    if (navItems.length > 10) {
      issues.push({
        type: "complex-nav",
        description: `Navigation with ${navItems.length} items may be overwhelming`,
        count: navItems.length,
      });
    }

    return issues;
  });

  for (const issue of cognitiveIssues) {
    barriers.push({
      type: "cognitive_load",
      element: issue.type,
      description: issue.description,
      affectedPersonas: ["cognitive-adhd", "dyslexic-user"],
      wcagCriteria: ["2.4.6", "3.3.2"],
      severity: issue.type === "long-form" ? "major" : "minor",
      remediation: issue.type === "long-form"
        ? "Break form into multiple steps or sections"
        : issue.type === "text-wall"
          ? "Break text into smaller paragraphs with headings"
          : issue.type === "animation"
            ? "Provide controls to pause/stop animations, or use prefers-reduced-motion"
            : "Simplify navigation structure",
    });
    ctx.wcagViolations.add("3.3.2");
  }
}

/**
 * Detect timing-based barriers
 */
async function detectTimingIssues(ctx: BarrierContext): Promise<void> {
  const { page, persona: _persona, barriers } = ctx;

  // Check for elements that might have timing constraints
  const timingElements = await page.$$eval(
    '[data-timeout], [class*="countdown"], [class*="timer"], [class*="auto-"], [class*="session"]',
    (elements) => elements.map(el => ({
      selector: el.tagName.toLowerCase() + (el.className ? `.${(el as HTMLElement).className.split(' ')[0]}` : ''),
      text: el.textContent?.trim().slice(0, 50) || '',
    }))
  );

  if (timingElements.length > 0) {
    for (const el of timingElements) {
      barriers.push({
        type: "timing",
        element: el.selector,
        description: `Time-limited content detected - may not allow enough time for users who need longer`,
        affectedPersonas: ["motor-impairment-tremor", "low-vision-magnified", "cognitive-adhd", "dyslexic-user", "elderly-low-vision"],
        wcagCriteria: ["2.2.1", "2.2.2"],
        severity: "major",
        remediation: "Allow users to extend, adjust, or disable time limits",
      });
      ctx.wcagViolations.add("2.2.1");
    }
  }
}

/**
 * Detect color-only information
 * v10.10.0: Always detect color-only issues regardless of persona
 * (issues exist on the page whether or not this persona would encounter them)
 */
async function detectColorOnlyInfo(ctx: BarrierContext): Promise<void> {
  const { page, persona: _persona, barriers } = ctx;

  // v10.10.0: Removed trait-based skipping - always detect issues

  const colorOnlyElements = await page.$$eval(
    '[class*="red"], [class*="green"], [class*="error"], [class*="success"], [class*="warning"]',
    (elements) => elements.map(el => {
      const styles = window.getComputedStyle(el);
      const hasIcon = el.querySelector('svg, i, [class*="icon"]') !== null;
      const hasText = (el.textContent?.trim() || '').length > 0;
      return {
        selector: el.tagName.toLowerCase() + (el.className ? `.${(el as HTMLElement).className.split(' ')[0]}` : ''),
        hasIcon,
        hasText,
        color: styles.color,
        bgColor: styles.backgroundColor,
      };
    }).filter(el => !el.hasIcon && !el.hasText)
  );

  for (const el of colorOnlyElements.slice(0, 5)) {
    barriers.push({
      type: "sensory",
      element: el.selector,
      description: "Information conveyed by color alone may not be perceivable by color-blind users",
      affectedPersonas: ["color-blind-deuteranopia"],
      wcagCriteria: ["1.4.1"],
      severity: "major",
      remediation: "Add icons, patterns, or text labels in addition to color",
    });
    ctx.wcagViolations.add("1.4.1");
  }
}

/**
 * Detect missing alt text and captions
 * v10.10.0: Also detect empty alt text on non-decorative images
 */
async function detectMissingAltText(ctx: BarrierContext): Promise<void> {
  const { page, persona: _persona, barriers } = ctx;

  // Check images without alt attribute
  const imagesWithoutAlt = await page.$$eval('img:not([alt])', (elements) =>
    elements.map(el => {
      const imgEl = el as HTMLImageElement;
      return {
        selector: `img[src="${imgEl.src.slice(0, 50)}..."]`,
        isDecorative: imgEl.width < 20 || imgEl.height < 20,
        issue: "missing",
      };
    }).filter(el => !el.isDecorative).slice(0, 10)
  );

  // v10.10.0: Also check images with empty alt text that appear non-decorative
  const imagesWithEmptyAlt = await page.$$eval('img[alt=""]', (elements) =>
    elements.map(el => {
      const imgEl = el as HTMLImageElement;
      const rect = imgEl.getBoundingClientRect();
      // Non-decorative heuristics: large enough to be content, in main content area, etc.
      const isLikelyDecorative =
        imgEl.width < 20 || imgEl.height < 20 ||
        rect.width < 50 || rect.height < 50 ||
        imgEl.className.includes('icon') ||
        imgEl.className.includes('decoration') ||
        imgEl.className.includes('separator') ||
        imgEl.getAttribute('role') === 'presentation';
      return {
        selector: `img[src="${imgEl.src.slice(0, 50)}..."]`,
        isDecorative: isLikelyDecorative,
        issue: "empty",
        width: rect.width,
        height: rect.height,
      };
    }).filter(el => !el.isDecorative).slice(0, 10)
  );

  for (const img of imagesWithoutAlt) {
    barriers.push({
      type: "sensory",
      element: img.selector,
      description: "Image without alt text - screen reader users cannot understand the content",
      affectedPersonas: ["deaf-user", "low-vision-magnified"],
      wcagCriteria: ["1.1.1"],
      severity: "major",
      remediation: "Add descriptive alt text, or alt=\"\" if image is purely decorative",
    });
    ctx.wcagViolations.add("1.1.1");
  }

  // v10.10.0: Flag potentially meaningful images marked as decorative
  for (const img of imagesWithEmptyAlt) {
    barriers.push({
      type: "sensory",
      element: img.selector,
      description: `Large image (${Math.round(img.width)}x${Math.round(img.height)}px) has empty alt text - may be incorrectly marked as decorative`,
      affectedPersonas: ["deaf-user", "low-vision-magnified"],
      wcagCriteria: ["1.1.1"],
      severity: "minor",
      remediation: "Verify this image is purely decorative. If it conveys meaning, add descriptive alt text",
    });
    ctx.wcagViolations.add("1.1.1");
  }

  // Check for videos without captions indicator
  // v10.10.0: Always detect, not just for deaf-user persona
  const videos = await page.$$eval('video, iframe[src*="youtube"], iframe[src*="vimeo"]', (elements) =>
    elements.map(el => ({
      selector: el.tagName.toLowerCase(),
      hasCaptions: el.querySelector('track[kind="captions"]') !== null,
    })).filter(el => !el.hasCaptions)
  );

  if (videos.length > 0) {
    barriers.push({
      type: "sensory",
      element: "video",
      description: `${videos.length} video(s) may not have captions - deaf users cannot access audio content`,
      affectedPersonas: ["deaf-user"],
      wcagCriteria: ["1.2.2"],
      severity: "critical",
      remediation: "Add captions to all video content",
    });
    ctx.wcagViolations.add("1.2.2");
  }
}

/**
 * Detect missing form labels
 * v10.10.0: New detector for unlabeled form inputs
 */
async function detectMissingFormLabels(ctx: BarrierContext): Promise<void> {
  const { page, barriers } = ctx;

  const unlabeledInputs = await page.$$eval(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]), textarea, select',
    (elements) => {
      const results: Array<{ selector: string; type: string; hasLabel: boolean; hasAriaLabel: boolean; hasPlaceholder: boolean }> = [];

      for (const el of elements.slice(0, 50)) {
        const input = el as HTMLInputElement;
        const id = input.id;

        // Check for associated label
        const hasLabel = id ? document.querySelector(`label[for="${id}"]`) !== null : false;

        // Check for aria-label or aria-labelledby
        const hasAriaLabel = input.hasAttribute('aria-label') || input.hasAttribute('aria-labelledby');

        // Check for placeholder (not a valid label, but informative)
        const hasPlaceholder = input.hasAttribute('placeholder');

        if (!hasLabel && !hasAriaLabel) {
          results.push({
            selector: input.tagName.toLowerCase() + (id ? `#${id}` : '') + (input.name ? `[name="${input.name}"]` : ''),
            type: input.type || 'text',
            hasLabel,
            hasAriaLabel,
            hasPlaceholder,
          });
        }
      }

      return results;
    }
  );

  for (const input of unlabeledInputs.slice(0, 10)) {
    const placeholderNote = input.hasPlaceholder
      ? ' (has placeholder, but placeholders are not valid labels)'
      : '';
    barriers.push({
      type: "cognitive_load",
      element: input.selector,
      description: `Form input (${input.type}) has no accessible label${placeholderNote}`,
      affectedPersonas: ["low-vision-magnified", "cognitive-adhd", "dyslexic-user"],
      wcagCriteria: ["1.3.1", "3.3.2", "4.1.2"],
      severity: "major",
      remediation: "Add a <label for=\"id\"> element or aria-label attribute to identify the input's purpose",
    });
    ctx.wcagViolations.add("3.3.2");
    ctx.wcagViolations.add("4.1.2");
  }
}

// ============================================================================
// Journey Simulation for Empathy
// ============================================================================

async function simulateAccessibilityJourney(
  page: Page,
  url: string,
  goal: string,
  persona: AccessibilityPersona,
  maxSteps: number,
  maxTime: number
): Promise<AccessibilityEmpathyResult> {
  const startTime = Date.now();
  const ctx: BarrierContext = {
    page,
    persona,
    barriers: [],
    frictionPoints: [],
    wcagViolations: new Set(),
    stepCount: 0,
  };

  let goalAchieved = false;

  // Emotional state captured from cognitive journey (v13.1.0)
  let finalEmotionalState: import("../types.js").EmotionalState | undefined;
  let emotionalEvents: import("../types.js").EmotionalEvent[] | undefined;

  try {
    // Navigate to URL
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    // Run barrier detection
    // v10.10.0: All detectors now run unconditionally regardless of persona
    await detectSmallTouchTargets(ctx);
    await detectLowContrast(ctx);
    await detectCognitiveLoad(ctx);
    await detectTimingIssues(ctx);
    await detectColorOnlyInfo(ctx);
    await detectMissingAltText(ctx);
    await detectMissingFormLabels(ctx);

    // Use cognitive journey for realistic step tracking if API key available
    if (isApiKeyConfigured()) {
      try {
        const journey = await runCognitiveJourney({
          persona: persona.name,
          startUrl: url,
          goal,
          maxSteps,
          maxTime,
          headless: true,
          vision: false,
          verbose: false,
        });
        ctx.stepCount = journey.stepCount;

        // Capture emotional state (v13.1.0)
        finalEmotionalState = journey.finalState.emotionalState;
        emotionalEvents = journey.finalState.emotionalJourney;

        // Map cognitive friction to accessibility friction
        for (const fp of journey.frictionPoints) {
          // Map FrictionPoint types to AccessibilityFrictionPoint types
          const accessibilityType =
            fp.type === "form_error" ? "motor" :
            fp.type === "confusing_ui" || fp.type === "unclear_button" ? "visual" :
            fp.type === "slow_load" || fp.type === "missing_element" ? "cognitive" :
            "cognitive";

          ctx.frictionPoints.push({
            step: ctx.stepCount,
            type: accessibilityType,
            description: fp.monologue.substring(0, 100),
            impact: fp.frustrationIncrease > 0.2 ? "high" : fp.frustrationIncrease > 0.1 ? "medium" : "low",
            accessibilityContext: `Cognitive state: patience ${Math.round(journey.finalState.patienceRemaining * 100)}%`,
          });
        }

        goalAchieved = journey.goalAchieved;
      } catch {
        // Fall back to barrier-based estimation
        ctx.stepCount = Math.max(3, ctx.barriers.length + 2);
      }
    } else {
      // Estimate step count based on detected barriers (deterministic, not random)
      ctx.stepCount = Math.max(3, ctx.barriers.length + 2);
    }

    // v11.11.0: Improved goalAchieved calibration (stress test fix)
    // Distinguish FRICTION (difficult but achievable) from BLOCKER (impossible)
    //
    // BLOCKERS (goalAchieved = false):
    // - Element completely invisible/missing
    // - Element trapped behind non-dismissible overlay
    // - Critical timing issue that expires before action possible
    //
    // FRICTION (goalAchieved = true, with reduced score):
    // - Small touch targets (can still be clicked, just harder)
    // - Low contrast (can still be read, just slower)
    // - Cognitive load (can still complete, just more confusing)
    // - Minor/major severity barriers that slow but don't block
    const criticalBarriers = ctx.barriers.filter(b => b.severity === "critical");

    // Only truly blocking barriers should prevent goal achievement
    // Touch targets, contrast, cognitive load are friction, not blockers
    const blockingBarrierTypes: AccessibilityBarrierType[] = ["timing"]; // Timeout = can't complete
    const blockingBarriers = criticalBarriers.filter(b => blockingBarrierTypes.includes(b.type));

    // Simulate friction based on persona traits
    if (persona.accessibilityTraits.motorControl && persona.accessibilityTraits.motorControl < 0.5) {
      const smallTargets = ctx.barriers.filter(b => b.type === "touch_target");
      if (smallTargets.length > 3) {
        ctx.frictionPoints.push({
          step: 2,
          type: "motor",
          description: "Multiple small touch targets caused repeated mis-clicks",
          impact: "high",
          accessibilityContext: "Essential tremor makes precise clicking difficult",
        });
      }
    }

    if (persona.accessibilityTraits.visionLevel && persona.accessibilityTraits.visionLevel < 0.5) {
      const contrastIssues = ctx.barriers.filter(b => b.type === "contrast");
      if (contrastIssues.length > 2) {
        ctx.frictionPoints.push({
          step: 1,
          type: "visual",
          description: "Low contrast text required zooming and squinting",
          impact: "high",
          accessibilityContext: "3x magnification still insufficient for gray text",
        });
      }
    }

    if (persona.accessibilityTraits.attentionSpan && persona.accessibilityTraits.attentionSpan < 0.5) {
      const cognitiveIssues = ctx.barriers.filter(b => b.type === "cognitive_load");
      if (cognitiveIssues.length > 0) {
        ctx.frictionPoints.push({
          step: 3,
          type: "cognitive",
          description: "Lost focus due to complex form layout",
          impact: "high",
          accessibilityContext: "ADHD makes long forms particularly challenging",
        });
      }
    }

    // v11.11.0: Goal is achievable unless there are truly blocking barriers
    // Friction (small targets, contrast, cognitive load) reduces score but doesn't block
    goalAchieved = blockingBarriers.length === 0;

  } catch (e) {
    ctx.frictionPoints.push({
      step: 0,
      type: "error",
      description: `Navigation error: ${(e as Error).message}`,
      impact: "high",
    });
  }

  // Calculate empathy score
  const empathyScore = calculateEmpathyScore(ctx.barriers, ctx.frictionPoints, goalAchieved);

  // Generate remediation priorities
  const remediationPriority = generateRemediationPriority(ctx.barriers);

  return {
    url,
    persona: persona.name,
    disabilityType: getDisabilityType(persona),
    goalAchieved,
    barriers: ctx.barriers,
    frictionPoints: ctx.frictionPoints,
    wcagViolations: Array.from(ctx.wcagViolations),
    remediationPriority,
    empathyScore,
    duration: Date.now() - startTime,
    finalEmotionalState,
    emotionalEvents,
  };
}

function getDisabilityType(persona: AccessibilityPersona): string {
  if (persona.accessibilityTraits.tremor) return "Motor impairment (tremor)";
  if (persona.accessibilityTraits.visionLevel && persona.accessibilityTraits.visionLevel < 0.5) return "Low vision";
  if (persona.accessibilityTraits.colorBlindness) return `Color blindness (${persona.accessibilityTraits.colorBlindness})`;
  if (persona.cognitiveTraits?.workingMemory && persona.cognitiveTraits.workingMemory < 0.5) return "Cognitive (ADHD/Memory)";
  if (persona.accessibilityTraits.processingSpeed && persona.accessibilityTraits.processingSpeed < 0.6) return "Cognitive (Processing)";
  return "General accessibility";
}

/**
 * v11.10.0: Improved scoring with deduplication and capped deductions (issue #86)
 *
 * Previous issues:
 * - 10 small touch targets = -30 to -200 points (too harsh)
 * - Same barrier type detected per-element caused score collapse
 * - goalAchieved=false added -20 even when navigation was possible
 *
 * New approach:
 * - Group barriers by type, cap deduction per type
 * - Scale by unique issues, not total element count
 * - Base score on accessibility, not just barrier count
 */
function calculateEmpathyScore(
  barriers: AccessibilityBarrier[],
  frictionPoints: AccessibilityFrictionPoint[],
  goalAchieved: boolean
): number {
  let score = 100;

  // v11.10.0: Group barriers by type to avoid over-penalizing repeated issues
  const barriersByType = new Map<AccessibilityBarrierType, AccessibilityBarrier[]>();
  for (const barrier of barriers) {
    const existing = barriersByType.get(barrier.type) || [];
    existing.push(barrier);
    barriersByType.set(barrier.type, existing);
  }

  // Deduct per barrier TYPE with caps
  // Max deduction per type: critical=25, major=15, minor=8
  for (const [type, typeBarriers] of barriersByType) {
    const criticalCount = typeBarriers.filter(b => b.severity === "critical").length;
    const majorCount = typeBarriers.filter(b => b.severity === "major").length;
    const minorCount = typeBarriers.filter(b => b.severity === "minor").length;

    // Diminishing returns: first instance costs most, subsequent less
    const criticalDeduct = Math.min(25, criticalCount > 0 ? 15 + Math.min(criticalCount - 1, 2) * 5 : 0);
    const majorDeduct = Math.min(15, majorCount > 0 ? 8 + Math.min(majorCount - 1, 2) * 3 : 0);
    const minorDeduct = Math.min(8, minorCount > 0 ? 3 + Math.min(minorCount - 1, 3) * 1.5 : 0);

    score -= criticalDeduct + majorDeduct + minorDeduct;
  }

  // Deduct for friction points (capped at 25 total)
  let frictionDeduct = 0;
  for (const fp of frictionPoints) {
    switch (fp.impact) {
      case "high": frictionDeduct += 8; break;
      case "medium": frictionDeduct += 4; break;
      case "low": frictionDeduct += 2; break;
    }
  }
  score -= Math.min(25, frictionDeduct);

  // Goal achievement affects score but doesn't zero it
  // v11.10.0: Reduced penalty, page can still be partially accessible
  if (!goalAchieved) score -= 15;

  // Ensure minimum score of 10 if there are any working elements
  // A page with issues is still more accessible than a blank/broken page
  const hasWorkingElements = barriers.some(b => b.severity === "minor");
  if (hasWorkingElements && score < 10) {
    score = 10;
  }

  return Math.max(0, Math.round(score));
}

function generateRemediationPriority(barriers: AccessibilityBarrier[]): RemediationItem[] {
  const items: RemediationItem[] = [];
  let priority = 1;

  // Sort barriers by severity
  const sorted = [...barriers].sort((a, b) => {
    const severityOrder: Record<AccessibilityBarrierSeverity, number> = {
      critical: 0,
      major: 1,
      minor: 2,
    };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  // Group by type to avoid duplicates
  const seen = new Set<string>();

  for (const barrier of sorted) {
    const key = `${barrier.type}-${barrier.description.slice(0, 50)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const effort: AgentReadyEffort =
      barrier.type === "contrast" ? "easy" :
      barrier.type === "touch_target" ? "easy" :
      barrier.type === "cognitive_load" ? "medium" :
      barrier.type === "timing" ? "medium" :
      "trivial";

    items.push({
      priority: priority++,
      issue: barrier.description,
      fix: barrier.remediation,
      wcagCriteria: barrier.wcagCriteria,
      effort,
    });

    if (items.length >= 10) break;
  }

  return items;
}

// ============================================================================
// Report Generation
// ============================================================================

/**
 * Convert numeric empathy score to letter grade
 */
function getEmpathyGrade(score: number): string {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

export function formatEmpathyAuditReport(result: EmpathyAuditResult): string {
  const grade = getEmpathyGrade(result.overallScore);

  let report = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                    ACCESSIBILITY EMPATHY AUDIT                               ║
╚══════════════════════════════════════════════════════════════════════════════╝

URL: ${result.url}
Goal: "${result.goal}"
Timestamp: ${result.timestamp}
Duration: ${(result.duration / 1000).toFixed(1)}s

⚠️  METHODOLOGY: Empathy scores are heuristic estimates based on barrier detection.*
    This is NOT a substitute for testing with actual users who have disabilities.
    *Based on WCAG criteria and persona simulation. See documentation for sources.

┌────────────────────────────────────────────────────────────────────────────┐
│  EMPATHY GRADE: ${grade}                                                          │
│  (Based on ${result.results.length} disability persona simulations)                          │
└────────────────────────────────────────────────────────────────────────────┘

`;

  // Results by persona
  for (const pr of result.results) {
    const emoji = pr.goalAchieved ? '✓' : '✗';
    const scoreColor = pr.empathyScore >= 70 ? '🟢' : pr.empathyScore >= 50 ? '🟠' : '🔴';

    report += `
${pr.disabilityType}
${'─'.repeat(pr.disabilityType.length)}
  Persona: ${pr.persona}
  Score: ${scoreColor} ${pr.empathyScore}/100
  Goal: ${emoji} ${pr.goalAchieved ? 'Achieved' : 'Not achieved'}
  Barriers: ${pr.barriers.length} (${pr.barriers.filter(b => b.severity === 'critical').length} critical)
  Friction points: ${pr.frictionPoints.length}
`;

    if (pr.frictionPoints.length > 0) {
      report += `  Experience issues:\n`;
      for (const fp of pr.frictionPoints) {
        report += `    • ${fp.description}${fp.accessibilityContext ? ` (${fp.accessibilityContext})` : ''}\n`;
      }
    }
  }

  // Combined WCAG violations
  report += `
WCAG VIOLATIONS
───────────────
`;
  for (const violation of result.allWcagViolations) {
    const criteria = WCAG_CRITERIA[violation];
    if (criteria) {
      report += `  ${violation} (Level ${criteria.level}): ${criteria.description}\n`;
    } else {
      report += `  ${violation}\n`;
    }
  }

  // Top remediations
  report += `
TOP REMEDIATION PRIORITIES
──────────────────────────
`;
  for (const rem of result.combinedRemediation.slice(0, 10)) {
    report += `
  ${rem.priority}. ${rem.issue}
     Fix: ${rem.fix}
     WCAG: ${rem.wcagCriteria.join(', ')}
     Effort: ${rem.effort}
`;
  }

  report += `
─────────────────────────────────────────────────────────────────────────────
* Methodology and research sources: docs/METHODOLOGY.md
  Key sources: WCAG 2.1, WebAIM Screen Reader Survey (2024), Baymard Institute

Generated by CBrowser v8.0.0 - Accessibility Empathy Audit
`;

  return report;
}

export function generateEmpathyAuditHtmlReport(result: EmpathyAuditResult): string {
  const grade = getEmpathyGrade(result.overallScore);
  const gradeColor = grade === 'A' || grade === 'B' ? '#10b981' : grade === 'C' ? '#f59e0b' : '#ef4444';

  const personaCards = result.results.map(pr => {
    const personaGrade = getEmpathyGrade(pr.empathyScore);
    const pGradeColor = personaGrade === 'A' || personaGrade === 'B' ? '#10b981' : personaGrade === 'C' ? '#f59e0b' : '#ef4444';
    return `
    <div class="persona-card ${pr.goalAchieved ? 'success' : 'failure'}">
      <div class="persona-header">
        <h3>${pr.disabilityType}</h3>
        <span class="score" style="background: ${pGradeColor}33; color: ${pGradeColor}">
          Grade ${personaGrade}
        </span>
      </div>
      <p class="persona-name">${pr.persona}</p>
      <div class="persona-stats">
        <div class="stat">
          <span class="label">Goal</span>
          <span class="value">${pr.goalAchieved ? '✓ Achieved' : '✗ Failed'}</span>
        </div>
        <div class="stat">
          <span class="label">Barriers</span>
          <span class="value">${pr.barriers.length}</span>
        </div>
        <div class="stat">
          <span class="label">Critical</span>
          <span class="value">${pr.barriers.filter(b => b.severity === 'critical').length}</span>
        </div>
      </div>
      ${pr.frictionPoints.length > 0 ? `
        <div class="friction-points">
          <h4>Experience Issues</h4>
          <ul>
            ${pr.frictionPoints.map(fp => `
              <li>
                <strong>${fp.type}:</strong> ${fp.description}
                ${fp.accessibilityContext ? `<br><small>${fp.accessibilityContext}</small>` : ''}
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
      ${pr.finalEmotionalState ? generateEmotionVisualizationSection(pr.finalEmotionalState, pr.emotionalEvents, "Emotional State") : ''}
    </div>
  `;
  }).join('');

  const wcagList = result.allWcagViolations.map(v => {
    const criteria = WCAG_CRITERIA[v];
    return `<li><strong>${v}</strong> (Level ${criteria?.level || '?'}): ${criteria?.description || 'Unknown'}</li>`;
  }).join('');

  const remediationRows = result.combinedRemediation.slice(0, 10).map(rem => `
    <tr>
      <td>${rem.priority}</td>
      <td>${rem.issue}</td>
      <td>${rem.fix}</td>
      <td>${rem.wcagCriteria.join(', ')}</td>
      <td><span class="badge badge-${rem.effort}">${rem.effort}</span></td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accessibility Empathy Audit - ${result.url}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
      background: #0f172a;
      color: #e2e8f0;
    }
    h1 {
      color: #f8fafc;
      border-bottom: 3px solid #8b5cf6;
      padding-bottom: 0.5rem;
    }
    h2 { color: #94a3b8; margin-top: 2rem; }
    .meta {
      background: #1e293b;
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
    }
    .meta p { margin: 0.25rem 0; }
    .score-card {
      background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
      border-radius: 16px;
      padding: 2rem;
      text-align: center;
      margin: 2rem 0;
    }
    .score-value {
      font-size: 4rem;
      font-weight: bold;
      color: ${gradeColor};
    }
    .score-label {
      font-size: 1.25rem;
      color: #94a3b8;
    }
    .persona-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 1rem;
      margin: 2rem 0;
    }
    .persona-card {
      background: #1e293b;
      border-radius: 8px;
      padding: 1rem;
      border-left: 4px solid #3b82f6;
    }
    .persona-card.success { border-left-color: #10b981; }
    .persona-card.failure { border-left-color: #ef4444; }
    .persona-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .persona-header h3 {
      margin: 0;
      color: #f8fafc;
    }
    .persona-header .score {
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-weight: bold;
    }
    .persona-name {
      color: #94a3b8;
      font-size: 0.875rem;
      margin: 0.5rem 0;
    }
    .persona-stats {
      display: flex;
      gap: 1rem;
      margin: 1rem 0;
    }
    .persona-stats .stat {
      flex: 1;
      text-align: center;
      background: #334155;
      padding: 0.5rem;
      border-radius: 4px;
    }
    .persona-stats .label {
      display: block;
      font-size: 0.75rem;
      color: #94a3b8;
    }
    .persona-stats .value {
      display: block;
      font-weight: bold;
    }
    .friction-points {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid #334155;
    }
    .friction-points h4 {
      margin: 0 0 0.5rem 0;
      font-size: 0.875rem;
      color: #94a3b8;
    }
    .friction-points ul {
      margin: 0;
      padding-left: 1.25rem;
    }
    .friction-points li {
      margin: 0.5rem 0;
      font-size: 0.875rem;
    }
    .friction-points small {
      color: #94a3b8;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #1e293b;
      border-radius: 8px;
      overflow: hidden;
      margin: 1rem 0;
    }
    th, td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid #334155;
    }
    th { background: #0f172a; color: #94a3b8; }
    .badge {
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
    }
    .badge-trivial { background: #16653433; color: #86efac; }
    .badge-easy { background: #1e3a8a33; color: #93c5fd; }
    .badge-medium { background: #78350f33; color: #fde047; }
    .badge-hard { background: #7f1d1d33; color: #fca5a5; }
    .wcag-list {
      background: #1e293b;
      padding: 1rem;
      border-radius: 8px;
    }
    .wcag-list ul {
      margin: 0;
      padding-left: 1.5rem;
    }
    .wcag-list li {
      margin: 0.5rem 0;
    }
    .disclaimer {
      background: #1e3a5f;
      border-left: 4px solid #8b5cf6;
      padding: 1rem;
      margin: 1rem 0;
      border-radius: 0 8px 8px 0;
    }
    .disclaimer h4 {
      margin: 0 0 0.5rem 0;
      color: #a78bfa;
    }
    .disclaimer p {
      margin: 0.25rem 0;
      font-size: 0.875rem;
      color: #94a3b8;
    }
    .footnote {
      font-size: 0.75rem;
      color: #64748b;
      text-align: center;
      margin-top: 1rem;
    }
    /* Emotion visualization styles (v13.1.0) */
    ${getEmotionVisualizationStyles()}
  </style>
</head>
<body>
  <h1>♿ Accessibility Empathy Audit</h1>

  <div class="disclaimer">
    <h4>⚠️ Important Methodology Note</h4>
    <p>Empathy grades are <strong>heuristic estimates</strong> based on barrier detection and persona simulation.*</p>
    <p>This is <strong>NOT a substitute</strong> for testing with actual users who have disabilities.</p>
    <p style="font-size: 0.75rem; margin-top: 0.5rem;">*Based on WCAG 2.1 criteria and cognitive science research. Combine with automated WCAG checkers (axe, WAVE) and user testing for comprehensive accessibility validation.</p>
  </div>

  <div class="meta">
    <p><strong>URL:</strong> ${result.url}</p>
    <p><strong>Goal:</strong> "${result.goal}"</p>
    <p><strong>Timestamp:</strong> ${result.timestamp}</p>
    <p><strong>Duration:</strong> ${(result.duration / 1000).toFixed(1)}s</p>
  </div>

  <div class="score-card">
    <div class="score-value" style="color: ${gradeColor}">${grade}</div>
    <div class="score-label">Overall Empathy Grade</div>
    <p style="color: #94a3b8; margin-top: 0.5rem; font-size: 0.875rem;">Based on ${result.results.length} disability persona simulations</p>
  </div>

  <h2>Results by Disability Type</h2>
  <div class="persona-grid">
    ${personaCards}
  </div>

  <h2>WCAG Violations (${result.allWcagViolations.length})</h2>
  <div class="wcag-list">
    <ul>
      ${wcagList}
    </ul>
  </div>

  <h2>Remediation Priorities</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Issue</th>
        <th>Fix</th>
        <th>WCAG</th>
        <th>Effort</th>
      </tr>
    </thead>
    <tbody>
      ${remediationRows}
    </tbody>
  </table>

  <div class="footnote">
    <p>* Methodology and research sources: <a href="docs/METHODOLOGY.md" style="color: #60a5fa;">docs/METHODOLOGY.md</a></p>
    <p>Key sources: WCAG 2.1, WebAIM Screen Reader Survey (2024), Baymard Institute</p>
    <p style="margin-top: 0.5rem;"><strong>Important:</strong> This is NOT a substitute for testing with actual users who have disabilities.</p>
  </div>

  <p style="color: #64748b; text-align: center; margin-top: 2rem;">
    Generated by CBrowser v8.0.0 - Accessibility Empathy Audit
  </p>
</body>
</html>`;
}

// ============================================================================
// Barrier Deduplication
// ============================================================================

/**
 * v11.11.0: Deduplicate barriers by TYPE only, aggregate affected elements (stress test fix)
 *
 * Previous approach grouped by element+type, but 10 small touch targets still showed as
 * 10 separate barriers. Now we group by TYPE only:
 * - 10 small touch targets → 1 barrier with affectedElements: ["button#1", "link#2", ...]
 * - All affected personas combined
 * - Highest severity kept
 */
function deduplicateBarriers(
  _allBarriers: AccessibilityBarrier[],
  results: AccessibilityEmpathyResult[]
): AccessibilityBarrier[] {
  // Group by barrier TYPE only (not element)
  const barriersByType = new Map<AccessibilityBarrierType, {
    barriers: AccessibilityBarrier[];
    personas: Set<string>;
    elements: Set<string>;
    highestSeverity: AccessibilityBarrierSeverity;
  }>();

  for (const result of results) {
    const personaName = result.persona;

    for (const barrier of result.barriers) {
      const existing = barriersByType.get(barrier.type);

      if (existing) {
        existing.barriers.push(barrier);
        existing.personas.add(personaName);
        existing.elements.add(barrier.element);

        // Track highest severity
        const severityOrder = { critical: 3, major: 2, minor: 1 };
        if (severityOrder[barrier.severity] > severityOrder[existing.highestSeverity]) {
          existing.highestSeverity = barrier.severity;
        }
      } else {
        barriersByType.set(barrier.type, {
          barriers: [barrier],
          personas: new Set([personaName]),
          elements: new Set([barrier.element]),
          highestSeverity: barrier.severity,
        });
      }
    }
  }

  // Create one deduplicated barrier per type
  const deduplicated: AccessibilityBarrier[] = [];

  for (const [type, data] of barriersByType) {
    const elementCount = data.elements.size;
    const representative = data.barriers[0]; // Use first barrier as template

    // Create aggregated description
    const elementList = Array.from(data.elements).slice(0, 5);
    const moreCount = elementCount > 5 ? ` (+${elementCount - 5} more)` : "";
    const aggregatedDescription = elementCount > 1
      ? `${representative.description.split(" - ")[0]} - affects ${elementCount} elements: ${elementList.join(", ")}${moreCount}`
      : representative.description;

    deduplicated.push({
      type,
      element: elementCount > 1 ? `${elementCount} elements` : representative.element,
      description: aggregatedDescription,
      affectedPersonas: Array.from(data.personas),
      wcagCriteria: representative.wcagCriteria,
      severity: data.highestSeverity,
      remediation: representative.remediation,
    });
  }

  return deduplicated;
}

// ============================================================================
// Main Empathy Audit Function
// ============================================================================

export async function runEmpathyAudit(
  url: string,
  options: EmpathyAuditOptions
): Promise<EmpathyAuditResult> {
  const {
    goal,
    disabilities,
    wcagLevel = "AA",
    maxSteps = 20,
    maxTime = 120,
    headless = true,
  } = options;

  const startTime = Date.now();
  const results: AccessibilityEmpathyResult[] = [];
  const allWcagViolations = new Set<string>();
  const allBarriers: AccessibilityBarrier[] = [];

  // Map disability names to personas
  // v14.2.5: Added elderly-user mapping (issue #190 - persona dropout)
  const personaMap: Record<string, string> = {
    "motor-tremor": "motor-impairment-tremor",
    "motor": "motor-impairment-tremor",
    "tremor": "motor-impairment-tremor",
    "low-vision": "low-vision-magnified",
    "vision": "low-vision-magnified",
    "magnified": "low-vision-magnified",
    "adhd": "cognitive-adhd",
    "cognitive": "cognitive-adhd",
    "attention": "cognitive-adhd",
    "dyslexia": "dyslexic-user",
    "dyslexic": "dyslexic-user",
    "reading": "dyslexic-user",
    "deaf": "deaf-user",
    "hearing": "deaf-user",
    "elderly": "elderly-low-vision",
    "elderly-user": "elderly-low-vision",  // v14.2.5: Added missing mapping
    "elderly-low-vision": "elderly-low-vision",
    "senior": "elderly-low-vision",
    "old": "elderly-low-vision",  // v14.2.5: Additional synonym
    "color-blind": "color-blind-deuteranopia",
    "colorblind": "color-blind-deuteranopia",
    "deuteranopia": "color-blind-deuteranopia",
  };

  // Run audit for each disability type
  for (const disability of disabilities) {
    const personaName = personaMap[disability.toLowerCase()] || disability;
    const persona = getAccessibilityPersona(personaName);

    if (!persona) {
      console.warn(`Unknown disability/persona: ${disability}, skipping`);
      continue;
    }

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ headless });
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      });
      const page = await context.newPage();

      const result = await simulateAccessibilityJourney(
        page,
        url,
        goal,
        persona,
        maxSteps,
        maxTime
      );

      results.push(result);

      // Collect WCAG violations and barriers
      for (const v of result.wcagViolations) {
        allWcagViolations.add(v);
      }
      allBarriers.push(...result.barriers);

    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  // Filter WCAG violations by level
  const levelOrder: Record<string, number> = { A: 1, AA: 2, AAA: 3 };
  const maxLevel = levelOrder[wcagLevel];
  const filteredViolations = Array.from(allWcagViolations).filter(v => {
    const criteria = WCAG_CRITERIA[v];
    return !criteria || levelOrder[criteria.level] <= maxLevel;
  });

  // v11.10.0: Deduplicate barriers by element+type, list affected personas (issue #86)
  const deduplicatedBarriers = deduplicateBarriers(allBarriers, results);

  // Generate combined remediation from deduplicated barriers
  const combinedRemediation = generateRemediationPriority(deduplicatedBarriers);

  // Calculate overall score
  const overallScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + r.empathyScore, 0) / results.length)
    : 0;

  return {
    url,
    goal,
    timestamp: new Date().toISOString(),
    results,
    allWcagViolations: filteredViolations,
    allBarriers,
    topBarriers: deduplicatedBarriers, // v11.11.0: Deduplicated barriers grouped by type
    combinedRemediation,
    overallScore,
    duration: Date.now() - startTime,
  };
}
