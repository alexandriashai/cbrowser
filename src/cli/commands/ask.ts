/**
 * ask: product help from the CBrowser docs. No browser.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { getOutputOptions } from "../../output.js";
import { printData } from "../format.js";
import type { PreBrowserContext } from "../context.js";

// ask: product help from the CBrowser docs (src/help-client.ts). No browser.
export async function runAskCommand(ctx: PreBrowserContext): Promise<void> {
  const { args, options } = ctx;
  const question = args.join(" ").trim();
  if (!question) {
    console.error('Usage: cbrowser ask "<question>" [--context <text>] [--json]');
    console.error('  e.g. cbrowser ask "How do I test my site on an iPhone?"');
    process.exit(1);
  }
  const { askCbrowser } = await import("../../help-client.js");
  const { formatAnswerForTerminal, sourceLines, sourcePath, sourceUrls } = await import("../../help-format.js");
  try {
    const r = await askCbrowser(question, { context: typeof options.context === "string" ? options.context : undefined });
    if (options.json === true || getOutputOptions().json) {
      // The answer stays as the service sent it (markdown); the links are added beside it.
      printData("ask", { question: r.question, answer: r.answer, sources: r.sources, sourceUrls: sourceUrls(r.sources) });
    } else {
      // A terminal gets plain text and full links (help-format.ts).
      const known = r.sources.map(sourcePath).filter((p): p is string => p !== null);
      console.log(formatAnswerForTerminal(r.answer, known));
      const lines = sourceLines(r.sources);
      if (lines.length > 0) {
        console.log("\nSources:");
        for (const line of lines) console.log(`  - ${line}`);
      }
    }
    process.exit(0);
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }
}
