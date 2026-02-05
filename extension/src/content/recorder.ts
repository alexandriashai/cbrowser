/**
 * CBrowser Extension - Flow Recorder Content Script
 * Captures user interactions and exports as NL test format
 */

import type { RecordedStep, JourneyEvent, JourneyRecording } from '../shared/types';

interface RecorderState {
  recording: boolean;
  steps: RecordedStep[];
  startUrl: string;
  // Journey tracking
  journeyEvents: JourneyEvent[];
  journeyStartTime: number;
  lastMouseTime: number;
}

const recorderState: RecorderState = {
  recording: false,
  steps: [],
  startUrl: '',
  journeyEvents: [],
  journeyStartTime: 0,
  lastMouseTime: 0,
};

let stepCounter = 0;
const MOUSE_THROTTLE_MS = 50; // Capture mouse position every 50ms (20fps)

/**
 * Generate a unique step ID
 */
function generateStepId(): string {
  return `step-${Date.now()}-${++stepCounter}`;
}

/**
 * Get the best description for an element (for NL test output)
 */
function describeElement(el: HTMLElement): string {
  // Priority: aria-label > visible text > placeholder > id > name > selector

  // 1. Aria label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  // 2. Visible text (for buttons, links)
  const text = el.textContent?.trim();
  if (text && text.length < 50 && ['BUTTON', 'A', 'SPAN'].includes(el.tagName)) {
    return text;
  }

  // 3. Placeholder (for inputs)
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder;

  // 4. Value of submit buttons
  if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'submit') {
    return (el as HTMLInputElement).value || 'submit button';
  }

  // 5. Associated label
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label?.textContent) return label.textContent.trim();
  }

  // 6. Name attribute
  const name = el.getAttribute('name');
  if (name) return name;

  // 7. ID
  if (el.id) return `#${el.id}`;

  // 8. Fallback to tag + classes
  const classes = Array.from(el.classList).slice(0, 2).join('.');
  return classes ? `${el.tagName.toLowerCase()}.${classes}` : el.tagName.toLowerCase();
}

/**
 * Get selector for an element
 */
function getSelector(el: Element): string {
  if (el.id) return `#${el.id}`;
  if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
  if (el.getAttribute('aria-label')) return `[aria-label="${el.getAttribute('aria-label')}"]`;

  const tag = el.tagName.toLowerCase();
  const classes = Array.from(el.classList).slice(0, 2).join('.');
  return classes ? `${tag}.${classes}` : tag;
}

/**
 * Record a step
 */
function recordStep(step: Omit<RecordedStep, 'id' | 'timestamp'>): void {
  if (!recorderState.recording) return;

  const fullStep: RecordedStep = {
    id: generateStepId(),
    timestamp: Date.now(),
    ...step,
  };

  recorderState.steps.push(fullStep);

  // Send to background script
  chrome.runtime.sendMessage({
    type: 'STEP_RECORDED',
    step: fullStep,
  });
}

/**
 * Record a journey event (mouse, click, scroll)
 */
function recordJourneyEvent(event: Omit<JourneyEvent, 'timestamp'>): void {
  if (!recorderState.recording) return;

  recorderState.journeyEvents.push({
    ...event,
    timestamp: Date.now() - recorderState.journeyStartTime,
  });
}

/**
 * Handle mouse move events (throttled)
 */
function handleMouseMove(e: MouseEvent): void {
  if (!recorderState.recording) return;

  const now = Date.now();
  if (now - recorderState.lastMouseTime < MOUSE_THROTTLE_MS) return;
  recorderState.lastMouseTime = now;

  recordJourneyEvent({
    type: 'mouse',
    x: e.clientX,
    y: e.clientY,
  });
}

/**
 * Handle scroll events (throttled)
 */
let lastScrollTime = 0;
function handleScroll(): void {
  if (!recorderState.recording) return;

  const now = Date.now();
  if (now - lastScrollTime < 100) return; // Throttle to 10fps
  lastScrollTime = now;

  recordJourneyEvent({
    type: 'scroll',
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  });
}

/**
 * Handle click events
 */
function handleClick(e: MouseEvent): void {
  if (!recorderState.recording) return;

  const target = e.target as HTMLElement;
  if (!target) return;

  // Skip if it's our own UI
  if (target.closest('[data-cbrowser-ignore]')) return;

  // Record journey click event with coordinates
  recordJourneyEvent({
    type: 'click',
    x: e.clientX,
    y: e.clientY,
    target: getSelector(target),
    button: e.button,
  });

  const description = describeElement(target);

  recordStep({
    action: 'click',
    target: description,
    description: `Click on "${description}"`,
  });
}

/**
 * Handle input changes
 */
function handleInput(e: Event): void {
  if (!recorderState.recording) return;

  const target = e.target as HTMLInputElement | HTMLTextAreaElement;
  if (!target) return;
  if (!['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

  // Skip password fields (don't record actual passwords)
  if ((target as HTMLInputElement).type === 'password') {
    recordStep({
      action: 'fill',
      target: describeElement(target),
      value: '***',
      description: `Fill "${describeElement(target)}" with password`,
    });
    return;
  }

  // Debounce - only record when user pauses typing
  const timeoutId = (target as any).__cbrowserTimeout;
  if (timeoutId) clearTimeout(timeoutId);

  (target as any).__cbrowserTimeout = setTimeout(() => {
    recordStep({
      action: 'fill',
      target: describeElement(target),
      value: target.value,
      description: `Fill "${describeElement(target)}" with "${target.value}"`,
    });
  }, 500);
}

/**
 * Handle select changes
 */
function handleSelectChange(e: Event): void {
  if (!recorderState.recording) return;

  const target = e.target as HTMLSelectElement;
  if (!target || target.tagName !== 'SELECT') return;

  const selectedOption = target.options[target.selectedIndex];
  const value = selectedOption?.text || target.value;

  recordStep({
    action: 'select',
    target: describeElement(target),
    value,
    description: `Select "${value}" from "${describeElement(target)}"`,
  });
}

/**
 * Handle form submissions
 */
function handleSubmit(e: SubmitEvent): void {
  if (!recorderState.recording) return;

  const form = e.target as HTMLFormElement;
  const submitBtn = form.querySelector('[type="submit"], button:not([type="button"])');

  recordStep({
    action: 'click',
    target: submitBtn ? describeElement(submitBtn as HTMLElement) : 'submit button',
    description: 'Submit form',
  });
}

/**
 * Handle navigation (popstate, initial load)
 */
function recordNavigation(): void {
  if (!recorderState.recording) return;

  recordStep({
    action: 'navigate',
    url: window.location.href,
    description: `Navigate to "${window.location.href}"`,
  });
}

/**
 * Start recording
 */
function startRecording(): void {
  recorderState.recording = true;
  recorderState.steps = [];
  recorderState.startUrl = window.location.href;
  recorderState.journeyEvents = [];
  recorderState.journeyStartTime = Date.now();
  recorderState.lastMouseTime = 0;
  stepCounter = 0;

  // Record initial navigation
  recordStep({
    action: 'navigate',
    url: window.location.href,
    description: `Navigate to "${window.location.href}"`,
  });

  // Record initial journey navigation
  recordJourneyEvent({
    type: 'navigation',
    url: window.location.href,
  });

  // Add event listeners
  document.addEventListener('click', handleClick, true);
  document.addEventListener('input', handleInput, true);
  document.addEventListener('change', handleSelectChange, true);
  document.addEventListener('submit', handleSubmit, true);
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('scroll', handleScroll, true);
  window.addEventListener('popstate', recordNavigation);
}

/**
 * Stop recording and return steps
 */
function stopRecording(): { steps: RecordedStep[]; journey: JourneyRecording } {
  recorderState.recording = false;

  // Remove event listeners
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('input', handleInput, true);
  document.removeEventListener('change', handleSelectChange, true);
  document.removeEventListener('submit', handleSubmit, true);
  document.removeEventListener('mousemove', handleMouseMove, true);
  document.removeEventListener('scroll', handleScroll, true);
  window.removeEventListener('popstate', recordNavigation);

  const journey: JourneyRecording = {
    id: `journey-${Date.now()}`,
    startUrl: recorderState.startUrl,
    startedAt: recorderState.journeyStartTime,
    endedAt: Date.now(),
    events: recorderState.journeyEvents,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  };

  return { steps: recorderState.steps, journey };
}

/**
 * Export steps as Natural Language test format
 */
function exportAsNLTest(steps: RecordedStep[]): string {
  const lines: string[] = ['# Test: Recorded Flow', ''];

  for (const step of steps) {
    switch (step.action) {
      case 'navigate':
        lines.push(`go to "${step.url}"`);
        break;
      case 'click':
        lines.push(`click "${step.target}"`);
        break;
      case 'fill':
        lines.push(`type "${step.value}" in "${step.target}"`);
        break;
      case 'select':
        lines.push(`select "${step.value}" from "${step.target}"`);
        break;
      case 'wait':
        lines.push(`wait ${step.value} seconds`);
        break;
      case 'assert':
        lines.push(`verify ${step.value}`);
        break;
      default:
        lines.push(`# ${step.action}: ${step.target || step.value || ''}`);
    }
  }

  return lines.join('\n');
}

/**
 * Export steps as TypeScript/Playwright code
 */
function exportAsTypeScript(steps: RecordedStep[]): string {
  const lines: string[] = [
    "import { test, expect } from '@playwright/test';",
    '',
    "test('Recorded Flow', async ({ page }) => {",
  ];

  for (const step of steps) {
    switch (step.action) {
      case 'navigate':
        lines.push(`  await page.goto('${step.url}');`);
        break;
      case 'click':
        lines.push(`  await page.getByRole('button', { name: '${step.target}' }).click();`);
        break;
      case 'fill':
        lines.push(`  await page.getByPlaceholder('${step.target}').fill('${step.value}');`);
        break;
      case 'select':
        lines.push(`  await page.selectOption('[name="${step.target}"]', '${step.value}');`);
        break;
      case 'wait':
        lines.push(`  await page.waitForTimeout(${(parseFloat(step.value || '1') * 1000)});`);
        break;
      default:
        lines.push(`  // ${step.action}: ${step.target || step.value || ''}`);
    }
  }

  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

// Listen for messages from background/sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'START_RECORDING':
      startRecording();
      sendResponse({ success: true });
      break;

    case 'STOP_RECORDING':
      const result = stopRecording();
      sendResponse({
        success: true,
        steps: result.steps,
        journey: result.journey,
        nlTest: exportAsNLTest(result.steps),
        typescript: exportAsTypeScript(result.steps),
      });
      break;

    case 'GET_RECORDING_STATUS':
      sendResponse({
        recording: recorderState.recording,
        stepCount: recorderState.steps.length,
      });
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  return true; // Keep channel open for async response
});

// Export for testing
export {
  startRecording,
  stopRecording,
  exportAsNLTest,
  exportAsTypeScript,
  describeElement,
  getSelector,
};
