/**
 * journey-sessions.ts — which browser sessions belong to a running cognitive journey.
 *
 * Alexa, 2026-10-23: "refuse evaluate_script on a session while a journey runs
 * on it." A cognitive journey simulates what a person can see and do. A page
 * script can read the whole DOM (hidden links, aria labels, off-screen text)
 * and click or submit with no visible target, so a journey whose driver ran
 * one reports friction and abandonment for a user who does not exist.
 *
 * cognitive_journey_init opens a fresh browser session for the journey and
 * marks it here. evaluate_script refuses a marked session, with or without
 * force. The mark is released when cognitive_journey_update_state, given the
 * session's _browserToken, reports the journey over (abandoned, or the goal
 * reached), or when the session goes away: the set holds browser objects
 * weakly, so a closed and collected session leaves no entry behind.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import type { CBrowser } from "../browser.js";

const journeyBrowsers = new WeakSet<CBrowser>();

/** Mark a browser as running a cognitive journey. */
export function markJourneyBrowser(browser: CBrowser): void {
  journeyBrowsers.add(browser);
}

/** The journey on this browser is over; page scripts may run on it again. */
export function releaseJourneyBrowser(browser: CBrowser): void {
  journeyBrowsers.delete(browser);
}

export function isJourneyBrowser(browser: CBrowser): boolean {
  return journeyBrowsers.has(browser);
}

/** What evaluate_script says when it refuses a journey session. */
export const JOURNEY_SCRIPT_REFUSAL =
  "This browser session is running a cognitive journey (started by cognitive_journey_init), so page scripts are refused on it, " +
  "with or without force: a script can read and act on things no person could, which would make the journey's results " +
  "describe a user who does not exist. The session is released when cognitive_journey_update_state, given this " +
  "_browserToken, reports the journey over (abandoned or the goal reached). To run a script now, use a different session " +
  "(omit _browserToken to start one).";
