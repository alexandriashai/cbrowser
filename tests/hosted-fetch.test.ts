/**
 * hostedFetch: a hosted server's request to a caller's URL connects only to
 * an address that was checked, on the first request and on every redirect
 * (P-10, ISC-17 and ISC-18).
 *
 * Everything here runs against listeners this file starts on 127.0.0.x and
 * a resolver it injects. Names end in .test and are never given to the
 * system resolver: in the injected policy 127.0.0.2 stands for an address
 * the server may connect to and 127.0.0.3 for one it may not. Every
 * "refused" case has a control next to it in which the same listener IS
 * reached, so a refusal that came from a dead listener would show.
 * 127.0.0.4 and 127.0.0.6 have no listener at all (a connect is refused),
 * and 127.0.0.5 holds a listener that never accepts (a connect hangs): a
 * node child process, for the tests of an address that does not answer.
 *
 * The file launches no browser.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, afterEach, afterAll, spyOn } from "bun:test";
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createTlsServer } from "node:https";
import { connect as netConnect, createServer as createNetServer, type Socket } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, deflateRawSync, deflateSync, gzipSync } from "node:zlib";
import { DEFAULT_MAX_BYTES, DEFAULT_TIMEOUT_MS, MAX_REDIRECTS, hostedFetch, refusalKind } from "../src/hosted-fetch.js";
import * as egress from "../src/egress.js";
import { EgressRefused, setEgressPolicyForTests, type EgressPolicy } from "../src/egress.js";
import { setHostedMode } from "../src/mcp-tools/hosted-inputs.js";
import { resolveFinalUrl } from "../src/url-resolution.js";
import { HOSTED_MAX_LINKS, LINK_CHECK_POOL, validateLlmsTxt, validateLlmsTxtFromUrl, validateLlmsTxtLinks } from "../src/llms-txt/validator.js";
import { diffLlmsTxtFromUrl } from "../src/llms-txt/diff.js";
import { parseSitemap } from "../src/testing/coverage.js";
import { runWebMCPReadyAudit } from "../src/analysis/webmcp-readiness.js";
import { registerSecurityTools } from "../src/mcp-tools/base/security-tools.js";
import { registerLlmsTxtTools } from "../src/mcp-tools/base/llms-txt-tools.js";
import { z } from "zod";

const ALLOWED = "127.0.0.2";
const REFUSED = "127.0.0.3";

interface Hit { method: string; url: string; headers: IncomingHttpHeaders; body: string; sni?: string }
interface Listener { port: number; hits: Hit[]; connections: () => number; origin: string }
type Handler = (req: IncomingMessage, res: ServerResponse, hit: Hit) => void;

const open: Server[] = [];

const listening = (server: { once: (event: "error", f: (e: Error) => void) => unknown; listen: (port: number, host: string, f: () => void) => unknown }, port: number, host: string): Promise<void> =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

/**
 * A listener on `address` that records every connection and every request.
 *
 * The connections are counted by a plain TCP listener that stands on the
 * address and passes the bytes on to the http or https server behind it (on
 * 127.0.0.1, a port of its own). An http server cannot count them here: on
 * Bun 1.4.4 its "connection" event comes with the first request, so a
 * connection that was opened and sent nothing counted as none (measured
 * 2026-11-12: one bare TCP connection gave 0 on Bun and 1 on Node 22.19.0).
 * "No connection" below is meant as it reads.
 */
async function listen(address: string, handler: Handler = (_q, s) => { s.end("ok"); }, opts: { port?: number; tls?: { key: Buffer; cert: Buffer } } = {}): Promise<Listener> {
  const hits: Hit[] = [];
  let connections = 0;
  const onRequest = (req: IncomingMessage, res: ServerResponse): void => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const hit: Hit = { method: req.method ?? "", url: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString(),
        sni: (req.socket as unknown as { servername?: string }).servername };
      hits.push(hit);
      handler(req, res, hit);
    });
  };
  const server = (opts.tls ? createTlsServer(opts.tls, onRequest) : createServer(onRequest)) as Server;
  await listening(server, 0, "127.0.0.1");
  open.push(server);
  const behind = (server.address() as { port: number }).port;
  const live = new Set<Socket>();
  const front = createNetServer((client) => {
    connections++;
    const inner = netConnect(behind, "127.0.0.1");
    const pair: Array<[Socket, Socket]> = [[client, inner], [inner, client]];
    for (const [one, other] of pair) {
      live.add(one);
      one.on("error", () => { other.destroy(); });
      // Ended in order, the other side is ended in order too, so what is still on its way arrives.
      one.on("close", () => { live.delete(one); other.end(); });
      one.pipe(other);
    }
  });
  await listening(front, opts.port ?? 0, address);
  (front as unknown as { closeAllConnections: () => void }).closeAllConnections = () => { for (const socket of live) socket.destroy(); };
  open.push(front as unknown as Server);
  const port = (front.address() as { port: number }).port;
  return { port, hits, connections: () => connections, origin: `http://${address}:${port}` };
}

/** A resolver over a fixed table that records what it was asked, and an address decision over a fixed list. */
function policy(table: Record<string, string[]>, allowed: string[] = [ALLOWED]): EgressPolicy & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    resolve: async (host) => {
      asked.push(host);
      const answer = table[host];
      if (!answer) throw new Error(`the test has no answer for ${host}`);
      return answer;
    },
    allow: (ip) => allowed.includes(ip),
  };
}

/** An address nothing in this file listens on: a connect to it is refused at once. */
const NOBODY = "127.0.0.4";
/** The address of the listener that never answers a connect. */
const SILENT = "127.0.0.5";

const cleanups: Array<() => void> = [];

// Listens with a backlog of one and then stops serving its event loop: the
// kernel completes connections until the accept queue is full and from then
// on drops every SYN, so a connect to it neither succeeds nor fails. The same
// listener tests/egress-gate.test.ts uses for the gate's connect limit.
const STUCK_LISTENER = `const s = require("node:net").createServer(); s.listen({ port: 0, host: "${SILENT}", backlog: 1 }, () => { process.stdout.write(s.address().port + "\\n"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); });`;

/** A port on SILENT where a connect hangs, held until the test ends. */
async function silentPort(): Promise<number> {
  const child = spawn("node", ["-e", STUCK_LISTENER], { stdio: ["ignore", "pipe", "ignore"] });
  const fillers: Socket[] = [];
  cleanups.push(() => {
    for (const socket of fillers) socket.destroy();
    child.kill("SIGKILL");
  });
  const port = await new Promise<number>((done, fail) => {
    child.stdout.once("data", (d: Buffer) => done(Number(d.toString().trim())));
    child.once("error", () => fail(new Error("node is needed for the listener that never accepts")));
  });
  // Fill its accept queue: connect until one connect is left hanging.
  let hung = false;
  for (let i = 0; i < 1200 && !hung; i++) {
    hung = await new Promise<boolean>((done) => {
      const socket = netConnect(port, SILENT);
      fillers.push(socket);
      const timer = setTimeout(() => done(true), 250);
      socket.once("connect", () => { clearTimeout(timer); done(false); });
      socket.once("error", () => { clearTimeout(timer); done(false); });
    });
  }
  if (!hung) throw new Error("the accept queue of the silent listener did not fill");
  return port;
}

/** A silent port on SILENT and a working listener on the same port of `address`. */
async function silentThenWorking(address: string, opts: { tls?: { key: Buffer; cert: Buffer } } = {}, handler?: Handler): Promise<Listener> {
  for (let attempt = 0; ; attempt++) {
    const port = await silentPort();
    try {
      return await listen(address, handler, { ...opts, port });
    } catch (e) {
      // The port the silent listener was given is taken on the other address: take another.
      if (attempt >= 4) throw e;
    }
  }
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

const refusal = async (p: Promise<unknown>): Promise<Error> => {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error("the call did not throw");
};

afterEach(async () => {
  setHostedMode(false);
  setEgressPolicyForTests(null);
  for (const cleanup of cleanups.splice(0)) cleanup();
  for (const server of open.splice(0)) {
    (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe("hosted: the first request goes only to a checked address (ISC-17)", () => {
  test("a name that resolves to a refused address is refused and its listener sees no connection", async () => {
    const target = await listen(REFUSED);
    const p = policy({ "refused.test": [REFUSED] });
    setHostedMode(true);
    const e = await refusal(hostedFetch(`http://refused.test:${target.port}/secret`, { policy: p }));
    expect(e).toBeInstanceOf(EgressRefused);
    expect(e.message).not.toContain(REFUSED);
    expect(p.asked).toEqual(["refused.test"]);
    expect({ hits: target.hits.length, connections: target.connections() }).toEqual({ hits: 0, connections: 0 });
  });

  test("control: the same listener is reached when its address is allowed", async () => {
    const target = await listen(REFUSED);
    setHostedMode(true);
    const res = await hostedFetch(`http://refused.test:${target.port}/secret`, { policy: policy({ "refused.test": [REFUSED] }, [REFUSED]) });
    expect(await res.text()).toBe("ok");
    expect(target.hits.map((h) => h.url)).toEqual(["/secret"]);
  });

  test("a name with one allowed and one refused answer is refused", async () => {
    const good = await listen(ALLOWED);
    const bad = await listen(REFUSED, undefined, { port: good.port });
    setHostedMode(true);
    const e = await refusal(hostedFetch(`http://mixed.test:${good.port}/`, { policy: policy({ "mixed.test": [ALLOWED, REFUSED] }) }));
    expect(e).toBeInstanceOf(EgressRefused);
    expect(good.connections() + bad.connections()).toBe(0);
  });

  test("with the real address decision a loopback literal is refused, and is reached when hosted mode is off", async () => {
    const target = await listen("127.0.0.1");
    const url = `${target.origin}/control`;
    setHostedMode(true);
    const e = await refusal(hostedFetch(url));
    expect(e).toBeInstanceOf(EgressRefused);
    expect(e.message).not.toContain("127.0.0.1");
    expect(target.connections()).toBe(0);
    setHostedMode(false);
    const res = await hostedFetch(url);
    expect(await res.text()).toBe("ok");
    expect(target.hits.map((h) => h.url)).toEqual(["/control"]);
  });

  test("only http and https are fetched, and nothing is looked up for another scheme", async () => {
    const p = policy({});
    setHostedMode(true);
    for (const url of ["file:///etc/hostname", "ftp://refused.test/x", "gopher://refused.test/"]) {
      expect(await refusal(hostedFetch(url, { policy: p }))).toBeInstanceOf(EgressRefused);
    }
    expect(p.asked).toEqual([]);
  });

  test("a URL that carries a login is not fetched", async () => {
    const target = await listen(ALLOWED);
    setHostedMode(true);
    const e = await refusal(hostedFetch(`http://user:pass@ok.test:${target.port}/`, { policy: policy({ "ok.test": [ALLOWED] }) }));
    expect(e).toBeInstanceOf(TypeError);
    expect(target.connections()).toBe(0);
  });
});

describe("hosted: every redirect is checked before it is followed (ISC-17)", () => {
  test("a redirect to a name that resolves to a refused address: no hit and no connection there", async () => {
    const target = await listen(REFUSED);
    const first = await listen(ALLOWED, (_q, s) => { s.writeHead(302, { location: `http://refused.test:${target.port}/secret` }); s.end(); });
    const p = policy({ "ok.test": [ALLOWED], "refused.test": [REFUSED] });
    setHostedMode(true);
    const e = await refusal(hostedFetch(`http://ok.test:${first.port}/start`, { policy: p }));
    expect(e).toBeInstanceOf(EgressRefused);
    expect(e.message).toContain("redirect");
    expect(first.hits.map((h) => h.url)).toEqual(["/start"]);
    expect({ hits: target.hits.length, connections: target.connections() }).toEqual({ hits: 0, connections: 0 });
  });

  test("control: the same redirect is followed when the second address is allowed", async () => {
    const target = await listen(REFUSED);
    const first = await listen(ALLOWED, (_q, s) => { s.writeHead(302, { location: `http://refused.test:${target.port}/secret` }); s.end(); });
    setHostedMode(true);
    const res = await hostedFetch(`http://ok.test:${first.port}/start`, { policy: policy({ "ok.test": [ALLOWED], "refused.test": [REFUSED] }, [ALLOWED, REFUSED]) });
    expect(await res.text()).toBe("ok");
    expect(res.url).toBe(`http://refused.test:${target.port}/secret`);
    expect(res.redirected).toBe(true);
    expect(target.hits.map((h) => h.url)).toEqual(["/secret"]);
  });

  test("a redirect to a refused address literal, and to another scheme, is refused", async () => {
    const target = await listen(REFUSED);
    for (const location of [`http://${REFUSED}:${target.port}/x`, `http://[::ffff:${REFUSED}]:${target.port}/x`, "file:///etc/hostname", `ftp://other.test:${target.port}/x`]) {
      const first = await listen(ALLOWED, (_q, s) => { s.writeHead(307, { location }); s.end(); });
      const p = policy({ "ok.test": [ALLOWED], "other.test": [ALLOWED] });
      setHostedMode(true);
      const e = await refusal(hostedFetch(`http://ok.test:${first.port}/`, { policy: p }));
      expect({ location, refused: e instanceof EgressRefused }).toEqual({ location, refused: true });
      expect(first.hits.length).toBe(1);
      // Refused on the scheme, before the name in it is looked up.
      expect({ location, asked: p.asked }).toEqual({ location, asked: ["ok.test"] });
    }
    expect(target.connections()).toBe(0);
  });

  test("ten redirects are followed and the eleventh is not", async () => {
    const hops = (limit: number) => listen(ALLOWED, (_q, s, hit) => {
      const n = Number(hit.url.slice(1));
      if (n >= limit) { s.end("end"); return; }
      s.writeHead(302, { location: `/${n + 1}` });
      s.end();
    });
    setHostedMode(true);
    const ten = await hops(10);
    const res = await hostedFetch(`http://ok.test:${ten.port}/0`, { policy: policy({ "ok.test": [ALLOWED] }) });
    expect(await res.text()).toBe("end");
    expect(ten.hits.length).toBe(11);
    const eleven = await hops(11);
    const e = await refusal(hostedFetch(`http://ok.test:${eleven.port}/0`, { policy: policy({ "ok.test": [ALLOWED] }) }));
    expect(e.message).toBe("fetch failed");
    expect(String((e.cause as Error).message)).toContain("more than 10");
    expect(eleven.hits.length).toBe(11);
  });
});

describe("hosted: the connection goes to the address that was checked (ISC-18)", () => {
  test("a name that answers differently the second time is asked once, and the first answer is connected to", async () => {
    const first = await listen(ALLOWED);
    const second = await listen(REFUSED, undefined, { port: first.port });
    let asked = 0;
    // Both addresses are allowed, so a second lookup would connect to the second listener rather than be refused.
    const rebinding: EgressPolicy = { resolve: async () => (asked++ === 0 ? [ALLOWED] : [REFUSED]), allow: () => true };
    setHostedMode(true);
    const res = await hostedFetch(`http://rebind.test:${first.port}/a`, { policy: rebinding });
    expect(await res.text()).toBe("ok");
    expect(asked).toBe(1);
    expect(first.hits.map((h) => h.url)).toEqual(["/a"]);
    expect(second.connections()).toBe(0);
  });

  test("each hop of a redirect chain is looked up exactly once, and the server is told the name", async () => {
    const end = await listen(ALLOWED);
    const start = await listen(ALLOWED, (_q, s) => { s.writeHead(301, { location: `http://b.test:${end.port}/end` }); s.end(); });
    const p = policy({ "a.test": [ALLOWED], "b.test": [ALLOWED] });
    setHostedMode(true);
    await (await hostedFetch(`http://a.test:${start.port}/`, { policy: p })).text();
    expect(p.asked).toEqual(["a.test", "b.test"]);
    expect(start.hits[0].headers.host).toBe(`a.test:${start.port}`);
    expect(end.hits[0].headers.host).toBe(`b.test:${end.port}`);
  });

  test("an address literal is not looked up at all", async () => {
    const target = await listen(ALLOWED);
    const p = policy({});
    setHostedMode(true);
    await (await hostedFetch(`http://${ALLOWED}:${target.port}/`, { policy: p })).text();
    expect(p.asked).toEqual([]);
    expect(target.hits.length).toBe(1);
  });

  test("when the first checked address has no listener the next one is used at once, still on one lookup", async () => {
    const target = await listen(ALLOWED);
    const p = policy({ "two.test": [NOBODY, ALLOWED] }, [NOBODY, ALLOWED]);
    setHostedMode(true);
    const started = Date.now();
    const res = await hostedFetch(`http://two.test:${target.port}/`, { policy: p });
    // A refusal is an answer: the next address is not kept waiting for the 250 ms a silent one is given.
    expect(Date.now() - started).toBeLessThan(200);
    expect(res.status).toBe(200);
    expect(p.asked).toEqual(["two.test"]);
  });

  test("every hop of one call asks the lookup as one owner, and two calls are two owners", async () => {
    // The system lookup gives each owner only a share of its places (egress.ts),
    // so a call must be one owner for all its hops and never share one with
    // another call. resolveForEgress is watched here, not replaced in its
    // answer: it is handed on to the real one.
    const end = await listen(ALLOWED);
    const middle = await listen(ALLOWED, (_q, s) => { s.writeHead(302, { location: `http://c.test:${end.port}/end` }); s.end(); });
    const start = await listen(ALLOWED, (_q, s) => { s.writeHead(301, { location: `http://b.test:${middle.port}/mid` }); s.end(); });
    const real = egress.resolveForEgress;
    const seen: Array<{ host: string; policy: EgressPolicy | undefined }> = [];
    const mine = {};
    const spy = spyOn(egress, "resolveForEgress").mockImplementation((host: string, given?: EgressPolicy) => {
      seen.push({ host, policy: given });
      return real(host, given);
    });
    try {
      const p = policy({ "a.test": [ALLOWED], "b.test": [ALLOWED], "c.test": [ALLOWED] });
      setHostedMode(true);
      await (await hostedFetch(`http://a.test:${start.port}/`, { policy: p })).text();
      await (await hostedFetch(`http://a.test:${start.port}/`, { policy: p })).text();
      // With no policy at all the call still names an owner.
      setEgressPolicyForTests(policy({ "a.test": [ALLOWED], "b.test": [ALLOWED], "c.test": [ALLOWED] }));
      await (await hostedFetch(`http://a.test:${start.port}/`)).text();
      // A test that names an owner keeps it.
      await (await hostedFetch(`http://a.test:${start.port}/`, { policy: { ...p, owner: mine } })).text();
    } finally {
      spy.mockRestore();
    }
    expect(seen.map((s) => s.host)).toEqual(["a.test", "b.test", "c.test", "a.test", "b.test", "c.test", "a.test", "b.test", "c.test", "a.test", "b.test", "c.test"]);
    const owners = seen.map((s) => s.policy?.owner);
    expect(owners.every((o) => typeof o === "object" && o !== null)).toBe(true);
    const calls = [owners.slice(0, 3), owners.slice(3, 6), owners.slice(6, 9), owners.slice(9, 12)];
    for (const hops of calls) expect(new Set(hops).size).toBe(1);
    expect(new Set(calls.map((hops) => hops[0])).size).toBe(4);
    expect(calls[3][0]).toBe(mine);
    // The caller's own policy is passed on beside the owner, not dropped.
    expect(seen.slice(0, 6).every((s) => typeof s.policy?.resolve === "function" && typeof s.policy?.allow === "function")).toBe(true);
    expect(seen[6].policy?.resolve).toBeUndefined();
  });

  test("the runtime's fetch is not used on a hosted server", async () => {
    const target = await listen(ALLOWED);
    const real = globalThis.fetch;
    let used = 0;
    globalThis.fetch = (async () => { used++; throw new Error("the runtime fetch was called"); }) as unknown as typeof fetch;
    try {
      setHostedMode(true);
      const res = await hostedFetch(`http://ok.test:${target.port}/`, { policy: policy({ "ok.test": [ALLOWED] }) });
      expect(res.ok).toBe(true);
      expect(used).toBe(0);
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe("hosted: a checked address that does not answer is not waited for", () => {
  // Before 2026-11-12 the addresses were tried one after another with no limit
  // of their own, so a first address that dropped the connect used up the
  // whole call (4 s in the redirect resolver) and the working one was never
  // tried. The runtime's fetch starts the next address after 250 ms.
  test("first address silent, second working: answered in under a second, on one lookup, with the request written once", async () => {
    if (process.platform !== "linux") return;
    const good = await silentThenWorking(ALLOWED);
    const p = policy({ "dual.test": [SILENT, ALLOWED] }, [SILENT, ALLOWED]);
    setHostedMode(true);
    const started = Date.now();
    const res = await hostedFetch(`http://dual.test:${good.port}/page`, { method: "POST", body: "once", policy: p });
    const took = Date.now() - started;
    expect(await res.text()).toBe("ok");
    expect(took).toBeLessThan(1000);
    // And not at once: the second address is started beside the first only after the wait.
    expect(took).toBeGreaterThanOrEqual(200);
    expect(p.asked).toEqual(["dual.test"]);
    expect(good.hits.map((h) => ({ url: h.url, body: h.body, host: h.headers.host }))).toEqual([{ url: "/page", body: "once", host: `dual.test:${good.port}` }]);
  }, 20_000);

  test("a refusal in the middle of the wait starts the address after it at once", async () => {
    if (process.platform !== "linux") return;
    const good = await silentThenWorking(ALLOWED);
    const p = policy({ "three.test": [SILENT, NOBODY, ALLOWED] }, [SILENT, NOBODY, ALLOWED]);
    setHostedMode(true);
    const started = Date.now();
    const res = await hostedFetch(`http://three.test:${good.port}/`, { policy: p });
    // 250 ms for the silent address, then the refused one and the working one with no second wait.
    expect(Date.now() - started).toBeLessThan(450);
    expect(res.status).toBe(200);
    expect(good.hits.length).toBe(1);
  }, 20_000);

  test("the same inside the redirect resolver's four seconds per hop", async () => {
    if (process.platform !== "linux") return;
    const good = await silentThenWorking(ALLOWED);
    setEgressPolicyForTests(policy({ "dual.test": [SILENT, ALLOWED] }, [SILENT, ALLOWED]));
    setHostedMode(true);
    const started = Date.now();
    const r = await resolveFinalUrl(`http://dual.test:${good.port}/a`);
    expect(Date.now() - started).toBeLessThan(1000);
    expect({ error: r.error, hops: r.hops, finalHost: r.finalHost }).toEqual({ error: undefined, hops: 0, finalHost: "dual.test" });
    expect(good.hits.map((h) => h.method)).toEqual(["HEAD"]);
  }, 20_000);

  test("when every address is silent the call ends at its own limit, not later", async () => {
    if (process.platform !== "linux") return;
    const port = await silentPort();
    setHostedMode(true);
    const started = Date.now();
    const e = await refusal(hostedFetch(`http://gone.test:${port}/`, { timeoutMs: 600, policy: policy({ "gone.test": [SILENT] }, [SILENT]) }));
    expect(e.name).toBe("TimeoutError");
    expect(Date.now() - started).toBeLessThan(2000);
  }, 20_000);

  test("an address that connects is the only one connected to: the later ones are never started", async () => {
    const first = await listen(ALLOWED);
    const second = await listen(REFUSED, undefined, { port: first.port });
    setHostedMode(true);
    const res = await hostedFetch(`http://both.test:${first.port}/`, { policy: policy({ "both.test": [ALLOWED, REFUSED] }, [ALLOWED, REFUSED]) });
    expect(await res.text()).toBe("ok");
    // Longer than the wait after which a second address would have been started.
    await sleep(400);
    expect({ first: first.hits.length, second: second.connections() }).toEqual({ first: 1, second: 0 });
  });

  test("a failure after the request was written does not send it again to the next address", async () => {
    const first = await listen(ALLOWED, (_q, s) => { s.destroy(); });
    const second = await listen(REFUSED, undefined, { port: first.port });
    setHostedMode(true);
    const e = await refusal(hostedFetch(`http://both.test:${first.port}/pay`, { method: "POST", body: "once", policy: policy({ "both.test": [ALLOWED, REFUSED] }, [ALLOWED, REFUSED]) }));
    expect(e.message).toBe("fetch failed");
    expect({ first: first.hits.map((h) => h.body), second: second.connections() }).toEqual({ first: ["once"], second: 0 });
  });

  test("when no checked address accepts, the call fails without naming one", async () => {
    // The port is held by a listener on another address for the whole test,
    // so nothing else on the machine can come to listen on it meanwhile (a
    // port that was only just freed could be taken by another process).
    const held = await listen(ALLOWED);
    const p = policy({ "dead.test": [NOBODY, "127.0.0.6"] }, [NOBODY, "127.0.0.6"]);
    setHostedMode(true);
    const dead = await refusal(hostedFetch(`http://dead.test:${held.port}/`, { policy: p }));
    expect(dead.message).toBe("fetch failed");
    expect((dead.cause as { code?: string }).code).toBe("ECONNREFUSED");
    expect(dead.message).not.toContain("127.0.0.");
    expect(held.connections()).toBe(0);
  });
});

describe("hosted: the ports fetch does not connect to", () => {
  // The fetch specification's bad ports, as the runtime's fetch (undici 6.21.2
  // in Node 22.19.0) lists them. 6667 is first so that code without the rule
  // fails here on a port nothing listens on, before it reaches one that
  // something on this machine may be serving.
  const BAD = [6667, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119,
    123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995,
    1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6668, 6669, 6679, 6697, 10080];

  test("a bad port and port 0 fail as fetch fails them, before anything is looked up", async () => {
    expect(new Set(BAD).size).toBe(82);
    const p = policy({ "ok.test": [ALLOWED] });
    setHostedMode(true);
    for (const port of [...BAD, 0]) {
      for (const scheme of ["http", "https"]) {
        const e = await refusal(hostedFetch(`${scheme}://ok.test:${port}/`, { policy: p }));
        expect({ port, scheme, type: e instanceof TypeError, message: e.message, cause: (e.cause as Error | undefined)?.message })
          .toEqual({ port, scheme, type: true, message: "fetch failed", cause: "bad port" });
        expect({ port, asked: p.asked }).toEqual({ port, asked: [] });
      }
    }
  });

  test("a redirect to a bad port is not followed", async () => {
    const first = await listen(ALLOWED, (_q, s) => { s.writeHead(302, { location: "http://ok.test:6667/irc" }); s.end(); });
    const p = policy({ "ok.test": [ALLOWED] });
    setHostedMode(true);
    const e = await refusal(hostedFetch(`http://ok.test:${first.port}/`, { policy: p }));
    expect({ message: e.message, cause: (e.cause as Error | undefined)?.message }).toEqual({ message: "fetch failed", cause: "bad port" });
    expect(p.asked).toEqual(["ok.test"]);
  });

  test("control: a port that is not on the list is connected to", async () => {
    const target = await listen(ALLOWED);
    expect(BAD).not.toContain(target.port);
    setHostedMode(true);
    expect((await hostedFetch(`http://ok.test:${target.port}/`, { policy: policy({ "ok.test": [ALLOWED] }) })).status).toBe(200);
  });
});

describe("hosted: redirects keep fetch's rules for method, body and logins", () => {
  /** One request that is redirected with `status`; returns what the second request looked like. */
  async function redirected(status: number, method: string, body: string | undefined, crossOrigin: boolean): Promise<Hit> {
    const end = await listen(ALLOWED);
    const start = await listen(ALLOWED, (_q, s, hit) => {
      if (hit.url !== "/start") { s.end("landed"); return; }
      s.writeHead(status, { location: crossOrigin ? `http://ok.test:${end.port}/end` : "/end" });
      s.end();
    });
    const landing = crossOrigin ? end : start;
    setHostedMode(true);
    await hostedFetch(`http://ok.test:${start.port}/start`, {
      method,
      ...(body === undefined ? {} : { body }),
      headers: { "content-type": "application/json", authorization: "Bearer t0ken", cookie: "sid=1", "proxy-authorization": "Basic eA==", "x-kept": "yes" },
      policy: policy({ "ok.test": [ALLOWED] }),
    });
    const hit = landing.hits.find((h) => h.url === "/end");
    if (!hit) throw new Error("the redirect was not followed");
    return hit;
  }

  test("301 and 302 turn a POST into a GET with no body; 303 does so for every method but HEAD", async () => {
    for (const status of [301, 302, 303]) {
      const hit = await redirected(status, "POST", '{"a":1}', false);
      expect({ status, method: hit.method, body: hit.body, type: hit.headers["content-type"], length: hit.headers["content-length"] })
        .toEqual({ status, method: "GET", body: "", type: undefined, length: undefined });
    }
    expect((await redirected(303, "PUT", "x", false)).method).toBe("GET");
    expect((await redirected(303, "HEAD", undefined, false)).method).toBe("HEAD");
    expect((await redirected(301, "PUT", "x", false)).method).toBe("PUT");
    const put = await redirected(302, "PUT", "x", false);
    expect({ method: put.method, body: put.body, type: put.headers["content-type"] }).toEqual({ method: "PUT", body: "x", type: "application/json" });
  });

  test("307 and 308 keep the method and send the body again", async () => {
    for (const status of [307, 308]) {
      const hit = await redirected(status, "POST", '{"a":1}', false);
      expect({ status, method: hit.method, body: hit.body, type: hit.headers["content-type"] })
        .toEqual({ status, method: "POST", body: '{"a":1}', type: "application/json" });
    }
  });

  test("a redirect to another origin drops Authorization, Cookie and Proxy-Authorization; one to the same origin keeps them", async () => {
    const same = await redirected(307, "GET", undefined, false);
    expect([same.headers.authorization, same.headers.cookie, same.headers["proxy-authorization"], same.headers["x-kept"]])
      .toEqual(["Bearer t0ken", "sid=1", "Basic eA==", "yes"]);
    const cross = await redirected(307, "GET", undefined, true);
    expect([cross.headers.authorization, cross.headers.cookie, cross.headers["proxy-authorization"], cross.headers["x-kept"]])
      .toEqual([undefined, undefined, undefined, "yes"]);
  });

  test("redirect: manual returns the 3xx as it is, and redirect: error throws; neither requests the target", async () => {
    const target = await listen(ALLOWED);
    const start = await listen(ALLOWED, (_q, s) => { s.writeHead(302, { location: `http://ok.test:${target.port}/next` }); s.end(); });
    const p = policy({ "ok.test": [ALLOWED] });
    setHostedMode(true);
    const res = await hostedFetch(`http://ok.test:${start.port}/`, { redirect: "manual", policy: p });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`http://ok.test:${target.port}/next`);
    const e = await refusal(hostedFetch(`http://ok.test:${start.port}/`, { redirect: "error", policy: p }));
    expect(e.message).toBe("fetch failed");
    expect(target.connections()).toBe(0);
  });

  test("a redirect to a URL that carries a login is not followed", async () => {
    const target = await listen(ALLOWED);
    const start = await listen(ALLOWED, (_q, s) => { s.writeHead(302, { location: `http://user:pass@ok.test:${target.port}/next` }); s.end(); });
    setHostedMode(true);
    const e = await refusal(hostedFetch(`http://ok.test:${start.port}/`, { policy: policy({ "ok.test": [ALLOWED] }) }));
    expect(e).toBeInstanceOf(TypeError);
    expect(e.message).toContain("login");
    expect({ start: start.hits.length, target: target.connections() }).toEqual({ start: 1, target: 0 });
  });
});

describe("hosted: a time limit and a size limit (ISC-17)", () => {
  test("a server that never answers ends the call at timeoutMs", async () => {
    const target = await listen(ALLOWED, () => { /* never answers */ });
    setHostedMode(true);
    const started = Date.now();
    const e = await refusal(hostedFetch(`http://ok.test:${target.port}/`, { timeoutMs: 200, policy: policy({ "ok.test": [ALLOWED] }) }));
    expect(e.name).toBe("TimeoutError");
    expect(Date.now() - started).toBeLessThan(2000);
    expect(target.hits.length).toBe(1);
  });

  test("the limit also covers a body that stalls after the head", async () => {
    const target = await listen(ALLOWED, (_q, s) => { s.writeHead(200, { "content-type": "text/plain" }); s.write("part"); });
    setHostedMode(true);
    const res = await hostedFetch(`http://ok.test:${target.port}/`, { timeoutMs: 300, policy: policy({ "ok.test": [ALLOWED] }) });
    expect(res.status).toBe(200);
    expect((await refusal(res.text())).name).toBe("TimeoutError");
  });

  test("the caller's signal is honoured", async () => {
    const target = await listen(ALLOWED, () => { /* never answers */ });
    setHostedMode(true);
    const started = Date.now();
    const e = await refusal(hostedFetch(`http://ok.test:${target.port}/`, { signal: AbortSignal.timeout(150), policy: policy({ "ok.test": [ALLOWED] }) }));
    expect(e.name).toBe("TimeoutError");
    expect(Date.now() - started).toBeLessThan(2000);
    const already = await refusal(hostedFetch(`http://ok.test:${target.port}/`, { signal: AbortSignal.abort(), policy: policy({ "ok.test": [ALLOWED] }) }));
    expect(already.name).toBe("AbortError");
    expect(target.hits.length).toBe(1);
  });

  test("a slow lookup is inside the limit too", async () => {
    setHostedMode(true);
    const slow: EgressPolicy = { resolve: () => new Promise((r) => setTimeout(() => r([ALLOWED]), 3000)), allow: () => true };
    const started = Date.now();
    const e = await refusal(hostedFetch("http://slow.test/", { timeoutMs: 150, policy: slow }));
    expect(e.name).toBe("TimeoutError");
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test("a body over maxBytes throws: declared, undeclared, and one that is small until decoded", async () => {
    const big = "x".repeat(5000);
    const declared = await listen(ALLOWED, (_q, s) => { s.writeHead(200, { "content-length": String(big.length) }); s.end(big); });
    const chunked = await listen(ALLOWED, (_q, s) => { s.writeHead(200); s.write(big.slice(0, 2500)); s.end(big.slice(2500)); });
    const packed = gzipSync(Buffer.from(big));
    expect(packed.length).toBeLessThan(1000);
    const bomb = await listen(ALLOWED, (_q, s) => { s.writeHead(200, { "content-encoding": "gzip", "content-length": String(packed.length) }); s.end(packed); });
    const p = policy({ "ok.test": [ALLOWED] });
    setHostedMode(true);
    expect((await refusal(hostedFetch(`http://ok.test:${declared.port}/`, { maxBytes: 1000, policy: p }))).message).toContain("larger than 1000 bytes");
    for (const target of [chunked, bomb]) {
      const e = await refusal((async () => (await hostedFetch(`http://ok.test:${target.port}/`, { maxBytes: 1000, policy: p })).text())());
      expect(e.message).toContain("larger than 1000 bytes");
    }
    // Control: the same three bodies are read whole under a limit they fit in.
    for (const target of [declared, chunked, bomb]) {
      expect((await (await hostedFetch(`http://ok.test:${target.port}/`, { maxBytes: 5000, policy: p })).text()).length).toBe(5000);
    }
  });

  // No call in src passes maxBytes or timeoutMs (the scan in
  // tests/hosted-fetch-coverage.test.ts would show one), so the hosted
  // servers run on these three values and on nothing else.
  test("the limits that ship: 10 MB, 30 seconds, ten redirects", () => {
    expect({ DEFAULT_MAX_BYTES, DEFAULT_TIMEOUT_MS, MAX_REDIRECTS }).toEqual({ DEFAULT_MAX_BYTES: 10 * 1024 * 1024, DEFAULT_TIMEOUT_MS: 30_000, MAX_REDIRECTS: 10 });
  });

  test("a call with no options runs under the size limit that ships", async () => {
    // Only the head is sent: the declared length is enough to refuse it.
    const target = await listen(ALLOWED, (_q, s, hit) => {
      s.writeHead(200, { "content-length": String(hit.url === "/over" ? DEFAULT_MAX_BYTES + 1 : DEFAULT_MAX_BYTES) });
      s.flushHeaders();
    });
    setEgressPolicyForTests(policy({ "ok.test": [ALLOWED] }));
    setHostedMode(true);
    const e = await refusal(hostedFetch(`http://ok.test:${target.port}/over`));
    expect(e.message).toContain(`larger than ${DEFAULT_MAX_BYTES} bytes`);
    // Control: a body of exactly the limit is not refused on its head.
    const at = await hostedFetch(`http://ok.test:${target.port}/at`);
    expect(at.status).toBe(200);
    await at.body?.cancel();
  });

  test("a call with no options runs under the time limit that ships, and the clock is stopped when the body is over", async () => {
    const target = await listen(ALLOWED, (_q, s) => { s.write("o"); setTimeout(() => s.end("k"), 150); });
    setEgressPolicyForTests(policy({ "ok.test": [ALLOWED] }));
    setHostedMode(true);
    const realSet = globalThis.setTimeout;
    const realClear = globalThis.clearTimeout;
    const armed: Array<{ ms: unknown; handle: unknown }> = [];
    const cleared = new Set<unknown>();
    globalThis.setTimeout = ((fn: () => void, ms?: number) => {
      const handle = realSet(fn, ms);
      armed.push({ ms, handle });
      return handle;
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = ((handle: unknown) => {
      cleared.add(handle);
      realClear(handle as Parameters<typeof clearTimeout>[0]);
    }) as unknown as typeof clearTimeout;
    try {
      const res = await hostedFetch(`http://ok.test:${target.port}/`);
      const clocks = armed.filter((t) => t.ms === DEFAULT_TIMEOUT_MS);
      expect(clocks.length).toBe(1);
      // The head has arrived and the body has not been read: the clock still runs.
      expect(cleared.has(clocks[0].handle)).toBe(false);
      expect(await res.text()).toBe("ok");
      expect(cleared.has(clocks[0].handle)).toBe(true);
    } finally {
      globalThis.setTimeout = realSet;
      globalThis.clearTimeout = realClear;
    }
  });
});

describe("hosted: the answer is a Response the callers can use", () => {
  test("gzip, deflate and br bodies are decoded, and the request offers all three", async () => {
    const text = JSON.stringify({ hello: "world", n: [1, 2, 3] });
    const pack: Record<string, (b: Buffer) => Buffer> = { gzip: gzipSync, deflate: deflateSync, br: brotliCompressSync };
    const target = await listen(ALLOWED, (_q, s, hit) => {
      const coding = hit.url.slice(1);
      s.writeHead(200, { "content-type": "application/json", "content-encoding": coding });
      s.end(pack[coding](Buffer.from(text)));
    });
    const p = policy({ "ok.test": [ALLOWED] });
    setHostedMode(true);
    for (const coding of ["gzip", "deflate", "br"]) {
      const res = await hostedFetch(`http://ok.test:${target.port}/${coding}`, { policy: p });
      expect(res.headers.get("content-encoding")).toBeNull();
      expect(await res.json()).toEqual({ hello: "world", n: [1, 2, 3] });
    }
    expect(target.hits[0].headers["accept-encoding"]).toBe("gzip, deflate, br");
    await (await hostedFetch(`http://ok.test:${target.port}/gzip`, { headers: { "accept-encoding": "gzip" }, policy: p })).text();
    expect(target.hits[3].headers["accept-encoding"]).toBe("gzip");
  });

  test("a deflate body without the zlib header is decoded too, and stays under the size limit", async () => {
    // Some servers answer Content-Encoding: deflate with the bare stream. The
    // runtime's fetch reads both forms; createInflate alone reads only one
    // (Z_DATA_ERROR "incorrect header check", measured 2026-11-12).
    const text = "hello raw deflate ".repeat(300);
    const target = await listen(ALLOWED, (_q, s, hit) => {
      s.writeHead(200, { "content-encoding": "deflate" });
      if (hit.url === "/raw") s.end(deflateRawSync(Buffer.from(text)));
      else if (hit.url === "/zlib") s.end(deflateSync(Buffer.from(text)));
      else if (hit.url === "/empty") s.end();
      else s.end(Buffer.from("this is not a deflate stream of either kind"));
    });
    const p = policy({ "ok.test": [ALLOWED] });
    setHostedMode(true);
    for (const form of ["raw", "zlib"]) {
      const res = await hostedFetch(`http://ok.test:${target.port}/${form}`, { policy: p });
      expect({ form, encoding: res.headers.get("content-encoding"), text: await res.text() }).toEqual({ form, encoding: null, text });
    }
    expect(await (await hostedFetch(`http://ok.test:${target.port}/empty`, { policy: p })).text()).toBe("");
    const over = await hostedFetch(`http://ok.test:${target.port}/raw`, { maxBytes: 1000, policy: p });
    expect((await refusal(over.text())).message).toContain("larger than 1000 bytes");
    const broken = await hostedFetch(`http://ok.test:${target.port}/broken`, { policy: p });
    expect((await refusal(broken.text())).message).toBe("fetch failed");
  });

  test("five stacked codings are undone, and a body with six is handed over as it was sent", async () => {
    const text = "stacked";
    const pack = (times: number): Buffer => {
      let out = Buffer.from(text);
      for (let i = 0; i < times; i++) out = gzipSync(out);
      return out;
    };
    const target = await listen(ALLOWED, (_q, s, hit) => {
      const times = Number(hit.url.slice(1));
      s.writeHead(200, { "content-encoding": Array(times).fill("gzip").join(", ") });
      s.end(pack(times));
    });
    const p = policy({ "ok.test": [ALLOWED] });
    setHostedMode(true);
    const five = await hostedFetch(`http://ok.test:${target.port}/5`, { policy: p });
    expect({ encoding: five.headers.get("content-encoding"), text: await five.text() }).toEqual({ encoding: null, text });
    const six = await hostedFetch(`http://ok.test:${target.port}/6`, { policy: p });
    expect(six.headers.get("content-encoding")).toBe("gzip, gzip, gzip, gzip, gzip, gzip");
    expect(Buffer.from(await six.arrayBuffer()).equals(pack(6))).toBe(true);
  });

  test("a status outside 200 to 599 comes back as fetch returns it, not as a failure", async () => {
    // linkedin.com answers clients that are not browsers with 999. Response
    // itself refuses to be built with such a status, on Node and on Bun.
    const target = await listen(ALLOWED, (_q, s, hit) => {
      s.writeHead(Number(hit.url.slice(1)), "Odd", { "x-a": "1" });
      s.end(hit.method === "HEAD" ? undefined : "nine");
    });
    const p = policy({ "ok.test": [ALLOWED] });
    setHostedMode(true);
    for (const status of [999, 600]) {
      const res = await hostedFetch(`http://ok.test:${target.port}/${status}`, { policy: p });
      expect({ status: res.status, ok: res.ok, statusText: res.statusText, header: res.headers.get("x-a"), url: res.url, text: await res.text() })
        .toEqual({ status, ok: false, statusText: "Odd", header: "1", url: `http://ok.test:${target.port}/${status}`, text: "nine" });
      const head = await hostedFetch(`http://ok.test:${target.port}/${status}`, { method: "HEAD", policy: p });
      expect({ status: head.status, ok: head.ok, body: head.body }).toEqual({ status, ok: false, body: null });
    }
    // Control: the edges of the range Response takes are untouched.
    for (const status of [200, 599]) {
      const res = await hostedFetch(`http://ok.test:${target.port}/${status}`, { policy: p });
      expect({ status: res.status, ok: res.ok }).toEqual({ status, ok: status === 200 });
      await res.text();
    }
  });

  test("status, statusText, ok, headers, url, text and json read as they do from fetch", async () => {
    const target = await listen(ALLOWED, (_q, s, hit) => {
      if (hit.url === "/missing") { s.writeHead(404, "Not Found", { "x-a": "1" }); s.end("gone"); return; }
      s.writeHead(200, { "content-type": "application/json", "set-cookie": ["a=1", "b=2"] });
      s.end(JSON.stringify({ method: hit.method, body: hit.body, type: hit.headers["content-type"] }));
    });
    const p = policy({ "ok.test": [ALLOWED] });
    setHostedMode(true);
    const missing = await hostedFetch(`http://ok.test:${target.port}/missing#part`, { policy: p });
    expect({ ok: missing.ok, status: missing.status, text: missing.statusText, header: missing.headers.get("x-a"), url: missing.url, redirected: missing.redirected })
      .toEqual({ ok: false, status: 404, text: "Not Found", header: "1", url: `http://ok.test:${target.port}/missing`, redirected: false });
    expect(await missing.text()).toBe("gone");
    const posted = await hostedFetch(new URL(`http://ok.test:${target.port}/post`), { method: "post", body: JSON.stringify({ q: 1 }), headers: { "Content-Type": "application/json" }, policy: p });
    expect(posted.ok).toBe(true);
    expect(posted.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
    expect(await posted.json()).toEqual({ method: "POST", body: '{"q":1}', type: "application/json" });
  });

  test("the connection's own headers are set here, and the rest go out as the hosted servers' fetch sent them", async () => {
    const target = await listen(ALLOWED);
    const p = policy({ "ok.test": [ALLOWED] });
    setHostedMode(true);
    await (await hostedFetch(`http://ok.test:${target.port}/`, { headers: { Host: "elsewhere.test", "Content-Length": "999", Connection: "keep-alive", "Transfer-Encoding": "chunked", "User-Agent": "probe/1" }, policy: p })).text();
    await (await hostedFetch(`http://ok.test:${target.port}/`, { method: "POST", policy: p })).text();
    const [first, second] = target.hits;
    expect({ host: first.headers.host, length: first.headers["content-length"], connection: first.headers.connection, te: first.headers["transfer-encoding"], agent: first.headers["user-agent"] })
      .toEqual({ host: `ok.test:${target.port}`, length: undefined, connection: "close", te: undefined, agent: "probe/1" });
    expect({ accept: second.headers.accept, agent: second.headers["user-agent"], length: second.headers["content-length"], cookie: second.headers.cookie })
      .toEqual({ accept: "*/*", agent: "node", length: "0", cookie: undefined });
  });

  test("a body on a GET or HEAD is refused before anything is sent, as fetch refuses it", async () => {
    const target = await listen(ALLOWED);
    const p = policy({ "ok.test": [ALLOWED] });
    setHostedMode(true);
    for (const method of ["GET", "HEAD", undefined]) {
      const e = await refusal(hostedFetch(`http://ok.test:${target.port}/`, { ...(method ? { method } : {}), body: "x", policy: p }));
      expect(e).toBeInstanceOf(TypeError);
    }
    expect(p.asked).toEqual([]);
    expect(target.connections()).toBe(0);
  });

  test("HEAD and 204 answers have no body", async () => {
    const target = await listen(ALLOWED, (_q, s, hit) => {
      if (hit.url === "/none") { s.writeHead(204); s.end(); return; }
      s.writeHead(200, { "content-length": "5" });
      s.end(hit.method === "HEAD" ? undefined : "hello");
    });
    const p = policy({ "ok.test": [ALLOWED] });
    setHostedMode(true);
    const head = await hostedFetch(`http://ok.test:${target.port}/`, { method: "HEAD", policy: p });
    expect({ status: head.status, body: head.body, length: head.headers.get("content-length") }).toEqual({ status: 200, body: null, length: "5" });
    const none = await hostedFetch(`http://ok.test:${target.port}/none`, { policy: p });
    expect({ status: none.status, body: none.body }).toEqual({ status: 204, body: null });
    expect(await none.text()).toBe("");
  });

  // The dead-port half of this test is "when no checked address accepts"
  // above: it used a port this file had just freed, which another process
  // could take in between (seen once in 56 parallel runs, 2026-11-12).
  test("a connection that closes before the body ends fails the read", async () => {
    const target = await listen(ALLOWED, (_q, s) => { s.writeHead(200, { "content-length": "100" }); s.write("short"); setTimeout(() => s.destroy(), 20); });
    const p = policy({ "ok.test": [ALLOWED] });
    setHostedMode(true);
    const res = await hostedFetch(`http://ok.test:${target.port}/`, { policy: p });
    expect((await refusal(res.text())).message).toBe("fetch failed");
  });
});

describe("hosted: what a refusal says", () => {
  // A hosted caller reads the message (llms_txt_validate returns it per
  // link). If it told a name that does not resolve from one that resolves to
  // an address this server does not connect to, a caller could list the names
  // only this machine's resolver knows. The kind is for the server's own log.
  const noAnswer: EgressPolicy = { resolve: async () => { throw Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }); }, allow: () => true };

  test("a name that does not resolve and a name on a refused address read the same, and carry their kind apart from the text", async () => {
    setHostedMode(true);
    const unresolved = await refusal(hostedFetch("http://no-such-name.test/x", { policy: noAnswer }));
    const address = await refusal(hostedFetch("http://db-internal.test/x", { policy: policy({ "db-internal.test": [REFUSED] }) }));
    const scheme = await refusal(hostedFetch("ftp://db-internal.test/x", { policy: noAnswer }));
    for (const e of [unresolved, address, scheme]) expect(e).toBeInstanceOf(EgressRefused);
    expect(unresolved.message).toBe(address.message);
    expect(address.message).not.toMatch(/private|reserved|127\.0\.0/);
    expect(address.message).toContain("refused");
    expect([refusalKind(unresolved), refusalKind(address), refusalKind(scheme)]).toEqual(["unresolved", "address", "scheme"]);
    expect((address as unknown as { kind: string }).kind).toBe("address");
    expect([refusalKind(new Error("x")), refusalKind(new EgressRefused("made elsewhere")), refusalKind(undefined)]).toEqual([undefined, undefined, undefined]);
  });

  test("the same on a redirect hop", async () => {
    const first = await listen(ALLOWED, (_q, s, hit) => { s.writeHead(302, { location: `http://${hit.url.slice(1)}/x` }); s.end(); });
    setHostedMode(true);
    const p: EgressPolicy = { resolve: async (host) => (host === "ok.test" ? [ALLOWED] : host === "db-internal.test" ? [REFUSED] : noAnswer.resolve!(host)), allow: (ip) => ip === ALLOWED };
    const unresolved = await refusal(hostedFetch(`http://ok.test:${first.port}/no-such-name.test`, { policy: p }));
    const address = await refusal(hostedFetch(`http://ok.test:${first.port}/db-internal.test`, { policy: p }));
    expect(unresolved.message).toBe(address.message);
    expect(address.message).toContain("redirect");
    expect([refusalKind(unresolved), refusalKind(address)]).toEqual(["unresolved", "address"]);
  });

  test("llms_txt_validate reports both kinds of link with one text", async () => {
    setEgressPolicyForTests({ resolve: async (host) => (host === "db-internal.test" ? [REFUSED] : noAnswer.resolve!(host)), allow: (ip) => ip === ALLOWED });
    setHostedMode(true);
    const result = await validateLlmsTxt("# Site\n\n## Docs\n\n- [One](http://db-internal.test/x): first\n- [Two](http://no-such-name.test/y): second\n");
    const messages = result.issues.filter((i) => i.type === "link").map((i) => i.message);
    expect(messages.length).toBe(2);
    expect(messages[0]).toBe(messages[1]);
    expect(messages[0]).toContain("refused");
  });
});

describe("hosted https: pinned to the address, certificate checked against the name", () => {
  const dir = mkdtempSync(join(tmpdir(), "cbrowser-hosted-fetch-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const cert = (name: string, san: string): { key: Buffer; cert: Buffer } => {
    const key = join(dir, `${name}.key`);
    const crt = join(dir, `${name}.crt`);
    const made = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", crt, "-days", "2", "-subj", `/CN=${name}`, "-addext", `subjectAltName=${san}`]);
    if (made.status !== 0) throw new Error(`openssl failed: ${String(made.stderr)}`);
    return { key: readFileSync(key), cert: readFileSync(crt) };
  };
  const forName = cert("tls.test", "DNS:tls.test");
  const forAddress = cert("address", `IP:${ALLOWED}`);

  test("a certificate nobody vouches for fails the call, and no request is made", async () => {
    const target = await listen(ALLOWED, undefined, { tls: forName });
    setHostedMode(true);
    const e = await refusal(hostedFetch(`https://tls.test:${target.port}/`, { policy: policy({ "tls.test": [ALLOWED] }) }));
    expect(e.message).toBe("fetch failed");
    expect((e.cause as { code?: string }).code).toBe("DEPTH_ZERO_SELF_SIGNED_CERT");
    expect(target.hits.length).toBe(0);
  });

  test("the environment switch that turns certificate checks off does not reach this request", async () => {
    const target = await listen(ALLOWED, undefined, { tls: forName });
    const before = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    try {
      setHostedMode(true);
      const e = await refusal(hostedFetch(`https://tls.test:${target.port}/`, { policy: policy({ "tls.test": [ALLOWED] }) }));
      expect((e.cause as { code?: string }).code).toBe("DEPTH_ZERO_SELF_SIGNED_CERT");
      expect(target.hits.length).toBe(0);
    } finally {
      if (before === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = before;
    }
  });

  test("with the certificate trusted the request arrives at the checked address, under the name", async () => {
    const target = await listen(ALLOWED, undefined, { tls: forName });
    const elsewhere = await listen(REFUSED, undefined, { tls: forName, port: target.port });
    let asked = 0;
    const rebinding: EgressPolicy = { resolve: async () => (asked++ === 0 ? [ALLOWED] : [REFUSED]), allow: () => true };
    setHostedMode(true);
    const res = await hostedFetch(`https://tls.test:${target.port}/page?x=1`, { policy: rebinding, ca: forName.cert });
    expect(await res.text()).toBe("ok");
    expect(asked).toBe(1);
    expect(target.hits.map((h) => ({ url: h.url, host: h.headers.host, sni: h.sni }))).toEqual([{ url: "/page?x=1", host: `tls.test:${target.port}`, sni: "tls.test" }]);
    expect(elsewhere.connections()).toBe(0);
  });

  test("a trusted certificate for another name is still refused", async () => {
    const target = await listen(ALLOWED, undefined, { tls: forName });
    setHostedMode(true);
    const e = await refusal(hostedFetch(`https://other.test:${target.port}/`, { policy: policy({ "other.test": [ALLOWED] }), ca: forName.cert }));
    expect((e.cause as { code?: string }).code).toBe("ERR_TLS_CERT_ALTNAME_INVALID");
    expect(target.hits.length).toBe(0);
  });

  test("the connection that won the wait is the one the certificate is checked on, under the name", async () => {
    if (process.platform !== "linux") return;
    const target = await silentThenWorking(ALLOWED, { tls: forName });
    setHostedMode(true);
    const p = policy({ "tls.test": [SILENT, ALLOWED] }, [SILENT, ALLOWED]);
    const started = Date.now();
    const res = await hostedFetch(`https://tls.test:${target.port}/late`, { policy: p, ca: forName.cert });
    expect(await res.text()).toBe("ok");
    expect(Date.now() - started).toBeLessThan(1000);
    expect(target.hits.map((h) => ({ url: h.url, host: h.headers.host, sni: h.sni }))).toEqual([{ url: "/late", host: `tls.test:${target.port}`, sni: "tls.test" }]);
    // The same route with the certificate not vouched for, and vouched for under another name.
    const untrusted = await refusal(hostedFetch(`https://tls.test:${target.port}/late`, { policy: p }));
    expect((untrusted.cause as { code?: string }).code).toBe("DEPTH_ZERO_SELF_SIGNED_CERT");
    const other = await refusal(hostedFetch(`https://other.test:${target.port}/late`, { policy: policy({ "other.test": [SILENT, ALLOWED] }, [SILENT, ALLOWED]), ca: forName.cert }));
    expect((other.cause as { code?: string }).code).toBe("ERR_TLS_CERT_ALTNAME_INVALID");
    expect(target.hits.length).toBe(1);
  }, 30_000);

  test("a redirect from https to http on the same host and port is another origin: the login headers are not sent in the clear", async () => {
    // Host and port alone would read as the same place. The name answers a
    // second address for the second hop so that one port can serve both.
    const secure = await listen(ALLOWED, (_q, s) => { s.writeHead(307, { location: `http://tls.test:${secure.port}/end` }); s.end(); }, { tls: forName });
    const plain = await listen(NOBODY, undefined, { port: secure.port });
    let asked = 0;
    const twoHomes: EgressPolicy = { resolve: async () => (asked++ === 0 ? [ALLOWED] : [NOBODY]), allow: () => true };
    setHostedMode(true);
    const res = await hostedFetch(`https://tls.test:${secure.port}/start`, {
      headers: { authorization: "Bearer t0ken", cookie: "sid=1", "proxy-authorization": "Basic eA==", "x-kept": "yes" },
      policy: twoHomes,
      ca: forName.cert,
    });
    expect(await res.text()).toBe("ok");
    expect(secure.hits.map((h) => h.headers.authorization)).toEqual(["Bearer t0ken"]);
    expect(plain.hits.map((h) => [h.url, h.headers.authorization, h.headers.cookie, h.headers["proxy-authorization"], h.headers["x-kept"]]))
      .toEqual([["/end", undefined, undefined, undefined, "yes"]]);
  });

  test("an address literal is checked against a certificate for the address", async () => {
    const target = await listen(ALLOWED, undefined, { tls: forAddress });
    const named = await listen(ALLOWED, undefined, { tls: forName });
    const p = policy({});
    setHostedMode(true);
    const res = await hostedFetch(`https://${ALLOWED}:${target.port}/`, { policy: p, ca: forAddress.cert });
    expect(res.status).toBe(200);
    const e = await refusal(hostedFetch(`https://${ALLOWED}:${named.port}/`, { policy: p, ca: forName.cert }));
    expect((e.cause as { code?: string }).code).toBe("ERR_TLS_CERT_ALTNAME_INVALID");
  });
});

describe("not hosted: the runtime's fetch, as it was", () => {
  test("fetch gets the caller's arguments, with only this function's own options taken out, and nothing is looked up", async () => {
    const real = globalThis.fetch;
    const calls: Array<{ input: unknown; init: unknown }> = [];
    globalThis.fetch = (async (input: unknown, init: unknown) => { calls.push({ input, init }); return new Response("plain"); }) as unknown as typeof fetch;
    const noLookup: EgressPolicy = { resolve: async () => { throw new Error("looked up"); }, allow: () => { throw new Error("judged"); } };
    setEgressPolicyForTests(noLookup);
    try {
      const init = { method: "POST", body: "b", redirect: "manual" as const };
      expect(await (await hostedFetch("http://refused.test/x", init)).text()).toBe("plain");
      await hostedFetch("http://refused.test/y");
      await hostedFetch("http://refused.test/z", { method: "HEAD", maxBytes: 5, timeoutMs: 5, policy: noLookup, ca: "x" });
      expect(calls[0].input).toBe("http://refused.test/x");
      expect(calls[0].init).toBe(init);
      expect(calls[1]).toEqual({ input: "http://refused.test/y", init: undefined });
      expect(calls[2].init).toEqual({ method: "HEAD" });
    } finally {
      globalThis.fetch = real;
    }
  });

  test("a listener on 127.0.0.1 is reached, redirects and all", async () => {
    const target = await listen("127.0.0.1", (_q, s, hit) => {
      if (hit.url === "/start") { s.writeHead(302, { location: "/end" }); s.end(); return; }
      s.end("local");
    });
    const res = await hostedFetch(`${target.origin}/start`, { maxBytes: 1 });
    expect(await res.text()).toBe("local");
    expect(target.hits.map((h) => h.url)).toEqual(["/start", "/end"]);
  });
});

describe("the hosted call sites go through the check (ISC-19, by behaviour)", () => {
  /** Runs `call` hosted (expects no connection) and then not hosted (expects the listener to be reached). */
  async function refusedThenReached(call: (origin: string) => Promise<unknown>, handler?: Handler): Promise<number> {
    const target = await listen("127.0.0.1", handler ?? ((_q, s) => { s.writeHead(404); s.end("no"); }));
    setHostedMode(true);
    await call(target.origin).catch(() => undefined);
    expect({ hosted: true, connections: target.connections() }).toEqual({ hosted: true, connections: 0 });
    setHostedMode(false);
    await call(target.origin).catch(() => undefined);
    expect(target.hits.length).toBeGreaterThan(0);
    return target.hits.length;
  }

  test("resolveFinalUrl: a refused first hop is not requested, and the gate keeps the requested host", async () => {
    const target = await listen("127.0.0.1");
    setHostedMode(true);
    const r = await resolveFinalUrl(`${target.origin}/a`);
    expect(target.connections()).toBe(0);
    expect({ finalUrl: r.finalUrl, hops: r.hops, hostChanged: r.hostChanged }).toEqual({ finalUrl: `${target.origin}/a`, hops: 0, hostChanged: false });
    expect(r.error).toContain("refused");
    expect(r.error).not.toContain("127.0.0.1:");
    setHostedMode(false);
    const reached = await resolveFinalUrl(`${target.origin}/a`);
    expect(reached.error).toBeUndefined();
    expect(target.hits.map((h) => h.method)).toEqual(["HEAD"]);
  });

  test("resolveFinalUrl: a redirect hop that is refused at connection time is reported as a blocked hop is", async () => {
    const target = await listen(REFUSED);
    // An IPv4 address written inside IPv6: the early name check does not read it, the address check does.
    const viaLiteral = await listen(ALLOWED, (_q, s) => { s.writeHead(302, { location: `http://[::ffff:${REFUSED}]:${target.port}/x` }); s.end(); });
    const viaName = await listen(ALLOWED, (_q, s) => { s.writeHead(302, { location: `http://refused.test:${target.port}/x` }); s.end(); });
    setEgressPolicyForTests(policy({ "refused.test": [REFUSED] }));
    setHostedMode(true);
    for (const first of [viaLiteral, viaName]) {
      const start = `http://${ALLOWED}:${first.port}/start`;
      const r = await resolveFinalUrl(start);
      expect({ finalUrl: r.finalUrl, hops: r.hops, finalHost: r.finalHost, hostChanged: r.hostChanged }).toEqual({ finalUrl: start, hops: 0, finalHost: ALLOWED, hostChanged: false });
      expect(r.error).toContain("redirect into private address space");
      expect(first.hits.length).toBe(1);
    }
    expect({ hits: target.hits.length, connections: target.connections() }).toEqual({ hits: 0, connections: 0 });
    // Control: with that address allowed the same chain is walked to its end.
    setEgressPolicyForTests(policy({ "refused.test": [REFUSED] }, [ALLOWED, REFUSED]));
    const walked = await resolveFinalUrl(`http://${ALLOWED}:${viaName.port}/start`);
    expect({ finalHost: walked.finalHost, hops: walked.hops, error: walked.error }).toEqual({ finalHost: "refused.test", hops: 1, error: undefined });
    expect(target.hits.length).toBe(1);
  });

  test("resolveFinalUrl: a name that does not resolve is a failed fetch at that hop, not a refused private address", async () => {
    // Reported as a private-address refusal until 2026-11-12, so a typo or a
    // DNS outage read in the server log as an attempt on the internal network.
    const first = await listen(ALLOWED, (_q, s) => { s.writeHead(302, { location: "http://typo-domain.test/x" }); s.end(); });
    setEgressPolicyForTests({ resolve: async (host) => { if (host === "good.test") return [ALLOWED]; throw new Error("ENOTFOUND"); }, allow: (ip) => ip === ALLOWED });
    setHostedMode(true);
    const direct = await resolveFinalUrl("http://typo-domain.test/");
    expect({ finalUrl: direct.finalUrl, hops: direct.hops, hostChanged: direct.hostChanged }).toEqual({ finalUrl: "http://typo-domain.test/", hops: 0, hostChanged: false });
    expect(direct.error).toStartWith("fetch failed: ");
    expect(direct.error).not.toContain("private address space");
    const start = `http://good.test:${first.port}/`;
    const hop = await resolveFinalUrl(start);
    expect({ finalUrl: hop.finalUrl, finalHost: hop.finalHost, hops: hop.hops, hostChanged: hop.hostChanged })
      .toEqual({ finalUrl: "http://typo-domain.test/x", finalHost: "typo-domain.test", hops: 1, hostChanged: true });
    expect(hop.error).toStartWith("fetch failed: ");
    expect(hop.error).not.toContain("private address space");
  });

  test("resolveFinalUrl: a redirect target that answers 999 ends the chain there, with no error", async () => {
    // With an error set the gate falls back to the requested host, so the
    // redirect target would have gone ungated.
    const odd = await listen(ALLOWED, (_q, s) => { s.writeHead(999); s.end(); });
    const first = await listen(ALLOWED, (_q, s) => { s.writeHead(301, { location: `http://other.test:${odd.port}/in` }); s.end(); });
    setEgressPolicyForTests(policy({ "a.test": [ALLOWED], "other.test": [ALLOWED] }));
    setHostedMode(true);
    const r = await resolveFinalUrl(`http://a.test:${first.port}/to999`);
    expect({ finalHost: r.finalHost, hops: r.hops, hostChanged: r.hostChanged, error: r.error }).toEqual({ finalHost: "other.test", hops: 1, hostChanged: true, error: undefined });
  });

  test("llms_txt_validate: the file read and the link check", async () => {
    await refusedThenReached((origin) => validateLlmsTxtFromUrl(origin));
    const hits = await refusedThenReached((origin) => validateLlmsTxt(`# Site\n\n## Docs\n\n- [One](${origin}/one): first\n- [Two](${origin}/two): second\n`));
    expect(hits).toBe(2);
  });

  test("llms_txt_diff: the read of the existing file", async () => {
    // 500 on the read would start a crawl; a body that is already a file does not.
    await refusedThenReached((origin) => diffLlmsTxtFromUrl(origin, { llmsTxtUrl: `${origin}/llms.txt`, crawl: false, maxPages: 0 }).catch(() => undefined),
      (_q, s) => { s.destroy(); });
  });

  test("coverage: the sitemap read", async () => {
    const hits = await refusedThenReached((origin) => parseSitemap(`${origin}/sitemap.xml`));
    expect(hits).toBe(1);
  });

  test("security_audit: both requests to mcp_url", async () => {
    const handlers: Record<string, (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: Array<{ text?: string }> }>> = {};
    registerSecurityTools({ registerTool: (name: string, _config: unknown, handler: never) => { handlers[name] = handler; } } as never);
    const answer = (_q: IncomingMessage, s: ServerResponse): void => { s.writeHead(200, { "content-type": "text/event-stream" }); s.end('data: {"result":{"tools":[]}}\n\n'); };
    const hits = await refusedThenReached((origin) => handlers.security_audit({ mcp_url: `${origin}/mcp` }), answer);
    expect(hits).toBe(2);
    const target = await listen("127.0.0.1", answer);
    setHostedMode(true);
    const refused = await handlers.security_audit({ mcp_url: `${target.origin}/mcp` });
    expect(refused.isError).toBe(true);
    expect(refused.content[0].text).toContain("refused");
    expect(target.connections()).toBe(0);
  });

  test("webmcp_ready_audit: every request, and as many through the check as without it", async () => {
    const plain = await refusedThenReached((origin) => runWebMCPReadyAudit(origin, { timeout: 2000 }));
    expect(plain).toBeGreaterThanOrEqual(10);
    // Hosted with 127.0.0.1 allowed: the same requests arrive, now through the pinned path.
    const target = await listen("127.0.0.1", (_q, s) => { s.writeHead(404); s.end("no"); });
    setEgressPolicyForTests({ allow: (ip) => ip === "127.0.0.1" });
    setHostedMode(true);
    await runWebMCPReadyAudit(target.origin, { timeout: 2000 });
    expect(target.hits.length).toBe(plain);
  });
});

describe("llms_txt_validate: the link check is bounded", () => {
  // Until 2026-11-12 every link was requested at the same moment (Promise.all
  // over the whole list) and a hosted caller chose how many: 2000 links in an
  // 88 KB file opened 2000 connections at once from this machine.

  /** A file of `count` links to `origin`, one per line from line 5 on. */
  const fileOf = (origin: string, count: number): string =>
    `# Site\n\n## Docs\n\n${Array.from({ length: count }, (_x, i) => `- [L${i}](${origin}/l${i}): link ${i}`).join("\n")}\n`;

  /** A listener that holds each request for a while, answers 404 for the paths in `missing`, and knows how many it held at once. */
  async function holding(holdMs: (path: string) => number, missing: string[] = []): Promise<Listener & { peak: () => number }> {
    let now = 0;
    let peak = 0;
    const target = await listen("127.0.0.1", (_q, s, hit) => {
      now++;
      peak = Math.max(peak, now);
      setTimeout(() => {
        now--;
        s.writeHead(missing.includes(hit.url) ? 404 : 200);
        s.end();
      }, holdMs(hit.url));
    });
    return { ...target, peak: () => peak };
  }

  test("hosted: eight links at a time, every link checked, and the issues in the order of the links", async () => {
    // /l1 is slow and /l5 fast, so they finish in the other order.
    const target = await holding((path) => (path === "/l1" ? 150 : path === "/l5" ? 5 : 40), ["/l1", "/l5", "/l33"]);
    setEgressPolicyForTests({ allow: (ip) => ip === "127.0.0.1" });
    setHostedMode(true);
    const issues = await validateLlmsTxtLinks(fileOf(target.origin, 40), { maxLinksToValidate: 40 });
    expect({ requests: target.hits.length, peak: target.peak() }).toEqual({ requests: 40, peak: 8 });
    expect(issues).toEqual([1, 5, 33].map((i) => ({ line: 5 + i, severity: "warning", type: "link", message: "Link returned status 404", content: `${target.origin}/l${i}` })));
    expect(LINK_CHECK_POOL).toBe(8);
  });

  test("hosted: at most 100 links are checked in one call, and the result says so when more were asked for", async () => {
    // Two broken links among the hundred that are checked, and one past them that is never asked for.
    const target = await holding(() => 1, ["/l3", "/l50", "/l120"]);
    setEgressPolicyForTests({ allow: (ip) => ip === "127.0.0.1" });
    setHostedMode(true);
    const result = await validateLlmsTxt(fileOf(target.origin, 130), { maxLinksToValidate: 1_000_000 });
    // The note is not a broken link: only the two that answered 404 are counted.
    expect({ requests: target.hits.length, linkCount: result.linkCount, linksValidated: result.linksValidated, brokenLinks: result.brokenLinks, valid: result.valid })
      .toEqual({ requests: 100, linkCount: 130, linksValidated: 100, brokenLinks: 2, valid: true });
    expect(target.peak()).toBeLessThanOrEqual(8);
    const notes = result.issues.filter((i) => i.message.includes("hosted"));
    expect(notes).toEqual([{ line: 105, severity: "warning", type: "link", message: "Only the first 100 of the 130 links asked for were checked: a hosted server checks at most 100 links in one call." }]);
    expect(result.summary.warnings).toBe(result.issues.filter((i) => i.severity === "warning").length);
    // The last link that was checked is the hundredth, and the first one left out is the next.
    expect(target.hits.some((h) => h.url === "/l99")).toBe(true);
    expect(target.hits.some((h) => h.url === "/l100")).toBe(false);
    expect(HOSTED_MAX_LINKS).toBe(100);
  });

  test("hosted: the llms_txt_validate tool carries the note in its issues, and still takes any number", async () => {
    const tools: Record<string, { config: { inputSchema: z.ZodRawShape }; handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }> }> = {};
    registerLlmsTxtTools({ registerTool: (name: string, config: never, handler: never) => { tools[name] = { config, handler }; } } as never, {} as never);
    // The bound is in the link check, not in the schema: a value an existing caller sends must not start failing validation.
    expect(z.object(tools.llms_txt_validate.config.inputSchema).safeParse({ content: "# x", maxLinksToValidate: 1_000_000 }).success).toBe(true);
    const target = await holding(() => 1);
    setEgressPolicyForTests({ allow: (ip) => ip === "127.0.0.1" });
    setHostedMode(true);
    const out = await tools.llms_txt_validate.handler({ content: fileOf(target.origin, 130), validateLinks: true, maxLinksToValidate: 1_000_000 });
    const body = JSON.parse(out.content[0].text) as { linksValidated: number; brokenLinks: number; valid: boolean; issues: Array<{ line: number; severity: string; message: string }> };
    expect({ requests: target.hits.length, linksValidated: body.linksValidated, brokenLinks: body.brokenLinks, valid: body.valid })
      .toEqual({ requests: 100, linksValidated: 100, brokenLinks: 0, valid: true });
    expect(body.issues.filter((i) => i.message.includes("hosted")).map((i) => [i.line, i.severity])).toEqual([[105, "warning"]]);
  });

  test("hosted: a number that is not a count does not get around the limit", async () => {
    const target = await holding(() => 1);
    setEgressPolicyForTests({ allow: (ip) => ip === "127.0.0.1" });
    setHostedMode(true);
    // slice(0, -5) is everything but the last five, and Infinity is everything.
    for (const asked of [-5, Number.POSITIVE_INFINITY]) {
      const before = target.hits.length;
      const result = await validateLlmsTxt(fileOf(target.origin, 130), { maxLinksToValidate: asked });
      expect({ asked, requests: target.hits.length - before, linksValidated: result.linksValidated }).toEqual({ asked, requests: 100, linksValidated: 100 });
    }
  });

  test("hosted: no note when nothing was left out, whatever number was asked for", async () => {
    const target = await holding(() => 1);
    setEgressPolicyForTests({ allow: (ip) => ip === "127.0.0.1" });
    setHostedMode(true);
    const all = await validateLlmsTxt(fileOf(target.origin, 30), { maxLinksToValidate: 1000 });
    expect({ requests: target.hits.length, linksValidated: all.linksValidated, notes: all.issues.filter((i) => i.message.includes("hosted")).length })
      .toEqual({ requests: 30, linksValidated: 30, notes: 0 });
    const byDefault = await validateLlmsTxt(fileOf(target.origin, 130));
    expect({ requests: target.hits.length - 30, linksValidated: byDefault.linksValidated, notes: byDefault.issues.filter((i) => i.message.includes("hosted")).length })
      .toEqual({ requests: 20, linksValidated: 20, notes: 0 });
  });

  test("not hosted: as many links as were asked for, with no limit and no note", async () => {
    const target = await holding(() => 1);
    const result = await validateLlmsTxt(fileOf(target.origin, 130), { maxLinksToValidate: 1000 });
    expect({ requests: target.hits.length, linksValidated: result.linksValidated, brokenLinks: result.brokenLinks, notes: result.issues.filter((i) => i.message.includes("hosted")).length })
      .toEqual({ requests: 130, linksValidated: 130, brokenLinks: 0, notes: 0 });
  });

  /** A listener that takes every request and never answers it, and how many it has taken. */
  const neverAnswering = (): Promise<Listener> => listen("127.0.0.1", () => {});

  /** What one link that ran out of linkTimeout comes back as: the result every link left over at the deadline gets too. */
  async function timedOutIssue(origin: string): Promise<string> {
    const [issue] = await validateLlmsTxtLinks(fileOf(origin, 1), { linkTimeout: 50 });
    expect(issue.message.startsWith("Link unreachable: ")).toBe(true);
    return issue.message;
  }

  test("not hosted: every link is requested at once, so dead links take one linkTimeout, as at the last release", async () => {
    // Promise.all over the selection, each link with its own timer: twenty
    // dead links end together after one linkTimeout. A pool of eight would
    // take three (fix review of 2026-11-12, fetch-1).
    const target = await neverAnswering();
    const message = await timedOutIssue(target.origin);
    const before = target.hits.length;
    const started = Date.now();
    const issues = await validateLlmsTxtLinks(fileOf(target.origin, 20), { linkTimeout: 300, maxLinksToValidate: 20 });
    const took = Date.now() - started;
    expect({ requested: target.hits.length - before, issues: issues.length, messages: [...new Set(issues.map((i) => i.message))] })
      .toEqual({ requested: 20, issues: 20, messages: [message] });
    expect(took).toBeGreaterThanOrEqual(290);
    expect(took).toBeLessThan(600);
  });

  test("hosted: the whole check ends at linkTimeout plus five seconds, and what was not done by then reads as a link that timed out", async () => {
    // A hundred dead links, eight at a time with 1.5 s each, would take 19.5
    // seconds; one deadline for the call ends it at 6.5. The deadline does not
    // fall where a batch times out by itself (6 s, then 7.5 s), so the links
    // still out at 6.5 s are seen to be cut short by it.
    const target = await neverAnswering();
    setEgressPolicyForTests({ allow: (ip) => ip === "127.0.0.1" });
    setHostedMode(true);
    const message = await timedOutIssue(target.origin);
    const before = target.hits.length;
    const started = Date.now();
    // The hundredth is a relative link: not started by the deadline, and still skipped, not counted as unreachable.
    const result = await validateLlmsTxt(`${fileOf(target.origin, 99)}- [Rel](/relative)\n`, { linkTimeout: 1500, maxLinksToValidate: 100 });
    const took = Date.now() - started;
    expect(took).toBeGreaterThanOrEqual(6400);
    expect(took).toBeLessThan(7200);
    // Eight at a time, five batches started before 6.5 s: about 40, and the rest never asked for.
    const requested = target.hits.length - before;
    expect(requested).toBeGreaterThan(30);
    expect(requested).toBeLessThan(70);
    const linkIssues = result.issues.filter((i) => i.type === "link");
    expect({ issues: linkIssues.length, brokenLinks: result.brokenLinks, linksValidated: result.linksValidated, lines: linkIssues.map((i) => i.line) })
      .toEqual({ issues: 99, brokenLinks: 99, linksValidated: 100, lines: Array.from({ length: 99 }, (_x, i) => 5 + i) });
    expect([...new Set(linkIssues.map((i) => i.message))]).toEqual([message]);
  }, 30_000);

  test("hosted: links that answer are not touched by the deadline, and a relative link is still skipped after it", async () => {
    const target = await holding(() => 1, ["/l2"]);
    setEgressPolicyForTests({ allow: (ip) => ip === "127.0.0.1" });
    setHostedMode(true);
    const started = Date.now();
    const issues = await validateLlmsTxtLinks(`${fileOf(target.origin, 30)}- [Rel](/relative)\n`, { linkTimeout: 1000, maxLinksToValidate: 31 });
    // Done when the links are done, not at the deadline.
    expect(Date.now() - started).toBeLessThan(1000);
    expect(issues.map((i) => [i.line, i.message])).toEqual([[7, "Link returned status 404"]]);
    expect(target.hits.length).toBe(30);
  });
});
