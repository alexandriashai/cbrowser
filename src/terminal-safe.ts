/**
 * Terminal-safe output for the CLI.
 *
 * The CLI prints page-derived text in many places: console messages, titles,
 * extracted text, link labels. Printed raw, a page could log ANSI/OSC escape
 * sequences that set the terminal title, write the clipboard (OSC 52), clear the
 * screen or move the cursor to hide or forge output, and Unicode bidi overrides
 * that reorder what is displayed (push review of 0ee2c27, 2026-10-12).
 *
 * terminalSafe() turns every such character into a visible escape. The CLI writes
 * no colours or control sequences of its own; the one intended control is the
 * carriage return that starts a progress line, which is kept when it is the first
 * character of a write.
 */
import { format } from "node:util";

// C0 controls except tab and newline, DEL, C1 controls, and the bidi embedding,
// override and isolate controls. Matching control characters is the point here.
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202A-\u202E\u2066-\u2069]/g;

const visible = (c: string): string =>
  c === "\u001b" ? "\\x1b"
    : c === "\r" ? "\\r"
      : `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;

export function terminalSafe(text: string): string {
  if (text.startsWith("\r")) return "\r" + text.slice(1).replace(UNSAFE, visible);
  return text.replace(UNSAFE, visible);
}

/**
 * Route console output through terminalSafe. Under Bun, console.log writes to the
 * file descriptor directly and never reaches process.stdout.write, so the stream
 * guard alone does not cover it. Install after any other console wrapper, so this
 * one is outermost: it formats the arguments as console.log would and passes one
 * safe string on.
 */
export function guardConsole(): void {
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => original(terminalSafe(format(...args)));
  }
}

/** Route every string written to a stream through terminalSafe. Buffers pass as they are. */
export function guardTerminalOutput(stream: NodeJS.WriteStream): void {
  const write = stream.write.bind(stream) as (...args: unknown[]) => boolean;
  stream.write = ((chunk: unknown, ...rest: unknown[]) =>
    write(typeof chunk === "string" ? terminalSafe(chunk) : chunk, ...rest)) as typeof stream.write;
}
