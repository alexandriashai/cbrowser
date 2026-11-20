/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Custom dropdowns and inputs
 *
 * Hidden <select> elements behind custom dropdown UIs (Alpine.js, React Select, etc.) and custom inputs.
 *
 * These are the bodies of CBrowser methods, moved out of src/browser.ts by
 * capability. Each method is still declared on the class there, with its
 * documentation, and calls the function of the same name here with the
 * instance as `this`.
 */

import type { Locator } from "playwright";
import type { CBrowser } from "../browser.js";

// =========================================================================
// Custom Dropdown Handling (v8.8.0)
// =========================================================================

export async function isElementHidden(this: CBrowser, element: Locator): Promise<boolean> {
  try {
    const isHidden = await element.evaluate((el: Element) => {
      const style = getComputedStyle(el);

      // Check common hiding methods
      if (style.display === 'none') return true;
      if (style.visibility === 'hidden') return true;
      if (style.opacity === '0') return true;

      // Check for zero dimensions
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return true;

      // Check for off-screen positioning
      if (rect.right < 0 || rect.bottom < 0) return true;
      if (rect.left > window.innerWidth || rect.top > window.innerHeight) return true;

      // Check for clip-path hiding
      if (style.clipPath === 'inset(100%)' || style.clip === 'rect(0, 0, 0, 0)') return true;

      // Check for sr-only / screen-reader-only patterns
      if (style.position === 'absolute' &&
          (parseInt(style.width) === 1 || parseInt(style.height) === 1) &&
          style.overflow === 'hidden') return true;

      return false;
    });

    return isHidden;
  } catch {
    return false;
  }
}

export async function findCustomDropdownTrigger(this: CBrowser, hiddenSelect: Locator): Promise<Locator | null> {
  const page = await this.getPage();

  try {
    // Get info about the hidden select to help find its trigger
    const selectInfo = await hiddenSelect.evaluate((el: Element) => {
      const select = el as HTMLSelectElement;
      return {
        id: select.id,
        name: select.name,
        parentId: select.parentElement?.id,
        parentClasses: select.parentElement?.className,
        // Check for Alpine.js x-model binding
        xModel: select.getAttribute('x-model'),
        // Check for aria associations
        ariaLabelledBy: select.getAttribute('aria-labelledby'),
      };
    });

    // Strategy 1: Look for adjacent sibling that's visible (common Alpine pattern)
    const adjacentTrigger = await page.evaluate((selectInfo) => {
      let select: Element | null = null;

      // Find the select by various methods
      if (selectInfo.id) {
        select = document.getElementById(selectInfo.id);
      }
      if (!select && selectInfo.name) {
        select = document.querySelector(`select[name="${selectInfo.name}"]`);
      }

      if (!select) return null;

      // Check next sibling
      let sibling = select.nextElementSibling;
      while (sibling) {
        const style = getComputedStyle(sibling);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          // Check if it looks like a dropdown trigger
          const hasClickIndicator = sibling.querySelector('[class*="chevron"], [class*="arrow"], [class*="caret"], svg') !== null;
          const hasRole = sibling.getAttribute('role') === 'button' || sibling.getAttribute('role') === 'combobox';
          const isButton = sibling.tagName === 'BUTTON';
          const hasDropdownClass = /dropdown|select|trigger|toggle/i.test(sibling.className);

          if (hasClickIndicator || hasRole || isButton || hasDropdownClass) {
            // Return a selector for this element
            if (sibling.id) return `#${sibling.id}`;
            if (sibling.className) return `.${String((sibling.className as unknown as { baseVal?: string })?.baseVal ?? sibling.className ?? "").split(' ')[0]}`;
            return null;
          }
        }
        sibling = sibling.nextElementSibling;
      }

      return null;
    }, selectInfo);

    if (adjacentTrigger) {
      const trigger = page.locator(adjacentTrigger).first();
      if (await trigger.isVisible()) {
        return trigger;
      }
    }

    // Strategy 2: Look for parent container with click handler/dropdown classes
    const parentTrigger = await page.evaluate((selectInfo) => {
      let select: Element | null = null;

      if (selectInfo.id) {
        select = document.getElementById(selectInfo.id);
      }
      if (!select && selectInfo.name) {
        select = document.querySelector(`select[name="${selectInfo.name}"]`);
      }

      if (!select) return null;

      // Walk up to find a clickable parent container
      let parent = select.parentElement;
      let depth = 0;
      while (parent && depth < 5) {
        const style = getComputedStyle(parent);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          // Check for Alpine x-data (indicates interactive component)
          const hasAlpineData = parent.hasAttribute('x-data');
          const hasDropdownClass = /dropdown|select|combobox|listbox/i.test(parent.className);
          const hasRole = parent.getAttribute('role') === 'combobox' || parent.getAttribute('role') === 'listbox';

          if (hasAlpineData || hasDropdownClass || hasRole) {
            // Look for a visible clickable child
            const clickable = parent.querySelector('button, [role="button"], [tabindex="0"], div[class*="trigger"], div[class*="selected"]');
            if (clickable) {
              const clickableStyle = getComputedStyle(clickable);
              if (clickableStyle.display !== 'none') {
                if ((clickable as HTMLElement).id) return `#${(clickable as HTMLElement).id}`;
                if (clickable.className) return `.${String((clickable.className as unknown as { baseVal?: string })?.baseVal ?? clickable.className ?? "").split(' ')[0]}`;
              }
            }

            // If parent itself looks clickable
            if (parent.id) return `#${parent.id}`;
            if (parent.className) return `.${String((parent.className as unknown as { baseVal?: string })?.baseVal ?? parent.className ?? "").split(' ')[0]}`;
          }
        }
        parent = parent.parentElement;
        depth++;
      }

      return null;
    }, selectInfo);

    if (parentTrigger) {
      const trigger = page.locator(parentTrigger).first();
      if (await trigger.isVisible()) {
        return trigger;
      }
    }

    // Strategy 3: Look for aria-controls or aria-labelledby relationships
    if (selectInfo.ariaLabelledBy) {
      const trigger = page.locator(`#${selectInfo.ariaLabelledBy}`).first();
      if (await trigger.isVisible()) {
        return trigger;
      }
    }

    // Strategy 4: Find any visible element with matching x-model (Alpine.js)
    if (selectInfo.xModel) {
      const alpineTrigger = await page.evaluate((xModel) => {
        // Look for visible elements with same x-model that aren't the select
        const elements = Array.from(document.querySelectorAll(`[x-model="${xModel}"], [\\@click*="${xModel}"]`));
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          if (el.tagName !== 'SELECT') {
            const style = getComputedStyle(el);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
              if (el.id) return `#${el.id}`;
              if (el.className) return `.${String((el.className as unknown as { baseVal?: string })?.baseVal ?? el.className ?? "").split(' ')[0]}`;
            }
          }
        }
        return null;
      }, selectInfo.xModel);

      if (alpineTrigger) {
        const trigger = page.locator(alpineTrigger).first();
        if (await trigger.isVisible()) {
          return trigger;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function selectCustomDropdownOption(
  this: CBrowser,
  trigger: Locator,
  optionValue: string,
  options: { timeout?: number; verbose?: boolean } = {}
): Promise<{ success: boolean; strategy?: string; error?: string }> {
  const page = await this.getPage();
  const _timeout = options.timeout ?? 5000;

  try {
    // Click the trigger to open the dropdown
    if (options.verbose) console.log(`  Opening dropdown by clicking trigger`);
    await trigger.click();

    // Wait for dropdown options to appear
    // Try multiple common patterns for option containers
    const _optionSelectors = [
      // Alpine.js / Headless UI patterns
      '[x-show]:not([x-show="false"])',
      '[role="listbox"]',
      '[role="menu"]',
      '[role="option"]',
      // Common class patterns
      '[class*="dropdown-menu"]:not([class*="hidden"])',
      '[class*="select-options"]',
      '[class*="listbox-options"]',
      '[class*="menu-items"]',
      // Generic visible dropdown
      '.dropdown-content:visible',
      '.dropdown-options',
      // React Select patterns
      '[class*="menu"]',
      '[class*="MenuList"]',
    ];

    await page.waitForTimeout(200); // Brief wait for animation

    // Find the option with matching text
    if (options.verbose) console.log(`  Looking for option: "${optionValue}"`);

    // Strategy 1: Find by exact text match
    const optionByText = page.getByRole('option', { name: optionValue });
    if (await optionByText.isVisible({ timeout: 500 }).catch(() => false)) {
      await optionByText.click();
      return { success: true, strategy: 'role-option-exact' };
    }

    // Strategy 2: Find by partial text match in role=option
    const optionByPartial = page.locator('[role="option"]').filter({ hasText: optionValue }).first();
    if (await optionByPartial.isVisible({ timeout: 500 }).catch(() => false)) {
      await optionByPartial.click();
      return { success: true, strategy: 'role-option-partial' };
    }

    // Strategy 3: Find by li elements (common dropdown pattern)
    const liOption = page.locator('li').filter({ hasText: optionValue }).first();
    if (await liOption.isVisible({ timeout: 500 }).catch(() => false)) {
      await liOption.click();
      return { success: true, strategy: 'li-element' };
    }

    // Strategy 4: Find any clickable element with the text
    const anyOption = page.locator(`text="${optionValue}"`).first();
    if (await anyOption.isVisible({ timeout: 500 }).catch(() => false)) {
      await anyOption.click();
      return { success: true, strategy: 'text-match' };
    }

    // Strategy 5: Find by data-value attribute
    const dataValueOption = page.locator(`[data-value="${optionValue}"], [value="${optionValue}"]`).first();
    if (await dataValueOption.isVisible({ timeout: 500 }).catch(() => false)) {
      await dataValueOption.click();
      return { success: true, strategy: 'data-value' };
    }

    // If we couldn't find the option, close dropdown and report
    await page.keyboard.press('Escape');

    return {
      success: false,
      error: `Could not find option "${optionValue}" in dropdown`
    };

  } catch (e) {
    // Try to close any open dropdown
    await page.keyboard.press('Escape').catch(() => {});

    return {
      success: false,
      error: `Custom dropdown selection failed: ${e instanceof Error ? e.message : String(e)}`
    };
  }
}

export async function handleCustomDropdown(
  this: CBrowser,
  hiddenSelect: Locator,
  value: string,
  options: { verbose?: boolean } = {}
): Promise<{ success: boolean; strategy?: string; error?: string }> {
  if (options.verbose) console.log(`  Detected hidden select, looking for custom dropdown trigger`);

  // Find the visible trigger element
  const trigger = await this.findCustomDropdownTrigger(hiddenSelect);

  if (!trigger) {
    return {
      success: false,
      error: 'Could not find custom dropdown trigger for hidden select'
    };
  }

  if (options.verbose) console.log(`  Found dropdown trigger`);

  // Try to select the option
  const result = await this.selectCustomDropdownOption(trigger, value, options);

  return result;
}

export async function handleCustomInput(
  this: CBrowser,
  hiddenInput: Locator,
  value: string,
  _options: { verbose?: boolean } = {}
): Promise<{ success: boolean; strategy?: string; error?: string }> {
  const page = await this.getPage();

  try {
    // Get input info to help find its visible counterpart
    const inputInfo = await hiddenInput.evaluate((el: Element) => {
      const input = el as HTMLInputElement;
      return {
        id: input.id,
        name: input.name,
        type: input.type,
        ariaLabelledBy: input.getAttribute('aria-labelledby'),
        xModel: input.getAttribute('x-model'),
      };
    });

    // Strategy 1: Look for visible sibling input or wrapper
    const adjacentVisible = await page.evaluate((inputInfo) => {
      let input: Element | null = null;

      if (inputInfo.id) input = document.getElementById(inputInfo.id);
      if (!input && inputInfo.name) input = document.querySelector(`input[name="${inputInfo.name}"]`);

      if (!input) return null;

      // Check parent container for visible input
      const parent = input.closest('[x-data], .form-group, .input-wrapper, .field-container');
      if (parent) {
        const visibleInputs = Array.from(parent.querySelectorAll('input:not([type="hidden"])'));
        for (let i = 0; i < visibleInputs.length; i++) {
          const vi = visibleInputs[i] as HTMLInputElement;
          const style = getComputedStyle(vi);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            if (vi.id) return { selector: `#${vi.id}`, type: 'visible-input' };
            if (vi.name) return { selector: `input[name="${vi.name}"]`, type: 'visible-input' };
          }
        }

        // Check for text display element that might be the "face" of a custom input
        const textDisplay = parent.querySelector('[contenteditable="true"], .editable, .input-display');
        if (textDisplay) {
          const style = getComputedStyle(textDisplay);
          if (style.display !== 'none') {
            if (textDisplay.id) return { selector: `#${textDisplay.id}`, type: 'contenteditable' };
          }
        }
      }

      return null;
    }, inputInfo);

    if (adjacentVisible) {
      if (adjacentVisible.type === 'visible-input') {
        const visibleInput = page.locator(adjacentVisible.selector).first();
        await visibleInput.fill(value);
        return { success: true, strategy: 'visible-sibling-input' };
      } else if (adjacentVisible.type === 'contenteditable') {
        const editableEl = page.locator(adjacentVisible.selector).first();
        await editableEl.click();
        await editableEl.fill(value);
        return { success: true, strategy: 'contenteditable' };
      }
    }

    // Strategy 2: For datepickers, try clicking the wrapper and typing
    if (inputInfo.type === 'date' || inputInfo.type === 'datetime-local' || inputInfo.type === 'time') {
      const wrapper = await page.evaluate((inputInfo) => {
        let input: Element | null = null;
        if (inputInfo.id) input = document.getElementById(inputInfo.id);
        if (!input && inputInfo.name) input = document.querySelector(`input[name="${inputInfo.name}"]`);
        if (!input) return null;

        const parent = input.closest('.datepicker, .date-input, [class*="picker"]');
        if (parent) {
          if ((parent as HTMLElement).id) return `#${(parent as HTMLElement).id}`;
        }
        return null;
      }, inputInfo);

      if (wrapper) {
        const wrapperEl = page.locator(wrapper).first();
        await wrapperEl.click();
        await page.keyboard.type(value);
        return { success: true, strategy: 'datepicker-type' };
      }
    }

    // Strategy 3: Set value directly via JavaScript (last resort)
    // v14.3.0: Use native setter + InputEvent for React compatibility
    // v17.4.1: Enhanced event dispatch for jQuery/vanilla JS compatibility
    await hiddenInput.evaluate((el: Element, val: string) => {
      const input = el as HTMLInputElement;

      // Focus the element first (required for many event listeners)
      input.focus();
      el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
      el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

      // Clear existing value
      input.value = '';

      // Get the native value setter to bypass React's synthetic property
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;
      const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      )?.set;

      // Use native setter if available (required for React state sync)
      if (input.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
        nativeTextAreaValueSetter.call(input, val);
      } else if (nativeInputValueSetter) {
        nativeInputValueSetter.call(input, val);
      } else {
        input.value = val;
      }

      // Dispatch comprehensive events for framework compatibility
      // 1. KeyboardEvents (jQuery and vanilla JS often listen to these)
      const lastChar = val.slice(-1);
      const keyboardEventInit = {
        bubbles: true,
        cancelable: true,
        key: lastChar,
        code: `Key${lastChar.toUpperCase()}`,
        keyCode: lastChar.charCodeAt(0),
        which: lastChar.charCodeAt(0),
      };
      el.dispatchEvent(new KeyboardEvent('keydown', keyboardEventInit));
      el.dispatchEvent(new KeyboardEvent('keypress', keyboardEventInit));
      el.dispatchEvent(new KeyboardEvent('keyup', keyboardEventInit));

      // 2. InputEvent (React and modern frameworks)
      el.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: val
      }));

      // 3. Change event (form validation, jQuery .change())
      el.dispatchEvent(new Event('change', { bubbles: true }));

      // 4. Blur events (trigger validation on blur)
      el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    }, value);

    return { success: true, strategy: 'js-value-set' };

  } catch (e) {
    return {
      success: false,
      error: `Custom input handling failed: ${e instanceof Error ? e.message : String(e)}`
    };
  }
}
