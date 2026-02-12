/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexa Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */


/**
 * CBrowser Utility Functions
 *
 * Shared utilities for security, validation, and common operations.
 */

import { normalize, resolve, isAbsolute, relative } from "path";
import { CBrowserError, CBrowserErrorCode } from "./types.js";

/**
 * Validate that a file path is safe and within allowed directories.
 * Prevents path traversal attacks (e.g., ../../etc/passwd).
 *
 * @param filePath - The path to validate
 * @param allowedBase - Base directory that paths must be within
 * @returns The normalized, validated path
 * @throws CBrowserError if path traversal is detected
 */
export function validateFilePath(filePath: string, allowedBase: string): string {
  // Normalize both paths to remove ../ and ./
  const normalizedPath = normalize(filePath);
  const normalizedBase = normalize(allowedBase);

  // Resolve to absolute paths
  const absolutePath = isAbsolute(normalizedPath)
    ? normalizedPath
    : resolve(normalizedBase, normalizedPath);
  const absoluteBase = resolve(normalizedBase);

  // Check if the resolved path is within the allowed base
  const relativePath = relative(absoluteBase, absolutePath);

  // If the relative path starts with "..", it's outside the base
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new CBrowserError(
      CBrowserErrorCode.PATH_TRAVERSAL_BLOCKED,
      `Path traversal blocked: "${filePath}" resolves outside allowed directory`,
      { attemptedPath: filePath, allowedBase, resolvedPath: absolutePath }
    );
  }

  return absolutePath;
}

/**
 * Sanitize a filename to remove potentially dangerous characters.
 * Keeps alphanumeric, dash, underscore, and dot.
 *
 * @param filename - The filename to sanitize
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_") // Replace unsafe chars with underscore
    .replace(/\.{2,}/g, ".") // Collapse multiple dots
    .replace(/^\.+|\.+$/g, "") // Remove leading/trailing dots
    .substring(0, 255); // Limit length
}

/**
 * Create a safe path by combining base and user-provided path.
 *
 * @param base - The base directory (must be absolute)
 * @param userPath - User-provided path (may contain dangerous chars)
 * @returns Safe, validated absolute path
 */
export function safePath(base: string, userPath: string): string {
  const sanitized = userPath
    .split(/[/\\]/)
    .map(sanitizeFilename)
    .filter(Boolean)
    .join("/");

  return validateFilePath(sanitized, base);
}

// ============================================================================
// Emotion Visualization Helpers (v13.1.0)
// ============================================================================

import type { EmotionalState, EmotionalEvent, EmotionType } from "./types.js";

/**
 * Color mapping for emotions using Russell's Circumplex Model.
 * Positive valence = warmer colors, negative valence = cooler colors.
 * High arousal = more saturated, low arousal = less saturated.
 */
export const EMOTION_COLORS: Record<EmotionType, string> = {
  anxiety: "#ef4444",      // Red - high arousal, negative valence
  frustration: "#f97316",  // Orange-red - high arousal, negative valence
  boredom: "#6b7280",      // Gray - low arousal, slightly negative
  confusion: "#a855f7",    // Purple - medium arousal, negative
  satisfaction: "#10b981", // Green - medium arousal, positive
  excitement: "#eab308",   // Yellow - high arousal, positive
  relief: "#3b82f6",       // Blue - low arousal, positive
  neutral: "#94a3b8",      // Slate - baseline
};

/**
 * Emoji mapping for emotions (for text reports).
 */
export const EMOTION_EMOJI: Record<EmotionType, string> = {
  anxiety: "😰",
  frustration: "😤",
  boredom: "😑",
  confusion: "😕",
  satisfaction: "😊",
  excitement: "🤩",
  relief: "😌",
  neutral: "😐",
};

/**
 * Generate CSS styles for emotion visualization.
 */
export function getEmotionVisualizationStyles(): string {
  return `
    .emotion-bar {
      display: flex;
      gap: 4px;
      margin: 0.5rem 0;
    }
    .emotion-segment {
      height: 8px;
      border-radius: 2px;
      transition: width 0.3s ease;
    }
    .emotion-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      font-size: 0.75rem;
      margin-top: 0.5rem;
    }
    .emotion-legend-item {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    .emotion-legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .emotion-journey {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 1rem 0;
    }
    .emotion-event {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      background: #1e293b;
      border-radius: 4px;
    }
    .emotion-event-step {
      color: #94a3b8;
      min-width: 50px;
    }
    .emotion-event-trigger {
      background: #334155;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
    }
    .emotion-event-desc {
      flex: 1;
      color: #e2e8f0;
    }
    .emotion-circumplex {
      position: relative;
      width: 200px;
      height: 200px;
      border: 1px solid #334155;
      border-radius: 50%;
      margin: 1rem auto;
    }
    .emotion-circumplex-dot {
      position: absolute;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      border: 2px solid white;
    }
    .emotion-circumplex-axes {
      position: absolute;
      inset: 0;
    }
    .emotion-summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 0.5rem;
      margin: 1rem 0;
    }
    .emotion-summary-item {
      text-align: center;
      padding: 0.5rem;
      background: #1e293b;
      border-radius: 8px;
    }
    .emotion-summary-value {
      font-size: 1.5rem;
      font-weight: bold;
    }
    .emotion-summary-label {
      font-size: 0.75rem;
      color: #94a3b8;
    }
  `;
}

/**
 * Generate HTML for an emotion bar visualization.
 * Shows relative intensities of all emotions as colored segments.
 */
export function generateEmotionBarHTML(state: EmotionalState): string {
  const emotions: Array<{ key: EmotionType; value: number }> = [
    { key: "anxiety", value: state.anxiety },
    { key: "frustration", value: state.frustration },
    { key: "boredom", value: state.boredom },
    { key: "confusion", value: state.confusion },
    { key: "satisfaction", value: state.satisfaction },
    { key: "excitement", value: state.excitement },
    { key: "relief", value: state.relief },
  ];

  const total = emotions.reduce((sum, e) => sum + e.value, 0) || 1;

  const segments = emotions
    .filter(e => e.value > 0.05)
    .map(e => `
      <div class="emotion-segment"
           style="width: ${(e.value / total) * 100}%; background: ${EMOTION_COLORS[e.key]}"
           title="${e.key}: ${Math.round(e.value * 100)}%">
      </div>
    `).join("");

  const legend = emotions
    .filter(e => e.value > 0.05)
    .map(e => `
      <span class="emotion-legend-item">
        <span class="emotion-legend-dot" style="background: ${EMOTION_COLORS[e.key]}"></span>
        ${e.key} (${Math.round(e.value * 100)}%)
      </span>
    `).join("");

  return `
    <div class="emotion-bar">${segments}</div>
    <div class="emotion-legend">${legend}</div>
  `;
}

/**
 * Generate HTML for emotion summary statistics.
 */
export function generateEmotionSummaryHTML(state: EmotionalState): string {
  const dominantColor = EMOTION_COLORS[state.dominant];
  const valenceLabel = state.valence > 0.3 ? "Positive" : state.valence < -0.3 ? "Negative" : "Neutral";
  const arousalLabel = state.arousal > 0.6 ? "High" : state.arousal < 0.4 ? "Low" : "Medium";

  return `
    <div class="emotion-summary-grid">
      <div class="emotion-summary-item">
        <div class="emotion-summary-value" style="color: ${dominantColor}">${EMOTION_EMOJI[state.dominant]}</div>
        <div class="emotion-summary-label">Dominant: ${state.dominant}</div>
      </div>
      <div class="emotion-summary-item">
        <div class="emotion-summary-value" style="color: ${state.valence > 0 ? "#10b981" : state.valence < 0 ? "#ef4444" : "#94a3b8"}">
          ${state.valence > 0 ? "+" : ""}${(state.valence * 100).toFixed(0)}%
        </div>
        <div class="emotion-summary-label">Valence (${valenceLabel})</div>
      </div>
      <div class="emotion-summary-item">
        <div class="emotion-summary-value">${(state.arousal * 100).toFixed(0)}%</div>
        <div class="emotion-summary-label">Arousal (${arousalLabel})</div>
      </div>
    </div>
  `;
}

/**
 * Generate HTML for emotional journey timeline.
 * Shows emotional events as they occurred during the journey.
 */
export function generateEmotionalJourneyHTML(events: EmotionalEvent[]): string {
  if (!events || events.length === 0) {
    return '<p style="color: #94a3b8; font-style: italic;">No emotional events recorded</p>';
  }

  const eventRows = events.slice(0, 20).map(event => {
    const triggerColor = getTriggerColor(event.trigger);
    return `
      <div class="emotion-event">
        <span class="emotion-event-step">Step ${event.stepNumber}</span>
        <span class="emotion-event-trigger" style="background: ${triggerColor}33; color: ${triggerColor}">
          ${event.trigger}
        </span>
        <span class="emotion-event-desc">${event.description}</span>
      </div>
    `;
  }).join("");

  const truncatedNote = events.length > 20
    ? `<p style="color: #94a3b8; font-size: 0.75rem; margin-top: 0.5rem;">
         Showing first 20 of ${events.length} events
       </p>`
    : "";

  return `
    <div class="emotion-journey">
      ${eventRows}
    </div>
    ${truncatedNote}
  `;
}

/**
 * Get color for emotional trigger type.
 */
function getTriggerColor(trigger: string): string {
  const colors: Record<string, string> = {
    success: "#10b981",
    progress: "#3b82f6",
    completion: "#10b981",
    discovery: "#eab308",
    clarity: "#3b82f6",
    relief: "#3b82f6",
    recovery: "#10b981",
    failure: "#ef4444",
    error: "#ef4444",
    setback: "#f97316",
    confusion_onset: "#a855f7",
    waiting: "#6b7280",
    time_pressure: "#ef4444",
  };
  return colors[trigger] || "#94a3b8";
}

/**
 * Generate complete emotion visualization section for HTML reports.
 */
export function generateEmotionVisualizationSection(
  state: EmotionalState,
  events?: EmotionalEvent[],
  title = "Emotional State"
): string {
  return `
    <div class="emotion-visualization">
      <h4 style="color: #94a3b8; margin-bottom: 0.5rem;">${title}</h4>
      ${generateEmotionSummaryHTML(state)}
      ${generateEmotionBarHTML(state)}
      ${events && events.length > 0 ? `
        <details style="margin-top: 1rem;">
          <summary style="cursor: pointer; color: #94a3b8;">Emotional Journey (${events.length} events)</summary>
          ${generateEmotionalJourneyHTML(events)}
        </details>
      ` : ""}
    </div>
  `;
}
