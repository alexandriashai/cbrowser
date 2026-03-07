/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * llms.txt Diff
 *
 * Compare current site structure against existing llms.txt to detect drift.
 * Helps maintain llms.txt files as sites evolve.
 *
 * @since 17.0.0
 */

import { generateLlmsTxt, type LlmsTxtResult } from "../remediation/llms-txt.js";

/**
 * A page entry from llms.txt or site
 */
export interface LlmsTxtPage {
  /** Page title */
  title: string;
  /** Page URL */
  url: string;
  /** Optional description */
  description?: string;
  /** Section this page belongs to */
  section?: string;
}

/**
 * A difference found between llms.txt and site
 */
export interface LlmsTxtDiffEntry {
  /** Type of change */
  type: "added" | "removed" | "changed";
  /** Page title */
  title: string;
  /** Page URL */
  url: string;
  /** For 'changed' type: what changed */
  changes?: string[];
  /** The section affected */
  section?: string;
  /** Suggested action */
  action: string;
}

/**
 * Result of llms.txt diff
 */
export interface LlmsTxtDiffResult {
  /** Base URL that was analyzed */
  url: string;
  /** When diff was run */
  timestamp: string;
  /** Whether llms.txt is up to date */
  upToDate: boolean;
  /** Pages in site but not in llms.txt */
  additions: LlmsTxtDiffEntry[];
  /** Pages in llms.txt but not in site */
  removals: LlmsTxtDiffEntry[];
  /** Pages with changed content */
  changes: LlmsTxtDiffEntry[];
  /** Summary statistics */
  summary: {
    totalDifferences: number;
    additions: number;
    removals: number;
    changes: number;
  };
  /** Suggested updated llms.txt content */
  suggestedUpdate?: string;
}

/**
 * Options for llms.txt diff
 */
export interface LlmsTxtDiffOptions {
  /** Existing llms.txt content */
  existingContent: string;
  /** Run headless browser */
  headless?: boolean;
  /** Whether to crawl linked pages */
  crawl?: boolean;
  /** Max pages to crawl */
  maxPages?: number;
}

/**
 * Parse llms.txt content into structured pages
 */
function parseLlmsTxtPages(content: string): LlmsTxtPage[] {
  const pages: LlmsTxtPage[] = [];
  const lines = content.split("\n");

  let currentSection: string | undefined;

  for (const line of lines) {
    // Section header
    if (line.startsWith("## ")) {
      currentSection = line.slice(3).trim();
      continue;
    }

    // Link: - [title](url) or - [title](url): description
    const linkMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)(?::\s*(.+))?/);
    if (linkMatch) {
      pages.push({
        title: linkMatch[1],
        url: linkMatch[2],
        description: linkMatch[3]?.trim(),
        section: currentSection,
      });
    }
  }

  return pages;
}

/**
 * Extract pages from generated llms.txt result
 */
function extractPagesFromResult(result: LlmsTxtResult): LlmsTxtPage[] {
  const pages: LlmsTxtPage[] = [];

  for (const section of result.sections) {
    for (const link of section.links) {
      pages.push({
        title: link.title,
        url: link.url,
        description: link.description,
        section: section.title,
      });
    }
  }

  return pages;
}

/**
 * Normalize URL for comparison (remove trailing slashes, protocol variations)
 */
function normalizeUrl(url: string, baseUrl?: string): string {
  try {
    // Handle relative URLs
    const fullUrl = baseUrl && !url.startsWith("http")
      ? new URL(url, baseUrl).toString()
      : url;

    const parsed = new URL(fullUrl);
    // Remove trailing slash, lowercase, remove www
    return parsed.toString()
      .replace(/\/$/, "")
      .toLowerCase()
      .replace(/^https?:\/\/www\./, "https://");
  } catch {
    return url.toLowerCase().replace(/\/$/, "");
  }
}

/**
 * Compare llms.txt against current site structure
 */
export async function diffLlmsTxt(
  url: string,
  options: LlmsTxtDiffOptions
): Promise<LlmsTxtDiffResult> {
  const {
    existingContent,
    headless = true,
    crawl = false,
    maxPages = 10,
  } = options;

  // Parse existing llms.txt
  const existingPages = parseLlmsTxtPages(existingContent);

  // Generate fresh llms.txt from site
  const freshResult = await generateLlmsTxt({
    url,
    crawl,
    maxPages,
    headless,
  });
  const freshPages = extractPagesFromResult(freshResult);

  // Create maps for comparison
  const existingByUrl = new Map<string, LlmsTxtPage>();
  for (const page of existingPages) {
    existingByUrl.set(normalizeUrl(page.url, url), page);
  }

  const freshByUrl = new Map<string, LlmsTxtPage>();
  for (const page of freshPages) {
    freshByUrl.set(normalizeUrl(page.url, url), page);
  }

  const additions: LlmsTxtDiffEntry[] = [];
  const removals: LlmsTxtDiffEntry[] = [];
  const changes: LlmsTxtDiffEntry[] = [];

  // Find additions (in site but not in llms.txt)
  for (const [normalizedUrl, freshPage] of freshByUrl) {
    if (!existingByUrl.has(normalizedUrl)) {
      additions.push({
        type: "added",
        title: freshPage.title,
        url: freshPage.url,
        section: freshPage.section,
        action: `Add to llms.txt: - [${freshPage.title}](${freshPage.url})`,
      });
    }
  }

  // Find removals (in llms.txt but not in site)
  for (const [normalizedUrl, existingPage] of existingByUrl) {
    if (!freshByUrl.has(normalizedUrl)) {
      removals.push({
        type: "removed",
        title: existingPage.title,
        url: existingPage.url,
        section: existingPage.section,
        action: `Remove from llms.txt or verify page still exists: ${existingPage.url}`,
      });
    }
  }

  // Find changes (same URL but different title/description)
  for (const [normalizedUrl, freshPage] of freshByUrl) {
    const existingPage = existingByUrl.get(normalizedUrl);
    if (existingPage) {
      const changesList: string[] = [];

      if (existingPage.title !== freshPage.title) {
        changesList.push(`Title changed: "${existingPage.title}" → "${freshPage.title}"`);
      }

      if (existingPage.description !== freshPage.description) {
        if (freshPage.description && !existingPage.description) {
          changesList.push(`Description added: "${freshPage.description}"`);
        } else if (!freshPage.description && existingPage.description) {
          changesList.push(`Description removed`);
        } else if (freshPage.description && existingPage.description) {
          changesList.push(`Description changed`);
        }
      }

      if (changesList.length > 0) {
        changes.push({
          type: "changed",
          title: freshPage.title,
          url: freshPage.url,
          changes: changesList,
          section: freshPage.section || existingPage.section,
          action: `Update entry: - [${freshPage.title}](${freshPage.url})${freshPage.description ? `: ${freshPage.description}` : ""}`,
        });
      }
    }
  }

  const totalDifferences = additions.length + removals.length + changes.length;

  return {
    url,
    timestamp: new Date().toISOString(),
    upToDate: totalDifferences === 0,
    additions,
    removals,
    changes,
    summary: {
      totalDifferences,
      additions: additions.length,
      removals: removals.length,
      changes: changes.length,
    },
    suggestedUpdate: totalDifferences > 0 ? freshResult.markdown : undefined,
  };
}

/**
 * Fetch existing llms.txt from URL and compare against site
 */
export async function diffLlmsTxtFromUrl(
  siteUrl: string,
  options: Omit<LlmsTxtDiffOptions, "existingContent"> & { llmsTxtUrl?: string } = {}
): Promise<LlmsTxtDiffResult> {
  const { llmsTxtUrl, headless = true, crawl = false, maxPages = 10 } = options;

  // Determine llms.txt URL
  let fetchUrl = llmsTxtUrl;
  if (!fetchUrl) {
    const baseUrl = siteUrl.endsWith("/") ? siteUrl : siteUrl + "/";
    fetchUrl = baseUrl + "llms.txt";
  }

  // Fetch existing llms.txt
  try {
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      // No existing llms.txt - treat everything as additions
      const freshResult = await generateLlmsTxt({
        url: siteUrl,
        crawl,
        maxPages,
        headless,
      });
      const freshPages = extractPagesFromResult(freshResult);

      return {
        url: siteUrl,
        timestamp: new Date().toISOString(),
        upToDate: false,
        additions: freshPages.map((p) => ({
          type: "added" as const,
          title: p.title,
          url: p.url,
          section: p.section,
          action: `Add to llms.txt: - [${p.title}](${p.url})`,
        })),
        removals: [],
        changes: [],
        summary: {
          totalDifferences: freshPages.length,
          additions: freshPages.length,
          removals: 0,
          changes: 0,
        },
        suggestedUpdate: freshResult.markdown,
      };
    }

    const existingContent = await response.text();
    return diffLlmsTxt(siteUrl, {
      existingContent,
      headless,
      crawl,
      maxPages,
    });
  } catch (error) {
    throw new Error(`Failed to fetch llms.txt: ${(error as Error).message}`);
  }
}
