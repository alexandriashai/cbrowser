/**
 * CBrowser - Cognitive Browser Automation
 * Copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com
 * Learn more at https://cbrowser.ai - MIT License
 */

/**
 * Plain-language messages for navigation failures.
 *
 * Reported: navigate("https://cbrowser.ai.invalid/") returned Playwright's raw
 * error,
 *
 *   page.goto: net::ERR_NAME_NOT_RESOLVED at https://cbrowser.ai.invalid/
 *   Call log:
 *     - navigating to "https://cbrowser.ai.invalid/", waiting until "load"
 *
 * which says what Chromium did, not what the caller should do, and carries a
 * Call log that is noise to anyone but a Playwright maintainer. navigate()
 * mapped only the proxy errors (ERR_TUNNEL / ERR_PROXY / ERR_NETWORK_CHANGED)
 * and rethrew everything else as is.
 *
 * Pure: no browser, no Playwright import, so any module that calls page.goto
 * can use it.
 */

/** net:: codes mapped to a sentence about the host. `{host}` is filled in. */
const NET_ERRORS: Array<{ code: RegExp; describe: (host: string, code: string) => string }> = [
  {
    code: /^ERR_NAME_NOT_RESOLVED$/,
    describe: (host) => `Could not resolve host ${host}. Check the URL spelling or network access. Nothing was loaded.`,
  },
  {
    code: /^ERR_CONNECTION_REFUSED$/,
    describe: (host) => `Connection to ${host} was refused: nothing is listening there, or a firewall rejected it. Check the address and port. Nothing was loaded.`,
  },
  {
    code: /^ERR_(CONNECTION_)?TIMED_OUT$/,
    describe: (host) => `Connection to ${host} timed out: the host did not answer. Check the address and network access. Nothing was loaded.`,
  },
  {
    code: /^ERR_ADDRESS_UNREACHABLE$/,
    describe: (host) => `Host ${host} is unreachable from this machine (no route to it). Check the address and network access. Nothing was loaded.`,
  },
  {
    code: /^ERR_INTERNET_DISCONNECTED$/,
    describe: (host) => `No network connection: could not reach ${host}. Nothing was loaded.`,
  },
  {
    code: /^ERR_(CONNECTION_RESET|CONNECTION_CLOSED|EMPTY_RESPONSE)$/,
    describe: (host) => `${host} closed the connection without sending a page. The server may be down or rejecting this client. Nothing was loaded.`,
  },
  {
    code: /^ERR_CERT_[A-Z_]+$/,
    describe: (host, code) => `The TLS certificate for ${host} was rejected (${certReason(code)}). Nothing was loaded.`,
  },
  {
    code: /^ERR_SSL_[A-Z_]+$/,
    describe: (host) => `A secure (TLS) connection to ${host} could not be established. Nothing was loaded.`,
  },
  {
    code: /^ERR_TOO_MANY_REDIRECTS$/,
    describe: (host) => `${host} redirected too many times (a redirect loop). Nothing was loaded.`,
  },
];

function certReason(code: string): string {
  if (code === "ERR_CERT_DATE_INVALID") return "expired or not yet valid";
  if (code === "ERR_CERT_COMMON_NAME_INVALID") return "issued for a different host name";
  if (code === "ERR_CERT_AUTHORITY_INVALID") return "issued by an untrusted authority, for example self-signed";
  if (code === "ERR_CERT_REVOKED") return "revoked";
  return "invalid";
}

/** host[:port] of `url`, or the url itself when it does not parse. */
function hostOf(url: string, message: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    const at = message.match(/ at (\S+)/)?.[1];
    if (at) {
      try { return new URL(at).host || at; } catch { return at; }
    }
    return url;
  }
}

/**
 * A plain-language message for a navigation error, or null when the error is
 * not one of the known net:: failures (the caller then keeps the original).
 *
 * The message names the host, says what to check, says nothing was loaded,
 * and ends with the net:: code in parentheses for anyone searching it. The
 * Playwright "Call log" is dropped.
 */
export function describeNavigationError(message: string, url: string): string | null {
  const code = message.match(/net::(ERR_[A-Z_]+)/)?.[1];
  if (!code) return null;
  const entry = NET_ERRORS.find((e) => e.code.test(code));
  if (!entry) return null;
  return `${entry.describe(hostOf(url, message), code)} (net::${code})`;
}

/**
 * The error to throw for a failed navigation: a new Error carrying
 * describeNavigationError's message when the failure is a known net:: code,
 * otherwise the original error unchanged.
 */
export function navigationError(error: unknown, url: string): unknown {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const described = describeNavigationError(message, url);
  return described ? new Error(described) : error;
}
