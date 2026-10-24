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
 * no colours or control sequences of its own; the intended controls are the
 * carriage return that starts a progress line, which is kept when it is the first
 * character of a write, and the hyperlinks below.
 *
 * Hyperlinks (OSC 8), on a terminal only: every http(s) URL in a write becomes a
 * link whose target is exactly the text shown, so text from a page cannot make a
 * link that reads one way and goes another. That is what a terminal's own URL
 * detection does, but the link survives a wrapped line and a closing bracket
 * (Alexa, 2026-10-23: "i want the link clickable from cli"). Links are added after
 * escaping, so a URL holds no control character and the only escapes in the
 * output are the two OSC 8 markers around it.
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

export function terminalSafe(text: string, links = false): string {
  const lead = text.startsWith("\r") ? "\r" : "";
  return lead + splitOwnLinks(lead ? text.slice(1) : text).map((part) => {
    if (part.link !== undefined) return links ? `${OSC8(part.link)}${part.link}${OSC8("")}` : part.link;
    const safe = part.text.replace(UNSAFE, visible);
    return links ? linkUrls(safe) : safe;
  }).join("");
}

// A URL runs until whitespace, a quote, an angle or square bracket, a brace, a
// backslash (which starts an escape written above) or an invisible format character.
const URL_TOKEN = /https?:\/\/[^\s"'<>`{}|\\^[\]\u200b-\u200f\u2028\u2029\ufeff]+/g;
const OSC8 = (target: string) => `\u001b]8;;${target}\u001b\\`;

const ESC = String.fromCharCode(27);
const ST = `${ESC}\\`;
const LINK_OPEN = `${ESC}]8;;`;
const LINK_TARGET = new RegExp(`^(?:${URL_TOKEN.source})$`);

type Part = { link: string } | { link?: undefined; text: string };

/**
 * Text split into plain runs and the links linkUrls writes: an OSC 8 link whose
 * target is a URL with no control character or space and whose text is that
 * same URL. Under Node, console.log reaches process.stdout.write, so one line
 * passes guardConsole and then guardTerminalOutput, and in 20.2.0 the second
 * pass escaped the first one's links: a journey printed "\x1b]8;;" before every
 * URL (2026-10-23). Kept whole, a link passes any number of guards unchanged.
 * Any other escape, a link that reads one way and goes another included, is
 * still escaped.
 */
function splitOwnLinks(text: string): Part[] {
  const parts: Part[] = [];
  const close = OSC8("");
  let plainFrom = 0;
  let at = text.indexOf(LINK_OPEN);
  while (at !== -1) {
    const targetEnd = text.indexOf(ST, at + LINK_OPEN.length);
    if (targetEnd === -1) break;
    const target = text.slice(at + LINK_OPEN.length, targetEnd);
    const textEnd = targetEnd + ST.length + target.length;
    const ours = LINK_TARGET.test(target) && target.search(UNSAFE) === -1
      && text.slice(targetEnd + ST.length, textEnd) === target && text.startsWith(close, textEnd);
    if (ours) {
      if (at > plainFrom) parts.push({ text: text.slice(plainFrom, at) });
      parts.push({ link: target });
      plainFrom = textEnd + close.length;
      at = text.indexOf(LINK_OPEN, plainFrom);
    } else {
      at = text.indexOf(LINK_OPEN, at + LINK_OPEN.length);
    }
  }
  if (plainFrom < text.length || parts.length === 0) parts.push({ text: text.slice(plainFrom) });
  return parts;
}

const count = (s: string, c: string) => s.split(c).length - 1;

/**
 * Every http(s) URL in already-escaped text as an OSC 8 link to itself. Sentence
 * punctuation after a URL stays outside it, and so does a ")" the URL did not open.
 */
export function linkUrls(text: string): string {
  return text.replace(URL_TOKEN, (match) => {
    let url = match;
    let tail = "";
    while (/[.,;:!?)]$/.test(url)) {
      const last = url[url.length - 1];
      if (last === ")" && count(url, "(") >= count(url, ")")) break;
      tail = last + tail;
      url = url.slice(0, -1);
    }
    if (!/^https?:\/\/[^/?#]/.test(url)) return match;
    return `${OSC8(url)}${url}${OSC8("")}${tail}`;
  });
}

/** Which streams get hyperlinks. Off until the CLI decides each is a terminal. */
const linkStreams = { stdout: false, stderr: false };

export function setTerminalHyperlinks(on: { stdout: boolean; stderr: boolean }): void {
  linkStreams.stdout = on.stdout;
  linkStreams.stderr = on.stderr;
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
    const stream = method === "warn" || method === "error" ? "stderr" : "stdout";
    console[method] = (...args: unknown[]) => original(terminalSafe(format(...args), linkStreams[stream]));
  }
}

/** Route every string written to a stream through terminalSafe. Buffers pass as they are. */
export function guardTerminalOutput(stream: NodeJS.WriteStream): void {
  const write = stream.write.bind(stream) as (...args: unknown[]) => boolean;
  const name = (stream as { fd?: number }).fd === 2 ? "stderr" : "stdout";
  stream.write = ((chunk: unknown, ...rest: unknown[]) =>
    write(typeof chunk === "string" ? terminalSafe(chunk, linkStreams[name]) : chunk, ...rest)) as typeof stream.write;
}
