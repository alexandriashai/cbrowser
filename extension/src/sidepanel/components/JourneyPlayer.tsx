/**
 * CBrowser Extension - Journey Player Component
 * Controls for replaying recorded user journeys
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { JourneyRecording } from '../../shared/types';

interface JourneyPlayerProps {
  journey: JourneyRecording | null;
  onClose: () => void;
}

export function JourneyPlayer({ journey, onClose }: JourneyPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Calculate duration when journey changes
  useEffect(() => {
    if (journey) {
      setDuration(journey.endedAt! - journey.startedAt);
      setCurrentTime(0);
    }
  }, [journey]);

  // Poll for playback status
  useEffect(() => {
    if (!playing) return;

    const interval = setInterval(async () => {
      try {
        const status = await chrome.runtime.sendMessage({ type: 'JOURNEY_GET_STATUS' });
        if (status) {
          setCurrentTime(status.currentTime || 0);
          if (!status.playing) {
            setPlaying(false);
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }, 100);

    return () => clearInterval(interval);
  }, [playing]);

  const handlePlay = useCallback(async () => {
    if (!journey) return;

    try {
      if (playing) {
        await chrome.runtime.sendMessage({ type: 'JOURNEY_PAUSE' });
        setPlaying(false);
      } else {
        if (currentTime === 0 || currentTime >= duration) {
          await chrome.runtime.sendMessage({
            type: 'JOURNEY_PLAY',
            journey,
            speed,
          });
        } else {
          await chrome.runtime.sendMessage({ type: 'JOURNEY_RESUME' });
        }
        setPlaying(true);
      }
    } catch (e) {
      console.error('Failed to control playback:', e);
    }
  }, [journey, playing, currentTime, duration, speed]);

  const handleStop = useCallback(async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'JOURNEY_STOP' });
      setPlaying(false);
      setCurrentTime(0);
    } catch (e) {
      console.error('Failed to stop playback:', e);
    }
  }, []);

  const handleSpeedChange = useCallback(async (newSpeed: number) => {
    setSpeed(newSpeed);
    if (playing) {
      try {
        await chrome.runtime.sendMessage({
          type: 'JOURNEY_SET_SPEED',
          speed: newSpeed,
        });
      } catch (e) {
        console.error('Failed to change speed:', e);
      }
    }
  }, [playing]);

  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  if (!journey) {
    return (
      <div className="empty-state">
        <span className="icon">🎬</span>
        <div className="title">No journey recorded</div>
        <div className="description">
          Record a session first to replay the user journey
        </div>
      </div>
    );
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const eventCount = journey.events.length;
  const clickCount = journey.events.filter(e => e.type === 'click').length;
  const mouseCount = journey.events.filter(e => e.type === 'mouse').length;

  return (
    <div className="section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 className="section-title" style={{ margin: 0 }}>🎬 Journey Replay</h3>
        <button className="btn btn-secondary" onClick={onClose} style={{ padding: '4px 8px' }}>
          ✕
        </button>
      </div>

      {/* Stats */}
      <div className="action-grid" style={{ marginBottom: '16px' }}>
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '8px' }}>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{eventCount}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Events</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '8px' }}>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{clickCount}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Clicks</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: '8px' }}>
            <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{formatTime(duration)}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Duration</div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="card" style={{ marginBottom: '12px' }}>
        <div className="card-body" style={{ padding: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px' }}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
          <div style={{
            width: '100%',
            height: '8px',
            background: 'var(--bg-tertiary)',
            borderRadius: '4px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${progress}%`,
              height: '100%',
              background: 'var(--primary)',
              borderRadius: '4px',
              transition: 'width 0.1s linear',
            }} />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        <button
          className={`btn ${playing ? 'btn-secondary' : 'btn-primary'}`}
          onClick={handlePlay}
          style={{ flex: 1 }}
        >
          {playing ? '⏸️ Pause' : '▶️ Play'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleStop}
          disabled={currentTime === 0}
          style={{ flex: 1 }}
        >
          ⏹️ Stop
        </button>
      </div>

      {/* Speed control */}
      <div className="card">
        <div className="card-body" style={{ padding: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Playback Speed: {speed}x
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {[0.5, 1, 2, 4].map((s) => (
              <button
                key={s}
                className={`btn ${speed === s ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handleSpeedChange(s)}
                style={{ flex: 1, padding: '6px' }}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Journey info */}
      <div className="card" style={{ marginTop: '12px' }}>
        <div className="card-header">Journey Info</div>
        <div className="card-body">
          <div className="element-info">
            <div className="element-row">
              <span className="element-label">URL:</span>
              <span className="element-value" style={{ fontSize: '11px' }}>{journey.startUrl}</span>
            </div>
            <div className="element-row">
              <span className="element-label">Viewport:</span>
              <span className="element-value">{journey.viewportWidth}×{journey.viewportHeight}</span>
            </div>
            <div className="element-row">
              <span className="element-label">Mouse moves:</span>
              <span className="element-value">{mouseCount}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
