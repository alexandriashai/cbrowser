/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Saved test-suite results, the input of `cbrowser export junit|tap`.
 *
 * export read <dataDir>/results/<name>.json and nothing wrote that directory,
 * so every export answered "Test results not found" (audit O17, 2026-10-21).
 * test-suite now saves each run there, under a file-safe form of the suite
 * name; export takes either the suite name or that form.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { NLTestSuiteResult } from "../types.js";

/** The suite name as a file name: letters, digits, _ and -, nothing that leaves the directory. */
export function resultsName(name: string): string {
  return name.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "suite";
}

export function resultsPath(dataDir: string, name: string): string {
  return join(dataDir, "results", `${resultsName(name)}.json`);
}

/** Save a run, replacing the suite's previous one. Returns the path. */
export function saveSuiteResult(dataDir: string, result: NLTestSuiteResult): string {
  const path = resultsPath(dataDir, result.name);
  mkdirSync(join(dataDir, "results"), { recursive: true });
  writeFileSync(path, JSON.stringify(result, null, 2));
  return path;
}

/** The shape the JUnit and TAP exporters take. */
export interface ExportSuite {
  name: string;
  tests: Array<{ name: string; status: string; duration: number; error?: string }>;
}

/**
 * Load a saved run for export, or null when there is none. Reads what
 * test-suite saves, and also a file already in the exporters' own shape.
 */
export function loadSuiteForExport(dataDir: string, name: string): ExportSuite | null {
  const path = resultsPath(dataDir, name);
  if (!existsSync(path)) return null;
  const saved = JSON.parse(readFileSync(path, "utf-8")) as Partial<NLTestSuiteResult> & Partial<ExportSuite>;
  if (Array.isArray(saved.testResults)) {
    return {
      name: saved.name ?? name,
      tests: saved.testResults.map((t) => ({
        name: t.name,
        status: t.passed ? "passed" : "failed",
        duration: t.duration,
        ...(t.error ? { error: t.error } : {}),
      })),
    };
  }
  if (Array.isArray(saved.tests)) return { name: saved.name ?? name, tests: saved.tests };
  return null;
}
