#!/usr/bin/env node
/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * CBrowser CLI
 *
 * AI-powered browser automation from the command line.
 */

import { main } from "./cli/main.js";
import { getOutputOptions, type JsonOutput, emitJson } from "./output.js";
import { VERSION } from "./version.js";

main().catch((error) => {
  const opts = getOutputOptions();

  if (opts.json) {
    const jsonError: JsonOutput = {
      success: false,
      command: process.argv[2] || "unknown",
      error: {
        code: error.code || "E999",
        message: error.message,
        howToFix: error.howToFix,
        docUrl: error.docUrl,
      },
      meta: { version: VERSION },
    };
    emitJson(jsonError);
    process.exit(1);
  }

  // Enriched error output with remediation guidance
  if (error.howToFix) {
    console.error("");
    console.error(opts.plain ? `Error [${error.code}]: ${error.message}` : `❌ Error [${error.code}]: ${error.message}`);
    console.error("");
    console.error(opts.plain ? `How to fix: ${error.howToFix}` : `💡 How to fix: ${error.howToFix}`);
    if (error.docUrl) {
      console.error(opts.plain ? `Docs: ${error.docUrl}` : `📚 Docs: ${error.docUrl}`);
    }
    console.error("");
  } else {
    console.error("Error:", error.message);
  }
  process.exit(1);
});
