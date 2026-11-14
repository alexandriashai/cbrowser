/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * llms.txt Validator
 *
 * Validates llms.txt files for format compliance and link validity.
 * Based on the llms.txt specification: https://llmstxt.org/
 *
 * @since 17.0.0
 */

import { hostedFetch } from "../hosted-fetch.js";
import { isHostedMode } from "../mcp-tools/hosted-inputs.js";

/**
 * How many links are checked at the same time. Until 2026-11-12 every link
 * was requested at once (Promise.all over the whole list): 2000 links in an
 * 88 KB file opened 2000 connections from this machine in one moment.
 */
export const LINK_CHECK_POOL = 8;

/**
 * The most links one call checks on a hosted server, whatever
 * maxLinksToValidate says. The tool's schema takes any number (an existing
 * caller's value must not start failing validation), so the bound is here,
 * and a call that asked for more is told in its result.
 */
export const HOSTED_MAX_LINKS = 100;

type Link = { text: string; url: string; line: number };

/**
 * The links one call checks, and how many the caller's number selected. The
 * two differ only on a hosted server, when the selection is longer than
 * HOSTED_MAX_LINKS. The bound is put on the list and not on the number: a
 * negative number selects all but the last few, and Infinity selects all.
 */
function linksToCheck(allLinks: Link[], maxLinksToValidate: number): { links: Link[]; asked: number } {
  const selected = allLinks.slice(0, maxLinksToValidate);
  return { links: isHostedMode() ? selected.slice(0, HOSTED_MAX_LINKS) : selected, asked: selected.length };
}

/**
 * How long a hosted link check may run past linkTimeout, for all its links
 * together. Each link still has its own linkTimeout; this bounds the call,
 * which with a pool of eight would otherwise take linkTimeout for every
 * eight dead links (thirteen times as long for a hundred).
 */
export const HOSTED_LINK_CHECK_MARGIN_MS = 5_000;

/** The longest delay setTimeout takes; a larger one fires at once. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * `work` over every item, at most `size` of them at a time, with the results
 * in the order of the items. `work` must not reject. Once `signal` aborts no
 * item is started; `skipped` gives the result of each item that was not.
 */
async function inPool<T, R>(items: readonly T[], size: number, signal: AbortSignal, work: (item: T) => Promise<R>, skipped: (item: T) => R): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length && !signal.aborted) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  for (let i = next; i < items.length; i++) results[i] = skipped(items[i]);
  return results;
}

/**
 * Validation error with severity
 */
export interface ValidationIssue {
  /** Line number (1-indexed) where issue was found */
  line: number;
  /** Severity: error (must fix) or warning (should fix) */
  severity: "error" | "warning";
  /** Type of issue */
  type: "format" | "link" | "structure";
  /** Human-readable message */
  message: string;
  /** The problematic content */
  content?: string;
}

/**
 * Result of llms.txt validation
 */
export interface LlmsTxtValidationResult {
  /** Whether the file is valid (no errors) */
  valid: boolean;
  /** Title extracted from the file */
  title?: string;
  /** Number of sections found */
  sectionCount: number;
  /** Number of links found */
  linkCount: number;
  /** Number of links that were validated as reachable */
  linksValidated: number;
  /** Number of broken links found */
  brokenLinks: number;
  /** All issues found */
  issues: ValidationIssue[];
  /** Summary statistics */
  summary: {
    errors: number;
    warnings: number;
  };
}

/**
 * Options for llms.txt validation
 */
export interface LlmsTxtValidationOptions {
  /** Whether to validate that links are reachable */
  validateLinks?: boolean;
  /** Timeout for link validation in ms */
  linkTimeout?: number;
  /** Maximum number of links to validate (for performance) */
  maxLinksToValidate?: number;
}

/**
 * Parse llms.txt content and extract structure
 */
function parseLlmsTxt(content: string): {
  title?: string;
  description?: string;
  sections: Array<{ title: string; links: Array<{ text: string; url: string; line: number }> }>;
  allLinks: Array<{ text: string; url: string; line: number }>;
} {
  const lines = content.split("\n");
  let title: string | undefined;
  let description: string | undefined;
  const sections: Array<{ title: string; links: Array<{ text: string; url: string; line: number }> }> = [];
  const allLinks: Array<{ text: string; url: string; line: number }> = [];

  let currentSection: { title: string; links: Array<{ text: string; url: string; line: number }> } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Title (# Title)
    if (line.startsWith("# ") && !title) {
      title = line.slice(2).trim();
      continue;
    }

    // Description (> Description)
    if (line.startsWith("> ") && !description && title) {
      description = line.slice(2).trim();
      continue;
    }

    // Section header (## Section)
    if (line.startsWith("## ")) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        title: line.slice(3).trim(),
        links: [],
      };
      continue;
    }

    // Link (- [text](url) or [text](url))
    const linkMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const link = {
        text: linkMatch[1],
        url: linkMatch[2],
        line: lineNum,
      };
      allLinks.push(link);
      if (currentSection) {
        currentSection.links.push(link);
      }
    }
  }

  // Don't forget last section
  if (currentSection) {
    sections.push(currentSection);
  }

  return { title, description, sections, allLinks };
}

/**
 * Validate llms.txt format (structure and syntax)
 */
export function validateLlmsTxtFormat(content: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lines = content.split("\n");

  let hasTitle = false;
  let titleLine = 0;
  let sectionCount = 0;
  let inSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check for title
    if (line.startsWith("# ")) {
      if (hasTitle) {
        issues.push({
          line: lineNum,
          severity: "warning",
          type: "structure",
          message: "Multiple top-level titles found. Only the first will be used.",
          content: line,
        });
      } else {
        hasTitle = true;
        titleLine = lineNum;

        if (line.slice(2).trim().length === 0) {
          issues.push({
            line: lineNum,
            severity: "error",
            type: "format",
            message: "Title is empty",
            content: line,
          });
        }
      }
      continue;
    }

    // Check section headers
    if (line.startsWith("## ")) {
      sectionCount++;
      inSection = true;

      if (line.slice(3).trim().length === 0) {
        issues.push({
          line: lineNum,
          severity: "error",
          type: "format",
          message: "Section title is empty",
          content: line,
        });
      }
      continue;
    }

    // Check for deeper headings (### etc.) - not standard but okay
    if (line.match(/^#{3,} /)) {
      issues.push({
        line: lineNum,
        severity: "warning",
        type: "structure",
        message: "Deep heading levels (###) are not standard in llms.txt but will work",
        content: line,
      });
      continue;
    }

    // Check link format
    const linkMatches = line.matchAll(/\[([^\]]*)\]\(([^)]*)\)/g);
    for (const match of linkMatches) {
      const text = match[1];
      const url = match[2];

      if (!text.trim()) {
        issues.push({
          line: lineNum,
          severity: "error",
          type: "format",
          message: "Link text is empty",
          content: match[0],
        });
      }

      if (!url.trim()) {
        issues.push({
          line: lineNum,
          severity: "error",
          type: "format",
          message: "Link URL is empty",
          content: match[0],
        });
      } else {
        // Validate URL format
        try {
          // Allow relative URLs
          if (!url.startsWith("/") && !url.startsWith("#")) {
            new URL(url);
          }
        } catch {
          issues.push({
            line: lineNum,
            severity: "error",
            type: "format",
            message: "Invalid URL format",
            content: url,
          });
        }
      }
    }

    // Check for malformed links
    const malformedLink = line.match(/\[[^\]]*\][^(]|\[[^\]]*\]\([^)]*$/);
    if (malformedLink) {
      issues.push({
        line: lineNum,
        severity: "error",
        type: "format",
        message: "Malformed markdown link",
        content: line,
      });
    }
  }

  // Check for missing title
  if (!hasTitle) {
    issues.push({
      line: 1,
      severity: "error",
      type: "structure",
      message: "Missing title. llms.txt should start with # Title",
    });
  }

  // Check for no sections
  if (sectionCount === 0) {
    issues.push({
      line: titleLine || 1,
      severity: "warning",
      type: "structure",
      message: "No sections found. Consider adding ## Section headers to organize content",
    });
  }

  return issues;
}

/**
 * Validate that links in llms.txt are reachable
 */
export async function validateLlmsTxtLinks(
  content: string,
  options: LlmsTxtValidationOptions = {}
): Promise<ValidationIssue[]> {
  const { linkTimeout = 5000, maxLinksToValidate = 20 } = options;
  const issues: ValidationIssue[] = [];

  const { allLinks } = parseLlmsTxt(content);

  // Limit number of links to validate
  const { links } = linksToCheck(allLinks, maxLinksToValidate);

  type Checked = { link: Link; ok: boolean; skipped?: boolean; status?: number; error?: string };
  const isRelative = (link: Link): boolean => link.url.startsWith("/") || link.url.startsWith("#");

  // One link, with its own timeout. `deadline` also aborts it, as its own
  // timer would, so a link cut short by the deadline reads as one that timed out.
  const check = async (link: Link, deadline?: AbortSignal): Promise<Checked> => {
    // Skip relative URLs and anchors
    if (isRelative(link)) {
      return { link, ok: true, skipped: true };
    }

    const controller = new AbortController();
    const onDeadline = (): void => controller.abort();
    try {
      const timeoutId = setTimeout(() => controller.abort(), linkTimeout);
      deadline?.addEventListener("abort", onDeadline, { once: true });

      const response = await hostedFetch(link.url, {
        method: "HEAD",
        signal: controller.signal,
        redirect: "follow",
      });

      clearTimeout(timeoutId);

      return { link, ok: response.ok, status: response.status };
    } catch (error) {
      return {
        link,
        ok: false,
        error: (error as Error).message,
      };
    } finally {
      deadline?.removeEventListener("abort", onDeadline);
    }
  };

  let results: Checked[];
  if (!isHostedMode()) {
    // Not hosted: every link at once, as before the hosted limits were added.
    results = await Promise.all(links.map((link) => check(link)));
  } else {
    // Hosted: eight at a time, and the whole check ends HOSTED_LINK_CHECK_MARGIN_MS
    // after one linkTimeout. A link still out then is aborted; one not started
    // gets what an aborted link gets, the message of an aborted request.
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), Math.min(linkTimeout + HOSTED_LINK_CHECK_MARGIN_MS, MAX_TIMER_MS));
    try {
      results = await inPool(links, LINK_CHECK_POOL, deadline.signal, (link) => check(link, deadline.signal), (link): Checked => {
        if (isRelative(link)) return { link, ok: true, skipped: true };
        const reason: unknown = deadline.signal.reason;
        return { link, ok: false, error: reason instanceof Error ? reason.message : String(reason) };
      });
    } finally {
      clearTimeout(timer);
    }
  }

  for (const result of results) {
    if (result.skipped) continue;

    if (!result.ok) {
      issues.push({
        line: result.link.line,
        severity: "warning",
        type: "link",
        message: result.error
          ? `Link unreachable: ${result.error}`
          : `Link returned status ${result.status}`,
        content: result.link.url,
      });
    }
  }

  return issues;
}

/**
 * Fully validate an llms.txt file
 */
export async function validateLlmsTxt(
  content: string,
  options: LlmsTxtValidationOptions = {}
): Promise<LlmsTxtValidationResult> {
  const { validateLinks = true } = options;

  // Parse structure
  const { title, sections, allLinks } = parseLlmsTxt(content);

  // Validate format
  const formatIssues = validateLlmsTxtFormat(content);

  // Validate links if requested
  let linkIssues: ValidationIssue[] = [];
  let linksValidated = 0;
  let brokenLinks = 0;

  if (validateLinks && allLinks.length > 0) {
    linkIssues = await validateLlmsTxtLinks(content, options);
    linksValidated = Math.min(allLinks.length, options.maxLinksToValidate || 20);
    brokenLinks = linkIssues.filter((i) => i.type === "link").length;
    // The same selection validateLlmsTxtLinks made. On a hosted server it
    // stops at HOSTED_MAX_LINKS; the note below is not a broken link and is
    // added after those were counted.
    const { links, asked } = linksToCheck(allLinks, options.maxLinksToValidate ?? 20);
    if (links.length < asked) {
      linksValidated = links.length;
      linkIssues.push({
        line: allLinks[links.length].line,
        severity: "warning",
        type: "link",
        message: `Only the first ${links.length} of the ${asked} links asked for were checked: a hosted server checks at most ${HOSTED_MAX_LINKS} links in one call.`,
      });
    }
  }

  const allIssues = [...formatIssues, ...linkIssues];

  // Sort by line number
  allIssues.sort((a, b) => a.line - b.line);

  const errors = allIssues.filter((i) => i.severity === "error").length;
  const warnings = allIssues.filter((i) => i.severity === "warning").length;

  return {
    valid: errors === 0,
    title,
    sectionCount: sections.length,
    linkCount: allLinks.length,
    linksValidated,
    brokenLinks,
    issues: allIssues,
    summary: {
      errors,
      warnings,
    },
  };
}

/**
 * Fetch llms.txt from a URL and validate it
 */
export async function validateLlmsTxtFromUrl(
  url: string,
  options: LlmsTxtValidationOptions = {}
): Promise<LlmsTxtValidationResult> {
  // Ensure URL ends with /llms.txt
  let llmsTxtUrl = url;
  if (!url.endsWith("/llms.txt")) {
    const baseUrl = url.endsWith("/") ? url : url + "/";
    llmsTxtUrl = baseUrl + "llms.txt";
  }

  try {
    const response = await hostedFetch(llmsTxtUrl);
    if (!response.ok) {
      return {
        valid: false,
        sectionCount: 0,
        linkCount: 0,
        linksValidated: 0,
        brokenLinks: 0,
        issues: [
          {
            line: 0,
            severity: "error",
            type: "format",
            message: `Failed to fetch llms.txt: HTTP ${response.status}`,
            content: llmsTxtUrl,
          },
        ],
        summary: { errors: 1, warnings: 0 },
      };
    }

    const content = await response.text();
    return validateLlmsTxt(content, options);
  } catch (error) {
    return {
      valid: false,
      sectionCount: 0,
      linkCount: 0,
      linksValidated: 0,
      brokenLinks: 0,
      issues: [
        {
          line: 0,
          severity: "error",
          type: "format",
          message: `Failed to fetch llms.txt: ${(error as Error).message}`,
          content: llmsTxtUrl,
        },
      ],
      summary: { errors: 1, warnings: 0 },
    };
  }
}
