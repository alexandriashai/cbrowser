/**
 * CBrowser Extension - Element Inspector Component
 * Displays info about selected elements
 */

import React, { useState } from 'react';
import type { ElementInfo } from '../../shared/types';

interface InspectorProps {
  selectedElement: ElementInfo | null;
  onClear: () => void;
}

export function Inspector({ selectedElement, onClear }: InspectorProps) {
  const [inspecting, setInspecting] = useState(false);

  const startInspecting = () => {
    setInspecting(true);
    chrome.runtime.sendMessage({ type: 'ENABLE_INSPECTOR' });
  };

  const stopInspecting = () => {
    setInspecting(false);
    chrome.runtime.sendMessage({ type: 'DISABLE_INSPECTOR' });
  };

  const copySelector = () => {
    if (selectedElement?.selector) {
      navigator.clipboard.writeText(selectedElement.selector);
    }
  };

  return (
    <div>
      {/* Inspector Controls */}
      <div className="section">
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center' }}>
            {!inspecting ? (
              <>
                <button className="btn btn-primary btn-block" onClick={startInspecting}>
                  <span>🎯</span> Start Inspecting
                </button>
                <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Click to enable element inspection. Hover over elements to see
                  their info, click to select.
                </p>
              </>
            ) : (
              <>
                <button className="btn btn-secondary btn-block" onClick={stopInspecting}>
                  <span>✋</span> Stop Inspecting
                </button>
                <p style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Hover over elements to see details. Click to select an element.
                  Press <kbd style={{ background: 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px' }}>Esc</kbd> to cancel.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Selected Element Info */}
      <div className="section">
        <h3 className="section-title">Selected Element</h3>

        {!selectedElement ? (
          <div className="empty-state">
            <span className="icon">🔍</span>
            <div className="title">No element selected</div>
            <div className="description">
              Use the inspector to select an element from the page
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card-body">
              <div className="element-info">
                {/* Tag */}
                <div className="element-row">
                  <span className="element-label">Tag:</span>
                  <span className="element-value" style={{ color: 'var(--accent)' }}>
                    &lt;{selectedElement.tag}&gt;
                  </span>
                </div>

                {/* Selector */}
                <div className="element-row">
                  <span className="element-label">Selector:</span>
                  <span className="element-value">{selectedElement.selector}</span>
                </div>

                {/* ID */}
                {selectedElement.id && (
                  <div className="element-row">
                    <span className="element-label">ID:</span>
                    <span className="element-value">#{selectedElement.id}</span>
                  </div>
                )}

                {/* Classes */}
                {selectedElement.classes.length > 0 && (
                  <div className="element-row">
                    <span className="element-label">Classes:</span>
                    <span className="element-value">
                      .{selectedElement.classes.slice(0, 5).join(' .')}
                      {selectedElement.classes.length > 5 && '...'}
                    </span>
                  </div>
                )}

                {/* Text */}
                {selectedElement.text && (
                  <div className="element-row">
                    <span className="element-label">Text:</span>
                    <span className="element-value">
                      "{selectedElement.text.slice(0, 50)}
                      {selectedElement.text.length > 50 ? '..."' : '"'}
                    </span>
                  </div>
                )}

                {/* Aria Label */}
                {selectedElement.ariaLabel && (
                  <div className="element-row">
                    <span className="element-label">Aria:</span>
                    <span className="element-value">{selectedElement.ariaLabel}</span>
                  </div>
                )}

                {/* Role */}
                {selectedElement.role && (
                  <div className="element-row">
                    <span className="element-label">Role:</span>
                    <span className="element-value">{selectedElement.role}</span>
                  </div>
                )}

                {/* Dimensions */}
                <div className="element-row">
                  <span className="element-label">Size:</span>
                  <span className="element-value">
                    {Math.round(selectedElement.rect.width)} × {Math.round(selectedElement.rect.height)} px
                  </span>
                </div>

                {/* Position */}
                <div className="element-row">
                  <span className="element-label">Position:</span>
                  <span className="element-value">
                    ({Math.round(selectedElement.rect.x)}, {Math.round(selectedElement.rect.y)})
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                <button className="btn btn-primary" onClick={copySelector} style={{ flex: 1 }}>
                  📋 Copy Selector
                </button>
                <button className="btn btn-secondary" onClick={onClear}>
                  ✖️ Clear
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      {selectedElement && (
        <div className="section">
          <h3 className="section-title">Quick Actions</h3>
          <div className="action-grid">
            <button
              className="action-card"
              onClick={() => {
                chrome.runtime.sendMessage({
                  type: 'SMART_CLICK',
                  target: selectedElement.selector,
                });
              }}
            >
              <span className="icon">👆</span>
              <span className="label">Click</span>
            </button>
            <button
              className="action-card"
              onClick={() => {
                const value = prompt('Enter value:');
                if (value) {
                  chrome.runtime.sendMessage({
                    type: 'FILL_INPUT',
                    selector: selectedElement.selector,
                    value,
                  });
                }
              }}
            >
              <span className="icon">⌨️</span>
              <span className="label">Fill</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
