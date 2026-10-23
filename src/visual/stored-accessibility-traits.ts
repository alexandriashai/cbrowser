/**
 * The accessibility traits a persona's own record carries.
 *
 * The attention model synthesizes a perceptual filter from these for a persona
 * with no built-in perceptual profile (resolvePerceptualProfile). Every caller
 * that draws a persona's attention passes them, so one persona resolves through
 * one filter whichever tool asks: attention_analysis, attention_compare,
 * empathy_audit's own attention pass, journey_heatmap_gif and the capture
 * overlay. Before 2026-10-22 only the first two did, and the same custom persona
 * with low vision on record was "synthesized" there and "default" in the rest.
 * (ISC-48.1)
 *
 * Only what the record stores: nothing is inferred from the name here, so a
 * persona without traits on record resolves exactly as it did before.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import type { AccessibilityTraits } from "../types.js";

/**
 * The record's accessibilityTraits, keeping only the fields it actually sets
 * (a stored null or undefined is not a value), or undefined when none remain.
 */
export function storedAccessibilityTraits(persona: unknown): AccessibilityTraits | undefined {
  const a11y = (persona as { accessibilityTraits?: unknown } | undefined)?.accessibilityTraits;
  if (!a11y || typeof a11y !== "object") return undefined;
  const set = Object.entries(a11y).filter(([, v]) => v !== undefined && v !== null);
  return set.length > 0 ? (Object.fromEntries(set) as AccessibilityTraits) : undefined;
}

/** storedAccessibilityTraits of the persona the registry resolves for `name`. */
export async function personaStoredAccessibilityTraits(name: string): Promise<AccessibilityTraits | undefined> {
  const { getAnyPersona } = await import("../personas.js");
  return storedAccessibilityTraits(getAnyPersona(name));
}
