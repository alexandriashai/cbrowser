/**
 * The keyboard command.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { CBrowser } from "../browser.js";
import { allowedFlags } from "./flags.js";

// =========================================================================
// keyboard — sequences, chords and held modifiers
// =========================================================================

/** Modifier names Playwright accepts in a chord. */
export const KEYBOARD_MODIFIERS = ["Control", "Shift", "Alt", "Meta", "ControlOrMeta"];

/**
 * Named keys Playwright accepts. Anything not here and not a single character
 * is rejected: silently typing an unrecognised key name as literal text is how
 * `--element` and `--device` used to fail.
 */
const KEYBOARD_NAMED_KEYS = [
  "Enter", "Tab", "Escape", "Backspace", "Delete", "Insert", "Space",
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
  "Home", "End", "PageUp", "PageDown", "CapsLock", "ContextMenu",
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  ...KEYBOARD_MODIFIERS,
];

/** Levenshtein distance, capped early since only small distances matter here. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 99;

  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = a[i - 1] === b[j - 1]
        ? rows[i - 1][j - 1]
        : 1 + Math.min(rows[i - 1][j - 1], rows[i - 1][j], rows[i][j - 1]);
    }
  }
  return rows[a.length][b.length];
}

/** One step of a keyboard sequence. */
type KeyboardStep =
  | { kind: "chord"; key: string }
  | { kind: "key"; key: string }
  | { kind: "text"; text: string };

/**
 * Classify a token as a chord, a named key, or literal text.
 *
 * A token is a chord only when every `+`-separated part but the last is a known
 * modifier - so "Control+A" is a chord and "a+b" or "1+1" is text.
 */
export function parseKeyboardToken(token: string, literal = false): KeyboardStep {
  // --text forces literal typing, which is how a string containing "+" is
  // expressed now that "+" always means a chord.
  if (literal) return { kind: "text", text: token };

  // ANY interior "+" means the user intended a chord, so every segment is
  // validated. The previous rule - chord only if every modifier was already
  // valid - meant a typo like "Ctrl+NotAKey" failed the test and fell through
  // to the literal-text branch, silently TYPING the typo into the page.
  if (token.includes("+") && token.length > 1 && !token.startsWith("+") && !token.endsWith("+")) {
    const parts = token.split("+");
    const mods = parts.slice(0, -1);
    const key = parts[parts.length - 1];

    const badMods = mods.filter((m) => !KEYBOARD_MODIFIERS.includes(m));
    if (badMods.length > 0) {
      console.error(`Error: unknown modifier ${badMods.map((m) => `"${m}"`).join(", ")} in chord "${token}"`);
      // The names people actually reach for. Suggested, never silently
      // accepted - a wrong modifier that "worked" would hide the typo.
      const ALIASES: Record<string, string> = {
        ctrl: "Control", cmd: "Meta", command: "Meta", win: "Meta",
        super: "Meta", option: "Alt", opt: "Alt", altgr: "Alt", ctl: "Control",
      };
      const suggestions = badMods
        .map((m) => ALIASES[m.toLowerCase()] ?? KEYBOARD_MODIFIERS.find((k) => k.toLowerCase().startsWith(m.toLowerCase())))
        .filter(Boolean);
      if (suggestions.length > 0) console.error(`  Did you mean: ${suggestions.join(", ")}?`);
      console.error(`  Valid modifiers: ${KEYBOARD_MODIFIERS.join(", ")}`);
      console.error(`  To type this as literal text, use --text.`);
      process.exit(1);
    }

    if (key.length !== 1 && !KEYBOARD_NAMED_KEYS.includes(key)) {
      console.error(`Error: unknown key "${key}" in chord "${token}"`);
      console.error(`  Modifiers: ${KEYBOARD_MODIFIERS.join(", ")}`);
      console.error(`  Named keys: ${KEYBOARD_NAMED_KEYS.filter((k) => !KEYBOARD_MODIFIERS.includes(k)).join(", ")}`);
      console.error(`  To type this as literal text, use --text.`);
      process.exit(1);
    }
    return { kind: "chord", key: token };
  }

  if (KEYBOARD_NAMED_KEYS.includes(token)) return { kind: "key", key: token };

  // Case-insensitive matches are intent, not typos: "enter" means Enter.
  const cased = KEYBOARD_NAMED_KEYS.find((k) => k.toLowerCase() === token.toLowerCase());
  if (cased) return { kind: "key", key: cased };

  // A near-miss on a real key name is a typo worth rejecting ("Delet",
  // "ArrowLef"). Distance is measured against the actual key list rather than
  // guessed from shape, so ordinary words to be typed ("Hello", "Replaced")
  // are nowhere near a key name and pass through as text.
  const near = KEYBOARD_NAMED_KEYS.filter((k) => editDistance(k.toLowerCase(), token.toLowerCase()) <= 1);
  if (near.length > 0) {
    console.error(`Error: unknown key name "${token}"`);
    console.error(`  Did you mean: ${near.join(", ")}?`);
    console.error(`  Valid modifiers: ${KEYBOARD_MODIFIERS.join(", ")}`);
    process.exit(1);
  }

  return { kind: "text", text: token };
}

/**
 * --delay and --repeat for keyboard, checked the same way whether the keys go
 * to the local browser or the daemon. The daemon route used to skip this, so
 * --repeat 0 typed nothing and reported success, and --repeat 2.5 ran 3 passes.
 */
export function parseKeyboardNumbers(options: Record<string, string | boolean>): { delay: number; repeat: number } {
  const delay = options.delay !== undefined ? Number(options.delay) : 50;
  if (!Number.isFinite(delay) || delay < 0) {
    console.error(`Error: --delay must be a non-negative number (got "${String(options.delay)}")`);
    process.exit(1);
  }
  const repeat = options.repeat !== undefined ? Number(options.repeat) : 1;
  if (!Number.isInteger(repeat) || repeat < 1) {
    console.error(`Error: --repeat must be a positive integer (got "${String(options.repeat)}")`);
    process.exit(1);
  }
  return { delay, repeat };
}

/** Flags `keyboard` understands. */
const KEYBOARD_FLAGS = allowedFlags("keyboard");

/**
 * Drive a keyboard sequence.
 *
 * Complements `press` (one key) and `type` (one string) rather than replacing
 * them: this is for ordered sequences, chords, and modifiers held across
 * several steps, which neither of those can express.
 */
export async function runKeyboard(
  browser: CBrowser,
  args: string[],
  options: Record<string, string | boolean>,
): Promise<void> {
  const unknown = Object.keys(options).filter((f) => !KEYBOARD_FLAGS.has(f));
  if (unknown.length > 0) {
    console.error(`Error: 'keyboard' does not support ${unknown.map((f) => `--${f}`).join(", ")}`);
    console.error(`  Supported: ${[...KEYBOARD_FLAGS].map((f) => `--${f}`).join(" ")}`);
    process.exit(1);
  }

  if (args.length === 0) {
    console.error('Usage: cbrowser keyboard "<key|chord|text>" ["<key|chord|text>" ...]');
    console.error("  Run 'cbrowser help keyboard' for options");
    process.exit(1);
  }

  const { delay, repeat } = parseKeyboardNumbers(options);

  const hold = typeof options.hold === "string"
    ? options.hold.split("+").map((m) => m.trim()).filter(Boolean)
    : [];
  for (const modifier of hold) {
    if (!KEYBOARD_MODIFIERS.includes(modifier)) {
      console.error(`Error: unknown --hold modifier "${modifier}"`);
      console.error(`  Valid modifiers: ${KEYBOARD_MODIFIERS.join(", ")}`);
      process.exit(1);
    }
  }

  // Parsed up-front so a bad token fails before any key reaches the page and
  // leaves the form half-filled.
  const literal = options.text === true;
  const steps = args.map((token) => parseKeyboardToken(token, literal));

  if (options.url) await browser.navigate(options.url as string);
  const page = await browser.getPage();

  if (typeof options.selector === "string") {
    const locator = await browser.resolveElementLocator(options.selector);
    if (!locator) {
      console.error(`✗ No element matched selector: ${options.selector}`);
      process.exit(1);
    }
    await locator.focus();
  }

  for (const modifier of hold) await page.keyboard.down(modifier);
  try {
    for (let pass = 0; pass < repeat; pass++) {
      for (const step of steps) {
        const refusal = await browser.keystrokeRedZone(step.kind === "text" ? { text: step.text } : { key: step.key }, options.force === true);
        if (refusal) {
          console.error(`✗ ${refusal}`);
          process.exitCode = 1;
          return;
        }
        if (step.kind === "text") {
          await page.keyboard.type(step.text, { delay: Math.min(delay, 50) });
        } else {
          await page.keyboard.press(step.key);
        }
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      }
    }
  } finally {
    // Released even if a step throws: a stuck modifier would corrupt every
    // later command in the same persistent session.
    for (const modifier of [...hold].reverse()) await page.keyboard.up(modifier);
  }

  const summary = steps
    .map((s) => (s.kind === "text" ? `"${s.text}"` : s.key))
    .join(" → ");
  console.log(`✓ Keyboard: ${summary}${repeat > 1 ? ` (x${repeat})` : ""}${hold.length > 0 ? ` holding ${hold.join("+")}` : ""}`);
}
