/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Extraction
 *
 * extract.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import type { ExtractResult } from "../types.js";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Extraction
// =========================================================================

export async function extract(this: CBrowser, what: string): Promise<ExtractResult> {
  const page = await this.getPage();

  let data: unknown;

  switch (what.toLowerCase()) {
    case "links":
      data = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a")).map((a) => ({
          text: a.textContent?.trim(),
          href: a.href,
        }))
      );
      break;

    case "headings":
      data = await page.evaluate(() =>
        Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).map((h) => ({
          level: h.tagName,
          text: h.textContent?.trim(),
        }))
      );
      break;

    case "images":
      data = await page.evaluate(() =>
        Array.from(document.querySelectorAll("img")).map((img) => ({
          src: img.src,
          alt: img.alt,
        }))
      );
      break;

    case "forms":
      data = await page.evaluate(() =>
        Array.from(document.querySelectorAll("form")).map((form) => ({
          action: form.action,
          method: form.method,
          inputs: Array.from(form.querySelectorAll("input, select, textarea")).map((el) => ({
            type: (el as HTMLInputElement).type || el.tagName.toLowerCase(),
            name: (el as HTMLInputElement).name,
            id: el.id,
          })),
        }))
      );
      break;

    case "text":
    default:
      // v11.7.1: Explicit text case (was falling through to default which caused issues)
      // v14.3.0: Filter script/style content to avoid ad injection pollution
      // v16.7.1: Fixed whitespace normalization regression - restore proper text normalization
      data = await page.evaluate(() => {
        // Clone body to avoid modifying the DOM
        const clone = document.body.cloneNode(true) as HTMLElement;

        // v14.3.0: Remove script and style elements before text extraction
        // This prevents Google Ads and other injected scripts from polluting assertions
        const scriptsAndStyles = clone.querySelectorAll('script, style, noscript');
        scriptsAndStyles.forEach(el => el.remove());

        // v16.7.1: Block-level elements that should have space separation
        const blockElements = new Set([
          'DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TR', 'TD', 'TH',
          'ARTICLE', 'SECTION', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'MAIN',
          'BLOCKQUOTE', 'PRE', 'ADDRESS', 'FIGCAPTION', 'FIGURE', 'DT', 'DD'
        ]);

        // v16.7.1: Recursive text extraction with proper spacing
        function extractTextWithSpacing(node: Node): string {
          if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent || '';
          }
          if (node.nodeType !== Node.ELEMENT_NODE) {
            return '';
          }
          const el = node as HTMLElement;
          // Skip hidden elements
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return '';
          }

          const parts: string[] = [];
          for (const child of Array.from(el.childNodes)) {
            parts.push(extractTextWithSpacing(child));
          }
          let text = parts.join('');

          // Add space after block elements to prevent concatenation
          if (blockElements.has(el.tagName)) {
            text = text + ' ';
          }
          return text;
        }

        // v16.7.1: Normalize text - collapse whitespace, trim
        function normalizeText(text: string): string {
          return text
            // Replace newlines and tabs with spaces
            .replace(/[\n\t\r]/g, ' ')
            // Collapse multiple spaces to single space
            .replace(/\s+/g, ' ')
            // Trim leading/trailing whitespace
            .trim();
        }

        // Primary extraction with proper spacing
        let text = extractTextWithSpacing(clone);
        text = normalizeText(text);

        // Fallback: if text is empty (SPA hydration), try textContent with normalization
        if (!text || text === "") {
          text = normalizeText(clone.textContent || "");
        }

        // Second fallback: extract from visible elements with spacing
        if (!text || text === "") {
          const elements = Array.from(clone.querySelectorAll("h1, h2, h3, h4, h5, h6, p, span, li, td, th, a, label, div"));
          const texts: string[] = [];
          for (const el of elements) {
            const t = (el as HTMLElement).innerText?.trim();
            if (t && t.length > 0 && !texts.includes(t)) {
              texts.push(t);
            }
          }
          // Join with space (not newline) for proper normalization
          text = texts.join(" ");
        }
        return text;
      });
  }

  return {
    data,
    screenshot: await this.screenshot(),
  };
}
