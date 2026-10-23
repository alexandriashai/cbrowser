/**
 * The cognitive journey's provenance groups, merged into one list for
 * ../model-provenance.ts: the autonomous journey and its helpers
 * (journey.ts), the emotional engine (emotion.ts), the time-of-day model
 * (temporal.ts), human-input timing (human-input.ts) and the MCP journey
 * tools (journey-mcp.ts).
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import type { ProvenanceEntry } from "../model-provenance.js";
import { JOURNEY_PROVENANCE } from "./journey.js";
import { EMOTION_PROVENANCE } from "./emotion.js";
import { TEMPORAL_PROVENANCE } from "./temporal.js";
import { HUMAN_INPUT_PROVENANCE } from "./human-input.js";
import { JOURNEY_MCP_PROVENANCE } from "./journey-mcp.js";

/** Every journey group, in the order the prefixes are documented. */
export const JOURNEY_GROUPS: Record<string, ProvenanceEntry[]> = {
  journey: JOURNEY_PROVENANCE,
  emotion: EMOTION_PROVENANCE,
  temporal: TEMPORAL_PROVENANCE,
  humanInput: HUMAN_INPUT_PROVENANCE,
  journeyMcp: JOURNEY_MCP_PROVENANCE,
};

export const JOURNEY_GROUP_PROVENANCE: ProvenanceEntry[] = Object.values(JOURNEY_GROUPS).flat();
