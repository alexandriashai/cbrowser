/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */


/**
 * Test Coverage Map (v6.5.0)
 *
 * Analyze test coverage across your site.
 */

import { existsSync, readFileSync } from "fs";

import { CBrowser } from "../browser.js";
import type {
  TestedPage,
  SitePage,
  CoverageGap,
  TestCoverageAnalysis,
  CoverageMapResult,
  CoverageMapOptions,
} from "../types.js";

/**
 * Parse test files to extract tested URLs and actions
 */
export function parseTestFilesForCoverage(testFiles: string[]): TestedPage[] {
  const pageMap = new Map<string, TestedPage>();

  for (const testFile of testFiles) {
    if (!existsSync(testFile)) continue;

    const content = readFileSync(testFile, "utf-8");
    const lines = content.split("\n");

    let currentUrl: string | null = null;
    let lineNumber = 0;

    for (const line of lines) {
      lineNumber++;
      const trimmed = line.trim().toLowerCase();

      // Skip comments and empty lines
      if (trimmed.startsWith("#") || !trimmed) continue;

      // Detect navigation
      const navMatch = line.match(/(?:go to|navigate to|open|visit)\s+["']?([^"'\s]+)["']?/i);
      if (navMatch) {
        currentUrl = navMatch[1];
        const path = normalizeUrlToPath(currentUrl);

        if (!pageMap.has(path)) {
          pageMap.set(path, {
            url: currentUrl,
            path,
            testFiles: [],
            actions: [],
            testCount: 0,
            coverageScore: 0,
          });
        }

        const page = pageMap.get(path)!;
        if (!page.testFiles.includes(testFile)) {
          page.testFiles.push(testFile);
          page.testCount++;
        }

        page.actions.push({
          type: "navigate",
          target: currentUrl,
          testFile,
          lineNumber,
        });
      }

      // Detect click actions
      const clickMatch = line.match(/click\s+(?:on\s+)?(?:the\s+)?["']?([^"'\n]+)["']?/i);
      if (clickMatch && currentUrl) {
        const path = normalizeUrlToPath(currentUrl);
        const page = pageMap.get(path);
        if (page) {
          page.actions.push({
            type: "click",
            target: clickMatch[1].trim(),
            testFile,
            lineNumber,
          });
        }
      }

      // Detect fill/type actions
      const fillMatch = line.match(/(?:type|fill|enter)\s+["']([^"']+)["']\s+(?:in|into)\s+(?:the\s+)?["']?([^"'\n]+)["']?/i);
      if (fillMatch && currentUrl) {
        const path = normalizeUrlToPath(currentUrl);
        const page = pageMap.get(path);
        if (page) {
          page.actions.push({
            type: "fill",
            target: fillMatch[2].trim(),
            value: fillMatch[1],
            testFile,
            lineNumber,
          });
        }
      }

      // Detect verify actions
      const verifyMatch = line.match(/(?:verify|assert|check|expect|should)\s+(.+)/i);
      if (verifyMatch && currentUrl) {
        const path = normalizeUrlToPath(currentUrl);
        const page = pageMap.get(path);
        if (page) {
          page.actions.push({
            type: "verify",
            target: verifyMatch[1].trim(),
            testFile,
            lineNumber,
          });
        }
      }

      // Detect wait actions
      const waitMatch = line.match(/wait\s+(?:for\s+)?(.+)/i);
      if (waitMatch && currentUrl) {
        const path = normalizeUrlToPath(currentUrl);
        const page = pageMap.get(path);
        if (page) {
          page.actions.push({
            type: "wait",
            target: waitMatch[1].trim(),
            testFile,
            lineNumber,
          });
        }
      }
    }
  }

  // Calculate coverage scores
  for (const page of pageMap.values()) {
    const hasClicks = page.actions.some(a => a.type === "click");
    const hasFills = page.actions.some(a => a.type === "fill");
    const hasVerifies = page.actions.some(a => a.type === "verify");

    let score = 20; // Base score for visiting
    if (hasClicks) score += 25;
    if (hasFills) score += 25;
    if (hasVerifies) score += 30;

    page.coverageScore = Math.min(100, score);
  }

  return Array.from(pageMap.values());
}

/**
 * Normalize URL to a path for comparison
 */
function normalizeUrlToPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/\/$/, "") || "/";
  } catch {
    // Not a full URL, treat as path
    return url.replace(/\/$/, "") || "/";
  }
}

/**
 * Fetch and parse sitemap.xml
 */
export async function parseSitemap(sitemapUrl: string): Promise<SitePage[]> {
  const pages: SitePage[] = [];

  try {
    const response = await fetch(sitemapUrl);
    const xml = await response.text();

    // Simple XML parsing for sitemap
    const locMatches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
    for (const match of locMatches) {
      const url = match[1].trim();
      pages.push({
        url,
        path: normalizeUrlToPath(url),
        source: "sitemap",
      });
    }
  } catch (err) {
    console.error(`Failed to fetch sitemap: ${err}`);
  }

  return pages;
}

/**
 * Crawl a site to discover pages
 */
export async function crawlSiteForCoverage(
  startUrl: string,
  maxPages: number = 100,
  includePattern?: string,
  excludePattern?: string
): Promise<SitePage[]> {
  const pages: SitePage[] = [];
  const visited = new Set<string>();
  const queue: string[] = [startUrl];

  const browser = new CBrowser({
    headless: true,
    browser: "chromium",
  });

  const baseUrl = new URL(startUrl);
  const includeRegex = includePattern ? new RegExp(includePattern) : null;
  const excludeRegex = excludePattern ? new RegExp(excludePattern) : null;

  try {
    while (queue.length > 0 && pages.length < maxPages) {
      const url = queue.shift()!;
      const path = normalizeUrlToPath(url);

      if (visited.has(path)) continue;
      visited.add(path);

      // Check patterns
      if (includeRegex && !includeRegex.test(path)) continue;
      if (excludeRegex && excludeRegex.test(path)) continue;

      try {
        const result = await browser.navigate(url);

        // Count interactive elements
        const page = await (browser as any).getPage();
        const interactiveElements = await page.locator("button, a, input, select, textarea, [onclick], [role='button']").count();
        const formCount = await page.locator("form").count();

        // Get outbound links
        const links = await page.locator("a[href]").evaluateAll((els: HTMLAnchorElement[]) =>
          els.map(el => el.href).filter(href => href && !href.startsWith("javascript:"))
        );

        const sitePage: SitePage = {
          url,
          path,
          title: result.title,
          source: pages.length === 0 ? "crawl" : "link",
          status: 200,
          outboundLinks: links,
          interactiveElements,
          formCount,
        };

        pages.push(sitePage);

        // Add internal links to queue
        for (const link of links) {
          try {
            const linkUrl = new URL(link);
            if (linkUrl.hostname === baseUrl.hostname && !visited.has(normalizeUrlToPath(link))) {
              queue.push(link);
            }
          } catch {
            // Invalid URL, skip
          }
        }
      } catch (err) {
        // Page failed to load
        pages.push({
          url,
          path,
          source: "link",
          status: 0,
        });
      }
    }
  } finally {
    await browser.close();
  }

  return pages;
}

/**
 * Identify coverage gaps
 */
export function identifyCoverageGaps(
  sitePages: SitePage[],
  testedPages: TestedPage[],
  minCoverage: number = 50
): CoverageGap[] {
  const gaps: CoverageGap[] = [];
  const _testedPaths = new Set(testedPages.map(p => p.path));

  for (const sitePage of sitePages) {
    const testedPage = testedPages.find(p => p.path === sitePage.path);

    // Completely untested
    if (!testedPage) {
      const priority = determinePriority(sitePage);
      gaps.push({
        page: sitePage,
        reason: "untested",
        priority,
        suggestedTests: generateSuggestedTests(sitePage),
        similarTestedPages: findSimilarTestedPages(sitePage.path, testedPages),
      });
      continue;
    }

    // Low coverage
    if (testedPage.coverageScore < minCoverage) {
      gaps.push({
        page: sitePage,
        reason: "low-coverage",
        priority: "medium",
        suggestedTests: generateSuggestedTests(sitePage, testedPage),
      });
      continue;
    }

    // No interactions tested
    const hasInteractions = testedPage.actions.some(a => a.type === "click" || a.type === "fill");
    if (!hasInteractions && sitePage.interactiveElements && sitePage.interactiveElements > 5) {
      gaps.push({
        page: sitePage,
        reason: "no-interactions",
        priority: "low",
        suggestedTests: [`Test interactive elements on ${sitePage.path}`],
      });
    }

    // No verifications
    const hasVerifications = testedPage.actions.some(a => a.type === "verify");
    if (!hasVerifications) {
      gaps.push({
        page: sitePage,
        reason: "no-verifications",
        priority: "low",
        suggestedTests: [`Add assertions to verify ${sitePage.path} content`],
      });
    }
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  gaps.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return gaps;
}

/**
 * Determine priority of an untested page
 */
function determinePriority(page: SitePage): "critical" | "high" | "medium" | "low" {
  const path = page.path.toLowerCase();

  // Critical paths
  if (path.includes("checkout") || path.includes("payment") || path.includes("login") ||
      path.includes("register") || path.includes("signup") || path.includes("auth")) {
    return "critical";
  }

  // High priority - user account, settings
  if (path.includes("account") || path.includes("profile") || path.includes("settings") ||
      path.includes("dashboard") || path.includes("admin")) {
    return "high";
  }

  // Medium - has forms or many interactive elements
  if (page.formCount && page.formCount > 0) return "medium";
  if (page.interactiveElements && page.interactiveElements > 10) return "medium";

  return "low";
}

/**
 * Generate suggested test steps for a page
 */
function generateSuggestedTests(sitePage: SitePage, existingTests?: TestedPage): string[] {
  const suggestions: string[] = [];

  suggestions.push(`go to ${sitePage.url}`);

  if (sitePage.formCount && sitePage.formCount > 0) {
    suggestions.push(`fill form fields with test data`);
    suggestions.push(`submit form and verify success`);
  }

  if (sitePage.interactiveElements && sitePage.interactiveElements > 0) {
    suggestions.push(`click primary call-to-action`);
  }

  suggestions.push(`verify page contains expected content`);
  suggestions.push(`verify no console errors`);

  if (existingTests) {
    // Add specific suggestions based on what's missing
    const hasClicks = existingTests.actions.some(a => a.type === "click");
    const hasFills = existingTests.actions.some(a => a.type === "fill");
    const hasVerifies = existingTests.actions.some(a => a.type === "verify");

    if (!hasClicks) suggestions.unshift(`# Add click interactions`);
    if (!hasFills && sitePage.formCount) suggestions.unshift(`# Add form fill tests`);
    if (!hasVerifies) suggestions.unshift(`# Add verification assertions`);
  }

  return suggestions;
}

/**
 * Find similar tested pages for reference
 */
function findSimilarTestedPages(path: string, testedPages: TestedPage[]): string[] {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return [];

  const similar: string[] = [];
  const prefix = "/" + segments[0];

  for (const tested of testedPages) {
    if (tested.path.startsWith(prefix) && tested.path !== path) {
      similar.push(tested.path);
      if (similar.length >= 3) break;
    }
  }

  return similar;
}

/**
 * Calculate overall coverage analysis
 */
export function calculateCoverageAnalysis(
  sitePages: SitePage[],
  testedPages: TestedPage[]
): TestCoverageAnalysis {
  const testedPaths = new Set(testedPages.map(p => p.path));

  // Section coverage
  const sections: Record<string, { total: number; tested: number }> = {};

  for (const page of sitePages) {
    const segments = page.path.split("/").filter(Boolean);
    const section = segments.length > 0 ? "/" + segments[0] : "/";

    if (!sections[section]) {
      sections[section] = { total: 0, tested: 0 };
    }
    sections[section].total++;

    if (testedPaths.has(page.path)) {
      sections[section].tested++;
    }
  }

  const sectionCoverage: Record<string, { total: number; tested: number; percent: number }> = {};
  for (const [section, data] of Object.entries(sections)) {
    sectionCoverage[section] = {
      ...data,
      percent: data.total > 0 ? Math.round((data.tested / data.total) * 100) : 0,
    };
  }

  const totalPages = sitePages.length;
  const testedCount = sitePages.filter(p => testedPaths.has(p.path)).length;

  return {
    totalPages,
    testedPages: testedCount,
    untestedPages: totalPages - testedCount,
    coveragePercent: totalPages > 0 ? Math.round((testedCount / totalPages) * 100) : 0,
    sectionCoverage,
  };
}

/**
 * Generate complete coverage map
 */
export async function generateCoverageMap(
  baseUrl: string,
  testFiles: string[],
  options: CoverageMapOptions = {}
): Promise<CoverageMapResult> {
  const startTime = Date.now();

  // Parse test files
  const testedPages = parseTestFilesForCoverage(testFiles);

  // Get site pages
  let sitePages: SitePage[];
  if (options.sitemapUrl) {
    sitePages = await parseSitemap(options.sitemapUrl);
  } else {
    sitePages = await crawlSiteForCoverage(
      baseUrl,
      options.maxPages || 100,
      options.includePattern,
      options.excludePattern
    );
  }

  // Identify gaps
  const gaps = identifyCoverageGaps(sitePages, testedPages, options.minCoverage || 50);

  // Calculate analysis
  const analysis = calculateCoverageAnalysis(sitePages, testedPages);

  // Generate recommendations
  const recommendations: string[] = [];

  if (analysis.coveragePercent < 50) {
    recommendations.push("Coverage is below 50% - prioritize testing critical paths");
  }

  const criticalGaps = gaps.filter(g => g.priority === "critical");
  if (criticalGaps.length > 0) {
    recommendations.push(`${criticalGaps.length} critical pages have no tests (checkout, auth, etc.)`);
  }

  const lowCoverageSections = Object.entries(analysis.sectionCoverage)
    .filter(([_, data]) => data.percent < 30 && data.total > 2)
    .map(([section]) => section);

  if (lowCoverageSections.length > 0) {
    recommendations.push(`Sections with low coverage: ${lowCoverageSections.join(", ")}`);
  }

  if (gaps.filter(g => g.reason === "no-verifications").length > 3) {
    recommendations.push("Many tests lack assertions - add verification steps");
  }

  return {
    baseUrl,
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime,
    testFiles,
    sitePages,
    testedPages,
    gaps,
    analysis,
    recommendations,
  };
}

/**
 * Format coverage map as text report
 */
export function formatCoverageReport(result: CoverageMapResult): string {
  const lines: string[] = [];

  lines.push("╔══════════════════════════════════════════════════════════════════════════════╗");
  lines.push("║                         TEST COVERAGE MAP REPORT                            ║");
  lines.push("╚══════════════════════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`📊 Site: ${result.baseUrl}`);
  lines.push(`📅 Generated: ${result.timestamp}`);
  lines.push(`⏱️  Analysis time: ${(result.duration / 1000).toFixed(1)}s`);
  lines.push(`📝 Test files analyzed: ${result.testFiles.length}`);
  lines.push("");

  // Overall coverage
  lines.push("═══════════════════════════════════════════════════════════════════════════════");
  lines.push("📈 OVERALL COVERAGE");
  lines.push("═══════════════════════════════════════════════════════════════════════════════");
  lines.push("");

  const { analysis } = result;
  const coverageBar = generateCoverageProgressBar(analysis.coveragePercent);

  lines.push(`  Coverage: ${coverageBar} ${analysis.coveragePercent}%`);
  lines.push("");
  lines.push(`  Total pages:    ${analysis.totalPages}`);
  lines.push(`  Tested pages:   ${analysis.testedPages}`);
  lines.push(`  Untested pages: ${analysis.untestedPages}`);
  lines.push("");

  // Section coverage
  lines.push("───────────────────────────────────────────────────────────────────────────────");
  lines.push("📁 COVERAGE BY SECTION");
  lines.push("───────────────────────────────────────────────────────────────────────────────");
  lines.push("");

  const sections = Object.entries(analysis.sectionCoverage)
    .sort((a, b) => b[1].total - a[1].total);

  for (const [section, data] of sections) {
    const bar = generateCoverageProgressBar(data.percent, 20);
    const status = data.percent >= 70 ? "✅" : data.percent >= 40 ? "⚠️" : "❌";
    lines.push(`  ${status} ${section.padEnd(20)} ${bar} ${data.tested}/${data.total} (${data.percent}%)`);
  }
  lines.push("");

  // Coverage gaps
  if (result.gaps.length > 0) {
    lines.push("═══════════════════════════════════════════════════════════════════════════════");
    lines.push("🕳️  COVERAGE GAPS");
    lines.push("═══════════════════════════════════════════════════════════════════════════════");
    lines.push("");

    const priorityEmoji: Record<string, string> = { critical: "🚨", high: "🔴", medium: "🟡", low: "🟢" };

    for (const gap of result.gaps.slice(0, 15)) {
      const emoji = priorityEmoji[gap.priority];
      lines.push(`  ${emoji} ${gap.page.path}`);
      lines.push(`     Reason: ${gap.reason} | Priority: ${gap.priority}`);
      if (gap.suggestedTests.length > 0) {
        lines.push(`     Suggested: ${gap.suggestedTests[0]}`);
      }
      lines.push("");
    }

    if (result.gaps.length > 15) {
      lines.push(`  ... and ${result.gaps.length - 15} more gaps`);
      lines.push("");
    }
  }

  // Recommendations
  if (result.recommendations.length > 0) {
    lines.push("═══════════════════════════════════════════════════════════════════════════════");
    lines.push("💡 RECOMMENDATIONS");
    lines.push("═══════════════════════════════════════════════════════════════════════════════");
    lines.push("");

    for (const rec of result.recommendations) {
      lines.push(`  ${rec}`);
    }
    lines.push("");
  }

  // Tested pages summary
  lines.push("───────────────────────────────────────────────────────────────────────────────");
  lines.push("✅ TESTED PAGES (Top 10 by coverage)");
  lines.push("───────────────────────────────────────────────────────────────────────────────");
  lines.push("");

  const topTested = [...result.testedPages]
    .sort((a, b) => b.coverageScore - a.coverageScore)
    .slice(0, 10);

  for (const page of topTested) {
    const bar = generateCoverageProgressBar(page.coverageScore, 15);
    lines.push(`  ${bar} ${page.coverageScore}% ${page.path}`);
    lines.push(`       Actions: ${page.actions.length} | Tests: ${page.testCount}`);
  }

  return lines.join("\n");
}

/**
 * Generate HTML coverage report
 */
export function generateCoverageHtmlReport(result: CoverageMapResult): string {
  const { analysis, gaps, testedPages } = result;

  const coverageColor = analysis.coveragePercent >= 70 ? "#22c55e" :
    analysis.coveragePercent >= 40 ? "#eab308" : "#ef4444";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Coverage Map - ${result.baseUrl}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #eee; padding: 2rem; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #fff; margin-bottom: 0.5rem; }
    .subtitle { color: #888; margin-bottom: 2rem; }
    .card { background: #252540; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
    .card h2 { color: #fff; font-size: 1.1rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; }
    .stat { text-align: center; }
    .stat-value { font-size: 2rem; font-weight: bold; color: ${coverageColor}; }
    .stat-label { color: #888; font-size: 0.875rem; }
    .progress-bar { height: 8px; background: #333; border-radius: 4px; overflow: hidden; margin: 1rem 0; }
    .progress-fill { height: 100%; background: ${coverageColor}; transition: width 0.5s; }
    .section-list { list-style: none; }
    .section-item { display: flex; align-items: center; gap: 1rem; padding: 0.75rem 0; border-bottom: 1px solid #333; }
    .section-name { flex: 1; }
    .section-bar { width: 150px; height: 6px; background: #333; border-radius: 3px; overflow: hidden; }
    .section-bar-fill { height: 100%; border-radius: 3px; }
    .section-percent { width: 60px; text-align: right; font-weight: 500; }
    .gap-list { list-style: none; }
    .gap-item { padding: 1rem; margin-bottom: 0.75rem; background: #1a1a2e; border-radius: 8px; border-left: 4px solid; }
    .gap-critical { border-color: #ef4444; }
    .gap-high { border-color: #f97316; }
    .gap-medium { border-color: #eab308; }
    .gap-low { border-color: #22c55e; }
    .gap-path { font-weight: 600; color: #fff; }
    .gap-reason { color: #888; font-size: 0.875rem; margin-top: 0.25rem; }
    .badge { display: inline-block; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
    .badge-critical { background: #ef4444; color: #fff; }
    .badge-high { background: #f97316; color: #fff; }
    .badge-medium { background: #eab308; color: #000; }
    .badge-low { background: #22c55e; color: #fff; }
    .recommendations { list-style: none; }
    .recommendations li { padding: 0.75rem; background: #1a1a2e; border-radius: 6px; margin-bottom: 0.5rem; }
    .page-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1rem; }
    .page-card { background: #1a1a2e; border-radius: 8px; padding: 1rem; }
    .page-score { font-size: 1.5rem; font-weight: bold; }
    .page-path { color: #888; font-size: 0.875rem; word-break: break-all; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Test Coverage Map</h1>
    <p class="subtitle">${result.baseUrl} | Generated ${new Date(result.timestamp).toLocaleString()}</p>

    <div class="card">
      <h2>📊 Overall Coverage</h2>
      <div class="stats">
        <div class="stat">
          <div class="stat-value">${analysis.coveragePercent}%</div>
          <div class="stat-label">Coverage</div>
        </div>
        <div class="stat">
          <div class="stat-value">${analysis.totalPages}</div>
          <div class="stat-label">Total Pages</div>
        </div>
        <div class="stat">
          <div class="stat-value">${analysis.testedPages}</div>
          <div class="stat-label">Tested</div>
        </div>
        <div class="stat">
          <div class="stat-value">${analysis.untestedPages}</div>
          <div class="stat-label">Untested</div>
        </div>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${analysis.coveragePercent}%"></div>
      </div>
    </div>

    <div class="card">
      <h2>📁 Coverage by Section</h2>
      <ul class="section-list">
        ${Object.entries(analysis.sectionCoverage)
          .sort((a, b) => b[1].total - a[1].total)
          .map(([section, data]) => {
            const color = data.percent >= 70 ? "#22c55e" : data.percent >= 40 ? "#eab308" : "#ef4444";
            return `
              <li class="section-item">
                <span class="section-name">${section}</span>
                <div class="section-bar">
                  <div class="section-bar-fill" style="width: ${data.percent}%; background: ${color}"></div>
                </div>
                <span class="section-percent" style="color: ${color}">${data.percent}%</span>
                <span style="color: #666; font-size: 0.875rem">${data.tested}/${data.total}</span>
              </li>
            `;
          }).join("")}
      </ul>
    </div>

    ${gaps.length > 0 ? `
      <div class="card">
        <h2>🕳️ Coverage Gaps (${gaps.length})</h2>
        <ul class="gap-list">
          ${gaps.slice(0, 20).map(gap => `
            <li class="gap-item gap-${gap.priority}">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span class="gap-path">${gap.page.path}</span>
                <span class="badge badge-${gap.priority}">${gap.priority}</span>
              </div>
              <div class="gap-reason">Reason: ${gap.reason}</div>
            </li>
          `).join("")}
        </ul>
        ${gaps.length > 20 ? `<p style="color: #666; text-align: center;">...and ${gaps.length - 20} more gaps</p>` : ""}
      </div>
    ` : ""}

    ${result.recommendations.length > 0 ? `
      <div class="card">
        <h2>💡 Recommendations</h2>
        <ul class="recommendations">
          ${result.recommendations.map(rec => `<li>${rec}</li>`).join("")}
        </ul>
      </div>
    ` : ""}

    <div class="card">
      <h2>✅ Tested Pages (Top 12)</h2>
      <div class="page-grid">
        ${testedPages
          .sort((a, b) => b.coverageScore - a.coverageScore)
          .slice(0, 12)
          .map(page => {
            const color = page.coverageScore >= 70 ? "#22c55e" : page.coverageScore >= 40 ? "#eab308" : "#ef4444";
            return `
              <div class="page-card">
                <div class="page-score" style="color: ${color}">${page.coverageScore}%</div>
                <div class="page-path">${page.path}</div>
                <div style="color: #666; font-size: 0.75rem; margin-top: 0.5rem;">
                  ${page.actions.length} actions | ${page.testCount} test(s)
                </div>
              </div>
            `;
          }).join("")}
      </div>
    </div>

    <footer style="text-align: center; color: #666; margin-top: 2rem; font-size: 0.875rem;">
      Generated by CBrowser v6.5.0 | Analysis took ${(result.duration / 1000).toFixed(1)}s
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Generate a text progress bar for coverage
 */
function generateCoverageProgressBar(percent: number, width: number = 30): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}
