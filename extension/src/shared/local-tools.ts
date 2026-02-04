/**
 * CBrowser Extension - Local Browser Automation Tools
 * These run directly in the browser via Chrome Extension APIs
 */

import type {
  PageSnapshot,
  ElementInfo,
  FormInfo,
  LinkInfo,
  ImageInfo,
  HeadingInfo,
  A11yIssue,
  ConsoleMessage,
  NetworkRequest,
} from './types';

/**
 * Read the current page and build a structured snapshot
 */
export async function readPage(tabId: number): Promise<PageSnapshot> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const getSelector = (el: Element): string => {
        if (el.id) return `#${el.id}`;
        if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
        if (el.getAttribute('aria-label')) return `[aria-label="${el.getAttribute('aria-label')}"]`;

        const tag = el.tagName.toLowerCase();
        const classes = Array.from(el.classList).slice(0, 2).join('.');
        if (classes) return `${tag}.${classes}`;

        return tag;
      };

      const elements: ElementInfo[] = [];
      const interactiveElements = document.querySelectorAll(
        'button, a, input, select, textarea, [role="button"], [role="link"], [onclick]'
      );

      interactiveElements.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          elements.push({
            tag: el.tagName.toLowerCase(),
            id: el.id || undefined,
            classes: Array.from(el.classList),
            text: el.textContent?.trim().slice(0, 100) || undefined,
            selector: getSelector(el),
            ariaLabel: el.getAttribute('aria-label') || undefined,
            role: el.getAttribute('role') || undefined,
            rect: rect.toJSON() as DOMRect,
          });
        }
      });

      // Forms
      const forms: FormInfo[] = Array.from(document.forms).map((form) => ({
        action: form.action,
        method: form.method,
        inputs: Array.from(form.elements)
          .filter((el): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
            ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName))
          .map((input) => ({
            type: (input as HTMLInputElement).type || input.tagName.toLowerCase(),
            name: input.name || undefined,
            id: input.id || undefined,
            placeholder: (input as HTMLInputElement).placeholder || undefined,
            required: input.required,
            selector: getSelector(input),
          })),
        submitButton: (() => {
          const btn = form.querySelector('[type="submit"], button:not([type="button"])');
          return btn ? {
            tag: btn.tagName.toLowerCase(),
            text: btn.textContent?.trim(),
            selector: getSelector(btn),
            rect: btn.getBoundingClientRect().toJSON() as DOMRect,
            classes: Array.from(btn.classList),
          } : undefined;
        })(),
      }));

      // Links
      const links: LinkInfo[] = Array.from(document.querySelectorAll('a[href]')).map((a) => ({
        href: a.getAttribute('href') || '',
        text: a.textContent?.trim().slice(0, 100) || '',
        selector: getSelector(a),
        isExternal: a.hostname !== location.hostname,
      }));

      // Images
      const images: ImageInfo[] = Array.from(document.querySelectorAll('img')).map((img) => ({
        src: img.src,
        alt: img.alt || undefined,
        selector: getSelector(img),
        hasAlt: !!img.alt,
      }));

      // Headings
      const headings: HeadingInfo[] = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((h) => ({
        level: parseInt(h.tagName[1]),
        text: h.textContent?.trim() || '',
        selector: getSelector(h),
      }));

      // A11y issues
      const a11yIssues: A11yIssue[] = [];

      // Missing alt text
      document.querySelectorAll('img:not([alt])').forEach((img) => {
        a11yIssues.push({
          type: 'missing-alt',
          severity: 'serious',
          element: getSelector(img),
          message: 'Image missing alt attribute',
          recommendation: 'Add descriptive alt text or alt="" for decorative images',
        });
      });

      // Empty links
      document.querySelectorAll('a').forEach((a) => {
        if (!a.textContent?.trim() && !a.getAttribute('aria-label')) {
          a11yIssues.push({
            type: 'empty-link',
            severity: 'serious',
            element: getSelector(a),
            message: 'Link has no accessible text',
            recommendation: 'Add text content or aria-label',
          });
        }
      });

      // Missing form labels
      document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])').forEach((input) => {
        const id = input.id;
        const hasLabel = id && document.querySelector(`label[for="${id}"]`);
        const hasAriaLabel = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
        if (!hasLabel && !hasAriaLabel) {
          a11yIssues.push({
            type: 'missing-label',
            severity: 'serious',
            element: getSelector(input),
            message: 'Input missing associated label',
            recommendation: 'Add a <label> element or aria-label attribute',
          });
        }
      });

      return {
        url: location.href,
        title: document.title,
        elements,
        forms,
        links,
        images,
        headings,
        a11yIssues,
        timestamp: Date.now(),
      } as PageSnapshot;
    },
  });

  return result.result as PageSnapshot;
}

/**
 * Smart click - find element by text, selector, or role and click it
 */
export async function smartClick(tabId: number, target: string): Promise<{ success: boolean; message: string }> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (targetSelector: string) => {
      // Try direct selector first
      let element = document.querySelector(targetSelector);

      // Try by text content
      if (!element) {
        const allElements = document.querySelectorAll('button, a, [role="button"], input[type="submit"]');
        element = Array.from(allElements).find((el) =>
          el.textContent?.trim().toLowerCase().includes(targetSelector.toLowerCase())
        ) || null;
      }

      // Try by aria-label
      if (!element) {
        element = document.querySelector(`[aria-label*="${targetSelector}" i]`);
      }

      // Try by placeholder
      if (!element) {
        element = document.querySelector(`[placeholder*="${targetSelector}" i]`);
      }

      if (element && element instanceof HTMLElement) {
        element.click();
        return { success: true, message: `Clicked: ${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''}` };
      }

      return { success: false, message: `Element not found: ${targetSelector}` };
    },
    args: [target],
  });

  return result.result as { success: boolean; message: string };
}

/**
 * Fill an input field
 */
export async function fillInput(
  tabId: number,
  selector: string,
  value: string
): Promise<{ success: boolean; message: string }> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string, val: string) => {
      let input = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null;

      // Try by placeholder if selector doesn't work
      if (!input) {
        input = document.querySelector(`input[placeholder*="${sel}" i], textarea[placeholder*="${sel}" i]`);
      }

      // Try by label text
      if (!input) {
        const labels = document.querySelectorAll('label');
        for (const label of labels) {
          if (label.textContent?.toLowerCase().includes(sel.toLowerCase())) {
            const forId = label.getAttribute('for');
            if (forId) {
              input = document.getElementById(forId) as HTMLInputElement;
              break;
            }
          }
        }
      }

      if (input) {
        input.focus();
        input.value = val;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, message: `Filled: ${input.name || input.id || input.placeholder || 'input'}` };
      }

      return { success: false, message: `Input not found: ${sel}` };
    },
    args: [selector, value],
  });

  return result.result as { success: boolean; message: string };
}

/**
 * Take a screenshot of the current tab
 */
export async function takeScreenshot(tabId: number): Promise<string> {
  // Get the tab's window ID
  const tab = await chrome.tabs.get(tabId);
  if (!tab.windowId) throw new Error('Tab has no window');

  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: 'png',
    quality: 100,
  });

  return dataUrl;
}

/**
 * Monitor console messages using debugger API
 */
export async function startConsoleMonitoring(tabId: number): Promise<void> {
  await chrome.debugger.attach({ tabId }, '1.3');
  await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
  await chrome.debugger.sendCommand({ tabId }, 'Console.enable');
}

export async function stopConsoleMonitoring(tabId: number): Promise<void> {
  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    // Already detached
  }
}

/**
 * Monitor network requests using debugger API
 */
export async function startNetworkMonitoring(tabId: number): Promise<void> {
  await chrome.debugger.attach({ tabId }, '1.3');
  await chrome.debugger.sendCommand({ tabId }, 'Network.enable');
}

export async function stopNetworkMonitoring(tabId: number): Promise<void> {
  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    // Already detached
  }
}

/**
 * Export session data (cookies + localStorage)
 */
export async function exportSession(tabId: number): Promise<{
  cookies: chrome.cookies.Cookie[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  url: string;
}> {
  const tab = await chrome.tabs.get(tabId);
  const url = new URL(tab.url || '');

  // Get cookies for this domain
  const cookies = await chrome.cookies.getAll({ domain: url.hostname });

  // Get localStorage and sessionStorage
  const [storageResult] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      localStorage: { ...localStorage },
      sessionStorage: { ...sessionStorage },
    }),
  });

  return {
    cookies,
    localStorage: storageResult.result.localStorage,
    sessionStorage: storageResult.result.sessionStorage,
    url: tab.url || '',
  };
}

/**
 * Scroll to an element
 */
export async function scrollToElement(tabId: number, selector: string): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string) => {
      const element = document.querySelector(sel);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
    args: [selector],
  });
}

/**
 * Get the best selector for an element
 */
export async function getBestSelector(tabId: number, x: number, y: number): Promise<string | null> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (clientX: number, clientY: number) => {
      const element = document.elementFromPoint(clientX, clientY);
      if (!element) return null;

      // Priority: id > data-testid > aria-label > unique class > tag path
      if (element.id) return `#${element.id}`;
      if (element.getAttribute('data-testid')) return `[data-testid="${element.getAttribute('data-testid')}"]`;
      if (element.getAttribute('aria-label')) return `[aria-label="${element.getAttribute('aria-label')}"]`;

      // Build a more specific selector
      const tag = element.tagName.toLowerCase();
      const text = element.textContent?.trim().slice(0, 30);
      if (text && ['button', 'a', 'span', 'div'].includes(tag)) {
        return `${tag}:contains("${text}")`;
      }

      return null;
    },
    args: [x, y],
  });

  return result.result as string | null;
}
