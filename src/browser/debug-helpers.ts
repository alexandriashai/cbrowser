/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Verbose debug helpers
 *
 * What a failed action reports: the viewport, the clickables and inputs on the page, a debug screenshot.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import type { Page } from "playwright";
import { join } from "path";
import type { RetryAttempt } from "../types.js";
import { uniqueStamp } from "../temp-files.js";
import { namedClickables } from "./helpers.js";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Verbose Debug Helpers (v7.4.16)
// =========================================================================

export async function getViewportContext(this: CBrowser, page?: Page): Promise<{
  viewport: { width: number; height: number };
  scroll: { y: number; max: number; pct: number; atTop: boolean; atBottom: boolean };
  headings: Array<{ level: number; text: string; visible: boolean }>;
  activeModals: number;
  formErrors: string[];
  bannersBlocking: string[];
}> {
  const targetPage = page || await this.getPage();
  try {
    return await targetPage.evaluate(() => {
      const docHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.offsetHeight,
      );
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const scrollY = window.scrollY;
      const maxScroll = Math.max(0, docHeight - vh);
      const pct = maxScroll > 0 ? scrollY / maxScroll : 0;

      // Headings outline — including which are currently visible.
      // innerText is "" inside a render-skipped subtree (content-visibility:
      // auto below the fold), which silently dropped every below-fold heading;
      // textContent is layout-independent, so it is the fallback.
      const headings: Array<{ level: number; text: string; visible: boolean }> = [];
      document.querySelectorAll('h1, h2, h3, h4').forEach(el => {
        const r = el.getBoundingClientRect();
        const text = ((el as HTMLElement).innerText?.trim()
          || el.textContent?.replace(/\s+/g, ' ').trim() || '').substring(0, 100);
        if (text) {
          headings.push({
            level: parseInt(el.tagName.charAt(1)),
            text,
            visible: r.top < vh && r.bottom > 0,
          });
        }
      });

      // Active modals/dialogs that block interaction
      const modalSelectors = '[role="dialog"], [aria-modal="true"], dialog[open], .modal:not(.hidden), [class*="overlay"][class*="active"]';
      const activeModals = Array.from(document.querySelectorAll(modalSelectors)).filter(el => {
        const r = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 50 && r.height > 50;
      }).length;

      // Form errors (common patterns)
      const formErrors: string[] = [];
      document.querySelectorAll('[role="alert"], .error-message, [aria-invalid="true"], .invalid-feedback, .form-error').forEach(el => {
        // textContent fallback: innerText is "" inside content-visibility:auto
        // sections, which hid below-fold alerts the same way it hid clickables.
        const text = ((el as HTMLElement).innerText?.trim() || (el.textContent ?? "").replace(/\s+/g, " ").trim()).substring(0, 120);
        if (text && text.length > 3) formErrors.push(text);
      });

      // Banners that block content (cookie banners, full-screen overlays)
      const bannersBlocking: string[] = [];
      document.querySelectorAll('[class*="cookie"], [class*="consent"], [class*="banner"][class*="bottom"], [id*="cookie"]').forEach(el => {
        const r = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' && r.width > vw * 0.5 && style.display !== 'none') {
          const text = (el as HTMLElement).innerText?.trim().substring(0, 80);
          if (text) bannersBlocking.push(text);
        }
      });

      return {
        viewport: { width: vw, height: vh },
        scroll: {
          y: Math.round(scrollY),
          max: Math.round(maxScroll),
          pct: Math.round(pct * 100) / 100,
          atTop: scrollY < 50,
          atBottom: scrollY > maxScroll - 50,
        },
        headings: headings.slice(0, 20),
        activeModals,
        formErrors: formErrors.slice(0, 5),
        bannersBlocking: bannersBlocking.slice(0, 3),
      };
    });
  } catch {
    return {
      viewport: { width: 0, height: 0 },
      scroll: { y: 0, max: 0, pct: 0, atTop: true, atBottom: false },
      headings: [],
      activeModals: 0,
      formErrors: [],
      bannersBlocking: [],
    };
  }
}

export async function getAvailableClickables(this: CBrowser, page?: Page): Promise<Array<{ tag: string; text: string; selector: string; role?: string; aboveFold?: boolean; region?: string; x?: number; y?: number; width?: number; height?: number }>> {
  const targetPage = page || await this.getPage();
  try {
    // v11.6.0: Expanded selector to include all button types, form submits, and onclick handlers
    // v18.68.0: Returns spatial context (region, fold, bbox) so the cognitive
    //           journey AI can disambiguate same-text targets and reason
    //           about layout. Existing callers only read the original fields.
    return await targetPage.$$eval(
      'button, a, [role="button"], [role="link"], input[type="submit"], input[type="button"], [onclick], [type="submit"]',
      els => {
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        // Region classifier — uses semantic ancestors and viewport position.
        // Order matters: most specific first.
        const classifyRegion = (el: Element, top: number, bottom: number): string => {
          const inside = (sel: string) => !!el.closest(sel);
          // Footer BEFORE nav: site footers hold their link groups in <nav>
          // (cbrowser.ai: <footer><nav aria-label="Product links">), and
          // testing nav first labelled every footer link header-nav.
          if (inside('footer, [role="contentinfo"]')) return 'footer';
          if (inside('nav, [role="navigation"], header[role="banner"]')) return 'header-nav';
          // A <header> is the page banner only outside article/aside/main/
          // section (HTML-AAM); a card's or section's own header is not.
          const header = el.closest('header');
          if (header && !header.parentElement?.closest('article, aside, main, section')) return 'header-nav';
          if (inside('aside, [role="complementary"], [role="dialog"], [aria-modal="true"]')) {
            return inside('[role="dialog"], [aria-modal="true"]') ? 'modal' : 'sidebar';
          }
          if (inside('form')) return 'form';
          // Position-based fallback
          if (top < vh * 0.15) return 'top-bar';
          if (top < vh) return 'main-visible';
          return 'below-fold';
        };
        // Accessible-ish text for an element. innerText is "" for anything in
        // a render-skipped subtree (content-visibility:auto below the fold),
        // so a below-fold "Hunt bugs" button used to be listed with no text.
        // Order: rendered text, aria-label, value, textContent (layout-
        // independent, whitespace collapsed), title.
        const textOf = (el: Element): string => {
          const candidates = [
            (el as HTMLElement).innerText,
            el.getAttribute("aria-label"),
            el.getAttribute("value"),
            el.textContent?.replace(/\s+/g, " "),
            el.getAttribute("title"),
          ];
          for (const c of candidates) {
            const t = c?.trim();
            if (t) return t.substring(0, 80);
          }
          return "";
        };
        // Deduplicate, filter visible, sort by vertical position
        const seen = new Set<Element>();
        return els
          .filter(el => {
            if (seen.has(el)) return false;
            seen.add(el);
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
          })
          .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
          .slice(0, 80)
          .map((el, i) => {
            const r = el.getBoundingClientRect();
            const aboveFold = r.top < vh && r.bottom > 0;
            return {
              tag: el.tagName.toLowerCase(),
              text: textOf(el),
              selector: el.getAttribute("data-testid")
                ? `[data-testid="${el.getAttribute("data-testid")!.replace(/"/g, '\\"')}"]`
                : el.id
                  ? `#${CSS.escape(el.id)}`
                  : `${el.tagName.toLowerCase()}:nth-of-type(${i + 1})`,
              role: el.getAttribute("role") || undefined,
              aboveFold,
              region: classifyRegion(el, r.top, r.bottom),
              x: Math.round(r.left),
              y: Math.round(r.top),
              width: Math.round(r.width),
              height: Math.round(r.height),
            };
          });
      }
    );
  } catch {
    return [];
  }
}

export async function getAvailableInputs(this: CBrowser, page?: Page): Promise<Array<{ selector: string; type: string; name: string; placeholder: string; label: string; isHidden?: boolean; triggerText?: string; options?: string[] }>> {
  const activePage = page || await this.getPage();
  try {
    return await activePage.$$eval('input, textarea, select', els =>
      els.slice(0, 20).map(el => {
        const input = el as HTMLInputElement;
        const htmlEl = el as HTMLElement;

        // Check if element is hidden (common with custom dropdowns)
        const style = window.getComputedStyle(el);
        const isHidden = style.display === 'none' ||
                        style.visibility === 'hidden' ||
                        parseFloat(style.opacity) === 0 ||
                        htmlEl.offsetWidth === 0 ||
                        htmlEl.offsetHeight === 0;

        // Find associated label
        let label = "";
        // textContent fallback: innerText is "" in a render-skipped subtree.
        const labelText = (l: Element) =>
          ((l as HTMLElement).innerText?.trim() || l.textContent?.replace(/\s+/g, " ").trim() || "").substring(0, 50);
        if (input.id) {
          const labelEl = document.querySelector(`label[for="${input.id}"]`);
          if (labelEl) label = labelText(labelEl);
        }
        if (!label && input.closest("label")) {
          label = labelText(input.closest("label")!);
        }

        // For hidden elements, try to find the visible trigger
        let triggerText = "";
        if (isHidden) {
          // Look for sibling or parent with visible text (custom dropdown trigger)
          const parent = el.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children).filter(c => c !== el);
            for (const sib of siblings) {
              const sibStyle = window.getComputedStyle(sib);
              if (sibStyle.display !== 'none' && (sib as HTMLElement).innerText?.trim()) {
                triggerText = (sib as HTMLElement).innerText.trim().substring(0, 50);
                break;
              }
            }
          }
          // Also check for aria-labelledby or data attributes
          if (!triggerText) {
            const ariaLabel = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
            if (ariaLabel) triggerText = ariaLabel.substring(0, 50);
          }
        }

        // For select elements, get available options
        let options: string[] | undefined;
        if (el.tagName.toLowerCase() === 'select') {
          const selectEl = el as HTMLSelectElement;
          options = Array.from(selectEl.options)
            .filter(opt => opt.value && opt.text.trim()) // Skip empty/placeholder options
            .slice(0, 10) // Limit to first 10 options
            .map(opt => opt.text.trim());
        }

        return {
          selector: input.id ? `#${input.id}` : input.name ? `[name="${input.name}"]` : input.placeholder ? `[placeholder="${input.placeholder}"]` : `${el.tagName.toLowerCase()}`,
          type: input.type || el.tagName.toLowerCase(),
          name: input.name || "",
          placeholder: input.placeholder || "",
          label,
          isHidden,
          triggerText,
          options,
        };
      })
    );
  } catch (error) {
    // v11.7.1: Log errors instead of silently swallowing them
    if (process.env.DEBUG || process.env.CBROWSER_DEBUG) {
      console.error(`[getAvailableInputs] Error:`, error instanceof Error ? error.message : String(error));
    }
    return [];
  }
}

export function generateClickSuggestion(this: CBrowser, selector: string, available: Array<{ tag: string; text: string; selector: string }>): string {
  if (available.length === 0) {
    return `No clickable elements found on the page. The page may still be loading.`;
  }
  const list = available.slice(0, 8).map(e => `  • ${e.tag}: "${e.text}" → ${e.selector}`).join("\n");
  return `Element "${selector}" not found.\n\nAvailable clickable elements:\n${list}\n\nTry using the exact text or selector from one of these elements.`;
}

export function generateFillSuggestion(this: CBrowser, selector: string, available: Array<{ selector: string; type: string; name: string; placeholder: string; label: string }>): string {
  if (available.length === 0) {
    return `No input fields found on the page. The page may still be loading.`;
  }
  const list = available.slice(0, 8).map(e => {
    const desc = e.label || e.placeholder || e.name || e.type;
    return `  • ${desc} (${e.type}) → ${e.selector}`;
  }).join("\n");
  return `Input "${selector}" not found.\n\nAvailable input fields:\n${list}\n\nTry using the name, placeholder, or label text from one of these fields.`;
}

export async function captureDebugScreenshot(
  this: CBrowser,
  page: Page,
  options: { availableSelectors?: string[]; attemptedSelector?: string; debugDir?: string }
): Promise<string> {
  try {
    // Inject CSS highlights
    await page.evaluate((opts: { availableSelectors?: string[]; attemptedSelector?: string }) => {
      // Highlight available elements in green
      for (const sel of opts.availableSelectors || []) {
        try {
          const el = document.querySelector(sel);
          if (el) {
            (el as HTMLElement).style.outline = "3px solid #22c55e";
            (el as HTMLElement).style.outlineOffset = "2px";
          }
        } catch {}
      }
      // Mark attempted element in red
      if (opts.attemptedSelector) {
        try {
          const el = document.querySelector(opts.attemptedSelector);
          if (el) {
            (el as HTMLElement).style.outline = "3px solid #ef4444";
            (el as HTMLElement).style.outlineOffset = "2px";
          }
        } catch {}
      }
    }, { availableSelectors: options.availableSelectors, attemptedSelector: options.attemptedSelector });

    // Take screenshot
    const dir = options.debugDir || this.paths.screenshotsDir;
    const filename = `debug-${uniqueStamp()}.png`;
    const filepath = join(dir, filename);
    await page.screenshot({ path: filepath, fullPage: false });

    // Clean up highlights
    await page.evaluate(() => {
      const highlighted = document.querySelectorAll('[style*="outline"]');
      for (let i = 0; i < highlighted.length; i++) {
        (highlighted[i] as HTMLElement).style.outline = "";
        (highlighted[i] as HTMLElement).style.outlineOffset = "";
      }
    });

    return filepath;
  } catch {
    return await this.screenshot();
  }
}

export async function analyzeFailure(
  this: CBrowser,
  selector: string,
  attempts: RetryAttempt[],
): Promise<{ suggestion: string; available: Awaited<ReturnType<CBrowser["getAvailableClickables"]>> }> {
  const page = await this.getPage();

  // The list the suggestion names, returned too, so a caller reporting
  // availableElements reports THESE elements. This used to be its own raw
  // `button, a, [role=button]` scan (hidden ones included, DOM order, first
  // 10), so it offered a hidden nameless menu toggle as `BUTTON: ""` that the
  // filtered availableElements beside it did not contain. (v5 B25)
  const available = namedClickables(await this.getAvailableClickables(page));
  if (available.length === 0) {
    return {
      suggestion: `Element "${selector}" not found after ${attempts.length} attempts, and no visible clickable element with a name is on the page. It may still be loading, or its controls may be icons without accessible names.`,
      available,
    };
  }
  const buttonList = available.slice(0, 10).map((b) => `- ${b.tag.toUpperCase()}: "${b.text}"`).join("\n");
  return {
    suggestion: `Element "${selector}" not found after ${attempts.length} attempts.\n\nAvailable clickable elements:\n${buttonList}\n\nTry using the exact text from one of these elements.`,
    available,
  };
}
