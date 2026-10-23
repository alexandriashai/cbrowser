/**
 * help-format.ts: a help answer as terminal text (see tests/cli-ask-output.test.ts
 * for the command end to end).
 */
import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { absoluteSiteUrl, formatAnswerForTerminal, sourceLines, sourcePath, sourceUrls } from "../src/help-format.js";

describe("absoluteSiteUrl", () => {
  test("a site path gets the origin and the trailing slash the site serves", () => {
    expect(absoluteSiteUrl("/docs/tool-screenshot")).toBe("https://cbrowser.ai/docs/tool-screenshot/");
    expect(absoluteSiteUrl("/docs/tool-screenshot/")).toBe("https://cbrowser.ai/docs/tool-screenshot/");
    expect(absoluteSiteUrl("/docs/devices#iphone")).toBe("https://cbrowser.ai/docs/devices/#iphone");
    expect(absoluteSiteUrl("/llms.txt")).toBe("https://cbrowser.ai/llms.txt");
  });
  test("absolute URLs and other schemes pass through", () => {
    expect(absoluteSiteUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(absoluteSiteUrl("mailto:hi@cbrowser.ai")).toBe("mailto:hi@cbrowser.ai");
  });
});

describe("formatAnswerForTerminal", () => {
  test("links read as words then the full link", () => {
    expect(formatAnswerForTerminal("See [the screenshot docs](/docs/tool-screenshot).")).toBe(
      "See the screenshot docs (https://cbrowser.ai/docs/tool-screenshot/).",
    );
    expect(formatAnswerForTerminal("[https://example.com](https://example.com)")).toBe("https://example.com");
  });

  test("a file path is not a site page", () => {
    const text = "Screenshots are saved to /tmp/shot.png and the profile to /home/user/.cbrowser";
    expect(formatAnswerForTerminal(text)).toBe(text);
  });

  test("a bare path the sources name is linked even outside /docs/", () => {
    expect(formatAnswerForTerminal("Read /automated-testing first.", ["/automated-testing"])).toBe(
      "Read https://cbrowser.ai/automated-testing/ first.",
    );
    expect(formatAnswerForTerminal("Read /automated-testing first.")).toBe("Read /automated-testing first.");
  });

  test("headings, emphasis and code markers go; identifiers keep their underscores", () => {
    const md = "## Setup\n\n**Run** `cbrowser screenshot --full-page` with *care*.\nPass _browserToken and __dirname.";
    expect(formatAnswerForTerminal(md)).toBe(
      "Setup\n\nRun cbrowser screenshot --full-page with care.\nPass _browserToken and __dirname.",
    );
  });

  test("code blocks lose their fences, keep their text and are indented", () => {
    expect(formatAnswerForTerminal("Run:\n```bash\ncbrowser ask \"**x**\"\n```\nDone.")).toBe(
      "Run:\n    cbrowser ask \"**x**\"\nDone.",
    );
  });

  test("lists keep a dash, numbered lists their numbers; table rulers go", () => {
    expect(formatAnswerForTerminal("* one\n+ two\n1) three\n| a | b |\n|---|---|\n| 1 | 2 |")).toBe(
      "  - one\n  - two\n  1. three\n| a | b |\n| 1 | 2 |",
    );
  });

  test("property: every /docs/ page comes out as a full link, however it was written", () => {
    const slug = fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/);
    const form = fc.constantFrom("bare", "code", "link");
    fc.assert(
      fc.property(fc.array(fc.tuple(slug, form), { minLength: 1, maxLength: 6 }), (items) => {
        const md = items
          .map(([s, f]) => (f === "bare" ? `see /docs/${s} now` : f === "code" ? `see \`/docs/${s}\` now` : `see [page](/docs/${s}) now`))
          .join("\n- ");
        const out = formatAnswerForTerminal(md);
        for (const [s] of items) expect(out).toContain(`https://cbrowser.ai/docs/${s}/`);
        expect(out).not.toMatch(/(^|[\s(["'])\/docs\//m);
        expect(out).not.toContain("`");
      }),
      { numRuns: 1000 },
    );
  });

  test("property: an absolute URL in the answer survives unchanged", () => {
    const url = fc.webUrl({ withQueryParameters: false, withFragments: false }).filter((u) => !/[()*_`[\]\\~]/.test(u));
    fc.assert(
      fc.property(url, (u) => {
        expect(formatAnswerForTerminal(`Open ${u} to start.`)).toBe(`Open ${u} to start.`);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("sources", () => {
  const sources = [
    "[/docs/tool-screenshot — full]: ...All Take a screenshot of the current page.",
    "[/docs/tool-screenshot — viewport]: ...the same page again",
    "[/automated-testing — full]: ...full automated testing lifecycle.",
    "Devices | docs\nmore",
  ];
  test("each page once, as a full link; a source with no page keeps its first line", () => {
    expect(sourceLines(sources)).toEqual([
      "https://cbrowser.ai/docs/tool-screenshot/",
      "https://cbrowser.ai/automated-testing/",
      "Devices | docs",
    ]);
  });
  test("sourcePath and sourceUrls", () => {
    expect(sourcePath(sources[0])).toBe("/docs/tool-screenshot");
    expect(sourcePath("Devices | docs")).toBeNull();
    expect(sourceUrls(sources)).toEqual(["https://cbrowser.ai/docs/tool-screenshot/", "https://cbrowser.ai/automated-testing/"]);
  });
});
