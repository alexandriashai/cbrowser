/**
 * The lookup behind resolveForEgress (src/egress.ts): the system lookup
 * through c-ares, and the sharing, memory and ceiling around it.
 *
 * The first hosted egress change looked every name up with dns.lookup, which
 * is getaddrinfo on libuv's thread pool, two at a time for the whole process.
 * A page with eight names whose name server stayed silent made another
 * account's gate answer 403 for a healthy name after ten seconds, and nothing
 * shared, remembered or bounded the lookups (review of 2026-11-12:
 * regression-1, gate-bypass-3, policy-1). That the pool no longer matters was
 * measured outside this file, under Node 22.19.0 and Bun 1.4.4 in a private
 * network namespace; what is pinned here is everything that can be pinned
 * with a listener on this machine.
 *
 * No query leaves the machine. The name server is a UDP socket of this file
 * on 127.0.0.1, handed to c-ares through the `servers` option, so the real
 * resolver code runs and the system's name servers are never asked. Names
 * end in .test. The addresses in the answers are borrowed for the table only
 * and are never connected to.
 *
 * @copyright 2026 Alexandria Eden alexandria.shai.eden@gmail.com https://cbrowser.ai
 * @license MIT
 */
import { describe, test, expect, beforeAll, afterAll, afterEach } from "bun:test";
import { createSocket, type Socket } from "node:dgram";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  systemLookup,
  cachedResolver,
  egressLookup,
  resolveForEgress,
  setEgressPolicyForTests,
  LOOKUP_TIMEOUT_MS,
  LOOKUP_TRY_MS,
  LOOKUP_TRIES,
  LOOKUP_ANSWER_TTL_MS,
  LOOKUP_NO_ANSWER_TTL_MS,
  LOOKUP_CACHE_NAMES,
  LOOKUP_IN_FLIGHT,
  LOOKUP_WAITING,
  LOOKUP_WAIT_MS,
  LOOKUP_OWNER_IN_FLIGHT,
  LOOKUP_OWNER_WAITING,
  LOOKUP_REMEMBERED_ADDRESSES,
  type EgressResolver,
} from "../src/egress.js";

const REFUSAL = "the host cannot be reached from this server: its name does not resolve, or resolves to an address the server does not connect to";
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

// ---- a name server on 127.0.0.1 that answers from a table -------------------

const A = 1;
const CNAME = 5;
const AAAA = 28;
type Zone = Record<string, { a?: string[]; aaaa?: string[]; cname?: string }>;
const ZONE: Zone = {
  "both.test": { a: ["93.184.216.34", "93.184.216.35"], aaaa: ["2606:4700:4700::1111"] },
  "a-only.test": { a: ["93.184.216.34"] },
  "aaaa-only.test": { aaaa: ["2606:4700:4700::1111"] },
  "no-address.test": {},
  "cname.test": { cname: "mid.test" },
  "mid.test": { cname: "both.test" },
  "xn--bcher-kva.test": { a: ["93.184.216.36"] },
  "private.test": { a: ["10.0.0.5"], aaaa: ["::1"] },
  "localhost.test": { a: ["93.184.216.37"] },
};
/** Never answered, whatever is asked. */
const SILENT = /(^|\.)silent\.test$/;
/** A is answered, AAAA never. */
const HALF = /(^|\.)half\.test$/;

const encodeName = (name: string): Buffer =>
  Buffer.concat([...name.split(".").filter(Boolean).map((label) => Buffer.concat([Buffer.from([label.length]), Buffer.from(label, "latin1")])), Buffer.from([0])]);

function v6Bytes(text: string): Buffer {
  const halves = text.split("::");
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const groups = [...head, ...Array<string>(8 - head.length - tail.length).fill("0"), ...tail];
  const out = Buffer.alloc(16);
  groups.forEach((g, i) => out.writeUInt16BE(parseInt(g, 16), i * 2));
  return out;
}

function record(name: string, type: number, value: string): Buffer {
  const data = type === A ? Buffer.from(value.split(".").map(Number)) : type === CNAME ? encodeName(value) : v6Bytes(value);
  const fixed = Buffer.alloc(10);
  fixed.writeUInt16BE(type, 0);
  fixed.writeUInt16BE(1, 2);
  fixed.writeUInt32BE(60, 4);
  fixed.writeUInt16BE(data.length, 8);
  return Buffer.concat([encodeName(name), fixed, data]);
}

interface Asked { name: string; type: "A" | "AAAA" | string; at: number }
let server: Socket;
let servers: string[] = [];
const asked: Asked[] = [];
/** The questions the name server has seen for one name, as "A AAAA". */
const questions = (name: string): string => asked.filter((q) => q.name.toLowerCase() === name.toLowerCase()).map((q) => q.type).sort().join(" ");

beforeAll(async () => {
  server = createSocket("udp4");
  server.on("message", (msg, from) => {
    const labels: string[] = [];
    let off = 12;
    while (msg[off] !== 0) {
      labels.push(msg.subarray(off + 1, off + 1 + msg[off]).toString("latin1"));
      off += 1 + msg[off];
    }
    const end = off + 5;
    const qtype = msg.readUInt16BE(off + 1);
    const name = labels.join(".");
    asked.push({ name, type: qtype === A ? "A" : qtype === AAAA ? "AAAA" : String(qtype), at: performance.now() });
    const lower = name.toLowerCase();
    if (SILENT.test(lower) || (HALF.test(lower) && qtype === AAAA)) return;
    const answers: Buffer[] = [];
    let rcode = 0;
    let at = lower;
    for (let hops = 0; ZONE[at]?.cname && hops < 5; hops++) {
      answers.push(record(at, CNAME, ZONE[at].cname as string));
      at = ZONE[at].cname as string;
    }
    if (HALF.test(at)) answers.push(record(at, A, "93.184.216.38"));
    else if (!ZONE[at]) rcode = 3;
    else for (const value of (qtype === A ? ZONE[at].a : qtype === AAAA ? ZONE[at].aaaa : undefined) ?? []) answers.push(record(at, qtype, value));
    const head = Buffer.alloc(12);
    msg.copy(head, 0, 0, 2);
    head.writeUInt16BE(0x8180 | rcode, 2);
    head.writeUInt16BE(1, 4);
    head.writeUInt16BE(answers.length, 6);
    server.send(Buffer.concat([head, msg.subarray(12, end), ...answers]), from.port, from.address);
  });
  await new Promise<void>((done) => server.bind(0, "127.0.0.1", done));
  servers = [`127.0.0.1:${server.address().port}`];
});
afterAll(() => {
  server.close();
});
afterEach(() => {
  setEgressPolicyForTests(null);
});

// The suite runs under Bun and the hosted servers under Node, and the two
// bring their own c-ares bindings. Node loads the module's TypeScript as it
// is from 22.6 on (type stripping), which lets one test run the lookup there.
const nodeVersion = ((): [number, number] | null => {
  try {
    const m = /^v(\d+)\.(\d+)/.exec(spawnSync("node", ["--version"], { encoding: "utf8" }).stdout ?? "");
    return m ? [Number(m[1]), Number(m[2])] : null;
  } catch {
    return null;
  }
})();
const nodeLoadsTypeScript = !!nodeVersion && (nodeVersion[0] > 22 || (nodeVersion[0] === 22 && nodeVersion[1] >= 6));
const NODE_SCRIPT = `
const { systemLookup } = await import(process.env.EGRESS_MODULE);
const servers = [process.env.NAME_SERVER];
const out = async (name, more = {}) => {
  try { return JSON.stringify(await systemLookup(name, { servers, tryMs: 300, tries: 1, timeoutMs: 5000, ...more })); }
  catch (error) { return "rejected: " + error.message; }
};
const results = {};
for (const name of JSON.parse(process.env.NAMES)) results[name] = await out(name);
results.cancelled = await out("node-cancelled.silent.test", { tryMs: 1000, tries: 4, timeoutMs: 150 });
await new Promise((done) => setTimeout(done, 1600));
process.stdout.write(JSON.stringify(results));
`;
function runUnderNode(names: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((done) => {
    const child = spawn("node", ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", NODE_SCRIPT], {
      env: { ...process.env, EGRESS_MODULE: join(import.meta.dir, "..", "src", "egress.ts"), NAME_SERVER: servers[0], NAMES: JSON.stringify(names) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const kill = setTimeout(() => child.kill("SIGKILL"), 25_000);
    child.on("error", (error) => { clearTimeout(kill); done({ code: -1, stdout, stderr: String(error) }); });
    child.on("close", (code) => { clearTimeout(kill); done({ code, stdout, stderr }); });
  });
}

/** The system lookup pointed at the name server above, with short waits so a silent name costs a moment. */
const lookup = (host: string, more: { tryMs?: number; tries?: number; timeoutMs?: number } = {}): Promise<string[]> =>
  systemLookup(host, { servers, tryMs: 300, tries: 1, timeoutMs: 5_000, ...more });
const outcome = async (p: Promise<string[]>): Promise<string> => {
  try { return JSON.stringify(await p); } catch (error) { return `rejected: ${(error as Error).message}`; }
};

describe("systemLookup: every address of a name, through c-ares", () => {
  test("both families are asked, once each, and the IPv4 answers come first", async () => {
    expect(await lookup("both.test")).toEqual(["93.184.216.34", "93.184.216.35", "2606:4700:4700::1111"]);
    expect(questions("both.test")).toBe("A AAAA");
  });

  test("one family with no record does not matter when the other answers", async () => {
    expect(await lookup("a-only.test")).toEqual(["93.184.216.34"]);
    expect(await lookup("aaaa-only.test")).toEqual(["2606:4700:4700::1111"]);
    expect([questions("a-only.test"), questions("aaaa-only.test")]).toEqual(["A AAAA", "A AAAA"]);
  });

  test("a CNAME chain gives the addresses at its end", async () => {
    expect(await lookup("cname.test")).toEqual(["93.184.216.34", "93.184.216.35", "2606:4700:4700::1111"]);
  });

  test("a name that does not exist, or exists with no address, is an empty answer and not an error", async () => {
    expect(await outcome(lookup("no-such-name.test"))).toBe("[]");
    expect(await outcome(lookup("no-address.test"))).toBe("[]");
    expect(questions("no-such-name.test")).toBe("A AAAA");
  });

  test("capitals and a trailing dot change nothing", async () => {
    const want = ["93.184.216.34", "93.184.216.35", "2606:4700:4700::1111"];
    expect(await lookup("BOTH.Test")).toEqual(want);
    expect(await lookup("both.test.")).toEqual(want);
  });

  test("the answer is returned as it came: judging it is resolveForEgress's work, and it refuses a private one", async () => {
    expect(await lookup("private.test")).toEqual(["10.0.0.5", "::1"]);
    expect(await resolveForEgress("private.test", { resolve: (host) => lookup(host) })).toEqual({ ok: false, reason: REFUSAL, kind: "address" });
    expect(await resolveForEgress("both.test", { resolve: (host) => lookup(host) })).toEqual({ ok: true, addresses: ["93.184.216.34", "93.184.216.35", "2606:4700:4700::1111"] });
    expect(await resolveForEgress("no-such-name.test", { resolve: (host) => lookup(host) })).toEqual({ ok: false, reason: REFUSAL, kind: "unresolved" });
  });

  // c-ares would ask the name server for "localhost"; getaddrinfo answered it
  // from the hosts file. It is answered here, with no query (RFC 6761).
  test("localhost and every name under it are loopback without a query; a name that only contains the word is asked", async () => {
    const before = asked.length;
    for (const name of ["localhost", "LOCALHOST", "localhost.", "app.localhost", "a.b.LocalHost."]) {
      expect(`${name}: ${await outcome(lookup(name))}`).toBe(`${name}: ["127.0.0.1","::1"]`);
    }
    expect(asked.length).toBe(before);
    expect(await lookup("localhost.test")).toEqual(["93.184.216.37"]);
    expect(await outcome(lookup("notlocalhost"))).toBe("[]");
    expect([questions("localhost.test"), questions("notlocalhost")]).toEqual(["A AAAA", "A AAAA"]);
  });

  // Node converts such a name before asking and Bun 1.4.4 does not ask at all
  // (measured 2026-11-12), so the conversion is the module's own.
  test("a name with non-ASCII letters is asked in its xn-- form, and one that spells an address is not asked", async () => {
    expect(await lookup("b\u00fccher.test")).toEqual(["93.184.216.36"]);
    expect(questions("xn--bcher-kva.test")).toBe("A AAAA");
    const before = asked.length;
    // Full-width digits: the conversion reads them as 127.0.0.1, which is an address and not a name to look up.
    expect(await outcome(lookup("\uff11\uff12\uff17.\uff10.\uff10.\uff11"))).toBe("[]");
    expect(await outcome(lookup("8.8.8.8"))).toBe("[]");
    expect(await outcome(lookup(""))).toBe("[]");
    expect(asked.length).toBe(before);
  });

  // getaddrinfo read these as 127.0.0.1. c-ares asks them as names, which do
  // not exist. Either way the caller gets nothing it could connect to.
  test("numeric spellings that are not an address in the address parser's eyes are asked as names and have no answer", async () => {
    for (const name of ["2130706433", "0x7f.1", "127.1", "0177.0.0.1"]) {
      expect(`${name}: ${await outcome(lookup(name))}`).toBe(`${name}: []`);
      expect(`${name}: ${questions(name)}`).toBe(`${name}: A AAAA`);
    }
  });

  test("a name the resolver will not ask ends as no answer or a rejection, never as an exception outside the promise", async () => {
    for (const name of [`${"a".repeat(64)}.test`, `${"a.".repeat(140)}test`, "a..test", "bad name.test", "nul\u0000.test"]) {
      let thrown = "";
      let p: Promise<string[]> | undefined;
      try { p = lookup(name); } catch (error) { thrown = String(error); }
      expect(thrown).toBe("");
      expect(await outcome(p as Promise<string[]>)).toMatch(/^(\[\]|rejected: the lookup failed: )/);
    }
    // A space or a control character: not asked at all. Node hands the name to
    // c-ares as a C string, which asked "cut\0.test" as "cut" (measured 2026-11-12).
    const before = asked.length;
    for (const name of ["cut\u0000.test", "cut\u0000both.test", "both.test\u0000.silent.test", "bad name.test", "tab\t.test", "line\nbreak.test", " both.test", "del\u007f.test"]) {
      expect(`${JSON.stringify(name)}: ${await outcome(lookup(name))}`).toBe(`${JSON.stringify(name)}: []`);
    }
    expect(asked.slice(before)).toEqual([]);
  });

  test("one family answering is enough when the other never answers", async () => {
    const started = performance.now();
    expect(await lookup("one.half.test")).toEqual(["93.184.216.38"]);
    // It waited for c-ares to give the silent family up, not for the hard limit of 5 s.
    expect(performance.now() - started).toBeLessThan(3_000);
  });

  test("a name server that never answers: c-ares gives up by its own limit, well before the hard one, and the lookup rejects", async () => {
    const started = performance.now();
    const result = await outcome(lookup("own-limit.silent.test", { tryMs: 200, tries: 1, timeoutMs: 8_000 }));
    const took = performance.now() - started;
    expect(result).toBe("rejected: the lookup failed: ETIMEOUT, ETIMEOUT");
    expect(took).toBeGreaterThanOrEqual(150);
    expect(took).toBeLessThan(3_000);
    expect(questions("own-limit.silent.test")).toBe("A AAAA");
  }, 15_000);

  test("at the hard limit the lookup rejects and c-ares is cancelled: the tries it still had are never sent", async () => {
    const started = performance.now();
    // Four tries a second apart, cut off after 150 ms.
    const result = await outcome(lookup("cancelled.silent.test", { tryMs: 1_000, tries: 4, timeoutMs: 150 }));
    const took = performance.now() - started;
    expect(result).toBe("rejected: the lookup was cancelled at its time limit");
    expect(took).toBeGreaterThanOrEqual(120);
    expect(took).toBeLessThan(900);
    expect(questions("cancelled.silent.test")).toBe("A AAAA");
    // Control: left alone, the same settings do send a second try within this time.
    const control = lookup("control.silent.test", { tryMs: 1_000, tries: 4, timeoutMs: 6_000 });
    await sleep(2_600);
    expect(questions("cancelled.silent.test")).toBe("A AAAA");
    expect(questions("control.silent.test").split(" ").length).toBeGreaterThan(2);
    control.catch(() => {});
  }, 15_000);

  test.skipIf(!nodeLoadsTypeScript)("under Node, the runtime the hosted servers use, the lookup gives the same answers, asks no name with a NUL in it, and is cancelled at its limit", async () => {
    const names = ["both.test", "a-only.test", "aaaa-only.test", "cname.test", "no-such-name.test", "b\u00fccher.test", "app.localhost", "2130706433",
      "nodecut\u0000.test", "nodecut\u0000both.test", "node cut.test", "node-own.silent.test"];
    const before = asked.length;
    const run = await runUnderNode(names);
    expect(`exit ${run.code} ${run.stderr.slice(0, 300)}`).toBe("exit 0 ");
    const both = `["93.184.216.34","93.184.216.35","2606:4700:4700::1111"]`;
    expect(JSON.parse(run.stdout)).toEqual({
      "both.test": both,
      "a-only.test": `["93.184.216.34"]`,
      "aaaa-only.test": `["2606:4700:4700::1111"]`,
      "cname.test": both,
      "no-such-name.test": "[]",
      "b\u00fccher.test": `["93.184.216.36"]`,
      "app.localhost": `["127.0.0.1","::1"]`,
      "2130706433": "[]",
      "nodecut\u0000.test": "[]",
      "nodecut\u0000both.test": "[]",
      "node cut.test": "[]",
      "node-own.silent.test": "rejected: the lookup failed: ETIMEOUT, ETIMEOUT",
      cancelled: "rejected: the lookup was cancelled at its time limit",
    });
    const seen = asked.slice(before).map((q) => q.name.toLowerCase());
    // Node hands a name to c-ares as a C string: without the module's own check "nodecut\0.test" was asked as "nodecut".
    expect(seen.filter((name) => name.startsWith("nodecut") || name.startsWith("node cut") || name === "node")).toEqual([]);
    expect(seen).toContain("xn--bcher-kva.test");
    expect(seen).toContain("2130706433");
    expect(seen).not.toContain("app.localhost");
    // Cancelled after 150 ms with tries a second apart; the script then stayed for 1.6 s, and no second try came.
    expect(questions("node-cancelled.silent.test")).toBe("A AAAA");
  }, 40_000);

  // No caller passes a limit, so the defaults are what a hosted server runs
  // with (review of 2026-11-12, tests-2). The ten seconds are watched on the
  // timer and shortened there, not waited for.
  test("with no limits passed, the hard limit armed is LOOKUP_TIMEOUT_MS and c-ares gets LOOKUP_TRY_MS and LOOKUP_TRIES", async () => {
    expect([LOOKUP_TIMEOUT_MS, LOOKUP_TRY_MS, LOOKUP_TRIES]).toEqual([10_000, 2_000, 2]);
    const realSetTimeout = globalThis.setTimeout;
    const armed: number[] = [];
    globalThis.setTimeout = ((fn: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
      armed.push(ms ?? 0);
      return realSetTimeout(fn, ms === 10_000 ? 3_200 : ms, ...rest);
    }) as unknown as typeof setTimeout;
    const started = performance.now();
    let pending: Promise<string>;
    // The limit is armed before systemLookup first waits, so the real setTimeout is back before anything else can run.
    try {
      pending = outcome(systemLookup("defaults.silent.test", { servers }));
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
    expect(armed).toEqual([10_000]);
    expect(await pending).toBe("rejected: the lookup was cancelled at its time limit");
    // The first try waits 2,000 ms, so by 3,200 ms a second try has gone out for each family, and no third.
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(questions("defaults.silent.test")).toBe("A A AAAA AAAA");
  }, 15_000);
});

// ---- the sharing, the memory and the ceiling ---------------------------------

/** A resolver whose every call is held until the test lets it go. */
function held(): { resolve: EgressResolver; calls: Array<{ host: string; answer: (addresses: string[]) => void; fail: (error: Error) => void }> } {
  const calls: Array<{ host: string; answer: (addresses: string[]) => void; fail: (error: Error) => void }> = [];
  return { calls, resolve: (host) => new Promise<string[]>((answer, fail) => { calls.push({ host, answer, fail }); }) };
}
/** A resolver that answers at once from a function, and counts. */
function counting(answer: (host: string) => string[]): { resolve: EgressResolver; asked: string[] } {
  const hosts: string[] = [];
  return { asked: hosts, resolve: async (host) => { hosts.push(host); return answer(host); } };
}
const tick = (): Promise<void> => sleep(0);
/**
 * Answers every held call, and every call that starts because a place freed,
 * until no call is left unanswered. An owner's waiting names start a share
 * at a time, so one round of answers does not end them all.
 */
async function drain(h: ReturnType<typeof held>, addresses: string[]): Promise<void> {
  let answered = 0;
  while (answered < h.calls.length) {
    const upTo = h.calls.length;
    for (const call of h.calls.slice(answered, upTo)) call.answer(addresses);
    answered = upTo;
    await tick();
  }
}

describe("cachedResolver: one lookup in flight per name", () => {
  test("forty requests for one name, in any capitals, are one lookup, and each gets the answer", async () => {
    const h = held();
    const cached = cachedResolver(h.resolve);
    const requests = Array.from({ length: 40 }, (_, i) => cached(i % 2 ? "Shared.Test" : "shared.test"));
    await tick();
    expect(h.calls.length).toBe(1);
    expect(cached.stats()).toEqual({ cached: 0, inFlight: 1, waiting: 0 });
    h.calls[0].answer(["93.184.216.34"]);
    const answers = await Promise.all(requests);
    expect(answers.every((a) => JSON.stringify(a) === `["93.184.216.34"]`)).toBe(true);
    expect(cached.stats()).toEqual({ cached: 1, inFlight: 0, waiting: 0 });
    // Each caller got a list of its own: changing one changes neither another's nor what is remembered.
    answers[0].push("127.0.0.1");
    answers[1].length = 0;
    expect(answers[2]).toEqual(["93.184.216.34"]);
    expect(await cached("shared.test")).toEqual(["93.184.216.34"]);
    // The same holds for a list served from memory.
    const remembered = await cached("shared.test");
    remembered.push("127.0.0.1");
    remembered[0] = "10.0.0.5";
    expect(await cached("SHARED.test")).toEqual(["93.184.216.34"]);
    expect(h.calls.length).toBe(1);
  });

  test("different names are different lookups, and a name is asked again once its lookup is over and forgotten", async () => {
    const c = counting((host) => [host === "one.test" ? "93.184.216.34" : "93.184.216.35"]);
    const cached = cachedResolver(c.resolve, { answerTtlMs: 0 });
    expect(await Promise.all([cached("one.test"), cached("two.test"), cached("one.test")])).toEqual([["93.184.216.34"], ["93.184.216.35"], ["93.184.216.34"]]);
    expect(c.asked).toEqual(["one.test", "two.test"]);
    await cached("one.test");
    expect(c.asked).toEqual(["one.test", "two.test", "one.test"]);
  });
});

describe("cachedResolver: a short memory of the addresses", () => {
  test("an answer is kept for 30 seconds and no answer for 5, by the default limits", async () => {
    let t = 1_000_000;
    const c = counting((host) => (host === "answer.test" ? ["93.184.216.34"] : []));
    const cached = cachedResolver(c.resolve, { now: () => t });
    expect(await cached("answer.test")).toEqual(["93.184.216.34"]);
    expect(await cached("nothing.test")).toEqual([]);
    expect(c.asked).toEqual(["answer.test", "nothing.test"]);
    t += 4_999;
    await cached("answer.test");
    expect(await cached("nothing.test")).toEqual([]);
    expect(c.asked.length).toBe(2);
    t += 1;
    await cached("nothing.test");
    expect(c.asked).toEqual(["answer.test", "nothing.test", "nothing.test"]);
    t = 1_000_000 + 29_999;
    expect(await cached("answer.test")).toEqual(["93.184.216.34"]);
    expect(c.asked.filter((host) => host === "answer.test").length).toBe(1);
    t += 1;
    await cached("answer.test");
    expect(c.asked.filter((host) => host === "answer.test").length).toBe(2);
  });

  test("a failed lookup counts as no answer: an empty list now, and for the next 5 seconds without asking", async () => {
    let t = 5_000_000;
    let calls = 0;
    const failing: EgressResolver = async () => { calls++; throw new Error("ETIMEOUT"); };
    const throwing = ((): Promise<string[]> => { calls++; throw new Error("thrown before any promise"); }) as EgressResolver;
    const notAList = (async () => { calls++; return "93.184.216.34" as unknown as string[]; }) as EgressResolver;
    for (const resolve of [failing, throwing, notAList]) {
      calls = 0;
      const cached = cachedResolver(resolve, { now: () => t });
      expect(await cached("dead.test")).toEqual([]);
      t += 4_999;
      expect(await cached("dead.test")).toEqual([]);
      expect(calls).toBe(1);
      t += 1;
      expect(await cached("dead.test")).toEqual([]);
      expect(calls).toBe(2);
      expect(cached.stats()).toEqual({ cached: 1, inFlight: 0, waiting: 0 });
    }
  });

  test("a clock set back does not keep an old answer in use", async () => {
    let t = 9_000_000;
    const c = counting(() => ["93.184.216.34"]);
    const cached = cachedResolver(c.resolve, { now: () => t });
    await cached("clock.test");
    t -= 60_000;
    await cached("clock.test");
    expect(c.asked.length).toBe(2);
  });

  // A zone that answers every name with a full 64 KB message (about 6,400
  // addresses) filled all 2,000 places and held about 0.5 GB of heap after
  // the answers expired (review of 2026-11-12, lookup-2).
  test("an answer of more than LOOKUP_REMEMBERED_ADDRESSES addresses is judged and used, and not remembered", async () => {
    expect(LOOKUP_REMEMBERED_ADDRESSES).toBe(64);
    const many = (n: number): string[] => Array.from({ length: n }, (_, i) => `93.184.${216 + (i >> 8)}.${i & 255}`);
    const c = counting((host) => many(host === "big.test" ? 65 : 64));
    const cached = cachedResolver(c.resolve, { now: () => 1 });
    const big = await resolveForEgress("big.test", { resolve: cached });
    expect(big.ok && big.addresses.length).toBe(65);
    expect((await cached("big.test")).length).toBe(65);
    expect(c.asked).toEqual(["big.test", "big.test"]);
    expect(cached.stats().cached).toBe(0);
    // One address fewer is remembered as before.
    expect((await cached("edge.test")).length).toBe(64);
    expect((await cached("edge.test")).length).toBe(64);
    expect(c.asked).toEqual(["big.test", "big.test", "edge.test"]);
    // A big answer that is refused is still refused: not remembering it changes nothing about the verdict.
    const mixed = cachedResolver(async () => [...many(70), "10.0.0.5"]);
    expect(await resolveForEgress("mixed.test", { resolve: mixed })).toEqual({ ok: false, reason: REFUSAL, kind: "address" });
  });

  test("expired answers are dropped when a new one is remembered, not only when their own name is asked again", async () => {
    let t = 2_000_000;
    const c = counting((host) => (host.startsWith("gone") ? ["93.184.216.34"] : []));
    const cached = cachedResolver(c.resolve, { now: () => t });
    for (let i = 0; i < 50; i++) await cached(`gone${i}.test`);
    expect(cached.stats().cached).toBe(50);
    t += LOOKUP_ANSWER_TTL_MS;
    await cached("fresh.test");
    expect(cached.stats().cached).toBe(1);
    // Control: before they expire, a new name drops nothing.
    t += 1;
    await cached("gone-again.test");
    expect(cached.stats().cached).toBe(2);
  });

  test("2,000 names are remembered by default, and the oldest makes room for a new one", async () => {
    const c = counting(() => ["93.184.216.34"]);
    const cached = cachedResolver(c.resolve, { now: () => 1 });
    for (let i = 0; i < 2_000; i++) await cached(`n${i}.test`);
    expect(cached.stats().cached).toBe(2_000);
    await cached("n0.test");
    expect(c.asked.length).toBe(2_000);
    await cached("one-more.test");
    expect(cached.stats().cached).toBe(2_000);
    expect(c.asked.length).toBe(2_001);
    // n0 was the oldest and is gone; n1 and the newest are still there.
    await cached("n1.test");
    await cached("one-more.test");
    expect(c.asked.length).toBe(2_001);
    await cached("n0.test");
    expect(c.asked.length).toBe(2_002);
    cached.clear();
    expect(cached.stats().cached).toBe(0);
  });

  // The memory is safe because a caller connects only to an address from the
  // answer it was handed, and because what is remembered is never "allowed".
  test("the addresses are remembered and the verdict is not: the decision runs on every call", async () => {
    const c = counting(() => ["93.184.216.34"]);
    const cached = cachedResolver(c.resolve);
    let own = false;
    const allow = (ip: string): boolean => !(own && ip === "93.184.216.34");
    expect(await resolveForEgress("changes.test", { resolve: cached, allow })).toEqual({ ok: true, addresses: ["93.184.216.34"] });
    own = true;
    expect(await resolveForEgress("changes.test", { resolve: cached, allow })).toEqual({ ok: false, reason: REFUSAL, kind: "address" });
    own = false;
    expect((await resolveForEgress("changes.test", { resolve: cached, allow })).ok).toBe(true);
    expect(c.asked).toEqual(["changes.test"]);
    // A remembered private answer is refused every time it is served.
    const inside = cachedResolver(async () => ["10.0.0.5"]);
    for (let i = 0; i < 3; i++) expect(await resolveForEgress("inside.test", { resolve: inside })).toEqual({ ok: false, reason: REFUSAL, kind: "address" });
  });
});

describe("cachedResolver: a ceiling on lookups in flight", () => {
  test(`LOOKUP_IN_FLIGHT (${LOOKUP_IN_FLIGHT}) lookups run at once by default; the next one waits for a place, for LOOKUP_WAIT_MS at most, and gets the first place that frees`, async () => {
    const N = LOOKUP_IN_FLIGHT;
    expect(LOOKUP_WAITING).toBeGreaterThanOrEqual(1);
    const realSetTimeout = globalThis.setTimeout;
    const armed: number[] = [];
    const h = held();
    const cached = cachedResolver(h.resolve);
    const requests: Array<Promise<string[]>> = [];
    globalThis.setTimeout = ((fn: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
      armed.push(ms ?? 0);
      return realSetTimeout(fn, ms, ...rest);
    }) as unknown as typeof setTimeout;
    try {
      for (let i = 0; i < N + 1; i++) requests.push(cached(`slow${i}.test`));
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
    await tick();
    expect(h.calls.length).toBe(N);
    expect(cached.stats()).toEqual({ cached: 0, inFlight: N, waiting: 1 });
    expect(armed).toEqual([LOOKUP_WAIT_MS]);
    h.calls[10].answer(["93.184.216.34"]);
    await tick();
    expect(h.calls.length).toBe(N + 1);
    expect(h.calls[N].host).toBe(`slow${N}.test`);
    expect(cached.stats()).toEqual({ cached: 1, inFlight: N, waiting: 0 });
    for (const call of h.calls) call.answer(["93.184.216.34"]);
    expect((await Promise.all(requests)).length).toBe(N + 1);
    expect(cached.stats()).toEqual({ cached: N + 1, inFlight: 0, waiting: 0 });
  });

  test("a name that gets no place in time is rejected, was never asked, and is not remembered; resolveForEgress refuses it as unresolved", async () => {
    const h = held();
    const cached = cachedResolver(h.resolve, { maxInFlight: 2, maxWaitMs: 60 });
    const first = [cached("a.test"), cached("b.test")];
    await tick();
    const started = performance.now();
    const waited = await outcome(cached("c.test"));
    const took = performance.now() - started;
    expect(waited).toBe("rejected: no place for the lookup in time");
    expect(took).toBeGreaterThanOrEqual(45);
    expect(took).toBeLessThan(1_000);
    expect(h.calls.map((c) => c.host)).toEqual(["a.test", "b.test"]);
    expect(cached.stats()).toEqual({ cached: 0, inFlight: 2, waiting: 0 });
    // Through resolveForEgress the same thing is a refusal, in the one text, and it does not throw.
    expect(await resolveForEgress("d.test", { resolve: cached })).toEqual({ ok: false, reason: REFUSAL, kind: "unresolved" });
    // The place it gave up on is not taken later: with both lookups over, nothing is in flight.
    h.calls[0].answer(["93.184.216.34"]);
    h.calls[1].answer([]);
    await Promise.all(first);
    expect(cached.stats()).toEqual({ cached: 2, inFlight: 0, waiting: 0 });
    expect(h.calls.length).toBe(2);
    // And the name is asked for real the next time, since no "no answer" was remembered for it.
    const again = cached("c.test");
    await tick();
    expect(h.calls.map((c) => c.host)).toEqual(["a.test", "b.test", "c.test"]);
    h.calls[2].answer(["93.184.216.35"]);
    expect(await again).toEqual(["93.184.216.35"]);
  });

  test("the queue has an end too: a name that finds it full is rejected at once", async () => {
    const h = held();
    const cached = cachedResolver(h.resolve, { maxInFlight: 1, maxWaiting: 2, maxWaitMs: 5_000 });
    const running = cached("r.test");
    const w1 = cached("w1.test");
    const w2 = cached("w2.test");
    await tick();
    expect(cached.stats()).toEqual({ cached: 0, inFlight: 1, waiting: 2 });
    const started = performance.now();
    expect(await outcome(cached("w3.test"))).toBe("rejected: too many lookups are waiting");
    expect(performance.now() - started).toBeLessThan(200);
    // A second request for a name already waiting shares its place and is not turned away.
    const shared = cached("W1.test");
    // Places are handed on in the order of arrival.
    h.calls[0].answer(["93.184.216.34"]);
    await running;
    await tick();
    expect(h.calls.map((c) => c.host)).toEqual(["r.test", "w1.test"]);
    h.calls[1].answer(["93.184.216.35"]);
    expect(await w1).toEqual(["93.184.216.35"]);
    expect(await shared).toEqual(["93.184.216.35"]);
    await tick();
    expect(h.calls.map((c) => c.host)).toEqual(["r.test", "w1.test", "w2.test"]);
    h.calls[2].fail(new Error("ETIMEOUT"));
    expect(await w2).toEqual([]);
    expect(cached.stats()).toEqual({ cached: 3, inFlight: 0, waiting: 0 });
  });

  test("a remembered name needs no place: it is answered while every place is taken", async () => {
    const h = held();
    const cached = cachedResolver(h.resolve, { maxInFlight: 1, maxWaiting: 0 });
    const first = cached("known.test");
    await tick();
    h.calls[0].answer(["93.184.216.34"]);
    await first;
    const busy = cached("busy.test");
    await tick();
    expect(cached.stats()).toEqual({ cached: 1, inFlight: 1, waiting: 0 });
    expect(await cached("known.test")).toEqual(["93.184.216.34"]);
    expect(await outcome(cached("other.test"))).toBe("rejected: too many lookups are waiting");
    h.calls[1].answer([]);
    await busy;
  });
});

// The ceiling above is for the whole process. One browser that asked for
// enough slow names (each gate holds up to 32 of Chromium's proxy sockets)
// took every place, and a healthy name another account asked for the first
// time was refused at once or after 3 s (review of 2026-11-12, lookup-1).
describe("cachedResolver: each owner gets only a share of the places", () => {
  const ADDRESS = ["93.184.216.34"];

  test(`one owner with 400 slow names holds LOOKUP_OWNER_IN_FLIGHT (${LOOKUP_OWNER_IN_FLIGHT}) lookups and LOOKUP_OWNER_WAITING (${LOOKUP_OWNER_WAITING}) waiting, its (in-flight + waiting + 1)th new name is refused at once, and another owner's new name starts at once`, async () => {
    const RUN = LOOKUP_OWNER_IN_FLIGHT;
    const WAIT = LOOKUP_OWNER_WAITING;
    const HOLD = RUN + WAIT;
    // The flood is bigger than one owner's share and stays inside the process's, so only the share can be what refuses it.
    expect(400).toBeGreaterThan(HOLD);
    expect(RUN).toBeLessThan(LOOKUP_IN_FLIGHT);
    expect(WAIT).toBeLessThan(LOOKUP_WAITING);
    const h = held();
    const cached = cachedResolver(h.resolve);
    const flooder = {};
    const other = {};
    const started = performance.now();
    const flood = Array.from({ length: 400 }, (_, i) => outcome(cached(`flood${i}.test`, flooder)));
    const refusedAtOnce = await Promise.all(flood.slice(HOLD));
    expect(performance.now() - started).toBeLessThan(200);
    expect(refusedAtOnce.length).toBe(400 - HOLD);
    expect(new Set(refusedAtOnce)).toEqual(new Set(["rejected: too many lookups are waiting for this caller"]));
    expect(h.calls.length).toBe(RUN);
    expect(cached.ownerStats(flooder)).toEqual({ inFlight: RUN, waiting: WAIT });
    expect(cached.stats()).toEqual({ cached: 0, inFlight: RUN, waiting: WAIT });
    // The other owner's never-seen name is asked at once, with nothing of the flood answered.
    const victim = cached("victim.test", other);
    await tick();
    expect(h.calls.map((c) => c.host).slice(RUN)).toEqual(["victim.test"]);
    expect(cached.ownerStats(other)).toEqual({ inFlight: 1, waiting: 0 });
    h.calls[RUN].answer(ADDRESS);
    expect(await victim).toEqual(ADDRESS);
    // Through resolveForEgress the owner of the policy is the one counted: the flooder's next name is unresolved, the other's is allowed.
    expect(await resolveForEgress("flood-more.test", { resolve: cached, owner: flooder })).toEqual({ ok: false, reason: REFUSAL, kind: "unresolved" });
    const second = resolveForEgress("victim2.test", { resolve: cached, owner: other });
    await tick();
    expect(h.calls.at(-1)?.host).toBe("victim2.test");
    h.calls.at(-1)?.answer(ADDRESS);
    expect(await second).toEqual({ ok: true, addresses: ADDRESS });
    // As its lookups end, the flooder's waiting names get their places, in the order they were asked, one share at a time.
    for (let i = 0; i < RUN; i++) h.calls[i].answer(ADDRESS);
    await tick();
    expect(h.calls.length).toBe(RUN + 2 + Math.min(RUN, WAIT));
    expect(h.calls.slice(RUN + 2).map((c) => c.host)).toEqual(Array.from({ length: Math.min(RUN, WAIT) }, (_, i) => `flood${RUN + i}.test`));
    expect(cached.ownerStats(flooder)).toEqual({ inFlight: Math.min(RUN, WAIT), waiting: WAIT - Math.min(RUN, WAIT) });
    // And nothing is left counted once they all end.
    await drain(h, ADDRESS);
    expect(h.calls.length).toBe(HOLD + 2);
    expect((await Promise.all(flood.slice(0, HOLD))).every((r) => r === JSON.stringify(ADDRESS))).toBe(true);
    expect(cached.ownerStats(flooder)).toEqual({ inFlight: 0, waiting: 0 });
    expect(cached.stats()).toEqual({ cached: HOLD + 2, inFlight: 0, waiting: 0 });
  });

  test("joining a lookup another owner already has in flight costs the second owner nothing", async () => {
    const h = held();
    const cached = cachedResolver(h.resolve);
    const first = {};
    const second = {};
    const a = cached("shared.test", first);
    await tick();
    const b = cached("SHARED.test", second);
    await tick();
    expect(h.calls.length).toBe(1);
    expect(cached.ownerStats(first)).toEqual({ inFlight: 1, waiting: 0 });
    expect(cached.ownerStats(second)).toEqual({ inFlight: 0, waiting: 0 });
    // The second owner can still start 8 lookups of its own.
    const own = Array.from({ length: 8 }, (_, i) => cached(`own${i}.test`, second));
    await tick();
    expect(cached.ownerStats(second)).toEqual({ inFlight: 8, waiting: 0 });
    for (const call of h.calls) call.answer(ADDRESS);
    expect(await a).toEqual(ADDRESS);
    expect(await b).toEqual(ADDRESS);
    await Promise.all(own);
  });

  // Without this an owner at its own limit could hold a popular name in the
  // queue, and every other owner asking that name would wait with it.
  test("a name waiting behind its first owner's own limit starts at once when an owner with room asks for it", async () => {
    const h = held();
    const cached = cachedResolver(h.resolve);
    const busy = {};
    const fresh = {};
    const mine = Array.from({ length: 8 }, (_, i) => cached(`busy${i}.test`, busy));
    const popular = cached("popular.test", busy);
    await tick();
    expect(cached.ownerStats(busy)).toEqual({ inFlight: 8, waiting: 1 });
    expect(h.calls.length).toBe(8);
    const joined = cached("popular.test", fresh);
    await tick();
    expect(h.calls.map((c) => c.host).slice(8)).toEqual(["popular.test"]);
    expect(cached.ownerStats(busy)).toEqual({ inFlight: 8, waiting: 0 });
    expect(cached.ownerStats(fresh)).toEqual({ inFlight: 1, waiting: 0 });
    h.calls[8].answer(ADDRESS);
    expect(await popular).toEqual(ADDRESS);
    expect(await joined).toEqual(ADDRESS);
    for (const call of h.calls.slice(0, 8)) call.answer(ADDRESS);
    await Promise.all(mine);
    expect(cached.stats()).toEqual({ cached: 9, inFlight: 0, waiting: 0 });
  });

  test("an owner refused for a name does not pass the refusal to another owner asking the same name in the same moment", async () => {
    const h = held();
    const cached = cachedResolver(h.resolve);
    const full = {};
    const other = {};
    // The owner fills its whole share, running and waiting, so its next new name is refused.
    const mine = Array.from({ length: LOOKUP_OWNER_IN_FLIGHT + LOOKUP_OWNER_WAITING }, (_, i) => cached(`full${i}.test`, full));
    expect(cached.ownerStats(full)).toEqual({ inFlight: LOOKUP_OWNER_IN_FLIGHT, waiting: LOOKUP_OWNER_WAITING });
    const refusedOne = outcome(cached("same.test", full));
    const otherOne = cached("same.test", other);
    expect(await refusedOne).toBe("rejected: too many lookups are waiting for this caller");
    await tick();
    expect(h.calls.map((c) => c.host).slice(LOOKUP_OWNER_IN_FLIGHT)).toEqual(["same.test"]);
    h.calls[LOOKUP_OWNER_IN_FLIGHT].answer(ADDRESS);
    expect(await otherOne).toEqual(ADDRESS);
    await drain(h, ADDRESS);
    await Promise.all(mine);
  });

  // LOOKUP_IN_FLIGHT / LOOKUP_OWNER_IN_FLIGHT owners at their own limit fill
  // the process's places. A place that frees goes to the waiting owner that
  // holds the fewest, so one more owner is not kept behind the queue the
  // others built up.
  test("with every place taken, a freed place goes to the waiting owner holding the fewest lookups", async () => {
    const SHARE = LOOKUP_OWNER_IN_FLIGHT;
    const PLACES = LOOKUP_IN_FLIGHT;
    // The owners below fill the places exactly; a remainder would leave a place free and the test would prove nothing.
    expect(PLACES % SHARE).toBe(0);
    const OWNERS = PLACES / SHARE;
    // Each owner's one extra name, and the late owner's, fit in the queue.
    expect(OWNERS + 1).toBeLessThanOrEqual(LOOKUP_WAITING);
    expect(LOOKUP_OWNER_WAITING).toBeGreaterThanOrEqual(1);
    const h = held();
    const cached = cachedResolver(h.resolve);
    const owners = Array.from({ length: OWNERS }, () => ({}));
    const late = {};
    const all: Array<Promise<string>> = [];
    owners.forEach((owner, o) => {
      for (let i = 0; i < SHARE; i++) all.push(outcome(cached(`o${o}-${i}.test`, owner)));
    });
    owners.forEach((owner, o) => all.push(outcome(cached(`o${o}-more.test`, owner))));
    await tick();
    expect(cached.stats()).toEqual({ cached: 0, inFlight: PLACES, waiting: OWNERS });
    const victim = outcome(cached("late.test", late));
    await tick();
    expect(cached.stats()).toEqual({ cached: 0, inFlight: PLACES, waiting: OWNERS + 1 });
    // One of owner 3's lookups ends: the late owner, holding none, gets the place, and not owner 0 that waited first.
    h.calls[3 * SHARE].answer(ADDRESS);
    await tick();
    expect(h.calls.map((c) => c.host).slice(PLACES)).toEqual(["late.test"]);
    // Another of owner 3's ends: of the waiting owners only owner 3 is under its own limit now.
    h.calls[3 * SHARE + 1].answer(ADDRESS);
    await tick();
    expect(h.calls.map((c) => c.host).slice(PLACES)).toEqual(["late.test", "o3-more.test"]);
    await drain(h, ADDRESS);
    expect(await victim).toBe(JSON.stringify(ADDRESS));
    expect((await Promise.all(all)).every((r) => r === JSON.stringify(ADDRESS))).toBe(true);
    expect(cached.stats()).toEqual({ cached: PLACES + OWNERS + 1, inFlight: 0, waiting: 0 });
  });

  test("a lookup with no owner is held to the process-wide limits only, as before", async () => {
    // Every place at once, far past any one owner's share of running and waiting together.
    const N = LOOKUP_IN_FLIGHT;
    expect(N).toBeGreaterThan(LOOKUP_OWNER_IN_FLIGHT + LOOKUP_OWNER_WAITING);
    const h = held();
    const cached = cachedResolver(h.resolve);
    const requests = Array.from({ length: N }, (_, i) => cached(`free${i}.test`));
    await tick();
    expect(cached.stats()).toEqual({ cached: 0, inFlight: N, waiting: 0 });
    for (const call of h.calls) call.answer(ADDRESS);
    await Promise.all(requests);
    expect(cached.stats()).toEqual({ cached: N, inFlight: 0, waiting: 0 });
  });

  // With 8 waiting per owner, one browser asking more than 16 distinct healthy
  // names at once had the rest refused (measured 2026-11-12: 20 names, 4
  // refused; 32 names, 16 refused). Chromium keeps up to 32 proxy sockets, so
  // a page with that many hosts must get through.
  test("one browser asking 32 distinct names at once, each answered quickly, gets all 32 answered and none refused, through the default limits", async () => {
    const asked: string[] = [];
    const quick: EgressResolver = async (host) => {
      asked.push(host);
      await sleep(5);
      return ADDRESS;
    };
    const cached = cachedResolver(quick);
    const browser = {};
    const results = await Promise.all(Array.from({ length: 32 }, (_, i) => outcome(cached(`page${i}.test`, browser))));
    expect(results.filter((r) => r.startsWith("rejected"))).toEqual([]);
    expect(results).toEqual(Array.from({ length: 32 }, () => JSON.stringify(ADDRESS)));
    expect(new Set(asked).size).toBe(32);
    expect(cached.ownerStats(browser)).toEqual({ inFlight: 0, waiting: 0 });
    // The same through the gate's own call, with the browser as the owner: every name is allowed.
    const gated = await Promise.all(Array.from({ length: 32 }, (_, i) => resolveForEgress(`gate${i}.test`, { resolve: cached, owner: browser })));
    expect(gated).toEqual(Array.from({ length: 32 }, () => ({ ok: true, addresses: ADDRESS })));
    expect(asked.length).toBe(64);
    expect(cached.stats()).toEqual({ cached: 64, inFlight: 0, waiting: 0 });
  });
});

describe("the limits a hosted server runs with", () => {
  test("the default limits have the values the design names", () => {
    expect({ LOOKUP_TIMEOUT_MS, LOOKUP_TRY_MS, LOOKUP_TRIES, LOOKUP_ANSWER_TTL_MS, LOOKUP_NO_ANSWER_TTL_MS, LOOKUP_CACHE_NAMES, LOOKUP_IN_FLIGHT, LOOKUP_WAITING, LOOKUP_WAIT_MS,
      LOOKUP_OWNER_IN_FLIGHT, LOOKUP_OWNER_WAITING, LOOKUP_REMEMBERED_ADDRESSES }).toEqual({
      LOOKUP_TIMEOUT_MS: 10_000,
      LOOKUP_TRY_MS: 2_000,
      LOOKUP_TRIES: 2,
      LOOKUP_ANSWER_TTL_MS: 30_000,
      LOOKUP_NO_ANSWER_TTL_MS: 5_000,
      LOOKUP_CACHE_NAMES: 2_000,
      LOOKUP_IN_FLIGHT: 192,
      LOOKUP_WAITING: 512,
      LOOKUP_WAIT_MS: 3_000,
      LOOKUP_OWNER_IN_FLIGHT: 8,
      LOOKUP_OWNER_WAITING: 24,
      LOOKUP_REMEMBERED_ADDRESSES: 64,
    });
  });

  test("the lookup resolveForEgress uses by default runs with exactly those, and a resolver built with its own limits reports its own", () => {
    expect(egressLookup.limits).toEqual({ answerTtlMs: 30_000, noAnswerTtlMs: 5_000, maxNames: 2_000, maxInFlight: 192, maxWaiting: 512, maxWaitMs: 3_000,
      ownerInFlight: 8, ownerWaiting: 24, maxRememberedAddresses: 64 });
    expect(cachedResolver(async () => []).limits).toEqual(egressLookup.limits);
    expect(cachedResolver(async () => [], { maxInFlight: 2, answerTtlMs: 7 }).limits).toEqual({ ...egressLookup.limits, maxInFlight: 2, answerTtlMs: 7 });
  });
});
