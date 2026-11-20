/**
 * What one browser start is given as its proxy and its WebRTC settings, what
 * a caller is told when the egress gate did not carry a page, and what the
 * remote server checks before it starts. No browser is started here.
 *
 * openBrowserRoute and webRtcGuard (src/proxy-forwarder.ts) decide whether a
 * hosted browser sits behind the egress gate. Their only behaviour tests sat
 * in tests/hosted-egress-browser.test.ts, a file the release gate leaves out
 * because it starts real browsers, so five source changes that take a hosted
 * browser off the gate passed everything the gate ran (review of 2026-11-12,
 * tests-1). They are here now, in a file that is not on
 * scripts/browser-tests.txt, and the last test in this file holds it there.
 *
 * The same review found that a page the gate does not carry was reported as
 * "the site is blocking proxies" over https and returned as a loaded page
 * over http (launch-wiring-1, regression-2, regression-3). The reading of the
 * gate's record that replaces both is in src/navigation-errors.ts and is
 * tested here against a real gate, with raw sockets as the browser. What the
 * three engines themselves do with it is in the browser file.
 *
 * Everything runs against 127.0.0.1 and 127.0.0.2. Names end in .test and are
 * answered by the injected resolver only. Linux only where it reads /proc for
 * the listeners this process holds.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { connect as netConnect, createServer as createNetServer, Server as NetServer } from "node:net";
import { readFileSync, readdirSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { cliSourceText } from "./cli-sources.js";

const LOOPBACK_SWITCH = "PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK";
const OWN_ENV = "CBROWSER_OWN_ADDRESSES";
const startEnv = { ...process.env };
for (const k of [OWN_ENV, LOOPBACK_SWITCH]) delete process.env[k];

const { setHostedMode, isHostedMode } = await import("../src/mcp-tools/hosted-inputs.js");
const { setEgressPolicyForTests, allowedEgressAddress, checkOwnAddressConfig, EGRESS_REFUSAL_REASON } = await import("../src/egress.js");
const { EGRESS_HEADER } = await import("../src/egress-gate.js");
const { openBrowserRoute, webRtcGuard, NO_WEBRTC_SCRIPT } = await import("../src/proxy-forwarder.js");
// Read off the module at each use, so that a function that is not there fails the test that needs it and not this file's import.
const navigation = await import("../src/navigation-errors.js") as unknown as Record<string, (...args: never[]) => unknown> & { EgressNavigationError: new (...args: never[]) => Error };
const remote = await import("../src/mcp-server-remote.js") as unknown as Record<string, (...args: never[]) => unknown>;
// Importing the module starts no browser: only its launch methods do.
const browserModule = await import("../src/browser.js") as unknown as Record<string, (...args: never[]) => unknown>;

type Why = "refused" | "unreachable" | "upstream";
type Gate = { failure?(host: string, port: number): Why | undefined } | null | undefined;
const gateTarget = (url: string) => navigation.gateTarget(url as never) as { host: string; port: number } | null;
const gateFailure = (gate: Gate, url: string) => navigation.gateFailure(gate as never, url as never) as Why | undefined;
const describeGateFailure = (why: "refused" | "unreachable", failed: string, asked?: string) => navigation.describeGateFailure(why as never, failed as never, asked as never) as string;
const gateNavigationError = (gate: Gate, failed: string, asked?: string) => navigation.gateNavigationError(gate as never, failed as never, asked as never) as (Error & { why: string; failedUrl: string }) | null;
const startupCheck = () => remote.hostedEgressStartupCheck() as string;

/** Nothing a caller is told about the gate may read as a proxy the site blocks. */
const PROXY_WORDS = /prox|vpn|anti-bot|tunnel|residential|geo region/i;

const S = "://";
/** The upstream proxy of the chained cases. The route only needs its address: nothing here sends a request through it. */
let upstream: ReturnType<typeof createNetServer>;
let upstreamPort = 0;
/** A port on 127.0.0.2 where something listened a moment ago and nothing does now. */
let deadPort = 0;
const UP_USER = "up-user";
const UP_PASS = "up-s3cret";
const upstreamProxy = (extra: Record<string, unknown> = {}) => ({ server: `http${S}127.0.0.1:${upstreamPort}`, username: UP_USER, password: UP_PASS, ...extra });

/** Names the injected resolver answers. Any other name does not resolve: nothing here asks real DNS. */
const NAMES: Record<string, string[]> = {
  "allowed.test": ["127.0.0.2"],
  "refused.test": ["127.0.0.1"],
};
/** The real decision, plus 127.0.0.2. */
const policy = {
  resolve: async (host: string): Promise<string[]> => {
    const answer = NAMES[host];
    if (!answer) throw new Error("not a name this test knows");
    return answer;
  },
  allow: (ip: string): boolean => ip === "127.0.0.2" || allowedEgressAddress(ip),
};

beforeAll(async () => {
  upstream = createNetServer((client) => {
    client.on("error", () => { /* nobody is expected */ });
    client.destroy();
  });
  await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", () => r()));
  upstreamPort = (upstream.address() as { port: number }).port;
  const once = createNetServer();
  await new Promise<void>((r) => once.listen(0, "127.0.0.2", () => r()));
  deadPort = (once.address() as { port: number }).port;
  await new Promise<void>((r) => once.close(() => r()));
  setEgressPolicyForTests(policy);
});

afterEach(() => {
  setHostedMode(false);
  delete process.env[LOOPBACK_SWITCH];
  if (OWN_ENV in process.env) {
    delete process.env[OWN_ENV];
    // The own-address set is remembered for 30 seconds: read it again without the test's entries.
    checkOwnAddressConfig();
  }
});

afterAll(async () => {
  setEgressPolicyForTests(null);
  setHostedMode(false);
  await new Promise<void>((r) => upstream.close(() => r()));
  for (const k of [OWN_ENV, LOOPBACK_SWITCH]) {
    if (k in startEnv) process.env[k] = startEnv[k];
    else delete process.env[k];
  }
  checkOwnAddressConfig();
});

async function hosted<T>(fn: () => Promise<T>): Promise<T> {
  setHostedMode(true);
  try {
    return await fn();
  } finally {
    setHostedMode(false);
  }
}

/** The TCP listeners this process holds, as /proc/net/tcp writes their addresses. Other processes' listeners are not counted. */
function ownListeners(): string[] {
  const inodes = new Set<string>();
  for (const fd of readdirSync("/proc/self/fd")) {
    try {
      const m = /^socket:\[(\d+)\]$/.exec(readlinkSync(`/proc/self/fd/${fd}`));
      if (m) inodes.add(m[1]);
    } catch { /* closed between the listing and the read */ }
  }
  const rows: string[] = [];
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let table = "";
    try { table = readFileSync(file, "utf8"); } catch { /* no IPv6 table */ }
    for (const line of table.split("\n").slice(1)) {
      const cols = line.trim().split(/\s+/);
      if (cols[3] === "0A" && inodes.has(cols[9])) rows.push(cols[1]);
    }
  }
  return rows.sort();
}

/**
 * The listeners this process holds now that it did not hold at `before`.
 * This file runs in one process with the rest of the release gate's files,
 * so a listener another file left behind may close while a test here runs:
 * only what was added is counted.
 */
function added(before: string[]): string[] {
  const left = [...before];
  return ownListeners().filter((row) => {
    const at = left.indexOf(row);
    if (at < 0) return true;
    left.splice(at, 1);
    return false;
  });
}

/** Wait (up to 3 s) for nothing to be added any more: a closed server leaves the table a moment later. */
async function addedSettles(before: string[]): Promise<string[]> {
  for (let i = 0; i < 30; i++) {
    if (added(before).length === 0) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  return added(before);
}

/** Make every net server in this process fail to listen, as when no port or descriptor is left, until the returned function is called. */
function breakListen(): () => void {
  const real = NetServer.prototype.listen;
  NetServer.prototype.listen = function (this: NetServer) {
    queueMicrotask(() => this.emit("error", new Error("listen refused (test)")));
    return this;
  } as typeof real;
  return () => { NetServer.prototype.listen = real; };
}

/** One request to the gate over a raw socket, as a browser sends it; the status line, headers and body of the answer. */
async function ask(gate: string, head: string): Promise<{ status: number; mark: string | undefined; body: string }> {
  const port = Number(new URL(gate).port);
  return await new Promise((resolve, reject) => {
    const socket = netConnect(port, "127.0.0.1");
    let text = "";
    const done = (): void => {
      const [top, ...rest] = text.split("\r\n\r\n");
      const lines = top.split("\r\n");
      const mark = lines.find((l) => l.toLowerCase().startsWith(`${EGRESS_HEADER.toLowerCase()}:`))?.split(":")[1].trim();
      resolve({ status: Number(lines[0].split(" ")[1]), mark, body: rest.join("\r\n\r\n") });
    };
    const limit = setTimeout(() => { socket.destroy(); reject(new Error("the gate did not answer")); }, 15_000);
    socket.on("connect", () => socket.write(head));
    socket.on("data", (chunk) => { text += chunk.toString("latin1"); });
    socket.on("error", reject);
    socket.on("close", () => { clearTimeout(limit); done(); });
  });
}
const connectTo = (gate: string, authority: string) => ask(gate, `CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
const getPlain = (gate: string, url: string) => ask(gate, `GET ${url} HTTP/1.1\r\nHost: ${new URL(url).host}\r\nConnection: close\r\n\r\n`);

describe("the fixtures", () => {
  test("only 127.0.0.2 is added to the real decision, and hosted mode is off between tests", () => {
    expect(policy.allow("127.0.0.1")).toBe(false);
    expect(policy.allow("::1")).toBe(false);
    expect(policy.allow("127.0.0.2")).toBe(true);
    expect(isHostedMode()).toBe(false);
  });
});

describe("the route a launch gets (openBrowserRoute)", () => {
  test("not hosted: no proxy means no proxy, no forwarder and no listener", async () => {
    const before = ownListeners();
    expect(await openBrowserRoute(undefined)).toStrictEqual({ proxy: undefined, forwarder: null, gated: false });
    expect(added(before)).toEqual([]);
  });

  test("not hosted: a proxy without a login goes to the browser as configured, bypass list included", async () => {
    const before = ownListeners();
    const route = await openBrowserRoute({ server: `http${S}127.0.0.1:9`, bypass: ["a.test", "127.0.0.1"] });
    expect(route).toStrictEqual({ proxy: { server: `http${S}127.0.0.1:9`, username: undefined, password: undefined, bypass: "a.test,127.0.0.1" }, forwarder: null, gated: false });
    const socks = await openBrowserRoute({ server: `socks5${S}127.0.0.1:9`, username: "u", bypass: ["a.test"] });
    expect(socks).toStrictEqual({ proxy: { server: `socks5${S}127.0.0.1:9`, username: "u", password: undefined, bypass: "a.test" }, forwarder: null, gated: false });
    expect(added(before)).toEqual([]);
  });

  test("not hosted: an http proxy with a login is put behind the forwarder, and keeps its bypass list", async () => {
    const before = ownListeners();
    const route = await openBrowserRoute(upstreamProxy({ bypass: ["a.test"] }));
    try {
      expect(route.gated).toBe(false);
      expect(route.forwarder).not.toBeNull();
      expect(route.proxy).toStrictEqual({ server: route.forwarder!.server, bypass: "a.test" });
      expect(route.proxy!.server).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(route.proxy!.server).not.toBe(`http${S}127.0.0.1:${upstreamPort}`);
      // One listener, the forwarder's: the gate has two.
      expect(added(before).length).toBe(1);
      // The forwarder keeps no record of failures: only the gate is asked why.
      expect(route.forwarder!.failure).toBeUndefined();
    } finally {
      await route.forwarder?.close();
    }
    expect(await addedSettles(before)).toEqual([]);
  });

  test("not hosted: Playwright's loopback switch changes nothing", async () => {
    process.env[LOOPBACK_SWITCH] = "1";
    expect(await openBrowserRoute(undefined)).toStrictEqual({ proxy: undefined, forwarder: null, gated: false });
  });

  test("hosted: with no proxy the browser gets the gate, and nothing else", async () => {
    const before = ownListeners();
    const route = await hosted(() => openBrowserRoute(undefined));
    try {
      expect(route.gated).toBe(true);
      expect(route.proxy).toStrictEqual({ server: route.forwarder!.server });
      expect(route.proxy!.server).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(added(before).length).toBe(2);
      expect(typeof route.forwarder!.failure).toBe("function");
    } finally {
      await route.forwarder?.close();
    }
    expect(await addedSettles(before)).toEqual([]);
  });

  test("hosted: an http proxy, with or without a login, is chained behind the gate; its login and bypass list do not reach the browser", async () => {
    for (const proxy of [upstreamProxy({ bypass: ["127.0.0.1", "localhost", "<loopback>"] }), { server: `http${S}127.0.0.1:${upstreamPort}`, bypass: ["127.0.0.1"] }, { server: `127.0.0.1:${upstreamPort}`, bypass: ["127.0.0.1"] }]) {
      const route = await hosted(() => openBrowserRoute(proxy));
      try {
        expect(route.gated).toBe(true);
        expect(route.proxy).toStrictEqual({ server: route.forwarder!.server });
        expect(route.proxy!.server).not.toContain(String(upstreamPort));
      } finally {
        await route.forwarder?.close();
      }
    }
  });

  test("hosted: a socks proxy goes to the browser as it is, without the bypass list", async () => {
    const before = ownListeners();
    for (const server of [`socks5${S}127.0.0.1:9`, `SOCKS5${S}127.0.0.1:9`, `socks4${S}127.0.0.1:9`, `socks5h${S}127.0.0.1:9`]) {
      const route = await hosted(() => openBrowserRoute({ server, bypass: ["127.0.0.1", "localhost"] }));
      expect(route).toStrictEqual({ proxy: { server, username: undefined, password: undefined }, forwarder: null, gated: false });
    }
    expect(added(before)).toEqual([]);
  });

  test("hosted: a proxy that is neither http(s) nor socks stops the launch", async () => {
    const before = ownListeners();
    await expect(hosted(() => openBrowserRoute({ server: `ftp${S}127.0.0.1:9` }))).rejects.toThrow(/egress gate .*could not start/);
    expect(await addedSettles(before)).toEqual([]);
  });

  test("hosted: Playwright's loopback switch stops the launch, whatever the proxy and whatever its value", async () => {
    const before = ownListeners();
    for (const value of ["1", "true", "0"]) {
      process.env[LOOPBACK_SWITCH] = value;
      for (const proxy of [undefined, upstreamProxy(), { server: `socks5${S}127.0.0.1:9` }]) {
        await expect(hosted(() => openBrowserRoute(proxy))).rejects.toThrow(LOOPBACK_SWITCH);
      }
    }
    expect(added(before)).toEqual([]);
  });

  test("hosted: a gate that cannot listen stops the launch; not hosted, the same failure is not in the way", async () => {
    const before = ownListeners();
    const restore = breakListen();
    try {
      await expect(hosted(() => openBrowserRoute(undefined))).rejects.toThrow(/egress gate .*could not start \(listen refused \(test\)\)/);
      await expect(hosted(() => openBrowserRoute(upstreamProxy()))).rejects.toThrow(/egress gate .*could not start/);
      expect(await openBrowserRoute(undefined)).toStrictEqual({ proxy: undefined, forwarder: null, gated: false });
    } finally {
      restore();
    }
    expect(await addedSettles(before)).toEqual([]);
  });
});

describe("WebRTC settings (webRtcGuard)", () => {
  const FLAG = "--force-webrtc-ip-handling-policy=disable_non_proxied_udp";
  const proxy = { server: `http${S}127.0.0.1:9` };

  test("not hosted: on with a proxy, off without one, as before", () => {
    expect(webRtcGuard("chromium", undefined, true)).toStrictEqual({ args: [], firefoxProxyOnly: false, initScript: undefined });
    expect(webRtcGuard("chromium", undefined, false)).toStrictEqual({ args: [], firefoxProxyOnly: false, initScript: undefined });
    expect(webRtcGuard("firefox", undefined, true)).toStrictEqual({ args: [], firefoxProxyOnly: false, initScript: undefined });
    expect(webRtcGuard("webkit", undefined, true)).toStrictEqual({ args: [], firefoxProxyOnly: false, initScript: undefined });
    expect(webRtcGuard("chromium", proxy, true)).toStrictEqual({ args: [FLAG], firefoxProxyOnly: true, initScript: undefined });
    // The headed binary ignores the flag, and not hosted that stays as it was: no script.
    expect(webRtcGuard("chromium", proxy, false)).toStrictEqual({ args: [FLAG], firefoxProxyOnly: true, initScript: undefined });
    expect(webRtcGuard("firefox", proxy, true)).toStrictEqual({ args: [], firefoxProxyOnly: true, initScript: undefined });
    expect(webRtcGuard("webkit", proxy, true)).toStrictEqual({ args: [], firefoxProxyOnly: true, initScript: NO_WEBRTC_SCRIPT });
  });

  test("hosted: on for every engine without a configured proxy, and a headed chromium gets the script too", async () => {
    await hosted(async () => {
      expect(webRtcGuard("chromium", undefined, true)).toStrictEqual({ args: [FLAG], firefoxProxyOnly: true, initScript: undefined });
      expect(webRtcGuard("chromium", undefined, false)).toStrictEqual({ args: [FLAG], firefoxProxyOnly: true, initScript: NO_WEBRTC_SCRIPT });
      expect(webRtcGuard("chromium", proxy, false)).toStrictEqual({ args: [FLAG], firefoxProxyOnly: true, initScript: NO_WEBRTC_SCRIPT });
      expect(webRtcGuard("firefox", undefined, true)).toStrictEqual({ args: [], firefoxProxyOnly: true, initScript: undefined });
      expect(webRtcGuard("firefox", undefined, false)).toStrictEqual({ args: [], firefoxProxyOnly: true, initScript: undefined });
      expect(webRtcGuard("webkit", undefined, true)).toStrictEqual({ args: [], firefoxProxyOnly: true, initScript: NO_WEBRTC_SCRIPT });
    });
  });
});

describe("what a caller is told when the gate did not carry a page (navigation-errors.ts)", () => {
  test("the gate's record is asked by the host and the port the browser connects to", () => {
    expect(gateTarget(`https${S}example.test/a?b`)).toEqual({ host: "example.test", port: 443 });
    expect(gateTarget(`http${S}example.test/`)).toEqual({ host: "example.test", port: 80 });
    expect(gateTarget(`https${S}Example.TEST:8443/`)).toEqual({ host: "example.test", port: 8443 });
    expect(gateTarget(`http${S}user:pw@example.test:8080/`)).toEqual({ host: "example.test", port: 8080 });
    expect(gateTarget(`http${S}[::1]:8080/`)).toEqual({ host: "[::1]", port: 8080 });
    // Nothing else goes through the gate.
    for (const other of ["about:blank", `ws${S}example.test/`, `file${S}/etc/passwd`, "example.test", "", `chrome-error${S}chromewebdata/`]) expect(gateTarget(other)).toBeNull();
  });

  test("no gate, a forwarder without a record, a record that throws and a URL that is not http(s) all read as no record", () => {
    const asked: string[] = [];
    const gate = { failure: (host: string, port: number): Why => { asked.push(`${host}:${port}`); return "refused"; } };
    expect(gateFailure(gate, `https${S}a.test/x`)).toBe("refused");
    expect(gateFailure(gate, `http${S}a.test:81/x`)).toBe("refused");
    expect(asked).toEqual(["a.test:443", "a.test:81"]);
    expect(gateFailure(null, `https${S}a.test/`)).toBeUndefined();
    expect(gateFailure(undefined, `https${S}a.test/`)).toBeUndefined();
    expect(gateFailure({}, `https${S}a.test/`)).toBeUndefined();
    expect(gateFailure({ failure: () => { throw new Error("boom"); } }, `https${S}a.test/`)).toBeUndefined();
    expect(gateFailure(gate, "about:blank")).toBeUndefined();
    expect(asked.length).toBe(2);
  });

  test("refused: one sentence for a name that does not resolve and an address the server does not open, and no word of a proxy", () => {
    const message = describeGateFailure("refused", `https${S}typo.test/pricing`);
    expect(message).toBe("typo.test cannot be reached from the hosted server: its name does not resolve, or it is an address the server does not open (private, local, or the server's own). Check the URL spelling. Nothing was loaded.");
    expect(message).not.toMatch(PROXY_WORDS);
    expect(describeGateFailure("refused", `http${S}127.0.0.1:8080/`)).toStartWith("127.0.0.1:8080 cannot be reached from the hosted server:");
  });

  test("unreachable: the direct browser's words for refused and timed out, and for plain http an empty answer too", () => {
    const secure = describeGateFailure("unreachable", `https${S}down.test:8443/`);
    expect(secure).toBe("Connection to down.test:8443 failed: it was refused (nothing is listening there, or a firewall rejected it) or it timed out (the host did not answer). Check the address and port. Nothing was loaded.");
    const plain = describeGateFailure("unreachable", `http${S}down.test/`);
    expect(plain).toBe("Connection to down.test failed: it was refused (nothing is listening there, or a firewall rejected it), it timed out (the host did not answer), or the host closed the connection without sending a page. Check the address and port. Nothing was loaded.");
    for (const message of [secure, plain]) {
      expect(message).not.toMatch(PROXY_WORDS);
      // navigate reads "Timeout" in a message as its own time limit and loads the page again.
      expect(message).not.toMatch(/timeout/i);
    }
  });

  test("a redirect: the host that failed is named, with the host that sent the browser there", () => {
    const message = describeGateFailure("refused", `https${S}internal.test/x`, `http${S}public.test/go`);
    expect(message).toStartWith("public.test redirected to internal.test. internal.test cannot be reached from the hosted server:");
    // Another path on one host is not a redirect worth naming.
    expect(describeGateFailure("refused", `https${S}a.test/x`, `https${S}a.test/`)).toStartWith("a.test cannot be reached");
  });

  test("the error is one a caller can tell from a blocked proxy without reading it; an upstream failure and no record give none", () => {
    const says = (why: Why | undefined): Gate => ({ failure: () => why });
    const refused = gateNavigationError(says("refused"), `https${S}typo.test/`);
    expect(refused).toBeInstanceOf(navigation.EgressNavigationError);
    expect(refused).toBeInstanceOf(Error);
    expect(refused!.name).toBe("EgressNavigationError");
    expect(refused!.why).toBe("refused");
    expect(refused!.failedUrl).toBe(`https${S}typo.test/`);
    expect(refused!.message).toBe(describeGateFailure("refused", `https${S}typo.test/`));
    expect(gateNavigationError(says("unreachable"), `http${S}down.test/`)!.message).toBe(describeGateFailure("unreachable", `http${S}down.test/`));
    // The configured proxy failed: the caller keeps its own proxy text.
    expect(gateNavigationError(says("upstream"), `https${S}typo.test/`)).toBeNull();
    expect(gateNavigationError(says(undefined), `https${S}typo.test/`)).toBeNull();
    expect(gateNavigationError(null, `https${S}typo.test/`)).toBeNull();
  });

  test("neither sentence holds a word the callers' own checks act on, so the error reaches the caller as it is", () => {
    // navigate, the agent-ready audit and site_cognitive_assessment read a
    // failed navigation's text: a net:: code turns it into their proxy text
    // or into navigationError's sentence for that code, and "Timeout" makes
    // navigate load the page a second time. None of them is guarded by the
    // error's class, so this is what keeps a gate refusal out of all three.
    const says = (why: Why): Gate => ({ failure: () => why });
    for (const why of ["refused", "unreachable"] as const) {
      for (const [failed, asked] of [[`https${S}typo.test/`, undefined], [`http${S}typo.test:8080/x`, undefined], [`https${S}internal.test/`, `http${S}public.test/go`], [`http${S}[::1]:8080/`, `https${S}public.test/`]] as const) {
        const error = gateNavigationError(says(why), failed, asked)!;
        expect(error.message).not.toMatch(/net::|ERR_|NS_ERROR|timeout|Call log/i);
        expect(error.message).not.toMatch(PROXY_WORDS);
        expect(error.message).toEndWith("Nothing was loaded.");
        expect(navigation.describeNavigationError(error.message as never, (asked ?? failed) as never)).toBeNull();
        expect(navigation.navigationError(error as never, (asked ?? failed) as never)).toBe(error);
      }
    }
  });

  test("against a real gate: what a browser's URL asks for is what the gate recorded, for https and for plain http", async () => {
    const before = ownListeners();
    const route = await hosted(() => openBrowserRoute(undefined));
    const gate = route.forwarder!;
    try {
      // Nothing has failed yet.
      expect(gateNavigationError(gate, `https${S}refused.test/`)).toBeNull();

      // https, as CONNECT: a name that answers with this machine's address, a name with no answer, an allowed address where nothing listens.
      expect((await connectTo(gate.server, "refused.test:443")).status).toBe(403);
      expect((await connectTo(gate.server, "nx.test:443")).status).toBe(403);
      expect((await connectTo(gate.server, `allowed.test:${deadPort}`)).status).toBe(502);
      expect(gateNavigationError(gate, `https${S}refused.test/`)!.message).toStartWith("refused.test cannot be reached from the hosted server:");
      expect(gateNavigationError(gate, `https${S}REFUSED.test:443/some/page`)!.why).toBe("refused");
      expect(gateNavigationError(gate, `https${S}nx.test/`)!.message).toBe(gateNavigationError(gate, `https${S}refused.test/`)!.message.replaceAll("refused.test", "nx.test"));
      expect(gateNavigationError(gate, `https${S}allowed.test:${deadPort}/`)!.message).toStartWith(`Connection to allowed.test:${deadPort} failed: it was refused`);
      // Another port of the same host has no record.
      expect(gateNavigationError(gate, `https${S}refused.test:8443/`)).toBeNull();
      expect(gateNavigationError(gate, `http${S}refused.test/`)).toBeNull();

      // Plain http: the gate answers for itself, marks the answer, and keeps the same record.
      const plainRefused = await getPlain(gate.server, `http${S}refused.test:8080/`);
      expect([plainRefused.status, plainRefused.mark]).toEqual([403, "refused"]);
      expect(plainRefused.body).toContain(EGRESS_REFUSAL_REASON);
      expect(gateFailure(gate, `http${S}refused.test:8080/`)).toBe(plainRefused.mark as Why);
      const plainDead = await getPlain(gate.server, `http${S}allowed.test:${deadPort}/`);
      expect([plainDead.status, plainDead.mark]).toEqual([502, "unreachable"]);
      expect(gateFailure(gate, `http${S}allowed.test:${deadPort}/`)).toBe("unreachable");
      const literal = await getPlain(gate.server, `http${S}127.0.0.1:${upstreamPort}/`);
      expect([literal.status, literal.mark]).toEqual([403, "refused"]);
      expect(gateNavigationError(gate, `http${S}127.0.0.1:${upstreamPort}/`)!.message).toStartWith(`127.0.0.1:${upstreamPort} cannot be reached from the hosted server:`);
    } finally {
      await gate.close();
    }
    expect(await addedSettles(before)).toEqual([]);
  }, 30_000);
});

describe("one navigation read as the gate saw it (gotoThroughGate), with a stand-in for the page", () => {
  /** What the reading uses of a Playwright response. */
  const answer = (url: string, headers: Record<string, string> = {}) => ({ url: () => url, headers: () => headers });
  /** What it uses of a request. A request with no frame throws from frame(), as a service worker's does. */
  const request = (url: string, frame: unknown, navigation = true) => ({
    url: () => url,
    isNavigationRequest: () => navigation,
    frame: () => { if (frame === undefined) throw new Error("no frame"); return frame; },
  });
  /** A page that records what was put on it and where it was sent. */
  function standIn() {
    const main = { name: "main" };
    const listeners: Array<(r: unknown) => void> = [];
    const went: string[] = [];
    let added = 0;
    const page = {
      mainFrame: () => main,
      on: (event: string, fn: (r: unknown) => void) => { if (event === "request") { listeners.push(fn); added++; } },
      off: (event: string, fn: (r: unknown) => void) => { const at = listeners.indexOf(fn); if (event === "request" && at >= 0) listeners.splice(at, 1); },
      goto: async (url: string) => { went.push(url); return null; },
    };
    return { page, main, went, emit: (r: unknown) => { for (const fn of [...listeners]) fn(r); }, listening: () => listeners.length, everListened: () => added };
  }
  const says = (record: Record<string, Why>): Gate => ({ failure: (host: string, port: number) => record[`${host}:${port}`] });
  const through = (gate: Gate, page: unknown, url: string, go: () => Promise<unknown>) => browserModule.gotoThroughGate(gate as never, page as never, url as never, go as never) as Promise<unknown>;
  const outcome = async (call: Promise<unknown>): Promise<string> => call.then((v) => `returned ${v === null ? "null" : (v as { url(): string }).url()}`, (e: Error) => `${e.name}: ${e.message}`);
  const tunnel = (url: string): Error => new Error(`page.goto: net::ERR_TUNNEL_CONNECTION_FAILED at ${url}\nCall log:\n  - navigating`);

  test("without a gate it is the navigation itself: the same result, the same rejection, and nothing put on the page", async () => {
    for (const gate of [null, undefined, {}] as Gate[]) {
      const s = standIn();
      const marked = answer(`http${S}a.test/`, { [EGRESS_HEADER.toLowerCase()]: "refused" });
      expect(await through(gate, s.page, `http${S}a.test/`, async () => marked)).toBe(marked);
      const failure = tunnel(`https${S}a.test/`);
      await expect(through(gate, s.page, `https${S}a.test/`, async () => { throw failure; })).rejects.toBe(failure);
      expect(s.everListened()).toBe(0);
      expect(s.went).toEqual([]);
    }
  });

  test("a rejection is read from the gate's record, whatever the engine called it", async () => {
    const gate = says({ "typo.test:443": "refused", "down.test:8443": "unreachable" });
    // chromium, firefox and webkit for a CONNECT the gate answered (measured 2026-11-12, Playwright 1.64.1).
    for (const engineSaid of ["page.goto: net::ERR_TUNNEL_CONNECTION_FAILED at x", "page.goto: NS_ERROR_PROXY_FORBIDDEN", "page.goto: Download is starting"]) {
      const s = standIn();
      const said = await outcome(through(gate, s.page, `https${S}typo.test/`, async () => { throw new Error(engineSaid); }));
      expect(said).toBe(`EgressNavigationError: ${describeGateFailure("refused", `https${S}typo.test/`)}`);
      expect(s.listening()).toBe(0);
    }
    const s = standIn();
    expect(await outcome(through(gate, s.page, `https${S}down.test:8443/`, async () => { throw new Error("page.goto: NS_ERROR_PROXY_BAD_GATEWAY"); })))
      .toBe(`EgressNavigationError: ${describeGateFailure("unreachable", `https${S}down.test:8443/`)}`);
  });

  test("after a redirect the gate is asked about the last main-frame navigation request, not the URL asked for", async () => {
    const gate = says({ "internal.test:443": "refused" });
    const s = standIn();
    const asked = `http${S}public.test/go`;
    const said = await outcome(through(gate, s.page, asked, async () => {
      s.emit(request(asked, s.main));
      s.emit(request(`https${S}internal.test/x`, s.main));
      // None of these is the page's own navigation: a subresource, a frame's navigation, a request with no frame.
      s.emit(request(`https${S}cdn.test/app.js`, s.main, false));
      s.emit(request(`https${S}ads.test/frame`, { name: "child" }));
      s.emit(request(`https${S}worker.test/sw.js`, undefined));
      throw tunnel(asked);
    }));
    expect(said).toBe(`EgressNavigationError: ${describeGateFailure("refused", `https${S}internal.test/x`, asked)}`);
    expect(said).toContain("public.test redirected to internal.test. ");
    expect(s.listening()).toBe(0);
  });

  test("a rejection the gate has no record of, or that the configured proxy caused, goes back as it came", async () => {
    for (const record of [{}, { "typo.test:443": "upstream" }] as Array<Record<string, Why>>) {
      const s = standIn();
      const failure = tunnel(`https${S}typo.test/`);
      await expect(through(says(record), s.page, `https${S}typo.test/`, async () => { throw failure; })).rejects.toBe(failure);
      expect(s.listening()).toBe(0);
    }
  });

  test("Playwright's own time limit is not read as the gate's, even with an older record for the host", async () => {
    const s = standIn();
    const timeout = Object.assign(new Error("page.goto: Timeout 30000ms exceeded."), { name: "TimeoutError" });
    await expect(through(says({ "slow.test:443": "refused" }), s.page, `https${S}slow.test/`, async () => { throw timeout; })).rejects.toBe(timeout);
  });

  test("a plain-http answer is the gate's own when it carries the mark (here the record says the same): it is a failed navigation, and the tab is cleared", async () => {
    const mark = EGRESS_HEADER.toLowerCase();
    const s = standIn();
    const gate = says({ "typo.test:80": "refused", "down.test:8080": "unreachable" });
    expect(await outcome(through(gate, s.page, `http${S}typo.test/`, async () => answer(`http${S}typo.test/`, { [mark]: "refused" }))))
      .toBe(`EgressNavigationError: ${describeGateFailure("refused", `http${S}typo.test/`)}`);
    expect(s.went).toEqual(["about:blank"]);
    // After a redirect the answer's own URL is the one that failed.
    expect(await outcome(through(gate, s.page, `http${S}public.test/go`, async () => answer(`http${S}down.test:8080/x`, { [mark]: "unreachable" }))))
      .toBe(`EgressNavigationError: ${describeGateFailure("unreachable", `http${S}down.test:8080/x`, `http${S}public.test/go`)}`);
    expect(s.went).toEqual(["about:blank", "about:blank"]);
    expect(s.listening()).toBe(0);
  });

  test("over plain http the mark alone is the gate's answer, and its value is the reason, whatever the record says (gate-3, second review)", async () => {
    // The gate removes the header from every answer a plain-http target sends,
    // so a marked plain-http answer was written by the gate. The record is one
    // entry per host and port for all of a browser's requests: another request
    // carried in the meantime deletes it, and a later failure replaces it.
    const mark = EGRESS_HEADER.toLowerCase();
    const cases: Array<[string, Gate, ReturnType<typeof answer>, string]> = [
      ["no record: another request to the host was carried in the meantime", says({}), answer(`http${S}flaky.test/`, { [mark]: "unreachable" }), `EgressNavigationError: ${describeGateFailure("unreachable", `http${S}flaky.test/`)}`],
      ["no record, refused", says({}), answer(`http${S}typo.test/`, { [mark]: "refused" }), `EgressNavigationError: ${describeGateFailure("refused", `http${S}typo.test/`)}`],
      ["a record that says something else: a later failure of another request", says({ "site.test:80": "unreachable" }), answer(`http${S}site.test/`, { [mark]: "refused" }), `EgressNavigationError: ${describeGateFailure("refused", `http${S}site.test/`)}`],
      ["the configured proxy failed, and the record has gone", says({}), answer(`http${S}site.test/`, { [mark]: "upstream" }), `Error: net::ERR_TUNNEL_CONNECTION_FAILED at http${S}site.test/`],
      ["the gate's 400 for a request it could not send on is not a page either", says({ "site.test:80": "refused" }), answer(`http${S}site.test/`, { [mark]: "bad-request" }), `Error: net::ERR_TUNNEL_CONNECTION_FAILED at http${S}site.test/`],
    ];
    for (const [label, gate, response, expected] of cases) {
      const s = standIn();
      expect(`${label}: ${await outcome(through(gate, s.page, response.url(), async () => response))}`).toBe(`${label}: ${expected}`);
      expect(s.went).toEqual(["about:blank"]);
      expect(s.listening()).toBe(0);
    }
  });

  test("a record without the mark, and a mark inside https, are a page", async () => {
    const mark = EGRESS_HEADER.toLowerCase();
    const cases: Array<[string, Gate, ReturnType<typeof answer>]> = [
      ["a record with no mark: an older failure, and this answer is the site's", says({ "site.test:80": "refused" }), answer(`http${S}site.test/`, {})],
      ["inside https the gate sees no headers, so the mark there is the site's", says({ "site.test:443": "refused" }), answer(`https${S}site.test/`, { [mark]: "refused" })],
    ];
    for (const [label, gate, response] of cases) {
      const s = standIn();
      expect(`${label}: ${await outcome(through(gate, s.page, response.url(), async () => response))}`).toBe(`${label}: returned ${response.url()}`);
      expect(s.went).toEqual([]);
      expect(s.listening()).toBe(0);
    }
    // No response at all (a same-document navigation) is passed on too.
    const s = standIn();
    expect(await through(says({ "site.test:80": "refused" }), s.page, `http${S}site.test/#top`, async () => null)).toBeNull();
  });

  test("a plain-http answer the configured proxy caused is a failed navigation too, in the words the caller's proxy text is keyed on", async () => {
    const s = standIn();
    const said = await outcome(through(says({ "site.test:80": "upstream" }), s.page, `http${S}site.test/`, async () => answer(`http${S}site.test/`, { [EGRESS_HEADER.toLowerCase()]: "upstream" })));
    expect(said).toBe(`Error: net::ERR_TUNNEL_CONNECTION_FAILED at http${S}site.test/`);
    expect(s.went).toEqual(["about:blank"]);
  });

  test("a tab that cannot be cleared does not hide the failure", async () => {
    const s = standIn();
    s.page.goto = async () => { throw new Error("the page is gone"); };
    const said = await outcome(through(says({ "typo.test:80": "refused" }), s.page, `http${S}typo.test/`, async () => answer(`http${S}typo.test/`, { [EGRESS_HEADER.toLowerCase()]: "refused" })));
    expect(said).toStartWith("EgressNavigationError: typo.test cannot be reached from the hosted server:");
  });
});

describe("the remote server's check before it starts (hostedEgressStartupCheck)", () => {
  test("says how many of its own addresses the server refuses, and counts the configured ones", () => {
    const line = startupCheck();
    const counts = /^Egress: only public internet addresses are opened\. Refused as this server's own: (\d+) IPv4 and (\d+) IPv6 addresses or ranges \(interfaces, the kernel's local table, CBROWSER_OWN_ADDRESSES\)\.$/.exec(line);
    expect(counts).not.toBeNull();
    // Loopback at least.
    expect(Number(counts![1])).toBeGreaterThan(0);
    // Documentation addresses: on no interface, and nothing connects to them here.
    process.env[OWN_ENV] = "198.51.100.7, 203.0.113.0/29, 2001:db8:1::/48";
    const more = /(\d+) IPv4 and (\d+) IPv6/.exec(startupCheck())!;
    expect(Number(more[1])).toBe(Number(counts![1]) + 2);
    expect(Number(more[2])).toBe(Number(counts![2]) + 1);
    // The line gives counts, not the addresses.
    expect(startupCheck()).not.toContain("198.51.100.7");
  });

  test("an entry of CBROWSER_OWN_ADDRESSES that is not an address or a range stops the start, and names the entry", () => {
    for (const bad of ["198.51.100.7;198.51.100.8", "lb.example.test", "198.51.100.7 198.51.100.8", "198.51.100.7/33"]) {
      process.env[OWN_ENV] = `203.0.113.9, ${bad}`;
      expect(() => startupCheck()).toThrow(OWN_ENV);
      expect(() => startupCheck()).toThrow(JSON.stringify(bad));
    }
  });

  test("Playwright's loopback switch stops the start, with the reason and what to do", () => {
    process.env[LOOPBACK_SWITCH] = "1";
    expect(() => startupCheck()).toThrow(LOOPBACK_SWITCH);
    expect(() => startupCheck()).toThrow(/not started/);
    expect(() => startupCheck()).toThrow(/Unset it/);
    delete process.env[LOOPBACK_SWITCH];
    expect(startupCheck()).toStartWith("Egress:");
  });

  test("startRemoteMcpServer runs it right after hosted mode is set, and nothing else in src does", () => {
    const src = readFileSync(join(import.meta.dir, "..", "src", "mcp-server-remote.ts"), "utf8");
    const start = src.indexOf("export async function startRemoteMcpServer(");
    const body = src.slice(start);
    const hostedAt = body.indexOf("setHostedMode(true);");
    const checkAt = body.indexOf("console.log(hostedEgressStartupCheck());");
    const portAt = body.indexOf("const port = ");
    expect(hostedAt).toBeGreaterThan(0);
    expect(checkAt).toBeGreaterThan(hostedAt);
    expect(checkAt).toBeLessThan(portAt);
    // Once in the start, and the definition: the stdio server and the CLI never run it.
    expect(src.split("hostedEgressStartupCheck(").length - 1).toBe(2);
    for (const other of ["mcp-server.ts", "daemon.ts", "browser.ts"]) {
      expect(readFileSync(join(import.meta.dir, "..", "src", other), "utf8")).not.toContain("hostedEgressStartupCheck");
    }
    expect(cliSourceText()).not.toContain("hostedEgressStartupCheck");
  });
});

describe("this file stays in the release gate", () => {
  test("it is not on the browser list, and reads to the CI check as a file that starts no browser", () => {
    const list = readFileSync(join(import.meta.dir, "..", "scripts", "browser-tests.txt"), "utf8").split("\n").map((l) => l.trim());
    expect(list).not.toContain("tests/browser-route.test.ts");
    expect(list).toContain("tests/hosted-egress-browser.test.ts");
    // The pattern of tests/ci-runner-config.test.ts ("every file that launches a real browser is in the list"), put together here so this file does not match it.
    const starts = new RegExp(["chromium\\.launch\\(", "browser\\.launch\\(", "launchPersistentContext\\(", "new CBrowser\\("].join("|"));
    expect(starts.test(readFileSync(import.meta.path, "utf8"))).toBe(false);
    // The gate script leaves out exactly the files on that list.
    expect(readFileSync(join(import.meta.dir, "..", "scripts", "test-gate.sh"), "utf8")).toContain("browser-tests.txt");
  });
});
