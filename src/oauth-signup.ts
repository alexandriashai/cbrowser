/**
 * Sign-in and sign-up for the hosted server's OAuth flow.
 *
 * Until 2026-11-23 /authorize only signed in an existing account, and only for
 * the claude.ai and claude.com callbacks: no other MCP client could connect,
 * because the server had no client registration and refused every other
 * redirect_uri. A Claude Code plugin user had to create an account on
 * cbrowser.ai, make an API key and put it in an environment variable.
 *
 * Now:
 * - POST /register (RFC 7591) gives any MCP client a client_id. It accepts only
 *   the callbacks the server already trusted plus loopback addresses (RFC 8252):
 *   a code sent to 127.0.0.1 can only reach a listener on the user's own
 *   machine, and /token requires the PKCE verifier of the client that started
 *   the flow. Any other https callback is still refused: an attacker-chosen
 *   callback is how a sign-in link handed over an account's key (2026-09-05).
 * - /authorize can create the account on the spot: email, then the emailed
 *   6-digit code with a name and password. It uses the CMS's own verified
 *   sign-up (send-code, verify-code, register), which returns a funded Free
 *   account and its first key, so nothing about accounts is decided here.
 *
 * Registration stores nothing: the client_id carries the registered callbacks
 * and client name, signed with a key derived from a server secret, and a loopback
 * callback is accepted only with a client_id that registered it (any port, as
 * RFC 8252 section 7.3 allows; same host and path). Without that binding any
 * phishing link could name a loopback callback, and a process listening on the
 * victim's machine would receive the code. Claude's own two callbacks need no
 * registration, as before. The page says when a program on this computer is
 * asking, and on which port.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** RFC 8252 loopback callback: plain http to a loopback host, any port and path. */
export function isLoopbackRedirect(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.protocol !== "http:") return false;
  if (u.username || u.password || u.hash) return false;
  return u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]";
}

/** A callback registration may list: an exact allowlisted URL, or loopback. */
export function isRegistrableRedirect(uri: string, allowlist: readonly string[]): boolean {
  return uri !== "" && (allowlist.includes(uri) || isLoopbackRedirect(uri));
}

/** RFC 8252 section 7.3: a loopback callback matches a registered one on any port. */
export function loopbackMatches(registered: string, requested: string): boolean {
  if (!isLoopbackRedirect(registered) || !isLoopbackRedirect(requested)) return false;
  const a = new URL(registered);
  const b = new URL(requested);
  return a.hostname === b.hostname && a.pathname === b.pathname && a.search === b.search;
}

// ---------------------------------------------------------------------------
// Signed client ids
// ---------------------------------------------------------------------------

let processKey: Buffer | undefined;

/**
 * The key client ids are signed with: derived from OAUTH_CLIENT_KEY, else from
 * CMS_INTERNAL_SECRET (set on every hosted server), so registrations survive a
 * restart. With neither, a random key per process: clients then register again
 * after a restart.
 */
export function oauthClientKey(env: Record<string, string | undefined> = process.env): Buffer {
  const secret = env.OAUTH_CLIENT_KEY || env.CMS_INTERNAL_SECRET;
  if (secret) return createHash("sha256").update(`cbrowser-oauth-client-id:${secret}`).digest();
  processKey ??= randomBytes(32);
  return processKey;
}

export interface ClientRecord {
  /** Registered callbacks. */
  u: string[];
  /** The client's own name for itself. Chosen by the client, so never proof of who it is. */
  n?: string;
}

export function encodeClientId(rec: ClientRecord, key: Buffer): string {
  const body = Buffer.from(JSON.stringify(rec)).toString("base64url");
  const mac = createHmac("sha256", key).update(body).digest("base64url");
  return `cbc_${body}.${mac}`;
}

export function decodeClientId(id: string, key: Buffer): ClientRecord | null {
  if (!id.startsWith("cbc_")) return null;
  const dot = id.lastIndexOf(".");
  if (dot < 0) return null;
  const body = id.slice(4, dot);
  const mac = Buffer.from(id.slice(dot + 1), "base64url");
  const expected = createHmac("sha256", key).update(body).digest();
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;
  try {
    const rec = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ClientRecord;
    if (!Array.isArray(rec.u) || !rec.u.every((u) => typeof u === "string")) return null;
    return rec;
  } catch {
    return null;
  }
}

export type RedirectCheck =
  | { ok: false }
  | { ok: true; loopback: false }
  | { ok: true; loopback: true; clientName?: string; port: string };

/**
 * Whether /authorize may send a code to this callback: one of Claude's exact
 * callbacks, or a loopback callback the signed client_id registered.
 */
export function checkRedirect(uri: string, clientId: string, allowlist: readonly string[], key: Buffer): RedirectCheck {
  if (uri !== "" && allowlist.includes(uri)) return { ok: true, loopback: false };
  if (!isLoopbackRedirect(uri)) return { ok: false };
  const rec = decodeClientId(clientId, key);
  if (!rec || !rec.u.some((r) => loopbackMatches(r, uri))) return { ok: false };
  return { ok: true, loopback: true, clientName: rec.n, port: new URL(uri).port || "80" };
}

export interface RegistrationResult {
  status: number;
  body: Record<string, unknown>;
}

const MAX_REDIRECT_URIS = 10;
const MAX_URI_LENGTH = 512;
const MAX_CLIENT_NAME = 100;

/**
 * RFC 7591 dynamic client registration. Every client is registered as a public
 * PKCE client: a different token_endpoint_auth_method or grant_types in the
 * request is answered with the values the server uses, which RFC 7591 section
 * 3.2.1 allows, rather than refused, so a client asking for more still connects.
 * Only the callbacks are a reason to refuse. Pure apart from the key.
 */
export function registerOAuthClient(metadata: unknown, allowlist: readonly string[], key: Buffer, now: () => number = Date.now): RegistrationResult {
  const invalid = (error: string, description: string): RegistrationResult => ({
    status: 400,
    body: { error, error_description: description },
  });
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return invalid("invalid_client_metadata", "The request body must be a JSON object.");
  }
  const m = metadata as Record<string, unknown>;
  const uris = m.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAX_REDIRECT_URIS) {
    return invalid("invalid_redirect_uri", `redirect_uris must list 1 to ${MAX_REDIRECT_URIS} callback URLs.`);
  }
  for (const uri of uris) {
    if (typeof uri !== "string" || uri.length > MAX_URI_LENGTH || !isRegistrableRedirect(uri, allowlist)) {
      return invalid(
        "invalid_redirect_uri",
        "Only loopback callbacks (http://127.0.0.1, http://localhost, http://[::1], any port) and Claude's own callbacks are accepted.",
      );
    }
  }
  // Control characters dropped: the name is shown on the sign-in page.
  const printable = (s: string) => Array.from(s).filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127).join("");
  const name = typeof m.client_name === "string" ? printable(m.client_name).slice(0, MAX_CLIENT_NAME) || undefined : undefined;
  return {
    status: 201,
    body: {
      client_id: encodeClientId(name ? { u: uris as string[], n: name } : { u: uris as string[] }, key),
      client_id_issued_at: Math.floor(now() / 1000),
      ...(name ? { client_name: name } : {}),
      redirect_uris: uris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  };
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export type AuthorizeMode = "signin" | "signup-email" | "signup-code";

export interface OAuthParams {
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  clientId: string;
}

export interface AuthorizePageOptions {
  mode: AuthorizeMode;
  oauth: OAuthParams;
  email?: string;
  name?: string;
  error?: string;
  notice?: string;
  /** Set when the code will go to a program on this computer (a loopback callback). */
  localClient?: { clientName?: string; port: string };
}

/**
 * The messages a redirect back to /authorize may show, by code. The page used to
 * print whatever ?error= said, so a link could put "Your account is suspended,
 * call ..." in a red box on the genuine sign-in page.
 */
export const AUTHORIZE_ERRORS: Readonly<Record<string, string>> = {
  missing: "Enter your email and password.",
  invalid_login: "That email and password do not match.",
  invalid_key: "That API key is not valid.",
  max_keys: "This account has the most API keys it can have. Delete one you no longer use at cbrowser.ai/account, then try again.",
  unavailable: "The account service is unavailable. Try again in a minute.",
};

export function authorizeErrorMessage(code: string | null | undefined): string | undefined {
  return code && Object.hasOwn(AUTHORIZE_ERRORS, code) ? AUTHORIZE_ERRORS[code] : undefined;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** The OAuth parameters as hidden fields, so every step carries them forward. */
function hiddenOAuth(o: OAuthParams): string {
  return [
    ["redirect_uri", o.redirectUri],
    ["state", o.state],
    ["code_challenge", o.codeChallenge],
    ["code_challenge_method", o.codeChallengeMethod],
    ["client_id", o.clientId],
  ]
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(v)}">`)
    .join("\n    ");
}

/** A link to /authorize in another mode, keeping the OAuth parameters. */
export function authorizeHref(o: OAuthParams, mode: AuthorizeMode, email = ""): string {
  const q = new URLSearchParams({
    redirect_uri: o.redirectUri,
    state: o.state,
    code_challenge: o.codeChallenge,
    code_challenge_method: o.codeChallengeMethod,
    client_id: o.clientId,
  });
  if (mode !== "signin") q.set("mode", "signup");
  if (email) q.set("email", email);
  return `/authorize?${q.toString()}`;
}

const STYLE = `
  body { font-family: -apple-system, system-ui, sans-serif; background: #0a0a0a; color: #e5e5e5; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 16px; box-sizing: border-box; }
  .card { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 32px; width: 100%; max-width: 400px; box-sizing: border-box; }
  h1 { font-size: 24px; margin: 0 0 8px; color: #60a5fa; }
  p { color: #a3a3a3; font-size: 14px; margin: 0 0 24px; line-height: 1.5; }
  label { display: block; font-size: 13px; color: #d4d4d4; margin-bottom: 6px; }
  input { width: 100%; padding: 10px 12px; background: #0a0a0a; border: 1px solid #525252; border-radius: 8px; color: #e5e5e5; font-size: 16px; margin-bottom: 16px; box-sizing: border-box; }
  input:focus-visible { outline: 2px solid #60a5fa; outline-offset: 1px; }
  button { width: 100%; padding: 12px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; }
  button:hover { background: #1d4ed8; }
  button:focus-visible, a:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
  .error { background: #3b1111; border: 1px solid #7f1d1d; color: #fecaca; padding: 10px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
  .notice { background: #0c1f3d; border: 1px solid #1e3a8a; color: #bfdbfe; padding: 10px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
  .switch { text-align: center; margin-top: 16px; font-size: 14px; color: #a3a3a3; }
  .switch a { color: #93c5fd; }
  .hint { font-size: 12px; color: #a3a3a3; margin: -10px 0 16px; }
`;

/** The /authorize page in one of its three steps. Every value is escaped. */
export function renderAuthorizePage(opts: AuthorizePageOptions): string {
  const { mode, oauth } = opts;
  const email = escapeHtml(opts.email ?? "");
  const name = escapeHtml(opts.name ?? "");
  const alert = opts.error
    ? `<div class="error" role="alert">${escapeHtml(opts.error)}</div>`
    : opts.notice
      ? `<div class="notice" role="status">${escapeHtml(opts.notice)}</div>`
      : "";
  const local = opts.localClient
    ? `<div class="notice" role="note">A program on this computer (port ${escapeHtml(opts.localClient.port)})${
        opts.localClient.clientName ? `, which calls itself "${escapeHtml(opts.localClient.clientName)}",` : ""
      } is asking to connect to your CBrowser account. Continue only if you started this yourself, just now.</div>`
    : "";

  let heading: string;
  let intro: string;
  let fields: string;
  let action: string;
  let button: string;
  let footer: string;
  if (mode === "signin") {
    heading = "Sign in to CBrowser";
    intro = "Connect your CBrowser account to your AI assistant.";
    action = "signin";
    fields = `<label for="email">Email</label>
    <input type="email" id="email" name="email" required autocomplete="email" value="${email}"${email ? "" : " autofocus"}>
    <label for="password">Password or API key</label>
    <input type="password" id="password" name="password" required autocomplete="current-password"${email ? " autofocus" : ""}>`;
    button = "Sign in and connect";
    footer = `No account yet? <a href="${escapeHtml(authorizeHref(oauth, "signup-email", opts.email ?? ""))}">Create a free account</a>`;
  } else if (mode === "signup-email") {
    heading = "Create a free CBrowser account";
    intro = "We will email you a 6-digit code to confirm the address. The Free plan includes credits to start; no card needed.";
    action = "send-code";
    fields = `<label for="email">Email</label>
    <input type="email" id="email" name="email" required autocomplete="email" value="${email}" autofocus>`;
    button = "Email me a code";
    footer = `Already have an account? <a href="${escapeHtml(authorizeHref(oauth, "signin", opts.email ?? ""))}">Sign in</a>`;
  } else {
    heading = "Finish creating your account";
    intro = `Enter the 6-digit code we sent to ${email}. It expires in 10 minutes.`;
    action = "register";
    fields = `<input type="hidden" name="email" value="${email}">
    <label for="code">Code</label>
    <input type="text" id="code" name="code" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" autofocus>
    <label for="name">Your name</label>
    <input type="text" id="name" name="name" required maxlength="100" autocomplete="name" value="${name}">
    <label for="password">Choose a password</label>
    <input type="password" id="password" name="password" required minlength="8" autocomplete="new-password" aria-describedby="password-hint">
    <div class="hint" id="password-hint">At least 8 characters.</div>`;
    button = "Create account and connect";
    footer = `Wrong address or no code? <a href="${escapeHtml(authorizeHref(oauth, "signup-email", opts.email ?? ""))}">Send a new code</a>`;
  }

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CBrowser - ${escapeHtml(heading)}</title>
<style>${STYLE}</style></head><body>
<main class="card">
  <h1>${escapeHtml(heading)}</h1>
  <p>${intro}</p>
  ${local}
  ${alert}
  <form method="POST" action="/authorize">
    <input type="hidden" name="action" value="${action}">
    ${hiddenOAuth(oauth)}
    ${fields}
    <button type="submit">${button}</button>
  </form>
  <div class="switch">${footer}</div>
</main>
</body></html>`;
}

// ---------------------------------------------------------------------------
// The CMS calls for sign-up
// ---------------------------------------------------------------------------

type Fetch = typeof fetch;

async function cmsPost(doFetch: Fetch, cmsUrl: string, path: string, body: unknown, timeoutMs: number): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await doFetch(`${cmsUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  let data: Record<string, unknown> = {};
  try {
    const parsed = await res.json();
    if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
  } catch {
    /* a non-JSON answer is reported by status alone */
  }
  return { status: res.status, data };
}

const message = (data: Record<string, unknown>, fallback: string) =>
  typeof data.error === "string" && data.error ? data.error : fallback;

export type SendCodeResult = { ok: true } | { ok: false; alreadyRegistered: boolean; message: string };

/** Ask the CMS to email a sign-up code. Throws only on a network failure. */
export async function sendSignupCode(cmsUrl: string, email: string, timeoutMs: number, doFetch: Fetch = fetch): Promise<SendCodeResult> {
  const r = await cmsPost(doFetch, cmsUrl, "/api/accounts/send-code", { email }, timeoutMs);
  if (r.status === 200) return { ok: true };
  if (r.status === 409) return { ok: false, alreadyRegistered: true, message: "That email already has a CBrowser account. Sign in with it instead." };
  return { ok: false, alreadyRegistered: false, message: message(r.data, "The code could not be sent. Try again.") };
}

export type RegisterResult = { ok: true; apiKey: string } | { ok: false; message: string };

/**
 * Create the account. The code goes with the registration: the CMS checks it
 * there (5 wrong tries burn it) and keeps it valid until an account is made, so
 * a retry after a refused password reuses it. A CMS from before that change
 * ignores the code and answers 403 until the email is verified; then the code is
 * verified separately and register tried once more. Throws only on a network failure.
 */
export async function registerAccount(
  cmsUrl: string,
  input: { email: string; code: string; name: string; password: string },
  timeoutMs: number,
  doFetch: Fetch = fetch,
): Promise<RegisterResult> {
  const account = { email: input.email, password: input.password, name: input.name, code: input.code };
  let r = await cmsPost(doFetch, cmsUrl, "/api/accounts/register", account, timeoutMs);
  if (r.status === 403) {
    const v = await cmsPost(doFetch, cmsUrl, "/api/accounts/verify-code", { email: input.email, code: input.code }, timeoutMs);
    if (v.status !== 200) return { ok: false, message: message(v.data, "That code is wrong or has expired.") };
    r = await cmsPost(doFetch, cmsUrl, "/api/accounts/register", account, timeoutMs);
  }
  if (r.status === 201 && typeof r.data.apiKey === "string" && r.data.apiKey.startsWith("cbk_")) {
    return { ok: true, apiKey: r.data.apiKey };
  }
  if (r.status === 409) return { ok: false, message: "That email already has a CBrowser account. Sign in with it instead." };
  return { ok: false, message: message(r.data, "The account could not be created. Try again.") };
}
