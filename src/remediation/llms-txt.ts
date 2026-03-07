/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * llms.txt Generator
 *
 * Auto-generates an llms.txt file from site analysis.
 * llms.txt is a proposed standard for making websites AI-readable.
 *
 * @see https://llmstxt.org/
 * @since 17.0.0
 */

import { chromium, type Page, type Browser } from "playwright";

/**
 * Extracted page data for llms.txt generation
 */
export interface PageData {
  url: string;
  title: string;
  description: string;
  headings: string[];
  links: Array<{
    text: string;
    href: string;
    isNavigation: boolean;
  }>;
  mainContent?: string;
}

/**
 * llms.txt section
 */
export interface LlmsTxtSection {
  title: string;
  links: Array<{
    title: string;
    url: string;
    description?: string;
  }>;
}

/**
 * Generated llms.txt result
 */
export interface LlmsTxtResult {
  title: string;
  description: string;
  sections: LlmsTxtSection[];
  markdown: string;
}

/**
 * Options for llms.txt generation
 */
export interface LlmsTxtOptions {
  /** Base URL to crawl */
  url: string;
  /** Whether to crawl linked pages */
  crawl?: boolean;
  /** Max pages to crawl */
  maxPages?: number;
  /** Headless browser */
  headless?: boolean;
}

/**
 * Extract data from a single page
 */
async function extractPageData(page: Page, url: string): Promise<PageData> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  const data = await page.evaluate(() => {
    const title =
      document.querySelector("title")?.textContent?.trim() ||
      document.querySelector("h1")?.textContent?.trim() ||
      "Untitled";

    const description =
      document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ||
      document.querySelector('meta[property="og:description"]')?.getAttribute("content")?.trim() ||
      "";

    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .map((h) => h.textContent?.trim() || "")
      .filter((h) => h.length > 0)
      .slice(0, 20);

    const links: Array<{ text: string; href: string; isNavigation: boolean }> = [];
    const seenHrefs = new Set<string>();

    // Get navigation links
    const navLinks = document.querySelectorAll("nav a, header a, [role='navigation'] a");
    navLinks.forEach((a) => {
      const href = a.getAttribute("href");
      const text = a.textContent?.trim();
      if (href && text && !seenHrefs.has(href) && !href.startsWith("#")) {
        seenHrefs.add(href);
        links.push({ text, href, isNavigation: true });
      }
    });

    // Get main content links (limited)
    const mainLinks = document.querySelectorAll("main a, article a, .content a");
    mainLinks.forEach((a) => {
      const href = a.getAttribute("href");
      const text = a.textContent?.trim();
      if (href && text && !seenHrefs.has(href) && !href.startsWith("#") && links.length < 50) {
        seenHrefs.add(href);
        links.push({ text, href, isNavigation: false });
      }
    });

    // Get main content text (first 500 chars)
    const mainEl = document.querySelector("main, article, .content, [role='main']");
    const mainContent = mainEl?.textContent?.trim().slice(0, 500) || "";

    return { title, description, headings, links, mainContent };
  });

  return { ...data, url };
}

/**
 * Group links into logical sections
 */
function groupLinksIntoSections(
  pages: PageData[]
): LlmsTxtSection[] {
  const sections: LlmsTxtSection[] = [];
  const mainPage = pages[0];

  // Navigation section
  const navLinks = mainPage.links.filter((l) => l.isNavigation);
  if (navLinks.length > 0) {
    sections.push({
      title: "Navigation",
      links: navLinks.map((l) => ({
        title: l.text,
        url: l.href,
      })),
    });
  }

  // Group by URL patterns
  const docLinks = mainPage.links.filter(
    (l) => l.href.includes("/docs") || l.href.includes("/guide") || l.href.includes("/help")
  );
  if (docLinks.length > 0) {
    sections.push({
      title: "Documentation",
      links: docLinks.map((l) => ({
        title: l.text,
        url: l.href,
      })),
    });
  }

  const apiLinks = mainPage.links.filter(
    (l) => l.href.includes("/api") || l.href.includes("/reference")
  );
  if (apiLinks.length > 0) {
    sections.push({
      title: "API Reference",
      links: apiLinks.map((l) => ({
        title: l.text,
        url: l.href,
      })),
    });
  }

  // Other pages section
  const otherLinks = mainPage.links.filter(
    (l) =>
      !l.isNavigation &&
      !l.href.includes("/docs") &&
      !l.href.includes("/guide") &&
      !l.href.includes("/help") &&
      !l.href.includes("/api") &&
      !l.href.includes("/reference")
  );
  if (otherLinks.length > 0) {
    sections.push({
      title: "Other Pages",
      links: otherLinks.slice(0, 20).map((l) => ({
        title: l.text,
        url: l.href,
      })),
    });
  }

  // If we crawled additional pages, add summaries
  if (pages.length > 1) {
    const crawledSection: LlmsTxtSection = {
      title: "Site Structure",
      links: pages.slice(1).map((p) => ({
        title: p.title,
        url: p.url,
        description: p.description || p.headings[0] || "",
      })),
    };
    sections.push(crawledSection);
  }

  return sections;
}

/**
 * Format sections into llms.txt markdown
 */
function formatLlmsTxt(
  title: string,
  description: string,
  sections: LlmsTxtSection[]
): string {
  let markdown = `# ${title}\n\n`;

  if (description) {
    markdown += `> ${description}\n\n`;
  }

  for (const section of sections) {
    markdown += `## ${section.title}\n\n`;
    for (const link of section.links) {
      if (link.description) {
        markdown += `- [${link.title}](${link.url}): ${link.description}\n`;
      } else {
        markdown += `- [${link.title}](${link.url})\n`;
      }
    }
    markdown += "\n";
  }

  return markdown;
}

/**
 * Generate llms.txt content from a URL
 */
export async function generateLlmsTxt(
  options: LlmsTxtOptions
): Promise<LlmsTxtResult> {
  const { url, crawl = false, maxPages = 10, headless = true } = options;

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Extract main page data
    const mainPageData = await extractPageData(page, url);
    const pages: PageData[] = [mainPageData];

    // Optionally crawl linked pages
    if (crawl && mainPageData.links.length > 0) {
      const baseUrl = new URL(url);
      const toCrawl = mainPageData.links
        .filter((l) => {
          try {
            const linkUrl = new URL(l.href, url);
            return linkUrl.hostname === baseUrl.hostname;
          } catch {
            return false;
          }
        })
        .slice(0, maxPages - 1);

      for (const link of toCrawl) {
        try {
          const fullUrl = new URL(link.href, url).toString();
          const pageData = await extractPageData(page, fullUrl);
          pages.push(pageData);
        } catch (error) {
          // Skip failed pages
          console.warn(`[CBrowser] Failed to crawl ${link.href}:`, error);
        }
      }
    }

    await browser.close();
    browser = null;

    // Group and format
    const sections = groupLinksIntoSections(pages);
    const markdown = formatLlmsTxt(
      mainPageData.title,
      mainPageData.description,
      sections
    );

    return {
      title: mainPageData.title,
      description: mainPageData.description,
      sections,
      markdown,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Crawl a site and generate comprehensive llms.txt
 */
export async function crawlSiteForLlmsTxt(
  url: string,
  options: { maxPages?: number; headless?: boolean } = {}
): Promise<LlmsTxtResult> {
  return generateLlmsTxt({
    url,
    crawl: true,
    maxPages: options.maxPages || 20,
    headless: options.headless ?? true,
  });
}
