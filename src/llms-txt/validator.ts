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
  const linksToCheck = allLinks.slice(0, maxLinksToValidate);

  // Check links in parallel with timeout
  const results = await Promise.all(
    linksToCheck.map(async (link) => {
      // Skip relative URLs and anchors
      if (link.url.startsWith("/") || link.url.startsWith("#")) {
        return { link, ok: true, skipped: true };
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), linkTimeout);

        const response = await fetch(link.url, {
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
      }
    })
  );

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
    const response = await fetch(llmsTxtUrl);
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
