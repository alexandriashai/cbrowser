/**
 * CBrowser MCP Tools - Hosted-transport input policy
 *
 * Both hosted servers (demo :3000, enterprise :3100) run startRemoteMcpServer
 * as root and serve many accounts from one process. On that transport a tool
 * parameter naming a server path asks the host to read or write its own disk
 * with root's rights for whoever holds a key, and a URL parameter with a
 * non-web scheme asks the server's browser to open something that is not a web
 * page. The 2026-10-10 security review (workstream sec-paths) found both: path
 * parameters on nl_test_file, upload_file, transport_map, coverage_map,
 * screenshot and capture_start, plus security_audit's config_path, and no
 * scheme check on navigate or any other URL parameter.
 *
 * The policy is a flag that startRemoteMcpServer sets explicitly. It is never
 * inferred from the environment: isRemoteMcpMode() in screenshot-utils sniffs
 * PORT, which a local run can carry by accident. The stdio server
 * (mcp-server.ts) and the CLI run on the caller's own machine, never set the
 * flag, and keep every option.
 *
 * Default is refusal. Only a tool that does nothing without its path parameter
 * and whose input can legitimately live in the calling account's own data
 * directory (scopedDataDir) is confined there instead, by realpath containment.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */

import { realpathSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { scopedDataDir } from "../persona-scope.js";

export type HostedRefusal = { isError: true; content: Array<{ type: "text"; text: string }> };

let hostedMode = false;

/** Set by startRemoteMcpServer. Nothing else turns it on. */
export function setHostedMode(enabled: boolean): void {
  hostedMode = enabled;
}

export function isHostedMode(): boolean {
  return hostedMode;
}

function refusal(body: Record<string, unknown>): HostedRefusal {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }],
  };
}

function provided(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Refuse a parameter that names a server file or directory. Returns null when
 * not hosted or when the parameter was omitted; the caller returns the refusal
 * otherwise, before doing any work.
 *
 * @param instead how the caller gets the result without the parameter
 */
export function refuseHostedPath(tool: string, param: string, value: unknown, instead: string): HostedRefusal | null {
  if (!hostedMode || !provided(value)) return null;
  return refusal({
    error: "not_available_on_hosted_server",
    tool,
    parameter: param,
    message: `${tool}: the ${param} option is not available on the hosted server, because it names a file or directory on the server itself. ${instead}`,
  });
}

/**
 * Refuse a name the tool joins into a server path unless it is one plain path
 * component. "..", "." and anything with a separator would resolve outside the
 * directory the tool meant (site_profile_delete with domain ".." removed the
 * parent of site-profiles, i.e. the whole data directory).
 */
export function refuseHostedPathName(tool: string, param: string, value: unknown, instead: string): HostedRefusal | null {
  if (!hostedMode || value === undefined || value === null) return null;
  const s = String(value);
  if (s !== "" && s !== "." && s !== ".." && !/[/\\\0]/.test(s)) return null;
  return refusal({
    error: "not_available_on_hosted_server",
    tool,
    parameter: param,
    message: `${tool}: on the hosted server ${param} must be a plain name, not empty, "." or ".." and without "/" or "\\", because it becomes part of a file path on the server. ${instead}`,
  });
}

/** True for an absolute http: or https: URL. */
export function isWebUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function schemeOf(value: string): string {
  try {
    return new URL(value).protocol;
  } catch {
    return "(not an absolute URL)";
  }
}

/**
 * Refuse any URL parameter that is not http: or https:. Takes every URL
 * parameter of the call at once; array values are checked element by element.
 */
export function refuseHostedUrl(tool: string, params: Record<string, unknown>): HostedRefusal | null {
  if (!hostedMode) return null;
  for (const [param, value] of Object.entries(params)) {
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
      if (v === undefined || v === null || v === "") continue;
      const s = String(v);
      if (isWebUrl(s)) continue;
      return refusal({
        error: "url_scheme_not_allowed",
        tool,
        parameter: param,
        scheme: schemeOf(s),
        message: `${tool}: ${param} must be an absolute http: or https: URL on the hosted server.`,
      });
    }
  }
  return null;
}

/**
 * Browser-level backstop for CBrowser.navigate. Tool parameters are checked by
 * refuseHostedUrl, but URLs also reach the browser from inside free text
 * (nl_test_inline "go to ..." steps, repair_test, detect_flaky_tests), so the
 * navigation itself refuses too. about:blank stays allowed: the performance
 * and daemon code reset the page with it.
 */
export function assertHostedNavigable(url: string): void {
  if (!hostedMode || url === "about:blank" || isWebUrl(url)) return;
  throw new Error(`Navigation refused on the hosted server: only http: and https: URLs can be opened (got ${schemeOf(url)}).`);
}

/**
 * For a tool that does nothing without its path parameter: resolve each path
 * inside the calling account's data directory, symlinks resolved on both
 * sides, and refuse anything that lands outside it or does not exist. Not
 * hosted: the paths come back unchanged. Hosted without an account scope
 * (operator key): refused, because there is no directory that is the caller's.
 * Relative paths resolve against the account directory.
 */
export function confineToAccountDir(
  tool: string,
  param: string,
  paths: string[],
  instead = "",
): { ok: true; paths: string[] } | { ok: false; result: HostedRefusal } {
  if (!hostedMode) return { ok: true, paths };
  const refuse = (message: string) => ({
    ok: false as const,
    result: refusal({
      error: "path_outside_account_directory",
      tool,
      parameter: param,
      message: instead ? `${message} ${instead}` : message,
    }),
  });
  const dir = scopedDataDir();
  if (!dir) {
    return refuse(`${tool}: ${param} is not available on the hosted server without an account, because there is no account directory to read from.`);
  }
  let root: string;
  try {
    root = realpathSync(dir);
  } catch {
    return refuse(`${tool}: your account has no data directory on this server yet, so there is nothing ${param} can name.`);
  }
  const confined: string[] = [];
  for (const p of paths) {
    let real: string;
    try {
      real = realpathSync(isAbsolute(p) ? p : resolve(root, p));
    } catch {
      return refuse(`${tool}: ${param} names a file that does not exist in your account directory. On the hosted server only files in your own account directory can be used.`);
    }
    if (real !== root && !real.startsWith(root + sep)) {
      return refuse(`${tool}: ${param} must name a file inside your own account directory on the hosted server.`);
    }
    confined.push(real);
  }
  return { ok: true, paths: confined };
}
