/**
 * CBrowser Extension - Service Worker (Background Script)
 * Routes messages between content scripts, sidepanel, and MCP server
 */

import type {
  RecordedStep,
  ElementInfo,
  ExtensionSettings,
  PageSnapshot,
} from '../shared/types';
import {
  readPage,
  smartClick,
  fillInput,
  takeScreenshot,
  exportSession,
} from '../shared/local-tools';
import { getMCPBridge, setMCPBridge } from '../shared/mcp-client';

// ============================================
// State Management
// ============================================

interface BackgroundState {
  recording: boolean;
  recordedSteps: RecordedStep[];
  selectedElement: ElementInfo | null;
  consoleMessages: chrome.debugger.Debuggee[];
  networkRequests: Map<string, any>;
}

const state: BackgroundState = {
  recording: false,
  recordedSteps: [],
  selectedElement: null,
  consoleMessages: [],
  networkRequests: new Map(),
};

// ============================================
// Settings Management
// ============================================

const DEFAULT_SETTINGS: ExtensionSettings = {
  mcpServerUrl: 'https://cbrowser-mcp-demo.wyldfyre.ai',
  autoScreenshot: true,
  recordingHotkey: 'Ctrl+Shift+R',
  theme: 'system',
};

async function getSettings(): Promise<ExtensionSettings> {
  const result = await chrome.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...result.settings };
}

async function saveSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  await chrome.storage.sync.set({ settings: updated });

  // Update MCP bridge if server URL or auth token changed
  if (settings.mcpServerUrl || settings.mcpAuthToken !== undefined) {
    setMCPBridge({
      serverUrl: updated.mcpServerUrl,
      authToken: updated.mcpAuthToken,
    });
  }
}

// ============================================
// Tab Management
// ============================================

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

/**
 * Inject content scripts programmatically (for pages loaded before extension)
 */
async function injectContentScripts(tabId: number): Promise<void> {
  console.log('[CBrowser SW] Injecting content scripts into tab:', tabId);

  try {
    // Inject all content scripts
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/recorder.js', 'content/highlighter.js', 'content/journey-player.js'],
    });
    console.log('[CBrowser SW] Content scripts injected successfully');
  } catch (e) {
    console.error('[CBrowser SW] Failed to inject content scripts:', e);
    throw new Error('Cannot inject scripts into this page (may be a protected page)');
  }
}

/**
 * Send message to tab, injecting scripts if needed
 */
async function sendToContentScript(
  tabId: number,
  message: any,
  canInject: boolean = true
): Promise<any> {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (e: any) {
    if (canInject && e?.message?.includes('Could not establish connection')) {
      // Content script not loaded - inject and retry
      await injectContentScripts(tabId);
      // Small delay to let scripts initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      return await chrome.tabs.sendMessage(tabId, message);
    }
    throw e;
  }
}

async function executeInTab<T>(
  tabId: number,
  func: () => T | Promise<T>
): Promise<T> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
  });
  return result.result as T;
}

// ============================================
// Recording Management
// ============================================

async function startRecording(): Promise<void> {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error('No active tab');

  state.recording = true;
  state.recordedSteps = [];

  // Send message to content script (inject if needed)
  await sendToContentScript(tab.id, { type: 'START_RECORDING' });

  // Notify sidepanel
  broadcastToSidepanel({ type: 'RECORDING_STARTED' });
}

async function stopRecording(): Promise<{
  steps: RecordedStep[];
  journey: any;
  nlTest: string;
  typescript: string;
}> {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error('No active tab');

  state.recording = false;

  // Get recording from content script
  const response = await sendToContentScript(tab.id, { type: 'STOP_RECORDING' }, false);

  // Notify sidepanel
  broadcastToSidepanel({
    type: 'RECORDING_STOPPED',
    steps: response.steps,
    journey: response.journey,
    nlTest: response.nlTest,
    typescript: response.typescript,
  });

  return response;
}

// ============================================
// Message Broadcasting
// ============================================

function broadcastToSidepanel(message: any): void {
  // Send to all extension views (sidepanel)
  chrome.runtime.sendMessage(message).catch(() => {
    // Sidepanel might not be open, ignore errors
  });
}

// ============================================
// Message Handlers
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle async responses
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ error: error.message }));

  return true; // Keep channel open for async response
});

async function handleMessage(
  message: any,
  sender: chrome.runtime.MessageSender
): Promise<any> {
  const tab = await getActiveTab();

  switch (message.type) {
    // ============================================
    // Settings
    // ============================================
    case 'GET_SETTINGS':
      return await getSettings();

    case 'SAVE_SETTINGS':
      await saveSettings(message.settings);
      return { success: true };

    // ============================================
    // Recording
    // ============================================
    case 'START_RECORDING':
      await startRecording();
      return { success: true };

    case 'STOP_RECORDING':
      return await stopRecording();

    case 'GET_RECORDING_STATUS':
      return {
        recording: state.recording,
        stepCount: state.recordedSteps.length,
      };

    case 'STEP_RECORDED':
      // Forward step from content script to sidepanel
      state.recordedSteps.push(message.step);
      broadcastToSidepanel({
        type: 'STEP_RECORDED',
        step: message.step,
      });
      return { success: true };

    // ============================================
    // Page Analysis
    // ============================================
    case 'ANALYZE_PAGE':
      if (!tab?.id) throw new Error('No active tab');
      return await readPage(tab.id);

    case 'TAKE_SCREENSHOT':
      if (!tab?.id) throw new Error('No active tab');
      const screenshot = await takeScreenshot(tab.id);
      return { screenshot };

    // ============================================
    // Element Inspector
    // ============================================
    case 'ENABLE_INSPECTOR':
      console.log('[CBrowser SW] ENABLE_INSPECTOR received, tab:', tab?.id, tab?.url);
      if (!tab?.id) throw new Error('No active tab');
      // Check for protected pages
      const inspectUrl = tab.url || '';
      if (inspectUrl.startsWith('chrome://') || inspectUrl.startsWith('chrome-extension://') || inspectUrl.startsWith('about:')) {
        throw new Error('Cannot inspect browser pages (chrome://, about:, etc.)');
      }
      const inspectResult = await sendToContentScript(tab.id, { type: 'ENABLE_INSPECTOR' });
      console.log('[CBrowser SW] ENABLE_INSPECTOR result:', inspectResult);
      return { success: true };

    case 'DISABLE_INSPECTOR':
      if (!tab?.id) throw new Error('No active tab');
      try {
        await sendToContentScript(tab.id, { type: 'DISABLE_INSPECTOR' }, false);
        return { success: true };
      } catch {
        return { success: true }; // Already disabled or not loaded
      }

    case 'HIGHLIGHT_ELEMENT':
      console.log('[CBrowser SW] HIGHLIGHT_ELEMENT received:', message.selector);
      if (!tab?.id) throw new Error('No active tab');
      const highlightResult = await sendToContentScript(tab.id, {
        type: 'HIGHLIGHT_ELEMENT',
        selector: message.selector,
      });
      console.log('[CBrowser SW] HIGHLIGHT_ELEMENT result:', highlightResult);
      return highlightResult;

    case 'CLEAR_HIGHLIGHT':
      if (!tab?.id) throw new Error('No active tab');
      try {
        await sendToContentScript(tab.id, { type: 'CLEAR_HIGHLIGHT' }, false);
        return { success: true };
      } catch {
        return { success: true };
      }

    // ============================================
    // Journey Playback
    // ============================================
    case 'JOURNEY_PLAY':
      if (!tab?.id) throw new Error('No active tab');
      return await sendToContentScript(tab.id, {
        type: 'JOURNEY_PLAY',
        journey: message.journey,
        speed: message.speed,
      });

    case 'JOURNEY_PAUSE':
      if (!tab?.id) throw new Error('No active tab');
      return await sendToContentScript(tab.id, { type: 'JOURNEY_PAUSE' }, false);

    case 'JOURNEY_RESUME':
      if (!tab?.id) throw new Error('No active tab');
      return await sendToContentScript(tab.id, { type: 'JOURNEY_RESUME' }, false);

    case 'JOURNEY_STOP':
      if (!tab?.id) throw new Error('No active tab');
      return await sendToContentScript(tab.id, { type: 'JOURNEY_STOP' }, false);

    case 'JOURNEY_SET_SPEED':
      if (!tab?.id) throw new Error('No active tab');
      return await sendToContentScript(tab.id, {
        type: 'JOURNEY_SET_SPEED',
        speed: message.speed,
      }, false);

    case 'JOURNEY_GET_STATUS':
      if (!tab?.id) throw new Error('No active tab');
      try {
        return await sendToContentScript(tab.id, { type: 'JOURNEY_GET_STATUS' }, false);
      } catch {
        return { playing: false, currentTime: 0, speed: 1, duration: 0 };
      }

    case 'ELEMENT_SELECTED':
      // Forward from content script to sidepanel
      state.selectedElement = message.element;
      broadcastToSidepanel({
        type: 'ELEMENT_SELECTED',
        element: message.element,
      });
      return { success: true };

    // ============================================
    // Local Browser Automation
    // ============================================
    case 'SMART_CLICK':
      if (!tab?.id) throw new Error('No active tab');
      return await smartClick(tab.id, message.target);

    case 'FILL_INPUT':
      if (!tab?.id) throw new Error('No active tab');
      return await fillInput(tab.id, message.selector, message.value);

    case 'EXPORT_SESSION':
      if (!tab?.id) throw new Error('No active tab');
      return await exportSession(tab.id);

    // ============================================
    // MCP Remote Tools
    // ============================================
    case 'CALL_MCP_TOOL':
      const bridge = getMCPBridge();
      return await bridge.callTool(message.tool.name, message.tool.arguments);

    case 'MCP_PING':
      const mcpBridge = getMCPBridge();
      const reachable = await mcpBridge.ping();
      return { reachable };

    case 'MCP_INFO':
      const infoBridge = getMCPBridge();
      return await infoBridge.getInfo();

    // ============================================
    // Quick Actions
    // ============================================
    case 'VISUAL_REGRESSION':
      if (!tab?.url) throw new Error('No active tab with URL');
      const vrBridge = getMCPBridge();
      return await vrBridge.visualRegression(
        tab.url,
        message.baselineName,
        message.options
      );

    case 'HUNT_BUGS':
      if (!tab?.url) throw new Error('No active tab with URL');
      const bugBridge = getMCPBridge();
      return await bugBridge.huntBugs(tab.url);

    case 'RESPONSIVE_TEST':
      if (!tab?.url) throw new Error('No active tab with URL');
      const respBridge = getMCPBridge();
      return await respBridge.responsiveTest(tab.url, message.viewports);

    case 'CROSS_BROWSER_TEST':
      if (!tab?.url) throw new Error('No active tab with URL');
      const cbBridge = getMCPBridge();
      return await cbBridge.crossBrowserTest(tab.url, message.browsers);

    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

// ============================================
// Side Panel Setup
// ============================================

// Open sidepanel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Set sidepanel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ============================================
// Keyboard Shortcuts
// ============================================

chrome.commands.onCommand.addListener(async (command) => {
  switch (command) {
    case 'toggle-recording':
      if (state.recording) {
        await stopRecording();
      } else {
        await startRecording();
      }
      break;

    case 'toggle-inspector':
      const tab = await getActiveTab();
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: state.selectedElement ? 'DISABLE_INSPECTOR' : 'ENABLE_INSPECTOR',
        });
      }
      break;

    case 'take-screenshot':
      const screenshotTab = await getActiveTab();
      if (screenshotTab?.id) {
        const screenshot = await takeScreenshot(screenshotTab.id);
        broadcastToSidepanel({ type: 'SCREENSHOT_TAKEN', screenshot });
      }
      break;
  }
});

// ============================================
// Context Menu
// ============================================

chrome.runtime.onInstalled.addListener(() => {
  // Create context menu items
  chrome.contextMenus.create({
    id: 'cbrowser-inspect',
    title: 'Inspect Element with CBrowser',
    contexts: ['all'],
  });

  chrome.contextMenus.create({
    id: 'cbrowser-screenshot',
    title: 'Take Screenshot',
    contexts: ['page'],
  });

  chrome.contextMenus.create({
    id: 'cbrowser-visual-regression',
    title: 'Run Visual Regression Test',
    contexts: ['page'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  switch (info.menuItemId) {
    case 'cbrowser-inspect':
      chrome.tabs.sendMessage(tab.id, { type: 'ENABLE_INSPECTOR' });
      chrome.sidePanel.open({ tabId: tab.id });
      break;

    case 'cbrowser-screenshot':
      const screenshot = await takeScreenshot(tab.id);
      broadcastToSidepanel({ type: 'SCREENSHOT_TAKEN', screenshot });
      chrome.sidePanel.open({ tabId: tab.id });
      break;

    case 'cbrowser-visual-regression':
      if (tab.url) {
        const bridge = getMCPBridge();
        const result = await bridge.captureBaseline(tab.url, `baseline-${Date.now()}`);
        broadcastToSidepanel({ type: 'MCP_RESULT', result });
        chrome.sidePanel.open({ tabId: tab.id });
      }
      break;
  }
});

// ============================================
// Initialization
// ============================================

// Initialize MCP bridge with stored settings
(async () => {
  const settings = await getSettings();
  setMCPBridge({
    serverUrl: settings.mcpServerUrl,
    authToken: settings.mcpAuthToken,
  });
})();

console.log('CBrowser Extension service worker initialized');
