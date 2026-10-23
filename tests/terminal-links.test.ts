/**
 * Clickable URLs in CLI output (src/terminal-safe.ts linkUrls).
 *
 * Alexa, 2026-10-23: "i want the link clickable from cli", for the journey's
 * page lines and for `cbrowser ask` answers. On a terminal the output guard
 * makes every http(s) URL an OSC 8 hyperlink whose target is exactly the text
 * shown. The guard still escapes every control character first, so the only
 * escapes in its output are the two OSC 8 markers around a URL.
 */
import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { linkUrls, terminalSafe } from "../src/terminal-safe.js";
import { formatAnswerForTerminal } from "../src/help-format.js";

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const open = (url: string) => `${ESC}]8;;${url}${ESC}\\`;
const CLOSE = `${ESC}]8;;${ESC}\\`;
const link = (url: string) => `${open(url)}${url}${CLOSE}`;

// Matches one OSC 8 pair: its target, then its visible text.
const PAIR = new RegExp(`${ESC}\\]8;;([^${ESC}]*)${ESC}\\\\(.*?)${ESC}\\]8;;${ESC}\\\\`, "gs");
const UNSAFE = new RegExp(
  "[" + [[0, 8], [11, 31], [127, 159], [0x202a, 0x202e], [0x2066, 0x2069]]
    .map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join("") + "]",
);

describe("linkUrls", () => {
  test("a URL becomes a link to itself", () => {
    expect(linkUrls("Docs: https://cbrowser.ai/docs/ask/")).toBe(`Docs: ${link("https://cbrowser.ai/docs/ask/")}`);
  });

  test("sentence punctuation after a URL stays outside it", () => {
    expect(linkUrls("See https://cbrowser.ai/docs/ask/.")).toBe(`See ${link("https://cbrowser.ai/docs/ask/")}.`);
  });

  test("a closing bracket the URL did not open stays outside it", () => {
    expect(linkUrls("the docs (https://cbrowser.ai/docs/ask/).")).toBe(`the docs (${link("https://cbrowser.ai/docs/ask/")}).`);
  });

  test("a bracket the URL opened stays inside it", () => {
    const url = "https://en.wikipedia.org/wiki/Fitts%27s_law_(HCI)";
    expect(linkUrls(`read ${url}`)).toBe(`read ${link(url)}`);
  });

  test("text without a URL, and a bare scheme, are unchanged", () => {
    expect(linkUrls("no links here: /docs/ask and https://")).toBe("no links here: /docs/ask and https://");
  });
});

describe("terminalSafe with links", () => {
  test("off by default: output is exactly as before", () => {
    expect(terminalSafe("https://cbrowser.ai/")).toBe("https://cbrowser.ai/");
  });

  test("a page's escape sequence after a URL is escaped and stays out of the link", () => {
    const out = terminalSafe(`https://evil.example/${ESC}]52;c;eA==${BEL}`, true);
    expect(out).toBe(`${link("https://evil.example/")}\\x1b]52;c;eA==\\u0007`);
  });

  test("property: links add no visible text, each target equals its text, and nothing else is a control character", () => {
    const piece = fc.oneof(
      fc.string({ unit: "binary", maxLength: 40 }),
      fc.webUrl({ withQueryParameters: true, withFragments: true }),
      fc.constantFrom(" ", ".", ")", "(", "\n", ESC, BEL, "\\"),
    );
    fc.assert(fc.property(fc.array(piece, { maxLength: 12 }), (parts) => {
      const s = parts.join("");
      const out = terminalSafe(s, true);
      for (const m of out.matchAll(PAIR)) {
        const [, target, text] = m;
        if (target !== text) return false;
        if (!/^https?:\/\/\S+$/.test(target) || UNSAFE.test(target)) return false;
      }
      const shown = out.replace(PAIR, (_m, _t, text: string) => text);
      if (shown !== terminalSafe(s, false)) return false;
      const body = shown.startsWith("\r") ? shown.slice(1) : shown;
      return !UNSAFE.test(body);
    }), { numRuns: 1000 });
  });
});

describe("cbrowser ask answers", () => {
  test("a markdown link prints as a clickable full URL with its bracket outside", () => {
    const text = formatAnswerForTerminal("See [the screenshot docs](/docs/tool-screenshot).");
    expect(terminalSafe(text, true)).toBe(`See the screenshot docs (${link("https://cbrowser.ai/docs/tool-screenshot/")}).`);
  });

  test("a bare site path in an answer becomes a clickable full URL", () => {
    const text = formatAnswerForTerminal("Start at /docs/getting-started for setup.");
    expect(terminalSafe(text, true)).toBe(`Start at ${link("https://cbrowser.ai/docs/getting-started/")} for setup.`);
  });
});
