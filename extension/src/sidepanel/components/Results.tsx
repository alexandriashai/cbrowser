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

  // MCP result or generic result
  return (
    <div className="section">
      <h3 className="section-title">Result</h3>
      <div className="card">
        <div className="card-body">
          {result.success === false && (
            <div className="badge badge-error" style={{ marginBottom: '12px' }}>
              Error
            </div>
          )}
          {result.success === true && (
            <div className="badge badge-success" style={{ marginBottom: '12px' }}>
              Success
            </div>
          )}
          <div className="code-block">
            {JSON.stringify(result, null, 2)}
          </div>
          <button
            className="btn btn-secondary btn-block"
            onClick={() => copyToClipboard(JSON.stringify(result, null, 2))}
            style={{ marginTop: '12px' }}
          >
            📋 Copy
          </button>
        </div>
      </div>
    </div>
  );
}
