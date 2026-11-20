/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Visual regression
 *
 * Screenshot baselines.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from "fs";
import { join } from "path";
import { uniqueStamp } from "../temp-files.js";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Tier 2: Visual Regression (v2.5.0)
// =========================================================================

export async function saveBaseline(this: CBrowser, name: string, url?: string): Promise<string> {
  const baselinesDir = join(this.paths.dataDir, "baselines");
  if (!existsSync(baselinesDir)) {
    mkdirSync(baselinesDir, { recursive: true });
  }

  const page = await this.getPage();
  const screenshotPath = join(baselinesDir, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const baseline = {
    name,
    url: url || page.url(),
    viewport: page.viewportSize() || { width: 1280, height: 800 },
    screenshotPath,
    created: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
  };

  const metaPath = join(baselinesDir, `${name}.json`);
  writeFileSync(metaPath, JSON.stringify(baseline, null, 2));

  return screenshotPath;
}

export async function compareBaseline(this: CBrowser, name: string, threshold: number = 0.1): Promise<{
  baseline: string;
  current: string;
  diffPath?: string;
  diffPercentage: number;
  passed: boolean;
}> {
  const baselinesDir = join(this.paths.dataDir, "baselines");
  const metaPath = join(baselinesDir, `${name}.json`);

  if (!existsSync(metaPath)) {
    throw new Error(`Baseline not found: ${name}`);
  }

  const baseline = JSON.parse(readFileSync(metaPath, "utf-8"));
  const page = await this.getPage();

  const currentPath = join(baselinesDir, `${name}-current-${uniqueStamp()}.png`);
  await page.screenshot({ path: currentPath, fullPage: true });

  const baselineBuffer = readFileSync(baseline.screenshotPath);
  const currentBuffer = readFileSync(currentPath);

  const sizeDiff = Math.abs(baselineBuffer.length - currentBuffer.length);
  const maxSize = Math.max(baselineBuffer.length, currentBuffer.length);
  const diffPercentage = sizeDiff / maxSize;

  return {
    baseline: baseline.screenshotPath,
    current: currentPath,
    diffPercentage,
    passed: diffPercentage <= threshold,
  };
}

export function listBaselines(this: CBrowser): string[] {
  const baselinesDir = join(this.paths.dataDir, "baselines");
  if (!existsSync(baselinesDir)) return [];
  return readdirSync(baselinesDir)
    .filter(f => f.endsWith(".json"))
    .map(f => f.replace(".json", ""));
}
