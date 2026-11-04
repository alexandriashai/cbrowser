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
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { scopedDataDir } from "../persona-scope.js";

export type HostedRefusal = { isError: true; content: Array<{ type: "text"; text: string }> };

function privateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** The eight 16-bit groups of an IPv6 address (a trailing dotted IPv4 part allowed), or null. */
function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/%.*$/, "");
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (dotted) {
    if (isIP(dotted[1]) !== 4) return null;
    const [a, b, c, d] = dotted[1].split(".").map(Number);
    s = s.slice(0, -dotted[1].length) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...tail].map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return groups.length === 8 && groups.every((g) => g >= 0) ? groups : null;
}

/**
 * An address on this machine or a private, shared or link-local network.
 *
 * An IPv4 address written inside IPv6 is judged as that IPv4 address. Only a
 * dotted "::ffff:" prefix used to be stripped, and the URL parser writes
 * [::ffff:127.0.0.1] as [::ffff:7f00:1], so loopback in that form passed as
 * public and reached the 127.0.0.1 forwarders (review, 2026-11-04).
 */
function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return privateV4(ip);
  const g = v6Groups(ip);
  if (!g) return true;
  // ::a.b.c.d (compatible, so :: and ::1 too), ::ffff:a.b.c.d (mapped), 64:ff9b::a.b.c.d (NAT64).
  const embedded = (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0 || g[5] === 0xffff)) ||
    (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0));
  if (embedded) return privateV4(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
  // Unique local fc00::/7, link-local fe80::/10, site-local fec0::/10, multicast ff00::/8.
  return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0 || (g[0] & 0xff00) === 0xff00;
}

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

/**
 * Only an omitted parameter names no path. "" and null used to count as
 * omitted too, but call sites test `!== undefined`: capture_start then ran
 * resolve(""), which is the process's working directory, and wrote root-owned
 * output there, outside the recordings directory. An empty array is the one
 * exception, because it holds no path at all: coverage_map's required
 * testFiles: [] is how a hosted caller gets the page inventory.
 * (sec-paths, 2026-10-10)
 */
function provided(value: unknown): boolean {
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Refuse a parameter that names a server file or directory. Returns null when
 * not hosted or when the parameter was omitted (undefined); anything else, ""
 * and null included, is refused, and the caller returns the refusal before
 * doing any work.
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

/** Every address a name resolves to. A parameter so tests can answer as a rebinding name would. */
export type ProxyResolver = (host: string) => Promise<string[]>;
const lookupAll: ProxyResolver = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

/** A proxy parameter as a URL, its bare host, and the addresses the host stands for (none when it cannot be read). */
async function proxyAddresses(text: string, resolve: ProxyResolver): Promise<{ url?: URL; host: string; addresses: string[] }> {
  let url: URL | undefined;
  let host = "";
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`);
    host = url.hostname.replace(/^\[(.*)\]$/, "$1");
  } catch { /* refused by the caller */ }
  let addresses: string[] = [];
  if (host && isIP(host)) addresses = [host];
  else if (host && host.toLowerCase() !== "localhost") {
    try { addresses = await resolve(host); } catch { /* refused by the caller */ }
  }
  return { url, host, addresses };
}

function proxyNotAllowed(tool: string, message: string): HostedRefusal {
  return refusal({ error: "proxy_not_allowed", tool, parameter: "proxy", message });
}

/**
 * Refuse a caller's proxy that points at this server or its network. The proxy
 * forwarders that hold the operator's residential login listen on 127.0.0.1
 * (proxy-forwarder.ts) and serve every process of their user, which on the
 * hosted servers is every account's: a caller who named 127.0.0.1:<port> as
 * its proxy would have used another account's login (found 2026-11-02). A host
 * name is resolved and refused when any address is private. This only checks;
 * a tool that opens a browser through the proxy uses pinHostedProxy, which also
 * makes the browser connect to the address checked.
 */
export async function refuseHostedProxy(tool: string, proxy: unknown, resolve: ProxyResolver = lookupAll): Promise<HostedRefusal | null> {
  if (!hostedMode || proxy === undefined || proxy === null || proxy === "") return null;
  const { addresses } = await proxyAddresses(String(proxy), resolve);
  if (addresses.length === 0 || addresses.some(privateAddress)) {
    return proxyNotAllowed(tool, `${tool}: proxy must be a public host on the hosted server, not this machine or a private network.`);
  }
  return null;
}

/**
 * refuseHostedProxy, then the proxy with its host replaced by the address that
 * was checked, so the browser (or the forwarder in front of a login) connects
 * there and does not resolve the name again. Without it a name could answer
 * with a public address for the check and with 127.0.0.1 a moment later, when
 * the browser connected (DNS rebinding: P-10, raised again by the security
 * review of 2026-11-04, because cognitive_effort would have added a second
 * route). An https:// proxy given by name is refused: its certificate names the
 * host, so the address cannot stand in for it. Not hosted, omitted, or given by
 * IP address: the proxy comes back as it was.
 */
export async function pinHostedProxy(
  tool: string,
  proxy: string | undefined,
  resolve: ProxyResolver = lookupAll,
): Promise<{ ok: true; proxy: string | undefined } | { ok: false; result: HostedRefusal }> {
  if (!hostedMode || !proxy) return { ok: true, proxy };
  const { url, host, addresses } = await proxyAddresses(proxy, resolve);
  if (!url || addresses.length === 0 || addresses.some(privateAddress)) {
    return { ok: false, result: proxyNotAllowed(tool, `${tool}: proxy must be a public host on the hosted server, not this machine or a private network.`) };
  }
  if (isIP(host)) return { ok: true, proxy };
  if (url.protocol === "https:") {
    return { ok: false, result: proxyNotAllowed(tool, `${tool}: on the hosted server an https:// proxy must be given by IP address. The server connects to the address it checked, and an https proxy's certificate names its host. An http:// or socks5:// proxy can be given by name.`) };
  }
  const address = addresses[0];
  url.hostname = isIP(address) === 6 ? `[${address}]` : address;
  return { ok: true, proxy: url.toString() };
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
