/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Security layer — connects src/security/ to the tools that are actually served.
 *
 * Until 2026-07-26 the entire security module was dead code. A grep for its six
 * public entry points across src/, excluding src/security/ itself, returned ZERO
 * call sites, while README.md shipped a Zone table, skill/SKILL.md claimed
 * "Constitutional safety (won't execute dangerous actions)" with a checkmark in a
 * feature matrix, skill/Philosophy.md claimed "Every session generates an audit
 * log", and cli.ts documented `--force  Bypass red zone safety checks`. None of
 * it ran. Four green test files covered the functions in isolation, which is
 * exactly why a 570/570 suite read as assurance.
 *
 * Applied UNCONDITIONALLY, deliberately. `createGatedServer` returns the server
 * untouched when the tier is null, which is the live enterprise configuration, so
 * hanging security off tier gating would inherit that hole.
 *
 * WHAT IS ENFORCED, AND WHY THE REST IS NOT:
 *   - Audit logging: always. Zero behaviour change, and it is what makes the
 *     documented claim true.
 *   - Description scanning: at registration, recorded. Detection only.
 *   - Zone `black`: always denied. There are currently zero black tools, so this
 *     is a guard for future classifications rather than a change today.
 *   - Zone `red`: NOT denied by default. The zone model was designed around a CLI
 *     `--force` flag, and MCP has no equivalent affordance — a caller has no way
 *     to express override. Enforcing it would have denied six tools that work
 *     today on the paid product (stealth_enable/disable/diagnose, set_api_key,
 *     ask_user, cognitive_journey_autonomous, chaos_test), which is a worse
 *     outcome than the gap it closes. It is available behind
 *     CBROWSER_ENFORCE_RED_ZONE=true, and the real fix is a force affordance in
 *     the MCP surface — a design decision, not a patch.
 */

import { createAuditContext, wrapToolHandler } from "../security/audit-wrapper.js";
import { checkToolPermission } from "../security/tool-permissions.js";
import { scanToolDescription } from "../security/description-scanner.js";
import type { AuditContext } from "../security/audit-wrapper.js";

/** Registration-time description-scan results, for the caller to surface. */
export interface DescriptionScanSummary {
  scanned: number;
  flagged: Array<{ tool: string; issues: number }>;
}

let lastScan: DescriptionScanSummary = { scanned: 0, flagged: [] };

/** What the most recent registration pass found. Read-only. */
export function getDescriptionScanSummary(): DescriptionScanSummary {
  return { scanned: lastScan.scanned, flagged: [...lastScan.flagged] };
}

/**
 * Binary floating-point residue: a run of six or more 0s or 9s after the
 * decimal point, followed by one more digit. `0.30000000000000004`,
 * `29.299999999999997` and `0.43019999999999997` all match; `0.3`, `29.3`,
 * `1e-9` and integers do not. A cheap gate so a clean payload is never parsed,
 * and the per-number test: only a number that carries residue is rewritten.
 */
const FLOAT_RESIDUE = /\d\.\d*(?:0{6,}|9{6,})\d/;

/** Twelve significant digits: below every measurement this package makes, above the residue. */
function cleanNumber(v: number): number {
  return Number.isFinite(v) && !Number.isInteger(v) ? Number(v.toPrecision(12)) : v;
}

/** A number cleaned only when its shortest form carries residue; every other number is returned as is. */
function cleanIfResidue(v: number): number {
  return FLOAT_RESIDUE.test(String(v)) ? cleanNumber(v) : v;
}

/** Deep copy of plain objects and arrays with residue cleaned; anything else is passed through. */
function cleanDeep(v: unknown): unknown {
  if (typeof v === "number") return cleanIfResidue(v);
  if (Array.isArray(v)) return v.map(cleanDeep);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = cleanDeep(x);
    return out;
  }
  return v;
}

/**
 * The tools whose results are cbrowser's OWN computed analysis -- scores,
 * deductions, weights, distances, persona state -- and so the only ones whose
 * float residue is ours to remove. An explicit opt-in, never a default.
 *
 * Applied to every tool, the clean-up rewrote page data: evaluate_script
 * returned a customer's `{cartTotal: 29.299999999999997}` as 29.3, masking the
 * very float bug they were inspecting, and the whole-block re-serialization
 * moved values with more than 12 significant digits and corrupted integer
 * literals above 2^53. Page-data tools (evaluate_script, extract, get_*,
 * cookies, storage, console and network logs, nl_test results, screenshots,
 * navigation) are deliberately absent. (Round 2, 2026-10-09)
 */
const COMPUTED_ANALYSIS_PREFIX = /^(?:(?:empathy|attention|cognitive|persona|marketing)_|compare_personas(?:_|$))/;
const COMPUTED_ANALYSIS_TOOLS = new Set([
  "list_cognitive_personas",
  "list_emotional_personas",
  "get_emotional_state",
  "trigger_emotional_event",
  "list_influence_patterns",
  "agent_ready_audit",
  "hunt_bugs",
  "site_cognitive_assessment",
  "visual_cognitive_story",
  "competitive_benchmark",
  "journey_heatmap_gif",
  "webmcp_ready_audit",
  "ai_benchmark",
  "transport_map",
]);

/** True when a tool's result is cbrowser's own computed analysis and may have its float residue removed. */
export function isComputedAnalysisTool(name: string): boolean {
  return COMPUTED_ANALYSIS_TOOLS.has(name) || COMPUTED_ANALYSIS_PREFIX.test(name);
}

/** One JSON number token, per RFC 8259, anchored where the scanner stands. */
const NUMBER_TOKEN = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

/**
 * Rewrite the residue-carrying number tokens of a JSON text, and nothing
 * else. A scanner, not a parse-and-stringify: it tracks string state and
 * escapes, and replaces only number tokens OUTSIDE strings whose value
 * carries residue and changes when cleaned. Every other byte -- big integer
 * literals, other numbers, whitespace, key order, string contents -- is
 * returned as it came. The caller decides the text is JSON.
 */
export function cleanResidueInJsonText(text: string): string {
  const chunks: string[] = [];
  let last = 0;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text.charCodeAt(i);
    if (ch === 34 /* " */) {
      i++;
      while (i < n) {
        const c = text.charCodeAt(i);
        if (c === 92 /* backslash */) { i += 2; continue; }
        i++;
        if (c === 34) break;
      }
      continue;
    }
    if (ch === 45 /* - */ || (ch >= 48 && ch <= 57)) {
      NUMBER_TOKEN.lastIndex = i;
      const m = NUMBER_TOKEN.exec(text);
      if (!m) { i++; continue; }
      const start = i;
      i += m[0].length;
      if (FLOAT_RESIDUE.test(m[0])) {
        const v = Number(m[0]);
        const c = cleanNumber(v);
        if (c !== v) {
          chunks.push(text.slice(last, start), String(c));
          last = i;
        }
      }
      continue;
    }
    i++;
  }
  if (chunks.length === 0) return text;
  chunks.push(text.slice(last));
  return chunks.join("");
}

/**
 * Remove binary floating-point residue from a computed-analysis tool's
 * result. The secured wrapper calls it only for isComputedAnalysisTool names.
 *
 * Customers read `totalBarrierDeduction: 29.299999999999997`,
 * `cognitiveLoad: 0.43019999999999997` and `0.30000000000000004` in JSON that
 * was otherwise rounded. There are ~117 hand-written Math.round sites in src/
 * and two private round3 copies, which is how a field gets missed: rounding at
 * each producer depends on every producer remembering. (2026-10-09)
 *
 * - A "text" block is touched only if it contains residue AND parses as JSON,
 *   and then only its residue-carrying number tokens are rewritten
 *   (cleanResidueInJsonText); every other byte is kept. Non-JSON text and
 *   image blocks are untouched.
 * - `structuredContent` (already an object, so no bytes to keep) has each
 *   residue-carrying number cleaned.
 * - Strings are never edited: "0.30000000000000004" stays a string.
 *
 * 12 significant digits removes residue (it lives at the 16th-17th) without
 * moving a real value; 1e-9 and integers pass through unchanged.
 */
export function cleanFloatResidue(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const r = result as { content?: unknown; structuredContent?: unknown };
  let out: Record<string, unknown> | null = null;
  const edit = (): Record<string, unknown> => (out ??= { ...(result as Record<string, unknown>) });

  if (Array.isArray(r.content)) {
    let changedAny = false;
    const blocks = r.content.map((block) => {
      const b = block as { type?: unknown; text?: unknown };
      if (!b || b.type !== "text" || typeof b.text !== "string") return block;
      const text = b.text;
      const lead = text.trimStart()[0];
      if ((lead !== "{" && lead !== "[") || !FLOAT_RESIDUE.test(text)) return block;
      try { JSON.parse(text); } catch { return block; }
      const next = cleanResidueInJsonText(text);
      if (next === text) return block;
      changedAny = true;
      return { ...(block as Record<string, unknown>), text: next };
    });
    if (changedAny) edit().content = blocks;
  }

  if (r.structuredContent && typeof r.structuredContent === "object") {
    let serialized: string | undefined;
    try { serialized = JSON.stringify(r.structuredContent); } catch { serialized = undefined; }
    if (serialized && FLOAT_RESIDUE.test(serialized)) {
      edit().structuredContent = cleanDeep(r.structuredContent);
    }
  }

  return out ?? result;
}

/** Red-zone denial is opt-in; see the module comment for why. */
function redZoneEnforced(): boolean {
  return process.env.CBROWSER_ENFORCE_RED_ZONE === "true" || process.env.CBROWSER_ENFORCE_RED_ZONE === "1";
}

/**
 * Wrap a server so every tool registered through it is audited and zone-checked.
 *
 * Composes with createGatedServer rather than replacing it: tier gating decides
 * what a customer may reach, this decides what is recorded and what is refused
 * outright.
 */
export function applySecurityLayer(server: unknown, opts?: { audit?: AuditContext }): unknown {
  // BOTH registration methods must be wrapped. There are two independent tool
  // surfaces in this package: registerAllPublicTools uses `registerTool` (the
  // hosted/remote servers), while src/mcp-server.ts — the local stdio server —
  // registers its own ~100 tools with the deprecated `server.tool(...)` in 4,372
  // lines of its own. Wrapping only the first covered the hosted path and left
  // the local server completely unaudited, which is precisely the "wired it but
  // it never fires" outcome this whole change exists to eliminate. Verified by
  // driving a real tools/call at each surface and checking for the entry.
  const srv = server as {
    registerTool?: (name: string, config: Record<string, unknown>, handler: (...args: unknown[]) => unknown) => void;
    tool?: (...args: unknown[]) => unknown;
  };
  const originalRegisterTool = srv.registerTool?.bind(srv);

  let audit: AuditContext;
  try {
    audit = opts?.audit ?? createAuditContext();
  } catch {
    // An unwritable audit dir must not take the server down. Degrade to
    // disabled-but-present rather than crashing at startup.
    audit = { sessionId: "unavailable", auditDir: "", enabled: false, includeStackTraces: false, actionsTriggered: new Map() };
  }

  lastScan = { scanned: 0, flagged: [] };

  /** Scan a description at registration time. Detection only, never blocking. */
  const scan = (name: string, description: unknown) => {
    try {
      if (typeof description === "string" && description) {
        lastScan.scanned++;
        const r = scanToolDescription(name, description);
        if (r.issues.length > 0) lastScan.flagged.push({ tool: name, issues: r.issues.length });
      }
    } catch { /* scanning must never block registration */ }
  };

  /** Wrap one handler with zone refusal + audit. */
  const secure = (name: string, handler: (...args: unknown[]) => unknown) => {
    const secured = async (...args: unknown[]) => {
      const decision = checkToolPermission(name, redZoneEnforced());
      // `black` is refused unconditionally; `red` only when explicitly enforced.
      // Anything allowed proceeds, with the zone recorded either way.
      const refuse =
        decision.zone === "black" || (decision.zone === "red" && redZoneEnforced() && !decision.allowed);
      if (refuse) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: JSON.stringify({
              error: "tool_refused_by_zone",
              tool: name,
              zone: decision.zone,
              message: decision.message ?? `Tool '${name}' is refused by its safety zone.`,
            }, null, 2),
          }],
        };
      }
      const result = await (handler as (...a: unknown[]) => Promise<unknown>)(...args);
      // Residue is removed from cbrowser's own computed analysis only, never
      // from page data. See isComputedAnalysisTool and cleanFloatResidue.
      return isComputedAnalysisTool(name) ? cleanFloatResidue(result) : result;
    };

    // Audit wraps the outermost call so a zone refusal is recorded too.
    // wrapToolHandler calls handler(params) with one argument; MCP passes
    // (args, extra). Forward the rest explicitly so the extra context is not
    // silently dropped on its way through the audit layer.
    const audited = wrapToolHandler(
      ((params: Record<string, unknown>) => secured(params)) as unknown as Parameters<typeof wrapToolHandler>[0],
      name,
      audit,
    ) as unknown as (...args: unknown[]) => unknown;
    return audited;
  };

  if (originalRegisterTool) {
    srv.registerTool = (name: string, config: Record<string, unknown>, handler: (...args: unknown[]) => unknown) => {
      scan(name, config?.description);
      originalRegisterTool(name, config, secure(name, handler));
    };
  }

  // The deprecated `.tool()` overloads put the handler last and the description
  // (when present) second, so locate the callback by position from the end
  // rather than assuming an arity.
  const originalTool = srv.tool?.bind(srv);
  if (originalTool) {
    srv.tool = (...args: unknown[]) => {
      const name = typeof args[0] === "string" ? args[0] : "(unknown)";
      const handlerIdx = args.length - 1;
      const handler = args[handlerIdx];
      if (typeof handler !== "function") return originalTool(...args);
      const maybeConfig = args.find((a) => a && typeof a === "object" && "description" in (a as object));
      scan(name, typeof args[1] === "string" ? args[1] : (maybeConfig as { description?: unknown })?.description);
      const next = [...args];
      next[handlerIdx] = secure(name, handler as (...a: unknown[]) => unknown);
      return originalTool(...next);
    };
  }

  return srv;
}
