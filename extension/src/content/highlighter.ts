/**
 * CBrowser Extension - Element Inspector & Highlighter
 * Provides visual overlay for element selection and inspection
 */

import type { ElementInfo } from '../shared/types';

interface HighlighterState {
  active: boolean;
  hoveredElement: HTMLElement | null;
  selectedElement: HTMLElement | null;
  overlay: HTMLDivElement | null;
  tooltip: HTMLDivElement | null;
}

const highlighterState: HighlighterState = {
  active: false,
  hoveredElement: null,
  selectedElement: null,
  overlay: null,
  tooltip: null,
};

/**
 * Create the highlight overlay element
 */
function createOverlay(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.id = 'cbrowser-highlight-overlay';
  overlay.setAttribute('data-cbrowser-ignore', 'true');
  overlay.style.cssText = `
    position: fixed;
    pointer-events: none;
    z-index: 2147483646;
    border: 2px solid #3b82f6;
    background: rgba(59, 130, 246, 0.1);
    transition: all 0.1s ease;
  `;
  return overlay;
}

/**
 * Create the tooltip element
 */
function createTooltip(): HTMLDivElement {
  const tooltip = document.createElement('div');
  tooltip.id = 'cbrowser-tooltip';
  tooltip.setAttribute('data-cbrowser-ignore', 'true');
  tooltip.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    background: #1e293b;
    color: #f1f5f9;
    padding: 8px 12px;
    border-radius: 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
    line-height: 1.4;
    max-width: 400px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease;
  `;
  return tooltip;
}

/**
 * Get element information for display
 */
function getElementInfo(el: HTMLElement): ElementInfo {
  const rect = el.getBoundingClientRect();

  // Build selector
  let selector = el.tagName.toLowerCase();
  if (el.id) selector = `#${el.id}`;
  else if (el.getAttribute('data-testid')) selector = `[data-testid="${el.getAttribute('data-testid')}"]`;
  else if (el.getAttribute('aria-label')) selector = `[aria-label="${el.getAttribute('aria-label')}"]`;
  else if (el.classList.length > 0) {
    selector = `${el.tagName.toLowerCase()}.${Array.from(el.classList).slice(0, 2).join('.')}`;
  }

  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || undefined,
    classes: Array.from(el.classList),
    text: el.textContent?.trim().slice(0, 50) || undefined,
    selector,
    ariaLabel: el.getAttribute('aria-label') || undefined,
    role: el.getAttribute('role') || undefined,
    rect: rect as DOMRect,
  };
}

/**
 * Format element info for tooltip display
 */
function formatTooltipContent(info: ElementInfo): string {
  const lines: string[] = [];

  // Tag and selector
  lines.push(`<span style="color: #93c5fd;">&lt;${info.tag}&gt;</span>`);
  lines.push(`<span style="color: #a5b4fc;">${info.selector}</span>`);

  // ID
  if (info.id) {
    lines.push(`<span style="color: #6b7280;">id:</span> ${info.id}`);
  }

  // Classes
  if (info.classes.length > 0) {
    lines.push(`<span style="color: #6b7280;">class:</span> ${info.classes.slice(0, 3).join(' ')}`);
  }

  // Text content
  if (info.text) {
    lines.push(`<span style="color: #6b7280;">text:</span> "${info.text.slice(0, 30)}${info.text.length > 30 ? '...' : ''}"`);
  }

  // Aria label
  if (info.ariaLabel) {
    lines.push(`<span style="color: #6b7280;">aria-label:</span> "${info.ariaLabel}"`);
  }

  // Role
  if (info.role) {
    lines.push(`<span style="color: #6b7280;">role:</span> ${info.role}`);
  }

  // Dimensions
  lines.push(`<span style="color: #6b7280;">size:</span> ${Math.round(info.rect.width)}×${Math.round(info.rect.height)}`);

  return lines.join('<br>');
}

/**
 * Position the tooltip near the element
 */
function positionTooltip(rect: DOMRect): void {
  if (!highlighterState.tooltip) return;

  const tooltipRect = highlighterState.tooltip.getBoundingClientRect();
  const padding = 8;

  // Default: below the element
  let top = rect.bottom + padding;
  let left = rect.left;

  // If tooltip would go off screen bottom, show above
  if (top + tooltipRect.height > window.innerHeight) {
    top = rect.top - tooltipRect.height - padding;
  }

  // If tooltip would go off screen right, shift left
  if (left + tooltipRect.width > window.innerWidth) {
    left = window.innerWidth - tooltipRect.width - padding;
  }

  // Ensure not off left edge
  left = Math.max(padding, left);

  highlighterState.tooltip.style.top = `${top}px`;
  highlighterState.tooltip.style.left = `${left}px`;
}

/**
 * Update the highlight overlay position
 */
function updateHighlight(el: HTMLElement): void {
  if (!highlighterState.overlay || !highlighterState.tooltip) return;

  const rect = el.getBoundingClientRect();

  // Update overlay position
  highlighterState.overlay.style.top = `${rect.top}px`;
  highlighterState.overlay.style.left = `${rect.left}px`;
  highlighterState.overlay.style.width = `${rect.width}px`;
  highlighterState.overlay.style.height = `${rect.height}px`;

  // Update tooltip
  const info = getElementInfo(el);
  highlighterState.tooltip.innerHTML = formatTooltipContent(info);
  highlighterState.tooltip.style.opacity = '1';

  // Position tooltip after content is set (to get accurate dimensions)
  requestAnimationFrame(() => positionTooltip(rect));
}

/**
 * Handle mouse move during inspection
 */
function handleMouseMove(e: MouseEvent): void {
  if (!highlighterState.active) return;

  // Ignore our own elements
  const target = e.target as HTMLElement;
  if (target.closest('[data-cbrowser-ignore]')) return;

  // Update hovered element
  if (target !== highlighterState.hoveredElement) {
    highlighterState.hoveredElement = target;
    updateHighlight(target);
  }
}

/**
 * Handle click during inspection
 */
function handleClick(e: MouseEvent): void {
  if (!highlighterState.active) return;

  const target = e.target as HTMLElement;
  if (target.closest('[data-cbrowser-ignore]')) return;

  // Prevent default behavior
  e.preventDefault();
  e.stopPropagation();

  // Set selected element
  highlighterState.selectedElement = target;

  // Change overlay color to indicate selection
  if (highlighterState.overlay) {
    highlighterState.overlay.style.borderColor = '#22c55e';
    highlighterState.overlay.style.background = 'rgba(34, 197, 94, 0.1)';
  }

  // Get element info
  const info = getElementInfo(target);

  // Send to background/sidepanel
  chrome.runtime.sendMessage({
    type: 'ELEMENT_SELECTED',
    element: info,
  });
}

/**
 * Handle keydown during inspection
 */
function handleKeyDown(e: KeyboardEvent): void {
  if (!highlighterState.active) return;

  // Escape to cancel
  if (e.key === 'Escape') {
    stopInspector();
    chrome.runtime.sendMessage({ type: 'DISABLE_INSPECTOR' });
  }
}

/**
 * Start the element inspector
 */
export function startInspector(): void {
  if (highlighterState.active) return;

  highlighterState.active = true;

  // Create overlay and tooltip
  highlighterState.overlay = createOverlay();
  highlighterState.tooltip = createTooltip();
  document.body.appendChild(highlighterState.overlay);
  document.body.appendChild(highlighterState.tooltip);

  // Add event listeners
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown, true);

  // Change cursor
  document.body.style.cursor = 'crosshair';
}

/**
 * Stop the element inspector
 */
export function stopInspector(): void {
  if (!highlighterState.active) return;

  highlighterState.active = false;
  highlighterState.hoveredElement = null;
  highlighterState.selectedElement = null;

  // Remove overlay and tooltip
  highlighterState.overlay?.remove();
  highlighterState.tooltip?.remove();
  highlighterState.overlay = null;
  highlighterState.tooltip = null;

  // Remove event listeners
  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleKeyDown, true);

  // Reset cursor
  document.body.style.cursor = '';
}

/**
 * Get the currently selected element info
 */
export function getSelectedElement(): ElementInfo | null {
  if (!highlighterState.selectedElement) return null;
  return getElementInfo(highlighterState.selectedElement);
}

/**
 * Highlight a specific element by selector (for a11y issue highlighting)
 */
export function highlightElement(selector: string): boolean {
  try {
    const el = document.querySelector(selector) as HTMLElement;
    if (!el) return false;

    // Create or reuse overlay
    if (!highlighterState.overlay) {
      highlighterState.overlay = createOverlay();
      document.body.appendChild(highlighterState.overlay);
    }
    if (!highlighterState.tooltip) {
      highlighterState.tooltip = createTooltip();
      document.body.appendChild(highlighterState.tooltip);
    }

    // Style for "issue" highlighting (orange/warning color)
    highlighterState.overlay.style.borderColor = '#f59e0b';
    highlighterState.overlay.style.background = 'rgba(245, 158, 11, 0.15)';

    // Scroll element into view
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Update highlight position
    updateHighlight(el);

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Clear any active highlight
 */
export function clearHighlight(): void {
  if (highlighterState.overlay) {
    highlighterState.overlay.remove();
    highlighterState.overlay = null;
  }
  if (highlighterState.tooltip) {
    highlighterState.tooltip.remove();
    highlighterState.tooltip = null;
  }
}

// Listen for messages from background/sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'ENABLE_INSPECTOR':
      startInspector();
      sendResponse({ success: true });
      break;

    case 'DISABLE_INSPECTOR':
      stopInspector();
      sendResponse({ success: true });
      break;

    case 'GET_SELECTED_ELEMENT':
      sendResponse({
        element: getSelectedElement(),
      });
      break;

    case 'HIGHLIGHT_ELEMENT':
      const found = highlightElement(message.selector);
      sendResponse({ success: found, selector: message.selector });
      break;

    case 'CLEAR_HIGHLIGHT':
      clearHighlight();
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  return true;
});

// Export for testing
export { getElementInfo, formatTooltipContent };
