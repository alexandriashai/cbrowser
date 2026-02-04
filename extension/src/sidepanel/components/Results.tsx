/**
 * CBrowser Extension - Results Component
 * Displays results from various operations
 */

import React, { useState } from 'react';

interface ResultsProps {
  result: any;
  screenshot: string | null;
}

type ViewMode = 'preview' | 'nltest' | 'typescript' | 'json';

export function Results({ result, screenshot }: ResultsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('preview');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!result && !screenshot) {
    return (
      <div className="empty-state">
        <span className="icon">📊</span>
        <div className="title">No results yet</div>
        <div className="description">
          Run an action or record a flow to see results here
        </div>
      </div>
    );
  }

  // Recording results
  if (result?.type === 'recording') {
    return (
      <div>
        <div className="section">
          <h3 className="section-title">Recorded Test</h3>

          {/* View Mode Tabs */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
            {(['preview', 'nltest', 'typescript', 'json'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                className={`btn ${viewMode === mode ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setViewMode(mode)}
                style={{ flex: 1, padding: '8px' }}
              >
                {mode === 'preview' && '📋'}
                {mode === 'nltest' && '📝'}
                {mode === 'typescript' && '📄'}
                {mode === 'json' && '{}'}
              </button>
            ))}
          </div>

          {/* Content */}
          {viewMode === 'preview' && (
            <div className="step-list">
              {result.steps.map((step: any, index: number) => (
                <div key={step.id} className="step-item">
                  <span className="step-number">{index + 1}</span>
                  <div className="step-content">
                    <div className="step-action">{step.action}</div>
                    <div className="step-description">
                      {step.description || step.target || step.value}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {viewMode === 'nltest' && (
            <div>
              <div className="code-block">{result.nlTest}</div>
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => copyToClipboard(result.nlTest)}
                  style={{ flex: 1 }}
                >
                  📋 Copy
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => downloadFile(result.nlTest, 'test.nl')}
                  style={{ flex: 1 }}
                >
                  💾 Download
                </button>
              </div>
            </div>
          )}

          {viewMode === 'typescript' && (
            <div>
              <div className="code-block">{result.typescript}</div>
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => copyToClipboard(result.typescript)}
                  style={{ flex: 1 }}
                >
                  📋 Copy
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => downloadFile(result.typescript, 'test.spec.ts')}
                  style={{ flex: 1 }}
                >
                  💾 Download
                </button>
              </div>
            </div>
          )}

          {viewMode === 'json' && (
            <div>
              <div className="code-block">
                {JSON.stringify(result.steps, null, 2)}
              </div>
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => copyToClipboard(JSON.stringify(result.steps, null, 2))}
                  style={{ flex: 1 }}
                >
                  📋 Copy
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => downloadFile(JSON.stringify(result.steps, null, 2), 'test.json')}
                  style={{ flex: 1 }}
                >
                  💾 Download
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Screenshot result
  if (result?.type === 'screenshot' || screenshot) {
    const imageData = result?.image || screenshot;
    return (
      <div className="section">
        <h3 className="section-title">Screenshot</h3>
        <div className="card">
          <div className="card-body">
            <img src={imageData} alt="Screenshot" className="screenshot-preview" />
            <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
              <a
                href={imageData}
                download="screenshot.png"
                className="btn btn-secondary"
                style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}
              >
                💾 Download
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Page analysis result
  if (result?.elements || result?.forms || result?.links) {
    return (
      <div>
        <div className="section">
          <h3 className="section-title">Page Analysis</h3>

          {/* Stats */}
          <div className="action-grid" style={{ marginBottom: '16px' }}>
            <div className="card">
              <div className="card-body" style={{ textAlign: 'center', padding: '12px' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {result.elements?.length || 0}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Interactive Elements
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-body" style={{ textAlign: 'center', padding: '12px' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {result.forms?.length || 0}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Forms
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-body" style={{ textAlign: 'center', padding: '12px' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                  {result.links?.length || 0}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Links
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-body" style={{ textAlign: 'center', padding: '12px' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: result.a11yIssues?.length > 0 ? 'var(--error)' : 'var(--success)' }}>
                  {result.a11yIssues?.length || 0}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  A11y Issues
                </div>
              </div>
            </div>
          </div>

          {/* A11y Issues */}
          {result.a11yIssues?.length > 0 && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div className="card-header">⚠️ Accessibility Issues</div>
              <div className="card-body">
                {result.a11yIssues.map((issue: any, index: number) => (
                  <div key={index} style={{ marginBottom: index < result.a11yIssues.length - 1 ? '12px' : 0 }}>
                    <div className={`badge badge-${issue.severity === 'critical' ? 'error' : issue.severity === 'serious' ? 'warning' : 'success'}`}>
                      {issue.severity}
                    </div>
                    <div style={{ marginTop: '4px', fontSize: '13px' }}>{issue.message}</div>
                    <div style={{ marginTop: '2px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      {issue.element}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full JSON */}
          <div className="card">
            <div className="card-header">Raw Data</div>
            <div className="card-body">
              <div className="code-block" style={{ maxHeight: '200px', overflow: 'auto' }}>
                {JSON.stringify(result, null, 2)}
              </div>
              <button
                className="btn btn-secondary btn-block"
                onClick={() => copyToClipboard(JSON.stringify(result, null, 2))}
                style={{ marginTop: '12px' }}
              >
                📋 Copy JSON
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Helper to render bug hunting results
  const renderBugHuntResult = (data: any) => {
    const bugs = data?.bugs || data?.result?.bugs || [];
    return (
      <div className="section">
        <h3 className="section-title">🐛 Bug Hunt Results</h3>

        {/* Summary */}
        <div className="card" style={{ marginBottom: '16px' }}>
          <div className="card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '32px', fontWeight: 'bold', color: bugs.length > 0 ? 'var(--warning)' : 'var(--success)' }}>
              {bugs.length}
            </div>
            <div style={{ color: 'var(--text-muted)' }}>
              {bugs.length === 0 ? 'No bugs found!' : 'Issues Found'}
            </div>
          </div>
        </div>

        {/* Bug List */}
        {bugs.length > 0 && bugs.map((bug: any, i: number) => (
          <div key={i} className="card" style={{ marginBottom: '12px' }}>
            <div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span className={`badge badge-${bug.severity === 'high' ? 'error' : bug.severity === 'medium' ? 'warning' : 'success'}`}>
                  {bug.severity || 'info'}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{bug.type || 'issue'}</span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>{bug.message || bug.description}</div>
              {bug.selector && <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{bug.selector}</div>}
              {bug.recommendation && (
                <div style={{ marginTop: '8px', padding: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', fontSize: '12px' }}>
                  💡 {bug.recommendation}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Helper to render responsive test results
  const renderResponsiveResult = (data: any) => {
    const viewports = data?.viewports || data?.result?.viewports || [];
    return (
      <div className="section">
        <h3 className="section-title">📱 Responsive Test</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {viewports.map((vp: any, i: number) => (
            <div key={i} className="card">
              <div className="card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: '500' }}>{vp.name || vp.viewport}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{vp.width}×{vp.height}</div>
                  </div>
                  <span className={`badge badge-${vp.passed !== false ? 'success' : 'error'}`}>
                    {vp.passed !== false ? '✓ OK' : '✗ Issues'}
                  </span>
                </div>
                {vp.screenshot && (
                  <img src={vp.screenshot} alt={vp.name} style={{ width: '100%', marginTop: '8px', borderRadius: '4px' }} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Helper to render cross-browser results
  const renderCrossBrowserResult = (data: any) => {
    const browsers = data?.browsers || data?.result?.browsers || [];
    return (
      <div className="section">
        <h3 className="section-title">🌐 Cross-Browser Test</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {browsers.map((br: any, i: number) => (
            <div key={i} className="card">
              <div className="card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: '500' }}>
                    {br.browser === 'chromium' && '🔵 '}
                    {br.browser === 'firefox' && '🦊 '}
                    {br.browser === 'webkit' && '🧭 '}
                    {br.browser || br.name}
                  </div>
                  <span className={`badge badge-${br.passed !== false ? 'success' : 'error'}`}>
                    {br.passed !== false ? '✓ OK' : '✗ Failed'}
                  </span>
                </div>
                {br.error && <div style={{ color: 'var(--error)', fontSize: '12px', marginTop: '4px' }}>{br.error}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Helper to render visual regression results
  const renderVisualRegressionResult = (data: any) => {
    const res = data?.result || data;
    return (
      <div className="section">
        <h3 className="section-title">🖼️ Visual Regression</h3>
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '8px' }}>
              {res.passed ? '✅' : '❌'}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: res.passed ? 'var(--success)' : 'var(--error)' }}>
              {res.passed ? 'No Visual Changes' : 'Visual Differences Detected'}
            </div>
            {res.similarity !== undefined && (
              <div style={{ marginTop: '8px', color: 'var(--text-muted)' }}>
                Similarity: {(res.similarity * 100).toFixed(1)}%
              </div>
            )}
            {res.diffImageUrl && (
              <img src={res.diffImageUrl} alt="Diff" style={{ width: '100%', marginTop: '12px', borderRadius: '4px' }} />
            )}
          </div>
        </div>
      </div>
    );
  };

  // Helper to render status results
  const renderStatusResult = (data: any) => {
    const status = data?.result || data;
    return (
      <div className="section">
        <h3 className="section-title">📊 Server Status</h3>
        <div className="card">
          <div className="card-body">
            <div className="element-info">
              {status.version && (
                <div className="element-row">
                  <span className="element-label">Version:</span>
                  <span className="element-value">{status.version}</span>
                </div>
              )}
              {status.browsers && (
                <div className="element-row">
                  <span className="element-label">Browsers:</span>
                  <span className="element-value">{status.browsers?.join(', ') || 'N/A'}</span>
                </div>
              )}
              {status.dataDir && (
                <div className="element-row">
                  <span className="element-label">Data Dir:</span>
                  <span className="element-value" style={{ fontSize: '11px' }}>{status.dataDir}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Detect MCP result type and render appropriately
  const mcpResult = result?.result || result;
  const actionType = result?.type || result?.action;

  // Hunt bugs
  if (actionType === 'hunt-bugs' || mcpResult?.bugs) {
    return renderBugHuntResult(result);
  }

  // Responsive test
  if (actionType === 'responsive' || mcpResult?.viewports) {
    return renderResponsiveResult(result);
  }

  // Cross-browser test
  if (actionType === 'cross-browser' || mcpResult?.browsers) {
    return renderCrossBrowserResult(result);
  }

  // Visual regression
  if (actionType === 'visual-regression' || mcpResult?.passed !== undefined && mcpResult?.similarity !== undefined) {
    return renderVisualRegressionResult(result);
  }

  // Status
  if (mcpResult?.status === 'ok' || mcpResult?.version) {
    return renderStatusResult(result);
  }

  // Error result
  if (result?.type === 'error' || result?.error) {
    return (
      <div className="section">
        <h3 className="section-title">❌ Error</h3>
        <div className="card">
          <div className="card-body">
            <div className="badge badge-error" style={{ marginBottom: '12px' }}>
              {result.action || 'Error'}
            </div>
            <div style={{ color: 'var(--error)', marginBottom: '12px' }}>
              {result.error}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Check Settings to ensure MCP server URL and auth token are correct.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Generic MCP result - show formatted
  return (
    <div className="section">
      <h3 className="section-title">✅ Result</h3>
      <div className="card">
        <div className="card-body">
          {result.success === true && (
            <div className="badge badge-success" style={{ marginBottom: '12px' }}>
              Success
            </div>
          )}

          {/* Try to show key info from result */}
          {mcpResult && typeof mcpResult === 'object' && (
            <div className="element-info" style={{ marginBottom: '12px' }}>
              {Object.entries(mcpResult).slice(0, 6).map(([key, value]) => (
                <div key={key} className="element-row">
                  <span className="element-label">{key}:</span>
                  <span className="element-value">
                    {typeof value === 'object' ? JSON.stringify(value).slice(0, 50) + '...' : String(value).slice(0, 100)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Collapsible raw JSON */}
          <details style={{ marginTop: '12px' }}>
            <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '12px' }}>
              View Raw JSON
            </summary>
            <div className="code-block" style={{ marginTop: '8px', maxHeight: '200px', overflow: 'auto' }}>
              {JSON.stringify(result, null, 2)}
            </div>
          </details>

          <button
            className="btn btn-secondary btn-block"
            onClick={() => copyToClipboard(JSON.stringify(result, null, 2))}
            style={{ marginTop: '12px' }}
          >
            📋 Copy JSON
          </button>
        </div>
      </div>
    </div>
  );
}
