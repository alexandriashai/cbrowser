/**
 * A scripted world for runCognitiveJourney: pages, a fake browser, a scripted
 * decision source, virtual time and seeded randomness, so the whole journey
 * loop runs in milliseconds with no Chromium and no model, and every number
 * it produces is reproducible bit for bit.
 *
 * What is real: all of runCognitiveJourney, executeAction, the emotional
 * engine, the temporal modulators, the prompts, and the in-page callbacks the
 * journey hands to page.evaluate (the visible-content extractor, scrolls,
 * find-on-page), which run here against a small fake DOM built from the page
 * description. What is scripted: the page content, what a click on each
 * element does, and the decision the persona makes at each step.
 *
 * Time: setTimeout is replaced by a queue that fires the earliest timer only
 * when nothing else is runnable, and Date.now is frozen at the virtual clock
 * (bun:test setSystemTime), so every sleep, Fitts pause, distraction and
 * timeout costs no real time and timeElapsed is the sum of the waits. The
 * delay of every timer the run sets is recorded; the timing constants are
 * observed through that list.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { setSystemTime } from "bun:test";
import type { DecisionProvider, StepContext } from "../../src/cognitive/journey-trace.js";

// ─── The world ───────────────────────────────────────────────────────────────

export interface WorldElement {
  tag: string;
  text: string;
  /** CSS id selector, unique in the page. */
  selector: string;
  role?: string;
  region: string;
  /** Document coordinates, CSS px. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Where a click on it goes (a page key in the world); absent = no navigation. */
  href?: string;
}

export interface WorldBlock {
  tag: "h1" | "h2" | "h3" | "h4" | "p" | "li" | "td" | "th";
  text: string;
  /** Document y and box size, CSS px. */
  y: number;
  height: number;
  width: number;
  hidden?: boolean;
}

export interface WorldInput {
  selector: string;
  type: string;
  name: string;
  placeholder: string;
  label: string;
  isHidden?: boolean;
  triggerText?: string;
  options?: string[];
}

export interface WorldPage {
  title: string;
  elements: WorldElement[];
  blocks: WorldBlock[];
  inputs?: WorldInput[];
  /** Document height, CSS px. */
  height: number;
  modal?: boolean;
  formErrors?: string[];
  banner?: string;
}

export type World = Record<string, WorldPage>;

export const VIEWPORT = { width: 1280, height: 800 };

// ─── Virtual time ────────────────────────────────────────────────────────────

const T0 = Date.UTC(2026, 9, 21, 15, 0, 0); // a Wednesday, 15:00 UTC

interface Timer { due: number; id: number; cb: (...a: unknown[]) => void; args: unknown[] }

/**
 * Run `fn` on a virtual clock. Returns its result and the delay (ms) of every
 * timer set while it ran, in order.
 */
export async function withVirtualTime<T>(fn: () => Promise<T>): Promise<{ result: T; delays: number[]; elapsedMs: number }> {
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  let now = T0;
  let seq = 0;
  let pumping = false;
  const queue: Timer[] = [];
  const delays: number[] = [];
  setSystemTime(new Date(now));

  const kick = () => {
    if (pumping) return;
    pumping = true;
    realSet(pump, 0);
  };
  const pump = () => {
    pumping = false;
    if (queue.length === 0) return;
    queue.sort((a, b) => a.due - b.due || a.id - b.id);
    const t = queue.shift()!;
    now = Math.max(now, t.due);
    setSystemTime(new Date(now));
    try {
      t.cb(...t.args);
    } finally {
      kick();
    }
  };

  globalThis.setTimeout = ((cb: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) => {
    const delay = Math.max(0, Number(ms) || 0);
    delays.push(delay);
    const id = ++seq;
    queue.push({ due: now + delay, id, cb, args });
    kick();
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id: unknown) => {
    const i = queue.findIndex((t) => t.id === id);
    if (i >= 0) queue.splice(i, 1);
  }) as typeof clearTimeout;

  try {
    const result = await fn();
    return { result, delays, elapsedMs: now - T0 };
  } finally {
    globalThis.setTimeout = realSet;
    globalThis.clearTimeout = realClear;
    setSystemTime();
  }
}

/** Run `fn` with Math.random replaced by a seeded generator (mulberry32). */
export async function withSeededRandom<T>(seed: number, fn: () => Promise<T>): Promise<T> {
  const real = Math.random;
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return await fn();
  } finally {
    Math.random = real;
  }
}

// ─── A fake DOM for the callbacks the journey runs in the page ──────────────

function fakeGlobals(world: World, state: BrowserState) {
  const page = world[state.url];
  const rectOf = (y: number, height: number, width: number, x = 0) => {
    const top = y - state.scrollY;
    return { top, bottom: top + height, left: x, right: x + width, width, height, x, y: top };
  };
  const blockEl = (b: WorldBlock) => ({
    tagName: b.tag.toUpperCase(),
    innerText: b.text,
    textContent: b.text,
    hidden: !!b.hidden,
    getBoundingClientRect: () => rectOf(b.y, b.height, b.width),
  });
  const elementEl = (e: WorldElement) => ({
    tagName: e.tag.toUpperCase(),
    innerText: e.text,
    textContent: e.text,
    getBoundingClientRect: () => rectOf(e.y, e.height, e.width, e.x),
  });
  const maxScroll = Math.max(0, page.height - VIEWPORT.height);
  const clampScroll = (y: number) => Math.max(0, Math.min(maxScroll, y));
  const textNodes = [...page.blocks.map((b) => ({ text: b.text, y: b.y })), ...page.elements.map((e) => ({ text: e.text, y: e.y }))];

  const window = {
    innerHeight: VIEWPORT.height,
    innerWidth: VIEWPORT.width,
    get scrollY() { return state.scrollY; },
    scrollTo: (o: { top: number }) => { state.scrollY = clampScroll(o.top); },
    scrollBy: (o: { top: number }) => { state.scrollY = clampScroll(state.scrollY + o.top); },
    getComputedStyle: (el: { hidden?: boolean }) => ({ display: el.hidden ? "none" : "block", visibility: "visible" }),
  };
  const document = {
    body: { innerText: textNodes.map((t) => t.text).join("\n"), scrollHeight: page.height },
    querySelectorAll: (sel: string) => {
      if (sel.startsWith("h1, h2, h3, h4, p, li")) return page.blocks.map(blockEl);
      return [];
    },
    querySelector: (sel: string) => {
      const e = page.elements.find((x) => x.selector === sel);
      return e ? elementEl(e) : null;
    },
    createTreeWalker: () => {
      let i = -1;
      return {
        nextNode: () => {
          i++;
          if (i >= textNodes.length) return null;
          const n = textNodes[i];
          return {
            textContent: n.text,
            parentElement: { scrollIntoView: () => { state.scrollY = clampScroll(n.y - VIEWPORT.height / 2); } },
          };
        },
      };
    },
  };
  return { window, document, NodeFilter: { SHOW_TEXT: 4 } };
}

function runInPage<T>(world: World, state: BrowserState, fn: (arg?: unknown) => T, arg?: unknown): T {
  const g = globalThis as Record<string, unknown>;
  const saved = { window: g.window, document: g.document, NodeFilter: g.NodeFilter };
  Object.assign(g, fakeGlobals(world, state));
  try {
    return fn(arg);
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete g[k];
      else g[k] = v;
    }
  }
}

// ─── The fake browser ────────────────────────────────────────────────────────

interface BrowserState {
  url: string;
  scrollY: number;
  history: string[];
  shots: number;
  modalDismissed: Set<string>;
  filled: Record<string, string>;
}

/** What the fake browser saw the journey do, for the golden. */
export interface BrowserLog {
  calls: string[];
}

function hasText(e: WorldElement, wanted: string): boolean {
  return e.text.toLowerCase().includes(wanted.toLowerCase());
}

/**
 * A stand-in for CBrowser that serves `world`. Unknown URLs make navigate
 * throw, which is how a scenario reaches the journey's action-error path.
 */
export function createWorldBrowser(world: World, log: BrowserLog) {
  const state: BrowserState = { url: "", scrollY: 0, history: [], shots: 0, modalDismissed: new Set(), filled: {} };
  const go = (url: string) => {
    if (!world[url]) throw new Error(`net::ERR_NAME_NOT_RESOLVED at ${url}`);
    if (state.url) state.history.push(state.url);
    state.url = url;
    state.scrollY = 0;
  };
  const current = () => world[state.url];
  const findByLocator = (sel: string): WorldElement | undefined => {
    const a = /^a:has-text\("(.*)"\)$/.exec(sel);
    if (a) return current().elements.find((e) => e.tag === "a" && hasText(e, a[1].replace(/\\"/g, '"')));
    const b = /^button:has-text\("(.*)"\), \[role="button"\]:has-text\("(.*)"\)$/.exec(sel);
    if (b) return current().elements.find((e) => (e.tag === "button" || e.role === "button") && hasText(e, b[1].replace(/\\"/g, '"')));
    return current().elements.find((e) => e.selector === sel) ?? inputAsElement(sel);
  };
  // An input addressed by its selector (the humanInput fill path focuses it).
  const inputAsElement = (sel: string): WorldElement | undefined => {
    const i = (current().inputs ?? []).find((x) => x.selector === sel);
    return i ? { tag: "input", text: i.label, selector: i.selector, region: "form", x: 100, y: 300, width: 300, height: 36 } : undefined;
  };
  const clickElement = (e: WorldElement) => {
    log.calls.push(`click ${e.selector}`);
    if (e.href) go(e.href);
  };

  const page = {
    bringToFront: async () => {},
    title: async () => current().title,
    url: () => state.url,
    evaluate: async (fn: unknown, arg?: unknown) => {
      if (typeof fn === "string") {
        if (fn === "1+1") return 2;
        return undefined;
      }
      return runInPage(world, state, fn as (a?: unknown) => unknown, arg);
    },
    waitForTimeout: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    mouse: {
      click: async (x: number, y: number) => {
        const docY = y + state.scrollY;
        const hit = current().elements.find((e) => x >= e.x && x <= e.x + e.width && docY >= e.y && docY <= e.y + e.height);
        log.calls.push(`mouse ${Math.round(x)},${Math.round(docY)}`);
        if (hit) clickElement(hit);
      },
      move: async () => {},
    },
    keyboard: {
      press: async (key: string) => { log.calls.push(`key ${key}`); },
      type: async (text: string) => { log.calls.push(`type ${text}`); },
    },
    locator: (sel: string) => {
      const first = {
        isVisible: async () => !!findByLocator(sel),
        click: async () => {
          const e = findByLocator(sel);
          if (!e) throw new Error(`locator ${sel} not found`);
          clickElement(e);
        },
        getAttribute: async (name: string) => (name === "href" ? findByLocator(sel)?.href ?? null : null),
        count: async () => (findByLocator(sel) ? 1 : 0),
        scrollIntoViewIfNeeded: async () => {},
      };
      return { first: () => first };
    },
    goto: async (url: string) => { go(url); },
    goBack: async () => {
      const prev = state.history.pop();
      if (!prev) throw new Error("no history");
      state.url = prev;
      state.scrollY = 0;
    },
    selectOption: async (sel: string, o: { label: string }) => {
      const input = (current().inputs ?? []).find((i) => sel.includes(i.label) || sel.includes(i.name));
      if (!input || !(input.options ?? []).includes(o.label)) throw new Error(`no option ${o.label}`);
      log.calls.push(`select ${input.name}=${o.label}`);
      return [o.label];
    },
    click: async (sel: string) => {
      const m = /has-text\("([^"]*)"\)/.exec(sel);
      const e = m ? current().elements.find((x) => hasText(x, m[1])) : undefined;
      if (!e) throw new Error(`no element for ${sel}`);
      clickElement(e);
    },
    context: () => ({ addInitScript: async () => {} }),
  };

  const browser = {
    getPage: async () => page,
    navigate: async (url: string) => {
      log.calls.push(`navigate ${url}`);
      go(url);
      return { url, title: current().title, loadTime: 0, consoleLogs: [], screenshot: "" };
    },
    screenshot: async () => `shot-${++state.shots}.png`,
    getAvailableClickables: async () =>
      current().elements.map((e) => {
        const top = e.y - state.scrollY;
        return {
          tag: e.tag, text: e.text, selector: e.selector, ...(e.role ? { role: e.role } : {}),
          aboveFold: top < VIEWPORT.height && top + e.height > 0, region: e.region,
          x: e.x, y: top, width: e.width, height: e.height,
        };
      }),
    getAvailableInputs: async () => (current().inputs ?? []).map((i) => ({ ...i })),
    getViewportContext: async () => {
      const p = current();
      const max = Math.max(0, p.height - VIEWPORT.height);
      const y = state.scrollY;
      return {
        viewport: { ...VIEWPORT },
        scroll: { y, max, pct: max > 0 ? Math.round((y / max) * 100) / 100 : 0, atTop: y < 50, atBottom: y > max - 50 },
        headings: p.blocks.filter((b) => b.tag.startsWith("h")).map((b) => ({
          level: Number(b.tag.slice(1)), text: b.text, visible: b.y - y < VIEWPORT.height && b.y - y + b.height > 0,
        })),
        activeModals: p.modal && !state.modalDismissed.has(state.url) ? 1 : 0,
        formErrors: p.formErrors ?? [],
        bannersBlocking: p.banner && !state.modalDismissed.has(state.url) ? [p.banner] : [],
      };
    },
    hoverClick: async (selector: string) => {
      const e = current().elements.find((x) => hasText(x, selector) || x.selector === selector);
      log.calls.push(`hoverClick ${selector} -> ${e ? e.selector : "none"}`);
      if (!e) return { success: false, element: selector, message: "not found" };
      clickElement(e);
      return { success: true, element: selector, message: "clicked" };
    },
    hover: async (selector: string) => {
      const e = current().elements.find((x) => hasText(x, selector));
      log.calls.push(`hover ${selector}`);
      return { success: !!e, element: selector, message: e ? "hovered" : "not found" };
    },
    fill: async (selector: string, value: string) => {
      const input = (current().inputs ?? []).find((i) => [i.selector, i.name, i.label, i.placeholder].some((s) => s && s.toLowerCase() === selector.toLowerCase()));
      log.calls.push(`fill ${selector}=${value} -> ${input ? input.name : "none"}`);
      if (input) state.filled[input.name] = value;
      return { success: !!input, element: selector, message: input ? "filled" : "not found" };
    },
    dismissOverlay: async () => {
      const p = current();
      if (!p.modal && !p.banner) throw new Error("no overlay");
      state.modalDismissed.add(state.url);
      log.calls.push("dismiss");
      return { dismissed: true, overlaysFound: 1 };
    },
    setGeolocationRuntime: async () => {},
    close: async () => { log.calls.push("close"); },
  };
  return browser;
}

// ─── Scripted decisions ──────────────────────────────────────────────────────

export interface ScriptedStep {
  monologue?: string;
  action?: string | null;
  actionTarget?: string;
  goalAchieved?: boolean;
  goalProgress?: number;
  goalEvidence?: string;
  newConfusion?: number;
  newFrustration?: number;
  mood?: string;
  frictionDescription?: string;
  frictionElement?: string;
  actionSuccess?: boolean;
  errorMessage?: string;
  phase?: string;
  failureReason?: string;
}

/**
 * Answers step N with steps[N-1] (the last one repeats once the script runs
 * out) and the final evaluation with `finalEval`. Records the prompts it was
 * shown, which carry the thresholds and the state the persona is told.
 */
export class ScriptedProvider implements DecisionProvider {
  systemPrompt = "";
  prompts: string[] = [];
  finalEvalPrompt: string | null = null;
  constructor(private steps: Array<ScriptedStep | string>, private finalEval: { achieved: boolean; evidence?: string | null } = { achieved: false, evidence: null }) {}
  async decide(ctx: StepContext): Promise<string> {
    const last = ctx.messages[ctx.messages.length - 1];
    if (ctx.stepIndex < 0) {
      this.finalEvalPrompt = last.content;
      return JSON.stringify(this.finalEval);
    }
    if (!this.systemPrompt) this.systemPrompt = ctx.systemPrompt;
    this.prompts.push(last.content);
    const s = this.steps[Math.min(ctx.stepIndex, this.steps.length) - 1];
    return typeof s === "string" ? s : JSON.stringify(s);
  }
}
