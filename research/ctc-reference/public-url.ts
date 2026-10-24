/**
 * The published form of a crawled URL: session-bound query parameters removed.
 *
 * The reference's outcome list (src/data/ctc-reference-v2-*.ts, written by
 * assemble-v2.ts) publishes every attempted page's url and finalUrl. A few of
 * them carry values a site minted for the crawler's own browser session: an
 * OAuth state, nonce or PKCE challenge on a sign-in redirect, a Cloudflare
 * challenge token, an anti-bot session blob, a per-visit id. None belongs to a
 * person, but a session value is not something to publish, and the page is
 * the same page without it, so the parameter is removed and the page's own
 * URL is what is published.
 *
 * Removed: a parameter named for a session, token, signature, OAuth state,
 * nonce, PKCE challenge, visit or Cloudflare (cf_*, __cf_chl_*), and any
 * parameter whose value is a UUID or a long hex string (a per-visit id,
 * whatever it is called). Kept, byte for byte: everything else, including
 * public app ids (client_id), campaign labels, the query a search page was
 * loaded with (?s=help), and a ServiceNow record id (sys_id, sys_kb_id: the
 * article a site's own link names, the same for every visitor, and the only
 * way to load that page again).
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

/** Parameter names whose value is session-bound by what they are. */
const SESSION_NAME = /^(state|nonce|code_challenge|code_verifier|x5secdata|dsh|jsessionid|phpsessid|sessionid|session|sid|ticket|sig|signature|csrf|_csrf|csrf_token|authenticity_token|access_token|id_token|refresh_token|auth|authtoken)$/i;
/** ... and names that say so in part: any *token*, *sessid* or visit id, any Cloudflare parameter. */
const SESSION_PART = /token|sessid|visit_?id|visitor_?id|^_*cf_/i;
/** A per-visit id, whatever its name: a UUID or 32+ hex digits. */
const VISIT_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32,})$/i;
/** A ServiceNow record id: 32 hex digits that name a page, not a visit. */
const RECORD_ID = /^sys_(?:kb_)?id$/i;

/** Whether this parameter is not published. */
export function isSessionParam(name: string, value: string): boolean {
  if (RECORD_ID.test(name)) return false;
  return SESSION_NAME.test(name) || SESSION_PART.test(name) || VISIT_ID.test(value);
}

/**
 * The URL without its session-bound query parameters, or the URL unchanged
 * when it has none (or does not parse). The parameters that stay keep their
 * original spelling and order; a query left empty is dropped with its "?".
 * Idempotent.
 */
export function publicUrl(url: string): string {
  let u: URL;
  try { u = new URL(url); } catch { return url; }
  if (!u.search) return url;
  const segments = u.search.slice(1).split("&");
  const kept = segments.filter((segment) => {
    const [pair] = [...new URLSearchParams(segment)];
    return !pair || !isSessionParam(pair[0], pair[1]);
  });
  if (kept.length === segments.length) return url;
  u.search = kept.length ? `?${kept.join("&")}` : "";
  return u.toString();
}
