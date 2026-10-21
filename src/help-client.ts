/**
 * help-client.ts — ask the CBrowser knowledge base a question.
 *
 * One client for `cbrowser ask` and the `question_answer` MCP tool. Before
 * 20.0.0 the tool always posted to CMS_URL or localhost:3200, which exists only
 * on the hosted servers, so on a user's machine it could never answer.
 *
 * Where a question goes:
 *  - CMS_URL set: only there, with the caller's key hash (an operator's own CMS).
 *  - Hosted mode: the local CMS first, with the key hash, so the account is
 *    known; the public endpoint only if the local CMS cannot be reached.
 *  - Otherwise: the public endpoint (CBROWSER_HELP_URL overrides it), anonymously.
 *
 * The key hash goes only to a CMS the operator runs, never to the public
 * endpoint. A target is skipped only when it cannot be reached; an HTTP error
 * (429, 500) is the answer, because asking a second server would double-spend.
 */

export const PUBLIC_HELP_URL = "https://cbrowser.ai/cms/api/ai/question";
const LOCAL_CMS_URL = "http://localhost:3200";
const QUESTION_PATH = "/api/ai/question";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface HelpAnswer {
  question: string;
  answer: string;
  sources: string[];
  /** Which endpoint answered (no credentials in it). */
  answeredBy: string;
}

export interface AskOptions {
  context?: string;
  /** sha256 of the caller's cbk_ key, as the hosted tier gate holds it. */
  keyHash?: string | null;
  /** True on the hosted MCP servers (startRemoteMcpServer). */
  hosted?: boolean;
  timeoutMs?: number;
  /** Tests only: the CMS a hosted server asks first (default localhost:3200). */
  localCmsUrl?: string;
}

/** A help request that failed, with a message a person can act on. */
export class HelpError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "HelpError";
  }
}

interface Target { url: string; keyHash?: string }

export function helpTargets(opts: AskOptions = {}): Target[] {
  const explicit = process.env.CMS_URL;
  const key = opts.keyHash || undefined;
  if (explicit) return [{ url: explicit.replace(/\/$/, "") + QUESTION_PATH, keyHash: key }];
  const publicUrl = process.env.CBROWSER_HELP_URL || PUBLIC_HELP_URL;
  if (opts.hosted) {
    return [
      { url: (opts.localCmsUrl ?? LOCAL_CMS_URL) + QUESTION_PATH, keyHash: key },
      { url: publicUrl },
    ];
  }
  return [{ url: publicUrl }];
}

export async function askCbrowser(question: string, opts: AskOptions = {}): Promise<HelpAnswer> {
  if (!question.trim()) throw new HelpError("Ask a question, e.g. cbrowser ask \"How do I test on an iPhone?\"");
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const body = JSON.stringify({ question, ...(opts.context ? { context: opts.context } : {}) });
  let lastNetworkError: unknown;

  for (const target of helpTargets(opts)) {
    let res: Response;
    try {
      res = await fetch(target.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(target.keyHash ? { Authorization: `Bearer ${target.keyHash}` } : {}),
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if ((e as Error).name === "TimeoutError") {
        throw new HelpError(`The help service did not answer within ${Math.round(timeoutMs / 1000)}s. Try again, or read https://cbrowser.ai/docs`);
      }
      lastNetworkError = e;
      continue;
    }

    const where = new URL(target.url).host;
    if (res.status === 429) {
      const retry = res.headers.get("Retry-After");
      throw new HelpError(`The help service is rate-limited${retry ? `; try again in ${retry}s` : ""}. The docs are at https://cbrowser.ai/docs`, 429);
    }
    if (!res.ok) {
      let detail = "";
      try { detail = ((await res.json()) as { error?: string }).error ?? ""; } catch { /* not JSON */ }
      throw new HelpError(`The help service answered ${res.status}${detail ? `: ${detail}` : ""}`, res.status);
    }
    const data = (await res.json()) as { answer?: unknown; sources?: unknown };
    if (typeof data.answer !== "string") throw new HelpError("The help service sent no answer");
    return {
      question,
      answer: data.answer,
      sources: Array.isArray(data.sources) ? data.sources.filter((s): s is string => typeof s === "string") : [],
      answeredBy: where,
    };
  }

  throw new HelpError(`Could not reach the help service (${(lastNetworkError as Error)?.message ?? "no route"}). The docs are at https://cbrowser.ai/docs`);
}
