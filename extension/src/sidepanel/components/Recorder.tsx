/**
 * CBrowser Extension - Flow Recorder Component
 * Records user interactions and exports as test format
 */

import React from 'react';
import type { RecordedStep } from '../../shared/types';

interface RecorderProps {
  recording: boolean;
  steps: RecordedStep[];
  onStart: () => void;
  onStop: () => void;
}

export function Recorder({ recording, steps, onStart, onStop }: RecorderProps) {
  const getActionIcon = (action: string): string => {
    switch (action) {
      case 'navigate': return '🔗';
      case 'click': return '👆';
      case 'fill': return '⌨️';
      case 'select': return '📋';
      case 'scroll': return '📜';
      case 'keypress': return '⌨️';
      case 'wait': return '⏳';
      case 'assert': return '✅';
      default: return '•';
    }
  };

  return (
    <div>
      {/* Recording Controls */}
      <div className="section">
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center' }}>
            {!recording ? (
              <>
                <button className="btn btn-danger btn-block" onClick={onStart}>
                  <span>🔴</span> Start Recording
                </button>
                <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Click to start recording your interactions with the page.
                  Clicks, typing, and navigation will be captured.
                </p>
              </>
            ) : (
              <>
                <button className="btn btn-secondary btn-block" onClick={onStop}>
                  <span>⏹️</span> Stop Recording
                </button>
                <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Recording in progress. Interact with the page, then click stop
                  to export your test.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Recorded Steps */}
      <div className="section">
        <h3 className="section-title">
          Recorded Steps ({steps.length})
        </h3>

        {steps.length === 0 ? (
          <div className="empty-state">
            <span className="icon">📝</span>
            <div className="title">No steps recorded</div>
            <div className="description">
              {recording
                ? 'Interact with the page to record steps'
                : 'Click "Start Recording" to begin'}
            </div>
          </div>
        ) : (
          <div className="step-list">
            {steps.map((step, index) => (
              <div key={step.id} className="step-item">
                <span className="step-number">{index + 1}</span>
                <div className="step-content">
                  <div className="step-action">
                    {getActionIcon(step.action)} {step.action}
                  </div>
                  <div className="step-description">
                    {step.description || step.target || step.value || step.url}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Export Info */}
      {steps.length > 0 && !recording && (
        <div className="card">
          <div className="card-body">
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              When you stop recording, your test will be exported in two formats:
              <br /><br />
              <strong>Natural Language Test</strong> - Human-readable test steps
              <br />
              <strong>TypeScript/Playwright</strong> - Executable test code
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
