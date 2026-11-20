/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Console capture
 *
 * The per-tab console ring buffer.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import type { Page } from "playwright";
import type { CapturedConsoleMessage } from "../types.js";
import { releaseConsoleArgs } from "../console-handles.js";
import { copyString, capUtf8, MAX_URL_BYTES } from "./helpers.js";
import type { CBrowser } from "../browser.js";

const CONSOLE_BUFFER_CAP = 500;
const CONSOLE_TEXT_CAP = 2000;

// =========================================================================
// Console Capture (v8 B27)
// =========================================================================

export function attachConsoleCapture(this: CBrowser, page: Page): void {
  if (this.consoleBuffers.has(page)) return;
  const buffer: { entries: Array<{ seq: number; msg: CapturedConsoleMessage }>; dropped: number } = { entries: [], dropped: 0 };
  this.consoleBuffers.set(page, buffer);
  const push = (msg: CapturedConsoleMessage): void => {
    if (msg.text.length > CONSOLE_TEXT_CAP) {
      const extra = msg.text.length - CONSOLE_TEXT_CAP;
      // copyString, not a bare slice: V8 keeps a slice as a view of the
      // whole message, so a 2,000-character entry held a 10 MB log line
      // alive and the 500-entry cap bounded nothing.
      msg.text = `${copyString(msg.text.slice(0, CONSOLE_TEXT_CAP))}... [${extra} more characters]`;
    }
    if (msg.url !== undefined) msg.url = capUtf8(msg.url, MAX_URL_BYTES).text;
    if (msg.pageUrl !== undefined) msg.pageUrl = capUtf8(msg.pageUrl, MAX_URL_BYTES).text;
    buffer.entries.push({ seq: ++this.consoleSeq, msg });
    if (buffer.entries.length > CONSOLE_BUFFER_CAP) {
      buffer.entries.shift();
      buffer.dropped++;
    }
  };
  const pageUrl = (): string => {
    try { return page.url(); } catch { return ""; }
  };
  page.on("console", (m) => {
    let loc: { url: string; lineNumber: number } | undefined;
    try { loc = m.location(); } catch { /* no location */ }
    push({
      type: m.type(),
      text: m.text(),
      timestamp: Date.now(),
      source: "console",
      // For "Failed to load resource" Chrome puts the failed resource here,
      // not in the text (same finding as hunt_bugs v5 B24).
      ...(loc?.url ? { url: loc.url, lineNumber: loc.lineNumber } : {}),
      pageUrl: pageUrl(),
    });
    releaseConsoleArgs(m);
  });
  page.on("pageerror", (err) => {
    push({
      type: "error",
      text: `${err.name || "Error"}: ${err.message}`,
      timestamp: Date.now(),
      source: "pageerror",
      pageUrl: pageUrl(),
    });
  });
}

export function clearConsoleMessages(this: CBrowser): void {
  const buffer = this.page ? this.consoleBuffers.get(this.page) : undefined;
  if (buffer) {
    buffer.entries = [];
    buffer.dropped = 0;
  }
}
