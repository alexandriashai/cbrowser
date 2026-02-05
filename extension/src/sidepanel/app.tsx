/**
 * CBrowser Extension - Sidepanel React App
 */

import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { QuickActions } from './components/QuickActions';
import { Recorder } from './components/Recorder';
import { Inspector } from './components/Inspector';
import { Results } from './components/Results';
import { Settings } from './components/Settings';
import { JourneyPlayer } from './components/JourneyPlayer';
import type { RecordedStep, ElementInfo, ExtensionSettings, JourneyRecording } from '../shared/types';

// Styles
import './styles.css';

type Tab = 'actions' | 'recorder' | 'inspector' | 'results' | 'settings';

interface AppState {
  activeTab: Tab;
  recording: boolean;
  steps: RecordedStep[];
  selectedElement: ElementInfo | null;
  lastResult: any;
  lastScreenshot: string | null;
  mcpConnected: boolean;
  settings: ExtensionSettings | null;
  lastJourney: JourneyRecording | null;
  showJourneyPlayer: boolean;
}

function App() {
  const [state, setState] = useState<AppState>({
    activeTab: 'actions',
    recording: false,
    steps: [],
    selectedElement: null,
    lastResult: null,
    lastScreenshot: null,
    mcpConnected: false,
    settings: null,
    lastJourney: null,
    showJourneyPlayer: false,
  });

  // Load initial state
  useEffect(() => {
    // Get settings
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (settings) => {
      setState((s) => ({ ...s, settings }));
    });

    // Check MCP connection
    chrome.runtime.sendMessage({ type: 'MCP_PING' }, (response) => {
      setState((s) => ({ ...s, mcpConnected: response?.reachable || false }));
    });

    // Get recording status
    chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' }, (response) => {
      if (response) {
        setState((s) => ({
          ...s,
          recording: response.recording,
        }));
      }
    });
  }, []);

  // Listen for messages from background
  useEffect(() => {
    const listener = (message: any) => {
      switch (message.type) {
        case 'RECORDING_STARTED':
          setState((s) => ({ ...s, recording: true, steps: [] }));
          break;

        case 'RECORDING_STOPPED':
          setState((s) => ({
            ...s,
            recording: false,
            lastResult: {
              type: 'recording',
              steps: message.steps,
              nlTest: message.nlTest,
              typescript: message.typescript,
              journey: message.journey,
            },
            lastJourney: message.journey || null,
            activeTab: 'results',
          }));
          break;

        case 'JOURNEY_PLAYBACK_COMPLETE':
          setState((s) => ({ ...s, showJourneyPlayer: false }));
          break;

        case 'STEP_RECORDED':
          setState((s) => ({
            ...s,
            steps: [...s.steps, message.step],
          }));
          break;

        case 'ELEMENT_SELECTED':
          setState((s) => ({
            ...s,
            selectedElement: message.element,
            activeTab: 'inspector',
          }));
          break;

        case 'SCREENSHOT_TAKEN':
          setState((s) => ({
            ...s,
            lastScreenshot: message.screenshot,
            lastResult: { type: 'screenshot', image: message.screenshot },
            activeTab: 'results',
          }));
          break;

        case 'MCP_RESULT':
          setState((s) => ({
            ...s,
            lastResult: message.result,
            activeTab: 'results',
          }));
          break;
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'actions', label: 'Actions', icon: '⚡' },
    { id: 'recorder', label: 'Record', icon: '🔴' },
    { id: 'inspector', label: 'Inspect', icon: '🔍' },
    { id: 'results', label: 'Results', icon: '📊' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-title">
          <span className="logo">🌐</span>
          <span>CBrowser</span>
        </div>
        <div className="header-status">
          <span
            className={`status-indicator ${state.mcpConnected ? 'connected' : 'disconnected'}`}
            title={state.mcpConnected ? 'MCP Server Connected' : 'MCP Server Disconnected'}
          />
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${state.activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setState((s) => ({ ...s, activeTab: tab.id }))}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <main className="content">
        {state.activeTab === 'actions' && (
          <QuickActions
            onResult={(result) =>
              setState((s) => ({ ...s, lastResult: result, activeTab: 'results' }))
            }
          />
        )}

        {state.activeTab === 'recorder' && (
          <Recorder
            recording={state.recording}
            steps={state.steps}
            onStart={() => chrome.runtime.sendMessage({ type: 'START_RECORDING' })}
            onStop={() => chrome.runtime.sendMessage({ type: 'STOP_RECORDING' })}
          />
        )}

        {state.activeTab === 'inspector' && (
          <Inspector
            selectedElement={state.selectedElement}
            onClear={() => setState((s) => ({ ...s, selectedElement: null }))}
          />
        )}

        {state.activeTab === 'results' && (
          <Results result={state.lastResult} screenshot={state.lastScreenshot} />
        )}

        {state.activeTab === 'settings' && state.settings && (
          <Settings
            settings={state.settings}
            onSave={(settings) => {
              chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
              setState((s) => ({ ...s, settings: { ...s.settings!, ...settings } }));
            }}
          />
        )}
      </main>

      {/* Recording Indicator */}
      {state.recording && (
        <div className="recording-indicator">
          <span className="recording-dot" />
          Recording... ({state.steps.length} steps)
        </div>
      )}

      {/* Journey Player Overlay */}
      {state.showJourneyPlayer && (
        <div className="journey-overlay">
          <JourneyPlayer
            journey={state.lastJourney}
            onClose={() => setState((s) => ({ ...s, showJourneyPlayer: false }))}
          />
        </div>
      )}

      {/* Journey Replay Button (when journey available) */}
      {state.lastJourney && !state.showJourneyPlayer && (
        <button
          className="journey-fab"
          onClick={() => setState((s) => ({ ...s, showJourneyPlayer: true }))}
          title="Replay User Journey"
        >
          🎬
        </button>
      )}
    </div>
  );
}

// Mount app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
