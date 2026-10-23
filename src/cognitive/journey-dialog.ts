/**
 * journey-dialog.ts — one cognitive-journey step as terminal lines.
 *
 * Alexa, 2026-10-23: "i want the dialog returned during a cli cognitive
 * journey". The CLI's default progress was one line it kept overwriting,
 * "Step N: <phase> (<mood>)", so the persona's inner monologue and what it
 * did were only visible with --verbose. And when the model's reply could not
 * be read as JSON, the step was labelled "evaluate" (the engine's fallback
 * phase) and took no action, so a run of unreadable replies looked like a
 * persona that only ever evaluated.
 *
 * Each step now prints its phase and mood, the page it is on, the persona's
 * monologue, and the action with its target; a step whose reply could not be
 * read says so.
 */

import type { CognitiveStep } from "./index.js";
import type { CognitiveJourneyResult } from "../types.js";

/** Where an action string ("click:#pricing", "fill:#email:me@x") says to act, minus its value. */
function actionVerb(action: string): string {
  const verb = action.split(":")[0]?.trim();
  return verb || action;
}

/**
 * The page a step is on: the full URL alone at the end of its line, with
 * nothing touching it, so a terminal can open it (Alexa, 2026-10-23: "i want
 * the link clickable from cli"). The CLI's output guard also makes it an OSC 8
 * hyperlink on a terminal. Whitespace inside a URL is percent-encoded so the
 * link is not cut.
 */
function pageLine(url: string | undefined): string[] {
  const href = url?.trim().replace(/\s/g, (c) => encodeURIComponent(c));
  return href ? [`   🔗 ${href}`] : [];
}

/** The lines that describe one journey step, without trailing newlines. */
export function formatJourneyStep(step: CognitiveStep): string[] {
  if (step.replyReadable === false) {
    const why = step.replyProblem ? ` (${step.replyProblem})` : "";
    return [`   Step ${step.step}: the model's reply could not be read${why}, so this step took no action`, ...pageLine(step.url)];
  }
  const lines = [`   Step ${step.step} · ${step.phase} · ${step.state.currentMood}`, ...pageLine(step.url)];
  const monologue = step.monologue.trim();
  if (monologue) lines.push(`   💭 "${monologue}"`);
  if (step.action) {
    const target = step.actionTarget?.trim();
    lines.push(`   → ${actionVerb(step.action)}${target ? `: ${target}` : ` (${step.action})`}`);
  } else {
    lines.push("   → no action");
  }
  return lines;
}

/**
 * The line that says how a journey ended. A run that used every step without
 * reaching the goal or giving up has no abandonmentReason, and the CLI
 * printed "ABANDONED: undefined" (2026-10-23).
 */
export function journeyEndLine(
  result: Pick<CognitiveJourneyResult, "goalAchieved" | "abandonmentReason" | "stepCount" | "totalTime">,
): string {
  if (result.goalAchieved) return `✅ GOAL ACHIEVED in ${result.stepCount} steps (${result.totalTime.toFixed(1)}s)`;
  if (result.abandonmentReason) return `❌ ABANDONED: ${result.abandonmentReason}`;
  return `❌ GOAL NOT REACHED: stopped at the step limit after ${result.stepCount} steps (raise it with --max-steps)`;
}
