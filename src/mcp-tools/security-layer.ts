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
 * `1e-9` and integers do not. A cheap gate so a clean payload is never parsed.
 */
const FLOAT_RESIDUE = /\d\.\d*(?:0{6,}|9{6,})\d/;

/** Twelve significant digits: below every measurement this package makes, above the residue. */
function cleanNumber(v: number): number {
  return Number.isFinite(v) && !Number.isInteger(v) ? Number(v.toPrecision(12)) : v;
}

/** Deep copy of plain objects and arrays with every number cleaned; anything else is passed through. */
function cleanDeep(v: unknown): unknown {
  if (typeof v === "number") return cleanNumber(v);
  if (Array.isArray(v)) return v.map(cleanDeep);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = cleanDeep(x);
    return out;
  }
  return v;
}

/**
 * Remove binary floating-point residue from a tool result, at the one boundary
 * every tool on both surfaces passes through.
 *
 * Customers read `totalBarrierDeduction: 29.299999999999997`,
 * `cognitiveLoad: 0.43019999999999997` and `0.30000000000000004` in JSON that
 * was otherwise rounded. There are ~117 hand-written Math.round sites in src/
 * and two private round3 copies, which is how a field gets missed: rounding at
 * each producer depends on every producer remembering. Here it cannot be
 * forgotten. (2026-10-09)
 *
 * - A "text" block is touched only if it contains residue AND parses as JSON;
 *   it is re-serialized at its own indentation, and kept byte-identical when
 *   no number actually changed. Non-JSON text and image blocks are untouched.
 * - `structuredContent` gets the same treatment.
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
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { return block; }
      let changed = false;
      const replacer = (_k: string, v: unknown) => {
        if (typeof v !== "number") return v;
        const c = cleanNumber(v);
        if (c !== v) changed = true;
        return c;
      };
      const indent = /\n( +)\S/.exec(text)?.[1].length ?? 0;
      const next = JSON.stringify(parsed, replacer, indent || undefined);
      if (!changed) return block;
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
      // The one serialization boundary every tool passes through. See
      // cleanFloatResidue.
      return cleanFloatResidue(await (handler as (...a: unknown[]) => Promise<unknown>)(...args));
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
