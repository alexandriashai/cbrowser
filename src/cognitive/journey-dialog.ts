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
 * Each step now prints its phase and mood, the persona's monologue, and the
 * action with its target; a step whose reply could not be read says so.
 */

import type { CognitiveStep } from "./index.js";

/** Where an action string ("click:#pricing", "fill:#email:me@x") says to act, minus its value. */
function actionVerb(action: string): string {
  const verb = action.split(":")[0]?.trim();
  return verb || action;
}

/** The lines that describe one journey step, without trailing newlines. */
export function formatJourneyStep(step: CognitiveStep): string[] {
  if (step.replyReadable === false) {
    return [`   Step ${step.step}: the model's reply could not be read, so this step took no action`];
  }
  const lines = [`   Step ${step.step} · ${step.phase} · ${step.state.currentMood}`];
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
