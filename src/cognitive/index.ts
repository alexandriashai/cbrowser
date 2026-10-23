/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */


/**
 * Cognitive Journey API Module
 *
 * Provides cognitive user simulation with two modes:
 *
 * ## Mode 1: Claude Code Session (Recommended when inside Claude Code)
 * When running via MCP inside Claude Code, use the step-by-step tools:
 * - `cognitive_journey_init` - Initialize journey with persona
 * - `cognitive_journey_update_state` - Track cognitive state after each action
 * No API key needed - Claude Code itself is the reasoning engine.
 *
 * ## Mode 2: Standalone (API Key Required)
 * When running standalone (CLI, CI/CD, scripts), uses Anthropic API directly:
 * - `npx cbrowser cognitive-journey --persona X --start URL --goal "..."
 * Requires: `npx cbrowser config set-api-key YOUR_KEY`
 *
 * @module cognitive
 */

import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { CBrowser } from "../browser.js";
import { finishAutoCapture, resolveCaptureOptions, startAutoCapture, type AutoCaptureSetting } from "../recording/auto-capture.js";
import {
  getPersona,
  getCognitiveProfile,
  createCognitivePersona,
} from "../personas.js";
import type {
  CognitiveState,
  CognitiveProfile,
  CognitiveJourneyResult,
  AbandonmentThresholds,
  FrictionPoint,
  Persona,
  CognitiveTraits,
  EmotionalState,
  EmotionalEvent,
  EmotionalConfig,
  PersonaLocation,
} from "../types.js";
import {
  createInitialEmotionalState,
  createEmotionalConfig,
  applyEmotionalTrigger,
  decayEmotions,
  decayEmotionsWithTraits,
  deriveSimplifiedState,
  calculateAbandonmentModifier,
  describeEmotionalState,
  shouldConsiderAbandonment,
} from "./emotions.js";
import {
  calculateFatigueIncrement,
  calculateFittsMovementTime,
  FittsLawParams,
  shouldSwitchToSystem2,
  canReturnToSystem1,
  calculateTypingTime,
  calculateScanWidthMultiplier,
  calculateGazeMouseLag,
  calculatePeripheralVision,
  createHabituationState,
  updateHabituationState,
  classifyUIPattern,
} from "../types.js";
import { loadConfigFile, getDataDir } from "../config.js";
import type { CBrowserConfig } from "../config.js";
import { param } from "../visual/model-provenance.js";
import { defaultJourneyTraits } from "./default-traits.js";
import { writeSecretFile } from "../secure-file.js";
import { uniqueStamp } from "../temp-files.js";
import { semanticWeightTable } from "../visual/attention-transport.js";
import type { DecisionProvider } from "./journey-trace.js";
import {
  JourneyTraceWriter,
  TraceReplayProvider,
  hashPageState,
} from "./journey-trace.js";

// ============================================================================
// API Key Management
// ============================================================================

/**
 * Get the Anthropic API key from environment or config file.
 */
export function getAnthropicApiKey(): string | null {
  // 1. Environment variable (highest priority)
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  // 2. Config file
  const config = loadConfigFile();
  if (config?.anthropicApiKey) {
    return config.anthropicApiKey;
  }

  return null;
}

/**
 * Get the Claude model to use for cognitive journeys.
 */
export function getAnthropicModel(): string {
  const config = loadConfigFile();
  return (
    process.env.ANTHROPIC_MODEL ||
    config?.anthropicModel ||
    "claude-sonnet-5"
  );
}

/**
 * Set the Anthropic API key in the config file.
 */
export function setAnthropicApiKey(apiKey: string): void {
  const configPath = join(getDataDir(), "config.json");
  let config: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch (e) {
      console.debug(`[CBrowser] Config file corrupted, starting fresh: ${(e as Error).message}`);
    }
  }

  config.anthropicApiKey = apiKey;
  // Owner-only. This used to be a bare writeFileSync, so the key's permissions
  // were whatever the umask allowed -- 0644, world-readable, by default.
  // writeSecretFile also chmods, because the `mode` option applies only when
  // the file is created and every existing install already has this file.
  writeSecretFile(configPath, JSON.stringify(config, null, 2));
}

/**
 * Remove the Anthropic API key from the config file.
 */
export function removeAnthropicApiKey(): void {
  const configPath = join(getDataDir(), "config.json");
  if (!existsSync(configPath)) return;

  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    delete config.anthropicApiKey;
    // Same treatment on removal: the file still holds the rest of the config,
    // and rewriting it at 0644 would undo the tightening done on save.
    writeSecretFile(configPath, JSON.stringify(config, null, 2));
  } catch (e) {
    console.debug(`[CBrowser] Failed to remove API key from config: ${(e as Error).message}`);
  }
}

/**
 * Check if API key is configured and valid format.
 */
export function isApiKeyConfigured(): boolean {
  const key = getAnthropicApiKey();
  return !!key && key.startsWith("sk-ant-");
}

/**
 * Check if running inside Claude Code session (via MCP).
 * In this mode, cognitive journeys can be driven by Claude Code itself
 * without needing a separate API key.
 */
export function isClaudeCodeSession(): boolean {
  // Check for MCP environment markers
  return !!(
    process.env.CLAUDE_CODE_SESSION ||
    process.env.MCP_SERVER_NAME ||
    process.env.CLAUDE_CODE
  );
}

/**
 * Check if cognitive features are available (either via API key or Claude Code session).
 */
export function isCognitiveAvailable(): boolean {
  return isApiKeyConfigured() || isClaudeCodeSession();
}

// ============================================================================
// Cognitive Journey Runner
// ============================================================================

/**
 * In-page mouse overlay — injected on every navigation when `enableMouseOverlay`
 * is set. Renders a synthetic cursor + click ripples + action banner inside the
 * page DOM so the screen recording / VNC stream actually shows where the bot
 * is interacting. CDP-driven clicks don't move the OS cursor, so without this
 * the recording looks like things click themselves.
 *
 * Exposes `window.__cbShowAction(text)` for the journey runner to surface what
 * is about to happen on screen.
 */
const MOUSE_OVERLAY_SCRIPT = `(() => {
  if (window.__cbHelperInstalled || window.__cbHelperPending) return;
  // addInitScript runs at "earliest" — documentElement may not exist yet, so
  // defer real setup until DOMContentLoaded. Mark "pending" to prevent
  // duplicate scheduling if the script gets re-evaluated mid-load.
  window.__cbHelperPending = true;

  const install = () => {
    if (window.__cbHelperInstalled) return;
    if (!document.documentElement || !document.body) return;
    window.__cbHelperInstalled = true;
    document.documentElement.setAttribute('data-cb-helper', '1');

    const css = \`
    /* Hide native OS / chromium cursors entirely so our injected pointer is
       the ONLY one visible. Combined with x11vnc -nocursor on the server side,
       this guarantees a single cursor in VNC captures. */
    html, body, *, *::before, *::after { cursor: none !important; }

    .cb-cursor {
      position: fixed; left: 0; top: 0;
      width: 56px; height: 56px;
      pointer-events: none;
      z-index: 2147483647;
      transform: translate(-200px, -200px);
      /* GPU-promoted layer — the cursor is updated every frame, so isolating
         it from the rest of the page avoids triggering layout/paint elsewhere
         and gives consistent 60fps motion. */
      will-change: transform;
      transform-origin: 0 0;
    }
    .cb-cursor svg {
      width: 56px; height: 56px;
      filter:
        drop-shadow(0 0 2px #000)
        drop-shadow(0 3px 8px rgba(0,0,0,0.65));
    }
    .cb-wake {
      position: fixed;
      width: 18px; height: 18px;
      border-radius: 50%;
      pointer-events: none;
      z-index: 2147483646;
      transform: translate(-50%, -50%);
      will-change: transform, opacity;
    }
    .cb-wake-1 {
      background: radial-gradient(circle, rgba(99,102,241,0.55) 0%, rgba(99,102,241,0.0) 60%);
      animation: cb-wake-out 0.85s cubic-bezier(0.2,0.8,0.4,1) forwards;
    }
    .cb-wake-2 {
      border: 2px solid rgba(99,102,241,0.95);
      animation: cb-wake-ring 0.9s cubic-bezier(0.2,0.8,0.4,1) forwards;
    }
    @keyframes cb-wake-out {
      0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 0.95; }
      100% { transform: translate(-50%, -50%) scale(4.5); opacity: 0; }
    }
    @keyframes cb-wake-ring {
      0%   { transform: translate(-50%, -50%) scale(0.5); opacity: 1; border-width: 2px; }
      60%  { opacity: 0.7; border-width: 2px; }
      100% { transform: translate(-50%, -50%) scale(5); opacity: 0; border-width: 1px; }
    }
    .cb-scroll-indicator {
      position: fixed;
      right: 24px;
      top: 50%;
      transform: translateY(-50%);
      width: 44px;
      padding: 10px 0;
      background: rgba(15,23,42,0.85);
      color: white;
      border-radius: 22px;
      pointer-events: none;
      z-index: 2147483645;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      opacity: 0;
      transition: opacity 0.25s;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    }
    .cb-scroll-indicator.cb-show { opacity: 1; }
    .cb-scroll-arrow {
      width: 18px; height: 18px;
      animation: cb-scroll-bob 0.55s ease-in-out infinite alternate;
    }
    .cb-scroll-up .cb-scroll-arrow { transform: rotate(180deg); }
    @keyframes cb-scroll-bob {
      0%   { transform: translateY(-3px); opacity: 0.5; }
      100% { transform: translateY(3px); opacity: 1; }
    }
    .cb-action-banner {
      position: fixed;
      top: 14px; left: 50%;
      transform: translateX(-50%);
      padding: 7px 16px;
      max-width: 80vw;
      background: rgba(15,23,42,0.92);
      color: #fff;
      font: 500 13px/1.3 -apple-system, system-ui, sans-serif;
      border-radius: 999px;
      pointer-events: none;
      z-index: 2147483645;
      box-shadow: 0 6px 20px rgba(0,0,0,0.35);
      transition: opacity 0.25s;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      opacity: 0;
    }
    .cb-action-banner.cb-show { opacity: 1; }
  \`;
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);

    const cursor = document.createElement('div');
    cursor.className = 'cb-cursor';
    cursor.innerHTML = '<svg viewBox="0 0 24 24" width="56" height="56" style="display:block"><path d="M5 3 L19 12 L12 13 L15 20 L12 21 L9 14 L5 18 Z" fill="#ffffff" stroke="#000000" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>';
    document.body.appendChild(cursor);

    // ─── Smooth cursor animation ───
    // CDP-driven clicks teleport: we get a single mousedown at target coords
    // with no preceding mousemove. To make the cursor's motion feel natural,
    // animate from the last known position to the new one over ~280ms with
    // ease-out. requestAnimationFrame keeps it at display refresh rate.
    //
    // Persist position across navigations via sessionStorage so the cursor
    // resumes exactly where it was on the prior page (e.g. clicked a link in
    // the nav, new page loads — cursor should still be at the link, not jump
    // back to a default spot).
    let curX, curY;
    try {
      const saved = JSON.parse(sessionStorage.getItem('__cbCursor') || 'null');
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
        curX = Math.min(Math.max(0, saved.x), window.innerWidth);
        curY = Math.min(Math.max(0, saved.y), window.innerHeight);
      }
    } catch {}
    if (typeof curX !== 'number') {
      curX = window.innerWidth / 2;
      curY = 80;
    }
    cursor.style.transform = 'translate(' + (curX - 5) + 'px, ' + (curY - 4) + 'px)';
    const persistCursor = () => {
      try { sessionStorage.setItem('__cbCursor', JSON.stringify({ x: curX, y: curY })); } catch {}
    };
    let animRaf = 0;
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    const setCursor = (x, y) => {
      curX = x; curY = y;
      // Offset so the SVG's hotspot (top-left of the arrow tip) sits at the
      // actual click coordinates. With a 56px sprite we offset by ~8/6.
      cursor.style.transform = 'translate3d(' + (x - 8) + 'px, ' + (y - 6) + 'px, 0)';
      persistCursor();
    };
    // Tighter ease curve — snappier acceleration, gentler arrival. Distance-
    // proportional duration so the cursor never crawls on long hops or jitters
    // on tiny ones.
    const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
    const moveCursorTo = (x, y, durationMs) => {
      if (animRaf) cancelAnimationFrame(animRaf);
      const startX = curX, startY = curY;
      const dx = x - startX, dy = y - startY;
      const dist = Math.hypot(dx, dy);
      // 200ms minimum for visibility; 600ms cap for very long hops; ~3px/ms
      // travel speed in between feels like a deliberate human reach.
      const dur = Math.min(600, Math.max(200, durationMs ?? (180 + dist * 0.55)));
      const t0 = performance.now();
      const tick = () => {
        const t = Math.min(1, (performance.now() - t0) / dur);
        const e = easeOutQuart(t);
        setCursor(startX + dx * e, startY + dy * e);
        if (t < 1) animRaf = requestAnimationFrame(tick);
        else animRaf = 0;
      };
      animRaf = requestAnimationFrame(tick);
    };

    const wake = (x, y) => {
      // Two layered shapes: filled radial (the splash) + ring (the wave).
      const w1 = document.createElement('div');
      w1.className = 'cb-wake cb-wake-1';
      w1.style.left = x + 'px'; w1.style.top = y + 'px';
      const w2 = document.createElement('div');
      w2.className = 'cb-wake cb-wake-2';
      w2.style.left = x + 'px'; w2.style.top = y + 'px';
      document.body.appendChild(w1);
      document.body.appendChild(w2);
      setTimeout(() => { w1.remove(); w2.remove(); }, 950);
    };

    document.addEventListener('mousemove', (e) => moveCursorTo(e.clientX, e.clientY), true);
    document.addEventListener('mousedown', (e) => {
      moveCursorTo(e.clientX, e.clientY, 220);
      // Delay the wake slightly so it appears after the cursor lands.
      setTimeout(() => wake(e.clientX, e.clientY), 180);
    }, true);

    // ─── Scroll indicator ───
    // Shown briefly when wheel events or programmatic scroll happens. Direction
    // arrow flips based on deltaY sign. Auto-hides after activity stops.
    let scrollIndicator = null;
    let scrollDir = 'down';
    let scrollHideTimer = 0;
    const ensureScrollIndicator = () => {
      if (scrollIndicator) return scrollIndicator;
      scrollIndicator = document.createElement('div');
      scrollIndicator.className = 'cb-scroll-indicator';
      scrollIndicator.innerHTML = '<svg class="cb-scroll-arrow" viewBox="0 0 24 24" width="18" height="18"><path d="M7 10 L12 15 L17 10" stroke="white" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      document.body.appendChild(scrollIndicator);
      return scrollIndicator;
    };
    const showScroll = (dy) => {
      const el = ensureScrollIndicator();
      const dir = dy >= 0 ? 'down' : 'up';
      if (dir !== scrollDir) {
        scrollDir = dir;
        el.classList.toggle('cb-scroll-up', dir === 'up');
      }
      el.classList.add('cb-show');
      if (scrollHideTimer) clearTimeout(scrollHideTimer);
      scrollHideTimer = setTimeout(() => el.classList.remove('cb-show'), 700);
    };
    document.addEventListener('wheel', (e) => showScroll(e.deltaY), { capture: true, passive: true });
    // Programmatic scroll (window.scrollBy / scrollTo) doesn't fire wheel —
    // hook the scroll event too with a direction inferred from delta.
    let lastScrollY = window.scrollY;
    document.addEventListener('scroll', () => {
      const cur = window.scrollY;
      const dy = cur - lastScrollY;
      lastScrollY = cur;
      if (Math.abs(dy) > 1) showScroll(dy);
    }, { capture: true, passive: true });

    // ─── Action banner ───
    let banner = null;
    let bannerTimer = null;
    window.__cbShowAction = (text) => {
      if (!banner) {
        banner = document.createElement('div');
        banner.className = 'cb-action-banner';
        document.body.appendChild(banner);
      }
      banner.textContent = text;
      banner.classList.add('cb-show');
      if (bannerTimer) clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { if (banner) banner.classList.remove('cb-show'); }, 2600);
    };

    // ─── Manual cursor positioning ───
    // Let the journey runner pre-position the cursor before a click so the
    // animated travel from previous spot to target is visible (clicks otherwise
    // happen as a single mousedown, animation feels like teleport).
    window.__cbMoveCursor = (x, y, dur) => moveCursorTo(x, y, dur);
  };

  // Defer install until AFTER framework hydration completes. Use
  // requestIdleCallback if available — it fires after main-thread work like
  // hydration settles. Falls back to setTimeout. Modifying the DOM too early
  // races with React/Next.js hydration ("Application error: client-side
  // exception"); too late and the viewer doesn't see the cursor in time.
  const scheduleInstall = () => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(install, { timeout: 600 });
    } else {
      setTimeout(install, 100);
    }
  };
  if (document.readyState !== 'loading') {
    scheduleInstall();
  } else {
    document.addEventListener('DOMContentLoaded', scheduleInstall, { once: true });
  }
})();`;

/**
 * In-browser attention heatmap. Renders a canvas overlay positioned over the
 * viewport and recomputes saliency directly from the DOM on scroll, resize,
 * and DOM mutation. The heatmap is drawn INSIDE the chromium page, which
 * means VNC captures it natively — no Node-side image generation, no SSE
 * payload, no dashboard-side overlay positioning. Per-frame compute is
 * sub-millisecond on modern pages because we're just reading bounding boxes.
 *
 * Config is injected as `window.__cbAttentionConfig` by the journey runner
 * (attentionOverlayInitScript). Every weight and goal constant comes from it,
 * that is from attention-transport's semanticWeightTable; this script holds
 * none of its own (ISC-48.1, 2026-10-22). It is still a simpler model than
 * analyzeAttention: max per cell, max-normalised, no values layer, no
 * perceptual filter, no gaze calibration, and its own element classifier.
 */
const ATTENTION_OVERLAY_SCRIPT = `(() => {
  if (window.__cbAttentionInstalled || window.__cbAttentionPending) return;
  window.__cbAttentionPending = true;

  const install = () => {
    if (window.__cbAttentionInstalled) return;
    if (!document.documentElement || !document.body) return;
    // No config, no overlay: drawing with invented weights is what this
    // replaced.
    const config = window.__cbAttentionConfig;
    if (!config) return;
    window.__cbAttentionInstalled = true;
    const cellSize = 16;

    const css = \`
      .cb-attn-canvas {
        position: fixed; left: 0; top: 0;
        width: 100vw; height: 100vh;
        pointer-events: none;
        z-index: 2147483640;
        opacity: 0.5;
        /* Moderate blur smears the per-cell rectangles into a smooth gradient.
           Lower than 28px to reduce GPU load — heavy blur on a fullscreen
           canvas with --disable-gpu can cause frame drops / black flashes. */
        filter: blur(18px);
        /* Promote canvas to its own compositor layer so blur computes once
           per repaint, not on every parent reflow. */
        transform: translateZ(0);
        backface-visibility: hidden;
      }
    \`;
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);

    const canvas = document.createElement('canvas');
    canvas.className = 'cb-attn-canvas';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    // Color stops — blue (low) → green → yellow → red (high). Alpha grows
    // with saliency so cold areas are nearly transparent.
    const stops = [
      { t: 0.00, r:   0, g:   0, b: 128, a: 0.0 },
      { t: 0.20, r:   0, g:   0, b: 255, a: 0.35 },
      { t: 0.40, r:   0, g: 255, b: 255, a: 0.5 },
      { t: 0.55, r:   0, g: 255, b:   0, a: 0.6 },
      { t: 0.70, r: 255, g: 255, b:   0, a: 0.7 },
      { t: 0.85, r: 255, g: 128, b:   0, a: 0.8 },
      { t: 1.00, r: 255, g:   0, b:   0, a: 0.9 },
    ];
    const sample = (v) => {
      v = Math.max(0, Math.min(1, v));
      let lo = 0;
      while (lo < stops.length - 1 && stops[lo + 1].t < v) lo++;
      const hi = Math.min(lo + 1, stops.length - 1);
      const a = stops[lo], b = stops[hi];
      const span = b.t - a.t || 1;
      const k = (v - a.t) / span;
      return [
        Math.round(a.r + (b.r - a.r) * k),
        Math.round(a.g + (b.g - a.g) * k),
        Math.round(a.b + (b.b - a.b) * k),
        a.a + (b.a - a.a) * k,
      ];
    };

    // Classify a DOM element into one of the persona's weighted categories.
    const classify = (el) => {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role') || '';
      if (el.closest('nav, [role="navigation"]')) return 'navigation';
      if (tag === 'button' || role === 'button' || role === 'link' && tag !== 'a') return 'cta';
      if (tag === 'a') {
        // Prominent CTAs: large buttons styled as anchors
        const txt = (el.innerText || '').trim();
        if (txt && txt.length < 40 && /sign\\s*up|get\\s*started|try|buy|start|create|register|apply/i.test(txt)) return 'cta';
        return 'link';
      }
      if (/^h[1-6]$/.test(tag) || role === 'heading') return 'heading';
      if (tag === 'input' || tag === 'select' || tag === 'textarea') {
        if (/^search$/i.test(el.getAttribute('type') || '') || /search/i.test(el.getAttribute('placeholder') || '')) return 'search';
        return 'form';
      }
      if (tag === 'img' || tag === 'svg') {
        if (el.getAttribute('aria-hidden') === 'true' || el.getAttribute('alt') === '') return 'decorative';
        return 'image';
      }
      if (/\\$\\d|\\d+\\s*(usd|eur|gbp|\\$|€|£)/i.test(el.textContent || '')) return 'price';
      if (el.getAttribute('role') === 'alert' || /\\berror\\b/i.test(el.className || '')) return 'error';
      return 'content';
    };

    // Goal relevance as computeGoalRelevance scores it, with its constants.
    const stopWords = new Set(config.stopWords || []);
    const goalWords = (config.goal || '').toLowerCase()
      .split(/\\s+/).filter(w => w.length >= config.minKeywordLength && !stopWords.has(w));
    const goalRelevance = (text) => {
      if (!text || !goalWords.length) return 0;
      const t = text.toLowerCase();
      let m = 0;
      for (const w of goalWords) if (t.includes(w)) m++;
      return (m / goalWords.length) * config.relevanceGain;
    };

    let lastCells = null;
    let lastDims = { cols: 0, rows: 0, w: 0, h: 0 };
    let frameId = 0;
    const recompute = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
      }
      const cols = Math.ceil(w / cellSize);
      const rows = Math.ceil(h / cellSize);
      const cells = new Float32Array(cols * rows);

      // Sample interactive + structural elements; cap to 600 to bound work
      const sel = 'button, a, [role="button"], [role="link"], [role="heading"], h1, h2, h3, h4, input, select, textarea, [data-cb-cta], img, label, p, li';
      const els = document.querySelectorAll(sel);
      const limit = Math.min(els.length, 600);
      for (let i = 0; i < limit; i++) {
        const el = els[i];
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > h || r.right < 0 || r.left > w) continue;
        if (r.width < 4 || r.height < 4) continue;
        const cs = window.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;

        const type = classify(el);
        // As buildSemanticMap: an unknown type takes the fallback weight, and
        // a type without a modifier is unmodified.
        let weight = config.typeWeights[type] ?? config.typeFallback;
        weight *= config.personaMods[type] ?? 1;
        const text = (el.innerText || el.textContent || '').slice(0, 200);
        const gr = goalRelevance(text);
        if (gr > 0) weight *= (1 + gr);

        const x1 = Math.max(0, Math.floor(r.left / cellSize));
        const x2 = Math.min(cols - 1, Math.floor(r.right / cellSize));
        const y1 = Math.max(0, Math.floor(r.top / cellSize));
        const y2 = Math.min(rows - 1, Math.floor(r.bottom / cellSize));
        for (let rr = y1; rr <= y2; rr++) {
          for (let cc = x1; cc <= x2; cc++) {
            const idx = rr * cols + cc;
            if (cells[idx] < weight) cells[idx] = weight;
          }
        }
      }

      // Normalize
      let max = 0;
      for (let i = 0; i < cells.length; i++) if (cells[i] > max) max = cells[i];
      if (max === 0) max = 1;

      // Render — clearRect first, then per-cell fill. The CSS filter blur
      // (28px) smears these rectangles into a smooth gradient, so we keep the
      // threshold low enough that mid-saliency cells contribute their colors
      // to the blur halo rather than leaving cold gaps.
      ctx.clearRect(0, 0, w, h);
      for (let r0 = 0; r0 < rows; r0++) {
        for (let c0 = 0; c0 < cols; c0++) {
          const v = cells[r0 * cols + c0] / max;
          if (v < 0.03) continue;
          const [rr, gg, bb, aa] = sample(v);
          ctx.fillStyle = 'rgba(' + rr + ',' + gg + ',' + bb + ',' + aa + ')';
          ctx.fillRect(c0 * cellSize, r0 * cellSize, cellSize, cellSize);
        }
      }
      lastCells = cells;
      lastDims = { cols, rows, w, h };
    };

    const schedule = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => { frameId = 0; recompute(); });
    };

    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, { capture: true, passive: true });

    // Watch for major DOM changes — debounce to avoid mutation storms
    let mutTimer = 0;
    new MutationObserver(() => {
      if (mutTimer) clearTimeout(mutTimer);
      mutTimer = setTimeout(schedule, 300);
    }).observe(document.body, { childList: true, subtree: true, attributes: false });

    schedule();
    // Initial settle re-render after fonts/images load
    setTimeout(schedule, 600);
    setTimeout(schedule, 1500);

    // Public API
    window.__cbAttentionToggle = (visible) => {
      canvas.style.display = visible === false ? 'none' : '';
    };
    window.__cbAttentionRefresh = schedule;
    // The raw weights of the last frame (before max-normalisation), so a test
    // can read what was painted rather than decode the canvas.
    window.__cbAttentionCells = () => lastCells
      ? { cols: lastDims.cols, rows: lastDims.rows, cellSize, cells: Array.from(lastCells) }
      : null;
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(install, { timeout: 800 });
  } else {
    setTimeout(install, 150);
  }
})();`;

/**
 * Build the JSON config bundle that drives the in-browser attention heatmap.
 * The browser-side script doesn't have access to the SDK's persona profiles,
 * so the weight table is computed here and shipped.
 *
 * The table is attention-transport's own (semanticWeightTable), not a copy.
 * Until 2026-10-22 this function held a hand-written mirror "kept in sync by
 * hand", and it had drifted: navigation still read siteFamiliarity, which the
 * model dropped on 2026-08-05, so a journey given customTraits
 * { siteFamiliarity: 0 } drew navigation at 1.0 while attention_analysis drew
 * it at 0.7. The page script also kept its own fallback weight, goal gain,
 * keyword length and stop words; they now come from here too. (ISC-48.1)
 */
export function buildAttentionConfig(
  personaName: string,
  goal: string | undefined,
  traits: Partial<CognitiveTraits> | undefined,
): ReturnType<typeof semanticWeightTable> & { goal: string; persona: string } {
  return {
    ...semanticWeightTable(personaName, traits as Record<string, number> | undefined),
    goal: goal || "",
    persona: personaName,
  };
}

/** The init script that installs the in-page heatmap with `config`. */
export function attentionOverlayInitScript(config: ReturnType<typeof buildAttentionConfig>): string {
  return `window.__cbAttentionConfig = ${JSON.stringify(config)};` + ATTENTION_OVERLAY_SCRIPT;
}

export interface CognitiveJourneyOptions {
  /** Persona name or description */
  persona: string;
  /** Goal statement for the journey */
  goal: string;
  /** Starting URL */
  startUrl: string;
  /** Custom cognitive trait overrides */
  customTraits?: Partial<CognitiveTraits>;
  /** Maximum steps before timeout */
  maxSteps?: number;
  /** Maximum time in seconds */
  maxTime?: number;
  /** Verbose output */
  verbose?: boolean;
  /** Run in headless mode (default: false for live viewing, auto-detects server) */
  headless?: boolean;
  /**
   * Record the journey to GIF/WebP/video (v18.70.0).
   *
   * `true` uses defaults; pass an options object for fps/formats/output dir.
   * Capture starts at the start URL and stops before the browser closes, so no
   * separate capture_start/capture_stop call is needed. A capture failure is
   * reported on `result.capture.error` and never fails the journey.
   */
  capture?: AutoCaptureSetting;
  /** Enable vision mode - send screenshots to Claude for visual understanding */
  vision?: boolean;
  /** Callback for step updates */
  onStep?: (step: CognitiveStep) => void;
  /** Location override for the persona (timezone, locale, geolocation) */
  location?: {
    timezone?: string;
    locale?: string;
    geolocation?: { latitude: number; longitude: number; accuracy?: number };
  };
  /** Extra env vars passed to the browser process (e.g. { DISPLAY: ":88" } for live viewer Xvfb) */
  launchEnv?: Record<string, string>;
  /**
   * Use a persistent browser context (shared user-data-dir at ~/.cbrowser/browser-state).
   * Default: true. Set to `false` for isolated runs — required when journeys may execute
   * concurrently, since persistent contexts hold a SingletonLock and only one chromium
   * can own the directory at a time. Audit-worker callers should pass `false`.
   */
  persistent?: boolean;
  /**
   * Inject a synthetic cursor + click ripple + action banner into every page so
   * mouse activity is visible in screen recordings / VNC streams. CDP-driven
   * mouse events don't move the OS cursor; this overlay listens to the DOM
   * mouse events the clicks emit and renders a marker. Live viewer uses this.
   */
  enableMouseOverlay?: boolean;
  /**
   * Device preset name: 'mobile', 'tablet', 'desktop', or a specific device
   * descriptor like 'iPhone 15'. Sets viewport, user-agent, touch, and DPR
   * via Playwright's device emulation. Without this, the journey runs at the
   * default desktop viewport regardless of the persona's claimed device.
   */
  device?: string;
  /** Page size for the journey; wins over the device preset's size and the live-viewer size. */
  viewport?: { width: number; height: number };
  /**
   * Wrap clicks, typing, and scrolling with human-realistic timing
   * (Gaussian-spaced keystrokes, hover-and-dwell, occasional typos and
   * mis-clicks, glance-back scrolls). Required for session-replay parity
   * with real users; off by default to keep non-live runs fast.
   * Live cognitive journeys auto-enable this.
   */
  humanInput?: boolean;
  /**
   * Persistent memory from prior visits to this domain by this persona.
   * Loaded by the audit worker. The runner injects it into the system
   * prompt so the persona remembers prior outcomes, things they tried,
   * and emotional baseline. Without this every visit is amnesiac.
   */
  priorMemory?: {
    visitCount: number;
    lastVisitAt: string | null;
    lastOutcome: { achieved: boolean; reason: string; pagePath?: string } | null;
    observations: string[];
    emotionalBaseline: { satisfaction: number; frustration: number; valence: number } | null;
    thingsTried: string[];
  };
  /**
   * Time context for the journey — drives circadian energy curve which
   * modulates patience, working memory, curiosity, and distraction rate.
   * Same persona at 9am Mon vs 11pm Fri behaves differently. Defaults
   * to current server time (no timezone).
   */
  temporalContext?: {
    now: Date | string;
    timezone?: string;
  };
  /**
   * Record every per-step decision to <dataDir>/traces/<journeyId>.jsonl so
   * the journey can later be replayed without the Anthropic API. Only the
   * page-state HASH, persona, and redacted decision text are written — never
   * raw HTML, page content, or secrets. Off by default.
   */
  trace?: boolean;
  /**
   * Path to a trace file recorded with `trace: true`. Replays its decisions
   * step-by-step instead of calling the Anthropic API for step reasoning.
   * If the live page diverges from the recorded run, the journey throws
   * TraceDivergenceError rather than continuing with stale decisions.
   */
  replayTrace?: string;
  /**
   * Custom per-step decision source. Overrides both the live Claude API and
   * `replayTrace`. Mainly for tests (deterministic fakes, no network).
   */
  decisionProvider?: DecisionProvider;
  /**
   * Build the browser the journey drives, in place of `new CBrowser(config)`.
   * For tests: with a scripted page world and a decisionProvider, the whole
   * loop runs without Chromium or a model (tests/fixtures/journey-world.ts).
   */
  createBrowser?: (config: Partial<CBrowserConfig>) => CBrowser;
}

export interface CognitiveStep {
  step: number;
  phase: "perceive" | "comprehend" | "decide" | "execute" | "evaluate";
  monologue: string;
  action?: string;
  state: CognitiveState;
  /** Step-aligned screenshot. Captured only on initial page load + scroll>100. */
  screenshotPath?: string;
  /** Persona-specific attention heatmap PNG (base64), transparent background. */
  attentionHeatmapBase64?: string;
  /** Current scroll Y at capture time, for overlay alignment. */
  scrollY?: number;
  /** Viewport dimensions at capture time, for overlay sizing. */
  viewport?: { width: number; height: number };
  /** Current URL at step time — dashboard uses to detect page changes and clear overlays. */
  url?: string;
}
// Note: CognitiveJourneyOptions accepts `device` to emulate a specific device
// preset (mobile/tablet/desktop or "iPhone 15", etc.). Wired in below alongside
// the other browserConfig overrides.

/**
 * Run an autonomous cognitive journey using the Claude API.
 *
 * @example
 * ```typescript
 * const result = await runCognitiveJourney({
 *   persona: "first-timer",
 *   goal: "Sign up for an account",
 *   startUrl: "https://example.com",
 * });
 * console.log(result.goalAchieved ? "Success!" : `Abandoned: ${result.abandonmentReason}`);
 * ```
 */
/** Trace step index of the post-journey goal evaluation. */
const FINAL_EVAL_STEP = -1;

export async function runCognitiveJourney(
  options: CognitiveJourneyOptions
): Promise<CognitiveJourneyResult> {
  // A key is needed only when a live model will answer. A replay, or an
  // injected decisionProvider, makes no model calls; before 20.0 they were
  // refused for want of a key anyway.
  const usesLiveModel = !options.decisionProvider && !options.replayTrace;
  const apiKey = getAnthropicApiKey();
  if (usesLiveModel && !apiKey) {
    throw new Error(
      "Anthropic API key not configured.\n\n" +
      "TWO OPTIONS:\n" +
      "1. Inside Claude Code: Use MCP tools (cognitive_journey_init, cognitive_journey_update_state) - no API key needed\n" +
      "2. Standalone/CLI: Run: npx cbrowser config set-api-key YOUR_KEY"
    );
  }

  const anthropic = apiKey ? new Anthropic({ apiKey }) : null;
  const model = getAnthropicModel();

  // Decision-provider seam (v18.68.0): the per-step LLM call sits behind a
  // DecisionProvider so a recorded trace (or an injected fake) can stand in
  // for the live API. The default path is the same anthropic.messages.create
  // call as before — params and text extraction unchanged. The post-journey
  // goal evaluation goes through the same provider (FINAL_EVAL_STEP), so a
  // replay reproduces the recorded verdict with no model call.
  const liveLLMProvider: DecisionProvider = {
    decide: async (ctx) => {
      if (!anthropic) throw new Error("Anthropic API key not configured.");
      const response = await anthropic.messages.create({
        model,
        max_tokens: param("journey.llm.maxTokens"),
        ...(ctx.systemPrompt ? { system: ctx.systemPrompt } : {}),
        messages: ctx.messages.map((m) => ({ role: m.role, content: m.content })),
      });
      return response.content[0].type === "text" ? response.content[0].text : "";
    },
  };
  const decisionProvider: DecisionProvider =
    options.decisionProvider ??
    (options.replayTrace ? new TraceReplayProvider(options.replayTrace) : liveLLMProvider);
  const traceWriter = options.trace ? new JourneyTraceWriter() : null;

  // Get or create persona
  const existingPersona = getPersona(options.persona);
  let personaObj: Persona;

  if (!existingPersona) {
    personaObj = createCognitivePersona(
      options.persona,
      options.persona,
      options.customTraits || {}
    );
  } else if (options.customTraits) {
    // v16.7.1: full default trait set (was only 7, causing trait dropout).
    // Said 25 until 2026-08-01; the model has 26.
    const defaultTraits: CognitiveTraits = defaultJourneyTraits();
    personaObj = {
      ...existingPersona,
      cognitiveTraits: {
        ...defaultTraits,
        ...(existingPersona.cognitiveTraits || {}),
        ...options.customTraits,
      },
    };
  } else {
    personaObj = existingPersona;
  }

  const profile = getCognitiveProfile(personaObj);
  const traits = profile.traits;

  // Build the InputTraits subset used by human-input.ts. CognitiveTraits has
  // proceduralFluency / patience / readingTendency directly; motorPrecision
  // doesn't exist as a cognitive trait, so we proxy it from proceduralFluency
  // (motor and procedural skill correlate strongly: r ≈ 0.5-0.7 in the
  // psychomotor literature). Personas with explicit motor disability traits
  // (low-vision-magnified, motor-impairment-tremor) get extra penalty so
  // their clicks visibly miss more often.
  const aTraits = (personaObj as { accessibilityTraits?: { motorControl?: number } }).accessibilityTraits;
  const motorBase = traits.proceduralFluency ?? param("journey.defaultTrait");
  const motorPenalty = aTraits?.motorControl !== undefined ? aTraits.motorControl : 1.0;
  const inputTraits = {
    proceduralFluency: traits.proceduralFluency ?? param("journey.defaultTrait"),
    motorPrecision: Math.max(param("journey.input.motorPrecisionFloor"), Math.min(1, motorBase * motorPenalty)),
    patience: traits.patience ?? param("journey.defaultTrait"),
    readingTendency: traits.readingTendency ?? param("journey.defaultTrait"),
  };

  // Calculate abandonment thresholds
  // Every limit is registered (journey.abandon.*, src/visual/provenance/journey.ts).
  const lowComprehension = traits.comprehension < param("journey.band.low.comprehension");
  const lowPatience = traits.patience < param("journey.band.low.patience");
  const highPatience = traits.patience > param("journey.band.high.patience");
  const lowPersistence = traits.persistence < param("journey.band.low.persistence");
  const highPersistence = traits.persistence > param("journey.band.high.persistence");
  const thresholds: AbandonmentThresholds = {
    patienceMin: param("journey.abandon.patienceFloor"),
    confusionMax: lowComprehension ? param("journey.abandon.confusionLimit.lowComprehension") : param("journey.abandon.confusionLimit"),
    frustrationMax: lowPatience ? param("journey.abandon.frustrationLimit.lowPatience") : param("journey.abandon.frustrationLimit"),
    maxStepsWithoutProgress: highPersistence ? param("journey.abandon.noProgressSteps.highPersistence") : param("journey.abandon.noProgressSteps"),
    loopDetectionThreshold: param("journey.abandon.loopUniquePages"),
    timeLimit:
      options.maxTime ||
      (highPatience ? param("journey.abandon.timeLimitSeconds.highPatience") : lowPatience ? param("journey.abandon.timeLimitSeconds.lowPatience") : param("journey.abandon.timeLimitSeconds")),
    // Decision fatigue threshold based on persistence (v9.9.0)
    // High persistence = can handle more decisions before giving up
    decisionFatigueMax: highPersistence ? param("journey.abandon.fatigueLimit.highPersistence") : lowPersistence ? param("journey.abandon.fatigueLimit.lowPersistence") : param("journey.abandon.fatigueLimit"),
  };

  // Initialize state
  const state: CognitiveState = {
    patienceRemaining: 1.0,
    confusionLevel: 0.0,
    frustrationLevel: 0.0,
    goalProgress: 0.0,
    confidenceLevel: param("journey.initialConfidence"),
    currentMood: "neutral",
    memory: {
      pagesVisited: [options.startUrl],
      actionsAttempted: [],
      errorsEncountered: [],
      backtrackCount: 0,
    },
    timeElapsed: 0,
    stepCount: 0,
    // Decision fatigue tracking (v9.9.0)
    decisionFatigue: {
      decisionsMade: 0,
      fatigueLevel: 0,
      lastDecisionComplexity: 0,
      choosingDefaults: false,
    },
    // Dual-process cognitive mode (v10.0.0)
    // Experts start in System 1 (fast), novices in System 2 (slow)
    cognitiveMode: {
      system: traits.comprehension > param("journey.band.high.comprehension") ? 1 : 2,
      switchThreshold: lowComprehension ? param("journey.dualProcess.switchThreshold.lowComprehension") : param("journey.dualProcess.switchThreshold"),
      system1Errors: 0,
      timeInSystem1: 0,
      timeInSystem2: 0,
    },
    // F-Pattern degradation under cognitive load (v10.1.0)
    scanPattern: {
      basePattern: personaObj.humanBehavior?.attention?.pattern || "f-pattern",
      widthMultiplier: 1.0,
      effectiveWidth: param("journey.percentScale"),
    },
    missedDueToTunnelVision: 0,
    // Peripheral vision affected by stress (v10.1.0) - Yerkes-Dodson Law
    peripheralVision: {
      widthFactor: 1.0,
      heightFactor: 1.0,
      arousalLevel: 0,
    },
    // Habituation/banner blindness state (v10.1.0)
    habituation: createHabituationState(
      // Low comprehension = faster blindness (lower threshold)
      traits.comprehension > param("journey.band.high.comprehension")
        ? param("journey.habituation.exposures.highComprehension")
        : lowComprehension ? param("journey.habituation.exposures.lowComprehension") : param("journey.habituation.exposures")
    ),
    // Gaze-to-mouse lag based on age (v10.1.0) - WebGazer.js research
    gazeMouseLag: calculateGazeMouseLag(personaObj.demographics?.age_range),
    // Emotional state based on appraisal theory (v13.1.0) - Scherer 2001
    emotionalState: createInitialEmotionalState(traits),
    emotionalJourney: [],
  };

  // Create emotional configuration for this persona (v13.1.0)
  const emotionalConfig = createEmotionalConfig(traits);

  // Calculate Fitts' Law params from persona (v9.9.0)
  // Higher jitter/overshoot = more tremor-like movement
  // Demographics age affects motor control
  const mouseParams = personaObj.humanBehavior?.mouse;
  const ageRange = personaObj.demographics?.age_range;

  // Derive age modifier from age_range (e.g., "18-25", "65+")
  let ageModifier = 1.0;
  if (ageRange) {
    const ageMatch = ageRange.match(/(\d+)/);
    if (ageMatch) {
      const age = parseInt(ageMatch[1], 10);
      // Motor control degrades with age: 1.0 at 25, 1.5 at 65, 2.0 at 85
      const onset = param("journey.fitts.ageOnset");
      ageModifier = age > onset ? 1 + (age - onset) / param("journey.fitts.agePerSlowdown") : 1.0;
    }
  }

  // Derive tremor modifier from mouse params or motor traits
  let tremorModifier = 0;
  if (mouseParams) {
    // Higher jitter = more tremor effect
    tremorModifier = (mouseParams.jitter || 0) / param("journey.fitts.jitterScale");
  }

  const fittsParams: Partial<FittsLawParams> = {
    ageModifier,
    tremorModifier,
  };

  // Initialize browser (auto-detect headless for servers without display)
  const headless = options.headless ?? !process.env.DISPLAY;

  // Merge location settings: options.location > persona.location > defaults
  const effectiveLocation: PersonaLocation = {
    ...(personaObj.location || {}),
    ...(options.location || {}),
  };

  // Create browser with timezone/locale/geolocation if specified
  const browserConfig: {
    headless: boolean;
    persistent: boolean;
    timezone?: string;
    locale?: string;
    geolocation?: { latitude: number; longitude: number; accuracy?: number };
    launchEnv?: Record<string, string>;
    viewportWidth?: number;
    viewportHeight?: number;
    kioskMode?: boolean;
    windowWidth?: number;
    windowHeight?: number;
    device?: string;
    viewportOverride?: { width: number; height: number };
    timeout?: number;
    followPopups?: boolean;
  } = {
    headless,
    persistent: options.persistent ?? true,
  };
  if (effectiveLocation.timezone) browserConfig.timezone = effectiveLocation.timezone;
  if (effectiveLocation.locale) browserConfig.locale = effectiveLocation.locale;
  if (effectiveLocation.geolocation) browserConfig.geolocation = effectiveLocation.geolocation;
  if (options.launchEnv) browserConfig.launchEnv = options.launchEnv;
  if (options.device) browserConfig.device = options.device;

  // Live viewer alignment: chromium runs in a 1920×1080 OS window on Xvfb;
  // browser chrome (tabs + URL bar) takes ~85px from the top, so the visible
  // page area is 1920×995. We size the Playwright viewport to MATCH that
  // visible area — that way the attention heatmap (computed for window.inner*)
  // is exactly the right shape to overlay on the VNC stream.
  // Window size stays at 1920×1080 so chromium fills Xvfb edge-to-edge.
  // Dashboard overlay positions: top:7.87% (85/1080), height:92.13% (995/1080).
  if (options.enableMouseOverlay) {
    browserConfig.viewportWidth = param("journey.live.screenWidth");
    browserConfig.viewportHeight = param("journey.live.pageHeight");
    browserConfig.windowWidth = param("journey.live.screenWidth");
    browserConfig.windowHeight = param("journey.live.screenHeight");
    // Heavy university / news / e-commerce sites often need >30s to reach
    // domcontentloaded with all their analytics/CDN scripts. Live journeys
    // get a 60s navigation budget per attempt.
    browserConfig.timeout = param("journey.live.navigationTimeoutMs");
    // When a click opens target="_blank" or window.open, follow the new tab
    // so VNC keeps showing where the persona actually went.
    browserConfig.followPopups = true;
  }
  if (options.viewport) {
    browserConfig.viewportWidth = options.viewport.width;
    browserConfig.viewportHeight = options.viewport.height;
    browserConfig.viewportOverride = options.viewport;
  }

  const browser = options.createBrowser ? options.createBrowser(browserConfig) : new CBrowser(browserConfig);

  // Helper that re-injects the mouse overlay. The overlay script is idempotent
  // (gates on window.__cbHelperInstalled), so calling this after every navigation
  // is safe and ensures the overlay always survives full page loads.
  const installMouseOverlay = async (): Promise<void> => {
    if (!options.enableMouseOverlay) return;
    try {
      const page = await browser.getPage();
      await page.evaluate(MOUSE_OVERLAY_SCRIPT);
    } catch (e) {
      console.warn(`[cognitive] Mouse overlay inject failed: ${(e as Error).message}`);
    }
  };

  // Add the script as a context-level init script too — this catches new
  // pages opened by JS (target=_blank, window.open) without us having to
  // re-inject in the journey loop.
  if (options.enableMouseOverlay) {
    try {
      const initialPage = await browser.getPage();
      await initialPage.context().addInitScript(MOUSE_OVERLAY_SCRIPT);

      // In-browser attention heatmap. Renders to a canvas inside the page so
      // VNC captures it natively and updates instantly with scroll/resize.
      // Persona modifiers (type weights × cognitive traits) are precomputed
      // here in Node and serialized into the page as window.__cbAttentionConfig.
      const attentionConfig = buildAttentionConfig(personaObj.name, options.goal, traits);
      await initialPage.context().addInitScript(attentionOverlayInitScript(attentionConfig));
    } catch (e) {
      console.warn(`[cognitive] Overlay context init failed: ${(e as Error).message}`);
    }
  }

  // Navigate with retry for transient network errors. Use domcontentloaded
  // strategy (not the default "auto" which tries networkidle first) — heavy
  // sites like .edu / news / e-commerce often never reach networkidle and
  // would burn the full 30s timeout before falling back. Once DOM is
  // interactive the persona can start perceiving; trailing tracker requests
  // shouldn't block. ERR_NETWORK_CHANGED retried up to 4 times.
  // Hard timeout per attempt is browserConfig.timeout (set to 60s above for
  // live mode).
  let lastErr: Error | undefined;
  const navAttempts = param("journey.nav.attempts");
  for (let attempt = 1; attempt <= navAttempts; attempt++) {
    try {
      await browser.navigate(options.startUrl, { waitStrategy: "domcontentloaded" });
      lastErr = undefined;
      break;
    } catch (navErr) {
      lastErr = navErr as Error;
      const isTransient = /ERR_NETWORK_CHANGED|ERR_CONNECTION|ERR_TIMED_OUT|Timeout/i.test(lastErr.message);
      if (attempt === navAttempts || !isTransient) {
        if (!isTransient) throw lastErr;
      }
      await new Promise(r => setTimeout(r, param("journey.nav.backoffMs") * attempt));
    }
  }
  if (lastErr) throw lastErr;

  // Inject into the freshly-loaded page (init script may have raced the navigation)
  await installMouseOverlay();

  // Auto-capture (v18.70.0): recording starts once the journey's start URL is
  // loaded, so frame 0 is the page the persona actually opens on, and stops
  // just before the browser closes. Capture never fails the journey.
  const captureSession = await startAutoCapture(
    await browser.getPage(),
    options.capture,
    `journey-${options.persona.replace(/[^a-zA-Z0-9-_]+/g, "-").toLowerCase()}-${uniqueStamp()}`,
  );

  // Apply geolocation at runtime as well (ensures permission is granted after context exists)
  if (effectiveLocation.geolocation) {
    await browser.setGeolocationRuntime(effectiveLocation.geolocation);
  }

  const fullMonologue: string[] = [];
  const frictionPoints: FrictionPoint[] = [];
  const startTime = Date.now();
  const maxSteps = options.maxSteps || param("journey.maxSteps");

  // ── Returning-visit familiarity boost ─────────────────────────────────
  // The persona's existing siteFamiliarity trait already drives perception
  // (navigation weighting in attention-transport, scan-path defaults, etc.).
  // Rather than bolt a separate "memory" mechanism on top, we LIFT
  // siteFamiliarity based on prior-visit count so the existing pipeline
  // automatically reflects "this site feels familiar to me." Saturating
  // curve: 0 visits = persona's baseline, 1 visit ≈ +0.22, 3 ≈ +0.53,
  // 5 ≈ +0.72, 10+ ≈ +0.92 — asymptotes near 1.
  if (options.priorMemory && options.priorMemory.visitCount > 0) {
    const v = options.priorMemory.visitCount;
    const familiarityBoost = 1 - Math.exp(-v / param("journey.familiarity.visitScale"));
    const baseline = traits.siteFamiliarity ?? param("journey.defaultTrait");
    // Boost toward 1.0 from baseline. The persona keeps any fundamental
    // cognitive trait (e.g. low transferLearning still matters) but the
    // domain-specific familiarity component lifts.
    traits.siteFamiliarity = Math.min(1, baseline + (1 - baseline) * familiarityBoost);
    if (options.verbose) {
      console.log(`👁️ siteFamiliarity ${baseline.toFixed(2)} → ${traits.siteFamiliarity.toFixed(2)} (visit #${v + 1})`);
    }
  }

  // ── Time-of-day / circadian modulation ────────────────────────────────
  // Layered ON TOP of the persona's base traits. Same persona at 11pm Fri
  // is less patient, less curious about exploring, and more distractible
  // than at 10am Tue. Modulators are additive deltas clamped to [-0.4, 0.4].
  // Falls back to server-current time + UTC if no temporalContext provided.
  let temporalModulators: import("./temporal.js").TemporalModulators | null = null;
  let temporalState: import("./temporal.js").TemporalState | null = null;
  try {
    const { getTemporalState, computeTemporalModulators } = await import("./temporal.js");
    const tCtx = options.temporalContext ?? { now: new Date() };
    temporalState = getTemporalState(tCtx);
    temporalModulators = computeTemporalModulators(temporalState);

    // Apply trait deltas
    traits.patience = Math.max(0, Math.min(1, (traits.patience ?? param("journey.defaultTrait")) + temporalModulators.patienceDelta));
    if (traits.workingMemory !== undefined) {
      traits.workingMemory = Math.max(0, Math.min(1, traits.workingMemory + temporalModulators.workingMemoryDelta));
    }
    if (traits.curiosity !== undefined) {
      traits.curiosity = Math.max(0, Math.min(1, traits.curiosity + temporalModulators.curiosityDelta));
    }
    if (traits.metacognitivePlanning !== undefined) {
      traits.metacognitivePlanning = Math.max(0, Math.min(1,
        traits.metacognitivePlanning + temporalModulators.metacognitiveDelta,
      ));
    }
    if (options.verbose) {
      console.log(`🕐 Temporal: ${temporalState.description} (energy ${temporalState.energy.toFixed(2)})`);
      console.log(`   Δ patience ${temporalModulators.patienceDelta >= 0 ? "+" : ""}${temporalModulators.patienceDelta.toFixed(2)}, distraction rate ${(temporalModulators.distractionRate * 100).toFixed(0)}%`);
    }
  } catch (e) {
    console.warn(`[cognitive] temporal modulation skipped: ${(e as Error).message}`);
  }

  // Build system prompt AFTER the familiarity AND temporal adjustments so
  // any prompt strings derived from traits use the modulated values. Then
  // append a returning-visit recall block with concrete observations.
  let systemPrompt = buildCognitiveSystemPrompt(
    personaObj,
    profile,
    options.goal,
    thresholds
  );
  if (options.priorMemory && options.priorMemory.visitCount > 0) {
    const m = options.priorMemory;
    const sinceDays = m.lastVisitAt
      ? Math.round((Date.now() - new Date(m.lastVisitAt.replace(" ", "T") + "Z").getTime()) / param("journey.msPerDay"))
      : null;
    const sinceStr = sinceDays === null
      ? "before"
      : sinceDays === 0 ? "earlier today" : sinceDays === 1 ? "yesterday" : `${sinceDays} days ago`;
    const outcomeStr = m.lastOutcome
      ? (m.lastOutcome.achieved
          ? `Last visit you achieved your goal (${m.lastOutcome.reason}).`
          : `Last visit you abandoned (${m.lastOutcome.reason}).`)
      : "";
    const obsStr = m.observations.length
      ? `\nThings you remember about this site:\n${m.observations.map(o => `  • ${o}`).join("\n")}`
      : "";
    const baselineStr = m.emotionalBaseline
      ? `\nYour residual feeling about this site (decayed since ${sinceStr}): satisfaction=${m.emotionalBaseline.satisfaction.toFixed(2)}, frustration=${m.emotionalBaseline.frustration.toFixed(2)}.`
      : "";
    const memBlock = `

— RETURNING-VISIT CONTEXT —
This is your ${m.visitCount + 1}${ordinalSuffix(m.visitCount + 1)} visit to this site (last visited ${sinceStr}). ${outcomeStr}${obsStr}${baselineStr}
Use this memory naturally — don't recite it, but let it shape your patience, your scan path, and your defaults. If your last visit ended in frustration, that residue carries; if you've used the search before, you'll head there again before scrolling.`;
    systemPrompt += memBlock;
  }

  // Append time-of-day context — short, naturalistic. The trait deltas
  // already shifted the persona's behavior implicitly; this string makes
  // the framing recallable in monologue ("It's late and I just want this
  // done").
  if (temporalState) {
    systemPrompt += `

— WHEN —
Right now it's ${temporalState.description}.`;
  }
  // Seed emotional state from carried-over baseline so the persona starts the
  // session feeling whatever decayed-residue from last time, not pure neutral.
  if (options.priorMemory?.emotionalBaseline && state.emotionalState) {
    const b = options.priorMemory.emotionalBaseline;
    state.emotionalState.satisfaction = Math.min(1, Math.max(0, state.emotionalState.satisfaction + b.satisfaction));
    state.emotionalState.frustration = Math.min(1, Math.max(0, state.emotionalState.frustration + b.frustration));
  }

  // Conversation history for Claude
  const messages: Array<{
    role: "user" | "assistant";
    content: string;
  }> = [];

  let goalAchieved = false;
  let abandonmentReason: CognitiveJourneyResult["abandonmentReason"];
  let abandonmentMessage: string | undefined;
  let currentUrl = options.startUrl;
  let goalEvidence: string | undefined;
  let failureReason: string | undefined;

  // Last action outcome — fed into the next step's prompt so the AI gets a
  // structured "what changed" report instead of having to infer from raw state.
  // Without this, Claude often reasons as if the page is unchanged when in fact
  // a navigation happened (or vice versa).
  let lastActionOutcome: {
    action: string;
    target?: string;
    success: boolean;
    urlChanged: boolean;
    fromUrl?: string;
    toUrl?: string;
    scrollDelta?: number;
    newClickables?: string[];
    removedClickables?: string[];
  } | null = null;
  let prevClickableTexts = new Set<string>();
  let prevScrollY = 0;

  // Per-URL last-captured scroll Y. Drives screenshot gating: capture on first
  // visit to a URL or when subsequent scroll exceeds 100px since last capture.
  const lastScreenshotScroll = new Map<string, number>();

  // v18.29.0: Step-by-step journey log with path, elements, evidence
  const journeyLog: Array<{
    step: number;
    url: string;
    pageTitle: string;
    phase: string;
    action: string | null;
    actionTarget: string | null;
    focusedElement: string | null;
    monologue: string;
    mood: string;
    goalProgress: number;
    patience: number;
    confusion: number;
    frustration: number;
    timestamp: number;
    screenshotPath?: string;
    attentionHeatmapBase64?: string;
    scrollY?: number;
    viewport?: { width: number; height: number };
  }> = [];

  // Main cognitive loop
  for (let step = 1; step <= maxSteps; step++) {
    state.stepCount = step;
    state.timeElapsed = (Date.now() - startTime) / param("journey.msPerSecond");

    // Check time limit
    if (state.timeElapsed > thresholds.timeLimit) {
      abandonmentReason = "timeout";
      abandonmentMessage = `I've spent too long on this (${Math.round(state.timeElapsed)}s). Giving up.`;
      break;
    }

    // Ambient distraction roll — phone buzz, kid asks question, doorbell.
    // Rate driven by circadian energy: ~3% per step at peak alertness, up
    // to ~25% when tired. Skipped on step 1 (just landed, focused).
    if (temporalModulators && step > 1) {
      const { rollDistraction } = await import("./temporal.js");
      const distractMs = rollDistraction(temporalModulators);
      if (distractMs > 0) {
        if (options.verbose) console.log(`📵 Distraction: ${(distractMs / 1000).toFixed(1)}s pause`);
        await new Promise(r => setTimeout(r, distractMs));
      }
    }

    // Get page info first (cheap) so we can decide whether to screenshot.
    // bringToFront ensures the persona's tab is the visible one in chromium
    // — important for VNC viewers when a click opened a new tab.
    const page = await browser.getPage();
    try { await page.bringToFront(); } catch { /* page may have been closed */ }

    // Browser health check — chromium's renderer can freeze on heavy pages,
    // leaving the VNC stream black while the worker keeps stepping. A trivial
    // page.evaluate that times out >5s means the renderer is unresponsive.
    // Abort the journey rather than wedging until the 10-min hard cap.
    try {
      await Promise.race([
        page.evaluate("1+1"),
        new Promise((_, rej) => setTimeout(() => rej(new Error("renderer health check timed out")), param("journey.healthCheckMs"))),
      ]);
    } catch (healthErr) {
      console.warn(`[cognitive] step ${step}: ${(healthErr as Error).message} — aborting journey`);
      abandonmentReason = "timeout";
      abandonmentMessage = `Browser became unresponsive on step ${step}. (${(healthErr as Error).message})`;
      break;
    }

    const pageTitle = await page.title() || "Current Page";
    const availableElements = await browser.getAvailableClickables();
    const availableInputs = await browser.getAvailableInputs();
    const viewportCtx = await browser.getViewportContext();

    // Screenshot gating: only capture on (a) initial page load — first step
    // ever for this URL, OR (b) when scroll position changed >100px since the
    // last capture. This avoids spamming the disk with near-identical frames
    // on tiny scroll/click steps and keeps the per-step paths renderer
    // limited to meaningful visual transitions.
    const screenshotKey = currentUrl.split('?')[0]; // strip query for stable keying
    const lastCapturedScrollY = lastScreenshotScroll.get(screenshotKey);
    const isInitialLoadForUrl = lastCapturedScrollY === undefined;
    const scrolledEnough = lastCapturedScrollY !== undefined && Math.abs(viewportCtx.scroll.y - lastCapturedScrollY) > param("journey.screenshot.scrollPx");
    const shouldCapture = isInitialLoadForUrl || scrolledEnough;
    let screenshotPath: string | undefined;
    let attentionHeatmapBase64: string | undefined;
    if (shouldCapture) {
      // Live mode renders the heatmap IN the browser via canvas overlay
      // (see ATTENTION_OVERLAY_SCRIPT) so VNC picks it up natively. We just
      // poke the in-page recompute on capture triggers so it refreshes when
      // the page shape changes; the canvas already responds to scroll/resize
      // automatically. Server-side heatmap generation only runs for non-live
      // (or backwards-compat) callers.
      const screenshotP = browser.screenshot().catch(() => undefined);
      lastScreenshotScroll.set(screenshotKey, viewportCtx.scroll.y);

      if (options.enableMouseOverlay) {
        try {
          await page.evaluate(`window.__cbAttentionRefresh && window.__cbAttentionRefresh()`);
        } catch { /* page navigated mid-call */ }
      }
      // Wait for screenshot to finish (started in parallel above)
      screenshotPath = await screenshotP;
    }

    // Compute "what changed since last step" so the AI gets a structured diff
    // instead of having to re-derive it from raw state. Only meaningful from
    // step 2 onward (step 1 has no prior to compare against).
    if (lastActionOutcome) {
      const currentTexts = new Set(availableElements.map(e => e.text));
      const keep = param("journey.prompt.changedElements");
      const newClickables = [...currentTexts].filter(t => t && !prevClickableTexts.has(t)).slice(0, keep);
      const removedClickables = [...prevClickableTexts].filter(t => t && !currentTexts.has(t)).slice(0, keep);
      lastActionOutcome.newClickables = newClickables;
      lastActionOutcome.removedClickables = removedClickables;
      lastActionOutcome.scrollDelta = viewportCtx.scroll.y - prevScrollY;
    }
    prevClickableTexts = new Set(availableElements.map(e => e.text));
    prevScrollY = viewportCtx.scroll.y;

    // Extract visible page content. The old version grabbed the first 3 H1/H2/H3
    // and first 3 paragraphs by document order — meaning a Pricing page often
    // omitted the actual prices, and a long article omitted its body. The new
    // version walks the visible viewport and captures every meaningful text
    // node above-the-fold + a band just below, ordered top-to-bottom.
    // The extractor runs in the page, which cannot call param(); its limits
    // are read here and passed in.
    const contentLimits = {
      lookaheadShare: param("journey.content.lookaheadShare"),
      aboveViewportPx: param("journey.content.aboveViewportPx"),
      minWidthPx: param("journey.content.minWidthPx"),
      minHeightPx: param("journey.content.minHeightPx"),
      minChars: param("journey.content.minChars"),
      maxChars: param("journey.content.maxChars"),
      maxLines: param("journey.content.maxLines"),
    };
    const pageContent = await page.evaluate((L) => {
      const vh = window.innerHeight;
      const lookahead = vh * L.lookaheadShare; // include a strip just below the fold so AI can plan ahead
      const out: Array<{ y: number; line: string }> = [];
      const skipTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'svg', 'IFRAME']);
      const nodes = document.querySelectorAll('h1, h2, h3, h4, p, li, td, th, [role="heading"], [data-testid]');
      nodes.forEach(el => {
        if (skipTags.has(el.tagName)) return;
        const r = el.getBoundingClientRect();
        if (r.bottom < -L.aboveViewportPx) return; // above viewport
        if (r.top > vh + lookahead) return; // far below
        if (r.width < L.minWidthPx || r.height < L.minHeightPx) return;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return;
        const text = (el as HTMLElement).innerText?.trim();
        if (!text || text.length < L.minChars) return;
        // Trim long paragraphs but keep prices/key info
        const trimmed = text.length > L.maxChars ? text.substring(0, L.maxChars) + '…' : text;
        const tag = el.tagName.toLowerCase();
        const tagLabel = ['h1','h2','h3','h4'].includes(tag) ? tag.toUpperCase() : tag;
        const visMark = r.top < vh && r.bottom > 0 ? '👁' : '↓';
        out.push({ y: r.top, line: `${visMark}[${tagLabel}] ${trimmed}` });
      });
      out.sort((a, b) => a.y - b.y);
      // Dedup adjacent identical lines (common in nested elements)
      const dedup: string[] = [];
      let prev = '';
      for (const o of out) {
        if (o.line !== prev) { dedup.push(o.line); prev = o.line; }
      }
      return dedup.slice(0, L.maxLines).join('\n');
    }, contentLimits).catch(() => '');

    // Habituation/Banner Blindness tracking (v10.1.0)
    // Detect UI patterns in available elements and update habituation state
    if (state.habituation) {
      for (const element of availableElements) {
        const pattern = classifyUIPattern(element.text);
        if (pattern !== "other") {
          state.habituation = updateHabituationState(state.habituation, pattern);

          // Check if this pattern is now blind and log
          if (options.verbose && state.habituation.blindPatterns.includes(pattern)) {
            console.log(`👁️ Banner blindness: now ignoring "${pattern}" patterns`);
          }
        }
      }
    }

    // Build step prompt with available elements so Claude knows what's clickable and fillable
    const stepPrompt = buildStepPrompt(state, currentUrl, pageTitle, step, availableElements, availableInputs, pageContent, viewportCtx, lastActionOutcome);

    // Build message content - with or without vision
    let messageContent: Anthropic.MessageParam["content"];
    if (options.vision && screenshotPath && existsSync(screenshotPath)) {
      // Vision mode: send screenshot as image
      const imageData = readFileSync(screenshotPath).toString('base64');
      messageContent = [
        {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: "image/png" as const,
            data: imageData,
          },
        },
        {
          type: "text" as const,
          text: stepPrompt,
        },
      ];
    } else {
      messageContent = stepPrompt;
    }

    messages.push({ role: "user", content: messageContent as string });

    // Page-state hash keys this step for trace record/replay. Built from the
    // same inputs at record and replay time (URL + extracted page content) so
    // replay detects when the live page stops matching the recorded run.
    const pageStateHash = hashPageState(currentUrl, pageContent);

    // Call the decision provider for cognitive reasoning — the live Claude
    // API by default; a recorded trace or injected fake when the new
    // trace/replayTrace/decisionProvider options are set.
    const assistantMessage = await decisionProvider.decide({
      stepIndex: step,
      pageStateHash,
      persona: personaObj.name,
      systemPrompt,
      messages,
    });
    messages.push({ role: "assistant", content: assistantMessage });

    // Record the decision when tracing is on (JSONL, redacted, hash-only
    // page state — see journey-trace.ts).
    if (traceWriter) {
      traceWriter.record({
        step,
        pageStateHash,
        persona: personaObj.name,
        decision: assistantMessage,
        ts: new Date().toISOString(),
      });
    }

    // Parse Claude's response
    const parsed = parseCognitiveResponse(assistantMessage);

    // Capture URL BEFORE we apply any action. We use the previous URL +
    // the post-action URL to gate goal progress on real evidence — Claude's
    // self-reported progress is taken as a *signal*, but only allowed to
    // advance the canonical goalProgress if a concrete action actually
    // happened (URL changed, an interactive action succeeded, etc).
    const urlBeforeAction = currentUrl;
    state.currentMood = parsed.mood ?? state.currentMood;

    // ─── Single source of truth: drive everything through emotionalState ───
    //
    // Previously we wrote `state.confusionLevel = parsed.newConfusion`
    // and `state.frustrationLevel = parsed.newFrustration` directly,
    // running in parallel with the Scherer EmotionalState updates below.
    // Two systems, two truths, drift every step.
    //
    // Now: Claude's reported values are SIGNALS that fire emotional triggers
    // on the canonical EmotionalState. After the trigger applies and the
    // state decays (with persona-trait-modulated rates), we sync the
    // simplified-view fields (confusionLevel / frustrationLevel /
    // patienceRemaining) from the canonical store via deriveSimplifiedState.
    //
    // Consumers (worker, dashboard, MCP tools, persona-comparison) keep
    // reading the same field names; the values are just consistent now.

    if (state.emotionalState) {
      // Determine triggers from the action outcome. Claude reports what
      // happened; we translate those signals into emotional triggers.
      const actionSuccess = parsed.actionSuccess !== false;
      const claudeConfusion = parsed.newConfusion ?? state.emotionalState.confusion;
      const claudeFrustration = parsed.newFrustration ?? state.emotionalState.frustration;
      const signalThreshold = param("journey.signal.changeThreshold");
      const confusionIncreased = claudeConfusion > state.emotionalState.confusion + signalThreshold;
      const confusionDecreased = claudeConfusion < state.emotionalState.confusion - signalThreshold;
      const frustrationIncreased = claudeFrustration > state.emotionalState.frustration + signalThreshold;

      // Severity scales with the magnitude of the LLM-reported delta — Claude
      // proposes a value, we use the *delta* (clamped to [0, 1]) as the
      // trigger's intensity, instead of trusting Claude's absolute number.
      const confusionDelta = Math.max(0, Math.min(1, claudeConfusion - state.emotionalState.confusion));
      const frustrationDelta = Math.max(0, Math.min(1, claudeFrustration - state.emotionalState.frustration));

      // Triggers are evaluated in priority order; first match wins. Multiple
      // matched signals can fire sequentially below if both are strong.
      const triggersToFire: Array<{
        trigger: import("../types.js").EmotionalTrigger;
        severity: number;
        description: string;
      }> = [];

      if (!actionSuccess && parsed.errorMessage) {
        triggersToFire.push({ trigger: "error", severity: param("journey.severity.error"), description: parsed.errorMessage });
      } else if (!actionSuccess) {
        triggersToFire.push({ trigger: "failure", severity: 1.0, description: "Action did not succeed" });
      }
      // Progress is now an EVIDENCE-GATED trigger — see goalProgressDelta below.
      if (confusionIncreased) {
        triggersToFire.push({
          trigger: "confusion_onset",
          severity: Math.max(param("journey.severity.signalFloor"), confusionDelta * param("journey.severity.signalGain")),
          description: parsed.frictionDescription || "UI became confusing",
        });
      } else if (confusionDecreased) {
        // NEW trigger: when Claude reports clarity, fire the existing
        // "clarity" trigger — previously this only happened implicitly
        // via decay.
        triggersToFire.push({
          trigger: "clarity",
          severity: param("journey.severity.clarity"),
          description: "UI became clear",
        });
      }
      if (frustrationIncreased && actionSuccess) {
        // Friction without outright failure
        triggersToFire.push({
          trigger: "setback",
          severity: Math.max(param("journey.severity.signalFloor"), frustrationDelta * param("journey.severity.signalGain")),
          description: "Encountered friction",
        });
      }
      // Time pressure fires when patience is already derived-low (recompute
      // briefly here using current state for the gating check).
      const patiencePreview = deriveSimplifiedState(state.emotionalState, traits).patienceRemaining;
      if (patiencePreview < param("journey.timePressure.patience") && !triggersToFire.length) {
        triggersToFire.push({
          trigger: "time_pressure",
          severity: param("journey.severity.timePressure"),
          description: "Running out of patience",
        });
      }
      if (actionSuccess && !triggersToFire.length) {
        triggersToFire.push({
          trigger: "success",
          severity: param("journey.severity.success"),
          description: parsed.action || "Action completed",
        });
      }

      // Apply each trigger sequentially against the canonical state.
      for (const t of triggersToFire) {
        const { state: newEmotional, event } = applyEmotionalTrigger(
          state.emotionalState,
          t.trigger,
          emotionalConfig,
          state.stepCount,
          { severity: t.severity, description: t.description },
        );
        state.emotionalState = newEmotional;
        state.emotionalJourney?.push(event);
      }

      // Decay toward baseline using PERSONA-TRAIT-MODULATED rates:
      //   comprehension speeds confusion recovery
      //   resilience    speeds frustration recovery
      //   curiosity     speeds boredom recovery
      // (Replaces the old uniform decayEmotions + the ad-hoc resilience-
      //  applied-to-frustrationLevel block.)
      state.emotionalState = decayEmotionsWithTraits(state.emotionalState, emotionalConfig, traits);
    }

    // ─── Evidence-gated goal progress ───
    //
    // Claude proposes a goalProgress value. We only ACCEPT it if there's
    // concrete evidence the action actually advanced things:
    //   - URL changed (we navigated somewhere new)
    //   - the action was an interactive one (click/fill/scroll/wait) that succeeded
    // For in-page progress (URL unchanged but a successful interaction), we
    // allow at most +0.05 per step — small partial credit.
    //
    // This stops Claude's positivity bias from inflating progress without
    // any real navigation occurring.
    const llmProposedProgress = parsed.goalProgress ?? state.goalProgress;
    const progressDeltaProposed = llmProposedProgress - state.goalProgress;
    let progressDeltaAllowed = 0;
    if (progressDeltaProposed > 0) {
      const interactiveActions = new Set(["click", "fill", "navigate", "scroll", "select"]);
      const wasInteractive = parsed.action ? Array.from(interactiveActions).some(a => parsed.action!.toLowerCase().startsWith(a)) : false;
      const actionSucceeded = parsed.actionSuccess !== false;
      // Note: urlChanged is finalized after executeAction below; we pre-allow
      // the LLM's delta if interactive+successful and reconcile post-action.
      if (wasInteractive && actionSucceeded) {
        // Allow up to the LLM's proposed delta; URL-change reconciliation later
        // expands the cap to full LLM proposal if URL changed.
        progressDeltaAllowed = Math.min(progressDeltaProposed, param("journey.progress.inPageCap"));
      }
      // No evidence at all → no progress (Claude was hallucinating advancement)
    } else {
      // Claude can lower progress freely — that's a backtrack signal.
      progressDeltaAllowed = progressDeltaProposed;
    }
    state.goalProgress = Math.max(0, Math.min(1, state.goalProgress + progressDeltaAllowed));
    // Stash the proposed progress so the post-action URL-change check can
    // expand the cap if a navigation actually happened.
    const _llmProposedProgressDelta = progressDeltaProposed;
    const _urlBeforeAction = urlBeforeAction;

    // ─── Sync derived simple-state fields from canonical EmotionalState ───
    if (state.emotionalState) {
      const derived = deriveSimplifiedState(state.emotionalState, traits);
      state.patienceRemaining = derived.patienceRemaining;
      state.confusionLevel = derived.confusionLevel;
      state.frustrationLevel = derived.frustrationLevel;

      // Verbose logging + abandonment heuristic remain useful — moved from
      // the old single big `if (state.emotionalState) { ... }` block that was
      // refactored above.
      if (options.verbose && state.emotionalState.dominant !== "neutral") {
        console.log(`💭 ${describeEmotionalState(state.emotionalState)}`);
      }
      const abandonmentCheck = shouldConsiderAbandonment(state.emotionalState);
      if (abandonmentCheck.shouldConsider && options.verbose) {
        console.log(`⚠️ Emotional abandonment signal: ${abandonmentCheck.reason}`);
      }
    }
    void _llmProposedProgressDelta;
    void _urlBeforeAction;

    // Dual-Process Theory: System 1/2 switching (v10.0.0)
    if (state.cognitiveMode) {
      const stepStartTime = Date.now();

      if (state.cognitiveMode.system === 1) {
        // In System 1 (fast mode) - check if should switch to System 2
        if (shouldSwitchToSystem2(state.confusionLevel, state.cognitiveMode)) {
          state.cognitiveMode.system = 2;
          if (options.verbose) {
            console.log(`🧠 Switching to System 2 (deliberate thinking) - confusion: ${(state.confusionLevel * 100).toFixed(0)}%`);
          }
        }
        state.cognitiveMode.timeInSystem1 += Date.now() - stepStartTime;
      } else {
        // In System 2 (slow mode) - check if can return to System 1
        const recentSuccess = state.memory.actionsAttempted.length > 0 &&
          state.memory.actionsAttempted[state.memory.actionsAttempted.length - 1]?.success;
        if (canReturnToSystem1(state.confusionLevel, recentSuccess)) {
          state.cognitiveMode.system = 1;
          state.cognitiveMode.system1Errors = 0; // Reset error count
          if (options.verbose) {
            console.log(`🧠 Returning to System 1 (intuitive thinking) - task familiar`);
          }
        }
        state.cognitiveMode.timeInSystem2 += Date.now() - stepStartTime;
      }
    }

    // F-Pattern Degradation under cognitive load (v10.1.0)
    // High cognitive load (confusion + frustration) causes tunnel vision
    if (state.scanPattern) {
      const cognitiveLoad = (state.confusionLevel + state.frustrationLevel) / 2;
      const prevWidth = state.scanPattern.widthMultiplier;
      state.scanPattern.widthMultiplier = calculateScanWidthMultiplier(cognitiveLoad);
      state.scanPattern.effectiveWidth = state.scanPattern.widthMultiplier * param("journey.percentScale");

      // Log if pattern narrowed significantly
      if (options.verbose && prevWidth !== state.scanPattern.widthMultiplier) {
        if (state.scanPattern.widthMultiplier < param("journey.log.tunnelWidth")) {
          console.log(`👁️ Tunnel vision: scanning only left ${state.scanPattern.effectiveWidth.toFixed(0)}% of viewport`);
        } else if (prevWidth < state.scanPattern.widthMultiplier) {
          console.log(`👁️ Vision widening: now scanning ${state.scanPattern.effectiveWidth.toFixed(0)}% of viewport`);
        }
      }
    }

    // Stress-Induced Peripheral Vision (v10.1.0) - Yerkes-Dodson Law
    if (state.peripheralVision) {
      const prevArousal = state.peripheralVision.arousalLevel;
      state.peripheralVision = calculatePeripheralVision(
        state.frustrationLevel,
        state.confusionLevel
      );

      // Log significant arousal changes
      if (options.verbose && Math.abs(state.peripheralVision.arousalLevel - prevArousal) > param("journey.log.arousalChange")) {
        if (state.peripheralVision.widthFactor < param("journey.log.peripheralWidth")) {
          console.log(`😰 Stress tunnel vision: peripheral field reduced to ${(state.peripheralVision.widthFactor * 100).toFixed(0)}%`);
        }
      }
    }

    // Record monologue
    if (parsed.monologue) {
      fullMonologue.push(parsed.monologue);
    }

    // v18.29.0: Record step in journey log
    journeyLog.push({
      step,
      url: currentUrl,
      pageTitle: pageTitle,
      phase: parsed.phase || "evaluate",
      action: parsed.action || null,
      actionTarget: parsed.actionTarget || null,
      focusedElement: parsed.focusedElement || null,
      monologue: parsed.monologue || "",
      mood: parsed.mood || state.currentMood || "neutral",
      goalProgress: parsed.goalProgress || 0,
      patience: state.patienceRemaining,
      confusion: state.confusionLevel,
      frustration: state.frustrationLevel,
      timestamp: Date.now(),
      screenshotPath,
      attentionHeatmapBase64,
      scrollY: viewportCtx.scroll.y,
      viewport: { width: viewportCtx.viewport.width, height: viewportCtx.viewport.height },
    });

    // Record friction point if confusion/frustration spiked
    const frictionLevel = param("journey.friction.level");
    if (parsed.frictionDescription && (state.confusionLevel > frictionLevel || state.frustrationLevel > frictionLevel)) {
      frictionPoints.push({
        step,
        url: currentUrl,
        element: parsed.frictionElement,
        type: "confusing_ui",
        frustrationIncrease: parsed.newFrustration ? parsed.newFrustration - state.frustrationLevel : param("journey.friction.defaultIncrease"),
        monologue: parsed.monologue || "",
      });
    }

    // Callback — emits BEFORE the action so the live viewer renders the
    // attention overlay first, then the persona acts. The dashboard receives
    // the heatmap base64 via SSE during this window.
    if (options.onStep) {
      options.onStep({
        step,
        phase: parsed.phase || "evaluate",
        monologue: parsed.monologue || "",
        action: parsed.action,
        state: { ...state },
        screenshotPath,
        attentionHeatmapBase64,
        scrollY: viewportCtx.scroll.y,
        viewport: { width: viewportCtx.viewport.width, height: viewportCtx.viewport.height },
        url: currentUrl,
      });
    }

    // Live viewer dwell — when a fresh attention map was computed this step,
    // hold briefly before executing the action so the viewer can register the
    // heatmap. 1.2s is enough to glance at it without making the journey feel
    // sluggish. Skipped on non-capture steps so the journey paces normally.
    if (options.enableMouseOverlay && attentionHeatmapBase64) {
      await new Promise((r) => setTimeout(r, param("journey.live.dwellMs")));
    }

    // Verbose output
    if (options.verbose) {
      console.log(`\n━━━ Step ${step} ━━━`);
      console.log(`Mood: ${state.currentMood}`);
      console.log(
        `Patience: ${(state.patienceRemaining * 100).toFixed(0)}% | Confusion: ${(state.confusionLevel * 100).toFixed(0)}% | Frustration: ${(state.frustrationLevel * 100).toFixed(0)}%`
      );
      if (parsed.monologue) console.log(`💭 "${parsed.monologue}"`);
      if (parsed.action) console.log(`🎯 Action: ${parsed.action}`);
    }

    // Check for goal completion
    if (parsed.goalAchieved) {
      goalAchieved = true;
      goalEvidence = parsed.goalEvidence || parsed.monologue || undefined;

      // v18.29.0: Validate goal evidence against actual page content
      if (goalEvidence) {
        try {
          const pageText = await page.evaluate((n) => document.body.innerText?.substring(0, n) || '', param("journey.evidence.pageChars"));
          const minWordChars = param("journey.evidence.minWordChars");
          const evidenceWords = goalEvidence.toLowerCase().split(/\s+/).filter((w: string) => w.length > minWordChars);
          const matchCount = evidenceWords.filter((w: string) => pageText.toLowerCase().includes(w)).length;
          const matchRatio = evidenceWords.length > 0 ? matchCount / evidenceWords.length : 0;
          if (matchRatio < param("journey.evidence.verifiedShare")) {
            // Evidence doesn't match page content — flag as unverified
            goalEvidence = `[UNVERIFIED - ${Math.round(matchRatio * 100)}% match] ${goalEvidence}`;
          } else {
            goalEvidence = `[VERIFIED - ${Math.round(matchRatio * 100)}% match] ${goalEvidence}`;
          }
        } catch {}
      }
      break;
    }

    // Check abandonment triggers
    const abandonment = checkAbandonmentTriggers(state, thresholds);
    if (abandonment) {
      abandonmentReason = abandonment.reason;
      abandonmentMessage = abandonment.message;
      fullMonologue.push(abandonment.message);

      // v18.29.0: Capture failure context
      try {
        const pageText = await page.evaluate((n) => document.body.innerText?.substring(0, n) || '', param("journey.failure.pageChars"));
        failureReason = parsed.failureReason || `Abandoned on "${pageTitle}" (${currentUrl}). Last visible: ${pageText.substring(0, param("journey.quoteChars"))}...`;
      } catch {
        failureReason = parsed.failureReason || `Abandoned on "${pageTitle}" (${currentUrl})`;
      }
      break;
    }

    // Execute action if provided
    if (parsed.action) {
      // Surface the action on-screen so anyone watching the live recording / VNC
      // can see what's about to happen. Best-effort — never block the action.
      if (options.enableMouseOverlay) {
        // Make sure overlay is present on the current page (a previous action
        // may have navigated and the init script raced our page.evaluate).
        await installMouseOverlay();
        try {
          const p = await browser.getPage();
          const label = parsed.actionTarget ? `${parsed.action}  →  ${parsed.actionTarget}` : parsed.action;
          await p.evaluate((t) => {
            // @ts-expect-error window helper installed by overlay script
            if (window.__cbShowAction) window.__cbShowAction(t);
          }, label.slice(0, param("journey.live.bannerChars")));
        } catch { /* page navigated mid-call, helper will reinstall */ }
      }
      try {
        // Coord-based click resolution. Both `click:#N` (explicit index) and
        // `click:Text` (text match) paths converge here — we look up the
        // element in availableElements (which already has bboxes) and use
        // page.mouse.click() at its center. This avoids Playwright locator
        // auto-scroll-into-view that bounces between same-text candidates and
        // stacks with page-level smooth-scroll-on-click handlers.
        type Bbox = PageElement & { x?: number; y?: number; width?: number; height?: number };
        const indexMatch = /^click:#(\d+)$/.exec(parsed.action);
        const textMatch = /^click:(.+)$/.exec(parsed.action);
        let target: Bbox | undefined;
        if (indexMatch) {
          target = availableElements[parseInt(indexMatch[1], 10)] as Bbox;
        } else if (textMatch && !textMatch[1].startsWith("#")) {
          // Find best element match by text. Prefer (1) exact match, then
          // (2) starts-with, then (3) includes; among ties, pick the one
          // closest to the current viewport center.
          const wanted = textMatch[1].trim().toLowerCase();
          const vc = viewportCtx.viewport.height / 2;
          const candidates = (availableElements as Bbox[]).filter(e => e.text);
          const score = (e: Bbox): number => {
            const t = (e.text || "").toLowerCase().trim();
            if (!t) return -Infinity;
            let base = 0;
            if (t === wanted) base = param("journey.clickMatch.exact");
            else if (t.startsWith(wanted) || wanted.startsWith(t)) base = param("journey.clickMatch.prefix");
            else if (t.includes(wanted) || wanted.includes(t)) base = param("journey.clickMatch.contains");
            else return -Infinity;
            // Penalize distance from viewport center (closer = preferred)
            const ey = (e.y ?? 0) + (e.height ?? 0) / 2;
            const dist = Math.abs(ey - vc);
            return base - Math.min(dist, param("journey.clickMatch.maxDistancePx"));
          };
          let best: Bbox | undefined;
          let bestScore = -Infinity;
          for (const e of candidates) {
            const s = score(e);
            if (s > bestScore) { bestScore = s; best = e; }
          }
          if (best && bestScore > 0) target = best;
        }
        let result: ActionResult;
        const hasBbox = target && typeof target.x === "number" && typeof target.y === "number"
          && typeof target.width === "number" && typeof target.height === "number";
        if (hasBbox && target) {
          const page = await browser.getPage();
          const urlBefore = page.url();
          const cx = target.x! + target.width! / 2;
          const cy = target.y! + target.height! / 2;
          try {
            // Only scroll if the element is OFF-screen. Scrolling an already-
            // visible element causes pointless jitter that stacks with any
            // page-level smooth-scroll handler firing on click.
            const inView = cy >= 0 && cy <= viewportCtx.viewport.height;
            if (!inView) {
              await page.evaluate(({ y }: { y: number }) => {
                const docTop = window.scrollY + y;
                const t = Math.max(0, docTop - window.innerHeight / 2);
                // "instant" behavior — no animation, no stacking with page handlers
                window.scrollTo({ top: t, behavior: "instant" as ScrollBehavior });
              }, { y: cy });
              await page.waitForTimeout(param("journey.click.scrollSettleMs"));
            }
            // Re-read post-scroll coords; click at center via raw mouse so
            // Playwright's locator auto-scroll-into-view never engages.
            const fresh = await page.evaluate(({ sel }: { sel: string }) => {
              const el = document.querySelector(sel);
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
            }, { sel: target.selector });
            const ctr = (fresh && fresh.x > 0 && fresh.y > 0)
              ? { x: fresh.x, y: fresh.y, w: fresh.w, h: fresh.h }
              : { x: cx, y: cy, w: target.width!, h: target.height! };
            if (options.humanInput) {
              const { humanClick } = await import("../visual/human-input.js");
              await humanClick(page, ctr.x, ctr.y, inputTraits, { width: ctr.w, height: ctr.h });
            } else {
              await page.mouse.click(ctr.x, ctr.y);
            }
            await page.waitForTimeout(param("journey.action.navigationWaitMs"));
            const urlAfter = page.url();
            result = { success: true, ...(urlAfter !== urlBefore ? { newUrl: urlAfter } : {}) };
          } catch (clickErr) {
            console.warn(`[cognitive] coordinate click failed: ${(clickErr as Error).message}`);
            const fallback = target.text ? `click:${target.text}` : parsed.action;
            result = await executeAction(browser, fallback, fittsParams, state.gazeMouseLag, options.humanInput, inputTraits);
          }
        } else {
          // No bbox — let executeAction handle (non-click actions, or click
          // text not found in availableElements).
          result = await executeAction(browser, parsed.action, fittsParams, state.gazeMouseLag, options.humanInput, inputTraits);
        }

        // Inter-action settle pause — humans don't fire actions back-to-back
        // at machine speed. Modulated by patience + readingTendency so an
        // impatient persona snaps through faster than a thorough one.
        if (options.humanInput) {
          const { humanSettle } = await import("../visual/human-input.js");
          await humanSettle(inputTraits);
        }

        state.memory.actionsAttempted.push({
          action: parsed.action,
          target: parsed.actionTarget,
          success: result.success,
        });

        // Track page visits if URL changed
        const urlChanged = !!result.newUrl && result.newUrl !== _urlBeforeAction;

        // Record the outcome for the next step's prompt. The diff fields
        // (newClickables, removedClickables, scrollDelta) are filled in at
        // the top of step N+1 by comparing the fresh perception to the cache.
        lastActionOutcome = {
          action: parsed.action,
          target: parsed.actionTarget,
          success: result.success,
          urlChanged,
          fromUrl: _urlBeforeAction,
          toUrl: result.newUrl ?? _urlBeforeAction,
        };
        if (result.newUrl && !state.memory.pagesVisited.includes(result.newUrl)) {
          state.memory.pagesVisited.push(result.newUrl);
          currentUrl = result.newUrl;
        }

        // ─── Post-action evidence reconciliation ───
        // Goal progress cap was previously +0.05 max (no-evidence fallback).
        // If the URL actually changed, expand the cap to the LLM's full
        // proposed delta — that's strong navigation evidence.
        const inPageCap = param("journey.progress.inPageCap");
        if (urlChanged && _llmProposedProgressDelta > inPageCap) {
          const additionalAllowed = _llmProposedProgressDelta - inPageCap;
          state.goalProgress = Math.min(1, state.goalProgress + additionalAllowed);
        }

        // Action result feeds back into the canonical EmotionalState via triggers.
        // Replaces the prior direct writes to state.frustrationLevel / patienceRemaining,
        // which were overwritten next step by deriveSimplifiedState anyway.
        if (state.emotionalState) {
          if (result.success) {
            const progressMade = urlChanged || state.goalProgress > param("journey.progress.madeLevel");
            // Progress = stronger positive trigger than plain success
            const { state: newEmotional, event } = applyEmotionalTrigger(
              state.emotionalState,
              progressMade ? "progress" : "success",
              emotionalConfig,
              state.stepCount,
              {
                severity: progressMade ? param("journey.severity.progress") : param("journey.severity.success"),
                description: progressMade
                  ? `Action advanced goal (${urlChanged ? "URL change" : "in-page progress"})`
                  : `Action completed: ${parsed.action}`,
              },
            );
            state.emotionalState = newEmotional;
            state.emotionalJourney?.push(event);
          }
        }
      } catch (error) {
        state.memory.errorsEncountered.push({
          error: error instanceof Error ? error.message : String(error),
          context: `Step ${step}: ${parsed.action}`,
        });
        lastActionOutcome = {
          action: parsed.action,
          target: parsed.actionTarget,
          success: false,
          urlChanged: false,
          fromUrl: _urlBeforeAction,
        };
        // Action threw — fire an error trigger on canonical state.
        if (state.emotionalState) {
          const { state: newEmotional, event } = applyEmotionalTrigger(
            state.emotionalState,
            "error",
            emotionalConfig,
            state.stepCount,
            {
              severity: param("journey.severity.actionThrew"),
              description: error instanceof Error ? error.message : String(error),
            },
          );
          state.emotionalState = newEmotional;
          state.emotionalJourney?.push(event);
        }
      }

      // Re-sync derived simple-state fields from canonical state after
      // post-action triggers have applied. Consumers that read
      // state.patienceRemaining / confusionLevel / frustrationLevel see the
      // up-to-date derived values.
      if (state.emotionalState) {
        const derived = deriveSimplifiedState(state.emotionalState, traits);
        state.patienceRemaining = derived.patienceRemaining;
        state.confusionLevel = derived.confusionLevel;
        state.frustrationLevel = derived.frustrationLevel;
      }

      // Update decision fatigue (v9.9.0)
      // Every action is a decision - fatigue accumulates
      if (state.decisionFatigue) {
        state.decisionFatigue.decisionsMade++;
        // Estimate decision complexity: clicks on links = easy (2 options),
        // form fills = medium (5), navigation choices = hard (8+)
        const estimatedOptions = parsed.action.toLowerCase().includes("fill")
          ? param("journey.fatigue.options.fill")
          : parsed.action.toLowerCase().includes("navigate") || parsed.action.toLowerCase().includes("search")
            ? param("journey.fatigue.options.navigate")
            : param("journey.fatigue.options.other");
        const fatigueIncrement = calculateFatigueIncrement(estimatedOptions);
        state.decisionFatigue.fatigueLevel = Math.min(1, state.decisionFatigue.fatigueLevel + fatigueIncrement);
        state.decisionFatigue.lastDecisionComplexity = estimatedOptions;

        // High fatigue triggers default-seeking behavior
        if (state.decisionFatigue.fatigueLevel > param("journey.fatigue.defaultsLevel")) {
          state.decisionFatigue.choosingDefaults = true;
        }

        if (options.verbose) {
          console.log(
            `🧠 Decision Fatigue: ${(state.decisionFatigue.fatigueLevel * 100).toFixed(0)}% (${state.decisionFatigue.decisionsMade} decisions)`
          );
        }
      }
    }

    // Small delay between steps
    await sleep(param("journey.stepPauseMs"));
  }

  // Post-journey goal validation — final evaluation of the current page
  if (!goalAchieved) {
    try {
      const page = await browser.getPage();
      const finalPageText = await page.evaluate((n) => document.body.innerText?.substring(0, n) || '', param("journey.finalEval.pageChars"));
      const finalUrl = page.url();

      // Ask Claude: did we actually achieve the goal? Through the decision
      // provider, recorded as the trace's final step, so a replay answers
      // from the trace. (Before 20.0 this always called the live API, so a
      // "free" replay still needed a key and could reach a different verdict.)
      const finalEvalPrompt = `The user's goal was: "${options.goal}"

They ended on this page: ${finalUrl}

Page content (first 3000 chars):
${finalPageText}

Their last thought was: "${fullMonologue[fullMonologue.length - 1] || ''}"
Goal progress was: ${Math.round(state.goalProgress * 100)}%

Question: Did they ACTUALLY find the specific information or page that fully satisfies their goal?
Be strict: "still searching", "looking for", "no results", or being on a search page does NOT count as achieved.
The goal is only achieved if the page CURRENTLY SHOWS the specific content they were looking for.

Answer with JSON:
{"achieved": true/false, "evidence": "exact quote from the page that proves the goal was met, or null if not met"}`;
      const finalHash = hashPageState(finalUrl, finalPageText);
      const evalText = await decisionProvider.decide({
        stepIndex: FINAL_EVAL_STEP,
        pageStateHash: finalHash,
        persona: personaObj.name,
        systemPrompt: "",
        messages: [{ role: "user", content: finalEvalPrompt }],
      });
      if (traceWriter) {
        traceWriter.record({
          step: FINAL_EVAL_STEP,
          pageStateHash: finalHash,
          persona: personaObj.name,
          decision: evalText,
          ts: new Date().toISOString(),
        });
      }
      try {
        const evalJson = JSON.parse(evalText.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
        if (evalJson.achieved) {
          goalAchieved = true;
          goalEvidence = `[FINAL EVAL] ${evalJson.evidence || finalPageText.substring(0, param("journey.quoteChars"))}`;
          abandonmentReason = undefined;
          abandonmentMessage = undefined;
        }
      } catch {}
    } catch {}
  }

  // Fallback: only if goalProgress is very high (90%+) AND final monologue explicitly says "found"
  if (!goalAchieved && state.goalProgress >= param("journey.fallback.progress")) {
    const lastMonologue = (fullMonologue[fullMonologue.length - 1] || '').toLowerCase();
    const strongSignals = ['found it', 'found exactly', 'this is exactly', 'goal achieved', 'here it is', 'perfect, this is'];
    const hasStrongSignal = strongSignals.some(s => lastMonologue.includes(s));
    if (hasStrongSignal) {
      goalAchieved = true;
      goalEvidence = `[AUTO-DETECTED: goalProgress=${Math.round(state.goalProgress * 100)}%] ${fullMonologue[fullMonologue.length - 1]?.substring(0, param("journey.quoteChars")) || ''}`;
      abandonmentReason = undefined;
      abandonmentMessage = undefined;
    }
  }

  // Stop the capture before the browser closes — the page has to still exist.
  const captureResult = await finishAutoCapture(
    captureSession,
    resolveCaptureOptions(options.capture)?.stopTimeoutMs,
  );

  // Close browser
  await browser.close();

  // Calculate summary stats
  const avgConfusion = frictionPoints.length > 0
    ? frictionPoints.reduce((sum, _fp) => sum + (state.confusionLevel), 0) / frictionPoints.length
    : state.confusionLevel;

  // Build result
  return {
    persona: personaObj.name,
    goal: options.goal,
    goalAchieved,
    ...(captureResult ? { capture: captureResult } : {}),
    // Where --trace wrote its file; nothing reported it before 20.0, so a
    // trace could only be found by listing the traces directory.
    ...(traceWriter ? { tracePath: traceWriter.filePath } : {}),
    abandonmentReason,
    abandonmentMessage,
    totalTime: (Date.now() - startTime) / param("journey.msPerSecond"),
    stepCount: state.stepCount,
    frictionPoints,
    fullMonologue,
    finalState: state,
    summary: {
      avgConfusionLevel: avgConfusion,
      maxFrustrationLevel: state.frustrationLevel,
      backtrackCount: state.memory.backtrackCount,
      timeInConfusion: frictionPoints.length * param("journey.summary.secondsPerFriction"), // Estimate
      // Decision fatigue metrics (v9.9.0)
      decisionsMade: state.decisionFatigue?.decisionsMade ?? 0,
      finalDecisionFatigue: state.decisionFatigue?.fatigueLevel ?? 0,
      wasChoosingDefaults: state.decisionFatigue?.choosingDefaults ?? false,
      // Emotional metrics (v13.1.0)
      emotionalValenceTrend: state.emotionalState?.valence ?? 0,
      dominantEmotion: state.emotionalState?.dominant ?? "neutral",
      emotionalEventCount: state.emotionalJourney?.length ?? 0,
    },
    // Emotional journey data (v13.1.0)
    emotionalJourney: state.emotionalJourney,
    finalEmotionalState: state.emotionalState,
    // v18.29.0: Journey validation — evidence, path, failure forensics
    journeyLog,
    goalEvidence,
    failureReason,
    navigationPath: journeyLog.map(s => s.url).filter((url, i, arr) => i === 0 || url !== arr[i - 1]),
    lastPage: {
      url: currentUrl,
      title: journeyLog.length > 0 ? journeyLog[journeyLog.length - 1].pageTitle : '',
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function buildCognitiveSystemPrompt(
  persona: Persona,
  profile: CognitiveProfile,
  goal: string,
  thresholds: AbandonmentThresholds
): string {
  const traits = profile.traits;
  const lowP = param("journey.band.low.patience"), highP = param("journey.band.high.patience");
  const lowR = param("journey.band.low.riskTolerance"), highR = param("journey.band.high.riskTolerance");
  const lowC = param("journey.band.low.comprehension"), highC = param("journey.band.high.comprehension");
  const lowT = param("journey.band.low.readingTendency"), highT = param("journey.band.high.readingTendency");

  return `You are simulating a "${persona.name}" user navigating a website.

PERSONA DESCRIPTION: ${persona.description}

COGNITIVE TRAITS:
- Patience: ${traits.patience.toFixed(2)} ${traits.patience < lowP ? "(impatient)" : traits.patience > highP ? "(patient)" : "(moderate)"}
- Risk Tolerance: ${traits.riskTolerance.toFixed(2)} ${traits.riskTolerance < lowR ? "(cautious)" : traits.riskTolerance > highR ? "(bold)" : "(moderate)"}
- Comprehension: ${traits.comprehension.toFixed(2)} ${traits.comprehension < lowC ? "(struggles with UI)" : traits.comprehension > highC ? "(expert)" : "(moderate)"}
- Persistence: ${traits.persistence.toFixed(2)}
- Curiosity: ${traits.curiosity.toFixed(2)}
- Reading Tendency: ${traits.readingTendency.toFixed(2)} ${traits.readingTendency < lowT ? "(scans only)" : traits.readingTendency > highT ? "(reads everything)" : "(selective reader)"}

ATTENTION PATTERN: ${profile.attentionPattern}
DECISION STYLE: ${profile.decisionStyle}

GOAL: "${goal}"

RESPONSE FORMAT (JSON):
{
  "phase": "perceive|comprehend|decide|execute|evaluate",
  "monologue": "Internal thought as this persona (first person)",
  "action": "click:selector|hover:selector|fill:selector:value|navigate:url|scroll:direction|null",
  "actionTarget": "description of what you're clicking/filling",
  "focusedElement": "the element text/label you are currently looking at or reading",
  "goalAchieved": boolean,
  "goalProgress": 0.0-1.0,
  "goalEvidence": "REQUIRED when goalAchieved=true: exact text/content on the page that satisfies the goal. Quote the specific words you found. If goalAchieved=false, null.",
  "failureReason": "When giving up: what you were looking for but could not find, and what you see instead",
  "newConfusion": 0.0-1.0,
  "newFrustration": 0.0-1.0,
  "mood": "neutral|hopeful|confused|frustrated|defeated|relieved",
  "frictionDescription": "what caused confusion/frustration (if any)" | null,
  "frictionElement": "element that caused friction" | null
}

GOAL EVIDENCE RULES:
- When setting goalAchieved=true, you MUST provide goalEvidence with the EXACT text you found on the page
- goalEvidence should be a direct quote from the page content, not a summary
- If you cannot quote specific text proving the goal is met, set goalAchieved=false
- Example: goal "find application deadline" → goalEvidence: "Application deadline: March 1, 2026 for fall semester"

ACTIONS:
- click:selector - Click an element (auto-hovers parent menus for dropdowns)
- hover:selector - Hover over element to reveal dropdown menus
- fill:selector:value - Type text into an input field OR select an option from a dropdown
  IMPORTANT: For <select> dropdowns, use fill with the option text (e.g., fill:Gender:Female)
  Do NOT click on select dropdowns - use fill directly with the desired option value
- navigate:url - Go to a URL directly
- scroll:direction - Scroll the page (direction: down, up, bottom, top)

ABANDONMENT THRESHOLDS:
- If patience drops below ${thresholds.patienceMin}, give up
- If confusion exceeds ${thresholds.confusionMax}, give up
- If frustration exceeds ${thresholds.frustrationMax}, give up

BEHAVIOR GUIDELINES:
1. PERCEIVE: Describe what you see on the page
2. COMPREHEND: Interpret UI based on your comprehension level (low = more confusion)
3. DECIDE: Choose action based on risk tolerance and goal relevance
4. For click actions, use text that matches elements from AVAILABLE ELEMENTS (partial match OK, e.g., "Admissions" or "Apply" - the system does fuzzy matching)
5. Prefer clicking elements you can SEE in the AVAILABLE ELEMENTS list - avoid guessing element names
6. For dropdown menus: if a click doesn't work, try hover:menuname first to reveal the submenu
7. If comprehension is low, misinterpret ambiguous elements
8. If patience is low, get frustrated quickly with delays
9. Generate authentic inner monologue matching persona voice

Always respond with valid JSON.`;
}

interface PageElement {
  tag: string;
  text: string;
  selector: string;
  role?: string;
}

interface AvailableInput {
  selector: string;
  type: string;
  name: string;
  placeholder: string;
  label: string;
  isHidden?: boolean;
  triggerText?: string;
  options?: string[]; // Available options for select elements
}

interface ViewportContext {
  viewport: { width: number; height: number };
  scroll: { y: number; max: number; pct: number; atTop: boolean; atBottom: boolean };
  headings: Array<{ level: number; text: string; visible: boolean }>;
  activeModals: number;
  formErrors: string[];
  bannersBlocking: string[];
}

interface LastActionOutcome {
  action: string;
  target?: string;
  success: boolean;
  urlChanged: boolean;
  fromUrl?: string;
  toUrl?: string;
  scrollDelta?: number;
  newClickables?: string[];
  removedClickables?: string[];
}

function buildStepPrompt(
  state: CognitiveState,
  currentUrl: string,
  pageTitle: string,
  step: number,
  availableElements: PageElement[] = [],
  availableInputs: AvailableInput[] = [],
  pageContent: string = "",
  viewportCtx?: ViewportContext,
  lastOutcome?: LastActionOutcome | null,
): string {
  // Group clickables by region so the AI can disambiguate "Pricing" in nav vs hero vs footer.
  // Index each element so the AI can use [#3] style references when text isn't unique.
  const elementsStr = availableElements.length > 0
    ? (() => {
        const groups: Record<string, string[]> = {};
        availableElements.forEach((e, i) => {
          const region = (e as PageElement & { region?: string }).region ?? 'unknown';
          const aboveFold = (e as PageElement & { aboveFold?: boolean }).aboveFold;
          const x = (e as PageElement & { x?: number }).x;
          const y = (e as PageElement & { y?: number }).y;
          const visMark = aboveFold ? '👁' : '↓';
          const posStr = (typeof x === 'number' && typeof y === 'number') ? ` @(${x},${y})` : '';
          const line = `  [#${i}] ${visMark} "${e.text}" (${e.tag}${e.role ? `, role=${e.role}` : ''}${posStr})`;
          (groups[region] ??= []).push(line);
        });
        const order = ['header-nav', 'top-bar', 'modal', 'main-visible', 'form', 'sidebar', 'below-fold', 'footer', 'unknown'];
        const out: string[] = [];
        for (const r of order) {
          if (groups[r]?.length) {
            out.push(`  — ${r.toUpperCase()} —`);
            out.push(...groups[r]);
          }
        }
        return out.join('\n');
      })()
    : "  (no clickable elements detected)";

  // Format inputs - highlight hidden ones with their triggers, show options for selects
  const inputsStr = availableInputs.length > 0
    ? availableInputs.map(i => {
        const desc = i.label || i.placeholder || i.name || i.type;
        if (i.isHidden && i.triggerText) {
          return `  - "${desc}" (${i.type}, custom dropdown - click "${i.triggerText}" to open)`;
        } else if (i.isHidden) {
          return `  - "${desc}" (${i.type}, hidden/custom UI)`;
        } else if (i.type === 'select' && i.options && i.options.length > 0) {
          // Show available options for select dropdowns
          return `  - "${desc}" (select dropdown) → use fill:${desc}:OptionValue\n      Options: ${i.options.join(", ")}`;
        }
        return `  - "${desc}" (${i.type})`;
      }).join("\n")
    : "  (no form inputs detected)";

  const contentStr = pageContent
    ? `\nVISIBLE PAGE CONTENT:\n${pageContent}\n`
    : "";

  // Viewport / scroll / overlay summary — gives the AI ground truth about what
  // is on screen NOW. Without this it has no idea if it just scrolled.
  let viewportStr = "";
  if (viewportCtx) {
    const { viewport, scroll, headings, activeModals, formErrors, bannersBlocking } = viewportCtx;
    const visHeadings = headings.filter(h => h.visible).slice(0, param("journey.prompt.headings")).map(h => `H${h.level}: ${h.text}`).join(' | ');
    const lines = [
      `- Viewport: ${viewport.width}×${viewport.height}`,
      `- Scroll: ${scroll.y}/${scroll.max}px (${Math.round(scroll.pct * 100)}%)${scroll.atTop ? ' [at top]' : ''}${scroll.atBottom ? ' [at bottom]' : ''}`,
    ];
    if (visHeadings) lines.push(`- Currently visible headings: ${visHeadings}`);
    if (activeModals > 0) lines.push(`- ⚠️ ${activeModals} active modal/dialog blocking interaction — try dismiss first`);
    if (bannersBlocking.length > 0) lines.push(`- ⚠️ Banner blocking content: "${bannersBlocking[0]}" — try dismiss`);
    if (formErrors.length > 0) lines.push(`- ⚠️ Form errors visible: ${formErrors.join(' | ')}`);
    viewportStr = `\nVIEWPORT STATE:\n${lines.join('\n')}\n`;
  }

  // Action outcome — what actually happened from your last decision. Critical
  // for grounding the AI's monologue in reality.
  let outcomeStr = "";
  if (lastOutcome) {
    const lines: string[] = [];
    const target = lastOutcome.target ? ` → ${lastOutcome.target}` : '';
    lines.push(`- Last action: ${lastOutcome.action}${target} — ${lastOutcome.success ? '✓ executed' : '✗ failed'}`);
    if (lastOutcome.urlChanged) {
      lines.push(`- Page navigated: ${lastOutcome.fromUrl} → ${lastOutcome.toUrl}`);
    } else if (lastOutcome.action.startsWith('click')) {
      lines.push(`- Page did NOT navigate (click had no nav effect — element may be JS-only or wasn't matched)`);
    }
    if (typeof lastOutcome.scrollDelta === 'number' && Math.abs(lastOutcome.scrollDelta) > param("journey.prompt.scrollReportPx")) {
      const dir = lastOutcome.scrollDelta > 0 ? 'down' : 'up';
      lines.push(`- Scrolled ${dir} ${Math.abs(lastOutcome.scrollDelta)}px`);
    }
    if (lastOutcome.newClickables?.length) {
      lines.push(`- New elements appeared: ${lastOutcome.newClickables.slice(0, param("journey.prompt.changedElementsShown")).map(t => `"${t}"`).join(', ')}`);
    }
    if (lastOutcome.removedClickables?.length) {
      lines.push(`- Elements no longer visible: ${lastOutcome.removedClickables.slice(0, param("journey.prompt.changedElementsShown")).map(t => `"${t}"`).join(', ')}`);
    }
    outcomeStr = `\nWHAT HAPPENED LAST STEP:\n${lines.join('\n')}\n`;
  }

  return `STEP ${step}

CURRENT PAGE:
- URL: ${currentUrl}
- Title: ${pageTitle}
${viewportStr}${outcomeStr}${contentStr}
AVAILABLE ELEMENTS (clickable, grouped by region; 👁=above-fold, ↓=below-fold):
${elementsStr}

FORM INPUTS (fillable):
${inputsStr}

CURRENT STATE:
- Patience: ${(state.patienceRemaining * 100).toFixed(0)}%
- Confusion: ${(state.confusionLevel * 100).toFixed(0)}%
- Frustration: ${(state.frustrationLevel * 100).toFixed(0)}%
- Goal Progress: ${(state.goalProgress * 100).toFixed(0)}%
- Mood: ${state.currentMood}
- Pages Visited: ${state.memory.pagesVisited.length}
- Actions Attempted: ${state.memory.actionsAttempted.length}
${(() => {
  // Loop detection: if the last 4 actions are alternating scrolls, surface
  // it loudly so the AI breaks out instead of pumping scroll:down/up forever.
  const scrollLoop = param("journey.prompt.scrollLoop");
  const recent = state.memory.actionsAttempted.slice(-scrollLoop).map(a => a.action || "");
  if (recent.length >= scrollLoop && recent.every(a => a.startsWith("scroll:"))) {
    return `\n⚠️ LOOP DETECTED: your last ${scrollLoop} actions were all scrolls (${recent.join(", ")}). Pick a click/back/dismiss/find action instead — scrolling more will not help.`;
  }
  // Repeated failed actions
  const failedRun = param("journey.prompt.failedRun");
  const lastTwo = state.memory.actionsAttempted.slice(-failedRun);
  if (lastTwo.length === failedRun && lastTwo.every(a => a.success === false)) {
    return `\n⚠️ Last ${failedRun} actions failed (${lastTwo.map(a => a.action).join(", ")}). The element you wanted may not exist with that exact text — try a click:#N index from AVAILABLE ELEMENTS above, or a different element entirely.`;
  }
  return "";
})()}

Ground your monologue in WHAT HAPPENED LAST STEP and VIEWPORT STATE — don't pretend you see things that aren't in AVAILABLE ELEMENTS or VISIBLE PAGE CONTENT. If the URL did not change after a click, say so explicitly.

ACTIONS (choose one):
- click:ElementText — click a link or button (use exact text from AVAILABLE ELEMENTS; for ambiguous text use click:#N where N is the [#N] index)
- fill:FieldName:value — type into a form field
- scroll:down — scroll down to see more content (TRY THIS FIRST if goal not visible)
- scroll:up — scroll back up
- back — go back to the previous page (like hitting the browser back button)
- find:searchterm — find text on the current page (like Ctrl+F)
- navigate:URL — go directly to a URL
- tab:count — press Tab key to move focus (keyboard navigation)
- enter — press Enter to submit or activate focused element
- select:FieldName:OptionText — choose from a dropdown menu
- expand:SectionTitle — click an accordion, tab, or collapsible section to reveal content
- dismiss — close a popup, cookie banner, or overlay blocking the page
- hover:ElementText — hover over an element (to reveal dropdown menus)
- wait:ms — wait for content to load

STRATEGY:
1. If a modal/banner is blocking, dismiss FIRST
2. If you don't see what you need, scroll:down — most content is below the fold
3. If a click didn't navigate when you expected it to, the element may have a different selector — try click:#N with the index, or pick a different element
4. If scrolling doesn't help, try find:keyword to search the page
5. Use back if you navigated to the wrong page
6. Only abandon after trying scroll + find + back

Respond in JSON format.`;
}

interface ParsedCognitiveResponse {
  phase?: "perceive" | "comprehend" | "decide" | "execute" | "evaluate";
  monologue?: string;
  action?: string;
  actionTarget?: string;
  goalAchieved?: boolean;
  goalProgress?: number;
  newConfusion?: number;
  newFrustration?: number;
  mood?:
    | "neutral"
    | "hopeful"
    | "confused"
    | "frustrated"
    | "defeated"
    | "relieved";
  frictionDescription?: string;
  frictionElement?: string;
  /** Whether the action was successful (v13.1.0) */
  actionSuccess?: boolean;
  /** Error message if action failed (v13.1.0) */
  errorMessage?: string;
  /** v18.29.0: Element the persona is currently focused on */
  focusedElement?: string;
  /** v18.29.0: Evidence for goal completion — exact text from page */
  goalEvidence?: string;
  /** v18.29.0: Reason for failure — what was sought but not found */
  failureReason?: string;
}

function parseCognitiveResponse(response: string): ParsedCognitiveResponse {
  try {
    // Extract JSON from response (may have markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Parsing failed
  }
  return {};
}

function checkAbandonmentTriggers(
  state: CognitiveState,
  thresholds: AbandonmentThresholds
): { reason: CognitiveJourneyResult["abandonmentReason"]; message: string } | null {
  if (state.patienceRemaining < thresholds.patienceMin) {
    return { reason: "patience", message: "This is taking too long. I give up." };
  }
  if (state.confusionLevel > thresholds.confusionMax) {
    return {
      reason: "confusion",
      message: "I have no idea what to do. This is too confusing.",
    };
  }
  if (state.frustrationLevel > thresholds.frustrationMax) {
    return {
      reason: "frustration",
      message: "This is so frustrating! I'm done.",
    };
  }

  // Decision fatigue check (v9.9.0)
  if (
    state.decisionFatigue &&
    thresholds.decisionFatigueMax &&
    state.decisionFatigue.fatigueLevel > thresholds.decisionFatigueMax
  ) {
    return {
      reason: "decision_fatigue" as CognitiveJourneyResult["abandonmentReason"],
      message: "Too many choices... I can't think straight anymore. Maybe later.",
    };
  }

  // Loop detection
  const loopWindow = param("journey.abandon.loopWindow");
  const recentPages = state.memory.pagesVisited.slice(-loopWindow);
  const uniqueRecent = new Set(recentPages).size;
  if (
    recentPages.length >= loopWindow &&
    uniqueRecent <= thresholds.loopDetectionThreshold
  ) {
    return {
      reason: "loop",
      message: "I keep ending up on the same pages. Something is wrong.",
    };
  }

  // No progress
  if (
    state.stepCount > thresholds.maxStepsWithoutProgress &&
    state.goalProgress < param("journey.progress.madeLevel")
  ) {
    return {
      reason: "no_progress",
      message: "I'm not making any progress. This isn't working.",
    };
  }

  // Emotional state-based abandonment (v13.1.0)
  if (state.emotionalState) {
    const emotional = state.emotionalState;

    // High anxiety + high frustration — only abandon if BOTH are extreme AND patience is depleted
    if (emotional.anxiety > param("journey.emotionalAbandon.anxiety") && emotional.frustration > param("journey.emotionalAbandon.frustration") && state.patienceRemaining < param("journey.emotionalAbandon.patience")) {
      return {
        reason: "emotional" as CognitiveJourneyResult["abandonmentReason"],
        message: "This is too stressful. I need to take a break.",
      };
    }

    // Extreme boredom — only after significant time with zero engagement
    if (emotional.boredom > param("journey.emotionalAbandon.boredom") && emotional.excitement < param("journey.emotionalAbandon.excitement") && state.stepCount > param("journey.emotionalAbandon.boredomSteps")) {
      return {
        reason: "emotional" as CognitiveJourneyResult["abandonmentReason"],
        message: "This is so boring... I'll do this later.",
      };
    }

    // Overwhelming negative valence — only with sustained high arousal AND low patience
    if (emotional.valence < param("journey.emotionalAbandon.valence") && emotional.arousal > param("journey.emotionalAbandon.arousal") && state.patienceRemaining < param("journey.emotionalAbandon.valencePatience")) {
      return {
        reason: "emotional" as CognitiveJourneyResult["abandonmentReason"],
        message: "I can't deal with this right now.",
      };
    }

    // Apply emotional abandonment modifier to patience threshold
    const emotionalModifier = calculateAbandonmentModifier(emotional);
    const adjustedPatienceThreshold = thresholds.patienceMin * emotionalModifier;
    if (state.patienceRemaining < adjustedPatienceThreshold && emotionalModifier > param("journey.emotionalAbandon.modifier")) {
      return {
        reason: "emotional" as CognitiveJourneyResult["abandonmentReason"],
        message: "I don't have the energy for this anymore.",
      };
    }
  }

  return null;
}

interface ActionResult {
  success: boolean;
  newUrl?: string;
  movementTimeMs?: number;
  typingTimeMs?: number;
}

/**
 * Execute an action with optional Fitts' Law mouse timing (v9.9.0)
 *
 * Fitts' Law: MT = a + b × log₂(D/W + 1)
 * - MT: Movement time in ms
 * - D: Distance to target
 * - W: Target width
 * - a, b: Empirical constants (50ms, 150ms)
 *
 * For cognitive simulation, we estimate distance as 300px (average screen movement)
 * and target width as 80px (average button size). Persona traits modify timing.
 */
function ordinalSuffix(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

async function executeAction(
  browser: CBrowser,
  action: string,
  fittsParams?: Partial<FittsLawParams>,
  gazeMouseLag?: number,
  humanInput?: boolean,
  inputTraits?: { proceduralFluency?: number; motorPrecision?: number; patience?: number; readingTendency?: number },
): Promise<ActionResult> {
  const [type, ...args] = action.split(":");

  // Apply Fitts' Law timing for mouse actions (v9.9.0)
  let movementTimeMs = 0;
  if (["click", "hover", "hoverclick"].includes(type) && fittsParams) {
    // Estimate target size and distance
    // Average button width ~80px, average screen movement distance ~300px
    const estimatedDistance = param("journey.fitts.distancePx");
    const estimatedTargetWidth = param("journey.fitts.targetWidthPx");

    movementTimeMs = calculateFittsMovementTime(
      estimatedDistance,
      estimatedTargetWidth,
      fittsParams
    );

    // Add gaze-to-mouse lag (v10.1.0) - WebGazer.js research
    // Eye movements precede mouse movements by 200-500ms
    if (gazeMouseLag) {
      movementTimeMs += gazeMouseLag;
    }

    // When humanInput is enabled, humanClick provides its own hover-and-dwell
    // pacing — skip the pre-action sleep here so they don't compound (which
    // would make live mode slower than non-live, defeating the purpose).
    if (!humanInput) {
      await sleep(movementTimeMs);
    }
  }

  switch (type) {
    case "click": {
      const selector = args.join(":");
      const page = await browser.getPage();
      const urlBefore = page.url();

      // Prefer <a> tags first (actual navigation links), then buttons, fall back to hoverClick
      let clicked = false;
      try {
        const escapedSel = selector.replace(/"/g, '\\"');
        const link = page.locator(`a:has-text("${escapedSel}")`).first();
        if (await link.isVisible({ timeout: param("journey.action.linkVisibleMs") }).catch(() => false)) {
          await link.click({ timeout: param("journey.action.clickTimeoutMs") });
          clicked = true;
        }
      } catch {}

      if (!clicked) {
        try {
          const escapedSel = selector.replace(/"/g, '\\"');
          const btn = page.locator(`button:has-text("${escapedSel}"), [role="button"]:has-text("${escapedSel}")`).first();
          if (await btn.isVisible({ timeout: param("journey.action.buttonVisibleMs") }).catch(() => false)) {
            await btn.click({ timeout: param("journey.action.clickTimeoutMs") });
            clicked = true;
          }
        } catch {}
      }

      if (!clicked) {
        const result = await browser.hoverClick(selector);
        if (!result.success) return { success: false, movementTimeMs };
      }

      try { await page.waitForTimeout(param("journey.action.clickSettleMs")); } catch {}
      let urlAfter = page.url();

      // If click didn't navigate but the element had an href, follow it directly
      // This handles hover-dependent menus where click is intercepted by JS
      if (urlAfter === urlBefore) {
        try {
          const escapedSel = selector.replace(/"/g, '\\"');
          const href = await page.locator(`a:has-text("${escapedSel}")`).first().getAttribute('href').catch(() => null);
          if (href && href.startsWith('http')) {
            await page.goto(href, { waitUntil: 'domcontentloaded', timeout: param("journey.action.gotoTimeoutMs") });
            urlAfter = page.url();
          } else if (href && href.startsWith('/')) {
            const base = new URL(urlBefore).origin;
            await page.goto(base + href, { waitUntil: 'domcontentloaded', timeout: param("journey.action.gotoTimeoutMs") });
            urlAfter = page.url();
          }
        } catch {}
      }

      const navigated = urlAfter !== urlBefore;
      return { success: true, movementTimeMs, ...(navigated ? { newUrl: urlAfter } : {}) };
    }
    case "hover": {
      const selector = args.join(":");
      const result = await browser.hover(selector);
      return { success: result.success, movementTimeMs };
    }
    case "hoverclick": {
      // Explicit hover-click with optional parent: hoverclick:target:parent
      const [selector, parent] = args;
      const result = await browser.hoverClick(selector, { hoverParent: parent });
      return { success: result.success, movementTimeMs };
    }
    case "fill": {
      const [selector, ...valueParts] = args;
      const value = valueParts.join(":");

      if (humanInput) {
        // Human-realistic typing: focus the field, then type char-by-char
        // with Gaussian timing, occasional typos, and thinking pauses.
        const page = await browser.getPage();
        try {
          // Find the field by selector or label/placeholder
          const loc = page.locator(selector).first();
          if (await loc.count() === 0) {
            // Fallback to fill which has fuzzier matching
            const r = await browser.fill(selector, value);
            return { success: r.success };
          }
          await loc.scrollIntoViewIfNeeded({ timeout: param("journey.action.focusScrollMs") }).catch(() => {});
          await loc.click({ timeout: param("journey.action.clickTimeoutMs") });
          // Clear if there's existing content
          await page.keyboard.press("Control+A").catch(() => {});
          await page.keyboard.press("Delete").catch(() => {});
          const { humanType } = await import("../visual/human-input.js");
          await humanType(page, value, inputTraits);
          return { success: true };
        } catch (err) {
          // Fall back to instant fill if anything goes wrong
          const r = await browser.fill(selector, value);
          return { success: r.success };
        }
      }

      // Apply KLM timing for typing (v9.10.0)
      // Use age modifier as proxy for typing expertise (younger = faster)
      const expertise = fittsParams?.ageModifier
        ? Math.max(0, 1 - (fittsParams.ageModifier - 1))
        : param("journey.typing.defaultExpertise");
      const typingTimeMs = calculateTypingTime(value, expertise, true);

      // Add realistic typing delay
      await sleep(typingTimeMs);

      const result = await browser.fill(selector, value);
      return { success: result.success, typingTimeMs };
    }
    case "navigate": {
      const url = args.join(":");
      const result = await browser.navigate(url);
      return { success: true, newUrl: result.url };
    }
    case "scroll": {
      // Scroll action for cognitive journeys (v17.3.0)
      // Directions: down, up, bottom, top
      const direction = args[0]?.toLowerCase() || "down";
      const page = await browser.getPage();

      try {
        const beforeY = await page.evaluate(() => window.scrollY);
        const step = param("journey.action.scrollPx");
        if (humanInput && (direction === "down" || direction === "up")) {
          // Human-realistic scroll: variable delta + occasional glance-back.
          const { humanScroll } = await import("../visual/human-input.js");
          const baseDelta = direction === "down" ? step : -step;
          await humanScroll(page, baseDelta, inputTraits);
        } else {
          switch (direction) {
            case "top":
              await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
              break;
            case "bottom":
              await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
              break;
            case "up":
              await page.evaluate((d) => window.scrollBy({ top: -d, behavior: "smooth" }), step);
              break;
            case "down":
            default:
              await page.evaluate((d) => window.scrollBy({ top: d, behavior: "smooth" }), step);
              break;
          }
          await sleep(param("journey.action.scrollSettleMs"));
        }
        // Report success only if the page actually moved. A no-op scroll
        // (already at top/bottom, or scroll blocked) returns failure so the
        // AI knows to try something else instead of looping scroll:up/down.
        const afterY = await page.evaluate(() => window.scrollY);
        const moved = Math.abs(afterY - beforeY) > param("journey.action.scrollMovedPx");
        return { success: moved };
      } catch {
        return { success: false };
      }
    }
    case "back": {
      // Browser back button — most common recovery action
      const page = await browser.getPage();
      try {
        await page.goBack({ waitUntil: "domcontentloaded", timeout: param("journey.action.gotoTimeoutMs") });
        await sleep(param("journey.action.backSettleMs"));
        return { success: true, newUrl: page.url() };
      } catch {
        return { success: false };
      }
    }
    case "find": {
      // Ctrl+F / Find on page — power users search for text within the page
      const query = args.join(":").toLowerCase();
      const page = await browser.getPage();
      try {
        // Scroll to the first matching text element
        const found = await page.evaluate((q: string) => {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            if (node.textContent?.toLowerCase().includes(q)) {
              const el = node.parentElement;
              if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return true; }
            }
          }
          return false;
        }, query);
        await sleep(param("journey.action.findSettleMs"));
        return { success: found };
      } catch {
        return { success: false };
      }
    }
    case "tab": {
      // Tab key navigation — keyboard users move focus between elements
      const page = await browser.getPage();
      const count = parseInt(args[0] || "1", 10);
      try {
        for (let i = 0; i < Math.min(count, param("journey.action.maxTabs")); i++) {
          await page.keyboard.press("Tab");
          await sleep(param("journey.action.tabIntervalMs"));
        }
        return { success: true };
      } catch {
        return { success: false };
      }
    }
    case "enter": {
      // Press Enter — submit forms, activate focused element
      const page = await browser.getPage();
      try {
        await page.keyboard.press("Enter");
        await sleep(param("journey.action.navigationWaitMs"));
        const newUrl = page.url();
        return { success: true, newUrl };
      } catch {
        return { success: false };
      }
    }
    case "select": {
      // Select dropdown option: select:fieldName:optionValue
      const [selector, ...optionParts] = args;
      const option = optionParts.join(":");
      const page = await browser.getPage();
      try {
        await page.selectOption(`select:near(:text("${selector}"))`, { label: option }).catch(() =>
          page.selectOption(`[name="${selector}"]`, { label: option })
        );
        return { success: true };
      } catch {
        return { success: false };
      }
    }
    case "dismiss": {
      // Dismiss overlay/popup/modal — close cookie banners, newsletter popups
      try {
        await browser.dismissOverlay({ type: "auto", timeout: param("journey.action.dismissTimeoutMs") });
        return { success: true };
      } catch {
        return { success: false };
      }
    }
    case "expand": {
      // Click accordion/tab to expand content
      const selector = args.join(":");
      const page = await browser.getPage();
      try {
        await page.click(`details:has(summary:has-text("${selector}")) summary, [role="tab"]:has-text("${selector}"), button:has-text("${selector}")`);
        await sleep(param("journey.action.expandSettleMs"));
        return { success: true };
      } catch {
        // Fall back to regular click
        const result = await browser.hoverClick(selector);
        return { success: result.success };
      }
    }
    case "wait": {
      // Wait for page to load / content to appear
      await sleep(args[0] ? parseInt(args[0], 10) : param("journey.action.waitDefaultMs"));
      return { success: true };
    }
    default:
      // Unknown action type, skip
      return { success: false };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Re-export Emotional State Functions (v13.1.0)
// ============================================================================

export {
  createInitialEmotionalState,
  createEmotionalConfig,
  applyEmotionalTrigger,
  decayEmotions,
  calculateAbandonmentModifier,
  calculateExplorationTendency,
  calculateDecisionSpeedModifier,
  describeEmotionalState,
  shouldConsiderAbandonment,
} from "./emotions.js";

// ============================================================================
// Re-export Goal Decomposition (v18.35.0)
// ============================================================================

export { GoalDecomposer } from "./goal-decomposer.js";
export type {
  ParsedGoal,
  GoalPlan,
  SubGoal,
  Strategy,
  PlannedAction,
  GoalResult,
  ExecutionOptions,
} from "./goal-types.js";

// ============================================================================
// Re-export Journey Trace (v18.68.0)
// ============================================================================

export {
  JourneyTraceWriter,
  TraceReplayProvider,
  TraceDivergenceError,
  hashPageState,
} from "./journey-trace.js";
export type { DecisionProvider, StepContext, TraceStep } from "./journey-trace.js";
