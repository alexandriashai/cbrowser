/**
 * `cbrowser ask` prints for a terminal (Alexa, 2026-10-23: "the cbrowser ask
 * cli command should return text in a readable format for cli, not MD. it
 * should also give full links - not relative paths").
 *
 * The help service answers in markdown with site-relative links, because the
 * question_answer MCP tool hands the same answer to clients that render
 * markdown. The CLI printed it verbatim: `**bold**`, backticks, and paths
 * like /docs/tool-screenshot that a terminal cannot open. The fixture is a
 * real answer from the public endpoint. Every server here is a local stub.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");
const FIXTURE = JSON.parse(readFileSync(resolve(import.meta.dir, "fixtures", "ask-answer-markdown.json"), "utf-8")) as {
  answer: string;
  sources: string[];
};

async function ask(reply: { answer: string; sources: string[] }, extra: string[] = [], extraEnv: Record<string, string> = {}) {
  const server = Bun.serve({ port: 0, fetch: () => Response.json(reply) });
  try {
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      CBROWSER_HELP_URL: `http://127.0.0.1:${server.port}/cms/api/ai/question`,
      CBROWSER_DATA_DIR: mkdtempSync(join(tmpdir(), "cb-ask-")),
      NO_COLOR: "1",
      ...extraEnv,
    };
    delete env.CMS_URL;
    if (!("CBROWSER_HYPERLINKS" in extraEnv)) delete env.CBROWSER_HYPERLINKS;
    const proc = Bun.spawn(["bun", "run", CLI, "ask", "how do I take a full page screenshot", ...extra], {
      stdout: "pipe", stderr: "pipe", env,
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
    ]);
    return { stdout, stderr, code };
  } finally {
    server.stop(true);
  }
}

describe("cbrowser ask prints terminal text", () => {
  test("no markdown markup reaches the terminal", async () => {
    const { stdout, code } = await ask(FIXTURE);
    expect(code).toBe(0);
    expect(stdout).not.toContain("**");
    expect(stdout).not.toContain("`");
    expect(stdout).toContain("you can take a screenshot using the screenshot tool.");
    // A leading underscore in an identifier is not emphasis.
    expect(stdout).toContain("_browserToken");
  });

  test("every site path is a full link, with the trailing slash the site serves", async () => {
    const { stdout } = await ask(FIXTURE);
    expect(stdout).toContain("https://cbrowser.ai/docs/tool-screenshot/");
    expect(stdout).toContain("https://cbrowser.ai/docs/tool-visual-baseline/");
    expect(stdout).toContain("https://cbrowser.ai/automated-testing/");
    // No path is left relative: every "/docs/..." sits inside a full URL.
    for (const line of stdout.split("\n")) {
      expect(line).not.toMatch(/(^|[\s(\[])\/docs\//);
    }
  });

  test("sources print as one link each, without the index's page-chrome snippet", async () => {
    const { stdout } = await ask(FIXTURE);
    const sources = stdout.split("\nSources:\n")[1] ?? "";
    expect(sources.trimEnd().split("\n")).toEqual([
      "  - https://cbrowser.ai/docs/tool-screenshot/",
      "  - https://cbrowser.ai/docs/natural-language-tests/",
      "  - https://cbrowser.ai/docs/tool-visual-baseline/",
      "  - https://cbrowser.ai/docs/tool-transport-map/",
      "  - https://cbrowser.ai/automated-testing/",
    ]);
  });

  test("--json keeps the service's answer as sent and adds full source links", async () => {
    const { stdout, code } = await ask(FIXTURE, ["--json"]);
    expect(code).toBe(0);
    const out = JSON.parse(stdout) as { data?: Record<string, unknown> } & Record<string, unknown>;
    const data = (out.data ?? out) as { answer: string; sources: string[]; sourceUrls: string[] };
    expect(data.answer).toBe(FIXTURE.answer);
    expect(data.sources).toEqual(FIXTURE.sources);
    expect(data.sourceUrls[0]).toBe("https://cbrowser.ai/docs/tool-screenshot/");
  });
});

describe("cbrowser ask links are clickable (Alexa, 2026-10-23)", () => {
  const ESC = String.fromCharCode(27);
  const linked = (u: string) => `${ESC}]8;;${u}${ESC}\\${u}${ESC}]8;;${ESC}\\`;

  test("on a terminal every printed URL, in the answer and the sources, is a hyperlink to itself", async () => {
    const { stdout, code } = await ask(FIXTURE, [], { CBROWSER_HYPERLINKS: "1" });
    expect(code).toBe(0);
    expect(stdout).toContain(linked("https://cbrowser.ai/docs/tool-screenshot/"));
    expect(stdout).toContain(`  - ${linked("https://cbrowser.ai/automated-testing/")}`);
    // Outside the links nothing changes: removing them gives the plain output.
    const plain = (await ask(FIXTURE)).stdout;
    const shown = stdout.replace(new RegExp(`${ESC}\\]8;;[^${ESC}]*${ESC}\\\\`, "g"), "");
    expect(shown).toBe(plain);
  });

  test("piped output, and --json even when forced, carry no escape", async () => {
    expect((await ask(FIXTURE)).stdout).not.toContain(ESC);
    expect((await ask(FIXTURE, ["--json"], { CBROWSER_HYPERLINKS: "1" })).stdout).not.toContain(ESC);
  });

  test("CBROWSER_HYPERLINKS=0 turns them off", async () => {
    expect((await ask(FIXTURE, [], { CBROWSER_HYPERLINKS: "0" })).stdout).not.toContain(ESC);
  });
});
