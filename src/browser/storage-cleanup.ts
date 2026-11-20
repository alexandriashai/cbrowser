/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Cleanup
 *
 * Cleaning up and measuring the data directory.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import { existsSync, readdirSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import type { CleanupOptions, CleanupResult } from "../types.js";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Cleanup
// =========================================================================

export function cleanup(this: CBrowser, options: CleanupOptions = {}): CleanupResult {
  const {
    dryRun = false,
    olderThan = 7,
    keepScreenshots = 10,
    keepJourneys = 5,
    keepSessions = 3,
  } = options;

  const result: CleanupResult = {
    deleted: 0,
    freedBytes: 0,
    details: {
      screenshots: { deleted: 0, freed: 0 },
      journeys: { deleted: 0, freed: 0 },
      sessions: { deleted: 0, freed: 0 },
      audit: { deleted: 0, freed: 0 },
    },
  };

  const cleanDir = (
    dir: string,
    pattern: RegExp,
    keep: number,
    category: keyof CleanupResult["details"]
  ) => {
    if (!existsSync(dir)) return;

    const files = readdirSync(dir)
      .filter((f) => pattern.test(f))
      .map((f) => ({
        name: f,
        path: join(dir, f),
        mtime: statSync(join(dir, f)).mtime,
        size: statSync(join(dir, f)).size,
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    const cutoff = Date.now() - olderThan * 24 * 60 * 60 * 1000;
    const toDelete = files.slice(keep).filter((f) => f.mtime.getTime() < cutoff);

    for (const file of toDelete) {
      if (!dryRun) {
        unlinkSync(file.path);
      }
      result.deleted++;
      result.freedBytes += file.size;
      result.details[category].deleted++;
      result.details[category].freed += file.size;
    }
  };

  cleanDir(this.paths.screenshotsDir, /\.png$/i, keepScreenshots, "screenshots");
  cleanDir(this.paths.dataDir, /^journey-.*\.json$/i, keepJourneys, "journeys");
  cleanDir(this.paths.sessionsDir, /\.json$/i, keepSessions, "sessions");
  cleanDir(this.paths.auditDir, /\.json$/i, 30, "audit");

  return result;
}

export function getStorageStats(this: CBrowser): Record<string, { count: number; size: number }> {
  const stats: Record<string, { count: number; size: number }> = {};

  const countDir = (dir: string, pattern: RegExp): { count: number; size: number } => {
    if (!existsSync(dir)) return { count: 0, size: 0 };

    const files = readdirSync(dir).filter((f) => pattern.test(f));
    let size = 0;
    for (const file of files) {
      size += statSync(join(dir, file)).size;
    }
    return { count: files.length, size };
  };

  stats.screenshots = countDir(this.paths.screenshotsDir, /\.png$/i);
  stats.journeys = countDir(this.paths.dataDir, /^journey-.*\.json$/i);
  stats.sessions = countDir(this.paths.sessionsDir, /\.json$/i);
  stats.audit = countDir(this.paths.auditDir, /\.json$/i);

  return stats;
}
