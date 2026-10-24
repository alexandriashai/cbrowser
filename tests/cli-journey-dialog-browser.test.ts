/**
 * `cbrowser cognitive-journey` prints the persona's dialog as each step runs
 * (Alexa, 2026-10-23: "i want the dialog returned during a cli cognitive
 * journey"). Before, it overwrote one line, "Step N: <phase> (<mood>)", and a
 * step whose model reply could not be read was labelled "evaluate".
 *
 * No model is called. A journey on a local page is run once through the
 * library with a scripted decision provider and recorded as a trace; the CLI
 * then replays that trace (a replay needs no API key) against the same page,
 * so its printed dialog is the CLI's real output path.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");
const GOAL = "find the price of the pro plan";
const PAGES: Record<string, string> = {
  "/": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Home</title></head>
<body><header><nav><a href="/pricing">Pricing</a> <a href="/help">Help</a></nav></header>
<main><h1>Welcome</h1><p>Tools for testing your site.</p></main></body></html>`,
  "/pricing": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Pricing</title></head>
<body><main><h1>Pricing</h1><p>Pro plan: $20 per month.</p></main></body></html>`,
};

// What the scripted "model" answers at each step: a readable decision, then
// an unreadable reply (cut off mid-JSON), then the goal found.
const REPLIES: Record<number, string> = {
  1: JSON.stringify({
    phase: "decide", monologue: "I want the price. There's a Pricing link at the top.",
    action: "click:Pricing", actionTarget: "the Pricing link", goalProgress: 0.3, mood: "hopeful",
    goalAchieved: false, newConfusion: 0.1, newFrustration: 0.05,
  }),
  2: '{"phase": "comprehend", "monologue": "This page lists',
  3: JSON.stringify({
    phase: "evaluate", monologue: "There it is: the pro plan is $20 per month.",
    action: null, goalProgress: 1, mood: "relieved", goalAchieved: true, goalEvidence: "Pro plan: $20 per month.",
  }),
};

let server: ReturnType<typeof Bun.serve>;
let dataDir = "";
let tracePath = "";
let url = "";

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    fetch: (req) => {
      const page = PAGES[new URL(req.url).pathname];
      return page ? new Response(page, { headers: { "content-type": "text/html" } }) : new Response("not found", { status: 404 });
    },
  });
  url = `http://127.0.0.1:${server.port}/`;
  dataDir = mkdtempSync(join(tmpdir(), "cb-journey-dialog-"));
  process.env.CBROWSER_DATA_DIR = dataDir;
  const { runCognitiveJourney } = await import("../src/cognitive/index.js");
  const result = await runCognitiveJourney({
    persona: "first-timer", goal: GOAL, startUrl: url, maxSteps: 3, headless: true,
    persistent: false, vision: false, trace: true,
    decisionProvider: {
      decide: async (ctx) =>
        ctx.stepIndex === -1 ? JSON.stringify({ achieved: true, evidence: "Pro plan: $20 per month." }) : (REPLIES[ctx.stepIndex] ?? REPLIES[3]),
    },
  });
  tracePath = String(result.tracePath);
}, 240_000);

afterAll(() => {
  server?.stop(true);
  rmSync(dataDir, { recursive: true, force: true });
});

async function runCli(extraEnv: Record<string, string> = {}): Promise<{ stdout: string; code: number }> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>), CBROWSER_DATA_DIR: dataDir, NO_COLOR: "1", ...extraEnv };
  delete env.ANTHROPIC_API_KEY;
  if (!("CBROWSER_HYPERLINKS" in extraEnv)) delete env.CBROWSER_HYPERLINKS;
  const proc = Bun.spawn(
    ["bun", "run", CLI, "cognitive-journey", "--start", url, "--goal", GOAL, "--persona", "first-timer",
      "--max-steps", "3", "--no-vision", "--replay-trace", tracePath],
    { stdout: "pipe", stderr: "pipe", env },
  );
  const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return { stdout, code };
}

describe("cbrowser cognitive-journey prints the dialog", () => {
  let out = "";
  beforeAll(async () => { out = (await runCli()).stdout; }, 240_000);

  test("each step prints the persona's words and what it did", () => {
    expect(out).toContain("Step 1 · decide · hopeful");
    expect(out).toContain('💭 "I want the price. There\'s a Pricing link at the top."');
    expect(out).toContain("→ click: the Pricing link");
    expect(out).toContain('💭 "There it is: the pro plan is $20 per month."');
  });

  test("an unreadable reply is named instead of passing as an 'evaluate' step", () => {
    // 20.1.2: the line also says why (here, the reply was cut off mid-object).
    expect(out).toMatch(/Step 2: the model's reply could not be read \(the reply was not a JSON object \(.+\); it began: \{"phase": "comprehend".*\), so this step took no action/);
    expect(out).not.toMatch(/Step 2: evaluate/);
  });

  test("no step is drawn over the previous one with a carriage return", () => {
    expect(out).not.toContain("\r   Step");
  });

  test("each step names its page as a full URL alone at the end of a line", () => {
    expect(out).toContain(`\n   🔗 ${url}\n`);
    expect(out).toContain(`\n   🔗 ${url}pricing\n`);
  });

  test("piped output carries no hyperlink escapes", () => {
    expect(out).not.toContain(String.fromCharCode(27));
  });
});

describe("on a terminal (forced with CBROWSER_HYPERLINKS=1)", () => {
  test("each page URL is an OSC 8 hyperlink to itself", async () => {
    const ESC = String.fromCharCode(27);
    const linked = (u: string) => `${ESC}]8;;${u}${ESC}\\${u}${ESC}]8;;${ESC}\\`;
    const { stdout } = await runCli({ CBROWSER_HYPERLINKS: "1" });
    expect(stdout).toContain(`   🔗 ${linked(url)}\n`);
    expect(stdout).toContain(`   🔗 ${linked(`${url}pricing`)}\n`);
  }, 240_000);
});
