/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Performance metrics
 *
 * Core Web Vitals and the performance budget audit.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import type { PerformanceMetrics, PerformanceAuditResult } from "../types.js";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Performance Metrics
// =========================================================================

export async function getPerformanceMetrics(this: CBrowser): Promise<PerformanceMetrics> {
  const page = await this.getPage();

  const metrics = await page.evaluate(async () => {
    const result: Record<string, number | undefined> = {};

    // Navigation timing
    const navTiming = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    if (navTiming) {
      result.ttfb = navTiming.responseStart - navTiming.requestStart;
      result.domContentLoaded = navTiming.domContentLoadedEventEnd - navTiming.startTime;
      result.load = navTiming.loadEventEnd - navTiming.startTime;
    }

    // Paint timing
    const paintEntries = performance.getEntriesByType("paint");
    for (const entry of paintEntries) {
      if (entry.name === "first-contentful-paint") {
        result.fcp = entry.startTime;
      }
    }

    // LCP and CLS are delivered ONLY to a PerformanceObserver. Chromium never
    // adds largest-contentful-paint or layout-shift entries to the performance
    // timeline, so the previous getEntriesByType() calls returned [] on every
    // page. LCP was therefore always undefined, and CLS was always exactly 0 —
    // which looked like a real measurement of a perfectly stable page rather
    // than no measurement at all. `buffered: true` replays the entries that
    // already fired before this observer existed. (2026-07-29)
    let clsScore = 0;
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(); } };
      try {
        const lcpObs = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length > 0) {
            result.lcp = (entries[entries.length - 1] as any).startTime;
          }
        });
        lcpObs.observe({ type: "largest-contentful-paint", buffered: true });

        const clsObs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!(entry as any).hadRecentInput) {
              clsScore += (entry as any).value || 0;
            }
          }
        });
        clsObs.observe({ type: "layout-shift", buffered: true });
      } catch {
        // Older engines without these entry types: leave lcp undefined rather
        // than reporting a fabricated value.
        finish();
      }
      // Buffered entries arrive on the next task; give late shifts a moment too.
      setTimeout(finish, 300);
    });
    result.cls = clsScore;

    // Resource counts
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    result.resourceCount = resources.length;
    result.transferSize = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);

    // Timings are high-resolution DOMHighResTimeStamps (ttfb printed as
    // 53.69999998807907): whole milliseconds, and CLS to 4 dp. (v8 B41)
    for (const k of ["ttfb", "domContentLoaded", "load", "fcp", "lcp"]) {
      if (typeof result[k] === "number") result[k] = Math.round(result[k] as number);
    }
    if (typeof result.cls === "number") result.cls = Math.round(result.cls * 10000) / 10000;

    return result;
  });

  // Rate the metrics
  const lcpRating = metrics.lcp
    ? metrics.lcp <= 2500 ? "good" : metrics.lcp <= 4000 ? "needs-improvement" : "poor"
    : undefined;

  const clsRating = metrics.cls !== undefined
    ? metrics.cls <= 0.1 ? "good" : metrics.cls <= 0.25 ? "needs-improvement" : "poor"
    : undefined;

  return {
    lcp: metrics.lcp,
    cls: metrics.cls,
    fcp: metrics.fcp,
    ttfb: metrics.ttfb,
    domContentLoaded: metrics.domContentLoaded,
    load: metrics.load,
    resourceCount: metrics.resourceCount,
    transferSize: metrics.transferSize,
    lcpRating: lcpRating as PerformanceMetrics["lcpRating"],
    clsRating: clsRating as PerformanceMetrics["clsRating"],
  };
}

export async function auditPerformance(this: CBrowser, url?: string): Promise<PerformanceAuditResult> {
  if (url) {
    await this.navigate(url);
  }

  const page = await this.getPage();
  const metrics = await this.getPerformanceMetrics();
  const budget = this.config.performanceBudget;
  const violations: string[] = [];
  let passed = true;

  if (budget) {
    if (budget.lcp && metrics.lcp && metrics.lcp > budget.lcp) {
      violations.push(`LCP ${metrics.lcp}ms exceeds budget ${budget.lcp}ms`);
      passed = false;
    }
    if (budget.fcp && metrics.fcp && metrics.fcp > budget.fcp) {
      violations.push(`FCP ${metrics.fcp}ms exceeds budget ${budget.fcp}ms`);
      passed = false;
    }
    if (budget.cls && metrics.cls && metrics.cls > budget.cls) {
      violations.push(`CLS ${metrics.cls} exceeds budget ${budget.cls}`);
      passed = false;
    }
    if (budget.ttfb && metrics.ttfb && metrics.ttfb > budget.ttfb) {
      violations.push(`TTFB ${metrics.ttfb}ms exceeds budget ${budget.ttfb}ms`);
      passed = false;
    }
    if (budget.transferSize && metrics.transferSize && metrics.transferSize > budget.transferSize) {
      violations.push(`Transfer size ${metrics.transferSize}B exceeds budget ${budget.transferSize}B`);
      passed = false;
    }
    if (budget.resourceCount && metrics.resourceCount && metrics.resourceCount > budget.resourceCount) {
      violations.push(`Resource count ${metrics.resourceCount} exceeds budget ${budget.resourceCount}`);
      passed = false;
    }
  }

  return {
    url: page.url(),
    timestamp: new Date().toISOString(),
    metrics,
    budget,
    passed,
    violations,
  };
}
