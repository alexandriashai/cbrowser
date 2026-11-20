/**
 * Small output helpers shared by several commands.
 *
 * Split out of src/cli.ts (2026-11-20); the code moved without changes.
 */

import { VERSION } from "../version.js";
import { getOutputOptions, emitJson } from "../output.js";

/** Escape a string for safe use inside a RegExp. */
/**
 * Print a command result that is data. Under --json-output it becomes the
 * envelope's `data`, untouched; otherwise pretty JSON on stdout. Before 20.0
 * extract went through the text capture, which stored its JSON as text lines
 * (audit 2026-10-21).
 */
export function printData(command: string, data: unknown): void {
  if (getOutputOptions().json) {
    emitJson({ success: true, command, data, meta: { version: VERSION } });
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
