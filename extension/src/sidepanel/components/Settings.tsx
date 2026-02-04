/**
 * CBrowser Extension - Settings Component
 * Configure MCP server, hotkeys, and preferences
 */

import React, { useState, useEffect } from 'react';
import type { ExtensionSettings } from '../../shared/types';

interface SettingsProps {
  settings: ExtensionSettings;
  onSave: (settings: Partial<ExtensionSettings>) => void;
}

export function Settings({ settings, onSave }: SettingsProps) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [mcpStatus, setMcpStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [saved, setSaved] = useState(false);

  // Check MCP connection when URL changes
  useEffect(() => {
    setMcpStatus('checking');
    chrome.runtime.sendMessage({ type: 'MCP_PING' }, (response) => {
      setMcpStatus(response?.reachable ? 'connected' : 'disconnected');
    });
  }, [localSettings.mcpServerUrl]);

  const handleSave = () => {
    onSave(localSettings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleChange = (key: keyof ExtensionSettings, value: any) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div>
      {/* MCP Server Settings */}
      <div className="section">
        <h3 className="section-title">MCP Server</h3>
        <div className="card">
          <div className="card-body">
            <div className="form-group">
              <label className="form-label">Server URL</label>
              <input
                type="url"
                className="form-input"
                value={localSettings.mcpServerUrl}
                onChange={(e) => handleChange('mcpServerUrl', e.target.value)}
                placeholder="https://cbrowser-mcp.example.com"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Auth Token (optional)</label>
              <input
                type="password"
                className="form-input"
                value={localSettings.mcpAuthToken || ''}
                onChange={(e) => handleChange('mcpAuthToken', e.target.value)}
                placeholder="Bearer token for authentication"
              />
            </div>

            {/* Connection Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
              <span
                className={`status-indicator ${mcpStatus === 'connected' ? 'connected' : ''}`}
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: mcpStatus === 'checking' ? 'var(--warning)' :
                             mcpStatus === 'connected' ? 'var(--success)' : 'var(--error)',
                }}
              />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {mcpStatus === 'checking' && 'Checking connection...'}
                {mcpStatus === 'connected' && 'Connected to MCP server'}
                {mcpStatus === 'disconnected' && 'Not connected'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recording Settings */}
      <div className="section">
        <h3 className="section-title">Recording</h3>
        <div className="card">
          <div className="card-body">
            <div className="form-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '500' }}>Auto Screenshot</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Capture screenshot on each step
                </div>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={localSettings.autoScreenshot}
                  onChange={(e) => handleChange('autoScreenshot', e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Appearance */}
      <div className="section">
        <h3 className="section-title">Appearance</h3>
        <div className="card">
          <div className="card-body">
            <div className="form-group" style={{ marginBottom: '0' }}>
              <label className="form-label">Theme</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['light', 'dark', 'system'] as const).map((theme) => (
                  <button
                    key={theme}
                    className={`btn ${localSettings.theme === theme ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => handleChange('theme', theme)}
                    style={{ flex: 1, textTransform: 'capitalize' }}
                  >
                    {theme === 'light' && '☀️'}
                    {theme === 'dark' && '🌙'}
                    {theme === 'system' && '💻'}
                    {' '}{theme}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts Info */}
      <div className="section">
        <h3 className="section-title">Keyboard Shortcuts</h3>
        <div className="card">
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px' }}>Toggle Recording</span>
                <kbd style={{ background: 'var(--bg-tertiary)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                  Ctrl+Shift+R
                </kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px' }}>Toggle Inspector</span>
                <kbd style={{ background: 'var(--bg-tertiary)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                  Ctrl+Shift+I
                </kbd>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px' }}>Take Screenshot</span>
                <kbd style={{ background: 'var(--bg-tertiary)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                  Ctrl+Shift+S
                </kbd>
              </div>
            </div>
            <p style={{ marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)' }}>
              Configure shortcuts in chrome://extensions/shortcuts
            </p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <button
        className={`btn ${saved ? 'btn-success' : 'btn-primary'} btn-block`}
        onClick={handleSave}
        style={{ marginTop: '8px' }}
      >
        {saved ? '✓ Saved!' : '💾 Save Settings'}
      </button>

      {/* Version Info */}
      <div style={{ marginTop: '24px', textAlign: 'center' }}>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          CBrowser Extension v1.0.0
          <br />
          <a
            href="https://github.com/alexandriashai/cbrowser"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)' }}
          >
            GitHub
          </a>
          {' · '}
          <a
            href="https://cbrowser.dev/docs"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent)' }}
          >
            Documentation
          </a>
        </p>
      </div>
    </div>
  );
}
