/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Test recording and export
 *
 * Recording actions as a test, and exporting results as JUnit or TAP.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { uniqueStamp } from "../temp-files.js";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Tier 2: Test Recording (v2.5.0)
// =========================================================================

export async function startRecording(this: CBrowser, url?: string): Promise<void> {
  this.isRecording = true;
  this.recordingActions = [];

  if (url) {
    await this.navigate(url);
    this.recordingActions.push({ type: "navigate", url, timestamp: Date.now() });
  }
}

export function saveRecording(this: CBrowser, name: string, actions?: Array<{ type: string; selector?: string; value?: string; url?: string; timestamp: number }>): string {
  const recordingsDir = join(this.paths.dataDir, "recordings");
  if (!existsSync(recordingsDir)) {
    mkdirSync(recordingsDir, { recursive: true });
  }

  const recording = {
    name,
    actions: actions || this.recordingActions,
    created: new Date().toISOString(),
  };

  const filePath = join(recordingsDir, `${name}.json`);
  writeFileSync(filePath, JSON.stringify(recording, null, 2));

  return filePath;
}

export function generateTestCode(this: CBrowser, name: string, actions: Array<{ type: string; selector?: string; value?: string; url?: string }>): string {
  let code = `// Generated test: ${name}\n\n`;
  code += `import { CBrowser } from 'cbrowser';\n\n`;
  code += `async function test_${name.replace(/[^a-zA-Z0-9]/g, "_")}() {\n`;
  code += `  const browser = new CBrowser();\n\n`;

  for (const action of actions) {
    switch (action.type) {
      case "navigate":
        code += `  await browser.navigate("${action.url}");\n`;
        break;
      case "click":
        code += `  await browser.click("${action.selector}");\n`;
        break;
      case "fill":
        code += `  await browser.fill("${action.selector}", "${action.value}");\n`;
        break;
    }
  }

  code += `\n  await browser.close();\n`;
  code += `}\n\n`;
  code += `test_${name.replace(/[^a-zA-Z0-9]/g, "_")}();\n`;

  return code;
}

// =========================================================================
// Tier 2: Test Export (v2.5.0)
// =========================================================================

export function exportJUnit(this: CBrowser, suite: { name: string; tests: Array<{ name: string; status: string; duration: number; error?: string }> }, outputPath?: string): string {
  const filename = outputPath || join(this.paths.dataDir, `junit-${uniqueStamp()}.xml`);

  // Names and errors are page and test-file text: escaped, or a test named
  // "Search & filter" wrote XML no CI parser accepts. A failed test is a
  // failure with or without an error message; it used to pass without one.
  const esc = (text: string): string =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const failures = suite.tests.filter((t) => t.status === "failed").length;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<testsuite name="${esc(suite.name)}" tests="${suite.tests.length}" failures="${failures}">\n`;

  for (const test of suite.tests) {
    xml += `  <testcase name="${esc(test.name)}" time="${(test.duration / 1000).toFixed(3)}">\n`;
    if (test.status === "failed") {
      const message = test.error || "failed";
      xml += `    <failure message="${esc(message)}">${esc(message)}</failure>\n`;
    }
    xml += `  </testcase>\n`;
  }

  xml += `</testsuite>\n`;
  writeFileSync(filename, xml);

  return filename;
}

export function exportTAP(this: CBrowser, suite: { name: string; tests: Array<{ name: string; status: string; error?: string }> }, outputPath?: string): string {
  const filename = outputPath || join(this.paths.dataDir, `tap-${uniqueStamp()}.tap`);

  let tap = `TAP version 13\n`;
  tap += `1..${suite.tests.length}\n`;

  suite.tests.forEach((test, i) => {
    const status = test.status === "passed" ? "ok" : "not ok";
    // One line per test, and a "#" in a name is not read as a directive.
    tap += `${status} ${i + 1} ${test.name.replace(/[\r\n]+/g, " ").replace(/#/g, "\\#")}\n`;
  });

  writeFileSync(filename, tap);
  return filename;
}
