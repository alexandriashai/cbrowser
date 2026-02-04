/**
 * CBrowser Extension - Quick Actions Component
 * One-click access to common testing operations
 */

import React, { useState } from 'react';

interface QuickActionsProps {
  onResult: (result: any) => void;
}

interface ActionItem {
  id: string;
  icon: string;
  label: string;
  description: string;
  action: () => Promise<any>;
}

export function QuickActions({ onResult }: QuickActionsProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const localActions: ActionItem[] = [
    {
      id: 'analyze',
      icon: '🔍',
      label: 'Analyze Page',
      description: 'Get page structure, forms, links',
      action: async () => {
        return chrome.runtime.sendMessage({ type: 'ANALYZE_PAGE' });
      },
    },
    {
      id: 'screenshot',
      icon: '📸',
      label: 'Screenshot',
      description: 'Capture current view',
      action: async () => {
        return chrome.runtime.sendMessage({ type: 'TAKE_SCREENSHOT' });
      },
    },
    {
      id: 'session',
      icon: '🔑',
      label: 'Export Session',
      description: 'Save cookies & storage',
      action: async () => {
        return chrome.runtime.sendMessage({ type: 'EXPORT_SESSION' });
      },
    },
    {
      id: 'inspect',
      icon: '🎯',
      label: 'Inspect Element',
      description: 'Select element on page',
      action: async () => {
        return chrome.runtime.sendMessage({ type: 'ENABLE_INSPECTOR' });
      },
    },
  ];

  const remoteActions: ActionItem[] = [
    {
      id: 'visual-regression',
      icon: '🖼️',
      label: 'Visual Regression',
      description: 'Compare with baseline',
      action: async () => {
        const name = `baseline-${Date.now()}`;
        return chrome.runtime.sendMessage({
          type: 'VISUAL_REGRESSION',
          baselineName: name,
        });
      },
    },
    {
      id: 'hunt-bugs',
      icon: '🐛',
      label: 'Hunt Bugs',
      description: 'AI-powered bug detection',
      action: async () => {
        return chrome.runtime.sendMessage({ type: 'HUNT_BUGS' });
      },
    },
    {
      id: 'responsive',
      icon: '📱',
      label: 'Responsive Test',
      description: 'Test all viewports',
      action: async () => {
        return chrome.runtime.sendMessage({
          type: 'RESPONSIVE_TEST',
          viewports: ['mobile', 'tablet', 'desktop'],
        });
      },
    },
    {
      id: 'cross-browser',
      icon: '🌐',
      label: 'Cross-Browser',
      description: 'Test in all browsers',
      action: async () => {
        return chrome.runtime.sendMessage({
          type: 'CROSS_BROWSER_TEST',
          browsers: ['chromium', 'firefox', 'webkit'],
        });
      },
    },
  ];

  const handleAction = async (item: ActionItem) => {
    setLoading(item.id);
    try {
      const result = await item.action();
      // Always show result, including errors
      if (result) {
        if (result.error) {
          onResult({ type: 'error', error: result.error, action: item.id });
        } else {
          onResult({ type: item.id, ...result });
        }
      } else {
        onResult({ type: 'error', error: 'No response from extension', action: item.id });
      }
    } catch (error) {
      onResult({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
        action: item.id,
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div>
      {/* Local Actions */}
      <div className="section">
        <h3 className="section-title">Local Tools</h3>
        <div className="action-grid">
          {localActions.map((action) => (
            <button
              key={action.id}
              className="action-card"
              onClick={() => handleAction(action)}
              disabled={loading !== null}
            >
              {loading === action.id ? (
                <div className="spinner" />
              ) : (
                <span className="icon">{action.icon}</span>
              )}
              <span className="label">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Remote Actions (MCP) */}
      <div className="section">
        <h3 className="section-title">MCP Server Tools</h3>
        <div className="action-grid">
          {remoteActions.map((action) => (
            <button
              key={action.id}
              className="action-card"
              onClick={() => handleAction(action)}
              disabled={loading !== null}
            >
              {loading === action.id ? (
                <div className="spinner" />
              ) : (
                <span className="icon">{action.icon}</span>
              )}
              <span className="label">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Help Text */}
      <div className="card">
        <div className="card-body">
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
            <strong>Local Tools</strong> run directly in your browser using Chrome APIs.
            <br /><br />
            <strong>MCP Server Tools</strong> connect to a remote CBrowser server for
            advanced testing capabilities like cross-browser testing and visual regression.
          </p>
        </div>
      </div>
    </div>
  );
}
