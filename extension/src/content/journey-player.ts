/**
 * CBrowser Extension - Journey Player Content Script
 * Visualizes recorded user journeys with mouse trails and click animations
 */

import type { JourneyRecording, JourneyEvent } from '../shared/types';

interface PlayerState {
  playing: boolean;
  currentTime: number;
  speed: number;
  journey: JourneyRecording | null;
  cursor: HTMLDivElement | null;
  trail: HTMLCanvasElement | null;
  trailCtx: CanvasRenderingContext2D | null;
  animationFrame: number | null;
  startTimestamp: number;
}

const playerState: PlayerState = {
  playing: false,
  currentTime: 0,
  speed: 1,
  journey: null,
  cursor: null,
  trail: null,
  trailCtx: null,
  animationFrame: null,
  startTimestamp: 0,
};

// Trail settings
const TRAIL_COLOR = 'rgba(59, 130, 246, 0.6)'; // Blue
const TRAIL_FADE_SPEED = 0.02;
const CURSOR_SIZE = 24;

/**
 * Create the fake cursor element
 */
function createCursor(): HTMLDivElement {
  const cursor = document.createElement('div');
  cursor.id = 'cbrowser-journey-cursor';
  cursor.setAttribute('data-cbrowser-ignore', 'true');
  cursor.innerHTML = `
    <svg width="${CURSOR_SIZE}" height="${CURSOR_SIZE}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.5 3.21V20.79C5.5 21.53 6.39 21.95 6.98 21.45L10.93 18.14L14.18 21.39C14.57 21.78 15.2 21.78 15.59 21.39L16.65 20.33C17.04 19.94 17.04 19.31 16.65 18.92L13.4 15.67L17.59 13.59C18.35 13.22 18.35 12.13 17.59 11.77L6.98 6.67L5.5 3.21Z" fill="#3B82F6" stroke="#1E3A8A" stroke-width="1"/>
    </svg>
  `;
  cursor.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    pointer-events: none;
    transform: translate(-2px, -2px);
    transition: opacity 0.2s;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
  `;
  return cursor;
}

/**
 * Create the trail canvas
 */
function createTrailCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.id = 'cbrowser-journey-trail';
  canvas.setAttribute('data-cbrowser-ignore', 'true');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    z-index: 2147483645;
    pointer-events: none;
  `;
  return canvas;
}

/**
 * Create click ripple animation
 */
function createClickRipple(x: number, y: number, button: number = 0): void {
  const ripple = document.createElement('div');
  ripple.setAttribute('data-cbrowser-ignore', 'true');

  // Different colors for different mouse buttons
  const colors = {
    0: '#3B82F6', // Left click - blue
    1: '#8B5CF6', // Middle click - purple
    2: '#EF4444', // Right click - red
  };
  const color = colors[button as keyof typeof colors] || colors[0];

  ripple.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    width: 20px;
    height: 20px;
    border: 3px solid ${color};
    border-radius: 50%;
    transform: translate(-50%, -50%) scale(0);
    pointer-events: none;
    z-index: 2147483646;
    animation: cbrowser-ripple 0.6s ease-out forwards;
  `;

  document.body.appendChild(ripple);

  // Remove after animation
  setTimeout(() => ripple.remove(), 600);
}

/**
 * Add ripple animation CSS
 */
function addRippleStyles(): void {
  if (document.getElementById('cbrowser-journey-styles')) return;

  const style = document.createElement('style');
  style.id = 'cbrowser-journey-styles';
  style.textContent = `
    @keyframes cbrowser-ripple {
      0% {
        transform: translate(-50%, -50%) scale(0);
        opacity: 1;
      }
      100% {
        transform: translate(-50%, -50%) scale(3);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * Draw trail line between two points
 */
function drawTrailSegment(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  alpha: number = 1
): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = `rgba(59, 130, 246, ${alpha * 0.6})`;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.stroke();
}

/**
 * Fade the trail canvas
 */
function fadeTrail(): void {
  if (!playerState.trailCtx || !playerState.trail) return;

  const ctx = playerState.trailCtx;
  const canvas = playerState.trail;

  // Get current image data
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Reduce alpha of all pixels
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) {
      data[i] = Math.max(0, data[i] - 5);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Get event at specific time
 */
function getEventAtTime(time: number): { event: JourneyEvent; index: number } | null {
  if (!playerState.journey) return null;

  const events = playerState.journey.events;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].timestamp <= time) {
      return { event: events[i], index: i };
    }
  }
  return null;
}

/**
 * Interpolate position between two mouse events
 */
function interpolatePosition(time: number): { x: number; y: number } | null {
  if (!playerState.journey) return null;

  const events = playerState.journey.events;
  let prevMouse: JourneyEvent | null = null;
  let nextMouse: JourneyEvent | null = null;

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === 'mouse' || e.type === 'click') {
      if (e.timestamp <= time) {
        prevMouse = e;
      } else if (!nextMouse) {
        nextMouse = e;
        break;
      }
    }
  }

  if (!prevMouse) return null;
  if (!nextMouse || prevMouse.x === undefined) {
    return { x: prevMouse.x!, y: prevMouse.y! };
  }

  // Interpolate between prev and next
  const t = (time - prevMouse.timestamp) / (nextMouse.timestamp - prevMouse.timestamp);
  return {
    x: prevMouse.x! + (nextMouse.x! - prevMouse.x!) * t,
    y: prevMouse.y! + (nextMouse.y! - prevMouse.y!) * t,
  };
}

/**
 * Animation loop
 */
let lastPosition: { x: number; y: number } | null = null;
let processedClickIndex = -1;

function animate(timestamp: number): void {
  if (!playerState.playing || !playerState.journey) return;

  // Calculate current time in the journey
  const elapsed = (timestamp - playerState.startTimestamp) * playerState.speed;
  playerState.currentTime = elapsed;

  // Check if playback is complete
  const duration = playerState.journey.endedAt! - playerState.journey.startedAt;
  if (elapsed >= duration) {
    stopPlayback();
    chrome.runtime.sendMessage({ type: 'JOURNEY_PLAYBACK_COMPLETE' });
    return;
  }

  // Update cursor position
  const pos = interpolatePosition(elapsed);
  if (pos && playerState.cursor) {
    playerState.cursor.style.left = `${pos.x}px`;
    playerState.cursor.style.top = `${pos.y}px`;

    // Draw trail
    if (lastPosition && playerState.trailCtx) {
      drawTrailSegment(playerState.trailCtx, lastPosition.x, lastPosition.y, pos.x, pos.y);
    }
    lastPosition = pos;
  }

  // Check for click events to animate
  const events = playerState.journey.events;
  for (let i = processedClickIndex + 1; i < events.length; i++) {
    const e = events[i];
    if (e.timestamp > elapsed) break;

    if (e.type === 'click' && e.x !== undefined && e.y !== undefined) {
      createClickRipple(e.x, e.y, e.button);
      processedClickIndex = i;
    }
  }

  // Fade trail slightly
  if (playerState.trailCtx && Math.random() < 0.3) {
    fadeTrail();
  }

  // Continue animation
  playerState.animationFrame = requestAnimationFrame(animate);
}

/**
 * Start journey playback
 */
function startPlayback(journey: JourneyRecording, speed: number = 1): void {
  // Stop any existing playback
  stopPlayback();

  playerState.journey = journey;
  playerState.speed = speed;
  playerState.playing = true;
  playerState.currentTime = 0;
  lastPosition = null;
  processedClickIndex = -1;

  // Add styles
  addRippleStyles();

  // Create cursor
  playerState.cursor = createCursor();
  document.body.appendChild(playerState.cursor);

  // Create trail canvas
  playerState.trail = createTrailCanvas();
  playerState.trailCtx = playerState.trail.getContext('2d', { willReadFrequently: true });
  document.body.appendChild(playerState.trail);

  // Start animation
  playerState.startTimestamp = performance.now();
  playerState.animationFrame = requestAnimationFrame(animate);

  console.log('[CBrowser Journey] Playback started', journey.events.length, 'events');
}

/**
 * Pause playback
 */
function pausePlayback(): void {
  playerState.playing = false;
  if (playerState.animationFrame) {
    cancelAnimationFrame(playerState.animationFrame);
    playerState.animationFrame = null;
  }
}

/**
 * Resume playback
 */
function resumePlayback(): void {
  if (!playerState.journey) return;

  playerState.playing = true;
  playerState.startTimestamp = performance.now() - playerState.currentTime / playerState.speed;
  playerState.animationFrame = requestAnimationFrame(animate);
}

/**
 * Stop playback and clean up
 */
function stopPlayback(): void {
  playerState.playing = false;
  playerState.currentTime = 0;

  if (playerState.animationFrame) {
    cancelAnimationFrame(playerState.animationFrame);
    playerState.animationFrame = null;
  }

  playerState.cursor?.remove();
  playerState.cursor = null;

  playerState.trail?.remove();
  playerState.trail = null;
  playerState.trailCtx = null;

  lastPosition = null;
  processedClickIndex = -1;
}

/**
 * Set playback speed
 */
function setSpeed(speed: number): void {
  if (playerState.playing) {
    // Adjust start timestamp to maintain position at new speed
    const currentPos = playerState.currentTime;
    playerState.speed = speed;
    playerState.startTimestamp = performance.now() - currentPos / speed;
  } else {
    playerState.speed = speed;
  }
}

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'JOURNEY_PLAY':
      startPlayback(message.journey, message.speed || 1);
      sendResponse({ success: true });
      break;

    case 'JOURNEY_PAUSE':
      pausePlayback();
      sendResponse({ success: true });
      break;

    case 'JOURNEY_RESUME':
      resumePlayback();
      sendResponse({ success: true });
      break;

    case 'JOURNEY_STOP':
      stopPlayback();
      sendResponse({ success: true });
      break;

    case 'JOURNEY_SET_SPEED':
      setSpeed(message.speed);
      sendResponse({ success: true });
      break;

    case 'JOURNEY_GET_STATUS':
      sendResponse({
        playing: playerState.playing,
        currentTime: playerState.currentTime,
        speed: playerState.speed,
        duration: playerState.journey
          ? playerState.journey.endedAt! - playerState.journey.startedAt
          : 0,
      });
      break;

    default:
      // Don't respond to unknown messages (let other handlers process them)
      return false;
  }

  return true;
});

// Handle window resize
window.addEventListener('resize', () => {
  if (playerState.trail) {
    playerState.trail.width = window.innerWidth;
    playerState.trail.height = window.innerHeight;
  }
});

console.log('[CBrowser] Journey player content script loaded');

export {
  startPlayback,
  pausePlayback,
  resumePlayback,
  stopPlayback,
  setSpeed,
};
